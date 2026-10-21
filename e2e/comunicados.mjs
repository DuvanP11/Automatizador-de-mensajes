// Prueba de navegador de Comunicados: adjuntar imagen, redacciones alternas, selección de clientes, cola con pausa y registro.
// Uso: servir el sitio (python3 -m http.server 8791) y `node e2e/comunicados.mjs`.
import puppeteer from "puppeteer-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
const BASE = process.env.E2E_URL || "http://127.0.0.1:8791/index.html";
const results = [];
const check = (name, cond, extra = "") => results.push([cond ? "APROBADO" : "FALLIDO", name, cond ? "" : String(extra)]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const png = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pibox-bc-")), "aviso.png");
fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await p.setViewport({ width: 1366, height: 900 });
await p.goto(BASE, { waitUntil: "networkidle0" });
await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "networkidle0" });
// Teléfonos a los primeros 5 clientes (3 válidos distintos, 1 repetido, 1 fijo).
await p.evaluate(() => {
  const ph = ["3001110001", "3001110002", "3001110003", "3001110001", "6011234567"];
  window.__pibox.store.commit((d) => { d.clients.slice(0, 5).forEach((c, i) => { c.contacts = [{ cid: `t${i}`, name: "Contacto", phone: ph[i], email: "", primary: true }]; }); });
});
await p.evaluate(() => (location.hash = "#/comunicados")); await sleep(400);
const clickText = async (t, n = 0) => { const ok = await p.evaluate((t, n) => { const e = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === t && !x.disabled)[n]; if (!e) return false; e.click(); return true; }, t, n); await sleep(250); return ok; };

check("La sección Comunicados aparece en el menú", await p.evaluate(() => !!document.querySelector('#nav a[href="#/comunicados"]')));
await p.type("main input[type=text]", "Aviso de octubre");
check("Cargar ejemplo llena 2 redacciones", (await clickText("Cargar ejemplo")) && (await p.$$eval("main .variant textarea", (a) => a.length)) === 2);
await (await p.$('main input[type=file]')).uploadFile(png); await sleep(500);
check("La imagen adjunta se previsualiza (CSP permite blob:)", await p.evaluate(() => { const i = document.querySelector("img.media-prev"); return !!i && i.complete && i.naturalWidth > 0; }));
check("Guardar comunicado funciona", await clickText("Guardar comunicado") && await p.evaluate(() => window.__pibox.store.state.broadcasts.length === 1));
check("La imagen se guardó en IndexedDB", await p.evaluate(() => new Promise((res) => { const r = indexedDB.open("pibox_media_v1"); r.onsuccess = () => { const g = r.result.transaction("files").objectStore("files").getAll(); g.onsuccess = () => res(g.result.length === 1); }; })));
await p.evaluate(() => { document.querySelector("#bcPhone").click(); }); await sleep(100); // quita "solo con teléfono" para ver el total
await p.evaluate(() => { document.querySelector("#bcPhone").click(); }); await sleep(100);
await p.type('main input[type=search]', ""); // asegura foco sin filtrar
const withPhone = await p.$$eval("main tbody tr", (r) => r.length);
check("La tabla solo muestra clientes con teléfono válido", withPhone === 4, withPhone);
await p.evaluate(() => document.querySelector('thead input[type=checkbox]').click()); await sleep(150);
check("«Seleccionar todos» marca los visibles", await p.evaluate(() => window.__pibox.bc.selected.size === 4));
await p.evaluate(() => [...document.querySelectorAll("th button")].find((x) => x.textContent.startsWith("Cliente")).click()); await sleep(150);
const az = await p.$$eval("main tbody tr td:nth-child(2)", (t) => t.map((x) => x.textContent.replace("Repetido", "")));
check("Un clic en «Cliente» invierte a Z→A", az.every((x, i) => !i || az[i - 1].localeCompare(x, "es", { sensitivity: "base" }) >= 0), az.join("|"));
await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
await p.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent === "Preparar envío").click(); }); await sleep(300);
check("Se pide confirmar y avisa de omitidos", await p.evaluate(() => /Se omiten 1/.test(document.querySelector("dialog")?.textContent || "")));
await clickText("Preparar cola"); await sleep(300);
const run = await p.evaluate(() => window.__pibox.store.state.runs[0]);
check("La cola tiene 3 destinatarios únicos", run?.items.length === 3, JSON.stringify(run?.items.map((i) => i.waNumber)));
check("Las redacciones se alternan", run.items.every((it, i) => !i || it.variant !== run.items[i - 1].variant));
check("Muestra el botón de copiar imagen", await p.evaluate(() => [...document.querySelectorAll("button")].some((x) => x.textContent === "Copiar imagen")));
await clickText("Abrir WhatsApp");
const url = await p.evaluate(() => window.__opened[0] || "");
check("Abre WhatsApp con el número y el texto", url.includes(`phone=${run.items[0].waNumber}`) && url.includes(encodeURIComponent(run.items[0].text.slice(0, 12))), url);
await clickText("✓ Ya lo envié");
const after = await p.evaluate(() => ({ st: window.__pibox.store.state.runs[0].items[0].status, nextAt: window.__pibox.store.state.runs[0].nextAt, btn: document.querySelector("#bcOpen")?.disabled, fu: Object.keys(window.__pibox.store.state.followups).length }));
check("Marcar enviado inicia la pausa y deshabilita el botón", after.st === "sent" && after.nextAt > Date.now() && after.btn === true, JSON.stringify(after));
check("Se anota en Seguimiento comercial", after.fu === 1);
check("Sin barra de scroll horizontal", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
check("Sin errores de consola", errs.length === 0, errs.join(" | "));
console.log(results.map((r) => `${r[0]}  ${r[1]}${r[2] ? "\n      → " + r[2] : ""}`).join("\n"));
console.log(`\nTOTAL ${results.length} · FALLIDO ${results.filter((r) => r[0] === "FALLIDO").length}`);
await b.close();
process.exit(results.some((r) => r[0] === "FALLIDO") ? 1 : 0);
