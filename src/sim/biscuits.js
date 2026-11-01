import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';
import { CFG } from '../config.js';
import { TeaBag } from './teabag.js';
import { STATION, surfaceY } from './layout.js';

// Biscuits: the Chinook's cargo. Each one hangs from a small clip on a line, waits on the biscuit stand by
// the pad, and goes on any of the Chinook's three hooks. Holding pour (the bucket's valve on the other
// aircraft) pays the line out on a winch; letting go reels it back in, so a dunk is a hold and a release.
//
// A biscuit is a stack of bands across its hanging height (along its length for the chocolate finger), each a
// convex collider of its own. Every band soaks while it is under the tea and wicks to its neighbours; a wet
// band loses strength as (1 - soak)^3, and a band that can no longer carry what hangs below it breaks off
// with everything further from the clip. That is how a real dunk goes wrong: the soaked part drops off at
// the wet line. Kinds differ in how fast they take up tea, how strong they are and how much they shed.
//
// The chocolate cream finger's ends snap off when knocked against something hard (a cup's rim, the table). With
// both ends gone and one end in the tea and the other out, its core draws tea up like a straw; it then
// goes soft from inside within a few seconds. Hand it to a neighbour before it does.
//
// Everything here is DOM-free. src/render/biscuitView.js draws the stand's cards, the biscuits, their
// lines and the broken pieces.

const g = CFG.physics.gravity;
const WATER = 1000;

// Kinds: shape (round: r; rect and finger: w x h), thickness t, dry mass, soak time constant (s), water taken
// up per unit dry mass when soaked, dry strength (multiples of its own weight a band holds), wick time (s),
// how much it sheds as it goes, colours (top, edge). The chocolate finger also snaps (dv, m/s) and draws tea (s to fill).
// The brand on each kind is an original stand-in for a sponsor slot (docs/SPONSORS.md).
export const KINDS = [
  { id: 'digestive', name: 'Wheatmeal digestive', brand: "Hartwell's", shape: 'round', r: 0.0335, t: 0.0072, mass: 0.0148,
    soak: 3.4, absorb: 0.9, strength: 9, wick: 5, shed: 0.6, color: 0xc28a52, edge: 0x9f6a38, bands: 6 },
  { id: 'richtea', name: 'Rich tea', brand: 'Corner Shop', shape: 'round', r: 0.033, t: 0.0048, mass: 0.0083,
    soak: 2, absorb: 1.1, strength: 6, wick: 3, shed: 0.3, color: 0xd9aa68, edge: 0xbb8a4a, bands: 6 },
  { id: 'ginger', name: 'Ginger nut', brand: 'Brackley', shape: 'round', r: 0.025, t: 0.0085, mass: 0.0102,
    soak: 9, absorb: 0.5, strength: 22, wick: 12, shed: 0.15, color: 0x9a5a2a, edge: 0x7a4420, bands: 6 },
  { id: 'oat', name: 'Oat crunch', brand: 'Fellside', shape: 'round', r: 0.0325, t: 0.0092, mass: 0.0152,
    soak: 5, absorb: 0.8, strength: 11, wick: 6, shed: 1, color: 0xc49550, edge: 0xa57a3a, bands: 6 },
  { id: 'shortbread', name: 'Shortbread finger', brand: 'Highfold', shape: 'rect', w: 0.024, h: 0.072, t: 0.011, mass: 0.0172,
    soak: 3.6, absorb: 0.7, strength: 5, wick: 4, shed: 1.2, color: 0xe6c487, edge: 0xd2a866, bands: 6 },
  { id: 'chocfinger', name: 'Chocolate cream finger', brand: 'Wattle & Co.', shape: 'finger', w: 0.096, h: 0.028, t: 0.014, mass: 0.018,
    soak: 5, absorb: 0.8, strength: 12, wick: 4, shed: 0.4, color: 0x4a2a1a, edge: 0x3a2014, bands: 8,
    snap: 0.22, straw: 0.9, strawSoak: 6.5, core: 0.005, clipX: 0.0115 },
];
export const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));

// The biscuit stand: a tea stand of six pegs at the far end of the table (out of the pad's way), one kind
// on each.
export const BISCUIT_STAND = {
  ...STATION, x: 0.68, z: -0.43, y: 0, plaque: 'Biscuits',
  baseHalf: [0.163, 0.0075, 0.045], postX: 0.148,
  pegXs: [-0.125, -0.075, -0.025, 0.025, 0.075, 0.125],
  kinds: ['digestive', 'richtea', 'chocfinger', 'ginger', 'oat', 'shortbread'],
};

