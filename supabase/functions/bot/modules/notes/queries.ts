import type { SupabaseClient } from '../../core/types.ts';

export interface Note {
  id: string;
  content: string;
  task_id: string | null;
  created_at: string;
}

export interface TaskPick {
  id: string;
  title: string;
}

export async function createNote(
  db: SupabaseClient,
  workspaceId: string,
  content: string,
): Promise<string> {
  const { data, error } = await db
    .from('notes')
    .insert({ workspace_id: workspaceId, content, source: 'text' })
    .select('id')
    .single();

  if (error || !data) throw new Error(`createNote: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function attachNoteToTask(
  db: SupabaseClient,
  workspaceId: string,
  noteId: string,
  taskId: string,
): Promise<void> {
  const { error } = await db
    .from('notes')
    .update({ task_id: taskId })
    .eq('id', noteId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(`attachNoteToTask: ${error.message}`);
}

export async function getRecentNotes(db: SupabaseClient, workspaceId: string): Promise<Note[]> {
  const { data, error } = await db
    .from('notes')
    .select('id, content, task_id, created_at')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(`getRecentNotes: ${error.message}`);
  return (data ?? []) as Note[];
}

export async function createNoteInMeeting(
  db: SupabaseClient,
  workspaceId: string,
  content: string,
  sessionId: string,
): Promise<void> {
  const { error } = await db
    .from('notes')
    .insert({ workspace_id: workspaceId, content, source: 'text', session_id: sessionId });

  if (error) throw new Error(`createNoteInMeeting: ${error.message}`);
}

export async function attachMeetingToTask(
  db: SupabaseClient,
  workspaceId: string,
  sessionId: string,
  taskId: string,
): Promise<void> {
  const { error } = await db
    .from('notes')
    .update({ task_id: taskId })
    .eq('workspace_id', workspaceId)
    .eq('session_id', sessionId)
    .is('deleted_at', null);

  if (error) throw new Error(`attachMeetingToTask: ${error.message}`);
}

export async function deleteNote(
  db: SupabaseClient,
  workspaceId: string,
  noteId: string,
): Promise<void> {
  const { error } = await db
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(`deleteNote: ${error.message}`);
}

export async function getOpenTasksForPicker(db: SupabaseClient, workspaceId: string): Promise<TaskPick[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title')
    .eq('workspace_id', workspaceId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) throw new Error(`getOpenTasksForPicker: ${error.message}`);
  return (data ?? []) as TaskPick[];
}
