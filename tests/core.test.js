import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { renderTemplate, buildValues, greetingFor, resolveZone, lintTemplate, stripEmojis, whatsappUrl, VARIABLES } from "../js/core/templates.js";
import { DEFAULT_CONFIG, DEFAULT_TEMPLATE_BODY } from "../js/core/config.js";
import { formatMoney, parseMoney, validatePhone, deepClone, todayBogota } from "../js/core/util.js";
import { newFollowup, updateFollowup, buildRows, computeMetrics, sortRows, pendingRows } from "../js/core/followup.js";
import { buildReportWorkbook } from "../js/core/report.js";
import { createStore, normalizeState, seedClients } from "../js/core/store.js";

const cfg = () => {
  const c = deepClone(DEFAULT_CONFIG);
  c.commercial = { name: "Juliana Rojas", role: "Account Manager", area: "Comercial", signature: "" };
  return c;
};
const client = { uid: "c1", id: "AMB001", name: "Ambrosia Toy Store", contacts: [{ cid: "k", name: "Laura", phone: "3001234567", email: "a@b.co" }] };
const render = (body, o = {}) => renderTemplate(body, buildValues({ config: o.config || cfg(), client, contact: client.contacts[0], zone: o.zone ?? "", now: o.now }), o);

// ---------- Generador ----------
test("todas las variables se reemplazan; ninguna llave queda visible", () => {
  const all = VARIABLES.map((v) => `{{${v.key}}}`).join(" | ");
  const r = render(all, { zone: "Chapinero" });
  assert.ok(!r.text.includes("{{") && !r.text.includes("}}"));
  assert.ok(r.text.includes("Ambrosia Toy Store") && r.text.includes("$10.500 COP") && r.text.includes("Account Manager") && r.text.includes("AMB001") && r.text.includes("Laura"));
});

test("sin zona: desaparece 'para la zona de' completo y el mensaje queda natural", () => {
  const r = render(DEFAULT_TEMPLATE_BODY, { zone: resolveZone("Ninguna", "") });
  assert.ok(!/zona/i.test(r.text.replace("zona", "")) || !r.text.includes("para la zona de"));
  assert.ok(!r.text.includes("para la zona de"));
  assert.match(r.text, /\*Entregas Optimizadas\*: una tarifa única de \$10\.500 COP para despachos/);
});

test("zona elegida y zona personalizada", () => {
  assert.match(render(DEFAULT_TEMPLATE_BODY, { zone: "Chapinero" }).text, /\*Entregas Optimizadas\* para la zona de Chapinero:/);
  assert.match(render(DEFAULT_TEMPLATE_BODY, { zone: resolveZone("Otra", " Teusaquillo ") }).text, /zona de Teusaquillo:/);
  assert.equal(resolveZone("Otra", "   "), ""); // 'Otra' vacío = sin zona, no frase rota
});

test("cambio de nombre, cargo y tarifa se reflejan", () => {
  const c = cfg(); c.commercial.name = "Carlos Peña"; c.commercial.role = "Ejecutivo comercial"; c.offer.rate = 9800;
  const t = render(DEFAULT_TEMPLATE_BODY, { config: c }).text;
  assert.match(t, /Mi nombre es Carlos Peña, Ejecutivo comercial del área Comercial de Pibox/);
  assert.match(t, /\$9\.800 COP/);
  assert.ok(!t.includes("Juliana"));
});

test("variable obligatoria vacía → advertencia, sin etiqueta visible", () => {
  const c = cfg(); c.commercial.name = "";
  const r = render("Hola {{nombre_comercial}} {{tarifa}}", { config: c });
  assert.deepEqual(r.missing, ["nombre_comercial"]);
  assert.ok(!r.text.includes("{{"));
});

test("variable desconocida se elimina y se reporta", () => {
  const r = render("Hola {{nombre_cliente}} {{inventada}}");
  assert.deepEqual(r.unknown, ["inventada"]);
  assert.equal(r.text, "Hola Ambrosia Toy Store");
});

test("saludo automático usa hora de Colombia, no UTC", () => {
  const c = cfg();
  assert.equal(greetingFor(c, new Date("2026-10-16T14:00:00Z")), "Buenos días"); // 09:00 Bogotá
  assert.equal(greetingFor(c, new Date("2026-10-16T17:00:00Z")), "Buenas tardes"); // 12:00
  assert.equal(greetingFor(c, new Date("2026-10-16T22:59:00Z")), "Buenas tardes"); // 17:59
  assert.equal(greetingFor(c, new Date("2026-10-17T00:30:00Z")), "Buenas noches"); // 19:30 del 16
  assert.equal(greetingFor(c, new Date("2026-10-16T04:59:00Z")), "Buenas noches"); // 23:59 del 15
  c.greeting = { mode: "manual", manual: "Hola" };
  assert.equal(greetingFor(c, new Date()), "Hola");
});

