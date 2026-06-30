// Parser determinístico da "Relação de Cálculo" (folha mensal da contabilidade).
//
// Recebe linhas já extraídas do PDF (texto + posição x de cada item) e devolve,
// por colaborador, os lançamentos (código/valor), totais e bases. É PURO (sem
// pdfjs) pra rodar igual no browser e num harness de teste em Node.
//
// Layout (confirmado nos 4 PDFs reais): 2 colunas. Esquerda = proventos
// (valor em x≈264), direita = descontos (valor em x≈561), calha em x≈300.

import { mapCodigo, type CodeGroup } from "./relacao-calculo-codes";

const GUTTER_X = 300; // separa coluna esquerda (proventos) da direita (descontos)

export interface ExtractedItem {
  x: number;
  str: string;
}
export interface ExtractedLine {
  page: number;
  items: ExtractedItem[];
  text: string;
}

export interface ParsedEntry {
  codigo: string;
  descricao: string;
  /** Magnitude (sempre positiva). */
  value: number;
  side: "provento" | "desconto";
  group: CodeGroup;
  entryType: string | null;
  label: string;
}

export interface ParsedCollaborator {
  func: string;
  name: string;
  admissionDate: string | null; // YYYY-MM-DD
  salary: number | null;
  depIR: number;
  depSF: number;
  deducaoIR: number;
  situacao: string | null;
  entries: ParsedEntry[];
  totals: { proventos: number; vantagens: number; descontos: number; liquido: number } | null;
  bases: { irrf: number | null; inss: number | null; fgtsBase: number | null; fgtsValor: number | null };
  planoSaude: { person: string; mensalidade: number }[];
  hasRescisao: boolean;
}

export interface ParsedFolha {
  collaborators: ParsedCollaborator[];
  warnings: string[];
}

// ── helpers numéricos ─────────────────────────────────────────────────────────
const MONEY_RE = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;

function isMoney(s: string): boolean {
  return MONEY_RE.test(s.trim());
}

function parseMoney(s: string): number {
  return Number(s.trim().replace(/\./g, "").replace(",", "."));
}

// Coluna de referência (qtd/%/horas) que precede o valor — NÃO faz parte da
// descrição. Só casa tokens PUROS de referência ("6,00 %", "220:00 hs", "30,00"),
// preservando descrições que contêm "%" como "Vale Transporte (%)".
function isReference(s: string): boolean {
  const t = s.trim();
  if (isMoney(t)) return true;
  if (/^\d{1,3}([.,]\d{2})?\s*%$/.test(t)) return true; // 6,00 % | 30,00 %
  if (/^\d{1,3}:\d{2}(\s*hs)?$/.test(t)) return true; // 220:00 hs
  if (/^\d{1,3}(,\d{2})?\s*hs$/.test(t)) return true;
  return false;
}

