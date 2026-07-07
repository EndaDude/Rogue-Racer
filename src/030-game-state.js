// ============================================================
// GAME STATE
// ============================================================
let G = {
  track: null,
  seed: 0,
  players: {}, // id -> player state
  myId: null,
  isHost: false,
  lap: 1,
  raceStarted: false,
  raceOver: false,
  finishOrder: [],
  countdownVal: 0,
  keys: {},
  camera: { x:0, y:0, zoom:0.55, shakeTime:0, shakeMag:0 },
  lastFrame: 0,
  upgrades: {},    // myId -> [upgradeIds]
  heldItem: null,
  missiles: [],
  mines: [],
  shells: [],
  balls: [],
  ghouls: [],
  bullets: [],     // machinegun tracer rounds
  explosions: [],
  nukeParticles: [],
  checkpointConfetti: [],
  snowParticles: [],
  brickShards: [],
  driftTrails: [],
  fx: [],          // unified juice particles (exhaust, sparks, smoke, sparkles)
  skidMarks: [],   // persistent tire marks left by drifting
  toasts: [],      // on-canvas race banners (laps, overtakes, events)
  raceStats: null, // local player's per-race stats (top speed, drifts, ...)
  ghostRec: null,  // current-lap ghost recording (solo)
  ghostPlay: null, // best-lap ghost being replayed (solo)
  selectedCarType: 'tez',
  selectedColor: PLAYER_COLORS[0],
  selectedPaintTag: '',
  selectedSmokeColor: '',   // custom exhaust-smoke color ('' = default grey)
  selectedTrailColor: '',   // custom always-on trail color ('' = no trail); nitro is independent
  selectedDecals: [],       // placed hull decals: [{src,x,y,scale,rot}] (x/y/scale are hull fractions)
  selectedShowTag: true,    // show the paint tag beside your name
  allowedCarTypes: Object.keys(CAR_TYPES),
  allowPrototypes: false,  // host lobby toggle; prototypes start LOCKED until `enableprototypes`
  speedClass: 'neighborhood',
  speedScale: 1,
  hostMode: 'owner',
  mapQueue: [],
  queueIndex: 0,
  totalLaps: 3,
  lobbyLaps: 3,
  raceStartTime: 0,
  pendingMaps: [],
  mapVotes: {},
  customMap: null, // set by Map Editor when a custom map is loaded
  upgradePause: { active:false, until:0, choosers:{} },
  spectateId: null,
  freeCam: false, // spectator free-flying camera (pan with the movement keys)
  viewLayer: 0, // fractional viewer layer, eases toward me.layer for smooth slope transitions
};

// ---- Per-frame derivation caches -------------------------------------------
// The render/update loop is frame-time bound. Two patterns dominated the waste:
//   1. dozens of per-frame functions each called Object.values(G.players),
//      allocating a fresh array every call (some once *per layer*);
//   2. the Phase-C draw passes each re-scanned *all* entities filtering by layer,
//      once per layer — an L x E cost every frame.
// gameLoop() bumps G._frameId once per rendered frame; the helpers below memoise
// those derivations for the current frame so the work happens once, not L times.
// Everything keys on G._frameId, so the caches auto-invalidate next frame with no
// manual clearing and no risk of going stale across frames.
G._frameId = 0;
G._playersArr = null;
G._playersArrFrame = -1;

// Object.values(G.players) for the current frame, built at most once per frame.
// Returns live player object references (mutating through it mutates the players),
// exactly like a direct Object.values call — just without the per-call allocation.
function framePlayers() {
  if (G._playersArrFrame !== G._frameId) {
    G._playersArr = Object.values(G.players);
    G._playersArrFrame = G._frameId;
  }
  return G._playersArr;
}

