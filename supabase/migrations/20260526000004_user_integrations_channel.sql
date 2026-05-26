-- Columns for Google Calendar push notification channel and incremental sync
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS google_channel_id text;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS google_channel_expiry timestamptz;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS google_sync_token text;

-- rollback:
-- ALTER TABLE user_integrations DROP COLUMN IF EXISTS google_channel_id;
-- ALTER TABLE user_integrations DROP COLUMN IF EXISTS google_channel_expiry;
-- ALTER TABLE user_integrations DROP COLUMN IF EXISTS google_sync_token;
