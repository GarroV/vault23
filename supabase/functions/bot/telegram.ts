export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface BotCommand {
  command: string;
  description: string;
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

// Retries on transient failures (network errors, 5xx). Does NOT retry 4xx — those are caller bugs.
async function postWithRetry(token: string, method: string, body: unknown, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await post(token, method, body);
      return;
    } catch (err) {
      const is4xx = err instanceof Error && /Telegram \w+ 4\d\d/.test(err.message);
      if (is4xx) throw err;
      lastError = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastError;
}

export async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await postWithRetry(token, 'sendMessage', { chat_id: chatId, text });
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

/** Removes any persistent reply keyboard currently shown to the user. */
export async function removeReplyKeyboard(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  await postWithRetry(token, 'sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { remove_keyboard: true },
  });
}

/**
 * Sets the bot command list visible in Telegram's "/" dropdown.
 * scope defaults to all private chats. Pass { type: 'chat', chat_id } for per-user overrides.
 */
export async function setMyCommands(
  token: string,
  commands: BotCommand[],
  scope?: Record<string, unknown>,
): Promise<void> {
  const body: Record<string, unknown> = { commands };
  if (scope) body.scope = scope;
  await post(token, 'setMyCommands', body);
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
