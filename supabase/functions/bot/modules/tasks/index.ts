import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import {
  handleTaskCommand,
  handleTitleInput,
  handleTopicSelection,
  handleTaskListCommand,
  handleStatusChange,
  handleFilterCommand,
  handleTopicFilter,
  handleTodayCommand,
  handleSubtaskInit,
} from './handlers.ts';

registerLocale(ru, en);

export class TasksModule implements BotModule {
  readonly name = 'tasks';
  readonly commands = ['/task', '/tasks', '/filter', '/today'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    if (session.state.startsWith('task_')) return true;
    if (event.type === 'callback_query') {
      return (
        event.callbackData?.startsWith('task_done:') ||
        event.callbackData?.startsWith('task_defer:') ||
        event.callbackData?.startsWith('task_topic:') ||
        event.callbackData?.startsWith('filter_topic:') ||
        event.callbackData?.startsWith('task_subtask:')
      ) ?? false;
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.command === '/tasks') return handleTaskListCommand(ctx);
    if (event.command === '/task') return handleTaskCommand(ctx);
    if (event.command === '/filter') return handleFilterCommand(ctx);
    if (event.command === '/today') return handleTodayCommand(ctx);

    if (event.type === 'callback_query') {
      const data = event.callbackData ?? '';
      if (data.startsWith('task_topic:')) return handleTopicSelection(ctx);
      if (data.startsWith('task_done:') || data.startsWith('task_defer:')) return handleStatusChange(ctx);
      if (data.startsWith('filter_topic:')) return handleTopicFilter(ctx);
      if (data.startsWith('task_subtask:')) return handleSubtaskInit(ctx);
    }

    if (session.state === 'task_awaiting_title' && event.type === 'text') return handleTitleInput(ctx);

    console.error('[tasks] unhandled state', { state: session.state, eventType: event.type, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
