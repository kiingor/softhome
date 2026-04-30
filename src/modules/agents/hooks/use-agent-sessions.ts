import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import type {
  AgentSession,
  AgentMessage,
  AgentKind,
  AnalystChatResponse,
  RecruiterSearchResponse,
} from "../types";

interface UseAgentSessionsOptions {
  agentKind?: AgentKind;
}

export function useAgentSessions(options: UseAgentSessionsOptions = {}) {
  const { user } = useDashboard();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["agent-sessions", user?.id, options.agentKind],
    queryFn: async () => {
      if (!user?.id) return [];
      let q = supabase
        .from("agent_sessions")
        .select("*")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (options.agentKind) q = q.eq("agent_kind", options.agentKind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AgentSession[];
    },
    enabled: !!user?.id,
  });

  const archiveSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("agent_sessions")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-sessions"] });
      toast.success("Conversa arquivada.");
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });

  const renameSession = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("agent_sessions")
        .update({ title })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-sessions"] });
    },
  });

  return { sessions, isLoading, archiveSession, renameSession };
}

export function useAgentMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ["agent-messages", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("agent_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentMessage[];
    },
    enabled: !!sessionId,
  });
}

// Hook que invoca o Edge Function analyst-chat.
// Multi-turn com tool use: Claude decide quais views agent_* consultar.
export function useAnalystChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      query,
    }: {
      sessionId: string | null;
      query: string;
    }) => {
      const { data, error } = await supabase.functions.invoke<AnalystChatResponse>(
        "analyst-chat",
        { body: { sessionId, query } },
      );
      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        if (ctx?.json) {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } catch {
            // ignore
          }
        }
        throw new Error(msg);
      }
      if (!data || !data.success) throw new Error("Analista retornou sem sucesso.");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["agent-sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["agent-messages", data.sessionId],
      });
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });
}

// Hook que invoca o Edge Function recruiter-search.
// Devolve a response com candidatos + texto Claude. UI atualiza local
// + invalida queries pra session/messages.
export function useRecruiterSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      query,
    }: {
      sessionId: string | null;
      query: string;
    }) => {
      const { data, error } = await supabase.functions.invoke<RecruiterSearchResponse>(
        "recruiter-search",
        {
          body: { sessionId, query },
        },
      );
      if (error) {
        // O message pode estar JSON-stringified
        let msg = error.message;
        // FunctionsHttpError carrega context com a response
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        if (ctx?.json) {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } catch {
            // ignore
          }
        }
        throw new Error(msg);
      }
      if (!data) throw new Error("Resposta vazia do Recrutador.");
      if (!data.success) throw new Error("Recrutador retornou sem sucesso.");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["agent-sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["agent-messages", data.sessionId],
      });
    },
    onError: (err: Error) => {
      toast.error("Não rolou. " + (err.message ?? "Tenta de novo?"));
    },
  });
}
