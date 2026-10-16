import * as THREE from 'three';
import { CFG } from '../config.js';
import { CH, NCH, KINDS, RECORD_EVERY, EVENT_FIELDS, ROPE_POINTS, HOSE_POINTS, Flight, Rows } from './format.js';

// Records every flight automatically: a fixed-rate sample of the aircraft, inputs and telemetry, plus
// keyframes for everything else that moves (bags and their strings, the bucket, the snorkel hose,
// wreckage and loose props). Read-only with respect to the simulation. Recent flights stay in a bounded
// ring in memory; finished flights are handed to `onFlightEnd` (the game saves them to disk).
//
// Call afterStep(ctl) after every sim.step(), and frameEnd() right after sim.drainEvents().

const D = 180 / Math.PI;
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _a = new THREE.Vector3();
const POST_CRASH = 10;             // seconds of wreckage kept after a crash
const MAX_SAMPLES = 60 * 60 * 15;  // a flight longer than 15 minutes continues in a new log

export class FlightRecorder {
  constructor(sim, opts = {}) {
    this.sim = sim;
    this.maxFlights = opts.maxFlights || 12;
    this.maxBytes = opts.maxBytes || 96 * 1024 * 1024;
    this.getInput = opts.getInput || (() => null);
    this.settings = opts.settings || (() => ({}));
    this.onFlightEnd = opts.onFlightEnd || null;
    this.enabled = opts.enabled !== false;
    this.flights = [];          // oldest first; the last one is usually the live flight
    this.cur = null;
    this.seen = 0;              // sim.events already looked at this frame
    this.stepN = 0;
    this.wall = 0;
    this.worldSpeed = 1;
    this.wreckAircraft = new Map();
    this.row = new Float32Array(NCH);
    this.bufs = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, new Float32Array(v.fields.length)]));
    this.keyBuf = new Float32Array(1 + Math.max(...Object.values(KINDS).map((v) => v.fields.length)));
    this.ropeTmp = new Float32Array(ROPE_POINTS * 3);
    this.recordMs = 0;          // time spent recording (for the overhead check)
  }

  get current() { return this.cur; }

  // ---------------------------------------------------------------- flights
  startFlight(continued = null) {
    const sim = this.sim, h = sim.heli;
    if (this.cur) this.endFlight();
    const def = h ? { id: h.def.id, mass: +h.def.mass.toFixed(5), thrustToWeight: h.def.thrustToWeight, hooks: h.def.hooks, rotorRadius: h.def.rotorRadius, gearDrop: h.def.gearDrop, scale: h.def.scale } : null;
    const f = new Flight({ aircraft: sim.aircraft, def: structuredClone(def), recordHz: Math.round(1 / (sim.dt * RECORD_EVERY)), physicsHz: Math.round(1 / sim.dt), settings: structuredClone({ ...this.settings(), continuedFrom: continued }) });
    f.heliId = sim.heliId;
    f.t0 = sim.time;
    f.crashAt = -1;
    this.cur = f;
    this.wall = 0;
    this.stepN = 0;
    this.flights.push(f);
    this.evict();
    return f;
  }

  endFlight() {
    const f = this.cur;
    if (!f) return;
    this.cur = null;
    f.ended = true;
    f.dirty = true;
    if (f.n === 0) { this.flights.splice(this.flights.indexOf(f), 1); return; }
    if (this.onFlightEnd) this.onFlightEnd(f);
  }

  recordSettings() {
    const f = this.cur;
    if (!f || !this.enabled) return;
    f.events.push({ type: 'settings', i: f.n, t: this.sim.time - f.t0, wall: this.wall, settings: structuredClone(this.settings()) });
    f.dirty = true;
  }

  evict() {
    let bytes = this.flights.reduce((s, f) => s + f.bytes, 0);
    while (this.flights.length > 1 && (this.flights.length > this.maxFlights || bytes > this.maxBytes) && this.flights[0] !== this.cur) {
      bytes -= this.flights[0].bytes;
      this.flights.shift();
    }
  }

  // ---------------------------------------------------------------- per step
  afterStep(ctl) {
    if (!this.enabled) return;
    const t0 = performance.now();
    const sim = this.sim;
    if (!this.cur || sim.heliId !== this.cur.heliId) this.startFlight();
    const f = this.cur;
    for (; this.seen < sim.events.length; this.seen++) this.logEvent(sim.events[this.seen]);
    const recording = !(f.crashAt >= 0 && sim.time - f.crashAt > POST_CRASH);
    if (recording && this.stepN % RECORD_EVERY === 0) {
      if (f.n >= MAX_SAMPLES || (f.n > 0 && f.n % 60 === 0 && f.bytes >= this.maxBytes)) this.startFlight(f.id);
      this.sample(ctl);
      if (this.cur.n % 60 === 0) this.evict();
    }
    this.stepN++;
    this.wall += sim.dt / Math.max(0.05, this.worldSpeed);
    this.recordMs += performance.now() - t0;
  }

  frameEnd() { this.seen = 0; }

  // Index of the newest sample, and the as-flown time there (where a note made now attaches).
  now() {
    const f = this.cur;
    if (!f || !f.n) return null;
    return { flight: f, i: f.n - 1, t: f.samples.get(f.n - 1, CH.t), wall: f.samples.get(f.n - 1, CH.wall) };
  }

  addNote(note, flight = null, at = null) {
    const f = flight || this.cur || this.flights[this.flights.length - 1];
    if (!f || !f.n) return null;
    const i = at ?? f.n - 1;
    const n = { id: `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, i: +i.toFixed(2), t: +f.samples.get(Math.floor(i), CH.t).toFixed(3), wall: +f.wallAt(i).toFixed(3),
      tag: note.tag || 'mark', text: note.text || '', source: note.source || 'flight', created: new Date().toISOString() };
    f.notes.push(n);
    f.notes.sort((a, b) => a.i - b.i);
    f.dirty = true;
    return n;
  }

  logEvent(e) {
    if (e.type === 'crash') { this.wreckAircraft.set(e.wreckId, e.aircraft); if (this.cur) this.cur.crashAt = this.sim.time; }
    const fields = EVENT_FIELDS[e.type];
    const f = this.cur;
    if (!fields || !f) return;
    const out = { type: e.type, i: f.n, t: +(this.sim.time - f.t0).toFixed(4), wall: +this.wall.toFixed(4) };
    for (const k of fields) {
      const v = e[k];
      if (v === undefined || v === null) continue;
      if (typeof v === 'number') out[k] = +v.toFixed(4);
      else if (v.isVector3) out[k] = [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
      else if (typeof v !== 'object') out[k] = v;
    }
    f.events.push(out);
    f.dirty = true;
  }

  // ---------------------------------------------------------------- one sample
  sample(ctl) {
    const sim = this.sim, f = this.cur, r = this.row, h = sim.heli;
    r.fill(0);
    r[CH.t] = sim.time - f.t0;
    r[CH.wall] = this.wall;
    r[CH.worldSpeed] = this.worldSpeed;
    r[CH.assist] = sim.assist ? 1 : 0;
    if (ctl) {
      r[CH['in.pitch']] = ctl.pitch; r[CH['in.roll']] = ctl.roll; r[CH['in.yaw']] = ctl.yaw; r[CH['in.coll']] = ctl.collective;
      r[CH['in.pour']] = ctl.pour ? 1 : 0; r[CH['in.doors']] = ctl.doors || 0; r[CH['in.pump']] = ctl.pump || 0; r[CH['in.reel']] = ctl.reel || 0;
    }
    const inp = this.getInput();
    if (inp) {
      r[CH.src] = { keyboard: 0, gamepad: 1, touch: 2 }[inp.source] || 0;
      for (const [dev, o] of [['kb', inp.kb], ['gp', inp.gp], ['touch', inp.touch]]) {
        if (!o) continue;
        r[CH[`${dev}.pitch`]] = o.pitch || 0; r[CH[`${dev}.roll`]] = o.roll || 0; r[CH[`${dev}.yaw`]] = o.yaw || 0; r[CH[`${dev}.coll`]] = o.collective || 0;
      }
      const raw = inp.raw;
      if (raw && raw.axes) {
        for (let k = 0; k < 4; k++) r[CH[`gp.ax${k}`]] = raw.axes[k] || 0;
        const b = raw.buttons || [];
        r[CH['gp.lt']] = typeof b[6] === 'number' ? b[6] : (b[6]?.value || 0);
        r[CH['gp.rt']] = typeof b[7] === 'number' ? b[7] : (b[7]?.value || 0);
      }
    }
    const cargo = sim.carriedCargo();
    if (h) {
      r[CH.alive] = 1;
      r[CH.px] = h.pos.x; r[CH.py] = h.pos.y; r[CH.pz] = h.pos.z;
      r[CH.qx] = h.quat.x; r[CH.qy] = h.quat.y; r[CH.qz] = h.quat.z; r[CH.qw] = h.quat.w;
      r[CH.vx] = h.vel.x; r[CH.vy] = h.vel.y; r[CH.vz] = h.vel.z;
      _q.copy(h.quat); _qi.copy(_q).invert();
      const w = h.body.angvel();
      _v.set(w.x, w.y, w.z).applyQuaternion(_qi);
      r[CH['rate.pitch']] = _v.x * D; r[CH['rate.yaw']] = -_v.y * D; r[CH['rate.roll']] = -_v.z * D;
      _f.set(0, 0, -1).applyQuaternion(_q); _r.set(1, 0, 0).applyQuaternion(_q); _u.set(0, 1, 0).applyQuaternion(_q);
      r[CH.pitch] = Math.asin(Math.max(-1, Math.min(1, _f.y))) * D;
      r[CH.roll] = Math.atan2(-_r.y, _u.y) * D;
      r[CH.heading] = -h.heading() * D;
      r[CH.speed] = h.vel.length(); r[CH.hspeed] = Math.hypot(h.vel.x, h.vel.z); r[CH.vspeed] = h.vel.y;
      r[CH.agl] = h.skidClearance; r[CH.hubAgl] = h.groundDist; r[CH.grounded] = h.grounded ? 1 : 0;
      r[CH.collective] = h.collective; r[CH.thrust] = h.thrust; r[CH.thrustFrac] = h.thrustFrac;
      r[CH.rotorSpeed] = h.rotorSpeed;
      r[CH.cmdPitch] = (h.cmdPitch || 0) * D; r[CH.cmdRoll] = (h.cmdRoll || 0) * D;
      if (h.mix) { r[CH['mix.pitch']] = h.mix.pitch; r[CH['mix.roll']] = h.mix.roll; r[CH['mix.yaw']] = h.mix.yaw; }
      r[CH.rotorPhase] = h.rotorPhase || 0;
      r[CH.rotorPhase2] = h.type === 'chinook' ? h.phaseOf(1) : 0;
      r[CH.tailPhase] = h.tailPhase || 0;
      if (h.tilt) { r[CH.tilt0] = h.tilt[0] || 0; r[CH.tilt1] = h.tilt[1] || 0; }
      r[CH.load] = h.load || 0;
      r[CH.impactAcc] = h.impactAcc || 0; r[CH.rotorContact] = h.rotorContact || 0;
      if (h.dmg) { r[CH.wear] = Math.max(...h.dmg.wear); r[CH.shed] = h.dmg.shed; r[CH.spin] = h.dmg.tail ? h.dmg.spin * D : 0; }
      const tk = h.tank;
      if (tk) {
        r[CH.tankFill] = tk.vol / tk.capacity; r[CH.tankDoors] = tk.doors; r[CH.pumping] = tk.pumping ? 1 : 0;
        r[CH.hoseLength] = h.hose.length; r[CH.intakeDepth] = h.hose.submerged ? h.hose.depth : 0;
      }
    }
    let loadMass = 0, wet = 0, imm = 0;
    for (const b of cargo) { loadMass += b.mass; imm = Math.max(imm, b.immersion || 0); if (b !== sim.milk.bucket) wet = Math.max(wet, b.wetness || 0); }
    r[CH.loadMass] = loadMass; r[CH.nCarried] = cargo.length; r[CH.wetness] = wet; r[CH.immersion] = Math.min(1, imm);
    if (h) r[CH.tw] = h.thrust / ((h.def.mass + loadMass) * CFG.physics.gravity);
    const bk = sim.milk.bucket;
    r[CH.bucketFill] = bk ? bk.fill : 0;
    const i = f.samples.push(r);

    // Everything else that moves.
    const seenNow = this.seenNow || (this.seenNow = new Set());
    seenNow.clear();
    const ropeB = this.ropeTmp;
    for (const b of sim.bags) {
      const v = this.bufs.bag;
      rigid(v, b.pos, b.quat);
      v[7] = b.wetness; v[8] = 1 - b.potency;
      v[9] = attachCode(b);
      b.sampleString(1, ropeB);
      v.set(ropeB.subarray(0, ROPE_POINTS * 3), 10);
      this.track(i, `bag:${b.id}`, 'bag', null, v, seenNow);
    }
    if (bk) {
      const v = this.bufs.bucket;
      rigid(v, bk.pos, bk.quat);
      v[7] = bk.fillH || 0; v[8] = bk.milkFrac ?? 1; v[9] = bk.brew || 0;
      v[10] = attachCode(bk);
      bk.sampleString(1, ropeB);
      v.set(ropeB.subarray(0, ROPE_POINTS * 3), 11);
      this.track(i, `bucket:${bk.id}`, 'bucket', null, v, seenNow);
    }
    if (h && h.hose) {
      const v = this.bufs.hose;
      const a = _a.set(...CFG.skycrane.hose.anchor).applyQuaternion(h.quat).add(h.pos);
      h.hose.sample(1, a, v);
      this.track(i, `hose:${f.heliId}`, 'hose', null, v.subarray(0, HOSE_POINTS * 3), seenNow);
    }
    for (const d of sim.debris) {
      const v = this.bufs.debris;
      const t = d.body.translation(), q = d.body.rotation();
      v[0] = t.x; v[1] = t.y; v[2] = t.z; v[3] = q.x; v[4] = q.y; v[5] = q.z; v[6] = q.w;
      this.track(i, `debris:${d.id}`, 'debris', { part: d.part.name, aircraft: this.wreckAircraft.get(d.wreckId) || f.aircraft, wreckId: d.wreckId }, v, seenNow);
    }
    const P = sim.props;
    if (P) {
      for (const it of P.items) this.trackBody(i, `prop:${it.def.id}`, it.body, seenNow);
      this.trackBody(i, 'prop:lamp', P.lamp.body, seenNow);
      this.trackBody(i, 'prop:mobile', P.mobile.body, seenNow);
      if (sim.extras) for (const r of sim.extras.recorded()) this.trackBody(i, `prop:${r.id}`, r.body, seenNow);
    }
    for (const e of f.entities.values()) if (e.died < 0 && !seenNow.has(e.id)) e.died = i;
    f.dirty = true;
  }

  trackBody(i, id, body, seenNow) {
    const v = this.bufs.prop;
    const t = body.translation(), q = body.rotation();
    v[0] = t.x; v[1] = t.y; v[2] = t.z; v[3] = q.x; v[4] = q.y; v[5] = q.z; v[6] = q.w;
    this.track(i, id, 'prop', null, v, seenNow);
  }

  // Write a key only when the thing moved; before a change after a still spell, re-write the held value
  // one sample earlier so interpolation never smears a jump across the still spell.
  track(i, id, kind, meta, vec, seenNow) {
    seenNow.add(id);
    const f = this.cur;
    let e = f.entities.get(id);
    const len = vec.length;
    if (!e || e.died >= 0) {
      e = { id, kind, meta: meta || {}, born: i, died: -1, keys: new Rows(1 + len), last: new Float32Array(len), lastKey: -1 };
      f.entities.set(id, e);
      this.writeKey(e, i, vec);
      return;
    }
    const eps = KINDS[kind].eps;
    const last = e.last;
    let moved = false;
    for (let k = 0; k < len; k++) if (Math.abs(vec[k] - last[k]) > eps) { moved = true; break; }
    if (!moved) return;
    if (e.lastKey < i - 1) this.writeKey(e, i - 1, last);
    this.writeKey(e, i, vec);
  }

  writeKey(e, i, vec) {
    const kb = this.keyBuf.subarray(0, 1 + vec.length);
    kb[0] = i;
    kb.set(vec, 1);
    e.keys.push(kb);
    if (e.last !== vec) e.last.set(vec);
    e.lastKey = i;
  }
}

// 0 free, -1 on its peg or hanger, hook index + 1 on the aircraft.
function attachCode(b) { return !b.attach ? 0 : b.attach.kind === 'heli' ? (b.attach.hook || 0) + 1 : -1; }
function rigid(v, p, q) { v[0] = p.x; v[1] = p.y; v[2] = p.z; v[3] = q.x; v[4] = q.y; v[5] = q.z; v[6] = q.w; }
