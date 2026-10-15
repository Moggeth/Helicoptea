// Sounds for strikes and the crash kinds (see src/sim/damage.js), built from the audio engine's one-shots.
// A crash is layered like a real one: the hit, the airframe crumpling, the blades thrashing as they
// slow, the turbine running down with a stall bang or two, fire, and the debris (the china, glass or
// wood that was hit) coming down after. Bigger aircraft sound lower and last longer.
// out: the spot (pan and distance) the event was placed at. Returns true when it handled the event.

import { chinaRing } from './tea.js';

// What a blade hitting each material sounds like: [band centre Hz, Q, ring tone Hz or 0].
const HIT = {
  wood: [700, 1.6, 0], ceramic: [3200, 4, 2600], glass: [4200, 6, 3400], metal: [2600, 5, 1900], brick: [900, 1.2, 0],
  stone: [1100, 1.4, 0], tile: [1500, 2, 0], plaster: [800, 1, 0], plant: [2400, 0.8, 0], cloth: [1800, 0.7, 0],
  fur: [1600, 0.7, 0], paper: [3000, 0.9, 0], tea: [1200, 1, 0], sugar: [2600, 1, 0], apple: [900, 1, 0],
};
const R = Math.random;
const WHINE = { micro: 5600, chinook: 4300, skycrane: 3900 };
const BPF = { micro: 16.6, chinook: 14.3, skycrane: 24.8 };

// The airframe crumpling: short resonant creaks and tears, and a few panels left ringing.
function crunch(a, out, s, n = 9) {
  for (let i = 0; i < n; i++) {
    const f = (450 + R() * 3000) / Math.sqrt(s);
    a.noiseBurst({ freq: f, q: 6 + R() * 8, gain: 0.08 + 0.1 * R(), attack: 0.001, decay: 0.03 + 0.09 * R(), out, delay: R() * 0.3 * s });
  }
  for (let i = 0; i < 3; i++) {
    const f = (650 + R() * 1600) / Math.sqrt(s);
    a.tone({ freq: f, to: f * 0.97, type: 'triangle', gain: 0.025, attack: 0.002, decay: 0.4 + 0.5 * R(), out, delay: R() * 0.12 });
  }
}

// Blades beating the ground as the rotor slows: whacks at the blade-pass rate, getting further apart.
function thrash(a, out, type, s, secs) {
  let t = 0, rate = BPF[type] || 16;
  const end = rate * 0.15;
  let g = 0.24;
  while (t < secs && rate > end) {
    a.noiseBurst({ freq: (1100 + R() * 900) / Math.sqrt(s), q: 1.6, gain: g, attack: 0.001, decay: 0.035, out, delay: t });
    a.tone({ freq: 180 / Math.sqrt(s), to: 70, gain: g * 0.6, decay: 0.05, out, delay: t });
    t += 1 / rate;
    rate *= 0.9;
    g *= 0.9;
  }
}

// The turboshaft winds down: its whine falls away, sometimes with a compressor stall bang.
function rundown(a, out, type, drowned = false) {
  const w = WHINE[type] || 5000;
  a.tone({ freq: w, to: w * (drowned ? 0.5 : 0.18), gain: drowned ? 0.008 : 0.03, attack: 0.02, decay: drowned ? 0.6 : 3.2, out });
  a.tone({ freq: w / 4, to: w / 22, type: 'triangle', gain: 0.02, attack: 0.02, decay: drowned ? 0.5 : 2.6, out });
  if (!drowned) for (let i = 0; i < 1 + Math.floor(R() * 2); i++) {
    const d = 0.15 + R() * 0.7;
    a.noiseBurst({ freq: 400, type: 'lowpass', q: 0.8, gain: 0.22, attack: 0.002, decay: 0.12, out, delay: d });
    a.tone({ freq: 95, to: 50, gain: 0.15, decay: 0.12, out, delay: d });
  }
}

