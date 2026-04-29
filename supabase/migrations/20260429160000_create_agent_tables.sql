-- Migration: 20260429160000_create_agent_tables.sql
-- Description: tabelas para agentes IA do SoftHome.
--
-- Decisão Q4 da Fase 5: persistir conversas em agent_sessions + agent_messages
-- Decisão Q5 da Fase 5: log de buscas em agent_search_log pra audit.
--
-- Estrutura suporta múltiplos tipos de agente (kind text). v1: 'recruiter'.
-- Futuros: 'analyst' (Agente Analista G&C), 'document_validator', etc.

BEGIN;

-- ============================================================
-- agent_sessions: 1 conversa = 1 session
-- ============================================================
CREATE TABLE public.agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_kind text NOT NULL CHECK (agent_kind IN ('recruiter', 'analyst', 'document_validator')),
  title text,                                -- auto-gerado do primeiro user message
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_sessions_user ON public.agent_sessions(user_id, created_at DESC);
CREATE INDEX idx_agent_sessions_company ON public.agent_sessions(company_id);
CREATE INDEX idx_agent_sessions_kind ON public.agent_sessions(agent_kind);

CREATE TRIGGER set_updated_at_agent_sessions
  BEFORE UPDATE ON public.agent_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_agent_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- agent_messages: mensagens dentro de uma session
-- ============================================================
CREATE TYPE public.agent_message_role AS ENUM ('user', 'assistant', 'system', 'tool');

CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  role public.agent_message_role NOT NULL,
  content text NOT NULL,
  content_blocks jsonb,                       -- estruturado (futuro: tool use)
  metadata jsonb,                             -- ex: candidate matches, scores
  token_input integer,
  token_output integer,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_messages_session
  ON public.agent_messages(session_id, created_at ASC);

-- Sem updated_at trigger - mensagens são imutáveis (append-only log)

-- ============================================================
-- agent_search_log: audit de buscas semânticas (decisão Q5)
-- ============================================================
CREATE TABLE public.agent_search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  agent_kind text NOT NULL,
  query text NOT NULL,
  results jsonb NOT NULL,                     -- [{candidate_id, similarity, ...}]
  top_k integer NOT NULL DEFAULT 10,
  threshold real,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_search_user
  ON public.agent_search_log(user_id, created_at DESC);
CREATE INDEX idx_agent_search_company
  ON public.agent_search_log(company_id, created_at DESC);
CREATE INDEX idx_agent_search_kind
  ON public.agent_search_log(agent_kind);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_search_log ENABLE ROW LEVEL SECURITY;

-- agent_sessions: admin_gc lê tudo; usuário lê própria; gestor_gc lê própria empresa
CREATE POLICY "admin_gc reads all sessions" ON public.agent_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "user reads own sessions" ON public.agent_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "gestor_gc reads own company sessions" ON public.agent_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(agent_sessions.company_id, auth.uid())
  );

-- INSERT: any authenticated user pode criar sessão própria pra empresa que pertence
CREATE POLICY "user creates own sessions" ON public.agent_sessions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.user_belongs_to_company(company_id, auth.uid())
  );

-- UPDATE/DELETE: só owner ou admin_gc
CREATE POLICY "user updates own sessions" ON public.agent_sessions
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
               AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "user deletes own sessions" ON public.agent_sessions
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
               AND ur.role::text IN ('admin_gc', 'admin'))
  );

-- agent_messages: lê quem pode ler a session; escreve via Edge Function (service_role).
CREATE POLICY "read messages of accessible sessions" ON public.agent_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_messages.session_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                     AND ur.role::text IN ('admin_gc', 'admin'))
          OR (
            EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                    AND ur.role::text IN ('gestor_gc', 'rh'))
            AND public.user_belongs_to_company(s.company_id, auth.uid())
          )
        )
    )
  );

-- agent_search_log: admin_gc lê tudo, owner lê próprio
CREATE POLICY "admin_gc reads all search log" ON public.agent_search_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "user reads own search log" ON public.agent_search_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "gestor_gc reads own company search log" ON public.agent_search_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(agent_search_log.company_id, auth.uid())
  );

-- INSERT messages e search_log: SOMENTE service_role (via Edge Function).
-- Não criar policies de INSERT pra usuários autenticados.

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TABLE IF EXISTS public.agent_search_log;
--   DROP TABLE IF EXISTS public.agent_messages;
--   DROP TYPE IF EXISTS public.agent_message_role;
--   DROP TABLE IF EXISTS public.agent_sessions;
-- COMMIT;
