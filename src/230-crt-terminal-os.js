// ============================================================
// CRT TERMINAL OS — menus presented as an old CRT command line.
// Type commands to drive the game; graphical panels open via a
// Windows-style white "window zoom" popup, then reveal the real panel.
// ============================================================
(function initCrtTerminal(){
  const term = document.getElementById('crt-terminal');
  const scroll = document.getElementById('term-scroll');
  const input = document.getElementById('term-input');
  const typed = document.getElementById('term-typed');
  const promptEl = document.getElementById('term-prompt');
  if (!term || !scroll || !input) return;

  const history = []; let histIdx = -1;

  function scrollDown(){ scroll.scrollTop = scroll.scrollHeight; }
  function addLine(text, cls){
    const d = document.createElement('div');
    d.className = 'term-line' + (cls ? (' ' + cls) : '');
    d.textContent = (text == null ? '' : text);
    scroll.appendChild(d); scrollDown(); return d;
  }
  function print(text, cls){ String(text == null ? '' : text).split('\n').forEach(l => addLine(l, cls)); }
  // A terminal line that copies a value to the clipboard when clicked.
  function printCopyable(baseText, copyValue, cls) {
    const l = addLine(baseText, cls);
    l.style.cursor = 'pointer';
    l.title = 'click to copy';
    l.addEventListener('click', () => {
      try {
        navigator.clipboard.writeText(String(copyValue)).then(() => {
          l.textContent = baseText + '   (copied!)';
          setTimeout(() => { l.textContent = baseText; }, 1400);
        }).catch(() => {});
      } catch (_) {}
    });
    return l;
  }
  // Snappy line-by-line reveal for command output / boot.
  function printLines(lines, opts){
    return new Promise(res => {
      const arr = Array.isArray(lines) ? lines.slice() : String(lines).split('\n');
      const speed = (opts && opts.speed) || 16;
      (function step(){
        if (!arr.length) { res(); return; }
        const item = arr.shift();
        if (item && typeof item === 'object') addLine(item.text, item.cls); else addLine(item);
        setTimeout(step, speed);
      })();
    });
  }

  // ---------- show / hide ----------
  function showTerminal(){
    term.classList.add('on');
    document.body.classList.remove('panel-open');
    setTimeout(() => { try { input.focus(); } catch(e){} }, 30);
  }
  function hideTerminal(){ term.classList.remove('on'); }
  window.__crtShowTerminal = showTerminal;

  // ---------- window manager ----------
  // Menus open as draggable / resizable phosphor windows over the terminal.
  const openWindows = {};
  let winZTop = 320;
  function bringToFront(win){
    winZTop += 1; win.el.style.zIndex = winZTop;
    Object.keys(openWindows).forEach(k => openWindows[k].el.classList.toggle('focused', openWindows[k] === win));
  }
  function makeDraggable(el, handle){
    let sx=0, sy=0, ox=0, oy=0, on=false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.crt-win-close')) return;
      on = true; sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      try { handle.setPointerCapture(e.pointerId); } catch(_){}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!on) return;
      let nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      nx = Math.max(-el.offsetWidth + 64, Math.min(window.innerWidth - 64, nx));
      ny = Math.max(0, Math.min(window.innerHeight - 28, ny));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
    });
    const end = (e) => { on = false; try { handle.releasePointerCapture(e.pointerId); } catch(_){} };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  function makeResizable(el, handle, minW, minH){
    let sx=0, sy=0, ow=0, oh=0, on=false;
    handle.addEventListener('pointerdown', (e) => {
      on = true; sx = e.clientX; sy = e.clientY; ow = el.offsetWidth; oh = el.offsetHeight;
      try { handle.setPointerCapture(e.pointerId); } catch(_){}
      e.preventDefault(); e.stopPropagation();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!on) return;
      el.style.width = Math.max(minW, ow + (e.clientX - sx)) + 'px';
      el.style.height = Math.max(minH, oh + (e.clientY - sy)) + 'px';
    });
    const end = (e) => { on = false; try { handle.releasePointerCapture(e.pointerId); } catch(_){} };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  function openWindow(id, title, opts){
    opts = opts || {};
    if (openWindows[id]) { const w = openWindows[id]; w.el.classList.add('open'); bringToFront(w); return w; }
    const el = document.createElement('div'); el.className = 'crt-window launching'; el.dataset.winId = id;
    const bar = document.createElement('div'); bar.className = 'crt-win-bar';
    const titleEl = document.createElement('div'); titleEl.className = 'crt-win-title'; titleEl.textContent = title || id;
    const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'crt-win-close'; closeBtn.textContent = '\u00D7';
    bar.appendChild(titleEl); bar.appendChild(closeBtn);
    const body = document.createElement('div'); body.className = 'crt-win-body';
    const grip = document.createElement('div'); grip.className = 'crt-win-resize';
    const launch = document.createElement('div'); launch.className = 'crt-win-launch';
    el.appendChild(bar); el.appendChild(body); el.appendChild(grip); el.appendChild(launch);
    document.body.appendChild(el);
    const w = opts.width || 360, h = opts.height || 320;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    const n = Object.keys(openWindows).length;
    el.style.left = Math.max(16, Math.round((window.innerWidth - w) / 2) + n * 26) + 'px';
    el.style.top = Math.max(16, Math.round((window.innerHeight - h) / 2 - 40) + n * 26) + 'px';
    const win = { el, body, id, title, onClose: opts.onClose };
    openWindows[id] = win;
    el.addEventListener('pointerdown', () => bringToFront(win));
    closeBtn.addEventListener('click', () => { const doClose = () => { if (opts.onConfirmClose) { try { opts.onConfirmClose(); } catch(e){} } closeWindow(id); }; if (opts.confirmClose) showConfirmClose(win, opts.confirmClose, doClose); else doClose(); });
    makeDraggable(el, bar);
    makeResizable(el, grip, opts.minW || 220, opts.minH || 120);
    // Build the content now, hidden beneath the white launch screen.
    if (opts.onOpen) { try { opts.onOpen(win); } catch(e){} }
    // Launch sequence: terminal spinner -> window appears (white) at the midpoint
    // -> at the end the white screen clears to reveal the real content.
    const T = String(title || id).toUpperCase();
    const base = 'Launching ' + T + '... ';
    const frames = ['/', '|', '\\', '-'];
    let fi = 0;
    const line = addLine(base + frames[0], 'dim');
    const spin = setInterval(() => { fi = (fi + 1) % frames.length; line.textContent = base + frames[fi]; scrollDown(); }, 85);
    const dur = 700 + Math.random() * 600;
    setTimeout(() => { el.classList.add('open'); bringToFront(win); }, dur * 0.5);
    setTimeout(() => { clearInterval(spin); line.textContent = T + ' launched.'; el.classList.remove('launching'); }, dur);
    return win;
  }
  function closeWindow(id){
    const win = openWindows[id]; if (!win) return;
    try { if (win.onClose) win.onClose(win); } catch(e){}
    win.el.remove();
    delete openWindows[id];
  }
  let bootingRace = false;
  function closeAllWindows(){ Object.keys(openWindows).slice().forEach(id => closeWindow(id)); }
  // In-window Yes/No confirm overlay (used by the lobby window's close button).
  function showConfirmClose(win, msg, onYes){
    if (win.el.querySelector('.crt-win-confirm')) return;
    const ov = document.createElement('div'); ov.className = 'crt-win-confirm';
    ov.style.cssText = 'position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;padding:18px;text-align:center;background:rgba(3,18,10,0.94);';
    const q = document.createElement('div'); q.textContent = msg;
    q.style.cssText = 'color:#c9ffd8;font-size:0.9rem;line-height:1.4;text-shadow:0 0 6px rgba(93,255,160,0.4);';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;';
    const yes = tagWinBtn('Yes'); yes.style.borderColor = '#ff6b6b'; yes.style.color = '#ffd9d9';
    yes.onclick = () => { ov.remove(); onYes(); };
    const no = tagWinBtn('No'); no.style.borderColor = '#39ff14'; no.style.color = '#eafff0';
    no.onclick = () => ov.remove();
    row.appendChild(yes); row.appendChild(no);
    ov.appendChild(q); ov.appendChild(row);
    win.el.appendChild(ov);
  }
  window.crtwm = { open: openWindow, close: closeWindow, windows: openWindows };
  window.__crtOpenLobby = openLobbyWindow;

  // ---------- map maker window ----------
  // Reuses the existing #screen-map-editor DOM (all its handlers stay valid) by
  // reparenting it into a resizable CRT window, restyled green via .me-windowed.
  function openMapMakerWindow(){
    if (openWindows['mapmaker']) { const w = openWindows['mapmaker']; w.el.classList.add('open'); bringToFront(w); return w; }
    const width = Math.min(1024, Math.max(720, window.innerWidth - 120));
    const height = Math.min(680, Math.max(440, window.innerHeight - 120));
    return openWindow('mapmaker', 'MAP MAKER', {
      width, height, minW: 560, minH: 380,
      onOpen: (w) => {
        const scr = document.getElementById('screen-map-editor');
        if (!scr) return;
        w._editorPrevParent = scr.parentNode;
        w.body.style.padding = '0';
        w.body.style.overflow = 'hidden';
        scr.classList.add('me-windowed');
        w.body.appendChild(scr);
        try { openMapEditor(); } catch(e){ print('map maker failed: ' + e.message, 'err'); }
      },
      onClose: (w) => {
        const scr = document.getElementById('screen-map-editor');
        if (!scr) return;
        setBuilderMusic(false);
        scr.classList.remove('me-windowed');
        scr.style.display = 'none';
        (w._editorPrevParent || document.body).appendChild(scr);
      },
    });
  }
  window.__crtOpenMapMaker = openMapMakerWindow;
  window.__crtCloseMapMaker = () => { if (openWindows['mapmaker']) closeWindow('mapmaker'); };
  window.__crtMapMakerOpen = () => !!openWindows['mapmaker'];

  // ---------- paint-tag draw window ----------
  // Apply a 48x48 PNG data URL as the local player's paint tag and sync it.
  function applyPaintTag(dataUrl){
    if (!dataUrl) return;
    G.selectedPaintTag = dataUrl;
    drawDataUrlOnCanvas('paint-tag-canvas', dataUrl);
    drawDataUrlOnCanvas('lobby-c-paint-canvas', dataUrl);
    const me = G.players[G.myId];
    if (me) {
      me.paintTag = dataUrl;
      if (G.isHost) { updateHostPlayerList(); sendLobbySync(); }
      else { sendToHost({ type: 'player_profile', id: G.myId, name: me.name, color: me.color, carType: me.carType, paintTag: dataUrl }); }
    }
    const nameEl = document.getElementById('player-name');
    persistCustomization({ name: (me && me.name) || (nameEl && nameEl.value) || 'Racer', color: (me && me.color) || G.selectedColor || PLAYER_COLORS[0], paintTag: dataUrl, carType: (me && me.carType) || G.selectedCarType });
  }
  function tagWinBtn(label){
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'font-family:inherit;font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;color:#c9ffd8;background:rgba(11,58,31,0.7);border:1px solid #1f7a45;border-radius:4px;padding:6px 12px;cursor:pointer;transition:background .12s;';
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(24,110,58,0.85)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'rgba(11,58,31,0.7)'; });
    return b;
  }
  function openTagDraw(){
    return openWindow('tagdraw', 'PAINT TAG', { width: 300, height: 388, minW: 264, minH: 348, onOpen: (w) => {
      const body = w.body; body.innerHTML = '';
      const DISP = 224;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-items:center;';
      const hint = document.createElement('div');
      hint.textContent = 'draw your tag \u2014 it flies above your ship';
      hint.style.cssText = 'font-size:0.66rem;color:#6fdc95;opacity:0.85;text-align:center;letter-spacing:0.04em;';
      const cv = document.createElement('canvas');
      cv.width = DISP; cv.height = DISP;
      cv.style.cssText = 'width:100%;max-width:224px;aspect-ratio:1;background:#04170c;border:1px solid #1f7a45;border-radius:4px;box-shadow:inset 0 0 20px rgba(0,0,0,0.65);cursor:crosshair;touch-action:none;';
      const cx = cv.getContext('2d');
      const me0 = G.players[G.myId];
      const src = (me0 && me0.paintTag) || G.selectedPaintTag;
      if (src) { const img = new Image(); img.onload = () => cx.drawImage(img, 0, 0, DISP, DISP); img.src = src; }
      let drawing = false, brush = 9, colorVal = '#39ff14', erase = false;
      function pos(e){ const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * DISP, y: (e.clientY - r.top) / r.height * DISP }; }
      function begin(e){ drawing = true; cx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; const p = pos(e); cx.strokeStyle = colorVal; cx.lineWidth = brush; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x + 0.01, p.y); cx.stroke(); }
      function move(e){ if (!drawing) return; const p = pos(e); cx.lineTo(p.x, p.y); cx.stroke(); }
      function end(){ drawing = false; }
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch(_){} begin(e); });
      cv.addEventListener('pointermove', (e) => { e.preventDefault(); move(e); });
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      const tools = document.createElement('div');
      tools.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;width:100%;';
      const colorInp = document.createElement('input'); colorInp.type = 'color'; colorInp.value = colorVal; colorInp.title = 'brush color';
      colorInp.style.cssText = 'width:34px;height:26px;padding:0;border:1px solid #1f7a45;background:transparent;cursor:pointer;';
      const brushRange = document.createElement('input'); brushRange.type = 'range'; brushRange.min = '2'; brushRange.max = '22'; brushRange.value = String(brush);
      brushRange.title = 'brush size'; brushRange.style.width = '80px';
      brushRange.oninput = () => { brush = parseInt(brushRange.value, 10); };
      const penBtn = tagWinBtn('Pen');
      const eraseBtn = tagWinBtn('Erase');
      function syncMode(){ penBtn.style.outline = erase ? 'none' : '2px solid #39ff14'; eraseBtn.style.outline = erase ? '2px solid #39ff14' : 'none'; }
      colorInp.oninput = () => { colorVal = colorInp.value; erase = false; syncMode(); };
      penBtn.onclick = () => { erase = false; syncMode(); };
      eraseBtn.onclick = () => { erase = true; syncMode(); };
      syncMode();
      tools.appendChild(colorInp); tools.appendChild(brushRange); tools.appendChild(penBtn); tools.appendChild(eraseBtn);
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;width:100%;';
      const clearBtn = tagWinBtn('Clear'); clearBtn.style.flex = '0 0 auto';
      clearBtn.onclick = () => { cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, DISP, DISP); };
      const applyBtn = tagWinBtn('Apply'); applyBtn.style.flex = '1'; applyBtn.style.color = '#eafff0'; applyBtn.style.borderColor = '#39ff14';
      applyBtn.onclick = () => {
        const small = document.createElement('canvas'); small.width = PAINT_TAG_SIZE; small.height = PAINT_TAG_SIZE;
        small.getContext('2d').drawImage(cv, 0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE);
        applyPaintTag(small.toDataURL('image/png'));
        print('paint tag applied', 'hi');
        closeWindow('tagdraw');
      };
      actions.appendChild(clearBtn); actions.appendChild(applyBtn);
      wrap.appendChild(hint); wrap.appendChild(cv); wrap.appendChild(tools); wrap.appendChild(actions);
      body.appendChild(wrap);
    }});
  }

  // ---------- full ship customization window (decals, tag toggle, exhaust colors) ----------
  // Commits the extended customization by writing the G.selected* fields and calling
  // getLobbyProfileInput(), which persists locally and syncs to the room.
  function commitShipCustomize(){
    if (typeof getLobbyProfileInput === 'function') getLobbyProfileInput();
  }
  function openShipCustomize(){
    return openWindow('shipcustomize', 'SHIP CUSTOMIZE', { width: 320, height: 600, minW: 288, minH: 420, onOpen: (w) => {
      const body = w.body; body.innerHTML = '';
      const me = G.players[G.myId];
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
      const label = (t) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'font-size:0.66rem;color:#6fdc95;letter-spacing:0.05em;text-transform:uppercase;opacity:0.85;'; return d; };
      const row = () => { const d = document.createElement('div'); d.style.cssText = 'display:flex;gap:8px;align-items:center;'; return d; };

      // --- exhaust smoke color ---
      const smokeCur = (me && me.smokeColor) || G.selectedSmokeColor || '';
      const smokeChk = document.createElement('input'); smokeChk.type = 'checkbox'; smokeChk.checked = !!smokeCur;
      const smokeInp = document.createElement('input'); smokeInp.type = 'color'; smokeInp.value = smokeCur || '#9aa0a6';
      smokeInp.style.cssText = 'width:40px;height:26px;padding:0;border:1px solid #1f7a45;background:transparent;cursor:pointer;';
      const smokeTxt = document.createElement('span'); smokeTxt.textContent = 'custom exhaust smoke'; smokeTxt.style.cssText = 'font-size:0.72rem;color:#c9ffd8;';
      const smokeRow = row(); smokeRow.appendChild(smokeChk); smokeRow.appendChild(smokeInp); smokeRow.appendChild(smokeTxt);

      // --- boost trail color ---
      const trailCur = (me && me.trailColor) || G.selectedTrailColor || '';
      const trailChk = document.createElement('input'); trailChk.type = 'checkbox'; trailChk.checked = !!trailCur;
      const trailInp = document.createElement('input'); trailInp.type = 'color'; trailInp.value = trailCur || '#ff8a1e';
      trailInp.style.cssText = 'width:40px;height:26px;padding:0;border:1px solid #1f7a45;background:transparent;cursor:pointer;';
      const trailTxt = document.createElement('span'); trailTxt.textContent = 'custom trail (always on)'; trailTxt.style.cssText = 'font-size:0.72rem;color:#c9ffd8;';
      const trailRow = row(); trailRow.appendChild(trailChk); trailRow.appendChild(trailInp); trailRow.appendChild(trailTxt);

      // --- tag toggle ---
      const tagChk = document.createElement('input'); tagChk.type = 'checkbox';
      tagChk.checked = (me ? me.showTag !== false : G.selectedShowTag !== false);
      const tagTxt = document.createElement('span'); tagTxt.textContent = 'show tag beside my name'; tagTxt.style.cssText = 'font-size:0.72rem;color:#c9ffd8;';
      const tagRow = row(); tagRow.appendChild(tagChk); tagRow.appendChild(tagTxt);

      // --- decal placer (visual: add, drag to move, rotate + scale multiple decals) ---
      const DISP = 232;
      const carType = (me && me.carType) || G.selectedCarType || 'tez';
      const shape = getCarTypeCfg(carType).shape;
      const drawW = shape === 'puncher' ? CAR_H : CAR_W;
      const drawH = CAR_H;
      const sf = (DISP * 0.72) / Math.max(drawW, drawH);
      const shipColor = (me && me.color) || G.selectedColor || ((document.getElementById('car-color') || {}).value) || '#a855f7';
      const srcDecals = Array.isArray(me && me.decals) ? me.decals : (Array.isArray(G.selectedDecals) ? G.selectedDecals : []);
      let decals = srcDecals.map(d => ({ src: d.src, x: d.x || 0, y: d.y || 0, scale: (d.scale == null ? 0.5 : d.scale), rot: d.rot || 0 }));
      let sel = decals.length ? 0 : -1;
      const imgCache = {};
      const dcv = document.createElement('canvas'); dcv.width = DISP; dcv.height = DISP;
      dcv.style.cssText = 'width:100%;max-width:' + DISP + 'px;aspect-ratio:1;align-self:center;background:#04170c;border:1px solid #1f7a45;border-radius:4px;box-shadow:inset 0 0 20px rgba(0,0,0,0.65);cursor:grab;touch-action:none;';
      const dcx = dcv.getContext('2d');
      function ensureImg(src){ if (!src || imgCache[src]) return; const im = new Image(); im.onload = redraw; im.src = src; imgCache[src] = im; }
      function redraw(){
        dcx.setTransform(1,0,0,1,0,0);
        dcx.clearRect(0,0,DISP,DISP);
        // ship body, nose up, filled with the ship color
        dcx.save(); dcx.translate(DISP/2, DISP/2); dcx.scale(sf, sf);
        dcx.fillStyle = shipColor; drawCarSilhouette(dcx, shape, drawW, drawH);
        dcx.restore();
        // decals composited then clipped to the hull (destination-in), matching the game
        const layer = document.createElement('canvas'); layer.width = DISP; layer.height = DISP;
        const lc = layer.getContext('2d');
        lc.save(); lc.translate(DISP/2, DISP/2); lc.scale(sf, sf);
        let any = false;
        decals.forEach(d => {
          const im = imgCache[d.src]; if (!im || !im.complete || !im.naturalWidth) return; any = true;
          const ar = im.naturalHeight / im.naturalWidth || 1;
          const size = Math.max(0.02, d.scale) * drawW;
          lc.save(); lc.translate(d.x * drawW, d.y * drawH); lc.rotate(d.rot || 0);
          lc.drawImage(im, -size/2, -(size*ar)/2, size, size*ar); lc.restore();
        });
        lc.globalCompositeOperation = 'destination-in'; lc.fillStyle = '#fff';
        drawCarSilhouette(lc, shape, drawW, drawH); lc.restore();
        if (any) dcx.drawImage(layer, 0, 0);
        // selection box, drawn unclipped so it stays visible at the hull edge
        if (sel >= 0 && decals[sel]) {
          const d = decals[sel]; const im = imgCache[d.src];
          const ar = (im && im.naturalWidth) ? im.naturalHeight / im.naturalWidth : 1;
          const size = Math.max(0.02, d.scale) * drawW;
          dcx.save(); dcx.translate(DISP/2, DISP/2); dcx.scale(sf, sf);
          dcx.translate(d.x * drawW, d.y * drawH); dcx.rotate(d.rot || 0);
          dcx.strokeStyle = '#39ff14'; dcx.lineWidth = 1.4 / sf; dcx.setLineDash([4/sf, 3/sf]);
          dcx.strokeRect(-size/2, -(size*ar)/2, size, size*ar); dcx.restore();
        }
      }
      decals.forEach(d => ensureImg(d.src));
      // convert a pointer event to hull-unit coordinates (origin = hull center)
      function toHull(e){ const r = dcv.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * DISP; const py = (e.clientY - r.top) / r.height * DISP; return { x: (px - DISP/2) / sf, y: (py - DISP/2) / sf }; }
      function hitTest(hx, hy){
        for (let i = decals.length - 1; i >= 0; i--) {
          const d = decals[i]; const im = imgCache[d.src];
          const ar = (im && im.naturalWidth) ? im.naturalHeight / im.naturalWidth : 1;
          const size = Math.max(0.02, d.scale) * drawW;
          const lx = hx - d.x * drawW, ly = hy - d.y * drawH;
          const c = Math.cos(-(d.rot||0)), s = Math.sin(-(d.rot||0));
          const rx = lx * c - ly * s, ry = lx * s + ly * c;
          if (Math.abs(rx) <= size/2 && Math.abs(ry) <= (size*ar)/2) return i;
        }
        return -1;
      }
      let dragging = false, dragOff = { x: 0, y: 0 };
      dcv.addEventListener('pointerdown', (e) => {
        e.preventDefault(); try { dcv.setPointerCapture(e.pointerId); } catch(_){}
        const h = toHull(e); const hit = hitTest(h.x, h.y);
        if (hit >= 0) { sel = hit; dragging = true; const d = decals[sel]; dragOff = { x: h.x - d.x * drawW, y: h.y - d.y * drawH }; dcv.style.cursor = 'grabbing'; }
        else { sel = -1; }
        syncSliders(); redraw();
      });
      dcv.addEventListener('pointermove', (e) => {
        if (!dragging || sel < 0) return; e.preventDefault();
        const h = toHull(e); const d = decals[sel];
        d.x = Math.max(-0.7, Math.min(0.7, (h.x - dragOff.x) / drawW));
        d.y = Math.max(-0.7, Math.min(0.7, (h.y - dragOff.y) / drawH));
        redraw();
      });
      function endDrag(){ dragging = false; dcv.style.cursor = 'grab'; }
      dcv.addEventListener('pointerup', endDrag);
      dcv.addEventListener('pointercancel', endDrag);

      // --- size / spin sliders (applied to the selected decal) ---
      const scaleRange = document.createElement('input'); scaleRange.type = 'range'; scaleRange.min = '5'; scaleRange.max = '120'; scaleRange.value = '50'; scaleRange.style.flex = '1';
      const rotRange = document.createElement('input'); rotRange.type = 'range'; rotRange.min = '0'; rotRange.max = '360'; rotRange.value = '0'; rotRange.style.flex = '1';
      scaleRange.oninput = () => { if (sel < 0) return; decals[sel].scale = parseInt(scaleRange.value, 10) / 100; redraw(); };
      rotRange.oninput = () => { if (sel < 0) return; decals[sel].rot = parseInt(rotRange.value, 10) * Math.PI / 180; redraw(); };
      function syncSliders(){ const on = sel >= 0 && !!decals[sel]; scaleRange.disabled = !on; rotRange.disabled = !on; if (on) { scaleRange.value = String(Math.round(decals[sel].scale * 100)); rotRange.value = String(Math.round((decals[sel].rot || 0) * 180 / Math.PI)); } }
      const scaleLbl = document.createElement('span'); scaleLbl.textContent = 'size'; scaleLbl.style.cssText = 'font-size:0.66rem;color:#c9ffd8;width:34px;flex:0 0 auto;';
      const rotLbl = document.createElement('span'); rotLbl.textContent = 'spin'; rotLbl.style.cssText = 'font-size:0.66rem;color:#c9ffd8;width:34px;flex:0 0 auto;';
      const scaleRow = row(); scaleRow.appendChild(scaleLbl); scaleRow.appendChild(scaleRange);
      const rotRow = row(); rotRow.appendChild(rotLbl); rotRow.appendChild(rotRange);

      // --- add / delete / clear ---
      const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.style.display = 'none';
      const addBtn = tagWinBtn('Add'); const delBtn = tagWinBtn('Delete'); const clrBtn = tagWinBtn('Clear');
      addBtn.onclick = () => fileInp.click();
      fileInp.onchange = () => {
        const f = fileInp.files && fileInp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const img = new Image();
          img.onload = () => {
            // Downscale to bound the synced payload; decals are clipped to the hull.
            const S = 256, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
            cv.getContext('2d').drawImage(img, 0, 0, S, S);
            const src = cv.toDataURL('image/png');
            ensureImg(src);
            decals.push({ src, x: 0, y: 0, scale: 0.5, rot: 0 });
            sel = decals.length - 1; syncSliders(); redraw();
          };
          img.src = rd.result;
        };
        rd.readAsDataURL(f);
        fileInp.value = '';
      };
      delBtn.onclick = () => { if (sel < 0) return; decals.splice(sel, 1); sel = decals.length ? Math.min(sel, decals.length - 1) : -1; syncSliders(); redraw(); };
      clrBtn.onclick = () => { decals = []; sel = -1; syncSliders(); redraw(); };
      const decalBtns = row(); decalBtns.style.justifyContent = 'center'; decalBtns.appendChild(addBtn); decalBtns.appendChild(delBtn); decalBtns.appendChild(clrBtn); decalBtns.appendChild(fileInp);
      const decalHint = document.createElement('div'); decalHint.textContent = 'add images, tap to select, drag to place \u2014 clipped to the hull'; decalHint.style.cssText = 'font-size:0.62rem;color:#6fdc95;opacity:0.7;text-align:center;';
      syncSliders(); redraw();

      // --- shortcuts to the other windows ---
      const links = document.createElement('div'); links.style.cssText = 'display:flex;gap:8px;';
      const colorBtn = tagWinBtn('Color'); colorBtn.onclick = () => openColorPicker();
      const tagDrawBtn = tagWinBtn('Tag'); tagDrawBtn.onclick = () => openTagDraw();
      links.appendChild(colorBtn); links.appendChild(tagDrawBtn);

      const applyBtn = tagWinBtn('Apply'); applyBtn.style.color = '#eafff0'; applyBtn.style.borderColor = '#39ff14';
      applyBtn.onclick = () => {
        G.selectedSmokeColor = smokeChk.checked ? smokeInp.value : '';
        G.selectedTrailColor = trailChk.checked ? trailInp.value : '';
        G.selectedDecals = decals.map(d => ({ src: d.src, x: d.x, y: d.y, scale: d.scale, rot: d.rot }));
        G.selectedShowTag = !!tagChk.checked;
        commitShipCustomize();
        print('ship customization applied', 'hi');
        closeWindow('shipcustomize');
      };

      wrap.appendChild(label('Exhaust'));
      wrap.appendChild(smokeRow); wrap.appendChild(trailRow);
      wrap.appendChild(label('Tag')); wrap.appendChild(tagRow);
      wrap.appendChild(label('Decals')); wrap.appendChild(dcv); wrap.appendChild(scaleRow); wrap.appendChild(rotRow); wrap.appendChild(decalBtns); wrap.appendChild(decalHint);
      wrap.appendChild(label('More')); wrap.appendChild(links);
      wrap.appendChild(applyBtn);
      body.appendChild(wrap);
    }});
  }

  // ---------- car color (command + picker window) ----------
  function applyColor(hex){
    const v = String(hex).toLowerCase();
    G.selectedColor = v;
    const el = document.getElementById('car-color'); if (el) el.value = v;
    const cz = document.getElementById('lobby-c-color'); if (cz) cz.value = v;
    const me = G.players[G.myId];
    if (me) {
      me.color = v;
      if (G.isHost) { updateHostPlayerList(); sendLobbySync(); }
      else { sendToHost({ type: 'player_profile', id: G.myId, name: me.name, color: v, carType: me.carType, paintTag: me.paintTag }); }
    }
    const nameEl = document.getElementById('player-name');
    persistCustomization({ name: (me && me.name) || (nameEl && nameEl.value) || 'Racer', color: v, paintTag: (me && me.paintTag) || G.selectedPaintTag || '', carType: (me && me.carType) || G.selectedCarType });
  }
  function openColorPicker(){
    return openWindow('colorpick', 'CAR COLOR', { width: 264, height: 262, minW: 236, minH: 236, onOpen: (w) => {
      const body = w.body; body.innerHTML = '';
      const me = G.players[G.myId];
      const carEl = document.getElementById('car-color');
      let cur = (me && me.color) || G.selectedColor || (carEl && carEl.value) || '#a855f7';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:11px;align-items:center;';
      const hint = document.createElement('div');
      hint.textContent = 'your ship color';
      hint.style.cssText = 'font-size:0.66rem;color:#6fdc95;opacity:0.85;letter-spacing:0.04em;';
      const swatch = document.createElement('div');
      swatch.style.cssText = 'width:100%;height:60px;border-radius:6px;border:1px solid #1f7a45;box-shadow:inset 0 0 16px rgba(0,0,0,0.5);background:' + cur + ';';
      const colorInp = document.createElement('input'); colorInp.type = 'color'; colorInp.value = cur; colorInp.title = 'pick a color';
      colorInp.style.cssText = 'width:100%;height:38px;padding:0;border:1px solid #1f7a45;background:transparent;cursor:pointer;';
      const hexInp = document.createElement('input'); hexInp.type = 'text'; hexInp.value = cur; hexInp.maxLength = 7; hexInp.title = 'hex code';
      hexInp.style.cssText = 'width:100%;font-family:inherit;font-size:0.85rem;letter-spacing:0.05em;color:#c9ffd8;background:rgba(4,23,12,0.8);border:1px solid #1f7a45;border-radius:4px;padding:6px 8px;box-sizing:border-box;text-align:center;';
      function setCur(v, from){ cur = v; swatch.style.background = v; if (from !== 'color') colorInp.value = v; if (from !== 'hex') hexInp.value = v; }
      colorInp.oninput = () => setCur(colorInp.value, 'color');
      hexInp.oninput = () => { let v = hexInp.value.trim(); if (v && v[0] !== '#') v = '#' + v; if (/^#[0-9a-fA-F]{6}$/.test(v)) setCur(v.toLowerCase(), 'hex'); };
      const applyBtn = tagWinBtn('Apply'); applyBtn.style.width = '100%'; applyBtn.style.color = '#eafff0'; applyBtn.style.borderColor = '#39ff14';
      applyBtn.onclick = () => {
        let v = (hexInp.value || '').trim(); if (v && v[0] !== '#') v = '#' + v;
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) v = colorInp.value;
        applyColor(v); print('color set to ' + v.toLowerCase(), 'hi'); closeWindow('colorpick');
      };
      wrap.appendChild(hint); wrap.appendChild(swatch); wrap.appendChild(colorInp); wrap.appendChild(hexInp); wrap.appendChild(applyBtn);
      body.appendChild(wrap);
    }});
  }

  // ---------- lobby display window (read-only view of the room) ----------
  function lobbySig(){
    return Object.values(G.players || {}).map(p => [p.id, p.name, p.color, p.carType, p.ready, (p.paintTag || '').length].join(':')).join('|') + '#' + (G.isHost ? 'h' : 'g');
  }
  function renderLobbyList(body){
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    const players = Object.values(G.players || {});
    const head = document.createElement('div');
    head.textContent = 'PLAYERS (' + players.length + ')';
    head.style.cssText = 'font-size:0.72rem;letter-spacing:0.1em;color:#6fdc95;opacity:0.85;margin-bottom:2px;';
    wrap.appendChild(head);
    if (!players.length) {
      const empty = document.createElement('div'); empty.textContent = 'waiting for players...';
      empty.style.cssText = 'color:#4f9e6d;font-size:0.8rem;font-style:italic;';
      wrap.appendChild(empty);
    }
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 9px;background:rgba(8,40,22,0.55);border:1px solid #14512e;border-radius:5px;';
      const dot = document.createElement('div');
      const col = p.color || '#39ff14';
      dot.style.cssText = 'flex:0 0 auto;width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,0.35);box-shadow:0 0 8px ' + col + ';background:' + col + ';';
      const tag = document.createElement('canvas'); tag.width = PAINT_TAG_SIZE; tag.height = PAINT_TAG_SIZE;
      tag.style.cssText = 'flex:0 0 auto;width:26px;height:26px;background:#04170c;border:1px solid #14512e;border-radius:3px;';
      if (p.paintTag) { const img = new Image(); img.onload = () => { const cxx = tag.getContext('2d'); cxx.clearRect(0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE); cxx.drawImage(img, 0, 0, PAINT_TAG_SIZE, PAINT_TAG_SIZE); }; img.src = p.paintTag; }
      const info = document.createElement('div'); info.style.cssText = 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;';
      const nm = document.createElement('div'); nm.textContent = (p.name || 'Racer') + (p.id === G.myId ? ' (you)' : '');
      nm.style.cssText = 'color:#eafff2;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      const ship = document.createElement('div'); ship.textContent = getCarTypeCfg(p.carType).name;
      ship.style.cssText = 'color:#6fdc95;font-size:0.68rem;opacity:0.8;';
      info.appendChild(nm); info.appendChild(ship);
      const st = document.createElement('div');
      const isHost = i === 0;
      st.textContent = isHost ? 'HOST' : (p.ready ? 'READY' : '...');
      st.style.cssText = 'flex:0 0 auto;font-size:0.66rem;letter-spacing:0.06em;padding:2px 7px;border-radius:3px;' + (isHost ? 'color:#ffe9a8;border:1px solid #7a6a1f;' : (p.ready ? 'color:#9dffc6;border:1px solid #1f7a45;' : 'color:#4f9e6d;border:1px solid #14512e;'));
      row.appendChild(dot); row.appendChild(tag); row.appendChild(info); row.appendChild(st);
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
  }
  // Disconnect from the current room (drives the real back-to-lobby buttons) and
  // close the lobby window if it is open. Idempotent.
  function leaveRoom(){
    const hostBack = document.getElementById('back-lobby-btn');
    const guestBack = document.getElementById('back-lobby-btn2');
    if (G.isHost) { if (hostBack && hostBack.onclick) hostBack.onclick(); }
    else if (guestBack && guestBack.onclick) guestBack.onclick();
    // The guest back button doesn't tear down the peer, so do it explicitly.
    try { if (peer) peer.destroy(); } catch(_){}
    peer = null; hostConn = null; guestConns = [];
    G.isHost = false; G.myId = null; G.players = {};
    friendsOnLeaveRoom();
    closeWindow('lobby');
    print('Left the room.', 'dim');
  }
  function openLobbyWindow(){
    return openWindow('lobby', 'ROOM LOBBY', { width: 320, height: 360, minW: 264, minH: 220,
      confirmClose: G.isHost ? 'Closing this window will close the room and disconnect everyone. Continue?' : 'Closing this window will leave the room. Continue?',
      onConfirmClose: () => { leaveRoom(); },
      onOpen: (w) => {
        renderLobbyList(w.body);
        w._sig = lobbySig();
        w._iv = setInterval(() => {
          if (!openWindows['lobby']) { clearInterval(w._iv); return; }
          const s = lobbySig();
          if (s !== w._sig) { w._sig = s; renderLobbyList(w.body); }
        }, 350);
      },
      onClose: (w) => { if (w._iv) clearInterval(w._iv); }
    });
  }

  // ---------- MATCH CONFIG WINDOW (host controls / guest read-only) ----------
  function mcSection(title){
    const s = document.createElement('div');
    s.style.cssText = 'margin:0 0 12px;';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#7dffb0;opacity:.85;margin:0 0 6px;border-bottom:1px solid rgba(93,255,160,.22);padding-bottom:3px;';
    s.appendChild(h);
    return s;
  }
  function mcChip(label, on){
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:inherit;font-size:.74rem;padding:4px 9px;border-radius:6px;cursor:pointer;'
      + 'background:' + (on ? 'rgba(57,255,20,.16)' : 'rgba(0,0,0,.25)') + ';'
      + 'border:1px solid ' + (on ? '#39ff14' : 'rgba(93,255,160,.3)') + ';'
      + 'color:' + (on ? '#eafff0' : '#9fdcb6') + ';'
      + 'text-shadow:' + (on ? '0 0 6px rgba(93,255,160,.5)' : 'none') + ';';
    return b;
  }
  function renderMatchConfig(w){
    const body = w.body;
    const host = !!G.isHost;
    body.innerHTML = '';
    body.style.cssText = 'padding:12px 14px;overflow:auto;';

    // Speed class
    const secSpeed = mcSection('Speed Class');
    const realSpeed = document.getElementById('speed-class');
    if (host && realSpeed) {
      const sel = document.createElement('select');
      sel.style.cssText = 'width:100%;font:inherit;font-size:.82rem;background:rgba(0,0,0,.35);color:#eafff0;border:1px solid rgba(93,255,160,.35);border-radius:7px;padding:6px 8px;';
      Array.from(realSpeed.options).forEach(o => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.textContent; sel.appendChild(op); });
      sel.value = G.speedClass || realSpeed.value;
      sel.onchange = () => { realSpeed.value = sel.value; if (realSpeed.onchange) realSpeed.onchange(); renderMatchConfig(w); };
      secSpeed.appendChild(sel);
    } else {
      const opt = realSpeed ? Array.from(realSpeed.options).find(o => o.value === (G.speedClass || realSpeed.value)) : null;
      const v = document.createElement('div'); v.textContent = (opt && opt.textContent) || (G.speedClass || '?');
      v.style.cssText = 'font-size:.85rem;color:#eafff0;';
      secSpeed.appendChild(v);
    }
    body.appendChild(secSpeed);

    // Race rules: laps + locked vote mode
    const secRules = mcSection('Race Rules');
    const rulesRow = document.createElement('div');
    rulesRow.style.cssText = 'display:flex;gap:20px;align-items:center;';
    const lapsWrap = document.createElement('div');
    lapsWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const lapsLbl = document.createElement('span'); lapsLbl.textContent = 'Laps'; lapsLbl.style.cssText = 'font-size:.78rem;color:#9fdcb6;';
    lapsWrap.appendChild(lapsLbl);
    const lapsVal = G.lobbyLaps || 3;
    if (host) {
      const dec = mcChip('\u2212', false); dec.style.padding = '2px 10px';
      const num = document.createElement('span'); num.textContent = String(lapsVal); num.style.cssText = 'min-width:22px;text-align:center;font-size:.9rem;color:#eafff0;';
      const inc = mcChip('+', false); inc.style.padding = '2px 10px';
      const setLaps = (n) => {
        n = Math.max(1, Math.min(20, n));
        const el = document.getElementById('host-laps-input');
        if (el) { el.value = n; if (el.onchange) el.onchange(); }
        G.lobbyLaps = n; if (typeof sendLobbySync === 'function') sendLobbySync(); renderMatchConfig(w);
      };
      dec.onclick = () => setLaps((G.lobbyLaps || 3) - 1);
      inc.onclick = () => setLaps((G.lobbyLaps || 3) + 1);
      lapsWrap.appendChild(dec); lapsWrap.appendChild(num); lapsWrap.appendChild(inc);
    } else {
      const num = document.createElement('span'); num.textContent = String(lapsVal); num.style.cssText = 'font-size:.9rem;color:#eafff0;';
      lapsWrap.appendChild(num);
    }
    rulesRow.appendChild(lapsWrap);
    const modeWrap = document.createElement('div');
    modeWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const modeLbl = document.createElement('span'); modeLbl.textContent = 'Mode'; modeLbl.style.cssText = 'font-size:.78rem;color:#9fdcb6;';
    const modePill = document.createElement('span'); modePill.textContent = 'VOTE \uD83D\uDD12';
    modePill.style.cssText = 'font-size:.72rem;padding:3px 9px;border-radius:6px;background:rgba(57,255,20,.16);border:1px solid #39ff14;color:#eafff0;';
    modeWrap.appendChild(modeLbl); modeWrap.appendChild(modePill);
    rulesRow.appendChild(modeWrap);
    // Prototype ships toggle (host-only)
    const protoWrap = document.createElement('div');
    protoWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const protoLbl = document.createElement('span'); protoLbl.textContent = 'Prototype Ships'; protoLbl.style.cssText = 'font-size:.78rem;color:#9fdcb6;';
    const protoOn = G.allowPrototypes !== false;
    const protoChip = mcChip(protoOn ? 'UNLOCKED' : 'LOCKED', protoOn);
    if (host) {
      protoChip.onclick = () => {
        if (typeof setPrototypesAllowed === 'function') setPrototypesAllowed(!(G.allowPrototypes !== false));
        renderMatchConfig(w);
      };
    } else { protoChip.style.cursor = 'default'; }
    protoWrap.appendChild(protoLbl); protoWrap.appendChild(protoChip);
    rulesRow.appendChild(protoWrap);
    secRules.appendChild(rulesRow);
    body.appendChild(secRules);

    // Allowed ships
    const secShips = mcSection('Allowed Ships');
    const shipGrid = document.createElement('div');
    shipGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    const allowed = (G.allowedCarTypes && G.allowedCarTypes.length) ? G.allowedCarTypes : Object.keys(CAR_TYPES);
    Object.keys(CAR_TYPES).forEach(t => {
      const on = allowed.includes(t);
      const chip = mcChip(CAR_TYPES[t].name, on);
      if (host) {
        chip.onclick = () => {
          const set = new Set((G.allowedCarTypes && G.allowedCarTypes.length) ? G.allowedCarTypes : Object.keys(CAR_TYPES));
          if (set.has(t)) { if (set.size > 1) set.delete(t); } else set.add(t);
          G.allowedCarTypes = Object.keys(CAR_TYPES).filter(x => set.has(x));
          Object.values(G.players).forEach(p => { if (!G.allowedCarTypes.includes(p.carType)) p.carType = G.allowedCarTypes[0]; });
          if (typeof renderAllowedShips === 'function') renderAllowedShips();
          if (typeof refreshShipGrid === 'function') refreshShipGrid();
          if (typeof updateHostPlayerList === 'function') updateHostPlayerList();
          if (typeof sendLobbySync === 'function') sendLobbySync();
          renderMatchConfig(w);
        };
      } else { chip.style.cursor = 'default'; }
      shipGrid.appendChild(chip);
    });
    secShips.appendChild(shipGrid);
    body.appendChild(secShips);

    // Map queue
    const secQueue = mcSection('Map Queue');
    const qList = document.createElement('div');
    qList.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const queue = G.mapQueue || [];
    if (!queue.length) {
      const em = document.createElement('div'); em.textContent = '(empty \u2014 a random track will be used)';
      em.style.cssText = 'font-size:.76rem;color:#79a98c;font-style:italic;';
      qList.appendChild(em);
    }
    queue.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.22);border:1px solid rgba(93,255,160,.18);border-radius:6px;padding:4px 8px;';
      const nm = document.createElement('span');
      nm.textContent = (idx + 1) + '. ' + (typeof queueEntryLabel === 'function' ? queueEntryLabel(entry) : ((entry.map && entry.map.name) || 'Track'));
      nm.style.cssText = 'flex:1;font-size:.78rem;color:#eafff0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      row.appendChild(nm);
      if (host) {
        const up = mcChip('\u2191', false); up.style.padding = '1px 7px';
        up.onclick = () => { if (idx > 0) { const a = G.mapQueue; const t = a[idx-1]; a[idx-1] = a[idx]; a[idx] = t; if (typeof sendLobbySync==='function') sendLobbySync(); if (typeof refreshVoteSelectors==='function') refreshVoteSelectors(); renderMatchConfig(w); } };
        const dn = mcChip('\u2193', false); dn.style.padding = '1px 7px';
        dn.onclick = () => { const a = G.mapQueue; if (idx < a.length - 1) { const t = a[idx+1]; a[idx+1] = a[idx]; a[idx] = t; if (typeof sendLobbySync==='function') sendLobbySync(); if (typeof refreshVoteSelectors==='function') refreshVoteSelectors(); renderMatchConfig(w); } };
        const rm = mcChip('\u2715', false); rm.style.padding = '1px 7px'; rm.style.borderColor = '#ff6b6b'; rm.style.color = '#ffd9d9';
        rm.onclick = () => { G.mapQueue.splice(idx, 1); if (typeof sendLobbySync==='function') sendLobbySync(); if (typeof refreshVoteSelectors==='function') refreshVoteSelectors(); if (typeof updateHostPlayerList==='function') updateHostPlayerList(); renderMatchConfig(w); };
        row.appendChild(up); row.appendChild(dn); row.appendChild(rm);
      }
      qList.appendChild(row);
    });
    secQueue.appendChild(qList);
    if (host) {
      const upBtn = tagWinBtn('Upload Map');
      upBtn.style.marginTop = '8px';
      upBtn.onclick = () => { const b = document.getElementById('host-upload-map-btn'); if (b && b.onclick) b.onclick(); };
      secQueue.appendChild(upBtn);
    }
    body.appendChild(secQueue);

    // Track library (host only)
    if (host) {
      const secLib = mcSection('Track Library');
      const libList = document.createElement('div');
      libList.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:130px;overflow:auto;';
      let tracks = [];
      try { if (typeof getLocalTracks === 'function') tracks = tracks.concat(getLocalTracks().map(r => ({ rec: r, tag: 'local' }))); } catch(_){}
      try { if (typeof getHistoryTracks === 'function') tracks = tracks.concat(getHistoryTracks().map(r => ({ rec: r, tag: 'recent' }))); } catch(_){}
      if (!tracks.length) {
        const em = document.createElement('div'); em.textContent = 'No saved tracks. Use Upload Map, or the editor.';
        em.style.cssText = 'font-size:.75rem;color:#79a98c;font-style:italic;';
        libList.appendChild(em);
      }
      tracks.forEach(({ rec, tag }) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 4px;';
        const nm = document.createElement('span'); nm.textContent = rec.name || 'Untitled';
        nm.title = (rec.name || 'Untitled') + ' \u2014 ' + (rec.waypoints ? rec.waypoints.length : '?') + ' nodes';
        nm.style.cssText = 'flex:1;font-size:.77rem;color:#cdeede;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        const tg = document.createElement('span'); tg.textContent = tag; tg.style.cssText = 'font-size:.62rem;color:#79a98c;';
        const add = mcChip('\uFF0B', false); add.style.padding = '1px 8px';
        add.onclick = () => { if (typeof addTrackToQueue === 'function') { addTrackToQueue(rec, 'library'); renderMatchConfig(w); } };
        row.appendChild(nm); row.appendChild(tg); row.appendChild(add);
        libList.appendChild(row);
      });
      secLib.appendChild(libList);
      body.appendChild(secLib);
    }

    // Start / footer
    if (host) {
      const realStart = document.getElementById('start-race-btn');
      const startBtn = tagWinBtn((realStart && realStart.textContent) || 'Start Race');
      startBtn.style.cssText += 'width:100%;margin-top:6px;border-color:#39ff14;';
      if (realStart && realStart.disabled) { startBtn.disabled = true; startBtn.style.opacity = '.5'; startBtn.style.cursor = 'not-allowed'; }
      startBtn.onclick = () => { const b = document.getElementById('start-race-btn'); if (b && !b.disabled && b.onclick) b.onclick(); };
      body.appendChild(startBtn);
    } else {
      const note = document.createElement('div');
      note.textContent = 'The host controls these settings.';
      note.style.cssText = 'margin-top:8px;font-size:.74rem;color:#79a98c;font-style:italic;text-align:center;';
      body.appendChild(note);
    }
    try { w._sig = mcSig(); } catch(_){}
  }
  function mcSig(){
    const q = (G.mapQueue || []).map(e => e.id || (e.map && e.map.name) || '').join(',');
    const startEl = document.getElementById('start-race-btn');
    return [G.isHost ? 'h' : 'g', G.speedClass, G.lobbyLaps, G.hostMode, (G.allowedCarTypes || []).join('|'), q, startEl ? (startEl.disabled + startEl.textContent) : ''].join('~');
  }
  function openMatchConfig(){
    if (G.isHost && G.hostMode !== 'vote') {
      G.hostMode = 'vote';
      const mi = document.getElementById('host-mode-indicator'); if (mi) mi.value = 'Vote';
      if (typeof sendLobbySync === 'function') sendLobbySync();
      if (typeof refreshVoteSelectors === 'function') refreshVoteSelectors();
    }
    return openWindow('matchconfig', 'MATCH CONFIG', { width: 400, height: 480, minW: 320, minH: 300,
      onOpen: (w) => {
        renderMatchConfig(w);
        w._sig = mcSig();
        w._iv = setInterval(() => {
          if (!openWindows['matchconfig']) { clearInterval(w._iv); return; }
          const s = mcSig();
          if (s !== w._sig) { w._sig = s; renderMatchConfig(w); }
        }, 400);
      },
      onClose: (w) => { if (w._iv) clearInterval(w._iv); }
    });
  }

  // ---------- SYNCED RACE BOOT SEQUENCE ----------
  // A deterministic, seed-driven "diagnostics + launch" animation played on every
  // client so all racers see the exact same quips. Do NOT surface the sync in-game.
  const BOOT_TASKS = [
    'checking brake pedals','tracing engine framework','calibrating steering column','warming up the tires','torquing the lug nuts','inspecting spark plugs','bleeding the brake lines','aligning the chassis','tuning the exhaust note','counting the pistons','balancing the driveshaft','greasing the axles','topping off the coolant','pressurizing the tires','testing the horn','flushing the radiator','adjusting the mirrors','tightening the seatbelts','charging the battery','priming the fuel pump',
    'degaussing the tachometer','polishing the windshield','synchronizing the gearbox','testing the turn signals','recalibrating the odometer','waxing the hood','inflating the spare','checking the oil level','sniffing the fuel mixture','listening for rattles','measuring the wheelbase','rotating the tires','spinning up the turbo','cooling the intercooler','seating the brake pads','indexing the camshaft','timing the ignition','cleaning the throttle body','clearing the fuel injectors','testing the wipers',
    'revving in neutral','checking tire pressure twice','double-checking the handbrake','counting the cupholders','adjusting the seat height','testing the ejector seat','locking the differential','warming the transmission fluid','checking the nitrous levels','priming launch control','verifying downforce','measuring the drag coefficient','checking the aero balance','tightening the roll cage','testing the fire suppression','checking the harness','logging the telemetry','syncing the pit radio','testing the DRS flap','warming the clutch',
    'reticulating splines','downloading more horsepower','dividing by zero safely','reversing the polarity','spinning up the flux capacitor','consulting the Konami code','feeding the hamster wheel','asking the pit crew nicely','bribing the physics engine','yelling GO FAST at the hood','summoning the tire gods','googling how to drift','untangling the spaghetti','waking up the AI drivers','charging the boost gnomes','teaching the car to parallel park','negotiating with traction control','apologizing to last place','rolling a nat 20 on handling','overclocking the seat cushion',
    'buffering the confidence','compiling trash talk','installing racing stripes (+5 speed)','applying go-faster stickers','importing nitro from Japan','alphabetizing the toolbox','counting sheep in the fuel tank','rebooting the steering assist','defragmenting the racing line','enabling god mode (denied)','turning it off and on again','blowing on the cartridge','aligning the engine chakras','consulting the racing horoscope','checking the vibes','maximizing the vibes','calibrating the drift angle','measuring the smoke output','testing the donut radius','warming the driver ego',
    'loading pit strategy','calculating fuel windows','modeling the weather','salting the racing line','sweeping the gravel traps','inspecting the tire barriers','raising the safety car','counting the marshals','checking the flag colors','testing the podium height','polishing the trophy','chilling the champagne','printing the pit boards','measuring the track limits','painting fresh curbs','re-taping the racing line','calibrating the finish beam','syncing the lap timers','testing the pace lights','warming the grid slots',
    'greasing the wheel nuts','checking the jack points','testing the air guns','stacking the spare tires','fueling the jerry cans','testing the lollipop man','practicing the pit stop','timing the tire change','checking the wheel guns','loading soft compounds','loading hard compounds','checking the wet tires','reading the tire temps','scrubbing the new tires','balancing the wheels again','checking the brake bias','adjusting the anti-roll bar','softening the suspension','stiffening the springs','lowering the ride height',
    'testing the launch RPM','mapping the throttle curve','enriching the fuel map','leaning out the mixture','checking the boost pressure','spooling the turbos','priming the wastegate','testing the blow-off valve','checking the intercooler flow','measuring the exhaust temp','checking the knock sensor','logging the air-fuel ratio','testing the rev limiter','checking the redline','syncing the paddle shifters','testing the auto-blip','checking the heel-toe','calibrating brake pedal feel','testing the ABS threshold','checking the traction maps',
    'waking the co-driver','reading the pace notes','memorizing the corners','counting the apexes','measuring braking zones','marking the turn-in points','noting the bumps','flagging the crests','checking the run-off','testing the escape roads','surveying the chicane','measuring the hairpin','checking the straightaway','timing the sector splits','optimizing the racing line','simulating the first lap','predicting the chaos','bracing for turn one','rehearsing the start','staring at the lights',
    'cracking knuckles','adjusting the gloves','tightening the helmet','checking the visor','hydrating the driver','cueing the entrance music','clearing the grid','revving for the crowd','doing a burnout for morale','waving to nobody in particular','checking the mirror for rivals','loading the trash-talk cannon','warming the middle finger','practicing the victory pose','rehearsing the celebration','charging the confidence core','spinning the wheel dramatically','gripping ten and two','taking a deep breath','pretending to be calm',
  ];
  const BOOT_PASSES = [
    'check passed','nothing malfunctioned','all green','looks good','within tolerance','no faults found','signed off','crew gives a thumbs up','calibration nominal','systems nominal','passed with flying colors','good to go','no smoke detected','holding steady','verified','locked in','crew approves','zero errors','all clear','rock solid',
  ];
  const BOOT_STARTS = [
    'fetching race','starting engines','rolling to the grid','releasing the handbrake','dropping the green flag','igniting the afterburners','opening the throttle','loading the racetrack','summoning the pace car','lights out and away we go','firing the pistons','spinning the wheels','launching from the line','hitting the gas','engaging warp speed','unleashing the horsepower','flooring it','dropping the clutch','redlining the tach','punching the nitrous',
    'cueing the green light','waving the flag','clearing the grid','sending it','full send engaged','initiating race protocol','booting the track','spawning the opponents','entering the arena','go go go','gentlemen, start your engines','racers on your marks','priming the launch','engaging race mode','releasing the beast','opening the pit lane','lowering the barriers','counting down from three','warming the launch pad','deploying the racing line',
    'handing you the wheel','strapping you in','cutting the ribbon','firing the starting gun','raising the lights','dropping into first','spooling to redline','committing to turn one','chasing the horizon','see you at the finish line',
  ];
  function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function raceBootFade(){
    let f = document.getElementById('race-boot-fade');
    if (!f) { f = document.createElement('div'); f.id = 'race-boot-fade'; f.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:99999;'; document.body.appendChild(f); }
    return f;
  }
  // seed: shared number (the race seed). onSwitch: called once the screen is fully
  // white to swap the lobby out for the running race. Returns a Promise.
  function runRaceBootSequence(seed, onSwitch){
    return new Promise(resolve => {
      try { if (typeof audioCtx !== 'undefined' && audioCtx.resume) audioCtx.resume(); } catch(_){}
      bootingRace = true;
      closeAllWindows();
      const rng = mulberry32((seed >>> 0) || 1);
      const spinFrames = ['[/]','[|]','[\\]','[-]'];
      showTerminal();
      scroll.innerHTML = '';
      addLine('rogue-racer race daemon starting...', 'hi');
      const shuffled = BOOT_TASKS.slice();
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t; }
      const n = 3 + Math.floor(rng() * 8); // 3..10 lines
      const tasks = shuffled.slice(0, n);
      let idx = 0;
      const runTask = () => {
        if (idx >= tasks.length) { runFinal(); return; }
        const label = tasks[idx++];
        const line = addLine(label + ' ... ' + spinFrames[0], 'dim');
        let fi = 0;
        const spin = setInterval(() => { fi = (fi + 1) % spinFrames.length; line.textContent = label + ' ... ' + spinFrames[fi]; scrollDown(); }, 90);
        const dur = 240 + rng() * 620;
        setTimeout(() => {
          clearInterval(spin);
          line.textContent = label + ' ... ' + BOOT_PASSES[Math.floor(rng() * BOOT_PASSES.length)];
          line.className = 'term-line hi';
          scrollDown();
          setTimeout(runTask, 50 + rng() * 130);
        }, dur);
      };
      const runFinal = () => {
        const label = BOOT_STARTS[Math.floor(rng() * BOOT_STARTS.length)];
        const line = addLine(label + ' ... ' + spinFrames[0], 'warn');
        let fi = 0;
        const spin = setInterval(() => { fi = (fi + 1) % spinFrames.length; line.textContent = label + ' ... ' + spinFrames[fi]; scrollDown(); }, 85);
        setTimeout(() => { clearInterval(spin); line.textContent = label + ' ...'; scrollDown(); spew(); }, 560 + rng() * 480);
      };
      const spew = () => {
        const f = raceBootFade();
        f.style.transition = 'none';
        f.style.opacity = '0';
        // Meaningless but real-looking code: assemble plausible statements from fragments.
        const idents = ['engine','track','car','grid','lap','apex','boost','drift','nitro','tire','sector','node','packet','telemetry','vector','matrix','rival','physics','collision','gearbox','throttle','camera','ghost','checkpoint','surface','downforce','slipstream','chassis','suspension'];
        const props = ['speed','angle','mass','grip','heat','rpm','gear','x','y','z','vx','vy','id','state','ready','count','seed','delta','ratio','offset','yaw','pitch','load','temp'];
        const funcs = ['recalc','sync','tick','render','update','solve','apply','clamp','lerp','integrate','spawn','resolve','sample','project','normalize','dispatch','commit','flush','bind','simulate','advance','poll'];
        const ops = ['*','+','-','/','%','&','|','>>','<<'];
        const pick = (a) => a[Math.floor(rng() * a.length)];
        const num = () => (rng() < 0.35 ? '0x' + Math.floor(rng() * 65536).toString(16) : (rng() < 0.5 ? String(Math.floor(rng() * 1024)) : (rng() * 10).toFixed(2)));
        const expr = () => {
          const r = rng();
          if (r < 0.28) return pick(idents) + '.' + pick(funcs) + '(' + pick(idents) + '.' + pick(props) + ')';
          if (r < 0.52) return pick(idents) + '.' + pick(props) + ' ' + pick(ops) + ' ' + num();
          if (r < 0.74) return pick(funcs) + '(' + pick(idents) + ', ' + num() + ')';
          return pick(idents) + '[' + num() + ']';
        };
        let depth = 0;
        const codeLine = () => {
          const pad = '  '.repeat(Math.min(depth, 4));
          const r = rng();
          if (depth > 0 && r < 0.16) { depth--; return '  '.repeat(Math.min(depth, 4)) + '}'; }
          if (r < 0.16) { depth++; return pad + 'for (let i = 0; i < ' + pick(idents) + '.' + pick(props) + '; i++) {'; }
          if (r < 0.28) { depth++; return pad + 'if (' + expr() + ' > ' + num() + ') {'; }
          if (r < 0.40) return pad + 'while (' + pick(idents) + '.' + pick(props) + ') ' + expr() + ';';
          if (r < 0.56) return pad + 'const ' + pick(idents) + pick(['X','Y','V','N','T']) + ' = ' + expr() + ';';
          if (r < 0.70) return pad + pick(idents) + '.' + pick(props) + ' = ' + expr() + ';';
          if (r < 0.82) return pad + 'return ' + expr() + ';';
          if (r < 0.92) return pad + expr() + ';';
          return pad + pick(['// ','/* ']) + pick(funcs) + ' ' + pick(idents) + ' ' + pick(props);
        };
        const t0 = performance.now();
        const dur = 1900;
        const step = () => {
          const prog = Math.min(1, (performance.now() - t0) / dur);
          const linesThis = 1 + Math.floor(prog * 6);
          for (let k = 0; k < linesThis; k++) { addLine(codeLine()); }
          scrollDown();
          f.style.opacity = String(prog * prog);
          if (prog < 1) setTimeout(step, Math.max(22, 150 - prog * 130));
          else finishSwitch(f);
        };
        step();
      };
      const finishSwitch = (f) => {
        f.style.opacity = '1';
        setTimeout(() => {
          hideTerminal();
          scroll.innerHTML = '';
          try { if (typeof onSwitch === 'function') onSwitch(); } catch(e){}
          f.style.transition = 'opacity .55s ease';
          requestAnimationFrame(() => { f.style.opacity = '0'; });
          setTimeout(() => { bootingRace = false; resolve(); }, 620);
        }, 160);
      };
      runTask();
    });
  }
  window.__crtRaceBoot = runRaceBootSequence;

  // Keep the room-lobby window off-screen during a race; restore it in the lobby.
  setInterval(() => {
    const gameEl = document.getElementById('game');
    const gameOn = !!(gameEl && gameEl.offsetParent !== null);
    if (gameOn || bootingRace) { if (openWindows['lobby']) closeWindow('lobby'); return; }
    const wrap = document.getElementById('lobby-room-wrap');
    const inRoomLobby = (G.myId || G.isHost) && wrap && wrap.offsetParent !== null;
    if (inRoomLobby && !openWindows['lobby']) openLobbyWindow();
  }, 300);

  // Lobby-specific help list, printed with the same spinner style as `help`.
  function printLobbyHelp(){
    const base = 'Room online; Loading lobby commands... ';
    const frames = ['/', '|', '\\', '-'];
    let fi = 0;
    const line = addLine(base + frames[0], 'dim');
    const spin = setInterval(() => { fi = (fi + 1) % frames.length; line.textContent = base + frames[fi]; scrollDown(); }, 85);
    const dur = 600 + Math.random() * 1200;
    setTimeout(() => {
      clearInterval(spin);
      line.textContent = 'Room online; Lobby commands loaded.';
      const lines = G.isHost ? [
        'Players - Show everyone in the room',
        'Matchconfig - Open match settings (host)',
        'Kick [name] - Remove a player (host)',
        'Start - Start the race (host)',
        'Laps <1-20> - Set lap count (host)',
        'Speed [class] - Set speed class (host)',
        'Mode [owner/vote] - Set round mode (host)',
        'Enableprototypes [on/off] - Allow or lock the prototype ships (host)',
        'Next - Advance to the next track (host)',
        'Tag / Color - Restyle your ship',
        'Togglechat - Chat with the room',
        'Leave - Close the room',
      ] : [
        'Players - Show everyone in the room',
        'Matchconfig - View match settings',
        'Ready - Toggle your ready state',
        'Tag / Color - Restyle your ship',
        'Togglechat - Chat with the room',
        'Leave - Leave the room',
      ];
      printLines(relabelHelp(lines), { speed: 26 });
    }, dur);
  }

  // ---------- settings helpers (settings are terminal commands now) ----------
  function pct(x){ return Math.round((x || 0) * 100); }
  function syncSettingsInputs(){
    const setV = (id, v) => { const e = document.getElementById(id); if (e) e.value = String(v); };
    const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = String(v); };
    setV('set-master', pct(AUDIO_SETTINGS.master)); setT('set-master-val', pct(AUDIO_SETTINGS.master));
    setV('set-music', pct(AUDIO_SETTINGS.music)); setT('set-music-val', pct(AUDIO_SETTINGS.music));
    setV('set-fx', pct(AUDIO_SETTINGS.fx)); setT('set-fx-val', pct(AUDIO_SETTINGS.fx));
    const t = document.getElementById('set-touch-controls'); if (t) t.checked = !!AUDIO_SETTINGS.touchControls;
  }

  // Interim opener for menus not yet converted to windows (host/join/customize/mapmaker).
  function openPanel(kind, reveal){
    G._crtPanel = kind;
    hideTerminal();
    try { if (reveal) reveal(); } catch(e){}
    document.body.classList.add('panel-open');
  }

  // ---------- commands ----------
  function shipList(){ return Object.keys(CAR_TYPES); }
  function printShipDescriptions() {
    const bar = (v, lo, hi) => {
      const n = Math.max(0, Math.min(5, Math.round((v - lo) / (hi - lo) * 5)));
      return '[' + '\u25AE'.repeat(n) + '\u25AF'.repeat(5 - n) + ']';
    };
    const INFO = {
      drifter:  { special: 'Enhanced drift grip', desc: 'Balanced all-rounder with a strong natural drift for sweeping corners.' },
      dragger:  { special: 'Shift velocity-lock mastery', desc: 'Straight-line specialist; holds the shift lock longer for huge top-end runs.' },
      puncher:  { special: 'Crash / weapon armor + shockwave', desc: 'Armored bruiser that shrugs off walls, crashes, and weapons; press Ability to punch out a shockwave that hurls nearby cars and obstacles away — hardest straight ahead and behind (8s cooldown).' },
      needle:   { special: 'Endless top speed + deploy spikes', desc: 'Featherweight with no speed ceiling; press Ability to bristle spikes that hold its line (immune to bumps except an inflated Baller) and deal 200% collision damage to anyone who rams it.' },
      baller:   { special: 'Inflate: one monster wall bounce', desc: 'Heavy wrecking ball that flings rivals aside; press Ability to balloon to double size, then the first wall you touch launches you insanely hard for one bounce — and your momentum carries after (15s cooldown).' },
      rotor:    { special: 'Propeller draft wake + Downdraft', desc: 'Builds a slipstream that slows cars behind it; must spin up from a stop and coasts on weak brakes. Hold shift and press Ability for Downdraft — a hard suction wake that brakes and drags trailing cars (only works while shifting). Its wobble grows more violent the faster it goes.' },
      coil:     { special: 'Wall-arc battery + arc storm', desc: 'Charges by hugging walls and braking (up to 200%); a full battery makes its shift rocket you along (empty drags you), and the Ability super-charges its arcs to full power in a big radius, draining the battery to stay lit. WARNING: any charge above 100% steadily cooks your own HP, worse the higher it climbs.' },
      screamer: { special: 'Blackout scream (long range)', desc: 'Honks to blast nearby rivals with a 10s black-mask blackout.' },
      holo:     { special: 'On-demand ghost phase', desc: 'Briefly turns intangible to slip through cars, walls, and obstacles.' },
    };
    const lines = [{ text: 'SHIP DATABASE', cls: 'hi' }, ''];
    shipList().forEach(k => {
      const c = CAR_TYPES[k];
      const info = INFO[k] || (typeof SHIP_LORE !== 'undefined' && SHIP_LORE[k]) || { special: '\u2014', desc: '' };
      lines.push({ text: (c.name || k), cls: 'hi' });
      lines.push('  speed    ' + bar(c.topSpeedMult, 0.9, 1.15) + '   accel ' + bar(c.accelMult, 0.5, 1.05) + '   handling ' + bar(c.handlingMult, 0.6, 1.2));
      lines.push('  armor    ' + bar(c.crashResist != null ? c.crashResist : (c.weaponResist != null ? c.weaponResist : 1.0), 0.7, 1.45) + '   fire  ' + bar(c.firePower != null ? c.firePower : 1.0, 0.6, 1.4));
      lines.push('  special  ' + info.special);
      if (info.desc) lines.push({ text: '  ' + info.desc, cls: 'dim' });
      lines.push('');
    });
    return printLines(lines, { speed: 8 });
  }

  // Ships showcase: a wide CRT window with a spinning 2D asset per ship, hover
  // lift + a live detail panel (stats, ability, unique item, fake future lore).
  // proto=false shows the regular roster; proto=true shows the prototype ships.
  function openShipsWindow(proto) {
    const winId = proto ? 'protohangar' : 'ships';
    const title = proto ? 'PROTOTYPE HANGAR' : 'SHIP HANGAR';
    return openWindow(winId, title, {
      width: Math.min(720, window.innerWidth - 40), height: 440, minW: 420, minH: 320,
      onOpen: (win) => {
        const wrap = document.createElement('div');
        wrap.className = 'ships-wrap';
        const row = document.createElement('div');
        row.className = 'ships-row';
        const detail = document.createElement('div');
        detail.className = 'ship-detail';
        wrap.appendChild(row); wrap.appendChild(detail);
        win.body.style.padding = '10px 12px';
        win.body.appendChild(wrap);

        const keys = shipList().filter(k => proto ? isPrototypeShip(k) : !isPrototypeShip(k));
        const cards = [];           // { key, canvas, cfg, spin, hover }
        const barPct = (v, lo, hi) => Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100);

        function showDetail(key) {
          const c = CAR_TYPES[key];
          const lore = SHIP_LORE[key] || {};
          const uniq = CAR_UNIQUE_POWERUPS[key];
          detail.innerHTML =
            '<h3>' + (c.name || key) + '</h3>' +
            '<div class="sd-lore">' + (lore.maker || 'Unknown Motors') + ' · est. ' + (lore.year || '20XX') +
              ' · chassis ' + (lore.chassis || '—') + '</div>' +
            '<div class="sd-bars">' +
              '<span>Top Speed</span><div class="sd-bar"><i style="width:' + barPct(c.topSpeedMult, 0.9, 1.15) + '%"></i></div>' +
              '<span>Accel</span><div class="sd-bar"><i style="width:' + barPct(c.accelMult, 0.5, 1.05) + '%"></i></div>' +
              '<span>Handling</span><div class="sd-bar"><i style="width:' + barPct(c.handlingMult, 0.6, 1.2) + '%"></i></div>' +
              '<span>Armor</span><div class="sd-bar"><i style="width:' + barPct(c.crashResist != null ? c.crashResist : (c.weaponResist != null ? c.weaponResist : 1.0), 0.7, 1.45) + '%"></i></div>' +
              '<span>Firepower</span><div class="sd-bar"><i style="width:' + barPct(c.firePower != null ? c.firePower : 1.0, 0.6, 1.4) + '%"></i></div>' +
            '</div>' +
            '<div class="sd-special">◆ ' + (lore.special || '—') + '</div>' +
            (uniq ? '<div class="sd-item">✦ Signature item: <b>' + uniq.name + '</b> — ' + uniq.desc + '</div>' : '') +
            '<div style="margin-top:6px">' + (lore.desc || '') + '</div>' +
            '<div class="sd-lore" style="margin-top:7px;font-style:italic">' + (lore.tagline || '') + '</div>';
        }

        keys.forEach((key, i) => {
          const cfg = CAR_TYPES[key];
          const card = document.createElement('div');
          card.className = 'ship-card' + (key === G.selectedCarType ? ' sel' : '');
          const cv = document.createElement('canvas');
          cv.width = 84; cv.height = 84;
          const nm = document.createElement('div');
          nm.className = 'sc-name';
          nm.textContent = cfg.name || key;
          card.appendChild(cv); card.appendChild(nm);
          row.appendChild(card);
          const rec = { key, canvas: cv, cfg, spin: i * 0.7, hover: false };
          cards.push(rec);
          card.addEventListener('mouseenter', () => { rec.hover = true; showDetail(key); });
          card.addEventListener('mouseleave', () => { rec.hover = false; });
          // Click = select this ship for your next race.
          card.addEventListener('click', () => {
            if (!CAR_TYPES[key]) return;
            if (typeof carTypeSelectable === 'function' && !carTypeSelectable(key)) {
              print('"' + (cfg.name || key) + '" is locked — the host has prototype ships disabled', 'err');
              return;
            }
            G.selectedCarType = key;
            try { refreshShipGrid(); } catch (_) {}
            getLobbyProfileInput();
            cards.forEach(r => r.canvas.parentElement.classList.toggle('sel', r.key === key));
            print('ship set to ' + (cfg.name || key), 'hi');
          });
        });

        showDetail((G.selectedCarType && CAR_TYPES[G.selectedCarType] && keys.includes(G.selectedCarType)) ? G.selectedCarType : keys[0]);

        // One shared animation loop spins every ship; hovered ones lift + speed up.
        let last = performance.now();
        function frame(now) {
          if (!openWindows[winId]) return; // window closed → stop the loop
          const dt = Math.min(0.05, (now - last) / 1000); last = now;
          for (const rec of cards) {
            rec.spin += dt * (rec.hover ? 1.8 : 0.7);
            const lift = rec.hover ? -6 : 0;
            rec.canvas.parentElement.style.transform = 'translateY(' + lift + 'px)';
            const g = rec.canvas.getContext('2d');
            g.clearRect(0, 0, 84, 84);
            g.save();
            g.translate(42, 44);
            g.rotate(rec.spin);
            const sc = 1.7;
            g.scale(sc, sc);
            // Soft ground shadow.
            g.save(); g.rotate(-rec.spin);
            g.fillStyle = 'rgba(0,0,0,0.28)';
            g.beginPath(); g.ellipse(0, 12, 12, 5, 0, 0, Math.PI * 2); g.fill();
            g.restore();
            g.fillStyle = (rec.key === G.selectedCarType) ? (G.selectedColor || '#a855f7') : '#5dffa0';
            try { drawCarSilhouette(g, rec.cfg.shape, CAR_W, CAR_H); } catch (_) {}
            try { drawCarGlass(g, rec.cfg.shape, CAR_W, CAR_H); } catch (_) {}
            g.restore();
          }
          win._raf = requestAnimationFrame(frame);
        }
        win._raf = requestAnimationFrame(frame);
      },
      onClose: (win) => { if (win._raf) cancelAnimationFrame(win._raf); },
    });
  }

  function setName(v){
    const el = document.getElementById('player-name'); if (el) el.value = String(v).slice(0,16);
    const cz = document.getElementById('lobby-c-name'); if (cz) cz.value = String(v).slice(0,16);
    getLobbyProfileInput();
    // Push our updated name out to friends who are subscribed to our presence.
    try { friendsBroadcastPresence(); } catch (_) {}
  }
  // Interactive question support: a command can ask a question and capture the
  // next entered line instead of parsing it as a command.
  let pending = null;
  let chatting = false;
  function ask(question, handler){ print(question, 'hi'); pending = handler; }
  // Chat: print a message in the sender's ship color.
  function printChat(name, text, color){
    const d = addLine('[' + name + '}- ' + text);
    if (color) { d.style.color = color; d.style.textShadow = '0 0 6px ' + color + '77'; }
    return d;
  }
  window.__crtChat = printChat;
  window.__crtPrint = (text, cls) => print(text, cls);
  // Clickable terminal line (used by friend invites, etc.).
  window.__crtClickable = (text, cls, onClick) => {
    const l = addLine(text, cls);
    if (onClick) { l.style.cursor = 'pointer'; l.addEventListener('click', onClick); }
    return l;
  };
  // Programmatic join used by friend invites / auto-join.
  window.__terminalJoin = (code) => { try { CMDS.join.run([String(code)]); } catch (_) {} };
  function sendChat(text){
    const msg = String(text).trim().slice(0, 200);
    if (!msg) return;
    const me = G.players[G.myId];
    const nameEl = document.getElementById('player-name');
    const name = (me && me.name) || (nameEl && nameEl.value) || 'Racer';
    const color = (me && me.color) || G.selectedColor || '#39ff14';
    printChat(name, msg, color);
    try { speakChat(name, msg, TTS.voice); } catch (_) {}
    const payload = { type: 'chat', id: G.myId, name, color, text: msg, voice: TTS.voice || null };
    if (G.isHost) sendToAll(payload);
    else if (hostConn) sendToHost(payload);
  }
  // Player-defined command aliases (see: commandchange).
  let CMD_ALIASES = {};
  try { CMD_ALIASES = JSON.parse(localStorage.getItem('rr-cmd-aliases') || '{}') || {}; } catch (_) {}
  function saveCmdAliases() {
    try { localStorage.setItem('rr-cmd-aliases', JSON.stringify(CMD_ALIASES)); } catch (_) {}
  }
  // Rewrite each help line's leading command word to the player's chosen alias
  // (set via `commandchange`) so the help lists reflect what they actually type.
  function relabelHelp(lines) {
    const aliasFor = {};
    for (const alias in CMD_ALIASES) { const t = CMD_ALIASES[alias]; if (t) aliasFor[t] = alias; }
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
    return lines.map((ln) => ln.replace(/^(\S+)/, (m) => {
      const a = aliasFor[m.toLowerCase()];
      return a ? cap(a) : m;
    }));
  }
  const CMDS = {
    help: { desc: 'Displays this list', instant: true, run: () => new Promise(resolve => {
      const base = 'User Requested Help; Fetching Commands... ';
      const frames = ['/', '|', '\\', '-'];
      let fi = 0;
      const line = addLine(base + frames[0], 'dim');
      const spin = setInterval(() => { fi = (fi + 1) % frames.length; line.textContent = base + frames[fi]; scrollDown(); }, 85);
      const dur = 650 + Math.random() * 1500;
      setTimeout(() => {
        clearInterval(spin);
        line.textContent = 'User Requested Help; Commands loaded.';
        printLines(relabelHelp([
          'Help - Displays this list',
          'Mapmaker - Opens map maker',
          'Tag - Draw your paint tag in a window',
          'Color - Open the ship color picker',
          'Customize [tag/name/color] - Draw tag / set name / set color',
          'Host [owner/vote] - Hosts a new race room',
          'Join [code] - Joins a race by room code',
          'Start - Starts the race (host)',
          'Ready - Toggles your ready state',
          'Upload <map name> - Send a saved map to the host queue',
          'Pending - List uploaded maps awaiting approval (host)',
          'Accept <n> - Accept a pending uploaded map (host)',
          'Reject <n> - Reject a pending uploaded map (host)',
          'Laps <1-20> - Sets lap count (host)',
          'Speed [class] - Sets speed class (host)',
          'Mode [owner/vote] - Sets round mode (host)',
          'Next - Advances to the next track (host)',
          'Players - Lists players in the room',
          'Matchconfig - Match settings window',
          'Leave - Leaves the current room',
          'Kick [name] - Removes a player (host)',
          'Togglechat - Toggle lobby chat mode',
          'Ship [type] - Sets your ship',
          'Ship desc - Shows full stats & descriptions for every ship',
          'Ships - Open the ship hangar (spinning showcase)',
          'Prototypes - Open the prototype hangar (experimental ships)',
          'Whoami - Shows your current profile',
          'Resetplayerdata - Wipe your saved profile, friends & IDs (fresh start)',
          'Myid - Shows your friend ID (share it to be added)',
          'Name <text> - Set your name & claim it as a unique username',
          'Add friend <user/id> - Send a friend request (they must accept)',
          'Friend <user/id> - Same as add friend',
          'Requests - List pending friend requests',
          'Accept <name> - Accept a friend request',
          'Decline <name> - Decline a friend request',
          'List friends - List your friends',
          'Remove friend <name> - Remove a friend by name',
          'Invite <name> - Invite a friend to your room (while hosting)',
          'Togglefriendautojoin <name> - Auto-join a friend when they host',
          'Commandchange <cmd> - Rebind any command to your own word (commandchange reset clears all)',
          'TTS [on/off] - Toggle the robot chat voices',
          'Voice <name> - Pick your chat voice (voice list to see them)',
          'Bots <0-7> / Botdiff <easy/medium/hard> - Test-track AI settings',
          'Volume [master/music/fx] <0-100> - Sets audio volume',
          'Touch [on/off] - Toggles touch controls',
          'Controls - Remap keyboard / controller bindings',
          'CRT [on/off] - Toggles the CRT filter',
          'Clear - Clears the screen',
        ]), { speed: 26 }).then(resolve);
      }, dur);
    }) },
    name: { desc: 'set name (claims it as your unique username)', run: (a) => {
      if (!a.length) { print('usage: name <text>', 'warn'); return; }
      const v = a.join(' ').slice(0,16);
      const uname = sanitizeUsername(v);
      if (uname.length < 3) {
        // Too short/odd to register — set the display name only.
        setName(v); print('name set to "' + v + '" (too short to claim as a unique username)', 'hi');
        return;
      }
      print('checking if "' + uname + '" is free…', 'dim');
      claimUsername(uname, (ok, msg) => {
        if (ok) { setName(v); print('name set to "' + v + '" — username "' + msg + '" is yours while you\'re online', 'hi'); }
        else if (msg === 'username already taken') { print('username already taken', 'err'); }
        else { setName(v); print('name set to "' + v + '" (name service unreachable: ' + msg + ')', 'dim'); }
      });
    } },
    color: { desc: 'open the ship color picker', run: () => { openColorPicker(); } },
    ship: { desc: 'set ship  (ship desc for full stats)', run: (a) => {
      const first = (a[0] || '').toLowerCase();
      if (first === 'desc' || first === 'descriptions' || first === 'info' || first === 'stats') { printShipDescriptions(); return; }
      const t = first; if (!t) { print('usage: ship <type>   (' + shipList().join(', ') + ')   ·  ship desc for stats', 'warn'); return; }
      if (!CAR_TYPES[t]) { print('unknown ship: ' + t + '  (' + shipList().join(', ') + ')', 'err'); return; }
      if (typeof isPrototypeShip === 'function' && isPrototypeShip(t) && G.allowPrototypes === false) {
        print('"' + (CAR_TYPES[t].name || t) + '" is a prototype ship — the host has them locked', 'err'); return;
      }
      if (typeof carTypeSelectable === 'function' && !carTypeSelectable(t)) { print('"' + (CAR_TYPES[t].name || t) + '" is not allowed in this room', 'err'); return; }
      G.selectedCarType = t; try { refreshShipGrid(); } catch(e){} getLobbyProfileInput();
      print('ship set to ' + (CAR_TYPES[t].name || t), 'hi');
    } },
    ships: { desc: 'open the ship hangar (spinning showcase)', win: true, run: () => openShipsWindow(false) },
    prototypes: { desc: 'open the prototype hangar (the experimental ships)', win: true, run: () => openShipsWindow(true) },
    whoami: { desc: 'profile', run: () => {
      const nm = (document.getElementById('player-name') || {}).value || 'Racer';
      const cl = (document.getElementById('car-color') || {}).value || '?';
      print('name : ' + nm); print('color: ' + cl); print('ship : ' + (CAR_TYPES[G.selectedCarType] ? CAR_TYPES[G.selectedCarType].name : G.selectedCarType));
      printCopyable('friend id: ' + FRIEND_ID, FRIEND_ID, 'hi');
    } },
    resetplayerdata: { desc: 'wipe your saved profile, friends & IDs (fresh start)', run: () => {
      ask('This wipes your name, color, paint tag, ship, friends and friend ID. Type "yes" to confirm:', (ans) => {
        if ((ans || '').trim().toLowerCase() !== 'yes') { print('reset cancelled', 'dim'); return; }
        ['rr-customization', 'rr-friends', 'rr-friend-id', 'rr-client-uid'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
        try { FRIENDS = []; } catch (_) {}
        print('player data cleared \u2014 reloading with a fresh profile\u2026', 'hi');
        setTimeout(() => { try { location.reload(); } catch (_) {} }, 900);
      });
    } },
    myid: { desc: 'show your friend ID', instant: true, run: () => {
      printCopyable('YOUR FRIEND ID: ' + FRIEND_ID, FRIEND_ID, 'hi');
      print('share it so friends can add you with:  add friend <id>', 'dim');
    } },
    friendid: { desc: 'show your friend ID', instant: true, run: () => {
      printCopyable('YOUR FRIEND ID: ' + FRIEND_ID, FRIEND_ID, 'hi');
    } },
    add: { desc: 'send a friend request  (add friend <username or ID>)', run: (a) => {
      if ((a[0] || '').toLowerCase() !== 'friend') { print('usage: add friend <username or ID>', 'warn'); return; }
      const rawArg = a.slice(1).join('').trim();
      if (!rawArg) { print('usage: add friend <username or ID>', 'warn'); return; }
      const req = { type: 'friend_request_v2', fromId: FRIEND_ID, fromName: myRacerName() };
      // Friend-ID form (AB12-CD34): request via their social peer.
      let fid = rawArg.toUpperCase();
      if (/^[A-Z0-9]{8}$/.test(fid)) fid = fid.slice(0, 4) + '-' + fid.slice(4);
      if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(fid)) {
        if (fid === FRIEND_ID) { print("that's your own ID", 'warn'); return; }
        if (FRIENDS.find(f => f.id === fid)) { print(fid + ' is already your friend', 'dim'); return; }
        friendSend(fid, req,
          (err) => print('could not deliver the request: ' + err, 'err'));
        print('friend request sent to ' + fid + ' — they have to accept it.', 'hi');
        return;
      }
      // Otherwise treat it as a claimed username.
      const uname = sanitizeUsername(rawArg);
      if (uname.length < 3) { print('usage: add friend <username or ID>   (e.g. add friend troy  /  add friend AB12-CD34)', 'warn'); return; }
      if (uname === CLAIMED_NAME) { print("that's your own username", 'warn'); return; }
      sendToUsername(uname, req, (err) => print('could not deliver the request: ' + err, 'err'));
      print('friend request sent to "' + uname + '" — they have to accept it.', 'hi');
    } },
    list: { desc: 'list friends  (list friends)', run: (a) => {
      const what = (a[0] || '').toLowerCase();
      if (what && what !== 'friends') { print('usage: list friends', 'warn'); return; }
      printCopyable('YOUR FRIEND ID: ' + FRIEND_ID + '   (share to be added)', FRIEND_ID, 'hi');
      if (!FRIENDS.length) { print('no friends yet \u2014 add one with:  add friend <id>', 'dim'); return; }
      print('FRIENDS (' + FRIENDS.length + ')', 'hi');
      FRIENDS.forEach((f, i) => {
        const nm = f.name ? ('   ' + String(f.name).slice(0, 16)) : '';
        print('  ' + (i + 1) + '. ' + f.id + nm + (f.autojoin ? '   [auto-join ON]' : ''));
      });
    } },
    remove: { desc: 'remove a friend by name  (remove friend <name>)', run: (a) => {
      if ((a[0] || '').toLowerCase() !== 'friend') { print('usage: remove friend <name>', 'warn'); return; }
      const name = a.slice(1).join(' ').trim();
      if (!name) { print('usage: remove friend <name>', 'warn'); return; }
      const f = findFriend(name);
      if (!f) { print('no friend named "' + name + '"', 'err'); return; }
      const label = f.name || f.id;
      FRIENDS = FRIENDS.filter(x => x !== f);
      saveFriends();
      friendSend(f.id, { type: 'friend_remove', fromId: FRIEND_ID });
      try { ensureAutoLinks(); } catch (_) {}
      print('removed ' + label, 'warn');
    } },
    invite: { desc: 'invite a friend to your room  (invite <name>)', run: (a) => {
      const name = a.join(' ').trim();
      if (!name) { print('usage: invite <name>', 'warn'); return; }
      if (!G.isHost || !G.myRoomCode) { print('you must be hosting a room to invite \u2014 use  host', 'err'); return; }
      const f = findFriend(name);
      if (!f) { print('no friend named "' + name + '"', 'err'); return; }
      const label = f.name || f.id;
      friendSend(f.id, { type: 'invite', fromId: FRIEND_ID, fromName: myRacerName(), code: G.myRoomCode }, (err) => print('could not invite ' + label + ': ' + err, 'err'));
      print('invited ' + label + ' to room ' + G.myRoomCode, 'hi');
    } },
    togglefriendautojoin: { desc: 'toggle auto-join a friend  (togglefriendautojoin <name>)', run: (a) => {
      const name = a.join(' ').trim();
      if (!name) { print('usage: togglefriendautojoin <name>', 'warn'); return; }
      const f = findFriend(name);
      if (!f) { print('no friend named "' + name + '"', 'err'); return; }
      const label = f.name || f.id;
      f.autojoin = !f.autojoin;
      saveFriends();
      try { ensureAutoLinks(); } catch (_) {}
      print('auto-join for ' + label + ' is ' + (f.autojoin ? 'ON' : 'OFF'), f.autojoin ? 'hi' : 'dim');
      if (f.autojoin && G.friendAutoJoinPaused) print('(auto-join is paused until you relaunch the game, since you left a room)', 'dim');
    } },
    host: { desc: 'host a race room', run: (a) => {
      const m = (a[0] || '').toLowerCase();
      window.__hostModeChoice = (m === 'vote') ? 'vote' : 'owner';
      print('Booting host node (' + window.__hostModeChoice + ' mode)...', 'dim');
      const b = document.getElementById('host-btn');
      if (!b || !b.onclick) { print('host unavailable', 'err'); return; }
      b.onclick(); // terminal stays up; the room panel updates behind it
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (G.isHost && peer && peer.id) {
          clearInterval(iv);
          const code = String(peer.id).replace(/^rogueracer-/i, '').toUpperCase();
          print('Room ready \u2014 code: ' + code, 'hi');
          openLobbyWindow();
          printLobbyHelp();
        } else if (tries > 60) { clearInterval(iv); print('Host setup timed out.', 'err'); }
      }, 100);
    } },
    join: { desc: 'join a race by code', run: (a) => {
      const code = (a[0] || '').toUpperCase();
      if (code.length < 4) { print('usage: join <ROOMCODE>', 'err'); return; }
      const el = document.getElementById('join-code'); if (el) el.value = code;
      getLobbyProfileInput();
      print('Dialing room ' + code + ' ...', 'dim');
      const b = document.getElementById('join-confirm-btn');
      if (!b || !b.onclick) { print('join unavailable', 'err'); return; }
      b.onclick(); // terminal stays up; watch the join status line
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        const js = document.getElementById('join-status');
        const txt = js ? String(js.textContent || '') : '';
        if (/connected/i.test(txt)) { clearInterval(iv); print(txt, 'hi'); openLobbyWindow(); printLobbyHelp(); }
        else if (/error|fail|disconnect/i.test(txt)) { clearInterval(iv); print(txt, 'err'); }
        else if (tries > 80) { clearInterval(iv); }
      }, 150);
    } },
    // --- room / race controls (usable while the terminal stays up) ---
    start: { desc: 'start the race (host)', run: () => {
      if (!G.isHost) { print('host only \u2014 you are not hosting', 'err'); return; }
      const b = document.getElementById('start-race-btn');
      if (b && b.onclick) { b.onclick(); const hs = document.getElementById('host-status'); if (hs && hs.textContent) print(hs.textContent, 'warn'); }
    } },
    ready: { desc: 'toggle your ready state', run: () => {
      if (!G.myId) { print('not in a room \u2014 host or join first', 'err'); return; }
      if (G.isHost) { print('host is always ready \u2014 use "start" to begin', 'warn'); return; }
      const b = document.getElementById('ready-toggle-btn');
      if (b && b.onclick) b.onclick();
      const me = G.players[G.myId];
      print('you are ' + (me && me.ready ? 'READY' : 'NOT ready'), (me && me.ready) ? 'hi' : 'dim');
    } },
    upload: { desc: 'send a saved map to the host queue', run: (a) => {
      if (!G.myId) { print('not in a room \u2014 host or join first', 'err'); return; }
      if (!G.isHost && !hostConn) { print('not connected to a host', 'err'); return; }
      const pool = [].concat(getLocalTracks(), getHistoryTracks());
      if (G.customMap && G.customMap.name) pool.push(G.customMap);

      // Shared send: validate then queue (host) or submit to host (guest).
      const sendRec = (rec) => {
        if (!rec) return;
        if (!Array.isArray(rec.waypoints) || rec.waypoints.length < 4) { print('map "' + rec.name + '" is invalid (needs 4+ nodes)', 'err'); return; }
        const map = _cleanMapForQueue(rec);
        if (G.isHost) {
          addTrackToQueue(map, 'host');
          print('Map sent. Added "' + rec.name + '" to the queue.', 'hi');
        } else {
          const me = G.players[G.myId];
          sendToHost({ type: 'map_submit', id: G.myId, fromName: me ? me.name : 'Guest', map });
          print('Map sent. "' + rec.name + '" is waiting for host approval.', 'hi');
        }
      };

      const name = a.join(' ').trim();
      if (name) {
        const lc = name.toLowerCase();
        const rec = pool.find(t => (t && t.name || '').toLowerCase() === lc);
        if (!rec) {
          print('no saved map named "' + name + '"', 'err');
          const names = [...new Set(pool.map(t => t && t.name).filter(Boolean))];
          if (names.length) print('your maps: ' + names.join(', '), 'dim');
          else print('you have no saved maps \u2014 make one in the map maker first', 'dim');
          return;
        }
        sendRec(rec);
        return;
      }

      // No map name given: list saved maps as clickable lines.
      const seen = new Set();
      const uniq = [];
      for (const t of pool) {
        const nm = t && t.name;
        if (!nm || seen.has(nm.toLowerCase())) continue;
        seen.add(nm.toLowerCase());
        uniq.push(t);
      }
      if (!uniq.length) { print('you have no saved maps \u2014 make one in the map maker first', 'dim'); return; }
      print('Your saved maps \u2014 click one to send it:', 'hi');
      uniq.forEach((rec, i) => {
        const line = addLine('  ' + (i + 1) + '. ' + rec.name, 'clickable');
        line.title = 'Click to send this map';
        line.addEventListener('click', () => sendRec(rec));
      });
    } },
    pending: { desc: 'list uploaded maps awaiting approval (host)', run: () => {
      if (!G.isHost) { print('host only', 'err'); return; }
      if (!G.pendingMaps.length) { print('no pending map submissions', 'dim'); return; }
      print('PENDING UPLOADS', 'hi');
      G.pendingMaps.forEach((pm, i) => {
        print('  ' + (i + 1) + '. "' + (pm.map.name || 'Unnamed') + '" from ' + (pm.fromName || 'Guest'));
      });
      print('use  accept <n>  or  reject <n>', 'dim');
    } },
    accept: { desc: 'accept a pending map (host) or a friend request  (accept <n|name>)', run: (a) => {
      const arg = a.join(' ').trim();
      const n = parseInt(a[0], 10);
      // Non-numeric argument = a friend request by name/id.
      if (arg && !Number.isFinite(n)) {
        const r = findPendingReq(arg);
        if (!r) { print('no friend request from "' + arg + '"  (see "requests")', 'err'); return; }
        PENDING_REQUESTS = PENDING_REQUESTS.filter(x => x !== r);
        savePendingRequests();
        if (!FRIENDS.find(f => f.id === r.id)) FRIENDS.push({ id: r.id, name: r.name || '', autojoin: false });
        saveFriends();
        friendSend(r.id, { type: 'friend_accept', fromId: FRIEND_ID, fromName: myRacerName() }, (err) => print('note: ' + err, 'dim'));
        print('you are now friends with ' + (r.name || r.id), 'hi');
        return;
      }
      if (!G.isHost) { print('host only', 'err'); return; }
      if (!G.pendingMaps.length) { print('no pending map submissions', 'dim'); return; }
      if (!Number.isFinite(n) || n < 1 || n > G.pendingMaps.length) { print('usage: accept <n>  (see "pending")', 'warn'); return; }
      const pm = acceptPendingMap(G.pendingMaps[n - 1].id);
      if (pm) print('accepted "' + (pm.map.name || 'Unnamed') + '" \u2014 added to the queue', 'hi');
    } },
    reject: { desc: 'reject a pending map (host) or a friend request  (reject <n|name>)', run: (a) => {
      const arg = a.join(' ').trim();
      const n = parseInt(a[0], 10);
      if (arg && !Number.isFinite(n)) {
        const r = findPendingReq(arg);
        if (!r) { print('no friend request from "' + arg + '"  (see "requests")', 'err'); return; }
        PENDING_REQUESTS = PENDING_REQUESTS.filter(x => x !== r);
        savePendingRequests();
        friendSend(r.id, { type: 'friend_decline', fromId: FRIEND_ID, fromName: myRacerName() });
        print('declined the request from ' + (r.name || r.id), 'warn');
        return;
      }
      if (!G.isHost) { print('host only', 'err'); return; }
      if (!G.pendingMaps.length) { print('no pending map submissions', 'dim'); return; }
      if (!Number.isFinite(n) || n < 1 || n > G.pendingMaps.length) { print('usage: reject <n>  (see "pending")', 'warn'); return; }
      const pm = rejectPendingMap(G.pendingMaps[n - 1].id);
      if (pm) print('rejected "' + (pm.map.name || 'Unnamed') + '"', 'warn');
    } },
    decline: { desc: 'decline a friend request  (decline <name>)', run: (a) => { CMDS.reject.run(a); } },
    requests: { desc: 'list pending friend requests', instant: true, run: () => {
      if (!PENDING_REQUESTS.length) { print('no pending friend requests', 'dim'); return; }
      print('FRIEND REQUESTS (' + PENDING_REQUESTS.length + ')', 'hi');
      PENDING_REQUESTS.forEach((r, i) => print('  ' + (i + 1) + '. ' + (r.name || '?') + '   ' + r.id + '   \u2192 accept ' + (r.name || r.id) + '  /  decline ' + (r.name || r.id)));
    } },
    friend: { desc: 'send a friend request  (friend <username or ID>)', run: (a) => { CMDS.add.run(['friend'].concat(a)); } },
    claimname: { desc: 'claim a unique username  (claimname <name>)', run: (a) => {
      const want = a.join(' ').trim();
      if (!want) { print('usage: claimname <name>   (3-16 letters/numbers)', 'warn'); return; }
      print('claiming "' + sanitizeUsername(want) + '"\u2026', 'dim');
      claimUsername(want, (ok, msg) => {
        if (ok) { print('username claimed: ' + msg + '   \u2014 friends can now use  friend ' + msg, 'hi'); setName(want.slice(0, 16)); }
        else print(msg, 'err');
      });
    } },
    commandchange: { desc: 'rebind a command  (commandchange <command> [alias]  ·  commandchange reset)', run: (a) => {
      const target = (a[0] || '').toLowerCase();
      // Global reset: `commandchange reset` wipes ALL aliases at once (reset is not a real command).
      if (target === 'reset' && !CMDS.reset) {
        const n = Object.keys(CMD_ALIASES).length;
        CMD_ALIASES = {};
        saveCmdAliases();
        print(n ? 'all command aliases cleared (' + n + ')' : 'no command aliases to clear', n ? 'hi' : 'dim');
        return;
      }
      if (!target || !CMDS[target]) { print('usage: commandchange <command>   e.g.  commandchange host   (or  commandchange reset  to clear all)', 'warn'); return; }
      const applyAlias = (raw) => {
        const alias = String(raw || '').trim().toLowerCase().split(/\s+/)[0];
        if (!alias) { print('cancelled', 'dim'); return; }
        if (alias === 'reset') {
          Object.keys(CMD_ALIASES).forEach(k => { if (CMD_ALIASES[k] === target) delete CMD_ALIASES[k]; });
          saveCmdAliases();
          print('aliases for "' + target + '" cleared', 'hi');
          return;
        }
        if (CMDS[alias] || CMD_ALIASES[alias]) { print('"' + alias + '" is already a command', 'err'); return; }
        Object.keys(CMD_ALIASES).forEach(k => { if (CMD_ALIASES[k] === target) delete CMD_ALIASES[k]; });
        CMD_ALIASES[alias] = target;
        saveCmdAliases();
        print('"' + alias + '" now runs "' + target + '"   (commandchange ' + target + ' reset  to undo)', 'hi');
      };
      if (a[1]) { applyAlias(a[1]); return; }
      ask('What would you like (' + target + ') to?', applyAlias);
    } },
    tts: { desc: 'toggle chat voices  (tts on/off)', instant: true, run: (a) => {
      const s = (a[0] || '').toLowerCase();
      TTS.enabled = s ? s !== 'off' : !TTS.enabled;
      print('chat voices ' + (TTS.enabled ? 'ON' : 'OFF'), TTS.enabled ? 'hi' : 'warn');
    } },
    say: { desc: 'speak text in your robot voice (test TTS)  (say <text>)', instant: true, run: (a) => {
      const txt = a.join(' ').trim();
      if (!txt) { print('usage: say <text>', 'warn'); return; }
      const wasOn = TTS.enabled; TTS.enabled = true;
      try { if (typeof audioCtx !== 'undefined' && audioCtx.state === 'suspended') audioCtx.resume(); } catch (_) {}
      TTS.recent.delete(txt.toLowerCase());   // never dedupe an explicit test
      speakChat(myRacerName(), txt, TTS.voice);
      TTS.enabled = wasOn;
      print('🔊 "' + txt + '"', 'dim');
    } },
    voice: { desc: 'pick your chat voice  (voice <name>  ·  voice list  ·  voice auto)', instant: true, run: (a) => {
      const arg = (a[0] || '').toLowerCase();
      const ids = Object.keys(TTS_VOICES);
      if (!arg || arg === 'list') {
        print('voices:  auto  ' + ids.join('  '), 'hi');
        print('current: ' + (TTS.voice || 'auto') + '   \u2014  try  voice <name>  then  say hello', 'dim');
        return;
      }
      if (!setTtsVoice(arg)) { print('unknown voice "' + arg + '"   (voice list)', 'err'); return; }
      const chosen = TTS.voice || 'auto';
      print('voice set to ' + chosen, 'hi');
      // Live preview of the new voice.
      const wasOn = TTS.enabled; TTS.enabled = true;
      try { if (typeof audioCtx !== 'undefined' && audioCtx.state === 'suspended') audioCtx.resume(); } catch (_) {}
      TTS.recent.delete('voice check');
      speakChat(myRacerName(), 'voice check', TTS.voice);
      TTS.enabled = wasOn;
    } },
    enableprototypes: { desc: 'host: allow/lock the 9 prototype ships  (enableprototypes on/off)', instant: true, run: (a) => {
      if (!G.isHost && Object.keys(G.players || {}).length > 1) { print('only the host can change prototype access', 'err'); return; }
      const s = (a[0] || '').toLowerCase();
      const next = s ? ['on','yes','true','unlock','1','enable'].includes(s) : !(G.allowPrototypes !== false);
      if (typeof setPrototypesAllowed === 'function') setPrototypesAllowed(next);
      else G.allowPrototypes = next;
      print('prototype ships ' + (G.allowPrototypes ? 'UNLOCKED' : 'LOCKED'), G.allowPrototypes ? 'hi' : 'warn');
    } },
    bots: { desc: 'set test-track bot count  (bots <0-7>)', instant: true, run: (a) => {
      const n = parseInt(a[0], 10);
      if (!Number.isFinite(n) || n < 0 || n > 7) { print('bots: ' + getBotCount() + '   difficulty: ' + getBotDifficulty() + '   (bots <0-7>)', 'hi'); return; }
      setBotCount(n);
      const b = document.getElementById('me-bots-btn'); if (b) b.innerHTML = meIcon('bots') + ' Bots: ' + n;
      print('bot count set to ' + n, 'hi');
    } },
    botdiff: { desc: 'set bot difficulty  (botdiff easy/medium/hard)', instant: true, run: (a) => {
      const v = (a[0] || '').toLowerCase();
      if (!BOT_DIFFICULTY[v]) { print('difficulty: ' + getBotDifficulty() + '   (botdiff easy/medium/hard)', 'hi'); return; }
      setBotDifficulty(v);
      const b = document.getElementById('me-botdiff-btn'); if (b) b.innerHTML = meIcon('gauge') + ' ' + v.charAt(0).toUpperCase() + v.slice(1);
      print('bot difficulty set to ' + v, 'hi');
    } },
    laps: { desc: 'set lap count (host)', run: (a) => {
      if (!G.isHost) { print('host only', 'err'); return; }
      const el = document.getElementById('host-laps-input');
      const n = parseInt(a[0], 10);
      if (!Number.isFinite(n)) { print('laps: ' + (G.lobbyLaps || (el ? el.value : '?')) + '   usage: laps <1-20>', 'hi'); return; }
      const v = Math.max(1, Math.min(20, n));
      if (el) { el.value = v; if (el.onchange) el.onchange(); }
      print('laps set to ' + v, 'hi');
    } },
    speed: { desc: 'set speed class (host)', run: (a) => {
      if (!G.isHost) { print('host only', 'err'); return; }
      const sel = document.getElementById('speed-class');
      const opts = sel ? Array.from(sel.options).map(o => o.value) : [];
      const c = (a[0] || '').toLowerCase();
      if (!c) { print('speed class: ' + (sel ? sel.value : '?'), 'hi'); print('options: ' + opts.join(', '), 'dim'); return; }
      if (!opts.includes(c)) { print('unknown class: ' + c, 'err'); print('options: ' + opts.join(', '), 'dim'); return; }
      sel.value = c; if (sel.onchange) sel.onchange();
      print('speed class set to ' + c, 'hi');
    } },
    mode: { desc: 'set round mode owner/vote (host)', run: (a) => {
      if (!G.isHost) { print('host only', 'err'); return; }
      const want = (a[0] || '').toLowerCase();
      if (want !== 'owner' && want !== 'vote') { print('round mode: ' + (G.hostMode || 'owner') + '   usage: mode <owner/vote>', 'hi'); return; }
      if ((G.hostMode || 'owner') !== want) { const b = document.getElementById('host-cycle-mode-btn'); if (b && b.onclick) b.onclick(); }
      print('round mode set to ' + want, 'hi');
    } },
    next: { desc: 'advance to next track (host)', run: () => {
      if (!G.isHost) { print('host only', 'err'); return; }
      if (typeof hostAdvanceQueue === 'function') { hostAdvanceQueue(); print('advancing to next track...', 'dim'); }
      else print('cannot advance right now', 'err');
    } },
    players: { desc: 'list players in the room', run: () => {
      if (!G.myId && !G.isHost) { print('not in a room', 'err'); return; }
      const entries = Object.entries(G.players || {});
      if (!entries.length) { print('no players yet', 'warn'); return; }
      printLines([{ text: 'PLAYERS (' + entries.length + ')', cls: 'hi' }].concat(
        entries.map(([id, p]) => '  ' + String((p && p.name) || 'Racer').slice(0, 16).padEnd(17) + (p && p.ready ? 'ready' : '...') + (id === G.myId ? '  (you)' : ''))
      ), { speed: 8 });
    } },
    leave: { desc: 'leave the current room', run: () => {
      if (!G.myId && !G.isHost) { print('not in a room', 'warn'); return; }
      leaveRoom();
    } },
    matchconfig: { desc: 'open match settings', win: true, run: () => {
      if (!G.myId && !G.isHost) { print('not in a room \u2014 host or join first', 'warn'); return; }
      openMatchConfig();
    } },
    kick: { desc: 'remove a player (host)', run: (a) => {
      if (!G.isHost) { print('host only', 'err'); return; }
      const raw = a.join(' ').trim();
      if (!raw) { print('usage: kick <name>', 'err'); return; }
      const name = raw.toLowerCase();
      const others = Object.values(G.players || {}).filter(p => p.id !== G.myId);
      const match = others.find(p => String(p.name || '').toLowerCase() === name)
                 || others.find(p => String(p.name || '').toLowerCase().startsWith(name));
      if (!match) { print('no player named "' + raw + '"', 'err'); return; }
      if (typeof kickPlayer === 'function') kickPlayer(match.id);
      print('kicked ' + (match.name || 'player'), 'warn');
    } },
    customize: { desc: 'open the ship customization window', win: true, run: (a) => {
      const sub = (a[0] || '').toLowerCase();
      if (sub === 'name') {
        ask('Enter your racer name:', (ans) => {
          const v = (ans || '').trim().slice(0, 16);
          if (!v) { print('name unchanged', 'warn'); return; }
          setName(v); print('name set to "' + v + '"', 'hi');
        });
        return;
      }
      if (sub === 'color') { openColorPicker(); return; }
      if (sub === 'tag') { openTagDraw(); return; }
      // no argument -> open the full ship customization window.
      openShipCustomize();
    } },
    customization: { desc: 'open the ship customization window', win: true, run: () => { openShipCustomize(); } },
    tag: { desc: 'draw your paint tag', win: true, run: () => { openTagDraw(); } },
    color: { desc: 'open the car color picker', win: true, run: () => { openColorPicker(); } },
    mapmaker: { desc: 'Opens map maker', win: true, run: () => { openMapMakerWindow(); } },
    editor: { desc: 'Opens map maker', win: true, run: () => { openMapMakerWindow(); } },
    settings: { desc: 'audio settings', run: () => {
      print('Audio — master ' + pct(AUDIO_SETTINGS.master) + '  music ' + pct(AUDIO_SETTINGS.music) + '  fx ' + pct(AUDIO_SETTINGS.fx) + '   touch ' + (AUDIO_SETTINGS.touchControls ? 'ON' : 'OFF'), 'hi');
      print('use: volume [master/music/fx] <0-100>   |   touch [on/off]', 'dim');
    } },
    volume: { desc: 'set audio volume', run: (a) => {
      const ch = (a[0] || '').toLowerCase();
      if (!ch) {
        print('Volume — master ' + pct(AUDIO_SETTINGS.master) + '  music ' + pct(AUDIO_SETTINGS.music) + '  fx ' + pct(AUDIO_SETTINGS.fx), 'hi');
        print('usage: volume [master/music/fx] <0-100>', 'dim'); return;
      }
      if (ch !== 'master' && ch !== 'music' && ch !== 'fx') { print('unknown channel: ' + ch + '  (master/music/fx)', 'err'); return; }
      const raw = parseInt(a[1], 10);
      if (!Number.isFinite(raw)) { print(ch + ' volume is ' + pct(AUDIO_SETTINGS[ch]), 'hi'); return; }
      const v = Math.max(0, Math.min(100, raw));
      AUDIO_SETTINGS[ch] = v / 100;
      try { applyAudioSettings(); saveAudioSettings(); syncSettingsInputs(); } catch(e){}
      print(ch + ' volume set to ' + v, 'hi');
    } },
    touch: { desc: 'toggle touch controls', run: (a) => {
      const s = (a[0] || '').toLowerCase();
      if (s === 'on') AUDIO_SETTINGS.touchControls = true;
      else if (s === 'off') AUDIO_SETTINGS.touchControls = false;
      else AUDIO_SETTINGS.touchControls = !AUDIO_SETTINGS.touchControls;
      try { applyAudioSettings(); saveAudioSettings(); syncSettingsInputs(); } catch(e){}
      print('touch controls ' + (AUDIO_SETTINGS.touchControls ? 'ON' : 'OFF'), 'hi');
    } },
    controls: { desc: 'remap controls', instant: true, run: () => {
      try { openKeybindModal(); print('Controls menu opened. Click a slot, then press a key or controller button.', 'hi'); }
      catch (e) { print('could not open controls: ' + e.message, 'err'); }
    } },
    keybinds: { desc: 'remap controls', instant: true, run: () => {
      try { openKeybindModal(); print('Controls menu opened.', 'hi'); }
      catch (e) { print('could not open controls: ' + e.message, 'err'); }
    } },
    crt: { desc: 'toggle crt', run: (a) => {
      const s = (a[0] || '').toLowerCase();
      if (s === 'off') { window.__crtDisabled = true; print('CRT filter OFF', 'warn'); }
      else { window.__crtDisabled = false; print('CRT filter ON', 'hi'); }
    } },
    togglechat: { desc: 'toggle lobby chat', instant: true, run: () => {
      chatting = !chatting;
      print(chatting ? 'Now chatting...' : 'No longer chatting.', 'err');
    } },
    clear: { desc: 'clear', instant: true, run: () => { scroll.innerHTML = ''; } },
    cls: { desc: 'clear', instant: true, run: () => { scroll.innerHTML = ''; } },
    reboot: { desc: 'reboot', instant: true, run: () => { scroll.innerHTML = ''; boot(); } },
    version: { desc: 'version', instant: true, run: () => { print('Rogue Racer v' + GAME_VERSION, 'hi'); } },
    reload: { desc: 'reload the engine (pulls the latest version)', instant: true, run: () => {
      print('Reloading engine \u2014 fetching the latest version...', 'hi');
      print('(currently on v' + GAME_VERSION + ')', 'dim');
      // The self-updating loader re-fetches rogue-racer.html on load, so a reload
      // is how you pull a newer build. Delay briefly so this text renders first.
      setTimeout(() => { try { location.reload(); } catch (_) {} }, 450);
    } },
    about: { desc: 'about', run: () => printLines([
      { text: 'ROGUE RACER OS', cls: 'hi' },
      'A multiplayer roguelike racer rendered on an imaginary CRT.',
      'All menus are a terminal. Try: host, join <code>, editor.',
    ], { speed: 12 }) },
  };

  // A short spinner shown before non-window commands run, matching the help style.
  function genericLoad(){
    return new Promise(resolve => {
      const frames = ['/', '|', '\\', '-'];
      let fi = 0;
      const base = 'Loading... ';
      const line = addLine(base + frames[0], 'dim');
      const spin = setInterval(() => { fi = (fi + 1) % frames.length; line.textContent = base + frames[fi]; scrollDown(); }, 85);
      const dur = 320 + Math.random() * 480;
      setTimeout(() => { clearInterval(spin); line.remove(); resolve(); }, dur);
    });
  }
  function run(raw){
    const v = String(raw).trim();
    addLine(promptEl.textContent + ' ' + raw, 'dim');
    if (!v) return;
    history.unshift(v); histIdx = -1; if (history.length > 60) history.pop();
    const parts = v.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    let c = CMDS[cmd];
    if (!c && CMD_ALIASES[cmd] && CMDS[CMD_ALIASES[cmd]]) c = CMDS[CMD_ALIASES[cmd]];
    if (!c) { print('Unknown command "' + v + '" use "HELP" for a list of commands.', 'err'); return; }
    const exec = () => {
      try { const r = c.run(parts.slice(1)); if (r && r.catch) r.catch(e => print('error: ' + e.message, 'err')); }
      catch(e){ print('error: ' + e.message, 'err'); }
    };
    // help self-animates; window commands launch via openWindow; both skip the loader.
    if (c.instant || c.win) { exec(); return; }
    genericLoad().then(exec);
  }

  // ---------- live event feed (join / leave / ship / host settings) ----------
  let evtState = null;
  function evtInRoom(){ return !!(G.myId || G.isHost); }
  function evtSnapshot(){
    const players = {};
    Object.values(G.players || {}).forEach(p => { players[p.id] = { name: p.name, carType: p.carType }; });
    return { players, speed: G.speedClass, laps: G.lobbyLaps, mode: G.hostMode };
  }
  function evtHostName(){ const a = Object.values(G.players || {}); return (a[0] && a[0].name) || 'Host'; }
  function evtSpeedLabel(v){ const sel = document.getElementById('speed-class'); if (sel) { const o = Array.from(sel.options).find(o => o.value === v); if (o) return o.textContent; } return v; }
  function pollEvents(){
    if (!evtInRoom()) { evtState = null; return; }
    const cur = evtSnapshot();
    if (!evtState) { evtState = cur; return; }
    const prev = evtState;
    Object.keys(cur.players).forEach(id => {
      if (id === G.myId) return;
      const c = cur.players[id];
      if (!prev.players[id]) print(c.name + ' joined the lobby.', 'dim');
      else if (prev.players[id].carType !== c.carType) print(c.name + ' changed their ship to ' + getCarTypeCfg(c.carType).name + '.', 'dim');
    });
    Object.keys(prev.players).forEach(id => {
      if (id === G.myId) return;
      if (!cur.players[id]) print(prev.players[id].name + ' left the lobby.', 'dim');
    });
    if (!G.isHost) {
      const hn = evtHostName();
      if (prev.speed !== cur.speed && cur.speed != null) print('Host ' + hn + ' changed speed to ' + evtSpeedLabel(cur.speed) + '.', 'warn');
      if (prev.laps !== cur.laps && cur.laps != null) print('Host ' + hn + ' changed laps to ' + cur.laps + '.', 'warn');
      if (prev.mode !== cur.mode && cur.mode != null) print('Host ' + hn + ' changed mode to ' + cur.mode + '.', 'warn');
    }
    evtState = cur;
  }
  setInterval(pollEvents, 450);

  input.addEventListener('input', () => { typed.textContent = input.value; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; typed.textContent = ''; if (pending) { addLine(promptEl.textContent + ' ' + v, 'dim'); const h = pending; pending = null; try { h(v); } catch(err){ print('error: ' + err.message, 'err'); } } else if (chatting && v.trim().toLowerCase() !== 'togglechat') { sendChat(v); } else if (!v.trim()) { run('help'); } else run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (history.length) { histIdx = Math.min(histIdx + 1, history.length - 1); input.value = history[histIdx] || ''; typed.textContent = input.value; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); histIdx = Math.max(histIdx - 1, -1); input.value = histIdx >= 0 ? (history[histIdx] || '') : ''; typed.textContent = input.value; }
    else if (e.key === 'Tab') { e.preventDefault(); const p = input.value.toLowerCase(); const m = Object.keys(CMDS).filter(k => k.startsWith(p)); if (m.length === 1) { input.value = m[0] + ' '; typed.textContent = input.value; } else if (m.length > 1) { print(m.join('   '), 'dim'); } }
    else if ((e.key === 'l' || e.key === 'L') && e.ctrlKey) { e.preventDefault(); scroll.innerHTML = ''; }
  });
  term.addEventListener('mousedown', () => { setTimeout(() => { try { input.focus(); } catch(e){} }, 0); });
  window.addEventListener('focus', () => { if (term.classList.contains('on')) { try { input.focus(); } catch(e){} } });

  function boot(){
    addLine('ROGUE RACER OS', 'hi');
    // Dim "preview" hint that types itself out, letter by letter, to nudge the
    // user toward the help command (Enter also works — intentionally unstated).
    const hint = addLine('', 'dim');
    const msg = 'type help to begin';
    let i = 0;
    if (window.__introTyper) clearInterval(window.__introTyper);
    window.__introTyper = setInterval(() => {
      hint.textContent = msg.slice(0, ++i);
      scrollDown();
      if (i >= msg.length) { clearInterval(window.__introTyper); window.__introTyper = null; }
    }, 38);
  }

  // Persistent version readout in the corner of the terminal.
  (function initVersionTicker(){
    try {
      const v = document.getElementById('term-version');
      if (v) v.textContent = 'v' + GAME_VERSION;
    } catch (e) {}
  })();

  showTerminal();
  boot();

  window.__crtDisabled = true; 
})();

