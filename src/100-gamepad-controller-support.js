// ============================================================
// GAMEPAD / CONTROLLER SUPPORT
// Drive with a controller and navigate menus. Driving is analog (left stick
// steer + triggers throttle/brake); menus use a spatial focus navigator.
// Standard mapping (Xbox-style):
//   Left stick / D-pad  -> steer (and menu navigation)
//   RT (7)              -> accelerate     LT (6) -> brake/reverse
//   A (0)               -> drift / confirm in menus
//   X (2)               -> use item       LB (4) -> velocity lock (Shift)
//   Y (3)               -> hold to reset (self-destruct)
//   B (1)               -> back (menus)
// ============================================================
G.pad = { connected: false, steer: 0, throttle: 0, brake: 0, index: null, prev: {}, navCooldown: 0, focusEl: null };
const GP = { A:0, B:1, X:2, Y:3, LB:4, RB:5, LT:6, RT:7, BACK:8, START:9, L3:10, R3:11, DUP:12, DDOWN:13, DLEFT:14, DRIGHT:15 };
const GP_NAME = {}; for (const k in GP) GP_NAME[GP[k]] = k;

window.addEventListener('gamepadconnected', e => { G.pad.index = e.gamepad.index; });
window.addEventListener('gamepaddisconnected', e => {
  if (G.pad.index === e.gamepad.index) { G.pad.index = null; G.pad.connected = false; G.pad.steer = 0; clearGamepadFocus(); }
});

function getActiveGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  if (G.pad.index != null && pads[G.pad.index]) return pads[G.pad.index];
  for (const p of pads) { if (p) { G.pad.index = p.index; return p; } }
  return null;
}
function padBtn(gp, i) { const b = gp.buttons[i]; return b ? (b.pressed || b.value > 0.5) : false; }
function padTrigger(gp, i) { const b = gp.buttons[i]; return b ? (b.pressed || b.value > 0.18) : false; }
// Named-binding helpers: resolve a controller button name (e.g. 'RT') to its
// live pressed / analog / rising-edge state so bindings can be remapped freely.
function padNamePressed(gp, name) { const i = GP[name]; return i == null ? false : padBtn(gp, i); }
function padNameEdge(gp, name) { const i = GP[name]; return i == null ? false : padEdge(gp, i); }
// Pressure-sensitive 0..1 trigger reading (DualShock L2/R2 + Xbox LT/RT are analog).
function padAxisTrigger(gp, i) {
  const b = gp.buttons[i];
  if (!b) return 0;
  let v = b.value;
  if (b.pressed && v < 0.05) v = 1; // some pads report digital-pressed with no value
  return v < 0.05 ? 0 : (v - 0.05) / 0.95;
}
function padEdge(gp, i) { const now = padBtn(gp, i); const was = !!G.pad.prev[i]; return now && !was; }

function isGamepadDriving() {
  const game = document.getElementById('game');
  if (!game || game.style.display === 'none') return false;
  if (!(G.raceStarted && !G.raceOver)) return false;
  for (const id of ['upgrade-screen', 'results-screen']) {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none' && el.offsetParent !== null) return false;
  }
  return true;
}

function pollGamepad(dt) {
  const gp = getActiveGamepad();
  if (!gp) { if (G.pad.connected) { G.pad.connected = false; G.pad.steer = 0; releaseGamepadDriveKeys(); } return; }
  G.pad.connected = true;

  // Rebinding: capture the next controller button press for the Controls menu.
  if (window._padCapture) {
    for (let i = 0; i < gp.buttons.length; i++) {
      if (padEdge(gp, i) && GP_NAME[i]) { assignPadBind(GP_NAME[i]); break; }
    }
    for (let i = 0; i < gp.buttons.length; i++) G.pad.prev[i] = padBtn(gp, i);
    return;
  }

  // Analog steering from the left stick (with deadzone + rescale).
  let ax = gp.axes[0] || 0;
  const dz = 0.18;
  ax = Math.abs(ax) < dz ? 0 : (ax - Math.sign(ax) * dz) / (1 - dz);
  G.pad.steer = Math.max(-1, Math.min(1, ax));

  if (isGamepadDriving()) {
    gamepadDrive(gp);
    if (G.pad.focusEl) clearGamepadFocus();
  } else {
    releaseGamepadDriveKeys();
    gamepadMenu(gp, dt);
  }
  for (let i = 0; i < gp.buttons.length; i++) G.pad.prev[i] = padBtn(gp, i);
}

function setPadKey(code, val) { G.keys[code] = !!val; }
function setBoundKey(action, val) { const b = KEYBINDS[action]; if (b && b.key) G.keys[b.key] = !!val; }
function releaseGamepadDriveKeys() {
  for (const a of DRIVE_ACTIONS) { const b = KEYBINDS[a]; if (b && b.key && G.keys[b.key]) G.keys[b.key] = false; }
  G.pad.throttle = 0; G.pad.brake = 0;
}

