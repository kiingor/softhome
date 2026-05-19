-- Migration: 20260518181654_truncate_core_entities.sql
-- Description: reset total das 4 entidades core (stores, teams, positions,
-- collaborators) e TODAS as tabelas filhas via TRUNCATE CASCADE.
--
-- Uso típico: preparar o banco pra rerodar a sync com api.softcom.cloud
-- a partir de um estado pristine. Aplicar em homol/dev; NÃO aplicar em
-- produção sem aval expresso.
--
-- ⚠️ DESTRUTIVO E IRREVERSÍVEL.
--
-- Por causa do CASCADE, os seguintes filhos serão zerados também
-- (lista derivada de REFERENCES ... ON DELETE CASCADE nas migrations):
--   collaborator_documents, collaborator_badges, journey_milestones,
--   payslips, vacation_periods, vacation_requests, exam_documents,
--   medical_certificates, collaborator_timeline, dependents, contacts,
--   uniform_sizes, alimony_orders, bonus_payments,
--   collaborator_notifications, payroll_entries, payroll_payments,
--   payroll_alerts, position_documents, benefits_assignments,
--   store_holidays
--
-- FKs com ON DELETE SET NULL não zeram, apenas perdem a referência:
--   profiles.store_id, admission_journeys.position_id/collaborator_id,
--   recruitment.position_id/team_id, etc.
--
-- TRUNCATE NÃO dispara o audit_log_trigger (que é AFTER INSERT/UPDATE/
-- DELETE, não AFTER TRUNCATE). O reset não aparece no audit_log — se
-- precisar rastrear, registrar manualmente antes/depois.

BEGIN;

TRUNCATE TABLE
  public.collaborators,
  public.positions,
  public.teams,
  public.stores
RESTART IDENTITY
CASCADE;

COMMIT;

-- ROLLBACK: não há. TRUNCATE confirmado é irreversível fora da transação.
-- Pra restaurar, usar backup (point-in-time recovery do Supabase) ou
-- redumpar dados de outro ambiente.
