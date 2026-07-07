// ============================================================
// LOBBY UI
// ============================================================
const lobbyMain = document.getElementById('lobby-main');
const lobbyHost = document.getElementById('lobby-host');
const lobbyJoin = document.getElementById('lobby-join');
const lobbyRoomWrap = document.getElementById('lobby-room-wrap');
const lobbyCustomize = document.getElementById('lobby-customize');
const lobbyTracks = document.getElementById('lobby-tracks');
const roomCodeDisplay = document.getElementById('room-code-display');
// Copy the room code; flash the caption so the user knows it worked. `auto`
// suppresses the error caption if the browser blocks clipboard without a gesture.
function copyRoomCode(code, auto) {
  const small = roomCodeDisplay && roomCodeDisplay.querySelector('small');
  const flash = (txt) => { if (small) { small.textContent = txt; setTimeout(() => { small.textContent = 'click to copy'; }, 1600); } };
  try {
    const p = navigator.clipboard && navigator.clipboard.writeText(code);
    if (p && p.then) p.then(() => flash('✓ copied!'), () => { if (!auto) flash('press to copy'); });
    else if (!auto) flash('press to copy');
    else flash('✓ copied!');
  } catch (_) { if (!auto) flash('press to copy'); }
}
const startRaceBtn = document.getElementById('start-race-btn');
const statusMsg = document.getElementById('status-msg');
const hostStatus = document.getElementById('host-status');
const joinStatus = document.getElementById('join-status');
const speedClassSel = document.getElementById('speed-class');
const hostModeIndicator = document.getElementById('host-mode-indicator');
const hostLapsInput = document.getElementById('host-laps-input');
const hostQueueEl = document.getElementById('host-map-queue');
const hostPendingEl = document.getElementById('host-pending-maps');
const hostMapPickSel = document.getElementById('host-map-pick');
const guestVoteSel = document.getElementById('guest-map-vote');

const PAINT_TAG_SIZE = 48;
const paintTagImageCache = {};

function makeDefaultPaintTag() {
  const c = document.createElement('canvas');
  c.width = PAINT_TAG_SIZE;
  c.height = PAINT_TAG_SIZE;
  const c2 = c.getContext('2d');
  c2.clearRect(0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE);
  return c.toDataURL('image/png');
}

const DEFAULT_PAINT_TAG = makeDefaultPaintTag();

function getPaintTagImage(dataUrl) {
  const key = dataUrl || DEFAULT_PAINT_TAG;
  if (!paintTagImageCache[key]) {
    const img = new Image();
    img.src = key;
    paintTagImageCache[key] = img;
  }
  return paintTagImageCache[key];
}

function initPaintTagEditor(canvasId, colorId, clearId) {
  const cv = document.getElementById(canvasId || 'paint-tag-canvas');
  const colorInp = document.getElementById(colorId || 'paint-tag-color');
  const clearBtn = document.getElementById(clearId || 'paint-tag-clear');
  if (!cv) return;
  const cx = cv.getContext('2d');
  cx.clearRect(0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE);

  let drawing = false;
  function pt(e) {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * PAINT_TAG_SIZE;
    const y = ((e.clientY - r.top) / r.height) * PAINT_TAG_SIZE;
    return { x, y };
  }
  function begin(e) {
    drawing = true;
    const p = pt(e);
    cx.strokeStyle = (colorInp && colorInp.value) || '#ffffff';
    cx.lineWidth = 3.5;
    cx.lineCap = 'round';
    cx.lineJoin = 'round';
    cx.beginPath();
    cx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing) return;
    const p = pt(e);
    cx.lineTo(p.x, p.y);
    cx.stroke();
  }
  function end() {
    drawing = false;
  }

  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); begin(e); });
  cv.addEventListener('pointermove', (e) => { e.preventDefault(); move(e); });
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointerleave', end);
  if (clearBtn) clearBtn.onclick = () => {
    cx.clearRect(0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE);
  };
}

function getLobbyProfileInput() {
  const name = (document.getElementById('player-name').value || '').trim() || 'Racer';
  const color = document.getElementById('car-color').value || PLAYER_COLORS[0];
  const paintTagCv = document.getElementById('paint-tag-canvas');
  const paintTag = paintTagCv ? paintTagCv.toDataURL('image/png') : DEFAULT_PAINT_TAG;
  const profile = { name: name.slice(0, 16), color, paintTag, carType: G.selectedCarType,
    smokeColor: G.selectedSmokeColor || '', trailColor: G.selectedTrailColor || '',
    decals: Array.isArray(G.selectedDecals) ? G.selectedDecals : [], showTag: G.selectedShowTag !== false };
  persistCustomization(profile);
  G.selectedColor = profile.color;
  G.selectedPaintTag = profile.paintTag;
  // When already in a room (e.g. edited via the CRT terminal commands), apply the
  // change to our player and sync it — otherwise ship/name/color/tag never update.
  const me = G.players[G.myId];
  if (me) {
    me.name = profile.name;
    me.color = profile.color;
    me.paintTag = profile.paintTag;
    me.carType = profile.carType;
    applyProfileExtras(me, profile);
    if (G.isHost) {
      updateHostPlayerList();
      sendLobbySync();
    } else {
      sendToHost({ type: 'player_profile', id: G.myId, ...profile });
    }
  }
  return profile;
}

// Copy the extended customization (smoke/trail colors, placed decals, tag toggle)
// from a profile onto a player object.
function applyProfileExtras(p, profile) {
  if (!p || !profile) return;
  if (typeof profile.smokeColor === 'string') p.smokeColor = profile.smokeColor;
  if (typeof profile.trailColor === 'string') p.trailColor = profile.trailColor;
  if (Array.isArray(profile.decals)) { p.decals = profile.decals; bumpDecalVer(p); }
  else if (typeof profile.decal === 'string') { p.decals = profile.decal ? [{ src: profile.decal, x: 0, y: 0, scale: 1, rot: 0 }] : []; bumpDecalVer(p); }
  if (typeof profile.showTag === 'boolean') p.showTag = profile.showTag;
}

