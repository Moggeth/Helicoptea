import * as THREE from 'three';
import { ParticlePool } from './particles.js';
import { surfaceY } from '../sim/layout.js';
import { milkyTea } from './water.js';
import { shear } from './rippleField.js';
import { OpenWash, waterAt, hasWater } from './openWater.js';
import { radialTexture } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const _c = new THREE.Color(), _mc = new THREE.Color();
const MIST = new THREE.Color(0.97, 0.96, 0.94);
const TWO_PI = Math.PI * 2;
// Blade count and a visual turn rate per aircraft. The real blade-passage rate of a tiny rotor is far
// above the frame rate; these keep the pounding readable (rings at 14-18 Hz) instead of aliasing.
const ROTOR = { micro: { nb: 2, hz: 8 }, chinook: { nb: 3, hz: 5 }, skycrane: { nb: 6, hz: 2.6 } };
const PROBE = Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TWO_PI), Math.sin(i / 6 * TWO_PI)]);

// Where a rotor wake meets liquid: the cups, the milk crock and the bird bath (each a vessel with its own
// ripple field), open water outdoors (ponds, the stream, troughs, puddles: one roaming field, see
// openWater.js) and spilt milk and tea lying on the table. Couples each wake to each surface it lands
// on, drives the ripple fields, and throws spray, mist, slop over the rim and splashes off them; drops
// that land on something dry leave a wet spot that dries away.
// Presentation only: reads sim.air's wakes and sim.milk's puddles, never writes to the simulation.
//
// The air field's ray passes straight through liquid (there is no collider on tea), so the wake is
// intersected with each liquid's plane here instead of using the ray's hit point.
export class LiquidWash {
  constructor(view) {
    this.view = view;
    this.surfaces = [];
    this.pool = new ParticlePool(Math.max(120, Math.round(view.quality.particles * 0.85)), { additive: false });
    view.scene.add(this.pool.points);
    this.open = hasWater() ? new OpenWash(view.quality) : null;
    this.waterAt = waterAt;   // (for tests and the debug readout)
    this.spots = new WetSpots(view.scene, view.quality.lite ? 28 : 48);
    this.crowns = 0;
    this.stats = { coupled: 0, spray: 0, mist: 0, slop: 0, crowns: 0, spots: 0, open: 0, openSpray: 0, puddleSpray: 0, landed: 0, landedInLiquid: 0, ms: 0 };
    this.floorFn = (x, z) => {
      const s = this.surfaceAt(x, z);
      if (s) return s.cup.waterY;
      if (this.open && this.open.on) { const y = this.open.surfaceY(x, z); if (y === y) return y; }
      return surfaceY(x, z) + 0.001;
    };
    // Drops landing back in a liquid ring it (and the bigger ones throw up a little crown of droplets);
    // drops landing on anything else leave a wet spot.
    this.onLand = (x, y, z, size, speed) => {
      this.stats.landed++;
      const s = this.surfaceAt(x, z);
      const big = size > 0.0015 && speed > 0.35;
      if (s) {
        this.stats.landedInLiquid++;
        s.kick(x, z, 0.012 + (big ? size * 6 : 0));
        if (big) this.crown(x, y, z, s.opts.water ? _c.set(s.opts.water.color).multiplyScalar(1.4) : milkyTea(s.cup.brew, s.cup.milk || 0, _c).multiplyScalar(1.2));
        return;
      }
      const o = this.open;
      if (o && o.on && o.surfaceY(x, z) === o.surfaceY(x, z)) {
        this.stats.landedInLiquid++;
        o.field.impulse(x - o.x, z - o.z, 0.02 + size * 8, 0.004);
        if (big) this.crown(x, y, z, o.spray);
        return;
      }
      if (size > 0.0012 && Math.random() < 0.45) { this.spots.add(x, y, z, size * rand(2.6, 5.5)); this.stats.spots++; }
    };
    // Mist and spray ride the air, except inside a vessel, where the wash spilling over the opening
    // recirculates: up and out along the walls (a cavity vortex), which is what lifts the mist out. Over
    // open water the air field (the table's) isn't there, so the outwash is a radial sheet that lifts at
    // its edge.
    this.windFn = (x, y, z, o) => {
      const s = this.surfaceAt(x, z);
      if (s && s.forcing.length && y < (s.cup.topY ?? s.cup.waterY + 0.02) + 0.004) {
        const f = s.forcing[0], c = s.cup;
        const dx = x - c.x - f.x, dz = z - c.z - f.z, d = Math.hypot(dx, dz) + 1e-4;
        return o.set(dx / d * f.vg * 0.35, f.vg * 0.3, dz / d * f.vg * 0.35);
      }
      const W = this.open;
      if (W && W.forcing.length && Math.abs(y - W.y) < 0.15) {
        const f = W.forcing[0];
        const dx = x - W.x - f.x, dz = z - W.z - f.z, d = Math.hypot(dx, dz) + 1e-4;
        if (d < f.foot * 5) {
          const k = f.vg * Math.exp(-d / (2.2 * f.foot)) * Math.min(1, d / (0.6 * f.foot));
          return o.set(dx / d * k * 0.8, k * (d > f.foot * 1.4 ? 0.35 : -0.2), dz / d * k * 0.8);
        }
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
    const W = this.open;
    if (W) W.forcing.length = 0;
    let coupled = 0, best = null;
    const type = sim.heli ? (sim.heli.type || 'micro') : 'micro';
    const rot = ROTOR[type] || ROTOR.micro;
    air.wakes.forEach((wk, wi) => {
      if (!wk.active || wk.vi <= 0 || wk.dir.y > -0.3) return;
      const R = wk.radius;
      for (const s of this.surfaces) {
        const v = s.cup;
        const sW = (v.waterY - wk.hub.y) / wk.dir.y;          // distance down the wake to this liquid
        if (sW <= 0 || sW > wk.len + 0.03) continue;           // above the rotor, or something solid first
        const px = wk.hub.x + wk.dir.x * sW, pz = wk.hub.z + wk.dir.z * sW;
        // Same wake model as the air field: ~2 v_i close in, spreading and slowing with distance.
        const vg = (2 * wk.vi) / (1 + Math.max(0, sW - R) / (3.5 * R));
        const foot = R * (0.75 + 0.35 * Math.min(2, sW / R));
        const dx = px - v.x, dz = pz - v.z, d = Math.hypot(dx, dz);
        if (d > v.rIn + foot) continue;
        const ov = Math.exp(-((Math.max(0, d - foot * 0.6) / (0.5 * foot)) ** 2));
        const I = Math.min(1.6, vg * vg * 0.1) * ov;
        if (I < 0.02) continue;
        s.forcing.push(this.forcing(dx, dz, vg, ov, I, foot, v.rIn, rot, wi, wk));
        coupled++;
      }
      // Open water: the water plane where the wake's ray came down (or beside it, for outwash landing on
      // a puddle's edge), if the rotor is above it and nothing solid came first.
      if (!W) return;
      const ex = wk.hub.x + wk.dir.x * wk.len, ey = wk.hub.y + wk.dir.y * wk.len, ez = wk.hub.z + wk.dir.z * wk.len;
      let wy = waterAt(ex, ez);
      const foot0 = R * (0.75 + 0.35 * Math.min(2, wk.len / R));
      if (!(wy === wy)) {
        for (const [cx, cz] of PROBE) {
          const y = waterAt(ex + cx * foot0 * 1.3, ez + cz * foot0 * 1.3);
          if (y === y && Math.abs(y - ey) < 0.05) { wy = y; break; }
        }
      }
      if (!(wy === wy)) return;
      const sW = (wy - wk.hub.y) / wk.dir.y;
      if (sW <= 0.005 || sW > wk.len + 0.03) return;
      const px = wk.hub.x + wk.dir.x * sW, pz = wk.hub.z + wk.dir.z * sW;
      const vg = (2 * wk.vi) / (1 + Math.max(0, sW - R) / (3.5 * R));
      const foot = R * (0.75 + 0.35 * Math.min(2, sW / R));
      const ov = waterAt(px, pz) === waterAt(px, pz) ? 1 : 0.6;
      const I = Math.min(1.8, vg * vg * 0.12) * ov;
      if (I < 0.02) return;
      const f = this.forcing(px, pz, vg, ov, I, foot, 0.35, rot, wi, wk);
      f.wy = wy;
      W.forcing.push(f);
      if (!best || I > best.I) best = f;
      coupled++;
    });
    if (W && best) {
      // Keep the roaming field under the strongest wake: move it on once the wake nears its edge (what
      // was rippling there carries over), then put the forcing in its local frame.
      const far = Math.hypot(best.x - W.x, best.z - W.z) > W.span * 0.2;
      if (far || !(Math.abs(best.wy - W.y) < 0.004)) W.place(best.x, best.z, best.wy);
      for (const f of W.forcing) { f.x -= W.x; f.z -= W.z; }
      // A second rotor over other water (a puddle beside the pond) stays out of this field.
      for (let i = W.forcing.length - 1; i >= 0; i--) if (Math.abs(W.forcing[i].wy - W.y) > 0.004) W.forcing.splice(i, 1);
      this.stats.open++;
    }
    this.stats.coupled = coupled;
    this.stats.ms = performance.now() - t0;
  }

  forcing(dx, dz, vg, ov, I, foot, rIn, rot, wi, wk) {
    return {
      x: dx, z: dz, I, vg: vg * ov,
      // Stagnation dimple, q/(ρ_w g) with q = ½ρv², drawn about ×4 (the field settles to ~40% of this).
      depth: Math.min(0.008, 6e-4 * vg * vg) * ov,
      a: Math.min(foot * 0.35, rIn * 0.45),
      ring: Math.max(0.012, Math.min(foot * 0.3, rIn * 0.6)), foot,
      nb: rot.nb, omega: TWO_PI * rot.hz * (wi === 1 ? -1 : 1), phase: wi * 1.7,
      tx: wk.dir.x, tz: wk.dir.z,
    };
  }

  // A little crown of droplets where a big drop lands in liquid (a few a frame at most).
  crown(x, y, z, col) {
    if (this.crowns >= 6) return;
    this.crowns++;
    this.stats.crowns++;
    const n = 3 + (Math.random() < 0.5 ? 1 : 0), a0 = Math.random() * TWO_PI;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TWO_PI, hs = rand(0.06, 0.2);
      this.pool.emit({ p: [x, y + 0.001, z], v: [Math.cos(a) * hs, rand(0.25, 0.55), Math.sin(a) * hs], life: rand(0.25, 0.45),
        size0: rand(0.0007, 0.0011), size1: 0.0006, col0: [col.r, col.g, col.b], alpha: 0.9, grav: 9.81, drag: 0.5, kind: 1 });
    }
  }

  // After the surfaces update: spray, mist and slop off every surface under the wash.
  update(dt) {
    const t0 = performance.now();
    const q = this.view.quality.steam;
    this.crowns = 0;
    for (const s of this.surfaces) {
      if (!s.forcing.length) continue;
      const f = s.forcing[0], c = s.cup;
      // Spray: drops torn off the sheared annulus, thrown radially, low and fast. A few clear the rim.
      const sprayRate = q * 120 * Math.pow(Math.max(0, f.vg - 1.3), 1.5);
      s.sprayAcc = (s.sprayAcc || 0) + dt * sprayRate;
      const col = s.opts.water ? _c.set(s.opts.water.color).multiplyScalar(1.4) : milkyTea(c.brew, c.milk || 0, _c).multiplyScalar(1.25);
      while (s.sprayAcc > 1) {
        s.sprayAcc -= 1;
        // Anywhere on the liquid, weighted to where the outwash shears it; thrown away from the wake's centre.
        const pa = Math.random() * TWO_PI, pr = c.rIn * 0.92 * Math.sqrt(Math.random());
        const x = Math.cos(pa) * pr, z = Math.sin(pa) * pr;
        if (Math.random() > shear(f, x, z)) continue;
        const a = Math.atan2(z - f.z, x - f.x);
        const hs = f.vg * rand(0.12, 0.4), up = Math.random() < 0.16 ? rand(0.6, 1.05) : rand(0.15, 0.55);
        this.pool.emit({ p: [c.x + x, c.waterY + 0.0015, c.z + z], v: [Math.cos(a) * hs + f.tx * f.vg * 0.3, up, Math.sin(a) * hs + f.tz * f.vg * 0.3],
          life: rand(0.5, 0.9), size0: rand(0.0012, 0.0028), size1: 0.0009, col0: [col.r, col.g, col.b], alpha: 0.9, grav: 9.81, drag: 0.8, kind: 1 });
        this.stats.spray++;
      }
      // Slop: the outwash heaps the liquid against the far wall, and in a hard wash it surges up the glaze
      // and over the rim in fat drops and little sheets (onto the saucer, the cloth, the table).
      const surge = Math.min(1.5, 0.35 + s.field.rimSurge * 30);
      const slopRate = q * 34 * Math.pow(Math.max(0, f.vg - 1.6), 1.3) * surge;
      s.slopAcc = (s.slopAcc || 0) + dt * slopRate;
      const off = Math.hypot(f.x, f.z) > c.rIn * 0.2;
      while (s.slopAcc > 1) {
        s.slopAcc -= 1;
        const a = (off ? Math.atan2(-f.z, -f.x) : Math.random() * TWO_PI) + gauss() * 1.1;
        const r = c.rIn * 0.95, hs = rand(0.12, 0.42) + f.vg * 0.05;
        this.pool.emit({ p: [c.x + Math.cos(a) * r, c.waterY + 0.002, c.z + Math.sin(a) * r], v: [Math.cos(a) * hs + f.tx * f.vg * 0.2, rand(0.55, 1.05), Math.sin(a) * hs + f.tz * f.vg * 0.2],
          life: rand(0.6, 1.0), size0: rand(0.0016, 0.0034), size1: 0.0012, col0: [col.r, col.g, col.b], alpha: 0.92, grav: 9.81, drag: 0.5, kind: 1 });
        this.stats.slop++;
      }
      // Mist: the finest spray, light enough to billow out with the wash and hang in the air.
      const mistRate = q * 40 * Math.max(0, f.vg - 1.7);
      s.mistAcc = (s.mistAcc || 0) + dt * mistRate;
      const mc = _mc.copy(col).lerp(MIST, 0.8);
      while (s.mistAcc > 1) {
        s.mistAcc -= 1;
        const pa = Math.random() * TWO_PI, pr = c.rIn * 0.9 * Math.sqrt(Math.random());
        const x = Math.cos(pa) * pr, z = Math.sin(pa) * pr;
        if (Math.random() > shear(f, x, z)) continue;
        const a = Math.atan2(z - f.z, x - f.x);
        this.pool.emit({ p: [c.x + x, c.waterY + 0.003, c.z + z], v: [Math.cos(a) * f.vg * rand(0.06, 0.18), rand(0.08, 0.25), Math.sin(a) * f.vg * rand(0.06, 0.18)],
          life: rand(1.2, 2.4), size0: 0.005, size1: rand(0.022, 0.04), col0: [mc.r, mc.g, mc.b], alpha: 0.17 * Math.min(1, f.I), grav: -0.03, drag: 1.1, kind: 0 });
        this.stats.mist++;
      }
    }
    if (this.open) this.updateOpen(dt, q);
    this.puddleSpray(dt, q);
    this.pool.update(dt, this.floorFn, this.windFn, this.onLand);
    this.spots.update(dt);
    this.stats.ms += performance.now() - t0;
  }

  // Open water: a whole sheet of spray off the annulus, a heavier mist that billows out across the water,
  // and the field itself (stepped here; its shader is the world's water material).
  updateOpen(dt, q) {
    const W = this.open;
    W.update(dt, this.view.time);
    if (!W.forcing.length) return;
    const f = W.forcing[0], col = W.spray;
    const sprayRate = q * 220 * Math.pow(Math.max(0, f.vg - 1.1), 1.5);
    W.sprayAcc = (W.sprayAcc || 0) + dt * sprayRate;
    const reach = f.ring + f.foot * 1.1;
    let tries = 0;
    while (W.sprayAcc > 1 && tries++ < 400) {
      const pa = Math.random() * TWO_PI, pr = reach * Math.sqrt(Math.random());
      const x = f.x + Math.cos(pa) * pr, z = f.z + Math.sin(pa) * pr;
      if (Math.random() > shear(f, x, z)) continue;
      const wy = W.surfaceY(W.x + x, W.z + z);
      if (!(wy === wy)) { W.sprayAcc -= 0.25; continue; }
      W.sprayAcc -= 1;
      const a = Math.atan2(z - f.z, x - f.x);
      const hs = f.vg * rand(0.15, 0.5), up = Math.random() < 0.2 ? rand(0.7, 1.3) : rand(0.15, 0.6);
      this.pool.emit({ p: [W.x + x, wy + 0.0015, W.z + z], v: [Math.cos(a) * hs + f.tx * f.vg * 0.3, up, Math.sin(a) * hs + f.tz * f.vg * 0.3],
        life: rand(0.6, 1.1), size0: rand(0.0014, 0.0034), size1: 0.001, col0: [col.r, col.g, col.b], alpha: 0.85, grav: 9.81, drag: 0.7, kind: 1 });
      this.stats.openSpray++;
    }
    const mistRate = q * 70 * Math.max(0, f.vg - 1.4);
    W.mistAcc = (W.mistAcc || 0) + dt * mistRate;
    const mc = _mc.copy(col).lerp(MIST, 0.75);
    tries = 0;
    while (W.mistAcc > 1 && tries++ < 200) {
      const pa = Math.random() * TWO_PI, pr = reach * Math.sqrt(Math.random());
      const x = f.x + Math.cos(pa) * pr, z = f.z + Math.sin(pa) * pr;
      const wy = W.surfaceY(W.x + x, W.z + z);
      if (!(wy === wy) || Math.random() > shear(f, x, z)) { W.mistAcc -= 0.25; continue; }
      W.mistAcc -= 1;
      const a = Math.atan2(z - f.z, x - f.x);
      this.pool.emit({ p: [W.x + x, wy + 0.004, W.z + z], v: [Math.cos(a) * f.vg * rand(0.1, 0.3), rand(0.05, 0.2), Math.sin(a) * f.vg * rand(0.1, 0.3)],
        life: rand(1.4, 2.8), size0: 0.008, size1: rand(0.03, 0.06), col0: [mc.r, mc.g, mc.b], alpha: 0.16 * Math.min(1, f.I), grav: -0.02, drag: 0.9, kind: 0 });
      this.stats.mist++;
    }
  }

  // Spilt milk and tea lying on the table, the floor or the lawn: a thin film, so no ripple field, but a
  // wash across it strips spray off it like rain off a windscreen.
  puddleSpray(dt, q) {
    const sim = this.view.sim, pds = sim.milk ? sim.milk.puddles : null;
    if (!pds || !pds.length) return;
    for (const wk of sim.air.wakes) {
      if (!wk.active || !(wk.vg > 0.8)) continue;
      const fr = wk.footR;
      for (const pd of pds) {
        if (Math.abs(pd.y - wk.hit.y) > 0.02 || pd.r < 0.004) continue;
        const dx = pd.x - wk.hit.x, dz = pd.z - wk.hit.z, d = Math.hypot(dx, dz);
        if (d > pd.r + fr * 1.4) continue;
        const ov = Math.exp(-((Math.max(0, d - pd.r - fr * 0.3) / fr) ** 2));
        const rate = q * 70 * Math.pow(Math.max(0, wk.vg * ov - 1.0), 1.4) * Math.min(1, pd.r / 0.02);
        pd.washAcc = (pd.washAcc || 0) + dt * rate;
        if (pd.washAcc < 1) continue;
        milkyTea(pd.brew, pd.milk, _c);
        while (pd.washAcc > 1) {
          pd.washAcc -= 1;
          const pa = Math.random() * TWO_PI, pr = pd.r * 0.9 * Math.sqrt(Math.random());
          const x = pd.x + Math.cos(pa) * pr, z = pd.z + Math.sin(pa) * pr;
          const ex = x - wk.hit.x, ez = z - wk.hit.z, e = Math.hypot(ex, ez) + 1e-4;
          const hs = wk.vg * rand(0.15, 0.45);
          this.pool.emit({ p: [x, pd.y + 0.0012, z], v: [ex / e * hs, rand(0.12, 0.5), ez / e * hs], life: rand(0.4, 0.8),
            size0: rand(0.0011, 0.0024), size1: 0.0008, col0: [_c.r, _c.g, _c.b], alpha: 0.92, grav: 9.81, drag: 0.8, kind: 1 });
          this.stats.puddleSpray++;
        }
      }
    }
  }

  clear() {
    this.pool.clear();
    for (const s of this.surfaces) { s.forcing.length = 0; s.field.clear(); }
    if (this.open) this.open.clear();
    this.spots.clear();
  }
}

// Wet spots where spray and slop land on something dry: dark, soft-edged, shrinking as they dry. One
// instanced draw; the oldest spot is reused once they are all taken.
class WetSpots {
  constructor(scene, max) {
    this.max = max;
    this.mat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)', 64), color: 0x2a1d12, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
    this.mat.name = 'liquid-wet-spots';
    this.mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.userData.noAO = true;
    this.mesh.count = 0;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.z = new Float32Array(max);
    this.r = new Float32Array(max); this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.n = 0;
    this.next = 0;
    this.m = new THREE.Matrix4();
  }

