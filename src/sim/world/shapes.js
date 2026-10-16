import * as THREE from 'three';
import { FY } from './plan.js';

// Shapes shared by an area's colliders and its meshes, so what you see is what you hit. Each takes a plain
// spec; the render side (src/render/world/kit.js) builds the same thing from the same numbers.

// A closed house (walls, a pitched roof, gables, chimneys). spec:
//   { x0, x1, z0, z1   outer faces of the walls
//     eave             y of the wall tops (the roof starts there)
//     ridgeY           y of the ridge
//     ridge: 'x'|'z'   which way the ridge runs (default 'x', along the street)
//     overhang         eaves overhang (default 0.3)
//     chimneys: [{ u, v, w, d, top }]   centre along the ridge (u) and across it (v, from the ridge line),
//                                      width along / depth across, top y
//     y0               ground (default FY) }
// Returns the roof slabs: [{ cx, cy, cz, hx, hy, hz, quat }] (two slopes, each a thin box).
export function roofSlabs(s) {
  const ov = s.overhang ?? 0.3, alongX = (s.ridge || 'x') === 'x';
  const a0 = alongX ? s.x0 : s.z0, a1 = alongX ? s.x1 : s.z1;      // along the ridge
  const b0 = alongX ? s.z0 : s.x0, b1 = alongX ? s.z1 : s.x1;      // across it
  const bm = (b0 + b1) / 2, half = (b1 - b0) / 2 + ov;
  const rise = (s.ridgeY - s.eave) * (half / ((b1 - b0) / 2));      // keep the pitch out to the overhang
  const eaveY = s.ridgeY - rise;
  const len = Math.hypot(half, rise), pitch = Math.atan2(rise, half);
  const out = [];
  for (const side of [-1, 1]) {
    const cb = bm + side * half / 2, cy = (eaveY + s.ridgeY) / 2 - 0.03;
    const q = new THREE.Quaternion();
    if (alongX) q.setFromEuler(new THREE.Euler(side * pitch, 0, 0));
    else q.setFromEuler(new THREE.Euler(0, 0, -side * pitch));
    const ha = (a1 - a0) / 2 + ov * 0.6;
    out.push(alongX
      ? { cx: (a0 + a1) / 2, cy, cz: cb, hx: ha, hy: 0.035, hz: len / 2, quat: q, eaveY }
      : { cx: cb, cy, cz: (a0 + a1) / 2, hx: len / 2, hy: 0.035, hz: ha, quat: q, eaveY });
  }
  return out;
}

// Gable triangle points (world) at both ends of the ridge: [[p0, p1, p2] x2], each [x, y, z].
export function gables(s) {
  const alongX = (s.ridge || 'x') === 'x';
  const out = [];
  if (alongX) {
    for (const x of [s.x0, s.x1]) out.push([[x, s.eave, s.z0], [x, s.eave, s.z1], [x, s.ridgeY, (s.z0 + s.z1) / 2]]);
  } else {
    for (const z of [s.z0, s.z1]) out.push([[s.x0, s.eave, z], [s.x1, s.eave, z], [(s.x0 + s.x1) / 2, s.ridgeY, z]]);
  }
  return out;
}

// Chimney boxes in world coordinates: [{ cx, cz, hx, hz, y0, top }].
export function chimneys(s) {
  const alongX = (s.ridge || 'x') === 'x';
  return (s.chimneys || []).map((c) => {
    const u = c.u, v = c.v || 0, mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
    const cx = alongX ? u : mx + v, cz = alongX ? mz + v : u;
    return { cx, cz, hx: (alongX ? c.w : c.d) / 2, hz: (alongX ? c.d : c.w) / 2, y0: s.eave, top: c.top };
  });
}

export function houseColliders(w, s, kind = 'house') {
  const y0 = s.y0 ?? FY, hh = (s.eave - y0) / 2;
  w.box((s.x1 - s.x0) / 2, hh, (s.z1 - s.z0) / 2, (s.x0 + s.x1) / 2, y0 + hh, (s.z0 + s.z1) / 2, kind, 'brick');
  for (const r of roofSlabs(s)) w.boxQ(r.hx, r.hy, r.hz, r.cx, r.cy, r.cz, 'roof', 'tile', r.quat);
  for (const g of gables(s)) {
    // A thin wedge: the triangle and a copy pushed inwards a little.
    const alongX = (s.ridge || 'x') === 'x';
    const pts = [];
    for (const p of g) pts.push(...p);
    for (const p of g) pts.push(alongX ? p[0] + (p[0] === s.x0 ? 0.2 : -0.2) : p[0], p[1], alongX ? p[2] : p[2] + (p[2] === s.z0 ? 0.2 : -0.2));
    w.hull(pts, kind, 'brick');
  }
  for (const c of chimneys(s)) w.box(c.hx, (c.top - c.y0 + 1) / 2, c.hz, c.cx, (c.top + c.y0 - 1) / 2, c.cz, 'chimney', 'brick');
}

// A tree: trunk and a canopy of solid balls slightly inside the leaves you see. spec:
//   { x, z, y (ground, default groundY), trunkH (to where the crown starts), trunkR, crown: [[dx, dy, dz, r], ...]
//     (dy from the ground), solid: 0.82 }
export function treeColliders(w, s, kind = 'tree') {
  const y = s.y ?? w.groundY(s.x, s.z);
  w.cyl(s.trunkR, s.trunkH / 2, s.x, y + s.trunkH / 2, s.z, kind, 'wood');
  const k = s.solid ?? 0.82;
  for (const [dx, dy, dz, r] of s.crown) w.ball(r * k, s.x + dx, y + dy, s.z + dz, kind, 'plant');
}

// A straight run of fence, wall or hedge from a to b ([x, z]) of height h; thickness t. gaps: [[from, to]]
// in metres along the run left open (gates, holes). y: ground (default FY).
export function runColliders(w, { a, b, h, t = 0.06, gaps = [], y = FY, kind = 'fence', material = 'wood' }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
  const yaw = Math.atan2(-dz, dx);
  const solid = [];
  let s0 = 0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > s0) solid.push([s0, g0]); s0 = Math.max(s0, g1); }
  if (s0 < len) solid.push([s0, len]);
  for (const [u0, u1] of solid) {
    const um = (u0 + u1) / 2;
    w.box((u1 - u0) / 2, h / 2, t / 2, a[0] + dx * um, y + h / 2, a[1] + dz * um, kind, material, yaw);
  }
}
