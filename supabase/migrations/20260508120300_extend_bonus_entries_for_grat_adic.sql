-- Migration: 20260508120300_extend_bonus_entries_for_grat_adic.sql
-- Description: estende bonus_entries pra suportar inclusão de Gratificação e
-- Adicional na base do 13º salário (regra CLT art. 457 — médias/somas de
-- proventos habituais entram na base do 13º). Snapshot dos componentes no
-- momento da criação/regeneração da entry pra garantir auditoria.
--
-- Fórmula nova:
--   gross_value = (base_salary × months_worked + gratificacao_sum + adicional_monthly × months_worked) / 12
--
-- Default 0 mantém comportamento idêntico ao anterior pra entries antigas
-- (sem precisar de backfill — ano-passado fica congelado como estava).

BEGIN;

ALTER TABLE public.bonus_entries
  ADD COLUMN IF NOT EXISTS gratificacao_sum numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional_monthly numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bonus_entries.gratificacao_sum IS
  'Soma das Gratificações lançadas no ano da campanha em payroll_entries (type=gratificacao). Snapshot no momento da criação da entry. Pro-rata CLT: este valor é dividido por 12 e somado ao bruto.';

COMMENT ON COLUMN public.bonus_entries.adicional_monthly IS
  'Soma do valor mensal das atribuições de benefício categoria "adicional" do colaborador. Snapshot no momento da criação. Pro-rata CLT: este valor × meses_trabalhados é dividido por 12 e somado ao bruto.';

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.bonus_entries
--   DROP COLUMN IF EXISTS gratificacao_sum,
--   DROP COLUMN IF EXISTS adicional_monthly;
-- COMMIT;
