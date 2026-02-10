export const RISK_GROUPS = [
  { value: "GR1", label: "GR1 - Risco Trivial", description: "Atividades sem exposição ocupacional" },
  { value: "GR2", label: "GR2 - Risco Baixo", description: "Exposição ocupacional com controle adequado" },
  { value: "GR3", label: "GR3 - Risco Médio", description: "Exposição ocupacional significativa" },
  { value: "GR4", label: "GR4 - Risco Alto", description: "Exposição ocupacional elevada" },
  { value: "GR5", label: "GR5 - Risco Muito Alto", description: "Exposição ocupacional crítica" },
] as const;

export const RISK_GROUP_PERIODICITY: Record<string, number> = {
  GR1: 24,
  GR2: 12,
  GR3: 6,
  GR4: 6,
  GR5: 3,
};

export const RISK_GROUP_PERIODICITY_LABELS: Record<string, string> = {
  GR1: "Bienal (24 meses) – menores de 18 e maiores de 45: anual",
  GR2: "Anual (12 meses)",
  GR3: "Semestral (6 meses)",
  GR4: "Semestral (6 meses)",
  GR5: "Trimestral (3 meses)",
};

export const EXAM_TYPE_LABELS: Record<string, string> = {
  admissional: "Admissional",
  periodico: "Periódico",
  mudanca_funcao: "Mudança de Função",
  retorno_trabalho: "Retorno ao Trabalho",
  demissional: "Demissional",
  avulso: "Avulso",
};

export const EXAM_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  realizado: "Realizado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export const EXAM_STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendente: "secondary",
  agendado: "default",
  realizado: "outline",
  vencido: "destructive",
  cancelado: "destructive",
};
