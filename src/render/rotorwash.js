import * as THREE from 'three';
import { ParticlePool } from './particles.js';
import { surfaceY } from '../sim/layout.js';
import { milkyTea } from './water.js';
import { shear } from './rippleField.js';

const rand = (a, b) => a + Math.random() * (b - a);
const _c = new THREE.Color();
const TWO_PI = Math.PI * 2;
// Blade count and a visual turn rate per aircraft. The real blade-passage rate of a tiny rotor is far
// above the frame rate; these keep the pounding readable (rings at 14-18 Hz) instead of aliasing.
const ROTOR = { micro: { nb: 2, hz: 8 }, chinook: { nb: 3, hz: 5 }, skycrane: { nb: 6, hz: 2.6 } };

// Where a rotor wake meets open liquid (tea, the milk crock, the bird bath): couples each wake to each
// surface it lands on, drives that surface's ripple field, and throws spray and mist off it.
// Presentation only: reads sim.air's wakes, never writes to the simulation.
//
// The air field's ray passes straight through liquid (there is no collider on tea), so the wake is
// intersected with each liquid's plane here instead of using the ray's hit point.
export class LiquidWash {
  constructor(view) {
    this.view = view;
    this.surfaces = [];
    this.pool = new ParticlePool(Math.max(80, Math.round(view.quality.particles * 0.5)), { additive: false });
    view.scene.add(this.pool.points);
    this.sprayAcc = 0;
    this.mistAcc = 0;
    this.stats = { coupled: 0, spray: 0, mist: 0, landed: 0, landedInLiquid: 0, ms: 0 };
    this.floorFn = (x, z) => {
      const s = this.surfaceAt(x, z);
      return s ? s.cup.waterY : surfaceY(x, z) + 0.001;
    };
    // Drops landing back in a liquid ring it; drops over the rim are simply soaked up by the cloth.
    this.onLand = (x, y, z) => {
      this.stats.landed++;
      const s = this.surfaceAt(x, z);
      if (s) { this.stats.landedInLiquid++; s.kick(x, z, 0.012); }
    };
    // Mist and spray ride the air, except inside a vessel, where the wash spilling over the opening
    // recirculates: up and out along the walls (a cavity vortex), which is what lifts the mist out.
    this.windFn = (x, y, z, o) => {
      const s = this.surfaceAt(x, z);
      if (s && s.forcing.length && y < (s.cup.topY ?? s.cup.waterY + 0.02) + 0.004) {
        const f = s.forcing[0], c = s.cup;
        const dx = x - c.x - f.x, dz = z - c.z - f.z, d = Math.hypot(dx, dz) + 1e-4;
        return o.set(dx / d * f.vg * 0.35, f.vg * 0.3, dz / d * f.vg * 0.35);
      }
      view.sim.air.sample(x, y, z, o);
      if (o.y < 0 && y < surfaceY(x, z) + 0.006) o.y = 0.04;   // turned along the table, not through it
      return o;
    };
  }

  add(surface) { this.surfaces.push(surface); return surface; }

