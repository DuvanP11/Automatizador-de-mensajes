import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ACTION_KEYS, SECTION_KEYS } from "../js/core/audit.js";

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

test("las únicas salidas de red son: leer la apariencia del Agente Comercial y avisar a su Auditoría con claves cerradas", () => {
  const users = tracked("js").filter((x) => x.endsWith(".js")).filter((f) => /\bfetch(Impl)?\(/.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(users.sort(), ["js/ui/audit.js", "js/ui/prefs.js"], `solo prefs.js y audit.js pueden usar fetch; lo usan: ${users.join(", ")}`);
  const prefs = fs.readFileSync(path.join(root, "js/ui/prefs.js"), "utf8");
  assert.match(prefs, /credentials: "omit"/);
  assert.ok(!/method:\s*"POST"|body:/.test(prefs), "la lectura de apariencia no debe enviar cuerpo");
  const audit = fs.readFileSync(path.join(root, "js/ui/audit.js"), "utf8");
  assert.match(audit, /credentials: "omit"/);
  assert.match(audit, /body: JSON\.stringify\(\{ events \}\)/, "el único cuerpo permitido son los eventos de la lista cerrada");
  const imports = [...audit.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ["../core/audit.js", "../core/links.js"], "audit.js no puede importar el almacén de clientes ni nada que lo toque");
  for (const f of tracked("js").filter((x) => x.endsWith(".js"))) {
    const t = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(!/sendBeacon|XMLHttpRequest|WebSocket|EventSource/.test(t), `${f} no debe abrir otras conexiones`);
  }
});

test("track() solo recibe claves de la lista cerrada, nunca texto con datos de clientes", () => {
  // Cada llamada a track("...") o trackView(...) del código usa una clave conocida (un literal, no una variable con texto libre).
  const keys = new Set(ACTION_KEYS), secs = new Set(SECTION_KEYS);
  for (const f of tracked("js/ui").filter((x) => x.endsWith(".js") && !x.endsWith("audit.js"))) {
    const t = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of t.matchAll(/\btrack\(([^)]*)\)/g)) {
      const lit = /^\s*"([a-z_]+)"\s*(,.*)?$/.exec(m[1]);
      if (lit) { assert.ok(keys.has(lit[1]), `${f}: clave desconocida ${lit[1]}`); continue; }
      assert.match(m[1], /wasNew \? "client_create" : "client_edit"|W\.kind === "directory"/, `${f}: track() con algo que no es una clave fija: ${m[1]}`);
    }
    for (const m of t.matchAll(/\btrackView\(([^)]*)\)/g)) assert.ok(m[1].trim() === "r.path", `${f}: trackView solo con la ruta`);
  }
  for (const r of ["generador", "comunicados", "clientes", "plantillas", "seguimiento", "informes", "configuracion", "tutorial", "ideas"]) assert.ok(secs.has(r), r);
});

test("la CSP solo permite conectar al propio sitio y al Agente Comercial", () => {
  for (const f of ["index.html", "vercel.json"]) {
    const t = fs.readFileSync(path.join(root, f), "utf8");
    const connect = /connect-src ([^;"]*)/.exec(t)?.[1].trim();
    assert.equal(connect, "'self' https://agente-comercial-xi.vercel.app", f);
  }
});
