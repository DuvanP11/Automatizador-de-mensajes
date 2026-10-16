// Motor de plantillas: variables {{x}}, bloques opcionales {{#x}}…{{/x}} / {{^x}}…{{/x}}
// y alternativas de redacción [[a|b|c]] (el usuario elige/ve cuál se usó; no es para evadir filtros).
import { formatMoney, hourBogota } from "./util.js";

export const VARIABLES = [
  { key: "nombre_cliente", label: "Nombre del cliente", required: true, example: "Ambrosia Toy Store" },
  { key: "id_cliente", label: "ID del cliente", required: false, example: "AMB001" },
  { key: "nombre_contacto", label: "Nombre del contacto", required: false, example: "Laura" },
  { key: "nombre_comercial", label: "Nombre del comercial", required: true, example: "Juliana Rojas" },
  { key: "cargo_comercial", label: "Cargo del comercial", required: true, example: "Account Manager" },
  { key: "area_comercial", label: "Área comercial", required: false, example: "Comercial" },
  { key: "modelo_comercial", label: "Modelo comercial", required: true, example: "Entregas Optimizadas" },
  { key: "tarifa", label: "Tarifa", required: true, example: "$10.500 COP" },
  { key: "zona", label: "Zona (opcional)", required: false, example: "Chapinero" },
  { key: "franja_horaria", label: "Franja horaria", required: false, example: "despachos programados entre mañana y mediodía" },
  { key: "condiciones", label: "Condiciones", required: false, example: "aplicable incluso si es solo un envío" },
  { key: "beneficio", label: "Beneficio", required: false, example: "Costos fijos y previsibles" },
  { key: "llamada_accion", label: "Llamada a la acción", required: false, example: "¿Te gustaría validar si aplica?" },
  { key: "firma", label: "Firma", required: false, example: "" },
  { key: "saludo", label: "Saludo según la hora", required: false, example: "Buenos días" },
];
const KNOWN = new Set(VARIABLES.map((v) => v.key));
const REQUIRED = new Set(VARIABLES.filter((v) => v.required).map((v) => v.key));

export function greetingFor(config, now = new Date()) {
  if (config.greeting?.mode === "manual" && config.greeting.manual?.trim()) return config.greeting.manual.trim();
  const h = hourBogota(now); // siempre hora de Colombia, no la del equipo ni UTC
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

/** Valores de variables a partir de configuración + cliente + contacto + zona elegida. */
export function buildValues({ config, client, contact, zone = "", now = new Date() }) {
  const o = config.offer, c = config.commercial;
  return {
    nombre_cliente: client?.name || "",
    id_cliente: client?.id || "",
    nombre_contacto: contact?.name || "",
    nombre_comercial: c.name || "",
    cargo_comercial: c.role || "",
    area_comercial: c.area || "",
    modelo_comercial: o.model || "",
    tarifa: Number.isFinite(Number(o.rate)) && o.rate !== "" && o.rate !== null ? formatMoney(o.rate, o.currency) : "",
    zona: (zone || "").trim(),
    franja_horaria: o.timeframe || "",
    condiciones: o.conditions || "",
    beneficio: o.benefit || "",
    llamada_accion: o.cta || "",
    firma: c.signature || "",
    saludo: greetingFor(config, now),
  };
}

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍️⃣]/gu;
export function stripEmojis(text) {
  return String(text).replace(EMOJI_RE, "");
}

/** Divide en caracteres de usuario (emojis compuestos incluidos). */
export function graphemes(text) {
  if (globalThis.Intl?.Segmenter) return [...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  return [...text];
}

function cleanup(t) {
  return t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/([¿¡]) +/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/g, "")
    .replace(/,\s*\./g, ".")
    .trim();
}

/**
 * @returns {{text:string, missing:string[], unknown:string[], variantsUsed:number}}
 *  missing: variables obligatorias referenciadas que no tienen valor. unknown: variables inexistentes (se eliminan del texto).
 */
export function renderTemplate(body, values, { seed = 0, emojis = true } = {}) {
  let t = String(body ?? "");
  // 1) Bloques condicionales (de adentro hacia afuera, repetimos hasta estabilizar).
  const sec = /\{\{([#^])\s*([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/;
  for (let guard = 0; guard < 50 && sec.test(t); guard++) {
    t = t.replace(sec, (_, kind, key, inner) => {
      const has = !!String(values[key] ?? "").trim();
      return (kind === "#" ? has : !has) ? inner : "";
    });
  }
  // 2) Alternativas [[a|b|c]]
  let gi = 0;
  t = t.replace(/\[\[([^\]]+?)\]\]/g, (_, group) => {
    const opts = group.split("|").map((s) => s.trim()).filter(Boolean);
    if (!opts.length) return "";
    return opts[(Math.abs(seed) + gi++ * 7) % opts.length];
  });
  // 3) Variables
  const missing = new Set(), unknown = new Set();
  t = t.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key) => {
    if (!KNOWN.has(key)) { unknown.add(key); return ""; }
    const v = String(values[key] ?? "").trim();
    if (!v && REQUIRED.has(key)) missing.add(key);
    return v;
  });
  t = t.replace(/\{\{[^}]*\}\}/g, ""); // llaves mal formadas nunca quedan visibles
  if (!emojis) t = stripEmojis(t);
  return { text: cleanup(t), missing: [...missing], unknown: [...unknown], variantsUsed: gi };
}

/** Valida sintaxis de la plantilla antes de guardar. Devuelve lista de problemas legibles. */
export function lintTemplate(body) {
  const problems = [];
  const b = String(body ?? "");
  if (!b.trim()) problems.push("La plantilla está vacía");
  const opens = [...b.matchAll(/\{\{[#^]\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
  const closes = [...b.matchAll(/\{\{\/\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
  if (opens.length !== closes.length) problems.push("Hay bloques opcionales sin cerrar ({{#variable}} … {{/variable}})");
  for (const m of b.matchAll(/\{\{\s*[#^/]?\s*([a-z_]+)\s*\}\}/g)) if (!KNOWN.has(m[1])) problems.push(`Variable desconocida: {{${m[1]}}}`);
  return [...new Set(problems)];
}

/** Normaliza el nombre de zona elegido: 'Ninguna' → '', 'Otra' → texto libre. */
export function resolveZone(selected, custom) {
  if (!selected || selected === "Ninguna") return "";
  if (selected === "Otra") return (custom || "").trim();
  return selected;
}

export function whatsappUrl(waNumber, text) {
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
}
