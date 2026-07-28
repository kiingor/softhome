-- Migration: 20260728120000_payroll_collaborator_director_status.sql
-- Description: parecer da DIRETORIA por colaborador dentro do período de folha
-- ("Aprovado" / "Atenção"), mostrado como dois botões na aba Aprovação.
--
-- POR QUE NA payroll_collaborator_reviews E NÃO EM TABELA NOVA: já existe 1
-- linha por (period_id, collaborator_id) com UNIQUE, RLS e agora audit trigger.
-- Reusamos a TABELA, não as COLUNAS: `is_reviewed`/`observation` são a
-- conferência do RH (em uso pesado em produção) e continuam intocadas — o
-- parecer da diretoria mora em colunas próprias, então os dois convivem sem
-- sobrescrever um ao outro.
--
-- 3 estados: NULL (ainda não olhou) / 'aprovado' / 'atencao'. NULL em vez de
-- default 'pendente' porque a ausência de parecer é justamente o estado inicial
-- e não queremos escrever linha pra 300 pessoas sem necessidade.

BEGIN;

ALTER TABLE public.payroll_collaborator_reviews
  ADD COLUMN IF NOT EXISTS director_status    text,
  ADD COLUMN IF NOT EXISTS director_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS director_status_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- CHECK separado (ADD CONSTRAINT não tem IF NOT EXISTS): idempotente via
-- pg_constraint, no mesmo estilo defensivo das outras migrations do módulo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payroll_collaborator_reviews'::regclass
       AND conname  = 'payroll_reviews_director_status_check'
  ) THEN
    ALTER TABLE public.payroll_collaborator_reviews
      ADD CONSTRAINT payroll_reviews_director_status_check
      CHECK (director_status IS NULL OR director_status IN ('aprovado', 'atencao'));
  END IF;
END $$;

COMMENT ON COLUMN public.payroll_collaborator_reviews.director_status IS
  'Parecer da diretoria sobre esse colaborador nesta folha: NULL = não avaliado, aprovado, atencao. Independente de is_reviewed (conferência do RH).';

-- Fila da diretoria: "quem eu marquei como atenção nesta folha".
CREATE INDEX IF NOT EXISTS idx_payroll_reviews_director_status
  ON public.payroll_collaborator_reviews (period_id, director_status)
  WHERE director_status IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Carimbo server-authoritative de quem/quando deu o parecer. O client manda só
-- o director_status; quem preenche o resto é o banco.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_review_director_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.director_status IS NOT NULL THEN
      NEW.director_status_at := now();
      NEW.director_status_by := auth.uid();
    END IF;
  ELSIF NEW.director_status IS DISTINCT FROM OLD.director_status THEN
    NEW.director_status_at := CASE WHEN NEW.director_status IS NULL THEN NULL ELSE now() END;
    NEW.director_status_by := CASE WHEN NEW.director_status IS NULL THEN NULL ELSE auth.uid() END;
  ELSE
    -- Parecer inalterado: preserva o carimbo original (o upsert do RH manda a
    -- linha inteira e apagaria a autoria sem isso).
    NEW.director_status_at := OLD.director_status_at;
    NEW.director_status_by := OLD.director_status_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_review_director_stamp ON public.payroll_collaborator_reviews;
CREATE TRIGGER trg_payroll_review_director_stamp
  BEFORE INSERT OR UPDATE ON public.payroll_collaborator_reviews
  FOR EACH ROW EXECUTE FUNCTION public.payroll_review_director_stamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: sem isto o botão da diretoria NÃO grava — e pior, em silêncio.
-- A policy de escrita listava só gestor_gc/rh; um UPDATE bloqueado por RLS no
-- supabase-js volta com 0 linhas e SEM erro, então a UI mostraria sucesso e o
-- parecer não existiria.
-- (De quebra, os argumentos de user_belongs_to_company estavam invertidos —
-- funcionava só porque 20260616120000 tornou a função tolerante à ordem.)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gestor_gc writes own reviews" ON public.payroll_collaborator_reviews;
CREATE POLICY "gestor_gc writes own reviews" ON public.payroll_collaborator_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = auth.uid()
               AND ur.role::text IN ('gestor_gc', 'rh', 'diretoria'))
    AND EXISTS (
      SELECT 1 FROM public.payroll_periods p
       WHERE p.id = payroll_collaborator_reviews.period_id
         AND public.user_belongs_to_company(auth.uid(), p.company_id)
    )
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_payroll_review_director_stamp ON public.payroll_collaborator_reviews;
--   DROP FUNCTION IF EXISTS public.payroll_review_director_stamp();
--   DROP INDEX IF EXISTS public.idx_payroll_reviews_director_status;
--   ALTER TABLE public.payroll_collaborator_reviews
--     DROP CONSTRAINT IF EXISTS payroll_reviews_director_status_check,
--     DROP COLUMN IF EXISTS director_status,
--     DROP COLUMN IF EXISTS director_status_at,
--     DROP COLUMN IF EXISTS director_status_by;
--
--   -- policy volta ao estado anterior (sem 'diretoria', args invertidos):
--   DROP POLICY IF EXISTS "gestor_gc writes own reviews" ON public.payroll_collaborator_reviews;
--   CREATE POLICY "gestor_gc writes own reviews" ON public.payroll_collaborator_reviews
--     FOR ALL USING (
--       EXISTS (SELECT 1 FROM public.user_roles ur
--                WHERE ur.user_id = auth.uid()
--                  AND ur.role::text IN ('gestor_gc', 'rh'))
--       AND EXISTS (
--         SELECT 1 FROM public.payroll_periods p
--          WHERE p.id = payroll_collaborator_reviews.period_id
--            AND public.user_belongs_to_company(p.company_id, auth.uid())
--       )
--     );
-- COMMIT;
