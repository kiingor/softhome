import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface PayrollEntry {
  collaborator_name: string;
  type: string;
  value: number;
  description?: string | null;
}

interface ExportData {
  companyName: string;
  period: string;
  entries: PayrollEntry[];
  totals: { type: string; total: number }[];
  grandTotal: number;
}

const typeLabels: Record<string, string> = {
  salario: "Salário",
  vale: "Vale",
  custo: "Custo",
  despesa: "Despesa",
  adicional: "Adicional",
};

export const exportToPDF = (data: ExportData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Folha de Pagamento", pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Empresa: ${data.companyName}`, 14, 35);
  doc.text(`Competência: ${data.period}`, 14, 42);
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 49);

  // Entries table
  const tableData = data.entries.map((entry) => [
    entry.collaborator_name,
    typeLabels[entry.type] || entry.type,
    entry.description || "-",
    entry.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  ]);

  autoTable(doc, {
    startY: 60,
    head: [["Colaborador", "Tipo", "Descrição", "Valor"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 30 },
      2: { cellWidth: 60 },
      3: { cellWidth: 35, halign: "right" },
    },
  });

  // Totals section
  const finalY = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo por Tipo", 14, finalY);

  const totalsData = data.totals.map((t) => [
    typeLabels[t.type] || t.type,
    t.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  ]);

  totalsData.push([
    "TOTAL GERAL",
    data.grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  ]);

  autoTable(doc, {
    startY: finalY + 5,
    head: [["Tipo", "Total"]],
    body: totalsData,
    theme: "grid",
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 10 },
    columnStyles: {
      1: { halign: "right", fontStyle: "bold" },
    },
  });

  // Download
  const fileName = `relatorio_folha_${data.period.replace("/", "_")}.pdf`;
  doc.save(fileName);
};

export const exportToExcel = (data: ExportData) => {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Main data sheet
  const wsData = [
    ["Relatório de Folha de Pagamento"],
    [`Empresa: ${data.companyName}`],
    [`Competência: ${data.period}`],
    [`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`],
    [],
    ["Colaborador", "Tipo", "Descrição", "Valor"],
    ...data.entries.map((entry) => [
      entry.collaborator_name,
      typeLabels[entry.type] || entry.type,
      entry.description || "-",
      entry.value,
    ]),
    [],
    ["RESUMO POR TIPO"],
    ["Tipo", "Total"],
    ...data.totals.map((t) => [typeLabels[t.type] || t.type, t.total]),
    ["TOTAL GERAL", data.grandTotal],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 40 }, { wch: 15 }];

  XLSX.utils.book_append_sheet(wb, ws, "Relatório");

  // Download
  const fileName = `relatorio_folha_${data.period.replace("/", "_")}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

export const groupEntriesByCollaborator = (
  entries: any[]
): Map<string, { collaborator: any; entries: any[]; total: number }> => {
  const grouped = new Map<string, { collaborator: any; entries: any[]; total: number }>();

  entries.forEach((entry) => {
    const collabId = entry.collaborator_id;
    const collabName = entry.collaborator?.name || "Sem colaborador";

    if (!grouped.has(collabId)) {
      grouped.set(collabId, {
        collaborator: { id: collabId, name: collabName },
        entries: [],
        total: 0,
      });
    }

    const group = grouped.get(collabId)!;
    group.entries.push(entry);
    group.total += Number(entry.value);
  });

  return grouped;
};
