// ============================================================
// UNIQUE USERNAMES — the PeerJS broker doubles as the name registry.
// Claiming a name = holding the peer id `rr-user-<name>`; if someone
// already holds it, the broker rejects it → "username already taken".
// Friends can then be requested by name instead of the long friend ID.
// (Claims are held while you're online — same model as the room codes.)
// ============================================================
let namePeer = null;
let CLAIMED_NAME = '';
try { CLAIMED_NAME = localStorage.getItem('rr-claimed-name') || ''; } catch (_) {}

function sanitizeUsername(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
}
function usernamePeerId(u) { return 'rr-user-' + u; }

function claimUsername(name, cb) {
  const u = sanitizeUsername(name);
  if (u.length < 3) { if (cb) cb(false, 'username needs 3+ letters/numbers'); return; }
  if (namePeer && CLAIMED_NAME === u && !namePeer.destroyed) { if (cb) cb(true, u); return; }
  try { if (namePeer) namePeer.destroy(); } catch (_) {}
  namePeer = null;
  let p;
  try { p = new Peer(usernamePeerId(u)); }
  catch (e) { if (cb) cb(false, 'name service failed to start'); return; }
  let settled = false;
  const to = setTimeout(() => {
    if (settled) return;
    settled = true;
    try { p.destroy(); } catch (_) {}
    if (cb) cb(false, 'name service timeout');
  }, 9000);
  p.on('open', () => {
    if (settled) return;
    settled = true;
    clearTimeout(to);
    namePeer = p;
    CLAIMED_NAME = u;
    try { localStorage.setItem('rr-claimed-name', u); } catch (_) {}
    // Friend requests addressed to the username land here.
    p.on('connection', (conn) => { conn.on('data', (d) => handleSocialData(d, conn)); });
    if (cb) cb(true, u);
  });
  p.on('error', (e) => {
    if (settled) return;
    settled = true;
    clearTimeout(to);
    try { p.destroy(); } catch (_) {}
    if (namePeer === p) namePeer = null;
    if (e && e.type === 'unavailable-id') { if (cb) cb(false, 'username already taken'); }
    else if (cb) cb(false, (e && e.type) || 'name service error');
  });
}

// One-shot message to a claimed username (friend requests by name).
function sendToUsername(username, message, onFail) {
  const u = sanitizeUsername(username);
  if (u.length < 3) { if (onFail) onFail('invalid username'); return; }
  if (!socialPeer || !socialReady) { if (onFail) onFail('social layer not ready yet — try again in a moment'); return; }
  let done = false, conn;
  try { conn = socialPeer.connect(usernamePeerId(u), { reliable: true }); }
  catch (e) { if (onFail) onFail('could not reach that user'); return; }
  const timer = setTimeout(() => { if (!done) { done = true; if (onFail) onFail('no one online with that username'); try { conn.close(); } catch (_) {} } }, 8000);
  conn.on('open', () => {
    try { conn.send(message); } catch (_) {}
    setTimeout(() => { done = true; clearTimeout(timer); try { conn.close(); } catch (_) {} }, 2500);
  });
  conn.on('error', () => { if (!done) { done = true; clearTimeout(timer); if (onFail) onFail('no one online with that username'); } });
}

// Re-claim the saved username on boot (quietly — a note only on failure).
if (CLAIMED_NAME) {
  setTimeout(() => {
    claimUsername(CLAIMED_NAME, (ok, msg) => {
      if (!ok && window.__crtPrint) window.__crtPrint('could not re-claim username "' + CLAIMED_NAME + '": ' + msg, 'dim');
    });
  }, 2500);
}

// ---- Auto-join: keep a live subscription to each auto-join friend's presence.
let _autoLinks = {};                 // friendId -> { conn, alive }
let _autoRecent = { code: '', at: 0 };
function ensureAutoLinks() {
  if (!socialPeer || !socialReady) return;
  const wanted = new Set(FRIENDS.filter(f => f.autojoin).map(f => f.id));
  Object.keys(_autoLinks).forEach(fid => {
    if (!wanted.has(fid)) { try { _autoLinks[fid].conn.close(); } catch (_) {} delete _autoLinks[fid]; }
  });
  wanted.forEach(fid => {
    const link = _autoLinks[fid];
    if (link && link.alive) return;
    try {
      const conn = socialPeer.connect(friendPeerId(fid), { reliable: true });
      const rec = { conn, alive: false };
      _autoLinks[fid] = rec;
      conn.on('open', () => { rec.alive = true; try { conn.send({ type: 'presence_query', fromId: FRIEND_ID }); } catch (_) {} });
      conn.on('data', (d) => { if (d && d.type === 'presence_state') { noteFriendName(d.fromId, d.fromName); maybeAutoJoin(d); } });
      conn.on('close', () => { rec.alive = false; if (_autoLinks[fid] === rec) delete _autoLinks[fid]; });
      conn.on('error', () => { rec.alive = false; if (_autoLinks[fid] === rec) delete _autoLinks[fid]; });
    } catch (_) {}
  });
}
function maybeAutoJoin(state) {
  if (G.friendAutoJoinPaused) return;         // paused until the game relaunches
  if (!state || !state.hosting || !state.code) return;
  if (G.myId || G.isHost) return;             // already in / hosting a room
  const code = String(state.code).toUpperCase();
  const now = Date.now();
  if (_autoRecent.code === code && (now - _autoRecent.at) < 20000) return; // debounce
  _autoRecent = { code, at: now };
  friendNotify('Auto-joining ' + (state.fromName || 'a friend') + "'s room (" + code + ') \u2026', 'hi');
  if (window.__terminalJoin) window.__terminalJoin(code);
}
// Push our presence to everyone subscribed to us (called when we start/stop hosting).
function friendsBroadcastPresence() {
  const msg = myPresence();
  socialInConns.forEach(c => { try { c.send(msg); } catch (_) {} });
}

