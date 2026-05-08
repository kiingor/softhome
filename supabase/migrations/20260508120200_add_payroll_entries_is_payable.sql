-- Migration: 20260508120200_add_payroll_entries_is_payable.sql
-- Description: adiciona flag is_payable em payroll_entries pra indicar se um
-- lançamento entra na lista pagável da aba Pagamentos da folha. Hoje a regra
-- é "type != 'beneficio'" (benefícios são vouchers/serviços, pagos por outro
-- fluxo). A nova categoria de benefício "Adicional" é dinheiro: precisa ser
-- pagável mesmo sendo type='beneficio'.
--
-- Snapshot na criação da entry: o valor é definido pelo auto-populate da folha
-- (baseado em benefits.category) e não muda mesmo se a categoria do benefício
-- for alterada depois — comportamento esperado pra histórico de folha.

BEGIN;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS is_payable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payroll_entries.is_payable IS
  'Se true, entra na lista pagável da aba Pagamentos. Para entries de tipo != beneficio o valor padrão (via backfill) é true. Para beneficios, é true apenas se o benefício for da categoria adicional.';

-- Backfill: tudo que não é benefício hoje já é pagável (salário, HE, gratificação, etc.).
UPDATE public.payroll_entries
   SET is_payable = true
 WHERE type <> 'beneficio';

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.payroll_entries DROP COLUMN IF EXISTS is_payable;
-- COMMIT;
