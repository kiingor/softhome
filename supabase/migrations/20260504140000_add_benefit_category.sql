-- Migration: 20260504140000_add_benefit_category.sql
-- Description: adiciona enum 'benefit_category' e coluna em benefits
-- pra distinguir tipos (alimentação, transporte, saúde, creche, etc).
--
-- Importante separar tipos de cálculo monetário (value_type=monthly/daily,
-- já existe) — categoria é pra:
--   - Relatórios pro contador (quanto de VR vs VT no mês)
--   - eSocial futuramente (rubricas separadas)
--   - Regra do VT 6% (CLT) — só aplica se categoria='transport'
--   - Filtros e agrupamentos no produto
--
-- Coluna NOT NULL DEFAULT 'other' — backfill seguro pra benefícios já
-- cadastrados (admin pode reclassificar via UI depois).

BEGIN;

-- Enum
CREATE TYPE public.benefit_category AS ENUM (
  'meal',         -- VR, VA (Vale Refeição/Alimentação)
  'transport',    -- VT (Vale Transporte)
  'health',       -- Plano de Saúde / Odontológico
  'daycare',      -- Auxílio Creche
  'bonus',        -- Bônus / PLR
  'other'         -- Outros
);

-- Coluna
ALTER TABLE public.benefits
  ADD COLUMN IF NOT EXISTS category public.benefit_category
    NOT NULL DEFAULT 'other';

-- Índice (filtros frequentes em relatórios por categoria)
CREATE INDEX IF NOT EXISTS idx_benefits_category
  ON public.benefits(company_id, category);

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP INDEX IF EXISTS public.idx_benefits_category;
--   ALTER TABLE public.benefits DROP COLUMN IF EXISTS category;
--   DROP TYPE IF EXISTS public.benefit_category;
-- COMMIT;
