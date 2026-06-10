@echo off
chcp 65001 >nul
cd /d "%~dp0"
title FillDuck

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [x] Node.js not found. Install it first: https://nodejs.org/ then run this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies for the first time, please wait...
  set "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1"
  call npm install
  if errorlevel 1 (
    echo.
    echo [x] Install failed. Check your network and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting GUI... a browser tab will open at http://localhost:4599
echo When finished, close the browser, then press Ctrl+C in this window.
echo.
call npm start
pause
