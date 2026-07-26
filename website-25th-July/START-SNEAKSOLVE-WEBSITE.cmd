@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SneakSolve Local Website

if not exist "package.json" (
  echo ERROR: package.json was not found beside this file.
  pause
  exit /b 1
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Install Node.js 22.13 or newer, below version 23.
  pause
  exit /b 1
)

if not exist ".env.local" (
  copy /Y ".env.example" ".env.local" >nul
  echo Created .env.local. Add your existing Clerk publishable key before continuing.
  notepad ".env.local"
  pause
)

if not exist "node_modules\" call npm install
call npm run dev
pause
