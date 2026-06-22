-- Migration: 20260622120000_payroll_collaborator_reviews.sql
-- Description: conferência dos lançamentos por colaborador dentro de um período
-- de folha. O RH marca "Conferido" (igual ao "Pago" da aba Pagamentos) e pode
-- anotar uma observação quando há divergência. 1 registro por (período, colab).
--
-- Espelha exatamente o padrão de RLS de payroll_payments (deriva company via
-- payroll_periods; sem company_id próprio).

BEGIN;

CREATE TABLE IF NOT EXISTS public.payroll_collaborator_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  is_reviewed boolean NOT NULL DEFAULT false,
  observation text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, collaborator_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_reviews_period
  ON public.payroll_collaborator_reviews (period_id);

CREATE INDEX IF NOT EXISTS idx_payroll_reviews_collaborator
  ON public.payroll_collaborator_reviews (collaborator_id);

ALTER TABLE public.payroll_collaborator_reviews ENABLE ROW LEVEL SECURITY;

-- Idempotência: Postgres não tem CREATE POLICY IF NOT EXISTS, então dropamos
-- antes de recriar pra migration poder rodar de novo sem erro 42710.
DROP POLICY IF EXISTS "admin_gc reads all reviews" ON public.payroll_collaborator_reviews;
DROP POLICY IF EXISTS "gestor_gc reads own reviews" ON public.payroll_collaborator_reviews;
DROP POLICY IF EXISTS "admin_gc writes reviews" ON public.payroll_collaborator_reviews;
DROP POLICY IF EXISTS "gestor_gc writes own reviews" ON public.payroll_collaborator_reviews;

-- Mesmo padrão de RLS de payroll_payments: admin_gc lê tudo,
-- gestor_gc/rh/contador leem da própria company; admin_gc/gestor_gc/rh escrevem.
CREATE POLICY "admin_gc reads all reviews" ON public.payroll_collaborator_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc reads own reviews" ON public.payroll_collaborator_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND EXISTS (
      SELECT 1 FROM public.payroll_periods p
      WHERE p.id = payroll_collaborator_reviews.period_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );

CREATE POLICY "admin_gc writes reviews" ON public.payroll_collaborator_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc writes own reviews" ON public.payroll_collaborator_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND EXISTS (
      SELECT 1 FROM public.payroll_periods p
      WHERE p.id = payroll_collaborator_reviews.period_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.set_payroll_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_reviews_updated_at ON public.payroll_collaborator_reviews;
CREATE TRIGGER trg_payroll_reviews_updated_at
  BEFORE UPDATE ON public.payroll_collaborator_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_payroll_reviews_updated_at();

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_payroll_reviews_updated_at ON public.payroll_collaborator_reviews;
-- DROP FUNCTION IF EXISTS public.set_payroll_reviews_updated_at();
-- DROP TABLE IF EXISTS public.payroll_collaborator_reviews;
-- COMMIT;
