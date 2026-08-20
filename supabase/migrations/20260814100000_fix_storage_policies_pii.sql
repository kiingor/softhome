-- Blindagem dos buckets de PII: payslips, collaborator-documents, exam-documents.
--
-- Problema corrigido aqui: as policies originais desses três buckets tinham como
-- único predicado `auth.role() = 'authenticated'` — ou seja, QUALQUER usuário
-- logado (inclusive um colaborador comum do portal) listava e baixava o
-- contracheque, o RG/CPF digitalizado e o ASO de todos os ~300 colaboradores.
-- Em collaborator-documents as policies de INSERT/UPDATE/DELETE nem sequer
-- restringiam o papel, valendo também para `anon`.
--
-- O escopo passa a sair do PATH do arquivo, que já é a convenção do código:
--   payslips:               <collaborator_id>/<ano>/<mes>/<arquivo>
--     (src/pages/dashboard/ContabilidadePage.tsx:171)
--   collaborator-documents: <company_id>/<collaborator_id>/<position_document_id>.<ext>
--     (supabase/functions/onboarding-upload/index.ts:35)
--   exam-documents:         <company_id>/<exam_id>/<timestamp>.<ext>
--     (src/hooks/useExams.ts:157)

BEGIN;

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Converte segmento de path em uuid sem explodir quando o path é inesperado
-- (uma policy que levanta exceção derrubaria a request inteira).
CREATE OR REPLACE FUNCTION public.storage_uuid(_txt text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN _txt::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- O usuário é RH/admin da empresa dona do arquivo?
-- Aceita as duas fontes de autoridade que o sistema usa hoje: permissão de
-- módulo (user_permissions) e papel amplo (user_roles). admin_gc é
-- cross-company por design.
CREATE OR REPLACE FUNCTION public.storage_is_company_staff(_company uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _company IS NOT NULL
     AND (
       public.is_admin_gc(auth.uid())
       OR (
         public.user_belongs_to_company(auth.uid(), _company)
         AND (
           public.can_view_module(auth.uid(), _company, _module)
           OR EXISTS (
             SELECT 1
             FROM public.user_roles ur
             WHERE ur.user_id = auth.uid()
               AND ur.role::text IN ('admin', 'admin_gc', 'rh', 'gestor_gc')
           )
         )
       )
     );
$$;

-- O arquivo é do colaborador vinculado a este usuário?
CREATE OR REPLACE FUNCTION public.storage_is_own_collaborator(_collab text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.collaborators c
    WHERE c.user_id = auth.uid()
      AND c.id = public.storage_uuid(_collab)
  );
$$;

-- Empresa dona de um colaborador (payslips só tem o collaborator_id no path).
CREATE OR REPLACE FUNCTION public.storage_collaborator_company(_collab text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.company_id
  FROM public.collaborators c
  WHERE c.id = public.storage_uuid(_collab);
$$;

GRANT EXECUTE ON FUNCTION public.storage_uuid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_is_company_staff(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_is_own_collaborator(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_collaborator_company(text) TO authenticated;

-- ─── Remove as policies permissivas ─────────────────────────────────────────
-- Policies permissivas se somam por OR: deixar qualquer uma das antigas viva
-- anularia todas as novas.

DROP POLICY IF EXISTS "Collaborators can download their own payslips" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload payslips to their company folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view payslips from their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete payslips" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can view collaborator documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload collaborator documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update collaborator documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete collaborator documents" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload exam documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view exam documents" ON storage.objects;

-- Rede de segurança: qualquer outra policy destes três buckets que tenha
-- entrado fora do versionamento (ex.: criada pelo dashboard do Supabase).
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname NOT LIKE 'dna:%'
      AND (coalesce(qual, '') || coalesce(with_check, ''))
          ~ '(payslips|collaborator-documents|exam-documents)'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- ─── payslips ───────────────────────────────────────────────────────────────
-- Titular baixa o próprio contracheque; RH da empresa dele gerencia.

CREATE POLICY "dna: payslips leitura"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payslips'
    AND (
      public.storage_is_own_collaborator((storage.foldername(name))[1])
      OR public.storage_is_company_staff(
           public.storage_collaborator_company((storage.foldername(name))[1]),
           'contabilidade')
    )
  );

CREATE POLICY "dna: payslips escrita"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payslips'
    AND public.storage_is_company_staff(
          public.storage_collaborator_company((storage.foldername(name))[1]),
          'contabilidade')
  );

-- O import da Contabilidade usa upsert: true, que precisa de UPDATE.
CREATE POLICY "dna: payslips substituicao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payslips'
    AND public.storage_is_company_staff(
          public.storage_collaborator_company((storage.foldername(name))[1]),
          'contabilidade')
  )
  WITH CHECK (
    bucket_id = 'payslips'
    AND public.storage_is_company_staff(
          public.storage_collaborator_company((storage.foldername(name))[1]),
          'contabilidade')
  );

CREATE POLICY "dna: payslips exclusao"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'payslips'
    AND public.storage_is_company_staff(
          public.storage_collaborator_company((storage.foldername(name))[1]),
          'contabilidade')
  );

-- ─── collaborator-documents ─────────────────────────────────────────────────
-- Só leitura por policy. A escrita legítima vem de edge function com
-- service_role (onboarding-upload), que ignora RLS e não precisa de policy —
-- por isso não recriamos INSERT/UPDATE/DELETE aqui.

CREATE POLICY "dna: collaborator-documents leitura"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'collaborator-documents'
    AND (
      public.storage_is_company_staff(
        public.storage_uuid((storage.foldername(name))[1]), 'colaboradores')
      OR public.storage_is_own_collaborator((storage.foldername(name))[2])
    )
  );

