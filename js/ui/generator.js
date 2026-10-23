import { h, field, select, toast, confirmDialog, insertAtCursor } from "./dom.js";
import { track } from "./audit.js";
import { createEmojiPicker } from "./emoji.js";
import { openImport } from "./clients.js";
import { buildValues, renderTemplate, resolveZone, whatsappUrl, VARIABLES } from "../core/templates.js";
import { validatePhone, normalizeText, nameKey, digitsOnly } from "../core/util.js";
import { searchClients } from "../core/search.js";
import { newFollowup, updateFollowup, stageOf } from "../core/followup.js";

const NONE = "Ninguna";

function freshState() {
  return { clientUid: null, name: "", phone: "", email: "", contactName: "", contactCid: "", zoneSel: NONE, customZone: "", tplId: "", seed: 0, dirty: false, logContact: true, query: "", onlyMine: false };
}

export function renderGenerator(root, ctx) {
  const { store } = ctx;
  const g = (ctx.gen ||= freshState());
  const S = () => store.state;
  const client = () => S().clients.find((c) => c.uid === g.clientUid) || null;
  const tpl = () => S().templates.find((t) => t.id === g.tplId) || S().templates.find((t) => t.isDefault) || S().templates[0];
  if (!S().templates.some((t) => t.id === g.tplId)) g.tplId = tpl().id;

  // --- controles ---
  const search = h("input", { type: "search", role: "combobox", "aria-expanded": "false", "aria-autocomplete": "list", "aria-controls": "sugg", autocomplete: "off", placeholder: "Nombre, número, correo, ID o localidad…", value: g.query });
  const sugg = h("ul", { id: "sugg", class: "suggestions", role: "listbox", hidden: true });
  const nameIn = h("input", { type: "text", value: g.name, placeholder: "Nombre del cliente" });
  const idOut = h("input", { type: "text", readonly: true, "aria-readonly": "true" });
  const contactSel = h("select");
  const contactField = field("Contacto", contactSel);
  const phoneIn = h("input", { type: "tel", inputmode: "tel", value: g.phone, placeholder: "300 123 4567" });
  const phoneHint = h("small", { class: "hint" });
  const emailOut = h("input", { type: "text", readonly: true, "aria-readonly": "true" });
  const zoneSel = select([NONE, ...S().config.zones, "Otra"], g.zoneSel);
  const customZone = h("input", { type: "text", value: g.customZone, placeholder: "Ej: Teusaquillo" });
  const customField = field("Especificar zona", customZone);
  const tplSel = select(S().templates.map((t) => ({ value: t.id, label: t.name + (t.isDefault ? " (predeterminada)" : "") })), g.tplId);
  const tplView = h("textarea", { rows: 9, readonly: true, class: "template-box", "aria-label": "Texto de la plantilla seleccionada" });
  const msg = h("textarea", { rows: 16, class: "msg", placeholder: "Selecciona un cliente y pulsa «Regenerar desde plantilla»…" });
  const warnBox = h("div");
  const waBtn = h("button", { class: "btn btn-success", type: "button", text: "Abrir en WhatsApp" });
  const refreshAfterImport = () => { const c = client(); if (c) setClient(c); else { syncInputs(); drawBanner(); } drawBanner(); };
  const importPhonesBtn = h("button", { class: "btn btn-secondary btn-sm", type: "button", text: "📞 Importar teléfonos desde Excel", onclick: () => openImport(ctx, refreshAfterImport, "directory") });
  const bannerHost = h("div");
  const onlyMineChk = h("input", { type: "checkbox", id: "onlyMine", checked: g.onlyMine, onchange: (e) => { g.onlyMine = e.target.checked; showSugg(); } });
  function drawBanner() {
    const any = S().clients.some((c) => c.contacts.some((x) => x.phone));
    bannerHost.replaceChildren(any ? "" : h("div", { class: "alert warn" }, h("strong", { text: "Aún no hay teléfonos cargados. " }), "Sube un Excel con el nombre del cliente y su celular y el número aparecerá solo al elegir cada cliente. ", h("button", { class: "btn btn-primary btn-sm", type: "button", text: "📞 Importar teléfonos desde Excel", onclick: () => openImport(ctx, refreshAfterImport, "directory") })));
  }
  const logChk = h("input", { type: "checkbox", id: "logChk", checked: g.logContact });
  const pickerHost = h("div");

  function setClient(c) {
    g.clientUid = c.uid; g.name = c.name; g.query = c.name;
    const primary = c.contacts.find((x) => x.primary && x.phone) || c.contacts.find((x) => x.phone) || c.contacts[0];
    g.contactCid = primary?.cid || "";
    g.phone = primary?.phone || ""; g.email = primary?.email || ""; g.contactName = primary?.name || "";
    if (!c.zone) { g.zoneSel = NONE; g.customZone = ""; }
    else if (S().config.zones.some((z) => nameKey(z) === nameKey(c.zone))) { g.zoneSel = S().config.zones.find((z) => nameKey(z) === nameKey(c.zone)); g.customZone = ""; }
    else { g.zoneSel = "Otra"; g.customZone = c.zone; }
    g.dirty = false;
    syncInputs(); generate(true);
  }

  function syncInputs() {
    const c = client();
    search.value = g.query; nameIn.value = g.name; phoneIn.value = g.phone;
    idOut.value = c?.id || ""; emailOut.value = g.email;
    zoneSel.value = g.zoneSel; customZone.value = g.customZone; customField.hidden = g.zoneSel !== "Otra";
    contactSel.replaceChildren(...(c?.contacts || []).map((ct, i) => h("option", { value: ct.cid, text: `${ct.name || `Contacto ${i + 1}`} — ${ct.phone || ct.email || "sin datos"}`, selected: ct.cid === g.contactCid })));
    contactField.hidden = !c || c.contacts.length < 2;
    tplView.value = tpl()?.body || "";
    checkPhone();
  }

  function checkPhone() {
    const v = validatePhone(g.phone, S().config.defaultCountryCode);
    phoneHint.className = `hint ${g.phone && !v.ok ? "error-text" : ""}`;
    const c = client();
    if (!g.phone) {
      phoneHint.textContent = c ? "Este cliente no tiene teléfono guardado: escríbelo aquí o importa tus teléfonos desde Excel." : "Elige un cliente o escribe un número.";
    } else phoneHint.textContent = v.ok ? `WhatsApp se abrirá con +${v.waNumber}` : `Teléfono no válido: ${v.reason}`;
    importPhonesBtn.hidden = !!g.phone && v.ok;
    return v;
  }

  function generate(auto = false) {
    if (auto && g.dirty) { drawWarn([], [], true); return; }
    const c = client();
    const contact = c?.contacts.find((x) => x.cid === g.contactCid) || { name: g.contactName };
    const values = buildValues({ config: S().config, client: { name: g.name.trim(), id: c?.id || "" }, contact, zone: resolveZone(g.zoneSel, g.customZone) });
    const r = renderTemplate(tpl().body, values, { seed: g.seed, emojis: S().config.emojis.enabled });
    msg.value = r.text; g.dirty = false;
    drawWarn(r.missing, r.unknown, false);
  }

  const MISSING_HELP = { nombre_cliente: "Falta el nombre del cliente.", nombre_comercial: "Falta tu nombre en Configuración → Identidad del comercial.", cargo_comercial: "Falta tu cargo en Configuración.", modelo_comercial: "Falta el modelo comercial en Configuración.", tarifa: "Falta la tarifa en Configuración → Oferta." };
  function drawWarn(missing, unknown, editedNote) {
    const items = [
      ...missing.map((k) => MISSING_HELP[k] || `Falta el dato: ${VARIABLES.find((v) => v.key === k)?.label || k}`),
      ...unknown.map((k) => `La plantilla usa una variable inexistente: {{${k}}} (se omitió).`),
    ];
    warnBox.replaceChildren();
    if (items.length) warnBox.append(h("div", { class: "alert warn", role: "alert" }, h("strong", { text: "Revisa antes de enviar" }), h("ul", {}, items.map((i) => h("li", { text: i })))));
    if (editedNote) warnBox.append(h("div", { class: "alert info", text: "Editaste el mensaje a mano; no se sobrescribió. Pulsa «Regenerar desde plantilla» para volver al texto de la plantilla." }));
    g.lastWarnings = items;
  }

  // --- eventos ---
  let active = -1, matches = [];
  function showSugg() {
    // Con la caja vacía también se despliega la lista (todos los clientes, A–Z) para poder recorrerla y elegir sin escribir.
    const r = searchClients(S().clients, search.value, { limit: 50, owner: g.onlyMine ? S().config.commercial.name : "" });
    matches = r.items; active = -1;
    const q = normalizeText(search.value), qd = digitsOnly(search.value);
    const row = (c, i) => {
      const tels = c.contacts.map((x) => x.phone).filter(Boolean), mails = c.contacts.map((x) => x.email).filter(Boolean);
      const found = (qd.length >= 3 && tels.find((t) => digitsOnly(t).includes(qd))) || (q && mails.find((m) => normalizeText(m).includes(q))) || "";
      return h("li", { role: "option", id: `sg${i}`, "aria-selected": "false", onmousedown: (e) => { e.preventDefault(); pick(c); } },
        c.name, h("span", { class: "meta", text: `ID: ${c.id || "—"} · ${c.zone || "Sin zona"}${tels.length ? ` · ${tels[0]}${tels.length > 1 ? ` (+${tels.length - 1})` : ""}` : " · sin teléfono"}${c.owner ? ` · de ${c.owner}` : ""}` }),
        found ? h("span", { class: "meta found", text: `Coincide: ${found}` }) : "");
    };
    const rows = matches.map(row);
    if (r.total > matches.length) rows.push(h("li", { class: "sugg-more", "aria-hidden": "true", text: `Mostrando ${matches.length} de ${r.total}: escribe para acotar la búsqueda.` }));
    if (!matches.length && search.value.trim()) rows.push(h("li", { class: "sugg-more", "aria-hidden": "true", text: "Ningún cliente coincide con esa búsqueda (se busca por nombre, número, correo, ID y localidad)." }));
    sugg.replaceChildren(...rows);
    const open = rows.length > 0;
    sugg.hidden = !open; search.setAttribute("aria-expanded", String(open));
  }
  function pick(c) { sugg.hidden = true; search.setAttribute("aria-expanded", "false"); setClient(c); }
  search.addEventListener("input", () => { g.query = search.value; showSugg(); });
  search.addEventListener("focus", showSugg);
  search.addEventListener("click", () => { if (sugg.hidden) showSugg(); });
  search.addEventListener("keydown", (e) => {
    if (sugg.hidden) { if (e.key === "ArrowDown") { e.preventDefault(); showSugg(); } return; }
    if (!matches.length) { if (e.key === "Escape") sugg.hidden = true; return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      [...sugg.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
      sugg.children[active]?.scrollIntoView?.({ block: "nearest" });
      search.setAttribute("aria-activedescendant", `sg${active}`);
    } else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === "Escape") { sugg.hidden = true; }
  });
  search.addEventListener("blur", () => setTimeout(() => (sugg.hidden = true), 120));

  nameIn.addEventListener("input", () => { g.name = nameIn.value; generate(true); });
  phoneIn.addEventListener("input", () => { g.phone = phoneIn.value; checkPhone(); });
  contactSel.addEventListener("change", () => {
    const ct = client().contacts.find((x) => x.cid === contactSel.value);
    g.contactCid = ct.cid; g.phone = ct.phone; g.email = ct.email; g.contactName = ct.name;
    phoneIn.value = g.phone; emailOut.value = g.email; checkPhone(); generate(true);
  });
  zoneSel.addEventListener("change", () => { g.zoneSel = zoneSel.value; customField.hidden = g.zoneSel !== "Otra"; generate(true); });
  customZone.addEventListener("input", () => { g.customZone = customZone.value; generate(true); });
  tplSel.addEventListener("change", async () => {
    if (g.dirty && !(await confirmDialog({ title: "Cambiar de plantilla", message: "Editaste el mensaje generado. Si cambias de plantilla se reemplazará.", confirmText: "Reemplazar", danger: true }))) { tplSel.value = g.tplId; return; }
    g.tplId = tplSel.value; g.dirty = false; tplView.value = tpl().body; generate();
  });
  msg.addEventListener("input", () => { g.dirty = true; g.text = msg.value; });
  logChk.addEventListener("change", () => { g.logContact = logChk.checked; });

  async function regenerate() {
    if (g.dirty && !(await confirmDialog({ title: "Volver a la plantilla", message: "Se descartarán tus ediciones del mensaje generado. La plantilla no cambia.", confirmText: "Descartar ediciones", danger: true }))) return;
    generate();
    toast("Mensaje regenerado desde la plantilla", "info");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(msg.value); }
    catch { msg.select(); document.execCommand?.("copy"); }
    track("msg_copy");
    toast("Mensaje copiado al portapapeles ✓");
  }
  async function openWa() {
    const v = checkPhone();
    if (!v.ok) {
      toast(g.phone ? `Teléfono no válido: ${v.reason}` : "Este cliente no tiene teléfono: escríbelo en el campo «Teléfono» o importa tus teléfonos.", "err", 5000);
      phoneIn.focus(); return;
    }
    if (!msg.value.trim()) { toast("El mensaje está vacío", "err"); return; }
    if (g.lastWarnings?.length && !(await confirmDialog({ title: "Hay datos faltantes", message: g.lastWarnings.join(" "), confirmText: "Abrir de todos modos" }))) return;
    window.open(whatsappUrl(v.waNumber, msg.value), "_blank", "noopener");
    track("wa_open");
    if (g.logContact && g.clientUid) logContact();
  }
  function logContact() {
    store.commit((d) => {
      const fu = d.followups[g.clientUid] || newFollowup(g.clientUid, d.config.statuses, { owner: client()?.owner || "" });
      const pending = stageOf(d.config.statuses, fu.status) === "pending";
      const first = d.config.statuses.find((s) => s.key === "primer_contacto" && s.active) || d.config.statuses.find((s) => s.stage === "contacted" && s.active);
      const patch = { note: `Mensaje preparado y abierto en WhatsApp (plantilla «${tpl().name}»)`, lastContactAt: undefined };
      if (pending && first) patch.status = first.key;
      if (d.config.commercial.name && !fu.owner) patch.owner = d.config.commercial.name;
      d.followups[g.clientUid] = updateFollowup(fu, patch, { by: d.config.commercial.name, statuses: d.config.statuses });
      d.followups[g.clientUid].lastContactAt = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    });
    toast("Contacto registrado en Seguimiento comercial", "info");
  }
  async function saveAsClient() {
    if (!g.name.trim()) { toast("Escribe el nombre del cliente", "err"); return; }
    store.commit((d) => {
      const now = new Date().toISOString();
      const uidv = `cl_${Date.now().toString(36)}`;
      d.clients.push({ uid: uidv, id: "", name: g.name.trim(), legalName: "", zone: resolveZone(g.zoneSel, g.customZone), owner: "", notes: "", createdAt: now, updatedAt: now,
        contacts: g.phone ? [{ cid: `ct_${Date.now().toString(36)}`, name: g.contactName, phone: g.phone, email: g.email, primary: true }] : [] });
      g.clientUid = uidv;
    });
    syncInputs(); toast("Cliente guardado en la base");
  }

  let picker = null;
  function togglePicker() {
    if (picker) { picker.remove(); picker = null; return; }
    picker = createEmojiPicker({ emojiConfig: S().config.emojis, onPick: (e) => { insertAtCursor(msg, e); }, onConfigChange: (ec) => store.commit((d) => { d.config.emojis = { ...d.config.emojis, ...ec }; }) });
    pickerHost.append(picker);
  }

  // --- estructura ---
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Generador de mensajes" }), h("p", { text: "Elige un cliente, revisa el mensaje y ábrelo en WhatsApp. Tú decides cada envío." }))),
    bannerHost,
    h("div", { class: "grid-2" },
      h("div", {},
        h("section", { class: "card", "aria-labelledby": "h-cli" },
          h("h2", { id: "h-cli", text: "1 · Cliente" }),
          h("div", { class: "field" }, h("label", { for: "gsearch", text: "Buscar cliente" }), (search.id = "gsearch", search), sugg),
          S().config.commercial.name ? h("div", { class: "check", style: "margin:-.3rem 0 .8rem" }, onlyMineChk, h("label", { for: "onlyMine", text: `Solo mis clientes (${S().config.commercial.name}: ${S().clients.filter((c) => normalizeText(c.owner) === normalizeText(S().config.commercial.name)).length})` })) : null,
          h("div", { class: "row" }, field("Nombre en el mensaje", nameIn), field("ID cliente / compañía", idOut)),
          contactField,
          h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "gphone", text: "Teléfono (WhatsApp)" }), (phoneIn.id = "gphone", phoneIn), (phoneHint.id = "gphone-h", phoneIn.setAttribute("aria-describedby", "gphone-h"), phoneHint), importPhonesBtn), field("Correo", emailOut)),
          h("div", { class: "row" }, field("Zona (opcional)", zoneSel), customField),
          h("div", { class: "actions" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Guardar este cliente en la base", onclick: saveAsClient, hidden: false }), h("a", { class: "btn btn-ghost btn-sm", href: "#/clientes", text: "Agregar o sincronizar clientes" })),
        ),
        h("section", { class: "card", "aria-labelledby": "h-tpl" },
          h("div", { class: "panel-title" }, h("h2", { id: "h-tpl", text: "2 · Mensaje plantilla" }), h("a", { href: "#/plantillas", text: "Editar plantillas" })),
          field("Plantilla", tplSel),
          h("label", { for: "tplview", text: "Texto base (solo lectura)" }), (tplView.id = "tplview", tplView),
          h("p", { class: "hint", text: "La plantilla nunca se modifica al generar o editar el mensaje." }),
        ),
      ),
      h("section", { class: "card", "aria-labelledby": "h-msg" },
        h("div", { class: "panel-title" }, h("h2", { id: "h-msg", text: "3 · Mensaje generado" }), h("span", { class: "badge", text: "Editable" })),
        warnBox,
        h("label", { class: "sr", for: "gmsg", text: "Mensaje generado" }), (msg.id = "gmsg", msg),
        pickerHost,
        h("div", { class: "actions" },
          h("button", { class: "btn btn-secondary", type: "button", text: "Regenerar desde plantilla", onclick: regenerate }),
          h("button", { class: "btn btn-ghost", type: "button", text: "Variar redacción", title: "Cambia entre las alternativas de redacción de la plantilla ([[a|b]]). Misma información, distinta frase.", onclick: () => { g.seed++; generate(); } }),
          h("button", { class: "btn btn-ghost", type: "button", text: "😊 Emojis", "aria-haspopup": "dialog", onclick: togglePicker }),
        ),
        h("div", { class: "actions" },
          h("button", { class: "btn btn-primary", type: "button", text: "Copiar mensaje", onclick: copy }),
          waBtn,
        ),
        h("div", { class: "check" }, logChk, h("label", { for: "logChk", text: "Registrar el contacto en Seguimiento comercial al abrir WhatsApp" })),
        h("p", { class: "hint", text: "La aplicación solo abre la conversación con el mensaje listo: no envía nada sola ni de forma masiva. Respeta las solicitudes de no contacto." }),
      ),
    ),
  );
  waBtn.addEventListener("click", openWa);
  if (!S().config.emojis.enabled) root.querySelector("h1").after(h("div", { class: "alert info", text: "Los emojis están desactivados en Configuración: se omiten del mensaje final." }));
  drawBanner();
  syncInputs();
  if (client() || g.name) { if (g.dirty) { msg.value = g.text || ""; drawWarn([], [], true); } else generate(); }
}
