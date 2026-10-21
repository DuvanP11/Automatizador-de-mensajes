// Comunicados: mensaje (con imagen o video) para varios clientes, enviado de a uno y con ritmo humano.
// Aquí vive solo la lógica pura (sin DOM): armar destinatarios, alternar la redacción, calcular pausas y topes diarios.
import { validatePhone, todayBogota, nameKey, uid } from "./util.js";
import { buildValues, renderTemplate } from "./templates.js";
import { stageOf } from "./followup.js";

export const MAX_VARIANTS = 6;
export const DEFAULT_PACE = { minDelay: 45, maxDelay: 120, dailyCap: 40 };

// Límites de WhatsApp: fotos hasta 16 MB; videos hasta 16 MB para que se envíen como video (más grandes viajan como documento).
export const MEDIA_LIMITS = { image: 16 * 1024 * 1024, video: 16 * 1024 * 1024 };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/3gpp", "video/quicktime"];

export function mediaKind(type = "") {
  if (IMAGE_TYPES.includes(type)) return "image";
  if (VIDEO_TYPES.includes(type)) return "video";
  return "";
}

/** @returns {{ok:boolean, kind:string, reason:string}} */
export function validateMedia(file) {
  const kind = mediaKind(file?.type);
  if (!kind) return { ok: false, kind: "", reason: "Formato no admitido. Usa JPG, PNG o WebP para imágenes; MP4, 3GP o MOV para video." };
  if (file.size > MEDIA_LIMITS[kind]) return { ok: false, kind, reason: `Pesa ${(file.size / 1048576).toFixed(1)} MB; WhatsApp admite hasta ${MEDIA_LIMITS[kind] / 1048576} MB por ${kind === "image" ? "imagen" : "video"}.` };
  return { ok: true, kind, reason: "" };
}

export function newBroadcast(id) {
  return { id, name: "", variants: [{ id: "v1", body: "" }], media: null, createdAt: new Date().toISOString() };
}

/** Pausa aleatoria (en segundos) entre min y max, ambos incluidos. Si min > max se intercambian. */
export function nextDelaySeconds(min, max, rand = Math.random) {
  let a = Math.max(0, Math.round(Number(min) || 0)), b = Math.max(0, Math.round(Number(max) || 0));
  if (a > b) [a, b] = [b, a];
  return a + Math.floor(rand() * (b - a + 1));
}

/**
 * Un destinatario por cliente: el contacto principal con teléfono válido (o el primero que lo tenga).
 * Se omiten: clientes sin teléfono válido, números repetidos y, si se pide, los marcados «No interesado».
 */
export function planRecipients({ clients, uids, followups = {}, statuses = [], countryCode = "57", skipNotInterested = true }) {
  const chosen = new Set(uids);
  const ok = [], skipped = [], seen = new Map();
  for (const c of clients) {
    if (!chosen.has(c.uid)) continue;
    if (skipNotInterested && followups[c.uid] && stageOf(statuses, followups[c.uid].status) === "not_interested") {
      skipped.push({ uid: c.uid, name: c.name, reason: "Marcado como «No interesado»" }); continue;
    }
    const cands = [...(c.contacts || [])].sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
    const withPhone = cands.map((ct) => ({ ct, v: validatePhone(ct.phone, countryCode) })).find((x) => x.v.ok);
    if (!withPhone) {
      const any = cands.find((ct) => ct.phone);
      skipped.push({ uid: c.uid, name: c.name, reason: any ? `Teléfono no válido: ${validatePhone(any.phone, countryCode).reason}` : "Sin teléfono" }); continue;
    }
    const prev = seen.get(withPhone.v.waNumber);
    if (prev) { skipped.push({ uid: c.uid, name: c.name, reason: `Mismo número que «${prev}»` }); continue; }
    seen.set(withPhone.v.waNumber, c.name);
    ok.push({ uid: c.uid, name: c.name, id: c.id || "", zone: c.zone || "", contactName: withPhone.ct.name || "", waNumber: withPhone.v.waNumber });
  }
  return { ok, skipped };
}

