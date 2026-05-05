# GenShape3D — deployment

Read this if you are deploying changes to the live site `https://genshape3d.com`. It is written for both humans and AI agents with no prior context.

## ⚠ Latest commit notes — read these before deploying

### Server-side background removal (this commit)

**What changed:** every image uploaded via `/api/upload` is now run through a background-removal AI model **before** being saved to R2 and handed to the 3D worker. This fixes the "flat wall behind the mesh" problem on dark/black backgrounds.

**Why it was needed:** the Hunyuan3D worker has its own internal background-removal step (`rembg`), but it fails silently on dark / low-contrast inputs — the worker then treats the whole frame as the subject and extrudes a flat plane behind the mesh. Doing the cutout on our server with a controlled model means the worker always gets a clean alpha-masked PNG.

**Deploy steps on the i7:**

```sh
cd /f/cloudflare/genshape3d
git pull
cd server && npm install && cd ..
# That's it — ts-node-dev auto-reloads.
```

The `npm install` is required because a new dependency was added: `@imgly/background-removal-node ^1.4.5`. It pulls in ONNX Runtime + a small (~50MB) U2-Net model. The model file is downloaded on first use and cached under `server/node_modules/@imgly/background-removal-node/`.

**What you'll see in the server log on first boot after the deploy:**

```
GenShape3D API listening on http://localhost:8110
[rembg] model warmed
```

The `[rembg] model warmed` line means the AI model loaded successfully. It takes ~3 seconds. If you instead see `[rembg] warmup failed: ...`, the model couldn't load — most likely the npm install didn't complete or there's not enough RAM. The server will still run, but the first user upload will be slower (model loads on demand).

**Files touched:**
- `server/src/bgRemoval.ts` (new) — wraps `removeBackground()` with error handling + warm-up.
- `server/src/index.ts` — `/api/upload` calls `stripBackground()` before R2 upload, forces `.png` extension on success.
- `server/package.json` — adds `@imgly/background-removal-node`.

**No DB migrations. No env vars. No client changes.**

**How to verify:**
1. Upload an image with a dark background through the Workspace.
2. Server log should show no `[rembg] strip failed` warning.
3. The R2 key for that upload ends in `.png` (you can see it in the network tab — the `imageUrl` returned by `/api/upload`).
4. The 3D mesh comes out clean, no flat wall.

**Failure mode (graceful):** if `removeBackground()` throws (e.g. malformed input, OOM), the original image bytes go to R2 unchanged and the worker tries its own internal rembg — i.e. you fall back to the old behaviour. Nothing breaks, you just don't get the fix for that one image.

**Opt-out:** the `/api/upload` endpoint accepts `skipBgRemoval=true` in the form data. Useful for debugging or if a user uploads an already-cut-out image. The client doesn't currently set this; it's there for future use.

**Notes:**
- Disk usage will grow by ~50MB the first time anyone uploads — that's the U2-Net model getting cached.
- Subsequent uploads are ~300–500ms slower than before due to the segmentation pass. Acceptable; the user already waits ~30s for the 3D mesh.
- The `/api/jobs/from-key` endpoint (which re-runs an existing R2 upload) does NOT re-strip the bytes — they're already in R2 and we don't fetch them. Old gallery entries from before this commit will still produce flat-wall meshes if re-run. New uploads are fine.

---

### Earlier commit (free-tier launch + admin stats)

The most recent push (free-tier launch + admin stats) introduces these surfaces. Most are zero-config, but two need attention on the i7:

1. **Frontend lockdown for non-admin users.** Workspace UI now hides quality + texture controls for anyone whose `users.role != 'admin'`. The "Upgrade" button + credit pill are gone; replaced by a `FREE` / `ADMIN` badge. This is hard-coded — there is **nothing to configure** on the i7 to make this work. Just `git pull` + auto-reload.

2. **New endpoint `/api/admin/stats`.** Returns aggregate metrics (queue depth, signups, jobs/day, p50/p95 timing). Admin-gated via `x-user-email` header → `isAdminEmail()`. Driven by `ADMIN_EMAILS` env var (already set on the i7 to `usquiano@gmail.com`). No env change needed unless you want to grant another admin — comma-separate emails.

3. **New page `/admin/stats`.** Admin-only client-side route. Queries `/api/admin/stats` every 10 s. The 📊 icon at the bottom of the left rail in `/dashboard` only appears when the signed-in user's role is `admin`.

4. **`Workspace.tsx` now sends quality + texture params explicitly** in the upload form data. Non-admin browsers will always send `inferenceSteps=5, octreeResolution=256, doTexture=false` (Standard, no texture). Admin browsers can send anything.

   **Server-side enforcement is NOT yet in place** — a determined non-admin could craft a `curl` POST with `doTexture=true` and the worker would honour it. This is acceptable for v1 (we trust the small user pool) but should be hardened before traffic grows. To harden later: in `server/src/index.ts` `/api/upload` handler, look up the user's role and clamp the params if `role != 'admin'`. Marked as TODO for a follow-up.

5. **Schema is unchanged** — no new columns or tables. `genshape3d_jobs`, `genshape3d_users`, `genshape3d_login_events` are all read by the new stats endpoint via SQL aggregations, no migrations needed.

6. **No new env vars.** `.env.example` did not change in this commit.

After pulling: just verify the page at `https://genshape3d.com/dashboard` shows the FREE/ADMIN badge in the nav, and that signing in as an admin reveals the 📊 icon. If not, hard-reload the browser; HMR sometimes needs help when new context-using files are added.

## How "deploy" works in this project

