import { h, field, select, toast, confirmDialog, downloadWorkbook, emptyState, fmtDate } from "./dom.js";
import { uid } from "../core/util.js";
import { buildMailto } from "../core/ideas.js";

const KINDS = ["Generador de mensajes", "Clientes y contactos", "Plantillas", "Seguimiento comercial", "Informes", "Ayuda y tutorial", "Otra cosa"];
const PRIORITIES = [{ value: "baja", label: "Sería bueno tenerlo" }, { value: "media", label: "Me ayudaría bastante" }, { value: "alta", label: "Me estorba hoy / es urgente" }];
const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));

export function renderIdeas(root, ctx) {
  const { store, XLSX } = ctx;
  const S = () => store.state;
  const draft = { title: "", text: "", kind: KINDS[0], priority: "media", author: S().config.commercial.name || "" };
  ctx.dirty = () => !!(draft.title.trim() || draft.text.trim());

  const title = h("input", { type: "text", maxlength: 120, placeholder: "Ej: Poder filtrar clientes por localidad en el generador" });
  const text = h("textarea", { rows: 5, maxlength: 2000, placeholder: "Cuéntanos qué quieres lograr y qué te estorba hoy. Mientras más concreto, mejor." });
  const kind = select(KINDS, draft.kind);
  const prio = select(PRIORITIES, draft.priority);
  const author = h("input", { type: "text", maxlength: 80, value: draft.author, placeholder: "Opcional" });
  const counter = h("small", { class: "hint" });
  const err = h("div", { role: "alert" });
  const sync = () => { draft.title = title.value; draft.text = text.value; draft.kind = kind.value; draft.priority = prio.value; draft.author = author.value; counter.textContent = `${text.value.length}/2000`; };
  [title, text, kind, prio, author].forEach((el) => el.addEventListener("input", sync));
  sync();

  function save() {
    sync();
    const problems = [];
    if (!draft.title.trim()) problems.push("Escribe un título corto para tu idea.");
    if (draft.text.trim().length < 10) problems.push("Cuéntanos un poco más (mínimo 10 caracteres).");
    err.replaceChildren(problems.length ? h("div", { class: "alert err" }, h("ul", {}, problems.map((p) => h("li", { text: p })))) : "");
    if (problems.length) return;
    const idea = { id: uid("id"), title: draft.title.trim(), text: draft.text.trim(), kind: draft.kind, priority: draft.priority, author: draft.author.trim(), createdAt: new Date().toISOString() };
    store.commit((d) => { d.ideas.unshift(idea); });
    ctx.dirty = null;
    toast("Idea guardada ✓ Gracias por ayudarnos a mejorar");
    root.replaceChildren(); renderIdeas(root, ctx);
  }

  const mail = (ideas) => {
    const { href, omitted } = buildMailto(S().config.ideasEmail, ideas);
    location.href = href; // mailto: lo gestiona el programa de correo; la página no se descarga
    if (omitted) toast(`Eran muchas: se incluyeron las más recientes. Faltan ${omitted}; descarga el Excel para llevarlas todas.`, "info", 6000);
    else if (!S().config.ideasEmail) toast("Elige el destinatario en tu correo. Puedes dejarlo fijo en Configuración.", "info", 5000);
  };

  function exportXlsx() {
    const rows = S().ideas.map((i) => ({ Fecha: fmtDate(i.createdAt), Título: i.title, Detalle: i.text, Sección: i.kind, Importancia: PRIORITY_LABEL[i.priority] || i.priority, Autor: i.author }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 70 }, { wch: 24 }, { wch: 28 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ideas");
    downloadWorkbook(XLSX, wb, `ideas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function remove(i) {
    if (!(await confirmDialog({ title: "Eliminar idea", message: `Se eliminará «${i.title}» de este navegador.`, confirmText: "Eliminar", danger: true }))) return;
    store.commit((d) => { d.ideas = d.ideas.filter((x) => x.id !== i.id); });
    root.replaceChildren(); renderIdeas(root, ctx);
  }

  const ideas = S().ideas;
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Buzón de ideas" }), h("p", { text: "¿Algo te estorba o se te ocurre cómo mejorar esta herramienta? Cuéntalo aquí." }))),
    h("div", { class: "grid-2" },
      h("section", { class: "card", "aria-labelledby": "h-new" }, h("h2", { id: "h-new", text: "Nueva idea" }),
        err,
        field("Título", title),
        field("Cuéntanos más", text), counter,
        h("div", { class: "row" }, field("¿De qué parte trata?", kind), field("¿Qué tan importante es?", prio)),
        field("Tu nombre", author, "Para que sepamos a quién preguntarle si hace falta detalle."),
        h("div", { class: "actions" }, h("button", { class: "btn btn-primary", type: "button", text: "Guardar idea", onclick: save }))),
      h("section", { class: "card", "aria-labelledby": "h-list" },
        h("div", { class: "panel-title" }, h("h2", { id: "h-list", text: `Ideas guardadas (${ideas.length})` }),
          h("div", { class: "actions", style: "margin:0" },
            h("button", { class: "btn btn-secondary btn-sm", type: "button", text: "Enviar todas por correo", disabled: !ideas.length, "data-tip": "Abre tu programa de correo con las ideas escritas, para que las envíes a quien administra la herramienta.", onclick: () => mail(ideas) }),
            h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Descargar Excel", disabled: !ideas.length, onclick: exportXlsx }))),
        h("div", { class: "alert info", text: "Las ideas quedan guardadas en este navegador. Para que lleguen a quien mejora la herramienta, envíalas por correo (se abre tu programa de correo, tú das el clic de enviar) o descarga el Excel." }),
        ideas.length ? h("ul", { class: "idea-list" }, ideas.map((i) => h("li", { class: "idea" },
          h("div", { class: "idea-head" }, h("strong", { text: i.title }), h("span", { class: `badge ${i.priority === "alta" ? "err" : i.priority === "media" ? "warn" : ""}`, text: PRIORITY_LABEL[i.priority] || i.priority })),
          h("p", { text: i.text }),
          h("div", { class: "muted", style: "font-size:.8rem", text: `${i.kind} · ${fmtDate(i.createdAt)}${i.author ? ` · ${i.author}` : ""}` }),
          h("div", { class: "actions" },
            h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Enviar por correo", onclick: () => mail([i]) }),
            h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Eliminar", onclick: () => remove(i) }))))) : emptyState("Aún no hay ideas", "Cuando guardes la primera aparecerá aquí.")),
    ),
  );
}