function sendLobbySync() {
  if (!G.isHost) return;
  saveMaps();
  sendToAll({
    type: 'lobby_sync',
    players: G.players,
    speedClass: G.speedClass,
    laps: G.lobbyLaps,
    hostMode: G.hostMode,
    mapQueue: G.mapQueue,
    pendingMaps: G.pendingMaps,
    mapVotes: G.mapVotes,
    allowedCarTypes: G.allowedCarTypes,
    allowPrototypes: G.allowPrototypes,
  });
}

// Host lobby toggle: unlock/lock the 9 prototype ships for everyone. Bumps anyone
// stuck on a now-illegal pick and syncs the new state to guests.
function setPrototypesAllowed(on) {
  G.allowPrototypes = !!on;
  Object.values(G.players).forEach(p => { if (!carTypeSelectable(p.carType)) p.carType = firstSelectableCarType(); });
  if (!carTypeSelectable(G.selectedCarType)) G.selectedCarType = firstSelectableCarType();
  if (typeof refreshShipGrid === 'function') refreshShipGrid();
  if (typeof updateHostPlayerList === 'function') updateHostPlayerList();
  if (G.isHost && typeof sendLobbySync === 'function') sendLobbySync();
}

function queueEntryLabel(entry) {
  const map = entry && entry.map;
  return map ? (map.name || 'Uploaded Map') : 'Random Track';
}

function renderLobbyQueue() {
  if (!hostQueueEl) return;
  hostQueueEl.innerHTML = '';
  if (!G.mapQueue.length) {
    hostQueueEl.innerHTML = '<div class="queue-item" style="cursor:default">(empty) Add maps or random will be used.</div>';
  }
  G.mapQueue.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'queue-item';
    row.draggable = !!G.isHost;
    row.dataset.queueIndex = String(idx);
    row.innerHTML = `<span>☰</span><span>${queueEntryLabel(entry)}</span><span class="meta">${entry.source || 'host'}</span>`;
    if (G.isHost) {
      const del = document.createElement('button');
      del.textContent = 'Remove';
      del.onclick = (ev) => {
        ev.stopPropagation();
        G.mapQueue.splice(idx, 1);
        sendLobbySync();
        renderLobbyQueue();
        refreshVoteSelectors();
        updateHostPlayerList();
      };
      row.appendChild(del);
      row.addEventListener('dragstart', () => row.classList.add('dragging'));
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (ev) => ev.preventDefault());
      row.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const from = parseInt((ev.dataTransfer && ev.dataTransfer.getData('text/plain')) || '-1', 10);
        const to = idx;
        if (Number.isInteger(from) && from >= 0 && from < G.mapQueue.length && from !== to) {
          const [mv] = G.mapQueue.splice(from, 1);
          G.mapQueue.splice(to, 0, mv);
          sendLobbySync();
          renderLobbyQueue();
          refreshVoteSelectors();
        }
      });
      row.addEventListener('dragstart', (ev) => {
        if (ev.dataTransfer) ev.dataTransfer.setData('text/plain', String(idx));
      });
    }
    hostQueueEl.appendChild(row);
  });
}

function acceptPendingMap(id) {
  const pm = G.pendingMaps.find(x => x.id === id);
  if (!pm) return null;
  G.mapQueue.push({ id: pm.id, map: pm.map, source: pm.fromName || 'guest' });
  G.pendingMaps = G.pendingMaps.filter(x => x.id !== pm.id);
  sendLobbySync();
  renderLobbyPending();
  renderLobbyQueue();
  refreshVoteSelectors();
  updateHostPlayerList();
  return pm;
}

function rejectPendingMap(id) {
  const pm = G.pendingMaps.find(x => x.id === id);
  if (!pm) return null;
  G.pendingMaps = G.pendingMaps.filter(x => x.id !== id);
  sendLobbySync();
  renderLobbyPending();
  return pm;
}

function renderLobbyPending() {
  if (!hostPendingEl) return;
  hostPendingEl.innerHTML = '';
  if (!G.isHost) return;
  if (!G.pendingMaps.length) {
    hostPendingEl.innerHTML = '<div style="font-size:.75rem;color:var(--muted)">No pending submissions.</div>';
    return;
  }
  G.pendingMaps.forEach((pm) => {
    const row = document.createElement('div');
    row.className = 'pending-item';
    const label = document.createElement('div');
    label.textContent = `${pm.map.name || 'Unnamed'} from ${pm.fromName || 'Guest'}`;
    const ok = document.createElement('button');
    ok.className = 'tiny-btn ok';
    ok.textContent = 'Accept';
    ok.onclick = () => {
      acceptPendingMap(pm.id);
    };
    const bad = document.createElement('button');
    bad.className = 'tiny-btn bad';
    bad.textContent = 'Reject';
    bad.onclick = () => {
      rejectPendingMap(pm.id);
    };
    row.appendChild(label);
    row.appendChild(ok);
    row.appendChild(bad);
    hostPendingEl.appendChild(row);
  });
}

function refreshVoteSelectors() {
  const opts = [{ id: '', name: '(No vote)' }].concat(G.mapQueue.map(q => ({ id: q.id, name: queueEntryLabel(q) })));
  if (hostMapPickSel) {
    hostMapPickSel.innerHTML = '';
    opts.forEach(o => {
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      hostMapPickSel.appendChild(op);
    });
  }
  if (guestVoteSel) {
    guestVoteSel.innerHTML = '';
    opts.forEach(o => {
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      guestVoteSel.appendChild(op);
    });
    guestVoteSel.style.display = G.hostMode === 'vote' ? '' : 'none';
  }
}

