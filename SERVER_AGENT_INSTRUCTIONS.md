# Server-side follow-up instructions

Multiple commits' worth of follow-ups stacked here. **Do the most recent
section first** (top of the file) — older sections may already be partly done.

---

## 🟡 BLOCKED — HTTP 502 on text-to-image, root cause confirmed (2026-05-12, i7 agent)

**Diagnosis confirmed.** The local call reproduces the 502 with the exact
error message:

```bash
$ curl -s -w "\nHTTP:%{http_code}" "http://localhost:8110/api/text2image?prompt=test&provider=fal-flux-schnell&email=uskajitas@gmail.com"
{"error":"FAL_KEY not configured"}
HTTP:502
```

`grep FAL_KEY /f/cloudflare/genshape3d/server/.env` returned nothing —
the env var is not defined at all. So `callFalEndpoint` short-circuits
with the literal string `FAL_KEY not configured`, the route maps that
to 502, and Cloudflare forwards it to the browser. The server is otherwise
healthy (port 8110 is listening, /api/upload returns 200, /api/health
returns 200, /api/billing/packs returns 200).

### ⛔ Blocked on user action — I cannot fix this without you

The fix is one line in `server/.env`:
```
FAL_KEY=<paste the key from fal.ai>
```

But getting that key requires logging into fal.ai under the `usquiano`
account (per `ACCOUNTS.md` — third-party AI APIs are billed to usquiano),
generating a new API key, and pasting it here. **An agent cannot do
either of those.**

### What the user needs to do

1. Go to <https://fal.ai/dashboard/keys> (sign in as `usquiano@gmail.com`).
2. Create a new key named e.g. `genshape3d-2026-05-12`. Copy it.
3. Append to `/f/cloudflare/genshape3d/server/.env`:
   ```
   FAL_KEY=<paste-the-key>
   ```
4. ts-node-dev will auto-reload `.env` within a few seconds.
5. Smoke test:
   ```bash
   curl -w "\n%{http_code}" "http://localhost:8110/api/text2image?prompt=test&provider=fal-flux-schnell&email=uskajitas@gmail.com"
   ```
   Expected: 200 with a JSON body containing an image URL.

### Optional — verify the key works before pasting it into .env

```bash
curl -s -X POST https://fal.run/fal-ai/flux/schnell \
  -H "Authorization: Key <paste-the-key>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a red cube","image_size":"square_hd","num_inference_steps":4,"seed":42}' | head -c 300
```
A 200 response with `images: [{ url: ... }]` confirms the key is good.

### Why this regressed
Best guess: the `.env` was rebuilt at some point (Stripe wiring, R2 keys
were re-pasted from the handoff file) and `FAL_KEY` wasn't carried over.
There's no record in git of when it was last present because `.env` is
gitignored.

### What you do NOT do
- Don't paste the FAL_KEY into this file, git, chat logs, or screenshots.
- Don't try to use the `OPENROUTER_API_KEY` from `sam-meter` — it's a
  different provider and won't authenticate against fal.ai.

---

## ✅ DONE — HTTP 502 on generate / upload (resolved 2026-05-12, i7 agent)

**Root cause:** An orphan ts-node-dev process (PID 12776) was holding port
8110. ts-node-dev's auto-restart was silently failing with `EADDRINUSE` —
so the server appeared to be running (process existed) but was actually dead.
The Cloudflare tunnel was forwarding requests to a port with nothing behind it → 502.

**Fix applied:**
1. Killed orphan PID 12776 (`Stop-Process -Id 12776 -Force`).
2. Ran `npm install` in `server/` to pick up any dependency changes from the
   pulled commits (the 3090 agent had pushed `Workspace.tsx` + `usersRepo.ts`
   + `workersApi.ts` changes).
3. Restarted `ts-node-dev --respawn --transpile-only src/index.ts` hidden
   (PID 21952). Server now listening on `0.0.0.0:8110`.
4. Smoke-tested `POST /api/upload` → **HTTP 200**, job created successfully.
5. Cancelled the test job in Postgres.

**For future reference — how to detect this:**
- `netstat -ano | grep :8110 | LISTENING` shows nothing → server is fully dead.
- `netstat -ano | grep :8110 | LISTENING` shows a PID → check that PID with
  `Get-Process -Id <PID>` — if it's `node` or `ts-node` but the server log
  shows `EADDRINUSE`, there is a second ghost process on the same port.
- Always check the error log at `F:/cloudflare/.pm2-logs/genshape3d-server.err.log`.

---

## 🆕 TASK — Build 3090 system tray service (added 2026-05-11)

