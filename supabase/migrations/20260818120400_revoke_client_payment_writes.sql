-- Migration: 20260818120400_revoke_client_payment_writes.sql
-- Description: tira do NAVEGADOR o direito de escrever em payroll_payments.
--
-- Problema: hoje a tela de Pagamentos (src/modules/payroll/components/PaymentsTab.tsx)
-- faz insert/update direto na tabela via supabase-js, com o token do próprio
-- usuário. Enquanto esse caminho existir, qualquer trava de UI — inclusive 2FA —
-- é decoração: quem tem papel rh/gestor_gc abre o console do browser e marca a
-- folha inteira como paga em três linhas, sem passar por nenhuma checagem, sem
-- segundo fator e sem carimbo confiável de "quem pagou" (paid_by vem do client).
--
-- Decisão: "marcar como pago" vira operação de SERVIDOR. A escrita passa a ser
-- exclusiva de funções SECURITY DEFINER (que rodam como owner e ignoram RLS) e
-- do service_role (edge functions) — os únicos lugares onde dá pra exigir 2FA,
-- validar o estado do período e carimbar o autor sem confiar no client. Mesma
-- estratégia já usada em collaborator-documents (20260814100000): sem policy de
-- escrita, escrita legítima só por caminho privilegiado.
--
-- A LEITURA fica intacta: o RH precisa continuar VENDO o que já foi pago (é a
-- barra de progresso do mês). As policies de SELECT não são tocadas.
--
-- Nota: as policies removidas são `FOR ALL`, então também davam SELECT. As de
-- SELECT que permanecem ("admin_gc reads all payments" e "gestor_gc reads own
-- payments", esta última reescrita em 20260727120100 pra incluir 'diretoria')
-- cobrem exatamente a mesma população de leitura — ninguém perde visão.
--
-- ATENÇÃO ao aplicar: a tela de Pagamentos QUEBRA (erro de RLS no toggle) até o
-- front passar a chamar a RPC/edge function. É o efeito pretendido — é
-- preferível a tela falhar a ela continuar sendo um caminho de escrita livre.

BEGIN;

-- ─── Escrita direta pelo client: removida ───────────────────────────────────
-- Nomes exatos vindos de 20260505150000_payroll_payments.sql (nenhuma migration
-- posterior recriou estas duas — 20260727120100 só mexeu na de SELECT).
DROP POLICY IF EXISTS "admin_gc writes payments"     ON public.payroll_payments;
DROP POLICY IF EXISTS "gestor_gc writes own payments" ON public.payroll_payments;

-- Rede de segurança: policy de escrita que tenha entrado fora do versionamento
-- (criada pelo dashboard do Supabase, por exemplo). Policies permissivas se
-- somam por OR — deixar uma viva anularia toda esta migration. Só mira comandos
-- de escrita; 'SELECT' nunca entra no laço.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'payroll_payments'
       AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    RAISE NOTICE 'Removendo policy de escrita não versionada em payroll_payments: %', p.policyname;
    EXECUTE format('DROP POLICY %I ON public.payroll_payments', p.policyname);
  END LOOP;
END $$;

-- Cinto e suspensório: sem o GRANT, a tentativa de escrita do browser falha com
-- "permission denied" (erro claro, aparece no log) em vez de violar RLS ou
-- afetar 0 linhas silenciosamente. SECURITY DEFINER roda como owner e
-- service_role ignora ambos — nenhum dos dois é afetado por este REVOKE.
REVOKE INSERT, UPDATE, DELETE ON public.payroll_payments FROM authenticated;

COMMENT ON TABLE public.payroll_payments IS
  'Pagamentos da folha. ESCRITA EXCLUSIVA de funções SECURITY DEFINER / service_role — o client só lê. Marcação MANUAL: payroll_payment_set_manual_paid (papel admin_gc/gestor_gc + folha_pagamentos.can_edit). Liquidação por PIX: payroll_pix_settle, e o caminho de execução exige papel restrito + folha_pagamento_exec.can_create + 2FA.';

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Devolve a escrita direta ao client, exatamente como estava em
-- 20260505150000_payroll_payments.sql (FOR ALL só com USING — o WITH CHECK do
-- INSERT herda a mesma expressão). Use só se a tela de Pagamentos precisar
-- voltar a funcionar antes do caminho de servidor estar pronto; enquanto isso
-- valer, não existe 2FA de verdade no pagamento.
--
-- BEGIN;
--
-- GRANT INSERT, UPDATE, DELETE ON public.payroll_payments TO authenticated;
--
-- CREATE POLICY "admin_gc writes payments" ON public.payroll_payments
--   FOR ALL USING (
--     EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
--             AND ur.role::text IN ('admin_gc', 'admin'))
--   );
--
-- CREATE POLICY "gestor_gc writes own payments" ON public.payroll_payments
--   FOR ALL USING (
--     EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
--             AND ur.role::text IN ('gestor_gc', 'rh'))
--     AND EXISTS (
--       SELECT 1 FROM public.payroll_periods p
--       WHERE p.id = payroll_payments.period_id
--         AND public.user_belongs_to_company(p.company_id, auth.uid())
--     )
--   );
--
-- COMMENT ON TABLE public.payroll_payments IS NULL;
--
-- COMMIT;
