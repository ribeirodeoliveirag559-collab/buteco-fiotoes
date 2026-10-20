// Efeitos sonoros sintetizados (WebAudio) — sem arquivos de áudio.
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('fiotoes:muted') === '1'; } catch (e) { /* ok */ }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function ok() { return ctx && !muted; }

  function noise(dur, freq, q, vol, type, when) {
    const t = ctx.currentTime + (when || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, vol, type, slideTo, when) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  FT.audio = {
    init,
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('fiotoes:muted', m ? '1' : '0'); } catch (e) { /* ok */ }
      if (master) master.gain.value = m ? 0 : 0.55;
    },
    gulp() {
      if (!ok()) return;
      noise(0.16, 380 + Math.random() * 200, 3, 0.55);
      tone(160 + Math.random() * 40, 0.1, 0.12, 'sine', 90);
    },
    burp() {
      if (!ok()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.65);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 28;
      const lg = ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
    },
    clink() {
      if (!ok()) return;
      tone(2300, 0.25, 0.18, 'sine'); tone(3200, 0.2, 0.1, 'sine', null, 0.01);
    },
    puff() {
      if (!ok()) return;
      noise(0.7, 900, 0.7, 0.18, 'lowpass');
      tone(300, 0.5, 0.05, 'sine', 180);
    },
    pour() {
      if (!ok()) return;
      noise(1.1, 1400, 0.8, 0.28, 'bandpass'); noise(1.0, 3200, 1.2, 0.1, 'highpass', 0.1);
      for (let i = 0; i < 6; i++) tone(500 + i * 90, 0.12, 0.05, 'sine', 700 + i * 90, 0.15 + i * 0.13);
    },
    vape() {
      if (!ok()) return;
      tone(180, 0.35, 0.07, 'sine', 120);              // puxando
      noise(1.6, 700, 0.5, 0.22, 'lowpass', 1.2);        // soltando a fumaça
      tone(260, 0.9, 0.05, 'triangle', 140, 1.2);
    },
    blip() {
      if (!ok()) return;
      tone(880, 0.07, 0.12, 'square');
    },
    pop() {
      if (!ok()) return;
      tone(520, 0.09, 0.14, 'sine', 900);
    },
    hic() {
      if (!ok()) return;
      tone(420, 0.07, 0.18, 'triangle', 700); tone(380, 0.09, 0.14, 'triangle', 240, 0.08);
    },
    thud() {
      if (!ok()) return;
      tone(120, 0.3, 0.4, 'sine', 40); noise(0.2, 200, 0.8, 0.3, 'lowpass');
    },
    psy() {
      if (!ok()) return;
      [0, 0.12, 0.24, 0.36].forEach((d, i) => tone(500 * Math.pow(1.26, i), 0.5, 0.1, 'sine', null, d));
    },
  };
})();
