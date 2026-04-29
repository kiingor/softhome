-- Migration: 20260428100000_attach_audit_triggers_pii.sql
-- Description: anexa a função public.audit_log_trigger() (criada em
-- 20260427130200_create_audit_log.sql) a todas as tabelas com PII que
-- ainda não tinham trigger de auditoria.
--
-- LGPD obrigatório (CLAUDE.md princípio 1): "Audit log em toda tabela
-- com PII." A infraestrutura (audit_log + função) já existia, mas só
-- collaborator_badges tinha o trigger conectado. As tabelas abaixo
-- carregam PII direta (CPF, RG, salário, endereço, telefone, dados
-- médicos, nome completo) e passam a registrar todo INSERT/UPDATE/DELETE
-- em public.audit_log.
--
-- Tabelas fora deste escopo (mantidas sem trigger por design):
--   - badges, system_settings: catálogo/config sem PII
--   - user_roles: apenas atribuição de papel
--   - benefits, positions, teams, stores, companies: sem PII por pessoa
--   - collaborator_badges: já possui trigger
--   - admission_*, candidates, job_openings, applications, payroll_periods:
--     migrations ainda em draft, já incluem trigger no próprio schema
--
-- Usa DO block + pg_trigger lookup pra ser idempotente (CREATE TRIGGER
-- não suporta IF NOT EXISTS antes do Postgres 14, e mesmo no 14+ é
-- recente; o padrão DO mantém compatibilidade).

BEGIN;

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'collaborators',
    'collaborator_documents',
    'profiles',
    'payslips',
    'exam_documents',
    'vacation_periods',
    'vacation_requests',
    'onboarding_sessions',
    'onboarding_errors',
    'whatsapp_instances'
  ];
  v_table text;
  v_trigger_name text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
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
--   DROP TRIGGER IF EXISTS audit_collaborators ON public.collaborators;
--   DROP TRIGGER IF EXISTS audit_collaborator_documents ON public.collaborator_documents;
--   DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
--   DROP TRIGGER IF EXISTS audit_payslips ON public.payslips;
--   DROP TRIGGER IF EXISTS audit_exam_documents ON public.exam_documents;
--   DROP TRIGGER IF EXISTS audit_vacation_periods ON public.vacation_periods;
--   DROP TRIGGER IF EXISTS audit_vacation_requests ON public.vacation_requests;
--   DROP TRIGGER IF EXISTS audit_onboarding_sessions ON public.onboarding_sessions;
--   DROP TRIGGER IF EXISTS audit_onboarding_errors ON public.onboarding_errors;
--   DROP TRIGGER IF EXISTS audit_whatsapp_instances ON public.whatsapp_instances;
-- COMMIT;
