// ============================================================
// NETWORKING (PeerJS — no server or port forwarding needed)
// ============================================================
let peer = null, hostConn = null, guestConns = [];

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Create one Peer and settle exactly once (open / error / timeout). A stale
// half-dead peer from an earlier failed attempt is destroyed first — leaving it
// around is the classic "hosting silently never works again" state.
function _makePeerOnce(id, timeoutMs) {
  return new Promise((res, rej) => {
    try { if (peer) { peer.destroy(); } } catch (_) {}
    peer = null;
    let p;
    try { p = id ? new Peer(id) : new Peer(); }
    catch (e) { rej(new Error('PeerJS failed to start (' + (e && e.message) + ')')); return; }
    peer = p;
    let settled = false;
    const done = (ok, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      if (ok) res(val);
      else { try { p.destroy(); } catch (_) {} if (peer === p) peer = null; rej(val); }
    };
    const to = setTimeout(() => done(false, Object.assign(new Error('signaling server timeout — check firewall / antivirus / VPN'), { type: 'timeout' })), timeoutMs || 12000);
    p.on('open', (pid) => done(true, pid));
    p.on('error', (e) => done(false, Object.assign(new Error((e && e.type) || 'peer error'), { type: e && e.type })));
  });
}

// Host setup with layered fallbacks so hosting works on every machine that can
// reach the PeerJS broker at all (i.e. any machine that can JOIN can also HOST):
//  1) claim rogueracer-<code>   — retried with fresh codes
//  2) anonymous peer            — broker-assigned id becomes the (long) room code
// Returns the room code guests should type.
async function initHostPeer(code) {
  let lastErr = null;
  let tryCode = code;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await _makePeerOnce('rogueracer-' + tryCode.toLowerCase(), 9000);
      return tryCode;
    } catch (e) {
      lastErr = e;
      // A network-level failure won't be cured by a different id — bail to the
      // clear error immediately instead of burning retries.
      if (e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'browser-incompatible')) break;
      tryCode = makeRoomCode();
    }
  }
  // Fallback: anonymous peer. The broker picks the id, which always succeeds
  // when the broker is reachable; the full id doubles as the room code.
  try {
    const pid = await _makePeerOnce(null, 9000);
    return String(pid);
  } catch (e2) {
    throw new Error('Could not reach the multiplayer server ('
      + ((lastErr && lastErr.message) || (e2 && e2.message) || 'unknown')
      + '). Check firewall/antivirus, VPN, or try another network.');
  }
}

function initGuestPeer() {
  return new Promise((res, rej) => {
    peer = new Peer();
    peer.on('open', id => res(id));
    peer.on('error', e => rej(e));
  });
}

function sendToAll(data) {
  guestConns.forEach(c => { try { c.send(data); } catch(_){} });
}
function sendToHost(data) {
  if (hostConn) try { hostConn.send(data); } catch(_){}
}
function broadcast(data) {
  if (G.isHost) sendToAll(data);
  else sendToHost(data);
}

