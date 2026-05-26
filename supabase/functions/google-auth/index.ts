/**
 * Google OAuth callback endpoint.
 *
 * Setup required (one-time, via bot /setconfig command):
 *   GOOGLE_CLIENT_ID     — from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET — from Google Cloud Console
 *   TELEGRAM_BOT_TOKEN   — env var only (bootstrapping)
 *
 * Google Cloud Console setup:
 *   - Authorized redirect URI: https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/google-auth
 *   - Scopes: https://www.googleapis.com/auth/calendar.events
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getConfig } from '../bot/core/config.ts';

const REDIRECT_URI = 'https://orrlwzsvrliipcigmzfi.supabase.co/functions/v1/google-auth';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // user_id encoded in state

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return new Response('Config error', { status: 500 });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const [clientId, clientSecret] = await Promise.all([
    getConfig(db, 'GOOGLE_CLIENT_ID'),
    getConfig(db, 'GOOGLE_CLIENT_SECRET'),
  ]);

  if (!clientId || !clientSecret) {
    return new Response('Google OAuth not configured', { status: 500 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    console.error('[google-auth] token exchange failed', await tokenRes.text());
    return new Response('Token exchange failed', { status: 500 });
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const userId = decodeURIComponent(state);

  await db.from('user_integrations').upsert({
    user_id: userId,
    provider: 'google',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: expiresAt,
  }, { onConflict: 'user_id,provider' });

  // Notify user in Telegram
  const telegramId = await getUserTelegramId(db, userId);
  if (telegramId && telegramToken) {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text: '✅ Google Calendar подключён!' }),
    });
  }

  return new Response(
    '<html><body><h2>Google Calendar подключён!</h2><p>Можно вернуться в бот.</p></body></html>',
    { headers: { 'Content-Type': 'text/html' } },
  );
});

async function getUserTelegramId(db: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data } = await db
    .from('auth_methods')
    .select('value')
    .eq('user_id', userId)
    .eq('type', 'telegram')
    .single();
  return (data as { value?: string } | null)?.value ?? null;
}
