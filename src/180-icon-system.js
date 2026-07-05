// ============================================================
// ICON SYSTEM — crisp inline SVGs replacing UI emojis.
// Item/upgrade icons are bold + filled (readable at 14px on the HUD);
// editor icons are strokes that inherit the button's color.
// ============================================================
function iconSvg(id, size) {
  const s = size || 14;
  const bodies = {
    // Items — filled, colorful, unmistakable.
    boost:   '<path fill="#fbbf24" d="M9 1 3 9h3.4L6 15l7-8.6H9.6z"/>',
    shield:  '<path fill="#06b6d4" d="M8 1 14 3.4v4.3c0 3.6-2.6 6.2-6 7.3-3.4-1.1-6-3.7-6-7.3V3.4z"/><path fill="#e0f2fe" d="M8 3.2 12 4.8v2.9c0 2.5-1.7 4.4-4 5.3z"/>',
    missile: '<path fill="#ef4444" d="M6.6 2.6C7.3 1.4 8.7 1.4 9.4 2.6L10.5 5v6h-5V5z"/><path fill="#fbbf24" d="M8 0.6 9.4 2.6H6.6z"/><path fill="#b91c1c" d="M5.5 11 4 14l2.6-1h2.8L12 14l-1.5-3z"/><path fill="#f97316" d="M7 13.3 8 15.6 9 13.3z"/>',
    mine:    '<circle fill="#f97316" cx="8" cy="9" r="4.4"/><path stroke="#f97316" stroke-width="1.6" d="M8 3.4V1.6M3.6 9H1.8M14.2 9h-1.8M4.9 5.9 3.6 4.6M11.1 5.9l1.3-1.3"/><circle fill="#1c1917" cx="8" cy="9" r="1.6"/>',
    pulse:   '<circle fill="none" stroke="#fb7185" stroke-width="1.8" cx="8" cy="8" r="2.4"/><circle fill="none" stroke="#fb7185" stroke-width="1.4" opacity="0.7" cx="8" cy="8" r="5"/><circle fill="none" stroke="#fb7185" stroke-width="1" opacity="0.4" cx="8" cy="8" r="7.2"/>',
    oil:     '<path fill="#64748b" d="M8 1.6c2.6 3.2 4.6 5.7 4.6 8.2A4.6 4.6 0 0 1 8 14.4 4.6 4.6 0 0 1 3.4 9.8C3.4 7.3 5.4 4.8 8 1.6z"/><path fill="#94a3b8" d="M6.4 10.4a2 2 0 0 0 2 2v-1.2a1 1 0 0 1-.9-.8z"/>',
    ghost:   '<path fill="#c084fc" d="M8 1.6a5 5 0 0 1 5 5v7.4l-1.7-1.4-1.6 1.4L8 12.6 6.3 14 4.7 12.6 3 14V6.6a5 5 0 0 1 5-5z"/><circle fill="#2e1065" cx="6.2" cy="6.6" r="1"/><circle fill="#2e1065" cx="9.8" cy="6.6" r="1"/>',
    repair:  '<path fill="#4ade80" d="M13.8 4.7a3.9 3.9 0 0 1-5.2 4.9L4.8 13.4a1.7 1.7 0 0 1-2.4-2.4l3.8-3.8a3.9 3.9 0 0 1 4.9-5.2L8.9 4.2l0.8 2.1 2.1.8z"/>',
    emp:     '<path fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" d="M8 2.2a5.8 5.8 0 1 1-5.7 4.7"/><path fill="#38bdf8" d="M2.5 2.6 5 6.9H1.6z"/><circle fill="#7dd3fc" cx="8" cy="8" r="1.7"/>',
    prop_replenish: '<circle fill="#22d3ee" cx="8" cy="8" r="1.8"/><path fill="#22d3ee" opacity="0.85" d="M8 6.4C8 3.4 9.5 1.6 12 2.2 11 4.4 9.6 5.7 8 6.4zM8 9.6c0 3-1.5 4.8-4 4.2 1-2.2 2.4-3.5 4-4.2zM6.4 8C3.4 8 1.6 6.5 2.2 4 4.4 5 5.7 6.4 6.4 8zM9.6 8c3 0 4.8 1.5 4.2 4-2.2-1-3.5-2.4-4.2-4z"/>',
    zap:     '<path fill="#a78bfa" d="M9 1 3 9h3.4L6 15l7-8.6H9.6z"/><circle fill="none" stroke="#a78bfa" stroke-width="1.2" opacity="0.6" cx="8" cy="8" r="7"/>',
    flipper: '<path fill="none" stroke="#f472b6" stroke-width="1.9" stroke-linecap="round" d="M12.6 5.4A5.4 5.4 0 0 0 3 6.8"/><path fill="#f472b6" d="M2.2 3.4v4h4z"/><path fill="none" stroke="#f472b6" stroke-width="1.9" stroke-linecap="round" d="M3.4 10.6a5.4 5.4 0 0 0 9.6-1.4"/><path fill="#f472b6" d="M13.8 12.6v-4h-4z"/>',
    // Upgrades
    topspeed:'<path fill="#f97316" d="M1.5 8.7h6l-2 4.7 8.9-7.1h-6l2-4.7z"/>',
    accel:   '<path fill="#ef4444" d="M2 13.5c0-3.3 2.2-5.1 4.4-5.7A6.2 6.2 0 0 1 13 2.1c.8 3.9-1.3 6.4-3.7 7.3-.4 1.9-1.9 4.1-7.3 4.1z"/><circle fill="#fef3c7" cx="10" cy="5.6" r="1.3"/>',
    handling:'<circle fill="none" stroke="#22d3ee" stroke-width="1.9" cx="8" cy="8" r="5.6"/><circle fill="#22d3ee" cx="8" cy="8" r="1.7"/><path stroke="#22d3ee" stroke-width="1.9" d="M8 2.4v3M8 10.6v3M2.4 8h3M10.6 8h3"/>',
    luckbox: '<rect fill="#fbbf24" x="2" y="2" width="12" height="12" rx="2.4"/><circle fill="#78350f" cx="5.4" cy="5.4" r="1.15"/><circle fill="#78350f" cx="10.6" cy="5.4" r="1.15"/><circle fill="#78350f" cx="8" cy="8" r="1.15"/><circle fill="#78350f" cx="5.4" cy="10.6" r="1.15"/><circle fill="#78350f" cx="10.6" cy="10.6" r="1.15"/>',
    armor:   '<path fill="#94a3b8" d="M8 1 14 3.4v4.3c0 3.6-2.6 6.2-6 7.3-3.4-1.1-6-3.7-6-7.3V3.4z"/><path fill="#475569" d="M8 1v14c-3.4-1.1-6-3.7-6-7.3V3.4z"/>',
    draft:   '<path fill="none" stroke="#a5f3fc" stroke-width="1.8" stroke-linecap="round" d="M1.6 5h8.6a2 2 0 1 0-2-2.6M1.6 8.4h11.2a2 2 0 1 1-2 2.6M1.6 11.8h5.2"/>',
    regen:   '<path fill="none" stroke="#4ade80" stroke-width="1.9" stroke-linecap="round" d="M13 6.6A5.4 5.4 0 0 0 3.6 5"/><path fill="#4ade80" d="M2.6 1.8v4h4z"/><path fill="none" stroke="#4ade80" stroke-width="1.9" stroke-linecap="round" d="M3 9.4a5.4 5.4 0 0 0 9.4 1.6"/><path fill="#4ade80" d="M13.4 14.2v-4h-4z"/>',
    mag:     '<path fill="none" stroke="#f87171" stroke-width="2.6" d="M4 2v6a4 4 0 0 0 8 0V2"/><path fill="#e2e8f0" d="M2.7 1h2.6v3H2.7zM10.7 1h2.6v3h-2.6z"/>',
    overdrive:'<circle fill="none" stroke="#fde047" stroke-width="1.9" cx="8" cy="8.6" r="5.4"/><path stroke="#fde047" stroke-width="1.9" stroke-linecap="round" d="M8 8.6 10.8 6M6.4 1.4h3.2"/>',
  };
  const body = bodies[id];
  if (!body) return '';
  return `<svg width="${s}" height="${s}" viewBox="0 0 16 16" style="vertical-align:-2px" aria-hidden="true">${body}</svg>`;
}

