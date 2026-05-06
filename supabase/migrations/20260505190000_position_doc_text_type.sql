-- Migration: 20260505190000_position_doc_text_type.sql
-- Description: adiciona 'texto' como tipo de documento do cargo (resposta
-- textual em vez de arquivo). Também adiciona text_response em
-- admission_documents pra armazenar a resposta do candidato.
--
-- Use case: cadastrar um item tipo "Conte sua experiência com X" ou
-- "Endereço completo" como doc obrigatório do cargo. O candidato preenche
-- texto na página pública em vez de anexar PDF.

BEGIN;

-- 1) Atualiza o CHECK constraint de position_documents.file_type
ALTER TABLE public.position_documents
  DROP CONSTRAINT IF EXISTS position_documents_file_type_check;

ALTER TABLE public.position_documents
  ADD CONSTRAINT position_documents_file_type_check
  CHECK (file_type IN ('pdf', 'image', 'doc', 'texto', 'pdf_image', 'sim_nao'));

-- 2) Adiciona text_response em admission_documents
ALTER TABLE public.admission_documents
  ADD COLUMN IF NOT EXISTS text_response text;

COMMENT ON COLUMN public.admission_documents.text_response IS
  'Resposta textual quando o doc do cargo é do tipo texto (ao invés de arquivo). Mutuamente exclusivo com file_url.';

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.admission_documents DROP COLUMN IF EXISTS text_response;
-- ALTER TABLE public.position_documents DROP CONSTRAINT IF EXISTS position_documents_file_type_check;
-- ALTER TABLE public.position_documents
--   ADD CONSTRAINT position_documents_file_type_check
--   CHECK (file_type IN ('pdf', 'image', 'doc'));
-- COMMIT;
