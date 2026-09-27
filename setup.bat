@echo off
rem Local AI - one-click setup for a new Windows PC.
rem   setup.bat               : install packages, build UI, create desktop shortcut
rem   setup.bat --no-shortcut : same, but skip the desktop shortcut
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js 20 or later is required: https://nodejs.org/
    pause
    exit /b 1
)

where ollama >nul 2>nul
if errorlevel 1 if not exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
    echo [WARN] Ollama was not found. Install it for local chat: https://ollama.com/download
    echo        Then download a model from the app's model manager, or e.g.:  ollama pull qwen3:14b
)

echo Installing packages...
call npm ci --no-audit --no-fund || goto :error

echo Building UI...
call npm run build || goto :error

if /i not "%~1"=="--no-shortcut" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create_shortcut.ps1"
)

echo.
echo Setup complete. Start the app with the desktop shortcut or launch.bat
pause
exit /b 0

:error
echo [ERROR] Setup failed.
pause
exit /b 1
