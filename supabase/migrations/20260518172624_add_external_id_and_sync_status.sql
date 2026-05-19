-- Migration: 20260518172624_add_external_id_and_sync_status.sql
-- Description: prepara stores/teams/positions/collaborators para sync
-- com a API legada api.softcom.cloud (codinome "agenda"). Adiciona:
--   1. external_id em todas as 4 tabelas (ID remoto, genérico, text)
--   2. is_active em stores/teams/positions (collaborators já tem 'status')
--   3. audit_log_trigger em stores (única das 4 sem trigger anexado;
--      teams/positions/companies cobertos em 20260505180000;
--      collaborators em 20260428100000)
--
-- Estratégia de sync = espelho 100%: insert novos, update existentes
-- (match por external_id), marcar como inativo (is_active=false ou
-- status='inativo') o que sumiu da API. Detalhes em
-- docs/adr/0005-integration-softcom-cloud.md.
--
-- NÃO altera filtros das listagens existentes — telas continuam
-- mostrando todos os registros independente de is_active.

BEGIN;

-- 1. external_id nas 4 tabelas
ALTER TABLE public.stores         ADD COLUMN external_id text;
ALTER TABLE public.teams          ADD COLUMN external_id text;
ALTER TABLE public.positions      ADD COLUMN external_id text;
ALTER TABLE public.collaborators  ADD COLUMN external_id text;

-- 2. Unique parcial — permite registros manuais sem external_id,
-- impede colisão entre sincronizados dentro da mesma company.
CREATE UNIQUE INDEX idx_stores_external_id_unique
  ON public.stores(company_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX idx_teams_external_id_unique
  ON public.teams(company_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX idx_positions_external_id_unique
  ON public.positions(company_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX idx_collaborators_external_id_unique
  ON public.collaborators(company_id, external_id)
  WHERE external_id IS NOT NULL;

-- 3. is_active onde falta. collaborators usa enum 'status' existente
-- ('ativo'/'inativo') e fica fora desta migration.
ALTER TABLE public.stores
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.teams
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.positions
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- 4. Audit trigger em stores. Idempotente via lookup em pg_trigger
-- (mesmo padrão de 20260505180000_extend_audit_coverage.sql).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'stores'
      AND t.tgname = 'audit_stores'
  ) THEN
    CREATE TRIGGER audit_stores
      AFTER INSERT OR UPDATE OR DELETE ON public.stores
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
  END IF;
END;
$$;

COMMIT;

-- ============================================================
-- ROLLBACK (executar em ordem inversa em caso de reversão)
-- ============================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS audit_stores ON public.stores;
--   ALTER TABLE public.positions    DROP COLUMN IF EXISTS is_active;
--   ALTER TABLE public.teams        DROP COLUMN IF EXISTS is_active;
--   ALTER TABLE public.stores       DROP COLUMN IF EXISTS is_active;
--   DROP INDEX IF EXISTS public.idx_collaborators_external_id_unique;
--   DROP INDEX IF EXISTS public.idx_positions_external_id_unique;
--   DROP INDEX IF EXISTS public.idx_teams_external_id_unique;
--   DROP INDEX IF EXISTS public.idx_stores_external_id_unique;
--   ALTER TABLE public.collaborators DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.positions     DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.teams         DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.stores        DROP COLUMN IF EXISTS external_id;
-- COMMIT;
