// ============================================================
// PROCEDURAL SOUND EFFECTS
// Lightweight Web Audio synths for gameplay feedback (no asset files).
// ============================================================
function fxGain() { return Math.max(0, AUDIO_SETTINGS.fx * AUDIO_SETTINGS.master); }

let _sfxNoiseBuffer = null;
function getSfxNoiseBuffer() {
  if (_sfxNoiseBuffer) return _sfxNoiseBuffer;
  const len = Math.floor(audioCtx.sampleRate * 1.0);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _sfxNoiseBuffer = buf;
  return buf;
}

// One-shot tone with an exponential pluck/decay envelope.
function playSweep(f1, f2, dur, type, peakMul) {
  if (!audioCtx) return;
  const g = fxGain();
  if (g <= 0) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(20, f1), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
    const og = audioCtx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(Math.max(0.0002, g * (peakMul || 0.3)), now + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(og); og.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + dur + 0.03);
  } catch (_) {}
}

// Wall / obstacle impact: low thud + filtered noise burst, scaled by impact strength.
let _lastWallHitAt = 0;
function playWallHit(intensity) {
  if (!audioCtx) return;
  const g = fxGain();
  if (g <= 0) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    if (now - _lastWallHitAt < 0.07) return; // debounce rapid grinds
    _lastWallHitAt = now;
    const vol = Math.max(0.08, Math.min(1, intensity || 0.5)) * g * 0.55;
    // Low thud
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.18);
    const og = audioCtx.createGain();
    og.gain.setValueAtTime(vol, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(og); og.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.24);
    // Noise impact
    const src = audioCtx.createBufferSource();
    src.buffer = getSfxNoiseBuffer();
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1100 + intensity * 900;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(vol * 0.85, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    src.connect(flt); flt.connect(ng); ng.connect(audioCtx.destination);
    src.start(now); src.stop(now + 0.15);
  } catch (_) {}
}

// Powerup pickup: bright ascending arpeggio chime.
function playPowerupPickup() {
  if (!audioCtx) return;
  const g = fxGain();
  if (g <= 0) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      const t = now + i * 0.06;
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const og = audioCtx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(g * 0.34, t + 0.018);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(og); og.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.22);
    });
  } catch (_) {}
}

// Powerup activation: a flavor per item type.
function playItemUse(item) {
  switch (item) {
    case 'boost':   playSweep(300, 920, 0.34, 'sawtooth', 0.32); break;
    case 'shield':  playSweep(420, 680, 0.40, 'sine', 0.32); break;
    case 'ghost':   playSweep(900, 1500, 0.50, 'sine', 0.22); break;
    case 'oil':     playSweep(260, 90, 0.30, 'triangle', 0.30); break;
    case 'mine':    playSweep(220, 70, 0.28, 'square', 0.26); break;
    case 'pulse':   playSweep(120, 760, 0.30, 'sawtooth', 0.36); break;
    case 'missile': playSweep(760, 220, 0.42, 'sawtooth', 0.32); break;
    case 'shell':   playSweep(520, 180, 0.40, 'square', 0.30); break;
    case 'ball':    playSweep(300, 540, 0.34, 'sine', 0.30); break;
    case 'ghoul':   playSweep(160, 60, 0.55, 'triangle', 0.34); break;
    case 'deathray':playSweep(1400, 400, 0.55, 'sawtooth', 0.30); break;
    case 'drain':   playSweep(200, 900, 0.40, 'sine', 0.30); break;
    case 'machinegun': playSweep(1000, 480, 0.05, 'square', 0.20); break;
    default:        playSweep(420, 820, 0.30, 'sawtooth', 0.30);
  }
}

// Ice sliding: a sustained shimmery band-passed noise, gain/brightness driven each frame.
let iceSlide = null;
function ensureIceSlide() {
  if (iceSlide || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = getSfxNoiseBuffer();
    src.loop = true;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 5000;
    flt.Q.value = 0.7;
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    src.connect(flt); flt.connect(gain); gain.connect(audioCtx.destination);
    src.start(0);
    iceSlide = { src, gain, flt };
  } catch (_) {}
}
function setIceSlide(amount) {
  const g = fxGain();
  if (g <= 0 || !(amount > 0.001)) {
    if (iceSlide) { try { iceSlide.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.06); } catch (_) {} }
    return;
  }
  ensureIceSlide();
  if (!iceSlide) return;
  const a = Math.min(1, amount);
  try {
    iceSlide.gain.gain.setTargetAtTime(a * g * 0.2, audioCtx.currentTime, 0.05);
    iceSlide.flt.frequency.setTargetAtTime(4200 + a * 4200, audioCtx.currentTime, 0.1);
  } catch (_) {}
}
function stopIceSlide() {
  stopDriftScreech();
  if (!iceSlide) return;
  try { iceSlide.src.stop(); } catch (_) {}
  try { iceSlide.src.disconnect(); iceSlide.flt.disconnect(); iceSlide.gain.disconnect(); } catch (_) {}
  iceSlide = null;
}

// Tire screech while drifting — same looped-noise recipe as the ice slide but
// bandpassed much lower, pitch rising with slip intensity.
let driftScreech = null;
function ensureDriftScreech() {
  if (driftScreech || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = getSfxNoiseBuffer();
    src.loop = true;
    const flt = audioCtx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 900;
    flt.Q.value = 1.4;
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    src.connect(flt); flt.connect(gain); gain.connect(audioCtx.destination);
    src.start(0);
    driftScreech = { src, gain, flt };
  } catch (_) {}
}
function setDriftScreech(amount) {
  const g = fxGain();
  if (g <= 0 || !(amount > 0.001)) {
    if (driftScreech) { try { driftScreech.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.07); } catch (_) {} }
    return;
  }
  ensureDriftScreech();
  if (!driftScreech) return;
  const a = Math.min(1, amount);
  try {
    driftScreech.gain.gain.setTargetAtTime(a * g * 0.13, audioCtx.currentTime, 0.05);
    driftScreech.flt.frequency.setTargetAtTime(650 + a * 750, audioCtx.currentTime, 0.08);
  } catch (_) {}
}
function stopDriftScreech() {
  if (!driftScreech) return;
  try { driftScreech.src.stop(); } catch (_) {}
  try { driftScreech.src.disconnect(); driftScreech.flt.disconnect(); driftScreech.gain.disconnect(); } catch (_) {}
  driftScreech = null;
}

function spawnResetSmoke() {
  const W = canvas.width, H = canvas.height;
  const barW = Math.min(W * 0.6, 680);
  const spread = barW * (0.35 + 0.65 * resetHold.charge);
  resetHold.particles.push({
    x: W / 2 + (Math.random() - 0.5) * spread,
    y: H - 44 + (Math.random() - 0.5) * 8,
    vx: (Math.random() - 0.5) * 34,
    vy: -(28 + Math.random() * 70) * (0.55 + 0.7 * resetHold.charge),
    r: 4 + Math.random() * 6,
    life: 0.5 + Math.random() * 0.55,
    maxLife: 1.05,
    g: 120 + Math.floor(Math.random() * 60),
  });
  if (resetHold.particles.length > 220) {
    resetHold.particles.splice(0, resetHold.particles.length - 220);
  }
}

function triggerResetExplosion(me) {
  spawnExplosion(me.x, me.y, CAR_TUNING.deathExplosionRadius, 'death');
  addScreenShake(CAR_TUNING.deathExplosionShake, 0.4);
  broadcast({ type: 'death_explosion', x: me.x, y: me.y, radius: CAR_TUNING.deathExplosionRadius, layer: me.layer || 0, id: me.id, cause: 'reset' });
  me.deathRespawn = CAR_TUNING.deathRespawnTime;
  me.invuln = CAR_TUNING.respawnInvuln;
  me.vx = 0; me.vy = 0; me.speed = 0;
  resetHold.charge = 0;
  resetHold.smokeTimer = 0;
  stopResetNoise();
}

function updateResetHold(dt) {
  const me = G.players[G.myId];
  const canReset = !!me && !me.finished && G.raceStarted && !G.raceOver && (me.deathRespawn || 0) <= 0;
  const holding = canReset && kbHeld('reset');
  resetHold.active = holding;

  if (holding) {
    startResetNoise();
    resetHold.charge = Math.min(1, resetHold.charge + dt / RESET_HOLD_TIME);
  } else {
    resetHold.charge = Math.max(0, resetHold.charge - dt / RESET_RELEASE_TIME);
    if (resetHold.charge <= 0) stopResetNoise();
  }

  // Bar slides in while holding or while still rewinding, drops once fully spent.
  const barTarget = (holding || resetHold.charge > 0) ? 1 : 0;
  resetHold.bar += (barTarget - resetHold.bar) * Math.min(1, dt * 9);
  if (resetHold.bar < 0.002 && barTarget === 0) resetHold.bar = 0;

  // White noise rises from silence (eased so it starts truly quiet).
  if (resetNoise) {
    resetNoise.gain.gain.value = Math.min(0.32, resetHold.charge * resetHold.charge * 0.32);
  }

  // Smoke vents faster as the charge climbs.
  if (resetHold.charge > 0.04) {
    resetHold.smokeTimer -= dt;
    const interval = lerp(0.085, 0.014, resetHold.charge);
    let guard = 0;
    while (resetHold.smokeTimer <= 0 && guard++ < 8) {
      resetHold.smokeTimer += interval;
      spawnResetSmoke();
    }
  }

  // Detonate at full charge.
  if (resetHold.charge >= 1 && me) triggerResetExplosion(me);

  // Advance smoke particles.
  for (let i = resetHold.particles.length - 1; i >= 0; i--) {
    const p = resetHold.particles[i];
    p.life -= dt;
    if (p.life <= 0) { resetHold.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.max(0, 1 - 0.5 * dt);
    p.vy *= Math.max(0, 1 - 0.6 * dt);
    p.r *= (1 + 1.05 * dt);
  }
}

function drawResetBar(ctx, W, H) {
  if (resetHold.bar <= 0.001 && resetHold.particles.length === 0) return;
  const c = resetHold.charge;
  const barW = Math.min(W * 0.6, 680);
  const barH = 18;
  const margin = 26;
  const slide = (1 - resetHold.bar) * (barH + margin + 24);
  const x = (W - barW) / 2;
  const y = H - margin - barH + slide;

  const shakeMag = c * c * 7;
  const sx = (Math.random() - 0.5) * shakeMag;
  const sy = (Math.random() - 0.5) * shakeMag;

  ctx.save();
  ctx.translate(sx, sy);

  // Smoke (behind the bar).
  ctx.save();
  resetHold.particles.forEach(p => {
    const a = Math.max(0, p.life / p.maxLife) * 0.5;
    const rr = Math.min(255, p.g + 95 * c) | 0;
    const gg = (p.g * (1 - 0.55 * c)) | 0;
    const bb = (p.g * (1 - 0.62 * c)) | 0;
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${a})`;
    ctx.beginPath();
    ctx.arc(p.x - sx, p.y - sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Track / backplate.
  ctx.fillStyle = 'rgba(10,10,16,0.72)';
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, barW + 6, barH + 6, 7);
  ctx.fill();

  // Fill — white -> red as it charges.
  const rC = Math.round(lerp(236, 226, c));
  const gC = Math.round(lerp(238, 38, c));
  const bC = Math.round(lerp(242, 38, c));
  const fillW = Math.max(0, barW * c);
  ctx.fillStyle = `rgb(${rC},${gC},${bC})`;
  ctx.beginPath();
  ctx.roundRect(x, y, fillW, barH, 4);
  ctx.fill();

  // Outline.
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, barW, barH, 4);
  ctx.stroke();

  // Label.
  ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * c})`;
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c >= 0.985 ? 'RESETTING…' : 'HOLD R TO RESET', W / 2, y + barH / 2);

  ctx.restore();
}

// Dragger Drain: pick the closest rival lying on the aim line projected from the
// nose, then tether them for a health-draining beam. The aim line itself is local.
function fireDrainBeam(me) {
  if (!me || !G.track) return;
  const ax = Math.cos(me.angle), ay = Math.sin(me.angle);
  const px = -ay, py = ax;
  const range = CAR_TUNING.drainAimRange, pickR = CAR_TUNING.drainAimPickRadius;
  let best = null, bestAlong = Infinity;
  Object.values(G.players).forEach(p => {
    if (p.id === me.id || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (me.layer || 0)) return;
    const dx = p.x - me.x, dy = p.y - me.y;
    const along = dx * ax + dy * ay;
    if (along < 0 || along > range) return;
    if (Math.abs(dx * px + dy * py) > pickR) return;
    if (along < bestAlong) { bestAlong = along; best = p; }
  });
  spawnFxBurst(me.x, me.y, me.layer || 0, 'emp');
  playItemUse('drain');
  if (!best) return; // whiffed the aim
  best.drain = CAR_TUNING.drainDuration;
  best.drainedBy = me.id;
  broadcast({ type: 'drain_start', ownerId: me.id, targetId: best.id, duration: CAR_TUNING.drainDuration });
}

// Item button press: the Drain charges a hold-to-aim beam; everything else fires now.
function itemButtonDown() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished) return;
  if (me.heldItem === 'drain') { G.aimingDrain = true; return; }
  useItem();
}
// Item button release: fire the aimed Drain (consuming the item) if we were aiming.
function itemButtonUp() {
  if (!G.aimingDrain) return;
  G.aimingDrain = false;
  const me = G.players[G.myId];
  if (!me || me.heldItem !== 'drain') return;
  me.heldItem = null;
  G.heldItem = null;
  updatePowerupHud();
  fireDrainBeam(me);
}

// Weighted item roll for ships that define an `itemWeights` drop pool (id -> weight).
// Only listed items can drop; higher weight = more likely. Luck Box nudges rare
// (low-weight) items up so the fancy stuff shows more often.
function rollWeightedItem(weights, lucky) {
  const entries = [];
  let total = 0;
  for (const id in weights) {
    let w = weights[id];
    if (!(w > 0)) continue;
    if (lucky && w <= 3) w *= 1.6;
    entries.push([id, w]); total += w;
  }
  if (!entries.length || total <= 0) return 'boost';
  let r = Math.random() * total;
  for (const [id, w] of entries) { if ((r -= w) <= 0) return id; }
  return entries[entries.length - 1][0];
}

// Spawn one machinegun tracer round from an owner ship. FIREPOWER is baked into the
// round's damage at spawn so the victim-authoritative hit needs no extra lookup.
function spawnBullet(owner) {
  const cfg = getCarTypeCfg(owner.carType);
  const ang = owner.angle + (Math.random() - 0.5) * CAR_TUNING.machinegunSpread;
  const bSpeed = CAR_TUNING.bulletSpeed * Math.max(0.2, G.speedScale || 1);
  const bullet = {
    id: owner.id + '_b_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    x: owner.x + Math.cos(owner.angle) * 26,
    y: owner.y + Math.sin(owner.angle) * 26,
    vx: Math.cos(ang) * bSpeed,
    vy: Math.sin(ang) * bSpeed,
    ownerId: owner.id,
    layer: owner.layer || 0,
    dmg: CAR_TUNING.bulletDamage * (cfg.firePower || 1),
  };
  G.bullets.push(bullet);
  broadcast({ type: 'bullet_spawn', bullet });
}

// Emit any in-progress machinegun burst for the local player, one round per interval.
function updateMachinegunBurst(dt) {
  const me = G.players[G.myId];
  if (!me || !me._mgBurst) return;
  const b = me._mgBurst;
  b.t -= dt;
  while (b.left > 0 && b.t <= 0) {
    if (!me.finished && (me.deathRespawn || 0) <= 0) { spawnBullet(me); playItemUse('machinegun'); }
    b.left--;
    b.t += CAR_TUNING.machinegunInterval;
  }
  if (b.left <= 0) me._mgBurst = null;
}

