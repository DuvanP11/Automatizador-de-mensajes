import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { sheetToMatrix, detectMapping, extractRecords, planImport, applyPlan, summarizePlan, resolveReview, errorReportRows, mappingIsUsable } from "../js/core/importer.js";

// Datos 100% ficticios.
function wbFrom(aoa, opts = {}) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  // Ida y vuelta por bytes: valida que el archivo real se lee igual que uno subido.
  const buf = XLSX.write(wb, { type: "buffer", bookType: opts.bookType || "xlsx" });
  return XLSX.read(buf, { type: "buffer" });
}
function load(aoa, kind = "clients", bookType) {
  const wb = wbFrom(aoa, { bookType });
  const m = sheetToMatrix(XLSX, wb);
  const map = detectMapping(m, { kind });
  return { m, map, recs: extractRecords(m, map.headerRow, map.mapping) };
}
const base = () => [
  { uid: "cl_1", id: "A001", name: "Alfa Ltda", legalName: "", zone: "Chapinero", owner: "", notes: "", contacts: [{ cid: "ct_1", name: "Ana", phone: "3001112233", email: "", primary: true }], createdAt: "", updatedAt: "" },
  { uid: "cl_2", id: "B002", name: "Beta SAS", legalName: "", zone: "", owner: "", notes: "", contacts: [], createdAt: "", updatedAt: "" },
  { uid: "cl_3", id: "", name: "Gamma Express", legalName: "", zone: "", owner: "", notes: "", contacts: [], createdAt: "", updatedAt: "" },
];

test("reconoce encabezados con variantes y tildes", () => {
  const { map } = load([["Razón social", "CompanyID", "Número de contacto", "E-mail"], ["Delta SAS", "D1", "3001234567", "d@x.co"]]);
  assert.equal(map.mapping.name, 0); // Razón social como nombre cuando no hay otra columna
  assert.equal(map.mapping.id, 1);
  assert.equal(map.mapping.phone, 2);
  assert.equal(map.mapping.email, 3);
  assert.equal(mappingIsUsable(map.mapping, "directory"), true);
});

test("encuentra encabezados en una fila posterior y omite filas vacías", () => {
  const { map, recs } = load([["Reporte mensual"], [], ["Cliente", "ID", "Celular"], ["Delta SAS", "D1", "3001234567"], [], ["Épsilon", "E1", "3109998877"]]);
  assert.equal(map.headerRow, 2);
  assert.equal(recs.length, 2);
  assert.equal(recs[1].rowNum, 6);
});

test("conserva ceros iniciales (texto) y evita notación científica en teléfonos numéricos", () => {
  const ws = XLSX.utils.aoa_to_sheet([["Cliente", "ID", "Teléfono"], ["Zeta", "00123", 573001234567]]);
  ws["B2"] = { t: "s", v: "00123" };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "H");
  const m = sheetToMatrix(XLSX, XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" }));
  assert.equal(m[1][1], "00123");
  assert.equal(m[1][2], "573001234567");
});

test("ID numérico con formato 0000 conserva los ceros", () => {
  const ws = XLSX.utils.aoa_to_sheet([["Cliente", "ID"], ["Zeta", 42]]);
  ws["B2"].z = "0000";
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "H");
  const m = sheetToMatrix(XLSX, XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }), { type: "buffer", cellNF: true }));
  assert.equal(m[1][1], "0042");
});

test("archivo .xls se lee igual", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Delta SAS", "D1", "3001234567"]], "clients", "biff8");
  assert.equal(recs[0].name, "Delta SAS");
});

test("encabezados inesperados → pide revisión y no es usable", () => {
  const { map } = load([["Foo", "Bar", "Baz"], ["1", "2", "3"]]);
  assert.equal(map.needsReview, true);
  assert.equal(mappingIsUsable(map.mapping, "clients"), false);
});

test("relación por ID, aunque el nombre cambie: propone cambio de nombre sin aplicarlo", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Alfa Limitada", "a001", "3001112233"]]);
  const items = planImport(base(), recs, { kind: "clients" });
  assert.equal(items[0].status, "update");
  const nameChange = items[0].changes.find((c) => c.field === "name");
  assert.equal(nameChange.old, "Alfa Ltda");
  assert.equal(nameChange.apply, false); // sobrescribir requiere confirmación
  const { clients } = applyPlan(base(), items);
  assert.equal(clients[0].name, "Alfa Ltda");
  assert.equal(clients.length, 3);
});

test("nombre normalizado (tildes/mayúsculas/espacios) sin ID; asigna ID vacío → vacío conf.", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["  GAMMA   express ", "G9", "3205550000"]]);
  const items = planImport(base(), recs);
  assert.equal(items[0].status, "update");
  assert.equal(items[0].clientUid, "cl_3");
  const { clients } = applyPlan(base(), items);
  assert.equal(clients[2].id, "G9"); // campo vacío → se rellena
  assert.equal(clients[2].contacts[0].phone, "3205550000");
});

test("empresas con nombre parecido pero distinto NO se fusionan", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Alfa SAS", "A777", "3001110000"]]);
  const items = planImport(base(), recs);
  assert.equal(items[0].status, "new");
});

