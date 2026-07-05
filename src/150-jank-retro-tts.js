// ============================================================
// JANK RETRO TTS — per-player robot voices for lobby chat.
// Not real speech: 8-bit style character babble. Each racer's name
// hashes to a base pitch, waveform, and tempo, so everyone gets their
// own recognizably awful voice. Messages queue with a gap (slowdown),
// and a repeated message within 30s prints silently.
// ============================================================
const TTS = { queue: [], playing: false, recent: new Map(), enabled: true, voice: null };

// Named voice presets selectable with the `voice` command. Each overrides the
// per-name-hash defaults; omitted fields fall back in ttsSpeak (consonantBoost
// 1.35 / cutoff 2100 / Q 2.5). `null`/'auto' = classic hash-of-name voice.
const TTS_VOICES = {
  burly:  { label: 'Burly',  base: 90,  wave: 'sawtooth', drawl: 1.15, consonantBoost: 1.2,  cutoff: 1500, q: 3.0 },
  dainty: { label: 'Dainty', base: 360, wave: 'triangle', drawl: 0.85, consonantBoost: 1.5,  cutoff: 3200, q: 1.5 },
  smooth: { label: 'Smooth', base: 165, wave: 'sine',     drawl: 1.0,  consonantBoost: 1.2,  cutoff: 2600, q: 1.2 },
  growl:  { label: 'Growl',  base: 78,  wave: 'square',   drawl: 1.05, consonantBoost: 1.1,  cutoff: 1200, q: 4.0 },
  chirp:  { label: 'Chirp',  base: 440, wave: 'square',   drawl: 0.8,  consonantBoost: 1.6,  cutoff: 4000, q: 2.0 },
  drone:  { label: 'Drone',  base: 120, wave: 'sawtooth', drawl: 1.2,  consonantBoost: 1.0,  cutoff: 1800, q: 1.0 },
  warble: { label: 'Warble', base: 210, wave: 'triangle', drawl: 0.95, consonantBoost: 1.4,  cutoff: 2400, q: 3.5 },
  boomy:  { label: 'Boomy',  base: 100, wave: 'sine',     drawl: 1.1,  consonantBoost: 1.15, cutoff: 1400, q: 5.0 },
  crisp:  { label: 'Crisp',  base: 280, wave: 'square',   drawl: 0.9,  consonantBoost: 1.45, cutoff: 3400, q: 1.8 },
  tinny:  { label: 'Tinny',  base: 320, wave: 'square',   drawl: 0.9,  consonantBoost: 1.5,  cutoff: 3600, q: 6.0 },
};
try { TTS.voice = localStorage.getItem('rr-voice') || null; } catch (_) { TTS.voice = null; }

// Set (and persist) the local player's outgoing chat voice. id null/'auto' = classic.
function setTtsVoice(id) {
  id = String(id || '').toLowerCase();
  if (id === 'auto' || id === 'default' || id === 'off' || id === '') id = null;
  if (id && !TTS_VOICES[id]) return false;
  TTS.voice = id;
  try { if (id) localStorage.setItem('rr-voice', id); else localStorage.removeItem('rr-voice'); } catch (_) {}
  return true;
}

function ttsHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function ttsVoiceFor(name, voiceId) {
  if (voiceId && TTS_VOICES[voiceId]) return TTS_VOICES[voiceId];
  const h = ttsHash(String(name || 'Racer').toLowerCase());
  const bases = [92, 130, 175, 235, 320, 420]; // deep rumbler → shrill tin-can
  return {
    base: bases[h % bases.length] * (1 + ((h >> 3) % 13) / 100),
    wave: ['square', 'sawtooth', 'triangle'][(h >> 5) % 3],
    drawl: 0.85 + ((h >> 11) % 40) / 100,
  };
}

function speakChat(name, text, voiceId) {
  if (!TTS.enabled) return;
  const msg = String(text || '').trim().slice(0, 90);
  if (!msg) return;
  const key = msg.toLowerCase();
  const now = Date.now();
  if (now - (TTS.recent.get(key) || 0) < 30000) return; // repeat: no audio
  TTS.recent.set(key, now);
  if (TTS.recent.size > 40) TTS.recent.delete(TTS.recent.keys().next().value);
  TTS.queue.push({ name, msg, voiceId: voiceId || null });
  if (TTS.queue.length > 4) TTS.queue.splice(0, TTS.queue.length - 4);
  if (!TTS.playing) ttsPump();
}

function ttsPump() {
  const next = TTS.queue.shift();
  if (!next) { TTS.playing = false; return; }
  TTS.playing = true;
  const dur = ttsSpeak(next.name, next.msg, next.voiceId);
  setTimeout(ttsPump, dur * 1000 + 650);
}

function ttsSpeak(name, msg, voiceId) {
  const g0 = fxGain();
  if (g0 <= 0 || !audioCtx) return 0.1;
  try { if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (_) {}
  const v = ttsVoiceFor(name, voiceId);
  const cboost = v.consonantBoost || 1.35;
  const t0 = audioCtx.currentTime + 0.03;
  let t = t0;
  const vowels = 'aeiouy';
  const master = audioCtx.createGain();
  master.gain.value = 0.16 * g0;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = v.cutoff || 2100; lp.Q.value = v.q || 2.5; // boxy speaker
  master.connect(lp); lp.connect(audioCtx.destination);
  const words = msg.toLowerCase().split(/\s+/).slice(0, 14);
  for (const w of words) {
    for (let i = 0; i < Math.min(w.length, 8); i++) {
      const ch = w[i];
      if (!/[a-z0-9]/.test(ch)) continue;
      const isV = vowels.includes(ch);
      const durB = (isV ? 0.085 : 0.05) * v.drawl;
      // Quantized semitone ladder per character = the bit-crushed robot feel.
      const semi = Math.round((ch.charCodeAt(0) * 7) % 12) - 5;
      const f = v.base * Math.pow(2, semi / 12) * (isV ? 1 : cboost);
      const o = audioCtx.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(f, t);
      if (isV) o.frequency.setValueAtTime(f * 1.06, t + durB * 0.5); // stepped warble
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1, t + 0.008);
      g.gain.setValueAtTime(1, Math.max(t + 0.009, t + durB - 0.015));
      g.gain.linearRampToValueAtTime(0.0001, t + durB);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + durB + 0.01);
      t += durB + 0.012 * v.drawl;
    }
    t += 0.07 * v.drawl;
  }
  setTimeout(() => { try { master.disconnect(); lp.disconnect(); } catch (_) {} }, (t - t0 + 0.5) * 1000);
  return t - t0;
}
