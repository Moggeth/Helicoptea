// The places themselves. The kitchen: a low room tone, the fridge humming on and off, the wall clock
// ticking. The tea garden: a breeze in the hedge and leaves, and birdsong that goes quiet while a
// helicopter is close. Through the open back door each is faintly heard from the other.
// Everything here is quiet; it ducks under a loud aircraft and is muffled in the cockpit.

import { CLOCK, FRIDGE, TREE, FEEDER, ROOM } from '../sim/layout.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const R = Math.random;

export class Ambience {
  constructor(a) {
    this.a = a;
    const ctx = a.ctx;
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.kitchen = G(0); this.kitchen.connect(a.ambBus);
    this.garden = G(0); this.garden.connect(a.ambBus);
    // Room tone.
    const rt = ctx.createBufferSource(); rt.buffer = a.brown; rt.loop = true;
    const rtf = ctx.createBiquadFilter(); rtf.type = 'lowpass'; rtf.frequency.value = 220;
    const rtg = G(0.05);
    rt.connect(rtf).connect(rtg).connect(this.kitchen); rt.start();
    // Fridge: mains hum and its harmonics, with the compressor's own rattle, cycling.
    this.fridge = G(0);
    this.fridgePan = ctx.createStereoPanner();
    this.fridge.connect(this.fridgePan).connect(this.kitchen);
    for (const [f, g] of [[50, 0.03], [100, 0.022], [150, 0.008], [250, 0.003]]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const og = G(g); o.connect(og).connect(this.fridge); o.start();
    }
    const fr = ctx.createBufferSource(); fr.buffer = a.noise; fr.loop = true;
    const frf = ctx.createBiquadFilter(); frf.type = 'bandpass'; frf.frequency.value = 400; frf.Q.value = 2;
    fr.connect(frf).connect(G(0.006)).connect(this.fridge); fr.start();
    this.fridgeOn = R() < 0.5; this.fridgeT = 8 + R() * 20;
    // Garden breeze and leaves, gusting.
    const br = ctx.createBufferSource(); br.buffer = a.brown; br.loop = true;
    const brf = ctx.createBiquadFilter(); brf.type = 'bandpass'; brf.frequency.value = 380; brf.Q.value = 0.5;
    this.breeze = G(0.05);
    br.connect(brf).connect(this.breeze).connect(this.garden); br.start();
    const lv = ctx.createBufferSource(); lv.buffer = a.noise; lv.loop = true;
    const lvf = ctx.createBiquadFilter(); lvf.type = 'highpass'; lvf.frequency.value = 3000; lvf.Q.value = 0.4;
    this.leaves = G(0.01);
    this.leavesPan = ctx.createStereoPanner();
    lv.connect(lvf).connect(this.leaves).connect(this.leavesPan).connect(this.garden); lv.start(0, 0.7);
    this.gust = 0.4; this.gustTo = 0.5; this.gustT = 0;
    this.nextTick = 0; this.tock = false;
    this.nextSong = 1 + R() * 3;
    this.quiet = 0;
    this.t = 0;
  }

  // dt: seconds; L: listener position; loud: how loud the aircraft is here (0..1); I: cockpit mix.
  update(dt, L, loud, I) {
    const a = this.a, ctx = a.ctx, t = ctx.currentTime;
    this.t += dt;
    const inside = a.inside;
    const duck = 1 - 0.55 * clamp01(loud);
    this.kitchen.gain.setTargetAtTime((0.25 + 0.75 * inside) * duck, t, 0.4);
    this.garden.gain.setTargetAtTime((0.22 + 0.78 * (1 - inside)) * duck, t, 0.4);
    // Fridge cycle.
    this.fridgeT -= dt;
    if (this.fridgeT <= 0) { this.fridgeOn = !this.fridgeOn; this.fridgeT = this.fridgeOn ? 25 + R() * 30 : 20 + R() * 40; }
    const fp = { x: (FRIDGE.x0 + FRIDGE.x1) / 2, y: ROOM.floorY + 0.4, z: (FRIDGE.z0 + FRIDGE.z1) / 2 };
    const F = a.place(fp);
    this.fridge.gain.setTargetAtTime(this.fridgeOn ? 0.5 * Math.min(1, F.gain * 2) : 0, t, this.fridgeOn ? 1.5 : 0.4);
    this.fridgePan.pan.setTargetAtTime(F.pan, t, 0.1);
    // Gusts.
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gustTo = 0.2 + R() * 0.8; this.gustT = 2 + R() * 5; }
    this.gust += (this.gustTo - this.gust) * (1 - Math.exp(-dt / 1.5));
    this.breeze.gain.setTargetAtTime(0.025 + 0.06 * this.gust, t, 0.3);
    this.leaves.gain.setTargetAtTime(0.004 + 0.016 * this.gust * this.gust, t, 0.3);
    this.leavesPan.pan.setTargetAtTime(a.place({ x: TREE.x, y: 1.4, z: TREE.z }).pan * 0.7, t, 0.2);
    // The clock, once a second, tick and tock (only worth scheduling when it could be heard).
    if (inside > 0.3 && t + 0.1 > this.nextTick) {
      const when = Math.max(t, this.nextTick);
      this.nextTick = Math.floor(when) + 1;
      const P = a.place({ x: CLOCK.x, y: CLOCK.y, z: ROOM.minZ + 0.02 });
      const out = this.spotAmb(P, 0.9 * inside * duck);
      const tock = (this.tock = !this.tock);
      a.noiseBurst({ freq: tock ? 2600 : 3300, q: 6, gain: 0.03, attack: 0.0005, decay: 0.012, out, delay: when - t });
      a.tone({ freq: tock ? 1800 : 2150, gain: 0.006, decay: 0.03, out, delay: when - t });
    } else if (inside <= 0.3) this.nextTick = Math.floor(t) + 1;
    // Birds: a robin's warble from the tree or the feeder, now and then, but not with rotors overhead.
    this.quiet = Math.max(this.quiet - dt, 0);
    if (loud > 0.45) this.quiet = 6;
    this.nextSong -= dt;
    if (this.nextSong <= 0) {
      this.nextSong = 2.5 + R() * 6;
      if (this.quiet <= 0 && inside < 0.85) this.robin(R() < 0.5 ? { x: TREE.x, y: 1.3, z: TREE.z } : { x: FEEDER.x, y: FEEDER.y, z: FEEDER.z }, (1 - inside * 0.8));
    }
  }

  spotAmb(P, level) {
    const ctx = this.a.ctx;
    const g = ctx.createGain(); g.gain.value = P.gain * level;
    const p = ctx.createStereoPanner(); p.pan.value = P.pan;
    g.connect(p).connect(this.a.ambBus);
    setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, 3000);
    return g;
  }

  robin(pos, level) {
    const a = this.a;
    const P = a.place(pos);
    const out = this.spotAmb({ pan: P.pan, gain: Math.max(0.25, Math.min(1, P.gain * 3)) }, level);
    let d = 0;
    const n = 4 + Math.floor(R() * 6);
    for (let i = 0; i < n; i++) {
      const f = 2600 + R() * 3600, up = R() < 0.5;
      const len = 0.03 + R() * 0.09;
      a.tone({ freq: f, to: f * (up ? 1.25 + R() * 0.3 : 0.7 + R() * 0.15), gain: 0.012 + R() * 0.01, attack: 0.006, decay: len, out, delay: d });
      d += len + 0.02 + R() * 0.08;
    }
  }
}
