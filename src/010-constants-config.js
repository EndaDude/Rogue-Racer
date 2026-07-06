// ============================================================
// CONSTANTS & CONFIG
// ============================================================
// Game (HTML) version. This ships independently of the desktop app via the
// self-updating loader, so bump it whenever you publish a game update; it shows
// on the terminal so you can confirm which build actually loaded.
const GAME_VERSION = '0.1.14';
const TOTAL_LAPS = 3;
const PLAYER_COLORS = ['#a855f7','#06b6d4','#fbbf24','#22c55e','#ef4444','#f97316'];
const CAR_W = 14, CAR_H = 22;

// Parse a #rrggbb (or #rgb) hex string into [r,g,b]. Returns null on bad input.
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// Scale an [r,g,b] toward black by factor f (0..1); f=1 keeps it, f=0.4 = 40% brightness.
function shadeRgb(rgb, f) {
  return [Math.round(rgb[0] * f), Math.round(rgb[1] * f), Math.round(rgb[2] * f)];
}
const TRACK_W = 80; // track half-width
// Car handling/speed tuning in one place.
const CAR_TUNING = {
  baseMaxSpeed: 200,
  maxReverseSpeed: 80,
  baseAccel: 90,
  baseBrake: 50,
  baseFriction: 120,
  baseAirFriction: 30,
  baseTurnRate: 1.15,
  // How strongly turn rate scales up with the track speed class (used as
  // speedScale ** trackSpeedHandlingExp). 0 = no scaling; higher = faster classes
  // corner much harder so they don't turn into wide, floaty arcs.
  trackSpeedHandlingExp: 1,
  reverseAccelScale: 0.7,
  steerMinSpeedRef: 28,
  steeringGripPenalty: 0.35,
  longDrag: 0.16,
  // Under power we use a tiny longitudinal drag so acceleration only sets how fast
  // you REACH the rated top speed (a firm cap), decoupling accel from top speed.
  throttleDrag: 0.02,
  coastDrag: 0.95,
  lateralGrip: 2.4,
  lateralGripMin: 1.2,
  lateralGripMax: 3.4,
  iceGripMult: 0.18,
  iceSteerSlide: 10,
  iceAccelMult: 0.35,
  iceDragMult: 0.3,
  maxLateralSpeedRatio: 0.85,
  driftLateralGripMult: 0.45,
  driftLongDragMult: 0.75,
  driftCoastDragMult: 0.55,
  driftCoastLateralGripMult: 0.12,
  driftCoastMaxLateralRatio: 1.35,
  driftOverspeedBleed: 1.4,
  driftCoastOverspeedBleed: 0.22,
  driftCoastYawMult: 0.06,
  driftSteerBoost: 1.6,
  // Drift carries velocity through a turn: the sideways momentum scrubbed off by
  // the tires is redirected into forward motion instead of being lost (0..1 = how
  // much of it is preserved). This keeps your speed as you turn WITHOUT ever adding
  // speed beyond your top speed — drifting no longer boosts you forward.
  driftCarryEfficiency: 0.92,
  driftSpeedBonusPerSec: 18,
  driftSpeedBonusMaxMult: 1.16,
  driftBoostBuildPerSec: 0.85,
  driftBoostDecayPerSec: 0.55,
  driftBoostStackMax: 1.8,
  driftSpeedBonusStackScale: 1.1,
  driftSpeedCapStackMult: 0.7,
  driftMinSlipForBoost: 14,
  driftMinSlipGate: 0.35,
  driftMinSlipAngle: 0.23,
  driftMinCommitSec: 0.16,
  driftFlipPenaltyWindow: 1.0,
  driftFlipPenaltySwaps: 3,
  driftFlipStackMult: 0.55,
  driftFlipNoBoostSec: 0.32,
  driftGlitchPenaltySec: 0.7,
  driftGlitchSpeedCut: 0.82,
  driftGlitchDragPerSec: 2.2,
  driftGlitchTurnMult: 0.45,
  driftGlitchLateralDamp: 0.6,
  driftLowSlipDecayPerSec: 1.1,
  shiftLongDragMult: 0.72,
  shiftCoastDragMult: 0.34,
  shiftLateralGripMult: 0.2,
  shiftOverspeedBleed: 0.2,
  driftShakeStartSpeed: 300,
  driftShakeHandlingSafe: 1.25,
  driftShakeHandlingRange: 0.55,
  driftShakeLateralKick: 160,
  driftShakeYawRate: 2.2,

  boostSpeedMultiplier: 2,
  stunVelocityDamping: 0.92,

  topSpeedUpgradeStep: 0.15,
  accelUpgradeStep: 0.20,
  handlingUpgradeStep: 0.15,

  draftRange: 120,
  draftAngleThreshold: 0.4,
  draftPerTickMultiplier: 1.003,
  draftMaxSpeedMultiplier: 1.2,

  fallTimeMin: 0.2,
  fallTimeMax: 1,
  layerSlopeHysteresisDist: 16,
  layerFallAccel: 1.25,
  layerFallInitialSpeed: 1.0,
  layerFallTerminalSpeed: 3.2,

  offTrackHeavySlow: 0.70,
  offTrackLightSlow: 0.88,
  offTrackHeavySlowDrifter: 0.86, // Drifter loses less speed deep off-track (dirt)
  offTrackLightSlowDrifter: 0.95, // Drifter loses less speed at the track edge (dirt)
  riverTrackPush: 200,
  riverTrackDrag: 0.22,
  powerupRespawnSec: 30,

  obstacleHitRadiusPad: 2,
  obstacleBounceRestitution: 0.9,
  obstacleBounceMinSpeed: 20,
  obstacleBounceKick: 14,

  carHitRadius: 16,
  carBounceRestitution: 0.85,
  carBounceMinSpeed: 18,
  carBounceKick: 12,

  baseHealth: 100,
  obstacleDamage: 2,
  brickWallDamage: 10,
  brickShardDamage: 20,
  carCollisionDamage: 8,
  missileDamage: 36,
  mineDamage: 44,
  pulseDamage: 28,
  respawnInvuln: 1.2,
  deathRespawnTime: 1.5,
  deathExplosionRadius: 180,
  deathExplosionShake: 20,
  deathExplosionDamage: 42,      // damage a dying car's blast deals to nearby rivals

  audioMenuMusicBaseVolume: 0.5,
  audioCountdownBaseVolume: 0.85,
  audioEngineMixBase: 1.0,
  audioEngineLocalBaseVol: 0.75,
  audioEngineLocalZoomVolSpan: 0.25,
  audioEngineRemoteNearVol: 0.85,
  audioEngineRemoteEdgeRatio: 0.8,
  audioEngineRemoteFarFalloffBase: 0.25,
  audioEnginePanStrength: 3.0,
  audioEngineVolumeNoiseAmp: 0.03,
  audioEngineVolumeNoiseHz: 1.8,
  audioEngineCrossfadeMs: 1000,
  audioEngineOverlapSec: 1.0,
  audioEngineLeadPadSec: 0.08,

  engineRateIdle: 0.5,
  engineRateSpan: 1.5,
  engineRateRefSpeed: 280,

  // Rotor: front propeller draft + wake slow, wobble from shift, spin-up start.
  rotorPropMaxHealth: 100,
  rotorPropHitDamage: 22,        // propeller HP lost per collision
  rotorDraftRange: 150,          // a passing car within this range feeds the prop
  rotorDraftBoostPerSec: 26,     // extra forward speed gained while being passed
  rotorWakeRange: 320,           // rotor's slipstream wake reach behind it
  rotorWakeMinSpeed: 220,        // rotor must exceed this to slow cars behind
  rotorWakeSlowMax: 0.45,        // up to 45% speed cut on cars caught in the wake
  rotorWakeCone: 0.6,            // cos threshold for "behind" the rotor
  rotorSpinUpSec: 5,             // slow launch while the prop spins up
  rotorSpinUpSpeedMult: 0.62,
  rotorRestartSpeed: 30,         // if the rotor slows below this it must spin up again
  rotorCrashDropFrac: 0.45,      // a >45% single-frame speed drop counts as a crash -> respin
  rotorShiftWobblePerSec: 0.85,  // wobble built while holding shift
  rotorWobbleDecayPerSec: 0.7,
  rotorWobbleKick: 130,          // lateral jitter at full wobble
  rotorWobbleYaw: 1.4,
  rotorWobbleSpeedRef: 260,      // speed at which the wobble reaches its per-unit scaling
  rotorWobbleSpeedScale: 1.6,    // extra wobble violence added at/above the ref speed
  rotorWobbleSpeedMax: 1.5,      // cap on the speed-driven wobble multiplier growth
  // Downdraft ability (rotor): a hard suction wake behind the prop that only engages
  // while shifting. Slows and drags trailing cars far harder than the passive wake.
  rotorDowndraftCooldown: 12,    // cooldown between downdraft activations
  rotorDowndraftDuration: 4,     // max seconds it can stay lit (only while shifting)
  rotorDowndraftRange: 460,      // reach of the active downdraft behind the rotor
  rotorDowndraftCone: 0.35,      // cos threshold for "behind" — wider than the passive wake
  rotorDowndraftSlowMax: 0.8,    // up to 80% speed cut on cars caught in the active downdraft
  rotorDowndraftPull: 120,       // per-sec suction that yanks trailing cars toward the rotor

  // Coil: wall-arc battery. Charges by arcing near walls + braking, depletes on shift.
  coilBatteryMax: 100,
  coilBrakeChargePerSec: 20,
  coilArcChargePerSec: 26,       // charge rate while arcing, scaled by how close the wall is
  coilShiftDrainPerSec: 60,
  coilArcRange: 60,              // distance from road edge at which arcs begin
  coilArcBoostPerSec: 30,
  coilArcWobble: 1,
  coilArcVictimRange: 120,       // opponents this close to an arcing coil get zapped
  coilArcVictimDamage: 2,        // per bolt
  coilArcVictimBoostPerSec: 22,
  coilOverchargeDrainHpPerSec: 6,   // HP/sec cooked off while the battery is above 100%
  coilOverchargeRampMult: 1.6,      // extra overcharge damage scaling as it climbs toward 200%
  coilArcVictimWobblePerSec: 2.6, // how hard a nearby arcing coil rattles rivals
  coilShiftBatteryPush: 55,       // shift accel/decel swing driven by battery charge
  coilArcBurstDuration: 5,        // max seconds the ability keeps the coil fully arcing
  coilArcBurstCooldown: 20,       // cooldown between activations
  coilArcBurstRangeMult: 2.4,     // arc reach multiplier (big radius) while the ability is active
  coilArcBurstMinBattery: 20,     // minimum charge needed to trigger the arc storm
  coilArcBurstDrainPerSec: 20,    // upkeep the storm drains per second (wall-arcing offsets it)

  // Screamer: honk tunnel-vision.
  screamerHonkCooldown: 30,
  screamerHonkRange: 950,
  screamerHonkTunnelSec: 10,
  screamerTunnelZoomMult: 1.35,
  screamerMaskHoleFrac: 0.14,    // clear hole radius as fraction of min(W,H)
  screamerMaskFadeSec: 1.4,      // how long the mask takes to fade out at the end
  screamerHonkSlowSec: 2.5,      // how long the scream drags victims down
  screamerHonkInstantCut: 0.5,   // instant speed multiplier the moment a victim is hit
  screamerHonkSlowDrag: 1.6,     // extra per-second velocity drag while slowed

  // Holo: on-demand ghost phase + Flipper item.
  holoGhostDuration: 2,
  holoGhostCooldown: 12,
  holoFlipRange: 240,

  // Baller: inflate — pump up to double size, then a single monster wall bounce.
  ballerInflateDuration: 4,       // max seconds the ball stays primed (if no wall is hit)
  ballerInflateCooldown: 15,      // cooldown between inflates
  ballerInflateScale: 2,          // size multiplier while inflated
  ballerInflateRestitution: 2.4,  // how hard the one bounce kicks off a wall (>1 = gains energy)
  ballerInflateBounceSpeedMult: 1.9, // the single bounce flings you at this multiple of your speed
  // Baller collisions with OTHER cars — it throws its weight around.
  ballerHitKnockback: 3.8,        // knockback flung onto a car hit BY a baller
  ballerSelfKnockback: 1.3,       // how little the baller itself is shoved back

  // Needle: deploy body spikes — punishes rammers and locks its footing.
  needleSpikesDuration: 5,        // seconds the spikes stay out
  needleSpikesCooldown: 14,       // cooldown between deploys
  needleSpikesDamageMult: 5.0,    // spikes deal 500% of a normal car-hit to attackers

  // Puncher: shockwave punch — shoves cars & obstacles away, hardest along its axis.
  puncherShockCooldown: 15,        // cooldown between shockwaves
  puncherShockRadius: 240,        // reach of the blast
  puncherShockPush: 320,          // base outward shove at point-blank
  puncherShockAxisBonus: 1.0,     // extra force straight ahead/behind vs. the sides (+100%)
  puncherShockDamage: 10,         // damage dealt to caught rivals

  // Bots (AI opponents): pace, racing line, obstacle handling, items & abilities.
  botAccelBaseMult: 1.9,          // accel scalar applied on top of the car's accelMult
  botApexPull: 0.85,              // how hard bots cut toward the inside of corners (0..1+)
  botLineWanderMult: 1.0,         // multiplier on the straight-line lateral wander
  botObstaclePad: 10,             // extra radius padding when a bot tests an obstacle hit
  botObstacleSlow: 0.55,          // speed kept after clipping a solid obstacle (0.55 = -45%)
  botObstacleDamageMult: 1.0,     // scalar on obstacle damage bots take
  botItemPickRadius: 26,          // how close a bot must pass an item box to grab it
  botItemUseMin: 2.5,             // min seconds a bot holds an item before using it
  botItemUseMax: 6,               // max seconds a bot holds an item before using it
  botAbilityMinCd: 5,             // min seconds between a bot's ability attempts
  botAbilityMaxCd: 11,            // max seconds between a bot's ability attempts
  botAbilityUseChance: 0.7,       // chance a bot actually fires when its ability is ready

  // ── Class-unique power-ups ────────────────────────────────────────────────
  // Puncher: Shell — a heavy shell that bounces off track walls and only homes
  // when a rival strays within range.
  shellSpeed: 560,                // travel speed
  shellLife: 15,                   // seconds before it fizzles
  shellDamage: 28,                // impact damage
  shellRadius: 11,                // collision radius
  shellHomingRange: 240,          // only steers toward a rival inside this range
  shellTurnRate: 3.2,             // rad/sec steering when homing
  // Dragger: Drain — hold-to-aim tether that saps a rival's health over time.
  drainAimRange: 520,             // length of the projected aim line from the nose
  drainAimPickRadius: 70,         // how close a ship must be to the line to be grabbed
  drainDuration: 10,              // seconds the tether lasts
  drainHpPerSec: 5,               // health drained per second (all ships)
  drainCoilBatteryPerSec: 40,     // extra battery bled off a tethered Coil
  drainBreakDist: 640,            // get this far from the drainer and the tether snaps
  // Screamer: Ghoul — a specter that rides the track and halves everyone's speed.
  ghoulRange: 1600,               // track distance it travels before dissipating
  ghoulSpeed: 950,                // how fast it rides down the track
  ghoulSlowDuration: 5,           // seconds a caught racer is slowed
  ghoulSlowMult: 0.5,             // speed multiplier applied to the caught (0.5 = half)
  // Baller: Ball — an erratic bouncing ball that locks up whoever it hits.
  ballSpeed: 470,                 // base travel speed
  ballLife: 9,                    // seconds before it pops
  ballDamage: 12,                 // impact damage
  ballRadius: 13,                 // collision radius
  ballWobble: 2.6,                // rad/sec of erratic velocity wander (non-constant)
  ballControlLossSec: 6,          // seconds of lost control on a hit
  // Needle: Engine Deathray — spend health to fire a lethal forward beam.
  needleDeathrayDuration: 5,      // seconds the beam stays lit
  needleDeathrayCost: 20,         // health spent to fire it
  needleDeathrayDamagePerSec: 50, // damage/sec to anything caught in the beam
  needleDeathrayWidth: 16,        // beam half-width band (≈ the needle hull width)

  // Missile rework: fired blind, bounces around the track, and needs a sustained
  // lock before it hunts a rival along the track path.
  missileSpeed: 520,              // constant travel speed
  missileLife: 12,                // seconds before it self-destructs
  missileLockTime: 3,             // seconds a rival must stay in range to lock
  missileLockRange: 720,          // acquisition range for a lock
  missileTurnRate: 3.4,           // rad/sec steering once locked
  missileRadius: 12,              // collision radius
  // Machinegun: a short rapid-fire burst of straight, wall-bouncing tracer rounds.
  bulletSpeed: 900,               // fast, flat trajectory
  bulletLife: 1.1,               // seconds before a round fizzles
  bulletDamage: 6,                // per-round base damage (scaled by owner FIREPOWER)
  bulletRadius: 5,
  machinegunBurst: 8,             // rounds per pickup use
  machinegunInterval: 0.06,       // seconds between rounds
  machinegunSpread: 0.05,         // random aim jitter (radians)

  // Projectiles die after a fixed number of wall bounces instead of a timer.
  shellBounces: 7,                // Puncher Shell
  missileBounces: 5,              // Missile
  ballBounces: 10,                // Baller Ball
  bulletBounces: 3,               // Machinegun tracer round
};


