# Rebuild Plan: Split the monolith into a bundled `src/`  (PLANNED — not yet built)

Status: **Decided, not yet implemented.** Do this in a dedicated session. Until then, the
game is still the one file `rogue-racer.html` and all the normal single-file rules apply.

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

### Phase 0 — Scaffold + prove equivalence
- [ ] Create `src/index.html` (shell) + `build.ts`.
- [ ] Extract ONE low-coupling section (e.g. `50-social.js` or `60-audio.js`) into `src/`,
      leave the rest inline temporarily, and make the build produce a `rogue-racer.html` that
      is **byte-identical** (or diff-only-in-that-section) to the current file. Verify by playing.

### Phase 1 — Extract the rest, section by section
- [ ] Move each `// ====` banner section into its numbered file. After each extraction, rebuild
      and play-test before moving on. Small commits / small PRs — one or two sections each.
- [ ] After the last section, the inline `<script>` in `index.html` is empty except the marker.

### Phase 2 — Guard the artifact
- [ ] Pre-commit hook (or CI job): run `bun build.ts`, fail if `git diff --exit-code
      rogue-racer.html` is dirty (i.e. committed output is stale vs `src/`).
- [ ] Update `desktop/sync-dist.ps1` if needed (it copies `rogue-racer.html` → `game.html`; the
      built file works unchanged, but confirm the build runs before packaging).

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
