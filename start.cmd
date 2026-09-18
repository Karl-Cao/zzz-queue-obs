@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
 "runtime\node.exe" scripts\start.mjs
) else (
 node scripts\start.mjs
)
if errorlevel 1 pause
