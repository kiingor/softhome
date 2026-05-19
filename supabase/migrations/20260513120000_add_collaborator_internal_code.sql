-- Migration: 20260513120000_add_collaborator_internal_code.sql
-- Description: adiciona campo "Código interno" no cadastro do colaborador. É o
-- identificador/matrícula que a Softcom usa internamente pra cada pessoa
-- (separado do accounting_code, que é o código exposto pra contabilidade
-- terceirizada). Free text — sem unique pra não bloquear migração de dados
-- legados, o RH pode garantir unicidade no processo se quiser.

BEGIN;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS internal_code text;

COMMENT ON COLUMN public.collaborators.internal_code IS
  'Código/matrícula interna do colaborador (uso administrativo Softcom).';

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.collaborators
--   DROP COLUMN IF EXISTS internal_code;
-- COMMIT;
