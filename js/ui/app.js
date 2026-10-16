import { createStore, seedClients } from "../core/store.js";
import { h, toast, confirmDialog } from "./dom.js";
import { renderGenerator } from "./generator.js";
import { renderClients } from "./clients.js";
import { renderTemplates } from "./templates.js";
import { renderFollowup } from "./followup.js";
import { renderReports } from "./reports.js";
import { renderSettings } from "./settings.js";

const ROUTES = [
  { path: "generador", label: "Generador de mensajes", ico: "✉", render: renderGenerator },
  { path: "clientes", label: "Clientes y contactos", ico: "👥", render: renderClients },
  { path: "plantillas", label: "Plantillas", ico: "📝", render: renderTemplates },
  { path: "seguimiento", label: "Seguimiento comercial", ico: "📌", render: renderFollowup },
  { path: "informes", label: "Informes gerenciales", ico: "📊", render: renderReports },
  { path: "configuracion", label: "Configuración", ico: "⚙", render: renderSettings },
];

const store = createStore();
const ctx = { store, XLSX: window.XLSX, dirty: null, navigate: (p) => { location.hash = `#/${p}`; }, routes: ROUTES };
window.__pibox = ctx; // utilidad de depuración/pruebas; no expone nada que no esté ya en el navegador del usuario

const main = document.getElementById("main");
const nav = document.getElementById("nav");
let currentPath = null;
let reverting = false;

function drawNav(active) {
  nav.replaceChildren(...ROUTES.map((r) => h("a", { href: `#/${r.path}`, "aria-current": r.path === active ? "page" : null }, h("span", { class: "ico", "aria-hidden": "true", text: r.ico }), r.label)));
}

function drawFoot() {
  const foot = document.getElementById("sideFoot");
  const s = store.state;
  const days = s.lastBackupAt ? Math.floor((Date.now() - new Date(s.lastBackupAt)) / 864e5) : null;
  foot.replaceChildren(
    h("div", { text: `${s.clients.length} clientes guardados en este navegador` }),
    h("div", { text: days === null ? "Sin respaldo descargado" : `Último respaldo: hace ${days} d` }),
  );
}

async function route() {
  if (reverting) { reverting = false; return; }
  const path = (location.hash.replace(/^#\/?/, "").split("?")[0]) || "generador";
  if (currentPath && ctx.dirty?.()) {
    const ok = await confirmDialog({ title: "Cambios sin guardar", message: "Tienes cambios sin guardar. Si sales ahora se descartarán.", confirmText: "Descartar y salir", danger: true });
    if (!ok) { reverting = true; location.hash = `#/${currentPath}`; return; }
  }
  ctx.dirty = null;
  const r = ROUTES.find((x) => x.path === path) || ROUTES[0];
  currentPath = r.path;
  document.title = `${r.label} · Automatizador de Mensajes Pibox`;
  drawNav(r.path);
  main.replaceChildren();
  try {
    r.render(main, ctx);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h("div", { class: "alert err", text: "Ocurrió un error al mostrar esta sección. Recarga la página; tus datos guardados no se han modificado." }));
  }
  drawFoot();
  main.focus({ preventScroll: true });
}

async function init() {
  store.load();
  if (store.persistError) toast(store.persistError, "err", 6000);
  if (!store.state.seeded) {
    // Primera vez: base inicial incluida en el repositorio (solo nombre, ID y localidad).
    let seed = [];
    if (!store.state.clients.length) {
      try { const res = await fetch("data/clientes.json"); if (res.ok) seed = await res.json(); } catch { /* sin base inicial */ }
    }
    store.commit((d) => { if (!d.clients.length) d.clients = seedClients(seed, d.config.zones); d.seeded = true; });
  }
  store.subscribe(drawFoot);
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", (e) => { if (ctx.dirty?.()) { e.preventDefault(); e.returnValue = ""; } });
  route();
}
init();
