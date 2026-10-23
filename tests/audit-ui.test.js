import test from "node:test";
import assert from "node:assert/strict";

// localStorage mínimo para probar el emisor sin navegador.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const tok = (e) => Buffer.from(JSON.stringify({ u: "x", e })).toString("base64url") + ".firma";
const { track, trackView, flush, isReporting } = await import("../js/ui/audit.js");
const fakeFetch = (status = 200) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return { status }; }; f.calls = calls; return f; };

test("sin firma (no entró desde el Agente) no envía nada", async () => {
  store.clear(); const f = fakeFetch();
  track("wa_open"); trackView("generador"); await flush(f);
  assert.equal(f.calls.length, 0); assert.equal(isReporting(), false);
});

test("con firma envía solo los eventos, a la dirección del Agente, con firma y sin credenciales", async () => {
  store.set("pibox_ac_token_v1", tok(Date.now() + 3_600_000)); const f = fakeFetch();
  trackView("clientes"); track("clients_import", 12); track("wa_open"); await flush(f);
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, "https://agente-comercial-xi.vercel.app/api/public/audit");
  assert.equal(init.method, "POST"); assert.equal(init.credentials, "omit"); assert.match(init.headers.authorization, /^Bearer /);
  assert.deepEqual(JSON.parse(init.body), { events: [{ t: "view", s: "clientes" }, { t: "action", a: "clients_import", n: 12 }, { t: "action", a: "wa_open" }] });
});

test("claves desconocidas o con texto libre se descartan antes de salir", async () => {
  store.set("pibox_ac_token_v1", tok(Date.now() + 3_600_000)); const f = fakeFetch();
  track("Juan Pérez 3001234567"); track("borrar_todo"); trackView("../../etc"); await flush(f);
  assert.equal(f.calls.length, 0);
});

test("si el servidor rechaza la firma (vencida o persona desactivada) deja de intentar", async () => {
  store.set("pibox_ac_token_v1", tok(Date.now() + 3_600_000)); const f = fakeFetch(401);
  track("msg_copy"); await flush(f);
  assert.equal(store.has("pibox_ac_token_v1"), false);
  track("msg_copy"); await flush(f); assert.equal(f.calls.length, 1);
});

test("una firma por vencer o vencida no se usa", async () => {
  store.set("pibox_ac_token_v1", tok(Date.now() + 10_000)); const f = fakeFetch();
  track("msg_copy"); await flush(f); assert.equal(f.calls.length, 0);
});

test("sin conexión no lanza error ni frena la herramienta", async () => {
  store.set("pibox_ac_token_v1", tok(Date.now() + 3_600_000));
  track("msg_copy"); await assert.doesNotReject(flush(async () => { throw new TypeError("Failed to fetch"); }));
});
