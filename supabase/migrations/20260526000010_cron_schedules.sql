-- Cron schedules for Edge Functions.
-- Service role key is stored in app_settings (key='CRON_SERVICE_KEY') so
-- cron jobs can read it at runtime without embedding it in function bodies.
-- If the key is rotated: UPDATE app_settings SET value='<new>' WHERE key='CRON_SERVICE_KEY';

CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'CRON_SERVICE_KEY',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycmx3enN2cmxpaXBjaWdtemZpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTcxOTEyMywiZXhwIjoyMDk1Mjk1MTIzfQ.Id3S9wsQ-kV16i3FqL0WVcLAg4Ijl7_ESf6nR_1lNLA',
  now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- remind: fires every minute, sends due reminders
SELECT cron.schedule(
  'remind-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url      := 'https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/remind',
    headers  := format(
      '{"Authorization": "Bearer %s", "Content-Type": "application/json"}',
      (SELECT value FROM app_settings WHERE key = 'CRON_SERVICE_KEY')
    )::jsonb,
    body     := '{}'::jsonb
  ) AS request_id;
  $$
);

-- billing-housekeeping: daily at 03:00 UTC
-- downgrades expired trials, handles overdue subscriptions, resets monthly counters
SELECT cron.schedule(
  'billing-housekeeping-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url      := 'https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/billing-housekeeping',
    headers  := format(
      '{"Authorization": "Bearer %s", "Content-Type": "application/json"}',
      (SELECT value FROM app_settings WHERE key = 'CRON_SERVICE_KEY')
    )::jsonb,
    body     := '{}'::jsonb
  ) AS request_id;
  $$
);

-- rollback:
-- SELECT cron.unschedule('remind-every-minute');
-- SELECT cron.unschedule('billing-housekeeping-daily');
-- DELETE FROM app_settings WHERE key = 'CRON_SERVICE_KEY';
