-- Migration: adiciona 'emprestimo' ao enum payroll_entry_type
-- Description: novo tipo de lançamento de DÉBITO (avulso) "Empréstimo", pra
-- descontar parcelas de empréstimo na folha. Aditivo e idempotente.

ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'emprestimo';

-- ROLLBACK
-- Postgres não suporta remover um valor de enum (DROP VALUE inexistente). Para
-- reverter de fato seria preciso recriar o tipo sem 'emprestimo' e recolocar a
-- coluna — operação manual e custosa. Como o valor é inócuo enquanto não usado,
-- o rollback prático é "não usar". Bloco de rollback documentado por convenção:
-- BEGIN;
--   -- 1) garantir que nenhuma row usa o valor:
--   --    SELECT count(*) FROM public.payroll_entries WHERE type = 'emprestimo';
--   -- 2) recriar o enum sem o valor e migrar a coluna (manual).
-- COMMIT;
