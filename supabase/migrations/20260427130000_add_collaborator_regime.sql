-- Migration: 20260427130000_add_collaborator_regime.sql
-- Description: adiciona enum 'collaborator_regime' (CLT/PJ/Estagiário)
-- e colunas 'regime' + 'termination_date' em collaborators.
--
-- Banco-alvo está vazio; default 'clt' garante backfill seguro
-- mesmo se houver dados de teste futuros.

BEGIN;

-- 1. Enum de regime
CREATE TYPE public.collaborator_regime AS ENUM (
  'clt',
  'pj',
  'estagiario'
);

-- 2. Coluna regime (NOT NULL com default — seguro pra backfill)
ALTER TABLE public.collaborators
  ADD COLUMN regime public.collaborator_regime NOT NULL DEFAULT 'clt';

-- 3. Coluna termination_date (data de desligamento, opcional)
ALTER TABLE public.collaborators
  ADD COLUMN termination_date date;

-- 4. Índice por regime (filtros frequentes em folha por regime)
CREATE INDEX idx_collaborators_regime ON public.collaborators(regime);

COMMIT;

-- ROLLBACK
-- BEGIN;
--   ALTER TABLE public.collaborators DROP COLUMN IF EXISTS termination_date;
--   ALTER TABLE public.collaborators DROP COLUMN IF EXISTS regime;
--   DROP INDEX IF EXISTS public.idx_collaborators_regime;
--   DROP TYPE IF EXISTS public.collaborator_regime;
-- COMMIT;
