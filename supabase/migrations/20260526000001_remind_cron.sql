-- Cron job: call remind function every minute via pg_net
-- Requires: pg_cron and pg_net extensions enabled in Supabase dashboard.
-- The service role key is read from app settings (set via: ALTER DATABASE postgres SET app.service_role_key TO '<key>';)
--
-- If pg_cron is not enabled, this migration is a no-op.
-- Enable manually in Supabase Dashboard > Edge Functions > remind > Schedule, OR
-- enable pg_cron extension and re-run.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'remind-every-minute',
      '* * * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/remind',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := '{}'::jsonb
      )
      $job$
    );
  END IF;
END $$;

-- rollback:
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN PERFORM cron.unschedule('remind-every-minute'); END IF; END $$;
