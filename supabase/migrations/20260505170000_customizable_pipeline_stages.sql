-- Migration: 20260505170000_customizable_pipeline_stages.sql
-- Description: torna o pipeline de cada vaga customizável.
--   - candidate_applications.stage vira text (deixa o enum como legacy)
--   - job_openings ganha pipeline_stages text[] com a lista do RH
--
-- Os valores default seguem os 6 stages que existiam ('new', 'screening',
-- 'interview_hr', 'interview_manager', 'offer', 'accepted'). 'rejected' e
-- 'withdrawn' continuam sendo terminais e ficam fora do pipeline visível.

BEGIN;

-- A view agent_recruitment_pipeline depende de candidate_applications.stage,
-- então precisa ser dropada antes do ALTER COLUMN. Recriada igual depois
-- (os filtros stage = 'new' etc. funcionam tanto pra enum quanto text).
DROP VIEW IF EXISTS public.agent_recruitment_pipeline;

-- Converte a coluna pra text (mantém os valores existentes).
ALTER TABLE public.candidate_applications
  ALTER COLUMN stage TYPE text USING stage::text;

-- Default volta a ser 'new' (text agora).
ALTER TABLE public.candidate_applications
  ALTER COLUMN stage SET DEFAULT 'new';

-- Recria a view com o mesmo body que tinha (origem:
-- 20260427150300_create_agent_views.sql).
CREATE VIEW public.agent_recruitment_pipeline AS
SELECT
  jo.company_id,
  jo.id AS job_id,
  jo.title,
  jo.regime,
  jo.status,
  jo.opened_at,
  COUNT(ca.id) AS total_applications,
  COUNT(ca.id) FILTER (WHERE ca.stage = 'new') AS stage_new,
  COUNT(ca.id) FILTER (WHERE ca.stage = 'screening') AS stage_screening,
  COUNT(ca.id) FILTER (WHERE ca.stage = 'interview_hr') AS stage_interview_hr,
  COUNT(ca.id) FILTER (WHERE ca.stage = 'interview_manager') AS stage_interview_manager,
  COUNT(ca.id) FILTER (WHERE ca.stage = 'offer') AS stage_offer,
  COUNT(ca.id) FILTER (WHERE ca.stage = 'accepted') AS stage_accepted,
  COUNT(ca.id) FILTER (WHERE ca.stage = 'rejected') AS stage_rejected,
  AVG(ca.ai_score) FILTER (WHERE ca.ai_score IS NOT NULL) AS avg_ai_score
FROM public.job_openings jo
LEFT JOIN public.candidate_applications ca ON ca.job_id = jo.id
GROUP BY jo.id, jo.company_id, jo.title, jo.regime, jo.status, jo.opened_at;

ALTER VIEW public.agent_recruitment_pipeline SET (security_invoker = true);

-- Adiciona a lista de stages por vaga.
ALTER TABLE public.job_openings
  ADD COLUMN IF NOT EXISTS pipeline_stages text[] NOT NULL
    DEFAULT ARRAY[
      'new',
      'screening',
      'interview_hr',
      'interview_manager',
      'offer',
      'accepted'
    ];

COMMENT ON COLUMN public.job_openings.pipeline_stages IS
  'Etapas do pipeline kanban dessa vaga. Editável pelo RH (adicionar/remover/reordenar). Os valores são livres — pra texto custom, mantém slug em snake_case.';

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.job_openings DROP COLUMN IF EXISTS pipeline_stages;
-- ALTER TABLE public.candidate_applications
--   ALTER COLUMN stage DROP DEFAULT;
-- ALTER TABLE public.candidate_applications
--   ALTER COLUMN stage TYPE public.application_stage USING stage::public.application_stage;
-- ALTER TABLE public.candidate_applications
--   ALTER COLUMN stage SET DEFAULT 'new'::public.application_stage;
-- COMMIT;
