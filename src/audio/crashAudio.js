// Sounds for strikes and the crash kinds (see src/sim/damage.js), built from the audio engine's one-shots.
// Returns true when it handled the event.

// What a blade hitting each material sounds like: [band centre Hz, Q, ring tone Hz or 0].
const HIT = {
  wood: [700, 1.6, 0], ceramic: [3200, 4, 2600], glass: [4200, 6, 3400], metal: [2600, 5, 1900], brick: [900, 1.2, 0],
  stone: [1100, 1.4, 0], tile: [1500, 2, 0], plaster: [800, 1, 0], plant: [2400, 0.8, 0], cloth: [1800, 0.7, 0],
  fur: [1600, 0.7, 0], paper: [3000, 0.9, 0], tea: [1200, 1, 0],
};

export function crashSound(a, e, pan) {
  switch (e.type) {
    case 'rotorTick': {
      const h = HIT[e.material] || HIT.plaster;
      if (e.harmless) { a.noiseBurst({ freq: h[0] * 1.5, q: h[1], gain: 0.03, decay: 0.03, pan }); return true; }
      a.noiseBurst({ freq: h[0] * (0.9 + Math.random() * 0.3), q: h[1], gain: 0.16, decay: 0.04, pan });
      if (h[2]) a.tone({ freq: h[2] * (0.95 + Math.random() * 0.1), to: h[2] * 0.9, gain: 0.05, decay: 0.08, pan });
      return true;
    }
    case 'rotorShatter': {
      // A tearing shriek as the blades let go, a hail of fragments, the rotor whine falling away.
      const h = HIT[e.material] || HIT.plaster;
      a.noiseBurst({ freq: 3600, q: 1.2, gain: 0.6, attack: 0.002, decay: 0.35, sweepTo: 600, pan });
      a.tone({ freq: 1500, to: 220, type: 'sawtooth', gain: 0.16, attack: 0.002, decay: 0.55, pan });
      a.tone({ freq: 130, to: 45, gain: 0.45, attack: 0.003, decay: 0.4, pan });
      a.noiseBurst({ freq: h[0], q: h[1], gain: 0.35, decay: 0.12, pan });
      for (let i = 0; i < 16; i++) a.noiseBurst({ freq: 2000 + Math.random() * 4000, q: 5, gain: 0.05 + Math.random() * 0.07, attack: 0.001, decay: 0.03, pan: pan + (Math.random() - 0.5) * 0.8, delay: 0.05 + Math.random() * 0.9 });
      return true;
    }
    case 'tailStrike': {
      // A rattle-bang at the tail, then the tail rotor's buzz is gone.
      a.noiseBurst({ freq: 2800, q: 2.5, gain: 0.35, decay: 0.12, pan });
      a.tone({ freq: 2400, to: 300, type: 'square', gain: 0.06, decay: 0.35, pan });
      for (let i = 0; i < 6; i++) a.noiseBurst({ freq: 3000 + Math.random() * 2500, q: 6, gain: 0.06, decay: 0.025, pan, delay: 0.03 + i * 0.03 });
      return true;
    }
    case 'teaStrike':
      a.noiseBurst({ freq: 1500, q: 0.9, gain: 0.14, attack: 0.003, decay: 0.12, sweepTo: 600, pan });
      return true;
    case 'crash': {
      const s = Math.min(1.2, 0.7 + (e.impact || 1) * 0.2);
      if (e.kind === 'dunk') {
        // A deep plunge and the long hiss of a hot engine in the tea.
        a.tone({ freq: 300, to: 70, gain: 0.5, attack: 0.004, decay: 0.45, pan });
        a.noiseBurst({ freq: 1400, q: 0.8, gain: 0.55, attack: 0.003, decay: 0.5, sweepTo: 400, pan });
        a.noiseBurst({ freq: 6500, type: 'highpass', q: 0.5, gain: 0.25, attack: 0.08, decay: 2.4, sweepTo: 3500, pan, delay: 0.1 });
        for (let i = 0; i < 10; i++) a.tone({ freq: 500 + Math.random() * 900, to: 900 + Math.random() * 900, gain: 0.04, decay: 0.06, pan, delay: 0.15 + Math.random() * 1.2 });
        return true;
      }
      a.explosion(pan, s * (e.kind === 'shatter' || e.kind === 'spin' ? 0.85 : 1));
      if (e.kind === 'fall') a.tone({ freq: 70, to: 30, gain: 0.7, attack: 0.002, decay: 0.6, pan });
      if (e.kind === 'thrash') for (let i = 0; i < 8; i++) a.noiseBurst({ freq: 900 + Math.random() * 600, q: 1.5, gain: 0.18, decay: 0.05, pan, delay: i * 0.035 });
      const h = HIT[e.material];
      if (h && h[2]) a.tone({ freq: h[2], to: h[2] * 0.85, gain: 0.12, decay: 0.5, pan, delay: 0.02 });
      return true;
    }
    default: return false;
  }
}
