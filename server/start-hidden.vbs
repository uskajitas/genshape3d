' Launch start-server.ps1 with NO visible window.
' This file lives at:
'   F:\cloudflare\genshape3d\server\start-hidden.vbs   (canonical, in repo)
'   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\genshape3d-server.vbs (auto-launches at logon)
'
' Window style 0 = hidden. The PowerShell script does the real work via
' Start-Process so the server is fully detached.

Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""F:\cloudflare\genshape3d\server\start-server.ps1""", 0, False
