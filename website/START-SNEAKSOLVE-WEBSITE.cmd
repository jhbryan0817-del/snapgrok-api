@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SneakSolve Local Website

if not exist "package.json" (
  echo ERROR: package.json was not found.
  pause
  exit /b 1
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  pause
  exit /b 1
)

if not exist ".env.local" copy /Y ".env.example" ".env.local" >nul
if not exist "node_modules\" call npm.cmd install
call npm.cmd run dev
pause
