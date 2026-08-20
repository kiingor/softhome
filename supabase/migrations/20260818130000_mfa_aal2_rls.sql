-- ─────────────────────────────────────────────────────────────────────────────
-- MFA de login (AAL2) exigido nos dados sensíveis, sem trancar quem não enrolou.
--
-- Contexto: os papéis admin_gc/diretoria passam a ter 2º fator (telefone nativo
-- do GoTrue, código pelo WhatsApp). Verificar o fator eleva o JWT a AAL2. Aqui a
-- RLS passa a EXIGIR aal2 para ler/escrever as tabelas-joia — é o que impede que
-- alguém com só a senha (e a anon key) leia PII/salário batendo direto na REST.
--
-- Helper `mfa_satisfied()` = (JWT é aal2) OU (usuário não tem fator verificado).
-- O segundo ramo é a rede anti-lockout: rh, gestor_gc, colaborador e admins que
-- ainda não cadastraram fator continuam entrando em aal1 normalmente. O gate só
-- "arma" para um usuário DEPOIS que ele enrola um fator.
--
-- Aplicado como policy RESTRICTIVE: ANDa com as policies permissivas já
-- existentes SEM reescrever nenhuma delas. `service_role` (edge functions) tem
-- BYPASSRLS, então continua imune — os RPCs de pagamento/hook não quebram.
--
-- Rollout inócuo: enquanto auth.mfa_factors está vazia, mfa_satisfied() é sempre
-- true, então esta migration não muda nada visível até o primeiro enroll.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid()
        and f.status = 'verified'
    );
$$;

comment on function public.mfa_satisfied() is
  'True se a sessão atende ao MFA exigido: JWT em AAL2, ou usuário sem fator '
  'verificado (não bloqueia quem ainda não enrolou). Usada nas policies '
  'RESTRICTIVE das tabelas sensíveis.';

revoke all on function public.mfa_satisfied() from public;
grant execute on function public.mfa_satisfied() to authenticated, service_role;

-- Gate RESTRICTIVE nas tabelas-joia (PII + salário + pagamento).
do $$
declare t text;
begin
  foreach t in array array[
    'collaborators',
    'payroll_entries',
    'payroll_payments',
    'payroll_pix_transfers',
    'payroll_payable_lines',
    'collaborator_documents'
  ]
  loop
    execute format('drop policy if exists mfa_aal2_required on public.%I', t);
    execute format(
      'create policy mfa_aal2_required on public.%I '
      'as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) '
      'with check ((select public.mfa_satisfied()))', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'collaborators','payroll_entries','payroll_payments',
--     'payroll_pix_transfers','payroll_payable_lines','collaborator_documents'
--   ]
--   loop
--     execute format('drop policy if exists mfa_aal2_required on public.%I', t);
--   end loop;
-- end $$;
-- drop function if exists public.mfa_satisfied();
