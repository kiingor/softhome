-- Migration: 20260429200000_create_admission_docs_bucket.sql
-- Description: Storage bucket pra documentos de admissão (RG, CPF, CTPS, etc.)
-- enviados pelo candidato via form público em /admissao/:token.
--
-- Bucket é privado, max 10MB por arquivo (alguns PDFs scaneados são pesados),
-- aceita PDF + imagens (JPEG, PNG) — candidato pode tirar foto do doc.
--
-- Path convention: <company_id>/<journey_id>/<doc_type>.<ext>

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admission-docs',
  'admission-docs',
  false,
  10485760,                   -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Read: admin_gc + gestor_gc da empresa do candidato podem ver os docs
CREATE POLICY "admin_gc + gestor_gc read admission docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'admission-docs'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "admin_gc + gestor_gc delete admission docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'admission-docs'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

-- INSERT/UPDATE: somente via Edge Function admission-public-submit (service_role).
-- Sem policy pra anon/authenticated = bloqueado direto.

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "admin_gc + gestor_gc delete admission docs" ON storage.objects;
--   DROP POLICY IF EXISTS "admin_gc + gestor_gc read admission docs" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'admission-docs';
-- COMMIT;
