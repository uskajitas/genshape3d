# GenShape3D — Frontend Redesign + Payments + Credits Proposal

## What's there today
- React 18 + Vite + TypeScript + styled-components (themed via `ThemeContext`).
- Firebase Auth (Google/Email).
- React Router with three pages: `Landing`, `Login`, `Dashboard`.
- Three.js `MeshViewer` and a `Dropdown`.
- Express + PostgreSQL backend with `usersRepo` and `jobsRepo`, Cloudflare R2 (S3 SDK) for asset storage.

## What we want
1. A redesigned dashboard UX that feels like Meshy / Tripo3D — focused, dense, asset-centric.
2. A purple + pink primary palette instead of their greens/yellows.
3. Real payments via Stripe.
4. A credits system that matches industry expectations and steers users toward subscription.

---

## 1) Visual & UX redesign

### Reference layout (Meshy + Tripo3D synthesis)
Three vertical zones in the dashboard, full-bleed:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP NAV  logo · workspace · community · learn · resources · ··· · ⓒ123 · Upgrade · 🔔 · 👤 │
├────────┬───────────────────────────┬────────────────────────────────────────┤
│  ICON  │   GENERATION CONFIG       │         CENTRAL VIEWPORT               │  ASSET RAIL
│  RAIL  │   (prompt, model, pose,   │   (empty state → preview → result)     │  (search +
│  72px  │    license, count, etc.)  │                                        │  3-col grid)
│        │   Width 280–320px         │                                        │  Width 320px
└────────┴───────────────────────────┴────────────────────────────────────────┘
                       ⤷ Bottom of config: cost preview + Generate button
```

- **Icon rail (left, 72px)**: vertical action stack — Assets, Image-to-3D, Text-to-3D, Print, Animate, Settings. Active item glows in the brand gradient.
- **Config panel (next, 280–320px)**: scrollable form — prompt textarea, model type toggle, AI model dropdown, pose pills, generation count, license toggle. Sticky footer shows estimated cost (in credits) and the big Generate button.
- **Central viewport**: empty state with a soft brand-tinted illustration and "What will you create today?" headline. On result, becomes the Three.js `MeshViewer` with floating overlay controls (regenerate, download, share, retopo, texture).
- **Asset rail (right, 320px)**: search bar + filter chips, then a paginated 2-column grid of past generations. Click → loads into central viewport. This replaces the current flat dashboard list.

### Theme — purple + pink
Define a single source of truth in `ThemeContext`. CSS variables driven from it. Suggested tokens (HSL keeps gradients clean):

```ts
// brand
brandPrimary:    '#A855F7'   // purple-500 — primary actions, active states
brandPrimaryHi:  '#C084FC'   // purple-400 — hover
brandPrimaryLo:  '#7E22CE'   // purple-700 — pressed / shadows
brandAccent:     '#EC4899'   // pink-500 — secondary highlight, badges
brandAccentHi:   '#F472B6'   // pink-400
brandGradient:   'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)'  // CTA buttons, logo

// surface (dark mode primary, light mode mirror)
bgRoot:          '#0B0712'   // almost-black with violet undertone
bgPanel:         '#150D24'   // panels / sidebars
bgPanelElev:     '#1E1432'   // hover / elevated cards
bgInput:         '#0F0A1B'
border:          '#2A1F3D'
borderStrong:    '#3D2C56'

// text
textPrimary:     '#F4EEFF'
textMuted:       '#A89CC4'
textDim:         '#6E6388'