function parseDateBR(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Extrai um lançamento de um lado (esquerda ou direita) da linha.
// Formato: <código(1-4 díg)> <tipo(1 díg)> <descrição...> [referência] <valor money>
function parseEntrySide(items: ExtractedItem[]): { codigo: string; descricao: string; value: number } | null {
  if (items.length < 3) return null;
  const codigo = items[0].str.trim();
  const tipo = items[1].str.trim();
  if (!/^\d{1,4}$/.test(codigo)) return null;
  if (!/^\d$/.test(tipo)) return null;

  // valor = último item do lado que é dinheiro puro
  let valueIdx = -1;
  for (let i = items.length - 1; i >= 2; i--) {
    if (isMoney(items[i].str)) {
      valueIdx = i;
      break;
    }
  }
  if (valueIdx === -1) return null;
  const value = parseMoney(items[valueIdx].str);

  // descrição = itens entre tipo e valor que não são coluna de referência
  const descParts: string[] = [];
  for (let i = 2; i < valueIdx; i++) {
    const s = items[i].str.trim();
    if (isReference(s)) continue;
    descParts.push(s);
  }
  return { codigo, descricao: descParts.join(" ").replace(/\s+/g, " ").trim(), value };
}

const BLOCK_TERMINATORS = [
  /^Total Organograma/i,
  /^Resumos Gerais/i,
  /^Total Empresa/i,
  /^Resumo Contrato/i,
];

function isFuncHeader(text: string): boolean {
  return /^Func:\s*\d+/.test(text);
}

function parseFuncHeader(text: string) {
  const func = text.match(/^Func:\s*(\d+)/)?.[1] ?? "";
  const name = text.match(/^Func:\s*\d+\s+(.+?)\s+Adm\b/)?.[1]?.trim() ?? "";
  const admissionDate = parseDateBR(text.match(/Adm\s+(\d{2}\/\d{2}\/\d{4})/)?.[1]);
  const depIR = Number(text.match(/Dep\.IR:\s*(\d+)/)?.[1] ?? 0);
  const depSF = Number(text.match(/Dep\.SF:\s*(\d+)/)?.[1] ?? 0);
  const deducaoIR = parseMoney((text.match(/Dedução IR\.?:\s*([\d.,]+)/)?.[1] ?? "0,00"));
  return { func, name, admissionDate, depIR, depSF, deducaoIR };
}

export function parseRelacaoCalculo(lines: ExtractedLine[]): ParsedFolha {
  const collaborators: ParsedCollaborator[] = [];
  const warnings: string[] = [];

  // Quebra em blocos por colaborador (Func: … até o próximo Func/terminador).
  let current: ExtractedLine[] | null = null;
  const blocks: ExtractedLine[][] = [];
  for (const line of lines) {
    if (isFuncHeader(line.text)) {
      if (current) blocks.push(current);
      current = [line];
      continue;
    }
    if (current) {
      if (BLOCK_TERMINATORS.some((re) => re.test(line.text))) {
        blocks.push(current);
        current = null;
        continue;
      }
      current.push(line);
    }
  }
  if (current) blocks.push(current);

  for (const block of blocks) {
    const headerText = block[0].text;
    const head = parseFuncHeader(headerText);
    if (!head.name) {
      warnings.push(`Bloco Func sem nome reconhecível: "${headerText.slice(0, 60)}"`);
    }

    const collab: ParsedCollaborator = {
      ...head,
      salary: null,
      situacao: null,
      entries: [],
      totals: null,
      bases: { irrf: null, inss: null, fgtsBase: null, fgtsValor: null },
      planoSaude: [],
      hasRescisao: false,
    };

    let inPlanoBox = false;
    for (const line of block) {
      const t = line.text;

      // Cargo / salário / situação
      if (/Sal[aá]rio:\s*[\d.,]/.test(t) && collab.salary === null) {
        collab.salary = parseMoney(t.match(/Sal[aá]rio:\s*([\d.,]+)/)![1]);
        collab.situacao = t.match(/Situa[cç][aã]o:\s*([\wÀ-ÿ]+)/)?.[1] ?? collab.situacao;
      }

      // Totais
      const tot = t.match(
        /Proventos:\s*([\d.,]+)\s*Vantagens:\s*([\d.,]+)\s*Descontos:\s*([\d.,]+)\s*L[ií]quido:\s*([\d.,]+)/,
      );
      if (tot && !collab.totals) {
        collab.totals = {
          proventos: parseMoney(tot[1]),
          vantagens: parseMoney(tot[2]),
          descontos: parseMoney(tot[3]),
          liquido: parseMoney(tot[4]),
        };
      }

      // Bases de imposto
      const irrfBase = t.match(/^IRRF\s+([\d.,]+)/);
      if (irrfBase && collab.bases.irrf === null) collab.bases.irrf = parseMoney(irrfBase[1]);
      const inssBase = t.match(/^INSS\s+([\d.,]+)/);
      if (inssBase && collab.bases.inss === null) collab.bases.inss = parseMoney(inssBase[1]);
      const fgtsGfip = t.match(/FGTS GFIP\s+([\d.,]+)\s+([\d.,]+)/);
      if (fgtsGfip && collab.bases.fgtsBase === null) {
        collab.bases.fgtsBase = parseMoney(fgtsGfip[1]);
        collab.bases.fgtsValor = parseMoney(fgtsGfip[2]);
      }

      // Caixa "Plano de Saúde" (Dados Adicionais): linhas "<pessoa> Mensalidade <m> <f> <total>"
      if (/Tipo\s+Despesa\s+Mensal/i.test(t)) {
        inPlanoBox = true;
        continue;
      }
      if (inPlanoBox) {
        if (/^Total\b/i.test(t)) {
          inPlanoBox = false;
        } else {
          const pm = t.match(/^(.+?)\s+Mensalidade\s+([\d.,]+)/);
          if (pm) collab.planoSaude.push({ person: pm[1].trim(), mensalidade: parseMoney(pm[2]) });
        }
      }

      // Lançamentos (esquerda/direita por coluna)
      const left = line.items.filter((i) => i.x < GUTTER_X).sort((a, b) => a.x - b.x);
      const right = line.items.filter((i) => i.x >= GUTTER_X).sort((a, b) => a.x - b.x);
      for (const [side, segItems] of [
        ["provento", left],
        ["desconto", right],
      ] as const) {
        const parsed = parseEntrySide(segItems);
        if (!parsed) continue;
        const mp = mapCodigo(parsed.codigo, parsed.descricao);
        if (mp.group === "rescisao") collab.hasRescisao = true;
        collab.entries.push({
          codigo: parsed.codigo,
          descricao: parsed.descricao || mp.label,
          value: parsed.value,
          side,
          group: mp.group,
          entryType: mp.entryType,
          label: mp.label,
        });
      }
    }

    collaborators.push(collab);
  }

  return { collaborators, warnings };
}
