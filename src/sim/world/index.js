import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { FY, BOUNDS, PARK, groundHeight } from './plan.js';
import * as house from './house.js';
import * as left from './left.js';
import * as right from './right.js';
import * as street from './street.js';
import * as allotments from './allotments.js';
import * as park from './park.js';

// The neighbourhood's areas (see plan.js). Each area module is DOM-free and exports any of:
//   CUPS: [...]        more cups to brew in (the same fields as layout.js CUPS; standY is what they stand on)
//   STATIONS: [...]    more tea stands ({ ...STATION fields, x, z, y }); pegs point to +z
//   colliders(w)       fixed colliders, built on every device (see the helpers below)
//   create(sim, lite)  dynamic set pieces, exactly like src/sim/extras modules (recorded, applyForces,
//                      afterStep, reset); lite on phones and the low tier: fewer loose bodies
export const AREA_MODULES = { house, left, right, street, allotments, park };

export const WORLD_CUPS = Object.values(AREA_MODULES).flatMap((m) => m.CUPS || []);
export const WORLD_STATIONS = Object.values(AREA_MODULES).flatMap((m) => m.STATIONS || []);

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

// Collider helpers handed to each area's colliders(w). kind names what was hit (crash reports, sounds);
// material is one of wood, metal, stone, brick, tile, glass, plant, cloth, ceramic, rope, plastic, water...
//   w.box(hx, hy, hz, x, y, z, kind, material, yaw = 0)       half extents, centre, turn about y
//   w.boxQ(hx, hy, hz, x, y, z, kind, material, quat)         any orientation
//   w.cyl(r, halfH, x, y, z, kind, material)                  upright cylinder
//   w.ball(r, x, y, z, kind, material)
//   w.rail([x,y,z], [x,y,z], r, kind, material)               capsule between two points (posts, poles, wires)
//   w.hull(points, kind, material)                            convex hull of [x,y,z,...] in world space
//   w.groundY(x, z)                                           the ground's height there
// out (optional) collects every collider made with its footprint, [collider, x, z, radius], for streaming.
export function worldHelpers(addRaw, out = null) {
  let size = 0; // the next collider's footprint radius (helpers set it; a bare add guesses)
  const add = (desc, x, y, z, kind, material, rot) => {
    const c = addRaw(desc, x, y, z, kind, material, rot);
    if (out) out.push([c, x, z, size || 2.5, desc, null, null, y]);
    size = 0;
    return c;
  };
  const box = (hx, hy, hz, x, y, z, kind, material, yaw = 0) => {
    size = Math.hypot(hx, hy, hz);
    return add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, kind, material, yaw ? _q.setFromAxisAngle(_up, yaw).clone() : null);
  };
  return {
    add, box,
    boxQ: (hx, hy, hz, x, y, z, kind, material, quat) => { size = Math.hypot(hx, hy, hz); return add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, kind, material, quat); },
    cyl: (r, hh, x, y, z, kind, material) => { size = Math.hypot(r, hh) + 0.01; return add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, kind, material); },
    ball: (r, x, y, z, kind, material) => { size = r; return add(RAPIER.ColliderDesc.ball(r), x, y, z, kind, material); },
    rail(a, b, r, kind, material) {
      _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = _d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(_up, _d.normalize());
      size = len / 2 + r;
      return add(RAPIER.ColliderDesc.capsule(Math.max(0.0005, len / 2), r), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, kind, material, q);
    },
    hull(pts, kind, material) {
      // Hulls are made in world space at the origin: record where they really are.
      let cx = 0, cy = 0, cz = 0;
      const n = pts.length / 3;
      for (let i = 0; i < pts.length; i += 3) { cx += pts[i] / n; cy += pts[i + 1] / n; cz += pts[i + 2] / n; }
      let r = 0;
      for (let i = 0; i < pts.length; i += 3) r = Math.max(r, Math.hypot(pts[i] - cx, pts[i + 1] - cy, pts[i + 2] - cz));
      const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
      const c = addRaw(desc, 0, 0, 0, kind, material);
      if (out) out.push([c, cx, cz, r, desc, null, null, cy]);
      return c;
    },
    groundY: groundHeight,
  };
}

// Ground beyond the house and garden, the park's rolling terrain, and the walls round the world.
// The flat ground is one slab (the kitchen and garden keep their own floor slab too); the park is a
// heightfield sampled every half metre from groundHeight().
export const PARK_FIELD = { x0: BOUNDS.minX - 1, x1: BOUNDS.maxX + 1, z0: BOUNDS.minZ - 1, z1: PARK.z1 + 1.5, step: 0.5 };

