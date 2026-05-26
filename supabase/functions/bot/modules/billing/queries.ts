import type { SupabaseClient } from '../../core/types.ts';

function currentPeriodStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function ensureUsageRow(db: SupabaseClient, workspaceId: string): Promise<void> {
  const period = currentPeriodStart();
  await db.from('monthly_usage').upsert(
    { workspace_id: workspaceId, period_start: period },
    { onConflict: 'workspace_id,period_start', ignoreDuplicates: true },
  );
}

export async function incrementVoiceUsage(db: SupabaseClient, workspaceId: string): Promise<number> {
  const period = currentPeriodStart();
  await ensureUsageRow(db, workspaceId);

  const { data } = await db.rpc('increment_usage', {
    p_workspace_id: workspaceId,
    p_period: period,
    p_column: 'voice_count',
  });

  return (data as number) ?? 0;
}

export async function incrementEmailUsage(db: SupabaseClient, workspaceId: string): Promise<number> {
  const period = currentPeriodStart();
  await ensureUsageRow(db, workspaceId);

  const { data } = await db.rpc('increment_usage', {
    p_workspace_id: workspaceId,
    p_period: period,
    p_column: 'email_count',
  });

  return (data as number) ?? 0;
}

export async function getMonthlyUsage(
  db: SupabaseClient,
  workspaceId: string,
): Promise<{ voiceCount: number; emailCount: number }> {
  const period = currentPeriodStart();
  const { data } = await db
    .from('monthly_usage')
    .select('voice_count, email_count')
    .eq('workspace_id', workspaceId)
    .eq('period_start', period)
    .single();

  return {
    voiceCount: (data as { voice_count: number } | null)?.voice_count ?? 0,
    emailCount: (data as { email_count: number } | null)?.email_count ?? 0,
  };
}

export async function countOpenTasks(db: SupabaseClient, workspaceId: string): Promise<number> {
  const { count } = await db
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null);

  return count ?? 0;
}

export async function countKbEntries(db: SupabaseClient, workspaceId: string): Promise<number> {
  const { count } = await db
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  return count ?? 0;
}

export async function getWorkspaceByStripeCustomer(
  db: SupabaseClient,
  stripeCustomerId: string,
): Promise<{ id: string; status: string; plan: string } | null> {
  const { data } = await db
    .from('workspaces')
    .select('id, status, plan')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  return data as { id: string; status: string; plan: string } | null;
}

export async function activateWorkspace(
  db: SupabaseClient,
  workspaceId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  plan: string,
  periodEnd: string,
): Promise<void> {
  await db.from('workspaces').update({
    status: 'active',
    plan,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    subscription_current_period_end: periodEnd,
  }).eq('id', workspaceId);
}

export async function updateWorkspaceStatus(
  db: SupabaseClient,
  workspaceId: string,
  status: 'active' | 'past_due' | 'suspended' | 'cancelled',
  periodEnd?: string,
): Promise<void> {
  const updates: Record<string, string> = { status };
  if (periodEnd) updates.subscription_current_period_end = periodEnd;
  await db.from('workspaces').update(updates).eq('id', workspaceId);
}

export async function isEventProcessed(db: SupabaseClient, eventId: string): Promise<boolean> {
  const { data } = await db
    .from('processed_stripe_events')
    .select('event_id')
    .eq('event_id', eventId)
    .single();
  return !!data;
}

export async function markEventProcessed(db: SupabaseClient, eventId: string): Promise<void> {
  await db.from('processed_stripe_events').insert({ event_id: eventId }).select();
}
