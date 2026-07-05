// ============================================================
// RENDER
// ============================================================
function layerVisualScale(deltaLayer) {
  // Original per-step perspective: 0.9x per floor below, 1.1x per floor above.
  if (deltaLayer < 0) return Math.pow(0.9, Math.abs(deltaLayer));
  if (deltaLayer > 0) return Math.pow(1.1, Math.abs(deltaLayer));
  return 1;
}

function layerVisualAlpha(deltaLayer) {
  if (deltaLayer > 0) return Math.max(0.2, 1 - 0.33 * deltaLayer);
  if (deltaLayer < 0) return Math.max(0.28, 1 - 0.18 * Math.abs(deltaLayer));
  return 1;
}

function layerVisualBrightness(deltaLayer) {
  if (deltaLayer > 0) return Math.min(170, 100 + 33 * Math.min(2, deltaLayer));
  if (deltaLayer < 0) return Math.max(34, 100 - 33 * Math.min(3, Math.abs(deltaLayer)));
  return 100;
}

function visibleLayersForPlayerLayer(myLayer) {
  const layers = new Set([myLayer, myLayer + 1, 0]);
  const minLayer = Math.min(0, myLayer);
  for (let l = minLayer; l <= myLayer; l++) layers.add(l);
  return Array.from(layers).sort((a, b) => a - b);
}

