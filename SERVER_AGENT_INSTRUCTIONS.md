# Server-side follow-up instructions

Multiple commits' worth of follow-ups stacked here. **Do the most recent
section first** (top of the file) — older sections may already be partly done.

---

## 📋 How to use this document (read this first if you're a new agent)

You are an agent running on one of the machines in the GenShape3D setup —
most often the **i7 home server** (the box that hosts the genshape3d API +
Postgres + Cloudflare tunnel), but occasionally a worker box (e.g. the
3090 GPU box being added 2026-05-11). The first line of each task section
below tells you which machine that task is for — if you're on the wrong
one, skip that section and look for the next match.

The user pointed you here so you can finish a deployment task end-to-end
without further instruction. You have terminal access to a checkout of
the repo (path varies by machine).

Workflow:

1. **Pull latest:**
   ```bash
   cd /f/cloudflare/genshape3d
   git pull origin main
   ```
2. **Find your task.** Read this file top to bottom. The **most recent**
   pending task is the topmost section under the first `---`. That is the
   one to do *now*. Older sections below it may already be done — verify
   the env vars / state before re-running them.
3. **Do every numbered step in order.** Don't skip steps. Don't substitute
   shortcuts. If a smoke test fails, stop and report — do not "fix" by
   editing code in another repo unless that section explicitly authorizes it.
