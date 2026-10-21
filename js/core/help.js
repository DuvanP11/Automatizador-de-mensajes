// Contenido de ayuda: una sola fuente para los globos del menú, el panel «¿Cómo funciona?» y el tutorial.
// Si cambia una pantalla, se actualiza aquí y se refleja en los tres lugares.

export const HELP = {
  generador: {
    short: "Arma el mensaje de WhatsApp de un cliente y ábrelo listo para enviar.",
    summary: "Es la pantalla del día a día: eliges un cliente, la aplicación redacta el mensaje con tu plantilla y tú lo revisas antes de enviarlo. No envía nada por sí sola.",
    steps: [
      "En «1 · Cliente» escribe el nombre o el ID y elige una sugerencia; el teléfono y el correo se cargan solos.",
      "Si el cliente tiene varios contactos, elige a cuál le vas a escribir.",
      "Elige la plantilla y, si aplica, la zona («Ninguna» quita toda la frase de zona).",
      "Revisa «3 · Mensaje generado»: puedes editarlo libremente; la plantilla nunca cambia.",
      "Pulsa «Abrir en WhatsApp» (o «Copiar mensaje»).",
    ],
    adjust: [
      "Tu nombre, cargo, tarifa y condiciones salen de Configuración.",
      "«Variar redacción» alterna entre las opciones [[A|B]] de la plantilla.",
      "«Regenerar desde plantilla» descarta tus ediciones (pide confirmación).",
    ],
    controls: [
      { match: "Variar redacción", tip: "Cambia entre las frases alternativas que definiste en la plantilla con [[Opción A|Opción B]]." },
      { match: "Regenerar desde plantilla", tip: "Vuelve a armar el mensaje y descarta lo que hayas editado a mano. Pide confirmación." },
      { match: "Abrir en WhatsApp", tip: "Abre la conversación con el mensaje escrito. Solo se habilita con un teléfono válido; tú das el último clic de envío." },
      { match: "Copiar mensaje", tip: "Copia el texto al portapapeles por si prefieres pegarlo en otro canal." },
      { match: "Guardar este cliente en la base", tip: "Guarda en la base al cliente que escribiste a mano, con su teléfono." },
      { match: "Registrar el contacto en Seguimiento comercial al abrir WhatsApp", tip: "Al abrir WhatsApp deja anotado el contacto en Seguimiento comercial." },
      { match: "Zona (opcional)", tip: "«Ninguna» elimina la frase «para la zona de…» del mensaje. Las zonas se editan en Configuración." },
      { match: "Teléfono (WhatsApp)", tip: "Los números de 10 dígitos usan el indicativo de Configuración (57 por defecto) solo al abrir WhatsApp; el número guardado no cambia." },
      { match: "Editar plantillas", tip: "Te lleva a Plantillas para cambiar el texto base de los mensajes." },
    ],
  },
  comunicados: {
    short: "Envía una imagen o un video con su texto a varios clientes, de a uno y con pausas.",
    summary: "Para avisos y novedades: adjuntas la imagen o el video, escribes dos o más redacciones y eliges los clientes. La herramienta arma una cola y te deja cada chat listo; tú das el clic de envío, con una pausa al azar entre cliente y cliente.",
    steps: [
      "En «1 · Comunicado» ponle nombre, adjunta la imagen o el video y escribe 2 o más redacciones.",
      "En «2 · Clientes» filtra, marca los que recibirán el aviso o adjunta más clientes con teléfono desde Excel.",
      "En «3 · Ritmo» define la pausa entre envíos y el tope diario; pulsa «Preparar envío».",
      "Por cada cliente: «Abrir WhatsApp», pega la imagen (Ctrl+V) o adjunta el video, envía y pulsa «Ya lo envié».",
    ],
    adjust: [
      "Cada cliente recibe una redacción distinta a la del anterior.",
      "Si llegas al tope diario, la cola queda guardada y sigues al día siguiente.",
      "Los archivos viven solo en este navegador; si cambias de equipo, vuelve a adjuntarlos.",
    ],
    controls: [
      { match: "Preparar envío", tip: "Arma la cola con un texto por cliente, omitiendo teléfonos inválidos y repetidos." },
      { match: "Adjuntar clientes y teléfonos desde Excel", tip: "Abre el importador para traer más clientes con sus teléfonos y seleccionarlos aquí." },
      { match: "Copiar imagen", tip: "Copia la imagen para pegarla en el chat con Ctrl+V (⌘V en Mac)." },
      { match: "Abrir WhatsApp", tip: "Abre el chat con el texto escrito. Se habilita cuando termina la pausa entre envíos." },
      { match: "✓ Ya lo envié", tip: "Marca al cliente como enviado, inicia la siguiente pausa y lo anota en Seguimiento comercial." },
    ],
  },
  clientes: {
    short: "Tu base de clientes y sus contactos. Importa desde Excel y asigna a cada comercial.",
    summary: "Aquí vive la base: cada empresa con uno o varios contactos. Puedes crear clientes a mano o importar archivos de Excel con un asistente que te muestra todo antes de guardar.",
    steps: [
      "Para cargar muchos clientes pulsa «Agregar o sincronizar clientes» y sube tu Excel.",
      "Revisa el mapeo de columnas y el resumen (nuevos, actualizados, duplicados, errores).",
      "Elige a qué comercial pertenecen y confirma la importación.",
      "Usa «Buscar» y el filtro por comercial para encontrar clientes; selecciona varios para reasignarlos en bloque.",
      "Con «Editar» agregas contactos, teléfonos y observaciones de cada cliente.",
    ],
    adjust: [
      "Los comerciales disponibles se definen en Configuración.",
      "Nada se sobrescribe sin mostrarlo: los cambios aparecen como «anterior → nuevo» y vienen sin marcar.",
      "«Deshacer última importación» sirve durante la sesión actual.",
    ],
    controls: [
      { match: "Agregar o sincronizar clientes", tip: "Asistente para importar la base de clientes o un directorio de teléfonos desde Excel, con vista previa antes de guardar." },
      { match: "+ Nuevo cliente", tip: "Crea un cliente a mano, con sus contactos." },
      { match: "Descargar Excel de ejemplo", tip: "Un archivo de muestra con las columnas que la aplicación reconoce." },
      { match: "↶ Deshacer última importación", tip: "Revierte la última importación mientras no cierres ni recargues la página." },
      { match: "Asignar", tip: "Asigna los clientes que seleccionaste al comercial elegido. Si ya tenían otro, se reemplaza (pide confirmación) y su seguimiento pasa al nuevo." },
      { match: "Buscar", tip: "Filtra por nombre, ID, zona, comercial o razón social." },
    ],
  },
  plantillas: {
    short: "Los textos base de tus mensajes, con variables y frases alternativas.",
    summary: "Una plantilla es el molde del mensaje. Las variables entre llaves se reemplazan con los datos del cliente y de tu Configuración.",
    steps: [
      "Elige una plantilla en «Mis plantillas» o crea una con «+ Nueva plantilla».",
      "Escribe el texto base; inserta variables con los botones (por ejemplo {{nombre_cliente}}).",
      "Mira la «Vista previa» con un cliente de ejemplo en «Probar con».",
      "Pulsa «Guardar cambios» y, si quieres que sea la que se use por defecto, «Marcar como predeterminada».",
    ],
    adjust: [
      "{{#zona}}…{{/zona}} crea un bloque que desaparece si no hay zona.",
      "[[Opción A|Opción B]] crea frases alternativas que «Variar redacción» alterna.",
      "Los emojis se insertan con el botón «😊 Emojis».",
    ],
    controls: [
      { match: "+ Nueva plantilla", tip: "Crea una plantilla en blanco." },
      { match: "Duplicar", tip: "Copia la plantilla para probar cambios sin perder la original." },
      { match: "Marcar como predeterminada", tip: "Será la plantilla que el Generador elige al abrir." },
      { match: "Insertar bloque opcional de zona", tip: "Agrega la frase «para la zona de…» que desaparece sola cuando no hay zona." },
      { match: "Guardar cambios", tip: "Guarda la plantilla. Hasta entonces los cambios son un borrador." },
      { match: "Probar con", tip: "Elige un cliente real para ver cómo queda el mensaje." },
    ],
  },
  seguimiento: {
    short: "El estado de cada cliente, próximas acciones e historial de gestión.",
    summary: "Para no perder el hilo: en cada cliente registras en qué estado va, cuándo fue el último contacto y cuándo toca volver a escribirle.",
    steps: [
      "Cambia el estado de un cliente directamente en la tabla.",
      "Pulsa «Detalle» para fijar fechas, comercial responsable y la siguiente acción.",
      "Escribe una nota: se agrega al historial y nunca se borra.",
      "Activa «Solo seguimientos vencidos» para ver lo que ya debiste contactar.",
    ],
    adjust: [
      "Los estados se crean, renombran o desactivan en Configuración.",
      "«No interesado» exige indicar el motivo.",
      "Los filtros de fecha, zona, comercial y estado alimentan también los Informes.",
    ],
    controls: [
      { match: "Solo seguimientos vencidos", tip: "Muestra solo los clientes cuya fecha de próximo seguimiento ya pasó." },
      { match: "Limpiar filtros", tip: "Quita todos los filtros de la tabla." },
      { match: "Detalle", tip: "Abre la ficha: fechas, motivo, responsable, nota e historial." },
      { match: "Próxima fecha de seguimiento", tip: "Cuándo toca volver a contactar. No puede ser anterior al último contacto." },
      { match: "Nueva nota (se agrega al historial)", tip: "Las notas quedan con fecha en el historial y no se pueden borrar." },
    ],
  },
  informes: {
    short: "Indicadores gerenciales y descarga del informe en Excel.",
    summary: "Cifras calculadas con tus datos reales: cuántos clientes hay, a cuántos se contactó, cuántos respondieron, quién tiene pendientes.",
    steps: [
      "Ajusta los filtros (fechas de gestión, zona, comercial, estado).",
      "Lee cada indicador: debajo explica qué mide y, en los porcentajes, sobre qué base se calcula.",
      "Pulsa «Descargar informe Excel» para llevártelo; respeta los filtros activos.",
    ],
    adjust: [
      "La categoría de cada estado (Configuración) decide cómo cuenta en cada indicador.",
      "«—» significa que no aplica; vacío significa sin dato.",
    ],
    controls: [
      { match: "Descargar informe Excel", tip: "Excel de varias hojas (resumen, detalle, historial y pendientes) con los filtros que tienes activos. No incluye teléfonos." },
      { match: "Qué mide cada indicador", tip: "Definición de cada cifra, para que nadie la interprete distinto." },
      { match: "Porcentajes y su base de cálculo", tip: "Cada porcentaje muestra su denominador (por ejemplo, «1 de 2»)." },
    ],
  },
  configuracion: {
    short: "Tus datos como comercial, la oferta, los estados y el respaldo.",
    summary: "Todo lo que aparece en los mensajes sale de aquí; nada está escrito dentro del código. También es donde descargas tu respaldo.",
    steps: [
      "Escribe tu nombre y cargo en «Identidad del comercial».",
      "Revisa la oferta: modelo, tarifa, franja horaria y condiciones.",
      "Define zonas, comerciales del equipo y estados de seguimiento.",
      "Pulsa «Guardar configuración» (arriba a la derecha).",
      "Descarga un respaldo con frecuencia: tus datos viven solo en este navegador.",
    ],
    adjust: [
      "El saludo puede ser automático (según la hora de Colombia) o manual.",
      "El indicativo de país se usa solo al abrir WhatsApp.",
      "La apariencia (colores, tamaño de letra) se cambia en la sección «Apariencia».",
    ],
    controls: [
      { match: "Guardar configuración", tip: "Aplica los cambios. Si sales sin guardar, la aplicación te avisa." },
      { match: "Descargar respaldo (JSON)", tip: "Descarga una copia de todo (clientes, plantillas, seguimiento y configuración). Guárdala fuera del navegador." },
      { match: "Borrar todos los datos…", tip: "Elimina todo de este navegador. Pide escribir BORRAR para confirmar." },
      { match: "Zonas disponibles (una por línea)", tip: "Las zonas que aparecen en el Generador y en los filtros." },
    ],
  },
  apariencia: {
    short: "Cambia colores, tamaño de letra y esquinas de toda la aplicación.",
    summary: "Personaliza cómo se ve la aplicación en tu navegador. Los cambios se aplican al instante y se recuerdan; no afectan a otros comerciales.",
    steps: [
      "Elige el modo: claro, oscuro o automático (sigue a tu computador).",
      "Prueba una paleta lista, o elige «Personalizada» para ajustar cada color.",
      "Ajusta el tamaño de la letra y la forma de las esquinas.",
      "Si algo queda ilegible, «Restablecer apariencia» vuelve al diseño original.",
    ],
    adjust: [
      "En la paleta personalizada cada color afecta una parte distinta; el aviso de legibilidad te dice si algo queda difícil de leer.",
      "Los tonos derivados (hover, fondos de alertas) se calculan solos a partir de tus colores.",
    ],
    controls: [],
  },
  tutorial: {
    short: "Recorrido paso a paso para aprender a usar la aplicación.",
    summary: "Una guía corta para empezar desde cero. Puedes seguirla en orden o saltar a la parte que necesites.",
    steps: ["Sigue los pasos en orden o usa «Ir a la sección» en cada uno.", "El «Recorrido guiado» te señala cada opción del menú."],
    adjust: [],
    controls: [],
  },
  ideas: {
    short: "Buzón de sugerencias para mejorar esta herramienta.",
    summary: "¿Tienes una idea o algo te estorba? Cuéntalo aquí. Quedará guardado y puedes enviarlo por correo a quien administra la herramienta.",
    steps: ["Escribe tu idea con un título corto.", "Elige de qué trata y cómo de importante es para ti.", "Pulsa «Guardar idea»; luego puedes enviarla por correo o descargarlas todas."],
    adjust: ["El correo de destino se configura en Configuración."],
    controls: [],
  },
};

