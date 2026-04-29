-- Migration: 20260429140000_create_candidate_embeddings.sql
-- Description: infraestrutura pra busca semântica de candidatos pelo
-- Agente Recrutador (Fase 5).
--
-- Componentes:
--   1. Habilita extension pgvector (já vem instalada no Supabase, só precisa enable)
--   2. Adiciona coluna 'cv_summary' em candidates (texto estruturado gerado
--      pelo Claude a partir do PDF — usado pra display + embedding source)
--   3. Cria tabela candidate_embeddings (1 row por candidato com vector 1536d
--      compatível com OpenAI text-embedding-3-small)
--   4. Cria Storage bucket 'candidate-cvs' (privado, com RLS) + policies
--      pra upload/read.
--   5. Cria índice ivfflat pra busca por similaridade (cosine).

BEGIN;

-- 1. pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. cv_summary em candidates (texto livre gerado por Claude a partir do PDF)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS cv_summary text,
  ADD COLUMN IF NOT EXISTS cv_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cv_filename text;

-- 3. candidate_embeddings: 1:1 com candidates
CREATE TABLE IF NOT EXISTS public.candidate_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.candidates(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  content text NOT NULL,                      -- texto fonte (cv_summary)
  embedding vector(1536) NOT NULL,            -- OpenAI text-embedding-3-small dim
  model text NOT NULL,                        -- ex: 'text-embedding-3-small'
  token_count integer,                        -- tokens consumidos no embed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_company
  ON public.candidate_embeddings(company_id);

-- ivfflat pra busca por cosine. lists=100 é razoável pra ~milhares de rows.
-- Pra escalar muito, considerar HNSW (PG 16+).
CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_vector
  ON public.candidate_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TRIGGER set_updated_at_candidate_embeddings
  BEFORE UPDATE ON public.candidate_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_candidate_embeddings
  AFTER INSERT OR UPDATE OR DELETE ON public.candidate_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- 4. RLS — segue mesmo padrão dos demais (admin_gc lê tudo, gestor_gc lê
-- própria empresa, ninguém de fora vê)
ALTER TABLE public.candidate_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gc reads all embeddings" ON public.candidate_embeddings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc reads own embeddings" ON public.candidate_embeddings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(candidate_embeddings.company_id, auth.uid())
  );

-- INSERT/UPDATE só via Edge Function (service_role bypassa RLS).
-- Sem policy de INSERT/UPDATE/DELETE = bloqueado pra usuários autenticados.

-- 5. RPC pra busca por similaridade (Recrutador chama)
CREATE OR REPLACE FUNCTION public.match_candidates(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  candidate_id uuid,
  similarity float,
  content text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER  -- respeita RLS do usuário consultando
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.candidate_id,
    1 - (ce.embedding <=> query_embedding) AS similarity,
    ce.content
  FROM public.candidate_embeddings ce
  WHERE
    (filter_company_id IS NULL OR ce.company_id = filter_company_id)
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 6. Storage bucket pra CVs (privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-cvs',
  'candidate-cvs',
  false,
  5242880,                  -- 5MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: só admin_gc/gestor_gc da empresa upload + read.
-- Path convention: <company_id>/<candidate_id>.pdf
CREATE POLICY "admin_gc + gestor_gc upload candidate cvs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "admin_gc + gestor_gc read candidate cvs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "admin_gc + gestor_gc delete candidate cvs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "admin_gc + gestor_gc delete candidate cvs" ON storage.objects;
--   DROP POLICY IF EXISTS "admin_gc + gestor_gc read candidate cvs" ON storage.objects;
--   DROP POLICY IF EXISTS "admin_gc + gestor_gc upload candidate cvs" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'candidate-cvs';
--   DROP FUNCTION IF EXISTS public.match_candidates(vector, float, int, uuid);
--   DROP POLICY IF EXISTS "gestor_gc reads own embeddings" ON public.candidate_embeddings;
--   DROP POLICY IF EXISTS "admin_gc reads all embeddings" ON public.candidate_embeddings;
--   DROP TABLE IF EXISTS public.candidate_embeddings;
--   ALTER TABLE public.candidates DROP COLUMN IF EXISTS cv_filename;
--   ALTER TABLE public.candidates DROP COLUMN IF EXISTS cv_processed_at;
--   ALTER TABLE public.candidates DROP COLUMN IF EXISTS cv_summary;
-- COMMIT;
