import puppeteer from "puppeteer-core";
import XLSX from "xlsx";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
XLSX.set_fs(fs);
const D = process.env.E2E_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "pibox-e2e-"));
fs.mkdirSync(D + "/dl", { recursive: true }); fs.mkdirSync(D + "/fx", { recursive: true });
execFileSync("node", [new URL("./mkfx.mjs", import.meta.url).pathname, D + "/fx"]);
const BASE = process.env.E2E_URL || "http://127.0.0.1:8791/index.html";
const results = [];
const check = (name, cond, extra = "") => { results.push([cond ? "APROBADO" : "FALLIDO", name, cond ? "" : String(extra)]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--force-prefers-color-scheme=light"] });
const p = await b.newPage();
const errs = [], failed = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url()); });
p.on("dialog", (d) => d.dismiss());
const cdp = await p.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: D + "/dl" });
await p.setViewport({ width: 1366, height: 900 });

const go = async (route) => { await p.evaluate((r) => (location.hash = `#/${r}`), route); await sleep(250); };
const st = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__pibox.store.state)));
const clickText = async (text, scope = "body", nth = 0) => {
  const ok = await p.evaluate((t, sc, n) => {
    const els = [...document.querySelectorAll(`${sc} button, ${sc} a.btn`)].filter((e) => e.textContent.trim() === t && !e.disabled);
    if (!els[n]) return false; els[n].click(); return true;
  }, text, scope, nth);
  await sleep(150);
  return ok;
};
const setVal = async (sel, val) => { await p.evaluate((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, sel, val); await sleep(80); };
const text = (sel) => p.$eval(sel, (e) => e.value ?? e.textContent);

// ---------- Arranque limpio ----------
await p.goto(BASE); await p.evaluate(() => localStorage.clear()); await p.reload(); await sleep(500);
let s = await st();
check("Base inicial sembrada desde data/clientes.json (105 clientes)", s.clients.length === 105, s.clients.length);
check("Zona 'Los martires' normalizada a 'Los Mártires'", s.clients.some((c) => c.zone === "Los Mártires"));
check("Logo del encabezado carga (naturalWidth>0)", await p.$eval(".brand img", (i) => i.complete && i.naturalWidth > 0));
check("Favicon declarado y accesible", (await p.$$eval('link[rel~="icon"]', (l) => l.map((x) => x.href))).length >= 2);
check("Título del navegador personalizado", (await p.title()).includes("Pibox"));

// ---------- Configuración comercial ----------
await go("configuracion");
const labelOf = (txt) => p.evaluateHandle((t) => [...document.querySelectorAll("label")].find((l) => l.textContent.trim().startsWith(t))?.control, txt);
const fill = async (label, val) => { const h = await labelOf(label); await h.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, val); };
await fill("Nombre del comercial", "Juliana Rojas");
await fill("Cargo", "Account Manager");
await fill("Tarifa del servicio", "abc");
await clickText("Guardar configuración");
check("Tarifa inválida muestra error y no guarda", (await p.$$eval(".alert.err li", (l) => l.map((x) => x.textContent))).some((t) => t.includes("tarifa")) && (await st()).config.offer.rate === 10500);
await fill("Tarifa del servicio", "10500");
check("Pista de tarifa en formato colombiano", (await p.$eval("#rate-h", (e) => e.textContent)).includes("$10.500 COP"));
check("Cambios sin guardar activan la guarda de salida", await p.evaluate(() => !!window.__pibox.dirty && window.__pibox.dirty()));
await clickText("Guardar configuración");
s = await st();
check("Configuración guardada (nombre y cargo editables sin tocar código)", s.config.commercial.name === "Juliana Rojas" && s.config.commercial.role === "Account Manager" && s.config.offer.rate === 10500);

