# Enable CEP PlayerDebugMode so unsigned extensions load.
# AE 2024 uses CSXS.11. We also set a few older keys for safety.

$ErrorActionPreference = "Stop"

$versions = @("11", "10", "9")
foreach ($v in $versions) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1"
    Write-Host "Set PlayerDebugMode=1 at $key"
}

Write-Host ""
Write-Host "Done. Restart After Effects for changes to take effect." -ForegroundColor Green
