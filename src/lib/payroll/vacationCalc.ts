// Cálculo de férias (CLT) — segue regra:
//   Férias           = Salário × (dias_gozados ÷ 30)        ← LINHA do recibo
//   Grat s/ Férias   = Gratificação × (dias_gozados ÷ 30)   ← LINHA SEPARADA do recibo
//   1/3              = (Férias + Grat s/ Férias) ÷ 3
//   INSS             = progressivo sobre (Férias + Grat + 1/3) — só sobre gozados
//   IRRF             = progressivo sobre (Bruto_gozados − INSS)
//   Abono pecuniário (dias vendidos): mesmo cálculo proporcional, MAS isento
//   de INSS/IRRF (CLT art 144 + IN RFB 1500/2014 art 32).
//   Bonificações: somam DIRETO no bruto final, sem 1/3 e sem tributação
//   (PLR/prêmios não habituais não compõem base de cálculo).
//
// Bruto = Férias + Grat s/Férias + 1/3 + Abono + 1/3 Abono + Bonificações
// Líquido = Bruto − INSS − IRRF
//
// IMPORTANTE: `valor_ferias` é SÓ salário (sem grat embutida) — a grat aparece
// na sua linha própria `gratificacao_valor`. Isso evita dupla-contagem visual
// no recibo PDF (linha de Férias × linha de Gratificação).
//
// Atualização anual da tabela 2026: mexer em cltCalc.ts (já reutilizado aqui).

import { calcINSS, calcIRPF } from "./cltCalc";

export interface VacationCalcInput {
  /** Salário base mensal do colaborador. */
  salary: number;
  /** Dias de férias efetivamente gozados (descontam INSS/IRRF). */
  daysTaken: number;
  /** Dias vendidos como abono pecuniário (isentos de INSS/IRRF). 0 = não vendeu. */
  daysSold?: number;
  /** Nº de dependentes legais (pra IRRF). */
  dependents?: number;
  /**
   * Valor mensal de gratificações habituais que compõem a remuneração de
   * férias (entra na base de cálculo do INSS/IRRF e gera 1/3 proporcional).
   * Ex: gratificação de função, comissões regulares.
   */
  gratifications?: number;
  /**
   * Valor de bonificações pagas no recibo SEM 1/3 e SEM tributar (PLR,
   * prêmios não habituais). Entra direto no bruto final.
   */
  bonifications?: number;
}

export interface VacationCalcResult {
  // Insumos
  salary: number;
  daysTaken: number;
  daysSold: number;
  dependents: number;
  gratifications: number;
  bonifications: number;

  /** Remuneração base = salary + gratifications. Info — não usada diretamente. */
  remuneracao_base: number;

  // Componentes brutos
  /** Valor das férias = SALÁRIO × dias_gozados ÷ 30 (sem gratificação). */
  valor_ferias: number;
  /**
   * Valor da gratificação proporcional aos dias gozados.
   * = gratifications × dias_gozados ÷ 30. Linha SEPARADA do recibo.
   * Entra na base de cálculo do INSS/IRRF (junto com valor_ferias e 1/3).
   */
  gratificacao_valor: number;
  /** 1/3 sobre (valor_ferias + gratificacao_valor). */
  um_terco_ferias: number;
  /** Valor do abono pecuniário (dias vendidos, sobre salário). */
  valor_abono: number;
  /** 1/3 sobre abono. */
  um_terco_abono: number;
  /** Bonificações livres (entram no bruto sem tributar). */
  valor_bonificacao: number;

  // Bases
  /** Base de cálculo do INSS = férias_gozadas + 1/3_gozadas. */
  base_inss: number;
  /** Base de cálculo do IRRF = base_inss − INSS. */
  base_irrf: number;

  // Encargos
  inss: number;
  irrf: number;

