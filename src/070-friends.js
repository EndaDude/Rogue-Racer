// ============================================================
// FRIENDS — a persistent social layer riding on its own PeerJS "presence" peer.
// Your Friend ID is random, cached at launch, and lets others send you friend
// requests / invites and detect when you are hosting (for auto-join).
// ============================================================
const FRIEND_ID = (function makeFriendId() {
  let id = '';
  try { id = localStorage.getItem('rr-friend-id') || ''; } catch (_) {}
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    id = seg() + '-' + seg();
    try { localStorage.setItem('rr-friend-id', id); } catch (_) {}
  }
  return id;
})();

let FRIENDS = []; // [{ id, name, autojoin }]
function loadFriends() {
  try {
    const raw = localStorage.getItem('rr-friends');
    const s = raw ? JSON.parse(raw) : null;
    if (s && Array.isArray(s.friends)) {
      FRIENDS = s.friends
        .filter(f => f && typeof f.id === 'string')
        // Keep the name blank until we actually learn it from the network — never
        // bake in a 'Friend' placeholder that masquerades as a real display name.
        .map(f => ({ id: f.id, name: String(f.name === 'Friend' ? '' : (f.name || '')).slice(0, 24), autojoin: !!f.autojoin }));
    }
  } catch (_) {}
}
function saveFriends() {
  try { localStorage.setItem('rr-friends', JSON.stringify({ friends: FRIENDS })); } catch (_) {}
}
loadFriends();

// Incoming friend requests wait here until accepted/declined (real requests —
// no more silent mutual adds).
let PENDING_REQUESTS = [];
try { PENDING_REQUESTS = JSON.parse(localStorage.getItem('rr-friend-reqs') || '[]') || []; } catch (_) {}
function savePendingRequests() {
  try { localStorage.setItem('rr-friend-reqs', JSON.stringify(PENDING_REQUESTS)); } catch (_) {}
}
function findPendingReq(arg) {
  const lc = String(arg || '').trim().toLowerCase();
  if (!lc) return null;
  return PENDING_REQUESTS.find(r => (r.name || '').toLowerCase() === lc)
      || PENDING_REQUESTS.find(r => (r.name || '').toLowerCase().startsWith(lc))
      || PENDING_REQUESTS.find(r => String(r.id).toLowerCase() === lc)
      || null;
}

function friendPeerId(fid) { return 'rogueracer-fr-' + String(fid).toLowerCase(); }
function findFriend(name) {
  const lc = String(name || '').trim().toLowerCase();
  if (!lc) return null;
  return FRIENDS.find(f => f.name.toLowerCase() === lc)
      || FRIENDS.find(f => f.name.toLowerCase().startsWith(lc))
      || null;
}
function myRacerName() {
  const el = document.getElementById('player-name');
  return (el && el.value ? el.value : 'Racer').slice(0, 16);
}
function friendNotify(text, cls) { if (window.__crtPrint) window.__crtPrint(text, cls); }

// Presence advertised to friends: are we hosting an open (pre-race) lobby?
function myPresence() {
  const hosting = !!(G.isHost && G.myRoomCode && !G.raceStarted);
  return { type: 'presence_state', hosting, code: hosting ? G.myRoomCode : '', fromId: FRIEND_ID, fromName: myRacerName() };
}

let socialPeer = null;
let socialInConns = [];  // connections other people opened to us
let socialReady = false;
let socialOnCanonicalId = false;   // are we actually holding rogueracer-fr-<FRIEND_ID>?
let socialReclaimTimer = null;     // background retry to reclaim the canonical id

// Wire the common handlers onto whichever social peer we ended up with.
function _attachSocialPeerHandlers(peerObj, isCanonical) {
  peerObj.on('open', () => {
    socialReady = true;
    socialOnCanonicalId = isCanonical;
    if (isCanonical && socialReclaimTimer) { clearInterval(socialReclaimTimer); socialReclaimTimer = null; }
    if (!isCanonical) scheduleCanonicalIdReclaim();
    try { ensureAutoLinks(); } catch (_) {}
    try { refreshAllFriendPresence(); } catch (_) {}
  });
  peerObj.on('disconnected', () => { try { peerObj.reconnect(); } catch (_) {} });
  peerObj.on('error', (e) => {
    const t = (e && e.type) || '';
    // The canonical id is deterministic, so after a reload/crash the broker may
    // still think our old peer holds it (unavailable-id). Rather than spin on the
    // same claim forever — which left the whole social layer permanently "not
    // ready" — fall back to an anonymous peer so OUTBOUND actions work now, and
    // keep trying to reclaim the canonical id in the background for inbound reach.
    if (t === 'unavailable-id') {
      try { if (socialPeer === peerObj) socialPeer.destroy(); } catch (_) {}
      if (socialPeer === peerObj) socialPeer = null;
      initSocialPeerAnonymous();
      return;
    }
    socialReady = false;
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') {
      setTimeout(() => {
        if (socialPeer !== peerObj) return; // a newer peer already took over
        try { peerObj.destroy(); } catch (_) {}
        socialPeer = null; initSocialPeer();
      }, 4000);
    }
  });
  // If the social peer fully closes (a crash, or the broker destroying it), relaunch
  // the whole social layer instead of silently staying dead — otherwise friends,
  // presence and invites never come back until a page reload.
  peerObj.on('close', () => {
    if (socialPeer !== peerObj) return; // a newer peer already replaced this one
    socialReady = false;
    socialPeer = null;
    setTimeout(() => { if (!socialPeer) initSocialPeer(); }, 1500);
  });
  peerObj.on('connection', (conn) => {
    socialInConns.push(conn);
    conn.on('open', () => { try { conn.send(myPresence()); } catch (_) {} });
    conn.on('data', (d) => handleSocialData(d, conn));
    conn.on('close', () => { socialInConns = socialInConns.filter(c => c !== conn); });
    conn.on('error', () => { socialInConns = socialInConns.filter(c => c !== conn); });
  });
}

