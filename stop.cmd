@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
 "runtime\node.exe" scripts\start.mjs --stop
) else (
 node scripts\start.mjs --stop
)
pause
