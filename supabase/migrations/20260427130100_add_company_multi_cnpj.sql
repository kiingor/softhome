-- Migration: 20260427130100_add_company_multi_cnpj.sql
-- Description: refina hierarquia multi-CNPJ em companies conforme
-- ADR 0002. Adiciona is_matriz (boolean) e parent_company_id (FK self).
--
-- Softcom é grupo: matriz (CNPJ A) + filiais (CNPJs B, C, D). Filiais
-- apontam pra matriz via parent_company_id. Matriz tem is_matriz=true
-- e parent_company_id=NULL.

BEGIN;

-- 1. is_matriz com default false (segurança: filial é o caso mais comum)
ALTER TABLE public.companies
  ADD COLUMN is_matriz boolean NOT NULL DEFAULT false;

-- 2. parent_company_id auto-FK; ON DELETE RESTRICT pra evitar órfãos
ALTER TABLE public.companies
  ADD COLUMN parent_company_id uuid
    REFERENCES public.companies(id) ON DELETE RESTRICT;

-- 3. Constraint: matriz não pode ter parent; filial precisa ter parent.
ALTER TABLE public.companies
  ADD CONSTRAINT companies_matriz_no_parent
    CHECK (
      (is_matriz = true AND parent_company_id IS NULL)
      OR (is_matriz = false)
    );

-- 4. Índice em parent_company_id (queries "listar filiais da matriz X")
CREATE INDEX idx_companies_parent ON public.companies(parent_company_id);

-- 5. Índice parcial em is_matriz=true (deve haver poucas matrizes; lookup rápido)
CREATE INDEX idx_companies_matriz ON public.companies(id) WHERE is_matriz = true;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP INDEX IF EXISTS public.idx_companies_matriz;
--   DROP INDEX IF EXISTS public.idx_companies_parent;
--   ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_matriz_no_parent;
--   ALTER TABLE public.companies DROP COLUMN IF EXISTS parent_company_id;
--   ALTER TABLE public.companies DROP COLUMN IF EXISTS is_matriz;
-- COMMIT;
