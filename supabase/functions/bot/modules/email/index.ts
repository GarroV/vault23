import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import {
  handleEmailCommand,
  handleRecipientInput,
  handleSubjectInput,
  handleBodyInput,
} from './handlers.ts';

registerLocale(ru, en);

export class EmailModule implements BotModule {
  readonly name = 'email';
  readonly commands = ['/email'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    if (event.command === '/email') return true;
    if (event.type === 'text') {
      return (
        session.state === 'email_awaiting_recipient' ||
        session.state === 'email_awaiting_subject' ||
        session.state === 'email_awaiting_body'
      );
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.command === '/email') return handleEmailCommand(ctx);

    if (event.type === 'text') {
      if (session.state === 'email_awaiting_recipient') return handleRecipientInput(ctx);
      if (session.state === 'email_awaiting_subject') return handleSubjectInput(ctx);
      if (session.state === 'email_awaiting_body') return handleBodyInput(ctx);
    }

    console.error('[email] unhandled state', { state: session.state, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
