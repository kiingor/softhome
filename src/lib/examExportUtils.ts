import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { EXAM_TYPE_LABELS, EXAM_STATUS_LABELS } from "./riskGroupDefaults";

interface ExamExportEntry {
  collaborator_name: string;
  exam_type: string;
  status: string;
  risk_group: string | null;
  due_date: string;
  scheduled_date: string | null;
  completed_date: string | null;
  has_aso: boolean;
}

interface ExamExportData {
  companyName: string;
  companyCnpj?: string;
  logoUrl?: string;
  entries: ExamExportEntry[];
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "-";

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
  } catch { return null; }
};

export const exportExamsToPDF = async (data: ExamExportData) => {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 10;

  if (data.logoUrl) {
    const logoBase64 = await loadImageAsBase64(data.logoUrl);
    if (logoBase64) {
      try { doc.addImage(logoBase64, "PNG", margin, y, 16, 16); } catch {}
    }
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(data.companyName, margin + 19, y + 5);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  if (data.companyCnpj) doc.text(`CNPJ: ${data.companyCnpj}`, margin + 19, y + 10);
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth - margin, y + 5, { align: "right" });

  y += 18;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório de Exames Ocupacionais", pageWidth / 2, y, { align: "center" });
  y += 8;

  const tableData = data.entries.map((e) => [
    e.collaborator_name,
    EXAM_TYPE_LABELS[e.exam_type] || e.exam_type,
    EXAM_STATUS_LABELS[e.status] || e.status,
    e.risk_group || "-",
    formatDate(e.due_date),
    formatDate(e.scheduled_date),
    formatDate(e.completed_date),
    e.has_aso ? "Sim" : "Não",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Colaborador", "Tipo", "Status", "Grupo Risco", "Data Limite", "Agendado", "Realizado", "ASO"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 8 },
  });

  doc.save(`exames_ocupacionais_${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const exportExamsToExcel = (data: ExamExportData) => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["Relatório de Exames Ocupacionais"],
    [`Empresa: ${data.companyName}`],
    [`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`],
    [],
    ["Colaborador", "Tipo", "Status", "Grupo de Risco", "Data Limite", "Data Agendada", "Data Realizada", "ASO Enviado"],
    ...data.entries.map((e) => [
      e.collaborator_name,
      EXAM_TYPE_LABELS[e.exam_type] || e.exam_type,
      EXAM_STATUS_LABELS[e.status] || e.status,
      e.risk_group || "-",
      formatDate(e.due_date),
      formatDate(e.scheduled_date),
      formatDate(e.completed_date),
      e.has_aso ? "Sim" : "Não",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, "Exames");
  XLSX.writeFile(wb, `exames_ocupacionais_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
