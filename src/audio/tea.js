// Tea, cups and liquid. The cups and the tea are life-size even though the aircraft are models, so these
// use real-world acoustics: a bubble rings at its Minnaert resonance (about 3.3 kHz for a 1 mm bubble)
// and rises in pitch as it surfaces; a china cup rings with inharmonic partials, lower the fuller it is.

import { CUPS } from '../sim/layout.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// One bubble: a short sine that rises as it closes. freq ~ 3.3 kHz / radius in mm.
function bubble(a, out, freq, gain, delay = 0) {
  const d = 0.006 + 180 / freq * 0.01;   // bigger bubbles ring longer
  a.tone({ freq, to: freq * (1.15 + Math.random() * 0.25), gain, attack: 0.001, decay: d, out, delay });
}

// The cup nearest a point (within reach), with its acoustic pitch.
function cupNear(pos, reach = 0.08) {
  if (!pos) return null;
  let best = null, bd = reach;
  for (const c of CUPS) {
    const d = Math.hypot(pos.x - c.x, pos.z - c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function cupPitch(c) {
  const teacup = c.shape === 'teacup' || c.saucer;
  const f0 = teacup ? 1480 : 1080;
  const fill = c.water / c.height;
  const v = (((c.x * 7.3) % 1) + 1) % 1; // each cup its own note
  return f0 * (1 - 0.32 * fill * fill) * (0.97 + 0.06 * v);
}

// A china ring: four inharmonic partials, the high ones dying first.
export function chinaRing(a, out, f0, strength, delay = 0) {
  const s = Math.min(1, strength);
  const P = [[1, 1, 0.38], [2.32, 0.55, 0.22], [4.1, 0.3, 0.12], [6.4, 0.16, 0.07]];
  for (const [r, g, d] of P) a.tone({ freq: f0 * r, to: f0 * r * 0.998, gain: 0.05 * g * s, attack: 0.0015, decay: d * (0.6 + 0.6 * s), out, delay });
  a.noiseBurst({ freq: f0 * 3, q: 2, gain: 0.03 * s, decay: 0.01, out, delay }); // the knock itself
}

export function teaSound(a, type, e) {
  const out = e.out || a.spot(e.pos);
  switch (type) {
    case 'bubble': bubble(a, out, e.freq, e.gain); break;
    case 'splash': {
      // The bag plunges in: the slap of the surface, a deep plunk as its air pocket closes, then a
      // scatter of small bubbles and a slosh against the cup wall.
      const s = Math.min(1.2, e.speed);
      a.noiseBurst({ freq: 2400, type: 'highpass', q: 0.6, gain: 0.04 + 0.12 * s, attack: 0.001, decay: 0.03 + 0.04 * s, out });
      bubble(a, out, 520 + Math.random() * 260 - 200 * s, 0.1 + 0.18 * s, 0.006);
      a.noiseBurst({ freq: 900, type: 'lowpass', q: 0.7, gain: 0.05 + 0.16 * s, attack: 0.01, decay: 0.18 + 0.2 * s, out, delay: 0.02 });
      const n = 3 + Math.round(6 * s);
      for (let i = 0; i < n; i++) bubble(a, out, 1300 + Math.random() * 2600, 0.02 + 0.025 * Math.random() * s, 0.03 + Math.random() * 0.28);
      break;
    }
    case 'bucketSplash': {
      const s = Math.min(1.2, e.speed);
      bubble(a, out, 380 + Math.random() * 80, 0.12 + 0.18 * s);
      a.noiseBurst({ freq: 1300, q: 0.9, gain: 0.08 + 0.25 * s, attack: 0.003, decay: 0.15 + 0.2 * s, sweepTo: 500, out });
      a.tone({ freq: 2350, to: 2330, gain: 0.025 * s, decay: 0.25, out });   // the tin bucket rings
      for (let i = 0; i < 4; i++) bubble(a, out, 900 + Math.random() * 1500, 0.02, 0.04 + Math.random() * 0.2);
      break;
    }
    case 'extract': {
      // A wet "shloop" as the tea lets go of the bag, and a run of drops falling back.
      const s = clamp01((e.speed || 0.05) / 0.15);
      a.noiseBurst({ freq: 700, q: 1.4, gain: 0.08 + 0.08 * s, attack: 0.012, decay: 0.2, sweepTo: 2400, out });
      a.tone({ freq: 240, to: 760, gain: 0.05 + 0.03 * s, attack: 0.01, decay: 0.15, out });
      for (let i = 0; i < 5; i++) bubble(a, out, 1500 + Math.random() * 1500, 0.025, 0.12 + i * 0.07 + Math.random() * 0.05);
      break;
    }
    case 'drip':
      if (e.cup) {
        a.noiseBurst({ freq: 5000, type: 'highpass', q: 0.5, gain: 0.012, decay: 0.008, out });
        bubble(a, out, 1400 + Math.random() * 1200, 0.045, 0.004);
      } else a.noiseBurst({ freq: 4000, q: 2, gain: 0.025, decay: 0.02, out });
      break;
    case 'milkSplash':
      if (performance.now() - (a.lastMilk || 0) > 45) {
        a.lastMilk = performance.now();
        a.noiseBurst({ freq: 2400 + Math.random() * 1200, q: 2, gain: Math.min(0.06, 0.012 + e.vol * 1e6 * 0.02), decay: 0.035, out });
        if (Math.random() < 0.5) bubble(a, out, 1200 + Math.random() * 1800, 0.02);
      }
      break;
    case 'bagHit': {
      const now = a.ctx.currentTime;
      if (now - a.lastHit < 0.06) break;
      a.lastHit = now;
      const m = e.material, dv = e.dv || 0;
      if (m === 'ceramic') {
        const c = cupNear(e.pos);
        chinaRing(a, out, c ? cupPitch(c) : 1750, 0.25 + dv * 0.4);   // a cup, or the saucer and plate
      } else if (m === 'glass') {
        a.tone({ freq: 3100, gain: Math.min(0.06, 0.015 + dv * 0.03), decay: 0.3, out });
      } else if (m === 'metal') {
        a.tone({ freq: 2650 + Math.random() * 300, gain: Math.min(0.05, 0.012 + dv * 0.03), decay: 0.18, out });
      }
      // The bag's own soft, wet pat.
      a.noiseBurst({ freq: m === 'ceramic' ? 2200 : 800, q: 1.2, gain: Math.min(0.1, 0.02 + dv * 0.04), decay: 0.035, out });
      break;
    }
    default: break;
  }
}

// Continuous: a bag in the tea sloshes when it moves, and a fresh dry bag fizzes as its air escapes.
export class Steep {
  constructor(a) {
    this.a = a;
    const ctx = a.ctx;
    const s = ctx.createBufferSource(); s.buffer = a.brown; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner();
    s.connect(f).connect(g).connect(p).connect(a.sfxBus); s.start();
    this.slosh = { f, g, p };
    this.next = 0;
  }
  update(bags, t) {
    let best = null, bl = 0;
    for (const b of bags || []) {
      if (!(b.immersion > 0.02) || b.isBucket) continue;
      const sp = b.vel ? Math.hypot(b.vel.x, b.vel.y, b.vel.z) : 0;
      const l = b.immersion * (0.15 + clamp01(sp / 0.12));
      if (l > bl) { bl = l; best = b; }
    }
    const a = this.a;
    if (!best) { this.slosh.g.gain.setTargetAtTime(0, t, 0.15); return; }
    const P = a.place(best.pos);
    const sp = best.vel ? Math.hypot(best.vel.x, best.vel.y, best.vel.z) : 0;
    const mv = clamp01(sp / 0.12);
    this.slosh.g.gain.setTargetAtTime(0.08 * mv * Math.min(1, best.immersion * 2) * P.gain, t, 0.08);
    this.slosh.f.frequency.setTargetAtTime(450 + 600 * mv, t, 0.1);
    this.slosh.p.pan.setTargetAtTime(P.pan, t, 0.05);
    // Air leaving the bag: lots when it's dry, a few when it's soaked; more when it's squeezed about.
    const fresh = 1 - clamp01(best.wetness ?? 1);
    const rate = best.immersion * (40 * fresh + 2) * (0.5 + mv);
    if (t > this.next && rate > 0.3) {
      this.next = t + (0.4 + Math.random()) / rate;
      bubble(a, a.spot(best.pos), 1600 + Math.random() * 2800, 0.018 + 0.02 * fresh);
    }
  }
}
