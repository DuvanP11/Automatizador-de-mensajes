import XLSX from "xlsx";
import fs from "node:fs";
XLSX.set_fs(fs);
const out = process.argv[2];
const w = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Hoja1"); XLSX.writeFile(wb, `${out}/${name}`); };
// Directorio: ADL001 existe en la base semilla; Ambrosia (nombre normalizado, sin ID); Fantasma no existe; teléfono inválido.
w("directorio.xlsx", [["Reporte"], ["Razón social", "CompanyID", "Número de contacto", "Correo"],
  ["ADL importaciones SAS", "ADL001", "3001234567", "ventas@adl.test"],
  ["  AMBROSIA toy store express ", "", "3109876543", ""],
  ["Fantasma SAS", "FAN001", "3205550000", ""],
  ["Airtempe SAS", "AIR001", "123", ""]]);
w("clientes_nuevos.xlsx", [["Cliente", "ID cliente", "WhatsApp", "Localidad", "Comercial"],
  ["Nuevo Cliente Uno SAS", "00789", "3015550001", "Chapinero", "Juliana Rojas"],
  ["Nuevo Cliente Dos SAS", "00790", "3015550002", "Antonio Nariño", "Carlos Peña"],
  ["", "", "3015550003", "", ""]]);
w("raro.xlsx", [["Foo", "Bar"], ["1", "2"]]);
w("telefonos_parecidos.xlsx", [["Cliente", "Celular"], ["ADL importaciones", "3112223344"]]);
w("contactos_clientes.xlsx", [["NAME COMPANY", "CELULARES"],
  ["ADL importaciones SAS", "3123806392, 3133269056, 3142819248, 3166924463, 3218402214"],
  ["ADN ANIMAL", "3196699895"],
  ["Alfred Rent Corporativo", "0000000000, 3002363980, 3003232326"],
  ["Airtempe SAS", "3004975195, 3107349057, 6012011589"],
  ["Empresa Inventada Uno", "3151110001"],
  ["Empresa Inventada Uno", "3151110002"],
  ["Bodega Pibox", "12232323"]]);
w("clientes_masivos.xlsx", [["Cliente", "ID cliente", "Celular"],
  ...Array.from({ length: 40 }, (_, i) => [`Masivo Cliente ${String(i + 1).padStart(2, "0")} SAS`, `M${String(i + 1).padStart(3, "0")}`, `31200000${String(i + 10)}`])]);
console.log("ok");
