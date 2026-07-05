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
  allowedCarTypes: Object.keys(CAR_TYPES),
  allowPrototypes: true,   // host lobby toggle; prototypes are currently unlocked in all play
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

function makePlayer(id, name, color, x, y, angle, carType) {
  return {
    id, name, color,
    paintTag: '',
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
    stun:0, ghostMode:0, shielded:false, boosting:0, oilSlick:0,
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
