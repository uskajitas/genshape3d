## How the server runs on the i7 home server

`genshape3d-server` does **not** run under PM2 (unlike the other projects).
It runs as a detached, hidden process launched by a small two-step chain:

1. `start-hidden.vbs` (entry point) — invoked by Windows at user logon, or
   manually via `wscript.exe`. Pure invisible bootstrap.
2. `start-server.ps1` (real work) — uses PowerShell's `Start-Process` to
   fork a `cmd.exe /c` that runs `ts-node-dev` with stdout/stderr appended
   (via `>>`) to `F:/cloudflare/.pm2-logs/genshape3d-server.{out,err}.log`.

**Why this shape:**
- PM2 on this Windows host intermittently popped a console window when
  restarting; closing the window killed the server (502 on the public
  tunnel).
- `Start-Process -WindowStyle Hidden` always forks reliably, but its
  `-RedirectStandardOutput` overwrites instead of appending.
- `cmd.exe >>` appends but on its own can be flaky when invoked from a
  detached parent.
- Combining the two: PowerShell does the reliable forking, cmd does the
  reliable appending. Both layers run hidden.

### Launching manually (developer, recreating the server)
```
wscript.exe F:\cloudflare\genshape3d\server\start-hidden.vbs
```
Or skip the .vbs and run the .ps1 directly:
```
powershell -ExecutionPolicy Bypass -File F:\cloudflare\genshape3d\server\start-server.ps1
```
Both return immediately. Server runs in the background. Idempotent — if
8110 is already listening, the script exits without doing anything.

### Auto-start at user logon
A copy of `start-hidden.vbs` lives at:
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\genshape3d-server.vbs
```
Windows runs it automatically when user `Juan` logs in. The .vbs only
references the `.ps1` by absolute path, so it doesn't need to be edited
when the .ps1 changes.

### Stopping the server
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*genshape3d\server*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### Verifying it's up
```
curl http://localhost:8110/api/health      # local
curl https://api.genshape3d.com/api/health # via tunnel
netstat -ano | findstr :8110               # should show LISTENING
```

### Auto-reload behaviour
`ts-node-dev --respawn` watches `src/**/*.ts` and reloads on save.
**`.env` changes are NOT auto-detected** — touch `src/index.ts` (or stop
and re-run the launcher) to pick up new env values.

### `genshape3d-client` (Vite)
Still managed by PM2 — `vite` doesn't spawn child windows so it's fine
under PM2. See `F:/cloudflare/ecosystem.config.cjs`.
