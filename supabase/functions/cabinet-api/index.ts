/**
 * Cabinet BFF — backend for the personal cabinet SPA.
 * All routes require a valid JWT from web-auth/login (Authorization: Bearer <token>).
 *
 * GET /cabinet-api/me              → workspace info, subscription, usage, stats
 * GET /cabinet-api/configs         → config key list (admin only)
 * POST /cabinet-api/configs        → set a config key (admin only)
 * GET /cabinet-api/platform-stats  → platform-wide counts (admin only)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyJwt } from '../bot/core/jwt.ts';
import { listConfigs, setConfig, maskValue, CONFIGURABLE_KEYS } from '../bot/core/config.ts';
import { getPlanLimits } from '../bot/core/plans.ts';

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

interface Claims {
  userId: string;
  workspaceId: string;
  telegramId: string;
  isAdmin: boolean;
}

function daysLeft(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const adminSecret = Deno.env.get('ADMIN_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey || !adminSecret) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  // Auth
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const claims = await verifyJwt(token, adminSecret) as Claims | null;
  if (!claims) return json({ error: 'unauthorized' }, 401);

  const db = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);
  const path = url.pathname.replace(/.*\/cabinet-api/, '') || '/';

  // ── GET /me ──────────────────────────────────────────────────────────────
  if (path === '/me' && req.method === 'GET') {
    const period = new Date().toISOString().slice(0, 7) + '-01';

    const [wsRes, usageRes, tasksRes, notesRes, membersRes] = await Promise.all([
      db.from('workspaces')
        .select('id, name, status, plan, trial_ends_at, subscription_current_period_end')
        .eq('id', claims.workspaceId)
        .single(),
      db.from('monthly_usage')
        .select('voice_count, email_count')
        .eq('workspace_id', claims.workspaceId)
        .eq('period_start', period)
        .maybeSingle(),
      db.from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', claims.workspaceId)
        .is('deleted_at', null),
      db.from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', claims.workspaceId),
      db.from('workspace_members')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', claims.workspaceId),
    ]);

    const ws = wsRes.data as Record<string, unknown>;
    const usage = usageRes.data as { voice_count: number; email_count: number } | null;
    const limits = getPlanLimits(ws?.plan as string ?? 'trial');

    const trialDays = ws?.status === 'trial' ? daysLeft(ws?.trial_ends_at as string) : null;
    const periodEnd = ws?.subscription_current_period_end as string | null;

    return json({
      workspace: {
        id: ws?.id,
        name: ws?.name,
        status: ws?.status,
        plan: ws?.plan,
        trialDaysLeft: trialDays,
        periodEnd,
      },
      usage: {
        voiceCount: usage?.voice_count ?? 0,
        emailCount: usage?.email_count ?? 0,
        maxVoice: limits.maxVoicePerMonth,
        maxEmail: limits.maxEmailPerMonth,
      },
      stats: {
        tasks: tasksRes.count ?? 0,
        notes: notesRes.count ?? 0,
        members: membersRes.count ?? 0,
      },
      isAdmin: claims.isAdmin,
    });
  }

  // ── GET /configs ─────────────────────────────────────────────────────────
  if (path === '/configs' && req.method === 'GET') {
    if (!claims.isAdmin) return json({ error: 'forbidden' }, 403);
    const configs = await listConfigs(db);
    return json({ configs });
  }

  // ── POST /configs ─────────────────────────────────────────────────────────
  if (path === '/configs' && req.method === 'POST') {
    if (!claims.isAdmin) return json({ error: 'forbidden' }, 403);

    let body: { key: string; value: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    const key = (body.key ?? '').toUpperCase().trim();
    const value = (body.value ?? '').trim();

    if (!key || !value) return json({ error: 'missing_fields' }, 400);

    const result = await setConfig(db, key, value, claims.userId);
    if (!result.ok) return json({ error: result.error }, 400);

    return json({ ok: true, key, masked: maskValue(value) });
  }

  // ── GET /platform-stats ───────────────────────────────────────────────────
  if (path === '/platform-stats' && req.method === 'GET') {
    if (!claims.isAdmin) return json({ error: 'forbidden' }, 403);

    const [ws, users, tasks, notes] = await Promise.all([
      db.from('workspaces').select('id', { count: 'exact', head: true }),
      db.from('users').select('id', { count: 'exact', head: true }),
      db.from('tasks').select('id', { count: 'exact', head: true }),
      db.from('notes').select('id', { count: 'exact', head: true }),
    ]);

    const byStatus = await db
      .from('workspaces')
      .select('status')
      .then(r => {
        const counts: Record<string, number> = {};
        for (const row of (r.data ?? []) as Array<{ status: string }>) {
          counts[row.status] = (counts[row.status] ?? 0) + 1;
        }
        return counts;
      });

    return json({
      workspaces: ws.count ?? 0,
      users: users.count ?? 0,
      tasks: tasks.count ?? 0,
      notes: notes.count ?? 0,
      byStatus,
    });
  }

  return json({ error: 'not_found' }, 404);
});