export const LINE = 0.12;         // m, clip to hook with the winch in
const LINE_OUT = 0.1;             // m of extra line with the winch all the way out
const WINCH = 0.09;               // m/s
const CLIP = 0.004;               // m from the biscuit's edge up to where the line ties on
const REFILL = 3;                 // s a peg stays empty
const MAX_BISCUITS = 14;
const MAX_CHUNKS = 16;

// ---------------------------------------------------------------- outlines and bands (shared per kind)
function roundedRect(hw, hh, rc, n = 6) {
  const out = [];
  const corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; out.push([cx + Math.cos(a) * rc, cy + Math.sin(a) * rc]); } };
  corner(hw - rc, hh - rc, 0); corner(-hw + rc, hh - rc, Math.PI / 2); corner(-hw + rc, -hh + rc, Math.PI); corner(hw - rc, -hh + rc, Math.PI * 1.5);
  return out;
}
export function outlineOf(k) {
  if (k.shape === 'round') return Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [Math.cos(a) * k.r, Math.sin(a) * k.r]; });
  return roundedRect(k.w / 2, k.h / 2, Math.min(k.w, k.h) * (k.shape === 'finger' ? 0.12 : 0.18));
}
function clipHalf(poly, ax, c, sgn) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = sgn * (a[ax] - c), db = sgn * (b[ax] - c);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// The part of a polygon between lo and hi along axis ax (0: x, 1: y).
export function clipSlab(poly, ax, lo, hi) { return clipHalf(clipHalf(poly, ax, lo, 1), ax, hi, -1); }
function area(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
function centroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
  return a ? [cx / (3 * a), cy / (3 * a)] : [0, 0];
}

const GEOM = new Map();
// Per kind: band axis, band edges, each band's polygon, area share, centroid and half width across.
export function geomOf(k) {
  let G = GEOM.get(k.id);
  if (G) return G;
  const outline = outlineOf(k);
  const ax = k.shape === 'finger' ? 0 : 1;
  const half = k.shape === 'round' ? k.r : (ax === 0 ? k.w / 2 : k.h / 2);
  const cross = k.shape === 'round' ? k.r : (ax === 0 ? k.h / 2 : k.w / 2);
  const N = k.bands, edges = [];
  for (let i = 0; i <= N; i++) edges.push(-half + (2 * half * i) / N);
  const total = area(outline);
  const bands = [];
  for (let i = 0; i < N; i++) {
    const poly = clipSlab(outline, ax, edges[i], edges[i + 1]);
    const u = (edges[i] + edges[i + 1]) / 2;
    const w = k.shape === 'round' ? Math.sqrt(Math.max(0, k.r * k.r - u * u)) || k.r * 0.2 : cross;
    bands.push({ poly, frac: area(poly) / total, c: centroid(poly), w: Math.max(w, cross * 0.25) });
  }
  // The clip: on the top edge (on the finger, a little off centre along it, so it hangs tilted).
  const top = k.shape === 'round' ? k.r : k.h / 2;
  const anchor = [k.clipX || 0, top + CLIP];
  const clipU = ax === 0 ? anchor[0] : anchor[1] - CLIP;
  let clip = N - 1;
  for (let i = 0; i < N; i++) if (clipU >= edges[i] && clipU <= edges[i + 1]) clip = i;
  G = { outline, ax, edges, bands, N, anchor, clip, half, cross, volume: total * k.t };
  GEOM.set(k.id, G);
  return G;
}

