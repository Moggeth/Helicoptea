// Flight log format: what a recorded flight holds and how it goes to and from disk.
// See docs/FLIGHT-LOGS.md. A flight is a JSON header plus one little-endian Float32 binary:
//   samples:  nSamples rows of CHANNELS (fixed rate, RECORD_EVERY physics steps)
//   entities: for each moving thing, keyframes [sampleIndex, ...values] written only when it moved,
//             with a hold key before each change, so interpolating between keys is exact to EPS.

export const FORMAT = 'helicoptea-flight';
export const VERSION = 1;
export const RECORD_EVERY = 4;           // physics steps per sample: 240 Hz / 4 = 60 Hz
export const CHUNK = 4096;               // rows per storage chunk (no big copies as a flight grows)

// [name, unit, what]. Order is the binary column order; append only (readers look columns up by name).
export const CHANNELS = [
  ['t', 's', 'simulation time since the flight started (pauses excluded)'],
  ['wall', 's', 'time as flown: simulation time divided by the world speed'],
  ['worldSpeed', 'x', 'world clock rate (World weight setting)'],
  ['assist', '0/1', 'Flight Assist on'],
  ['src', 'enum', 'input device last used: 0 keyboard, 1 gamepad, 2 touch'],
  ['in.pitch', '-1..1', 'processed cyclic pitch command (+ forward), what the aircraft received'],
  ['in.roll', '-1..1', 'processed cyclic roll command (+ right)'],
  ['in.yaw', '-1..1', 'processed yaw command (+ right)'],
  ['in.coll', '-1..1', 'processed collective rate command (+ up)'],
  ['in.pour', '0/1', 'pour held'],
  ['in.doors', '0..1', 'skycrane belly door command'],
  ['in.pump', '0..1', 'skycrane pump command'],
  ['in.reel', '-1..1', 'skycrane hose reel (+ out)'],
  ['kb.pitch', '-1..1', 'keyboard pitch after key slew'],
  ['kb.roll', '-1..1', 'keyboard roll after key slew'],
  ['kb.yaw', '-1..1', 'keyboard yaw after key slew'],
  ['kb.coll', '-1..1', 'keyboard collective after key slew'],
  ['gp.pitch', '-1..1', 'gamepad pitch after dead zone, curve, sensitivity'],
  ['gp.roll', '-1..1', 'gamepad roll after dead zone, curve, sensitivity'],
  ['gp.yaw', '-1..1', 'gamepad yaw after dead zone, curve, sensitivity'],
  ['gp.coll', '-1..1', 'gamepad collective after dead zone, curve, sensitivity (and triggers)'],
  ['touch.pitch', '-1..1', 'touch right thumb, raw'],
  ['touch.roll', '-1..1', 'touch right thumb, raw'],
  ['touch.yaw', '-1..1', 'touch left thumb, raw'],
  ['touch.coll', '-1..1', 'touch left thumb, raw'],
  ['gp.ax0', '-1..1', 'active gamepad raw axis 0 (standard: left stick x)'],
  ['gp.ax1', '-1..1', 'raw axis 1 (left stick y, + down)'],
  ['gp.ax2', '-1..1', 'raw axis 2 (right stick x)'],
  ['gp.ax3', '-1..1', 'raw axis 3 (right stick y, + down)'],
  ['gp.lt', '0..1', 'raw left trigger'],
  ['gp.rt', '0..1', 'raw right trigger'],
  ['alive', '0/1', '1 while the aircraft exists (0 after the crash)'],
  ['px', 'm', 'position x (table top is y = 0)'], ['py', 'm', 'position y'], ['pz', 'm', 'position z'],
  ['qx', '', 'orientation quaternion'], ['qy', '', ''], ['qz', '', ''], ['qw', '', ''],
  ['vx', 'm/s', 'velocity x'], ['vy', 'm/s', 'velocity y (+ up)'], ['vz', 'm/s', 'velocity z'],
  ['rate.pitch', 'deg/s', 'body pitch rate (+ nose up)'],
  ['rate.yaw', 'deg/s', 'body yaw rate (+ nose right)'],
  ['rate.roll', 'deg/s', 'body roll rate (+ right side down)'],
  ['pitch', 'deg', 'attitude pitch (+ nose up)'],
  ['roll', 'deg', 'attitude roll (+ right side down)'],
  ['heading', 'deg', 'heading, 0 = initial heading on the pad, + to the right'],
  ['speed', 'm/s', '3D speed'],
  ['hspeed', 'm/s', 'horizontal speed'],
  ['vspeed', 'm/s', 'vertical speed (+ up)'],
  ['agl', 'm', 'skid / gear clearance above the surface below'],
  ['hubAgl', 'm', 'rotor hub height above the surface below (ground-effect input)'],
  ['grounded', '0/1', 'resting on something'],
  ['collective', '0..1', 'collective setting'],
  ['thrust', 'N', 'total rotor thrust'],
  ['thrustFrac', '0..1', 'thrust as a fraction of maximum'],
  ['tw', 'x', 'thrust / (aircraft + carried load) weight'],
  ['rotorSpeed', '0..1', 'rotor speed relative to governed'],
  ['cmdPitch', 'deg', 'assist commanded pitch attitude'],
  ['cmdRoll', 'deg', 'assist commanded roll attitude'],
  ['mix.pitch', '', 'Chinook / skycrane: pitch command sent to the rotors after the assist'],
  ['mix.roll', '', 'roll command sent to the rotors'],
  ['mix.yaw', '', 'yaw command sent to the rotors'],
  ['rotorPhase', 'rad', 'main (Chinook: forward) rotor phase'],
  ['rotorPhase2', 'rad', 'Chinook aft rotor phase'],
  ['tailPhase', 'rad', 'tail rotor phase'],
  ['tilt0', 'rad', 'disc tilt (Chinook forward rotor; skycrane longitudinal)'],
  ['tilt1', 'rad', 'disc tilt (Chinook aft rotor; skycrane lateral)'],
  ['load', 'N', 'rope tension on the hooks'],
  ['loadMass', 'kg', 'mass on the hooks (bags, bucket and its milk)'],
  ['nCarried', '', 'number of things on the hooks'],
  ['wetness', '0..1', 'wettest carried bag'],
  ['immersion', '0..1', 'deepest immersion of anything carried'],
  ['bucketFill', '0..1', 'milk bucket fill'],
  ['tankFill', '0..1', 'skycrane tank fill'],
  ['tankDoors', '0..1', 'skycrane belly door opening'],
  ['pumping', '0/1', 'skycrane pump moving liquid'],
  ['hoseLength', 'm', 'skycrane snorkel length'],
  ['intakeDepth', 'm', 'skycrane intake depth under a surface (0 when out)'],
  ['impactAcc', 'm/s', 'crash detector: accumulated unexplained velocity change'],
  ['rotorContact', 's', 'crash detector: rotor contact budget used'],
  ['wear', '0..1', 'blade damage on the most worn rotor (rotor strikes)'],
  ['shed', 'bits', 'rotors lost to strikes: 1 main (Chinook forward), 2 Chinook aft, 4 tail rotor'],
  ['spin', 'deg/s', 'yaw rate about the rotor axis with the tail rotor gone'],
];
export const NCH = CHANNELS.length;
export const CH = Object.fromEntries(CHANNELS.map(([n], i) => [n, i]));

