# REVIEW PASS 2 (2026-07-02) — hosting fix, map maker update, social & audio  ✅ SHIPPED

## Hosting fix (the "only Win11 can host" bug)
- `initHostPeer` was one-shot: any broker hiccup/ID rejection failed silently and left a
  half-dead Peer that poisoned every later attempt. Now: stale peer destroyed first,
  9s timeout, up to 3 fresh room codes, then an **anonymous-peer fallback** where the
  broker-assigned id becomes a (long) room code — so any machine that can JOIN can HOST.
- Join accepts long fallback codes (input maxlength 48), and shows a clear error after
  12s instead of "Connecting..." forever. Verified live: room claimed first try.

## Map Maker update
- Toolbar rebuilt into **mode-contextual groups** — only the active mode's controls show
  (Nodes / Walls / Obstacles / Items / Erase). Compact labeled fields, slim styled
  sliders with glowing thumbs, small spinner-less number boxes, compact track-name box,
  dynamic one-line hint per mode.
- **Custom SVG icons** replace all editor emojis (toolbar, header, sidebar buttons).
- **Obstacles & item boxes auto-detect their layer** from the nearest track node on
  placement (works for V2 branch nodes too); the layer box displays the detected value.

## Bots
- Hard ship-stat compliance: bot top speed ≤ ship top speed (skill ≤ 1.0), nitro uses the
  player multiplier, rubber-banding can no longer push past the ship's ceiling, accel
  derives from the ship's accel stat.
- **Difficulty levels** (easy/medium/hard): skill bands, cornering caution, rubber-band
  strength. Button in the editor header + `bots <n>` / `botdiff <level>` commands.

## Audio
- **Jank retro TTS** for chat: per-player 8-bit robot babble (name hashes to base pitch
  92–420Hz, square/saw/triangle wave, tempo), queued with a gap, repeated messages
  within 30s print silently. `tts on/off` to toggle.
- **Missile lock warning**: audio-only RWR — a two-tone growl at lock, then crunchy
  bit-crushed pips that speed up as the missile closes. No HUD element.

## Social
- **Real friend requests**: `add friend <user/id>` sends a request; receiver gets
  `accept <name>` / `decline <name>` (+ `requests` to list). No more silent mutual adds.
  Legacy v1 requests still accepted for back-compat.
- **Unique usernames** via the PeerJS broker as a name registry (`claimname <name>`,
  and `name <text>` auto-claims): if taken → "username already taken". Friends can be
  requested by username instead of the AB12-CD34 code. Claims hold while online.
- **`commandchange <cmd> [alias]`** — rebind any terminal command (asks interactively
  if no alias given; `commandchange <cmd> reset` to undo). Persisted.

## In-game icons
- Item badge + upgrade cards use bold filled SVG icons (rocket, shield, mine, EMP, etc.)
  — high-visibility, not wireframes. World missiles were already vector-drawn.

NOTE: the 07-01 "round 2" block below (ghost replay, pads, event feed, stats, themes)
was lost in a merge — the current file does NOT contain it. Restorable on request.

---

# OVERHAUL PASS (2026-07-01) — juice, bots, new content  ✅ SHIPPED

All existing features kept identical in behavior; this pass deepens them and adds new systems.
Original file backed up as `rogue-racer (4).backup.html`.

## New systems
- **AI bot racers** (solo Test Track): kinematic racing-line followers with curvature-based
  corner speed, rubber-banding, lateral wander, random items (nitro/missiles/mines), full
  health/death/respawn, lap+checkpoint tracking, podium entries, per-bot engine audio.
  Bot count button (`🤖 Bots: N`) in the Map Editor header, persisted in localStorage.
- **New items**: 🔧 Patch Kit (+35 HP, local), 🌀 EMP (stuns+stalls racers within 260,
  shield blocks it; synced via new `emp_blast` message).
- **New upgrades**: ♻️ Nanobots (1.6 HP/s regen), 🧲 Magnet (pickup radius 20→52),
  ⏱️ Overdrive (nitro 3s→4.5s).
