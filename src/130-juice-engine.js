// ============================================================
// JUICE ENGINE — particles, skid marks, toasts, jingles, AI bots
// ============================================================

// ---- Unified particle pool -------------------------------------------------
// Entries: {x,y,vx,vy,r,life,maxLife,layer,c0,c1,a0,drag,grow}

// Turn a desired particle count into an actual one, scaled by fxSpawnScale()
// (rolling-FPS + Low FX). Fractional remainders spawn probabilistically so low
// scales still emit an occasional particle instead of rounding to zero.
function fxCount(base) {
  const n = base * fxSpawnScale();
  const whole = Math.floor(n);
  return whole + (Math.random() < (n - whole) ? 1 : 0);
}

function spawnFxParticle(p) {
  G.fx.push(p);
  // Hard cap keeps the pool bounded; tighter under Low FX so slow machines never
  // pay for a huge live-particle count.
  const cap = lowFxOn() ? 280 : 900;
  if (G.fx.length > cap) G.fx.splice(0, G.fx.length - cap);
}

function spawnFxBurst(x, y, layer, kind, dirX, dirY) {
  if (kind === 'pickup') {
    const N = fxCount(14);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 130;
      const L = 0.35 + Math.random() * 0.3;
      spawnFxParticle({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, r: 1.6 + Math.random()*1.8,
        life: L, maxLife: L, layer, c0: [253,224,71], c1: [251,146,60], a0: 0.95, drag: 3.4, grow: 0 });
    }
  } else if (kind === 'heal') {
    const N = fxCount(12);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 60;
      const L = 0.5 + Math.random() * 0.35;
      spawnFxParticle({ x: x + (Math.random()-0.5)*18, y: y + (Math.random()-0.5)*18,
        vx: Math.cos(a)*s*0.4, vy: -30 - Math.random()*50, r: 1.8 + Math.random()*1.6,
        life: L, maxLife: L, layer, c0: [134,239,172], c1: [34,197,94], a0: 0.9, drag: 2.0, grow: 0 });
    }
  } else if (kind === 'emp') {
    const N = Math.max(6, fxCount(26));
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.2, s = 180 + Math.random() * 160;
      const L = 0.3 + Math.random() * 0.25;
      spawnFxParticle({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, r: 1.4 + Math.random()*1.6,
        life: L, maxLife: L, layer, c0: [165,243,252], c1: [56,189,248], a0: 0.95, drag: 2.6, grow: 0 });
    }
  } else if (kind === 'sparks') {
    const bx = dirX || 0, by = dirY || 0;
    const N = fxCount(5);
    for (let i = 0; i < N; i++) {
      const a = Math.atan2(by, bx) + (Math.random() - 0.5) * 1.6;
      const s = 60 + Math.random() * 170;
      const L = 0.16 + Math.random() * 0.18;
      spawnFxParticle({ x: x + (Math.random()-0.5)*4, y: y + (Math.random()-0.5)*4,
        vx: Math.cos(a)*s, vy: Math.sin(a)*s, r: 1 + Math.random()*1.4,
        life: L, maxLife: L, layer, c0: [255,240,180], c1: [251,113,36], a0: 1, drag: 4.5, grow: 0 });
    }
  }
}

