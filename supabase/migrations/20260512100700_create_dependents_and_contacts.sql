-- Migration: 20260512100700_create_dependents_and_contacts.sql
-- Description: dependentes e contatos do colaborador com PARENTESCO modelado.
-- A coluna existente dependents_count (inteiro) continua válida para o
-- cálculo de IRPF (dedução R$ 189,59/mês por dependente legal) e é mantida
-- em sincronia via trigger: ao adicionar/remover dependente com is_irpf_dependent=true,
-- recalcula o count.

BEGIN;

CREATE TYPE public.kinship_type AS ENUM (
  'filho', 'enteado', 'tutelado', 'conjuge', 'companheiro',
  'pai', 'mae', 'irmao', 'avô', 'neto', 'outro'
);

CREATE TABLE public.collaborator_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_date date,
  cpf text,
  kinship public.kinship_type NOT NULL,
  is_irpf_dependent boolean NOT NULL DEFAULT false,
  is_health_plan_dependent boolean NOT NULL DEFAULT false,
  birth_certificate_url text,
  school_enrollment_url text,
  vaccination_card_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dependents_collab
  ON public.collaborator_dependents(collaborator_id);
CREATE INDEX idx_dependents_company
  ON public.collaborator_dependents(company_id);

CREATE TRIGGER set_updated_at_dependents
  BEFORE UPDATE ON public.collaborator_dependents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_dependents
  AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_dependents
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- Sincroniza collaborators.dependents_count com is_irpf_dependent.
CREATE OR REPLACE FUNCTION public.sync_irpf_dependents_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_collab uuid;
BEGIN
  target_collab := COALESCE(NEW.collaborator_id, OLD.collaborator_id);
  UPDATE public.collaborators
  SET dependents_count = (
    SELECT COUNT(*) FROM public.collaborator_dependents
    WHERE collaborator_id = target_collab AND is_irpf_dependent = true
  )
  WHERE id = target_collab;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_irpf_count
  AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_dependents
  FOR EACH ROW EXECUTE FUNCTION public.sync_irpf_dependents_count();

ALTER TABLE public.collaborator_dependents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dependents: RH and self read"
  ON public.collaborator_dependents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
    OR EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Dependents: RH manage"
  ON public.collaborator_dependents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

-- ============================================================
-- Contatos de emergência
-- ============================================================
CREATE TABLE public.collaborator_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  kinship public.kinship_type NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emergency_contacts_collab
  ON public.collaborator_emergency_contacts(collaborator_id);

CREATE TRIGGER set_updated_at_emergency_contacts
  BEFORE UPDATE ON public.collaborator_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_emergency_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

ALTER TABLE public.collaborator_emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Emergency contacts: RH and self read"
  ON public.collaborator_emergency_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
    OR EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Emergency contacts: RH manage"
  ON public.collaborator_emergency_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.collaborator_emergency_contacts;
-- DROP TRIGGER IF EXISTS trg_sync_irpf_count ON public.collaborator_dependents;
-- DROP FUNCTION IF EXISTS public.sync_irpf_dependents_count();
-- DROP TABLE IF EXISTS public.collaborator_dependents;
-- DROP TYPE IF EXISTS public.kinship_type;
-- COMMIT;
