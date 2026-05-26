-- Billing infrastructure: Stripe fields, workspace_members, processed events

-- Stripe identifiers on workspace
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

-- Workspace member roles (foundation for Team tier; on pilot only owner row exists)
CREATE TABLE IF NOT EXISTS workspace_members (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         text        NOT NULL DEFAULT 'owner',  -- 'owner' | 'admin' | 'member'
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
-- Service role only

-- Monthly usage counters (reset on billing period start)
CREATE TABLE IF NOT EXISTS monthly_usage (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    period_start    date        NOT NULL,
    voice_count     int         NOT NULL DEFAULT 0,
    email_count     int         NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_monthly_usage_ws ON monthly_usage(workspace_id, period_start);

ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;

-- Stripe event idempotency log
CREATE TABLE IF NOT EXISTS processed_stripe_events (
    event_id    text        PRIMARY KEY,
    processed_at timestamptz NOT NULL DEFAULT now()
);

-- Anti-trial-abuse: record that a Telegram ID has used a trial
CREATE TABLE IF NOT EXISTS used_trials (
    telegram_id text        PRIMARY KEY,
    workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    started_at  timestamptz NOT NULL DEFAULT now()
);

-- rollback:
-- DROP TABLE IF EXISTS used_trials;
-- DROP TABLE IF EXISTS processed_stripe_events;
-- DROP TABLE IF EXISTS monthly_usage;
-- DROP TABLE IF EXISTS workspace_members;
-- ALTER TABLE workspaces DROP COLUMN IF EXISTS stripe_customer_id;
-- ALTER TABLE workspaces DROP COLUMN IF EXISTS stripe_subscription_id;
-- ALTER TABLE workspaces DROP COLUMN IF EXISTS subscription_current_period_end;