// The track ground is identical every frame (only the camera moves), so it is
// rendered ONCE per map into a world-space offscreen canvas per layer and blitted
// each frame. This replaces hundreds of ribbon rebuilds + fills per frame (the cause
// of frame drops at speed) with a few drawImage calls. Keyed on G.track identity, so a
// rebuilt track auto-invalidates the cache.
let _trackGroundCache = null;
function getTrackGroundCache() {
  const track = G.track;
  if (!track || !track.spline || track.spline.length < 2) return null;
  if (_trackGroundCache && _trackGroundCache.key === track) {
    return _trackGroundCache.ok ? _trackGroundCache : null;
  }
  const sp = track.spline;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const boundsPts = (Array.isArray(track.driveSpline) && track.driveSpline.length) ? track.driveSpline : sp;
  for (const p of boundsPts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const margin = TRACK_W * 2 + 48;
  minX -= margin; minY -= margin; maxX += margin; maxY += margin;
  const w = Math.ceil(maxX - minX), h = Math.ceil(maxY - minY);
  if (!(w > 0 && h > 0)) { _trackGroundCache = { key: track, ok: false }; return null; }
  // Render the ground at full 1:1 resolution no matter how big the map is by baking
  // it into a grid of tiles and stitching them at blit time. A single canvas would
  // hit the browser's max-canvas-size limit and force a blurry downscale; tiling keeps
  // every map crisp. A generous per-layer pixel budget only kicks in for pathologically
  // huge maps, uniformly downscaling then so we never exhaust memory.
  const TILE = 2048;
  const MAX_PIXELS = 64 * 1024 * 1024; // ~256 MB/layer worst case before downscaling
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
  const baseX = Math.floor(minX), baseY = Math.floor(minY);
  const fullW = Math.ceil(maxX - baseX), fullH = Math.ceil(maxY - baseY);
  const layersSet = new Set();
  if (Array.isArray(track.driveFloor) && track.driveFloor.length) {
    for (const f of track.driveFloor) layersSet.add(f || 0);
  } else {
    for (let i = 0; i < sp.length; i++) layersSet.add(supportFloorAtSplineIdx(i));
  }
  const layers = new Map();
  for (const layer of layersSet) {
    const tiles = [];
    for (let ty = 0; ty < fullH; ty += TILE) {
      const th = Math.min(TILE, fullH - ty);
      for (let tx = 0; tx < fullW; tx += TILE) {
        const tw = Math.min(TILE, fullW - tx);
        const off = document.createElement('canvas');
        off.width = Math.max(1, Math.round(tw * scale));
        off.height = Math.max(1, Math.round(th * scale));
        const octx = off.getContext('2d');
        octx.scale(scale, scale);
        octx.translate(-(baseX + tx), -(baseY + ty)); // this tile's world origin -> (0,0)
        drawTrackGround(octx, layer);                  // clips to the tile rect automatically
        tiles.push({ canvas: off, ox: baseX + tx, oy: baseY + ty, w: tw, h: th });
      }
    }
    layers.set(layer, tiles);
  }
  _trackGroundCache = { key: track, ok: true, layers, ox: baseX, oy: baseY, w: fullW, h: fullH };
  return _trackGroundCache;
}

// Deep-space backdrop: soft nebula gradient + two parallax star layers that
// scroll against the camera, giving off-track areas a sense of motion.
const _bgStars = (() => {
  const arr = [];
  for (let i = 0; i < 150; i++) {
    arr.push({
      x: Math.random(), y: Math.random(),
      z: 0.2 + Math.random() * 0.6,
      r: Math.random() < 0.85 ? 1 : 1.8,
      tw: Math.random() * Math.PI * 2,
    });
  }
  return arr;
})();

function drawBackdrop(ctx, W, H) {
  const th = G._theme || BACKDROP_THEMES[0];
  const g = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.max(W, H) * 0.95);
  g.addColorStop(0, th.nebula);
  g.addColorStop(0.55, '#0a0a12');
  g.addColorStop(1, th.deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const camX = G.camera.x, camY = G.camera.y;
  const t = performance.now() * 0.001;
  for (const s of _bgStars) {
    const par = s.z * 0.22;
    const sx = ((s.x * W * 1.7 - camX * par) % W + W) % W;
    const sy = ((s.y * H * 1.7 - camY * par) % H + H) % H;
    const a = 0.2 + 0.28 * s.z + 0.18 * Math.sin(t * 1.5 + s.tw);
    ctx.fillStyle = `rgba(${th.star},${Math.max(0.06, a)})`;
    ctx.fillRect(sx, sy, s.r, s.r);
  }
}

function render(dt) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // Sky / background
  drawBackdrop(ctx, W, H);

  const me = G.players[G.myId];
  if (!me || !G.track) return;

  // Camera follow — frame-rate independent so motion stays smooth when frame timing
  // varies (a fixed per-frame lerp makes fast motion feel snappy/jittery under load).
  const camK = 1 - Math.exp(-(dt > 0 ? dt : 0.016) / 0.16);
  let camTarget;
  if (G.freeCam) {
    // Free-flying spectator camera: pan with the movement keys, no target lock.
    const step = dt > 0 ? dt : 0.016;
    const panSpeed = 900 / Math.max(0.15, G.camera.zoom); // slower keys when zoomed in
    let px = (kbHeld('steerRight') ? 1 : 0) - (kbHeld('steerLeft') ? 1 : 0);
    let py = (kbHeld('brake') ? 1 : 0) - (kbHeld('throttle') ? 1 : 0);
    if (G.pad && G.pad.connected) { if (Math.abs(G.pad.steer) > Math.abs(px)) px = G.pad.steer; }
    G.camera.x += px * panSpeed * step;
    G.camera.y += py * panSpeed * step;
    camTarget = { x: G.camera.x, y: G.camera.y, speed: 0 };
  } else {
    camTarget = (G.spectateId && G.players[G.spectateId]) ? G.players[G.spectateId] : me;
    // Velocity lookahead: the camera leads slightly into the direction of
    // travel so there's more road visible where you're actually going.
    const lookX = Math.max(-90, Math.min(90, (camTarget.vx || 0) * 0.16));
    const lookY = Math.max(-90, Math.min(90, (camTarget.vy || 0) * 0.16));
    G.camera.x = lerp(G.camera.x, camTarget.x + lookX, camK);
    G.camera.y = lerp(G.camera.y, camTarget.y + lookY, camK);
  }

  // Cinematic countdown flyover: open on a fitted full-track view, then sweep
  // down into the player's car as the lights count down.
  let introBlend = 0;
  if (!G.freeCam && !G.raceStarted && !G.raceOver && G.countdownVal > 0 && G._introStart) {
    const it = Math.min(1, (performance.now() - G._introStart) / 2700);
    introBlend = 1 - it * it * (3 - 2 * it);
  }
  if (introBlend > 0) {
    if (!G.track._vb) {
      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      const bp = (Array.isArray(G.track.driveSpline) && G.track.driveSpline.length) ? G.track.driveSpline : G.track.spline;
      for (const p of bp) {
        if (p.x < mnX) mnX = p.x; if (p.y < mnY) mnY = p.y;
        if (p.x > mxX) mxX = p.x; if (p.y > mxY) mxY = p.y;
      }
      G.track._vb = { cx: (mnX + mxX) / 2, cy: (mnY + mxY) / 2, w: Math.max(200, mxX - mnX + TRACK_W * 4), h: Math.max(200, mxY - mnY + TRACK_W * 4) };
    }
    const vb = G.track._vb;
    G.camera.x = lerp(G.camera.x, vb.cx, introBlend);
    G.camera.y = lerp(G.camera.y, vb.cy, introBlend);
  }

  const shake = (G.camera.shakeTime > 0) ? G.camera.shakeMag : 0;
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;

  ctx.save();
  ctx.translate(W/2 + shakeX, H/2 + shakeY);
  // Screamer honk tunnel-vision: smoothly zoom the viewer in while affected.
  const tunnelTarget = (me.tunnelVision || 0) > 0 ? CAR_TUNING.screamerTunnelZoomMult : 1;
  if (!Number.isFinite(G._tunnelZoom)) G._tunnelZoom = 1;
  G._tunnelZoom += (tunnelTarget - G._tunnelZoom) * (1 - Math.exp(-(dt > 0 ? dt : 0.016) / 0.25));
  // Dynamic speed zoom: ease out slightly as the camera target gains speed, so
  // top speed reads as widescreen velocity. The zoom slider stays the baseline.
  const camSpd = Math.abs(camTarget.speed || 0);
  const speedZoomTarget = Math.max(0.86, 1 - camSpd * 0.00026);
  if (!Number.isFinite(G._speedZoom)) G._speedZoom = 1;
  G._speedZoom += (speedZoomTarget - G._speedZoom) * (1 - Math.exp(-(dt > 0 ? dt : 0.016) / 0.5));
  let effZoom = G.camera.zoom * G._tunnelZoom * G._speedZoom;
  // Intro flyover zooms out to fit the whole track, easing in toward race zoom.
  if (introBlend > 0 && G.track._vb) {
    const vb = G.track._vb;
    const fitZoom = Math.min(effZoom, Math.min(W / vb.w, H / vb.h) * 0.92);
    effZoom = lerp(effZoom, fitZoom, introBlend);
  }
  // Finish-line camera punch: a quick zoom swell the moment you finish.
  if ((G._finishPunch || 0) > 0) {
    const fp = Math.max(0, Math.min(1, G._finishPunch));
    effZoom *= 1 + 0.12 * Math.sin(fp * Math.PI);
    G._finishPunch -= (dt > 0 ? dt : 0.016) / 0.9;
  }
  ctx.scale(effZoom, effZoom);
  ctx.translate(-G.camera.x, -G.camera.y);

  // Faint world grid so open space still communicates motion at speed.
  {
    const step = 420;
    const gHalfW = (W / 2) / effZoom, gHalfH = (H / 2) / effZoom;
    const gx0 = Math.floor((G.camera.x - gHalfW) / step) * step;
    const gy0 = Math.floor((G.camera.y - gHalfH) / step) * step;
    ctx.strokeStyle = (G._theme || BACKDROP_THEMES[0]).grid;
    ctx.lineWidth = 1 / effZoom;
    ctx.beginPath();
    for (let gx = gx0; gx <= G.camera.x + gHalfW; gx += step) {
      ctx.moveTo(gx, G.camera.y - gHalfH); ctx.lineTo(gx, G.camera.y + gHalfH);
    }
    for (let gy = gy0; gy <= G.camera.y + gHalfH; gy += step) {
      ctx.moveTo(G.camera.x - gHalfW, gy); ctx.lineTo(G.camera.x + gHalfW, gy);
    }
    ctx.stroke();
  }

  const myLayer = getPlayerLayer(camTarget);
  // Smoothly ease the viewer's *visual* layer toward the actual layer so the
  // whole-scene perspective scale/alpha/brightness glides during a slope
  // transition instead of snapping the instant the ramp gate flips me.layer.
  // This is render-only and never touches gameplay/physics layer state.
  if (!Number.isFinite(G.viewLayer)) G.viewLayer = myLayer;
  const layerEaseK = 1 - Math.exp(-(dt > 0 ? dt : 0.016) / 0.20);
  G.viewLayer += (myLayer - G.viewLayer) * layerEaseK;
  if (Math.abs(myLayer - G.viewLayer) < 0.0015) G.viewLayer = myLayer;
  const myLayerView = G.viewLayer;
  const drawLayers = visibleLayersForPlayerLayer(myLayer);

  const applyLayerTransform = (d) => {
    const ls = layerVisualScale(d);
    ctx.translate(G.camera.x, G.camera.y);
    ctx.scale(ls, ls);
    ctx.translate(-G.camera.x, -G.camera.y);
    if (d !== 0) {
      ctx.globalAlpha *= layerVisualAlpha(d);
      ctx.filter = `brightness(${layerVisualBrightness(d)}%)`;
    }
  };

  // Phase A: road ground for every floor, each at its own perspective scale.
  // The ground is static per map, so it is blitted from a world-space cache (the
  // camera/layer transform is applied at blit time); falls back to live drawing if
  // the cache is unavailable (e.g. track too large to cache).
  const groundCache = getTrackGroundCache();
  for (const layer of drawLayers) {
    ctx.save();
    applyLayerTransform(layer - myLayerView);
    if (groundCache && groundCache.layers && groundCache.layers.has(layer)) {
      for (const t of groundCache.layers.get(layer)) ctx.drawImage(t.canvas, t.ox, t.oy, t.w, t.h);
    } else {
      drawTrackGround(ctx, layer);
    }
    ctx.restore();
  }

  // Phase B: slope ramps. The road geometry across each transition is warped with
  // a per-sample scale that eases from the lower floor's scale to the upper
  // floor's scale, so the road grows smoothly along the curve with no seam.
  // Drawn above the road but below the cars.
  drawSlopeConnectors(ctx, myLayerView);
  drawForkSlopeConnectors(ctx, myLayerView);

  // Phase C: markings, items and cars on top (cars are never hidden by a ramp).
  for (const layer of drawLayers) {
    const d = layer - myLayerView;
    ctx.save();
    applyLayerTransform(d);
    // An overpass must visually cover everything on the floors beneath it — cars AND
    // walls/markings (all drawn in Phase C, above Phase A's ground). Re-blit this floor's
    // deck here for the player's own layer and any higher one, so lower layers' Phase C
    // content (drawn in earlier iterations) is hidden wherever a higher road is on top.
    // It only paints where that deck's road exists, so anything not under it is unaffected.
    if (layer >= myLayer) {
      if (groundCache && groundCache.layers && groundCache.layers.has(layer)) {
        for (const t of groundCache.layers.get(layer)) ctx.drawImage(t.canvas, t.ox, t.oy, t.w, t.h);
      } else {
        drawTrackGround(ctx, layer);
      }
    }
    drawCheckpoints(ctx, layer);
    drawFinishLine(ctx, layer);
    drawTrackWalls(ctx, layer);
    drawForkWalls(ctx, layer);
    drawObstacles(ctx, layer);
    drawItems(ctx, layer);
    drawOilSlicks(ctx, layer);
    drawMines(ctx, layer);
    drawImpactParticles(ctx, layer);
    drawSkidMarks(ctx, layer);
    drawDriftTrails(ctx, layer);
    drawGhost(ctx, layer);
    drawPlayers(ctx, layer);
    drawFx(ctx, layer);
    ctx.restore();
  }
  drawMissiles(ctx);
  drawShells(ctx);
  drawBalls(ctx);
  drawBullets(ctx);
  drawGhouls(ctx);
  drawDeathrays(ctx);
  drawDrainBeams(ctx);
  drawDrainAim(ctx);
  drawExplosions(ctx);

  ctx.restore();

  // High-speed radial streaks: kick in near/above the class top speed.
  if (G.raceStarted && !me.finished) {
    const topRef = CAR_TUNING.baseMaxSpeed * Math.max(0.2, G.speedScale || 1);
    const streakF = Math.max(0, Math.min(1, (Math.abs(me.speed || 0) - topRef * 0.85) / (topRef * 1.1)));
    if (streakF > 0.03) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      const nStreak = Math.round(6 + streakF * 10);
      for (let i = 0; i < nStreak; i++) {
        const a = Math.random() * Math.PI * 2;
        const r1 = Math.min(W, H) * (0.32 + Math.random() * 0.2);
        const r2 = r1 + 40 + Math.random() * 130 * streakF;
        ctx.strokeStyle = `rgba(190,210,255,${0.04 + 0.09 * streakF * Math.random()})`;
        ctx.lineWidth = 1 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Boost heat vignette.
  if ((me.boosting || 0) > 0) {
    const gB = ctx.createRadialGradient(W/2, H/2, Math.min(W, H) * 0.36, W/2, H/2, Math.max(W, H) * 0.72);
    gB.addColorStop(0, 'rgba(255,170,60,0)');
    gB.addColorStop(1, 'rgba(255,140,30,0.18)');
    ctx.fillStyle = gB;
    ctx.fillRect(0, 0, W, H);
  }
  // Critical-damage pulse vignette.
  {
    const hpFrac = me.maxHealth ? Math.max(0, (me.health || 0) / me.maxHealth) : 1;
    if (hpFrac < 0.35 && !me.finished && G.raceStarted && (me.deathRespawn || 0) <= 0) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
      const a = (0.35 - hpFrac) / 0.35 * (0.2 + 0.16 * pulse);
      const gR = ctx.createRadialGradient(W/2, H/2, Math.min(W, H) * 0.3, W/2, H/2, Math.max(W, H) * 0.75);
      gR.addColorStop(0, 'rgba(239,68,68,0)');
      gR.addColorStop(1, `rgba(239,68,68,${a})`);
      ctx.fillStyle = gR;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Screamer scream: near-solid black mask with a clear circular hole in the
  // middle while honk-affected (screen space). Holds strong, then fades out.
  if ((me.tunnelVision || 0) > 0.001) {
    const intensity = Math.min(1, me.tunnelVision / CAR_TUNING.screamerMaskFadeSec);
    const black = 0.96 * intensity;
    const hole = Math.min(W, H) * CAR_TUNING.screamerMaskHoleFrac;
    const outer = hole + Math.min(W, H) * 0.10;
    // A radial gradient filled across the whole screen: transparent inside the
    // hole, feathered rim, then the last stop's black flooding out to the edges.
    const grad = ctx.createRadialGradient(W/2, H/2, hole, W/2, H/2, outer);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${black})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Countdown: digits pop in with a glow and an expanding ring; once the race
  // goes live, a "GO!" burst flares and fades over the action.
  if (!G.raceStarted) {
    if (G._cdPrev !== G.countdownVal) { G._cdPrev = G.countdownVal; G._cdStamp = performance.now(); }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    if (G.countdownVal > 0) {
      const tSec = Math.min(1, (performance.now() - G._cdStamp) / 1000);
      const pop = 1 + 0.45 * Math.pow(1 - Math.min(1, tSec * 3), 2);
      const col = G.countdownVal === 1 ? '#ef4444' : G.countdownVal === 2 ? '#fbbf24' : '#22c55e';
      ctx.save();
      ctx.translate(W/2, H/2);
      ctx.scale(pop, pop);
      ctx.font = '900 130px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = col;
      ctx.shadowBlur = 44;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, tSec * 4);
      ctx.fillText(String(G.countdownVal), 0, 0);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = Math.max(0, 0.5 - tSec * 0.5);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(W/2, H/2, 110 + tSec * 190, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    G._goStamp = performance.now();
  } else if (G._goStamp && performance.now() - G._goStamp < 900) {
    const tGo = (performance.now() - G._goStamp) / 900;
    ctx.save();
    ctx.translate(W/2, H/2);
    const sc = 1 + tGo * 1.4;
    ctx.scale(sc, sc);
    ctx.globalAlpha = 1 - tGo;
    ctx.font = '900 130px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 50;
    ctx.fillStyle = '#22c55e';
    ctx.fillText('GO!', 0, 0);
    ctx.restore();
  }

  // Wrong-way warning (set by updateMyPlayer when driving against the track flow).
  if (me._wrongWay && G.raceStarted && !me.finished && (me.deathRespawn || 0) <= 0) {
    if (Math.sin(performance.now() * 0.012) > -0.2) {
      ctx.save();
      ctx.font = '900 34px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ef4444';
      ctx.fillText('⟲ WRONG WAY', W/2, H * 0.32);
      ctx.restore();
    }
  }

  // Drift combo meter: fills with the drift boost stack while chaining slides.
  if ((me.driftBoostStack || 0) > 0.04 && G.raceStarted && !me.finished) {
    const frac = Math.min(1, me.driftBoostStack / CAR_TUNING.driftBoostStackMax);
    const bw = 180, bh = 8;
    const bx = W/2 - bw/2, by = H - 74;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(2,6,23,0.55)';
    ctx.beginPath(); ctx.roundRect(bx - 4, by - 4, bw + 8, bh + 8, 6); ctx.fill();
    const gradD = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    gradD.addColorStop(0, '#fb923c');
    gradD.addColorStop(1, '#fde047');
    ctx.fillStyle = gradD;
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(2, bw * frac), bh, 4); ctx.fill();
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#fde68a';
    ctx.fillText(`DRIFT ×${(1 + me.driftBoostStack * CAR_TUNING.driftSpeedBonusStackScale).toFixed(2)}`, W/2, by - 7);
    ctx.restore();
  }

  drawCheckpointConfetti(ctx);

  drawToasts(ctx, W, H);

  drawResetBar(ctx, W, H);

  drawMinimap();
}

function drawCheckpoints(ctx, layerToDraw) {
  if (!G.track || !G.track.checkpoints || !G.track.checkpoints.length) return;
  const only = Number.isFinite(layerToDraw);
  G.track.checkpoints.forEach((cp, i) => {
    if (only && (cp.layer || 0) !== layerToDraw) return;
    const hw = cp.halfW || TRACK_W;
    const x1 = cp.x + cp.nx * hw;
    const y1 = cp.y + cp.ny * hw;
    const x2 = cp.x - cp.nx * hw;
    const y2 = cp.y - cp.ny * hw;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(251,191,36,0.15)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(251,191,36,0.85)';
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`CP${i+1}`, cp.x, cp.y - 8);
  });
}

// Layer is now persistent player state — updated via ramp zone transitions
function getPlayerLayer(p) { return p.layer || 0; }

// True when a position is close enough to a ramp/slope gate that the car should
// be considered "on the transition" — used to keep tire grip across a slope so
// you don't slide off while changing floors.
function nearSlopeGate(x, y, radius) {
  if (!G.track) return false;
  const r2 = radius * radius;
  const slopes = G.track.slopes;
  if (Array.isArray(slopes) && slopes.length) {
    for (const s of slopes) {
      if (dist2(x, y, s.x, s.y) <= r2) return true;
    }
    return false;
  }
  const sp = G.track.spline, bridges = G.track.bridges;
  if (sp && sp.length && Array.isArray(bridges)) {
    for (const b of bridges) {
      const a = sp[b.startIdx % sp.length], c = sp[b.endIdx % sp.length];
      if (a && dist2(x, y, a.x, a.y) <= r2) return true;
      if (c && dist2(x, y, c.x, c.y) <= r2) return true;
    }
  }
  return false;
}

// Layer slope transition detection.
// Each bridge endpoint acts as a slope threshold after map conversion.
// Crossing direction is determined by the car facing vs slope-up direction.
function checkRampTransitions(p, prevX, prevY, currX, currY) {
  if (!G.track || !G.track.spline || !G.track.spline.length) return;
  const sp = G.track.spline;
  const n = sp.length;

  // Build the active gate list (authored slopes, else legacy bridge ends). Each gate
  // is just geometry: a point, the "up" axis, and a road half-width.
  let gates = [];
  if (Array.isArray(G.track.slopes) && G.track.slopes.length) {
    for (const s of G.track.slopes) {
      gates.push({
        idx: ((Math.round(s.idx || 0) % n) + n) % n,
        x: s.x, y: s.y, upTx: s.upTx, upTy: s.upTy,
        halfW: s.halfW || trackHalfWidthAtIdx(s.idx || 0),
        key: s.key || `slope:${s.idx || 0}`,
        floorUp: s.floorUp, floorDown: s.floorDown,
      });
    }
  } else if (Array.isArray(G.track.bridges) && G.track.bridges.length) {
    G.track.bridges.forEach((b, bi) => {
      [
        { endpoint: 'start', idx: b.startIdx, sign: +1 },
        { endpoint: 'end', idx: b.endIdx, sign: -1 },
      ].forEach((e) => {
        const idx = ((e.idx % n) + n) % n;
        const p0 = sp[(idx - 1 + n) % n];
        const p2 = sp[(idx + 1) % n];
        let tx = p2.x - p0.x, ty = p2.y - p0.y;
        const tl = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= tl; ty /= tl;
        gates.push({
          idx,
          x: sp[idx].x, y: sp[idx].y,
          upTx: tx * e.sign, upTy: ty * e.sign,
          halfW: trackHalfWidthAtIdx(idx) * 1.05,
          key: `legacy:${bi}:${e.endpoint}`,
        });
      });
    });
  }

  // A transition fires when the car's movement this frame crosses the gate plane.
  // We SET the layer to the floor of the side it lands on (absolute, never drifts),
  // so the player can't accumulate onto a wrong layer.
  const candidates = [];
  for (const g of gates) {
    const upTx = g.upTx, upTy = g.upTy;
    const nx = -upTy, ny = upTx;
    const sidePrev = (prevX - g.x) * upTx + (prevY - g.y) * upTy;
    const sideNow  = (currX - g.x) * upTx + (currY - g.y) * upTy;

    let toUp;
    if (sidePrev <= 0 && sideNow > 0) toUp = true;        // crossed onto the up side
    else if (sidePrev >= 0 && sideNow < 0) toUp = false;  // crossed onto the down side
    else continue;                                         // no gate-plane crossing

    // The crossing must sit on the road through the gate (reject side entry).
    const lateral = Math.abs((currX - g.x) * nx + (currY - g.y) * ny);
    if (lateral > (g.halfW || TRACK_W) * 1.15) continue;

    // Floors on each side of this gate. Prefer precomputed floors (works for fork
    // gates whose idx lives in fork-local space); else derive from the main spline.
    let upFloor, downFloor;
    if (Number.isFinite(g.floorUp) && Number.isFinite(g.floorDown)) {
      upFloor = g.floorUp; downFloor = g.floorDown;
    } else {
      const fA = supportFloorAtSplineIdx((g.idx - 1 + n) % n);
      const fB = supportFloorAtSplineIdx(g.idx);
      const probe = sp[(g.idx + 4) % n];
      const probeUp = (probe.x - g.x) * upTx + (probe.y - g.y) * upTy;
      upFloor = probeUp > 0 ? fB : fA;
      downFloor = probeUp > 0 ? fA : fB;
    }
    const target = Math.max(0, toUp ? upFloor : downFloor);

    candidates.push({ key: g.key, target, d2: dist2(currX, currY, g.x, g.y) });
  }

  if (!candidates.length) return;
  // Apply only the nearest gate so stacked thresholds can't fight in one frame.
  candidates.sort((a, b) => a.d2 - b.d2);
  const best = candidates[0];
  p.layer = best.target;
  p.inRampZone = true;
  p.lastRampKey = best.key;
  p.bridgeTransitionGrace = 0.12;
  p.airTime = 0;
}

// Returns the bridge floor the position is on (0 = ground, 1 = floor2 bridge, 2 = floor3 bridge)
function bridgeFloorAt(x, y) {
  const t = G.track;
  if (!t) return 0;
  if (t.driveSpline && t.driveFloor && t.driveSegs && t.driveSpline.length) {
    const near = pointOnDriveSegments(x, y);
    if (!Number.isFinite(near.dist)) return 0;
    const f = near.t < 0.5 ? (t.driveFloor[near.idx] || 0) : (t.driveFloor[near.jdx] || 0);
    return f;
  }
  if (!t.bridges || !t.bridges.length) return 0;
  const { idx } = pointOnTrack(x, y, t.spline);
  return supportFloorAtSplineIdx(idx);
}

// True when (x,y) sits over the deck of `layer` — i.e. the car's OWN layer's track is
// beneath it. This ignores every other layer, so an elevated deck passing over a lower
// track still reads as "on my deck" at the intersection (instead of bridgeFloorAt picking
// the closer lower track and falsely reporting airborne, which skips wall collision).
function overLayerDeck(x, y, layer) {
  const t = G.track;
  if (!t) return true;
  if (t.driveSpline && t.driveFloor && t.driveSegs && t.driveSpline.length >= 2) {
    const near = pointOnDriveSegments(x, y, (i, j) => (t.driveFloor[i] || 0) === layer && (t.driveFloor[j] || 0) === layer);
    if (!Number.isFinite(near.dist)) return false;
    return near.dist <= (near.halfW || TRACK_W) + 70;
  }
  const sp = t.spline;
  if (!sp || sp.length < 2) return true;
  const near = pointOnTrackSegments(
    x, y, sp, t.splineWidth,
    (i, j) => supportFloorAtSplineIdx(i) === layer && supportFloorAtSplineIdx(j) === layer
  );
  if (!Number.isFinite(near.dist)) return false;
  return near.dist <= (near.halfW || TRACK_W) + 70;
}

function isOnBridge(x, y) {
  return bridgeFloorAt(x, y) > 0;
}

function trackSurfaceAt(x, y, layer) {
  const t = G.track;
  if (!t) return 'road';
  if (t.driveSpline && t.driveSurface && t.driveSegs && t.driveSpline.length) {
    if (Number.isFinite(layer)) {
      const near = pointOnDriveSegments(x, y, (i, j) => (t.driveFloor[i] || 0) === layer && (t.driveFloor[j] || 0) === layer);
      const halfW = near.halfW || TRACK_W;
      if (!Number.isFinite(near.dist) || near.dist > halfW + 8) return 'road';
      return t.driveSurface[near.idx] || 'road';
    }
    const near = pointOnDriveSegments(x, y);
    if (!Number.isFinite(near.dist)) return 'road';
    return t.driveSurface[near.idx] || 'road';
  }
  if (!t.spline || !t.spline.length) return 'road';
  const surf = t.splineSurface;
  if (!surf || !surf.length) return 'road';
  const sp = t.spline;
  // When a layer is given, only consider road segments that actually belong to that
  // floor, and only if the car is within the road width. Otherwise an ice/river patch
  // on another floor (or one you are merely driving under/past) would apply its effect.
  if (Number.isFinite(layer)) {
    const near = pointOnTrackSegments(x, y, sp, t.splineWidth,
      (i, j) => supportFloorAtSplineIdx(i) === layer && supportFloorAtSplineIdx(j) === layer);
    const halfW = near.halfW || TRACK_W;
    if (near.dist > halfW + 8) return 'road';
    return surf[near.idx] || 'road';
  }
  const near = pointOnTrack(x, y, sp);
  return surf[near.idx] || 'road';
}

// Returns true if position is over a void zone
function isInVoid(x, y) {
  if (!G.track || !G.track.voidZones) return false;
  let inVoidZone = false;
  for (const v of G.track.voidZones) {
    if (dist2(x,y,v.x,v.y) < v.r*v.r) {
      inVoidZone = true;
      break;
    }
  }
  if (!inVoidZone) return false;

  // Void is "lack of track". If a non-void road segment exists here,
  // it takes priority and this point is drivable.
  const sp = G.track.spline;
  const sv = G.track.splineVoid;
  if (sp && sp.length >= 2 && sv && sv.length === sp.length) {
    const nearRoad = pointOnTrackSegments(
      x,
      y,
      sp,
      G.track.splineWidth,
      (i, j) => !sv[i] && !sv[j]
    );
    if (nearRoad && nearRoad.dist <= (nearRoad.halfW || TRACK_W) + 6) return false;
  }

  return true;
}

// Draw a V2 fork ribbon for a given layer (open polyline) in the main road style.
// Only the fork samples whose floor matches `layerToDraw` are drawn, so an elevated
// fork section renders on its own layer pass and composites with perspective.
function drawBranchRibbon(ctx, bs, layerToDraw) {
  const pts = bs.spline, sw = bs.widths, sur = bs.surface;
  if (!pts || pts.length < 2) return;
  const n = pts.length;
  const layer = Number.isFinite(layerToDraw) ? layerToDraw : 0;
  const floorAt = (i) => { let f = 0; if (Array.isArray(bs.bridges)) for (const b of bs.bridges) { if (i >= b.startIdx && i <= b.endIdx) f = Math.max(f, b.floor || 1); } return f; };
  // Blank the ribbon under each fork ramp so the flat low/high sections don't poke
  // out from beneath the stretched ramp band (kept in sync with drawForkSlopeConnectors).
  const reach = 6;
  const blanked = new Set();
  if (Array.isArray(bs.slopes)) {
    for (const s of bs.slopes) {
      const ri = Math.max(0, Math.min(n - 1, Math.round(s.idx || 0)));
      if (floorAt(Math.max(0, ri - reach)) === floorAt(Math.min(n - 1, ri + reach))) continue;
      for (let k = -(reach - 1); k <= reach - 1; k++) { const ii = ri + k; if (ii >= 0 && ii < n) blanked.add(ii); }
    }
  }
  const runs = []; let run = [];
  for (let i = 0; i < n; i++) { if (floorAt(i) === layer && !blanked.has(i)) run.push(i); else { if (run.length > 1) runs.push(run); run = []; } }
  if (run.length > 1) runs.push(run);
  if (!runs.length) return;
  const tangentAt = (i) => { const ip = Math.max(0, i - 1), inx = Math.min(n - 1, i + 1); let tx = pts[inx].x - pts[ip].x, ty = pts[inx].y - pts[ip].y; const tl = Math.hypot(tx, ty) || 1; return [tx / tl, ty / tl]; };
  function sidesOf(idxs, extra) { const left = [], right = []; for (const i of idxs) { const p = pts[i]; const tg = tangentAt(i); const nx = -tg[1], ny = tg[0]; const w = Math.max(1, (sw && sw[i] ? sw[i] : TRACK_W) + extra); left.push({ x: p.x + nx * w, y: p.y + ny * w }); right.push({ x: p.x - nx * w, y: p.y - ny * w }); } return { left, right }; }
  function fill(left, right, color) { if (left.length < 2) return; ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y); for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y); for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }
  function edge(pathPts) { ctx.beginPath(); ctx.moveTo(pathPts[0].x, pathPts[0].y); for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y); ctx.strokeStyle = 'rgba(124,58,237,0.3)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function surfRun(idxs, type, color) { let r = []; const flush = () => { if (r.length >= 2) { const s = sidesOf(r, 0); fill(s.left, s.right, color); } r = []; }; for (const i of idxs) { if (((sur && sur[i]) || 'road') === type) r.push(i); else flush(); } flush(); }
  for (const idxs of runs) {
    const outer = sidesOf(idxs, 8), inner = sidesOf(idxs, 0);
    fill(outer.left, outer.right, '#1a1a26');
    fill(inner.left, inner.right, '#2a2a3a');
    surfRun(idxs, 'river', 'rgba(56,189,248,0.30)');
    surfRun(idxs, 'ice', 'rgba(191,219,254,0.33)');
    ctx.beginPath();
    ctx.moveTo(pts[idxs[0]].x, pts[idxs[0]].y);
    for (let k = 1; k < idxs.length; k++) ctx.lineTo(pts[idxs[k]].x, pts[idxs[k]].y);
    ctx.setLineDash([28, 40]);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    ctx.setLineDash([]);
    edge(inner.left);
    edge(inner.right);
  }
}

