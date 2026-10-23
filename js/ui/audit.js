// Envía al Agente Comercial QUÉ secciones abre la persona y QUÉ acciones hace (claves cerradas, sin datos de clientes).
// Solo funciona si entró desde el Agente Comercial (que le entrega una firma); si no, no envía nada. Nunca lanza ni retrasa la herramienta.
import { AGENTE_COMERCIAL_URL } from "../core/links.js";
import { buildEvent, createQueue, tokenUsable } from "../core/audit.js";

const KEY = "pibox_ac_token_v1";
const queue = createQueue();
let timer = null;

const token = () => { try { const t = localStorage.getItem(KEY); return tokenUsable(t) ? t : null; } catch { return null; } };
const forget = () => { try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };

export async function flush(fetchImpl = fetch) {
  clearTimeout(timer); timer = null;
  const t = token();
  if (!t) { queue.take(); return; }
  const events = queue.take();
  if (!events.length) return;
  try {
    const res = await fetchImpl(`${AGENTE_COMERCIAL_URL}/api/public/audit`, {
      method: "POST", mode: "cors", credentials: "omit", keepalive: true,
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ events }),
    });
    if (res.status === 401 || res.status === 403) forget(); // firma vencida o persona desactivada: se deja de intentar
  } catch { /* sin conexión: el registro se pierde, la herramienta sigue igual */ }
  if (queue.size) timer = setTimeout(() => flush(fetchImpl), 1500);
}
function schedule() { if (!timer) timer = setTimeout(() => flush(), 1500); }

export function trackView(section) { if (token() && queue.push(buildEvent("view", section))) schedule(); }
export function track(action, n) { if (token() && queue.push(buildEvent("action", action, n))) schedule(); }
/** ¿Se está informando al Agente Comercial en esta sesión? (para avisarlo en pantalla) */
export const isReporting = () => !!token();
export function initAudit() { addEventListener("pagehide", () => { void flush(); }); }
