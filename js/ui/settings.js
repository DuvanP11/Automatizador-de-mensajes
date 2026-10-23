import { h, field, select, toast, confirmDialog, download, openDialog } from "./dom.js";
import { track } from "./audit.js";
import { STAGES } from "../core/config.js";
import { formatMoney, deepClone, uid } from "../core/util.js";
import { greetingFor } from "../core/templates.js";
import { isValidEmail } from "../core/util.js";
import { AGENTE_COMERCIAL_URL } from "../core/links.js";
import { getPrefs, updatePrefs } from "./prefs.js";
import { isReporting } from "./audit.js";

const ROLES = ["Gestor comercial", "Account Manager", "Ejecutivo comercial", "Asesor comercial"];

export function renderSettings(root, ctx) {
  const { store } = ctx;
  const S = () => store.state;
  let cfg = deepClone(S().config);
  let rateText = String(cfg.offer.rate ?? "");
  const same = () => JSON.stringify(cfg) === JSON.stringify(S().config) && rateText === String(S().config.offer.rate ?? "");
  ctx.dirty = () => !same();
  const mark = () => { saveBar.disabled = same(); discardBtn.disabled = same(); };
  const bind = (el, obj, key, after) => { el.addEventListener("input", () => { obj[key] = el.value; after?.(); mark(); }); return el; };
  const errBox = h("div", { role: "alert" });

  const rateIn = h("input", { type: "text", inputmode: "numeric", value: rateText, "aria-describedby": "rate-h" });
  const rateHint = h("small", { id: "rate-h", class: "hint" });
  const upd = () => { const n = Number(rateText.replace(/[^\d]/g, "")); rateHint.textContent = rateText && Number.isFinite(n) ? `Se mostrará como ${formatMoney(n, cfg.offer.currency)}` : "Solo números, sin puntos (ej: 10500)"; };
  rateIn.addEventListener("input", () => { rateText = rateIn.value; upd(); mark(); });
  upd();

  const greetPreview = h("small", { class: "hint" });
  const greetManual = h("input", { type: "text", value: cfg.greeting.manual });
  const greetField = field("Saludo manual", greetManual);
  const drawGreet = () => { greetField.hidden = cfg.greeting.mode !== "manual"; greetPreview.textContent = `Hora actual en Colombia → «${greetingFor(cfg)}»`; };
  const greetMode = select([{ value: "auto", label: "Automático (hora de Colombia)" }, { value: "manual", label: "Manual" }], cfg.greeting.mode, { onchange: (e) => { cfg.greeting.mode = e.target.value; drawGreet(); mark(); } });
  bind(greetManual, cfg.greeting, "manual", drawGreet);

  const rolesDl = h("datalist", { id: "roles-dl" }, ROLES.map((r) => h("option", { value: r })));
  const zonesTa = h("textarea", { rows: 4, value: cfg.zones.join("\n") });
  zonesTa.value = cfg.zones.join("\n");
  zonesTa.addEventListener("input", () => { cfg.zones = zonesTa.value.split("\n").map((z) => z.trim()).filter(Boolean); mark(); });
  const comTa = h("textarea", { rows: 3 });
  comTa.value = (cfg.commercials || []).join("\n");
  comTa.addEventListener("input", () => { cfg.commercials = comTa.value.split("\n").map((z) => z.trim()).filter(Boolean); mark(); });

  const statusHost = h("div");
  function drawStatuses() {
    statusHost.replaceChildren(h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ["Nombre del estado", "Categoría para indicadores", "Activo"].map((t) => h("th", { scope: "col", text: t })))),
      h("tbody", {}, cfg.statuses.map((s, i) => h("tr", {},
        h("td", {}, h("input", { type: "text", value: s.label, "aria-label": `Nombre del estado ${i + 1}`, oninput: (e) => { s.label = e.target.value; mark(); } })),
        h("td", {}, select(Object.entries(STAGES).map(([v, l]) => ({ value: v, label: l })), s.stage, { "aria-label": `Categoría del estado ${s.label}`, onchange: (e) => { s.stage = e.target.value; mark(); } })),
        h("td", {}, h("input", { type: "checkbox", checked: s.active, "aria-label": `${s.label} activo`, onchange: (e) => { s.active = e.target.checked; mark(); } }))))))),
      h("button", { class: "btn btn-secondary btn-sm", type: "button", text: "+ Agregar estado", onclick: () => { cfg.statuses.push({ key: uid("st"), label: "Nuevo estado", stage: "responded", active: true }); drawStatuses(); mark(); } }),
      h("p", { class: "hint", text: "Los estados no se eliminan: se desactivan, así los registros existentes conservan su historial. La categoría decide cómo cuentan en los informes." }));
  }
  drawStatuses();

  function save() {
    const problems = [];
    const rate = Number(rateText.replace(/[^\d]/g, ""));
    if (!/^\s*\$?\s*\d[\d.,\s]*(COP)?\s*$/i.test(rateText) || !Number.isFinite(rate)) problems.push("La tarifa debe ser un número válido (ej: 10500).");
    if (!cfg.offer.model.trim()) problems.push("El modelo comercial no puede estar vacío.");
    if (cfg.greeting.mode === "manual" && !cfg.greeting.manual.trim()) problems.push("Escribe el saludo manual o vuelve a modo automático.");
    if (cfg.statuses.some((s) => !s.label.trim())) problems.push("Todos los estados necesitan un nombre.");
    if (new Set(cfg.statuses.map((s) => s.label.trim().toLowerCase())).size !== cfg.statuses.length) problems.push("Hay estados con el mismo nombre.");
    if (!cfg.statuses.some((s) => s.active && s.stage === "pending")) problems.push("Debe haber al menos un estado activo de la categoría «Sin contactar».");
    if ((cfg.ideasEmail || "").trim() && !isValidEmail(cfg.ideasEmail.trim())) problems.push("El correo para recibir las ideas no es válido.");
    if (cfg.defaultCountryCode && !/^\d{1,4}$/.test(cfg.defaultCountryCode.trim())) problems.push("El indicativo de país debe tener solo dígitos (ej: 57) o quedar vacío.");
    errBox.replaceChildren(problems.length ? h("div", { class: "alert err" }, h("ul", {}, problems.map((p) => h("li", { text: p })))) : "");
    if (problems.length) return;
    cfg.offer.rate = rate; cfg.defaultCountryCode = (cfg.defaultCountryCode || "").trim();
    cfg.commercial.name = cfg.commercial.name.trim(); cfg.ideasEmail = (cfg.ideasEmail || "").trim();
    store.commit((d) => { d.config = deepClone(cfg); });
    track("config_save");
    cfg = deepClone(S().config); rateText = String(cfg.offer.rate); rateIn.value = rateText; mark();
    toast("Configuración guardada ✓");
  }
  async function discard() {
    if (!(await confirmDialog({ title: "Descartar cambios", message: "Se restaurará la configuración guardada.", confirmText: "Descartar", danger: true }))) return;
    ctx.dirty = null; root.replaceChildren(); renderSettings(root, ctx);
  }

  const saveBar = h("button", { class: "btn btn-primary", type: "button", text: "Guardar configuración", onclick: save });
  const discardBtn = h("button", { class: "btn btn-ghost", type: "button", text: "Descartar cambios", onclick: discard });

  const text = (label, obj, key, props = {}, hint) => field(label, bind(h("input", { type: "text", value: obj[key], ...props }), obj, key), hint);
  const area = (label, obj, key, rows = 2) => { const t = h("textarea", { rows }); t.value = obj[key]; return field(label, bind(t, obj, key)); };

  // Datos y respaldo
  const restoreIn = h("input", { type: "file", accept: "application/json,.json", id: "restore" });
  restoreIn.addEventListener("change", async () => {
    const f = restoreIn.files?.[0]; if (!f) return;
    try {
      const next = store.parseBackup(await f.text());
      if (!(await confirmDialog({ title: "Restaurar respaldo", message: `El respaldo tiene ${next.clients.length} clientes y ${next.templates.length} plantillas. Reemplazará TODO lo que hay ahora en este navegador (${S().clients.length} clientes).`, confirmText: "Reemplazar todo", danger: true }))) { restoreIn.value = ""; return; }
      ctx.dirty = null; store.replaceAll(next); track("backup_restore"); toast("Respaldo restaurado ✓"); root.replaceChildren(); renderSettings(root, ctx);
    } catch (e) { toast(e.message, "err", 5000); restoreIn.value = ""; }
  });
  async function wipe() {
    const input = h("input", { type: "text", "aria-label": "Escribe BORRAR para confirmar", placeholder: "BORRAR" });
    const go = h("button", { class: "btn btn-danger", type: "button", text: "Borrar todo", disabled: true });
    input.addEventListener("input", () => (go.disabled = input.value !== "BORRAR"));
    const dlg = openDialog("Borrar todos los datos", h("div", {}, h("p", { text: "Se eliminarán clientes, plantillas, seguimientos y configuración de ESTE navegador. Descarga un respaldo primero. Escribe BORRAR para continuar." }), input, h("div", { class: "actions end" }, go)));
    go.addEventListener("click", () => { ctx.dirty = null; store.replaceAll({ seeded: true }); track("data_wipe"); dlg.close(); toast("Datos borrados", "info"); root.replaceChildren(); renderSettings(root, ctx); });
  }

  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Configuración comercial" }), h("p", { text: "Estos datos alimentan las variables de las plantillas. Nada está escrito dentro del código." })), h("div", { class: "actions" }, discardBtn, saveBar)),
    errBox, rolesDl,
    h("section", { class: "card" }, h("h2", { text: "Identidad del comercial" }),
      h("div", { class: "row" }, text("Nombre del comercial", cfg.commercial, "name", { placeholder: "Ej: Juliana Rojas" }), text("Cargo", cfg.commercial, "role", { list: "roles-dl" })),
      h("div", { class: "row" }, text("Área comercial", cfg.commercial, "area"), text("Firma o presentación (opcional)", cfg.commercial, "signature", {}, "Disponible como {{firma}} en las plantillas"))),
    h("section", { class: "card" }, h("h2", { text: "Oferta" }),
      h("div", { class: "row" }, text("Modelo comercial", cfg.offer, "model"), h("div", { class: "field" }, h("label", { for: "rate", text: "Tarifa del servicio" }), (rateIn.id = "rate", rateIn), rateHint), text("Moneda", cfg.offer, "currency", { maxlength: 5 })),
      text("Franja horaria", cfg.offer, "timeframe"), text("Condiciones de aplicación", cfg.offer, "conditions"), area("Descripción del beneficio", cfg.offer, "benefit"), area("Llamada a la acción", cfg.offer, "cta")),
    h("section", { class: "card" }, h("h2", { text: "Saludo, zonas y teléfonos" }),
      h("div", { class: "row" }, field("Saludo", greetMode, undefined), greetField), greetPreview,
      field("Zonas disponibles (una por línea)", zonesTa, "En el generador siempre existen además «Ninguna» y «Otra»."),
      text("Indicativo de país para números de 10 dígitos", cfg, "defaultCountryCode", { maxlength: 4, placeholder: "57" }, "Solo se usa al abrir WhatsApp; el número guardado no se modifica. Déjalo vacío para exigir el número completo."),
      field("Comercial(es) del equipo (uno por línea)", comTa, "Aparecen en los filtros y asignaciones. No es un sistema de usuarios: la aplicación no tiene inicio de sesión."),
      text("Correo para recibir las ideas del buzón", cfg, "ideasEmail", { type: "email", placeholder: "correo@empresa.com" }, "Opcional. Al pulsar «Enviar por correo» en el Buzón de ideas se abre tu correo con este destinatario ya escrito."),
      h("div", { class: "check" }, h("input", { type: "checkbox", id: "emon", checked: cfg.emojis.enabled, onchange: (e) => { cfg.emojis.enabled = e.target.checked; mark(); } }), h("label", { for: "emon", text: "Usar emojis en los mensajes generados" }))),
    h("section", { class: "card" }, h("h2", { text: "Apariencia y ayudas" }),
      h("p", { text: "Los colores, el modo claro u oscuro, las formas y el logo de esta web los define el Agente Comercial: lo que se elige allá se aplica aquí solo, la próxima vez que se abre o recarga." }),
      h("div", { class: "actions" }, h("a", { class: "btn btn-secondary", href: `${AGENTE_COMERCIAL_URL}/apariencia`, target: "_blank", rel: "noopener", text: "Cambiar la apariencia en el Agente Comercial ↗" })),
      h("div", { class: "check" }, h("input", { type: "checkbox", id: "tipsChk", checked: getPrefs().tips, onchange: (e) => { if (!updatePrefs({ tips: e.target.checked })) toast("No se pudo guardar esta preferencia en este navegador.", "err", 5000); } }),
        h("label", { for: "tipsChk", text: "Mostrar ayudas flotantes al pasar el mouse sobre botones y opciones" })),
      h("p", { class: "hint", text: "Esta casilla es solo de tu navegador y se aplica al instante; no necesita «Guardar configuración»." }),
      h("div", { class: "alert info", text: isReporting()
        ? "Entraste desde el Agente Comercial: esta web le informa a su Auditoría qué secciones abres y qué acciones haces (por ejemplo «importó clientes» o «abrió WhatsApp»). Nunca envía nombres, teléfonos, correos, mensajes ni archivos de tus clientes: tus datos siguen solo en este navegador."
        : "Si entras desde el Agente Comercial, esta web le informa a su Auditoría qué secciones abres y qué acciones haces (solo frases como «importó clientes»), nunca los datos de tus clientes. Esta sesión no está informando porque no entraste desde allá." })),
    h("section", { class: "card" }, h("h2", { text: "Estados de seguimiento" }), statusHost),
    h("section", { class: "card" }, h("h2", { text: "Datos y respaldo" }),
      h("div", { class: "alert info", text: "Tus datos viven solo en este navegador. No hay servidor ni copia automática: si borras los datos del sitio o cambias de equipo se pierden. Descarga respaldos con frecuencia." }),
      S().lastBackupAt ? h("p", { text: `Último respaldo descargado: ${new Date(S().lastBackupAt).toLocaleString("es-CO")}` }) : h("p", { class: "muted", text: "Todavía no has descargado un respaldo." }),
      h("div", { class: "actions" },
        h("button", { class: "btn btn-primary", type: "button", text: "Descargar respaldo (JSON)", onclick: () => { download(store.exportBackup(), `respaldo-automatizador-${new Date().toISOString().slice(0, 10)}.json`, "application/json"); store.markBackup(); track("backup_download"); toast("Respaldo descargado ✓"); } }),
        h("button", { class: "btn btn-danger", type: "button", text: "Borrar todos los datos…", onclick: wipe })),
      field("Restaurar desde un respaldo", restoreIn, "Reemplaza todo el contenido actual (se pide confirmación).")),
  );
  drawGreet(); mark();
}
