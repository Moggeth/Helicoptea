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
export function worldHelpers(add) {
  const box = (hx, hy, hz, x, y, z, kind, material, yaw = 0) =>
    add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, kind, material, yaw ? _q.setFromAxisAngle(_up, yaw).clone() : null);
  return {
    add, box,
    boxQ: (hx, hy, hz, x, y, z, kind, material, quat) => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, kind, material, quat),
    cyl: (r, hh, x, y, z, kind, material) => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, kind, material),
    ball: (r, x, y, z, kind, material) => add(RAPIER.ColliderDesc.ball(r), x, y, z, kind, material),
    rail(a, b, r, kind, material) {
      _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = _d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(_up, _d.normalize());
      return add(RAPIER.ColliderDesc.capsule(Math.max(0.0005, len / 2), r), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, kind, material, q);
    },
    hull: (pts, kind, material) => add(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)), 0, 0, 0, kind, material),
    groundY: groundHeight,
  };
}

// Ground beyond the house and garden, the park's rolling terrain, and the walls round the world.
// The flat ground is one slab (the kitchen and garden keep their own floor slab too); the park is a
// heightfield sampled every half metre from groundHeight().
export const PARK_FIELD = { x0: BOUNDS.minX - 1, x1: BOUNDS.maxX + 1, z0: BOUNDS.minZ - 1, z1: PARK.z1 + 1.5, step: 0.5 };

export function buildWorldColliders(add) {
  const w = worldHelpers(add);
  const B = BOUNDS;
  // Flat ground from the park's edge to the far side of the street.
  const fz0 = PARK.z1 + 0.5, fz1 = B.maxZ + 1;
  w.box((B.maxX - B.minX) / 2 + 1, 0.05, (fz1 - fz0) / 2, (B.minX + B.maxX) / 2, FY - 0.05, (fz0 + fz1) / 2, 'ground', 'grass');
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
  for (const m of Object.values(AREA_MODULES)) if (m.colliders) m.colliders(w);
}
