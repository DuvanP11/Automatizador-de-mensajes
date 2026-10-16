// Utilidades puras (sin DOM) compartidas por navegador y pruebas en Node.

/** Minúsculas, sin tildes, espacios colapsados. Conserva letras/números/signos relevantes. */
export function normalizeText(v = "") {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de nombre: además ignora puntuación, pero conserva sufijos (SAS, LTDA) para no fusionar empresas distintas. */
export function nameKey(v = "") {
  return normalizeText(v).replace(/[.,;:'"()\-_/\\&]/g, " ").replace(/\s+/g, " ").trim();
}

/** Clave de ID: sin espacios y en minúsculas; NO quita ceros iniciales. */
export function idKey(v = "") {
  return String(v ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

export function digitsOnly(v = "") {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Valida un teléfono sin modificar el original.
 * Devuelve { ok, digits, waNumber, reason }.
 * - 10 dígitos que empiezan por 3 (móvil colombiano) usan `defaultCountryCode` solo al abrir WhatsApp.
 * - Si defaultCountryCode está vacío, un número de 10 dígitos no se considera válido para WhatsApp.
 */
export function validatePhone(raw, defaultCountryCode = "57") {
  const digits = digitsOnly(raw);
  if (!digits) return { ok: false, digits, waNumber: "", reason: "Sin teléfono" };
  if (digits.length < 7) return { ok: false, digits, waNumber: "", reason: "Muy corto (menos de 7 dígitos)" };
  if (digits.length > 15) return { ok: false, digits, waNumber: "", reason: "Demasiado largo (más de 15 dígitos)" };
  const cc = digitsOnly(defaultCountryCode);
  if (/^(\d)\1+$/.test(digits)) return { ok: false, digits, waNumber: "", reason: "Número no válido (todos los dígitos iguales)" };
  if (digits.length === 10 && cc === "57" && digits[0] !== "3") return { ok: false, digits, waNumber: "", reason: "Parece un teléfono fijo (WhatsApp usa celulares que empiezan por 3)" };
  if (digits.length === 10) {
    if (!cc) return { ok: false, digits, waNumber: "", reason: "Falta el indicativo de país (configúralo en Configuración)" };
    return { ok: true, digits, waNumber: cc + digits, reason: "" };
  }
  if (digits.length < 10) return { ok: false, digits, waNumber: "", reason: "Número incompleto para WhatsApp" };
  return { ok: true, digits, waNumber: digits, reason: "" };
}

export function isValidEmail(v) {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(String(v ?? "").trim());
}

export function uid(prefix = "id") {
  const r = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
  return `${prefix}_${r}`;
}

/** Fecha ISO local (YYYY-MM-DD) en zona horaria de Colombia. */
export function todayBogota(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function hourBogota(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(now)) % 24;
}

/** Formato monetario colombiano: $10.500 COP */
export function formatMoney(n, currency = "COP") {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  const sign = num < 0 ? "-" : "";
  const body = Math.round(Math.abs(num)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${body}${currency ? " " + currency : ""}`;
}

/** Convierte "10.500", "$10.500 COP", "10500" en número. */
export function parseMoney(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  // En es-CO el punto es separador de miles; la coma decimal.
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Separa varios números escritos en una misma celda: "300 1, 310 2 / 320 3". */
export function splitPhones(raw) {
  const parts = String(raw ?? "").split(/[,;/|\n\r]+|\s+y\s+/i).map((x) => x.trim()).filter((x) => digitsOnly(x));
  const seen = new Set();
  return parts.filter((x) => { const k = digitsOnly(x).slice(-10); if (seen.has(k)) return false; seen.add(k); return true; });
}