There is **no separate production build or CI/CD pipeline**. The home server (an i7 + GTX 1080 Windows machine) permanently runs `npm run dev` for both the client (Vite) and the server (`ts-node-dev`), and a Cloudflare Tunnel exposes those local dev servers as `genshape3d.com` (frontend) and `api.genshape3d.com` (backend). Both dev servers **auto-reload on source file changes**, so deploying = updating the source on the home server.

This setup is informal on purpose. Don't introduce a more elaborate deploy pipeline (Docker, CI build, separate `npm run start`, etc.) without the user explicitly asking — they value the simplicity.

## Where the running code lives

- Repo on the home server: **`F:\cloudflare\genshape3d`** (Windows path) / **`/f/cloudflare/genshape3d`** (Git-Bash / WSL path).
- The cloudflared Windows service has `tunnel run i7-home` baked in; it forwards public traffic to local ports `3110` (Vite) and `8110` (Express).
- Postgres lives in WSL2 Ubuntu on the same i7, exposed to the LAN at `192.168.20.8:5432` for dev machines and to `localhost` for the running server.

## Standard deploy (after a push from any dev machine)

Run these on the i7. The `npm install` lines are only needed if the corresponding `package.json` changed since the last deploy — when in doubt, run them, they're idempotent.

```sh
cd /f/cloudflare/genshape3d
git pull
cd client && npm install && cd ..
cd server && npm install && cd ..
# Both dev servers auto-reload from disk changes. No restart needed.
```

That's the whole deploy.

If `npm run dev` is **not** currently running on the i7 (rare; the user normally keeps it up), start it from the repo root:

```sh
npm run dev
```

The server should print `PostgreSQL tables ready` and `GenShape3D API listening on http://localhost:8110`. Vite should print `VITE vX ready ... http://localhost:3110`.

## Verify the deploy worked

After auto-reload finishes (a few seconds), hit both endpoints from the i7 itself, then via the public hostname:

```sh
# From the i7 — local
curl http://localhost:8110/api/health
# Expect: {"ok":true}

# From the i7 — public (proves the tunnel is healthy)
curl https://api.genshape3d.com/api/health
# Expect: {"ok":true}
```

Open `https://genshape3d.com` in a browser. Watch the network tab for any 4xx/5xx, and the server log on the i7 (see "Where to look at logs" below) for stack traces.

## Special cases — when auto-reload alone isn't enough

| Change type | Extra action needed |
|---|---|
| New env var added to `server/.env.example` | Update the running `server/.env` on the i7 to include the new var, then restart the server (`ts-node-dev` reloads on `.env` change usually, but stop/start to be safe) |
| Schema change (new SQL in `server/src/db.ts initDb()`) | The server runs `initDb()` on every boot via `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. Auto-reload triggers a restart, which runs initDb again. No manual SQL needed — but verify the migration ran by checking the server log |
| Backwards-incompatible schema change | initDb's `IF NOT EXISTS` guards won't help. You need to run a manual migration via `psql`. Do this **before** pulling the new code |
| Frontend dependency added | `cd client && npm install` |
| Backend dependency added | `cd server && npm install` |
| Native module (e.g., better-sqlite3) added | Same as above; if it fails, install Visual Studio Build Tools on Windows and retry |
| Cloudflared config change | Changing `~/.cloudflared/config.yml` requires restarting the Cloudflared Windows service (`Restart-Service Cloudflared`, elevated). Adding a new hostname requires both editing config.yml and creating the DNS route via the Cloudflare API or `cloudflared tunnel route dns` |
| Worker code change (`genshape3d_nvidia`) | That repo is separate; pull + `npm install` in `F:\cloudflare\genshape3d_nvidia` and restart the Electron app |

## Rolling back

```sh
cd /f/cloudflare/genshape3d
git log --oneline -5     # find the last good commit
git revert <bad-sha>     # creates a new revert commit
git push                 # so other machines stay in sync
```

Or if the bad commit isn't shared yet and you want to nuke it:

```sh
git reset --hard <good-sha>   # destructive — only do this if nothing else has pulled
```

The auto-reload picks up the rollback in seconds.

## Where to look at logs

When `npm run dev` was started by the project assistant, logs go to:

- Server: `%TEMP%\genshape3d-server.log`
- Client (Vite): `%TEMP%\genshape3d-client.log`
- GPU worker (`genshape3d_nvidia`): `%TEMP%\genshape-nvidia.log`
- Cloudflared Windows service: Windows Event Viewer → Applications → source `Cloudflared`

If the user started `npm run dev` themselves in a terminal, logs are wherever they ran it. Ask before assuming.

## Triggering a deploy through an AI agent on the i7

If a user says "deploy" or "pull genshape3d" while a Claude Code (or similar) agent is running on the i7, the agent should:

1. `cd /f/cloudflare/genshape3d`
2. `git fetch origin && git log --oneline HEAD..origin/main` — show what will be pulled, briefly
3. `git pull`
4. Diff `server/.env.example` against the previous version. If any new key appears, ask the user for its value before continuing.
5. If `client/package.json` or `server/package.json` changed in the pulled commits, run `npm install` in the relevant directory.
6. Wait ~5s for auto-reload, then `curl` both health endpoints (local + public) to verify.
7. Report: pulled commits, install steps run, health check results. Stop.

Don't restart anything proactively unless auto-reload visibly didn't pick up the change. ts-node-dev and Vite are good at this.

## Future improvements (deferred — don't do until asked)

- A simple GitHub webhook → script on the i7 that runs the deploy steps above.
- A separate `npm run start` production mode (`vite build` + static serve, `tsc` + `node dist/index.js`) for slightly less CPU and memory overhead.
- A real CI/CD via GitHub Actions if/when the project leaves the home server.

None of these are needed now. The current setup works for a single-developer home project.
