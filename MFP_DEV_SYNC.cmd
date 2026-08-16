@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REPO=C:\Users\ktoto\Desktop\monero-farm-panel-1.2.1-test"
set "BRANCH=dev/v1.3.0"

rem Always execute the worker from TEMP so git may safely update this file.
if /I not "%~1"=="--worker" (
    set "RUNNER=%TEMP%\MFP_DEV_SYNC_RUN_%RANDOM%_%RANDOM%.cmd"
    copy /Y "%~f0" "!RUNNER!" >nul || (
        echo [MFP_SYNC] ERROR: could not create temporary runner.
        pause
        exit /b 1
    )
    call "!RUNNER!" --worker
    set "RC=!errorlevel!"
    del /Q "!RUNNER!" >nul 2>&1
    exit /b !RC!
)

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
git rev-parse --is-inside-work-tree >nul 2>&1 || goto :fail

echo [MFP_SYNC] Fetching %BRANCH%...
git fetch origin %BRANCH% || goto :fail

rem Protect all application/user changes. Updater-only changes are service state.
set "DIRTY_COUNT=0"
set "OTHER_DIRTY_COUNT=0"
for /f "tokens=1,*" %%A in ('git status --porcelain') do (
    set /a DIRTY_COUNT+=1
    set "DIRTY_PATH=%%B"
    if /I not "!DIRTY_PATH!"=="DEV_SYNC.cmd" if /I not "!DIRTY_PATH!"=="MFP_DEV_SYNC.cmd" set /a OTHER_DIRTY_COUNT+=1
)

if not "!OTHER_DIRTY_COUNT!"=="0" (
    echo [MFP_SYNC] ERROR: working tree contains application/user changes.
    echo [MFP_SYNC] Nothing will be overwritten or stashed automatically.
    echo.
    git status --short
    goto :fail
)

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT=%%B"

git merge-base --is-ancestor HEAD origin/%BRANCH% >nul 2>&1
if errorlevel 1 (
    echo [MFP_SYNC] ERROR: local HEAD contains commits not present in %BRANCH%.
    echo [MFP_SYNC] Refusing automatic reset.
    goto :fail
)

if /I not "!CURRENT!"=="%BRANCH%" (
    echo [MFP_SYNC] Switching to %BRANCH%...
    git show-ref --verify --quiet refs/heads/%BRANCH%
    if errorlevel 1 (
        git switch -c %BRANCH% --track origin/%BRANCH% || goto :fail
    ) else (
        git switch %BRANCH% || goto :fail
    )
)

if not "!DIRTY_COUNT!"=="0" (
    echo [MFP_SYNC] Repairing updater-only working tree state...
    git reset --hard origin/%BRANCH% || goto :fail
) else (
    echo [MFP_SYNC] Fast-forwarding development branch...
    git merge --ff-only origin/%BRANCH% || goto :fail
)

for /f "delims=" %%H in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%H"
for /f "delims=" %%R in ('git rev-parse origin/%BRANCH%') do set "REMOTE_HEAD=%%R"
echo [MFP_SYNC] Local HEAD:  !LOCAL_HEAD!
echo [MFP_SYNC] Remote dev:  !REMOTE_HEAD!

for /f %%C in ('git status --porcelain ^| find /c /v ""') do set "DIRTY=%%C"
if not "!DIRTY!"=="0" (
    echo [MFP_SYNC] ERROR: working tree is still dirty after sync.
    git status --short
    goto :fail
)

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
echo No application/user files were reset automatically.
echo Copy this window output to ChatGPT.
echo ============================================================
pause
exit /b 1
