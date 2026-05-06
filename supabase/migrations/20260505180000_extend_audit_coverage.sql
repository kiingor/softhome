-- Migration: 20260505180000_extend_audit_coverage.sql
-- Description: estende a auditoria pra TODAS as tabelas relevantes do
-- dashboard. A função public.audit_log_trigger() já existe (20260427130200);
-- a primeira leva (20260428100000) anexou o trigger só nas PII core.
-- Aqui completamos: cadastros base, recrutamento, admissão, folha,
-- exames, acessos, configurações de notificação, jornada de aprendizado.
--
-- Padrão idempotente: DO block consulta pg_trigger antes de criar.
--
-- Tabelas explicitamente fora:
--   - audit_log: não pode auditar a si mesma
--   - agent_messages, agent_sessions: log de chat ia explodir o volume
--   - candidate_embeddings: payload binário grande, não faz sentido logar JSON
--   - collaborator_badges, collaborators e demais já cobertas em migrations
--     anteriores

BEGIN;

DO $$
DECLARE
  v_tables text[] := ARRAY[
    -- Cadastros base
    'companies',
    'positions',
    'position_documents',
    'teams',

    -- Benefícios
    'benefits',
    'benefits_assignments',

    -- Recrutamento
    'candidates',
    'candidate_applications',
    'job_openings',
    'interview_schedules',
    'interview_feedbacks',

    -- Admissões
    'admission_journeys',
    'admission_documents',
    'admission_events',

    -- Folha
    'payroll_periods',
    'payroll_entries',
    'payroll_payments',
    'payroll_alerts',

    -- Exames
    'occupational_exams',
    'store_holidays',

    -- Acessos
    'company_users',
    'user_permissions',
    'user_roles',

    -- Comunicação
    'notification_templates',
    'notification_logs',

    -- Jornada de conhecimento
    'journey_badges',
    'journey_milestones',

    -- Agentes IA (só configs, não chat)
    'agent_settings'
  ];
  v_table text;
  v_trigger_name text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    -- Pula tabela que não existe no banco (skip silencioso pra ficar idempotente
    -- mesmo se alguma tabela ainda não foi migrada)
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relkind = 'r'
    ) THEN
      CONTINUE;
    END IF;

    v_trigger_name := 'audit_' || v_table;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND t.tgname = v_trigger_name
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()',
        v_trigger_name, v_table
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TRIGGER IF EXISTS audit_companies ON public.companies;
--   DROP TRIGGER IF EXISTS audit_positions ON public.positions;
--   DROP TRIGGER IF EXISTS audit_position_documents ON public.position_documents;
--   DROP TRIGGER IF EXISTS audit_teams ON public.teams;
--   DROP TRIGGER IF EXISTS audit_benefits ON public.benefits;
--   DROP TRIGGER IF EXISTS audit_benefits_assignments ON public.benefits_assignments;
--   DROP TRIGGER IF EXISTS audit_candidates ON public.candidates;
--   DROP TRIGGER IF EXISTS audit_candidate_applications ON public.candidate_applications;
--   DROP TRIGGER IF EXISTS audit_job_openings ON public.job_openings;
--   DROP TRIGGER IF EXISTS audit_interview_schedules ON public.interview_schedules;
--   DROP TRIGGER IF EXISTS audit_interview_feedbacks ON public.interview_feedbacks;
--   DROP TRIGGER IF EXISTS audit_admission_journeys ON public.admission_journeys;
--   DROP TRIGGER IF EXISTS audit_admission_documents ON public.admission_documents;
--   DROP TRIGGER IF EXISTS audit_admission_events ON public.admission_events;
--   DROP TRIGGER IF EXISTS audit_payroll_periods ON public.payroll_periods;
--   DROP TRIGGER IF EXISTS audit_payroll_entries ON public.payroll_entries;
--   DROP TRIGGER IF EXISTS audit_payroll_payments ON public.payroll_payments;
--   DROP TRIGGER IF EXISTS audit_payroll_alerts ON public.payroll_alerts;
--   DROP TRIGGER IF EXISTS audit_occupational_exams ON public.occupational_exams;
--   DROP TRIGGER IF EXISTS audit_store_holidays ON public.store_holidays;
--   DROP TRIGGER IF EXISTS audit_company_users ON public.company_users;
--   DROP TRIGGER IF EXISTS audit_user_permissions ON public.user_permissions;
--   DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
--   DROP TRIGGER IF EXISTS audit_notification_templates ON public.notification_templates;
--   DROP TRIGGER IF EXISTS audit_notification_logs ON public.notification_logs;
--   DROP TRIGGER IF EXISTS audit_journey_badges ON public.journey_badges;
--   DROP TRIGGER IF EXISTS audit_journey_milestones ON public.journey_milestones;
--   DROP TRIGGER IF EXISTS audit_agent_settings ON public.agent_settings;
-- COMMIT;
