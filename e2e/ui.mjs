// Pruebas de navegador de la personalización: menú contraíble, ayudas flotantes, apariencia, tutorial y buzón de ideas.
// Uso: servir el sitio (python3 -m http.server 8791) y `node e2e/ui.mjs`. Con E2E_SHOTS=<carpeta> guarda capturas.
import puppeteer from "puppeteer-core";
import XLSX from "xlsx";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
XLSX.set_fs(fs);
const D = process.env.E2E_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "pibox-ui-"));
const SHOTS = process.env.E2E_SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(D + "/dl", { recursive: true });
const BASE = process.env.E2E_URL || "http://127.0.0.1:8791/index.html";
const results = [];
const check = (name, cond, extra = "") => { results.push([cond ? "APROBADO" : "FALLIDO", name, cond ? "" : String(extra)]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = () => {
  console.log(results.map((r) => `${r[0]}  ${r[1]}${r[2] ? "\n      → " + r[2] : ""}`).join("\n"));
  console.log(`\nTOTAL ${results.length} · APROBADO ${results.filter((r) => r[0] === "APROBADO").length} · FALLIDO ${results.filter((r) => r[0] === "FALLIDO").length}`);
};
process.on("uncaughtException", (e) => { check("La prueba terminó sin excepciones", false, e.message); report(); process.exit(1); });

const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--force-prefers-color-scheme=light"] });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
p.on("dialog", (d) => d.dismiss());
const cdp = await p.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: D + "/dl" });
await p.setViewport({ width: 1366, height: 900 });
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
const shot = async (name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }); };
const go = async (route) => { await p.evaluate((r) => (location.hash = `#/${r}`), route); await sleep(250); };
const css = (sel, prop) => p.$eval(sel, (e, pr) => getComputedStyle(e)[pr], prop);
const rootVar = (v) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
const clickText = async (text, scope = "body", nth = 0) => {
  const ok = await p.evaluate((t, sc, n) => { const els = [...document.querySelectorAll(`${sc} button, ${sc} a.btn`)].filter((e) => e.textContent.trim() === t && !e.disabled); if (!els[n]) return false; els[n].click(); return true; }, text, scope, nth);
  await sleep(150); return ok;
};
const setVal = async (sel, val) => { await p.evaluate((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, sel, val); await sleep(80); };
const tab = (label) => p.evaluate((t) => { [...document.querySelectorAll("main .tabs button")].find((x) => x.textContent === t).click(); }, label).then(() => sleep(120));
const card = (label) => p.evaluate((t) => { [...document.querySelectorAll("main .palette-card")].find((c) => c.textContent.includes(t)).click(); }, label).then(() => sleep(150));
const hscroll = () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const lum = (rgb) => { const [r, g, bl] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
const ratio = (a, c) => { const [h1, l1] = [lum(a), lum(c)].sort((x, y) => y - x); return (h1 + 0.05) / (l1 + 0.05); };
const rgbOf = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const typeInto = async (el, text) => { await el.focus(); await el.evaluate((e) => e.select()); await el.type(text); await sleep(150); };

await p.goto(BASE, { waitUntil: "networkidle0" });
await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "networkidle0" });