// Ambient per-car emitters: engine exhaust, boost flame trail, damage smoke.
function updateFxEmitters(dt) {
  if (!G.raceStarted || !G.track) return;
  // Widen emit intervals when frames get expensive / Low FX is on (>= scale means
  // fewer exhaust + smoke particles). Clamped so cars never go fully smokeless.
  const emitScl = Math.max(0.2, fxSpawnScale());
  const lowFx = lowFxOn();
  framePlayers().forEach(p => {
    if (p.finished || (p.deathRespawn || 0) > 0) return;
    const spd = Math.abs(p.speed || 0);
    const boost = (p.boosting || 0) > 0;
    const rearX = p.x - Math.cos(p.angle) * (CAR_H * 0.62);
    const rearY = p.y - Math.sin(p.angle) * (CAR_H * 0.62);
    // Custom exhaust-smoke color, and an always-on trail color (independent of nitro).
    const smokeRgb = p.smokeColor ? hexToRgb(p.smokeColor) : null;
    const trailRgb = p.trailColor ? hexToRgb(p.trailColor) : null;
    // Exhaust smoke: faster = denser and hotter; boosting swaps to flame colors.
    // (Nitro flame stays its own default colors — the custom trail below is separate.)
    p._exhaustT = (p._exhaustT || 0) + dt;
    const rate = (boost ? 0.016 : (spd > 40 ? Math.max(0.03, 0.11 - spd * 0.00012) : 0.22)) / emitScl;
    while (p._exhaustT >= rate) {
      p._exhaustT -= rate;
      const jx = (Math.random() - 0.5) * 6, jy = (Math.random() - 0.5) * 6;
      const L = boost ? 0.26 + Math.random() * 0.18 : 0.32 + Math.random() * 0.3;
      spawnFxParticle({
        x: rearX + jx, y: rearY + jy,
        vx: -Math.cos(p.angle) * (boost ? 90 : 26) + jx * 4,
        vy: -Math.sin(p.angle) * (boost ? 90 : 26) + jy * 4,
        r: boost ? 2.6 + Math.random() * 2.2 : 1.6 + Math.random() * 1.5,
        life: L, maxLife: L, layer: p.layer || 0,
        c0: boost ? [255, 214, 120] : (smokeRgb || [148, 163, 184]),
        c1: boost ? [249, 115, 22] : (smokeRgb ? shadeRgb(smokeRgb, 0.5) : [71, 85, 105]),
        a0: boost ? 0.85 : 0.3, drag: 1.6, grow: boost ? 2.5 : 4.5,
      });
    }
    // Custom trail: an always-visible fading RIBBON streaming from the tail whenever
    // the ship moves (see drawPlayerTrails). This is NOT the nitro flame — nitro is
    // handled independently above. We only record the tail path here. Skipped whole
    // in Low FX, where trails aren't drawn — no point recording the path.
    if (lowFx) {
      if (p._trail && p._trail.length) p._trail.length = 0;
    } else if (trailRgb) {
      p._trail = p._trail || [];
      if (spd > 12) {
        const last = p._trail[p._trail.length - 1];
        if (!last || Math.hypot(rearX - last.x, rearY - last.y) > 6) {
          p._trail.push({ x: rearX, y: rearY, l: p.layer || 0 });
        }
      }
      // Continuously retract the tail so the ribbon fades out behind and vanishes
      // when idle; while moving fast the head is refilled faster than it drains.
      p._trailDecay = (p._trailDecay || 0) + dt;
      while (p._trailDecay >= 0.018) {
        p._trailDecay -= 0.018;
        if (p._trail.length > 0 && (spd <= 12 || p._trail.length > 14)) p._trail.shift();
      }
    } else if ((p.trailBoost || 0) > 0) {
      // Booster: even racers without a custom trail get a brief ribbon while boosted.
      p._trail = p._trail || [];
      if (spd > 12) {
        const last = p._trail[p._trail.length - 1];
        if (!last || Math.hypot(rearX - last.x, rearY - last.y) > 6) {
          p._trail.push({ x: rearX, y: rearY, l: p.layer || 0 });
        }
      }
      p._trailDecay = (p._trailDecay || 0) + dt;
      while (p._trailDecay >= 0.018) {
        p._trailDecay -= 0.018;
        if (p._trail.length > 0 && (spd <= 12 || p._trail.length > 14)) p._trail.shift();
      }
    } else if (p._trail && p._trail.length) {
      p._trail.length = 0;
    }
    // Hull smoke when badly damaged.
    const hpFrac = (p.health == null ? 1 : p.health / Math.max(1, p.maxHealth || CAR_TUNING.baseHealth));
    if (hpFrac < 0.38) {
      p._smokeT = (p._smokeT || 0) + dt;
      const srate = (hpFrac < 0.18 ? 0.05 : 0.1) / emitScl;
      while (p._smokeT >= srate) {
        p._smokeT -= srate;
        const L = 0.7 + Math.random() * 0.5;
        spawnFxParticle({
          x: p.x + (Math.random()-0.5)*10, y: p.y + (Math.random()-0.5)*10,
          vx: (Math.random()-0.5)*24, vy: -22 - Math.random()*26,
          r: 2.6 + Math.random()*2.4, life: L, maxLife: L, layer: p.layer || 0,
          c0: [90, 90, 100], c1: [30, 30, 36], a0: 0.5, drag: 1.2, grow: 7,
        });
      }
    }
  });
}

