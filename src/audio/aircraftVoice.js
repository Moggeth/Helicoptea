// One aircraft's continuous sound: rotor blade-pass beds locked to the rate each rotor is drawn turning,
// a turboshaft whine and roar that follow torque (the collective), the main gearbox whine, the tail
// rotor (louder with pedal), rotor wash on the surface below, and an imbalance thud from chipped blades.
// Real helicopters hold rotor speed constant, so load is heard as blade bite and engine note, not pitch.
// Each part sits at its own place on the airframe and is panned from there.

import { rotorBeds, buzzBed } from './synth.js';

// Rotor rates match the visual rotors (sim: rotorPhase += rotorSpeed * omega * dt), so on screen and in
// the ear each blade pass lands together.
export const PROFILES = {
  micro: {   // a light turbine single: two-blade teetering rotor, two-blade tail rotor
    rotors: [{ hub: [0, 0.053, 0], omega: 52, blades: 2, thumpHz: 72, thumpTau: 0.018, dipW: 0.0038, slapTau: 0.0028, bladeVar: [1, 0.9], seed: 11 }],
    tail: { pos: [-0.006, 0.026, 0.152], omega: 160, blades: 2, toneHz: 440, gain: 0.07 },
    engines: [{ pos: [0, 0.04, 0.035], whine: 5600, howl: 1520, detune: 0 }],
    gear: 2140, level: 1, thump: 0.5, slap: 0.42, swish: 0.24, swishHz: 1500, slapHz: 1900, wash: 0.16,
  },
  chinook: { // tandem: two interleaved three-blade rotors, twin turboshafts in the aft pylon, no tail rotor
    rotors: [
      { hub: [0, 0.043, -0.067], omega: 30, blades: 3, thumpHz: 46, thumpTau: 0.034, dipW: 0.0068, slapTau: 0.0042, bladeVar: [1, 0.95, 1.05], seed: 21 },
      { hub: [0, 0.053, 0.067], omega: 30, blades: 3, thumpHz: 43, thumpTau: 0.036, dipW: 0.0072, slapTau: 0.0045, bladeVar: [1.04, 0.97, 1], seed: 22, phase: 1 / 6 },
    ],
    tail: null,
    engines: [{ pos: [-0.02, 0.045, 0.06], whine: 4300, howl: 1160, detune: 0 }, { pos: [0.02, 0.045, 0.06], whine: 4300, howl: 1160, detune: 5 }],
    gear: 1360, level: 1.15, thump: 0.62, slap: 0.5, swish: 0.22, swishHz: 1100, slapHz: 1500, wash: 0.22,
  },
  skycrane: { // six-blade main rotor, fast four-blade tail rotor, twin turboshafts on the spine
    rotors: [{ hub: [0, 0.047, 0], omega: 26, blades: 6, thumpHz: 40, thumpTau: 0.028, dipW: 0.0058, slapTau: 0.0038, bladeVar: [1, 0.97, 1.03, 0.98, 1.02, 0.96], seed: 31 }],
    tail: { pos: [-0.012, 0.045, 0.128], omega: 120, blades: 4, toneHz: 300, gain: 0.08 },
    engines: [{ pos: [-0.015, 0.04, 0], whine: 3900, howl: 1010, detune: 0 }, { pos: [0.015, 0.04, 0], whine: 3900, howl: 1010, detune: 4 }],
    gear: 1180, level: 1.2, thump: 0.6, slap: 0.45, swish: 0.22, swishHz: 1000, slapHz: 1350, wash: 0.22,
  },
};

const beds = new Map(); // per sample rate and aircraft: generated once a session
function bedsFor(ctx, type) {
  const key = `${type}@${ctx.sampleRate}`;
  if (!beds.has(key)) {
    const P = PROFILES[type];
    beds.set(key, {
      rotors: P.rotors.map((r) => rotorBeds(ctx, { ...r, seconds: 2 }, r.seed)),
      tail: P.tail ? buzzBed(ctx, { ...P.tail, seconds: 1 }, 7) : null,
    });
  }
  return beds.get(key);
}

