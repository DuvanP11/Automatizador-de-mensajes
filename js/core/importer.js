// Importación y sincronización de clientes/contactos. Lógica pura: recibe matrices (filas de celdas)
// y devuelve un plan revisable. Nada se escribe en la base hasta llamar a applyPlan().
import { normalizeText, nameKey, idKey, digitsOnly, validatePhone, isValidEmail, uid, deepClone } from "./util.js";

export const FIELD_LABELS = {
  name: "Cliente / empresa",
  id: "ID cliente / compañía",
  phone: "Teléfono / WhatsApp",
  legalName: "Razón social",
  contactName: "Nombre del contacto",
  email: "Correo electrónico",
  zone: "Localidad / zona",
  owner: "Comercial asignado",
  notes: "Observaciones",
};

// Sinónimos ya normalizados con alnum(): minúsculas, sin tildes ni símbolos.
const SYNONYMS = {
  name: ["cliente", "nombrecliente", "nombredelcliente", "empresa", "nombreempresa", "nombredelaempresa", "nombrecomercial", "compania", "company", "companyname", "nombre"],
  id: ["id", "idcliente", "idcompania", "idcompañia", "companyid", "idempresa", "codigo", "codigocliente", "codcliente", "nit", "customerid", "clientid"],
  phone: ["telefono", "celular", "whatsapp", "numerodecontacto", "numerocontacto", "numero", "tel", "movil", "phone", "mobile", "telefonocontacto", "telefonodecontacto", "ntelefono", "numerodetelefono", "telefono1", "celular1"],
  legalName: ["razonsocial"],
  contactName: ["nombrecontacto", "nombredelcontacto", "contacto", "persona", "personacontacto", "responsable", "nombrecontactoprincipal"],
  email: ["correo", "email", "correoelectronico", "mail", "emailcontacto", "correocontacto"],
  zone: ["localidad", "zona", "barrio", "sector"],
  owner: ["comercial", "comercialasignado", "gestorcomercial", "asesor", "asesorcomercial", "ejecutivo", "responsablecomercial", "accountmanager"],
  notes: ["observaciones", "observacion", "notas", "nota", "comentarios", "comentario"],
};

export function alnum(v) {
  return normalizeText(v).replace(/[^a-z0-9]/g, "");
}

function scoreHeader(label, field) {
  const a = alnum(label);
  if (!a) return 0;
  if (SYNONYMS[field].includes(a)) return 1;
  // Coincidencia parcial: el encabezado contiene un sinónimo largo ("Teléfono de contacto 2").
  for (const s of SYNONYMS[field]) if (s.length >= 5 && a.includes(s)) return 0.6;
  return 0;
}

/** Convierte una celda de SheetJS a texto sin perder ceros ni pasar a notación científica. */
export function cellToText(cell) {
  if (cell == null) return "";
  if (typeof cell !== "object") return String(cell).trim();
  const v = cell.v;
  if (v == null) return "";
  if (cell.t === "n") {
    // Formatos tipo "0000" conservan ceros iniciales: usar el texto formateado.
    if (typeof cell.z === "string" && /^0+$/.test(cell.z) && cell.w) return String(cell.w).trim();
    if (Number.isInteger(v)) return v.toFixed(0);
    return String(v);
  }
  if (cell.t === "d" || v instanceof Date) return (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
  return String(cell.w ?? v).trim();
}

/** Lee la primera hoja (o la indicada) como matriz de textos. `XLSX` se inyecta (navegador o Node). */
export function sheetToMatrix(XLSX, workbook, sheetName) {
  const name = sheetName ?? workbook.SheetNames[0];
  const ws = workbook.Sheets[name];
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const out = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) row.push(cellToText(ws[XLSX.utils.encode_cell({ r, c })]));
    out.push(row);
  }
  return out;
}

