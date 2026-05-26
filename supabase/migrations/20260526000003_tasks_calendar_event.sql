ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

-- rollback:
-- ALTER TABLE tasks DROP COLUMN IF EXISTS google_calendar_event_id;
