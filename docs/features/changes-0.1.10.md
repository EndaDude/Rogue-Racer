# Changes — v0.1.10

Summary of everything shipped in this batch, plus the functions that changed. Edit
`src/`, never `rogue-racer.html` (generated). Version bumped to `0.1.10`.

## Feature changes

### Handling / physics
- **Drift rework** — drifting no longer gives a forward speed boost. Instead velocity is
  carried through the slide via a `driftCarryEfficiency` (`0.92`), so a clean drift
  keeps momentum rather than accelerating you.
- **Top-speed compression** — ship top speeds are pulled closer together via
  `topSpeedMult = 0.9 + top * 0.02` in `mkShip`, so the spread between the slowest and
  fastest ships is smaller (Puncher pinned at `0.9`).
- **Projectile bounce limits + track-speed scaling** — each projectile has a bounce cap
  (`shell 7`, `missile 5`, `ball 10`, `machine-gun bullet 3`) and the effective bounce
  count scales with the track speed class.

### Roster / bots
- **Bots only use unlocked ships** — `spawnBots` draws from the selectable pool
  (`carTypeSelectable`), never prototypes, with a safe fallback to the first selectable
  ship.
- **Prototypes start locked** — `allowPrototypes` defaults to `false`; helpers
  `isPrototypeShip` / `carTypeSelectable` / `firstSelectableCarType` gate selection, and
  the lobby syncs the flag.

### Ship customization
- **`color` command** opens the color picker window directly.
- **Custom exhaust smoke color** — recolors the always-on exhaust puffs. The nitro/boost
  flame keeps its own default colors and is independent of this.
- **Custom trail (always on)** — an always-visible, tapering, fading **ribbon** streams
  from the tail whenever the ship moves. It is independent of nitro; the boost flame is
  unchanged. Retracts and vanishes when idle.
- **Decal placer** — replaces the old single hull-fill upload with a full visual editor:
  add multiple images, tap to select, drag to position, and adjust **size** and **spin**
  per decal (with delete / clear). Decals render clipped to the ship's hull silhouette,
  matching the in-game look. Stored as an array `selectedDecals: [{src,x,y,scale,rot}]`.
- **Name-side tag toggle** — show/hide the paint tag beside your name.
- All extras (smoke color, trail color, decals array, tag toggle) persist to
  `localStorage` and sync across the room (host relay).

## Changed / added functions by file

- **`010-constants-config.js`** — `GAME_VERSION = '0.1.10'`; `mkShip` top-speed
  compression; bounce constants; `driftCarryEfficiency`; `isPrototypeShip`,
  `carTypeSelectable`, `firstSelectableCarType` helpers.
- **`030-game-state.js`** — `selectedDecals` (array, replaces `selectedDecal`),
  `selectedSmokeColor`, `selectedTrailColor`, `selectedShowTag`, `allowPrototypes`.
- **`040-networking-peerjs.js`** — `player_profile` handler now applies the `decals`
  array (with back-compat for a legacy `decal` string); `lobby_sync` applies
  `allowPrototypes`.
- **`050-lobby-ui.js`** — `getLobbyProfileInput` emits `decals`; `applyProfileExtras`
  copies the `decals` array onto a player.
- **`060-game-engine.js`** — drift physics (velocity carry, no forward boost).
- **`080-unique-usernames.js`** — `persistCustomization` / `loadCustomization` store and
  restore the `decals` array (migrating an old single `decal`).
- **`130-juice-engine.js`** — `updateFxEmitters`: exhaust smoke uses the custom smoke
  color while the boost flame stays default; records the tail path for the custom trail
  ribbon (independent of nitro).
- **`170-ai-bot-racers.js`** — `spawnBots` uses the selectable-ship pool.
- **`190-render.js`** — `getPlayerDecals` (new, normalizes + back-compat),
  `getPlayerDecalClip` (rewritten to composite a placed-decals array clipped to the
  hull), `drawPlayerTrails` (new, renders the fading trail ribbon), added to the render
  pipeline under the players.
- **`230-crt-terminal-os.js`** — `openShipCustomize` rebuilt with the visual decal
  placer (canvas preview, drag, size/spin sliders, add/delete/clear); `color` command
  opens the picker.