// Primary path: claim the deterministic id so friends can reach us by it.
function initSocialPeer() {
  let p;
  try { p = new Peer(friendPeerId(FRIEND_ID)); }
  catch (e) { return; }
  socialPeer = p;
  _attachSocialPeerHandlers(p, true);
}

// Fallback path: broker-assigned id. We can still send requests/invites/presence
// out from here; only inbound-by-canonical-id is unavailable until reclaim wins.
function initSocialPeerAnonymous() {
  let p;
  try { p = new Peer(); }
  catch (e) { return; }
  socialPeer = p;
  _attachSocialPeerHandlers(p, false);
}

// Force a full teardown + relaunch of the social layer. Called when an action finds
// the layer unready — instead of just failing forever, we destroy the dead peer and
// spin up a fresh one so the next attempt has a working connection. Debounced so a
// burst of failed actions can't thrash the broker with new peers.
let socialResetAt = 0;
function resetSocialLayer() {
  const now = Date.now();
  if (now - socialResetAt < 5000) return;
  socialResetAt = now;
  socialReady = false;
  socialOnCanonicalId = false;
  if (socialReclaimTimer) { clearInterval(socialReclaimTimer); socialReclaimTimer = null; }
  try { if (socialPeer) socialPeer.destroy(); } catch (_) {}
  socialPeer = null;
  socialInConns = [];
  initSocialPeer();
}

// While on the anonymous fallback, periodically probe whether the canonical id
// has freed up (stale broker claims expire in ~a minute). When it has, swap over.
function scheduleCanonicalIdReclaim() {
  if (socialReclaimTimer) return;
  socialReclaimTimer = setInterval(() => {
    if (socialOnCanonicalId) { clearInterval(socialReclaimTimer); socialReclaimTimer = null; return; }
    let probe;
    try { probe = new Peer(friendPeerId(FRIEND_ID)); }
    catch (_) { return; }
    let settled = false;
    probe.on('open', () => {
      if (settled) return; settled = true;
      // Canonical id is ours again — retire the anonymous peer and adopt this one.
      const old = socialPeer;
      if (old && old !== probe) { try { old.destroy(); } catch (_) {} }
      socialInConns = [];
      socialPeer = probe;
      _attachSocialPeerHandlers(probe, true);
      socialReady = true;
      socialOnCanonicalId = true;
      if (socialReclaimTimer) { clearInterval(socialReclaimTimer); socialReclaimTimer = null; }
      try { refreshAllFriendPresence(); } catch (_) {}
    });
    // Still claimed / unreachable — discard this probe and try again next tick.
    probe.on('error', () => { if (!settled) { settled = true; try { probe.destroy(); } catch (_) {} } });
  }, 15000);
}

