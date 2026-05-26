import type { SupabaseClient } from '../../core/types.ts';

export interface Topic {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  title: string;
  recurrence?: Recurrence | null;
}

export interface TaskDue {
  id: string;
  title: string;
  due_at: string;
}

export interface TaskFull {
  id: string;
  title: string;
  due_at: string | null;
  recurrence: Recurrence | null;
}

export interface Recurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'interval';
  weekday?: number; // 0=Sun … 6=Sat
  day?: number;     // 1–31 for monthly
  days?: number;    // interval length
}

export function computeNextDueAt(currentIso: string, rec: Recurrence): string {
  const d = new Date(currentIso);
  switch (rec.type) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'weekly': {
      const target = rec.weekday ?? 1;
      let diff = target - d.getUTCDay();
      if (diff <= 0) diff += 7;
      d.setUTCDate(d.getUTCDate() + diff);
      break;
    }
    case 'monthly': {
      const targetDay = rec.day ?? 1;
      d.setUTCMonth(d.getUTCMonth() + 1);
      const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(targetDay, daysInMonth));
      break;
    }
    case 'interval':
      d.setUTCDate(d.getUTCDate() + (rec.days ?? 30));
      break;
  }
  return d.toISOString();
}

export async function getVisibleTopics(db: SupabaseClient, workspaceId: string): Promise<Topic[]> {
  const { data, error } = await db
    .from('topics')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('visible', true);

  if (error) throw new Error(`getVisibleTopics: ${error.message}`);
  return (data ?? []) as Topic[];
}

export async function createTask(
  db: SupabaseClient,
  workspaceId: string,
  title: string,
  topicId: string,
  parentTaskId?: string,
  dueAt?: string | null,
  recurrence?: Recurrence | null,
): Promise<string> {
  const { data, error } = await db.from('tasks').insert({
    workspace_id: workspaceId,
    title,
    topic_id: topicId,
    status: 'open',
    ...(parentTaskId ? { parent_task_id: parentTaskId } : {}),
    ...(dueAt ? { due_at: dueAt } : {}),
    ...(recurrence ? { recurrence } : {}),
  }).select('id').single();

  if (error || !data) throw new Error(`createTask: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function getTaskFull(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
): Promise<TaskFull | null> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title, due_at, recurrence')
    .eq('workspace_id', workspaceId)
    .eq('id', taskId)
    .single();

  if (error) return null;
  return data as TaskFull;
}

export async function getOpenTasks(db: SupabaseClient, workspaceId: string): Promise<Task[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title, recurrence')
    .eq('workspace_id', workspaceId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(`getOpenTasks: ${error.message}`);
  return (data ?? []) as Task[];
}

export async function getTaskById(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
): Promise<Task | null> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title')
    .eq('workspace_id', workspaceId)
    .eq('id', taskId)
    .single();

  if (error) return null;
  return data as Task;
}

export async function updateTaskStatus(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
  status: 'done' | 'deferred',
): Promise<boolean> {
  const { error } = await db
    .from('tasks')
    .update({ status })
    .eq('workspace_id', workspaceId)
    .eq('id', taskId);

  return !error;
}

export async function rescheduleTask(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
  newDueAt: string,
): Promise<void> {
  const { error } = await db
    .from('tasks')
    .update({ status: 'open', due_at: newDueAt })
    .eq('workspace_id', workspaceId)
    .eq('id', taskId);

  if (error) throw new Error(`rescheduleTask: ${error.message}`);
}

export async function getTasksByTopic(
  db: SupabaseClient,
  workspaceId: string,
  topicId: string,
): Promise<Task[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title')
    .eq('workspace_id', workspaceId)
    .eq('topic_id', topicId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(`getTasksByTopic: ${error.message}`);
  return (data ?? []) as Task[];
}

export async function getTasksDueOrOverdue(
  db: SupabaseClient,
  workspaceId: string,
): Promise<TaskDue[]> {
  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);

  const { data, error } = await db
    .from('tasks')
    .select('id, title, due_at')
    .eq('workspace_id', workspaceId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .not('due_at', 'is', null)
    .lte('due_at', endOfToday.toISOString())
    .order('due_at', { ascending: true });

  if (error) throw new Error(`getTasksDueOrOverdue: ${error.message}`);
  return (data ?? []) as TaskDue[];
}
