-- Migration: integração férias → folha
--
-- 1) Adiciona 'ferias' ao enum payroll_entry_type pra identificar lançamentos
--    de férias na folha (provento principal). 1/3 fica como description.
--    INSS/IRPF de férias seguem nos seus próprios types.
-- 2) Estende vacation_requests com:
--    - calculation_snapshot jsonb: cálculo congelado na aprovação (salário,
--      dias, encargos, líquido) — protege contra mudanças posteriores no
--      salário do colab.
--    - payment_date / payroll_month / payroll_year: pra saber em que folha
--      o lançamento deve aparecer (regra CLT: pagamento até D-2 do gozo).
--    - posted_to_payroll bool: flag de "já lancei na folha?".
--    - payroll_entry_ids uuid[]: ids das entries criadas, pra cleanup se a
--      aprovação for revertida.

-- ⚠️ ALTER TYPE ... ADD VALUE NÃO pode rodar dentro de transação
--    (limitação Postgres). Por isso este bloco roda fora do BEGIN/COMMIT
--    do resto da migration. Supabase CLI aceita isso.

ALTER TYPE public.payroll_entry_type ADD VALUE IF NOT EXISTS 'ferias';

-- O restante das alterações vai numa transação.
BEGIN;

ALTER TABLE public.vacation_requests
  ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS payroll_month integer
    CHECK (payroll_month IS NULL OR (payroll_month BETWEEN 1 AND 12)),
  ADD COLUMN IF NOT EXISTS payroll_year integer
    CHECK (payroll_year IS NULL OR (payroll_year BETWEEN 2020 AND 2100)),
  ADD COLUMN IF NOT EXISTS posted_to_payroll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payroll_entry_ids uuid[];

-- Index pra busca rápida de pendentes ao abrir folha de um mês.
CREATE INDEX IF NOT EXISTS idx_vacation_requests_pending_payroll
  ON public.vacation_requests (company_id, payroll_year, payroll_month)
  WHERE status = 'approved' AND posted_to_payroll = false;

-- Comentários (LGPD/manutenção)
COMMENT ON COLUMN public.vacation_requests.calculation_snapshot IS
  'Cálculo congelado de férias (snapshot na aprovação): salary, days, inss, irrf, gross, liquido. JSON.';
COMMENT ON COLUMN public.vacation_requests.payment_date IS
  'Data de pagamento das férias (regra CLT: D-2 do início). Define em qual folha entra.';
COMMENT ON COLUMN public.vacation_requests.posted_to_payroll IS
  'true = lançamentos já criados em payroll_entries. false = aguardando abertura da folha do mês.';
COMMENT ON COLUMN public.vacation_requests.payroll_entry_ids IS
  'IDs das payroll_entries geradas (provento férias, provento 1/3, desconto INSS, desconto IRPF). Pra reverter se cancelar aprovação.';

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP INDEX IF EXISTS public.idx_vacation_requests_pending_payroll;
--   ALTER TABLE public.vacation_requests
--     DROP COLUMN IF EXISTS payroll_entry_ids,
--     DROP COLUMN IF EXISTS posted_to_payroll,
--     DROP COLUMN IF EXISTS payroll_year,
--     DROP COLUMN IF EXISTS payroll_month,
--     DROP COLUMN IF EXISTS payment_date,
--     DROP COLUMN IF EXISTS calculation_snapshot;
-- COMMIT;
--
-- Nota: rollback do enum value 'ferias' é INVIÁVEL em Postgres sem recriar o
-- type inteiro. Se for emergencial, parar de usar o valor é suficiente
-- (entries que já o usam continuam válidas).