// ---- Lobby track library (right panel): drag Local/History tracks into the queue ----
let _libDragTrack = null;
function _cleanMapForQueue(map) {
  return {
    name: map.name, waypoints: map.waypoints, obstacles: map.obstacles || [],
    powerups: map.powerups || [], wallRegions: map.wallRegions || [], gates: map.gates || [],
    trackModel: 'v2', branches: Array.isArray(map.branches) ? map.branches : [],
    laps: map.laps, version: map.version || 3, created: map.created,
  };
}
function addTrackToQueue(map, source) {
  if (!G.isHost || !map || !Array.isArray(map.waypoints) || map.waypoints.length < 4) return;
  const mapId = 'q_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  G.mapQueue.push({ id: mapId, map: _cleanMapForQueue(map), source: source || 'library' });
  sendLobbySync();
  renderLobbyQueue();
  refreshVoteSelectors();
  updateHostPlayerList();
}
// Detect the native desktop app. Declared here (early) because menu-wiring code
// below runs at page load and references it — a later declaration would throw a
// temporal-dead-zone error and halt the whole script (killing the terminal UI).
const IS_TAURI = (typeof window !== 'undefined') && !!window.__TAURI_INTERNALS__;
function updateLibFolderStatus() {
  const el = document.getElementById('lib-folder-status');
  if (!el) return;
  if (IS_TAURI) { el.innerHTML = '\u2705 Saved maps are real .json files in the app <b>Maps</b> folder.'; el.style.color = '#4ade80'; }
  else if (_localDirHandle) { el.innerHTML = '\u2705 ' + (tracksFolderName() || 'connected'); el.style.color = '#4ade80'; }
  else if (FS_TRACKS_SUPPORTED) { el.textContent = 'Browser storage \u2014 connect a folder to share files with the editor.'; el.style.color = 'var(--muted)'; }
  else { el.textContent = 'Folder access unavailable in this browser/run mode.'; el.style.color = 'var(--muted)'; }
}
async function renderLobbyTrackLibrary() {
  const localEl = document.getElementById('lib-local-list');
  const histEl = document.getElementById('lib-history-list');
  if (!localEl || !histEl) return;
  if (IS_TAURI) await _tauriEnsureMaps();
  updateLibFolderStatus();
  let local, hist;
  if (_localDirHandle) local = (await _fsReadTracks(_localDirHandle)).sort((a, b) => a.name.localeCompare(b.name));
  else local = getLocalTracks();
  if (_historyDirHandle) hist = (await _fsReadTracks(_historyDirHandle)).sort((a, b) => (b._mtime || 0) - (a._mtime || 0));
  else hist = getHistoryTracks();
  const fill = (el, arr, emptyMsg) => {
    el.innerHTML = '';
    if (!arr.length) { el.innerHTML = `<div class="lib-empty">${emptyMsg}</div>`; return; }
    arr.forEach(rec => {
      const row = document.createElement('div'); row.className = 'lib-item'; row.draggable = true;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = rec.name;
      nm.title = `${rec.name} \u2014 ${rec.waypoints.length} nodes \u00b7 ${rec.laps || 3} laps`;
      row.appendChild(nm);
      const add = document.createElement('button'); add.textContent = '\uff0b'; add.title = 'Add to queue';
      add.onclick = () => addTrackToQueue(rec, 'library');
      row.appendChild(add);
      row.addEventListener('dragstart', ev => {
        _libDragTrack = rec;
        if (ev.dataTransfer) { ev.dataTransfer.setData('text/plain', 'rr-lib'); ev.dataTransfer.effectAllowed = 'copy'; }
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); setTimeout(() => { _libDragTrack = null; }, 60); });
      el.appendChild(row);
    });
  };
  fill(localEl, local, 'No saved tracks.');
  fill(histEl, hist, 'No recent tracks.');
}
if (hostQueueEl) {
  hostQueueEl.addEventListener('dragover', ev => { if (_libDragTrack) { ev.preventDefault(); hostQueueEl.classList.add('lib-drop-hover'); } });
  hostQueueEl.addEventListener('dragleave', () => hostQueueEl.classList.remove('lib-drop-hover'));
  hostQueueEl.addEventListener('drop', ev => {
    hostQueueEl.classList.remove('lib-drop-hover');
    if (_libDragTrack) { ev.preventDefault(); addTrackToQueue(_libDragTrack, 'library'); _libDragTrack = null; }
  });
}
const libConnectBtn = document.getElementById('lib-connect-folder-btn');
if (libConnectBtn) {
  if (IS_TAURI) { libConnectBtn.textContent = '\uD83D\uDCC2 Open maps folder'; libConnectBtn.onclick = () => openMapsFolder(); }
  else libConnectBtn.onclick = async () => { if (await connectTracksFolder()) renderLobbyTrackLibrary(); };
}

function pickQueuedMapForStart() {
  if (!G.mapQueue.length) return null;
  if (G.hostMode === 'owner') return G.mapQueue[0];
  const tally = {};
  Object.values(G.players).forEach(p => {
    const vote = G.mapVotes[p.id] || '';
    if (!vote) return;
    tally[vote] = (tally[vote] || 0) + 1;
  });
  let winnerId = '';
  let best = -1;
  G.mapQueue.forEach(q => {
    const count = tally[q.id] || 0;
    if (count > best) {
      best = count;
      winnerId = q.id;
    }
  });
  return G.mapQueue.find(q => q.id === winnerId) || G.mapQueue[0];
}

