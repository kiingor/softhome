-- Migration: 20260512100500_create_medical_certificates.sql
-- Description: tabela dedicada para atestados médicos do colaborador, com
-- upload do documento, CID (sigiloso), médico, e integração com folha
-- (lançamento automático de tipo 'atestado' já existente em payroll_entries).
-- PII alta: CID e dados médicos são sensíveis (LGPD art. 11). RLS rígida.

BEGIN;

CREATE TABLE public.collaborator_medical_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  issued_at date NOT NULL,
  days_off integer NOT NULL CHECK (days_off >= 0 AND days_off <= 365),
  cid_code text,
  doctor_name text,
  doctor_crm text,
  document_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_medical_certs_collab
  ON public.collaborator_medical_certificates(collaborator_id, issued_at DESC);
CREATE INDEX idx_medical_certs_company
  ON public.collaborator_medical_certificates(company_id, issued_at DESC);

CREATE TRIGGER set_updated_at_medical_certs
  BEFORE UPDATE ON public.collaborator_medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_medical_certs
  AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

ALTER TABLE public.collaborator_medical_certificates ENABLE ROW LEVEL SECURITY;

-- Read: RH (admin_gc, gestor_gc, admin, rh) + o próprio colaborador
CREATE POLICY "Medical certs: RH and self read"
  ON public.collaborator_medical_certificates FOR SELECT
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

-- Insert/Update/Delete: somente RH
CREATE POLICY "Medical certs: RH insert"
  ON public.collaborator_medical_certificates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Medical certs: RH update"
  ON public.collaborator_medical_certificates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Medical certs: RH delete"
  ON public.collaborator_medical_certificates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

-- Bucket pra anexos dos atestados (PDF/imagem)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-certificates',
  'medical-certificates',
  false,
  10485760,                    -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Medical cert files: RH read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'medical-certificates'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Medical cert files: RH insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'medical-certificates'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Medical cert files: RH delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'medical-certificates'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

COMMENT ON TABLE public.collaborator_medical_certificates IS
  'Atestados médicos do colaborador. PII alta — CID e dados médicos protegidos por LGPD.';
COMMENT ON COLUMN public.collaborator_medical_certificates.cid_code IS
  'CID-10 (opcional). Dado sensível — registrar apenas se necessário para apuração.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "Medical cert files: RH read" ON storage.objects;
-- DROP POLICY IF EXISTS "Medical cert files: RH insert" ON storage.objects;
-- DROP POLICY IF EXISTS "Medical cert files: RH delete" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'medical-certificates';
-- DROP TABLE IF EXISTS public.collaborator_medical_certificates;
-- COMMIT;