  // Totais
  /** Bruto = férias + 1/3 + abono + 1/3 abono + bonificações. */
  bruto: number;
  /** Líquido = bruto − INSS − IRRF. */
  liquido: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcVacation(input: VacationCalcInput): VacationCalcResult {
  const salary = Math.max(0, Number(input.salary) || 0);
  const daysTaken = Math.max(0, Math.floor(Number(input.daysTaken) || 0));
  const daysSold = Math.max(0, Math.floor(Number(input.daysSold) || 0));
  const dependents = Math.max(0, Math.floor(Number(input.dependents) || 0));
  const gratifications = Math.max(0, Number(input.gratifications) || 0);
  const bonifications = Math.max(0, Number(input.bonifications) || 0);

  // Remuneração base = info só pra exibição. valor_ferias usa SÓ salary.
  const remuneracao_base = round2(salary + gratifications);
  // Daily rates separadas — cada linha do recibo é independente.
  const dailyRateSalary = salary / 30;
  const dailyRateGrat = gratifications / 30;
  // Abono (dias vendidos) é proporcional ao salário (sem grat habitual,
  // que continua sendo paga mensalmente como sempre).
  const dailyRateAbono = salary / 30;

  // Valor das férias (linha "Horas Férias Diurnas" no recibo) = SÓ salário
  const valor_ferias = round2(dailyRateSalary * daysTaken);
  // Gratificação s/ Férias (linha separada) = grat proporcional aos dias gozados
  const gratificacao_valor = round2(dailyRateGrat * daysTaken);
  // 1/3 cobre os dois componentes (férias + grat s/ férias)
  const um_terco_ferias = round2((valor_ferias + gratificacao_valor) / 3);

  const valor_abono = round2(dailyRateAbono * daysSold);
  const um_terco_abono = round2(valor_abono / 3);

  // Base de INSS/IRRF — férias + grat s/férias + 1/3 sobre ambos (abono isento)
  const base_inss = round2(valor_ferias + gratificacao_valor + um_terco_ferias);
  const inss = calcINSS(base_inss);

  const base_irrf = round2(Math.max(0, base_inss - inss));
  // IRRF de férias não usa o redutor da Lei 14.973/2024 (aquele é só pra
  // renda mensal recorrente). Por isso applyRedutor=false.
  const irrf = calcIRPF({
    grossSalary: base_inss,
    inss,
    dependents,
    applyRedutor: false,
  });

  const valor_bonificacao = round2(bonifications);

  // Bruto = todos os proventos (cada linha do recibo)
  const bruto = round2(
    valor_ferias +
      gratificacao_valor +
      um_terco_ferias +
      valor_abono +
      um_terco_abono +
      valor_bonificacao,
  );
  const liquido = round2(bruto - inss - irrf);

  return {
    salary,
    daysTaken,
    daysSold,
    dependents,
    gratifications,
    bonifications,
    remuneracao_base,
    valor_ferias,
    gratificacao_valor,
    um_terco_ferias,
    valor_abono,
    um_terco_abono,
    valor_bonificacao,
    base_inss,
    base_irrf,
    inss,
    irrf,
    bruto,
    liquido,
  };
}

/**
 * Calcula a data de pagamento das férias.
 * Regra CLT (art. 145): até 2 dias antes do início do gozo.
 * Aqui usamos exatamente D-2.
 */
export function calcVacationPaymentDate(startDate: string | Date): Date {
  const d = typeof startDate === "string" ? new Date(startDate) : new Date(startDate);
  d.setDate(d.getDate() - 2);
  return d;
}

/**
 * Determina mês/ano da folha em que as férias devem ser lançadas.
 * Regra adotada: **mês do GOZO** (start_date). Decisão de produto —
 * o recibo cai na mesma folha do mês em que o colaborador está usufruindo
 * das férias, junto com (não em lugar de) o salário do mês.
 *
 * O `payment_date` continua sendo D-2 do gozo (CLT art 145), mas serve só
 * pra documentação no recibo — não influencia em qual folha o lançamento
 * aparece.
 */
export function calcVacationPayrollMonth(
  startDate: string | Date,
  overrideMonth?: { month: number; year: number },
): { month: number; year: number } {
  if (overrideMonth) return overrideMonth;
  const start = typeof startDate === "string"
    ? (() => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return new Date(startDate);
      })()
    : new Date(startDate);
  return {
    month: start.getMonth() + 1, // 1-indexed
    year: start.getFullYear(),
  };
}

/**
 * Quantos dias do período de férias caem DENTRO de um mês específico.
 * Usado pra prorrata de salário: se colab está de férias parte do mês,
 * o salário do mês reduz proporcionalmente.
 *
 * Exemplo: férias 10/07 a 09/08, mês=7 ano=2026 → 22 dias (10-31 julho).
 *          mês=8 ano=2026 → 9 dias (01-09 agosto).
 */
export function vacationDaysInMonth(
  vacationStart: string,
  vacationEnd: string,
  month: number, // 1-12
  year: number,
): number {
  const parseISO = (iso: string): Date => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(iso);
  };

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // último dia do mês

  const vStart = parseISO(vacationStart);
  const vEnd = parseISO(vacationEnd);

  const overlapStart = vStart > monthStart ? vStart : monthStart;
  const overlapEnd = vEnd < monthEnd ? vEnd : monthEnd;

  if (overlapStart > overlapEnd) return 0;
  const ms = overlapEnd.getTime() - overlapStart.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}
