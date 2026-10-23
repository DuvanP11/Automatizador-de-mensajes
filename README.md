# Automatizador de Mensajes · Pibox

Herramienta comercial interna para preparar mensajes de WhatsApp personalizados, llevar el seguimiento de cada cliente y sacar informes gerenciales en Excel.

> **Importante:** la aplicación **prepara** el mensaje y **abre la conversación** en WhatsApp. No envía nada por sí sola ni de forma masiva. Respeta el consentimiento del cliente y las solicitudes de no contacto.

## Funcionalidades

| Sección | Qué hace |
|---|---|
| **Generador de mensajes** | Busca un cliente (con teclado), carga su ID, teléfono y correo, genera el mensaje desde una plantilla, permite editarlo, copiarlo y abrirlo en WhatsApp. Panel «Mensaje plantilla» separado de «Mensaje generado». |
| **Clientes y contactos** | Base de clientes con varios contactos por empresa. Asistente **«Agregar o sincronizar clientes»** para importar la base o un directorio de teléfonos desde Excel. |
| **Plantillas** | Crear, editar, duplicar, renombrar, eliminar (con confirmación) y marcar como predeterminada. Variables, bloques opcionales, emojis y vista previa. |
| **Seguimiento comercial** | Estado por cliente, fechas de último contacto y próximo seguimiento, comercial responsable, notas con historial, filtros y alertas de vencidos. |
| **Informes gerenciales** | Indicadores calculados con datos reales, filtros y descarga de Excel (4 hojas). |
| **Configuración** | Nombre/cargo del comercial, oferta (modelo, tarifa, franja…), saludo, zonas, indicativo de país, estados de seguimiento, correo del buzón de ideas, respaldo y restauración. |
| **Apariencia (compartida)** | Ya no se elige aquí: la define el **Agente Comercial** (colores, modo claro/oscuro, esquinas, letra y logo) y esta web la copia sola al abrirse o recargarse (`/api/public/theme`). Si el Agente no responde, se queda con la última apariencia guardada o con el diseño de fábrica. Aquí solo queda activar/desactivar las ayudas flotantes (en Configuración) y un enlace para ir a cambiarla allá. |
| **Registro en la Auditoría** | Si entras desde el Agente Comercial, esta web le informa a su Auditoría qué secciones abres y qué acciones haces, **solo con frases de una lista fija** (p. ej. «importó clientes — N filas»). Nunca viajan nombres, teléfonos, correos, mensajes ni archivos de clientes. Si abres la web directo por su dirección, no se informa nada. |
| **Tutorial** | Guía paso a paso y **recorrido guiado** que señala cada opción del menú. |
| **Buzón de ideas** | Cada persona anota mejoras (título, detalle, sección, importancia). Quedan en el navegador; se envían por correo (`mailto:`, al destinatario de Configuración) o se descargan en Excel. |

**Ayuda integrada:** el menú muestra un globo con la explicación de cada opción (también con el menú contraído y con teclado), los botones clave traen ayudas al pasar el mouse y el botón **«?»** (abajo a la derecha) explica cómo se usa y cómo se ajusta la sección actual. Todo el texto de ayuda está en `js/core/help.js`. El menú lateral se contrae/expande con el botón **«** y se recuerda.

## Cómo ejecutarla

Es un sitio estático (sin backend, sin build):

```bash
npm start            # = npx serve .   (o: python3 -m http.server 8791)
```

Abre la URL que indique (no sirve abrir `index.html` con doble clic: los módulos ES requieren servidor). Se despliega tal cual en Vercel (`vercel.json`).

Requisitos: un navegador moderno. Para las pruebas: Node 20+.

