// ============================================================
// JANK RETRO TTS — per-player robot voices for lobby chat.
// Not real speech: 8-bit style character babble. Each racer's name
// hashes to a base pitch, waveform, and tempo, so everyone gets their
// own recognizably awful voice. Messages queue with a gap (slowdown),
// and a repeated message within 30s prints silently.
// ============================================================
const TTS = { queue: [], playing: false, recent: new Map(), enabled: true };

function ttsHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function ttsVoiceFor(name) {
  const h = ttsHash(String(name || 'Racer').toLowerCase());
  const bases = [92, 130, 175, 235, 320, 420]; // deep rumbler → shrill tin-can
  return {
    base: bases[h % bases.length] * (1 + ((h >> 3) % 13) / 100),
    wave: ['square', 'sawtooth', 'triangle'][(h >> 5) % 3],
    drawl: 0.85 + ((h >> 11) % 40) / 100,
  };
}

function speakChat(name, text) {
  if (!TTS.enabled) return;
  const msg = String(text || '').trim().slice(0, 90);
  if (!msg) return;
  const key = msg.toLowerCase();
  const now = Date.now();
  if (now - (TTS.recent.get(key) || 0) < 30000) return; // repeat: no audio
  TTS.recent.set(key, now);
  if (TTS.recent.size > 40) TTS.recent.delete(TTS.recent.keys().next().value);
  TTS.queue.push({ name, msg });
  if (TTS.queue.length > 4) TTS.queue.splice(0, TTS.queue.length - 4);
  if (!TTS.playing) ttsPump();
}

function ttsPump() {
  const next = TTS.queue.shift();
  if (!next) { TTS.playing = false; return; }
  TTS.playing = true;
  const dur = ttsSpeak(next.name, next.msg);
  setTimeout(ttsPump, dur * 1000 + 650);
}

function ttsSpeak(name, msg) {
  const g0 = fxGain();
  if (g0 <= 0 || !audioCtx) return 0.1;
  try { if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (_) {}
  const v = ttsVoiceFor(name);
  const t0 = audioCtx.currentTime + 0.03;
  let t = t0;
  const vowels = 'aeiouy';
  const master = audioCtx.createGain();
  master.gain.value = 0.16 * g0;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2100; lp.Q.value = 2.5; // boxy speaker
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
      const f = v.base * Math.pow(2, semi / 12) * (isV ? 1 : 1.35);
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