// Generate an aircraft's beds ahead of need (a first switch to it then costs nothing mid-flight).
export function prewarm(ctx, type) { bedsFor(ctx, type); }

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function rotate(q, v, out) {
  // out = q * v (quaternion {x,y,z,w} rotating vector [x,y,z])
  const x = v[0], y = v[1], z = v[2];
  const ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z;
  out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return out;
}

export class AircraftVoice {
  // a: the Audio engine (ctx, noise, buses). Output goes to a.aircraftIn (exterior/interior split) and
  // a.cabinOnly (what is only heard inside: the felt rumble and the gearbox through the floor).
  constructor(a, type) {
    const ctx = this.ctx = a.ctx;
    this.a = a;
    this.type = type;
    const P = this.P = PROFILES[type];
    const B = bedsFor(ctx, type);
    this.dead = false;
    this.tq = 0.3;              // engine torque, lags the collective
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.out.connect(a.aircraftIn);
    this.cabin = ctx.createGain(); this.cabin.gain.value = 0;
    this.cabin.connect(a.cabinOnly);
    this.sources = [];          // looping sources whose playbackRate follows rotor speed
    this.oscs = [];
    const t0 = ctx.currentTime + 0.02;
    // Rotors.
    this.rotors = P.rotors.map((R, i) => {
      const bed = B.rotors[i];
      const pan = ctx.createStereoPanner(); pan.connect(this.out);
      const layer = (buf, gain) => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
        const g = ctx.createGain(); g.gain.value = gain;
        s.connect(g);
        s.start(t0, (R.phase || 0) * bed.revSeconds); // the Chinook's aft blades interleave with the forward set
        this.sources.push(s);
        return { s, g };
      };
      const thump = layer(bed.thump, P.thump); thump.g.connect(pan);
      const slap = layer(bed.slap, 0);
      const slapF = ctx.createBiquadFilter(); slapF.type = 'highpass'; slapF.frequency.value = 280; slapF.Q.value = 0.7;
      const slapP = ctx.createBiquadFilter(); slapP.type = 'peaking'; slapP.frequency.value = P.slapHz; slapP.gain.value = 6; slapP.Q.value = 0.8;
      slap.g.connect(slapF).connect(slapP).connect(pan);
      const swish = layer(bed.swish, P.swish);
      const swF = ctx.createBiquadFilter(); swF.type = 'bandpass'; swF.frequency.value = P.swishHz; swF.Q.value = 0.6;
      swish.g.connect(swF).connect(pan);
      const wob = layer(bed.wobble, 0); wob.g.connect(pan);
      // Inside, the rotor is mostly felt: the low end of the thump through the airframe.
      const felt = ctx.createBiquadFilter(); felt.type = 'lowpass'; felt.frequency.value = 160; felt.Q.value = 0.9;
      thump.s.connect(felt).connect(this.cabin);
      return { R, pan, thump, slap, swish, wob, slapF, swF };
    });
    // Tail rotor.
    if (P.tail) {
      const s = ctx.createBufferSource(); s.buffer = B.tail.buffer; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = P.tail.toneHz * 1.4; f.Q.value = 0.9;
      const g = ctx.createGain(); g.gain.value = P.tail.gain;
      const pan = ctx.createStereoPanner();
      s.connect(f).connect(g).connect(pan).connect(this.out);
      s.start(t0);
      this.sources.push(s);
      this.tail = { s, g, pan };
    }
    // Engines: compressor whine (with its second harmonic), a lower turbine howl and exhaust roar.
    this.engines = P.engines.map((E) => {
      const pan = ctx.createStereoPanner(); pan.connect(this.out);
      const mk = (type, f, gain) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = E.detune * 4;
        const g = ctx.createGain(); g.gain.value = gain;
        o.connect(g).connect(pan); o.start(t0); this.oscs.push(o);
        return { o, g };
      };
      const whine = mk('sine', E.whine, 0.012);
      const whine2 = mk('sine', E.whine * 2.003, 0.0015);
      const howl = mk('triangle', E.howl, 0.01);
      const roar = ctx.createBufferSource(); roar.buffer = a.noise; roar.loop = true;
      const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1700; rf.Q.value = 0.5;
      const rg = ctx.createGain(); rg.gain.value = 0.03;
      roar.connect(rf).connect(rg).connect(pan); roar.start(t0, Math.random() * 1.5);
      this.oscs.push(roar);
      return { E, pan, whine, whine2, howl, roar: { f: rf, g: rg } };
    });
    // Main gearbox whine: a fixed multiple of rotor speed, faint outside, plain to hear in the seat.
    const gear = ctx.createOscillator(); gear.type = 'sine'; gear.frequency.value = P.gear;
    const gearOut = ctx.createGain(); gearOut.gain.value = 0.004;
    const gearIn = ctx.createGain(); gearIn.gain.value = 0.02;
    gear.connect(gearOut).connect(this.engines[0].pan);
    gear.connect(gearIn).connect(this.cabin);
    gear.start(t0); this.oscs.push(gear);
    this.gear = { o: gear, out: gearOut, inn: gearIn };
    // Rotor wash on the surface below: a broad roar, fizzier over tea.
    const ws = ctx.createBufferSource(); ws.buffer = a.noise; ws.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0;
    const wp = ctx.createStereoPanner();
    ws.connect(wf).connect(wg).connect(wp).connect(this.out);
    ws.start(t0, Math.random() * 1.5); this.oscs.push(ws);
    this.wash = { f: wf, g: wg, pan: wp };
    this._v = { x: 0, y: 0, z: 0 };
    this.rate = 1;
  }

  // s: flight state from main (see Audio.updateRotor). L: the engine's listener helpers. t: ctx time.
  update(s, L, t, view) {
    if (this.dead) return;
    const P = this.P;
    const rs = Math.max(0.05, Number.isFinite(s.rotorSpeed) ? s.rotorSpeed : 1);
    const strain = clamp01(s.thrustFrac || 0);
    const wear = Number.isFinite(s.wear) ? clamp01(s.wear) : 0;
    // Torque follows the collective with the lag of a governed turboshaft picking up load.
    const k = 1 - Math.exp(-(s.dt || 0.016) / 0.45);
    this.tq += (strain - this.tq) * k;
    const tq = this.tq;
    // Blade-vortex interaction: blades running into their own tip vortices in a descent with power on,
    // or loaded up in a hard turn or flare. This is the "whop" a real helicopter is known by.
    const vy = s.vel ? s.vel.y : 0, hs = s.vel ? Math.hypot(s.vel.x, s.vel.z) : 0;
    const descent = clamp01((-vy - 0.04) / 0.25) * clamp01(strain * 2.5) * (0.6 + 0.4 * clamp01(hs / 0.5));
    const bvi = clamp01(descent + Math.min(1, s.agility || 0) * 0.55 + (s.load || 0) * 0.08 + wear * 0.6);
    const rate = rs * view.doppler * (1 - 0.012 * strain);
    for (const src of this.sources) src.playbackRate.setTargetAtTime(rate, t, 0.04);
    for (const r of this.rotors) {
      r.thump.g.gain.setTargetAtTime(P.thump * (0.55 + 0.6 * strain) * (0.5 + 0.5 * rs), t, 0.06);
      r.slap.g.gain.setTargetAtTime(P.slap * (0.22 + 0.78 * bvi) * rs, t, 0.05);
      r.slapF.frequency.setTargetAtTime(220 + 260 * (1 - bvi), t, 0.1);
      r.swish.g.gain.setTargetAtTime(P.swish * (0.4 + 0.9 * strain) * rs, t, 0.08);
      r.swF.frequency.setTargetAtTime(P.swishHz * (0.85 + 0.4 * strain), t, 0.1);
      r.wob.g.gain.setTargetAtTime(0.5 * clamp01(wear * 1.6), t, 0.1);
      rotate(s.quat, r.R.hub, this._v); r.pan.pan.setTargetAtTime(L.panAt(s.pos, this._v), t, 0.04);
    }
    if (this.tail) {
      const yaw = Math.abs(s.yaw || 0);
      this.tail.g.gain.setTargetAtTime(s.tailGone ? 0 : P.tail.gain * (0.45 + 0.9 * yaw + 0.35 * strain) * rs, t, s.tailGone ? 0.02 : 0.08);
      rotate(s.quat, P.tail.pos, this._v); this.tail.pan.pan.setTargetAtTime(L.panAt(s.pos, this._v), t, 0.04);
    }
    const dop = view.doppler;
    for (const e of this.engines) {
      const n1 = (0.93 + 0.09 * tq) * Math.min(1, 0.4 + 0.6 * rs) * dop;
      e.whine.o.frequency.setTargetAtTime(e.E.whine * n1, t, 0.12);
      e.whine2.o.frequency.setTargetAtTime(e.E.whine * 2.003 * n1, t, 0.12);
      e.howl.o.frequency.setTargetAtTime(e.E.howl * (0.95 + 0.07 * tq) * dop, t, 0.15);
      e.whine.g.gain.setTargetAtTime(0.006 + 0.009 * tq, t, 0.1);
      e.howl.g.gain.setTargetAtTime(0.006 + 0.01 * tq, t, 0.1);
      e.roar.g.gain.setTargetAtTime(0.035 + 0.075 * tq, t, 0.1);   // exhaust roar
      e.roar.f.frequency.setTargetAtTime(520 + 520 * tq, t, 0.15);
      rotate(s.quat, e.E.pos, this._v); e.pan.pan.setTargetAtTime(L.panAt(s.pos, this._v), t, 0.04);
    }
    this.gear.o.frequency.setTargetAtTime(P.gear * rs * dop, t, 0.05);
    // Wash: strongest close to a surface and on full power; over a cup it hisses as the tea ripples.
    const c = clamp01(s.cushion || 0);
    this.wash.g.gain.setTargetAtTime(P.wash * c * (0.3 + 0.7 * strain) * rs, t, 0.12);
    this.wash.f.frequency.setTargetAtTime(s.overLiquid ? 2600 : 600 + 500 * c, t, 0.2);
    this.wash.pan.pan.setTargetAtTime(L.panAt(s.pos, { x: 0, y: -0.06, z: 0 }), t, 0.06);
    // Level: distance attenuation (onboard views sit right on the airframe).
    const level = P.level * view.gain * (0.75 + 0.35 * strain);
    this.out.gain.setTargetAtTime(this.fadeIn ? level : 0, t, this.fadeIn ? 0.12 : 0.05);
    this.cabin.gain.setTargetAtTime(view.interior * P.level * (0.1 + 0.08 * strain), t, 0.1);
    this.fadeIn = true;
  }

  // The flight is over: the rotor spins down and the engines run down, unless the tea got them first.
  runDown(drowned = false) {
    if (this.dead) return;
    this.dead = true;
    const t = this.ctx.currentTime, T = drowned ? 0.7 : 2.8;
    for (const s of this.sources) {
      const p = s.playbackRate; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(drowned ? 0.15 : 0.3, t + T);
    }
    for (const e of this.engines) {
      for (const o of [e.whine.o, e.whine2.o, e.howl.o]) { const f = o.frequency; f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(Math.max(30, f.value * (drowned ? 0.5 : 0.22)), t + T * 1.3); }
    }
    for (const g of [this.out.gain, this.cabin.gain]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, T / 3.5); }
    this.stopAt(t + T * 1.6);
  }

  // Silence now (aircraft switch, restart).
  fadeOut(secs = 0.25) {
    if (this.stopped) return;
    this.dead = true;
    const t = this.ctx.currentTime;
    for (const g of [this.out.gain, this.cabin.gain]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, secs / 4); }
    this.stopAt(t + secs + 0.1);
  }

  stopAt(when) {
    if (this.stopped) return;
    this.stopped = true;
    for (const s of [...this.sources, ...this.oscs]) { try { s.stop(when); } catch { /* already stopped */ } }
    const last = this.oscs[this.oscs.length - 1] || this.sources[0];
    const done = () => { try { this.out.disconnect(); this.cabin.disconnect(); } catch { /* ignore */ } };
    if (last) last.onended = done;
  }
}
