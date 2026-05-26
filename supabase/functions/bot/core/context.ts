import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { BotContext, BotEvent, UserIdentity, SessionState, InlineButton, ReplyOptions } from './types.ts';
import { createTranslator } from './i18n.ts';
import { gate } from './gate.ts';
import { GRACE_STATUSES } from './plans.ts';
import { sendMessage, sendMessageWithKeyboard } from '../telegram.ts';

interface WorkspaceData {
  id: string;
  status: string;
  plan: string;
  trial_ends_at?: string;
  stripe_customer_id?: string;
  subscription_current_period_end?: string;
}

export async function loadWorkspace(db: SupabaseClient, workspaceId: string): Promise<WorkspaceData> {
  const { data, error } = await db
    .from('workspaces')
    .select('id, status, plan, trial_ends_at, stripe_customer_id, subscription_current_period_end')
    .eq('id', workspaceId)
    .single();

  if (error || !data) throw new Error(`workspace not found: ${error?.message}`);
  return data as WorkspaceData;
}

export async function loadLocaleOverrides(
  db: SupabaseClient,
): Promise<Record<'ru' | 'en', Record<string, string>>> {
  const { data } = await db.from('locale_overrides').select('lang, key, value');
  const result: Record<'ru' | 'en', Record<string, string>> = { ru: {}, en: {} };
  for (const row of (data ?? []) as Array<{ lang: string; key: string; value: string }>) {
    if (row.lang === 'ru' || row.lang === 'en') result[row.lang][row.key] = row.value;
  }
  return result;
}

export function buildContext(params: {
  identity: UserIdentity;
  workspace: WorkspaceData;
  session: SessionState;
  event: BotEvent;
  chatId: number;
  telegramToken: string;
  db: SupabaseClient;
  localeOverrides?: Record<'ru' | 'en', Record<string, string>>;
}): BotContext {
  const { identity, workspace, session, event, chatId, telegramToken, db, localeOverrides } = params;
  const t = createTranslator(identity.language, localeOverrides);

  return {
    user: {
      id: identity.userId,
      workspaceId: identity.workspaceId,
      language: identity.language,
      telegramId: identity.telegramId,
    },
    workspace: {
      id: workspace.id,
      status: workspace.status,
      plan: workspace.plan,
      trial_ends_at: workspace.trial_ends_at,
      stripe_customer_id: workspace.stripe_customer_id,
      subscription_current_period_end: workspace.subscription_current_period_end,
    },
    session,
    event,
    t,
    reply: (text: string, _options?: ReplyOptions) =>
      sendMessage(telegramToken, chatId, text),
    replyWithButtons: (text: string, buttons: InlineButton[][]) =>
      sendMessageWithKeyboard(
        telegramToken,
        chatId,
        text,
        buttons.map(row => row.map(btn => ({
          text: btn.text,
          ...(btn.url ? { url: btn.url } : { callback_data: btn.callbackData ?? '' }),
        }))),
      ),
    gate: (feature: string) => gate(feature, { workspaceStatus: workspace.status, workspacePlan: workspace.plan, trialEndsAt: workspace.trial_ends_at }),
    isGracePeriod: GRACE_STATUSES.has(workspace.status),
    db,
  };
}
