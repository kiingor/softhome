-- Migration: 20260430120000_create_analyst_agent_views.sql
-- Description: views agregadas adicionais pra o Agente Analista G&C.
-- Mesmas regras de antes: read-only, security_invoker, sem PII bruta.

BEGIN;

-- ============================================================
-- agent_admission_funnel
-- Funil de admissão por status + regime. Permite agente responder
-- "quantas admissões em revisão?", "quantas estagiários em onboarding?",
-- "média de dias em cada status?".
-- ============================================================
CREATE VIEW public.agent_admission_funnel AS
SELECT
  company_id,
  status,
  regime,
  COUNT(*) AS count,
  AVG(EXTRACT(epoch FROM (now() - created_at)) / 86400)::numeric(10, 1)
    AS avg_days_in_status,
  MIN(created_at) AS oldest_journey_at,
  MAX(updated_at) AS latest_movement_at
FROM public.admission_journeys
GROUP BY company_id, status, regime;

ALTER VIEW public.agent_admission_funnel SET (security_invoker = true);

COMMENT ON VIEW public.agent_admission_funnel IS
  'Agregação de admission_journeys por (company, status, regime) — sem PII.';

-- ============================================================
-- agent_milestone_overview
-- Marcos da Jornada agregados. Responde "quantos marcos atrasados?",
-- "quem tá com d30 due?", "como tá a saúde da jornada do time?".
-- ============================================================
CREATE VIEW public.agent_milestone_overview AS
SELECT
  company_id,
  status,
  kind,
  COUNT(*) AS count,
  AVG(badges_count)::numeric(10, 2) AS avg_badges_at_milestone
FROM public.journey_milestones
GROUP BY company_id, status, kind;

ALTER VIEW public.agent_milestone_overview SET (security_invoker = true);

COMMENT ON VIEW public.agent_milestone_overview IS
  'Agregação de journey_milestones por (company, status, kind) — sem PII.';

-- ============================================================
-- agent_collaborator_distribution
-- Distribuição de colaboradores por team + cargo (texto livre).
-- Responde "qual time tem mais gente?", "como tá o mix de regime?".
-- Sem nome, salário, CPF — só contagens.
-- ============================================================
CREATE VIEW public.agent_collaborator_distribution AS
SELECT
  col.company_id,
  col.regime,
  col.status,
  t.name AS team_name,
  col.position AS position_title,
  COUNT(*) AS count
FROM public.collaborators col
LEFT JOIN public.teams t ON t.id = col.team_id
GROUP BY col.company_id, col.regime, col.status, t.name, col.position;

ALTER VIEW public.agent_collaborator_distribution SET (security_invoker = true);

COMMENT ON VIEW public.agent_collaborator_distribution IS
  'Distribuição de collaborators por (regime, status, team, position) — sem PII.';

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP VIEW IF EXISTS public.agent_collaborator_distribution;
--   DROP VIEW IF EXISTS public.agent_milestone_overview;
--   DROP VIEW IF EXISTS public.agent_admission_funnel;
-- COMMIT;
