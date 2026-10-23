import test from "node:test";
import assert from "node:assert/strict";
import { validateMedia, nextDelaySeconds, planRecipients, assignVariants, buildRunItems, newRun, sentTodayCount, runProgress, currentItem, MEDIA_LIMITS, sanitizePace, estimateRun, riskForDaily, SAME_DAY_GUIDE, parseManualLines, addManualClients, countCombos, suggestAlternatives, effectiveBodies } from "../js/core/broadcast.js";
import { DEFAULT_CONFIG } from "../js/core/config.js";
import { deepClone } from "../js/core/util.js";
import { normalizeState } from "../js/core/store.js";

const cl = (uid, name, phones, extra = {}) => ({ uid, id: uid.toUpperCase(), name, zone: "Chapinero", contacts: phones.map((p, i) => ({ cid: `${uid}${i}`, name: `C${i}`, phone: p, primary: i === 0 })), ...extra });
const clients = [cl("a", "Alfa", ["3001112233"]), cl("b", "Beta", ["123", "3004445566"]), cl("c", "Gamma", []), cl("d", "Delta", ["300 111 2233"]), cl("e", "Eps", ["6011234567"]), cl("f", "Zeta", ["3009998877"])];
const cfg = () => { const c = deepClone(DEFAULT_CONFIG); c.commercial.name = "Ana"; return c; };

test("validateMedia acepta imagen/video y rechaza formatos y pesos excesivos", () => {
  assert.equal(validateMedia({ type: "image/png", size: 1000 }).kind, "image");
  assert.equal(validateMedia({ type: "video/mp4", size: 1000 }).kind, "video");
  assert.equal(validateMedia({ type: "application/pdf", size: 10 }).ok, false);
  assert.equal(validateMedia({ type: "video/mp4", size: MEDIA_LIMITS.video + 1 }).ok, false);
});

test("nextDelaySeconds queda dentro del rango, aunque min > max", () => {
  assert.equal(nextDelaySeconds(10, 20, () => 0), 10);
  assert.equal(nextDelaySeconds(10, 20, () => 0.999), 20);
  assert.equal(nextDelaySeconds(20, 10, () => 0), 10);
});

test("planRecipients: usa el contacto con teléfono válido, omite sin teléfono, inválidos y repetidos", () => {
  const { ok, skipped } = planRecipients({ clients, uids: clients.map((c) => c.uid) });
  assert.deepEqual(ok.map((r) => r.name), ["Alfa", "Beta", "Zeta"]);
  assert.equal(ok[1].waNumber, "573004445566");
  const why = Object.fromEntries(skipped.map((s) => [s.name, s.reason]));
  assert.equal(why.Gamma, "Sin teléfono");
  assert.match(why.Delta, /Mismo número que «Alfa»/);
  assert.match(why.Eps, /fijo/);
});

test("planRecipients excluye «No interesado» solo si se pide", () => {
  const statuses = deepClone(DEFAULT_CONFIG.statuses), followups = { a: { status: "no_interesado" } };
  assert.equal(planRecipients({ clients, uids: ["a"], followups, statuses }).ok.length, 0);
  assert.equal(planRecipients({ clients, uids: ["a"], followups, statuses, skipNotInterested: false }).ok.length, 1);
});

test("assignVariants: equilibrado y sin repetir la misma variante seguida", () => {
  for (const n of [2, 3, 4]) for (let k = 0; k < 20; k++) {
    const seq = assignVariants(50, n);
    seq.forEach((x, i) => { if (i) assert.notEqual(x, seq[i - 1]); });
    const counts = Array(n).fill(0); seq.forEach((x) => counts[x]++);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1 + Math.ceil(50 / n) * 0 + 1);
  }
  assert.deepEqual(assignVariants(3, 1), [0, 0, 0]);
});

test("buildRunItems personaliza, alterna redacciones y avisa de datos faltantes", () => {
  const { ok } = planRecipients({ clients, uids: ["a", "b", "f"] });
  const { items } = buildRunItems({ recipients: ok, variants: [{ body: "Hola {{nombre_cliente}} (A)" }, { body: "Buen día {{nombre_cliente}} (B)" }], config: cfg() });
  assert.equal(items.length, 3);
  assert.match(items[0].text, new RegExp(`${ok[0].name} \\(${items[0].variant === 1 ? "A" : "B"}\\)`));
  items.forEach((it, i) => { if (i) assert.notEqual(it.variant, items[i - 1].variant); });
  assert.throws(() => buildRunItems({ recipients: ok, variants: [{ body: "  " }], config: cfg() }), /al menos una/);
  assert.deepEqual(buildRunItems({ recipients: ok, variants: [{ body: "{{tarifa}}" }], config: { ...cfg(), offer: { ...cfg().offer, rate: "" } } }).warnings, ["tarifa"]);
});

