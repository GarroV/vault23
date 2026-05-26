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
  handleMeetCommand,
  handleMeetNote,
  handleEndMeetCommand,
  handleMeetTaskAttach,
  handleMeetSkip,
  handleVoiceNote,
  handleVoiceCreateTask,
  handleVoiceSaveAsNote,
} from './handlers.ts';

registerLocale(ru, en);

export class NotesModule implements BotModule {
  readonly name = 'notes';
  readonly commands = ['/note', '/notes', '/meet', '/endmeet'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    if (event.type === 'voice') return true;
    if (session.state.startsWith('note_') || session.state.startsWith('meet_')) return true;
    if (event.type === 'callback_query') {
      return (
        event.callbackData?.startsWith('note_task:') ||
        event.callbackData === 'note_skip' ||
        event.callbackData?.startsWith('meet_task:') ||
        event.callbackData === 'meet_skip' ||
        event.callbackData?.startsWith('voice_create_task:') ||
        event.callbackData === 'voice_save_as_note'
      ) ?? false;
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.type === 'voice') return handleVoiceNote(ctx);

    if (event.command === '/note') return handleNoteCommand(ctx);
    if (event.command === '/notes') return handleNotesListCommand(ctx);
    if (event.command === '/meet') return handleMeetCommand(ctx);
    if (event.command === '/endmeet') return handleEndMeetCommand(ctx);

    if (event.type === 'callback_query') {
      const data = event.callbackData ?? '';
      if (data.startsWith('note_task:')) return handleTaskAttach(ctx);
      if (data === 'note_skip') return handleNoteSkip(ctx);
      if (data.startsWith('meet_task:')) return handleMeetTaskAttach(ctx);
      if (data === 'meet_skip') return handleMeetSkip(ctx);
      if (data.startsWith('voice_create_task:')) return handleVoiceCreateTask(ctx);
      if (data === 'voice_save_as_note') return handleVoiceSaveAsNote(ctx);
    }

    if (session.state === 'note_awaiting_content' && event.type === 'text') return handleNoteContentInput(ctx);
    if (session.state === 'meet_active' && event.type === 'text') return handleMeetNote(ctx);

    console.error('[notes] unhandled state', { state: session.state, eventType: event.type, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
