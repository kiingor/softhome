-- Migration: 20260427120000_drop_saas_schema.sql
-- Description: dropa a camada SaaS herdada do fork meurh.
--
-- Remove tabelas, view, colunas, funções e configurações que
-- existiam pra suportar trial/assinatura/billing Asaas/master admin
-- multi-tenant. SoftHome é single-tenant interno — nada disso aplica.
--
-- Banco-alvo está vazio na aplicação desta migration; rollback é
-- ceremonial (re-aplicar migrations 20260120010131..20260218221859 reproduz
-- o estado anterior).

BEGIN;

-- 1. View dependente de colunas que serão dropadas
DROP VIEW IF EXISTS public.companies_overview CASCADE;

-- 2. Funções SaaS (CASCADE remove policies/triggers que dependam delas)
DROP FUNCTION IF EXISTS public.can_add_collaborator(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_plan_limit(text) CASCADE;
DROP FUNCTION IF EXISTS public.is_master_admin(uuid) CASCADE;

-- 3. Tabelas SaaS
DROP TABLE IF EXISTS public.subscription_history CASCADE;
DROP TABLE IF EXISTS public.master_admins CASCADE;

-- 4. Colunas de billing/trial em companies
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS plan_type,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS subscription_due_date,
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS asaas_customer_id,
  DROP COLUMN IF EXISTS asaas_subscription_id,
  DROP COLUMN IF EXISTS is_blocked;

-- 5. Settings de integração Asaas
DELETE FROM public.system_settings
WHERE setting_key LIKE 'asaas_%';

COMMIT;

-- ROLLBACK
-- Reverter exige recriar tabelas (subscription_history, master_admins),
-- view companies_overview, funções (can_add_collaborator, get_plan_limit,
-- is_master_admin), colunas de companies e linhas asaas_* em system_settings,
-- todas com suas policies/triggers/índices originais. As definições estão
-- nas migrations 20260120010131..20260218221859 — re-aplicar essas migrations
-- na ordem reproduz o estado anterior.
--
-- BEGIN;
--   -- ver migrations originais; este bloco é apenas indicativo
-- COMMIT;