/** Detecta fila de encabezados y mapeo columna→campo. */
export function detectMapping(matrix, { kind = "clients", scanRows = 20 } = {}) {
  let best = { score: 0, headerRow: 0 };
  const limit = Math.min(scanRows, matrix.length);
  for (let r = 0; r < limit; r++) {
    let score = 0;
    for (const cell of matrix[r]) {
      let top = 0;
      for (const f of Object.keys(SYNONYMS)) top = Math.max(top, scoreHeader(cell, f));
      score += top;
    }
    if (score > best.score) best = { score, headerRow: r };
  }
  const headers = (matrix[best.headerRow] || []).map((h) => String(h ?? "").trim());
  const mapping = {};
  const confidence = {};
  const used = new Set();
  const candidates = [];
  headers.forEach((h, i) => {
    for (const f of Object.keys(SYNONYMS)) {
      const s = scoreHeader(h, f);
      if (s > 0) candidates.push({ f, i, s });
    }
  });
  candidates.sort((a, b) => b.s - a.s || a.i - b.i);
  for (const c of candidates) {
    if (mapping[c.f] !== undefined || used.has(c.i)) continue;
    mapping[c.f] = c.i;
    confidence[c.f] = c.s;
    used.add(c.i);
  }
  // Si solo existe "Razón social", sirve como nombre del cliente.
  if (mapping.name === undefined && mapping.legalName !== undefined) {
    mapping.name = mapping.legalName;
    confidence.name = confidence.legalName;
    delete mapping.legalName;
    delete confidence.legalName;
  }
  const required = requiredFields(kind);
  const missing = required.filter((f) => mapping[f] === undefined);
  const weak = required.filter((f) => mapping[f] !== undefined && confidence[f] < 1);
  return {
    headerRow: best.score > 0 ? best.headerRow : 0,
    headers,
    mapping,
    confidence,
    missing,
    needsReview: best.score === 0 || missing.length > 0 || weak.length > 0,
  };
}

export function requiredFields(kind) {
  // Base: basta con identificar a la empresa (nombre o ID). Directorio: además un teléfono.
  return kind === "directory" ? ["phone"] : ["name"];
}

/** ¿Cumple el mapeo lo mínimo para continuar? */
export function mappingIsUsable(mapping, kind = "clients") {
  const hasIdentity = mapping.name !== undefined || mapping.id !== undefined;
  if (kind === "directory") return hasIdentity && mapping.phone !== undefined;
  return hasIdentity;
}