// Editor toolbar icons: monochrome strokes that inherit each button's color.
const ME_ICONS = {
  road:      '<path d="M2 14C4 9 12 7 14 2"/><path d="M6.2 11.2l1.2.8M9.5 8l1.2.8M12 4.6l1.2.8" opacity="0.7"/>',
  ice:       '<path d="M8 1.5v13M2.4 4.7l11.2 6.6M13.6 4.7 2.4 11.3M8 4.5 6 2.9M8 4.5l2-1.6M8 11.5l-2 1.6M8 11.5l2 1.6"/>',
  river:     '<path d="M1.5 5.5c2.2-2 4.3 2 6.5 0s4.3 2 6.5 0M1.5 10.5c2.2-2 4.3 2 6.5 0s4.3 2 6.5 0"/>',
  void:      '<circle cx="8" cy="8" r="5.8"/><path d="M3.9 12.1 12.1 3.9"/>',
  checkpoint:'<path d="M3.5 14.5v-13"/><path d="M3.5 2h9l-2.2 2.8L12.5 7h-9"/>',
  slope:     '<path d="M2 13h12"/><path d="M2 13 12 4.5"/><path d="M12 4.5V8M12 4.5H8.5"/>',
  split:     '<path d="M8 14V9"/><path d="M8 9C8 6 4.5 6.5 4.5 3M8 9c0-3 3.5-2.5 3.5-6"/><circle cx="4.5" cy="2.4" r="1.1"/><circle cx="11.5" cy="2.4" r="1.1"/>',
  nodes:     '<circle cx="3.2" cy="12.8" r="1.7"/><circle cx="8" cy="4" r="1.7"/><circle cx="12.8" cy="11" r="1.7"/><path d="M4.4 11.5 6.9 5.5M9.6 5.1l2.3 4.5"/>',
  walls:     '<path d="M1.5 3.5h13v9h-13z"/><path d="M1.5 6.5h13M1.5 9.5h13M5.8 3.5v3M10.2 6.5v3M5.8 9.5v3"/>',
  obstacles: '<path d="M8 1.8 14 5v6L8 14.2 2 11V5z"/><path d="M8 6.2v3.2M8 11.4v.4" stroke-width="2"/>',
  items:     '<rect x="2" y="5.5" width="12" height="8.5" rx="1"/><path d="M8 5.5v8.5M2 8.8h12"/><path d="M8 5.5C5.5 5.5 4 2.5 6 1.8 7.4 1.3 8 3.5 8 5.5c0-2 0.6-4.2 2-3.7 2 0.7 0.5 3.7-2 3.7z"/>',
  erase:     '<path d="M5.5 13.5 1.8 9.8a1.4 1.4 0 0 1 0-2L7.5 2a1.4 1.4 0 0 1 2 0l4.4 4.4a1.4 1.4 0 0 1 0 2l-5 5.1z"/><path d="M4 6 10 12"/><path d="M5.5 13.5H14"/>',
  save:      '<path d="M2.5 2.5h9L13.5 5v8.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M5 2.5V6h5V2.5M5 14v-4.5h6V14"/>',
  import:    '<path d="M8 1.8v7.4M5 6.5 8 9.6l3-3.1"/><path d="M2 10.5v2.5a1.2 1.2 0 0 0 1.2 1.2h9.6A1.2 1.2 0 0 0 14 13v-2.5"/>',
  folder:    '<path d="M1.8 4a1.2 1.2 0 0 1 1.2-1.2h3.4L8 4.6h6.2v8.2a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z"/>',
  newdoc:    '<path d="M8 3v10M3 8h10"/>',
  play:      '<path d="M4 2.5 13 8l-9 5.5z"/>',
  bots:      '<rect x="2.8" y="5" width="10.4" height="8" rx="2"/><path d="M8 5V2.4M8 2.4h2.4"/><circle cx="5.9" cy="8.6" r="1.05"/><circle cx="10.1" cy="8.6" r="1.05"/><path d="M6 11.2h4"/>',
  gauge:     '<path d="M2.2 12.5a6.5 6.5 0 0 1 11.6 0"/><path d="M8 12.5 11 7"/><circle cx="8" cy="12.5" r="1.2"/>',
  tests:     '<path d="M6 1.8h4M7 1.8v4.4L3 12a2 2 0 0 0 1.8 3h6.4A2 2 0 0 0 13 12L9 6.2V1.8"/><path d="M4.6 10.5h6.8"/>',
};
function meIcon(name) {
  const b = ME_ICONS[name];
  return b ? `<svg viewBox="0 0 16 16" aria-hidden="true">${b}</svg>` : '';
}

