// ============================================================
// PROCEDURAL TRACK GENERATION
// ============================================================

// Returns true if segment (a→b) intersects segment (c→d)
function segIntersects(ax,ay,bx,by,cx,cy,dx,dy) {
  const d1x=bx-ax, d1y=by-ay, d2x=dx-cx, d2y=dy-cy;
  const cross = d1x*d2y - d1y*d2x;
  if (Math.abs(cross) < 1e-10) return false;
  const t = ((cx-ax)*d2y - (cy-ay)*d2x) / cross;
  const u = ((cx-ax)*d1y - (cy-ay)*d1x) / cross;
  return t>0 && t<1 && u>0 && u<1;
}

// Returns true if idx falls inside the bridge range (handles wrap-around)
function idxInBridge(idx, b, n) {
  if (b.startIdx <= b.endIdx) return idx >= b.startIdx && idx <= b.endIdx;
  return idx >= b.startIdx || idx <= b.endIdx; // wraps past end of spline
}

// Scan the spline for real self-intersections → bridge sections (circular scan)
// Only the LATER segment (j) becomes the bridge; both i and j regions are marked
// used so the same crossing can never produce two bridges.
function detectBridges(spline) {
  const n    = spline.length;
  const skip = Math.max(15, Math.floor(n * 0.12));
  const BRIDGE_HALF = Math.max(12, Math.floor(n * 0.04));
  const bridges = [];
  const used = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    if (used[i]) continue; // this segment is the underpass of an already-found bridge
    const ax=spline[i].x, ay=spline[i].y;
    const bx=spline[(i+1)%n].x, by=spline[(i+1)%n].y;
    for (let d = skip; d <= n - skip; d++) {
      const j = (i + d) % n;
      if (used[j]) continue;
      const cx=spline[j].x, cy=spline[j].y;
      const dx=spline[(j+1)%n].x, dy=spline[(j+1)%n].y;
      if (segIntersects(ax,ay,bx,by,cx,cy,dx,dy)) {
        const startIdx = (j - BRIDGE_HALF + n) % n;
        const endIdx   = (j + BRIDGE_HALF) % n;
        bridges.push({ startIdx, endIdx });
        // Mark BOTH the overpass (j) AND underpass (i) regions as used
        for (let k = -BRIDGE_HALF; k <= BRIDGE_HALF; k++) {
          used[(j+k+n)%n] = 1;
          used[(i+k+n)%n] = 1;
        }
        break;
      }
    }
  }
  return bridges;
}

