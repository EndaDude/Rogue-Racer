// ============================================================
// MAP EDITOR
// ============================================================
const ME = {
  wpts: [], spline: [], splineW: [],
  obstacles: [],
  powerups: [],
  wallRegions: [],
  trackModel: 'v1',   // 'v1' = classic single loop, 'v2' = branching splits
  branches: [],       // V2 only: [{ id, fromIdx, toIdx, nodes:[...], parent }]
  selectedBranch: null,   // V2: owner main-node index whose fork node is selected (null = main loop)
  selectedBranchPath: 0,  // V2: which fork of that node (0 = left, 1 = right)
  selectedBranchNode: -1, // V2: index into that fork's node list
  dragBranch: null, dragBranchPath: 0, dragBranchNode: -1,
  dragIdx: -1, isPanning: false, lastMX: 0, lastMY: 0,
  zoom: 0.22, panX: 0, panY: 0,
  selectedIdx: -1,
  mode: 'waypoint',
  wallMode: 'solid',
  wallSide: 'both',
  wallForce: 120,
  wallBounce: 1,
  obstacleType: 'wall',
  obstacleLayer: 0,
  obstacleRot: 0,
  obstacleScale: 1,
};
function meC()      { return document.getElementById('me-canvas'); }
function meWtoX(wx) { const c=meC(); return (wx-ME.panX)*ME.zoom+c.width/2; }
function meWtoY(wy) { const c=meC(); return (wy-ME.panY)*ME.zoom+c.height/2; }
function meXtoW(cx) { const c=meC(); return (cx-c.width/2)/ME.zoom+ME.panX; }
function meYtoW(cy) { const c=meC(); return (cy-c.height/2)/ME.zoom+ME.panY; }

function meRebuildSpline() {
  ME.spline=[]; ME.splineW=[];
  const pts=ME.wpts, N=pts.length;
  if(N<3) return;
  for(let i=0;i<N;i++){
    const p0=pts[(i-1+N)%N],p1=pts[i],p2=pts[(i+1)%N],p3=pts[(i+2)%N];
    const w1=Math.max(40,Math.min(180,+p1.width||TRACK_W));
    const w2=Math.max(40,Math.min(180,+p2.width||TRACK_W));
    const segMax = (i === N - 1) ? 16 : 15;
    for(let t=0;t<=segMax;t++) {
      const tt=t/16;
      ME.spline.push(catmullRom(p0,p1,p2,p3,tt));
      ME.splineW.push(lerp(w1,w2,tt));
    }
  }
}

function meDefaultNode(x,y){ return {x,y,type:'road',width:TRACK_W,checkpoint:false,slope:false,slopeDir:0,supportLayer:0}; }

// ---- V2 branching helpers ----
let _meBranchSeq = 1;
function meNewBranchId(){ return 'b' + (_meBranchSeq++); }
function meCloneBranches(branches){
  if (!Array.isArray(branches)) return [];
  return branches.map(b => ({
    id: b.id || meNewBranchId(),
    fromIdx: Math.max(0, Math.round(+b.fromIdx || 0)),
    toIdx: Math.max(0, Math.round(+b.toIdx || 0)),
    parent: b.parent || null,
    nodes: Array.isArray(b.nodes) ? b.nodes.map(p => ({ ...meDefaultNode(+p.x, +p.y), ...p, x:+p.x, y:+p.y })) : [],
  }));
}
function meNormalizeBranches(branches){
  const out = meCloneBranches(branches);
  // Keep the sequence id ahead of any loaded ids so new ids never collide.
  out.forEach(b => { const m = /^b(\d+)$/.exec(b.id || ''); if (m) _meBranchSeq = Math.max(_meBranchSeq, (+m[1]) + 1); });
  return out;
}

// The node the settings panel / type / width controls act on: a branch node when
// one is selected, otherwise the selected main node.
function meActiveNode(){
  if (ME.selectedBranch != null) {
    const owner = ME.wpts[ME.selectedBranch];
    const path = owner && Array.isArray(owner.branches) ? owner.branches[ME.selectedBranchPath] : null;
    if (Array.isArray(path) && ME.selectedBranchNode >= 0 && ME.selectedBranchNode < path.length)
      return path[ME.selectedBranchNode];
    return null;
  }
  if (ME.selectedIdx >= 0 && ME.selectedIdx < ME.wpts.length) return ME.wpts[ME.selectedIdx];
  return null;
}
// Clean a loaded waypoint, preserving (recursively) any V2 forks it carries.
function meNormalizeEditorNode(p){
  const n = {
    x:+p.x, y:+p.y,
    type:['road','bridge','bridge3','void','ice','river'].includes(p.type)?p.type:'road',
    checkpoint:!!p.checkpoint,
    slope:!!p.slope,
    slopeDir:Number.isFinite(+p.slopeDir) ? +p.slopeDir : 0,
    supportLayer: Number.isFinite(+p.supportLayer) ? Math.round(+p.supportLayer) : 0,
    width:Math.max(40,Math.min(180,+p.width||TRACK_W)),
  };
  // Two-fork model: `branches` = array of paths (each a node list). Migrate the old
  // single `branch` into a one-element `branches`.
  let branches = null;
  if (Array.isArray(p.branches) && p.branches.length) branches = p.branches;
  else if (Array.isArray(p.branch) && p.branch.length) branches = [p.branch];
  if (branches) n.branches = branches.map(path => (Array.isArray(path) ? path.map(meNormalizeEditorNode) : [])).filter(path => path.length);
  return n;
}
// Fork the selected main node into TWO paths (left + right) that rejoin the next node.
function meSplitSelected(){
  if (ME.selectedBranch != null) return; // in-editor nesting not supported yet
  if (ME.selectedIdx < 0 || ME.selectedIdx >= ME.wpts.length) return;
  if (ME.trackModel !== 'v2') { alert('Switch Track Model to V2 to create track splits.'); return; }
  const N = ME.wpts.length; if (N < 2) return;
  const i = ME.selectedIdx;
  const a = ME.wpts[i], b = ME.wpts[(i + 1) % N];
  if (Array.isArray(a.branches) && a.branches.length) {
    ME.selectedBranch = i; ME.selectedBranchPath = 0; ME.selectedBranchNode = 0; ME.selectedIdx = -1;
    meRefreshNodeSettings(); meDraw(); return;
  }
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y; const dl = Math.hypot(dx, dy) || 1;
  const nx = -dy / dl, ny = dx / dl;
  const off = Math.max(90, dl * 0.45);
  const inheritType = (a.type && a.type !== 'void') ? a.type : 'road';
  const inheritWidth = Math.max(40, Math.min(180, Math.round((((+a.width || TRACK_W) + (+b.width || TRACK_W)) * 0.5) / 2) * 2));
  const makeFork = (sign) => {
    const mid = meDefaultNode(mx + nx * off * sign, my + ny * off * sign);
    mid.type = inheritType; mid.width = inheritWidth;
    return [mid];
  };
  a.branches = [makeFork(1), makeFork(-1)]; // left, right
  ME.selectedBranch = i; ME.selectedBranchPath = 0; ME.selectedBranchNode = 0; ME.selectedIdx = -1;
  meRefreshNodeSettings(); meDraw();
}
function meBranchHitTest(cx, cy){
  if (ME.trackModel !== 'v2') return null;
  for (let i = 0; i < ME.wpts.length; i++) {
    const brs = ME.wpts[i].branches;
    if (!Array.isArray(brs)) continue;
    for (let pi = 0; pi < brs.length; pi++) {
      const path = brs[pi];
      if (!Array.isArray(path)) continue;
      for (let k = path.length - 1; k >= 0; k--) {
        const sx = meWtoX(path[k].x), sy = meWtoY(path[k].y);
        if ((cx - sx) ** 2 + (cy - sy) ** 2 <= 12 * 12) return { owner: i, path: pi, node: k };
      }
    }
  }
  return null;
}
function meBranchSegmentHitTest(cx, cy){
  if (ME.trackModel !== 'v2') return null;
  const N = ME.wpts.length;
  if (N < 2) return null;
  let best = null;
  for (let i = 0; i < N; i++) {
    const brs = ME.wpts[i].branches;
    if (!Array.isArray(brs) || !brs.length) continue;
    for (let pi = 0; pi < brs.length; pi++) {
      const br = brs[pi];
      if (!Array.isArray(br) || !br.length) continue;
      const ctrl = [ME.wpts[i]].concat(br, [ME.wpts[(i + 1) % N]]);
      const m = ctrl.length;
      for (let k = 0; k < m - 1; k++) {
        const c0 = ctrl[Math.max(0, k - 1)], c1 = ctrl[k], c2 = ctrl[k + 1], c3 = ctrl[Math.min(m - 1, k + 2)];
        const w1 = Math.max(40, Math.min(180, +c1.width || TRACK_W)), w2 = Math.max(40, Math.min(180, +c2.width || TRACK_W));
        const steps = (k === m - 2) ? 16 : 15;
        for (let s = 0; s <= steps; s++) {
          const t = s / 16;
          const p = catmullRom(c0, c1, c2, c3, t);
          const sx = meWtoX(p.x), sy = meWtoY(p.y);
          const d2 = (cx - sx) ** 2 + (cy - sy) ** 2;
          const halfWScreen = lerp(w1, w2, t) * ME.zoom;
          if (!best || d2 < best.d2) best = { d2, owner: i, path: pi, insertAt: k, x: p.x, y: p.y, halfWScreen };
        }
      }
    }
  }
  return best;
}

function meInjectLegacyBridgeSlopes(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return;
  const n = pts.length;
  let hasSlope = false;
  for (const p of pts) {
    if (p && p.slope) { hasSlope = true; break; }
  }
  if (hasSlope) return;

  function isBridgeType(t) { return t === 'bridge' || t === 'bridge3'; }

  let runStart = -1;
  for (let i = 0; i < n; i++) {
    const t = (pts[i] && pts[i].type) || 'road';
    const isBridge = isBridgeType(t);
    if (isBridge && runStart < 0) {
      runStart = i;
    } else if (!isBridge && runStart >= 0) {
      const runEnd = i - 1;
      const s = runStart;
      const e = runEnd;
      const sNext = (s + 1) % n;
      const eNext = (e + 1) % n;

      const sDir = Math.atan2(pts[sNext].y - pts[s].y, pts[sNext].x - pts[s].x);
      const eDir = Math.atan2(pts[eNext].y - pts[e].y, pts[eNext].x - pts[e].x) + Math.PI;

      pts[s].slope = true;
      if (!Number.isFinite(pts[s].slopeDir)) pts[s].slopeDir = sDir;
      pts[e].slope = true;
      if (!Number.isFinite(pts[e].slopeDir)) pts[e].slopeDir = eDir;
      runStart = -1;
    }
  }

  if (runStart >= 0) {
    const s = runStart;
    const e = n - 1;
    const sNext = (s + 1) % n;
    const eNext = (e + 1) % n;
    const sDir = Math.atan2(pts[sNext].y - pts[s].y, pts[sNext].x - pts[s].x);
    const eDir = Math.atan2(pts[eNext].y - pts[e].y, pts[eNext].x - pts[e].x) + Math.PI;
    pts[s].slope = true;
    if (!Number.isFinite(pts[s].slopeDir)) pts[s].slopeDir = sDir;
    pts[e].slope = true;
    if (!Number.isFinite(pts[e].slopeDir)) pts[e].slopeDir = eDir;
  }
}

// Auto-layer detection: objects placed on the map inherit the support layer of
// the nearest track node (main loop + any V2 branch nodes), so bridge decks get
// deck obstacles without touching the layer box.
function meAutoLayerAt(wx, wy) {
  let best = 0, bd = Infinity;
  const consider = (p) => {
    if (!p) return;
    const d2 = (p.x - wx) * (p.x - wx) + (p.y - wy) * (p.y - wy);
    if (d2 < bd) { bd = d2; best = Math.round(p.supportLayer || 0); }
  };
  (ME.wpts || []).forEach(consider);
  const walkBranches = (branches) => {
    if (!branches) return;
    Object.values(branches).forEach(list => (Array.isArray(list) ? list : []).forEach(path => {
      (path && path.nodes ? path.nodes : []).forEach(nd => { consider(nd); if (nd && nd.branches) walkBranches(nd.branches); });
    }));
  };
  try { walkBranches(ME.branches); } catch (_) {}
  return best;
}

// Nearest-segment tangent (radians) of the track at a world point — used to
// auto-orient obstacles to the road direction on placement.
function meAutoTangentAt(wx, wy) {
  const sp = ME.spline;
  if (!sp || sp.length < 2) return 0;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < sp.length; i++) {
    const d2 = (sp[i].x - wx) ** 2 + (sp[i].y - wy) ** 2;
    if (d2 < bd) { bd = d2; bi = i; }
  }
  const a = sp[(bi - 1 + sp.length) % sp.length];
  const b = sp[(bi + 1) % sp.length];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// Obstacles that visually READ as a barrier get turned broadside to the road so
