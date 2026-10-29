@echo off
cd /d "%~dp0"
node scripts\local-system.mjs stop
if errorlevel 1 pause
