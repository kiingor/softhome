// Cálculo de IRPF/INSS/FGTS pelas tabelas oficiais 2026.
//
// Atualização anual: edite as constantes neste arquivo + os testes em
// `cltCalc.test.ts`. Tudo que consome encargos no app passa por aqui.
//
// Fora do escopo: rescisão, 13º com encargos completos, eSocial, FAP/RAT,
// contribuição patronal — tudo isso continua sendo controle manual.

// ─────────────────────────────────────────────────────────────────────────────
// Tabelas 2026
// ─────────────────────────────────────────────────────────────────────────────

export const INSS_TABLE_2026 = [
  { max: 1621.0, rate: 0.075, deduction: 0 },
  { max: 2902.84, rate: 0.09, deduction: 24.32 },
  { max: 4354.27, rate: 0.12, deduction: 111.4 },
  { max: 8475.55, rate: 0.14, deduction: 198.49 },
] as const;

export const INSS_CEILING_2026 = 988.09; // teto de contribuição
export const INSS_CEILING_SALARY_2026 = 8475.55;

export const IRPF_TABLE_2026 = [
  { max: 2428.8, rate: 0, deduction: 0 },
  { max: 2826.65, rate: 0.075, deduction: 182.16 },
  { max: 3751.05, rate: 0.15, deduction: 394.16 },
  { max: 4664.68, rate: 0.225, deduction: 675.49 },
  { max: Infinity, rate: 0.275, deduction: 908.73 },
] as const;

export const DEPENDENT_DEDUCTION_2026 = 189.59;
export const IRPF_FULL_EXEMPTION_LIMIT_2026 = 5000;
export const IRPF_REDUCER_LIMIT_2026 = 7350;
export const IRPF_REDUCER_BASE_2026 = 978.62;
export const IRPF_REDUCER_RATE_2026 = 0.133145;

export const FGTS_RATE = 0.08;

// ─────────────────────────────────────────────────────────────────────────────
// Salário-Família 2026 (Portaria MTP/MF — reajuste anual junto com INSS)
//
// Regra: empregado CLT com salário ≤ SALARIO_FAMILIA_LIMITE recebe
// SALARIO_FAMILIA_VALOR por cada FILHO de até 14 anos OU filho inválido
// (qualquer idade). Isento de INSS/IRPF/FGTS. Empregador paga e compensa
// no INSS a recolher.
//
// Valores 2025 (placeholder pra 2026 — atualizar quando MTP publicar):
//   • Limite: R$ 1.906,04
//   • Valor por filho: R$ 65,00
//
// Fonte: https://www.gov.br/inss/pt-br/noticias/o-que-e-salario-familia-e-quem-tem-direito
// ─────────────────────────────────────────────────────────────────────────────

export const SALARIO_FAMILIA_LIMITE_2026 = 1906.04;
export const SALARIO_FAMILIA_VALOR_2026 = 65.0;

/** Idade-limite (exclusivo) pra filho não inválido. Lei 4.266/63 art. 1º. */
export const SALARIO_FAMILIA_IDADE_LIMITE = 14;

// ─────────────────────────────────────────────────────────────────────────────
// Funções
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** INSS progressivo via parcela a deduzir. Acima do teto, valor fixo. */
export function calcINSS(grossSalary: number): number {
  if (grossSalary <= 0) return 0;
  if (grossSalary >= INSS_CEILING_SALARY_2026) return INSS_CEILING_2026;
  for (const b of INSS_TABLE_2026) {
    if (grossSalary <= b.max) {
      return round2(grossSalary * b.rate - b.deduction);
    }
  }
  return INSS_CEILING_2026;
}

/**
 * IRPF mensal com tabela progressiva 2026, dedução por dependente, e o
 * redutor da nova lei (renda até R$ 5.000 isenta; R$ 5k-R$ 7,35k tem
 * redutor parcial).
 *
 * Pra IRPF sobre 13º salário (tributação exclusiva na fonte) passe
 * `applyRedutor: false` — o redutor da Lei 14.973/2024 vale só pra renda
 * mensal recorrente, não pro 13º.
 */
