import { h, toast, confirmDialog } from "./dom.js";
import { getPrefs, updatePrefs, resetPrefs } from "./prefs.js";
import { PRESETS, COLOR_KEYS, COLOR_LABELS, FONT_SIZES, RADII, normalizeHex, contrastWarnings } from "../core/theme.js";

const MODES = [{ v: "auto", l: "Automático", tip: "Sigue el modo claro u oscuro de tu computador." }, { v: "light", l: "Claro", tip: "Fondos claros siempre." }, { v: "dark", l: "Oscuro", tip: "Fondos oscuros siempre." }];

export function renderAppearance(root) {
  const prefsNow = () => getPrefs();
  const warn = h("div", { "aria-live": "polite" });
  const persist = (patch) => { if (!updatePrefs(patch)) toast("No se pudo guardar la apariencia en este navegador; se pierde al cerrar.", "err", 5000); refresh(); };

  /** Grupo de botones excluyentes (aria-pressed) para una preferencia. */
  function segmented(label, options, key) {
    const wrap = h("div", { class: "tabs", role: "group", "aria-label": label });
    const draw = () => wrap.replaceChildren(...options.map((o) => h("button", { type: "button", "aria-pressed": String(prefsNow()[key] === o.v), "data-tip": o.tip, text: o.l, onclick: () => persist({ [key]: o.v }) })));
    draw(); redraws.push(draw);
    return wrap;
  }
  const redraws = [];

  const grid = h("div", { class: "palette-grid", role: "group", "aria-label": "Paletas de colores" });
  const swatchSet = (c) => h("span", { class: "swatches", "aria-hidden": "true" }, ["brand", "accent", "bg", "surface", "text"].map((k) => h("i", { style: `background:${c[k]}` })));
  const drawGrid = () => {
    const p = prefsNow();
    const cards = Object.entries(PRESETS).map(([id, pr]) => h("button", { type: "button", class: "palette-card", "aria-pressed": String(p.palette === id), onclick: () => persist({ palette: id }) },
      swatchSet(pr.light), h("span", { text: pr.label })));
    cards.push(h("button", { type: "button", class: "palette-card", "aria-pressed": String(p.palette === "custom"), "data-tip": "Elige tú cada color de la aplicación.", onclick: () => startCustom() },
      swatchSet(p.custom), h("span", { text: "Personalizada" })));
    grid.replaceChildren(...cards);
  };
  redraws.push(drawGrid); drawGrid();

  // Al activar «Personalizada» se parte de los colores que se ven ahora, para no empezar desde cero.
  function startCustom() {
    const p = prefsNow();
    if (p.palette !== "custom") {
      const dark = p.mode === "dark" || (p.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      const base = PRESETS[p.palette] || PRESETS.pibox;
      persist({ palette: "custom", custom: { ...base[dark ? "dark" : "light"] } });
      drawCustom();
    } else persist({ palette: "custom" });
  }

  const customHost = h("div");
  function drawCustom() {
    const p = prefsNow();
    customHost.replaceChildren(h("div", { class: "color-grid" }, COLOR_KEYS.map((k) => {
      const picker = h("input", { type: "color", value: p.custom[k], "aria-label": COLOR_LABELS[k] });
      const hex = h("input", { type: "text", value: p.custom[k], maxlength: 7, "aria-label": `${COLOR_LABELS[k]} (código hex)`, spellcheck: "false" });
      const apply = (v) => { const n = normalizeHex(v); if (!n) return false; persist({ palette: "custom", custom: { ...prefsNow().custom, [k]: n } }); return n; };
      picker.addEventListener("input", () => { hex.value = picker.value; apply(picker.value); });
      hex.addEventListener("input", () => { const n = apply(hex.value); if (n) picker.value = n; hex.setAttribute("aria-invalid", n ? "false" : "true"); });
      return h("div", { class: "color-row" }, picker, h("div", {}, h("div", { class: "color-name", text: COLOR_LABELS[k] }), hex));
    })), h("p", { class: "hint", text: "Cambiar un color pasa automáticamente a «Personalizada». Los tonos de «hover», alertas y el texto sobre cada color se calculan solos." }));
  }
  drawCustom();

  function refresh() {
    redraws.forEach((fn) => fn());
    const p = prefsNow();
    const w = p.palette === "custom" ? contrastWarnings(p.custom) : [];
    warn.replaceChildren(w.length ? h("div", { class: "alert warn" }, h("strong", { text: "Ojo con la legibilidad: " }), h("ul", {}, w.map((t) => h("li", { text: t })))) : "");
    modeNote.hidden = p.palette !== "custom";
  }

  const tipsChk = h("input", { type: "checkbox", id: "tipsChk", checked: prefsNow().tips, onchange: (e) => persist({ tips: e.target.checked }) });
  const modeNote = h("p", { class: "hint", text: "Con una paleta personalizada el modo claro/oscuro no cambia tus colores; si el fondo que elijas es oscuro, el navegador adapta los controles solo." });

  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Apariencia" }), h("p", { text: "Cambia los colores y el tamaño de la aplicación. Se aplica al instante y solo en tu navegador." })),
      h("div", { class: "actions" }, h("button", { class: "btn btn-ghost", type: "button", text: "Restablecer apariencia", onclick: async () => {
        if (!(await confirmDialog({ title: "Restablecer apariencia", message: "Se vuelve al diseño original (morado Pibox, letra normal).", confirmText: "Restablecer" }))) return;
        resetPrefs(); root.replaceChildren(); renderAppearance(root); toast("Apariencia restablecida ✓");
      } }))),
    h("section", { class: "card" }, h("h2", { text: "Modo" }), segmented("Modo claro u oscuro", MODES, "mode"), modeNote),
    h("section", { class: "card" }, h("h2", { text: "Paleta de colores" }), grid, warn),
    h("section", { class: "card" }, h("h2", { text: "Colores personalizados" }), h("p", { class: "muted", text: "Ajusta cada parte de la aplicación: fondo, tarjetas, texto, botones, bordes y avisos." }), customHost),
    h("section", { class: "card" }, h("h2", { text: "Letra y formas" }),
      h("div", { class: "row" },
        h("div", { class: "field" }, h("span", { class: "label-like", text: "Tamaño de la letra" }), segmented("Tamaño de la letra", Object.entries(FONT_SIZES).map(([v, o]) => ({ v, l: o.label })), "fontSize")),
        h("div", { class: "field" }, h("span", { class: "label-like", text: "Esquinas" }), segmented("Forma de las esquinas", Object.entries(RADII).map(([v, o]) => ({ v, l: o.label })), "radius"))),
      h("div", { class: "check" }, tipsChk, h("label", { for: "tipsChk", text: "Mostrar ayudas flotantes al pasar el mouse sobre botones y opciones" }))),
    h("section", { class: "card" }, h("h2", { text: "Así se ve" }),
      h("div", { class: "actions" }, h("button", { class: "btn btn-primary", type: "button", text: "Botón principal" }), h("button", { class: "btn btn-secondary", type: "button", text: "Secundario" }), h("button", { class: "btn btn-ghost", type: "button", text: "Neutro" }), h("button", { class: "btn btn-danger", type: "button", text: "Peligro" }),
        h("span", { class: "badge", text: "Etiqueta" }), h("span", { class: "badge ok", text: "Éxito" }), h("span", { class: "badge warn", text: "Aviso" }), h("span", { class: "badge err", text: "Error" })),
      h("div", { class: "alert info", text: "Esto es un mensaje informativo." })),
  );
  refresh();
}
