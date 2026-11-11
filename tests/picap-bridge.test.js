import test from "node:test";
import assert from "node:assert/strict";
import { contactosARegistros, pedirContactos, COMERCIAL_ORIGIN } from "../js/core/picap-bridge.js";
import { planImport, applyPlan, summarizePlan } from "../js/core/importer.js";

// Datos 100% ficticios.
const payload = [
  { id: "a".repeat(24), nombre: "Alfa Ltda", kam: "Ana KAM", correos: ["compras@alfa.test", "pagos@alfa.test"], telefonos: ["573001112233", "573109998877"] },
  { id: "b".repeat(24), nombre: "Beta SAS", kam: "", correos: [], telefonos: ["573005556677"] },
  { id: "c".repeat(24), nombre: "Sin contacto", kam: "X", correos: [], telefonos: [] },
  { id: "d", nombre: "", kam: "", correos: ["x@y.test"], telefonos: [] },
  null, "basura", { nombre: 5, telefonos: "no-es-lista" },
];

test("contactosARegistros valida y descarta lo que no sirve", () => {
  const r = contactosARegistros(payload);
  assert.deepEqual(r.map((x) => x.name || x.id), ["Alfa Ltda", "Alfa Ltda", "Beta SAS", "d"]);
  assert.equal(r[0].phone, "573001112233; 573109998877");
  assert.equal(r[0].email, "compras@alfa.test");
  assert.equal(r[1].email, "pagos@alfa.test"); assert.equal(r[1].phone, "");
  assert.equal(r[0].owner, "Ana KAM");
  assert.deepEqual(contactosARegistros("no"), []);
});

test("los registros entran por el asistente: un cliente con todos sus teléfonos y correos", () => {
  const items = planImport([], contactosARegistros(payload), { kind: "clients" });
  const { clients } = applyPlan([], items);
  const alfa = clients.find((c) => c.name === "Alfa Ltda");
  assert.ok(alfa, "crea Alfa");
  assert.equal(clients.filter((c) => c.name === "Alfa Ltda").length, 1, "los correos extra no duplican al cliente");
  assert.equal(alfa.owner, "Ana KAM");
  assert.deepEqual(alfa.contacts.map((c) => c.phone).filter(Boolean).sort(), ["573001112233", "573109998877"]);
  assert.deepEqual(alfa.contacts.map((c) => c.email).filter(Boolean).sort(), ["compras@alfa.test", "pagos@alfa.test"]);
  assert.ok(summarizePlan(items).new >= 2);
});

function ventanaFalsa(opener) {
  const ls = new Set();
  return { opener, addEventListener: (_, f) => ls.add(f), removeEventListener: (_, f) => ls.delete(f), emitir: (e) => [...ls].forEach((f) => f(e)), n: () => ls.size };
}

test("pedirContactos: responde solo comercial.picap.io y desde la pestaña que abrió", async () => {
  const enviados = [];
  const opener = { closed: false, postMessage: (m, o) => enviados.push([m, o]) };
  const win = ventanaFalsa(opener);
  const p = pedirContactos({ win, timeoutMs: 1000 });
  assert.deepEqual(enviados[0], [{ tipo: "pibox:pedir-contactos", v: 1 }, COMERCIAL_ORIGIN]);
  win.emitir({ origin: "https://evil.example", source: opener, data: { tipo: "pibox:contactos", clientes: [] } }); // otro origen: se ignora
  win.emitir({ origin: COMERCIAL_ORIGIN, source: {}, data: { tipo: "pibox:contactos", clientes: [] } });           // otra ventana: se ignora
  assert.equal(win.n(), 1);
  win.emitir({ origin: COMERCIAL_ORIGIN, source: opener, data: { tipo: "pibox:contactos", clientes: payload } });
  assert.equal((await p).length, 4);
  assert.equal(win.n(), 0);
});

test("pedirContactos: sin pestaña de origen, error del servidor y tiempo agotado dan mensajes claros", async () => {
  await assert.rejects(pedirContactos({ win: ventanaFalsa(null) }), /Consulta de Prospectos/);
  const opener = { closed: false, postMessage() {} };
  const w1 = ventanaFalsa(opener); const p1 = pedirContactos({ win: w1, timeoutMs: 1000 });
  w1.emitir({ origin: COMERCIAL_ORIGIN, source: opener, data: { tipo: "pibox:contactos-error", mensaje: "No tienes permiso" } });
  await assert.rejects(p1, /No tienes permiso/);
  await assert.rejects(pedirContactos({ win: ventanaFalsa(opener), timeoutMs: 20 }), /no respondió/);
});