4. **Report back to the user when done.** Specifically:
   - Confirm each numbered step completed (e.g., "step 1 generated token,
     step 2 added to .env, step 3 stored in password manager, …").
   - Paste any tokens / secrets the user needs to copy elsewhere into a
     channel they specified (password manager entry name, secure note,
     whatever). **Never** paste secrets into chat / email / git.
   - Surface any smoke-test failures with exact output.

Think of this file as the single source of truth for "what the i7 box
needs done that the user doesn't want to type out." If you're tempted to
do something that's not written here, stop and ask first.

---

## 🚨 LATEST: 3090 worker setup (added 2026-05-11)

**You are an agent running on the new 3090 box** (NOT the i7 home server).
The i7 side is already done — the control plane is live at
`https://api.genshape3d.com/api/workers/*` and the `WORKER_AUTH_TOKEN` is
issued. Your job is to bring this 3090 box up as a worker that registers,
long-polls for jobs, runs them, and reports completion.

If you're actually on the i7 box, this section is not for you. Scroll down
to the "✅ DONE — i7 control-plane setup" section to confirm what's already
done there, and stop. Don't re-run those steps.

### What's already true
- Server endpoints under `/api/workers/*` are live and authenticated. Auth
  is `Authorization: Bearer <token>`; the token (`WORKER_AUTH_TOKEN`) is on
  the i7's `.env` and was handed off to the user via password-manager entry
  `genshape3d WORKER_AUTH_TOKEN` (or written to
  `~/.genshape3d-handoff/token.txt` on the i7 — ask the user which channel
  they used).
- `genshape3d_jobs` table has the new `model` and `assignedWorkerId`
  columns (defaults `'hunyuan3d'` and `''`). All historical jobs are
  backfilled.
- The legacy 1080 worker still polls Postgres directly and is unchanged.
  Both old and new can co-exist; the 1080 takes jobs row-by-row, the 3090
  takes jobs via the new claim endpoint.

### What you must do

#### 1. Get the token (do NOT generate a new one)
Ask the user for the value of `WORKER_AUTH_TOKEN`. They will paste it once
into a channel they specify (password manager, secure file, etc.). Do NOT
paste it into chat, email, or git. If they say "it's in my password
manager," wait for them to bring it to you — don't proceed without it.

Once you have it, store it in the worker's `.env` on THIS machine:
```
WORKER_AUTH_TOKEN=<paste-here>
GENSHAPE3D_API=https://api.genshape3d.com
WORKER_ID=worker-3090-home              # any unique stable string
WORKER_MODELS=hunyuan3d                  # comma-separated list of model ids this box can run
WORKER_CAPACITY=1                        # how many concurrent jobs (almost always 1 for a single-GPU box)
```

Add `.env` to your worker repo's `.gitignore` before doing anything else.

#### 2. Sanity-check connectivity + auth
Before writing any worker code:

```bash
# No auth → expect 401
curl -i -X POST https://api.genshape3d.com/api/workers/register \
  -H 'Content-Type: application/json' \
  -d '{"id":"sanity-check","models":["hunyuan3d"],"capacity":1}'

# With auth → expect 200 with {"ok":true,"worker":{...}}
curl -i -X POST https://api.genshape3d.com/api/workers/register \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $WORKER_AUTH_TOKEN" \
  -d '{"id":"sanity-check","models":["hunyuan3d"],"capacity":1}'
```

If both behave as expected, the network path and auth are good. The
`sanity-check` worker entry is in-memory only and falls out when the i7
server next restarts — harmless, ignore it.

#### 3. Worker control-plane reference (the loop you'll implement)
All endpoints require `Authorization: Bearer $WORKER_AUTH_TOKEN`. Source
of truth: `server/src/workersApi.ts` on the i7 repo.

| # | Method + path | Purpose | Body | Response |
|---|---|---|---|---|
| 1 | `POST /api/workers/register` | Announce yourself | `{ id, models: string[], capacity: number }` | `{ ok, worker }` |
| 2 | `POST /api/workers/:id/claim` | Long-poll for next pending job (~25s hold) | (empty) | `{ job }` (200) or `204` if no job |
| 3 | `POST /api/workers/:id/progress` | Optional progress ping mid-job | `{ jobId, pct?, phase?, step?, total? }` | `{ ok: true }` |
| 4 | `POST /api/workers/:id/complete` | Final status | `{ jobId, status: 'done'\|'failed'\|'cancelled', resultUrl? }` | `{ ok: true }` |
| 5 | `POST /api/workers/:id/heartbeat` | Idle keep-alive + cancel-flag check | `{ jobIds?: string[] }` (currently-active ids) | `{ ok: true, cancelled: string[] }` |

Notes:
- The claim endpoint long-polls server-side (~25s), so call it in a loop —
  the response is immediate when a job becomes available, otherwise it
  returns `204` and you call again. Don't add client-side delay.
- `:id` in path-params is your `WORKER_ID` — keep it stable across restarts
  so the registry tracks the same worker.
- If you get `409 worker at capacity`, you've already claimed `capacity`
  jobs — call `complete` before claiming again.
- Call `heartbeat` every ~30s while idle, and during long jobs every ~30s
  (sending `jobIds: [<currently-running-job-id>]`). The response's
  `cancelled` array tells you which of those the user has asked to cancel —
  abort the in-flight subprocess gracefully when you see your job there.

#### 4. The `Job` payload you'll receive from `/claim`
Source: `server/src/jobsRepo.ts` → `Job` interface. The fields you'll
actually consume in a Hunyuan3D pipeline:

- `id` — pass back unchanged on `progress` / `complete`.
- `imageUrl` — public URL of the input image (already in Cloudflare R2).
- `prompt`, `style` — optional user text.
- `octreeResolution`, `targetFaceCount`, `inferenceSteps`,
  `guidanceScale`, `numChunks`, `seed`, `polygonBudget`, `textureRes`,
  `exportFormat`, `detailLevel`, `doTexture` — Hunyuan3D knobs. Treat as
  hints; clamp to whatever your local installation supports.
- `model` — the worker should validate this is in its declared `models`
  list. Server already filters by this, but defence-in-depth.
- `requestCancel`, `progressPct`, etc. — server-managed, don't mutate.

When done, upload the resulting GLB to R2 yourself (use the same bucket
as the 1080 worker — see `genshape3d_nvidia` for the existing pattern)
and pass the public URL as `resultUrl` on `complete`.

#### 5. Reference the existing 1080 worker for the inference pipeline
The 1080's repo (`F:\cloudflare\genshape3d_nvidia` on the home server)
shows the actual Hunyuan3D invocation, R2 upload, and image preprocessing.
**Do NOT modify that repo from this machine.** Read it for reference only.
The 1080 still polls Postgres directly; you replace that section with the
claim / progress / complete HTTP loop above.

#### 6. Process supervision
Decide upfront how the worker stays alive on this machine. Talk to the
user before installing anything system-wide. On Linux a `systemd` unit is
clean and well-trodden; on Windows we've had headaches with PM2's console
popups (see `server/SERVER_LAUNCH.md` for the i7 lessons). Whatever you
pick: log to a file, restart on crash, survive reboots.

#### 7. End-to-end test
1. Start the worker. Confirm in i7 logs (or
   `https://api.genshape3d.com/api/workers?email=<admin-email>` — admin
   email is whatever's in i7's `.env` `ADMIN_EMAILS`, currently
   `uskajitas@gmail.com`) that your worker shows `busy: 0` and
   recent `lastSeen`.
2. Submit a job from the web UI at `https://genshape3d.com`. Watch:
   - 1080 may grab it first if it polls faster — that's fine, submit
     another job until the 3090 wins one (or temporarily stop the 1080
     to force the 3090 to take it).
3. Verify the job goes `pending → processing → done` and the result
   appears in the user's dashboard.
4. Run a 2-jobs-back-to-back test to confirm `markFree` works (worker
   should claim the second one as soon as it completes the first).

#### 8. Report back
Single message including:
1. Worker `id`, declared `models`, `capacity`.
2. Process-supervision approach (systemd? something else?).
3. End-to-end job id + screenshot or status text confirming `done`.
4. Anything weird the i7 side should know about — added env vars,
   timing concerns, network egress issues, etc.

### What you do NOT do from the 3090 box
- Don't `git push` to this repo unless you're explicitly fixing a bug
  in the server. The 3090's worker code lives elsewhere.
- Don't try to rotate `WORKER_AUTH_TOKEN` — that requires coordination
  with the i7's `.env` and any other workers. Use what you're given.
- Don't generate test jobs by INSERTing into Postgres directly. Use the
  web UI so all the upstream validation (credits, R2 upload, etc.) runs.

---

## ✅ DONE — i7 control-plane setup (completed 2026-05-11)

Skip everything below if you're a future agent. It's left here for
auditability — every step was completed by an agent running on the i7
home server on 2026-05-11.

**What was done:**
- `WORKER_AUTH_TOKEN` generated (48-char alphanumeric) and added to
  `F:/cloudflare/genshape3d/server/.env` under the
  `# ─── Multi-worker control plane ───` section.
- Token saved to `C:\Users\Juan\.genshape3d-handoff\token.txt` with NTFS
  ACL restricted to user `Juan` (`icacls /inheritance:r /grant:r Juan:F`
  — `chmod 600` is a no-op on NTFS).
- Server reloaded via touching `src/index.ts` (ts-node-dev doesn't
  auto-watch `.env`).
- All three smoke-test curls passed (`401` without auth, `200` with auth
  registering a `smoketest` worker, `200` admin list). **Note: the doc
  example below uses `usquiano@gmail.com` for the admin curl, but the
  i7's actual `ADMIN_EMAILS` is `uskajitas@gmail.com`.** Either widen
  `ADMIN_EMAILS` or update the example.
- Schema migration verified — `\d genshape3d_jobs` shows
  `model text NOT NULL DEFAULT 'hunyuan3d'` and
  `assignedWorkerId text NOT NULL DEFAULT ''`, plus a new partial index
  `idx_jobs_pending_model`.
- Existing job rows backfilled with the defaults; legacy 1080 worker is
  unaffected.

**Known issues left for later (not blocking the 3090 setup):**
- `start-server.ps1`'s `Start-Process -ArgumentList '/c', $cmdLine`
  pattern intermittently fails to spawn `cmd.exe` when `$cmdLine`
  contains `>>` redirect operators. Quoting is likely the culprit.
  Server is currently running via Start-Process anyway because
  ts-node-dev's `--respawn` rode through a transient WSL2 Postgres
  `ECONNRESET` until a clean connection succeeded.
- Sibling PM2-managed servers (`mydaystory-server`, `uskiano-server`,
  `uskajitas-server`) were in PM2's phantom-online state during this
  deploy — they may need `pm2 restart` separately.

---

## (Original i7 task spec — keep below for reference)

**Context:** the server now supports multiple GPU workers (the existing 1080
home box, the new 3090 box, and any future ones). Workers no longer poll
Postgres directly — they call new HTTP endpoints. There's one new env var
you MUST set or every `/api/workers/*` call returns 401 and no worker can
claim jobs.

### What changed in code
- New columns on `genshape3d_jobs`: `model` (default `'hunyuan3d'`),
  `assignedWorkerId`. Migration is idempotent and runs automatically on
  server boot — nothing manual.
- New endpoints under `/api/workers/*` (see `server/src/workersApi.ts`).
- Two new files: `server/src/workerRegistry.ts`, `server/src/workersApi.ts`.

### What you must do

#### 1. Generate the worker auth token
This is a shared secret — a long random string. The server checks it on
every `/api/workers/*` request; workers send it as `Authorization: Bearer <token>`.
Anyone with this token can register a worker and start receiving (and
billing for) jobs, so treat it like any other API key: never commit, never
log, paste once and forget.

In PowerShell on the i7:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})
```

That prints a 48-char alphanumeric token. Copy the output.

#### 2. Add it to the live server's `.env`
The server `.env` lives at `/f/cloudflare/genshape3d/server/.env` (NOT the
`.env.example` in the repo — that's the template). Append:

```
WORKER_AUTH_TOKEN=<paste-the-token-from-step-1>
```

Do not quote it. Do not add spaces around the `=`.

#### 3. Hand the token off to the user
The user needs the same token to set up the 3090 worker on a different
machine. **Save it to the user's password manager** under the entry name:

> **genshape3d WORKER_AUTH_TOKEN**

If you don't have password-manager access from this machine, write the
token to a file the user has agreed in advance to read — for example:

```bash
mkdir -p ~/.genshape3d-handoff
echo "WORKER_AUTH_TOKEN=<paste-here>" > ~/.genshape3d-handoff/token.txt
chmod 600 ~/.genshape3d-handoff/token.txt
```

Then in your final report (step 8) tell the user the file path. Do **not**
paste the raw token into chat, Slack, email, or any git-tracked file.

#### 4. Restart / reload the server
`ts-node-dev` should auto-reload when `.env` changes, but to be safe:
```bash
cd /f/cloudflare/genshape3d/server
# kill the running dev server (whatever your usual stop signal is) and
npm run dev
```

On boot you should see `PostgreSQL tables ready` followed by
`GenShape3D API listening on http://localhost:8110`. The schema
migration ran automatically — the new columns are now on the table.

