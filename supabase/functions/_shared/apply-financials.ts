// Helper: aplica financeiros do colaborador (salário base + adicionais)
// vindos da api.softcom.cloud, idempotente.
//
// Regra:
//   - tipo === 'CUSTO SETOR' OU 'GRATIFICAÇÃO ESPONTANEA'
//       → payroll_entries (type='bonificacao', is_fixed=true)
//   - outros tipos (INSPIRA, INDICADOR, ...)
//       → benefits (catálogo, 1 por nome único na company) + benefits_assignments
//         com custom_value. Duplicatas no mesmo lote são agregadas (soma valores).
//   - salarioAtual (do colaborador) → payroll_entries (type='salario_base',
//     is_fixed=true) com external_id="salario-base" pra idempotência
//
// Idempotência:
//   - payroll_entries: unique (collaborator_id, external_id)
//   - benefits: dedup por (company_id, name) via lookup
//   - benefits_assignments: unique (benefit_id, collaborator_id)
//
// Uso típico (em Edge Function de sync ou create de colaborador):
//   import { applyFinancials } from "../_shared/apply-financials.ts";
//   const result = await applyFinancials(sbAdmin, {
//     companyId, collaboratorId, currentSalary, adicionais
//   });

import type { RemoteAdicional } from "./softcom-cloud-types.ts";
import { calcAllTaxes } from "./clt-calc.ts";

export interface ApplyFinancialsInput {
  companyId: string;
  collaboratorId: string;
  storeId?: string | null;
  /** Salário do colaborador (do `salarioAtual` da API ou `current_salary` local). */
  currentSalary?: number | null;
  /** Lista de adicionais retornada por GET /v1/colaboradores/{id}/adicionais. */
  adicionais: RemoteAdicional[];
}

export interface ApplyFinancialsResult {
  salaryEntry: { created: boolean; updated: boolean };
  taxEntries: {
    inss: { created: boolean; updated: boolean; skipped: boolean };
    irpf: { created: boolean; updated: boolean; skipped: boolean };
    fgts: { created: boolean; updated: boolean; skipped: boolean };
  };
  payrollEntries: { upserted: number };
  benefitsAssignments: { upserted: number; benefitsCreated: number };
  errors: Array<{ external_id: string; tipo: string; error: string }>;
}

// Tipos da agenda que viram lançamento de folha (não vão pra catálogo de benefits).
// Mapa: tipo remoto → type enum local em payroll_entries.
//   - CUSTO SETOR           → bonificacao  (compõe bruto, mas não junta com salário)
//   - GRATIFICAÇÃO ESPONTANEA → gratificacao (agrupa com salário base no Pagamentos
//                                e entra na base de IRPF/descontos do colab)
const PAYROLL_TYPE_MAP: Record<string, "bonificacao" | "gratificacao"> = {
  "CUSTO SETOR": "bonificacao",
  "GRATIFICAÇÃO ESPONTANEA": "gratificacao",
};

// Encargos só pra CLT — PJ/estagiário não geram INSS/IRPF/FGTS na folha.
// (calcAllTaxes vem de _shared/clt-calc.ts, espelho de src/lib/payroll/cltCalc.ts)

/**
 * Mapeia nome do benefit (`inspiraTipo` ou tipo livre) para a categoria do enum.
 * Heurística por keyword. Default 'other'.
 */
function inferBenefitCategory(name: string): string {
  const n = (name ?? "").toUpperCase();
  if (/(ALIMENT|REFEI|TICKET|VR|VA)/.test(n)) return "meal";
  if (/(TRANSPORT|MOBILID|COMBUST|UBER|ONIBUS|VT)/.test(n)) return "transport";
  if (/(SAUDE|MEDIC|ODONT|HOSPITAL|PLANO)/.test(n)) return "health";
  if (/(CRECHE|DAYCARE)/.test(n)) return "daycare";
  if (/(BONUS|PLR|PREMIO)/.test(n)) return "bonus";
  return "other";
}