function drawTrackGround(ctx, targetLayer) {
  const layerToDraw = Number.isFinite(targetLayer) ? targetLayer : 0;
  const sp = G.track.spline;
  if (!sp || sp.length < 2) return;
  const n = sp.length;
  const sv = G.track.splineVoid;
  const ss = G.track.splineSurface;
  const sw = G.track.splineWidth;

  // Hide samples that are voids or belong to a different floor than this pass.
  // Each floor is drawn in its own scaled pass, so this is what creates the
  // perspective separation (and the seams the stretched ramps cover).
  const hidden = new Array(n).fill(false);
  const shid = G.track.splineHidden;
  for (let i = 0; i < n; i++) {
    const isVoid = Array.isArray(sv) && sv.length === n ? !!sv[i] : false;
    const isSpleen = Array.isArray(shid) && shid.length === n ? !!shid[i] : false;
    hidden[i] = isVoid || isSpleen || supportFloorAtSplineIdx(i) !== layerToDraw;
  }

  // Hide the real road underneath each slope connector so the stretched ramp is
  // the only thing visible there. The connector spans `reach` samples either side
  // of the slope index; we blank the interior and leave the two endpoints, so the
  // real road meets the ramp exactly where the connector terminates.
  if (Array.isArray(G.track.slopes) && G.track.slopes.length) {
    const reach = 6; // keep in sync with drawSlopeConnectors
    G.track.slopes.forEach((s) => {
      if (s.branch) return; // fork slopes use fork-local indices, not the main spline
      const ri = ((Math.round(s.idx || 0) % n) + n) % n;
      const fPrev = supportFloorAtSplineIdx((ri - 1 + n) % n);
      const fNow = supportFloorAtSplineIdx(ri);
      if (fPrev === fNow) return;
      for (let k = -reach + 1; k <= reach - 1; k++) {
        const ii = (ri + k + n) % n;
        hidden[ii] = true;
      }
    });
  }

  const chunks = [];
  let run = [];
  for (let i = 0; i < n; i++) {
    if (hidden[i]) {
      if (run.length > 1) chunks.push({ idxs: run, closed: false });
      run = [];
    } else {
      run.push(i);
    }
  }
  if (run.length > 1) chunks.push({ idxs: run, closed: false });
  if (!chunks.length && hidden.every(v => !v)) {
    chunks.push({ idxs: Array.from({ length: n }, (_, i) => i), closed: true });
  }
  if (!chunks.length) {
    // No main-line road on this floor, but a fork can still have an elevated deck
    // here (e.g. a fork that rises with no corresponding main bridge). Draw the fork
    // ribbons for this layer before bailing so those decks aren't invisible.
    if (Array.isArray(G.track.branchSplines) && G.track.branchSplines.length) {
      for (const bs of G.track.branchSplines) drawBranchRibbon(ctx, bs, layerToDraw);
    }
    return;
  }

  function buildSides(idxs, closed, extraW) {
    const left = [], right = [];
    for (let k = 0; k < idxs.length; k++) {
      const i = idxs[k];
      const pk = sp[i];
      const iPrev = k > 0 ? idxs[k - 1] : (closed ? idxs[idxs.length - 1] : idxs[0]);
      const iNext = k < idxs.length - 1 ? idxs[k + 1] : (closed ? idxs[0] : idxs[idxs.length - 1]);
      const pPrev = sp[iPrev], pNext = sp[iNext];
      let tx = pNext.x - pPrev.x, ty = pNext.y - pPrev.y;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const w = Math.max(1, (sw && sw[i] ? sw[i] : TRACK_W) + extraW);
      left.push({ x: pk.x + nx * w, y: pk.y + ny * w });
      right.push({ x: pk.x - nx * w, y: pk.y - ny * w });
    }
    return { left, right };
  }

  function fillRibbon(left, right, color) {
    if (!left || !right || left.length < 2 || right.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeEdge(pathPts, color, lw) {
    if (!pathPts || pathPts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y);
    for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function strokeCenter(idxs, color, lw, dashed) {
    if (!idxs || idxs.length < 2) return;
    ctx.beginPath();
    const p0 = sp[idxs[0]];
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < idxs.length; i++) {
      const p = sp[idxs[i]];
      ctx.lineTo(p.x, p.y);
    }
    if (dashed) ctx.setLineDash([28, 40]);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
  }

  function strokeSurface(idxs, type, color) {
    if (!Array.isArray(ss) || ss.length !== n) return;
    let surfRun = [];
    const flush = () => {
      if (surfRun.length < 2) { surfRun = []; return; }
      // Fill the FULL track width for this surface run (edge to edge), not a center
      // stripe, so ice/river cover the whole segment like the road does.
      const sides = buildSides(surfRun, false, 0);
      fillRibbon(sides.left, sides.right, color);
      surfRun = [];
    };
    for (const ii of idxs) {
      if ((ss[ii] || 'road') === type) surfRun.push(ii);
      else flush();
    }
    flush();
  }

  function roundCap(idx, extraW, color) {
    const p = sp[idx];
    if (!p) return;
    const r = Math.max(1, (sw && sw[idx] ? sw[idx] : TRACK_W) + extraW);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // A section end is "open" only when it terminates in void (a real road end).
  // Ends that meet a ramp are cut flat right at the connection point so the
  // slope connector lines up with no overhang.
  const nearSlope = (idx) => {
    if (!Array.isArray(G.track.slopes)) return false;
    return G.track.slopes.some((s) => {
      const ri = ((Math.round(s.idx || 0) % n) + n) % n;
      let d = Math.abs(ri - idx);
      d = Math.min(d, n - d);
      return d <= 6;
    });
  };

  for (const c of chunks) {
    const outer = buildSides(c.idxs, c.closed, 8);
    const inner = buildSides(c.idxs, c.closed, 0);
    const i0 = c.idxs[0], i1 = c.idxs[c.idxs.length - 1];
    const cap0 = !c.closed && !nearSlope(i0);
    const cap1 = !c.closed && !nearSlope(i1);
    fillRibbon(outer.left, outer.right, '#1a1a26');
    if (cap0) roundCap(i0, 8, '#1a1a26');
    if (cap1) roundCap(i1, 8, '#1a1a26');
    fillRibbon(inner.left, inner.right, '#2a2a3a');
    if (cap0) roundCap(i0, 0, '#2a2a3a');
    if (cap1) roundCap(i1, 0, '#2a2a3a');
    strokeSurface(c.idxs, 'river', 'rgba(56,189,248,0.30)');
    strokeSurface(c.idxs, 'ice', 'rgba(191,219,254,0.33)');
    strokeCenter(c.idxs, 'rgba(255,255,255,0.08)', 2, true);
    strokeEdge(inner.left, 'rgba(124,58,237,0.3)', 3);
    strokeEdge(inner.right, 'rgba(124,58,237,0.3)', 3);
  }

  if (Array.isArray(G.track.branchSplines) && G.track.branchSplines.length) {
    for (const bs of G.track.branchSplines) drawBranchRibbon(ctx, bs, layerToDraw);
  }
}

// Draw one stretched ramp band from a prepared sample list. `pts` carries per-sample
// centre (cx,cy), perpendicular unit (px,py), half-width (hw) and an eased perspective
// scale (sc) from the low floor to the high floor. Shared by the main loop and forks.
function _drawRampBand(ctx, pts, prevIsLow, low, high, viewer) {
  if (!pts || pts.length < 2) return;
  const cam = G.camera;
  const mapS = (x, y, s) => ({ x: cam.x + s * (x - cam.x), y: cam.y + s * (y - cam.y) });

  // Extend both ends ~15px along the tangent so the ramp overlaps the adjacent road
  // and covers seam cracks that open up on sharp turns.
  const EXT = 15;
  {
    const f0 = pts[0], f1 = pts[1];
    let ftx = f0.cx - f1.cx, fty = f0.cy - f1.cy;
    let fl = Math.hypot(ftx, fty) || 1; ftx /= fl; fty /= fl;
    pts.unshift({ cx: f0.cx + ftx * EXT, cy: f0.cy + fty * EXT, px: f0.px, py: f0.py, hw: f0.hw, sc: f0.sc });
    const l0 = pts[pts.length - 1], l1 = pts[pts.length - 2];
    let ltx = l0.cx - l1.cx, lty = l0.cy - l1.cy;
    let ll = Math.hypot(ltx, lty) || 1; ltx /= ll; lty /= ll;
    pts.push({ cx: l0.cx + ltx * EXT, cy: l0.cy + lty * EXT, px: l0.px, py: l0.py, hw: l0.hw, sc: l0.sc });
  }

  const ribbon = (extra, style) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const e = mapS(p.cx + p.px * (p.hw + extra), p.cy + p.py * (p.hw + extra), p.sc);
      if (i === 0) ctx.moveTo(e.x, e.y); else ctx.lineTo(e.x, e.y);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      const e = mapS(p.cx - p.px * (p.hw + extra), p.cy - p.py * (p.hw + extra), p.sc);
      ctx.lineTo(e.x, e.y);
    }
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  };

  // Brightness-matched gradients so each end blends into its floor.
  const a = pts[0], b = pts[pts.length - 1];
  const aC = mapS(a.cx, a.cy, a.sc), bC = mapS(b.cx, b.cy, b.sc);
  const startB = (prevIsLow ? layerVisualBrightness(low - viewer) : layerVisualBrightness(high - viewer)) / 100;
  const endB = (prevIsLow ? layerVisualBrightness(high - viewer) : layerVisualBrightness(low - viewer)) / 100;
  const tone = (base, f) => `rgb(${Math.round(base[0] * f)},${Math.round(base[1] * f)},${Math.round(base[2] * f)})`;

  const outerGrad = ctx.createLinearGradient(aC.x, aC.y, bC.x, bC.y);
  outerGrad.addColorStop(0, tone([26, 26, 38], startB));
  outerGrad.addColorStop(1, tone([26, 26, 38], endB));
  ribbon(8, outerGrad);

  const innerGrad = ctx.createLinearGradient(aC.x, aC.y, bC.x, bC.y);
  innerGrad.addColorStop(0, tone([42, 42, 58], startB));
  innerGrad.addColorStop(1, tone([42, 42, 58], endB));
  ribbon(0, innerGrad);

  // Purple rails + faint dashed centre line, matching the rest of the road.
  const strokeSide = (sign) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const e = mapS(p.cx + sign * p.px * p.hw, p.cy + sign * p.py * p.hw, p.sc);
      if (i === 0) ctx.moveTo(e.x, e.y); else ctx.lineTo(e.x, e.y);
    }
    ctx.strokeStyle = 'rgba(124,58,237,0.3)';
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
  };
  strokeSide(1); strokeSide(-1);

  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const e = mapS(p.cx, p.cy, p.sc);
    if (i === 0) ctx.moveTo(e.x, e.y); else ctx.lineTo(e.x, e.y);
  }
  ctx.setLineDash([28, 40]);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([]);
}