/** Aplica el mapeo y devuelve registros normalizados (texto plano) con su número de fila en Excel. */
export function extractRecords(matrix, headerRow, mapping) {
  const rows = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const rec = { rowNum: r + 1 };
    let any = false;
    for (const f of Object.keys(FIELD_LABELS)) {
      const idx = mapping[f];
      const val = idx === undefined || idx < 0 ? "" : String(row[idx] ?? "").trim();
      rec[f] = val;
      if (val) any = true;
    }
    if (any) rows.push(rec);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Plan de sincronización

function phoneKey(p) {
  const d = digitsOnly(p);
  return d.length >= 10 ? d.slice(-10) : d; // 573001234567 ≡ 3001234567
}

function indexClients(clients) {
  const byId = new Map();
  const byName = new Map();
  const add = (map, k, c) => {
    if (!k) return;
    if (!map.has(k)) map.set(k, []);
    const list = map.get(k);
    if (!list.includes(c)) list.push(c);
  };
  for (const c of clients) {
    add(byId, idKey(c.id), c);
    add(byName, nameKey(c.name), c);
    if (c.legalName) add(byName, nameKey(c.legalName), c);
  }
  return { byId, byName, add };
}

function emptyItem(rec) {
  return { row: rec.rowNum, record: rec, status: "error", message: "", clientUid: null, clientName: rec.name || rec.legalName || "", newClient: null, changes: [], candidates: [], warnings: [], resolution: null };
}

function fieldChange(client, field, value) {
  const old = client[field] ?? "";
  if (!value || value === old) return null;
  if (normalizeText(old) === normalizeText(value) && field !== "id") return null;
  return { kind: "field", field, old, new: value, apply: !old };
}

function contactChanges(client, rec, phoneInfo, warnings) {
  const changes = [];
  const hasPhone = !!rec.phone && phoneInfo.ok;
  const email = rec.email && isValidEmail(rec.email) ? rec.email.trim() : "";
  if (rec.email && !email) warnings.push(`Correo inválido ("${rec.email}") — se omitió`);
  if (!hasPhone && !email && !rec.contactName) return changes;
  const contacts = client.contacts || [];
  const pk = hasPhone ? phoneKey(rec.phone) : "";
  const byPhone = pk ? contacts.find((c) => phoneKey(c.phone) === pk) : null;
  const byName = !byPhone && rec.contactName ? contacts.find((c) => nameKey(c.name) === nameKey(rec.contactName)) : null;
  if (byPhone) {
    if (email && !byPhone.email) changes.push({ kind: "contact-replace", cid: byPhone.cid, field: "email", old: "", new: email, apply: true });
    else if (email && normalizeText(byPhone.email) !== normalizeText(email)) changes.push({ kind: "contact-replace", cid: byPhone.cid, field: "email", old: byPhone.email, new: email, apply: false });
    if (rec.contactName && !byPhone.name) changes.push({ kind: "contact-replace", cid: byPhone.cid, field: "name", old: "", new: rec.contactName, apply: true });
    return changes;
  }
  if (byName && hasPhone) {
    // Mismo contacto, otro número: es un reemplazo y exige confirmación explícita.
    changes.push({ kind: "contact-replace", cid: byName.cid, field: "phone", old: byName.phone, new: rec.phone, apply: !byName.phone });
    if (email && !byName.email) changes.push({ kind: "contact-replace", cid: byName.cid, field: "email", old: "", new: email, apply: true });
    return changes;
  }
  if (!hasPhone) {
    if (!email) return changes;
    if (contacts.some((c) => normalizeText(c.email) === normalizeText(email))) return changes;
    const target = byName || contacts.find((c) => !c.email);
    if (target) changes.push({ kind: "contact-replace", cid: target.cid, field: "email", old: target.email || "", new: email, apply: !target.email });
    else changes.push({ kind: "contact-add", contact: { cid: uid("ct"), name: rec.contactName, phone: "", email }, apply: true });
    return changes;
  }
  changes.push({ kind: "contact-add", contact: { cid: uid("ct"), name: rec.contactName, phone: rec.phone, email }, apply: true });
  return changes;
}

/** Simula en la copia de trabajo los cambios propuestos para detectar repetidos dentro del mismo archivo. */
function simulate(client, changes) {
  for (const ch of changes) {
    if (ch.kind === "field") client[ch.field] = ch.new;
    else if (ch.kind === "contact-add") (client.contacts ||= []).push({ ...ch.contact });
    else if (ch.kind === "contact-replace") {
      const ct = (client.contacts || []).find((c) => c.cid === ch.cid);
      if (ct) ct[ch.field] = ch.new;
    }
  }
}

const STOP = new Set(["sas", "ltda", "s", "a", "de", "del", "la", "el", "y", "e", "los", "las", "cia", "co", "sa", "limitada"]);
function tokens(v) { return nameKey(v).split(" ").filter((t) => t && !STOP.has(t)); }

/** Clientes con nombre parecido (para sugerir, nunca para fusionar solos). */
export function similarClients(clients, name, max = 5) {
  const a = tokens(name);
  if (!a.length) return [];
  const aKey = a.join(" ");
  const scored = [];
  for (const c of clients) {
    const b = tokens(c.name);
    if (!b.length) continue;
    const bKey = b.join(" ");
    const common = a.filter((t) => b.includes(t)).length;
    const jacc = common / (a.length + b.length - common);
    const contains = aKey.length >= 5 && bKey.length >= 5 && (aKey.includes(bKey) || bKey.includes(aKey));
    const score = contains ? Math.max(0.8, jacc) : jacc;
    if (score >= 0.5) scored.push({ c, score });
  }
  return scored.sort((x, y) => y.score - x.score).slice(0, max).map((x) => x.c);
}

function summarize(c) {
  return { uid: c.uid, name: c.name, id: c.id };
}

function planRecord(rec, ctx, force) {
  const { kind, work, index, cc } = ctx;
  const item = emptyItem(rec);
  const phoneInfo = rec.phone ? validatePhone(rec.phone, cc) : { ok: false, reason: "Sin teléfono" };
  const name = rec.name || rec.legalName;

  if (!name && !rec.id) {
    item.message = "Falta el nombre y el ID del cliente";
    return item;
  }
  if (kind === "directory") {
    if (!rec.phone && !rec.email) { item.message = "Falta el teléfono"; return item; }
    if (rec.phone && !phoneInfo.ok && !isValidEmail(rec.email)) { item.message = `Teléfono inválido (${phoneInfo.reason})`; return item; }
  } else if (rec.phone && !phoneInfo.ok) {
    item.warnings.push(`Teléfono omitido (${phoneInfo.reason})`);
  }

  // 1) Resolver el cliente destino.
  let target = null;
  let created = false;
  if (force?.type === "new") created = true;
  else if (force?.type === "merge") target = work.find((c) => c.uid === force.uid) || null;
  else {
    const k = idKey(rec.id);
    const idHits = k ? index.byId.get(k) || [] : [];
    if (idHits.length > 1) {
      item.status = "review";
      item.message = "El ID coincide con más de un cliente existente";
      item.candidates = idHits.map(summarize);
      return item;
    }
    if (idHits.length === 1) target = idHits[0];
    else {
      const nk = nameKey(name);
      const nameHits = nk ? index.byName.get(nk) || [] : [];
      if (nameHits.length > 1) {
        item.status = "review";
        item.message = "El nombre coincide con varios clientes: elige a cuál corresponde";
        item.candidates = nameHits.map(summarize);
        return item;
      }
      if (nameHits.length === 1) {
        const hit = nameHits[0];
        if (k && hit.id && idKey(hit.id) !== k) {
          // Mismo nombre pero ID distinto: podrían ser empresas diferentes. No se fusionan solas.
          item.status = "review";
          item.message = `Mismo nombre que un cliente con otro ID (${hit.id} ≠ ${rec.id}). Revisa si es la misma empresa`;
          item.candidates = [summarize(hit)];
          return item;
        }
        target = hit;
      } else if (kind === "directory" && !force) {
        item.status = "review";
        const similar = similarClients(work, name);
        item.candidates = similar.map(summarize);
        item.message = similar.length
          ? "No hay un cliente con ese nombre exacto. ¿Es alguno de los parecidos?"
          : "El cliente no existe en la base. Puedes crearlo o ignorar la fila";
        return item;
      }
    }
  }

  if (!target && !name) { item.message = "Cliente nuevo sin nombre (solo trae ID)"; return item; }

  // 2) Cliente nuevo.
  if (!target) {
    const now = new Date().toISOString();
    const client = {
      uid: uid("cl"), id: rec.id, name, legalName: rec.legalName && rec.legalName !== name ? rec.legalName : "",
      zone: rec.zone, owner: rec.owner, notes: rec.notes, contacts: [], createdAt: now, updatedAt: now,
    };
    const ch = contactChanges(client, rec, phoneInfo, item.warnings);
    simulate(client, ch);
    if (client.contacts.length) client.contacts[0].primary = true;
    item.status = "new";
    item.newClient = client;
    item.clientUid = client.uid;
    item.clientName = client.name;
    item.message = "Cliente nuevo";
    work.push(client);
    index.add(index.byId, idKey(client.id), client);
    index.add(index.byName, nameKey(client.name), client);
    return item;
  }

  // 3) Cliente existente: proponer cambios.
  item.clientUid = target.uid;
  item.clientName = target.name;
  const changes = [];
  const pushIf = (c) => c && changes.push(c);
  pushIf(fieldChange(target, "id", rec.id));
  pushIf(fieldChange(target, "name", rec.name));
  pushIf(fieldChange(target, "legalName", rec.legalName && rec.legalName !== target.name ? rec.legalName : ""));
  pushIf(fieldChange(target, "zone", rec.zone));
  pushIf(fieldChange(target, "owner", rec.owner));
  pushIf(fieldChange(target, "notes", rec.notes));
  changes.push(...contactChanges(target, rec, phoneInfo, item.warnings));
  item.changes = changes;
  if (changes.length) {
    item.status = "update";
    item.message = "Actualiza un cliente existente";
    simulate(target, changes);
    if (changes.some((c) => c.kind === "contact-add") && !(target.contacts || []).some((c) => c.primary) && target.contacts?.length) target.contacts[0].primary = true;
  } else {
    item.status = "duplicate";
    item.message = ctx.seenKeys.has(item.clientUid) ? "Repetido dentro del archivo" : "Ya existe sin cambios";
  }
  return item;
}

/** Genera el plan completo. `clients` no se modifica. */
export function planImport(clients, records, { kind = "clients", defaultCountryCode = "57" } = {}) {
  const work = deepClone(clients);
  const ctx = { kind, work, index: indexClients(work), cc: defaultCountryCode, seenKeys: new Set() };
  const items = [];
  for (const rec of records) {
    const item = planRecord(rec, ctx, null);
    if (item.clientUid) ctx.seenKeys.add(item.clientUid);
    items.push(item);
  }
  return items;
}

/** Re-planifica una fila en revisión con la decisión del usuario: {type:'new'}|{type:'merge',uid}|{type:'skip'}. */
export function resolveReview(clients, item, resolution, { kind = "clients", defaultCountryCode = "57" } = {}) {
  if (resolution.type === "skip") return { ...item, resolution, status: "duplicate", message: "Ignorada por el usuario", changes: [], newClient: null };
  const work = deepClone(clients);
  const ctx = { kind, work, index: indexClients(work), cc: defaultCountryCode, seenKeys: new Set() };
  const out = planRecord(item.record, ctx, resolution);
  out.resolution = resolution;
  return out;
}

export function summarizePlan(items) {
  const s = { new: 0, updated: 0, contactsNew: 0, duplicates: 0, errors: 0, review: 0, pendingConfirm: 0, warnings: 0 };
  for (const it of items) {
    if (it.status === "new") { s.new++; if (it.newClient?.contacts?.length) s.contactsNew += it.newClient.contacts.length; }
    else if (it.status === "update") { s.updated++; s.contactsNew += it.changes.filter((c) => c.kind === "contact-add").length; s.pendingConfirm += it.changes.filter((c) => !c.apply).length; }
    else if (it.status === "duplicate") s.duplicates++;
    else if (it.status === "error") s.errors++;
    else if (it.status === "review") s.review++;
    s.warnings += it.warnings.length;
  }
  return s;
}

/** Aplica el plan sobre una copia de la base. Solo se escriben cambios con apply=true; la revisión pendiente se omite. */
export function applyPlan(clients, items, now = new Date().toISOString()) {
  const out = deepClone(clients);
  const byUid = new Map(out.map((c) => [c.uid, c]));
  const stats = { created: 0, updated: 0, contactsAdded: 0, fieldsChanged: 0, skipped: 0 };
  for (const it of items) {
    if (it.status === "new" && it.newClient && it.include !== false) {
      const c = deepClone(it.newClient);
      out.push(c);
      byUid.set(c.uid, c);
      stats.created++;
      stats.contactsAdded += c.contacts.length;
      continue;
    }
    if (it.status !== "update") { stats.skipped++; continue; }
    const c = byUid.get(it.clientUid);
    if (!c) { stats.skipped++; continue; }
    let touched = false;
    for (const ch of it.changes) {
      if (!ch.apply) continue;
      if (ch.kind === "field") { c[ch.field] = ch.new; stats.fieldsChanged++; touched = true; }
      else if (ch.kind === "contact-add") {
        c.contacts ||= [];
        c.contacts.push({ ...ch.contact, primary: c.contacts.length === 0 });
        stats.contactsAdded++; touched = true;
      } else if (ch.kind === "contact-replace") {
        const ct = (c.contacts || []).find((x) => x.cid === ch.cid);
        if (ct) { ct[ch.field] = ch.new; stats.fieldsChanged++; touched = true; }
      }
    }
    if (touched) { c.updatedAt = now; stats.updated++; }
  }
  return { clients: out, stats };
}

const STATUS_LABEL = { new: "Nuevo", update: "Actualizado", duplicate: "Duplicado", error: "Error", review: "Requiere revisión" };
export function statusLabel(s) { return STATUS_LABEL[s] || s; }

/** Filas para el reporte de errores descargable (texto plano, listo para Excel). */
export function errorReportRows(items) {
  const head = ["Fila en el archivo", "Estado", "Motivo", "Cliente", "ID", "Contacto", "Teléfono", "Correo"];
  const rows = [head];
  for (const it of items) {
    const bad = it.status === "error" || (it.status === "review" && !it.resolution);
    if (!bad && !it.warnings.length) continue;
    const r = it.record;
    rows.push([
      it.row,
      bad ? statusLabel(it.status) : "Advertencia",
      bad ? [it.message, ...it.warnings].join("; ") : it.warnings.join("; "),
      r.name || r.legalName, r.id, r.contactName, r.phone, r.email,
    ]);
  }
  return rows;
}
