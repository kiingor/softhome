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
  companyCnpj?: string;
  period: string;
  entries: PayrollEntry[];
  totals: { type: string; total: number }[];
  grandTotal: number;
  logoUrl?: string;
}

const typeLabels: Record<string, string> = {
  salario: "Salário",
  vale: "Vale",
  custo: "Custo",
  despesa: "Despesa",
  adicional: "Adicional",
   inss: "INSS",
   fgts: "FGTS",
   irpf: "IRPF",
};

const deductionTypes = ["inss", "irpf", "despesa", "vale", "custo"];
const earningsTypes = ["salario", "adicional", "beneficio"];

// Helper to load image as base64
const loadImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const formatValueWithSign = (value: number, type: string): string => {
  const formatted = value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (deductionTypes.includes(type) || type === "fgts") return `- ${formatted}`;
  return `+ ${formatted}`;
};

export const exportToPDF = async (data: ExportData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  let y = 10;

  // ============ HEADER: Logo + Company info left | Period info right ============
  let logoWidth = 0;
  if (data.logoUrl) {
    const logoBase64 = await loadImageAsBase64(data.logoUrl);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", margin, y, 16, 16);
        logoWidth = 19;
      } catch (e) {
        console.error("Error adding logo to PDF:", e);
      }
    }
  }

  // Left side: company info
  const textX = margin + logoWidth;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(data.companyName, textX, y + 5);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  if (data.companyCnpj) {
    doc.text(`CNPJ: ${data.companyCnpj}`, textX, y + 10);
  }

  // Right side: period info
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(`Competência: ${data.period}`, pageWidth - margin, y + 5, { align: "right" });
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth - margin, y + 10, { align: "right" });

  y += 18;

  // Separator line
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Report title centered
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Folha de Pagamento", pageWidth / 2, y, { align: "center" });
  y += 8;

  // Group entries by collaborator
  const grouped = new Map<string, PayrollEntry[]>();
  data.entries.forEach((entry) => {
    const name = entry.collaborator_name;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name)!.push(entry);
  });

  let currentY = 60;

  // Per-collaborator sections
  let grandEarnings = 0;
  let grandDeductions = 0;
  let grandFgts = 0;

  for (const [collabName, collabEntries] of grouped) {
    // Check page space
    if (currentY > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      currentY = 20;
    }

    // Collaborator subtitle
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(collabName, 14, currentY);
    currentY += 3;

    // Table data with signs
    const tableData = collabEntries.map((entry) => [
      typeLabels[entry.type] || entry.type,
      entry.description || "-",
      formatValueWithSign(entry.value, entry.type),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Tipo", "Descrição", "Valor"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [99, 102, 241] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 90 },
        2: { cellWidth: 40, halign: "right" },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 2) {
          const text = String(hookData.cell.raw || "");
          if (text.startsWith("-")) {
            hookData.cell.styles.textColor = [220, 38, 38];
          } else if (text.startsWith("+")) {
            hookData.cell.styles.textColor = [22, 163, 74];
          }
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 3;

    // Calculate collaborator totals
    let earnings = 0;
    let deductions = 0;
    let fgts = 0;
    collabEntries.forEach((e) => {
      const v = Number(e.value);
      if (e.type === "fgts") fgts += v;
      else if (deductionTypes.includes(e.type)) deductions += v;
      else earnings += v;
    });
    const net = earnings - deductions;

    grandEarnings += earnings;
    grandDeductions += deductions;
    grandFgts += fgts;

    // Collaborator summary line
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const summary = `Proventos: R$ ${earnings.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}  |  Descontos: R$ ${deductions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}  |  Líquido: R$ ${net.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${fgts > 0 ? `  |  FGTS: R$ ${fgts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}`;
    doc.text(summary, 14, currentY);
    currentY += 10;
  }

  // Grand total section
  if (currentY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    currentY = 20;
  }

  const grandNet = grandEarnings - grandDeductions;
  const grandCost = grandNet + grandFgts;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL GERAL", 14, currentY);
  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    head: [["Proventos", "Descontos", "Líquido", "FGTS", "Custo Total"]],
    body: [[
      `R$ ${grandEarnings.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `R$ ${grandDeductions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `R$ ${grandNet.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `R$ ${grandFgts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      `R$ ${grandCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    ]],
    theme: "grid",
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "right" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
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
