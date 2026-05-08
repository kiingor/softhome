// Cálculo proporcional do 13º salário conforme regra CLT.
//
// Regra de meses: cada mês com 15 dias ou mais de vínculo conta como 1 mês
// cheio (regra CLT padrão).
//
// Base de cálculo (CLT art. 457, §1º — médias de proventos habituais entram
// na base do 13º):
//   13º bruto = (salário base × meses + soma_gratificações_ano + adicional_mensal × meses) / 12
//
// Componentes:
//   · salário base: snapshot do salário atual
//   · soma_gratificações_ano: SUM(payroll_entries.value) onde
//       type='gratificacao' e collaborator+ano = X
//   · adicional_mensal: SUM(coalesce(custom_value, benefits.value)) das
//       atribuições de benefício categoria 'adicional' do colaborador
//
// Impostos no 13º (regra CLT 2026):
// - 1ª parcela (Nov): adiantamento, SEM descontos (50% do bruto)
// - 2ª parcela (Dez): saldo − INSS_total − IRPF_total
//   · INSS sobre 13º bruto, mesma tabela do mensal
//   · IRPF sobre (13º bruto − INSS − dependentes), tabela mensal,
//     SEM o redutor da Lei 14.973/2024 (que vale só pra renda mensal)
//
// O cálculo é puro/funcional pra ser fácil de testar — não depende de DB.
// Recebe datas como strings ISO (YYYY-MM-DD) ou Date.

import { calcINSS, calcIRPF } from "@/lib/payroll/cltCalc";

export type CalcInput = {
  /** Data de admissão do colaborador. */
  admissionDate: Date | string;
  /** Ano da campanha de 13º (ex: 2026). */
  year: number;
  /** Salário base atual. Se 0/undefined, gross_value sai 0. */
  baseSalary: number;
  /**
   * Soma das Gratificações lançadas no ano da campanha (payroll_entries com
   * type='gratificacao'). Default 0. Pro-rata CLT: este valor é dividido por
   * 12 e somado ao bruto.
   */
  gratificacaoSum?: number;
  /**
   * Soma do valor mensal das atribuições de benefício categoria 'adicional'
   * do colaborador. Default 0. Pro-rata CLT: este valor é multiplicado pelos
   * meses trabalhados e dividido por 12.
   */
  adicionalMonthly?: number;
  /** Data de hoje — opcional, default = `new Date()`. Útil pra testes determinísticos. */
  today?: Date;
};

export type CalcResult = {
  monthsWorked: number;
  grossValue: number;
};

export type GrossValueInput = {
  baseSalary: number;
  monthsWorked: number;
  gratificacaoSum?: number;
  adicionalMonthly?: number;
};

const DAYS_THRESHOLD_FOR_MONTH = 15;

function asDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  // Forçar interpretação como data local (sem timezone shift) — Date construído
  // a partir de "YYYY-MM-DD" é interpretado como UTC midnight, o que pode dar
  // -1 dia em fusos negativos. Quebro manualmente.
  const [y, m, day] = d.split("-").map((p) => parseInt(p, 10));
  return new Date(y, m - 1, day);
}

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

/**
 * Conta quantos meses do ano-alvo o colaborador trabalhou ≥15 dias.
 *
 * - Se admitido antes de 1º jan do ano: começa contando jan inteiro.
 * - Se admitido durante o ano: o mês de admissão conta apenas se restarem
 *   ≥15 dias do mês a partir do dia de admissão (regra CLT padrão).
 * - Se admitido após dezembro do ano: retorna 0.
 *
 * Limitação atual: não considera data de demissão (collaborators.dismissal_date
 * não existe ainda no schema). Adicionar quando virar requisito.
 */
export function calcMonthsWorked(input: {
  admissionDate: Date | string;
  year: number;
  today?: Date;
}): number {
  const adm = asDate(input.admissionDate);
  const yearStart = new Date(input.year, 0, 1);
  const yearEnd = new Date(input.year, 11, 31);

  // Admitido após o ano todo → 0 meses
  if (adm > yearEnd) return 0;

  let count = 0;

  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(input.year, m, 1);
    const monthEnd = new Date(input.year, m, daysInMonth(input.year, m));

    // Mês inteiro antes da admissão → não conta
    if (monthEnd < adm) continue;

    // Janela de vínculo dentro do mês
    const effectiveStart = adm > monthStart ? adm : monthStart;
    const daysWorked = Math.floor(
      (monthEnd.getTime() - effectiveStart.getTime()) / 86_400_000,
    ) + 1;

    if (daysWorked >= DAYS_THRESHOLD_FOR_MONTH) {
      count++;
    }
  }

  // Sanity: nunca pode passar de 12
  return Math.min(count, 12);
}

