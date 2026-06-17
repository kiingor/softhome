-- Férias: separa Período de Competência (aquisitivo) do Período de Gozo e
-- guarda a Data Limite (vencimento) que a agenda já manda mas era descartada.
--
-- Antes: a sync jogava as datas de GOZO (periodoInGozo/Fn) dentro de
-- start_date/end_date, mas a UI rotula esses campos como "Período Aquisitivo"
-- — descasamento. E o dataLimite da agenda (vencimento oficial) era ignorado;
-- a UI aproximava como end_date + 365.
--
-- Agora: start_date/end_date passam a representar o Período de Competência
-- (= periodoIn/Fn). Período de Gozo ganha colunas próprias e a Data Limite é
-- persistida. Campos novos são nullable (nem todo período tem gozo agendado).
-- A repopulação correta vem do re-sync da agenda.

ALTER TABLE public.vacation_periods
  ADD COLUMN IF NOT EXISTS gozo_start_date date,
  ADD COLUMN IF NOT EXISTS gozo_end_date date,
  ADD COLUMN IF NOT EXISTS data_limite date;

COMMENT ON COLUMN public.vacation_periods.start_date IS 'Início do Período de Competência (aquisitivo) — agenda periodoIn';
COMMENT ON COLUMN public.vacation_periods.end_date IS 'Fim do Período de Competência (aquisitivo) — agenda periodoFn';
COMMENT ON COLUMN public.vacation_periods.gozo_start_date IS 'Início do Período de Gozo — agenda periodoInGozo';
COMMENT ON COLUMN public.vacation_periods.gozo_end_date IS 'Fim do Período de Gozo — agenda periodoFnGozo';
COMMENT ON COLUMN public.vacation_periods.data_limite IS 'Data Limite / vencimento concessivo — agenda dataLimite';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.vacation_periods
--   DROP COLUMN IF EXISTS gozo_start_date,
--   DROP COLUMN IF EXISTS gozo_end_date,
--   DROP COLUMN IF EXISTS data_limite;
-- COMMENT ON COLUMN public.vacation_periods.start_date IS NULL;
-- COMMENT ON COLUMN public.vacation_periods.end_date IS NULL;
