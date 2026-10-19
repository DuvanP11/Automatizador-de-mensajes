// Tema visual: el usuario elige 10 colores base y todo lo demás (tonos de botones, fondos de alertas,
// texto sobre cada color) se deriva de ellos, así cualquier combinación mantiene la interfaz legible.

export const COLOR_KEYS = ["brand", "accent", "bg", "surface", "text", "muted", "border", "ok", "warn", "err"];

export const COLOR_LABELS = {
  brand: "Color principal (botones, menú activo, títulos de cifras)",
  accent: "Acento (resaltado al navegar con teclado)",
  bg: "Fondo de la página",
  surface: "Fondo de tarjetas, menú y campos",
  text: "Texto",
  muted: "Texto secundario",
  border: "Bordes y separadores",
  ok: "Éxito",
  warn: "Advertencia",
  err: "Error",
};

const DARK_STATUS = { ok: "#62d49a", warn: "#f5c566", err: "#ff8a82" };
const LIGHT_STATUS = { ok: "#167a4a", warn: "#8a5a00", err: "#b3261e" };

export const PRESETS = {
  pibox: {
    label: "Pibox (morado)",
    light: { brand: "#5b2a86", accent: "#f5b83d", bg: "#faf8fc", surface: "#ffffff", text: "#231a2e", muted: "#6b6277", border: "#e4dcee", ...LIGHT_STATUS },
    dark: { brand: "#b88ae6", accent: "#f5b83d", bg: "#16111c", surface: "#1f1828", text: "#efe9f6", muted: "#a79bb8", border: "#3a2f48", ...DARK_STATUS },
  },
  oceano: {
    label: "Océano (azul)",
    light: { brand: "#0b6e99", accent: "#f59e0b", bg: "#f4f9fc", surface: "#ffffff", text: "#10222e", muted: "#587081", border: "#d3e3ec", ...LIGHT_STATUS },
    dark: { brand: "#5cc0ee", accent: "#f5b83d", bg: "#0d1a22", surface: "#13252f", text: "#e6f3fa", muted: "#8fb0c2", border: "#254250", ...DARK_STATUS },
  },
  bosque: {
    label: "Bosque (verde)",
    light: { brand: "#2f6b3a", accent: "#e0a526", bg: "#f6faf4", surface: "#ffffff", text: "#1a2a1c", muted: "#5f7262", border: "#d9e6d6", ...LIGHT_STATUS },
    dark: { brand: "#8fd49a", accent: "#f5b83d", bg: "#0f1a12", surface: "#16241a", text: "#e8f3e9", muted: "#9bb59f", border: "#2a4130", ...DARK_STATUS },
  },
  atardecer: {
    label: "Atardecer (naranja)",
    light: { brand: "#c2410c", accent: "#7c3aed", bg: "#fff8f3", surface: "#ffffff", text: "#2b1a12", muted: "#7a6558", border: "#f0dccd", ...LIGHT_STATUS },
    dark: { brand: "#fb923c", accent: "#c4b5fd", bg: "#1c1310", surface: "#281c17", text: "#fbeee6", muted: "#c0a899", border: "#473429", ...DARK_STATUS },
  },
  grafito: {
    label: "Grafito (gris)",
    light: { brand: "#374151", accent: "#f59e0b", bg: "#f3f4f6", surface: "#ffffff", text: "#111827", muted: "#6b7280", border: "#d9dce1", ...LIGHT_STATUS },
    dark: { brand: "#cbd5e1", accent: "#fbbf24", bg: "#111214", surface: "#1a1c1f", text: "#f1f3f5", muted: "#9aa1ab", border: "#33373d", ...DARK_STATUS },
  },
  contraste: {
    label: "Alto contraste",
    light: { brand: "#0000b3", accent: "#b35900", bg: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#3d3d3d", border: "#000000", ok: "#006100", warn: "#6b3f00", err: "#a00000" },
    dark: { brand: "#ffd60a", accent: "#00e5ff", bg: "#000000", surface: "#0a0a0a", text: "#ffffff", muted: "#d0d0d0", border: "#ffffff", ok: "#4dff88", warn: "#ffd60a", err: "#ff6b6b" },
  },
};

export const FONT_SIZES = { s: { label: "Pequeño", px: 14 }, m: { label: "Normal", px: 15 }, l: { label: "Grande", px: 17 }, xl: { label: "Muy grande", px: 19 } };
export const RADII = { sharp: { label: "Rectas", lg: 4, sm: 3 }, normal: { label: "Normales", lg: 10, sm: 8 }, round: { label: "Redondeadas", lg: 18, sm: 14 } };

export const DEFAULT_PREFS = {
  mode: "auto", palette: "pibox", custom: { ...PRESETS.pibox.light },
  fontSize: "m", radius: "normal", collapsed: false, tips: true,
};

// ---------- Color ----------
export function normalizeHex(v) {
  const s = String(v ?? "").trim().toLowerCase();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`;
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}
export const hexToRgb = (hex) => { const n = parseInt(normalizeHex(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (rgb) => "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
/** Mezcla `a` con `b`; `t` es la fracción de `b` (0 → a, 1 → b). */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((c, i) => c + (B[i] - c) * t));
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Texto (casi blanco o casi negro) con mejor contraste sobre `bg`. */
export function onColor(bg) { return contrast(bg, "#ffffff") >= contrast(bg, "#14101a") ? "#ffffff" : "#14101a"; }
export const isDark = (bg) => luminance(bg) < 0.4;

// ---------- Construcción del tema ----------
/** Devuelve { vars, scheme } a partir de los 10 colores base. */
export function deriveTheme(c, { fontSize = "m", radius = "normal" } = {}) {
  const dark = isDark(c.bg);
  const brand700 = dark ? mix(c.brand, "#ffffff", 0.28) : mix(c.brand, "#000000", 0.28);
  const tint = (col) => mix(col, c.surface, dark ? 0.82 : 0.88);
  const rd = RADII[radius] || RADII.normal;
  const vars = {
    "--brand": c.brand, "--brand-700": brand700, "--brand-50": mix(c.brand, c.surface, dark ? 0.85 : 0.9),
    "--accent": c.accent, "--bg": c.bg, "--surface": c.surface, "--text": c.text, "--muted": c.muted, "--border": c.border,
    "--ok": c.ok, "--ok-bg": tint(c.ok), "--warn": c.warn, "--warn-bg": tint(c.warn), "--err": c.err, "--err-bg": tint(c.err),
    "--on-brand": onColor(c.brand), "--on-brand-700": onColor(brand700), "--on-ok": onColor(c.ok), "--on-err": onColor(c.err),
    "--shadow": dark ? "none" : "0 1px 2px rgba(35,26,46,.06), 0 4px 14px rgba(35,26,46,.05)",
    "--fs": `${(FONT_SIZES[fontSize] || FONT_SIZES.m).px}px`,
    "--radius": `${rd.lg}px`, "--radius-sm": `${rd.sm}px`,
  };
  return { vars, scheme: dark ? "dark" : "light" };
}

export function sanitizePrefs(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_PREFS;
  const custom = {};
  for (const k of COLOR_KEYS) custom[k] = normalizeHex(r.custom?.[k]) || d.custom[k];
  return {
    mode: ["auto", "light", "dark"].includes(r.mode) ? r.mode : d.mode,
    palette: r.palette === "custom" || PRESETS[r.palette] ? r.palette : d.palette,
    custom,
    fontSize: FONT_SIZES[r.fontSize] ? r.fontSize : d.fontSize,
    radius: RADII[r.radius] ? r.radius : d.radius,
    collapsed: r.collapsed === true,
    tips: r.tips !== false,
  };
}

/** Tema para el modo claro y el oscuro; el arranque elige uno según la preferencia o el sistema. */
export function buildCache(prefs) {
  const opts = { fontSize: prefs.fontSize, radius: prefs.radius };
  if (prefs.palette === "custom") {
    const t = deriveTheme(prefs.custom, opts);
    return { light: t, dark: t };
  }
  const p = PRESETS[prefs.palette] || PRESETS.pibox;
  return { light: deriveTheme(p.light, opts), dark: deriveTheme(p.dark, opts) };
}

/** Avisos de legibilidad para la paleta personalizada. */
export function contrastWarnings(c) {
  const out = [];
  const need = [["text", "bg", 4.5, "El texto casi no se distingue del fondo de la página"], ["text", "surface", 4.5, "El texto casi no se distingue del fondo de las tarjetas"],
    ["muted", "surface", 3, "El texto secundario es muy tenue sobre las tarjetas"], ["brand", "surface", 3, "El color principal casi no se distingue del fondo de las tarjetas"],
    ["border", "surface", 1.2, "Los bordes casi no se ven"]];
  for (const [a, b, min, msg] of need) if (contrast(c[a], c[b]) < min) out.push(msg);
  return out;
}