test("emojis: múltiples, compuestos y desactivables", () => {
  const body = "{{saludo}} 👋 {{nombre_cliente}} 👨‍👩‍👧 🇨🇴 ✨";
  const on = render(body).text;
  assert.ok(on.includes("👨‍👩‍👧") && on.includes("🇨🇴"));
  const off = render(body, { emojis: false }).text;
  assert.ok(!/\p{Extended_Pictographic}/u.test(off) && !off.includes("🇨🇴"));
  assert.match(off, /Ambrosia Toy Store$/);
  assert.equal(stripEmojis("a👍🏽b"), "ab");
});

test("alternativas [[a|b]] son deterministas por semilla y conservan datos", () => {
  const body = "[[Uno|Dos|Tres]] tarifa {{tarifa}}";
  assert.equal(render(body, { seed: 0 }).text, "Uno tarifa $10.500 COP");
  assert.equal(render(body, { seed: 1 }).text, "Dos tarifa $10.500 COP");
});

test("lint detecta bloques sin cerrar y variables desconocidas", () => {
  assert.equal(lintTemplate(DEFAULT_TEMPLATE_BODY).length, 0);
  assert.ok(lintTemplate("{{#zona}} hola").length);
  assert.ok(lintTemplate("{{foo}}")[0].includes("foo"));
});

test("render no muta la plantilla original", () => {
  const body = DEFAULT_TEMPLATE_BODY;
  render(body, { zone: "Chapinero" });
  assert.equal(body, DEFAULT_TEMPLATE_BODY);
});

test("WhatsApp: teléfono correcto, sin inventar prefijo cuando no está configurado", () => {
  assert.equal(validatePhone("300 123 4567", "57").waNumber, "573001234567");
  assert.equal(validatePhone("+57 300 123 4567", "57").waNumber, "573001234567");
  assert.equal(validatePhone("300 123 4567", "").ok, false);
  assert.equal(validatePhone("12345", "57").ok, false);
  assert.equal(validatePhone("", "57").ok, false);
  const url = whatsappUrl("573001234567", "Hola 👋\n*x* $10.500 COP");
  assert.ok(url.startsWith("https://api.whatsapp.com/send/?phone=573001234567&text=Hola%20%F0%9F%91%8B%0A"));
  assert.ok(!url.includes("wa.me")); // wa.me corrompe los emojis
  assert.equal(decodeURIComponent(url.split("text=")[1].split("&")[0]), "Hola 👋\n*x* $10.500 COP");
});

test("dinero: formato colombiano y parseo", () => {
  assert.equal(formatMoney(10500), "$10.500 COP");
  assert.equal(formatMoney(1234567, "COP"), "$1.234.567 COP");
  assert.equal(parseMoney("$10.500 COP"), 10500);
  assert.equal(parseMoney("10500"), 10500);
});

// ---------- Seguimiento ----------
const statuses = DEFAULT_CONFIG.statuses;
const TODAY = "2026-10-16";
function fixture() {
  const clients = [
    { uid: "a", id: "A1", name: "Alfa", zone: "Chapinero", owner: "Ana" },
    { uid: "b", id: "B1", name: "Beta", zone: "Los Mártires", owner: "Ana" },
    { uid: "c", id: "C1", name: "Gamma", zone: "Chapinero", owner: "Luis" },
    { uid: "d", id: "D1", name: "Delta", zone: "Chapinero", owner: "Luis" },
    { uid: "e", id: "E1", name: "Épsilon", zone: "", owner: "" },
  ];
  const followups = {};
  const set = (uid, patch, now) => { followups[uid] = updateFollowup(followups[uid] || newFollowup(uid, statuses, { owner: clients.find((c) => c.uid === uid).owner, now }), patch, { by: "Ana", now, statuses }); };
  set("a", { status: "interesado", nextFollowUpAt: "2026-10-10", note: "Pidió info" }, "2026-10-01T15:00:00.000Z"); // vencido
  set("a", { note: "Se envió propuesta" }, "2026-10-05T15:00:00.000Z");
  set("b", { status: "negociacion", nextFollowUpAt: "2026-10-20" }, "2026-10-02T15:00:00.000Z"); // próximo
  set("c", { status: "no_interesado", notInterestedReason: "Usa otro proveedor", nextFollowUpAt: "2026-09-01" }, "2026-10-03T15:00:00.000Z"); // terminal: no vencido
  set("d", { status: "sin_respuesta" }, "2026-10-04T15:00:00.000Z");
  return { clients, followups };
}