export function calcIRPF(args: {
  grossSalary: number;
  inss: number;
  dependents: number;
  applyRedutor?: boolean;
}): number {
  const { grossSalary, inss, dependents, applyRedutor = true } = args;
  if (grossSalary <= 0) return 0;
  if (applyRedutor && grossSalary <= IRPF_FULL_EXEMPTION_LIMIT_2026) return 0;

  const base =
    grossSalary - inss - DEPENDENT_DEDUCTION_2026 * Math.max(0, dependents);
  if (base <= 0) return 0;

  let imposto = 0;
  for (const b of IRPF_TABLE_2026) {
    if (base <= b.max) {
      imposto = base * b.rate - b.deduction;
      break;
    }
  }
  if (imposto < 0) imposto = 0;

  if (applyRedutor && grossSalary <= IRPF_REDUCER_LIMIT_2026) {
    const redutor = Math.max(
      0,
      IRPF_REDUCER_BASE_2026 - IRPF_REDUCER_RATE_2026 * grossSalary,
    );
    imposto = Math.max(0, imposto - redutor);
  }

  return round2(imposto);
}

/** FGTS é encargo do empregador (8% do bruto). Não desconta do colaborador. */
export function calcFGTS(grossSalary: number): number {
  if (grossSalary <= 0) return 0;
  return round2(grossSalary * FGTS_RATE);
}

/** Helper: calcula os 3 de uma vez. */
export function calcAllTaxes(args: {
  grossSalary: number;
  dependents: number;
}): { inss: number; irpf: number; fgts: number } {
  const inss = calcINSS(args.grossSalary);
  const irpf = calcIRPF({
    grossSalary: args.grossSalary,
    inss,
    dependents: args.dependents,
  });
  const fgts = calcFGTS(args.grossSalary);
  return { inss, irpf, fgts };
}

/**
 * Dependente elegível ao salário-família.
 * Use `eligibleChildrenForSalarioFamilia` pra filtrar uma lista de dependentes
 * por idade + invalidez. A função de cálculo abaixo recebe só a contagem.
 */
export interface SalarioFamiliaDependent {
  /** Data de nascimento ISO (YYYY-MM-DD). */
  birth_date: string | null;
  /** True se o dependente é inválido (qualquer idade conta). */
  is_invalid?: boolean | null;
  /** Tem que ser filho/enteado pra contar. */
  kinship?: string | null;
}

/**
 * Calcula a idade em anos completos a partir da data de nascimento, na
 * data de referência (default: hoje). Não usa libs externas — só
 * aritmética básica pra evitar timezone bugs.
 */
export function ageInYears(birthIso: string, refDate: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthIso);
  if (!m) return -1;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let age = refDate.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    refDate.getMonth() < birth.getMonth() ||
    (refDate.getMonth() === birth.getMonth() && refDate.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return age;
}

/**
 * Filtra dependentes elegíveis ao salário-família.
 * Regras: kinship='filho'/'enteado' E (idade < 14 OU is_invalid).
 */
export function eligibleChildrenForSalarioFamilia(
  dependents: SalarioFamiliaDependent[],
  refDate: Date = new Date(),
): SalarioFamiliaDependent[] {
  return dependents.filter((d) => {
    // Só filho ou enteado contam pra salário-família.
    const k = (d.kinship ?? "").toLowerCase();
    if (k !== "filho" && k !== "filha" && k !== "enteado" && k !== "enteada") return false;
    // Inválido conta em qualquer idade.
    if (d.is_invalid === true) return true;
    // Caso normal: idade < 14 (anos completos).
    if (!d.birth_date) return false;
    return ageInYears(d.birth_date, refDate) < SALARIO_FAMILIA_IDADE_LIMITE;
  });
}

/**
 * Calcula o valor do salário-família devido a um empregado.
 *
 * Regras (Lei 4.266/63 + reajuste 2026):
 *   • Empregado precisa ter salário ≤ SALARIO_FAMILIA_LIMITE_2026
 *   • Empresa paga SALARIO_FAMILIA_VALOR_2026 por cada filho elegível
 *   • Isento de INSS/IRPF/FGTS — entra no líquido sem desconto
 *
 * Retorna value = 0 quando o empregado não se qualifica (acima do teto OU
 * sem filhos elegíveis).
 */
export function calcSalarioFamilia(args: {
  grossSalary: number;
  eligibleChildrenCount: number;
}): { value: number; eligible: boolean; perChild: number; limit: number } {
  const salary = Math.max(0, Number(args.grossSalary) || 0);
  const count = Math.max(0, Math.floor(Number(args.eligibleChildrenCount) || 0));
  const eligible = salary > 0 && salary <= SALARIO_FAMILIA_LIMITE_2026 && count > 0;
  return {
    value: eligible ? round2(SALARIO_FAMILIA_VALOR_2026 * count) : 0,
    eligible,
    perChild: SALARIO_FAMILIA_VALOR_2026,
    limit: SALARIO_FAMILIA_LIMITE_2026,
  };
}