// they actually block the lane; flowing/directional pieces align WITH the road.
const OBS_BLOCKERS = new Set(['wall', 'brick_wall', 'moving_platform', 'punch_glove', 'snow_pile']);
const OBS_ALONG = new Set(['flowing_water', 'boost_pad', 'ice_track']);
function meAutoObstacleRot(type, wx, wy) {
  const tangDeg = meAutoTangentAt(wx, wy) * 180 / Math.PI;
  if (OBS_BLOCKERS.has(type)) return Math.round(((tangDeg + 90) % 360 + 360) % 360 - 180);
  if (OBS_ALONG.has(type)) return Math.round(((tangDeg) % 360 + 360) % 360 - 180);
  return ME.obstacleRot || 0; // round pieces (cone, repair pad): leave as-is
}

function meDefaultObstacle(type, x, y, layer) {
  const t = type || 'wall';
  const r = t === 'flowing_water' ? 30
    : t === 'ice_track' ? 30
    : t === 'moving_platform' ? 17
    : t === 'snow_pile' ? 18
    : t === 'punch_glove' ? 16
    : t === 'brick_wall' ? 18
    : 14;
  return {
    x, y,
    r,
    type: t,
    active: true,
    respawn: 0,
    moveAmp: 34,
    moveSpeed: 1.1,
    flowDir: 0,
    phase: 0,
    layer: Number.isFinite(+layer) ? Math.round(+layer) : 0,
    rot: ME.obstacleRot || 0,
    scale: Math.max(0.4, Math.min(2.2, ME.obstacleScale || 1)),
  };
}

function meHitTestObstacle(cx, cy) {
  for (let i = ME.obstacles.length - 1; i >= 0; i--) {
    const o = ME.obstacles[i];
    const sx = meWtoX(o.x), sy = meWtoY(o.y);
    const rr = Math.max(8, (o.r || 12) * (o.scale || 1) * ME.zoom);
    if ((cx - sx) ** 2 + (cy - sy) ** 2 <= rr * rr) return i;
  }
  return -1;
}

function meHitTestPowerup(cx, cy) {
  for (let i = ME.powerups.length - 1; i >= 0; i--) {
    const p = ME.powerups[i];
    const sx = meWtoX(p.x), sy = meWtoY(p.y);
    const rr = Math.max(7, (p.r || 12) * ME.zoom);
    if ((cx - sx) ** 2 + (cy - sy) ** 2 <= rr * rr) return i;
  }
  return -1;
}

function meUpsertWallRegion(seg, mode, side, force, bounce, branch) {
  if (seg == null || seg < 0) return;
  const sameBranch = (w) => branch
    ? (w.branch && w.branch.owner === branch.owner && w.branch.path === branch.path)
    : !w.branch;
  const idx = ME.wallRegions.findIndex(w => w.seg === seg && (w.side || 'both') === (side || 'both') && sameBranch(w));
  const rec = {
    seg,
    mode: mode || 'solid',
    side: side || 'both',
    force: Math.max(20, Math.min(300, Number.isFinite(+force) ? +force : 120)),
    bounce: Math.max(0.2, Math.min(2.0, Number.isFinite(+bounce) ? +bounce : 1.0)),
  };
  if (branch) rec.branch = { owner: branch.owner, path: branch.path };
  if (idx >= 0) ME.wallRegions[idx] = rec;
  else ME.wallRegions.push(rec);
}

