/* Словокруг — звук: полностью синтез через Web Audio, без файлов. */
(function () {
  'use strict';

  let ctx = null, master = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function now() { return ctx.currentTime; }

  /* Мягкий щипок: осциллятор -> lowpass -> огибающая. */
  function pluck(freq, t0, opt) {
    opt = opt || {};
    const t = now() + (t0 || 0);
    const osc = ctx.createOscillator();
    const flt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = opt.type || 'triangle';
    osc.frequency.value = freq;
    if (opt.glide) osc.frequency.exponentialRampToValueAtTime(opt.glide, t + (opt.dur || 0.18));
    flt.type = 'lowpass';
    flt.frequency.value = opt.cutoff || freq * 4;
    flt.Q.value = 0.7;
    const vol = opt.gain != null ? opt.gain : 0.4;
    const dur = opt.dur || 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(flt); flt.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /* Искра: короткий шум через highpass. */
  function sparkle(t0, opt) {
    opt = opt || {};
    const t = now() + (t0 || 0);
    const dur = opt.dur || 0.25;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = opt.hp || 5000;
    const g = ctx.createGain();
    g.gain.value = opt.gain != null ? opt.gain : 0.12;
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t);
  }

  /* Пентатоника до-мажор на две октавы — «пение» слова при выборе букв. */
  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.26, 784.0, 880.0, 1046.5];

  function play(fn) {
    if (!enabled) return;
    if (!ensure()) return;
    try { fn(); } catch (e) { /* звук не должен ломать игру */ }
  }

  const SFX = {
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; if (v) ensure(); },
    unlock() { if (enabled) ensure(); },

    pick(i) {
      play(() => {
        const f = PENTA[Math.min(i, PENTA.length - 1)];
        pluck(f, 0, { gain: 0.35, dur: 0.16 });
        pluck(f * 2, 0, { gain: 0.06, dur: 0.1, type: 'sine' });
      });
    },

    unpick(i) {
      play(() => pluck(PENTA[Math.max(0, Math.min(i, PENTA.length - 1))] * 0.5, 0, { gain: 0.18, dur: 0.1 }));
    },

    word(n) {
      play(() => {
        const steps = Math.min(2 + n, 6);
        for (let k = 0; k < steps; k++) {
          pluck(PENTA[2 + k], k * 0.055, { gain: 0.32, dur: 0.22 });
        }
        pluck(PENTA[2 + steps] * 2, steps * 0.055, { gain: 0.1, dur: 0.5, type: 'sine' });
        sparkle(steps * 0.055, { gain: 0.05, hp: 7000 });
      });
    },

    bonus() {
      play(() => {
        pluck(880, 0, { glide: 1568, gain: 0.22, dur: 0.22, type: 'sine', cutoff: 8000 });
        pluck(1318.5, 0.1, { gain: 0.18, dur: 0.3, type: 'sine' });
        sparkle(0.06, { gain: 0.1, hp: 6000, dur: 0.3 });
      });
    },

    coin(t0) {
      play(() => {
        pluck(1318.5, t0 || 0, { gain: 0.14, dur: 0.16, type: 'sine' });
        pluck(1760, (t0 || 0) + 0.07, { gain: 0.12, dur: 0.22, type: 'sine' });
      });
    },

    invalid() {
      play(() => {
        pluck(150, 0, { glide: 78, gain: 0.3, dur: 0.22, type: 'sawtooth', cutoff: 420 });
      });
    },

    dup() {
      play(() => {
        pluck(523, 0, { gain: 0.12, dur: 0.06 });
        pluck(523, 0.09, { gain: 0.12, dur: 0.06 });
      });
    },

    hint() {
      play(() => {
        pluck(659, 0, { gain: 0.2, dur: 0.14 });
        pluck(987, 0.08, { gain: 0.2, dur: 0.25, type: 'sine' });
        sparkle(0.05, { gain: 0.06 });
      });
    },

    click() {
      play(() => pluck(392, 0, { gain: 0.1, dur: 0.05 }));
    },

    win() {
      play(() => {
        const chords = [
          [261.63, 329.63, 392.0],
          [293.66, 392.0, 493.88],
          [329.63, 415.3, 523.25],
          [392.0, 493.88, 659.26, 783.99],
        ];
        chords.forEach((ch, i) => {
          ch.forEach(f => pluck(f, i * 0.16, { gain: 0.16, dur: i === chords.length - 1 ? 0.9 : 0.3 }));
        });
        sparkle(0.5, { gain: 0.08, dur: 0.5, hp: 5000 });
        pluck(1046.5, 0.64, { gain: 0.1, dur: 0.8, type: 'sine' });
      });
    },
  };

  window.SFX = SFX;

  function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }
  window.HAPTIC = {
    tap() { buzz(8); },
    ok() { buzz([12, 30, 18]); },
    no() { buzz(40); },
  };
})();
