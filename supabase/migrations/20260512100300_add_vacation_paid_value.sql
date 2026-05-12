-- Migration: 20260512100300_add_vacation_paid_value.sql
-- Description: registra o valor efetivamente pago em cada solicitação de férias,
-- pra histórico financeiro e relatórios. O cálculo legal (salário + 1/3) continua
-- sendo lançado em payroll_entries; esse campo é só o "quanto saiu", incluindo
-- abonos, descontos e ajustes manuais.

BEGIN;

ALTER TABLE public.vacation_requests
  ADD COLUMN IF NOT EXISTS paid_value numeric(12, 2),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vacation_requests.paid_value IS
  'Valor total efetivamente pago de férias (salário + 1/3 + abonos − descontos). Registrado pelo RH.';
COMMENT ON COLUMN public.vacation_requests.paid_at IS
  'Quando o pagamento foi efetuado.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- ALTER TABLE public.vacation_requests DROP COLUMN IF EXISTS paid_value;
-- ALTER TABLE public.vacation_requests DROP COLUMN IF EXISTS paid_at;
-- ALTER TABLE public.vacation_requests DROP COLUMN IF EXISTS paid_by;
-- COMMIT;
