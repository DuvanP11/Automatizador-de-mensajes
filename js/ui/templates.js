import { h, field, toast, confirmDialog, insertAtCursor } from "./dom.js";
import { createEmojiPicker } from "./emoji.js";
import { VARIABLES, renderTemplate, buildValues, lintTemplate, resolveZone } from "../core/templates.js";
import { uid } from "../core/util.js";

export function renderTemplates(root, ctx) {
  const { store } = ctx;
  const S = () => store.state;
  const v = (ctx.tplView ||= { id: S().templates.find((t) => t.isDefault)?.id || S().templates[0].id });
  if (!S().templates.some((t) => t.id === v.id)) v.id = S().templates[0].id;

  const listHost = h("ul", { class: "list" });
  const editor = h("div");
  let draft = null; // { name, body } sin guardar
  const isDirty = () => { const t = cur(); return !!draft && !!t && (draft.name !== t.name || draft.body !== t.body); };
  ctx.dirty = isDirty;
  const cur = () => S().templates.find((t) => t.id === v.id);

  function drawList() {
    listHost.replaceChildren(...S().templates.map((t) => h("li", {}, h("button", { type: "button", "aria-current": String(t.id === v.id), onclick: () => select(t.id) },
      h("strong", { text: t.name }), t.isDefault ? h("span", { class: "badge", text: " predeterminada" }) : null))));
  }
  async function select(id) {
    if (id === v.id) return;
    if (isDirty() && !(await confirmDialog({ title: "Cambios sin guardar", message: "Descartar los cambios de esta plantilla?", confirmText: "Descartar", danger: true }))) return;
    v.id = id; draft = null; drawList(); drawEditor();
  }

  function drawEditor() {
    const t = cur();
    draft = { name: t.name, body: t.body };
    const name = h("input", { type: "text", value: t.name, maxlength: 80, oninput: (e) => { draft.name = e.target.value; update(); } });
    const body = h("textarea", { rows: 16, class: "msg", spellcheck: "true", oninput: (e) => { draft.body = e.target.value; update(); } });
    body.value = t.body;
    const lint = h("div", { "aria-live": "polite" });
    const preview = h("div", { class: "preview", "aria-label": "Vista previa" });
    const pvWarn = h("div");
    const clientSel = h("select", { id: "pvclient", onchange: update },
      h("option", { value: "", text: "Cliente de ejemplo" }), ...S().clients.slice(0, 300).map((c) => h("option", { value: c.uid, text: c.name })));
    const zoneSel = h("select", { id: "pvzone", onchange: update }, ["Ninguna", ...S().config.zones].map((z) => h("option", { value: z, text: z })));
    const emojiHost = h("div");
    const saveBtn = h("button", { class: "btn btn-primary", type: "button", text: "Guardar cambios", onclick: save });
    const discardBtn = h("button", { class: "btn btn-ghost", type: "button", text: "Descartar cambios", onclick: async () => { if (await confirmDialog({ title: "Descartar cambios", message: "Se restaurará el texto guardado de esta plantilla.", confirmText: "Descartar", danger: true })) drawEditor(); } });
    let picker = null;

    function update() {
      const problems = lintTemplate(draft.body);
      if (!draft.name.trim()) problems.push("La plantilla necesita un nombre");
      lint.replaceChildren(problems.length ? h("div", { class: "alert err" }, h("ul", {}, problems.map((p) => h("li", { text: p })))) : "");
      const c = S().clients.find((x) => x.uid === clientSel.value);
      const sample = c || { name: "Ambrosia Toy Store", id: "AMB001" };
      const values = buildValues({ config: S().config, client: sample, contact: c?.contacts[0] || { name: "Laura" }, zone: resolveZone(zoneSel.value, "") });
      const r = renderTemplate(draft.body, values, { seed: ctx.gen?.seed || 0, emojis: S().config.emojis.enabled });
      preview.textContent = r.text;
      pvWarn.replaceChildren(r.missing.length ? h("div", { class: "alert warn", text: `Faltan datos de configuración para: ${r.missing.join(", ")}.` }) : "");
      saveBtn.disabled = problems.length > 0 || !isDirty();
      discardBtn.disabled = !isDirty();
    }
    function save() {
      const problems = lintTemplate(draft.body);
      if (problems.length || !draft.name.trim()) return;
      store.commit((d) => { const x = d.templates.find((y) => y.id === v.id); x.name = draft.name.trim(); x.body = draft.body; x.updatedAt = new Date().toISOString(); });
      draft = { name: draft.name.trim(), body: draft.body }; drawList(); update(); toast("Plantilla guardada");
    }

    editor.replaceChildren(
      h("div", { class: "card" },
        h("div", { class: "panel-title" }, h("h2", { text: "Mensaje plantilla" }), t.isDefault ? h("span", { class: "badge ok", text: "Predeterminada" }) : null),
        field("Nombre de la plantilla", name),
        h("div", { class: "field" }, h("label", { for: "tbody", text: "Texto base" }), (body.id = "tbody", body)),
        h("p", { class: "hint", id: "varhelp", text: "Variables: clic en una para insertarla. Bloque opcional: {{#zona}} para la zona de {{zona}}{{/zona}} (desaparece completo si no hay zona). Alternativas: [[opción 1|opción 2]]." }),
        h("div", { class: "chips", role: "group", "aria-label": "Variables disponibles" }, VARIABLES.map((x) => h("button", { class: "chip", type: "button", title: x.label, onclick: () => insertAtCursor(body, `{{${x.key}}}`) }, h("code", { text: `{{${x.key}}}` })))),
        h("div", { class: "actions" },
          h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Insertar bloque opcional de zona", onclick: () => insertAtCursor(body, "{{#zona}} para la zona de {{zona}}{{/zona}}") }),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "😊 Emojis", "aria-haspopup": "dialog", onclick: () => { if (picker) { picker.remove(); picker = null; } else { picker = createEmojiPicker({ emojiConfig: S().config.emojis, onPick: (e) => insertAtCursor(body, e), onConfigChange: (ec) => store.commit((d) => { d.config.emojis = { ...d.config.emojis, ...ec }; }) }); emojiHost.append(picker); } } })),
        emojiHost, lint,
        h("div", { class: "actions" }, saveBtn, discardBtn)),
      h("div", { class: "card" },
        h("h2", { text: "Vista previa" }),
        h("div", { class: "row" }, field("Probar con", clientSel), field("Zona", zoneSel)),
        pvWarn, preview,
        h("p", { class: "hint", text: "La vista previa usa la configuración comercial actual y no modifica la plantilla." })),
      h("div", { class: "card" },
        h("h2", { text: "Acciones de la plantilla" }),
        h("div", { class: "actions" },
          h("button", { class: "btn btn-secondary", type: "button", text: "Duplicar", onclick: () => { const nid = uid("tpl"); store.commit((d) => d.templates.push({ id: nid, name: `${t.name} (copia)`, body: t.body, isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })); v.id = nid; drawList(); drawEditor(); toast("Plantilla duplicada"); } }),
          h("button", { class: "btn btn-secondary", type: "button", text: "Marcar como predeterminada", disabled: t.isDefault, onclick: () => { store.commit((d) => d.templates.forEach((x) => (x.isDefault = x.id === v.id))); drawList(); drawEditor(); toast("Plantilla predeterminada actualizada"); } }),
          h("button", { class: "btn btn-danger", type: "button", text: "Eliminar", disabled: S().templates.length < 2, onclick: remove })),
        S().templates.length < 2 ? h("p", { class: "hint", text: "Debe existir al menos una plantilla." }) : null),
    );
    update();
    saveBtn.disabled = true; discardBtn.disabled = true;
  }

  async function remove() {
    const t = cur();
    if (!(await confirmDialog({ title: "Eliminar plantilla", message: `¿Eliminar «${t.name}»? No se puede deshacer.`, confirmText: "Eliminar", danger: true }))) return;
    store.commit((d) => { d.templates = d.templates.filter((x) => x.id !== t.id); if (!d.templates.some((x) => x.isDefault)) d.templates[0].isDefault = true; });
    v.id = S().templates.find((x) => x.isDefault).id; draft = null; drawList(); drawEditor(); toast("Plantilla eliminada");
  }

  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Plantillas" }), h("p", { text: "Edita el texto base con variables. El mensaje final se genera aparte, sin modificar la plantilla." })),
      h("button", { class: "btn btn-primary", type: "button", text: "+ Nueva plantilla", onclick: async () => {
        if (isDirty() && !(await confirmDialog({ title: "Cambios sin guardar", message: "Descartar los cambios actuales?", confirmText: "Descartar", danger: true }))) return;
        const nid = uid("tpl"); store.commit((d) => d.templates.push({ id: nid, name: "Nueva plantilla", body: "{{saludo}} {{nombre_cliente}}\n\nMi nombre es {{nombre_comercial}}, {{cargo_comercial}} de Pibox.\n\n", isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
        v.id = nid; draft = null; drawList(); drawEditor(); } })),
    h("div", { class: "split" }, h("nav", { class: "card", "aria-label": "Plantillas guardadas" }, h("h3", { text: "Mis plantillas" }), listHost), editor),
  );
  drawList(); drawEditor();
}
