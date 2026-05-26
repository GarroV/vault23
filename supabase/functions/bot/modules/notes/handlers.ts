import type { BotContext, ModuleResult } from '../../core/types.ts';
import { trackUsage } from '../../core/usage.ts';
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

async function transcribeWithWhisper(audioBytes: Uint8Array, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const form = new FormData();
  form.append('file', new Blob([audioBytes], { type: mimeType }), 'voice.ogg');
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const json = await res.json() as { text?: string };
  return json.text?.trim() ?? '';
}

async function detectTaskIntent(text: string): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!apiKey) return null;

  const systemPrompt = 'You extract task creation intent from text. ' +
    'If the text is a command to create a task (e.g. "Create a task", "Add task", "Remind me to", "Задачу по", "Создай задачу"), ' +
    'respond with JSON: {"is_task": true, "title": "<concise task title>"}. ' +
    'Otherwise respond with: {"is_task": false}. Respond with JSON only, no markdown.';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        max_tokens: 100,
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { choices: Array<{ message: { content: string } }> };
    const parsed = JSON.parse(json.choices[0].message.content) as { is_task: boolean; title?: string };
    return parsed.is_task && parsed.title ? parsed.title : null;
  } catch {
    return null;
  }
}

function encodeTitle(title: string): string {
  return encodeURIComponent(title).slice(0, 40); // stay within 64-char callback limit
}

export async function handleVoiceCreateTask(ctx: BotContext): Promise<ModuleResult> {
  const encoded = ctx.event.callbackData?.split(':')[1] ?? '';
  const title = decodeURIComponent(encoded);
  const text = ctx.session.data.text as string | undefined;

  if (!title) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    // Import tasks queries to get default topic
    const { getVisibleTopics } = await import('../tasks/queries.ts');
    const topics = await getVisibleTopics(ctx.db, ctx.user.workspaceId);
    const topicId = topics[0]?.id;
    if (!topicId) {
      await ctx.reply(ctx.t('error_unexpected'));
      return { ok: false, clearSession: true };
    }

    const { createTask } = await import('../tasks/queries.ts');
    await createTask(ctx.db, ctx.user.workspaceId, title, topicId);
    await ctx.reply(ctx.t('voice_task_created', { title }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleVoiceCreateTask error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleVoiceSaveAsNote(ctx: BotContext): Promise<ModuleResult> {
  const text = ctx.session.data.text as string | undefined;
  if (!text) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    const noteId = await createNote(ctx.db, ctx.user.workspaceId, text);
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
    console.error('[notes] handleVoiceSaveAsNote error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleVoiceNote(ctx: BotContext): Promise<ModuleResult> {
  const voiceGate = ctx.gate('voice');
  if (!voiceGate.allowed) {
    const key = voiceGate.reason === 'feature_not_in_plan' ? 'gate_plan_limit' : 'gate_suspended';
    await ctx.reply(ctx.t(key));
    return { ok: false, clearSession: true };
  }

  // OP.7: one-time voice privacy notice
  if (!ctx.session.data.voice_privacy_ack) {
    await ctx.reply(ctx.t('voice_privacy_notice'));
    return {
      ok: true,
      session: { state: 'idle', data: { ...ctx.session.data, voice_privacy_ack: true } },
    };
  }

  const fileId = ctx.event.fileId;
  const mimeType = ctx.event.mimeType ?? 'audio/ogg';

  if (!fileId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    const { getFilePath, downloadTelegramFile } = await import('../../telegram.ts');
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
    const filePath = await getFilePath(token, fileId);
    const audioBytes = await downloadTelegramFile(token, filePath);
    const text = await transcribeWithWhisper(audioBytes, mimeType);

    if (!text) {
      await ctx.reply(ctx.t('voice_empty'));
      return { ok: false, clearSession: true };
    }

    // Track whisper usage
    trackUsage(ctx.db, ctx.user.workspaceId, 'whisper', 'whisper-1', 1).catch(() => {});

    // NLU: detect if voice is a task command
    const taskIntent = await detectTaskIntent(text);
    if (taskIntent) {
      // Show confirmation before creating task (8.3 mandatory confirmation)
      await ctx.replyWithButtons(
        ctx.t('voice_task_confirm', { title: taskIntent }),
        [[
          { text: ctx.t('voice_btn_create_task'), callbackData: `voice_create_task:${encodeTitle(taskIntent)}` },
          { text: ctx.t('voice_btn_save_note'), callbackData: 'voice_save_as_note' },
        ]],
      );
      return { ok: true, session: { state: 'voice_awaiting_choice', data: { text, taskTitle: taskIntent } } };
    }

    const noteId = await createNote(ctx.db, ctx.user.workspaceId, text);
    await ctx.reply(ctx.t('voice_saved', { text }));

    const tasks = await getOpenTasksForPicker(ctx.db, ctx.user.workspaceId);
    if (tasks.length === 0) return { ok: true, clearSession: true };

    const taskButtons = tasks.map(t => [{ text: t.title, callbackData: `note_task:${t.id}` }]);
    taskButtons.push([{ text: ctx.t('note_btn_skip'), callbackData: 'note_skip' }]);
    await ctx.replyWithButtons(ctx.t('note_attach_ask'), taskButtons);

    return { ok: true, session: { state: 'note_awaiting_task', data: { noteId } } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] handleVoiceNote error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
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