// Moving things, keyframed. pos (3) + quat (4) first for everything rigid.
export const ROPE_POINTS = 15;   // CFG.cargo.ropeSegments + 1
export const HOSE_POINTS = 10;   // anchor + CFG.skycrane.hose.segments
export const KINDS = {
  bag: { fields: ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'wetness', 'stain', 'attach', ...pts('rope', ROPE_POINTS)], eps: 1.5e-4 },
  bucket: { fields: ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw', 'fillH', 'milk', 'brew', 'attach', ...pts('rope', ROPE_POINTS)], eps: 1.5e-4 },
  hose: { fields: pts('pt', HOSE_POINTS), eps: 1.5e-4 },
  debris: { fields: ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw'], eps: 1e-4 },
  prop: { fields: ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw'], eps: 1e-4 },
};
function pts(name, n) { const o = []; for (let i = 0; i < n; i++) o.push(`${name}${i}.x`, `${name}${i}.y`, `${name}${i}.z`); return o; }

// Events kept in the log, and which of their fields (numbers rounded, positions as [x, y, z]).
export const EVENT_FIELDS = {
  crash: ['reason', 'kind', 'impact', 'material', 'cup', 'spin', 'scale', 'pos', 'vel', 'up'], bump: ['dv', 'pos'], touchdown: ['speed', 'pos'], scrape: ['speed', 'pos', 'hose'],
  snatch: ['speed', 'mass', 'pos', 'hose'], attach: ['hook', 'fromPeg'], release: [], splash: ['speed', 'pos'], extract: ['speed'],
  rotorTick: ['material', 'harmless', 'wear', 'pos'], rotorShatter: ['rotor', 'material', 'dir', 'scale', 'pos', 'point', 'up'],
  tailStrike: ['material', 'pos', 'point'], teaStrike: ['cupIndex', 'pos'], restart: [], reset: [], aircraft: ['id'], bucketSplash: ['speed'], autoFill: ['phase'], radio: ['on'],
};

// ---------------------------------------------------------------- chunked row storage
export class Rows {
  constructor(width) { this.width = width; this.n = 0; this.chunks = []; }
  push(src) {
    const c = this.n % CHUNK;
    if (c === 0) this.chunks.push(new Float32Array(CHUNK * this.width));
    this.chunks[this.chunks.length - 1].set(src, c * this.width);
    return this.n++;
  }
  // Row view (no copy) and a single value.
  row(i) { const c = this.chunks[(i / CHUNK) | 0], o = (i % CHUNK) * this.width; return c.subarray(o, o + this.width); }
  get(i, k) { return this.chunks[(i / CHUNK) | 0][(i % CHUNK) * this.width + k]; }
  get bytes() { return this.chunks.length * CHUNK * this.width * 4; }
  toArray() {
    const out = new Float32Array(this.n * this.width);
    for (let i = 0, o = 0; i < this.chunks.length; i++) {
      const rows = Math.min(CHUNK, this.n - i * CHUNK);
      out.set(this.chunks[i].subarray(0, rows * this.width), o);
      o += rows * this.width;
    }
    return out;
  }
  static from(width, data) {
    const r = new Rows(width);
    const n = data.length / width;
    for (let i = 0; i < n; i++) r.push(data.subarray(i * width, (i + 1) * width));
    return r;
  }
}

// ---------------------------------------------------------------- serialise
// Returns { json (object), bin (ArrayBuffer) }. Offsets in json are in floats from the start of bin.
export function encodeFlight(f) {
  const parts = [f.samples.toArray()];
  let off = parts[0].length;
  const entities = [];
  for (const e of f.entities.values()) {
    const keys = e.keys.toArray();
    entities.push({ id: e.id, kind: e.kind, meta: e.meta, width: e.keys.width, born: e.born, died: e.died, nKeys: e.keys.n, offset: off });
    parts.push(keys);
    off += keys.length;
  }
  const bin = new Float32Array(off);
  let o = 0;
  for (const p of parts) { bin.set(p, o); o += p.length; }
  const json = {
    format: FORMAT, version: VERSION, id: f.id, startedAt: f.startedAt, savedAt: new Date().toISOString(),
    aircraft: f.aircraft, def: f.def, recordHz: f.recordHz, physicsHz: f.physicsHz, littleEndianFloat32: true,
    nSamples: f.samples.n, duration: f.duration(), wallDuration: f.wallDuration(),
    channels: CHANNELS.map(([n]) => n), channelInfo: Object.fromEntries(CHANNELS.map(([n, u, d]) => [n, u ? `${u}: ${d}` : d])),
    kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.fields])),
    entities, events: f.events, notes: f.notes, summary: f.summary(), settings: f.settings, ended: f.ended,
  };
  return { json, bin: bin.buffer };
}

