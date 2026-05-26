# OP.4 — Unit Economics

## Cost structure (current)

### Fixed monthly costs

| Service | Plan | Cost (USD/mo) |
|---------|------|---------------|
| Supabase | Free → Pro | $0 → $25 |
| Telegram Bot API | Free | $0 |
| OpenAI (Whisper + GPT) | Pay-per-use | See below |
| Resend (email) | Free 3k/mo → Starter | $0 → $20 |
| Domain + SSL | ~$15/yr | ~$1.25 |
| **Total (free tier)** | | **~$1.25/mo** |
| **Total (pro, no AI)** | | **~$46/mo** |

### Variable costs (per workspace)

| Event | API | Cost |
|-------|-----|------|
| Voice message transcription | OpenAI Whisper | ~$0.006 / minute of audio |
| AI summarization (GPT-4o-mini) | OpenAI Chat | ~$0.0003 / 1k tokens ≈ $0.001 / call |
| Email send | Resend | $0 first 3k/mo; $0.80/1k after |

### Estimated cost per active workspace/month

Assumptions: 1 active user, 20 voice messages (avg 1 min each), 5 AI calls, 5 emails.

| Item | Volume | Unit cost | Total |
|------|--------|-----------|-------|
| Voice (Whisper) | 20 min | $0.006 | $0.12 |
| AI calls (GPT-4o-mini) | 5 | $0.001 | $0.005 |
| Email | 5 | ~$0 (free tier) | $0 |
| Supabase DB (shared) | — | — | ~$0.05 |
| **Total variable** | | | **~$0.18/workspace/mo** |

## Revenue model

| Plan | Price | Included |
|------|-------|----------|
| Trial | Free (14 days) | Full features |
| Solo | TBD (~$9/mo) | 1 user, 50 voice/mo, 20 emails/mo |
| Team | TBD (~$29/mo) | 5 users, 200 voice/mo, 100 emails/mo |
| Free (post-trial) | $0 | Core features, no voice/email |

## Break-even analysis

Fixed platform costs ~$50/mo (Pro Supabase + email).

| Solo subscribers | Revenue | Variable costs | Gross profit |
|-----------------|---------|----------------|-------------|
| 6 | $54 | ~$1.10 | ~$3 |
| 10 | $90 | ~$1.80 | ~$38 |
| 20 | $180 | ~$3.60 | ~$126 |
| 50 | $450 | ~$9 | ~$391 |

Break-even: **~6 Solo subscribers** covers infrastructure.

## Current metrics (bootstrap)

Update this table after each cohort.

| Metric | Value | Date |
|--------|-------|------|
| Total workspaces | — | — |
| Active (last 30d) | — | — |
| Trial → paid conversion | — | — |
| MRR | $0 | 2026-05-26 |
| Churn rate | — | — |
| CAC | $0 (organic) | — |

## OpenAI cost controls

Limits defined in `bot/core/plans.ts`:

```
trial:  50 voice/mo, 20 email/mo
solo:   50 voice/mo, 20 email/mo
team:   200 voice/mo, 100 email/mo
free:   0 voice/mo,  0 email/mo
```

Hard stop: `gate('voice')` / `gate('email')` rejects requests when monthly limit reached.
Monthly counters reset on 1st of each month (checked by `monthly_usage.period_start`).

## Cost scaling milestones

| Milestone | Action |
|-----------|--------|
| 50 workspaces | Upgrade Supabase to Pro ($25); add PITR |
| 200 workspaces | Review OpenAI spend; consider caching summaries |
| 500 workspaces | Evaluate Supabase Teams ($599) or self-host Postgres |
| 1000 voice min/mo | OpenAI committed-use discount available |
