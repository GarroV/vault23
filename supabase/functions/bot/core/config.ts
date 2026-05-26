import type { SupabaseClient } from './types.ts';

/**
 * Keys that can be configured via /setconfig.
 *
 * NEVER allow: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Those are bootstrapping credentials — if stored in DB they create circular dependency
 * and exposing them would give full database access.
 */
export const CONFIGURABLE_KEYS = new Set([
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM_ADDRESS',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_SOLO',
  'STRIPE_PRICE_TEAM',
  'STRIPE_WEBHOOK_SECRET',
  'OPENAI_API_KEY',
  'ADMIN_SECRET',
]);

const FORBIDDEN_KEYS = new Set([
  'TELEGRAM_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_DB_URL',
]);

/**
 * Read a config value: DB app_settings first, then env var fallback.
 */
export async function getConfig(db: SupabaseClient, key: string): Promise<string> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (data) return (data as { value: string }).value;
  return Deno.env.get(key) ?? '';
}

export async function setConfig(
  db: SupabaseClient,
  key: string,
  value: string,
  updatedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  if (FORBIDDEN_KEYS.has(key)) {
    return { ok: false, error: 'forbidden_key' };
  }
  if (!CONFIGURABLE_KEYS.has(key)) {
    return { ok: false, error: 'unknown_key' };
  }

  await db.from('app_settings').upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: updatedBy },
    { onConflict: 'key' },
  );
  return { ok: true };
}

export async function listConfigs(
  db: SupabaseClient,
): Promise<Array<{ key: string; updated_at: string; set: boolean }>> {
  const { data } = await db
    .from('app_settings')
    .select('key, updated_at')
    .order('key');

  const setKeys = new Set(((data ?? []) as Array<{ key: string; updated_at: string }>).map(r => r.key));
  const updatedAt = Object.fromEntries(
    ((data ?? []) as Array<{ key: string; updated_at: string }>).map(r => [r.key, r.updated_at]),
  );

  return Array.from(CONFIGURABLE_KEYS).sort().map(key => ({
    key,
    updated_at: updatedAt[key] ?? '',
    set: setKeys.has(key) || !!Deno.env.get(key),
  }));
}

/** Masks all but the last 4 chars: sk_live_****abcd */
export function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return '*'.repeat(Math.min(value.length - 4, 12)) + value.slice(-4);
}

/**
 * Admin check: DB flag OR ADMIN_TELEGRAM_ID env var fallback.
 * The env var is the irrevocable owner override — useful for recovery
 * if DB state is corrupted. Telegram ID is not a secret (it's a public user ID).
 */
export async function isPlatformAdmin(
  db: SupabaseClient,
  userId: string,
  telegramId: string,
): Promise<boolean> {
  // Env var override (recovery path, doesn't require DB)
  const adminTelegramId = Deno.env.get('ADMIN_TELEGRAM_ID') ?? '';
  if (adminTelegramId && telegramId === adminTelegramId) return true;

  // DB flag
  const { data } = await db
    .from('users')
    .select('is_platform_admin')
    .eq('id', userId)
    .single();
  return (data as { is_platform_admin?: boolean } | null)?.is_platform_admin === true;
}
