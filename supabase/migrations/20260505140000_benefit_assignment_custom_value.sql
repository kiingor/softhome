-- Migration: 20260505140000_benefit_assignment_custom_value.sql
-- Description: permite override de valor mensal por colaborador em benefícios
-- com value_type='monthly'. Útil quando um colaborador específico tem um VR/VA
-- diferente do valor padrão do benefício (ex: cargo de liderança com plano superior).
--
-- Quando custom_value é NULL, usa o valor padrão do benefício.
-- Quando custom_value tem valor, sobrescreve só pra esse collaborator.

BEGIN;

ALTER TABLE public.benefits_assignments
  ADD COLUMN IF NOT EXISTS custom_value numeric(12, 2)
    CHECK (custom_value IS NULL OR custom_value >= 0);

COMMENT ON COLUMN public.benefits_assignments.custom_value IS
  'Override do valor mensal do benefício pra esse colaborador. NULL = usa valor padrão do benefício. Aplicável apenas pra benefits.value_type = monthly.';

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.benefits_assignments DROP COLUMN IF EXISTS custom_value;
-- COMMIT;
