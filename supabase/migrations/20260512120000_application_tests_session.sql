-- Migration: 20260512120000_application_tests_session.sql
-- Description: 1 link único de sessão por application. Antes, cada
-- application_test tinha um access_token próprio. Agora a application
-- tem 1 tests_session_token e o candidato vê todos os testes atribuídos
-- numa só tela (pode iniciar e finalizar um por vez).
--
-- O access_token de application_tests continua existindo por compat,
-- mas o fluxo novo usa o session_token + test_id.

BEGIN;

ALTER TABLE public.candidate_applications
  ADD COLUMN IF NOT EXISTS tests_session_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_tests_session_token
  ON public.candidate_applications(tests_session_token)
  WHERE tests_session_token IS NOT NULL;

-- Backfill: gera token pra applications que já têm testes atribuídos.
UPDATE public.candidate_applications ca
SET tests_session_token = replace(gen_random_uuid()::text, '-', '')
WHERE ca.tests_session_token IS NULL
  AND EXISTS (
    SELECT 1 FROM public.application_tests at WHERE at.application_id = ca.id
  );

-- Trigger: ao criar application_tests, garantir que a application tem token.
CREATE OR REPLACE FUNCTION public.ensure_application_tests_session_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.candidate_applications
  SET tests_session_token = replace(gen_random_uuid()::text, '-', '')
  WHERE id = NEW.application_id AND tests_session_token IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_session_token ON public.application_tests;
CREATE TRIGGER trg_ensure_session_token
  AFTER INSERT ON public.application_tests
  FOR EACH ROW EXECUTE FUNCTION public.ensure_application_tests_session_token();

-- ─────────────────────────────────────────────────────────────────────
-- RPC pública: lista os testes da sessão para o candidato.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_application_tests_session(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  app_record record;
BEGIN
  SELECT
    ca.id,
    c.name AS candidate_name,
    jo.title AS job_title
  INTO app_record
  FROM public.candidate_applications ca
  JOIN public.candidates c ON c.id = ca.candidate_id
  JOIN public.job_openings jo ON jo.id = ca.job_id
  WHERE ca.tests_session_token = p_token
  LIMIT 1;

  IF app_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'application_id', app_record.id,
    'candidate_name', app_record.candidate_name,
    'job_title', app_record.job_title,
    'tests', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', at.id,
          'test_slug', at.test_slug,
          'status', at.status,
          'answers', at.answers,
          'completed_at', at.completed_at,
          'started_at', at.started_at,
          'name', t.name,
          'description', t.description,
          'category', t.category,
          'time_limit_minutes', t.time_limit_minutes
        )
        ORDER BY at.assigned_at
      ) FILTER (WHERE at.id IS NOT NULL),
      '[]'::jsonb
    )
  )
  INTO result
  FROM public.application_tests at
  JOIN public.admission_tests t ON t.id = at.test_id
  WHERE at.application_id = app_record.id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_application_tests_session(text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- RPC pública: marca um teste como iniciado (in_progress).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_application_test_in_session(
  p_token text,
  p_test_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_id uuid;
BEGIN
  SELECT id INTO app_id
  FROM public.candidate_applications
  WHERE tests_session_token = p_token;

  IF app_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão inválida');
  END IF;

  UPDATE public.application_tests
  SET
    status = 'in_progress',
    started_at = COALESCE(started_at, now())
  WHERE id = p_test_id
    AND application_id = app_id
    AND status IN ('not_started', 'in_progress');

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_application_test_in_session(text, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- RPC pública: salva progresso (autosave) de um teste na sessão.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_application_test_progress_in_session(
  p_token text,
  p_test_id uuid,
  p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_id uuid;
BEGIN
  SELECT id INTO app_id
  FROM public.candidate_applications
  WHERE tests_session_token = p_token;

  IF app_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão inválida');
  END IF;

  UPDATE public.application_tests
  SET answers = p_answers
  WHERE id = p_test_id
    AND application_id = app_id
    AND status IN ('not_started', 'in_progress');

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_application_test_progress_in_session(text, uuid, jsonb) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- RPC pública: finaliza um teste da sessão.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_application_test_in_session(
  p_token text,
  p_test_id uuid,
  p_answers jsonb,
  p_auto_score numeric,
  p_result_summary jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_id uuid;
BEGIN
  SELECT id INTO app_id
  FROM public.candidate_applications
  WHERE tests_session_token = p_token;

  IF app_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão inválida');
  END IF;

  UPDATE public.application_tests
  SET
    status = 'completed',
    answers = p_answers,
    auto_score = p_auto_score,
    result_summary = p_result_summary,
    completed_at = now()
  WHERE id = p_test_id
    AND application_id = app_id
    AND status IN ('not_started', 'in_progress');

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_application_test_in_session(text, uuid, jsonb, numeric, jsonb) TO anon, authenticated;

COMMENT ON COLUMN public.candidate_applications.tests_session_token IS
  'Token único da sessão de testes do candidato nesta vaga. Gerado automaticamente ao atribuir o primeiro teste.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.complete_application_test_in_session(text, uuid, jsonb, numeric, jsonb) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.save_application_test_progress_in_session(text, uuid, jsonb) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.start_application_test_in_session(text, uuid) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.get_application_tests_session(text) FROM anon, authenticated;
-- DROP FUNCTION IF EXISTS public.complete_application_test_in_session(text, uuid, jsonb, numeric, jsonb);
-- DROP FUNCTION IF EXISTS public.save_application_test_progress_in_session(text, uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.start_application_test_in_session(text, uuid);
-- DROP FUNCTION IF EXISTS public.get_application_tests_session(text);
-- DROP TRIGGER IF EXISTS trg_ensure_session_token ON public.application_tests;
-- DROP FUNCTION IF EXISTS public.ensure_application_tests_session_token();
-- DROP INDEX IF EXISTS public.idx_apps_tests_session_token;
-- ALTER TABLE public.candidate_applications DROP COLUMN IF EXISTS tests_session_token;
-- COMMIT;
