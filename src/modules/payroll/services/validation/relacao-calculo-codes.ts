// Mapeamento dos códigos da "Relação de Cálculo" (folha da contabilidade) para
// os tipos/grupos do DNA Softcom. O código (1..4 dígitos) é a chave estável; a
// descrição serve de rótulo e de fallback por palavra-chave pra códigos novos.
//
// `group` dirige a lógica de validação (como casar com payroll_entries):
//   salario        → entry type 'salario_base'
//   provento       → proventos tributáveis (hora extra, periculosidade, gratificação…)
//   salario_familia→ entry type 'salario_familia'
//   inss/irpf/fgts → encargos calculados
//   plano_saude    → desconto com external_id 'plano-saude-%'
//   emprestimo     → entry type 'emprestimo'
//   desconto       → demais descontos manuais (VA, pensão, pgto indevido…)
//   ferias         → fluxo de férias (external_id 'ferias-%') — informativo
//   rescisao       → FORA DO ESCOPO (CLAUDE.md) — informativo, não valida

export type CodeGroup =
  | "salario"
  | "provento"
  | "salario_familia"
  | "inss"
  | "irpf"
  | "fgts"
  | "plano_saude"
  | "vale_transporte"
  | "emprestimo"
  | "desconto"
  | "ferias"
  | "rescisao"
  | "informativo" // consta no PDF mas a folha mensal não controla (licença, 13º, pró-labore, ajuste)
  | "unknown";

export interface CodeMapping {
  /** Grupo de validação. */
  group: CodeGroup;
  /** payroll_entry_type correspondente (quando aplicável). */
  entryType: string | null;
  /** Rótulo amigável pra UI. */
  label: string;
}

// Mapa primário por código.
const CODE_MAP: Record<string, CodeMapping> = {
  // ── Proventos / salário ────────────────────────────────────────────────────
  "1": { group: "salario", entryType: "salario_base", label: "Salário contratual" },
  "33": { group: "salario", entryType: "salario_base", label: "Saldo de salário" },
  "2": { group: "provento", entryType: "hora_extra", label: "Horas Normais Noturnas" },
  "9": { group: "provento", entryType: "hora_extra", label: "Horas Sobre Aviso Diurnas" },
  "35": { group: "provento", entryType: "hora_extra", label: "Horas Extras" },
  "59": { group: "provento", entryType: "hora_extra", label: "DSR S/Horas Extras Diurnas" },
  "96": { group: "provento", entryType: "hora_extra", label: "Adicional Noturno" },
  "20": { group: "provento", entryType: "atestado", label: "Horas Lic. Médica Noturnas" },
  "64": { group: "provento", entryType: "periculosidade", label: "Periculosidade" },
  "1328": { group: "provento", entryType: "gratificacao", label: "Gratificação Espontânea" },
  "150": { group: "salario_familia", entryType: "salario_familia", label: "Salário Família" },

  // ── Férias (fluxo próprio) ──────────────────────────────────────────────────
  "358": { group: "ferias", entryType: "ferias", label: "Horas Férias Diurnas" },
  "368": { group: "ferias", entryType: "periculosidade", label: "Periculosidade S/Férias" },
  "890": { group: "ferias", entryType: "adiantamento", label: "Desconto Adiantamento Férias" },
  "1832": { group: "ferias", entryType: "desconto", label: "Pensão Judicial s/Férias" },

  // ── Encargos calculados ─────────────────────────────────────────────────────
  "1900": { group: "fgts", entryType: "fgts", label: "FGTS" },
  "1920": { group: "irpf", entryType: "irpf", label: "IRRF" },
  "1950": { group: "inss", entryType: "inss", label: "INSS" },

  // ── Descontos ───────────────────────────────────────────────────────────────
  "4004": { group: "emprestimo", entryType: "emprestimo", label: "Empréstimo Crédito do" },
  "1445": { group: "plano_saude", entryType: "desconto", label: "Mensalidade Plano de Saúde" },
  "1448": { group: "plano_saude", entryType: "desconto", label: "Mensalidade Plano de Saúde (dependente)" },
  "816": { group: "vale_transporte", entryType: "desconto", label: "Vale Transporte (6%)" },
  "100": { group: "desconto", entryType: "desconto", label: "Desconto Vale Alimentação" },
  "820": { group: "desconto", entryType: "adiantamento", label: "Desconto Adiantamento" },
  "1604": { group: "desconto", entryType: "desconto", label: "Desconto Pagamento Indevido" },
  "1830": { group: "desconto", entryType: "desconto", label: "Pensão Judicial" },

  // ── Informativos — a folha mensal não controla (não validados) ──────────────
  "110": { group: "informativo", entryType: null, label: "Licença Maternidade" },
  "19": { group: "informativo", entryType: null, label: "Licença Médica" },
  "163": { group: "informativo", entryType: null, label: "Estouro do Mês" },
  "510": { group: "informativo", entryType: null, label: "13º Salário Proporcional" },
  "85": { group: "informativo", entryType: null, label: "Pró-Labore" },

  // ── Rescisão — FORA DO ESCOPO ───────────────────────────────────────────────
  "448": { group: "rescisao", entryType: null, label: "Aviso Prévio Indenizado" },
  "1895": { group: "rescisao", entryType: null, label: "Desconto Líquido Rescisão" },
  "1903": { group: "rescisao", entryType: null, label: "FGTS S/Aviso Prévio Indenizado" },
  "1908": { group: "rescisao", entryType: null, label: "FGTS Multa - Depósito Saldo" },
};

