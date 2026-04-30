-- ─────────────────────────────────────────────────────────────────────────────
-- Setup do cron pro journey-snapshot
--
-- Roda diariamente às 03h UTC (= 00h Brasília UTC-3) — horário de tráfego
-- baixo. A function recalcula `journey_milestones` pra todos os
-- colaboradores ativos: insere marcos faltantes, atualiza status pra
-- overdue quando vencer, snapshot do badges_count.
--
-- INSTRUÇÕES:
--   1. Substitua <SERVICE_ROLE_KEY> abaixo pela sua service_role key
--      (pega em https://supabase.com/dashboard/project/_/settings/api).
--   2. Rode no SQL editor do Supabase Dashboard.
--   3. Confira com: `select * from cron.job;`
--
-- Pra desfazer: `select cron.unschedule('journey-snapshot-daily');`
-- Pra rodar manual sem esperar o cron: clique no botão "Executar agora" do
-- dashboard de Edge Functions, ou via curl:
--
--   curl -X POST https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/journey-snapshot \
--     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante extensões (provavelmente já habilitadas no Supabase Pro)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Schedule diário 03h UTC
SELECT cron.schedule(
  'journey-snapshot-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/journey-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

-- 3. Verificar (opcional)
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'journey-snapshot-daily';
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