function useItem() {
  const me = G.players[G.myId];
  if (!me || !me.heldItem || !G.raceStarted) return;
  const item = me.heldItem;
  me.heldItem = null;
  G.heldItem = null;
  if (G._rouletteTimer) { clearInterval(G._rouletteTimer); G._rouletteTimer = null; }
  if (G.raceStats) G.raceStats.itemsUsed++;
  updatePowerupHud();
  playItemUse(item);
  const effect = { type:'item_used', id:G.myId, item };
  if (item === 'boost') { me.boosting = (me.upgrades || []).includes('overdrive') ? 4.5 : 3; }
  else if (item === 'shield') { me.shieldTime = CAR_TUNING.shieldDuration; me.shielded = true; }
  else if (item === 'autopilot') { me.autopilot = CAR_TUNING.autopilotDuration; }
  else if (item === 'ghost') { me.ghostMode = 4; }
  else if (item === 'repair') {
    me.health = Math.min(me.maxHealth || CAR_TUNING.baseHealth, (me.health || 0) + 35);
    spawnFxBurst(me.x, me.y, me.layer || 0, 'heal');
    return; // purely local — no effect broadcast needed
  } else if (item === 'emp') {
    spawnExplosion(me.x, me.y, 150, 'emp');
    addScreenShake(6, 0.18);
    spawnFxBurst(me.x, me.y, me.layer || 0, 'emp');
    applyEmpBlast({ ownerId: G.myId, x: me.x, y: me.y, layer: me.layer || 0 });
    broadcast({ type:'emp_blast', ownerId: G.myId, x: me.x, y: me.y, layer: me.layer || 0 });
    return;
  }
  else if (item === 'oil') {
    const slick = { x:me.x-Math.cos(me.angle)*30, y:me.y-Math.sin(me.angle)*30, r:25, t:15 };
    if (G.track) G.track.oilSlicks.push(slick);
    broadcast({ type:'oil_placed', slick });
  } else if (item === 'mine') {
    const mine = {
      id: G.myId + '_mine_' + Date.now(),
      x: me.x - Math.cos(me.angle) * 24,
      y: me.y - Math.sin(me.angle) * 24,
      ownerId: G.myId,
      arm: 0.35,
      life: 12,
      r: 14,
      blastR: 92,
      damage: CAR_TUNING.mineDamage,
      layer: me.layer || 0,
    };
    G.mines.push(mine);
    broadcast({ type:'mine_placed', mine });
    return;
  } else if (item === 'pulse') {
    const pulse = {
      ownerId: G.myId,
      x: me.x,
      y: me.y,
      radius: 100,
      damage: CAR_TUNING.pulseDamage,
      layer: me.layer || 0,
    };
    applyPulseBlast(pulse);
    broadcast({ type:'pulse_blast', ...pulse });
    return;
  } else if (item === 'missile') {
    // Reworked missile: fired blind. It flies at constant speed, bouncing off the
    // track walls, and only starts hunting once it has held a rival in range long
    // enough to lock. A locked missile navigates the track to reach its target.
    // Some ships (e.g. Exen Dios) fire a spread salvo; FIREPOWER scales the payload.
    const mgCfg = getCarTypeCfg(me.carType);
    const count = Math.max(1, mgCfg.missileCount || 1);
    const fp = mgCfg.firePower || 1;
    const spread = 0.16; // radians between salvo missiles
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * spread : 0;
      const ang = me.angle + off;
      const missile = {
        id: G.myId + '_' + Date.now() + '_' + i,
        x: me.x + Math.cos(ang) * 24,
        y: me.y + Math.sin(ang) * 24,
        vx: Math.cos(ang) * CAR_TUNING.missileSpeed,
        vy: Math.sin(ang) * CAR_TUNING.missileSpeed,
        angle: ang,
        speed: CAR_TUNING.missileSpeed,
        ownerId: G.myId,
        targetId: null,
        lockT: 0,
        locked: false,
        layer: me.layer || 0,
        dmg: CAR_TUNING.missileDamage * fp,
      };
      G.missiles.push(missile);
      broadcast({ type: 'missile_spawn', missile });
    }
    return; // missile is a projectile — no item_used broadcast
  } else if (item === 'machinegun') {
    // Machinegun: queue a short rapid-fire burst; rounds are emitted from
    // updateMachinegunBurst() each frame so they stream out over time.
    me._mgBurst = { left: CAR_TUNING.machinegunBurst, t: 0 };
    return;
  } else if (item === 'shell') {
    // Puncher Shell: a heavy shell that bounces off walls; homes only when a rival
    // strays within range.
    const shell = {
      id: G.myId + '_shell_' + Date.now(),
      x: me.x + Math.cos(me.angle) * 24,
      y: me.y + Math.sin(me.angle) * 24,
      vx: Math.cos(me.angle) * CAR_TUNING.shellSpeed,
      vy: Math.sin(me.angle) * CAR_TUNING.shellSpeed,
      ownerId: G.myId,
      layer: me.layer || 0,
    };
    G.shells.push(shell);
    broadcast({ type: 'shell_spawn', shell });
    return;
  } else if (item === 'ball') {
    // Baller Ball: an erratic bouncing ball; a hit disables control for a while.
    const ball = {
      id: G.myId + '_ball_' + Date.now(),
      x: me.x + Math.cos(me.angle) * 24,
      y: me.y + Math.sin(me.angle) * 24,
      vx: Math.cos(me.angle) * CAR_TUNING.ballSpeed,
      vy: Math.sin(me.angle) * CAR_TUNING.ballSpeed,
      ownerId: G.myId,
      layer: me.layer || 0,
      phase: Math.random() * Math.PI * 2,
    };
    G.balls.push(ball);
    broadcast({ type: 'ball_spawn', ball });
    return;
  } else if (item === 'ghoul') {
    // Screamer Ghoul: a specter that rides the track ahead, halving speeds it passes.
    const near = pointOnTrack(me.x, me.y, G.track.spline);
    const ghoul = {
      id: G.myId + '_ghoul_' + Date.now(),
      ownerId: G.myId,
      idxF: near.idx,
      distLeft: CAR_TUNING.ghoulRange,
      layer: me.layer || 0,
    };
    G.ghouls.push(ghoul);
    broadcast({ type: 'ghoul_spawn', ghoul });
    return;
  } else if (item === 'deathray') {
    // Needle Engine Deathray: spend health to light a lethal forward beam for 5 sec.
    me.health = Math.max(1, (me.health || me.maxHealth || CAR_TUNING.baseHealth) - CAR_TUNING.needleDeathrayCost);
    me.deathray = CAR_TUNING.needleDeathrayDuration;
    addScreenShake(5, 0.18);
    return;
  } else if (item === 'drain') {
    // Fallback if fired without the hold-to-aim path (e.g. instant tap): aim straight.
    fireDrainBeam(me);
    return;
  } else if (item === 'prop_replenish') {
    me.propHealth = CAR_TUNING.rotorPropMaxHealth;
    me.propBroken = false;
    return;
  } else if (item === 'zap') {
    const power = Math.max(0.4, Math.min(1.4, (me.battery || 0) / CAR_TUNING.coilBatteryMax + 0.4));
    me.battery = 0;
    spawnExplosion(me.x, me.y, 70, 'pulse');
    addScreenShake(5, 0.16);
    const dmg = 18 * power;
    Object.values(G.players).forEach(p => {
      if (p.id === G.myId || p.finished || (p.layer || 0) !== (me.layer || 0)) return;
      if (dist(me.x, me.y, p.x, p.y) <= CAR_TUNING.coilArcVictimRange * 1.5) {
        me.wobble = Math.min(1, (me.wobble || 0) + 0.4);
      }
    });
    broadcast({ type: 'zap', id: G.myId, x: me.x, y: me.y, layer: me.layer || 0, damage: dmg });
    return;
  } else if (item === 'flipper') {
    // Holo Flipper: spin every nearby rival 180° (never affects your own ship).
    spawnExplosion(me.x, me.y, 60, 'pulse');
    addScreenShake(4, 0.12);
    broadcast({ type: 'flip', id: G.myId, x: me.x, y: me.y, layer: me.layer || 0 });
    return;
  }
  broadcast(effect);
}

// Screamer horn: on a cooldown, blasts nearby opponents with tunnel-vision.
function doHonk() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished || me.deathRespawn > 0) return;
  if (me.carType !== 'screamer') return;
  if ((me.honkCooldown || 0) > 0) return;
  me.honkCooldown = CAR_TUNING.screamerHonkCooldown;
  playItemUse('boost');
  broadcast({ type: 'honk', id: G.myId, x: me.x, y: me.y, layer: me.layer || 0 });
}

// Holo phase: engage ghost mode on demand (short duration, longer cooldown).
function doHolo() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished || me.deathRespawn > 0) return;
  if (me.carType !== 'holo') return;
  if ((me.holoCooldown || 0) > 0 || (me.ghostMode || 0) > 0) return;
  me.ghostMode = CAR_TUNING.holoGhostDuration;
  me.holoCooldown = CAR_TUNING.holoGhostCooldown;
  playItemUse('ghost');
}

// Baller inflate: pump up to double size for a few seconds; while inflated the
// ball rockets off any wall (bouncy, solid, or plain edge) without losing speed.
function doInflate() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished || me.deathRespawn > 0) return;
  if (me.carType !== 'baller') return;
  if ((me.ballerCooldown || 0) > 0 || (me.inflate || 0) > 0) return;
  me.inflate = CAR_TUNING.ballerInflateDuration;
  me.ballerCooldown = CAR_TUNING.ballerInflateCooldown;
  playItemUse('boost');
}

// Coil ability: super-charge the coil so it shoots its usual arcs at full power in a
// big radius. It drains the battery to stay lit (wall-arcing recharges you), and cuts
// out the moment the battery runs dry — so you can't uphold it without charge.
function doArcBurst() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished || me.deathRespawn > 0) return;
  if (me.carType !== 'coil') return;
  if ((me.coilAbilityCooldown || 0) > 0 || (me.arcBurst || 0) > 0) return;
  if ((me.battery || 0) < CAR_TUNING.coilArcBurstMinBattery) return;
  me.arcBurst = CAR_TUNING.coilArcBurstDuration;
  me.coilAbilityCooldown = CAR_TUNING.coilArcBurstCooldown;
  addScreenShake(4, 0.14);
  playItemUse('boost');
}

// Needle ability: bristle spikes across the hull. While out, the needle can't be
// bumped (except by an inflated Baller) and any car that rams it takes 200% damage.
function doSpikes() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished || me.deathRespawn > 0) return;
  if (me.carType !== 'needle') return;
  if ((me.needleCooldown || 0) > 0 || (me.spikes || 0) > 0) return;
  me.spikes = CAR_TUNING.needleSpikesDuration;
  me.needleCooldown = CAR_TUNING.needleSpikesCooldown;
  playItemUse('boost');
}

// Puncher ability: slam out a shockwave that punches every nearby car and obstacle
// away. The force is strongest straight ahead and behind (along the car's axis) and
// weakest to the sides. Cooldown-gated.
function doShockwave() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished || me.deathRespawn > 0) return;
  if (me.carType !== 'puncher') return;
  if ((me.puncherCooldown || 0) > 0) return;
  me.puncherCooldown = CAR_TUNING.puncherShockCooldown;
  const R = CAR_TUNING.puncherShockRadius;
  const fx = Math.cos(me.angle), fy = Math.sin(me.angle);
  const pushAt = (nx, ny, d) => {
    const axis = Math.abs(nx * fx + ny * fy); // 1 = front/back, 0 = sides
    return CAR_TUNING.puncherShockPush * (1 - d / R) * (1 + CAR_TUNING.puncherShockAxisBonus * axis);
  };
  spawnExplosion(me.x, me.y, R, 'pulse');
  spawnFxBurst(me.x, me.y, me.layer || 0, 'emp');
  addScreenShake(9, 0.28);
  playItemUse('boost');
  // Local: shove bots off their line and hurl obstacles outward.
  Object.values(G.players).forEach(p => {
    if (p.id === me.id || !p.isBot || p.finished || (p.layer || 0) !== (me.layer || 0)) return;
    const dx = p.x - me.x, dy = p.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d > R || d < 1e-3) return;
    const nx = dx / d, ny = dy / d;
    const push = pushAt(nx, ny, d);
    p.x += nx * push * 0.12;
    p.y += ny * push * 0.12;
    p._speed = (p._speed || 0) * 0.45;
    applyDamage(p, CAR_TUNING.puncherShockDamage / Math.max(0.5, getCarTypeCfg(p.carType).crashResist || 1), 'shock');
  });
  if (G.track && G.track.obstacles) {
    for (let oi = 0; oi < G.track.obstacles.length; oi++) {
      const obs = G.track.obstacles[oi];
      if (!obs || obs.active === false || obstacleLayer(obs) !== (me.layer || 0)) continue;
      const dx = obs.x - me.x, dy = obs.y - me.y;
      const d = Math.hypot(dx, dy);
      if (d > R || d < 1e-3) continue;
      const nx = dx / d, ny = dy / d;
      const push = pushAt(nx, ny, d);
      if (obs.type === 'cone') {
        obs.vx = (obs.vx || 0) + nx * push * 2.4;
        obs.vy = (obs.vy || 0) + ny * push * 2.4;
        broadcastConePush(oi, obs);
      } else if (obs.type === 'brick_wall') {
        disableObstacle(oi, 14, true, { dirX: nx, dirY: ny, speed: push * 2 });
      }
    }
  }
  broadcast({ type: 'shockwave', id: G.myId, x: me.x, y: me.y, layer: me.layer || 0, angle: me.angle });
}

// Rotor ability: Downdraft — engage the suction wake behind the propeller. It only
// fires while you're shifting (spinning the prop up), and it cuts out the instant you
// release shift. While lit it hard-brakes and drags trailing cars toward you.
function doDowndraft() {
  const me = G.players[G.myId];
  if (!me || !G.raceStarted || me.finished || me.deathRespawn > 0) return;
  if (me.carType !== 'rotor') return;
  if (me.propBroken) return;
  if ((me.rotorCooldown || 0) > 0 || (me.downdraft || 0) > 0) return;
  // Downdraft only works while shifting — no shift, no suction.
  if (!kbHeld('velocityLock')) return;
  me.downdraft = CAR_TUNING.rotorDowndraftDuration;
  me.rotorCooldown = CAR_TUNING.rotorDowndraftCooldown;
  addScreenShake(4, 0.14);
  playItemUse('boost');
}

// Every ship's on-demand ability is bound to one key; dispatch by car type.
function doAbility() {
  const me = G.players[G.myId];
  if (!me) return;
  switch (me.carType) {
    case 'holo':     doHolo(); break;
    case 'screamer': doHonk(); break;
    case 'baller':   doInflate(); break;
    case 'coil':     doArcBurst(); break;
    case 'needle':   doSpikes(); break;
    case 'puncher':  doShockwave(); break;
    case 'rotor':    doDowndraft(); break;
  }
}

function handleItemEffect(data) {
  if (data.item==='missile' && data.targetId===G.myId) {
    const me = G.players[G.myId];
    if (me) {
      const typeCfg = getCarTypeCfg(me.carType);
      // Shield absorbs the hit for its whole duration — applyDamage no-ops while shielded.
      applyDamage(me, CAR_TUNING.missileDamage / Math.max(0.5, typeCfg.weaponResist || 1), 'missile');
    }
  } else if (data.item==='oil') {
    // handled via oil_placed
  }
}

let prevTime = 0;
let gameLoopActive = false;

function gameLoop(ts) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((ts - prevTime) / 1000, 0.05);
  prevTime = ts;
  resizeCanvas();
  pollGamepad(dt);

  if (!G.track) return;
  // Perfect-start timing: measure how long the throttle has been held during
  // the countdown; evaluated the instant the race goes green.
  if (!G.raceStarted && !G.raceOver && G.countdownVal > 0) {
    G._launchHold = kbHeld('throttle') ? (G._launchHold || 0) + dt : 0;
  }
  if (G.raceStarted && !G.raceOver) {
    updateObstacleDynamics(dt);
    updateObstacleRespawns(dt);
    updateItemRespawns(dt);
    updateMyPlayer(dt);
    updateBots(dt);
    updateRemotePlayers(dt);
    updateMachinegunBurst(dt);
    updateMissiles(dt);
    updateMines(dt);
    updateShells(dt);
    updateBalls(dt);
    updateGhouls(dt);
    updateBullets(dt);
    applyDrainEffects(dt);
    applyDeathrayEffects(dt);
    sendMyState();
    checkDnfWindow();
  }
  updateDriftTrails(dt);
  updateFx(dt);
  updateSkidMarks(dt);
  updateToasts(dt);
  updateExplosions(dt);
  updateCheckpointConfetti(dt);
  updateResetHold(dt);

  render(dt);
  updateEngineAudio();
  updateHud();
}

