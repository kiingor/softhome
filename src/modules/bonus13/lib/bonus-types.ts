// Tipos compartilhados do módulo de 13º Salário.

export type BonusPeriodStatus = "aberto" | "pagamento" | "concluido";
export type BonusEntryMode = "batch" | "individual" | "anticipated";
export type BonusInstallment = "first" | "second" | "single";

export interface BonusPeriod {
  id: string;
  company_id: string;
  year: number;
  status: BonusPeriodStatus;
  opened_by: string | null;
  opened_at: string;
  generated_by: string | null;
  generated_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BonusEntry {
  id: string;
  period_id: string;
  collaborator_id: string;
  base_salary: number;
  /** Soma das gratificações (type='gratificacao') do colaborador no ano da campanha. Snapshot. */
  gratificacao_sum: number;
  /** Soma do valor mensal das atribuições de benefício categoria 'adicional'. Snapshot. */
  adicional_monthly: number;
  months_worked: number;
  gross_value: number;
  mode: BonusEntryMode;
  mode_set_by: string | null;
  mode_set_at: string | null;
  mode_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BonusPayment {
  id: string;
  entry_id: string;
  installment: BonusInstallment;
  amount: number;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Entry + dados do colaborador agregados pra UI da listagem. */
export interface BonusEntryWithCollaborator extends BonusEntry {
  collaborator: {
    id: string;
    name: string;
    cpf: string;
    email: string | null;
    position: string | null;
    admission_date: string | null;
    status: string;
  };
}

export const BONUS_STATUS_LABELS: Record<BonusPeriodStatus, string> = {
  aberto: "Aberto",
  pagamento: "Em pagamento",
  concluido: "Concluído",
};

export const BONUS_MODE_LABELS: Record<BonusEntryMode, string> = {
  batch: "No lote",
  individual: "Pago avulso",
  anticipated: "Antecipado",
};

export const INSTALLMENT_LABELS: Record<BonusInstallment, string> = {
  first: "1ª parcela (Novembro)",
  second: "2ª parcela (Dezembro)",
  single: "Pagamento único",
};
