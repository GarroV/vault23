import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import {
  handleNoteCommand,
  handleNoteContentInput,
  handleTaskAttach,
  handleNoteSkip,
  handleNotesListCommand,
} from './handlers.ts';

registerLocale(ru, en);

export class NotesModule implements BotModule {
  readonly name = 'notes';
  readonly commands = ['/note', '/notes'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    if (session.state.startsWith('note_')) return true;
    if (event.type === 'callback_query') {
      return (
        event.callbackData?.startsWith('note_task:') ||
        event.callbackData === 'note_skip'
      ) ?? false;
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.command === '/note') return handleNoteCommand(ctx);
    if (event.command === '/notes') return handleNotesListCommand(ctx);

    if (event.type === 'callback_query') {
      const data = event.callbackData ?? '';
      if (data.startsWith('note_task:')) return handleTaskAttach(ctx);
      if (data === 'note_skip') return handleNoteSkip(ctx);
    }

    if (session.state === 'note_awaiting_content' && event.type === 'text') return handleNoteContentInput(ctx);

    console.error('[notes] unhandled state', { state: session.state, eventType: event.type, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
