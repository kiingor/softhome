/**
 * Generates a SQL file to import positions from "Plano de Cargos.xlsx"
 *
 * Usage:
 *   node scripts/import-cargos-from-xlsx.cjs
 *
 * Output:
 *   scripts/output/import-cargos.sql  → run this in Supabase SQL Editor
 *
 * Behavior:
 *  - Trim + dedupe NomeFuncao (case-insensitive, keep first occurrence)
 *  - Match Setor → teams.name (case-insensitive); if no match, team_id = NULL
 *  - Nivel "0" → NULL (constraint requires 1–12)
 *  - SalarioAtual → numeric; falls back to 0
 *  - Taxes (INSS/FGTS/IRPF) all 0
 *  - Risk group / exam_periodicity → NULL
 *  - Targets the first company in `companies` (single-tenant assumption)
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const inputFile = path.join(__dirname, "..", "Plano de Cargos.xlsx");
const outputDir = path.join(__dirname, "output");
const outputFile = path.join(outputDir, "import-cargos.sql");

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const wb = XLSX.readFile(inputFile);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

// Normalize + dedupe
const seen = new Set();
const positions = [];

for (const r of rows) {
  if (!r.NomeFuncao) continue;
  const name = String(r.NomeFuncao).trim();
  if (!name) continue;
  const key = name.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);

  const setor = r.Setor ? String(r.Setor).trim() : null;
  const nivelRaw = r.Nivel ? parseInt(String(r.Nivel), 10) : null;
  const level = !nivelRaw || nivelRaw < 1 || nivelRaw > 12 ? null : nivelRaw;
  const salary = r.SalarioAtual ? parseFloat(String(r.SalarioAtual).replace(",", ".")) : 0;

  positions.push({ name, setor, level, salary });
}

console.log(`Unique positions to import: ${positions.length}`);

const sqlEscape = (s) => s.replace(/'/g, "''");

const lines = [];
lines.push(`-- Importação avulsa de cargos do sistema antigo (Plano de Cargos.xlsx)`);
lines.push(`-- Gerado em: ${new Date().toISOString()}`);
lines.push(`-- Total: ${positions.length} cargos`);
lines.push(``);
lines.push(`BEGIN;`);
lines.push(``);
lines.push(`-- Garante que as colunas team_id e level existem (idempotente).`);
lines.push(`-- Equivalente à migration 20260504150000_add_team_level_to_positions.sql.`);
lines.push(`ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;`);
lines.push(`ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS level smallint;`);
lines.push(`DO $check$`);
lines.push(`BEGIN`);
lines.push(`  IF NOT EXISTS (`);
lines.push(`    SELECT 1 FROM pg_constraint`);
lines.push(`    WHERE conname = 'positions_level_check' AND conrelid = 'public.positions'::regclass`);
lines.push(`  ) THEN`);
lines.push(`    ALTER TABLE public.positions ADD CONSTRAINT positions_level_check CHECK (level IS NULL OR (level >= 1 AND level <= 12));`);
lines.push(`  END IF;`);
lines.push(`END $check$;`);
lines.push(`CREATE INDEX IF NOT EXISTS idx_positions_team_id ON public.positions(team_id);`);
lines.push(``);
lines.push(`DO $$`);
lines.push(`DECLARE`);
lines.push(`  v_company_id uuid;`);
lines.push(`  v_team_id uuid;`);
lines.push(`BEGIN`);
lines.push(`  SELECT id INTO v_company_id FROM public.companies ORDER BY created_at LIMIT 1;`);
lines.push(`  IF v_company_id IS NULL THEN`);
lines.push(`    RAISE EXCEPTION 'Nenhuma company encontrada. Crie ao menos uma antes de rodar a importação.';`);
lines.push(`  END IF;`);
lines.push(``);

for (const p of positions) {
  if (p.setor) {
    lines.push(
      `  SELECT id INTO v_team_id FROM public.teams WHERE company_id = v_company_id AND LOWER(name) = LOWER('${sqlEscape(p.setor)}') LIMIT 1;`,
    );
  } else {
    lines.push(`  v_team_id := NULL;`);
  }
  const levelSql = p.level === null ? "NULL" : String(p.level);
  lines.push(
    `  INSERT INTO public.positions (company_id, name, salary, level, team_id, inss_percent, fgts_percent, irpf_percent) VALUES (v_company_id, '${sqlEscape(p.name)}', ${p.salary}, ${levelSql}, v_team_id, 0, 0, 0);`,
  );
}

lines.push(`END $$;`);
lines.push(``);
lines.push(`COMMIT;`);
lines.push(``);
lines.push(`-- ROLLBACK (se precisar desfazer logo após):`);
lines.push(`-- BEGIN;`);
lines.push(`-- DELETE FROM public.positions WHERE created_at >= now() - interval '5 minutes';`);
lines.push(`-- COMMIT;`);

fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
console.log(`SQL written to: ${outputFile}`);

// Summary by setor
const bySetor = {};
for (const p of positions) {
  const s = p.setor || "(sem setor)";
  bySetor[s] = (bySetor[s] || 0) + 1;
}
console.log(`\nDistribuição por setor:`);
for (const [s, c] of Object.entries(bySetor).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(30)} ${c}`);
}
