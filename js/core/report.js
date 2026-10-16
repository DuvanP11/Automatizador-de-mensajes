// Construcción del informe gerencial en Excel (SheetJS inyectado). Respeta los filtros aplicados en pantalla.
import { INDICATOR_DEFS, pendingRows } from "./followup.js";
import { todayBogota } from "./util.js";

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function dateCell(iso) {
  if (!iso) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  // Fecha local de Colombia como serial de Excel (sin husos horarios ocultos).
  const local = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? d.getTime() : d.getTime() - 5 * 3600 * 1000;
  return { t: "n", v: (local - EXCEL_EPOCH) / 86400000, z: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "dd/mm/yyyy" : "dd/mm/yyyy hh:mm" };
}
const text = (v) => ({ t: "s", v: String(v ?? "") });
const NA = "—"; // «No aplica» (distinto de vacío = «sin dato»)

export function describeFilters(filters, labels = {}) {
  const parts = [];
  if (filters.from || filters.to) parts.push(`Fechas: ${filters.from || "…"} a ${filters.to || "…"}`);
  if (filters.owner) parts.push(`Comercial: ${filters.owner}`);
  if (filters.status) parts.push(`Estado: ${labels[filters.status] || filters.status}`);
  if (filters.zone) parts.push(`Zona: ${filters.zone}`);
  if (filters.query) parts.push(`Cliente: ${filters.query}`);
  if (filters.model) parts.push(`Modelo: ${filters.model}`);
  return parts.length ? parts.join(" · ") : "Sin filtros (todos los clientes)";
}

function sheet(XLSX, aoa, widths, { autofilterFromRow } = {}) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  if (autofilterFromRow !== undefined && aoa.length > autofilterFromRow + 1) {
    const lastCol = XLSX.utils.encode_col(widths.length - 1);
    ws["!autofilter"] = { ref: `A${autofilterFromRow + 1}:${lastCol}${aoa.length}` };
  }
  return ws;
}

export function buildReportWorkbook(XLSX, { rows, metrics, filters, statuses, generatedAt = new Date(), today = todayBogota(generatedAt) }) {
  const labels = Object.fromEntries(statuses.map((s) => [s.key, s.label]));
  const wb = XLSX.utils.book_new();

  // 1) Resumen gerencial
  const gen = generatedAt.toISOString();
  const summary = [
    [text("Informe gerencial — Seguimiento comercial Pibox")],
    [text("Generado"), dateCell(gen)],
    [text("Filtros aplicados"), text(describeFilters(filters, labels))],
    [text("Nota"), text(`«${NA}» = no aplica; celda vacía = sin dato registrado.`)],
    [],
    [text("Indicador"), text("Cantidad"), text("Qué mide")],
    ...INDICATOR_DEFS.map((d) => [text(d.label), { t: "n", v: metrics.counts[d.key] }, text(d.def)]),
    [],
    [text("Porcentaje"), text("Valor"), text("Cálculo / denominador")],
    ...metrics.ratios.map((r) => [text(r.label), r.value === null ? text("Sin base para calcular") : { t: "n", v: r.value / 100, z: "0.0%" }, text(`${r.num} de ${r.den} (${r.denLabel})`)]),
  ];
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, summary, [38, 22, 90]), "Resumen gerencial");

  // 2) Detalle de clientes (sin teléfonos ni correos: no son necesarios para el objetivo del informe)
  const head = ["Cliente", "ID cliente", "Zona", "Comercial responsable", "Estado actual", "Último contacto", "Próximo seguimiento", "Seguimiento vencido", "Motivo de no interés", "Responsable siguiente acción", "Modelo comercial", "Observación más reciente", "Última actualización"];
  const detail = [head.map(text)];
  for (const r of rows) {
    const notInt = r.stage === "not_interested";
    const terminal = r.stage === "closed" || notInt;
    const lastNote = [...(r.fu.history || [])].reverse().find((e) => e.note)?.note || "";
    detail.push([
      text(r.client.name), text(r.client.id), text(r.client.zone), text(r.owner), text(r.statusLabel),
      dateCell(r.fu.lastContactAt), terminal ? text(NA) : dateCell(r.fu.nextFollowUpAt),
      text(r.overdue ? "Sí" : "No"), notInt ? text(r.fu.notInterestedReason) : text(NA),
      terminal ? text(NA) : text(r.fu.nextActionOwner), text(r.fu.model), text(lastNote), dateCell(r.fu.updatedAt),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, detail, [34, 14, 16, 24, 34, 15, 19, 18, 30, 26, 22, 50, 20], { autofilterFromRow: 0 }), "Detalle de clientes");

  // 3) Historial de gestión (solo si existe)
  const hist = [];
  for (const r of rows) for (const e of r.fu.history || []) hist.push({ r, e });
  hist.sort((a, b) => (a.e.at < b.e.at ? -1 : 1));
  if (hist.length) {
    const hh = ["Fecha y hora", "Cliente", "ID cliente", "Comercial", "Tipo", "Detalle", "Nota"].map(text);
    const body = hist.map(({ r, e }) => [
      dateCell(e.at), text(r.client.name), text(r.client.id), text(e.by || r.owner),
      text({ status: "Cambio de estado", note: "Nota", field: "Cambio de dato", create: "Creación" }[e.type] || e.type),
      text(e.type === "status" ? `${labels[e.from] || e.from || "—"} → ${labels[e.to] || e.to}` : e.type === "field" ? `${e.field}: ${e.from || "—"} → ${e.to}` : ""),
      text(e.note || ""),
    ]);
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, [hh, ...body], [20, 34, 14, 22, 18, 52, 60], { autofilterFromRow: 0 }), "Historial de gestión");
  }

  // 4) Pendientes (solo si hay)
  const pend = pendingRows(rows, today);
  if (pend.length) {
    const ph = ["Motivo", "Cliente", "ID cliente", "Comercial", "Estado actual", "Próximo seguimiento", "Último contacto"].map(text);
    const body = pend.map((r) => [text(r.reason), text(r.client.name), text(r.client.id), text(r.owner), text(r.statusLabel), dateCell(r.fu.nextFollowUpAt), dateCell(r.fu.lastContactAt)]);
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, [ph, ...body], [28, 34, 14, 24, 34, 19, 15], { autofilterFromRow: 0 }), "Pendientes");
  }
  return wb;
}

/** Libro simple (texto) para reportes de errores y respaldos tabulares. */
export function buildSimpleWorkbook(XLSX, aoa, sheetName = "Hoja1", widths = null) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa.map((r) => r.map((v) => (typeof v === "number" ? { t: "n", v } : text(v)))));
  ws["!cols"] = (widths || aoa[0].map(() => 24)).map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}