// Inject SVG icons into the map-editor chrome (replaces the emoji labels).
(function initEditorIcons() {
  const put = (el, icon, label) => {
    if (!el) return;
    el.innerHTML = meIcon(icon) + (label != null ? label : el.textContent.trim());
  };
  const byId = (id) => document.getElementById(id);
  document.querySelectorAll('.me-type-btn[data-type]').forEach(btn => {
    const t = btn.dataset.type;
    put(btn, t === 'road' ? 'road' : t === 'ice' ? 'ice' : t === 'river' ? 'river' : 'void');
  });
  put(byId('me-node-checkpoint'), 'checkpoint');
  put(byId('me-node-slope'), 'slope');
  put(byId('me-node-split'), 'split');
  put(byId('me-mode-waypoint'), 'nodes');
  put(byId('me-mode-wall'), 'walls');
  put(byId('me-mode-obstacle'), 'obstacles');
  put(byId('me-mode-powerup'), 'items');
  put(byId('me-mode-erase'), 'erase');
  put(byId('me-save-to-local-btn'), 'save', ' Save to Local');
  put(byId('me-import-track-btn'), 'import', ' Import .json');
  put(byId('me-connect-folder-btn'), 'folder', ' Connect folder…');
  put(byId('lib-connect-folder-btn'), 'folder', ' Connect folder…');
  put(byId('me-new-btn'), 'newdoc', ' New');
  put(byId('me-test-btn'), 'play', ' Test Track');
  put(byId('me-run-regression-btn'), 'tests', ' Run Layer Tests');
})();