function onData(data, fromId) {
  if (data.type === 'missile_spawn') {
    G.missiles.push(data.missile);
    if (G.isHost) guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } });
  } else if (data.type === 'shell_spawn') {
    if (!G.shells) G.shells = [];
    G.shells.push(data.shell);
    if (G.isHost) guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } });
  } else if (data.type === 'ball_spawn') {
    if (!G.balls) G.balls = [];
    G.balls.push(data.ball);
    if (G.isHost) guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } });
  } else if (data.type === 'bullet_spawn') {
    if (!G.bullets) G.bullets = [];
    G.bullets.push(data.bullet);
    if (G.isHost) guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } });
  } else if (data.type === 'ghoul_spawn') {
    if (!G.ghouls) G.ghouls = [];
    G.ghouls.push(data.ghoul);
    if (G.isHost) guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } });
  } else if (data.type === 'drain_start') {
    // Only the tethered victim resolves the drain locally.
    if (data.targetId === G.myId) {
      const me = G.players[G.myId];
      if (me) { me.drain = CAR_TUNING.drainDuration; me.drainedBy = data.ownerId; }
    }
    if (G.isHost) guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } });
  } else if (data.type === 'player_join') {
    normalizePlayerState(data.player);
    G.players[data.player.id] = data.player;
    updateHostPlayerList();
  } else if (data.type === 'chat') {
    if (window.__crtChat) window.__crtChat(data.name || 'Racer', data.text || '', data.color || '#39ff14');
    try { speakChat(data.name || 'Racer', data.text || '', data.voice || null); } catch (_) {}
    if (G.isHost) { guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } }); }
  } else if (data.type === 'kicked' && !G.isHost) {
    try { if (peer) peer.destroy(); } catch(_) {}
    peer = null; hostConn = null;
    G.players = {};
    lobbyRoomWrap.style.display = 'none';
    lobbyHost.style.display = 'none';
    lobbyJoin.style.display = 'none';
    if (lobbyCustomize) lobbyCustomize.style.display = 'none';
    if (lobbyTracks) lobbyTracks.style.display = 'none';
    lobbyMain.style.display = '';
    const panel = document.getElementById('join-room-panel');
    if (panel) panel.style.display = 'none';
    if (joinStatus) { joinStatus.textContent = 'You were kicked by the host.'; joinStatus.className = 'status-msg err'; }
    if (window.crtwm) { try { window.crtwm.close('lobby'); } catch(_){} }
    if (window.__crtPrint) window.__crtPrint('You were kicked by the host.', 'err');
  } else if (data.type === 'players_sync') {
    const myState = G.players[G.myId]; // preserve local player state
    G.players = data.players;
    Object.values(G.players).forEach(normalizePlayerState);
    if (myState) G.players[G.myId] = myState;
    if (data.speedClass && SPEED_CLASSES[data.speedClass]) {
      G.speedClass = data.speedClass;
      G.speedScale = speedClassScale(data.speedClass);
    }
    if (data.hostMode === 'owner' || data.hostMode === 'vote') G.hostMode = data.hostMode;
    if (Array.isArray(data.mapQueue)) G.mapQueue = data.mapQueue;
    if (data.mapVotes && typeof data.mapVotes === 'object') G.mapVotes = data.mapVotes;
    updateHostPlayerList();
    renderLobbyQueue();
    renderLobbyPending();
    refreshVoteSelectors();
  } else if (data.type === 'start_race') {
    G.seed = data.seed;
    G.speedClass = SPEED_CLASSES[data.speedClass] ? data.speedClass : 'neighborhood';
    G.speedScale = speedClassScale(G.speedClass);
    G.totalLaps = Number.isFinite(data.laps) ? Math.max(1, Math.min(20, data.laps)) : 3;
    G.players = data.players;
    Object.values(G.players).forEach(normalizePlayerState);
    G.track = data.selectedMap
      ? generateTrackFromWaypoints(data.selectedMap.waypoints, data.seed, data.selectedMap.obstacles || [], data.selectedMap.powerups || [], data.selectedMap.wallRegions || [])
      : data.customMap
      ? generateTrackFromWaypoints(data.customMap.waypoints, data.seed, data.customMap.obstacles || [], data.customMap.powerups || [], data.customMap.wallRegions || [])
      : generateTrack(data.seed);
    const _histMap = data.selectedMap || data.customMap;
    if (_histMap) recordTrackHistory(_histMap);
    if (window.__crtRaceBoot) window.__crtRaceBoot(data.seed, startGame); else startGame();
  } else if (data.type === 'lobby_sync') {
    if (data.players) {
      G.players = data.players;
      Object.values(G.players).forEach(normalizePlayerState);
    }
    if (data.speedClass && SPEED_CLASSES[data.speedClass]) {
      G.speedClass = data.speedClass;
      G.speedScale = speedClassScale(data.speedClass);
    }
    if (data.hostMode === 'owner' || data.hostMode === 'vote') G.hostMode = data.hostMode;
    if (Number.isFinite(data.laps)) G.lobbyLaps = data.laps;
    if (Array.isArray(data.mapQueue)) G.mapQueue = data.mapQueue;
    if (Array.isArray(data.pendingMaps)) G.pendingMaps = data.pendingMaps;
    if (data.mapVotes && typeof data.mapVotes === 'object') G.mapVotes = data.mapVotes;
    if (Array.isArray(data.allowedCarTypes) && data.allowedCarTypes.length) {
      G.allowedCarTypes = data.allowedCarTypes;
      refreshShipGrid();
    }
    if (typeof data.allowPrototypes === 'boolean') {
      G.allowPrototypes = data.allowPrototypes;
      refreshShipGrid();
    }
    updateHostPlayerList();
    renderLobbyQueue();
    renderLobbyPending();
    refreshVoteSelectors();
  } else if (data.type === 'player_profile' && G.isHost) {
    const p = G.players[data.id];
    if (p) {
      if (typeof data.name === 'string') p.name = data.name.slice(0, 16) || 'Racer';
      if (typeof data.carType === 'string' && CAR_TYPES[data.carType]) {
        p.carType = carTypeSelectable(data.carType) ? data.carType : firstSelectableCarType();
      }
      if (typeof data.color === 'string') p.color = data.color;
      if (typeof data.paintTag === 'string' && data.paintTag) p.paintTag = data.paintTag;
      updateHostPlayerList();
      sendLobbySync();
    }
  } else if (data.type === 'player_ready' && G.isHost) {
    const p = G.players[data.id];
    if (p) {
      p.ready = !!data.ready;
      updateHostPlayerList();
      sendLobbySync();
    }
  } else if (data.type === 'map_vote' && G.isHost) {
    if (typeof data.mapId === 'string' || data.mapId === '') G.mapVotes[data.id] = data.mapId || '';
    sendLobbySync();
  } else if (data.type === 'map_submit' && G.isHost) {
    if (data.map && Array.isArray(data.map.waypoints) && data.map.waypoints.length >= 4) {
      const mapId = 'q_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      G.pendingMaps.push({ id: mapId, fromId: data.id, fromName: data.fromName || 'Guest', map: data.map });
      renderLobbyPending();
      const idx = G.pendingMaps.length;
      if (window.__crtPrint) {
        window.__crtPrint('\u{1F4E9} ' + (data.fromName || 'Guest') + ' uploaded map "' + (data.map.name || 'Unnamed') + '"', 'hi');
        window.__crtPrint('   type  accept ' + idx + '  or  reject ' + idx + '   (list with "pending")', 'dim');
      }
      if (window.crtWinFlash) window.crtWinFlash();
    }
  } else if (data.type === 'player_update') {
    if (data.id !== G.myId) {
      const p = G.players[data.id];
      if (p) {
        const s = data.state;
        // Position/heading are interpolated (see updateRemotePlayers) to kill the
        // rubber-banding you get from snapping straight to each throttled packet.
        // Everything else (lap, health, ability flags…) is applied immediately.
        for (const k in s) {
          if (k === 'x' || k === 'y' || k === 'angle') continue;
          p[k] = s[k];
        }
        p._netX = s.x; p._netY = s.y; p._netAngle = s.angle;
        p._netSpeed = s.speed || 0;
        p._netTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        // First packet (or a fresh spawn): snap so we don't glide in from (0,0).
        if (p.x === undefined || p._netInit !== true) {
          p.x = s.x; p.y = s.y; p.angle = s.angle; p._netInit = true;
        }
      }
    }
  } else if (data.type === 'cone_push') {
    if (G.track && G.track.obstacles && G.track.obstacles[data.idx]) {
      const obs = G.track.obstacles[data.idx];
      if (obs.type === 'cone') {
        ensureObstacleRuntime(obs);
        obs.bx = data.x; obs.by = data.y;
        obs.vx = data.vx || 0; obs.vy = data.vy || 0;
        obs.x = obs.bx; obs.y = obs.by;
      }
    }
    // Host relays a guest's cone push to every OTHER guest so it slides for all.
    if (G.isHost) guestConns.forEach(c => { if (c.peer !== data.id) { try { c.send(data); } catch(_){} } });
  } else if (data.type === 'item_used') {
    handleItemEffect(data);
  } else if (data.type === 'oil_placed') {
    if (G.track) G.track.oilSlicks.push(data.slick);
  } else if (data.type === 'mine_placed') {
    G.mines.push(data.mine);
  } else if (data.type === 'mine_exploded') {
    const idx = G.mines.findIndex(m => m.id === data.id);
    if (idx >= 0) G.mines.splice(idx, 1);
    spawnExplosion(data.x, data.y, data.radius || 90, 'mine');
    addScreenShake(7, 0.2);
    const me = G.players[G.myId];
    if (me && dist(me.x, me.y, data.x, data.y) <= (data.radius || 90) * 0.6) {
      applyDamage(me, CAR_TUNING.mineDamage / Math.max(0.5, getCarTypeCfg(me.carType).weaponResist || 1), 'mine');
    }
  } else if (data.type === 'pulse_blast') {
    spawnExplosion(data.x, data.y, data.radius || 95, 'pulse');
    addScreenShake(5, 0.12);
    applyPulseBlast(data);
  } else if (data.type === 'death_explosion') {
    spawnExplosion(data.x, data.y, data.radius || CAR_TUNING.deathExplosionRadius, 'death');
    addScreenShake(CAR_TUNING.deathExplosionShake, 0.35);
    const me = G.players[G.myId];
    if (me && data.id !== G.myId && me.deathRespawn <= 0 && (me.layer || 0) === (data.layer || 0)) {
      const r = data.radius || CAR_TUNING.deathExplosionRadius;
      const d = dist(me.x, me.y, data.x, data.y);
      if (d <= r) {
        const falloff = 0.4 + 0.6 * (1 - d / r);   // full at the center, 40% at the rim
        applyDamage(me, (CAR_TUNING.deathExplosionDamage * falloff) / Math.max(0.5, getCarTypeCfg(me.carType).crashResist || 1), 'death_blast');
      }
    }
  } else if (data.type === 'honk') {
    const me = G.players[G.myId];
    if (me && data.id !== G.myId && (me.layer || 0) === (data.layer || 0) &&
        dist(me.x, me.y, data.x, data.y) <= CAR_TUNING.screamerHonkRange) {
      me.tunnelVision = Math.max(me.tunnelVision || 0, CAR_TUNING.screamerHonkTunnelSec);
      // The scream also drags you down: an instant speed cut plus a lingering slow.
      me.screamSlow = Math.max(me.screamSlow || 0, CAR_TUNING.screamerHonkSlowSec);
      me.vx *= CAR_TUNING.screamerHonkInstantCut;
      me.vy *= CAR_TUNING.screamerHonkInstantCut;
      me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
    }
  } else if (data.type === 'zap') {
    spawnExplosion(data.x, data.y, 70, 'pulse');
    addScreenShake(4, 0.14);
    const me = G.players[G.myId];
    if (me && data.id !== G.myId && me.deathRespawn <= 0 && (me.layer || 0) === (data.layer || 0)) {
      const d = dist(me.x, me.y, data.x, data.y);
      if (d <= CAR_TUNING.coilArcVictimRange * 1.5) {
        applyDamage(me, (data.damage || 18) / Math.max(0.5, getCarTypeCfg(me.carType).weaponResist || 1), 'arc');
        me.wobble = Math.min(1, (me.wobble || 0) + 1.2);
      }
    }
  } else if (data.type === 'flip') {
    spawnExplosion(data.x, data.y, 60, 'pulse');
    const me = G.players[G.myId];
    if (me && data.id !== G.myId && me.deathRespawn <= 0 && (me.layer || 0) === (data.layer || 0)) {
      if (dist(me.x, me.y, data.x, data.y) <= CAR_TUNING.holoFlipRange) {
        // Reverse both facing and momentum so the ship is genuinely flipped around.
        me.angle += Math.PI;
        me.vx = -(me.vx || 0);
        me.vy = -(me.vy || 0);
        addScreenShake(3, 0.12);
      }
    }
  } else if (data.type === 'shockwave') {
    spawnExplosion(data.x, data.y, CAR_TUNING.puncherShockRadius, 'pulse');
    spawnFxBurst(data.x, data.y, data.layer || 0, 'emp');
    addScreenShake(4, 0.16);
    const me = G.players[G.myId];
    if (me && data.id !== G.myId && me.deathRespawn <= 0 && (me.layer || 0) === (data.layer || 0)) {
      const R = CAR_TUNING.puncherShockRadius;
      const dx = me.x - data.x, dy = me.y - data.y;
      const d = Math.hypot(dx, dy);
      if (d <= R && d > 1e-3) {
        const nx = dx / d, ny = dy / d;
        const afx = Math.cos(data.angle || 0), afy = Math.sin(data.angle || 0);
        const axis = Math.abs(nx * afx + ny * afy); // 1 = front/back, 0 = sides
        const push = CAR_TUNING.puncherShockPush * (1 - d / R) * (1 + CAR_TUNING.puncherShockAxisBonus * axis);
        me.vx += nx * push;
        me.vy += ny * push;
        me.speed = Math.sqrt(me.vx * me.vx + me.vy * me.vy);
        applyDamage(me, CAR_TUNING.puncherShockDamage / Math.max(0.5, getCarTypeCfg(me.carType).crashResist || 1), 'shock');
      }
    }
  } else if (data.type === 'player_finished') {
    if (!G.finishOrder.includes(data.id)) {
      G.finishOrder.push(data.id);
      const fp = G.players[data.id];
      if (fp) { fp.finished = true; if (Number.isFinite(data.time)) fp.finishElapsedMs = data.time; }
      checkRaceOver();
    }
  } else if (data.type === 'post_race_ready') {
    if (G.isHost) {
      const p = G.players[data.id];
      if (p) p.postReady = !!data.ready;
      hostCheckPostReady();
    }
  } else if (data.type === 'post_race') {
    if (!G.isHost) {
      G._postRaceLoop = !!data.loop;
      updateResultsNextUI(data.name, data.seconds, data.ready, data.total);
    }
  } else if (data.type === 'return_to_lobby') {
    if (!G.isHost) doReturnToLobby();
  } else if (data.type === 'upgrade_chosen') {
    if (!G.upgrades[data.id]) G.upgrades[data.id] = [];
    G.upgrades[data.id].push(data.upgrade);
    const p = G.players[data.id];
    if (p && !p.upgrades.includes(data.upgrade)) p.upgrades.push(data.upgrade);
  } else if (data.type === 'upgrade_pause_req') {
    if (G.isHost) hostAddUpgradeChooser(data.id, data.name);
  } else if (data.type === 'upgrade_pause_done') {
    if (G.isHost) hostRemoveUpgradeChooser(data.id);
  } else if (data.type === 'game_pause') {
    if (!G.isHost) applyPauseState(data.choosers, data.until);
  } else if (data.type === 'game_resume') {
    if (!G.isHost) applyResumeFromPause();
  } else if (data.type === 'emp_blast') {
    spawnExplosion(data.x, data.y, 150, 'emp');
    spawnFxBurst(data.x, data.y, data.layer || 0, 'emp');
    applyEmpBlast(data);
  } else if (data.type === 'obstacle_disabled') {
    disableObstacle(data.idx, data.duration || 10, false, data.fx || null);
  } else if (data.type === 'item_pickup') {
    disableItem(data.idx, data.respawn || CAR_TUNING.powerupRespawnSec, false);
    // Host relays the pickup to every other guest so the box vanishes for all.
    if (G.isHost) sendToAll({ type: 'item_pickup', idx: data.idx, respawn: data.respawn || CAR_TUNING.powerupRespawnSec });
  } else if (data.type === 'item_respawned') {
    if (!G.isHost && G.track && G.track.items && G.track.items[data.idx]) {
      G.track.items[data.idx].active = true;
      G.track.items[data.idx].respawn = 0;
    }
  }
}

