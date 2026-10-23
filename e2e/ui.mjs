// Pruebas de navegador de la personalización: menú contraíble, ayudas flotantes, apariencia compartida con el Agente Comercial, tutorial y buzón de ideas.
// El Agente Comercial se simula interceptando /api/public/theme (aquí no hay internet ni servidor real).
// Uso: servir el sitio (python3 -m http.server 8791) y `node e2e/ui.mjs`. Con E2E_SHOTS=<carpeta> guarda capturas.
import puppeteer from "puppeteer-core";
import XLSX from "xlsx";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { seedFake } from "./fake-base.mjs";
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
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); // las cargas fallidas del tema simulado son a propósito
p.on("dialog", (d) => d.dismiss());
// ---- Agente Comercial simulado ----
const AC = "https://agente-comercial-xi.vercel.app";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PAL = { pibox: { l: { brand: "#5b2a86", accent: "#f5b83d", bg: "#faf8fc", surface: "#ffffff", text: "#231a2e", muted: "#6b6277", border: "#e4dcee", ok: "#167a4a", warn: "#8a5a00", err: "#b3261e" }, d: { brand: "#b88ae6", accent: "#f5b83d", bg: "#16111c", surface: "#1f1828", text: "#efe9f6", muted: "#a79bb8", border: "#3a2f48", ok: "#62d49a", warn: "#f5c566", err: "#ff8a82" } },
  oceano: { l: { brand: "#0b6e99", accent: "#f59e0b", bg: "#f4f9fc", surface: "#ffffff", text: "#10222e", muted: "#587081", border: "#d3e3ec", ok: "#167a4a", warn: "#8a5a00", err: "#b3261e" }, d: { brand: "#5cc0ee", accent: "#f5b83d", bg: "#0d1a22", surface: "#13252f", text: "#e6f3fa", muted: "#8fb0c2", border: "#254250", ok: "#62d49a", warn: "#f5c566", err: "#ff8a82" } },
  bosque: { l: { brand: "#2f6b3a", accent: "#e0a526", bg: "#f6faf4", surface: "#ffffff", text: "#1a2a1c", muted: "#5f7262", border: "#d9e6d6", ok: "#167a4a", warn: "#8a5a00", err: "#b3261e" }, d: { brand: "#8fd49a", accent: "#f5b83d", bg: "#0f1a12", surface: "#16241a", text: "#e8f3e9", muted: "#9bb59f", border: "#2a4130", ok: "#62d49a", warn: "#f5c566", err: "#ff8a82" } },
  atardecer: { l: { brand: "#c2410c", accent: "#7c3aed", bg: "#fff8f3", surface: "#ffffff", text: "#2b1a12", muted: "#7a6558", border: "#f0dccd", ok: "#167a4a", warn: "#8a5a00", err: "#b3261e" }, d: { brand: "#fb923c", accent: "#c4b5fd", bg: "#1c1310", surface: "#281c17", text: "#fbeee6", muted: "#c0a899", border: "#473429", ok: "#62d49a", warn: "#f5c566", err: "#ff8a82" } },
  grafito: { l: { brand: "#374151", accent: "#f59e0b", bg: "#f3f4f6", surface: "#ffffff", text: "#111827", muted: "#6b7280", border: "#d9dce1", ok: "#167a4a", warn: "#8a5a00", err: "#b3261e" }, d: { brand: "#cbd5e1", accent: "#fbbf24", bg: "#111214", surface: "#1a1c1f", text: "#f1f3f5", muted: "#9aa1ab", border: "#33373d", ok: "#62d49a", warn: "#f5c566", err: "#ff8a82" } },
  contraste: { l: { brand: "#0000b3", accent: "#b35900", bg: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#3d3d3d", border: "#000000", ok: "#006100", warn: "#6b3f00", err: "#a00000" }, d: { brand: "#ffd60a", accent: "#00e5ff", bg: "#000000", surface: "#0a0a0a", text: "#ffffff", muted: "#d0d0d0", border: "#ffffff", ok: "#4dff88", warn: "#ffd60a", err: "#ff6b6b" } } };
const themeJson = (pal, over = {}) => ({ v: 1, scheme: "auto", light: PAL[pal].l, dark: PAL[pal].d, radius: 10, font: "system", logoUrl: null, version: `${pal}-${JSON.stringify(over).length}`, ...over });
let mock = { status: 500, body: "" };           // lo que responde el «Agente Comercial» a /api/public/theme
const hits = [];
await p.setRequestInterception(true);
p.on("request", (rq) => {
  const u = rq.url();
  if (u.startsWith(`${AC}/api/public/theme`)) { hits.push(rq.method()); return mock.status === 0 ? rq.abort("failed") : rq.respond({ status: mock.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: typeof mock.body === "string" ? mock.body : JSON.stringify(mock.body) }); }
  if (u.startsWith(`${AC}/brand/logo`)) return rq.respond({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG });
  if (u.startsWith(AC)) return rq.abort("failed");
  return rq.continue();
});
const setTheme = (pal, over) => { mock = { status: 200, body: themeJson(pal, over) }; };
const reloadWait = async () => { await p.reload({ waitUntil: "networkidle0" }); await sleep(300); };

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
await seedFake(p); await sleep(200);

// ---------- Menú ----------
const links = await p.$$eval("#nav a", (a) => a.map((x) => x.getAttribute("href")));
check("El menú tiene 9 opciones (ya no hay «Apariencia»: la define el Agente Comercial), con Tutorial y Buzón de ideas", links.length === 9 && !links.includes("#/apariencia") && ["#/tutorial", "#/ideas"].every((h) => links.includes(h)), links.join(","));
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

// ---------- Apariencia compartida con el Agente Comercial ----------
check("Sin respuesta del Agente Comercial (y sin nada guardado) se ve el diseño de fábrica morado Pibox", (await rootVar("--brand")) === "#5b2a86" && (await rootVar("--bg")) === "#faf8fc" && hits.length > 0, await rootVar("--brand"));
check("La herramienta funciona igual aunque el Agente no responda (el menú se pinta)", (await p.$$("#nav a")).length === 9);
await go("apariencia");
check("La dirección #/apariencia ya no existe: cae al generador", (await p.evaluate(() => location.hash)) !== "" && (await p.$eval("main h1", (e) => e.textContent)).includes("Generador"), await p.evaluate(() => document.querySelector("main h1")?.textContent));

setTheme("oceano", { radius: 18, font: "serif", logoUrl: `${AC}/brand/logo?v=7` });
await reloadWait();
check("Toma los colores del Agente Comercial: color principal y fondo (Océano)", (await rootVar("--brand")) === "#0b6e99" && (await rootVar("--bg")) === "#f4f9fc", await rootVar("--brand"));
check("El fondo del <body> cambió de verdad", rgbOf(await css("body", "backgroundColor")).join() === "244,249,252", await css("body", "backgroundColor"));
check("Toma también las esquinas y el tipo de letra", (await css("main .card, .sidebar", "borderRadius")) !== "" && (await rootVar("--radius")) === "18px" && (await rootVar("--radius-sm")) === "14px" && (await css("body", "fontFamily")).includes("Georgia"), await css("body", "fontFamily"));
check("Usa el logo propio del Agente Comercial en el menú", (await p.$eval(".brand img", (e) => e.getAttribute("src"))) === `${AC}/brand/logo?v=7`, await p.$eval(".brand img", (e) => e.getAttribute("src")));
await shot("06-apariencia-oceano");
const cached = await p.evaluate(() => JSON.parse(localStorage.getItem("pibox_remote_theme_v1")));
check("Guarda la última apariencia leída (para pintar sin destello la próxima vez)", cached?.remote?.light?.brand === "#0b6e99" && !!cached?.cache?.dark);

mock = { status: 500, body: "" };
await reloadWait();
check("Si el Agente Comercial falla, se queda con la última apariencia guardada", (await rootVar("--brand")) === "#0b6e99" && (await rootVar("--radius")) === "18px");
mock = { status: 0, body: "" };
await reloadWait();
check("Sin conexión tampoco se pierde la apariencia guardada", (await rootVar("--brand")) === "#0b6e99");
mock = { status: 200, body: "esto no es json" };
await reloadWait();
check("Una respuesta ilegible se ignora", (await rootVar("--brand")) === "#0b6e99");
mock = { status: 200, body: { ...themeJson("bosque"), light: { ...PAL.bosque.l, brand: "url(javascript:alert(1))" } } };
await reloadWait();
check("Una respuesta con colores inválidos no se aplica (nunca se pasa texto libre al CSS)", (await rootVar("--brand")) === "#0b6e99" && !(await p.evaluate(() => document.documentElement.getAttribute("style"))).includes("javascript"));
setTheme("oceano", { radius: 18, font: "serif", logoUrl: "https://evil.example/brand/logo" });
await reloadWait();
check("Un logo que no sale del Agente Comercial se ignora y queda el de siempre", (await p.$eval(".brand img", (e) => e.getAttribute("src"))) === "assets/logo-icon.png", await p.$eval(".brand img", (e) => e.getAttribute("src")));

// Sin destello: el script de arranque aplica lo guardado ANTES de que cargue la hoja de estilos.
mock = { status: 500, body: "" };
const early = await b.newPage(); await early.setViewport({ width: 800, height: 600 }); await early.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await early.setRequestInterception(true); early.on("request", (rq) => (rq.url().startsWith(AC) ? rq.abort("failed") : rq.continue()));
await early.evaluateOnNewDocument(() => { document.addEventListener("readystatechange", () => { if (!window.__earlyBrand && document.documentElement.style.getPropertyValue("--brand")) window.__earlyBrand = document.documentElement.style.getPropertyValue("--brand") + "@" + document.readyState; }); });
await early.goto(BASE, { waitUntil: "load" });
const earlyVal = await early.evaluate(() => window.__earlyBrand);
check("El arranque aplica la apariencia guardada durante la carga (sin destello)", (earlyVal || "").startsWith("#0b6e99@"), earlyVal);
await early.close();

// Modo oscuro / claro del sistema con «automático»
setTheme("oceano");
await reloadWait();
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]); await sleep(300);
check("Con modo automático y el sistema en oscuro: data-theme=dark, fondo oscuro y color principal claro", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark" && (await rootVar("--bg")) === "#0d1a22" && (await rootVar("--brand")) === "#5cc0ee", await rootVar("--bg"));
await shot("07-oscuro-oceano");
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]); await sleep(300);
check("Al volver el sistema a claro, la web vuelve a fondos claros", (await rootVar("--bg")) === "#f4f9fc");
// Cambia en el Agente → se refleja en la siguiente carga
setTheme("bosque");
await reloadWait();
check("Si el Agente Comercial cambia la apariencia, esta web la toma al recargar", (await rootVar("--brand")) === "#2f6b3a" && (await rootVar("--bg")) === "#f6faf4", await rootVar("--brand"));
// Modo fijo del Agente: ignora al sistema
mock = { status: 200, body: { ...themeJson("pibox", { scheme: "dark", dark: null }), light: PAL.pibox.d } };
await reloadWait();
check("Modo oscuro fijo en el Agente: esta web sigue oscura aunque el sistema sea claro", (await p.evaluate(() => document.documentElement.dataset.theme)) === "dark" && (await rootVar("--bg")) === "#16111c", await rootVar("--bg"));

