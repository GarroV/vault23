-- RLS policies for all tables.
-- Written by Claude (🔴 — never delegate to Gemini).
--
-- Strategy: Edge Function sets app.workspace_id via set_app_workspace() at the
-- start of each request. All subsequent queries through that session are
-- automatically scoped to that workspace. If the setting is missing, queries
-- return nothing (safe default — NULL comparison always fails).
--
-- Separate policies for SELECT and INSERT/UPDATE so we can tighten them
-- independently if needed (e.g. read-only role later).

-- rollback: see bottom of file

-- =============================================================
-- Helper: set workspace context for the current session
-- Called by Edge Function immediately after user identification.
-- =============================================================

CREATE OR REPLACE FUNCTION set_app_workspace(p_workspace_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.workspace_id', p_workspace_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Convenience: read current workspace from session
CREATE OR REPLACE FUNCTION current_workspace_id()
RETURNS uuid AS $$
  SELECT current_setting('app.workspace_id', true)::uuid;
$$ LANGUAGE sql STABLE;

-- =============================================================
-- workspaces
-- User can only see/modify their own workspace.
-- =============================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select" ON workspaces
  FOR SELECT USING (id = current_workspace_id());

CREATE POLICY "workspaces_modify" ON workspaces
  FOR ALL USING (id = current_workspace_id())
  WITH CHECK (id = current_workspace_id());

-- =============================================================
-- users
-- =============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select" ON users
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "users_modify" ON users
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- auth_methods
-- No workspace_id — scope via user_id → users.workspace_id.
-- =============================================================

ALTER TABLE auth_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_methods_select" ON auth_methods
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE workspace_id = current_workspace_id()
    )
  );

CREATE POLICY "auth_methods_modify" ON auth_methods
  FOR ALL USING (
    user_id IN (
      SELECT id FROM users WHERE workspace_id = current_workspace_id()
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE workspace_id = current_workspace_id()
    )
  );

-- =============================================================
-- contractors
-- =============================================================

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractors_select" ON contractors
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "contractors_modify" ON contractors
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- contractor_contacts
-- =============================================================

ALTER TABLE contractor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_contacts_select" ON contractor_contacts
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "contractor_contacts_modify" ON contractor_contacts
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- topics
-- =============================================================

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topics_select" ON topics
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "topics_modify" ON topics
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- categories
-- =============================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "categories_modify" ON categories
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- tasks
-- =============================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "tasks_modify" ON tasks
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- people
-- =============================================================

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "people_select" ON people
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "people_modify" ON people
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- task_participants
-- =============================================================

ALTER TABLE task_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_participants_select" ON task_participants
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "task_participants_modify" ON task_participants
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- notes
-- =============================================================

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select" ON notes
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "notes_modify" ON notes
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- attachments
-- =============================================================

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select" ON attachments
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "attachments_modify" ON attachments
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- time_entries
-- =============================================================

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_select" ON time_entries
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "time_entries_modify" ON time_entries
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- reminders
-- =============================================================

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_select" ON reminders
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "reminders_modify" ON reminders
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- services
-- =============================================================

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_select" ON services
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "services_modify" ON services
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- kb_entries
-- =============================================================

ALTER TABLE kb_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_entries_select" ON kb_entries
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "kb_entries_modify" ON kb_entries
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- bot_sessions
-- =============================================================

ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_sessions_select" ON bot_sessions
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "bot_sessions_modify" ON bot_sessions
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- token_usage
-- =============================================================

ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_usage_select" ON token_usage
  FOR SELECT USING (workspace_id = current_workspace_id());

CREATE POLICY "token_usage_modify" ON token_usage
  FOR ALL USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());

-- =============================================================
-- processed_updates
-- Global table — no workspace scope.
-- Block all direct access; only reachable via service role in Edge Functions.
-- =============================================================

ALTER TABLE processed_updates ENABLE ROW LEVEL SECURITY;
-- No policies = no access for any non-service-role client. Intentional.

-- =============================================================
-- rollback:
-- ALTER TABLE processed_updates DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE token_usage DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE bot_sessions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE kb_entries DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE services DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE reminders DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE time_entries DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE attachments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE task_participants DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE people DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE topics DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE contractor_contacts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE contractors DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE auth_methods DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;
-- DROP FUNCTION IF EXISTS current_workspace_id();
-- DROP FUNCTION IF EXISTS set_app_workspace(uuid);
-- =============================================================