// Fuel goes up: a soft heavy whoomph, then a few seconds of crackle.
function fire(a, out, s) {
  a.noiseBurst({ freq: 380, type: 'lowpass', q: 0.6, gain: 0.5 * Math.min(1.3, s), attack: 0.04, decay: 1.1 * Math.sqrt(s), sweepTo: 90, out, delay: 0.02 });
  for (let i = 0; i < 26; i++) {
    const d = 0.25 + R() * 3.2;
    a.noiseBurst({ freq: 1800 + R() * 3500, q: 3, gain: 0.03 * (1 - d / 4) + 0.01, attack: 0.0005, decay: 0.006 + R() * 0.01, out, delay: d });
  }
}

// Whatever was hit, coming down: china and glass shatter and tinkle, wood splinters, leaves rustle.
function shards(a, out, material, s) {
  const m = material;
  if (m === 'ceramic' || m === 'glass') {
    const base = m === 'glass' ? 3400 : 2400;
    if (m === 'ceramic') chinaRing(a, out, 1300, 1.2);
    a.noiseBurst({ freq: base * 1.3, q: 0.8, gain: 0.35, attack: 0.001, decay: 0.16, out });
    for (let i = 0; i < 22; i++) {
      const d = 0.03 + R() * 1.1, f = base * (0.7 + R() * 1.6);
      a.tone({ freq: f, to: f * 0.995, gain: 0.02 + 0.03 * R(), attack: 0.001, decay: 0.05 + 0.15 * R(), out, delay: d });
    }
  } else if (m === 'wood' || m === 'paper') {
    a.noiseBurst({ freq: 2000, q: 1.2, gain: 0.3, attack: 0.0008, decay: 0.05, out });
    for (let i = 0; i < 5; i++) a.noiseBurst({ freq: 600 + R() * 900, q: 3, gain: 0.07, decay: 0.05, out, delay: 0.1 + R() * 0.6 });
  } else if (m === 'plant' || m === 'cloth' || m === 'fur') {
    a.noiseBurst({ freq: 3200, type: 'highpass', q: 0.4, gain: 0.12, attack: 0.02, decay: 0.6, out });
    if (m === 'fur') a.noiseBurst({ freq: 4200, type: 'highpass', q: 0.5, gain: 0.08, attack: 0.05, decay: 0.7, out, delay: 0.2 }); // the cat is not pleased
  } else if (m === 'metal') {
    for (let i = 0; i < 3; i++) { const f = 1700 + R() * 1400; a.tone({ freq: f, to: f * 0.99, gain: 0.05, decay: 0.6, out, delay: R() * 0.2 }); }
  }
  // Bits of the aircraft landing and bouncing.
  for (let i = 0; i < 10; i++) {
    const d = 0.3 + R() * 1.5;
    a.noiseBurst({ freq: (2000 + R() * 2500) / Math.sqrt(s), q: 4, gain: 0.03 + 0.04 * R(), attack: 0.001, decay: 0.025, out, delay: d });
  }
}