(function crtActiveLoop(){
  updateCrtActive();
  requestAnimationFrame(crtActiveLoop);
})();

// Startup: prompt for the game folder (audio + saves), remembering it across sessions.
initGameFolderGate();

// Toggle the CRT filter + panel state based on which menu screen is visible.
function updateCrtActive(){
  const term = document.getElementById('crt-terminal');
  const termOn = !!(term && term.classList.contains('on'));
  const vis = (id) => { const e = document.getElementById(id); return !!(e && e.style.display !== 'none' && e.offsetParent !== null); };
  const gameEl = document.getElementById('game');
  const gameOn = !!(gameEl && gameEl.offsetParent !== null);
  // While a race is on, the terminal must never cover it.
  if (gameOn && term && term.classList.contains('on')) {
    term.classList.remove('on');
    document.body.classList.remove('crt-active', 'panel-open');
    return;
  }
  const results = vis('results-screen');
  const upgrade = vis('upgrade-screen');
  const editor = vis('screen-map-editor');
  const settings = vis('settings-panel') && !gameOn;
  const lobbyOn = vis('lobby') && !gameOn;
  const panelOpen = !termOn && (lobbyOn || editor || settings);
  let crtActive = termOn || panelOpen || results || upgrade;
  if (window.__crtDisabled) crtActive = false;
  document.body.classList.toggle('crt-active', !!crtActive);
  document.body.classList.toggle('panel-open', !!panelOpen);

  // Whenever we land back on the bare main menu (via any back button, kick or
  // disconnect), restore the terminal as the front-end.
  const lm = document.getElementById('lobby-main');
  const lobbyMainVisible = lm && lm.style.display !== 'none' && lobbyOn;
  if (lobbyMainVisible && !termOn && !editor && window.__crtShowTerminal) window.__crtShowTerminal();
}