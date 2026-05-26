/**
 * Google Calendar push notification receiver.
 * Google calls this URL whenever the user's primary calendar changes.
 *
 * Headers we inspect:
 *   X-Goog-Channel-Id     — our channel UUID, maps to user in user_integrations
 *   X-Goog-Resource-State — 'sync' (handshake), 'exists' (changed), 'not_exists' (deleted)
 *
 * On 'exists':
 *   1. Look up user by channelId in user_integrations
 *   2. Refresh token if needed
 *   3. listChangedEvents(syncToken) → process diffs → update tasks
 *   4. Persist new syncToken
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getConfig } from '../bot/core/config.ts';
import {
  getIntegrationByChannelId,
  updateGoogleTokens,
  saveSyncToken,
  getTaskByCalendarEventId,
  updateTaskFromCalendar,
  getUserWorkspaceId,
} from '../bot/modules/google/queries.ts';
import {
  refreshAccessToken,
  listChangedEvents,
  getInitialSyncToken,
  type CalendarEvent,
} from '../bot/modules/google/calendar.ts';

Deno.serve(async (req: Request) => {
  const resourceState = req.headers.get('X-Goog-Resource-State') ?? '';
  const channelId = req.headers.get('X-Goog-Channel-Id') ?? '';

  // Google sends 'sync' as initial handshake — acknowledge and return
  if (resourceState === 'sync') {
    return new Response('OK', { status: 200 });
  }

  if (resourceState !== 'exists' || !channelId) {
    return new Response('OK', { status: 200 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) {
    console.error('[calendar-webhook] missing env vars');
    return new Response('OK', { status: 200 });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const [clientId, clientSecret] = await Promise.all([
    getConfig(db, 'GOOGLE_CLIENT_ID'),
    getConfig(db, 'GOOGLE_CLIENT_SECRET'),
  ]);

  if (!clientId || !clientSecret) {
    console.error('[calendar-webhook] Google credentials not configured');
    return new Response('OK', { status: 200 });
  }

  // Identify user by channelId
  const integration = await getIntegrationByChannelId(db, channelId);
  if (!integration) {
    console.warn('[calendar-webhook] unknown channelId', { channelId });
    return new Response('OK', { status: 200 });
  }

  // Resolve valid access token
  let accessToken = integration.access_token;
  const expiresAt = new Date(integration.expires_at).getTime();
  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    if (!integration.refresh_token) {
      console.error('[calendar-webhook] no refresh token', { userId: integration.user_id });
      return new Response('OK', { status: 200 });
    }
    try {
      const refreshed = await refreshAccessToken(clientId, clientSecret, integration.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await updateGoogleTokens(db, integration.user_id, accessToken, newExpiresAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[calendar-webhook] token refresh failed', { error: message, userId: integration.user_id });
      return new Response('OK', { status: 200 });
    }
  }

  // Fetch changed events incrementally
  let syncToken = integration.google_sync_token ?? '';
  let events: CalendarEvent[] = [];
  let newSyncToken = syncToken;

  try {
    if (!syncToken) {
      // No sync token yet — get one (happens if channel was registered before sync)
      newSyncToken = await getInitialSyncToken(accessToken);
    } else {
      const result = await listChangedEvents(accessToken, syncToken);
      events = result.items ?? [];
      newSyncToken = result.nextSyncToken ?? syncToken;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'SYNC_TOKEN_INVALID') {
      // Full re-sync needed — just get a new sync token and continue
      try {
        newSyncToken = await getInitialSyncToken(accessToken);
        console.log('[calendar-webhook] sync token expired, reset', { userId: integration.user_id });
      } catch (innerErr) {
        const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error('[calendar-webhook] could not reset sync token', { error: innerMsg });
      }
    } else {
      console.error('[calendar-webhook] listChangedEvents failed', { error: message, userId: integration.user_id });
    }
    // Save whatever new sync token we have
    if (newSyncToken !== syncToken) {
      await saveSyncToken(db, integration.user_id, newSyncToken);
    }
    return new Response('OK', { status: 200 });
  }

  // Get user's workspace
  const workspaceId = await getUserWorkspaceId(db, integration.user_id);
  if (!workspaceId) {
    console.error('[calendar-webhook] workspace not found', { userId: integration.user_id });
    await saveSyncToken(db, integration.user_id, newSyncToken);
    return new Response('OK', { status: 200 });
  }

  // Process each changed event
  for (const event of events) {
    const taskId = event.extendedProperties?.private?.vault23_task_id;
    if (!taskId) continue; // not our event

    const task = await getTaskByCalendarEventId(db, event.id);
    if (!task || task.workspace_id !== workspaceId) continue;

    if (event.status === 'cancelled') {
      // Event deleted in Calendar — mark task deferred
      await updateTaskFromCalendar(db, workspaceId, task.id, {});
      console.log('[calendar-webhook] event cancelled, leaving task open', { taskId: task.id });
      continue;
    }

    const updates: { title?: string; due_at?: string } = {};

    if (event.summary && event.summary !== task.title) {
      updates.title = event.summary;
    }

    const eventStart = event.start?.dateTime ?? event.start?.date;
    if (eventStart) {
      updates.due_at = new Date(eventStart).toISOString();
    }

    if (Object.keys(updates).length > 0) {
      await updateTaskFromCalendar(db, workspaceId, task.id, updates);
      console.log('[calendar-webhook] task updated from calendar', { taskId: task.id, updates });
    }
  }

  // Persist new sync token
  if (newSyncToken && newSyncToken !== syncToken) {
    await saveSyncToken(db, integration.user_id, newSyncToken);
  }

  return new Response('OK', { status: 200 });
});
