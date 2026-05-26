-- Atomic increment for monthly_usage counters. Returns the NEW value after increment.
-- Called as: SELECT increment_usage(workspace_id, period_date, column_name)
CREATE OR REPLACE FUNCTION increment_usage(
  p_workspace_id uuid,
  p_period       date,
  p_column       text
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new int;
BEGIN
  IF p_column = 'voice_count' THEN
    UPDATE monthly_usage
       SET voice_count = voice_count + 1,
           updated_at  = now()
     WHERE workspace_id = p_workspace_id
       AND period_start = p_period
    RETURNING voice_count INTO v_new;
  ELSIF p_column = 'email_count' THEN
    UPDATE monthly_usage
       SET email_count = email_count + 1,
           updated_at  = now()
     WHERE workspace_id = p_workspace_id
       AND period_start = p_period
    RETURNING email_count INTO v_new;
  ELSE
    RAISE EXCEPTION 'Unknown column: %', p_column;
  END IF;

  RETURN COALESCE(v_new, 0);
END;
$$;

-- rollback:
-- DROP FUNCTION IF EXISTS increment_usage(uuid, date, text);
