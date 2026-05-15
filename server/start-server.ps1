# Launch the GenShape3D server detached, hidden, with stdout/stderr APPENDED to log files.
# Called by start-hidden.vbs (or directly from Task Scheduler / a shortcut).
#
# Idempotency is enforced two ways:
#   1. If port 8110 is already listening, exit 0.
#   2. If ANY node process is already running ts-node-dev for src/index.ts
#      out of this server dir, kill the duplicates and pause so the kernel
#      releases :8110 before we relaunch. Without this, two parents (e.g.
#      one from this VBS launcher + one started manually) end up fighting
#      for the port and the respawn race kills the API silently.
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

function _genshape3dTsNodeProcs {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $cl = $_.CommandLine
            $cl -and
            $cl -match 'ts-node-dev' -and
            ($cl -match 'src[\\/]index\.ts') -and
            ($cl -notmatch 'pm2[\\/]lib[\\/]ProcessContainerFork')
        }
}

function _portFree([int]$port, [int]$timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (-not $busy) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# (1) Already listening? Nothing to do.
$already = Get-NetTCPConnection -LocalPort 8110 -State Listen -ErrorAction SilentlyContinue
if ($already) { exit 0 }

# (2) Kill any stale ts-node-dev parents pointed at this repo. They wouldn't
#     be listening (we'd have exited above) but they DO hold a respawn loop
#     that will fight whatever we start next.
$stale = _genshape3dTsNodeProcs
foreach ($p in $stale) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($stale) { Start-Sleep -Seconds 4 }

# (3) Wait for :8110 to be free in the kernel (TIME_WAIT after the kills).
if (-not (_portFree 8110 30)) {
    # 30 s timeout. Bail loudly so the auto-deploy watcher / external monitor
    # can see we never came up, rather than silently respawning forever.
    Add-Content -Path $errLog -Value "[$(Get-Date -Format o)] start-server.ps1: :8110 still busy after 30 s, refusing to launch"
    exit 2
}

$cmdLine = "node node_modules\ts-node-dev\lib\bin.js --respawn --transpile-only src/index.ts >> `"$outLog`" 2>> `"$errLog`""

Start-Process `
  -FilePath          'cmd.exe' `
  -ArgumentList      '/c', $cmdLine `
  -WorkingDirectory  $root `
  -WindowStyle       Hidden
