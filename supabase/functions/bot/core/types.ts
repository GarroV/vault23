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
    voice?: { file_id: string; duration: number };
    document?: { file_id: string; file_name?: string; mime_type?: string };
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
