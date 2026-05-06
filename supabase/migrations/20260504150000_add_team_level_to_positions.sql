-- Migration: 20260504150000_add_team_level_to_positions.sql
-- Description: adiciona setor (team_id) e nível (level 1-12) à tabela positions

BEGIN;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level smallint CHECK (level >= 1 AND level <= 12);

CREATE INDEX IF NOT EXISTS idx_positions_team_id ON public.positions(team_id);

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP INDEX IF EXISTS idx_positions_team_id;
-- ALTER TABLE public.positions
--   DROP COLUMN IF EXISTS team_id,
--   DROP COLUMN IF EXISTS level;
-- COMMIT;
