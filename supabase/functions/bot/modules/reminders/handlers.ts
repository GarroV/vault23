import type { BotContext, ModuleResult } from '../../core/types.ts';
import { createReminder } from './queries.ts';

const DURATIONS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
};

function calcRemindAt(duration: string): Date {
  return new Date(Date.now() + (DURATIONS[duration] ?? DURATIONS['1h']));
}

function formatRemindAt(date: Date, lang: 'ru' | 'en'): string {
  return date.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}

export async function handleRemindCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_remind_text'));
  return { ok: true, session: { state: 'remind_awaiting_text', data: {} } };
}

export async function handleRemindTextInput(ctx: BotContext): Promise<ModuleResult> {
  const message = ctx.event.text?.trim() ?? '';
  if (!message) {
    await ctx.reply(ctx.t('error_empty_remind'));
    return { ok: false };
  }

  await ctx.replyWithButtons(ctx.t('ask_remind_when'), [
    [{ text: ctx.t('remind_btn_1h'), callbackData: 'remind_time:1h' }],
    [{ text: ctx.t('remind_btn_3h'), callbackData: 'remind_time:3h' }],
    [{ text: ctx.t('remind_btn_24h'), callbackData: 'remind_time:24h' }],
    [{ text: ctx.t('remind_btn_3d'), callbackData: 'remind_time:3d' }],
  ]);

  return { ok: true, session: { state: 'remind_awaiting_time', data: { message } } };
}

export async function handleRemindTime(ctx: BotContext): Promise<ModuleResult> {
  const duration = ctx.event.callbackData?.split(':')[1] ?? '1h';
  const message = ctx.session.data.message as string | undefined;

  if (!message) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  const remindAt = calcRemindAt(duration);

  try {
    await createReminder(ctx.db, ctx.user.workspaceId, ctx.user.id, message, remindAt);
    await ctx.reply(ctx.t('remind_set', { time: formatRemindAt(remindAt, ctx.user.language) }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[reminders] handleRemindTime error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
