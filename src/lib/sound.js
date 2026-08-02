let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

// Browsers block audio playback until the page has had a user gesture.
// Notification chimes fire from realtime DB events with no gesture of their
// own, so unlock (resume) the shared AudioContext on the first tap/keypress
// anywhere in the app — call this once near app startup.
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    getAudioContext()?.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

// Short two-tone chime for incoming notifications — synthesized via Web
// Audio so no audio asset needs to be bundled/loaded.
export function playNotificationChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch (_) {
    // Web Audio unsupported/blocked — the visual toast (and, for background
    // push, the OS notification's own sound) still gets the alert across.
  }
}
