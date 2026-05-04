-- Migration: 20260504120000_add_collaborator_personal_fields.sql
-- Description: adiciona campos pessoais e de endereço em collaborators
-- pra atender o cadastro completo (RG, endereço, flags PCD/aprendiz, notes).
--
-- Campos pré-existentes que cobrem o pedido:
--   - name, cpf, phone (=WhatsApp), birth_date, regime (CLT/PJ/Estagiário)
--
-- Novos:
--   - rg (texto livre — formatos variam por estado)
--   - address (logradouro+nº+complemento, texto livre)
--   - district (bairro)
--   - city
--   - state (UF, 2 chars)
--   - postal_code (CEP, dígitos sem máscara)
--   - notes (observações livres)
--   - is_pcd (flag pessoa com deficiência)
--   - is_apprentice (flag jovem aprendiz)
--
-- Todos opcionais pra não quebrar collaborators já cadastrados.

BEGIN;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS rg            text,
  ADD COLUMN IF NOT EXISTS address       text,
  ADD COLUMN IF NOT EXISTS district      text,
  ADD COLUMN IF NOT EXISTS city          text,
  ADD COLUMN IF NOT EXISTS state         char(2),
  ADD COLUMN IF NOT EXISTS postal_code   text,
  ADD COLUMN IF NOT EXISTS notes         text,
  ADD COLUMN IF NOT EXISTS is_pcd        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_apprentice boolean NOT NULL DEFAULT false;

-- Constraint leve: UF em maiúsculas se preenchida
ALTER TABLE public.collaborators
  DROP CONSTRAINT IF EXISTS collaborators_state_uppercase_chk;
ALTER TABLE public.collaborators
  ADD CONSTRAINT collaborators_state_uppercase_chk
  CHECK (state IS NULL OR state = upper(state));

-- Índices úteis pra filtros futuros (PCD/aprendiz são consultados em relatórios)
CREATE INDEX IF NOT EXISTS idx_collaborators_is_pcd
  ON public.collaborators(is_pcd) WHERE is_pcd = true;

CREATE INDEX IF NOT EXISTS idx_collaborators_is_apprentice
  ON public.collaborators(is_apprentice) WHERE is_apprentice = true;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   ALTER TABLE public.collaborators
--     DROP CONSTRAINT IF EXISTS collaborators_state_uppercase_chk,
--     DROP COLUMN IF EXISTS rg,
--     DROP COLUMN IF EXISTS address,
--     DROP COLUMN IF EXISTS district,
--     DROP COLUMN IF EXISTS city,
--     DROP COLUMN IF EXISTS state,
--     DROP COLUMN IF EXISTS postal_code,
--     DROP COLUMN IF EXISTS notes,
--     DROP COLUMN IF EXISTS is_pcd,
--     DROP COLUMN IF EXISTS is_apprentice;
--   DROP INDEX IF EXISTS public.idx_collaborators_is_pcd;
--   DROP INDEX IF EXISTS public.idx_collaborators_is_apprentice;
-- COMMIT;
