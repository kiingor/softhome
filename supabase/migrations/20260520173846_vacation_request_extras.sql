-- Migration: gratifications + bonifications na vacation_requests
--
-- Gratificação: valor que SOMA na base de remuneração das férias (aumenta
--   o valor das férias, gera 1/3 proporcional e é tributada — entra em INSS/IRRF).
-- Bonificação: valor LIVRE que entra direto no bruto do recibo, sem 1/3
--   e sem tributação (PLR, prêmios não habituais).

BEGIN;

ALTER TABLE public.vacation_requests
  ADD COLUMN IF NOT EXISTS gratifications numeric(12,2) NOT NULL DEFAULT 0
    CHECK (gratifications >= 0),
  ADD COLUMN IF NOT EXISTS bonifications numeric(12,2) NOT NULL DEFAULT 0
    CHECK (bonifications >= 0);

COMMENT ON COLUMN public.vacation_requests.gratifications IS
  'Gratificação que compõe a base de cálculo das férias (aumenta férias/1/3/INSS/IRRF).';
COMMENT ON COLUMN public.vacation_requests.bonifications IS
  'Bonificação livre paga no recibo (sem 1/3, sem tributar).';

COMMIT;

-- ROLLBACK
-- BEGIN;
--   ALTER TABLE public.vacation_requests
--     DROP COLUMN IF EXISTS bonifications,
--     DROP COLUMN IF EXISTS gratifications;
-- COMMIT;
