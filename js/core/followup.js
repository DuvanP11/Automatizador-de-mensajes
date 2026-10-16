// Seguimiento comercial: registros por cliente con historial inmutable, filtros e indicadores.
import { uid, normalizeText, todayBogota } from "./util.js";

const TERMINAL = new Set(["closed", "not_interested"]);
const CONTACTED = new Set(["contacted", "contacted_no_reply", "responded", "interested", "validation", "hunter", "negotiation", "not_interested", "closed"]);
const RESPONDED = new Set(["responded", "interested", "validation", "hunter", "negotiation", "not_interested", "closed"]);

export function statusByKey(statuses, key) {
  return statuses.find((s) => s.key === key);
}
export function defaultStatusKey(statuses) {
  return (statuses.find((s) => s.stage === "pending" && s.active) || statuses.find((s) => s.stage === "pending") || statuses[0]).key;
}
export function stageOf(statuses, key) {
  return statusByKey(statuses, key)?.stage || "pending";
}

export function newFollowup(clientUid, statuses, { owner = "", now = new Date().toISOString() } = {}) {
  return {
    clientUid, status: defaultStatusKey(statuses), lastContactAt: "", nextFollowUpAt: "", owner,
    notInterestedReason: "", nextActionOwner: "", model: "", createdAt: now, updatedAt: now, history: [],
  };
}

/**
 * Devuelve un seguimiento NUEVO con el cambio aplicado y los eventos añadidos al historial.
 * patch: {status, lastContactAt, nextFollowUpAt, owner, notInterestedReason, nextActionOwner, model, note}
 * Nunca se borran ni reescriben eventos anteriores.
 */
export function updateFollowup(fu, patch, { by = "", now = new Date().toISOString(), statuses = null } = {}) {
  const next = { ...fu, history: [...(fu.history || [])] };
  const ev = (type, extra) => next.history.push({ id: uid("ev"), at: now, by, type, ...extra });
  if (patch.status !== undefined && patch.status !== fu.status) ev("status", { from: fu.status, to: patch.status, note: patch.note || "" });
  else if (patch.note) ev("note", { note: patch.note });
  for (const k of ["lastContactAt", "nextFollowUpAt", "owner", "notInterestedReason", "nextActionOwner", "model", "status"]) {
    if (patch[k] !== undefined && patch[k] !== fu[k]) {
      if (k === "nextFollowUpAt" || k === "owner" || k === "lastContactAt") ev("field", { field: k, from: fu[k] || "", to: patch[k] });
      next[k] = patch[k];
    }
  }
  const leavesPending = patch.status !== undefined && patch.status !== fu.status && (!statuses || stageOf(statuses, patch.status) !== "pending");
  if (leavesPending && !patch.lastContactAt && !fu.lastContactAt) {
    // Al salir de "pendiente" sin fecha explícita, la fecha del contacto es hoy (hora Colombia).
    next.lastContactAt = todayBogota(new Date(now));
  }
  next.updatedAt = now;
  return next;
}

export function isOverdue(fu, stage, today) {
  return !!fu.nextFollowUpAt && fu.nextFollowUpAt < today && !TERMINAL.has(stage);
}

/**
 * Construye filas (cliente + seguimiento) aplicando filtros.
 * Si hay rango de fechas, solo entran clientes con alguna gestión (evento del historial o último contacto) dentro del rango.
 */
export function buildRows({ clients, followups, statuses, filters = {}, today = todayBogota() }) {
  const q = normalizeText(filters.query || "");
  const rows = [];
  for (const client of clients) {
    const stored = followups[client.uid];
    const fu = stored || newFollowup(client.uid, statuses, { owner: client.owner || "", now: "" });
    const owner = fu.owner || client.owner || "";
    const stage = stageOf(statuses, fu.status);
    if (filters.owner && normalizeText(owner) !== normalizeText(filters.owner)) continue;
    if (filters.status && fu.status !== filters.status) continue;
    if (filters.zone && normalizeText(client.zone) !== normalizeText(filters.zone)) continue;
    if (filters.model && normalizeText(fu.model) !== normalizeText(filters.model)) continue;
    if (q && !normalizeText(client.name).includes(q) && !normalizeText(client.id).includes(q)) continue;
    if (filters.from || filters.to) {
      // Los eventos se guardan en UTC; se convierten al día calendario de Colombia para comparar.
      const dates = [...(fu.history || []).map((e) => todayBogota(new Date(e.at))), fu.lastContactAt].filter(Boolean);
      const inRange = dates.some((d) => (!filters.from || d >= filters.from) && (!filters.to || d <= filters.to));
      if (!inRange) continue;
    }
    rows.push({ client, fu, owner, stage, statusLabel: statusByKey(statuses, fu.status)?.label || fu.status, overdue: isOverdue(fu, stage, today), hasRecord: !!stored });
  }
  return rows;
}

