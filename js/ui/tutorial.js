import { h } from "./dom.js";
import { HELP, TUTORIAL } from "../core/help.js";
import { placeNear } from "./tips.js";

export function renderTutorial(root, ctx) {
  const label = (path) => ctx.routes.find((r) => r.path === path)?.label || path;
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { text: "Tutorial" }), h("p", { text: "Cómo usar el Automatizador de Mensajes, paso a paso." })),
      h("div", { class: "actions" }, h("button", { class: "btn btn-primary", type: "button", text: "▶ Iniciar recorrido guiado", "data-tip": "Te va señalando cada opción del menú y para qué sirve.", onclick: () => startTour(ctx) }))),
    h("section", { class: "card" }, h("h2", { text: "Antes de empezar" }),
      h("ul", { class: "plain" },
        h("li", { text: "La aplicación prepara el mensaje y abre WhatsApp; nunca envía nada por sí sola. Tú das el último clic." }),
        h("li", { text: "Tus datos viven solo en este navegador: no se comparten con otros comerciales ni con otros equipos." }),
        h("li", { text: "Por eso conviene descargar un respaldo con frecuencia (Configuración → Descargar respaldo)." }),
        h("li", { text: "Pasa el mouse sobre cualquier botón u opción para ver una ayuda, y usa el botón «?» (abajo a la derecha) para ver cómo funciona la sección donde estás." }))),
    h("ol", { class: "steps" }, TUTORIAL.map((s, i) => h("li", { class: "card step" },
      h("div", { class: "step-n", "aria-hidden": "true", text: String(i + 1) }),
      h("div", {}, h("h2", { text: s.title }), h("p", { text: s.text }), h("p", { class: "hint", text: `💡 ${s.tip}` }),
        h("a", { class: "btn btn-secondary btn-sm", href: `#/${s.path}`, text: `Ir a ${label(s.path)}` }))))),
  );
}

// ---------- Recorrido guiado: señala cada opción del menú ----------
let tour = null;

export function stopTour() {
  if (!tour) return;
  tour.target?.classList.remove("tour-focus");
  tour.card.remove();
  window.removeEventListener("resize", tour.onResize);
  document.removeEventListener("keydown", tour.onKey);
  tour = null;
}

export function startTour(ctx) {
  stopTour();
  const steps = [
    { sel: "#navToggle", title: "Contraer o expandir el menú", text: "Este botón encoge el menú para dejar más espacio al contenido, o lo vuelve a abrir. Se recuerda tu elección." },
    ...ctx.routes.map((r) => ({ sel: `#nav a[href="#/${r.path}"]`, title: r.label, text: `${HELP[r.path]?.short || ""} ${HELP[r.path]?.summary || ""}`.trim() })),
    { sel: ".help-fab", title: "Ayuda de cada sección", text: "El botón «?» explica cómo se usa la sección donde estás y cómo ajustarla. Además, al pasar el mouse sobre botones y opciones verás ayudas cortas." },
  ];
  const card = h("div", { class: "coach", role: "dialog", "aria-label": "Recorrido guiado" });
  document.body.append(card);
  tour = { card, target: null, i: 0 };
  const draw = () => {
    tour.target?.classList.remove("tour-focus");
    const s = steps[tour.i];
    const target = document.querySelector(s.sel);
    tour.target = target;
    const last = tour.i === steps.length - 1;
    card.replaceChildren(
      h("div", { class: "coach-count", text: `Paso ${tour.i + 1} de ${steps.length}` }),
      h("h3", { text: s.title }), h("p", { text: s.text }),
      h("div", { class: "actions end" },
        h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Salir", onclick: stopTour }),
        tour.i > 0 ? h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "← Anterior", onclick: () => { tour.i--; draw(); } }) : null,
        h("button", { class: "btn btn-primary btn-sm", type: "button", text: last ? "Terminar" : "Siguiente →", onclick: () => { if (last) stopTour(); else { tour.i++; draw(); } } })));
    if (target) { target.classList.add("tour-focus"); target.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    place();
    card.querySelector(".btn-primary")?.focus();
  };
  const place = () => { if (tour?.target) placeNear(card, tour.target, "right", 14); };
  tour.onResize = place;
  tour.onKey = (e) => { if (e.key === "Escape") stopTour(); };
  window.addEventListener("resize", tour.onResize);
  document.addEventListener("keydown", tour.onKey);
  draw();
}