const CAR_TYPES = {
  drifter: {
    name: 'Drifter',
    shape: 'drifter',
    prototype: true,
    accelMult: 1.0,
    topSpeedMult: 1.0,
    handlingMult: 1.0,
    momentumDragMult: 1.0,
    driftEffectMult: 1.3,
    shiftEffectMult: 1.0,
    shiftEnabled: false,
    crashResist: 1.0,
    weaponResist: 1.0,
    knockbackOutMult: 1.0,
    knockbackInMult: 1.0,
    bounceMult: 1.0,
    endlessTopSpeed: false,
  },
  dragger: {
    name: 'Dragger',
    shape: 'dragger',
    prototype: true,
    accelMult: 0.95,
    topSpeedMult: 1.03,
    handlingMult: 1.15,
    momentumDragMult: 1.03,
    driftEffectMult: 0.78,
    driftEnabled: true,
    shiftEffectMult: 1.35,
    shiftEnabled: true,
    crashResist: 0.95,
    weaponResist: 0.95,
    knockbackOutMult: 0.95,
    knockbackInMult: 1.05,
    bounceMult: 0.95,
    endlessTopSpeed: false,
    healthMult: 0.7,
  },
  puncher: {
    name: 'Puncher',
    shape: 'puncher',
    prototype: true,
    accelMult: 3.0,
    topSpeedMult: 0.9,
    handlingMult: 1,
    momentumDragMult: 0.96,
    driftEffectMult: 0.7,
    shiftEffectMult: 0.9,
    shiftEnabled: false,
    crashResist: 1.45,
    weaponResist: 1.45,
    knockbackOutMult: 1.05,
    knockbackInMult: 0.7,
    bounceMult: 0.8,
    endlessTopSpeed: false,
  },
  needle: {
    name: 'Needle',
    shape: 'needle',
    prototype: true,
    accelMult: 0.55,
    topSpeedMult: 1.08,
    handlingMult: 0.62,
    momentumDragMult: 0.9,
    driftEffectMult: 0.65,
    driftEnabled: false,
    shiftEffectMult: 1.05,
    shiftEnabled: false,
    crashResist: 0.85,
    weaponResist: 0.85,
    knockbackOutMult: 0.9,
    knockbackInMult: 1.15,
    bounceMult: 0.9,
    endlessTopSpeed: true,
  },
  baller: {
    name: 'Baller',
    shape: 'baller',
    prototype: true,
    accelMult: 0.92,
    topSpeedMult: 0.97,
    handlingMult: 0.9,
    momentumDragMult: 1.35,
    driftEffectMult: 1.35,
    shiftEffectMult: 0.8,
    shiftEnabled: false,
    crashResist: 0.9,
    weaponResist: 0.9,
    knockbackOutMult: 1.35,
    knockbackInMult: 1.1,
    bounceMult: 1.4,
    endlessTopSpeed: false,
  },
  rotor: {
    name: 'Rotor',
    shape: 'rotor',
    prototype: true,
    // Same base speed profile as the Dragger.
    accelMult: 0.95,
    topSpeedMult: 1.03,
    handlingMult: 1.12,
    // Propeller ships have almost no brakes — you have to coast down.
    brakeMult: 0.22,
    momentumDragMult: 1.03,
    driftEffectMult: 0.78,
    driftEnabled: false,
    shiftEffectMult: 1.2,
    shiftEnabled: true,
    crashResist: 0.95,
    weaponResist: 0.95,
    knockbackOutMult: 0.95,
    knockbackInMult: 1.05,
    bounceMult: 0.95,
    endlessTopSpeed: false,
  },
  coil: {
    name: 'Coil',
    shape: 'coil',
    prototype: true,
    // Same base speed profile as the Drifter.
    accelMult: 1.0,
    topSpeedMult: 1.0,
    handlingMult: 1.0,
    momentumDragMult: 1.0,
    driftEffectMult: 1.0,
    driftEnabled: true,
    shiftEffectMult: 1.05,
    shiftEnabled: true,
    crashResist: 1.0,
    weaponResist: 1.0,
    knockbackOutMult: 1.0,
    knockbackInMult: 1.0,
    bounceMult: 1.0,
    endlessTopSpeed: false,
  },
  screamer: {
    name: 'Screamer',
    shape: 'screamer',
    prototype: true,
    // Same base speed profile as the Baller.
    accelMult: 0.92,
    topSpeedMult: 0.97,
    handlingMult: 0.92,
    momentumDragMult: 1.2,
    driftEffectMult: 1.2,
    shiftEffectMult: 0.85,
    shiftEnabled: false,
    crashResist: 0.95,
    weaponResist: 0.95,
    knockbackOutMult: 1.1,
    knockbackInMult: 1.05,
    bounceMult: 1.1,
    endlessTopSpeed: false,
  },
  holo: {
    name: 'Holo',
    shape: 'holo',
    prototype: true,
    // Same base speed profile as the Drifter.
    accelMult: 1.0,
    topSpeedMult: 1.0,
    handlingMult: 1.0,
    momentumDragMult: 1.0,
    driftEffectMult: 1.3,
    shiftEffectMult: 1.0,
    shiftEnabled: false,
    crashResist: 1.0,
    weaponResist: 1.0,
    knockbackOutMult: 1.0,
    knockbackInMult: 1.0,
    bounceMult: 1.0,
    endlessTopSpeed: false,
  },
};