/**
 * Reparte las variantes de redacción en secuencia: parejas equilibradas y nunca la misma variante dos veces seguidas
 * (cuando hay 2 o más). Con una sola variante todos usan la 0.
 */
export function assignVariants(count, nVariants, rand = Math.random) {
  if (nVariants <= 1) return Array(count).fill(0);
  const out = [];
  while (out.length < count) {
    const round = [...Array(nVariants).keys()];
    for (let i = round.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [round[i], round[j]] = [round[j], round[i]]; }
    if (out.length && round[0] === out[out.length - 1]) round.push(round.shift());
    out.push(...round);
  }
  return out.slice(0, count);
}

/** Texto final de cada destinatario. Cada variante es una plantilla completa (variables y [[a|b]] incluidos). */
export function buildRunItems({ recipients, variants, config, now = new Date(), rand = Math.random }) {
  const bodies = variants.map((v) => v.body).filter((b) => b.trim());
  if (!bodies.length) throw new Error("Escribe al menos una redacción del comunicado.");
  const order = assignVariants(recipients.length, bodies.length, rand);
  const warnings = new Set();
  const items = recipients.map((r, i) => {
    const values = buildValues({ config, client: { name: r.name, id: r.id }, contact: { name: r.contactName }, zone: r.zone, now });
    const out = renderTemplate(bodies[order[i]], values, { seed: i, emojis: config.emojis?.enabled !== false });
    out.missing.forEach((k) => warnings.add(k));
    return { uid: r.uid, name: r.name, waNumber: r.waNumber, text: out.text, variant: order[i] + 1, status: "pending", sentAt: "" };
  });
  return { items, warnings: [...warnings] };
}

export function newRun({ id, broadcast, items, pace, now = new Date().toISOString() }) {
  return { id, broadcastId: broadcast.id, name: broadcast.name || "Comunicado", media: broadcast.media ? { ...broadcast.media } : null, createdAt: now, pace: { ...pace }, nextAt: 0, items };
}

export const sentTodayCount = (run, today = todayBogota()) =>
  run.items.filter((i) => i.status === "sent" && i.sentAt && new Date(i.sentAt).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) === today).length;

export const runProgress = (run) => {
  const n = (s) => run.items.filter((i) => i.status === s).length;
  return { total: run.items.length, sent: n("sent"), skipped: n("skipped"), pending: n("pending") };
};

/** Primer destinatario pendiente (el que sigue en la cola) o null. */
export const currentItem = (run) => run.items.find((i) => i.status === "pending") || null;

/** Valores válidos para el ritmo: un campo vacío, 0 o negativo vuelve al valor por defecto (si no, el tope 0 bloquearía toda la cola). */
export function sanitizePace(p = {}) {
  const num = (x, def, min) => (Number.isFinite(Number(x)) && x !== "" && x !== null && Number(x) >= min ? Math.round(Number(x)) : def);
  const minDelay = num(p.minDelay, DEFAULT_PACE.minDelay, 5);
  return { minDelay, maxDelay: Math.max(minDelay, num(p.maxDelay, DEFAULT_PACE.maxDelay, 5)), dailyCap: num(p.dailyCap, DEFAULT_PACE.dailyCap, 1) };
}

/** Tiempo estimado de una cola: cada envío promedia (min+max)/2 s de pausa. Devuelve minutos y la cantidad de días según el tope. */
export function estimateRun(count, pace) {
  const p = sanitizePace(pace);
  const avg = (p.minDelay + p.maxDelay) / 2;
  const first = Math.min(count, p.dailyCap);
  return { avgPause: avg, minutesFirstDay: Math.round((first * avg) / 60), days: Math.max(1, Math.ceil(count / p.dailyCap)) };
}

/** Riesgo orientativo según cuántos mensajes salen en un mismo día. No es una regla de WhatsApp. */
export function riskForDaily(sentInADay) {
  if (sentInADay <= 60) return { level: "bajo", label: "Bajo" };
  if (sentInADay <= 120) return { level: "medio", label: "Medio" };
  return { level: "alto", label: "Alto" };
}

