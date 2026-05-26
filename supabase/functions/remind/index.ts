import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface DueItem {
  id: string;
  content: string;
  assignee: string | null;
  workspace_id: string;
}

interface WorkspaceUser {
  auth_methods: Array<{ value: string }>;
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage ${res.status}: ${await res.text()}`);
}

Deno.serve(async (_req: Request) => {
  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  if (!supabaseUrl || !serviceKey || !telegramToken) {
    console.error('[remind] missing environment variables');
    return new Response('OK', { status: 200 });
  }

  const db = createClient(supabaseUrl, serviceKey);
  const now = new Date().toISOString();

  // Find items whose due_at has passed and haven't been notified yet
  const { data: items, error } = await db
    .from('items')
    .select('id, content, assignee, workspace_id')
    .eq('done', false)
    .is('deleted_at', null)
    .is('notified_at', null)
    .lte('due_at', now)
    .limit(50);

  if (error) {
    console.error('[remind] query error', { error: error.message });
    return new Response('OK', { status: 200 });
  }

  const dueItems = (items ?? []) as DueItem[];
  console.log('[remind] processing due items', { count: dueItems.length });

  for (const item of dueItems) {
    // Find all telegram users in this workspace
    const { data: users } = await db
      .from('users')
      .select('auth_methods!inner(value)')
      .eq('workspace_id', item.workspace_id)
      .eq('auth_methods.type', 'telegram');

    const workspaceUsers = (users ?? []) as WorkspaceUser[];

    for (const user of workspaceUsers) {
      const chatId = user.auth_methods[0]?.value;
      if (!chatId) continue;
      try {
        const assigneePart = item.assignee ? ` → ${item.assignee}` : '';
        await sendTelegramMessage(telegramToken, chatId, `⏰ ${item.content}${assigneePart}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[remind] failed to send', { itemId: item.id, error: msg });
      }
    }

    // Mark as notified regardless of send success to avoid spam
    await db.from('items').update({ notified_at: now }).eq('id', item.id);
  }

  return new Response('OK', { status: 200 });
});
