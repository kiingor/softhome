-- Migration: auditoria do recálculo de encargos
-- Description: o "Recalcular" (e o auto-recalc ao lançar/excluir avulso) apaga e
-- recria as linhas de INSS/IRPF/FGTS (e VT) de cada colaborador. O trigger de
-- auditoria registrava CADA linha → dezenas de entradas por recálculo (ruído).
--
-- Correção em 2 partes:
--   1. audit_log_trigger pula as linhas de ENCARGO DERIVADO de payroll_entries
--      (INSS/IRPF/FGTS e o desconto de VT 'vt-%'). São recomputáveis a partir do
--      salário + proventos (que SÃO auditados). Outras tabelas/colunas: intactas.
--   2. log_payroll_recalc: RPC que grava 1 registro-resumo do recálculo
--      ("fulano recalculou a folha de tal competência").

BEGIN;

-- 1. Trigger de auditoria com skip dos encargos derivados (escopo: payroll_entries).
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_record_id uuid;
  v_company_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
BEGIN
  -- Encargos DERIVADOS da folha (INSS/IRPF/FGTS e desconto de VT) são apagados e
  -- recriados em lote a cada recálculo — auditar linha-a-linha vira ruído. Pula o
  -- log dessas linhas (o recálculo vira 1 registro-resumo via log_payroll_recalc;
  -- o salário/proventos que formam a base continuam auditados).
  IF TG_TABLE_NAME = 'payroll_entries' THEN
    v_row := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
    IF (v_row->>'type') IN ('inss','irpf','fgts')
       OR ((v_row->>'type') = 'desconto' AND (v_row->>'external_id') LIKE 'vt-%') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- Determinar ação
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_record_id := (to_jsonb(NEW)->>'id')::uuid;
    v_company_id := NULLIF(to_jsonb(NEW)->>'company_id', '')::uuid;
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_record_id := (to_jsonb(NEW)->>'id')::uuid;
    v_company_id := NULLIF(to_jsonb(NEW)->>'company_id', '')::uuid;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_record_id := (to_jsonb(OLD)->>'id')::uuid;
    v_company_id := NULLIF(to_jsonb(OLD)->>'company_id', '')::uuid;
    v_before := to_jsonb(OLD);
    v_after := NULL;
  END IF;

  INSERT INTO public.audit_log (
    user_id, company_id, action, table_name, record_id, before, after
  ) VALUES (
    auth.uid(), v_company_id, v_action, TG_TABLE_NAME, v_record_id, v_before, v_after
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 2. Registro-resumo do recálculo de encargos (1 linha por ação).
CREATE OR REPLACE FUNCTION public.log_payroll_recalc(
  p_company_id      uuid,
  p_reference_month date,
  p_scope           text DEFAULT 'periodo'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  -- Permissão: editar a folha (financeiro:can_edit) ou admin.
  IF NOT (
    public.is_admin_gc(auth.uid())
    OR public.has_module_permission(auth.uid(), p_company_id, 'financeiro', 'can_edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  SELECT id INTO v_period_id
    FROM public.payroll_periods
   WHERE company_id = p_company_id AND reference_month = p_reference_month;

  INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, before, after)
  VALUES (
    auth.uid(), p_company_id, 'update', 'payroll_periods',
    v_period_id,  -- pode ser null se o período não existir (raro)
    NULL,
    jsonb_build_object(
      'acao', 'Recalculo de encargos',
      'escopo', p_scope,
      'competencia', to_char(p_reference_month, 'YYYY-MM')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_payroll_recalc(uuid, date, text) TO authenticated;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.log_payroll_recalc(uuid, date, text);
--   -- restaurar audit_log_trigger sem o bloco de skip (versão anterior):
--   -- CREATE OR REPLACE FUNCTION public.audit_log_trigger() ... (sem o IF de skip)
-- COMMIT;
