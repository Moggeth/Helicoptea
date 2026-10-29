import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';
import { FY } from './world/plan.js';
import { BISTRO } from './chairShapes.js';
import { BISTRO_CHAIRS } from './world/left.js';
import { BBQ } from './world/right.js';
import { FORECOURT, PV } from './world/street.js';
import { CHAIRS as ALLOT_CHAIRS } from './world/allotments.js';
import { PK, benchInfo, frameAt } from './world/park.js';
import { SOFAS } from './world/house.js';
import { Poser, BONE, NICKS, onThigh } from './personPose.js';

// The neighbours: a few people sitting out (one at the barbecue) with a cup of tea each. Each cup is named
// for its owner ("Agnes's tea"), and the owner shows what they think of it: they watch the helicopter
// come, glance at their cup, and are pleased (or not) once it is brewed the way they like. Rotor blades
// on a person end the flight; they say ow and keep a small nick where the blade touched.
//
// Everything here is DOM-free. The animation runs in the sim so the colliders can follow the body (they
// exist only while something could touch them); src/render/people.js draws each person as one skinned
// mesh from the bone matrices solved here (src/sim/personPose.js).
//
// at: [x, floor y, z, yaw] of the seat's frame (0 faces +z). seat: kind of seat and the height of its
// surface. like: the brew strengths they're happy with (see BREW_NAMES in src/render/water.js).
// voice: pitch in Hz (src/audio/voice.js). look: the person's clothes and features, read by the renderer.

// The tea garden's bench, by value (layout.js imports this module).
const GARDEN_BENCH = { x: -1.7, z: -5.55, seat: -0.31 };
const at = (f, lx, lz, y, yaw) => { const [x, z] = frameAt(f, lx, lz); return [x, y, z, (f.yaw || 0) + yaw]; };
const PB = benchInfo(PK.benchFlask);
const RON_CHAIR = ALLOT_CHAIRS.find((c) => c.kind === 'deck');
const SOFA = SOFAS[0];

export const PEOPLE = [
  {
    id: 'agnes', name: 'Agnes', area: 'left', cup: 'left-patio', habit: 'knit', like: [0.42, 0.82],
    at: [BISTRO_CHAIRS[0][0], FY, BISTRO_CHAIRS[0][1], BISTRO_CHAIRS[0][2]], seat: ['chair', BISTRO.seat],
    size: 0.95, girth: 1.08, seed: 3, voice: 205,
    look: { skin: 0xe8c3a8, hair: 0xd9d6d0, hairStyle: 'bun', top: 0x7a3b4a, topStyle: 'cardigan', under: 0xe9e2d4, bottom: 0x5a5f6e, skirt: true,
      legs: 0xc9a68f, shoes: 0x3a2a24, glasses: 0x8a7a5a, brooch: 0xd9b45a, earrings: true },
  },
  {
    id: 'ron', name: 'Ron', area: 'allotments', cup: 'people-ron', habit: 'doze', like: [0.82, 2],
    at: [RON_CHAIR.x, FY, RON_CHAIR.z, RON_CHAIR.yaw], seat: ['deck', 0.25],
    size: 1.04, girth: 1.22, seed: 7, voice: 98,
    look: { skin: 0xd9a383, hair: 0x8a8580, hairStyle: 'bald', top: 0x6f7f5a, topStyle: 'shirt', under: 0x6f7f5a, bottom: 0x8a7a5e,
      legs: 0x8a7a5e, shoes: 0x4a3a2a, socks: 0x2f3a4a, moustache: 0x8a8580, watch: true, rolled: true },
  },
  {
    id: 'priya', name: 'Priya', area: 'street', cup: 'street-forecourt', habit: 'read', like: [0.22, 0.42],
    at: [FORECOURT.chairs[4][0], PV, FORECOURT.chairs[4][1], FORECOURT.chairs[4][2]], seat: ['chair', BISTRO.seat],
    size: 0.97, girth: 0.92, seed: 11, voice: 225,
    look: { skin: 0xa8734f, hair: 0x1f1714, hairStyle: 'ponytail', top: 0x3f6a8a, topStyle: 'jumper', under: 0x3f6a8a, bottom: 0x2b2f3a,
      legs: 0x2b2f3a, shoes: 0xe8e2d6, socks: 0xe8e2d6, watch: true, book: 0x9a3a3a },
  },
  {
    id: 'maggie', name: 'Maggie', area: 'house', cup: 'house-coffee', habit: 'crossword', like: [0.42, 2],
    at: at(SOFA, 0.3, 0, SOFA.y, 0), seat: ['sofa', 0.5],
    size: 0.98, girth: 1.12, seed: 17, voice: 190,
    look: { skin: 0xf0cdb4, hair: 0xa8542f, hairStyle: 'short', top: 0x8a9a7a, topStyle: 'jumper', under: 0xe9e2d4, bottom: 0x3a3f4a,
      legs: 0x3a3f4a, shoes: 0x7a2f3a, socks: 0x7a2f3a, glasses: 0x2a2a2a, pen: true },
  },
  {
    id: 'joe', name: 'Joe', area: 'right', cup: 'right-bbq', habit: 'bbq', like: [0.42, 2],
    at: [9.6, FY, 1.62, Math.atan2(BBQ.x - 9.6, BBQ.z - 1.62)], seat: ['stand', 0],
    size: 1.06, girth: 1.05, seed: 23, voice: 112,
    look: { skin: 0x6b4430, hair: 0x1a1412, hairStyle: 'crop', top: 0xc9c2b0, topStyle: 'tshirt', under: 0xc9c2b0, bottom: 0x3d4a5a,
      legs: 0x3d4a5a, shoes: 0x2a2a2a, apron: 0x2f4f3a, beard: 0x1a1412, tongs: true },
  },
  {
    id: 'stan', name: 'Stan', area: 'park', cup: 'park-bench', habit: 'crumbs', like: [0.62, 2],
    at: at(PB, 0.3, -0.02, PB.y, 0), seat: ['bench', 0.48],
    size: 0.96, girth: 0.98, seed: 29, voice: 118,
    look: { skin: 0xe2b89c, hair: 0xe8e4dc, hairStyle: 'cap', cap: 0x5a5146, top: 0x4a4038, topStyle: 'coat', under: 0xd8d2c4, bottom: 0x5a5a52,
      legs: 0x5a5a52, shoes: 0x2a1f18, scarf: 0x8a2f2f, ears: 1.15, bag: true },
  },
  {
    id: 'edie', name: 'Edie', area: null, cup: 'bench', habit: 'cat', like: [0.08, 0.42],
    at: [GARDEN_BENCH.x - 0.4, FY, GARDEN_BENCH.z + 0.01, 0], seat: ['bench', GARDEN_BENCH.seat - FY],
    size: 0.9, girth: 1.0, seed: 31, voice: 232,
    look: { skin: 0xf2d0bc, hair: 0xf0ece6, hairStyle: 'curls', top: 0x9ab0c8, topStyle: 'cardigan', under: 0xf0e6dc, bottom: 0x8a7a8a, skirt: true,
      legs: 0xd8b8a4, shoes: 0x6a5a4a, glasses: 0xc9a24e, pearls: true },
  },
];

