-- Migration: 20260512100000_add_candidate_consent_talent_pool.sql
-- Description: separa o consentimento de banco de talentos do flag is_active.
-- Antes, recruitment-apply gravava is_active = consent_talent_pool, fazendo
-- candidatos que não marcavam consentimento sumirem do banco. Agora:
--   - is_active: candidato está no banco / não pediu saída (soft delete LGPD)
--   - consent_talent_pool: aceita ser contatado para futuras vagas
-- O candidato SEMPRE entra com is_active=true; consent_talent_pool é informativo.

BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS consent_talent_pool boolean NOT NULL DEFAULT false;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS consent_lgpd_at timestamptz;

-- Backfill: candidatos existentes com is_active=true são considerados
-- consentidos (já que o sistema antigo gravava is_active = consent_talent_pool).
UPDATE public.candidates
  SET consent_talent_pool = true
  WHERE is_active = true
    AND consent_talent_pool = false;

COMMENT ON COLUMN public.candidates.consent_talent_pool IS
  'Candidato consentiu em ficar no banco de talentos para futuras vagas (LGPD).';
COMMENT ON COLUMN public.candidates.consent_lgpd_at IS
  'Timestamp em que o candidato aceitou o termo LGPD (último consentimento).';
COMMENT ON COLUMN public.candidates.is_active IS
  'Soft delete LGPD. False = candidato pediu para sair do banco. Não confundir com consent_talent_pool.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- ALTER TABLE public.candidates DROP COLUMN IF EXISTS consent_talent_pool;
-- ALTER TABLE public.candidates DROP COLUMN IF EXISTS consent_lgpd_at;
-- COMMIT;