// ---- Regular (non-prototype) racing roster --------------------------------
// New ships are authored with six intuitive 1-10 ratings and converted into the
// engine's multiplier fields here. Rating 5 == baseline (1.0) on every axis.
//   accel   -> accelMult      (how fast you reach top speed)
//   top     -> topSpeedMult   (the firm speed ceiling; decoupled from accel)
//   handling-> handlingMult   (turn rate / grip)
//   armor   -> crashResist & weaponResist (damage taken from walls & weapons)
//   fire    -> firePower      (outgoing weapon damage: missile, machinegun, deathray)
// `items` is a per-ship weighted DROP pool (id -> weight). Only listed items can
// drop for that ship; usage of any item stays universal. `extra` overrides.
function mkShip(name, shape, r, items, extra) {
  const arm = +(0.7 + (r.armor ?? 5) * 0.06).toFixed(3);
  const ship = {
    name, shape,
    prototype: false,
    ratings: { accel: r.accel ?? 5, top: r.top ?? 5, handling: r.handling ?? 5, armor: r.armor ?? 5, fire: r.fire ?? 5 },
    accelMult: +(0.6 + (r.accel ?? 5) * 0.08).toFixed(3),
    topSpeedMult: +(0.9 + (r.top ?? 5) * 0.02).toFixed(3),
    handlingMult: +(0.7 + (r.handling ?? 5) * 0.06).toFixed(3),
    momentumDragMult: 1.0,
    driftEffectMult: 1.0,
    driftEnabled: true,
    shiftEffectMult: 1.0,
    shiftEnabled: false,
    crashResist: arm,
    weaponResist: arm,
    knockbackOutMult: 1.0,
    knockbackInMult: 1.0,
    bounceMult: 1.0,
    endlessTopSpeed: false,
    firePower: +(0.6 + (r.fire ?? 5) * 0.08).toFixed(3),
    itemWeights: items || null,
  };
  if (extra) Object.assign(ship, extra);
  return ship;
}

