// Little synthesized sound effects (Web Audio), shared by any game.
// Browsers block audio until the person taps or clicks the page, so call unlock() from a gesture.
// To add a sound: write a function below that schedules notes, and expose it on the returned object.

const PREF_KEY = "gameNight.sound";

export function createSound() {
  let ctx = null;
  let master = null;
  let enabled = readPref();
  let lastTick = 0;
  const played = { tick: 0, win: 0, slip: 0 };

  function readPref() {
    try { return localStorage.getItem(PREF_KEY) !== "off"; } catch { return true; }
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    return ctx;
  }

  const ready = () => enabled && ctx && ctx.state === "running";

  // One note: frequency (Hz), start offset (s), length (s), waveform, peak volume.
  function note(freq, at, len, type = "triangle", peak = 0.25, to = master) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + len + 0.05);
    return o;
  }

  return {
    played,
    get enabled() { return enabled; },
    get needsTap() { return enabled && (!ctx || ctx.state !== "running"); },

    unlock() {
      if (!ensure()) return;
      if (ctx.state !== "running") ctx.resume?.();
    },

    setEnabled(on) {
      enabled = on;
      try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* private mode */ }
      if (on) this.unlock();
    },

    // A peg clicking past the arrow. Throttled so a very fast wheel doesn't turn into a buzz.
    tick() {
      if (!ready()) return;
      const now = performance.now();
      if (now - lastTick < 35) return;
      lastTick = now;
      played.tick++;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(1900, t);
      o.frequency.exponentialRampToValueAtTime(700, t + 0.025);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.04);
    },

    // Bright little fanfare for a winner.
    win() {
      if (!ready()) return;
      played.win++;
      [523.25, 659.25, 783.99].forEach((f, i) => note(f, i * 0.11, 0.22, "triangle", 0.28));
      note(1046.5, 0.33, 0.7, "triangle", 0.32);
      note(1318.5, 0.33, 0.7, "sine", 0.12);
      [2093, 2637, 3136].forEach((f, i) => note(f, 0.5 + i * 0.07, 0.25, "sine", 0.05));
    },

    // Sad descending trombone: wah, wah, wah, wahhh.
    slip() {
      if (!ready()) return;
      played.slip++;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1100;
      filter.connect(master);
      const notes = [[392, 0, 0.42], [370, 0.45, 0.42], [349.2, 0.9, 0.42], [329.6, 1.35, 1.1]];
      notes.forEach(([f, at, len], i) => {
        const o = note(f, at, len, "sawtooth", 0.2, filter);
        if (i === notes.length - 1) {
          // Wobble on the last, long note.
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 6;
          depth.gain.value = 9;
          lfo.connect(depth).connect(o.frequency);
          lfo.start(ctx.currentTime + at);
          lfo.stop(ctx.currentTime + at + len);
          o.frequency.exponentialRampToValueAtTime(f * 0.94, ctx.currentTime + at + len);
        }
      });
    },
  };
}
