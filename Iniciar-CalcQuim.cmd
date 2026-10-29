@echo off
cd /d "%~dp0"
node scripts\local-system.mjs start
if errorlevel 1 pause
