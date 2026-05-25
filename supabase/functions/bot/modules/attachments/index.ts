import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import { handleFileReceived, handleAttachToTask, handleAttachCancel } from './handlers.ts';

registerLocale(ru, en);

export class AttachmentsModule implements BotModule {
  readonly name = 'attachments';
  readonly commands: string[] = [];

  canHandle(event: BotEvent, session: SessionState): boolean {
    if (event.type === 'file') return true;
    if (session.state === 'attach_awaiting_task') return true;
    if (event.type === 'callback_query') {
      return (
        event.callbackData?.startsWith('attach_task:') ||
        event.callbackData === 'attach_cancel'
      ) ?? false;
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.type === 'file') return handleFileReceived(ctx);

    if (event.type === 'callback_query') {
      const data = event.callbackData ?? '';
      if (data.startsWith('attach_task:')) return handleAttachToTask(ctx);
      if (data === 'attach_cancel') return handleAttachCancel(ctx);
    }

    if (session.state === 'attach_awaiting_task') {
      // User typed text instead of picking — stay in state
      await ctx.reply(ctx.t('attach_choose_task'));
      return { ok: false };
    }

    console.error('[attachments] unhandled', { state: session.state, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
