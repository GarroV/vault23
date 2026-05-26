import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import {
  handleSetConfig,
  handleGetConfig,
  handleListConfigs,
  handleAdminStats,
} from './handlers.ts';

registerLocale(ru, en);

export class AdminModule implements BotModule {
  readonly name = 'admin';
  readonly commands = ['/setconfig', '/getconfig', '/configs', '/adminstats'];

  canHandle(event: BotEvent, _session: SessionState): boolean {
    return (
      event.command === '/setconfig' ||
      event.command === '/getconfig' ||
      event.command === '/configs' ||
      event.command === '/adminstats'
    );
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    switch (ctx.event.command) {
      case '/setconfig':  return handleSetConfig(ctx);
      case '/getconfig':  return handleGetConfig(ctx);
      case '/configs':    return handleListConfigs(ctx);
      case '/adminstats': return handleAdminStats(ctx);
      default:
        console.error('[admin] unhandled command', { command: ctx.event.command });
        await ctx.reply(ctx.t('error_unexpected'));
        return { ok: false, clearSession: true };
    }
  }
}