function generateTrack(seed) {
  const rng = mulberry32(seed);
  const numLoops = 1 + Math.floor(rng() * 3);
  const N = 14 + Math.floor(rng() * 7); // 14-20 waypoints

  // ── Step 1: curvature random walk ─────────────────────────────────────────
  // Each turn value is smoothly varied (momentum on curvature) so corners are
  // wide sweeping curves rather than random angular jitter.
  const maxCurve = 0.42 + rng() * 0.32;
  const turns = [];
  let curv = 0;
  for (let i = 0; i < N; i++) {
    curv += (rng() - 0.5) * maxCurve * 0.85;
    curv  = Math.max(-maxCurve, Math.min(maxCurve, curv));
    turns.push(curv);
  }
  // Normalise so heading closes: Σturns = 2π
  const rawSum = turns.reduce((a, b) => a + b, 0);
  const corr   = (Math.PI * 2 - rawSum) / N;
  for (let i = 0; i < N; i++) turns[i] += corr;

  // ── Step 2: place waypoints ────────────────────────────────────────────────
  const segBase = 320 + rng() * 260;
  const raw = [];
  let px = 0, py = 0, hdg = 0;
  for (let i = 0; i < N; i++) {
    hdg += turns[i];
    const len = segBase * (0.5 + rng() * 0.95);
    px += Math.cos(hdg) * len;
    py += Math.sin(hdg) * len;
    raw.push({ x: px, y: py });
  }

  // ── Step 3: linear-drift closure ──────────────────────────────────────────
  // Subtract linearly-increasing fraction of the final drift so the last point
  // lands back at (0,0) and the closure is smooth rather than a hard snap.
  const ex = raw[N-1].x, ey = raw[N-1].y;
  const points = raw.map((p, i) => ({
    x: p.x - ex * (i + 1) / N,
    y: p.y - ey * (i + 1) / N,
  }));

  // ── Step 4: normalise to a consistent bounding box ────────────────────────
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const cx0 = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy0 = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs),
                        Math.max(...ys) - Math.min(...ys));
  const sc = Math.min(2100 / (span + 1), 1.85);
  for (const p of points) { p.x = (p.x - cx0) * sc; p.y = (p.y - cy0) * sc; }

  // ── Step 5: force self-crossings for multi-loop tracks ────────────────────
  // Smoothly pull a band of waypoints toward (0,0) so the track dips through
  // the centre and crosses the points near i=0 (which are also near origin).
  function pullToCenter(peakIdx, blendFrac, strength) {
    const blend = Math.max(2, Math.floor(N * blendFrac));
    for (let k = -blend; k <= blend; k++) {
      const idx = ((peakIdx + k) % N + N) % N;
      const w   = (1 - Math.abs(k) / (blend + 1)) * strength;
      points[idx].x *= (1 - w);
      points[idx].y *= (1 - w);
    }
  }
  if (numLoops >= 2) pullToCenter(Math.floor(N / 2),     0.18, 0.90);
  if (numLoops >= 3) pullToCenter(Math.floor(N * 2 / 3), 0.15, 0.84);

  const points_final = points;

  // Catmull-Rom spline
  const spline = [];
  const steps  = 16;
  for (let i = 0; i < points_final.length; i++) {
    const p0 = points_final[(i - 1 + N) % N];
    const p1 = points_final[i];
    const p2 = points_final[(i + 1) % N];
    const p3 = points_final[(i + 2) % N];
    const segMax = (i === points_final.length - 1) ? steps : (steps - 1);
    for (let s = 0; s <= segMax; s++) spline.push(catmullRom(p0, p1, p2, p3, s / steps));
  }

  // Detect actual geometric crossings → bridge sections only where needed
  const bridges = detectBridges(spline).map(b => ({ ...b, floor: 1 }));

  // Obstacles
  const obstacles = [];
  const numObs = 10 + Math.floor(rng() * 8);
  for (let i = 0; i < numObs; i++) {
    const idx  = Math.floor(rng() * spline.length);
    const pt   = spline[idx];
    const next = spline[(idx + 1) % spline.length];
    const dx = next.x - pt.x, dy = next.y - pt.y;
    const len  = Math.sqrt(dx*dx + dy*dy) || 1;
    const perp = { x: -dy/len, y: dx/len };
    const side = (rng() - 0.5) * TRACK_W * 1.4;
    const roll = rng();
    const type = roll < 0.23 ? 'wall'
      : roll < 0.40 ? 'cone'
      : roll < 0.55 ? 'moving_platform'
      : roll < 0.68 ? 'flowing_water'
      : roll < 0.80 ? 'ice_track'
      : roll < 0.90 ? 'snow_pile'
      : roll < 0.97 ? 'punch_glove'
      : 'brick_wall';
    const rr = type === 'flowing_water' ? (24 + rng() * 12)
      : type === 'ice_track' ? (26 + rng() * 12)
      : type === 'moving_platform' ? (14 + rng() * 7)
      : type === 'snow_pile' ? (15 + rng() * 9)
      : type === 'punch_glove' ? (14 + rng() * 6)
      : type === 'brick_wall' ? (13 + rng() * 8)
      : (10 + rng() * 18);
    let obsLayer = 0;
    for (const b of bridges) {
      if (idxInBridge(idx, b, spline.length)) {
        obsLayer = Math.max(obsLayer, b.floor || 1);
      }
    }
    obstacles.push({
      x: pt.x + perp.x * side,
      y: pt.y + perp.y * side,
      r: rr,
      type,
      layer: obsLayer,
      rot: (rng() - 0.5) * 40,
      scale: 0.9 + rng() * 0.4,
      active: true,
      respawn: 0,
      moveAmp: 26 + rng() * 34,
      moveSpeed: 0.7 + rng() * 1.3,
      flowDir: Math.atan2(dy, dx) + (rng() - 0.5) * 0.8,
      phase: rng() * Math.PI * 2,
    });
  }
  // Item boxes
  const items = [];
  const numItems = 10 + Math.floor(rng() * 6);
  for (let i = 0; i < numItems; i++) {
    const idx  = Math.floor(rng() * spline.length);
    const pt   = spline[idx];
    const next = spline[(idx + 1) % spline.length];
    const dx = next.x - pt.x, dy = next.y - pt.y;
    const len  = Math.sqrt(dx*dx + dy*dy) || 1;
    const perp = { x: -dy/len, y: dx/len };
    const side = (rng() - 0.5) * TRACK_W * 0.8;
    let itemL = 0;
    for (const b of bridges) {
      if (idxInBridge(idx, b, spline.length)) itemL = Math.max(itemL, b.floor || 1);
    }
    items.push({ x: pt.x + perp.x * side, y: pt.y + perp.y * side, active: true, respawn: 0, layer: itemL, r: 12 });
  }
  const oilSlicks = [];
  return { spline, splineWidth: null, splineSurface: null, obstacles, items, oilSlicks, bridges, voidZones: [], splineVoid: null, checkpoints: [], slopes: [], wallRegions: [], numLoops };
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t*t, t3 = t2*t;
  return {
    x: 0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
  };
}

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pointOnTrack(px, py, spline) {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < spline.length; i++) {
    const d = dist2(px, py, spline[i].x, spline[i].y);
    if (d < minDist) { minDist = d; minIdx = i; }
  }
  return { dist: Math.sqrt(minDist), idx: minIdx };
}