function normalizePlayerState(p) {
  if (!p) return;
  if (!p.carType || !CAR_TYPES[p.carType]) p.carType = 'drifter';
  if (typeof p.paintTag !== 'string' || !p.paintTag) p.paintTag = DEFAULT_PAINT_TAG;
  if (p.ready == null) p.ready = false;
  if (p.maxHealth == null) p.maxHealth = carMaxHealth(p.carType);
  if (p.health == null) p.health = p.maxHealth;
  if (p.deathRespawn == null) p.deathRespawn = 0;
  if (p.invuln == null) p.invuln = 0;
  if (p.nextCheckpoint == null) p.nextCheckpoint = 0;
  if (p.lastCheckpointTime == null) p.lastCheckpointTime = 0;
  if (p.lastLapTime == null) p.lastLapTime = 0;
  if (p.finishElapsedMs == null) p.finishElapsedMs = 0;
}

function initCarTypePicker() {
  const buttons = Array.from(document.querySelectorAll('#lobby-c-ship-grid .car-type-btn'));
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-car-type') || 'drifter';
      if (!CAR_TYPES[type]) return;
      if (!carTypeSelectable(type)) return;
      G.selectedCarType = type;
      refreshShipGrid();
      applyCustomize();
    });
  });
}

// Grey out / disable ships the host has not allowed (or prototypes when the host
// has them locked), and reflect current selection.
function refreshShipGrid() {
  if (!carTypeSelectable(G.selectedCarType)) {
    G.selectedCarType = firstSelectableCarType();
  }
  document.querySelectorAll('#lobby-c-ship-grid .car-type-btn').forEach(btn => {
    const t = btn.getAttribute('data-car-type');
    const isProto = btn.getAttribute('data-proto') === '1';
    const ok = carTypeSelectable(t);
    // Prototype ships fully hide when the host locks them; otherwise just disable.
    btn.style.display = (isProto && G.allowPrototypes === false) ? 'none' : '';
    btn.disabled = !ok;
    btn.classList.toggle('active', ok && t === G.selectedCarType);
  });
}

function readCustomizeProfile() {
  const name = (document.getElementById('lobby-c-name').value || '').trim() || 'Racer';
  const color = document.getElementById('lobby-c-color').value || PLAYER_COLORS[0];
  const cv = document.getElementById('lobby-c-paint-canvas');
  const paintTag = cv ? cv.toDataURL('image/png') : DEFAULT_PAINT_TAG;
  return { name: name.slice(0, 16), color, paintTag, carType: G.selectedCarType,
    smokeColor: G.selectedSmokeColor || '', trailColor: G.selectedTrailColor || '',
    decal: G.selectedDecal || '', showTag: G.selectedShowTag !== false };
}

// Push the customize-panel values to the local player and the rest of the room.
function applyCustomize() {
  const me = G.players[G.myId];
  if (!me) return;
  const profile = readCustomizeProfile();
  me.name = profile.name;
  me.color = profile.color;
  me.paintTag = profile.paintTag;
  me.carType = profile.carType;
  applyProfileExtras(me, profile);
  G.selectedColor = profile.color;
  G.selectedPaintTag = profile.paintTag;
  G.selectedCarType = profile.carType;
  persistCustomization(profile);
  if (G.isHost) {
    updateHostPlayerList();
    sendLobbySync();
  } else {
    sendToHost({ type: 'player_profile', id: G.myId, ...profile });
  }
  const st = document.getElementById('lobby-c-status');
  if (st) { st.textContent = 'Saved ✓'; setTimeout(() => { if (st.textContent === 'Saved ✓') st.textContent = ''; }, 1200); }
}

// Prefill the customize tab from the current player and show it.
function openCustomize() {
  const me = G.players[G.myId];
  const nameInp = document.getElementById('lobby-c-name');
  const colorInp = document.getElementById('lobby-c-color');
  if (nameInp) nameInp.value = me ? me.name : ((document.getElementById('player-name').value || '').trim() || 'Racer');
  if (colorInp) colorInp.value = me ? me.color : (document.getElementById('car-color').value || PLAYER_COLORS[0]);
  const cv = document.getElementById('lobby-c-paint-canvas');
  if (cv) {
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE);
    const src = me ? me.paintTag : G.selectedPaintTag;
    if (src) {
      const img = new Image();
      img.onload = () => cx.drawImage(img, 0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE);
      img.src = src;
    }
  }
  refreshShipGrid();
  if (lobbyCustomize) lobbyCustomize.style.display = '';
}

// Host-only roster toggles for which ships players may use.
function renderAllowedShips() {
  const wrap = document.getElementById('host-allowed-ships');
  if (!wrap) return;
  const allowed = (G.allowedCarTypes && G.allowedCarTypes.length) ? G.allowedCarTypes : Object.keys(CAR_TYPES);
  wrap.innerHTML = '';
  Object.keys(CAR_TYPES).forEach(t => {
    const on = allowed.includes(t);
    const btn = document.createElement('button');
    btn.className = 'car-type-btn' + (on ? ' active' : '');
    btn.innerHTML = `<strong>${CAR_TYPES[t].name}</strong>${on ? 'Allowed' : 'Blocked'}`;
    btn.onclick = () => {
      const set = new Set((G.allowedCarTypes && G.allowedCarTypes.length) ? G.allowedCarTypes : Object.keys(CAR_TYPES));
      if (set.has(t)) { if (set.size > 1) set.delete(t); }
      else set.add(t);
      G.allowedCarTypes = Object.keys(CAR_TYPES).filter(x => set.has(x));
      // Re-home any player on a now-blocked ship.
      Object.values(G.players).forEach(p => {
        if (!G.allowedCarTypes.includes(p.carType)) p.carType = G.allowedCarTypes[0];
      });
      renderAllowedShips();
      refreshShipGrid();
      updateHostPlayerList();
      sendLobbySync();
    };
    wrap.appendChild(btn);
  });
}

