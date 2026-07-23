// Motor de diff: concilia a folha interna (payroll_entries) com a "Relação de
// Cálculo" extraída do PDF. PURO (sem Supabase) — recebe os dois lados já
// carregados e devolve os itens divergentes. Tolerância de ±R$ 0,05 (arredonda-
// mento do cálculo) e ±0 pra contagens (dependentes).

import type { ParsedCollaborator } from "./relacao-calculo-parser";

const MONEY_TOLERANCE = 0.05;

// ── Lado do sistema (folha) ───────────────────────────────────────────────────
export interface SystemEntry {
  type: string;
  value: number;
  external_id: string | null;
}
export interface SystemCollaborator {
  id: string;
  name: string;
  admissionDate: string | null; // YYYY-MM-DD
  regime: string | null;
  entries: SystemEntry[];
  irpfDependents: number;
}

// ── Saída ─────────────────────────────────────────────────────────────────────
export interface DiffItem {
  collaborator_id: string | null;
  collaborator_name: string;
  check_group: string;
  check_label: string;
  expected_value: number | null; // PDF (contabilidade)
  actual_value: number | null; // sistema (folha)
  diff: number | null; // actual - expected
  direction: "a_mais" | "a_menos" | null;
  severity: "divergence" | "missing_system" | "missing_pdf" | "info";
}
export interface DiffResult {
  items: DiffItem[];
  stats: { collaborators_total: number; collaborators_matched: number };
}

