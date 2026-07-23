-- Migration: adiciona 'salario_retroativo' ao enum payroll_entry_type
-- Description: novo tipo de lançamento avulso a CRÉDITO "Salário Retroativo",
-- pra lançar diferenças salariais retroativas (aumento aplicado com atraso,
-- ajuste de competência anterior) sem misturar com o salario_base do mês —
-- que é sintético (1 por colab) e base de cálculo de INSS/IRPF/FGTS.
-- O retroativo NÃO entra na base de encargos do mês (imposto sai só do
-- salario_base, por desenho — ver cltCalc.ts). Aditivo e idempotente.

ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'salario_retroativo';

-- ROLLBACK
-- Postgres não suporta remover um valor de enum (DROP VALUE inexistente). Para
-- reverter de fato seria preciso recriar o tipo sem 'salario_retroativo' e
-- recolocar a coluna — operação manual e custosa. Como o valor é inócuo
-- enquanto não usado, o rollback prático é "não usar". Bloco documentado por
-- convenção:
-- BEGIN;
--   -- 1) garantir que nenhuma row usa o valor:
--   --    SELECT count(*) FROM public.payroll_entries WHERE type = 'salario_retroativo';
--   -- 2) recriar o enum sem o valor e migrar a coluna (manual).
-- COMMIT;
