# GenShape3D — setup guide

This file is for both humans and AI coding agents (Claude Code, Cursor, etc.) doing first-time setup on a new machine.

## Architecture in one paragraph

The project is split across one home server and zero or more dev machines. The **home server (i7 + GTX 1080)** runs Postgres 16 (DB `genshape3d`, user/pass `genshape3d`/`genshape3d`), the cloudflared Windows service that exposes `genshape3d.com` and `api.genshape3d.com` to the public internet, and the GPU worker `genshape3d_nvidia` (Electron tray app polling Postgres for jobs and running Hunyuan3D inference). **Dev machines** (laptop, mini-PC, etc.) run only the web client (Vite) and web server (Express + `pg`) locally and share the same Postgres on the home server's LAN. The web app uses Firebase for client auth (project `uskajitas-a4844`) and Cloudflare R2 for image/mesh storage. Firebase config is hardcoded in `client/src/firebase.ts` (public values, not secret).

## Network facts

- **Home server LAN IP:** `192.168.20.8`
- **Postgres:** `192.168.20.8:5432` — exposed to LAN via Windows portproxy + firewall rule
- **Public domains:** `https://genshape3d.com`, `https://api.genshape3d.com` — both routed through the home server's Cloudflare Tunnel (i7 only)
- **Local dev ports:** client `3110`, server `8110`

## Pick your scenario

### Scenario A — fresh setup on a dev machine (e.g., a Geekom mini-PC)

