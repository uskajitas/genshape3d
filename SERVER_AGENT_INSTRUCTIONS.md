# Server-side follow-up instructions

This commit ships the **frontend redesign + Stripe scaffolding** for GenShape3D.
The server-side wiring (Stripe products, env vars, webhook URL, infra) still
needs to be set up. Below is everything the next agent needs to finish it.

---

## What was added in this commit

### Server (`/server`)
- **`src/billing.ts`** — new module containing:
  - `CREDIT_PACKS` catalog (single source of truth: `starter` = 10 credits / $3, `creator` = 40 credits / $10).
  - `listPacks` → `GET /api/billing/packs` (public catalog the pricing page reads).
  - `createCheckout` → `POST /api/billing/checkout` (creates a Stripe Checkout session).
  - `stripeWebhook` → `POST /api/billing/webhook` (verifies signature, grants credits on `checkout.session.completed`).
- **`src/usersRepo.ts`** — added `addCredits(email, amount, { kind, ref })`. Idempotent via a new `genshape3d_credit_ledger` table that's auto-created on first call (so no separate migration). Duplicate webhook deliveries with the same `ref` are silently no-op.
- **`src/index.ts`** — three routes wired in. **Important:** the webhook is mounted **before** `express.json()` because Stripe needs the raw body to verify signatures. Don't move it.
- **`package.json`** — added `stripe ^17.0.0`.
- **`.env.example`** — five new env vars documented (see below).

### Client (`/client`)
- **`src/main.tsx`** — theme tokens reshaped to purple + pink. Token names (`primary`, `violet`, `green`…) preserved so every existing styled-component picks up the new palette automatically.
- **`src/pages/Landing.tsx`** — copy simplified to image-to-3D only, three pay-as-you-go price tiers, low launch prices.

---

## Things the next agent must do

### 1. Install the new dependency
```bash
cd /server
npm install
```
Confirms `stripe` is on disk and types resolve.

### 2. Configure Stripe products (one-time, in Stripe dashboard)
Create two **one-time** Products (not subscriptions) under Products → Add product:

| Pack name      | Price | Currency | Notes                        |
| -------------- | ----- | -------- | ---------------------------- |
| Starter pack   | $3.00 | USD      | 10 image-to-3D generations   |
| Creator pack   | $10.00| USD      | 40 image-to-3D generations   |

For each, copy the **Price ID** (starts with `price_…`, NOT `prod_…`) into the corresponding env var below. The mapping `priceId → credits` lives entirely server-side in `billing.ts`'s `CREDIT_PACKS` constant — never trust the client about credit grants.

### 3. Fill in `/server/.env`
Five new env vars to set (full list in `.env.example`):

```
APP_PUBLIC_URL=https://genshape3d.com         # or http://localhost:3110 for dev
STRIPE_SECRET_KEY=sk_test_…                   # https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=whsec_…                 # see step 4
STRIPE_PRICE_STARTER=price_…                  # from step 2
STRIPE_PRICE_CREATOR=price_…                  # from step 2
```

### 4. Wire the webhook
**Local dev (using Stripe CLI):**
```bash
stripe login                                                          # one-time
stripe listen --forward-to localhost:8110/api/billing/webhook
```
The CLI prints a `whsec_…` signing secret on startup → paste into `STRIPE_WEBHOOK_SECRET`.

**Production:** in Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://<your-server-domain>/api/billing/webhook`
- Events: `checkout.session.completed`
- Copy the signing secret into the production `STRIPE_WEBHOOK_SECRET`.

### 5. Wire the client's CTAs to checkout
The pricing CTAs in `client/src/pages/Landing.tsx` currently route to `/login`. Once auth is settled, point each to:

```ts
const r = await fetch('/api/billing/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ packId: 'starter', email: user.email }),
});
const { url } = await r.json();
window.location.href = url;
```

If the user isn't signed in, route to `/login` first (we need a verified email before checkout — that email is what the webhook credits).

### 6. End-to-end smoke test
1. `npm run dev` in both `/server` and `/client`.
2. `stripe listen --forward-to localhost:8110/api/billing/webhook` in a third terminal.
3. Sign in to the app, click a pricing CTA → Stripe Checkout.
4. Use test card `4242 4242 4242 4242` (any future date / any CVC).
5. Stripe redirects to `/dashboard?checkout=success`.
6. Within ~1 sec the webhook fires and credits should appear on the user.
7. Confirm in DB:
   ```sql
   SELECT email, credits FROM genshape3d_users WHERE email = 'YOUR_TEST_EMAIL';
   SELECT * FROM genshape3d_credit_ledger ORDER BY id DESC LIMIT 5;
   ```
8. Replay the same Stripe event from the CLI — verify the ledger refuses the duplicate (idempotency check) and `credits` doesn't double.

### 7. Optional but recommended
- Add `kind: 'topup' | 'promo' | 'refund'` UI in admin so promo grants are auditable.
- Add `GET /api/billing/me` returning the user's credits + recent ledger entries — useful for the dashboard's credit pill.
- Hook a "credits low" banner into the dashboard when `credits < 3`.

---

## Things deliberately NOT done in this commit

- **Subscriptions** — only one-time credit packs for v1. Easy to add later via a second `mode: 'subscription'` checkout flow + `customer.subscription.*` webhook handlers.
- **Stripe Tax / multi-currency** — keep it USD until customer geography demands it.
- **Customer Portal** — not needed yet (no subscription = nothing to manage).
- **Dashboard layout rewrite** — the existing Dashboard.tsx is 2,163 lines and already wired to backend. Theme tokens propagate through it automatically. A Meshy-style 4-zone redesign is a separate, isolated piece — leave for a later commit.
- **Pre-existing TS error** at `Dashboard.tsx:1555` (`Avatar $src={user?.photoURL}` — `null` not assignable to `string | undefined`). Easy fix when the Dashboard pass happens: `$src={user?.photoURL ?? undefined}`.

---

## Reference

- Full design rationale: see `genshape3d-redesign-proposal.md` at the repo root.
- Credit pack constants: `server/src/billing.ts` (`CREDIT_PACKS`).
- Idempotency mechanism: `server/src/usersRepo.ts` (`addCredits` + `genshape3d_credit_ledger` UNIQUE on `ref`).
