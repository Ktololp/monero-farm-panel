@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REPO=C:\Users\ktoto\Desktop\monero-farm-panel-1.2.1-test"
set "BRANCH=dev/v1.3.0"

echo ============================================================
echo Monero Farm Panel v1.3.0 - STABLE DEV SYNC
echo Branch: %BRANCH%
echo ============================================================
echo.

if not exist "%REPO%\package.json" (
    echo [MFP_SYNC] ERROR: project not found:
    echo   %REPO%
    goto :fail
)

cd /d "%REPO%" || goto :fail

git rev-parse --is-inside-work-tree >nul 2>&1 || (
    echo [MFP_SYNC] ERROR: this is not a git working tree.
    goto :fail
)

echo [MFP_SYNC] Fetching %BRANCH%...
git fetch origin %BRANCH% || goto :fail

rem ------------------------------------------------------------
rem Recovery for the obsolete external DEV_SYNC.cmd launcher.
rem That old launcher copied itself over the tracked DEV_SYNC.cmd,
rem leaving exactly one local modification. It is safe to restore
rem only that tracked file; any other local edit remains protected.
rem ------------------------------------------------------------
set "DIRTY_COUNT=0"
set "DIRTY_LINE="
for /f "delims=" %%L in ('git status --porcelain') do (
    set /a DIRTY_COUNT+=1
    set "DIRTY_LINE=%%L"
)

if "!DIRTY_COUNT!"=="1" (
    echo(!DIRTY_LINE!| findstr /R /C:"^[ MARC?][MDARC?] DEV_SYNC.cmd$" >nul
    if not errorlevel 1 (
        echo [MFP_SYNC] Repairing DEV_SYNC.cmd overwritten by obsolete launcher...
        git restore --source=HEAD --worktree -- DEV_SYNC.cmd || goto :fail
    )
)

for /f %%C in ('git status --porcelain ^| find /c /v ""') do set "DIRTY=%%C"
if not "!DIRTY!"=="0" (
    echo [MFP_SYNC] ERROR: working tree contains local changes.
    echo [MFP_SYNC] Nothing else will be overwritten or stashed automatically.
    echo.
    git status --short
    goto :fail
)

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT=%%B"
for /f "delims=" %%H in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%H"
for /f "delims=" %%R in ('git rev-parse origin/%BRANCH%') do set "REMOTE_HEAD=%%R"

echo [MFP_SYNC] Current branch: !CURRENT!
echo [MFP_SYNC] Local HEAD:     !LOCAL_HEAD!
echo [MFP_SYNC] Remote dev:     !REMOTE_HEAD!
echo.

if /I not "!CURRENT!"=="%BRANCH%" (
    git merge-base --is-ancestor HEAD origin/%BRANCH% >nul 2>&1
    if errorlevel 1 (
        echo [MFP_SYNC] ERROR: current HEAD contains work not present in %BRANCH%.
        echo [MFP_SYNC] Refusing automatic branch switch.
        goto :fail
    )

    echo [MFP_SYNC] Switching to %BRANCH%...
    git show-ref --verify --quiet refs/heads/%BRANCH%
    if errorlevel 1 (
        git switch -c %BRANCH% --track origin/%BRANCH% || goto :fail
    ) else (
        git switch %BRANCH% || goto :fail
    )
)

echo [MFP_SYNC] Fast-forwarding development branch...
git pull --ff-only origin %BRANCH% || goto :fail

call :validate || goto :fail

echo.
echo ============================================================
echo [MFP_SYNC] ALL GREEN
echo Branch %BRANCH% is synced and validated.
echo ============================================================
echo.
echo [MFP_SYNC] Starting Monero Farm Panel...
start "MFP v1.3.0 DEV" cmd /k "cd /d "%REPO%" && call START_WINDOWS.cmd"
exit /b 0

:validate
echo.
echo ------------------------------------------------------------
echo [MFP_SYNC] npm install
echo ------------------------------------------------------------
call npm install --no-audit --no-fund
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [MFP_SYNC] Lingui compile
echo ------------------------------------------------------------
call npm run i18n:compile
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [MFP_SYNC] Project checks
echo ------------------------------------------------------------
call npm run check
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [MFP_SYNC] Tests
echo ------------------------------------------------------------
call npm test
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [MFP_SYNC] Frontend build
echo ------------------------------------------------------------
call npm run build:web
if errorlevel 1 exit /b 1

echo.
echo ------------------------------------------------------------
echo [MFP_SYNC] git diff --check
echo ------------------------------------------------------------
git diff --check
if errorlevel 1 exit /b 1

exit /b 0

:fail
echo.
echo ============================================================
echo [MFP_SYNC] FAILED
echo No user files were reset automatically.
echo Copy this window output to ChatGPT.
echo ============================================================
pause
exit /b 1
