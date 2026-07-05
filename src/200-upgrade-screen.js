// ============================================================
// UPGRADE SCREEN
// ============================================================
let pendingUpgradeResolve = null;
let waitingForUpgrade = false;

function inMultiplayerRace() {
  return !!peer && Object.keys(G.players).length > 1;
}

function showUpgradeScreen() {
  if (waitingForUpgrade) return;
  waitingForUpgrade = true;
  G.raceStarted = false;
  const screen = document.getElementById('upgrade-screen');
  screen.style.display = 'flex';
  const cards = document.getElementById('upgrade-cards');
  cards.innerHTML='';

  // Pause the game for everyone while this player picks (multiplayer only).
  if (inMultiplayerRace()) {
    const me = G.players[G.myId];
    requestUpgradePause(G.myId, me ? me.name : 'Racer');
  }

  // Pick 3 random upgrades
  const shuffled = [...UPGRADES].sort(()=>Math.random()-0.5).slice(0,3);
  shuffled.forEach(up=>{
    const card = document.createElement('div');
    card.className='upgrade-card';
    card.innerHTML=`<div class="upgrade-icon">${iconSvg(up.id, 30) || up.icon}</div><div class="upgrade-name">${up.name}</div><div class="upgrade-desc">${up.desc}</div>`;
    card.onclick=()=>{
      const me = G.players[G.myId];
      if (me) {
        if(!me.upgrades)me.upgrades=[];
        me.upgrades.push(up.id);
        if(!G.upgrades[G.myId])G.upgrades[G.myId]=[];
        G.upgrades[G.myId].push(up.id);
        broadcast({ type:'upgrade_chosen', id:G.myId, upgrade:up.id });
      }
      screen.style.display='none';
      waitingForUpgrade=false;
      finishMyUpgradeChoice();
    };
    cards.appendChild(card);
  });
}

// ---- Synchronized upgrade pause (Phase 5) ----
// The host is authoritative: it tracks who is choosing and a single 5s window.
function requestUpgradePause(id, name) {
  if (G.isHost) hostAddUpgradeChooser(id, name);
  else sendToHost({ type:'upgrade_pause_req', id, name });
}
function finishMyUpgradeChoice() {
  if (!inMultiplayerRace()) { if (!G.raceOver) G.raceStarted = true; return; }
  if (G.isHost) hostRemoveUpgradeChooser(G.myId);
  else sendToHost({ type:'upgrade_pause_done', id:G.myId });
  // If the global pause already ended, make sure our car resumes.
  if (!G.upgradePause.active && !G.raceOver) G.raceStarted = true;
}
function hostAddUpgradeChooser(id, name) {
  if (!G.isHost) return;
  G.upgradePause.choosers[id] = name || 'Racer';
  if (!G.upgradePause.active) {
    G.upgradePause.active = true;
    G.upgradePause.until = Date.now() + 5000;
    if (G._upgradePauseTimer) clearInterval(G._upgradePauseTimer);
    G._upgradePauseTimer = setInterval(() => {
      if (Date.now() >= G.upgradePause.until || !Object.keys(G.upgradePause.choosers).length) {
        hostEndUpgradePause();
      }
    }, 200);
  }
  hostBroadcastPauseState();
}
function hostRemoveUpgradeChooser(id) {
  if (!G.isHost) return;
  delete G.upgradePause.choosers[id];
  if (!Object.keys(G.upgradePause.choosers).length) hostEndUpgradePause();
  else hostBroadcastPauseState();
}
function hostBroadcastPauseState() {
  if (!G.isHost) return;
  const payload = { type:'game_pause', choosers: { ...G.upgradePause.choosers }, until: G.upgradePause.until };
  sendToAll(payload);
  applyPauseState(payload.choosers, payload.until);
}
function hostEndUpgradePause() {
  if (!G.isHost) return;
  if (G._upgradePauseTimer) { clearInterval(G._upgradePauseTimer); G._upgradePauseTimer = null; }
  G.upgradePause.active = false;
  G.upgradePause.choosers = {};
  sendToAll({ type:'game_resume' });
  applyResumeFromPause();
}
function applyPauseState(choosers, until) {
  G.upgradePause.choosers = choosers || {};
  G.upgradePause.until = until || 0;
  G.upgradePause.active = Object.keys(G.upgradePause.choosers).length > 0 && Date.now() < G.upgradePause.until;
  if (G.upgradePause.active && !G.raceOver) G.raceStarted = false;
  updateUpgradePauseOverlay();
}
function applyResumeFromPause() {
  G.upgradePause.active = false;
  G.upgradePause.choosers = {};
  if (!G.raceOver && G.track) G.raceStarted = true;
  updateUpgradePauseOverlay();
}
function clearUpgradePause() {
  if (G._upgradePauseTimer) { clearInterval(G._upgradePauseTimer); G._upgradePauseTimer = null; }
  G.upgradePause = { active:false, until:0, choosers:{} };
  const overlay = document.getElementById('upgrade-pause-overlay');
  if (overlay) overlay.style.display = 'none';
}
function updateUpgradePauseOverlay() {
  const overlay = document.getElementById('upgrade-pause-overlay');
  if (!overlay) return;
  const names = Object.values(G.upgradePause.choosers || {});
  // The local player sees their own upgrade cards, not the overlay.
  const showOverlay = G.upgradePause.active && names.length > 0 && !waitingForUpgrade;
  if (!showOverlay) { overlay.style.display = 'none'; return; }
  overlay.style.display = 'flex';
  const remaining = Math.max(0, Math.ceil((G.upgradePause.until - Date.now()) / 1000));
  const titleEl = document.getElementById('up-pause-title');
  const timerEl = document.getElementById('up-pause-timer');
  if (titleEl) {
    const list = names.join(', ');
    titleEl.textContent = names.length > 1
      ? `${list} are choosing upgrades!`
      : `${list} is choosing an upgrade!`;
  }
  if (timerEl) timerEl.textContent = `${remaining}s`;
}
