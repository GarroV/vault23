import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendMessage } from './telegram.ts';
import { isProcessed, markProcessed } from './idempotency.ts';
import { identifyUser } from './core/identify.ts';
import type { TelegramUpdate } from './core/types.ts';

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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

    if (!supabaseUrl || !serviceKey || !telegramToken) {
      console.error('[index] missing required environment variables');
      return new Response('OK', { status: 200 });
    }

    const serviceDb = createClient(supabaseUrl, serviceKey);

    if (await isProcessed(serviceDb, updateId)) {
      console.log('[index] duplicate update, skipping', { updateId });
      return new Response('OK', { status: 200 });
    }
    await markProcessed(serviceDb, updateId);

    const from = update.message?.from ?? update.callback_query?.from;
    if (!from) {
      console.log('[index] no user context in update, skipping', { updateId });
      return new Response('OK', { status: 200 });
    }

    const identity = await identifyUser(serviceDb, from);

    // Temporary echo — replaced by module router in step 3.3
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    const text = update.message?.text;

    if (chatId && text) {
      console.log('[index] echo', { updateId, chatId, userId: identity.userId });
      await sendMessage(telegramToken, chatId, text);
    } else {
      console.log('[index] no text content', { updateId, userId: identity.userId });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[index] unexpected runtime error', { updateId, error: message });
  }

  return new Response('OK', { status: 200 });
});
