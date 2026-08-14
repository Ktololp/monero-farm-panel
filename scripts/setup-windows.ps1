param(
  [ValidateSet('Native','Docker')]
  [string]$Mode = 'Native',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $ProjectRoot

function New-RandomBytes([int]$Count) {
  $bytes = New-Object byte[] $Count
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return $bytes
}
function To-Hex([byte[]]$Bytes) { return ([BitConverter]::ToString($Bytes)).Replace('-', '').ToLowerInvariant() }
function To-Base64Url([byte[]]$Bytes) { return ([Convert]::ToBase64String($Bytes)).TrimEnd('=').Replace('+','-').Replace('/','_') }
function Command-Exists([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }
function Get-ProjectVersion {
  try { return (Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json).version } catch { return 'unknown' }
}
function Find-NpmRunner {
  $node = (Get-Command node -ErrorAction Stop).Source
  $nodeDir = Split-Path $node -Parent
  $candidates = @(
    (Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js'),
    (Join-Path (Split-Path $nodeDir -Parent) 'node_modules\npm\bin\npm-cli.js'),
    'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return @{ Kind='cli'; Path=$c; Node=$node } } }
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd) { return @{ Kind='cmd'; Path=$cmd.Source; Node=$node } }
  throw 'npm runner was not found. Reinstall Node.js with npm enabled.'
}
function Invoke-Npm($Runner, [string[]]$Arguments) {
  if ($Runner.Kind -eq 'cli') { & $Runner.Node $Runner.Path @Arguments | Out-Host }
  else { & $Runner.Path @Arguments | Out-Host }
  return [int]$LASTEXITCODE
}
function Read-EnvMap {
  $map = @{}
  if (Test-Path '.env') {
    foreach ($line in Get-Content '.env') {
      if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
      $i = $line.IndexOf('=')
      $map[$line.Substring(0,$i)] = $line.Substring($i+1)
    }
  }
  return $map
}

Write-Host "=== Monero Farm Panel: Windows setup ($Mode) ===" -ForegroundColor Cyan
Write-Host "Project version: $(Get-ProjectVersion)"
New-Item -ItemType Directory -Force -Path 'data','certs' | Out-Null

$existing = Read-EnvMap
if ((Test-Path '.env') -and -not $Force) {
  Write-Host 'Existing .env found. Keeping current secrets and settings.' -ForegroundColor Green
  $adminPassword = $existing['PANEL_ADMIN_PASSWORD']
  $encKey = $existing['PANEL_ENCRYPTION_KEY']
  $sessionSecret = $existing['PANEL_SESSION_SECRET']
  $pfxPassphrase = $existing['TLS_PFX_PASSPHRASE']
  if (-not $adminPassword -or -not $encKey -or -not $sessionSecret -or -not $pfxPassphrase) {
    throw 'Existing .env is incomplete. Run setup with -Force to regenerate it.'
  }
} else {
  if ((Test-Path '.env') -and $Force) { Copy-Item '.env' '.env.bak' -Force; Write-Host 'Existing .env was saved as .env.bak.' }
  Write-Host 'No .env found. Creating a new configuration.'
  $adminPassword = To-Base64Url (New-RandomBytes 18)
  $encKey = [Convert]::ToBase64String((New-RandomBytes 32))
  $sessionSecret = To-Hex (New-RandomBytes 32)
  $pfxPassphrase = To-Base64Url (New-RandomBytes 24)
  $sshSock = if ($Mode -eq 'Native') { '\\.\pipe\openssh-ssh-agent' } else { '' }
  $envLines = @(
    "PANEL_ADMIN_PASSWORD=$adminPassword",
    "PANEL_ENCRYPTION_KEY=$encKey",
    "PANEL_SESSION_SECRET=$sessionSecret",
    'PORT=3000','DATA_DIR=data','CERT_DIR=certs','HTTPS_ENABLED=true','COOKIE_SECURE=true','TRUST_PROXY=0',
    'POLL_INTERVAL_MS=15000','HISTORY_INTERVAL_MS=60000','HISTORY_RETENTION_DAYS=30',
    'TLS_PFX_PATH=certs/panel.pfx',"TLS_PFX_PASSPHRASE=$pfxPassphrase","SSH_AUTH_SOCK=$sshSock",
    'PANEL_UID=1000','PANEL_GID=1000','# PANEL_SSH_PUBLIC_KEY=ssh-ed25519 AAAA... panel@host'
  )
  [System.IO.File]::WriteAllLines((Join-Path $ProjectRoot '.env'), $envLines, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ''
  Write-Host "PANEL MASTER PASSWORD: $adminPassword" -ForegroundColor Yellow
  Write-Host 'SAVE THIS PASSWORD. It is used to initialize the panel administrator account.' -ForegroundColor Yellow
  Write-Host ''
}

$pfxPath = Join-Path $ProjectRoot 'certs\panel.pfx'
if ((Test-Path $pfxPath) -and -not $Force) {
  Write-Host 'Existing HTTPS certificate found. Keeping it.'
} else {
  Write-Host 'Creating a self-signed HTTPS certificate...'
  if (-not (Command-Exists 'New-SelfSignedCertificate')) { throw 'New-SelfSignedCertificate is unavailable. Use Windows PowerShell 5.1 with the PKI module.' }
  $dnsNames = @('localhost'); if ($env:COMPUTERNAME) { $dnsNames += $env:COMPUTERNAME }
  $cert = New-SelfSignedCertificate -DnsName $dnsNames -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'Monero Farm Panel' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(2)
  try { $securePass = ConvertTo-SecureString $pfxPassphrase -AsPlainText -Force; Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePass | Out-Null }
  finally { Remove-Item ("Cert:\CurrentUser\My\" + $cert.Thumbprint) -Force -ErrorAction SilentlyContinue }
}

if ($Mode -eq 'Native') {
  if (-not (Command-Exists 'node')) { throw 'Node.js 22.19.0 or newer was not found.' }
  $nodeVersion = [Version]((& node -p "process.versions.node").Trim())
  if ($nodeVersion -lt [Version]'22.19.0') { throw "Node.js 22.19.0 or newer is required. Detected: $(& node -v)" }
  $runner = Find-NpmRunner
  Write-Host "Using npm runner: $($runner.Kind) -> $($runner.Path)"
  Write-Host 'Terminal packages: @xterm/xterm 5.5.0 + @xterm/addon-fit 0.10.0'
  Write-Host 'Installing/updating npm dependencies...'
  $code = Invoke-Npm $runner @('install')
  if ($code -ne 0) { throw "npm install failed with exit code $code." }
  Write-Host 'Building frontend...'
  $code = Invoke-Npm $runner @('run','build:web')
  if ($code -ne 0) { throw "Frontend build failed with exit code $code." }
  $agent = Get-Service ssh-agent -ErrorAction SilentlyContinue
  if ($null -eq $agent) { Write-Warning 'Windows OpenSSH Authentication Agent service was not found. Password/private-key SSH still works.' }
  elseif ($agent.Status -ne 'Running') { Write-Warning 'ssh-agent is not running. In an elevated PowerShell run: Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent' }
  else { Write-Host 'Windows ssh-agent is running.' -ForegroundColor Green }
  Write-Host ''; Write-Host 'Setup complete.' -ForegroundColor Green; Write-Host 'Start with:'; Write-Host '.\scripts\start-windows.ps1'; Write-Host 'Or double-click START_WINDOWS.cmd'; Write-Host 'Panel URL: https://localhost:3000'
} else {
  if (-not (Command-Exists 'docker')) { throw 'Docker CLI was not found. Install and start Docker Desktop.' }
  Write-Host 'Docker Desktop setup complete.' -ForegroundColor Green
  Write-Host 'Start with: docker compose up -d --build'
}
