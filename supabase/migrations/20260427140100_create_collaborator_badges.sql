-- Migration: 20260427140100_create_collaborator_badges.sql
-- Description: atribuições de badges a colaboradores (quem ganhou,
-- quando, por quem, com que evidência).

BEGIN;

CREATE TABLE public.collaborator_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE RESTRICT,
  awarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  evidence text,                        -- texto livre: link, descrição, contexto
  evidence_url text,                    -- URL opcional pra arquivo no Storage
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Mesmo badge pode ser dado mais de uma vez pro mesmo colaborador?
  -- Decisão: SIM. Conquistar a mesma insígnia em projetos diferentes
  -- é evento separado (ex: "Tech Talk" duas vezes). Sem unique.
  -- Mas garante que awarded_at + collaborator_id + badge_id juntos sejam únicos
  -- (proteção contra duplo-clique no submit)
  CONSTRAINT collaborator_badges_dedup UNIQUE (collaborator_id, badge_id, awarded_at)
);

-- Índices pros queries comuns
CREATE INDEX idx_collab_badges_company ON public.collaborator_badges(company_id);
CREATE INDEX idx_collab_badges_collaborator ON public.collaborator_badges(collaborator_id);
CREATE INDEX idx_collab_badges_badge ON public.collaborator_badges(badge_id);
CREATE INDEX idx_collab_badges_awarded_at ON public.collaborator_badges(awarded_at DESC);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_collab_badges
  BEFORE UPDATE ON public.collaborator_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger audit (PII indireto via collaborator_id, mas operações sensíveis: quem deu o quê)
CREATE TRIGGER audit_collab_badges
  AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_trigger();

-- RLS
ALTER TABLE public.collaborator_badges ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "admin_gc reads all collab_badges"
  ON public.collaborator_badges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

CREATE POLICY "gestor_gc reads own company collab_badges"
  ON public.collaborator_badges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('gestor_gc', 'gestor', 'rh')
        AND ur.company_id = collaborator_badges.company_id
    )
  );

CREATE POLICY "colaborador reads own badges"
  ON public.collaborator_badges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_badges.collaborator_id
        AND c.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: só admin_gc/gestor_gc da empresa
CREATE POLICY "admin_gc writes collab_badges"
  ON public.collaborator_badges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

CREATE POLICY "gestor_gc writes own company collab_badges"
  ON public.collaborator_badges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('gestor_gc', 'gestor', 'rh')
        AND ur.company_id = collaborator_badges.company_id
    )
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "gestor_gc writes own company collab_badges" ON public.collaborator_badges;
--   DROP POLICY IF EXISTS "admin_gc writes collab_badges" ON public.collaborator_badges;
--   DROP POLICY IF EXISTS "colaborador reads own badges" ON public.collaborator_badges;
--   DROP POLICY IF EXISTS "gestor_gc reads own company collab_badges" ON public.collaborator_badges;
--   DROP POLICY IF EXISTS "admin_gc reads all collab_badges" ON public.collaborator_badges;
--   DROP TRIGGER IF EXISTS audit_collab_badges ON public.collaborator_badges;
--   DROP TRIGGER IF EXISTS set_updated_at_collab_badges ON public.collaborator_badges;
--   DROP TABLE IF EXISTS public.collaborator_badges;
-- COMMIT;
