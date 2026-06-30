# Install the CEP panel by copying plugin/ into the per-user CEP extensions folder.

$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "..\plugin"
$src = (Resolve-Path $src).Path
$dst = Join-Path $env:APPDATA "Adobe\CEP\extensions\ae-meta-mcp"

if (-not (Test-Path (Join-Path $src "CSXS\manifest.xml"))) {
    Write-Error "manifest.xml not found under $src\CSXS. Aborting."
    exit 1
}

# Ensure parent exists, then refresh the destination.
$parent = Split-Path $dst -Parent
New-Item -ItemType Directory -Path $parent -Force | Out-Null
if (Test-Path $dst) {
    Remove-Item -Recurse -Force $dst
}
Copy-Item -Recurse $src $dst

Write-Host "Installed CEP panel:" -ForegroundColor Green
Write-Host "  from: $src"
Write-Host "  to:   $dst"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. (Re)start After Effects"
Write-Host "  2. Window -> Extensions -> ae-meta-mcp"
Write-Host "  3. Keep the panel open"