function pointOnTrackSegments(px, py, spline, halfWidths, allowSegment) {
  if (!spline || spline.length < 2) return { dist: 0, idx: 0, t: 0, halfW: TRACK_W };
  const n = spline.length;
  let bestD2 = Infinity;
  let bestIdx = 0;
  let bestT = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (allowSegment && !allowSegment(i, j)) continue;
    const a = spline[i], b = spline[j];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len2)) : 0;
    const qx = a.x + vx * t;
    const qy = a.y + vy * t;
    const d2 = dist2(px, py, qx, qy);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = i;
      bestT = t;
    }
  }

  if (bestD2 === Infinity) {
    const near = pointOnTrack(px, py, spline);
    const hw = halfWidths && halfWidths.length ? (halfWidths[near.idx] || TRACK_W) : TRACK_W;
    return { dist: near.dist, idx: near.idx, t: 0, halfW: hw };
  }

  const i1 = (bestIdx + 1) % n;
  const w0 = halfWidths && halfWidths.length ? (halfWidths[bestIdx] || TRACK_W) : TRACK_W;
  const w1 = halfWidths && halfWidths.length ? (halfWidths[i1] || TRACK_W) : TRACK_W;
  return { dist: Math.sqrt(bestD2), idx: bestIdx, t: bestT, halfW: lerp(w0, w1, bestT) };
}

// Nearest point on an OPEN polyline (V2 branch ribbons don't wrap). Returns the
// distance, interpolated half-width, and the local tangent at the closest point.
function pointOnPolyline(px, py, pts, halfWidths) {
  if (!pts || pts.length < 2) return null;
  let bestD2 = Infinity, bestIdx = 0, bestT = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len2)) : 0;
    const qx = a.x + vx * t, qy = a.y + vy * t;
    const d2 = dist2(px, py, qx, qy);
    if (d2 < bestD2) { bestD2 = d2; bestIdx = i; bestT = t; }
  }
  const i1 = bestIdx + 1;
  const a = pts[bestIdx], b = pts[i1];
  let tx = b.x - a.x, ty = b.y - a.y;
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const w0 = halfWidths && halfWidths.length ? (halfWidths[bestIdx] || TRACK_W) : TRACK_W;
  const w1 = halfWidths && halfWidths.length ? (halfWidths[i1] || TRACK_W) : TRACK_W;
  return { dist: Math.sqrt(bestD2), idx: bestIdx, t: bestT, halfW: lerp(w0, w1, bestT), tx, ty, px: a.x + (b.x - a.x) * bestT, py: a.y + (b.y - a.y) * bestT };
}

