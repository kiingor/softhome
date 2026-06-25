// Export Excel da folha mensal pra o contador.
// 1 arquivo .xlsx com 1 ABA por regime (CLT, PJ, Estagiário...). Cada aba:
// 1 linha por colaborador, colunas = tipos de lançamento + totais + observação.
//
// IMPORTANTE: antes gerava 1 arquivo por regime num loop de XLSX.writeFile, mas
// o navegador só entrega UM download por gesto do usuário — então só o último
// regime baixava (o RH via "só estagiário"). Agora é um único workbook com abas.

import * as XLSX from "xlsx";
import { ENTRY_TYPE_LABELS, isEarning, isDeduction } from "../types";
import type {
  PayrollEntryWithCollaborator,
  PayrollPeriod,
} from "../types";
import { formatPeriodLabel } from "../types";

interface CollaboratorRow {
  id: string;
  nome: string;
  cpf: string;
  regime: string;
  totals: Record<string, number>;
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  observacao: string;
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
  /** Observações da conferência por colaborador (collaborator_id → texto). */
  observationByCollab?: Map<string, string>;
}

// Gera UM arquivo Excel com 1 aba por regime. Recebe os entries JÁ filtrados
// (de acordo com o filtro selecionado na tela). Retorna o nº de colaboradores
// exportados (0 = nada a exportar).
export function exportPayrollExcel(options: ExportPayrollExcelOptions): number {
  const { period, entries, companyName, cnpj, observationByCollab } = options;

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

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  let totalCollabs = 0;

  // Regimes em ordem estável (abas determinísticas).
  const regimes = Array.from(byRegime.keys()).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  for (const regime of regimes) {
    const regimeEntries = byRegime.get(regime) ?? [];

    // Agrupa por colaborador
    const byCollab = new Map<string, CollaboratorRow>();
    for (const e of regimeEntries) {
      if (!e.collaborator) continue;
      const key = e.collaborator.id;
      const row = byCollab.get(key) ?? {
        id: key,
        nome: e.collaborator.name,
        cpf: e.collaborator.cpf,
        regime: e.collaborator.regime ?? "—",
        totals: {} as Record<string, number>,
        totalProventos: 0,
        totalDescontos: 0,
        liquido: 0,
        observacao: observationByCollab?.get(key) ?? "",
      };
      const value = Number(e.value);
      row.totals[e.type] = (row.totals[e.type] ?? 0) + value;
      if (isEarning(e.type)) row.totalProventos += value;
      else if (isDeduction(e.type)) row.totalDescontos += value;
      // Estornos (valor negativo) já somam com o sinal correto.
      byCollab.set(key, row);
    }

    if (byCollab.size === 0) continue;

    // Calcula líquido
    for (const row of byCollab.values()) {
      row.liquido = row.totalProventos - row.totalDescontos;
    }

    // Coluna de cada tipo de lançamento que apareceu neste regime
    const typesFound = new Set<string>();
    for (const row of byCollab.values()) {
      Object.keys(row.totals).forEach((t) => typesFound.add(t));
    }
    const typesArr = Array.from(typesFound).sort();

    const headers = [
      "Nome",
      "CPF",
      "Regime",
      ...typesArr.map((t) => ENTRY_TYPE_LABELS[t] ?? t),
      "Total Proventos",
      "Total Descontos",
      "Líquido",
      "Observação",
    ];

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
        row.observacao,
      ]);

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

    // Largura das colunas; Observação mais larga.
    const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
    if (colWidths.length > 0) colWidths[colWidths.length - 1] = { wch: 45 };
    ws["!cols"] = colWidths;

    // Nome de aba: regime, único e ≤ 31 chars (limite do Excel).
    let sheetName = (regime.toUpperCase().substring(0, 31) || "OUTRO");
    let suffix = 2;
    while (usedSheetNames.has(sheetName)) {
      sheetName = `${regime.toUpperCase().substring(0, 28)}_${suffix++}`;
    }
    usedSheetNames.add(sheetName);

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    totalCollabs += byCollab.size;
  }

  if (totalCollabs === 0) return 0;

  const filename = `${baseName}_folha_${periodKey}.xlsx`;
  XLSX.writeFile(wb, filename);
  return totalCollabs;
}