// ---------- Menú ----------
const links = await p.$$eval("#nav a", (a) => a.map((x) => x.getAttribute("href")));
check("El menú tiene 9 opciones, incluidas Apariencia, Tutorial y Buzón de ideas", links.length === 9 && ["#/apariencia", "#/tutorial", "#/ideas"].every((h) => links.includes(h)), links.join(","));
const wide = await p.$eval(".sidebar", (e) => e.getBoundingClientRect().width);
check("Menú expandido: ~236 px y botón «Contraer el menú»", Math.abs(wide - 236) < 2 && (await p.$eval("#navToggle", (e) => e.getAttribute("aria-label"))) === "Contraer el menú" && (await p.$eval("#navToggle", (e) => e.getAttribute("aria-expanded"))) === "true", wide);
await shot("01-menu-expandido");
await p.click("#navToggle"); await sleep(400);
const narrow = await p.$eval(".sidebar", (e) => e.getBoundingClientRect().width);
check("Al contraer el menú queda ~68 px y solo íconos", narrow < 80 && (await p.evaluate(() => document.documentElement.dataset.nav)) === "collapsed", narrow);
check("Contraído: los textos siguen para lectores de pantalla (no se borran del DOM)", await p.$eval("#nav a", (a) => a.textContent.includes("Generador de mensajes") && a.getBoundingClientRect().width < 80));
check("Contraído: el botón pasa a «Expandir el menú»", (await p.$eval("#navToggle", (e) => e.getAttribute("aria-label"))) === "Expandir el menú" && (await p.$eval("#navToggle", (e) => e.getAttribute("aria-expanded"))) === "false");
const mainW = await p.$eval("#main", (e) => e.getBoundingClientRect().width);
check("Contraído: el contenido gana espacio", mainW > 1200, mainW);
await shot("02-menu-contraido");
await p.reload({ waitUntil: "networkidle0" });
check("La elección de menú contraído se recuerda al recargar", (await p.evaluate(() => document.documentElement.dataset.nav)) === "collapsed" && (await p.$eval(".sidebar", (e) => e.getBoundingClientRect().width)) < 80);
await p.hover("#nav a[href='#/seguimiento']"); await sleep(200);
const tip = await p.evaluate(() => { const t = document.getElementById("tip-pop"); return t && !t.hidden ? t.textContent : ""; });
check("Menú contraído: al pasar el mouse sale el nombre y la explicación de la opción", tip.includes("Seguimiento comercial") && tip.includes("estado de cada cliente"), tip);
await shot("03-tooltip-menu");
await p.click("#navToggle"); await sleep(400);
check("Expandir devuelve el menú a ~236 px", Math.abs((await p.$eval(".sidebar", (e) => e.getBoundingClientRect().width)) - 236) < 2);
await p.hover("#nav a[href='#/informes']"); await sleep(200);
check("Menú expandido: también hay globo explicativo", (await p.evaluate(() => document.getElementById("tip-pop").textContent)).includes("Indicadores gerenciales"));
await p.keyboard.press("Escape"); await sleep(100);
check("Escape cierra el globo", await p.evaluate(() => document.getElementById("tip-pop").hidden));
await p.focus("#nav a[href='#/plantillas']"); await sleep(150);
check("El globo también aparece al enfocar con teclado", !(await p.evaluate(() => document.getElementById("tip-pop").hidden)));

// ---------- Ayuda por sección ----------
await go("generador");
const tips = await p.$$eval("main [data-tip]", (e) => e.map((x) => x.textContent.trim().slice(0, 40)));
check("Generador: los botones clave traen ayuda flotante", ["Variar redacción", "Abrir en WhatsApp", "Copiar mensaje"].every((t) => tips.includes(t)), tips.join("|"));
await p.hover("main button[data-tip]"); await sleep(200);
await shot("04-ayuda-boton");
await p.click(".help-fab"); await sleep(200);
const panel1 = await p.$eval("#help-panel", (e) => (e.hidden ? "" : e.textContent));
check("«?» abre el panel con pasos y cómo ajustar la sección actual", panel1.includes("Generador de mensajes") && panel1.includes("Cómo se usa") && panel1.includes("Cómo ajustarlo"), panel1.slice(0, 80));
await shot("05-panel-ayuda");
await go("plantillas");
check("Al cambiar de sección el panel se cierra", await p.$eval("#help-panel", (e) => e.hidden));
await p.click(".help-fab"); await sleep(150);
check("El panel cambia con la sección (Plantillas)", (await p.$eval("#help-panel", (e) => e.textContent)).includes("{{#zona}}"));
await p.keyboard.press("Escape"); await sleep(100);
check("Escape cierra el panel de ayuda", await p.$eval("#help-panel", (e) => e.hidden));
for (const r of ["clientes", "seguimiento", "informes", "configuracion"]) {
  await go(r);
  check(`Sección ${r}: tiene ayudas flotantes en sus controles`, (await p.$$eval("main [data-tip]", (e) => e.length)) >= 2);
}

