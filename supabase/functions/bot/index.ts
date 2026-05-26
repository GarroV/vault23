import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendMessage, sendMessageWithKeyboard, removeReplyKeyboard, setMyCommands, answerCallbackQuery } from './telegram.ts';
import { isProcessed, markProcessed } from './idempotency.ts';
import { identifyUser } from './core/identify.ts';
import { createTranslator } from './core/i18n.ts';
import { normalizeEvent } from './core/router.ts';
import { ModuleRegistry } from './core/registry.ts';
import { loadSession, saveSession, clearSession } from './core/session.ts';
import { loadWorkspace, buildContext, loadLocaleOverrides } from './core/context.ts';
import { handleLanguageCommand, handleLanguageCallback } from './core/lang.ts';
import { listConfigs } from './core/config.ts';
import { DEFAULT_COMMANDS, ADMIN_COMMANDS } from './core/commands.ts';
import { TasksModule } from './modules/tasks/index.ts';
import { NotesModule } from './modules/notes/index.ts';
import { AttachmentsModule } from './modules/attachments/index.ts';
import { RemindersModule } from './modules/reminders/index.ts';
import { ContractorsModule } from './modules/contractors/index.ts';
import { KbModule } from './modules/kb/index.ts';
import { GoogleModule } from './modules/google/index.ts';
import { EmailModule } from './modules/email/index.ts';
import { BillingModule } from './modules/billing/index.ts';
import { AdminModule } from './modules/admin/index.ts';
import type { TelegramUpdate, BotEvent } from './core/types.ts';

const registry = new ModuleRegistry();
registry.register(new AdminModule());
registry.register(new BillingModule());
registry.register(new TasksModule());
registry.register(new NotesModule());
registry.register(new AttachmentsModule());
registry.register(new RemindersModule());
registry.register(new ContractorsModule());
registry.register(new KbModule());
registry.register(new GoogleModule());
registry.register(new EmailModule());

