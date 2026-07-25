@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SneakSolve Website

echo ================================================
echo             SneakSolve Website
echo ================================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js 22 is required.
  pause
  exit /b 1
)

if not exist ".env.local" (
  copy /Y ".env.example" ".env.local" >nul
  echo Created .env.local from .env.example.
  echo Add your existing Clerk publishable key before continuing.
  notepad ".env.local"
  pause
)

if not exist "node_modules\" (
  echo Installing website packages...
  call npm.cmd install
  if errorlevel 1 (
    echo Package installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Open http://localhost:3000 in Chrome.
echo Keep this window open while testing.
echo.
call npm.cmd run dev
pause
