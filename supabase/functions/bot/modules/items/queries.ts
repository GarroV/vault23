import type { SupabaseClient } from '../../core/types.ts';

export interface Item {
  id: string;
  content: string;
  assignee: string | null;
  due_at: string | null;
  notified_at: string | null;
  done: boolean;
  recurrence: Recurrence | null;
  topic_id: string | null;
  parent_id: string | null;
  created_at: string;
}

export interface Recurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'interval';
  weekday?: number;
  day?: number;
  days?: number;
}

export function computeNextDueAt(currentIso: string, rec: Recurrence): string {
  const d = new Date(currentIso);
  switch (rec.type) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'interval':
      d.setUTCDate(d.getUTCDate() + (rec.days ?? 1));
      break;
    case 'weekly': {
      const target = rec.weekday ?? 1;
      const diff = ((target - d.getUTCDay()) + 7) % 7 || 7;
      d.setUTCDate(d.getUTCDate() + diff);
      break;
    }
    case 'monthly': {
      const nextMonth = new Date(d);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      nextMonth.setUTCDate(rec.day ?? d.getUTCDate());
      return nextMonth.toISOString();
    }
  }
  return d.toISOString();
}

export async function createItem(
  db: SupabaseClient,
  workspaceId: string,
  content: string,
  dueAt?: string | null,
  assignee?: string | null,
  topicId?: string | null,
  parentId?: string | null,
  recurrence?: Recurrence | null,
): Promise<string> {
  const { data, error } = await db
    .from('items')
    .insert({
      workspace_id: workspaceId,
      content,
      due_at: dueAt ?? null,
      assignee: assignee ?? null,
      topic_id: topicId ?? null,
      parent_id: parentId ?? null,
      recurrence: recurrence ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createItem: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function listItems(db: SupabaseClient, workspaceId: string): Promise<Item[]> {
  const { data, error } = await db
    .from('items')
    .select('id, content, assignee, due_at, notified_at, done, recurrence, topic_id, parent_id, created_at')
    .eq('workspace_id', workspaceId)
    .eq('done', false)
    .is('deleted_at', null)
    .is('parent_id', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) throw new Error(`listItems: ${error.message}`);
  return (data ?? []) as Item[];
}

export async function listTodayItems(db: SupabaseClient, workspaceId: string): Promise<Item[]> {
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  const { data, error } = await db
    .from('items')
    .select('id, content, assignee, due_at, notified_at, done, recurrence, topic_id, parent_id, created_at')
    .eq('workspace_id', workspaceId)
    .eq('done', false)
    .is('deleted_at', null)
    .lte('due_at', todayEnd.toISOString())
    .order('due_at', { ascending: true });
  if (error) throw new Error(`listTodayItems: ${error.message}`);
  return (data ?? []) as Item[];
}

export async function markItemDone(
  db: SupabaseClient,
  workspaceId: string,
  itemId: string,
): Promise<{ rescheduled: boolean; nextDueAt: string | null }> {
  const { data, error } = await db
    .from('items')
    .select('recurrence, due_at')
    .eq('id', itemId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !data) throw new Error(`markItemDone fetch: ${error?.message}`);

  const row = data as { recurrence: Recurrence | null; due_at: string | null };

  if (row.recurrence && row.due_at) {
    const nextDueAt = computeNextDueAt(row.due_at, row.recurrence);
    await db.from('items').update({ due_at: nextDueAt, notified_at: null }).eq('id', itemId);
    return { rescheduled: true, nextDueAt };
  }

  await db.from('items').update({ done: true }).eq('id', itemId);
  return { rescheduled: false, nextDueAt: null };
}

export async function updateItemContent(
  db: SupabaseClient,
  workspaceId: string,
  itemId: string,
  content: string,
): Promise<void> {
  const { error } = await db
    .from('items')
    .update({ content })
    .eq('id', itemId)
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`updateItemContent: ${error.message}`);
}

export async function updateItemDueAt(
  db: SupabaseClient,
  workspaceId: string,
  itemId: string,
  dueAt: string | null,
): Promise<void> {
  const { error } = await db
    .from('items')
    .update({ due_at: dueAt, notified_at: null })
    .eq('id', itemId)
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`updateItemDueAt: ${error.message}`);
}

export async function updateItemAssignee(
  db: SupabaseClient,
  workspaceId: string,
  itemId: string,
  assignee: string | null,
): Promise<void> {
  const { error } = await db
    .from('items')
    .update({ assignee })
    .eq('id', itemId)
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`updateItemAssignee: ${error.message}`);
}

export async function deleteItem(
  db: SupabaseClient,
  workspaceId: string,
  itemId: string,
): Promise<void> {
  const { error } = await db
    .from('items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`deleteItem: ${error.message}`);
}

export async function searchItems(
  db: SupabaseClient,
  workspaceId: string,
  query: string,
): Promise<Item[]> {
  const { data, error } = await db
    .from('items')
    .select('id, content, assignee, due_at, notified_at, done, recurrence, topic_id, parent_id, created_at')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .ilike('content', `%${query}%`)
    .limit(10);
  if (error) throw new Error(`searchItems: ${error.message}`);
  return (data ?? []) as Item[];
}
