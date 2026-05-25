import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendMessage } from './telegram.ts';
import { isProcessed, markProcessed } from './idempotency.ts';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; language_code?: string };
    text?: string;
    voice?: { file_id: string; duration: number };
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number; language_code?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[index] malformed JSON payload', { error: message });
    return new Response('Bad Request', { status: 400 });
  }

  const updateId = update.update_id;
  if (typeof updateId !== 'number') {
    console.error('[index] update_id is missing or invalid');
    return new Response('Bad Request', { status: 400 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

    if (!supabaseUrl || !supabaseServiceKey || !telegramToken) {
      console.error('[index] missing required environment variables');
      return new Response('OK', { status: 200 });
    }

    const db = createClient(supabaseUrl, supabaseServiceKey);

    const alreadyProcessed = await isProcessed(db, updateId);
    if (alreadyProcessed) {
      console.log('[index] update already processed, skipping', { updateId });
      return new Response('OK', { status: 200 });
    }

    await markProcessed(db, updateId);

    const chatId = update.message?.chat?.id;
    const text = update.message?.text;

    if (chatId && text) {
      console.log('[index] echo message', { updateId, chatId });
      await sendMessage(telegramToken, chatId, text);
    } else {
      console.log('[index] no actionable content in update', { updateId });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[index] unexpected runtime error', { updateId, error: message });
  }

  return new Response('OK', { status: 200 });
});