export function crashSound(a, e, out) {
  const type = e.aircraft || a.aircraft || 'micro';
  const s = e.scale || (type === 'micro' ? 1 : 1.6);
  switch (e.type) {
    case 'rotorTick': {
      const h = HIT[e.material] || HIT.plaster;
      if (e.harmless) { a.noiseBurst({ freq: h[0] * 1.5, q: h[1], gain: 0.03, decay: 0.03, out }); return true; }
      a.noiseBurst({ freq: h[0] * (0.9 + R() * 0.3), q: h[1], gain: 0.16, decay: 0.04, out });
      a.noiseBurst({ freq: 5200, type: 'highpass', q: 0.5, gain: 0.05, decay: 0.012, out }); // the blade tip's crack
      if (h[2]) a.tone({ freq: h[2] * (0.95 + R() * 0.1), to: h[2] * 0.9, gain: 0.05, decay: 0.08, out });
      return true;
    }
    case 'rotorShatter': {
      // A tearing shriek as the blades let go, a hail of fragments, the rotor whine falling away.
      const h = HIT[e.material] || HIT.plaster;
      a.noiseBurst({ freq: 3600, q: 1.2, gain: 0.6, attack: 0.002, decay: 0.35, sweepTo: 600, out });
      a.tone({ freq: 1500, to: 220, type: 'sawtooth', gain: 0.14, attack: 0.002, decay: 0.55, out });
      a.tone({ freq: 130 / Math.sqrt(s), to: 45, gain: 0.45, attack: 0.003, decay: 0.4, out });
      a.noiseBurst({ freq: h[0], q: h[1], gain: 0.35, decay: 0.12, out });
      if (e.material === 'ceramic' || e.material === 'glass') shards(a, out, e.material, s);
      for (let i = 0; i < 16; i++) a.noiseBurst({ freq: 2000 + R() * 4000, q: 5, gain: 0.05 + R() * 0.07, attack: 0.001, decay: 0.03, out, delay: 0.05 + R() * 0.9 });
      return true;
    }
    case 'tailStrike': {
      // A rattle-bang at the tail; then the tail rotor's buzz is gone and the yaw starts.
      a.noiseBurst({ freq: 2800, q: 2.5, gain: 0.35, decay: 0.12, out });
      a.tone({ freq: 2400, to: 300, type: 'square', gain: 0.05, decay: 0.35, out });
      a.tone({ freq: 220, to: 90, gain: 0.2, decay: 0.2, out });
      for (let i = 0; i < 6; i++) a.noiseBurst({ freq: 3000 + R() * 2500, q: 6, gain: 0.06, decay: 0.025, out, delay: 0.03 + i * 0.03 });
      return true;
    }
    case 'teaStrike':
      // Blades slicing the tea: a ripping splash and a spray of droplets.
      a.noiseBurst({ freq: 1500, q: 0.9, gain: 0.16, attack: 0.003, decay: 0.12, sweepTo: 600, out });
      for (let i = 0; i < 6; i++) a.tone({ freq: 1500 + R() * 2000, to: 2400 + R() * 1500, gain: 0.03, decay: 0.012, out, delay: 0.03 + R() * 0.25 });
      return true;
    case 'crash': {
      const k = e.kind, im = Math.min(1.3, 0.7 + (e.impact || 1) * 0.2);
      if (k === 'dunk') {
        // A deep plunge, the long hiss of a hot engine in the tea, big bubbles glugging up as it floods.
        a.tone({ freq: 300 / Math.sqrt(s), to: 70, gain: 0.5, attack: 0.004, decay: 0.45, out });
        a.noiseBurst({ freq: 1400, q: 0.8, gain: 0.55, attack: 0.003, decay: 0.5, sweepTo: 400, out });
        a.noiseBurst({ freq: 6500, type: 'highpass', q: 0.5, gain: 0.25, attack: 0.08, decay: 2.4, sweepTo: 3500, out, delay: 0.1 });
        let t = 0.2;
        for (let i = 0; i < 12; i++) { const f = 260 + R() * 420; a.tone({ freq: f, to: f * 1.4, gain: 0.08 * (1 - i / 14), attack: 0.002, decay: 0.05, out, delay: t }); t += 0.08 + R() * 0.2; }
        for (let i = 0; i < 10; i++) a.tone({ freq: 900 + R() * 1500, to: 1400 + R() * 1500, gain: 0.03, decay: 0.03, out, delay: 0.3 + R() * 2.2 });
        rundown(a, out, type, true);
        return true;
      }
      // The hit.
      a.explosion(0, s * im * (k === 'shatter' || k === 'spin' ? 0.8 : k === 'thrash' ? 0.55 : 1), out);
      crunch(a, out, s, k === 'fall' ? 12 : 9);
      if (k === 'fall') a.tone({ freq: 70 / Math.sqrt(s), to: 28, gain: 0.7, attack: 0.002, decay: 0.7, out });
      // Blades chewing in (a rollover is mostly this), unless they were already gone.
      if (k === 'thrash') thrash(a, out, type, s, 1.4);
      else if (k === 'impact' || k === 'spin' || k === 'fall') thrash(a, out, type, s, 0.5);
      rundown(a, out, type);
      if (k !== 'thrash') fire(a, out, s);
      shards(a, out, e.material, s);
      const h = HIT[e.material];
      if (h && h[2]) a.tone({ freq: h[2], to: h[2] * 0.85, gain: 0.12, decay: 0.5, out, delay: 0.02 });
      return true;
    }
    default: return false;
  }
}