Object.assign(CAR_TYPES, {
  tez:       mkShip('Tez', 'tez', { accel: 7, handling: 7, top: 6, armor: 6, fire: 7 },
               { missile: 5, machinegun: 10, mine: 8, ghoul: 3, boost: 5, repair: 3, shield: 5 }),
  kiph:      mkShip('Kiph', 'kiph', { accel: 5, handling: 7, top: 9, armor: 3, fire: 5 },
               { emp: 3, mine: 5, machinegun: 8, boost: 5, shield: 5, ball: 3, repair: 5 }),
  huntlen:   mkShip('Huntlen', 'huntlen', { accel: 6, handling: 8, top: 4, armor: 10, fire: 8 },
               { missile: 8, emp: 2, mine: 8, machinegun: 8, boost: 3, shield: 7, shell: 7 }),
  gleenixus: mkShip('Gleen Ixus', 'gleenixus', { accel: 7, handling: 4, top: 7, armor: 8, fire: 3 },
               { deathray: 2, drain: 5, oil: 5, ghoul: 2, machinegun: 4, boost: 9, shield: 4, missile: 7, repair: 1 }),
  scrynell:  mkShip('Scrynell', 'scrynell', { accel: 3, handling: 7, top: 10, armor: 5, fire: 7 },
               { ball: 7, drain: 6, mine: 6, machinegun: 10, repair: 4, boost: 3, missile: 4 }),
  exendios:  mkShip('Exen Dios', 'exendios', { accel: 6, handling: 5, top: 7, armor: 5, fire: 10 },
               { machinegun: 10, missile: 7, drain: 4, ghoul: 7, flipper: 3, deathray: 2 },
               { missileCount: 2 }),
  vurn:      mkShip('Vurn', 'vurn', { accel: 5, handling: 6, top: 5, armor: 9, fire: 6 },
               { mine: 8, shield: 8, emp: 6, machinegun: 5, repair: 6, missile: 4, boost: 3 }),
  kessa:     mkShip('Kessa', 'kessa', { accel: 6, handling: 10, top: 6, armor: 3, fire: 5 },
               { boost: 8, flipper: 7, ghoul: 5, oil: 6, repair: 5, mine: 4, emp: 4 }),
  draxil:    mkShip('Draxil', 'draxil', { accel: 8, handling: 5, top: 8, armor: 4, fire: 9 },
               { machinegun: 9, missile: 8, deathray: 3, drain: 5, mine: 5, boost: 6, shield: 3 }),
});