The dev machine connects to the shared Postgres on the home server. It does **not** run cloudflared, the GPU worker, or its own Postgres. Skip to [Dev machine setup](#dev-machine-setup) below.

### Scenario B — fresh setup on the home server itself

The home server hosts the DB, tunnel, and GPU worker. It also runs the web client + server. Setup involves: install Postgres + create DB, install + configure cloudflared, install + run `genshape3d_nvidia` Electron worker, then the same client/server steps a dev machine does (but with `DATABASE_URL` pointing at `localhost`). This is a substantial setup; the user already did it interactively. If you're an agent on a fresh home server, escalate to the user.

### Scenario C — existing machine, just pull latest

```sh
git pull
cd client && npm install && cd ..   # only if package.json changed
cd server && npm install && cd ..   # only if package.json changed
npm run dev
```

If `git pull` mentions changes to `server/.env.example`, diff it against your `server/.env` and add any missing keys.

---

## Dev machine setup

You are setting up `genshape3d` on a dev machine that will share the home server's Postgres over the LAN.

### Prerequisites — verify before starting

```sh
node --version            # need 18+ (recommend 20 LTS)
npm --version
git --version
ssh -T git@github.com     # should succeed (you may see "Hi <username>")
ping -c 2 192.168.20.8    # must reach the home server
```

If `ssh -T git@github.com` fails, set up an SSH key and add it to the user's `uskajitas` GitHub account before continuing. If the ping fails, this machine is not on the same Wi-Fi as the home server — fix that first.

A `psql` client is optional but recommended for the smoke test (`sudo apt install postgresql-client` on Debian/Ubuntu, `brew install libpq` on macOS).

### Step 1 — Clone

Pick a sensible code root (`~/code/` if nothing else exists; otherwise mirror the user's existing convention). Then:

```sh
git clone git@github.com:uskajitas/genshape3d.git
cd genshape3d
```

### Step 2 — Install dependencies

```sh
cd client && npm install && cd ..
cd server && npm install && cd ..
```

The server install builds the `pg` driver natively. If it fails on missing build tools, install them (`build-essential` on Linux, Visual Studio Build Tools on Windows) and retry.

### Step 3 — Create `server/.env`

Write **exactly** these lines to `server/.env` (don't change values, don't reformat):

```env
PORT=8110
CLIENT_ORIGIN_URL=http://localhost:3110
DATABASE_URL=postgresql://genshape3d:genshape3d@192.168.20.8:5432/genshape3d
ADMIN_EMAILS=uskajitas@gmail.com

R2_ENDPOINT=https://edad30fa0fe66f50971087c6b0df0f28.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=c8f216931b70e1844a7cf8b67f58ff51
R2_SECRET_ACCESS_KEY=1ce50924440b403f9cb25b42727d58743afc7c447138b4516fd47f712a4b762f
R2_BUCKET=genshape3d
R2_PUBLIC_URL=https://edad30fa0fe66f50971087c6b0df0f28.r2.cloudflarestorage.com/genshape3d
```

`server/.env` is gitignored — never commit it.

`client/.env.local` does **not** need to be created. Firebase config is hardcoded; there are no other client env vars in normal use.

### Step 4 — Sanity-check the DB connection (recommended)

```sh
psql "postgresql://genshape3d:genshape3d@192.168.20.8:5432/genshape3d" -c "SELECT current_user, current_database();"
```

Expected: a single row showing `genshape3d | genshape3d`.

If you get:
- `connection refused` — this machine can't reach the home server. Confirm same Wi-Fi. Confirm `ping 192.168.20.8` works.
- `password authentication failed` — `.env` values typed wrong; recopy.
- `database "genshape3d" does not exist` — the home server hasn't been bootstrapped. Tell the user.

### Step 5 — Run

From the repo root:

```sh
npm run dev
```

Server boots on `:8110` (look for `PostgreSQL tables ready` and `GenShape3D API listening on http://localhost:8110`). Vite client boots on `:3110`.

Open `http://localhost:3110` in a browser. Sign in with Google. You should see the same jobs/users as on the home server because it's the same Postgres.

### Step 6 — Smoke-test mesh generation (end-to-end)

To prove the full stack works:

1. From `localhost:3110`, upload an image and start a generation.
2. The server uploads the image to R2 and inserts a `pending` row into `genshape3d_jobs` on the home server's Postgres.
3. The GPU worker on the home server polls every ~10s, downloads the image from R2, runs Hunyuan3D, uploads the resulting GLB to R2, and updates the row to `status='completed'`.
4. The Geekom UI polls and renders the mesh.

End-to-end takes ~30s to 3min depending on params.

## Things a dev machine should NOT do

- Do not install or run `genshape3d_nvidia` (GPU worker) — home server only.
- Do not install or run `genshape-worker` (cloud / RunPod worker) — not used locally.
- Do not install or run `cloudflared` — tunnel runs on the home server only.
- Do not install Postgres locally — share the home server's DB.
- Never commit `server/.env` to git.

## Troubleshooting cheatsheet

| Symptom | Likely cause | Fix |
|---|---|---|
| `EADDRINUSE :3110` or `:8110` | Another process bound to that port | Kill it, or change the ports in `client/vite.config.ts` (`server.port` + the `proxy` target) **and** `server/.env` (`PORT=`) — keep them paired |
| Firebase sign-in shows `auth/unauthorized-domain` | Domain not in Firebase allowlist | The user has already authorized `localhost`, `genshape3d.com`, `mydaystory.com`, `uskiano.com`, `centrikboard.com`. If still missing, the user adds it in the Firebase console under Authentication → Settings → Authorized domains |
| Server logs `password authentication failed for user "genshape3d"` | Wrong password in `.env` | Recopy from this doc |
| Server logs `connection refused 192.168.20.8:5432` | Off home Wi-Fi or home server powered off | Confirm both, retry |
| `npm run dev` from root only starts the server (or only the client) on Windows | The root `dev` script uses bash-style `&` which doesn't parallelize on Windows | Run `cd server && npm run dev` and `cd client && npm run dev` in two separate terminals |
| Server hangs on `Initializing DB` | Postgres reachable but the DB doesn't yet have the `genshape3d_*` tables | The server creates them on startup via `initDb()` — if it stalls, check the server log for the actual error |

## Maintenance — keeping up to date

After the user pushes new commits upstream:

```sh
git pull
cd client && npm install && cd ..   # if package.json changed
cd server && npm install && cd ..   # if package.json changed
npm run dev
```

If a release adds new env vars, diff `server/.env.example` against your `server/.env` and add the missing keys.

## When you're done (agent self-report)

Report back:
- Path where you cloned the repo
- That `npm run dev` ran without errors
- That `http://localhost:3110` loads the landing page
- That signing in shows the same data as on the home server

Then stop. Don't propose extra refactors or installs unless the user asks.
