// Format currency to BRL
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

// Parse currency input (handles comma as decimal separator)
export const parseCurrencyInput = (value: string): number => {
  // Remove currency symbol and spaces
  const cleaned = value.replace(/[R$\s]/g, "");
  // Replace comma with dot for decimal
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  return parseFloat(normalized) || 0;
};

// Format currency for input display (R$ 1.234,56)
export const formatCurrencyForInput = (value: string | number): string => {
  // Aceita number (ex.: valor já numérico vindo do banco) sem quebrar — coage
  // pra string antes do replace.
  const digits = String(value ?? "").replace(/\D/g, "");
  
  if (!digits) return "";
  
  // Convert to number (cents to reais)
  const number = parseInt(digits, 10) / 100;
  
  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

// Format a number as currency for display in input
export const formatNumberAsCurrency = (value: number): string => {
  if (!value && value !== 0) return "";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

// Format month/year display
export const formatCompetencia = (month: number, year: number): string => {
  const monthStr = month.toString().padStart(2, "0");
  return `${monthStr}/${year}`;
};

// Get current month and year
export const getCurrentCompetencia = (): { month: number; year: number } => {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
};

// Month names in Portuguese
export const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Get month name
export const getMonthName = (month: number): string => {
  return monthNames[month - 1] || "";
};

/**
 * Formata uma data ISO (YYYY-MM-DD ou ISO 8601 completo) pra DD/MM/YYYY.
 * Retorna "—" se inválida ou vazia.
 */
export const formatDateBR = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  // Evita timezone shifts em datas no formato YYYY-MM-DD: parseia manualmente.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
};

/**
 * Title Case respeitando preposições/artigos em pt-BR (de, da, do, dos, e).
 * Útil pra normalizar campos free-text vindos da agenda (que vêm em CAPS LOCK).
 */
export const toTitleCase = (s: string | null | undefined): string => {
  if (!s) return "";
  const lower = new Set(["de", "da", "do", "das", "dos", "e", "a", "o"]);
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      if (i > 0 && lower.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
};
