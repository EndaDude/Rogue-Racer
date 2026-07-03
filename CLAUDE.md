# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Rogue Racer is a 2D top-down multiplayer racing game. **The entire game is one file: [rogue-racer.html](rogue-racer.html)** (~17.5k lines — HTML + CSS + one big inline `<script>`). It renders to a 2D canvas (no THREE.js / no 3D engine) and has no build step. Its only runtime dependency is PeerJS, loaded from unpkg via a `<script>` tag.

`desktop/` is a thin Tauri (Rust) wrapper that packages the game as a native desktop app. The game itself is engine-agnostic and runs by opening the HTML file directly in a browser.

## Running & editing the game

- **Develop the game:** open [rogue-racer.html](rogue-racer.html) in a browser (or serve the repo root). Edit the file, refresh. No compile, no bundler, no npm.
- There is **no test suite, linter, or package.json** at the repo root. Verify changes by playing.
- The single-file layout is how the game ships **today** — keep it self-contained in `rogue-racer.html` for now. A move to a bundled `src/` (still emitting one file) is planned but not yet built; see [docs/features/rebuild-plan.md](docs/features/rebuild-plan.md). Until that lands, don't split the file or add a build pipeline unless you're doing that planned work.

## Ship / release model (important — two independent paths)

The game and the native app ship on **separate tracks**:

1. **Game updates (the common case):** `desktop/bootstrap.html` is a self-updating loader. At launch it pulls the latest `rogue-racer.html` from `raw.githubusercontent.com/EndaDude/Rogue-Racer/main` and `document.write`s it into the same window. So **shipping a game change = pushing `rogue-racer.html` to `main`** — no CI build, no installer, no version bump of the app. Loader falls back to a cached copy, then to the bundled `game.html`, so it works offline.
2. **Native app updates (rare):** only needed when the Rust/Tauri side changes. That's the only thing the CI workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) builds — a Tauri matrix build on `ubuntu-22.04` + `windows-latest`.

`desktop/sync-dist.ps1` assembles the Tauri `dist/`: `bootstrap.html`→`index.html` (entry point), `rogue-racer.html`→`game.html` (offline fallback), plus `Audio/`. Run it before `cargo tauri build`.

### Version numbers
`GAME_VERSION` is a `const` near the top of the `<script>` in `rogue-racer.html` (~line 1829), shown on the CRT terminal. Bump it on every game change you ship — it's how players confirm the self-updating loader pulled the new copy. Keep it in sync with `version` in `desktop/src-tauri/tauri.conf.json` when doing a real *app* release, but note the game version ships independently of the app version. Current: `0.1.6`.

## Collaboration & branching strategy (READ THIS — `main` has been clobbered before)

This repo has **no branch protection** and contributors have historically pushed straight to `main`. Because the whole game is one ~17.5k-line file, two people editing in parallel and pushing don't merge cleanly — **whoever pushes last silently overwrites the other's work.** A batch of features has already been lost this way (see the "lost in a merge" note in [docs/features/troy-feature.md](docs/features/troy-feature.md)). Treat `main` as shared, breakable state.

**Branching model (lightweight, GitHub-flow):**
- `main` = what ships to players (the loader pulls `rogue-racer.html` from it). Keep it working.
- Do all work on a **feature branch**: `git switch -c feature-<thing>`.
- **Pull-rebase before starting and again right before merging:** `git pull --rebase origin main`.
- Open a **PR** into `main` and **squash-merge** it. PRs make changes reviewable and stop blind overwrites. Delete the branch after merge.
- **Never force-push `main`.** Never commit directly to `main` for anything non-trivial.
- **Recommended:** the repo owner enables GitHub **branch protection** on `main` (require a PR, block direct pushes/force-push). This is what actually *prevents* the clobbering rather than relying on discipline.

**Access / push URL:** the repo lives at `EndaDude/Rogue-Racer` and the self-updating loader pulls from `raw.githubusercontent.com/EndaDude/Rogue-Racer/main`. Only pushes to that repo's `main` reach players. A `403 Permission denied` on push means no write access — the owner must add you as a collaborator, or you fork and PR. (A fork's `main` will NOT self-update players; only the canonical repo does.)

**If work goes missing:** check `git reflog`, other remote branches (`git branch -a`), and any `docs/*.html` backup copies before rebuilding by hand.

## Planned: split the monolith into a bundled `src/`

The single-file layout is the *root cause* of the `main` clobbering — one file means parallel edits always conflict. The plan is to split the inline `<script>` into per-subsystem `.js` files and **concatenate them back into a single `rogue-racer.html`** with a tiny `bun build.ts` (Bun runtime, no ES-module refactor), so the ship model is unchanged. **Not yet implemented — until then the game is still the one file and all single-file rules above apply.**