### Tecnologías
HTML + CSS + JavaScript (módulos ES) sin framework. [SheetJS](https://sheetjs.com) 0.20.3 para leer/escribir Excel, **incluido localmente** en `vendor/` (no depende de un CDN).

## Guía rápida

### 1) Configura tus datos (una vez)
**Configuración →** escribe tu nombre y cargo, revisa tarifa, franja y condiciones, y pulsa **Guardar configuración**. Todo lo que aparece en el mensaje sale de ahí.

### 2) Importar clientes y teléfonos
**Clientes y contactos → Agregar o sincronizar clientes**
1. Elige *Base de clientes* o *Directorio de teléfonos* y sube el `.xlsx`/`.xls`.
2. Revisa el **mapeo de columnas** (se reconocen variantes como *Razón social*, *CompanyID*, *Celular*, *E-mail*; los encabezados pueden estar en cualquier fila). Mínimo: nombre o ID del cliente; para el directorio, además el teléfono.
3. Revisa el **resumen**: clientes nuevos, actualizados, contactos nuevos, duplicados, errores y filas que requieren revisión.
   - Se relaciona **primero por ID**; si no hay ID, por **nombre normalizado** (mayúsculas, tildes y espacios). Empresas con nombres parecidos pero distintos **no** se fusionan.
   - Coincidencias ambiguas o ID distinto con el mismo nombre → decides tú (crear nuevo / es el mismo / ignorar).
   - **Nunca se sobrescribe sin mostrarlo:** los cambios sobre datos existentes aparecen como `valor anterior → nuevo` y vienen **sin marcar**.
   - Puedes descargar un **reporte de errores** en Excel para corregir tu archivo de origen.
4. **¿A quién pertenecen?** En el resumen elige el comercial al que se asignan los clientes del archivo (o deja que se use la columna de comercial del Excel). Después, en *Clientes* puedes filtrar por comercial, seleccionar varios y **reasignarlos en bloque**.
5. **Confirmar importación.** Hasta la sesión actual puedes usar *Deshacer última importación*.

### 3) Generar un mensaje
**Generador →** busca el cliente; el teléfono se carga solo (si tiene varios contactos eliges a cuál escribir). Elige zona (**Ninguna** quita toda la frase de zona), revisa el mensaje, edítalo si quieres y **Abrir en WhatsApp**. Opcionalmente registra el contacto en Seguimiento.
- El botón de WhatsApp solo se habilita con un teléfono válido. Los números de 10 dígitos usan el indicativo configurado (57 por defecto) **solo al abrir WhatsApp**; el número guardado no se modifica.
- *Regenerar desde plantilla* descarta tus ediciones (pide confirmación); la plantilla nunca cambia.

### 4) Plantillas
Sintaxis:
- `{{variable}}` — ver la lista junto al editor (`nombre_cliente`, `id_cliente`, `nombre_contacto`, `nombre_comercial`, `cargo_comercial`, `area_comercial`, `modelo_comercial`, `tarifa`, `zona`, `franja_horaria`, `condiciones`, `beneficio`, `llamada_accion`, `firma`, `saludo`).
- `{{#zona}} para la zona de {{zona}}{{/zona}}` — bloque opcional: desaparece completo si la variable está vacía. `{{^zona}}…{{/zona}}` es el inverso.
- `[[Opción A|Opción B]]` — alternativas de redacción; «Variar redacción» cambia entre ellas. Sirven para elegir la frase más natural, **no** para evadir filtros de WhatsApp.

Si falta una variable obligatoria se muestra una advertencia; nunca quedan `{{etiquetas}}` en el texto final.

### 5) Seguimiento
Cambia el estado directamente en la tabla; **Detalle** abre fechas, motivo, responsable de la siguiente acción, modelo y la línea de tiempo (el historial nunca se borra). «No interesado» exige motivo. Los estados se editan en Configuración; **se desactivan, no se eliminan**, y cada uno pertenece a una *categoría* que decide cómo cuenta en los informes.

### 6) Informes
Los totales cambian con los filtros. Cada indicador explica qué mide y, en los porcentajes, su denominador (p. ej. *Interesados sobre contactados: 1 de 2*). **Descargar informe Excel** respeta los filtros y trae: `Resumen gerencial`, `Detalle de clientes`, `Historial de gestión` y `Pendientes` (las dos últimas solo si hay datos). «—» = no aplica; vacío = sin dato. **No** incluye teléfonos ni correos.

## Dónde se guardan los datos (léelo)
Todo vive en el **`localStorage` de este navegador**: un solo usuario, un solo equipo. **No se sincroniza** entre comerciales ni computadores y **no es una copia de seguridad**: se pierde si se borran los datos del sitio, se usa otro navegador o se limpia el equipo. Usa **Configuración → Descargar respaldo (JSON)** con frecuencia; el menú lateral avisa hace cuántos días fue el último.

## Limitaciones conocidas
- Sin inicio de sesión ni permisos: el «comercial responsable» es un dato, no una cuenta. No hay seguridad por usuario.
- Sin sincronización multiusuario; eso requeriría un backend con autenticación y base de datos (ver `INFORME_IMPLEMENTACION.md`).
- SheetJS Community no escribe estilos: el Excel trae filtros, anchos, fechas y formatos de número, pero sin negritas ni colores de encabezado.
- **La web no trae ninguna base de clientes.** Cada persona carga la suya (Clientes y contactos → «Agregar o sincronizar clientes») y vive solo en su navegador. El repositorio es público y el sitio no tiene inicio de sesión, por eso ningún dato de clientes puede ir en el código; `tests/privacidad.test.js` lo vigila.

## Pruebas
```bash
npm test                                  # 58 pruebas unitarias (importador, plantillas, seguimiento, informe, persistencia)
npm i --no-save puppeteer-core            # una sola vez
npm start &                               # o: python3 -m http.server 8791
E2E_URL=http://127.0.0.1:8791/index.html node e2e/e2e.mjs   # 72 comprobaciones en Chrome real
```
Los archivos Excel de prueba son ficticios y se generan en `e2e/mkfx.mjs`. Resultados y salvedades: `INFORME_IMPLEMENTACION.md`.