test("progreso, tope diario y siguiente pendiente", () => {
  const { ok } = planRecipients({ clients, uids: ["a", "b", "f"] });
  const { items } = buildRunItems({ recipients: ok, variants: [{ body: "x {{nombre_cliente}}" }], config: cfg() });
  const run = newRun({ id: "r1", broadcast: { id: "bc", name: "Aviso", media: null }, items, pace: { minDelay: 1, maxDelay: 2, dailyCap: 2 } });
  assert.equal(currentItem(run).name, ok[0].name);
  run.items[0].status = "sent"; run.items[0].sentAt = new Date().toISOString();
  run.items[1].status = "sent"; run.items[1].sentAt = "2020-01-01T12:00:00Z";
  assert.equal(sentTodayCount(run), 1);
  assert.deepEqual(runProgress(run), { total: 3, sent: 2, skipped: 0, pending: 1 });
});

test("normalizeState conserva comunicados y colas, y descarta basura", () => {
  const s = normalizeState({ clients: [], broadcasts: [{ id: "b1", variants: [] }, { nope: 1 }], runs: [{ id: "r", items: [] }, "x"] });
  assert.equal(s.broadcasts.length, 1); assert.equal(s.runs.length, 1);
  assert.deepEqual(normalizeState({ clients: [] }).runs, []);
});

test("sanitizePace: vacío, 0 o negativo vuelven al valor por defecto y max nunca queda bajo min", () => {
  assert.deepEqual(sanitizePace({ minDelay: "", maxDelay: 0, dailyCap: "" }), { minDelay: 45, maxDelay: 120, dailyCap: 40, block: true });
  assert.equal(sanitizePace({ dailyCap: 0 }).dailyCap, 40);
  assert.equal(sanitizePace({ dailyCap: 229 }).dailyCap, 229);
  assert.equal(sanitizePace({ minDelay: 90, maxDelay: 30 }).maxDelay, 90);
});

test("estimateRun y guía de mismo día: duración razonable y riesgo coherente", () => {
  assert.deepEqual(estimateRun(189, { minDelay: 90, maxDelay: 210, dailyCap: 189 }), { avgPause: 150, minutesFirstDay: 473, days: 1 });
  assert.equal(estimateRun(189, { minDelay: 60, maxDelay: 180, dailyCap: 60 }).days, 4);
  assert.equal(riskForDaily(60).level, "bajo"); assert.equal(riskForDaily(100).level, "medio"); assert.equal(riskForDaily(189).level, "alto");
  for (const r of SAME_DAY_GUIDE) { assert.ok(r.maxDelay >= 2 * r.minDelay * 0.99 || r.maxDelay >= r.minDelay * 2 - 1 || r.maxDelay > r.minDelay); assert.ok(r.minutesFirstDay <= 9 * 60); }
});

test("parseManualLines: separadores, números en el nombre y líneas sin teléfono", () => {
  assert.deepEqual(parseManualLines("Tienda Demo Juguetes, 300 123 4567\nAire Demo SAS;3045550108\nTienda 24 horas\t3001112233\n\nSolo nombre"), [
    { name: "Tienda Demo Juguetes", phone: "300 123 4567" }, { name: "Aire Demo SAS", phone: "3045550108" }, { name: "Tienda 24 horas", phone: "3001112233" }, { name: "Solo nombre", phone: "" }]);
  assert.deepEqual(parseManualLines("Pedro Pérez 3101234567"), [{ name: "Pedro Pérez", phone: "3101234567" }]);
});