  add(x, y, z, r) {
    let i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.n < this.max) this.n++;
    // (Outdoors the garden's patio and lawn are drawn a few millimetres above the ground they stand for.)
    this.x[i] = x; this.y[i] = y + (y < -0.5 ? 0.0032 : 0); this.z[i] = z; this.r[i] = Math.min(0.012, r); this.age[i] = 0; this.life[i] = rand(14, 26);
    // A drop landing beside a wet spot runs into it: grow that one a little too.
    for (let k = 0; k < this.n; k++) if (k !== i && this.age[k] < this.life[k] && Math.hypot(this.x[k] - x, this.z[k] - z) < this.r[k]) { this.r[k] = Math.min(0.02, this.r[k] * 1.08); this.age[k] *= 0.7; }
    this.dirty = true;
  }

  update(dt) {
    if (!this.n) return;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      // Dries in from its edge: full size for a while, then shrinking away.
      const s = t >= 1 ? 0 : this.r[i] * Math.min(1, 1.4 * (1 - t));
      if (s > 0) live++;
      this.m.makeScale(s || 1e-6, 1, s || 1e-6).setPosition(this.x[i], this.y[i] + 0.0004, this.z[i]);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!live) { this.n = 0; this.mesh.count = 0; }
  }

  clear() { this.n = 0; this.next = 0; this.mesh.count = 0; }
}
