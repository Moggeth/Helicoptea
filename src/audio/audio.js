// Procedural Web Audio: every sound is synthesised at runtime (no sample files, no licences needed).
//
// Signal flow:
//   aircraft voice -> aircraftIn -> exterior (distance low-pass)  -> aircraftBus -> world -> master
//                              \-> interior (canopy muffle)    -/        \-> room reverb -/
//   cabinOnly (felt rumble, gearbox, cautions)                 -/
//   one-shots -> spot (pan, distance) -> sfxBus (muffled in the cockpit) -> world (+ reverb)
//   ambience (kitchen / garden) -> ambBus -> world (+ a little reverb)
//   menus -> uiBus -> master (never muffled or reverberant)
// The kitchen has a short, boxy reverb; the garden is open and dry. Which one you hear follows where
// the camera and the aircraft are.

import { crashSound } from './crashAudio.js';
import { AircraftVoice, prewarm, PROFILES } from './aircraftVoice.js';
import { noiseBuffer, brownBuffer, impulse } from './synth.js';
import { Ambience } from './ambience.js';
import { teaSound, Steep } from './tea.js';
import { uiSound } from './ui.js';
import { extraSound } from './extras.js';
import { ROOM } from '../sim/layout.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const clamp01 = (x) => clamp(x, 0, 1);

// How each camera hears the aircraft. interior: inside the cabin. onboard: mounted on the airframe
// (distance is nil, no Doppler, loud airflow). doppler: a camera the aircraft moves past.
const VIEWS = {
  cockpit: { interior: 1, onboard: true, doppler: false, wind: 'cabin' },
  bolt: { interior: 0, onboard: true, doppler: false, wind: 'airframe' },
  nose: { interior: 0, onboard: true, doppler: false, wind: 'airframe' },
  cargo: { interior: 0, onboard: false, doppler: false, wind: 'downwash' },
  chase: { interior: 0, onboard: false, doppler: false, wind: null }, // it trails the aircraft: Doppler would only wobble
  locked: { interior: 0, onboard: false, doppler: false, wind: null },
  tripod: { interior: 0, onboard: false, doppler: true, wind: null },
  orbit: { interior: 0, onboard: false, doppler: true, wind: null },
};

