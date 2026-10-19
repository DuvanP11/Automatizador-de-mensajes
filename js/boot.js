// Aplica la apariencia guardada ANTES de que cargue la hoja de estilos principal, para que no haya destello de colores.
// Es un script clásico (no módulo) a propósito: los módulos se ejecutan después de pintar. La lógica completa vive en js/ui/prefs.js.
(function () {
  try {
    var s = JSON.parse(localStorage.getItem("pibox_ui_prefs_v1"));
    if (!s || !s.cache || !s.prefs) return;
    var p = s.prefs, root = document.documentElement;
    var dark = p.mode === "dark" || (p.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    var t = s.cache[dark ? "dark" : "light"];
    for (var k in t.vars) root.style.setProperty(k, t.vars[k]);
    root.setAttribute("data-theme", t.scheme);
    if (p.collapsed) root.setAttribute("data-nav", "collapsed");
  } catch (e) { /* sin preferencias guardadas: se usa el tema por defecto del CSS */ }
})();