- **Juice engine**: unified particle pool (engine exhaust, boost flames, wall-grind sparks,
  hull smoke when <38% HP, pickup/heal/EMP bursts), persistent skid marks while drifting,
  on-canvas toast/banner system, procedural jingles (lap, final lap, overtake).

## Feel & visuals (all additive)
- Parallax starfield + nebula backdrop, faint world grid for off-track motion sense.
- Dynamic speed zoom (eases out slightly at speed; zoom slider stays the baseline).
- High-speed radial streaks, boost heat vignette, pulsing critical-damage vignette.
- Animated countdown (digit pop + ring) and a fading "GO!" burst.
- Cars: neon under-glow, front-to-back sheen, layered boost flame, animated shield ring,
  orbiting stun sparks, respawn-invuln blink, hull bars over damaged racers.
- Race flow: LAP x/y + FINAL LAP! banners, overtake ▲/▼ toasts with blips, WRONG WAY
  warning, drift combo meter above the reset bar, speed readout heats up near class limit.
- Minimap: finish-line marker, live item-box dots, glow ring around your own dot.

---

# TODO: Endless Tracks, Match Flow & Live Leaderboard (ACTIVE — 2026-06-30)

Purpose: Replace GitHub track storage with local folders, add a lobby track browser with a
draggable queue, make the queue actually load tracks in order, and build a full in-game match
flow (podium, queue advance/loop, live leaderboard, synced upgrades, between-race screen).

## Key decisions (from clarification)
- Run mode: **file:// (double-click)** → the File System Access API is NOT available, and
  cross-file fetch is blocked. So real OS-folder read/write is impossible at runtime.
