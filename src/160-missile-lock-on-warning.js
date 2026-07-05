// ============================================================
// MISSILE LOCK-ON WARNING — audio only, no HUD element. A crunchy
// retro two-tone blip that repeats faster as the missile closes in,
// like an old heat-seeker RWR. One longer growl when lock is acquired.
// ============================================================
const lockWarn = { t: 0 };

function playLockBeep(freq, dur, vol) {
  const g0 = fxGain();
  if (g0 <= 0 || !audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const master = audioCtx.createGain();
    master.gain.value = (vol || 0.12) * g0;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 4;
    master.connect(lp); lp.connect(audioCtx.destination);
    // Two hard-panned-ish detuned squares = cheap bit-crush crunch.
    [0, 27].forEach(det => {
      const o = audioCtx.createOscillator();
      o.type = 'square';
      o.frequency.value = freq + det;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(1, t);
      g.gain.setValueAtTime(1, t + dur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.01);
    });
    setTimeout(() => { try { master.disconnect(); lp.disconnect(); } catch (_) {} }, dur * 1000 + 220);
  } catch (_) {}
}

function playLockAcquired() {
  playLockBeep(560, 0.16, 0.14);
  setTimeout(() => playLockBeep(860, 0.2, 0.14), 170);
}

// Called each frame with the distance of the nearest missile locked on me
// (Infinity when clear). Faster pips as it closes.
function updateLockBeeper(nearestDist, dt) {
  if (!Number.isFinite(nearestDist)) { lockWarn.t = 0; return; }
  const closeness = Math.max(0, Math.min(1, 1 - nearestDist / 1100));
  const interval = lerp(0.55, 0.11, closeness);
  lockWarn.t += dt;
  if (lockWarn.t >= interval) {
    lockWarn.t = 0;
    playLockBeep(1180 + closeness * 260, 0.05, 0.1);
  }
}
