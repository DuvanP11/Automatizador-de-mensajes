// Preferencias de apariencia (por navegador). No forman parte del respaldo de datos comerciales.
import { DEFAULT_PREFS, sanitizePrefs, buildCache } from "../core/theme.js";

const KEY = "pibox_ui_prefs_v1";
let prefs = sanitizePrefs(null);
let cache = null;
const listeners = new Set();
const dark = matchMedia("(prefers-color-scheme: dark)");

export function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s?.prefs) prefs = sanitizePrefs(s.prefs);
  } catch { /* sin preferencias guardadas */ }
  cache = buildCache(prefs);
  return prefs;
}

export const getPrefs = () => prefs;
export const subscribePrefs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function applyPrefs() {
  const useDark = prefs.mode === "dark" || (prefs.mode === "auto" && dark.matches);
  const t = cache[useDark ? "dark" : "light"];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.setAttribute("data-theme", t.scheme);
  if (prefs.collapsed) root.setAttribute("data-nav", "collapsed"); else root.removeAttribute("data-nav");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.vars["--brand"]);
}

/** Cambia una o varias preferencias, guarda y aplica. Devuelve false si el navegador no pudo guardar. */
export function updatePrefs(patch) {
  prefs = sanitizePrefs({ ...prefs, ...patch });
  cache = buildCache(prefs);
  applyPrefs();
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify({ prefs, cache })); } catch { saved = false; }
  listeners.forEach((fn) => fn(prefs));
  return saved;
}

export function resetPrefs() { return updatePrefs({ ...DEFAULT_PREFS, custom: { ...DEFAULT_PREFS.custom } }); }

export function initPrefs() {
  loadPrefs();
  applyPrefs();
  dark.addEventListener("change", () => { if (prefs.mode === "auto") applyPrefs(); });
}
