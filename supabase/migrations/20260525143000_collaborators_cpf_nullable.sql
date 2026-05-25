-- Migration: tornar cpf nullable em collaborators
--
-- Motivo: durante a sincronização com api.softcom.cloud, colabs vêm sem
-- cpf preenchido (registros incompletos, dados antigos, etc). Hoje a sync
-- joga esses fora com "cpf vazio" — mas o RH quer importar mesmo assim
-- pra completar manual depois.
--
-- Mudanças:
--   1. cpf agora aceita NULL (DROP NOT NULL)
--   2. UNIQUE (cpf, company_id) vira PARTIAL: só impede duplicação quando
--      cpf não é null. Múltiplos colabs com cpf NULL na mesma company são
--      permitidos.

BEGIN;

-- 1. Permite cpf NULL
ALTER TABLE public.collaborators ALTER COLUMN cpf DROP NOT NULL;

-- 2. Recria o UNIQUE como partial (só onde cpf não é null)
ALTER TABLE public.collaborators DROP CONSTRAINT IF EXISTS collaborators_cpf_company_id_key;
CREATE UNIQUE INDEX collaborators_cpf_company_id_partial_key
  ON public.collaborators (cpf, company_id)
  WHERE cpf IS NOT NULL;

COMMIT;

-- ROLLBACK (manual — apaga colabs sem cpf antes de re-aplicar NOT NULL)
-- BEGIN;
--   DROP INDEX IF EXISTS public.collaborators_cpf_company_id_partial_key;
--   DELETE FROM public.collaborators WHERE cpf IS NULL;
--   ALTER TABLE public.collaborators ALTER COLUMN cpf SET NOT NULL;
--   ALTER TABLE public.collaborators ADD CONSTRAINT collaborators_cpf_company_id_key UNIQUE (cpf, company_id);
-- COMMIT;
