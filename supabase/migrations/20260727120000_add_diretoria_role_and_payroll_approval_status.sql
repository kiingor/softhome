-- Migration: 20260727120000_add_diretoria_role_and_payroll_approval_status.sql
-- Description: valores novos de enum pro fluxo de aprovação da folha pela
-- diretoria. SÓ os ALTER TYPE — nada mais entra aqui.
--
-- POR QUE UM ARQUIVO SÓ PRA ISSO: em Postgres um valor de enum criado por
-- ALTER TYPE ... ADD VALUE não pode ser USADO na mesma transação que o criou
-- ("unsafe use of new value of enum type"). A migration 20260727120100 usa
-- 'aprovado_rh'/'aprovado_diretoria' em corpo de função LANGUAGE sql e em
-- predicado de índice parcial, então os ADD VALUE precisam comitar antes.
-- Por isso este arquivo NÃO tem BEGIN/COMMIT — mesmo padrão de
-- 20260625150000_add_emprestimo_payroll_entry_type.sql.
--
-- Aditivo e idempotente (IF NOT EXISTS). Cada ADD VALUE referencia só labels
-- que JÁ existiam ('open', 'closed') — nenhum referencia valor criado aqui.

-- 1. Papel novo: diretoria (aprova a folha em última instância).
--    ATENÇÃO: nenhuma policy existente cita 'diretoria' — sem a 20260727120100
--    (que reescreve as policies) esse usuário loga e não enxerga a folha.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'diretoria';

-- 2. Status novos. Ordem final:
--    open (rótulo "Rascunho") → aprovado_rh → aprovado_diretoria → closed → exported
ALTER TYPE public.payroll_period_status ADD VALUE IF NOT EXISTS 'aprovado_rh' AFTER 'open';
ALTER TYPE public.payroll_period_status ADD VALUE IF NOT EXISTS 'aprovado_diretoria' BEFORE 'closed';

-- ROLLBACK
-- Postgres não suporta remover valor de enum (não existe DROP VALUE). Pra
-- reverter de fato seria preciso recriar os tipos sem os labels e remapear as
-- colunas (payroll_periods.status, user_roles.role) — operação manual e cara.
-- Enquanto nenhuma linha usa os valores, eles são inócuos: o rollback prático é
-- "não usar". Bloco documentado por convenção:
-- BEGIN;
--   -- 1) conferir que ninguém usa:
--   --    SELECT count(*) FROM public.payroll_periods
--   --     WHERE status IN ('aprovado_rh','aprovado_diretoria');
--   --    SELECT count(*) FROM public.user_roles WHERE role = 'diretoria';
--   -- 2) recriar os enums sem os valores e migrar as colunas (manual).
-- COMMIT;
