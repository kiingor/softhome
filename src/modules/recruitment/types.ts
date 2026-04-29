// Tipos do módulo Recrutamento e Seleção. Tabelas e enums já aplicados
// no banco; types vêm do supabase types.ts como source of truth.

import type { Database } from "@/integrations/supabase/types";

export type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
export type CandidateInsert = Database["public"]["Tables"]["candidates"]["Insert"];
export type JobOpening = Database["public"]["Tables"]["job_openings"]["Row"];
export type JobOpeningInsert = Database["public"]["Tables"]["job_openings"]["Insert"];
export type CandidateApplication =
  Database["public"]["Tables"]["candidate_applications"]["Row"];
export type CandidateApplicationInsert =
  Database["public"]["Tables"]["candidate_applications"]["Insert"];
export type InterviewSchedule =
  Database["public"]["Tables"]["interview_schedules"]["Row"];
export type InterviewFeedback =
  Database["public"]["Tables"]["interview_feedbacks"]["Row"];

export type JobOpeningStatus = Database["public"]["Enums"]["job_opening_status"];
export type ApplicationStage = Database["public"]["Enums"]["application_stage"];
export type CollaboratorRegime = Database["public"]["Enums"]["collaborator_regime"];

// ─────────────────────────────────────────────────────────────────────────────
// Labels pt-BR
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_STATUS_LABELS: Record<JobOpeningStatus, string> = {
  draft: "Rascunho",
  open: "Aberta",
  paused: "Pausada",
  filled: "Preenchida",
  cancelled: "Cancelada",
};

export const JOB_STATUS_COLORS: Record<JobOpeningStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  filled: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  cancelled: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  new: "Inscritos",
  screening: "Triagem",
  interview_hr: "Entrevista RH",
  interview_manager: "Entrevista Gestor",
  offer: "Proposta",
  accepted: "Aceito",
  rejected: "Rejeitado",
  withdrawn: "Desistiu",
};

export const STAGE_COLORS: Record<ApplicationStage, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  screening: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  interview_hr: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  interview_manager:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  offer: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  withdrawn: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// Estágios em ordem (decisão Q1: 8 estágios completos)
export const PIPELINE_STAGES: ApplicationStage[] = [
  "new",
  "screening",
  "interview_hr",
  "interview_manager",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

// Estágios que aparecem como colunas do kanban "ativo" (todos exceto rejeitados/desistentes)
// Decisão UX: rejected/withdrawn ficam em accordion separado pra não poluir
export const ACTIVE_STAGES: ApplicationStage[] = [
  "new",
  "screening",
  "interview_hr",
  "interview_manager",
  "offer",
  "accepted",
];

export const TERMINAL_STAGES: ApplicationStage[] = ["accepted", "rejected", "withdrawn"];

export const REGIME_LABELS: Record<CollaboratorRegime, string> = {
  clt: "CLT",
  pj: "PJ",
  estagiario: "Estagiário",
};

// ─────────────────────────────────────────────────────────────────────────────
// AI scoring result shape (decisão Q2: stored as candidate_applications.ai_summary
// + ai_score; full JSON in ai_summary se quiser estrutura)
// ─────────────────────────────────────────────────────────────────────────────

export interface AIScoringResult {
  score: number; // 0-100
  justificativa: string; // texto pt-BR
  tags: string[]; // ex: ["forte_técnico", "perto_local", "experiência_irrelevante"]
  warnings?: string[]; // ex: ["pretensão acima da faixa", "sem experiência exigida"]
  matched_requirements?: string[];
  missing_requirements?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Joined types for service layer
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidateApplicationWithCandidate extends CandidateApplication {
  candidate?: Pick<Candidate, "id" | "name" | "email" | "phone" | "cv_url"> | null;
}

export interface JobOpeningWithStats extends JobOpening {
  applications_count?: number;
  applications_by_stage?: Partial<Record<ApplicationStage, number>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_CV_SIZE_MB = 5;
export const ALLOWED_CV_TYPES = ["application/pdf"];

// Storage bucket pra CVs (precisa criar no Supabase Dashboard)
export const CV_STORAGE_BUCKET = "candidate-cvs";