/**
 * Calcula o 13º bruto proporcional aos meses trabalhados, somando
 * gratificações e adicionais do ano (CLT art. 457).
 *
 * Fórmula:
 *   bruto = (baseSalary × meses + gratificacaoSum + adicionalMonthly × meses) / 12
 *
 * Aceita assinatura legada (baseSalary, monthsWorked) por compatibilidade —
 * nesse caso gratificacaoSum e adicionalMonthly assumem 0 e o resultado é
 * idêntico ao comportamento anterior.
 *
 * Arredonda para 2 casas decimais (centavos).
 */
export function calcGrossValue(
  inputOrBase: number | GrossValueInput,
  monthsWorkedLegacy?: number,
): number {
  const input: GrossValueInput =
    typeof inputOrBase === "number"
      ? {
          baseSalary: inputOrBase,
          monthsWorked: monthsWorkedLegacy ?? 0,
        }
      : inputOrBase;

  const baseSalary = input.baseSalary || 0;
  const monthsWorked = input.monthsWorked || 0;
  const gratificacaoSum = input.gratificacaoSum ?? 0;
  const adicionalMonthly = input.adicionalMonthly ?? 0;

  if (monthsWorked <= 0) return 0;
  if (baseSalary <= 0 && gratificacaoSum <= 0 && adicionalMonthly <= 0) {
    return 0;
  }

  const value =
    (baseSalary * monthsWorked +
      gratificacaoSum +
      adicionalMonthly * monthsWorked) /
    12;
  return Math.round(value * 100) / 100;
}

/** Conveniência: input → result. */
export function calcBonus13(input: CalcInput): CalcResult {
  const monthsWorked = calcMonthsWorked(input);
  const grossValue = calcGrossValue({
    baseSalary: input.baseSalary,
    monthsWorked,
    gratificacaoSum: input.gratificacaoSum,
    adicionalMonthly: input.adicionalMonthly,
  });
  return { monthsWorked, grossValue };
}

/**
 * Divide o bruto em duas parcelas (1ª = floor, 2ª = restante) garantindo
 * que `first + second === gross` (sem perda de centavo por arredondamento).
 *
 * Versão sem impostos — usar quando não for aplicável (ex: pagamento
 * "single" / avulso).
 */
export function splitInstallments(gross: number): { first: number; second: number } {
  // Mantém os valores em centavos pra evitar erros de float
  const totalCents = Math.round(gross * 100);
  const firstCents = Math.floor(totalCents / 2);
  const secondCents = totalCents - firstCents;
  return {
    first: firstCents / 100,
    second: secondCents / 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Impostos sobre 13º
// ─────────────────────────────────────────────────────────────────────────────

export type Bonus13Taxes = {
  inss: number;
  irpf: number;
  /** bruto − INSS − IRPF */
  net: number;
};

/**
 * Calcula INSS + IRPF sobre o 13º bruto.
 * - INSS: tabela mensal aplicada sobre o bruto
 * - IRPF: tabela mensal sobre (bruto − INSS − dependentes), SEM redutor
 *   (porque o redutor 2026 vale só pra renda mensal recorrente)
 */
export function calcBonus13Taxes(input: {
  grossValue: number;
  dependents: number;
}): Bonus13Taxes {
  if (!input.grossValue || input.grossValue <= 0) {
    return { inss: 0, irpf: 0, net: 0 };
  }
  const inss = calcINSS(input.grossValue);
  const irpf = calcIRPF({
    grossSalary: input.grossValue,
    inss,
    dependents: input.dependents,
    applyRedutor: false,
  });
  const net = Math.round((input.grossValue - inss - irpf) * 100) / 100;
  return { inss, irpf, net };
}

/**
 * Divide bruto em 2 parcelas aplicando os descontos só na 2ª:
 *   1ª (Nov, adiantamento) = floor(bruto/2), sem desconto
 *   2ª (Dez) = (bruto − 1ª) − INSS − IRPF
 *
 * Garante que `first + second === gross − inss − irpf` (líquido total).
 */
export function splitInstallmentsWithTaxes(input: {
  gross: number;
  taxes: Bonus13Taxes;
}): { first: number; second: number } {
  const grossCents = Math.round(input.gross * 100);
  const inssCents = Math.round(input.taxes.inss * 100);
  const irpfCents = Math.round(input.taxes.irpf * 100);

  const firstCents = Math.floor(grossCents / 2);
  const remainingCents = grossCents - firstCents;
  const secondCents = remainingCents - inssCents - irpfCents;

  return {
    first: firstCents / 100,
    // Garante que não fique negativo (caso impostos > metade do bruto, raro
    // mas possível pra rendas muito altas com muitos dependentes baixos).
    second: Math.max(0, secondCents) / 100,
  };
}
