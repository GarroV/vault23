import type { BotContext, ModuleResult } from '../../core/types.ts';
import { createReminder } from './queries.ts';
import { parseDateTime } from '../../core/nlp.ts';

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
  await ctx.reply(ctx.t('ask_remind_when'));
  return { ok: true, session: { state: 'remind_awaiting_time_text', data: { message } } };
}

export async function handleRemindTimeTextInput(ctx: BotContext): Promise<ModuleResult> {
  const timeText = ctx.event.text?.trim() ?? '';
  const message = ctx.session.data.message as string | undefined;

  if (!message) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  const nowIso = new Date().toISOString();
  const parsedIso = await parseDateTime(ctx.db, timeText, nowIso);

  if (!parsedIso) {
    await ctx.reply(ctx.t('error_remind_time_parse'));
    return { ok: false };
  }

  const remindAt = new Date(parsedIso);
  if (remindAt <= new Date()) {
    await ctx.reply(ctx.t('nlp_reminder_past'));
    return { ok: false };
  }

  try {
    await createReminder(ctx.db, ctx.user.workspaceId, ctx.user.id, message, remindAt);
    const timeStr = remindAt.toLocaleString(ctx.user.language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }) + ' UTC';
    await ctx.reply(ctx.t('remind_set', { time: timeStr }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[reminders] handleRemindTimeTextInput error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