// ---------------------------------------------------------------- one biscuit
let pending = null;   // the kind being built (build() runs inside TeaBag's constructor, before ours)
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3();
const _r = new THREE.Vector3(), _vn = new THREE.Vector3(), _vt = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Biscuit extends TeaBag {
  constructor(sim, pos, quat, kind) {
    pending = kind;
    super(sim, pos, quat);
    pending = null;
    this.isBiscuit = true;
    this.immersion = 0;
    this.fill = 0;            // the chocolate finger's core, 0..1 full of tea
    this.slam = false;        // it has drawn tea through
    this.held = null;         // the person eating it
    this.eaten = 0;
    this.line = LINE;
    this.version = 0;         // bumps when bands break (the view rebuilds the shape)
    this.knocks = 0;
    this.waterApplied = 0;
  }

  build(world, pos, quat) {
    const k = this.kind = pending;
    const G = this.G = geomOf(k);
    this.nb = G.N;         // bands (this.N is the line's segment count, from TeaBag)
    this.lo = 0; this.hi = G.N - 1;
    this.s = new Float32Array(G.N);
    this.imm = new Float32Array(G.N);
    this.mDry = G.bands.map((b) => b.frac * k.mass);
    this.anchorLocal = new THREE.Vector3(G.anchor[0], G.anchor[1], 0);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCanSleep(true)
      .setCcdEnabled(true)
      .setLinearDamping(0.02)
      .setAngularDamping(0.3);
    this.body = world.createRigidBody(desc);
    this.colliders = [];
    for (let i = 0; i < G.N; i++) {
      const poly = G.bands[i].poly, pts = new Float32Array(poly.length * 6);
      poly.forEach(([x, y], j) => { pts.set([x, y, -k.t / 2, x, y, k.t / 2], j * 6); });
      const cd = RAPIER.ColliderDesc.convexHull(pts)
        .setMass(this.mDry[i]).setFriction(0.7).setRestitution(0.05)
        .setCollisionGroups(GROUPS.bag)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(0.004);
      const c = world.createCollider(cd, this.body);
      this.colliders.push(c);
      this.sim.register(c, { kind: 'bag', bag: this, band: i, material: 'biscuit', onImpact: (imp, other) => this.knock(i, imp, other) });
    }
    this.collider = this.colliders[0];
  }

  get anchorY() { return this.anchorLocal.y; }
  get ropeLength() { return this.line ?? LINE; }
  stringBox() { return null; }

  alive(i) { return i >= this.lo && i <= this.hi; }
  // Share of the face already broken off.
  dryGone() { let f = 0; for (let i = this.lo; i <= this.hi; i++) f += this.G.bands[i].frac; return 1 - f; }
  get dryMass() { let m = 0; for (let i = this.lo; i <= this.hi; i++) m += this.mDry[i]; return m; }
  get water() { let m = 0; for (let i = this.lo; i <= this.hi; i++) m += this.mDry[i] * this.kind.absorb * this.s[i]; return m + this.fill * (this.kind.core || 0) * WATER * 1e-3; }
  get mass() { return this.dryMass + this.water; }
  // For the HUD, instruments and replays that read a bag's wetness.
  get wetness() { let s = 0, n = 0; for (let i = this.lo; i <= this.hi; i++) { s += this.s[i]; n++; } return n ? s / n : 0; }
  set wetness(v) { /* derived from the bands */ }
  get potency() { return 1; }
  set potency(v) { /* biscuits don't brew */ }

  updateCached() {
    if (!this.body) return;
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(v.x, v.y, v.z);
    this.anchorWorld.copy(this.anchorLocal).applyQuaternion(this.quat).add(this.pos);
  }

  // Local point of band i's sample j (two across the band, at its centre line).
  sample(i, j, out) {
    const G = this.G, b = G.bands[i], u = (G.edges[i] + G.edges[i + 1]) / 2, c = (j ? 0.6 : -0.6) * b.w;
    return G.ax === 0 ? out.set(u, c, 0) : out.set(c, u, 0);
  }

  applyForces(dt) {
    if (!this.body) return;
    if (this.resting) {
      if (this.body.isSleeping() && ((this.sim.stepCount + this.id) % 8 || !this.breezy())) return;
      this.resting = false; this.restT = 0;
    }
    this.updateCached();
    const body = this.body, k = this.kind, G = this.G;
    body.resetForces(true);
    body.resetTorques(true);
    const av = body.angvel();
    _w.set(av.x, av.y, av.z);
    const mass = this.mass;

    let cup = null;
    const reach = G.half + 0.05;
    for (const c of this.sim.cups) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      if (dx * dx + dz * dz < (c.rIn + reach) ** 2 && this.pos.y < c.waterY + reach && this.pos.y > c.floorY - reach) { cup = c; break; }
    }
    _n.set(0, 0, 1).applyQuaternion(this.quat);
    let sub = 0, nAlive = 0;
    this.imm.fill(0);
    for (let i = this.lo; i <= this.hi; i++) nAlive++;
    if (cup) {
      for (let i = this.lo; i <= this.hi; i++) {
        const vol = G.bands[i].frac * G.volume * (1 - 0.6 * this.s[i]) / 2;
        const mPt = (this.mDry[i] * (1 + k.absorb * this.s[i])) / 2;
        const areaPt = G.bands[i].frac * G.volume / k.t / 2;
        for (let j = 0; j < 2; j++) {
          this.sample(i, j, _p).applyQuaternion(this.quat).add(this.pos);
          const dx = _p.x - cup.x, dz = _p.z - cup.z;
          if (dx * dx + dz * dz > (cup.rIn - 0.001) ** 2 || _p.y < cup.floorY - 0.004) continue;
          const d = THREE.MathUtils.clamp((cup.waterY + cup.surfaceOffset(_p.x, _p.z) - _p.y) / 0.005 + 0.5, 0, 1);
          if (d <= 0) continue;
          this.imm[i] += d / 2;
          _f.set(0, WATER * g * vol * d, 0);
          _r.copy(_p).sub(this.pos);
          _v.crossVectors(_w, _r).add(this.vel);
          _vn.copy(_n).multiplyScalar(_v.dot(_n));
          _vt.copy(_v).sub(_vn);
          const kn = (0.02 + 600 * areaPt * _vn.length()) * d, kt = (0.02 + 60 * areaPt * _vt.length()) * d;
          _f.addScaledVector(_vn, -(mPt / dt) * (1 - Math.exp(-kn * dt / mPt)));
          _f.addScaledVector(_vt, -(mPt / dt) * (1 - Math.exp(-kt * dt / mPt)));
          body.addForceAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: _p.x, y: _p.y, z: _p.z }, true);
        }
        sub += this.imm[i] / nAlive;
      }
    }
    this.immersion = sub;
    this.cup = sub > 0.01 ? cup : null;
    this.twistTorque(dt, mass);
    // Air: a flat plate against still air or the rotor wash (at its middle): broadside it is caught by the
    // air, edge-on it slices through, so hanging under the rotors the wash mostly runs down its faces.
    const sp0 = this.vel.length();
    const windy = this.breezy();
    if (sub < 0.95) {
      _v.copy(this.vel);
      if (windy) { this.sim.air.sample(this.pos.x, this.pos.y, this.pos.z, _f); _v.addScaledVector(_f, -CFG.air.bagDrag); }
      if (windy || sp0 > 1e-4) {
        const A = G.volume / k.t * (1 - this.dryGone());
        _vn.copy(_n).multiplyScalar(_v.dot(_n));
        _vt.copy(_v).sub(_vn);
        const kn = (CFG.cargo.airDrag * 0.3 + 0.72 * A * _vn.length()) * (1 - sub);
        const kt = (CFG.cargo.airDrag * 0.3 + 0.06 * A * _vt.length()) * (1 - sub);
        _f.copy(_vn).multiplyScalar(-(mass / dt) * (1 - Math.exp(-kn * dt / mass)));
        _f.addScaledVector(_vt, -(mass / dt) * (1 - Math.exp(-kt * dt / mass)));
        body.addForce({ x: _f.x, y: _f.y, z: _f.z }, true);
      }
    }
    this.soak(dt);
    this.applyWater();
    this.rest(dt, sub, windy);
  }

  // Bands take up tea where they are under, wick along to their neighbours, and the chocolate finger's open core
  // draws tea through when one end is in and the other out.
  soak(dt) {
    const k = this.kind, s = this.s;
    for (let i = this.lo; i <= this.hi; i++) if (this.imm[i] > 0.02) s[i] += this.imm[i] * (1 - s[i]) * dt / k.soak;
    const kw = dt / k.wick;
    for (let i = this.lo; i < this.hi; i++) {
      const d = (s[i + 1] - s[i]) * kw * 0.5;
      if (d > 0) { s[i] += d; s[i + 1] -= d * 0.6; } else { s[i + 1] -= d; s[i] += d * 0.6; }
    }
    if (k.straw) {
      const open = this.lo > 0 && this.hi < this.nb - 1;
      const a = this.imm[this.lo], b = this.imm[this.hi];
      // One end in the tea and the other's opening still in the air (a dry chocolate finger floats, so the top end
      // often rests half in the surface; it draws as long as part of that end is out).
      if (open && ((a > 0.4 && b < 0.5) || (b > 0.4 && a < 0.5))) this.fill = Math.min(1, this.fill + dt / k.straw);
      if (this.fill > 0) {
        for (let i = this.lo; i <= this.hi; i++) s[i] = Math.min(1, s[i] + this.fill * (1 - s[i] * 0.5) * dt / k.strawSoak);
        if (this.fill > 0.6 && !this.slam) { this.slam = true; this.sim.emit('biscuitSlam', { biscuit: this, pos: this.pos.clone() }); }
      }
    }
    for (let i = this.lo; i <= this.hi; i++) s[i] = Math.min(1, Math.max(0, s[i]));
  }

  // The tea taken up is extra mass where the wet bands are.
  applyWater() {
    const w = this.water;
    if (Math.abs(w - this.waterApplied) < 0.0001) return;
    this.waterApplied = w;
    let cx = 0, cy = 0, m = 0;
    for (let i = this.lo; i <= this.hi; i++) { const mi = this.mDry[i] * this.kind.absorb * this.s[i]; cx += this.G.bands[i].c[0] * mi; cy += this.G.bands[i].c[1] * mi; m += mi; }
    if (m > 1e-9) { cx /= m; cy /= m; }
    const I = Math.max(1e-10, w * this.G.half * this.G.half * 0.3);
    this.body.setAdditionalMassProperties(w, { x: cx, y: cy, z: 0 }, { x: I, y: I, z: I * 2 }, { x: 0, y: 0, z: 0, w: 1 }, true);
  }

  // Moving air that matters: on its peg, a biscuit ignores the faint edge of the wash of the Chinook
  // idling on the pad (it would never settle and go to sleep otherwise).
  breezy() {
    const air = this.sim.air;
    if (!air.near(this.pos)) return false;
    if (!this.attach || this.attach.kind !== 'peg') return true;
    air.sample(this.pos.x, this.pos.y, this.pos.z, _f);
    return _f.lengthSq() > 0.35 * 0.35;
  }

  rest(dt, sub, windy) {
    const av = this.body.angvel();
    const still = (!this.attach || this.attach.kind === 'peg') && sub === 0 && !windy && this.vel.lengthSq() < 1e-8 && av.x * av.x + av.y * av.y + av.z * av.z < 1e-6;
    this.restT = still ? (this.restT || 0) + dt : 0;
    if (this.restT < 0.5) return;
    this.body.resetForces(false); this.body.resetTorques(false);
    this.body.sleep();
    this.resting = true;
  }

  // Strength check: a band breaks when it can no longer carry itself and everything further from the clip
  // (its weight and how hard the biscuit is being shaken). Free biscuits just fall apart once sodden.
  checkBreaks(accel) {
    const k = this.kind, G = this.G, S = k.strength * k.mass * g;
    const pull = g + Math.min(accel, 40);
    if (!this.attach) {
      for (let i = this.lo; i <= this.hi; i++) if (this.s[i] > 0.92) { this.breakOff(i, i); return true; }
      return false;
    }
    // From the clip outwards on each side: the first band that fails takes the rest with it.
    let load = 0;
    for (let i = this.lo; i < G.clip; i++) {
      load = 0;
      for (let j = this.lo; j <= i; j++) load += this.mDry[j] * (1 + k.absorb * this.s[j]) * pull;
      if (S * (1 - this.s[i]) ** 3 < load) { this.breakOff(this.lo, i); return true; }
    }
    for (let i = this.hi; i > G.clip; i--) {
      load = 0;
      for (let j = i; j <= this.hi; j++) load += this.mDry[j] * (1 + k.absorb * this.s[j]) * pull;
      if (S * (1 - this.s[i]) ** 3 < load) { this.breakOff(i, this.hi); return true; }
    }
    // The clip pulls out of a sodden middle: the whole biscuit drops.
    if (this.s[G.clip] > 0.82) { this.sim.detachBag(this, true); this.sim.emit('biscuitDrop', { biscuit: this, pos: this.pos.clone() }); return true; }
    return false;
  }

  // Bands a..b come away as a broken piece.
  breakOff(a, b, why = 'soak') {
    const sys = this.sim.biscuits;
    let soak = 0, n = 0;
    for (let i = a; i <= b; i++) { soak += this.s[i]; n++; }
    // The piece's centre, from its bands' centroids weighted by area.
    let cx = 0, cy = 0, fr = 0;
    for (let i = a; i <= b; i++) { const B = this.G.bands[i]; cx += B.c[0] * B.frac; cy += B.c[1] * B.frac; fr += B.frac; }
    _p.set(cx / fr, cy / fr, 0);
    const mass = (() => { let m = 0; for (let i = a; i <= b; i++) m += this.mDry[i] * (1 + this.kind.absorb * this.s[i]); return m; })();
    const at = _p.clone().applyQuaternion(this.quat).add(this.pos);
    const vel = _v.crossVectors(_w.set(this.body.angvel().x, this.body.angvel().y, this.body.angvel().z), _p.clone().applyQuaternion(this.quat)).add(this.vel).clone();
    for (let i = a; i <= b; i++) {
      const c = this.colliders[i];
      if (c) { this.sim.unregister(c); this.sim.world.removeCollider(c, true); this.colliders[i] = null; }
    }
    if (a <= this.lo) this.lo = b + 1;
    if (b >= this.hi) this.hi = a - 1;
    this.version++;
    if (this.hi >= this.lo) { this.body.recomputeMassPropertiesFromColliders(); this.waterApplied = -1; this.applyWater(); this.body.wakeUp(); }
    sys.addChunk(this, a, b, at, this.quat, vel, soak / n, mass, why);
  }

  // A knock on band i. The chocolate finger's ends snap clean off when dry and hit hard enough.
  knock(i, imp, other) {
    if (!this.kind.snap || !this.body || (i !== 0 && i !== this.nb - 1) || !this.alive(i)) return;
    if (this.s[i] > 0.4 || (other && other.kind === 'bag')) return;
    const dv = imp / Math.max(this.mass, 1e-4);
    if (dv < this.kind.snap) return;
    this.sim.biscuits.queueSnap(this, i);
  }

  afterStep(dt) {
    if (!this.body) return;
    const v0x = this.vel.x, v0y = this.vel.y, v0z = this.vel.z;
    super.afterStep(dt);
    // Shaking: the change of velocity this step, beyond what gravity explains.
    const ax = (this.vel.x - v0x) / dt, ay = (this.vel.y - v0y) / dt + g, az = (this.vel.z - v0z) / dt;
    this.accel = (this.accel || 0) * 0.8 + Math.hypot(ax, ay, az) * 0.2;
  }

  destroy() {
    if (this.attach) this.sim.detachBag(this, true);
    if (this.body) {
      for (const c of this.colliders) if (c) this.sim.unregister(c);
      this.sim.world.removeRigidBody(this.body);
    }
    this.body = null;
  }
}

