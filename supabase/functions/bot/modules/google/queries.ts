import type { SupabaseClient } from '../../core/types.ts';

export interface GoogleIntegration {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
}

export interface TaskToSync {
  id: string;
  title: string;
  due_at: string;
}

export async function getGoogleIntegration(
  db: SupabaseClient,
  userId: string,
): Promise<GoogleIntegration | null> {
  const { data, error } = await db
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !data) return null;
  return data as GoogleIntegration;
}

export async function updateGoogleTokens(
  db: SupabaseClient,
  userId: string,
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  await db
    .from('user_integrations')
    .update({ access_token: accessToken, expires_at: expiresAt })
    .eq('user_id', userId)
    .eq('provider', 'google');
}

export async function getTasksToSync(
  db: SupabaseClient,
  workspaceId: string,
): Promise<TaskToSync[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title, due_at')
    .eq('workspace_id', workspaceId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .not('due_at', 'is', null)
    .is('google_calendar_event_id', null)
    .order('due_at', { ascending: true })
    .limit(50);

  if (error) throw new Error(`getTasksToSync: ${error.message}`);
  return (data ?? []) as TaskToSync[];
}

export async function setTaskCalendarEventId(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
  eventId: string,
): Promise<void> {
  await db
    .from('tasks')
    .update({ google_calendar_event_id: eventId })
    .eq('workspace_id', workspaceId)
    .eq('id', taskId);
}
