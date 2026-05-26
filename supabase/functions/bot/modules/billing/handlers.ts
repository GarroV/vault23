import type { BotContext, ModuleResult } from '../../core/types.ts';
import { getPlanLimits } from '../../core/plans.ts';
import { getConfig } from '../../core/config.ts';
import { getMonthlyUsage, countOpenTasks } from './queries.ts';
import { createCheckoutSession, createBillingPortalSession } from './stripe.ts';

function daysLeft(isoDate: string | undefined): number {
  if (!isoDate) return 0;
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000));
}

function fmtDate(isoDate: string | undefined, lang: string): string {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function handleSubscriptionCommand(ctx: BotContext): Promise<ModuleResult> {
  const { workspace, user } = ctx;
  const [stripeKey, PRICE_SOLO, PRICE_TEAM] = await Promise.all([
    getConfig(ctx.db, 'STRIPE_SECRET_KEY'),
    getConfig(ctx.db, 'STRIPE_PRICE_SOLO'),
    getConfig(ctx.db, 'STRIPE_PRICE_TEAM'),
  ]);

  const usage = await getMonthlyUsage(ctx.db, workspace.id);
  const limits = getPlanLimits(workspace.plan);

  const status = workspace.status as string;
  const periodEnd = (workspace as unknown as Record<string, string>).subscription_current_period_end;
  const trialEnd = (workspace as unknown as Record<string, string>).trial_ends_at;
  const stripeCustomerId = (workspace as unknown as Record<string, string>).stripe_customer_id;

  if (status === 'trial') {
    const tasks = await countOpenTasks(ctx.db, workspace.id);
    const days = daysLeft(trialEnd);
    const text = ctx.t('sub_status_trial', { days, tasks, voice: usage.voiceCount });
    const buttons = [];

    if (stripeKey && PRICE_SOLO) {
      try {
        const soloUrl = await createCheckoutSession(stripeKey, PRICE_SOLO, workspace.id, String(chatId(user)));
        const teamUrl = PRICE_TEAM ? await createCheckoutSession(stripeKey, PRICE_TEAM, workspace.id, String(chatId(user))) : null;
        buttons.push([{ text: ctx.t('sub_btn_solo'), url: soloUrl }]);
        if (teamUrl) buttons.push([{ text: ctx.t('sub_btn_team'), url: teamUrl }]);
      } catch {
        await ctx.reply(text);
        return { ok: true, clearSession: true };
      }
    }

    await ctx.replyWithButtons(text, buttons.length > 0 ? buttons : [[{ text: ctx.t('sub_btn_solo'), url: 'https://vault23.app/pricing' }]]);
    return { ok: true, clearSession: true };
  }

  if (status === 'suspended' || status === 'cancelled') {
    const text = ctx.t(status === 'suspended' ? 'sub_status_suspended' : 'sub_status_cancelled');
    if (stripeKey && PRICE_SOLO) {
      try {
        const url = await createCheckoutSession(stripeKey, PRICE_SOLO, workspace.id, String(chatId(user)));
        await ctx.replyWithButtons(text, [[{ text: ctx.t('sub_btn_solo'), url }]]);
        return { ok: true, clearSession: true };
      } catch { /* fall through to plain reply */ }
    }
    await ctx.reply(text);
    return { ok: true, clearSession: true };
  }

  // active or past_due
  const planLabel = workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1);
  const text = ctx.t(
    status === 'past_due' ? 'sub_status_past_due' : 'sub_status_active',
    {
      plan: planLabel,
      date: fmtDate(periodEnd, user.language),
      voice: usage.voiceCount,
      maxVoice: limits.maxVoicePerMonth === Infinity ? '∞' : limits.maxVoicePerMonth,
      email: usage.emailCount,
      maxEmail: limits.maxEmailPerMonth === Infinity ? '∞' : limits.maxEmailPerMonth,
    },
  );

  const buttons = [];
  if (stripeKey && stripeCustomerId) {
    try {
      const portalUrl = await createBillingPortalSession(stripeKey, stripeCustomerId);
      buttons.push([{ text: ctx.t('sub_btn_manage'), url: portalUrl }]);
    } catch { /* silent */ }
  }

  if (buttons.length > 0) {
    await ctx.replyWithButtons(text, buttons);
  } else {
    await ctx.reply(text);
  }

  return { ok: true, clearSession: true };
}

function chatId(user: BotContext['user']): string {
  return user.telegramId;
}
