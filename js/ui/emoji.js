import { h } from "./dom.js";
import { normalizeText } from "../core/util.js";

// [emoji, palabras clave para búsqueda]
export const EMOJI_CATEGORIES = [
  { name: "Saludos y personas", items: [["👋", "hola saludo mano"], ["🙂", "sonrisa"], ["😊", "feliz sonrisa"], ["🤝", "acuerdo trato apreton"], ["🙏", "gracias por favor"], ["👍", "ok bien aprobado"], ["👏", "aplauso"], ["💪", "fuerza"], ["🙌", "celebrar manos"], ["👨‍💼", "hombre ejecutivo"], ["👩‍💼", "mujer ejecutiva"], ["🧑‍💻", "persona computador"], ["👨‍👩‍👧", "familia"], ["🫡", "saludo"], ["😉", "guiño"], ["🤗", "abrazo"]] },
  { name: "Empresas y trabajo", items: [["🏢", "edificio empresa oficina"], ["🏬", "tienda almacen"], ["🏪", "tienda"], ["💼", "maletin trabajo"], ["📈", "crecimiento grafica sube"], ["📊", "grafica datos"], ["💰", "dinero"], ["💵", "billete dinero"], ["💳", "tarjeta pago"], ["🧾", "factura recibo"], ["📞", "telefono llamada"], ["📱", "celular movil"], ["✉️", "correo sobre"], ["📅", "calendario fecha"], ["🕘", "hora reloj"], ["🎯", "objetivo meta"]] },
  { name: "Transporte y logística", items: [["🚚", "camion entrega"], ["🚛", "camion carga"], ["🛵", "moto domicilio"], ["🏍️", "moto"], ["🚲", "bicicleta"], ["🚗", "carro"], ["🚐", "camioneta van"], ["🛣️", "via carretera"], ["🗺️", "mapa ruta"], ["📍", "ubicacion punto"], ["🧭", "brujula"], ["⏱️", "cronometro tiempo rapido"], ["⏰", "alarma hora"], ["🏭", "bodega fabrica"], ["🛫", "avion envio"], ["⛽", "combustible"]] },
  { name: "Paquetes y entregas", items: [["📦", "paquete caja envio"], ["📬", "buzon entrega"], ["📮", "buzon"], ["🏷️", "etiqueta precio tarifa"], ["🛍️", "bolsas compras"], ["🛒", "carrito compras"], ["✅", "listo confirmado"], ["☑️", "check"], ["📋", "lista"], ["🔒", "seguro candado"], ["🧰", "herramientas"], ["📤", "enviado salida"], ["📥", "recibido entrada"], ["🔄", "cambio repetir"], ["💲", "precio"], ["🎁", "regalo"]] },
  { name: "Celebración", items: [["🎉", "fiesta celebracion"], ["🎊", "confeti"], ["🥳", "fiesta"], ["✨", "brillos nuevo"], ["🌟", "estrella"], ["⭐", "estrella"], ["🏆", "trofeo"], ["🥇", "primero medalla"], ["🎈", "globo"], ["🔥", "fuego promo"], ["💥", "explosion"], ["🚀", "cohete lanzamiento"], ["💯", "cien perfecto"], ["🍀", "suerte"], ["🎶", "musica"], ["🥂", "brindis"]] },
  { name: "Naturaleza", items: [["🌱", "planta crecer"], ["🌿", "hoja"], ["🌳", "arbol"], ["🌸", "flor"], ["🌻", "girasol"], ["☀️", "sol dia"], ["🌤️", "sol nubes"], ["🌈", "arcoiris"], ["🌙", "luna noche"], ["💧", "agua gota"], ["🍃", "viento hojas"], ["🌎", "mundo tierra"], ["🐝", "abeja"], ["🦋", "mariposa"], ["🍎", "manzana"], ["☕", "cafe"]] },
  { name: "Símbolos", items: [["💜", "corazon morado"], ["💙", "corazon azul"], ["💚", "corazon verde"], ["❤️", "corazon rojo"], ["💡", "idea"], ["❗", "importante"], ["❓", "pregunta"], ["➡️", "flecha derecha"], ["👉", "senalar"], ["✔️", "check"], ["⚡", "rapido rayo"], ["🔔", "campana aviso"], ["📌", "chincheta fijar"], ["🔹", "rombo"], ["▪️", "punto"], ["🇨🇴", "colombia bandera"]] },
];

/**
 * Selector visual. onPick(emoji) inserta donde convenga; `config` guarda recientes/favoritos.
 * El estado de recientes/favoritos se persiste mediante onChange(newEmojiConfig).
 */
export function createEmojiPicker({ onPick, emojiConfig, onConfigChange }) {
  let tab = emojiConfig.favorites?.length || emojiConfig.recent?.length ? "★" : EMOJI_CATEGORIES[0].name;
  let query = "";
  const root = h("div", { class: "emoji-pop", role: "dialog", "aria-label": "Selector de emojis" });
  const search = h("input", { type: "search", placeholder: "Buscar emoji (ej: camión, paquete)", "aria-label": "Buscar emoji", oninput: (e) => { query = e.target.value; draw(); } });
  const tabs = h("div", { class: "emoji-tabs", role: "group", "aria-label": "Categorías" });
  const grid = h("div", { class: "emoji-grid" });
  root.append(search, tabs, grid);

  function items() {
    const q = normalizeText(query);
    if (q) return EMOJI_CATEGORIES.flatMap((c) => c.items).filter(([e, kw]) => normalizeText(kw).includes(q) || e === query).map(([e]) => e);
    if (tab === "★") return [...new Set([...(emojiConfig.favorites || []), ...(emojiConfig.recent || [])])];
    return EMOJI_CATEGORIES.find((c) => c.name === tab)?.items.map(([e]) => e) || [];
  }
  function draw() {
    tabs.replaceChildren(
      ...["★", ...EMOJI_CATEGORIES.map((c) => c.name)].map((n) => h("button", { type: "button", "aria-pressed": String(n === tab && !query), text: n === "★" ? "★ Recientes" : n, onclick: () => { tab = n; query = ""; search.value = ""; draw(); } })),
    );
    const list = items();
    grid.replaceChildren(...(list.length ? list.map((e) => h("button", { type: "button", text: e, "aria-label": `Insertar ${e}`, title: "Clic: insertar · Shift+clic: favorito",
      onclick: (ev) => {
        if (ev.shiftKey) {
          const fav = new Set(emojiConfig.favorites || []);
          fav.has(e) ? fav.delete(e) : fav.add(e);
          emojiConfig = { ...emojiConfig, favorites: [...fav] };
        } else {
          emojiConfig = { ...emojiConfig, recent: [e, ...(emojiConfig.recent || []).filter((x) => x !== e)].slice(0, 16) };
          onPick(e);
        }
        onConfigChange?.(emojiConfig);
      } })) : [h("span", { class: "muted", text: tab === "★" && !query ? "Aún no hay recientes. Shift+clic marca favoritos." : "Sin resultados" })]));
  }
  draw();
  return root;
}
