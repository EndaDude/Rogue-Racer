# Syncs the Tauri frontend dist folder.
# bootstrap.html    -> desktop/dist/index.html  (self-updating loader = the entry point)
# rogue-racer.html  -> desktop/dist/game.html   (offline fallback copy of the game)
# Audio/            -> desktop/dist/Audio/
#
# The bootstrapper pulls the latest rogue-racer.html from the repo at runtime,
# so game changes ship via desktop\publish-game.ps1 (a plain push to main, no CI
# build). Only rerun a full CI build when the native/Rust side changes.
# Run this whenever the bundle changes, before `cargo tauri build`.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here            # project root (Racing Game)
$dist = Join-Path $here 'dist'

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $dist | Out-Null

Copy-Item (Join-Path $here 'bootstrap.html')     (Join-Path $dist 'index.html') -Force
Copy-Item (Join-Path $root 'rogue-racer.html')   (Join-Path $dist 'game.html')  -Force
# Audio is shipped as a Tauri *resource* (installed alongside the app, then mirrored
# to %LOCALAPPDATA%\Rogue Racer\Audio at runtime), NOT embedded in the frontend
# bundle. Refresh the copy the bundler reads from src-tauri.
$srcAudio = Join-Path $here 'src-tauri\Audio'
if (Test-Path $srcAudio) { Remove-Item $srcAudio -Recurse -Force }
Copy-Item (Join-Path $root 'Audio') $srcAudio -Recurse -Force

$size = (Get-ChildItem $dist -Recurse | Measure-Object Length -Sum).Sum / 1MB
"dist ready: {0:N1} MB" -f $size