// ---------- Importar directorio ----------
await go("clientes");
await clickText("Agregar o sincronizar clientes", "main", 0);
await p.waitForSelector("dialog[open]");
await clickText("Directorio de teléfonos (relaciona contactos con clientes ya registrados)", "dialog").catch(() => {});
await p.evaluate(() => (document.querySelector('#r-directory').checked = true, document.querySelector('#r-directory').dispatchEvent(new Event("change", { bubbles: true }))));
await (await p.$("#impfile")).uploadFile(D + "/fx/directorio.xlsx");
await p.waitForFunction(() => document.querySelector("dialog[open] .kpi") || document.querySelector("dialog[open]")?.textContent.includes("No pude identificar"), { timeout: 8000 });
check("Columnas con variantes (Razón social/CompanyID/Número de contacto, encabezado en fila 2) reconocidas y el asistente salta directo al resumen", !!(await p.$("dialog[open] .kpi")));
const kp = await p.$$eval("dialog[open] .kpi", (k) => Object.fromEntries(k.map((x) => [x.querySelector("span").textContent, x.querySelector("b").textContent])));
check("Resumen distingue categorías (nuevos 0, actualizados 2, contactos 2, errores 1, revisión 1)", kp["Clientes actualizados"] === "2" && kp["Contactos nuevos"] === "2" && kp["Errores"] === "1" && kp["Revisión manual"] === "1" && kp["Clientes nuevos"] === "0", JSON.stringify(kp));
check("Aviso de fila en revisión manual", (await p.$eval("dialog[open]", (d) => d.textContent)).includes("requieren decisión"));
// Reporte de errores
await clickText("Descargar reporte de errores", "dialog"); await sleep(600);
const dlFiles = fs.readdirSync(D + "/dl").filter((f) => f.startsWith("errores-importacion"));
check("Reporte de errores .xlsx descargado", dlFiles.length === 1, dlFiles);
if (dlFiles.length) { const rows = XLSX.utils.sheet_to_json(XLSX.readFile(D + "/dl/" + dlFiles[0]).Sheets["Errores de importación"], { header: 1 }); check("Reporte lista fila 5 (cliente inexistente → revisión) y fila 6 (teléfono inválido)", rows.length === 3 && rows.some((r) => r[0] === 5 && r[1] === "Requiere revisión") && rows.some((r) => r[0] === 6 && r[1] === "Error"), JSON.stringify(rows)); }
// Resolver revisión: crear Fantasma como cliente nuevo
await p.evaluate(() => { const sel = [...document.querySelectorAll("dialog[open] select")].find((s) => s.getAttribute("aria-label")?.startsWith("Decisión")); sel.value = "new"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(150);
await clickText("Confirmar importación (3 filas con cambios)", "dialog");
await sleep(300);
s = await st();
const adl = s.clients.find((c) => c.id === "ADL001"), amb = s.clients.find((c) => c.id === "AMB001"), fan = s.clients.find((c) => c.id === "FAN001");
check("Relación por ID: ADL001 recibe teléfono y correo", adl.contacts[0]?.phone === "3001234567" && adl.contacts[0]?.email === "ventas@adl.test", JSON.stringify(adl.contacts));
check("Relación por nombre normalizado (sin ID, mayúsculas/espacios/tildes): AMB001 recibe teléfono", amb.contacts[0]?.phone === "3109876543", JSON.stringify(amb?.contacts));
check("Revisión resuelta: cliente nuevo creado desde directorio", fan?.contacts[0]?.phone === "3205550000");
check("Sin duplicar clientes existentes (105 + 1)", s.clients.length === 106, s.clients.length);
check("Fila con teléfono inválido no modificó a Airtempe", s.clients.find((c) => c.id === "AIR001").contacts.length === 0);

// ---------- Importar base: ceros iniciales ----------
await clickText("Agregar o sincronizar clientes", "main", 0); await p.waitForSelector("dialog[open]");
await (await p.$("#impfile")).uploadFile(D + "/fx/clientes_nuevos.xlsx");
await p.waitForFunction(() => document.querySelector("dialog[open] .kpi"), { timeout: 8000 });
await clickText("Confirmar importación (2 filas con cambios)", "dialog"); await sleep(300);
s = await st();
const n1 = s.clients.find((c) => c.name === "Nuevo Cliente Uno SAS");
check("Importación de base: ID '00789' conserva ceros y teléfono guardado", n1?.id === "00789" && n1.contacts[0].phone === "3015550001" && n1.owner === "Juliana Rojas", JSON.stringify(n1));
check("Fila sin nombre ni ID no se importa", !s.clients.some((c) => c.contacts.some((x) => x.phone === "3015550003")));
// Deshacer
check("Botón 'Deshacer última importación' visible", await p.$eval("main .page-head", (e) => [...e.querySelectorAll("button")].some((b) => b.textContent.includes("Deshacer") && !b.hidden)));
// Archivo con encabezados inesperados
await clickText("Agregar o sincronizar clientes", "main", 0); await p.waitForSelector("dialog[open]");
await (await p.$("#impfile")).uploadFile(D + "/fx/raro.xlsx");
await p.waitForFunction(() => document.querySelector("dialog[open]")?.textContent.includes("No pude identificar"), { timeout: 8000 });
check("Encabezados inesperados → pide revisar el mapeo y bloquea continuar", await p.$$eval("dialog[open] button", (bs) => bs.find((b) => b.textContent.startsWith("Revisar cambios"))?.disabled === true));
await p.evaluate(() => document.querySelector("dialog[open]").close());

// ---------- Generador ----------
await go("generador");
await p.type("#gsearch", "ADL");
await sleep(150);
await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await sleep(250);
check("Búsqueda con teclado selecciona cliente y carga nombre/ID", (await text("#gsearch")).includes("ADL") && (await p.$$eval('input[readonly]', (i) => i.map((x) => x.value))).includes("ADL001"));
check("Teléfono y correo cargan automáticamente", (await text("#gphone")) === "3001234567" && (await p.$$eval('input[readonly]', (i) => i.map((x) => x.value))).includes("ventas@adl.test"));
check("Pista: WhatsApp se abrirá con +573001234567", (await p.$eval("#gphone-h", (e) => e.textContent)).includes("+573001234567"));
let msg = await text("#gmsg");
check("Mensaje incluye cliente, comercial, cargo y tarifa", msg.includes("ADL importaciones SAS") && msg.includes("Juliana Rojas, Account Manager") && msg.includes("$10.500 COP"), msg);
check("Zona 'Chapinero' (del cliente) aparece en el mensaje", msg.includes("para la zona de Chapinero:"), msg);
check("Sin llaves visibles", !/\{\{|\}\}|\[\[|\]\]/.test(msg));
const zoneSel = await p.evaluateHandle(() => [...document.querySelectorAll("label")].find((l) => l.textContent.startsWith("Zona")).control);
await zoneSel.select("Ninguna"); await sleep(150);
msg = await text("#gmsg");
check("Zona 'Ninguna': sin 'zona', sin conector colgante y frase natural", !msg.includes("zona") && msg.includes("*Entregas Optimizadas*: una tarifa única de $10.500 COP para despachos"), msg);
await zoneSel.select("Otra"); await sleep(100);
await p.type("#gzone-custom, input[placeholder='Ej: Teusaquillo']", "Teusaquillo"); await sleep(150);
check("Zona 'Otra' con texto libre", (await text("#gmsg")).includes("zona de Teusaquillo:"));
await zoneSel.select("Ninguna"); await sleep(100);
const greet = (await text("#gmsg")).split(" ")[0] + " " + (await text("#gmsg")).split(" ")[1];
check("Saludo automático válido (hora Colombia)", /^(Buenos días|Buenas tardes|Buenas noches)/.test(await text("#gmsg")), greet);
// Edición manual no toca plantilla
const tplBefore = (await st()).templates[0].body;
await p.evaluate(() => { const t = document.querySelector("#gmsg"); t.value = t.value + "\nEDITADO A MANO"; t.dispatchEvent(new Event("input", { bubbles: true })); });
await zoneSel.select("Chapinero"); await sleep(150);
check("Edición manual se conserva al cambiar datos (con aviso) y no sobrescribe", (await text("#gmsg")).includes("EDITADO A MANO") && (await p.$eval(".alert.info", (e) => e.textContent)).includes("Editaste"));
check("La plantilla original no cambió", (await st()).templates[0].body === tplBefore);
// Regenerar (confirm)
await clickText("Regenerar desde plantilla"); await p.waitForSelector("dialog[open]"); await clickText("Descartar ediciones", "dialog"); await sleep(250);
check("Regenerar vuelve al texto de la plantilla", !(await text("#gmsg")).includes("EDITADO A MANO") && (await text("#gmsg")).includes("zona de Chapinero"));
// Variar redacción
const before = await text("#gmsg"); await clickText("Variar redacción"); const after = await text("#gmsg");
check("Variar redacción cambia la frase conservando tarifa y datos", before !== after && after.includes("$10.500 COP") && after.includes("ADL importaciones SAS"));
// Emojis
await clickText("😊 Emojis"); await p.waitForSelector(".emoji-pop");
await p.type(".emoji-pop input", "camion"); await sleep(150);
await p.evaluate(() => document.querySelector(".emoji-grid button").click()); await sleep(100);
check("Selector de emojis: búsqueda e inserción", (await text("#gmsg")).includes("🚚"));
check("Emoji recién usado queda en recientes", (await st()).config.emojis.recent.includes("🚚"));
// Copiar
await p.evaluate(() => { navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
await clickText("Copiar mensaje");
check("Copiar: contenido igual al mensaje + confirmación", (await p.evaluate(() => window.__copied)) === (await text("#gmsg")) && (await p.$$eval(".toast", (t) => t.map((x) => x.textContent))).some((x) => x.includes("copiado")));
// WhatsApp
await p.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u; return null; }; });
await clickText("Abrir en WhatsApp");
const url = await p.evaluate(() => window.__opened);
check("WhatsApp: URL con teléfono correcto (57 + número) y mensaje codificado", url?.startsWith("https://api.whatsapp.com/send/?phone=573001234567&text=") && decodeURIComponent(url.split("text=")[1].split("&")[0]) === (await text("#gmsg")), url);
s = await st();
const fu = s.followups[s.clients.find((c) => c.id === "ADL001").uid];
check("Abrir WhatsApp registra 'primer contacto' en seguimiento", fu?.status === "primer_contacto" && fu.history.length >= 1 && fu.owner === "Juliana Rojas", JSON.stringify(fu));
// Teléfono inválido bloquea
await setVal("#gphone", "123");
await p.evaluate(() => { window.__opened = null; });
await clickText("Abrir en WhatsApp");
check("Teléfono inválido: el botón sigue activo, explica el error y NO abre WhatsApp", !(await p.evaluate(() => window.__opened)) && (await p.$$eval(".toast", (t) => t.map((x) => x.textContent))).some((x) => x.includes("Teléfono no válido")));
await p.evaluate(() => (document.querySelector("#gphone").value = ""));
await setVal("#gphone", "");
await clickText("Abrir en WhatsApp");
check("Sin teléfono: avisa qué falta y ofrece importar teléfonos", (await p.$$eval(".toast", (t) => t.map((x) => x.textContent))).some((x) => x.includes("no tiene teléfono")) && (await p.$$eval("button", (b) => b.some((x) => x.textContent.includes("Importar teléfonos desde Excel") && !x.hidden && x.offsetParent))));
await setVal("#gphone", "3001234567");
// Tarifa cambiada
await go("configuracion"); await fill("Tarifa del servicio", "9800"); await clickText("Guardar configuración");
await go("generador"); await clickText("Regenerar desde plantilla"); await sleep(100);
if (await p.$("dialog[open]")) await clickText("Descartar ediciones", "dialog");
await sleep(150);
check("Cambio de tarifa se refleja ($9.800 COP)", (await text("#gmsg")).includes("$9.800 COP"));

// ---------- Plantillas ----------
await go("plantillas");
await clickText("Duplicar", "main"); await sleep(250);
s = await st();
check("Duplicar plantilla (2 plantillas, original intacta)", s.templates.length === 2 && s.templates[0].body === s.templates[1].body);
await setVal("#tbody", "{{#zona}} sin cerrar");
check("Plantilla inválida bloquea el guardado y avisa", await p.$$eval("main button", (bs) => bs.find((b) => b.textContent === "Guardar cambios").disabled) && (await p.$eval(".alert.err", (e) => e.textContent)).includes("sin cerrar"));
await setVal("#tbody", "{{saludo}} {{nombre_cliente}}, soy {{nombre_comercial}}.{{#zona}} Zona {{zona}}.{{/zona}}");
await clickText("Guardar cambios", "main"); await sleep(200);
s = await st();
check("Edición guardada solo en la copia", s.templates[1].body.startsWith("{{saludo}} {{nombre_cliente}}, soy") && s.templates[0].body !== s.templates[1].body);
check("Vista previa sin variables visibles", !(await p.$eval(".preview", (e) => e.textContent)).includes("{{"));
await clickText("Marcar como predeterminada", "main"); await sleep(150);
check("Cambiar predeterminada", (await st()).templates[1].isDefault && !(await st()).templates[0].isDefault);
await clickText("Eliminar", "main"); await p.waitForSelector("dialog[open]");
check("Eliminar pide confirmación", (await p.$eval("dialog[open]", (d) => d.textContent)).includes("No se puede deshacer"));
await clickText("Cancelar", "dialog"); await sleep(150);
check("Cancelar conserva la plantilla", (await st()).templates.length === 2);
await clickText("Eliminar", "main"); await p.waitForSelector("dialog[open]"); await clickText("Eliminar", "dialog"); await sleep(200);
s = await st();
check("Eliminar con confirmación; queda una predeterminada", s.templates.length === 1 && s.templates[0].isDefault);

// ---------- Seguimiento ----------
await go("seguimiento");
await setVal("#fq", "Airtempe"); await sleep(150);
await p.evaluate(() => { const s = document.querySelector('select[aria-label^="Estado de Airtempe"]'); s.value = "interesado"; s.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(200);
s = await st(); const air = s.followups[s.clients.find((c) => c.id === "AIR001").uid];
check("Actualizar estado inline crea registro con historial", air.status === "interesado" && air.history.some((e) => e.type === "status" && e.to === "interesado") && air.lastContactAt);
await setVal('input[aria-label^="Próximo seguimiento de Airtempe"]', "2020-01-01"); await sleep(200);
check("Seguimiento vencido marcado (badge y KPI)", (await p.$$eval(".badge.err", (b) => b.map((x) => x.textContent))).includes("Vencido") && (await p.$$eval(".kpi b", (b) => b.map((x) => x.textContent)))[2] === "1");
await clickText("Detalle", "main"); await p.waitForSelector("dialog[open]");
await p.evaluate(() => { const t = document.querySelector("dialog[open] textarea"); t.value = "Pidió cotización por correo"; });
await clickText("Guardar seguimiento", "dialog"); await sleep(250);
s = await st(); const air2 = s.followups[s.clients.find((c) => c.id === "AIR001").uid];
check("Nota agregada sin perder historial previo", air2.history.length >= 3 && air2.history.some((e) => e.note === "Pidió cotización por correo") && air2.history.some((e) => e.type === "status"));
// No interesado exige motivo (el cambio inline abre el detalle y no guarda a medias)
await p.evaluate(() => { const s = document.querySelector('select[aria-label^="Estado de Airtempe"]'); s.value = "no_interesado"; s.dispatchEvent(new Event("change", { bubbles: true })); });
await p.waitForSelector("dialog[open]");
await clickText("Guardar seguimiento", "dialog");
check("Estado 'No interesado' exige motivo y no se guarda a medias", (await p.$eval("dialog[open]", (d) => d.textContent)).includes("Indica el motivo") && (await st()).followups[(await st()).clients.find((c) => c.id === "AIR001").uid].status === "interesado");
await p.evaluate(() => document.querySelector("dialog[open]").close());
// Filtro por comercial
await setVal("#fq", ""); await sleep(100);
const ownerSel = await p.evaluateHandle(() => [...document.querySelectorAll("label")].find((l) => l.textContent === "Comercial").control);
await ownerSel.select("Carlos Peña"); await sleep(200);
check("Filtro por comercial (Carlos Peña → 1 cliente)", (await p.$$eval(".kpi b", (b) => b.map((x) => x.textContent)))[0] === "1");
await ownerSel.select("");
const stSel = await p.evaluateHandle(() => [...document.querySelectorAll("label")].find((l) => l.textContent === "Estado").control);
await stSel.select("primer_contacto"); await sleep(200);
check("Filtro por estado", (await p.$$eval(".kpi b", (b) => b.map((x) => x.textContent)))[0] === "1");

// ---------- Importar teléfonos (flujo directo) ----------
await go("clientes");
check("Aviso de cobertura de teléfonos en Clientes", (await p.$eval("#phoneStat", (e) => e.textContent)).includes("clientes tienen teléfono"));
await clickText("📞 Importar teléfonos de contacto", "main"); await p.waitForSelector("dialog[open]");
check("Modo directo explica cómo funciona y ofrece Excel de ejemplo", (await p.$eval("dialog[open]", (d) => d.textContent)).includes("Cómo funciona") && !(await p.$("dialog[open] fieldset")));
await (await p.$("#impfile")).uploadFile(D + "/fx/telefonos_parecidos.xlsx");
await p.waitForSelector("dialog[open] .kpi");
const opts = await p.$$eval('dialog[open] select[aria-label^="Decisión"] option', (o) => o.map((x) => x.textContent));
check("Nombre casi igual → sugiere el cliente parecido (no lo fusiona solo)", opts.some((o) => o.includes("Es el mismo que: ADL importaciones SAS")), JSON.stringify(opts));
await p.evaluate(() => { const sel = document.querySelector('dialog[open] select[aria-label^="Decisión"]'); sel.value = [...sel.options].find((o) => o.textContent.includes("Es el mismo que")).value; sel.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(150);
await clickText("Confirmar importación (1 filas con cambios)", "dialog"); await sleep(300);
s = await st();
check("Al confirmar, el teléfono queda como contacto del cliente elegido", s.clients.find((c) => c.id === "ADL001").contacts.some((c) => c.phone === "3112223344"));

// ---------- Excel con varios números por celda (forma del archivo real) ----------
await go("clientes");
await clickText("📞 Importar teléfonos de contacto", "main"); await p.waitForSelector("dialog[open]");
await (await p.$("#impfile")).uploadFile(D + "/fx/contactos_clientes.xlsx");
await p.waitForSelector("dialog[open] .kpi");
const dtxt = await p.$eval("dialog[open]", (d) => d.textContent);
check("«NAME COMPANY»/«CELULARES» se reconocen sin pedir mapeo y no aparece la palabra 'null'", !dtxt.includes("No pude identificar") && !dtxt.includes("null"), dtxt.slice(0, 150));
check("Acciones masivas visibles para filas sin cliente en la base", dtxt.includes("Crearlas como clientes nuevos"));
check("El botón masivo cuenta las 4 filas sin cliente (Alfred, ADN, Inventada ×2)", await p.$$eval("dialog[open] button", (b) => b.some((x) => x.textContent === "Crearlas como clientes nuevos (4)")));
await p.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((x) => x.textContent.startsWith("Crearlas como clientes nuevos")).click()); await sleep(300);
const kp2 = await p.$$eval("dialog[open] .kpi", (k) => Object.fromEntries(k.map((x) => [x.querySelector("span").textContent, x.querySelector("b").textContent])));
check("Tras crear en bloque ya no quedan filas por revisar", kp2["Revisión manual"] === "0", JSON.stringify(kp2));
await clickText("Descargar reporte de errores", "dialog"); await sleep(400);
const nApply = await p.$$eval("dialog[open] button", (b) => b.find((x) => x.textContent.startsWith("Confirmar importación"))?.textContent);
await p.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((x) => x.textContent.startsWith("Confirmar importación")).click()); await sleep(400);
s = await st();
const adl2 = s.clients.find((c) => c.id === "ADL001");
check("Varios números → varios contactos del mismo cliente (ADL: 5 nuevos + los previos)", ["3123806392", "3133269056", "3142819248", "3166924463", "3218402214"].every((n) => adl2.contacts.some((c) => c.phone === n)), JSON.stringify(adl2.contacts.map((c) => c.phone)));
const rent = s.clients.find((c) => c.name === "Alfred Rent Corporativo");
check("Número basura 0000000000 omitido, los válidos guardados", rent.contacts.map((c) => c.phone).join() === "3002363980,3003232326", JSON.stringify(rent?.contacts));
const air3 = s.clients.find((c) => c.id === "AIR001");
check("Fijo 6012011589 no se guarda como WhatsApp", !air3.contacts.some((c) => c.phone === "6012011589") && air3.contacts.some((c) => c.phone === "3004975195"));
const inv = s.clients.filter((c) => c.name === "Empresa Inventada Uno");
check("Empresa repetida en el archivo se crea UNA vez con los dos números", inv.length === 1 && inv[0].contacts.length === 2, JSON.stringify(inv));
check("Fila con solo un número corto/inválido (Bodega Pibox) es error y no crea cliente", !s.clients.some((c) => c.name === "Bodega Pibox"));
// Generador: elegir contacto entre varios
await go("generador"); await p.type("#gsearch", "ADL imp"); await sleep(150); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await sleep(250);
check("Generador ofrece elegir entre los varios números del cliente", (await p.$$eval("select option", (o) => o.filter((x) => x.textContent.includes("3166924463")).length)) === 1);

// ---------- Importación masiva con asignación de comercial ----------
await go("clientes");
await clickText("Agregar o sincronizar clientes", "main", 0); await p.waitForSelector("dialog[open]");
await (await p.$("#impfile")).uploadFile(D + "/fx/clientes_masivos.xlsx");
await p.waitForSelector("dialog[open] .kpi");
check("Sin columna de comercial en el archivo, por defecto se propone quien importa (Juliana Rojas)", (await p.$eval('dialog[open] input[list="imp-owners"]', (i) => i.value)) === "Juliana Rojas");
await p.evaluate(() => { const i = document.querySelector('dialog[open] input[list="imp-owners"]'); i.value = "Equipo Norte"; i.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(250);
check("El asistente informa cuántos clientes quedarán a nombre del comercial elegido", (await p.$eval("dialog[open]", (d) => d.textContent)).includes("40 cliente(s) quedarán a nombre de «Equipo Norte»"));
await p.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((x) => x.textContent.startsWith("Confirmar importación")).click()); await sleep(400);
s = await st();
check("40 clientes creados de forma masiva, todos con el comercial elegido", s.clients.filter((c) => c.id.startsWith("M0")).length === 40 && s.clients.filter((c) => c.owner === "Equipo Norte").length === 40);
check("Cada cliente masivo trae su teléfono", s.clients.filter((c) => c.owner === "Equipo Norte").every((c) => c.contacts.length === 1));
// Clientes: filtro y conteo por comercial
check("Chips de comercial con conteo (Equipo Norte (40))", await p.$$eval("main .tabs button", (b) => b.some((x) => x.textContent === "Equipo Norte (40)")));
await clickText("Equipo Norte (40)", "main");
check("Filtrar por comercial deja solo sus clientes", (await p.$eval("main .actions .muted", (e) => e.textContent)).startsWith("40 cliente(s)"));
// Reasignación en bloque
await p.click("thead input[type=checkbox]"); await sleep(200);
check("Seleccionar todos los filtrados (40)", (await p.$eval("main .alert.info strong", (e) => e.textContent)).includes("40 cliente(s) seleccionado(s)"));
await p.evaluate(() => { const i = document.querySelector('main input[list="bulk-owners"]'); i.value = "Juliana Rojas"; i.dispatchEvent(new Event("input", { bubbles: true })); });
await clickText("Asignar", "main"); await p.waitForSelector("dialog[open]");
await clickText("Asignar", "dialog"); await sleep(400);
s = await st();
check("Reasignación en bloque: 40 clientes ahora de Juliana Rojas", s.clients.filter((c) => c.id.startsWith("M0") && c.owner === "Juliana Rojas").length === 40);
// Reasignar uno con seguimiento: el seguimiento acompaña al nuevo dueño
await p.evaluate(() => { const i = document.querySelector("#cq"); i.value = "ADL imp"; i.dispatchEvent(new Event("input", { bubbles: true })); });
await clickText("Todos (148)", "main").catch(() => {});
await p.evaluate(() => { const b = [...document.querySelectorAll("main .tabs button")].find((x) => x.textContent.startsWith("Todos")); b?.click(); }); await sleep(200);
await p.evaluate(() => document.querySelector('tbody input[type=checkbox]').click()); await sleep(150);
await p.evaluate(() => { const i = document.querySelector('main input[list="bulk-owners"]'); i.value = "Marta Prueba"; i.dispatchEvent(new Event("input", { bubbles: true })); });
await clickText("Asignar", "main"); await p.waitForSelector("dialog[open]"); await clickText("Asignar", "dialog"); await sleep(400);
s = await st();
const adlC = s.clients.find((c) => c.id === "ADL001");
check("Reasignar un cliente con seguimiento actualiza también el comercial del seguimiento (con historial)", adlC.owner === "Marta Prueba" && s.followups[adlC.uid].owner === "Marta Prueba" && s.followups[adlC.uid].history.some((e) => e.type === "field" && e.field === "owner" && e.to === "Marta Prueba"));
// Generador: solo mis clientes
await go("generador");
await p.evaluate(() => { document.querySelector("#onlyMine").click(); document.querySelector("#gsearch").value = ""; });
await p.type("#gsearch", "Masivo Cliente 07"); await sleep(200);
check("«Solo mis clientes» muestra los de Juliana y la sugerencia indica el comercial", (await p.$$eval("#sugg li", (l) => l.length)) === 1 && (await p.$eval("#sugg li", (l) => l.textContent)).includes("de Juliana Rojas"));
await p.evaluate(() => { const i = document.querySelector("#gsearch"); i.value = ""; });
await p.type("#gsearch", "ADL imp"); await sleep(200);
check("«Solo mis clientes» oculta clientes de otro comercial (ADL es de Marta Prueba)", (await p.$$eval("#sugg li", (l) => l.length)) === 0);
await p.evaluate(() => document.querySelector("#onlyMine").click()); 
await p.evaluate(() => { const i = document.querySelector("#gsearch"); i.value = "ADL imp"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(200);
check("Sin el filtro vuelve a aparecer", (await p.$$eval("#sugg li", (l) => l.length)) === 1);

// ---------- Informes ----------
await go("informes");
const kpis = await p.$$eval(".kpis .kpi", (k) => Object.fromEntries(k.map((x) => [x.querySelector("span").textContent, x.querySelector("b").textContent])));
s = await st();
check("Total en pantalla = clientes registrados", kpis["Total de clientes"] === String(s.clients.length), JSON.stringify(kpis));
check("Indicadores: vencidos 1, contactos realizados 2 (ADL primer contacto + Airtempe interesado)", kpis["Seguimientos vencidos"] === "1" && kpis["Contactos realizados"] === "2", JSON.stringify(kpis));
await clickText("Descargar informe Excel", "main"); await sleep(800);
const rep = fs.readdirSync(D + "/dl").filter((f) => f.startsWith("informe-gerencial"));
check("Informe Excel descargado", rep.length === 1, rep);
if (rep.length) {
  const wb = XLSX.readFile(D + "/dl/" + rep[0]);
  check("Excel: 4 hojas esperadas", JSON.stringify(wb.SheetNames) === JSON.stringify(["Resumen gerencial", "Detalle de clientes", "Historial de gestión", "Pendientes"]), wb.SheetNames);
  const sum = XLSX.utils.sheet_to_json(wb.Sheets["Resumen gerencial"], { header: 1 });
  check("Excel = pantalla (total, vencidos, contactos)", ["Total de clientes", "Seguimientos vencidos", "Contactos realizados"].every((k) => String(sum.find((r) => r[0] === k)[1]) === kpis[k]), JSON.stringify(sum.slice(0, 14)));
  const det = XLSX.utils.sheet_to_json(wb.Sheets["Detalle de clientes"], { header: 1, raw: false });
  check("Excel detalle: una fila por cliente + encabezado", det.length === s.clients.length + 1, det.length);
  check("Excel: IDs con ceros iniciales intactos ('00789')", det.some((r) => r[1] === "00789"));
  check("Excel: sin teléfonos ni correos", !JSON.stringify(det).match(/\d{10}|@/));
}
// Filtro de informe
const repOwner = await p.evaluateHandle(() => [...document.querySelectorAll("label")].find((l) => l.textContent === "Comercial").control);
await repOwner.select("Carlos Peña"); await sleep(200);
check("Totales del informe cambian con el filtro", (await p.$$eval(".kpis .kpi b", (b) => b[0].textContent)) === "1");

// ---------- Respaldo y restauración ----------
await go("configuracion");
await clickText("Descargar respaldo (JSON)"); await sleep(500);
const bk = fs.readdirSync(D + "/dl").filter((f) => f.startsWith("respaldo-automatizador"));
check("Respaldo JSON descargado", bk.length === 1);
const nClients = (await st()).clients.length;
await p.evaluate(() => { localStorage.clear(); });
await p.reload(); await sleep(500);
// tras limpiar, la app resiembra; restaurar el respaldo debe devolver los 106+2 clientes
await go("configuracion");
await (await p.$("#restore")).uploadFile(D + "/dl/" + bk[0]); await p.waitForSelector("dialog[open]");
await clickText("Reemplazar todo", "dialog"); await sleep(400);
s = await st();
check("Restaurar respaldo recupera clientes, ceros en IDs y seguimientos", s.clients.length === nClients && s.clients.some((c) => c.id === "00789") && Object.keys(s.followups).length >= 2, `${s.clients.length}/${nClients}`);

// ---------- Responsive + accesibilidad ----------
const overflow = {};
for (const w of [390, 768, 1366]) {
  await p.setViewport({ width: w, height: 800 });
  for (const r of ["generador", "clientes", "plantillas", "seguimiento", "informes", "configuracion"]) {
    await go(r);
    overflow[`${w}/${r}`] = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (w === 390 && (r === "generador" || r === "seguimiento")) await p.screenshot({ path: `${D}/m-${r}.png` });
  }
}
check("Sin scroll horizontal de página en 390/768/1366 px", Object.values(overflow).every((v) => v <= 1), JSON.stringify(overflow));
await p.setViewport({ width: 1366, height: 900 });
let unlabeled = [];
for (const r of ["generador", "clientes", "plantillas", "seguimiento", "informes", "configuracion"]) {
  await go(r);
  unlabeled.push(...(await p.evaluate((route) => [...document.querySelectorAll("main input:not([type=hidden]), main select, main textarea")].filter((e) => !(e.labels?.length || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby"))).map((e) => `${route}:${e.outerHTML.slice(0, 80)}`), r)));
}
check("Todos los campos tienen etiqueta accesible", unlabeled.length === 0, unlabeled.join("\n"));
await go("clientes"); await p.screenshot({ path: `${D}/shot-clientes-light.png` });
await go("informes"); await p.screenshot({ path: `${D}/shot-informes-light.png` });
await go("generador"); await p.screenshot({ path: `${D}/shot-generador-light.png` });
check("Sin errores de JavaScript en toda la sesión", errs.length === 0, errs.join(" | "));
check("Sin recursos fallidos (404/5xx)", failed.length === 0, failed.join(" | "));

console.log(results.map((r) => `${r[0]}  ${r[1]}${r[2] ? "\n      → " + r[2] : ""}`).join("\n"));
console.log(`\nTOTAL ${results.length} · APROBADO ${results.filter((r) => r[0] === "APROBADO").length} · FALLIDO ${results.filter((r) => r[0] === "FALLIDO").length}`);
await b.close();