export function buildWorldColliders(add) {
  const w = worldHelpers(add);
  const streamed = [];
  const B = BOUNDS;
  // Flat ground from the park's edge to the far side of the street, round the kitchen and garden's own floor
  // slab (x, z within 6 m of the origin): every loose thing in the garden touching a second, overlapping
  // ground box was a contact pair more for every body, every step.
  const fz0 = PARK.z1 + 0.5, fz1 = B.maxZ + 1, x0 = B.minX - 1, x1 = B.maxX + 1;
  const slab = (ax, az, bx, bz) => w.box((bx - ax) / 2, 0.05, (bz - az) / 2, (ax + bx) / 2, FY - 0.05, (az + bz) / 2, 'ground', 'grass');
  slab(x0, fz0, x1, -6); slab(x0, -6, -6, 6); slab(6, -6, x1, 6); slab(x0, 6, x1, fz1);
  // The park.
  {
    const F = PARK_FIELD;
    const nx = Math.round((F.x1 - F.x0) / F.step), nz = Math.round((F.z1 - F.z0) / F.step);
    // Rapier heightfields are column-major: rows run along z, columns along x, (nrows+1) x (ncols+1) heights.
    const h = new Float32Array((nz + 1) * (nx + 1));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) h[i * (nz + 1) + j] = groundHeight(F.x0 + i * F.step, F.z0 + j * F.step);
    add(RAPIER.ColliderDesc.heightfield(nz, nx, h, { x: F.x1 - F.x0, y: 1, z: F.z1 - F.z0 }), (F.x0 + F.x1) / 2, 0, (F.z0 + F.z1) / 2, 'ground', 'grass');
  }
  // Invisible walls round the world, and a lid.
  const H = B.top - FY + 2, cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2, hx = (B.maxX - B.minX) / 2 + 0.1, hz = (B.maxZ - B.minZ) / 2 + 0.1;
  w.box(0.05, H / 2, hz, B.minX - 0.05, FY + H / 2, cz, 'bounds', 'wood');
  w.box(0.05, H / 2, hz, B.maxX + 0.05, FY + H / 2, cz, 'bounds', 'wood');
  w.box(hx, H / 2, 0.05, cx, FY + H / 2, B.minZ - 0.05, 'bounds', 'wood');
  w.box(hx, H / 2, 0.05, cx, FY + H / 2, B.maxZ + 0.05, 'bounds', 'wood');
  w.box(hx, 0.05, hz, cx, B.top + 0.05, cz, 'bounds', 'wood');
  const ws = worldHelpers(add, streamed);
  for (const m of Object.values(AREA_MODULES)) if (m.colliders) m.colliders(ws);
  return streamed;
}

// Collider streaming. Rapier's step cost grows with every collider in the world (disabled ones too):
// thousands of area colliders made every step about four times dearer. So area colliders exist only near
// something that can touch them: the aircraft (STREAM_R metres plus the collider's own size, in 3D, so the
// floors of the house above or below stay out) and every bag,
// piece of wreckage and hanging load (a metre and a half). The rest are taken out of the world and made again
// from their descriptions when something comes near. Checked a dozen times a second; flight covers well
// under a metre in that time. sim.streamColliders = false keeps them all (the headless route checks sweep the
// whole world).
const STREAM_R = 4;
export class ColliderStreamer {
  constructor(sim, list) {
    this.sim = sim;
    this.list = list;
    this.on = new Uint8Array(list.length).fill(1);
    this.t = 0;
    this.foci = [];
  }
  update(dt, force = false) {
    this.t -= dt;
    if (this.t > 0 && !force) return;
    this.t = 0.08;
    const sim = this.sim, F = this.foci;
    F.length = 0;
    const all = sim.streamColliders === false;
    // The aircraft's reach grows with its speed (it covers speed x 0.08 s between checks, and a crash
    // throws pieces).
    if (sim.heli) { const h = sim.heli, v = h.vel ? h.vel.length() : 0; F.push(h.pos.x, h.pos.z, Math.min(STREAM_R, (h.type === 'micro' ? 1.6 : 2.6) + v * 0.8), h.pos.y); }
    for (const b of sim.cargoItems()) if (b.pos) F.push(b.pos.x, b.pos.z, 1.5, b.pos.y);
    for (const d of sim.debris) { const t = d.body.translation(); F.push(t.x, t.z, 1.5, t.y); }
    const L = this.list, on = this.on;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      let want = all;
      for (let k = 0; !want && k < F.length; k += 4) {
        const dx = e[1] - F[k], dz = e[2] - F[k + 1], dy = e[7] - F[k + 3], r = e[3] + F[k + 2];
        if (dx * dx + dy * dy + dz * dz < r * r) want = true;
      }
      if (want === !!on[i]) continue;
      on[i] = want ? 1 : 0;
      if (want) {
        e[0] = sim.world.createCollider(e[4], e[6]);
        sim.register(e[0], e[5]);
      } else {
        const c = e[0];
        e[5] = sim.colliderInfo.get(c.handle);
        e[6] = c.parent();
        sim.unregister(c);
        sim.world.removeCollider(c, false);
        e[0] = null;
      }
    }
  }

}
