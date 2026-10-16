const subtleEmojis = ["👋", "✨", "💜", "😊", "👍", "💡"];

const state = {
  clients: [],
  contactsMap: new Map(),
  emailsMap: new Map(),
};

const searchInput = document.getElementById("searchInput");
const suggestionsEl = document.getElementById("suggestions");
const clientName = document.getElementById("clientName");
const clientId = document.getElementById("clientId");
const zoneSelect = document.getElementById("zoneSelect");
const customZoneGroup = document.getElementById("customZoneGroup");
const customZone = document.getElementById("customZone");
const phoneInput = document.getElementById("phoneInput");
const emailInput = document.getElementById("emailInput");
const emojiHeader = document.getElementById("emojiHeader");
const emojiFooter = document.getElementById("emojiFooter");
const excelContacts = document.getElementById("excelContacts");
const excelEmails = document.getElementById("excelEmails");
const personalizeBtn = document.getElementById("personalizeBtn");
const randomEmojisBtn = document.getElementById("randomEmojisBtn");
const resetBtn = document.getElementById("resetBtn");
const messageOutput = document.getElementById("messageOutput");
const copyBtn = document.getElementById("copyBtn");
const waBtn = document.getElementById("waBtn");
const copyToast = document.getElementById("copyToast");

async function loadClients() {
  try {
    const res = await fetch("data/clientes.json");
    if (!res.ok) throw new Error("No se pudo cargar la base de clientes");
    state.clients = await res.json();
  } catch (error) {
    console.warn(error);
    state.clients = [];
  }
}

function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findMatches(term) {
  if (!term) return [];
  const normalized = normalizeText(term);
  return state.clients
    .filter((client) => {
      const name = normalizeText(client.cliente);
      const id = normalizeText(client.id);
      const locality = normalizeText(client.localidad);
      return (
        name.includes(normalized) ||
        id.includes(normalized) ||
        locality.includes(normalized)
      );
    })
    .slice(0, 8);
}

function renderSuggestions(matches) {
  suggestionsEl.innerHTML = "";
  if (matches.length === 0) {
    suggestionsEl.style.display = "none";
    return;
  }

  matches.forEach((match) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.innerHTML = `
      <span class="name">${match.cliente}</span>
      <span class="meta">ID: ${match.id} • Localidad: ${match.localidad}</span>
    `;
    item.addEventListener("click", () => selectClient(match));
    suggestionsEl.appendChild(item);
  });

  suggestionsEl.style.display = "block";
}

function selectClient(client) {
  clientName.value = client.cliente;
  clientId.value = client.id;
  zoneSelect.value = client.localidad;
  handleZoneChange();
  searchInput.value = client.cliente;
  suggestionsEl.style.display = "none";

  const key = normalizeText(client.cliente);
  if (state.contactsMap.has(key)) {
    phoneInput.value = state.contactsMap.get(key);
  }
  if (state.emailsMap.has(key)) {
    emailInput.value = state.emailsMap.get(key);
  }
}

searchInput.addEventListener("input", () => {
  const matches = findMatches(searchInput.value);
  renderSuggestions(matches);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".form-group")) {
    suggestionsEl.style.display = "none";
  }
});

function handleZoneChange() {
  if (zoneSelect.value === "Otra") {
    customZoneGroup.style.display = "flex";
  } else {
    customZoneGroup.style.display = "none";
    customZone.value = "";
  }
}

zoneSelect.addEventListener("change", handleZoneChange);

function getZone() {
  if (zoneSelect.value === "Otra") {
    return customZone.value.trim() || "la zona indicada";
  }
  return zoneSelect.value;
}

function setRandomEmojis() {
  const header = subtleEmojis[Math.floor(Math.random() * subtleEmojis.length)];
  const footer = subtleEmojis[Math.floor(Math.random() * subtleEmojis.length)];
  emojiHeader.value = header;
  emojiFooter.value = footer;
}

randomEmojisBtn.addEventListener("click", setRandomEmojis);

function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

excelContacts.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const rows = await readExcel(file);
    rows.forEach((row) => {
      const cliente =
        row.Cliente ||
        row.CLIENTE ||
        row["Razón Social"] ||
        row["Razon Social"] ||
        row["Razón social"] ||
        row["Nombre del Cliente"] ||
        row["Nombre del cliente"] ||
        row.Nombre ||
        row.Empresa ||
        row["Nombre Comercial"] ||
        row["Nombre comercial"] ||
        "";

      let telefono =
        row.Telefono ||
        row.Teléfono ||
        row.TELEFONO ||
        row.Celular ||
        row.CELULAR ||
        row.WhatsApp ||
        row.WHATSAPP ||
        row["Número"] ||
        row.Numero ||
        row["N° Teléfono"] ||
        row["N° de Teléfono"] ||
        row["Número de Teléfono"] ||
        row["Número de teléfono"] ||
        row["Teléfono de Contacto"] ||
        row["Teléfono de contacto"] ||
        row.Phone ||
        row.Mobile ||
        row.Móvil ||
        row.Movil ||
        row["Teléfono 1"] ||
        row.Telefono1 ||
        "";

      if (cliente && telefono !== undefined && telefono !== null && telefono !== "") {
        telefono = telefono.toString().trim().replace(/\s+/g, "").replace(/[^0-9]/g, "");
        state.contactsMap.set(normalizeText(cliente), telefono);
      }
    });
    alert("Archivo de contactos cargado correctamente.");
  } catch (error) {
    console.error(error);
    alert("No se pudo leer el archivo de contactos. Verifica que sea un .xlsx válido.");
  }
});

