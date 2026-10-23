import XLSX from "xlsx";
import fs from "node:fs";
XLSX.set_fs(fs);
const out = process.argv[2];
const w = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Hoja1"); XLSX.writeFile(wb, `${out}/${name}`); };
// Directorio: ALF001 existe en la base semilla; Tienda Demo (nombre normalizado, sin ID); Fantasma no existe; teléfono inválido.
w("directorio.xlsx", [["Reporte"], ["Razón social", "CompanyID", "Número de contacto", "Correo"],
  ["Alfa Demo Logística SAS", "ALF001", "3001234567", "ventas@alfa.test"],
  ["  TIENDA demo juguetes express ", "", "3109876543", ""],
  ["Fantasma SAS", "FAN001", "3205550000", ""],
  ["Aire Demo SAS", "AIR001", "123", ""]]);
w("clientes_nuevos.xlsx", [["Cliente", "ID cliente", "WhatsApp", "Localidad", "Comercial"],
  ["Nuevo Cliente Uno SAS", "00789", "3015550001", "Chapinero", "Juliana Rojas"],
  ["Nuevo Cliente Dos SAS", "00790", "3015550002", "Antonio Nariño", "Carlos Peña"],
  ["", "", "3015550003", "", ""]]);
w("raro.xlsx", [["Foo", "Bar"], ["1", "2"]]);
w("telefonos_parecidos.xlsx", [["Cliente", "Celular"], ["Alfa Demo Logística", "3112223344"]]);
w("contactos_clientes.xlsx", [["NAME COMPANY", "CELULARES"],
  ["Alfa Demo Logística SAS", "3045550101, 3045550102, 3045550103, 3045550104, 3045550105"],
  ["ALN ANIMAL DEMO", "3045550110"],
  ["Rent Demo Corporativo", "0000000000, 3045550106, 3045550107"],
  ["Aire Demo SAS", "3045550108, 3045550109, 6015550111"],
  ["Empresa Inventada Uno", "3151110001"],
  ["Empresa Inventada Uno", "3151110002"],
  ["Bodega Pibox", "12232323"]]);
w("clientes_masivos.xlsx", [["Cliente", "ID cliente", "Celular"],
  ...Array.from({ length: 40 }, (_, i) => [`Masivo Cliente ${String(i + 1).padStart(2, "0")} SAS`, `M${String(i + 1).padStart(3, "0")}`, `31200000${String(i + 10)}`])]);
console.log("ok");
