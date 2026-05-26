import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import { handleSubscriptionCommand } from './handlers.ts';

registerLocale(ru, en);

export class BillingModule implements BotModule {
  readonly name = 'billing';
  readonly commands = ['/subscription'];

  canHandle(event: BotEvent, _session: SessionState): boolean {
    return event.command === '/subscription';
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    if (ctx.event.command === '/subscription') return handleSubscriptionCommand(ctx);

    console.error('[billing] unhandled command', { command: ctx.event.command });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
