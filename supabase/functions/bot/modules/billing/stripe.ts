const STRIPE_API = 'https://api.stripe.com/v1';

interface StripeCheckoutSession {
  url: string;
}

interface StripeBillingPortalSession {
  url: string;
}

async function stripePost(
  secretKey: string,
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe ${path} ${res.status}: ${err}`);
  }

  return await res.json();
}

async function stripeGet(secretKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe GET ${path} ${res.status}: ${err}`);
  }
  return await res.json();
}

export async function createCheckoutSession(
  secretKey: string,
  priceId: string,
  workspaceId: string,
  telegramChatId: string,
  customerEmail?: string,
): Promise<string> {
  const botUrl = 'https://t.me/VaultAssistantBot';

  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${botUrl}?start=sub_success`,
    cancel_url: `${botUrl}?start=sub_cancel`,
    'metadata[workspace_id]': workspaceId,
    'metadata[telegram_chat_id]': telegramChatId,
    'subscription_data[trial_period_days]': '0',
  };

  if (customerEmail) {
    params.customer_email = customerEmail;
  }

  const session = await stripePost(secretKey, '/checkout/sessions', params) as StripeCheckoutSession;
  return session.url;
}

export async function createOrGetCustomer(
  secretKey: string,
  workspaceId: string,
  email?: string,
): Promise<string> {
  const searchRes = await stripeGet(
    secretKey,
    `/customers/search?query=metadata['workspace_id']:'${workspaceId}'&limit=1`,
  ) as { data: Array<{ id: string }> };

  if (searchRes.data.length > 0) return searchRes.data[0].id;

  const params: Record<string, string> = {
    'metadata[workspace_id]': workspaceId,
  };
  if (email) params.email = email;

  const customer = await stripePost(secretKey, '/customers', params) as { id: string };
  return customer.id;
}

export async function createBillingPortalSession(
  secretKey: string,
  customerId: string,
): Promise<string> {
  const botUrl = 'https://t.me/VaultAssistantBot';
  const session = await stripePost(secretKey, '/billing_portal/sessions', {
    customer: customerId,
    return_url: botUrl,
  }) as StripeBillingPortalSession;

  return session.url;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export function constructWebhookEvent(
  payload: string,
  signature: string,
  secret: string,
): StripeWebhookEvent {
  // Stripe webhook verification requires HMAC-SHA256
  // In Deno we verify via the stripe-js SDK or manually
  // For now we do a simplified version — proper HMAC check done below

  const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const expectedSig = parts['v1'];

  if (!timestamp || !expectedSig) {
    throw new Error('Invalid Stripe signature header');
  }

  // Tolerance: 5 minutes
  const tsNum = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - tsNum) > 300) {
    throw new Error('Stripe webhook timestamp too old');
  }

  // Caller must verify HMAC separately — this just parses the event
  const event = JSON.parse(payload) as StripeWebhookEvent;
  return event;
}

export async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const expectedSig = parts['v1'];

  if (!timestamp || !expectedSig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature_bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(signature_bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedSig === expectedSig;
}
