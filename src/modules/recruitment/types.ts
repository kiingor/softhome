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
// stage agora é text livre (migration 20260505170000) — vaga define seus stages.
// Os defaults abaixo (DEFAULT_STAGES) são os que vêm com toda vaga nova.
export type ApplicationStage = string;
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
  open: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  filled: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  cancelled: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

// Labels conhecidos pros stages padrão. Stages custom usam o slug como label.
const KNOWN_STAGE_LABELS: Record<string, string> = {
  new: "Inscritos",
  screening: "Triagem",
  interview_hr: "Entrevista RH",
  tests: "Testes",
  interview_manager: "Entrevista Gestor",
  offer: "Proposta",
  accepted: "Aceito",
  rejected: "Rejeitado",
  withdrawn: "Desistiu",
};

// Acesso compatível com código existente que usa STAGE_LABELS[stage].
// Pra stages custom, gera label a partir do slug ("custom_stage" → "Custom stage").
export const STAGE_LABELS = new Proxy({} as Record<string, string>, {
  get(_target, key: string) {
    if (key in KNOWN_STAGE_LABELS) return KNOWN_STAGE_LABELS[key];
    return key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  },
});

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage];
}

const KNOWN_STAGE_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  screening: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  interview_hr: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  tests: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  interview_manager:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  offer: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  accepted: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  withdrawn: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export const STAGE_COLORS = new Proxy({} as Record<string, string>, {
  get(_t, key: string) {
    return (
      KNOWN_STAGE_COLORS[key] ??
      "bg-muted text-muted-foreground dark:bg-muted/40"
    );
  },
});

// Defaults pro pipeline_stages quando vaga não tem nenhum (fallback compat).
// 'tests' entra entre 'interview_hr' e 'interview_manager' desde 2026-05-12.
export const DEFAULT_STAGES: ApplicationStage[] = [
  "new",
  "screening",
  "interview_hr",
  "tests",
  "interview_manager",
  "offer",
  "accepted",
];

// Mantidos por compatibilidade.
export const PIPELINE_STAGES: ApplicationStage[] = [
  "new",
  "screening",
  "interview_hr",
  "tests",
  "interview_manager",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

export const ACTIVE_STAGES: ApplicationStage[] = DEFAULT_STAGES;

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
