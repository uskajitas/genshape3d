// ─────────────────────────────────────────────────────────────────────────────
// Billing — Stripe credit-pack purchases
//
// v1 scope: one-time credit packs only (no subscriptions yet). Each pack is
// one Stripe Product/Price; checkout returns a hosted Stripe Checkout URL.
// On payment_intent.succeeded (via webhook) we credit the user's balance.
//
// Setup:
//   1. npm install stripe   (in /server)
//   2. Set env vars:
//        STRIPE_SECRET_KEY       sk_test_…  (or sk_live_…)
//        STRIPE_WEBHOOK_SECRET   whsec_…
//        STRIPE_PRICE_STARTER    price_…   (the $3 / 10-credit pack)
//        STRIPE_PRICE_CREATOR    price_…   (the $10 / 40-credit pack)
//        APP_PUBLIC_URL          https://genshape3d.com  (or http://localhost:3110)
//   3. Add the two Stripe products in your Stripe dashboard with the matching
//      credit grants (we map price → credits via STRIPE_PRICE_* env vars).
//   4. Wire routes in index.ts (see bottom of this file).
//   5. In Stripe dashboard, add a webhook endpoint pointing to
//      <server>/api/billing/webhook listening for: checkout.session.completed
//
// Security:
//   - Never trust the client about the credit grant amount. The mapping
//     price → credits is server-side, sourced from env.
//   - All credit grants happen here on webhook, NEVER on the success redirect.
//   - The webhook handler must use the raw request body for signature
//     verification — index.ts mounts it BEFORE express.json().
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response } from 'express';
import { addCredits } from './usersRepo';

// `stripe` is loaded lazily so the server still boots if the package or keys
// are missing during early development.
let stripeInstance: any = null;
const getStripe = () => {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Stripe = require('stripe');
  stripeInstance = new Stripe(key, { apiVersion: '2024-06-20' });
  return stripeInstance;
};

// ── Credit packs ────────────────────────────────────────────────────────────
// Single source of truth — referenced by the client's pricing page and the
// webhook's credit-grant lookup. Price IDs come from env at runtime.

export interface CreditPack {
  id: 'starter' | 'creator';
  label: string;
  credits: number;
  priceCents: number;
  currency: 'usd';
  stripePriceEnvKey: 'STRIPE_PRICE_STARTER' | 'STRIPE_PRICE_CREATOR';
}

export const CREDIT_PACKS: Record<CreditPack['id'], CreditPack> = {
  starter: {
    id: 'starter',
    label: 'Starter pack',
    credits: 10,
    priceCents: 300,
    currency: 'usd',
    stripePriceEnvKey: 'STRIPE_PRICE_STARTER',
  },
  creator: {
    id: 'creator',
    label: 'Creator pack',
    credits: 40,
    priceCents: 1000,
    currency: 'usd',
    stripePriceEnvKey: 'STRIPE_PRICE_CREATOR',
  },
};

// Inverse lookup (Stripe price ID → CreditPack), built lazily because env may
// not be loaded when the module is imported.
const priceToPack = (): Record<string, CreditPack> => {
  const out: Record<string, CreditPack> = {};
  for (const pack of Object.values(CREDIT_PACKS)) {
    const priceId = process.env[pack.stripePriceEnvKey];
    if (priceId) out[priceId] = pack;
  }
  return out;
};

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/billing/packs
 * Returns the catalog the pricing page renders. Client never sees Stripe IDs.
 */
export async function listPacks(_req: Request, res: Response) {
  res.json({
    packs: Object.values(CREDIT_PACKS).map(p => ({
      id: p.id,
      label: p.label,
      credits: p.credits,
      priceCents: p.priceCents,
      currency: p.currency,
    })),
  });
}

/**
 * POST /api/billing/checkout
 * Body: { packId: 'starter' | 'creator', email: string }
 * Returns: { url: string } — redirect the user there.
 */
export async function createCheckout(req: Request, res: Response) {
  const { packId, email } = req.body as { packId?: string; email?: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!packId || !(packId in CREDIT_PACKS)) {
    return res.status(400).json({ error: 'unknown packId' });
  }
  const pack = CREDIT_PACKS[packId as CreditPack['id']];
  const priceId = process.env[pack.stripePriceEnvKey];
  if (!priceId) {
    return res.status(500).json({ error: `${pack.stripePriceEnvKey} not configured` });
  }
  const appUrl = process.env.APP_PUBLIC_URL || 'http://localhost:3110';

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      // Carry our own ids through to the webhook
      metadata: { email, packId: pack.id, credits: String(pack.credits) },
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/dashboard?checkout=cancel`,
    });
    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/billing/webhook
 * Stripe-signed webhook. MUST receive the raw body (see index.ts wiring).
 * Grants credits to the user when their checkout session completes.
 */
export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return res.status(400).send('webhook not configured');

  let event: any;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig as string, secret);
  } catch (e: any) {
    return res.status(400).send(`webhook signature failed: ${e.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.metadata?.email || session.customer_email;
      // Trust the priceId to derive credits (server-side mapping); fall back
      // to metadata.credits only if the price isn't known to us.
      const lineItems = await getStripe().checkout.sessions.listLineItems(session.id);
      const firstPriceId = lineItems.data?.[0]?.price?.id;
      const pack = firstPriceId ? priceToPack()[firstPriceId] : undefined;
      const credits = pack ? pack.credits : Number(session.metadata?.credits || 0);

      if (email && credits > 0) {
        await addCredits(email, credits, {
          kind: 'topup',
          ref: `stripe:${session.id}`,
        });
      }
    }
    res.json({ received: true });
  } catch (e: any) {
    // Acknowledge so Stripe doesn't retry forever; log for inspection.
    console.error('[billing] webhook handler error', e);
    res.status(200).json({ received: true, error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiring (paste into server/src/index.ts):
//
//   import { listPacks, createCheckout, stripeWebhook } from './billing';
//
//   // Webhook MUST use raw body — register BEFORE app.use(express.json()):
//   app.post(
//     '/api/billing/webhook',
//     express.raw({ type: 'application/json' }),
//     stripeWebhook,
//   );
//
//   // …app.use(express.json()) here…
//
//   app.get('/api/billing/packs', listPacks);
//   app.post('/api/billing/checkout', createCheckout);
// ─────────────────────────────────────────────────────────────────────────────
