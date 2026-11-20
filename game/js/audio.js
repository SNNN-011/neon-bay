// Neon Bay — original procedural WebAudio: engine loop, two-tone siren, gunshots, blips and a synthwave pad.
const CHORDS = [
  [110, 164.81, 220, 329.63], [87.31, 130.81, 174.61, 261.63],
  [98, 146.83, 196, 293.66], [82.41, 123.47, 164.81, 246.94],
];
export function createAudio(state, input) {
  let ctx = null, master, engine, engineGain, siren, sirenGain;
  const pad = [];
  let muted = false, chordT = 0, ci = 0, sirenT = 0, sirenHi = false;
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    engine = ctx.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 50;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 420;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engine.connect(ef); ef.connect(engineGain); engineGain.connect(master); engine.start();
    siren = ctx.createOscillator(); siren.type = 'triangle'; siren.frequency.value = 620;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    siren.connect(sirenGain); sirenGain.connect(master); siren.start();
    const padGain = ctx.createGain(); padGain.gain.value = 0.045;
    const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 700;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 320;
    lfo.connect(lg); lg.connect(pf.frequency); lfo.start();
    padGain.connect(pf); pf.connect(master);
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = CHORDS[0][i]; o.detune.value = (i - 1.5) * 7;
      const g = ctx.createGain(); g.gain.value = 0.25;
      o.connect(g); g.connect(padGain); o.start();
      pad.push(o);
    }
  }
  function blip(f0, f1, dur, type, vol) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sys = {
    unlock,
    get ctx() { return ctx; },
    get muted() { return muted; },
    nodes() { return { engine: !!engine, siren: !!siren, pad: pad.length, running: !!ctx && ctx.state === 'running' }; },
    shot() {
      if (!ctx || muted) return;
      const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      const g = ctx.createGain(); g.gain.value = 0.22;
      s.connect(f); f.connect(g); g.connect(master); s.start(t);
    },
    punch() { blip(120, 45, 0.14, 'sine', 0.3); },
    pickup() { blip(660, 1320, 0.12, 'square', 0.09); },
    reward() { blip(523, 1046, 0.32, 'triangle', 0.16); },
    down() { blip(220, 55, 0.6, 'sawtooth', 0.18); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    update(dt) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const driving = state.mode === 'driving' && state.vehicle;
      const sp = driving ? Math.abs(state.vehicle.speed) : 0;
      const throttle = driving && (input.isDown('KeyW') || input.isDown('ArrowUp')) ? 1 : 0;
      const on = state.started && !state.paused && !state.down;
      engine.frequency.setTargetAtTime(50 + sp * 3.2, t, 0.08);
      engineGain.gain.setTargetAtTime(on && driving ? 0.04 + throttle * 0.04 + Math.min(sp / 38, 1) * 0.03 : 0, t, 0.1);
      const sir = on && state.wanted > 0;
      sirenT += dt;
      if (sir && sirenT > 0.45) { sirenT = 0; sirenHi = !sirenHi; siren.frequency.setValueAtTime(sirenHi ? 880 : 620, t); }
      sirenGain.gain.setTargetAtTime(sir ? 0.04 : 0, t, 0.15);
      chordT += dt;
      if (chordT > 4) { chordT = 0; ci = (ci + 1) % CHORDS.length; pad.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[ci][i], t, 0.4)); }
    },
  };
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') sys.toggleMute(); unlock(); });
  return sys;
}