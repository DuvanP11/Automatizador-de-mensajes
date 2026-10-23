import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRemote, buildRemoteCache, pickTheme, FONT_STACKS } from "../js/core/remote-theme.js";
import { PRESETS, COLOR_KEYS } from "../js/core/theme.js";

const ORIGIN = "https://agente-comercial-xi.vercel.app";
const good = (over = {}) => ({ v: 1, scheme: "auto", light: { ...PRESETS.pibox.light }, dark: { ...PRESETS.pibox.dark }, radius: 10, font: "system", logoUrl: null, version: "1-abc", ...over });

test("acepta la respuesta válida del Agente Comercial", () => {
  const r = sanitizeRemote(good(), ORIGIN);
  assert.equal(r.scheme, "auto"); assert.equal(r.light.brand, "#5b2a86"); assert.equal(r.dark.brand, "#b88ae6"); assert.equal(r.radius, 10); assert.equal(r.font, "system");
  for (const k of COLOR_KEYS) assert.ok(r.light[k] && r.dark[k], k);
});

test("rechaza todo lo que no cuadra, sin tocar la apariencia actual", () => {
  assert.equal(sanitizeRemote(null, ORIGIN), null);
  assert.equal(sanitizeRemote({}, ORIGIN), null);
  assert.equal(sanitizeRemote(good({ v: 2 }), ORIGIN), null);
  assert.equal(sanitizeRemote(good({ scheme: "neon" }), ORIGIN), null);
  assert.equal(sanitizeRemote(good({ light: { ...PRESETS.pibox.light, brand: "rojo" } }), ORIGIN), null);
  assert.equal(sanitizeRemote(good({ light: { ...PRESETS.pibox.light, brand: undefined } }), ORIGIN), null);
  assert.equal(sanitizeRemote(good({ dark: null }), ORIGIN), null);                 // «auto» exige la variante oscura
  assert.equal(sanitizeRemote(good({ light: { ...PRESETS.pibox.light, brand: "url(javascript:alert(1))" } }), ORIGIN), null); // nunca se pasa texto libre al CSS
});

test("modo fijo: una sola variante; el radio se limita y la fuente desconocida cae a la del sistema", () => {
  const r = sanitizeRemote(good({ scheme: "light", dark: null, radius: 999, font: "comic" }), ORIGIN);
  assert.equal(r.dark, null); assert.equal(r.radius, 24); assert.equal(r.font, "system");
  assert.equal(sanitizeRemote(good({ radius: -5 }), ORIGIN).radius, 0);
  assert.equal(sanitizeRemote(good({ radius: "x" }), ORIGIN).radius, 10);
});

test("el logo solo se acepta si sale del propio Agente Comercial", () => {
  assert.equal(sanitizeRemote(good({ logoUrl: `${ORIGIN}/brand/logo?v=123` }), ORIGIN).logoUrl, `${ORIGIN}/brand/logo?v=123`);
  for (const bad of ["https://evil.com/brand/logo", `${ORIGIN}/otra/ruta`, "javascript:alert(1)", "data:image/png;base64,AAAA", "/brand/logo", 42, null]) assert.equal(sanitizeRemote(good({ logoUrl: bad }), ORIGIN).logoUrl, null, String(bad));
});

test("buildRemoteCache deriva todos los tonos y aplica esquinas y letra del Agente", () => {
  const c = buildRemoteCache(sanitizeRemote(good({ radius: 20, font: "serif" }), ORIGIN));
  assert.equal(c.light.vars["--brand"], "#5b2a86"); assert.equal(c.dark.vars["--brand"], "#b88ae6");
  assert.equal(c.light.scheme, "light"); assert.equal(c.dark.scheme, "dark");
  assert.equal(c.light.vars["--radius"], "20px"); assert.equal(c.light.vars["--radius-sm"], "16px"); assert.equal(c.light.vars["--font"], FONT_STACKS.serif);
  assert.equal(c.light.vars["--on-brand"], "#ffffff"); assert.ok(c.light.vars["--ok-bg"]);
});

test("pickTheme: automático sigue al sistema; un modo fijo ignora al sistema", () => {
  const auto = buildRemoteCache(sanitizeRemote(good(), ORIGIN));
  assert.equal(pickTheme(auto, false).scheme, "light"); assert.equal(pickTheme(auto, true).scheme, "dark");
  const fixed = buildRemoteCache(sanitizeRemote(good({ scheme: "dark", light: { ...PRESETS.pibox.dark }, dark: null }), ORIGIN));
  assert.equal(pickTheme(fixed, false).scheme, "dark"); assert.equal(pickTheme(fixed, true).scheme, "dark");
});

test("lo ya validado se puede volver a validar (así se recupera la apariencia guardada)", () => {
  const once = sanitizeRemote(good({ radius: 14, font: "mono", logoUrl: `${ORIGIN}/brand/logo?v=1` }), ORIGIN);
  assert.deepEqual(sanitizeRemote(JSON.parse(JSON.stringify(once)), ORIGIN), once);
});
