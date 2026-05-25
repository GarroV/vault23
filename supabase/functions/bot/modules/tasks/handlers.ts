import type { BotContext, ModuleResult } from '../../core/types.ts';
import { getVisibleTopics, createTask, getOpenTasks, updateTaskStatus } from './queries.ts';

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

    if (topics.length <= 1) {
      const topicId = topics[0]?.id;
      if (!topicId) {
        console.error('[tasks] no topics found', { userId: ctx.user.id });
        await ctx.reply(ctx.t('error_unexpected'));
        return { ok: false, clearSession: true };
      }
      await createTask(ctx.db, ctx.user.workspaceId, title, topicId);
      await ctx.reply(ctx.t('task_created', { title }));
      return { ok: true, clearSession: true };
    }

    const buttons = topics.map(topic => [{ text: topic.name, callbackData: `task_topic:${topic.id}` }]);
    await ctx.replyWithButtons(ctx.t('task_choose_topic'), buttons);
    return { ok: true, session: { state: 'task_awaiting_topic', data: { title } } };
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

  if (!topicId || !title) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    await createTask(ctx.db, ctx.user.workspaceId, title, topicId);
    await ctx.reply(ctx.t('task_created', { title }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleTopicSelection error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleTaskListCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const tasks = await getOpenTasks(ctx.db, ctx.user.workspaceId);

    if (tasks.length === 0) {
      await ctx.reply(ctx.t('tasks_empty'));
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
    console.error('[tasks] handleTaskListCommand error', { error: message, userId: ctx.user.id });
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
    const updated = await updateTaskStatus(ctx.db, ctx.user.workspaceId, taskId, status);
    if (!updated) {
      await ctx.reply(ctx.t('task_not_found'));
      return { ok: false, clearSession: true };
    }
    await ctx.reply(ctx.t(confirmKey));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tasks] handleStatusChange error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
