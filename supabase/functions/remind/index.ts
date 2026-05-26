import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Reminder {
  id: string;
  user_id: string;
  message: string | null;
  auth_methods: Array<{ provider_id: string }>;
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
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  if (!supabaseUrl || !serviceKey || !telegramToken) {
    console.error('[remind] missing environment variables');
    return new Response('OK', { status: 200 });
  }

  const db = createClient(supabaseUrl, serviceKey);

  const { data: reminders, error } = await db
    .from('reminders')
    .select('id, user_id, message, auth_methods!inner(provider_id)')
    .eq('status', 'pending')
    .lte('remind_at', new Date().toISOString())
    .eq('auth_methods.provider', 'telegram')
    .limit(50);

  if (error) {
    console.error('[remind] query error', { error: error.message });
    return new Response('OK', { status: 200 });
  }

  const rows = (reminders ?? []) as unknown as Reminder[];
  console.log('[remind] processing reminders', { count: rows.length });

  for (const reminder of rows) {
    const chatId = reminder.auth_methods[0]?.provider_id;
    if (!chatId) {
      console.error('[remind] no telegram_id for user', { userId: reminder.user_id });
      continue;
    }

    try {
      const text = reminder.message ?? '⏰ Напоминание!';
      await sendTelegramMessage(telegramToken, chatId, `⏰ ${text}`);
      await db.from('reminders').update({ status: 'sent' }).eq('id', reminder.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[remind] failed to send', { reminderId: reminder.id, error: msg });
    }
  }

  return new Response('OK', { status: 200 });
});
