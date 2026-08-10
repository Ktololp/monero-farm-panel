@echo off
setlocal
cd /d "%~dp0"
echo Monero Farm Panel - Windows setup (Native + SSH Agent)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1" -Mode Native
if errorlevel 1 (
  echo.
  echo Setup failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Setup completed.
pause
