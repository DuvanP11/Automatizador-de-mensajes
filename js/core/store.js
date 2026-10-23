// Persistencia local (localStorage) + respaldo JSON. Un solo navegador / un solo equipo.
// OJO: localStorage NO es copia de seguridad: se pierde si se borran los datos del sitio o se cambia de navegador/equipo.
import { DEFAULT_CONFIG, defaultTemplates } from "./config.js";
import { deepClone, uid, nameKey } from "./util.js";
import { newFollowup } from "./followup.js";

const KEY = "pibox_automatizador_v2";
export const SCHEMA_VERSION = 2;

export function emptyState() {
  return { version: SCHEMA_VERSION, clients: [], templates: defaultTemplates(), followups: {}, ideas: [], broadcasts: [], runs: [], config: deepClone(DEFAULT_CONFIG), seeded: false, lastBackupAt: "" };
}

/** Completa claves faltantes (migraciones suaves) sin tocar lo existente. */
export function normalizeState(raw) {
  const base = emptyState();
  const s = { ...base, ...raw };
  s.config = {
    ...base.config, ...(raw.config || {}),
    commercial: { ...base.config.commercial, ...(raw.config?.commercial || {}) },
    offer: { ...base.config.offer, ...(raw.config?.offer || {}) },
    greeting: { ...base.config.greeting, ...(raw.config?.greeting || {}) },
    emojis: { ...base.config.emojis, ...(raw.config?.emojis || {}) },
  };
  if (!Array.isArray(s.config.statuses) || !s.config.statuses.length) s.config.statuses = base.config.statuses;
  if (!Array.isArray(s.templates) || !s.templates.length) s.templates = base.templates;
  if (!s.templates.some((t) => t.isDefault)) s.templates[0].isDefault = true;
  s.clients = (Array.isArray(s.clients) ? s.clients : []).map((c) => ({ contacts: [], legalName: "", zone: "", owner: "", notes: "", ...c, contacts: (c.contacts || []).map((ct) => ({ cid: ct.cid || uid("ct"), name: "", phone: "", email: "", primary: false, ...ct })) }));
  s.ideas = (Array.isArray(s.ideas) ? s.ideas : []).filter((i) => i && typeof i.title === "string" && typeof i.text === "string");
  s.broadcasts = (Array.isArray(s.broadcasts) ? s.broadcasts : []).filter((b) => b && typeof b.id === "string" && Array.isArray(b.variants));
  s.runs = (Array.isArray(s.runs) ? s.runs : []).filter((r) => r && typeof r.id === "string" && Array.isArray(r.items));
  s.followups = s.followups && typeof s.followups === "object" ? s.followups : {};
  s.version = SCHEMA_VERSION;
  return s;
}

/** Convierte una lista en formato v1 (id, cliente, localidad) en clientes v2. Ya no hay base incluida con la web; lo usan las pruebas. */
export function seedClients(list, zones) {
  const now = new Date().toISOString();
  const canon = new Map(zones.map((z) => [nameKey(z), z]));
  return list.map((r) => ({
    uid: uid("cl"), id: String(r.id ?? ""), name: String(r.cliente ?? ""), legalName: "", zone: canon.get(nameKey(r.localidad)) || String(r.localidad ?? ""),
    owner: "", notes: "", contacts: [], createdAt: now, updatedAt: now,
  }));
}

export function createStore(storage = globalThis.localStorage) {
  let state = emptyState();
  const listeners = new Set();
  let persistError = null;

  function load() {
    try {
      const txt = storage?.getItem(KEY);
      if (txt) state = normalizeState(JSON.parse(txt));
    } catch (e) {
      persistError = "No se pudo leer la información guardada en este navegador.";
    }
    return state;
  }
  function save() {
    try {
      storage?.setItem(KEY, JSON.stringify(state));
      persistError = null;
    } catch (e) {
      persistError = "No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). Descarga un respaldo.";
    }
  }
  const emit = () => listeners.forEach((fn) => fn(state));

  return {
    get state() { return state; },
    get persistError() { return persistError; },
    load,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Aplica una mutación sobre una copia y guarda. */
    commit(mutator) {
      const draft = deepClone(state);
      mutator(draft);
      state = draft;
      save();
      emit();
    },
    exportBackup() {
      const payload = { app: "pibox-automatizador", schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: state };
      return JSON.stringify(payload, null, 2);
    },
    /** Valida y devuelve el estado a importar; no lo aplica hasta confirmar. */
    parseBackup(text) {
      let obj;
      try { obj = JSON.parse(text); } catch { throw new Error("El archivo no es un respaldo JSON válido."); }
      if (obj?.app !== "pibox-automatizador" || !obj.data || !Array.isArray(obj.data.clients)) throw new Error("El archivo no corresponde a un respaldo de esta aplicación.");
      return normalizeState(obj.data);
    },
    replaceAll(newState) { state = normalizeState(newState); save(); emit(); },
    markBackup() { this.commit((d) => { d.lastBackupAt = new Date().toISOString(); }); },
    ensureFollowup(draft, clientUid) {
      if (!draft.followups[clientUid]) {
        const c = draft.clients.find((x) => x.uid === clientUid);
        draft.followups[clientUid] = newFollowup(clientUid, draft.config.statuses, { owner: c?.owner || "" });
      }
      return draft.followups[clientUid];
    },
  };
}