function meRefreshNodeSettings() {
  const lbl=document.getElementById('me-selected-node');
  const wr=document.getElementById('me-node-width-range');
  const wn=document.getElementById('me-node-width');
  const slopeBtn = document.getElementById('me-node-slope');
  const slopeAng = document.getElementById('me-node-slope-angle');
  const layerSel = document.getElementById('me-node-support-layer');
  const splitBtn = document.getElementById('me-node-split');
  const cpBtn = document.getElementById('me-node-checkpoint');
  const branchSel = ME.selectedBranch != null;
  const n = meActiveNode();
  const has = !!n;
  if(!has){
    lbl.textContent='Node: none';
    wr.disabled=true; wn.disabled=true;
    if (cpBtn) cpBtn.classList.remove('active');
    if (slopeBtn) slopeBtn.classList.remove('active');
    if (slopeAng) slopeAng.textContent = '0°';
    if (layerSel) { layerSel.disabled = true; layerSel.value = '0'; }
    if (splitBtn) { splitBtn.disabled = true; splitBtn.classList.remove('active'); }
    document.querySelectorAll('.me-type-btn[data-type]').forEach(b=>b.classList.remove('active'));
    return;
  }
  const t=n.type||'road';
  const w=Math.max(40,Math.min(180,+n.width||TRACK_W));
  lbl.textContent = branchSel ? `Fork node · on node ${ME.selectedBranch} (${ME.selectedBranchPath === 0 ? 'left' : 'right'})` : `Node: ${ME.selectedIdx}`;
  wr.disabled=false; wn.disabled=false;
  wr.value=String(w); wn.value=String(w);
  // Checkpoints are lap gates — main loop only (a fork you didn't take would block the
  // lap). Slope + support-layer apply to fork nodes too, so forks get real elevation.
  if (cpBtn) { cpBtn.classList.toggle('active', !branchSel && !!n.checkpoint); cpBtn.disabled = branchSel; }
  if (slopeBtn) { slopeBtn.classList.toggle('active', !!n.slope); slopeBtn.disabled = false; }
  if (slopeAng) {
    const deg = Math.round((((n.slopeDir || 0) * 180 / Math.PI) % 360 + 360) % 360);
    slopeAng.textContent = `${deg}\u00b0`;
  }
  if (layerSel) {
    const lv = Number.isFinite(+n.supportLayer) ? Math.round(+n.supportLayer) : 0;
    layerSel.disabled = false;
    layerSel.value = String(lv);
  }
  if (splitBtn) {
    splitBtn.disabled = !(ME.trackModel === 'v2' && !branchSel);
    splitBtn.classList.toggle('active', !branchSel && Array.isArray(n.branches) && n.branches.length > 0);
  }
  document.querySelectorAll('.me-type-btn[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===t));
}

function meSetSelectedType(type){
  const node=meActiveNode(); if(!node) return;
  if (type === 'bridge' || type === 'bridge3') type = 'road';
  node.type=type;
  meRebuildSpline();
  meRefreshNodeSettings();
  meDraw();
}

function meSetSelectedWidth(width){
  const node=meActiveNode(); if(!node) return;
  const w=Math.max(40,Math.min(180,+width||TRACK_W));
  node.width=w;
  meRebuildSpline();
  meRefreshNodeSettings();
  meDraw();
}

function meToggleSelectedCheckpoint(){
  if(ME.selectedIdx<0||ME.selectedIdx>=ME.wpts.length) return;
  ME.wpts[ME.selectedIdx].checkpoint = !ME.wpts[ME.selectedIdx].checkpoint;
  meRefreshNodeSettings();
  meDraw();
}

// Auto up-direction for a slope node: points along the track toward the neighbouring
// side with the higher support layer. Returns null when both sides share a layer
// (ambiguous), leaving any manual direction untouched.
function meAutoSlopeDir(i){
  const pts = ME.wpts; const N = Array.isArray(pts) ? pts.length : 0;
  if (N < 3) return null;
  const layerOf = (j) => {
    const q = ((j % N) + N) % N;
    return Number.isFinite(+pts[q].supportLayer) ? Math.round(+pts[q].supportLayer) : 0;
  };
  const fwd = layerOf(i + 1), bwd = layerOf(i - 1);
  if (fwd === bwd) return null;
  const a = pts[((i - 1) % N + N) % N];
  const b = pts[((i + 1) % N + N) % N];
  let tx = b.x - a.x, ty = b.y - a.y;
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const sign = fwd > bwd ? 1 : -1;
  return Math.atan2(ty * sign, tx * sign);
}

function meToggleSelectedSlope(){
  const n = meActiveNode(); if(!n) return;
  n.slope = !n.slope;
  if (n.slope) {
    if (ME.selectedBranch == null) {
      const auto = meAutoSlopeDir(ME.selectedIdx);
      if (auto != null) n.slopeDir = auto;
      else if (!Number.isFinite(n.slopeDir)) n.slopeDir = 0;
    } else if (!Number.isFinite(n.slopeDir)) {
      n.slopeDir = 0;
    }
  }
  meRefreshNodeSettings();
  meDraw();
}

function meRotateSelectedSlope(deltaDeg){
  const n = meActiveNode(); if(!n) return;
  n.slope = true;
  const rad = (deltaDeg || 0) * Math.PI / 180;
  n.slopeDir = (n.slopeDir || 0) + rad;
  meRefreshNodeSettings();
  meDraw();
}

function meSetSelectedSupportLayer(layer){
  const n = meActiveNode(); if(!n) return;
  n.supportLayer = Number.isFinite(+layer) ? Math.round(+layer) : 0;
  if (ME.selectedBranch == null) {
    // Re-orient nearby auto slopes since their uphill side may have changed.
    const N = ME.wpts.length;
    for (let d = -1; d <= 1; d++) {
      const j = ((ME.selectedIdx + d) % N + N) % N;
      if (ME.wpts[j] && ME.wpts[j].slope) {
        const auto = meAutoSlopeDir(j);
        if (auto != null) ME.wpts[j].slopeDir = auto;
      }
    }
  }
  meRebuildSpline();
  meRefreshNodeSettings();
  meDraw();
}

// Returns CSS colour for a waypoint type
function meTypeColor(type) {
  return type==='void'?'#ef4444'
    : type==='ice'?'#7dd3fc'
    : type==='river'?'#38bdf8'
    : '#a855f7';
}

function meDraw() {
  const canvas=meC(); if(!canvas) return;
  const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,W,H);
  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.035)'; ctx.lineWidth=1;
  const gs=200*ME.zoom;
  for(let x=(meWtoX(0)%gs+gs)%gs;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=(meWtoY(0)%gs+gs)%gs;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  // Track preview
  if(ME.spline.length>1){
    const n=ME.spline.length;
    function buildSides(extraW){
      const left=[], right=[];
      for(let i=0;i<n;i++){
        const ip=(i-1+n)%n, inx=(i+1)%n;
        const p=ME.spline[i], pp=ME.spline[ip], pn=ME.spline[inx];
        let tx=pn.x-pp.x, ty=pn.y-pp.y;
        const tl=Math.sqrt(tx*tx+ty*ty)||1;
        tx/=tl; ty/=tl;
        const nx=-ty, ny=tx;
        const w=((ME.splineW[i]||TRACK_W)+extraW);
        left.push({x:p.x+nx*w,y:p.y+ny*w});
        right.push({x:p.x-nx*w,y:p.y-ny*w});
      }
      return {left,right};
    }
    function fillRibbon(left,right,color){
      ctx.beginPath();
      ctx.moveTo(meWtoX(left[0].x),meWtoY(left[0].y));
      for(let i=1;i<left.length;i++) ctx.lineTo(meWtoX(left[i].x),meWtoY(left[i].y));
      for(let i=right.length-1;i>=0;i--) ctx.lineTo(meWtoX(right[i].x),meWtoY(right[i].y));
      ctx.closePath();
      ctx.fillStyle=color;ctx.fill();
    }
    const outer=buildSides(4), inner=buildSides(0);
    fillRibbon(outer.left,outer.right,'#1a1a26');
    fillRibbon(inner.left,inner.right,'#2a2a3a');

    ctx.beginPath();
    ctx.moveTo(meWtoX(ME.spline[0].x),meWtoY(ME.spline[0].y));
    for(let i=1;i<n;i++) ctx.lineTo(meWtoX(ME.spline[i].x),meWtoY(ME.spline[i].y));
    ctx.closePath();
    ctx.lineWidth=2;ctx.strokeStyle='rgba(124,58,237,0.5)';ctx.stroke();
  }
  // Control polygon
  if(ME.wpts.length>1){
    ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(168,85,247,0.22)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(meWtoX(ME.wpts[0].x),meWtoY(ME.wpts[0].y));
    for(let i=1;i<ME.wpts.length;i++)ctx.lineTo(meWtoX(ME.wpts[i].x),meWtoY(ME.wpts[i].y));
    ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  }
  // V2 fork roads — real road ribbons (drawn under the nodes)
  if (ME.trackModel === 'v2' && ME.wpts.length >= 2) {
    const NN = ME.wpts.length;
    ME.wpts.forEach((a, i) => {
      const brs = a.branches;
      if (!Array.isArray(brs) || !brs.length) return;
      const b = ME.wpts[(i + 1) % NN];
      brs.forEach((br) => {
      if (!Array.isArray(br) || !br.length) return;
      const ctrl = [a].concat(br, [b]);
      const m = ctrl.length;
      const samp = [], sampW = [];
      for (let k = 0; k < m - 1; k++) {
        const c0 = ctrl[Math.max(0, k - 1)], c1 = ctrl[k], c2 = ctrl[k + 1], c3 = ctrl[Math.min(m - 1, k + 2)];
        const w1 = Math.max(40, Math.min(180, +c1.width || TRACK_W)), w2 = Math.max(40, Math.min(180, +c2.width || TRACK_W));
        const steps = (k === m - 2) ? 16 : 15;
        for (let s = 0; s <= steps; s++) { const t = s / 16; samp.push(catmullRom(c0, c1, c2, c3, t)); sampW.push(lerp(w1, w2, t)); }
      }
      const bn2 = samp.length;
      const bside = (extra) => {
        const left = [], right = [];
        for (let k = 0; k < bn2; k++) {
          const p = samp[k]; const ip = Math.max(0, k - 1), inx = Math.min(bn2 - 1, k + 1);
          let tx = samp[inx].x - samp[ip].x, ty = samp[inx].y - samp[ip].y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const nx = -ty, ny = tx; const w = sampW[k] + extra;
          left.push({ x: p.x + nx * w, y: p.y + ny * w }); right.push({ x: p.x - nx * w, y: p.y - ny * w });
        }
        return { left, right };
      };
      const bfill = (left, right, color) => {
        ctx.beginPath();
        ctx.moveTo(meWtoX(left[0].x), meWtoY(left[0].y));
        for (let k = 1; k < left.length; k++) ctx.lineTo(meWtoX(left[k].x), meWtoY(left[k].y));
        for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(meWtoX(right[k].x), meWtoY(right[k].y));
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      };
      const bo = bside(4), bi = bside(0);
      bfill(bo.left, bo.right, '#1a1a26');
      bfill(bi.left, bi.right, '#2a2a3a');
      ctx.beginPath();
      ctx.moveTo(meWtoX(samp[0].x), meWtoY(samp[0].y));
      for (let k = 1; k < bn2; k++) ctx.lineTo(meWtoX(samp[k].x), meWtoY(samp[k].y));
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(124,58,237,0.5)'; ctx.stroke();
      });
    });
  }
  // Waypoints — coloured by type
  ME.wpts.forEach((pt,i)=>{
    const sx=meWtoX(pt.x),sy=meWtoY(pt.y),r=i===0?10:8;
    const col=i===0?'#f59e0b':meTypeColor(pt.type||'road');
    // Void: draw X marker
    if(pt.type==='void'){
      ctx.save();ctx.translate(sx,sy);
      ctx.strokeStyle=col;ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(-r,- r);ctx.lineTo(r,r);ctx.stroke();
      ctx.beginPath();ctx.moveTo(r,-r);ctx.lineTo(-r,r);ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);
      ctx.fillStyle=col;ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    }
    ctx.fillStyle='#fff';ctx.font='bold 9px monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i,sx,sy);
    const nodeLayer = Number.isFinite(+pt.supportLayer) ? Math.round(+pt.supportLayer) : 0;
    if (nodeLayer > 0) {
      ctx.fillStyle='rgba(191,219,254,0.95)';
      ctx.font='bold 8px monospace';
      ctx.textAlign='center';
      ctx.textBaseline='bottom';
      ctx.fillText(`L${nodeLayer}`, sx, sy - r - 6);
    }
    if(i===ME.selectedIdx){
      ctx.beginPath();ctx.arc(sx,sy,r+5,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=2;ctx.stroke();
    }
    if(pt.checkpoint){
      ctx.beginPath();ctx.arc(sx,sy,r+9,0,Math.PI*2);
      ctx.strokeStyle='rgba(251,191,36,0.95)';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fbbf24';ctx.font='bold 8px system-ui';
      ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText('CP',sx,sy+r+3);
    }
    if(pt.slope){
      const ang = Number.isFinite(pt.slopeDir) ? pt.slopeDir : 0;
      const len = 16;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const bx = sx - ux * len * 0.5, by = sy - uy * len * 0.5;
      const fx = sx + ux * len * 0.5, fy = sy + uy * len * 0.5;
      ctx.lineWidth = 2;
      // up direction = white
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - ux * 5 - uy * 4, fy - uy * 5 + ux * 4);
      ctx.lineTo(fx - ux * 5 + uy * 4, fy - uy * 5 - ux * 4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      // down direction = black
      ctx.strokeStyle = 'rgba(10,10,15,0.95)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + ux * 5 - uy * 4, by + uy * 5 + ux * 4);
      ctx.lineTo(bx + ux * 5 + uy * 4, by + uy * 5 - ux * 4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,10,15,0.95)';
      ctx.fill();
    }
  });

  // V2 fork road nodes — full road nodes drawn on top; cyan ring marks the fork
  if (ME.trackModel === 'v2') {
    ME.wpts.forEach((a, i) => {
      const brs = a.branches;
      if (!Array.isArray(brs) || !brs.length) return;
      brs.forEach((br, pi) => {
      if (!Array.isArray(br) || !br.length) return;
      br.forEach((nd, k) => {
        const sx = meWtoX(nd.x), sy = meWtoY(nd.y), r = 8;
        const col = meTypeColor(nd.type || 'road');
        if (nd.type === 'void') {
          ctx.save(); ctx.translate(sx, sy); ctx.strokeStyle = col; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(r, -r); ctx.lineTo(-r, r); ctx.stroke(); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2.5; ctx.stroke();
        }
        const ndLayer = Number.isFinite(+nd.supportLayer) ? Math.round(+nd.supportLayer) : 0;
        if (ndLayer > 0) {
          ctx.fillStyle = 'rgba(191,219,254,0.95)'; ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText('L' + ndLayer, sx, sy - r - 6);
        }
        if (nd.slope) {
          const ang = Number.isFinite(nd.slopeDir) ? nd.slopeDir : 0;
          const len = 16, ux = Math.cos(ang), uy = Math.sin(ang);
          const fx = sx + ux * len * 0.5, fy = sy + uy * len * 0.5;
          const bx = sx - ux * len * 0.5, by = sy - uy * len * 0.5;
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(fx, fy);
          ctx.lineTo(fx - ux * 5 - uy * 4, fy - uy * 5 + ux * 4);
          ctx.lineTo(fx - ux * 5 + uy * 4, fy - uy * 5 - ux * 4);
          ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
          ctx.strokeStyle = 'rgba(10,10,15,0.95)';
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke();
        }
        if (ME.selectedBranch === i && ME.selectedBranchPath === pi && ME.selectedBranchNode === k) {
          ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        }
      });
      });
    });
  }

  // Manual obstacles
  ME.obstacles.forEach(o => {
    const sx = meWtoX(o.x), sy = meWtoY(o.y);
    const rr = Math.max(5, (o.r || 12) * (o.scale || 1) * ME.zoom);
    const rot = ((o.rot || 0) * Math.PI) / 180;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    if (o.type === 'flowing_water') {
      ctx.fillStyle = 'rgba(56,189,248,0.36)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rr * 1.3, rr * 0.9, o.flowDir || 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,211,252,0.85)';
      ctx.stroke();
    } else if (o.type === 'ice_track') {
      ctx.fillStyle = 'rgba(191,219,254,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rr * 1.25, rr * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(219,234,254,0.92)';
      ctx.stroke();
    } else if (o.type === 'snow_pile') {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.type === 'brick_wall') {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-rr * 1.2, -rr * 0.7, rr * 2.4, rr * 1.4);
      ctx.strokeStyle = '#f59e0b';
      ctx.strokeRect(-rr * 1.2, -rr * 0.7, rr * 2.4, rr * 1.4);
    } else if (o.type === 'moving_platform') {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-rr * 1.2, -rr * 0.65, rr * 2.4, rr * 1.3);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(-rr * 1.2, -rr * 0.65, rr * 2.4, rr * 1.3);
    } else if (o.type === 'punch_glove') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.type === 'wall') {
      ctx.fillStyle = '#4b5563';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L' + (Math.round(o.layer || 0)), sx, sy - rr - 8);
  });

  // Manual powerups
  ME.powerups.forEach(p => {
    const sx = meWtoX(p.x), sy = meWtoY(p.y);
    const rr = Math.max(6, (p.r || 12) * ME.zoom);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Date.now() / 1200);
    ctx.fillStyle = '#fbbf24';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(-rr * 0.75, -rr * 0.75, rr * 1.5, rr * 1.5);
    }
    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L' + (Math.round(p.layer || 0)), sx, sy - rr - 8);
  });

  // Wall-painted segment overlays
  if (ME.wpts.length > 1 && ME.wallRegions.length) {
    ME.wallRegions.forEach(w => {
      if (w.branch) return; // fork walls drawn in the fork pass below
      const n = ME.wpts.length;
      const i = ((w.seg % n) + n) % n;
      const j = (i + 1) % n;
      if (i === j) return;
      const a = ME.wpts[i], b = ME.wpts[j];
      const ax = meWtoX(a.x), ay = meWtoY(a.y);
      const bx = meWtoX(b.x), by = meWtoY(b.y);
      let tx = bx - ax, ty = by - ay;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const side = w.side || 'both';
      const col = w.mode === 'open' ? 'rgba(239,68,68,0.95)' : (w.mode === 'bouncy' ? 'rgba(251,191,36,0.95)' : 'rgba(148,163,184,0.95)');
      function drawSide(sign) {
        const off = 12 * sign;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ax + nx * off, ay + ny * off);
        ctx.lineTo(bx + nx * off, by + ny * off);
        ctx.stroke();
      }
      if (side === 'left' || side === 'both') drawSide(+1);
      if (side === 'right' || side === 'both') drawSide(-1);
    });
    // Fork wall overlays (V2): draw between the fork's control nodes for the segment.
    const nW = ME.wpts.length;
    ME.wallRegions.forEach(w => {
      if (!w.branch) return;
      const owner = ME.wpts[w.branch.owner];
      if (!owner || !Array.isArray(owner.branches)) return;
      const path = owner.branches[w.branch.path];
      if (!Array.isArray(path) || !path.length) return;
      const ctrl = [owner].concat(path, [ME.wpts[(w.branch.owner + 1) % nW]]);
      const k = w.seg;
      if (k < 0 || k + 1 >= ctrl.length) return;
      const a = ctrl[k], b = ctrl[k + 1];
      const ax = meWtoX(a.x), ay = meWtoY(a.y);
      const bx = meWtoX(b.x), by = meWtoY(b.y);
      let tx = bx - ax, ty = by - ay;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const side = w.side || 'both';
      const col = w.mode === 'open' ? 'rgba(239,68,68,0.95)' : (w.mode === 'bouncy' ? 'rgba(251,191,36,0.95)' : 'rgba(148,163,184,0.95)');
      const drawSide = (sign) => {
        const off = 12 * sign;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ax + nx * off, ay + ny * off);
        ctx.lineTo(bx + nx * off, by + ny * off);
        ctx.stroke();
      };
      if (side === 'left' || side === 'both') drawSide(+1);
      if (side === 'right' || side === 'both') drawSide(-1);
    });
  }

  // Origin crosshair
  const ox=meWtoX(0),oy=meWtoY(0);
  ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(ox-14,oy);ctx.lineTo(ox+14,oy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ox,oy-14);ctx.lineTo(ox,oy+14);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.4)';ctx.font='11px monospace';
  ctx.textAlign='left';ctx.textBaseline='bottom';
  ctx.fillText(`${ME.wpts.length} waypoints  zoom:${ME.zoom.toFixed(2)}`,8,H-6);
}

function meHitTest(cx,cy){
  for(let i=ME.wpts.length-1;i>=0;i--){
    const sx=meWtoX(ME.wpts[i].x),sy=meWtoY(ME.wpts[i].y);
    if((cx-sx)**2+(cy-sy)**2<144) return i;
  }
  return -1;
}

function meHitTestSegment(cx, cy, includeWrap) {
  const n = ME.wpts.length;
  if (n < 2) return null;
  const useWrap = !!includeWrap;

  function hitSeg(i, j) {
    const a = ME.wpts[i];
    const b = ME.wpts[j];
    const ax = meWtoX(a.x), ay = meWtoY(a.y);
    const bx = meWtoX(b.x), by = meWtoY(b.y);
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / len2)) : 0;
    const px = ax + vx * t;
    const py = ay + vy * t;
    const d2 = (cx - px) * (cx - px) + (cy - py) * (cy - py);
    return { d2, insertAfter: i, x: meXtoW(px), y: meYtoW(py) };
  }

  let bestMain = null;
  for (let i = 0; i < n - 1; i++) {
    const h = hitSeg(i, i + 1);
    if (!h) continue;
    if (!bestMain || h.d2 < bestMain.d2) bestMain = h;
  }

  if (!useWrap || n < 3) return bestMain;

  const wrap = hitSeg(n - 1, 0);
  if (!bestMain) return wrap;
  return wrap.d2 < bestMain.d2 ? wrap : bestMain;
}

