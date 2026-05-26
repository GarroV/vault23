import type { SupabaseClient } from '../../core/types.ts';

export async function createReminder(
  db: SupabaseClient,
  workspaceId: string,
  userId: string,
  message: string,
  remindAt: Date,
): Promise<void> {
  const { error } = await db.from('reminders').insert({
    workspace_id: workspaceId,
    user_id: userId,
    message,
    remind_at: remindAt.toISOString(),
    status: 'pending',
  });

  if (error) throw new Error(`createReminder: ${error.message}`);
}
