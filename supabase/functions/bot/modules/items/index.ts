import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import {
  handleAddCommand,
  handleItemContentInput,
  handleListCommand,
  handleTodayCommand,
  handleItemDone,
  handleItemEdit,
  handleItemEditField,
  handleItemEditInput,
  handleItemClearDue,
  handleItemDelete,
} from './handlers.ts';

registerLocale(ru, en);

export class ItemsModule implements BotModule {
  readonly name = 'items';
  readonly commands = ['/add', '/list', '/today'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    if (session.state === 'item_awaiting_content' || session.state === 'item_awaiting_edit_value') return true;
    if (event.type === 'callback_query') {
      const d = event.callbackData ?? '';
      return (
        d.startsWith('item_done:') ||
        d.startsWith('item_edit:') ||
        d.startsWith('item_edit_field:') ||
        d.startsWith('item_clear_due:') ||
        d.startsWith('item_delete:')
      );
    }
    return false;
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    const cmd = event.command;

    if (cmd === '/add')   return handleAddCommand(ctx);
    if (cmd === '/list')  return handleListCommand(ctx);
    if (cmd === '/today') return handleTodayCommand(ctx);

    if (event.type === 'callback_query') {
      const d = event.callbackData ?? '';
      if (d.startsWith('item_done:'))       return handleItemDone(ctx);
      if (d.startsWith('item_edit_field:')) return handleItemEditField(ctx);
      if (d.startsWith('item_edit:'))       return handleItemEdit(ctx);
      if (d.startsWith('item_clear_due:'))  return handleItemClearDue(ctx);
      if (d.startsWith('item_delete:'))     return handleItemDelete(ctx);
    }

    if (session.state === 'item_awaiting_content' && event.type === 'text') {
      return handleItemContentInput(ctx);
    }

    if (session.state === 'item_awaiting_edit_value' && event.type === 'text') {
      return handleItemEditInput(ctx);
    }

    console.error('[items] unhandled state', { state: session.state, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