initCarTypePicker();
initPaintTagEditor();
initPaintTagEditor('lobby-c-paint-canvas', 'lobby-c-paint-color', 'lobby-c-paint-clear');
{
  const cApply = document.getElementById('lobby-c-apply');
  if (cApply) cApply.onclick = () => applyCustomize();
  const cName = document.getElementById('lobby-c-name');
  if (cName) cName.addEventListener('change', () => applyCustomize());
  const cColor = document.getElementById('lobby-c-color');
  if (cColor) cColor.addEventListener('change', () => applyCustomize());
  // Persist main-menu customization edits.
  const mName = document.getElementById('player-name');
  if (mName) mName.addEventListener('change', () => getLobbyProfileInput());
  const mColor = document.getElementById('car-color');
  if (mColor) mColor.addEventListener('change', () => getLobbyProfileInput());
}

document.getElementById('host-btn').onclick = async () => {
  const profile = getLobbyProfileInput();
  const modeChoice = window.__hostModeChoice
    || (window.confirm('Host mode confirmation:\nOK = Owner mode (host picks map order)\nCancel = Vote mode (players vote map each round)') ? 'owner' : 'vote');
  window.__hostModeChoice = null;
  statusMsg.textContent = 'Setting up room...';
  statusMsg.className = 'status-msg';
  try {
    const code = await initHostPeer(makeRoomCode());
    G.myId = peer.id;
    G.isHost = true;
    G.hostMode = modeChoice;
    friendsOnHostStart(code);
    G.speedClass = speedClassSel ? speedClassSel.value : 'neighborhood';
    G.speedScale = speedClassScale(G.speedClass);
    G.selectedColor = profile.color;
    G.selectedPaintTag = profile.paintTag;
    loadMaps(); // restore previously saved map queue / custom map
    G.pendingMaps = [];
    G.mapVotes = {};
    const p = makePlayer(G.myId, profile.name, profile.color, 0, 0, 0, G.selectedCarType);
    p.paintTag = profile.paintTag;
    applyProfileExtras(p, profile);
    p.clientUid = CLIENT_UID;
    p.ready = true;
    G.players[G.myId] = p;
    lobbyMain.style.display = 'none';
    lobbyRoomWrap.style.display = 'flex';
    lobbyHost.style.display = '';
    if (lobbyTracks) lobbyTracks.style.display = '';
    renderAllowedShips();
    openCustomize();
    if (hostModeIndicator) hostModeIndicator.value = G.hostMode === 'vote' ? 'Vote' : 'Owner';
    if (speedClassSel) speedClassSel.value = G.speedClass;
    roomCodeDisplay.childNodes[0].textContent = code;
    // Fallback (anonymous-peer) codes are long — compact the display so they fit.
    roomCodeDisplay.style.fontSize = code.length > 8 ? '0.85rem' : '';
    roomCodeDisplay.style.letterSpacing = code.length > 8 ? '1px' : '';
    // Auto-copy the code to the clipboard the moment the room is up, and keep
    // click-to-copy as a fallback (clipboard API can reject without a gesture).
    copyRoomCode(code, true);
    roomCodeDisplay.onclick = () => copyRoomCode(code, false);
    updateHostPlayerList();
    renderLobbyQueue();
    renderLobbyPending();
    refreshVoteSelectors();
    tryRestoreTracksFolder().then(renderLobbyTrackLibrary);
    peer.on('connection', conn => {
      guestConns.push(conn);
      conn.on('open', () => {
        conn.send({ type: 'players_sync', players: netPlayers(), speedClass: G.speedClass, hostMode: G.hostMode, mapQueue: G.mapQueue, mapVotes: G.mapVotes });
        sendLobbySync();
      });
      conn.on('data', d => {
        if (d.type === 'player_join') {
          const incoming = d.player;
          // Drop stale clones: same client reconnecting under a new peer id.
          if (incoming && incoming.clientUid) {
            Object.keys(G.players).forEach(pid => {
              if (pid !== incoming.id && G.players[pid] && G.players[pid].clientUid === incoming.clientUid) {
                const stale = guestConns.find(c => c.peer === pid);
                if (stale) { try { stale.close(); } catch(_){} guestConns = guestConns.filter(c => c !== stale); }
                delete G.players[pid];
                delete G.mapVotes[pid];
              }
            });
          }
          G.players[incoming.id] = incoming;
          sendToAll({ type: 'players_sync', players: G.players, speedClass: G.speedClass, hostMode: G.hostMode, mapQueue: G.mapQueue, mapVotes: G.mapVotes });
          updateHostPlayerList();
          sendLobbySync();
        } else {
          onData(d, conn.peer);
          if (d.type !== 'player_profile' && d.type !== 'player_ready' && d.type !== 'map_vote' && d.type !== 'map_submit' && d.type !== 'post_race_ready' && d.type !== 'upgrade_pause_req' && d.type !== 'upgrade_pause_done') {
            guestConns.forEach(c => { if (c !== conn) try { c.send(d); } catch(_){} });
          }
        }
      });
      conn.on('close', () => {
        guestConns = guestConns.filter(c => c !== conn);
        delete G.players[conn.peer];
        delete G.mapVotes[conn.peer];
        sendToAll({ type: 'players_sync', players: G.players, speedClass: G.speedClass, hostMode: G.hostMode, mapQueue: G.mapQueue, mapVotes: G.mapVotes });
        sendLobbySync();
        updateHostPlayerList();
        // If a race is running, the departed player no longer counts toward
        // "everyone finished" — without this re-check, a mid-race disconnect
        // left the remaining finishers waiting on them forever. (Checked on
        // finishOrder rather than raceStarted, which goes false during the
        // synchronized upgrade pause.)
        if (!G.raceOver && G.finishOrder.length > 0) checkRaceOver();
      });
    });
  } catch(e) {
    statusMsg.textContent = 'Failed: ' + e.message;
    statusMsg.className = 'status-msg err';
  }
};

document.getElementById('join-btn-open').onclick = () => {
  lobbyMain.style.display = 'none';
  lobbyRoomWrap.style.display = 'flex';
  if (lobbyCustomize) lobbyCustomize.style.display = 'none';
  if (lobbyTracks) lobbyTracks.style.display = 'none';
  lobbyJoin.style.display = '';
};

