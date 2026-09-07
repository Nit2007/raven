@echo off
TITLE RAVEN System Orchestrator

echo =================================================================
echo             RAVEN CYBERSECURITY AGENT - SYSTEM LAUNCHER
echo =================================================================
echo.

set "DEBUG_CENTER_DIR=C:\Users\Karanjith\OneDrive\coursera-test\Attachments\Desktop\sih-2026-part2\raven\raven-debug-center"
if not exist "%DEBUG_CENTER_DIR%" (
    set "DEBUG_CENTER_DIR=C:\Users\Karanjith\OneDrive\coursera-test\Attachments\Desktop\sih-2026-part2\raven-debug-center"
)

set "SERVER_DIR=C:\Users\Karanjith\OneDrive\coursera-test\Attachments\Desktop\sih2026\Server"

echo [1/3] Checking Telemetry Webhook dependencies in %DEBUG_CENTER_DIR%...
cd /d "%DEBUG_CENTER_DIR%"
if not exist "node_modules\ws" (
    echo [*] Installing missing 'ws' package for Telemetry Relay...
    call npm install ws
)
if not exist "node_modules" (
    echo [*] Installing Debug Center frontend dependencies...
    call npm install
)

echo.
echo [2/3] Launching Telemetry Webhook Server (Port 8765)...
start "RAVEN Telemetry Relay (Port 8765)" cmd /k "cd /d "%DEBUG_CENTER_DIR%" && node server.js"

echo.
echo [3/3] Launching Debug Center Dashboard (Port 5173)...
start "RAVEN Debug Center UI (Port 5173)" cmd /k "cd /d "%DEBUG_CENTER_DIR%" && npm run dev"

if exist "%SERVER_DIR%\main.py" (
    echo.
    echo [Bonus] Launching FastAPI Backend (Port 8000)...
    start "RAVEN FastAPI Server (Port 8000)" cmd /k "cd /d "%SERVER_DIR%" && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
)

echo.
echo =================================================================
echo  All RAVEN services have been started in separate windows!
echo  - Telemetry Webhook:  http://localhost:8765/telemetry
echo  - Debug Center UI:    http://localhost:5173
echo  - FastAPI Backend:    http://localhost:8000
echo =================================================================
pause