// Per-frame special abilities for the new car classes (Rotor / Coil / Screamer).
// Runs for the LOCAL player only, modifying its velocity/facing after the core
// physics have set me.vx/vy. Cross-player effects (a fast Rotor's wake slowing cars
// behind it, an arcing Coil zapping neighbours) are resolved on the VICTIM's client
// by reading the actor's synced state (carType, speed, propBroken, arcing, layer).
function applyCarSpecials(me, dt, io) {
  if (!me || me.deathRespawn > 0) return;
  const T = CAR_TUNING;
  const scale = io.speedScale || 1;
  // Decompose current velocity into forward/lateral in the car's facing frame.
  const fx = Math.cos(me.angle), fy = Math.sin(me.angle);
  const rx = -fy, ry = fx;
  let fwd = me.vx * fx + me.vy * fy;
  let lat = me.vx * rx + me.vy * ry;
  let yaw = 0;

  // ── Rotor (actor): shift builds wobble; a passing car feeds the propeller ──
  if (me.carType === 'rotor') {
    if (io.shiftActive) me.wobble = Math.min(1, (me.wobble || 0) + T.rotorShiftWobblePerSec * dt);
    else me.wobble = Math.max(0, (me.wobble || 0) - T.rotorWobbleDecayPerSec * dt);
    // Downdraft ability only stays engaged while the propeller is shifting. Let go of
    // shift (or break the prop) and the suction wake instantly dies.
    if ((me.downdraft || 0) > 0) {
      if (io.shiftActive && !me.propBroken) me.downdraft = Math.max(0, me.downdraft - dt);
      else me.downdraft = 0;
    }
    if (!me.propBroken) {
      let feed = 0;
      Object.values(G.players).forEach(p => {
        if (p.id === me.id || p.finished || (p.layer || 0) !== (me.layer || 0)) return;
        const d = dist(me.x, me.y, p.x, p.y);
        if (d > T.rotorDraftRange) return;
        const rel = (p.speed || 0) - me.speed;
        if (rel > 20) feed += Math.min(1, rel / 200) * (1 - d / T.rotorDraftRange);
      });
      if (feed > 0) fwd += T.rotorDraftBoostPerSec * Math.min(2, feed) * scale * dt;
    }
  }

  // ── Coil (actor): arcing near walls + braking charge, shift drains, overcharge burns ──
  if (me.carType === 'coil') {
    // Battery hard cap of 200%. Shift drains it.
    const battCap = T.coilBatteryMax * 2;
    if (io.shiftActive) me.battery = Math.max(0, (me.battery || 0) - T.coilShiftDrainPerSec * dt);
    // Raw arc intensity from wall proximity — this is what actually CHARGES the battery.
    let wallArc = 0;
    const bnd = pointOnDriveSegments(me.x, me.y);
    if (bnd) {
      const gap = (bnd.halfW || TRACK_W) - bnd.dist;
      if (gap < T.coilArcRange) {
        wallArc = Math.max(0, Math.min(1, 1 - gap / T.coilArcRange));
        // World-space direction from the track centre outward through the car to the
        // nearby wall, so arcs can be drawn wall→car rather than radiating from the car.
        const sp = (G.track && G.track.driveSpline && G.track.driveSpline.length) ? G.track.driveSpline : (G.track && G.track.spline);
        if (sp && sp[bnd.idx] && sp[bnd.jdx]) {
          const qx = lerp(sp[bnd.idx].x, sp[bnd.jdx].x, bnd.t);
          const qy = lerp(sp[bnd.idx].y, sp[bnd.jdx].y, bnd.t);
          me.arcAngle = Math.atan2(me.y - qy, me.x - qx);
        }
      }
    }
    // Charging: real wall-arcing charges the battery — faster the closer the wall — and
    // braking still tops it up. Both climb to the 200% cap. Over 100% now cooks the coil.
    if (wallArc > 0) me.battery = Math.min(battCap, (me.battery || 0) + T.coilArcChargePerSec * wallArc * dt);
    if (io.brakeInput) me.battery = Math.min(battCap, (me.battery || 0) + T.coilBrakeChargePerSec * dt);
    // Overcharge: any charge above 100% steadily burns HP, ramping up the closer you get
    // to the 200% cap — hoarding a big battery is a real gamble.
    if ((me.battery || 0) > T.coilBatteryMax) {
      const over = Math.min(1, (me.battery - T.coilBatteryMax) / T.coilBatteryMax);
      applyContinuousDamage(me, T.coilOverchargeDrainHpPerSec * (1 + over * T.coilOverchargeRampMult) * dt, 'overcharge');
    }
    // Ability upkeep: the arc storm drains the battery to stay lit. Wall-arcing above
    // still charges you, so hugging walls sustains it — but run the battery dry and the
    // storm cuts out (you can't uphold it without charge).
    if ((me.arcBurst || 0) > 0) {
      me.battery = Math.max(0, (me.battery || 0) - T.coilArcBurstDrainPerSec * dt);
      if ((me.battery || 0) <= 0) me.arcBurst = 0;
    }
    // Effective arc intensity for effects/visuals: full power while the ability holds.
    let arcInt = wallArc;
    if ((me.arcBurst || 0) > 0) arcInt = 1;
    me.arcing = arcInt;
    // Arcing only grants forward push now — it no longer destabilises the coil itself.
    // The higher the battery charge, the stronger the boost.
    if (arcInt > 0) {
      const battFrac = Math.max(0, Math.min(2, (me.battery || 0) / T.coilBatteryMax));
      fwd += T.coilArcBoostPerSec * arcInt * battFrac * scale * dt;
    }
    // Battery-powered velocity lock: while shifting, a charged battery accelerates you,
    // while an empty one drags you down — the coil's shift is only as good as its charge.
    if (io.shiftActive) {
      const battFrac = Math.max(0, Math.min(2, (me.battery || 0) / T.coilBatteryMax));
      fwd += T.coilShiftBatteryPush * (battFrac - 0.5) * 2 * scale * dt;
    }
    me.wobble = Math.max(0, (me.wobble || 0) - T.rotorWobbleDecayPerSec * dt);
  } else if (me.carType !== 'rotor') {
    me.arcing = 0;
    me.wobble = Math.max(0, (me.wobble || 0) - T.rotorWobbleDecayPerSec * dt);
  }

  // ── Victim effects: read every other racer's synced state ──
  if (!me.finished) {
    Object.values(G.players).forEach(p => {
      if (p.id === me.id || p.finished || (p.layer || 0) !== (me.layer || 0)) return;
      const d = dist(me.x, me.y, p.x, p.y);
      // Fast Rotor wake slows cars caught behind it, proportional to its overspeed.
      if (p.carType === 'rotor' && !p.propBroken && (p.speed || 0) >= T.rotorWakeMinSpeed && d <= T.rotorWakeRange) {
        const rox = me.x - p.x, roy = me.y - p.y;
        const rl = Math.hypot(rox, roy) || 1;
        const behind = -(Math.cos(p.angle) * rox + Math.sin(p.angle) * roy) / rl;
        if (behind >= T.rotorWakeCone) {
          const overspeed = Math.min(1, (p.speed - T.rotorWakeMinSpeed) / T.rotorWakeMinSpeed);
          const slow = T.rotorWakeSlowMax * overspeed * (1 - d / T.rotorWakeRange);
          fwd *= Math.max(0, 1 - slow * 3 * dt);
        }
      }
      // Active Downdraft ability: a much stronger, wider suction wake that hard-brakes
      // trailing cars and physically drags them toward the rotor. Reaches further and
      // does not need the rotor to be at full speed.
      if (p.carType === 'rotor' && !p.propBroken && (p.downdraft || 0) > 0 && d <= T.rotorDowndraftRange) {
        const rox = me.x - p.x, roy = me.y - p.y;
        const rl = Math.hypot(rox, roy) || 1;
        const behind = -(Math.cos(p.angle) * rox + Math.sin(p.angle) * roy) / rl;
        if (behind >= T.rotorDowndraftCone) {
          const falloff = 1 - d / T.rotorDowndraftRange;
          const slow = T.rotorDowndraftSlowMax * falloff;
          fwd *= Math.max(0, 1 - slow * 3 * dt);
          // Suction: pull the victim straight toward the rotor.
          const pull = T.rotorDowndraftPull * falloff * scale * dt;
          me.vx -= (rox / rl) * pull;
          me.vy -= (roy / rl) * pull;
          me.wobble = Math.min(1, (me.wobble || 0) + 0.6 * falloff * dt);
        }
      }
      // Arcing Coil zaps nearby racers: small damage per bolt, boost + heavy wobble.
      // While its ability is active the strike radius balloons.
      if (p.carType === 'coil' && (p.arcing || 0) > 0) {
        const vr = T.coilArcVictimRange * (((p.arcBurst || 0) > 0) ? T.coilArcBurstRangeMult : 1);
        if (d <= vr) {
          applyContinuousDamage(me, T.coilArcVictimDamage * p.arcing * dt * 5, 'arc');
          fwd += T.coilArcVictimBoostPerSec * p.arcing * scale * dt;
          me.wobble = Math.min(1, (me.wobble || 0) + T.coilArcVictimWobblePerSec * p.arcing * dt);
        }
      }
    });
  }

  // ── Wobble → lateral jitter + facing wobble (Rotor and Coil) ──
  if ((me.wobble || 0) > 0.001) {
    // Chaotic wobble: irregular phase advance plus independent random impulses for
    // lateral and yaw, so the car gets genuinely thrown around instead of settling
    // into a predictable, easy-to-correct back-and-forth rhythm.
    me._wobblePhase = (me._wobblePhase || 0) + dt * (14 + me.speed * 0.05) * (0.5 + Math.random());
    const latOsc = Math.sin(me._wobblePhase * 1.7) * 0.45 + (Math.random() - 0.5) * 1.7;
    const yawOsc = Math.cos(me._wobblePhase * 0.9) * 0.35 + (Math.random() - 0.5) * 1.7;
    // The propeller's wobble grows more violent the faster it's travelling.
    let wobMag = me.wobble;
    if (me.carType === 'rotor') {
      const sf = 1 + Math.min(T.rotorWobbleSpeedMax, (me.speed || 0) / T.rotorWobbleSpeedRef * T.rotorWobbleSpeedScale);
      wobMag *= sf;
    }
    lat += latOsc * T.rotorWobbleKick * scale * wobMag * dt;
    yaw += yawOsc * T.rotorWobbleYaw * wobMag * dt;
  }

  me.angle += yaw;
  me.vx = fx * fwd + rx * lat;
  me.vy = fy * fwd + ry * lat;
  me.speed = Math.hypot(me.vx, me.vy);
}

// Linked checkpoints: gates sharing a non-zero `link` id are the alternative gates
// on a split (one per fork). They are authored consecutively, so a "group" is the
// maximal run of consecutive gates that share the current gate's link. Crossing ANY
// gate in the group clears the whole group. Unlinked gates (link 0/undefined) are
// groups of one, preserving the classic must-pass-in-sequence behaviour.
function checkpointGroupEnd(cps, start) {
  const link = cps[start] && cps[start].link;
  if (!link) return start + 1;
  let end = start + 1;
  while (end < cps.length && cps[end] && cps[end].link === link) end++;
  return end;
}

