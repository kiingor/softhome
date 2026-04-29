// Export Excel da folha mensal pra o contador.
// Decisão Q4 confirmada: 1 arquivo .xlsx por (CNPJ × regime).
// Cada arquivo: 1 linha por colaborador, colunas = tipos de lançamento + total.

import * as XLSX from "xlsx";
import { ENTRY_TYPE_LABELS, isEarning, isDeduction } from "../types";
import type {
  PayrollEntryWithCollaborator,
  PayrollPeriod,
} from "../types";
import { formatPeriodLabel } from "../types";

interface CollaboratorRow {
  nome: string;
  cpf: string;
  regime: string;
  totals: Record<string, number>;
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
}

function safeFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface ExportPayrollExcelOptions {
  period: PayrollPeriod;
  entries: PayrollEntryWithCollaborator[];
  companyName: string;
  cnpj?: string | null;
}

// Gera 1 arquivo Excel POR REGIME usado nos entries.
// Retorna número de arquivos baixados.
export function exportPayrollExcel(options: ExportPayrollExcelOptions): number {
  const { period, entries, companyName, cnpj } = options;

  // Agrupa entries por regime (do colaborador)
  const byRegime = new Map<string, PayrollEntryWithCollaborator[]>();
  for (const e of entries) {
    const regime = e.collaborator?.regime ?? "outro";
    const list = byRegime.get(regime) ?? [];
    list.push(e);
    byRegime.set(regime, list);
  }

  const periodLabel = formatPeriodLabel(period.reference_month);
  const periodKey = period.reference_month.substring(0, 7); // YYYY-MM
  const baseName = safeFilename(companyName);

  let filesGenerated = 0;

  for (const [regime, regimeEntries] of byRegime.entries()) {
    // Agrupa por colaborador
    const byCollab = new Map<string, CollaboratorRow>();

    for (const e of regimeEntries) {
      if (!e.collaborator) continue;
      const key = e.collaborator.id;
      const row = byCollab.get(key) ?? {
        nome: e.collaborator.name,
        cpf: e.collaborator.cpf,
        regime: e.collaborator.regime ?? "—",
        totals: {} as Record<string, number>,
        totalProventos: 0,
        totalDescontos: 0,
        liquido: 0,
      };
      const value = Number(e.value);
      row.totals[e.type] = (row.totals[e.type] ?? 0) + value;
      if (isEarning(e.type)) row.totalProventos += value;
      else if (isDeduction(e.type)) row.totalDescontos += value;
      // Lançamentos com valor negativo (estornos) já vão somar com sinal correto
      byCollab.set(key, row);
    }

    // Calcula líquido
    for (const row of byCollab.values()) {
      row.liquido = row.totalProventos - row.totalDescontos;
    }

    // Coluna de cada tipo de lançamento que apareceu
    const typesFound = new Set<string>();
    for (const row of byCollab.values()) {
      Object.keys(row.totals).forEach((t) => typesFound.add(t));
    }
    const typesArr = Array.from(typesFound).sort();

    // Headers da sheet
    const headers = [
      "Nome",
      "CPF",
      "Regime",
      ...typesArr.map((t) => ENTRY_TYPE_LABELS[t] ?? t),
      "Total Proventos",
      "Total Descontos",
      "Líquido",
    ];

    // Body
    const body = Array.from(byCollab.values())
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map((row) => [
        row.nome,
        row.cpf,
        row.regime,
        ...typesArr.map((t) => row.totals[t] ?? 0),
        row.totalProventos,
        row.totalDescontos,
        row.liquido,
      ]);

    // Cabeçalho com info do período (linhas extras antes)
    const aoa: (string | number)[][] = [
      [`Folha ${periodLabel}`],
      [`Empresa: ${companyName}${cnpj ? ` (CNPJ ${cnpj})` : ""}`],
      [`Regime: ${regime.toUpperCase()}`],
      [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
      [],
      headers,
      ...body,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Largura mínima das colunas
    const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, regime.toUpperCase().substring(0, 31));

    const filename = `${baseName}_${regime.toUpperCase()}_${periodKey}.xlsx`;
    XLSX.writeFile(wb, filename);
    filesGenerated++;
  }

  return filesGenerated;
}
