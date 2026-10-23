import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_KEYS, SECTION_KEYS, buildEvent, createQueue, tokenExpiry, tokenUsable } from "../js/core/audit.js";

const tok = (e) => Buffer.from(JSON.stringify({ u: "x", e })).toString("base64url") + ".firma";

test("solo se construyen eventos con claves de la lista cerrada", () => {
  assert.deepEqual(buildEvent("view", "generador"), { t: "view", s: "generador" });
  assert.deepEqual(buildEvent("action", "wa_open"), { t: "action", a: "wa_open" });
  assert.deepEqual(buildEvent("action", "clients_import", 125.9), { t: "action", a: "clients_import", n: 125 });
  for (const [k, key] of [["view", "no-existe"], ["view", "__proto__"], ["action", "borrar"], ["action", "constructor"], ["click", "generador"], ["action", "Juan Pérez 3001234567"], ["view", undefined]]) assert.equal(buildEvent(k, key), null, `${k}/${key}`);
});

test("el número se acota y un texto no pasa por número", () => {
  assert.equal(buildEvent("action", "bc_prepare", 1e12).n, 100000);
  assert.equal(buildEvent("action", "bc_prepare", -4).n, 0);
  assert.equal("n" in buildEvent("action", "bc_prepare", "3001234567"), false);
  assert.equal("n" in buildEvent("action", "bc_prepare", NaN), false);
  assert.equal("n" in buildEvent("action", "bc_prepare"), false);
});

test("un evento nunca tiene más campos que t, s, a y n", () => {
  for (const s of SECTION_KEYS) assert.deepEqual(Object.keys(buildEvent("view", s)), ["t", "s"]);
  for (const a of ACTION_KEYS) assert.ok(Object.keys(buildEvent("action", a, 3)).every((k) => ["t", "a", "n"].includes(k)));
  assert.equal(new Set(ACTION_KEYS).size, ACTION_KEYS.length);
});

test("la firma se considera usable solo si no está por vencer", () => {
  const now = 1_000_000;
  assert.equal(tokenUsable(tok(now + 3_600_000), now), true);
  assert.equal(tokenUsable(tok(now + 30_000), now), false);
  assert.equal(tokenUsable(tok(now - 1), now), false);
  assert.equal(tokenUsable("", now), false); assert.equal(tokenUsable(null, now), false); assert.equal(tokenUsable("basura", now), false);
  assert.equal(tokenExpiry("###"), 0);
});

test("la cola agrupa de a 20 y descarta lo más viejo si se llena", () => {
  const q = createQueue();
  assert.equal(q.push(null), false);
  for (let i = 0; i < 70; i++) q.push({ t: "view", s: "generador", i });
  assert.equal(q.size, 40);
  assert.equal(q.take().length, 20); assert.equal(q.size, 20);
  assert.equal(q.take().length, 20); assert.equal(q.take().length, 0);
});
