// Tipos do módulo Folha (controle, NÃO cálculo CLT).
//
// CLAUDE.md princípio 2: o DNA Softcom não calcula folha.
// Apenas controla lançamentos e exporta organizado pro contador.

import type { Database } from "@/integrations/supabase/types";

export type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];
export type PayrollPeriodInsert =
  Database["public"]["Tables"]["payroll_periods"]["Insert"];

export type PayrollEntry = Database["public"]["Tables"]["payroll_entries"]["Row"];
export type PayrollEntryInsert =
  Database["public"]["Tables"]["payroll_entries"]["Insert"];

export type PayrollAlert = Database["public"]["Tables"]["payroll_alerts"]["Row"];
export type PayrollAlertInsert =
  Database["public"]["Tables"]["payroll_alerts"]["Insert"];

export type PayrollPeriodStatus =
  Database["public"]["Enums"]["payroll_period_status"];
export type PayrollEntryType = Database["public"]["Enums"]["payroll_entry_type"];
export type PayrollAlertKind = Database["public"]["Enums"]["payroll_alert_kind"];
export type PayrollAlertSeverity =
  Database["public"]["Enums"]["payroll_alert_severity"];

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de lançamento ATIVOS no DNA Softcom (decisão Q1 da Fase 4)
// Os outros valores do enum são órfãos legacy meurh; não usar pra novos
// lançamentos. UI mostra só estes.
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIVE_ENTRY_TYPES = [
  "salario_base",
  "hora_extra",
  "falta",
  "atestado",
  "beneficio",
  "adiantamento",
  "bonificacao",
  "gratificacao",
  "carro_agregado",
  "periculosidade",
  "auxilio_vale_transporte",
  "desconto",
  "emprestimo",
] as const;

export type ActiveEntryType = (typeof ACTIVE_ENTRY_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Lançamentos avulsos (manuais) na folha — UI de criação no NewEntryDialog.
// Filtra os tipos por natureza (crédito/débito) e exclui os que vêm de
// outros fluxos (salário base e benefício vêm do auto-populate da sync;
// ferias vem do fluxo próprio; INSS/IRPF/FGTS são calculados; legacy
// custo/despesa não usar pra novos).
// ─────────────────────────────────────────────────────────────────────────────

/** Lançamentos manuais a CRÉDITO (provento, soma no líquido). */
export const MANUAL_CREDIT_TYPES = [
  "hora_extra",
  "bonificacao",
  "gratificacao",
  "carro_agregado",
  "periculosidade",
  "atestado",
  "auxilio_vale_transporte",
] as const;

/** Lançamentos manuais a DÉBITO (desconto, sai do líquido). */
export const MANUAL_DEBIT_TYPES = [
  "falta",
  "adiantamento",
  "desconto",
  "emprestimo",
] as const;

export type ManualEntryNature = "credit" | "debit";

/** Natureza de um tipo de lançamento (pra o toggle Crédito/Débito). */
export function entryTypeNature(type: ActiveEntryType): ManualEntryNature | null {
  if ((MANUAL_CREDIT_TYPES as readonly string[]).includes(type)) return "credit";
  if ((MANUAL_DEBIT_TYPES as readonly string[]).includes(type)) return "debit";
  return null; // salario_base, beneficio — não são lançamentos manuais
}

// Cores sutis por tipo pro tag/badge na folha. A ideia é só diferenciar
// visualmente, sem competir com os valores numéricos.
export const ENTRY_TYPE_COLORS: Record<string, string> = {
  salario_base:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60",
  hora_extra:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
  beneficio:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
  bonificacao:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/60",
  gratificacao:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60",
  carro_agregado:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/60",
  periculosidade:
    "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-900/60",
  auxilio_vale_transporte:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
  atestado:
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700",
  adiantamento:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60",
  falta:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60",
  desconto:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60",
  emprestimo:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60",
  ferias:
    "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/60",
  salario_familia:
    "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900/60",
  inss: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
  irpf: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
  fgts: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
};

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  salario_base: "Salário base",
  hora_extra: "Hora extra",
  falta: "Falta",
  atestado: "Atestado",
  beneficio: "Benefício",
  adiantamento: "Adiantamento",
  bonificacao: "Bonificação",
  gratificacao: "Gratificação",
  carro_agregado: "Carro Agregado",
  periculosidade: "Periculosidade",
  auxilio_vale_transporte: "Auxílio Vale Transporte",
  desconto: "Desconto",
  emprestimo: "Empréstimo",
  ferias: "Férias",
  salario_familia: "Salário-Família",
  // Legacy (orphans)
  custo: "Custo (legacy)",
  despesa: "Despesa (legacy)",
  inss: "INSS",
  fgts: "FGTS",
  irpf: "IRPF",
};

// Categoria pra UI (proventos vs descontos)
export const EARNINGS_TYPES = [
  "salario_base",
  "hora_extra",
  "beneficio",
  "bonificacao",
  "gratificacao",
  "carro_agregado",
  "periculosidade",
  "atestado",
  "auxilio_vale_transporte",
  "ferias",
  "salario_familia",
] as const;

