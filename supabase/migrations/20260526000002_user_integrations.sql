CREATE TABLE user_integrations (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       text        NOT NULL,   -- 'google'
    access_token   text,
    refresh_token  text,
    expires_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, provider)
);

CREATE INDEX idx_user_integrations_user ON user_integrations(user_id, provider);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
-- Service role only (no user-facing RLS needed — accessed via service_role in Edge Functions)

-- rollback:
-- DROP TABLE IF EXISTS user_integrations;
