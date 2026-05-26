import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendMessage, answerCallbackQuery } from './telegram.ts';
import { isProcessed, markProcessed } from './idempotency.ts';
import { identifyUser } from './core/identify.ts';
import { createTranslator } from './core/i18n.ts';
import { normalizeEvent } from './core/router.ts';
import { ModuleRegistry } from './core/registry.ts';
import { loadSession, saveSession, clearSession } from './core/session.ts';
import { loadWorkspace, buildContext } from './core/context.ts';
import { handleLanguageCommand, handleLanguageCallback } from './core/lang.ts';
import { TasksModule } from './modules/tasks/index.ts';
import { NotesModule } from './modules/notes/index.ts';
import { AttachmentsModule } from './modules/attachments/index.ts';
import { RemindersModule } from './modules/reminders/index.ts';
import type { TelegramUpdate } from './core/types.ts';

const registry = new ModuleRegistry();
registry.register(new TasksModule());
registry.register(new NotesModule());
registry.register(new AttachmentsModule());
registry.register(new RemindersModule());

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

    const event = normalizeEvent(update);
    if (!event) {
      console.log('[index] unsupported update type, skipping', { updateId });
      return new Response('OK', { status: 200 });
    }

    // New user or /start — welcome and stop
    if (identity.isNew || event.command === '/start') {
      await sendMessage(telegramToken, chatId, t('welcome_new'));
      return new Response('OK', { status: 200 });
    }

    // System: language
    if (event.command === '/language') {
      await handleLanguageCommand(telegramToken, chatId, identity);
      return new Response('OK', { status: 200 });
    }

    if (event.type === 'callback_query' && event.callbackData?.startsWith('lang_')) {
      const callbackQueryId = update.callback_query!.id;
      await handleLanguageCallback(serviceDb, telegramToken, chatId, callbackQueryId, identity, event.callbackData);
      return new Response('OK', { status: 200 });
    }

    // Load context and route to module
    const [session, workspace] = await Promise.all([
      loadSession(serviceDb, identity.userId),
      loadWorkspace(serviceDb, identity.workspaceId),
    ]);

    const ctx = buildContext({ identity, workspace, session, event, chatId, telegramToken, db: serviceDb });

    const module = registry.route(event, session);

    if (module) {
      console.log('[index] routing to module', { updateId, module: module.name, userId: identity.userId });
      const result = await module.handle(ctx);

      // Auto-answer callback queries so Telegram clears the spinner
      if (event.type === 'callback_query' && update.callback_query?.id) {
        await answerCallbackQuery(telegramToken, update.callback_query.id).catch(() => {});
      }

      if (result.clearSession) {
        await clearSession(serviceDb, identity.userId);
      } else if (result.session) {
        await saveSession(serviceDb, identity.userId, result.session.state, result.session.data);
      }
    } else {
      console.log('[index] no module matched', { updateId, userId: identity.userId });
      await ctx.reply(t('cmd_unknown'));
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[index] unexpected runtime error', { updateId, error: message });
  }

  return new Response('OK', { status: 200 });
});
