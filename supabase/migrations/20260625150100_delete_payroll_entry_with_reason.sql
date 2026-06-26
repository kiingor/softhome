-- Migration: RPC delete_payroll_entry_with_reason
-- Description: exclusão de lançamento de folha COM motivo obrigatório, registrado
-- na auditoria. O audit_log só aceita escrita via trigger SECURITY DEFINER (não
-- há policy de INSERT/UPDATE pro usuário), então a captura do motivo precisa de
-- uma RPC SECURITY DEFINER.
--
-- Fluxo:
--   1. valida permissão (admin_gc OU financeiro:can_delete na empresa do lançamento)
--   2. exige motivo (>= 3 chars)
--   3. bloqueia período FECHADO (LGPD/integridade: competência fechada é imutável)
--   4. DELETE — o trigger audit_payroll_entries grava a linha de auditoria
--      (action='delete', before=row, user_id=auth.uid())
--   5. enriquece ESSA linha de auditoria com o motivo em `after.deletion_reason`
--      (1 registro só; record_id é único por lançamento → nunca colide)

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_payroll_entry_with_reason(
  p_entry_id uuid,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_year       int;
  v_month      int;
  v_status     text;
  v_audit_rows int;
  v_before     jsonb;
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  -- 1. Carrega o lançamento (snapshot + competência + empresa)
  SELECT to_jsonb(pe), pe.company_id, pe.year, pe.month
    INTO v_before, v_company_id, v_year, v_month
    FROM public.payroll_entries pe
   WHERE pe.id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  -- 2. Permissão (a RPC roda como SECURITY DEFINER, então o RLS da tabela é
  --    bypassado — a checagem explícita é obrigatória).
  IF NOT (
    public.is_admin_gc(auth.uid())
    OR public.has_module_permission(auth.uid(), v_company_id, 'financeiro', 'can_delete')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir lançamentos de folha';
  END IF;

  -- 3. Motivo obrigatório
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Motivo da exclusão é obrigatório (mínimo 3 caracteres)';
  END IF;

  -- 4. Período fechado é imutável
  SELECT status INTO v_status
    FROM public.payroll_periods
   WHERE company_id = v_company_id
     AND reference_month = make_date(v_year, v_month, 1);
  IF v_status IS NOT NULL AND v_status <> 'open' THEN
    RAISE EXCEPTION 'Período fechado — reabra antes de excluir o lançamento';
  END IF;

  -- 5. Exclui (dispara o trigger audit_payroll_entries → grava o delete)
  DELETE FROM public.payroll_entries WHERE id = p_entry_id;

  -- 6. Anexa o motivo à linha de auditoria recém-criada deste lançamento.
  --    record_id é o id (único) do lançamento; ele é excluído uma única vez,
  --    logo existe exatamente 1 registro de delete pra casar.
  UPDATE public.audit_log
     SET after = jsonb_build_object('deletion_reason', v_reason)
   WHERE table_name = 'payroll_entries'
     AND action = 'delete'
     AND record_id = p_entry_id;

  -- Atomicidade "excluiu ⇒ motivo registrado". Encargos DERIVADOS (INSS/IRPF/FGTS
  -- e desconto de VT 'vt-%') NÃO são logados pelo audit_log_trigger (ele pula pra
  -- não poluir nos recálculos em lote). Numa exclusão MANUAL com motivo, se o
  -- trigger não gravou (UPDATE casou 0 linhas), registramos explicitamente — em
  -- vez de cancelar — pra a exclusão ser sempre auditada.
  GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
  IF v_audit_rows = 0 THEN
    INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, before, after)
    VALUES (
      auth.uid(), v_company_id, 'delete', 'payroll_entries', p_entry_id, v_before,
      jsonb_build_object('deletion_reason', v_reason)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_payroll_entry_with_reason(uuid, text) TO authenticated;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.delete_payroll_entry_with_reason(uuid, text);
-- COMMIT;
