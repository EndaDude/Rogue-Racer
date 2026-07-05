// ============================================================
// RESULTS
// ============================================================
function showResults() {
  if (G.raceOver) return;
  G.raceOver = true;
  G.raceStarted = false;
  G.spectateId = null;
  clearUpgradePause();
  stopIceSlide();
  silenceAllEngines();
  setTimeout(()=>{
    const screen = document.getElementById('results-screen');
    screen.style.display='flex';
    if (window.crtWinFlash) window.crtWinFlash();
    const me = G.players[G.myId];
    const myPos = G.finishOrder.indexOf(G.myId)+1;
    const title = document.getElementById('results-title');
    if (myPos===1) { title.textContent='🏆 You Win!'; title.style.color='#fbbf24'; }
    else if (myPos>0) { title.textContent=`You finished ${myPos}${['st','nd','rd'][myPos-1]||'th'}`; title.style.color='#c084fc'; }
    else { title.textContent='Race Over!'; title.style.color='#c084fc'; }

    // Personal race stats strip.
    const rs = G.raceStats;
    const statsEl = document.getElementById('results-stats');
    if (statsEl && rs) {
      statsEl.style.display = 'flex';
      statsEl.innerHTML =
        `<span>🏎️ Top speed <b>${Math.round(rs.topSpeed || 0)}</b></span>` +
        `<span>⏱️ Best lap <b>${rs.bestLapMs ? formatFinishTime(rs.bestLapMs) : '—'}</b></span>` +
        `<span>🌀 Drifts <b>${rs.drifts || 0}</b></span>` +
        `<span>🎁 Items <b>${rs.itemsUsed || 0}</b></span>` +
        `<span>💢 Damage <b>${Math.round(rs.dmgTaken || 0)}</b></span>` +
        `<span>🧱 Wall hits <b>${rs.wallHits || 0}</b></span>`;
    } else if (statsEl) {
      statsEl.style.display = 'none';
    }
    // Winner gets the confetti drop.
    if (myPos === 1) spawnWinConfetti(screen);

    const finishers = G.finishOrder.map(id=>G.players[id]).filter(Boolean);
    const dnf = Object.values(G.players).filter(p=>!G.finishOrder.includes(p.id));
    const allPlayers = [...finishers, ...dnf];

    // Cinematic podium (top 3 finishers)
    const podium = document.getElementById('results-podium');
    if (podium) {
      const medals=['🥇','🥈','🥉'];
      podium.innerHTML='';
      finishers.slice(0,3).forEach((p,i)=>{
        const col=document.createElement('div');
        col.className=`podium-col p${i+1}`;
        col.innerHTML=`<div class="pc-medal">${medals[i]}</div>`
          +`<div class="pc-dot" style="background:${p.color}"></div>`
          +`<div class="pc-name">${(p.name||'Racer').replace(/[<>&]/g,'')}</div>`
          +`<div class="pc-time">${formatFinishTime(p.finishElapsedMs)}</div>`
          +`<div class="pc-stand">${i+1}</div>`;
        podium.appendChild(col);
      });
      podium.style.display = finishers.length ? 'flex' : 'none';
    }

    const list = document.getElementById('results-list');
    list.innerHTML='';
    allPlayers.forEach((p,i)=>{
      const row = document.createElement('div');
      row.className='results-row';
      const medals=['🥇','🥈','🥉'];
      const isFinisher = G.finishOrder.includes(p.id);
      const timeTxt = isFinisher ? formatFinishTime(p.finishElapsedMs) : 'DNF';
      const meTag = p.id===G.myId ? ' (you)' : '';
      row.innerHTML=`<div class="results-pos">${isFinisher ? (medals[i]||i+1) : '—'}</div>`
        +`<div style="width:10px;height:10px;border-radius:50%;background:${p.color}"></div>`
        +`<div class="results-name">${(p.name||'Racer').replace(/[<>&]/g,'')}${meTag}</div>`
        +`<div class="results-time${isFinisher?'':' dnf'}">${timeTxt}</div>`;
      list.appendChild(row);
    });
    setupPostRaceUI();
  }, 500);
}

