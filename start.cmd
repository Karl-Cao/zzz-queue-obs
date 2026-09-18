@echo off
cd /d "%~dp0"
if exist "ZZZ Queue.exe" (
 start "" "%~dp0ZZZ Queue.exe"
 exit /b
)
if exist "queue_tray.py" (
 call start-python.cmd
 exit /b
)
if exist "runtime\node.exe" (
 "runtime\node.exe" scripts\start.mjs
) else (
 node scripts\start.mjs
)
if errorlevel 1 pause