// Ron's mug, on the grass by his deckchair (his right hand side, out of the way of his feet).
const RON_MUG = (() => { const [x, , z] = at(RON_CHAIR, -0.46, 0.12, 0, 0); return { x, z }; })();
export const CUPS = [
  { id: 'people-ron', name: 'Ron', x: RON_MUG.x, z: RON_MUG.z, standY: FY, baseY: FY, rOut: 0.047, rIn: 0.0415, height: 0.096,
    bottom: 0.009, water: 0.074, handleYaw: RON_CHAIR.yaw + Math.PI, glaze: 0x2f4f3a, rim: 0xe9e2d4 },
];

// Gives each person's cup its owner's name.
export function nameCups(cups) {
  for (const p of PEOPLE) {
    const c = cups.find((k) => k.id === p.cup);
    if (c) { c.name = `${p.name}'s tea`; c.owner = p.id; }
  }
}

// ------------------------------------------------------------------------------------- the people, live
const NEAR = 2.6;             // m: the helicopter is close enough to be watched closely
const COLLIDE_R = 2.4;        // m (plus speed): colliders exist while the aircraft is this near
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function rng(seed) { let s = seed * 2654435761 >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const setv = (arr, v) => { arr[0] = v.x; arr[1] = v.y; arr[2] = v.z; return arr; };

class Person {
  constructor(sim, def, index) {
    this.sim = sim;
    this.def = def;
    this.index = index;
    this.poser = new Poser(def);
    const B = this.b = this.poser.b;
    const [x, y, z, yaw] = def.at;
    this.place = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    this.inv = this.place.clone().invert();
    this.yaw = yaw;
    this.cupIndex = sim.cups.findIndex((c) => c.id === def.cup);
    const cup = sim.cups[this.cupIndex];
    this.cupLocal = cup ? new THREE.Vector3(cup.x, cup.waterY, cup.z).applyMatrix4(this.inv) : new THREE.Vector3(0.4, 0.6, 0.5);
    this.rand = rng(def.seed || index + 1);
    // Base pose for the seat.
    const [kind, sh] = def.seat;
    const pu = B.pelvisUp;
    const base = {
      chair: { p: [0, sh + pu, -0.035], lean: 0.07, feet: 0.37, spread: 0.12 },
      sofa: { p: [0, sh + pu, -0.07], lean: 0.26, feet: 0.44, spread: 0.13 },
      bench: { p: [0, sh + pu, -0.05], lean: 0.12, feet: 0.41, spread: 0.13 },
      deck: { p: [0, sh + pu * 0.75, -0.04], lean: 0.62, feet: 0.74, spread: 0.17 },
      stand: { p: [0, B.ankle + (B.th + B.sh) * 0.985, 0], lean: 0, feet: 0.03, spread: 0.11 },
    }[kind];
    this.kind = kind;
    this.base = base;
    // The pose being solved (see Poser.solve), reused.
    this.P = {
      pelvis: [...base.p], lean: base.lean, yaw: 0, roll: 0, bend: 0, chestBend: 0, twist: 0, breath: 0,
      head: [0, 0, 0], handL: [0.15, 0.6, 0.2], handR: [-0.15, 0.6, 0.2], poleL: [0.5, -0.6, -0.6], poleR: [-0.5, -0.6, -0.6], rollL: 0, rollR: 0, bendL: 0, bendR: 0,
      footL: [base.spread, B.ankle, base.feet], footR: [-base.spread, B.ankle, base.feet], kneeL: [0.2, 0.4, 1], kneeR: [-0.2, 0.4, 1],
      footYawL: 0.14, footYawR: -0.14, footPitchL: 0, footPitchR: 0,
      blink: 1, mouth: [1, 0, 0], prop: null, nicks: [],
    };
    this.propM = new THREE.Matrix4();
    this.hl = new THREE.Vector3(); this.hr = new THREE.Vector3();
    this.t = this.rand() * 100;
    this.version = 0;
    this.colliders = null;
    this.reset();
    // Settle the hands where they rest before anything is drawn.
    for (let i = 0; i < 4; i++) this.animate(0.25, null, true);
  }

  reset() {
    this.look = { yaw: 0, pitch: 0.2, ty: 0, tp: 0.2, t: 0, at: null, what: 'idle' };
    this.blinkT = 1 + this.rand() * 3;
    this.habitT = 4 + this.rand() * 6;   // until the habit's next flourish (a page, a stitch check, a throw)
    this.habitA = -1;                     // time into that flourish
    this.react = null;                    // { kind, t, ... }: a reaction playing over everything else
    this.tea = 'waiting';                 // 'waiting' | 'pleased' | 'stewed'
    this.asleep = this.def.habit === 'doze';
    this.awakeT = 0;
    this.offered = false;                 // pointed at the cup on this approach
    this.nicks = [];
    this.P.nicks = this.nicks;
    this.flinch = new THREE.Vector3();
    this.lastStrike = -99;
  }

  // World point to person space (into out).
  local(p, out) { return out.copy(p).applyMatrix4(this.inv); }

  sayAt(word) {
    const p = this.poser.j.head.clone().applyMatrix4(this.place);
    this.sim.emit('personSay', { who: this.def.name, person: this.index, word, pos: p, voice: this.def.voice });
  }

  // dt: seconds since the last call. heli: the live aircraft or null.
  animate(dt, heli, quiet = false) {
    const P = this.P, B = this.b, J = this.poser.j, base = this.base, def = this.def;
    this.t += dt;
    const t = this.t;
    // Where the helicopter is, in person space.
    let hd = Infinity;
    const hp = _v;
    const alive = heli && this.sim.state === 'flying';
    if (heli) { this.local(heli.pos, hp); hd = hp.distanceTo(J.neck.lengthSq() ? J.neck : _w.set(0, 1, 0)); }
    // The cup.
    const cup = this.sim.cups[this.cupIndex];
    const brew = cup ? cup.brew : 0;
    if (!quiet) this.teaState(brew, alive, hd, dt);

    // ------------------------------------------------- body
    P.pelvis[0] = base.p[0]; P.pelvis[1] = base.p[1]; P.pelvis[2] = base.p[2];
    P.lean = base.lean; P.bend = 0; P.chestBend = 0; P.twist = 0; P.roll = 0; P.yaw = 0;
    // Breathing, and a slow shift of weight.
    const period = this.asleep ? 5.4 : 4.1 + (def.seed % 5) * 0.12;
    P.breath = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / period);
    if (this.asleep) P.breath *= 1.6;
    const shift = Math.sin(t * 0.13 + def.seed) * Math.sin(t * 0.071);
    P.roll = shift * (this.kind === 'stand' ? 0.035 : 0.02);
    P.pelvis[0] += shift * (this.kind === 'stand' ? 0.02 : 0.006);
    P.chestBend = -P.roll * 0.3;

    // Hands at rest on the thighs, feet on the floor.
    const rest = (side, out) => onThigh(J, side, 0.62, 0.07 * B.s, out);
    rest(1, this.hl); rest(-1, this.hr);
    let focus = null;          // where the habit wants the eyes
    P.prop = null;
    P.poleL[0] = 0.5; P.poleL[1] = -0.6; P.poleL[2] = -0.6; P.poleR[0] = -0.5; P.poleR[1] = -0.6; P.poleR[2] = -0.6;
    P.rollL = 0; P.rollR = 0; P.bendL = 0; P.bendR = 0;
    P.footPitchL = 0; P.footPitchR = 0;
    const busy = hd < NEAR * 0.8 && alive;   // stops what they're doing to watch
    this.habitT -= dt;
    if (this.habitA >= 0) this.habitA += dt;
    focus = this.habit(dt, busy);

    // ------------------------------------------------- reactions
    const R = this.react;
    let lookAt = null, lookRate = 4.5, freeHand = null;
    if (R) {
      R.t += dt;
      const k = R.t;
      if (R.kind === 'pleased') {
        lookAt = k < 0.8 ? this.cupLocal : (heli ? hp : this.cupLocal);
        R.nod = k > 0.7 && k < 1.6 ? Math.sin((k - 0.7) / 0.9 * Math.PI * 2) * 0.22 : 0;
        const up = ease((k - 0.9) / 0.4) * (1 - ease((k - 2.3) / 0.5));
        if (up > 0) freeHand = { up, wave: Math.sin(k * 9) * 0.5 * up, target: _u.set(-0.22 * B.s, J.neck.y + 0.06, J.neck.z + 0.28) };
        if (k > 2.9) this.react = null;
      } else if (R.kind === 'stewed') {
        lookAt = this.cupLocal;
        P.lean += 0.08 * Math.sin(Math.min(1, k / 0.4) * Math.PI * 0.5) * (1 - ease((k - 1.6) / 0.4));
        R.shake = Math.sin(k * 15) * 0.22 * Math.max(0, 1 - k / 1.2);
        if (k > 2) this.react = null;
      } else if (R.kind === 'offer') {
        lookAt = (Math.floor(k / 0.9) % 2 === 0) ? this.cupLocal : (heli ? hp : this.cupLocal);
        const up = ease(k / 0.5) * (1 - ease((k - 2.4) / 0.5));
        // An open hand towards the cup: about halfway there.
        const side = this.cupLocal.x > 0 ? 1 : -1;
        if (up > 0) freeHand = { up, wave: 0, target: _u.lerpVectors(side > 0 ? J.shL : J.shR, this.cupLocal, 0.55), side, palm: true };
        if (k > 3.2) this.react = null;
      } else if (R.kind === 'ow') {
        lookAt = R.at;
        lookRate = 9;
        // Flinch away, then a hand to the sore spot.
        const f = Math.exp(-k * 3) * Math.min(1, k * 12);
        P.pelvis[0] += this.flinch.x * 0.03 * f; P.pelvis[2] += this.flinch.z * 0.03 * f;
        P.lean += 0.12 * f; P.roll += this.flinch.x * 0.1 * f; P.twist += this.flinch.x * 0.15 * f;
        const up = ease((k - 0.15) / 0.35) * (1 - ease((k - 2.6) / 0.6));
        if (up > 0 && R.nick) {
          const n = R.nick;
          _w.set(0, 0, 0.035).applyMatrix4(_m.multiplyMatrices(this.poser.m[n.bone], n.local));
          freeHand = { up, wave: 0, target: _w.clone(), side: R.side };
        }
        if (k > 6) this.react = null;
      }
    }

    // ------------------------------------------------- the head
    const L = this.look;
    L.t -= dt;
    if (!lookAt) {
      if (this.asleep) lookAt = null;
      else if (alive && hd < NEAR) lookAt = hp;
      else if (L.t <= 0 || !L.at) {
        const r = this.rand();
        L.t = 2.2 + this.rand() * 4;
        if (alive && hd < 9 && r < 0.35) L.what = 'heli';
        else if (r < 0.55) L.what = 'cup';
        else if (r < 0.82 && focus) L.what = 'focus';
        else { L.what = 'wander'; L.at = new THREE.Vector3((this.rand() - 0.5) * 4, J.neck.y + (this.rand() - 0.4) * 1.2, 2 + this.rand() * 2); }
      }
      if (!lookAt && !this.asleep) lookAt = L.what === 'heli' && alive ? hp : L.what === 'cup' ? this.cupLocal : L.what === 'focus' && focus ? focus : L.at;
    }
    const lean = P.lean - P.bend - P.chestBend;
    if (lookAt) {
      _w.subVectors(lookAt, J.neck.lengthSq() ? J.neck : _w.set(0, 1, 0));
      let ty = Math.atan2(_w.x, _w.z), tp = -Math.atan2(_w.y, Math.hypot(_w.x, _w.z));
      if (Math.abs(ty) > 1.9) ty = Math.sign(ty) * 1.9;  // behind them: as far round as they turn
      L.ty = ty; L.tp = THREE.MathUtils.clamp(tp, -0.7, 0.75);
    } else if (this.asleep) { L.ty = 0.1; L.tp = 0.55; }
    L.yaw = smooth(L.yaw, L.ty, lookRate, dt);
    L.pitch = smooth(L.pitch, L.tp, lookRate, dt);
    // Big turns take the shoulders round too.
    const over = Math.max(0, Math.abs(L.yaw) - 0.7) * Math.sign(L.yaw);
    P.twist += over * 0.45 + L.yaw * 0.12;
    const yawRel = THREE.MathUtils.clamp(L.yaw - P.twist, -1.25, 1.25);
    P.head[0] = yawRel + (R && R.shake ? R.shake : 0);
    P.head[1] = L.pitch + lean + (R && R.nod ? R.nod : 0) + (this.asleep ? 0.05 * P.breath : 0);
    P.head[2] = (this.asleep ? 0.22 : Math.sin(t * 0.37 + def.seed) * 0.05) - P.roll;

    // ------------------------------------------------- a free hand for the reactions
    if (freeHand) {
      const side = freeHand.side ?? -1, h = side > 0 ? this.hl : this.hr;
      h.lerp(freeHand.target, freeHand.up);
      if (side > 0) { P.rollL = freeHand.wave; P.poleL[2] = -0.2; } else { P.rollR = freeHand.wave; P.poleR[2] = -0.2; }
      if (freeHand.palm) { if (side > 0) P.rollL -= 1.2 * freeHand.up; else P.rollR += 1.2 * freeHand.up; }
    }
    setv(P.handL, this.hl); setv(P.handR, this.hr);

    // ------------------------------------------------- the face
    this.blinkT -= dt;
    if (this.blinkT < -0.14) this.blinkT = 1.6 + this.rand() * 3.8 + (this.rand() < 0.15 ? -1.4 : 0);
    P.blink = this.asleep ? 0.08 : this.blinkT < 0 ? Math.abs(this.blinkT / 0.07 + 1) : 1;
    const ow = R && R.kind === 'ow' ? Math.max(0, 1 - R.t / 0.8) : 0;
    const smile = this.tea === 'pleased' && !ow ? 1 : 0;
    P.mouth[0] = 1 - Math.max(ow, smile, this.asleep ? 1 : 0); P.mouth[1] = smile; P.mouth[2] = this.asleep ? 0.55 : ow;

    this.poser.solve(P);
    this.version++;
    if (this.colliders) this.moveColliders();
  }

  // ------------------------------------------------------------------------------------ habits
  // Sets the hands (this.hl, this.hr), the prop and any posture of its own; returns where the eyes go.
  habit(dt, busy) {
    const P = this.P, B = this.b, J = this.poser.j, t = this.t, s = B.s;
    const px = P.pelvis[0], py = P.pelvis[1], pz = P.pelvis[2];
    const flourish = (len, every) => {
      if (this.habitA < 0 && this.habitT <= 0 && !busy) { this.habitA = 0; }
      if (this.habitA >= len) { this.habitA = -1; this.habitT = every[0] + this.rand() * (every[1] - every[0]); }
      return this.habitA >= 0 ? this.habitA : -1;
    };
    switch (this.def.habit) {
      case 'knit': {
        // Needles going in small loops over the lap; now and then the work comes up to be looked at.
        const a = flourish(2.8, [10, 18]);
        const lift = a >= 0 ? ease(a / 0.5) * (1 - ease((a - 2.2) / 0.6)) : 0;
        const rest = busy ? 1 : 0;
        const c = _w.set(px, py + (0.15 + 0.14 * lift - 0.05 * rest) * s, pz + (0.29 + 0.05 * lift) * s);
        const w = busy || lift > 0.1 ? 0 : 1, om = t * Math.PI * 2 * 1.5;
        this.hl.set(c.x + 0.058 * s, c.y + 0.004 * Math.sin(om + 1) * w, c.z - 0.01);
        this.hr.set(c.x - 0.058 * s, c.y + 0.012 * Math.sin(om) * w, c.z + 0.014 * Math.cos(om) * w);
        P.rollL = -0.5; P.rollR = 0.5; P.bendL = 0.3; P.bendR = 0.3;
        P.prop = this.propM.makeRotationX(-0.75 + 0.5 * lift).setPosition(c.x, c.y + 0.015, c.z + 0.02);
        P.bend = 0.06 * (1 - lift);
        P.footR[0] = -0.04; P.footR[2] = this.base.feet - 0.02; P.footL[2] = this.base.feet - 0.05; // ankles crossed
        return c.clone();
      }
      case 'doze': {
        // Hands folded on his middle, the paper across his lap; awake when the helicopter comes close.
        const belly = _w.set(0, 0.11 * s, B.waist * 0.95).applyMatrix4(this.poser.m[BONE.spine]);
        this.hl.set(belly.x + 0.045 * s, belly.y - 0.01, belly.z + 0.01);
        this.hr.set(belly.x - 0.045 * s, belly.y, belly.z + 0.015);
        P.rollL = -1.1; P.rollR = 1.1; P.poleL[0] = 1; P.poleR[0] = -1;
        const lap = onThigh(J, 1, 0.45, 0.085 * s, _u).lerp(onThigh(J, -1, 0.45, 0.085 * s, new THREE.Vector3()), 0.5);
        P.prop = this.propM.makeRotationX(-Math.PI / 2 + 0.25).premultiply(_m.makeRotationY(0.15)).setPosition(lap.x, lap.y, lap.z);
        P.footYawL = 0.35; P.footYawR = -0.3;
        return null;
      }
      case 'read': {
        // A paperback held in both hands; a page turned every so often; a foot that taps along.
        const a = flourish(1.0, [7, 13]);
        const lower = busy ? 1 : 0;
        const c = _w.set(px, py + (0.27 - 0.1 * lower) * s, pz + (0.3 - 0.02 * lower) * s);
        P.prop = this.propM.makeRotationX(-1.0 + 0.45 * lower).setPosition(c.x, c.y, c.z);
        const edge = (x) => _u.set(x, -0.05 * s, 0.01).applyMatrix4(this.propM);
        this.hl.copy(edge(0.1 * s));
        this.hr.copy(edge(-0.1 * s));
        if (a >= 0) {
          // Over the top of the page, right to left, and back.
          const f = Math.sin(Math.min(1, a / 1.0) * Math.PI);
          const over = _u.set(-0.1 * s + 0.16 * s * Math.min(1, a / 0.55), 0.03 * s + 0.05 * f * s, 0.04 + 0.05 * f).applyMatrix4(this.propM);
          this.hr.lerp(over, f);
        }
        P.rollL = -0.4; P.rollR = 0.4;
        P.bend = 0.04;
        const tap = Math.sin(t * 0.21) > 0.2 && !busy;
        P.footPitchR = tap ? -0.22 * Math.max(0, Math.sin(t * Math.PI * 2 * 1.7)) : 0;
        P.footR[2] = this.base.feet + 0.06;
        return c.clone().add(_u.set(0, 0.03, 0));
      }
      case 'crossword': {
        // The folded paper on her knee in the left hand; the right writes, or the pen taps her chin.
        const a = flourish(2.6, [9, 16]);
        const c = _w.set(px + 0.03 * s, py + 0.19 * s, pz + 0.33 * s);
        P.prop = this.propM.makeRotationX(-0.95).premultiply(_m.makeRotationY(-0.2)).setPosition(c.x, c.y, c.z);
        this.hl.copy(_u.set(0.12 * s, -0.02, 0.005).applyMatrix4(this.propM));
        const write = _u.set(-0.03 * s + 0.02 * Math.sin(t * 7), 0.01 + 0.006 * Math.sin(t * 11), 0.02).applyMatrix4(this.propM);
        this.hr.copy(busy ? onThigh(J, -1, 0.6, 0.07 * s, _u) : write);
        let up = 0;
        if (a >= 0 && !busy) {
          up = ease(a / 0.4) * (1 - ease((a - 2.1) / 0.5));
          const chin = _u.set(-0.03 * s, B.neck + B.headR * 0.25, B.headR * 1.25).applyMatrix4(this.poser.m[BONE.head]);
          this.hr.lerp(chin, up);
        }
        P.rollL = -0.5; P.rollR = 0.6 + 0.6 * up;
        return up > 0.3 ? _u.set(-0.6, J.neck.y + 0.8, 2.5).clone() : c.clone();
      }
      case 'bbq': {
        // Waiting on the barbecue: tongs at the ready, clacked now and then; the other hand on his hip.
        if (!this.grill) this.grill = this.local(new THREE.Vector3(BBQ.x, this.def.at[1] + 0.9, BBQ.z), new THREE.Vector3());
        const a = flourish(0.75, [3, 7]);
        const clack = a >= 0 ? Math.max(0, Math.sin(a / 0.75 * Math.PI * 3)) : 0;
        this.hr.set(J.hipR.x - 0.06 * s, J.hipR.y + 0.1 * s, J.hipR.z + 0.24 * s);
        P.rollR = 0.3 - 0.35 * clack; P.bendR = 0.5;
        P.poleR[0] = -0.6; P.poleR[1] = -0.5; P.poleR[2] = -0.5;
        this.hl.set(J.hipL.x + 0.11 * s, J.hipL.y + 0.07 * s, J.hipL.z - 0.03);
        P.poleL[0] = 1; P.poleL[1] = 0; P.poleL[2] = -0.4; P.rollL = -1.4;
        P.bend = 0.05;
        return this.grill;
      }
      case 'crumbs': {
        // A paper bag on his lap; a pinch of crumbs thrown for the birds every so often.
        const a = flourish(2.0, [6, 11]);
        this.hl.set(px + 0.07 * s, py + 0.13 * s, pz + 0.27 * s);
        P.rollL = -0.6;
        if (a >= 0) {
          const bag = _u.set(this.hl.x - 0.02, this.hl.y + 0.06, this.hl.z + 0.02);
          const back = _w.set(px - 0.2 * s, J.neck.y - 0.12, pz + 0.18);
          const out = new THREE.Vector3(px - 0.3 * s, J.neck.y - 0.05, pz + 0.62 * s);
          if (a < 0.6) this.hr.lerp(bag, ease(a / 0.4));
          else if (a < 0.9) this.hr.copy(bag).lerp(back, ease((a - 0.6) / 0.3));
          else if (a < 1.15) this.hr.copy(back).lerp(out, ease((a - 0.9) / 0.25));
          else this.hr.copy(out).lerp(this.hr, ease((a - 1.15) / 0.85));
          P.rollR = a > 0.9 && a < 1.3 ? -0.8 : 0;
          if (a > 0.9) return new THREE.Vector3(-1.2, 0, 2.6);
        }
        return new THREE.Vector3(-0.4, 0, 2.2);
      }
      case 'cat': {
        // Stroking the cat beside her on the bench, head to tail; the other hand on her knee.
        if (!this.catAt) this.catAt = new THREE.Vector3(0.35, py + 0.12, 0.06);
        const c = this.catAt;
        const cyc = (t % 2.5) / 2.5;
        const stroke = cyc < 0.6 ? cyc / 0.6 : 1 - (cyc - 0.6) / 0.4;
        const lift = cyc < 0.6 ? 0 : Math.sin((cyc - 0.6) / 0.4 * Math.PI) * 0.05;
        if (!busy) {
          this.hl.set(c.x - 0.04 + 0.02 * stroke, c.y + 0.1 - 0.05 * stroke + lift, c.z + 0.12 - 0.22 * stroke);
          P.rollL = -1.3; P.poleL[0] = 0.2; P.poleL[2] = -1;
        }
        return _u.set(c.x, c.y + 0.12, c.z + 0.1).clone();
      }
      default: return null;
    }
  }

  // ------------------------------------------------------------------------------------ the tea
  teaState(brew, alive, hd, dt) {
    const [lo, hi] = this.def.like;
    const R = this.react;
    const want = brew < lo ? 'waiting' : brew <= hi ? 'pleased' : 'stewed';
    if (brew < 0.02 && this.tea !== 'waiting') this.tea = 'waiting';
    if (want !== this.tea && want !== 'waiting' && (!R || R.kind === 'offer')) {
      this.tea = want;
      this.asleep = false; this.awakeT = 20;
      this.react = { kind: want, t: 0 };
      this.sayAt(want === 'pleased' ? 'mm' : 'hmm');
    }
    // Dozing: woken by the helicopter close by, off again once it has been gone a while.
    if (this.def.habit === 'doze') {
      if (alive && hd < 2.2) { if (this.asleep) { this.asleep = false; this.sayAt('huh'); } this.awakeT = 12; }
      else if (!this.asleep && this.tea !== 'pleased') { this.awakeT -= dt; if (this.awakeT <= 0 && !this.react) this.asleep = true; }
    }
    // An open hand towards the cup, once per visit, when the helicopter hangs about and the tea isn't made.
    if (alive && hd < NEAR && !this.react && this.tea === 'waiting' && !this.asleep && !this.offered) {
      this.nearT = (this.nearT || 0) + dt;
      if (this.nearT > 1.4) { this.offered = true; this.react = { kind: 'offer', t: 0 }; }
    }
    if (!alive || hd > NEAR * 1.8) { this.offered = false; this.nearT = 0; }
  }

  // ------------------------------------------------------------------------------------ rotor strikes
  // A blade touched this person: point is where (world), on the collider `other` for bone `bone`.
  strike(point, other, bone) {
    const sim = this.sim;
    if (sim.time - this.lastStrike < 1.2) return false;
    this.lastStrike = sim.time;
    // The nick goes on the body's surface nearest the blade, facing out.
    const pr = other.projectPoint({ x: point.x, y: point.y, z: point.z }, false);
    const surf = pr ? new THREE.Vector3(pr.point.x, pr.point.y, pr.point.z) : point.clone();
    const n = pr && !pr.isInside ? point.clone().sub(surf) : surf.clone().sub(other.translation());
    if (n.lengthSq() < 1e-10) n.set(0, 1, 0);
    const pl = this.local(surf, new THREE.Vector3()), nl = n.normalize().transformDirection(this.inv);
    pl.addScaledVector(nl, 0.003);
    const M = _m.makeBasis(...frameFor(nl)).setPosition(pl);
    const local = new THREE.Matrix4().copy(this.poser.m[bone]).invert().multiply(M);
    // A little irregular in size and turned at random.
    local.multiply(new THREE.Matrix4().makeRotationZ(this.rand() * Math.PI * 2)).multiply(new THREE.Matrix4().makeScale(0.8 + this.rand() * 0.5, 0.6 + this.rand() * 0.4, 1));
    const nick = { bone, local };
    if (this.nicks.length >= NICKS) this.nicks.shift();
    this.nicks.push(nick);
    this.flinch.set(-pl.x, 0, -pl.z + this.base.p[2]).normalize();
    // The hand on that side goes to it.
    this.react = { kind: 'ow', t: 0, at: sim.heli ? this.local(sim.heli.pos, new THREE.Vector3()) : pl.clone(), nick, side: pl.x >= 0 ? 1 : -1 };
    this.asleep = false; this.awakeT = 15;
    this.sayAt('ow');
    sim.emit('personStrike', { person: this.index, who: this.def.name, pos: surf, bone });
    return true;
  }

  // ------------------------------------------------------------------------------------ colliders
  // Capsules for the trunk and limbs and a ball for the head (and hands), following the pose.
  shapes() {
    const J = this.poser.j, B = this.b, s = B.s;
    return [
      ['seg', BONE.chest, J.pelvis, J.neck, B.waist * 0.92],
      ['ball', BONE.head, J.head, null, B.headR * 1.12],
      ['seg', BONE.uaL, J.shL, J.elL, 0.047 * s], ['seg', BONE.faL, J.elL, J.wrL, 0.04 * s],
      ['seg', BONE.uaR, J.shR, J.elR, 0.047 * s], ['seg', BONE.faR, J.elR, J.wrR, 0.04 * s],
      ['ball', BONE.handL, J.wrL, null, 0.05 * s], ['ball', BONE.handR, J.wrR, null, 0.05 * s],
      ['seg', BONE.thL, J.hipL, J.knL, 0.072 * s * B.g], ['seg', BONE.shL, J.knL, J.anL, 0.052 * s],
      ['seg', BONE.thR, J.hipR, J.knR, 0.072 * s * B.g], ['seg', BONE.shR, J.knR, J.anR, 0.052 * s],
    ];
  }

  buildColliders() {
    const sim = this.sim;
    this.colliders = this.shapes().map(([kind, bone, a, b, r]) => {
      const len = kind === 'seg' ? a.distanceTo(b) : 0;
      const desc = kind === 'seg' ? RAPIER.ColliderDesc.capsule(Math.max(0.001, len / 2 - r * 0.5), r) : RAPIER.ColliderDesc.ball(r);
      desc.setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.12);
      const c = sim.world.createCollider(desc);
      sim.register(c, { kind: 'person', material: 'person', person: this.index, bone });
      return { c, kind };
    });
    this.moveColliders();
  }

  moveColliders() {
    const sh = this.shapes();
    for (let i = 0; i < sh.length; i++) {
      const [kind, , a, b] = sh[i], c = this.colliders[i].c;
      if (kind === 'seg') {
        _w.copy(a).applyMatrix4(this.place); _u.copy(b).applyMatrix4(this.place);
        _q.setFromUnitVectors(UP, _v.subVectors(_u, _w).normalize());
        _w.add(_u).multiplyScalar(0.5);
        c.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      } else _w.copy(a).applyMatrix4(this.place);
      c.setTranslation({ x: _w.x, y: _w.y, z: _w.z });
    }
  }

  dropColliders() {
    for (const { c } of this.colliders) { this.sim.unregister(c); this.sim.world.removeCollider(c, false); }
    this.colliders = null;
  }
}

