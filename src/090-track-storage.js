// ============================================================
// TRACK STORAGE — real OS folder when possible, localStorage fallback
// ============================================================
// On a double-clicked file:// page we cannot silently read/write OS folders.
// If the browser supports the File System Access API (Chrome/Edge), the user
// connects their "Saved tracks" folder once; we then read/write real .json
// files inside its Local/ and History/ subfolders. localStorage always mirrors
// the data as a cache/fallback (and is the only store if no folder is connected).
//   Local   = permanently saved tracks (folder: Saved tracks/Local, cache: rr-tracks-local)
//   History = last 10 loaded tracks, FIFO auto-delete (folder: Saved tracks/History, cache: rr-tracks-history)
const TRACK_LOCAL_KEY = 'rr-tracks-local';
const TRACK_HISTORY_KEY = 'rr-tracks-history';
const TRACK_HISTORY_MAX = 10;
const TRACK_LAPS_DEFAULT = 3;

// In the native desktop app (Tauri), skip the "pick a folder" prompt and use
// the game's built-in automatic storage, which the app keeps inside its own
// AppData folder. Browsers are unaffected (this branch never runs there).
if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
  try { window.showDirectoryPicker = undefined; } catch (_) {}
  // F11 toggles borderless fullscreen in the desktop app (browsers use native F11).
  window.addEventListener('keydown', function (e) {
    if (e.key === 'F11') {
      e.preventDefault();
      try {
        var w = window.__TAURI__.window.getCurrentWindow();
        w.isFullscreen().then(function (f) { w.setFullscreen(!f); });
      } catch (_) {}
    }
  });
}
// --- File System Access API folder backing (optional) ---
const FS_TRACKS_SUPPORTED = (typeof window !== 'undefined') && (typeof window.showDirectoryPicker === 'function');
let _tracksRootHandle = null;
let _localDirHandle = null;
let _historyDirHandle = null;

// --- Native desktop (Tauri) real-file map storage ---
// In the packaged app there's no folder-picker, so saved maps are written as
// real .json files into a physical "Maps" folder inside the app's AppData dir
// (History stays in the localStorage cache). This mirrors the browser folder
// feature but uses the Tauri fs/path plugins instead of File System Access.
let _tauriMapsDir = null;
let _tauriMapsInit = null;
function _tauriEnsureMaps() {
  if (!IS_TAURI) return Promise.resolve();
  if (_tauriMapsInit) return _tauriMapsInit;
  _tauriMapsInit = (async () => {
    try {
      const path = window.__TAURI__.path, fs = window.__TAURI__.fs;
      const dir = await path.join(await path.appDataDir(), 'Maps');
      await fs.mkdir(dir, { recursive: true });
      _tauriMapsDir = dir;
      _localDirHandle = dir;
      // One-time migration: turn any cached maps into real files (overwrite by name).
      try { for (const rec of getLocalTracks()) await _tauriWriteTrack(dir, rec); } catch (_) {}
    } catch (e) { console.warn('maps folder init failed', e); _tauriMapsInit = null; }
  })();
  return _tauriMapsInit;
}
async function _tauriWriteTrack(dir, rec) {
  if (!dir) return;
  try {
    const fs = window.__TAURI__.fs, path = window.__TAURI__.path;
    const fp = await path.join(dir, _trackFileName(rec));
    await fs.writeTextFile(fp, JSON.stringify(_serializeTrack(rec), null, 2));
  } catch (e) { console.warn('tauri track write failed', e); }
}
async function _tauriDeleteTrack(dir, rec) {
  if (!dir || !rec) return;
  try {
    const fs = window.__TAURI__.fs, path = window.__TAURI__.path;
    const fp = await path.join(dir, _trackFileName(rec));
    if (await fs.exists(fp)) await fs.remove(fp);
  } catch (_) {}
}
async function _tauriReadTracks(dir) {
  const out = [];
  if (!dir) return out;
  try {
    const fs = window.__TAURI__.fs, path = window.__TAURI__.path;
    const entries = await fs.readDir(dir);
    for (const e of entries) {
      if (!e.isFile || !/\.json$/i.test(e.name)) continue;
      try {
        const fp = await path.join(dir, e.name);
        const d = JSON.parse(await fs.readTextFile(fp));
        if (Array.isArray(d.waypoints)) out.push(normalizeTrackRecord(d));
      } catch (_) {}
    }
  } catch (_) {}
  return out;
}
// Open the physical Maps folder in the OS file manager (desktop app only).
async function openMapsFolder() {
  if (!IS_TAURI) return;
  await _tauriEnsureMaps();
  try { await window.__TAURI__.opener.openPath(_tauriMapsDir); }
  catch (e) { console.warn('open maps folder failed', e); }
}

