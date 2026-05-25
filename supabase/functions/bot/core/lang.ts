import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserIdentity, Language } from './types.ts';
import { createTranslator } from './i18n.ts';
import { sendMessage, sendMessageWithKeyboard, answerCallbackQuery } from '../telegram.ts';

const LANGUAGE_KEYBOARD = [
  [
    { text: 'Русский 🇷🇺', callback_data: 'lang_ru' },
    { text: 'English 🇬🇧', callback_data: 'lang_en' },
  ],
];

export async function handleLanguageCommand(
  token: string,
  chatId: number,
  identity: UserIdentity,
): Promise<void> {
  const t = createTranslator(identity.language);
  await sendMessageWithKeyboard(token, chatId, `${t('language_current')}\n\n${t('language_choose')}`, LANGUAGE_KEYBOARD);
}

export async function handleLanguageCallback(
  db: SupabaseClient,
  token: string,
  chatId: number,
  callbackQueryId: string,
  identity: UserIdentity,
  callbackData: string,
): Promise<void> {
  const newLanguage: Language = callbackData === 'lang_ru' ? 'ru' : 'en';

  const { error } = await db
    .from('users')
    .update({ language: newLanguage })
    .eq('id', identity.userId);

  if (error) {
    console.error('[lang] failed to update language', { userId: identity.userId, error: error.message });
  }

  await answerCallbackQuery(token, callbackQueryId);

  const t = createTranslator(newLanguage);
  await sendMessage(token, chatId, t('language_changed'));
}
