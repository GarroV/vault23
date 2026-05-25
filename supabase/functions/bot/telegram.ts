export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

async function post(token: string, method: string, body: unknown): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error(`[telegram] ${method} failed`, { status: response.status, error: err });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] network error in ${method}`, { error: message });
  }
}

export async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await post(token, 'sendMessage', { chat_id: chatId, text });
}

export async function sendMessageWithKeyboard(
  token: string,
  chatId: number,
  text: string,
  keyboard: InlineKeyboardButton[][],
): Promise<void> {
  await post(token, 'sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function answerCallbackQuery(token: string, callbackQueryId: string): Promise<void> {
  await post(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId });
}
