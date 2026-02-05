 import jsPDF from "jspdf";
 import autoTable from "jspdf-autotable";
 
 interface PayslipEntry {
   code: string;
   description: string;
   reference: string;
   earnings: number | null;
   deductions: number | null;
 }
 
 interface PayslipData {
   company: {
     name: string;
     cnpj: string | null;
   };
   collaborator: {
     code: string;
     name: string;
     cpf: string;
     admissionDate: string;
     position: string;
     department: string;
   };
   period: {
     month: number;
     year: number;
   };
   entries: PayslipEntry[];
   totals: {
     earnings: number;
     deductions: number;
     netPay: number;
   };
   footer: {
     baseSalary: number;
     inssBase: number;
     fgtsBase: number;
     fgtsValue: number;
     irpfBase: number;
   };
 }
 
 const formatCurrencyPDF = (value: number): string => {
   return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 };
 
 const monthNames = [
   "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
   "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
 ];
 
 // Entry type to code mapping
 const typeCodes: Record<string, string> = {
   salario: "011",
   adicional: "020",
   vale: "100",
   beneficio: "030",
   inss: "310",
   irpf: "320",
   fgts: "400",
   custo: "500",
   despesa: "600",
 };
 
 // Entry type to description mapping
 const typeDescriptions: Record<string, string> = {
   salario: "Salário-Base",
   adicional: "Adicional",
   vale: "Vale",
   beneficio: "Benefício",
   inss: "INSS",
   irpf: "IRPF",
   fgts: "FGTS",
   custo: "Custo",
   despesa: "Despesa",
 };
 
 // Types that are earnings (proventos)
 const earningsTypes = ["salario", "adicional", "vale", "beneficio"];
 
 // Types that are deductions (descontos)
 const deductionTypes = ["inss", "irpf", "despesa"];
 
 export const generatePayslipPDF = (data: PayslipData): void => {
   const doc = new jsPDF();
   const pageWidth = doc.internal.pageSize.getWidth();
   const margin = 10;
   let y = margin;
 
   // Header - Recibo de Pagamento
   doc.setFillColor(240, 240, 240);
   doc.rect(margin, y, pageWidth - margin * 2, 20, "F");
   doc.setDrawColor(0);
   doc.rect(margin, y, pageWidth - margin * 2, 20, "S");
 
   doc.setFontSize(14);
   doc.setFont("helvetica", "bold");
   doc.text("Recibo de Pagamento", margin + 5, y + 8);
   doc.setFontSize(10);
   doc.setFont("helvetica", "normal");
   doc.text("(Folha de Pagamento)", margin + 5, y + 14);
 
   // Date and signature area
   doc.setFontSize(8);
   doc.text("Data e Assinatura", pageWidth - margin - 40, y + 8);
   doc.text("___/___/___", pageWidth - margin - 35, y + 14);
 
   y += 25;
 
   // Company and employee info header
   const headerHeight = 12;
   
   // Row 1: Empregador | Inscrição | Admissão | Competência
   doc.setFontSize(7);
   doc.setFont("helvetica", "bold");
   doc.rect(margin, y, 80, headerHeight, "S");
   doc.text("Empregador", margin + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(data.company.name.substring(0, 40), margin + 2, y + 9);
 
   doc.rect(margin + 80, y, 40, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Inscrição (CNPJ)", margin + 82, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(data.company.cnpj || "-", margin + 82, y + 9);
 
   doc.rect(margin + 120, y, 35, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Admissão", margin + 122, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(data.collaborator.admissionDate, margin + 122, y + 9);
 
   doc.rect(margin + 155, y, pageWidth - margin * 2 - 155, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Competência", margin + 157, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(`${monthNames[data.period.month - 1]}/${data.period.year}`, margin + 157, y + 9);
 
   y += headerHeight;
 
   // Row 2: Empregado | Cargo | Lotação
   doc.rect(margin, y, 80, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Empregado", margin + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(`${data.collaborator.code} ${data.collaborator.name.substring(0, 35)}`, margin + 2, y + 9);
 
   doc.rect(margin + 80, y, 55, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Cargo", margin + 82, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(data.collaborator.position.substring(0, 25), margin + 82, y + 9);
 
   doc.rect(margin + 135, y, pageWidth - margin * 2 - 135, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Lotação", margin + 137, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(data.collaborator.department.substring(0, 20), margin + 137, y + 9);
 
   y += headerHeight;
 
   // Row 3: CPF | Banco | Agência | Conta | Tipo Conta
   doc.rect(margin, y, 50, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("CPF", margin + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(data.collaborator.cpf, margin + 2, y + 9);
 
   doc.rect(margin + 50, y, 30, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Banco", margin + 52, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text("-", margin + 52, y + 9);
 
   doc.rect(margin + 80, y, 30, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Agência", margin + 82, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text("-", margin + 82, y + 9);
 
   doc.rect(margin + 110, y, 40, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Conta", margin + 112, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text("-", margin + 112, y + 9);
 
   doc.rect(margin + 150, y, pageWidth - margin * 2 - 150, headerHeight, "S");
   doc.setFont("helvetica", "bold");
   doc.text("Tipo Conta", margin + 152, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text("-", margin + 152, y + 9);
 
   y += headerHeight + 5;
 
   // Discriminação das Verbas - Table Header
   doc.setFillColor(220, 220, 220);
   doc.rect(margin, y, pageWidth - margin * 2, 8, "FD");
   doc.setFont("helvetica", "bold");
   doc.setFontSize(9);
   doc.text("Discriminação das Verbas", pageWidth / 2, y + 5, { align: "center" });
 
   y += 10;
 
   // Entries table
   const tableData = data.entries.map((entry) => [
     entry.code,
     entry.description,
     entry.reference,
     entry.earnings ? formatCurrencyPDF(entry.earnings) : "",
     entry.deductions ? formatCurrencyPDF(entry.deductions) : "",
   ]);
 
   autoTable(doc, {
     startY: y,
     head: [["Cod.", "Descrição", "Referência", "Provento", "Desconto"]],
     body: tableData,
     theme: "grid",
     headStyles: {
       fillColor: [180, 180, 180],
       textColor: [0, 0, 0],
       fontSize: 8,
       fontStyle: "bold",
     },
     styles: {
       fontSize: 8,
       cellPadding: 2,
     },
     columnStyles: {
       0: { cellWidth: 15, halign: "center" },
       1: { cellWidth: 70 },
       2: { cellWidth: 30, halign: "center" },
       3: { cellWidth: 35, halign: "right" },
       4: { cellWidth: 35, halign: "right" },
     },
     margin: { left: margin, right: margin },
   });
 
   y = (doc as any).lastAutoTable.finalY + 2;
 
   // Totals row
   const totalsData = [
     ["", "Total de Proventos", "", formatCurrencyPDF(data.totals.earnings), ""],
     ["", "Total de Descontos", "", "", formatCurrencyPDF(data.totals.deductions)],
     ["", "Líquido a Receber", "", formatCurrencyPDF(data.totals.netPay), ""],
   ];
 
   autoTable(doc, {
     startY: y,
     body: totalsData,
     theme: "grid",
     styles: {
       fontSize: 9,
       cellPadding: 2,
       fontStyle: "bold",
     },
     columnStyles: {
       0: { cellWidth: 15 },
       1: { cellWidth: 70 },
       2: { cellWidth: 30 },
       3: { cellWidth: 35, halign: "right" },
       4: { cellWidth: 35, halign: "right" },
     },
     margin: { left: margin, right: margin },
   });
 
   y = (doc as any).lastAutoTable.finalY + 5;
 
   // Footer - Tax bases
   const footerHeight = 12;
   const colWidth = (pageWidth - margin * 2) / 5;
 
   doc.setFillColor(240, 240, 240);
   doc.rect(margin, y, pageWidth - margin * 2, footerHeight, "FD");
 
   doc.setFontSize(7);
   doc.setFont("helvetica", "bold");
 
   // Salário-Base
   doc.text("Salário", margin + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(formatCurrencyPDF(data.footer.baseSalary), margin + 2, y + 9);
 
   // Base INSS
   doc.setFont("helvetica", "bold");
   doc.text("Base INSS", margin + colWidth + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(formatCurrencyPDF(data.footer.inssBase), margin + colWidth + 2, y + 9);
 
   // Base FGTS
   doc.setFont("helvetica", "bold");
   doc.text("Base FGTS", margin + colWidth * 2 + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(formatCurrencyPDF(data.footer.fgtsBase), margin + colWidth * 2 + 2, y + 9);
 
   // FGTS Value
   doc.setFont("helvetica", "bold");
   doc.text("FGTS", margin + colWidth * 3 + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(formatCurrencyPDF(data.footer.fgtsValue), margin + colWidth * 3 + 2, y + 9);
 
   // Base IRRF
   doc.setFont("helvetica", "bold");
   doc.text("Base IRRF", margin + colWidth * 4 + 2, y + 4);
   doc.setFont("helvetica", "normal");
   doc.text(formatCurrencyPDF(data.footer.irpfBase), margin + colWidth * 4 + 2, y + 9);
 
   // Generate filename
   const fileName = `recibo_${data.collaborator.name.replace(/\s+/g, "_")}_${data.period.month.toString().padStart(2, "0")}_${data.period.year}.pdf`;
   doc.save(fileName);
 };
 
 // Helper function to convert payroll entries to payslip format
 export const convertEntriesToPayslipData = (
   entries: any[],
   company: { name: string; cnpj: string | null },
   collaborator: {
     id: string;
     name: string;
     cpf: string;
     admission_date: string | null;
     position?: { name: string } | null;
     team?: { name: string } | null;
   },
   month: number,
   year: number
 ): PayslipData => {
   const payslipEntries: PayslipEntry[] = [];
   let totalEarnings = 0;
   let totalDeductions = 0;
   let baseSalary = 0;
   let fgtsValue = 0;
 
   // Process each entry
   entries.forEach((entry) => {
     const type = entry.type as string;
     const code = typeCodes[type] || "999";
     const description = entry.description || typeDescriptions[type] || type;
     const value = Number(entry.value);
 
     // Track base salary
     if (type === "salario") {
       baseSalary += value;
     }
 
     // Track FGTS value (not a deduction, goes to footer)
     if (type === "fgts") {
       fgtsValue += value;
       return; // Don't add FGTS to entries list, it goes in footer
     }
 
     const isEarning = earningsTypes.includes(type);
     const isDeduction = deductionTypes.includes(type);
 
     if (isEarning) {
       totalEarnings += value;
       payslipEntries.push({
         code,
         description,
         reference: type === "salario" ? "30 dia(s)" : entry.description?.match(/\d+%/) ? entry.description.match(/\d+%/)[0] : "-",
         earnings: value,
         deductions: null,
       });
     } else if (isDeduction) {
       totalDeductions += value;
       // Extract percentage from description if available
       const percentMatch = entry.description?.match(/(\d+(?:,\d+)?%)/);
       payslipEntries.push({
         code,
         description,
         reference: percentMatch ? percentMatch[1] : "-",
         earnings: null,
         deductions: value,
       });
     }
   });
 
   // Sort entries: earnings first, then deductions
   payslipEntries.sort((a, b) => {
     if (a.earnings && !b.earnings) return -1;
     if (!a.earnings && b.earnings) return 1;
     return 0;
   });
 
   const netPay = totalEarnings - totalDeductions;
   const inssBase = baseSalary;
   const fgtsBase = baseSalary;
   const irpfBase = baseSalary;
 
   return {
     company: {
       name: company.name,
       cnpj: company.cnpj,
     },
     collaborator: {
       code: collaborator.id.substring(0, 6).toUpperCase(),
       name: collaborator.name,
       cpf: collaborator.cpf,
       admissionDate: collaborator.admission_date
         ? new Date(collaborator.admission_date).toLocaleDateString("pt-BR")
         : "-",
       position: collaborator.position?.name || "-",
       department: collaborator.team?.name || "-",
     },
     period: {
       month,
       year,
     },
     entries: payslipEntries,
     totals: {
       earnings: totalEarnings,
       deductions: totalDeductions,
       netPay,
     },
     footer: {
       baseSalary,
       inssBase,
       fgtsBase,
       fgtsValue,
       irpfBase,
     },
   };
 };