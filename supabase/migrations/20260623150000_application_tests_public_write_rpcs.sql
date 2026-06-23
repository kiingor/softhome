-- Migration: 20260623150000_application_tests_public_write_rpcs.sql
-- Description: RPCs públicas (SECURITY DEFINER) pra o candidato ESCREVER no seu
-- teste via token, no fluxo de recrutamento (/recrutamento/teste/:token).
--
-- BUG QUE ISSO CORRIGE:
--   A página pública AplicarTestePage gravava status/answers fazendo UPDATE
--   direto em application_tests pelo client anônimo. Mas a RLS da tabela só
--   libera RH/admin (policies "Application tests: RH read/manage"). Um UPDATE
--   anônimo casava 0 linhas e o supabase-js NÃO retorna erro nesse caso — então
--   o candidato via "Teste concluído!" mas nada persistia: status ficava preso
--   em 'in_progress', respostas não salvavam e o link continuava reutilizável
--   pra sempre (get_application_test_by_token só esconde quando status vira
--   'completed'/'reviewed', o que nunca acontecia).
--
-- SOLUÇÃO: espelhar o que get_application_test_by_token já faz pra LEITURA —
-- funções SECURITY DEFINER que recebem o token como credencial e tocam só na
-- linha daquele token, com guarda de status (anti-replay) e de expiração.
-- O token (32 hex de gen_random_uuid) é o segredo; ninguém sem ele acerta a
-- linha. RH continua revisando (reviewer_score), então score auto enviado pelo
-- cliente segue o mesmo modelo de confiança de antes.
--
-- Obs.: o audit_log_trigger continua disparando (AFTER UPDATE) e grava user_id
-- = auth.uid() (NULL pro candidato anônimo, coluna é nullable) — auditoria ok.

BEGIN;

-- ── START ────────────────────────────────────────────────────────────────────
-- not_started → in_progress (idempotente: se já está in_progress, mantém
-- started_at original via COALESCE).
CREATE OR REPLACE FUNCTION public.start_application_test_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.application_tests
     SET status = 'in_progress',
         started_at = COALESCE(started_at, now())
   WHERE access_token = p_token
     AND status IN ('not_started', 'in_progress')
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Link inválido, expirado ou teste já finalizado.'
    );
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── SAVE (autosave de progresso) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_application_test_progress_by_token(
  p_token text,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.application_tests
     SET answers = p_answers
   WHERE access_token = p_token
     AND status IN ('not_started', 'in_progress')
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', v_id IS NOT NULL);
END;
$$;

-- ── COMPLETE ─────────────────────────────────────────────────────────────────
-- Finaliza. Guarda de status impede re-submit/overwrite de teste já concluído.
CREATE OR REPLACE FUNCTION public.complete_application_test_by_token(
  p_token text,
  p_answers jsonb,
  p_auto_score numeric,
  p_result_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.application_tests
     SET status = 'completed',
         answers = p_answers,
         auto_score = p_auto_score,
         result_summary = p_result_summary,
         completed_at = now()
   WHERE access_token = p_token
     AND status IN ('not_started', 'in_progress')
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Não foi possível registrar (link expirado ou teste já finalizado).'
    );
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_application_test_by_token(text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_application_test_progress_by_token(text, jsonb)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_application_test_by_token(text, jsonb, numeric, jsonb)
  TO anon, authenticated;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.complete_application_test_by_token(text, jsonb, numeric, jsonb) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.save_application_test_progress_by_token(text, jsonb) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.start_application_test_by_token(text) FROM anon, authenticated;
-- DROP FUNCTION IF EXISTS public.complete_application_test_by_token(text, jsonb, numeric, jsonb);
-- DROP FUNCTION IF EXISTS public.save_application_test_progress_by_token(text, jsonb);
-- DROP FUNCTION IF EXISTS public.start_application_test_by_token(text);
-- COMMIT;