function getCarTypeCfg(typeId) {
  return CAR_TYPES[typeId] || CAR_TYPES.drifter;
}

// True for the original 9 "prototype" ships (gated behind the host lobby toggle).
function isPrototypeShip(typeId) {
  return !!(CAR_TYPES[typeId] && CAR_TYPES[typeId].prototype);
}

// Whether a ship can be selected right now: honors the host's allowed-car list and
// the prototype gate (G.allowPrototypes). Falls back safely before G exists.
function carTypeSelectable(typeId) {
  if (!CAR_TYPES[typeId]) return false;
  const allowedList = (typeof G !== 'undefined' && G.allowedCarTypes && G.allowedCarTypes.length) ? G.allowedCarTypes : Object.keys(CAR_TYPES);
  if (!allowedList.includes(typeId)) return false;
  const allowProto = (typeof G === 'undefined') || G.allowPrototypes !== false;
  if (isPrototypeShip(typeId) && !allowProto) return false;
  return true;
}

// The default ship to fall back to when the current pick becomes unavailable.
function firstSelectableCarType() {
  const keys = Object.keys(CAR_TYPES);
  return keys.find(carTypeSelectable) || keys.find(k => !isPrototypeShip(k)) || keys[0];
}

// A car's max health, scaled by its type's healthMult (defaults to full baseHealth).
function carMaxHealth(typeId) {
  return Math.round(CAR_TUNING.baseHealth * (getCarTypeCfg(typeId).healthMult || 1));
}

