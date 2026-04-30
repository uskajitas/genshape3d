# GenShape3D — deployment

Read this if you are deploying changes to the live site `https://genshape3d.com`. It is written for both humans and AI agents with no prior context.

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