// Legibilidad de botón principal y menú activo en TODAS las paletas del Agente y ambos modos del sistema
const bad = [];
for (const [pal] of Object.entries(PAL)) {
  setTheme(pal); await reloadWait();
  for (const mode of ["light", "dark"]) {
    await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: mode }]); await sleep(150);
    const r = await p.evaluate(() => { const bt = document.querySelector("main .btn-primary") || document.querySelector("main .btn"), nv = document.querySelector("#nav a[aria-current]"), cs = (e) => getComputedStyle(e); return { btn: [cs(bt).color, cs(bt).backgroundColor], nav: [cs(nv).color, cs(nv).backgroundColor] }; });
    for (const [what, [fg, bg]] of [["botón", r.btn], ["menú", r.nav]]) if (ratio(rgbOf(fg), rgbOf(bg)) < 4.5) bad.push(`${pal}/${mode}/${what} ${fg} sobre ${bg}`);
  }
}
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
check("Texto sobre botón principal y menú activo legible (≥4,5:1) en las 6 paletas × claro/oscuro", bad.length === 0, bad.join("\n"));

// Enlaces con el Agente Comercial y ayudas
setTheme("pibox"); await reloadWait();
const foot = await p.$eval("#sideFoot a.side-link", (a) => ({ href: a.href, target: a.target, rel: a.rel }));
check("El menú trae un enlace «Volver al Agente Comercial» que abre en otra pestaña", foot.href.startsWith(AC) && foot.target === "_blank" && foot.rel.includes("noopener"), JSON.stringify(foot));
await go("configuracion");
const cfgLink = await p.$$eval("main a.btn", (a) => a.map((x) => ({ t: x.textContent, h: x.href, tg: x.target })).find((x) => /apariencia/i.test(x.t)));
check("Configuración explica que la apariencia se cambia en el Agente Comercial y enlaza allá", !!cfgLink && cfgLink.h === `${AC}/apariencia` && cfgLink.tg === "_blank", JSON.stringify(cfgLink));
await shot("08-configuracion-apariencia");
// Ayudas desactivables (ahora en Configuración)
await p.click("#tipsChk"); await sleep(100);
await p.hover("#nav a[href='#/informes']"); await sleep(200);
check("Desactivar ayudas flotantes (en Configuración) oculta los globos", await p.evaluate(() => document.getElementById("tip-pop").hidden));
await reloadWait();
await go("configuracion");
check("La casilla de ayudas sigue desmarcada tras recargar", (await p.$eval("#tipsChk", (e) => e.checked)) === false);
await p.click("#tipsChk"); await sleep(100);
check("Volver a activarlas la deja marcada y no marca la configuración como «sin guardar»", (await p.$eval("#tipsChk", (e) => e.checked)) === true && !(await p.evaluate(() => !!window.__pibox.dirty?.())));
// Datos viejos: quien tenía una apariencia local personalizada no la conserva (manda la del Agente)
await p.evaluate(() => localStorage.setItem("pibox_ui_prefs_v1", JSON.stringify({ prefs: { palette: "custom", mode: "dark", custom: { brand: "#d6246e" } }, cache: { dark: { vars: { "--brand": "#d6246e" }, scheme: "dark" }, light: { vars: { "--brand": "#d6246e" }, scheme: "light" } } })));
await reloadWait();
check("Una apariencia local antigua ya no se aplica: manda la del Agente Comercial", (await rootVar("--brand")) === "#5b2a86", await rootVar("--brand"));

