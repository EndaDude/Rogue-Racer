# release.ps1 - Build, sign, and publish a Rogue Racer update to GitHub Releases.
#
# Usage:   .\release.ps1 -Version 0.1.1 -Notes "What changed"
#
# After this runs, everyone already running the app auto-updates to this
# version the next time they launch it.
#
# Requirements (one-time):
#   - gh CLI installed and signed in:  gh auth login
#   - signing key at %USERPROFILE%\.tauri\rogue-racer-updater.key

param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Notes = ""
)

$ErrorActionPreference = 'Stop'
$repo = 'EndaDude/Rogue-Racer'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path   # desktop/
$srcTauri = Join-Path $here 'src-tauri'
$conf = Join-Path $srcTauri 'tauri.conf.json'
$key = Join-Path $env:USERPROFILE '.tauri\rogue-racer-updater.key'

# Make sure cargo + gh are on PATH even in a fresh shell.
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

if (-not (Test-Path $key)) { throw "Signing key not found at $key" }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "gh CLI not found. Install it and run 'gh auth login'." }

Write-Host "==> Setting version to $Version" -ForegroundColor Cyan
# Bump only the top-level "version" field, leaving the rest of the file untouched.
$confText = Get-Content $conf -Raw
$confText = [regex]::Replace($confText, '("version"\s*:\s*")[^"]*(")', "`${1}$Version`${2}", 1)
[System.IO.File]::WriteAllText($conf, $confText, (New-Object System.Text.UTF8Encoding $false))

Write-Host "==> Syncing game into dist" -ForegroundColor Cyan
& (Join-Path $here 'sync-dist.ps1')

Write-Host "==> Building + signing (this takes a bit)" -ForegroundColor Cyan
Stop-Process -Name app -Force -ErrorAction SilentlyContinue
Push-Location $srcTauri
try {
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PATH -ErrorAction SilentlyContinue
    $env:CI = "true"
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $key -Raw
    # The signing key is password-protected. Prompt for it here (masked, never
    # echoed) unless it was already provided via the environment. Set it to a
    # single space in the env if your key has no password.
    if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
        $securePw = Read-Host "Enter updater signing key password" -AsSecureString
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePw)
        try {
            $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        }
        finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }
    cargo tauri build
    if ($LASTEXITCODE -ne 0) { throw "cargo tauri build failed" }
}
finally { Pop-Location }

$nsisDir = Join-Path $srcTauri 'target\release\bundle\nsis'
$setup = Get-ChildItem $nsisDir -Filter '*-setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sig = Get-ChildItem $nsisDir -Filter '*-setup.exe.sig' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "Installer not found in $nsisDir" }
if (-not $sig) { throw "Signature (.sig) not found - signing did not run" }

# GitHub mangles spaces in asset names, so upload under a space-free name.
$tag = "v$Version"
$assetName = "Rogue-Racer_${Version}_x64-setup.exe"
$stage = Join-Path $env:TEMP 'rr-release'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null
$assetPath = Join-Path $stage $assetName
Copy-Item $setup.FullName $assetPath -Force

# Build the update manifest the app checks on launch.
$manifest = [ordered]@{
    version   = $Version
    notes     = $Notes
    pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = [ordered]@{
        'windows-x86_64' = [ordered]@{
            signature = (Get-Content $sig.FullName -Raw).Trim()
            url       = "https://github.com/$repo/releases/download/$tag/$assetName"
        }
    }
}
$latestPath = Join-Path $stage 'latest.json'
[System.IO.File]::WriteAllText($latestPath, ($manifest | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding $false))

Write-Host "==> Publishing $tag to $repo" -ForegroundColor Cyan
gh release view $tag --repo $repo *> $null
if ($LASTEXITCODE -eq 0) {
    gh release upload $tag $assetPath $latestPath --repo $repo --clobber
}
else {
    gh release create $tag $assetPath $latestPath --repo $repo --title "Rogue Racer $Version" --notes $Notes
}
if ($LASTEXITCODE -ne 0) { throw "gh release failed" }

Write-Host ""
Write-Host "Published $tag. Players auto-update on their next launch." -ForegroundColor Green
