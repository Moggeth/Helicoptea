import * as THREE from 'three';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { surfaceY } from '../sim/layout.js';
import { HELI_PARTS } from '../sim/helicopter.js';
import { CHINOOK_PARTS } from '../sim/chinook.js';
import { SKYCRANE_PARTS } from '../sim/skycrane.js';
import { rotorsOf, tailOf } from '../sim/damage.js';
import { teaColor } from './water.js';

// Crash and damage effects (see src/sim/damage.js for what causes them). Every crash kind has its own look:
//   impact   fireball, a shock ring across the surface, chips of whatever was hit
//   shatter  the blades burst: a ring of sparks in the disc, blade shards flung on the tangent, then the fall
//   spin     a tail strike's spiral: the airframe trails smoke as it turns, and lands in a corkscrew of dust
//   thrash   tipped over, the blades chew the surface: an arc of chips and sparks and a gouge
//   fall     a long drop: a flat bloom of dust and a hard shock ring
//   dunk     into the tea: no fire, a geyser of tea, a burst of steam, the hiss of a drowned engine
// Struck materials have their own shrapnel: splinters, china, leaves, brick grit, glass, fur.
// Everything is pooled and bounded: shards are one instanced mesh, the rest rides the view's particle pools.

const rand = (a, b) => a + Math.random() * (b - a);
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const vec = (p, out = new THREE.Vector3()) => (Array.isArray(p) ? out.set(p[0], p[1], p[2]) : out.copy(p));

export const PARTS = { micro: HELI_PARTS, chinook: CHINOOK_PARTS, skycrane: SKYCRANE_PARTS };
const bladeRotor = (part) => (typeof part.blade === 'object' ? part.blade.rotor : 0);

// Shrapnel by material: colours, shard proportions [w, thickness, length], sparks per shard, dust colour,
// and whether pieces flutter (leaves, cloth, fur) rather than drop.
const MATS = {
  wood: { cols: [0x7a4f2b, 0xa8784a, 0xc89b66], shape: [0.45, 0.3, 2.8], sparks: 0.1, dust: [0.62, 0.5, 0.36] },
  ceramic: { cols: [0xf4f1e8, 0xe6e9ee, 0x3f6aa6], shape: [1.5, 0.22, 1.1], sparks: 0.3, dust: [0.93, 0.91, 0.87] },
  glass: { cols: [0xcfeef5, 0xe8fbff, 0x9fd0dc], shape: [1.4, 0.12, 1.2], sparks: 0.5, dust: null, shiny: true },
  metal: { cols: [0x9a9ea6, 0x6d7279, 0xc9ccd2], shape: [1, 0.25, 1.2], sparks: 1.6, dust: null, shiny: true },
  brick: { cols: [0x9c4b36, 0xb5644a, 0x7d3a2a], shape: [1, 0.8, 1], sparks: 0.5, dust: [0.66, 0.45, 0.36] },
  stone: { cols: [0x9a968e, 0xb8b3a9, 0x76736d], shape: [1, 0.8, 1], sparks: 0.7, dust: [0.72, 0.7, 0.66] },
  tile: { cols: [0xa8553a, 0xc06a48], shape: [1.3, 0.3, 1], sparks: 0.4, dust: [0.7, 0.5, 0.4] },
  plaster: { cols: [0xefe9dc, 0xe2dccd], shape: [1, 0.4, 1], sparks: 0.15, dust: [0.95, 0.93, 0.88] },
  plant: { cols: [0x3f7d2c, 0x5a9a37, 0x7bb34a, 0xc7466a], shape: [1.6, 0.06, 1.2], sparks: 0, dust: null, flutter: true },
  cloth: { cols: [0xe9e1d0, 0xc9b8a0], shape: [1.2, 0.06, 1.2], sparks: 0, dust: [0.9, 0.86, 0.8], flutter: true },
  fur: { cols: [0x8a6a4a, 0x4a3a2c, 0xd8c8b0], shape: [0.35, 0.35, 1.6], sparks: 0, dust: null, flutter: true },
  paper: { cols: [0xf6f2ea, 0xe8dcc4], shape: [1.5, 0.05, 1.5], sparks: 0, dust: null, flutter: true },
  sugar: { cols: [0xffffff, 0xf3f0ea], shape: [1, 1, 1], sparks: 0, dust: [1, 1, 1] },
  apple: { cols: [0xb52a20, 0xf2e6b8, 0x7a1810], shape: [1, 0.6, 1], sparks: 0, dust: null },
  rubber: { cols: [0x2a2a2a], shape: [1, 0.5, 1], sparks: 0, dust: null },
  blade: { cols: [0x2b2d33, 0x1d2a44, 0xd9dde3, 0xc0392b], shape: [0.5, 0.18, 2.4], sparks: 0.8, dust: null, shiny: true },
  heli: { cols: [0x1d2a44, 0xf2f2f0, 0x8a8f99], shape: [1, 0.2, 1.3], sparks: 0.6, dust: null, shiny: true },
  tea: { cols: [0x6b3a1a], shape: [1, 1, 1], sparks: 0, dust: null, liquid: true },
};
const matOf = (m) => MATS[m] || MATS.plaster;

