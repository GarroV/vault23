const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface RefreshResult {
  access_token: string;
  expires_in: number;
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<RefreshResult> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  return await res.json() as RefreshResult;
}

export async function createCalendarEvent(
  accessToken: string,
  taskId: string,
  title: string,
  dueAt: string,
): Promise<string> {
  const start = new Date(dueAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour

  const body = {
    summary: title,
    description: `Task ID: ${taskId}`,
    start: { dateTime: start.toISOString(), timeZone: 'UTC' },
    end: { dateTime: end.toISOString(), timeZone: 'UTC' },
    extendedProperties: { private: { vault23_task_id: taskId } },
  };

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`createCalendarEvent failed (${res.status}): ${err}`);
  }

  const event = await res.json() as { id: string };
  return event.id;
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  await fetch(`${CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  title: string,
  dueAt: string,
): Promise<void> {
  const start = new Date(dueAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  await fetch(`${CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: title,
      start: { dateTime: start.toISOString(), timeZone: 'UTC' },
      end: { dateTime: end.toISOString(), timeZone: 'UTC' },
    }),
  });
}

export interface ChannelRegistration {
  channelId: string;
  expiration: string;
}

export async function registerWatchChannel(
  accessToken: string,
  channelId: string,
  webhookUrl: string,
  channelToken: string,
): Promise<ChannelRegistration> {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events/watch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: channelToken,
      params: { ttl: '86400' }, // 24h in seconds
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`registerWatchChannel failed (${res.status}): ${err}`);
  }

  const data = await res.json() as { id: string; expiration: string };
  return { channelId: data.id, expiration: data.expiration };
}

export interface CalendarEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  start?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export interface EventListResult {
  items: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

export async function listChangedEvents(
  accessToken: string,
  syncToken: string,
): Promise<EventListResult> {
  const params = new URLSearchParams({
    syncToken,
    singleEvents: 'true',
    showDeleted: 'true',
  });

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 410) {
    // Gone — sync token invalid, caller must do full re-sync
    throw new Error('SYNC_TOKEN_INVALID');
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`listChangedEvents failed (${res.status}): ${err}`);
  }

  return await res.json() as EventListResult;
}

export async function getInitialSyncToken(accessToken: string): Promise<string> {
  const params = new URLSearchParams({ maxResults: '1', singleEvents: 'true' });
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`getInitialSyncToken failed (${res.status})`);
  const data = await res.json() as EventListResult;
  return data.nextSyncToken ?? '';
}