function updateMyPlayer(dt) {
  const me = G.players[G.myId];
  if (!me || me.finished) return;
  const speedScale = Math.max(0.2, G.speedScale || 1);
  me.invuln = Math.max(0, (me.invuln || 0) - dt);
  me.honkCooldown = Math.max(0, (me.honkCooldown || 0) - dt);
  me.tunnelVision = Math.max(0, (me.tunnelVision || 0) - dt);
  me.holoCooldown = Math.max(0, (me.holoCooldown || 0) - dt);
  me.ballerCooldown = Math.max(0, (me.ballerCooldown || 0) - dt);
  if ((me.inflate || 0) > 0) me.inflate = Math.max(0, me.inflate - dt);
  me.needleCooldown = Math.max(0, (me.needleCooldown || 0) - dt);
  if ((me.spikes || 0) > 0) me.spikes = Math.max(0, me.spikes - dt);
  me.coilAbilityCooldown = Math.max(0, (me.coilAbilityCooldown || 0) - dt);
  if ((me.arcBurst || 0) > 0) me.arcBurst = Math.max(0, me.arcBurst - dt);
  me.puncherCooldown = Math.max(0, (me.puncherCooldown || 0) - dt);
  me.rotorCooldown = Math.max(0, (me.rotorCooldown || 0) - dt);
  if ((me.screamSlow || 0) > 0) {
    me.screamSlow = Math.max(0, me.screamSlow - dt);
    const k = Math.max(0, 1 - CAR_TUNING.screamerHonkSlowDrag * dt);
    me.vx *= k; me.vy *= k;
    me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
  }
  // Screamer Ghoul: hard-cap speed at half the class top while the specter's chill lasts.
  if ((me.ghoulSlow || 0) > 0) {
    me.ghoulSlow = Math.max(0, me.ghoulSlow - dt);
    const cap = CAR_TUNING.baseMaxSpeed * speedScale * CAR_TUNING.ghoulSlowMult;
    const sp = Math.hypot(me.vx, me.vy);
    if (sp > cap) { const k = cap / sp; me.vx *= k; me.vy *= k; me.speed = cap; }
  }
  if (me.deathRespawn > 0) {
    me.deathRespawn = Math.max(0, me.deathRespawn - dt);
    me.speed = 0; me.vx = 0; me.vy = 0;
    if (me.deathRespawn <= 0 && G.track && G.track.spline && G.track.spline.length > 1) {
      const cps = G.track.checkpoints;
      let placed = false;
      if (cps && cps.length && (me.nextCheckpoint || 0) > 0) {
        // Send the player back to the last checkpoint they actually cleared (the
        // specific fork gate on a split, not just its group), facing forward, on
        // that checkpoint's layer.
        const cpIdx = (me.lastCpCrossed != null && cps[me.lastCpCrossed])
          ? me.lastCpCrossed
          : ((me.nextCheckpoint - 1) % cps.length);
        const cp = cps[cpIdx];
        if (cp) {
          me.x = cp.x; me.y = cp.y;
          me.angle = Math.atan2(cp.ty || 0, cp.tx || 1);
          me.layer = Math.max(0, Math.min(2, Math.round(cp.layer || 0)));
          placed = true;
        }
      }
      if (!placed) {
        const near = pointOnTrack(me.x, me.y, G.track.spline);
        const i = near.idx;
        const a = G.track.spline[i];
        const b = G.track.spline[(i + 1) % G.track.spline.length];
        me.x = a.x; me.y = a.y;
        me.angle = Math.atan2(b.y - a.y, b.x - a.x);
        me.layer = bridgeFloorAt(a.x, a.y);
      }
      me.health = me.maxHealth || CAR_TUNING.baseHealth;
      me.slopeSide = {};
      me.bridgeTransitionGrace = 0;
      me.airTime = 0;
      me.invuln = CAR_TUNING.respawnInvuln;
    }
    return;
  }
  const ox = me.x, oy = me.y;
  if (me.bridgeTransitionGrace > 0) me.bridgeTransitionGrace = Math.max(0, me.bridgeTransitionGrace - dt);

  // Compute stat modifiers from upgrades
  const ups = me.upgrades || [];
  const topSpeedMult = 1 + ups.filter(u=>u==='topspeed').length * CAR_TUNING.topSpeedUpgradeStep;
  const accelMult = 1 + ups.filter(u=>u==='accel').length * CAR_TUNING.accelUpgradeStep;
  const handlingMult = 1 + ups.filter(u=>u==='handling').length * CAR_TUNING.handlingUpgradeStep;
  const armorMult = ups.includes('armor') ? 0.5 : 1;
  const carCfg = getCarTypeCfg(me.carType);
  const effHandlingMult = handlingMult * carCfg.handlingMult;

  // Nanobots upgrade: slow hull regeneration (fractional accumulation so the
  // integer health display ticks up smoothly).
  if (ups.includes('regen') && me.health > 0 && me.health < (me.maxHealth || CAR_TUNING.baseHealth)) {
    me._regenAcc = (me._regenAcc || 0) + 1.6 * dt;
    if (me._regenAcc >= 1) {
      const whole = Math.floor(me._regenAcc);
      me._regenAcc -= whole;
      me.health = Math.min(me.maxHealth || CAR_TUNING.baseHealth, me.health + whole);
    }
  }

  let maxSpeed = CAR_TUNING.baseMaxSpeed * speedScale * topSpeedMult * carCfg.topSpeedMult;
  if (me.carType === 'rotor') {
    // The propeller must spin up from a standstill. It re-spins any time the rotor
    // stops moving or crashes (a sudden hard speed drop), not just at the start line.
    const spd = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
    const prev = me._rotorPrevSpeed || 0;
    const crashed = prev > CAR_TUNING.rotorRestartSpeed && spd < prev * (1 - CAR_TUNING.rotorCrashDropFrac);
    if (spd < CAR_TUNING.rotorRestartSpeed || crashed) {
      me.rotorSpinUp = CAR_TUNING.rotorSpinUpSec; // stopped / crashed -> full restart
    } else if ((me.rotorSpinUp || 0) > 0) {
      me.rotorSpinUp = Math.max(0, me.rotorSpinUp - dt);
    }
    me._rotorPrevSpeed = spd;
    if ((me.rotorSpinUp || 0) > 0) maxSpeed *= CAR_TUNING.rotorSpinUpSpeedMult;
  }
  if (me.boosting > 0) { maxSpeed *= CAR_TUNING.boostSpeedMultiplier; me.boosting -= dt; }
  if (me.stun > 0) {
    me.stun -= dt;
    me.speed *= CAR_TUNING.stunVelocityDamping;
    me.vx *= CAR_TUNING.stunVelocityDamping;
    me.vy *= CAR_TUNING.stunVelocityDamping;
    return;
  }
  me.driftPenaltyTimer = Math.max(0, me.driftPenaltyTimer - dt);

  // Check if currently airborne (elevated and not over the correct bridge floor)
  const isAirborne = me.layer > 0 && me.bridgeTransitionGrace <= 0 && !overLayerDeck(me.x, me.y, me.layer) && !nearSlopeGate(me.x, me.y, 130);

  // Steering controls facing direction. Movement direction can drift away from facing.
  let steerInput = (kbHeld('steerRight') ? 1 : 0) - (kbHeld('steerLeft') ? 1 : 0);
  // Analog controller steering overrides the digital keys when it pushes harder.
  if (G.pad && G.pad.connected && Math.abs(G.pad.steer) > Math.abs(steerInput)) steerInput = G.pad.steer;
  const throttleHeld0 = kbHeld('throttle') ? 1 : 0;
  const brakeHeld = kbHeld('brake') ? 1 : 0;
  // Pressure-sensitive throttle/brake amount: controller triggers scale the force
  // 0..1; keyboard is full power. Trigger value overrides keys when engaged.
  let throttleHeld = throttleHeld0;
  let throttleAmount = throttleHeld ? 1 : 0;
  if (G.pad && G.pad.connected && (G.pad.throttle || 0) > 0) throttleAmount = G.pad.throttle;
  let brakeAmount = brakeHeld ? 1 : 0;
  if (G.pad && G.pad.connected && (G.pad.brake || 0) > 0) brakeAmount = G.pad.brake;
  let shiftHeld = kbHeld('velocityLock');
  let isDrifting = kbHeld('drift');
  // Autopilot: while active the car drives itself along the track toward a look-ahead
  // point, overriding steering and throttle (you can still be hit — it just steers).
  // It eases off on tight corners so it holds the line instead of flying off.
  if ((me.autopilot || 0) > 0) {
    me.autopilot = Math.max(0, me.autopilot - dt);
    const apSp = G.track && G.track.spline;
    if (apSp && apSp.length > 2) {
      const apN = apSp.length;
      const apI0 = pointOnTrack(me.x, me.y, apSp).idx % apN;
      const apLook = Math.max(4, Math.round(apN * 0.03));
      const apTgt = apSp[(apI0 + apLook) % apN];
      const apDesired = Math.atan2(apTgt.y - me.y, apTgt.x - me.x);
      const apErr = angleDiff(me.angle, apDesired);
      steerInput = Math.max(-1, Math.min(1, apErr * 2.4));
      const apCurv = Math.abs(angleDiff(_botTangentAt(apSp, apI0), _botTangentAt(apSp, apI0 + apLook)));
      throttleAmount = apCurv > 0.5 ? 0.55 : 1;
      throttleHeld = 1;
      brakeAmount = 0;
      shiftHeld = false;
      isDrifting = false;
    }
  }
  // Baller Ball: a hit disables control — inputs go dead but momentum carries you.
  let noControlActive = false;
  if ((me.noControl || 0) > 0) {
    me.noControl = Math.max(0, me.noControl - dt);
    steerInput = 0; throttleAmount = 0; brakeAmount = 0; shiftHeld = false; isDrifting = false;
    noControlActive = true;
  }
  const driftEnabled = carCfg.driftEnabled !== false;
  const driftHold = driftEnabled && isDrifting && Math.abs(steerInput) > 0;
  const spaceBrakeOnly = isDrifting && Math.abs(steerInput) === 0 && !throttleHeld && !brakeHeld;
  const coastingDriftSteer = driftHold && !throttleHeld && !brakeHeld;
  const fwd0x = Math.cos(me.angle), fwd0y = Math.sin(me.angle);
  const right0x = -fwd0y, right0y = fwd0x;
  const forwardSpeed0 = me.vx * fwd0x + me.vy * fwd0y;
  const lateralSpeed0 = me.vx * right0x + me.vy * right0y;
  const steerSpeedFactor = Math.min(1, Math.abs(forwardSpeed0) / CAR_TUNING.steerMinSpeedRef);
  const slidePenalty = Math.min(1, Math.abs(lateralSpeed0) / (Math.abs(forwardSpeed0) + 20));
  const steerGripScale = me._onIce ? 1 : (1 - CAR_TUNING.steeringGripPenalty * slidePenalty);
  const penaltyTurnScale = me.driftPenaltyTimer > 0 ? CAR_TUNING.driftGlitchTurnMult : 1;
  // Needle steers much sharper at a crawl to offset its soft launch — the boost
  // tapers to nothing as forward speed climbs, so its high-speed feel is unchanged.
  let lowSpeedHandlingBoost = 1;
  if (me.carType === 'needle') {
    const lowT = 1 - steerSpeedFactor; // 1 at a standstill, 0 once up to speed
    lowSpeedHandlingBoost = 1 + lowT * lowT * 1.8;
  }
  // Faster track speed classes turn harder so cornering keeps up with the higher
  // speeds instead of widening into floaty arcs (speedScale ** trackSpeedHandlingExp).
  const trackHandlingMult = Math.pow(speedScale, CAR_TUNING.trackSpeedHandlingExp);
  const turnSpd = CAR_TUNING.baseTurnRate * trackHandlingMult * effHandlingMult * lowSpeedHandlingBoost * (0.25 + 0.75 * steerSpeedFactor) * steerGripScale * (driftHold ? CAR_TUNING.driftSteerBoost * carCfg.driftEffectMult : 1) * (coastingDriftSteer ? CAR_TUNING.driftCoastYawMult : 1) * penaltyTurnScale;
  const shiftActive = shiftHeld && carCfg.shiftEnabled;
  if (!shiftActive && steerInput !== 0) me.angle += steerInput * turnSpd * dt;

  if (!isAirborne) {
    const fwdx = Math.cos(me.angle), fwdy = Math.sin(me.angle);
    const rightx = -fwdy, righty = fwdx;
    let forwardSpeed = me.vx * fwdx + me.vy * fwdy;
    let lateralSpeed = me.vx * rightx + me.vy * righty;

    let accelCurveMult = 1;
    if (me.carType === 'needle') {
      // Needle launches softly, then pulls harder as forward speed builds.
      const fwdPos = Math.max(0, forwardSpeed);
      const t = Math.max(0, Math.min(1, fwdPos / (CAR_TUNING.baseMaxSpeed * 1.4)));
      accelCurveMult = lerp(0.38, 1.85, t * t);
    }
    const accel = CAR_TUNING.baseAccel * speedScale * accelMult * carCfg.accelMult * accelCurveMult * (me._onIce ? CAR_TUNING.iceAccelMult : 1);
    const brake = CAR_TUNING.baseBrake * speedScale * (carCfg.brakeMult || 1) * (me._onIce ? CAR_TUNING.iceAccelMult : 1);
    const throttle = noControlActive ? 0 : throttleHeld;
    const brakeInput = !noControlActive && (brakeHeld || spaceBrakeOnly);
    if (brakeInput && brakeAmount <= 0) brakeAmount = 1; // e.g. SPACE coast-brake = full
    const coastingDrift = driftHold && !throttle && !brakeInput;

    if (throttle) {
      forwardSpeed += accel * throttleAmount * dt;
    }
    if (brakeInput) {
      if (forwardSpeed > 12) forwardSpeed -= brake * brakeAmount * dt;
      else forwardSpeed -= accel * CAR_TUNING.reverseAccelScale * brakeAmount * dt;
    }

    const drag = (throttle || brakeInput)
      ? (throttle && !brakeInput ? CAR_TUNING.throttleDrag : CAR_TUNING.longDrag) * carCfg.momentumDragMult * (shiftActive ? CAR_TUNING.shiftLongDragMult * carCfg.shiftEffectMult : (driftHold ? CAR_TUNING.driftLongDragMult / Math.max(0.5, carCfg.driftEffectMult) : 1))
      : CAR_TUNING.coastDrag * carCfg.momentumDragMult * (shiftActive ? CAR_TUNING.shiftCoastDragMult * carCfg.shiftEffectMult : (driftHold ? CAR_TUNING.driftCoastDragMult / Math.max(0.5, carCfg.driftEffectMult) : 1));
    const dragMult = Math.max(0, 1 - drag * (me._onIce ? CAR_TUNING.iceDragMult : 1) * dt);
    forwardSpeed *= dragMult;

    const speedLen = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
    const dynamicGrip = Math.max(
      CAR_TUNING.lateralGripMin,
      Math.min(CAR_TUNING.lateralGripMax * (0.65 + 0.35 * speedScale), (CAR_TUNING.lateralGrip + 0.0025 * Math.abs(forwardSpeed) + 0.0015 * speedLen) * (0.7 + 0.3 * speedScale))
    );
    const gripMult = shiftActive
      ? CAR_TUNING.shiftLateralGripMult / Math.max(0.6, carCfg.shiftEffectMult)
      : (coastingDrift ? CAR_TUNING.driftCoastLateralGripMult / Math.max(0.6, carCfg.driftEffectMult) : (driftHold ? CAR_TUNING.driftLateralGripMult / Math.max(0.6, carCfg.driftEffectMult) : 1));
    const iceGrip = me._onIce ? CAR_TUNING.iceGripMult : 1;
    const effectiveGrip = dynamicGrip * gripMult * iceGrip;
    const lateralMult = Math.max(0, 1 - effectiveGrip * dt);
    lateralSpeed *= lateralMult;
    // Drifting carries your momentum through the turn via reduced lateral grip (you
    // keep sliding in your current direction) and steers much harder — but it must
    // NOT add forward speed. There is deliberately no lateral->forward redirect here;
    // that would accelerate you out of a slide, which is not what a drift should do.

    const steerSign = Math.sign(steerInput);
    const lateralSign = Math.sign(lateralSpeed);
    const alignedSteer = steerSign !== 0 && lateralSign !== 0 && steerSign === lateralSign;
    const velAngle = Math.atan2(me.vy, me.vx);
    const slipAngleAbs = Math.abs(angleDiff(me.angle, velAngle));

    if (driftHold) {
      me.driftFlipTimer += dt;
      if (me.driftFlipTimer > CAR_TUNING.driftFlipPenaltyWindow) {
        me.driftFlipTimer = CAR_TUNING.driftFlipPenaltyWindow;
        me.driftFlipCount = 0;
      }

      if (steerSign !== 0 && steerSign !== me.driftSteerSign) {
        if (me.driftSteerSign !== 0) {
          me.driftFlipCount = (me.driftFlipTimer <= CAR_TUNING.driftFlipPenaltyWindow)
            ? (me.driftFlipCount + 1)
            : 1;
          if (me.driftFlipCount >= CAR_TUNING.driftFlipPenaltySwaps) {
            me.driftBoostStack *= CAR_TUNING.driftFlipStackMult;
            me.driftNoBoostTimer = Math.max(me.driftNoBoostTimer, CAR_TUNING.driftFlipNoBoostSec);
            me.driftCommitTimer = 0;
            me.driftPenaltyTimer = Math.max(me.driftPenaltyTimer, CAR_TUNING.driftGlitchPenaltySec);
            forwardSpeed *= CAR_TUNING.driftGlitchSpeedCut;
            lateralSpeed *= CAR_TUNING.driftGlitchLateralDamp;
            me.driftFlipCount = 0;
            me.driftFlipTimer = 0;
          }
        }
        me.driftSteerSign = steerSign;
      }

      if (alignedSteer && slipAngleAbs >= CAR_TUNING.driftMinSlipAngle) {
        me.driftCommitTimer = Math.min(1.25, me.driftCommitTimer + dt);
      } else {
        me.driftCommitTimer = Math.max(0, me.driftCommitTimer - dt * 2.2);
      }
    } else {
      me.driftSteerSign = 0;
      me.driftFlipTimer = 0;
      me.driftFlipCount = 0;
      me.driftCommitTimer = Math.max(0, me.driftCommitTimer - dt * 3);
    }
    me.driftNoBoostTimer = Math.max(0, me.driftNoBoostTimer - dt);

    if (me.driftPenaltyTimer > 0) {
      const penaltyDrag = Math.max(0, 1 - CAR_TUNING.driftGlitchDragPerSec * dt);
      forwardSpeed *= penaltyDrag;
      lateralSpeed *= Math.max(0, 1 - (CAR_TUNING.driftGlitchDragPerSec * 0.6) * dt);
    }

    const slipAbs = Math.abs(lateralSpeed);
    const slipGate = Math.min(1, slipAbs / CAR_TUNING.driftMinSlipForBoost);
    const committedDrift = driftHold
      && slipGate >= CAR_TUNING.driftMinSlipGate
      && slipAngleAbs >= CAR_TUNING.driftMinSlipAngle
      && alignedSteer
      && me.driftCommitTimer >= CAR_TUNING.driftMinCommitSec
      && me.driftNoBoostTimer <= 0;

    if (committedDrift && !me._wasCommittedDrift && G.raceStats) G.raceStats.drifts++;
    me._wasCommittedDrift = committedDrift;

    // Drifting no longer boosts you forward — it only carries your existing
    // momentum through the turn (see the lateral-to-forward redirect above). Keep
    // the boost stack winding down so any legacy readers see it settle to zero.
    me.driftBoostStack = Math.max(0, me.driftBoostStack - CAR_TUNING.driftBoostDecayPerSec * dt);

    const handlingDeficit = Math.max(0, (CAR_TUNING.driftShakeHandlingSafe - effHandlingMult) / CAR_TUNING.driftShakeHandlingRange);
    const speedOver = Math.max(0, forwardSpeed - CAR_TUNING.driftShakeStartSpeed);
    const speedFactor = Math.min(1.5, speedOver / 120);
    const instability = driftHold ? (handlingDeficit * speedFactor) : 0;
    me.driftShakePhase += dt * (18 + Math.abs(forwardSpeed) * 0.04);
    if (instability > 0) {
      const osc = Math.sin(me.driftShakePhase) + (Math.random() - 0.5) * 0.8;
      lateralSpeed += osc * CAR_TUNING.driftShakeLateralKick * speedScale * instability * dt;
      if (!shiftActive) me.angle += osc * CAR_TUNING.driftShakeYawRate * speedScale * instability * dt;
    }

    let forwardCap = carCfg.endlessTopSpeed ? Number.POSITIVE_INFINITY : maxSpeed;
    const lateralRatio = coastingDrift ? (CAR_TUNING.driftCoastMaxLateralRatio * carCfg.driftEffectMult) : CAR_TUNING.maxLateralSpeedRatio;
    const maxLateral = maxSpeed * lateralRatio;
    lateralSpeed = Math.max(-maxLateral, Math.min(maxLateral, lateralSpeed));

    // Draft boost (adds forward momentum while slipstreaming)
    if (ups.includes('draft')) {
      Object.values(G.players).forEach(p=>{
        if(p.id!==G.myId&&!p.finished){
          const d=dist(me.x,me.y,p.x,p.y);
          const a=angleDiff(me.angle,angle(me.x,me.y,p.x,p.y));
          if (d < CAR_TUNING.draftRange && Math.abs(a) < CAR_TUNING.draftAngleThreshold) {
            const draftCap = maxSpeed * CAR_TUNING.draftMaxSpeedMultiplier;
            forwardSpeed = Math.min(forwardSpeed * CAR_TUNING.draftPerTickMultiplier, draftCap);
            forwardCap = Math.max(forwardCap, draftCap);
          }
        }
      });
    }

    if (!carCfg.endlessTopSpeed && forwardSpeed > forwardCap) {
      if (throttle && !driftHold && !shiftActive) {
        // Decoupled top speed: under straight power, the rated cap is a firm ceiling
        // (acceleration only decides how quickly you get here).
        forwardSpeed = forwardCap;
      } else {
        const bleed = shiftActive ? CAR_TUNING.shiftOverspeedBleed : (coastingDrift ? CAR_TUNING.driftCoastOverspeedBleed : CAR_TUNING.driftOverspeedBleed);
        const k = Math.max(0, Math.min(1, bleed * dt));
        forwardSpeed = Math.max(forwardCap, forwardSpeed - (forwardSpeed - forwardCap) * k);
      }
    }
    if (carCfg.endlessTopSpeed && !throttle) {
      // Needle keeps high-speed carry with very soft cap bleed when coasting.
      const bleed = Math.max(0, 1 - 0.08 * dt);
      forwardSpeed *= bleed;
    }
    forwardSpeed = Math.max(-(CAR_TUNING.maxReverseSpeed * speedScale), forwardSpeed);

    me.vx = fwdx * forwardSpeed + rightx * lateralSpeed;
    me.vy = fwdy * forwardSpeed + righty * lateralSpeed;
    me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
    applyCarSpecials(me, dt, { shiftActive, brakeInput, throttle, speedScale });
  } else {
    // Airborne: no tire grip, only drag on the current velocity.
    const airDrag = Math.max(0, 1 - CAR_TUNING.baseAirFriction * 0.02 * dt);
    me.vx *= airDrag;
    me.vy *= airDrag;
    me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
  }

  let nx = me.x + me.vx * dt;
  let ny = me.y + me.vy * dt;
  const _gateFromX = me.x, _gateFromY = me.y; // frame-start position for gate crossing

  // ── Layer fall physics ─────────────────────────────────────────────────────
  // Unsupported layers fall with acceleration-like behavior.
  const floorUnder = bridgeFloorAt(nx, ny);
  const supportLayer = isInVoid(nx, ny) ? floorUnder : Math.max(0, floorUnder);
  // Support only HOLDS the player at their current layer or lets them fall.
  // Layer is raised ONLY by crossing an up-slope gate (checkRampTransitions);
  // merely driving into a higher span's footprint must NOT promote the player.
  // A slope gate is itself a continuous transition surface: while on it the car
  // is supported even if the bridge span's idx range doesn't perfectly line up
  // with the gate, which otherwise causes a spurious fall + off-track stall.
  // Most importantly, support is layer-aware: a car on layer N is held by its OWN
  // deck (overLayerDeck), ignoring any other layer's track passing underneath — so a
  // deck over an intersection never falsely reports unsupported.
  // A walled section also contains the car, so it can't fall there either.
  const supportIdx = pointOnTrack(nx, ny, G.track.spline).idx;
  const supported = (supportLayer >= me.layer)
    || (me.layer > 0 && overLayerDeck(nx, ny, me.layer))
    || me.bridgeTransitionGrace > 0
    || nearSlopeGate(nx, ny, 130)
    || walledAt(supportIdx);
  if (supported) {
    me.airTime = 0;
    me.layerFallSpeed = 0;
    me.layerFallProgress = 0;
  } else {
    me.airTime += dt;
    const accel = Math.max(0.01, CAR_TUNING.layerFallAccel || 1.25);
    const v0 = Math.max(0.01, CAR_TUNING.layerFallInitialSpeed || 1.0);
    const vMax = Math.max(v0, CAR_TUNING.layerFallTerminalSpeed || 3.2);
    me.layerFallSpeed = Math.min(vMax, Math.max(v0, me.layerFallSpeed || v0) + accel * dt);
    me.layerFallProgress = (me.layerFallProgress || 0) + me.layerFallSpeed * dt;
    while (me.layerFallProgress >= 1) {
      me.layer--;
      me.layerFallProgress -= 1;
      if (me.layer <= 0) { me.layer = 0; me.layerFallProgress = 0; me.layerFallSpeed = 0; me.airTime = 0; break; }
    }
  }

  // Airborne state at the NEW position (after movement/fall update)
  const isAirborneNext = me.layer > 0 && me.bridgeTransitionGrace <= 0 && !overLayerDeck(nx, ny, me.layer) && !nearSlopeGate(nx, ny, 130);

  // Track boundary — layer-aware, over the unified DRIVE geometry (the main loop minus
  // hidden fork "spleen" segments PLUS every fork path). Forks are ordinary road here,
  // so a fork sitting at an elevated layer is boundary-checked on its own deck exactly
  // like the main track. For a branch-free map the drive geometry is the main loop, so
  // classic maps behave identically.
  let effectiveDist;
  let effectiveHalfW = TRACK_W;
  let effectiveNearIdx = 0;
  let effectiveJdx = 0;
  let effectiveT = 0;
  let effectiveMainIdx = -1;
  // Void-painted samples are holes, not road: exclude them so driving onto a void
  // section reads as off-track (not driveable).
  const _dv = (Array.isArray(G.track.driveVoid) && G.track.driveSpline && G.track.driveVoid.length === G.track.driveSpline.length) ? G.track.driveVoid : null;
  const notVoid = _dv ? ((i, j) => !_dv[i] && !_dv[j]) : (() => true);
  const _df = G.track.driveFloor || [];
  let bnd;
  if (nearSlopeGate(nx, ny, 140)) {
    // A slope joins two layers, so BOTH of its layers' road counts as valid ground
    // here — use the nearest road on ANY layer so the car can't stall mid-ramp.
    bnd = pointOnDriveSegments(nx, ny, notVoid);
  } else if (me.layer === 0) {
    // Ground: exclude elevated decks so a ground car drives UNDER them.
    bnd = pointOnDriveSegments(nx, ny, (i, j) => (_df[i] || 0) === 0 && (_df[j] || 0) === 0 && notVoid(i, j));
    if (!Number.isFinite(bnd.dist)) bnd = pointOnDriveSegments(nx, ny, notVoid);
  } else {
    // Elevated: only same-layer segments, so an overlapping lower road can't hijack
    // the lookup (which would make the deck's walls vanish over intersections).
    bnd = pointOnDriveSegments(nx, ny, (i, j) => (_df[i] || 0) === me.layer && (_df[j] || 0) === me.layer && notVoid(i, j));
    if (!Number.isFinite(bnd.dist)) bnd = pointOnDriveSegments(nx, ny);
  }
  effectiveDist = bnd.dist;
  effectiveHalfW = bnd.halfW || TRACK_W;
  effectiveNearIdx = bnd.idx || 0;
  effectiveJdx = Number.isFinite(bnd.jdx) ? bnd.jdx : effectiveNearIdx;
  effectiveT = bnd.t || 0;
  effectiveMainIdx = Number.isFinite(bnd.mainIdx) ? bnd.mainIdx : -1;
  // On a fork the nearest drive sample has no main-spline index — forks carry no
  // painted walls, so wall rules simply don't apply there.
  const onBranch = effectiveMainIdx < 0;
  if (!isAirborneNext && me.bridgeTransitionGrace <= 0) {
    const _ds = G.track.driveSpline || G.track.spline;
    const a = _ds[effectiveNearIdx], b = _ds[effectiveJdx] || a;
    const pNowX = a.x + (b.x - a.x) * effectiveT;
    const pNowY = a.y + (b.y - a.y) * effectiveT;
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    const nxv = -ty, nyv = tx;
    const signed = (nx - pNowX) * nxv + (ny - pNowY) * nyv;
    const side = signed >= 0 ? 'left' : 'right';
    const wall = onBranch ? forkWallRuleAt(effectiveNearIdx, side) : wallRuleAt(effectiveMainIdx, side);
    const mode = wall ? (wall.mode || 'solid') : 'default';

    if (effectiveDist > effectiveHalfW) {
      // Wall/edge impact sound on first contact (not for open run-off).
      const isWallMode = mode !== 'open';
      if (isWallMode) {
        if (!me._wallContact) {
          const vnInto = (me.vx * nxv + me.vy * nyv) * Math.sign(signed);
          const impact = Math.min(1, Math.max(Math.abs(vnInto), (me.speed || 0) * 0.45) / 260);
          playWallHit(impact);
          if (G.raceStats) G.raceStats.wallHits++;
        }
        me._wallContact = true;
        // Grinding along a wall at speed showers sparks back into the track.
        if (me.speed > 70 && Math.random() < 0.55) {
          spawnFxBurst(me.x, me.y, me.layer || 0, 'sparks', -nxv * Math.sign(signed), -nyv * Math.sign(signed));
        }
      } else {
        me._wallContact = false;
      }
      if (mode === 'open') {
        // Open run-off: brown dirt — slow/drift zone follows the chord locally, so it
        // matches the rendered brown fill exactly (thin at the run's ends, deepest in
        // the middle). Past the chord it's truly open. Forks use a fixed depth band.
        const openDepth = onBranch ? 46 : openDepthAt(wall, effectiveMainIdx, signed >= 0 ? 1 : -1);
        if (effectiveDist <= effectiveHalfW + openDepth) {
          // Drifters are at home on dirt — they scrub off much less speed than others.
          const dirtDrag = me.carType === 'drifter' ? 0.24 : 0.6;
          const slow = Math.max(0, 1 - dirtDrag * dt);
          me.vx *= slow;
          me.vy *= slow;
          const fIx = Math.cos(me.angle), fIy = Math.sin(me.angle);
          const rIx = -fIy, rIy = fIx;
          me.vx += rIx * steerInput * (18 * speedScale) * dt;
          me.vy += rIy * steerInput * (18 * speedScale) * dt;
        }
      } else if ((me.inflate || 0) > 0) {
        // Inflated Baller: ONE monster reflection off ANY wall (bouncy / solid /
        // plain edge). It flings the car away insanely hard, the ability then ends
        // immediately, and the launched momentum is carried afterwards.
        const vn = me.vx * nxv + me.vy * nyv;
        const headingOut = vn * Math.sign(signed) > 0;
        if (headingOut) {
          const preSpeed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
          me.vx -= 2 * vn * nxv * CAR_TUNING.ballerInflateRestitution;
          me.vy -= 2 * vn * nyv * CAR_TUNING.ballerInflateRestitution;
          // Fling: launch at a big multiple of the entry speed; this momentum is kept.
          const launch = Math.max(preSpeed, me.speed || 0) * CAR_TUNING.ballerInflateBounceSpeedMult;
          const cur = Math.sqrt(me.vx * me.vx + me.vy * me.vy) || 1;
          me.vx = me.vx / cur * launch;
          me.vy = me.vy / cur * launch;
          me.speed = launch;
          me.inflate = 0; // one bounce only — ability ends, momentum held
          addScreenShake(12, 0.28);
          spawnFxBurst(me.x, me.y, me.layer || 0, 'sparks', -nxv * Math.sign(signed), -nyv * Math.sign(signed));
        } else {
          // Off-track but already heading back in — nudge toward centre, stay primed.
          const toward = signed >= 0 ? -1 : 1;
          me.vx += nxv * toward * 160 * dt;
          me.vy += nyv * toward * 160 * dt;
        }
      } else if (mode === 'bouncy') {
        const vn = me.vx * nxv + me.vy * nyv;
        const headingOut = vn * Math.sign(signed) > 0;
        if (headingOut) {
          const bounce = wall ? (wall.bounce || 1) : 1;
          me.vx -= 2 * vn * nxv * bounce;
          me.vy -= 2 * vn * nyv * bounce;
        }
      } else if (mode === 'solid') {
        // Painted solid wall: SLIDE along it. Cancel only the velocity component
        // pushing INTO the wall (so you can't penetrate) and keep the tangential
        // component intact, so the car slides instead of sticking dead.
        const vn = me.vx * nxv + me.vy * nyv;
        if (vn * Math.sign(signed) > 0) {
          me.vx -= vn * nxv;
          me.vy -= vn * nyv;
        }
        const force = wall.force || 120;
        const toward = signed >= 0 ? -1 : 1;
        me.vx += nxv * toward * force * dt;
        me.vy += nyv * toward * force * dt;
      } else if ((me.layer || 0) > 0) {
        // Elevated deck with no wall on this side: there's nothing holding the car on.
        // It slides off the edge (NO push-back toward centre) and the layer-fall physics
        // above drops it a deck at a time. Only a gentle slide-scrub so momentum carries
        // it clear of the deck footprint instead of being nudged back onto the deck.
        const slide = Math.max(0.9, 1 - 0.2 * dt);
        me.vx *= slide;
        me.vy *= slide;
      } else {
        // Default track edge on the ground (no painted wall): grind/push back toward centre.
        const force = 120;
        const toward = signed >= 0 ? -1 : 1;
        me.vx += nxv * toward * force * dt;
        me.vy += nyv * toward * force * dt;
        const grind = Math.max(0.25, Math.min(0.95, 0.5 * CAR_TUNING.offTrackLightSlow));
        me.vx *= grind;
        me.vy *= grind;
      }
    } else {
      me._wallContact = false;
    }

    // On an elevated deck an unwalled edge is an open drop — keep the car's momentum so
    // it slides clear of the deck and falls, instead of scrubbing it to a halt on the lip.
    const elevatedOpenEdge = (me.layer || 0) > 0 && mode === 'default';
    if ((mode === 'default' || mode === 'bouncy') && !elevatedOpenEdge && !((me.inflate || 0) > 0)) {
      // Drifters keep more speed on dirt/off-track than other ships.
      const drifterDirt = me.carType === 'drifter';
      const heavySlow = drifterDirt ? CAR_TUNING.offTrackHeavySlowDrifter : CAR_TUNING.offTrackHeavySlow;
      const lightSlow = drifterDirt ? CAR_TUNING.offTrackLightSlowDrifter : CAR_TUNING.offTrackLightSlow;
      if (effectiveDist > effectiveHalfW + 20) {
        me.vx *= heavySlow;
        me.vy *= heavySlow;
      } else if (effectiveDist > effectiveHalfW) {
        me.vx *= lightSlow;
        me.vy *= lightSlow;
      }
    }
    me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
  }

  const surfaceType = trackSurfaceAt(nx, ny, me.layer || 0);
  if (surfaceType === 'river') {
    const near = pointOnTrack(nx, ny, G.track.spline);
    const p0 = G.track.spline[(near.idx - 1 + G.track.spline.length) % G.track.spline.length];
    const p1 = G.track.spline[(near.idx + 1) % G.track.spline.length];
    let tx = p1.x - p0.x, ty = p1.y - p0.y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    me.vx += tx * CAR_TUNING.riverTrackPush * speedScale * dt;
    me.vy += ty * CAR_TUNING.riverTrackPush * speedScale * dt;
    const riverSlow = Math.max(0, 1 - CAR_TUNING.riverTrackDrag * dt);
    me.vx *= riverSlow;
    me.vy *= riverSlow;
    me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
  }

  // Obstacles
  let onIce = false;
  if (surfaceType === 'ice') onIce = true;
  if (me.ghostMode <= 0) {
    for (let oi = 0; oi < G.track.obstacles.length; oi++) {
      const obs = G.track.obstacles[oi];
      if (obs.active === false) continue;
      ensureObstacleRuntime(obs);
      if (obstacleLayer(obs) !== (me.layer || 0)) continue;
      const d = dist(nx, ny, obs.x, obs.y);
      const hitR = (obs.r || 12) * (obs.scale || 1) + CAR_TUNING.obstacleHitRadiusPad;
      if (obs.type === 'flowing_water' && d < hitR) {
        const push = (55 + (obs.r || 24) * 0.8) * speedScale;
        me.vx += Math.cos(obs.flowDir || 0) * push * dt;
        me.vy += Math.sin(obs.flowDir || 0) * push * dt;
        me.vx *= Math.max(0, 1 - 0.26 * dt);
        me.vy *= Math.max(0, 1 - 0.26 * dt);
        continue;
      }
      if (obs.type === 'ice_track' && d < hitR) {
        onIce = true;
        continue;
      }
      if (obs.type === 'boost_pad' && d < hitR) {
        // Booster strip: no solid collision — you drive straight through it. It shoves
        // you along the pad's arrow, and instead of a nitro flame it fattens your
        // trail for a second.
        const dir = ((obs.rot || 0) * Math.PI) / 180;
        me.vx += Math.cos(dir) * 620 * speedScale * dt;
        me.vy += Math.sin(dir) * 620 * speedScale * dt;
        me.trailBoost = Math.max(me.trailBoost || 0, 1);
        continue;
      }
      if (obs.type === 'repair_pad' && d < hitR) {
        if ((me.health || 0) < (me.maxHealth || CAR_TUNING.baseHealth)) {
          me.health = Math.min(me.maxHealth || CAR_TUNING.baseHealth, (me.health || 0) + 9 * dt);
          if (Math.random() < 0.05) spawnFxBurst(me.x, me.y, me.layer || 0, 'heal');
        }
        continue;
      }
      if (d < hitR) {
        if (me.shielded) {
          // Shield is active: smash the obstacle aside and take no damage. It is NOT
          // consumed here — it blocks every hit for the whole shield duration.
          disableObstacle(oi, 10, true);
        } else {
          if (obs.type === 'snow_pile') {
            spawnSnowBurst(obs.x, obs.y, me.layer || 0, 1 + Math.abs(me.speed) / 260);
            me.vx *= 0.82;
            me.vy *= 0.82;
            me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
            applyDamage(me, CAR_TUNING.obstacleDamage / Math.max(0.5, carCfg.crashResist || 1), 'snow_pile');
            disableObstacle(oi, 12, true);
            break;
          }
          if (obs.type === 'brick_wall') {
            const impactSpeed = Math.max(60, Math.sqrt(me.vx * me.vx + me.vy * me.vy));
            let dirX = me.vx;
            let dirY = me.vy;
            const dirL = Math.sqrt(dirX * dirX + dirY * dirY);
            if (dirL > 1e-5) {
              dirX /= dirL;
              dirY /= dirL;
            } else {
              dirX = Math.cos(me.angle);
              dirY = Math.sin(me.angle);
            }
            me.vx *= 0.55;
            me.vy *= 0.55;
            me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
            applyDamage(me, CAR_TUNING.brickWallDamage / Math.max(0.5, carCfg.crashResist || 1), 'brick_wall');
            me.invuln = Math.max(me.invuln || 0, 0.85);
            disableObstacle(oi, 14, true, { dirX, dirY, speed: impactSpeed });
            addScreenShake(6, 0.16);
            break;
          }

          if (obs.type === 'cone') {
            // Pushable cone: it gets shoved aside, but it still knocks the car
            // back and stings a little — not a free pass.
            const impact = Math.min(700, Math.sqrt(me.vx * me.vx + me.vy * me.vy));
            let cnx = obs.x - nx, cny = obs.y - ny;
            let cnl = Math.sqrt(cnx * cnx + cny * cny);
            if (cnl < 1e-5) { cnx = Math.cos(me.angle); cny = Math.sin(me.angle); cnl = 1; }
            cnx /= cnl; cny /= cnl;
            obs.vx = (obs.vx || 0) + cnx * (impact * 0.9 + 120) + me.vx * 0.4;
            obs.vy = (obs.vy || 0) + cny * (impact * 0.9 + 120) + me.vy * 0.4;
            const coneCap = 900;
            const cvl = Math.sqrt(obs.vx * obs.vx + obs.vy * obs.vy);
            if (cvl > coneCap) { obs.vx *= coneCap / cvl; obs.vy *= coneCap / cvl; }
            broadcastConePush(oi, obs);
            // Knock the car back along the contact normal (away from the cone).
            const kb = (impact * 0.3 + 80) * speedScale * (carCfg.knockbackInMult || 1) / Math.max(0.6, carCfg.crashResist || 1);
            me.vx = me.vx * 0.72 - cnx * kb;
            me.vy = me.vy * 0.72 - cny * kb;
            me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
            playWallHit(Math.min(1, impact / 260));
            addScreenShake(3, 0.1);
            applyDamage(me, CAR_TUNING.obstacleDamage / Math.max(0.5, carCfg.crashResist || 1), 'cone');
            break;
          }

          // Bounce response: separate overlap and reflect velocity along obstacle normal.
          let nxn = nx - obs.x;
          let nyn = ny - obs.y;
          let nl = Math.sqrt(nxn*nxn + nyn*nyn);
          if (nl < 1e-5) {
            nxn = ox - obs.x;
            nyn = oy - obs.y;
            nl = Math.sqrt(nxn*nxn + nyn*nyn);
            if (nl < 1e-5) {
              nxn = -Math.cos(me.angle);
              nyn = -Math.sin(me.angle);
              nl = 1;
            }
          }
          nxn /= nl; nyn /= nl;

          nx = obs.x + nxn * (hitR + 0.6);
          ny = obs.y + nyn * (hitR + 0.6);

          const vx = me.vx, vy = me.vy;
          const vn = vx * nxn + vy * nyn;
          const localRest = obs.type === 'punch_glove' ? 1.2 : (obs.type === 'moving_platform' ? 0.95 : CAR_TUNING.obstacleBounceRestitution);
          const restitution = localRest * carCfg.bounceMult * (1 - (1 - armorMult) * 0.25) / Math.max(0.6, carCfg.crashResist);
          let rvx = vx, rvy = vy;
          if (vn < 0) {
            rvx = vx - (1 + restitution) * vn * nxn;
            rvy = vy - (1 + restitution) * vn * nyn;
            playWallHit(Math.min(1, Math.abs(vn) / 260));
          }

          const kick = (obs.type === 'punch_glove' ? (CAR_TUNING.obstacleBounceKick * 2.1) : (obs.type === 'moving_platform' ? (CAR_TUNING.obstacleBounceKick * 1.2) : CAR_TUNING.obstacleBounceKick)) * speedScale;
          rvx += nxn * kick * carCfg.bounceMult / Math.max(0.6, carCfg.crashResist);
          rvy += nyn * kick * carCfg.bounceMult / Math.max(0.6, carCfg.crashResist);
          rvx += (obs.vx || 0) * (obs.type === 'moving_platform' ? 0.7 : 0.35);
          rvy += (obs.vy || 0) * (obs.type === 'moving_platform' ? 0.7 : 0.35);

          let newSpeed = Math.sqrt(rvx*rvx + rvy*rvy);
          if (newSpeed < CAR_TUNING.obstacleBounceMinSpeed * speedScale) {
            const scale = (CAR_TUNING.obstacleBounceMinSpeed * speedScale) / (newSpeed || 1);
            rvx *= scale;
            rvy *= scale;
            newSpeed = CAR_TUNING.obstacleBounceMinSpeed * speedScale;
          }

          me.vx = rvx;
          me.vy = rvy;
          me.speed = newSpeed;
          applyDamage(me, CAR_TUNING.obstacleDamage / Math.max(0.5, carCfg.crashResist || 1), obs.type || 'obstacle');
        }
        break;
      }
    }

    me._onIce = onIce;
    if (onIce) {
      const fwdIx = Math.cos(me.angle), fwdIy = Math.sin(me.angle);
      const rightIx = -fwdIy, rightIy = fwdIx;
      me.vx += rightIx * steerInput * (CAR_TUNING.iceSteerSlide * speedScale) * dt;
      me.vy += rightIy * steerInput * (CAR_TUNING.iceSteerSlide * speedScale) * dt;
      me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
    }

    // Multiplayer cars: bouncy contact instead of sticky slowdown.
    for (const op of Object.values(G.players)) {
      if (!op || op.id === G.myId || op.finished) continue;
      if (bridgeFloorAt(op.x, op.y) !== (me.layer || 0)) continue;
      const d = dist(nx, ny, op.x, op.y);
      const ballerHit = me.carType === 'baller' || op.carType === 'baller';
      const hitR = CAR_TUNING.carHitRadius * (ballerHit ? 1.38 : 1);
      if (d >= hitR) continue;

      let nxn = nx - op.x;
      let nyn = ny - op.y;
      let nl = Math.sqrt(nxn*nxn + nyn*nyn);
      if (nl < 1e-5) {
        nxn = -Math.cos(me.angle);
        nyn = -Math.sin(me.angle);
        nl = 1;
      }
      nxn /= nl; nyn /= nl;

      const opCfg = getCarTypeCfg(op.carType);
      const iAmBaller = me.carType === 'baller';
      const opIsBaller = op.carType === 'baller';
      // Spikes: a deployed Needle punishes attackers and holds its line — it can't be
      // bumped by anything EXCEPT a Baller mid-ability (an inflated ball).
      const ballerBump = opIsBaller && (op.inflate || 0) > 0;
      const meSpiked = me.carType === 'needle' && (me.spikes || 0) > 0;
      const opSpiked = op.carType === 'needle' && (op.spikes || 0) > 0;
      const spikeImmune = meSpiked && !ballerBump;

      const overlap = hitR - d;
      if (overlap > 0 && !spikeImmune) {
        nx = op.x + nxn * (hitR + 0.5);
        ny = op.y + nyn * (hitR + 0.5);
      }

      const vx = me.vx, vy = me.vy;
      // Simultaneous impact: resolve on the RELATIVE velocity of the two cars so both
      // clients see the same collision and neither car (front or back) can plough
      // through the other unaffected. Reconstruct the rival's velocity from its
      // heading + speed when we don't have its raw vx/vy (networked ghosts).
      const ovx = (typeof op.vx === 'number') ? op.vx : Math.cos(op.angle || 0) * (op.speed || 0);
      const ovy = (typeof op.vy === 'number') ? op.vy : Math.sin(op.angle || 0) * (op.speed || 0);
      const relvx = vx - ovx, relvy = vy - ovy;
      const vn = relvx * nxn + relvy * nyn;
      let rvx = vx, rvy = vy;
      if (vn < 0 || ballerHit) {
        const baseRestitution = CAR_TUNING.carBounceRestitution * carCfg.bounceMult / Math.max(0.6, carCfg.crashResist);
        const restitution = ballerHit ? Math.max(baseRestitution, 1.12) : baseRestitution;
        const effVn = (vn < 0) ? vn : -Math.max(8, Math.abs(me.speed || 0) * 0.12);
        rvx = vx - (1 + restitution) * effVn * nxn;
        rvy = vy - (1 + restitution) * effVn * nyn;
      }

      // Baller throws its weight around: a car HIT by a baller is flung hard, while
      // the baller itself barely gets shoved. Inflated ballers hit even harder.
      const ballerKnock = opIsBaller
        ? CAR_TUNING.ballerHitKnockback * (((op.inflate || 0) > 0) ? 1.5 : 1)
        : (iAmBaller ? CAR_TUNING.ballerSelfKnockback : 1);
      const knockScale = carCfg.bounceMult * opCfg.knockbackOutMult / Math.max(0.6, carCfg.crashResist * opCfg.knockbackInMult);
      const kick = CAR_TUNING.carBounceKick * speedScale * knockScale * ballerKnock;
      rvx += nxn * kick;
      rvy += nyn * kick;

      let newSpeed = Math.sqrt(rvx*rvx + rvy*rvy);
      const minBounceSpeed = CAR_TUNING.carBounceMinSpeed * speedScale * (ballerHit ? 1.65 : 1);
      if (newSpeed < minBounceSpeed) {
        const scale = minBounceSpeed / (newSpeed || 1);
        rvx *= scale;
        rvy *= scale;
        newSpeed = minBounceSpeed;
      }

      // Deployed spikes ignore the knockback (unless an inflated Baller rams them).
      if (!spikeImmune) {
        me.vx = rvx;
        me.vy = rvy;
        me.speed = newSpeed;
      }
      // Ramming a spiked Needle drives its blades into you: 200% collision damage.
      const meDmgMult = opSpiked ? CAR_TUNING.needleSpikesDamageMult : 1;
      applyDamage(me, CAR_TUNING.carCollisionDamage * meDmgMult / Math.max(0.5, carCfg.crashResist || 1), 'car');
      if (op.isBot) {
        // Bots are local — trade paint both ways.
        const opDmgMult = meSpiked ? CAR_TUNING.needleSpikesDamageMult : 1;
        applyDamage(op, CAR_TUNING.carCollisionDamage * opDmgMult / Math.max(0.5, opCfg.crashResist || 1), 'car');
        if (iAmBaller) {
          // A baller bodily throws the bot off its racing line and kills its speed.
          const inflated = (me.inflate || 0) > 0;
          op._speed = (op._speed || 0) * (inflated ? 0.25 : 0.45);
          const shove = inflated ? 40 : 26;
          op.x -= nxn * shove;
          op.y -= nyn * shove;
        } else {
          op._speed = (op._speed || 0) * 0.8;
        }
      }
      break;
    }

    // Oil slicks
    G.track.oilSlicks.forEach(slick => {
      if (bridgeFloorAt(slick.x, slick.y) !== (me.layer || 0)) return;
      const d = dist(nx, ny, slick.x, slick.y);
      if (d < slick.r && !shiftActive) me.angle += (Math.random()-0.5)*0.3;
    });
  }
  if (me.ghostMode > 0) me.ghostMode -= dt;
  if (me.trailBoost > 0) { me.trailBoost -= dt; if (me.trailBoost < 0) me.trailBoost = 0; }
  if (me.shieldTime > 0) { me.shieldTime -= dt; if (me.shieldTime <= 0) { me.shieldTime = 0; me.shielded = false; } }
  else me.shielded = false;

  const fwdNowX = Math.cos(me.angle), fwdNowY = Math.sin(me.angle);
  const rightNowX = -fwdNowY, rightNowY = fwdNowX;
  const lateralNow = me.vx * rightNowX + me.vy * rightNowY;
  const isDriftActive = !isAirborneNext && driftHold && me.speed > 40 && Math.abs(lateralNow) > 7;
  me.drifting = isDriftActive;
  // Ice sliding shimmer: louder when fast and slipping sideways on ice.
  const iceSlideAmt = onIce
    ? Math.min(1, (me.speed / 200) * (0.45 + Math.min(1, Math.abs(lateralNow) / 55)))
    : 0;
  setIceSlide(iceSlideAmt);
  // Tire screech scales with sideways slip while drifting (not on ice — ice
  // has its own shimmer).
  setDriftScreech((isDriftActive && !onIce)
    ? Math.min(1, (Math.abs(lateralNow) / 90) * (0.35 + me.speed / 420))
    : 0);
  if (isDriftActive) {
    me.driftTrailTimer += dt;
    const rearX = nx - fwdNowX * (CAR_H * 0.48);
    const rearY = ny - fwdNowY * (CAR_H * 0.48);
    const wheelSpread = CAR_W * 0.42;
    while (me.driftTrailTimer >= 0.028) {
      me.driftTrailTimer -= 0.028;
      spawnDriftTrail(
        rearX + rightNowX * wheelSpread,
        rearY + rightNowY * wheelSpread,
        me.vx,
        me.vy,
        me.layer || 0
      );
      spawnDriftTrail(
        rearX - rightNowX * wheelSpread,
        rearY - rightNowY * wheelSpread,
        me.vx,
        me.vy,
        me.layer || 0
      );
    }
    // Persistent rubber laid under the drift smoke.
    const skLx = rearX + rightNowX * wheelSpread, skLy = rearY + rightNowY * wheelSpread;
    const skRx = rearX - rightNowX * wheelSpread, skRy = rearY - rightNowY * wheelSpread;
    if (me._skidPrev) {
      addSkidSegment(me._skidPrev.lx, me._skidPrev.ly, skLx, skLy, me.layer || 0, 3.2);
      addSkidSegment(me._skidPrev.rx, me._skidPrev.ry, skRx, skRy, me.layer || 0, 3.2);
    }
    me._skidPrev = { lx: skLx, ly: skLy, rx: skRx, ry: skRy };
  } else {
    me.driftTrailTimer = 0;
    me._skidPrev = null;
  }

  me.x = nx; me.y = ny;
  // Portal gates: if we just drove across one, teleport to its linked partner.
  if (G.track && G.track.gates && G.track.gates.length) tryGateTeleport(me, _gateFromX, _gateFromY, dt);

  // Lap clock (only ticks while the race is live, so it's pause-immune),
  // top-speed stat and best-lap ghost recording.
  me._lapClock = (me._lapClock || 0) + dt;
  if (G.raceStats && me.speed > G.raceStats.topSpeed) G.raceStats.topSpeed = me.speed;
  if (!me.finished) ghostRecordSample(me);

  // Ordered checkpoint gates (custom maps): must pass in sequence to validate lap.
  // Gates sharing a non-zero `link` id form an "any-of" group (the alternative gates
  // on a split) — crossing EITHER one clears the whole group (see checkpointGroupEnd).
  if (G.track && G.track.checkpoints && G.track.checkpoints.length) {
    const cps = G.track.checkpoints;
    if (me.nextCheckpoint == null) me.nextCheckpoint = 0;
    if (me.checkpointsDoneThisLap == null) me.checkpointsDoneThisLap = (me.nextCheckpoint >= cps.length);
    if (me.nextCheckpoint < cps.length) {
      const groupEnd = checkpointGroupEnd(cps, me.nextCheckpoint);
      let crossedIdx = -1;
      for (let ci = me.nextCheckpoint; ci < groupEnd; ci++) {
        const cp = cps[ci];
        if (!cp || (me.layer || 0) !== (cp.layer || 0)) continue;
        const sidePrev = (ox - cp.x) * cp.tx + (oy - cp.y) * cp.ty;
        const sideNow  = (me.x - cp.x) * cp.tx + (me.y - cp.y) * cp.ty;
        const lateral  = Math.abs((me.x - cp.x) * cp.nx + (me.y - cp.y) * cp.ny);
        // Gates validate from either direction — crossing the gate plane within its
        // width counts regardless of travel direction.
        const crossed = (sidePrev === 0 || sideNow === 0 || sidePrev * sideNow < 0);
        if (crossed && lateral <= cp.halfW * 1.3) { crossedIdx = ci; break; }
      }
      if (crossedIdx >= 0) {
        me.lastCpCrossed = crossedIdx;
        me.nextCheckpoint = groupEnd;
        me.lastCheckpointTime = G.raceStartTime ? (Date.now() - G.raceStartTime) : 0;
        spawnCheckpointConfetti(crossedIdx, cps.length);
        if (me.nextCheckpoint >= cps.length) me.checkpointsDoneThisLap = true;
      }
    }
  }

  // Item pickup — host-authoritative: taking a box disables it for everyone for 30s.
  // (Respawn is driven by the host in updateItemRespawns, not per-client here.)
  if (!me.heldItem) {
    // Magnet upgrade: much larger pickup radius.
    const pickR = ups.includes('mag') ? 52 : 20;
    G.track.items.forEach((item, idx) => {
      if (item.active === false || me.heldItem) return;
      if (dist(me.x, me.y, item.x, item.y) < pickR) {
        const carCfg = getCarTypeCfg(me.carType);
        let chosenId;
        if (carCfg.itemWeights) {
          // Regular roster: draw from the ship's own weighted affinity pool.
          chosenId = rollWeightedItem(carCfg.itemWeights, ups.includes('luckbox'));
        } else {
          // Prototype ships: the classic universal pool + 25% class-unique roll.
          const pool = ups.includes('luckbox')
            ? POWERUPS_LIST
            : POWERUPS_LIST.filter(p=>p.id!=='missile'||Math.random()<0.5);
          chosenId = pool[Math.floor(Math.random()*pool.length)].id;
          const uniq = CAR_UNIQUE_POWERUPS[me.carType];
          if (uniq && Math.random() < 0.25) chosenId = uniq.id;
        }
        me.heldItem = chosenId;
        G.heldItem = chosenId;
        startItemRoulette(); // slot-machine flicker, then reveals the real item
        playPowerupPickup();
        spawnFxBurst(item.x, item.y, me.layer || 0, 'pickup');
        disableItem(idx, CAR_TUNING.powerupRespawnSec, true);
      }
    });
  }

  // Lap counting via track progress
  const { idx } = pointOnTrack(me.x, me.y, G.track.spline);
  const totalPts = G.track.spline.length;
  const prog = idx / totalPts;

  // Wrong-way detection: sustained movement against the spline direction.
  {
    const spWW = G.track.spline;
    const aWW = spWW[idx], bWW = spWW[(idx + 1) % spWW.length];
    let twx = bWW.x - aWW.x, twy = bWW.y - aWW.y;
    const twl = Math.hypot(twx, twy) || 1;
    const along = (me.vx * twx + me.vy * twy) / twl;
    if (along < -60 && me.speed > 60) me._wrongWayT = (me._wrongWayT || 0) + dt;
    else me._wrongWayT = Math.max(0, (me._wrongWayT || 0) - dt * 2);
    me._wrongWay = (me._wrongWayT || 0) > 0.9;
  }
  const prevProg = me.lapProgress;
  const hasCheckpoints = !!(G.track && G.track.checkpoints && G.track.checkpoints.length);
  if (!hasCheckpoints) me.checkpointsDoneThisLap = false;

  // Lap arming: a finish-line crossing only counts once the car has actually
  // been around the far side of the track this lap. Without this, wiggling
  // back and forth across the start line (reverse over it, then drive forward
  // again) counted a fresh lap every time — an infinite lap-farm exploit on
  // any track without ordered checkpoints. A real lap always sweeps the
  // spline-progress value through the middle range, so passing 0.3–0.7 arms
  // the next crossing; finishing a lap disarms it again.
  if (prog > 0.3 && prog < 0.7) me._lapArmed = true;

  function finishLapNow() {
    me.lastLapTime = G.raceStartTime ? (Date.now() - G.raceStartTime) : 0;
    // Rotor: crossing the finish line repairs the propeller.
    if (me.carType === 'rotor') { me.propHealth = CAR_TUNING.rotorPropMaxHealth; me.propBroken = false; }

    // Lap timing via the pause-immune lap clock: stats + best-lap ghost.
    const lapMs = Math.round((me._lapClock || 0) * 1000);
    if (G.raceStats && lapMs > 3000) {
      G.raceStats.bestLapMs = (G.raceStats.bestLapMs == null || lapMs < G.raceStats.bestLapMs) ? lapMs : G.raceStats.bestLapMs;
    }
    if (ghostEnabled() && lapMs > 3000 && G.ghostRec && G.ghostRec.frames.length > 4) {
      ghostRecordSample(me, true); // capture the finish-line frame
      const prev = G.ghostPlay;
      if (!prev || lapMs < prev.lapMs) {
        const shape = getCarTypeCfg(me.carType).shape;
        saveBestGhost(lapMs, G.ghostRec.frames, shape);
        G.ghostPlay = { lapMs, frames: G.ghostRec.frames, shape };
        addToast('★ NEW BEST LAP ' + formatFinishTime(lapMs), { color: '#fde047', glow: '#f59e0b', size: 26, duration: 2.6 });
      } else {
        const dMs = lapMs - prev.lapMs;
        addToast((dMs >= 0 ? '+' : '−') + (Math.abs(dMs) / 1000).toFixed(2) + 's vs best',
          { color: dMs >= 0 ? '#f87171' : '#4ade80', glow: dMs >= 0 ? '#b91c1c' : '#16a34a', size: 20, duration: 2.0 });
      }
    }
    me._lapClock = 0;
    G.ghostRec = null; // fresh recording starts with the new lap

    me.lap++;
    me.nextCheckpoint = 0;
    me.lastCpCrossed = null;
    me.checkpointsDoneThisLap = false;
    me._lapArmed = false; // must go around the track again before the line counts
    me.lapProgress = prog;
    if (me.lap > G.totalLaps) {
      if (!me.finished) {
        me.finished = true;
        me.vx = 0; me.vy = 0; me.speed = 0;
        me.finishTime = Date.now();
        me.finishElapsedMs = G.raceStartTime ? (Date.now() - G.raceStartTime) : 0;
        G.finishOrder.push(me.id);
        addToast('FINISHED!', { color: '#4ade80', glow: '#16a34a', size: 36, duration: 2.2 });
        addFeed(`🏁 ${me.name} finished P${G.finishOrder.length}`);
        G._finishPunch = 1;
        playFinalLapSting();
        broadcast({ type:'player_finished', id:me.id, time: me.finishElapsedMs });
        checkRaceOver();
      }
    } else {
      if (me.lap === G.totalLaps) {
        addToast('FINAL LAP!', { color: '#fbbf24', glow: '#f59e0b', size: 34, duration: 2.4 });
        playFinalLapSting();
      } else {
        addToast(`LAP ${me.lap}/${G.totalLaps}`, { color: '#c084fc', glow: '#7c3aed', size: 28, duration: 1.8 });
        playLapJingle();
      }
      showUpgradeScreen();
    }
  }

  // detect wrap-around (finish line crossing)
  // The finish line lives at spline index 0; only count it when the car is on
  // the same layer as that section. Otherwise driving UNDER an elevated finish
  // (on the ground) falsely completes the lap via the layer-agnostic progress wrap.
  const finishLayer = supportFloorAtSplineIdx(0) || 0;
  const onFinishLayer = (me.layer || 0) === finishLayer;
  const didCrossFinish = (prevProg > 0.85 && prog < 0.15) && onFinishLayer && me._lapArmed === true;
  if (didCrossFinish) {
    if (!hasCheckpoints || me.checkpointsDoneThisLap) {
      finishLapNow();
    } else {
      me.lapProgress = prog;
    }
  } else {
    me.lapProgress = prog;
  }
  // Only check ramp gates when on the ground (not mid-air) — prevents gate
  // triggers while flying over bridge endpoints during jumps.
  if (!isAirborneNext) checkRampTransitions(me, ox, oy, me.x, me.y);
}

