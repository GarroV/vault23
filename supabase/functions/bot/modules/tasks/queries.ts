import type { SupabaseClient } from '../../core/types.ts';

export interface Topic {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  title: string;
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
): Promise<void> {
  const { error } = await db.from('tasks').insert({
    workspace_id: workspaceId,
    title,
    topic_id: topicId,
    status: 'open',
  });

  if (error) throw new Error(`createTask: ${error.message}`);
}

export async function getOpenTasks(db: SupabaseClient, workspaceId: string): Promise<Task[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title')
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

export interface TaskDue {
  id: string;
  title: string;
  due_at: string;
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
