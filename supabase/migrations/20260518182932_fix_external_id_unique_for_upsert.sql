-- Migration: 20260518182932_fix_external_id_unique_for_upsert.sql
-- Description: substitui os índices unique PARCIAIS criados em
-- 20260518172624 por CONSTRAINTS unique normais.
--
-- Motivo: PostgreSQL não aceita partial unique index (com WHERE) como
-- target de ON CONFLICT — `supabase.from(...).upsert({}, { onConflict:
-- "company_id,external_id" })` quebra com:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--   specification"
--
-- Constraints UNIQUE normais aceitam NULLs como valores distintos por
-- padrão no Postgres, então o comportamento desejado (permitir múltiplos
-- registros manuais sem external_id) é preservado:
--   (companyA, 'ext1')  ← gravado
--   (companyA, 'ext1')  ← bloqueado (duplicate)
--   (companyA, NULL)    ← permitido
--   (companyA, NULL)    ← também permitido (NULL ≠ NULL)

BEGIN;

-- stores
DROP INDEX IF EXISTS public.idx_stores_external_id_unique;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_company_external_uk UNIQUE (company_id, external_id);

-- teams
DROP INDEX IF EXISTS public.idx_teams_external_id_unique;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_company_external_uk UNIQUE (company_id, external_id);

-- positions
DROP INDEX IF EXISTS public.idx_positions_external_id_unique;
ALTER TABLE public.positions
  ADD CONSTRAINT positions_company_external_uk UNIQUE (company_id, external_id);

-- collaborators
DROP INDEX IF EXISTS public.idx_collaborators_external_id_unique;
ALTER TABLE public.collaborators
  ADD CONSTRAINT collaborators_company_external_uk UNIQUE (company_id, external_id);

COMMIT;

-- ROLLBACK
-- BEGIN;
--   ALTER TABLE public.collaborators DROP CONSTRAINT IF EXISTS collaborators_company_external_uk;
--   ALTER TABLE public.positions     DROP CONSTRAINT IF EXISTS positions_company_external_uk;
--   ALTER TABLE public.teams         DROP CONSTRAINT IF EXISTS teams_company_external_uk;
--   ALTER TABLE public.stores        DROP CONSTRAINT IF EXISTS stores_company_external_uk;
--   CREATE UNIQUE INDEX idx_collaborators_external_id_unique
--     ON public.collaborators(company_id, external_id) WHERE external_id IS NOT NULL;
--   CREATE UNIQUE INDEX idx_positions_external_id_unique
--     ON public.positions(company_id, external_id) WHERE external_id IS NOT NULL;
--   CREATE UNIQUE INDEX idx_teams_external_id_unique
--     ON public.teams(company_id, external_id) WHERE external_id IS NOT NULL;
--   CREATE UNIQUE INDEX idx_stores_external_id_unique
--     ON public.stores(company_id, external_id) WHERE external_id IS NOT NULL;
-- COMMIT;
