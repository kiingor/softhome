-- Migration: 20260505150000_payroll_payments.sql
-- Description: tabela pra rastrear pagamentos da folha por colaborador.
-- Usada pelo time financeiro pra ir marcando o que já foi transferido
-- e ter uma barra de progresso do mês.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_payments_period
  ON public.payroll_payments (period_id);

CREATE INDEX IF NOT EXISTS idx_payroll_payments_entry
  ON public.payroll_payments (entry_id);

ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de RLS de payroll_periods: admin_gc lê tudo,
-- gestor_gc/rh/contador leem da própria company; admin_gc/gestor_gc/rh escrevem.
CREATE POLICY "admin_gc reads all payments" ON public.payroll_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc reads own payments" ON public.payroll_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND EXISTS (
      SELECT 1 FROM public.payroll_periods p
      WHERE p.id = payroll_payments.period_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );

CREATE POLICY "admin_gc writes payments" ON public.payroll_payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc writes own payments" ON public.payroll_payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND EXISTS (
      SELECT 1 FROM public.payroll_periods p
      WHERE p.id = payroll_payments.period_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.set_payroll_payments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_payments_updated_at ON public.payroll_payments;
CREATE TRIGGER trg_payroll_payments_updated_at
  BEFORE UPDATE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_payroll_payments_updated_at();

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_payroll_payments_updated_at ON public.payroll_payments;
-- DROP FUNCTION IF EXISTS public.set_payroll_payments_updated_at();
-- DROP TABLE IF EXISTS public.payroll_payments;
-- COMMIT;