#### 5. Smoke test (verifies the endpoints + auth wiring)
From the i7 (replace `<TOKEN>` with what you generated):

```bash
# Without auth → 401
curl -i -X POST http://localhost:8110/api/workers/register \
  -H 'Content-Type: application/json' \
  -d '{"id":"smoketest","models":["hunyuan3d"],"capacity":1}'
# Expect: HTTP/1.1 401 Unauthorized, body {"error":"invalid worker token"}

# With auth → 200 and worker registered
curl -i -X POST http://localhost:8110/api/workers/register \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{"id":"smoketest","models":["hunyuan3d"],"capacity":1}'
# Expect: HTTP/1.1 200 OK, body has {"ok":true,"worker":{...}}

# Admin view (replace email with one in ADMIN_EMAILS)
curl 'http://localhost:8110/api/workers?email=usquiano@gmail.com'
# Expect: 200 with the smoketest worker in the list.
```

If all three behave as expected, the control plane is live. The smoketest
worker entry is harmless and will fall out of the in-memory registry on
the next server restart (no persistence).

#### 6. Verify the migration
One quick Postgres check that the new columns exist:
```bash
psql -U genshape3d -d genshape3d -c "\d genshape3d_jobs" | grep -E 'model|assignedWorker'
```
Expect to see two rows: `model` (text, NOT NULL, default `'hunyuan3d'`) and
`assignedWorkerId` (text, NOT NULL, default `''`).

