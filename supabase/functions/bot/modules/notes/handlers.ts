import type { BotContext, ModuleResult } from '../../core/types.ts';
import {
  createNote,
  attachNoteToTask,
  getRecentNotes,
  getOpenTasksForPicker,
  createNoteInMeeting,
  attachMeetingToTask,
} from './queries.ts';

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

export async function handleMeetCommand(ctx: BotContext): Promise<ModuleResult> {
  const sessionId = crypto.randomUUID();
  await ctx.reply(ctx.t('meet_started'));
  return { ok: true, session: { state: 'meet_active', data: { sessionId, noteCount: 0 } } };
}

export async function handleMeetNote(ctx: BotContext): Promise<ModuleResult> {
  const content = ctx.event.text?.trim() ?? '';
  if (!content) return { ok: false };

  const sessionId = ctx.session.data.sessionId as string;
  const noteCount = (ctx.session.data.noteCount as number) + 1;

  try {
    await createNoteInMeeting(ctx.db, ctx.user.workspaceId, content, sessionId);
    await ctx.reply(ctx.t('meet_note_saved', { count: noteCount }));
    return { ok: true, session: { state: 'meet_active', data: { sessionId, noteCount } } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleMeetNote error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleEndMeetCommand(ctx: BotContext): Promise<ModuleResult> {
  const sessionId = ctx.session.data.sessionId as string | undefined;
  if (!sessionId) {
    await ctx.reply(ctx.t('meet_not_active'));
    return { ok: false, clearSession: true };
  }

  const noteCount = ctx.session.data.noteCount as number;
  try {
    const tasks = await getOpenTasksForPicker(ctx.db, ctx.user.workspaceId);

    if (tasks.length === 0) {
      await ctx.reply(ctx.t('meet_ended', { count: noteCount }));
      return { ok: true, clearSession: true };
    }

    const taskButtons = tasks.map(t => [{ text: t.title, callbackData: `meet_task:${t.id}` }]);
    taskButtons.push([{ text: ctx.t('meet_btn_skip'), callbackData: 'meet_skip' }]);

    await ctx.replyWithButtons(
      ctx.t('meet_ended_attach', { count: noteCount }),
      taskButtons,
    );
    return { ok: true, session: { state: 'meet_awaiting_task', data: { sessionId, noteCount } } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleEndMeetCommand error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleMeetTaskAttach(ctx: BotContext): Promise<ModuleResult> {
  const taskId = ctx.event.callbackData?.split(':')[1];
  const sessionId = ctx.session.data.sessionId as string | undefined;

  if (!taskId || !sessionId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    await attachMeetingToTask(ctx.db, ctx.user.workspaceId, sessionId, taskId);
    await ctx.reply(ctx.t('meet_attached'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleMeetTaskAttach error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleMeetSkip(ctx: BotContext): Promise<ModuleResult> {
  const noteCount = ctx.session.data.noteCount as number;
  await ctx.reply(ctx.t('meet_ended', { count: noteCount }));
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
