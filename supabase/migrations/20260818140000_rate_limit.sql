-- ─────────────────────────────────────────────────────────────────────────────
-- Rate-limit de camada de aplicação para endpoints públicos que gastam IA paga.
--
-- Por quê aqui e não na borda: atrás do proxy o IP real do cliente se perde
-- (todos chegam como o gateway interno), então um limite por IP viraria balde
-- global. Chaveando por IDENTIFICADOR do payload (CPF, candidato, etc.) o limite
-- é preciso e não depende de IP — e um balde GLOBAL por rota serve de teto
-- contra flood distribuído.
--
-- `rate_limit_take` conta os hits da janela para (bucket, identifier), e se
-- ainda couber, registra mais um e libera. Fail-open é decisão do chamador: se
-- a função de limite falhar, o endpoint deixa passar (não travar recrutamento
-- por causa do limitador).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup
  on public.rate_limit_events (bucket, identifier, created_at desc);

alter table public.rate_limit_events enable row level security;
-- Sem policy de propósito: só service_role (BYPASSRLS) e a função SECURITY
-- DEFINER tocam nesta tabela. Cliente nenhum lê ou escreve aqui.

create or replace function public.rate_limit_take(
  p_bucket text,
  p_identifier text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Descarta os hits deste identificador que já saíram da janela (usa o índice
  -- composto, toca só as linhas deste identificador).
  delete from public.rate_limit_events
   where bucket = p_bucket
     and identifier = p_identifier
     and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count
    from public.rate_limit_events
   where bucket = p_bucket
     and identifier = p_identifier;

  if v_count >= p_max then
    return false; -- estourou o limite
  end if;

  insert into public.rate_limit_events (bucket, identifier)
  values (p_bucket, p_identifier);
  return true;
end;
$$;

comment on function public.rate_limit_take(text, text, int, int) is
  'Consome 1 do orçamento de (bucket, identifier) na janela dada. True = liberado, false = estourou. Só service_role executa.';

revoke all on function public.rate_limit_take(text, text, int, int) from public;
grant execute on function public.rate_limit_take(text, text, int, int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
-- drop function if exists public.rate_limit_take(text, text, int, int);
-- drop table if exists public.rate_limit_events;
