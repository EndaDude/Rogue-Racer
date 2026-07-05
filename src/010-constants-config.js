// ============================================================
// CONSTANTS & CONFIG
// ============================================================
// Game (HTML) version. This ships independently of the desktop app via the
// self-updating loader, so bump it whenever you publish a game update; it shows
// on the terminal so you can confirm which build actually loaded.
const GAME_VERSION = '0.1.6';
const TOTAL_LAPS = 3;
const PLAYER_COLORS = ['#a855f7','#06b6d4','#fbbf24','#22c55e','#ef4444','#f97316'];
const CAR_W = 14, CAR_H = 22;
const TRACK_W = 80; // track half-width
// Car handling/speed tuning in one place.
const CAR_TUNING = {
  baseMaxSpeed: 200,
  maxReverseSpeed: 80,
  baseAccel: 90,
  baseBrake: 50,
  baseFriction: 120,
  baseAirFriction: 30,
  baseTurnRate: 1,
  reverseAccelScale: 0.7,
  steerMinSpeedRef: 28,
  steeringGripPenalty: 0.35,
  longDrag: 0.16,
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
  driftSteerBoost: 1.18,
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
};


const CAR_TYPES = {
  drifter: {
    name: 'Drifter',
    shape: 'drifter',
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
    accelMult: 3.0,
    topSpeedMult: 0.75,
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

function getCarTypeCfg(typeId) {
  return CAR_TYPES[typeId] || CAR_TYPES.drifter;
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
