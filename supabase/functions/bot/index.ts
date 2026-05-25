import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendMessage } from './telegram.ts';
import { isProcessed, markProcessed } from './idempotency.ts';
import { identifyUser } from './core/identify.ts';
import { createTranslator } from './core/i18n.ts';
import { handleLanguageCommand, handleLanguageCallback } from './core/lang.ts';
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
    console.error('[index] missing update_id');
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
      console.log('[index] no user context, skipping', { updateId });
      return new Response('OK', { status: 200 });
    }

    const identity = await identifyUser(serviceDb, from);
    const t = createTranslator(identity.language);
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;

    if (!chatId) {
      console.log('[index] no chat_id, skipping', { updateId });
      return new Response('OK', { status: 200 });
    }

    // Welcome new users
    if (identity.isNew) {
      await sendMessage(telegramToken, chatId, t('welcome_new'));
    }

    const text = update.message?.text?.trim();
    const callbackData = update.callback_query?.data;
    const callbackQueryId = update.callback_query?.id;

    // Language command
    if (text === '/language' || text?.startsWith('/language@')) {
      await handleLanguageCommand(telegramToken, chatId, identity);
      return new Response('OK', { status: 200 });
    }

    // Language callback
    if (callbackData?.startsWith('lang_') && callbackQueryId) {
      await handleLanguageCallback(serviceDb, telegramToken, chatId, callbackQueryId, identity, callbackData);
      return new Response('OK', { status: 200 });
    }

    // Temporary echo — replaced by module router in step 3.3
    if (text) {
      console.log('[index] echo', { updateId, chatId, userId: identity.userId });
      await sendMessage(telegramToken, chatId, text);
    } else {
      console.log('[index] no actionable content', { updateId, userId: identity.userId });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[index] unexpected runtime error', { updateId, error: message });
  }

  return new Response('OK', { status: 200 });
});
