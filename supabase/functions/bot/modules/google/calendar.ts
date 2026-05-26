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
