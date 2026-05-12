import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { BonusEntryWithCollaborator, BonusPayment } from "../lib/bonus-types";

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function fmtCPF(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

interface ReceiptOptions {
  entry: BonusEntryWithCollaborator;
  year: number;
  payments: BonusPayment[];
  companyName: string;
  companyCnpj?: string | null;
}

export function generateBonusReceiptPdf({
  entry,
  year,
  payments,
  companyName,
  companyCnpj,
}: ReceiptOptions): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Recibo de 13º Salário", 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Ano-base: ${year}`, 105, 27, { align: "center" });

  // Empresa
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Empregador", 20, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(companyName, 20, 46);
  if (companyCnpj) {
    doc.text(`CNPJ: ${companyCnpj}`, 20, 52);
  }

  // Colaborador
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Beneficiário", 20, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(entry.collaborator.name, 20, 70);
  doc.text(`CPF: ${fmtCPF(entry.collaborator.cpf)}`, 20, 76);
  if (entry.collaborator.position) {
    doc.text(`Cargo: ${entry.collaborator.position}`, 20, 82);
  }
  if (entry.collaborator.admission_date) {
    doc.text(`Admissão: ${fmtDate(entry.collaborator.admission_date)}`, 20, 88);
  }

  // Cálculo
  autoTable(doc, {
    startY: 98,
    head: [["Composição", "Valor"]],
    body: [
      ["Salário base", fmtBRL(Number(entry.base_salary))],
      ["Soma de gratificações no ano", fmtBRL(Number(entry.gratificacao_sum))],
      ["Adicional mensal", fmtBRL(Number(entry.adicional_monthly))],
      ["Meses trabalhados", String(entry.months_worked)],
      [
        { content: "Valor bruto do 13º", styles: { fontStyle: "bold" } },
        {
          content: fmtBRL(Number(entry.gross_value)),
          styles: { fontStyle: "bold" },
        },
      ],
    ],
    headStyles: { fillColor: [249, 115, 22] },
    styles: { fontSize: 10 },
  });

  // Pagamentos
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY ?? 140;

  if (payments.length > 0) {
    autoTable(doc, {
      startY: finalY + 8,
      head: [["Parcela", "Valor", "Pago em"]],
      body: payments.map((p) => [
        p.installment === "first"
          ? "1ª parcela"
          : p.installment === "second"
          ? "2ª parcela"
          : "Pagamento único",
        fmtBRL(Number(p.amount)),
        fmtDate(p.paid_at),
      ]),
      headStyles: { fillColor: [249, 115, 22] },
      styles: { fontSize: 10 },
    });
  }

  // Rodapé
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Recibo gerado por SoftHouse — sistema interno de Gente & Cultura da Softcom.",
    105,
    pageHeight - 20,
    { align: "center" },
  );
  doc.text(
    `Documento gerado em ${new Date().toLocaleString("pt-BR")}`,
    105,
    pageHeight - 15,
    { align: "center" },
  );

  // Espaço para assinatura
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(
    "________________________________________",
    105,
    pageHeight - 40,
    { align: "center" },
  );
  doc.text("Assinatura do beneficiário", 105, pageHeight - 34, {
    align: "center",
  });

  return doc;
}

export async function fetchBonusReceiptData(entryId: string): Promise<{
  entry: BonusEntryWithCollaborator;
  year: number;
  payments: BonusPayment[];
  companyName: string;
  companyCnpj: string | null;
} | null> {
  const { data: entry, error: entryErr } = await supabase
    .from("bonus_entries")
    .select(
      "*, collaborator:collaborators(id, name, cpf, email, position, admission_date, status, company_id), period:bonus_periods(year, company_id)",
    )
    .eq("id", entryId)
    .single();
  if (entryErr || !entry) return null;

  const { data: payments } = await supabase
    .from("bonus_payments")
    .select("*")
    .eq("entry_id", entryId)
    .order("installment");

  const companyId = (entry.period as { company_id: string } | null)?.company_id;
  let companyName = "Softcom";
  let companyCnpj: string | null = null;
  if (companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("name, cnpj")
      .eq("id", companyId)
      .maybeSingle();
    if (company) {
      companyName = company.name;
      companyCnpj = company.cnpj ?? null;
    }
  }

  return {
    entry: entry as unknown as BonusEntryWithCollaborator,
    year: (entry.period as { year: number } | null)?.year ?? new Date().getFullYear(),
    payments: (payments ?? []) as BonusPayment[],
    companyName,
    companyCnpj,
  };
}

export async function downloadBonusReceipt(entryId: string): Promise<void> {
  const data = await fetchBonusReceiptData(entryId);
  if (!data) {
    throw new Error("Não consegui carregar os dados do recibo.");
  }
  const doc = generateBonusReceiptPdf(data);
  const safeName = data.entry.collaborator.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
  doc.save(`recibo-13o-${data.year}-${safeName}.pdf`);
}
