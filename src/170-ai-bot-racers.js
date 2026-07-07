// ============================================================
// AI BOT RACERS — kinematic racing-line followers for solo play.
// Bots live inside G.players so rendering, leaderboard, engine audio,
// collisions (against the local car) and the podium all treat them as
// ordinary racers. They advance along the track spline with curvature-
// based speed control, light rubber-banding toward the human, random
// item usage, and full health/death/respawn handling.
// ============================================================
const BOT_ROSTER = [
  { name: 'VEX-9',      color: '#f97316' },
  { name: 'Mirage',     color: '#06b6d4' },
  { name: 'Krank',      color: '#ef4444' },
  { name: 'Nova',       color: '#fbbf24' },
  { name: 'Slipstream', color: '#22c55e' },
  { name: 'Byte',       color: '#e879f9' },
  { name: 'Tarmac',     color: '#94a3b8' },
  { name: 'Ghostline',  color: '#a855f7' },
];

function getBotCount() {
  const v = parseInt(localStorage.getItem('rr-bot-count'), 10);
  return Number.isFinite(v) && v >= 0 && v <= 7 ? v : 3;
}
function setBotCount(n) {
  try { localStorage.setItem('rr-bot-count', String(n)); } catch (_) {}
}

// Bot difficulty: bounded skill bands so bots are never faster than the ship
// stats allow — they're "equally capable players", not cheaters.
const BOT_DIFFICULTY = {
  easy:   { skillMin: 0.62, skillMax: 0.78, corner: 1.15, bandUp: 0.35, bandDown: 0.35, accel: 0.8 },
  medium: { skillMin: 0.78, skillMax: 0.92, corner: 1.0,  bandUp: 0.22, bandDown: 0.22, accel: 0.92 },
  hard:   { skillMin: 0.90, skillMax: 1.0,  corner: 0.88, bandUp: 0.1,  bandDown: 0.12, accel: 1.0 },
};
function getBotDifficulty() {
  const v = localStorage.getItem('rr-bot-difficulty');
  return BOT_DIFFICULTY[v] ? v : 'medium';
}
function setBotDifficulty(v) {
  try { if (BOT_DIFFICULTY[v]) localStorage.setItem('rr-bot-difficulty', v); } catch (_) {}
}

// Roll the item a bot receives from a box (mirrors the player's pickup roll, including
// the small chance at its class-unique power-up).
function botRollItem(b) {
  const chosen = POWERUPS_LIST[Math.floor(Math.random() * POWERUPS_LIST.length)];
  let id = chosen.id;
  // Autopilot is a no-op for bots (they already drive the line) — swap it for boost.
  if (id === 'autopilot') id = 'boost';
  const uniq = CAR_UNIQUE_POWERUPS[b.carType];
  if (uniq && Math.random() < 0.25) id = uniq.id;
  return id;
}

// A bot's coil-style discharge: zaps nearby racers (owner excluded), applied locally
// (solo bots) and broadcast for networked guests.
function botZap(b) {
  spawnExplosion(b.x, b.y, 70, 'pulse');
  const dmg = 18;
  Object.values(G.players).forEach(p => {
    if (p.id === b.id || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (b.layer || 0)) return;
    if (dist(b.x, b.y, p.x, p.y) <= CAR_TUNING.coilArcVictimRange * 1.5) {
      applyDamage(p, dmg / Math.max(0.5, getCarTypeCfg(p.carType).weaponResist || 1), 'arc');
      if (!p.isBot) p.wobble = Math.min(1, (p.wobble || 0) + 1.2);
    }
  });
  broadcast({ type: 'zap', id: b.id, x: b.x, y: b.y, layer: b.layer || 0, damage: dmg });
}