function meInitEditor(){
  const canvas=meC();
  const runRegressionBtn = document.getElementById('me-run-regression-btn');
  const modeWaypointBtn = document.getElementById('me-mode-waypoint');
  const modeWallBtn = document.getElementById('me-mode-wall');
  const modeObstacleBtn = document.getElementById('me-mode-obstacle');
  const modePowerupBtn = document.getElementById('me-mode-powerup');
  const modeEraseBtn = document.getElementById('me-mode-erase');
  const wallModeSel = document.getElementById('me-wall-mode');
  const wallSideSel = document.getElementById('me-wall-side');
  const wallForceInp = document.getElementById('me-wall-force');
  const wallBounceInp = document.getElementById('me-wall-bounce');
  const nodeSupportLayerSel = document.getElementById('me-node-support-layer');
  const obstacleTypeSel = document.getElementById('me-obstacle-type');
  const obstacleLayerSel = document.getElementById('me-obstacle-layer');
  const obstacleRotRange = document.getElementById('me-obstacle-rot-range');
  const obstacleRotNum = document.getElementById('me-obstacle-rot');
  const obstacleScaleRange = document.getElementById('me-obstacle-scale-range');
  const obstacleScaleNum = document.getElementById('me-obstacle-scale');

  function refreshModeButtons() {
    modeWaypointBtn.classList.toggle('active', ME.mode === 'waypoint');
    modeWallBtn.classList.toggle('active', ME.mode === 'wall');
    modeObstacleBtn.classList.toggle('active', ME.mode === 'obstacle');
    modePowerupBtn.classList.toggle('active', ME.mode === 'powerup');
    modeEraseBtn.classList.toggle('active', ME.mode === 'erase');
    // Contextual toolbar: only the active mode's controls are visible.
    const grpNode = document.getElementById('me-grp-node');
    const grpWall = document.getElementById('me-grp-wall');
    const grpObs  = document.getElementById('me-grp-obstacle');
    if (grpNode) grpNode.hidden = ME.mode !== 'waypoint';
    if (grpWall) grpWall.hidden = ME.mode !== 'wall';
    if (grpObs)  grpObs.hidden  = !(ME.mode === 'obstacle' || ME.mode === 'powerup');
    const hint = document.getElementById('me-mode-hint');
    if (hint) hint.textContent = {
      waypoint: 'Click to add track nodes · drag to move · click a node to edit its type / width / layer.',
      wall:     'Click a track edge segment to paint the selected wall behavior · right-click removes it.',
      obstacle: 'Click the track to place — the layer is auto-detected from the nearest node. Right-click erases.',
      powerup:  'Click the track to drop an item box — layer auto-detected. Right-click erases.',
      erase:    'Click any placed obstacle or item box to remove it.',
    }[ME.mode] || '';
  }

  function resize(){const w=canvas.parentElement;canvas.width=w.clientWidth;canvas.height=w.clientHeight;meDraw();}
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  // Type selector buttons edit selected node
  document.querySelectorAll('.me-type-btn[data-type]').forEach(btn=>{
    btn.addEventListener('click',()=>meSetSelectedType(btn.dataset.type));
  });
  document.getElementById('me-node-checkpoint').onclick = meToggleSelectedCheckpoint;
  const splitBtnEl = document.getElementById('me-node-split');
  if (splitBtnEl) splitBtnEl.onclick = meSplitSelected;
  const wr=document.getElementById('me-node-width-range');
  const wn=document.getElementById('me-node-width');
  wr.oninput=()=>{ wn.value=wr.value; meSetSelectedWidth(wr.value); };
  wn.oninput=()=>{ wr.value=wn.value; meSetSelectedWidth(wn.value); };
  modeWaypointBtn.onclick=()=>{ ME.mode='waypoint'; refreshModeButtons(); };
  modeWallBtn.onclick=()=>{ ME.mode='wall'; refreshModeButtons(); };
  modeObstacleBtn.onclick=()=>{ ME.mode='obstacle'; refreshModeButtons(); };
  modePowerupBtn.onclick=()=>{ ME.mode='powerup'; refreshModeButtons(); };
  modeEraseBtn.onclick=()=>{ ME.mode='erase'; refreshModeButtons(); };
  document.getElementById('me-node-slope').onclick = meToggleSelectedSlope;
  document.getElementById('me-node-slope-rot-left').onclick = ()=>meRotateSelectedSlope(-15);
  document.getElementById('me-node-slope-rot-right').onclick = ()=>meRotateSelectedSlope(15);
  // Layer applies LIVE to the selected node as you type — no Enter needed, and
  // it only ever touches meActiveNode(), so clicking off never bleeds it onto
  // another node.
  if (nodeSupportLayerSel) nodeSupportLayerSel.oninput = ()=>meSetSelectedSupportLayer(nodeSupportLayerSel.value);
  wallModeSel.onchange=()=>{ ME.wallMode = wallModeSel.value || 'solid'; };
  wallSideSel.onchange=()=>{ ME.wallSide = wallSideSel.value || 'both'; };
  wallForceInp.oninput=()=>{ ME.wallForce = Math.max(20, Math.min(300, parseFloat(wallForceInp.value) || 120)); };
  wallBounceInp.oninput=()=>{ ME.wallBounce = Math.max(0.2, Math.min(2.0, parseFloat(wallBounceInp.value) || 1.0)); };
  obstacleTypeSel.onchange=()=>{ ME.obstacleType = obstacleTypeSel.value || 'wall'; };
  const trackModelSel = document.getElementById('me-track-model');
  if (trackModelSel) {
    trackModelSel.value = ME.trackModel || 'v1';
    trackModelSel.onchange = () => { ME.trackModel = (trackModelSel.value === 'v2') ? 'v2' : 'v1'; meRefreshNodeSettings(); meDraw(); };
  }
  obstacleLayerSel.onchange=()=>{ ME.obstacleLayer = Number.isFinite(+obstacleLayerSel.value) ? Math.round(+obstacleLayerSel.value) : 0; };
  obstacleRotRange.oninput=()=>{ obstacleRotNum.value = obstacleRotRange.value; ME.obstacleRot = parseFloat(obstacleRotRange.value) || 0; };
  obstacleRotNum.oninput=()=>{ obstacleRotRange.value = obstacleRotNum.value; ME.obstacleRot = parseFloat(obstacleRotNum.value) || 0; };
  obstacleScaleRange.oninput=()=>{ obstacleScaleNum.value = obstacleScaleRange.value; ME.obstacleScale = Math.max(0.4, Math.min(2.2, (parseFloat(obstacleScaleRange.value) || 100) / 100)); };
  obstacleScaleNum.oninput=()=>{ obstacleScaleRange.value = obstacleScaleNum.value; ME.obstacleScale = Math.max(0.4, Math.min(2.2, (parseFloat(obstacleScaleNum.value) || 100) / 100)); };
  wallModeSel.value = ME.wallMode || 'solid';
  wallSideSel.value = ME.wallSide || 'both';
  wallForceInp.value = String(ME.wallForce || 120);
  wallBounceInp.value = String(ME.wallBounce || 1);
  obstacleLayerSel.value = String(ME.obstacleLayer || 0);
  obstacleRotRange.value = String(ME.obstacleRot || 0);
  obstacleRotNum.value = String(ME.obstacleRot || 0);
  obstacleScaleRange.value = String(Math.round((ME.obstacleScale || 1) * 100));
  obstacleScaleNum.value = String(Math.round((ME.obstacleScale || 1) * 100));
  refreshModeButtons();

  if (runRegressionBtn) {
    runRegressionBtn.onclick = () => {
      const rep = runLayerSystemRegressionTests();
      const title = rep.failed === 0 ? 'Layer tests passed' : 'Layer tests failed';
      const scannedMaps = Number.isFinite(rep.scannedMaps) ? `\nMaps validated: ${rep.scannedMaps}` : '';
      alert(`${title}: ${rep.passed}/${rep.total}${scannedMaps}\n${rep.failed ? rep.failures.join('\n') : 'No failures.'}`);
      if (rep.failed) console.warn('[LayerRegression] Failures', rep.failures);
      else console.info('[LayerRegression] All checks passed', rep);
    };
  }

  canvas.addEventListener('mousedown',e=>{
    const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
    if(e.button===1){ME.isPanning=true;ME.lastMX=cx;ME.lastMY=cy;e.preventDefault();return;}
    if(e.button===2){
      const hp=meHitTestPowerup(cx,cy);
      if(hp>=0){
        ME.powerups.splice(hp,1);
        meDraw();
        e.preventDefault();return;
      }
      const ho=meHitTestObstacle(cx,cy);
      if(ho>=0){
        ME.obstacles.splice(ho,1);
        meDraw();
        e.preventDefault();return;
      }
      const bhDel = meBranchHitTest(cx,cy);
      if (bhDel) {
        const owner = ME.wpts[bhDel.owner];
        if (owner && Array.isArray(owner.branches) && Array.isArray(owner.branches[bhDel.path])) {
          owner.branches[bhDel.path].splice(bhDel.node, 1);
          if (!owner.branches[bhDel.path].length) owner.branches.splice(bhDel.path, 1);
          if (!owner.branches.length) delete owner.branches;
        }
        if (ME.selectedBranch === bhDel.owner) { ME.selectedBranch = null; ME.selectedBranchPath = 0; ME.selectedBranchNode = -1; }
        meRefreshNodeSettings();
        meDraw();
        e.preventDefault();return;
      }
      const h=meHitTest(cx,cy);
      if(h>=0){
        ME.wpts.splice(h,1);
        if(ME.selectedIdx===h) ME.selectedIdx=-1;
        else if(ME.selectedIdx>h) ME.selectedIdx--;
        meRebuildSpline();
        meRefreshNodeSettings();
        meDraw();
        e.preventDefault();return;
      }
      if (ME.wpts.length >= 2) {
        const segHit = meHitTestSegment(cx, cy, true);
        const bseg = (ME.trackModel === 'v2') ? meBranchSegmentHitTest(cx, cy) : null;
        const mainD2 = (segHit && segHit.d2 <= 22 * 22) ? segHit.d2 : Infinity;
        const forkD2 = (bseg && bseg.d2 <= 22 * 22) ? bseg.d2 : Infinity;
        const side = ME.wallSide || 'both';
        if (bseg && forkD2 < mainD2) {
          ME.wallRegions = ME.wallRegions.filter(w => !(w.branch && w.branch.owner === bseg.owner && w.branch.path === bseg.path && w.seg === bseg.insertAt && (w.side || 'both') === side));
          meDraw();
          e.preventDefault();
          return;
        }
        if (mainD2 < Infinity) {
          ME.wallRegions = ME.wallRegions.filter(w => !(!w.branch && w.seg === segHit.insertAfter && (w.side || 'both') === side));
          meDraw();
          e.preventDefault();
          return;
        }
      }
      e.preventDefault();return;
    }

    if (ME.mode === 'obstacle') {
      const owx = meXtoW(cx), owy = meYtoW(cy);
      const autoLayer = meAutoLayerAt(owx, owy);
      ME.obstacleLayer = autoLayer;
      const layerBox = document.getElementById('me-obstacle-layer');
      if (layerBox) layerBox.value = String(autoLayer);
      const obs = meDefaultObstacle(ME.obstacleType, owx, owy, autoLayer);
      // Auto-orient to the road: blockers turn broadside so they block the lane.
      obs.rot = meAutoObstacleRot(ME.obstacleType, owx, owy);
      const rotBox = document.getElementById('me-obstacle-rot');
      const rotRange = document.getElementById('me-obstacle-rot-range');
      if (rotBox) rotBox.value = String(obs.rot);
      if (rotRange) rotRange.value = String(obs.rot);
      ME.obstacleRot = obs.rot;
      ME.obstacles.push(obs);
      meDraw();
      return;
    }
    if (ME.mode === 'wall') {
      if (ME.wpts.length >= 2) {
        const segHit = meHitTestSegment(cx, cy, true);
        const mainD2 = (segHit && segHit.d2 <= 26 * 26) ? segHit.d2 : Infinity;
        const bseg = (ME.trackModel === 'v2') ? meBranchSegmentHitTest(cx, cy) : null;
        const forkD2 = (bseg && bseg.d2 <= 26 * 26) ? bseg.d2 : Infinity;
        if (bseg && forkD2 < mainD2) {
          meUpsertWallRegion(bseg.insertAt, ME.wallMode, ME.wallSide, ME.wallForce, ME.wallBounce, { owner: bseg.owner, path: bseg.path });
          meDraw();
          return;
        }
        if (mainD2 < Infinity) {
          meUpsertWallRegion(segHit.insertAfter, ME.wallMode, ME.wallSide, ME.wallForce, ME.wallBounce);
          meDraw();
          return;
        }
      }
    }
    if (ME.mode === 'powerup') {
      const pwx = meXtoW(cx), pwy = meYtoW(cy);
      const pAuto = meAutoLayerAt(pwx, pwy);
      ME.obstacleLayer = pAuto;
      const pLayerBox = document.getElementById('me-obstacle-layer');
      if (pLayerBox) pLayerBox.value = String(pAuto);
      ME.powerups.push({ x: pwx, y: pwy, r: 12, active: true, respawn: 0, layer: pAuto });
      meDraw();
      return;
    }
    if (ME.mode === 'erase') {
      const hp=meHitTestPowerup(cx,cy);
      if (hp >= 0) {
        ME.powerups.splice(hp,1);
        meDraw();
        return;
      }
      const ho=meHitTestObstacle(cx,cy);
      if (ho >= 0) {
        ME.obstacles.splice(ho,1);
        meDraw();
      }
      return;
    }

    const bh = meBranchHitTest(cx, cy);
    if (bh) {
      ME.selectedBranch = bh.owner; ME.selectedBranchPath = bh.path; ME.selectedBranchNode = bh.node;
      ME.selectedIdx = -1; ME.dragIdx = -1;
      ME.dragBranch = bh.owner; ME.dragBranchPath = bh.path; ME.dragBranchNode = bh.node;
      meRefreshNodeSettings();
      meDraw();
      return;
    }
    const bseg = (ME.trackModel === 'v2') ? meBranchSegmentHitTest(cx, cy) : null;
    const h=meHitTest(cx,cy);
    if(h>=0){
      ME.selectedBranch=null;
      ME.selectedIdx=h;
      ME.dragIdx=h;
      meRefreshNodeSettings();
    }
    else if (bseg && bseg.d2 <= bseg.halfWScreen * bseg.halfWScreen) {
      const owner = ME.wpts[bseg.owner];
      const path = owner.branches[bseg.path];
      const ref = path[Math.max(0, Math.min(path.length - 1, bseg.insertAt - 1))] || path[0];
      const nn = meDefaultNode(bseg.x, bseg.y);
      nn.type = (ref && ref.type && ref.type !== 'void') ? ref.type : 'road';
      nn.width = (ref && ref.width) ? ref.width : (owner.width || TRACK_W);
      path.splice(bseg.insertAt, 0, nn);
      ME.selectedBranch = bseg.owner; ME.selectedBranchPath = bseg.path; ME.selectedBranchNode = bseg.insertAt; ME.selectedIdx = -1;
      ME.dragBranch = bseg.owner; ME.dragBranchPath = bseg.path; ME.dragBranchNode = bseg.insertAt; ME.dragIdx = -1;
      meRefreshNodeSettings();
      meDraw();
    }
    else{
      ME.selectedBranch=null;
      if (ME.wpts.length >= 2) {
        const segHit = meHitTestSegment(cx, cy, true);
        const appendAtEnd = segHit.insertAfter === (ME.wpts.length - 1);
        const nextIdx = appendAtEnd ? ME.wpts.length : (segHit.insertAfter + 1);
        const prevNode = ME.wpts[segHit.insertAfter];
        const nextNode = ME.wpts[(segHit.insertAfter + 1) % ME.wpts.length];
        const inserted = meDefaultNode(segHit.x, segHit.y);
        inserted.type = prevNode.type || 'road';
        inserted.width = Math.round((((+prevNode.width || TRACK_W) + (+nextNode.width || TRACK_W)) * 0.5) / 2) * 2;
        inserted.checkpoint = false;
        inserted.slope = false;
        inserted.slopeDir = Number.isFinite(prevNode.slopeDir) ? prevNode.slopeDir : 0;
        inserted.supportLayer = Number.isFinite(+prevNode.supportLayer) ? Math.round(+prevNode.supportLayer) : 0;
        ME.wpts.splice(nextIdx, 0, inserted);
        ME.selectedIdx = nextIdx;
      } else {
        ME.wpts.push(meDefaultNode(meXtoW(cx),meYtoW(cy)));
        ME.selectedIdx=ME.wpts.length-1;
      }
      ME.dragIdx=ME.selectedIdx;
      meRebuildSpline();
      meRefreshNodeSettings();
      meDraw();
    }
  });
  canvas.addEventListener('mousemove',e=>{
    const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
    if(ME.isPanning){ME.panX-=(cx-ME.lastMX)/ME.zoom;ME.panY-=(cy-ME.lastMY)/ME.zoom;ME.lastMX=cx;ME.lastMY=cy;meDraw();return;}
    if(ME.dragBranch!=null && ME.dragBranchNode>=0){
      const owner=ME.wpts[ME.dragBranch];
      const path = owner && Array.isArray(owner.branches) ? owner.branches[ME.dragBranchPath] : null;
      if(path && path[ME.dragBranchNode]){
        path[ME.dragBranchNode].x=meXtoW(cx);
        path[ME.dragBranchNode].y=meYtoW(cy);
        meDraw();
      }
      return;
    }
    if(ME.dragIdx>=0){
      const node=ME.wpts[ME.dragIdx];
      node.x=meXtoW(cx); node.y=meYtoW(cy);
      meRebuildSpline();
      meDraw();
    }
  });
  canvas.addEventListener('mouseup',()=>{ME.dragIdx=-1;ME.dragBranch=null;ME.dragBranchPath=0;ME.dragBranchNode=-1;ME.isPanning=false;});
  canvas.addEventListener('mouseleave',()=>{ME.dragIdx=-1;ME.dragBranch=null;ME.dragBranchPath=0;ME.dragBranchNode=-1;ME.isPanning=false;});
  canvas.addEventListener('wheel',e=>{ME.zoom=Math.max(0.04,Math.min(2,ME.zoom*(e.deltaY>0?0.85:1.18)));meDraw();e.preventDefault();},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  meRefreshNodeSettings();
}

function openMapEditor(){
  syncSettingsPlacement(false);
  setBuilderMusic(true);
  document.getElementById('lobby').style.display='none';
  const scr=document.getElementById('screen-map-editor');
  scr.style.display='flex';
  if(!scr.dataset.init){
    scr.dataset.init='1';meInitEditor();
    document.getElementById('me-repo').value=localStorage.getItem('me-repo')||'';
    document.getElementById('me-token').value=localStorage.getItem('me-token')||'';
  } else { meRefreshNodeSettings(); meDraw(); }
  tryRestoreTracksFolder().then(renderEditorTrackLists);
}
document.getElementById('map-editor-btn').onclick=openMapEditor;
document.getElementById('me-back-btn').onclick=()=>{
  syncSettingsPlacement(false);
  setBuilderMusic(false);
  document.getElementById('screen-map-editor').style.display='none';
  document.getElementById('lobby').style.display='flex';
  if (G.isHost && lobbyTracks && lobbyTracks.style.display !== 'none') renderLobbyTrackLibrary();
};
document.getElementById('me-new-btn').onclick=()=>{
  if(ME.wpts.length>0&&!confirm('Discard current map?'))return;
  ME.wpts=[];ME.spline=[];ME.splineW=[];ME.obstacles=[];ME.powerups=[];ME.wallRegions=[];ME.panX=0;ME.panY=0;ME.selectedIdx=-1;
  ME.obstacleRot = 0; ME.obstacleScale = 1;
  document.getElementById('me-map-name').value='My Track';
  meRefreshNodeSettings();
  meDraw();
};
document.getElementById('me-test-btn').onclick=()=>startTrackTest();

// Test Track: drive the current editor map immediately in a self-contained solo
// session (no network room needed). ESC or the results button returns here.
function startTrackTest(){
  if(ME.wpts.length<4){alert('Place at least 4 waypoints first.');return;}
  G.customMap={name:document.getElementById('me-map-name').value||'Test Track',waypoints:[...ME.wpts],obstacles:[...ME.obstacles],powerups:[...ME.powerups],wallRegions:[...ME.wallRegions],trackModel:ME.trackModel||'v1',branches:meCloneBranches(ME.branches)};
  saveMaps();
  G._testMode=true;
  G.isHost=true;
  G.myId='local-test';
  const profile=getLobbyProfileInput();
  const me=makePlayer(G.myId,profile.name,profile.color,0,0,0,G.selectedCarType);
  me.paintTag=profile.paintTag; applyProfileExtras(me, profile); me.clientUid=CLIENT_UID; me.ready=true;
  G.players={}; G.players[G.myId]=me;
  spawnBots(getBotCount()); // AI opponents for the solo test session
  const seed=Date.now()%100000;
  G.track=generateTrackFromWaypoints(G.customMap.waypoints,seed,G.customMap.obstacles||[],G.customMap.powerups||[],G.customMap.wallRegions||[]);
  recordTrackHistory(G.customMap);
  G.totalLaps=Math.max(1,Math.min(20,Math.round((G.customMap.laps)||1)));
  resetPlayersForRace();
  // Remember whether we launched from the CRT popup so we can restore it after.
  G._testFromWindow = !!(window.__crtMapMakerOpen && window.__crtMapMakerOpen());
  if(G._testFromWindow && window.__crtCloseMapMaker) window.__crtCloseMapMaker();
  document.getElementById('screen-map-editor').style.display='none';
  if(window.__crtRaceBoot) window.__crtRaceBoot(seed, startGame); else startGame();
}

// Leave a running/finished track test and reopen the Map Maker with work intact.
function exitTestToEditor(){
  if(!G._testMode)return;
  G._testMode=false;
  clearPostRaceTimer();
  clearUpgradePause();
  if (G._countdownTimer) { clearInterval(G._countdownTimer); G._countdownTimer = null; }
  silenceAllEngines();
  G.raceOver=false; G.raceStarted=false; G.finishOrder=[];
  const results=document.getElementById('results-screen'); if(results)results.style.display='none';
  const up=document.getElementById('upgrade-screen'); if(up)up.style.display='none';
  const pauseOv=document.getElementById('upgrade-pause-overlay'); if(pauseOv)pauseOv.style.display='none';
  document.getElementById('game').style.display='none';
  G.isHost=false; G.myId=null; G.players={};
  if(G._testFromWindow){
    G._testFromWindow=false;
    if(window.__crtShowTerminal) window.__crtShowTerminal();
    if(window.__crtOpenMapMaker) window.__crtOpenMapMaker();
  } else {
    openMapEditor();
  }
}
document.getElementById('me-fetch-btn').onclick=meFetchMapList;

// ---- Local / History track browser (editor sidebar) ----
function meCurrentMapData(){
  return {
    name: (document.getElementById('me-map-name').value || 'My Track').trim(),
    waypoints: ME.wpts, obstacles: ME.obstacles, powerups: ME.powerups, wallRegions: ME.wallRegions,
    trackModel: ME.trackModel || 'v1', branches: meCloneBranches(ME.branches),
    version: 3, created: new Date().toISOString().slice(0,10),
  };
}
function updateFolderStatus(){
  const el=document.getElementById('me-folder-status');
  if(!el) return;
  let warnText = '';
  if(IS_TAURI){
    el.innerHTML='✅ Saves are real <b>.json</b> files in the app <b>Maps</b> folder — History stays cached.';
    el.style.color='#4ade80';
  } else if(_localDirHandle){
    el.innerHTML='✅ Folder: <b>'+(tracksFolderName()||'connected')+'</b> — saves go to Local/ & History/';
    el.style.color='#4ade80';
  } else if(FS_TRACKS_SUPPORTED){
    warnText='Not connected — saving to browser storage. Connect a folder to write real files.';
  } else {
    warnText='This run mode can’t access folders. Use Import / Export, or run from a local server.';
  }
  // Warnings live in the header as a yellow pill; the sidebar line only shows
  // the healthy "connected" states.
  el.style.display = warnText ? 'none' : '';
  const warn = document.getElementById('me-header-warn');
  if (warn) {
    if (warnText) {
      warn.style.display = 'flex';
      warn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2 14.6 13.4H1.4z"/><path d="M8 6.6v3.4M8 12.1v.2"/></svg><span>' + warnText + '</span>';
    } else {
      warn.style.display = 'none';
    }
  }
}
async function renderEditorTrackLists(){
  const localEl=document.getElementById('me-local-list');
  const histEl=document.getElementById('me-history-list');
  if(!localEl||!histEl) return;
  if(IS_TAURI) await _tauriEnsureMaps();
  updateFolderStatus();
  const mkRow=(rec,opts)=>{
    const row=document.createElement('div');row.className='me-track-row';
    const nm=document.createElement('span');nm.className='nm';
    nm.textContent=rec.name;nm.title=`${rec.name} \u2014 ${rec.waypoints.length} nodes \u00b7 ${rec.laps||3} laps`;
    nm.onclick=()=>meLoadMapData(rec);
    row.appendChild(nm);
    const load=document.createElement('button');load.textContent='Load';load.title='Load into editor';
    load.onclick=()=>meLoadMapData(rec);row.appendChild(load);
    if(opts.save){const b=document.createElement('button');b.textContent='Save';b.title='Save to Local';
      b.onclick=async()=>{await saveLocalTrack(rec);renderEditorTrackLists();};row.appendChild(b);}
    const exp=document.createElement('button');exp.textContent='\u2913';exp.title='Export .json';
    exp.onclick=()=>exportTrackRecord(rec);row.appendChild(exp);
    if(opts.del){const d=document.createElement('button');d.textContent='\u2715';d.className='danger';d.title='Delete from Local';
      d.onclick=async()=>{if(confirm(`Delete "${rec.name}" from Local?`)){await deleteLocalTrack(rec);renderEditorTrackLists();}};row.appendChild(d);}
    return row;
  };
  let local, hist;
  if(_localDirHandle){ local=(await _fsReadTracks(_localDirHandle)).sort((a,b)=>a.name.localeCompare(b.name)); }
  else local=getLocalTracks();
  if(_historyDirHandle){ hist=(await _fsReadTracks(_historyDirHandle)).sort((a,b)=>(b._mtime||0)-(a._mtime||0)); }
  else hist=getHistoryTracks();
  localEl.innerHTML='';
  if(!local.length) localEl.innerHTML='<div class="me-track-empty">No saved tracks. Use \uD83D\uDCBE Save to Local.</div>';
  else local.forEach(rec=>localEl.appendChild(mkRow(rec,{del:true})));
  histEl.innerHTML='';
  if(!hist.length) histEl.innerHTML='<div class="me-track-empty">No tracks loaded yet.</div>';
  else hist.forEach(rec=>histEl.appendChild(mkRow(rec,{save:true})));
}
const meConnectBtn=document.getElementById('me-connect-folder-btn');
if(meConnectBtn){
  if(IS_TAURI){ meConnectBtn.textContent='\uD83D\uDCC2 Open maps folder'; meConnectBtn.onclick=()=>openMapsFolder(); }
  else meConnectBtn.onclick=async()=>{ if(await connectTracksFolder()) renderEditorTrackLists(); };
}
document.getElementById('me-save-to-local-btn').onclick=async()=>{
  if(ME.wpts.length<4){alert('Place at least 4 waypoints first.');return;}
  await saveLocalTrack(meCurrentMapData());
  renderEditorTrackLists();
  const msg=document.getElementById('status-msg');
  if(msg){msg.textContent='\u2713 Saved to Local';msg.style.color='#4ade80';setTimeout(()=>{msg.textContent='';msg.style.color='';},3000);}
};
document.getElementById('me-import-track-btn').onclick=()=>document.getElementById('me-import-input').click();
document.getElementById('me-import-input').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=async ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(!data||!Array.isArray(data.waypoints)||data.waypoints.length<2) throw new Error('missing waypoints');
      await saveLocalTrack(data);renderEditorTrackLists();
    }catch(err){alert('Invalid track JSON: '+err.message);}
  };
  rd.readAsText(f);e.target.value='';
};
async function meFetchMapList(){
  const repo=document.getElementById('me-repo').value.trim();
  if(!repo){alert('Enter a repo first.');return;}
  localStorage.setItem('me-repo',repo);
  const token=document.getElementById('me-token').value.trim();
  const hdrs=token?{Authorization:`token ${token}`}:{};
  const listEl=document.getElementById('me-map-list');
  listEl.innerHTML='<div style="color:var(--muted);padding:8px 10px;font-size:.8rem">Loading\u2026</div>';
  try{
    const res=await fetch(`https://api.github.com/repos/${repo}/contents/maps`,{headers:hdrs});
    if(!res.ok){listEl.innerHTML=`<div style="color:#f87171;padding:8px 10px;font-size:.8rem">Error ${res.status}${res.status===404?' \u2014 create a maps/ folder in the repo':''}</div>`;return;}
    const files=(await res.json()).filter(f=>f.name.endsWith('.json'));
    if(!files.length){listEl.innerHTML='<div style="color:var(--muted);padding:8px 10px;font-size:.8rem">No .json files in maps/</div>';return;}
    listEl.innerHTML='';
    files.forEach(f=>{
      const btn=document.createElement('button');
      btn.className='me-map-item';btn.textContent=f.name.replace('.json','');btn.title=f.name;
      btn.onclick=()=>meLoadFromGitHub(f.download_url);listEl.appendChild(btn);
    });
  }catch(e){listEl.innerHTML=`<div style="color:#f87171;padding:8px 10px;font-size:.8rem">${e.message}</div>`;}
}
async function meLoadFromGitHub(url){
  try{const r=await fetch(url);if(!r.ok)throw new Error('HTTP '+r.status);meLoadMapData(await r.json());}
  catch(e){alert('Load failed: '+e.message);}
}
function meLoadMapData(data){
  if(!data.waypoints||!Array.isArray(data.waypoints)){alert('Invalid map: missing waypoints');return;}
  ME.wpts=data.waypoints.map(meNormalizeEditorNode);
  meInjectLegacyBridgeSlopes(ME.wpts);
  ME.wpts.forEach(p => {
    if (p.type === 'bridge') p.supportLayer = Number.isFinite(+p.supportLayer) ? Math.max(Math.round(+p.supportLayer), 1) : 1;
    if (p.type === 'bridge3') p.supportLayer = Number.isFinite(+p.supportLayer) ? Math.max(Math.round(+p.supportLayer), 2) : 2;
    if (p.type === 'bridge' || p.type === 'bridge3') p.type = 'road';
  });
  ME.obstacles = Array.isArray(data.obstacles)
    ? data.obstacles.map(o => ({
      x:+o.x,
      y:+o.y,
      r:Math.max(8, Math.min(64, +o.r || 14)),
      type:o.type||'wall',
      active:true,
      respawn:0,
      moveAmp:Math.max(8, Math.min(120, +o.moveAmp || 34)),
      moveSpeed:Math.max(0.1, Math.min(4, +o.moveSpeed || 1.1)),
      flowDir:+o.flowDir || 0,
      phase:+o.phase || 0,
      layer:Number.isFinite(+o.layer) ? Math.round(+o.layer) : 0,
      rot:Math.max(-180, Math.min(180, +o.rot || 0)),
      scale:Math.max(0.4, Math.min(2.2, +o.scale || 1)),
    }))
    : [];
  ME.powerups = Array.isArray(data.powerups)
    ? data.powerups.map(p => ({
      x:+p.x,
      y:+p.y,
      r:Math.max(8, Math.min(28, +p.r || 12)),
      active:true,
      respawn:0,
      layer:Number.isFinite(+p.layer) ? Math.round(+p.layer) : 0,
    }))
    : [];
  ME.wallRegions = Array.isArray(data.wallRegions)
    ? data.wallRegions.map(w => {
      const rec = {
        seg: Math.max(0, Math.round(+w.seg || 0)),
        mode: (w.mode === 'open' || w.mode === 'bouncy') ? w.mode : 'solid',
        side: (w.side === 'left' || w.side === 'right') ? w.side : 'both',
        force: Math.max(20, Math.min(300, +w.force || 120)),
        bounce: Math.max(0.2, Math.min(2.0, +w.bounce || 1)),
      };
      if (w.branch && Number.isFinite(+w.branch.owner)) {
        rec.branch = { owner: Math.round(+w.branch.owner), path: Math.round(+w.branch.path || 0) };
      }
      return rec;
    })
    : [];
  ME.trackModel = (data.trackModel === 'v2') ? 'v2' : 'v1';
  ME.branches = meNormalizeBranches(data.branches);
  ME.selectedBranch = null; ME.selectedBranchPath = 0; ME.selectedBranchNode = -1;
  const trackModelSel = document.getElementById('me-track-model');
  if (trackModelSel) trackModelSel.value = ME.trackModel;
  ME.selectedIdx = ME.wpts.length ? 0 : -1;
  document.getElementById('me-map-name').value=data.name||'Unnamed';
  if(ME.wpts.length){ME.panX=ME.wpts.reduce((s,p)=>s+p.x,0)/ME.wpts.length;ME.panY=ME.wpts.reduce((s,p)=>s+p.y,0)/ME.wpts.length;}
  meRebuildSpline();meRefreshNodeSettings();meDraw();
}

