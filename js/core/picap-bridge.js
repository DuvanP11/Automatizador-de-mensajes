// Enlace con comercial.picap.io: trae los contactos (correos y celulares) de los clientes que están hoy en la base de Picap.
// Los datos NO viven en este repositorio (es público): los entrega esa web, que sí tiene sesión, por postMessage a la pestaña
// que la abrió (window.opener) y quedan solo en el navegador de quien los trae.
export const COMERCIAL_ORIGIN = "https://comercial.picap.io";
const MAX_CLIENTES = 20000;
const MAX_POR_CLIENTE = 50;

const txt = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, MAX_POR_CLIENTE) : []);

/** Valida lo recibido y lo convierte en registros del asistente de importación (uno por cliente + uno por cada correo extra). */
export function contactosARegistros(clientes) {
  if (!Array.isArray(clientes)) return [];
  const out = [];
  let fila = 1;
  for (const c of clientes.slice(0, MAX_CLIENTES)) {
    if (!c || typeof c !== "object") continue;
    const name = txt(c.nombre), id = txt(c.id, 40);
    if (!name && !id) continue;
    const phones = lista(c.telefonos), emails = lista(c.correos);
    if (!phones.length && !emails.length) continue;
    const base = { name, id, legalName: "", contactName: "", zone: "", owner: txt(c.kam), notes: "" };
    out.push({ rowNum: ++fila, ...base, phone: phones.join("; "), email: emails[0] || "" });
    // El asistente guarda un correo por contacto: los demás correos entran como contactos adicionales del mismo cliente.
    for (const e of emails.slice(1)) out.push({ rowNum: ++fila, ...base, phone: "", email: e });
  }
  return out;
}

/** Pide los contactos a la pestaña de comercial.picap.io que abrió esta web. Rechaza con un mensaje legible. */
export function pedirContactos({ win = window, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const opener = win.opener;
    if (!opener || opener.closed) { reject(new Error("Abre esta web desde «Consulta de Prospectos» en comercial.picap.io (con tu sesión iniciada) y vuelve a intentarlo.")); return; }
    let t;
    const fin = (fn, v) => { clearTimeout(t); win.removeEventListener("message", on); fn(v); };
    const on = (e) => {
      if (e.origin !== COMERCIAL_ORIGIN || e.source !== opener || !e.data) return;
      if (e.data.tipo === "pibox:contactos") fin(resolve, contactosARegistros(e.data.clientes));
      else if (e.data.tipo === "pibox:contactos-error") fin(reject, new Error(txt(e.data.mensaje, 200) || "comercial.picap.io no pudo entregar los contactos."));
    };
    win.addEventListener("message", on);
    t = setTimeout(() => fin(reject, new Error("comercial.picap.io no respondió. Verifica que esa pestaña siga abierta y con la sesión iniciada.")), timeoutMs);
    try { opener.postMessage({ tipo: "pibox:pedir-contactos", v: 1 }, COMERCIAL_ORIGIN); } catch { fin(reject, new Error("No se pudo contactar con comercial.picap.io.")); }
  });
}