test("mismo nombre con otro ID → revisión manual y resolución", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Alfa Ltda", "A999", "3004445566"]]);
  const items = planImport(base(), recs);
  assert.equal(items[0].status, "review");
  assert.equal(items[0].candidates[0].uid, "cl_1");
  const asNew = resolveReview(base(), items[0], { type: "new" });
  assert.equal(asNew.status, "new");
  const merge = resolveReview(base(), items[0], { type: "merge", uid: "cl_1" });
  assert.equal(merge.status, "update");
});

test("nombre ambiguo (dos clientes iguales) → revisión", () => {
  const clients = base();
  clients.push({ ...base()[0], uid: "cl_9", id: "A002" });
  const { recs } = load([["Cliente", "Celular"], ["Alfa Ltda", "3001110000"]]);
  const items = planImport(clients, recs);
  assert.equal(items[0].status, "review");
  assert.equal(items[0].candidates.length, 2);
});

test("duplicados: ya existente sin cambios y repetido en el archivo", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Alfa Ltda", "A001", "3001112233"], ["Nueva Co", "N1", "3112223344"], ["Nueva Co", "N1", "3112223344"]]);
  const items = planImport(base(), recs);
  assert.deepEqual(items.map((i) => i.status), ["duplicate", "new", "duplicate"]);
  assert.match(items[2].message, /archivo/);
  const s = summarizePlan(items);
  assert.equal(s.new, 1); assert.equal(s.duplicates, 2);
  assert.equal(applyPlan(base(), items).clients.length, 4);
});

test("teléfono distinto en cliente con contacto → contacto nuevo (no pisa el existente)", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Alfa Ltda", "A001", "3159990000"]]);
  const items = planImport(base(), recs);
  assert.equal(items[0].changes[0].kind, "contact-add");
  const { clients } = applyPlan(base(), items);
  assert.deepEqual(clients[0].contacts.map((c) => c.phone), ["3001112233", "3159990000"]);
  assert.equal(clients[0].contacts[1].primary, false);
});

test("mismo nombre de contacto con otro número → reemplazo que requiere confirmación", () => {
  const { recs } = load([["Cliente", "ID", "Nombre contacto", "Celular"], ["Alfa Ltda", "A001", "Ana", "3150001111"]]);
  const items = planImport(base(), recs);
  const ch = items[0].changes[0];
  assert.equal(ch.kind, "contact-replace");
  assert.equal(ch.old, "3001112233");
  assert.equal(ch.apply, false);
  assert.equal(applyPlan(base(), items).clients[0].contacts[0].phone, "3001112233");
  ch.apply = true; // el usuario lo aprueba
  assert.equal(applyPlan(base(), items).clients[0].contacts[0].phone, "3150001111");
});

test("57 + móvil se reconoce como el mismo número (sin duplicar contacto)", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Alfa Ltda", "A001", "573001112233"]]);
  assert.equal(planImport(base(), recs)[0].status, "duplicate");
});

test("directorio: fila sin teléfono = error; cliente inexistente = revisión; inválido = error", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["Alfa Ltda", "A001", ""], ["Fantasma", "F1", "3001234567"], ["Beta SAS", "B002", "123"]], "directory");
  const items = planImport(base(), recs, { kind: "directory" });
  assert.deepEqual(items.map((i) => i.status), ["error", "review", "error"]);
  const created = resolveReview(base(), items[1], { type: "new" }, { kind: "directory" });
  assert.equal(created.status, "new");
});

test("campos vacíos, correo inválido y fila sin identidad", () => {
  const { recs } = load([["Cliente", "ID", "Celular", "Correo"], ["", "", "3001112233", "x@y.co"], ["Omega SAS", "", "", "malo"], ["Sigma SAS", "S1", "", ""]]);
  const items = planImport(base(), recs);
  assert.equal(items[0].status, "error");
  assert.equal(items[1].status, "new");
  assert.ok(items[1].warnings[0].includes("Correo inválido"));
  assert.equal(items[2].newClient.contacts.length, 0);
});

test("ceros iniciales en ID se conservan y no confunden '007' con '7'", () => {
  const clients = [{ ...base()[0], uid: "cl_7", id: "7", name: "Siete" }];
  const { recs } = load([["Cliente", "ID"], ["Triple cero", "007"]]);
  const items = planImport(clients, recs);
  assert.equal(items[0].status, "new");
  assert.equal(items[0].newClient.id, "007");
});

test("contenido HTML de celdas queda como texto inerte y la base original no muta", () => {
  const original = base();
  const snapshot = JSON.stringify(original);
  const { recs } = load([["Cliente", "ID"], ["<img src=x onerror=alert(1)>", "X1"]]);
  const items = planImport(original, recs);
  assert.equal(items[0].newClient.name, "<img src=x onerror=alert(1)>"); // la UI usa textContent
  assert.equal(JSON.stringify(original), snapshot);
});

test("reporte de errores incluye errores, revisiones pendientes y advertencias", () => {
  const { recs } = load([["Cliente", "ID", "Celular"], ["", "", "3001"], ["Alfa Ltda", "A999", "3004445566"], ["Ok SAS", "O1", "12"]]);
  const rows = errorReportRows(planImport(base(), recs));
  assert.equal(rows[0][0], "Fila en el archivo");
  assert.equal(rows.length, 4);
  assert.equal(rows[1][0], 2);
});
