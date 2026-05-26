import type { BotContext, ModuleResult } from '../../core/types.ts';
import { createContractor, listContractors, searchContractors, createService, listServices } from './queries.ts';

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

// ─── Services ────────────────────────────────────────────────────────────────

export async function handleAddServiceCommand(ctx: BotContext): Promise<ModuleResult> {
  await ctx.reply(ctx.t('ask_service_name'));
  return { ok: true, session: { state: 'service_awaiting_name', data: {} } };
}

export async function handleServiceNameInput(ctx: BotContext): Promise<ModuleResult> {
  const name = ctx.event.text?.trim() ?? '';
  if (!name) {
    await ctx.reply(ctx.t('error_empty_service_name'));
    return { ok: false };
  }
  await ctx.reply(ctx.t('ask_service_price'));
  return { ok: true, session: { state: 'service_awaiting_price', data: { name } } };
}

export async function handleServicePriceInput(ctx: BotContext): Promise<ModuleResult> {
  const raw = ctx.event.text?.trim() ?? '';
  const name = ctx.session.data.name as string;

  let price: number | null = null;
  let unit: string | null = null;

  if (raw && raw !== '/skip') {
    // "1500", "1500/час", "1500 RUB/шт"
    const match = raw.match(/^([\d.,]+)\s*(?:[A-Za-zА-Яа-яЁё$€£]+\s*)?(?:\/\s*(.+))?$/);
    if (match) {
      price = parseFloat(match[1].replace(',', '.'));
      unit = match[2]?.trim() ?? null;
    } else {
      await ctx.reply(ctx.t('error_invalid_price'));
      return { ok: false };
    }
  }

  const contractors = await listContractors(ctx.db, ctx.user.workspaceId);
  if (contractors.length > 0) {
    const buttons = contractors.slice(0, 5).map(c => [
      { text: c.name, callbackData: `service_contractor:${c.id}` },
    ]);
    buttons.push([{ text: ctx.t('service_btn_no_contractor'), callbackData: 'service_contractor:none' }]);
    await ctx.replyWithButtons(ctx.t('ask_service_contractor'), buttons);
    return { ok: true, session: { state: 'service_awaiting_contractor', data: { name, price, unit } } };
  }

  try {
    await createService(ctx.db, ctx.user.workspaceId, name, price, unit, null);
    await ctx.reply(ctx.t('service_created', { name }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contractors] createService error', { error: message });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleServiceContractorPick(ctx: BotContext): Promise<ModuleResult> {
  const raw = ctx.event.callbackData?.split(':')[1];
  const { name, price, unit } = ctx.session.data as { name: string; price: number | null; unit: string | null };
  const contractorId = (!raw || raw === 'none') ? null : raw;

  try {
    await createService(ctx.db, ctx.user.workspaceId, name, price, unit, contractorId);
    await ctx.reply(ctx.t('service_created', { name }));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contractors] createService error', { error: message });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}

export async function handleServicesListCommand(ctx: BotContext): Promise<ModuleResult> {
  try {
    const services = await listServices(ctx.db, ctx.user.workspaceId);
    if (services.length === 0) {
      await ctx.reply(ctx.t('services_empty'));
      return { ok: true, clearSession: true };
    }

    const groups = new Map<string, typeof services>();
    for (const s of services) {
      const key = s.contractor_name ?? '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    const lines: string[] = [];
    for (const [group, items] of groups) {
      if (group !== '__none__') lines.push(`\n*${group}*`);
      for (const s of items) {
        const priceStr = s.price !== null
          ? ` — ${s.price} ${s.currency}${s.unit ? '/' + s.unit : ''}`
          : '';
        lines.push(`• ${s.name}${priceStr}`);
      }
    }

    await ctx.reply(lines.join('\n').trim());
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[contractors] services list error', { error: message });
    await ctx.reply(ctx.t('error_unexpected'));
    return { ok: false, clearSession: true };
  }
}
