-- Migration: 20260611120000_add_carro_agregado_entry_type.sql
-- Description: adiciona 'carro_agregado' ao enum payroll_entry_type.
-- Carro Agregado é um provento (crédito) avulso — pagamento ao colaborador pelo
-- veículo agregado. Soma no líquido como Hora extra/Bonificação. O cálculo de
-- imposto continua sendo do contador (CLAUDE.md princípio 2); INSS/IRPF/FGTS
-- saem só do salário base do cadastro, então este tipo não toca na base.

ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'carro_agregado';

-- ROLLBACK
-- (Postgres não suporta DROP VALUE em enum sem recreate.
--  Pra reverter, recriar o enum sem 'carro_agregado' via ALTER TABLE ... TYPE.)
