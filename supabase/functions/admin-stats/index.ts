/**
 * Admin stats endpoint — product owner only.
 *
 * Auth: Bearer token from ADMIN_SECRET env var.
 *
 * GET /admin-stats                → aggregate stats across all workspaces
 * GET /admin-stats?workspace=id   → single workspace detail
 *
 * Required Secrets: ADMIN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const adminSecret = Deno.env.get('ADMIN_SECRET') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Auth check
  const authHeader = req.headers.get('authorization') ?? '';
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!supabaseUrl || !serviceKey) {
    return new Response('Config error', { status: 500 });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspace');
  const currentPeriod = getPeriodStart();

  if (workspaceId) {
    // Single workspace detail
    const [workspaceRes, usageRes, tokenRes, tasksRes, notesRes] = await Promise.all([
      db.from('workspaces').select('id, name, status, plan, trial_ends_at, subscription_current_period_end, created_at').eq('id', workspaceId).single(),
      db.from('monthly_usage').select('voice_count, email_count').eq('workspace_id', workspaceId).eq('period_start', currentPeriod).single(),
      db.from('token_usage').select('total_tokens, operation_type').eq('workspace_id', workspaceId).gte('created_at', currentPeriod),
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('deleted_at', null).in('status', ['open', 'in_progress']),
      db.from('notes').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('deleted_at', null),
    ]);

    const tokensByOp: Record<string, number> = {};
    for (const row of (tokenRes.data ?? []) as Array<{ total_tokens: number; operation_type: string }>) {
      tokensByOp[row.operation_type] = (tokensByOp[row.operation_type] ?? 0) + row.total_tokens;
    }

    return json({
      workspace: workspaceRes.data,
      usage: {
        period: currentPeriod,
        voice_count: (usageRes.data as { voice_count?: number } | null)?.voice_count ?? 0,
        email_count: (usageRes.data as { email_count?: number } | null)?.email_count ?? 0,
        tokens_by_operation: tokensByOp,
      },
      counts: {
        open_tasks: tasksRes.count ?? 0,
        notes: notesRes.count ?? 0,
      },
    });
  }

  // Aggregate across all workspaces
  const [workspacesRes, usageRes, tokenTotalRes] = await Promise.all([
    db.from('workspaces').select('id, name, status, plan, created_at').order('created_at', { ascending: false }).limit(100),
    db.from('monthly_usage').select('workspace_id, voice_count, email_count').eq('period_start', currentPeriod),
    db.from('token_usage').select('total_tokens').gte('created_at', currentPeriod),
  ]);

  const usageByWs: Record<string, { voice: number; email: number }> = {};
  for (const row of (usageRes.data ?? []) as Array<{ workspace_id: string; voice_count: number; email_count: number }>) {
    usageByWs[row.workspace_id] = { voice: row.voice_count, email: row.email_count };
  }

  const totalTokens = ((tokenTotalRes.data ?? []) as Array<{ total_tokens: number }>)
    .reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);

  const statusCounts: Record<string, number> = {};
  const planCounts: Record<string, number> = {};
  for (const ws of (workspacesRes.data ?? []) as Array<{ status: string; plan: string }>) {
    statusCounts[ws.status] = (statusCounts[ws.status] ?? 0) + 1;
    planCounts[ws.plan] = (planCounts[ws.plan] ?? 0) + 1;
  }

  return json({
    period: currentPeriod,
    workspace_count: workspacesRes.data?.length ?? 0,
    by_status: statusCounts,
    by_plan: planCounts,
    total_tokens_this_period: totalTokens,
    workspaces: (workspacesRes.data ?? []).map((ws: Record<string, unknown>) => ({
      ...ws,
      usage: usageByWs[ws.id as string] ?? { voice: 0, email: 0 },
    })),
  });
});

function getPeriodStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
