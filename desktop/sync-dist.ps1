# Syncs the UNMODIFIED game into the Tauri frontend dist folder.
# rogue-racer.html -> desktop/dist/index.html
# Audio/           -> desktop/dist/Audio/
# Run this whenever the game changes, before `cargo tauri build`.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here            # project root (Racing Game)
$dist = Join-Path $here 'dist'

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $dist | Out-Null

Copy-Item (Join-Path $root 'rogue-racer.html') (Join-Path $dist 'index.html') -Force
Copy-Item (Join-Path $root 'Audio') (Join-Path $dist 'Audio') -Recurse -Force

$size = (Get-ChildItem $dist -Recurse | Measure-Object Length -Sum).Sum / 1MB
"dist ready: {0:N1} MB" -f $size
