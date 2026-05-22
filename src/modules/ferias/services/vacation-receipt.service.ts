// Gerador de PDF do Recibo de Férias.
// Layout segue o modelo Softcom (sistema legado). 1 página A4.
//
// Buscas auto-suficientes: a função aceita só o requestId e resolve tudo
// (colab, company, period, snapshot) via Supabase. Pra usar:
//   const doc = await generateVacationReceiptPdf({ requestId });
//   doc.save(`Ferias_${nome}.pdf`);

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { calcVacation, type VacationCalcResult } from "@/lib/payroll/vacationCalc";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatação
// ─────────────────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtBRLnum = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(v);

const fmtDateBR = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

const fmtCPF = (cpf: string | null | undefined): string => {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

const fmtCNPJ = (cnpj: string | null | undefined): string => {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
};

const MONTH_NAMES_BR = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const fmtDateExtenso = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const dia = parseInt(m[3], 10);
  const mes = MONTH_NAMES_BR[parseInt(m[2], 10) - 1] ?? "";
  return `${dia} de ${mes} de ${m[1]}`;
};

const addDays = (iso: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Número por extenso (pt-BR) — simples, cobre até bilhões com centavos
// ─────────────────────────────────────────────────────────────────────────────

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_19 = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function numeroPorExtenso100(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let txt = "";
  if (c > 0) txt += CENTENAS[c];
  if (resto > 0) {
    if (txt) txt += " e ";
    if (resto < 10) txt += UNIDADES[resto];
    else if (resto < 20) txt += DEZ_19[resto - 10];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      txt += DEZENAS[d] + (u > 0 ? ` e ${UNIDADES[u]}` : "");
    }
  }
  return txt;
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  if (n < 0) return "menos " + inteiroPorExtenso(-n);

  const partes: string[] = [];
  const escalas: Array<[number, string, string]> = [
    [1_000_000_000, "bilhão", "bilhões"],
    [1_000_000, "milhão", "milhões"],
    [1_000, "mil", "mil"],
    [1, "", ""],
  ];

  for (const [divisor, sing, plur] of escalas) {
    const q = Math.floor(n / divisor);
    if (q > 0) {
      n -= q * divisor;
      const txt = numeroPorExtenso100(q);
      if (divisor === 1_000 && q === 1) partes.push("mil");
      else if (divisor === 1) partes.push(txt);
      else partes.push(`${txt} ${q === 1 ? sing : plur}`);
    }
  }
  return partes.join(partes.length > 1 ? " e " : "");
}

