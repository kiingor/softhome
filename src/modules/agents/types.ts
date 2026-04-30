// Tipos do módulo Agents (chat com Recrutador, futuro Analista, etc).

import type { Database } from "@/integrations/supabase/types";

export type AgentSession = Database["public"]["Tables"]["agent_sessions"]["Row"];
export type AgentMessage = Database["public"]["Tables"]["agent_messages"]["Row"];
export type AgentSearchLog =
  Database["public"]["Tables"]["agent_search_log"]["Row"];

export type AgentMessageRole =
  Database["public"]["Enums"]["agent_message_role"];

export type AgentKind = "recruiter" | "analyst" | "document_validator";

export const AGENT_LABELS: Record<AgentKind, string> = {
  recruiter: "Recrutador",
  analyst: "Analista G&C",
  document_validator: "Validador de Documentos",
};

// Resposta do Edge Function recruiter-search
export interface CandidateMatch {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  cv_url: string | null;
  cv_summary: string | null;
  source: string | null;
  is_active: boolean;
  similarity: number;
}

export interface RecruiterSearchResponse {
  success: boolean;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  assistantText: string;
  candidates: CandidateMatch[];
  durationMs: number;
  tokens: {
    input: number;
    output: number;
  };
}

// Metadata salvo no agent_messages.metadata pra mensagens do assistant
export interface RecruiterMessageMetadata {
  candidates: Array<{
    id: string;
    similarity: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analista G&C
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalystChatResponse {
  success: boolean;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  assistantText: string;
  toolCalls: string[];
  durationMs: number;
  tokens: {
    input: number;
    output: number;
  };
}

export interface AnalystMessageMetadata {
  tool_calls: Array<{
    tool: string;
    input: unknown;
    output: unknown;
  }>;
}
