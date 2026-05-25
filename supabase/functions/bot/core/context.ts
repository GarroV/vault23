import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { BotContext, BotEvent, UserIdentity, SessionState, InlineButton, ReplyOptions } from './types.ts';
import { createTranslator } from './i18n.ts';
import { gate } from './gate.ts';
import { sendMessage, sendMessageWithKeyboard } from '../telegram.ts';

interface WorkspaceData {
  id: string;
  status: string;
  plan: string;
}

export async function loadWorkspace(db: SupabaseClient, workspaceId: string): Promise<WorkspaceData> {
  const { data, error } = await db
    .from('workspaces')
    .select('id, status, plan')
    .eq('id', workspaceId)
    .single();

  if (error || !data) throw new Error(`workspace not found: ${error?.message}`);
  return data as WorkspaceData;
}

export function buildContext(params: {
  identity: UserIdentity;
  workspace: WorkspaceData;
  session: SessionState;
  event: BotEvent;
  chatId: number;
  telegramToken: string;
  db: SupabaseClient;
}): BotContext {
  const { identity, workspace, session, event, chatId, telegramToken, db } = params;
  const t = createTranslator(identity.language);

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
        buttons.map(row => row.map(btn => ({ text: btn.text, callback_data: btn.callbackData }))),
      ),
    gate,
    db,
  };
}
