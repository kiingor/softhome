-- Migration: 20260702120000_remove_test_link_expiration.sql
-- Description: remove a EXPIRAÇÃO dos links de teste do candidato.
--
-- Antes:
--   • as 4 RPCs públicas gatilhavam em (expires_at IS NULL OR expires_at > now())
--     — expiração por tempo;
--   • get_application_test_by_token só retornava status not_started/in_progress,
--     então um teste JÁ CONCLUÍDO fazia o link mostrar "Link inválido ou expirado".
--
-- Depois:
--   • sem guarda de tempo em nenhuma RPC (o link nunca expira);
--   • a LEITURA devolve o teste em qualquer status — a página então mostra a
--     tela "Teste concluído" pra quem já respondeu, em vez de "expirado";
--   • as ESCRITAS (start/save/complete) mantêm a guarda de status
--     (not_started/in_progress), então um teste concluído NÃO pode ser
--     reiniciado nem reenviado — dado do candidato fica protegido.

BEGIN;

-- ── READ: sem guarda de tempo e sem filtro de status ─────────────────────────
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
  LIMIT 1
$$;

-- ── START: sem guarda de tempo (mantém guarda de status) ─────────────────────
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
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Link inválido ou teste já finalizado.'
    );
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── SAVE: sem guarda de tempo ────────────────────────────────────────────────
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
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', v_id IS NOT NULL);
END;
$$;

-- ── COMPLETE: sem guarda de tempo ────────────────────────────────────────────
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
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Não foi possível registrar (teste já finalizado).'
    );
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMIT;

-- ROLLBACK
-- Restaura as guardas de tempo/status das migrations 20260512101100 e
-- 20260623150000 (re-executar aquelas versões das funções).