function drawSlopeConnectors(ctx, myLayer) {
  if (!G.track || !Array.isArray(G.track.slopes) || !G.track.slopes.length) return;
  const sp = G.track.spline;
  if (!sp || sp.length < 2) return;
  const n = sp.length;
  const sw = G.track.splineWidth;
  const cam = G.camera;
  const viewer = Number.isFinite(myLayer) ? myLayer : 0;
  const smooth = (t) => t * t * (3 - 2 * t);
  const mapS = (x, y, s) => ({ x: cam.x + s * (x - cam.x), y: cam.y + s * (y - cam.y) });
  const halfWAt = (i) => (sw && sw[i] ? sw[i] : TRACK_W);

  G.track.slopes.forEach((slope) => {
    if (slope.branch) return; // fork slopes use fork-local indices, not the main spline
    const ri = ((Math.round(slope.idx || 0) % n) + n) % n;
    const fPrev = supportFloorAtSplineIdx((ri - 1 + n) % n);
    const fNow = supportFloorAtSplineIdx(ri);
    if (fPrev === fNow) return;                  // no floor change -> no seam
    const low = Math.min(fPrev, fNow);
    const high = Math.max(fPrev, fNow);
    const prevIsLow = fPrev === low;
    const reach = 6;
    const total = reach * 2;
    const scaleLow = layerVisualScale(low - viewer);
    const scaleHigh = layerVisualScale(high - viewer);

    // Sample the real road across the transition band, following the spline curve.
    // Each sample carries an eased scale from the low floor to the high floor.
    const pts = [];
    for (let k = 0; k <= total; k++) {
      const idx = (((ri - reach + k) % n) + n) % n;
      let tt = k / total;                        // 0..1 along the band
      if (!prevIsLow) tt = 1 - tt;               // make 0 = low end, 1 = high end
      const sc = lerp(scaleLow, scaleHigh, smooth(tt));
      const c = sp[idx];
      const pP = sp[(idx - 1 + n) % n], pN = sp[(idx + 1) % n];
      let tx = pN.x - pP.x, ty = pN.y - pP.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      pts.push({ cx: c.x, cy: c.y, px: -ty, py: tx, hw: halfWAt(idx), sc });
    }

    _drawRampBand(ctx, pts, prevIsLow, low, high, viewer);
  });
}

// Stretched ramp connectors for V2 fork slopes. Forks live in their own local spline
// space (open, no wrap), so this mirrors drawSlopeConnectors but walks each fork's
// own geometry/bridges instead of the main loop. Uses the shared _drawRampBand.
function drawForkSlopeConnectors(ctx, myLayer) {
  if (!G.track || !Array.isArray(G.track.branchSplines) || !G.track.branchSplines.length) return;
  const viewer = Number.isFinite(myLayer) ? myLayer : 0;
  const smooth = (t) => t * t * (3 - 2 * t);

  for (const bs of G.track.branchSplines) {
    const sp = bs.spline;
    if (!sp || sp.length < 2) continue;
    if (!Array.isArray(bs.slopes) || !bs.slopes.length) continue;
    const n = sp.length;
    const sw = bs.widths;
    const halfWAt = (i) => (sw && sw[i] ? sw[i] : TRACK_W);
    const floorAt = (i) => { let f = 0; if (Array.isArray(bs.bridges)) for (const b of bs.bridges) { if (i >= b.startIdx && i <= b.endIdx) f = Math.max(f, b.floor || 1); } return f; };

    bs.slopes.forEach((slope) => {
      const ri = Math.max(0, Math.min(n - 1, Math.round(slope.idx || 0)));
      const reach = 6;
      const total = reach * 2;
      const iLo = Math.max(0, ri - reach), iHi = Math.min(n - 1, ri + reach);
      const fPrev = floorAt(iLo);
      const fNow = floorAt(iHi);
      if (fPrev === fNow) return;                  // no floor change -> no seam
      const low = Math.min(fPrev, fNow);
      const high = Math.max(fPrev, fNow);
      const prevIsLow = fPrev === low;             // lower-index side is the low floor
      const scaleLow = layerVisualScale(low - viewer);
      const scaleHigh = layerVisualScale(high - viewer);

      const pts = [];
      for (let k = 0; k <= total; k++) {
        const idx = Math.max(0, Math.min(n - 1, ri - reach + k));
        let tt = k / total;                        // 0..1 along the band
        if (!prevIsLow) tt = 1 - tt;               // make 0 = low end, 1 = high end
        const sc = lerp(scaleLow, scaleHigh, smooth(tt));
        const c = sp[idx];
        const pP = sp[Math.max(0, idx - 1)], pN = sp[Math.min(n - 1, idx + 1)];
        let tx = pN.x - pP.x, ty = pN.y - pP.y;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        pts.push({ cx: c.x, cy: c.y, px: -ty, py: tx, hw: halfWAt(idx), sc });
      }

      _drawRampBand(ctx, pts, prevIsLow, low, high, viewer);
    });
  }
}

function drawBridges(ctx, targetLayer) {
  // Bridge deck visuals removed; layered roads are rendered via drawTrackGround().
  return;
}

function drawFinishLine(ctx, layerToDraw) {
  const sp = G.track.spline;
  if (Number.isFinite(layerToDraw) && (supportFloorAtSplineIdx(0) || 0) !== layerToDraw) return;
  const pt = sp[0], next = sp[1];
  const dx=next.x-pt.x, dy=next.y-pt.y;
  const l=Math.sqrt(dx*dx+dy*dy)||1;
  const perp={x:-dy/l,y:dx/l};
  ctx.save();
  ctx.translate(pt.x,pt.y);
  ctx.rotate(Math.atan2(dy,dx));
  const fw=TRACK_W, fh=16;
  for (let i=-4;i<4;i++) {
    for (let j=0;j<2;j++) {
      ctx.fillStyle=(i+j)%2===0?'#fff':'#000';
      ctx.fillRect(j*fh-fh,-fw+i*fh+fw,fh,fh);
    }
  }
  ctx.restore();
}

function drawTrackWalls(ctx, layerToDraw) {
  const sp = G.track && G.track.spline;
  const walls = G.track && G.track.wallRegions;
  if (!sp || sp.length < 2 || !Array.isArray(walls) || !walls.length) return;
  const n = sp.length;
  const sw = G.track.splineWidth;

  const edgePoint = (i, sign, extra) => {
    const iPrev = (i - 1 + n) % n;
    const iNext = (i + 1) % n;
    let tx = sp[iNext].x - sp[iPrev].x, ty = sp[iNext].y - sp[iPrev].y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const w = (sw && sw[i] ? sw[i] : TRACK_W) + extra;
    return { x: sp[i].x + nx * w * sign, y: sp[i].y + ny * w * sign };
  };

  for (const wr of walls) {
    const mode = wr.mode || 'solid';
    const start = wr.startIdx || 0;
    const end = wr.endIdx == null ? start : wr.endIdx;
    const idxs = [];
    if (start <= end) { for (let i = start; i <= end; i++) idxs.push(i); }
    else { for (let i = start; i < n; i++) idxs.push(i); for (let i = 0; i <= end; i++) idxs.push(i); }
    if (idxs.length < 2) continue;
    const sides = wr.side === 'left' ? [1] : wr.side === 'right' ? [-1] : [1, -1];

    if (mode === 'open') {
      // Open run-off: contiguous open regions (same side) merge into one run, whose
      // outer boundary is a STRAIGHT line (chord) between the run's first and last
      // road-edge points; the brown fills the whole segment between the curved road
      // edge and that straight line. Only the region that starts the run draws it, so
      // a row renders as a single continuous corner-cut. Rendered as fade bands —
      // deliberately different math from the stroked solid/bouncy walls.
      const span = openMergedSpan(wr);
      if ((supportFloorAtSplineIdx(span.start) || 0) !== layerToDraw) continue; // open run-off stays on its own floor
      if ((wr.startIdx || 0) !== span.start) continue; // drawn by the run's first region
      const runIdxs = span.idxs;
      if (runIdxs.length < 2) continue;
      const STEPS = 8;
      for (const sign of sides) {
        const edge = runIdxs.map(i => edgePoint(i, sign, 0));
        const N = edge.length;
        const first = edge[0], last = edge[N - 1];
        // chord point matching each edge sample (straight line between the run's end nodes)
        const chord = edge.map((_, k) => {
          const t = N > 1 ? k / (N - 1) : 0;
          return { x: lerp(first.x, last.x, t), y: lerp(first.y, last.y, t) };
        });
        const at = (k, f) => ({ x: lerp(edge[k].x, chord[k].x, f), y: lerp(edge[k].y, chord[k].y, f) });
        for (let s = 0; s < STEPS; s++) {
          const f0 = s / STEPS, f1 = (s + 1) / STEPS;
          const inner = edge.map((_, k) => at(k, f0));
          const outer = edge.map((_, k) => at(k, f1));
          const t = STEPS > 1 ? s / (STEPS - 1) : 0;
          // darker and more transparent toward the chord
          const r = Math.round(lerp(92, 58, t));
          const g = Math.round(lerp(67, 44, t));
          const b = Math.round(lerp(38, 28, t));
          const a = lerp(1.0, 0.5, t);
          ctx.beginPath();
          ctx.moveTo(inner[0].x, inner[0].y);
          for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y);
          for (let i = outer.length - 1; i >= 0; i--) ctx.lineTo(outer[i].x, outer[i].y);
          ctx.closePath();
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fill();
        }
        // dirt lip at the road edge
        ctx.strokeStyle = 'rgba(120,92,56,0.6)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(edge[0].x, edge[0].y);
        for (let i = 1; i < edge.length; i++) ctx.lineTo(edge[i].x, edge[i].y);
        ctx.stroke();
      }
      continue;
    }

    const isBouncy = mode === 'bouncy';
    const shadowColor = isBouncy ? '#065f46' : '#3a3a44';
    const baseColor = isBouncy ? '#10b981' : '#6b7280';
    const capColor = isBouncy ? '#34d399' : '#9ca3af';
    // Only stroke the parts of this wall whose road is drawn on THIS layer, split into
    // contiguous runs so a wall follows its road's floor and never bleeds through onto a
    // layer it doesn't belong to (e.g. a ground wall passing under an elevated deck).
    const runs = [];
    {
      let cur = [];
      for (const i of idxs) {
        if ((supportFloorAtSplineIdx(i) || 0) === layerToDraw) cur.push(i);
        else if (cur.length) { runs.push(cur); cur = []; }
      }
      if (cur.length) runs.push(cur);
    }
    for (const sign of sides) {
      for (const run of runs) {
        if (run.length < 2) continue;
        const pts = run.map(i => edgePoint(i, sign, 4));
        const stroke = (color, lw) => {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.strokeStyle = color;
          ctx.lineWidth = lw;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
        };
        stroke(shadowColor, 12);
        stroke(baseColor, 7.5);
        stroke(capColor, 2.5);
      }
    }
  }
}