function updateFx(dt) {
  updateFxEmitters(dt);
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const p = G.fx[i];
    p.life -= dt;
    if (p.life <= 0) { G.fx.splice(i, 1); continue; }
    const dr = Math.max(0, 1 - (p.drag || 1) * dt);
    p.vx *= dr; p.vy *= dr;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.grow) p.r += p.grow * dt;
  }
}

function drawFx(ctx, layer) {
  if (!G.fx.length) return;
  const bucket = frameLayerBucket('fx', G.fx, layer);
  if (!bucket.length) return;
  ctx.save();
  for (let i = 0; i < bucket.length; i++) {
    const p = bucket[i];
    const t = 1 - p.life / p.maxLife;
    const a = Math.max(0, (1 - t) * (p.a0 || 0.8));
    if (a <= 0.01) continue;
    const rr = Math.round(lerp(p.c0[0], p.c1[0], t));
    const gg = Math.round(lerp(p.c0[1], p.c1[1], t));
    const bb = Math.round(lerp(p.c0[2], p.c1[2], t));
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${a})`;
    if (p.text) {
      // Text particle (e.g. floating damage numbers).
      ctx.font = `800 ${Math.round(p.r)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
      continue;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, p.r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Persistent skid marks --------------------------------------------------
function addSkidSegment(x1, y1, x2, y2, layer, w) {
  if (lowFxOn()) return; // skid marks are disabled in Low FX
  const d2 = (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1);
  if (d2 < 1 || d2 > 3600) return; // skip degenerate / teleport segments
  const life = 7;
  G.skidMarks.push({ x1, y1, x2, y2, layer: layer || 0, w: w || 3.4, life, maxLife: life });
  if (G.skidMarks.length > 700) G.skidMarks.splice(0, G.skidMarks.length - 700);
}

function updateSkidMarks(dt) {
  for (let i = G.skidMarks.length - 1; i >= 0; i--) {
    G.skidMarks[i].life -= dt;
    if (G.skidMarks[i].life <= 0) G.skidMarks.splice(i, 1);
  }
}

function drawSkidMarks(ctx, layer) {
  if (!G.skidMarks.length) return;
  const bucket = frameLayerBucket('skid', G.skidMarks, layer);
  if (!bucket.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < bucket.length; i++) {
    const s = bucket[i];
    const a = Math.min(1, s.life / s.maxLife) * 0.42;
    ctx.strokeStyle = `rgba(8,8,14,${a})`;
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- On-canvas race toasts (banners) ----------------------------------------
function addToast(text, opts) {
  opts = opts || {};
  const life = opts.duration || 2.0;
  G.toasts.push({
    text, color: opts.color || '#e2e8f0', size: opts.size || 26,
    glow: opts.glow || opts.color || '#7c3aed',
    life, maxLife: life,
  });
  if (G.toasts.length > 4) G.toasts.splice(0, G.toasts.length - 4);
}

function updateToasts(dt) {
  // Hold banners while the race is paused (countdown / upgrade picks) so a lap
  // toast isn't silently consumed behind a fullscreen overlay.
  if (!G.raceStarted && !G.raceOver) return;
  for (let i = G.toasts.length - 1; i >= 0; i--) {
    G.toasts[i].life -= dt;
    if (G.toasts[i].life <= 0) G.toasts.splice(i, 1);
  }
}

function drawToasts(ctx, W, H) {
  if (!G.toasts.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = H * 0.2;
  for (let i = G.toasts.length - 1; i >= 0; i--) {
    const t = G.toasts[i];
    const age = t.maxLife - t.life;
    // pop in, hold, fade out
    const inT = Math.min(1, age / 0.18);
    const outT = Math.min(1, t.life / 0.35);
    const a = Math.min(inT, outT);
    const scale = 0.7 + 0.3 * (1 - Math.pow(1 - inT, 3));
    ctx.save();
    ctx.translate(W / 2, y - (1 - inT) * 12);
    ctx.scale(scale, scale);
    ctx.globalAlpha = a;
    ctx.font = `900 ${t.size}px system-ui`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
    y += t.size * 1.5;
  }
  ctx.restore();
}

// ---- Race event feed (DOM, under the minimap) --------------------------------
function addFeed(text) {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = 'feed-item';
  div.textContent = text;
  feed.prepend(div);
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
  setTimeout(() => {
    div.classList.add('out');
    setTimeout(() => div.remove(), 400);
  }, 4200);
}

// ---- Item pickup roulette: badge flickers like a slot machine, then reveals --
function startItemRoulette() {
  const badge = document.getElementById('powerup-badge');
  if (!badge) { updatePowerupHud(); return; }
  const pool = POWERUPS_LIST.concat(Object.values(CAR_UNIQUE_POWERUPS));
  const t0 = performance.now();
  if (G._rouletteTimer) clearInterval(G._rouletteTimer);
  G._rouletteTimer = setInterval(() => {
    if (performance.now() - t0 > 520 || !G.heldItem) {
      clearInterval(G._rouletteTimer);
      G._rouletteTimer = null;
      updatePowerupHud();
      return;
    }
    const p = pool[Math.floor(Math.random() * pool.length)];
    badge.innerHTML = (iconSvg(p.id, 15) || p.icon) + ' ' + p.name;
    badge.className = 'powerup-badge active';
    badge.style.borderColor = p.color;
    badge.style.color = p.color;
  }, 55);
}

// ---- Victory confetti (DOM, on the results screen) ----------------------------
function spawnWinConfetti(container) {
  if (!container) return;
  const colors = ['#fbbf24', '#a855f7', '#06b6d4', '#22c55e', '#ef4444', '#e879f9'];
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('span');
    s.className = 'rr-confetti';
    s.style.left = Math.random() * 100 + '%';
    s.style.background = colors[i % colors.length];
    const sz = (5 + Math.random() * 6) + 'px';
    s.style.width = sz; s.style.height = sz;
    s.style.animationDuration = (2.2 + Math.random() * 2.2) + 's';
    s.style.animationDelay = (Math.random() * 1.2) + 's';
    container.appendChild(s);
    setTimeout(() => s.remove(), 6200);
  }
}

// ---- Backdrop themes: each race seed picks a palette --------------------------
const BACKDROP_THEMES = [
  { nebula: '#11101e', deep: '#06060a', star: '200,210,255', grid: 'rgba(124,58,237,0.05)' },  // violet void
  { nebula: '#1c1210', deep: '#0a0605', star: '255,220,185', grid: 'rgba(249,115,22,0.05)' },  // ember dusk
  { nebula: '#0e1620', deep: '#050a0e', star: '190,235,255', grid: 'rgba(56,189,248,0.055)' }, // arctic night
  { nebula: '#101a12', deep: '#050a06', star: '205,255,215', grid: 'rgba(34,197,94,0.05)' },   // toxic mire
];
