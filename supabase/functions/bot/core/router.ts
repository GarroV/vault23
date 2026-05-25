import type { TelegramUpdate, BotEvent } from './types.ts';

export function normalizeEvent(update: TelegramUpdate): BotEvent | null {
  const { message, callback_query } = update;

  if (message) {
    if (message.voice) {
      return {
        updateId: update.update_id,
        type: 'voice',
        source: 'voice',
        fileId: message.voice.file_id,
        rawUpdate: update,
      };
    }

    if (message.document) {
      return {
        updateId: update.update_id,
        type: 'file',
        source: 'keyboard',
        fileId: message.document.file_id,
        mimeType: message.document.mime_type,
        rawUpdate: update,
      };
    }

    if (message.text) {
      const command = message.text.startsWith('/') ? message.text.split(/[\s@]/)[0] : undefined;
      return {
        updateId: update.update_id,
        type: command ? 'command' : 'text',
        text: message.text,
        source: 'keyboard',
        command,
        rawUpdate: update,
      };
    }
  }

  if (callback_query) {
    return {
      updateId: update.update_id,
      type: 'callback_query',
      source: 'button',
      callbackData: callback_query.data,
      rawUpdate: update,
    };
  }

  return null;
}
