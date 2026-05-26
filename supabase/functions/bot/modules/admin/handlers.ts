import type { BotContext, ModuleResult } from '../../core/types.ts';
import {
  CONFIGURABLE_KEYS,
  getConfig,
  setConfig,
  listConfigs,
  maskValue,
  isPlatformAdmin,
} from '../../core/config.ts';

async function checkAdmin(ctx: BotContext): Promise<boolean> {
  const ok = await isPlatformAdmin(ctx.db, ctx.identity.userId, ctx.identity.telegramId);
  if (!ok) {
    await ctx.reply(ctx.t('admin_only'));
  }
  return ok;
}

export async function handleSetConfig(ctx: BotContext): Promise<ModuleResult> {
  if (!await checkAdmin(ctx)) return { ok: false };

  const args = (ctx.event.text ?? '').replace(/^\/setconfig\s*/i, '').trim();
  const spaceIdx = args.indexOf(' ');
  if (!args || spaceIdx === -1) {
    await ctx.reply(ctx.t('config_set_usage'));
    return { ok: false };
  }

  const key = args.slice(0, spaceIdx).trim().toUpperCase();
  const value = args.slice(spaceIdx + 1).trim();

  if (!value) {
    await ctx.reply(ctx.t('config_set_usage'));
    return { ok: false };
  }

  const result = await setConfig(ctx.db, key, value, ctx.identity.userId);

  if (!result.ok) {
    if (result.error === 'forbidden_key') {
      await ctx.reply(ctx.t('config_set_forbidden', { key }));
    } else {
      const keys = Array.from(CONFIGURABLE_KEYS).sort().join('\n');
      await ctx.reply(ctx.t('config_set_unknown', { key, keys }));
    }
    return { ok: false };
  }

  await ctx.reply(ctx.t('config_set_ok', { key }));
  return { ok: true };
}

export async function handleGetConfig(ctx: BotContext): Promise<ModuleResult> {
  if (!await checkAdmin(ctx)) return { ok: false };

  const key = (ctx.event.text ?? '').replace(/^\/getconfig\s*/i, '').trim().toUpperCase();
  if (!key) {
    await ctx.reply(ctx.t('config_get_usage'));
    return { ok: false };
  }

  if (!CONFIGURABLE_KEYS.has(key)) {
    await ctx.reply(ctx.t('config_get_unknown', { key }));
    return { ok: false };
  }

  const raw = await getConfig(ctx.db, key);
  if (!raw) {
    await ctx.reply(ctx.t('config_get_not_set', { key }));
  } else {
    await ctx.reply(ctx.t('config_get_value', { key, value: maskValue(raw) }));
  }
  return { ok: true };
}

export async function handleListConfigs(ctx: BotContext): Promise<ModuleResult> {
  if (!await checkAdmin(ctx)) return { ok: false };

  const configs = await listConfigs(ctx.db);
  const rows = configs.map(c => {
    const label = c.set
      ? ctx.t('configs_row_set', { key: c.key })
      : ctx.t('configs_row_unset', { key: c.key });
    const ts = c.updated_at ? ` (${c.updated_at.slice(0, 10)})` : '';
    return label + ts;
  });

  await ctx.reply(ctx.t('configs_header', { rows: rows.join('\n') }));
  return { ok: true };
}

export async function handleAdminStats(ctx: BotContext): Promise<ModuleResult> {
  if (!await checkAdmin(ctx)) return { ok: false };

  const [{ count: workspaces }, { count: users }, { count: tasks }, { count: notes }] =
    await Promise.all([
      ctx.db.from('workspaces').select('id', { count: 'exact', head: true }),
      ctx.db.from('users').select('id', { count: 'exact', head: true }),
      ctx.db.from('tasks').select('id', { count: 'exact', head: true }),
      ctx.db.from('notes').select('id', { count: 'exact', head: true }),
    ]);

  await ctx.reply(
    ctx.t('admin_stats_header', {
      workspaces: String(workspaces ?? 0),
      users: String(users ?? 0),
      tasks: String(tasks ?? 0),
      notes: String(notes ?? 0),
    }),
  );
  return { ok: true };
}
