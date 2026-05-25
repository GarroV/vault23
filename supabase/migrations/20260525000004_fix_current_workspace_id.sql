-- Fix: current_workspace_id() must return NULL (not error) when app.workspace_id
-- is not set. current_setting(..., true) returns '' on missing setting,
-- and ''::uuid throws "invalid input syntax for type uuid".
-- NULLIF converts '' to NULL before the cast.

-- rollback:
-- CREATE OR REPLACE FUNCTION current_workspace_id() RETURNS uuid AS $$ SELECT current_setting('app.workspace_id', true)::uuid; $$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_workspace_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;