// ---------- Buscador de clientes del Generador ----------
await p.evaluate(() => window.__pibox.store.commit((d) => { const c = d.clients.find((x) => x.id === "ALF001"); c.contacts = [{ cid: "a", name: "Carlos", phone: "3045550101", email: "ventas@alfa.test", primary: true }]; }));
await go("generador");
const sugg = () => p.$$eval("#sugg li", (l) => ({ n: l.length, hidden: document.getElementById("sugg").hidden, txt: l.map((x) => x.textContent).join(" | ") }));
await p.click("#gsearch"); await sleep(250);
let sg = await sugg();
check("Al hacer clic en el buscador se despliega la lista de clientes sin escribir nada", !sg.hidden && sg.n >= 50 && sg.txt.includes("Mostrando 50 de 105"), `${sg.n} ${sg.hidden}`);
await setVal("#gsearch", "3045550101"); sg = await sugg();
check("Buscar por número de teléfono encuentra al cliente y muestra por qué coincide", sg.n === 1 && sg.txt.includes("Alfa Demo Logística") && sg.txt.includes("Coincide: 3045550101"), sg.txt);
await setVal("#gsearch", "304 555 0101"); sg = await sugg();
check("El número se busca con espacios y cualquier formato", sg.n === 1 && sg.txt.includes("Alfa Demo"), sg.txt);
await setVal("#gsearch", "ventas@alfa"); sg = await sugg();
check("Buscar por correo encuentra al cliente", sg.n === 1 && sg.txt.includes("Coincide: ventas@alfa.test"), sg.txt);
await setVal("#gsearch", "zzzzqq"); sg = await sugg();
check("Sin coincidencias avisa por qué campos se busca", sg.n === 1 && sg.txt.includes("nombre, número, correo"), sg.txt);
await setVal("#gsearch", ""); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await sleep(350);
check("Con el teclado se elige un cliente de la lista", (await p.$eval("#gsearch", (e) => e.value)).length > 0 && (await p.$eval("#gphone", (e) => e.value)) !== undefined);
await p.$eval("#gsearch", (e) => e.blur());

