param([string]$ApiDirectory = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'WebsiteAPI'))
$ErrorActionPreference = 'Stop'
$previousScript = $env:VELVEN_SUBMISSION_BROWSER_SCRIPT
try {
    $env:VELVEN_SUBMISSION_BROWSER_SCRIPT = Join-Path $PSScriptRoot 'test-apartment-submission-integration.mjs'
    & (Join-Path $ApiDirectory 'Test-Local.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Apartment submission integration failed.' }
} finally {
    $env:VELVEN_SUBMISSION_BROWSER_SCRIPT = $previousScript
}
