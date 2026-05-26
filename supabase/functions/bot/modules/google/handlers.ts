import type { BotContext, ModuleResult } from '../../core/types.ts';
import {
  getGoogleIntegration,
  updateGoogleTokens,
  getTasksToSync,
  setTaskCalendarEventId,
  saveWebhookChannel,
} from './queries.ts';
import {
  refreshAccessToken,
  createCalendarEvent,
  registerWatchChannel,
  getInitialSyncToken,
} from './calendar.ts';

const WEBHOOK_URL = 'https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/calendar-webhook';

const REDIRECT_URI = 'https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/google-auth';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

function buildOAuthUrl(clientId: string, userId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: encodeURIComponent(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleConnectCommand(ctx: BotContext): Promise<ModuleResult> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';

  if (!clientId) {
    console.error('[google] GOOGLE_CLIENT_ID not set');
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  const integration = await getGoogleIntegration(ctx.db, ctx.user.id);
  if (integration) {
    await ctx.reply(ctx.t('google_already_connected'));
    return { ok: true, clearSession: true };
  }

  const oauthUrl = buildOAuthUrl(clientId, ctx.user.id);
  await ctx.replyWithButtons(ctx.t('google_connect_prompt'), [
    [{ text: ctx.t('google_btn_connect'), url: oauthUrl }],
  ]);
  return { ok: true, clearSession: true };
}

async function resolveValidToken(
  db: BotContext['db'],
  userId: string,
  integration: Awaited<ReturnType<typeof getGoogleIntegration>>,
): Promise<string> {
  if (!integration) throw new Error('no_integration');

  const expiresAt = new Date(integration.expires_at).getTime();
  // Refresh 5 minutes early
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return integration.access_token;
  }

  if (!integration.refresh_token) throw new Error('no_refresh_token');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  if (!clientId || !clientSecret) throw new Error('google_not_configured');

  const refreshed = await refreshAccessToken(clientId, clientSecret, integration.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await updateGoogleTokens(db, userId, refreshed.access_token, newExpiresAt);

  return refreshed.access_token;
}

export async function handleSyncCommand(ctx: BotContext): Promise<ModuleResult> {
  const integration = await getGoogleIntegration(ctx.db, ctx.user.id);
  if (!integration) {
    await ctx.reply(ctx.t('google_not_connected'));
    return { ok: true, clearSession: true };
  }

  let accessToken: string;
  try {
    accessToken = await resolveValidToken(ctx.db, ctx.user.id, integration);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[google] token resolution failed', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('google_token_error'));
    return { ok: false, clearSession: true };
  }

  const tasks = await getTasksToSync(ctx.db, ctx.user.workspaceId);

  if (tasks.length === 0) {
    await ctx.reply(ctx.t('google_sync_nothing'));
    return { ok: true, clearSession: true };
  }

  let synced = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      const eventId = await createCalendarEvent(accessToken, task.id, task.title, task.due_at);
      await setTaskCalendarEventId(ctx.db, ctx.user.workspaceId, task.id, eventId);
      synced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[google] sync task failed', { taskId: task.id, error: message });
      failed++;
    }
  }

  if (failed > 0) {
    await ctx.reply(ctx.t('google_sync_partial', { synced, failed }));
  } else {
    await ctx.reply(ctx.t('google_sync_done', { synced }));
  }

  // Register push notification channel for two-way sync (fire-and-forget)
  registerPushChannel(ctx.db, ctx.user.id, accessToken).catch(err => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[google] push channel registration failed', { error: message, userId: ctx.user.id });
  });

  return { ok: true, clearSession: true };
}

async function registerPushChannel(
  db: BotContext['db'],
  userId: string,
  accessToken: string,
): Promise<void> {
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomUUID(); // used as verification token

  const [channel, syncToken] = await Promise.all([
    registerWatchChannel(accessToken, channelId, WEBHOOK_URL, channelToken),
    getInitialSyncToken(accessToken),
  ]);

  // expiration from Google is milliseconds since epoch as string
  const expiryMs = parseInt(channel.expiration, 10);
  const expiryIso = new Date(expiryMs).toISOString();

  await saveWebhookChannel(db, userId, channelId, expiryIso, syncToken);
}
