import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import { handleRemindCommand, handleRemindTextInput, handleRemindTimeTextInput } from './handlers.ts';

registerLocale(ru, en);

export class RemindersModule implements BotModule {
  readonly name = 'reminders';
  readonly commands = ['/remind'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    return session.state.startsWith('remind_');
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.command === '/remind') return handleRemindCommand(ctx);

    if (session.state === 'remind_awaiting_text' && event.type === 'text') {
      return handleRemindTextInput(ctx);
    }

    if (session.state === 'remind_awaiting_time_text' && event.type === 'text') {
      return handleRemindTimeTextInput(ctx);
    }

    console.error('[reminders] unhandled state', { state: session.state, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
