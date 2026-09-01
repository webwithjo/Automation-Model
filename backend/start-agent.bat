@echo off
title AI Email & Meeting Scheduling Agent
cd /d "%~dp0"
echo ======================================================
echo   AI Email & Meeting Scheduling Agent
echo ======================================================
echo.
echo Starting agent polling... (Press Ctrl+C to stop)
node index.js
pause
