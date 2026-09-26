@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0qq\download-resources.ps1"
echo.
echo Press any key to close this window. / 按任意键关闭窗口。
pause >nul
