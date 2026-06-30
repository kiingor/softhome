// Orquestra a Validação da Folha: extrai os PDFs, casa com a folha interna,
// calcula as divergências (motor de diff) e persiste a sessão via RPC.
// Também expõe as queries de leitura (sessões, itens, log).
import { supabase } from "@/integrations/supabase/client";
import { periodToMonthYear } from "../../types";
import { extractLinesFromFile } from "./pdf-extract";
import { parseRelacaoCalculo, type ParsedCollaborator } from "./relacao-calculo-parser";
import {
  diffFolha,
  type SystemCollaborator,
  type DiffItem,
} from "./payroll-validation-diff";

// As tabelas/RPCs novas ainda não estão nos tipos gerados do Supabase; cast
// pontual até rodar `gen types` depois de aplicar a migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface PayrollValidation {
  id: string;
  company_id: string;
  reference_month: string;
  status: "in_progress" | "completed";
  pdf_file_names: string[];
  collaborators_total: number;
  collaborators_matched: number;
  items_total: number;
  items_resolved: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollValidationItem {
  id: string;
  validation_id: string;
  collaborator_id: string | null;
  collaborator_name: string;
  check_group: string;
  check_label: string;
  expected_value: number | null;
  actual_value: number | null;
  diff: number | null;
  direction: "a_mais" | "a_menos" | null;
  severity: "divergence" | "missing_system" | "missing_pdf" | "info";
  status: "pending" | "corrected" | "ignored";
  notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface PayrollValidationLog {
  id: string;
  action: string;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  item_id: string | null;
}

// ── Extração + parsing dos PDFs ───────────────────────────────────────────────
export async function parseFolhaFiles(
  files: File[],
): Promise<{ collaborators: ParsedCollaborator[]; warnings: string[] }> {
  const collaborators: ParsedCollaborator[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    const lines = await extractLinesFromFile(file);
    const parsed = parseRelacaoCalculo(lines);
    if (parsed.collaborators.length === 0) {
      warnings.push(`"${file.name}" — nenhum colaborador reconhecido (PDF é uma Relação de Cálculo?)`);
    }
    collaborators.push(...parsed.collaborators);
    warnings.push(...parsed.warnings.map((w) => `${file.name}: ${w}`));
  }
  return { collaborators, warnings };
}

// ── Carrega a folha interna do período ────────────────────────────────────────
export async function loadSystemFolha(
  companyId: string,
  referenceMonth: string,
): Promise<SystemCollaborator[]> {
  const { month, year } = periodToMonthYear(referenceMonth);

  const [{ data: collabs, error: cErr }, { data: entries, error: eErr }, { data: deps, error: dErr }] =
    await Promise.all([
      supabase
        .from("collaborators")
        .select("id, name, admission_date, regime")
        .eq("company_id", companyId),
      supabase
        .from("payroll_entries")
        .select("collaborator_id, type, value, external_id")
        .eq("company_id", companyId)
        .eq("month", month)
        .eq("year", year),
      supabase
        .from("collaborator_dependents")
        .select("collaborator_id")
        .eq("is_irpf_dependent", true),
    ]);
  if (cErr) throw cErr;
  if (eErr) throw eErr;
  if (dErr) throw dErr;

  const depCount = new Map<string, number>();
  for (const d of deps ?? []) {
    const cid = (d as { collaborator_id: string }).collaborator_id;
    depCount.set(cid, (depCount.get(cid) ?? 0) + 1);
  }

  const entriesByCollab = new Map<string, SystemCollaborator["entries"]>();
  for (const e of entries ?? []) {
    const row = e as { collaborator_id: string; type: string; value: number; external_id: string | null };
    if (!entriesByCollab.has(row.collaborator_id)) entriesByCollab.set(row.collaborator_id, []);
    entriesByCollab.get(row.collaborator_id)!.push({
      type: row.type,
      value: Number(row.value),
      external_id: row.external_id,
    });
  }

  return (collabs ?? []).map((c) => {
    const row = c as { id: string; name: string; admission_date: string | null; regime: string | null };
    return {
      id: row.id,
      name: row.name,
      admissionDate: row.admission_date,
      regime: row.regime,
      entries: entriesByCollab.get(row.id) ?? [],
      irpfDependents: depCount.get(row.id) ?? 0,
    };
  });
}

// ── Executa a validação (parse + diff + persiste) ─────────────────────────────
export interface RunValidationResult {
  validationId: string;
  itemsCount: number;
  stats: { collaborators_total: number; collaborators_matched: number };
  warnings: string[];
}

export async function runValidation(params: {
  companyId: string;
  referenceMonth: string;
  files: File[];
}): Promise<RunValidationResult> {
  const { companyId, referenceMonth, files } = params;

  const [{ collaborators, warnings }, system] = await Promise.all([
    parseFolhaFiles(files),
    loadSystemFolha(companyId, referenceMonth),
  ]);

  if (collaborators.length === 0) {
    throw new Error(
      "Nenhum colaborador foi reconhecido nos PDFs. Confira se são as 'Relações de Cálculo' enviadas pela contabilidade.",
    );
  }

  const { items, stats } = diffFolha(collaborators, system);

  const payload: Record<string, unknown>[] = items.map((it: DiffItem) => ({
    collaborator_id: it.collaborator_id,
    collaborator_name: it.collaborator_name,
    check_group: it.check_group,
    check_label: it.check_label,
    expected_value: it.expected_value,
    actual_value: it.actual_value,
    diff: it.diff,
    direction: it.direction,
    severity: it.severity,
  }));

  const { data, error } = await db.rpc("create_payroll_validation", {
    p_company_id: companyId,
    p_reference_month: referenceMonth,
    p_pdf_names: files.map((f) => f.name),
    p_stats: stats,
    p_items: payload,
  });
  if (error) throw error;

  return {
    validationId: data as string,
    itemsCount: items.length,
    stats,
    warnings,
  };
}

// ── Queries de leitura ────────────────────────────────────────────────────────
export async function listValidations(
  companyId: string,
  referenceMonth: string,
): Promise<PayrollValidation[]> {
  const { data, error } = await db
    .from("payroll_validations")
    .select("*")
    .eq("company_id", companyId)
    .eq("reference_month", referenceMonth)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PayrollValidation[];
}

export async function getValidationItems(validationId: string): Promise<PayrollValidationItem[]> {
  const { data, error } = await db
    .from("payroll_validation_items")
    .select("*")
    .eq("validation_id", validationId)
    .order("collaborator_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PayrollValidationItem[];
}

export async function getValidationLogs(validationId: string): Promise<PayrollValidationLog[]> {
  const { data, error } = await db
    .from("payroll_validation_logs")
    .select("id, action, notes, user_id, created_at, item_id")
    .eq("validation_id", validationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PayrollValidationLog[];
}

export async function resolveItem(itemId: string, status: string, notes: string): Promise<void> {
  const { error } = await db.rpc("resolve_payroll_validation_item", {
    p_item_id: itemId,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw error;
}

export async function resolveItemsBulk(itemIds: string[], status: string, notes: string): Promise<number> {
  const { data, error } = await db.rpc("resolve_payroll_validation_items_bulk", {
    p_item_ids: itemIds,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
