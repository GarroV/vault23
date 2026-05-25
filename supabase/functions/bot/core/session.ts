import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SessionState } from './types.ts';

export async function loadSession(db: SupabaseClient, userId: string): Promise<SessionState> {
  const { data, error } = await db
    .from('bot_sessions')
    .select('id, state, data')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('[session] session not found, falling back to idle', { userId, error: error?.message });
    return { id: '', state: 'idle', data: {} };
  }

  return {
    id: data.id as string,
    state: data.state as string,
    data: (data.data as Record<string, unknown>) ?? {},
  };
}

export async function saveSession(
  db: SupabaseClient,
  userId: string,
  state: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from('bot_sessions')
    .update({ state, data })
    .eq('user_id', userId);

  if (error) {
    console.error('[session] failed to save session', { userId, error: error.message });
  }
}

export async function clearSession(db: SupabaseClient, userId: string): Promise<void> {
  await saveSession(db, userId, 'idle', {});
}
