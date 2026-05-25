import type { BotContext, ModuleResult } from '../../core/types.ts';
import { createNote, attachNoteToTask, getRecentNotes, getOpenTasksForPicker } from './queries.ts';

export async function handleNoteCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_note_content'));
  return { ok: true, session: { state: 'note_awaiting_content', data: {} } };
}

export async function handleNoteContentInput(ctx: BotContext): Promise<ModuleResult> {
  const content = ctx.event.text?.trim() ?? '';
  if (!content) {
    await ctx.reply(ctx.t('error_empty_note'));
    return { ok: false };
  }

  try {
    const noteId = await createNote(ctx.db, ctx.user.workspaceId, content);
    const tasks = await getOpenTasksForPicker(ctx.db, ctx.user.workspaceId);

    if (tasks.length === 0) {
      await ctx.reply(ctx.t('note_saved'));
      return { ok: true, clearSession: true };
    }

    const taskButtons = tasks.map(t => [{ text: t.title, callbackData: `note_task:${t.id}` }]);
    taskButtons.push([{ text: ctx.t('note_btn_skip'), callbackData: 'note_skip' }]);

    await ctx.replyWithButtons(ctx.t('note_attach_ask'), taskButtons);
    return { ok: true, session: { state: 'note_awaiting_task', data: { noteId } } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleNoteContentInput error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleTaskAttach(ctx: BotContext): Promise<ModuleResult> {
  const taskId = ctx.event.callbackData?.split(':')[1];
  const noteId = ctx.session.data.noteId as string | undefined;

  if (!taskId || !noteId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    await attachNoteToTask(ctx.db, ctx.user.workspaceId, noteId, taskId);
    await ctx.reply(ctx.t('note_attached'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleTaskAttach error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleNoteSkip(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('note_saved'));
  return { ok: true, clearSession: true };
}

export async function handleNotesListCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const notes = await getRecentNotes(ctx.db, ctx.user.workspaceId);

    if (notes.length === 0) {
      await ctx.reply(ctx.t('notes_empty'));
      return { ok: true, clearSession: true };
    }

    for (const note of notes) {
      const date = new Date(note.created_at).toLocaleDateString(
        ctx.user.language === 'ru' ? 'ru-RU' : 'en-US',
        { month: 'short', day: 'numeric', timeZone: 'UTC' },
      );
      const preview = note.content.length > 200 ? `${note.content.slice(0, 200)}…` : note.content;
      await ctx.reply(`${date} — ${preview}`);
    }

    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleNotesListCommand error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
