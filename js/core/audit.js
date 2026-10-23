// Registro de actividad hacia la Auditoría del Agente Comercial. PRIVACIDAD POR DISEÑO: aquí solo existen CLAVES de una lista cerrada
// (y a lo sumo un número de «cuántos»). Nunca se envía texto libre: ni nombres, teléfonos, correos, mensajes ni archivos de clientes.
// El Agente Comercial vuelve a validar cada evento contra su propia lista y descarta lo que no reconozca.

export const SECTION_KEYS = ["generador", "comunicados", "clientes", "plantillas", "seguimiento", "informes", "configuracion", "tutorial", "ideas"];
export const ACTION_KEYS = [
  "wa_open", "msg_copy", "bc_save", "bc_prepare", "bc_wa_open", "bc_export", "clients_import", "contacts_import", "import_undo",
  "client_create", "client_edit", "client_delete", "clients_assign", "followup_update", "tpl_save", "tpl_delete", "report_download",
  "config_save", "backup_download", "backup_restore", "data_wipe", "idea_save", "idea_send",
];
const MAX_QUEUE = 40;

/** Evento listo para enviar, o null si la clave no está en la lista. Los únicos campos posibles son t, s, a y n. */
export function buildEvent(kind, key, n) {
  if (kind === "view") return SECTION_KEYS.includes(key) ? { t: "view", s: key } : null;
  if (kind === "action" && ACTION_KEYS.includes(key)) {
    const ev = { t: "action", a: key };
    if (Number.isFinite(n)) ev.n = Math.max(0, Math.min(100000, Math.trunc(n)));
    return ev;
  }
  return null;
}

/** Lee la caducidad de la firma (sin verificarla: eso lo hace el servidor) para no intentar enviar con una vencida. */
export function tokenExpiry(token) {
  try {
    const body = String(token).split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(body + "=".repeat((4 - (body.length % 4)) % 4)));
    return typeof p.e === "number" ? p.e : 0;
  } catch { return 0; }
}
export const tokenUsable = (token, now = Date.now()) => !!token && tokenExpiry(token) > now + 60_000;

/** Cola con tope: agrupa eventos para mandarlos juntos. Si se llena, descarta los más viejos (el registro nunca debe estorbar). */
export function createQueue() {
  const items = [];
  return { push(ev) { if (!ev) return false; items.push(ev); while (items.length > MAX_QUEUE) items.shift(); return true; }, take: () => items.splice(0, 20), get size() { return items.length; } };
}
