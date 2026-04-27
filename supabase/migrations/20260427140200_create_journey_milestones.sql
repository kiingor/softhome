-- Migration: 20260427140200_create_journey_milestones.sql
-- Description: snapshots e alertas 30/60/90 dias por colaborador.
-- Cron Edge Function 'journey-snapshot' rodaria diariamente lendo
-- collaborators e gerando milestones nos marcos.

BEGIN;

-- 1. Enum de marcos
CREATE TYPE public.journey_milestone_kind AS ENUM (
  'd30',           -- 30 dias após admissão
  'd60',
  'd90',
  'd180',          -- 6 meses (fim do período de "primeiros passos")
  'annual'         -- aniversário de admissão
);

CREATE TYPE public.journey_milestone_status AS ENUM (
  'pending',       -- ainda não chegou a data
  'due',           -- chegou na janela mas não foi avaliado
  'completed',     -- gestor/RH avaliou ok
  'overdue'        -- passou da janela sem avaliação
);

-- 2. Tabela
CREATE TABLE public.journey_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  kind public.journey_milestone_kind NOT NULL,
  due_date date NOT NULL,                     -- quando deveria ser avaliado
  status public.journey_milestone_status NOT NULL DEFAULT 'pending',
  evaluated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evaluated_at timestamptz,
  notes text,                                  -- observações da avaliação
  badges_count integer NOT NULL DEFAULT 0,    -- snapshot de quantas insígnias até a data
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collaborator_id, kind)              -- 1 marco por colaborador por tipo
);

-- 3. Índices
CREATE INDEX idx_milestones_company ON public.journey_milestones(company_id);
CREATE INDEX idx_milestones_collaborator ON public.journey_milestones(collaborator_id);
CREATE INDEX idx_milestones_due_status ON public.journey_milestones(due_date, status);
CREATE INDEX idx_milestones_overdue
  ON public.journey_milestones(company_id, due_date)
  WHERE status IN ('pending', 'due', 'overdue');

-- 4. Trigger updated_at
CREATE TRIGGER set_updated_at_milestones
  BEFORE UPDATE ON public.journey_milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. RLS
ALTER TABLE public.journey_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gc reads all milestones"
  ON public.journey_milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

CREATE POLICY "gestor_gc reads own company milestones"
  ON public.journey_milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('gestor_gc', 'gestor', 'rh')
        AND ur.company_id = journey_milestones.company_id
    )
  );

CREATE POLICY "colaborador reads own milestones"
  ON public.journey_milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = journey_milestones.collaborator_id
        AND c.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE: admin_gc + gestor_gc/rh da empresa.
-- DELETE: só admin_gc (audit safety).
CREATE POLICY "admin_gc inserts milestones"
  ON public.journey_milestones FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

CREATE POLICY "gestor_gc updates own company milestones"
  ON public.journey_milestones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'gestor', 'rh')
        AND (
          ur.role::text IN ('admin_gc', 'admin')
          OR ur.company_id = journey_milestones.company_id
        )
    )
  );

CREATE POLICY "admin_gc deletes milestones"
  ON public.journey_milestones FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "admin_gc deletes milestones" ON public.journey_milestones;
--   DROP POLICY IF EXISTS "gestor_gc updates own company milestones" ON public.journey_milestones;
--   DROP POLICY IF EXISTS "admin_gc inserts milestones" ON public.journey_milestones;
--   DROP POLICY IF EXISTS "colaborador reads own milestones" ON public.journey_milestones;
--   DROP POLICY IF EXISTS "gestor_gc reads own company milestones" ON public.journey_milestones;
--   DROP POLICY IF EXISTS "admin_gc reads all milestones" ON public.journey_milestones;
--   DROP TRIGGER IF EXISTS set_updated_at_milestones ON public.journey_milestones;
--   DROP TABLE IF EXISTS public.journey_milestones;
--   DROP TYPE IF EXISTS public.journey_milestone_status;
--   DROP TYPE IF EXISTS public.journey_milestone_kind;
-- COMMIT;
