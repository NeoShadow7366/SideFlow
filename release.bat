@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo   SideFlow One-Click Release Launcher
echo ========================================================
echo.
echo Select release type:
echo   [1] Auto / Patch Release (Recommended - e.g. v1.0.0 -^> v1.0.1)
echo   [2] Minor Feature Release (e.g. v1.0.0 -^> v1.1.0)
echo   [3] Major Release (e.g. v1.0.0 -^> v2.0.0)
echo   [4] Local Installer + GitHub Release (Builds .exe in release\ folder too)
echo.
set /p CHOICE="Enter choice [1-4, default=1]: "

if "%CHOICE%"=="2" (
  call npm run release:minor
) else if "%CHOICE%"=="3" (
  call npm run release:major
) else if "%CHOICE%"=="4" (
  call npm run release:local
) else (
  call npm run release
)

echo.
pause
