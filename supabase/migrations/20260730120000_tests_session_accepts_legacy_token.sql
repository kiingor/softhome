-- Migration: 20260730120000_tests_session_accepts_legacy_token.sql
-- Description: a tela pública de testes passou a resolver a sessão inteira pelo
-- `candidate_applications.tests_session_token`. Só que candidato que recebeu
-- link ANTES dessa mudança tem na mão um `application_tests.access_token`
-- (1 link por teste). Sem isso, esses links passam a dar "Link inválido".
--
-- Aqui as 4 RPCs públicas passam a aceitar QUALQUER um dos dois tokens: o da
-- sessão ou o de um teste individual da mesma candidatura. Link antigo abre a
-- lista completa, link novo idem — ninguém fica na mão.
--
-- Não amplia exposição: os dois tokens têm a mesma entropia (128 bits, hex de
-- uuid) e já davam acesso ao mesmo conjunto de dados dessa candidatura.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Resolve a candidatura a partir de token de sessão OU de teste (legado).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_tests_session_application(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.id
  FROM public.candidate_applications ca
  WHERE ca.tests_session_token = p_token
  UNION ALL
  SELECT at.application_id
  FROM public.application_tests at
  WHERE at.access_token = p_token
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_tests_session_application(text) IS
  'Aceita o token da sessão de testes ou o access_token legado de um teste. Retorna NULL se nenhum bater.';

-- Helper interna: não precisa virar endpoint no PostgREST. As RPCs públicas
-- abaixo são SECURITY DEFINER, então continuam podendo chamá-la.
REVOKE EXECUTE ON FUNCTION public.resolve_tests_session_application(text)
  FROM PUBLIC, anon, authenticated;

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
  WHERE ca.id = public.resolve_tests_session_application(p_token)
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
  v_id uuid;
BEGIN
  app_id := public.resolve_tests_session_application(p_token);

  IF app_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão inválida');
  END IF;

  UPDATE public.application_tests
  SET
    status = 'in_progress',
    started_at = COALESCE(started_at, now())
  WHERE id = p_test_id
    AND application_id = app_id
    AND status IN ('not_started', 'in_progress')
  RETURNING id INTO v_id;

  -- Sem linha casada = teste já finalizado. Devolver ok:true aqui deixaria o
  -- candidato responder tudo de novo pra ver a resposta ser descartada no fim
  -- (mesmo motivo documentado em 20260623150000 pras RPCs *_by_token).
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esse teste já foi finalizado.');
  END IF;

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
  v_id uuid;
BEGIN
  app_id := public.resolve_tests_session_application(p_token);

  IF app_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sessão inválida');
  END IF;

  UPDATE public.application_tests
  SET answers = p_answers
  WHERE id = p_test_id
    AND application_id = app_id
    AND status IN ('not_started', 'in_progress')
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esse teste já foi finalizado.');
  END IF;

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
  v_id uuid;
BEGIN
  app_id := public.resolve_tests_session_application(p_token);

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
    AND status IN ('not_started', 'in_progress')
  RETURNING id INTO v_id;

  -- Não sobrescreve resposta já finalizada (anti-replay), mas AVISA em vez de
  -- fingir sucesso: senão o candidato responde tudo numa segunda aba e é
  -- informado de que gravou, quando não gravou.
  IF v_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Esse teste já foi finalizado. Suas respostas anteriores estão salvas.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_application_test_in_session(text, uuid, jsonb, numeric, jsonb) TO anon, authenticated;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Volta as 4 RPCs a resolverem SÓ pelo tests_session_token: reaplique o corpo
-- original de supabase/migrations/20260512120000_application_tests_session.sql
-- (as 4 funções lá são CREATE OR REPLACE, então rodar aquele arquivo de novo
-- reverte este — inclusive o guard de 0 linhas, que lá não existe) e então
-- derrube a helper, que aí fica sem chamador:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.resolve_tests_session_application(text);
-- COMMIT;
--
-- ATENÇÃO: rodar só o DROP acima, sem reaplicar a 20260512120000 antes, quebra
-- as 4 RPCs públicas (elas passam a chamar função inexistente). A ordem importa.
