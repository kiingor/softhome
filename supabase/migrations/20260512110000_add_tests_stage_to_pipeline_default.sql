-- Migration: 20260512110000_add_tests_stage_to_pipeline_default.sql
-- Description: adiciona o stage 'tests' como default em job_openings.pipeline_stages,
-- posicionado entre 'interview_hr' e 'interview_manager'. Backfill em vagas
-- existentes que ainda não tenham o stage.
--
-- Por que aqui e não no `customizable_pipeline_stages`: o stage 'tests' só fez
-- sentido depois que o sistema de Testes na Vaga foi criado (migration
-- 20260512101100_create_application_tests). Vagas anteriores não tinham essa
-- etapa.

BEGIN;

-- 1) Novo DEFAULT da coluna (vagas novas)
ALTER TABLE public.job_openings
  ALTER COLUMN pipeline_stages SET DEFAULT ARRAY[
    'new',
    'screening',
    'interview_hr',
    'tests',
    'interview_manager',
    'offer',
    'accepted'
  ];

-- 2) Backfill: vagas existentes que ainda não tenham 'tests' no pipeline.
-- Inserimos logo após 'interview_hr'. Se não houver 'interview_hr', adicionamos
-- no fim antes de 'accepted'.
WITH targets AS (
  SELECT id, pipeline_stages
  FROM public.job_openings
  WHERE NOT ('tests' = ANY(pipeline_stages))
),
positioned AS (
  SELECT
    t.id,
    -- índice do 'interview_hr' (1-based em SQL); 0 se não existir
    COALESCE(array_position(t.pipeline_stages, 'interview_hr'), 0) AS hr_idx,
    -- índice do 'accepted' (1-based); fim se não existir
    COALESCE(array_position(t.pipeline_stages, 'accepted'), array_length(t.pipeline_stages, 1) + 1) AS accepted_idx,
    t.pipeline_stages AS old
  FROM targets t
)
UPDATE public.job_openings jo
SET pipeline_stages = (
  CASE
    WHEN p.hr_idx > 0 THEN
      -- insere 'tests' logo após 'interview_hr'
      p.old[1:p.hr_idx] || ARRAY['tests']::text[] || p.old[p.hr_idx + 1:]
    ELSE
      -- insere 'tests' antes do 'accepted' (ou no fim)
      p.old[1:p.accepted_idx - 1] || ARRAY['tests']::text[] || p.old[p.accepted_idx:]
  END
)
FROM positioned p
WHERE jo.id = p.id;

COMMENT ON COLUMN public.job_openings.pipeline_stages IS
  'Lista ordenada dos stages do pipeline da vaga. Default inclui ''tests'' entre ''interview_hr'' e ''interview_manager'' (desde 2026-05-12).';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- -- Volta o default antigo
-- ALTER TABLE public.job_openings
--   ALTER COLUMN pipeline_stages SET DEFAULT ARRAY[
--     'new', 'screening', 'interview_hr', 'interview_manager', 'offer', 'accepted'
--   ];
-- -- Remove 'tests' do pipeline das vagas (mas candidatos com stage='tests'
-- -- ficam órfãos — RH deve movê-los antes do rollback).
-- UPDATE public.job_openings
-- SET pipeline_stages = array_remove(pipeline_stages, 'tests')
-- WHERE 'tests' = ANY(pipeline_stages);
-- COMMIT;