function formatFinishTime(ms) {
  if (!ms || ms < 0) return '—';
  const total = Math.floor(ms / 10); // centiseconds
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

// ---- Post-race queue flow (Phase 3) ----
function clearPostRaceTimer() {
  if (G._postRaceTimer) { clearInterval(G._postRaceTimer); G._postRaceTimer = null; }
}
function updateResultsNextUI(name, seconds, ready, total) {
  const el = document.getElementById('results-next');
  if (el) {
    const loopTxt = G._postRaceLoop ? ' <span style="color:var(--muted)">(queue looped)</span>' : '';
    el.innerHTML = `Next: <b>${name || '—'}</b>${loopTxt} &nbsp;·&nbsp; auto-advance in <b>${Math.max(0, seconds|0)}s</b>`;
  }
  const rc = document.getElementById('results-ready-count');
  if (rc && total != null) rc.textContent = `${ready}/${total} ready · all ready = skip`;
}
function setupPostRaceUI() {
  const inRoom = !!peer;
  const playAgain = document.getElementById('play-again-btn');
  const nextInfo = document.getElementById('results-next');
  const readyRow = document.getElementById('results-ready-row');
  const hostRow = document.getElementById('results-host-row');
  const shipPick = document.getElementById('results-ship-pick');
  const hostSettings = document.getElementById('results-host-settings');
  const editorBtn = document.getElementById('results-editor-btn');
  if (!inRoom) {
    if (playAgain) playAgain.style.display = '';
    if (nextInfo) nextInfo.style.display = 'none';
    if (readyRow) readyRow.style.display = 'none';
    if (hostRow) hostRow.style.display = 'none';
    if (shipPick) shipPick.style.display = 'none';
    if (hostSettings) hostSettings.style.display = 'none';
    if (editorBtn) editorBtn.style.display = G._testMode ? '' : 'none';
    return;
  }
  if (editorBtn) editorBtn.style.display = 'none';
  if (playAgain) playAgain.style.display = 'none';
  if (nextInfo) nextInfo.style.display = '';
  if (readyRow) readyRow.style.display = 'flex';
  if (hostRow) hostRow.style.display = G.isHost ? 'flex' : 'none';
  if (shipPick) shipPick.style.display = 'flex';
  if (hostSettings) hostSettings.style.display = G.isHost ? 'flex' : 'none';
  renderResultsShipGrid();
  if (G.isHost) syncResultsHostSettings();
  const me = G.players[G.myId]; if (me) me.postReady = false;
  const rb = document.getElementById('results-ready-btn');
  if (rb) { rb.textContent = 'Ready'; rb.style.borderColor = ''; }
  if (G.isHost) hostBeginPostRaceTimer();
}

// Post-race ship reselection (each player picks their own ship for the next race).
function renderResultsShipGrid() {
  const grid = document.getElementById('results-ship-grid');
  if (!grid) return;
  if (!carTypeSelectable(G.selectedCarType)) G.selectedCarType = firstSelectableCarType();
  grid.innerHTML = '';
  Object.keys(CAR_TYPES).forEach(t => {
    const cfg = CAR_TYPES[t];
    // Hide prototypes entirely when the host has them locked; otherwise show state.
    if (isPrototypeShip(t) && G.allowPrototypes === false) return;
    const ok = carTypeSelectable(t);
    const btn = document.createElement('button');
    btn.className = 'car-type-btn' + (ok && t === G.selectedCarType ? ' active' : '');
    btn.disabled = !ok;
    btn.innerHTML = `<strong>${cfg.name}</strong>`;
    btn.onclick = () => {
      if (!ok) return;
      G.selectedCarType = t;
      const me = G.players[G.myId];
      if (me) me.carType = t;
      if (G.isHost) { updateHostPlayerList(); sendLobbySync(); }
      else { sendToHost({ type:'player_profile', id:G.myId, name:me?me.name:'Racer', color:me?me.color:PLAYER_COLORS[0], carType:t, paintTag:me?me.paintTag:'' }); }
      renderResultsShipGrid();
    };
    grid.appendChild(btn);
  });
}

// Mirror current host match settings into the results-screen controls.
function syncResultsHostSettings() {
  const sc = document.getElementById('results-speed-class');
  const lp = document.getElementById('results-laps');
  const mb = document.getElementById('results-mode-btn');
  if (sc) sc.value = G.speedClass;
  if (lp) lp.value = G.lobbyLaps || 3;
  if (mb) mb.textContent = `Mode: ${G.hostMode === 'vote' ? 'Vote' : 'Owner'}`;
}
function hostBroadcastPostRace() {
  if (!G.isHost) return;
  const players = Object.values(G.players);
  const ready = players.filter(p => p.postReady).length;
  const total = players.length;
  sendToAll({ type:'post_race', name: G._postRaceName, seconds: G._postRaceRemaining, ready, total, loop: G._postRaceLoop });
  updateResultsNextUI(G._postRaceName, G._postRaceRemaining, ready, total);
}
function hostBeginPostRaceTimer() {
  if (!G.isHost) return;
  clearPostRaceTimer();
  Object.values(G.players).forEach(p => p.postReady = false);
  const preview = peekNextQueueMap();
  G._postRaceName = preview.name;
  G._postRaceLoop = preview.loop;
  G._postRaceRemaining = 30;
  hostBroadcastPostRace();
  G._postRaceTimer = setInterval(() => {
    G._postRaceRemaining--;
    if (G._postRaceRemaining <= 0) { hostAdvanceQueue(); return; }
    hostBroadcastPostRace();
  }, 1000);
}
function hostCheckPostReady() {
  if (!G.isHost) return;
  const players = Object.values(G.players);
  const total = players.length;
  const ready = players.filter(p => p.postReady).length;
  hostBroadcastPostRace();
  if (total > 0 && ready >= total) hostAdvanceQueue();
}
function hostReturnToMenu() {
  if (!G.isHost) return;
  clearPostRaceTimer();
  sendToAll({ type:'return_to_lobby' });
  doReturnToLobby();
}
function doReturnToLobby() {
  clearPostRaceTimer();
  clearUpgradePause();
  G.raceOver = false; G.raceStarted = false; G.finishOrder = [];
  const results = document.getElementById('results-screen'); if (results) results.style.display = 'none';
  document.getElementById('game').style.display = 'none';
  document.getElementById('lobby').style.display = 'flex';
  lobbyMain.style.display = 'none';
  lobbyRoomWrap.style.display = 'flex';
  if (G.isHost) {
    lobbyHost.style.display = '';
    if (lobbyTracks) lobbyTracks.style.display = '';
    if (lobbyCustomize) lobbyCustomize.style.display = '';
    Object.values(G.players).forEach(p => { p.ready = (p.id === G.myId); p.postReady = false; });
    updateHostPlayerList(); renderLobbyQueue(); renderLobbyPending(); refreshVoteSelectors();
    renderLobbyTrackLibrary();
  } else {
    if (lobbyCustomize) lobbyCustomize.style.display = '';
    lobbyJoin.style.display = '';
    const panel = document.getElementById('join-room-panel'); if (panel) panel.style.display = 'flex';
    const me = G.players[G.myId];
    if (me) { me.ready = false; me.postReady = false; }
    const rbtn = document.getElementById('ready-toggle-btn');
    if (rbtn) { rbtn.textContent = 'Ready: No'; rbtn.style.borderColor = ''; }
  }
  // Return to the CRT terminal front-end (with the lobby window), not the bare DOM lobby.
  if (window.__crtShowTerminal) window.__crtShowTerminal();
  if (window.__crtOpenLobby) window.__crtOpenLobby();
  if (window.crtWinFlash) window.crtWinFlash();
}

// Leave an in-progress race and return to the lobby/menu (bound to Escape).
function exitRaceToMenu() {
  if (G._testMode || G.raceOver) return;                 // handled elsewhere / already at results
  const gameEl = document.getElementById('game');
  if (!gameEl || gameEl.style.display === 'none') return; // only while the race is on screen
  if (!window.confirm('Exit race and return to the menu?')) return;
  try { silenceAllEngines(); } catch (_) {}
  if (G.isHost) hostReturnToMenu();                       // host/solo: end the race and return
  else doReturnToLobby();                                 // client: leave back to the lobby
}

document.getElementById('zoom-slider').oninput = function() {
  G.camera.zoom = parseFloat(this.value);
  try { localStorage.setItem('rr-zoom', String(G.camera.zoom)); } catch (_) {}
};

document.getElementById('engine-load-btn').onclick = () => {
  const fi = document.getElementById('engine-file-input');
  if (fi) fi.click();
};

document.getElementById('engine-file-input').onchange = async function() {
  const file = this.files && this.files[0];
  if (!file) return;
  try {
    const arr = await file.arrayBuffer();
    const ok = await decodeAndApplyEngineArrayBuffer(arr);
    if (!ok) console.warn('[engine] manual file decode failed');
  } catch (_) {
    console.warn('[engine] manual file load failed');
  }
  this.value = '';
};

// Restore the saved zoom level so it persists across sessions.
(function restoreZoom() {
  try {
    const raw = localStorage.getItem('rr-zoom');
    if (raw == null) return;
    const z = parseFloat(raw);
    const slider = document.getElementById('zoom-slider');
    if (Number.isFinite(z) && slider) {
      const clamped = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), z));
      G.camera.zoom = clamped;
      slider.value = String(clamped);
    }
  } catch (_) {}
})();

