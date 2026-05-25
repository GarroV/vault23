import type { BotContext, ModuleResult } from '../../core/types.ts';
import { getFilePath, downloadTelegramFile } from '../../telegram.ts';
import { getTasksForPicker, uploadAndRecord, MAX_FILE_BYTES } from './queries.ts';

const TELEGRAM_TOKEN = () => Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

export async function handleFileReceived(ctx: BotContext): Promise<ModuleResult> {
  const { fileId, fileName = 'file', mimeType = 'application/octet-stream', fileSize } = ctx.event;

  if (!fileId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  if (fileSize && fileSize > MAX_FILE_BYTES) {
    await ctx.reply(ctx.t('attach_too_large'));
    return { ok: false, clearSession: true };
  }

  try {
    const tasks = await getTasksForPicker(ctx.db, ctx.user.workspaceId);

    if (tasks.length === 0) {
      await ctx.reply(ctx.t('attach_no_tasks'));
      return { ok: false, clearSession: true };
    }

    const buttons = tasks.map(t => [{ text: t.title, callbackData: `attach_task:${t.id}` }]);
    buttons.push([{ text: ctx.t('attach_btn_cancel'), callbackData: 'attach_cancel' }]);

    await ctx.replyWithButtons(ctx.t('attach_choose_task'), buttons);
    return {
      ok: true,
      session: { state: 'attach_awaiting_task', data: { fileId, fileName, mimeType, fileSize: fileSize ?? 0 } },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[attachments] handleFileReceived error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleAttachToTask(ctx: BotContext): Promise<ModuleResult> {
  const taskId = ctx.event.callbackData?.split(':')[1];
  const { fileId, fileName, mimeType } = ctx.session.data as {
    fileId?: string;
    fileName?: string;
    mimeType?: string;
  };

  if (!taskId || !fileId) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }

  try {
    const token = TELEGRAM_TOKEN();
    const filePath = await getFilePath(token, fileId);
    const fileBytes = await downloadTelegramFile(token, filePath);

    await uploadAndRecord(
      ctx.db,
      ctx.user.workspaceId,
      taskId,
      fileBytes,
      fileName ?? 'file',
      mimeType ?? 'application/octet-stream',
    );

    await ctx.reply(ctx.t('attach_saved'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[attachments] handleAttachToTask error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleAttachCancel(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('attach_cancelled'));
  return { ok: true, clearSession: true };
}
