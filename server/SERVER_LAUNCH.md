## How the server runs on the i7 home server

`genshape3d-server` does **not** run under PM2 (unlike the other projects).
It runs as a detached, hidden process launched by `start-hidden.vbs`.

**Why:** PM2 on Windows occasionally pops a console window when restarting
this process, and closing that window kills the server (502 on the public
tunnel). `wscript.exe` with window-style 0 produces no window at all.

### Launching manually
```
wscript.exe F:\cloudflare\genshape3d\server\start-hidden.vbs
```
Returns immediately. Server runs in the background. Logs go to
`F:/cloudflare/.pm2-logs/genshape3d-server.{out,err}.log` (kept the same
paths so old tooling still works).

### Auto-start at user logon
A copy of `start-hidden.vbs` lives at:
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\genshape3d-server.vbs
```
Windows runs it automatically when user `Juan` logs in.

### Stopping the server
Find the inner node process and kill it:
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*genshape3d\server*' -and
                 $_.CommandLine -like '*ts-node-dev-hook*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### Verifying it's up
```
curl http://localhost:8110/api/health    # local
curl https://api.genshape3d.com/api/health   # via tunnel
netstat -ano | findstr :8110
```

### Auto-reload behaviour
`ts-node-dev --respawn` watches `src/**/*.ts` and reloads on save.
**`.env` changes are NOT auto-detected** — touch `src/index.ts` (or stop
and re-run the .vbs) to pick up new env values.

### `genshape3d-client` (Vite)
Still managed by PM2 — `vite` doesn't spawn child windows so it's fine
under PM2. See `F:/cloudflare/ecosystem.config.cjs`.