function valorPorExtenso(valor: number): string {
  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);
  const reaisTxt = inteiroPorExtenso(reais);
  const reaisLabel = reais === 1 ? "real" : "reais";
  let txt = `${reaisTxt} ${reaisLabel}`;
  if (centavos > 0) {
    const centTxt = inteiroPorExtenso(centavos);
    const centLabel = centavos === 1 ? "centavo" : "centavos";
    txt += ` e ${centTxt} ${centLabel}`;
  }
  return txt;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface GenerateOptions {
  requestId: string;
  /** Override do nome da empresa (default: pega do company_id da request). */
  companyName?: string;
  /** Override do CNPJ. */
  companyCnpj?: string;
  /** Cidade pra rodapé "Local, data". Default: "João Pessoa". */
  city?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gerador principal
// ─────────────────────────────────────────────────────────────────────────────

export async function generateVacationReceiptPdf(
  options: GenerateOptions,
): Promise<jsPDF> {
  const { requestId, city = "João Pessoa" } = options;

  // 1. Carrega request + colab + period
  const { data: req, error: reqErr } = await supabase
    .from("vacation_requests")
    .select(`
      id, company_id, collaborator_id, vacation_period_id,
      start_date, end_date, days_count, sell_days,
      calculation_snapshot, payment_date,
      vacation_period:vacation_periods(start_date, end_date, days_entitled, days_taken, days_sold)
    `)
    .eq("id", requestId)
    .single();
  if (reqErr || !req) throw new Error("Solicitação não encontrada");

  const { data: collab, error: collabErr } = await supabase
    .from("collaborators")
    .select(`
      id, name, cpf, admission_date, ctps, ctps_series, ctps_uf,
      current_salary, dependents_count, position,
      bank_account
    `)
    .eq("id", req.collaborator_id)
    .single();
  if (collabErr || !collab) throw new Error("Colaborador não encontrado");

  const { data: company } = await supabase
    .from("companies")
    .select("company_name, cnpj")
    .eq("id", req.company_id)
    .maybeSingle();

  const companyName =
    options.companyName ?? (company as { company_name?: string } | null)?.company_name ?? "—";
  const companyCnpj =
    options.companyCnpj ?? (company as { cnpj?: string | null } | null)?.cnpj ?? null;

  // 2. Resolve cálculo: snapshot se existir, senão calcula on-the-fly
  let calc: VacationCalcResult;
  const snapshot = req.calculation_snapshot as unknown as VacationCalcResult | null;
  if (snapshot && typeof snapshot === "object" && "liquido" in snapshot) {
    calc = snapshot;
  } else {
    const salary = Number((collab as { current_salary: number | null }).current_salary ?? 0);
    if (!(salary > 0)) {
      throw new Error("Sem snapshot e colaborador sem salário — não dá pra gerar recibo");
    }
    calc = calcVacation({
      salary,
      daysTaken: req.days_count as number,
      daysSold: (req.sell_days as number | null) ?? 0,
      dependents: Number((collab as { dependents_count: number | null }).dependents_count ?? 0),
    });
  }

  const vacPeriod = req.vacation_period as
    | { start_date: string; end_date: string; days_entitled: number; days_taken: number; days_sold: number }
    | null;

  // 3. Monta o PDF
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Header
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Recibo de Férias", pageW / 2, y + 5.5, { align: "center" });
  y += 10;

  // ── Empregador/Empregado ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentW, 5, "F");
  doc.text("Empregador/Empregado", margin + 1, y + 3.5);
  y += 6;

  // Linha 1: Empregador / CNPJ
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Empregador", margin + 1, y);
  doc.text("CNPJ/CNO", margin + contentW * 0.65, y);
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(companyName, margin + 1, y);
  doc.text(fmtCNPJ(companyCnpj), margin + contentW * 0.65, y);
  y += 5;

  // Linha 2: Empregado / CPF / Admissão / CTPS
  const ctpsFull = [
    (collab as { ctps?: string | null }).ctps ?? "",
    (collab as { ctps_series?: string | null }).ctps_series ?? "",
    (collab as { ctps_uf?: string | null }).ctps_uf ?? "",
  ].filter(Boolean).join(" ");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Empregado", margin + 1, y);
  doc.text("CPF", margin + contentW * 0.40, y);
  doc.text("Data de Admissão", margin + contentW * 0.58, y);
  doc.text("CTPS Série Estado", margin + contentW * 0.80, y);
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(collab.name, margin + 1, y);
  doc.text(fmtCPF(collab.cpf), margin + contentW * 0.40, y);
  doc.text(fmtDateBR(collab.admission_date), margin + contentW * 0.58, y);
  doc.text(ctpsFull || "—", margin + contentW * 0.80, y);
  y += 5;

  // Linha 3: Cargo / Salário base
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Cargo", margin + 1, y);
  doc.text("Salário Base", margin + contentW * 0.80, y);
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(collab.position ?? "—", margin + 1, y);
  doc.text(fmtBRLnum(calc.salary), margin + contentW * 0.80, y);
  y += 5;

  // ── Detalhamento ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, contentW, 5, "F");
  doc.text("Detalhamento", margin + 1, y + 3.5);
  y += 6;

  // Linha 1: Período Aquisitivo / Período Férias / Pagamento / Início
  const periodoAquis = vacPeriod
    ? `${fmtDateBR(vacPeriod.start_date)} à ${fmtDateBR(vacPeriod.end_date)}`
    : "—";
  const periodoFerias = `${fmtDateBR(req.start_date)} à ${fmtDateBR(req.end_date)}`;
  const pagamento = req.payment_date ? fmtDateBR(req.payment_date) : "—";
  const inicio = fmtDateBR(req.start_date);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Período Aquisitivo", margin + 1, y);
  doc.text("Período Férias", margin + contentW * 0.28, y);
  doc.text("Pagamento do Recibo", margin + contentW * 0.55, y);
  doc.text("Início Férias", margin + contentW * 0.78, y);
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(periodoAquis, margin + 1, y);
  doc.text(periodoFerias, margin + contentW * 0.28, y);
  doc.text(pagamento, margin + contentW * 0.55, y);
  doc.text(inicio, margin + contentW * 0.78, y);
  y += 5;

  // Linha 2: dias
  const diasDireito = vacPeriod?.days_entitled ?? 30;
  const diasFaltas = 0; // não modelado — placeholder
  const diasFerias = req.days_count as number;
  const diasAbono = (req.sell_days as number | null) ?? 0;
  const diasSaldo = Math.max(0, diasDireito - diasFerias - diasAbono);
  const retorno = addDays(req.end_date as string, 1);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  ["Dias Direito", "Dias Faltas", "Dias Férias", "Dias Abono", "Dias Saldo", "Retorno ao Trabalho"]
    .forEach((label, i) => {
      const xs = [0, 0.14, 0.28, 0.42, 0.56, 0.72];
      doc.text(label, margin + contentW * xs[i] + 1, y);
    });
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  [String(diasDireito), String(diasFaltas), String(diasFerias), String(diasAbono), String(diasSaldo), fmtDateBR(retorno)]
    .forEach((val, i) => {
      const xs = [0, 0.14, 0.28, 0.42, 0.56, 0.72];
      doc.text(val, margin + contentW * xs[i] + 1, y);
    });
  y += 6;

  // ── Descrição de Eventos (tabela) ──
  type EventoRow = [string, string, string, string, string]; // Evento | Descrição | Referência | Proventos | Descontos
  const rows: EventoRow[] = [];

  if (calc.valor_ferias > 0) {
    rows.push(["358", "Horas Férias Diurnas", `${calc.daysTaken} Dias`, fmtBRLnum(calc.valor_ferias), ""]);
  }
  if (calc.um_terco_ferias > 0) {
    rows.push(["386", "1/3 Sobre Férias", "33,33 %", fmtBRLnum(calc.um_terco_ferias), ""]);
  }
  if (calc.valor_abono > 0) {
    rows.push(["379", "Abono Pecuniário", `${calc.daysSold} Dias`, fmtBRLnum(calc.valor_abono), ""]);
  }
  if (calc.um_terco_abono > 0) {
    rows.push(["387", "1/3 Sobre Abono", "33,33 %", fmtBRLnum(calc.um_terco_abono), ""]);
  }
  // Gratificação proporcional aos dias gozados — entra na base de INSS/IRRF
  if (calc.gratificacao_valor > 0) {
    rows.push(["410", "Gratificação S/Férias", `${calc.daysTaken} Dias`, fmtBRLnum(calc.gratificacao_valor), ""]);
  }
  // Bonificação livre — entra no bruto sem 1/3 nem desconto
  if (calc.valor_bonificacao > 0) {
    rows.push(["420", "Bonificação S/Férias", "isenta", fmtBRLnum(calc.valor_bonificacao), ""]);
  }
  if (calc.irrf > 0) {
    rows.push(["1922", "IRRF S/Férias", "—", "", fmtBRLnum(calc.irrf)]);
  }
  if (calc.inss > 0) {
    rows.push(["1952", "INSS S/Férias", "—", "", fmtBRLnum(calc.inss)]);
  }

  const totalProventos = calc.bruto;
  const totalDescontos = calc.inss + calc.irrf;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Evento", "Descrição", "Referência", "Proventos", "Descontos"]],
    body: rows,
    foot: [
      ["", "", { content: "Totais", styles: { halign: "right", fontStyle: "bold" } }, { content: fmtBRLnum(totalProventos), styles: { halign: "right", fontStyle: "bold" } }, { content: fmtBRLnum(totalDescontos), styles: { halign: "right", fontStyle: "bold" } }],
      ["", "", "", { content: "Líquido", styles: { halign: "right", fontStyle: "bold" } }, { content: fmtBRLnum(calc.liquido), styles: { halign: "right", fontStyle: "bold", fillColor: [230, 230, 230] } }],
    ],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 16, halign: "center" },
      1: { cellWidth: 70 },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
    },
    theme: "grid",
  });

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  y = afterTableY + 6;

  // ── Texto de recibo + valor por extenso ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const valorTxt = valorPorExtenso(calc.liquido);
  const reciboTxt = `Recebi da empresa ${companyName}, a importância líquida de ${fmtBRL(calc.liquido)}, (${valorTxt}), que me é paga adiantadamente por motivo das minhas férias regulares, ora concedidas e que vou gozar de acordo com a descrição acima, tudo conforme o aviso que recebi em tempo, ao qual dei meu ciente. Para clareza e documento, firmo o presente recibo dando plena e geral quitação.`;
  const reciboLines = doc.splitTextToSize(reciboTxt, contentW);
  doc.text(reciboLines, margin, y);
  y += reciboLines.length * 3.5 + 4;

  // Banco/agência/conta + local/data
  const bankAccount =
    (collab as { bank_account?: string | null }).bank_account ?? "—";
  const pagamentoExtenso = req.payment_date
    ? `${city}, ${fmtDateExtenso(req.payment_date as string)}`
    : `${city}, ${fmtDateExtenso(new Date().toISOString().slice(0, 10))}`;

  doc.setFontSize(8);
  doc.text(`Banco/Conta: ${bankAccount}`, margin, y);
  doc.text(pagamentoExtenso, pageW - margin, y, { align: "right" });
  y += 12;

  // Assinaturas
  const sigWidth = (contentW - 10) / 2;
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, y, margin + sigWidth, y);
  doc.line(margin + sigWidth + 10, y, margin + contentW, y);
  y += 3.5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("Assinatura Empregador", margin + sigWidth / 2, y, { align: "center" });
  doc.text("Assinatura Empregado", margin + sigWidth + 10 + sigWidth / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(companyName, margin + sigWidth / 2, y, { align: "center" });
  doc.text(collab.name, margin + sigWidth + 10 + sigWidth / 2, y, { align: "center" });

  return doc;
}

/**
 * Atalho que gera + faz download direto.
 */
export async function downloadVacationReceiptPdf(options: GenerateOptions): Promise<void> {
  const doc = await generateVacationReceiptPdf(options);
  // Nome de arquivo do colab — precisa buscar de novo? mais simples: re-query
  const { data: req } = await supabase
    .from("vacation_requests")
    .select("collaborator:collaborators(name)")
    .eq("id", options.requestId)
    .single();
  const name = ((req?.collaborator as { name?: string } | null)?.name ?? "colaborador")
    .replace(/[^A-Za-z0-9_-]+/g, "_");
  doc.save(`Ferias_${name}.pdf`);
}