test("crear, actualizar estado y conservar historial", () => {
  const { followups } = fixture();
  const fu = followups.a;
  assert.equal(fu.status, "interesado");
  assert.equal(fu.lastContactAt, "2026-10-01");
  const kinds = fu.history.map((e) => e.type);
  assert.equal(kinds[0], "status");
  assert.ok(kinds.includes("field") && kinds.includes("note"));
  assert.equal(fu.history[0].note, "Pidió info");
  assert.ok(fu.history.some((e) => e.note === "Se envió propuesta"));
  const before = fu.history.length;
  const after = updateFollowup(fu, { status: "negociacion" }, { now: "2026-10-06T10:00:00.000Z" });
  assert.equal(after.history.length, before + 1);
  assert.equal(fu.status, "interesado"); // original intacto
  assert.deepEqual(after.history.slice(0, before), fu.history);
});

test("filtros por comercial, estado, zona, texto y fechas", () => {
  const { clients, followups } = fixture();
  const f = (filters) => buildRows({ clients, followups, statuses, filters, today: TODAY }).map((r) => r.client.uid);
  assert.deepEqual(f({ owner: "ana" }), ["a", "b"]);
  assert.deepEqual(f({ status: "sin_respuesta" }), ["d"]);
  assert.deepEqual(f({ zone: "Chapinero" }), ["a", "c", "d"]);
  assert.deepEqual(f({ query: "epsilon" }), ["e"]);
  assert.deepEqual(f({ query: "b1" }), ["b"]);
  assert.deepEqual(f({ from: "2026-10-03", to: "2026-10-04" }), ["c", "d"]); // a solo tuvo gestión el 01 y el 05
  assert.deepEqual(f({ from: "2026-10-05" }), ["a"]);
  assert.deepEqual(f({ to: "2026-10-01" }), ["a"]);
});

test("indicadores calculados desde datos reales", () => {
  const { clients, followups } = fixture();
  const rows = buildRows({ clients, followups, statuses, today: TODAY });
  const m = computeMetrics(rows, { today: TODAY });
  assert.deepEqual(
    { total: m.counts.total, pending: m.counts.pending, contacted: m.counts.contacted, responded: m.counts.responded, interested: m.counts.interested, negotiation: m.counts.negotiation, not_interested: m.counts.not_interested, overdue: m.counts.overdue, upcoming: m.counts.upcoming },
    { total: 5, pending: 1, contacted: 4, responded: 3, interested: 1, negotiation: 1, not_interested: 1, overdue: 1, upcoming: 1 },
  );
  assert.equal(m.ratios[2].value, 25); // 1 interesado de 4 contactados
  assert.equal(m.ratios[2].den, 4);
  const filtered = computeMetrics(buildRows({ clients, followups, statuses, filters: { owner: "Luis" }, today: TODAY }), { today: TODAY });
  assert.equal(filtered.counts.total, 2);
  assert.equal(computeMetrics([], { today: TODAY }).ratios[1].value, null); // sin denominador
});

test("vencidos: terminal no cuenta; orden por próximo seguimiento deja sin fecha al final", () => {
  const { clients, followups } = fixture();
  const rows = buildRows({ clients, followups, statuses, today: TODAY });
  assert.deepEqual(rows.filter((r) => r.overdue).map((r) => r.client.uid), ["a"]);
  assert.deepEqual(sortRows(rows, "nextFollowUp").map((r) => r.client.uid), ["c", "a", "b", "d", "e"]);
  assert.deepEqual(pendingRows(rows, TODAY).map((r) => [r.client.uid, r.reason]), [["a", "Seguimiento vencido"], ["b", "Próximo seguimiento (7 días)"], ["e", "Pendiente de contactar"]]);
});

test("estados personalizados no rompen indicadores (cuentan por categoría)", () => {
  const { clients, followups } = fixture();
  const st = [...statuses, { key: "demo", label: "Demo agendada", stage: "interested", active: true }];
  followups.e = updateFollowup(newFollowup("e", st, { now: "2026-10-05T10:00:00.000Z" }), { status: "demo" }, { now: "2026-10-05T10:00:00.000Z", statuses: st });
  const m = computeMetrics(buildRows({ clients, followups, statuses: st, today: TODAY }), { today: TODAY });
  assert.equal(m.counts.interested, 2);
  // Un estado desactivado/eliminado sigue resolviéndose por su clave guardada.
  const rows = buildRows({ clients, followups, statuses, today: TODAY });
  assert.equal(rows.find((r) => r.client.uid === "e").stage, "pending"); // clave desconocida → no rompe
});

