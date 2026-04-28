-- Migration: 20260427150300_create_agent_views.sql
-- Description: views read-only 'agent_*' pra a Fase 5 (Agentes IA).
-- Princípio: agentes nunca veem PII bruta (CPF, RG, salário individual,
-- endereço completo). Vêem agregados anonimizados ou pseudonimizados.
--
-- ADR 0003 (agents) tem a política completa. Esta migration cria as
-- primeiras 3 views pra desbloquear desenvolvimento dos agentes.

BEGIN;

-- ============================================================
-- agent_company_overview
-- Visão de alto nível por empresa: contagens, distribuições.
-- Sem PII. Usada pelo Agente Analista G&C.
-- ============================================================
CREATE VIEW public.agent_company_overview AS
SELECT
  c.id AS company_id,
  c.company_name,
  c.is_matriz,
  c.parent_company_id,
  COUNT(DISTINCT col.id) FILTER (WHERE col.status = 'ativo') AS active_collaborators,
  COUNT(DISTINCT col.id) FILTER (WHERE col.status != 'ativo') AS inactive_collaborators,
  COUNT(DISTINCT col.id) FILTER (WHERE col.regime = 'clt') AS clt_count,
  COUNT(DISTINCT col.id) FILTER (WHERE col.regime = 'pj') AS pj_count,
  COUNT(DISTINCT col.id) FILTER (WHERE col.regime = 'estagiario') AS estagiario_count,
  COUNT(DISTINCT t.id) AS teams_count,
  COUNT(DISTINCT s.id) AS stores_count
FROM public.companies c
LEFT JOIN public.collaborators col ON col.company_id = c.id
LEFT JOIN public.teams t ON t.company_id = c.id
LEFT JOIN public.stores s ON s.company_id = c.id
GROUP BY c.id, c.company_name, c.is_matriz, c.parent_company_id;

ALTER VIEW public.agent_company_overview SET (security_invoker = true);

-- ============================================================
-- agent_journey_stats
-- Estatísticas da Jornada por colaborador (sem PII direta — só id).
-- O agente correlaciona id com nome via tool específica que filtra RLS.
-- ============================================================
CREATE VIEW public.agent_journey_stats AS
SELECT
  cb.company_id,
  cb.collaborator_id,
  COUNT(*) AS badges_count,
  COUNT(DISTINCT cb.badge_id) AS unique_badges_count,
  MAX(cb.awarded_at) AS latest_award,
  MIN(cb.awarded_at) AS first_award,
  COUNT(*) FILTER (WHERE cb.awarded_at >= now() - interval '30 days') AS last_30d,
  COUNT(*) FILTER (WHERE cb.awarded_at >= now() - interval '90 days') AS last_90d
FROM public.collaborator_badges cb
GROUP BY cb.company_id, cb.collaborator_id;

ALTER VIEW public.agent_journey_stats SET (security_invoker = true);

-- ============================================================
-- agent_recruitment_pipeline
-- Snapshot do funil de recrutamento por vaga. Sem nome de candidato.
-- Útil pro Agente Recruiter avaliar saúde do pipeline.
-- ============================================================
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

-- security_invoker = true significa que a view respeita RLS do usuário
-- consultando, não do criador. Como o usuário "agente" terá um role
-- específico (a definir em ADR 0003), essa propriedade garante que
-- ele só veja company_id que está autorizado.

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP VIEW IF EXISTS public.agent_recruitment_pipeline;
--   DROP VIEW IF EXISTS public.agent_journey_stats;
--   DROP VIEW IF EXISTS public.agent_company_overview;
-- COMMIT;
