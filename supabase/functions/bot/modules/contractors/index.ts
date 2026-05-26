import type { BotModule, BotContext, BotEvent, SessionState, ModuleResult } from '../../core/types.ts';
import { registerLocale } from '../../core/i18n.ts';
import { ru } from './locales/ru.ts';
import { en } from './locales/en.ts';
import {
  handleContractorCommand,
  handleContractorNameInput,
  handleContractorsListCommand,
  handleFindCommand,
  handleFindQuery,
  handleAddServiceCommand,
  handleServiceNameInput,
  handleServicePriceInput,
  handleServiceContractorPick,
  handleServicesListCommand,
} from './handlers.ts';

registerLocale(ru, en);

export class ContractorsModule implements BotModule {
  readonly name = 'contractors';
  readonly commands = ['/contractor', '/contractors', '/find', '/addservice', '/services'];

  canHandle(event: BotEvent, session: SessionState): boolean {
    return (
      session.state === 'contractor_awaiting_name' ||
      session.state === 'find_awaiting_query' ||
      session.state === 'service_awaiting_name' ||
      session.state === 'service_awaiting_price' ||
      session.state === 'service_awaiting_contractor'
    );
  }

  async handle(ctx: BotContext): Promise<ModuleResult> {
    const { event, session } = ctx;

    if (event.command === '/contractor')  return handleContractorCommand(ctx);
    if (event.command === '/contractors') return handleContractorsListCommand(ctx);
    if (event.command === '/find')        return handleFindCommand(ctx);
    if (event.command === '/addservice')  return handleAddServiceCommand(ctx);
    if (event.command === '/services')    return handleServicesListCommand(ctx);

    if (session.state === 'contractor_awaiting_name' && event.type === 'text') return handleContractorNameInput(ctx);
    if (session.state === 'find_awaiting_query'      && event.type === 'text') return handleFindQuery(ctx);
    if (session.state === 'service_awaiting_name'    && event.type === 'text') return handleServiceNameInput(ctx);
    if (session.state === 'service_awaiting_price'   && event.type === 'text') return handleServicePriceInput(ctx);
    if (session.state === 'service_awaiting_contractor' && event.type === 'callback') return handleServiceContractorPick(ctx);

    console.error('[contractors] unhandled state', { state: session.state, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