function disableObstacle(idx, durationSec, shouldBroadcast, fx) {
  if (!G.track || !G.track.obstacles || idx < 0 || idx >= G.track.obstacles.length) return;
  const obs = G.track.obstacles[idx];
  if (obs.active === false) return;
  obs.active = false;
  obs.respawn = Math.max(obs.respawn || 0, durationSec || 10);
  if (obs.type === 'brick_wall') spawnBrickBurst(obs.x, obs.y, obstacleLayer(obs), fx || null);
  if (shouldBroadcast) broadcast({ type: 'obstacle_disabled', idx, duration: durationSec || 10, fx: fx || null });
}

// Cones are pushable and now shared across the network. Whoever shoves a cone tells
// everyone its new base position + velocity so the same slide plays on all clients.
// Throttled per-cone so a car resting against one can't spam packets.
function broadcastConePush(idx, obs) {
  if (!obs || obs.type !== 'cone') return;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (obs._coneNetCd && now < obs._coneNetCd) return;
  obs._coneNetCd = now + 60; // ~16 updates/sec cap
  broadcast({ type: 'cone_push', id: G.myId, idx, x: obs.bx, y: obs.by, vx: obs.vx || 0, vy: obs.vy || 0 });
}

function updateObstacleRespawns(dt) {
  if (!G.track || !G.track.obstacles) return;
  G.track.obstacles.forEach(obs => {
    if (obs.active !== false) return;
    obs.respawn = (obs.respawn || 0) - dt;
    if (obs.respawn <= 0) {
      obs.active = true;
      obs.respawn = 0;
    }
  });
}

