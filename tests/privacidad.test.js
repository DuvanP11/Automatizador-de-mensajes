import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// El repositorio es PÚBLICO y el sitio no tiene inicio de sesión: ningún dato de clientes puede viajar con el código.
const root = path.resolve(import.meta.dirname, "..");
const tracked = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? tracked(path.join(dir, d.name)) : [path.join(dir, d.name)]));

test("no hay archivos de datos de clientes dentro de la web", () => {
  assert.equal(fs.existsSync(path.join(root, "data", "clientes.json")), false, "data/clientes.json no debe existir");
  assert.equal(fs.existsSync(path.join(root, "data")) && fs.readdirSync(path.join(root, "data")).length > 0, false, "la carpeta data/ debe estar vacía o no existir");
});

test("la web no pide ninguna base de clientes por red", () => {
  for (const f of tracked("js").filter((x) => x.endsWith(".js"))) {
    const t = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(!/clientes\.json/.test(t), `${f} no debe leer clientes.json`);
  }
});

test("la única salida de red del código es leer la apariencia del Agente Comercial (GET, sin datos, sin credenciales)", () => {
  const withFetch = tracked("js").filter((x) => x.endsWith(".js")).filter((f) => /\bfetch(Impl)?\(/.test(fs.readFileSync(path.join(root, f), "utf8")) && !f.endsWith("prefs.js"));
  assert.deepEqual(withFetch, [], `solo js/ui/prefs.js puede usar fetch; también lo usan: ${withFetch.join(", ")}`);
  const prefs = fs.readFileSync(path.join(root, "js/ui/prefs.js"), "utf8");
  assert.match(prefs, /credentials: "omit"/);
  assert.ok(!/method:\s*"POST"|body:/.test(prefs), "no debe enviar cuerpo");
  for (const f of tracked("js").filter((x) => x.endsWith(".js"))) {
    const t = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(!/sendBeacon|XMLHttpRequest|WebSocket|EventSource/.test(t), `${f} no debe abrir otras conexiones`);
  }
});

test("la CSP solo permite conectar al propio sitio y al Agente Comercial", () => {
  for (const f of ["index.html", "vercel.json"]) {
    const t = fs.readFileSync(path.join(root, f), "utf8");
    const connect = /connect-src ([^;"]*)/.exec(t)?.[1].trim();
    assert.equal(connect, "'self' https://agente-comercial-xi.vercel.app", f);
  }
});