export function decodeFlight(json, buf) {
  if (json.format !== FORMAT) throw new Error('not a Helicoptea flight');
  const all = new Float32Array(buf);
  const w = json.channels.length;
  const f = new Flight({ id: json.id, aircraft: json.aircraft, def: json.def, startedAt: json.startedAt, recordHz: json.recordHz, physicsHz: json.physicsHz, settings: json.settings || {} });
  // Columns are looked up by name, so older or newer channel lists still load.
  const map = CHANNELS.map(([n]) => json.channels.indexOf(n));
  const row = new Float32Array(NCH);
  for (let i = 0; i < json.nSamples; i++) {
    for (let k = 0; k < NCH; k++) row[k] = map[k] >= 0 ? all[i * w + map[k]] : 0;
    f.samples.push(row);
  }
  for (const e of json.entities) {
    const ent = { id: e.id, kind: e.kind, meta: e.meta || {}, born: e.born, died: e.died, keys: Rows.from(e.width, all.subarray(e.offset, e.offset + e.nKeys * e.width)), last: null, lastKey: -1 };
    f.entities.set(e.id, ent);
  }
  f.events = json.events || [];
  f.notes = json.notes || [];
  f.ended = json.ended ?? true;
  f.fromDisk = true;
  f.saved = true;
  return f;
}