function spawnDriftTrail(x, y, carVx, carVy, layer) {
  const speed = Math.sqrt(carVx * carVx + carVy * carVy);
  const life = 0.22 + Math.random() * 0.16;
  const hue = 20 + Math.random() * 28;
  G.driftTrails.push({
    x,
    y,
    vx: carVx * 0.28 + (Math.random() - 0.5) * 24,
    vy: carVy * 0.28 + (Math.random() - 0.5) * 24,
    r: 1.8 + Math.random() * 1.7 + Math.min(1.2, speed * 0.004),
    life,
    maxLife: life,
    layer: layer || 0,
    color: `hsla(${hue}, 100%, ${52 + Math.random() * 10}%, 1)`,
  });
  if (G.driftTrails.length > 700) G.driftTrails.splice(0, G.driftTrails.length - 700);
}

function updateDriftTrails(dt) {
  if (!G.driftTrails.length) return;
  for (let i = G.driftTrails.length - 1; i >= 0; i--) {
    const t = G.driftTrails[i];
    t.life -= dt;
    if (t.life <= 0) {
      G.driftTrails.splice(i, 1);
      continue;
    }
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.vx *= Math.max(0, 1 - 3.4 * dt);
    t.vy *= Math.max(0, 1 - 3.4 * dt);
    t.r *= (1 + 1.3 * dt);
  }
}

