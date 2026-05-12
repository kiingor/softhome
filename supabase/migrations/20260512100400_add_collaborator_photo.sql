-- Migration: 20260512100400_add_collaborator_photo.sql
-- Description: foto do colaborador (avatar) para identificação rápida nas
-- listas, cards e detalhes. Storage em bucket dedicado.

BEGIN;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.collaborators.photo_url IS
  'Path no Storage (bucket collaborator-photos) ou URL externa para foto de perfil.';

-- Bucket privado para fotos (acesso via signed URL).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'collaborator-photos',
  'collaborator-photos',
  false,
  5242880,                       -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Read: usuários autenticados (todos veem foto de colega)
CREATE POLICY "Collaborator photos: authenticated read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'collaborator-photos'
    AND auth.uid() IS NOT NULL
  );

-- Upload/Update/Delete: admin_gc + gestor_gc
CREATE POLICY "Collaborator photos: admin/gestor upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'collaborator-photos'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Collaborator photos: admin/gestor update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'collaborator-photos'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Collaborator photos: admin/gestor delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'collaborator-photos'
    AND EXISTS (
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
-- DROP POLICY IF EXISTS "Collaborator photos: authenticated read" ON storage.objects;
-- DROP POLICY IF EXISTS "Collaborator photos: admin/gestor upload" ON storage.objects;
-- DROP POLICY IF EXISTS "Collaborator photos: admin/gestor update" ON storage.objects;
-- DROP POLICY IF EXISTS "Collaborator photos: admin/gestor delete" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'collaborator-photos';
-- ALTER TABLE public.collaborators DROP COLUMN IF EXISTS photo_url;
-- COMMIT;
