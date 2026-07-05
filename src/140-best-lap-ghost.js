// ============================================================
// BEST-LAP GHOST (solo) — your fastest lap on this track+class is
// recorded and replayed as a translucent pace car. Sampling is keyed
// to the pause-immune per-lap clock, so upgrade pauses don't skew it.
// ============================================================
const GHOST_SAMPLE_MS = 60;

function ghostEnabled() { return !inMultiplayerRace(); }

function ghostTrackSig() {
  if (!G.track) return null;
  const base = (G.customMap && G.customMap.name) ? 'map:' + G.customMap.name : 'seed:' + (G.seed || 0);
  return 'rr-ghost-' + base + '|' + (G.speedClass || 'neighborhood') + '|' + (G.track.spline ? G.track.spline.length : 0);
}

function loadBestGhost() {
  G.ghostPlay = null;
  if (!ghostEnabled()) return;
  try {
    const sig = ghostTrackSig();
    if (!sig) return;
    const raw = localStorage.getItem(sig);
    if (!raw) return;
    const g = JSON.parse(raw);
    if (g && Array.isArray(g.frames) && g.frames.length > 4 && Number.isFinite(g.lapMs)) G.ghostPlay = g;
  } catch (_) {}
}

function saveBestGhost(lapMs, frames, shape) {
  try {
    const sig = ghostTrackSig();
    if (sig) localStorage.setItem(sig, JSON.stringify({ lapMs, frames, shape }));
  } catch (_) {}
}

function ghostRecordSample(me, force) {
  if (!ghostEnabled()) return;
  if (!G.ghostRec) G.ghostRec = { frames: [], nextT: 0 };
  const tMs = (me._lapClock || 0) * 1000;
  if (!force && tMs < G.ghostRec.nextT) return;
  G.ghostRec.nextT = tMs + GHOST_SAMPLE_MS;
  if (G.ghostRec.frames.length < 4000) {
    G.ghostRec.frames.push([+me.x.toFixed(1), +me.y.toFixed(1), +me.angle.toFixed(3), me.layer || 0]);
  }
}

function drawGhost(ctx, layer) {
  const g = G.ghostPlay;
  const me = G.players[G.myId];
  if (!g || !me || !G.raceStarted || me.finished) return;
  const fi = ((me._lapClock || 0) * 1000) / GHOST_SAMPLE_MS;
  const i0 = Math.floor(fi);
  if (i0 >= g.frames.length - 1) return; // ghost already completed its lap
  const f0 = g.frames[i0], f1 = g.frames[i0 + 1];
  if ((f0[3] || 0) !== (layer || 0)) return;
  const ft = fi - i0;
  const gx = lerp(f0[0], f1[0], ft), gy = lerp(f0[1], f1[1], ft);
  const ga = f0[2] + angleDiff(f0[2], f1[2]) * ft;
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(ga + Math.PI / 2);
  ctx.globalAlpha *= 0.36;
  ctx.fillStyle = '#7dd3fc';
  drawCarSilhouette(ctx, g.shape || 'drifter', CAR_W, CAR_H);
  ctx.rotate(-(ga + Math.PI / 2));
  ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0.18);
  ctx.fillStyle = 'rgba(125,211,252,0.85)';
  ctx.font = '700 9px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('BEST', 0, -CAR_H * 0.72);
  ctx.restore();
}

// ---- Tiny procedural jingles (built on playSweep) ----------------------------
function playLapJingle() {
  playSweep(520, 780, 0.12, 'square', 0.5);
  setTimeout(() => playSweep(660, 990, 0.15, 'square', 0.5), 120);
}
function playFinalLapSting() {
  playSweep(440, 440, 0.14, 'sawtooth', 0.5);
  setTimeout(() => playSweep(550, 550, 0.14, 'sawtooth', 0.5), 150);
  setTimeout(() => playSweep(660, 990, 0.26, 'sawtooth', 0.6), 300);
}
function playOvertakeBlip(up) {
  if (up) playSweep(620, 930, 0.09, 'triangle', 0.45);
  else playSweep(520, 330, 0.12, 'triangle', 0.4);
}
