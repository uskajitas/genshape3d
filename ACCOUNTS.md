# Third-party accounts

Quick reference for every paid / external service GenShape3D talks to —
who the account is under, what it's used for, where to check usage and
billing, and which env var holds its credential.

**This file does NOT contain secrets.** Tokens, keys, and passwords live
only in `server/.env` (which is gitignored). Anything in this file is
safe to commit.

## How to read each row

- **Account** — the email / login the service is registered under.
- **Used for** — what feature(s) of GenShape3D depend on it.
- **Env var** — the variable in `server/.env` that holds the credential.
- **Cost / model** — rough per-call cost or pricing model.
- **Billing dashboard** — where to log in to see usage and top up.

## Inference / image generation

| Service       | Account              | Env var               | Used for                                   | Cost (rough)              | Billing dashboard                                     |
| ------------- | -------------------- | --------------------- | ------------------------------------------ | ------------------------- | ----------------------------------------------------- |
| **Replicate** | `usquiano@gmail.com` | `REPLICATE_API_TOKEN` | Multi-view alt views (Zero123++)           | ≈$0.05 per 6-view set     | https://replicate.com/account/billing                 |
| **fal.ai**    | `usquiano@gmail.com` | `FAL_KEY`             | Text-to-image: Flux Schnell, Flux Pro 1.1  | $0.003–$0.04 per image    | https://fal.ai/dashboard/billing                      |
| **OpenAI**    | `usquiano@gmail.com` | `OPENAI_API_KEY`      | Text-to-image: DALL-E 3                    | ≈$0.04 per image          | https://platform.openai.com/usage                     |
| **Hugging Face** | `usquiano@gmail.com` | `HF_TOKEN`         | Text-to-image: HF-hosted Flux Schnell      | Free tier (rate-limited)  | https://huggingface.co/settings/billing               |
| **Pollinations** | *(no account)*    | *(none)*              | Text-to-image: free fallback provider      | Free                      | n/a                                                   |

Optional config knobs (no account needed, just tuning):

- `REPLICATE_MV_MODEL` — which multi-view model on Replicate. Default
  `lucataco/zero123plusplus`.
- `REPLICATE_MV_NUM_STEPS` — Zero123++ inference steps. Default `36`.

## Storage / database

| Service          | Account              | Env vars                                      | Used for                                                    | Cost                              | Dashboard                              |
| ---------------- | -------------------- | --------------------------------------------- | ----------------------------------------------------------- | --------------------------------- | -------------------------------------- |
| **Cloudflare R2**| `usquiano@gmail.com` | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | All image / mesh files. Bucket: `genshape3d`. | $0.015/GB/month + $4.50 / million class A ops | https://dash.cloudflare.com/?to=/:account/r2 |
| **Postgres**     | self-hosted (i7, WSL2 Ubuntu) | `DATABASE_URL`                       | Users, jobs, text-to-image assets, credit ledger.           | $0 (local)                        | psql                                   |

## Auth / billing / payments

| Service          | Account              | Env vars                                                  | Used for                              | Cost                       | Dashboard                                  |
| ---------------- | -------------------- | --------------------------------------------------------- | ------------------------------------- | -------------------------- | ------------------------------------------ |
| **Stripe**       | `usquiano@gmail.com` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_CREATOR` | Credit-pack purchases (one-time products). | 2.9% + $0.30 per charge | https://dashboard.stripe.com/account/billing |
| **Firebase**     | `usquiano@gmail.com` | (client-side `firebaseConfig`)                            | Google OAuth sign-in.                 | Free tier (Spark plan)     | https://console.firebase.google.com/       |

## Hosting

| Service                  | Account / location           | Used for                                                            | Cost                                |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| **i7 home server**       | Local hardware (Windows)     | Vite + Express dev servers. Cloudflared exposes them as `genshape3d.com` / `api.genshape3d.com`. | Hardware + electricity              |
| **GTX 1080 worker (`genshape3d_nvidia`)** | Same machine as the i7 | Hunyuan3D-2 image-to-3D mesh generation.                  | Same                                |
| **Cloudflare Tunnel**    | `usquiano@gmail.com`         | Public domain → home server.                                        | Free                                |
| **GitHub**               | `uskajitas`                  | Repo: `uskajitas/genshape3d`.                                       | Free                                |
| **Domain (`genshape3d.com`)** | `usquiano@gmail.com` (registrar TBD) | Root domain. Subdomains via Cloudflare DNS.               | Annual renewal (≈$10–15)            |

## How to add a new service

1. Edit this file: add a row to the right table with account, env var,
   what it's used for, and where to check spending.
2. Add the env var name (NOT the value) to `server/.env.example` so future
   deploys know it's expected.
3. Drop the actual secret into `server/.env` on the i7 (and any other dev
   machines that need it). Never commit the value.

## Deprecated / dead

Nothing yet. When a service stops being used, move its row here with a
short note (date, why dropped) so we have history.
