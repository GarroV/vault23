import type { BotContext, ModuleResult } from '../../core/types.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text: body }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error (${res.status}): ${err}`);
  }
}

export async function handleEmailCommand(ctx: BotContext): Promise<ModuleResult> {
  const emailGate = ctx.gate('email_send');
  if (!emailGate.allowed) {
    await ctx.reply(ctx.t('gate_plan_limit'));
    return { ok: false, clearSession: true };
  }

  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!apiKey) {
    await ctx.reply(ctx.t('email_not_configured'));
    return { ok: false, clearSession: true };
  }

  await ctx.reply(ctx.t('email_ask_recipient'));
  return { ok: true, session: { state: 'email_awaiting_recipient', data: {} } };
}

export async function handleRecipientInput(ctx: BotContext): Promise<ModuleResult> {
  const to = ctx.event.text?.trim() ?? '';
  if (!to) {
    await ctx.reply(ctx.t('email_empty_field'));
    return { ok: false };
  }
  if (!EMAIL_REGEX.test(to)) {
    await ctx.reply(ctx.t('email_invalid_address'));
    return { ok: false };
  }

  await ctx.reply(ctx.t('email_ask_subject'));
  return { ok: true, session: { state: 'email_awaiting_subject', data: { to } } };
}

export async function handleSubjectInput(ctx: BotContext): Promise<ModuleResult> {
  const subject = ctx.event.text?.trim() ?? '';
  if (!subject) {
    await ctx.reply(ctx.t('email_empty_field'));
    return { ok: false };
  }

  await ctx.reply(ctx.t('email_ask_body'));
  return {
    ok: true,
    session: {
      state: 'email_awaiting_body',
      data: { to: ctx.session.data.to, subject },
    },
  };
}

export async function handleBodyInput(ctx: BotContext): Promise<ModuleResult> {
  const body = ctx.event.text?.trim() ?? '';
  if (!body) {
    await ctx.reply(ctx.t('email_empty_field'));
    return { ok: false };
  }

  const to = ctx.session.data.to as string;
  const subject = ctx.session.data.subject as string;
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const fromAddress = Deno.env.get('EMAIL_FROM_ADDRESS') ?? 'bot@vault23.app';

  if (!apiKey) {
    await ctx.reply(ctx.t('email_not_configured'));
    return { ok: false, clearSession: true };
  }

  try {
    await sendViaResend(apiKey, fromAddress, to, subject, body);
    await ctx.reply(ctx.t('email_sent'));
    return { ok: true, clearSession: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] send failed', { error: message, userId: ctx.user.id });
    await ctx.reply(ctx.t('email_error'));
    return { ok: false, clearSession: true };
  }
}