// ---------- Apariencia ----------
await go("apariencia");
await shot("06-apariencia");
await card("Océano");
check("Elegir la paleta Océano cambia el color principal y el fondo en toda la app", (await rootVar("--brand")) === "#0b6e99" && (await rootVar("--bg")) === "#f4f9fc", await rootVar("--brand"));
check("El fondo del <body> cambió de verdad", rgbOf(await css("body", "backgroundColor")).join() === "244,249,252", await css("body", "backgroundColor"));
await shot("07-paleta-oceano");
await p.reload({ waitUntil: "networkidle0" });
check("La paleta se recuerda al recargar", (await rootVar("--brand")) === "#0b6e99");
// El script de arranque aplica la paleta antes de que cargue la hoja de estilos (sin destello).
const early = await b.newPage(); await early.setViewport({ width: 800, height: 600 }); await early.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await early.evaluateOnNewDocument(() => { document.addEventListener("readystatechange", () => { if (!window.__earlyBrand && document.documentElement.style.getPropertyValue("--brand")) window.__earlyBrand = document.documentElement.style.getPropertyValue("--brand") + "@" + document.readyState; }); });
await early.goto(BASE, { waitUntil: "load" });
const earlyVal = await early.evaluate(() => window.__earlyBrand);
check("El arranque aplica la paleta durante la carga (sin destello)", (earlyVal || "").startsWith("#0b6e99@"), earlyVal);
await early.close();
await go("apariencia");
await tab("Oscuro");
check("Modo oscuro: data-theme=dark, fondo oscuro y color principal claro", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark" && (await rootVar("--bg")) === "#0d1a22" && (await rootVar("--brand")) === "#5cc0ee");
await shot("08-oscuro-oceano");
await tab("Claro");
check("Modo claro forzado vuelve a fondos claros", (await rootVar("--bg")) === "#f4f9fc");

// Legibilidad de botón principal y menú activo en TODAS las paletas y ambos modos
const nPresets = (await p.$$eval("main .palette-card", (c) => c.length)) - 1;
const bad = [];
for (const mode of ["Claro", "Oscuro"]) {
  for (let i = 0; i < nPresets; i++) {
    await tab(mode);
    await p.evaluate((k) => document.querySelectorAll("main .palette-card")[k].click(), i); await sleep(100);
    const r = await p.evaluate(() => { const bt = document.querySelector("main .btn-primary"), nv = document.querySelector("#nav a[aria-current]"), cs = (e) => getComputedStyle(e); return { btn: [cs(bt).color, cs(bt).backgroundColor], nav: [cs(nv).color, cs(nv).backgroundColor], name: document.querySelector("main .palette-card[aria-pressed=true]").textContent }; });
    for (const [what, [fg, bg]] of [["botón", r.btn], ["menú", r.nav]]) if (ratio(rgbOf(fg), rgbOf(bg)) < 4.5) bad.push(`${r.name}/${mode}/${what} ${fg} sobre ${bg}`);
  }
}
check("Texto sobre botón principal y menú activo legible (≥4,5:1) en las 6 paletas × claro/oscuro", bad.length === 0, bad.join("\n"));

// Personalizada (se parte de Pibox claro para que los valores sean conocidos)
await tab("Claro"); await card("Pibox");
await card("Personalizada");
check("Personalizada parte de los colores actuales y muestra 10 selectores", (await p.$$eval("main input[type=color]", (e) => e.length)) === 10 && (await p.$eval("main input[type=color]", (e) => e.value)) === "#5b2a86");
const hexes = await p.$$("main .color-row input[type=text]");
await typeInto(hexes[0], "#d6246e");
check("Escribir un color hex cambia el color principal al instante", (await rootVar("--brand")) === "#d6246e", await rootVar("--brand"));
check("El selector de color se sincroniza con el texto", (await p.$eval("main input[type=color]", (e) => e.value)) === "#d6246e");
check("Se aplica a los botones reales", rgbOf(await css("main .btn-primary", "backgroundColor")).join() === "214,36,110", await css("main .btn-primary", "backgroundColor"));
await typeInto(hexes[0], "rojo");
check("Un código inválido se marca y no rompe el tema", (await hexes[0].evaluate((e) => e.getAttribute("aria-invalid"))) === "true" && (await rootVar("--brand")) === "#d6246e");
await typeInto(hexes[0], "#d6246e");
await shot("09-personalizada");
// Texto ilegible → aviso
check("Con colores legibles no hay aviso", (await p.$$("main .alert.warn")).length === 0);
await typeInto(hexes[4], "#faf8fc");
check("Texto casi igual al fondo → aviso de legibilidad", (await p.$$eval("main .alert.warn", (e) => e.map((x) => x.textContent).join())).includes("texto"));
await shot("10-aviso-legibilidad");
await typeInto(hexes[4], "#231a2e");
check("Al corregirlo el aviso desaparece", (await p.$$("main .alert.warn")).length === 0);
await p.reload({ waitUntil: "networkidle0" });
check("La paleta personalizada se recuerda", (await rootVar("--brand")) === "#d6246e");

// Tamaño y esquinas
await go("apariencia");
await tab("Grande");
check("Letra «Grande» = 17 px", (await css("body", "fontSize")) === "17px", await css("body", "fontSize"));
await tab("Muy grande");
check("Letra «Muy grande» = 19 px y sin scroll horizontal", (await css("body", "fontSize")) === "19px" && !(await hscroll()));
await tab("Redondeadas");
check("Esquinas redondeadas cambian botones y tarjetas", (await css("main .btn", "borderRadius")) === "14px" && (await css("main .card", "borderRadius")) === "18px", await css("main .btn", "borderRadius"));
await shot("11-letra-grande-redondeado");
// Ayudas desactivables
await p.click("#tipsChk"); await sleep(100);
await p.hover("#nav a[href='#/informes']"); await sleep(200);
check("Desactivar ayudas flotantes oculta los globos", await p.evaluate(() => document.getElementById("tip-pop").hidden));
await p.click("#tipsChk"); await sleep(100);
// Restablecer
await clickText("Restablecer apariencia");
await p.evaluate(() => [...document.querySelectorAll("dialog button")].find((x) => x.textContent === "Restablecer").click()); await sleep(250);
check("Restablecer apariencia vuelve al morado Pibox, letra 15 px y esquinas normales", (await rootVar("--brand")) === "#5b2a86" && (await css("body", "fontSize")) === "15px" && (await css("main .card", "borderRadius")) === "10px", await rootVar("--brand"));

// ---------- Tutorial ----------
await go("tutorial");
check("Tutorial: 9 pasos con enlace a su sección", (await p.$$eval("main ol.steps li", (e) => e.length)) === 9 && (await p.$$eval("main ol.steps a", (a) => a.every((x) => x.getAttribute("href").startsWith("#/")))));
await shot("12-tutorial");
await clickText("▶ Iniciar recorrido guiado"); await sleep(200);
const coach = await p.$eval(".coach", (e) => e.textContent).catch(() => "");
check("Recorrido guiado: abre en el paso 1 señalando el botón del menú", coach.includes("Paso 1 de 11") && coach.includes("Contraer o expandir"), coach.slice(0, 60));
check("Resalta el elemento que explica", await p.$eval("#navToggle", (e) => e.classList.contains("tour-focus")));
await shot("13-recorrido");
const seen = [coach];
for (let i = 0; i < 10; i++) { await clickText("Siguiente →", ".coach"); seen.push(await p.$eval(".coach", (e) => e.textContent).catch(() => "")); }
check("Recorre las 9 opciones del menú y el botón de ayuda", ["Generador de mensajes", "Apariencia", "Buzón de ideas", "Ayuda de cada sección"].every((t) => seen.some((s) => s.includes(t))), seen.map((s) => s.slice(0, 20)).join("|"));
check("La tarjeta del recorrido siempre queda dentro de la pantalla", await p.$eval(".coach", (e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
await clickText("Terminar", ".coach"); await sleep(100);
check("Terminar cierra el recorrido y quita el resaltado", !(await p.$(".coach")) && !(await p.$(".tour-focus")));

// ---------- Buzón de ideas ----------
await go("ideas");
await shot("14-ideas");
await clickText("Guardar idea");
check("Ideas: no guarda vacío y explica por qué", (await p.$eval("main [role=alert]", (e) => e.textContent)).includes("título") && (await p.evaluate(() => window.__pibox.store.state.ideas.length)) === 0);
await setVal("main input[type=text]", "Filtrar por localidad en el generador");
await setVal("main textarea", "Cuando tengo 100 clientes quiero ver solo los de Chapinero al buscar.");
check("Con texto escrito hay borrador pendiente (se avisa antes de salir)", await p.evaluate(() => !!window.__pibox.dirty?.()));
await clickText("Guardar idea"); await sleep(250);
const st = await p.evaluate(() => JSON.parse(JSON.stringify(window.__pibox.store.state)));
check("La idea queda guardada con título, texto, sección e importancia", st.ideas.length === 1 && st.ideas[0].title.startsWith("Filtrar") && st.ideas[0].kind === "Generador de mensajes" && st.ideas[0].priority === "media", JSON.stringify(st.ideas));
check("La idea aparece en la lista y el formulario queda limpio", (await p.$eval("main .idea-list", (e) => e.textContent)).includes("Filtrar por localidad") && (await p.$eval("main input[type=text]", (e) => e.value)) === "");
check("Sin borrador pendiente tras guardar", await p.evaluate(() => !window.__pibox.dirty?.()));
await shot("15-idea-guardada");
await clickText("Descargar Excel"); await sleep(700);
const files = fs.readdirSync(D + "/dl").filter((f) => f.startsWith("ideas-"));
const rows = files.length ? XLSX.utils.sheet_to_json(XLSX.readFile(D + "/dl/" + files[0]).Sheets.Ideas) : [];
check("Excel de ideas descargado con la idea", rows.length === 1 && rows[0]["Título"].startsWith("Filtrar"), JSON.stringify(rows));
await p.reload({ waitUntil: "networkidle0" });
check("Las ideas sobreviven a recargar", (await p.evaluate(() => window.__pibox.store.state.ideas.length)) === 1);
await go("ideas");
await clickText("Eliminar", "main .idea-list");
await p.evaluate(() => [...document.querySelectorAll("dialog button")].find((x) => x.textContent === "Eliminar").click()); await sleep(200);
check("Eliminar una idea pide confirmación y la quita", (await p.evaluate(() => window.__pibox.store.state.ideas.length)) === 0);

// Correo de destino en Configuración
await go("configuracion");
await setVal("input[type=email]", "no-es-correo");
await clickText("Guardar configuración");
check("Configuración rechaza un correo de ideas inválido", (await p.$eval("main [role=alert]", (e) => e.textContent)).includes("correo"));
await setVal("input[type=email]", "mejoras@empresa.com");
await clickText("Guardar configuración"); await sleep(150);
check("Configuración guarda el correo del buzón", (await p.evaluate(() => window.__pibox.store.state.config.ideasEmail)) === "mejoras@empresa.com");

// ---------- Responsive ----------
for (const w of [390, 768, 1366]) {
  await p.setViewport({ width: w, height: 800 });
  const overflow = [];
  for (const collapsed of [false, true]) {
    await p.evaluate((c) => { if (c) document.documentElement.setAttribute("data-nav", "collapsed"); else document.documentElement.removeAttribute("data-nav"); }, collapsed);
    for (const r of ["generador", "apariencia", "tutorial", "ideas", "configuracion"]) { await go(r); if (await hscroll()) overflow.push(`${r}${collapsed ? "(contraído)" : ""}`); }
  }
  check(`Sin scroll horizontal a ${w}px en las pantallas nuevas (expandido y contraído)`, overflow.length === 0, overflow.join(","));
}
await p.setViewport({ width: 390, height: 800 }); await p.evaluate(() => document.documentElement.removeAttribute("data-nav")); await go("generador"); await shot("16-movil");
await p.click(".help-fab"); await sleep(200); await shot("17-movil-ayuda");
check("Móvil: el panel de ayuda cabe en pantalla", await p.$eval("#help-panel", (e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; }));
await p.setViewport({ width: 1366, height: 900 });
check("Menú, botón de contraer y «?» son accesibles con teclado", await p.evaluate(() => [...document.querySelectorAll("#nav a, #navToggle, .help-fab")].every((e) => e.tabIndex >= 0)));
check("Sin errores de JavaScript en toda la sesión", errs.length === 0, errs.join(" | "));

report();
await b.close();
process.exit(results.some((r) => r[0] === "FALLIDO") ? 1 : 0);
