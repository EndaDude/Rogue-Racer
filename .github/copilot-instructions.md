# Copilot instructions — Rogue Racer

Repository guidance for GitHub Copilot (chat + coding agent). Follow these exactly; they
override default behavior. (Claude Code contributors use the equivalent `CLAUDE.md` at the repo
root — keep the two in sync when project facts change.)

## What this is

Rogue Racer is a 2D top-down multiplayer racing game that **ships as one self-contained file, `rogue-racer.html`** (~17.5k lines — HTML + CSS + one big `<script>`). It renders to a 2D canvas (no THREE.js / no 3D engine). Its only runtime dependency is PeerJS, loaded from unpkg via a `<script>` tag.

**`rogue-racer.html` is GENERATED — do not hand-edit it.** The source lives in [src/](../src/): a shell `index.html` plus `NNN-*.js` files (one per subsystem, plain scripts sharing one global scope — no ES modules), concatenated back into the single `rogue-racer.html` by `bun build.ts`. Edit `src/`, run `bun run build`, commit both. See [src/README.md](../src/README.md). The generated file carries a "DO NOT EDIT" banner at the top.

`desktop/` is a thin Tauri (Rust) wrapper that packages the game as a native desktop app. The game itself is engine-agnostic and runs by opening the HTML file directly in a browser.

## Running & editing the game

- **Develop with hot reload (recommended):** `bun run dev` starts a local server on http://localhost:8080 that rebuilds on every `src/` change and live-reloads the browser. The reload snippet is injected only at serve time — it never touches the shipped file. (`PORT=3000 bun run dev` for a custom port.)
- **Or build manually:** edit files under [src/](../src/), run `bun run build` to regenerate `rogue-racer.html`, then open it and refresh. The build is plain concatenation via `bun build.ts` — no npm, no module system.
- **Enable the build guard once per clone:** `bun run hooks` (installs `.githooks/pre-commit`, which blocks committing a stale/hand-edited `rogue-racer.html`). `bun run check` is the same check for CI.
- **Requires [Bun](https://bun.sh)** to build/serve (`bun` on PATH). There is **no test suite or linter** — verify changes by playing the game.
- Keep the shipped artifact a single self-contained `rogue-racer.html` — that's what the loader `document.write`s. The split is source-time only; it does not change how the game ships. Full context: [docs/features/rebuild-plan.md](../docs/features/rebuild-plan.md).

## Ship / release model (important — two independent paths)

The game and the native app ship on **separate tracks**:

1. **Game updates (the common case):** `desktop/bootstrap.html` is a self-updating loader. At launch it pulls the latest `rogue-racer.html` from `raw.githubusercontent.com/EndaDude/Rogue-Racer/main` and `document.write`s it into the same window. So **shipping a game change = getting `rogue-racer.html` merged to `main`** — no CI build, no installer, no version bump of the app. Loader falls back to a cached copy, then to the bundled `game.html`, so it works offline.
2. **Native app updates (rare):** only needed when the Rust/Tauri side changes. That's the only thing the CI workflow (`.github/workflows/release.yml`) builds — a Tauri matrix build on `ubuntu-22.04` + `windows-latest`.

`desktop/sync-dist.ps1` assembles the Tauri `dist/`: `bootstrap.html`→`index.html` (entry point), `rogue-racer.html`→`game.html` (offline fallback), plus `Audio/`. Run it before `cargo tauri build`.

### Version numbers
`GAME_VERSION` is a `const` at the top of [src/010-constants-config.js](../src/010-constants-config.js), shown on the CRT terminal. Bump it on every game change you ship (then rebuild) — it's how players confirm the self-updating loader pulled the new copy. Keep it in sync with `version` in `desktop/src-tauri/tauri.conf.json` when doing a real *app* release, but note the game version ships independently of the app version. Current: `0.1.6`.

## Collaboration & branching strategy (READ THIS — `main` has been clobbered before)

This repo has **no branch protection** and contributors have historically pushed straight to `main`. When the whole game was one ~17.5k-line file, two people editing in parallel and pushing didn't merge cleanly — **whoever pushed last silently overwrote the other's work.** A batch of features was already lost this way (see the "lost in a merge" note in [docs/features/troy-feature.md](../docs/features/troy-feature.md)). The `src/` split (below) removes most of that conflict surface, but the discipline still matters: the generated `rogue-racer.html` is one file, and `main` is shared, breakable state.

**Branching model (lightweight, GitHub-flow):**
- `main` = what ships to players (the loader pulls `rogue-racer.html` from it). Keep it working.
- Do all work on a **feature branch**: `git switch -c feature-<thing>`.
- **Pull-rebase before starting and again right before merging:** `git pull --rebase origin main`.
- Open a **PR** into `main` and **squash-merge** it. PRs make changes reviewable and stop blind overwrites. Delete the branch after merge. When Copilot's coding agent does the work, it already operates on a branch and opens a PR — good; do not push straight to `main`.
- **Never force-push `main`.** Never commit directly to `main` for anything non-trivial.
- **Recommended:** the repo owner enables GitHub **branch protection** on `main` (require a PR, block direct pushes/force-push). This is what actually *prevents* the clobbering rather than relying on discipline.

**Access / push URL:** the repo lives at `EndaDude/Rogue-Racer` and the self-updating loader pulls from `raw.githubusercontent.com/EndaDude/Rogue-Racer/main`. Only changes merged to that repo's `main` reach players. A `403 Permission denied` on push means no write access — the owner must add you as a collaborator, or you fork and PR. (A fork's `main` will NOT self-update players; only the canonical repo does.)

