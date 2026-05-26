# OP.3 — Backup Plan

## What we back up

| Layer | Data | Criticality |
|-------|------|-------------|
| Postgres | All tables — workspaces, users, tasks, notes, reminders, contractors, services, auth_methods, bot_sessions, monthly_usage, locale_overrides, app_settings | **Critical** |
| Supabase Storage | Voice-message audio files (input, ephemeral) | Low — originals are in Telegram, not re-processed |
| Edge Function config | Secrets in Supabase Vault / env vars | Recovered from password manager, not from backup |

## Automatic backups (Supabase managed)

Supabase Free / Pro tier includes point-in-time recovery (PITR) or daily snapshots depending on plan:

- **Free plan**: 7-day daily snapshots (taken overnight UTC). Available in Dashboard → Database → Backups.
- **Pro plan**: PITR up to 7 days of WAL replay. Enables restore to exact minute.

**Action required**: upgrade to Pro before going beyond ~10 paying workspaces. Free snapshots are daily; a mid-day incident would lose up to 24 h of data.

## Manual / programmatic export

Run weekly (e.g., Sunday 02:00 UTC) via a cron job or Supabase Edge Function:

```bash
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl \
  --exclude-table=processed_updates \
  --exclude-table=bot_sessions \
  -Fc -f "backup_$(date +%Y%m%d).dump"
```

Upload to cold storage (S3 / Backblaze B2 / Cloudflare R2). Keep 30 daily + 12 monthly snapshots.

Tables excluded from backup:
- `processed_updates` — Telegram idempotency log, safe to lose (replay-idempotent by design)
- `bot_sessions` — in-flight conversation state; sessions expire and are recreated automatically

## Restore procedure

### Restore from Supabase Dashboard snapshot

1. Dashboard → Database → Backups → select date → Restore
2. Supabase creates a new project with the restored state
3. Update `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in all Edge Function secrets
4. Verify by running smoke test (see below)
5. Update DNS / Telegram webhook URL if project URL changed

### Restore from pg_dump

```bash
# 1. Create a fresh Supabase project (or use existing with empty schema)
# 2. Push migrations to rebuild schema
supabase db push --db-url "$NEW_DB_URL"

# 3. Restore data only (schema already applied)
pg_restore --data-only --no-owner --no-acl \
  -d "$NEW_DB_URL" backup_20260526.dump
```

### Smoke test after restore

```sql
SELECT count(*) FROM workspaces WHERE status != 'cancelled';
SELECT count(*) FROM tasks WHERE deleted_at IS NULL;
SELECT count(*) FROM users;
```

Compare counts against last known-good metrics (stored in `docs/UNIT_ECONOMICS.md` or Grafana).

## Data retention policy

| Data type | Retention | Notes |
|-----------|-----------|-------|
| Tasks (soft-deleted) | 90 days in trash, then hard-delete | Scheduled job: `DELETE FROM tasks WHERE deleted_at < now() - interval '90 days'` |
| Bot sessions | 7 days inactive | Cleared by `bot_sessions.expires_at` TTL |
| Monthly usage | 24 months | Aggregate data, low sensitivity |
| Processed updates | 7 days | Idempotency window |
| User data after `/deletedata` | Immediate | Hard delete, irreversible |

## RTO / RPO targets (current)

| Metric | Target | Current capability |
|--------|--------|--------------------|
| RPO (data loss tolerance) | 24 h | Free tier: daily snapshots |
| RTO (time to restore service) | 2 h | Manual restore from Dashboard |
| Upgrade path | 15 min RPO | Pro plan PITR |

## Responsibilities

- Platform admin reviews Dashboard backup status **monthly**
- Before any destructive migration: manual `pg_dump` snapshot
- Secrets (API keys, Stripe) stored in 1Password; recovery does not require DB access
