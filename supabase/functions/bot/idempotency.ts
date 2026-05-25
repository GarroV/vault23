import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function isProcessed(db: SupabaseClient, updateId: number): Promise<boolean> {
  const { data, error } = await db
    .from('processed_updates')
    .select('update_id')
    .eq('update_id', updateId)
    .maybeSingle();

  if (error) {
    console.error('[idempotency] failed to check update_id', { updateId, error: error.message });
    return false;
  }

  return data !== null;
}

export async function markProcessed(db: SupabaseClient, updateId: number): Promise<void> {
  const { error } = await db
    .from('processed_updates')
    .insert({ update_id: updateId });

  if (error) {
    console.error('[idempotency] failed to mark update_id as processed', { updateId, error: error.message });
  }
}