// Item boxes are host-authoritative: whoever grabs a box disables it for EVERYONE for
// powerupRespawnSec, and only the host runs the respawn timer (then tells all clients).
function disableItem(idx, respawnSec, shouldBroadcast) {
  if (!G.track || !G.track.items || idx < 0 || idx >= G.track.items.length) return;
  const item = G.track.items[idx];
  if (item.active === false) return;
  item.active = false;
  item.respawn = respawnSec || CAR_TUNING.powerupRespawnSec;
  if (shouldBroadcast) broadcast({ type: 'item_pickup', idx, respawn: item.respawn });
}

function updateItemRespawns(dt) {
  // Only the host counts down and reactivates boxes; guests wait for 'item_respawned'.
  if (!G.isHost || !G.track || !G.track.items) return;
  G.track.items.forEach((item, idx) => {
    if (item.active !== false) return;
    item.respawn = (item.respawn || 0) - dt;
    if (item.respawn <= 0) {
      item.active = true;
      item.respawn = 0;
      sendToAll({ type: 'item_respawned', idx });
    }
  });
}

function ensureObstacleRuntime(obs) {
  if (!obs) return;
  if (obs.bx == null) obs.bx = obs.x;
  if (obs.by == null) obs.by = obs.y;
  if (obs.phase == null) obs.phase = Math.random() * Math.PI * 2;
  if (obs.moveSpeed == null) obs.moveSpeed = 1.1;
  if (obs.moveAmp == null) obs.moveAmp = 30;
  if (obs.flowDir == null) obs.flowDir = 0;
  if (obs.vx == null) obs.vx = 0;
  if (obs.vy == null) obs.vy = 0;
  const inferredLayer = (G.track && G.track.bridges && obs.layer == null) ? bridgeFloorAt(obs.bx, obs.by) : 0;
  obs.layer = Math.max(0, Math.min(2, Math.round(obs.layer == null ? inferredLayer : obs.layer)));
  obs.rot = Math.max(-180, Math.min(180, Number.isFinite(obs.rot) ? obs.rot : 0));
  obs.scale = Math.max(0.4, Math.min(2.2, Number.isFinite(obs.scale) ? obs.scale : 1));
}

