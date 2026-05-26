-- System-level configuration store (bot owner's API keys, etc.)
-- No workspace_id — these are global/per-installation settings.
-- Accessible via service_role only.

CREATE TABLE app_settings (
    key         text        PRIMARY KEY,
    value       text        NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid        REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- Service role only — no user-facing RLS needed.

-- Platform admin flag on users.
-- Protected by unique partial index: only ONE user can be platform admin.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_platform_admin
  ON users (is_platform_admin)
  WHERE is_platform_admin = true;

-- Bootstrap: set earliest registered user as platform admin (idempotent).
-- If already set, the UNIQUE index prevents duplicate — UPDATE affects 0 rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE is_platform_admin = true) THEN
    UPDATE users SET is_platform_admin = true
    WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);
  END IF;
END $$;

-- rollback:
-- DROP INDEX IF EXISTS idx_one_platform_admin;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_platform_admin;
-- DROP TABLE IF EXISTS app_settings;
