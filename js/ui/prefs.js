// Preferencias de este navegador (menú contraído, ayudas flotantes) y apariencia compartida con el Agente Comercial.
// La apariencia (colores, modo, formas, logo) ya NO se elige aquí: la define el Agente Comercial y esta web la copia.
import { DEFAULT_PREFS, sanitizePrefs, buildCache } from "../core/theme.js";
import { AGENTE_COMERCIAL_URL } from "../core/links.js";
import { buildRemoteCache, pickTheme, sanitizeRemote } from "../core/remote-theme.js";

const KEY = "pibox_ui_prefs_v1";
const THEME_KEY = "pibox_remote_theme_v1";
const LOGO_FALLBACK = "assets/logo-icon.png";
let prefs = sanitizePrefs(null);
let remote = null;      // última apariencia válida del Agente Comercial
let cache = null;       // variables derivadas de `remote` (o del diseño de fábrica si nunca se pudo leer)
const listeners = new Set();
const dark = matchMedia("(prefers-color-scheme: dark)");

export function loadPrefs() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.prefs) prefs = sanitizePrefs(s.prefs); } catch { /* sin preferencias guardadas */ }
  try { const t = JSON.parse(localStorage.getItem(THEME_KEY)); const r = sanitizeRemote(t?.remote, AGENTE_COMERCIAL_URL); if (r) remote = r; } catch { /* sin apariencia guardada */ }
  cache = remote ? buildRemoteCache(remote) : buildCache(sanitizePrefs(null));
  return prefs;
}

export const getPrefs = () => prefs;
export const getRemoteTheme = () => remote;
export const subscribePrefs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function applyLogo() {
  const img = document.querySelector(".brand img");
  if (!img) return;
  const want = remote?.logoUrl || LOGO_FALLBACK;
  if (img.getAttribute("src") === want) return;
  img.onerror = () => { img.onerror = null; img.setAttribute("src", LOGO_FALLBACK); }; // si el logo del Agente no carga, se queda el de siempre
  img.setAttribute("src", want);
}

export function applyPrefs() {
  const t = pickTheme(cache, dark.matches);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.setAttribute("data-theme", t.scheme);
  if (prefs.collapsed) root.setAttribute("data-nav", "collapsed"); else root.removeAttribute("data-nav");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.vars["--brand"]);
  applyLogo();
}

/** Cambia una o varias preferencias locales (menú, ayudas), guarda y aplica. Devuelve false si el navegador no pudo guardar. */
export function updatePrefs(patch) {
  prefs = sanitizePrefs({ ...prefs, ...patch });
  applyPrefs();
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify({ prefs })); } catch { saved = false; }
  listeners.forEach((fn) => fn(prefs));
  return saved;
}

export function resetPrefs() { return updatePrefs({ ...DEFAULT_PREFS }); }

/**
 * Pide la apariencia al Agente Comercial y la aplica si cambió. Si no responde (sin internet, servicio caído, respuesta rara)
 * se queda con la última que tenía guardada, o con el diseño de fábrica: nunca bloquea la herramienta.
 */
export async function syncRemoteTheme(fetchImpl = fetch) {
  try {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetchImpl(`${AGENTE_COMERCIAL_URL}/api/public/theme`, { cache: "no-cache", credentials: "omit", mode: "cors", signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const r = sanitizeRemote(await res.json(), AGENTE_COMERCIAL_URL);
    if (!r) return false;
    if (remote && remote.version === r.version && JSON.stringify(remote) === JSON.stringify(r)) return false;
    remote = r; cache = buildRemoteCache(r);
    try { localStorage.setItem(THEME_KEY, JSON.stringify({ remote: r, cache })); } catch { /* sin almacenamiento: se aplica igual en esta visita */ }
    applyPrefs(); listeners.forEach((fn) => fn(prefs));
    return true;
  } catch { return false; }
}

export function initPrefs() {
  loadPrefs();
  applyPrefs();
  dark.addEventListener("change", () => applyPrefs());
  void syncRemoteTheme();
}