// Learn a friend's display name from their broadcast presence (names are no
// longer typed — we pick them up from the network when a friend is reachable).
function noteFriendName(id, name) {
  const fid = String(id || '');
  const nm = String(name || '').slice(0, 24);
  if (!fid || !nm) return;
  const f = FRIENDS.find(x => x.id === fid);
  if (f && f.name !== nm) {
    const wasUnknown = !f.name || f.name === 'Friend';
    f.name = nm;
    saveFriends();
    if (wasUnknown) friendNotify('\u2605 friend name resolved: ' + nm + '  (' + fid + ')', 'dim');
    if (window.__crtFriendsChanged) { try { window.__crtFriendsChanged(); } catch (_) {} }
  }
}
function handleSocialData(d, conn) {
  if (!d || typeof d !== 'object') return;
  if (d.type === 'friend_request') {
    const fromId = String(d.fromId || '');
    const fromName = String(d.fromName || 'Friend').slice(0, 24);
    if (!fromId || fromId === FRIEND_ID) return;
    const existing = FRIENDS.find(f => f.id === fromId);
    if (existing) existing.name = existing.name || fromName;
    else FRIENDS.push({ id: fromId, name: fromName, autojoin: false });
    saveFriends();
    friendNotify('\u2605 ' + fromName + ' added you as a friend (id ' + fromId + ').', 'hi');
  } else if (d.type === 'friend_request_v2') {
    // Real friend request: goes into a pending list; nothing is added until
    // this player explicitly accepts.
    const fromId = String(d.fromId || '');
    const fromName = String(d.fromName || 'Racer').slice(0, 24);
    if (!fromId || fromId === FRIEND_ID) return;
    if (FRIENDS.find(f => f.id === fromId)) {
      // Already friends on this side — auto-confirm so the sender syncs up.
      try { conn.send({ type: 'friend_accept', fromId: FRIEND_ID, fromName: myRacerName() }); } catch (_) {}
      return;
    }
    if (!PENDING_REQUESTS.find(r => r.id === fromId)) {
      PENDING_REQUESTS.push({ id: fromId, name: fromName, at: Date.now() });
      if (PENDING_REQUESTS.length > 20) PENDING_REQUESTS.splice(0, PENDING_REQUESTS.length - 20);
      savePendingRequests();
    }
    friendNotify('★ Friend request from ' + fromName + '  (' + fromId + ')', 'hi');
    friendNotify('   type:  accept ' + fromName + '   or   decline ' + fromName, 'dim');
  } else if (d.type === 'friend_accept') {
    const fromId = String(d.fromId || '');
    const fromName = String(d.fromName || 'Racer').slice(0, 24);
    if (!fromId || fromId === FRIEND_ID) return;
    const ex = FRIENDS.find(f => f.id === fromId);
    if (ex) { if (!ex.name) ex.name = fromName; }
    else FRIENDS.push({ id: fromId, name: fromName, autojoin: false });
    saveFriends();
    friendNotify('✓ ' + fromName + ' accepted your friend request!', 'hi');
  } else if (d.type === 'friend_decline') {
    friendNotify('Your friend request was declined by ' + String(d.fromName || 'the player').slice(0, 24) + '.', 'dim');
  } else if (d.type === 'friend_remove') {
    const fromId = String(d.fromId || '');
    const before = FRIENDS.length;
    FRIENDS = FRIENDS.filter(f => f.id !== fromId);
    if (FRIENDS.length !== before) { saveFriends(); friendNotify('A friend removed you.', 'dim'); }
  } else if (d.type === 'invite') {
    const fromName = String(d.fromName || 'A friend').slice(0, 24);
    const code = String(d.code || '').toUpperCase();
    if (!code) return;
    friendNotify('\uD83C\uDFC1 ' + fromName + ' invited you to their race!', 'hi');
    if (window.__crtClickable) {
      window.__crtClickable('  \u2192 click to join ' + fromName + "'s room (" + code + ')', 'clickable', () => {
        if (window.__terminalJoin) window.__terminalJoin(code);
      });
    } else {
      friendNotify('type:  join ' + code, 'dim');
    }
  } else if (d.type === 'presence_query') {
    // Whoever is asking also tells us who they are — learn it, then answer.
    noteFriendName(d.fromId, d.fromName);
    try { conn.send(myPresence()); } catch (_) {}
  } else if (d.type === 'presence_state') {
    noteFriendName(d.fromId, d.fromName);
  }
}

// One-shot message to a friend's social peer (friend requests / removals / invites).
function friendSend(targetFriendId, message, onFail) {
  if (!socialPeer || !socialReady) { resetSocialLayer(); if (onFail) onFail('social layer not ready \u2014 resetting it, try again in a moment'); return; }
  let done = false, conn;
  try { conn = socialPeer.connect(friendPeerId(targetFriendId), { reliable: true }); }
  catch (e) { if (onFail) onFail('could not reach friend'); return; }
  const timer = setTimeout(() => { if (!done) { done = true; if (onFail) onFail('friend appears offline'); try { conn.close(); } catch (_) {} } }, 8000);
  conn.on('open', () => {
    try { conn.send(message); } catch (_) {}
    // Stay open long enough to receive the friend's presence reply so we can
    // learn their display name before hanging up.
    setTimeout(() => { done = true; clearTimeout(timer); try { conn.close(); } catch (_) {} }, 2500);
  });
  conn.on('data', (d) => { if (d && d.type === 'presence_state') noteFriendName(d.fromId, d.fromName); });
  conn.on('error', () => { if (!done) { done = true; clearTimeout(timer); if (onFail) onFail('friend appears offline'); } });
}
