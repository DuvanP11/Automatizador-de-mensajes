// Arma el enlace mailto: del buzón de ideas. Los navegadores y programas de correo limitan el largo del enlace,
// así que se incluyen las ideas (las más recientes primero) hasta un tope seguro y se informa cuántas quedaron fuera.

export const MAILTO_LIMIT = 1800;
const SUBJECT = "Ideas para mejorar el Automatizador de Mensajes";

export function ideaText(i) {
  const meta = [i.kind, i.priority && `importancia ${i.priority}`, i.author && `de ${i.author}`].filter(Boolean).join(" · ");
  return `• ${i.title}\n  ${i.text.replace(/\n+/g, "\n  ")}\n  (${meta})`;
}

export function buildMailto(to, ideas, limit = MAILTO_LIMIT) {
  const head = `mailto:${encodeURIComponent(String(to || "").trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(SUBJECT)}&body=`;
  let body = "";
  let used = 0;
  for (const idea of ideas) {
    const next = (body ? "\n\n" : "") + ideaText(idea);
    if (head.length + encodeURIComponent(body + next).length > limit && used > 0) break;
    body += next; used++;
  }
  // Una sola idea larguísima: se recorta en vez de generar un enlace que el correo rechace.
  while (head.length + encodeURIComponent(body).length > limit && body.length > 20) body = body.slice(0, Math.floor(body.length * 0.9)) + "…";
  return { href: head + encodeURIComponent(body), omitted: ideas.length - used };
}
