@echo off
title Stop AI Agent
echo Stopping any background node agent processes...
taskkill /F /IM node.exe 2>nul
echo Done.
pause
