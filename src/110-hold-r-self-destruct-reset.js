// ============================================================
// HOLD-R SELF-DESTRUCT RESET
// Hold R to charge a reset: a white bar slides up from the bottom, reddening,
// shaking, venting smoke and rising white noise. Hold to the end and you blow
// up (and respawn). Release early and every effect rewinds and the bar drops.
// ============================================================
const resetHold = {
  active: false,   // R currently held this frame
  charge: 0,       // 0..1 effect/charge progress
  bar: 0,          // 0..1 slide-in amount of the on-screen bar
  smokeTimer: 0,
  particles: [],
};
const RESET_HOLD_TIME = 1.8;          // seconds of holding to detonate
const RESET_RELEASE_TIME = 0.9;       // seconds to fully rewind on release
let resetNoise = null;                // { src, gain } white-noise node

function startResetNoise() {
  if (resetNoise || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const len = Math.floor(audioCtx.sampleRate * 1.0);
    const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(0);
    resetNoise = { src, gain };
  } catch (_) {}
}

function stopResetNoise() {
  if (!resetNoise) return;
  try { resetNoise.src.stop(); } catch (_) {}
  try { resetNoise.src.disconnect(); resetNoise.gain.disconnect(); } catch (_) {}
  resetNoise = null;
}