function tracksFolderName() { return _tracksRootHandle ? _tracksRootHandle.name : null; }
function _trackFileName(rec) {
  return (String(rec && rec.name || 'track').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase() || 'track') + '.json';
}
function _serializeTrack(rec) {
  return {
    name: rec.name, waypoints: rec.waypoints, obstacles: rec.obstacles,
    powerups: rec.powerups, wallRegions: rec.wallRegions, laps: rec.laps,
    version: rec.version || 3, created: rec.created,
  };
}
async function _fsWriteTrack(dir, rec) {
  if (!dir) return;
  if (IS_TAURI) return _tauriWriteTrack(dir, rec);
  try {
    const fh = await dir.getFileHandle(_trackFileName(rec), { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(_serializeTrack(rec), null, 2));
    await w.close();
  } catch (e) { console.warn('track write failed', e); }
}
async function _fsDeleteTrack(dir, rec) {
  if (!dir || !rec) return;
  if (IS_TAURI) return _tauriDeleteTrack(dir, rec);
  try { await dir.removeEntry(_trackFileName(rec)); } catch (_) {}
}
async function _fsReadTracks(dir) {
  const out = [];
  if (!dir) return out;
  if (IS_TAURI) return _tauriReadTracks(dir);
  try {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const f = await entry.getFile();
          const d = JSON.parse(await f.text());
          if (Array.isArray(d.waypoints)) { const r = normalizeTrackRecord(d); r._mtime = f.lastModified; out.push(r); }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return out;
}
async function _fsPruneHistory() {
  if (!_historyDirHandle) return;
  try {
    const files = [];
    for await (const entry of _historyDirHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
        try { const f = await entry.getFile(); files.push({ name: entry.name, t: f.lastModified }); } catch (_) {}
      }
    }
    files.sort((a, b) => b.t - a.t);
    for (let i = TRACK_HISTORY_MAX; i < files.length; i++) {
      try { await _historyDirHandle.removeEntry(files[i].name); } catch (_) {}
    }
  } catch (_) {}
}

// Tiny IndexedDB box just to remember the chosen folder handle between sessions.
function _idbStore(mode) {
  return new Promise((res, rej) => {
    let r; try { r = indexedDB.open('rr-fs', 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => { try { r.result.createObjectStore('h'); } catch (_) {} };
    r.onsuccess = () => { try { res(r.result.transaction('h', mode).objectStore('h')); } catch (e) { rej(e); } };
    r.onerror = () => rej(r.error);
  });
}
async function _idbSet(k, v) { try { const s = await _idbStore('readwrite'); s.put(v, k); } catch (_) {} }
async function _idbGet(k) {
  try { const s = await _idbStore('readonly'); return await new Promise(r => { const q = s.get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); }
  catch (_) { return null; }
}

// Let the user pick (or re-pick) the "Saved tracks" folder; creates Local/ + History/.
async function connectTracksFolder() {
  if (!FS_TRACKS_SUPPORTED) {
    alert('Folder access needs Chrome or Edge. Use Import / Export to move .json files instead.\n\n(For automatic folder sync, run the game from a local web server rather than double-clicking the file.)');
    return false;
  }
  try {
    const root = await window.showDirectoryPicker({ id: 'rr-tracks', mode: 'readwrite', startIn: 'documents' });
    _tracksRootHandle = root;
    _localDirHandle = await root.getDirectoryHandle('Local', { create: true });
    _historyDirHandle = await root.getDirectoryHandle('History', { create: true });
    _idbSet('tracksRoot', root);
    return true;
  } catch (e) {
    if (e && e.name !== 'AbortError') alert('Folder connect failed: ' + e.message);
    return false;
  }
}

// On editor open, silently re-attach the folder if the browser still grants it.
async function tryRestoreTracksFolder() {
  if (!FS_TRACKS_SUPPORTED || _tracksRootHandle) return;
  try {
    const root = await _idbGet('tracksRoot');
    if (!root || typeof root.queryPermission !== 'function') return;
    if ((await root.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
    _tracksRootHandle = root;
    _localDirHandle = await root.getDirectoryHandle('Local', { create: true });
    _historyDirHandle = await root.getDirectoryHandle('History', { create: true });
  } catch (_) {}
}

// --- Whole-game folder (audio + saves), chosen once and remembered ---
// Picking the game root lets us read engine .ogg files directly (so the tuned
// buffer/crossfade loops work even from a double-clicked file:// page) and gives
// read/write access to Saved tracks/ for real .json files.
let _gameRootHandle = null;
let _audioEffectsDirHandle = null;

// Read one engine clip straight from the connected Audio/Effects folder.
async function _engineArrayBufferFromFolder(src) {
  if (!_audioEffectsDirHandle) return null;
  try {
    const base = src.split('/').pop();
    const fh = await _audioEffectsDirHandle.getFileHandle(base);
    const f = await fh.getFile();
    return await f.arrayBuffer();
  } catch (_) { return null; }
}

async function _applyGameRoot(root, remember) {
  _gameRootHandle = root;
  // Audio/Effects (read-only use)
  try {
    const audio = await root.getDirectoryHandle('Audio');
    _audioEffectsDirHandle = await audio.getDirectoryHandle('Effects');
  } catch (_) { _audioEffectsDirHandle = null; }
  // Saved tracks/{Local,History}
  try {
    const saves = await root.getDirectoryHandle('Saved tracks', { create: true });
    _tracksRootHandle = saves;
    _localDirHandle = await saves.getDirectoryHandle('Local', { create: true });
    _historyDirHandle = await saves.getDirectoryHandle('History', { create: true });
    _idbSet('tracksRoot', saves);
  } catch (e) { console.warn('saves wire failed', e); }
  if (remember) { try { await _idbSet('gameRoot', root); } catch (_) {} }
  // Re-decode engines now that the files are readable directly.
  Object.values(engineBuffers).forEach(b => { if (!b) return; if (!b.ready) { b.loading = null; b.nextRetryAt = 0; } });
  preloadAllEngines();
}

async function connectGameFolder(remember = true) {
  if (!FS_TRACKS_SUPPORTED) {
    alert('Folder access needs Chrome or Edge. Engine audio still plays via a fallback, and tracks save to browser storage.');
    return false;
  }
  try {
    const root = await window.showDirectoryPicker({ id: 'rr-game', mode: 'readwrite', startIn: 'documents' });
    await _applyGameRoot(root, remember);
    return true;
  } catch (e) {
    if (e && e.name !== 'AbortError') alert('Folder connect failed: ' + e.message);
    return false;
  }
}

async function hasRememberedGameFolder() {
  try { return !!(await _idbGet('gameRoot')); } catch (_) { return false; }
}

// On boot, silently re-attach the remembered game folder if permission is still granted.
async function tryRestoreGameFolder() {
  if (!FS_TRACKS_SUPPORTED || _gameRootHandle) return false;
  try {
    const root = await _idbGet('gameRoot');
    if (!root || typeof root.queryPermission !== 'function') return false;
    if ((await root.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    await _applyGameRoot(root, false);
    return true;
  } catch (_) { return false; }
}

// Re-grant permission on the remembered folder via a user gesture (no re-pick needed).
async function reconnectRememberedGameFolder() {
  if (!FS_TRACKS_SUPPORTED) return false;
  try {
    const root = await _idbGet('gameRoot');
    if (!root || typeof root.requestPermission !== 'function') return false;
    if ((await root.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
    await _applyGameRoot(root, false);
    return true;
  } catch (_) { return false; }
}

// Startup: silently reattach a remembered folder, else prompt for it.
async function initGameFolderGate() {
  const gate = document.getElementById('game-folder-gate');
  if (!gate) return;
  const connectBtn = document.getElementById('gate-connect');
  const skipBtn = document.getElementById('gate-skip');
  const statusEl = document.getElementById('gate-status');
  const hide = () => { gate.style.display = 'none'; };
  const refresh = () => { if (typeof renderLobbyTrackLibrary === 'function') { try { renderLobbyTrackLibrary(); } catch (_) {} } };

  if (!FS_TRACKS_SUPPORTED) { hide(); return; } // engines use fallback, saves use localStorage

  if (await tryRestoreGameFolder()) { hide(); refresh(); return; }

  if (await hasRememberedGameFolder()) {
    connectBtn.textContent = '📂 Reconnect game folder';
    statusEl.textContent = 'A folder is remembered — click to re-grant access for this session.';
  }
  gate.style.display = 'flex';

  connectBtn.onclick = async () => {
    connectBtn.disabled = true;
    let ok = false;
    if (await hasRememberedGameFolder()) ok = await reconnectRememberedGameFolder();
    if (!ok) ok = await connectGameFolder(true);
    connectBtn.disabled = false;
    if (ok) { hide(); refresh(); }
    else statusEl.textContent = 'Pick the folder that directly contains the "Audio" and "Saved tracks" folders.';
  };
  skipBtn.onclick = () => hide();
}

function _trackRead(key) {
  try { const a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; }
  catch(_) { return []; }
}
function _trackWrite(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch(_) {}
}
function _trackId() {
  return 't_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

// Coerce any map-ish object into a clean stored track record.
function normalizeTrackRecord(map, extra) {
  const m = map || {};
  const lapsRaw = Number.isFinite(+m.laps) ? +m.laps : (Number.isFinite(+m.defaultLaps) ? +m.defaultLaps : TRACK_LAPS_DEFAULT);
  return Object.assign({
    id: (typeof m.id === 'string' && m.id) ? m.id : _trackId(),
    name: (typeof m.name === 'string' && m.name.trim()) ? m.name.trim().slice(0, 40) : 'Untitled',
    waypoints: Array.isArray(m.waypoints) ? m.waypoints : [],
    obstacles: Array.isArray(m.obstacles) ? m.obstacles : [],
    powerups: Array.isArray(m.powerups) ? m.powerups : [],
    wallRegions: Array.isArray(m.wallRegions) ? m.wallRegions : [],
    laps: Math.max(1, Math.min(20, Math.round(lapsRaw))),
    version: m.version || 3,
    created: m.created || new Date().toISOString().slice(0, 10),
    savedAt: Date.now(),
  }, extra || {});
}

function getLocalTracks() { return _trackRead(TRACK_LOCAL_KEY); }
function getHistoryTracks() { return _trackRead(TRACK_HISTORY_KEY); }

// Save (or replace by name) a track into the permanent Local folder.
async function saveLocalTrack(map) {
  const rec = normalizeTrackRecord(map);
  if (!rec.waypoints.length) return null;
  if (IS_TAURI) await _tauriEnsureMaps();
  const local = getLocalTracks();
  const i = local.findIndex(t => (t.name || '').toLowerCase() === rec.name.toLowerCase());
  if (i >= 0) { rec.id = local[i].id; local[i] = rec; }
  else local.push(rec);
  _trackWrite(TRACK_LOCAL_KEY, local);
  await _fsWriteTrack(_localDirHandle, rec);
  return rec;
}

async function deleteLocalTrack(rec) {
  const id = (rec && typeof rec === 'object') ? rec.id : rec;
  const name = (rec && typeof rec === 'object') ? (rec.name || '') : null;
  if (IS_TAURI) await _tauriEnsureMaps();
  _trackWrite(TRACK_LOCAL_KEY, getLocalTracks().filter(t =>
    t.id !== id && (!name || (t.name || '').toLowerCase() !== name.toLowerCase())));
  if (rec && typeof rec === 'object') await _fsDeleteTrack(_localDirHandle, rec);
}

// Record a freshly-loaded track into History (newest first, dedup by name, cap 10).
async function recordTrackHistory(map) {
  const rec = normalizeTrackRecord(map);
  if (!rec.waypoints.length) return;
  let hist = getHistoryTracks().filter(t => (t.name || '').toLowerCase() !== rec.name.toLowerCase());
  hist.unshift(rec);
  if (hist.length > TRACK_HISTORY_MAX) hist = hist.slice(0, TRACK_HISTORY_MAX);
  _trackWrite(TRACK_HISTORY_KEY, hist);
  if (_historyDirHandle) { await _fsWriteTrack(_historyDirHandle, rec); await _fsPruneHistory(); }
}

// Download a track record as a .json file (to move it into a real OS folder).
function exportTrackRecord(rec) {
  if (!rec) return;
  const data = {
    name: rec.name, waypoints: rec.waypoints, obstacles: rec.obstacles,
    powerups: rec.powerups, wallRegions: rec.wallRegions, laps: rec.laps,
    version: rec.version || 3, created: rec.created,
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = (rec.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'track') + '.json';
  a.click();
}

loadCustomization();
loadMaps();

function applyAudioSettings() {
  applyMusicMixVolumes();
  countdownVoice.volume = CAR_TUNING.audioCountdownBaseVolume * AUDIO_SETTINGS.fx * AUDIO_SETTINGS.master;
  if (touchControlsRoot) {
    touchControlsRoot.style.display = AUDIO_SETTINGS.touchControls ? 'flex' : 'none';
  }
}

function syncSettingsPlacement(isInGame) {
  const globalAnchor = document.getElementById('global-settings-anchor');
  const hudAnchor = document.getElementById('hud-settings-anchor');
  const btn = document.getElementById('settings-gear-btn');
  if (!globalAnchor || !hudAnchor || !btn) return;
  if (isInGame) {
    hudAnchor.style.display = 'flex';
    hudAnchor.appendChild(btn);
    btn.style.display = '';
    const panel = document.getElementById('settings-panel');
    if (panel) {
      panel.style.left = '';
      panel.style.right = '12px';
    }
  } else {
    // In menus the terminal owns settings (volume / touch commands), so the
    // floating gear is hidden; the panel still exists for the in-game HUD.
    hudAnchor.style.display = 'none';
    globalAnchor.appendChild(btn);
    btn.style.display = 'none';
    const panel = document.getElementById('settings-panel');
    if (panel) {
      panel.style.left = '12px';
      panel.style.right = '';
    }
  }
}

function initSettingsUi() {
  loadAudioSettings();
  const globalAnchor = document.getElementById('global-settings-anchor');
  const panel = document.getElementById('settings-panel');
  if (!globalAnchor || !panel) return;

  const gear = document.createElement('button');
  gear.id = 'settings-gear-btn';
  gear.textContent = '⚙';
  globalAnchor.appendChild(gear);

  const master = document.getElementById('set-master');
  const music = document.getElementById('set-music');
  const fx = document.getElementById('set-fx');
  const touch = document.getElementById('set-touch-controls');
  const mVal = document.getElementById('set-master-val');
  const muVal = document.getElementById('set-music-val');
  const fVal = document.getElementById('set-fx-val');

  const setUiVals = () => {
    if (master) master.value = String(Math.round(AUDIO_SETTINGS.master * 100));
    if (music) music.value = String(Math.round(AUDIO_SETTINGS.music * 100));
    if (fx) fx.value = String(Math.round(AUDIO_SETTINGS.fx * 100));
    if (touch) touch.checked = !!AUDIO_SETTINGS.touchControls;
    if (mVal) mVal.textContent = String(Math.round(AUDIO_SETTINGS.master * 100));
    if (muVal) muVal.textContent = String(Math.round(AUDIO_SETTINGS.music * 100));
    if (fVal) fVal.textContent = String(Math.round(AUDIO_SETTINGS.fx * 100));
  };

  setUiVals();
  applyAudioSettings();
  syncSettingsPlacement(false);

  gear.onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  };
  panel.onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => panel.classList.remove('open'));

  if (master) master.oninput = () => {
    AUDIO_SETTINGS.master = (parseFloat(master.value) || 0) / 100;
    if (mVal) mVal.textContent = master.value;
    applyAudioSettings();
    saveAudioSettings();
  };
  if (music) music.oninput = () => {
    AUDIO_SETTINGS.music = (parseFloat(music.value) || 0) / 100;
    if (muVal) muVal.textContent = music.value;
    applyAudioSettings();
    saveAudioSettings();
  };
  if (fx) fx.oninput = () => {
    AUDIO_SETTINGS.fx = (parseFloat(fx.value) || 0) / 100;
    if (fVal) fVal.textContent = fx.value;
    applyAudioSettings();
    saveAudioSettings();
  };
  if (touch) touch.onchange = () => {
    AUDIO_SETTINGS.touchControls = !!touch.checked;
    applyAudioSettings();
    saveAudioSettings();
  };
}

// ---- Controls / keybind menu ----
let _captureEl = null;
function keyLabel(code) {
  if (!code) return '';
  const map = {
    Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Escape: 'Esc', Backspace: 'Bksp', Tab: 'Tab',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
function padLabel(name) {
  const map = {
    A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT',
    BACK: 'Back', START: 'Start', L3: 'L-Stick', R3: 'R-Stick',
    DUP: 'D-Pad ↑', DDOWN: 'D-Pad ↓', DLEFT: 'D-Pad ←', DRIGHT: 'D-Pad →',
  };
  return name ? (map[name] || name) : '';
}
function makeKeybindSlot(action, slot, text) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'kb-slot' + (text ? '' : ' empty');
  el.textContent = text || '—';
  el.onclick = (e) => { e.stopPropagation(); startBindCapture(action, slot, el); };
  return el;
}
function renderKeybindRows() {
  const wrap = document.getElementById('keybind-rows');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const act of KEYBIND_ACTIONS) {
    const b = KEYBINDS[act.id];
    const row = document.createElement('div');
    row.className = 'keybind-row';
    const lab = document.createElement('div');
    lab.className = 'kb-label';
    lab.textContent = act.label;
    row.appendChild(lab);
    row.appendChild(makeKeybindSlot(act.id, 'key', keyLabel(b.key)));
    row.appendChild(makeKeybindSlot(act.id, 'key2', keyLabel(b.key2)));
    row.appendChild(makeKeybindSlot(act.id, 'pad', padLabel(b.pad)));
    wrap.appendChild(row);
  }
}
function startBindCapture(action, slot, el) {
  cancelBindCapture();
  _captureEl = el;
  el.classList.add('listening');
  el.textContent = slot === 'pad' ? 'press button…' : 'press key…';
  if (slot === 'pad') {
    window._padCapture = { action };
    window._kbCapture = null;
    // The game loop's gamepad poll is idle in menus, so run our own poll while
    // waiting for a controller button press.
    _padCapturePrev = null;
    requestAnimationFrame(padCapturePoll);
  } else {
    window._kbCapture = { action, slot };
    window._padCapture = null;
  }
}
// Independent controller poll used only while rebinding, so capture works even
// when the main game loop (and its pollGamepad) isn't running.
let _padCapturePrev = null;
function padCapturePoll() {
  if (!window._padCapture) { _padCapturePrev = null; return; }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) { if (p) { gp = p; break; } }
  if (gp) {
    const cur = gp.buttons.map(b => (b ? (b.pressed || b.value > 0.5) : false));
    if (_padCapturePrev) {
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] && !_padCapturePrev[i] && GP_NAME[i]) { assignPadBind(GP_NAME[i]); return; }
      }
    }
    _padCapturePrev = cur;
  }
  requestAnimationFrame(padCapturePoll);
}
function finishBindCapture() {
  window._kbCapture = null;
  window._padCapture = null;
  _captureEl = null;
  renderKeybindRows();
}
function cancelBindCapture() {
  if (_captureEl) _captureEl.classList.remove('listening');
  finishBindCapture();
}
function assignKeyBind(code) {
  const cap = window._kbCapture;
  if (!cap) return;
  // Clear this key from any other slot to avoid double-triggering.
  for (const id in KEYBINDS) {
    const b = KEYBINDS[id];
    if (b.key === code && !(id === cap.action && cap.slot === 'key')) b.key = '';
    if (b.key2 === code && !(id === cap.action && cap.slot === 'key2')) b.key2 = '';
  }
  KEYBINDS[cap.action][cap.slot] = code;
  saveKeybinds();
  finishBindCapture();
}
function assignPadBind(name) {
  const cap = window._padCapture;
  if (!cap) return;
  for (const id in KEYBINDS) { if (id !== cap.action && KEYBINDS[id].pad === name) KEYBINDS[id].pad = ''; }
  KEYBINDS[cap.action].pad = name;
  saveKeybinds();
  finishBindCapture();
}
function openKeybindModal() {
  const m = document.getElementById('keybind-modal');
  if (!m) return;
  // Drop focus from any text input (e.g. the terminal) so its keydown handler
  // doesn't swallow the key we're trying to capture.
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {}
  renderKeybindRows();
  m.classList.add('open');
}
function closeKeybindModal() {
  cancelBindCapture();
  const m = document.getElementById('keybind-modal');
  if (m) m.classList.remove('open');
}
window.openKeybindModal = openKeybindModal;
function initKeybindUi() {
  const openBtn = document.getElementById('open-keybinds-btn');
  const modal = document.getElementById('keybind-modal');
  const box = document.getElementById('keybind-box');
  const closeBtn = document.getElementById('keybind-close');
  const doneBtn = document.getElementById('keybind-done');
  const resetBtn = document.getElementById('keybind-reset');
  if (openBtn) openBtn.onclick = (e) => {
    e.stopPropagation();
    const p = document.getElementById('settings-panel');
    if (p) p.classList.remove('open');
    openKeybindModal();
  };
  if (closeBtn) closeBtn.onclick = closeKeybindModal;
  if (doneBtn) doneBtn.onclick = closeKeybindModal;
  if (resetBtn) resetBtn.onclick = () => {
    Object.assign(KEYBINDS, cloneKeybinds(DEFAULT_KEYBINDS));
    saveKeybinds();
    renderKeybindRows();
  };
  if (modal) modal.onclick = (e) => { if (e.target === modal) closeKeybindModal(); };
  if (box) box.onclick = (e) => e.stopPropagation();
}

function playCountdownVoice() {
  try {
    countdownVoice.pause();
    countdownVoice.currentTime = 0;
    countdownVoice.play().catch(()=>{});
  } catch(_) {}
}
// Start on first user interaction (browser autoplay policy)
(function() {
  initSettingsUi();
  initKeybindUi();
  const tryPlay = () => {
    applyAudioSettings();
    menuMusic.play().catch(()=>{});
    audioCtx.resume().catch(()=>{});
    document.removeEventListener('click', tryPlay);
  };
  document.addEventListener('click', tryPlay);
})();

// ---- Engine audio ----
// Engine uses AudioBufferSourceNode for sample-accurate looping.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const ENGINE_DEFAULT_SRC = 'Audio/Effects/drifter engine.ogg';
const ENGINE_NEEDLE_SRC = 'Audio/Effects/needle engine.ogg';
const ENGINE_DRAGGER_SRC = 'Audio/Effects/dragger engine.ogg';
const ENGINE_BOUNCER_PUNCHER_SRC = 'Audio/Effects/puncher engine.ogg';
const ENGINE_COIL_SRC = 'Audio/Effects/coil engine.ogg';
const ENGINE_ROTOR_SRC = 'Audio/Effects/rotor engine.ogg';
const ENGINE_HOLO_SRC = 'Audio/Effects/Holo engine.ogg';
const ENGINE_SCREAMER_SRC = 'Audio/Effects/screamer engine_2.ogg';
const engineNodes = {}; // playerId -> buffer | xfade | fallback dual-audio node

// Per-engine playback tuning, dialled in with engine-test.html.
//   mode 'buffer' -> native gapless loop (source.loop) over the detected window.
//   mode 'xfade'  -> equal-power crossfade loop between loopStart..loopEnd.
const ENGINE_TUNING = {
  [ENGINE_DEFAULT_SRC]:         { mode: 'xfade',  loopStart: 0.000, loopEnd: 8.029, xfade: 0.090 }, // drifter
  [ENGINE_NEEDLE_SRC]:          { mode: 'buffer' },
  [ENGINE_DRAGGER_SRC]:         { mode: 'xfade',  loopStart: 0.000, loopEnd: 2.193, xfade: 0.050 },
  [ENGINE_BOUNCER_PUNCHER_SRC]: { mode: 'xfade',  loopStart: 0.105, loopEnd: 4.029, xfade: 0.035 }, // puncher / baller
  [ENGINE_COIL_SRC]:            { mode: 'xfade',  loopStart: 0.000, loopEnd: 6.468, xfade: 0.235 },
  [ENGINE_ROTOR_SRC]:           { mode: 'xfade',  loopStart: 0.000, loopEnd: 1.657, xfade: 0.875 },
  [ENGINE_HOLO_SRC]:            { mode: 'buffer' },
  [ENGINE_SCREAMER_SRC]:        { mode: 'xfade',  loopStart: 0.003, loopEnd: 0.093, xfade: 0.415, rateIdle: 0.30 },
};

// One decoded buffer "bank" per engine source.
const engineBuffers = {}; // src -> { buffer, ready, loading, nextRetryAt, loopStart, loopEnd }
function engineBankFor(src) {
  if (!engineBuffers[src]) engineBuffers[src] = { buffer: null, ready: false, loading: null, nextRetryAt: 0, loopStart: 0, loopEnd: 0 };
  return engineBuffers[src];
}
function engineCfgFor(src) { return ENGINE_TUNING[src] || { mode: 'buffer' }; }

function engineSrcForCarType(carType) {
  if (carType === 'needle') return ENGINE_NEEDLE_SRC;
  if (carType === 'dragger') return ENGINE_DRAGGER_SRC;
  if (carType === 'baller' || carType === 'puncher') return ENGINE_BOUNCER_PUNCHER_SRC;
  if (carType === 'coil') return ENGINE_COIL_SRC;
  if (carType === 'rotor') return ENGINE_ROTOR_SRC;
  if (carType === 'holo') return ENGINE_HOLO_SRC;
  if (carType === 'screamer') return ENGINE_SCREAMER_SRC;
  return ENGINE_DEFAULT_SRC;
}

function detectBufferLoopWindow(buf) {
  const sr = buf.sampleRate || 44100;
  const n = buf.length || 0;
  if (!n) return { start: 0, end: 0 };
  const ch = Math.max(1, buf.numberOfChannels || 1);
  const channels = [];
  for (let i = 0; i < ch; i++) channels.push(buf.getChannelData(i));
  const threshold = 0.0012;
  const minKeep = Math.max(1, Math.floor(sr * 0.25));

  let first = 0;
  while (first < n) {
    let m = 0;
    for (let c = 0; c < ch; c++) m = Math.max(m, Math.abs(channels[c][first]));
    if (m > threshold) break;
    first++;
  }

  let last = n - 1;
  while (last > 0) {
    let m = 0;
    for (let c = 0; c < ch; c++) m = Math.max(m, Math.abs(channels[c][last]));
    if (m > threshold) break;
    last--;
  }

  if (last - first + 1 < minKeep) return { start: 0, end: buf.duration || 0 };

  // Small guard avoids clipping transients at exact threshold crossings.
  first = Math.max(0, first - 128);
  last = Math.min(n - 1, last + 128);
  return { start: first / sr, end: (last + 1) / sr };
}

function createBufferEngineNodeFrom(buffer, loopStart, loopEnd, srcName) {
  const gain   = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner();
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop   = true;
  if (loopEnd > loopStart + 0.05) {
    source.loopStart = loopStart;
    source.loopEnd = loopEnd;
  }
  source.connect(gain);
  gain.connect(panner);
  panner.connect(audioCtx.destination);
  gain.gain.value = 0.001;
  source.start(0);
  return { source, gain, panner, isBuffer: true, engineSrc: srcName };
}

// ---- Equal-power crossfade looper (Web Audio) ----
// A short look-ahead scheduler tracks the lead voice's position in buffer time and
// triggers the next overlapping voice just-in-time using the CURRENT rate, so changing
// speed rescales the loop endpoints immediately (no gap on speed-up). Driven once per
// frame from updateEngineAudio().
function createXfadeEngineNode(bank, cfg, srcName) {
  const gain   = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner();
  gain.connect(panner);
  panner.connect(audioCtx.destination);
  gain.gain.value = 0.001;
  return {
    isBuffer: false, isXfade: true, engineSrc: srcName,
    buffer: bank.buffer, gain, panner,
    ls: cfg.loopStart, le: cfg.loopEnd, xf: cfg.xfade,
    voices: new Set(),
    leadGain: null,
    anchorCtx: 0, anchorPos: cfg.loopStart,
    rate: 1, started: false,
  };
}

// Spawn one voice that plays [startPos -> loopEnd] once, optionally fading in.
function xfadeSpawnVoice(node, whenCtx, startPos, rate, fadeIn) {
  const ls = node.ls, le = node.le, xf = node.xf;
  const fadeBuf  = Math.min(xf * rate, (le - ls) * 0.49);   // crossfade length, buffer secs
  const fadeReal = fadeBuf / rate;
  const src = audioCtx.createBufferSource();
  const g   = audioCtx.createGain();
  src.buffer = node.buffer;
  src.playbackRate.value = rate;
  src.connect(g); g.connect(node.gain);
  node.voices.add(src);
  src.onended = () => node.voices.delete(src);
  src.start(whenCtx, startPos, (le - startPos) + 0.02);     // play to loopEnd (+tiny tail)
  const steps = 20;
  if (fadeIn) {
    g.gain.setValueAtTime(0.0001, whenCtx);
    for (let i = 0; i <= steps; i++) { const t = i / steps; g.gain.setValueAtTime(Math.max(0.0001, Math.sqrt(t)), whenCtx + t * fadeReal); }
    g.gain.setValueAtTime(1, whenCtx + fadeReal);
  } else {
    g.gain.setValueAtTime(1, whenCtx);
  }
  return g;
}

function xfadeTick(node, rate) {
  const now = audioCtx.currentTime;
  if (!node.started) {
    node.rate = rate;
    node.leadGain = xfadeSpawnVoice(node, now + 0.05, node.ls, rate, true);
    node.anchorCtx = now + 0.05;
    node.anchorPos = node.ls;
    node.started = true;
    return;
  }
  // Re-anchor the tracked playhead whenever the rate changes so endpoints rescale live.
  if (rate !== node.rate) {
    node.anchorPos = node.anchorPos + (now - node.anchorCtx) * node.rate;
    node.anchorCtx = now;
    node.rate = rate;
    for (const src of node.voices) { try { src.playbackRate.setTargetAtTime(rate, now, 0.05); } catch (_) {} }
  }
  const ls = node.ls, le = node.le, xf = node.xf;
  if (!(le > ls)) return;
  const fadeBuf = Math.min(xf * rate, (le - ls) * 0.49);
  const triggerPos = le - fadeBuf;                          // start the successor here
  const leadPos = node.anchorPos + (now - node.anchorCtx) * rate;
  const dt = (triggerPos - leadPos) / rate;                 // real secs until trigger
  if (dt <= 0.12) {
    const startCtx = now + Math.max(0, dt);
    const fadeReal = fadeBuf / rate;
    const steps = 20;
    if (node.leadGain) {                                     // fade the current lead OUT
      const g = node.leadGain;
      g.gain.cancelScheduledValues(startCtx);
      g.gain.setValueAtTime(1, startCtx);
      for (let i = 0; i <= steps; i++) { const t = i / steps; g.gain.setValueAtTime(Math.max(0.0001, Math.sqrt(1 - t)), startCtx + t * fadeReal); }
      g.gain.setValueAtTime(0.0001, startCtx + fadeReal);
    }
    node.leadGain = xfadeSpawnVoice(node, startCtx, ls, rate, true);   // successor fades IN
    node.anchorCtx = startCtx;
    node.anchorPos = ls;
  }
}

function applyEngineLoopWindow(bank, src) {
  const cfg = engineCfgFor(src);
  if (cfg.mode === 'xfade' && cfg.loopEnd > cfg.loopStart) {
    bank.loopStart = cfg.loopStart;
    bank.loopEnd = Math.min(cfg.loopEnd, bank.buffer.duration || cfg.loopEnd);
  } else {
    const win = detectBufferLoopWindow(bank.buffer);
    bank.loopStart = win.start;
    bank.loopEnd = win.end;
  }
}

// Build the tuned node for a source if its buffer is decoded, else a temporary
// HTML-audio fallback while the buffer loads in the background.
function createConfiguredEngineNode(src) {
  const bank = engineBankFor(src);
  const cfg = engineCfgFor(src);
  if (bank.ready && bank.buffer) {
    if (cfg.mode === 'xfade' && bank.loopEnd > bank.loopStart) {
      return createXfadeEngineNode(bank, { loopStart: bank.loopStart, loopEnd: bank.loopEnd, xfade: cfg.xfade }, src);
    }
    return createBufferEngineNodeFrom(bank.buffer, bank.loopStart, bank.loopEnd, src);
  }
  loadEngineBufferFor(src);
  return createHtmlFallbackEngineNode(src);
}

function createHtmlFallbackEngineNode(src) {
  const mk = () => {
    const a = new Audio(src || ENGINE_DEFAULT_SRC);
    a.loop = true;
    a.preload = 'auto';
    a.preservesPitch = false;
    a.mozPreservesPitch = false;
    a.volume = 0;
    return a;
  };
  return {
    a: mk(),
    b: mk(),
    active: 0,
    primed: false,
    crossfading: false,
    crossfadeStart: 0,
    crossfadeMs: 1000,
    isBuffer: false,
    // The Holo engine clip is authored with its own seamless internal loops, so the
    // dual-element crossfade mangles it. Loop a single element instead.
    noCrossfade: (src === ENGINE_HOLO_SRC),
    engineSrc: src || ENGINE_DEFAULT_SRC,
  };
}

function upgradeEngineNodesToBuffer() {
  Object.keys(engineNodes).forEach(id => {
    const n = engineNodes[id];
    if (!n || n.isBuffer || n.isXfade) return;
    const bank = engineBuffers[n.engineSrc];
    if (bank && bank.ready && bank.buffer) {
      [n.a, n.b].forEach(el => { if (!el) return; try { el.pause(); el.src = ''; } catch (_) {} });
      engineNodes[id] = createConfiguredEngineNode(n.engineSrc);
    }
  });
}

function loadEngineBufferFor(src) {
  const bank = engineBankFor(src);
  if (bank.ready && bank.buffer) return Promise.resolve(true);
  if (bank.loading) return bank.loading;
  if (performance.now() < bank.nextRetryAt) return Promise.resolve(false);
  bank.loading = (async () => {
    // Prefer the connected game folder (works from file://), then fall back to the network.
    let arr = await _engineArrayBufferFromFolder(src);

    if (!arr) {
      try {
        const resp = await fetch(src);
        if (resp.ok) arr = await resp.arrayBuffer();
      } catch(_) {}
    }

    if (!arr) {
      arr = await new Promise(resolve => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', src, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => resolve((xhr.status === 200 || xhr.status === 0) ? xhr.response : null);
          xhr.onerror = () => resolve(null);
          xhr.send();
        } catch(_) {
          resolve(null);
        }
      });
    }

    if (arr) {
      try {
        bank.buffer = await audioCtx.decodeAudioData(arr);
        applyEngineLoopWindow(bank, src);
        bank.ready = true;
        bank.loading = null;
        upgradeEngineNodesToBuffer();
        return true;
      } catch(_) {}
    }

    bank.loading = null;
    bank.nextRetryAt = performance.now() + 3000;
    return false;
  })();
  return bank.loading;
}

function preloadAllEngines() { Object.keys(ENGINE_TUNING).forEach(loadEngineBufferFor); }

async function decodeAndApplyEngineArrayBuffer(arr) {
  const src = engineSrcForCarType((G.players && G.myId && G.players[G.myId]) ? G.players[G.myId].carType : null);
  const bank = engineBankFor(src);
  try {
    bank.buffer = await audioCtx.decodeAudioData(arr);
    applyEngineLoopWindow(bank, src);
    bank.ready = true;
    bank.loading = null;
    bank.nextRetryAt = 0;
    upgradeEngineNodesToBuffer();
    return true;
  } catch (_) {
    return false;
  }
}

// Async preload on startup. Once each decodes, players swap to seamless buffer/crossfade loops.
preloadAllEngines();

function createEngineNode(id, carType) {
  const wantedSrc = engineSrcForCarType(carType);
  const existing = engineNodes[id];
  if (existing && existing.engineSrc === wantedSrc) return existing;
  if (existing) removeEngineNode(id);
  const node = createConfiguredEngineNode(wantedSrc);
  engineNodes[id] = node;
  return node;
}

function removeEngineNode(id) {
  const n = engineNodes[id];
  if (!n) return;
  if (n.isXfade) {
    if (n.voices) n.voices.forEach(s => { try { s.stop(); } catch (_) {} });
    try { n.gain.disconnect(); } catch (_) {}
    try { n.panner.disconnect(); } catch (_) {}
  } else if (n.isBuffer) {
    try { n.source.stop(); } catch(_) {}
    n.gain.disconnect();
    n.panner.disconnect();
  } else {
    [n.a, n.b].forEach(el => {
      if (!el) return;
      el.pause();
      el.src = '';
    });
  }
  delete engineNodes[id];
}

// Silence every engine node (buffer + crossfade + html fallback). Used when the race
// ends so the idle engine loop doesn't keep droning under the results screen.
function silenceAllEngines() {
  Object.values(engineNodes).forEach(node => {
    if (!node) return;
    if (node.isBuffer || node.isXfade) {
      try { node.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.04); } catch (_) {}
    } else {
      [node.a, node.b].forEach(el => { if (!el) return; try { el.volume = 0; el.pause(); } catch (_) {} });
      node.crossfading = false;
    }
  });
}

function updateEngineAudio() {
  if (!G.track || !G.myId) return;
  // Only sound engines while the race screen is actually up. After returning to the
  // lobby the game loop keeps running (G.track persists, G.raceOver is reset to false),
  // so without this guard every ship's idle loop would drone under the lobby.
  const gameEl = document.getElementById('game');
  if (!gameEl || gameEl.style.display === 'none') { silenceAllEngines(); return; }
  if (G.raceOver) { silenceAllEngines(); return; }
  if (audioCtx.state === 'suspended') { audioCtx.resume(); return; }
  if (!engineBuffers[ENGINE_DEFAULT_SRC] || !engineBuffers[ENGINE_DEFAULT_SRC].ready) preloadAllEngines();
  const me = G.players[G.myId];
  if (!me) return;

  const W = canvas.width, H = canvas.height;
  const zoom = G.camera.zoom;
  const halfDiag = Math.sqrt((W / 2) ** 2 + (H / 2) ** 2);
  const nowSec = performance.now() * 0.001;

  Object.values(G.players).forEach(p => {
    let node = createEngineNode(p.id, p.carType);
    if (!node) return;

    // Upgrade the temporary HTML fallback to the tuned buffer/crossfade node once decoded.
    if (!node.isBuffer && !node.isXfade) {
      const bank = engineBuffers[node.engineSrc];
      if (bank && bank.ready && bank.buffer) {
        [node.a, node.b].forEach(el => { if (!el) return; try { el.pause(); el.src = ''; } catch (_) {} });
        node = createConfiguredEngineNode(node.engineSrc);
        engineNodes[p.id] = node;
      }
    }

    const isMe = p.id === G.myId;
    const spd  = Math.abs(p.speed || 0);
    const _ecfg = ENGINE_TUNING[node.engineSrc];
    const _idle = (_ecfg && Number.isFinite(_ecfg.rateIdle)) ? _ecfg.rateIdle : CAR_TUNING.engineRateIdle;
    const rate = _idle + (spd / CAR_TUNING.engineRateRefSpeed) * CAR_TUNING.engineRateSpan;

    let vol, pan;
    if (isMe) {
      vol = CAR_TUNING.audioEngineLocalBaseVol + (zoom / 1.4) * CAR_TUNING.audioEngineLocalZoomVolSpan;
      pan = 0;
    } else {
      const sx = (p.x - G.camera.x) * zoom;
      const sy = (p.y - G.camera.y) * zoom;
      pan = Math.max(-1, Math.min(1, (sx / (W / 2)) * CAR_TUNING.audioEnginePanStrength));
      const sd   = Math.sqrt(sx * sx + sy * sy);
      const edge = halfDiag * CAR_TUNING.audioEngineRemoteEdgeRatio;
      vol = sd <= edge
        ? CAR_TUNING.audioEngineRemoteNearVol
        : CAR_TUNING.audioEngineRemoteNearVol * Math.pow(CAR_TUNING.audioEngineRemoteFarFalloffBase, (sd - edge) / halfDiag);
    }

    // Subtle tunable engine loudness wobble for more mechanical texture.
    const idSeed = (p.id || '').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0) * 0.017;
    const noise = 1 + Math.sin(nowSec * (Math.PI * 2) * CAR_TUNING.audioEngineVolumeNoiseHz + idSeed) * CAR_TUNING.audioEngineVolumeNoiseAmp;
    vol = Math.max(0, vol * noise);

    const mix = Math.max(0, Math.min(1, AUDIO_SETTINGS.master * AUDIO_SETTINGS.fx * CAR_TUNING.audioEngineMixBase));
    if (node.isBuffer) {
      node.source.playbackRate.setTargetAtTime(rate, audioCtx.currentTime, 0.05);
      node.gain.gain.setTargetAtTime(vol * mix, audioCtx.currentTime, 0.08);
      node.panner.pan.setTargetAtTime(pan, audioCtx.currentTime, 0.08);
    } else if (node.isXfade) {
      xfadeTick(node, rate);
      node.gain.gain.setTargetAtTime(vol * mix, audioCtx.currentTime, 0.08);
      node.panner.pan.setTargetAtTime(pan, audioCtx.currentTime, 0.08);
    } else {
      const targetVol = Math.max(0, Math.min(1, vol * mix));

      // No-crossfade engines (e.g. Holo): the clip loops seamlessly on its own, so
      // just run one element on loop and let playbackRate scale it with speed.
      if (node.noCrossfade) {
        const el = node.a;
        if (!el) return;
        el.loop = true;
        el.playbackRate = rate;
        if (el.paused) el.play().catch(() => {});
        el.volume = targetVol;
        if (node.b && !node.b.paused) { try { node.b.pause(); } catch (_) {} }
        return;
      }

      const activeEl = node.active === 0 ? node.a : node.b;
      const standbyEl = node.active === 0 ? node.b : node.a;
      if (!activeEl || !standbyEl) return;

      activeEl.playbackRate = rate;
      standbyEl.playbackRate = rate;
      if (activeEl.paused) activeEl.play().catch(() => {});
      if (standbyEl.paused) standbyEl.play().catch(() => {});

      // Keep both loopers continuously running out-of-phase.
      if (!node.primed) {
        const da = activeEl.duration;
        const db = standbyEl.duration;
        if (Number.isFinite(da) && da > 0.5 && Number.isFinite(db) && db > 0.5) {
          standbyEl.currentTime = Math.min(db - 0.1, Math.max(0.1, db * 0.5));
          node.primed = true;
        }
      }

      const d = activeEl.duration;
      if (Number.isFinite(d) && d > 0.2) {
        const overlapSec = CAR_TUNING.audioEngineOverlapSec;
        // Media timeline runs faster at higher playbackRate, so start earlier.
        const lead = Math.min(Math.max(0.25, overlapSec * rate + CAR_TUNING.audioEngineLeadPadSec), Math.max(0.25, d * 0.45));
        node.crossfadeMs = CAR_TUNING.audioEngineCrossfadeMs;

        if (!node.crossfading && activeEl.currentTime >= d - lead) {
          node.crossfading = true;
          node.crossfadeStart = performance.now();
        }

        if (node.crossfading) {
          const t = (performance.now() - node.crossfadeStart) / node.crossfadeMs;
          const k = Math.max(0, Math.min(1, t));
          activeEl.volume = targetVol * (1 - k);
          standbyEl.volume = targetVol * k;
          if (k >= 1) {
            node.active = node.active === 0 ? 1 : 0;
            node.crossfading = false;
          }
        } else {
          activeEl.volume = targetVol;
          standbyEl.volume = 0;
        }
      } else {
        activeEl.loop = true;
        standbyEl.loop = true;
        activeEl.volume = targetVol;
      }
    }
  });

  Object.keys(engineNodes).forEach(id => { if (!G.players[id]) removeEngineNode(id); });
}

function startGame() {
  menuMusic.pause();
  menuMusic.currentTime = 0;
  // Stop the builder theme too and reset the crossfade back to the menu track so
  // music resumes correctly when we return to the lobby/editor later.
  builderMusic.pause();
  builderMusic.currentTime = 0;
  _builderMusicMix = 0;
  _builderMusicTarget = 0;
  applyMusicMixVolumes();
  syncSettingsPlacement(true);
  // Resume AudioContext and seed the local engine node inside this user gesture
  audioCtx.resume().catch(() => {});
  if (!engineBuffers[ENGINE_DEFAULT_SRC] || !engineBuffers[ENGINE_DEFAULT_SRC].ready) preloadAllEngines();
  stopIceSlide();
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  const resultsScr = document.getElementById('results-screen');
  if (resultsScr) resultsScr.style.display = 'none';
  clearPostRaceTimer();
  if (G._upgradePauseTimer) { clearInterval(G._upgradePauseTimer); G._upgradePauseTimer = null; }
  G.upgradePause = { active:false, until:0, choosers:{} };
  G.spectateId = null;
  G.freeCam = false;
  G.viewLayer = 0;
  G._tunnelZoom = 1;
  waitingForUpgrade = false;
  const pauseOv = document.getElementById('upgrade-pause-overlay');
  if (pauseOv) pauseOv.style.display = 'none';
  const upScreen = document.getElementById('upgrade-screen');
  if (upScreen) upScreen.style.display = 'none';
  G.raceStarted = false;
  G.raceOver = false;
  G.finishOrder = [];
  G.upgrades = {};
  G.heldItem = null;
  G.missiles = [];
  G.mines = [];
  G.shells = [];
  G.balls = [];
  G.ghouls = [];
  G.explosions = [];
  G.nukeParticles = [];
  G.checkpointConfetti = [];
  G.snowParticles = [];
  G.brickShards = [];
  G.camera.shakeTime = 0;
  G.camera.shakeMag = 0;
  G.driftTrails = [];
  G.fx = [];
  G.skidMarks = [];
  G.toasts = [];
  G._prevPos = 0;
  G._posSettleT = 0;
  G._goStamp = 0;
  G._cdPrev = -1;
  G._cdStamp = 0;
  G._speedZoom = 1;
  G._finishPunch = 0;
  G._launchHold = 0;
  G._introStart = performance.now();
  G.raceStats = { topSpeed: 0, bestLapMs: null, drifts: 0, itemsUsed: 0, wallHits: 0, dmgTaken: 0 };
  G.ghostRec = null;
  loadBestGhost();
  G._theme = BACKDROP_THEMES[Math.abs(G.seed || 0) % BACKDROP_THEMES.length];
  if (G.track) G.track._vb = null; // recompute intro-flyover bounds per race
  const feedEl = document.getElementById('event-feed');
  if (feedEl) feedEl.innerHTML = '';
  G.countdownVal = 3;
  playCountdownVoice();
  resizeCanvas();
  if (!gameLoopActive) { gameLoopActive = true; requestAnimationFrame(gameLoop); }
  // Countdown
  const countdownTimer = setInterval(()=>{
    G.countdownVal--;
    if (G.countdownVal <= 0) {
      G.raceStarted = true;
      G.raceStartTime = Date.now();
      // Perfect start: reward throttle pressed inside the last ~0.6s of the
      // countdown (too early = nothing, so it's a timing game).
      const hold = G._launchHold || 0;
      const meL = G.players[G.myId];
      if (meL && hold > 0.02 && hold <= 0.6) {
        meL.boosting = Math.max(meL.boosting || 0, 1.3);
        addToast('PERFECT START!', { color: '#4ade80', glow: '#16a34a', size: 30, duration: 1.6 });
        playOvertakeBlip(true);
      }
      clearInterval(countdownTimer);
    }
  }, 1000);
}

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', resizeCanvas);

// Input
function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}

document.addEventListener('keydown', e => {
  // Rebinding: capture the next key press for the Controls menu.
  if (window._kbCapture) {
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') cancelBindCapture();
    else assignKeyBind(e.code);
    return;
  }
  if (window._padCapture && e.code === 'Escape') { cancelBindCapture(); e.preventDefault(); return; }
  // Abandon a track test at any time and return to the Map Maker.
  if (e.code === 'Escape' && G._testMode) { e.preventDefault(); exitTestToEditor(); return; }
  // Exit an in-progress race back to the menu.
  if (e.code === 'Escape' && !G.raceOver) {
    const gameEl = document.getElementById('game');
    if (gameEl && gameEl.style.display !== 'none') { e.preventDefault(); exitRaceToMenu(); return; }
  }
  if (isTypingTarget(e.target)) return;
  G.keys[e.code] = true;
  if (matchBind(KEYBINDS.drift, e.code)) e.preventDefault();
  if (matchBind(KEYBINDS.useItem, e.code)) { e.preventDefault(); itemButtonDown(); }
  if (matchBind(KEYBINDS.ability, e.code)) { e.preventDefault(); doAbility(); }
});
document.addEventListener('keyup', e => { G.keys[e.code] = false; if (matchBind(KEYBINDS.useItem, e.code)) itemButtonUp(); });
