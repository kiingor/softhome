-- Migration: 20260505200000_default_position_documents.sql
-- Description: define documentos padrão que TODO cargo precisa pedir do
-- candidato (RG, CPF, CTPS, foto 3x4, etc + perguntas de texto + sim/não).
-- Faz backfill nos cargos existentes e cria trigger pra novos cargos
-- receberem os defaults automaticamente.
--
-- Os defaults seguem a lista da Softcom. Idempotente: usa UNIQUE-like check
-- por (position_id, name) pra não duplicar quando já existe.

BEGIN;

-- 1) Função que insere defaults pra um position_id (idempotente por name)
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

-- 2) Backfill: insere defaults em todos os cargos existentes
DO $$
DECLARE
  pos record;
BEGIN
  FOR pos IN SELECT id, company_id FROM public.positions LOOP
    PERFORM public.insert_default_position_documents(pos.id, pos.company_id);
  END LOOP;
END $$;

-- 3) Trigger: novos cargos recebem os defaults automaticamente
CREATE OR REPLACE FUNCTION public.add_default_docs_to_new_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_default_position_documents(NEW.id, NEW.company_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_docs_new_position ON public.positions;
CREATE TRIGGER trg_default_docs_new_position
  AFTER INSERT ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.add_default_docs_to_new_position();

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_default_docs_new_position ON public.positions;
-- DROP FUNCTION IF EXISTS public.add_default_docs_to_new_position();
-- DROP FUNCTION IF EXISTS public.insert_default_position_documents(uuid, uuid);
-- COMMIT;