// ---------- Informe Excel ----------
test("informe Excel: hojas, totales = pantalla, IDs con ceros, sin teléfonos", () => {
  const { clients, followups } = fixture();
  clients[0].id = "00123";
  const filters = { owner: "Ana" };
  const rows = buildRows({ clients, followups, statuses, filters, today: TODAY });
  const metrics = computeMetrics(rows, { today: TODAY });
  const wb = buildReportWorkbook(XLSX, { rows, metrics, filters, statuses, generatedAt: new Date("2026-10-16T15:00:00Z"), today: TODAY });
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const back = XLSX.read(buf, { type: "buffer", cellDates: false });
  assert.deepEqual(back.SheetNames, ["Resumen gerencial", "Detalle de clientes", "Historial de gestión", "Pendientes"]);
  const sum = XLSX.utils.sheet_to_json(back.Sheets["Resumen gerencial"], { header: 1 });
  const total = sum.find((r) => r[0] === "Total de clientes");
  assert.equal(total[1], metrics.counts.total);
  assert.equal(total[1], 2);
  assert.ok(sum.some((r) => r[0] === "Filtros aplicados" && String(r[1]).includes("Comercial: Ana")));
  assert.ok(sum.find((r) => r[0] === "Interesados sobre contactados")[2].includes("de 2"));
  const det = XLSX.utils.sheet_to_json(back.Sheets["Detalle de clientes"], { header: 1, raw: false });
  assert.equal(det.length, 3);
  assert.equal(det[1][1], "00123"); // cero inicial intacto
  assert.equal(det[1][7], "Sí"); // vencido
  assert.ok(!JSON.stringify(det).match(/\d{10}/)); // sin teléfonos
  assert.equal(back.Sheets["Detalle de clientes"]["!autofilter"].ref, "A1:M3");
  assert.equal(det[1][5], "01/10/2026"); // fecha legible
});

test("informe sin historial ni pendientes omite esas hojas", () => {
  const clients = [{ uid: "z", id: "Z", name: "Zeta", zone: "", owner: "" }];
  const fu = { z: updateFollowup(newFollowup("z", statuses, { now: "x" }), { status: "cerrado" }, { now: "2026-10-01T10:00:00.000Z" }) };
  fu.z.history = [];
  const rows = buildRows({ clients, followups: fu, statuses, today: TODAY });
  const wb = buildReportWorkbook(XLSX, { rows, metrics: computeMetrics(rows, { today: TODAY }), filters: {}, statuses, today: TODAY });
  assert.deepEqual(wb.SheetNames, ["Resumen gerencial", "Detalle de clientes"]);
});

// ---------- Persistencia ----------
function memStorage() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; }

test("persistencia: guarda, recarga y respalda/restaura", () => {
  const st = memStorage();
  const s1 = createStore(st); s1.load();
  s1.commit((d) => { d.clients.push({ uid: "x", id: "009", name: "Persistente", contacts: [] }); });
  const s2 = createStore(st); s2.load();
  assert.equal(s2.state.clients[0].id, "009");
  const backup = s2.exportBackup();
  const s3 = createStore(memStorage()); s3.load();
  s3.replaceAll(s3.parseBackup(backup));
  assert.equal(s3.state.clients[0].name, "Persistente");
  assert.throws(() => s3.parseBackup("{}"), /no corresponde/);
  assert.throws(() => s3.parseBackup("no json"), /JSON/);
});

test("persistencia: almacenamiento bloqueado no rompe la app y avisa", () => {
  const bad = { getItem() { throw new Error("x"); }, setItem() { throw new Error("quota"); } };
  const s = createStore(bad); s.load();
  s.commit((d) => { d.clients.push({ uid: "q", id: "1", name: "Q", contacts: [] }); });
  assert.equal(s.state.clients.length, 1);
  assert.match(s.persistError, /respaldo/);
});

test("semilla v1 → v2 y normalización de estado antiguo", () => {
  const seeded = seedClients([{ id: "AIR001", cliente: "Airtempe SAS", localidad: "Los martires" }], DEFAULT_CONFIG.zones);
  assert.equal(seeded[0].zone, "Los Mártires");
  const st = normalizeState({ clients: [{ uid: "q", id: "1", name: "Q" }] });
  assert.equal(st.templates.length, 1);
  assert.equal(st.config.offer.rate, 10500);
});
