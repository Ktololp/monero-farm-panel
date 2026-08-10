@echo off
setlocal
cd /d "%~dp0"

echo Monero Farm Panel - Windows start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
set "PANEL_EXIT=%ERRORLEVEL%"

echo.
echo Monero Farm Panel backend stopped. Exit code: %PANEL_EXIT%
echo If this was unexpected, check: data\panel-crash.log
echo.
pause
exit /b %PANEL_EXIT%
