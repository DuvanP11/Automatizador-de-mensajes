import test from "node:test";
import assert from "node:assert/strict";
import { searchClients } from "../js/core/search.js";

const C = (name, id, zone, contacts = [], extra = {}) => ({ uid: id, name, id, zone, contacts, owner: "", legalName: "", ...extra });
const clients = [
  C("Zeta Demo SAS", "ZET001", "Suba", [{ name: "Laura Gómez", phone: "3001234567", email: "laura@zeta.test" }]),
  C("Alfa Demo Logística SAS", "ALF001", "Chapinero", [{ name: "Carlos", phone: "3045550101", email: "" }, { name: "Marta", phone: "3045550102", email: "ventas@alfa.test" }], { owner: "Ana" }),
  C("Beta Tienda", "BET001", "Usaquén", [{ name: "", phone: "", email: "hola@beta.test" }], { legalName: "Comercial Beta Ltda", owner: "Luis" }),
  C("Alfonso Muñoz", "ALF002", "Suba", []),
];

test("sin texto devuelve todos en orden alfabético (el desplegable se puede recorrer)", () => {
  const r = searchClients(clients, "");
  assert.deepEqual(r.items.map((c) => c.id), ["ALF001", "ALF002", "BET001", "ZET001"]); assert.equal(r.total, 4);
});
test("busca por nombre, ignorando mayúsculas y tildes; primero los que empiezan por lo escrito", () => {
  assert.deepEqual(searchClients(clients, "alf").items.map((c) => c.id), ["ALF001", "ALF002"]);
  assert.deepEqual(searchClients(clients, "LOGISTICA").items.map((c) => c.id), ["ALF001"]);
  assert.deepEqual(searchClients(clients, "tienda").items.map((c) => c.id), ["BET001"]);
  assert.deepEqual(searchClients(clients, "demo").items.map((c) => c.id), ["ALF001", "ZET001"]);
});
test("busca por número de teléfono con cualquier formato, y por varios contactos del mismo cliente", () => {
  for (const q of ["3001234567", "300 123 4567", "300123", "+57 300 123 4567", "57300123"]) assert.deepEqual(searchClients(clients, q).items.map((c) => c.id), ["ZET001"], q);
  assert.deepEqual(searchClients(clients, "3045550102").items.map((c) => c.id), ["ALF001"]);
  assert.deepEqual(searchClients(clients, "30455501").items.map((c) => c.id), ["ALF001"]);
});
test("un número muy corto no trae casi todo", () => {
  assert.deepEqual(searchClients(clients, "30").items.map((c) => c.id), []);
  assert.deepEqual(searchClients(clients, "1").items.map((c) => c.id), []);
});
test("busca por correo (completo o parcial), por razón social, ID, zona y nombre de contacto", () => {
  assert.deepEqual(searchClients(clients, "ventas@alfa.test").items.map((c) => c.id), ["ALF001"]);
  assert.deepEqual(searchClients(clients, "@beta").items.map((c) => c.id), ["BET001"]);
  assert.deepEqual(searchClients(clients, "comercial beta").items.map((c) => c.id), ["BET001"]);
  assert.deepEqual(searchClients(clients, "zet001").items.map((c) => c.id), ["ZET001"]);
  assert.deepEqual(searchClients(clients, "usaquen").items.map((c) => c.id), ["BET001"]);
  assert.deepEqual(searchClients(clients, "laura gomez").items.map((c) => c.id), ["ZET001"]);
});
test("«solo mis clientes» filtra por comercial y respeta el límite", () => {
  assert.deepEqual(searchClients(clients, "", { owner: "ana" }).items.map((c) => c.id), ["ALF001"]);
  const many = Array.from({ length: 120 }, (_, i) => C(`Cliente ${String(i).padStart(3, "0")}`, `C${i}`, "Suba"));
  const r = searchClients(many, "cliente", { limit: 50 }); assert.equal(r.items.length, 50); assert.equal(r.total, 120);
  assert.deepEqual(searchClients(clients, "no existe nada").items, []);
});
