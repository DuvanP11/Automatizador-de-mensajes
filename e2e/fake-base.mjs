// Base de clientes FICTICIA solo para las pruebas de navegador (la web ya no trae ninguna base: cada persona carga la suya).
// Nada de aquí es un cliente real: nombres, IDs y zonas son inventados.
const ZONES = ["Chapinero", "Los martires", "Usaquén", "Suba", "Teusaquillo"];
export const FAKE_BASE = [
  { id: "ALF001", cliente: "Alfa Demo Logística SAS", localidad: "Chapinero" },
  { id: "AIR001", cliente: "Aire Demo SAS", localidad: "Los martires" },
  { id: "DEM001", cliente: "Tienda Demo Juguetes Express", localidad: "Chapinero" },
  ...Array.from({ length: 102 }, (_, i) => ({ id: `CLI${String(i + 1).padStart(3, "0")}`, cliente: `Cliente Demo ${String(i + 1).padStart(3, "0")} SAS`, localidad: ZONES[i % ZONES.length] })),
];
/** Carga la base ficticia en la página abierta (hay que llamarla después de limpiar localStorage y recargar). */
export async function seedFake(page) {
  await page.evaluate(async (list) => {
    const m = await import(new URL("js/core/store.js", location.href).href);
    window.__pibox.store.commit((d) => { d.clients = m.seedClients(list, d.config.zones); d.seeded = true; });
  }, FAKE_BASE);
}
