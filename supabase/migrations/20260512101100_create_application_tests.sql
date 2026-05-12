-- Migration: 20260512101100_create_application_tests.sql
-- Description: testes na FASE DE RECRUTAMENTO (antes da contratação).
-- Equivalente a admission_journey_tests, mas vinculado a candidate_applications.
-- Reaproveita o catálogo admission_tests (mesmos slugs: logica, disc, bigfive,
-- informatica). O candidato responde via link público com token, antes da
-- entrevista com o gestor.
--
-- Fluxo:
--   1. RH atribui testes na coluna "Testes" do pipeline (1+ testes).
--   2. Sistema gera token único e link público /recrutamento/teste/:token.
--   3. Candidato acessa, responde, sistema auto-corrige perguntas objetivas.
--   4. RH revisa abertas (se houver) e libera para próxima etapa.

BEGIN;

CREATE TABLE public.application_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  application_id uuid NOT NULL REFERENCES public.candidate_applications(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.admission_tests(id) ON DELETE RESTRICT,
  test_slug text NOT NULL,
  status public.admission_test_status NOT NULL DEFAULT 'not_started',
  access_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_score numeric(6,2),
  reviewer_score numeric(6,2),
  result_summary jsonb,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, test_id),
  UNIQUE (access_token)
);

CREATE INDEX idx_application_tests_app
  ON public.application_tests(application_id);
CREATE INDEX idx_application_tests_candidate
  ON public.application_tests(candidate_id);
CREATE INDEX idx_application_tests_token
  ON public.application_tests(access_token);

CREATE TRIGGER set_updated_at_application_tests
  BEFORE UPDATE ON public.application_tests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_application_tests
  AFTER INSERT OR UPDATE OR DELETE ON public.application_tests
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

ALTER TABLE public.application_tests ENABLE ROW LEVEL SECURITY;

-- Read: RH + admin
CREATE POLICY "Application tests: RH read"
  ON public.application_tests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Application tests: RH manage"
  ON public.application_tests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

-- Função pública: candidato acessa via token. Edge Function recruitment-test
-- usa SECURITY DEFINER e service_role para ler/atualizar (RLS bypassed pra
-- esse caso específico de acesso anônimo via token).
CREATE OR REPLACE FUNCTION public.get_application_test_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  test_slug text,
  status public.admission_test_status,
  answers jsonb,
  started_at timestamptz,
  expires_at timestamptz,
  candidate_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    at.id,
    at.test_slug,
    at.status,
    at.answers,
    at.started_at,
    at.expires_at,
    c.name AS candidate_name
  FROM public.application_tests at
  JOIN public.candidates c ON c.id = at.candidate_id
  WHERE at.access_token = p_token
    AND (at.expires_at IS NULL OR at.expires_at > now())
    AND at.status IN ('not_started', 'in_progress')
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_application_test_by_token(text) TO anon, authenticated;

COMMENT ON TABLE public.application_tests IS
  'Testes aplicados a candidatos na fase de recrutamento (antes da entrevista com gestor). Reaproveita admission_tests como catálogo.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.get_application_test_by_token(text) FROM anon, authenticated;
-- DROP FUNCTION IF EXISTS public.get_application_test_by_token(text);
-- DROP TABLE IF EXISTS public.application_tests;
-- COMMIT;
