# Launch the GenShape3D server detached, hidden, with stdout/stderr APPENDED to log files.
# Called by start-hidden.vbs (or directly from Task Scheduler / a shortcut).
#
# Implementation: Start-Process forks reliably from any context; cmd.exe inside
# does the `>>` append-redirect (which Start-Process's -RedirectStandard*
# can't do — those overwrite). Both layers run -WindowStyle Hidden, so no
# console window appears.

$root   = 'F:\cloudflare\genshape3d\server'
$logDir = 'F:\cloudflare\.pm2-logs'
$outLog = Join-Path $logDir 'genshape3d-server.out.log'
$errLog = Join-Path $logDir 'genshape3d-server.err.log'

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

# If the server is already up on 8110, exit silently (idempotent).
$already = Get-NetTCPConnection -LocalPort 8110 -State Listen -ErrorAction SilentlyContinue
if ($already) { exit 0 }

$cmdLine = "node node_modules\ts-node-dev\lib\bin.js --respawn --transpile-only src/index.ts >> `"$outLog`" 2>> `"$errLog`""

Start-Process `
  -FilePath          'cmd.exe' `
  -ArgumentList      '/c', $cmdLine `
  -WorkingDirectory  $root `
  -WindowStyle       Hidden
