-- Migration: 20260508120100_add_adicional_benefit_category.sql
-- Description: adiciona 'adicional' ao enum benefit_category. Diferente das
-- demais categorias (meal/transport/health/...), benefícios marcados como
-- "Adicional" representam valores em dinheiro que entram na folha pagável
-- (não são vouchers/serviços). A flag de pagabilidade no payroll_entries
-- é definida em migration separada (20260508120200).

ALTER TYPE public.benefit_category ADD VALUE IF NOT EXISTS 'adicional';

-- ROLLBACK
-- (Postgres não suporta DROP VALUE em enum sem recreate.
--  Pra reverter, recriar o enum sem 'adicional' via:
--    1. Renomear o tipo atual: ALTER TYPE benefit_category RENAME TO benefit_category_old;
--    2. Criar o tipo sem 'adicional': CREATE TYPE benefit_category AS ENUM (...);
--    3. Atualizar tabelas que usam: ALTER TABLE benefits ALTER COLUMN category TYPE benefit_category USING category::text::benefit_category;
--    4. Drop do tipo antigo: DROP TYPE benefit_category_old;)