**If work goes missing:** check `git reflog`, other remote branches (`git branch -a`), and any `docs/*.html` backup copies before rebuilding by hand.

## Source layout: `src/` → bundled `rogue-racer.html`

The single-file layout was the *root cause* of the `main` clobbering — one file means parallel edits always conflict. That's now fixed: the game code is split into per-subsystem files under [src/](../src/) and **concatenated back into the single `rogue-racer.html`** by `bun build.ts` (plain concatenation, one shared global scope — deliberately **not** ES modules, so no `import`/`export` refactor).

- **Edit `src/`, never `rogue-racer.html`** (it's generated). Sections are `src/NNN-*.js`, numbered in load order (config/state first, render/terminal last); the DOM/CSS/`<head>` live in `src/index.html`.
- `bun run dev` (hot reload) or `bun run build` (one-shot) regenerate the artifact; `bun run hooks` installs the stale-artifact guard.
- Two people editing different `src/` files no longer conflict — this is the whole point.
- **Always rebuild and commit `rogue-racer.html` alongside your `src/` changes**, or the pre-commit guard / `bun run check` will flag it as stale.

Full context, file map, and phases: **[docs/features/rebuild-plan.md](../docs/features/rebuild-plan.md)** and **[src/README.md](../src/README.md)**.

## Architecture

The game code is split across `src/NNN-*.js` (each a former `// ====` banner section), concatenated in load order into the one shipped `rogue-racer.html`. They share one global scope, so any file can call functions/read state defined in another. Key subsystems, in load order (file → what it does):

- **`010-constants-config.js`** — `GAME_VERSION`, car types, track/tunable constants. Every other file reads this, so it loads first.
- **`020-procedural-track-generation.js`** — `generateTrack(seed)` builds tracks from a seed via a `mulberry32` PRNG + Catmull-Rom splines. Bridge detection, walls, forks/branching. Seed-driven so the same seed = the same track across peers.
- **`030-game-state.js`** — one global object `G` holds all mutable state (`G.isHost`, `G.pad`, players, race phase, etc.).
- **`040-networking-peerjs.js`** — PeerJS-based, **no dedicated server**. One player is the **host** (`G.isHost`); guests connect to the host. `hostConn` = a guest's link to the host; `guestConns` = the host's links to all guests. `broadcast()` / `sendToAll()` relay through the host (star topology — host re-forwards guest messages to other guests). Messages are `{type, ...}` dispatched by `type`. Host setup (`initHostPeer` → `_makePeerOnce`) is resilient: destroys any stale peer first, retries fresh room codes, then falls back to an anonymous broker-assigned id so any machine that can *join* can also *host*. **Note:** despite older changelog claims, `new Peer(...)` is currently constructed with **no explicit STUN/ICE config** (relies on PeerJS defaults) — if cross-network peers can't connect, wiring in a `config.iceServers` STUN list is the first thing to try.
- **`050-lobby-ui.js`** — lobby/room DOM flow, room codes, join/host UI.
- **`070-friends.js`, `080-unique-usernames.js`** — a persistent social layer on a **separate** PeerJS "presence" peer, distinct from the game peer. Your `FRIEND_ID` is random and cached in `localStorage`; the social peer claims the **deterministic** id `rogueracer-fr-<FRIEND_ID>` so friends can reach you by it. Because it's deterministic, a reload/unclean-close leaves the broker still holding the old claim → `unavailable-id`. `initSocialPeer` handles this by falling back to an **anonymous** social peer (so outbound requests/invites work immediately — `socialReady`) while a 15s background timer (`scheduleCanonicalIdReclaim`) reclaims the canonical id once the stale claim expires. Real friend requests (`friend_request_v2`) go to a pending list; legacy `friend_request` is auto-accepted for back-compat. Auto-join subscriptions ride on presence broadcasts.
- **`060-game-engine.js`, `190-render.js`** — canvas 2D loop, physics, camera/visual layering (for bridges/elevation). Render is the most-coupled file (reads nearly everything) and loads late.
- **`090-track-storage.js`** — persists maps to a real OS folder when possible (File System Access API in browser; **Tauri real-file storage** on desktop), falling back to `localStorage`. The `file://` double-click case can't silently touch OS folders.
- **`100-gamepad-controller-support.js`, `110-hold-r-self-destruct-reset.js`** — rebindable keyboard + controller bindings (`GP` button map), hold-Y/hold-R self-destruct reset.
- **`120-procedural-sound-effects.js`, `130-juice-engine.js`, `140-best-lap-ghost.js`, `150-jank-retro-tts.js`, `160-missile-lock-on-warning.js`, `180-icon-system.js`** — Web Audio engine sounds, equal-power crossfade music looper, particle pool, skid marks, on-canvas toasts, procedural jingles, best-lap ghost, chat TTS, missile-lock RWR, inline SVG icons.
- **`170-ai-bot-racers.js`** — kinematic racing-line followers for solo play (`BOT_ROSTER`).
- **`200-upgrade-screen.js`, `210-results.js`** — synchronized upgrade pause between races; post-race queue/podium flow.
- **`220-map-editor.js`** — map editor (`ME`) + Local/History track browser.
- **`230-crt-terminal-os.js`** — the whole menu system styled as a retro CRT command line (`initCrtTerminal`); commands registered in a table (e.g. `version`). Loads last since it calls into everything.

### Networking mental model
Peer-to-peer, host-authoritative-ish relay. When editing multiplayer code, mind which side runs the branch: guards like `if (G.isHost)` gate host-only logic (re-broadcasting, accepting `player_profile` / `player_ready` / `map_vote` / `map_submit`), while guests act on host-sent state. Track state stays consistent across peers because it's regenerated from a shared seed, not streamed.

## Desktop (Tauri) wrapper

- Rust entry: `desktop/src-tauri/src/{main,lib.rs}`; config in `tauri.conf.json`; capabilities/permissions in `desktop/src-tauri/capabilities/`. Uses the Tauri **http** and **fs** plugins (the loader needs them to fetch the remote game and read/write the cache in AppData).
- WebRTC is enabled on Linux for cross-platform multiplayer.
- Release helper scripts are PowerShell (`desktop/release.ps1`, `sync-dist.ps1`) — this project is developed partly on Windows.