// Bot-count picker in the Map Editor header ("Test Track" runs vs bots).
(function initBotUi() {
  const testBtn = document.getElementById('me-test-btn');
  if (!testBtn || !testBtn.parentNode) return;
  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary';
  btn.id = 'me-bots-btn';
  btn.style.fontSize = '.8rem';
  btn.title = 'AI opponents for Test Track';
  const seq = [0, 1, 2, 3, 5, 7];
  const label = () => { btn.innerHTML = meIcon('bots') + ' Bots: ' + getBotCount(); };
  btn.onclick = () => {
    const i = seq.indexOf(getBotCount());
    setBotCount(seq[(i + 1) % seq.length]);
    label();
  };
  label();
  testBtn.parentNode.insertBefore(btn, testBtn);
  // Difficulty picker: how hard the AI pushes (skill / cornering / rubber-band).
  const dBtn = document.createElement('button');
  dBtn.className = 'btn btn-secondary';
  dBtn.id = 'me-botdiff-btn';
  dBtn.style.fontSize = '.8rem';
  dBtn.title = 'Bot difficulty';
  const dLabel = () => {
    const d = getBotDifficulty();
    dBtn.innerHTML = meIcon('gauge') + ' ' + d.charAt(0).toUpperCase() + d.slice(1);
  };
  dBtn.onclick = () => {
    const order = ['easy', 'medium', 'hard'];
    setBotDifficulty(order[(order.indexOf(getBotDifficulty()) + 1) % order.length]);
    dLabel();
  };
  dLabel();
  testBtn.parentNode.insertBefore(dBtn, testBtn);
})();
