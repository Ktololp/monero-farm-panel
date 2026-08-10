$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $ProjectRoot
if (-not (Test-Path '.env')) { throw '.env was not found. Run SETUP_WINDOWS.cmd first.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js was not found in PATH.' }
function Find-NpmRunner {
  $node=(Get-Command node -ErrorAction Stop).Source;$nodeDir=Split-Path $node -Parent
  foreach($c in @((Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js'),(Join-Path (Split-Path $nodeDir -Parent) 'node_modules\npm\bin\npm-cli.js'),'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js')){if(Test-Path $c){return @{Kind='cli';Path=$c;Node=$node}}}
  $cmd=Get-Command npm.cmd -ErrorAction SilentlyContinue;if($cmd){return @{Kind='cmd';Path=$cmd.Source;Node=$node}};throw 'npm runner was not found.'
}
function Invoke-Npm($Runner,[string[]]$Arguments){if($Runner.Kind -eq 'cli'){& $Runner.Node $Runner.Path @Arguments | Out-Host}else{& $Runner.Path @Arguments | Out-Host};return [int]$LASTEXITCODE}
$runner=Find-NpmRunner
if (-not (Test-Path 'public\app.js')) { Write-Host 'Frontend is not built yet. Building...';$c=Invoke-Npm $runner @('run','build:web');if($c -ne 0){exit $c} }
Write-Host 'Starting Monero Farm Panel at https://localhost:3000' -ForegroundColor Cyan
$code=Invoke-Npm $runner @('start')
exit $code
