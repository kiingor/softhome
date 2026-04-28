// Exportação de conquistas (insígnias) da Jornada de Conhecimento.
//
// Gera arquivos Excel (.xlsx) e PDF (.pdf) no cliente — sem armazenar
// nada server-side. Mesma estética dos exporters de exames/folha
// (`src/lib/examExportUtils.ts`, `src/lib/exportUtils.ts`):
// jspdf + jspdf-autotable pro PDF, SheetJS pro Excel, com download
// disparado via `XLSX.writeFile` / `doc.save` (built-in do jspdf,
// não precisa de file-saver).
//
// LGPD: as planilhas geradas listam nomes de colaboradores e datas
// de conquista. Não inclui CPF, email ou outros campos sensíveis.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { BADGE_CATEGORY_LABELS, type Badge, type CollaboratorBadge } from "../types";

interface CollaboratorLite {
  id: string;
  name: string;
}

const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";

const formatDateTime = (d: Date) =>
  d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const buildIndexes = (badges: Badge[], collaborators: CollaboratorLite[]) => {
  const badgeById = new Map(badges.map((b) => [b.id, b]));
  const collabById = new Map(collaborators.map((c) => [c.id, c]));
  return { badgeById, collabById };
};

interface CollaboratorTotalRow {
  name: string;
  total: number;
  weighted: number;
  latest: string | null;
  earliest: string | null;
}

const computeCollaboratorTotals = (
  assignments: CollaboratorBadge[],
  badges: Badge[],
  collaborators: CollaboratorLite[]
): CollaboratorTotalRow[] => {
  const { badgeById, collabById } = buildIndexes(badges, collaborators);
  const byCollab = new Map<string, CollaboratorTotalRow>();

  for (const a of assignments) {
    const collab = collabById.get(a.collaborator_id) ?? a.collaborator;
    const name = collab?.name ?? "(colaborador removido)";
    const badge = a.badge ?? badgeById.get(a.badge_id);
    const weight = badge?.weight ?? 0;

    const row =
      byCollab.get(a.collaborator_id) ??
      ({
        name,
        total: 0,
        weighted: 0,
        latest: null,
        earliest: null,
      } as CollaboratorTotalRow);

    row.total += 1;
    row.weighted += weight;
    if (!row.latest || a.awarded_at > row.latest) row.latest = a.awarded_at;
    if (!row.earliest || a.awarded_at < row.earliest) row.earliest = a.awarded_at;

    byCollab.set(a.collaborator_id, row);
  }

  return Array.from(byCollab.values()).sort((a, b) => b.total - a.total);
};

const sortChronological = (assignments: CollaboratorBadge[]) =>
  [...assignments].sort((a, b) => (a.awarded_at < b.awarded_at ? 1 : -1));

const fileSuffix = () => new Date().toISOString().slice(0, 10);

export const exportJourneyExcel = (
  assignments: CollaboratorBadge[],
  badges: Badge[],
  collaborators: CollaboratorLite[],
  companyName: string
) => {
  const { badgeById, collabById } = buildIndexes(badges, collaborators);
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Conquistas (cronológico, mais recente primeiro)
  const conquistasHeader = [
    ["Relatório de Conquistas — Jornada de Conhecimento"],
    [`Empresa: ${companyName}`],
    [`Gerado em: ${formatDateTime(new Date())}`],
    [`Total de conquistas: ${assignments.length}`],
    [],
    ["Data", "Colaborador", "Insígnia", "Categoria", "Peso", "Evidência", "Observações"],
  ];

  const conquistasRows = sortChronological(assignments).map((a) => {
    const badge = a.badge ?? badgeById.get(a.badge_id);
    const collab = a.collaborator ?? collabById.get(a.collaborator_id);
    return [
      formatDate(a.awarded_at),
      collab?.name ?? "(colaborador removido)",
      badge?.name ?? "(insígnia removida)",
      badge ? BADGE_CATEGORY_LABELS[badge.category] : "-",
      badge?.weight ?? "-",
      a.evidence ?? "-",
      a.notes ?? "-",
    ];
  });

  const conquistasWs = XLSX.utils.aoa_to_sheet([...conquistasHeader, ...conquistasRows]);
  conquistasWs["!cols"] = [
    { wch: 12 }, // data
    { wch: 30 }, // colaborador
    { wch: 28 }, // insígnia
    { wch: 18 }, // categoria
    { wch: 8 }, // peso
    { wch: 40 }, // evidência
    { wch: 40 }, // observações
  ];
  XLSX.utils.book_append_sheet(wb, conquistasWs, "Conquistas");

  // Sheet 2 — Por colaborador (totais, ordenado por contagem desc)
  const totals = computeCollaboratorTotals(assignments, badges, collaborators);
  const porColabHeader = [
    ["Resumo por Colaborador"],
    [`Empresa: ${companyName}`],
    [`Gerado em: ${formatDateTime(new Date())}`],
    [],
    [
      "Colaborador",
      "Total de insígnias",
      "Peso acumulado",
      "Última conquista",
      "Primeiro reconhecimento",
    ],
  ];
  const porColabRows = totals.map((t) => [
    t.name,
    t.total,
    t.weighted,
    formatDate(t.latest),
    formatDate(t.earliest),
  ]);
  const porColabWs = XLSX.utils.aoa_to_sheet([...porColabHeader, ...porColabRows]);
  porColabWs["!cols"] = [
    { wch: 32 }, // nome
    { wch: 18 }, // total
    { wch: 16 }, // peso
    { wch: 18 }, // última
    { wch: 22 }, // primeiro
  ];
  XLSX.utils.book_append_sheet(wb, porColabWs, "Por colaborador");

  XLSX.writeFile(wb, `jornada_conquistas_${fileSuffix()}.xlsx`);
};