export const DEDUCTION_TYPES = [
  "falta",
  "adiantamento",
  "desconto",
  "emprestimo",
  "inss",
  "irpf",
  "custo",
  "despesa",
] as const;

// Encargos do empregador: aparecem na folha como informação (custo da empresa),
// mas NÃO são descontados do líquido do colaborador. FGTS é 8% sobre o bruto e
// é depositado pela empresa — nunca sai do salário de quem recebe.
export const EMPLOYER_COST_TYPES = ["fgts"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// IRPF — base de cálculo
//
// O IRPF incide sobre TODOS os rendimentos tributáveis do mês (salário base +
// estes proventos), menos INSS e dedução por dependente.
//
// INSS/FGTS: incidem sobre o salário base + os proventos HABITUAIS que integram
// a remuneração (hora extra e periculosidade — ver INSS_TAXABLE_EARNING_TYPES).
// gratificação (espontânea = liberalidade), carro agregado e atestado entram SÓ
// no IRPF, não no INSS/FGTS — confere com a folha da contabilidade. Falta REDUZ
// as três bases.
//
// Ferias têm IRRF próprio no recibo (external_id 'ferias-%') e são excluídas.
// Isentos de tudo: salário-família, benefícios, bonificação (custo de setor).
// ─────────────────────────────────────────────────────────────────────────────
export const IRPF_TAXABLE_EARNING_TYPES = [
  "gratificacao",
  "hora_extra",
  "carro_agregado",
  "periculosidade",
  "atestado",
] as const;

// Proventos HABITUAIS que integram a base do INSS e do FGTS (além do salário
// base). SUBCONJUNTO de IRPF_TAXABLE_EARNING_TYPES — os demais (gratificação
// espontânea, carro agregado, atestado) são tributáveis no IRPF mas NÃO
// integram INSS/FGTS. Bate com a folha da contabilidade (gratificação
// espontânea = liberalidade, isenta de INSS/FGTS pela CLT).
export const INSS_TAXABLE_EARNING_TYPES = [
  "hora_extra",
  "periculosidade",
] as const;

// Único débito que REDUZ a base de INSS/FGTS/IRPF (falta = menos salário de
// contribuição). adiantamento, desconto e emprestimo NÃO mexem na base — só no
// líquido.
export const FALTA_BASE_DEBIT_TYPES = ["falta"] as const;

export function isEarning(type: string): boolean {
  return (EARNINGS_TYPES as readonly string[]).includes(type);
}

export function isDeduction(type: string): boolean {
  return (DEDUCTION_TYPES as readonly string[]).includes(type);
}

export function isEmployerCost(type: string): boolean {
  return (EMPLOYER_COST_TYPES as readonly string[]).includes(type);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status de período
// ─────────────────────────────────────────────────────────────────────────────

export const PERIOD_STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
  open: "Aberto",
  closed: "Fechado",
  exported: "Exportado",
};

export const PERIOD_STATUS_COLORS: Record<PayrollPeriodStatus, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  exported:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

// ─────────────────────────────────────────────────────────────────────────────
// Alertas
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_KIND_LABELS: Record<PayrollAlertKind, string> = {
  collaborator_no_entry: "Colaborador sem lançamento",
  value_divergence: "Valor fora do esperado",
  absence_no_attestation: "Falta sem atestado",
  admission_pending: "Admissão pendente",
  termination_pending: "Desligamento pendente",
  other: "Outro",
};

export const ALERT_SEVERITY_COLORS: Record<PayrollAlertSeverity, string> = {
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  critical:
    "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export const ALERT_SEVERITY_LABELS: Record<PayrollAlertSeverity, string> = {
  info: "Aviso",
  warning: "Atenção",
  critical: "Crítico",
};

// ─────────────────────────────────────────────────────────────────────────────
// Joined types
// ─────────────────────────────────────────────────────────────────────────────

export interface PayrollEntryWithCollaborator extends PayrollEntry {
  collaborator?: {
    id: string;
    name: string;
    cpf: string;
    regime: string | null;
    status: string;
    pix_key?: string | null;
    softcom_surname?: string | null;
    store_id?: string | null;
    team_id?: string | null;
  } | null;
}

export interface PayrollAlertWithCollaborator extends PayrollAlert {
  collaborator?: { id: string; name: string } | null;
}

export interface PayrollPeriodWithStats extends PayrollPeriod {
  entries_count?: number;
  total_value?: number;
  alerts_count?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mês de referência
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function formatPeriodLabel(referenceMonth: string): string {
  // referenceMonth é date no formato YYYY-MM-01
  const d = new Date(referenceMonth + "T00:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function periodToMonthYear(referenceMonth: string): {
  month: number;
  year: number;
} {
  const d = new Date(referenceMonth + "T00:00:00");
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}