Full plan, file layout, and phases: **[docs/features/rebuild-plan.md](docs/features/rebuild-plan.md)**.

## Architecture of rogue-racer.html

Everything lives in one inline script, organized into `// ====` banner sections. Key ones, roughly in file order:

- **CONSTANTS & CONFIG** — `GAME_VERSION`, car types, track/tunable constants.
- **PROCEDURAL TRACK GENERATION** — `generateTrack(seed)` builds tracks from a seed via a `mulberry32` PRNG + Catmull-Rom splines. Includes bridge detection, walls, forks/branching. Seed-driven so the same seed = the same track across peers.
- **GAME STATE** — one global object `G` holds all mutable state (`G.isHost`, `G.pad`, players, race phase, etc.).
- **NETWORKING** — PeerJS-based, **no dedicated server**. One player is the **host** (`G.isHost`); guests connect to the host. `hostConn` = a guest's link to the host; `guestConns` = the host's links to all guests. `broadcast()` / `sendToAll()` relay through the host (star topology — host re-forwards guest messages to other guests). Messages are `{type, ...}` dispatched by `type`. Host setup (`initHostPeer` → `_makePeerOnce`) is resilient: it destroys any stale peer first, retries fresh room codes, then falls back to an anonymous broker-assigned id so any machine that can *join* can also *host*. **Note:** despite older changelog claims, `new Peer(...)` is currently constructed with **no explicit STUN/ICE config** (relies on PeerJS defaults) — if cross-network peers can't connect, wiring in a `config.iceServers` STUN list is the first thing to try.
- **LOBBY UI**, **FRIENDS** — a persistent social layer on a **separate** PeerJS "presence" peer, distinct from the game peer. Your `FRIEND_ID` is random and cached in `localStorage`; the social peer claims the **deterministic** id `rogueracer-fr-<FRIEND_ID>` so friends can reach you by it. Because it's deterministic, a reload/unclean-close leaves the broker still holding the old claim → `unavailable-id`. `initSocialPeer` handles this by falling back to an **anonymous** social peer (so outbound requests/invites work immediately — `socialReady`) while a 15s background timer (`scheduleCanonicalIdReclaim`) reclaims the canonical id once the stale claim expires. Real friend requests (`friend_request_v2`) go to a pending list; legacy `friend_request` is auto-accepted for back-compat. Auto-join subscriptions ride on presence broadcasts.
- **GAME ENGINE / RENDER** — canvas 2D loop, physics, camera/visual layering (for bridges/elevation).
- **TRACK STORAGE** — persists maps to a real OS folder when possible (File System Access API in browser; **Tauri real-file storage** on desktop), falling back to `localStorage`. Note the `file://` double-click case can't silently touch OS folders.
- **GAMEPAD / CONTROLLER SUPPORT** — rebindable keyboard + controller bindings (`GP` button map), hold-Y/hold-R self-destruct reset.
- **PROCEDURAL SOUND / JUICE ENGINE** — Web Audio engine sounds, equal-power crossfade music looper, particle pool, skid marks, on-canvas toasts, procedural jingles.
- **AI BOT RACERS** — kinematic racing-line followers for solo play (`BOT_ROSTER`).
- **UPGRADE SCREEN / RESULTS** — synchronized upgrade pause between races; post-race queue flow.
- **MAP EDITOR** (`ME`) + Local/History track browser.
- **CRT TERMINAL OS** — the whole menu system is styled as a retro CRT command line (`initCrtTerminal`); commands are registered in a table (e.g. `version`).

### Networking mental model
Peer-to-peer, host-authoritative-ish relay. When editing multiplayer code, mind which side runs the branch: guards like `if (G.isHost)` gate host-only logic (re-broadcasting, accepting `player_profile` / `player_ready` / `map_vote` / `map_submit`), while guests act on host-sent state. Track state stays consistent across peers because it's regenerated from a shared seed, not streamed.

## Desktop (Tauri) wrapper

- Rust entry: `desktop/src-tauri/src/{main,lib.rs}`; config in `tauri.conf.json`; capabilities/permissions in `desktop/src-tauri/capabilities/`. Uses the Tauri **http** and **fs** plugins (the loader needs them to fetch the remote game and read/write the cache in AppData).
- WebRTC is enabled on Linux for cross-platform multiplayer.
- Release helper scripts are PowerShell (`desktop/release.ps1`, `sync-dist.ps1`) — this project is developed partly on Windows.