function spawnCheckpointConfetti(cpIdx, cpTotal) {
  const W = canvas.width || 1280;
  const H = canvas.height || 720;
  const count = Math.max(1, cpTotal || 1);
  const slot = 30;
  const originX = W * 0.5 + ((cpIdx + 0.5) - count * 0.5) * slot;
  const originY = H - 40;
  const burst = 34;
  const colors = ['#fbbf24', '#f59e0b', '#fde68a', '#22c55e', '#38bdf8'];
  for (let i = 0; i < burst; i++) {
    const ang = -Math.PI * (0.5 + Math.random() * 0.65);
    const spd = 140 + Math.random() * 250;
    const life = 0.45 + Math.random() * 0.5;
    G.checkpointConfetti.push({
      x: originX + (Math.random() - 0.5) * 8,
      y: originY + (Math.random() - 0.5) * 6,
      vx: Math.cos(ang) * spd + (Math.random() - 0.5) * 90,
      vy: Math.sin(ang) * spd - Math.random() * 40,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 10,
      w: 3 + Math.random() * 5,
      h: 5 + Math.random() * 8,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  if (G.checkpointConfetti.length > 420) {
    G.checkpointConfetti.splice(0, G.checkpointConfetti.length - 420);
  }
}

function updateCheckpointConfetti(dt) {
  if (!G.checkpointConfetti.length) return;
  for (let i = G.checkpointConfetti.length - 1; i >= 0; i--) {
    const p = G.checkpointConfetti[i];
    p.life -= dt;
    if (p.life <= 0) {
      G.checkpointConfetti.splice(i, 1);
      continue;
    }
    p.vy += 420 * dt;
    p.vx *= Math.max(0, 1 - 0.35 * dt);
    p.vy *= Math.max(0, 1 - 0.18 * dt);
    p.rot += p.spin * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function drawCheckpointConfetti(ctx) {
  if (!G.checkpointConfetti.length) return;
  ctx.save();
  G.checkpointConfetti.forEach(p => {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = Math.min(1, a);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
    ctx.rotate(-p.rot);
    ctx.translate(-p.x, -p.y);
  });
  ctx.restore();
}

function addScreenShake(mag, dur) {
  G.camera.shakeMag = Math.max(G.camera.shakeMag || 0, mag || 0);
  G.camera.shakeTime = Math.max(G.camera.shakeTime || 0, dur || 0);
}

function spawnExplosion(x, y, radius, kind) {
  const life = kind === 'death' ? 0.55 : 0.35;
  G.explosions.push({ x, y, radius: radius || 80, life, maxLife: life, kind: kind || 'blast' });
  if (kind === 'death') spawnMushroomCloud(x, y, radius || 80);
  if (G.explosions.length > 120) G.explosions.splice(0, G.explosions.length - 120);
}

function spawnMushroomCloud(x, y, radius) {
  const R = Math.max(72, radius || 90);
  const countStem = Math.round(20 + R * 0.14);
  const countCap = Math.round(54 + R * 0.25);
  const countEmbers = Math.round(18 + R * 0.09);

  function pushParticle(p) {
    G.nukeParticles.push(p);
  }

  // Narrow rising stem
  for (let i = 0; i < countStem; i++) {
    const L = 0.95 + Math.random() * 0.65;
    const side = (Math.random() - 0.5) * (R * 0.22);
    const lift = Math.random() * (R * 0.35);
    pushParticle({
      x: x + side,
      y: y - lift,
      vx: side * 0.45,
      vy: -(90 + Math.random() * 120),
      ay: -(14 + Math.random() * 18),
      drag: 1.7,
      r: 6 + Math.random() * (R * 0.08),
      life: L,
      maxLife: L,
      c0: [255, 180, 95],
      c1: [74, 74, 78],
      a0: 0.42
    });
  }

  // Bulbous cap with outward roll
  for (let i = 0; i < countCap; i++) {
    const L = 1.1 + Math.random() * 0.85;
    const ang = Math.random() * Math.PI * 2;
    const ring = (0.35 + Math.random() * 0.75) * R;
    const px = x + Math.cos(ang) * ring;
    const py = y - R * (0.55 + Math.random() * 0.38) + Math.sin(ang * 2.1) * R * 0.06;
    pushParticle({
      x: px,
      y: py,
      vx: Math.cos(ang) * (46 + Math.random() * 80),
      vy: -(35 + Math.random() * 55),
      ay: -(10 + Math.random() * 16),
      drag: 1.25,
      r: 7 + Math.random() * (R * 0.12),
      life: L,
      maxLife: L,
      c0: [255, 158, 66],
      c1: [68, 68, 74],
      a0: 0.48
    });
  }

  // Hot inner embers
  for (let i = 0; i < countEmbers; i++) {
    const L = 0.3 + Math.random() * 0.35;
    const ang = Math.random() * Math.PI * 2;
    const d = Math.random() * (R * 0.33);
    pushParticle({
      x: x + Math.cos(ang) * d,
      y: y - Math.random() * (R * 0.2),
      vx: Math.cos(ang) * (70 + Math.random() * 110),
      vy: -(80 + Math.random() * 120),
      ay: 110 + Math.random() * 130,
      drag: 2.2,
      r: 2.5 + Math.random() * 3.5,
      life: L,
      maxLife: L,
      c0: [255, 235, 155],
      c1: [255, 120, 45],
      a0: 0.95
    });
  }

  if (G.nukeParticles.length > 1200) {
    G.nukeParticles.splice(0, G.nukeParticles.length - 1200);
  }
}

// Accumulates fractional per-frame damage (overcharge / electric arc) and only
// commits it through applyDamage once it reaches a whole point — avoids the
// Math.max(1,...) floor turning tiny per-frame drains into ~60 dmg/second.
function applyContinuousDamage(player, hp, cause) {
  if (!player || hp <= 0) return;
  player._dmgAccum = (player._dmgAccum || 0) + hp;
  if (player._dmgAccum >= 1) {
    const whole = Math.floor(player._dmgAccum);
    player._dmgAccum -= whole;
    applyDamage(player, whole, cause);
  }
}

function applyDamage(player, rawDamage, cause) {
  if (!player || player.finished || player.deathRespawn > 0 || player.invuln > 0) return false;
  // Active shield blocks ALL incoming hits for its full duration (never consumed by a
  // single hit, so it can no longer be an insta-kill trap). Self-inflicted costs (e.g.
  // the Needle deathray) subtract health directly and never route through here.
  if (player.shielded) return false;
  const dmg = Math.max(1, rawDamage || 0);
  // Rotor: physical hits chip the front propeller; enough damage breaks it.
  if (player.carType === 'rotor' && !player.propBroken && cause !== 'overcharge' && cause !== 'arc' && cause !== 'drain' && cause !== 'deathray') {
    player.propHealth = Math.max(0, (player.propHealth != null ? player.propHealth : CAR_TUNING.rotorPropMaxHealth) - CAR_TUNING.rotorPropHitDamage);
    if (player.propHealth <= 0) { player.propHealth = 0; player.propBroken = true; }
  }
  player.health = Math.max(0, (player.health || player.maxHealth || CAR_TUNING.baseHealth) - dmg);
  // Floating damage number over the victim.
  if (dmg >= 1 && Array.isArray(G.fx)) {
    spawnFxParticle({
      x: player.x + (Math.random() - 0.5) * 8, y: player.y - 10,
      vx: (Math.random() - 0.5) * 20, vy: -46,
      r: dmg >= 20 ? 13 : 11, life: 0.75, maxLife: 0.75, layer: player.layer || 0,
      c0: [255, 140, 100], c1: [255, 60, 60], a0: 1, drag: 1.5, grow: 0,
      text: '-' + Math.round(dmg),
    });
  }
  if (player.id === G.myId && G.raceStats) G.raceStats.dmgTaken += dmg;
  if (player.health <= 0) {
    player.deathRespawn = CAR_TUNING.deathRespawnTime;
    player.invuln = CAR_TUNING.respawnInvuln;
    player.vx = 0; player.vy = 0; player.speed = 0;
    spawnExplosion(player.x, player.y, CAR_TUNING.deathExplosionRadius, 'death');
    addScreenShake(CAR_TUNING.deathExplosionShake, 0.35);
    addFeed(`💥 ${player.name || 'Racer'} wrecked`);
    broadcast({ type:'death_explosion', x: player.x, y: player.y, radius: CAR_TUNING.deathExplosionRadius, layer: player.layer || 0, id: player.id, cause: cause || 'hit' });
    return true;
  }
  return false;
}

function updateMines(dt) {
  if (!G.mines.length) return;
  for (let i = G.mines.length - 1; i >= 0; i--) {
    const m = G.mines[i];
    m.arm -= dt;
    m.life -= dt;
    if (m.life <= 0) {
      G.mines.splice(i, 1);
      continue;
    }
    if (m.arm > 0) continue;
    // Locally simulated bots can trip mines too.
    let tripped = false;
    for (const p of Object.values(G.players)) {
      if (!p.isBot || p.finished || p.deathRespawn > 0 || p.id === m.ownerId) continue;
      if ((m.layer || 0) !== (p.layer || 0)) continue;
      if (dist(p.x, p.y, m.x, m.y) <= (m.blastR || 92) * 0.6) {
        spawnExplosion(m.x, m.y, m.blastR || 92, 'mine');
        applyDamage(p, m.damage || CAR_TUNING.mineDamage, 'mine');
        p.stun = Math.max(p.stun || 0, 0.9);
        p._speed = (p._speed || 0) * 0.35;
        broadcast({ type:'mine_exploded', id:m.id, x:m.x, y:m.y, radius:m.blastR || 92 });
        G.mines.splice(i, 1);
        tripped = true;
        break;
      }
    }
    if (tripped) continue;
    const me = G.players[G.myId];
    if (!me || me.deathRespawn > 0) continue;
    if ((m.layer || 0) !== (me.layer || 0)) continue;
    if (m.ownerId === G.myId) continue;
    if (dist(me.x, me.y, m.x, m.y) <= (m.blastR || 92) * 0.6) {
      spawnExplosion(m.x, m.y, m.blastR || 92, 'mine');
      addScreenShake(7, 0.18);
      applyDamage(me, m.damage || CAR_TUNING.mineDamage, 'mine');
      broadcast({ type:'mine_exploded', id:m.id, x:m.x, y:m.y, radius:m.blastR || 92 });
      G.mines.splice(i, 1);
    }
  }
}

function applyPulseBlast(pulse) {
  // Bots are simulated locally, so the local client resolves blast hits on them.
  Object.values(G.players).forEach(p => {
    if (!p.isBot || p.finished || p.deathRespawn > 0 || p.id === pulse.ownerId) return;
    if ((pulse.layer || 0) !== (p.layer || 0)) return;
    const bd = dist(p.x, p.y, pulse.x, pulse.y);
    if (bd > (pulse.radius || 100)) return;
    const bt = 1 - bd / (pulse.radius || 100);
    applyDamage(p, (pulse.damage || CAR_TUNING.pulseDamage) * (0.5 + 0.5 * bt), 'pulse');
    p.stun = Math.max(p.stun || 0, 0.5);
    p._speed = (p._speed || 0) * 0.5;
  });
  const me = G.players[G.myId];
  if (!me || me.deathRespawn > 0) return;
  if ((pulse.layer || 0) !== (me.layer || 0)) return;
  if (pulse.ownerId === G.myId) return;
  const d = dist(me.x, me.y, pulse.x, pulse.y);
  if (d > (pulse.radius || 100)) return;
  const t = 1 - d / (pulse.radius || 100);
  applyDamage(me, (pulse.damage || CAR_TUNING.pulseDamage) * (0.5 + 0.5 * t), 'pulse');
  const nx = (me.x - pulse.x) / (d || 1);
  const ny = (me.y - pulse.y) / (d || 1);
  me.vx += nx * 90 * t;
  me.vy += ny * 90 * t;
}

// EMP item: shocks and stalls every racer near the blast point (no damage —
// it steals momentum instead). Shield blocks it. Bots resolve locally.
function applyEmpBlast(emp) {
  const R = 260;
  const me = G.players[G.myId];
  if (me && emp.ownerId !== G.myId && me.deathRespawn <= 0 && !me.finished &&
      (me.layer || 0) === (emp.layer || 0) && dist(me.x, me.y, emp.x, emp.y) <= R) {
    if (me.shielded) {
      me.shielded = false;
    } else {
      me.stun = Math.max(me.stun || 0, 1.4);
      me.vx *= 0.35; me.vy *= 0.35;
      me.speed = Math.hypot(me.vx, me.vy);
      me.boosting = 0;
      addScreenShake(5, 0.2);
    }
  }
  Object.values(G.players).forEach(p => {
    if (!p.isBot || p.finished || p.deathRespawn > 0 || p.id === emp.ownerId) return;
    if ((p.layer || 0) !== (emp.layer || 0)) return;
    if (dist(p.x, p.y, emp.x, emp.y) <= R) {
      p.stun = Math.max(p.stun || 0, 1.4);
      p._speed = (p._speed || 0) * 0.3;
      p.boosting = 0;
    }
  });
}

function updateExplosions(dt) {
  if (G.camera.shakeTime > 0) {
    G.camera.shakeTime = Math.max(0, G.camera.shakeTime - dt);
    if (G.camera.shakeTime <= 0) G.camera.shakeMag = 0;
  }
  for (let i = G.explosions.length - 1; i >= 0; i--) {
    G.explosions[i].life -= dt;
    if (G.explosions[i].life <= 0) G.explosions.splice(i, 1);
  }

  for (let i = G.nukeParticles.length - 1; i >= 0; i--) {
    const p = G.nukeParticles[i];
    p.life -= dt;
    if (p.life <= 0) {
      G.nukeParticles.splice(i, 1);
      continue;
    }
    p.vx *= Math.max(0, 1 - p.drag * dt);
    p.vy += (p.ay || 0) * dt;
    p.vy *= Math.max(0, 1 - 0.35 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function drawExplosions(ctx) {
  if (!G.explosions.length && !G.nukeParticles.length) return;
  ctx.save();

  if (G.nukeParticles.length) {
    G.nukeParticles.forEach(p => {
      const t = 1 - p.life / p.maxLife;
      const a = Math.max(0, (1 - t) * (p.a0 || 0.6));
      const rr = Math.round(lerp(p.c0[0], p.c1[0], t));
      const gg = Math.round(lerp(p.c0[1], p.c1[1], t));
      const bb = Math.round(lerp(p.c0[2], p.c1[2], t));
      ctx.fillStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.8 + 1.55 * t), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  G.explosions.forEach(e => {
    const t = 1 - e.life / e.maxLife;
    const r = e.radius * (0.35 + 0.75 * t);
    const a = Math.max(0, 1 - t);
    const core = e.kind === 'death' ? 'rgba(255,120,60,' + (0.45 * a) + ')'
      : e.kind === 'emp' ? 'rgba(56,189,248,' + (0.4 * a) + ')'
      : 'rgba(255,190,80,' + (0.35 * a) + ')';
    const ring = e.kind === 'death' ? 'rgba(255,240,170,' + (0.65 * a) + ')'
      : e.kind === 'emp' ? 'rgba(165,243,252,' + (0.7 * a) + ')'
      : 'rgba(255,220,130,' + (0.45 * a) + ')';
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ring;
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

function drawMines(ctx, layer) {
  if (!G.mines.length) return;
  G.mines.forEach(m => {
    if ((m.layer || 0) !== (layer || 0)) return;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = m.arm > 0 ? 'rgba(148,163,184,0.9)' : 'rgba(249,115,22,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, m.r || 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawDriftTrails(ctx, layer) {
  if (!G.driftTrails.length) return;
  ctx.save();
  G.driftTrails.forEach(t => {
    if ((t.layer || 0) !== (layer || 0)) return;
    const a = Math.max(0, t.life / t.maxLife);
    ctx.globalAlpha = Math.min(1, a * 0.95);
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// Remote (networked, non-bot) players are moved by interpolating toward the last
// packet we received instead of snapping to it. We dead-reckon the target forward by
// the packet's age using its reported heading+speed, then smoothly chase that point.
// This removes the visual rubber-banding from the throttled state updates.
function updateRemotePlayers(dt) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  for (const p of Object.values(G.players)) {
    if (!p || p.id === G.myId || p.isBot) continue;
    if (p._netX === undefined) continue;
    // Extrapolate the target using the last known velocity (capped so a dropped
    // packet can't fling the ghost car far off).
    const age = Math.min(0.25, (now - (p._netTime || now)) / 1000);
    const tvx = Math.cos(p._netAngle || 0) * (p._netSpeed || 0);
    const tvy = Math.sin(p._netAngle || 0) * (p._netSpeed || 0);
    const tx = p._netX + tvx * age;
    const ty = p._netY + tvy * age;
    const d = Math.hypot(tx - (p.x || 0), ty - (p.y || 0));
    if (d > 400) {
      // Big jump (teleport / respawn / first packet): snap, don't glide.
      p.x = tx; p.y = ty; p.angle = p._netAngle || 0;
    } else {
      const posK = Math.min(1, dt * 14);
      p.x += (tx - p.x) * posK;
      p.y += (ty - p.y) * posK;
      let da = (p._netAngle || 0) - (p.angle || 0);
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      p.angle = (p.angle || 0) + da * Math.min(1, dt * 12);
    }
    p.vx = tvx; p.vy = tvy;
  }
}

let sendThrottle = 0;
function sendMyState() {
  sendThrottle++;
  if (sendThrottle % 2 !== 0) return;
  const me = G.players[G.myId];
  if (!me) return;
  broadcast({
    type:'player_update', id:G.myId,
    state:{ x:me.x,y:me.y,angle:me.angle,speed:me.speed,lap:me.lap,lapProgress:me.lapProgress,nextCheckpoint:me.nextCheckpoint,lastCheckpointTime:me.lastCheckpointTime,lastLapTime:me.lastLapTime,finished:me.finished,stun:me.stun,boosting:me.boosting,ghostMode:me.ghostMode,shielded:me.shielded,layer:me.layer,airTime:me.airTime,health:me.health,maxHealth:me.maxHealth,deathRespawn:me.deathRespawn,invuln:me.invuln,propBroken:me.propBroken,wobble:me.wobble,battery:me.battery,arcing:me.arcing,arcAngle:me.arcAngle,honkCooldown:me.honkCooldown,inflate:me.inflate,spikes:me.spikes,arcBurst:me.arcBurst,downdraft:me.downdraft,deathray:me.deathray,drain:me.drain,drainedBy:me.drainedBy,ghoulSlow:me.ghoulSlow,noControl:me.noControl }
  });
}

function checkRaceOver() {
  if (G.raceOver) return;
  const total = Object.keys(G.players).length;
  // Everyone still in the room has finished -> results. (Also re-checked from
  // the host's connection-close handler, so a mid-race rage-quit can no longer
  // leave the survivors stuck waiting on a player who is gone.)
  if (total > 0 && G.finishOrder.length >= total) { showResults(); return; }
  // First finisher starts a 30s clock for everyone else; stragglers DNF when
  // it runs out. (This window was always documented here but never actually
  // implemented, so a single AFK/crashed racer used to hang the race forever.)
  if (G.finishOrder.length > 0 && !G._dnfDeadline) {
    G._dnfDeadline = Date.now() + 30000;
    const me = G.players[G.myId];
    if (me && !me.finished && typeof addToast === 'function') {
      addToast('30s TO FINISH!', { color: '#f87171', glow: '#b91c1c', size: 26, duration: 2.4 });
    }
  }
}

// Ticked from the game loop: ends the race when the post-first-finish window expires.
function checkDnfWindow() {
  if (G.raceOver || !G._dnfDeadline) return;
  if (!G.finishOrder.length) { G._dnfDeadline = 0; return; } // race was reset
  if (Date.now() >= G._dnfDeadline) showResults();
}
