@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (
 py -3 -m venv .venv
 if errorlevel 1 (echo Install Python 3.10+ first. & pause & exit /b 1)
)
.venv\Scripts\python.exe -c "import pystray; import PIL" >nul 2>&1
if errorlevel 1 (
 .venv\Scripts\python.exe -m pip install -r requirements.txt
 if errorlevel 1 (pause & exit /b 1)
)
start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0queue_tray.py"
