# GenShape3D — local setup

## On an existing machine you've already cloned (just need latest)

```sh
git pull
cd client && npm install && cd ..
cd server && npm install && cd ..
# If you already had a working server/.env, leave it
npm run dev
```

Open http://localhost:3110.

## On a fresh machine

### Prereqs
- Node.js 18+
- Postgres 14+ running locally (Windows installer, WSL, or Docker — anything that listens on `localhost:5432`)
- Git with SSH access to `github.com:uskajitas/*`

### 1. Clone

```sh
git clone git@github.com:uskajitas/genshape3d.git
cd genshape3d
```

### 2. Create the local database

```sh
# Linux / WSL / macOS:
sudo -u postgres psql <<'SQL'
CREATE DATABASE genshape3d;
CREATE USER genshape3d WITH PASSWORD 'genshape3d';
GRANT ALL PRIVILEGES ON DATABASE genshape3d TO genshape3d;
\c genshape3d
GRANT ALL ON SCHEMA public TO genshape3d;
SQL
```

On Windows-native Postgres, run the same SQL via `psql -U postgres`.

### 3. Configure secrets

Copy `server/.env.example` → `server/.env` and fill in:

- `DATABASE_URL` — default works if you ran step 2 verbatim
- `R2_*` — Cloudflare R2 credentials. Same values on every machine; keep them in a private store (1Password, etc.) and paste in.
- `ADMIN_EMAILS` — your email

Firebase config is hardcoded in `client/src/firebase.ts` — no client env file needed for normal use.

### 4. Install + run

```sh
cd client && npm install && cd ..
cd server && npm install && cd ..
npm run dev
```

Visit http://localhost:3110, sign in with Google, you're in.

## Optional: GPU worker

The mesh generation worker lives in a separate repo: [`uskajitas/genshape3d_nvidia`](https://github.com/uskajitas/genshape3d_nvidia). Only set it up on the machine with an NVIDIA GPU (the one that actually generates meshes). Dev machines without a GPU don't need it — they can still browse the UI and queue jobs that the GPU machine picks up.

## Ports

- `3110` — client (Vite dev server)
- `8110` — server (Express API)

If those clash with something on your machine, change them in `client/vite.config.ts` and `server/.env` (`PORT=`). Update both — the Vite proxy targets the server port.
