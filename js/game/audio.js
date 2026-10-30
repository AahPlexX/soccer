// Game Mode sound: every effect is synthesized with WebAudio (square, triangle and noise voices), so the app ships no audio files
// and works offline. Browsers only allow audio after a user gesture, so nothing is created until `resume()` is called from one.
// If WebAudio is missing or fails, every call quietly does nothing.

export function createAudio({ muted = false } = {}) {
  let context = null;
  let master = null;
  let noise = null;
  let isMuted = muted;

  function ensure() {
    if (context) return context;
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) return null;
    try {
      context = new Context();
      master = context.createGain();
      master.gain.value = isMuted ? 0 : 0.5;
      master.connect(context.destination);
      const length = context.sampleRate;
      noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < length; i += 1) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = (seed / 4294967296) * 2 - 1; }
    } catch {
      context = null;
    }
    return context;
  }

  function tone(type, from, to, duration, volume = 0.3, delay = 0) {
    const ctx = ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function hiss(duration, volume = 0.3, cutoff = 2000, delay = 0) {
    const ctx = ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noise;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  const sounds = {
    kick: () => { hiss(0.08, 0.35, 1800); tone('square', 180, 60, 0.12, 0.25); },
    shot: () => { hiss(0.12, 0.5, 2500); tone('square', 260, 70, 0.18, 0.3); },
    pass: () => { hiss(0.05, 0.2, 1500); tone('triangle', 330, 220, 0.08, 0.18); },
    touch: () => tone('triangle', 200, 140, 0.05, 0.1),
    bounce: () => tone('sine', 140, 70, 0.1, 0.25),
    post: () => { tone('square', 1200, 900, 0.25, 0.15); tone('triangle', 700, 500, 0.3, 0.12); },
    tackle: () => { hiss(0.12, 0.4, 900); tone('square', 120, 50, 0.1, 0.2); },
    save: () => { hiss(0.1, 0.3, 1200); tone('triangle', 260, 180, 0.12, 0.2); },
    whistle: () => { tone('triangle', 2300, 2100, 0.35, 0.22); tone('triangle', 2350, 2150, 0.35, 0.18, 0.02); },
    goal: () => {
      [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.16, 0.2, i * 0.12));
      hiss(1.6, 0.25, 1500, 0.1);
    },
    fulltime: () => { tone('triangle', 2300, 2100, 0.35, 0.22); tone('triangle', 2300, 2100, 0.5, 0.2, 0.4); tone('triangle', 2300, 2100, 0.7, 0.2, 0.9); },
    blip: () => tone('square', 880, 880, 0.05, 0.12),
    select: () => { tone('square', 660, 660, 0.05, 0.12); tone('square', 990, 990, 0.07, 0.12, 0.05); },
  };
  sounds.foul = sounds.whistle;

  return {
    /** Call from a user gesture (a tap or key press) so the browser lets sound play. */
    resume() { const ctx = ensure(); if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); },
    play(name) { const make = sounds[name]; if (make && !isMuted) { try { make(); } catch { /* sound is optional */ } } },
    setMuted(value) { isMuted = Boolean(value); if (master) master.gain.value = isMuted ? 0 : 0.5; },
    get muted() { return isMuted; },
    dispose() { context?.close?.().catch(() => {}); context = null; master = null; },
  };
}

/** Which sound a match event should make (null for none). Pure, so it can be tested without WebAudio. */
export function soundFor(event) {
  switch (event.type) {
    case 'shot': return 'shot';
    case 'pass': return 'pass';
    case 'touch': return 'touch';
    case 'header':
    case 'block': return 'kick';
    case 'tackle': return 'tackle';
    case 'foul': return 'foul';
    case 'save': return 'save';
    case 'goal': return 'goal';
    case 'whistle': return 'whistle';
    case 'fulltime': return 'fulltime';
    default: return null;
  }
}
