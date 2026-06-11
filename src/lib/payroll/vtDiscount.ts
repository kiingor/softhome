// Vale Transporte (VT) — coparticipação do colaborador na folha.
//
// Regra de produto (CLT-adjacente): quando o colaborador tem um benefício de
// categoria 'transport' (Vale Transporte) atribuído, desconta-se 6% do salário
// base dele. É um DESCONTO (sai do líquido), nunca custo do empregador.
//
// CLAUDE.md princípio 2: isto é CONTROLE de folha, não cálculo de imposto. O
// desconto VT NÃO compõe nem altera a base de INSS/IRPF/FGTS — essas saem só do
// salário base. É apenas uma linha de desconto a mais na folha.
//
// Detalhes de gravação:
//   - type 'desconto' (DEDUCTION_TYPES) → reduz o líquido em Lançamentos e Pagamento.
//   - value SEMPRE positivo (payroll_entries.value tem CHECK (value > 0)); a
//     natureza de desconto vem do `type`, não do sinal.
//   - external_id determinístico por colaborador+competência → idempotência e
//     limpeza/recompute fáceis (mesmo padrão de salário-família). É preservado
//     no delete seletivo de período; o recalc apaga por prefixo 'vt-' e recria.

/** Valor do enum benefit_category que representa Vale Transporte. */
export const VT_BENEFIT_CATEGORY = "transport";

/** Alíquota da coparticipação do colaborador no VT (6% do salário base). */
export const VT_DISCOUNT_RATE = 0.06;

/** Descrição padrão da linha de desconto VT na folha. */
export const VT_DISCOUNT_DESCRIPTION = "Vale Transporte (6%)";

/** 6% do salário base, arredondado a centavos. Retorna 0 se salário inválido. */
export function calcVtDiscount(salary: number): number {
  if (!(salary > 0)) return 0;
  return Math.round(salary * VT_DISCOUNT_RATE * 100) / 100;
}

/** external_id idempotente do desconto VT (1 por colaborador por competência). */
export function vtDiscountExternalId(
  collaboratorId: string,
  year: number,
  month: number,
): string {
  return `vt-${collaboratorId}-${year}-${String(month).padStart(2, "0")}`;
}

/** True quando a categoria do benefício é Vale Transporte. */
export function isTransportCategory(
  category: string | null | undefined,
): boolean {
  return category === VT_BENEFIT_CATEGORY;
}