/** Guía para enviar todo en un mismo día, según la cantidad de clientes. */
export const SAME_DAY_GUIDE = [
  { upTo: 50, minDelay: 60, maxDelay: 150, tandas: "1 sola tanda" },
  { upTo: 100, minDelay: 75, maxDelay: 180, tandas: "2 tandas (mañana y tarde)" },
  { upTo: 150, minDelay: 90, maxDelay: 200, tandas: "2 tandas, con 1–2 h de descanso" },
  { upTo: 200, minDelay: 90, maxDelay: 210, tandas: "2 tandas, con 1–2 h de descanso" },
].map((r) => ({ ...r, dailyCap: r.upTo, ...estimateRun(r.upTo, { minDelay: r.minDelay, maxDelay: r.maxDelay, dailyCap: r.upTo }), risk: riskForDaily(r.upTo) }));

/** Texto pegado → [{name, phone}]. Una persona por línea: «Nombre, teléfono» (también con ; tabulador o guion largo). El teléfono es lo último de la línea. */
export function parseManualLines(text) {
  return String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    // Con coma, punto y coma, tabulador o barra el corte es exacto (así «Tienda 24 horas, 300…» no confunde el 24 con el teléfono).
    const k = Math.max(line.lastIndexOf(","), line.lastIndexOf(";"), line.lastIndexOf("\t"), line.lastIndexOf("|"));
    if (k >= 0) return { name: line.slice(0, k).trim(), phone: line.slice(k + 1).trim() };
    const m = line.match(/^(.*?)[\s–—-]+(\+?\d[\d\s().-]{5,})$/);
    return m ? { name: m[1].trim(), phone: m[2].trim() } : { name: line, phone: "" };
  });
}

/**
 * Agrega a la base (sobre un borrador de `clients`) los clientes escritos a mano.
 * Si el nombre ya existe se le suma el teléfono como contacto nuevo (si no lo tenía); si el teléfono ya lo tiene OTRO cliente se avisa y no se duplica.
 * @returns {{uids:string[], added:number, merged:number, rejected:{name:string, phone:string, reason:string}[]}}
 */
export function addManualClients(clients, entries, countryCode = "57", now = new Date().toISOString()) {
  const out = { uids: [], added: 0, merged: 0, rejected: [] };
  const byPhone = new Map();
  clients.forEach((c) => c.contacts.forEach((ct) => { const v = validatePhone(ct.phone, countryCode); if (v.ok) byPhone.set(v.waNumber, c); }));
  for (const e of entries) {
    const name = String(e.name ?? "").trim().replace(/\s+/g, " ");
    const v = validatePhone(e.phone, countryCode);
    if (!name) { out.rejected.push({ ...e, reason: "Falta el nombre" }); continue; }
    if (!v.ok) { out.rejected.push({ ...e, reason: `Teléfono no válido: ${v.reason}` }); continue; }
    const owner = byPhone.get(v.waNumber);
    const same = clients.find((c) => nameKey(c.name) === nameKey(name));
    if (owner && (!same || owner.uid !== same.uid)) {
      // El número ya existe: se reutiliza ese cliente para no duplicar el envío.
      out.uids.push(owner.uid); out.rejected.push({ ...e, reason: `Ese número ya es de «${owner.name}»; se seleccionó ese cliente` }); continue;
    }
    if (same) {
      if (!owner) { same.contacts.push({ cid: uid("ct"), name: "", phone: e.phone.trim(), email: "", primary: !same.contacts.length }); same.updatedAt = now; byPhone.set(v.waNumber, same); out.merged++; }
      out.uids.push(same.uid); continue;
    }
    const c = { uid: uid("cl"), id: "", name, legalName: "", zone: "", owner: "", notes: "", createdAt: now, updatedAt: now, contacts: [{ cid: uid("ct"), name: "", phone: e.phone.trim(), email: "", primary: true }] };
    clients.push(c); byPhone.set(v.waNumber, c); out.uids.push(c.uid); out.added++;
  }
  out.uids = [...new Set(out.uids)];
  return out;
}