// Fallback por palavra-chave na descrição (códigos não mapeados acima).
const KEYWORD_FALLBACKS: { match: RegExp; mapping: CodeMapping }[] = [
  { match: /sal[aá]rio fam[ií]lia/i, mapping: { group: "salario_familia", entryType: "salario_familia", label: "Salário Família" } },
  { match: /plano de sa[uú]de/i, mapping: { group: "plano_saude", entryType: "desconto", label: "Mensalidade Plano de Saúde" } },
  { match: /\bINSS\b/i, mapping: { group: "inss", entryType: "inss", label: "INSS" } },
  { match: /\bIRRF\b|imposto de renda/i, mapping: { group: "irpf", entryType: "irpf", label: "IRRF" } },
  { match: /\bFGTS\b/i, mapping: { group: "fgts", entryType: "fgts", label: "FGTS" } },
  { match: /empr[eé]stimo|consignad/i, mapping: { group: "emprestimo", entryType: "emprestimo", label: "Empréstimo" } },
  { match: /diferen[cç]a\s+(de\s+)?sal[aá]rio|sal[aá]rio\s+retroativ|retroativ/i, mapping: { group: "provento", entryType: "salario_retroativo", label: "Salário Retroativo" } },
  { match: /salário contratual|sal[aá]rio base|saldo de sal[aá]rio/i, mapping: { group: "salario", entryType: "salario_base", label: "Salário" } },
  { match: /periculosidade/i, mapping: { group: "provento", entryType: "periculosidade", label: "Periculosidade" } },
  { match: /gratifica/i, mapping: { group: "provento", entryType: "gratificacao", label: "Gratificação" } },
  { match: /hora|adicional noturno|\bDSR\b/i, mapping: { group: "provento", entryType: "hora_extra", label: "Horas/Adicional" } },
  { match: /rescis[aã]o|aviso pr[eé]vio/i, mapping: { group: "rescisao", entryType: null, label: "Rescisão" } },
  { match: /f[eé]rias/i, mapping: { group: "ferias", entryType: "ferias", label: "Férias" } },
  { match: /adiantamento/i, mapping: { group: "desconto", entryType: "adiantamento", label: "Adiantamento" } },
  { match: /pens[aã]o|desconto|mensalidade|contribui/i, mapping: { group: "desconto", entryType: "desconto", label: "Desconto" } },
];

export function mapCodigo(codigo: string, descricao: string): CodeMapping {
  const direct = CODE_MAP[codigo];
  if (direct) return direct;
  for (const fb of KEYWORD_FALLBACKS) {
    if (fb.match.test(descricao)) return fb.mapping;
  }
  return { group: "unknown", entryType: null, label: descricao || `Código ${codigo}` };
}
