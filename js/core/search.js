// Búsqueda de clientes para el Generador: por nombre, razón social, ID, zona, nombre de contacto, teléfono o correo.
import { normalizeText, digitsOnly } from "./util.js";

/** Texto con todo lo que se puede buscar de un cliente (ya normalizado: minúsculas, sin tildes). */
function haystack(c) {
  return [c.name, c.legalName, c.id, c.zone, ...(c.contacts || []).flatMap((x) => [x.name, x.email])].map(normalizeText).join(" | ");
}
const phones = (c) => (c.contacts || []).map((x) => digitsOnly(x.phone)).filter(Boolean);

/**
 * Devuelve los clientes que coinciden, mejores primero: 1) el nombre empieza por lo escrito, 2) el nombre lo contiene,
 * 3) coincide por otro dato (ID, zona, contacto, correo, teléfono). Sin texto devuelve todos en orden alfabético
 * (así el desplegable se puede abrir y recorrer). Un teléfono se busca solo por sus dígitos («300 123», «+57300…»).
 */
export function searchClients(clients, query, { limit = 50, owner = "" } = {}) {
  const q = normalizeText(query).trim();
  const qd = digitsOnly(query);
  const mine = normalizeText(owner);
  const pool = clients.filter((c) => !mine || normalizeText(c.owner) === mine);
  const byName = (a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name), "es");
  if (!q && !qd) return { items: [...pool].sort(byName).slice(0, limit), total: pool.length };
  const scored = [];
  for (const c of pool) {
    const name = normalizeText(c.name);
    let rank = 9;
    if (q && name.startsWith(q)) rank = 0;
    else if (q && (name.includes(q) || normalizeText(c.legalName).includes(q))) rank = 1;
    else if (q.length >= 2 && haystack(c).includes(q)) rank = 2; // con 1 letra o cifra solo cuenta el nombre (si no, «1» traería todo por los ID)
    // Números: se compara por dígitos solo si lo escrito tiene al menos 3 (si no, «1» traería casi todo).
    if (rank === 9 && qd.length >= 3 && phones(c).some((p) => p.includes(qd) || (qd.startsWith("57") && p.includes(qd.slice(2))))) rank = 2;
    if (rank < 9) scored.push([rank, c]);
  }
  scored.sort((a, b) => a[0] - b[0] || byName(a[1], b[1]));
  return { items: scored.slice(0, limit).map((x) => x[1]), total: scored.length };
}
