import { h, field, toast, confirmDialog, download, insertAtCursor } from "./dom.js";
import { openImport } from "./clients.js";
import { VARIABLES, whatsappUrl } from "../core/templates.js";
import { normalizeText, nameKey, uid, validatePhone, todayBogota } from "../core/util.js";
import { newFollowup, updateFollowup, stageOf } from "../core/followup.js";
import { MAX_VARIANTS, DEFAULT_PACE, newBroadcast, validateMedia, planRecipients, buildRunItems, newRun, nextDelaySeconds, sentTodayCount, runProgress, currentItem } from "../core/broadcast.js";
import { putMedia, getMedia, deleteMedia, copyImageToClipboard, canShareFile } from "./media-db.js";

const SAMPLE = [["{{saludo}} {{nombre_cliente}} 👋", "Te compartimos un comunicado importante de Pibox."], ["[[Hola|Buen día|Qué tal]] {{nombre_cliente}}", "Queremos contarte una novedad de Pibox."]];

export function renderBroadcast(root, ctx) {
  const { store } = ctx;
  const S = () => store.state;
  const v = (ctx.bc ||= { broadcastId: "", runId: "", selected: new Set(), query: "", owner: "", zone: "", onlyPhone: true, sortKey: "name", sortDir: 1, pace: { ...DEFAULT_PACE }, skipNotInterested: true });
  let draft = null, mediaFile = null, previewUrl = "", timer = null;

  const stop = () => { clearInterval(timer); timer = null; if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ""; } };
  const draw = () => { stop(); root.replaceChildren(); v.runId && S().runs.some((r) => r.id === v.runId) ? drawRun() : drawSetup(); };

  // ============ Preparación ============
  function loadDraft() {
    const saved = S().broadcasts.find((b) => b.id === v.broadcastId);
    draft = saved ? JSON.parse(JSON.stringify(saved)) : newBroadcast(uid("bc"));
    mediaFile = null;
  }

  async function drawSetup() {
    if (!draft) loadDraft();
    const unsaved = !S().broadcasts.some((b) => b.id === draft.id);
    const clients = S().clients;

    const picker = h("select", { onchange: (e) => { v.broadcastId = e.target.value; draft = null; draw(); } },
      h("option", { value: "", text: "＋ Comunicado nuevo", selected: !v.broadcastId }),
      ...S().broadcasts.map((b) => h("option", { value: b.id, text: b.name || "(sin nombre)", selected: b.id === v.broadcastId })));

    // --- archivo adjunto ---
    const mediaBox = h("div", { class: "media-box" });
    async function drawMedia() {
      mediaBox.replaceChildren();
      let blob = mediaFile;
      if (!blob && draft.media) { try { blob = await getMedia(draft.id); } catch { /* sin archivo guardado */ } }
      if (blob) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        const isVideo = (draft.media?.type || blob.type).startsWith("video/");
        mediaBox.append(
          isVideo ? h("video", { src: previewUrl, controls: true, preload: "metadata", class: "media-prev" }) : h("img", { src: previewUrl, alt: "Vista previa del archivo adjunto", class: "media-prev" }),
          h("div", { class: "hint", text: `${draft.media.name} · ${(draft.media.size / 1048576).toFixed(1)} MB` }),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Quitar archivo", onclick: async () => { mediaFile = null; draft.media = null; if (!unsaved) await deleteMedia(draft.id).catch(() => {}); drawMedia(); } }));
      } else if (draft.media) {
        mediaBox.append(h("div", { class: "alert warn", text: "El archivo de este comunicado ya no está en este navegador. Vuelve a adjuntarlo." }));
      }
    }
    const fileIn = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,video/quicktime", onchange: (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      const chk = validateMedia(f);
      if (!chk.ok) { toast(chk.reason, "err", 6000); return; }
      mediaFile = f; draft.media = { name: f.name, type: f.type, size: f.size }; drawMedia();
    } });

    // --- redacciones alternas ---
    const varBox = h("div");
    function drawVariants() {
      varBox.replaceChildren(...draft.variants.map((va, i) => h("div", { class: "variant" },
        h("div", { class: "panel-title" }, h("label", { for: `bv${i}`, text: `Redacción ${String.fromCharCode(65 + i)}` }),
          draft.variants.length > 1 ? h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Quitar", onclick: () => { draft.variants.splice(i, 1); drawVariants(); } }) : null),
        h("textarea", { id: `bv${i}`, rows: 6, placeholder: "Escribe el comunicado. Puedes usar variables como {{nombre_cliente}}.", value: va.body, oninput: (e) => { va.body = e.target.value; } }),
        h("div", { class: "chips" }, ["nombre_cliente", "nombre_contacto", "saludo", "nombre_comercial", "zona"].map((k) => h("button", { class: "chip", type: "button", text: `{{${k}}}`, title: VARIABLES.find((x) => x.key === k)?.label, onclick: () => insertAtCursor(varBox.querySelector(`#bv${i}`), `{{${k}}}`) }))))));
    }

    const nameIn = h("input", { type: "text", value: draft.name, placeholder: "Ej.: Comunicado nuevo horario de despachos", oninput: (e) => { draft.name = e.target.value; } });

    async function saveDraft() {
      if (!draft.name.trim()) { toast("Ponle un nombre al comunicado", "err"); nameIn.focus(); return false; }
      if (!draft.variants.some((x) => x.body.trim())) { toast("Escribe al menos una redacción", "err"); return false; }
      try { if (mediaFile) await putMedia(draft.id, mediaFile); }
      catch { toast("No se pudo guardar el archivo en este navegador (almacenamiento lleno o bloqueado).", "err", 6000); return false; }
      store.commit((d) => { const i = d.broadcasts.findIndex((b) => b.id === draft.id); i >= 0 ? (d.broadcasts[i] = JSON.parse(JSON.stringify(draft))) : d.broadcasts.push(JSON.parse(JSON.stringify(draft))); });
      v.broadcastId = draft.id; mediaFile = null;
      return true;
    }

    // --- destinatarios ---
    const owners = [...new Set(clients.map((c) => c.owner).filter(Boolean))].sort();
    const zones = [...new Set(clients.map((c) => c.zone).filter(Boolean))].sort();
    const tableHost = h("div", { class: "table-wrap", style: "max-height:380px;overflow:auto" });
    const countOut = h("strong");
    const hasPhone = (c) => c.contacts.some((ct) => validatePhone(ct.phone, S().config.defaultCountryCode).ok);
    const visible = () => {
      const q = normalizeText(v.query);
      return clients.filter((c) => (!q || normalizeText(`${c.name} ${c.id} ${c.legalName} ${c.zone}`).includes(q)) && (!v.owner || c.owner === v.owner) && (!v.zone || c.zone === v.zone) && (!v.onlyPhone || hasPhone(c)));
    };
    const phoneOf = (c) => c.contacts.map((ct) => validatePhone(ct.phone, S().config.defaultCountryCode)).find((r) => r.ok);
    const SORT = { name: (c) => c.name, id: (c) => c.id, zone: (c) => c.zone, phone: (c) => phoneOf(c)?.waNumber || "" };
    function drawTable() {
      const dup = new Map();
      clients.forEach((c) => { const k = nameKey(c.name); dup.set(k, (dup.get(k) || 0) + 1); });
      const get = SORT[v.sortKey];
      const rows = visible().sort((a, b) => v.sortDir * String(get(a)).localeCompare(String(get(b)), "es", { sensitivity: "base", numeric: true }));
      const shown = rows.slice(0, 300);
      const allOn = rows.length > 0 && rows.every((c) => v.selected.has(c.uid));
      const th = (key, label) => h("th", { "aria-sort": v.sortKey === key ? (v.sortDir > 0 ? "ascending" : "descending") : "none" },
        h("button", { class: "sort-btn", type: "button", title: "Ordenar de A a Z / de Z a A", text: `${label}${v.sortKey === key ? (v.sortDir > 0 ? " ▲" : " ▼") : ""}`, onclick: () => { v.sortDir = v.sortKey === key ? -v.sortDir : 1; v.sortKey = key; drawTable(); } }));
      tableHost.replaceChildren(h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, h("input", { type: "checkbox", "aria-label": "Seleccionar todos los que se ven", checked: allOn, onchange: (e) => { rows.forEach((c) => (e.target.checked ? v.selected.add(c.uid) : v.selected.delete(c.uid))); drawTable(); } })), th("name", "Cliente"), th("id", "ID"), th("zone", "Zona"), th("phone", "Teléfono"))),
        h("tbody", {}, shown.map((c) => {
          const ph = phoneOf(c);
          return h("tr", {}, h("td", {}, h("input", { type: "checkbox", "aria-label": `Seleccionar ${c.name}`, checked: v.selected.has(c.uid), onchange: (e) => { e.target.checked ? v.selected.add(c.uid) : v.selected.delete(c.uid); countOut.textContent = String(v.selected.size); } })),
            h("td", {}, c.name, dup.get(nameKey(c.name)) > 1 ? h("span", { class: "badge warn", style: "margin-left:.5rem", text: "Repetido" }) : null), h("td", { text: c.id || "—" }), h("td", { text: c.zone || "—" }), h("td", {}, ph ? `+${ph.waNumber}` : h("span", { class: "badge warn", text: "Sin teléfono" })));
        }))));
      if (rows.length > shown.length) tableHost.append(h("p", { class: "hint", style: "padding:.5rem", text: `Se muestran ${shown.length} de ${rows.length}. Afina la búsqueda; «seleccionar todos» marca los ${rows.length}.` }));
      countOut.textContent = String(v.selected.size);
    }

    const paceIn = (key, label, min, hint) => field(label, h("input", { type: "number", min, value: v.pace[key], oninput: (e) => { v.pace[key] = Number(e.target.value); } }), hint);

    // --- acciones ---
    async function prepare() {
      if (!(await saveDraft())) return;
      const plan = planRecipients({ clients, uids: [...v.selected], followups: S().followups, statuses: S().config.statuses, countryCode: S().config.defaultCountryCode, skipNotInterested: v.skipNotInterested });
      if (!plan.ok.length) { toast("Ninguno de los clientes elegidos tiene un teléfono válido.", "err", 5000); return; }
      let built;
      try { built = buildRunItems({ recipients: plan.ok, variants: draft.variants, config: S().config }); } catch (e) { toast(e.message, "err"); return; }
      const lines = [`Se enviará a ${plan.ok.length} cliente(s), de a uno y con una pausa de ${v.pace.minDelay}–${v.pace.maxDelay} s entre cada envío.`];
      if (plan.skipped.length) lines.push(`Se omiten ${plan.skipped.length}: ${plan.skipped.slice(0, 4).map((s) => `${s.name} (${s.reason})`).join("; ")}${plan.skipped.length > 4 ? "…" : ""}.`);
      if (built.warnings.length) lines.push(`Ojo: faltan datos para {{${built.warnings.join("}}, {{")}}} (revisa Configuración).`);
      if (!(await confirmDialog({ title: "Preparar envío", message: lines.join(" "), confirmText: "Preparar cola" }))) return;
      const run = newRun({ id: uid("run"), broadcast: draft, items: built.items, pace: v.pace });
      store.commit((d) => { d.runs.unshift(run); d.runs = d.runs.slice(0, 20); });
      v.runId = run.id; draw();
    }
    async function remove() {
      if (!(await confirmDialog({ title: "Eliminar comunicado", message: `Se borrará «${draft.name}» y su archivo adjunto. Los envíos ya preparados no se tocan.`, confirmText: "Eliminar", danger: true }))) return;
      store.commit((d) => { d.broadcasts = d.broadcasts.filter((b) => b.id !== draft.id); });
      await deleteMedia(draft.id).catch(() => {});
      v.broadcastId = ""; draft = null; draw();
    }

    const runsList = S().runs.length ? h("section", { class: "card" }, h("h2", { text: "Envíos preparados" }),
      h("ul", { class: "plain" }, S().runs.map((r) => { const p = runProgress(r); return h("li", { class: "panel-title" },
        h("span", { text: `${r.name} · ${new Date(r.createdAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} · ${p.sent} de ${p.total} enviados${p.pending ? "" : " ✓"}` }),
        h("span", {}, h("button", { class: "btn btn-secondary btn-sm", type: "button", text: p.pending ? "Continuar" : "Ver", onclick: () => { v.runId = r.id; draw(); } }), " ",
          h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Borrar", onclick: async () => { if (await confirmDialog({ title: "Borrar envío", message: "Se pierde el avance de esta cola.", confirmText: "Borrar", danger: true })) { store.commit((d) => { d.runs = d.runs.filter((x) => x.id !== r.id); }); draw(); } } }))); }))) : null;

    root.append(
      h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Comunicados" }), h("p", { text: "Envía una imagen o un video con su texto a varios clientes, de a uno y con pausas, alternando la redacción." }))),
      h("div", { class: "alert info" }, "WhatsApp no deja que una página web adjunte archivos por sí sola, así que la herramienta te deja todo listo para cada cliente y tú das el clic final. Así se mantiene un ritmo humano; lo masivo y automático desde una línea personal es lo que más expone la cuenta a bloqueos."),
      h("section", { class: "card", "aria-labelledby": "h-c1" },
        h("div", { class: "panel-title" }, h("h2", { id: "h-c1", text: "1 · Comunicado" }), h("div", { class: "row", style: "flex-wrap:nowrap;align-items:center" }, picker)),
        field("Nombre interno", nameIn),
        field("Imagen o video (opcional)", fileIn, "JPG, PNG, WebP, MP4, 3GP o MOV; hasta 16 MB. Se guarda solo en este navegador."),
        mediaBox,
        h("h3", { text: "Redacciones" }),
        h("p", { class: "hint", text: "Cada cliente recibe una redacción distinta a la del anterior. Escribe 2 o más versiones con las mismas ideas pero otras palabras; dentro de cada una puedes usar [[Hola|Buen día]] para variar frases." }),
        varBox,
        h("div", { class: "actions" },
          h("button", { class: "btn btn-secondary btn-sm", type: "button", text: "+ Agregar redacción", onclick: () => { if (draft.variants.length >= MAX_VARIANTS) return toast(`Máximo ${MAX_VARIANTS} redacciones`, "err"); draft.variants.push({ id: uid("v"), body: "" }); drawVariants(); } }),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Cargar ejemplo", onclick: () => { draft.variants = SAMPLE.map(([a, b], i) => ({ id: `v${i + 1}`, body: `${a}\n\n${b}` })); drawVariants(); } }),
          h("button", { class: "btn btn-primary btn-sm", type: "button", text: "Guardar comunicado", onclick: async () => { if (await saveDraft()) { toast("Comunicado guardado"); draw(); } } }),
          !unsaved ? h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Eliminar", onclick: remove }) : null)),
      h("section", { class: "card", "aria-labelledby": "h-c2" },
        h("div", { class: "panel-title" }, h("h2", { id: "h-c2", text: "2 · Clientes que lo recibirán" }), h("button", { class: "btn btn-secondary btn-sm", type: "button", text: "Adjuntar clientes y teléfonos desde Excel", onclick: () => openImport(ctx, () => draw()) })),
        h("div", { class: "row" },
          field("Buscar", h("input", { type: "search", placeholder: "Nombre, ID o zona", value: v.query, oninput: (e) => { v.query = e.target.value; drawTable(); } })),
          field("Comercial", h("select", { onchange: (e) => { v.owner = e.target.value; drawTable(); } }, h("option", { value: "", text: "Todos" }), owners.map((o) => h("option", { value: o, text: o, selected: o === v.owner })))),
          field("Zona", h("select", { onchange: (e) => { v.zone = e.target.value; drawTable(); } }, h("option", { value: "", text: "Todas" }), zones.map((o) => h("option", { value: o, text: o, selected: o === v.zone }))))),
        h("div", { class: "check", style: "margin-bottom:.6rem" }, h("input", { id: "bcPhone", type: "checkbox", checked: v.onlyPhone, onchange: (e) => { v.onlyPhone = e.target.checked; drawTable(); } }), h("label", { for: "bcPhone", text: "Mostrar solo clientes con teléfono válido" })),
        h("div", { class: "check", style: "margin-bottom:.6rem" }, h("input", { id: "bcNoInt", type: "checkbox", checked: v.skipNotInterested, onchange: (e) => { v.skipNotInterested = e.target.checked; } }), h("label", { for: "bcNoInt", text: "Excluir a los marcados «No interesado» en Seguimiento comercial" })),
        h("div", { class: "actions" }, h("span", {}, "Seleccionados: ", countOut), h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Limpiar selección", onclick: () => { v.selected.clear(); drawTable(); } })),
        tableHost),
      h("section", { class: "card", "aria-labelledby": "h-c3" },
        h("h2", { id: "h-c3", text: "3 · Ritmo de envío" }),
        h("div", { class: "row" }, paceIn("minDelay", "Pausa mínima (segundos)", 10), paceIn("maxDelay", "Pausa máxima (segundos)", 10), paceIn("dailyCap", "Tope de envíos por día", 1, "Cuentas nuevas o poco usadas: empieza con 20–30.")),
        h("p", { class: "hint", text: "Entre un cliente y otro la herramienta espera un tiempo al azar dentro de ese rango antes de dejarte abrir el siguiente chat." }),
        h("div", { class: "actions" }, h("button", { class: "btn btn-primary", type: "button", text: "Preparar envío", onclick: prepare }))),
      runsList,
    );
    drawVariants(); drawTable(); drawMedia();
  }

  // ============ Cola de envío ============
  async function drawRun() {
    const get = () => S().runs.find((r) => r.id === v.runId);
    const mut = (fn) => store.commit((d) => fn(d.runs.find((r) => r.id === v.runId), d));
    let blob = null;
    const r0 = get();
    if (r0.media) { try { blob = await getMedia(r0.broadcastId); } catch { /* sin archivo */ } }
    const logChk = h("input", { id: "bcLog", type: "checkbox", checked: true });
    const host = h("div");

    function paint() {
      const run = get(), p = runProgress(run), cur = currentItem(run), cap = run.pace.dailyCap, today = sentTodayCount(run);
      const capHit = today >= cap, wait = Math.max(0, Math.ceil((run.nextAt - Date.now()) / 1000));
      host.replaceChildren(
        h("section", { class: "card" },
          h("div", { class: "panel-title" }, h("h2", { text: run.name }), h("span", { class: "badge", text: `${p.sent} enviados · ${p.skipped} omitidos · ${p.pending} pendientes` })),
          h("progress", { max: p.total, value: p.sent + p.skipped, style: "width:100%", "aria-label": "Avance del envío" }),
          h("p", { class: "hint", text: `Hoy: ${today} de ${cap} permitidos.` })),
        !cur ? h("div", { class: "alert ok", text: "Terminaste la cola. Todos los clientes fueron enviados u omitidos." })
          : capHit ? h("div", { class: "alert warn", text: `Llegaste al tope de ${cap} envíos de hoy. Continúa mañana desde «Envíos preparados»: lo pendiente se conserva.` })
          : h("section", { class: "card", "aria-labelledby": "h-cur" },
            h("h2", { id: "h-cur", text: `Siguiente: ${cur.name}` }),
            h("p", { class: "hint", text: `+${cur.waNumber} · redacción ${String.fromCharCode(64 + cur.variant)}` }),
            h("textarea", { rows: 8, "aria-label": "Mensaje para este cliente", value: cur.text, oninput: (e) => { cur.text = e.target.value; mut((r) => { r.items.find((i) => i.uid === cur.uid).text = e.target.value; }); } }),
            blob ? h("div", { class: "actions" },
              blob.type.startsWith("image/") ? h("button", { class: "btn btn-secondary", type: "button", text: "Copiar imagen", onclick: async () => { try { await copyImageToClipboard(blob); toast("Imagen copiada: pégala en el chat con Ctrl+V (⌘V en Mac)"); } catch (e) { toast(e.message, "err", 6000); } } }) : null,
              h("button", { class: "btn btn-ghost", type: "button", text: `Descargar ${blob.type.startsWith("image/") ? "imagen" : "video"}`, onclick: () => download(blob, run.media.name, blob.type) }),
              canShareFile(new File([blob], run.media.name, { type: blob.type })) ? h("button", { class: "btn btn-ghost", type: "button", text: "Compartir…", onclick: () => navigator.share({ files: [new File([blob], run.media.name, { type: blob.type })], text: cur.text }).catch(() => {}) }) : null) : null,
            h("div", { class: "actions" },
              h("button", { class: "btn btn-primary", type: "button", id: "bcOpen", text: wait ? `Espera ${wait} s…` : "Abrir WhatsApp", disabled: wait > 0, onclick: () => window.open(whatsappUrl(cur.waNumber, cur.text), "_blank", "noopener") }),
              h("button", { class: "btn btn-secondary", type: "button", text: "✓ Ya lo envié", onclick: () => markSent(cur) }),
              h("button", { class: "btn btn-ghost", type: "button", text: "Omitir", onclick: () => { mut((r) => { r.items.find((i) => i.uid === cur.uid).status = "skipped"; }); paint(); } })),
            blob ? h("p", { class: "hint", text: "Pasos: 1) «Abrir WhatsApp»; 2) pega la imagen con Ctrl+V (o adjunta el video con el clip 📎) en esa conversación; 3) envía; 4) vuelve aquí y pulsa «Ya lo envié». Prueba primero con un cliente tuyo para ver cómo queda el texto junto al archivo." }) : h("p", { class: "hint", text: "Pasos: «Abrir WhatsApp», envía el mensaje y vuelve a pulsar «Ya lo envié»." }),
            h("div", { class: "check" }, logChk, h("label", { for: "bcLog", text: "Anotar el contacto en Seguimiento comercial" }))),
        h("section", { class: "card" }, h("h3", { text: "Cola" }),
          h("div", { class: "table-wrap", style: "max-height:300px;overflow:auto" }, h("table", {}, h("tbody", {}, run.items.map((i) => h("tr", {}, h("td", { text: i.name }), h("td", { text: `+${i.waNumber}` }), h("td", { text: String.fromCharCode(64 + i.variant) }),
            h("td", {}, h("span", { class: `badge ${i.status === "sent" ? "ok" : i.status === "skipped" ? "warn" : ""}`, text: { sent: "Enviado", skipped: "Omitido", pending: "Pendiente" }[i.status] }))))))),
          h("div", { class: "actions" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Exportar resultado (CSV)", onclick: () => exportCsv(run) }))));
    }

    function markSent(cur) {
      const run = get();
      const delay = nextDelaySeconds(run.pace.minDelay, run.pace.maxDelay);
      const now = new Date();
      mut((r, d) => {
        r.items.find((i) => i.uid === cur.uid).status = "sent"; r.items.find((i) => i.uid === cur.uid).sentAt = now.toISOString();
        r.nextAt = Date.now() + delay * 1000;
        const c = d.clients.find((x) => x.uid === cur.uid);
        if (logChk.checked && c) {
          const fu = d.followups[c.uid] || newFollowup(c.uid, d.config.statuses, { owner: c.owner || "" });
          const first = d.config.statuses.find((s) => s.key === "primer_contacto" && s.active) || d.config.statuses.find((s) => s.stage === "contacted" && s.active);
          const patch = { note: `Comunicado «${r.name}» enviado por WhatsApp` };
          if (stageOf(d.config.statuses, fu.status) === "pending" && first) patch.status = first.key;
          d.followups[c.uid] = updateFollowup(fu, patch, { by: d.config.commercial.name, statuses: d.config.statuses });
          d.followups[c.uid].lastContactAt = todayBogota();
        }
      });
      paint();
    }

    function exportCsv(run) {
      const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const rows = [["Cliente", "Teléfono", "Redacción", "Estado", "Enviado el"], ...run.items.map((i) => [i.name, `+${i.waNumber}`, String.fromCharCode(64 + i.variant), i.status, i.sentAt])];
      download("﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n"), `${run.name.replace(/[^\w-]+/g, "_")}.csv`, "text/csv;charset=utf-8");
    }

    root.append(h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Envío de comunicado" }), h("p", { text: "Un cliente a la vez. El avance se guarda: puedes cerrar y seguir después." })),
      h("button", { class: "btn btn-ghost", type: "button", text: "← Volver a Comunicados", onclick: () => { v.runId = ""; draw(); } })), host);
    paint();
    // Actualiza la cuenta regresiva; se detiene sola al salir de la pantalla.
    timer = setInterval(() => {
      if (!root.isConnected) return stop();
      const open = host.querySelector("#bcOpen"), run = get();
      if (!open || !run) return;
      const wait = Math.max(0, Math.ceil((run.nextAt - Date.now()) / 1000));
      open.disabled = wait > 0; open.textContent = wait ? `Espera ${wait} s…` : "Abrir WhatsApp";
    }, 500);
  }

  draw();
}