export function sortRows(rows, by = "name", dir = 1) {
  const key = {
    name: (r) => normalizeText(r.client.name),
    lastContact: (r) => r.fu.lastContactAt || "",
    nextFollowUp: (r) => r.fu.nextFollowUpAt || "9999-99-99", // sin fecha va al final
    status: (r) => r.statusLabel,
    owner: (r) => normalizeText(r.owner),
  }[by] || ((r) => r.client.name);
  return [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * dir);
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const INDICATOR_DEFS = [
  { key: "total", label: "Total de clientes", def: "Clientes que cumplen los filtros aplicados." },
  { key: "pending", label: "Pendientes de contactar", def: "Estado actual con categoría «sin contactar» (incluye clientes aún sin seguimiento)." },
  { key: "contacted", label: "Contactos realizados", def: "Clientes con un estado posterior a «pendiente» salvo «No fue posible contactar»." },
  { key: "responded", label: "Respondieron", def: "Clientes contactados cuyo estado indica que hubo respuesta (no incluye «sin respuesta»)." },
  { key: "interested", label: "Interesados", def: "Estado actual = Interesado." },
  { key: "validation", label: "Pendientes de validación", def: "Estado actual = pendiente de validación de cobertura." },
  { key: "hunter", label: "Asignados a Hunter", def: "Estado actual = asignado a Hunter Comercial." },
  { key: "negotiation", label: "En negociación", def: "Estado actual = en negociación." },
  { key: "not_interested", label: "No interesados", def: "Estado actual = No interesado." },
  { key: "closed", label: "Implementados", def: "Estado actual = Cerrado / implementado." },
  { key: "overdue", label: "Seguimientos vencidos", def: "Próximo seguimiento anterior a hoy y cliente no cerrado ni «no interesado»." },
  { key: "upcoming", label: "Próximas actividades (7 días)", def: "Próximo seguimiento entre hoy y los siguientes 7 días." },
];

export function computeMetrics(rows, { today = todayBogota() } = {}) {
  const c = Object.fromEntries(INDICATOR_DEFS.map((d) => [d.key, 0]));
  const horizon = addDays(today, 7);
  for (const r of rows) {
    c.total++;
    if (r.stage === "pending") c.pending++;
    if (CONTACTED.has(r.stage)) c.contacted++;
    if (RESPONDED.has(r.stage)) c.responded++;
    if (r.stage === "interested") c.interested++;
    if (r.stage === "validation") c.validation++;
    if (r.stage === "hunter") c.hunter++;
    if (r.stage === "negotiation") c.negotiation++;
    if (r.stage === "not_interested") c.not_interested++;
    if (r.stage === "closed") c.closed++;
    if (r.overdue) c.overdue++;
    if (r.fu.nextFollowUpAt && r.fu.nextFollowUpAt >= today && r.fu.nextFollowUpAt <= horizon && !TERMINAL.has(r.stage)) c.upcoming++;
  }
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  const ratios = [
    { label: "Contactados sobre el total", value: pct(c.contacted, c.total), num: c.contacted, den: c.total, denLabel: "total de clientes" },
    { label: "Respondieron sobre contactados", value: pct(c.responded, c.contacted), num: c.responded, den: c.contacted, denLabel: "clientes contactados" },
    { label: "Interesados sobre contactados", value: pct(c.interested, c.contacted), num: c.interested, den: c.contacted, denLabel: "clientes contactados" },
    { label: "Implementados sobre contactados", value: pct(c.closed, c.contacted), num: c.closed, den: c.contacted, denLabel: "clientes contactados" },
  ];
  return { counts: c, ratios };
}

/** Pendientes accionables: vencidos, por contactar y próximos 7 días. */
export function pendingRows(rows, today = todayBogota()) {
  const horizon = addDays(today, 7);
  const out = [];
  for (const r of rows) {
    let reason = "";
    if (r.overdue) reason = "Seguimiento vencido";
    else if (r.stage === "pending") reason = "Pendiente de contactar";
    else if (r.fu.nextFollowUpAt && r.fu.nextFollowUpAt >= today && r.fu.nextFollowUpAt <= horizon && !TERMINAL.has(r.stage)) reason = "Próximo seguimiento (7 días)";
    if (reason) out.push({ ...r, reason });
  }
  return out;
}