excelEmails.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const rows = await readExcel(file);
    rows.forEach((row) => {
      const cliente =
        row.Cliente ||
        row.CLIENTE ||
        row["Razón Social"] ||
        row["Razon Social"] ||
        row["Razón social"] ||
        row["Nombre del Cliente"] ||
        row["Nombre del cliente"] ||
        row.Nombre ||
        row.Empresa ||
        row["Nombre Comercial"] ||
        row["Nombre comercial"] ||
        "";

      const correo =
        row.Correo ||
        row.CORREO ||
        row.Email ||
        row.EMAIL ||
        row.CorreoElectronico ||
        row["Correo Electrónico"] ||
        row["Correo electrónico"] ||
        row["E-mail"] ||
        "";

      if (cliente && correo) {
        state.emailsMap.set(normalizeText(cliente), correo.toString().trim());
      }
    });
    alert("Archivo de correos cargado correctamente.");
  } catch (error) {
    console.error(error);
    alert("No se pudo leer el archivo de correos. Verifica que sea un .xlsx válido.");
  }
});

function generateMessage() {
  const name = clientName.value.trim() || "Estimado(a) cliente";
  const zone = getZone();
  const headerEmoji = emojiHeader.value.trim() || "👋";
  const footerEmoji = emojiFooter.value.trim() || "";

  const introVariants = [
    "Te cuento que hemos activado nuestro modelo",
    "Quiero presentarte nuestro modelo",
    "Te comparto nuestro modelo",
    "Te comento que hemos habilitado nuestro modelo"
  ];

  const questionVariants = [
    "¿Te gustaría que en un minuto validáramos si esto ya aplica para tus envíos?",
    "¿Quieres que revisemos juntos si este modelo aplica para tus envíos?",
    "¿Te gustaría validar si ya puedes aprovechar esta tarifa para tus despachos?",
    "¿Te parece si vemos en un minuto si aplica para tu operación?"
  ];

  const intro = introVariants[Math.floor(Math.random() * introVariants.length)];
  const question = questionVariants[Math.floor(Math.random() * questionVariants.length)];

  const message = `Buenos días ${name} ${headerEmoji}

Mi nombre es Duvan Perilla, gestor comercial del área comercial de Pibox. A partir de ahora, seré tu nuevo acompañante comercial, así que estaré muy atento a lo que necesites y te apoyaré en todo lo que requieras.

${intro} **Entregas Optimizadas** para la zona de ${zone}: una tarifa única de $10.500 COP para despachos programados entre mañana y mediodía, aplicable incluso si es solo un envío.

Esto te permitirá tener costos fijos, previsibles y ahorrar en tus despachos.

Por el momento, me comunico temporalmente desde esta línea, mientras se me asigna una propia.

${question}${footerEmoji ? " " + footerEmoji : ""}`.trim();

  messageOutput.value = message;
}

personalizeBtn.addEventListener("click", generateMessage);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(messageOutput.value);
    copyToast.hidden = false;
    setTimeout(() => (copyToast.hidden = true), 1600);
  } catch (error) {
    console.error(error);
    alert("No se pudo copiar el mensaje. Copia manualmente desde el recuadro.");
  }
});

waBtn.addEventListener("click", () => {
  const phone = phoneInput.value.replace(/\D/g, "");
  const text = encodeURIComponent(messageOutput.value);
  if (!phone) {
    alert("Ingresa un número de teléfono para abrir WhatsApp.");
    return;
  }
  window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener");
});

resetBtn.addEventListener("click", () => {
  searchInput.value = "";
  clientName.value = "";
  clientId.value = "";
  zoneSelect.value = "Chapinero";
  handleZoneChange();
  phoneInput.value = "";
  emailInput.value = "";
  emojiHeader.value = "👋";
  emojiFooter.value = "";
  messageOutput.value = "";
  suggestionsEl.style.display = "none";
  excelContacts.value = "";
  excelEmails.value = "";
});

async function init() {
  await loadClients();
  setRandomEmojis();
}

init();