document.getElementById('play-again-btn').onclick = ()=>{
  document.getElementById('results-screen').style.display='none';
  if (G.isHost) {
    // reset and relaunch — preserve custom map if one is loaded
    const seed = Date.now()%100000;
    G.track = G.customMap
      ? generateTrackFromWaypoints(G.customMap.waypoints, seed, G.customMap.obstacles || [], G.customMap.powerups || [], G.customMap.wallRegions || [])
      : generateTrack(seed);
    if (G.customMap) recordTrackHistory(G.customMap);
    Object.values(G.players).forEach((p,i)=>{
      const sp=safeSpawnState(i,G.track);
      p.x=sp.x;p.y=sp.y;p.angle=sp.angle;
      p.lap=1;p.lapProgress=0;p.speed=0;p.vx=0;p.vy=0;
      p.maxHealth=carMaxHealth(p.carType);p.health=p.maxHealth;p.deathRespawn=0;p.invuln=0;
      p.finished=false;p.stun=0;p.boosting=0;p.ghostMode=0;p.shielded=false;p.oilSlick=0;
      p.heldItem=null;p.upgrades=[];
      p.drifting=false; p.driftTrailTimer=0;
      p.driftBoostStack=0; p.driftShakePhase=0;
      p.driftSteerSign=0; p.driftFlipTimer=0; p.driftFlipCount=0;
      p.driftCommitTimer=0; p.driftNoBoostTimer=0;
      p.driftPenaltyTimer=0;
      p.rampIgnore={};
      p.slopeSide={};
      p.nextCheckpoint=0;
      p.checkpointsDoneThisLap=false;
      p.lastCheckpointTime=0;p.lastLapTime=0;
      p.finishElapsedMs=0;
      p.layer=sp.layer;p.airTime=0;p.lastRampKey='';p.bridgeTransitionGrace=sp.grace;
      p.slopeSide={};
      p.layerFallSpeed=0;p.layerFallProgress=0;
    });
    G.finishOrder=[];G.raceOver=false;G.raceStarted=false;G.heldItem=null;G.driftTrails=[];G.mines=[];G.explosions=[];
    G.nukeParticles=[];G.checkpointConfetti=[];G.snowParticles=[];G.brickShards=[];
    G.camera.shakeTime=0;G.camera.shakeMag=0;
    // Juice-system resets (this path skips startGame, so mirror them here).
    G.fx=[];G.skidMarks=[];G.toasts=[];
    G._prevPos=0;G._goStamp=0;G._cdPrev=-1;G._finishPunch=0;G._launchHold=0;
    G._introStart=performance.now();
    G.raceStats={topSpeed:0,bestLapMs:null,drifts:0,itemsUsed:0,wallHits:0,dmgTaken:0};
    G.ghostRec=null;G.seed=seed;loadBestGhost();
    G._theme=BACKDROP_THEMES[Math.abs(seed||0)%BACKDROP_THEMES.length];
    if(G.track)G.track._vb=null;
    Object.values(G.players).forEach(p=>{p._lapClock=0;p._idxF=null;p._speed=0;p._itemT=6+Math.random()*8;p.invuln=2.0;});
    const feedEl2=document.getElementById('event-feed');
    if(feedEl2)feedEl2.innerHTML='';
    G.totalLaps = resolveRaceLaps(G.customMap);
    G.countdownVal=3;
    playCountdownVoice();
    updatePowerupHud();
    const msg = {type:'start_race',seed,players:G.players,laps:G.totalLaps};
    if (G.customMap) msg.customMap = G.customMap;
    sendToAll(msg);
    // local countdown (with the same perfect-start timing check as startGame)
    const t=setInterval(()=>{
      G.countdownVal--;
      if(G.countdownVal<=0){
        G.raceStarted=true;G.raceStartTime=Date.now();
        const hold=G._launchHold||0;
        const meL=G.players[G.myId];
        if(meL&&hold>0.02&&hold<=0.6){
          meL.boosting=Math.max(meL.boosting||0,1.3);
          addToast('PERFECT START!',{color:'#4ade80',glow:'#16a34a',size:30,duration:1.6});
          playOvertakeBlip(true);
        }
        clearInterval(t);
      }
    },1000);
  }
};

