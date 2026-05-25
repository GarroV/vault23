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
        mimeType: message.voice.mime_type ?? 'audio/ogg',
        fileSize: message.voice.file_size,
        rawUpdate: update,
      };
    }

    if (message.document) {
      return {
        updateId: update.update_id,
        type: 'file',
        source: 'keyboard',
        fileId: message.document.file_id,
        fileName: message.document.file_name,
        mimeType: message.document.mime_type,
        fileSize: message.document.file_size,
        rawUpdate: update,
      };
    }

    if (message.photo && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      return {
        updateId: update.update_id,
        type: 'file',
        source: 'keyboard',
        fileId: largest.file_id,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: largest.file_size,
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
