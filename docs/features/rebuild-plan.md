# Rebuild Plan: Split the monolith into a bundled `src/`  (✅ BUILT)

Status: **Done (Phase 0–2).** The game now lives in `src/` (shell `index.html` +
`NNN-*.js` per subsystem, plain scripts sharing one global scope — no ES modules) and is
bundled back into a single root `rogue-racer.html` by `bun build.ts`. The bundled file is
**byte-for-byte identical** to the pre-split original, so behavior is unchanged. A
`.githooks/pre-commit` guard (enable with `bun run hooks`) blocks committing a stale
artifact. Editing workflow and layout: see [../../src/README.md](../../src/README.md).

## Why

The entire game is one ~17.5k-line file (`rogue-racer.html`). That single-file layout is the
**root cause** of the repeated `main` clobbering: one file means two people editing in
parallel *always* conflict, and because there's no branch protection, whoever pushes last
silently overwrites the other's work. A batch of features has already been lost this way
(see the "lost in a merge" note in [troy-feature.md](troy-feature.md)). Branching discipline
treats the symptom; splitting the file treats the cause.

Constraint that shapes everything: the game must still **ship as a single `rogue-racer.html`**,
because the self-updating loader (`desktop/bootstrap.html`) `document.write`s one fetched file
and the game runs by opening that file directly with **no build step for players**. Any split
has to bundle back to one file.

## Chosen approach — concatenation bundle via Bun (NOT ES modules)

The sections already share one global scope (the `G` state object + free-function calls across
sections). Converting to real ES modules (`import`/`export`) would touch thousands of
cross-references — too much risk/complexity for this team. **Do NOT reach for `bun build`'s
module bundler yet.**

Instead:
- Split the one inline `<script>` into plain `.js` files that are **concatenated in order**
  (same shared global scope as today — no imports/exports). Number-prefix filenames to fix
  order.
- `src/index.html` holds the shell: `<head>`, the `<style>` block, the PeerJS `<script src>`,
  and a `<!-- BUNDLE -->` marker where the concatenated JS gets injected.
- **`build.ts`, run with `bun build.ts`** (Bun is the chosen runtime — one tool, no npm
  install): read `src/*.js` in sorted order, concatenate, inject into `index.html` at the
  marker, write `rogue-racer.html`. ~30 lines, zero dependencies.
- **`rogue-racer.html` becomes a generated artifact.** Workflow: edit `src/`, run
  `bun build.ts`, commit the output. Add a pre-commit hook (or CI check) that rebuilds and
  fails if the committed `rogue-racer.html` is stale, so nobody ships a hand-edited file.

Why this shape:
- **Approachable** — editing `50-social.js` is just editing JS; no module system to learn.
- **Kills the clobbering** — two people in `editor.js` vs `render.js` never conflict.
- **Ship model untouched** — output is still one file the loader `document.write`s.
- **Reversible & debuggable** — concatenation preserves line order; same code, just split.
- **Stepping stone** — individual sections can graduate to real `bun build` ES modules later,
  section by section, without a big-bang rewrite.

The one real cost: `rogue-racer.html` is now generated, so the stale-artifact guard matters.

## Proposed file layout

```
src/
  index.html        # shell: head, <style>, PeerJS <script src>, <!-- BUNDLE --> marker
  00-config.js      # CONSTANTS & CONFIG   (~525)  — EVERYONE reads this; include first
  10-track-gen.js   # PROCEDURAL TRACK GENERATION (~485)
  20-state.js       # GAME STATE — the global `G`  (~214)  — shared; include early
  30-networking.js  # NETWORKING (PeerJS)  (~602)
  40-lobby.js       # LOBBY UI  (~993)
  50-social.js      # FRIENDS / presence peer  (~265)
  55-usernames.js   # UNIQUE USERNAMES  (~200)
  60-audio.js       # PROCEDURAL SOUND EFFECTS  (~2458)
  70-render.js      # RENDER  (~2807)  — reads everything; extract carefully
  80-bots.js        # AI BOT RACERS  (~524)
  85-juice.js       # JUICE ENGINE  (~280) + BEST-LAP GHOST + TTS + MISSILE LOCK + ICONS
  90-editor.js      # MAP EDITOR  (~2025)
  95-terminal.js    # CRT TERMINAL OS  (~1677)
  98-storage.js     # TRACK STORAGE  (~1313)
build.ts            # bun build.ts → rogue-racer.html
rogue-racer.html    # GENERATED — do not hand-edit
```

Numbers are include order, not importance. Config and state must load before the code that
reads them; render/terminal reference nearly everything, so they go late.

## Coupling to handle carefully

- **CONSTANTS & CONFIG** and the global **`G`** state object are read by every section — they
  must be concatenated *before* everything else, and no section may assume a symbol from a
  later file exists at load time (only at call time, which is fine since it's one shared scope).
- **RENDER** reads track geometry, `G`, items, players — it's the most-coupled consumer;
  extract it last and diff the built output byte-for-byte against the pre-split file.

## Phased plan

### Phase 0 — Scaffold + prove equivalence  ✅
- [x] Created `src/index.html` (shell) + `build.ts`.
- [x] Extracted the inline `<script>` into `src/NNN-*.js` and proved the build produces a
      `rogue-racer.html` that is **byte-identical** to the pre-split file (`diff -q` clean).

### Phase 1 — Extract the rest, section by section  ✅
- [x] All 23 `// ====` banner sections split into numbered files (`010-constants-config.js` …
      `230-crt-terminal-os.js`). `index.html`'s inline `<script>` holds only the `@@BUNDLE@@` marker.
- [x] Built output passes `node --check`.

### Phase 2 — Guard the artifact  ✅
- [x] `.githooks/pre-commit`: runs `bun build.ts` and blocks the commit if the committed
      `rogue-racer.html` is stale vs `src/`. Enable per-clone with `bun run hooks`.
      `bun run check` does the same for CI.
- [ ] Update `desktop/sync-dist.ps1` if needed (it copies `rogue-racer.html` → `game.html`; the
      built file works unchanged — confirm the build runs before packaging on the next app release).

### Phase 3 — (Optional, later) graduate to real modules
- [ ] Once the team is comfortable, convert individual files to ES modules with `bun build`,
      adding `export`/`import` incrementally. Not required — the concat bundle is a fine
      end state.

## Definition of done (Phase 0–2)

- Editing happens in `src/`; `bun build.ts` produces `rogue-racer.html`.
- The built file is byte-equivalent in behavior to the pre-split game (verified by play-testing
  multiplayer, editor, audio, and a race end-to-end).
- The loader and Tauri `game.html` fallback still work with zero changes.
- A stale committed `rogue-racer.html` can't be pushed (hook/CI catches it).
- Two contributors editing different sections no longer conflict.
