import { h, field, select, toast, confirmDialog, openDialog, downloadWorkbook, emptyState } from "./dom.js";
import { track } from "./audit.js";
import { assignOwner, sheetToMatrix, detectMapping, extractRecords, planImport, applyPlan, summarizePlan, resolveReview, errorReportRows, mappingIsUsable, FIELD_LABELS, statusLabel } from "../core/importer.js";
import { buildSimpleWorkbook } from "../core/report.js";
import { updateFollowup } from "../core/followup.js";
import { normalizeText, nameKey, validatePhone, isValidEmail, uid } from "../core/util.js";

const PAGE = 50;
const MAX_BYTES = 10 * 1024 * 1024;

export function renderClients(root, ctx) {
  const { store, XLSX } = ctx;
  store0 = () => store.state;
  const S = () => store.state;
  const view = (ctx.clientsView ||= { q: "", page: 0 });
  const tableHost = h("div");
  const search = h("input", { type: "search", id: "cq", placeholder: "Buscar por nombre, ID, zona, comercial…", value: view.q, oninput: (e) => { view.q = e.target.value; view.page = 0; drawTable(); } });

  const NONE = "__sin_comercial__";
  const bulkBox = h("div");
  function drawTable() {
    const stat = document.getElementById("phoneStat");
    if (stat) { stat.textContent = phoneStat(); stat.className = `alert ${store.state.clients.some((c) => c.contacts.some((x) => x.phone)) ? "info" : "warn"}`; }
    const q = normalizeText(view.q);
    view.sel ||= new Set();
    const everyone = S().clients;
    const counts = new Map();
    for (const c of everyone) { const k = c.owner?.trim() || NONE; counts.set(k, (counts.get(k) || 0) + 1); }
    const owners = [...counts.keys()].filter((k) => k !== NONE).sort((x, y) => x.localeCompare(y, "es"));
    if (view.owner && !counts.has(view.owner)) view.owner = "";
    const all = everyone.filter((c) => (!q || [c.name, c.id, c.zone, c.owner, c.legalName].some((v) => normalizeText(v).includes(q))) && (!view.owner || (c.owner?.trim() || NONE) === view.owner));
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    view.page = Math.min(view.page, pages - 1);
    const slice = all.slice(view.page * PAGE, view.page * PAGE + PAGE);
    if (!everyone.length) { tableHost.replaceChildren(emptyState("Aún no hay clientes", "Importa tu base desde Excel o agrega un cliente manualmente.", h("button", { class: "btn btn-primary", type: "button", text: "Agregar o sincronizar clientes", onclick: () => openImport(ctx, drawTable) }))); return; }
    const chip = (key, label, n) => h("button", { type: "button", "aria-pressed": String((view.owner || "") === key), text: `${label} (${n})`, onclick: () => { view.owner = key; view.page = 0; drawTable(); } });
    const chips = h("div", { class: "tabs", role: "group", "aria-label": "Filtrar por comercial" }, chip("", "Todos", everyone.length), owners.map((o) => chip(o, o, counts.get(o))), counts.has(NONE) ? chip(NONE, "Sin comercial", counts.get(NONE)) : null);
    const selAll = all.length > 0 && all.every((c) => view.sel.has(c.uid));
    const dl = h("datalist", { id: "bulk-owners" }, commercials(S()).map((o) => h("option", { value: o })));
    const bulk = view.sel.size ? h("div", { class: "alert info" },
      h("strong", { text: `${view.sel.size} cliente(s) seleccionado(s). ` }),
      h("div", { class: "row" },
        field("Asignar a (comercial)", h("input", { type: "text", list: "bulk-owners", value: view.bulkOwner || "", placeholder: "Nombre del comercial", oninput: (e) => (view.bulkOwner = e.target.value) })),
        h("div", { class: "field" }, h("label", { text: "\u00a0" }), h("div", { class: "actions", style: "margin:0" },
          h("button", { class: "btn btn-primary", type: "button", text: "Asignar", onclick: () => reassign(view.bulkOwner || "") }),
          h("button", { class: "btn btn-ghost", type: "button", text: "Quitar comercial", onclick: () => reassign("") }),
          h("button", { class: "btn btn-ghost", type: "button", text: "Limpiar selección", onclick: () => { view.sel.clear(); drawTable(); } }))))) : null;
    tableHost.replaceChildren(...[chips, dl, bulk,
      all.length ? h("div", { class: "table-wrap" }, h("table", {},
        h("caption", { class: "sr", text: "Clientes y contactos" }),
        h("thead", {}, h("tr", {},
          h("th", { scope: "col" }, h("input", { type: "checkbox", checked: selAll, "aria-label": `Seleccionar los ${all.length} clientes filtrados`, title: "Seleccionar todos los filtrados", onchange: (e) => { all.forEach((c) => (e.target.checked ? view.sel.add(c.uid) : view.sel.delete(c.uid))); drawTable(); } })),
          ["Cliente", "ID", "Zona", "Comercial", "Contactos", ""].map((t) => h("th", { scope: "col", text: t })))),
        h("tbody", {}, slice.map((c) => {
          const withPhone = c.contacts.filter((x) => x.phone);
          const main = c.contacts.find((x) => x.primary && x.phone) || withPhone[0];
          return h("tr", {},
            h("td", {}, h("input", { type: "checkbox", checked: view.sel.has(c.uid), "aria-label": `Seleccionar ${c.name}`, onchange: (e) => { e.target.checked ? view.sel.add(c.uid) : view.sel.delete(c.uid); drawTable(); } })),
            h("td", {}, h("strong", { text: c.name }), c.legalName ? h("div", { class: "muted", text: c.legalName }) : null),
            h("td", { class: "nowrap", text: c.id || "—" }), h("td", { text: c.zone || "—" }),
            h("td", {}, c.owner ? h("span", { class: "badge", text: c.owner }) : h("span", { class: "muted", text: "Sin comercial" })),
            h("td", {}, main ? h("span", { text: `${main.phone}${c.contacts.length > 1 ? ` (+${c.contacts.length - 1})` : ""}` }) : h("span", { class: "badge warn", text: "Sin teléfono" })),
            h("td", { class: "nowrap" },
              h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Editar", "aria-label": `Editar ${c.name}`, onclick: () => openEdit(c.uid) }), " ",
              h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Eliminar", "aria-label": `Eliminar ${c.name}`, onclick: () => removeClient(c) })));
        })))) : emptyState("Sin resultados", "Ningún cliente coincide con los filtros."),
      h("div", { class: "actions" },
        h("span", { class: "muted", text: `${all.length} cliente(s) · página ${view.page + 1} de ${pages}` }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "← Anterior", disabled: view.page === 0, onclick: () => { view.page--; drawTable(); } }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Siguiente →", disabled: view.page >= pages - 1, onclick: () => { view.page++; drawTable(); } })),
    ].filter(Boolean));
  }

  async function reassign(owner) {
    const n = view.sel.size, name = owner.trim();
    const ok = await confirmDialog({ title: name ? "Asignar comercial" : "Quitar comercial", message: name ? `Se asignarán ${n} cliente(s) a «${name}». Si ya tenían otro comercial, se reemplaza, y su seguimiento queda a cargo de «${name}».` : `Se quitará el comercial a ${n} cliente(s).`, confirmText: name ? "Asignar" : "Quitar" });
    if (!ok) return;
    store.commit((d) => reassignOwners(d, [...view.sel], name));
    view.sel.clear(); view.bulkOwner = "";
    track("clients_assign", n);
    drawTable(); toast(name ? `${n} cliente(s) asignados a ${name} ✓` : "Comercial quitado");
  }

  async function removeClient(c) {
    const fu = S().followups[c.uid];
    const ok = await confirmDialog({ title: "Eliminar cliente", message: `Se eliminará «${c.name}» con sus contactos${fu?.history?.length ? ` y su historial de seguimiento (${fu.history.length} eventos)` : ""}. Esta acción no se puede deshacer; considera descargar un respaldo antes.`, confirmText: "Eliminar", danger: true });
    if (!ok) return;
    store.commit((d) => { d.clients = d.clients.filter((x) => x.uid !== c.uid); delete d.followups[c.uid]; });
    track("client_delete");
    drawTable(); toast("Cliente eliminado");
  }

  function openEdit(uidv) {
    const existing = uidv ? S().clients.find((c) => c.uid === uidv) : null;
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : { uid: uid("cl"), id: "", name: "", legalName: "", zone: "", owner: "", notes: "", contacts: [] };
    const errs = h("div", { role: "alert" });
    const f = {
      name: h("input", { type: "text", value: draft.name, required: true }), id: h("input", { type: "text", value: draft.id }),
      legalName: h("input", { type: "text", value: draft.legalName }), zone: h("input", { type: "text", value: draft.zone, list: "zones-dl" }),
      owner: h("input", { type: "text", value: draft.owner, list: "owners-dl" }), notes: h("textarea", { rows: 2, text: draft.notes }),
    };
    const zonesDl = h("datalist", { id: "zones-dl" }, S().config.zones.map((z) => h("option", { value: z })));
    const ownersDl = h("datalist", { id: "owners-dl" }, commercials(S()).map((z) => h("option", { value: z })));
    const contactsHost = h("div");
    function drawContacts() {
      contactsHost.replaceChildren(
        h("h3", { text: "Contactos" }),
        ...draft.contacts.map((ct, i) => h("div", { class: "row", role: "group", "aria-label": `Contacto ${i + 1}` },
          field("Nombre", h("input", { type: "text", value: ct.name, oninput: (e) => (ct.name = e.target.value) })),
          field("Teléfono", h("input", { type: "tel", value: ct.phone, oninput: (e) => (ct.phone = e.target.value) })),
          field("Correo", h("input", { type: "email", value: ct.email, oninput: (e) => (ct.email = e.target.value) })),
          h("div", { class: "field" }, h("label", { text: "Principal" }), h("input", { type: "radio", name: "primary", checked: !!ct.primary, "aria-label": `Contacto ${i + 1} principal`, onchange: () => draft.contacts.forEach((x) => (x.primary = x === ct)) })),
          h("div", { class: "field" }, h("label", { text: " " }), h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Quitar", onclick: () => { draft.contacts.splice(i, 1); drawContacts(); } })))),
        h("button", { class: "btn btn-secondary btn-sm", type: "button", text: "+ Agregar contacto", onclick: () => { draft.contacts.push({ cid: uid("ct"), name: "", phone: "", email: "", primary: draft.contacts.length === 0 }); drawContacts(); } }),
      );
    }
    drawContacts();
    const form = h("form", { novalidate: true }, zonesDl, ownersDl,
      h("div", { class: "row" }, field("Nombre del cliente *", f.name), field("ID cliente / compañía", f.id)),
      h("div", { class: "row" }, field("Razón social", f.legalName), field("Zona / localidad", f.zone), field("Comercial asignado", f.owner)),
      field("Observaciones", f.notes), contactsHost, errs,
      h("div", { class: "actions end" }, h("button", { class: "btn btn-ghost", type: "button", text: "Cancelar", onclick: () => dlg.close() }), h("button", { class: "btn btn-primary", type: "submit", text: "Guardar" })));
    const dlg = openDialog(existing ? "Editar cliente" : "Nuevo cliente", form, { wide: true });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const problems = [];
      if (!f.name.value.trim()) problems.push("El nombre del cliente es obligatorio.");
      const idk = f.id.value.trim().toLowerCase();
      if (idk && S().clients.some((c) => c.uid !== draft.uid && c.id.trim().toLowerCase() === idk)) problems.push(`Ya existe otro cliente con el ID ${f.id.value.trim()}.`);
      draft.contacts.forEach((ct, i) => {
        if (ct.phone && !validatePhone(ct.phone, S().config.defaultCountryCode).ok) problems.push(`Contacto ${i + 1}: teléfono no válido (${validatePhone(ct.phone, S().config.defaultCountryCode).reason}).`);
        if (ct.email && !isValidEmail(ct.email)) problems.push(`Contacto ${i + 1}: correo no válido.`);
      });
      errs.replaceChildren(problems.length ? h("div", { class: "alert err" }, h("ul", {}, problems.map((p) => h("li", { text: p })))) : "");
      if (problems.length) return;
      const now = new Date().toISOString();
      Object.assign(draft, { name: f.name.value.trim(), id: f.id.value.trim(), legalName: f.legalName.value.trim(), zone: f.zone.value.trim(), owner: f.owner.value.trim(), notes: f.notes.value.trim(), updatedAt: now, createdAt: draft.createdAt || now });
      if (draft.contacts.length && !draft.contacts.some((c) => c.primary)) draft.contacts[0].primary = true;
      const wasNew = !store.state.clients.some((c) => c.uid === draft.uid);
      store.commit((d) => { const i = d.clients.findIndex((c) => c.uid === draft.uid); if (i >= 0) d.clients[i] = draft; else d.clients.push(draft); });
      track(wasNew ? "client_create" : "client_edit");
      dlg.close(); drawTable(); toast("Cliente guardado");
    });
  }

  const undoBtn = h("button", { class: "btn btn-ghost", type: "button", text: "↶ Deshacer última importación", hidden: !ctx.lastImportUndo, onclick: async () => {
    if (!(await confirmDialog({ title: "Deshacer importación", message: "Se restaurarán los clientes tal como estaban antes de la última importación de esta sesión. Los cambios de seguimiento posteriores a ella no se tocan.", confirmText: "Deshacer", danger: true }))) return;
    store.commit((d) => { d.clients = ctx.lastImportUndo; });
    ctx.lastImportUndo = null; undoBtn.hidden = true; track("import_undo"); drawTable(); toast("Importación deshecha");
  } });

  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Clientes y contactos" }), h("p", { text: "Base de clientes y directorio de teléfonos. Un cliente puede tener varios contactos." })),
      h("div", { class: "actions" }, undoBtn, h("button", { class: "btn btn-ghost", type: "button", text: "+ Nuevo cliente", onclick: () => openEdit(null) }), h("button", { class: "btn btn-ghost", type: "button", text: "Agregar o sincronizar clientes", onclick: () => openImport(ctx, () => { undoBtn.hidden = !ctx.lastImportUndo; drawTable(); }) }), h("button", { class: "btn btn-primary", type: "button", text: "📞 Importar teléfonos de contacto", onclick: () => openImport(ctx, () => { undoBtn.hidden = !ctx.lastImportUndo; drawTable(); }, "directory") }))),
    h("div", { class: `alert ${S().clients.some((c) => c.contacts.some((x) => x.phone)) ? "info" : "warn"}`, id: "phoneStat", text: phoneStat() }),
    h("div", { class: "card" }, field("Buscar", search), tableHost),
  );
  drawTable();
}

function phoneStat() {
  const cs = store0().clients, n = cs.filter((c) => c.contacts.some((x) => x.phone)).length;
  return n ? `${n} de ${cs.length} clientes tienen teléfono guardado.` : "Ningún cliente tiene teléfono todavía. Pulsa «Importar teléfonos de contacto» y sube tu Excel con nombre y celular.";
}
let store0 = () => ({ clients: [] });

/** Cambia el comercial de los clientes y mantiene coherente el seguimiento ya existente (queda en su historial). */
export function reassignOwners(draft, uids, owner) {
  const set = new Set(uids), now = new Date().toISOString();
  for (const c of draft.clients) {
    if (!set.has(c.uid) || (c.owner || "") === owner) continue;
    c.owner = owner; c.updatedAt = now;
    const fu = draft.followups[c.uid];
    if (fu && (fu.owner || "") !== owner) draft.followups[c.uid] = updateFollowup(fu, { owner }, { by: draft.config.commercial.name, statuses: draft.config.statuses });
  }
}

export function commercials(state) {
  const set = new Set(state.config.commercials || []);
  if (state.config.commercial.name) set.add(state.config.commercial.name);
  state.clients.forEach((c) => c.owner && set.add(c.owner));
  Object.values(state.followups).forEach((f) => f.owner && set.add(f.owner));
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

// ---------------------------------------------------------------------------------------------
// Asistente de importación / sincronización

export function openImport(ctx, onDone, presetKind = "") {
  const { store, XLSX } = ctx;
  const body = h("div");
  // replaceChildren(null) escribiría la palabra «null»: se filtran los vacíos.
  const setBody = (...k) => body.replaceChildren(...k.flat().filter((x) => x !== null && x !== undefined && x !== false));
  const dlg = openDialog("Agregar o sincronizar clientes", body, { wide: true });
  const W = { kind: presetKind || "clients", wb: null, sheet: "", matrix: [], det: null, mapping: {}, headerRow: 0, base: [], items: [], owner: "", overwrite: false, fileName: "", tab: "all" };

  function templateFile() {
    const aoa = W.kind === "directory"
      ? [["Cliente", "ID cliente", "Nombre contacto", "Celular", "Correo"], ["Nombre exacto del cliente", "", "Persona de contacto", "3001234567", ""]]
      : [["Cliente", "ID cliente", "Celular", "Localidad", "Comercial"], ["Nombre del cliente", "ABC001", "3001234567", "Chapinero", ""]];
    downloadWorkbook(XLSX, buildSimpleWorkbook(XLSX, aoa, "Hoja1", [30, 14, 24, 16, 28]), W.kind === "directory" ? "plantilla-telefonos.xlsx" : "plantilla-clientes.xlsx");
  }
  function step1() {
    const fileIn = h("input", { type: "file", id: "impfile", accept: ".xlsx,.xls,.csv" });
    const status = h("div", { "aria-live": "polite" });
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files?.[0]; if (!f) return;
      if (f.size > MAX_BYTES) { status.replaceChildren(h("div", { class: "alert err", text: "El archivo supera 10 MB. Divide la base en archivos más pequeños." })); return; }
      status.replaceChildren(h("span", { class: "spinner", "aria-hidden": "true" }), " Leyendo archivo…");
      try {
        await new Promise((r) => setTimeout(r, 30)); // permite pintar el indicador
        const buf = await f.arrayBuffer();
        W.wb = XLSX.read(buf, { type: "array", cellNF: true, cellDates: true });
        W.fileName = f.name; W.sheet = W.wb.SheetNames[0];
        loadSheet();
        // Si las columnas se reconocen con seguridad, se salta directo al resumen (se puede volver a corregir).
        if (!W.det.needsReview && mappingIsUsable(W.mapping, W.kind)) step3(); else step2();
      } catch (e) {
        status.replaceChildren(h("div", { class: "alert err", text: "No se pudo leer el archivo. Verifica que sea un Excel (.xlsx/.xls) válido y no esté protegido con contraseña." }));
      }
    });
    const dirHelp = h("div", { class: "alert info" },
      h("strong", { text: "Cómo funciona" }),
      h("ol", {}, h("li", { text: "Sube un Excel con una columna del nombre del cliente (o su ID) y otra con el celular." }),
        h("li", { text: "La aplicación une cada teléfono con su cliente por ID o por nombre." }),
        h("li", { text: "Desde ese momento, al elegir el cliente en el Generador, su número aparece solo." })),
      h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Descargar Excel de ejemplo", onclick: templateFile }));
    setBody(
      presetKind ? (presetKind === "directory" ? dirHelp : h("div", { class: "alert info" }, "Sube tu base de clientes: mínimo el nombre (o ID). Si trae celular y correo, también se guardan como contacto.", " ", h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Descargar Excel de ejemplo", onclick: templateFile })))
        : h("fieldset", { class: "card" }, h("legend", { text: "¿Qué vas a importar?" }),
          radio("kind", "directory", "Teléfonos de contacto (los une con clientes ya registrados)", false), radio("kind", "clients", "Base de clientes (crea clientes nuevos y actualiza los existentes)", true)),
      field("Archivo Excel", fileIn, "Se procesa en tu navegador; los datos no se envían a ningún servidor."),
      status);
    body.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener("change", () => (W.kind = r.value)));
  }
  function radio(name, value, label, checked) {
    const id = `r-${value}`;
    return h("div", { class: "check" }, h("input", { type: "radio", name, value, id, checked }), h("label", { for: id, text: label }));
  }
  function loadSheet() {
    W.matrix = sheetToMatrix(XLSX, W.wb, W.sheet);
    W.det = detectMapping(W.matrix, { kind: W.kind });
    W.mapping = { ...W.det.mapping }; W.headerRow = W.det.headerRow;
  }

  function step2() {
    const det = W.det;
    const headers = (W.matrix[W.headerRow] || []).map((x) => String(x ?? "").trim());
    const sels = {};
    const rows = Object.entries(FIELD_LABELS).map(([k, label]) => {
      const s = h("select", { "aria-label": `Columna para ${label}` }, h("option", { value: "-1", text: "— No usar —" }), headers.map((hd, i) => h("option", { value: String(i), text: `${colName(i)} · ${hd || "(vacío)"}`, selected: W.mapping[k] === i })));
      s.value = W.mapping[k] === undefined ? "-1" : String(W.mapping[k]);
      s.addEventListener("change", () => { if (s.value === "-1") delete W.mapping[k]; else W.mapping[k] = Number(s.value); refreshNext(); });
      sels[k] = s;
      const req = (W.kind === "directory" && k === "phone") || k === "name";
      return h("tr", {}, h("th", { scope: "row", text: label + (req ? " *" : "") }), h("td", {}, s),
        h("td", { class: "muted", text: (W.matrix[W.headerRow + 1] || [])[W.mapping[k]] ?? "" }));
    });
    const next = h("button", { class: "btn btn-primary", type: "button", text: "Revisar cambios →", onclick: step3 });
    const hr = h("input", { type: "number", min: 1, max: Math.max(1, W.matrix.length), value: W.headerRow + 1, style: "max-width:110px", onchange: (e) => { W.headerRow = Math.max(0, Number(e.target.value) - 1); const d2 = detectMapping(W.matrix.slice(W.headerRow), { kind: W.kind, scanRows: 1 }); W.mapping = { ...d2.mapping }; step2(); } });
    function refreshNext() {
      const ok = mappingIsUsable(W.mapping, W.kind);
      next.disabled = !ok;
      msgBox.replaceChildren(ok ? "" : h("div", { class: "alert err" }, W.kind === "directory" ? "Indica al menos la columna del teléfono y la del cliente o su ID." : "Indica al menos la columna del nombre del cliente o del ID."));
    }
    const msgBox = h("div");
    setBody(
      h("p", {}, h("strong", { text: W.fileName }), ` · ${W.matrix.length} filas`),
      det.needsReview ? h("div", { class: "alert warn", text: "No pude identificar todas las columnas con seguridad. Revisa y corrige el mapeo." }) : h("div", { class: "alert ok", text: "Columnas reconocidas. Revisa que sean correctas antes de continuar." }),
      W.wb.SheetNames.length > 1 ? field("Hoja", select(W.wb.SheetNames, W.sheet, { onchange: (e) => { W.sheet = e.target.value; loadSheet(); step2(); } })) : null,
      field("Fila de encabezados", hr),
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Campo", "Columna del archivo", "Ejemplo (1ª fila)"].map((t) => h("th", { scope: "col", text: t })))), h("tbody", {}, rows))),
      msgBox,
      h("div", { class: "actions end" }, h("button", { class: "btn btn-ghost", type: "button", text: "← Otro archivo", onclick: step1 }), next));
    refreshNext();
  }

  function step3() {
    const recs = extractRecords(W.matrix, W.headerRow, W.mapping);
    if (!recs.length) { toast("El archivo no tiene filas de datos debajo de los encabezados", "err"); return; }
    W.base = planImport(store.state.clients, recs, { kind: W.kind, defaultCountryCode: store.state.config.defaultCountryCode });
    // Si el archivo no trae columna de comercial, por defecto quedan a nombre de quien importa (se puede cambiar o vaciar).
    W.owner = W.kind === "clients" && W.mapping.owner === undefined ? store.state.config.commercial.name || "" : "";
    W.overwrite = false;
    recompute();
    drawPlan();
  }

  const recompute = () => { W.items = assignOwner(store.state.clients, W.base, W.owner, { overwrite: W.overwrite }); };

  function ownerCard() {
    const dl = h("datalist", { id: "imp-owners" }, commercials(store.state).map((o) => h("option", { value: o })));
    const name = W.owner.trim();
    const assigned = name ? W.items.filter((i) => (i.status === "new" && i.newClient?.owner === name) || (i.status === "update" && i.changes.some((c) => c.field === "owner" && c.new === name && c.apply))).length : 0;
    const other = name ? W.items.filter((i) => i.status === "update" && i.changes.some((c) => c.field === "owner" && c.new === name && c.old && !c.apply)).length : 0;
    return h("div", { class: "card", style: "margin-bottom:.75rem" }, dl,
      h("h3", { text: "¿A quién pertenecen estos clientes?" }),
      h("div", { class: "row" },
        field("Asignar a (comercial)", h("input", { type: "text", list: "imp-owners", value: W.owner, placeholder: W.mapping.owner !== undefined ? "Vacío = usar la columna de comercial del archivo" : "Nombre del comercial (opcional)", onchange: (e) => { W.owner = e.target.value; recompute(); drawPlan(); } }),
          W.mapping.owner !== undefined ? "Tu archivo tiene columna de comercial; si escribes un nombre aquí, ese nombre manda sobre la columna." : "Se verá en la lista de clientes y podrás filtrar y reasignar después."),
        h("div", { class: "field" }, h("label", { text: "\u00a0" }), h("div", { class: "check" }, h("input", { type: "checkbox", id: "imp-over", checked: W.overwrite, onchange: (e) => { W.overwrite = e.target.checked; recompute(); drawPlan(); } }), h("label", { for: "imp-over", text: "También reasignar clientes que ya tienen otro comercial" })))),
      name ? h("p", { class: "hint", text: `${assigned} cliente(s) quedarán a nombre de «${name}»${other ? `; ${other} ya tienen otro comercial y NO se tocan (marca la casilla para reasignarlos)` : ""}.` }) : null);
  }

  function drawPlan() {
    const sum = summarizePlan(W.items);
    const tabs = [["all", "Todo", W.items.length], ["new", "Nuevos", sum.new], ["update", "Actualizados", sum.updated], ["duplicate", "Duplicados", sum.duplicates], ["review", "Revisión manual", sum.review], ["error", "Errores", sum.errors]];
    const shown = W.items.filter((i) => W.tab === "all" || i.status === W.tab);
    const applicable = W.items.filter((i) => i.status === "new" || (i.status === "update" && i.changes.some((c) => c.apply))).length;
    const rows = shown.slice(0, 200).map((it) => {
      const idx = W.items.indexOf(it);
      return h("tr", {},
        h("td", { class: "nowrap", text: it.row }),
        h("td", {}, h("span", { class: `badge ${it.status === "new" || it.status === "update" ? "ok" : it.status === "error" ? "err" : it.status === "review" ? "warn" : ""}`, text: statusLabel(it.status) })),
        h("td", {}, h("strong", { text: it.clientName || it.record.name || it.record.id || "—" }), h("div", { class: "muted", text: it.message }), it.warnings.map((w) => h("div", { class: "muted", text: `⚠ ${w}` }))),
        h("td", {}, details(it, idx)));
    });
    setBody(
      h("div", { class: "kpis" }, [["Clientes nuevos", sum.new], ["Clientes actualizados", sum.updated], ["Contactos nuevos", sum.contactsNew], ["Duplicados", sum.duplicates], ["Errores", sum.errors], ["Revisión manual", sum.review]].map(([l, n]) => h("div", { class: "kpi" }, h("b", { text: String(n) }), h("span", { text: l })))),
      ownerCard(),
      sum.pendingConfirm ? h("div", { class: "alert info", text: `${sum.pendingConfirm} cambio(s) sobrescriben datos existentes y están sin marcar. Revisa y marca los que quieras aplicar.` }) : null,
      sum.review ? h("div", { class: "alert warn", text: `${sum.review} fila(s) requieren decisión. Si no las resuelves se omitirán.` }) : null,
      h("div", { class: "tabs", role: "group", "aria-label": "Filtrar filas" }, tabs.map(([k, l, n]) => h("button", { type: "button", "aria-pressed": String(W.tab === k), text: `${l} (${n})`, onclick: () => { W.tab = k; drawPlan(); } }))),
      bulkBar(),
      shown.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Fila", "Resultado", "Cliente", "Detalle / acción"].map((t) => h("th", { scope: "col", text: t })))), h("tbody", {}, rows))) : emptyState("Nada en esta categoría", ""),
      shown.length > 200 ? h("p", { class: "muted", text: `Mostrando 200 de ${shown.length} filas (todas se procesan al confirmar).` }) : null,
      h("div", { class: "actions end" },
        h("button", { class: "btn btn-ghost", type: "button", text: "← Mapeo de columnas", onclick: step2 }),
        (sum.errors || sum.review || sum.warnings) ? h("button", { class: "btn btn-ghost", type: "button", text: "Descargar reporte de errores", onclick: () => downloadWorkbook(XLSX, buildSimpleWorkbook(XLSX, errorReportRows(W.items), "Errores de importación", [18, 18, 70, 30, 14, 24, 18, 28]), `errores-importacion-${new Date().toISOString().slice(0, 10)}.xlsx`) }) : null,
        h("button", { class: "btn btn-primary", type: "button", text: `Confirmar importación (${applicable} filas con cambios)`, disabled: applicable === 0, onclick: confirm })));
  }

  const unmatched = () => W.items.filter((i) => i.status === "review" && !i.candidates.length).length;
  function bulkBar() {
    const n = unmatched();
    if (!n) return null;
    return h("div", { class: "alert warn" },
      h("strong", { text: `${n} fila(s) no existen en tu base ni tienen nombres parecidos. ` }),
      "Puedes resolverlas todas de una vez: ",
      h("div", { class: "actions" },
        h("button", { class: "btn btn-primary btn-sm", type: "button", text: `Crearlas como clientes nuevos (${n})`, onclick: () => bulk("new") }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", text: `Ignorarlas (${n})`, onclick: () => bulk("skip") })));
  }
  function bulk(type) {
    const opts = { kind: W.kind, defaultCountryCode: store.state.config.defaultCountryCode };
    const growing = [...store.state.clients];
    W.base = W.base.map((it) => {
      if (it.status !== "review" || it.candidates.length) return it;
      if (type === "skip") return resolveReview(growing, it, { type: "skip" }, opts);
      // Si la misma empresa aparece dos veces en el archivo, la segunda se une a la primera (no se duplica).
      const nk = nameKey(it.record.name || it.record.legalName);
      const hit = growing.find((c) => nameKey(c.name) === nk);
      const out = hit ? resolveReview(growing, it, { type: "merge", uid: hit.uid }, opts) : resolveReview(growing, it, { type: "new" }, opts);
      if (out.status === "new" && out.newClient) growing.push(out.newClient);
      return out;
    });
    recompute();
    drawPlan();
  }

  function details(it, idx) {
    if (it.status === "review") {
      const opts = [{ value: "", label: "Decidir…" }, { value: "new", label: "Crear como cliente nuevo" }, ...it.candidates.map((c) => ({ value: `m:${c.uid}`, label: `Es el mismo que: ${c.name} (${c.id || "sin ID"})` })), { value: "skip", label: "Ignorar esta fila" }];
      return select(opts, "", { "aria-label": `Decisión para la fila ${it.row}`, onchange: (e) => {
        const v = e.target.value; if (!v) return;
        const res = v === "new" ? { type: "new" } : v === "skip" ? { type: "skip" } : { type: "merge", uid: v.slice(2) };
        W.base[idx] = resolveReview(store.state.clients, W.base[idx], res, { kind: W.kind, defaultCountryCode: store.state.config.defaultCountryCode });
        recompute();
        drawPlan();
      } });
    }
    if (it.status === "new") {
      const c = it.newClient;
      return h("div", {}, h("label", { class: "check" }, h("input", { type: "checkbox", checked: it.include !== false, onchange: (e) => { it.include = e.target.checked; drawPlan(); } }), " Crear"), h("div", { class: "muted", text: [c.id && `ID ${c.id}`, c.zone, ...c.contacts.map((x) => x.phone || x.email)].filter(Boolean).join(" · ") }));
    }
    if (it.status === "update") {
      return h("div", {}, it.changes.map((ch) => {
        const label = ch.kind === "field" ? `${fieldLabel(ch.field)}: ${ch.old || "(vacío)"} → ${ch.new}` : ch.kind === "contact-add" ? `Nuevo contacto: ${[ch.contact.name, ch.contact.phone, ch.contact.email].filter(Boolean).join(" · ")}` : `Contacto · ${fieldLabel(ch.field)}: ${ch.old || "(vacío)"} → ${ch.new}`;
        return h("label", { class: "check" }, h("input", { type: "checkbox", checked: ch.apply, onchange: (e) => { ch.apply = e.target.checked; drawPlan(); } }), h("span", { text: label }), !ch.apply && ch.old ? h("span", { class: "badge warn", text: "sobrescribe" }) : null);
      }));
    }
    return h("span", { class: "muted", text: "—" });
  }

  function confirm() {
    const before = store.state.clients;
    const { clients, stats } = applyPlan(before, W.items);
    ctx.lastImportUndo = before;
    const prevOwner = new Map(before.map((c) => [c.uid, c.owner || ""]));
    const changed = clients.filter((c) => prevOwner.has(c.uid) && prevOwner.get(c.uid) !== (c.owner || "")).map((c) => c.uid);
    store.commit((d) => {
      d.clients = clients;
      // Si cambió el comercial de un cliente que ya tenía seguimiento, el seguimiento queda con el nuevo.
      for (const uidv of changed) {
        const fu = d.followups[uidv], c = d.clients.find((x) => x.uid === uidv);
        if (fu && c) d.followups[uidv] = updateFollowup(fu, { owner: c.owner || "" }, { by: d.config.commercial.name, statuses: d.config.statuses });
      }
    });
    dlg.close(); onDone?.();
    if (W.kind === "directory") track("contacts_import", stats.contactsAdded); else track("clients_import", stats.created + stats.updated);
    const owned = W.owner.trim() ? ` · comercial: ${W.owner.trim()}` : "";
    toast(`Importación aplicada: ${stats.created} nuevos, ${stats.updated} actualizados, ${stats.contactsAdded} contactos agregados${owned}`, "ok", 6000);
  }
  step1();
}

function fieldLabel(f) {
  return ({ id: "ID", name: "Nombre", legalName: "Razón social", zone: "Zona", owner: "Comercial", notes: "Observaciones", phone: "Teléfono", email: "Correo" })[f] || f;
}
function colName(i) { let s = ""; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s; }