document.getElementById('results-ready-btn').onclick = () => {
  const me = G.players[G.myId];
  if (!me) return;
  me.postReady = !me.postReady;
  const rb = document.getElementById('results-ready-btn');
  rb.textContent = me.postReady ? 'Ready ✓' : 'Ready';
  rb.style.borderColor = me.postReady ? 'rgba(34,197,94,0.6)' : '';
  if (G.isHost) hostCheckPostReady();
  else sendToHost({ type:'post_race_ready', id:G.myId, ready:me.postReady });
};
document.getElementById('results-next-btn').onclick = () => { if (G.isHost) hostAdvanceQueue(); };
document.getElementById('results-menu-btn').onclick = () => { if (G.isHost) hostReturnToMenu(); };
document.getElementById('results-editor-btn').onclick = () => exitTestToEditor();

// Host match-settings controls on the post-race screen (mirror lobby settings).
document.getElementById('results-speed-class').onchange = function() {
  if (!G.isHost) return;
  G.speedClass = this.value;
  G.speedScale = speedClassScale(G.speedClass);
  if (speedClassSel) speedClassSel.value = G.speedClass;
  sendLobbySync();
  updateHostPlayerList();
};
document.getElementById('results-laps').onchange = function() {
  if (!G.isHost) return;
  let n = Math.round(parseInt(this.value, 10));
  if (!Number.isFinite(n)) n = 3;
  n = Math.max(1, Math.min(20, n));
  this.value = n;
  G.lobbyLaps = n;
  if (hostLapsInput) hostLapsInput.value = n;
};
document.getElementById('results-mode-btn').onclick = function() {
  if (!G.isHost) return;
  G.hostMode = G.hostMode === 'owner' ? 'vote' : 'owner';
  if (hostModeIndicator) hostModeIndicator.value = G.hostMode === 'vote' ? 'Vote' : 'Owner';
  this.textContent = `Mode: ${G.hostMode === 'vote' ? 'Vote' : 'Owner'}`;
  sendLobbySync();
  refreshVoteSelectors();
  updateHostPlayerList();
};