// A bot's holo flipper: spins nearby human racers 180° (bots keep their pathing).
function botFlip(b) {
  spawnExplosion(b.x, b.y, 60, 'pulse');
  Object.values(G.players).forEach(p => {
    if (p.id === b.id || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (b.layer || 0)) return;
    if (!p.isBot && dist(b.x, b.y, p.x, p.y) <= CAR_TUNING.holoFlipRange) {
      p.angle += Math.PI; p.vx = -(p.vx || 0); p.vy = -(p.vy || 0);
      p.speed = Math.hypot(p.vx, p.vy);
    }
  });
  broadcast({ type: 'flip', id: b.id, x: b.x, y: b.y, layer: b.layer || 0 });
}

// A bot's screamer honk: tunnel-vision + slow on the local human in range.
function botHonk(b) {
  spawnFxBurst(b.x, b.y, b.layer || 0, 'emp');
  Object.values(G.players).forEach(p => {
    if (p.id === b.id || p.finished || (p.layer || 0) !== (b.layer || 0)) return;
    if (dist(b.x, b.y, p.x, p.y) > CAR_TUNING.screamerHonkRange) return;
    p.tunnelVision = Math.max(p.tunnelVision || 0, CAR_TUNING.screamerHonkTunnelSec);
    p.screamSlow = Math.max(p.screamSlow || 0, CAR_TUNING.screamerHonkSlowSec);
    p.vx *= CAR_TUNING.screamerHonkInstantCut;
    p.vy *= CAR_TUNING.screamerHonkInstantCut;
    p.speed = Math.hypot(p.vx, p.vy);
    if (p.isBot) p._speed = (p._speed || 0) * CAR_TUNING.screamerHonkInstantCut;
  });
  broadcast({ type: 'honk', id: b.id, x: b.x, y: b.y, layer: b.layer || 0 });
}

// A bot's puncher shockwave: shoves nearby cars and obstacles away (front/back bonus).
function botShockwave(b) {
  const R = CAR_TUNING.puncherShockRadius;
  const fx = Math.cos(b.angle), fy = Math.sin(b.angle);
  spawnExplosion(b.x, b.y, R, 'pulse');
  spawnFxBurst(b.x, b.y, b.layer || 0, 'emp');
  Object.values(G.players).forEach(p => {
    if (p.id === b.id || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (b.layer || 0)) return;
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
    if (d > R || d < 1e-3) return;
    const nx = dx / d, ny = dy / d;
    const axis = Math.abs(nx * fx + ny * fy);
    const push = CAR_TUNING.puncherShockPush * (1 - d / R) * (1 + CAR_TUNING.puncherShockAxisBonus * axis);
    if (p.isBot) { p.x += nx * push * 0.12; p.y += ny * push * 0.12; p._speed = (p._speed || 0) * 0.45; }
    else { p.vx += nx * push; p.vy += ny * push; p.speed = Math.hypot(p.vx, p.vy); }
    applyDamage(p, CAR_TUNING.puncherShockDamage / Math.max(0.5, getCarTypeCfg(p.carType).crashResist || 1), 'shock');
  });
  if (G.track && G.track.obstacles) {
    for (let oi = 0; oi < G.track.obstacles.length; oi++) {
      const obs = G.track.obstacles[oi];
      if (!obs || obs.active === false || obstacleLayer(obs) !== (b.layer || 0)) continue;
      const dx = obs.x - b.x, dy = obs.y - b.y, d = Math.hypot(dx, dy);
      if (d > R || d < 1e-3) continue;
      const nx = dx / d, ny = dy / d;
      const push = CAR_TUNING.puncherShockPush * (1 - d / R);
      if (obs.type === 'cone') { obs.vx = (obs.vx || 0) + nx * push * 2.4; obs.vy = (obs.vy || 0) + ny * push * 2.4; }
      else if (obs.type === 'brick_wall') disableObstacle(oi, 14, true, { dirX: nx, dirY: ny, speed: push * 2 });
    }
  }
  broadcast({ type: 'shockwave', id: b.id, x: b.x, y: b.y, layer: b.layer || 0, angle: b.angle });
}

