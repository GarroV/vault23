/**
 * Stripe webhook handler.
 *
 * Required Supabase Secrets:
 *   STRIPE_SECRET_KEY        — Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET    — from Stripe Dashboard > Webhooks > Signing secret
 *   TELEGRAM_BOT_TOKEN       — to notify users
 *
 * Stripe events handled:
 *   checkout.session.completed      → activate workspace
 *   invoice.payment_succeeded       → extend period, clear past_due
 *   invoice.payment_failed          → mark past_due, notify user
 *   customer.subscription.deleted   → cancel workspace
 *   customer.subscription.updated   → update plan
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  verifyStripeSignature,
  type StripeWebhookEvent,
} from '../bot/modules/billing/stripe.ts';
import {
  isEventProcessed,
  markEventProcessed,
  getWorkspaceByStripeCustomer,
  activateWorkspace,
  updateWorkspaceStatus,
} from '../bot/modules/billing/queries.ts';

const PLAN_BY_PRICE: Record<string, string> = {
  // Populated from env so we don't hardcode price IDs here
};

function getPlanFromPriceId(priceId: string): string {
  const solo = Deno.env.get('STRIPE_PRICE_SOLO') ?? '';
  const team = Deno.env.get('STRIPE_PRICE_TEAM') ?? '';
  if (priceId === solo) return 'solo';
  if (priceId === team) return 'team';
  return 'solo';
}

async function notifyUser(
  token: string,
  telegramChatId: string,
  text: string,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramChatId, text }),
  });
}

async function getTelegramChatId(db: ReturnType<typeof createClient>, workspaceId: string): Promise<string | null> {
  const { data } = await db
    .from('users')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single();

  if (!data) return null;
  const userId = (data as { id: string }).id;

  const { data: auth } = await db
    .from('auth_methods')
    .select('value')
    .eq('user_id', userId)
    .eq('type', 'telegram')
    .single();

  return (auth as { value?: string } | null)?.value ?? null;
}

Deno.serve(async (req: Request) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('[stripe-webhook] missing env vars');
    return new Response('Config error', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature') ?? '';
  const payload = await req.text();

  // Verify HMAC signature
  const valid = await verifyStripeSignature(payload, signature, webhookSecret);
  if (!valid) {
    console.warn('[stripe-webhook] invalid signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const db = createClient(supabaseUrl, serviceKey);

  // Idempotency check
  if (await isEventProcessed(db, event.id)) {
    console.log('[stripe-webhook] duplicate event, skipping', { eventId: event.id });
    return new Response('OK', { status: 200 });
  }

  try {
    await handleEvent(db, event, telegramToken);
    await markEventProcessed(db, event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] handler error', { eventId: event.id, type: event.type, error: message });
    // Return 200 to prevent Stripe from retrying events we can't process
    return new Response('OK', { status: 200 });
  }

  return new Response('OK', { status: 200 });
});

async function handleEvent(
  db: ReturnType<typeof createClient>,
  event: StripeWebhookEvent,
  telegramToken: string,
): Promise<void> {
  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const workspaceId = (obj.metadata as Record<string, string>)?.workspace_id;
      const customerId = obj.customer as string;
      const subscriptionId = obj.subscription as string;
      const chatId = (obj.metadata as Record<string, string>)?.telegram_chat_id;

      if (!workspaceId || !customerId || !subscriptionId) {
        console.warn('[stripe-webhook] checkout.completed missing fields', { workspaceId, customerId });
        return;
      }

      // Fetch subscription to get price ID and period end
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` },
      });
      const sub = await subRes.json() as {
        current_period_end: number;
        items: { data: Array<{ price: { id: string } }> };
      };

      const priceId = sub.items.data[0]?.price?.id ?? '';
      const plan = getPlanFromPriceId(priceId);
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

      await activateWorkspace(db, workspaceId, customerId, subscriptionId, plan, periodEnd);

      if (chatId && telegramToken) {
        await notifyUser(telegramToken, chatId, '✅ Подписка оформлена! Добро пожаловать в ' + plan.charAt(0).toUpperCase() + plan.slice(1) + '.');
      }

      console.log('[stripe-webhook] workspace activated', { workspaceId, plan });
      break;
    }

    case 'invoice.payment_succeeded': {
      const customerId = obj.customer as string;
      const periodEnd = new Date((obj.period_end as number) * 1000).toISOString();

      const workspace = await getWorkspaceByStripeCustomer(db, customerId);
      if (!workspace) return;

      if (workspace.status === 'past_due') {
        await updateWorkspaceStatus(db, workspace.id, 'active', periodEnd);
        const chatId = await getTelegramChatId(db, workspace.id);
        if (chatId && telegramToken) {
          await notifyUser(telegramToken, chatId, '✅ Оплата прошла, доступ восстановлен.');
        }
      } else {
        await updateWorkspaceStatus(db, workspace.id, 'active', periodEnd);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const customerId = obj.customer as string;
      const workspace = await getWorkspaceByStripeCustomer(db, customerId);
      if (!workspace) return;

      if (workspace.status === 'active') {
        await updateWorkspaceStatus(db, workspace.id, 'past_due');
        const chatId = await getTelegramChatId(db, workspace.id);
        if (chatId && telegramToken) {
          await notifyUser(telegramToken, chatId, '⚠️ Оплата не прошла. Обнови способ оплаты через /subscription пока аккаунт не заблокирован (7 дней grace period).');
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = obj.customer as string;
      const workspace = await getWorkspaceByStripeCustomer(db, customerId);
      if (!workspace) return;

      await updateWorkspaceStatus(db, workspace.id, 'cancelled');
      const chatId = await getTelegramChatId(db, workspace.id);
      if (chatId && telegramToken) {
        await notifyUser(telegramToken, chatId, '⛔ Подписка отменена. Данные будут храниться 30 дней. Возобнови подписку через /subscription.');
      }
      break;
    }

    case 'customer.subscription.updated': {
      const customerId = obj.customer as string;
      const workspace = await getWorkspaceByStripeCustomer(db, customerId);
      if (!workspace) return;

      const priceId = (obj as { items?: { data: Array<{ price: { id: string } }> } })
        ?.items?.data[0]?.price?.id ?? '';
      if (priceId) {
        const newPlan = getPlanFromPriceId(priceId);
        if (newPlan !== workspace.plan) {
          await db.from('workspaces').update({ plan: newPlan }).eq('id', workspace.id);
          console.log('[stripe-webhook] plan updated', { workspaceId: workspace.id, newPlan });
        }
      }
      break;
    }

    default:
      console.log('[stripe-webhook] unhandled event type', { type: event.type });
  }
}
