-- Adiciona 'periculosidade' ao enum payroll_entry_type (provento manual a
-- CRÉDITO, ex.: adicional de periculosidade lançado avulso na folha).
--
-- ALTER TYPE ... ADD VALUE NÃO pode rodar dentro de transação (BEGIN/COMMIT),
-- então este arquivo roda o statement solto. Aditivo e idempotente.

ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'periculosidade';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Postgres NÃO suporta remover um valor de enum diretamente. Pra reverter seria
-- preciso recriar o tipo sem o valor (e migrar todas as colunas que o usam) —
-- caro e arriscado. Como é só um valor novo (ninguém é obrigado a usá-lo),
-- o rollback prático é não oferecer 'periculosidade' na UI (tirar de
-- MANUAL_CREDIT_TYPES/ACTIVE_ENTRY_TYPES em src/modules/payroll/types.ts).
