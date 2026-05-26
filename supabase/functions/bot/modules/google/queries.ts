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

export async function getTaskCalendarEventId(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
): Promise<string | null> {
  const { data } = await db
    .from('tasks')
    .select('google_calendar_event_id')
    .eq('workspace_id', workspaceId)
    .eq('id', taskId)
    .single();
  return (data as { google_calendar_event_id?: string } | null)?.google_calendar_event_id ?? null;
}

export async function clearTaskCalendarEventId(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
): Promise<void> {
  await db
    .from('tasks')
    .update({ google_calendar_event_id: null })
    .eq('workspace_id', workspaceId)
    .eq('id', taskId);
}

export async function saveWebhookChannel(
  db: SupabaseClient,
  userId: string,
  channelId: string,
  expiry: string,
  syncToken: string,
): Promise<void> {
  await db
    .from('user_integrations')
    .update({
      google_channel_id: channelId,
      google_channel_expiry: expiry,
      google_sync_token: syncToken,
    })
    .eq('user_id', userId)
    .eq('provider', 'google');
}

export async function saveSyncToken(
  db: SupabaseClient,
  userId: string,
  syncToken: string,
): Promise<void> {
  await db
    .from('user_integrations')
    .update({ google_sync_token: syncToken })
    .eq('user_id', userId)
    .eq('provider', 'google');
}

export interface FullIntegration {
  user_id: string;
  workspace_id?: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  google_sync_token: string | null;
}

export async function getIntegrationByChannelId(
  db: SupabaseClient,
  channelId: string,
): Promise<FullIntegration | null> {
  const { data, error } = await db
    .from('user_integrations')
    .select('user_id, access_token, refresh_token, expires_at, google_sync_token')
    .eq('provider', 'google')
    .eq('google_channel_id', channelId)
    .single();

  if (error || !data) return null;
  return data as FullIntegration;
}

export interface TaskByEventId {
  id: string;
  title: string;
  workspace_id: string;
}

export async function getTaskByCalendarEventId(
  db: SupabaseClient,
  eventId: string,
): Promise<TaskByEventId | null> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title, workspace_id')
    .eq('google_calendar_event_id', eventId)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;
  return data as TaskByEventId;
}

export async function updateTaskFromCalendar(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
  updates: { title?: string; due_at?: string },
): Promise<void> {
  if (Object.keys(updates).length === 0) return;
  await db
    .from('tasks')
    .update(updates)
    .eq('workspace_id', workspaceId)
    .eq('id', taskId)
    .in('status', ['open', 'in_progress']); // don't update completed tasks
}

export async function getUserWorkspaceId(
  db: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await db
    .from('users')
    .select('workspace_id')
    .eq('id', userId)
    .single();
  return (data as { workspace_id?: string } | null)?.workspace_id ?? null;
}
