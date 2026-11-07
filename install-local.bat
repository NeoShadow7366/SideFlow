@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo   SideFlow — Local Build ^& Warning-Free Silent Installer
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Local
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Local installation failed.
    pause
    exit /b %errorlevel%
)
echo.
pause
endlocal