function nowMonthYear(): { month: number; year: number } {
  const d = new Date();
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

// deno-lint-ignore no-explicit-any
type Sb = any;

export async function applyFinancials(
  sbAdmin: Sb,
  input: ApplyFinancialsInput,
): Promise<ApplyFinancialsResult> {
  const result: ApplyFinancialsResult = {
    salaryEntry: { created: false, updated: false },
    taxEntries: {
      inss: { created: false, updated: false, skipped: false },
      irpf: { created: false, updated: false, skipped: false },
      fgts: { created: false, updated: false, skipped: false },
    },
    payrollEntries: { upserted: 0 },
    benefitsAssignments: { upserted: 0, benefitsCreated: 0 },
    errors: [],
  };

  const { companyId, collaboratorId, storeId, currentSalary, adicionais } = input;
  const { month, year } = nowMonthYear();

  // Regime + dependentes do colab — definem geração de encargos.
  let regime: "clt" | "pj" | "estagiario" | null = null;
  let dependents = 0;
  {
    const { data: c } = await sbAdmin
      .from("collaborators")
      .select("regime, dependents_count")
      .eq("id", collaboratorId)
      .maybeSingle();
    const row = c as
      | { regime: typeof regime; dependents_count: number | null }
      | null;
    regime = row?.regime ?? null;
    dependents = row?.dependents_count ?? 0;
  }

  // Constantes pra reuso (limpeza e (re)criação de encargos).
  const TAX_EXTERNAL_IDS_ALL = ["inss-base", "irpf-base", "fgts-base"] as const;
  const hasValidSalary = typeof currentSalary === "number" && currentSalary > 0;

  // ────────────────────────────────────────────────────────────────────────
  // 1. Salário base — payroll_entry type='salario' fixo, idempotente por
  //    external_id='salario-base' (1 por colaborador)
  //
  //    Sem salário (null/0 na agenda): APAGA a entry antiga + encargos
  //    antigos pra evitar inconsistência (UI mostraria FGTS/IRPF sem
  //    salário base — happened em colabs cujo salarioAtual foi removido
  //    na agenda depois de uma sync que tinha salário).
  // ────────────────────────────────────────────────────────────────────────
  if (hasValidSalary) {
    const salaryRow = {
      company_id: companyId,
      collaborator_id: collaboratorId,
      store_id: storeId ?? null,
      external_id: "salario-base",
      type: "salario_base",
      description: "Salário Base",
      value: currentSalary,
      month,
      year,
      is_fixed: true,
    };
    const { data: existed } = await sbAdmin
      .from("payroll_entries")
      .select("id")
      .eq("collaborator_id", collaboratorId)
      .eq("external_id", "salario-base")
      .maybeSingle();
    const { error: salErr } = await sbAdmin
      .from("payroll_entries")
      .upsert(salaryRow, { onConflict: "collaborator_id,external_id", ignoreDuplicates: false });
    if (salErr) {
      result.errors.push({ external_id: "salario-base", tipo: "SALARIO", error: salErr.message });
    } else {
      if (existed) result.salaryEntry.updated = true;
      else result.salaryEntry.created = true;
    }
  } else {
    // Sem salário válido → apaga salário-base + INSS/IRPF/FGTS órfãos.
    await sbAdmin
      .from("payroll_entries")
      .delete()
      .eq("collaborator_id", collaboratorId)
      .in("external_id", ["salario-base", ...TAX_EXTERNAL_IDS_ALL]);
    result.taxEntries.inss.skipped = true;
    result.taxEntries.irpf.skipped = true;
    result.taxEntries.fgts.skipped = true;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 1b. Encargos CLT — INSS / IRPF / FGTS via tabela 2026.
  //     Idempotente por external_id 'inss-base' | 'irpf-base' | 'fgts-base'.
  //     PJ/estagiário pula e limpa entries antigas (caso tenha mudado de regime).
  // ────────────────────────────────────────────────────────────────────────
  if (hasValidSalary) {
    type TaxKind = "inss" | "irpf" | "fgts";
    const TAX_EXTERNAL_IDS: Record<TaxKind, string> = {
      inss: "inss-base",
      irpf: "irpf-base",
      fgts: "fgts-base",
    };

    if (regime !== "clt") {
      // Limpeza defensiva: se mudou de regime, apaga encargos órfãos.
      result.taxEntries.inss.skipped = true;
      result.taxEntries.irpf.skipped = true;
      result.taxEntries.fgts.skipped = true;
      await sbAdmin
        .from("payroll_entries")
        .delete()
        .eq("collaborator_id", collaboratorId)
        .in("external_id", Object.values(TAX_EXTERNAL_IDS));
    } else {
      const taxes = calcAllTaxes({ grossSalary: currentSalary, dependents });
      const irpfLabel = dependents > 0
        ? `IRPF (tabela 2026, ${dependents} dep.)`
        : "IRPF (tabela 2026)";

      const taxRows: Array<{
        kind: TaxKind;
        type: TaxKind;
        external_id: string;
        description: string;
        value: number;
      }> = [
        { kind: "inss", type: "inss", external_id: TAX_EXTERNAL_IDS.inss, description: "INSS (tabela 2026)", value: taxes.inss },
        { kind: "irpf", type: "irpf", external_id: TAX_EXTERNAL_IDS.irpf, description: irpfLabel, value: taxes.irpf },
        { kind: "fgts", type: "fgts", external_id: TAX_EXTERNAL_IDS.fgts, description: "FGTS (8%)", value: taxes.fgts },
      ];

      for (const t of taxRows) {
        if (!(t.value > 0)) {
          // Imposto zerado (ex: salário isento de IRPF) — apaga entry anterior se houver.
          await sbAdmin
            .from("payroll_entries")
            .delete()
            .eq("collaborator_id", collaboratorId)
            .eq("external_id", t.external_id);
          result.taxEntries[t.kind].skipped = true;
          continue;
        }
        const row = {
          company_id: companyId,
          collaborator_id: collaboratorId,
          store_id: storeId ?? null,
          external_id: t.external_id,
          type: t.type,
          description: t.description,
          value: t.value,
          month,
          year,
          is_fixed: true,
        };
        const { data: existed } = await sbAdmin
          .from("payroll_entries")
          .select("id")
          .eq("collaborator_id", collaboratorId)
          .eq("external_id", t.external_id)
          .maybeSingle();
        const { error: upErr } = await sbAdmin
          .from("payroll_entries")
          .upsert(row, { onConflict: "collaborator_id,external_id", ignoreDuplicates: false });
        if (upErr) {
          result.errors.push({ external_id: t.external_id, tipo: t.type.toUpperCase(), error: upErr.message });
        } else if (existed) {
          result.taxEntries[t.kind].updated = true;
        } else {
          result.taxEntries[t.kind].created = true;
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 2. Particiona adicionais
  // ────────────────────────────────────────────────────────────────────────
  const payrollAdicionais: RemoteAdicional[] = [];
  const benefitAdicionais: RemoteAdicional[] = [];

  for (const a of adicionais) {
    if (a.desativado === true) continue; // pula desativados
    const tipo = (a.tipo ?? "").trim();
    if (tipo in PAYROLL_TYPE_MAP) payrollAdicionais.push(a);
    else benefitAdicionais.push(a);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 3. Lançamentos de folha (CUSTO SETOR → bonificacao / GRATIFICAÇÃO → gratificacao)
  //    is_fixed=true, external_id=remoto id pra idempotência.
  // ────────────────────────────────────────────────────────────────────────
  const payrollRows = payrollAdicionais
    .map((a) => {
      const value = typeof a.valores === "number" ? a.valores : 0;
      if (value <= 0) return null; // payroll_entries.value tem CHECK (value > 0)
      const tipo = (a.tipo ?? "").trim();
      const desc = a.descricao ? `${tipo} — ${a.descricao}` : tipo;
      return {
        company_id: companyId,
        collaborator_id: collaboratorId,
        store_id: storeId ?? null,
        external_id: String(a.id),
        type: PAYROLL_TYPE_MAP[tipo],
        description: desc,
        value,
        month,
        year,
        is_fixed: true,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (payrollRows.length > 0) {
    const { data: upData, error: upErr } = await sbAdmin
      .from("payroll_entries")
      .upsert(payrollRows, { onConflict: "collaborator_id,external_id", ignoreDuplicates: false })
      .select("id");
    if (upErr) {
      // tenta linha-a-linha pra reportar quais falharam
      for (const row of payrollRows) {
        const { error: oneErr } = await sbAdmin
          .from("payroll_entries")
          .upsert(row, { onConflict: "collaborator_id,external_id", ignoreDuplicates: false });
        if (oneErr) {
          result.errors.push({
            external_id: row.external_id,
            tipo: row.description,
            error: oneErr.message,
          });
        } else {
          result.payrollEntries.upserted++;
        }
      }
    } else {
      result.payrollEntries.upserted = upData?.length ?? payrollRows.length;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 4. Benefícios — garante 1 benefit no catálogo por nome único, depois
  //    upsert do assignment com custom_value
  // ────────────────────────────────────────────────────────────────────────
  // Nomes únicos pra dedup
  const benefitsMeta = benefitAdicionais.map((a) => {
    const tipo = (a.tipo ?? "").trim();
    const subtipo = (a.inspiraTipo ?? "").trim();
    // Pra INSPIRA usa o inspiraTipo (TICKET ALIMENTACAO, ...). Pra outros, o tipo.
    const name = (subtipo || tipo || "BENEFÍCIO").toUpperCase();
    const value = typeof a.valores === "number" ? a.valores : 0;
    return { adicional: a, name, value };
  });

  const uniqueBenefitNames = Array.from(new Set(benefitsMeta.map((b) => b.name)));

  // Carrega benefits já existentes na company
  const benefitIdByName = new Map<string, string>();
  if (uniqueBenefitNames.length > 0) {
    const { data: existingBenefits } = await sbAdmin
      .from("benefits")
      .select("id, name")
      .eq("company_id", companyId)
      .in("name", uniqueBenefitNames);
    for (const b of existingBenefits ?? []) {
      benefitIdByName.set((b as { name: string }).name, (b as { id: string }).id);
    }
  }

  // Cria os que faltam
  const missing = uniqueBenefitNames.filter((n) => !benefitIdByName.has(n));
  if (missing.length > 0) {
    const rowsToCreate = missing.map((name) => ({
      company_id: companyId,
      name,
      description: "Sincronizado da agenda (api.softcom.cloud)",
      category: inferBenefitCategory(name),
    }));
    const { data: created, error: createErr } = await sbAdmin
      .from("benefits")
      .insert(rowsToCreate)
      .select("id, name");
    if (createErr) {
      result.errors.push({ external_id: "benefits-create", tipo: "BENEFIT_CATALOG", error: createErr.message });
    } else {
      for (const b of created ?? []) {
        benefitIdByName.set((b as { name: string }).name, (b as { id: string }).id);
      }
      result.benefitsAssignments.benefitsCreated = created?.length ?? 0;
    }
  }

  // Agrega múltiplos adicionais que viraram mesmo benefit (mesmo nome no
  // catálogo) — somando valores. Evita o erro "ON CONFLICT command cannot
  // affect row a second time" quando o mesmo (benefit_id, collaborator_id)
  // aparece 2+ vezes no lote.
  const aggregatedByBenefit = new Map<string, { value: number; refs: string[] }>();
  for (const b of benefitsMeta) {
    const benefitId = benefitIdByName.get(b.name);
    if (!benefitId) continue;
    const cur = aggregatedByBenefit.get(benefitId);
    const refLabel = `agenda#${b.adicional.id}${b.adicional.tipo ? " " + b.adicional.tipo : ""}`;
    if (cur) {
      cur.value += b.value > 0 ? b.value : 0;
      cur.refs.push(refLabel);
    } else {
      aggregatedByBenefit.set(benefitId, {
        value: b.value > 0 ? b.value : 0,
        refs: [refLabel],
      });
    }
  }

  const assignmentRows = Array.from(aggregatedByBenefit.entries()).map(
    ([benefitId, agg]) => ({
      benefit_id: benefitId,
      collaborator_id: collaboratorId,
      custom_value: agg.value > 0 ? agg.value : null,
      observation: `[${agg.refs.join(" | ")}]`,
    }),
  );

  if (assignmentRows.length > 0) {
    // upsert por (benefit_id, collaborator_id)
    const { data: upData, error: upErr } = await sbAdmin
      .from("benefits_assignments")
      .upsert(assignmentRows, { onConflict: "benefit_id,collaborator_id", ignoreDuplicates: false })
      .select("id");
    if (upErr) {
      result.errors.push({
        external_id: "benefits-assign",
        tipo: "BENEFIT_ASSIGNMENT",
        error: upErr.message,
      });
    } else {
      result.benefitsAssignments.upserted = upData?.length ?? assignmentRows.length;
    }
  }

  return result;
}