- Storage approach (most reliable for file://): **localStorage stores the `Local` and `History`
  "folders"** (IndexedDB is unreliable on file:// opaque origins), with **Export (download .json) /
  Import (file picker)** buttons to move tracks to/from the real `Saved tracks/Local` and
  `Saved tracks/History` OS folders. Drop GitHub save/load from the main flow (kept as collapsed legacy).
- Laps: **track default saved with the map, host can override in lobby.** Default 3, range 1–20.

## Phase 1 — Storage layer  (foundational)  ✅ DONE
- [x] localStorage TrackStore: `rr-tracks-local` + `rr-tracks-history`; `normalizeTrackRecord`,
      `getLocalTracks`/`getHistoryTracks`, `saveLocalTrack` (dedupe by name), `deleteLocalTrack`,
      `recordTrackHistory`, `exportTrackRecord`. Records carry `laps` (default 3) for Phase 4.
- [x] On every track LOAD (race start), push a copy into History; keep only the last 10 (FIFO auto-delete).
      Hooked at all 3 race-start map-load points (guest start_race, host startRace, single/play-again).
- [x] History entries show a **Save** button → copies that entry into Local (persist permanently).
- [x] Export/Import buttons (download .json / upload file) to sync with the real `Saved tracks` folders.
- [x] Relegated the GitHub save+fetch path to a collapsed `<details>` in the editor sidebar.

## Phase 2 — Lobby track browser + draggable queue  ✅ DONE
- [x] Right-side lobby panel (`#lobby-tracks`, host-only) listing all tracks under **two folders**: `Local` and `History`.
- [x] Drag a track from either folder into the **queue** (＋ button also adds); folder-aware (reads OS folder when connected).
- [x] Persist the queue; queue is the authoritative play order (existing saveMaps/sendLobbySync).
- [ ] Queue **loads tracks in order** (host-driven), not random.  → handled in Phase 3 (advance/loop).

## Phase 3 — In-game match flow (queue progression)  ✅ DONE
- [x] After a map completes, advance to the **next track in the queue** (not replay same track).
      `hostAdvanceQueue()` commits `G.queueIndex = peekNextQueueIndex()` then `hostLaunchRace`.
- [x] At the end of the queue, **loop** back to the first track. `peekNextQueueIndex` wraps `(i+1)%len`.
- [x] Host gets a **"Back to menu"** button on the post-race screen (`#results-menu-btn` → `hostReturnToMenu`).
- [x] **30s auto-advance timer** (`hostBeginPostRaceTimer`, broadcasts `post_race` each second);
      **skippable when everyone readies up** (`#results-ready-btn` → `post_race_ready` → `hostCheckPostReady`).
- [x] `startGame()` hides results-screen + clears post-race timer so guests transition cleanly.

## Phase 4 — Live leaderboard + lap customization  ✅ DONE
- [x] **Leaderboard panel on the left** (`#leaderboard` in `#race-status-panel`), with a
      **count-up race timer above it** (`#race-timer`, starts at GO, `Date.now()-G.raceStartTime`).
- [x] Per-player status string next to name: `C x/total mm:ss L x/total mm:ss`
      (checkpoint x/total + split time, lap x/total + split time), updates on each checkpoint/lap.
      Synced via `player_update` (added `nextCheckpoint`,`lastCheckpointTime`,`lastLapTime`).
- [x] **Customizable lap count**: `#host-laps-input` (1–20) in lobby host panel → `G.lobbyLaps`;
      `resolveRaceLaps(map)` (lobby wins, else track default) → `G.totalLaps`, sent in `start_race {laps}`.
      Replaced hardcoded `TOTAL_LAPS` in finish check + lap HUD with `G.totalLaps`.

## Phase 5 — Synchronized upgrade pause  ✅ DONE
- [x] When ANY player is choosing an upgrade, **pause the game for everyone** (host-authoritative;
      `requestUpgradePause`→`hostAddUpgradeChooser` sets a single 5s window, `game_pause`/`game_resume` synced).
- [x] Overlay: `"[Username] is choosing an upgrade! [Time remaining]s"` (`#upgrade-pause-overlay`,
      hidden for the chooser who sees the cards; lists multiple names if several choose at once).
- [x] **5s timer** to pick; on timeout the game resumes for everyone (the chooser keeps the card
      screen open and their car's momentum resumes). Picks before timeout resume early once all chose.

## Phase 6 — Between-race experience (the 30s window)  ✅ DONE
- [x] **Cinematic podium** showing all finish times first (`#results-podium`, top-3 pedestals with
      staggered rise animation; full list shows `m:ss.cc` times or `DNF`). Finish elapsed broadcast in
      `player_finished {time}` (relative to each client's `raceStartTime`), stored as `finishElapsedMs`.
- [x] Show **which map is next** (`#results-next`, from Phase 3).
- [x] Let each player **choose their ship** (`#results-ship-grid` → updates `carType`, syncs via
      `player_profile`/lobby_sync so the next race uses it; respects host allowed-ships).
- [x] Host can **configure match settings** here too (`#results-host-settings`: speed class, laps,
      owner/vote mode — mirror the lobby controls and `sendLobbySync`).
- [x] **Spectate option** for finished players while others race (`#spectate-bar` with ◀ ▶ / Free cam;
      `G.spectateId` retargets the render camera to a still-racing player).

## Watch-outs
- file:// blocks fetch + File System Access API → all "folders" are IndexedDB; real files only via Export/Import.
- Multiplayer is PeerJS host-authoritative: queue, lap count, pause state, podium, and timers must be
  host-driven and synced (sendLobbySync / sendToAll). Guests mirror host state.
- Keep paintTag/base64 payloads out of high-frequency syncs (perf).

---

# TODO: Layer-Up / Layer-Down System Rework

Purpose: Replace current bridge entrance/exit behavior with a robust layer transition system that supports smooth jumps, no random snapping, and consistent multi-layer gameplay.

Status: Completed and implemented.
Scope: Gameplay, rendering, map editor data, map conversion, and testing.

## Progress Update (2026-06-30)

Completed or mostly completed:
- Replaced bridge-gate transition logic with heading-based slope threshold crossing in runtime.
- Added anti-jitter hysteresis for slope thresholds.
- Added acceleration-style falling state and tuning constants.
- Removed void-triggered snap-respawn behavior from movement flow.
- Added node-level slope authoring in editor (toggle + rotate + arrow visualization).
- Added slope metadata persistence in map load/save path and custom-track generation.
- Added authored-slope runtime usage with legacy bridge endpoint fallback.
- Added first-pass visual layer emphasis for cars (off-layer dimming and hidden nametags).
- Added dynamic layered render stack (all lower layers + one upper layer) with per-layer scale/alpha/brightness transforms.
- Added wall painting in editor (mode, side, force, bounce), persisted in map JSON and custom-track generation.
- Added first-pass runtime wall behavior (solid grind/push, bouncy reflection, open pass-through).
- Added explicit legacy bridge->slope conversion in map load and track generation paths (not only runtime fallback).
- Added built-in layer regression test harness (map editor button + deterministic conversion checks).
- Expanded regression harness to validate all currently loaded custom/queued/pending uploaded maps.

Still in progress:
- Expand segment-level paint tools for faster authoring of long multi-layer runs.
- Additional playtest/tuning pass on slope crossing feel at high speed.

## Immediate Polish Backlog (2026-06-30)

- [ ] Add true transition animation (not instant layer snap): interpolate car render elevation/scale/alpha over a short ramp-crossing window while keeping collision authoritative.
- [X] Add authored slope geometry rendering (wedge/ramp silhouette) so slope nodes visibly look like inclines instead of flat overlays.
- [X] Replace current stroke-only per-layer road rendering with connected ribbon polygons per layer to eliminate "oval segment" artifacts and restore contiguous track pieces.
- [X] Enforce continuity at support-layer boundaries: join adjacent same-layer spans with cap stitching so no visible breaks at segment seams.
- [ ] Draw layer-connector mesh at slope thresholds using neighboring layer edge points (not a generic rectangle marker) so entry/exit visually matches road width and heading.
- [ ] Add per-layer z-order blending guard so overlap windows at slopes do not produce ghosted duplicate road blobs.
- [ ] Add editor preview mode "Show Support Layers" with per-segment tint and boundary lines to verify where each layer exists before playtesting.
- [ ] Add automated visual regression checks for: connected road continuity, slope connector alignment, and no detached oval islands around transitions.
- [X] Fix walls not being visible gray walls on the track and stuck as the sticky not slidey walls
---

## 1) Product Intent

### Goal
Make elevation transitions feel intentional and smooth by replacing brittle bridge gates with node-authored slopes that move the player exactly one layer up or down based on approach direction.

### Desired Feel
- Smooth transitions.
- No glitchy layer flips at entrances/exits.
- No random teleport/respawn snaps from elevation logic.
- Jumps/skips are created by slope + open gaps, not by forced respawn mechanics.
- Depth is readable visually: current layer is primary, above/below layers are de-emphasized.

---

## 2) Core Rules (Source of Truth)

### Layer Model
- Layers are conceptually unbounded: ..., -2, -1, 0, 1, 2, ...
- Transition step is always exactly +1 or -1.
- No hard top or bottom gameplay cap.

### Transitions
- Transitions are authored at nodes as slope thresholds.
- Crossing a slope threshold checks car forward direction vs slope direction:
  - Facing slope-up direction => move up one layer.
  - Facing opposite => move down one layer.
- Bidirectional crossing is allowed, result depends on heading.
- No forced cooldown unless needed for anti-jitter safety.

### Collision/Interaction
- Collisions are same-layer only.
- Obstacle/item interaction is same-layer only.
- Checkpoint/finish trigger contact requires layer match at touch time.
- Checkpoint progress memory persists across later layer changes.

### Falling and Gaps
- Void/open gaps remain as jump gaps (not deletion).
- No void-driven hard respawn mechanic.
- If unsupported at current layer, car falls over time with acceleration-like behavior.
- Falling should be visually smooth and readable.

### Walls
- Track walls become explicit behavior modes:
  - Solid wall: grind/slow with configurable constant opposing force.
  - Bouncy wall: wall collision acts like obstacle bounce.
  - Open wall: no support boundary; allows falling/jumps.
- Wall mode needs regional authoring and side selection (left/right).

---

## 3) Data Model Changes

### 3.1 Waypoint / Segment Authoring
Add layer-transition metadata at node level.

Proposed node fields:
- slopeType: "none" | "layerSlope"
- slopeDir: number (radians or degrees, choose one and document)
- slopeArrowStyle: optional visual hint config

Track/segment layer support:
- Keep existing spline generation, but attach explicit per-segment/per-sample layer support metadata.
- Remove reliance on old bridge endpoint gate semantics.

### 3.2 Layer Support Representation
Add support map used by gameplay queries:
- supportLayersAtSplineIdx[idx] -> Set or min/max layer info
- Used for:
  - is this layer supported at x,y
  - item/obstacle spawn filtering by layer
  - transition correctness

### 3.3 Wall Metadata
Add wall behavior metadata with region support:
- wallMode: "solid" | "bouncy" | "open"
- wallSide: "left" | "right" | "both"
- wallForce (for solid) configurable
- bounceGain (for bouncy) configurable

---

## 4) Gameplay Algorithms

### 4.1 Transition Detection (Slope Threshold)
Replace old bridge gate logic with deterministic slope crossing:

1. Detect line crossing against slope threshold line at node.
2. Verify crossing is within track width.
3. Compute heading sign:
   - dirDot = dot(carForward, slopeForward)
4. Apply layer change:
   - dirDot >= 0 => layer += 1
   - dirDot < 0 => layer -= 1
5. Apply anti-jitter guard:
   - spatial hysteresis around threshold (preferred over time cooldown)
   - avoid repeated flip when parked exactly on threshold

### 4.2 Fall Logic (Acceleration-like)
If no support for current layer at position:
- Increase fall velocity in layers/sec over time.
- Integrate accumulated fall amount.
- Drop one layer each time accumulated fall crosses 1.0.
- On support regained, settle to nearest valid layer with smooth visual transition.

Initial tuning target:
- start around 1 layer/sec effective pace
- accelerate gradually
- tune by playtesting (requested: slower, smooth feel)

### 4.3 Support Query
Implement robust query:
- getSupportedLayerSetAt(x,y)
- support comes from track geometry + authored wall/open state
- open-wall regions intentionally allow leaving support

### 4.4 Respawn Policy
- Remove any void-triggered immediate respawn logic.
- Respawn should only occur from explicit damage/death rules (existing combat rules).

---

## 5) Rendering Rules

### 5.1 Layer Visual Hierarchy
Given player layer N:
- Current layer N: fully opaque (main readability).
- Above layer N+1: lighter and translucent.
- Below layers N-1, N-2...: darker and opaque, progressively de-emphasized.

Requested intensity guidance:
- about 33% shift per layer step (+/-33% gamma-style effect).

### 5.2 Scale/Depth Effect
Requested visual depth:
- below layers scale ~0.9 per layer step
- above layer scale ~1.1 per layer step
- align by camera anchor so slope/drop positions remain coherent visually

Implementation note:
- Keep gameplay coordinates unchanged.
- Apply camera-space transform per rendered layer.
- Ensure threshold lines and cars line up perceptually during transitions.

### 5.3 Visibility Range
User direction evolved during discussion:
- Show all lower layers (progressively transformed/faded).
- Show one upper layer.

Need performance guard:
- Add render depth cap for very high |layer difference| to avoid runaway draw cost.

### 5.4 Car Rendering by Layer
- Same layer: normal.
- Other layers: dim.
- No nametags for non-current layers.

---

## 6) Editor Changes

### 6.1 Node Tools
Add slope authoring at nodes:
- Toggle node as slope threshold.
- Direction arrow preview.
- Numeric indicator for up/down behavior.
- Two-tone arrow style:
  - white side: up direction
  - black side: down direction

### 6.2 Wall Painting
Add painted wall regions:
- choose wall mode (solid/bouncy/open)
- choose side (L/R/both)
- adjustable force/bounce parameters

### 6.3 Existing Void Type
Keep void concept as jump gap/open support area, not as forced respawn trigger.

---

## 7) Backward Compatibility / Map Conversion

Auto-convert existing bridge maps into slope/layer metadata:
- bridge start endpoint -> slope threshold
- bridge end endpoint -> slope threshold
- inferred elevated span -> supported higher layer region
- convert bridge3 similarly as two-step encoded support where needed

Preserve old maps with conversion pipeline at load time.

---

## 8) Checkpoint / Finish Behavior With Layers

Rules:
- Touch validity requires layer match at time of crossing.
- Checkpoint memory persists through later layer changes/falls.
- Lap completion remains finish-line based only:
  - crossing finish completes lap only if all required checkpoints already remembered.
  - finish crossing must not wipe checkpoint progress unless lap actually increments.

---

## 9) Anti-Glitch Requirements

Must prevent:
- rapid layer ping-pong when hovering over threshold
- getting stuck between layers at intersections
- random repositioning caused by elevation code
- desync between visual layer and collision layer

Techniques:
- crossing hysteresis region
- single-source layer authority in physics step
- deterministic order of operations:
  1) movement integration
  2) slope crossing resolution
  3) support/fall resolution
  4) collisions