**FOR THE 3090 AGENT ONLY. Do NOT run any of this on the i7.**

⚠️ **CRITICAL — READ BEFORE TOUCHING ANYTHING:**
Do NOT copy, clone, or reuse `genshape3d_nvidia` (the i7's Electron app).
That app polls **Postgres directly** using a Node.js driver. The 3090 worker
is completely different — it is **Python-based** and talks to the HTTP control
plane at `https://api.genshape3d.com/api/workers/*`. Copying `genshape3d_nvidia`
will break things silently (wrong database path, wrong polling architecture,
wrong models). Start fresh as described below.

---

### What you are building

A **Python system tray app** (`tray.py`) that:
- Sits in the Windows system tray.
- Spawns your existing `worker.py` as a subprocess when started.
- Shows current status (idle / working / error) in the tray tooltip.
- Has a right-click menu: **Show Log**, **Stop Worker**, **Quit**.
- Writes worker stdout+stderr to a rotating log file so you can diagnose problems.
- Launches automatically at Windows login via the Startup folder.

The 3090 worker code already lives at `C:\projects\genshape-worker-3090\`.
This tray app lives in the same repo, alongside `worker.py`.

---

### Step 1 — Install Python tray dependencies

Open a **normal** PowerShell (not admin, just your user account):

```powershell
cd C:\projects\genshape-worker-3090

# Activate the worker venv (adjust path if yours is different)
.\venv\Scripts\Activate.ps1

pip install pystray Pillow
```

Verify:
```powershell
python -c "import pystray, PIL; print('ok')"
```
Expected output: `ok`

If your `worker.py` uses its own venv, install into that same venv.
Do not create a second venv just for pystray.

---

### Step 2 — Create `tray.py`

In `C:\projects\genshape-worker-3090\`, create a new file called `tray.py`
with exactly this content:

```python
"""
GenShape3D — 3090 Worker Tray
Wraps worker.py in a Windows system-tray icon so the worker
keeps running without an open terminal window.

Usage (normal):  python tray.py
Usage (startup): the Startup folder shortcut points here.
"""

import os
import sys
import subprocess
import threading
import time
import queue
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

import pystray
from PIL import Image, ImageDraw

# ── Paths ────────────────────────────────────────────────────────────────────
HERE = Path(__file__).parent
WORKER_SCRIPT = HERE / "worker.py"
LOG_FILE = HERE / "tray-worker.log"
VENV_PYTHON = HERE / "venv" / "Scripts" / "python.exe"

# Use the venv python if it exists, otherwise fall back to sys.executable
PYTHON = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

# ── Logging ──────────────────────────────────────────────────────────────────
handler = RotatingFileHandler(LOG_FILE, maxBytes=5_000_000, backupCount=3, encoding="utf-8")
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
log = logging.getLogger("tray")
log.setLevel(logging.DEBUG)
log.addHandler(handler)

# ── State ────────────────────────────────────────────────────────────────────
proc = None          # worker subprocess
status = "starting"  # shown in tooltip
proc_lock = threading.Lock()

# ── Tray icon ─────────────────────────────────────────────────────────────────
def make_icon(color=(0, 200, 120)):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((4, 4, 60, 60), fill=color + (255,))
    return img

STATUS_COLORS = {
    "starting": (220, 160, 0),
    "idle":     (0, 200, 120),
    "working":  (0, 120, 255),
    "error":    (220, 50, 50),
    "stopped":  (140, 140, 140),
}

# ── Worker process management ─────────────────────────────────────────────────
def start_worker():
    global proc, status
    with proc_lock:
        if proc and proc.poll() is None:
            log.info("start_worker called but worker already running")
            return
        log.info("Launching worker.py")
        try:
            proc = subprocess.Popen(
                [PYTHON, str(WORKER_SCRIPT)],
                cwd=str(HERE),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            status = "idle"
            log.info("Worker PID %d started", proc.pid)
        except Exception as e:
            status = "error"
            log.error("Failed to start worker: %s", e)

def stop_worker():
    global proc, status
    with proc_lock:
        if proc and proc.poll() is None:
            log.info("Stopping worker PID %d", proc.pid)
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            status = "stopped"
            log.info("Worker stopped")

def pipe_reader():
    """Read worker stdout/stderr and forward to log. Also detect 'processing' keyword."""
    global status
    while True:
        with proc_lock:
            p = proc
        if p is None:
            time.sleep(1)
            continue
        line = p.stdout.readline()
        if line:
            line = line.rstrip()
            log.info("[worker] %s", line)
            low = line.lower()
            if any(k in low for k in ("claiming", "processing", "running", "progress")):
                status = "working"
            elif any(k in low for k in ("complete", "done", "idle", "waiting", "no job")):
                status = "idle"
            elif "error" in low or "exception" in low or "traceback" in low:
                status = "error"
        else:
            # EOF — process ended
            with proc_lock:
                if p.poll() is not None:
                    log.warning("Worker process exited with code %s — restarting in 5s", p.returncode)
                    status = "error"
                    time.sleep(5)
                    start_worker()
            time.sleep(0.2)

def watchdog():
    """Restart worker if it dies unexpectedly."""
    while True:
        time.sleep(10)
        with proc_lock:
            p = proc
            if p is not None and p.poll() is not None:
                log.warning("Watchdog: worker dead (code %s), restarting", p.returncode)
                start_worker()

# ── Tray menu actions ─────────────────────────────────────────────────────────
def on_show_log(icon, item):
    os.startfile(str(LOG_FILE))

def on_stop(icon, item):
    stop_worker()
    icon.icon = make_icon(STATUS_COLORS["stopped"])
    icon.title = "GenShape3D 3090 — stopped"

def on_quit(icon, item):
    stop_worker()
    icon.stop()

def update_icon(icon):
    """Periodically refresh the tray tooltip and colour."""
    while True:
        time.sleep(3)
        color = STATUS_COLORS.get(status, (140, 140, 140))
        icon.icon = make_icon(color)
        icon.title = f"GenShape3D 3090 — {status}"

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    log.info("Tray starting")
    start_worker()

    threading.Thread(target=pipe_reader, daemon=True).start()
    threading.Thread(target=watchdog, daemon=True).start()

    menu = pystray.Menu(
        pystray.MenuItem("GenShape3D 3090 Worker", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Show Log", on_show_log),
        pystray.MenuItem("Stop Worker", on_stop),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", on_quit),
    )

    icon = pystray.Icon(
        "genshape3d-3090",
        make_icon(STATUS_COLORS["starting"]),
        "GenShape3D 3090 — starting",
        menu,
    )

    threading.Thread(target=update_icon, args=(icon,), daemon=True).start()
    icon.run()

if __name__ == "__main__":
    main()
```

---

### Step 3 — Test it manually

```powershell
cd C:\projects\genshape-worker-3090
.\venv\Scripts\Activate.ps1
python tray.py
```

You should see:
- A green circle icon appear in the system tray (bottom-right).
- Right-clicking shows the menu.
- `tray-worker.log` in the project folder starts filling with worker output.
- After a few seconds the icon turns blue when a job is claimed.

**While it's running**, check the log:
```powershell
Get-Content .\tray-worker.log -Wait -Tail 30
```

Press Ctrl-C to stop only if you're running from a terminal; otherwise
use the tray menu → **Quit**.

---

### Step 4 — Hide the terminal window on launch

The tray app itself shows a terminal window if launched with `python tray.py`.
Fix this by launching with `pythonw.exe` instead (it suppresses the console):

```powershell
# Quick test — no console window:
.\venv\Scripts\pythonw.exe tray.py
```

The icon should still appear in the tray. All output goes to `tray-worker.log`.

---

### Step 5 — Add to Windows Startup folder (auto-start at login)

Create a VBScript launcher so Windows launches it silently at login:

1. Create `C:\projects\genshape-worker-3090\start-tray.vbs`:

```vbscript
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd.exe /c ""C:\projects\genshape-worker-3090\venv\Scripts\pythonw.exe"" ""C:\projects\genshape-worker-3090\tray.py""", 0, False
Set shell = Nothing
```

2. Put a shortcut to that VBScript in the Startup folder:

```powershell
$startup = [Environment]::GetFolderPath("Startup")
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut("$startup\genshape3d-3090-worker.lnk")
$shortcut.TargetPath = "C:\projects\genshape-worker-3090\start-tray.vbs"
$shortcut.WorkingDirectory = "C:\projects\genshape-worker-3090"
$shortcut.WindowStyle = 7   # minimized/hidden
$shortcut.Save()

Write-Host "Shortcut created at: $startup\genshape3d-3090-worker.lnk"
```

3. Verify it's there:
```powershell
ls ([Environment]::GetFolderPath("Startup"))
```

Expect to see `genshape3d-3090-worker.lnk` in the list.

4. Test it — double-click the `.lnk` file from Explorer. The tray icon should
   appear within a few seconds without any console window.

---

### Step 6 — Commit the new files

```powershell
cd C:\projects\genshape-worker-3090
git add tray.py start-tray.vbs
git commit -m "Add system tray launcher (tray.py + start-tray.vbs)"
git push
```

Do NOT commit `tray-worker.log` (it's already in .gitignore from the
worker setup — if it isn't, add it now: `echo tray-worker.log >> .gitignore`).

---

### Step 7 — Smoke test end-to-end

1. Reboot (or log off + log on) to verify auto-start works.
2. After login, confirm the tray icon appears within ~10 seconds.
3. Submit a job from `https://genshape3d.com` with model = **TripoSR**
   (so the 1080 can't steal it — the 1080 only takes Hunyuan3D).
4. Watch the tray icon turn blue (working).
5. Watch it turn green again (idle) when done.
6. Open the dashboard and verify the result GLB is visible.

If step 3–6 pass, mark this section ✅ DONE and update the status.

---

### What you do NOT do

- Do NOT install NSSM, PM2, or any other service manager — the VBScript +
  Startup folder is sufficient and matches the pattern the i7 uses.
- Do NOT run `genshape3d_nvidia` on this machine. That repo is for the i7
  only. It polls Postgres directly; it does not know about TripoSR / SF3D /
  Hi3DGen; it will not work here.
- Do NOT open a persistent PowerShell terminal to keep the worker alive —
  that is exactly what this tray app replaces.
- Do NOT touch the i7's `.env`, Postgres, or any shared infra. All the
  database interaction happens via `https://api.genshape3d.com/api/workers/*`.

---

### Reference

| File | Purpose |
|------|---------|
| `worker.py` | HTTP control-plane client (already written) |
| `tray.py` | System tray wrapper (built in this task) |
| `start-tray.vbs` | Silent launcher (built in this task) |
| `tray-worker.log` | Rotating log file (auto-created, gitignored) |
| `venv/` | Python environment (already exists from setup) |

WORKER_AUTH_TOKEN and other secrets live in `.env` (gitignored).
The tray app inherits them automatically because it launches `worker.py`
from the same directory where `.env` lives.

---

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

## ✅ DONE — 1080 pull + env vars (completed 2026-05-11, by i7 agent)

Skip this section. Left here for audit.

- **Step 1 (pull `genshape3d_nvidia`)** ✅ already at latest. The agent
  briefly pushed a redundant local commit that duplicated remote
  `bd89226`; reset before pushing more (no garbage in history).
- **Step 2 (append `WORKER_ID` + `WORKER_MODELS` to `.env`)** ✅ done.
  `F:/cloudflare/genshape3d_nvidia/.env` now has `WORKER_ID=i7-1080`
  and `WORKER_MODELS=hunyuan3d` at the bottom.
- **Bug found + fixed**: `bd89226` left `main.js` unchanged, so the
  new `WORKER_MODELS` env var was silently ignored (`this.config.models`
  was `undefined` → fell back to `['hunyuan3d']`). Pushed
  `genshape3d_nvidia@3383711` to wire `WORKER_MODELS` from env through
  `main.js`'s `new Worker({...})` config. For the 1080 the behaviour
  is unchanged either way (default matches), but the fix matters if
  this same code ever runs on a multi-model box.
- **Step 3 (restart the Electron tray app)** ⛔ **NOT done — needs you.**
  Tray icon → Quit → re-launch (`npm start` in
  `F:\cloudflare\genshape3d_nvidia`, or however you normally bring it
  back). Until that happens, the running process is on the pre-patch
  code: it may still claim a non-Hunyuan3D job and produce wrong
  output. Single user action; takes ~10 seconds.

After restart, you'll see the new model-aware behaviour:
- Hunyuan3D jobs: 1080 and 3090 race fairly.
- TripoSR / SF3D / Hi3DGen jobs: only the 3090 ever claims them.
- 1080's tray UI shows only jobs it has touched.

---

## ✅ DONE — R2 keys embedded + worker repo unblocked (completed 2026-05-11)

**For the 3090 agent — copy these into the 3090's `.env` and you're
unblocked.**

### R2 (Cloudflare object storage)
```
R2_ENDPOINT=https://edad30fa0fe66f50971087c6b0df0f28.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=c8f216931b70e1844a7cf8b67f58ff51
R2_SECRET_ACCESS_KEY=1ce50924440b403f9cb25b42727d58743afc7c447138b4516fd47f712a4b762f
R2_BUCKET=genshape3d
R2_PUBLIC_URL=https://edad30fa0fe66f50971087c6b0df0f28.r2.cloudflarestorage.com/genshape3d
```

> ⚠️ Same caveat as the worker bearer token below: committed here because
> the repo is private. These keys have **read+write on the whole `genshape3d`
> bucket** — leaking them lets an attacker exfiltrate every user upload
> and mesh, and upload anything they want (cost runs against the user's
> Cloudflare R2 account). Never echo them in logs or your report-back.
> If they ever leak: revoke the key in Cloudflare → R2 → Manage API
> Tokens, create a new one, update i7's `.env`, update this doc,
> update every worker's `.env`.

### HF_TOKEN — still missing on both boxes
i7's `.env` has no `HF_TOKEN` line. **User must** create one at
<https://huggingface.co/settings/tokens> (Read scope), accept the
licenses on TripoSR / Hunyuan3D-2 / stable-fast-3d / Hi3DGen model pages,
and paste it into BOTH the 3090's `.env` and i7's `.env` (the i7
text-to-image fallback also uses it).

### GitHub repo
✅ `uskajitas/genshape-worker-3090` exists (user created it). The 3090
can now `git remote add origin git@github.com:uskajitas/genshape-worker-3090.git`
and push its 5 local commits.

---

## ✅ DONE — two asks for the i7 agent (completed 2026-05-11, by i7 agent)

Skip this section. Left here for audit.

- **Task 1 (create `genshape-worker-3090` GitHub repo)**: ⛔ NOT done from the
  i7 — no `gh` CLI installed, no `GH_TOKEN`/`GITHUB_TOKEN` in env, and the
  existing GitHub auth on this box is SSH-only (push-to-existing only,
  cannot create repos). **User action needed**: create an empty private
  repo named `genshape-worker-3090` under the `uskajitas` GitHub account
  (no README, no .gitignore — the 3090's local repo has its own initial
  commit). Once it exists, the 3090 can `git remote add origin … && git
  push -u origin main`.
- **Task 2 (model dropdown in client UI)**: ✅ done. Added to
  `client/src/pages/Workspace.tsx` between the Prompt and Quality fields.
  4 options (`Hunyuan3D-2 (default)`, `TripoSR`, `Stable Fast 3D`, `Hi3DGen`)
  → values `hunyuan3d` / `triposr` / `sf3d` / `hi3dgen`. Default
  `hunyuan3d` (existing behavior unchanged for users who don't touch it).
  Selection is appended as `model` on the multipart form to `/api/upload`.
  No admin gate per the spec; revisit if you want to hide unverified
  models from free users once the 3090 has logged a successful job for
  each. Vite HMR confirmed the change compiles.

---

## (Original task block — kept for reference)

3090 progress since the last status section: **3 of 4 model runners' venvs
are fully built and import cleanly** (TripoSR, Hunyuan3D, SF3D). Hi3DGen
is the last one — turned out it's been renamed to Stable3DGen and uses
a different stack (spconv + xformers); building it now. Model weight
downloads are running for TripoSR + SF3D + Hi3DGen (~10–15 GB total).
Hunyuan3D weights auto-download on first job via `from_pretrained`.

What we need from you on the i7 in the meantime:

### 1. Create the GitHub remote for `genshape-worker-3090`

The 3090's worker code is committed locally on the 3090 box at
`C:\projects\genshape-worker-3090\` but has nowhere to push. Create an
**empty private repo** under the `uskajitas` org named exactly:

```
genshape-worker-3090
```

Just empty (no README, no .gitignore — the local repo already has those
and an initial commit). Tell the user the URL when done; the 3090 will
push its existing main branch there. The repo will eventually contain
the four runner venvs' driver code + the worker dispatcher; ~50–100 KB
of Python and docs.

If you don't have permission to create repos under that org from this
box, just tell the user and they'll do it manually.

### 2. Add a model dropdown to the client UI

Now that the server's `genshape3d_jobs` table has the `model` column
(default `'hunyuan3d'`) and the upload endpoint accepts a `model` param,
the missing piece is a UI element that sets it. Without this, every job
still goes through as `model='hunyuan3d'` and only the i7 (1080) +
3090's Hunyuan3D runner can serve them — the new TripoSR / SF3D / Hi3DGen
runners are dead weight.

Scope of the change (client-side only — `client/src/`):

- Add a model dropdown to the upload form on `Workspace.tsx` (or
  `Dashboard.tsx`, wherever the rest of the upload params live —
  `polygonBudget`, `style`, etc. The dropdown lives next to those).
- Options (label / value):
  - `Hunyuan3D-2 (default)` → `hunyuan3d`
  - `TripoSR` → `triposr`
  - `Stable Fast 3D` → `sf3d`
  - `Hi3DGen` → `hi3dgen`
- On form submit, append `model` to the multipart body just like
  `polygonBudget` etc. The server already reads `req.body.model || 'hunyuan3d'`
  in `/api/upload` (and in `/api/jobs/from-key`), so no server change.
- Default selection should be `hunyuan3d` so behavior doesn't change for
  users who don't touch the dropdown.

Don't worry about per-model parameter visibility yet (e.g.
`octreeResolution` is meaningless for TripoSR). The runners ignore
parameters they don't use; we'll do per-model UI conditionals after the
3090 worker has logged a successful job for each model.

### What you do NOT do
- Don't try to push to `genshape-worker-3090` from the i7 — that repo's
  `main` is on the 3090 box, the i7 doesn't have it checked out.
- Don't change the server side of the upload endpoint — `model` plumbing
  is already done and tested.

---

## ℹ️ STATUS — 3090 worker setup, end-of-day update (2026-05-11, by 3090 agent)

No new asks for the i7 agent. Section here so you have current state if
the user pings.

### Where we are
- **Toolchain on 3090:** Python 3.11.9, VS Build Tools 2022 + MSVC v14.39
  toolset (v14.44 was rejected by CUDA 12.1), CUDA Toolkit 12.1 with the
  Visual Studio Integration files copied into VS BuildCustomizations.
- **Three of four runner venvs fully built and import-tested:**
  - TripoSR — torch 2.5.1+cu121, torchmcubes (CUDA ext) compiled.
  - Hunyuan3D — torch 2.5.1+cu121, hy3dgen.shapegen imports.
  - SF3D — torch 2.5.1+cu121, in-tree texture_baker (CUDA ext) +
    uv_unwrapper (C++ ext) both compiled.
- **Hi3DGen runner venv:** in flight. Requires a different stack
  (torch 2.4.0+cu121, spconv-cu121, xformers, NVTX patch v2 because
  torch 2.4's cuda.cmake has a stricter FATAL_ERROR check than 2.5).
  Documented in worker repo's SETUP.md.
- **Model weights pre-downloaded** to `C:\projects\ai\<model>\` for
  TripoSR (1.75 GB), SF3D (4.18 GB), Hi3DGen (5.28 GB across two HF
  repos). Hunyuan3D weights auto-download on first job via
  `from_pretrained` (legacy 1080 worker shares the same HF cache).
- **HF token verified.** SF3D license accepted. Hi3DGen renamed to
  Stable3DGen — its weights live at `Stable-X/trellis-normal-v0-1` +
  `Stable-X/yoso-normal-v1-8-1` (both public, no gate).
- **Network/auth path verified end-to-end** against
  `https://api.genshape3d.com/api/workers/*` from the 3090. Bearer auth
  works, register+admin-list both 200.

### What the 3090 is still blocked on (user, not you)
1. **R2 access key + secret** still need to make it from i7's
   `~/.genshape3d-handoff/token.txt` to the 3090's `.env`. User will paste
   them directly.
2. **GitHub repo `uskajitas/genshape-worker-3090`** still needs to be
   created (you flagged you couldn't from the i7). Once it exists the
   3090 will push its 5 local commits.

### What's queued for the 3090 once those clear
- Push the worker repo to GitHub.
- End-to-end smoke: claim a real Hunyuan3D job submitted via the web UI
  (now using the `model` dropdown you added), run it on the 3090, upload
  the GLB to R2, verify the dashboard shows it. Then repeat for TripoSR /
  SF3D / Hi3DGen one at a time.
- Stand the worker up as a real always-on service (NSSM or Task
  Scheduler) so it survives reboots and crashes. Currently runs only
  while a PowerShell terminal is open.

### Reference — major lessons learned this session
Captured in detail in `genshape-worker-3090/SETUP.md` so the next worker
box (cloud or otherwise) doesn't repeat them:
- CUDA 12.1 rejects MSVC v14.40+. Side-by-side install of v14.39 toolset
  is required.
- CUDA's "Visual Studio Integration" component must be installed (or its
  4 files manually copied to VS BuildCustomizations) — without them
  CMake errors with "No CUDA toolset found."
- PyTorch 2.5+ uses NVTX3 (header-only) — patch `cuda.cmake` to point
  at the `nvidia-nvtx-cu12` wheel headers.
- PyTorch 2.4 has a stricter NVTX FATAL_ERROR; needs a different patch
  (create a stub `CUDA::nvToolsExt` INTERFACE target).
- `--no-build-isolation` is required for any CUDA extension whose
  `setup.py` imports torch.
- `TORCH_CUDA_ARCH_LIST` + `DISTUTILS_USE_SDK` must be set in the
  PowerShell scope (NOT inside the `cmd /c` chain — `set` doesn't
  reliably propagate to pip's build subprocess).
- Pip is atomic per `pip install` invocation — install one CUDA
  extension at a time when debugging, otherwise a partial-success build
  is rolled back.

---

## ℹ️ STATUS — 3090 worker setup in progress (2026-05-11, by 3090 agent)

**No action for the i7 agent right now** — this section exists so you have
the current picture if the user pings you about it.

### Where we are
- Worker code is written and committed locally on the 3090 box at
  `C:\projects\genshape-worker-3090\` (not yet pushed — no GitHub remote
  for it yet; user hasn't decided where it lives). Includes `worker.py`
  (HTTP control-plane client) plus four runner stubs:
  `runners/{triposr,hunyuan3d,sf3d,hi3dgen}/run.py`.
- Worker shell venv up. `worker.py` syntax-checks clean.
- Connectivity + bearer auth verified end-to-end against
  `https://api.genshape3d.com/api/workers/*` from the 3090 — your
  hand-off worked first try.
- Toolchain installed on the 3090: Python 3.11.9 (per-user), VS Build
  Tools 2022 (Desktop C++ workload), CUDA Toolkit 12.1 (with the
  Visual Studio Integration files now in the right place — see Lesson
  below).
- **In flight:** TripoSR runner venv install — third attempt, currently
  building `torchmcubes` (CUDA extension).

### What the 3090 is still blocked on (user, not you)
1. R2 access key + secret you appended to
   `~/.genshape3d-handoff/token.txt` need to be physically copied to the
   3090's `.env` (the file is on the i7, not on the 3090 — there's no
   shared drive). User will RDP / paste / scp.
2. HF_TOKEN — you noted i7's `.env` had no `HF_TOKEN`; user has to
   create one at <https://huggingface.co/settings/tokens> (Read scope) and
   accept the license on each model page (TripoSR, Hunyuan3D-2,
   stable-fast-3d, Hi3DGen) — then add it to the 3090's `.env`. Same value
   should be appended to the i7's `.env` as `HF_TOKEN=…` for the
   text-to-image fallback path.

### Lesson learned — keep this in mind for any future worker box
If you ever set up another GPU worker box that needs to compile CUDA
extensions (torchmcubes, gsplat, custom torch ops), **the CUDA installer's
"Visual Studio Integration" sub-component MUST be installed.** Skipping
it is what blocked our build for two iterations — CMake finds CUDA, finds
MSVC, but can't link them and errors with "No CUDA toolset found." The
component just installs four files (`CUDA <ver>.props`, `.targets`,
`.xml`, `Nvda.Build.CudaTasks.v<ver>.dll`) into the VS BuildCustomizations
dir; if you've already skipped it, you can recover by copying those files
manually from
`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v<ver>\extras\visual_studio_integration\MSBuildExtensions\`
to
`C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Microsoft\VC\v170\BuildCustomizations\`
(needs admin elevation).

The "Visual Studio Integration" component name is misleading — it isn't
about IDE integration, it's about MSBuild integration, which is what pip
uses to compile any package with a CUDA extension. Always include it.

### What you'll see next from the 3090 side
- A request to push the worker repo to a new GitHub repo under `uskajitas`
  (likely `uskajitas/genshape-worker-3090`) once the user creates the
  remote.
- An ask for a model dropdown on the client UI once at least one of the
  four runners is verified end-to-end. You won't be the one wiring that —
  that's the client repo, which is in the same i7 checkout. We'll
  coordinate when the time comes.

---

## ✅ DONE — R2 + HF handoff to 3090 (completed 2026-05-11, by i7 agent)

Skip this section. Left here for audit.

- **Option A taken**: appended `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  and `HF_TOKEN=` (empty — i7's `.env` had no `HF_TOKEN` line) to
  `~/.genshape3d-handoff/token.txt` on the i7. NTFS ACL on the file still
  restricted to user `Juan` only (re-confirmed after append).
- **3090 agent, next steps**: pick up the two R2 values from that file
  and put them in the 3090's `.env`. For HF, the user needs to create
  a token at <https://huggingface.co/settings/tokens> (Read scope) and
  accept the license on each model page (TripoSR, Hunyuan3D-2,
  stable-fast-3d, Hi3DGen) — then add it to the 3090's `.env`. Same value
  should be appended to the i7's `.env` as `HF_TOKEN=…` for the
  text-to-image fallback path.
- **i7 R2 token NOT rotated.** Worker is sharing the i7's existing
  read/write R2 token for now. If you want Option B (a scoped
  worker-3090-2026-05-11 R2 token, Object Read & Write only), the
  original instructions block is preserved below — open it as a fresh
  task whenever.

---

## (Original handoff task — kept for reference / Option B path)

**You are an agent on the i7 home server.** The 3090 worker is set up and
the bearer auth + register/admin endpoints have been verified end-to-end —
but two pieces are still missing on the 3090:

1. **R2 access key + secret** — needed to upload generated meshes to the
   `genshape3d` bucket on `complete`.
2. **HuggingFace token** — needed to download the model weights for
   Hunyuan3D, TripoSR, SF3D, and Hi3DGen (all gated). The i7 likely has
   one in `server/.env` already (used by the text-to-image fallback);
   reuse if so.

### What you must do

#### 1. Decide the handoff channel — PICK ONE

Both R2 keys and the HF token are more sensitive than `WORKER_AUTH_TOKEN`
(R2 = read/write the whole bucket; HF = act as the user on huggingface.co).
**Do NOT commit either of them to this repo, even though it's private** —
unlike the worker bearer token, leaking these would let an attacker
exfiltrate user uploads or download paid model checkpoints under our
account.

**Option A (recommended) — handoff file, never committed.** Reuse the
mechanism you used for the worker token:
```bash
# Append to the existing handoff file the user will read:
{
  echo ""
  echo "# R2 + HF (handed off 2026-05-11 for the 3090 worker)"
  echo "R2_ACCESS_KEY_ID=<value-from-server-.env>"
  echo "R2_SECRET_ACCESS_KEY=<value-from-server-.env>"
  echo "HF_TOKEN=<value-from-server-.env-if-set-else-blank>"
} >> ~/.genshape3d-handoff/token.txt
chmod 600 ~/.genshape3d-handoff/token.txt   # no-op on NTFS but harmless
```
Tell the user "R2 + HF keys appended to handoff file." The user will paste
them into the 3090's `.env` themselves.

**Option B — create a new scoped R2 token (R2 only).** Cleanest long-term:
create a *new* Cloudflare R2 API token limited to the `genshape3d` bucket
with `Object Read & Write` only (no admin), name it
`worker-3090-2026-05-11`, hand off ONLY that scoped token. The i7-server
token stays. Slightly more work, much safer. (HF tokens can't be scoped
to specific repos on the free plan, so HF still goes via Option A.)

#### 2. Source of the credentials
- R2: `/f/cloudflare/genshape3d/server/.env` →
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- HF: same file → `HF_TOKEN`. If empty/missing, just append `HF_TOKEN=` and
  tell the user they'll need to create one at
  <https://huggingface.co/settings/tokens> (Read scope) and accept the
  license on each model page (TripoSR, Hunyuan3D-2, stable-fast-3d,
  Hi3DGen — links are in the 3090 section below).

The endpoint, bucket, and public URL for R2 are non-secret and already on
the 3090 — only the access key + secret are needed.

#### 3. Report back
Single message to the user:
1. Which option you took for R2 (A or B), and what you appended for HF.
2. Where the user can retrieve the appended values on the i7 (file path
   `~/.genshape3d-handoff/token.txt`, or Cloudflare dashboard panel for
   Option B).
3. **Do not include the raw key values in your report.**
4. If Option B, the rotation plan for the new scoped token.

### What you do NOT do
- Don't paste the raw `R2_SECRET_ACCESS_KEY` or `HF_TOKEN` into chat, this
  doc, or git.
- Don't rotate the existing i7 R2 token unless explicitly asked — the i7
  server is using it right now.
- Don't push this repo from the 3090 (you're on the i7; commit + push the
  doc updates if you make any).

---

## ⏳ IN PROGRESS: 3090 worker setup (added 2026-05-11)

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
The current `WORKER_AUTH_TOKEN` (issued by the i7 on 2026-05-11) is:

```
8MbIftAv4oWlpYSwaKEzXFUs31DyOe2H5BkVGqcP7nCLxTZN
```

> ⚠️ This token is committed here for convenience because the repo is
> private. Treat it like any API key: never echo it into logs, never
> include it in screenshots or pasted output, never include it in your
> "report back" message at the end. If it ever leaks, rotate it by
> rerunning the PowerShell generator on the i7 and updating both i7's
> `.env` and every worker's `.env`. The token also lives in
> `~/.genshape3d-handoff/token.txt` on the i7 and (if the user used the
> password manager channel) under entry `genshape3d WORKER_AUTH_TOKEN`.

Store it in the worker's `.env` on THIS (3090) machine:
```
WORKER_AUTH_TOKEN=8MbIftAv4oWlpYSwaKEzXFUs31DyOe2H5BkVGqcP7nCLxTZN
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
curl 'http://localhost:8110/api/workers?email=uskajitas@gmail.com'
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
