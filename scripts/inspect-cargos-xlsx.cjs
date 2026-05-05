/* Inspection of Plano de Cargos.xlsx */
const XLSX = require("xlsx");
const path = require("path");

const file = path.join(__dirname, "..", "Plano de Cargos.xlsx");
const wb = XLSX.readFile(file);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

console.log(`Total rows: ${rows.length}`);

// Unique setores
const setores = new Set();
const niveis = new Set();
const salarios = new Set();

for (const r of rows) {
  if (r.Setor) setores.add(r.Setor.trim());
  if (r.Nivel) niveis.add(r.Nivel);
  if (r.SalarioAtual) salarios.add(r.SalarioAtual);
}

console.log(`\nUnique setores (${setores.size}):`);
for (const s of [...setores].sort()) console.log(`  - ${s}`);

console.log(`\nUnique niveis (${niveis.size}):`, [...niveis].sort());

console.log(`\nUnique salarios (${salarios.size}):`, [...salarios].sort());

// Detect duplicates by trimmed NomeFuncao
const byName = new Map();
for (const r of rows) {
  if (!r.NomeFuncao) continue;
  const key = r.NomeFuncao.trim().toLowerCase();
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(r);
}

const duplicates = [...byName.entries()].filter(([_, v]) => v.length > 1);
console.log(`\nDuplicates: ${duplicates.length} names with >1 row`);
for (const [name, rs] of duplicates.slice(0, 10)) {
  console.log(`  "${name}": ${rs.length}x — variants: ${rs.map(r => `[${r.Setor}|${r.Nivel}|${r.SalarioAtual}]`).join(", ")}`);
}

console.log(`\nUnique trimmed NomeFuncao count: ${byName.size}`);

// Check rows with null/empty fields
const nullRows = rows.filter(r => !r.NomeFuncao || !r.Nivel || !r.SalarioAtual);
console.log(`\nRows with missing fields: ${nullRows.length}`);
if (nullRows.length > 0) console.log(JSON.stringify(nullRows.slice(0, 5), null, 2));

// Salary parsing check
console.log("\nSample salary parse:");
for (const s of [...salarios].slice(0, 5)) {
  console.log(`  "${s}" → ${parseFloat(String(s).replace(",", "."))}`);
}
