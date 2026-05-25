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

export async function getFilePath(token: string, fileId: string): Promise<string> {
  const url = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getFile ${res.status}: ${await res.text()}`);
  const json = await res.json() as { ok: boolean; result?: { file_path?: string } };
  const filePath = json.result?.file_path;
  if (!filePath) throw new Error('getFile: no file_path in response');
  return filePath;
}

export async function downloadTelegramFile(token: string, filePath: string): Promise<Uint8Array> {
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download file ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
