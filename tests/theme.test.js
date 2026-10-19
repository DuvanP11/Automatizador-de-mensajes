import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, mix, contrast, onColor, deriveTheme, sanitizePrefs, buildCache, contrastWarnings, PRESETS, COLOR_KEYS, DEFAULT_PREFS } from "../js/core/theme.js";
import { buildMailto, MAILTO_LIMIT } from "../js/core/ideas.js";
import { createStore, normalizeState } from "../js/core/store.js";

test("normalizeHex acepta #abc y #aabbcc, rechaza lo demás", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex(" #5B2A86 "), "#5b2a86");
  for (const bad of ["5b2a86", "#12", "#gggggg", "rojo", "", null, undefined, "#12345678"]) assert.equal(normalizeHex(bad), null);
});

test("mix y contraste", () => {
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mix("#123456", "#ffffff", 0), "#123456");
  assert.ok(contrast("#000000", "#ffffff") > 20.9);
  assert.equal(contrast("#777777", "#777777"), 1);
});

test("onColor elige texto legible sobre cualquier fondo", () => {
  assert.equal(onColor("#ffffff"), "#14101a");
  assert.equal(onColor("#000000"), "#ffffff");
  for (const hex of ["#5b2a86", "#b88ae6", "#f5b83d", "#ffd60a", "#0b6e99"]) assert.ok(contrast(hex, onColor(hex)) >= 4.5, hex);
});

test("todas las paletas traen los 10 colores válidos y texto legible en claro y oscuro", () => {
  for (const [id, p] of Object.entries(PRESETS)) for (const mode of ["light", "dark"]) {
    for (const k of COLOR_KEYS) assert.ok(normalizeHex(p[mode][k]), `${id}.${mode}.${k}`);
    assert.ok(contrast(p[mode].text, p[mode].bg) >= 7, `${id}.${mode} texto/fondo`);
    assert.ok(contrast(p[mode].text, p[mode].surface) >= 7, `${id}.${mode} texto/tarjeta`);
    assert.ok(contrast(p[mode].brand, p[mode].surface) >= 3, `${id}.${mode} principal/tarjeta`);
    assert.deepEqual(contrastWarnings(p[mode]).filter((w) => !/bordes/.test(w)), [], `${id}.${mode}`);
  }
});

test("deriveTheme: detecta oscuro, deriva tonos y respeta tamaño/esquinas", () => {
  const dark = deriveTheme(PRESETS.pibox.dark, { fontSize: "l", radius: "sharp" });
  assert.equal(dark.scheme, "dark");
  assert.equal(dark.vars["--fs"], "17px");
  assert.equal(dark.vars["--radius"], "4px");
  assert.equal(dark.vars["--shadow"], "none");
  const light = deriveTheme(PRESETS.pibox.light);
  assert.equal(light.scheme, "light");
  assert.equal(light.vars["--brand"], "#5b2a86");
  assert.equal(light.vars["--on-brand"], "#ffffff");
  for (const v of Object.values(light.vars)) assert.equal(typeof v, "string");
});

test("sanitizePrefs descarta basura y conserva lo válido", () => {
  const p = sanitizePrefs({ mode: "neon", palette: "nada", fontSize: "gigante", radius: 5, collapsed: "si", tips: false, custom: { brand: "#123", bg: "malo" } });
  assert.equal(p.mode, "auto"); assert.equal(p.palette, "pibox"); assert.equal(p.fontSize, "m"); assert.equal(p.radius, "normal");
  assert.equal(p.collapsed, false); assert.equal(p.tips, false);
  assert.equal(p.custom.brand, "#112233"); assert.equal(p.custom.bg, DEFAULT_PREFS.custom.bg);
  assert.deepEqual(sanitizePrefs(null), sanitizePrefs(undefined));
  assert.equal(sanitizePrefs({ collapsed: true }).collapsed, true);
});

test("buildCache: personalizada usa los mismos colores en claro y oscuro", () => {
  const prefs = sanitizePrefs({ palette: "custom", custom: { ...PRESETS.pibox.light, bg: "#101010", surface: "#1a1a1a", text: "#f0f0f0" } });
  const c = buildCache(prefs);
  assert.equal(c.light.vars["--bg"], "#101010"); assert.equal(c.dark.vars["--bg"], "#101010");
  assert.equal(c.light.scheme, "dark");
  assert.notEqual(buildCache(sanitizePrefs({})).light.vars["--bg"], buildCache(sanitizePrefs({})).dark.vars["--bg"]);
});

test("contrastWarnings avisa de combinaciones ilegibles", () => {
  const bad = { ...PRESETS.pibox.light, text: "#f5f5f5", bg: "#ffffff", surface: "#ffffff" };
  assert.ok(contrastWarnings(bad).length >= 2);
});

test("buildMailto: codifica, pone destinatario y respeta el tope", () => {
  const idea = (n) => ({ title: `Idea ${n} con ñ y & símbolos`, text: "Detalle largo ".repeat(12), kind: "Plantillas", priority: "alta", author: "Ana" });
  const one = buildMailto("a@b.co", [idea(1)]);
  assert.ok(one.href.startsWith("mailto:a@b.co?subject="));
  assert.equal(one.omitted, 0);
  assert.ok(decodeURIComponent(one.href).includes("Idea 1 con ñ y & símbolos"));
  const many = buildMailto("", Array.from({ length: 30 }, (_, i) => idea(i)));
  assert.ok(many.href.length <= MAILTO_LIMIT); assert.ok(many.omitted > 0); assert.ok(many.href.startsWith("mailto:?subject="));
  const huge = buildMailto("", [{ ...idea(1), text: "x".repeat(2000) }]);
  assert.ok(huge.href.length <= MAILTO_LIMIT);
  assert.equal(buildMailto("", []).omitted, 0);
});

test("las ideas y el correo del buzón sobreviven al respaldo y datos viejos se normalizan", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const st = createStore(storage); st.load();
  st.commit((d) => { d.ideas.unshift({ id: "i1", title: "T", text: "texto largo ok", kind: "Otra cosa", priority: "media", author: "", createdAt: "2026-10-19T00:00:00Z" }); d.config.ideasEmail = "x@y.co"; });
  const next = st.parseBackup(st.exportBackup());
  assert.equal(next.ideas.length, 1); assert.equal(next.config.ideasEmail, "x@y.co");
  const old = normalizeState({ clients: [], config: {} });
  assert.deepEqual(old.ideas, []); assert.equal(old.config.ideasEmail, "");
  assert.deepEqual(normalizeState({ clients: [], ideas: [null, { title: 1 }, { title: "ok", text: "ok" }] }).ideas.length, 1);
});