#### 7. Confirm nothing existing broke
The old 1080 worker still uses its old direct-Postgres polling — it has
no idea any of this happened. Submit a normal job through the web UI and
verify it still gets picked up and processed end-to-end. If yes, the
backwards-compat story holds and continue to step 8.

#### 8. Report back to the user
Post a single message that includes, in this order:

1. ✅ / ❌ for each of steps 1–7 (one line each).
2. The exact location of the token handoff (password-manager entry name,
   or `~/.genshape3d-handoff/token.txt` path — whichever you used in
   step 3). Do not include the token value itself in this message.
3. The output of step 5's three smoke-test curls if any of them deviated
   from "Expect:".
4. The output of step 6's `\d` query (the two new column rows).
5. Whether the step 7 end-to-end job succeeded.

If any step failed, stop there, report what you tried, and wait for the
user to direct you. Do not improvise fixes outside this document.

### What you do NOT do
- Don't touch `genshape3d_nvidia` or `genshape-worker` repos. They're
  unchanged for now. The 1080 keeps polling; we'll migrate it in a later
  phase.
- Don't add a `model` selector to the client UI yet. That's part of the
  same later phase, after the new 3090 worker is verified.
- Don't manually create a worker registry table. The registry is
  in-memory by design.

### Reference
- Endpoints + auth shape: `server/src/workersApi.ts`
- In-memory registry: `server/src/workerRegistry.ts`
- Atomic job claim (FOR UPDATE SKIP LOCKED): `server/src/jobsRepo.ts`
  → `claimNextPendingJob`
- All five new env-var entries documented in `server/.env.example`.

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