// Generic "bucket a flat list by its .layer" cache. Each distinct `key` is
// bucketed at most once per frame; a draw pass then reads only its own layer's
// slice instead of filtering the whole list. This turns the Phase-C L x E
// per-layer re-scan into a single O(E) pass plus O(1) map lookups. Entity order
// within a layer is preserved, so paint order is identical to the old filter.
const _EMPTY_LAYER_BUCKET = [];
G._layerBuckets = { frame: -1, maps: {} };
function frameLayerBucket(key, list, layer) {
  const lb = G._layerBuckets;
  if (lb.frame !== G._frameId) { lb.frame = G._frameId; lb.maps = {}; }
  let m = lb.maps[key];
  if (!m) {
    m = new Map();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const l = e.layer || 0;
      let arr = m.get(l);
      if (!arr) { arr = []; m.set(l, arr); }
      arr.push(e);
    }
    lb.maps[key] = m;
  }
  return m.get(layer || 0) || _EMPTY_LAYER_BUCKET;
}

// Invalidate a player's cached hull-decal clip by bumping an integer version.
// getPlayerDecalClip keys its cache on this instead of JSON.stringify-ing the
// (data-URL-heavy) decal list every frame — call this wherever decals change.
function bumpDecalVer(p) { if (p) p._decalVer = (p._decalVer || 0) + 1; }

// Multiplier applied to particle spawn counts / rates. Folds together the rolling
// FPS estimate (spawn less when frames are expensive) and the user "Low FX"
// quality toggle. 1 = full particles; smaller = fewer. Spawn helpers multiply
// their counts by this and probabilistically drop fractional spawns.
function fxSpawnScale() {
  let s = G._fxScale == null ? 1 : G._fxScale;
  if (typeof AUDIO_SETTINGS !== 'undefined' && AUDIO_SETTINGS.lowFx) s *= 0.45;
  return s;
}
// True when the Low FX quality mode is on (used to gate trails, skid marks, and
// the heavier per-car glow passes entirely).
function lowFxOn() { return typeof AUDIO_SETTINGS !== 'undefined' && !!AUDIO_SETTINGS.lowFx; }

// Per-layer viewport cull rectangle in world space, refreshed for each layer in
// the Phase-C draw loop (render). inView() lets the high-count per-entity draws
// skip anything fully off-screen instead of issuing canvas ops the browser would
// only clip away. The rect already bakes in a generous margin, so callers pass
// just the entity's own radius and edge pop-in can't happen.
G._cull = null;
function inView(x, y, r) {
  const c = G._cull;
  if (!c) return true;
  r = r || 0;
  return x + r >= c.minX && x - r <= c.maxX && y + r >= c.minY && y - r <= c.maxY;
}

function makePlayer(id, name, color, x, y, angle, carType) {
  return {
    id, name, color,
    paintTag: '',
    smokeColor: '', trailColor: '', decal: '', showTag: true,
    ready: false,
    x, y, angle: angle||0,
    carType: carType || 'drifter',
    vx:0, vy:0, speed:0,
    maxHealth: carMaxHealth(carType || 'drifter'),
    health: carMaxHealth(carType || 'drifter'),
    deathRespawn:0,
    invuln:0,
    lap:1, lapProgress:0, lapTime:0, totalTime:0,
    nextCheckpoint:0,
    checkpointsDoneThisLap:false,
    lastCheckpointTime:0, lastLapTime:0,
    finished:false, finishTime:0,
    stun:0, ghostMode:0, shielded:false, shieldTime:0, autopilot:0, boosting:0, oilSlick:0, trailBoost:0,
    heldItem:null,
    upgrades:[],
    drifting:false,
    driftTrailTimer:0,
    driftBoostStack:0,
    driftShakePhase:0,
    driftSteerSign:0,
    driftFlipTimer:0,
    driftFlipCount:0,
    driftCommitTimer:0,
    driftNoBoostTimer:0,
    driftPenaltyTimer:0,
    rampIgnore: {},
    layerFallSpeed:0,
    layerFallProgress:0,
    layer: 0, rampCooldown: 0, inRampZone: false, lastRampKey: '', bridgeTransitionGrace: 0, airTime: 0,
    // Rotor
    propHealth: CAR_TUNING.rotorPropMaxHealth,
    propBroken: false,
    downdraft: 0,
    rotorCooldown: 0,
    // Rotor + Coil shared wobble (0..1)
    wobble: 0,
    // Coil
    battery: 0,
    arcing: 0,
    arcBurst: 0,
    coilAbilityCooldown: 0,
    // Screamer
    honkCooldown: 0,
    tunnelVision: 0,
    screamSlow: 0,
    // Holo
    holoCooldown: 0,
    // Baller
    inflate: 0,
    ballerCooldown: 0,
    // Needle
    spikes: 0,
    needleCooldown: 0,
    // Puncher
    puncherCooldown: 0,
    // Class-unique power-up effects
    drain: 0, drainedBy: null,   // Dragger tether (victim side)
    ghoulSlow: 0,                // Screamer ghoul speed-halve (victim)
    noControl: 0,                // Baller ball control lockout (victim)
    deathray: 0,                 // Needle beam active timer (owner)
  };
}

