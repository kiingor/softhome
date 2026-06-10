-- Periodicidade de exame padrão: 12 meses pra TODOS os cargos.
--
-- Contexto: o trigger generate_next_periodic_exam só cria o próximo exame
-- periódico quando o cargo tem exam_periodicity_months preenchido. Todos os
-- cargos estavam com NULL, então "marcar realizado" nunca gerava o próximo.
--
-- 1. Backfill: todo cargo sem periodicidade vira 12 meses.
-- 2. Default da coluna = 12 (cargos novos, inclusive os vindos da sync).
-- 3. Trigger passa a usar COALESCE(periodicidade, 12) — robustez caso algum
--    cargo fique sem valor no futuro.

-- 1 + 2 ────────────────────────────────────────────────────────────────────
update positions set exam_periodicity_months = 12 where exam_periodicity_months is null;
alter table positions alter column exam_periodicity_months set default 12;

-- 3 ─────────────────────────────────────────────────────────────────────────
create or replace function public.generate_next_periodic_exam()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _periodicity integer;
  _risk_group text;
  _position_id uuid;
begin
  if new.status = 'realizado' and (old.status is null or old.status != 'realizado')
     and new.exam_type in ('admissional', 'periodico') then

    select c.position_id into _position_id
    from collaborators c where c.id = new.collaborator_id;

    if _position_id is not null then
      select p.exam_periodicity_months, p.risk_group
      into _periodicity, _risk_group
      from positions p where p.id = _position_id;

      -- Fallback fixo de 12 meses quando o cargo não tem periodicidade.
      _periodicity := coalesce(nullif(_periodicity, 0), 12);

      insert into occupational_exams (
        collaborator_id, company_id, position_id, exam_type, status,
        due_date, risk_group_at_time, auto_generated
      ) values (
        new.collaborator_id, new.company_id, _position_id, 'periodico', 'pendente',
        coalesce(new.completed_date, current_date) + (_periodicity || ' months')::interval,
        _risk_group, true
      );
    end if;
  end if;
  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
-- alter table positions alter column exam_periodicity_months drop default;
-- (a função volta à versão anterior sem o COALESCE; backfill de dados não é
--  revertido — periodicidade 12 é o estado desejado.)
-- create or replace function public.generate_next_periodic_exam() ... (versão
--  anterior usava: if _periodicity is not null and _periodicity > 0 then ...)
