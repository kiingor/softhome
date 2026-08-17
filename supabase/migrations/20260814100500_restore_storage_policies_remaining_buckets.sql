-- Restaura as policies de storage dos demais buckets: admission-docs,
-- candidate-cvs, medical-certificates e collaborator-photos.
--
-- Por que existe: as policies de `storage.objects` nunca foram versionadas em
-- migration — foram criadas direto no painel do Supabase Cloud. Quando o banco
-- foi restaurado no Supabase self-hosted da VPS, elas não vieram junto (o
-- schema `storage` é recriado pelo próprio stack). Resultado lá: RLS ligada em
-- storage.objects e ZERO policies, ou seja, deny-by-default — nenhum documento
-- de admissão, currículo ou atestado abre pelo frontend, nem pro RH.
--
-- Esta migration é idempotente e reproduz exatamente a regra que já vigora no
-- Cloud, então roda nos dois ambientes: no Cloud substitui as policies por
-- outras equivalentes (no-op na prática), na VPS preenche o buraco.
--
-- Única diferença deliberada em relação ao original: `TO authenticated` no
-- lugar do `{public}` implícito. Todos os predicados já exigem `auth.uid()`,
-- então é equivalente — só evita que a policy seja avaliada pro papel `anon`.
--
-- admission-docs não recebe INSERT de propósito: o upload legítimo vem da edge
-- function admission-public-submit, que usa service_role e ignora RLS.

BEGIN;

-- Quem é RH: mesma lista usada pelas policies originais.
CREATE OR REPLACE FUNCTION public.storage_is_rh()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
  );
$$;

GRANT EXECUTE ON FUNCTION public.storage_is_rh() TO authenticated;

-- ─── admission-docs (RG/CPF/comprovantes da admissão) ───────────────────────
DROP POLICY IF EXISTS "admin_gc + gestor_gc read admission docs" ON storage.objects;
DROP POLICY IF EXISTS "admin_gc + gestor_gc delete admission docs" ON storage.objects;

CREATE POLICY "admin_gc + gestor_gc read admission docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'admission-docs' AND public.storage_is_rh());

CREATE POLICY "admin_gc + gestor_gc delete admission docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'admission-docs' AND public.storage_is_rh());

-- ─── candidate-cvs (currículos) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_gc + gestor_gc read candidate cvs" ON storage.objects;
DROP POLICY IF EXISTS "admin_gc + gestor_gc upload candidate cvs" ON storage.objects;
DROP POLICY IF EXISTS "admin_gc + gestor_gc delete candidate cvs" ON storage.objects;

CREATE POLICY "admin_gc + gestor_gc read candidate cvs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'candidate-cvs' AND public.storage_is_rh());

CREATE POLICY "admin_gc + gestor_gc upload candidate cvs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'candidate-cvs' AND public.storage_is_rh());

CREATE POLICY "admin_gc + gestor_gc delete candidate cvs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'candidate-cvs' AND public.storage_is_rh());

-- ─── medical-certificates (atestados) ───────────────────────────────────────
DROP POLICY IF EXISTS "Medical cert files: RH read" ON storage.objects;
DROP POLICY IF EXISTS "Medical cert files: RH insert" ON storage.objects;
DROP POLICY IF EXISTS "Medical cert files: RH delete" ON storage.objects;

CREATE POLICY "Medical cert files: RH read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'medical-certificates' AND public.storage_is_rh());

CREATE POLICY "Medical cert files: RH insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'medical-certificates' AND public.storage_is_rh());

CREATE POLICY "Medical cert files: RH delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'medical-certificates' AND public.storage_is_rh());

-- ─── collaborator-photos (foto do crachá) ───────────────────────────────────
-- Leitura por qualquer autenticado é intencional: a foto aparece pra colega em
-- lista e no perfil. Escrita só RH.
DROP POLICY IF EXISTS "Collaborator photos: authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "Collaborator photos: admin/gestor upload" ON storage.objects;
DROP POLICY IF EXISTS "Collaborator photos: admin/gestor update" ON storage.objects;
DROP POLICY IF EXISTS "Collaborator photos: admin/gestor delete" ON storage.objects;

CREATE POLICY "Collaborator photos: authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'collaborator-photos');

CREATE POLICY "Collaborator photos: admin/gestor upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'collaborator-photos' AND public.storage_is_rh());

CREATE POLICY "Collaborator photos: admin/gestor update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'collaborator-photos' AND public.storage_is_rh())
  WITH CHECK (bucket_id = 'collaborator-photos' AND public.storage_is_rh());

CREATE POLICY "Collaborator photos: admin/gestor delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'collaborator-photos' AND public.storage_is_rh());

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Remove as policies e o helper. Atenção: no Supabase Cloud isso deixa esses
-- quatro buckets SEM policy nenhuma (deny-by-default), porque as originais
-- nunca estiveram em migration — elas foram criadas pelo painel. Recrie pelo
-- painel se precisar voltar atrás lá.
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS "admin_gc + gestor_gc read admission docs" ON storage.objects;
-- DROP POLICY IF EXISTS "admin_gc + gestor_gc delete admission docs" ON storage.objects;
-- DROP POLICY IF EXISTS "admin_gc + gestor_gc read candidate cvs" ON storage.objects;
-- DROP POLICY IF EXISTS "admin_gc + gestor_gc upload candidate cvs" ON storage.objects;
-- DROP POLICY IF EXISTS "admin_gc + gestor_gc delete candidate cvs" ON storage.objects;
-- DROP POLICY IF EXISTS "Medical cert files: RH read" ON storage.objects;
-- DROP POLICY IF EXISTS "Medical cert files: RH insert" ON storage.objects;
-- DROP POLICY IF EXISTS "Medical cert files: RH delete" ON storage.objects;
-- DROP POLICY IF EXISTS "Collaborator photos: authenticated read" ON storage.objects;
-- DROP POLICY IF EXISTS "Collaborator photos: admin/gestor upload" ON storage.objects;
-- DROP POLICY IF EXISTS "Collaborator photos: admin/gestor update" ON storage.objects;
-- DROP POLICY IF EXISTS "Collaborator photos: admin/gestor delete" ON storage.objects;
-- DROP FUNCTION IF EXISTS public.storage_is_rh();
--
-- COMMIT;