// Grupos comparáveis (rótulo amigável).
const GROUP_LABELS: Record<string, string> = {
  salario: "Salário base",
  salario_retroativo: "Salário Retroativo",
  hora_extra: "Horas extras / adicionais",
  periculosidade: "Periculosidade",
  gratificacao: "Gratificação",
  atestado: "Atestado",
  inss: "INSS",
  irpf: "IRPF (IRRF)",
  fgts: "FGTS",
  salario_familia: "Salário-Família",
  plano_saude: "Plano de Saúde",
  vale_transporte: "Vale Transporte",
  emprestimo: "Empréstimo",
  desconto_outros: "Outros descontos",
  liquido: "Líquido",
  dependentes_ir: "Dependentes IR",
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Bucket de uma entrada do PDF → grupo comparável (ou null = ignora).
function pdfGroupOf(e: ParsedCollaborator["entries"][number]): string | null {
  switch (e.group) {
    case "salario":
      return "salario";
    case "salario_familia":
      return "salario_familia";
    case "inss":
      return "inss";
    case "irpf":
      return "irpf";
    case "fgts":
      return "fgts";
    case "plano_saude":
      return "plano_saude";
    case "vale_transporte":
      return "vale_transporte";
    case "emprestimo":
      return "emprestimo";
    case "desconto":
      return "desconto_outros";
    case "provento":
      if (e.entryType === "hora_extra") return "hora_extra";
      if (e.entryType === "periculosidade") return "periculosidade";
      if (e.entryType === "gratificacao") return "gratificacao";
      if (e.entryType === "atestado") return "atestado";
      if (e.entryType === "salario_retroativo") return "salario_retroativo";
      return "hora_extra";
    default:
      return null; // ferias, informativo, rescisao, unknown
  }
}

// Bucket de um lançamento do sistema → grupo comparável (ou null = ignora).
function sysGroupOf(e: SystemEntry): string | null {
  const ext = e.external_id ?? "";
  if (ext.startsWith("ferias-")) return null; // fluxo próprio
  switch (e.type) {
    case "salario_base":
      return "salario";
    case "salario_retroativo":
      return "salario_retroativo";
    case "hora_extra":
      return "hora_extra";
    case "periculosidade":
      return "periculosidade";
    case "gratificacao":
      return "gratificacao";
    case "atestado":
      return "atestado";
    case "inss":
      return "inss";
    case "irpf":
      return "irpf";
    case "fgts":
      return "fgts";
    case "salario_familia":
      return "salario_familia";
    case "emprestimo":
      return "emprestimo";
    case "desconto":
      if (ext.startsWith("plano-saude-")) return "plano_saude";
      if (ext.startsWith("vt-")) return "vale_transporte";
      return "desconto_outros";
    case "adiantamento":
    case "falta":
      return "desconto_outros";
    default:
      return null;
  }
}

// Soma por grupo.
function sumByGroup<T>(items: T[], grouper: (i: T) => string | null, valueOf: (i: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) {
    const g = grouper(i);
    if (!g) continue;
    m.set(g, round2((m.get(g) ?? 0) + valueOf(i)));
  }
  return m;
}

// Líquido do sistema = créditos − débitos (FGTS é custo do empregador, não entra).
const CREDIT_GROUPS = new Set(["salario", "salario_retroativo", "hora_extra", "periculosidade", "gratificacao", "atestado", "salario_familia"]);
const DEBIT_GROUPS = new Set(["inss", "irpf", "plano_saude", "vale_transporte", "emprestimo", "desconto_outros"]);

function systemLiquido(byGroup: Map<string, number>): number {
  let liq = 0;
  for (const [g, v] of byGroup) {
    if (CREDIT_GROUPS.has(g)) liq += v;
    else if (DEBIT_GROUPS.has(g)) liq -= v;
  }
  return round2(liq);
}

export function diffFolha(pdf: ParsedCollaborator[], system: SystemCollaborator[]): DiffResult {
  // Índice do sistema por nome normalizado (trata homônimos por desempate).
  const sysByName = new Map<string, SystemCollaborator[]>();
  for (const s of system) {
    const k = norm(s.name);
    if (!sysByName.has(k)) sysByName.set(k, []);
    sysByName.get(k)!.push(s);
  }

  const items: DiffItem[] = [];
  const matchedSystemIds = new Set<string>();
  let matched = 0;
  // Só considera colaboradores ativos (ignora rescisão — fora do escopo).
  const activePdf = pdf.filter((c) => !c.hasRescisao);

  for (const c of activePdf) {
    const candidates = sysByName.get(norm(c.name)) ?? [];
    let sys: SystemCollaborator | undefined;
    if (candidates.length === 1) sys = candidates[0];
    else if (candidates.length > 1) {
      // desempate: admissão exata > menor diferença de salário base
      sys =
        candidates.find((s) => s.admissionDate && s.admissionDate === c.admissionDate) ?? candidates[0];
    }

    if (!sys) {
      items.push({
        collaborator_id: null,
        collaborator_name: c.name,
        check_group: "collaborator",
        check_label: "Colaborador não encontrado na folha",
        expected_value: null,
        actual_value: null,
        diff: null,
        direction: null,
        severity: "missing_system",
      });
      continue;
    }
    matched++;
    matchedSystemIds.add(sys.id);

    const pdfByGroup = sumByGroup(c.entries, pdfGroupOf, (e) => e.value);
    const sysByGroup = sumByGroup(sys.entries, sysGroupOf, (e) => e.value);

    // Líquido (pagamento)
    pdfByGroup.set("liquido", c.totals ? c.totals.liquido : 0);
    sysByGroup.set("liquido", systemLiquido(sysByGroup));

    // Compara todos os grupos presentes em qualquer lado
    const groups = new Set<string>([...pdfByGroup.keys(), ...sysByGroup.keys(), "salario", "inss", "irpf", "fgts"]);
    for (const g of groups) {
      if (!GROUP_LABELS[g]) continue; // só grupos comparáveis
      const exp = round2(pdfByGroup.get(g) ?? 0);
      const act = round2(sysByGroup.get(g) ?? 0);
      if (Math.abs(exp - act) <= MONEY_TOLERANCE) continue;
      const d = round2(act - exp);
      items.push({
        collaborator_id: sys.id,
        collaborator_name: c.name,
        check_group: g,
        check_label: GROUP_LABELS[g],
        expected_value: exp,
        actual_value: act,
        diff: d,
        direction: d > 0 ? "a_mais" : "a_menos",
        severity: "divergence",
      });
    }

    // Dependentes IR (contagem exata)
    if (c.depIR !== sys.irpfDependents) {
      items.push({
        collaborator_id: sys.id,
        collaborator_name: c.name,
        check_group: "dependentes_ir",
        check_label: GROUP_LABELS.dependentes_ir,
        expected_value: c.depIR,
        actual_value: sys.irpfDependents,
        diff: sys.irpfDependents - c.depIR,
        direction: sys.irpfDependents > c.depIR ? "a_mais" : "a_menos",
        severity: "divergence",
      });
    }
  }

  // Colaboradores na folha (com salário lançado) sem correspondência no PDF.
  for (const s of system) {
    if (matchedSystemIds.has(s.id)) continue;
    const hasSalary = s.entries.some((e) => e.type === "salario_base" && e.value > 0);
    if (!hasSalary) continue;
    items.push({
      collaborator_id: s.id,
      collaborator_name: s.name,
      check_group: "collaborator",
      check_label: "Colaborador na folha sem correspondência no PDF",
      expected_value: null,
      actual_value: null,
      diff: null,
      direction: null,
      severity: "missing_pdf",
    });
  }

  return { items, stats: { collaborators_total: activePdf.length, collaborators_matched: matched } };
}