const SPEED_CLASSES = {
  junkyard: { label: 'Junkyard', scale: 0.7 },
  neighborhood: { label: 'Neighborhood', scale: 1.0 },
  city: { label: 'City', scale: 1.3 },
  freeway: { label: 'Freeway', scale: 2.0 },
  highway: { label: 'Highway', scale: 2.5 },
  speedway: { label: 'Speedway', scale: 4.0 },
  umbra: { label: 'Umbra', scale: 9.0 },
};

function speedClassScale(key) {
  return (SPEED_CLASSES[key] && SPEED_CLASSES[key].scale) || 1;
}

const POWERUPS_LIST = [
  { id:'boost', name:'Nitro', icon:'⚡', desc:'Massive speed surge for 3 sec', color:'#fbbf24' },
  { id:'shield', name:'Shield', icon:'🛡️', desc:'Block next obstacle hit', color:'#06b6d4' },
  { id:'missile', name:'Missile', icon:'🚀', desc:'Stun nearest opponent', color:'#ef4444' },
  { id:'mine', name:'Mine', icon:'🧨', desc:'Drop an explosive mine behind you', color:'#f97316' },
  { id:'pulse', name:'Pulse', icon:'💥', desc:'Blast nearby racers with a shockwave', color:'#fb7185' },
  { id:'oil', name:'Oil Slick', icon:'🛢️', desc:'Drop slippery trap behind you', color:'#64748b' },
  { id:'ghost', name:'Ghost', icon:'👻', desc:'Pass through obstacles for 4 sec', color:'#c084fc' },
  { id:'repair', name:'Patch Kit', icon:'🔧', desc:'Instantly restore 35 health', color:'#4ade80' },
  { id:'emp', name:'EMP', icon:'🌀', desc:'Shock & stall every racer nearby', color:'#38bdf8' },
  { id:'machinegun', name:'Machinegun', icon:'🔫', desc:'Rapid-fire burst of tracer rounds', color:'#cbd5e1' },
];
// Unique power-ups that only roll for a specific car type.
const CAR_UNIQUE_POWERUPS = {
  rotor: { id:'prop_replenish', name:'Prop Kit', icon:'🛠️', desc:'Instantly repair the propeller', color:'#22d3ee' },
  coil:  { id:'zap', name:'Zap', icon:'🔌', desc:'Discharge the battery into nearby racers', color:'#a78bfa' },
  holo:  { id:'flipper', name:'Flipper', icon:'🔄', desc:'Spins nearby ships around', color:'#f472b6' },
  puncher:  { id:'shell', name:'Shell', icon:'🐚', desc:'Bouncing shell that homes when a rival is close', color:'#9ca38f' },
  dragger:  { id:'drain', name:'Drain', icon:'🔋', desc:'Hold to aim; tether a rival and drain their health', color:'#22c55e' },
  screamer: { id:'ghoul', name:'Ghoul', icon:'👺', desc:'Sends a specter down the track, halving speeds', color:'#84cc16' },
  baller:   { id:'ball', name:'Ball', icon:'🎾', desc:'Erratic bouncing ball that disables control', color:'#f59e0b' },
  needle:   { id:'deathray', name:'Deathray', icon:'☄️', desc:'Spend 20 HP to fire a lethal beam for 5 sec', color:'#ef4444' },
};

