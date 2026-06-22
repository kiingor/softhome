-- Edição manual completa de um período aquisitivo de férias.
--
-- Contexto: muitos colaboradores foram importados do legado com períodos ainda
-- em "Adquirindo" (pending) que NA VERDADE já foram gozados, ou sem a Data
-- Limite / Período de Gozo preenchidos. O ajuste em massa (adjust_vacation_period_manual)
-- só mexe em dias tirados/vendidos e não consegue:
--   - tirar um período do estado "Adquirindo" (o trigger recompute ignora pending);
--   - gravar Período de Gozo (gozo_start_date/gozo_end_date) e Data Limite;
--   - corrigir o Período de Competência ou o direito (days_entitled).
--
-- Esta RPC cobre tudo isso num único ponto, com validação no servidor e o mesmo
-- rastro de auditoria manual (manual_adjustment_*). A adjust_vacation_period_manual
-- continua existindo para a importação em massa de saldos.
--
-- Status: 'pending'/'expired' são estados "travados" e passam direto (deixam o
-- RH manter o período em aquisição ou forçá-lo vencido). Qualquer outro valor é
-- tratado como período ATIVO e o status final é derivado do saldo — exatamente a
-- mesma regra do trigger recompute_vacation_period_balance (available /
-- partially_used / used). Assim o front pode mandar 'available' como "liberado" e
-- deixar os dias decidirem o rótulo real.

CREATE OR REPLACE FUNCTION public.edit_vacation_period_manual(
  _period_id uuid,
  _start_date date,
  _end_date date,
  _days_entitled integer,
  _days_taken integer,
  _days_sold integer,
  _status text,
  _gozo_start_date date DEFAULT NULL,
  _gozo_end_date date DEFAULT NULL,
  _data_limite date DEFAULT NULL,
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
  _remaining integer;
  _final_status text;
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
    RAISE EXCEPTION 'sem permissão para editar férias';
  END IF;

  -- Validação do Período de Competência (aquisitivo)
  IF _start_date IS NULL OR _end_date IS NULL THEN
    RAISE EXCEPTION 'período de competência é obrigatório';
  END IF;
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'fim da competência não pode ser antes do início';
  END IF;

  -- Período de Gozo: tudo ou nada (não dá pra ter só uma ponta)
  IF (_gozo_start_date IS NULL) <> (_gozo_end_date IS NULL) THEN
    RAISE EXCEPTION 'informe início e fim do período de gozo (ou deixe ambos vazios)';
  END IF;
  IF _gozo_start_date IS NOT NULL AND _gozo_end_date < _gozo_start_date THEN
    RAISE EXCEPTION 'fim do gozo não pode ser antes do início';
  END IF;

  -- Validação de dias
  IF _days_entitled <= 0 THEN
    RAISE EXCEPTION 'direito (dias) deve ser maior que zero';
  END IF;
  IF _days_taken < 0 OR _days_sold < 0 THEN
    RAISE EXCEPTION 'dias não podem ser negativos';
  END IF;
  IF _days_taken + _days_sold > _days_entitled THEN
    RAISE EXCEPTION 'soma de dias gozados e vendidos excede o direito (%)', _days_entitled;
  END IF;

  _remaining := GREATEST(_days_entitled - _days_taken - _days_sold, 0);

  -- Normaliza o status (mesma lógica do recompute_vacation_period_balance)
  IF _status IN ('pending', 'expired') THEN
    _final_status := _status;
  ELSIF _remaining <= 0 THEN
    _final_status := 'used';
  ELSIF _days_taken + _days_sold > 0 THEN
    _final_status := 'partially_used';
  ELSE
    _final_status := 'available';
  END IF;

  UPDATE vacation_periods
  SET
    start_date = _start_date,
    end_date = _end_date,
    gozo_start_date = _gozo_start_date,
    gozo_end_date = _gozo_end_date,
    data_limite = _data_limite,
    days_entitled = _days_entitled,
    days_taken = _days_taken,
    days_sold = _days_sold,
    days_remaining = _remaining,
    status = _final_status,
    manual_adjustment_at = now(),
    manual_adjustment_by = _user_id,
    manual_adjustment_notes = NULLIF(trim(COALESCE(_notes, '')), '')
  WHERE id = _period_id
  RETURNING * INTO _period;

  RETURN _period;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_vacation_period_manual(
  uuid, date, date, integer, integer, integer, text, date, date, date, text
) TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.edit_vacation_period_manual(
--   uuid, date, date, integer, integer, integer, text, date, date, date, text
-- );
