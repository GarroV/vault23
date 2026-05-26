-- Per-installation locale overrides — platform admin can customise any bot text
-- without redeploying. Static TS files are the defaults; rows here win.
CREATE TABLE locale_overrides (
    lang        text    NOT NULL CHECK (lang IN ('ru', 'en')),
    key         text    NOT NULL,
    value       text    NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (lang, key)
);

ALTER TABLE locale_overrides ENABLE ROW LEVEL SECURITY;
-- Service role only.

-- rollback:
-- DROP TABLE IF EXISTS locale_overrides;
