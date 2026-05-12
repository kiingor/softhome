-- Migration: 20260512100900_create_uniform_sizes.sql
-- Description: tamanhos de fardamento e calçado por colaborador. Tabela
-- separada (não colunas) para permitir histórico — quando o tamanho muda,
-- mantém-se o registro anterior. Apenas o mais recente (com measured_at
-- mais alto) representa o tamanho atual.

BEGIN;

CREATE TABLE public.collaborator_uniform_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  shirt_size text,
  pants_size text,
  jacket_size text,
  shoe_size text,
  measured_at date NOT NULL DEFAULT CURRENT_DATE,
  measured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_uniform_sizes_collab
  ON public.collaborator_uniform_sizes(collaborator_id, measured_at DESC);

CREATE TRIGGER set_updated_at_uniform_sizes
  BEFORE UPDATE ON public.collaborator_uniform_sizes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.collaborator_uniform_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Uniform sizes: RH and self read"
  ON public.collaborator_uniform_sizes FOR SELECT
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

CREATE POLICY "Uniform sizes: RH manage"
  ON public.collaborator_uniform_sizes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

COMMENT ON TABLE public.collaborator_uniform_sizes IS
  'Tamanhos de fardamento e calçado do colaborador. Tabela com histórico — o mais recente é o atual.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.collaborator_uniform_sizes;
-- COMMIT;