// status
success:         '#10B981'
warn:            '#F59E0B'
danger:          '#EF4444'
```

- Primary CTA buttons (Generate, Upgrade, Pay): `brandGradient` background with pink glow shadow on hover.
- Active nav / icon-rail item: solid `brandPrimary` background with pink ring on focus.
- Credit balance pill in top nav: outlined with `brandAccent`, coin icon in `brandPrimary`.
- Loading shimmer: `brandPrimary → brandAccent` sweep.

### Pages to add
- `/pricing` — public marketing pricing page (also the upgrade modal source).
- `/billing` — authed billing portal (current plan, invoices, payment method, cancel).
- `/account` — profile + credit history.

### Incremental delivery (so it doesn't break)
1. **Theme refactor first.** Replace existing colors with brand tokens. Visible everywhere instantly. Keep current layout — just re-skin.
2. **Dashboard layout v2.** Build the 4-zone layout behind a feature flag (`/dashboard?v=2` or env flag). Iterate without breaking existing users.
3. **Asset rail.** Hook to existing `jobsRepo` listing; add infinite scroll + filters.
4. **Config panel.** Reorganize current Dashboard form into the dense Meshy-style form.
5. Cut over default to v2; keep v1 reachable via `?v=1` for one release.

---

## 2) Credits strategy

### Why credits (vs raw $) — the industry pattern
- Predictable consumption metering: each generation type has a different GPU cost; credits hide that complexity from the user.
- Easier promotions (anniversary bonuses, referral rewards, daily login).
- Lets the same "wallet" pay for future features (texture, retopo, animation) without re-pricing.
- Both Meshy and Tripo3D do this — users expect it.

### Credit costs per action (proposed)
Anchor: 1 credit ≈ A$0.10 effective at the lowest tier. Costs are integers, internal-only — users see "20 credits" not "$2".

| Action                                | Credits |
| ------------------------------------- | ------- |
| Text → 3D (Standard)                  | 20      |
| Text → 3D (HD / v3.1)                 | 40      |
| Image → 3D (Standard)                 | 20      |
| Image → 3D (HD)                       | 40      |
| Multi-image → 3D                      | 50      |
| Auto-retopo                           | 10      |
| Texture pass / re-texture             | 10      |
| Rig + animate (per clip)              | 30      |
| 3D print prep (slicing-ready export)  | 5       |
| Re-generate from same prompt (retry)  | 50% off |

Show this estimate live in the config panel footer before the user clicks Generate.

### Plans
Match Meshy/Tripo cadence — Free / Pro / Studio / Enterprise, monthly + yearly with yearly discount. Numbers below are starting points; tune after first 30 days of usage data.

| Plan          | Monthly  | Yearly (per mo) | Credits/mo | Concurrency | Queue priority | Commercial license | Asset retention |
| ------------- | -------- | --------------- | ---------- | ----------- | -------------- | ------------------ | --------------- |
| **Free**      | A$0      | —               | 100        | 1           | Low            | No (CC-BY 4.0)     | 30 days         |
| **Pro**       | A$19     | A$15            | 1,200      | 5           | High           | Yes                | Forever         |
| **Studio**    | A$59     | A$49            | 4,500      | 15          | Higher         | Yes                | Forever         |
| **Enterprise**| Contact  | —               | Custom     | Custom      | Highest        | Yes + SLA          | Forever         |

- **Top-up packs** for users who don't want to subscribe: 500 / 2,000 / 6,000 credits at a worse per-credit rate than subscriptions (steers toward subs).
- **Anniversary / launch promo banner** in top nav (the "We're Turning 3" pattern Meshy uses) — easy lever for paid conversion.
- **Referral**: invitee gets 200 credits, referrer gets 200 when invitee makes their first paid generation.

### Credit accounting rules
- Credits debit at job submit; refund automatically if the job fails on infrastructure error (track failure reason; user-error failures don't refund — discourage abuse).
- Subscription credits expire monthly (use-it-or-lose-it). Top-up credits never expire. Display both balances separately ("1,200 plan · 350 packs"). Spend plan credits first.
- Concurrency = simultaneous in-flight jobs. Enforce server-side per user.

### Data model additions (server)
- `users.subscription_id`, `users.subscription_status`, `users.subscription_plan`, `users.subscription_renewal_date`
- `users.credits_plan`, `users.credits_topup` (split balances)
- new table `credit_ledger` (id, user_id, delta, kind, ref_job_id, ref_payment_id, created_at) — append-only, every change goes through this
- new table `payments` (id, user_id, stripe_payment_intent_id, amount_cents, currency, kind: 'subscription'|'topup', status, created_at)
- new table `subscriptions` (mirrors stripe subscription state; reconciled via webhook)

---

## 3) Payments (Stripe)

### Why Stripe
Industry default for SaaS, supports subscriptions + one-time + tax + invoicing + a hosted Customer Portal that handles cancellation / payment-method changes for free. Both reference apps use it.

### Setup
- Create Stripe products: 2 × subscription products (Pro, Studio) each with monthly + yearly prices; 3 × one-time top-up products.
- Use **Stripe Checkout** (hosted) for the first version — zero PCI scope, fastest to ship, looks professional. Migrate to Elements later if you want fully embedded.
- Use **Stripe Customer Portal** for `/billing` — point to it, don't rebuild it.

### Backend endpoints
- `POST /api/billing/create-checkout-session` — body: `{ priceId, mode: 'subscription'|'payment' }`. Returns Checkout URL.
- `POST /api/billing/create-portal-session` — returns Customer Portal URL.
- `POST /api/stripe/webhook` — verify signature, handle:
  - `checkout.session.completed` → mark payment, top up credits if pack.
  - `customer.subscription.created/updated/deleted` → upsert `subscriptions`, set `users.subscription_*`, grant monthly credits on `invoice.paid` for the renewal cycle.
  - `invoice.payment_failed` → flip to `past_due`, soft-restrict generations until resolved.
- `GET /api/billing/me` — returns plan, credits split, renewal date, payment-method last4.

### Frontend touchpoints
- Top-nav credit pill: clicking opens a popover with split balances + "Top up" + "Upgrade".
- Upgrade modal (Meshy-style): plan grid with "Most Popular" Pro badge, monthly/yearly toggle, currency picker (default AUD), "Pay with Stripe" CTA.
- `/billing`: "Manage subscription" → opens Customer Portal in same window.
- Empty-state nudges when credits low: "You have 12 credits left. Top up or upgrade to keep generating."

### Security / correctness
- All credit grants happen **server-side from webhooks**, never from client success redirects. Client redirect is just UX.
- All credit debits happen **server-side at job submit**, inside a transaction with the ledger insert.
- Never trust client about job cost — server recalculates from action type.

---

## Suggested order of execution
1. Theme tokens + brand palette refactor — 0.5 day, instantly visible win, no risk.
2. Stripe products + backend `/billing` + webhook + DB migrations — 2 days.
3. Upgrade modal + top-nav credit pill + cost preview in config — 1 day.
4. Dashboard layout v2 (icon rail, config panel, asset rail) — 3 days.
5. `/pricing` and `/billing` pages — 1 day.
6. Top-up packs + anniversary banner mechanism — 0.5 day.
7. Referral hooks (link generation + ledger entries) — 1 day.

≈ 9 working days for v1. Roll out behind flag, cut over once Stripe is reconciling cleanly for a week.

## Open questions for you
1. Currency default — AUD only, or geo-detect with USD fallback?
2. Tax handling — turn on Stripe Tax (auto-VAT/GST) day-one, or invoice-only for now?
3. Free tier — do free users get commercial license (CC-BY 4.0 like Meshy) or strictly non-commercial?
4. Asset retention for free — actually delete after 30 days, or just hide?
5. Referral rewards — credits both ways, or only on paid conversion?
6. Light mode — needed at launch, or dark-only v1?
