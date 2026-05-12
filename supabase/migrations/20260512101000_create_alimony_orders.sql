-- Migration: 20260512101000_create_alimony_orders.sql
-- Description: pensão alimentícia. Tabela dedicada com referência à decisão
-- judicial (documento anexado), beneficiário, e regra de cálculo:
--   - fixed: valor fixo mensal
--   - percentage_gross: % sobre salário bruto
--   - percentage_net: % sobre líquido (depois de INSS/IRPF)
-- O desconto é aplicado na folha conforme a regra. PII alta — só RH com
-- permissão específica acessa.

BEGIN;

CREATE TYPE public.alimony_calculation_type AS ENUM (
  'fixed', 'percentage_gross', 'percentage_net'
);

CREATE TYPE public.alimony_status AS ENUM (
  'active', 'suspended', 'ended'
);

CREATE TABLE public.collaborator_alimony_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  beneficiary_name text NOT NULL,
  beneficiary_cpf text,
  beneficiary_bank_info text,           -- conta/PIX do beneficiário (criptografar futuramente)
  court_order_doc_url text,             -- decisão judicial em Storage
  case_number text,                     -- nº do processo
  judgment_date date,
  calculation_type public.alimony_calculation_type NOT NULL,
  value numeric(12, 4) NOT NULL CHECK (value >= 0),
                                        -- 4 casas porque pode ser percentual (ex: 0.3333 = 33,33%)
  status public.alimony_status NOT NULL DEFAULT 'active',
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_alimony_collab
  ON public.collaborator_alimony_orders(collaborator_id, status);
CREATE INDEX idx_alimony_active
  ON public.collaborator_alimony_orders(collaborator_id)
  WHERE status = 'active';

CREATE TRIGGER set_updated_at_alimony
  BEFORE UPDATE ON public.collaborator_alimony_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_alimony
  AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_alimony_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

ALTER TABLE public.collaborator_alimony_orders ENABLE ROW LEVEL SECURITY;

-- Read: apenas RH com permissão completa (admin_gc, admin). Gestor comum NÃO vê.
CREATE POLICY "Alimony: admin read"
  ON public.collaborator_alimony_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'rh')
    )
  );

CREATE POLICY "Alimony: admin manage"
  ON public.collaborator_alimony_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'rh')
    )
  );

COMMENT ON TABLE public.collaborator_alimony_orders IS
  'Pensão alimentícia: ordem judicial de desconto em folha. PII alta (LGPD).';
COMMENT ON COLUMN public.collaborator_alimony_orders.value IS
  'Valor (fixed) ou percentual em fração (0.30 = 30%). Interpretado conforme calculation_type.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.collaborator_alimony_orders;
-- DROP TYPE IF EXISTS public.alimony_status;
-- DROP TYPE IF EXISTS public.alimony_calculation_type;
-- COMMIT;
