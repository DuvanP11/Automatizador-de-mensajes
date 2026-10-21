// Imágenes y videos de los comunicados. Van en IndexedDB (localStorage no aguanta archivos); al igual que el resto, viven solo en este navegador.
const DB = "pibox_media_v1", STORE = "files";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(r?.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error); };
  });
}

export const putMedia = (id, blob) => tx("readwrite", (s) => s.put(blob, id));
export const getMedia = (id) => tx("readonly", (s) => s.get(id));
export const deleteMedia = (id) => tx("readwrite", (s) => s.delete(id));

/** WhatsApp Web solo acepta PNG al pegar desde el portapapeles; se convierte la foto si hace falta. */
async function toPng(blob) {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width; canvas.height = bmp.height;
  canvas.getContext("2d").drawImage(bmp, 0, 0);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo convertir la imagen"))), "image/png"));
}

export async function copyImageToClipboard(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Este navegador no permite copiar imágenes. Usa «Descargar» y adjúntala con el clip.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": await toPng(blob) })]);
}

/** Menú «Compartir» del sistema con el archivo (funciona sobre todo en celulares y en Safari/Edge). */
export function canShareFile(file) {
  try { return !!navigator.canShare?.({ files: [file] }); } catch { return false; }
}