// Spectate controls — cycle camera among still-racing players after you finish.
function liveRacerIds() {
  return Object.values(G.players).filter(p => !p.finished).map(p => p.id);
}
function cycleSpectate(dir) {
  const ids = liveRacerIds();
  if (!ids.length) { G.spectateId = null; return; }
  G.freeCam = false; // picking a racer leaves free-cam mode
  let idx = G.spectateId ? ids.indexOf(G.spectateId) : -1;
  idx = (idx + dir + ids.length) % ids.length;
  G.spectateId = ids[idx];
  updateSpectateBar();
}
function updateSpectateBar() {
  const bar = document.getElementById('spectate-bar');
  if (!bar) return;
  const me = G.players[G.myId];
  const others = liveRacerIds().filter(id => id !== G.myId);
  const show = !!me && me.finished && !G.raceOver && G.raceStarted && others.length > 0 && !!peer;
  if (!show) {
    bar.style.display = 'none';
    if (me && me.finished && G.spectateId) { /* keep target until results */ }
    return;
  }
  bar.style.display = 'flex';
  const target = G.spectateId && G.players[G.spectateId] ? G.players[G.spectateId] : null;
  const nameEl = document.getElementById('spectate-name');
  if (nameEl) nameEl.textContent = G.freeCam ? 'Free cam' : (target ? (target.name || 'Racer') : 'Free cam');
  const freeBtn = document.getElementById('spectate-self');
  if (freeBtn) freeBtn.classList.toggle('active', !!G.freeCam);
}
document.getElementById('spectate-prev').onclick = () => cycleSpectate(-1);
document.getElementById('spectate-next').onclick = () => cycleSpectate(1);
document.getElementById('spectate-self').onclick = () => {
  // Toggle a free-flying camera you can pan with the movement keys.
  G.freeCam = !G.freeCam;
  G.spectateId = null;
  updateSpectateBar();
};
