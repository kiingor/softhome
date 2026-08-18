-- RPC de marcação manual de pagamento — o par que faltava da 20260818120400.
--
-- A 120400 revoga a escrita direta do navegador em payroll_payments, e com razão:
-- enquanto `authenticated` pudesse escrever ali, qualquer 2FA seria decoração —
-- bastavam três linhas de supabase-js no console pra marcar a folha inteira como
-- paga. Mas revogar sem oferecer substituto quebra o checkbox "pago" da aba
-- Pagamentos, que é o fluxo que o financeiro usa hoje para registrar o que saiu
-- pelo internet banking.
--
-- Esta função é esse substituto. Ela NÃO paga nada: só registra que um pagamento
-- aconteceu fora do sistema. O PIX de verdade tem caminho próprio
-- (payroll_pix_open_transfer), com 2FA e permissão mais estreita.
--
-- Duas coisas mudam em relação ao que o cliente fazia:
--   1. `paid_at` e `paid_by` são carimbados NO SERVIDOR. Antes vinham do
--      navegador, então o horário era o do relógio da máquina do usuário e o
--      autor era o que o cliente dissesse.
--   2. O valor vem da linha congelada quando ela existe. O cliente só opina
--      sobre o valor de período ainda não aprovado, onde não há o que congelar
--      e a marcação é puramente escrituração.

BEGIN;

CREATE OR REPLACE FUNCTION public.payroll_payment_set_manual_paid(
  p_entry_id uuid,
  p_paid     boolean,
  p_amount   numeric DEFAULT NULL
)
RETURNS public.payroll_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_entry    record;
  v_period   record;
  v_line     record;
  v_amount   numeric(12,2);
  v_existing public.payroll_payments%ROWTYPE;
  v_result   public.payroll_payments%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sessão não identificada' USING ERRCODE = '28000';
  END IF;

  SELECT e.id, e.collaborator_id, e.company_id, e.month, e.year
    INTO v_entry
    FROM public.payroll_entries e
   WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  -- payroll_entries não tem period_id: o vínculo é (company_id, mês, ano),
  -- exatamente como o resto do módulo resolve.
  SELECT p.id, p.company_id
    INTO v_period
    FROM public.payroll_periods p
   WHERE p.company_id = v_entry.company_id
     AND extract(month from p.reference_month)::int = v_entry.month
     AND extract(year  from p.reference_month)::int = v_entry.year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esse lançamento não pertence a nenhuma folha aberta';
  END IF;

  -- Autorização: MESMO gate que a tela já usa hoje (PeriodDetailPage.tsx:127-130)
  -- — papel admin_gc/gestor_gc E permissão de editar 'folha_pagamentos'. Não é o
  -- gate do PIX (folha_pagamento_exec, mais estreito): endurecer a marcação
  -- manual aqui trancaria quem já opera a folha, sem ganho de segurança —
  -- marcar um checkbox não move dinheiro.
  IF NOT (
    public.is_admin_gc(v_actor)
    OR (
      EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = v_actor
                 AND ur.role::text IN ('admin_gc', 'gestor_gc'))
      AND public.has_module_permission(v_actor, v_period.company_id, 'folha_pagamentos', 'can_edit')
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão pra marcar pagamento nesta folha'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
    FROM public.payroll_payments
   WHERE entry_id = p_entry_id
   FOR UPDATE;

  -- Pagamento que saiu por PIX não se desmarca por aqui. O trigger da 120200
  -- também barra, mas errar com mensagem clara é melhor do que errar com
  -- violação de trigger.
  IF FOUND AND v_existing.method = 'pix_santander' AND v_existing.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esse pagamento saiu por PIX e não pode ser desmarcado na mão'
      USING ERRCODE = '22023';
  END IF;

  -- Valor: a linha congelada manda, quando existe. O cliente só é ouvido em
  -- folha ainda não aprovada — ali não há linha, e a marcação é escrituração
  -- de algo que aconteceu no banco, não autorização de saída.
  SELECT * INTO v_line
    FROM public.payroll_payable_lines
   WHERE entry_id = p_entry_id;

  IF FOUND THEN
    v_amount := v_line.net_amount;
  ELSE
    v_amount := round(coalesce(p_amount, coalesce(v_existing.amount, 0))::numeric, 2);
  END IF;

  IF p_paid AND NOT (v_amount > 0) THEN
    RAISE EXCEPTION 'Valor do pagamento precisa ser maior que zero';
  END IF;

  INSERT INTO public.payroll_payments AS pp (
    company_id, period_id, entry_id, amount, paid_at, paid_by, method
  )
  VALUES (
    v_period.company_id,
    v_period.id,
    p_entry_id,
    v_amount,
    CASE WHEN p_paid THEN now() ELSE NULL END,
    CASE WHEN p_paid THEN v_actor ELSE NULL END,
    'manual'
  )
  ON CONFLICT (entry_id) DO UPDATE
     SET amount  = EXCLUDED.amount,
         paid_at = EXCLUDED.paid_at,
         paid_by = EXCLUDED.paid_by
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.payroll_payment_set_manual_paid(uuid, boolean, numeric) IS
  'Marca/desmarca pagamento manual da folha. Substitui a escrita direta do cliente em payroll_payments, revogada em 20260818120400. Carimba paid_at/paid_by no servidor e recusa desmarcar pagamento liquidado por PIX.';

REVOKE EXECUTE ON FUNCTION public.payroll_payment_set_manual_paid(uuid, boolean, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.payroll_payment_set_manual_paid(uuid, boolean, numeric) TO authenticated;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Atenção: sem esta função, e com a 20260818120400 aplicada, o checkbox "pago"
-- da aba Pagamentos deixa de funcionar. Reverter esta migration exige reverter
-- a 120400 junto (ou o financeiro fica sem como registrar pagamento manual).
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.payroll_payment_set_manual_paid(uuid, boolean, numeric);
-- COMMIT;
