import type { SupabaseClient } from './types.ts';

export async function trackUsage(
  db: SupabaseClient,
  workspaceId: string,
  operationType: string,
  model: string,
  totalTokens: number,
): Promise<void> {
  const { error } = await db.from('token_usage').insert({
    workspace_id: workspaceId,
    operation_type: operationType,
    model,
    total_tokens: totalTokens,
  });

  if (error) {
    console.error('[usage] failed to track', { error: error.message, workspaceId, operationType });
  }
}
