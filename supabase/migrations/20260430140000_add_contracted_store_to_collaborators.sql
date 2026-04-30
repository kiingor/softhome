-- Migration: 20260430140000_add_contracted_store_to_collaborators.sql
-- Description: adiciona contracted_store_id em collaborators.
--
-- Em multi-CNPJ, a empresa que opera o colaborador (store_id) pode ser
-- diferente da empresa que assina o contrato (contracted_store_id).
-- Ex.: filial executa o trabalho, matriz figura no contrato/holerite.
-- Ambas referenciam a mesma tabela `stores`.

BEGIN;

ALTER TABLE public.collaborators
  ADD COLUMN contracted_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX idx_collaborators_contracted_store
  ON public.collaborators(contracted_store_id);

COMMENT ON COLUMN public.collaborators.contracted_store_id IS
  'Empresa contratante (CNPJ que figura no contrato). Pode diferir de store_id em multi-CNPJ.';

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP INDEX IF EXISTS public.idx_collaborators_contracted_store;
--   ALTER TABLE public.collaborators DROP COLUMN IF EXISTS contracted_store_id;
-- COMMIT;
