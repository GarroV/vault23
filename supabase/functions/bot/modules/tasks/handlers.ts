import type { BotContext, ModuleResult } from '../../core/types.ts';
import { getConfig } from '../../core/config.ts';
import {
  getVisibleTopics,
  createTask,
  getOpenTasks,
  updateTaskStatus,
  getTasksByTopic,
  getTasksDueOrOverdue,
} from './queries.ts';
import {
  getTaskCalendarEventId,
  clearTaskCalendarEventId,
  getGoogleIntegration,
  updateGoogleTokens,
} from '../google/queries.ts';
import { refreshAccessToken, deleteCalendarEvent } from '../google/calendar.ts';

export async function handleTaskCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_task_title'));
  return { ok: true, session: { state: 'task_awaiting_title', data: {} } };
}

export async function handleTitleInput(ctx: BotContext): Promise<ModuleResult> {
  const title = ctx.event.text?.trim() ?? '';
  if (!title) {
    await ctx.reply(ctx.t('error_empty_title'));
    return { ok: false };
  }

  try {
    const topics = await getVisibleTopics(ctx.db, ctx.user.workspaceId);

    const parentTaskId = ctx.session.data.parentTaskId as string | undefined;

    if (topics.length <= 1) {
      const topicId = topics[0]?.id;
      if (!topicId) {
        console.error('[tasks] no topics found', { userId: ctx.user.id });
        await ctx.reply(ctx.t('error_unexpected'));
        return { ok: false, clearSession: true };
      }
      await createTask(ctx.db, ctx.user.workspaceId, title, topicId, parentTaskId);
      await ctx.reply(ctx.t('task_created', { title }));
      return { ok: true, clearSession: true };
    }

    const buttons = topics.map(topic => [{ text: topic.name, callbackData: `task_topic:${topic.id}` }]);
    await ctx.replyWithButtons(ctx.t('task_choose_topic'), buttons);
    return { ok: true, session: { state: 'task_awaiting_topic', data: { title, parentTaskId } } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleTitleInput error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleTopicSelection(ctx: BotContext): Promise<ModuleResult> {
  const topicId = ctx.event.callbackData?.split(':')[1];
  const title = ctx.session.data.title as string | undefined;
  const parentTaskId = ctx.session.data.parentTaskId as string | undefined;

  if (!topicId || !title) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    await createTask(ctx.db, ctx.user.workspaceId, title, topicId, parentTaskId);
    await ctx.reply(ctx.t('task_created', { title }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleTopicSelection error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleSubtaskInit(ctx: BotContext): Promise<ModuleResult> {
  const subtaskGate = ctx.gate('subtask_create');
  if (!subtaskGate.allowed) {
    await ctx.reply(ctx.t('gate_plan_limit'));
    return { ok: false, clearSession: true };
  }

  const parentTaskId = ctx.event.callbackData?.split(':')[1];
  if (!parentTaskId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
  await ctx.reply(ctx.t('ask_task_title'));
  return { ok: true, session: { state: 'task_awaiting_title', data: { parentTaskId } } };
}

export async function handleTaskListCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const tasks = await getOpenTasks(ctx.db, ctx.user.workspaceId);

    if (tasks.length === 0) {
      await ctx.reply(ctx.t('tasks_empty'));
      return { ok: true, clearSession: true };
    }

    for (const task of tasks) {
      await ctx.replyWithButtons(task.title, [
        [
          { text: ctx.t('task_btn_done'), callbackData: `task_done:${task.id}` },
          { text: ctx.t('task_btn_defer'), callbackData: `task_defer:${task.id}` },
        ],
        [{ text: ctx.t('task_btn_subtask'), callbackData: `task_subtask:${task.id}` }],
      ]);
    }

    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleTaskListCommand error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleFilterCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const topics = await getVisibleTopics(ctx.db, ctx.user.workspaceId);
    const buttons = topics.map(t => [{ text: t.name, callbackData: `filter_topic:${t.id}` }]);
    await ctx.replyWithButtons(ctx.t('filter_choose_topic'), buttons);
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleFilterCommand error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleTopicFilter(ctx: BotContext): Promise<ModuleResult> {
  const topicId = ctx.event.callbackData?.split(':')[1];
  if (!topicId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    const tasks = await getTasksByTopic(ctx.db, ctx.user.workspaceId, topicId);
    if (tasks.length === 0) {
      await ctx.reply(ctx.t('filter_topic_empty'));
      return { ok: true, clearSession: true };
    }
    for (const task of tasks) {
      await ctx.replyWithButtons(task.title, [[
        { text: ctx.t('task_btn_done'), callbackData: `task_done:${task.id}` },
        { text: ctx.t('task_btn_defer'), callbackData: `task_defer:${task.id}` },
      ]]);
    }
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleTopicFilter error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleTodayCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const tasks = await getTasksDueOrOverdue(ctx.db, ctx.user.workspaceId);
    if (tasks.length === 0) {
      await ctx.reply(ctx.t('today_empty'));
      return { ok: true, clearSession: true };
    }
    const now = new Date();
    for (const task of tasks) {
      const due = new Date(task.due_at);
      const isOverdue = due < now;
      const dateStr = due.toLocaleDateString(ctx.user.language === 'ru' ? 'ru-RU' : 'en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      const text = `${task.title}\n${isOverdue ? '⚠️' : '📅'} ${dateStr}`;
      await ctx.replyWithButtons(text, [[
        { text: ctx.t('task_btn_done'), callbackData: `task_done:${task.id}` },
        { text: ctx.t('task_btn_defer'), callbackData: `task_defer:${task.id}` },
      ]]);
    }
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleTodayCommand error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleStatusChange(ctx: BotContext): Promise<ModuleResult> {
  const callbackData = ctx.event.callbackData ?? '';
  const [action, taskId] = callbackData.split(':');

  if (!taskId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  const status = action === 'task_done' ? 'done' : 'deferred';
  const confirmKey = status === 'done' ? 'task_done_confirm' : 'task_deferred_confirm';

  try {
    // Get calendar event ID before update (fire-and-forget cleanup after)
    const calEventId = await getTaskCalendarEventId(ctx.db, ctx.user.workspaceId, taskId).catch(() => null);

    const updated = await updateTaskStatus(ctx.db, ctx.user.workspaceId, taskId, status);
    if (!updated) {
      await ctx.reply(ctx.t('task_not_found'));
      return { ok: false, clearSession: true };
    }
    await ctx.reply(ctx.t(confirmKey));

    // Remove from Google Calendar (fire-and-forget)
    if (calEventId) {
      deleteTaskFromCalendar(ctx.db, ctx.user.id, ctx.user.workspaceId, taskId, calEventId).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[tasks] calendar cleanup failed', { error: message, taskId });
      });
    }

    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleStatusChange error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

async function deleteTaskFromCalendar(
  db: BotContext['db'],
  userId: string,
  workspaceId: string,
  taskId: string,
  calEventId: string,
): Promise<void> {
  const integration = await getGoogleIntegration(db, userId);
  if (!integration) return;

  let accessToken = integration.access_token;
  const expiresAt = new Date(integration.expires_at).getTime();

  if (Date.now() >= expiresAt - 5 * 60 * 1000 && integration.refresh_token) {
    const [clientId, clientSecret] = await Promise.all([
      getConfig(db, 'GOOGLE_CLIENT_ID'),
      getConfig(db, 'GOOGLE_CLIENT_SECRET'),
    ]);
    if (clientId && clientSecret) {
      const refreshed = await refreshAccessToken(clientId, clientSecret, integration.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await updateGoogleTokens(db, userId, accessToken, newExpiry);
    }
  }

  await deleteCalendarEvent(accessToken, calEventId);
  await clearTaskCalendarEventId(db, workspaceId, taskId);
}