export function insideHouse(p) {
  return p.x > ROOM.minX && p.x < ROOM.maxX && p.z > ROOM.minZ && p.z < ROOM.maxZ && p.y < ROOM.ceilingY;
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.muted = false;
    this.ready = false;
    this.lastClatter = 0;
    this.lastHit = 0;
    this.voices = 0;
    this.aircraft = 'micro';
    try {
      const v = localStorage.getItem('helicoptea.volume');
      const m = localStorage.getItem('helicoptea.muted');
      if (v !== null) this.volume = Math.min(1, Math.max(0, parseFloat(v)));
      if (m !== null) this.muted = m === '1';
    } catch { /* storage unavailable */ }
    // Listener: camera world-to-view matrix and position.
    this.Lm = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    this.Lp = { x: 0, y: 0.3, z: 0.6 };
    this._l = { x: 0, y: 0, z: 0 };
    this._w = { x: 0, y: 0, z: 0 };
    this.inside = 1;
    this.mix = { interior: 0, wind: 0 };
    this.view = { gain: 1, doppler: 1, interior: 0 };
    this.lastDist = null;
    this.vr = 0;
    this.lastUpdate = -1;
    const self = this;
    this.L = { panAt: (p, off) => self.panAt(p, off) };
  }

  // Must be called from a user gesture (browser autoplay policy).
  unlock() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone: play as media, so the ring / silent switch doesn't mute the game (Safari 16.4+).
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
    this.attach(new AC({ latencyHint: 'interactive' }));
  }

  // Builds the whole graph on a context (also used with an OfflineAudioContext to render clips).
  attach(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.knee.value = 8; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
    this.master.connect(this.comp).connect(ctx.destination);
    this.noise = noiseBuffer(ctx, 2);
    this.brown = brownBuffer(ctx, 3);
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    this.world = G(1); this.world.connect(this.master);
    this.worldIn = this.world; // the radio and the cat join the world mix
    this.uiBus = G(1.5); this.uiBus.connect(this.master);
    // Room reverb, one per environment, crossfaded.
    this.revSend = G(1);
    this.revKitchen = ctx.createConvolver(); this.revKitchen.buffer = impulse(ctx, { rt60: 0.62, pre: 0.006, damp: 0.7, width: 1, taps: [[0.009, 0.5], [0.014, 0.35], [0.021, 0.3], [0.031, 0.22], [0.043, 0.15]] }, 5);
    this.revGarden = ctx.createConvolver(); this.revGarden.buffer = impulse(ctx, { rt60: 0.22, pre: 0.012, damp: 0.9, width: 1, taps: [[0.028, 0.35], [0.06, 0.12]] }, 9);
    this.revKG = G(0); this.revGG = G(0);
    this.revSend.connect(this.revKitchen).connect(this.revKG).connect(this.world);
    this.revSend.connect(this.revGarden).connect(this.revGG).connect(this.world);
    // Aircraft: exterior and interior paths.
    this.aircraftIn = G(1);
    // Sub-bass a speaker can't play would only pump the compressor.
    this.aircraftBus = G(1); this.acHP = F('highpass', 32, 0.7); this.aircraftBus.connect(this.acHP).connect(this.world);
    this.acRev = G(0.5); this.aircraftBus.connect(this.acRev).connect(this.revSend);
    this.extLP = F('lowpass', 16000, 0.5); this.extG = G(1);
    this.aircraftIn.connect(this.extLP).connect(this.extG).connect(this.aircraftBus);
    // Through the canopy and a headset: the slap loses its edge, the low thump stays.
    this.cabLP = F('lowpass', 1600, 0.6); this.cabPk = F('peaking', 115, 1.1); this.cabPk.gain.value = 2; this.intG = G(0);
    this.aircraftIn.connect(this.cabLP).connect(this.cabPk).connect(this.intG).connect(this.aircraftBus);
    this.cabinOnly = G(0); this.cabinOnly.connect(this.aircraftBus);
    // One-shots and ambience: muffled in the cabin.
    this.sfxBus = G(1); this.sfxLP = F('lowpass', 20000, 0.5); this.sfxBus.connect(this.sfxLP).connect(this.world);
    this.sfxRev = G(0.55); this.sfxBus.connect(this.sfxRev).connect(this.revSend);
    this.ambBus = G(1); this.ambLP = F('lowpass', 20000, 0.5); this.ambBus.connect(this.ambLP).connect(this.world);
    this.ambRev = G(0.25); this.ambBus.connect(this.ambRev).connect(this.revSend);
    this.buildAir();
    this.buildCabin();
    this.ambience = new Ambience(this);
    this.steep = new Steep(this);
    this.ready = true;
    // The rotor beds take a few milliseconds each to generate: do them in idle moments, one per slot.
    if (typeof window !== 'undefined') {
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
      const todo = Object.keys(PROFILES);
      const next = () => { const t = todo.shift(); if (!t) return; prewarm(ctx, t); idle(next); };
      idle(next);
    }
  }

  // Airflow heard by onboard cameras and in the cabin, chopped by the rotor wash at blade-pass rate.
  buildAir() {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.brown; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 0.6;
    const am = ctx.createGain(); am.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 16;
    const depth = ctx.createGain(); depth.gain.value = 0;
    lfo.connect(depth).connect(am.gain);
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f).connect(am).connect(g).connect(this.world);
    // Canopy seal hiss.
    const h = ctx.createBufferSource(); h.buffer = this.noise; h.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2800; hf.Q.value = 0.8;
    const hg = ctx.createGain(); hg.gain.value = 0;
    h.connect(hf).connect(hg).connect(this.world);
    s.start(); lfo.start(); h.start();
    this.air = { f, depth, g, lfo, hg };
  }

  // Cockpit-only cues: intercom hiss, and the warning horn (low rotor speed, lost tail rotor, chipped blades).
  buildCabin() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3200; nf.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0;
    n.connect(nf).connect(ng).connect(this.world); n.start();
    const horn = ctx.createOscillator(); horn.type = 'square'; horn.frequency.value = 600;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1200; hf.Q.value = 1.2;
    const gate = ctx.createGain(); gate.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.2;
    const lfoD = ctx.createGain(); lfoD.gain.value = 0.5;
    const hg = ctx.createGain(); hg.gain.value = 0;
    lfo.connect(lfoD).connect(gate.gain); gate.gain.value = 0.5;
    horn.connect(hf).connect(gate).connect(hg).connect(this.world);
    horn.start(); lfo.start();
    this.cabinFx = { hiss: ng, horn: hg, hornOsc: horn };
  }

  setVolume(v) {
    this.volume = v;
    try { localStorage.setItem('helicoptea.volume', String(v)); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('helicoptea.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  resume() {
    if (!this.ctx || this.ctx.state === 'running' || this.ctx.state === 'closed') return;
    // Includes Safari's interrupted state. A denied attempt is recoverable on the next gesture.
    this.ctx.resume().catch(() => {});
  }
  suspend(s) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    if (s) this.ctx.suspend().catch(() => {});
    else this.resume();
  }

  // ---------------------------------------------------------------- listener
  // camera: a THREE camera with an up-to-date matrixWorld / matrixWorldInverse.
  setListener(camera) {
    const m = camera.matrixWorldInverse.elements;
    for (let i = 0; i < 16; i++) this.Lm[i] = m[i];
    this.Lp.x = camera.position.x; this.Lp.y = camera.position.y; this.Lp.z = camera.position.z;
  }
  toView(p, out) {
    const m = this.Lm;
    out.x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
    out.y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    out.z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
    return out;
  }
  // Pan of a world point (plus an optional offset): a point above or below the head is centred.
  panAt(p, off) {
    const w = this._w;
    w.x = p.x + (off ? off.x : 0); w.y = p.y + (off ? off.y : 0); w.z = p.z + (off ? off.z : 0);
    const l = this.toView(w, this._l);
    const d = Math.hypot(l.x, l.y, l.z);
    const pan = clamp(l.x / (d + 0.03), -1, 1) * 0.85;
    return Number.isFinite(pan) ? pan : 0;
  }
  // Distance law at the models' scale: a few body lengths away is close, across the garden is far.
  static distGain(d) { return 1 / (1 + Math.max(0, d - 0.25) / 0.55); }
  static distLP(d) { return 18000 / Math.pow(1 + Math.max(0, d - 0.2) * 0.9, 1.2); }

  // Where a one-shot sits: { pan, gain, lp } for a world position (null: centred, full level).
  place(pos) {
    if (!pos) return { pan: 0, gain: 1, lp: 20000 };
    const l = this.toView(pos, this._l);
    const d = Math.hypot(l.x, l.y, l.z);
    const behind = clamp01(l.z / (d + 1e-6));
    return { pan: clamp(l.x / (d + 0.03), -1, 1) * 0.85, gain: Audio.distGain(d), lp: Audio.distLP(d) * (1 - 0.4 * behind) };
  }

  // A short-lived output for one event: pan, distance level and air absorption, into the sfx bus.
  spot(pos, level = 1, life = 6) {
    const ctx = this.ctx, P = this.place(pos);
    const g = ctx.createGain(); g.gain.value = P.gain * level;
    const p = ctx.createStereoPanner(); p.pan.value = Number.isFinite(P.pan) ? P.pan : 0;
    g.connect(p);
    if (P.lp < 15000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = P.lp; p.connect(f).connect(this.sfxBus); }
    else p.connect(this.sfxBus);
    // Let the chain go once its sounds are done.
    setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, life * 1000);
    return g;
  }

  // ---------------------------------------------------------------- continuous
  // Called every frame with flight state. Fields (all optional except alive):
  //  alive, type ('micro' | 'chinook' | 'skycrane'), rotorSpeed, thrustFrac, load, agility, cushion, wear,
  //  tailGone, pos, quat, vel, yaw (pedal), view (camera mode), overLiquid, dist.
  // The older heavy / crane / pan fields are still understood.
  updateRotor(state) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dt = this.lastUpdate < 0 ? 0.016 : Math.max(0, t - this.lastUpdate);
    // The audio thread smooths every parameter, so a fast display needn't update it every frame.
    if (dt < 1 / 75 && this.lastUpdate >= 0) return;
    this.lastUpdate = t;
    const type = state.type || (state.crane ? 'skycrane' : state.heavy ? 'chinook' : 'micro');
    this.aircraft = type;
    const V = VIEWS[state.view] || VIEWS.chase;
    const pos = state.pos || { x: this.Lp.x, y: this.Lp.y, z: this.Lp.z - (state.dist ?? 0.4) };
    const quat = state.quat || { x: 0, y: 0, z: 0, w: 1 };
    // Distance and Doppler from the aircraft's middle.
    const l = this.toView(pos, this._l);
    const d = V.onboard || V.interior ? 0.05 : Math.hypot(l.x, l.y, l.z);
    if (this.lastDist !== null && dt > 0) this.vr += ((d - this.lastDist) / Math.max(dt, 1e-3) - this.vr) * 0.25;
    this.lastDist = d;
    // The models fly through a full-size world: speeds are scaled up so a fly-past is heard as one.
    const dop = V.doppler ? clamp(1 / (1 + this.vr * 18 / 343), 0.93, 1.07) : 1;
    const ik = 1 - Math.exp(-dt / 0.12);
    this.mix.interior += (V.interior - this.mix.interior) * ik;
    const I = this.mix.interior;
    this.view.gain = Audio.distGain(d);
    this.view.doppler += (dop - this.view.doppler) * 0.3;
    this.view.interior = I;
    const behind = clamp01(l.z / (Math.hypot(l.x, l.y, l.z) + 1e-6));
    this.extLP.frequency.setTargetAtTime(Math.max(400, Audio.distLP(d) * (1 - 0.35 * behind * (V.onboard ? 0 : 1))), t, 0.08);
    this.extG.gain.setTargetAtTime(1 - I, t, 0.05);
    this.intG.gain.setTargetAtTime(I * 0.62, t, 0.05);
    this.cabinOnly.gain.setTargetAtTime(I, t, 0.05);
    this.sfxLP.frequency.setTargetAtTime(20000 - 17200 * I, t, 0.05);
    this.ambLP.frequency.setTargetAtTime(20000 - 18800 * I, t, 0.05);
    this.acRev.gain.setTargetAtTime(0.5 * (1 - 0.8 * I), t, 0.1);

    // Voice for this aircraft (a new one after a crash, a restart or a switch).
    if (state.alive) {
      if (!this.voice || this.voice.dead || this.voice.type !== type) {
        if (this.voice && !this.voice.dead) this.voice.fadeOut(0.2);
        this.voice = new AircraftVoice(this, type);
      }
      this.voice.update({ ...state, pos, quat, dt }, this.L, t, this.view);
    } else if (this.voice && !this.voice.dead) {
      this.voice.runDown(this.drowned);
    }
    this.drowned = false;

    // Airflow for onboard views, the cargo hook's downwash, and the cabin's seal hiss.
    const sp = state.vel ? Math.hypot(state.vel.x, state.vel.y, state.vel.z) : 0;
    const strain = clamp01(state.thrustFrac || 0);
    const bpf = { micro: 16.6, chinook: 14.3, skycrane: 24.8 }[type] * (state.rotorSpeed || 0);
    let wg = 0, wf = 400, depth = 0, hiss = 0;
    if (state.alive) {
      if (V.wind === 'airframe') { wg = 0.04 + 0.3 * clamp01(sp / 1.6) + 0.08 * strain; wf = 350 + 1800 * clamp01(sp / 1.6); depth = 0.3; }
      else if (V.wind === 'downwash') { wg = 0.06 + 0.28 * strain; wf = 300 + 600 * strain; depth = 0.45; }
      else if (V.wind === 'cabin') { hiss = 0.004 + 0.03 * clamp01(sp / 1.4); }
    }
    this.air.g.gain.setTargetAtTime(wg, t, 0.15);
    this.air.f.frequency.setTargetAtTime(wf, t, 0.15);
    this.air.depth.gain.setTargetAtTime(depth, t, 0.2);
    if (bpf > 1) this.air.lfo.frequency.setTargetAtTime(bpf, t, 0.05);
    this.air.hg.gain.setTargetAtTime(hiss, t, 0.15);
    // Cockpit cues.
    this.aliveFor = state.alive ? (this.aliveFor || 0) + dt : 0;
    const warn = state.alive && (((state.rotorSpeed ?? 1) < 0.9 && this.aliveFor > 1.5) || state.tailGone || (state.wear || 0) > 0.25);
    this.cabinFx.hiss.gain.setTargetAtTime(state.alive ? I * 0.0035 : 0, t, 0.2);
    this.cabinFx.horn.gain.setTargetAtTime(warn ? I * 0.045 + (1 - I) * 0.004 : 0, t, 0.05);

    // Environment: inside the kitchen or out in the garden (camera and aircraft both count).
    const inCam = insideHouse(this.Lp) ? 1 : 0, inAc = insideHouse(pos) ? 1 : 0;
    const want = state.alive ? inCam * 0.55 + inAc * 0.45 : inCam;
    this.inside += (want - this.inside) * (1 - Math.exp(-dt / 0.6));
    this.revKG.gain.setTargetAtTime(0.42 * this.inside, t, 0.2);
    this.revGG.gain.setTargetAtTime(0.18 * (1 - this.inside), t, 0.2);
    // Ambience ducks under a close, loud aircraft.
    const loud = state.alive ? this.view.gain * (0.5 + 0.5 * strain) : 0;
    this.ambience.update(dt, this.Lp, loud, I);
  }

  // Tea-bag steeping and sloshing (continuous): bags from the sim.
  updateTea(bags) {
    if (!this.ready) return;
    this.steep.update(bags, this.ctx.currentTime);
  }

  // Continuous milk stream: a soft hiss while falling, a deeper trickle once it lands in liquid.
  updatePour({ rate, intoLiquid, pan, pos }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.pour) {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6; f.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner();
      src.connect(f).connect(g).connect(p).connect(this.sfxBus);
      src.start();
      this.pour = { f, g, p, liquid: 0, nextBubble: 0 };
    }
    const P = this.pour;
    P.liquid += ((intoLiquid ? 1 : 0) - P.liquid) * 0.15;
    const level = Math.min(1, Math.sqrt(Math.max(0, rate) / 1.0e-5));
    P.f.frequency.setTargetAtTime(2600 - 1700 * P.liquid + 300 * Math.sin(t * 23), t, 0.03);
    P.g.gain.setTargetAtTime(level * (0.05 + 0.07 * P.liquid), t, rate > 0 ? 0.04 : 0.08);
    const pp = pos ? this.place(pos).pan : pan || 0;
    P.p.pan.setTargetAtTime(clamp(pp, -0.8, 0.8), t, 0.05);
    // A stream into tea carries air down with it: little bubbles pop as it goes in.
    if (level > 0.05 && P.liquid > 0.5 && t > P.nextBubble) {
      P.nextBubble = t + 0.03 + Math.random() * 0.09 / level;
      teaSound(this, 'bubble', { freq: 900 + Math.random() * 1800, gain: 0.02 * level, out: this.spot(pos || null) });
    }
  }

  // ---------------------------------------------------------------- one-shots
  env(node, t0, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  // A busy moment (a crash's hail of debris) mustn't pile up hundreds of nodes.
  claim(gain) {
    if (this.voices > 90 && gain < 0.05) return false;
    if (this.voices > 160) return false;
    this.voices++;
    return true;
  }

  outFor(pan, out) {
    if (out) return out;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1);
    p.connect(this.sfxBus);
    return p;
  }

  noiseBurst({ freq = 1000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.002, decay = 0.2, pan = 0, sweepTo = null, delay = 0, out = null, buffer = null }) {
    if (!this.ready || !this.claim(gain)) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = buffer || this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + attack + decay);
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.outFor(pan, out));
    this.env(g, t0, attack, gain, decay);
    src.onended = () => { this.voices--; g.disconnect(); };
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + attack + decay + 0.05);
  }

  tone({ freq = 440, to = null, type = 'sine', gain = 0.2, attack = 0.002, decay = 0.2, pan = 0, delay = 0, out = null }) {
    if (!this.ready || !this.claim(gain)) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
    const g = ctx.createGain();
    o.connect(g).connect(this.outFor(pan, out));
    this.env(g, t0, attack, gain, decay);
    o.onended = () => { this.voices--; g.disconnect(); };
    o.start(t0); o.stop(t0 + attack + decay + 0.05);
  }

  explosion(pan, scale = 1, out = null) {
    if (!this.ready) return;
    const o = out || this.outFor(pan);
    this.tone({ freq: 90 / Math.sqrt(scale), to: 28, gain: 0.9 * Math.min(1.2, scale), attack: 0.005, decay: 1.1 * Math.sqrt(scale), out: o });
    this.noiseBurst({ freq: 3000, type: 'lowpass', q: 0.7, gain: 0.9 * Math.min(1.2, scale), attack: 0.003, decay: 0.9, sweepTo: 180, out: o });
    this.noiseBurst({ freq: 900, q: 0.6, gain: 0.35 * scale, attack: 0.02, decay: 1.6, sweepTo: 120, out: o, delay: 0.05 });
  }

  // Menu and game-state cues.
  ui(kind, opts) { if (this.ready) uiSound(this, kind, opts); }

  handleEvents(events) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    for (const e of events) {
      switch (e.type) {
        case 'crash': this.drowned = e.kind === 'dunk'; crashSound(this, e, this.spot(e.pos, 1, 9)); break;
        case 'rotorShatter': case 'tailStrike': case 'teaStrike': crashSound(this, e, this.spot(e.pos, 1)); break;
        case 'rotorTick':
          if (now - (this.lastTick || 0) > 0.03) { this.lastTick = now; crashSound(this, e, this.spot(e.pos)); }
          break;
        case 'bump': {
          const o = this.spot(e.pos), heavy = this.aircraft !== 'micro';
          this.noiseBurst({ freq: heavy ? 260 : 380, q: 1.4, gain: Math.min(0.5, 0.12 + e.dv * 0.35), decay: 0.12, out: o });
          this.tone({ freq: heavy ? 100 : 140, to: 55, gain: 0.18 * Math.min(1, e.dv), decay: 0.14, out: o });
          // The airframe rattles after a knock.
          for (let i = 0; i < 3; i++) this.noiseBurst({ freq: 2200 + Math.random() * 1500, q: 5, gain: 0.03 * Math.min(1, e.dv), decay: 0.02, out: o, delay: 0.03 + i * 0.025 });
          break;
        }
        case 'touchdown': {
          const s = Math.min(1, e.speed / 0.6), o = this.spot(e.pos);
          if (this.aircraft === 'micro') {
            this.tone({ freq: 120, to: 60, gain: 0.12 + 0.3 * s, attack: 0.003, decay: 0.16, out: o });
            this.noiseBurst({ freq: 600, q: 1.2, gain: 0.05 + 0.15 * s, decay: 0.08, out: o });
            this.noiseBurst({ freq: 2600, q: 5, gain: 0.03 * s, decay: 0.12, out: o, delay: 0.03 }); // skid tubes ring
          } else {
            // Wheels: oleo struts compress with a hiss and a deep thump, a little tyre squeak.
            this.tone({ freq: 85, to: 42, gain: 0.16 + 0.32 * s, attack: 0.006, decay: 0.22, out: o });
            this.noiseBurst({ freq: 450, q: 0.9, gain: 0.05 + 0.14 * s, decay: 0.12, out: o });
            this.noiseBurst({ freq: 5200, type: 'highpass', q: 0.5, gain: 0.02 + 0.03 * s, attack: 0.02, decay: 0.25, out: o, delay: 0.02 });
            if (s > 0.3) this.tone({ freq: 1900, to: 1500, type: 'triangle', gain: 0.02 * s, attack: 0.01, decay: 0.08, out: o });
          }
          break;
        }
        case 'scrape':
          if (now - (this.lastScrape || 0) > 0.06) { this.lastScrape = now; this.noiseBurst({ freq: 1800 + Math.random() * 600, q: 2.2, gain: Math.min(0.12, 0.03 + e.speed * 0.15), attack: 0.005, decay: 0.07, out: this.spot(e.pos) }); }
          break;
        case 'snatch': {
          if (now - (this.lastSnatch || 0) < 0.15) break;
          this.lastSnatch = now;
          const s = Math.min(1, e.speed / 0.8), o = this.spot(e.pos);
          this.tone({ freq: 210 + Math.random() * 30, to: 150, type: 'triangle', gain: 0.05 + 0.12 * s, attack: 0.002, decay: 0.22, out: o }); // the string goes taut
          this.tone({ freq: 420 + Math.random() * 60, to: 300, type: 'sine', gain: 0.02 + 0.04 * s, attack: 0.002, decay: 0.12, out: o });
          this.noiseBurst({ freq: 3200, q: 3, gain: 0.04 + 0.08 * s, decay: 0.03, out: o });
          break;
        }
        case 'splash': case 'bucketSplash': case 'extract': case 'drip': case 'milkSplash': case 'bagHit':
          teaSound(this, e.type, e);
          break;
        case 'clatter':
          if (now - this.lastClatter > 0.04) {
            this.lastClatter = now;
            this.noiseBurst({ freq: 2200 + Math.random() * 2000, q: 3, gain: Math.min(0.2, 0.03 + e.dv * 0.03), decay: 0.06, out: this.spot(e.pos) });
            this.tone({ freq: 1800 + Math.random() * 1600, gain: Math.min(0.06, 0.01 + e.dv * 0.01), decay: 0.09, out: this.spot(e.pos) });
          }
          break;
        case 'appleDrop': {
          const o = this.spot(e.apple && e.apple.pos);
          this.tone({ freq: 160, to: 90, gain: 0.08, attack: 0.002, decay: 0.09, out: o, delay: 0.25 });
          this.noiseBurst({ freq: 700, q: 1, gain: 0.05, decay: 0.07, out: o, delay: 0.25 });
          break;
        }
        case 'radio': this.noiseBurst({ freq: 3800, q: 4, gain: 0.05, decay: 0.015, pan: 0 }); this.tone({ freq: 1300, gain: 0.02, decay: 0.03 }); break;
        case 'attach': {
          // The hook's latch snaps shut on the loop.
          const o = this.spot(e.bag && e.bag.pos);
          this.noiseBurst({ freq: 5200, q: 3, gain: 0.08, decay: 0.012, out: o });
          this.tone({ freq: 1950, to: 1880, gain: 0.05, decay: 0.09, out: o });
          this.tone({ freq: 3350, gain: 0.02, decay: 0.05, out: o });
          this.ui('attach');
          break;
        }
        case 'release': {
          const o = this.spot(e.bag && e.bag.pos);
          this.noiseBurst({ freq: 3800, q: 3, gain: 0.06, decay: 0.02, out: o });
          this.tone({ freq: 1500, to: 1200, gain: 0.035, decay: 0.08, out: o });
          this.ui('release');
          break;
        }
        case 'restart': this.ui('restart'); break;
        case 'extra': extraSound(this, e, now); break;
        default: break;
      }
    }
  }
}

