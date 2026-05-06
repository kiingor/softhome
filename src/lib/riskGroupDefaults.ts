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

// Exames específicos exigidos no admissional por grupo de risco (NR-7/PCMSO).
// Lista padrão — RH pode customizar se quiser via cadastro do cargo (futuro).
export interface RiskGroupExam {
  slug: string;
  label: string;
}

export const EXAMS_BY_RISK_GROUP: Record<string, RiskGroupExam[]> = {
  GR1: [
    { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
  ],
  GR2: [
    { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
    { slug: "audiometria", label: "Audiometria" },
    { slug: "acuidade_visual", label: "Acuidade visual" },
  ],
  GR3: [
    { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
    { slug: "audiometria", label: "Audiometria" },
    { slug: "acuidade_visual", label: "Acuidade visual" },
    { slug: "espirometria", label: "Espirometria" },
    { slug: "hemograma", label: "Hemograma completo" },
  ],
  GR4: [
    { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
    { slug: "audiometria", label: "Audiometria" },
    { slug: "acuidade_visual", label: "Acuidade visual" },
    { slug: "espirometria", label: "Espirometria" },
    { slug: "raio_x_torax", label: "Raio-X de tórax" },
    { slug: "hemograma", label: "Hemograma completo" },
    { slug: "psicossocial", label: "Avaliação psicossocial" },
  ],
  GR5: [
    { slug: "avaliacao_clinica", label: "Avaliação clínica ocupacional" },
    { slug: "audiometria", label: "Audiometria" },
    { slug: "acuidade_visual", label: "Acuidade visual" },
    { slug: "espirometria", label: "Espirometria" },
    { slug: "raio_x_torax", label: "Raio-X de tórax" },
    { slug: "hemograma", label: "Hemograma completo" },
    { slug: "psicossocial", label: "Avaliação psicossocial" },
    { slug: "toxicologico", label: "Exame toxicológico" },
    { slug: "eletrocardiograma", label: "Eletrocardiograma" },
  ],
};

export function getExamsForRiskGroup(riskGroup: string | null): RiskGroupExam[] {
  if (!riskGroup) return [];
  return EXAMS_BY_RISK_GROUP[riskGroup] ?? [];
}

export const EXAM_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  realizado: "Realizado",
  vencido: "Vencido",
  cancelado: "Cancelado",
  arquivado: "Arquivado",
};

export const EXAM_STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendente: "secondary",
  agendado: "default",
  realizado: "outline",
  vencido: "destructive",
  cancelado: "destructive",
  arquivado: "outline",
};
