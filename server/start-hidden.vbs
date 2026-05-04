' Launch the GenShape3D server with NO visible console window.
' Run with: wscript.exe start-hidden.vbs
'
' Window style 0 = hidden. The cmd /c keeps the parent alive long enough
' to spawn ts-node-dev, then exits. ts-node-dev itself writes to the
' files configured below (stdout / stderr redirected) so we still get logs.

Dim shell, cmd, logDir, outLog, errLog
Set shell = CreateObject("WScript.Shell")

logDir = "F:\cloudflare\.pm2-logs"
outLog = logDir & "\genshape3d-server.out.log"
errLog = logDir & "\genshape3d-server.err.log"

' cd into the server dir, then run ts-node-dev with stdout+stderr redirected.
cmd = "cmd /c cd /d F:\cloudflare\genshape3d\server && " & _
      "node node_modules\ts-node-dev\lib\bin.js --respawn --transpile-only src\index.ts " & _
      ">>""" & outLog & """ 2>>""" & errLog & """"

' Run hidden (0), don't wait for it to finish (false).
shell.Run cmd, 0, False
