-- Migration: 20260505210000_remove_cnpj_default.sql
-- Description: remove o doc 'CNPJ' que foi inserido como default em todos
-- os cargos via 20260505200000. Foi um engano — não vai ser pedido.
-- Atualiza também a função insert_default_position_documents pra não
-- recriar em cargos novos.

BEGIN;

-- 1) Remove CNPJ dos cargos onde foi adicionado como default
DELETE FROM public.position_documents
WHERE name = 'CNPJ';

-- 2) Recria a função sem CNPJ na lista de defaults
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
    'Foto 3x4'
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
  FOREACH doc_name IN ARRAY defaults_pdf_image LOOP
    INSERT INTO public.position_documents (position_id, company_id, name, file_type)
    SELECT p_position_id, p_company_id, doc_name, 'pdf_image'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.position_documents
      WHERE position_id = p_position_id AND name = doc_name
    );
  END LOOP;

  FOREACH doc_name IN ARRAY defaults_texto LOOP
    INSERT INTO public.position_documents (position_id, company_id, name, file_type)
    SELECT p_position_id, p_company_id, doc_name, 'texto'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.position_documents
      WHERE position_id = p_position_id AND name = doc_name
    );
  END LOOP;

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

COMMIT;

-- ROLLBACK
-- (Pra restaurar o CNPJ teria que rodar a migration 20260505200000 de novo
--  ou recadastrar manualmente nos cargos onde fizesse sentido.)
