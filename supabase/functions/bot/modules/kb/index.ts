import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import {
  handleAddKbCommand,
  handleKbTitleInput,
  handleKbContentInput,
  handleKbApprove,
  handleKbReject,
  handleAskCommand,
  handleAskQuestion,
} from './handlers.ts';

registerLocale(ru, en);

export class KbModule implements BotModule {
  readonly name = 'kb';
  readonly commands = ['/addkb', '/ask'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    if (session.state.startsWith('kb_')) return true;
    if (event.type === 'callback_query') {
      return (
        event.callbackData?.startsWith('kb_approve:') ||
        event.callbackData?.startsWith('kb_reject:')
      ) ?? false;
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.command === '/addkb') return handleAddKbCommand(ctx);
    if (event.command === '/ask') return handleAskCommand(ctx);

    if (event.type === 'callback_query') {
      const data = event.callbackData ?? '';
      if (data.startsWith('kb_approve:')) return handleKbApprove(ctx);
      if (data.startsWith('kb_reject:')) return handleKbReject(ctx);
    }

    if (session.state === 'kb_awaiting_title' && event.type === 'text') return handleKbTitleInput(ctx);
    if (session.state === 'kb_awaiting_content' && event.type === 'text') return handleKbContentInput(ctx);
    if (session.state === 'kb_awaiting_question' && event.type === 'text') return handleAskQuestion(ctx);

    console.error('[kb] unhandled state', { state: session.state, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
