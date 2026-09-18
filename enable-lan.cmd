@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0enable-lan.ps1"
if errorlevel 1 (
 echo LAN setup failed or was cancelled.
) else (
 echo LAN access enabled. Open the LAN address shown on the PC dashboard.
)
pause
