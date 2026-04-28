// Tipos do módulo Admissão.
// Tabelas e enums já aplicados no banco; types vêm do supabase types.ts
// como source of truth.

import type { Database } from "@/integrations/supabase/types";

export type AdmissionJourney = Database["public"]["Tables"]["admission_journeys"]["Row"];
export type AdmissionDocument = Database["public"]["Tables"]["admission_documents"]["Row"];
export type AdmissionEvent = Database["public"]["Tables"]["admission_events"]["Row"];

export type AdmissionJourneyInsert = Database["public"]["Tables"]["admission_journeys"]["Insert"];
export type AdmissionDocumentInsert = Database["public"]["Tables"]["admission_documents"]["Insert"];
export type AdmissionEventInsert = Database["public"]["Tables"]["admission_events"]["Insert"];

export type AdmissionJourneyStatus = Database["public"]["Enums"]["admission_journey_status"];
export type AdmissionDocumentStatus = Database["public"]["Enums"]["admission_document_status"];
export type AdmissionEventKind = Database["public"]["Enums"]["admission_event_kind"];
export type CollaboratorRegime = Database["public"]["Enums"]["collaborator_regime"];

// ─────────────────────────────────────────────────────────────────────────────
// Labels pt-BR
// ─────────────────────────────────────────────────────────────────────────────

export const JOURNEY_STATUS_LABELS: Record<AdmissionJourneyStatus, string> = {
  created: "Criada",
  docs_pending: "Aguardando docs",
  docs_in_review: "Em revisão",
  docs_needs_adjustment: "Pedindo ajuste",
  docs_approved: "Docs aprovados",
  exam_scheduled: "Exame agendado",
  exam_done: "Exame feito",
  contract_signed: "Contrato assinado",
  admitted: "Admitido",
  cancelled: "Cancelada",
};

export const JOURNEY_STATUS_COLORS: Record<AdmissionJourneyStatus, string> = {
  created: "bg-muted text-muted-foreground",
  docs_pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  docs_in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  docs_needs_adjustment: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  docs_approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  exam_scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  exam_done: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  contract_signed: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  admitted: "bg-emerald-600 text-white dark:bg-emerald-700",
  cancelled: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export const DOCUMENT_STATUS_LABELS: Record<AdmissionDocumentStatus, string> = {
  pending: "Pendente",
  submitted: "Enviado",
  ai_validating: "Validando IA",
  approved: "Aprovado",
  needs_adjustment: "Pedir ajuste",
};

export const REGIME_LABELS: Record<CollaboratorRegime, string> = {
  clt: "CLT",
  pj: "PJ",
  estagiario: "Estagiário",
};

// ─────────────────────────────────────────────────────────────────────────────
// Documentos requeridos por regime
// (decisão Q1 confirmada com user; tabela default aceita)
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentType =
  | "rg"
  | "cpf"
  | "ctps"
  | "comprovante_endereco"
  | "foto_3x4"
  | "atestado_exame"
  | "contrato_social"
  | "cnpj_doc"
  | "comprovante_matricula"
  | "tce"
  | "outro";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  rg: "RG",
  cpf: "CPF",
  ctps: "CTPS",
  comprovante_endereco: "Comprovante de endereço",
  foto_3x4: "Foto 3x4",
  atestado_exame: "Atestado de exame admissional",
  contrato_social: "Contrato social",
  cnpj_doc: "Comprovante CNPJ",
  comprovante_matricula: "Comprovante de matrícula",
  tce: "Termo de compromisso de estágio (TCE)",
  outro: "Outro",
};

export const REQUIRED_DOCS_BY_REGIME: Record<CollaboratorRegime, DocumentType[]> = {
  clt: ["rg", "cpf", "ctps", "comprovante_endereco", "foto_3x4", "atestado_exame"],
  pj: ["rg", "cpf", "contrato_social", "cnpj_doc", "comprovante_endereco"],
  estagiario: [
    "rg",
    "cpf",
    "comprovante_endereco",
    "foto_3x4",
    "atestado_exame",
    "comprovante_matricula",
    "tce",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// AI validation result shape (stored in admission_documents.ai_validation_result jsonb)
// Decisão Q2: validação forte — Claude verifica legibilidade + tipo + extração
// ─────────────────────────────────────────────────────────────────────────────

export interface AIValidationResult {
  is_legible: boolean;
  detected_type: DocumentType | "unknown";
  type_matches: boolean; // detected_type === expected
  extracted_data: {
    name?: string;
    cpf?: string;
    cnpj?: string;
    rg?: string;
    document_number?: string;
    issued_at?: string;
    [key: string]: string | undefined;
  };
  data_matches_cadastro: boolean; // extracted matches what RH cadastrou
  warnings: string[];
  raw_text?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Joined types for service layer (frequently fetched together)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdmissionJourneyWithCounts extends AdmissionJourney {
  documents_count?: number;
  documents_approved_count?: number;
  documents_pending_count?: number;
}

export interface AdmissionDocumentWithReviewer extends AdmissionDocument {
  reviewer?: { id: string; full_name: string | null } | null;
}
