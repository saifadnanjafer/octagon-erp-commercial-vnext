@echo off
title Octagon ERP System
echo.
echo   ╔══════════════════════════════════════╗
echo   ║       Octagon ERP System             ║
echo   ║       Starting Server...             ║
echo   ╚══════════════════════════════════════╝
echo.

:: Start the server in the background
start /min powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"

:: Wait 2 seconds for the server to be ready
timeout /t 2 /nobreak >nul

:: Open the browser
start http://localhost:8088

echo   Server is running! Browser opened.
echo   Close this window to keep the server running.
echo   To stop: close the PowerShell window.
