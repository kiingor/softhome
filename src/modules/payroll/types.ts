// Tipos do módulo Folha (controle, NÃO cálculo CLT).
//
// CLAUDE.md princípio 2: SoftHouse não calcula folha.
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
// Tipos de lançamento ATIVOS no SoftHouse (decisão Q1 da Fase 4)
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
  "desconto",
] as const;

export type ActiveEntryType = (typeof ACTIVE_ENTRY_TYPES)[number];

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  salario_base: "Salário base",
  hora_extra: "Hora extra",
  falta: "Falta",
  atestado: "Atestado",
  beneficio: "Benefício",
  adiantamento: "Adiantamento",
  bonificacao: "Bonificação",
  desconto: "Desconto",
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
  "atestado",
] as const;

export const DEDUCTION_TYPES = [
  "falta",
  "adiantamento",
  "desconto",
  "inss",
  "irpf",
  "fgts",
  "custo",
  "despesa",
] as const;

export function isEarning(type: string): boolean {
  return (EARNINGS_TYPES as readonly string[]).includes(type);
}

export function isDeduction(type: string): boolean {
  return (DEDUCTION_TYPES as readonly string[]).includes(type);
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
