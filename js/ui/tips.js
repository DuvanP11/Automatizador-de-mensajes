// Ayudas flotantes: globos al pasar el mouse / enfocar con teclado (atributo data-tip) y el panel «¿Cómo funciona?» de cada sección.
import { h } from "./dom.js";
import { HELP } from "../core/help.js";
import { getPrefs } from "./prefs.js";

let tipEl, current = null;

/** Coloca `el` junto a `target` (preferencia: pos) sin salirse de la pantalla. */
export function placeNear(el, target, pos = "bottom", gap = 10) {
  const r = target.getBoundingClientRect();
  const w = el.offsetWidth, hgt = el.offsetHeight, vw = innerWidth, vh = innerHeight;
  const spots = {
    right: () => [r.right + gap, r.top + r.height / 2 - hgt / 2],
    left: () => [r.left - w - gap, r.top + r.height / 2 - hgt / 2],
    bottom: () => [r.left + r.width / 2 - w / 2, r.bottom + gap],
    top: () => [r.left + r.width / 2 - w / 2, r.top - hgt - gap],
  };
  // A los lados solo importa el ajuste horizontal: la posición vertical se recorta al final.
  const fits = ([x, y], p) => x >= 4 && x + w <= vw - 4 && (p === "left" || p === "right" || (y >= 4 && y + hgt <= vh - 4));
  const order = [pos, { right: "left", left: "right", bottom: "top", top: "bottom" }[pos], "bottom", "top", "right", "left"];
  let [x, y] = spots[pos]();
  for (const p of order) { const c = spots[p](); if (fits(c, p)) { [x, y] = c; break; } }
  el.style.left = `${Math.max(4, Math.min(x, vw - w - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(y, vh - hgt - 4))}px`;
}

function show(target) {
  if (!getPrefs().tips) return;
  const text = target.getAttribute("data-tip");
  if (!text) return;
  hide();
  const title = target.getAttribute("data-tip-title");
  tipEl.replaceChildren(...(title ? [h("strong", { text: title }), h("span", { text })] : [h("span", { text })]));
  tipEl.hidden = false;
  tipEl.style.left = "0px"; tipEl.style.top = "0px";
  placeNear(tipEl, target, target.getAttribute("data-tip-pos") || "bottom");
  target.setAttribute("aria-describedby", tipEl.id);
  current = target;
}
function hide() {
  if (!tipEl) return;
  tipEl.hidden = true;
  current?.removeAttribute("aria-describedby");
  current = null;
}

export function initTips() {
  tipEl = h("div", { class: "tip", role: "tooltip", id: "tip-pop", hidden: true });
  document.body.append(tipEl);
  const find = (e) => (e.target instanceof Element ? e.target.closest("[data-tip]") : null);
  document.addEventListener("mouseover", (e) => { const t = find(e); if (t && t !== current) show(t); else if (!t) hide(); });
  document.addEventListener("focusin", (e) => { const t = find(e); if (t) show(t); });
  document.addEventListener("focusout", hide);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  document.addEventListener("scroll", hide, true);
  document.addEventListener("click", (e) => { if (!find(e)) hide(); });
}

/** Marca con data-tip los controles de la sección según HELP[path].controls (por texto exacto de botón, enlace o etiqueta). */
export function applyControlTips(root, path) {
  const rules = HELP[path]?.controls || [];
  if (!rules.length) return;
  const els = [...root.querySelectorAll("button, a.btn, label, summary, h2, h3")];
  for (const { match, tip } of rules) {
    for (const el of els) {
      if (el.textContent.trim() !== match || el.hasAttribute("data-tip")) continue;
      el.setAttribute("data-tip", tip);
      if (el instanceof HTMLLabelElement && el.control) el.control.setAttribute("data-tip", tip);
    }
  }
}

// ---------- Panel «¿Cómo funciona esta sección?» ----------
let panel, fab, panelPath = null, panelTitle = "";

function section(title, items, ordered) {
  if (!items?.length) return null;
  return h("div", {}, h("h4", { text: title }), h(ordered ? "ol" : "ul", {}, items.map((t) => h("li", { text: t }))));
}

export function closeHelp() {
  if (panel) panel.hidden = true;
  fab?.setAttribute("aria-expanded", "false");
}

export function mountHelpButton(navigate) {
  fab = h("button", { class: "help-fab", type: "button", "aria-expanded": "false", "aria-controls": "help-panel", "aria-label": "¿Cómo funciona esta sección?", "data-tip": "¿Cómo funciona esta sección? Pasos y cómo ajustarla.", "data-tip-pos": "left", text: "?" });
  panel = h("aside", { class: "help-panel", id: "help-panel", role: "dialog", "aria-label": "Ayuda de la sección", hidden: true });
  document.body.append(panel, fab);
  fab.addEventListener("click", () => {
    if (!panel.hidden) { closeHelp(); return; }
    drawHelp(navigate);
    panel.hidden = false;
    fab.setAttribute("aria-expanded", "true");
    panel.querySelector("button")?.focus();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel && !panel.hidden) { closeHelp(); fab.focus(); } });
}

function drawHelp(navigate) {
  const hp = HELP[panelPath];
  if (!hp) { panel.replaceChildren(); return; }
  panel.replaceChildren(
    h("div", { class: "help-head" }, h("h3", { text: panelTitle }), h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "Cerrar ayuda", text: "✕", onclick: () => { closeHelp(); fab.focus(); } })),
    h("p", { text: hp.summary }),
    section("Cómo se usa", hp.steps, true),
    section("Cómo ajustarlo", hp.adjust, false),
    h("div", { class: "actions" }, panelPath !== "tutorial" ? h("button", { class: "btn btn-secondary btn-sm", type: "button", text: "Ver el tutorial completo", onclick: () => { closeHelp(); navigate("tutorial"); } }) : null),
  );
}

/** Se llama en cada cambio de sección. */
export function setHelpSection(path, title) {
  panelPath = path; panelTitle = title;
  if (panel && !panel.hidden) drawHelp((p) => { location.hash = `#/${p}`; });
}
