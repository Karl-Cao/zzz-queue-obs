@echo off
cd /d "%~dp0"
set QUEUE_NO_BROWSER=1
if exist "runtime\node.exe" (
 "runtime\node.exe" scripts\start.mjs
) else (
 node scripts\start.mjs
)
if errorlevel 1 (pause & exit /b 1)
start "" powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0desktop\start.ps1" -Language zh
