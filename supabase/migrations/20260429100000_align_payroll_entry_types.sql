-- Migration: 20260429100000_align_payroll_entry_types.sql
-- Description: alinha enum payroll_entry_type com tipos de lançamento
-- definidos pra SoftHome (decisão Q1 da Fase 4 confirmada com user).
--
-- Mudanças:
--   'salario'   -> 'salario_base'
--   'adicional' -> 'hora_extra'
--   'vale'      -> 'beneficio'
--   ADD 'falta', 'atestado', 'adiantamento', 'bonificacao', 'desconto'
--
-- Valores que ficam ÓRFÃOS (Postgres não suporta DROP VALUE):
--   'custo', 'despesa', 'inss', 'fgts', 'irpf'
-- Não usar mais. CLAUDE.md princípio 2: não calculamos folha CLT
-- (INSS/FGTS/IRPF são responsabilidade do contador).
--
-- Idempotente: cada operação só roda se ainda for necessária.

DO $$
BEGIN
  -- 1. Renomeia 'salario' -> 'salario_base'
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.payroll_entry_type'::regtype
      AND enumlabel = 'salario'
  ) THEN
    EXECUTE $stmt$ALTER TYPE public.payroll_entry_type RENAME VALUE 'salario' TO 'salario_base'$stmt$;
  END IF;

  -- 2. Renomeia 'adicional' -> 'hora_extra'
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.payroll_entry_type'::regtype
      AND enumlabel = 'adicional'
  ) THEN
    EXECUTE $stmt$ALTER TYPE public.payroll_entry_type RENAME VALUE 'adicional' TO 'hora_extra'$stmt$;
  END IF;

  -- 3. Renomeia 'vale' -> 'beneficio'
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.payroll_entry_type'::regtype
      AND enumlabel = 'vale'
  ) THEN
    EXECUTE $stmt$ALTER TYPE public.payroll_entry_type RENAME VALUE 'vale' TO 'beneficio'$stmt$;
  END IF;
END$$;

-- 4. Adiciona novos valores (idempotente via IF NOT EXISTS)
ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'falta';
ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'atestado';
ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'adiantamento';
ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'bonificacao';
ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'desconto';

-- ROLLBACK
-- ALTER TYPE public.payroll_entry_type RENAME VALUE 'salario_base' TO 'salario';
-- ALTER TYPE public.payroll_entry_type RENAME VALUE 'hora_extra' TO 'adicional';
-- ALTER TYPE public.payroll_entry_type RENAME VALUE 'beneficio' TO 'vale';
-- (Novos valores 'falta'/'atestado'/'adiantamento'/'bonificacao'/'desconto'
--  não podem ser DROP-ados em PG sem recreate-enum.)
