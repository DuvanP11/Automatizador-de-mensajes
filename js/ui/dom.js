// Helpers de DOM. Nunca se usa innerHTML con datos: todo texto entra por textContent (a prueba de HTML/JS en celdas de Excel).

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden" || k === "open") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let seq = 0;
/** Campo con <label> asociado. `control` es el input/select/textarea ya creado. */
export function field(label, control, hint) {
  const id = control.id || `f${++seq}`;
  control.id = id;
  const wrap = h("div", { class: "field" }, h("label", { for: id, text: label }), control);
  if (hint) {
    const hid = `${id}-hint`;
    control.setAttribute("aria-describedby", hid);
    wrap.append(h("small", { id: hid, class: "hint", text: hint }));
  }
  return wrap;
}

export function select(options, value, props = {}) {
  const s = h("select", props);
  for (const o of options) {
    const opt = typeof o === "string" ? { value: o, label: o } : o;
    s.append(h("option", { value: opt.value, text: opt.label, selected: opt.value === value }));
  }
  if (value !== undefined) s.value = value;
  return s;
}

let toastHost;
export function toast(message, type = "ok", ms = 3200) {
  if (!toastHost) {
    toastHost = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const t = h("div", { class: `toast toast-${type}`, text: message });
  toastHost.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Diálogo de confirmación accesible. Devuelve Promise<boolean>. */
export function confirmDialog({ title, message, confirmText = "Confirmar", cancelText = "Cancelar", danger = false }) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "dialog", "aria-labelledby": "dlg-title" },
      h("h3", { id: "dlg-title", text: title }),
      h("p", { text: message }),
      h("div", { class: "actions end" },
        h("button", { class: "btn btn-ghost", type: "button", text: cancelText, onclick: () => dlg.close("no") }),
        h("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, type: "button", text: confirmText, onclick: () => dlg.close("yes") }),
      ),
    );
    dlg.addEventListener("close", () => { resolve(dlg.returnValue === "yes"); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Diálogo genérico con contenido propio; devuelve el <dialog> (ya abierto). */
export function openDialog(title, content, { wide = false } = {}) {
  const dlg = h("dialog", { class: `dialog${wide ? " wide" : ""}`, "aria-labelledby": "dlg-title2" },
    h("div", { class: "dialog-head" },
      h("h3", { id: "dlg-title2", text: title }),
      h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "Cerrar", text: "✕", onclick: () => dlg.close() }),
    ),
    content,
  );
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function download(data, filename, mime = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadWorkbook(XLSX, wb, filename) {
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export function emptyState(title, text, action) {
  return h("div", { class: "empty" }, h("div", { class: "empty-icon", "aria-hidden": "true", text: "∅" }), h("strong", { text: title }), h("p", { text }), action || null);
}

export function insertAtCursor(textarea, text) {
  const s = textarea.selectionStart ?? textarea.value.length;
  const e = textarea.selectionEnd ?? s;
  textarea.setRangeText(text, s, e, "end");
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function fmtDate(iso) {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().join("/");
  return new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
}