// Painted walls on V2 fork paths. Fork geometry lives in its own local spline space
// (branchSplines[].spline, open polyline). Mirrors drawTrackWalls' solid/bouncy stroke
// and a simplified fixed-depth open run-off, filtered per layer via driveFloor.
function drawForkWalls(ctx, layerToDraw) {
  const t = G.track;
  const list = t && t.forkWallRegions;
  if (!Array.isArray(list) || !list.length || !Array.isArray(t.branchSplines)) return;
  const dfloor = t.driveFloor || [];

  const forkEdge = (bs, li, sign, extra) => {
    const sp = bs.spline, n = sp.length;
    const iPrev = Math.max(0, li - 1), iNext = Math.min(n - 1, li + 1);
    let tx = sp[iNext].x - sp[iPrev].x, ty = sp[iNext].y - sp[iPrev].y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const w = (bs.widths && bs.widths[li] ? bs.widths[li] : TRACK_W) + extra;
    return { x: sp[li].x + nx * w * sign, y: sp[li].y + ny * w * sign };
  };

  for (const wr of list) {
    const bs = t.branchSplines.find(b => b.owner === wr.owner && b.pathIndex === wr.path);
    if (!bs || bs.base == null || !Array.isArray(bs.spline)) continue;
    const localStart = wr.driveStart - bs.base;
    const localEnd = Math.min(wr.driveEnd - bs.base, bs.spline.length - 1);
    if (localEnd < localStart) continue;
    const sides = wr.side === 'left' ? [1] : wr.side === 'right' ? [-1] : [1, -1];
    const mode = wr.mode || 'solid';

    // Split into runs whose fork sample sits on the layer being drawn.
    const runs = [];
    let cur = [];
    for (let li = localStart; li <= localEnd; li++) {
      if ((dfloor[bs.base + li] || 0) === layerToDraw) cur.push(li);
      else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);

    if (mode === 'open') {
      for (const sign of sides) {
        for (const run of runs) {
          if (run.length < 2) continue;
          const inner = run.map(li => forkEdge(bs, li, sign, 0));
          const outer = run.map(li => forkEdge(bs, li, sign, 46));
          ctx.beginPath();
          ctx.moveTo(inner[0].x, inner[0].y);
          for (let k = 1; k < inner.length; k++) ctx.lineTo(inner[k].x, inner[k].y);
          for (let k = outer.length - 1; k >= 0; k--) ctx.lineTo(outer[k].x, outer[k].y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(84,62,34,0.85)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(120,92,56,0.6)';
          ctx.lineWidth = 3; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(inner[0].x, inner[0].y);
          for (let k = 1; k < inner.length; k++) ctx.lineTo(inner[k].x, inner[k].y);
          ctx.stroke();
        }
      }
      continue;
    }

    const isBouncy = mode === 'bouncy';
    const shadowColor = isBouncy ? '#065f46' : '#3a3a44';
    const baseColor = isBouncy ? '#10b981' : '#6b7280';
    const capColor = isBouncy ? '#34d399' : '#9ca3af';
    for (const sign of sides) {
      for (const run of runs) {
        if (run.length < 2) continue;
        const pts = run.map(li => forkEdge(bs, li, sign, 4));
        const stroke = (color, lw) => {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
          ctx.strokeStyle = color; ctx.lineWidth = lw;
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.stroke();
        };
        stroke(shadowColor, 12);
        stroke(baseColor, 7.5);
        stroke(capColor, 2.5);
      }
    }
  }
}

function drawObstacles(ctx, layer) {
  G.track.obstacles.forEach(obs => {
    if (obs.active === false) return;
    if (obstacleLayer(obs) !== layer) return;
    ensureObstacleRuntime(obs);
    const rr = (obs.r || 12) * (obs.scale || 1);
    const rot = ((obs.rot || 0) * Math.PI) / 180;
    ctx.save();
    ctx.translate(obs.x, obs.y);
    ctx.rotate(rot);
    if (obs.type==='wall') {
      ctx.fillStyle='#374151';
      ctx.beginPath();
      ctx.arc(0,0,rr,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle='#4b5563';
      ctx.lineWidth=2;
      ctx.stroke();
    } else if (obs.type==='flowing_water') {
      const t = Date.now() * 0.002;
      ctx.fillStyle='rgba(56,189,248,0.34)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rr * 1.35, rr * 0.95, obs.flowDir || 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle='rgba(125,211,252,0.65)';
      ctx.lineWidth=2;
      ctx.stroke();
      ctx.strokeStyle='rgba(224,242,254,0.5)';
      ctx.beginPath();
      ctx.moveTo(- Math.cos(obs.flowDir || 0) * rr * 0.55, - Math.sin(obs.flowDir || 0) * rr * 0.55);
      ctx.lineTo(Math.cos(obs.flowDir || 0) * rr * (0.2 + 0.1 * Math.sin(t)), Math.sin(obs.flowDir || 0) * rr * (0.2 + 0.1 * Math.sin(t)));
      ctx.stroke();
    } else if (obs.type==='ice_track') {
      ctx.fillStyle='rgba(191,219,254,0.32)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rr * 1.25, rr * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle='rgba(219,234,254,0.75)';
      ctx.lineWidth=2;
      ctx.stroke();
    } else if (obs.type==='snow_pile') {
      ctx.fillStyle='rgba(248,250,252,0.95)';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle='rgba(226,232,240,0.95)';
      ctx.beginPath();
      ctx.arc(-rr * 0.22, -rr * 0.22, rr * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.type==='moving_platform') {
      ctx.fillStyle='#64748b';
      ctx.beginPath();
      ctx.roundRect(-rr * 1.15, -rr * 0.65, rr * 2.3, rr * 1.3, 4);
      ctx.fill();
      ctx.strokeStyle='#cbd5e1';
      ctx.lineWidth=2;
      ctx.stroke();
    } else if (obs.type==='punch_glove') {
      ctx.fillStyle='#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle='#fecaca';
      ctx.beginPath();
      ctx.arc(rr * 0.28, -rr * 0.16, rr * 0.48, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.type==='brick_wall') {
      ctx.fillStyle='#b45309';
      ctx.beginPath();
      ctx.roundRect(-rr * 1.2, -rr * 0.78, rr * 2.4, rr * 1.56, 3);
      ctx.fill();
      ctx.strokeStyle='#f59e0b';
      ctx.lineWidth=2;
      ctx.stroke();
      ctx.strokeStyle='rgba(120,53,15,0.8)';
      ctx.lineWidth=1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-rr * 1.1, i * rr * 0.42);
        ctx.lineTo(rr * 1.1, i * rr * 0.42);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle='#f97316';
      ctx.beginPath();
      ctx.arc(0,0,Math.max(8, rr * 0.66),0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle='#fff';
      ctx.beginPath();
      ctx.arc(0,0,Math.max(3, rr * 0.24),0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawImpactParticles(ctx, layer) {
  if (G.snowParticles.length) {
    G.snowParticles.forEach(p => {
      if ((p.layer || 0) !== (layer || 0)) return;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = 'rgba(248,250,252,' + (0.85 * a) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (G.brickShards.length) {
    G.brickShards.forEach(b => {
      if ((b.layer || 0) !== (layer || 0)) return;
      const a = Math.max(0, b.life / b.maxLife);
      ctx.fillStyle = 'rgba(194,65,12,' + (0.88 * a) + ')';
      ctx.beginPath();
      ctx.rect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      ctx.fill();
    });
  }
}

function drawItems(ctx, layer) {
  G.track.items.forEach(item => {
    if (itemLayer(item) !== layer) return;
    const t = Date.now()/1000;
    const glow = Math.sin(t*3)*0.3+0.7;
    const active = item.active !== false;
    ctx.save();
    ctx.translate(item.x,item.y);
    ctx.rotate(t);
    const fillA = active ? glow : 0.42;
    ctx.fillStyle = active ? `rgba(251,191,36,${fillA})` : `rgba(107,114,128,${fillA})`;
    ctx.strokeStyle = active ? 'rgba(251,191,36,0.5)' : 'rgba(148,163,184,0.62)';
    ctx.lineWidth=2;
    // draw star/box shape
    for(let i=0;i<4;i++){
      ctx.rotate(Math.PI/2);
      ctx.fillRect(-8,-8,16,16);
    }
    ctx.fillStyle = active ? '#fbbf24' : '#9ca3af';
    ctx.fillRect(-7,-7,14,14);
    ctx.fillStyle = active ? '#7c3aed' : '#4b5563';
    ctx.font='bold 10px system-ui';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('?',0,0);
    ctx.restore();
  });
}

function drawOilSlicks(ctx, layer) {
  G.track.oilSlicks.forEach(slick => {
    if (bridgeFloorAt(slick.x, slick.y) !== layer) return;
    ctx.save();
    ctx.globalAlpha=0.6;
    ctx.fillStyle='#1e293b';
    ctx.beginPath();
    ctx.ellipse(slick.x,slick.y,slick.r*1.5,slick.r,0,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=1;
    ctx.restore();
  });
}

function drawCarSilhouette(ctx, shape, w, h) {
  if (shape === 'dragger') {
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 2);
    ctx.lineTo(w/2, h/2 - 2);
    ctx.lineTo(-w/2, h/2 - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-w*0.34, h/2 - 3, w*0.68, 4); // spoiler
    return;
  }
  if (shape === 'puncher') {
    const s = h;
    ctx.beginPath();
    ctx.roundRect(-s/2, -s/2, s, s, 2);
    ctx.fill();
    return;
  }
  if (shape === 'needle') {
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 3);
    ctx.lineTo(w*0.42, h/2 - 1);
    ctx.lineTo(-w*0.42, h/2 - 1);
    ctx.closePath();
    ctx.fill();
    // twin rear fins
    ctx.fillRect(-w*0.42, h*0.16, w*0.16, h*0.40);
    ctx.fillRect(w*0.26, h*0.16, w*0.16, h*0.40);
    return;
  }
  if (shape === 'baller') {
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.48, 0, Math.PI * 2);
    ctx.fill();
    // Small nose puck to make the bouncer's front direction clearer.
    ctx.beginPath();
    ctx.arc(0, -h * 0.5, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (shape === 'rotor') {
    // drifter-style body; front hub mount for the propeller (drawn as overlay)
    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, 3);
    ctx.fill();
    ctx.fillRect(-w*0.12, -h/2 - 3, w*0.24, 3);
    return;
  }
  if (shape === 'coil') {
    // drifter-style body + rear oval battery
    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, h*0.52, w*0.34, h*0.2, 0, 0, Math.PI*2);
    ctx.fill();
    return;
  }
  if (shape === 'screamer') {
    // two squares, one rotated 45 degrees
    const s = h*0.6;
    ctx.fillRect(-s/2, -s/2, s, s);
    ctx.save();
    ctx.rotate(Math.PI/4);
    ctx.fillRect(-s/2, -s/2, s, s);
    ctx.restore();
    return;
  }
  if (shape === 'holo') {
    // sleek forward triangle (side detail lines drawn as an overlay)
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 3);
    ctx.lineTo(w*0.46, h/2 - 1);
    ctx.lineTo(-w*0.46, h/2 - 1);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // ── Regular roster silhouettes (nose points up / -y; all symmetric on x). ──
  if (shape === 'tez') {
    // Forward-opening "catcher" bracket: two prongs reaching ahead off a solid tail.
    ctx.beginPath();
    ctx.moveTo(-w*0.5, -h*0.5);
    ctx.lineTo(-w*0.5, h*0.5);
    ctx.lineTo(w*0.5, h*0.5);
    ctx.lineTo(w*0.5, -h*0.5);
    ctx.lineTo(w*0.22, -h*0.5);
    ctx.lineTo(w*0.22, -h*0.05);
    ctx.lineTo(-w*0.22, -h*0.05);
    ctx.lineTo(-w*0.22, -h*0.5);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'kiph') {
    // Slim swept dart with a shallow rear notch.
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 5);
    ctx.lineTo(w*0.42, h/2);
    ctx.lineTo(0, h*0.22);
    ctx.lineTo(-w*0.42, h/2);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'huntlen') {
    // Beefy fortress hexagon (front + rear bevels).
    ctx.beginPath();
    ctx.moveTo(-w*0.28, -h*0.5);
    ctx.lineTo(w*0.28, -h*0.5);
    ctx.lineTo(w*0.5, -h*0.16);
    ctx.lineTo(w*0.5, h*0.28);
    ctx.lineTo(w*0.28, h*0.5);
    ctx.lineTo(-w*0.28, h*0.5);
    ctx.lineTo(-w*0.5, h*0.28);
    ctx.lineTo(-w*0.5, -h*0.16);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'gleenixus') {
    // Arrowhead with a central spine tail (an "→" glyph).
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 3);
    ctx.lineTo(w*0.48, h*0.02);
    ctx.lineTo(w*0.16, h*0.02);
    ctx.lineTo(w*0.13, h*0.5);
    ctx.lineTo(-w*0.13, h*0.5);
    ctx.lineTo(-w*0.16, h*0.02);
    ctx.lineTo(-w*0.48, h*0.02);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'scrynell') {
    // Smooth teardrop wisp.
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 5);
    ctx.quadraticCurveTo(w*0.52, -h*0.1, w*0.3, h*0.5);
    ctx.lineTo(-w*0.3, h*0.5);
    ctx.quadraticCurveTo(-w*0.52, -h*0.1, 0, -h/2 - 5);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'exendios') {
    // Swept-wing starfighter with a rear V-notch.
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 5);
    ctx.lineTo(w*0.5, h*0.45);
    ctx.lineTo(w*0.16, h*0.24);
    ctx.lineTo(0, h*0.5);
    ctx.lineTo(-w*0.16, h*0.24);
    ctx.lineTo(-w*0.5, h*0.45);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'vurn') {
    // Sturdy rounded lozenge hull.
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 2);
    ctx.quadraticCurveTo(w*0.56, -h*0.28, w*0.5, h*0.18);
    ctx.quadraticCurveTo(w*0.45, h*0.5, 0, h*0.5);
    ctx.quadraticCurveTo(-w*0.45, h*0.5, -w*0.5, h*0.18);
    ctx.quadraticCurveTo(-w*0.56, -h*0.28, 0, -h/2 - 2);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'kessa') {
    // Nimble deep-delta with a sharp needle nose.
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 6);
    ctx.lineTo(w*0.26, -h*0.04);
    ctx.lineTo(w*0.5, h*0.5);
    ctx.lineTo(w*0.12, h*0.26);
    ctx.lineTo(-w*0.12, h*0.26);
    ctx.lineTo(-w*0.5, h*0.5);
    ctx.lineTo(-w*0.26, -h*0.04);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'draxil') {
    // Aggressive barbed dagger (glass cannon).
    ctx.beginPath();
    ctx.moveTo(0, -h/2 - 7);
    ctx.lineTo(w*0.3, h*0.08);
    ctx.lineTo(w*0.5, h*0.5);
    ctx.lineTo(0, h*0.28);
    ctx.lineTo(-w*0.5, h*0.5);
    ctx.lineTo(-w*0.3, h*0.08);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // drifter default
  ctx.beginPath();
  ctx.roundRect(-w/2, -h/2, w, h, 3);
  ctx.fill();
}

function drawCarGlass(ctx, shape, w, h) {
  ctx.fillStyle='rgba(6,182,212,0.7)';
  if (shape === 'baller') {
    ctx.beginPath();
    ctx.arc(0, -h*0.1, h*0.2, 0, Math.PI*2);
    ctx.fill();
    return;
  }
  if (shape === 'puncher') {
    const s = h;
    ctx.fillRect(-s*0.32, -s*0.34, s*0.64, s*0.24);
    return;
  }
  if (shape === 'needle') {
    ctx.beginPath();
    ctx.moveTo(0, -h*0.36);
    ctx.lineTo(w*0.17, -h*0.02);
    ctx.lineTo(-w*0.17, -h*0.02);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'dragger') {
    ctx.beginPath();
    ctx.moveTo(0, -h*0.34);
    ctx.lineTo(w*0.22, 0);
    ctx.lineTo(-w*0.22, 0);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'screamer') {
    ctx.beginPath();
    ctx.moveTo(0, -h*0.22);
    ctx.lineTo(h*0.18, 0);
    ctx.lineTo(0, h*0.22);
    ctx.lineTo(-h*0.18, 0);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape === 'coil') {
    ctx.fillRect(-w/2+2, -h/2+3, w-4, 6);
    return;
  }
  if (shape === 'holo') {
    ctx.beginPath();
    ctx.moveTo(0, -h*0.32);
    ctx.lineTo(w*0.2, h*0.06);
    ctx.lineTo(-w*0.2, h*0.06);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.fillRect(-w/2+2,-h/2+3,w-4,6);
}

// Animated per-car overlays (need live player state, drawn in car-local frame).
function drawRotorProp(ctx, p, w, h) {
  const cy = -h/2 - 5;
  ctx.save();
  ctx.translate(0, cy);
  if (!p.propBroken) p._propAngle = (p._propAngle || 0) + 0.35 + (p.speed || 0) * 0.0016;
  ctx.rotate(p._propAngle || 0);
  ctx.fillStyle = p.propBroken ? '#ef4444' : '#22d3ee';
  const bladeL = w * 0.5, bladeW = 2.4;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI * 2 / 3 + (p.propBroken ? 0.45 : 0));
    ctx.beginPath();
    ctx.ellipse(0, -bladeL * 0.5, bladeW, bladeL * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = p.propBroken ? '#7f1d1d' : '#0891b2';
  ctx.fill();
  ctx.restore();
  if (p.propBroken) {
    ctx.strokeStyle = 'rgba(239,68,68,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, cy - 4); ctx.lineTo(4, cy + 4);
    ctx.moveTo(4, cy - 4); ctx.lineTo(-4, cy + 4);
    ctx.stroke();
  }
}

function drawCoilFx(ctx, p, w, h) {
  const batt = Math.max(0, Math.min(2, (p.battery || 0) / CAR_TUNING.coilBatteryMax));
  if (batt > 0.02) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.9, 0.2 + batt * 0.6);
    ctx.fillStyle = batt > 1 ? '#f87171' : '#a78bfa';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.52, w * 0.34, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const arc = p.arcing || 0;
  if (arc > 0.02) {
    // Bolts strike inward from the nearby wall to the car. arcAngle is the world
    // direction from car toward the wall; convert it into the car's local frame
    // (this draw runs inside translate(p.x,p.y)+rotate(p.angle+PI/2)).
    const localAng = (p.arcAngle == null ? 0 : p.arcAngle) - (p.angle + Math.PI / 2);
    const dx = Math.cos(localAng), dy = Math.sin(localAng);
    const px = -dy, py = dx; // lateral (perpendicular) axis
    const gap = CAR_TUNING.coilArcRange * (1 - arc); // world px from car edge to wall
    const originDist = 9 + gap;                       // bolt start, out by the wall
    const bolts = 2 + Math.floor(arc * 4);
    ctx.save();
    ctx.strokeStyle = 'rgba(167,139,250,0.9)';
    ctx.lineWidth = 1.3;
    for (let b = 0; b < bolts; b++) {
      const spread = (Math.random() - 0.5) * (8 + arc * 12);
      const sx = dx * originDist + px * spread;
      const sy = dy * originDist + py * spread;
      const ex = dx * 4 + px * (Math.random() - 0.5) * 8;
      const ey = dy * 4 + py * (Math.random() - 0.5) * 8;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const segs = 4;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const jit = (1 - Math.abs(t - 0.5) * 2) * 7; // more jagged in the middle
        const jx = px * (Math.random() - 0.5) * jit;
        const jy = py * (Math.random() - 0.5) * jit;
        ctx.lineTo(sx + (ex - sx) * t + jx, sy + (ey - sy) * t + jy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // Ability active: a big radial storm of bolts shooting out in every direction.
  if ((p.arcBurst || 0) > 0) {
    const R = CAR_TUNING.coilArcVictimRange * CAR_TUNING.coilArcBurstRangeMult;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(167,139,250,0.9)';
    ctx.lineWidth = 1.4;
    const spokes = 14;
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2 + Math.random() * 0.3;
      const dirx = Math.cos(a), diry = Math.sin(a);
      const perpx = -diry, perpy = dirx;
      const reach = R * (0.55 + Math.random() * 0.45);
      ctx.beginPath();
      ctx.moveTo(dirx * 6, diry * 6);
      const segs = 5;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const jit = (1 - Math.abs(t - 0.5) * 2) * 14;
        const jx = perpx * (Math.random() - 0.5) * jit;
        const jy = perpy * (Math.random() - 0.5) * jit;
        ctx.lineTo(dirx * reach * t + jx, diry * reach * t + jy);
      }
      ctx.stroke();
    }
    // Faint charged halo at the storm's edge.
    ctx.globalAlpha = 0.18 + 0.1 * Math.sin(Date.now() * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawScreamerFx(ctx, p, w, h) {
  const cd = CAR_TUNING.screamerHonkCooldown;
  const since = cd - (p.honkCooldown || 0);
  if ((p.honkCooldown || 0) > 0 && since < 0.8) {
    const t = since / 0.8;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    for (let r = 0; r < 2; r++) {
      ctx.beginPath();
      ctx.arc(0, 0, 16 + t * 40 + r * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHoloFx(ctx, p, w, h) {
  // Holographic detail lines running from the back edge up to the nose along each
  // side of the triangle. They brighten and shift toward magenta while phasing.
  const ghosting = (p.ghostMode || 0) > 0;
  const t = Date.now() * 0.004;
  const lines = 3;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.2;
  const nose = { x: 0, y: -h / 2 - 1 };
  for (let s = -1; s <= 1; s += 2) {
    const back = { x: s * w * 0.44, y: h / 2 - 2 };
    for (let i = 0; i < lines; i++) {
      const inset = (i + 1) / (lines + 1);
      const bx = back.x * (1 - inset * 0.55);
      const by = back.y;
      const nx = nose.x + s * inset * w * 0.05;
      const ny = nose.y + inset * h * 0.34;
      const hue = ghosting ? 300 : 190;
      const alpha = (ghosting ? 0.85 : 0.5) * (0.7 + 0.3 * Math.sin(t + i + s));
      ctx.strokeStyle = `hsla(${hue + Math.sin(t + i) * 18}, 90%, 72%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(nx, ny);
      ctx.stroke();
    }
  }
  // A soft shimmer ring while the phase ability is active.
  if (ghosting) {
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.62, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Which passive ability (and whether it's currently engaged) a given ship has.
// Drives the small glowing badge floated above each car.
function passiveIndicator(p) {
  const base = CAR_TUNING.baseMaxSpeed || 300;
  const spd = Math.abs(p.speed || 0);
  switch (p.carType) {
    case 'rotor':    return { icon: '\u{1F300}', active: (p.rotorSpinUp || 0) <= 0.02 && spd > 40 };
    case 'coil':     return { icon: '\u26A1',    active: (p.battery || 0) > (CAR_TUNING.coilBatteryMax * 0.35) || (p.arcing || 0) > 0 };
    case 'screamer': return { icon: '\u{1F4E2}', active: (p.honkCooldown || 0) <= 0.02 };
    case 'holo':     return { icon: '\u{1F47B}', active: (p.ghostMode || 0) > 0 };
    case 'needle':   return { icon: '\u{1F4CC}', active: (p.spikes || 0) > 0 || spd > base * 0.95 };
    case 'baller':   return { icon: '\u26AB',    active: (p.inflate || 0) > 0 || spd > 120 };
    case 'puncher':  return { icon: '\u{1F94A}', active: (p.puncherCooldown || 0) <= 0.02 };
    case 'dragger':  return { icon: '\u{1F3C1}', active: spd > base * 0.9 };
    case 'drifter':  return { icon: '\u{1F30A}', active: Math.abs(p.driftSteerSign || 0) > 0 };
    default:         return null;
  }
}

function drawPlayers(ctx, targetLayer) {
  const me = G.players[G.myId];
  const myLayer = me ? getPlayerLayer(me) : 0;
  Object.values(G.players).forEach(p => {
    if (!G.raceStarted) return;
    const typeCfg = getCarTypeCfg(p.carType);
    const shape = typeCfg.shape;
    const drawW = shape === 'puncher' ? CAR_H : CAR_W;
    const drawH = shape === 'baller' ? CAR_H : CAR_H;
    const playerLayer = getPlayerLayer(p);
    if (playerLayer !== targetLayer) return;
    const onBridge = playerLayer > 0;
    const sameLayerAsMe = playerLayer === myLayer;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI/2);
    if (shape === 'baller' && (p.inflate || 0) > 0) {
      ctx.scale(CAR_TUNING.ballerInflateScale, CAR_TUNING.ballerInflateScale);
    }
    if (p.ghostMode > 0) ctx.globalAlpha = 0.5;
    if (!sameLayerAsMe) ctx.globalAlpha *= 0.42;
    // Respawn invulnerability blink.
    if ((p.invuln || 0) > 0 && (p.deathRespawn || 0) <= 0) {
      ctx.globalAlpha *= 0.55 + 0.45 * Math.sin(Date.now() * 0.025);
    }

    // Elevated players get a drop-shadow scaled by floor height
    if (onBridge) {
      const shadowOff = playerLayer === 2 ? 9 : 5;
      ctx.save();
      ctx.translate(shadowOff, shadowOff + 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      drawCarSilhouette(ctx, shape, drawW, drawH);
      ctx.restore();
    }

    // Neon under-glow in the racer's color — brighter when moving fast.
    {
      const glowA = 0.16 + Math.min(0.22, Math.abs(p.speed || 0) * 0.0004);
      ctx.save();
      ctx.globalAlpha *= glowA;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, drawW * 1.15, drawH * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Shield aura: double ring with a slow rotating shimmer.
    if (p.shielded) {
      const spin = Date.now() * 0.004;
      ctx.save();
      ctx.strokeStyle = 'rgba(6,182,212,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(165,243,252,0.75)';
      ctx.lineWidth = 2;
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        ctx.arc(0, 0, 23, spin + s * (Math.PI * 2 / 3), spin + s * (Math.PI * 2 / 3) + 1.1);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Stun effect: glow disc + orbiting sparks.
    if (p.stun > 0) {
      ctx.fillStyle = 'rgba(251,191,36,0.3)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      const sT = Date.now() * 0.012;
      ctx.fillStyle = '#fde047';
      for (let s = 0; s < 3; s++) {
        const a = sT + s * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 16, -drawH / 2 - 6 + Math.sin(a) * 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Layered boost flame: outer orange tongue + white-hot core, flickering.
    if (p.boosting > 0) {
      const tailY = drawH / 2;
      const tailW = Math.max(4, drawW * 0.35);
      const len = 12 + Math.random() * 9;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-tailW, tailY);
      ctx.lineTo(tailW, tailY);
      ctx.lineTo(0, tailY + len);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(-tailW * 0.45, tailY);
      ctx.lineTo(tailW * 0.45, tailY);
      ctx.lineTo(0, tailY + len * 0.55);
      ctx.fill();
    }
    // Car body
    ctx.fillStyle = p.id === G.myId ? p.color : p.color+'cc';
    drawCarSilhouette(ctx, shape, drawW, drawH);
    // Top-light: subtle front-to-back sheen so hulls read as 3D shapes.
    {
      const sheen = ctx.createLinearGradient(0, -drawH / 2, 0, drawH / 2);
      sheen.addColorStop(0, 'rgba(255,255,255,0.30)');
      sheen.addColorStop(0.45, 'rgba(255,255,255,0.04)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.save();
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = sheen;
      drawCarSilhouette(ctx, shape, drawW, drawH);
      ctx.restore();
    }
    // Windshield
    drawCarGlass(ctx, shape, drawW, drawH);
    // Car-specific animated overlays
    if (shape === 'rotor') drawRotorProp(ctx, p, drawW, drawH);
    else if (shape === 'coil') drawCoilFx(ctx, p, drawW, drawH);
    else if (shape === 'screamer') drawScreamerFx(ctx, p, drawW, drawH);
    else if (shape === 'holo') drawHoloFx(ctx, p, drawW, drawH);
    // Needle spikes: a bristling ring of blades slowly rotating around the hull.
    if (shape === 'needle' && (p.spikes || 0) > 0) {
      const spin = Date.now() * 0.005;
      const rIn = drawH * 0.34, rOut = drawH * 0.9;
      const N = 10;
      ctx.save();
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = 'rgba(100,116,139,0.9)';
      ctx.lineWidth = 1;
      for (let s = 0; s < N; s++) {
        const a = spin + s * (Math.PI * 2 / N);
        const bx = Math.cos(a), by = Math.sin(a);
        const px = -by, py = bx;
        const wSp = drawW * 0.12;
        ctx.beginPath();
        ctx.moveTo(bx * rIn + px * wSp, by * rIn + py * wSp);
        ctx.lineTo(bx * rOut, by * rOut);
        ctx.lineTo(bx * rIn - px * wSp, by * rIn - py * wSp);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    const tagImg = getPaintTagImage(p.paintTag || DEFAULT_PAINT_TAG);
    if (tagImg && tagImg.complete) {
      const sz = Math.max(8, Math.min(14, drawW * 0.85));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tagImg, -sz / 2, -drawH * 0.18 - sz / 2, sz, sz);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // Name tag only on the current layer for clarity.
    if (sameLayerAsMe) {
      ctx.rotate(-Math.PI/2-p.angle);
      // Passive-ability badge: floats above the car, glows while engaged.
      const pi = passiveIndicator(p);
      if (pi) {
        ctx.save();
        const yy = -drawH/2 - 22;
        const r = pi.active ? (9 + (0.5 + 0.5 * Math.sin(Date.now() / 170)) * 1.6) : 8;
        ctx.beginPath();
        ctx.arc(0, yy, r, 0, Math.PI * 2);
        ctx.fillStyle = pi.active ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.28)';
        ctx.fill();
        if (pi.active) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.stroke();
        }
        ctx.globalAlpha = pi.active ? 1 : 0.4;
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pi.icon, 0, yy + 0.5);
        ctx.restore();
      }
      // Hull bar: appears only once a racer has taken damage.
      const hpF = p.maxHealth ? Math.max(0, Math.min(1, (p.health == null ? 1 : p.health / p.maxHealth))) : 1;
      if (hpF < 0.999 && !p.finished && (p.deathRespawn || 0) <= 0) {
        const hbW = 30, hbH = 3.5;
        ctx.fillStyle = 'rgba(2,6,23,0.6)';
        ctx.fillRect(-hbW/2, -drawH/2 - 2, hbW, hbH);
        ctx.fillStyle = hpF > 0.5 ? '#22c55e' : hpF > 0.25 ? '#fbbf24' : '#ef4444';
        ctx.fillRect(-hbW/2, -drawH/2 - 2, hbW * hpF, hbH);
      }
      ctx.fillStyle = p.id===G.myId ? '#fff' : 'rgba(255,255,255,0.7)';
      ctx.font = p.id===G.myId ? 'bold 12px system-ui' : '11px system-ui';
      ctx.textAlign='center';
      ctx.textBaseline='bottom';
      ctx.fillText(p.name, 0, -drawH/2-4);
    }
    ctx.restore();
  });
}

function drawMinimap() {
  const t = G.track;
  const sp = t.spline;
  // Prefer the unified DRIVE geometry so the minimap shows the actual drivable
  // network — the main loop MINUS the hidden fork "spleen" segments PLUS every fork
  // path — instead of the raw centre spline. Falls back to the spline for tracks
  // without drive geometry (e.g. random maps).
  const useDrive = Array.isArray(t.driveSpline) && Array.isArray(t.driveSegs) && t.driveSpline.length >= 2 && t.driveSegs.length > 0;
  const dsp = useDrive ? t.driveSpline : sp;
  const mmW=140, mmH=140, pad=10;
  mmCtx.clearRect(0,0,mmW,mmH);

  // find bounds
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  dsp.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);});
  const scaleX=(mmW-pad*2)/(maxX-minX||1);
  const scaleY=(mmH-pad*2)/(maxY-minY||1);
  const scale=Math.min(scaleX,scaleY);
  const offX=pad+(mmW-pad*2-(maxX-minX)*scale)/2;
  const offY=pad+(mmH-pad*2-(maxY-minY)*scale)/2;
  const tx=x=>(x-minX)*scale+offX;
  const ty=y=>(y-minY)*scale+offY;

  mmCtx.strokeStyle='rgba(100,100,160,0.8)';
  mmCtx.lineWidth=3;

  if (useDrive) {
    // Draw each drive segment individually. Hidden spleen segments aren't in driveSegs,
    // so they simply don't appear; forks are, so they do. Void samples leave a gap.
    const dv = Array.isArray(t.driveVoid) && t.driveVoid.length === dsp.length ? t.driveVoid : null;
    mmCtx.beginPath();
    for (const seg of t.driveSegs) {
      const a = dsp[seg.i], b = dsp[seg.j];
      if (!a || !b) continue;
      if (dv && (dv[seg.i] || dv[seg.j])) continue;
      mmCtx.moveTo(tx(a.x), ty(a.y));
      mmCtx.lineTo(tx(b.x), ty(b.y));
    }
    mmCtx.stroke();
  } else {
    const sv = Array.isArray(t.splineVoid) && t.splineVoid.length === sp.length ? t.splineVoid : null;
    const hasVoid = sv && sv.some(Boolean);
    mmCtx.beginPath();
    if (!hasVoid) {
      mmCtx.moveTo(tx(sp[0].x),ty(sp[0].y));
      for(let i=1;i<sp.length;i++) mmCtx.lineTo(tx(sp[i].x),ty(sp[i].y));
      mmCtx.closePath();
    } else {
      // Void samples are holes: break the path so they leave a gap instead of a line.
      const n = sp.length;
      let penDown = false;
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        if (sv[idx]) { penDown = false; continue; }
        const X = tx(sp[idx].x), Y = ty(sp[idx].y);
        if (!penDown) { mmCtx.moveTo(X, Y); penDown = true; }
        else mmCtx.lineTo(X, Y);
      }
    }
    mmCtx.stroke();
  }

  // Finish line marker + live item boxes for at-a-glance route planning.
  if (sp && sp.length) {
    const f0 = sp[0];
    mmCtx.fillStyle = '#e2e8f0';
    mmCtx.fillRect(tx(f0.x) - 2.5, ty(f0.y) - 2.5, 5, 5);
  }
  if (t.items && t.items.length) {
    mmCtx.fillStyle = 'rgba(251,191,36,0.85)';
    for (const it of t.items) {
      if (it.active === false) continue;
      mmCtx.fillRect(tx(it.x) - 1, ty(it.y) - 1, 2.5, 2.5);
    }
  }

  Object.values(G.players).forEach(p=>{
    if(!G.raceStarted)return;
    if (p.id === G.myId) {
      // Local player: glowing ring so you never lose yourself on busy maps.
      mmCtx.beginPath();
      mmCtx.arc(tx(p.x),ty(p.y),6,0,Math.PI*2);
      mmCtx.strokeStyle='rgba(255,255,255,0.75)';
      mmCtx.lineWidth=1.5;
      mmCtx.stroke();
    }
    mmCtx.beginPath();
    mmCtx.arc(tx(p.x),ty(p.y),p.id===G.myId?4.5:3,0,Math.PI*2);
    mmCtx.fillStyle=p.color;
    mmCtx.fill();
  });
}

function updateMissiles(dt) {
  const T = CAR_TUNING;
  let _lockNear = Infinity; // nearest missile locked on ME, for the audio warning
  const _meWarn = G.players[G.myId];
  G.missiles = G.missiles.filter(m => {
    if (m.locked && m.targetId === G.myId && _meWarn && !_meWarn.finished) {
      const dW = dist(m.x, m.y, _meWarn.x, _meWarn.y);
      if (dW < _lockNear) _lockNear = dW;
    }
    const speed = T.missileSpeed;
    // Back-compat: older spawns only carried angle+speed.
    if (m.vx === undefined) { m.vx = Math.cos(m.angle || 0) * speed; m.vy = Math.sin(m.angle || 0) * speed; }
    if (m.layer === undefined) m.layer = 0;
    if (!m.locked) {
      // Acquire a lock only after a rival stays within range for missileLockTime.
      let nearId = null, nearD = Infinity;
      Object.values(G.players).forEach(p => {
        if (p.id === m.ownerId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (m.layer || 0)) return;
        const d = dist(m.x, m.y, p.x, p.y);
        if (d < nearD) { nearD = d; nearId = p.id; }
      });
      if (nearId && nearD <= T.missileLockRange) {
        m.lockT = (m.lockT || 0) + dt;
        m._candidate = nearId;
        if (m.lockT >= T.missileLockTime) {
          m.locked = true; m.targetId = nearId;
          // RWR growl for the victim the moment lock is acquired (local player only).
          if (nearId === G.myId && !m._warnedMe) { m._warnedMe = true; playLockAcquired(); }
        }
      } else { m.lockT = 0; m._candidate = null; }
      bounceProjectileOffWall(m, T.missileRadius);
    } else {
      // Locked: navigate ALONG the track toward the target instead of beelining
      // (so it can't fly through walls to reach them).
      const target = G.players[m.targetId];
      if (!target || target.finished) { m.locked = false; m.targetId = null; }
      else {
        const sp = G.track.spline, n = sp.length;
        const mi = pointOnTrack(m.x, m.y, sp).idx;
        const ti = pointOnTrack(target.x, target.y, sp).idx;
        const fwdGap = (((ti - mi) % n) + n) % n;
        const step = (fwdGap <= n / 2) ? 6 : -6;         // ride the shorter way round
        const carrot = (((mi + step) % n) + n) % n;
        let aimX, aimY;
        if (dist(m.x, m.y, target.x, target.y) < 170) { aimX = target.x; aimY = target.y; }
        else { aimX = sp[carrot].x; aimY = sp[carrot].y; }
        const cur = Math.atan2(m.vy, m.vx);
        const diff = angleDiff(cur, Math.atan2(aimY - m.y, aimX - m.x));
        const na = cur + Math.sign(diff) * Math.min(Math.abs(diff), T.missileTurnRate * dt);
        m.vx = Math.cos(na) * speed; m.vy = Math.sin(na) * speed;
      }
    }
    const vl = Math.hypot(m.vx, m.vy) || 1; m.vx = m.vx / vl * speed; m.vy = m.vy / vl * speed;
    m.x += m.vx * dt; m.y += m.vy * dt; m.angle = Math.atan2(m.vy, m.vx); m.life -= dt;
    // Victim-authoritative impact: hits any rival this client simulates.
    for (const p of Object.values(G.players)) {
      if (p.id === m.ownerId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (m.layer || 0)) continue;
      if (p.id !== G.myId && !p.isBot) continue;
      if (dist(m.x, m.y, p.x, p.y) < 20 + T.missileRadius) {
        if (p.id === G.myId && p.shielded) { p.shielded = false; }
        else {
          applyDamage(p, (m.dmg || T.missileDamage) / Math.max(0.5, getCarTypeCfg(p.carType).weaponResist || 1), 'missile');
          if (p.isBot) { p.stun = Math.max(p.stun || 0, 1.1); p._speed = (p._speed || 0) * 0.3; }
        }
        {
          const owner = G.players[m.ownerId];
          addFeed(`🚀 ${owner ? owner.name : '?'} hit ${p.name || 'Racer'}`);
        }
        spawnExplosion(m.x, m.y, 70, 'missile'); addScreenShake(4, 0.1);
        return false;
      }
    }
    return m.life > 0;
  });
  updateLockBeeper(_lockNear, dt);
}

// Nearest centerline point, outward normal and half-width for a world point (main
// spline). Used to bounce free projectiles off the track walls.
function projTrackInfo(x, y) {
  const t = G.track;
  if (!t || !t.spline || t.spline.length < 2) return null;
  const info = pointOnTrackSegments(x, y, t.spline, t.splineWidth);
  const sp = t.spline, i0 = info.idx, i1 = (i0 + 1) % sp.length;
  const a = sp[i0], b = sp[i1];
  let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const cx = a.x + (b.x - a.x) * info.t, cy = a.y + (b.y - a.y) * info.t;
  const nx = -ty, ny = tx;                       // left normal
  const signed = (x - cx) * nx + (y - cy) * ny;  // signed distance across the track
  return { cx, cy, nx, ny, tx, ty, halfW: info.halfW, signed, idx: i0 };
}

// Reflect a projectile off the track wall and keep it inside the ribbon.
function bounceProjectileOffWall(proj, radius) {
  const info = projTrackInfo(proj.x, proj.y);
  if (!info) return;
  const limit = Math.max(4, info.halfW - radius);
  if (Math.abs(info.signed) <= limit) return;
  const sgn = Math.sign(info.signed) || 1;
  const vn = proj.vx * info.nx + proj.vy * info.ny;
  if (vn * sgn > 0) { proj.vx -= 2 * vn * info.nx; proj.vy -= 2 * vn * info.ny; }
  const over = Math.abs(info.signed) - limit;
  proj.x -= sgn * info.nx * over;
  proj.y -= sgn * info.ny * over;
}

// Puncher Shell: bounces off walls, homing only toward a rival within range.
function updateShells(dt) {
  const T = CAR_TUNING;
  if (!G.shells || !G.shells.length) return;
  G.shells = G.shells.filter(s => {
    const speed = T.shellSpeed;
    let nearId = null, nearD = Infinity;
    Object.values(G.players).forEach(p => {
      if (p.id === s.ownerId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (s.layer || 0)) return;
      const d = dist(s.x, s.y, p.x, p.y);
      if (d < nearD) { nearD = d; nearId = p.id; }
    });
    if (nearId && nearD <= T.shellHomingRange) {
      const tp = G.players[nearId];
      const cur = Math.atan2(s.vy, s.vx);
      const diff = angleDiff(cur, Math.atan2(tp.y - s.y, tp.x - s.x));
      const na = cur + Math.sign(diff) * Math.min(Math.abs(diff), T.shellTurnRate * dt);
      s.vx = Math.cos(na) * speed; s.vy = Math.sin(na) * speed;
    }
    bounceProjectileOffWall(s, T.shellRadius);
    const vl = Math.hypot(s.vx, s.vy) || 1; s.vx = s.vx / vl * speed; s.vy = s.vy / vl * speed;
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.angle = Math.atan2(s.vy, s.vx);
    for (const p of Object.values(G.players)) {
      if (p.id === s.ownerId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (s.layer || 0)) continue;
      if (p.id !== G.myId && !p.isBot) continue;
      if (dist(s.x, s.y, p.x, p.y) < 20 + T.shellRadius) {
        if (p.id === G.myId && p.shielded) { p.shielded = false; }
        else {
          applyDamage(p, T.shellDamage / Math.max(0.5, getCarTypeCfg(p.carType).crashResist || 1), 'shell');
          if (p.isBot) { p.stun = Math.max(p.stun || 0, 0.6); p._speed = (p._speed || 0) * 0.5; }
        }
        spawnExplosion(s.x, s.y, 60, 'missile'); addScreenShake(3, 0.1);
        return false;
      }
    }
    return s.life > 0;
  });
}

// Baller Ball: erratic (non-constant) bouncing ball; a hit disables control.
function updateBalls(dt) {
  const T = CAR_TUNING;
  if (!G.balls || !G.balls.length) return;
  const now = Date.now() * 0.001;
  G.balls = G.balls.filter(b => {
    const speed = T.ballSpeed;
    // Wander the heading with a per-ball sine so its velocity is never constant.
    const cur = Math.atan2(b.vy, b.vx) + Math.sin(now * T.ballWobble + (b.phase || 0)) * T.ballWobble * dt;
    b.vx = Math.cos(cur) * speed; b.vy = Math.sin(cur) * speed;
    bounceProjectileOffWall(b, T.ballRadius);
    const vl = Math.hypot(b.vx, b.vy) || 1; b.vx = b.vx / vl * speed; b.vy = b.vy / vl * speed;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const p of Object.values(G.players)) {
      if (p.id === b.ownerId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (b.layer || 0)) continue;
      if (p.id !== G.myId && !p.isBot) continue;
      if (dist(b.x, b.y, p.x, p.y) < 20 + T.ballRadius) {
        if (p.id === G.myId && p.shielded) { p.shielded = false; }
        else {
          applyDamage(p, T.ballDamage / Math.max(0.5, getCarTypeCfg(p.carType).weaponResist || 1), 'ball');
          p.noControl = Math.max(p.noControl || 0, T.ballControlLossSec);
          if (p.isBot) p._speed = (p._speed || 0) * 0.5;
        }
        spawnExplosion(b.x, b.y, 55, 'pulse'); addScreenShake(3, 0.12);
        return false;
      }
    }
    return b.life > 0;
  });
}

// Machinegun tracer rounds: fast, straight, bounce off the track walls, no homing.
// Damage travels on the round (baked-in FIREPOWER) so hits are victim-authoritative.
function updateBullets(dt) {
  const T = CAR_TUNING;
  if (!G.bullets || !G.bullets.length) return;
  G.bullets = G.bullets.filter(b => {
    if (b.layer === undefined) b.layer = 0;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    bounceProjectileOffWall(b, T.bulletRadius);
    for (const p of Object.values(G.players)) {
      if (p.id === b.ownerId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (b.layer || 0)) continue;
      if (p.id !== G.myId && !p.isBot) continue;   // victim-authoritative
      if (dist(b.x, b.y, p.x, p.y) < 18 + T.bulletRadius) {
        if (p.id === G.myId && p.shielded) { p.shielded = false; }
        else {
          applyDamage(p, (b.dmg || T.bulletDamage) / Math.max(0.5, getCarTypeCfg(p.carType).weaponResist || 1), 'bullet');
          if (p.isBot) p.stun = Math.max(p.stun || 0, 0.2);
        }
        spawnExplosion(b.x, b.y, 22, 'pulse');
        return false;
      }
    }
    return b.life > 0;
  });
}

// Screamer Ghoul: rides the track spline for a set distance, halving the speed of
// every racer it sweeps over (spanning the full track width).
function updateGhouls(dt) {
  if (!G.ghouls || !G.ghouls.length) return;
  const sp = G.track && G.track.spline;
  if (!sp || sp.length < 2) return;
  const n = sp.length;
  for (let gi = G.ghouls.length - 1; gi >= 0; gi--) {
    const g = G.ghouls[gi];
    if (g.hit === undefined) g.hit = {};
    let remaining = CAR_TUNING.ghoulSpeed * dt;
    g.distLeft -= remaining;
    // Advance the fractional spline index by the travelled arc length.
    while (remaining > 0) {
      const i0 = Math.floor(g.idxF) % n;
      const a = sp[i0], b = sp[(i0 + 1) % n];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const fracLeft = (1 - (g.idxF - Math.floor(g.idxF))) * segLen;
      if (remaining < fracLeft) { g.idxF += remaining / segLen; remaining = 0; }
      else { remaining -= fracLeft; g.idxF = Math.floor(g.idxF) + 1; }
      if (g.idxF >= n) g.idxF -= n;
    }
    const i0 = Math.floor(g.idxF) % n;
    const a = sp[i0], b = sp[(i0 + 1) % n];
    const t = g.idxF - Math.floor(g.idxF);
    g.x = a.x + (b.x - a.x) * t; g.y = a.y + (b.y - a.y) * t;
    const halfW = trackHalfWidthAtIdx(i0);
    for (const p of Object.values(G.players)) {
      if (p.id === g.ownerId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (g.layer || 0)) continue;
      if (p.id !== G.myId && !p.isBot) continue;   // victim-authoritative
      if (g.hit[p.id]) continue;
      if (dist(p.x, p.y, g.x, g.y) <= halfW + 22) {
        p.ghoulSlow = Math.max(p.ghoulSlow || 0, CAR_TUNING.ghoulSlowDuration);
        if (p.id === G.myId) { p.vx *= CAR_TUNING.ghoulSlowMult; p.vy *= CAR_TUNING.ghoulSlowMult; }
        else p._speed = (p._speed || 0) * CAR_TUNING.ghoulSlowMult;
        g.hit[p.id] = true;
      }
    }
    if (g.distLeft <= 0) G.ghouls.splice(gi, 1);
  }
}

// Dragger Drain tether: bleed health (and Coil battery) from tethered rivals while
// they stay in range of the drainer. Resolved on the victim's own client + bots.
function applyDrainEffects(dt) {
  for (const p of Object.values(G.players)) {
    if ((p.drain || 0) <= 0) continue;
    if (p.id !== G.myId && !p.isBot) continue;
    const owner = G.players[p.drainedBy];
    if (!owner || owner.finished || (owner.deathRespawn || 0) > 0 ||
        dist(p.x, p.y, owner.x, owner.y) > CAR_TUNING.drainBreakDist) {
      p.drain = 0; p.drainedBy = null; continue;
    }
    p.drain = Math.max(0, p.drain - dt);
    applyContinuousDamage(p, CAR_TUNING.drainHpPerSec * dt, 'drain');
    if (p.carType === 'coil') p.battery = Math.max(0, (p.battery || 0) - CAR_TUNING.drainCoilBatteryPerSec * dt);
    if (p.drain <= 0) p.drainedBy = null;
  }
}

// Needle Engine Deathray: a fixed forward beam that shreds anything in its band.
// Distance along a ship's deathray to the first blocker on the owner's layer —
// any active obstacle circle, or the point where the beam leaves the track ribbon.
// Shared by damage + draw so the visible beam stops exactly where it stops hurting.
function deathrayBlockDist(owner) {
  const ax = Math.cos(owner.angle), ay = Math.sin(owner.angle);
  const ol = owner.layer || 0;
  const maxLen = 6000;
  let best = maxLen;
  // Ray vs obstacle circles — any active obstacle on the same layer blocks the beam.
  const obs = (G.track && G.track.obstacles) || [];
  for (const o of obs) {
    if (!o || o.active === false) continue;
    if (obstacleLayer(o) !== ol) continue;
    const relx = o.x - owner.x, rely = o.y - owner.y;
    const proj = relx * ax + rely * ay;
    if (proj <= 0) continue;                        // behind the nose
    const perp = Math.abs(relx * -ay + rely * ax);
    const rr = o.r || 0;
    if (perp > rr) continue;                         // ray misses this circle
    const entry = proj - Math.sqrt(rr * rr - perp * perp);
    if (entry >= 0 && entry < best) best = entry;
  }
  // March forward to find where the beam first leaves the track ribbon (a wall).
  const step = 12;
  for (let d = 20; d < best; d += step) {
    const info = projTrackInfo(owner.x + ax * d, owner.y + ay * d);
    if (info && Math.abs(info.signed) > info.halfW) { best = d; break; }
  }
  return best;
}

function applyDeathrayEffects(dt) {
  for (const owner of Object.values(G.players)) {
    if ((owner.deathray || 0) <= 0) continue;
    if (owner.id === G.myId || owner.isBot) owner.deathray = Math.max(0, owner.deathray - dt);
    const ax = Math.cos(owner.angle), ay = Math.sin(owner.angle);
    const px = -ay, py = ax;
    const blockDist = deathrayBlockDist(owner);     // beam stops at first wall/obstacle
    const fp = getCarTypeCfg(owner.carType).firePower || 1;  // FIREPOWER scales the beam
    for (const v of Object.values(G.players)) {
      if (v.id === owner.id || v.finished || (v.deathRespawn || 0) > 0 || (v.layer || 0) !== (owner.layer || 0)) continue;
      if (v.id !== G.myId && !v.isBot) continue;   // victim-authoritative
      const dx = v.x - owner.x, dy = v.y - owner.y;
      const along = dx * ax + dy * ay;
      if (along < 0) continue;                     // behind the nose
      if (along > blockDist) continue;             // shielded by a wall/obstacle
      if (Math.abs(dx * px + dy * py) > CAR_TUNING.needleDeathrayWidth) continue;
      applyContinuousDamage(v, CAR_TUNING.needleDeathrayDamagePerSec * fp * dt, 'deathray');
    }
  }
}

function drawMissiles(ctx) {
  const t = Date.now() / 80;
  G.missiles.forEach(m => {
    // Owner-only lock indicator: a line to the (candidate/locked) target so only
    // the shooter sees who the missile is tracking.
    if (m.ownerId === G.myId) {
      const tid = m.locked ? m.targetId : m._candidate;
      const tgt = tid && G.players[tid];
      if (tgt) {
        ctx.save();
        ctx.globalAlpha = m.locked ? 0.9 : 0.35;
        ctx.strokeStyle = m.locked ? '#ef4444' : '#fbbf24';
        ctx.lineWidth = m.locked ? 2 : 1.5;
        ctx.setLineDash(m.locked ? [] : [6, 6]);
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
        ctx.setLineDash([]);
        // Reticle on the target.
        ctx.beginPath(); ctx.arc(tgt.x, tgt.y, m.locked ? 26 : 30, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle + Math.PI / 2);
    // Exhaust flame
    ctx.fillStyle = '#f97316';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-3, 9); ctx.lineTo(3, 9);
    ctx.lineTo(0, 18 + Math.sin(t) * 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Body
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.roundRect(-3, -9, 6, 18, 2);
    ctx.fill();
    // Nose cone
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-3, -9); ctx.lineTo(3, -9); ctx.lineTo(0, -15);
    ctx.fill();
    // Glow
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239,68,68,0.18)';
    ctx.fill();
    ctx.restore();
  });
}

// Puncher Shell — greenish-gray bouncing bullet.
function drawShells(ctx) {
  if (!G.shells) return;
  G.shells.forEach(s => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((s.angle || 0) + Math.PI / 2);
    ctx.beginPath(); ctx.arc(0, 0, CAR_TUNING.shellRadius + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,140,110,0.18)'; ctx.fill();
    ctx.fillStyle = '#8a9a7a';
    ctx.beginPath(); ctx.roundRect(-CAR_TUNING.shellRadius * 0.55, -CAR_TUNING.shellRadius, CAR_TUNING.shellRadius * 1.1, CAR_TUNING.shellRadius * 2, 3); ctx.fill();
    ctx.fillStyle = '#b8c4a8';
    ctx.beginPath(); ctx.moveTo(-CAR_TUNING.shellRadius * 0.55, -CAR_TUNING.shellRadius); ctx.lineTo(CAR_TUNING.shellRadius * 0.55, -CAR_TUNING.shellRadius); ctx.lineTo(0, -CAR_TUNING.shellRadius * 1.7); ctx.fill();
    ctx.restore();
  });
}

// Baller Ball — bright bouncing orb.
function drawBalls(ctx) {
  if (!G.balls) return;
  const t = Date.now() / 200;
  G.balls.forEach(b => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.beginPath(); ctx.arc(0, 0, CAR_TUNING.ballRadius + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56,189,248,0.2)'; ctx.fill();
    const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, CAR_TUNING.ballRadius);
    g.addColorStop(0, '#e0f2fe'); g.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, CAR_TUNING.ballRadius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, CAR_TUNING.ballRadius, t, t + Math.PI); ctx.stroke();
    ctx.restore();
  });
}

// Machinegun tracer rounds — short bright streaks.
function drawBullets(ctx) {
  if (!G.bullets || !G.bullets.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.bullets) {
    const a = Math.atan2(b.vy, b.vx);
    const tx = Math.cos(a), ty = Math.sin(a);
    ctx.strokeStyle = 'rgba(255,244,214,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - tx * 12, b.y - ty * 12);
    ctx.lineTo(b.x + tx * 6, b.y + ty * 6);
    ctx.stroke();
  }
  ctx.restore();
}

// Screamer Ghoul — translucent sweep spanning the full track width.
function drawGhouls(ctx) {
  if (!G.ghouls || !G.ghouls.length) return;
  const sp = G.track && G.track.spline;
  if (!sp || sp.length < 2) return;
  const n = sp.length;
  const t = Date.now() / 120;
  G.ghouls.forEach(g => {
    const i0 = Math.floor(g.idxF) % n;
    const a = sp[i0], b = sp[(i0 + 1) % n];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const halfW = trackHalfWidthAtIdx(i0) + 20;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t);
    const grad = ctx.createLinearGradient(g.x - nx * halfW, g.y - ny * halfW, g.x + nx * halfW, g.y + ny * halfW);
    grad.addColorStop(0, 'rgba(168,85,247,0.05)');
    grad.addColorStop(0.5, 'rgba(192,132,252,0.55)');
    grad.addColorStop(1, 'rgba(168,85,247,0.05)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(g.x - nx * halfW, g.y - ny * halfW);
    ctx.lineTo(g.x + nx * halfW, g.y + ny * halfW);
    ctx.stroke();
    // Faint trailing wisp along the tangent.
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = 'rgba(192,132,252,0.4)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(g.x - nx * halfW - tx * 14, g.y - ny * halfW - ty * 14);
    ctx.lineTo(g.x + nx * halfW - tx * 14, g.y + ny * halfW - ty * 14);
    ctx.stroke();
    ctx.restore();
  });
}

// Needle Deathray — fixed forward beam from any ship currently firing.
function drawDeathrays(ctx) {
  const t = Date.now() / 40;
  for (const owner of Object.values(G.players)) {
    if ((owner.deathray || 0) <= 0) continue;
    const ax = Math.cos(owner.angle), ay = Math.sin(owner.angle);
    const len = deathrayBlockDist(owner);          // clip to the first wall/obstacle
    const ex = owner.x + ax * len, ey = owner.y + ay * len;
    const w = CAR_TUNING.needleDeathrayWidth;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(239,68,68,0.25)';
    ctx.lineWidth = w * 2.4;
    ctx.beginPath(); ctx.moveTo(owner.x, owner.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,120,0.75)';
    ctx.lineWidth = w * 1.1;
    ctx.beginPath(); ctx.moveTo(owner.x, owner.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 + 0.3 * Math.sin(t)) + ')';
    ctx.lineWidth = Math.max(2, w * 0.3);
    ctx.beginPath(); ctx.moveTo(owner.x, owner.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();
  }
}

// Dragger Drain — energy tether from drainer to each tethered victim.
function drawDrainBeams(ctx) {
  const t = Date.now() / 100;
  for (const v of Object.values(G.players)) {
    if ((v.drain || 0) <= 0 || !v.drainedBy) continue;
    const owner = G.players[v.drainedBy];
    if (!owner) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Wavy tether.
    const dx = v.x - owner.x, dy = v.y - owner.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    ctx.strokeStyle = 'rgba(16,185,129,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const segs = 14;
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const wob = Math.sin(f * Math.PI * 4 + t) * 8 * Math.sin(f * Math.PI);
      const x = owner.x + dx * f + px * wob;
      const y = owner.y + dy * f + py * wob;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(52,211,153,0.9)';
    ctx.beginPath(); ctx.arc(v.x, v.y, 9 + 2 * Math.sin(t), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Dragger aim line — owner-local only, shown while holding to aim.
function drawDrainAim(ctx) {
  if (!G.aimingDrain) return;
  const me = G.players[G.myId];
  if (!me) return;
  const ax = Math.cos(me.angle), ay = Math.sin(me.angle);
  const range = CAR_TUNING.drainAimRange;
  const ex = me.x + ax * range, ey = me.y + ay * range;
  const t = Date.now() / 120;
  ctx.save();
  ctx.strokeStyle = 'rgba(52,211,153,0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 20;
  ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.setLineDash([]);
  // Highlight the ship the drain would latch onto.
  let bestId = null, bestAlong = Infinity;
  for (const p of Object.values(G.players)) {
    if (p.id === G.myId || p.finished || (p.deathRespawn || 0) > 0 || (p.layer || 0) !== (me.layer || 0)) continue;
    const dx = p.x - me.x, dy = p.y - me.y;
    const along = dx * ax + dy * ay;
    const perp = Math.abs(dx * -ay + dy * ax);
    if (along > 0 && along <= range && perp <= CAR_TUNING.drainAimPickRadius && along < bestAlong) { bestAlong = along; bestId = p.id; }
  }
  if (bestId) {
    const tp = G.players[bestId];
    ctx.strokeStyle = 'rgba(52,211,153,0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 24 + 3 * Math.sin(t), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function updateHud() {
  const me = G.players[G.myId];
  if (!me) return;
  document.getElementById('lap-display').textContent = `${Math.min(me.lap,G.totalLaps)}/${G.totalLaps}`;
  const spdEl = document.getElementById('speed-display');
  spdEl.textContent = Math.round(Math.abs(me.speed));
  {
    // Speed readout heats up as you push past the class limit.
    const topRefH = CAR_TUNING.baseMaxSpeed * Math.max(0.2, G.speedScale || 1);
    const sf = Math.abs(me.speed || 0) / topRefH;
    spdEl.style.color = sf > 1.02 ? '#f97316' : (sf > 0.75 ? '#fde047' : '');
  }
  const hpEl = document.getElementById('health-display');
  if (hpEl) {
    const maxHp = Math.max(1, me.maxHealth || CAR_TUNING.baseHealth);
    const hp = Math.max(0, Math.round((me.health == null ? maxHp : me.health)));
    const pct = Math.round((hp / maxHp) * 100);
    hpEl.textContent = `${hp}/${maxHp} (${pct}%)`;
    hpEl.style.color = pct <= 25 ? '#f87171' : (pct <= 50 ? '#fbbf24' : '');
  }

  // Car-specific gauge: Coil battery / Rotor propeller / Screamer honk cooldown.
  const specSep = document.getElementById('special-sep');
  const specItem = document.getElementById('special-item');
  const specLabel = document.getElementById('special-label');
  const specVal = document.getElementById('special-display');
  if (specItem && specSep && specLabel && specVal) {
    let show = true;
    if (me.carType === 'coil') {
      const batt = Math.max(0, Math.round(me.battery || 0));
      const over = batt > CAR_TUNING.coilBatteryMax;
      specLabel.textContent = 'BATTERY';
      specVal.textContent = over ? `${batt}% ⚠` : `${batt}%`;
      specVal.style.color = over ? '#f87171' : (batt >= 5 ? '#a78bfa' : '#9ca3af');
    } else if (me.carType === 'rotor') {
      const prop = Math.max(0, Math.round(me.propHealth == null ? CAR_TUNING.rotorPropMaxHealth : me.propHealth));
      specLabel.textContent = 'PROP';
      specVal.textContent = me.propBroken ? 'BROKEN' : `${prop}%`;
      specVal.style.color = me.propBroken ? '#f87171' : (prop <= 40 ? '#fbbf24' : '#22d3ee');
    } else if (me.carType === 'screamer') {
      const cd = Math.max(0, me.honkCooldown || 0);
      specLabel.textContent = 'HONK';
      specVal.textContent = cd > 0 ? `${Math.ceil(cd)}s` : 'READY';
      specVal.style.color = cd > 0 ? '#9ca3af' : '#fbbf24';
    } else if (me.carType === 'holo') {
      const cd = Math.max(0, me.holoCooldown || 0);
      const active = (me.ghostMode || 0) > 0;
      specLabel.textContent = 'PHASE';
      specVal.textContent = active ? 'ON' : (cd > 0 ? `${Math.ceil(cd)}s` : 'READY');
      specVal.style.color = active ? '#f472b6' : (cd > 0 ? '#9ca3af' : '#c084fc');
    } else {
      show = false;
    }
    specSep.style.display = show ? '' : 'none';
    specItem.style.display = show ? '' : 'none';
  }

  // Position
  const players = Object.values(G.players).filter(p=>!p.finished);
  players.sort((a,b)=>(b.lap-a.lap)||(b.lapProgress-a.lapProgress));
  const pos = players.findIndex(p=>p.id===G.myId)+1;
  const suffixes=['st','nd','rd'];
  const suf = suffixes[pos-1]||'th';
  document.getElementById('pos-display').textContent = `${pos}${suf}`;

  // Overtake feedback: toast + blip whenever the live position changes mid-race.
  if (G.raceStarted && !G.raceOver && !me.finished && pos > 0 &&
      Object.keys(G.players).length > 1 &&
      G.raceStartTime && Date.now() - G.raceStartTime > 4000) {
    if (G._prevPos && pos !== G._prevPos) {
      const up = pos < G._prevPos;
      addToast(up ? `▲ P${pos}` : `▼ P${pos}`,
        { color: up ? '#4ade80' : '#f87171', glow: up ? '#16a34a' : '#b91c1c', size: 24, duration: 1.1 });
      playOvertakeBlip(up);
    }
    G._prevPos = pos;
  } else {
    G._prevPos = pos;
  }

  const ups = (me.upgrades||[]).map(u=>{
    const found=UPGRADES.find(x=>x.id===u);
    return found?found.icon:'';
  }).join('');
  const sc = SPEED_CLASSES[G.speedClass] || SPEED_CLASSES.neighborhood;
  document.getElementById('upgrades-display').textContent = (ups||'—') + ` | ${sc.label} ${sc.scale}x`;

  const myNode = engineNodes[G.myId];
  const modeEl = document.getElementById('engine-mode-display');
  const loadBtn = document.getElementById('engine-load-btn');
  if (modeEl) {
    if (myNode && myNode.isXfade) modeEl.textContent = 'XFADE';
    else if (myNode && myNode.isBuffer) modeEl.textContent = 'BUFFER';
    else if (myNode) modeEl.textContent = 'FALLBACK';
    else modeEl.textContent = 'LOADING';
  }
  if (loadBtn) {
    loadBtn.style.display = (myNode && !myNode.isBuffer && !myNode.isXfade) ? 'inline-block' : 'none';
  }

  const strip = document.getElementById('checkpoint-strip');
  if (strip) {
    const cps = (G.track && Array.isArray(G.track.checkpoints)) ? G.track.checkpoints : [];
    if (!cps.length) {
      strip.style.display = 'none';
      strip.innerHTML = '';
    } else {
      strip.style.display = 'flex';
      const doneCount = Math.max(0, Math.min(cps.length, me.nextCheckpoint || 0));
      let html = '';
      for (let i = 0; i < cps.length; i++) {
        html += `<span class="checkpoint-arch${i < doneCount ? ' done' : ''}"></span>`;
      }
      strip.innerHTML = html;
    }
  }

  updateLeaderboard(me);
  updateUpgradePauseOverlay();
  updateSpectateBar();
}

function formatRaceClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const t = Math.floor(ms / 1000);
  const m = Math.floor(t / 60), s = t % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateLeaderboard(me) {
  const timerEl = document.getElementById('race-timer');
  if (timerEl) {
    const elapsed = (G.raceStarted && G.raceStartTime) ? (Date.now() - G.raceStartTime) : 0;
    timerEl.textContent = formatRaceClock(elapsed);
  }
  const board = document.getElementById('leaderboard');
  if (!board) return;
  const cpTotal = (G.track && Array.isArray(G.track.checkpoints)) ? G.track.checkpoints.length : 0;
  const laps = G.totalLaps || 3;
  const order = Object.values(G.players).slice().sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return (b.lap - a.lap) || (b.lapProgress - a.lapProgress);
  });
  let html = '';
  order.forEach((p, i) => {
    const cpDone = cpTotal ? Math.min(cpTotal, p.nextCheckpoint || 0) : 0;
    const cpStr = cpTotal ? `${cpDone}/${cpTotal}` : '-/-';
    const cpTime = (p.lastCheckpointTime && p.lastCheckpointTime > 0) ? formatRaceClock(p.lastCheckpointTime) : '--:--';
    const lapShown = Math.min(p.lap || 1, laps);
    const lapTime = (p.lastLapTime && p.lastLapTime > 0) ? formatRaceClock(p.lastLapTime) : '--:--';
    const cls = `lb-row${p.id === G.myId ? ' me' : ''}${p.finished ? ' finished' : ''}`;
    const name = (p.name || 'Racer').replace(/[<>&]/g, '');
    html += `<div class="${cls}"><span class="lb-pos">${i + 1}</span>`
      + `<span class="lb-dot" style="background:${p.color || '#888'}"></span>`
      + `<span class="lb-name">${name}</span>`
      + `<span class="lb-stat">C ${cpStr} ${cpTime} L ${lapShown}/${laps} ${lapTime}</span></div>`;
  });
  board.innerHTML = html;
}

function updatePowerupHud() {
  const badge = document.getElementById('powerup-badge');
  if (G.heldItem) {
    let p = POWERUPS_LIST.find(x=>x.id===G.heldItem);
    if (!p) p = Object.values(CAR_UNIQUE_POWERUPS).find(x=>x.id===G.heldItem);
    if (p) {
      const svg = iconSvg(p.id, 15);
      if (svg) badge.innerHTML = svg + ' ' + p.name;
      else badge.textContent = p.icon + ' ' + p.name;
      badge.className='powerup-badge active';
      badge.style.borderColor=p.color;
      badge.style.color=p.color;
    }
  } else {
    badge.textContent='none';
    badge.className='powerup-badge';
    badge.style.borderColor='';
    badge.style.color='';
  }
}
