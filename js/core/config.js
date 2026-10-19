// Configuración centralizada: aquí viven TODOS los valores comerciales (nada de textos fijos en el código de la UI).

export const DEFAULT_ZONES = ["Chapinero", "Los Mártires", "Antonio Nariño"];

/** `stage` es la categoría fija que usan los indicadores; permite renombrar/crear estados sin romper el informe. */
export const STAGES = {
  pending: "Sin contactar",
  contacted: "Contactado (sin confirmar respuesta)",
  contacted_no_reply: "Contactado, sin respuesta",
  responded: "Respondió",
  interested: "Interesado",
  validation: "En validación de cobertura",
  hunter: "Asignado a Hunter",
  negotiation: "En negociación",
  not_interested: "No interesado",
  unreachable: "No contactable",
  closed: "Cerrado / implementado",
};

export const DEFAULT_STATUSES = [
  { key: "pendiente", label: "Pendiente de contactar", stage: "pending", active: true },
  { key: "primer_contacto", label: "Primer contacto realizado", stage: "contacted", active: true },
  { key: "sin_respuesta", label: "Contactado, sin respuesta", stage: "contacted_no_reply", active: true },
  { key: "interesado", label: "Interesado", stage: "interested", active: true },
  { key: "mas_info", label: "Requiere más información", stage: "responded", active: true },
  { key: "validacion_cobertura", label: "Pendiente de validación de cobertura", stage: "validation", active: true },
  { key: "hunter", label: "Asignado a Hunter Comercial", stage: "hunter", active: true },
  { key: "negociacion", label: "En negociación", stage: "negotiation", active: true },
  { key: "no_interesado", label: "No interesado", stage: "not_interested", active: true },
  { key: "no_contactado", label: "No fue posible contactar", stage: "unreachable", active: true },
  { key: "cerrado", label: "Cerrado / implementado", stage: "closed", active: true },
];

export const DEFAULT_CONFIG = {
  commercial: { name: "", role: "Gestor comercial", area: "Comercial", signature: "" },
  offer: {
    model: "Entregas Optimizadas",
    rate: 10500,
    currency: "COP",
    benefit: "Esto te permitirá tener costos fijos, previsibles y ahorrar en tus despachos.",
    timeframe: "despachos programados entre mañana y mediodía",
    conditions: "aplicable incluso si es solo un envío",
    cta: "¿Te gustaría que en un minuto validáramos si esto ya aplica para tus envíos?",
  },
  greeting: { mode: "auto", manual: "Buenos días" },
  defaultCountryCode: "57",
  zones: [...DEFAULT_ZONES],
  statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
  commercials: [],
  ideasEmail: "",
  emojis: { enabled: true, recent: [], favorites: [] },
};

export const DEFAULT_TEMPLATE_BODY = `{{saludo}} {{nombre_cliente}} 👋

Mi nombre es {{nombre_comercial}}, {{cargo_comercial}}{{#area_comercial}} del área {{area_comercial}}{{/area_comercial}} de Pibox. A partir de ahora seré tu nuevo acompañante comercial, así que estaré muy atento a lo que necesites y te apoyaré en todo lo que requieras.

[[Te cuento que hemos activado nuestro modelo|Quiero presentarte nuestro modelo|Te comparto nuestro modelo|Te comento que hemos habilitado nuestro modelo]] *{{modelo_comercial}}*{{#zona}} para la zona de {{zona}}{{/zona}}: una tarifa única de {{tarifa}} para {{franja_horaria}}{{#condiciones}}, {{condiciones}}{{/condiciones}}.

{{beneficio}}

Por el momento, me comunico temporalmente desde esta línea, mientras se me asigna una propia.

{{llamada_accion}}`;

export function defaultTemplates(now = new Date().toISOString()) {
  return [{ id: "tpl_default", name: "Presentación comercial", body: DEFAULT_TEMPLATE_BODY, isDefault: true, createdAt: now, updatedAt: now }];
}
