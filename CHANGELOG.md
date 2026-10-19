# Changelog

## 2.2.0 — Personalización, ayuda integrada, tutorial y buzón de ideas
- **Apariencia (nueva sección):** modo claro/oscuro/automático, 6 paletas, paleta **personalizada** con 10 colores (fondos, tarjetas, texto, bordes, botones, avisos…), tamaño de letra y esquinas. Los tonos derivados (hover, fondos de alertas, texto sobre cada color) se calculan solos y se avisa si una combinación queda ilegible. «Restablecer apariencia» vuelve al diseño original. Se guarda por navegador y se aplica antes de pintar.
- **Ayudas flotantes:** globo explicativo en cada opción del menú y en los botones clave de cada pantalla (mouse y teclado; Esc lo cierra) y botón «?» con «cómo se usa / cómo ajustarlo» por sección. Se pueden desactivar en Apariencia.
- **Tutorial (nueva sección):** 9 pasos con enlace a cada sección y «Recorrido guiado» que señala el menú.
- **Buzón de ideas (nueva sección):** guardar sugerencias, enviarlas por correo o descargarlas en Excel. Nuevo campo «Correo para recibir las ideas» en Configuración. Las ideas viajan en el respaldo JSON.
- **Menú contraíble:** botón para contraer/expandir el menú lateral (solo íconos); se recuerda entre visitas.
- Los colores fijos de la interfaz (texto sobre botones, avisos, vista previa de WhatsApp, notificaciones) ahora salen del tema, así que cambian con la paleta.
- 10 pruebas unitarias nuevas (colores/contraste, buzón, persistencia) y 64 pruebas de navegador (`e2e/ui.mjs`).

## 2.1.1 — Logo de Pibox comercial
- El logo de la barra lateral, el favicon de la pestaña y los íconos de la app (192/512 px) ahora son el logo circular de Pibox comercial, en reemplazo del que se había creado de forma provisional.

## 2.1.0 — Asignación de clientes a un comercial
- **Importación:** nuevo bloque «¿A quién pertenecen estos clientes?» en el asistente. Asigna todos los clientes del archivo a un comercial (por defecto, quien importa si el archivo no trae columna de comercial). Los clientes que ya tienen otro comercial no se tocan salvo que marques «También reasignar…».
- **Clientes:** filtro por comercial con conteo (incluye «Sin comercial»), columna de comercial visible, selección múltiple y reasignación en bloque. Al reasignar, el seguimiento existente del cliente pasa al nuevo comercial y queda en su historial.
- **Generador:** opción «Solo mis clientes» y el comercial visible en cada sugerencia.
- Corregido: si una empresa nueva aparecía dos veces en el archivo, su segundo teléfono se guardaba duplicado.

## 2.0.3 — Emojis en WhatsApp
- Corregido: los emojis llegaban a WhatsApp como «�». Causa: `wa.me` los corrompe al redirigir. Ahora se abre `api.whatsapp.com/send` directamente, que los conserva (verificado contra el servidor de WhatsApp con 👋 y 🚚).

## 2.0.2 — Varios teléfonos por celda
- Una celda con varios números (separados por coma, `;`, `/` o «y») ahora crea un contacto por número; el primero queda como principal y los repetidos se descartan.
- Números inválidos (`0000000000`, incompletos, fijos que no sirven para WhatsApp) se omiten con aviso; no bloquean al resto de la fila.
- Encabezados en plural o con otro orden (`CELULARES`, `NAME COMPANY`) se reconocen con seguridad y el asistente salta al resumen.
- Acciones masivas para filas sin cliente en la base: «Crearlas como clientes nuevos» (una empresa repetida en el archivo se crea una sola vez) o «Ignorarlas».
- Corregido: aparecía la palabra «null» en el mapeo de columnas.

## 2.0.1 — Teléfonos y WhatsApp
- «Abrir en WhatsApp» siempre activo con aviso claro; importación directa de teléfonos con sugerencias de clientes parecidos.

## 2.0.0 — Evolución comercial

### Añadido
- **Clientes y contactos:** modelo con varios contactos por cliente; asistente «Agregar o sincronizar clientes» (base o directorio, `.xlsx`/`.xls`/`.csv`), detección de encabezados con variantes y en cualquier fila, mapeo editable, resumen previo (nuevos, actualizados, contactos, duplicados, errores, revisión manual), reporte de errores en Excel y deshacer la última importación.
- **Sincronización:** por ID; si no hay ID, por nombre normalizado; ambigüedades y conflictos de ID van a revisión manual; los cambios sobre datos existentes se muestran `anterior → nuevo` y no se aplican sin marcarlos.
- **Configuración comercial** centralizada: identidad del comercial, oferta (tarifa numérica con formato `$10.500 COP`), saludo automático con hora de Colombia o manual, zonas, indicativo de país.
- **Plantillas:** editor completo (crear, editar, duplicar, renombrar, eliminar con confirmación, predeterminada), variables, bloques opcionales, alternativas de redacción y vista previa.
- **Generador:** panel «Mensaje plantilla» separado de «Mensaje generado» (editable), advertencias de datos faltantes, zona opcional («Ninguna» elimina la frase completa), regenerar, copiar y abrir WhatsApp con teléfono validado.
- **Selector de emojis** con categorías, búsqueda, recientes y favoritos; admite emojis compuestos; se puede desactivar globalmente.
- **Seguimiento comercial:** 11 estados editables (se desactivan, no se eliminan) con categoría para indicadores, historial inmutable, filtros, orden, alertas de vencidos.
- **Informes gerenciales:** 12 indicadores y 4 porcentajes con denominador explícito; exportación Excel de 4 hojas que respeta los filtros.
- **Persistencia** en `localStorage` con respaldo/restauración JSON.
- **Identidad visual:** logo propio (propuesta original, no es el logo oficial de Pibox), ícono, favicon SVG/PNG y manifest; navegación lateral, modo claro/oscuro, diseño responsivo.
- **Seguridad:** todo el texto entra al DOM con `textContent`; CSP y cabeceras en `vercel.json` y `<meta>`; SheetJS local.
- **Pruebas:** 43 unitarias (`npm test`) y 72 comprobaciones e2e en Chrome (`e2e/`).

### Cambiado
- La aplicación pasó de un archivo minificado a módulos ES (`js/core` lógica pura, `js/ui` vistas).
- Negrita de WhatsApp: el modelo se envuelve con `*…*` (antes `**…**`, que WhatsApp no interpreta).
- SheetJS 0.18.5 por CDN → 0.20.3 local en `vendor/` (la versión de npm/CDN 0.18.5 tiene vulnerabilidades conocidas).
- El tono del README ya no promete evitar el spam: las alternativas de redacción son para claridad.

### Eliminado
- `js/app.js` (script anterior): sustituido por los módulos nuevos; además insertaba datos de clientes con `innerHTML` sin escapar. Sigue en el historial de Git.
- «Emojis aleatorios sutiles» y los dos campos de emoji de 4 caracteres: reemplazados por el selector.
- Los dos cargadores separados (contactos / correos): el correo se importa en la misma tabla (columna «Correo»).

### Seguridad / datos
- Sin dependencias de ejecución nuevas. Dev: `xlsx` (pruebas) y, solo para e2e, `puppeteer-core` (`--no-save`).
