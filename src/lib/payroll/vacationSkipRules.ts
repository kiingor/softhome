// Regra de produto: recibo de férias lançado no mês M cobre também o salário
// do mês M+1. Quando abre folha do mês M+1, colabs que tiveram recibo em M
// devem ser PULADOS no auto-populate (salário/INSS/IRPF/FGTS) e no carry-over
// (gratificação/bonificação/desconto).
//
// IMPORTANTE: filtra por `payroll_month`/`payroll_year` (mês do lançamento do
// recibo), NÃO por `end_date`. Isso cobre o caso de "Adiantar Férias":
// gozo em Set, adianta o recibo pra Ago → ao abrir folha de Set, queremos
// pular o colab mesmo que `end_date` continue em Set.

export interface ApprovedVacationForSkip {
  collaborator_id: string;
  /** Mês em que o recibo foi lançado (1-12). Null quando ainda não foi posted. */
  payroll_month: number | null;
  /** Ano em que o recibo foi lançado. */
  payroll_year: number | null;
}

/**
 * Dado o conjunto de vacation_requests aprovadas da empresa + o mês/ano de
 * abertura da folha, devolve o Set de `collaborator_id` que devem ser pulados
 * (salário, encargos, carry-over) porque receberam recibo no mês anterior.
 */
export function getCollabsToSkipNextMonth(
  approvedRequests: ApprovedVacationForSkip[],
  openMonth: number,
  openYear: number,
): Set<string> {
  const prevMonth = openMonth === 1 ? 12 : openMonth - 1;
  const prevYear = openMonth === 1 ? openYear - 1 : openYear;
  const skip = new Set<string>();
  for (const r of approvedRequests) {
    if (r.payroll_month === prevMonth && r.payroll_year === prevYear) {
      skip.add(r.collaborator_id);
    }
  }
  return skip;
}