---

## 10) Networking / Sync

Ensure player state sync includes:
- authoritative layer
- transition/fall interpolation state (if required for remote smoothness)

Remote clients must render same layer-depth rules without changing gameplay authority.

---

## 11) Performance Budget

Potential hotspots:
- rendering many lower layers
- per-layer obstacle/player draws

Mitigations:
- max visible depth cap configurable
- cull layers with negligible alpha/scale contribution
- cache transformed track paths where possible

---

## 12) Implementation Plan (Phased)

### Phase A: Stabilize Core Transition Logic
- [x] Remove remaining legacy bridge gate behavior (runtime now prefers authored slopes).
- [x] Implement slope threshold crossing (+1/-1 by heading).
- [x] Add anti-jitter hysteresis.

### Phase B: Support/Fall System
- [x] Implement support query by layer (bridge/spline + void/open wall behavior integrated into runtime boundary/fall flow).
- [x] Implement acceleration-based falling between layers.
- [x] Verify no void-triggered respawn paths remain.

### Phase C: Rendering Revamp
- [x] Layer-based draw transforms (scale/alpha/gamma emphasis).
- [x] Current/lower/upper visual priority.
- [x] Dim/hide nametags for non-current-layer players.

### Phase D: Editor Authoring
- [x] Node slope tools and arrow UI.
- [x] Wall painting modes + side selection.
- [x] Parameter controls for wall force/bounce.

