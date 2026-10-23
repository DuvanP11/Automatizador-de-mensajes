// Aplica la apariencia guardada ANTES de que cargue la hoja de estilos principal, para que no haya destello de colores.
// Es un script clásico (no módulo) a propósito: los módulos se ejecutan después de pintar. La lógica completa vive en js/ui/prefs.js.
// La apariencia viene del Agente Comercial (se guarda aquí la última que se leyó); si no hay ninguna, se usa el diseño de fábrica del CSS.
(function () {
  try {
    var root = document.documentElement;
    var u = JSON.parse(localStorage.getItem("pibox_ui_prefs_v1"));
    if (u && u.prefs && u.prefs.collapsed) root.setAttribute("data-nav", "collapsed");
    var s = JSON.parse(localStorage.getItem("pibox_remote_theme_v1"));
    if (!s || !s.cache || !s.remote) return;
    var dark = s.remote.scheme === "dark" || (s.remote.scheme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    var t = s.cache[dark ? "dark" : "light"];
    for (var k in t.vars) root.style.setProperty(k, t.vars[k]);
    root.setAttribute("data-theme", t.scheme);
  } catch (e) { /* sin apariencia guardada: se usa el tema por defecto del CSS */ }
})();
