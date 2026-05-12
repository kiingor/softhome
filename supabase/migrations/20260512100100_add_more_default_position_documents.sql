-- Migration: 20260512100100_add_more_default_position_documents.sql
-- Description: amplia a função insert_default_position_documents para incluir
-- documentos adicionais que o RH precisa pedir (Exame Admissional, comprovante
-- de escolaridade, CNH, e documentos de dependentes). Roda backfill nos cargos
-- existentes e a trigger nos novos já passa a popular esses docs.

BEGIN;

CREATE OR REPLACE FUNCTION public.insert_default_position_documents(
  p_position_id uuid,
  p_company_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  defaults_pdf_image text[] := ARRAY[
    'RG',
    'CPF',
    'Cartão de Vacina contra Covid',
    'Comprovante de Residência',
    'CTPS',
    'Foto 3x4',
    'Exame Admissional',
    'Comprovante de Escolaridade',
    'CNH (se possuir)',
    'Certidão de Nascimento de Dependentes',
    'Declaração de Frequência Escolar dos Dependentes',
    'Carteira de Vacinação dos Dependentes'
  ];
  defaults_texto text[] := ARRAY[
    'Número do PIS',
    'Chave PIX e conta de destino',
    'Tamanho da camisa',
    'N° telefone de parente próximo'
  ];
  defaults_sim_nao text[] := ARRAY[
    'Será optante de vale transporte? (desconto de 6% no contracheque)'
  ];
  doc_name text;
BEGIN
  -- PDF/Imagem
  FOREACH doc_name IN ARRAY defaults_pdf_image LOOP
    INSERT INTO public.position_documents (position_id, company_id, name, file_type)
    SELECT p_position_id, p_company_id, doc_name, 'pdf_image'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.position_documents
      WHERE position_id = p_position_id AND name = doc_name
    );
  END LOOP;

  -- Texto
  FOREACH doc_name IN ARRAY defaults_texto LOOP
    INSERT INTO public.position_documents (position_id, company_id, name, file_type)
    SELECT p_position_id, p_company_id, doc_name, 'texto'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.position_documents
      WHERE position_id = p_position_id AND name = doc_name
    );
  END LOOP;

  -- Sim/Não
  FOREACH doc_name IN ARRAY defaults_sim_nao LOOP
    INSERT INTO public.position_documents (position_id, company_id, name, file_type)
    SELECT p_position_id, p_company_id, doc_name, 'sim_nao'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.position_documents
      WHERE position_id = p_position_id AND name = doc_name
    );
  END LOOP;
END;
$$;

-- Backfill: roda em todos os cargos existentes para popular os novos defaults
DO $$
DECLARE
  pos record;
BEGIN
  FOR pos IN SELECT id, company_id FROM public.positions LOOP
    PERFORM public.insert_default_position_documents(pos.id, pos.company_id);
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Restaura a função original (sem os 6 docs novos). Não remove os documentos
-- já inseridos via backfill — o RH pode deletar manualmente em "Cargos" se
-- quiser limpar. (Documentos já vinculados a admissões em curso não devem
-- ser removidos por integridade referencial.)
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.insert_default_position_documents(
--   p_position_id uuid,
--   p_company_id uuid
-- ) RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   defaults_pdf_image text[] := ARRAY[
--     'RG', 'CPF', 'Cartão de Vacina contra Covid',
--     'Comprovante de Residência', 'CTPS', 'Foto 3x4'
--   ];
--   defaults_texto text[] := ARRAY[
--     'Número do PIS', 'Chave PIX e conta de destino',
--     'Tamanho da camisa', 'N° telefone de parente próximo'
--   ];
--   defaults_sim_nao text[] := ARRAY[
--     'Será optante de vale transporte? (desconto de 6% no contracheque)'
--   ];
--   doc_name text;
-- BEGIN
--   FOREACH doc_name IN ARRAY defaults_pdf_image LOOP
--     INSERT INTO public.position_documents (position_id, company_id, name, file_type)
--     SELECT p_position_id, p_company_id, doc_name, 'pdf_image'
--     WHERE NOT EXISTS (SELECT 1 FROM public.position_documents WHERE position_id = p_position_id AND name = doc_name);
--   END LOOP;
--   FOREACH doc_name IN ARRAY defaults_texto LOOP
--     INSERT INTO public.position_documents (position_id, company_id, name, file_type)
--     SELECT p_position_id, p_company_id, doc_name, 'texto'
--     WHERE NOT EXISTS (SELECT 1 FROM public.position_documents WHERE position_id = p_position_id AND name = doc_name);
--   END LOOP;
--   FOREACH doc_name IN ARRAY defaults_sim_nao LOOP
--     INSERT INTO public.position_documents (position_id, company_id, name, file_type)
--     SELECT p_position_id, p_company_id, doc_name, 'sim_nao'
--     WHERE NOT EXISTS (SELECT 1 FROM public.position_documents WHERE position_id = p_position_id AND name = doc_name);
--   END LOOP;
-- END;
-- $$;
-- COMMIT;
