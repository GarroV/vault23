-- Grant table access to anon role (respects RLS).
-- Edge Functions should use anon key + set_app_workspace() for data queries.
-- Service role is only for auth lookups (auth_methods) that must bypass RLS.

-- rollback:
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
-- REVOKE USAGE ON SCHEMA public FROM anon;
-- REVOKE EXECUTE ON FUNCTION set_app_workspace(uuid) FROM anon;
-- REVOKE EXECUTE ON FUNCTION current_workspace_id() FROM anon;

GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspaces,
  users,
  auth_methods,
  contractors,
  contractor_contacts,
  topics,
  categories,
  tasks,
  people,
  task_participants,
  notes,
  attachments,
  time_entries,
  reminders,
  services,
  kb_entries,
  bot_sessions,
  token_usage
TO anon;

-- processed_updates: only service_role (intentionally no grant to anon)

GRANT EXECUTE ON FUNCTION set_app_workspace(uuid) TO anon;
GRANT EXECUTE ON FUNCTION current_workspace_id() TO anon;
GRANT EXECUTE ON FUNCTION create_workspace_defaults(uuid, text) TO anon;
