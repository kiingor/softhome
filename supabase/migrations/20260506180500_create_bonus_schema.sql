-- Migration: 20260506180500_create_bonus_schema.sql
-- Description: schema do módulo "13º Salário" — campanha anual por empresa,
-- entries por colaborador (com cálculo proporcional snapshotado), pagamentos
-- em 2 parcelas (Nov/Dez) ou single (avulso/antecipação).
--
-- IMPORTANTE: SoftHouse NÃO calcula folha CLT. Aqui só guardamos valores
-- brutos. INSS/IRRF/FGTS ficam fora, conforme CLAUDE.md princípio 2.

BEGIN;

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.bonus_period_status AS ENUM (
  'aberto',       -- aceitando ajustes nas entries
  'pagamento',    -- gerou pagamentos, em fase de quitação das parcelas
  'concluido'     -- todas parcelas pagas, read-only
);

CREATE TYPE public.bonus_entry_mode AS ENUM (
  'batch',        -- entra na geração em massa (padrão)
  'individual',   -- pago avulso (rescisão, caso especial) — sai do batch
  'anticipated'   -- antecipado (junto com férias, p.ex.) — sai do batch
);

CREATE TYPE public.bonus_installment AS ENUM (
  'first',        -- 1ª parcela (Novembro, ~50%)
  'second',       -- 2ª parcela (Dezembro, restante)
  'single'        -- pagamento integral (modo individual ou anticipated)
);

-- ============================================================
-- bonus_periods (1 campanha por company × year)
-- ============================================================
CREATE TABLE public.bonus_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status public.bonus_period_status NOT NULL DEFAULT 'aberto',
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year)
);

CREATE INDEX idx_bonus_periods_company ON public.bonus_periods(company_id, year DESC);
CREATE INDEX idx_bonus_periods_status ON public.bonus_periods(status);

CREATE TRIGGER set_updated_at_bonus_periods
  BEFORE UPDATE ON public.bonus_periods
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_bonus_periods
  AFTER INSERT OR UPDATE OR DELETE ON public.bonus_periods
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- bonus_entries (1 linha por colaborador na campanha)
-- ============================================================
CREATE TABLE public.bonus_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.bonus_periods(id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  -- Snapshot no momento da geração — não muda mesmo se positions.salary mudar depois.
  base_salary numeric(12, 2) NOT NULL DEFAULT 0,
  months_worked integer NOT NULL DEFAULT 0 CHECK (months_worked BETWEEN 0 AND 12),
  -- Bruto = base_salary * months_worked / 12, mas editável pelo RH (override).
  gross_value numeric(12, 2) NOT NULL DEFAULT 0,
  mode public.bonus_entry_mode NOT NULL DEFAULT 'batch',
  mode_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mode_set_at timestamptz,
  mode_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, collaborator_id)
);

CREATE INDEX idx_bonus_entries_period ON public.bonus_entries(period_id);
CREATE INDEX idx_bonus_entries_collaborator ON public.bonus_entries(collaborator_id);
CREATE INDEX idx_bonus_entries_mode ON public.bonus_entries(period_id, mode);

CREATE TRIGGER set_updated_at_bonus_entries
  BEFORE UPDATE ON public.bonus_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_bonus_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.bonus_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- bonus_payments (parcelas)
-- ============================================================
CREATE TABLE public.bonus_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.bonus_entries(id) ON DELETE CASCADE,
  installment public.bonus_installment NOT NULL,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, installment)
);

CREATE INDEX idx_bonus_payments_entry ON public.bonus_payments(entry_id);
CREATE INDEX idx_bonus_payments_unpaid
  ON public.bonus_payments(entry_id) WHERE paid_at IS NULL;

CREATE TRIGGER set_updated_at_bonus_payments
  BEFORE UPDATE ON public.bonus_payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_bonus_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.bonus_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.bonus_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_payments ENABLE ROW LEVEL SECURITY;

-- ---- bonus_periods ----
CREATE POLICY "admin_gc reads all bonus_periods" ON public.bonus_periods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own bonus_periods" ON public.bonus_periods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND public.user_belongs_to_company(bonus_periods.company_id, auth.uid())
  );
CREATE POLICY "admin_gc writes bonus_periods" ON public.bonus_periods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own bonus_periods" ON public.bonus_periods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(bonus_periods.company_id, auth.uid())
  );

-- ---- bonus_entries (via period_id → company_id) ----
CREATE POLICY "admin_gc reads all bonus_entries" ON public.bonus_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own bonus_entries" ON public.bonus_entries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND EXISTS (
      SELECT 1 FROM public.bonus_periods p
      WHERE p.id = bonus_entries.period_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );
CREATE POLICY "admin_gc writes bonus_entries" ON public.bonus_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own bonus_entries" ON public.bonus_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND EXISTS (
      SELECT 1 FROM public.bonus_periods p
      WHERE p.id = bonus_entries.period_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );

-- ---- bonus_payments (via entry → period → company) ----
CREATE POLICY "admin_gc reads all bonus_payments" ON public.bonus_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own bonus_payments" ON public.bonus_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND EXISTS (
      SELECT 1 FROM public.bonus_entries e
      JOIN public.bonus_periods p ON p.id = e.period_id
      WHERE e.id = bonus_payments.entry_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );
CREATE POLICY "admin_gc writes bonus_payments" ON public.bonus_payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own bonus_payments" ON public.bonus_payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND EXISTS (
      SELECT 1 FROM public.bonus_entries e
      JOIN public.bonus_periods p ON p.id = e.period_id
      WHERE e.id = bonus_payments.entry_id
        AND public.user_belongs_to_company(p.company_id, auth.uid())
    )
  );

-- Audit triggers em bonus_entries e bonus_payments lidam com valores brutos de
-- remuneração (PII sensível). Já anexados acima via CREATE TRIGGER audit_*.

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TABLE IF EXISTS public.bonus_payments CASCADE;
--   DROP TABLE IF EXISTS public.bonus_entries CASCADE;
--   DROP TABLE IF EXISTS public.bonus_periods CASCADE;
--   DROP TYPE IF EXISTS public.bonus_installment;
--   DROP TYPE IF EXISTS public.bonus_entry_mode;
--   DROP TYPE IF EXISTS public.bonus_period_status;
-- COMMIT;