document.getElementById('back-lobby-btn').onclick = () => {
  lobbyRoomWrap.style.display = 'none';
  lobbyHost.style.display = 'none';
  if (lobbyCustomize) lobbyCustomize.style.display = 'none';
  lobbyMain.style.display = '';
  if (peer) { peer.destroy(); peer = null; }
  friendsOnLeaveRoom();
  G.players = {};
  G.mapQueue = [];
  G.pendingMaps = [];
  G.mapVotes = {};
};
document.getElementById('back-lobby-btn2').onclick = () => {
  lobbyRoomWrap.style.display = 'none';
  lobbyJoin.style.display = 'none';
  if (lobbyCustomize) lobbyCustomize.style.display = 'none';
  if (lobbyTracks) lobbyTracks.style.display = 'none';
  lobbyMain.style.display = '';
  friendsOnLeaveRoom();
  const panel = document.getElementById('join-room-panel');
  if (panel) panel.style.display = 'none';
};

roomCodeDisplay.onclick = () => {
  const code = roomCodeDisplay.childNodes[0].textContent.trim();
  navigator.clipboard.writeText(code).then(()=>{
    roomCodeDisplay.querySelector('small').textContent = 'copied!';
    setTimeout(()=>roomCodeDisplay.querySelector('small').textContent='click to copy',1500);
  });
};

document.getElementById('join-confirm-btn').onclick = async () => {
  const profile = getLobbyProfileInput();
  const rawCode = document.getElementById('join-code').value.trim();
  const code = rawCode.toUpperCase();
  if (code.length < 4) { joinStatus.textContent = 'Enter a valid code'; joinStatus.className = 'status-msg err'; return; }
  joinStatus.textContent = 'Connecting...'; joinStatus.className = 'status-msg';
  try {
    const myId = await initGuestPeer();
    G.myId = myId;
    G.isHost = false;
    const colorIdx = Object.keys(G.players).length % PLAYER_COLORS.length;
    const p = makePlayer(myId, profile.name, profile.color || PLAYER_COLORS[colorIdx], 0, 0, 0, G.selectedCarType);
    p.paintTag = profile.paintTag;
    applyProfileExtras(p, profile);
    p.clientUid = CLIENT_UID;
    p.ready = false;
    G.players[myId] = p;
    // Short codes are claimed rooms; long codes are fallback rooms where the
    // room code IS the host's raw (lowercase) peer id.
    const hostPeerId = code.length > 8 ? rawCode.toLowerCase() : 'rogueracer-' + code.toLowerCase();
    hostConn = peer.connect(hostPeerId, { reliable: true });
    // Surface a clear failure instead of sitting on "Connecting..." forever.
    const joinTimeout = setTimeout(() => {
      if (hostConn && !hostConn.open) {
        joinStatus.textContent = 'No room found for that code (host offline, or a typo).';
        joinStatus.className = 'status-msg err';
      }
    }, 12000);
    hostConn.on('open', () => {
      clearTimeout(joinTimeout);
      joinStatus.textContent = 'Connected! Waiting for host...';
      joinStatus.className = 'status-msg ok';
      document.getElementById('join-room-panel').style.display = 'flex';
      openCustomize();
      hostConn.send({ type: 'player_join', player: p });
    });
    hostConn.on('data', d => onData(d, hostConn.peer));
    hostConn.on('error', e => { joinStatus.textContent = 'Error: ' + e; joinStatus.className = 'status-msg err'; });
    hostConn.on('close', () => {
      if (!G.myId) return; // we left on purpose; already torn down
      joinStatus.textContent = 'Disconnected from host';
      joinStatus.className = 'status-msg err';
      try { if (peer) peer.destroy(); } catch(_) {}
      peer = null; hostConn = null; guestConns = [];
      G.isHost = false; G.myId = null; G.players = {};
      lobbyRoomWrap.style.display = 'none';
      lobbyHost.style.display = 'none';
      lobbyJoin.style.display = 'none';
      if (lobbyCustomize) lobbyCustomize.style.display = 'none';
      if (lobbyTracks) lobbyTracks.style.display = 'none';
      lobbyMain.style.display = '';
      const panel = document.getElementById('join-room-panel');
      if (panel) panel.style.display = 'none';
      if (window.crtwm) { try { window.crtwm.close('lobby'); } catch(_){} }
      if (window.__crtPrint) window.__crtPrint('The host closed the room.', 'err');
    });
  } catch(e) {
    joinStatus.textContent = 'Failed: ' + e.message;
    joinStatus.className = 'status-msg err';
  }
};

