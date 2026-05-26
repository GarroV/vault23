-- Cron job: call remind function every minute via pg_net
-- Requires: pg_cron and pg_net extensions enabled in Supabase dashboard.
-- The service role key is read from vault (set via: SELECT vault.create_secret('service_role_key', '<key>', 'supabase service role key');)
--
-- If vault is not configured, set up manually in Supabase Dashboard > Edge Functions > remind > Schedule.

SELECT cron.schedule(
  'remind-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/remind',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  )
  $$
);