// One-shot presence probe to a single friend: fetch/refresh their display name.
// Skips friends we already keep a live auto-join subscription to.
function refreshFriendPresence(fid) {
  if (!socialPeer || !socialReady || !fid) return;
  if (_autoLinks[fid] && _autoLinks[fid].alive) return;
  let conn;
  try { conn = socialPeer.connect(friendPeerId(fid), { reliable: true }); }
  catch (_) { return; }
  let done = false;
  const finish = () => { if (done) return; done = true; try { conn.close(); } catch (_) {} };
  const timer = setTimeout(finish, 6000);
  conn.on('open', () => { try { conn.send({ type: 'presence_query', fromId: FRIEND_ID, fromName: myRacerName() }); } catch (_) {} });
  conn.on('data', (d) => { if (d && d.type === 'presence_state') { noteFriendName(d.fromId, d.fromName); clearTimeout(timer); finish(); } });
  conn.on('error', () => { clearTimeout(timer); finish(); });
}
// Refresh every friend's name automatically (startup, after adding, periodically).
function refreshAllFriendPresence() {
  FRIENDS.forEach(f => { try { refreshFriendPresence(f.id); } catch (_) {} });
}

function friendsOnHostStart(code) { G.myRoomCode = String(code || '').toUpperCase(); try { friendsBroadcastPresence(); } catch (_) {} }
function friendsOnLeaveRoom() { G.myRoomCode = ''; G.friendAutoJoinPaused = true; try { friendsBroadcastPresence(); } catch (_) {} }

setInterval(() => { try { ensureAutoLinks(); } catch (_) {} }, 5000);
// Keep every friend's display name fresh even if they weren't online when added.
setInterval(() => { try { refreshAllFriendPresence(); } catch (_) {} }, 15000);
initSocialPeer();

function persistCustomization(profile) {
  if (!profile) return;
  try {
    // Merge onto whatever is already saved so partial updates (e.g. just the
    // color) never wipe the other customization fields.
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem('rr-customization') || '{}') || {}; } catch (_) {}
    const m = { ...cur, ...profile };
    localStorage.setItem('rr-customization', JSON.stringify({
      name: (m.name || 'Racer').slice(0, 16),
      color: m.color || PLAYER_COLORS[0],
      paintTag: m.paintTag || '',
      carType: CAR_TYPES[m.carType] ? m.carType : 'drifter',
      smokeColor: m.smokeColor || '',
      trailColor: m.trailColor || '',
      decals: Array.isArray(m.decals) ? m.decals : (m.decal ? [{ src: m.decal, x: 0, y: 0, scale: 1, rot: 0 }] : []),
      showTag: m.showTag !== false,
    }));
  } catch(_) {}
}

function drawDataUrlOnCanvas(canvasId, dataUrl) {
  const cv = document.getElementById(canvasId);
  if (!cv || !dataUrl) return;
  const cx = cv.getContext('2d');
  const img = new Image();
  img.onload = () => { cx.clearRect(0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE); cx.drawImage(img, 0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE); };
  img.src = dataUrl;
}

function loadCustomization() {
  try {
    const raw = localStorage.getItem('rr-customization');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return;
    if (typeof s.name === 'string') { const el = document.getElementById('player-name'); if (el) el.value = s.name.slice(0, 16); }
    if (typeof s.color === 'string') { G.selectedColor = s.color; const el = document.getElementById('car-color'); if (el) el.value = s.color; }
    if (typeof s.paintTag === 'string' && s.paintTag) { G.selectedPaintTag = s.paintTag; drawDataUrlOnCanvas('paint-tag-canvas', s.paintTag); }
    if (typeof s.carType === 'string' && CAR_TYPES[s.carType]) G.selectedCarType = s.carType;
    if (typeof s.smokeColor === 'string') G.selectedSmokeColor = s.smokeColor;
    if (typeof s.trailColor === 'string') G.selectedTrailColor = s.trailColor;
    if (Array.isArray(s.decals)) G.selectedDecals = s.decals;
    else if (typeof s.decal === 'string' && s.decal) G.selectedDecals = [{ src: s.decal, x: 0, y: 0, scale: 1, rot: 0 }];
    if (typeof s.showTag === 'boolean') G.selectedShowTag = s.showTag;
  } catch(_) {}
}

function saveMaps() {
  try {
    localStorage.setItem('rr-maps', JSON.stringify({
      mapQueue: G.mapQueue || [],
      customMap: G.customMap || null,
    }));
  } catch(_) {}
}

function loadMaps() {
  try {
    const raw = localStorage.getItem('rr-maps');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.mapQueue)) G.mapQueue = s.mapQueue;
    if (s && s.customMap && Array.isArray(s.customMap.waypoints)) G.customMap = s.customMap;
  } catch(_) {}
}
