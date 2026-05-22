-- Migration: sync_jobs — rastreio de progresso de sincronizações grandes
--
-- Substitui o padrão "frontend espera função inteira terminar" por um
-- "fire-and-poll": a edge function cria 1 row aqui, retorna o id, e roda
-- o trabalho real em background (EdgeRuntime.waitUntil). O frontend polla
-- esta tabela pra mostrar progresso ao vivo em modal.
--
-- Casos cobertos:
--   • sync de 300+ colabs com includeDetails (≥ função timeout)
--   • user fechar modal sem matar o job (reabrir mostra progresso atual)
--   • erros parciais (1 colab falha, resto roda → fica em `errors[]`)
--   • cancelamento pelo user (status='cancelled')
--   • retomada manual (não automática nesta v1)

BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- O que está sendo sincronizado
  resource text NOT NULL,  -- 'collaborators' | 'stores' | 'teams' | 'positions' | 'collaborator-details'
  options jsonb,           -- {incluirDesativados, includeFinancials, includeDetails, ...}

  -- Estado do job
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  current_step text,       -- "Buscando página 2/6" / "Aplicando financeiros (col 47/312)" / etc.

  -- Contadores
  total int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  inserted int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  deactivated int NOT NULL DEFAULT 0,
  -- Lista de erros: [{external_id, name, error}]
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Cursor pra retomar (não usado na v1, mas reservado)
  cursor jsonb,

  -- Resultado final (pra logs / debug)
  result jsonb,
  error_message text,

  -- Timestamps + autor
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_company_resource_status
  ON public.sync_jobs(company_id, resource, status);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_company_created
  ON public.sync_jobs(company_id, created_at DESC);

-- Trigger updated_at (usa o handler global se existir, senão inline)
CREATE OR REPLACE FUNCTION public._touch_sync_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_jobs_touch ON public.sync_jobs;
CREATE TRIGGER trg_sync_jobs_touch
  BEFORE UPDATE ON public.sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public._touch_sync_jobs_updated_at();

-- ─── RLS ───
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer member da company OU admin_gc
DROP POLICY IF EXISTS sync_jobs_select ON public.sync_jobs;
CREATE POLICY sync_jobs_select ON public.sync_jobs FOR SELECT
USING (
  public.is_admin_gc(auth.uid())
  OR public.user_belongs_to_company(auth.uid(), company_id)
);

-- INSERT/UPDATE/DELETE: só edge function via service_role (bypass RLS).
-- Frontend nunca escreve direto — só lê.

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_sync_jobs_touch ON public.sync_jobs;
--   DROP FUNCTION IF EXISTS public._touch_sync_jobs_updated_at();
--   DROP TABLE IF EXISTS public.sync_jobs;
-- COMMIT;
