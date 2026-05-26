/**
 * Billing housekeeping — runs daily via Supabase cron schedule.
 *
 * Jobs:
 *   1. Mark expired trials as 'suspended'
 *   2. Mark past_due workspaces as 'suspended' after 7-day grace period
 *   3. Notify users whose trial ends in 3 days (once)
 *
 * Setup: Supabase Dashboard > Edge Functions > billing-housekeeping > Schedule (daily)
 * OR via pg_cron (see migration 20260526000007_billing_housekeeping_cron.sql)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return new Response('Config error', { status: 500 });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const now = new Date().toISOString();
  const graceCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const trialWarnCutoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Expire trials
  const { data: expiredTrials } = await db
    .from('workspaces')
    .update({ status: 'suspended' })
    .eq('status', 'trial')
    .lt('trial_ends_at', now)
    .select('id');

  if (expiredTrials?.length) {
    console.log('[billing-housekeeping] expired trials suspended', { count: expiredTrials.length });
    for (const ws of expiredTrials) {
      await notifyWorkspace(db, telegramToken, ws.id,
        '⏰ Твой триал закончился. Оформи подписку через /subscription чтобы вернуть доступ.');
    }
  }

  // 2. Suspend past_due workspaces after 7-day grace
  const { data: overdue } = await db
    .from('workspaces')
    .update({ status: 'suspended' })
    .eq('status', 'past_due')
    .lt('updated_at', graceCutoff)
    .select('id');

  if (overdue?.length) {
    console.log('[billing-housekeeping] past_due suspended', { count: overdue.length });
    for (const ws of overdue) {
      await notifyWorkspace(db, telegramToken, ws.id,
        '⛔ Доступ приостановлен из-за неоплаченной подписки. Обнови способ оплаты через /subscription.');
    }
  }

  // 3. Trial ending soon (3 days) — warn once
  const { data: soonExpiring } = await db
    .from('workspaces')
    .select('id, trial_ends_at')
    .eq('status', 'trial')
    .gte('trial_ends_at', now)
    .lte('trial_ends_at', trialWarnCutoff);

  for (const ws of (soonExpiring ?? []) as Array<{ id: string; trial_ends_at: string }>) {
    const daysLeft = Math.ceil((new Date(ws.trial_ends_at).getTime() - Date.now()) / 86400000);
    await notifyWorkspace(db, telegramToken, ws.id,
      `⏰ Триал заканчивается через ${daysLeft} дн. Оформи подписку через /subscription чтобы сохранить доступ.`);
  }

  console.log('[billing-housekeeping] done');
  return new Response('OK', { status: 200 });
});

async function notifyWorkspace(
  db: ReturnType<typeof createClient>,
  token: string,
  workspaceId: string,
  text: string,
): Promise<void> {
  if (!token) return;

  const { data: user } = await db
    .from('users')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single();
  if (!user) return;

  const { data: auth } = await db
    .from('auth_methods')
    .select('value')
    .eq('user_id', (user as { id: string }).id)
    .eq('type', 'telegram')
    .single();

  const telegramId = (auth as { value?: string } | null)?.value;
  if (!telegramId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramId, text }),
  }).catch(err => console.error('[billing-housekeeping] notify failed', { error: String(err) }));
}