// Flavor-only spec sheet for the Ships showcase window (fake future lore).
const SHIP_LORE = {
  drifter:  { special: 'Enhanced drift grip', desc: 'Balanced all-rounder with a strong natural drift for sweeping corners.', maker: 'Halcyon Dynamics', year: '2094', chassis: 'HX-Driftframe Mk.II', tagline: '“The one everybody learns on.”' },
  dragger:  { special: 'Shift velocity-lock mastery', desc: 'Straight-line specialist; holds the shift lock longer for huge top-end runs.', maker: 'Meridian Speedworks', year: '2091', chassis: 'Longbolt QD-9', tagline: '“Point it straight and pray.”' },
  puncher:  { special: 'Crash / weapon armor + shockwave', desc: 'Armored bruiser that shrugs off walls and weapons; Ability punches a shockwave that hurls nearby cars away.', maker: 'Ironhide Foundry', year: '2088', chassis: 'BR-Bulwark', tagline: '“Ram first. Ask never.”' },
  needle:   { special: 'Endless top speed + spikes', desc: 'Featherweight with no speed ceiling; Ability bristles spikes that hold its line and punish rammers.', maker: 'Zephyr Aeronautics', year: '2097', chassis: 'Filament-0', tagline: '“Terminal velocity is a suggestion.”' },
  baller:   { special: 'Inflate: one monster wall bounce', desc: 'Heavy wrecking ball; Ability balloons to double size and the next wall launches you insanely hard.', maker: 'Rebound Industries', year: '2090', chassis: 'OrbTank-5', tagline: '“Physics is a contact sport.”' },
  rotor:    { special: 'Propeller draft wake + Downdraft', desc: 'Builds a slipstream that slows cars behind it; must spin up from a stop. Wobbles harder the faster it goes.', maker: 'Cyclone Rotordyne', year: '2093', chassis: 'AeroVane-R', tagline: '“All thrust, questionable brakes.”' },
  coil:     { special: 'Wall-arc battery + arc storm', desc: 'Charges by hugging walls and braking; a full battery rockets its shift, but overcharge cooks your own HP.', maker: 'Voltaic Systems', year: '2095', chassis: 'Tesla-Loop', tagline: '“Danger is just stored energy.”' },
  screamer: { special: 'Blackout scream (long range)', desc: 'Honks to blast nearby rivals with a 10-second black-mask blackout.', maker: 'Decibel Motorsport', year: '2092', chassis: 'Wailbox-SR', tagline: '“Heard before it’s seen.”' },
  holo:     { special: 'On-demand ghost phase', desc: 'Briefly turns intangible to slip through cars, walls, and obstacles.', maker: 'Phantom Optics', year: '2099', chassis: 'Mirage-Ø', tagline: '“Now you don’t.”' },
  // Regular roster — six-stat racers with weighted item affinities.
  tez:       { special: 'Machinegun affinity', desc: 'Well-rounded skirmisher that showers the track with tracer fire.', maker: 'Terazi Motors', year: '2101', chassis: 'TZ-Vanguard', tagline: '“Jack of all, master of guns.”' },
  kiph:      { special: 'High top speed', desc: 'Long-legged runner built for open straights; light armor is the price.', maker: 'Kiphon Velocity', year: '2100', chassis: 'KP-Streak', tagline: '“Blink and it’s gone.”' },
  huntlen:   { special: 'Heavy armor + firepower', desc: 'Rolling fortress that trades top speed for sheer durability and payload.', maker: 'Huntlen Arms', year: '2098', chassis: 'HN-Bastion', tagline: '“Outlast, then out-gun.”' },
  gleenixus: { special: 'Boost hoarder', desc: 'Efficient cruiser that lives on nitro and utility drops over raw damage.', maker: 'Gleen Consortium', year: '2102', chassis: 'GX-Zephyr', tagline: '“Momentum is a resource.”' },
  scrynell:  { special: 'Top speed + machinegun', desc: 'Fragile flyweight with a blistering ceiling and a hail of bullets.', maker: 'Scrynell Racing', year: '2103', chassis: 'SC-Wisp', tagline: '“Speed answers everything.”' },
  exendios:  { special: 'Twin-missile firepower', desc: 'Weapons platform: max firepower and a double-missile salvo.', maker: 'Exen Dynamics', year: '2104', chassis: 'XD-Warden', tagline: '“Two locks, no mercy.”' },
  vurn:      { special: 'Armored all-rounder', desc: 'Sturdy control ship stacked with mines, shields and EMPs.', maker: 'Vurn Industrial', year: '2099', chassis: 'VR-Aegis', tagline: '“Steady wins the wreck.”' },
  kessa:     { special: 'Best-in-class handling', desc: 'Razor-sharp cornerer that dances through traffic on boost and tricks.', maker: 'Kessa Circuits', year: '2105', chassis: 'KS-Talon', tagline: '“Corners are just suggestions.”' },
  draxil:    { special: 'Firepower + speed', desc: 'Aggressive glass cannon: fast, heavily armed, thinly plated.', maker: 'Draxil Ordnance', year: '2103', chassis: 'DX-Reaver', tagline: '“Hit first. Hit hardest.”' },
};
const UPGRADES = [
  { id:'topspeed', name:'Top Speed +', icon:'🏎️', desc:'Permanently increases your max speed by 15%' },
  { id:'accel', name:'Acceleration +', icon:'🔥', desc:'Reach top speed faster, better out of corners' },
  { id:'handling', name:'Handling +', icon:'🎯', desc:'Tighter turning, less drift on bends' },
  { id:'luckbox', name:'Luck Box', icon:'🎲', desc:'Better items spawn — rarer power-ups appear' },
  { id:'armor', name:'Armor', icon:'🛡️', desc:'Obstacles slow you 30% less when hit' },
  { id:'draft', name:'Slipstream', icon:'💨', desc:'Go faster when close behind another racer' },
  { id:'regen', name:'Nanobots', icon:'♻️', desc:'Slowly repair your hull over time' },
  { id:'mag', name:'Magnet', icon:'🧲', desc:'Grab item boxes from much farther away' },
  { id:'overdrive', name:'Overdrive', icon:'⏱️', desc:'Nitro boosts last 50% longer' },
];
