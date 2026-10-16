import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';
import { CFG } from '../config.js';
import { CUPS, TEAPOT, SUGAR, VASE, JUG, BOOKS, STATION, TABLE, MILK_BOWL } from './layout.js';
import { groundHeight } from './world/plan.js';

// Rotor downwash as a small fluid simulation.
//
// 1. The wake column below the rotor is momentum theory: induced velocity v_i = sqrt(T / (2 rho A)),
//    accelerating towards 2 v_i as the wake contracts.
// 2. Where the wake hits the table it turns into a thin outwash layer. That layer is a 2D incompressible
//    flow on a grid over the table: the impingement disc is a mass source, the pressure solve spreads it
//    radially and steers it around cups and the teapot, and semi-Lagrangian advection carries gusts along.
//
// sample(x, y, z, out) returns the air velocity at any point: column + outwash (fading with height).
// Each rotor has its own wake column (one on the micro heli, two on the tandem-rotor Chinook);
// `wake` is the first of `wakes`, kept for single-rotor callers.

const H = 0.034;                 // cell size (m)
const X0 = -1.02, Z0 = -0.68;    // grid origin
const NX = 60, NZ = 40;
const LAYER = 0.035;             // outwash layer thickness (m)

export class AirField {
  constructor(sim) {
    this.sim = sim;
    this.u = new Float32Array(NX * NZ);
    this.w = new Float32Array(NX * NZ);
    this.u2 = new Float32Array(NX * NZ);
    this.w2 = new Float32Array(NX * NZ);
    this.p = new Float32Array(NX * NZ);
    this.div = new Float32Array(NX * NZ);
    this.src = new Float32Array(NX * NZ);
    this.solid = new Uint8Array(NX * NZ);
    this.nx = NX; this.nz = NZ; this.h = H; this.x0 = X0; this.z0 = Z0;
    const mkWake = () => ({ active: false, hub: new THREE.Vector3(), dir: new THREE.Vector3(0, -1, 0), vi: 0, len: 0, radius: CFG.heli.rotorRadius, hit: new THREE.Vector3(), vg: 0, footR: 0 });
    this.wakes = [mkWake(), mkWake()];
    this.wake = this.wakes[0];
    this.energy = 0;
    this.calm = true;
    this.markSolids();
    this.buildStencil();
  }

