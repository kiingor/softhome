# journey-snapshot

Edge Function (Deno) que materializa marcos da Jornada de Conhecimento (30/60/90/180 dias e aniversário anual) para cada colaborador ativo. Roda diariamente via cron.

## O que faz

Para cada colaborador onde `status = 'ativo'` e `admission_date IS NOT NULL`:

1. Calcula `due_date` para cada `kind`:
   - `d30` = `admission_date + 30 dias`
   - `d60` = `+ 60 dias`
   - `d90` = `+ 90 dias`
   - `d180` = `+ 180 dias`
   - `annual` = aniversário de admissão deste ano (se ainda não passou da janela `DUE_WINDOW_DAYS`), senão do próximo ano.
2. Insere a linha em `journey_milestones` se ela não existir, com status:
   - `pending` — `due_date` ainda no futuro (mais de 7 dias).
   - `due` — hoje está dentro de ±7 dias do `due_date`.
   - `overdue` — `due_date` ficou mais de 7 dias no passado.
3. Para linhas já existentes em `pending` ou `due` cuja `due_date` passou há mais de 7 dias: atualiza status para `overdue`. Não toca em linhas `completed`.
4. Snapshota `badges_count` = quantidade de `collaborator_badges` com `awarded_at <= due_date`.

A constraint `UNIQUE(collaborator_id, kind)` garante uma linha por marco. O `annual` é "recorrente" no sentido de que existe sempre uma única linha; após `completed`, a próxima execução do cron voltará a inserir o aniversário do ano seguinte (a UPDATE de avanço é responsabilidade da UI de avaliação, não desta função — esta função apenas insere se faltar).

## Resposta

```json
{
  "inserted": 12,
  "updated_to_overdue": 3,
  "total_collaborators_processed": 287,
  "errors": []
}
```

Erros por colaborador são acumulados em `errors[]` e a função continua processando os demais. Erros fatais (fetch inicial de `collaborators` ou `journey_milestones`) abortam com HTTP 500 mas ainda retornam o JSON parcial.

## Deploy

```bash
npx supabase functions deploy journey-snapshot
```

A função usa `SUPABASE_SERVICE_ROLE_KEY` internamente para contornar RLS — essa env já é injetada automaticamente pelo runtime do Supabase.

## Agendamento via pg_cron

Habilite as extensões `pg_cron` e `pg_net` no projeto e agende uma chamada diária (06:00 UTC ≈ 03:00 BRT, antes do expediente):

```sql
SELECT cron.schedule(
  'journey-snapshot-daily',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/journey-snapshot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

> Guarde a service-role key em `app.settings.service_role_key` via `ALTER DATABASE ... SET app.settings.service_role_key = '...'`. Não comite a key no SQL.

Para remover:

```sql
SELECT cron.unschedule('journey-snapshot-daily');
```

## Teste manual

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/journey-snapshot' \
  -H 'Authorization: Bearer <USER_JWT>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

`<USER_JWT>` precisa ser um access token de um usuário autenticado (não a anon key). Em dev local: pegue o JWT no DevTools após login, ou use `npx supabase functions invoke journey-snapshot --no-verify-jwt` localmente apenas para teste.

## Segurança

- A função roda com permissões de service role internamente — pode ler/escrever qualquer linha de `collaborators` e `journey_milestones`.
- Por isso ela exige `Authorization: Bearer <jwt>` e valida que o JWT pertence a um usuário autenticado antes de qualquer query. Chamadas anônimas são rejeitadas com 401, mesmo que o cron acidentalmente envie só a anon key.
- Não recebe input do cliente (body é ignorado), reduzindo superfície de injeção.
- Não loga PII: apenas IDs (uuid) aparecem em mensagens de erro.

## Observabilidade

- `console.error` para erros fatais — visíveis em **Functions → Logs** no dashboard Supabase.
- O JSON de retorno traz contagens para o cron registrar em `cron.job_run_details`.
- Para alertas: monitorar `errors[]` não vazio ou `total_collaborators_processed = 0` por mais de um dia.
