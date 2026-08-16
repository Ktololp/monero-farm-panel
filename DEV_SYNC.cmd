@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REPO=C:\Users\ktoto\Desktop\monero-farm-panel-1.2.1-test"
set "BRANCH=dev/v1.3.0"
set "SELF=%~f0"

rem -----------------------------------------------------------------
rem Self-install: if launched outside the repository, copy this exact
rem updater into the project root and continue from there.
rem -----------------------------------------------------------------
if not exist "%~dp0package.json" (
    if not exist "%REPO%\package.json" (
        echo [DEV_SYNC] ERROR: project not found:
        echo   %REPO%
        pause
        exit /b 1
    )
    echo [DEV_SYNC] Installing permanent updater into repository...
    copy /Y "%SELF%" "%REPO%\DEV_SYNC.cmd" >nul || (
        echo [DEV_SYNC] ERROR: could not copy DEV_SYNC.cmd
        pause
        exit /b 1
    )
    call "%REPO%\DEV_SYNC.cmd"
    exit /b %errorlevel%
)

cd /d "%~dp0" || goto :fail

echo ============================================================
echo Monero Farm Panel v1.3.0 - DEV SYNC
echo Branch: %BRANCH%
echo ============================================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1 || (
    echo [DEV_SYNC] ERROR: this is not a git working tree.
    goto :fail
)

echo [DEV_SYNC] Fetching GitHub branch...
git fetch origin %BRANCH% || goto :fail

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT=%%B"
for /f "delims=" %%H in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%H"
for /f "delims=" %%R in ('git rev-parse origin/%BRANCH%') do set "REMOTE_HEAD=%%R"

echo [DEV_SYNC] Current branch: !CURRENT!
echo [DEV_SYNC] Local HEAD:     !LOCAL_HEAD!
echo [DEV_SYNC] Remote dev:     !REMOTE_HEAD!
echo.

rem -----------------------------------------------------------------
rem Branch migration: switching is allowed only when both branches are
rem already on the exact same commit. Local work is never discarded.
rem -----------------------------------------------------------------
if /I not "!CURRENT!"=="%BRANCH%" (
    if /I not "!LOCAL_HEAD!"=="!REMOTE_HEAD!" (
        echo [DEV_SYNC] ERROR: local HEAD and remote dev HEAD differ.
        echo [DEV_SYNC] Refusing automatic branch switch.
        goto :fail
    )
    echo [DEV_SYNC] Switching to %BRANCH%...
    git show-ref --verify --quiet refs/heads/%BRANCH%
    if errorlevel 1 (
        git switch -c %BRANCH% --track origin/%BRANCH% || goto :fail
    ) else (
        git switch %BRANCH% || goto :fail
    )
)

for /f %%C in ('git status --porcelain ^| find /c /v ""') do set "DIRTY=%%C"
if not "!DIRTY!"=="0" (
    echo [DEV_SYNC] ERROR: working tree contains local changes.
    echo [DEV_SYNC] Nothing will be overwritten or stashed automatically.
    echo.
    git status --short
    goto :fail
)

echo [DEV_SYNC] Pulling latest development patch...
git pull --ff-only origin %BRANCH% || goto :fail

call :validate || goto :fail

echo.
echo ============================================================
echo [DEV_SYNC] ALL GREEN
echo Branch %BRANCH% is synced and validated.
echo ============================================================
echo.

echo [DEV_SYNC] Starting Monero Farm Panel...
start "MFP v1.3.0 DEV" cmd /k "cd /d "%~dp0" && call START_WINDOWS.cmd"
exit /b 0

:validate
echo.
echo ------------------------------------------------------------
echo [DEV_SYNC] npm install
echo ------------------------------------------------------------
call npm install --no-audit --no-fund
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [DEV_SYNC] Lingui compile
echo ------------------------------------------------------------
call npm run i18n:compile
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [DEV_SYNC] Project checks
echo ------------------------------------------------------------
call npm run check
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [DEV_SYNC] Tests
echo ------------------------------------------------------------
call npm test
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [DEV_SYNC] Frontend build
echo ------------------------------------------------------------
call npm run build:web
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [DEV_SYNC] git diff --check
echo ------------------------------------------------------------
git diff --check
if errorlevel 1 exit /b 1

exit /b 0

:fail
echo.
echo ============================================================
echo [DEV_SYNC] FAILED
echo Nothing will be reset automatically.
echo Copy this window output to ChatGPT.
echo ============================================================
pause
exit /b 1