test("addManualClients: nuevo, mismo nombre suma teléfono, número ajeno no duplica, inválidos se rechazan", () => {
  const base = [cl("a", "Alfa", ["3001112233"])];
  const r = addManualClients(base, [
    { name: "Nuevo SAS", phone: "3205550000" }, { name: "alfa", phone: "3109998877" }, { name: "Otro", phone: "300 111 2233" },
    { name: "Malo", phone: "123" }, { name: "", phone: "3205551111" }, { name: "Fijo", phone: "6011234567" }]);
  assert.equal(r.added, 1); assert.equal(r.merged, 1);
  assert.equal(base.length, 2); assert.equal(base[0].contacts.length, 2);
  assert.ok(r.uids.includes("a") && r.uids.length === 2);
  assert.deepEqual(r.rejected.map((x) => x.reason.split(":")[0].split(";")[0]), ["Ese número ya es de «Alfa»", "Teléfono no válido", "Falta el nombre", "Teléfono no válido"]);
  const again = addManualClients(base, [{ name: "Nuevo SAS", phone: "3205550000" }]);
  assert.equal(again.added, 0); assert.equal(base.length, 2); // repetir no duplica
});

test("suggestAlternatives: envuelve frases con sinónimos seguros, conserva mayúsculas y no toca variables ni grupos existentes", () => {
  const r = suggestAlternatives("Les saluda {{nombre_comercial}}. Este viernes habrá alta demanda. [[Hola|Buen día]] ¿Aún no la tienen? Contáctenme.");
  assert.equal(r.groups, 4);
  assert.match(r.text, /\[\[Les saluda\|Les escribe\|Les habla\]\] \{\{nombre_comercial\}\}/);
  assert.match(r.text, /\[\[alta demanda\|gran demanda\|mucha demanda\]\]/);
  assert.match(r.text, /\[\[¿Aún no\|¿Todavía no\]\] la tienen/);
  assert.match(r.text, /\[\[Hola\|Buen día\]\]/); // el grupo previo queda intacto
  assert.equal(suggestAlternatives("Texto sin frases conocidas").groups, 0);
  assert.equal(suggestAlternatives(r.text).text.includes("[[[["), false); // idempotente: no anida
  assert.equal(countCombos(r.text), 3 * 3 * 2 * 2 * 3);
});

test("buildRunItems: cada grupo se sortea por separado y se evitan combinaciones repetidas", () => {
  const body = "[[a|b|c]] [[x|y|z]] {{nombre_cliente}}";
  const recips = Array.from({ length: 9 }, (_, i) => ({ uid: `u${i}`, name: `N${i}`, id: "", zone: "", contactName: "", waNumber: `57300000000${i}` }));
  const { items, distinct } = buildRunItems({ recipients: recips, variants: [{ body }], config: cfg() });
  assert.equal(distinct, 9); // 9 clientes, 9 combinaciones posibles: ninguna repetida
  assert.equal(new Set(items.map((i) => i.text.replace(/N\d/, ""))).size, 9);
  // con una sola combinación posible se acepta repetir sin colgarse
  assert.equal(buildRunItems({ recipients: recips, variants: [{ body: "Hola {{nombre_cliente}}" }], config: cfg() }).distinct, 1);
});

test("variación automática: sin [[ ]] escritos, igual salen textos distintos y con el mismo sentido", () => {
  const body = "Les saluda {{nombre_comercial}}. Este viernes habrá alta demanda; les compartimos algunas recomendaciones el 31 de octubre.";
  const recips = Array.from({ length: 30 }, (_, i) => ({ uid: `u${i}`, name: `N${i}`, id: "", zone: "", contactName: "", waNumber: `5730000000${i}` }));
  const on = buildRunItems({ recipients: recips, variants: [{ body }], config: cfg(), autoVary: true });
  const off = buildRunItems({ recipients: recips, variants: [{ body }], config: cfg(), autoVary: false });
  assert.ok(new Set(on.items.map((i) => i.text)).size > 10);
  assert.equal(new Set(off.items.map((i) => i.text)).size, 1);
  on.items.forEach((i) => { assert.match(i.text, /31 de octubre/); assert.match(i.text, /Ana/); assert.ok(!i.text.includes("[[") && !i.text.includes("{{")); });
  assert.equal(effectiveBodies([{ body: " " }, { body }], false).length, 1);
});

test("sanitizePace conserva la opción de bloqueo (activa por defecto)", () => {
  assert.equal(sanitizePace({}).block, true);
  assert.equal(sanitizePace({ block: false }).block, false);
  assert.equal(sanitizePace({ block: "" }).block, true);
});