/** Pasos del tutorial: cada uno enlaza con su sección. */
export const TUTORIAL = [
  { path: "configuracion", title: "Configura tus datos (una sola vez)", text: "Antes de generar mensajes, escribe tu nombre y cargo y revisa la oferta (modelo, tarifa, franja y condiciones). Todo lo que sale en el mensaje viene de aquí.", tip: "Pulsa «Guardar configuración» al terminar." },
  { path: "clientes", title: "Carga tus clientes", text: "Usa «Agregar o sincronizar clientes» para subir tu Excel. La aplicación te muestra qué es nuevo, qué cambia y qué está repetido antes de guardar nada.", tip: "Si te equivocas, «Deshacer última importación» lo revierte." },
  { path: "plantillas", title: "Revisa tu plantilla", text: "La plantilla es el molde del mensaje. Las {{variables}} se llenan solas con los datos del cliente; las frases [[A|B]] permiten variar la redacción.", tip: "Usa «Probar con» para ver el resultado con un cliente real." },
  { path: "generador", title: "Genera y envía un mensaje", text: "Busca el cliente, revisa el mensaje generado, edítalo si quieres y pulsa «Abrir en WhatsApp». Tú das el último clic: la aplicación nunca envía por sí sola.", tip: "Marca «Registrar el contacto en Seguimiento» para no olvidar a quién le escribiste." },
  { path: "comunicados", title: "Envía un comunicado con imagen o video", text: "Adjunta el archivo, escribe 2 o más redacciones, marca los clientes y prepara la cola. Se envía de a uno, con una pausa al azar entre cada cliente y un tope diario.", tip: "Prueba primero con un cliente tuyo para ver cómo queda el texto junto a la imagen." },
  { path: "seguimiento", title: "Haz seguimiento", text: "Cambia el estado de cada cliente, fija la próxima fecha de contacto y deja notas. Los vencidos se resaltan para que nadie se quede sin respuesta.", tip: "«Solo seguimientos vencidos» es tu lista de pendientes del día." },
  { path: "informes", title: "Mide tu gestión", text: "Los informes se calculan con tus datos. Cada indicador explica qué mide, y puedes descargar todo en Excel.", tip: "Los filtros cambian las cifras y también el Excel descargado." },
  { path: "apariencia", title: "Personaliza la apariencia", text: "Cambia colores, tamaño de letra y esquinas. Es solo para tu navegador y se aplica al instante.", tip: "«Restablecer apariencia» te devuelve al diseño original." },
  { path: "configuracion", title: "Descarga un respaldo", text: "Tus datos viven solo en este navegador: no hay servidor ni copia automática. Descarga el respaldo con frecuencia y guárdalo fuera del navegador.", tip: "El menú lateral te dice hace cuántos días fue el último." },
  { path: "ideas", title: "Cuéntanos qué mejorar", text: "Si algo te estorba o se te ocurre una mejora, anótalo en el buzón de ideas.", tip: "Puedes enviarlas por correo o descargarlas." },
];