function gamepadDrive(gp) {
  // Pressure-sensitive triggers when bound to analog triggers; digital press
  // (1/0) for any other bound button. Drive inputs feed the keyboard-bound key
  // so the shared driving code reads them uniformly.
  const analog = (name) => {
    if (name === 'LT' || name === 'RT') return padAxisTrigger(gp, GP[name]);
    return padNamePressed(gp, name) ? 1 : 0;
  };
  const rt = analog(KEYBINDS.throttle.pad);
  const lt = analog(KEYBINDS.brake.pad);
  G.pad.throttle = rt;
  G.pad.brake = lt;
  setBoundKey('throttle', rt > 0.12);   // gate opens past a tiny dead press; amount stays analog
  setBoundKey('brake', lt > 0.12);
  setBoundKey('steerLeft', padNamePressed(gp, KEYBINDS.steerLeft.pad));
  setBoundKey('steerRight', padNamePressed(gp, KEYBINDS.steerRight.pad));
  setBoundKey('drift', padNamePressed(gp, KEYBINDS.drift.pad));
  setBoundKey('velocityLock', padNamePressed(gp, KEYBINDS.velocityLock.pad));
  setBoundKey('reset', padNamePressed(gp, KEYBINDS.reset.pad));
  {
    const itemNow = padNamePressed(gp, KEYBINDS.useItem.pad);
    if (itemNow && !G._padItemPrev) itemButtonDown();
    else if (!itemNow && G._padItemPrev) itemButtonUp();
    G._padItemPrev = itemNow;
  }
  if (padNameEdge(gp, KEYBINDS.ability.pad)) doAbility();
}

// ---- Menu navigation ----
function gpVisible(el) {
  if (!el) return false;
  if (el.tagName !== 'BODY' && el.offsetParent === null) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
function activeMenuContainer() {
  for (const id of ['upgrade-screen', 'results-screen', 'lobby', 'game']) {
    const el = document.getElementById(id);
    if (gpVisible(el)) return el;
  }
  return document.body;
}
function getGamepadFocusables() {
  const c = activeMenuContainer();
  const sel = 'button:not([disabled]), select:not([disabled]), input[type=range], input[type=checkbox], .upgrade-card, .car-type-btn, [data-gp-focus]';
  return Array.from(c.querySelectorAll(sel)).filter(gpVisible);
}
function clearGamepadFocus() { if (G.pad.focusEl) { G.pad.focusEl.classList.remove('gp-focus'); G.pad.focusEl = null; } }
function setGamepadFocus(el) {
  if (G.pad.focusEl === el) return;
  if (G.pad.focusEl) G.pad.focusEl.classList.remove('gp-focus');
  G.pad.focusEl = el;
  if (el) { el.classList.add('gp-focus'); try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
}
function gpFindInDirection(cur, list, dir) {
  if (!cur) return list[0];
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const rr = el.getBoundingClientRect();
    const x = rr.left + rr.width / 2, y = rr.top + rr.height / 2;
    const dx = x - cx, dy = y - cy;
    let primary, secondary;
    if (dir === 'left') { if (dx > -4) continue; primary = -dx; secondary = Math.abs(dy); }
    else if (dir === 'right') { if (dx < 4) continue; primary = dx; secondary = Math.abs(dy); }
    else if (dir === 'up') { if (dy > -4) continue; primary = -dy; secondary = Math.abs(dx); }
    else { if (dy < 4) continue; primary = dy; secondary = Math.abs(dx); }
    const score = primary + secondary * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}
function gpAdjustSelect(sel, dir) {
  const n = sel.options.length; if (!n) return;
  const i = Math.max(0, Math.min(n - 1, sel.selectedIndex + dir));
  if (i !== sel.selectedIndex) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); }
}
function gpAdjustRange(r, dir) {
  const step = parseFloat(r.step) || 1, min = parseFloat(r.min) || 0, max = parseFloat(r.max) || 100;
  const v = Math.max(min, Math.min(max, parseFloat(r.value) + dir * step));
  if (v !== parseFloat(r.value)) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }
}
function gamepadBack() {
  const c = activeMenuContainer();
  const back = c.querySelector('[data-gp-back], #join-back-btn, #results-menu-btn, #map-editor-back');
  if (back && gpVisible(back)) back.click();
}
function gamepadMenu(gp, dt) {
  G.pad.navCooldown = Math.max(0, G.pad.navCooldown - dt);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const left = padBtn(gp, GP.DLEFT) || ax < -0.5;
  const right = padBtn(gp, GP.DRIGHT) || ax > 0.5;
  const up = padBtn(gp, GP.DUP) || ay < -0.5;
  const down = padBtn(gp, GP.DDOWN) || ay > 0.5;

  const focusables = getGamepadFocusables();
  if (!focusables.length) { clearGamepadFocus(); return; }
  if (!G.pad.focusEl || focusables.indexOf(G.pad.focusEl) === -1) setGamepadFocus(focusables[0]);
  const cur = G.pad.focusEl;

  if (G.pad.navCooldown <= 0) {
    if (cur && cur.tagName === 'SELECT' && (left || right)) { gpAdjustSelect(cur, right ? 1 : -1); G.pad.navCooldown = 0.18; }
    else if (cur && cur.type === 'range' && (left || right)) { gpAdjustRange(cur, right ? 1 : -1); G.pad.navCooldown = 0.10; }
    else if (left || right || up || down) {
      const dir = up ? 'up' : down ? 'down' : left ? 'left' : 'right';
      const next = gpFindInDirection(cur, focusables, dir);
      if (next) { setGamepadFocus(next); G.pad.navCooldown = 0.16; }
    }
  }
  if (padEdge(gp, GP.A) && cur) cur.click();
  if (padEdge(gp, GP.B)) gamepadBack();
}
