-- Migration: 20260505130000_add_gratificacao_entry_type.sql
-- Description: adiciona 'gratificacao' ao enum payroll_entry_type.
-- Gratificação é um provento que (segundo regra do contador) só desconta IRPF,
-- não INSS/FGTS. O cálculo do imposto continua sendo responsabilidade do
-- contador (CLAUDE.md princípio 2) — aqui só registramos o tipo.

ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'gratificacao';

-- ROLLBACK
-- (Postgres não suporta DROP VALUE em enum sem recreate.
--  Pra reverter, recriar o enum sem 'gratificacao' via ALTER TABLE ... TYPE.)
