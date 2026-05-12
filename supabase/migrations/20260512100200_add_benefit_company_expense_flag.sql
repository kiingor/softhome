-- Migration: 20260512100200_add_benefit_company_expense_flag.sql
-- Description: adiciona flag is_company_expense em benefits. Quando false,
-- o benefício NÃO entra em relatórios de despesa da empresa (caso típico:
-- plano odontológico custeado integralmente pelo colaborador via desconto
-- em folha). O valor continua aparecendo no contracheque para transparência,
-- mas não é contabilizado como custo do empregador.

BEGIN;

ALTER TABLE public.benefits
  ADD COLUMN IF NOT EXISTS is_company_expense boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.benefits.is_company_expense IS
  'Se true (default), o benefício é despesa da empresa e entra em relatórios. Se false, o custo é integralmente do colaborador (ex: plano odontológico opcional).';

CREATE INDEX IF NOT EXISTS idx_benefits_company_expense
  ON public.benefits(company_id) WHERE is_company_expense = false;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_benefits_company_expense;
-- ALTER TABLE public.benefits DROP COLUMN IF EXISTS is_company_expense;
-- COMMIT;
