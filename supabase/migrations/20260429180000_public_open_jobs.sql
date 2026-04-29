-- Migration: 20260429180000_public_open_jobs.sql
-- Description: permite SELECT anônimo em job_openings com status='open'
-- pra que o form público de candidatura (/aplicar/:jobId) consiga mostrar
-- título/descrição/requisitos da vaga ao candidato sem login.
--
-- Privacidade: vagas em rascunho/pausadas/preenchidas/canceladas continuam
-- invisíveis publicamente. Só vagas explicitamente abertas.

BEGIN;

CREATE POLICY "anon reads open jobs"
  ON public.job_openings FOR SELECT
  TO anon
  USING (status = 'open');

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "anon reads open jobs" ON public.job_openings;
-- COMMIT;
