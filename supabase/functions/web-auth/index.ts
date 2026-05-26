/**
 * Telegram Login Widget auth endpoint.
 *
 * POST /web-auth/login  { id, first_name, last_name?, username?, photo_url?, auth_date, hash }
 *   → { token: "<jwt>" }          on success
 *   → { error: "not_registered" } if the Telegram ID is unknown (user hasn't started the bot)
 *   → { error: "invalid" }        if the hash verification fails
 *   → { error: "expired" }        if auth_date is older than 1 hour
 *
 * The JWT is signed with ADMIN_SECRET (HS256, 7-day expiry).
 * Claims: { userId, workspaceId, telegramId, isAdmin, iat, exp }
 *
 * GET /web-auth/public-config
 *   → { botUsername: string }     non-sensitive config for the cabinet SPA
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signJwt } from '../bot/core/jwt.ts';
import { getConfig } from '../bot/core/config.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function verifyTelegramHash(data: Record<string, string>, botToken: string): Promise<boolean> {
  const { hash, ...rest } = data;
  const checkString = Object.entries(rest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken));
  const key = await crypto.subtle.importKey(
    'raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(checkString));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === hash;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/.*\/web-auth/, '') || '/';

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const adminSecret = Deno.env.get('ADMIN_SECRET') ?? '';
  const adminTelegramId = Deno.env.get('ADMIN_TELEGRAM_ID') ?? '';

  if (!supabaseUrl || !serviceKey || !botToken || !adminSecret) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const db = createClient(supabaseUrl, serviceKey);

  // ── GET /public-config ────────────────────────────────────────────────────
  if (path === '/public-config' && req.method === 'GET') {
    const botUsername = await getConfig(db, 'TELEGRAM_BOT_USERNAME');
    return json({ botUsername: botUsername || '' });
  }

  // ── POST /login ──────────────────────────────────────────────────────────
  if (path === '/login' && req.method === 'POST') {
    let data: Record<string, string>;
    try {
      data = await req.json();
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    // Freshness check — Telegram widget data expires after 1 hour
    const authDate = parseInt(data.auth_date ?? '0', 10);
    if (Date.now() / 1000 - authDate > 3600) {
      return json({ error: 'expired' }, 401);
    }

    const valid = await verifyTelegramHash(data, botToken);
    if (!valid) return json({ error: 'invalid' }, 401);

    const telegramId = String(data.id);

    const { data: authRow } = await db
      .from('auth_methods')
      .select('user_id, users(id, workspace_id, is_platform_admin)')
      .eq('type', 'telegram')
      .eq('value', telegramId)
      .maybeSingle();

    if (!authRow) {
      return json({ error: 'not_registered' }, 404);
    }

    type AuthRow = { user_id: string; users: { id: string; workspace_id: string; is_platform_admin: boolean } };
    const row = authRow as unknown as AuthRow;

    const isAdmin = row.users.is_platform_admin || telegramId === adminTelegramId;

    const token = await signJwt({
      userId: row.users.id,
      workspaceId: row.users.workspace_id,
      telegramId,
      isAdmin,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    }, adminSecret);

    return json({ token });
  }

  return json({ error: 'not_found' }, 404);
});
