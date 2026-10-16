import { h, field, select, toast, downloadWorkbook, emptyState } from "./dom.js";
import { buildRows, computeMetrics, INDICATOR_DEFS, pendingRows } from "../core/followup.js";
import { buildReportWorkbook } from "../core/report.js";
import { todayBogota } from "../core/util.js";
import { commercials } from "./clients.js";

export function renderReports(root, ctx) {
  const { store, XLSX } = ctx;
  const S = () => store.state;
  const f = (ctx.repFilters ||= { from: "", to: "", owner: "", status: "", zone: "", query: "", model: "" });
  const out = h("div");

  function compute() {
    const rows = buildRows({ clients: S().clients, followups: S().followups, statuses: S().config.statuses, filters: f });
    return { rows, metrics: computeMetrics(rows) };
  }

  function draw() {
    const { rows, metrics } = compute();
    const c = metrics.counts;
    if (!S().clients.length) { out.replaceChildren(emptyState("Sin datos para informar", "Agrega clientes y registra su seguimiento para ver indicadores.")); return; }
    const pend = pendingRows(rows);
    out.replaceChildren(
      h("div", { class: "kpis" }, INDICATOR_DEFS.map((d) => h("div", { class: `kpi${d.key === "overdue" && c.overdue ? " warn" : ""}`, title: d.def }, h("b", { text: String(c[d.key]) }), h("span", { text: d.label })))),
      h("section", { class: "card" }, h("h2", { text: "Porcentajes y su base de cálculo" }),
        h("ul", {}, metrics.ratios.map((r) => h("li", {}, h("strong", { text: r.value === null ? "—" : `${r.value}%` }), ` ${r.label}: ${r.num} de ${r.den} (${r.denLabel})`, r.value === null ? " · sin base para calcular" : "")))),
      h("section", { class: "card" }, h("h2", { text: "Qué mide cada indicador" }), h("dl", {}, INDICATOR_DEFS.flatMap((d) => [h("dt", { text: d.label, style: "font-weight:600" }), h("dd", { text: d.def, style: "margin:0 0 .5rem 0;color:var(--muted)" })]))),
      h("section", { class: "card" }, h("h2", { text: `Pendientes (${pend.length})` }),
        pend.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Motivo", "Cliente", "Comercial", "Próximo seguimiento"].map((t) => h("th", { scope: "col", text: t })))),
          h("tbody", {}, pend.slice(0, 15).map((r) => h("tr", {}, h("td", { text: r.reason }), h("td", { text: r.client.name }), h("td", { text: r.owner || "—" }), h("td", { text: r.fu.nextFollowUpAt ? r.fu.nextFollowUpAt.split("-").reverse().join("/") : "—" })))))) : h("p", { class: "muted", text: "No hay pendientes con estos filtros." }),
        pend.length > 15 ? h("p", { class: "hint", text: `Se muestran 15 de ${pend.length}; el Excel incluye todos.` }) : null),
    );
  }

  function download() {
    const { rows, metrics } = compute();
    if (!rows.length) { toast("No hay filas con estos filtros para exportar", "err"); return; }
    const wb = buildReportWorkbook(XLSX, { rows, metrics, filters: f, statuses: S().config.statuses });
    downloadWorkbook(XLSX, wb, `informe-gerencial-${todayBogota()}.xlsx`);
    toast("Informe Excel generado ✓");
  }

  const bind = (el, key) => { el.addEventListener("change", () => { f[key] = el.value; draw(); }); return el; };
  const zones = [...new Set([...S().config.zones, ...S().clients.map((c) => c.zone).filter(Boolean)])];
  const models = [...new Set([S().config.offer.model, ...Object.values(S().followups).map((x) => x.model)].filter(Boolean))];
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Informes gerenciales" }), h("p", { text: "Indicadores calculados con los datos reales de seguimiento. Los totales cambian con los filtros." })),
      h("button", { class: "btn btn-primary", type: "button", text: "Descargar informe Excel", onclick: download })),
    h("section", { class: "card", "aria-label": "Filtros del informe" },
      h("div", { class: "row" },
        field("Gestión desde", bind(h("input", { type: "date", value: f.from }), "from")), field("Gestión hasta", bind(h("input", { type: "date", value: f.to }), "to")),
        field("Comercial", bind(select([{ value: "", label: "Todos" }, ...commercials(S()).map((o) => ({ value: o, label: o }))], f.owner), "owner")),
        field("Estado", bind(select([{ value: "", label: "Todos" }, ...S().config.statuses.map((s) => ({ value: s.key, label: s.label }))], f.status), "status"))),
      h("div", { class: "row" },
        field("Zona", bind(select([{ value: "", label: "Todas" }, ...zones], f.zone), "zone")),
        field("Cliente (nombre o ID)", (() => { const i = h("input", { type: "search", value: f.query, oninput: (e) => { f.query = e.target.value; draw(); } }); return i; })()),
        field("Modelo comercial", bind(select([{ value: "", label: "Todos" }, ...models], f.model), "model"))),
      h("p", { class: "hint", text: "Con rango de fechas solo se cuentan clientes con alguna gestión registrada en ese rango (cambio de estado, nota o último contacto). Sin fechas se cuentan todos los clientes, incluidos los que aún no tienen seguimiento." })),
    out,
  );
  draw();
}
