-- Migration: Salário-Família (CLT, INSS)
--
-- Adiciona suporte ao salário-família — benefício pago ao empregado de baixa
-- renda por filho de até 14 anos OU inválido de qualquer idade.
--
-- Regra (Lei 4.266/1963 + reajustes anuais do INSS):
--   • Salário do empregado ≤ limite (constante anual, ~R$ 1.906 em 2025)
--   • Filho com menos de 14 anos completos OU filho inválido (qualquer idade)
--   • Valor único por filho elegível (~R$ 65 em 2025)
--   • Isento de INSS, IRPF e FGTS
--   • Empregador paga e compensa no recolhimento patronal do INSS
--
-- Mudanças:
--   1. Novo valor 'salario_familia' no enum payroll_entry_type — entry própria
--      pra ficar identificável no relatório/Pagamentos e NÃO entrar na base
--      de impostos (ao contrário de gratificacao, que compõe base).
--   2. Coluna `is_invalid` em collaborator_dependents pra cobrir "inválido
--      qualquer idade" (regra independente da data de nascimento).

BEGIN;

-- 1. Adiciona 'salario_familia' ao enum (no-op se já existe — Postgres não
--    suporta IF NOT EXISTS em ADD VALUE, então usamos DO block.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payroll_entry_type'
      AND e.enumlabel = 'salario_familia'
  ) THEN
    ALTER TYPE public.payroll_entry_type ADD VALUE 'salario_familia';
  END IF;
END$$;

-- 2. Coluna is_invalid em dependentes (default false; só RH marca)
ALTER TABLE public.collaborator_dependents
  ADD COLUMN IF NOT EXISTS is_invalid boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.collaborator_dependents.is_invalid IS
  'True se o dependente é inválido (deficiente). Pra salário-família, inválido tem direito a qualquer idade — não só até 14 anos.';

COMMIT;

-- ROLLBACK
-- BEGIN;
--   ALTER TABLE public.collaborator_dependents DROP COLUMN IF EXISTS is_invalid;
--   -- ATENÇÃO: Postgres não suporta DROP VALUE de enum sem recriar o tipo.
--   -- Rollback do enum exige migration manual: criar novo enum sem 'salario_familia',
--   -- ALTER TABLE payroll_entries ALTER COLUMN type TYPE novo_enum, DROP TYPE antigo.
--   -- Como salario_familia é aditivo e idempotente, NÃO removemos no rollback.
-- COMMIT;