function obstacleLayer(obs) {
  return Math.max(0, Math.min(2, Math.round((obs && obs.layer != null) ? obs.layer : 0)));
}

function itemLayer(item) {
  if (item && item.layer != null) return Math.max(0, Math.min(2, Math.round(item.layer)));
  if (item && Number.isFinite(item.x) && Number.isFinite(item.y)) return bridgeFloorAt(item.x, item.y);
  return 0;
}

function spawnSnowBurst(x, y, layer, speedScale) {
  const n = 18 + Math.floor(Math.random() * 18);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (30 + Math.random() * 130) * (speedScale || 1);
    const L = 0.2 + Math.random() * 0.35;
    G.snowParticles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: 2 + Math.random() * 4,
      life: L,
      maxLife: L,
      layer: layer || 0,
    });
  }
  if (G.snowParticles.length > 500) G.snowParticles.splice(0, G.snowParticles.length - 500);
}

function spawnBrickBurst(x, y, layer, fx) {
  const n = 11 + Math.floor(Math.random() * 8);
  const dirX0 = fx && Number.isFinite(fx.dirX) ? fx.dirX : 0;
  const dirY0 = fx && Number.isFinite(fx.dirY) ? fx.dirY : -1;
  const dirL = Math.sqrt(dirX0 * dirX0 + dirY0 * dirY0) || 1;
  const dirX = dirX0 / dirL;
  const dirY = dirY0 / dirL;
  const sideX = -dirY;
  const sideY = dirX;
  const impactSpeed = Math.max(80, (fx && Number.isFinite(fx.speed) ? Math.abs(fx.speed) : 120));
  const launchBase = impactSpeed * 3;

  for (let i = 0; i < n; i++) {
    // Forward-only half-oval spread biased in travel direction.
    const forwardT = Math.random();
    const lateralT = (Math.random() * 2 - 1);
    const fwdV = launchBase * (0.35 + 0.95 * forwardT);
    const latV = launchBase * 0.22 * lateralT * (0.4 + (1 - forwardT));
    const vx = dirX * fwdV + sideX * latV;
    const vy = dirY * fwdV + sideY * latV;
    const L = 2.8 + Math.random() * 1.2;
    G.brickShards.push({
      x, y,
      vx,
      vy,
      r: 3 + Math.random() * 4,
      life: L,
      maxLife: L,
      layer: layer || 0,
      gravity: 30 + Math.random() * 45,
      damaging: true,
      hitCd: 0,
    });
  }
  if (G.brickShards.length > 360) G.brickShards.splice(0, G.brickShards.length - 360);
}