  // The pressure solve visits the interior cells that are not solid, in row order, and for each takes its
  // four neighbours or, where a neighbour is solid, the cell itself. Worked out once (the solids never
  // change) so the inner loops are straight array reads.
  buildStencil() {
    const fluid = [], all = [];
    for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i; all.push(k); if (!this.solid[k]) fluid.push(k); }
    this.interior = Int32Array.from(all);
    this.fluid = Int32Array.from(fluid);
    const n = fluid.length, S = this.solid;
    this.nL = new Int32Array(n); this.nR = new Int32Array(n); this.nD = new Int32Array(n); this.nU = new Int32Array(n);
    for (let q = 0; q < n; q++) {
      const k = fluid[q];
      this.nL[q] = S[k - 1] ? k : k - 1; this.nR[q] = S[k + 1] ? k : k + 1;
      this.nD[q] = S[k - NX] ? k : k - NX; this.nU[q] = S[k + NX] ? k : k + NX;
    }
    // Cells with no solid neighbour (most of them) read their neighbours directly.
    this.plain = new Uint8Array(n);
    for (let q = 0; q < n; q++) { const k = fluid[q]; this.plain[q] = !S[k - 1] && !S[k + 1] && !S[k - NX] && !S[k + NX] ? 1 : 0; }
    this.rhs = new Float64Array(n);
  }

  markSolids() {
    const circ = (cx, cz, r) => {
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const x = X0 + (i + 0.5) * H, z = Z0 + (j + 0.5) * H;
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) this.solid[j * NX + i] = 1;
      }
    };
    const box = (cx, cz, hx, hz) => {
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const x = X0 + (i + 0.5) * H, z = Z0 + (j + 0.5) * H;
        if (Math.abs(x - cx) < hx && Math.abs(z - cz) < hz) this.solid[j * NX + i] = 1;
      }
    };
    for (const c of CUPS) circ(c.x, c.z, c.rOut);
    circ(TEAPOT.x, TEAPOT.z, TEAPOT.bodyR);
    circ(SUGAR.x, SUGAR.z, SUGAR.r);
    circ(VASE.x, VASE.z, VASE.r);
    circ(JUG.x, JUG.z, JUG.r);
    circ(MILK_BOWL.x, MILK_BOWL.z, MILK_BOWL.rOut);
    box(BOOKS.x, BOOKS.z, 0.1, 0.07);
    box(STATION.x, STATION.z, STATION.baseHalf[0], STATION.baseHalf[2]);
  }

  clear() { this.u.fill(0); this.w.fill(0); this.p.fill(0); for (const wk of this.wakes) wk.active = false; this.energy = 0; this.calm = true; }

  get anyWake() { return this.wakes[0].active || this.wakes[1].active; }

  // Is a point close enough to moving air to be worth sampling? (cheap culling for per-step queries)
  near(p, margin = 0.45) {
    if (this.calm) return false;
    if (!this.anyWake) return this.energy > 0.02 && Math.abs(p.x) < 1.05 && p.y < 0.2;
    for (const wk of this.wakes) {
      if (!wk.active) continue;
      const dh = Math.hypot(p.x - wk.hub.x, p.y - wk.hub.y, p.z - wk.hub.z);
      const dg = wk.vg ? Math.hypot(p.x - wk.hit.x, p.z - wk.hit.z) : 99;
      if (dh < margin || (dg < margin * 1.6 && p.y < 0.2)) return true;
    }
    return false;
  }

  // The rotors driving the air right now: hub (body frame), thrust and radius.
  rotorsOf(heli) {
    if (heli.type === 'chinook') return CFG.chinook.hubs.map((h, i) => ({ hub: h, T: heli.rotorT[i], R: CFG.chinook.rotorRadius }));
    if (heli.type === 'skycrane') return [{ hub: CFG.skycrane.hub, T: heli.thrust, R: CFG.skycrane.rotorRadius }];
    return [{ hub: CFG.heli.rotorHubOffset, T: heli.thrust, R: CFG.heli.rotorRadius }];
  }

  // Called at ~60 Hz from the sim.
  update(dt) {
    const A = CFG.air;
    const heli = this.sim.heli;
    this.src.fill(0);
    for (const wk of this.wakes) wk.active = false;
    const rotors = heli && heli.thrust > 0.01 ? this.rotorsOf(heli) : [];
    rotors.forEach((rot, ri) => {
      const wk = this.wakes[ri];
      const R = rot.R;
      if (rot.T <= 0.005) return;
      const area = Math.PI * R * R;
      wk.radius = R;
      wk.vi = Math.sqrt(rot.T / (2 * 1.2 * area)) * A.strength;
      wk.dir.copy(heli.up).negate();
      wk.hub.set(...rot.hub).applyQuaternion(heli.quat).add(heli.pos);
      const ray = new RAPIER.Ray({ x: wk.hub.x, y: wk.hub.y, z: wk.hub.z }, { x: wk.dir.x, y: wk.dir.y, z: wk.dir.z });
      const hit = this.sim.world.castRay(ray, A.maxReach, true, undefined, GROUPS.queryWorld, undefined, heli.body);
      wk.len = hit ? hit.timeOfImpact : A.maxReach;
      wk.active = true;
      if (hit) {
        wk.hit.copy(wk.hub).addScaledVector(wk.dir, wk.len);
        // Wake speed arriving at the surface: ~2 v_i close in, spreading and slowing with distance.
        const spread = 1 + Math.max(0, wk.len - R) / (3.5 * R);
        wk.vg = 2 * wk.vi / spread;
        wk.footR = R * (0.75 + 0.35 * Math.min(2, wk.len / R));
        if (wk.hit.y < 0.2) this.inject(wk);
      } else wk.vg = 0;
    });
    // Skip the solve entirely when the air is still (no rotor and the last gusts have died away).
    if (!this.anyWake && this.energy < 0.002) { this.calm = true; return; }
    this.calm = false;
    this.advect(dt);
    this.project();
    const damp = Math.exp(-dt / A.decay);
    let e = 0;
    for (let k = 0; k < NX * NZ; k++) {
      this.u[k] *= damp; this.w[k] *= damp;
      if (this.solid[k]) { this.u[k] = 0; this.w[k] = 0; }
      const s = this.u[k] * this.u[k] + this.w[k] * this.w[k];
      if (s > e) e = s;
    }
    this.energy = e;
  }

  inject(wk) {
    // Mass source over the footprint so the outwash leaves the ring edge at ~v_g.
    const a = wk.footR;
    const s = 2 * wk.vg / a;
    const ci = (wk.hit.x - X0) / H, cj = (wk.hit.z - Z0) / H;
    const rc = Math.ceil(a / H) + 1;
    // Horizontal part of a tilted wake pushes the outwash downstream.
    const dh = Math.hypot(wk.dir.x, wk.dir.z);
    for (let j = Math.max(1, Math.floor(cj - rc)); j < Math.min(NZ - 1, cj + rc); j++) {
      for (let i = Math.max(1, Math.floor(ci - rc)); i < Math.min(NX - 1, ci + rc); i++) {
        const x = X0 + (i + 0.5) * H, z = Z0 + (j + 0.5) * H;
        const r = Math.hypot(x - wk.hit.x, z - wk.hit.z);
        if (r > a) continue;
        const k = j * NX + i;
        this.src[k] += s * (1 - (r / a) ** 4);
        if (dh > 0.02) { this.u[k] += wk.dir.x * wk.vg * 0.25; this.w[k] += wk.dir.z * wk.vg * 0.25; }
      }
    }
  }

  advect(dt) {
    const { u, w, u2, w2 } = this;
    const xMax = NX - 1.001, zMax = NZ - 1.001;
    for (let j = 0, k = 0; j < NZ; j++) for (let i = 0; i < NX; i++, k++) {
      // Semi-Lagrangian: bilinear sample of both components at the back-traced point (bilerp, inlined).
      let x = i - u[k] * dt / H, z = j - w[k] * dt / H;
      x = x < 0 ? 0 : x > xMax ? xMax : x; z = z < 0 ? 0 : z > zMax ? zMax : z;
      const ii = Math.floor(x), jj = Math.floor(z), fx = x - ii, fz = z - jj;
      const q = jj * NX + ii, gx = 1 - fx, gz = 1 - fz;
      u2[k] = (u[q] * gx + u[q + 1] * fx) * gz + (u[q + NX] * gx + u[q + NX + 1] * fx) * fz;
      w2[k] = (w[q] * gx + w[q + 1] * fx) * gz + (w[q + NX] * gx + w[q + NX + 1] * fx) * fz;
    }
    // Swap rather than copy (everything reads this.u / this.w).
    this.u = u2; this.w = w2; this.u2 = u; this.w2 = w;
  }

  bilerp(f, x, z) {
    x = Math.max(0, Math.min(NX - 1.001, x)); z = Math.max(0, Math.min(NZ - 1.001, z));
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    const k = j * NX + i;
    return (f[k] * (1 - fx) + f[k + 1] * fx) * (1 - fz) + (f[k + NX] * (1 - fx) + f[k + NX + 1] * fx) * fz;
  }

  project() {
    const { u, w, p, div, src, interior, fluid, nL, nR, nD, nU } = this;
    for (let q = 0; q < interior.length; q++) {
      const k = interior[q];
      div[k] = ((u[k + 1] - u[k - 1]) + (w[k + NX] - w[k - NX])) / (2 * H) - src[k];
    }
    // Warm start from last frame's pressure: the flow changes slowly, so few iterations suffice.
    // (Gauss-Seidel in row order, as before: a neighbour that is solid counts as the cell itself.)
    const n = fluid.length, rhs = this.rhs, plain = this.plain;
    for (let q = 0; q < n; q++) { const k = fluid[q]; rhs[q] = div[k] * H * H; }
    for (let it = 0; it < CFG.air.iterations; it++) {
      for (let q = 0; q < n; q++) {
        const k = fluid[q];
        if (plain[q]) p[k] = (p[k - 1] + p[k + 1] + p[k - NX] + p[k + NX] - rhs[q]) * 0.25;
        else p[k] = (p[nL[q]] + p[nR[q]] + p[nD[q]] + p[nU[q]] - rhs[q]) * 0.25;
      }
    }
    for (let q = 0; q < n; q++) {
      const k = fluid[q];
      u[k] -= (p[nR[q]] - p[nL[q]]) / (2 * H);
      w[k] -= (p[nU[q]] - p[nD[q]]) / (2 * H);
    }
  }

  // Outwash at the table plane (no height falloff).
  sampleSurface(x, z, out) {
    const fx = (x - X0) / H - 0.5, fz = (z - Z0) / H - 0.5;
    if (fx < 0 || fz < 0 || fx > NX - 1 || fz > NZ - 1) { out.x = 0; out.z = 0; return out; }
    out.x = this.bilerp(this.u, fx, fz);
    out.z = this.bilerp(this.w, fx, fz);
    return out;
  }

  // Full 3D air velocity at a point.
  sample(x, y, z, out) {
    out.set(0, 0, 0);
    for (const wk of this.wakes) {
      if (!wk.active) continue;
      // Wake column.
      const rx = x - wk.hub.x, ry = y - wk.hub.y, rz = z - wk.hub.z;
      const s = rx * wk.dir.x + ry * wk.dir.y + rz * wk.dir.z; // distance downstream
      if (s > -0.01 && s < wk.len) {
        const px = rx - wk.dir.x * s, py = ry - wk.dir.y * s, pz = rz - wk.dir.z * s;
        const r = Math.sqrt(px * px + py * py + pz * pz);
        const R = wk.radius;
        const contraction = 1 - 0.22 * Math.min(1, s / R);
        const edge = R * contraction;
        if (r < edge * 1.25) {
          const speed = wk.vi * (1 + s / (s + R)) * (r < edge ? 1 : 1 - (r - edge) / (0.25 * edge));
          out.addScaledVector(wk.dir, Math.max(0, speed));
        }
      }
    }
    // Outwash layer over the table.
    const hgt = y - this.surfaceY(x, z);
    if (hgt > -0.01 && hgt < LAYER * 4) {
      const v = this.sampleSurface(x, z, _s);
      const f = Math.exp(-Math.max(0, hgt) / LAYER);
      out.x += v.x * f; out.z += v.z * f;
    }
    return out;
  }

  surfaceY(x, z) { return Math.abs(x) < TABLE.halfX && Math.abs(z) < TABLE.halfZ ? 0 : groundHeight(x, z); }

  maxSpeed() {
    let m = 0;
    for (let k = 0; k < NX * NZ; k++) { const s = this.u[k] * this.u[k] + this.w[k] * this.w[k]; if (s > m) m = s; }
    return Math.sqrt(m);
  }
}
const _s = { x: 0, z: 0 };
