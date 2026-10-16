# Changelog

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
