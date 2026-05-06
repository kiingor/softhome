import { validateCPF, cleanCPF, BRAZIL_STATES } from "@/lib/validators";
import type { ImportRow } from "./collaborator-import-parser";

export type Severity = "ok" | "warning" | "error";

export type ValidationResult = {
  severity: Severity;
  issues: string[];
};

export type ValidationContext = {
  existingCpfs: Set<string>; // CPFs (digits only) já no banco
  batchCpfs: Map<string, number>; // CPF (digits) → row index (primeiro a aparecer)
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATES = new Set(BRAZIL_STATES);

/**
 * Confere se a string YYYY-MM-DD representa uma data real (sem rollover).
 */
const isValidIsoDate = (s: string): boolean => {
  if (!DATE_REGEX.test(s)) return false;
  const [y, mo, d] = s.split("-").map((n) => parseInt(n, 10));
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
};

export function validateRow(
  row: ImportRow,
  rowIndex: number,
  ctx: ValidationContext,
): ValidationResult {
  const issues: string[] = [];
  let hasError = false;
  let hasWarning = false;

  // --- ERROS ---
  if (!row.name.trim()) {
    issues.push("Nome obrigatório");
    hasError = true;
  }

  const cpfDigits = cleanCPF(row.cpf);
  if (!cpfDigits) {
    issues.push("CPF obrigatório");
    hasError = true;
  } else if (!validateCPF(cpfDigits)) {
    issues.push("CPF inválido");
    hasError = true;
  } else {
    if (ctx.existingCpfs.has(cpfDigits)) {
      issues.push("CPF já cadastrado no sistema");
      hasError = true;
    }
    const firstIndex = ctx.batchCpfs.get(cpfDigits);
    if (firstIndex !== undefined && firstIndex !== rowIndex) {
      issues.push(`CPF duplicado (também na linha ${firstIndex + 1})`);
      hasError = true;
    }
  }

  // --- WARNINGS ---
  if (row.email && !EMAIL_REGEX.test(row.email)) {
    issues.push("Email com formato inválido — login não será criado");
    hasWarning = true;
  }

  if (row.state && !VALID_STATES.has(row.state.toUpperCase() as (typeof BRAZIL_STATES)[number])) {
    issues.push(`UF "${row.state}" não reconhecida`);
    hasWarning = true;
  }

  if (row.raw_position_name && !row.position_id) {
    issues.push(`Cargo "${row.raw_position_name}" não encontrado — sem lançamentos financeiros`);
    hasWarning = true;
  }

  if (row.raw_team_name && !row.team_id) {
    issues.push(`Setor "${row.raw_team_name}" não encontrado`);
    hasWarning = true;
  }

  if (row.raw_store_name && !row.store_id) {
    issues.push(`Loja onde trabalha "${row.raw_store_name}" não encontrada`);
    hasWarning = true;
  }

  if (row.raw_contracted_store_name && !row.contracted_store_id) {
    issues.push(`Loja contratante "${row.raw_contracted_store_name}" não encontrada`);
    hasWarning = true;
  }

  if (row.birth_date && !isValidIsoDate(row.birth_date)) {
    issues.push(
      `Data de nascimento inválida: "${row.birth_date}" — use AAAA-MM-DD ou DD/MM/AAAA`,
    );
    hasError = true;
  }

  if (row.admission_date && !isValidIsoDate(row.admission_date)) {
    issues.push(
      `Data de admissão inválida: "${row.admission_date}" — use AAAA-MM-DD ou DD/MM/AAAA`,
    );
    hasError = true;
  }

  let severity: Severity = "ok";
  if (hasError) severity = "error";
  else if (hasWarning) severity = "warning";

  return { severity, issues };
}

/**
 * Constrói o map de CPFs do batch — primeiro índice em que cada CPF aparece.
 * Usado pra detectar duplicados dentro do próprio arquivo.
 */
export function buildBatchCpfMap(rows: ImportRow[]): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((r, i) => {
    const c = cleanCPF(r.cpf);
    if (c && !map.has(c)) map.set(c, i);
  });
  return map;
}
