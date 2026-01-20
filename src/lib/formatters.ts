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
export const formatCurrencyForInput = (value: string): string => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");
  
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