function resetPlayersForRace() {
  Object.values(G.players).forEach((p, i) => {
    const sp = safeSpawnState(i, G.track);
    p.x=sp.x; p.y=sp.y; p.angle=sp.angle;
    p.lap=1; p.lapProgress=0; p._lapArmed=false; p.speed=0; p.vx=0; p.vy=0;
    p.maxHealth = carMaxHealth(p.carType);
    p.health = p.maxHealth;
    p.deathRespawn = 0;
    p.invuln = 2.0; // brief spawn protection so grid bumps don't chip anyone
    p._lapClock = 0;
    p.nextCheckpoint=0;
    p.checkpointsDoneThisLap=false;
    p.lastCheckpointTime=0; p.lastLapTime=0;
    p.finished=false; p.finishTime=0; p.finishElapsedMs=0; p.stun=0; p.boosting=0; p.ghostMode=0; p.shielded=false; p.shieldTime=0; p.autopilot=0; p.trailBoost=0; p.oilSlick=0;
    p.heldItem=null; p.upgrades=[];
    p.rampIgnore={};
    p.driftSteerSign=0; p.driftFlipTimer=0; p.driftFlipCount=0;
    p.driftCommitTimer=0; p.driftNoBoostTimer=0;
    p.driftPenaltyTimer=0;
    p.layer=sp.layer; p.airTime=0; p.lastRampKey=''; p.bridgeTransitionGrace=sp.grace;
    p.slopeSide={};
    p.layerFallSpeed=0; p.layerFallProgress=0;
    p.postReady=false;
    // New-car special state
    p.propHealth=CAR_TUNING.rotorPropMaxHealth; p.propBroken=false;
    p.downdraft=0; p.rotorCooldown=0;
    p.wobble=0; p.battery=0; p.arcing=0;
    p.arcBurst=0; p.coilAbilityCooldown=0;
    p.honkCooldown=0; p.tunnelVision=0;
    p.holoCooldown=0;
    p.inflate=0; p.ballerCooldown=0;
    p.spikes=0; p.needleCooldown=0;
    p.puncherCooldown=0;
    p.drain=0; p.drainedBy=null; p.ghoulSlow=0; p.noControl=0; p.deathray=0;
    p._propAngle=0; p._wobblePhase=0;
    // Bot rail state resets so a rerun starts them fresh from their grid slot.
    p._idxF=null; p._speed=0; p._itemT=6+Math.random()*8;
  });
}

// Resolve the lap count for the next race: host lobby setting wins, else track default, clamped 1-20.
function resolveRaceLaps(map) {
  let n = G.lobbyLaps;
  if (!Number.isFinite(n)) n = (map && Number.isFinite(map.laps)) ? map.laps : 3;
  return Math.max(1, Math.min(20, Math.round(n)));
}

// Host-authoritative: build a track from the given map (or random) and start the race for everyone.
function hostLaunchRace(selectedMap) {
  const resultsScr = document.getElementById('results-screen');
  if (resultsScr) resultsScr.style.display = 'none';
  clearPostRaceTimer();
  const seed = Date.now() % 100000;
  G.track = selectedMap
    ? generateTrackFromWaypoints(selectedMap.waypoints, seed, selectedMap.obstacles || [], selectedMap.powerups || [], selectedMap.wallRegions || [], selectedMap.gates || [])
    : generateTrack(seed);
  if (selectedMap) recordTrackHistory(selectedMap);
  G.totalLaps = resolveRaceLaps(selectedMap);
  resetPlayersForRace();
  const msg = { type:'start_race', seed, players:G.players, speedClass: G.speedClass, laps: G.totalLaps };
  if (selectedMap) msg.selectedMap = selectedMap;
  sendToAll(msg);
  if (window.__crtRaceBoot) window.__crtRaceBoot(seed, startGame); else startGame();
}

// Queue navigation (sequential, wraps/loops at the end).
function peekNextQueueIndex() {
  if (!G.mapQueue.length) return -1;
  return (G.queueIndex + 1) % G.mapQueue.length;
}
function peekNextQueueMap() {
  const ni = peekNextQueueIndex();
  if (ni < 0) {
    const nm = G.customMap ? (G.customMap.name || 'Custom Map') : 'Random Track';
    return { map: G.customMap || null, name: nm, loop: false };
  }
  return { map: G.mapQueue[ni].map, name: queueEntryLabel(G.mapQueue[ni]), loop: ni <= G.queueIndex };
}
function hostAdvanceQueue() {
  if (!G.isHost) return;
  clearPostRaceTimer();
  const ni = peekNextQueueIndex();
  let selectedMap;
  if (ni < 0) { selectedMap = G.customMap || null; }
  else { G.queueIndex = ni; selectedMap = G.mapQueue[ni].map; }
  hostLaunchRace(selectedMap);
}

startRaceBtn.onclick = () => {
  const playersReady = Object.values(G.players);
  if (!playersReady.length) return;
  if (!playersReady.every(p => p.ready)) {
    hostStatus.textContent = 'All players must be ready before starting.';
    hostStatus.style.color = '#f87171';
    return;
  }
  const selectedQueue = pickQueuedMapForStart();
  G.queueIndex = selectedQueue ? Math.max(0, G.mapQueue.indexOf(selectedQueue)) : 0;
  const selectedMap = selectedQueue && selectedQueue.map ? selectedQueue.map : (G.customMap || null);
  hostLaunchRace(selectedMap);
};

if (speedClassSel) {
  speedClassSel.onchange = () => {
    if (!G.isHost) return;
    G.speedClass = speedClassSel.value;
    G.speedScale = speedClassScale(G.speedClass);
    sendLobbySync();
    updateHostPlayerList();
  };
}

if (hostLapsInput) {
  const applyLaps = () => {
    if (!G.isHost) return;
    let n = Math.round(parseInt(hostLapsInput.value, 10));
    if (!Number.isFinite(n)) n = 3;
    n = Math.max(1, Math.min(20, n));
    hostLapsInput.value = n;
    G.lobbyLaps = n;
  };
  hostLapsInput.onchange = applyLaps;
  G.lobbyLaps = Math.max(1, Math.min(20, parseInt(hostLapsInput.value, 10) || 3));
}

document.getElementById('host-cycle-mode-btn').onclick = () => {
  if (!G.isHost) return;
  G.hostMode = G.hostMode === 'owner' ? 'vote' : 'owner';
  if (hostModeIndicator) hostModeIndicator.value = G.hostMode === 'vote' ? 'Vote' : 'Owner';
  sendLobbySync();
  refreshVoteSelectors();
  updateHostPlayerList();
};

document.getElementById('host-upload-map-btn').onclick = () => {
  if (!G.isHost) return;
  document.getElementById('host-map-file').click();
};

