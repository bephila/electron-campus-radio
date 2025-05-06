@echo off
REM ───────────────────────────────────────────────
REM 1) Switch into the folder where this script lives
cd /d "%~dp0"

REM 2) Launch nginx.exe
start "" "nginx.exe"

REM 3) Optional: keep the console open so you can see any errors
pause
