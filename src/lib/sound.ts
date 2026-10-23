export function playTone(freq = 440, duration = 0.15, type: OscillatorType = 'sine', volume = 0.1) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // ignore
  }
}

export function playBurst() {
  playTone(220, 0.1, 'sawtooth', 0.08);
  setTimeout(() => playTone(440, 0.15, 'sine', 0.1), 80);
  setTimeout(() => playTone(880, 0.2, 'triangle', 0.12), 180);
}
