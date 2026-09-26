@echo off
cd /d "%~dp0.."
if not exist ".venv\Scripts\pythonw.exe" (
 echo Please run start.cmd once to install the Python tray dependencies.
 pause
 exit /b 1
)
start "" "%~dp0..\.venv\Scripts\pythonw.exe" "%~dp0host_tray.py"
