import { h, field, select, toast, openDialog, emptyState, fmtDate } from "./dom.js";
import { track } from "./audit.js";
import { buildRows, sortRows, newFollowup, updateFollowup, stageOf } from "../core/followup.js";
import { todayBogota } from "../core/util.js";
import { commercials } from "./clients.js";

export function renderFollowup(root, ctx) {
  const { store } = ctx;
  const S = () => store.state;
  const f = (ctx.fuFilters ||= { query: "", owner: "", status: "", zone: "", from: "", to: "", sort: "nextFollowUp", dir: 1, overdueOnly: false, page: 0 });
  const PAGE = 40;
  const tableHost = h("div");
  const kpiHost = h("div", { class: "kpis" });

  const statusOpts = (current) => S().config.statuses.filter((s) => s.active || s.key === current).map((s) => ({ value: s.key, label: s.label }));

  function rows() {
    const r = buildRows({ clients: S().clients, followups: S().followups, statuses: S().config.statuses, filters: f });
    return sortRows(f.overdueOnly ? r.filter((x) => x.overdue) : r, f.sort, f.dir);
  }

  function setFollow(clientUid, patch, okMsg) {
    store.commit((d) => {
      const c = d.clients.find((x) => x.uid === clientUid);
      const fu = d.followups[clientUid] || newFollowup(clientUid, d.config.statuses, { owner: c?.owner || "" });
      const p = { ...patch };
      if (!fu.owner && !p.owner && d.config.commercial.name) p.owner = d.config.commercial.name;
      d.followups[clientUid] = updateFollowup(fu, p, { by: d.config.commercial.name, statuses: d.config.statuses });
    });
    track("followup_update");
    if (okMsg) toast(okMsg);
  }

  function draw() {
    const all = rows();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    f.page = Math.min(f.page, pages - 1);
    const today = todayBogota();
    const over = all.filter((r) => r.overdue).length, pend = all.filter((r) => r.stage === "pending").length;
    kpiHost.replaceChildren(
      ...[["En esta lista", all.length], ["Pendientes de contactar", pend], ["Seguimientos vencidos", over]].map(([l, n], i) => h("div", { class: `kpi${i === 2 && n ? " warn" : ""}` }, h("b", { text: String(n) }), h("span", { text: l }))));
    if (!all.length) { tableHost.replaceChildren(emptyState(S().clients.length ? "Sin resultados" : "No hay clientes", S().clients.length ? "Cambia los filtros para ver más registros." : "Primero agrega clientes en «Clientes y contactos».")); return; }
    const th = (key, label) => h("th", { scope: "col", "aria-sort": f.sort === key ? (f.dir === 1 ? "ascending" : "descending") : "none" }, key ? h("button", { type: "button", text: label + (f.sort === key ? (f.dir === 1 ? " ▲" : " ▼") : ""), onclick: () => { f.dir = f.sort === key ? -f.dir : 1; f.sort = key; draw(); } }) : label);
    tableHost.replaceChildren(
      h("div", { class: "table-wrap" }, h("table", {},
        h("caption", { class: "sr", text: "Seguimiento comercial por cliente" }),
        h("thead", {}, h("tr", {}, th("name", "Cliente"), th("owner", "Comercial"), th("status", "Estado"), th("lastContact", "Último contacto"), th("nextFollowUp", "Próximo seguimiento"), th(null, "Alertas"), th(null, ""))),
        h("tbody", {}, all.slice(f.page * PAGE, f.page * PAGE + PAGE).map((r) => {
          const uidv = r.client.uid;
          const st = select(statusOpts(r.fu.status), r.fu.status, { "aria-label": `Estado de ${r.client.name}`, onchange: (e) => {
            // «No interesado» exige motivo: se completa en el detalle en vez de guardarse a medias.
            if (stageOf(S().config.statuses, e.target.value) === "not_interested" && !r.fu.notInterestedReason) { const wanted = e.target.value; e.target.value = r.fu.status; openDetail(uidv, wanted); return; }
            setFollow(uidv, { status: e.target.value }, "Estado actualizado"); draw();
          } });
          const next = h("input", { type: "date", value: r.fu.nextFollowUpAt, "aria-label": `Próximo seguimiento de ${r.client.name}`, onchange: (e) => { setFollow(uidv, { nextFollowUpAt: e.target.value }, "Fecha actualizada"); draw(); } });
          return h("tr", { class: r.overdue ? "overdue" : "" },
            h("td", {}, h("strong", { text: r.client.name }), h("div", { class: "muted", text: `${r.client.id || "sin ID"}${r.client.zone ? " · " + r.client.zone : ""}` })),
            h("td", { text: r.owner || "—" }), h("td", {}, st), h("td", { class: "nowrap", text: fmtDate(r.fu.lastContactAt) || "—" }), h("td", {}, next),
            h("td", {}, r.overdue ? h("span", { class: "badge err", text: "Vencido" }) : r.stage === "pending" ? h("span", { class: "badge warn", text: "Por contactar" }) : r.fu.nextFollowUpAt === today ? h("span", { class: "badge warn", text: "Hoy" }) : null),
            h("td", {}, h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Detalle", "aria-label": `Detalle de ${r.client.name}`, onclick: () => openDetail(uidv) })));
        })))),
      h("div", { class: "actions" }, h("span", { class: "muted", text: `Página ${f.page + 1} de ${pages}` }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "← Anterior", disabled: f.page === 0, onclick: () => { f.page--; draw(); } }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Siguiente →", disabled: f.page >= pages - 1, onclick: () => { f.page++; draw(); } })));
  }

  function openDetail(clientUid, presetStatus = "") {
    const client = S().clients.find((c) => c.uid === clientUid);
    const fu = S().followups[clientUid] || newFollowup(clientUid, S().config.statuses, { owner: client.owner || "" });
    const dd = { status: presetStatus || fu.status, owner: fu.owner || client.owner || "", lastContactAt: fu.lastContactAt, nextFollowUpAt: fu.nextFollowUpAt, notInterestedReason: fu.notInterestedReason, nextActionOwner: fu.nextActionOwner, model: fu.model };
    const status = select(statusOpts(fu.status), dd.status, { onchange: () => { dd.status = status.value; toggleReason(); } });
    const owner = h("input", { type: "text", value: dd.owner, list: "ow-dl", oninput: (e) => (dd.owner = e.target.value) });
    const ownerDl = h("datalist", { id: "ow-dl" }, commercials(S()).map((o) => h("option", { value: o })));
    const last = h("input", { type: "date", value: dd.lastContactAt, oninput: (e) => (dd.lastContactAt = e.target.value) });
    const next = h("input", { type: "date", value: dd.nextFollowUpAt, oninput: (e) => (dd.nextFollowUpAt = e.target.value) });
    const reason = h("input", { type: "text", value: dd.notInterestedReason, oninput: (e) => (dd.notInterestedReason = e.target.value) });
    const reasonField = field("Motivo de no interés", reason);
    const nao = h("input", { type: "text", value: dd.nextActionOwner, oninput: (e) => (dd.nextActionOwner = e.target.value) });
    const model = h("input", { type: "text", value: dd.model, placeholder: S().config.offer.model, oninput: (e) => (dd.model = e.target.value) });
    const note = h("textarea", { rows: 3, placeholder: "Qué se hizo o qué se acordó…" });
    const err = h("div", { role: "alert" });
    function toggleReason() { reasonField.hidden = stageOf(S().config.statuses, dd.status) !== "not_interested"; }
    const hist = (fu.history || []).slice().reverse();
    const label = (k) => S().config.statuses.find((s) => s.key === k)?.label || k;
    const content = h("div", {},
      h("p", {}, h("strong", { text: client.name }), ` · ${client.id || "sin ID"}`, client.contacts[0]?.phone ? ` · ${client.contacts.find((c) => c.primary)?.phone || client.contacts[0].phone}` : ""),
      ownerDl,
      h("div", { class: "row" }, field("Estado", status), field("Comercial responsable", owner)),
      h("div", { class: "row" }, field("Último contacto", last), field("Próxima fecha de seguimiento", next)),
      reasonField,
      h("div", { class: "row" }, field("Responsable de la siguiente acción", nao), field("Modelo comercial ofrecido", model)),
      field("Nueva nota (se agrega al historial)", note),
      err,
      h("div", { class: "actions end" }, h("button", { class: "btn btn-ghost", type: "button", text: "Cancelar", onclick: () => dlg.close() }), h("button", { class: "btn btn-primary", type: "button", text: "Guardar seguimiento", onclick: save })),
      h("h3", { text: "Historial" }),
      hist.length ? h("ul", { class: "timeline" }, hist.map((e) => h("li", {}, h("time", { text: `${fmtDate(e.at)}${e.by ? " · " + e.by : ""}` }),
        e.type === "status" ? h("strong", { text: `${label(e.from)} → ${label(e.to)}` }) : e.type === "field" ? h("strong", { text: `${{ nextFollowUpAt: "Próximo seguimiento", owner: "Comercial", lastContactAt: "Último contacto" }[e.field] || e.field}: ${e.from || "—"} → ${e.to || "—"}` }) : h("strong", { text: "Nota" }),
        e.note ? h("div", { text: e.note }) : null))) : h("p", { class: "muted", text: "Aún no hay gestiones registradas." }),
    );
    const dlg = openDialog("Seguimiento del cliente", content, { wide: true });
    toggleReason();
    function save() {
      const st = stageOf(S().config.statuses, dd.status);
      if (st === "not_interested" && !dd.notInterestedReason.trim()) { err.replaceChildren(h("div", { class: "alert err", text: "Indica el motivo de no interés." })); return; }
      if (dd.nextFollowUpAt !== fu.nextFollowUpAt && dd.nextFollowUpAt && dd.lastContactAt && dd.nextFollowUpAt < dd.lastContactAt) { err.replaceChildren(h("div", { class: "alert err", text: "El próximo seguimiento no puede ser anterior al último contacto." })); return; }
      setFollow(clientUid, { ...dd, note: note.value.trim() || undefined }, "Seguimiento guardado");
      dlg.close(); draw();
    }
  }

  const q = h("input", { type: "search", id: "fq", value: f.query, placeholder: "Nombre o ID…", oninput: (e) => { f.query = e.target.value; f.page = 0; draw(); } });
  const bind = (el, key) => { el.addEventListener("change", () => { f[key] = el.value; f.page = 0; draw(); }); return el; };
  const zones = [...new Set([...S().config.zones, ...S().clients.map((c) => c.zone).filter(Boolean)])];
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Seguimiento comercial" }), h("p", { text: "Estado de cada cliente, próximas acciones e historial de gestión." }))),
    h("section", { class: "card", "aria-label": "Filtros" },
      h("div", { class: "row" },
        field("Buscar", q),
        field("Comercial", bind(select([{ value: "", label: "Todos" }, ...commercials(S()).map((o) => ({ value: o, label: o }))], f.owner), "owner")),
        field("Estado", bind(select([{ value: "", label: "Todos" }, ...S().config.statuses.map((s) => ({ value: s.key, label: s.label }))], f.status), "status")),
        field("Zona", bind(select([{ value: "", label: "Todas" }, ...zones], f.zone), "zone"))),
      h("div", { class: "row" },
        field("Gestión desde", bind(h("input", { type: "date", value: f.from }), "from")),
        field("Gestión hasta", bind(h("input", { type: "date", value: f.to }), "to")),
        h("div", { class: "field" }, h("label", { text: " " }), h("div", { class: "check" }, h("input", { type: "checkbox", id: "ovd", checked: f.overdueOnly, onchange: (e) => { f.overdueOnly = e.target.checked; draw(); } }), h("label", { for: "ovd", text: "Solo seguimientos vencidos" }))),
        h("div", { class: "field" }, h("label", { text: " " }), h("button", { class: "btn btn-ghost", type: "button", text: "Limpiar filtros", onclick: () => { Object.assign(f, { query: "", owner: "", status: "", zone: "", from: "", to: "", overdueOnly: false, page: 0 }); root.replaceChildren(); renderFollowup(root, ctx); } }))),
      h("p", { class: "hint", text: "El rango de fechas incluye clientes con alguna gestión registrada (cambio de estado, nota o contacto) dentro de ese rango." })),
    kpiHost, tableHost,
    h("p", { class: "hint", text: "La aplicación no tiene inicio de sesión: el «comercial responsable» es un dato que se selecciona o escribe, no una cuenta con permisos." }),
  );
  draw();
}
