import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import { handleConnectCommand, handleSyncCommand } from './handlers.ts';

registerLocale(ru, en);

export class GoogleModule implements BotModule {
  readonly name = 'google';
  readonly commands = ['/connect', '/sync'];

  canHandle(event: BotEvent, _session: SessionState): boolean {
    return event.command === '/connect' || event.command === '/sync';
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    if (ctx.event.command === '/connect') return handleConnectCommand(ctx);
    if (ctx.event.command === '/sync') return handleSyncCommand(ctx);

    console.error('[google] unhandled command', { command: ctx.event.command });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
