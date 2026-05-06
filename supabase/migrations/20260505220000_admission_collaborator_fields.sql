-- Migration: 20260505220000_admission_collaborator_fields.sql
-- Description: adiciona dados pessoais que o candidato preenche durante a
-- admissão. Esses campos viram base do cadastro de colaborador quando a
-- admissão é admitida.

BEGIN;

ALTER TABLE public.admission_journeys
  ADD COLUMN IF NOT EXISTS candidate_birth_date date,
  ADD COLUMN IF NOT EXISTS candidate_rg text,
  ADD COLUMN IF NOT EXISTS candidate_zip text,
  ADD COLUMN IF NOT EXISTS candidate_address text,
  ADD COLUMN IF NOT EXISTS candidate_address_number text,
  ADD COLUMN IF NOT EXISTS candidate_address_complement text,
  ADD COLUMN IF NOT EXISTS candidate_neighborhood text,
  ADD COLUMN IF NOT EXISTS candidate_city text,
  ADD COLUMN IF NOT EXISTS candidate_state text;

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.admission_journeys
--   DROP COLUMN IF EXISTS candidate_birth_date,
--   DROP COLUMN IF EXISTS candidate_rg,
--   DROP COLUMN IF EXISTS candidate_zip,
--   DROP COLUMN IF EXISTS candidate_address,
--   DROP COLUMN IF EXISTS candidate_address_number,
--   DROP COLUMN IF EXISTS candidate_address_complement,
--   DROP COLUMN IF EXISTS candidate_neighborhood,
--   DROP COLUMN IF EXISTS candidate_city,
--   DROP COLUMN IF EXISTS candidate_state;
-- COMMIT;