  surfaceAt(x, z) {
    for (const s of this.surfaces) {
      const c = s.cup;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.rIn * c.rIn) return s;
    }
    return null;
  }

  // Before the surfaces update: work out which wake lands on which liquid, and how hard.
  couple() {
    const t0 = performance.now();
    const sim = this.view.sim, air = sim.air;
    for (const s of this.surfaces) s.forcing.length = 0;
    let coupled = 0;
    const type = sim.heli ? (sim.heli.type || 'micro') : 'micro';
    const rot = ROTOR[type] || ROTOR.micro;
    air.wakes.forEach((wk, wi) => {
      if (!wk.active || wk.vi <= 0 || wk.dir.y > -0.3) return;
      for (const s of this.surfaces) {
        const v = s.cup;
        const sW = (v.waterY - wk.hub.y) / wk.dir.y;          // distance down the wake to this liquid
        if (sW <= 0 || sW > wk.len + 0.03) continue;           // above the rotor, or something solid first
        const px = wk.hub.x + wk.dir.x * sW, pz = wk.hub.z + wk.dir.z * sW;
        const R = wk.radius;
        // Same wake model as the air field: ~2 v_i close in, spreading and slowing with distance.
        const vg = (2 * wk.vi) / (1 + Math.max(0, sW - R) / (3.5 * R));
        const foot = R * (0.75 + 0.35 * Math.min(2, sW / R));
        const dx = px - v.x, dz = pz - v.z, d = Math.hypot(dx, dz);
        if (d > v.rIn + foot) continue;
        const ov = Math.exp(-((Math.max(0, d - foot * 0.6) / (0.5 * foot)) ** 2));
        const I = Math.min(1.6, vg * vg * 0.1) * ov;
        if (I < 0.02) continue;
        s.forcing.push({
          x: dx, z: dz, I, vg: vg * ov,
          // Stagnation dimple, q/(ρ_w g) with q = ½ρv², drawn about ×2.5 (the field settles to ~40% of this).
          depth: Math.min(0.0045, 3.6e-4 * vg * vg) * ov,
          a: Math.min(foot * 0.35, v.rIn * 0.45),
          ring: Math.max(0.012, Math.min(foot * 0.3, v.rIn * 0.6)), foot,
          nb: rot.nb, omega: TWO_PI * rot.hz * (wi === 1 ? -1 : 1), phase: wi * 1.7,
          tx: wk.dir.x, tz: wk.dir.z,
        });
        coupled++;
      }
    });
    this.stats.coupled = coupled;
    this.stats.ms = performance.now() - t0;
  }

  // After the surfaces update: spray and mist off every surface under the wash.
  update(dt) {
    const t0 = performance.now();
    const q = this.view.quality.steam;
    this.sprayAcc += dt;
    for (const s of this.surfaces) {
      if (!s.forcing.length) continue;
      const f = s.forcing[0], c = s.cup;
      // Spray: drops torn off the sheared annulus, thrown radially, low and fast. A few clear the rim.
      const sprayRate = q * 75 * Math.pow(Math.max(0, f.vg - 1.4), 1.5);
      s.sprayAcc = (s.sprayAcc || 0) + dt * sprayRate;
      const col = s.opts.water ? _c.set(s.opts.water.color).multiplyScalar(1.4) : milkyTea(c.brew, c.milk || 0, _c).multiplyScalar(1.25);
      while (s.sprayAcc > 1) {
        s.sprayAcc -= 1;
        // Anywhere on the liquid, weighted to where the outwash shears it; thrown away from the wake's centre.
        const pa = Math.random() * TWO_PI, pr = c.rIn * 0.92 * Math.sqrt(Math.random());
        const x = Math.cos(pa) * pr, z = Math.sin(pa) * pr;
        if (Math.random() > shear(f, x, z)) continue;
        const a = Math.atan2(z - f.z, x - f.x);
        const hs = f.vg * rand(0.12, 0.36), up = Math.random() < 0.12 ? rand(0.6, 0.95) : rand(0.15, 0.55);
        this.pool.emit({ p: [c.x + x, c.waterY + 0.0015, c.z + z], v: [Math.cos(a) * hs + f.tx * f.vg * 0.3, up, Math.sin(a) * hs + f.tz * f.vg * 0.3],
          life: rand(0.5, 0.9), size0: rand(0.0012, 0.0024), size1: 0.0009, col0: [col.r, col.g, col.b], alpha: 0.9, grav: 9.81, drag: 0.8, kind: 1 });
        this.stats.spray++;
      }
      // Mist: the finest spray, light enough to billow out with the wash and hang in the air.
      const mistRate = q * 28 * Math.max(0, f.vg - 1.8);
      s.mistAcc = (s.mistAcc || 0) + dt * mistRate;
      const mc = _c.lerp(new THREE.Color(0.97, 0.96, 0.94), 0.8);
      while (s.mistAcc > 1) {
        s.mistAcc -= 1;
        const pa = Math.random() * TWO_PI, pr = c.rIn * 0.9 * Math.sqrt(Math.random());
        const x = Math.cos(pa) * pr, z = Math.sin(pa) * pr;
        if (Math.random() > shear(f, x, z)) continue;
        const a = Math.atan2(z - f.z, x - f.x);
        this.pool.emit({ p: [c.x + x, c.waterY + 0.003, c.z + z], v: [Math.cos(a) * f.vg * rand(0.06, 0.18), rand(0.08, 0.25), Math.sin(a) * f.vg * rand(0.06, 0.18)],
          life: rand(1.2, 2.4), size0: 0.005, size1: rand(0.022, 0.038), col0: [mc.r, mc.g, mc.b], alpha: 0.15 * Math.min(1, f.I), grav: -0.03, drag: 1.1, kind: 0 });
        this.stats.mist++;
      }
    }
    this.pool.update(dt, this.floorFn, this.windFn, this.onLand);
    this.stats.ms += performance.now() - t0;
  }

  clear() { this.pool.clear(); for (const s of this.surfaces) { s.forcing.length = 0; s.field.clear(); } }
}
