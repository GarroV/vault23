import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
export type { SupabaseClient };

export type Language = 'ru' | 'en';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: TelegramUser;
    text?: string;
    voice?: { file_id: string; duration: number; file_size?: number; mime_type?: string };
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>;
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: { chat: { id: number } };
    data?: string;
  };
}

export interface UserIdentity {
  userId: string;
  workspaceId: string;
  language: Language;
  telegramId: string;
  isNew: boolean;
}

export interface BotEvent {
  updateId: number;
  type: 'command' | 'text' | 'voice' | 'file' | 'callback_query';
  text?: string;
  source: 'keyboard' | 'voice' | 'button';
  command?: string;
  callbackData?: string;
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  rawUpdate: unknown;
}

export interface SessionState {
  id: string;
  state: string;
  data: Record<string, unknown>;
}

export interface ReplyOptions {
  parseMode?: 'Markdown' | 'HTML';
  disablePreview?: boolean;
}

export interface InlineButton {
  text: string;
  callbackData?: string;
  url?: string;
}

export interface GateResult {
  allowed: boolean;
  reason?: 'workspace_suspended' | 'workspace_cancelled' | 'plan_limit' | 'feature_not_in_plan';
}

export interface ModuleResult {
  ok: boolean;
  session?: { state: string; data: Record<string, unknown> };
  clearSession?: boolean;
}

export interface BotContext {
  user: {
    id: string;
    workspaceId: string;
    language: Language;
    telegramId: string;
  };
  workspace: {
    id: string;
    status: string;
    plan: string;
    trial_ends_at?: string;
    stripe_customer_id?: string;
    subscription_current_period_end?: string;
  };
  session: SessionState;
  event: BotEvent;
  t: (key: string, params?: Record<string, string | number>) => string;
  reply: (text: string, options?: ReplyOptions) => Promise<void>;
  replyWithButtons: (text: string, buttons: InlineButton[][]) => Promise<void>;
  showMenu: (text: string) => Promise<void>;
  gate: (feature: string) => GateResult;
  isGracePeriod: boolean;
  isAdmin: boolean;
  db: SupabaseClient;
}

export interface BotModule {
  name: string;
  commands: string[];
  canHandle(event: BotEvent, session: SessionState): boolean;
  handle(ctx: BotContext): Promise<ModuleResult>;
}
