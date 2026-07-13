@echo off
setlocal
cd /d "%~dp0server"
if not exist .env (
  copy .env.example .env >nul
  echo.
  echo A server\.env file was created.
  echo Open it in Notepad, add your OPENAI_API_KEY, save it, then run this file again.
  notepad .env
  pause
  exit /b 0
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo FFmpeg is required for gameplay recording analysis.
  echo Install it with: winget install --id Gyan.FFmpeg -e
  echo The dashboard and AI chat will still work without it.
  echo.
)
if not exist node_modules (
  echo Installing the Nexus Gaming Hub companion...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Confirm Node.js is installed.
    pause
    exit /b 1
  )
)
start "" http://localhost:8787
call npm start
pause
