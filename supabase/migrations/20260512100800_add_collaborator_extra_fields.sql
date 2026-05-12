-- Migration: 20260512100800_add_collaborator_extra_fields.sql
-- Description: campos adicionais no cadastro do colaborador solicitados pelo RH.
-- recado_phone: telefone de parente/responsável separado do phone do próprio.
-- pis: número PIS dedicado (antes era pedido apenas como texto na admissão).
-- discord_username: identificador no Discord do time.
-- accounting_code: código usado pela contabilidade externa para identificar
-- o colaborador em folhas/relatórios.

BEGIN;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS recado_phone text,
  ADD COLUMN IF NOT EXISTS pis text,
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS accounting_code text;

COMMENT ON COLUMN public.collaborators.recado_phone IS
  'Telefone de recado (parente/responsável próximo).';
COMMENT ON COLUMN public.collaborators.pis IS
  'Número do PIS/NIS do colaborador (somente dígitos).';
COMMENT ON COLUMN public.collaborators.discord_username IS
  'Identificador no Discord do time.';
COMMENT ON COLUMN public.collaborators.accounting_code IS
  'Código de identificação na contabilidade externa.';

CREATE INDEX IF NOT EXISTS idx_collaborators_accounting_code
  ON public.collaborators(company_id, accounting_code)
  WHERE accounting_code IS NOT NULL;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_collaborators_accounting_code;
-- ALTER TABLE public.collaborators
--   DROP COLUMN IF EXISTS recado_phone,
--   DROP COLUMN IF EXISTS pis,
--   DROP COLUMN IF EXISTS discord_username,
--   DROP COLUMN IF EXISTS accounting_code;
-- COMMIT;
