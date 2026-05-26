import type { BotContext, ModuleResult } from '../../core/types.ts';
import {
  createItem, listItems, listTodayItems,
  markItemDone, updateItemContent, updateItemDueAt, updateItemAssignee,
  deleteItem, type Item,
} from './queries.ts';
import { parseNaturalLanguage, parseDateTime } from '../../core/nlp.ts';

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatDate(iso: string, lang: 'ru' | 'en'): string {
  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin > 0 && diffMin < 60) {
    return lang === 'ru' ? `через ${diffMin} мин` : `in ${diffMin} min`;
  }
  if (diffMin >= 60 && diffMin < 1440) {
    const h = Math.round(diffMin / 60);
    return lang === 'ru' ? `через ${h} ч` : `in ${h} h`;
  }

  return date.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

function formatItemText(item: Item, lang: 'ru' | 'en'): string {
  const now = new Date();
  const isOverdue = item.due_at && new Date(item.due_at) < now;
  const prefix = item.recurrence ? '🔄 ' : '';
  const overdueFlag = isOverdue ? '⚠️ ' : '';
  let text = `${overdueFlag}${prefix}${item.content}`;
  if (item.due_at) text += `\n📅 ${formatDate(item.due_at, lang)}`;
  if (item.assignee) text += ` → ${item.assignee}`;
  return text;
}