// ---------- Firma de entrada desde el Agente Comercial ----------
const fakeTok = Buffer.from(JSON.stringify({ u: "x", e: Date.now() + 3_600_000 })).toString("base64url") + ".firma";
const viaAgente = await b.newPage(); await viaAgente.setRequestInterception(true); viaAgente.on("request", (rq) => (rq.url().startsWith(AC) ? rq.abort("failed") : rq.continue()));
await viaAgente.goto(`${BASE}#ac=${fakeTok}`, { waitUntil: "networkidle0" });
check("La firma de entrada se guarda y desaparece de la barra de direcciones", (await viaAgente.evaluate(() => localStorage.getItem("pibox_ac_token_v1"))) === fakeTok && !viaAgente.url().includes("ac="), viaAgente.url());
check("Con firma, Configuración avisa que se informa a la Auditoría (sin datos de clientes)", await (async () => { await viaAgente.evaluate(() => (location.hash = "#/configuracion")); await sleep(300); return (await viaAgente.$eval("main", (m) => m.textContent)).includes("Entraste desde el Agente Comercial"); })());
await viaAgente.evaluate(() => localStorage.removeItem("pibox_ac_token_v1")); // el almacenamiento se comparte entre pestañas del mismo sitio
await viaAgente.close();
await p.reload({ waitUntil: "networkidle0" });
await go("configuracion");
check("Sin firma, Configuración explica que esta sesión no está informando", (await p.$eval("main", (m) => m.textContent)).includes("Esta sesión no está informando"));

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
check("Recorre las 9 opciones del menú y el botón de ayuda", ["Generador de mensajes", "Buzón de ideas", "Ayuda de cada sección"].every((t) => seen.some((s) => s.includes(t))), seen.map((s) => s.slice(0, 20)).join("|"));
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
    for (const r of ["generador", "tutorial", "ideas", "configuracion"]) { await go(r); if (await hscroll()) overflow.push(`${r}${collapsed ? "(contraído)" : ""}`); }
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
