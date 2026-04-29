-- Migration: 20260427140000_create_journey_badges.sql
-- Description: catálogo de insígnias (badges) da Jornada de Conhecimento.
-- Fase 1 do plano. Tabela 'badges' guarda o catálogo por empresa
-- (cada CNPJ pode ter seu próprio set de insígnias).

BEGIN;

-- 1. Enum de categoria
CREATE TYPE public.badge_category AS ENUM (
  'tecnico',       -- skills técnicas
  'comportamental', -- soft skills
  'lideranca',
  'cultura',       -- alinhamento com cultura Softcom
  'integracao',    -- onboarding/primeiros passos
  'outro'
);

-- 2. Tabela badges
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  category public.badge_category NOT NULL DEFAULT 'outro',
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  icon text,                            -- nome do ícone Phosphor (ex: 'Trophy')
  color text,                           -- hex opcional pra customizar (default emerald)
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

-- 3. Índices
CREATE INDEX idx_badges_company ON public.badges(company_id);
CREATE INDEX idx_badges_company_active ON public.badges(company_id) WHERE is_active = true;
CREATE INDEX idx_badges_category ON public.badges(category);

-- 4. Trigger updated_at
-- (assume função handle_updated_at já existe no schema do meurh; criar fallback se não)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_badges
  BEFORE UPDATE ON public.badges
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. RLS
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- SELECT: admin_gc vê tudo; gestor_gc/rh vê própria empresa; colaborador vê própria empresa
CREATE POLICY "admin_gc reads all badges"
  ON public.badges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

CREATE POLICY "company members read own badges"
  ON public.badges FOR SELECT
  USING (
    public.user_belongs_to_company(badges.company_id, auth.uid())
  );

-- INSERT/UPDATE/DELETE: admin_gc + gestor_gc/rh da própria empresa
CREATE POLICY "admin_gc writes all badges"
  ON public.badges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

CREATE POLICY "gestor_gc writes own company badges"
  ON public.badges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('gestor_gc', 'rh')
    )
    AND public.user_belongs_to_company(badges.company_id, auth.uid())
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "gestor_gc writes own company badges" ON public.badges;
--   DROP POLICY IF EXISTS "admin_gc writes all badges" ON public.badges;
--   DROP POLICY IF EXISTS "company members read own badges" ON public.badges;
--   DROP POLICY IF EXISTS "admin_gc reads all badges" ON public.badges;
--   DROP TRIGGER IF EXISTS set_updated_at_badges ON public.badges;
--   DROP INDEX IF EXISTS public.idx_badges_category;
--   DROP INDEX IF EXISTS public.idx_badges_company_active;
--   DROP INDEX IF EXISTS public.idx_badges_company;
--   DROP TABLE IF EXISTS public.badges;
--   DROP TYPE IF EXISTS public.badge_category;
--   -- handle_updated_at() permanece (compartilhada)
-- COMMIT;
