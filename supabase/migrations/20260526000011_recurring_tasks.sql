-- Add recurrence schedule to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence jsonb;

-- Link reminders to tasks (optional, for auto-reschedule)
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id) WHERE task_id IS NOT NULL;