// Nearest point on the unified DRIVE geometry (main loop minus hidden fork segments
// PLUS every fork path). Iterates the explicit segment list so paths never wrongly
// connect end-to-start. `filter(i,j)` optionally restricts which segments count.
// Returns dist/idx/jdx/t/halfW and mainIdx (the corresponding main-spline index, or
// -1 for fork samples). Falls back to the main spline when no drive geometry exists.
function pointOnDriveSegments(px, py, filter) {
  const t = G.track;
  if (!t || !t.driveSpline || !t.driveSegs || !t.driveSpline.length) {
    const near = pointOnTrackSegments(px, py, t && t.spline, t && t.splineWidth, filter);
    return { dist: near.dist, idx: near.idx, jdx: near.idx, t: near.t, halfW: near.halfW, mainIdx: near.idx };
  }
  const sp = t.driveSpline, hw = t.driveWidth, segs = t.driveSegs;
  let bestD2 = Infinity, bestI = 0, bestJ = 0, bestT = 0;
  for (const seg of segs) {
    const i = seg.i, j = seg.j;
    if (filter && !filter(i, j)) continue;
    const a = sp[i], b = sp[j];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const tt = len2 > 1e-9 ? Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len2)) : 0;
    const qx = a.x + vx * tt, qy = a.y + vy * tt;
    const d2 = dist2(px, py, qx, qy);
    if (d2 < bestD2) { bestD2 = d2; bestI = i; bestJ = j; bestT = tt; }
  }
  if (bestD2 === Infinity) return { dist: Infinity, idx: 0, jdx: 0, t: 0, halfW: TRACK_W, mainIdx: -1 };
  const w0 = hw && hw.length ? (hw[bestI] || TRACK_W) : TRACK_W;
  const w1 = hw && hw.length ? (hw[bestJ] || TRACK_W) : TRACK_W;
  const mi = t.driveMainIdx ? t.driveMainIdx[bestI] : bestI;
  return { dist: Math.sqrt(bestD2), idx: bestI, jdx: bestJ, t: bestT, halfW: lerp(w0, w1, bestT), mainIdx: mi };
}

function trackHalfWidthAtIdx(idx) {
  const arr = G.track && G.track.splineWidth;
  if (!arr || idx < 0 || idx >= arr.length) return TRACK_W;
  return arr[idx] || TRACK_W;
}

function wallRuleAt(idx, side) {
  if (!G.track || !Array.isArray(G.track.wallRegions) || !G.track.wallRegions.length) return null;
  const n = G.track.spline ? G.track.spline.length : 0;
  for (const w of G.track.wallRegions) {
    const s = w.startIdx || 0;
    const e = w.endIdx == null ? s : w.endIdx;
    const inRange = s <= e ? (idx >= s && idx <= e) : (idx >= s || idx <= e);
    if (!inRange) continue;
    const ws = w.side || 'both';
    if (ws !== 'both' && ws !== side) continue;
    return w;
  }
  return null;
}

// Painted-wall lookup for V2 fork paths. Fork walls carry absolute driveSpline index
// ranges (driveStart..driveEnd) rather than main-spline indices, so a fork sample
// (which has no main index) can still be walled. `driveIdx` is the nearest drive
// sample index returned by pointOnDriveSegments.
function forkWallRuleAt(driveIdx, side) {
  const list = G.track && G.track.forkWallRegions;
  if (!Array.isArray(list) || !list.length) return null;
  for (const w of list) {
    if (driveIdx < w.driveStart || driveIdx > w.driveEnd) continue;
    const ws = w.side || 'both';
    if (ws !== 'both' && ws !== side) continue;
    return w;
  }
  return null;
}

// True when a SOLID/BOUNCY wall lines the track at this sample (either side). Such a
// section physically contains the car, so it must not be allowed to fall/drop a layer
// there (e.g. from collision jitter crossing a nearby gate plane). 'open' run-off does
// not contain the car, so it doesn't count.
function walledAt(idx) {
  const containing = (side) => {
    const w = wallRuleAt(idx, side);
    return !!w && (w.mode || 'solid') !== 'open';
  };
  return containing('left') || containing('right');
}

// Merge contiguous open run-off regions (same side) into one continuous run, so a
// row of adjacent open regions shares a single straight chord instead of each cutting
// its own corner. Returns { start, end, idxs } for the run containing `wr`.
function openMergedSpan(wr) {
  const sp = G.track && G.track.spline;
  if (!sp || !sp.length) return { start: wr.startIdx || 0, end: wr.endIdx == null ? (wr.startIdx || 0) : wr.endIdx, idxs: [] };
  const n = sp.length;
  const side = wr.side || 'both';
  const cov = new Array(n).fill(false);
  for (const w of (G.track.wallRegions || [])) {
    if ((w.mode || 'solid') !== 'open') continue;
    if ((w.side || 'both') !== side) continue;
    const s = w.startIdx || 0;
    const e = w.endIdx == null ? s : w.endIdx;
    if (s <= e) { for (let i = s; i <= e; i++) cov[i] = true; }
    else { for (let i = s; i < n; i++) cov[i] = true; for (let i = 0; i <= e; i++) cov[i] = true; }
  }
  let s = wr.startIdx || 0;
  let e = wr.endIdx == null ? s : wr.endIdx;
  let guard = 0;
  while (cov[(s - 1 + n) % n] && guard++ < n) s = (s - 1 + n) % n;
  guard = 0;
  while (cov[(e + 1) % n] && guard++ < n) e = (e + 1) % n;
  const idxs = [];
  if (s <= e) { for (let i = s; i <= e; i++) idxs.push(i); }
  else { for (let i = s; i < n; i++) idxs.push(i); for (let i = 0; i <= e; i++) idxs.push(i); }
  return { start: s, end: e, idxs };
}

