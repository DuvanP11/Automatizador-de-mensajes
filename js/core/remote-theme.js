// Apariencia compartida con el Agente Comercial. La web del Agente publica SOLO colores, modo, formas y logo propio
// (/api/public/theme); aquí se valida todo lo que llega (nunca se confía en él) y se convierte en las variables de la interfaz.
import { COLOR_KEYS, deriveTheme, normalizeHex } from "./theme.js";

export const FONT_STACKS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

function palette(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const k of COLOR_KEYS) { const v = normalizeHex(raw[k]); if (!v) return null; out[k] = v; }
  return out;
}

/** Valida la respuesta del Agente Comercial. Devuelve null si algo no cuadra (entonces no se toca la apariencia actual). */
export function sanitizeRemote(raw, origin) {
  if (!raw || typeof raw !== "object" || raw.v !== 1) return null;
  const scheme = ["auto", "light", "dark"].includes(raw.scheme) ? raw.scheme : null;
  const light = palette(raw.light);
  if (!scheme || !light) return null;
  const dark = scheme === "auto" ? palette(raw.dark) : null;
  if (scheme === "auto" && !dark) return null;
  const r = Number(raw.radius);
  // El logo solo se acepta si sale del propio Agente Comercial (nunca una dirección cualquiera).
  let logoUrl = null;
  try { const u = new URL(String(raw.logoUrl ?? "")); if (u.origin === origin && u.pathname === "/brand/logo") logoUrl = u.toString(); } catch { /* sin logo propio */ }
  return {
    v: 1, scheme, light, dark,
    radius: Number.isFinite(r) ? Math.max(0, Math.min(24, Math.round(r))) : 10,
    font: FONT_STACKS[raw.font] ? raw.font : "system",
    logoUrl, version: typeof raw.version === "string" ? raw.version.slice(0, 80) : "",
  };
}

/** Variables listas para aplicar, en claro y oscuro. Con modo fijo (light/dark) ambas variantes son la misma. */
export function buildRemoteCache(remote) {
  const extra = (t) => ({ ...t, vars: { ...t.vars, "--radius": `${remote.radius}px`, "--radius-sm": `${Math.round(remote.radius * 0.8)}px`, "--font": FONT_STACKS[remote.font] } });
  const light = extra(deriveTheme(remote.light));
  const dark = remote.dark ? extra(deriveTheme(remote.dark)) : light;
  return { light, dark };
}

/** Qué variante aplicar: la del Agente (claro/oscuro fijo) o la que pida el sistema operativo si el Agente dejó «automático». */
export const pickTheme = (cache, systemDark) => (systemDark ? cache.dark : cache.light);