// Consume a bot's currently-held item with a direct, solo-safe effect.
function botUseItem(b) {
  const item = b.heldItem;
  if (!item) return;
  playItemUse(item);
  if (item === 'boost') { b.boosting = 2.6; return; }
  if (item === 'shield') { b.shieldTime = CAR_TUNING.shieldDuration; b.shielded = true; return; }
  if (item === 'ghost') { b.ghostMode = 4; return; }
  if (item === 'repair') {
    b.health = Math.min(b.maxHealth || CAR_TUNING.baseHealth, (b.health || 0) + 35);
    spawnFxBurst(b.x, b.y, b.layer || 0, 'heal');
    return;
  }
  if (item === 'prop_replenish') { b.propHealth = CAR_TUNING.rotorPropMaxHealth; b.propBroken = false; return; }
  if (item === 'oil') {
    const slick = { x: b.x - Math.cos(b.angle) * 30, y: b.y - Math.sin(b.angle) * 30, r: 25, t: 15 };
    if (G.track) G.track.oilSlicks.push(slick);
    broadcast({ type: 'oil_placed', slick });
    return;
  }
  if (item === 'mine') {
    const mine = {
      id: b.id + '_mine_' + Date.now(),
      x: b.x - Math.cos(b.angle) * 24, y: b.y - Math.sin(b.angle) * 24,
      ownerId: b.id, arm: 0.35, life: 12, r: 14, blastR: 92,
      damage: CAR_TUNING.mineDamage, layer: b.layer || 0,
    };
    G.mines.push(mine);
    broadcast({ type: 'mine_placed', mine });
    return;
  }
  if (item === 'missile') {
    let best = null, bd = Infinity;
    Object.values(G.players).forEach(p => {
      if (p.id === b.id || p.finished || (p.deathRespawn || 0) > 0) return;
      const d = dist(b.x, b.y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    });
    // Bots fire a pre-locked missile at the nearest rival if one is in lock range,
    // otherwise a free (bouncing) shot that may lock on its own.
    const locked = best && bd <= CAR_TUNING.missileLockRange;
    const missile = {
      id: b.id + '_' + Date.now(),
      x: b.x + Math.cos(b.angle) * 24, y: b.y + Math.sin(b.angle) * 24,
      vx: Math.cos(b.angle) * CAR_TUNING.missileSpeed, vy: Math.sin(b.angle) * CAR_TUNING.missileSpeed,
      angle: b.angle, speed: CAR_TUNING.missileSpeed, ownerId: b.id,
      targetId: locked ? best.id : null, lockT: 0, locked: !!locked,
      layer: b.layer || 0,
    };
    G.missiles.push(missile);
    broadcast({ type: 'missile_spawn', missile });
    return;
  }
  if (item === 'shell') {
    const shell = {
      id: b.id + '_shell_' + Date.now(),
      x: b.x + Math.cos(b.angle) * 24, y: b.y + Math.sin(b.angle) * 24,
      vx: Math.cos(b.angle) * CAR_TUNING.shellSpeed, vy: Math.sin(b.angle) * CAR_TUNING.shellSpeed,
      ownerId: b.id, layer: b.layer || 0,
    };
    if (!G.shells) G.shells = [];
    G.shells.push(shell);
    broadcast({ type: 'shell_spawn', shell });
    return;
  }
  if (item === 'ball') {
    const ball = {
      id: b.id + '_ball_' + Date.now(),
      x: b.x + Math.cos(b.angle) * 24, y: b.y + Math.sin(b.angle) * 24,
      vx: Math.cos(b.angle) * CAR_TUNING.ballSpeed, vy: Math.sin(b.angle) * CAR_TUNING.ballSpeed,
      ownerId: b.id, layer: b.layer || 0, phase: Math.random() * Math.PI * 2,
    };
    if (!G.balls) G.balls = [];
    G.balls.push(ball);
    broadcast({ type: 'ball_spawn', ball });
    return;
  }
  if (item === 'ghoul') {
    const near = pointOnTrack(b.x, b.y, G.track.spline);
    const ghoul = { id: b.id + '_ghoul_' + Date.now(), ownerId: b.id, idxF: near.idx, distLeft: CAR_TUNING.ghoulRange, layer: b.layer || 0 };
    if (!G.ghouls) G.ghouls = [];
    G.ghouls.push(ghoul);
    broadcast({ type: 'ghoul_spawn', ghoul });
    return;
  }
  if (item === 'deathray') {
    b.health = Math.max(1, (b.health || b.maxHealth || CAR_TUNING.baseHealth) - CAR_TUNING.needleDeathrayCost);
    b.deathray = CAR_TUNING.needleDeathrayDuration;
    return;
  }
  if (item === 'drain') {
    // Bots aim the drain straight ahead like fireDrainBeam, but resolve for a bot owner.
    const ax = Math.cos(b.angle), ay = Math.sin(b.angle), px = -ay, py = ax;
    const range = CAR_TUNING.drainAimRange, pickR = CAR_TUNING.drainAimPickRadius;
    let best = null, bestAlong = Infinity;
    Object.values(G.players).forEach(p => {
      if (p.id === b.id || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (b.layer || 0)) return;
      const dx = p.x - b.x, dy = p.y - b.y;
      const along = dx * ax + dy * ay;
      if (along < 0 || along > range) return;
      if (Math.abs(dx * px + dy * py) > pickR) return;
      if (along < bestAlong) { bestAlong = along; best = p; }
    });
    spawnFxBurst(b.x, b.y, b.layer || 0, 'emp');
    if (best) {
      best.drain = CAR_TUNING.drainDuration;
      best.drainedBy = b.id;
      broadcast({ type: 'drain_start', ownerId: b.id, targetId: best.id, duration: CAR_TUNING.drainDuration });
    }
    return;
  }
  if (item === 'pulse') {
    const pulse = { ownerId: b.id, x: b.x, y: b.y, radius: 100, damage: CAR_TUNING.pulseDamage, layer: b.layer || 0 };
    spawnExplosion(b.x, b.y, 100, 'pulse');
    applyPulseBlast(pulse);
    broadcast({ type: 'pulse_blast', ...pulse });
    return;
  }
  if (item === 'emp') {
    spawnExplosion(b.x, b.y, 150, 'emp');
    spawnFxBurst(b.x, b.y, b.layer || 0, 'emp');
    applyEmpBlast({ ownerId: b.id, x: b.x, y: b.y, layer: b.layer || 0 });
    broadcast({ type: 'emp_blast', ownerId: b.id, x: b.x, y: b.y, layer: b.layer || 0 });
    return;
  }
  if (item === 'zap') { botZap(b); return; }
  if (item === 'flipper') { botFlip(b); return; }
}

// Fire a bot's class ability. State-based abilities (ghost/inflate/spikes/arc storm/
// downdraft) are read by the victim-side logic just like the player's; one-shot
// abilities (honk/shockwave) resolve directly here.
function botUseAbility(b) {
  switch (b.carType) {
    case 'holo':     if ((b.ghostMode || 0) <= 0) { b.ghostMode = CAR_TUNING.holoGhostDuration; playItemUse('ghost'); } break;
    case 'baller':   if ((b.inflate || 0) <= 0) { b.inflate = CAR_TUNING.ballerInflateDuration; } break;
    case 'needle':   if ((b.spikes || 0) <= 0) { b.spikes = CAR_TUNING.needleSpikesDuration; } break;
    case 'coil':     if ((b.arcBurst || 0) <= 0 && (b.battery || 0) >= CAR_TUNING.coilArcBurstMinBattery) { b.arcBurst = CAR_TUNING.coilArcBurstDuration; } break;
    case 'rotor':    if ((b.downdraft || 0) <= 0 && !b.propBroken) { b.downdraft = CAR_TUNING.rotorDowndraftDuration; } break;
    case 'screamer': botHonk(b); break;
    case 'puncher':  botShockwave(b); break;
  }
}

// A bot clips an obstacle it drives over: scrub speed, take damage, shove cones, and
// knock loose bricks/snow. Bots are no longer immune to hazards.
function botCollideObstacles(b) {
  if (!G.track || !G.track.obstacles || (b.ghostMode || 0) > 0 || (b.invuln || 0) > 0) return;
  const layer = b.layer || 0;
  const cfg = getCarTypeCfg(b.carType);
  const dmg = (base) => base * CAR_TUNING.botObstacleDamageMult / Math.max(0.5, cfg.crashResist || 1);
  for (let oi = 0; oi < G.track.obstacles.length; oi++) {
    const obs = G.track.obstacles[oi];
    if (!obs || obs.active === false || obstacleLayer(obs) !== layer) continue;
    if (obs.type === 'ice_track' || obs.type === 'flowing_water') continue; // surfaces, not walls
    const hitR = (obs.r || 12) * (obs.scale || 1) + CAR_TUNING.botObstaclePad;
    if (dist(b.x, b.y, obs.x, obs.y) >= hitR) continue;
    if (b.shielded) { disableObstacle(oi, 10, true); continue; }
    if (obs.type === 'cone') {
      obs.vx = (obs.vx || 0) + (obs.x - b.x) * 3 + (b.vx || 0) * 0.3;
      obs.vy = (obs.vy || 0) + (obs.y - b.y) * 3 + (b.vy || 0) * 0.3;
      broadcastConePush(oi, obs);
      b._speed = (b._speed || 0) * 0.8;
      applyDamage(b, dmg(CAR_TUNING.obstacleDamage), 'cone');
    } else if (obs.type === 'brick_wall') {
      const spd = Math.max(60, b._speed || 0);
      b._speed = (b._speed || 0) * 0.4;
      applyDamage(b, dmg(CAR_TUNING.brickWallDamage), 'brick_wall');
      b.invuln = Math.max(b.invuln || 0, 0.6);
      disableObstacle(oi, 14, true, { dirX: Math.cos(b.angle), dirY: Math.sin(b.angle), speed: spd });
    } else if (obs.type === 'snow_pile') {
      b._speed = (b._speed || 0) * 0.82;
      applyDamage(b, dmg(CAR_TUNING.obstacleDamage), 'snow_pile');
      disableObstacle(oi, 12, true);
    } else {
      b._speed = (b._speed || 0) * CAR_TUNING.botObstacleSlow;
      applyDamage(b, dmg(CAR_TUNING.obstacleDamage), 'obstacle');
    }
  }
}

function spawnBots(count) {
  // Bots mirror the players: they only race ships that are currently unlocked in
  // the lobby (honors the host allowed-car list and the prototype gate). Prototypes
  // are off-limits unless `enableprototypes` has unlocked them.
  const selectable = Object.keys(CAR_TYPES).filter(carTypeSelectable);
  const pool = selectable.length ? selectable : [firstSelectableCarType()];
  for (let i = 0; i < count; i++) {
    const spec = BOT_ROSTER[i % BOT_ROSTER.length];
    const id = 'bot-' + (i + 1);
    const b = makePlayer(id, spec.name, spec.color, 0, 0, 0, pool[Math.floor(Math.random() * pool.length)]);
    b.isBot = true;
    // Pace multiplier from the selected difficulty band — always ≤ 1, so a bot
    // can never out-run what its ship's stats allow a human to do.
    const diff = BOT_DIFFICULTY[getBotDifficulty()] || BOT_DIFFICULTY.medium;
    b._skill = diff.skillMin + Math.random() * (diff.skillMax - diff.skillMin);
    b._diff = getBotDifficulty();
    b._latAmp = 8 + Math.random() * 16;          // how far they wander off the racing line
    b._latPhase = Math.random() * Math.PI * 2;
    b._apexBias = 0.7 + Math.random() * 0.7;     // how aggressively this bot cuts corners
    b._itemT = 0;                                // countdown to using a currently-held item
    b._abilityT = CAR_TUNING.botAbilityMinCd + Math.random() * (CAR_TUNING.botAbilityMaxCd - CAR_TUNING.botAbilityMinCd);
    G.players[id] = b;
  }
}

function _botTangentAt(sp, i) {
  const n = sp.length;
  const a = sp[((i % n) + n) % n], b = sp[(((i + 1) % n) + n) % n];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function botFinishLap(b) {
  b.lastLapTime = G.raceStartTime ? (Date.now() - G.raceStartTime) : 0;
  b.lap++;
  b.nextCheckpoint = 0;
  if (b.lap > G.totalLaps && !b.finished) {
    b.finished = true;
    b.vx = 0; b.vy = 0; b.speed = 0; b._speed = 0;
    b.finishTime = Date.now();
    b.finishElapsedMs = G.raceStartTime ? (Date.now() - G.raceStartTime) : 0;
    if (!G.finishOrder.includes(b.id)) G.finishOrder.push(b.id);
    addFeed(`🏁 ${b.name} finished P${G.finishOrder.length}`);
    checkRaceOver();
  }
}

function updateBots(dt) {
  if (!G.track || !Array.isArray(G.track.spline) || G.track.spline.length < 2) return;
  const sp = G.track.spline, n = sp.length;
  const speedScale = Math.max(0.2, G.speedScale || 1);
  const me = G.players[G.myId];

  framePlayers().forEach(b => {
    if (!b.isBot) return;
    b.invuln = Math.max(0, (b.invuln || 0) - dt);
    if ((b.boosting || 0) > 0) b.boosting -= dt;
    // Ability/item state timers so bot effects actually expire.
    if ((b.ghostMode || 0) > 0) b.ghostMode = Math.max(0, b.ghostMode - dt);
    if ((b.inflate || 0) > 0) b.inflate = Math.max(0, b.inflate - dt);
    if ((b.spikes || 0) > 0) b.spikes = Math.max(0, b.spikes - dt);
    if ((b.downdraft || 0) > 0) b.downdraft = Math.max(0, b.downdraft - dt);
    if ((b.arcBurst || 0) > 0) b.arcBurst = Math.max(0, b.arcBurst - dt);
    if ((b.ghoulSlow || 0) > 0) b.ghoulSlow = Math.max(0, b.ghoulSlow - dt);
    if ((b.noControl || 0) > 0) b.noControl = Math.max(0, b.noControl - dt);
    if ((b.shieldTime || 0) > 0) { b.shieldTime = Math.max(0, b.shieldTime - dt); b.shielded = b.shieldTime > 0; }
    else if (b.shielded) b.shielded = false;
    if (b.carType === 'coil') {
      // Bots can't hug walls to charge, so they trickle a battery to power the arc storm.
      b.battery = Math.min(CAR_TUNING.coilBatteryMax, (b.battery || 0) + 14 * dt);
      b.arcing = (b.arcBurst || 0) > 0 ? 1 : 0;
    }
    if ((b.deathRespawn || 0) > 0) {
      b.deathRespawn = Math.max(0, b.deathRespawn - dt);
      b.speed = 0; b.vx = 0; b.vy = 0; b._speed = 0;
      if (b.deathRespawn <= 0) {
        b.health = b.maxHealth || CAR_TUNING.baseHealth;
        b.invuln = CAR_TUNING.respawnInvuln;
      }
      return;
    }
    if (b.finished) { b.speed = 0; return; }
    if (b._idxF == null) b._idxF = pointOnTrack(b.x, b.y, sp).idx;

    const i0 = Math.floor(b._idxF) % n;
    // Corner reading: sample heading change ahead of the bot.
    const look = Math.max(4, Math.round(n * 0.02));
    const t0 = _botTangentAt(sp, i0);
    const t1 = _botTangentAt(sp, i0 + look);
    const t2 = _botTangentAt(sp, i0 + look * 2);
    const curv = Math.max(Math.abs(angleDiff(t0, t1)), Math.abs(angleDiff(t1, t2)) * 0.7);

    const cfg = getCarTypeCfg(b.carType);
    const diff = BOT_DIFFICULTY[b._diff] || BOT_DIFFICULTY.medium;
    // Ship-stat ceiling: exactly what a human in this ship gets. Nitro uses the
    // same player multiplier, and NOTHING below may push the target past it.
    const shipTop = CAR_TUNING.baseMaxSpeed * speedScale * cfg.topSpeedMult
      * ((b.boosting || 0) > 0 ? CAR_TUNING.boostSpeedMultiplier : 1);
    const vmax = shipTop * Math.min(1, b._skill || 1);
    let target = vmax * Math.max(0.34, Math.min(1, 1.06 - curv * 0.85 * diff.corner));
    if ((b.stun || 0) > 0) { b.stun -= dt; target = 0; }
    // Ghoul slow halves the bot's ceiling; Ball's control-loss stops it entirely.
    if ((b.ghoulSlow || 0) > 0) target = Math.min(target, CAR_TUNING.baseMaxSpeed * speedScale * CAR_TUNING.ghoulSlowMult);
    if ((b.noControl || 0) > 0) target = 0;
    // Rubber-banding: trailing bots push a little harder, leaders ease off —
    // but never past the ship's real top speed (no cheating, only catching up
    // to their own ceiling faster).
    if (me && !me.finished) {
      const myProg = (me.lap || 1) + (me.lapProgress || 0);
      const botProg = (b.lap || 1) + (b._idxF / n);
      const gap = myProg - botProg; // >0 means the bot is behind the human
      if (gap > 0.25) target *= 1 + Math.min(0.6, gap) * diff.bandUp;
      else if (gap < -0.25) target *= Math.max(0.7, 1 + gap * diff.bandDown);
      target = Math.min(target, vmax);
    }

    // Acceleration from the ship's own stats (difficulty trims it, never boosts it).
    const accel = CAR_TUNING.baseAccel * speedScale * (cfg.accelMult || 1) * 1.6 * diff.accel;
    const cur = b._speed || 0;
    b._speed = cur < target
      ? Math.min(target, cur + accel * dt)
      : Math.max(target, cur - accel * 1.7 * dt);

    // Advance along the spline by real arc length (spline spacing is uneven).
    let remaining = b._speed * dt;
    let guard = 0;
    while (remaining > 0 && guard++ < 32 && !b.finished) {
      const ia = Math.floor(b._idxF) % n;
      const ib = (ia + 1) % n;
      const segLen = Math.max(2, dist(sp[ia].x, sp[ia].y, sp[ib].x, sp[ib].y));
      const fr = b._idxF - Math.floor(b._idxF);
      const remSeg = (1 - fr) * segLen;
      if (remaining >= remSeg) {
        remaining -= remSeg;
        b._idxF = Math.floor(b._idxF) + 1;
        if (b._idxF >= n) { b._idxF -= n; botFinishLap(b); }
      } else {
        b._idxF += remaining / segLen;
        remaining = 0;
      }
    }
    if (b.finished) return;

    // Resolve world position: apex-seeking racing line + light wander on straights.
    const ia = Math.floor(b._idxF) % n, ib = (ia + 1) % n;
    const fr = b._idxF - Math.floor(b._idxF);
    const px = lerp(sp[ia].x, sp[ib].x, fr), py = lerp(sp[ia].y, sp[ib].y, fr);
    let tx = sp[ib].x - sp[ia].x, ty = sp[ib].y - sp[ia].y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    b._latPhase += dt * (0.35 + b._skill * 0.3);
    const maxOff = Math.max(10, trackHalfWidthAtIdx(ia) * 0.62);
    // Racing line: bias toward the inside of the corner (apex), harder on tighter bends
    // and per-bot personality; fall back to a gentle wander on the straights so no two
    // bots trace the same path. The (-ty, tx) normal points to the inside of a corner
    // whose heading turns positively, so insideSign selects the correct side.
    const turnDir = angleDiff(t0, t2);
    const cornerAmt = Math.max(0, Math.min(1, Math.abs(turnDir) * 2.4));
    const insideSign = turnDir >= 0 ? 1 : -1;
    let off = insideSign * cornerAmt * maxOff * CAR_TUNING.botApexPull * b._apexBias;
    off += Math.sin(b._latPhase) * b._latAmp * CAR_TUNING.botLineWanderMult * (1 - cornerAmt);
    off = Math.max(-maxOff, Math.min(maxOff, off));
    const targetX = px + (-ty) * off, targetY = py + tx * off;
    const k = 1 - Math.exp(-dt / 0.10);
    b.x = lerp(b.x, targetX, k);
    b.y = lerp(b.y, targetY, k);
    const desired = Math.atan2(ty, tx);
    b.angle += angleDiff(b.angle, desired) * Math.min(1, dt * 6);
    b.vx = tx * b._speed; b.vy = ty * b._speed;
    b.speed = b._speed;
    b.lapProgress = b._idxF / n;
    b.layer = supportFloorAtSplineIdx(ia);

    // Bots are no longer immune to hazards: clip obstacles that lie on their line.
    botCollideObstacles(b);

    // Corner drift dust so bots feel alive at speed.
    if (curv > 0.3 && b._speed > 140 * speedScale && Math.random() < 0.5) {
      spawnDriftTrail(
        b.x - tx * CAR_H * 0.45 + (-ty) * (Math.random() - 0.5) * CAR_W,
        b.y - ty * CAR_H * 0.45 + tx * (Math.random() - 0.5) * CAR_W,
        b.vx, b.vy, b.layer || 0
      );
    }

    // Checkpoints (display only — bots follow the track, so proximity suffices).
    // Honour linked gates: passing near ANY gate in the current link group clears it.
    if (G.track.checkpoints && G.track.checkpoints.length && (b.nextCheckpoint || 0) < G.track.checkpoints.length) {
      const cps = G.track.checkpoints;
      const start = b.nextCheckpoint || 0;
      const groupEnd = checkpointGroupEnd(cps, start);
      for (let ci = start; ci < groupEnd; ci++) {
        const cp = cps[ci];
        if (cp && dist(b.x, b.y, cp.x, cp.y) < (cp.halfW || TRACK_W) * 1.5) {
          b.nextCheckpoint = groupEnd;
          b.lastCheckpointTime = G.raceStartTime ? (Date.now() - G.raceStartTime) : 0;
          break;
        }
      }
    }
    // Power-ups: bots physically grab item boxes they pass, hold them briefly, then use
    // them — so they no longer have an infinite supply of items.
    if (!b.heldItem) {
      const items = G.track.items || [];
      const pickR = CAR_TUNING.botItemPickRadius;
      for (let ii = 0; ii < items.length; ii++) {
        const box = items[ii];
        if (!box || box.active === false) continue;
        if (dist(b.x, b.y, box.x, box.y) < pickR) {
          b.heldItem = botRollItem(b);
          b._itemT = CAR_TUNING.botItemUseMin + Math.random() * (CAR_TUNING.botItemUseMax - CAR_TUNING.botItemUseMin);
          spawnFxBurst(box.x, box.y, b.layer || 0, 'pickup');
          disableItem(ii, CAR_TUNING.powerupRespawnSec, true);
          break;
        }
      }
    } else if ((b.stun || 0) <= 0) {
      b._itemT -= dt;
      if (b._itemT <= 0) { botUseItem(b); b.heldItem = null; }
    }

    // Class ability: bots fire it on a personality timer (needs charge for the coil).
    b._abilityT -= dt;
    if (b._abilityT <= 0 && (b.stun || 0) <= 0) {
      b._abilityT = CAR_TUNING.botAbilityMinCd + Math.random() * (CAR_TUNING.botAbilityMaxCd - CAR_TUNING.botAbilityMinCd);
      if (Math.random() < CAR_TUNING.botAbilityUseChance) botUseAbility(b);
    }
  });
}