-- ─── exam-documents ─────────────────────────────────────────────────────────
-- ASO é dado de saúde (LGPD art. 11): titular vê o próprio, RH vê o da empresa.

CREATE POLICY "dna: exam-documents leitura"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'exam-documents'
    AND (
      public.storage_is_company_staff(
        public.storage_uuid((storage.foldername(name))[1]), 'exames')
      OR EXISTS (
        SELECT 1
        FROM public.occupational_exams e
        JOIN public.collaborators c ON c.id = e.collaborator_id
        WHERE e.id = public.storage_uuid((storage.foldername(name))[2])
          AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "dna: exam-documents escrita"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exam-documents'
    AND public.storage_is_company_staff(
          public.storage_uuid((storage.foldername(name))[1]), 'exames')
  );

CREATE POLICY "dna: exam-documents exclusao"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'exam-documents'
    AND public.storage_is_company_staff(
          public.storage_uuid((storage.foldername(name))[1]), 'exames')
  );

-- ─── company-logos ──────────────────────────────────────────────────────────
-- Bucket PÚBLICO cujas policies de escrita exigiam só `auth.role() =
-- 'authenticated'`: qualquer usuário do portal trocava ou apagava a logomarca
-- de qualquer empresa, e conseguia hospedar arquivo arbitrário num endereço
-- público. Leitura continua aberta (é logo em e-mail e tela de login).
-- Path: <company_id>/logo.<ext> (ConfiguracoesPage.tsx:123)

DROP POLICY IF EXISTS "Company members can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Company members can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete logos" ON storage.objects;

CREATE POLICY "dna: company-logos escrita"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND public.storage_is_company_staff(
          public.storage_uuid((storage.foldername(name))[1]), 'configuracoes')
  );

CREATE POLICY "dna: company-logos substituicao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND public.storage_is_company_staff(
          public.storage_uuid((storage.foldername(name))[1]), 'configuracoes')
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND public.storage_is_company_staff(
          public.storage_uuid((storage.foldername(name))[1]), 'configuracoes')
  );

CREATE POLICY "dna: company-logos exclusao"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND public.storage_is_company_staff(
          public.storage_uuid((storage.foldername(name))[1]), 'configuracoes')
  );

-- ─── Limites de upload ──────────────────────────────────────────────────────
-- Os buckets antigos foram criados sem teto de tamanho nem allowlist de MIME.
UPDATE storage.buckets
   SET file_size_limit = 10485760, -- 10 MB
       allowed_mime_types = ARRAY[
         'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
       ]
 WHERE id IN ('payslips', 'collaborator-documents', 'exam-documents');

UPDATE storage.buckets
   SET file_size_limit = 2097152, -- 2 MB, igual à validação da tela
       -- SVG fica de fora: aceita <script> e o bucket é público.
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'company-logos';

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Restaura o estado anterior (permissivo). Use só se a UI de RH quebrar e for
-- preciso ganhar tempo — os buckets voltam a ficar abertos pra todo autenticado.
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS "dna: payslips leitura" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: payslips escrita" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: payslips substituicao" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: payslips exclusao" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: collaborator-documents leitura" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: exam-documents leitura" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: exam-documents escrita" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: exam-documents exclusao" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: company-logos escrita" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: company-logos substituicao" ON storage.objects;
-- DROP POLICY IF EXISTS "dna: company-logos exclusao" ON storage.objects;
--
-- CREATE POLICY "Users can upload payslips to their company folder"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'payslips' AND auth.role() = 'authenticated');
-- CREATE POLICY "Users can view payslips from their company"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'payslips' AND auth.role() = 'authenticated');
-- CREATE POLICY "Users can delete payslips"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'payslips' AND auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated users can view collaborator documents" ON storage.objects
--   FOR SELECT USING (bucket_id = 'collaborator-documents' AND auth.role() = 'authenticated');
-- CREATE POLICY "Service role can upload collaborator documents" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'collaborator-documents');
-- CREATE POLICY "Service role can update collaborator documents" ON storage.objects
--   FOR UPDATE USING (bucket_id = 'collaborator-documents');
-- CREATE POLICY "Service role can delete collaborator documents" ON storage.objects
--   FOR DELETE USING (bucket_id = 'collaborator-documents');
-- CREATE POLICY "Authenticated users can upload exam documents" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'exam-documents' AND auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated users can view exam documents" ON storage.objects
--   FOR SELECT USING (bucket_id = 'exam-documents' AND auth.role() = 'authenticated');
-- CREATE POLICY "Company members can upload logos" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
-- CREATE POLICY "Company members can update logos" ON storage.objects
--   FOR UPDATE USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
-- CREATE POLICY "Company members can delete logos" ON storage.objects
--   FOR DELETE USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
--
-- DROP FUNCTION IF EXISTS public.storage_collaborator_company(text);
-- DROP FUNCTION IF EXISTS public.storage_is_own_collaborator(text);
-- DROP FUNCTION IF EXISTS public.storage_is_company_staff(uuid, text);
-- DROP FUNCTION IF EXISTS public.storage_uuid(text);
--
-- UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--  WHERE id IN ('payslips', 'collaborator-documents', 'exam-documents', 'company-logos');
--
-- COMMIT;