// ---------------------------------------------------------------- a flight
let seq = Math.floor(Math.random() * 900);  // two tabs starting flights in the same second get different ids
const pad2 = (n) => String(n).padStart(2, '0');
export function flightId(aircraft, d = new Date()) {
  seq = (seq + 1) % 1000;
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${aircraft}-${String(seq).padStart(3, '0')}`;
}

export class Flight {
  constructor(o) {
    this.id = o.id || flightId(o.aircraft);
    this.aircraft = o.aircraft;
    this.def = o.def;
    this.startedAt = o.startedAt || new Date().toISOString();
    this.recordHz = o.recordHz;
    this.physicsHz = o.physicsHz;
    this.settings = o.settings || {};
    this.samples = new Rows(NCH);
    this.entities = new Map();
    this.events = [];
    this.notes = [];
    this.ended = false;
    this.saved = false;
    this.dirty = true;
  }
  get n() { return this.samples.n; }
  duration() { return this.n ? this.samples.get(this.n - 1, CH.t) : 0; }
  wallDuration() { return this.n ? this.samples.get(this.n - 1, CH.wall) : 0; }
  get bytes() { let b = this.samples.bytes; for (const e of this.entities.values()) b += e.keys.bytes; return b; }
  // Sample index (fractional) at an as-flown time, and back.
  indexAtWall(w) {
    const n = this.n;
    if (n < 2) return 0;
    let lo = 0, hi = n - 1;
    if (w <= this.samples.get(0, CH.wall)) return 0;
    if (w >= this.samples.get(hi, CH.wall)) return hi;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.samples.get(m, CH.wall) <= w) lo = m; else hi = m; }
    const a = this.samples.get(lo, CH.wall), b = this.samples.get(hi, CH.wall);
    return lo + (b > a ? (w - a) / (b - a) : 0);
  }
  wallAt(s) {
    const n = this.n;
    if (!n) return 0;
    const i = Math.max(0, Math.min(n - 1, Math.floor(s))), j = Math.min(n - 1, i + 1), f = s - i;
    return this.samples.get(i, CH.wall) * (1 - f) + this.samples.get(j, CH.wall) * f;
  }
  crash() { return this.events.find((e) => e.type === 'crash') || null; }
  summary() {
    const S = this.samples, n = this.n;
    let maxSpeed = 0, maxAgl = 0, maxTilt = 0, maxLoad = 0, assistOn = 0;
    const used = new Set();
    for (let i = 0; i < n; i++) {
      if (!S.get(i, CH.alive)) continue;
      maxSpeed = Math.max(maxSpeed, S.get(i, CH.speed));
      maxAgl = Math.max(maxAgl, S.get(i, CH.agl));
      maxTilt = Math.max(maxTilt, Math.abs(S.get(i, CH.pitch)), Math.abs(S.get(i, CH.roll)));
      maxLoad = Math.max(maxLoad, S.get(i, CH.load));
      assistOn += S.get(i, CH.assist);
      used.add(['keyboard', 'gamepad', 'touch'][S.get(i, CH.src)] || 'keyboard');
    }
    const c = this.crash();
    const count = (t) => this.events.filter((e) => e.type === t).length;
    return {
      duration: +this.duration().toFixed(3), wallDuration: +this.wallDuration().toFixed(3),
      maxSpeed: +maxSpeed.toFixed(3), maxAgl: +maxAgl.toFixed(3), maxTiltDeg: +maxTilt.toFixed(1), maxLoadN: +maxLoad.toFixed(4),
      assistShare: n ? +(assistOn / n).toFixed(2) : 0, devices: [...used],
      crash: c ? { reason: c.reason, impact: c.impact, t: c.t, wall: c.wall } : null,
      touchdowns: count('touchdown'), bumps: count('bump'), snatches: count('snatch'), scrapes: count('scrape'), attaches: count('attach'),
      notes: this.notes.length,
    };
  }
}

// ---------------------------------------------------------------- sampling helpers
// Index of the last key at or before sample s (keys are sorted by their sample index, column 0).
export function keyAt(keys, s) {
  let lo = 0, hi = keys.n - 1;
  if (hi < 0 || keys.get(0, 0) > s) return -1;
  if (keys.get(hi, 0) <= s) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys.get(m, 0) <= s) lo = m; else hi = m; }
  return lo;
}

// Interpolated entity values at fractional sample s into out (width - 1 values). False if not alive.
export function sampleEntity(e, s, out) {
  if (s < e.born || (e.died >= 0 && s >= e.died)) return false;
  const k = keyAt(e.keys, s);
  if (k < 0) return false;
  const a = e.keys.row(k);
  const w = e.keys.width;
  if (k + 1 >= e.keys.n) { for (let i = 1; i < w; i++) out[i - 1] = a[i]; return true; }
  const b = e.keys.row(k + 1);
  const span = b[0] - a[0];
  const f = span > 0 ? Math.min(1, Math.max(0, (s - a[0]) / span)) : 0;
  for (let i = 1; i < w; i++) out[i - 1] = a[i] + (b[i] - a[i]) * f;
  // Quaternions (fields 3..6 of rigid kinds): keep the short way round, then normalise.
  if (e.kind !== 'hose') {
    let dot = 0;
    for (let i = 4; i < 8; i++) dot += a[i] * b[i];
    if (dot < 0) for (let i = 4; i < 8; i++) out[i - 1] = a[i] - (b[i] + a[i]) * f;
    const l = Math.hypot(out[3], out[4], out[5], out[6]) || 1;
    for (let i = 3; i < 7; i++) out[i] /= l;
  }
  return true;
}