export const exportJourneyPDF = (
  assignments: CollaboratorBadge[],
  badges: Badge[],
  collaborators: CollaboratorLite[],
  companyName: string
) => {
  const { badgeById, collabById } = buildIndexes(badges, collaborators);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const generatedAt = formatDateTime(new Date());

  // Header — wordmark SoftHome (texto, sem imagem) + empresa + data
  let y = 12;

  // Símbolo emerald antes do wordmark (círculo simples, mantém o
  // padrão "[●] SoftHome" da seção 5 do DESIGN_SYSTEM.md sem custo
  // de carregar SVG/PNG)
  doc.setFillColor(16, 185, 129); // emerald-500 (#10b981)
  doc.circle(margin + 2, y + 2, 2, "F");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("SoftHome", margin + 7, y + 3);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(companyName, pageWidth - margin, y, { align: "right" });
  doc.text(`Gerado em: ${generatedAt}`, pageWidth - margin, y + 5, { align: "right" });

  y += 10;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Jornada de Conhecimento — Conquistas", pageWidth / 2, y, { align: "center" });
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(
    `${assignments.length} conquistas registradas`,
    pageWidth / 2,
    y,
    { align: "center" }
  );
  doc.setTextColor(0, 0, 0);
  y += 6;

  // Table 1 — lista cronológica de conquistas
  const sortedAssignments = sortChronological(assignments);
  const conquistasBody = sortedAssignments.map((a) => {
    const badge = a.badge ?? badgeById.get(a.badge_id);
    const collab = a.collaborator ?? collabById.get(a.collaborator_id);
    return [
      formatDate(a.awarded_at),
      collab?.name ?? "(colaborador removido)",
      badge?.name ?? "(insígnia removida)",
      badge ? BADGE_CATEGORY_LABELS[badge.category] : "-",
      String(badge?.weight ?? "-"),
      a.evidence ?? "-",
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Data", "Colaborador", "Insígnia", "Categoria", "Peso", "Evidência"]],
    body: conquistasBody.length > 0 ? conquistasBody : [["—", "—", "—", "—", "—", "—"]],
    theme: "striped",
    headStyles: { fillColor: [16, 185, 129] }, // emerald-500
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 38 },
      2: { cellWidth: 38 },
      3: { cellWidth: 24 },
      4: { cellWidth: 12, halign: "right" },
      5: { cellWidth: "auto" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextY = (doc as any).lastAutoTable?.finalY ?? y;
  nextY += 8;

  // Quebra de página se faltar espaço pra próxima seção
  if (nextY > pageHeight - 50) {
    doc.addPage();
    nextY = 20;
  }

  // Table 2 — ranking por colaborador
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Ranking por colaborador", margin, nextY);
  nextY += 4;

  const totals = computeCollaboratorTotals(assignments, badges, collaborators);
  const rankBody = totals.map((t, idx) => [
    String(idx + 1),
    t.name,
    String(t.total),
    String(t.weighted),
    formatDate(t.latest),
    formatDate(t.earliest),
  ]);

  autoTable(doc, {
    startY: nextY,
    head: [["#", "Colaborador", "Total", "Peso", "Última", "Primeira"]],
    body: rankBody.length > 0 ? rankBody : [["—", "—", "—", "—", "—", "—"]],
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129] },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 10, halign: "right" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 26 },
      5: { cellWidth: 26 },
    },
  });

  // Footer com paginação em todas as páginas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Gerado em ${generatedAt}`,
      margin,
      pageHeight - 8
    );
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: "right" }
    );
  }

  doc.save(`jornada_conquistas_${fileSuffix()}.pdf`);
};
