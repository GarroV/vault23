import type { BotContext, ModuleResult } from '../../core/types.ts';
import { createContractor, listContractors, searchContractors } from './queries.ts';

export async function handleContractorCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_contractor_name'));
  return { ok: true, session: { state: 'contractor_awaiting_name', data: {} } };
}

export async function handleContractorNameInput(ctx: BotContext): Promise<ModuleResult> {
  const name = ctx.event.text?.trim() ?? '';
  if (!name) {
    await ctx.reply(ctx.t('error_empty_contractor_name'));
    return { ok: false };
  }

  try {
    await createContractor(ctx.db, ctx.user.workspaceId, name);
    await ctx.reply(ctx.t('contractor_created', { name }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contractors] handleContractorNameInput error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleContractorsListCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const contractors = await listContractors(ctx.db, ctx.user.workspaceId);
    if (contractors.length === 0) {
      await ctx.reply(ctx.t('contractors_empty'));
      return { ok: true, clearSession: true };
    }
    const lines = contractors.map(c => `• ${c.name}`).join('\n');
    await ctx.reply(lines);
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contractors] list error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleFindCommand(ctx: BotContext): Promise<ModuleResult> {
  const query = ctx.event.text?.replace(/^\/find\s*/i, '').trim() ??
    ctx.event.command?.replace('/find', '').trim() ?? '';

  if (!query) {
    await ctx.reply(ctx.t('ask_find_query'));
    return { ok: true, session: { state: 'find_awaiting_query', data: {} } };
  }

  return searchAndReply(ctx, query);
}

export async function handleFindQuery(ctx: BotContext): Promise<ModuleResult> {
  const query = ctx.event.text?.trim() ?? '';
  if (!query) {
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
  return searchAndReply(ctx, query);
}

async function searchAndReply(ctx: BotContext, query: string): Promise<ModuleResult> {
  try {
    const results = await searchContractors(ctx.db, ctx.user.workspaceId, query);
    if (results.length === 0) {
      await ctx.reply(ctx.t('find_empty', { query }));
      return { ok: true, clearSession: true };
    }
    const lines = results.map(c => `• ${c.name}${c.notes ? ` — ${c.notes}` : ''}`).join('\n');
    await ctx.reply(lines);
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contractors] search error', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
