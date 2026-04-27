// Tipos do módulo Journey (Jornada de Conhecimento).
//
// Definidos manualmente porque as migrations da Fase 1 ainda não
// foram aplicadas — types.ts auto-gerado não tem essas tabelas. Após
// `npx supabase db push` + `gen types`, os tipos do banco passam a
// existir e este arquivo continua sendo a "verdade" do módulo
// (services castam o resultado do supabase pra estes tipos).

export type BadgeCategory =
  | "tecnico"
  | "comportamental"
  | "lideranca"
  | "cultura"
  | "integracao"
  | "outro";

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  tecnico: "Técnica",
  comportamental: "Comportamental",
  lideranca: "Liderança",
  cultura: "Cultura",
  integracao: "Integração",
  outro: "Outro",
};

export interface Badge {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  category: BadgeCategory;
  weight: number;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollaboratorBadge {
  id: string;
  company_id: string;
  collaborator_id: string;
  badge_id: string;
  awarded_by: string | null;
  awarded_at: string;
  evidence: string | null;
  evidence_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joins opcionais via select
  badge?: Badge;
  collaborator?: { id: string; name: string };
}

export type JourneyMilestoneKind = "d30" | "d60" | "d90" | "d180" | "annual";

export const MILESTONE_KIND_LABELS: Record<JourneyMilestoneKind, string> = {
  d30: "30 dias",
  d60: "60 dias",
  d90: "90 dias",
  d180: "6 meses",
  annual: "Aniversário",
};

export type JourneyMilestoneStatus = "pending" | "due" | "completed" | "overdue";

export const MILESTONE_STATUS_LABELS: Record<JourneyMilestoneStatus, string> = {
  pending: "Aguardando",
  due: "Pra avaliar",
  completed: "Avaliado",
  overdue: "Atrasado",
};

export interface JourneyMilestone {
  id: string;
  company_id: string;
  collaborator_id: string;
  kind: JourneyMilestoneKind;
  due_date: string;
  status: JourneyMilestoneStatus;
  evaluated_by: string | null;
  evaluated_at: string | null;
  notes: string | null;
  badges_count: number;
  created_at: string;
  updated_at: string;
  // joins opcionais
  collaborator?: { id: string; name: string; admission_date: string | null };
}