// Build geometry for an OPEN path (a fork/branch). `seq` is the ordered node list
// [ownerNode, ...branchNodes, nextNode] (endpoints are the shared main junctions).
// Returns branch-local spline/widths/surface plus bridges, slopes (with precomputed
// floorUp/floorDown), a void-index set and a floorAt(idx) accessor — the same
// elevation model the main loop uses, so forks are first-class roads with slopes.
function buildPathGeom(seq) {
  const m = seq.length;
  const spline = [], widths = [], surface = [];
  for (let k = 0; k < m - 1; k++) {
    const c0 = seq[Math.max(0, k - 1)], c1 = seq[k], c2 = seq[k + 1], c3 = seq[Math.min(m - 1, k + 2)];
    const w1 = Math.max(40, Math.min(180, +c1.width || TRACK_W));
    const w2 = Math.max(40, Math.min(180, +c2.width || TRACK_W));
    const sType = c1.type === 'ice' ? 'ice' : (c1.type === 'river' ? 'river' : 'road');
    const steps = (k === m - 2) ? 16 : 15;
    for (let s = 0; s <= steps; s++) {
      const t = s / 16;
      spline.push(catmullRom(c0, c1, c2, c3, t));
      widths.push(lerp(w1, w2, t));
      surface.push(sType);
    }
  }
  const sn = spline.length;
  // Support spans from runs of nodes sharing a non-zero support layer (no wrap: open path).
  const bridges = [];
  let runStart = -1, runLayer = 0;
  for (let k = 0; k < m; k++) {
    const lv = Number.isFinite(+seq[k].supportLayer) ? Math.round(+seq[k].supportLayer) : 0;
    if (lv > 0) {
      if (runStart < 0) { runStart = k; runLayer = lv; }
      else if (lv !== runLayer) {
        bridges.push({ startIdx: runStart * 16, endIdx: Math.min((k - 1) * 16 + 15, sn - 1), floor: runLayer, manual: false, inferredFromSupportLayer: true });
        runStart = k; runLayer = lv;
      }
    } else if (runStart >= 0) {
      bridges.push({ startIdx: runStart * 16, endIdx: Math.min((k - 1) * 16 + 15, sn - 1), floor: runLayer, manual: false, inferredFromSupportLayer: true });
      runStart = -1; runLayer = 0;
    }
  }
  if (runStart >= 0) bridges.push({ startIdx: runStart * 16, endIdx: Math.min((m - 1) * 16 + 15, sn - 1), floor: runLayer, manual: false, inferredFromSupportLayer: true });
  const floorAt = (ri) => { let f = 0; for (const b of bridges) { if (ri >= b.startIdx && ri <= b.endIdx) f = Math.max(f, b.floor || 1); } return f; };
  // Authored slopes on the fork; up-direction points uphill; floors precomputed.
  const slopes = [];
  for (let k = 0; k < m; k++) {
    if (!seq[k].slope) continue;
    const ri = Math.min(k * 16, sn - 1);
    const p = spline[ri];
    const pPrev = spline[Math.max(0, ri - 1)];
    const pNext = spline[Math.min(sn - 1, ri + 1)];
    let tx = pNext.x - pPrev.x, ty = pNext.y - pPrev.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const fA = floorAt(Math.max(0, ri - 16));
    const fB = floorAt(Math.min(sn - 1, ri + 16));
    let upTx, upTy;
    if (fA !== fB) { const sign = fB > fA ? 1 : -1; upTx = tx * sign; upTy = ty * sign; }
    else if (Number.isFinite(+seq[k].slopeDir)) { upTx = Math.cos(+seq[k].slopeDir); upTy = Math.sin(+seq[k].slopeDir); }
    else { upTx = tx; upTy = ty; }
    const ul = Math.hypot(upTx, upTy) || 1; upTx /= ul; upTy /= ul;
    const probe = spline[Math.min(sn - 1, ri + 4)];
    const probeUp = (probe.x - p.x) * upTx + (probe.y - p.y) * upTy;
    const floorUp = probeUp > 0 ? fB : fA;
    const floorDown = probeUp > 0 ? fA : fB;
    slopes.push({ idx: ri, x: p.x, y: p.y, upTx, upTy, halfW: (widths[ri] || TRACK_W) * 1.1, floorUp, floorDown });
  }
  const voidSet = new Set();
  for (let k = 0; k < m; k++) {
    if ((seq[k].type || 'road') === 'void') { for (let s = 0; s < 16; s++) { const ii = k * 16 + s; if (ii < sn) voidSet.add(ii); } }
  }
  return { spline, widths, surface, bridges, slopes, voidSet, floorAt };
}