document.getElementById('host-map-file').onchange = (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach((f) => {
    const rd = new FileReader();
    rd.onload = (ev) => {
      try {
        const map = JSON.parse(ev.target.result);
        if (!Array.isArray(map.waypoints) || map.waypoints.length < 4) return;
        const mapId = 'q_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        G.mapQueue.push({ id: mapId, map, source: 'host' });
        sendLobbySync();
        renderLobbyQueue();
        refreshVoteSelectors();
        updateHostPlayerList();
      } catch (_) {}
    };
    rd.readAsText(f);
  });
  e.target.value = '';
};

document.getElementById('guest-upload-map-btn').onclick = () => {
  document.getElementById('guest-map-file').click();
};

document.getElementById('guest-map-file').onchange = (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach((f) => {
    const rd = new FileReader();
    rd.onload = (ev) => {
      try {
        const map = JSON.parse(ev.target.result);
        if (!Array.isArray(map.waypoints) || map.waypoints.length < 4) return;
        const me = G.players[G.myId];
        sendToHost({ type: 'map_submit', id: G.myId, fromName: me ? me.name : 'Guest', map });
        joinStatus.textContent = 'Map submitted to host for approval.';
        joinStatus.className = 'status-msg ok';
      } catch (err) {
        joinStatus.textContent = 'Upload failed: invalid map JSON';
        joinStatus.className = 'status-msg err';
      }
    };
    rd.readAsText(f);
  });
  e.target.value = '';
};

document.getElementById('ready-toggle-btn').onclick = () => {
  const me = G.players[G.myId];
  if (!me) return;
  me.ready = !me.ready;
  const btn = document.getElementById('ready-toggle-btn');
  btn.textContent = `Ready: ${me.ready ? 'Yes' : 'No'}`;
  btn.style.borderColor = me.ready ? 'rgba(34,197,94,0.6)' : '';
  sendToHost({ type: 'player_ready', id: G.myId, ready: me.ready });
};

if (guestVoteSel) {
  guestVoteSel.onchange = () => {
    sendToHost({ type: 'map_vote', id: G.myId, mapId: guestVoteSel.value || '' });
  };
}

if (hostMapPickSel) {
  hostMapPickSel.onchange = () => {
    if (!G.isHost) return;
    const id = hostMapPickSel.value;
    if (!id) return;
    const idx = G.mapQueue.findIndex(q => q.id === id);
    if (idx > 0) {
      const [pick] = G.mapQueue.splice(idx, 1);
      G.mapQueue.unshift(pick);
      renderLobbyQueue();
      sendLobbySync();
      refreshVoteSelectors();
      updateHostPlayerList();
    }
  };
}

function kickPlayer(pid) {
  if (!G.isHost || !pid || pid === G.myId) return;
  const conn = guestConns.find(c => c.peer === pid);
  if (conn) {
    try { conn.send({ type: 'kicked' }); } catch(_) {}
    setTimeout(() => { try { conn.close(); } catch(_) {} }, 60);
  }
  guestConns = guestConns.filter(c => c.peer !== pid);
  delete G.players[pid];
  delete G.mapVotes[pid];
  sendToAll({ type: 'players_sync', players: G.players, speedClass: G.speedClass, hostMode: G.hostMode, mapQueue: G.mapQueue, mapVotes: G.mapVotes });
  sendLobbySync();
  updateHostPlayerList();
}

function updateHostPlayerList() {
  const list = document.getElementById('host-player-list');
  list.innerHTML = '';
  const players = Object.values(G.players);
  players.forEach((p,i)=>{
    const div = document.createElement('div');
    div.className = 'player-item';
    const t = getCarTypeCfg(p.carType).name;
    const rdy = p.ready ? '✅' : '⌛';
    div.innerHTML = `<div class="player-dot" style="background:${p.color}"></div><span>${p.name}</span><span style="color:var(--muted);font-size:0.72rem">${t}</span><span style="color:var(--muted);font-size:0.72rem">TAG</span><span style="color:var(--muted);font-size:0.75rem">${rdy}</span>${i===0?' <span style="color:var(--muted);font-size:0.75rem">(host)</span>':''}`;
    if (G.isHost && p.id !== G.myId) {
      const kick = document.createElement('button');
      kick.className = 'kick-btn';
      kick.textContent = 'Kick';
      kick.title = `Kick ${p.name}`;
      kick.onclick = () => kickPlayer(p.id);
      div.appendChild(kick);
    }
    list.appendChild(div);
  });
  const readyCount = players.filter(p => p.ready).length;
  if (players.length > 1) {
    startRaceBtn.disabled = false;
    startRaceBtn.textContent = `Start Race (${readyCount}/${players.length} ready)`;
  } else {
    startRaceBtn.disabled = true;
    startRaceBtn.textContent = 'Waiting for players...';
  }
  // solo play allowed
  if (players.length === 1 && G.isHost) {
    startRaceBtn.disabled = false;
    startRaceBtn.textContent = 'Start Solo Race';
  }
  if (players.some(p => !p.ready)) {
    startRaceBtn.textContent = `Waiting: ${readyCount}/${players.length} ready`;
  }
  // Show custom map status
  const sc = SPEED_CLASSES[G.speedClass] || SPEED_CLASSES.neighborhood;
  const queueInfo = G.mapQueue.length ? ` · queue:${G.mapQueue.length}` : '';
  const modeInfo = ` · mode:${G.hostMode === 'vote' ? 'Vote' : 'Owner'}`;
  if (G.customMap || G.mapQueue.length) {
    const m = (G.mapQueue[0] && G.mapQueue[0].map && G.mapQueue[0].map.name) || (G.customMap && G.customMap.name) || 'Random';
    hostStatus.textContent = `🗺️ Next: "${m}" · speed:${sc.label} (${sc.scale}x)${modeInfo}${queueInfo}`;
    hostStatus.style.color = '#4ade80';
  } else {
    hostStatus.textContent = `speed:${sc.label} (${sc.scale}x)${modeInfo}`;
    hostStatus.style.color = '';
  }
}
