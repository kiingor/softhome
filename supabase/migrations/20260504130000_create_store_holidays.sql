-- Migration: 20260504130000_create_store_holidays.sql
-- Description: calendário de feriados por Empresa (store). Cada CNPJ
-- tem seu próprio calendário porque pode estar em cidade diferente,
-- com feriados estaduais/municipais distintos.
--
-- Sync inicial via BrasilAPI (feriados nacionais) → type='national'.
-- Estaduais/municipais o usuário cadastra/edita manualmente → type='manual'
-- pra preservar de re-syncs.
--
-- Usado por: cálculo de benefícios diários (workingDays.ts) — abate dia
-- útil que cair em feriado.

BEGIN;

-- ============================================================
-- ENUM: tipo de feriado
-- ============================================================
CREATE TYPE public.holiday_type AS ENUM (
  'national',
  'state',
  'municipal',
  'manual'
);

-- ============================================================
-- store_holidays
-- ============================================================
CREATE TABLE public.store_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  type public.holiday_type NOT NULL DEFAULT 'manual',
  source text,                                -- 'brasilapi:2026' / null
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)                     -- 1 feriado por dia/empresa
);

CREATE INDEX idx_store_holidays_store_date
  ON public.store_holidays(store_id, date);

CREATE INDEX idx_store_holidays_company_year
  ON public.store_holidays(company_id, date);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_store_holidays
  BEFORE UPDATE ON public.store_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.store_holidays ENABLE ROW LEVEL SECURITY;

-- admin_gc full access (cross-company)
CREATE POLICY "admin_gc full access store_holidays"
  ON public.store_holidays FOR ALL
  USING (public.is_admin_gc(auth.uid()))
  WITH CHECK (public.is_admin_gc(auth.uid()));

-- gestor_gc / rh / qualquer user da empresa: SELECT
CREATE POLICY "company users select store_holidays"
  ON public.store_holidays FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

-- gestor_gc da empresa: INSERT/UPDATE/DELETE
CREATE POLICY "gestor_gc manage store_holidays"
  ON public.store_holidays FOR ALL
  USING (
    public.has_role(auth.uid(), 'gestor_gc')
    AND public.user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor_gc')
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TABLE IF EXISTS public.store_holidays CASCADE;
--   DROP TYPE IF EXISTS public.holiday_type;
-- COMMIT;
