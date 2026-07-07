// ============================================================
// GAME ENGINE
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const minimapCanvas = document.getElementById('minimap');
const mmCtx = minimapCanvas.getContext('2d');

// ---- Menu music ----
const menuMusic = new Audio('Audio/Tracks/menu.ogg');
menuMusic.loop = true;
// menu1 (the main menu theme) is scaled down from the shared music base (normalized).
const MENU1_VOLUME_SCALE = 0.34;
menuMusic.volume = 0.5 * MENU1_VOLUME_SCALE;
// Track Builder theme. Crossfades in/out over the main menu music while the map
// editor is open. The file is authored to loop seamlessly, so plain loop=true is fine.
const builderMusic = new Audio('Audio/Tracks/menu2.ogg');
builderMusic.loop = true;
builderMusic.volume = 0;
// Crossfade state: 0 = full menu music, 1 = full builder music.
let _builderMusicMix = 0;
let _builderMusicTarget = 0;
let _builderFadeLast = 0;
const BUILDER_FADE_PER_SEC = 0.55; // ~1.8s to fully crossfade
const countdownVoice = new Audio('Audio/Effects/321go.ogg');
countdownVoice.volume = 0.08;

// ---- Sampled combat / shield SFX (played via playSfxSample / fadeShieldLoop in
// 120-procedural-sound-effects.js). Volume is applied per-play from AUDIO_SETTINGS. ----
const sfxMachineGun = new Audio('Audio/Effects/Machine gun bullet.ogg');
const sfxShell      = new Audio('Audio/Effects/shell.ogg');
const sfxShieldLoop = new Audio('Audio/Effects/sheild long.ogg'); // shield-active ambience (fades in/out)
sfxShieldLoop.loop = true;
sfxShieldLoop.volume = 0;
const sfxShieldDown = new Audio('Audio/Effects/shield down.ogg');  // shield expires / is lost
const sfxShieldHit  = new Audio('Audio/Effects/shield hit.ogg');   // shield blocks a hit

// Turn the Track Builder theme on/off. Both tracks keep playing during the fade so the
// transition is smooth; the menu track resumes underneath when the builder fades out.
function setBuilderMusic(on) {
  _builderMusicTarget = on ? 1 : 0;
  if (on) {
    try { builderMusic.play().catch(() => {}); } catch (_) {}
  } else {
    try { menuMusic.play().catch(() => {}); } catch (_) {}
  }
}

// Applies the current crossfade mix to both tracks' volumes, respecting audio settings.
function applyMusicMixVolumes() {
  const base = CAR_TUNING.audioMenuMusicBaseVolume * AUDIO_SETTINGS.music * AUDIO_SETTINGS.master;
  menuMusic.volume = base * (1 - _builderMusicMix) * MENU1_VOLUME_SCALE;
  builderMusic.volume = base * _builderMusicMix;
}

function _updateBuilderCrossfade(ts) {
  requestAnimationFrame(_updateBuilderCrossfade);
  if (!_builderFadeLast) _builderFadeLast = ts;
  const dt = Math.min(0.1, (ts - _builderFadeLast) / 1000);
  _builderFadeLast = ts;
  if (_builderMusicMix === _builderMusicTarget) return;
  const dir = _builderMusicTarget > _builderMusicMix ? 1 : -1;
  _builderMusicMix = Math.max(0, Math.min(1, _builderMusicMix + dir * BUILDER_FADE_PER_SEC * dt));
  if (Math.abs(_builderMusicMix - _builderMusicTarget) < 0.001) _builderMusicMix = _builderMusicTarget;
  applyMusicMixVolumes();
  if (_builderMusicMix === 0) { try { builderMusic.pause(); } catch (_) {} }
}
requestAnimationFrame(_updateBuilderCrossfade);

const AUDIO_SETTINGS = {
  master: 1,
  music: 0.7,
  fx: 0.85,
  touchControls: true,
  lowFx: false, // "Low FX" graphics-quality toggle (persisted); see `fx` terminal cmd
};
let touchControlsRoot = null;