// Hide what a strike has taken off: blades, disc and ghosts of each lost rotor, and the tail rotor.
// bits: 1 main (Chinook forward) rotor, 2 Chinook aft rotor, 4 tail rotor.
export function applyDamageLook(model, type, bits) {
  const U = model.userData;
  bits = bits | 0;
  if (U.dmgBits === bits) return;
  U.dmgBits = bits;
  const parts = PARTS[type] || [];
  const rotors = U.rotors || [U.rotor];
  rotors.forEach((ro, i) => {
    if (!ro) return;
    const on = !(bits & (1 << i));
    const RU = ro.userData || {};
    if (RU.disc) RU.disc.visible = on;
    for (const gh of RU.ghosts || (i === 0 ? U.ghosts || [] : [])) gh.visible = on;
    for (const p of parts) if (p.blade && bladeRotor(p) === i && U.parts[p.name]) U.parts[p.name].visible = on;
  });
  if (U.tailRotor) U.tailRotor.visible = !(bits & 4);
}

export class CrashFx {
  constructor(view) {
    this.view = view;
    const max = Math.max(120, Math.round(view.quality.particles * 0.45));
    this.max = max;
    // Shards: small flat wedges, one instanced draw.
    const g = new THREE.BufferGeometry();
    const P = [0, 0, 0.5, 0.45, 0, -0.35, -0.5, 0, -0.4, 0, 0.5, 0];
    const idx = [0, 1, 2, 0, 3, 1, 1, 3, 2, 2, 3, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.translate(0, -0.25, 0);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15, flatShading: true }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.userData.noAO = true;
    view.scene.add(this.mesh);
    this.n = 0;
    this.sp = new Float32Array(max * 3); this.sv = new Float32Array(max * 3);
    this.sq = []; this.sw = []; this.ss = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max); this.flut = new Uint8Array(max); this.rest = new Uint8Array(max);
    for (let i = 0; i < max; i++) { this.sq.push(new THREE.Quaternion()); this.sw.push(new THREE.Vector3()); }
    // Shock rings (pooled).
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48, 1), new THREE.MeshBasicMaterial({ color: 0xffe1b0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.visible = false;
      m.renderOrder = 5;
      m.userData.noAO = true;
      view.scene.add(m);
      this.rings.push({ m, t: 9, dur: 0.4, r0: 0.01, r1: 0.2, a: 0.8 });
    }
    this.tickT = 0;
    this.trailT = 0;
  }

  clear() {
    this.n = 0; this.mesh.count = 0;
    for (const r of this.rings) { r.t = 9; r.m.visible = false; }
  }

  // ------------------------------------------------------------- live events
  event(e, camRig) {
    switch (e.type) {
      case 'rotorTick': this.tick(e); break;
      case 'rotorShatter': this.shatter(e, false); if (camRig) camRig.addShake(0.008 * (e.scale || 1)); break;
      case 'tailStrike': this.tailStrike(e); if (camRig) camRig.addShake(0.004); break;
      case 'teaStrike': this.teaStrike(e); break;
      default: break;
    }
  }

  crash(e, camRig) {
    const kind = e.kind || 'impact';
    const fire = kind !== 'dunk';
    this.view.explode(e, { fire, fireScale: kind === 'shatter' || kind === 'spin' ? 0.85 : kind === 'fall' ? 1.15 : 1, cold: !fire });
    this.flourish(e, kind);
    if (camRig) camRig.addShake(kind === 'fall' ? 0.018 : kind === 'dunk' ? 0.008 : 0.012);
  }

  // Replay: the same effects from logged events (positions as arrays, no live parts).
  play(e) {
    if (e.type === 'crash') {
      if (!e.pos) return;
      const ev = { ...e, pos: vec(e.pos), vel: e.vel ? vec(e.vel) : new THREE.Vector3(), up: e.up ? vec(e.up) : UP.clone(), at: e.at ? vec(e.at) : null };
      const kind = e.kind || 'impact';
      if (kind !== 'dunk') this.view.fireball(ev.pos, ev.vel, (e.aircraft && e.aircraft !== 'micro' ? 1.5 : 1) * (kind === 'shatter' || kind === 'spin' ? 0.85 : 1));
      this.flourish(ev, kind);
      return;
    }
    if (!e.pos) return;
    const ev = { ...e, pos: vec(e.pos), point: e.point ? vec(e.point) : null, up: e.up ? vec(e.up) : UP.clone() };
    if (e.type === 'rotorShatter') this.shatter(ev, true);
    else if (e.type === 'tailStrike') this.tailStrike(ev);
    else if (e.type === 'teaStrike') { ev.cup = this.view.sim.cups[e.cupIndex] || null; this.teaStrike(ev); }
    else if (e.type === 'rotorTick') this.tick(ev);
  }

  // ------------------------------------------------------------- pieces
  // n shards of a material from p, thrown along dir (spread), at speed.
  shards(p, dir, mat, n, speed, spread = 0.8, size = 0.004) {
    const M = matOf(mat);
    if (M.liquid) return;
    for (let k = 0; k < n; k++) {
      let i = this.n;
      if (i >= this.max) {
        // Recycle the oldest.
        let best = 0, bf = -1;
        for (let j = 0; j < this.max; j += 5) { const f = this.age[j] / this.life[j]; if (f > bf) { bf = f; best = j; } }
        i = best;
      } else this.n++;
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread).add(dir).normalize().multiplyScalar(speed * rand(0.4, 1.2));
      this.sp[i * 3] = p.x; this.sp[i * 3 + 1] = p.y; this.sp[i * 3 + 2] = p.z;
      this.sv[i * 3] = _v.x; this.sv[i * 3 + 1] = _v.y; this.sv[i * 3 + 2] = _v.z;
      const s = size * rand(0.5, 1.4);
      this.ss[i * 3] = s * M.shape[0]; this.ss[i * 3 + 1] = s * M.shape[1] + 0.0003; this.ss[i * 3 + 2] = s * M.shape[2];
      this.sq[i].setFromEuler(new THREE.Euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)));
      this.sw[i].set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(8, 30));
      this.life[i] = rand(2.5, 4.5); this.age[i] = 0;
      this.flut[i] = M.flutter ? 1 : 0; this.rest[i] = 0;
      this.mesh.setColorAt(i, _c.set(M.cols[(Math.random() * M.cols.length) | 0]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  sparks(p, dir, n, speed, spread = 0.7, life = 0.6) {
    const fx = this.view.fx;
    for (let k = 0; k < n; k++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread).add(dir).normalize().multiplyScalar(speed * rand(0.5, 1.3));
      fx.emit({ p: [p.x, p.y, p.z], v: [_v.x, _v.y, _v.z], life: rand(0.5, 1) * life, size0: rand(0.0025, 0.0045), size1: 0.001,
        col0: [1, 0.95, 0.75], col1: [1, 0.4, 0.08], alpha: 1, grav: 9.81, drag: 0.9, kind: 1 });
    }
  }

  dust(p, col, n, speed, horizontal = false, size = 0.02, life = 1.4) {
    const sm = this.view.smoke;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * rand(0.4, 1.1);
      sm.emit({ p: [p.x, p.y + 0.002, p.z], v: [Math.cos(a) * sp, horizontal ? rand(0.01, 0.06) : rand(0.05, 0.3) * speed, Math.sin(a) * sp], life: rand(0.7, 1.2) * life,
        size0: size * rand(0.6, 1), size1: size * rand(2.5, 4), col0: col, alpha: 0.32, drag: 3.2 });
    }
  }

  // Material burst where something was struck.
  spray(p, dir, mat, n, speed) {
    const M = matOf(mat);
    if (M.liquid) return;
    this.shards(p, dir, mat, n, speed, 0.9);
    if (M.sparks > 0) this.sparks(p, dir, Math.round(n * M.sparks * 1.5), speed * 1.6, 0.9, 0.5);
    if (M.dust) this.dust(p, M.dust, Math.max(2, Math.round(n * 0.35)), speed * 0.4);
  }

  ring(p, normal, r1, dur = 0.4, col = 0xffe1b0, a = 0.8) {
    const R = this.rings.reduce((x, y) => (x.t > y.t ? x : y));
    R.t = 0; R.dur = dur; R.r1 = r1; R.a = a;
    R.m.material.color.set(col);
    R.m.position.copy(p);
    R.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n.copy(normal).normalize());
    R.m.visible = true;
  }

  // ------------------------------------------------------------- strikes
  tick(e) {
    const now = this.view.time;
    if (now - this.tickT < 0.03) return;
    this.tickT = now;
    const P = vec(e.pos, _p);
    _a.set(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).normalize();
    if (e.harmless) { this.dust(P, matOf(e.material).dust || [0.8, 0.8, 0.8], 1, 0.1, false, 0.008, 0.6); return; }
    this.spray(P, _a, e.material, 3, 0.6);
    this.sparks(P, _a, 3, 1.2, 1, 0.35);
  }

  // A rotor bursts: sparks round the disc, blade shards on the tangent, the struck thing's own shrapnel.
  shatter(e, replay) {
    const P = vec(e.pos, new THREE.Vector3());
    const up = vec(e.up || UP, new THREE.Vector3()).normalize();
    const k = Math.sqrt(e.scale || 1);
    const s = Math.min(1.6, this.view.quality.particles / 500);
    const R = 0.09;
    const dir = e.dir || 1;
    const t = new THREE.Vector3(1, 0, 0);
    if (Math.abs(up.dot(t)) > 0.9) t.set(0, 0, 1);
    const ex = t.clone().addScaledVector(up, -t.dot(up)).normalize(), ez = new THREE.Vector3().crossVectors(ex, up);
    for (let i = 0; i < Math.round(60 * s + 20); i++) {
      const a = Math.random() * Math.PI * 2, r = R * rand(0.5, 1.05);
      _p.copy(P).addScaledVector(ex, Math.cos(a) * r).addScaledVector(ez, Math.sin(a) * r);
      _v.copy(ex).multiplyScalar(-Math.sin(a)).addScaledVector(ez, Math.cos(a)).multiplyScalar(dir * rand(1.4, 3.2)).addScaledVector(up, rand(-0.2, 0.6));
      this.view.fx.emit({ p: [_p.x, _p.y, _p.z], v: [_v.x, _v.y, _v.z], life: rand(0.35, 0.8), size0: rand(0.003, 0.005), size1: 0.0012,
        col0: [1, 0.95, 0.75], col1: [1, 0.38, 0.06], alpha: 1, grav: 9.81, drag: 0.7, kind: 1 });
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = R * rand(0.3, 1);
      _p.copy(P).addScaledVector(ex, Math.cos(a) * r).addScaledVector(ez, Math.sin(a) * r);
      _a.copy(ex).multiplyScalar(-Math.sin(a)).addScaledVector(ez, Math.cos(a)).multiplyScalar(dir);
      this.shards(_p, _a, 'blade', 1, rand(1.2, 2.6), 0.35, 0.005 * k);
    }
    if (e.point) {
      const pt = vec(e.point, new THREE.Vector3());
      _a.copy(pt).sub(P).normalize().multiplyScalar(-0.3).addScaledVector(up, 0.6).normalize();
      this.spray(pt, _a, e.material, 16, 0.9);
      if (e.material === 'tea') this.teaSpray(pt, null, 1.4);
    }
    this.ring(P, up, 0.32 * k, 0.32, 0xfff0c8, 0.9);
    const v = this.view;
    v.flash.position.copy(e.point ? vec(e.point, _p) : P);
    v.flashT = 0.12;
    if (!replay && e.parts) v.adoptDebris(e.parts, e.aircraft);
  }

  tailStrike(e) {
    const P = vec(e.pos, new THREE.Vector3());
    _a.set(rand(-1, 1), 0.8, rand(-1, 1)).normalize();
    this.sparks(P, _a, 36, 1.6, 1.1, 0.6);
    this.shards(P, _a, 'blade', 12, 1.2, 1, 0.003);
    if (e.point) this.spray(vec(e.point, _b), _a, e.material, 8, 0.7);
    this.view.smoke.emit({ p: [P.x, P.y, P.z], v: [0, 0.1, 0], life: 1.2, size0: 0.02, size1: 0.07, col0: [0.2, 0.19, 0.18], alpha: 0.5, drag: 1.5 });
    this.view.flash.position.copy(P);
    this.view.flashT = 0.25;
  }

  teaStrike(e) {
    const P = vec(e.pos, _b);
    this.teaSpray(P, e.cup, 0.8);
  }

  teaSpray(P, cup, k) {
    const v = this.view;
    const col = teaColor(cup ? cup.brew : 0.6, _c);
    for (let i = 0; i < Math.round(14 * k); i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.2, 0.9) * k;
      v.smoke.emit({ p: [P.x, P.y + 0.002, P.z], v: [Math.cos(a) * r, rand(0.4, 1.3) * k, Math.sin(a) * r], life: rand(0.3, 0.7), size0: rand(0.002, 0.0045), size1: 0.0015,
        col0: [col.r * 1.1, col.g * 1.1, col.b * 1.1], alpha: 0.9, grav: 9.81, drag: 0.4 });
    }
    if (cup) {
      const surf = v.surfaces[v.sim.cups.indexOf(cup)];
      if (surf) surf.addRipple(P.x, P.z, 0.8 * k, v.time);
    }
  }

  // ------------------------------------------------------------- the crash flourish for each kind
  flourish(e, kind) {
    const v = this.view;
    const P = e.pos;
    const k = Math.sqrt(e.scale || 1);
    const ground = this.groundBelow(P);
    const gp = _a.set(P.x, ground ?? P.y, P.z).clone();
    switch (kind) {
      case 'impact': {
        if (ground !== null) this.ring(_b.set(gp.x, gp.y + 0.002, gp.z), UP, 0.26 * k, 0.45);
        _n.set(0, 1, 0);
        this.spray(gp, _n, e.material || 'wood', 18, 1.0);
        this.shards(P, _n, 'heli', 14, 1.4, 1, 0.004 * k);
        break;
      }
      case 'shatter': {
        this.shatter({ pos: P, up: e.up || UP, scale: e.scale, dir: 1 }, true);
        if (ground !== null) this.ring(_b.set(gp.x, gp.y + 0.002, gp.z), UP, 0.22 * k, 0.4);
        this.shards(P, UP, 'heli', 16, 1.4, 1, 0.004 * k);
        break;
      }
      case 'spin': {
        // A corkscrew of smoke and dust turning the way it was spinning.
        const dir = Math.sign(e.spin || 1) || 1;
        for (let i = 0; i < 42; i++) {
          const a = (i / 42) * Math.PI * 4, r = 0.03 + i * 0.0022;
          _p.set(gp.x + Math.cos(a) * r, gp.y + 0.004 + i * 0.0012, gp.z + Math.sin(a) * r);
          _v.set(-Math.sin(a) * dir, 0.25, Math.cos(a) * dir).multiplyScalar(rand(0.25, 0.5));
          v.smoke.emit({ p: [_p.x, _p.y, _p.z], v: [_v.x, _v.y, _v.z], life: rand(1.4, 2.4), size0: 0.018, size1: rand(0.06, 0.1),
            col0: i % 3 ? [0.26, 0.24, 0.22] : [0.7, 0.64, 0.55], alpha: 0.42, drag: 1.2 });
        }
        this.shards(P, UP, 'heli', 16, 1.6, 1, 0.004 * k);
        this.spray(gp, UP, e.material || 'wood', 10, 0.8);
        break;
      }
      case 'thrash': {
        // An arc of chips and sparks where the blades chewed in, and a long gouge.
        const up = vec(e.up || UP, new THREE.Vector3());
        _n.set(up.x, 0, up.z);
        if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0);
        _n.normalize();
        const at = new THREE.Vector3(), out = new THREE.Vector3();
        for (let i = 0; i < 7; i++) {
          const a = (i / 6 - 0.5) * 2.2;
          at.copy(_n).applyAxisAngle(UP, a).multiplyScalar(0.08 * k).add(gp);
          at.y += 0.003;
          out.copy(_n).applyAxisAngle(UP, a + Math.PI / 2).multiplyScalar(0.6).addScaledVector(UP, 0.8).normalize();
          this.spray(at, out, e.material || 'wood', 4, 1.1);
          this.sparks(at, out, 6, 1.8, 0.8, 0.5);
        }
        v.gouge(gp, Math.atan2(_n.x, _n.z), 0.16 * k);
        this.shards(P, UP, 'blade', 14, 1.4, 1, 0.005 * k);
        break;
      }
      case 'fall': {
        if (ground !== null) {
          this.ring(_b.set(gp.x, gp.y + 0.002, gp.z), UP, 0.45 * k, 0.55, 0xfff0d8, 0.95);
          this.dust(gp, [0.78, 0.72, 0.62], 46, 0.9 * k, true, 0.03, 2.2);
        }
        this.shards(P, UP, 'heli', 24, 1.8, 1.2, 0.0045 * k);
        this.spray(gp, UP, e.material || 'tile', 14, 1.1);
        break;
      }
      case 'dunk': {
        const cup = e.cup !== null && e.cup !== undefined ? v.sim.cups[e.cup] : null;
        const top = cup ? cup.waterY : P.y;
        const cx = cup ? cup.x : P.x, cz = cup ? cup.z : P.z;
        const col = teaColor(cup ? cup.brew : 0.6, _c);
        // Geyser of tea.
        for (let i = 0; i < 90; i++) {
          const a = Math.random() * Math.PI * 2, r = rand(0, 0.35);
          v.smoke.emit({ p: [cx + Math.cos(a) * 0.01, top + 0.004, cz + Math.sin(a) * 0.01], v: [Math.cos(a) * r, rand(0.5, 1.8), Math.sin(a) * r], life: rand(0.5, 1.1),
            size0: rand(0.003, 0.006), size1: 0.002, col0: [col.r * 1.15, col.g * 1.15, col.b * 1.15], alpha: 0.95, grav: 9.81, drag: 0.3 });
        }
        // Steam from the hot engine meeting the tea, and a fizzle.
        for (let i = 0; i < 34; i++) {
          v.smoke.emit({ p: [cx + rand(-0.02, 0.02), top + 0.01, cz + rand(-0.02, 0.02)], v: [rand(-0.08, 0.08), rand(0.15, 0.4), rand(-0.08, 0.08)], life: rand(1.6, 3),
            size0: 0.02, size1: rand(0.09, 0.15), col0: [1, 0.99, 0.97], alpha: 0.32, grav: -0.03, drag: 0.8 });
        }
        _a.set(0, 1, 0);
        this.sparks(_b.set(cx, top + 0.01, cz), _a, 12, 0.7, 1, 0.3);
        if (cup) {
          const surf = v.surfaces[v.sim.cups.indexOf(cup)];
          if (surf) for (let i = 0; i < 4; i++) surf.addRipple(cx + rand(-0.01, 0.01), cz + rand(-0.01, 0.01), 2.5, v.time - i * 0.08);
        }
        this.ring(_b.set(cx, top + 0.002, cz), UP, 0.09, 0.45, 0xfff6e8, 0.6);
        break;
      }
      default: break;
    }
  }

  groundBelow(P) {
    const hit = this.view.sim.world.castRay(new RAPIER.Ray({ x: P.x, y: P.y + 0.02, z: P.z }, { x: 0, y: -1, z: 0 }), 0.6, true, undefined, GROUPS.queryWorld);
    return hit ? P.y + 0.02 - hit.timeOfImpact : null;
  }

  // ------------------------------------------------------------- per frame
  // Live damage: what is missing, a shaking worn rotor, smoke from a worn hub or a broken tail.
  updateLive(dt, sim, models) {
    const h = sim.heli;
    for (const [type, m] of Object.entries(models)) if (!h || h.type !== type) applyDamageLook(m, type, 0);
    if (!h || !h.dmg) return;
    const D = h.dmg, model = models[h.type];
    applyDamageLook(model, h.type, D.shed);
    const v = this.view;
    const U = model.userData;
    // Worn blades: the disc shakes.
    const rotors = U.rotors || [U.rotor];
    rotors.forEach((ro, i) => {
      const w = D.wear[i] || 0;
      if (!ro) return;
      if (w < 0.05) { if (h.type === 'micro') ro.rotation.x = ro.rotation.z = 0; else if (h.type === 'chinook') ro.rotation.x = 0; return; }
      const j1 = (Math.random() - 0.5) * 0.12 * w, j2 = (Math.random() - 0.5) * 0.12 * w;
      if (h.type === 'micro') { ro.rotation.x = j1; ro.rotation.z = j2; } else if (h.type === 'chinook') { ro.rotation.x = j1; ro.rotation.z += j2; } else { ro.rotation.x += j1; ro.rotation.z += j2; }
    });
    this.trailT += dt;
    if (this.trailT < 0.03) return;
    const step = this.trailT;
    this.trailT = 0;
    const hubs = rotorsOf(h.type);
    for (let i = 0; i < hubs.length; i++) {
      const gone = D.shed & (1 << i), w = gone ? 1 : D.wear[i];
      if (w < 0.25) continue;
      _p.set(...hubs[i].hub).applyQuaternion(v.heliQuat).add(v.heliPos);
      if (Math.random() < w * 1.4 * step / 0.03) {
        v.smoke.emit({ p: [_p.x, _p.y, _p.z], v: [rand(-0.03, 0.03), rand(0.05, 0.15), rand(-0.03, 0.03)], life: rand(0.8, 1.5), size0: 0.01, size1: rand(0.04, 0.07),
          col0: gone ? [0.12, 0.11, 0.1] : [0.35, 0.33, 0.31], alpha: 0.35 * w, drag: 1.4 });
      }
      if (gone && Math.random() < 0.25) this.sparks(_p, UP, 1, 0.6, 1, 0.3);
    }
    if (D.tail) {
      const T = tailOf(h.type);
      if (T) {
        _p.set(...T.hub).applyQuaternion(v.heliQuat).add(v.heliPos);
        const spin = Math.min(1, Math.abs(D.spin) / 6);
        v.smoke.emit({ p: [_p.x, _p.y, _p.z], v: [rand(-0.02, 0.02), rand(0.03, 0.08), rand(-0.02, 0.02)], life: rand(1.2, 2.2), size0: 0.008, size1: rand(0.035, 0.06),
          col0: [0.16, 0.15, 0.14], col1: [0.45, 0.43, 0.4], alpha: 0.3 + 0.25 * spin, drag: 1.2 });
        if (Math.random() < 0.3 + spin * 0.4) this.sparks(_p, UP, 1, 0.5, 1, 0.25);
      }
    }
  }

  update(dt) {
    // Shards.
    const n = this.n, g = 9.81;
    let live = 0;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      // Compact in place.
      if (live !== i) this.move(i, live);
      const k = live * 3;
      const sp = this.sp, sv = this.sv;
      if (!this.rest[live]) {
        const fl = this.flut[live];
        const drag = fl ? 6 : 0.6;
        const dr = Math.exp(-drag * dt);
        sv[k] *= dr; sv[k + 2] *= dr;
        sv[k + 1] = sv[k + 1] * (fl ? Math.exp(-3 * dt) : dr) - g * dt * (fl ? 0.25 : 1);
        if (fl) { sv[k] += Math.sin(this.age[live] * 9 + live) * 0.6 * dt; sv[k + 2] += Math.cos(this.age[live] * 7 + live) * 0.6 * dt; }
        sp[k] += sv[k] * dt; sp[k + 1] += sv[k + 1] * dt; sp[k + 2] += sv[k + 2] * dt;
        const fy = surfaceY(sp[k], sp[k + 2]) + 0.0005;
        if (sp[k + 1] < fy) {
          sp[k + 1] = fy;
          if (Math.abs(sv[k + 1]) < 0.25 || fl) { this.rest[live] = 1; this.sw[live].multiplyScalar(0); this.sq[live].setFromEuler(new THREE.Euler(0, Math.random() * 6.3, 0)); }
          else { sv[k + 1] *= -0.3; sv[k] *= 0.5; sv[k + 2] *= 0.5; this.sw[live].multiplyScalar(0.5); }
        }
        const w = this.sw[live], wl = w.length();
        if (wl > 0) { _q.setFromAxisAngle(_a.copy(w).divideScalar(wl), wl * dt); this.sq[live].premultiply(_q); }
      }
      const fade = Math.min(1, (this.life[live] - this.age[live]) / 0.5);
      _s.set(this.ss[k] * fade, this.ss[k + 1] * fade, this.ss[k + 2] * fade);
      _p.set(sp[k], sp[k + 1], sp[k + 2]);
      _m.compose(_p, this.sq[live], _s);
      this.mesh.setMatrixAt(live, _m);
      live++;
    }
    if (live !== n && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.n = live;
    this.mesh.count = live;
    if (live || n) this.mesh.instanceMatrix.needsUpdate = true;
    // Shock rings.
    for (const R of this.rings) {
      if (!R.m.visible) continue;
      R.t += dt;
      const f = R.t / R.dur;
      if (f >= 1) { R.m.visible = false; continue; }
      const r = R.r0 + (R.r1 - R.r0) * (1 - (1 - f) * (1 - f));
      R.m.scale.set(r, r, r);
      R.m.material.opacity = R.a * (1 - f) * (1 - f);
    }
  }

  move(from, to) {
    for (let a = 0; a < 3; a++) {
      this.sp[to * 3 + a] = this.sp[from * 3 + a]; this.sv[to * 3 + a] = this.sv[from * 3 + a]; this.ss[to * 3 + a] = this.ss[from * 3 + a];
    }
    this.sq[to].copy(this.sq[from]); this.sw[to].copy(this.sw[from]);
    this.life[to] = this.life[from]; this.age[to] = this.age[from]; this.flut[to] = this.flut[from]; this.rest[to] = this.rest[from];
    if (this.mesh.instanceColor) { this.mesh.getColorAt(from, _c); this.mesh.setColorAt(to, _c); }
  }
}
