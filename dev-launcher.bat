@echo off
setlocal enabledelayedexpansion
title SideFlow — Desktop Utility Dev Launcher
cd /d "%~dp0"

echo ============================================================
echo   SideFlow — Background Slide-Out Desktop Utility Panel
echo   Working Directory: %CD%
echo ============================================================
echo.

:: Ensure Node.js is available
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found in your PATH.
    echo Please install Node.js ^(https://nodejs.org/^) and try again.
    pause
    exit /b 1
)

:: Auto-install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [INFO] Installing project dependencies ^(npm install^)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

:: Check optional command-line argument (web | test | build | pack)
if /i "%~1"=="web" (
    echo [INFO] Starting SideFlow in Web Simulation Mode ^(http://localhost:5173^)...
    call npm run dev
    goto :end
)

if /i "%~1"=="test" (
    echo [INFO] Running SideFlow Automated Test Suite...
    call npm test
    pause
    goto :end
)

if /i "%~1"=="build" (
    echo [INFO] Building SideFlow Production Bundles...
    call npm run build
    pause
    goto :end
)

:: Free port 5173 if a previous Vite dev server is still holding it
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo [INFO] Releasing existing process on port 5173 ^(PID: %%a^)...
    taskkill /F /PID %%a >nul 2>nul
)

echo [INFO] Launching SideFlow in Native Electron System Tray + HMR Mode...
echo [TIP]  Press Alt + Space at any time to toggle the slide-out panel.
echo.
call npm run electron:dev

:end
if %errorlevel% neq 0 (
    echo.
    echo [WARN] Process exited with code %errorlevel%.
    pause
)
endlocal