function loadAudioSettings() {
  try {
    const raw = localStorage.getItem('rr-settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      if (Number.isFinite(s.master)) AUDIO_SETTINGS.master = Math.max(0, Math.min(1, s.master));
      if (Number.isFinite(s.music)) AUDIO_SETTINGS.music = Math.max(0, Math.min(1, s.music));
      if (Number.isFinite(s.fx)) AUDIO_SETTINGS.fx = Math.max(0, Math.min(1, s.fx));
      if (typeof s.touchControls === 'boolean') AUDIO_SETTINGS.touchControls = s.touchControls;
      if (typeof s.lowFx === 'boolean') AUDIO_SETTINGS.lowFx = s.lowFx;
    }
  } catch(_) {}
}

function saveAudioSettings() {
  try { localStorage.setItem('rr-settings', JSON.stringify(AUDIO_SETTINGS)); } catch(_) {}
}

// ---- Rebindable controls (keyboard + controller) ----
// Every driving/action input flows through a named action. Each action has a
// primary key, an optional secondary key, and a controller button. Users can
// remap all of these from the Controls menu; bindings persist in localStorage.
const KEYBIND_ACTIONS = [
  { id: 'throttle',     label: 'Accelerate' },
  { id: 'brake',        label: 'Brake / Reverse' },
  { id: 'steerLeft',    label: 'Steer Left' },
  { id: 'steerRight',   label: 'Steer Right' },
  { id: 'drift',        label: 'Drift' },
  { id: 'velocityLock', label: 'Velocity Lock' },
  { id: 'useItem',      label: 'Use Item' },
  { id: 'ability',      label: 'Ship Ability' },
  { id: 'reset',        label: 'Reset (hold)' },
];
// Continuous inputs the controller keeps setting each frame (edge actions such
// as item/holo/honk fire once and are handled separately).
const DRIVE_ACTIONS = ['throttle', 'brake', 'steerLeft', 'steerRight', 'drift', 'velocityLock', 'reset'];
const DEFAULT_KEYBINDS = {
  throttle:     { key: 'KeyW',      key2: 'ArrowUp',    pad: 'RT' },
  brake:        { key: 'KeyS',      key2: 'ArrowDown',  pad: 'LT' },
  steerLeft:    { key: 'KeyA',      key2: 'ArrowLeft',  pad: 'DLEFT' },
  steerRight:   { key: 'KeyD',      key2: 'ArrowRight', pad: 'DRIGHT' },
  drift:        { key: 'Space',     key2: '',           pad: 'A' },
  velocityLock: { key: 'ShiftLeft', key2: 'ShiftRight', pad: 'LB' },
  useItem:      { key: 'KeyE',      key2: '',           pad: 'X' },
  ability:      { key: 'KeyF',      key2: '',           pad: 'B' },
  reset:        { key: 'KeyR',      key2: '',           pad: 'Y' },
};
const KEYBINDS = {};
function cloneKeybinds(src) {
  const o = {};
  for (const k in src) o[k] = { key: src[k].key, key2: src[k].key2, pad: src[k].pad };
  return o;
}
function loadKeybinds() {
  Object.assign(KEYBINDS, cloneKeybinds(DEFAULT_KEYBINDS));
  try {
    const raw = localStorage.getItem('rr-keybinds');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      for (const k in KEYBINDS) {
        const v = s[k];
        if (v && typeof v === 'object') {
          if (typeof v.key === 'string') KEYBINDS[k].key = v.key;
          if (typeof v.key2 === 'string') KEYBINDS[k].key2 = v.key2;
          if (typeof v.pad === 'string') KEYBINDS[k].pad = v.pad;
        }
      }
    }
  } catch (_) {}
}
function saveKeybinds() {
  try { localStorage.setItem('rr-keybinds', JSON.stringify(KEYBINDS)); } catch (_) {}
}
loadKeybinds();

// True if a keyboard key currently down matches the action's bound key(s).
function kbHeld(action) {
  const b = KEYBINDS[action];
  if (!b) return false;
  return !!(G.keys[b.key] || (b.key2 && G.keys[b.key2]));
}
// True if the pressed code is one of the action's bound keys.
function matchBind(b, code) { return !!b && (code === b.key || (b.key2 && code === b.key2)); }

// ---- Persistent client identity + saved customization & maps ----
function getClientUid() {
  let uid = '';
  try { uid = localStorage.getItem('rr-client-uid') || ''; } catch(_) {}
  if (!uid) {
    uid = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem('rr-client-uid', uid); } catch(_) {}
  }
  return uid;
}
const CLIENT_UID = getClientUid();