### Phase E: Map Conversion + Validation
- [x] Bridge->slope conversion on load/generation.
- [x] Regression tests for conversion paths (automated harness in editor).

---

## 13) Test Matrix

### Core Transition Tests
- Cross slope forward: layer +1 exactly once.
- Cross same slope backward: layer -1 exactly once.
- Idle on slope line: no oscillation.
- Closely spaced slopes: no stuck state.

### Fall Tests
- Leave support at speed: smooth delayed drop, then acceleration.
- Multi-layer fall across open gap: layer decrements over time, no teleport.
- Re-enter support during fall: clean settle, no jitter.

### Collision Tests
- Car-car collision same layer works.
- Car-car different layer does not interact.
- Obstacle/item same-layer only behavior holds.

### Race Logic Tests
- Checkpoints persist through layer changes.
- Finish requires remembered checkpoints.
- Finish crossing does not reset checkpoints unless lap increments.

### Visual Tests
- Current layer readability remains high.
- Lower layers darker, above lighter/translucent.
- Scale/parallax alignment keeps slopes visually coherent.

---

## 14) Tuning Knobs To Expose

- slopeHysteresisDistance
- fallAccelLayersPerSec2
- fallInitialLayersPerSec
- fallTerminalLayersPerSec
- lowerLayerScaleStep (default 0.9)
- upperLayerScaleStep (default 1.1)
- layerGammaStep (default 33%)
- wallSolidForce
- wallBounceGain
- maxRenderedLowerLayers

---

## 15) Definition of Done

Done means:
- Transitioning up/down is deterministic and non-glitchy.
- No random track snapping from elevation/void logic.
- Jumps/skips can be built intentionally with slope + open gaps.
- Layer visuals clearly communicate depth while preserving gameplay clarity.
- Existing bridge maps load into equivalent layer behavior via conversion.