// Depth of an open run-off region: the run-off's outer boundary is a STRAIGHT line
// (chord) between the merged run's first and last nodes, and the brown fills the
// segment between the curved road edge and that chord. This returns the maximum
// perpendicular distance from the intermediate nodes to that chord (the corner-cut
// depth), used by physics so the slow/drift zone matches the rendered fill.
function openBandWidth(wr) {
  const sp = G.track && G.track.spline;
  if (!sp || !sp.length) return 46;
  const n = sp.length;
  const span = openMergedSpan(wr);
  const A = sp[span.start % n];
  const B = sp[span.end % n];
  if (!A || !B) return 46;
  const dx = B.x - A.x, dy = B.y - A.y;
  const L = Math.sqrt(dx * dx + dy * dy) || 1;
  let maxD = 0;
  for (const i of span.idxs) {
    const p = sp[i % n];
    if (!p) continue;
    const d = Math.abs((dx * (p.y - A.y) - dy * (p.x - A.x)) / L);
    if (d > maxD) maxD = d;
  }
  return Math.max(40, maxD);
}

// Road-edge point at a spline sample, offset outward by `extra` on the given side
// (sign: +1 left, -1 right). Mirrors the edge math used by the renderer.
function splineEdgePoint(i, sign, extra) {
  const sp = G.track && G.track.spline;
  if (!sp || !sp.length) return { x: 0, y: 0 };
  const n = sp.length;
  const sw = G.track.splineWidth;
  const iPrev = (i - 1 + n) % n;
  const iNext = (i + 1) % n;
  let tx = sp[iNext].x - sp[iPrev].x, ty = sp[iNext].y - sp[iPrev].y;
  const tl = Math.sqrt(tx * tx + ty * ty) || 1;
  tx /= tl; ty /= tl;
  const nx = -ty, ny = tx;
  const w = (sw && sw[i] ? sw[i] : TRACK_W) + extra;
  return { x: sp[i].x + nx * w * sign, y: sp[i].y + ny * w * sign };
}

// LOCAL depth of the open run-off at a single spline sample: the distance from the
// road edge to the straight chord at that sample. Zero at the run's ends, maximal in
// the middle — so the physics slow/drift zone follows the chord exactly like the
// rendered brown fill (no uniform band spilling into the void at the ends).
function openDepthAt(wr, idx, sign) {
  const sp = G.track && G.track.spline;
  if (!sp || !sp.length) return 0;
  const n = sp.length;
  const span = openMergedSpan(wr);
  const idxs = span.idxs;
  const N = idxs.length;
  if (N < 2) return 0;
  const target = ((idx % n) + n) % n;
  const k = idxs.indexOf(target);
  if (k < 0) return 0;
  const e0 = splineEdgePoint(idxs[0], sign, 0);
  const eN = splineEdgePoint(idxs[N - 1], sign, 0);
  const ek = splineEdgePoint(target, sign, 0);
  const t = k / (N - 1);
  const cx = lerp(e0.x, eN.x, t), cy = lerp(e0.y, eN.y, t);
  return dist(ek.x, ek.y, cx, cy);
}

function supportFloorAtSplineIdx(idx) {
  if (!G.track || !G.track.bridges || !G.track.bridges.length) return 0;
  const n = G.track.spline ? G.track.spline.length : 0;
  if (!n) return 0;
  let floor = 0;
  for (const b of G.track.bridges) {
    if (idxInBridge(idx, b, n)) floor = Math.max(floor, b.floor || 1);
  }
  return floor;
}

function dist2(ax,ay,bx,by){ return (ax-bx)**2+(ay-by)**2; }
function dist(ax,ay,bx,by){ return Math.sqrt(dist2(ax,ay,bx,by)); }
function angle(ax,ay,bx,by){ return Math.atan2(by-ay,bx-ax); }
function lerp(a,b,t){ return a+(b-a)*t; }
function angleDiff(a,b){ let d=((b-a)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI; return d; }