// Build a playable track from manually-placed waypoints.
// Waypoints with type 'void' create no-road/fall zones.
// Waypoints with type 'ice'/'river' paint continuous track surface effects.
// Elevated support spans are authored via waypoint supportLayer values.
function generateTrackFromWaypoints(waypoints, obsSeed, manualObstacles, manualPowerups, manualWallRegions) {
  const rng=mulberry32(obsSeed||42);
  const pts=(Array.isArray(waypoints) ? waypoints : []).map(p => ({ ...p }));
  const N=pts.length;
  // Migrate legacy single `branch` to the two-fork `branches` model.
  pts.forEach(p => { if (p && Array.isArray(p.branch) && !Array.isArray(p.branches)) { p.branches = [p.branch]; delete p.branch; } });
  const hadLegacyBridgeTypes = pts.some(p => p && (p.type === 'bridge' || p.type === 'bridge3'));
  if (!pts.some(p => p && p.slope)) meInjectLegacyBridgeSlopes(pts);
  pts.forEach(p => {
    if (!p) return;
    if (!Number.isFinite(+p.supportLayer)) p.supportLayer = 0;
    p.supportLayer = Math.round(+p.supportLayer || 0);
    if (p.type === 'bridge') p.supportLayer = Math.max(p.supportLayer, 1);
    if (p.type === 'bridge3') p.supportLayer = Math.max(p.supportLayer, 2);
    if (p.type === 'bridge' || p.type === 'bridge3') p.type = 'road';
  });
  const spline=[], splineWidth=[], splineSurface=[];
  for(let i=0;i<N;i++){
    const p0=pts[(i-1+N)%N],p1=pts[i],p2=pts[(i+1)%N],p3=pts[(i+2)%N];
    const sType = p1.type === 'ice' ? 'ice' : (p1.type === 'river' ? 'river' : 'road');
    const w1=Math.max(40,Math.min(180,+p1.width||TRACK_W));
    const w2=Math.max(40,Math.min(180,+p2.width||TRACK_W));
    const segMax = (i === N - 1) ? 16 : 15;
    for(let s=0;s<=segMax;s++) {
      const t=s/16;
      spline.push(catmullRom(p0,p1,p2,p3,t));
      splineWidth.push(lerp(w1,w2,t));
      splineSurface.push(sType);
    }
  }

  // Void zone centres (one per void waypoint)
  const voidZones=pts.filter(p=>p.type==='void').map(p=>({x:p.x,y:p.y,r:(+p.width||TRACK_W)*1.6}));

  // Build support spans from runs of nodes that share the same non-zero support layer.
  const authoredSlopeNodes = [];
  for (let i = 0; i < N; i++) {
    if (pts[i] && pts[i].slope) authoredSlopeNodes.push(i);
  }
  const bridges = [];
  if (N > 0) {
    let runStart = -1;
    let runLayer = 0;
    for (let i = 0; i < N; i++) {
      const lv = Number.isFinite(+pts[i].supportLayer) ? Math.round(+pts[i].supportLayer) : 0;
      if (lv > 0) {
        if (runStart < 0) {
          runStart = i;
          runLayer = lv;
        } else if (lv !== runLayer) {
          const startIdx = (runStart * 16) % spline.length;
          const endIdx = Math.min((i - 1) * 16 + 15, spline.length - 1);
          bridges.push({ startIdx, endIdx, floor: runLayer, manual: false, inferredFromSupportLayer: true });
          runStart = i;
          runLayer = lv;
        }
      } else if (runStart >= 0) {
        const startIdx = (runStart * 16) % spline.length;
        const endIdx = Math.min((i - 1) * 16 + 15, spline.length - 1);
        bridges.push({ startIdx, endIdx, floor: runLayer, manual: false, inferredFromSupportLayer: true });
        runStart = -1;
        runLayer = 0;
      }
    }
    if (runStart >= 0) {
      const startIdx = (runStart * 16) % spline.length;
      const endIdx = Math.min((N - 1) * 16 + 15, spline.length - 1);
      bridges.push({ startIdx, endIdx, floor: runLayer, manual: false, inferredFromSupportLayer: true });
    }
  }

  // Ordered checkpoints: one gate per waypoint flagged as checkpoint.
  const checkpoints=[];
  const slopes=[];
  const sn = spline.length;
  const floorAtIdxLocal = (ri) => {
    let f = 0;
    for (const b of bridges) {
      if (idxInBridge(ri, b, sn)) f = Math.max(f, b.floor || 1);
    }
    return f;
  };
  for (let i = 0; i < N; i++) {
    if (!pts[i].checkpoint) continue;
    const ri = (i * 16) % sn;
    const p = spline[ri];
    const pPrev = spline[(ri - 1 + sn) % sn];
    const pNext = spline[(ri + 1) % sn];
    let tx = pNext.x - pPrev.x, ty = pNext.y - pPrev.y;
    const tl = Math.sqrt(tx*tx + ty*ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    checkpoints.push({
      idx: ri,
      x: p.x, y: p.y,
      tx, ty, nx, ny,
      halfW: (splineWidth[ri] || TRACK_W) * 1.05,
      layer: floorAtIdxLocal(ri),
    });
  }

  // Authored slope thresholds: the up direction is derived automatically from the
  // track floors on each side (points toward the higher layer); slopeDir is only a
  // fallback when both sides sit on the same floor.
  const authoredSlopeCount = authoredSlopeNodes.length;
  for (let i = 0; i < N; i++) {
    if (!pts[i].slope) continue;
    const ri = (i * 16) % sn;
    const p = spline[ri];
    // Track tangent at this node.
    const pPrev = spline[(ri - 1 + sn) % sn];
    const pNext = spline[(ri + 1) % sn];
    let tx = pNext.x - pPrev.x, ty = pNext.y - pPrev.y;
    const tlen = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tlen; ty /= tlen;
    // Floors one node ahead/behind: the slope automatically points uphill.
    const fwdFloor = floorAtIdxLocal((ri + 16) % sn);
    const bwdFloor = floorAtIdxLocal((ri - 16 + sn) % sn);
    let upTx, upTy;
    if (fwdFloor !== bwdFloor) {
      const sign = fwdFloor > bwdFloor ? 1 : -1;
      upTx = tx * sign;
      upTy = ty * sign;
    } else if (Number.isFinite(+pts[i].slopeDir)) {
      // Same floor on both sides (ambiguous): use the authored direction.
      upTx = Math.cos(+pts[i].slopeDir);
      upTy = Math.sin(+pts[i].slopeDir);
    } else {
      upTx = tx; upTy = ty;
    }
    const ulen = Math.sqrt(upTx * upTx + upTy * upTy) || 1;
    upTx /= ulen;
    upTy /= ulen;
    const probe = spline[(ri + 4) % sn];
    const probeUp = (probe.x - p.x) * upTx + (probe.y - p.y) * upTy;
    const floorUp = probeUp > 0 ? fwdFloor : bwdFloor;
    const floorDown = probeUp > 0 ? bwdFloor : fwdFloor;
    slopes.push({
      idx: ri,
      x: p.x,
      y: p.y,
      upTx,
      upTy,
      halfW: (splineWidth[ri] || TRACK_W) * 1.1,
      key: `slope:${i}`,
      nodeIndex: i,
      floorUp,
      floorDown,
    });
  }

  // Legacy fallback: if still no authored slopes but support spans exist, derive thresholds from span endpoints.
  if (authoredSlopeCount === 0 && bridges.length) {
    bridges.forEach((b, bi) => {
      [
        { idx: b.startIdx, sign: +1, tag: 'start' },
        { idx: b.endIdx, sign: -1, tag: 'end' },
      ].forEach((ep) => {
        const p = spline[ep.idx];
        const pPrev = spline[(ep.idx - 1 + sn) % sn];
        const pNext = spline[(ep.idx + 1) % sn];
        let tx = pNext.x - pPrev.x, ty = pNext.y - pPrev.y;
        const tl = Math.sqrt(tx * tx + ty * ty) || 1;
        tx = (tx / tl) * ep.sign;
        ty = (ty / tl) * ep.sign;
        slopes.push({
          idx: ep.idx,
          x: p.x,
          y: p.y,
          upTx: tx,
          upTy: ty,
          halfW: (splineWidth[ep.idx] || TRACK_W) * 1.1,
          key: `legacy:${bi}:${ep.tag}`,
          nodeIndex: -1,
        });
      });
    });
  }

  // Build set of void spline indices for obstacle/item exclusion
  const voidSplineIdx=new Set();
  for(let i=0;i<N;i++){
    if((pts[i].type||'road')==='void'){
      for(let s=0;s<16;s++) voidSplineIdx.add(i*16+s);
    }
  }

  const obstacles=[],items=[];
  // Custom maps should only use explicitly placed obstacles/items.
  if (Array.isArray(manualObstacles) && manualObstacles.length > 0) {
    manualObstacles.forEach(o => {
      obstacles.push({
        x:+o.x,
        y:+o.y,
        r:Math.max(8, Math.min(64, +o.r || 14)),
        type:o.type||'wall',
        active:true,
        respawn:0,
        moveAmp:Math.max(8, Math.min(120, +o.moveAmp || 34)),
        moveSpeed:Math.max(0.1, Math.min(4, +o.moveSpeed || 1.1)),
        flowDir:+o.flowDir || 0,
        phase:+o.phase || rng() * Math.PI * 2,
        layer:Number.isFinite(+o.layer) ? Math.round(+o.layer) : 0,
        rot:Math.max(-180, Math.min(180, +o.rot || 0)),
        scale:Math.max(0.4, Math.min(2.2, +o.scale || 1)),
      });
    });
  }
  if (Array.isArray(manualPowerups) && manualPowerups.length > 0) {
    manualPowerups.forEach(p => {
      items.push({
        x:+p.x,
        y:+p.y,
        r:Math.max(8, Math.min(28, +p.r || 12)),
        active:true,
        respawn:0,
        layer:Number.isFinite(+p.layer) ? Math.round(+p.layer) : 0,
      });
    });
  }
  const wallRegions = [];
  const forkWallSpecs = []; // fork walls resolved to abs drive indices during fork build
  if (Array.isArray(manualWallRegions) && manualWallRegions.length) {
    manualWallRegions.forEach(w => {
      const mode = (w.mode === 'open' || w.mode === 'bouncy') ? w.mode : 'solid';
      const side = (w.side === 'left' || w.side === 'right') ? w.side : 'both';
      const force = Math.max(20, Math.min(300, +w.force || 120));
      const bounce = Math.max(0.2, Math.min(2.0, +w.bounce || 1));
      if (w.branch && Number.isFinite(+w.branch.owner)) {
        forkWallSpecs.push({
          owner: Math.round(+w.branch.owner),
          path: Math.round(+w.branch.path || 0),
          seg: Math.max(0, Math.round(+w.seg || 0)),
          mode, side, force, bounce,
        });
        return;
      }
      const seg = Math.max(0, Math.min(N - 1, Math.round(+w.seg || 0)));
      const startIdx = seg * 16;
      const endIdx = Math.min(startIdx + 15, spline.length - 1);
      wallRegions.push({ startIdx, endIdx, mode, side, force, bounce });
    });
  }
  const forkWallRegions = []; // { driveStart, driveEnd, mode, side, force, bounce, owner, path }

  const splineVoid = Array.from({length: spline.length}, (_, i) => voidSplineIdx.has(i));

  // ── Unified drive geometry ────────────────────────────────────────────────
  // The main `spline` above stays intact for lap progress / checkpoints. For the
  // actual DRIVABLE surface we build a combined geometry: the main loop (minus any
  // hidden "spleen" segments where a node forks) PLUS every fork path. Forks are
  // first-class roads carrying their own floors/slopes. For a branch-free map this
  // is byte-identical to the main closed loop, so classic maps are unaffected.
  const driveSpline = [], driveWidth = [], driveSurface = [], driveVoid = [], driveFloor = [], driveMainIdx = [];
  const driveSegs = [];
  for (let i = 0; i < spline.length; i++) {
    driveSpline.push(spline[i]);
    driveWidth.push(splineWidth[i]);
    driveSurface.push(splineSurface[i]);
    driveVoid.push(!!splineVoid[i]);
    driveFloor.push(floorAtIdxLocal(i));
    driveMainIdx.push(i);
  }
  // Hidden middle: when node i forks, drop the straight main segment i -> i+1 from
  // the drivable surface (players must take a fork). Junction samples stay so the
  // forks connect. Main spline itself is untouched (progress still advances there).
  const hiddenSeg = new Array(spline.length).fill(false);
  const splineHidden = new Array(spline.length).fill(false);
  for (let i = 0; i < N; i++) {
    const brs = pts[i] && Array.isArray(pts[i].branches) ? pts[i].branches.filter(p => Array.isArray(p) && p.length) : null;
    if (!brs || !brs.length) continue;
    const a = (i * 16) % spline.length;
    const b = ((i + 1) * 16) % spline.length;
    let ii = a;
    while (true) { hiddenSeg[ii] = true; ii = (ii + 1) % spline.length; if (ii === b) break; }
    // Blank the interior samples for rendering (keep the two junctions visible).
    let jj = (a + 1) % spline.length;
    while (jj !== b) { splineHidden[jj] = true; jj = (jj + 1) % spline.length; }
  }
  for (let i = 0; i < spline.length; i++) {
    if (hiddenSeg[i]) continue;
    driveSegs.push({ i, j: (i + 1) % spline.length });
  }

  // V2 forks: each node's `branches` is an array of paths (each an ordered node list).
  // A split creates exactly two (left + right); more are possible via recursion later.
  const branchSplines = [];
  for (let i = 0; i < N; i++) {
    const brs = pts[i] && Array.isArray(pts[i].branches) ? pts[i].branches : null;
    if (!brs || !brs.length) continue;
    brs.forEach((path, pi) => {
      if (!Array.isArray(path) || !path.length) return;
      const seq = [pts[i]].concat(path, [pts[(i + 1) % N]]);
      if (seq.length < 2) return;
      const g = buildPathGeom(seq);
      const base = driveSpline.length;
      for (let k = 0; k < g.spline.length; k++) {
        driveSpline.push(g.spline[k]);
        driveWidth.push(g.widths[k]);
        driveSurface.push(g.surface[k]);
        driveVoid.push(g.voidSet.has(k));
        driveFloor.push(g.floorAt(k));
        driveMainIdx.push(-1);
      }
      for (let k = 0; k < g.spline.length - 1; k++) driveSegs.push({ i: base + k, j: base + k + 1 });
      // Resolve any painted walls authored on this fork into absolute drive indices.
      const forkLen = g.spline.length;
      for (const fw of forkWallSpecs) {
        if (fw.owner !== i || fw.path !== pi) continue;
        const ds = base + fw.seg * 16;
        if (ds >= base + forkLen) continue;
        const de = Math.min(base + fw.seg * 16 + 15, base + forkLen - 1);
        forkWallRegions.push({ driveStart: ds, driveEnd: de, mode: fw.mode, side: fw.side, force: fw.force, bounce: fw.bounce, owner: i, path: pi });
      }
      g.slopes.forEach((s, si) => { slopes.push(Object.assign({}, s, { key: `branch:${i}:${pi}:${si}`, nodeIndex: -1, branch: true })); });
      branchSplines.push({ spline: g.spline, widths: g.widths, surface: g.surface, bridges: g.bridges, slopes: g.slopes, fromIdx: (i * 16) % spline.length, owner: i, pathIndex: pi, base, count: g.spline.length });
    });
  }

  return {spline,splineWidth,splineSurface,obstacles,items,oilSlicks:[],bridges,voidZones,splineVoid,splineHidden,checkpoints,slopes,wallRegions,forkWallRegions,branchSplines,driveSpline,driveWidth,driveSurface,driveVoid,driveFloor,driveMainIdx,driveSegs,numLoops:1,legacySlopeConversionApplied:hadLegacyBridgeTypes};
}

function runLayerSystemRegressionTests() {
  const failures = [];
  let total = 0;
  let passed = 0;
  let scannedMaps = 0;

  function ok(cond, msg) {
    total++;
    if (cond) passed++;
    else failures.push(msg);
  }

  const baseWpts = [
    { x: -240, y: -80, type: 'road', width: 80, checkpoint: false },
    { x: -80, y: -180, type: 'bridge', width: 80, checkpoint: false },
    { x: 120, y: -140, type: 'bridge', width: 80, checkpoint: false },
    { x: 220, y: 30, type: 'road', width: 80, checkpoint: false },
    { x: 80, y: 180, type: 'road', width: 80, checkpoint: false },
    { x: -160, y: 120, type: 'road', width: 80, checkpoint: false },
  ];

  // 1) Legacy bridge conversion should produce slopes when none authored.
  {
    const track = generateTrackFromWaypoints(baseWpts, 12345, [], [], []);
    ok(Array.isArray(track.slopes) && track.slopes.length >= 2, 'Legacy conversion did not create enough slope thresholds.');
    ok(!!track.legacySlopeConversionApplied, 'legacySlopeConversionApplied should be true when no authored slopes exist.');
  }

  // 2) Authored slope should suppress legacy conversion flag.
  {
    const authored = baseWpts.map((p, i) => ({ ...p, slope: i === 0, slopeDir: 0 }));
    const track = generateTrackFromWaypoints(authored, 12345, [], [], []);
    ok(Array.isArray(track.slopes) && track.slopes.length >= 1, 'Authored slope did not produce slope thresholds.');
    ok(!track.legacySlopeConversionApplied, 'legacySlopeConversionApplied should be false with authored slopes present.');
  }

  // 2b) supportLayer-authored spans should create elevated support independent of slopes.
  {
    const authored = baseWpts.map((p, i) => ({ ...p, type: 'road', supportLayer: (i >= 1 && i <= 2) ? 1 : 0, slope: i === 1 || i === 2, slopeDir: 0 }));
    const track = generateTrackFromWaypoints(authored, 31415, [], [], []);
    ok(Array.isArray(track.bridges) && track.bridges.length >= 1, 'supportLayer authoring should infer at least one elevated support span.');
    const b = (track.bridges && track.bridges[0]) || null;
    ok(!!(b && b.inferredFromSupportLayer), 'Inferred support span should be tagged inferredFromSupportLayer.');
  }

  // 3) Wall region conversion should map segment to spline index range and preserve mode/side.
  {
    const wr = [{ seg: 1, mode: 'open', side: 'left', force: 150, bounce: 1.25 }];
    const track = generateTrackFromWaypoints(baseWpts, 7, [], [], wr);
    ok(Array.isArray(track.wallRegions) && track.wallRegions.length === 1, 'Wall region conversion count mismatch.');
    const w = track.wallRegions[0] || {};
    ok(w.startIdx === 16, 'Wall region startIdx should map seg*16.');
    ok(w.endIdx === 31, 'Wall region endIdx should map seg*16+15.');
    ok(w.mode === 'open' && w.side === 'left', 'Wall region mode/side were not preserved.');
  }

  // 4) Legacy injection helper should mark slope endpoints for bridge runs.
  {
    const pts = baseWpts.map(p => ({ ...p }));
    meInjectLegacyBridgeSlopes(pts);
    const slopeCount = pts.reduce((s, p) => s + (p.slope ? 1 : 0), 0);
    ok(slopeCount >= 2, 'Legacy bridge slope injector did not mark enough slope nodes.');
  }

  // 5) Validate all currently available uploaded/queued maps for conversion invariants.
  {
    const candidates = [];
    if (G && G.customMap && Array.isArray(G.customMap.waypoints)) candidates.push({ src: 'custom', map: G.customMap });
    if (G && Array.isArray(G.mapQueue)) {
      G.mapQueue.forEach((q, i) => {
        if (q && q.map && Array.isArray(q.map.waypoints)) candidates.push({ src: `queue:${i}`, map: q.map });
      });
    }
    if (G && Array.isArray(G.pendingMaps)) {
      G.pendingMaps.forEach((q, i) => {
        if (q && q.map && Array.isArray(q.map.waypoints)) candidates.push({ src: `pending:${i}`, map: q.map });
      });
    }

    candidates.forEach((entry) => {
      scannedMaps++;
      const m = entry.map;
      try {
        const track = generateTrackFromWaypoints(
          m.waypoints,
          99173,
          m.obstacles || [],
          m.powerups || [],
          m.wallRegions || []
        );
        ok(Array.isArray(track.spline) && track.spline.length >= m.waypoints.length * 8, `[${entry.src}] spline generation too short.`);
        ok(Array.isArray(track.splineWidth) && track.splineWidth.length === track.spline.length, `[${entry.src}] splineWidth length mismatch.`);
        ok(Array.isArray(track.splineSurface) && track.splineSurface.length === track.spline.length, `[${entry.src}] splineSurface length mismatch.`);
        ok(Array.isArray(track.slopes), `[${entry.src}] slopes array missing.`);
        ok(Array.isArray(track.wallRegions), `[${entry.src}] wallRegions array missing.`);

        const badSlope = (track.slopes || []).find(s => !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.halfW) || s.halfW <= 0);
        ok(!badSlope, `[${entry.src}] invalid slope threshold payload.`);

        const badWall = (track.wallRegions || []).find(w =>
          !Number.isFinite(w.startIdx) || !Number.isFinite(w.endIdx) || w.startIdx < 0 || w.endIdx < 0 ||
          w.startIdx >= track.spline.length || w.endIdx >= track.spline.length
        );
        ok(!badWall, `[${entry.src}] wall region index out of bounds.`);
      } catch (err) {
        ok(false, `[${entry.src}] threw during conversion: ${err && err.message ? err.message : String(err)}`);
      }
    });

    ok(scannedMaps >= 0, 'Map scan bookkeeping failed.');
  }

  return { total, passed, failed: failures.length, scannedMaps, failures };
}

