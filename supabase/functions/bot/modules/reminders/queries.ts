import type { SupabaseClient } from '../../core/types.ts';

export async function createReminder(
  db: SupabaseClient,
  workspaceId: string,
  userId: string,
  message: string,
  remindAt: Date,
  taskId?: string,
): Promise<void> {
  const { error } = await db.from('reminders').insert({
    workspace_id: workspaceId,
    user_id: userId,
    message,
    remind_at: remindAt.toISOString(),
    status: 'pending',
    ...(taskId ? { task_id: taskId } : {}),
  });

  if (error) throw new Error(`createReminder: ${error.message}`);
}

export async function rescheduleTaskReminder(
  db: SupabaseClient,
  workspaceId: string,
  taskId: string,
  newRemindAt: string,
): Promise<void> {
  await db.from('reminders')
    .update({ remind_at: newRemindAt, status: 'pending' })
    .eq('workspace_id', workspaceId)
    .eq('task_id', taskId)
    .eq('status', 'pending');
  // no throw — task may not have a linked reminder
}