// ---------------------------------------------------------------- the system
class BiscuitPeg {
  constructor(i) {
    const S = BISCUIT_STAND;
    this.index = i;
    this.kind = KIND[S.kinds[i]];
    this.tip = new THREE.Vector3(S.x + S.pegXs[i], S.y + S.pegY + 0.0045, S.z + S.pegReach - 0.004);
    this.bag = null;
    this.emptyFor = 99;
  }
}

export class BiscuitSystem {
  constructor(sim) {
    this.sim = sim;
    this.list = [];
    this.chunks = [];
    this.snaps = [];
    this.nextChunk = 1;
    this.pegs = BISCUIT_STAND.pegXs.map((_, i) => new BiscuitPeg(i));
    this.buildStand();
    this.sync();
  }

  get active() { return this.sim.aircraft === 'chinook' && !this.sim.bare; }

  buildStand() {
    const S = BISCUIT_STAND, sim = this.sim, w = sim.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const box = (hx, hy, hz, x, y, z, groups) => {
      const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.7);
      if (groups) d.setCollisionGroups(groups);
      sim.register(w.createCollider(d, body), { kind: 'station', material: 'wood' });
    };
    box(S.baseHalf[0], S.baseHalf[1], S.baseHalf[2], S.x, S.y + S.baseHalf[1], S.z);
    for (const sx of [-1, 1]) box(S.postHalf, S.postHeight / 2, S.postHalf, S.x + sx * S.postX, S.y + S.postHeight / 2, S.z);
    box(S.postX + S.postHalf, S.barHalf, S.barHalf, S.x, S.y + S.barY, S.z);
    for (const px of S.pegXs) box(0.0022, 0.0022, S.pegReach / 2, S.x + px, S.y + S.pegY, S.z + S.pegReach / 2, GROUPS.peg);
    if (sim.bare) w.forEachCollider((c) => { if (c.parent() === body) c.setEnabled(false); });
  }

  // Hanging pose on a peg: the plane across the bar, turned so the clip is straight above the middle.
  spawn(peg) {
    const k = peg.kind, G = geomOf(k);
    const tilt = Math.atan2(G.anchor[0], G.anchor[1]);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
      .multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    const anchor = new THREE.Vector3(G.anchor[0], G.anchor[1], 0).applyQuaternion(quat);
    const pos = peg.tip.clone().add(new THREE.Vector3(0, -LINE * 0.995, 0)).sub(anchor);
    const b = new Biscuit(this.sim, pos, quat, k);
    this.list.push(b);
    this.sim.attachBag(b, { kind: 'peg', peg });
    peg.bag = b;
    peg.emptyFor = 0;
    this.sim.emit('biscuitSpawn', { biscuit: b });
    return b;
  }

  makeRoom() {
    if (this.list.length < MAX_BISCUITS) return true;
    let best = null, bestT = Infinity;
    for (const b of this.list) if (!b.attach && !b.held && b.born < bestT) { bestT = b.born; best = b; }
    if (!best) return false;
    this.remove(best);
    return true;
  }

  remove(b) {
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
    for (const p of this.pegs) if (p.bag === b) p.bag = null;
    b.destroy();
    this.sim.emit('biscuitRemoved', { id: b.id });
  }

  // Biscuits only while the Chinook flies; the stand fills up again as it comes back.
  sync() {
    if (!this.active) { for (const b of [...this.list]) this.remove(b); this.chunks.length = 0; return; }
    for (const p of this.pegs) if (!p.bag && this.makeRoom()) this.spawn(p);
  }

  reset() {
    for (const b of [...this.list]) this.remove(b);
    this.chunks.length = 0;
    for (const p of this.pegs) { p.bag = null; p.emptyFor = 99; }
    for (const c of this.sim.cups) c.crumbs = 0;
  }

  carried() { return this.list.filter((b) => b.attach && b.attach.kind === 'heli'); }

  queueSnap(b, band) { if (!this.snaps.some((s) => s.b === b && s.band === band)) this.snaps.push({ b, band }); }

  // The winch: pour held (or its trigger's travel) pays the line out; let go and it reels in.
  applyForces(dt, ctl) {
    if (!this.list.length) return;
    const k = this.sim.milk && this.sim.milk.bucket;
    const bucketOn = !!(k && k.attach && k.attach.kind === 'heli');
    const level = bucketOn || !ctl ? 0 : Math.max(0, Math.min(1, ctl.dunk ?? (ctl.pour ? 1 : 0)));
    const want = LINE + LINE_OUT * level;
    for (const b of this.list) {
      if (b.attach && b.attach.kind === 'heli') {
        b.line += THREE.MathUtils.clamp(want - b.line, -WINCH * dt, WINCH * dt);
        if (Math.abs(b.line - b.attach.length) > 0.0015) this.relength(b, b.line);
      }
      if (!b.held) b.applyForces(dt);
    }
  }

  relength(b, len) {
    const sim = this.sim, a = b.attach;
    sim.world.removeImpulseJoint(a.joint, true);
    a.length = len;
    const h = a.anchor, q = b.anchorLocal;
    a.joint = sim.world.createImpulseJoint(RAPIER.JointData.rope(len, { x: h.x, y: h.y, z: h.z }, { x: q.x, y: q.y, z: q.z }), a.heli.body, b.body, true);
  }

  afterStep(dt) {
    const sim = this.sim;
    for (const b of this.list) {
      if (b.held) continue;
      b.afterStep(dt);
      const imm = b.immersion > 0.05;
      if (imm && !b.wasImmersed) sim.emit('splash', { cup: b.cup, pos: b.pos.clone(), speed: Math.abs(b.vel.y) + 0.3 * Math.hypot(b.vel.x, b.vel.z), bag: b });
      if (!imm && b.wasImmersed && b.vel.y > 0.008) sim.emit('extract', { pos: b.pos.clone(), speed: b.vel.y, bag: b });
      b.wasImmersed = imm;
      if (b.attach && b.attach.kind === 'peg') b.line = LINE;
      sim.updateRope(b);
    }
    // Snaps (queued from contact callbacks, which run inside the world's event drain).
    for (const { b, band } of this.snaps) {
      if (!b.body || !b.alive(band)) continue;
      b.breakOff(band, band, 'snap');
      sim.emit('biscuitSnap', { biscuit: b, pos: b.pos.clone(), band });
    }
    this.snaps.length = 0;
    // Strength, at 60 Hz.
    if (sim.stepCount % 4 === 0) {
      for (const b of [...this.list]) {
        if (!b.body || b.held) continue;
        if (b.attach && b.attach.kind === 'peg') continue;
        b.checkBreaks(b.accel || 0);
        if (b.hi < b.lo) this.remove(b);
      }
    }
    this.stepChunks(dt);
    if (sim.stepCount % 8 === 0) this.offerToPeople();
  }

  // ---------------------------------------------------------------- broken pieces
  addChunk(b, a, z, at, quat, vel, soak, mass, why) {
    if (this.chunks.length >= MAX_CHUNKS) this.chunks.shift();
    const c = { id: this.nextChunk++, kind: b.kind, a, b: z, pos: at.clone(), quat: quat.clone(), prevPos: at.clone(), prevQuat: quat.clone(), vel: vel.clone(),
      spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), soak, mass, cup: null, rest: false, age: 0, fade: 1, seed: b.id * 31 + a };
    this.chunks.push(c);
    this.sim.emit('biscuitBreak', { biscuit: b, chunk: c, pos: at.clone(), why, cup: b.cup });
  }

  stepChunks(dt) {
    const sim = this.sim;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.prevPos.copy(c.pos); c.prevQuat.copy(c.quat);
      c.age += dt;
      if (!c.rest) {
        let inCup = c.cup;
        if (!inCup) for (const cup of sim.cups) {
          const dx = c.pos.x - cup.x, dz = c.pos.z - cup.z;
          if (dx * dx + dz * dz < cup.rIn * cup.rIn && c.pos.y < cup.waterY && c.pos.y > cup.floorY - 0.01) { inCup = cup; break; }
        }
        if (inCup && !c.cup) {
          c.cup = inCup;
          inCup.crumbs = (inCup.crumbs || 0) + c.mass;
          sim.emit('biscuitInTea', { cup: inCup, pos: c.pos.clone(), mass: c.mass });
          if (sim.people && inCup.owner) for (const p of sim.people.list) if (p.def.id === inCup.owner) p.crumbsInTea?.();
        }
        if (c.cup) {
          // Sinks slowly through the tea and settles flat on the bottom.
          c.vel.multiplyScalar(Math.exp(-dt * 9));
          c.vel.y = Math.max(c.vel.y - 2 * dt, -0.03);
          c.pos.addScaledVector(c.vel, dt);
          const floor = c.cup.floorY + 0.003;
          const dx = c.pos.x - c.cup.x, dz = c.pos.z - c.cup.z, d = Math.hypot(dx, dz), lim = c.cup.rIn - 0.012;
          if (d > lim) { c.pos.x = c.cup.x + dx / d * lim; c.pos.z = c.cup.z + dz / d * lim; }
          if (c.pos.y <= floor) { c.pos.y = floor; c.rest = true; }
          c.spin.multiplyScalar(Math.exp(-dt * 6));
        } else {
          c.vel.y -= g * dt;
          c.vel.multiplyScalar(Math.exp(-dt * 0.4));
          c.pos.addScaledVector(c.vel, dt);
          const floor = surfaceY(c.pos.x, c.pos.z) + 0.003;
          if (c.pos.y <= floor) { c.pos.y = floor; c.rest = true; sim.emit('biscuitLand', { pos: c.pos.clone(), mass: c.mass }); }
        }
        if (c.rest) {
          // Lies flat (its face down), keeping the turn it had about the vertical.
          _v.set(0, 0, 1).applyQuaternion(c.quat);
          _q.setFromUnitVectors(_v, _v.y >= 0 ? _n.set(0, 1, 0) : _n.set(0, -1, 0));
          c.quat.premultiply(_q);
        } else {
          const w = c.spin.length();
          if (w > 1e-4) c.quat.premultiply(_q.setFromAxisAngle(_v.copy(c.spin).multiplyScalar(1 / w), w * dt));
        }
      }
      // Dissolves in the tea; dry pieces go after a while.
      const life = c.cup ? 30 : 45;
      c.fade = Math.min(1, Math.max(0, (life - c.age) / 4));
      if (c.age > life) this.chunks.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- the neighbours
  offerToPeople() {
    const people = this.sim.people;
    if (!people || this.sim.state !== 'flying') return;
    for (const b of this.list) {
      if (!b.attach || b.attach.kind !== 'heli' || b.held) continue;
      for (const p of people.list) if (p.offerBiscuit && p.offerBiscuit(b)) break;
    }
  }

  // A neighbour takes it off the line: it leaves the physics and goes where their hand goes.
  take(b, person) {
    if (!b.body) return false;
    if (b.attach) this.sim.detachBag(b, true);
    for (const c of b.colliders) if (c) this.sim.unregister(c);
    this.sim.world.removeRigidBody(b.body);
    b.body = null;
    b.held = person;
    b.cup = null;
    b.immersion = 0;
    this.sim.emit('biscuitTaken', { biscuit: b, who: person.def.name, slam: b.slam, pos: b.pos.clone() });
    return true;
  }

  eat(b) {
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
    this.sim.emit('biscuitEaten', { id: b.id, kind: b.kind.id, slam: b.slam });
    this.sim.emit('biscuitRemoved', { id: b.id });
  }

  housekeeping(dt) {
    if (!this.active) { if (this.list.length) this.sync(); return; }
    for (const p of this.pegs) {
      if (p.bag) continue;
      p.emptyFor += dt;
      if (p.emptyFor > REFILL && this.makeRoom()) this.spawn(p);
    }
    for (const b of [...this.list]) {
      // Someone interrupted while eating (a rotor strike, a reset) has dropped it out of sight.
      if (b.held) { const R = b.held.react; if (!R || R.kind !== 'biscuit' || R.b !== b) this.eat(b); continue; }
      if (!b.body) continue;
      if (b.pos.y < -0.6) b.lowSince += dt; else b.lowSince = 0;
      if (b.lowSince > 6 && !b.attach) this.remove(b);
    }
  }
}
