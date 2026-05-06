-- Ajuste manual de saldo de férias
--
-- Permite editar diretamente days_taken / days_sold de um vacation_period
-- (cenário: importação de colaboradores antigos cujo histórico não dá pra
-- reconstruir solicitação por solicitação). Mantém rastro de quem ajustou.

-- 1) Campos de auditoria do ajuste manual
ALTER TABLE public.vacation_periods
  ADD COLUMN IF NOT EXISTS manual_adjustment_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_adjustment_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_adjustment_notes text;

-- 2) Trigger que recomputa days_remaining e status sempre que days_taken,
--    days_sold ou days_entitled forem alterados direto na tabela.
--    Não interfere com o trigger update_vacation_balance (esse roda em
--    vacation_requests, não em vacation_periods).
CREATE OR REPLACE FUNCTION public.recompute_vacation_period_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.days_remaining := GREATEST(
    NEW.days_entitled - COALESCE(NEW.days_taken, 0) - COALESCE(NEW.days_sold, 0),
    0
  );

  -- Não mexe em status quando o período ainda está em aquisição (pending)
  -- nem quando já foi marcado como expirado.
  IF NEW.status NOT IN ('pending', 'expired') THEN
    IF NEW.days_remaining <= 0 THEN
      NEW.status := 'used';
    ELSIF COALESCE(NEW.days_taken, 0) + COALESCE(NEW.days_sold, 0) > 0 THEN
      NEW.status := 'partially_used';
    ELSE
      NEW.status := 'available';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_vacation_period_balance ON public.vacation_periods;
CREATE TRIGGER trg_recompute_vacation_period_balance
  BEFORE INSERT OR UPDATE OF days_taken, days_sold, days_entitled
  ON public.vacation_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_vacation_period_balance();

-- 3) RPC pra ajuste manual: valida limites, grava auditoria, atualiza saldo.
--    Necessária pra lançamento em massa não precisar replicar a validação
--    em vários lugares.
CREATE OR REPLACE FUNCTION public.adjust_vacation_period_manual(
  _period_id uuid,
  _days_taken integer,
  _days_sold integer,
  _notes text DEFAULT NULL
)
RETURNS public.vacation_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period public.vacation_periods;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO _period FROM vacation_periods WHERE id = _period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vacation_period not found';
  END IF;

  -- Permissão: precisa poder editar férias na empresa do período
  IF NOT has_module_permission(_user_id, _period.company_id, 'ferias', 'can_edit') THEN
    RAISE EXCEPTION 'sem permissão para ajustar férias';
  END IF;

  IF _days_taken < 0 OR _days_sold < 0 THEN
    RAISE EXCEPTION 'dias não podem ser negativos';
  END IF;

  IF _days_taken + _days_sold > _period.days_entitled THEN
    RAISE EXCEPTION 'soma de dias tirados e vendidos excede o direito (%)', _period.days_entitled;
  END IF;

  UPDATE vacation_periods
  SET
    days_taken = _days_taken,
    days_sold = _days_sold,
    manual_adjustment_at = now(),
    manual_adjustment_by = _user_id,
    manual_adjustment_notes = NULLIF(trim(COALESCE(_notes, '')), '')
  WHERE id = _period_id
  RETURNING * INTO _period;

  RETURN _period;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_vacation_period_manual(uuid, integer, integer, text)
  TO authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.adjust_vacation_period_manual(uuid, integer, integer, text);
-- DROP TRIGGER IF EXISTS trg_recompute_vacation_period_balance ON public.vacation_periods;
-- DROP FUNCTION IF EXISTS public.recompute_vacation_period_balance();
-- ALTER TABLE public.vacation_periods
--   DROP COLUMN IF EXISTS manual_adjustment_at,
--   DROP COLUMN IF EXISTS manual_adjustment_by,
--   DROP COLUMN IF EXISTS manual_adjustment_notes;
