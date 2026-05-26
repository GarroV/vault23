-- Unify tasks + notes + reminders into a single `items` entity.
-- No production data exists; all drops are safe.

-- 1. Drop dependent tables (order matters for FK constraints)
DROP TABLE IF EXISTS time_entries     CASCADE;
DROP TABLE IF EXISTS task_participants CASCADE;
DROP TABLE IF EXISTS notes            CASCADE;
DROP TABLE IF EXISTS reminders        CASCADE;
DROP TABLE IF EXISTS people           CASCADE;
DROP TABLE IF EXISTS categories       CASCADE;
DROP TABLE IF EXISTS tasks            CASCADE;

-- 2. Create unified items table
CREATE TABLE items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content      text        NOT NULL,
  assignee     text,
  topic_id     uuid        REFERENCES topics(id) ON DELETE SET NULL,
  parent_id    uuid        REFERENCES items(id)  ON DELETE SET NULL,
  project_id   uuid        REFERENCES projects(id) ON DELETE SET NULL,
  due_at       timestamptz,
  notified_at  timestamptz,
  done         boolean     NOT NULL DEFAULT false,
  recurrence   jsonb,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Indexes
CREATE INDEX idx_items_workspace    ON items(workspace_id);
CREATE INDEX idx_items_open         ON items(workspace_id, done)   WHERE deleted_at IS NULL;
CREATE INDEX idx_items_due_pending  ON items(due_at)
  WHERE due_at IS NOT NULL AND done = false AND notified_at IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_items_parent       ON items(parent_id)            WHERE parent_id IS NOT NULL;
CREATE INDEX idx_items_content_fts  ON items
  USING gin(to_tsvector('russian', content));

-- 4. RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_workspace_select" ON items FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid()));

CREATE POLICY "items_workspace_modify" ON items FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid()));

-- rollback:
-- DROP TABLE IF EXISTS items CASCADE;
