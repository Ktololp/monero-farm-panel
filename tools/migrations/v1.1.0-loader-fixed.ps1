$ErrorActionPreference = 'Stop'

$payloadPath = Join-Path $PSScriptRoot 'v1.1.0.part1.b64'
$outPath = Join-Path $PSScriptRoot 'v1.1.0.mjs'
$expectedSha256 = '7a4a3f6413e1a86d902c876256010bb72ba44f5d9a2b7e8485c426c30dfd225a'

if (-not (Test-Path $payloadPath)) {
    throw "Migration payload not found: $payloadPath"
}

$b64 = (Get-Content -LiteralPath $payloadPath -Raw) -replace '\s',''
$bytes = [Convert]::FromBase64String($b64)
$inputStream = New-Object IO.MemoryStream(,$bytes)
$gzip = New-Object IO.Compression.GZipStream($inputStream, [IO.Compression.CompressionMode]::Decompress)
$out = [IO.File]::Create($outPath)
try {
    $gzip.CopyTo($out)
}
finally {
    $out.Dispose()
    $gzip.Dispose()
    $inputStream.Dispose()
}

$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $outPath).Hash.ToLowerInvariant()
if ($actualSha256 -ne $expectedSha256) {
    Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
    throw "Migration SHA256 mismatch. Expected $expectedSha256, got $actualSha256"
}

Write-Host "Created and verified $outPath"
Write-Host "SHA256: $actualSha256"
