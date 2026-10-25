let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playTone(freq = 440, duration = 0.15, type: OscillatorType = 'sine', volume = 0.1) {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.stop(c.currentTime + duration);
  } catch {
    // ignore
  }
}

export function playCharge(duration = 1.1) {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, c.currentTime + duration);
    gain.gain.setValueAtTime(0.02, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.stop(c.currentTime + duration);
  } catch {
    // ignore
  }
}

export function playBurst(rarityRank = 0) {
  const base = 180 + rarityRank * 40;
  playTone(base, 0.12, 'sawtooth', 0.09);
  setTimeout(() => playTone(base * 2, 0.16, 'sine', 0.11), 70);
  setTimeout(() => playTone(base * 4, 0.22, 'triangle', 0.13), 160);
  if (rarityRank >= 4) {
    setTimeout(() => playTone(1320, 0.3, 'sine', 0.12), 260);
    setTimeout(() => playTone(1760, 0.3, 'sine', 0.1), 400);
  }
}

export function playFlip() {
  playTone(660, 0.07, 'triangle', 0.06);
}

export function playRareReveal() {
  playTone(880, 0.12, 'sine', 0.08);
  setTimeout(() => playTone(1320, 0.18, 'sine', 0.1), 90);
}
