@echo off
cd /d "%~dp0"

rem Start Ollama only if it is not already running
tasklist /fi "imagename eq ollama.exe" 2>nul | find /i "ollama.exe" >nul
if errorlevel 1 (
    echo Starting Ollama...
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
        start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
    ) else (
        start /b ollama serve
    )
    ping 127.0.0.1 -n 3 >nul
)

rem Rebuild only when the source has changed (no-op otherwise)
node scripts\ensure-build.js

rem Open the prebuilt dist directly with Electron (no Vite dev server needed)
echo Starting Local AI...
"node_modules\electron\dist\electron.exe" .