// An orthonormal frame [x, y, z] with z along n.
function frameFor(n) {
  const z = n.clone().normalize();
  const x = new THREE.Vector3().crossVectors(Math.abs(z.y) < 0.9 ? UP : Z, z).normalize();
  return [x, new THREE.Vector3().crossVectors(z, x), z];
}

// The sim's side of the people: their animation (at 60 Hz near the aircraft, slower further off), their
// colliders while something is close, and rotor strikes. Hooked into the sim like an extras module.
export class People {
  constructor(sim) {
    this.sim = sim;
    this.list = PEOPLE.map((d, i) => new Person(sim, d, i));
    this.acc = 1 / 60;   // the first step settles everyone (and makes colliders the checks want)
    this.tick = 0;
  }

  afterStep(dt) {
    this.acc += dt;
    if (this.acc < 1 / 60) return;
    const step = this.acc;
    this.acc = 0;
    this.tick++;
    const sim = this.sim, heli = sim.heli;
    for (const p of this.list) {
      const [x, y, z] = p.def.at;
      const d = heli ? Math.hypot(heli.pos.x - x, heli.pos.y - y - 0.8, heli.pos.z - z) : 99;
      // Far off they're animated less often (and drawn small); the steps add up so nothing runs slow.
      p.pending = (p.pending || 0) + step;
      const every = d < 14 ? 1 : d < 30 ? 4 : 12;
      if ((this.tick + p.index) % every === 0) { p.animate(p.pending, heli); p.pending = 0; }
      // Colliders while the aircraft (or a bag or wreckage) is near enough to touch.
      // (sim.streamColliders = false keeps every collider, for the headless route checks.)
      let want = sim.streamColliders === false || heli && d < COLLIDE_R + (heli.vel ? Math.min(2, heli.vel.length() * 0.6) : 0);
      if (!want) for (const b of sim.cargoItems()) if (b.pos && Math.hypot(b.pos.x - x, b.pos.z - z) < 1.6) { want = true; break; }
      if (!want) for (const db of sim.debris) { const t = db.body.translation(); if (Math.hypot(t.x - x, t.z - z) < 1.6) { want = true; break; } }
      if (want && !p.colliders) p.buildColliders();
      else if (!want && p.colliders) p.dropColliders();
    }
  }

  // A rotor blade touched the collider `other` (registered with info): returns the person, if it was a new strike.
  strike(info, point, other) {
    const p = this.list[info.person];
    return p && p.strike(point, other, info.bone) ? p : null;
  }

  reset() { for (const p of this.list) { p.reset(); p.animate(0.25, null, true); } }
}
