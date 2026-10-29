@echo off
rem Cafe POS launcher - runs the local backend (port 4000) and web UI (port 1994).
rem Everything runs on THIS PC only (127.0.0.1 for the web UI). No admin rights needed.
setlocal
cd /d "%~dp0"
set "NODE=%~dp0node\node.exe"
set NODE_ENV=production
set NEXT_TELEMETRY_DISABLED=1
set FRONTEND_ORIGIN=http://localhost:1994
set COOKIE_SECURE=false

rem --- backend: apply DB migrations, then start the API ---
cd /d "%~dp0backend"
set PORT=4000
"%NODE%" node_modules\prisma\build\index.js migrate deploy
if errorlevel 1 (
  echo Database migration failed. Press any key to close.
  pause >nul
  exit /b 1
)
start "Cafe POS backend" /min "%NODE%" src\server.js

rem --- frontend: Next.js standalone server, bound to this PC only ---
cd /d "%~dp0frontend"
set PORT=1994
set HOSTNAME=127.0.0.1
start "Cafe POS web" /min "%NODE%" server.js

timeout /t 5 /nobreak >nul
start "" "http://localhost:1994"
exit /b 0
