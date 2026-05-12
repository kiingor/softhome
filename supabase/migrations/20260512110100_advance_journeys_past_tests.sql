-- Migration: 20260512110100_advance_journeys_past_tests.sql
-- Description: testes na admissão foram movidos para a fase de Recrutamento
-- (vagas). Journeys ainda em 'tests_pending' ou 'tests_in_review' são avançadas
-- para 'docs_pending' para não ficarem presas em um stage que sumiu da UI.
--
-- Os enums permanecem na coluna por compatibilidade, mas não são mais usados
-- para fluxo novo.

BEGIN;

UPDATE public.admission_journeys
SET status = 'docs_pending'
WHERE status IN ('tests_pending', 'tests_in_review');

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Sem rollback automático: não temos como saber qual stage tinha antes.
-- Se precisar reverter, faça com `UPDATE ... SET status = 'tests_pending'
-- WHERE id IN (...)` manualmente para os journey IDs específicos.