function spawnPos(i, spline) {
  const idx = Math.floor(i * 3);
  const pt = spline[idx % spline.length];
  const next = spline[(idx+1)%spline.length];
  const dx=next.x-pt.x, dy=next.y-pt.y;
  const l=Math.sqrt(dx*dx+dy*dy)||1;
  const perp={x:-dy/l, y:dx/l};
  const offset = (i%2===0?1:-1)*(i>1?2:0)*20;
  return { x:pt.x+perp.x*offset, y:pt.y+perp.y*offset, angle:Math.atan2(dy,dx) };
}

function supportFloorAtIdxForTrack(track, idx) {
  if (!track || !track.spline || !track.spline.length) return 0;
  const n = track.spline.length;
  if (!Array.isArray(track.bridges) || !track.bridges.length) return 0;
  let floor = 0;
  for (const b of track.bridges) {
    if (idxInBridge(idx, b, n)) floor = Math.max(floor, b.floor || 1);
  }
  return floor;
}

function safeSpawnState(i, track) {
  if (!track || !Array.isArray(track.spline) || track.spline.length < 2) {
    const basic = spawnPos(i, (track && track.spline) || [{x:0,y:0},{x:1,y:0}]);
    return { ...basic, layer: 0, grace: 0.25 };
  }

  const sp = track.spline;
  const n = sp.length;
  // Start a few samples PAST the finish line so the car isn't buried under the
  // line graphic and doesn't instantly trigger a lap wrap.
  const startOffset = Math.max(4, Math.round(n * 0.012));
  const base = ((Math.floor(i * 3) + startOffset) % n + n) % n;
  const slopeIdxs = Array.isArray(track.slopes) ? track.slopes.map(s => ((Math.round(s.idx || 0) % n) + n) % n) : [];
  const sv = Array.isArray(track.splineVoid) && track.splineVoid.length === n ? track.splineVoid : null;
  const slopeAvoidDist = 6;
  const maxSteps = Math.min(18, Math.floor(n / 8));

  function nearSlope(idx) {
    for (const si of slopeIdxs) {
      const d = Math.abs(idx - si);
      if (Math.min(d, n - d) <= slopeAvoidDist) return true;
    }
    return false;
  }

  const baseFloor = supportFloorAtIdxForTrack(track, base);
  let chosen = base;
  let chosenFloor = baseFloor;

  // Local-only search around the intended spawn band. Never scan the whole map.
  for (let step = 0; step <= maxSteps; step++) {
    const candidates = step === 0
      ? [base]
      : [
          (base + step) % n,
          (base - step + n) % n,
        ];
    let picked = false;
    for (const ci of candidates) {
      const isVoid = sv ? !!sv[ci] : false;
      if (isVoid) continue;
      if (nearSlope(ci)) continue;
      const floor = supportFloorAtIdxForTrack(track, ci);
      if (floor !== baseFloor) continue;
      chosen = ci;
      chosenFloor = floor;
      picked = true;
      break;
    }
    if (picked) break;
  }

  const pt = sp[chosen];
  const next = sp[(chosen + 1) % n];
  const dx = next.x - pt.x, dy = next.y - pt.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  const perp = { x: -dy / l, y: dx / l };
  const offset = (i % 2 === 0 ? 1 : -1) * (i > 1 ? 2 : 0) * 20;
  return {
    x: pt.x + perp.x * offset,
    y: pt.y + perp.y * offset,
    angle: Math.atan2(dy, dx),
    layer: Number.isFinite(chosenFloor) ? chosenFloor : 0,
    grace: 0.16,
  };
}