// __menu_X__ → /slash equivalents (from reply-keyboard buttons, kept for compatibility)
const MENU_TO_CMD: Record<string, string> = {
  __menu_tasks__:       '/tasks',
  __menu_notes__:       '/notes',
  __menu_reminders__:   '/reminders',
  __menu_stats__:       '/stats',
};

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

    const rawEvent = normalizeEvent(update);
    if (!rawEvent) {
      console.log('[index] unsupported update type, skipping', { updateId });
      return new Response('OK', { status: 200 });
    }
    let event: BotEvent = rawEvent;

    const isAdmin = identity.telegramId === (Deno.env.get('ADMIN_TELEGRAM_ID') ?? '');

    // ── /start ──────────────────────────────────────────────────────────────
    if (identity.isNew || event.command === '/start') {
      const consentGateEnabled = Deno.env.get('CONSENT_GATE_ENABLED') === 'true';

      if (consentGateEnabled && !identity.isNew) {
        await sendMessage(telegramToken, chatId, t('consent_required'));
        return new Response('OK', { status: 200 });
      }

      await serviceDb.from('users').update({
        consent_given_at: new Date().toISOString(),
        consent_version: 'v1-2026-05-26',
      }).eq('id', identity.userId);

      // Register bot command list and remove any leftover reply keyboard
      await Promise.all([
        setMyCommands(telegramToken, DEFAULT_COMMANDS).catch(() => {}),
        isAdmin
          ? setMyCommands(telegramToken, ADMIN_COMMANDS, { type: 'chat', chat_id: chatId }).catch(() => {})
          : Promise.resolve(),
        removeReplyKeyboard(telegramToken, chatId, t('welcome_new')),
      ]);
      return new Response('OK', { status: 200 });
    }

    // ── /help ────────────────────────────────────────────────────────────────
    if (event.command === '/help') {
      await sendMessageWithKeyboard(telegramToken, chatId, t('help_intro'), [
        [{ text: t('help_btn_tasks'), callback_data: 'help_tasks' }, { text: t('help_btn_notes'), callback_data: 'help_notes' }],
        [{ text: t('help_btn_voice'), callback_data: 'help_voice' }, { text: t('help_btn_reminders'), callback_data: 'help_reminders' }],
        [{ text: t('help_btn_contacts'), callback_data: 'help_contacts' }, { text: t('help_btn_kb'), callback_data: 'help_kb' }],
        [{ text: t('help_btn_integrations'), callback_data: 'help_integrations' }, { text: t('help_btn_account'), callback_data: 'help_account' }],
      ]);
      return new Response('OK', { status: 200 });
    }

    // ── help section callbacks (before workspace load — only needs t()) ──────
    if (event.type === 'callback_query' && event.callbackData?.startsWith('help_')) {
      const section = event.callbackData as 'help_tasks' | 'help_notes' | 'help_voice' | 'help_reminders' | 'help_contacts' | 'help_kb' | 'help_integrations' | 'help_account';
      await sendMessage(telegramToken, chatId, t(section));
      await answerCallbackQuery(telegramToken, update.callback_query!.id).catch(() => {});
      return new Response('OK', { status: 200 });
    }

    // ── /deletedata ──────────────────────────────────────────────────────────
    if (event.command === '/deletedata') {
      await serviceDb.from('bot_sessions').update({ state: 'delete_data_confirm', data: {} }).eq('user_id', identity.userId);
      await sendMessage(telegramToken, chatId, t('delete_data_confirm'));
      return new Response('OK', { status: 200 });
    }

    // ── /language ────────────────────────────────────────────────────────────
    if (event.command === '/language') {
      await handleLanguageCommand(telegramToken, chatId, identity);
      return new Response('OK', { status: 200 });
    }

    if (event.type === 'callback_query' && event.callbackData?.startsWith('lang_')) {
      const callbackQueryId = update.callback_query!.id;
      await handleLanguageCallback(serviceDb, telegramToken, chatId, callbackQueryId, identity, event.callbackData);
      return new Response('OK', { status: 200 });
    }

    // ── /stats ───────────────────────────────────────────────────────────────
    if (event.command === '/stats') {
      const wid = identity.workspaceId;
      const [taskRes, noteRes, reminderRes] = await Promise.all([
        serviceDb.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', wid).is('deleted_at', null).in('status', ['open', 'in_progress']),
        serviceDb.from('notes').select('id', { count: 'exact', head: true }).eq('workspace_id', wid).is('deleted_at', null),
        serviceDb.from('reminders').select('id', { count: 'exact', head: true }).eq('workspace_id', wid).eq('status', 'pending'),
      ]);
      await sendMessage(telegramToken, chatId, t('stats_summary', {
        tasks: taskRes.count ?? 0,
        notes: noteRes.count ?? 0,
        reminders: reminderRes.count ?? 0,
      }));
      return new Response('OK', { status: 200 });
    }

    // ── /settings ────────────────────────────────────────────────────────────
    if (event.command === '/settings' || event.command === '__menu_settings__') {
      await sendMessageWithKeyboard(telegramToken, chatId, t('menu_settings_title'), [
        [{ text: t('btn_language'),     callback_data: 'm_lang' }],
        [{ text: t('btn_subscription'), callback_data: 'm_sub'  }],
        [{ text: t('btn_delete_data'),  callback_data: 'm_del'  }],
      ]);
      return new Response('OK', { status: 200 });
    }

    // ── /adminmenu ───────────────────────────────────────────────────────────
    if ((event.command === '/adminmenu' || event.command === '__menu_admin__') && isAdmin) {
      await sendMessageWithKeyboard(telegramToken, chatId, t('menu_admin_title'), [
        [
          { text: t('btn_admin_stats'),   callback_data: 'm_admin_stats'   },
          { text: t('btn_admin_cfg'),     callback_data: 'm_admin_cfg'     },
        ],
        [{ text: t('btn_admin_locales'), callback_data: 'm_admin_locales' }],
      ]);
      return new Response('OK', { status: 200 });
    }

    // ── Translate __menu_X__ → /slash for module routing ────────────────────
    if (event.command && event.command in MENU_TO_CMD) {
      event = { ...event, command: MENU_TO_CMD[event.command] };
    }

    // ── Load context ─────────────────────────────────────────────────────────
    const [session, workspace, localeOverrides] = await Promise.all([
      loadSession(serviceDb, identity.userId),
      loadWorkspace(serviceDb, identity.workspaceId),
      loadLocaleOverrides(serviceDb),
    ]);

    const ctx = buildContext({ identity, workspace, session, event, chatId, telegramToken, db: serviceDb, isAdmin, localeOverrides });

    // ── Settings / admin callbacks ────────────────────────────────────────────
    if (event.type === 'callback_query') {
      const cb = event.callbackData ?? '';

      if (cb === 'm_lang') {
        await handleLanguageCommand(telegramToken, chatId, identity);
        await answerCallbackQuery(telegramToken, update.callback_query!.id).catch(() => {});
        return new Response('OK', { status: 200 });
      }

      if (cb === 'm_del') {
        await serviceDb.from('bot_sessions').update({ state: 'delete_data_confirm', data: {} }).eq('user_id', identity.userId);
        await ctx.reply(t('delete_data_confirm'));
        await answerCallbackQuery(telegramToken, update.callback_query!.id).catch(() => {});
        return new Response('OK', { status: 200 });
      }

      if (cb === 'm_sub') {
        event = { ...event, type: 'command', command: '/subscription', source: 'button' };
        await answerCallbackQuery(telegramToken, update.callback_query!.id).catch(() => {});
        // fall through to module routing
      }

      if (isAdmin && cb === 'm_admin_stats') {
        const [ws, usersRes, tasksRes, notesRes] = await Promise.all([
          ctx.db.from('workspaces').select('id', { count: 'exact', head: true }),
          ctx.db.from('users').select('id', { count: 'exact', head: true }),
          ctx.db.from('tasks').select('id', { count: 'exact', head: true }),
          ctx.db.from('notes').select('id', { count: 'exact', head: true }),
        ]);
        await ctx.reply(t('admin_stats_msg', {
          workspaces: ws.count ?? 0,
          users:      usersRes.count ?? 0,
          tasks:      tasksRes.count ?? 0,
          notes:      notesRes.count ?? 0,
        }));
        await answerCallbackQuery(telegramToken, update.callback_query!.id).catch(() => {});
        return new Response('OK', { status: 200 });
      }

      if (isAdmin && cb === 'm_admin_cfg') {
        const configs = await listConfigs(ctx.db);
        const lines = (configs as Array<{ key: string; set: boolean }>)
          .map(c => `${c.set ? '✓' : '○'} ${c.key}`)
          .join('\n');
        await ctx.reply(`⚙️ Конфигурация:\n\n${lines}`);
        await answerCallbackQuery(telegramToken, update.callback_query!.id).catch(() => {});
        return new Response('OK', { status: 200 });
      }

      if (isAdmin && cb === 'm_admin_locales') {
        await ctx.reply(t('admin_locales_hint'));
        await answerCallbackQuery(telegramToken, update.callback_query!.id).catch(() => {});
        return new Response('OK', { status: 200 });
      }
    }

    // ── Past-due warning ─────────────────────────────────────────────────────
    if (ctx.isGracePeriod && event.command !== '/subscription') {
      await sendMessage(telegramToken, chatId, t('past_due_warning'));
    }

    // ── Global gate ──────────────────────────────────────────────────────────
    const globalGate = ctx.gate('any');
    if (!globalGate.allowed) {
      const key = globalGate.reason === 'workspace_suspended' ? 'gate_suspended' : 'gate_cancelled';
      await sendMessage(telegramToken, chatId, t(key));
      return new Response('OK', { status: 200 });
    }

    // ── Delete data confirmation ──────────────────────────────────────────────
    if (session.state === 'delete_data_confirm' && event.type === 'text') {
      const confirmWord = identity.language === 'ru' ? 'УДАЛИТЬ' : 'DELETE';
      if ((event.text?.trim() ?? '') === confirmWord) {
        await serviceDb.from('workspaces').delete().eq('id', identity.workspaceId);
        await sendMessage(telegramToken, chatId, t('delete_data_done'));
      } else {
        await sendMessage(telegramToken, chatId, t('delete_data_wrong'));
        await clearSession(serviceDb, identity.userId);
      }
      return new Response('OK', { status: 200 });
    }

    // ── Module routing ────────────────────────────────────────────────────────
    const module = registry.route(event, session);

    if (module) {
      console.log('[index] routing to module', { updateId, module: module.name, userId: identity.userId });
      const result = await module.handle(ctx);

      if (event.type === 'callback_query' && update.callback_query?.id) {
        await answerCallbackQuery(telegramToken, update.callback_query.id).catch(() => {});
      }

      if (result.clearSession) {
        await clearSession(serviceDb, identity.userId);
      } else if (result.session) {
        await saveSession(serviceDb, identity.userId, result.session.state, result.session.data);
      }
    } else if (event.type === 'text' && event.text?.trim()) {
      // NLP: parse plain text when no module claimed it
      console.log('[index] NLP fallback', { updateId, userId: identity.userId });
      const { parseNaturalLanguage } = await import('./core/nlp.ts');
      const nlp = await parseNaturalLanguage(ctx.db, event.text, new Date().toISOString());

      if (nlp.intent === 'create_task') {
        const { getVisibleTopics, createTask } = await import('./modules/tasks/queries.ts');
        const topics = await getVisibleTopics(ctx.db, ctx.user.workspaceId);
        const topicId = topics[0]?.id;
        if (!topicId) { await ctx.reply(t('cmd_unknown')); }
        else {
          const taskId = await createTask(ctx.db, ctx.user.workspaceId, nlp.title, topicId, undefined, nlp.due_at, nlp.recurrence);
          if (nlp.due_at) {
            const remindAt = new Date(nlp.due_at);
            if (!isNaN(remindAt.getTime()) && remindAt > new Date()) {
              const { createReminder } = await import('./modules/reminders/queries.ts');
              await createReminder(ctx.db, ctx.user.workspaceId, ctx.user.id, nlp.title, remindAt, taskId).catch(() => {});
            }
            const date = remindAt.toLocaleDateString(
              identity.language === 'ru' ? 'ru-RU' : 'en-US',
              { day: 'numeric', month: 'short', timeZone: 'UTC' },
            );
            await ctx.reply(t('nlp_task_created_deadline', { title: nlp.title, date }));
          } else {
            await ctx.reply(t('nlp_task_created', { title: nlp.title }));
          }
        }

      } else if (nlp.intent === 'create_note') {
        const { createNote } = await import('./modules/notes/queries.ts');
        await createNote(ctx.db, ctx.user.workspaceId, nlp.content);
        await ctx.reply(t('nlp_note_saved'));

      } else if (nlp.intent === 'set_reminder') {
        const remindAt = new Date(nlp.remind_at);
        if (isNaN(remindAt.getTime()) || remindAt <= new Date()) {
          await ctx.reply(t('nlp_reminder_past'));
        } else {
          const { createReminder } = await import('./modules/reminders/queries.ts');
          await createReminder(ctx.db, ctx.user.workspaceId, ctx.user.id, nlp.text, remindAt);
          const timeStr = remindAt.toLocaleString(
            identity.language === 'ru' ? 'ru-RU' : 'en-US',
            { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' },
          );
          await ctx.reply(t('nlp_reminder_set', { time: timeStr }));
        }

      } else if (nlp.intent === 'list_tasks') {
        const { handleTaskListCommand } = await import('./modules/tasks/handlers.ts');
        await handleTaskListCommand(ctx);

      } else if (nlp.intent === 'list_notes') {
        const { handleNotesListCommand } = await import('./modules/notes/handlers.ts');
        await handleNotesListCommand(ctx);

      } else if (nlp.intent === 'search') {
        const query = nlp.query;
        const [taskRes, noteRes] = await Promise.all([
          ctx.db.from('tasks').select('title')
            .eq('workspace_id', ctx.user.workspaceId).is('deleted_at', null)
            .in('status', ['open', 'in_progress'])
            .textSearch('title', query, { config: 'russian' }).limit(5),
          ctx.db.from('notes').select('content')
            .eq('workspace_id', ctx.user.workspaceId).is('deleted_at', null)
            .textSearch('content', query, { config: 'russian' }).limit(5),
        ]);
        const tasks = (taskRes.data ?? []) as Array<{ title: string }>;
        const notes = (noteRes.data ?? []) as Array<{ content: string }>;
        if (tasks.length === 0 && notes.length === 0) {
          await ctx.reply(t('nlp_search_empty', { query }));
        } else {
          const lines: string[] = [t('nlp_search_results', { query })];
          if (tasks.length > 0) {
            lines.push('\n📋 ' + (identity.language === 'ru' ? 'Задачи:' : 'Tasks:'));
            tasks.forEach(tsk => lines.push(`• ${tsk.title}`));
          }
          if (notes.length > 0) {
            lines.push('\n📝 ' + (identity.language === 'ru' ? 'Заметки:' : 'Notes:'));
            notes.forEach(nt => {
              const preview = nt.content.length > 80 ? `${nt.content.slice(0, 80)}…` : nt.content;
              lines.push(`• ${preview}`);
            });
          }
          await ctx.reply(lines.join('\n'));
        }

      } else if (nlp.intent === 'kb_ask') {
        const { handleAskQuestion } = await import('./modules/kb/handlers.ts');
        const kbCtx = { ...ctx, event: { ...ctx.event, text: nlp.question } };
        await handleAskQuestion(kbCtx);

      } else {
        await ctx.reply(t('cmd_unknown'));
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
