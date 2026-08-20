-- ─────────────────────────────────────────────────────────────────────────────
-- Setup do cron pro payroll-pix-reconcile
--
-- Roda A CADA 2 MINUTOS. É o job que responde "o dinheiro saiu?" pras
-- transferências que ficaram em 'sent', 'confirmed' ou 'unknown' — consultando
-- o banco (GET), NUNCA reenviando pagamento.
--
-- POR QUE 2 MINUTOS E NÃO 15 (nem 30 segundos)
--   O intervalo do cron é só a RESOLUÇÃO da fila; quem manda no ritmo de cada
--   linha é o backoff da própria function (30s · 1m · 2m · 5m · 15m · 1h · 6h,
--   guardado em next_check_at). Com 2 min, o primeiro degrau de 30s chega com
--   até 2 min de atraso — aceitável pra um PIX que acabou de sair, e barato: a
--   rodada em que não há nada vencido faz UM SELECT e devolve lista vazia.
--   Mais rápido que isso só aumentaria consulta ao Santander sem antecipar
--   nada, porque o backoff continuaria mandando.
--
-- O QUE ESTE JOB NUNCA FAZ: reenviar pagamento. A function só tem chamadas GET.
-- Transferência em 'unknown' que não se resolve sozinha em ~8h para de ser
-- consultada e fica esperando resolução HUMANA (payroll_pix_resolve_unknown).
--
-- INSTRUÇÕES:
--   1. Substitua <SERVICE_ROLE_KEY> pela service_role key do projeto
--      (Dashboard → Settings → API).
--   2. Substitua <PIX_RECONCILE_SECRET> pelo MESMO valor configurado no secret
--      da edge function:
--        npx supabase secrets set PIX_RECONCILE_SECRET="$(openssl rand -hex 32)"
--      São DUAS trancas de propósito: o Bearer prova que a chamada é de dentro
--      do projeto, e o x-reconcile-secret prova que é o cron — sem ele,
--      qualquer portador de um JWT válido dispararia a reconciliação.
--   3. Rode no SQL editor do Supabase Dashboard.
--   4. Confira com: `select * from cron.job;`
--
-- ATENÇÃO — o segredo fica GRAVADO no comando do job (cron.job.command), em
-- texto plano, legível por quem tiver acesso ao schema cron. É o mesmo modelo
-- do journey-snapshot. Se um dia isso incomodar, o caminho é mover os dois pra
-- vault.decrypted_secrets e montar o header com um SELECT — não vale trocar
-- agora, no mesmo PR que estreia pagamento.
--
-- Pra desfazer: `select cron.unschedule('payroll-pix-reconcile');`
-- Pra rodar manual sem esperar o cron:
--
--   curl -X POST https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/payroll-pix-reconcile \
--     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
--     -H "x-reconcile-secret: <PIX_RECONCILE_SECRET>"
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante extensões (provavelmente já habilitadas no Supabase Pro)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Schedule a cada 2 minutos
SELECT cron.schedule(
  'payroll-pix-reconcile',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/payroll-pix-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-reconcile-secret', '<PIX_RECONCILE_SECRET>'
    ),
    body := '{}'::jsonb,
    -- 45s: a function processa até 20 transferências e cada consulta ao gateway
    -- tem teto de 15s. O timeout do pg_net não cancela o trabalho já feito (a
    -- function segue até o fim), só solta o job — mas um valor curto demais
    -- encheria job_run_details de "timeout" sem significar falha nenhuma.
    timeout_milliseconds := 45000
  ) AS request_id;
  $$
);

-- 3. Verificar (opcional)
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'payroll-pix-reconcile';
-- SELECT * FROM cron.job_run_details WHERE jobid = (
--   SELECT jobid FROM cron.job WHERE jobname = 'payroll-pix-reconcile'
-- ) ORDER BY start_time DESC LIMIT 5;

-- 4. Fila do reconciliador — o que ele vai pegar na próxima rodada
-- SELECT id, status, check_count, next_check_at, environment, created_at
--   FROM public.payroll_pix_transfers
--  WHERE status IN ('sent', 'confirmed', 'unknown')
--    AND next_check_at IS NOT NULL
--  ORDER BY next_check_at;

-- 5. O que já saiu do polling e espera GENTE (next_check_at NULL em voo).
--    Esta consulta é a lista de trabalho do financeiro — cada linha aqui é uma
--    dúvida sobre dinheiro que só uma pessoa (extrato/protocolo) resolve, via
--    payroll_pix_resolve_unknown.
-- SELECT id, entry_id, amount, status, error_message, created_at
--   FROM public.payroll_pix_transfers
--  WHERE status IN ('sent', 'confirmed', 'unknown')
--    AND next_check_at IS NULL
--  ORDER BY created_at;