async function replyItemList(ctx: BotContext, items: Item[]): Promise<void> {
  for (const item of items) {
    const text = formatItemText(item, ctx.user.language);
    const buttons: Array<Array<{ text: string; callbackData: string }>> = [[
      { text: ctx.t('btn_done'),   callbackData: `item_done:${item.id}`   },
      { text: ctx.t('btn_edit'),   callbackData: `item_edit:${item.id}`   },
      { text: ctx.t('btn_delete'), callbackData: `item_delete:${item.id}` },
    ]];
    await ctx.replyWithButtons(text, buttons);
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function handleAddCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_item_content'));
  return { ok: true, session: { state: 'item_awaiting_content', data: {} } };
}

export async function handleItemContentInput(ctx: BotContext): Promise<ModuleResult> {
  const text = ctx.event.text?.trim() ?? '';
  if (!text) return { ok: false };

  const nowIso = new Date().toISOString();
  const nlp = await parseNaturalLanguage(ctx.db, text, nowIso);

  let content = text;
  let dueAt: string | null = null;
  let assignee: string | null = null;
  let recurrence = null;

  if (nlp.intent === 'create_item') {
    content   = nlp.content;
    dueAt     = nlp.due_at ?? null;
    assignee  = nlp.assignee ?? null;
    recurrence = nlp.recurrence ?? null;
  }

  if (dueAt && new Date(dueAt) <= new Date()) dueAt = null;

  try {
    await createItem(ctx.db, ctx.user.workspaceId, content, dueAt, assignee, null, null, recurrence);

    const lang = ctx.user.language;
    let confirmKey = 'item_created';
    const params: Record<string, string> = { content };

    if (dueAt) {
      params.date = formatDate(dueAt, lang);
      confirmKey = assignee ? 'item_created_due_assignee' : 'item_created_due';
      if (assignee) params.assignee = assignee;
    }

    await ctx.reply(ctx.t(confirmKey, params));
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[items] handleItemContentInput error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function handleListCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const items = await listItems(ctx.db, ctx.user.workspaceId);
    if (items.length === 0) {
      await ctx.reply(ctx.t('items_empty'));
      return { ok: true, clearSession: true };
    }
    await replyItemList(ctx, items);
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[items] handleListCommand error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleTodayCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const items = await listTodayItems(ctx.db, ctx.user.workspaceId);
    if (items.length === 0) {
      await ctx.reply(ctx.t('items_today_empty'));
      return { ok: true, clearSession: true };
    }
    await replyItemList(ctx, items);
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[items] handleTodayCommand error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

// ─── Done ────────────────────────────────────────────────────────────────────

export async function handleItemDone(ctx: BotContext): Promise<ModuleResult> {
  const itemId = ctx.event.callbackData?.split(':')[1];
  if (!itemId) return { ok: false, clearSession: true };

  try {
    const { rescheduled, nextDueAt } = await markItemDone(ctx.db, ctx.user.workspaceId, itemId);
    if (rescheduled && nextDueAt) {
      await ctx.reply(ctx.t('item_rescheduled', { date: formatDate(nextDueAt, ctx.user.language) }));
    } else {
      await ctx.reply(ctx.t('item_done', { content: '' }));
    }
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[items] handleItemDone error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

// ─── Edit ────────────────────────────────────────────────────────────────────

export async function handleItemEdit(ctx: BotContext): Promise<ModuleResult> {
  const itemId = ctx.event.callbackData?.split(':')[1];
  if (!itemId) return { ok: false, clearSession: true };

  const buttons = [
    [
      { text: ctx.t('btn_edit_content'),  callbackData: `item_edit_field:${itemId}:content`  },
      { text: ctx.t('btn_edit_due'),      callbackData: `item_edit_field:${itemId}:due_at`   },
    ],
    [
      { text: ctx.t('btn_edit_assignee'), callbackData: `item_edit_field:${itemId}:assignee` },
      { text: ctx.t('btn_clear_due'),     callbackData: `item_clear_due:${itemId}`           },
    ],
  ];
  await ctx.replyWithButtons(ctx.t('ask_edit_field'), buttons);
  return { ok: true, clearSession: true };
}

export async function handleItemEditField(ctx: BotContext): Promise<ModuleResult> {
  const parts = ctx.event.callbackData?.split(':') ?? [];
  const itemId = parts[1];
  const field = parts[2] as 'content' | 'due_at' | 'assignee';
  if (!itemId || !field) return { ok: false, clearSession: true };

  const askKey = field === 'content' ? 'ask_new_content'
    : field === 'due_at' ? 'ask_new_due'
    : 'ask_new_assignee';

  await ctx.reply(ctx.t(askKey));
  return { ok: true, session: { state: 'item_awaiting_edit_value', data: { itemId, field } } };
}

export async function handleItemEditInput(ctx: BotContext): Promise<ModuleResult> {
  const value   = ctx.event.text?.trim() ?? '';
  const itemId  = ctx.session.data.itemId as string;
  const field   = ctx.session.data.field as 'content' | 'due_at' | 'assignee';

  if (!value || !itemId || !field) return { ok: false, clearSession: true };

  try {
    if (field === 'content') {
      await updateItemContent(ctx.db, ctx.user.workspaceId, itemId, value);

    } else if (field === 'due_at') {
      const parsed = await parseDateTime(ctx.db, value, new Date().toISOString());
      if (!parsed) {
        await ctx.reply(ctx.t('error_time_parse'));
        return { ok: false };
      }
      await updateItemDueAt(ctx.db, ctx.user.workspaceId, itemId, parsed);

    } else if (field === 'assignee') {
      await updateItemAssignee(ctx.db, ctx.user.workspaceId, itemId, value);
    }

    await ctx.reply(ctx.t('item_updated'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[items] handleItemEditInput error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleItemClearDue(ctx: BotContext): Promise<ModuleResult> {
  const itemId = ctx.event.callbackData?.split(':')[1];
  if (!itemId) return { ok: false, clearSession: true };

  try {
    await updateItemDueAt(ctx.db, ctx.user.workspaceId, itemId, null);
    await ctx.reply(ctx.t('item_updated'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[items] handleItemClearDue error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function handleItemDelete(ctx: BotContext): Promise<ModuleResult> {
  const itemId = ctx.event.callbackData?.split(':')[1];
  if (!itemId) return { ok: false, clearSession: true };

  try {
    await deleteItem(ctx.db, ctx.user.workspaceId, itemId);
    await ctx.reply(ctx.t('item_deleted'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[items] handleItemDelete error', { error: msg, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
