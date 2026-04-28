-- Migration: 20260427150200_create_payroll_schema.sql
-- Description: schema da Fase 4 (Folha — controle, NÃO cálculo).
-- payroll_entries já existe (herdado do meurh) — esta migration adiciona
-- payroll_periods (fechamento por CNPJ × mês) e payroll_alerts.
--
-- IMPORTANTE: SoftHome NÃO calcula folha CLT (INSS/IRRF/FGTS/eSocial).
-- Só faz controle + exportação pro contador.

BEGIN;

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.payroll_period_status AS ENUM (
  'open',         -- aceitando lançamentos
  'closed',       -- fechado, read-only
  'exported'      -- exportado pro contador
);

CREATE TYPE public.payroll_alert_kind AS ENUM (
  'collaborator_no_entry',         -- ativo no mês mas sem lançamento
  'value_divergence',              -- valor fora do esperado (HE excessiva, etc.)
  'absence_no_attestation',        -- falta sem atestado
  'admission_pending',             -- admissão não finalizada antes do fechamento
  'termination_pending',           -- desligamento sem documentação completa
  'other'
);

CREATE TYPE public.payroll_alert_severity AS ENUM (
  'info', 'warning', 'critical'
);

-- ============================================================
-- payroll_periods (CNPJ × mês)
-- ============================================================
CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  reference_month date NOT NULL,            -- sempre dia 1 do mês de referência
  status public.payroll_period_status NOT NULL DEFAULT 'open',
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  exported_at timestamptz,
  export_file_url text,                     -- caminho no Storage do arquivo exportado
  export_file_hash text,                    -- sha256 pra rastreabilidade
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference_month),
  CONSTRAINT period_month_is_first_day
    CHECK (extract(day from reference_month) = 1)
);

CREATE INDEX idx_periods_company ON public.payroll_periods(company_id, reference_month DESC);
CREATE INDEX idx_periods_status ON public.payroll_periods(status);

CREATE TRIGGER set_updated_at_periods
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_periods
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- payroll_alerts
-- ============================================================
CREATE TABLE public.payroll_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE CASCADE,
  kind public.payroll_alert_kind NOT NULL,
  severity public.payroll_alert_severity NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  context jsonb,                            -- dados extras do alerta
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_period ON public.payroll_alerts(period_id);
CREATE INDEX idx_alerts_company_unresolved
  ON public.payroll_alerts(company_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_alerts_severity ON public.payroll_alerts(severity);

CREATE TRIGGER set_updated_at_alerts
  BEFORE UPDATE ON public.payroll_alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_alerts ENABLE ROW LEVEL SECURITY;

-- payroll_periods: admin_gc + gestor_gc/rh + contador (read-only)
CREATE POLICY "admin_gc reads all periods" ON public.payroll_periods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own periods" ON public.payroll_periods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND public.user_belongs_to_company(payroll_periods.company_id, auth.uid())
  );
CREATE POLICY "admin_gc writes periods" ON public.payroll_periods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own periods" ON public.payroll_periods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(payroll_periods.company_id, auth.uid())
  );
-- contador NÃO escreve em periods (só lê pra exportação)

-- payroll_alerts: mesmo padrão (sem contador)
CREATE POLICY "admin_gc reads all alerts" ON public.payroll_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own alerts" ON public.payroll_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(payroll_alerts.company_id, auth.uid())
  );
CREATE POLICY "admin_gc writes alerts" ON public.payroll_alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own alerts" ON public.payroll_alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(payroll_alerts.company_id, auth.uid())
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TABLE IF EXISTS public.payroll_alerts CASCADE;
--   DROP TABLE IF EXISTS public.payroll_periods CASCADE;
--   DROP TYPE IF EXISTS public.payroll_alert_severity;
--   DROP TYPE IF EXISTS public.payroll_alert_kind;
--   DROP TYPE IF EXISTS public.payroll_period_status;
-- COMMIT;
