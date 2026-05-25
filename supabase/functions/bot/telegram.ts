export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

async function post(token: string, method: string, body: unknown): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram ${method} ${response.status}: ${err}`);
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