function updateObstacleDynamics(dt) {
  if (!G.track || !G.track.obstacles) return;
  const me = G.players[G.myId];
  const speedScale = Math.max(0.2, G.speedScale || 1);
  for (const obs of G.track.obstacles) {
    ensureObstacleRuntime(obs);
    const px = obs.x;
    const py = obs.y;
    const t = Date.now() * 0.001 * obs.moveSpeed + obs.phase;
    obs.x = obs.bx;
    obs.y = obs.by;
    if (obs.type === 'cone') {
      // Pushable cone: slide along its own velocity with friction, then settle
      // back to rest. Cars knock this velocity in on contact (see collision).
      obs.bx += (obs.vx || 0) * dt;
      obs.by += (obs.vy || 0) * dt;
      const fr = Math.max(0, 1 - 4.5 * dt);
      obs.vx = (obs.vx || 0) * fr;
      obs.vy = (obs.vy || 0) * fr;
      if (Math.abs(obs.vx) < 1) obs.vx = 0;
      if (Math.abs(obs.vy) < 1) obs.vy = 0;
      obs.x = obs.bx;
      obs.y = obs.by;
      continue;
    }
    if (obs.type === 'moving_platform' || obs.type === 'punch_glove') {
      obs.x = obs.bx + Math.cos(t) * obs.moveAmp;
      obs.y = obs.by + Math.sin(t * 0.7) * (obs.moveAmp * 0.35);
    }
    obs.vx = dt > 0 ? (obs.x - px) / dt : 0;
    obs.vy = dt > 0 ? (obs.y - py) / dt : 0;
  }

  for (let i = G.snowParticles.length - 1; i >= 0; i--) {
    const p = G.snowParticles[i];
    p.life -= dt;
    if (p.life <= 0) {
      G.snowParticles.splice(i, 1);
      continue;
    }
    p.vx *= Math.max(0, 1 - 3.6 * dt);
    p.vy *= Math.max(0, 1 - 3.6 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  for (let i = G.brickShards.length - 1; i >= 0; i--) {
    const b = G.brickShards[i];
    b.life -= dt;
    b.hitCd = Math.max(0, (b.hitCd || 0) - dt);
    if (b.life <= 0) {
      G.brickShards.splice(i, 1);
      continue;
    }
    b.vx *= Math.max(0, 1 - 1.2 * dt);
    b.vy += (b.gravity || 40) * dt;
    b.vy *= Math.max(0, 1 - 0.2 * dt);
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (!me || me.deathRespawn > 0 || me.finished) continue;
    if ((b.layer || 0) !== (me.layer || 0) || !b.damaging || b.hitCd > 0) continue;
    if (dist(me.x, me.y, b.x, b.y) <= (b.r || 4) + 10) {
      applyDamage(me, CAR_TUNING.brickShardDamage / Math.max(0.5, getCarTypeCfg(me.carType).crashResist || 1), 'brick_shard');
      b.damaging = false;
      b.life = Math.min(b.life, 0.25); // fade quickly after impact
      b.hitCd = 0.2;
    }
  }
}
