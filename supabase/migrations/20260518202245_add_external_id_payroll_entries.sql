-- Migration: 20260518202245_add_external_id_payroll_entries.sql
-- Description: adiciona external_id em payroll_entries pra suportar upsert
-- idempotente quando sincronizamos adicionais financeiros vindos da
-- api.softcom.cloud (tipos CUSTO SETOR, GRATIFICAÇÃO ESPONTANEA, salário base).
--
-- O unique é por (collaborator_id, external_id). Permite múltiplas linhas com
-- external_id NULL (manuais).

BEGIN;

ALTER TABLE public.payroll_entries
  ADD COLUMN external_id text;

ALTER TABLE public.payroll_entries
  ADD CONSTRAINT payroll_entries_collab_external_uk UNIQUE (collaborator_id, external_id);

COMMIT;

-- ROLLBACK
-- BEGIN;
--   ALTER TABLE public.payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_collab_external_uk;
--   ALTER TABLE public.payroll_entries DROP COLUMN IF EXISTS external_id;
-- COMMIT;
