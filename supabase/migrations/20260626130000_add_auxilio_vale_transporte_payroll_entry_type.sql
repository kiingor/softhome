-- Migration: adiciona 'auxilio_vale_transporte' ao enum payroll_entry_type
-- Description: novo tipo de lançamento de CRÉDITO (provento) "Auxílio Vale
-- Transporte", lançável na ficha fixa do colaborador (collaborator_fixed_entries)
-- e materializado na folha. Soma no líquido; isento de INSS/IRPF/FGTS (VT é
-- não-tributável, mesmo tratamento de bonificação). Aditivo e idempotente.

ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'auxilio_vale_transporte';

-- ROLLBACK
-- Postgres não suporta remover um valor de enum. O valor é inócuo enquanto não
-- usado; rollback prático = "não usar". Para reverter de fato seria preciso
-- recriar o tipo sem o valor e migrar a coluna (manual e custoso).
-- BEGIN;
--   -- SELECT count(*) FROM public.payroll_entries WHERE type = 'auxilio_vale_transporte';
--   -- SELECT count(*) FROM public.collaborator_fixed_entries WHERE type = 'auxilio_vale_transporte';
-- COMMIT;