// Mobile touch controls
(function addTouchControls(){
  const wrap=document.getElementById('canvas-wrap');
  const tc=document.createElement('div');
  touchControlsRoot = tc;
  tc.id = 'touch-controls-root';
  tc.style.cssText='position:absolute;bottom:60px;left:0;right:0;display:flex;justify-content:space-between;padding:0 20px;pointer-events:none;z-index:10';
  tc.innerHTML=`
    <div style="display:flex;gap:8px;pointer-events:all">
      <button id="tc-left" style="width:64px;height:64px;border-radius:50%;background:rgba(124,58,237,0.3);border:2px solid rgba(124,58,237,0.5);color:#fff;font-size:1.4rem;cursor:pointer;user-select:none">◀</button>
      <button id="tc-right" style="width:64px;height:64px;border-radius:50%;background:rgba(124,58,237,0.3);border:2px solid rgba(124,58,237,0.5);color:#fff;font-size:1.4rem;cursor:pointer;user-select:none">▶</button>
    </div>
    <div style="display:flex;gap:8px;pointer-events:all">
      <button id="tc-item" style="width:64px;height:64px;border-radius:50%;background:rgba(251,191,36,0.3);border:2px solid rgba(251,191,36,0.5);color:#fff;font-size:1.4rem;cursor:pointer;user-select:none">⚡</button>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="tc-accel" style="width:64px;height:64px;border-radius:50%;background:rgba(34,197,94,0.3);border:2px solid rgba(34,197,94,0.5);color:#fff;font-size:1.4rem;cursor:pointer;user-select:none">▲</button>
        <button id="tc-brake" style="width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,0.3);border:2px solid rgba(239,68,68,0.5);color:#fff;font-size:1.4rem;cursor:pointer;user-select:none">▼</button>
      </div>
    </div>`;
  wrap.appendChild(tc);
  function setKey(code,val){G.keys[code]=val;}
  const bind=(id,key)=>{
    const el=document.getElementById(id);
    el.addEventListener('touchstart',e=>{e.preventDefault();setKey(key,true);},{passive:false});
    el.addEventListener('touchend',e=>{e.preventDefault();setKey(key,false);},{passive:false});
    el.addEventListener('mousedown',()=>setKey(key,true));
    el.addEventListener('mouseup',()=>setKey(key,false));
  };
  bind('tc-left','KeyA');bind('tc-right','KeyD');bind('tc-accel','KeyW');bind('tc-brake','KeyS');
  document.getElementById('tc-item').addEventListener('touchstart',e=>{e.preventDefault();itemButtonDown();},{passive:false});
  document.getElementById('tc-item').addEventListener('touchend',e=>{e.preventDefault();itemButtonUp();},{passive:false});
  document.getElementById('tc-item').addEventListener('mousedown',()=>itemButtonDown());
  document.getElementById('tc-item').addEventListener('mouseup',()=>itemButtonUp());
  applyAudioSettings();
})();
