import * as THREE from 'three';
import { FY, MAIN, KITCHEN_HALL_DOOR, FRONT_DOOR } from './plan.js';
import { roofSlabs } from './shapes.js';

// The main house: two storeys and a loft in front of the kitchen extension (see MAIN in plan.js).
// This module holds the whole design as data, shared by the colliders (here) and the meshes
// (src/render/world/areas/house.js), so what you see is what you hit:
//   WALL_PIECES  the walls, cut by their openings (axis 'z': a wall running along x; 'x': along z)
//   PARTS        every other solid or decorative piece: boxes, cylinders, balls, rods and sheets with a pose
//   ROOF_PIECES  the roof slabs and the rafter layer under them, cut round the dormer and the roof light
// Fixed colliders are built from all three. Cups and the dining table's tea stand are at the bottom.

const M = MAIN;
export const LV = { gf: M.gf, c1: M.gfCeil, f1: M.ff, c2: M.ffCeil, loft: M.loft, eave: M.eave };
const { gf, c1, f1, c2, loft, eave } = LV;
const IX0 = M.x0, IX1 = M.x1, IZ0 = M.z0, IZ1 = M.z1;      // interior box
const OX0 = M.outer.x0, OX1 = M.outer.x1, OZ0 = M.outer.z0, OZ1 = M.outer.z1;
export const P1 = [-0.65, -0.55];                           // the partition between hall/landing and the rooms
export const STAIR_X1 = -1.55;                              // the stairs' open edge
const KH = KITCHEN_HALL_DOOR, FD = FRONT_DOOR;

// ---------------------------------------------------------------------------------- roof numbers
const SLABS = roofSlabs({ x0: OX0, x1: OX1, z0: OZ0, z1: OZ1, eave, ridgeY: M.ridgeY, overhang: M.overhang });
const RZ = M.ridgeZ, TANP = (M.ridgeY - eave) / ((OZ1 - OZ0) / 2);
const COSP = Math.cos(Math.atan(TANP));
export const PITCH = Math.atan(TANP);
// Top of the roof tiles at depth z (both slopes share the ridge).
export const roofTop = (z) => M.ridgeY + 0.016 - Math.abs(z - RZ) * TANP;
// Underside of the rafters (what you see from the loft).
export const roofUnder = (z) => M.ridgeY - 0.076 - 0.075 - Math.abs(z - RZ) * TANP;

// ---------------------------------------------------------------------------------- walls
export const WALL_PIECES = [];
export function cutRect(r, h) {
  const [a0, a1, y0, y1] = r, [b0, b1, c0, c1_] = h;
  if (b1 <= a0 || b0 >= a1 || c1_ <= y0 || c0 >= y1) return [r];
  const out = [];
  if (b0 > a0) out.push([a0, b0, y0, y1]);
  if (b1 < a1) out.push([b1, a1, y0, y1]);
  const m0 = Math.max(a0, b0), m1 = Math.min(a1, b1);
  if (c0 > y0) out.push([m0, m1, y0, c0]);
  if (c1_ < y1) out.push([m0, m1, c1_, y1]);
  return out;
}
function splitRects(rects, s, ia) {
  return rects.flatMap((r) => (s > r[ia] + 1e-6 && s < r[ia + 1] - 1e-6
    ? [ia === 0 ? [r[0], s, r[2], r[3]] : [r[0], r[1], r[2], s], ia === 0 ? [s, r[1], r[2], r[3]] : [r[0], r[1], s, r[3]]] : [r]));
}
// A wall in the plane axis ('z': thin in z, running along x; 'x': thin in x, running along z), thickness
// t0..t1, from a0..a1 along it and y0..y1 up; holes [a0, a1, y0, y1]; ext 'lo'/'hi' marks the brick side.
function wall(axis, t0, t1, a0, a1, y0, y1, holes = [], o = {}) {
  let rects = [[a0, a1, y0, y1]];
  for (const h of holes) rects = rects.flatMap((r) => cutRect(r, h));
  for (const s of o.asplit || []) rects = splitRects(rects, s, 0);
  for (const s of o.ysplit || []) rects = splitRects(rects, s, 2);
  for (const r of rects) if (r[1] - r[0] > 0.004 && r[3] - r[2] > 0.004) WALL_PIECES.push({ axis, t0, t1, a0: r[0], a1: r[1], y0: r[2], y1: r[3], ext: o.ext || null, gable: !!o.gable });
}

// ---------------------------------------------------------------------------------- openings
// Windows, in world coordinates: face is the way the wall looks out; a0..a1 along the wall (x for front and
// back, z for left and right), y0..y1 up. type: sash (lower sash raised 'lift'), sashShut, casement (the
// leaf at 'open' stands open), casementShut, tophung (swung out 'angle' from the wall), fixed.
export const WINDOWS = [
  { id: 'bay-front', bay: 'front', y0: gf + 0.8, y1: 1.39, type: 'sash', lift: 0.6 },
  { id: 'bay-left', bay: 'left', y0: gf + 0.8, y1: 1.39, type: 'sashShut' },
  { id: 'bay-right', bay: 'right', y0: gf + 0.8, y1: 1.39, type: 'sashShut' },
  { id: 'kids-front', face: 'front', a0: 0.75, a1: 2.05, y0: f1 + 0.9, y1: f1 + 2.1, type: 'casement', open: 'a0', curtain: 0xe2c24a },
  { id: 'stair-front', face: 'front', a0: -1.9, a1: -1.1, y0: f1 + 0.62, y1: c2 - 0.2, type: 'casement', open: 'a1' },
  { id: 'bed-back', face: 'back', a0: 0.65, a1: 1.75, y0: f1 + 0.5, y1: f1 + 1.8, type: 'sash', lift: 0.62, curtain: 0xbfb6d3 },
  { id: 'landing-back', face: 'back', a0: -2.3, a1: -1.7, y0: f1 + 0.9, y1: f1 + 2.0, type: 'casementShut' },
  { id: 'dining-right', face: 'right', a0: 2.95, a1: 4.15, y0: gf + 0.85, y1: gf + 2.1, type: 'sashShut', curtain: 0xb3503d },
  { id: 'bath-right', face: 'right', a0: 5.0, a1: 5.7, y0: f1 + 1.16, y1: f1 + 1.96, type: 'tophung', angle: 1.2, curtain: 0xf0f0e8 },
  { id: 'bed-right', face: 'right', a0: 3.2, a1: 4.0, y0: f1 + 0.8, y1: f1 + 1.95, type: 'sashShut', curtain: 0xbfb6d3 },
  { id: 'landing-left', face: 'left', a0: 2.9, a1: 3.4, y0: f1 + 0.95, y1: f1 + 1.95, type: 'fixed' },
];
const win = (id) => WINDOWS.find((w) => w.id === id);
const winHole = (w) => [w.a0, w.a1, w.y0, w.y1];

// Interior doorways (2 m high, 0.85 wide); the leaf stands open flat against the wall on the 'side' of the
// partition (+1 east), hinged at 'hinge'.
export const DOORWAYS = [
  { id: 'dining', t: P1, a0: 3.0, a1: 3.85, y0: gf, hinge: 'a1', side: 1 },
  { id: 'living', t: P1, a0: 6.5, a1: 7.35, y0: gf, hinge: 'a1', side: 1 },
  { id: 'bedroom', t: P1, a0: 2.7, a1: 3.55, y0: f1, hinge: 'a1', side: 1 },
  { id: 'bathroom', t: P1, a0: 4.9, a1: 5.75, y0: f1, hinge: 'a1', side: -1 },
  { id: 'kids', t: P1, a0: 6.5, a1: 7.35, y0: f1, hinge: 'a1', side: 1 },
];
const doorHole = (id) => { const d = DOORWAYS.find((q) => q.id === id); return [d.a0, d.a1, d.y0, d.y0 + 2.0]; };
export const ARCH = { x0: 1.3, x1: 2.7, top: gf + 2.1 };
export const HATCH = { x0: -1.45, x1: -0.75, z0: 4.4, z1: 5.3 };
export const VOID = { x0: IX0, x1: STAIR_X1, z0: 3.7, z1: IZ1 };    // stairwell void in the first floor
export const BAY = { A: [-0.05, OZ1], B: [2.25, OZ1], C: [0.45, 9.05], D: [1.75, 9.05], sill: 0.8, head: 1.39 };
export const CUPBOARD = { a0: 4.2, a1: 4.8, h: 1.55, ajar: 0.5 };

// Exterior walls (brick outside, plaster inside). The front and back run the full width; the sides fit between.
const YS = [c1, f1, c2];
wall('z', OZ0, IZ0, OX0, OX1, gf, eave,
  [[KH.x0, KH.x1, gf, KH.top], winHole(win('bed-back')), winHole(win('landing-back'))], { ext: 'lo', ysplit: YS, asplit: [-0.65, -0.55] });
wall('z', IZ1, OZ1, OX0, OX1, gf, eave,
  [[FD.x0, FD.x1, gf, FD.top], [BAY.A[0], BAY.B[0], gf, BAY.head], winHole(win('kids-front')), winHole(win('stair-front'))], { ext: 'hi', ysplit: YS, asplit: [-0.65, -0.55] });
wall('x', OX0, IX0, IZ0, IZ1, gf, eave, [winHole(win('landing-left'))], { ext: 'lo', ysplit: YS, asplit: [3.7] });
wall('x', IX1, OX1, IZ0, IZ1, gf, eave, [winHole(win('dining-right')), winHole(win('bath-right')), winHole(win('bed-right'))],
  { ext: 'hi', ysplit: YS, asplit: [4.75, 4.85, 4.6, 4.7, 6.0, 6.1] });
// Interior walls.
wall('x', P1[0], P1[1], IZ0, IZ1, gf, c1, [doorHole('dining'), doorHole('living')], {});
wall('x', P1[0], P1[1], IZ0, IZ1, f1, c2, [doorHole('bedroom'), doorHole('bathroom'), doorHole('kids')], {});
wall('z', 4.75, 4.85, P1[1], IX1, gf, c1, [[ARCH.x0, ARCH.x1, gf, ARCH.top]], {});
wall('z', 4.6, 4.7, P1[1], IX1, f1, c2, [], {});
wall('z', 6.0, 6.1, P1[1], IX1, f1, c2, [], {});
// Gables (strips that follow the roof's underside; the round window is a hole in the left one).
export const GABLE_WIN = { x: -2.525, y: 5.75, z: RZ, r: 0.3 };
function gable(x0, x1, ext, circle) {
  const step = 0.1;
  for (let y = eave; y < M.ridgeY - 0.35; y += step) {
    const y1 = Math.min(y + step, M.ridgeY - 0.35);
    const half = (M.ridgeY - 0.076 - 0.075 - y1) / TANP;      // inside the rafters' underside
    if (half <= 0.05) break;
    let spans = [[RZ - half, RZ + half]];
    if (circle && y1 > circle.y - circle.r && y < circle.y + circle.r) {
      // The smallest hole in the strip: the circle's chord at the strip edge furthest from its centre.
      const dy = Math.max(Math.abs(y - circle.y), Math.abs(y1 - circle.y));
      const c = dy < circle.r ? Math.sqrt(circle.r * circle.r - dy * dy) : 0;
      if (c > 0.01) spans = [[RZ - half, circle.z - c], [circle.z + c, RZ + half]];
    }
    for (const s of spans) wall('x', x0, x1, s[0], s[1], y, y1, [], { ext, gable: true });
  }
}
gable(OX0, IX0, 'lo', GABLE_WIN);
gable(IX1, OX1, 'hi', null);

// ---------------------------------------------------------------------------------- parts
export const PARTS = [];
let G = { x: 0, y: 0, z: 0, yaw: 0 };
const loc = (lx, ly, lz) => [G.x + Math.cos(G.yaw) * lx + Math.sin(G.yaw) * lz, G.y + ly, G.z - Math.sin(G.yaw) * lx + Math.cos(G.yaw) * lz];
// Everything inside fn is placed relative to (x, y, z), turned yaw about y.
export function grp(x, y, z, yaw, fn) {
  const [wx, wy, wz] = loc(x, y, z), prev = G;
  G = { x: wx, y: wy, z: wz, yaw: prev.yaw + yaw };
  fn();
  G = prev;
}
const CM = { wood: 'wood', paint: 'wood', weathered: 'wood', wicker: 'wood', bark: 'wood', fabric: 'cloth', carpet: 'cloth', paper: 'cloth', plaster: 'stone', stone: 'stone', brick: 'brick', roof: 'tile',
  tile: 'tile', ceramic: 'ceramic', enamel: 'ceramic', terracotta: 'ceramic', glass: 'glass', iron: 'metal', steel: 'metal', brass: 'metal', copper: 'metal', zinc: 'metal', rubber: 'plastic',
  glow: 'plastic', leaf: 'plant', petal: 'plant', soil: 'plant' };
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
function quatOf(o) {
  if (o.q) return o.q;
  _e.set(o.rx || 0, (o.yaw || 0) + G.yaw, o.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  return [_q.x, _q.y, _q.z, _q.w];
}
function base(s, mat, col, o) {
  return { s, mat, col, lod: o.lod ?? 1, solid: o.solid ?? true, kind: o.kind || 'house', cm: o.cm || CM[mat] || 'wood', role: o.role || null };
}
// Box: centre (x, y, z) and full size w (x), h (y), d (z). o: yaw, rx, rz, q, lod, solid, kind, cm, role.
export function B(mat, col, x, y, z, w, h, d, o = {}) {
  const [wx, wy, wz] = loc(x, y, z);
  const p = { ...base('b', mat, col, o), x: wx, y: wy, z: wz, hx: w / 2, hy: h / 2, hz: d / 2, q: quatOf(o) };
  PARTS.push(p);
  return p;
}
// Cylinder (r radius, h tall; r2 the top radius for a cone), centre (x, y, z); a tilt (rx, rz) makes its collider a capsule.
export function C(mat, col, x, y, z, r, h, o = {}) {
  const [wx, wy, wz] = loc(x, y, z);
  const p = { ...base('c', mat, col, o), x: wx, y: wy, z: wz, r, hh: h / 2, q: quatOf(o), seg: o.seg || 10, r2: o.r2 ?? r };
  PARTS.push(p);
  return p;
}
// Ball (sy squashes it vertically).
export function O(mat, col, x, y, z, r, o = {}) {
  const [wx, wy, wz] = loc(x, y, z);
  const p = { ...base('o', mat, col, o), x: wx, y: wy, z: wz, r, sy: o.sy ?? 1 };
  PARTS.push(p);
  return p;
}
// A rod from a to b (local points) of radius r.
export function R(mat, col, a, b, r, o = {}) {
  const p = { ...base('r', mat, col, o), a: loc(...a), b: loc(...b), r, seg: o.seg || 7 };
  PARTS.push(p);
  return p;
}
// A flat sheet (decoration only), w x h, facing local +z; drawn double-sided.
export function Pl(mat, col, x, y, z, w, h, o = {}) {
  const [wx, wy, wz] = loc(x, y, z);
  const p = { ...base('p', mat, col, { ...o, solid: false }), x: wx, y: wy, z: wz, w, h, q: quatOf(o) };
  PARTS.push(p);
  return p;
}

// ---------------------------------------------------------------------------------- the roof
const SLAB = SLABS.map((s) => ({ ...s, Rm: new THREE.Matrix4().makeRotationFromQuaternion(s.quat) }));
// A point in the roof slab's local frame (u along the ridge, w off the surface, v down the slope) in the world.
export function slabPoint(i, u, w, v) {
  const s = SLAB[i];
  return new THREE.Vector3(u, w, v).applyMatrix4(s.Rm).add(new THREE.Vector3(s.cx, s.cy, s.cz));
}
export const slabQuat = (i) => SLAB[i].quat;
export const slabV = (i, z) => (z - SLAB[i].cz) / COSP;         // local v of a world z
export const slabU = (i, x) => x - SLAB[i].cx;
// The slab as boxes cut round holes given in world x and z: [x0, x1, z0, z1].
function roofPieces(i, holes, thick, offset) {
  const s = SLAB[i];
  let rects = [[-s.hx, s.hx, -s.hz, s.hz]];
  for (const h of holes) rects = rects.flatMap((r) => cutRect(r, [h[0] - s.cx, h[1] - s.cx, slabV(i, h[2]), slabV(i, h[3])]));
  return rects.filter((r) => r[1] - r[0] > 0.004 && r[3] - r[2] > 0.004).map((r) => {
    const c = slabPoint(i, (r[0] + r[1]) / 2, offset, (r[2] + r[3]) / 2);
    return { x: c.x, y: c.y, z: c.z, hx: (r[1] - r[0]) / 2, hy: thick / 2, hz: (r[3] - r[2]) / 2, q: [s.quat.x, s.quat.y, s.quat.z, s.quat.w] };
  });
}
export const DORMER = { x0: 0.0, x1: 1.3, zf: 2.75, zb: 4.4, lidY: 6.5, win: [0.15, 1.15, 5.25, 6.15] };
export const ROOFLIGHT = { x0: 1.5, x1: 2.2, z0: 6.45, z1: 7.2 };
export const STACK = { x0: 2.5, x1: 3.0, z0: 6.2, z1: 6.8, top: 7.9 };
const slabHoles = [[[DORMER.x0, DORMER.x1, DORMER.zf, DORMER.zb]], [[ROOFLIGHT.x0, ROOFLIGHT.x1, ROOFLIGHT.z0, ROOFLIGHT.z1]]];
export const ROOF_PIECES = [];
for (let i = 0; i < 2; i++) {
  for (const p of roofPieces(i, slabHoles[i], SLAB[i].hy * 2, 0)) ROOF_PIECES.push({ ...p, slab: true, side: i });
  for (const p of roofPieces(i, slabHoles[i], 0.075, -(SLAB[i].hy + 0.0375))) ROOF_PIECES.push({ ...p, slab: false, side: i });
}

// Convex prism: footprint points [x, z] (convex, any order) from y0 to y1.
export function H(mat, col, pts, y0, y1, o = {}) {
  const p = { ...base('h', mat, col, o), pts: pts.map((q) => { const w = loc(q[0], 0, q[1]); return [w[0], w[2]]; }), y0: loc(0, y0, 0)[1], y1: loc(0, y1, 0)[1] };
  PARTS.push(p);
  return p;
}
// A torus ring (decoration only) in the plane facing local +z.
export function Tor(mat, col, x, y, z, R_, r, o = {}) {
  const [wx, wy, wz] = loc(x, y, z);
  const p = { ...base('t', mat, col, { ...o, solid: false }), x: wx, y: wy, z: wz, R: R_, r, q: quatOf(o), seg: o.seg || 16 };
  PARTS.push(p);
  return p;
}

// ---------------------------------------------------------------------------------- palette
const WHITE = 0xf3efe6, CREAM = 0xe6dcc4, OAK = 0xa87c4f, DARKWOOD = 0x5b3d28, WALNUT = 0x6e4a31, PINE = 0xd2ad72, BRASS = 0xd8b45a;
const hidden = { role: 'hidden', lod: 0 };

// ---------------------------------------------------------------------------------- floors
const slab = (x0, x1, z0, z1, y0, y1, mat = 'plaster', col = 0xd8d0c0) =>
  B(mat, col, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, { ...hidden, kind: 'floor' });
// First-floor slab (1.74 to 1.94) with the stairwell void.
slab(IX0, VOID.x1, IZ0, VOID.z0, c1, f1);
slab(VOID.x1, IX1, IZ0, IZ1, c1, f1);
// Loft floor (joists, 4.34 to 4.46) with the hatch.
{
  let rects = [[IX0, IX1, IZ0, IZ1]];
  rects = rects.flatMap((r) => cutRect(r, [HATCH.x0, HATCH.x1, HATCH.z0, HATCH.z1]));
  for (const r of rects) slab(r[0], r[1], r[2], r[3], c2, loft);
}

// ---------------------------------------------------------------------------------- stairs
export const STAIRS = { n: 13, rise: 0.193, go: 0.3, z0: 7.6, x0: IX0, x1: STAIR_X1 };
export const stairTop = (i) => gf + STAIRS.rise * i;
// Height of the stair's nosing line at z (up to the landing at z = 3.7).
export const stairLine = (z) => gf + STAIRS.rise + (STAIRS.z0 - z) * (STAIRS.rise / STAIRS.go);
{
  const S = STAIRS, w = S.x1 - S.x0, xm = (S.x0 + S.x1) / 2;
  for (let i = 1; i <= S.n; i++) {
    const zf = S.z0 - S.go * (i - 1), zb = zf - S.go, top = stairTop(i), zm = (zf + zb) / 2;
    B('paint', 0xf2eee4, xm, top - 0.1, zm, w, 0.2, S.go, { lod: 0, kind: 'stairs' });
    B('wood', 0xb08650, xm, top - 0.015, zm + 0.012, w, 0.03, S.go + 0.025, { lod: 0, solid: false });
    B('fabric', 0x7c3a33, xm + 0.04, top + 0.004, zm + 0.006, 0.62, 0.008, S.go - 0.03, { lod: 1, solid: false });
    // Boxed-in side under the stairs: a wall piece per step, with the cupboard door cut in it.
    const under = top - 0.2;
    if (under > gf + 0.02) wall('x', STAIR_X1 - 0.07, STAIR_X1, zb, zf, gf, under, [[CUPBOARD.a0, CUPBOARD.a1, gf, gf + CUPBOARD.h]], {});
    // Balusters (a panel per step) up to the handrail.
    const rail = stairLine(zf) + 0.9 - 0.045;
    B('paint', WHITE, STAIR_X1 - 0.02, (top + rail) / 2, zm, 0.04, rail - top, S.go, { lod: 1, kind: 'rail', role: 'hidden' });
    for (const dz of [-0.1, 0.0, 0.1]) B('paint', WHITE, STAIR_X1 + 0.002, (top + rail) / 2 + 0.01, zm + dz, 0.035, rail - top, 0.03, { lod: 1, solid: false });
  }
  // Under-stairs cupboard's end wall (under the landing).
  wall('z', 3.7, 3.76, IX0, STAIR_X1 - 0.07, gf, c1, [], {});
  // Handrail and newels.
  const z1 = STAIRS.z0 - S.go * (S.n - 1) - S.go;         // 3.7
  const rx = STAIR_X1 - 0.025;
  R('wood', DARKWOOD, [rx, stairLine(S.z0) + 0.9, S.z0], [rx, stairLine(z1) + 0.9, z1], 0.03, { lod: 1, kind: 'rail', seg: 8 });
  for (const [z, hh] of [[S.z0 + 0.02, 1.05], [z1 + 0.02, 1.05]]) {
    const yb = z > 5 ? gf : f1 - 0.0;
    B('wood', DARKWOOD, rx, yb + hh / 2 + (z > 5 ? 0.0 : 0.0), z, 0.09, hh, 0.09, { lod: 1, kind: 'rail' });
    B('wood', DARKWOOD, rx, yb + hh + 0.025, z, 0.11, 0.05, 0.11, { lod: 1, solid: false });
  }
  // Landing balustrade along the void (to the front wall), with a rail.
  const top = f1 + 0.9 - 0.045;
  B('paint', WHITE, rx, (f1 + top) / 2, (z1 + IZ1) / 2, 0.04, top - f1, IZ1 - z1, { lod: 1, kind: 'rail', role: 'hidden' });
  for (let z = z1 + 0.15; z < IZ1 - 0.05; z += 0.12) B('paint', WHITE, rx + 0.002, (f1 + top) / 2, z, 0.035, top - f1, 0.03, { lod: 1, solid: false });
  R('wood', DARKWOOD, [rx, f1 + 0.9, z1], [rx, f1 + 0.9, IZ1 - 0.01], 0.03, { lod: 1, kind: 'rail', seg: 8 });
  B('wood', DARKWOOD, rx, f1 + 0.5, IZ1 - 0.06, 0.09, 1.0, 0.09, { lod: 1, solid: false });
  B('paint', WHITE, rx, f1 + 0.05, (z1 + IZ1) / 2, 0.05, 0.1, IZ1 - z1, { lod: 1, solid: false });
}
// Cupboard door (ajar into the hall).
grp(STAIR_X1 - 0.035, gf, CUPBOARD.a0, 0, () => {
  const lw = CUPBOARD.a1 - CUPBOARD.a0 - 0.02, a = CUPBOARD.ajar;
  grp(0, 0, 0, a, () => {
    B('paint', 0xb7b19a, 0.02, CUPBOARD.h / 2, lw / 2, 0.035, CUPBOARD.h - 0.02, lw, { lod: 1, kind: 'door', rz: 0 });
    for (const sy of [0.28, 0.72]) B('paint', 0xa8a28c, 0.04, CUPBOARD.h * sy, lw / 2, 0.01, CUPBOARD.h * 0.3, lw * 0.7, { lod: 2, solid: false });
    O('brass', BRASS, 0.055, CUPBOARD.h * 0.5, lw - 0.06, 0.02, { lod: 2, solid: false });
  });
  // Door lining.
  B('paint', WHITE, 0.0, CUPBOARD.h + 0.015, (CUPBOARD.a1 - CUPBOARD.a0) / 2, 0.08, 0.03, CUPBOARD.a1 - CUPBOARD.a0 + 0.1, { lod: 1, solid: false });
  B('paint', WHITE, 0.0, CUPBOARD.h / 2, -0.015, 0.08, CUPBOARD.h, 0.03, { lod: 1, solid: false });
  B('paint', WHITE, 0.0, CUPBOARD.h / 2, CUPBOARD.a1 - CUPBOARD.a0 + 0.015, 0.08, CUPBOARD.h, 0.03, { lod: 1, solid: false });
});

// ---------------------------------------------------------------------------------- windows
const FACE = {
  front: (a0, a1) => ({ cx: (a0 + a1) / 2, cz: (IZ1 + OZ1) / 2, yaw: 0, s: 1, t: OZ1 - IZ1 }),
  back: (a0, a1) => ({ cx: (a0 + a1) / 2, cz: (OZ0 + IZ0) / 2, yaw: Math.PI, s: -1, t: IZ0 - OZ0 }),
  left: (a0, a1) => ({ cx: (OX0 + IX0) / 2, cz: (a0 + a1) / 2, yaw: -Math.PI / 2, s: 1, t: IX0 - OX0 }),
  right: (a0, a1) => ({ cx: (IX1 + OX1) / 2, cz: (a0 + a1) / 2, yaw: Math.PI / 2, s: -1, t: OX1 - IX1 }),
};
const GLASS = 0xdbe9e6, FR = 0.03;
// A glazed sash of x0..x1 by y0..y1 at local depth z: frame, glazing bars, glass, and one hidden collider.
function pane(x0, x1, y0, y1, z, bars = 2, o = {}) {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, fw = 0.04, tr = o.trim ?? WHITE;
  B('paint', tr, cx, y1 - fw / 2, z, w, fw, 0.04, { solid: false });
  B('paint', tr, cx, y0 + fw / 2, z, w, fw, 0.04, { solid: false });
  B('paint', tr, x0 + fw / 2, cy, z, fw, h, 0.04, { solid: false });
  B('paint', tr, x1 - fw / 2, cy, z, fw, h, 0.04, { solid: false });
  for (let i = 1; i < bars; i++) B('paint', tr, x0 + (w * i) / bars, cy, z, 0.018, h - fw, 0.022, { solid: false, lod: 2 });
  B('glass', GLASS, cx, cy, z, w - 2 * fw, h - 2 * fw, 0.005, { solid: false });
  B('glass', 0xffffff, cx, cy, z, w, h, 0.04, { role: 'hidden', lod: 1, cm: 'glass', kind: 'glass' });
}
function windowIn(w, f) {
  const W = w.a1 - w.a0, Hh = w.y1 - w.y0, t = f.t;
  grp(f.cx, w.y0, f.cz, f.yaw, () => windowParts(w, W, Hh, t, f.s, w.curtain));
}
function windowParts(w, W, Hh, t, s, curtain) {
  const iw = W - 2 * FR, ih = Hh - 2 * FR, x0 = -iw / 2, x1 = iw / 2, y0 = FR, y1 = Hh - FR;
  B('paint', WHITE, 0, Hh - FR / 2, 0, W, FR, t);
  B('paint', WHITE, -W / 2 + FR / 2, Hh / 2, 0, FR, Hh, t);
  B('paint', WHITE, W / 2 - FR / 2, Hh / 2, 0, FR, Hh, t);
  B('paint', WHITE, 0, FR / 2, 0, iw, FR, t);
  B('stone', 0xd2cabb, 0, -0.012, t / 2 + 0.05, W + 0.14, 0.05, 0.12, { lod: 1 });          // outside sill
  B('paint', WHITE, 0, FR / 2 + 0.002, -t / 2 - 0.04, W + 0.08, FR, 0.1, { lod: 1 });       // window board inside
  // architraves inside
  const zi = -t / 2 - 0.008;
  B('paint', WHITE, 0, Hh + 0.035, zi, W + 0.16, 0.07, 0.016, { solid: false, lod: 1 });
  B('paint', WHITE, -W / 2 - 0.035, Hh / 2, zi, 0.07, Hh, 0.016, { solid: false, lod: 1 });
  B('paint', WHITE, W / 2 + 0.035, Hh / 2, zi, 0.07, Hh, 0.016, { solid: false, lod: 1 });
  const ty = w.type;
  if (ty === 'sash' || ty === 'sashShut') {
    const mid = (y0 + y1) / 2, lift = ty === 'sash' ? w.lift : 0;
    pane(x0, x1, mid, y1, 0.025, 2);                                    // upper sash (outer track)
    pane(x0, x1, y0 + lift, y0 + lift + (mid - y0) + 0.02, -0.025, 2);  // lower sash (inner track), raised by lift
  } else if (ty === 'casement' || ty === 'casementShut') {
    const half = iw / 2;
    // Local x runs left to right as seen from outside; s says whether world a0 is on the left.
    const openLeft = ty === 'casement' && ((w.open === 'a0') === (s > 0));
    for (const side of [-1, 1]) {
      const hx = side * (iw / 2);
      const open = ty === 'casement' && ((side < 0) === openLeft);
      if (open) {
        // Standing open at right angles, outwards.
        grp(hx, 0, t / 2 + 0.03, 0, () => {
          const fw = 0.04, lw = half - 0.01;
          B('paint', WHITE, -side * 0.015, y1 - fw / 2, lw / 2, 0.035, fw, lw, { solid: false });
          B('paint', WHITE, -side * 0.015, y0 + fw / 2, lw / 2, 0.035, fw, lw, { solid: false });
          B('paint', WHITE, -side * 0.015, (y0 + y1) / 2, 0.02, 0.035, ih, fw, { solid: false });
          B('paint', WHITE, -side * 0.015, (y0 + y1) / 2, lw - 0.02, 0.035, ih, fw, { solid: false });
          B('glass', GLASS, -side * 0.015, (y0 + y1) / 2, lw / 2, 0.005, ih - 0.08, lw - 0.08, { solid: false });
          B('glass', 0xffffff, -side * 0.015, (y0 + y1) / 2, lw / 2, 0.04, ih, lw, { ...hidden, cm: 'glass' });
          B('paint', WHITE, -side * 0.015, (y0 + y1) / 2, lw / 2, 0.02, 0.018, lw, { solid: false, lod: 2 });
        });
      } else pane(side < 0 ? x0 : 0.012, side < 0 ? -0.012 : x1, y0, y1, 0.0, 2);
    }
    B('paint', WHITE, 0, (y0 + y1) / 2, 0.0, 0.026, ih, 0.05, { solid: false });             // mullion
  } else if (ty === 'tophung') {
    const a = w.angle, L = ih - 0.02, pivotY = y1 - 0.01, pz = t / 2 + 0.01;
    const cy = pivotY - (L / 2) * Math.cos(a), cz = pz + (L / 2) * Math.sin(a);
    B('paint', WHITE, 0, cy, cz, iw - 0.01, L, 0.04, { rx: -a, solid: false });
    B('glass', GLASS, 0, cy, cz, iw - 0.1, L - 0.08, 0.006, { rx: -a, solid: false });
    B('glass', 0xffffff, 0, cy, cz, iw, L, 0.04, { rx: -a, ...hidden, cm: 'glass' });
    R('steel', 0xb5b8ba, [-iw / 2 + 0.04, y1 - 0.03, 0.0], [-iw / 2 + 0.04, cy - 0.05, cz - 0.0], 0.006, { solid: false, lod: 2 });
  } else {
    pane(x0, x1, y0, y1, 0.0, 3);
  }
  if (curtain) for (const sx of [-1, 1]) B('fabric', curtain, sx * (W / 2 - 0.09), Hh * 0.5, -t / 2 - 0.05, 0.22, Hh + 0.3, 0.025, { solid: false, lod: 2 });
}
for (const w of WINDOWS) if (w.face) windowIn(w, FACE[w.face](w.a0, w.a1));

// ---------------------------------------------------------------------------------- the bay window
{
  const { A, B: Bp, C: Cp, D, sill, head } = BAY;
  const faces = [
    { id: 'bay-left', p: A, q: Cp, yaw: -Math.PI / 4 }, { id: 'bay-front', p: Cp, q: D, yaw: 0 }, { id: 'bay-right', p: D, q: Bp, yaw: Math.PI / 4 },
  ];
  for (const f of faces) {
    const len = Math.hypot(f.q[0] - f.p[0], f.q[1] - f.p[1]), cx = (f.p[0] + f.q[0]) / 2, cz = (f.p[1] + f.q[1]) / 2;
    const w = win(f.id), t = 0.1;
    grp(cx, gf, cz, f.yaw, () => {
      // Brick sill panel under the glass.
      B('brick', 0xffffff, 0, sill / 2, 0, len, sill, t, { lod: 0, kind: 'house' });
      B('stone', 0xd2cabb, 0, sill + 0.01, 0.0, len + 0.04, 0.03, t + 0.1, { lod: 1 });
    });
    // Windows' own frame sits on the panel: build in a group at the sill height.
    grp(cx, gf + sill, cz, f.yaw, () => windowParts(w, len - 0.16, head - gf - sill, t, 1, f.id === 'bay-front' ? 0xd9a36a : null));
  }
  // Corner posts and the lead roof over the bay.
  for (const p of [A, Bp, Cp, D]) B('paint', WHITE, p[0], (gf + head) / 2, p[1], 0.1, head - gf, 0.1, { lod: 1, solid: p !== A && p !== Bp });
  H('zinc', 0x8d9296, [[A[0] - 0.05, A[1] - 0.05], [Bp[0] + 0.05, Bp[1] - 0.05], [D[0] + 0.1, D[1] + 0.07], [Cp[0] - 0.1, Cp[1] + 0.07]], head, head + 0.07, { lod: 1, kind: 'house' });
}

// ---------------------------------------------------------------------------------- doors
// Interior doorways: lining, architraves and the leaf standing open flat against the wall.
const DOORCOL = 0xf3eee2;
for (const d of DOORWAYS) {
  const tt = d.t[1] - d.t[0], xc = (d.t[0] + d.t[1]) / 2, W = d.a1 - d.a0, zc = (d.a0 + d.a1) / 2, h = 2.0;
  grp(xc, d.y0, zc, Math.PI / 2, () => {
    B('paint', WHITE, 0, h - FR / 2, 0, W, FR, tt);
    B('paint', WHITE, -W / 2 + FR / 2, h / 2, 0, FR, h, tt);
    B('paint', WHITE, W / 2 - FR / 2, h / 2, 0, FR, h, tt);
    for (const sd of [-1, 1]) {
      B('paint', WHITE, 0, h + 0.035, sd * (tt / 2 + 0.008), W + 0.16, 0.07, 0.016, { solid: false, lod: 1 });
      B('paint', WHITE, -W / 2 - 0.035, h / 2, sd * (tt / 2 + 0.008), 0.07, h, 0.016, { solid: false, lod: 1 });
      B('paint', WHITE, W / 2 + 0.035, h / 2, sd * (tt / 2 + 0.008), 0.07, h, 0.016, { solid: false, lod: 1 });
    }
    const lw = W - 0.03, hx = d.hinge === 'a1' ? -W / 2 : W / 2, dir = d.hinge === 'a1' ? -1 : 1;
    const zs = d.side * (tt / 2 + 0.03);
    B('paint', DOORCOL, hx + dir * (lw / 2 + 0.01), h / 2, zs, lw, h - 0.02, 0.04, { kind: 'door' });
    for (const sy of [0.27, 0.74]) B('paint', 0xdbd5c6, hx + dir * (lw / 2 + 0.01), h * sy, zs + d.side * 0.022, lw * 0.68, h * 0.3, 0.012, { solid: false, lod: 2 });
    O('brass', BRASS, hx + dir * (lw - 0.05), h * 0.47, zs + d.side * 0.045, 0.022, { solid: false, lod: 2 });
    R('brass', BRASS, [hx + dir * (lw - 0.05), h * 0.47, zs + d.side * 0.02], [hx + dir * (lw - 0.05), h * 0.47, zs + d.side * 0.045], 0.007, { solid: false, lod: 2 });
  });
}
// The kitchen doorway's hall side: architrave.
{
  const w = KH.x1 - KH.x0, hh = KH.top - gf, zf = IZ0 + 0.012;
  B('paint', WHITE, (KH.x0 + KH.x1) / 2, KH.top + 0.035, zf, w + 0.14, 0.07, 0.024, { solid: false, lod: 1 });
  for (const x of [KH.x0 - 0.035, KH.x1 + 0.035]) B('paint', WHITE, x, gf + hh / 2, zf, 0.07, hh, 0.024, { solid: false, lod: 1 });
}

// ---------------------------------------------------------------------------------- front door, flap, porch
export const FRONT = { z0: IZ1, z1: OZ1, leaf: [FD.x0 + 0.04, FD.x1 - 0.04], top: FD.top - 0.04 };
{
  const col = 0x274a41, zl = IZ1 + 0.1, tl = 0.05;
  const x0 = FRONT.leaf[0], x1 = FRONT.leaf[1], y1 = FRONT.top, fl = FD.flap;
  // Leaf: a rectangle with the flap hole cut out.
  const rects = cutRect([x0, x1, gf, y1], [fl.x0, fl.x1, fl.y0, fl.y1]);
  for (const r of rects) B('paint', col, (r[0] + r[1]) / 2, (r[2] + r[3]) / 2, zl, r[1] - r[0], r[3] - r[2], tl, { lod: 1, kind: 'door' });
  // Lining.
  B('paint', WHITE, (FD.x0 + FD.x1) / 2, FD.top - 0.02, (IZ1 + OZ1) / 2, FD.x1 - FD.x0, 0.04, OZ1 - IZ1, { lod: 1 });
  for (const x of [FD.x0 + 0.02, FD.x1 - 0.02]) B('paint', WHITE, x, (gf + FD.top) / 2, (IZ1 + OZ1) / 2, 0.04, FD.top - gf, OZ1 - IZ1, { lod: 1 });
  // Panels, glazing, furniture.
  for (const sy of [0.2, 0.45]) B('paint', 0x1f3d35, (x0 + x1) / 2, gf + (y1 - gf) * sy, OZ1 - 0.07, (x1 - x0) * 0.66, (y1 - gf) * 0.19, 0.012, { solid: false, lod: 1 });
  for (const sx of [-1, 1]) B('glass', 0xe8c27a, (x0 + x1) / 2 + sx * 0.18, gf + (y1 - gf) * 0.8, OZ1 - 0.075, 0.26, 0.38, 0.008, { solid: false, lod: 1 });
  B('paint', 0x1f3d35, (x0 + x1) / 2, gf + (y1 - gf) * 0.8, OZ1 - 0.07, 0.03, 0.42, 0.014, { solid: false, lod: 2 });
  B('brass', BRASS, (x0 + x1) / 2, gf + (y1 - gf) * 0.56, OZ1 - 0.065, 0.24, 0.045, 0.012, { solid: false, lod: 2 });   // letterbox
  O('brass', BRASS, x1 - 0.1, gf + (y1 - gf) * 0.48, OZ1 - 0.06, 0.03, { solid: false, lod: 2 });
  C('brass', BRASS, (x0 + x1) / 2, gf + (y1 - gf) * 0.67, OZ1 - 0.06, 0.03, 0.012, { rx: Math.PI / 2, solid: false, lod: 2 });
  B('paint', 0xe8e0cc, (x0 + x1) / 2 + 0.2, gf + (y1 - gf) * 0.64, OZ1 - 0.065, 0.07, 0.05, 0.008, { solid: false, lod: 2 });   // house number
  // The dog flap: a frame round the hole and the flap pushed open and up against the top.
  const fx = (fl.x0 + fl.x1) / 2, fw = fl.x1 - fl.x0, fh = fl.y1 - fl.y0;
  B('paint', 0xe3dfd2, fx, fl.y1 + 0.015, OZ1 - 0.085, fw + 0.08, 0.03, 0.04, { lod: 1 });
  B('paint', 0xe3dfd2, fx, fl.y0 - 0.0, OZ1 - 0.085, fw + 0.08, 0.0, 0.04, { lod: 1, solid: false });
  for (const sx of [-1, 1]) B('paint', 0xe3dfd2, fx + sx * (fw / 2 + 0.02), (fl.y0 + fl.y1) / 2, OZ1 - 0.085, 0.04, fh + 0.06, 0.04, { lod: 1, solid: false });
  B('paint', 0x3a3d3f, fx, fl.y1 + 0.012, IZ1 - 0.13, fw - 0.02, 0.01, 0.26, { lod: 1, rx: 0.02, kind: 'flap' });
  B('rubber', 0x2a2b2c, fx, fl.y1 - 0.01, IZ1 + 0.02, fw + 0.02, 0.02, 0.06, { lod: 1, solid: false });
  // Doorstep (flush stone) and boot scraper, and the porch hood on brackets.
  B('stone', 0xb9b2a2, (FD.x0 + FD.x1) / 2, gf + 0.01, OZ1 + 0.28, FD.x1 - FD.x0 + 0.3, 0.02, 0.56, { lod: 1, solid: false });
  const hy = FD.top + 0.28, hw = 1.5, hx = (FD.x0 + FD.x1) / 2;
  B('zinc', 0x7d8185, hx, hy, OZ1 + 0.3, hw, 0.05, 0.72, { lod: 1, rx: 0.22 });
  B('paint', 0x274a41, hx, hy - 0.03 - 0.06, OZ1 + 0.62, hw, 0.08, 0.03, { lod: 1, solid: false });
  for (const sx of [-1, 1]) R('iron', 0x2a2b2c, [hx + sx * (hw / 2 - 0.1), hy - 0.52, OZ1 + 0.02], [hx + sx * (hw / 2 - 0.1), hy - 0.02, OZ1 + 0.55], 0.014, { lod: 1, solid: false });
  for (const sx of [-1, 1]) R('iron', 0x2a2b2c, [hx + sx * (hw / 2 - 0.1), hy - 0.02, OZ1 + 0.02], [hx + sx * (hw / 2 - 0.1), hy - 0.02, OZ1 + 0.6], 0.012, { lod: 1, solid: false });
  // Brass lantern by the door, with a downpipe at each corner.
  B('iron', 0x2b2c2d, FD.x1 + 0.3, FD.top - 0.2, OZ1 + 0.08, 0.1, 0.18, 0.1, { lod: 2, solid: false });
}

// ---------------------------------------------------------------------------------- chimney stack and breasts
{
  const S = STACK, zm = (S.z0 + S.z1) / 2, w = S.x1 - S.x0, d = S.z1 - S.z0;
  B('plaster', 0xe0d0b4, 2.65, (gf + f1) / 2, 6.5, 0.4, f1 - gf, 1.4, { lod: 1, kind: 'chimney' });           // living room breast
  B('plaster', 0xf0e0a8, 2.675, (f1 + c2) / 2, zm, 0.35, c2 - f1, d, { lod: 1, kind: 'chimney' });          // kids' room breast
  B('brick', 0xffffff, (S.x0 + S.x1) / 2, (c2 + S.top) / 2, zm, w, S.top - c2, d, { lod: 0, kind: 'chimney' });
  B('stone', 0xcfc6b4, (S.x0 + S.x1) / 2, S.top - 0.03, zm, w + 0.08, 0.07, d + 0.08, { lod: 1 });
  B('brick', 0xe3c9b8, (S.x0 + S.x1) / 2, S.top - 0.34, zm, w + 0.06, 0.08, d + 0.06, { lod: 1, solid: false });
  for (const dz of [-0.2, 0, 0.2]) {
    C('terracotta', 0xb8643f, 2.86, S.top + 0.16, zm + dz, 0.075, 0.3, { lod: 1, r2: 0.065 });
    C('terracotta', 0xa5532f, 2.86, S.top + 0.32, zm + dz, 0.085, 0.04, { lod: 1, solid: false });
  }
}

// ---------------------------------------------------------------------------------- the loft
const RAF = 0xb59468, TIMBER = 0x8a6b46, DUSTY = 0x9a8e78;
{
  // Rafters under the slabs (the rafter layer is the collider), trimmed round the dormer and the roof light.
  const skip = [[DORMER.x0 - 0.05, DORMER.x1 + 0.05, 0], [ROOFLIGHT.x0 - 0.05, ROOFLIGHT.x1 + 0.05, 1]];
  for (let i = 0; i < 2; i++) {
    for (let x = IX0 + 0.1; x <= IX1; x += 0.46) {
      if (skip.some((s) => s[2] === i && x > s[0] && x < s[1])) continue;
      const c = slabPoint(i, x - SLAB[i].cx, -(SLAB[i].hy + 0.0375), 0);
      const hz = SLAB[i].hz;
      B('wood', RAF, c.x, c.y, c.z, 0.05, 0.075, hz * 2, { q: [SLAB[i].quat.x, SLAB[i].quat.y, SLAB[i].quat.z, SLAB[i].quat.w], solid: false, lod: 1 });
    }
  }
  // Ridge board, purlins, collar ties, posts.
  B('wood', TIMBER, 0.2, M.ridgeY - 0.17, RZ, IX1 - IX0 + 0.3, 0.12, 0.04, { lod: 1 });
  const purlin = (z, x0, x1) => B('wood', TIMBER, (x0 + x1) / 2, roofUnder(z) - 0.075, z, x1 - x0, 0.15, 0.085, { lod: 1, kind: 'timber' });
  purlin(3.6, IX0, DORMER.x0 - 0.1); purlin(3.6, DORMER.x1 + 0.1, IX1);
  purlin(7.15, IX0, ROOFLIGHT.x0 - 0.12); purlin(7.15, ROOFLIGHT.x1 + 0.12, IX1);
  for (const x of [-2.0, -1.0, 0.1, 1.5, 2.6]) {
    B('wood', TIMBER, x, 6.3, RZ, 0.055, 0.1, 2.0, { lod: 1, kind: 'timber' });
  }
  for (const x of [-2.2, 2.4]) for (const z of [3.6, 7.15]) B('wood', TIMBER, x, (loft + roofUnder(z) - 0.15) / 2, z, 0.1, roofUnder(z) - 0.15 - loft, 0.1, { lod: 1, kind: 'timber' });
  // Boarded walkway and insulation on the joists (the floor itself is the collider).
  B('wood', 0xa89170, -0.3, loft + 0.008, 5.0, 4.9, 0.016, 2.3, { lod: 1, solid: false });
  for (const [z0, z1] of [[IZ0, 3.0], [7.8, IZ1]]) B('fabric', 0xd9cf86, 0.2, loft + 0.06, (z0 + z1) / 2, IX1 - IX0, 0.12, z1 - z0, { lod: 1, solid: false });
  // Hatch: lining, the lid propped open on the boards, and the folding ladder.
  const hz = (HATCH.z0 + HATCH.z1) / 2, hxm = (HATCH.x0 + HATCH.x1) / 2, hw = HATCH.x1 - HATCH.x0, hd = HATCH.z1 - HATCH.z0;
  B('paint', WHITE, hxm, (c2 + loft) / 2, HATCH.z0 - 0.02, hw + 0.08, loft - c2, 0.04, { lod: 1, solid: false });
  B('paint', WHITE, hxm, (c2 + loft) / 2, HATCH.z1 + 0.02, hw + 0.08, loft - c2, 0.04, { lod: 1, solid: false });
  for (const x of [HATCH.x0 - 0.02, HATCH.x1 + 0.02]) B('paint', WHITE, x, (c2 + loft) / 2, hz, 0.04, loft - c2, hd + 0.08, { lod: 1, solid: false });
  B('paint', WHITE, -2.0, loft + 0.02, 4.9, 0.7, 0.03, 0.9, { lod: 1 });
  // Ladder from the far edge of the hatch down to the landing (three folded sections, ~70 degrees).
  const lx0 = -1.33, lx1 = -0.87, top = [0, c2 - 0.04, HATCH.z1 - 0.05], foot = [0, f1 + 0.0, HATCH.z1 + 0.78];
  for (const lx of [lx0, lx1]) {
    R('wood', 0xb89a6a, [lx, top[1], top[2]], [lx, foot[1] + 0.02, foot[2]], 0.025, { lod: 1, kind: 'ladder', seg: 5 });
  }
  const nr = 8;
  for (let i = 1; i < nr; i++) {
    const t = i / nr, y = top[1] + (foot[1] - top[1]) * t, z = top[2] + (foot[2] - top[2]) * t;
    R('wood', 0xa98b5c, [lx0, y, z], [lx1, y, z], 0.016, { lod: 1, kind: 'ladder', seg: 5 });
  }
}

// ---------------------------------------------------------------------------------- the dormer (back slope)
{
  const D = DORMER, w = D.x1 - D.x0, xm = (D.x0 + D.x1) / 2, face = D.zf - 0.05, lid = D.lidY;
  const ybot = roofTop(face) - 0.12;
  // Front face with the window cut in it.
  const holeR = [D.win[0], D.win[1], D.win[2], D.win[3]];
  const rects = cutRect([D.x0 - 0.06, D.x1 + 0.06, ybot, lid - 0.07], holeR);
  for (const r of rects) B('brick', 0xe8dccd, (r[0] + r[1]) / 2, (r[2] + r[3]) / 2, face, r[1] - r[0], r[3] - r[2], 0.1, { lod: 0, kind: 'dormer' });
  // Cheeks: a prism of the trapezoid under the lid.
  for (const x of [D.x0 - 0.03, D.x1 + 0.03]) {
    const pts = [];
    for (const [z, y] of [[face - 0.05, ybot], [D.zb, roofTop(D.zb) - 0.1], [D.zb, lid - 0.07], [face - 0.05, lid - 0.07]]) for (const dx of [-0.03, 0.03]) pts.push(x + dx, y, z);
    PARTS.push({ ...base('x', 'brick', 0xe8dccd, { lod: 0, kind: 'dormer' }), pts });
  }
  // Lid (lead), a little fascia, and the window: casements standing open.
  B('zinc', 0x858a8e, xm, lid - 0.035, (face - 0.1 + D.zb) / 2, w + 0.3, 0.07, D.zb - face + 0.1, { lod: 1, kind: 'dormer' });
  B('paint', WHITE, xm, lid - 0.11, face - 0.12, w + 0.3, 0.1, 0.03, { lod: 1, solid: false });
  const wx = (D.win[0] + D.win[1]) / 2, ww = D.win[1] - D.win[0], wh = D.win[3] - D.win[2];
  B('paint', WHITE, wx, D.win[3] - 0.015, face, ww, 0.03, 0.11, { lod: 1 });
  for (const sx of [-1, 1]) B('paint', WHITE, wx + sx * (ww / 2 - 0.015), (D.win[2] + D.win[3]) / 2, face, 0.03, wh, 0.11, { lod: 1 });
  B('zinc', 0x858a8e, wx, D.win[2] - 0.015, face - 0.03, ww + 0.1, 0.03, 0.2, { lod: 1 });                // lead sill
  for (const sx of [-1, 1]) {
    grp(wx + sx * (ww / 2 - 0.03), D.win[2], face - 0.055, 0, () => {
      const lw = ww / 2 - 0.04, ih = wh - 0.01;
      B('paint', WHITE, 0, ih / 2, -lw / 2, 0.035, ih, 0.04, { solid: false, lod: 1 });
      B('paint', WHITE, 0, ih / 2, -lw, 0.035, ih, 0.04, { solid: false, lod: 1 });
      B('paint', WHITE, 0, 0.025, -lw / 2, 0.035, 0.04, lw, { solid: false, lod: 1 });
      B('paint', WHITE, 0, ih - 0.025, -lw / 2, 0.035, 0.04, lw, { solid: false, lod: 1 });
      B('glass', GLASS, 0, ih / 2, -lw / 2, 0.005, ih - 0.08, lw - 0.08, { solid: false, lod: 1 });
      B('glass', 0xffffff, 0, ih / 2, -lw / 2, 0.04, ih, lw, { ...hidden, cm: 'glass' });
    });
  }
  // Inside the dormer: a deep sill shelf under the window, the loft floor side bare.
  B('wood', 0xcfc2a8, wx, D.win[2] + 0.005, face + 0.2, ww + 0.1, 0.02, 0.4, { lod: 1, solid: false });
}

// ---------------------------------------------------------------------------------- roof light (front slope)
{
  const L = ROOFLIGHT, i = 1, u0 = slabU(i, L.x0), u1 = slabU(i, L.x1), v0 = slabV(i, L.z0), v1 = slabV(i, L.z1);
  const qa = slabQuat(i), q = [qa.x, qa.y, qa.z, qa.w];
  const put = (u, w, v, sx, sy, sz, mat, col, extra = {}) => {
    const c = slabPoint(i, u, w, v);
    return B(mat, col, c.x, c.y, c.z, sx, sy, sz, { q, ...extra });
  };
  // Kerb all round (lead-lined timber).
  put((u0 + u1) / 2, 0.08, v0 - 0.03, u1 - u0 + 0.12, 0.1, 0.06, 'paint', 0xdde0e0, { lod: 1 });
  put((u0 + u1) / 2, 0.08, v1 + 0.03, u1 - u0 + 0.12, 0.1, 0.06, 'paint', 0xdde0e0, { lod: 1 });
  for (const u of [u0 - 0.03, u1 + 0.03]) put(u, 0.08, (v0 + v1) / 2, 0.06, 0.1, v1 - v0, 'paint', 0xdde0e0, { lod: 1 });
  // The sash, hinged at its upper edge and propped open flat over the slope above.
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2).premultiply(qa);
  const L2 = (v1 - v0) - 0.04, hingeV = v0 - 0.03, cu = (u0 + u1) / 2;
  const cc = slabPoint(i, cu, 0.07 + (L2 / 2) * Math.sin(0.2), hingeV - L2 / 2 * Math.cos(0.2));
  const sq = [qx.x, qx.y, qx.z, qx.w];
  B('paint', 0xdde0e0, cc.x, cc.y, cc.z, u1 - u0 + 0.04, 0.05, L2, { q: sq, lod: 1, kind: 'rooflight' });
  B('glass', GLASS, cc.x, cc.y + 0.02, cc.z, u1 - u0 - 0.08, 0.008, L2 - 0.1, { q: sq, solid: false, lod: 1 });
}

// ---------------------------------------------------------------------------------- furniture helpers
const hash = (n) => { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const jit = (hex, amt, seed) => {
  const k = 1 + (hash(seed) - 0.5) * 2 * amt;
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
};
const BOOKCOLS = [0x8a3b32, 0x2f4f6b, 0x5b6b3c, 0xb08a3c, 0x6b4a6b, 0x3d5c5c, 0xc9b78a, 0x7a5a3a, 0xa8553f, 0x44506b];
// A run of books standing on a shelf, w wide, up to h tall (a solid block plus the spines).
function books(x, y, z, w, h, seed, o = {}) {
  B('paper', 0x6e5a44, x, y + h * 0.45, z, w, h * 0.9, o.d ?? 0.2, { lod: 1, kind: 'books' });
  let u = -w / 2 + 0.02, i = 0;
  while (u < w / 2 - 0.04) {
    const t = 0.02 + hash(seed + i * 3.1) * 0.035, hh = h * (0.7 + hash(seed + i * 7.7) * 0.3);
    B('paper', jit(BOOKCOLS[(Math.floor(hash(seed + i) * 99) + i) % BOOKCOLS.length], 0.15, seed + i), x + u + t / 2, y + hh / 2, z + (o.d ?? 0.2) / 2 - 0.003, t, hh, 0.012, { lod: 2, solid: false });
    u += t + 0.002; i++;
  }
}
function plant(x, y, z, r = 0.12, h = 0.28, leafH = 0.5, o = {}) {
  C('terracotta', o.potCol ?? 0xb8643f, x, y + h / 2, z, r, h, { lod: 1, r2: r * 0.78, seg: 10 });
  C('terracotta', 0xa5532f, x, y + h - 0.012, z, r * 1.08, 0.03, { lod: 2, solid: false });
  C('soil', 0x4b3a2c, x, y + h - 0.005, z, r * 0.88, 0.02, { lod: 2, solid: false });
  const n = o.n ?? 5;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + hash(x * 7 + z * 3) * 6, rr = r * 1.1 * (i / n + 0.2), hh = leafH * (0.45 + 0.55 * hash(x + i * 5.1));
    O('leaf', jit(o.leafCol ?? 0x4e7a3f, 0.18, x * 5 + i), x + Math.cos(a) * rr, y + h + hh * 0.6, z + Math.sin(a) * rr, r * 1.25 + 0.03 * (i % 3), { lod: 1, sy: hh / (r * 1.6), solid: i < 3 });
  }
}
function picture(x, y, z, yaw, w, h, col, frame = 0x6b4a2f) {
  grp(x, y, z, yaw, () => {
    B('wood', frame, 0, 0, 0, w, h, 0.025, { lod: 2, solid: false });
    B('paper', col, 0, 0, 0.012, w - 0.07, h - 0.07, 0.004, { lod: 2, solid: false });
    B('paper', jit(col, 0.3, x + z), (w - 0.07) * 0.2, -h * 0.12, 0.015, (w - 0.07) * 0.45, (h - 0.07) * 0.4, 0.002, { lod: 2, solid: false });
  });
}
function chair(x, z, yaw, y0 = gf, col = WALNUT, seatCol = 0x9c4a3c) {
  grp(x, y0, z, yaw, () => {
    const sh = 0.45;
    B('wood', col, 0, sh - 0.02, 0, 0.42, 0.04, 0.42, { kind: 'chair' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', col, sx * 0.185, (sh - 0.04) / 2, sz * 0.185, 0.04, sh - 0.04, 0.04, { kind: 'chair' });
    for (const sx of [-1, 1]) B('wood', col, sx * 0.185, sh + 0.22, -0.19, 0.04, 0.46, 0.035, { kind: 'chair' });
    for (const y of [0.1, 0.22, 0.34]) B('wood', col, 0, sh + y, -0.19, 0.34, 0.06, 0.025, { kind: 'chair' });
    B('fabric', seatCol, 0, sh + 0.005, 0.0, 0.37, 0.035, 0.37, { solid: false, lod: 2 });
  });
}
function sofa(x, z, yaw, len, col, o = {}) {
  const d = o.d ?? 0.9, y0 = o.y0 ?? gf, n = Math.max(1, Math.round(len / 0.65));
  grp(x, y0, z, yaw, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) C('wood', DARKWOOD, sx * (len / 2 - 0.08), 0.05, sz * (d / 2 - 0.08), 0.03, 0.1, { lod: 1, r2: 0.022, solid: false });
    B('fabric', col, 0, 0.1 + 0.16, 0.0, len, 0.32, d, { kind: 'sofa' });
    for (const sx of [-1, 1]) B('fabric', jit(col, 0.06, x), sx * (len / 2 - 0.1), 0.1 + 0.27, 0.0, 0.2, 0.54, d, { kind: 'sofa' });
    B('fabric', jit(col, 0.05, z), 0, 0.1 + 0.39, -d / 2 + 0.11, len - 0.4, 0.78, 0.22, { kind: 'sofa' });
    for (let i = 0; i < n; i++) {
      const cw = (len - 0.4) / n, cx = -(len - 0.4) / 2 + cw * (i + 0.5);
      B('fabric', jit(col, 0.1, i + x), cx, 0.42 + 0.06, 0.1, cw - 0.015, 0.12, d - 0.3, { solid: false, lod: 1 });
      B('fabric', jit(col, 0.1, i + z), cx, 0.42 + 0.3, -d / 2 + 0.3, cw - 0.03, 0.4, 0.14, { solid: false, lod: 1, rx: -0.18 });
    }
    for (const [sx, c] of [[-1, 0xd9b45a], [1, 0x5b7b8c]]) if (len > 1.3 || sx < 0) B('fabric', c, sx * (len / 2 - 0.3), 0.62, 0.1, 0.34, 0.3, 0.12, { solid: false, lod: 2, rx: -0.3, rz: sx * 0.2 });
  });
}
// A rectangular table of top size w x d, top surface h above y0.
function table(x, z, yaw, w, d, h, col, o = {}) {
  const y0 = o.y0 ?? gf, th = o.th ?? 0.04, lg = o.leg ?? 0.06;
  grp(x, y0, z, yaw, () => {
    B('wood', col, 0, h - th / 2, 0, w, th, d, { kind: o.kind || 'table' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', jit(col, 0.05, sx + sz), sx * (w / 2 - lg / 2 - 0.04), (h - th) / 2, sz * (d / 2 - lg / 2 - 0.04), lg, h - th, lg, { kind: o.kind || 'table' });
    if (!o.noApron) {
      B('wood', col, 0, h - th - 0.05, d / 2 - 0.06, w - 0.14, 0.1, 0.02, { solid: false, lod: 1 });
      B('wood', col, 0, h - th - 0.05, -d / 2 + 0.06, w - 0.14, 0.1, 0.02, { solid: false, lod: 1 });
    }
  });
}
function lampShade(x, y, z, r, h, col = 0xf2dca0, o = {}) {
  C('glow', col, x, y, z, (r + (o.r2 ?? r * 0.7)) / 2, h, { lod: 1, r2: o.r2 ?? r * 0.7, seg: 12, solid: o.solid ?? true });
}
function tableLamp(x, y, z, shadeCol = 0xf2dca0, baseCol = 0x4f6f78, s = 1) {
  C('ceramic', baseCol, x, y + 0.09 * s, z, 0.06 * s, 0.18 * s, { lod: 1, r2: 0.04 * s });
  C('brass', BRASS, x, y + 0.2 * s, z, 0.012 * s, 0.1 * s, { lod: 2, solid: false });
  lampShade(x, y + 0.31 * s, z, 0.15 * s, 0.2 * s, shadeCol);
}
function cushionPile(x, y, z, cols) {
  cols.forEach((c, i) => B('fabric', c, x + i * 0.02, y + 0.07 + i * 0.1, z, 0.3 - i * 0.02, 0.1, 0.3, { solid: false, lod: 2, yaw: i * 0.4 }));
}
const mugCol = [0xc9663e, 0x2f4f6b, 0xe9d6c4, 0x7f9c8a, 0xd8b45a];
function mug(x, y, z, i = 0, solid = false) {
  C('ceramic', mugCol[i % mugCol.length], x, y + 0.045, z, 0.04, 0.09, { lod: 2, solid, r2: 0.036, kind: 'ware' });
}
function teapot(x, y, z, yaw = 0, col = 0xf2ece0) {
  grp(x, y, z, yaw, () => {
    O('ceramic', col, 0, 0.075, 0, 0.1, { lod: 1, sy: 0.85, kind: 'ware' });
    C('ceramic', col, 0, 0.17, 0, 0.04, 0.03, { lod: 2, solid: false });
    O('ceramic', col, 0, 0.19, 0, 0.018, { lod: 2, solid: false });
    R('ceramic', col, [0.08, 0.06, 0], [0.17, 0.12, 0], 0.016, { lod: 2, solid: false });
    R('ceramic', col, [-0.08, 0.07, 0], [-0.15, 0.1, 0], 0.012, { lod: 2, solid: false });
    R('ceramic', col, [-0.15, 0.1, 0], [-0.14, 0.15, 0], 0.01, { lod: 2, solid: false });
  });
}

// ---------------------------------------------------------------------------------- the hall
{
  const cx = -1.1;
  // Floor coverings (chequered tiles are drawn by the room): a doormat with post, a runner.
  B('fabric', 0x4d4034, -1.5, gf + 0.012, 8.1, 0.82, 0.014, 0.52, { solid: false, lod: 1 });
  for (const [dx, dz, c, r] of [[-1.65, 8.05, 0xf1ecdd, 0.2], [-1.45, 8.12, 0xd8dfe8, -0.3], [-1.3, 8.0, 0xe9d3a5, 0.5]]) B('paper', c, dx, gf + 0.022, dz, 0.2, 0.004, 0.12, { solid: false, lod: 2, yaw: r });
  B('fabric', 0x8c3a30, cx + 0.05, gf + 0.014, 5.3, 0.62, 0.012, 4.9, { solid: false, lod: 1 });
  B('fabric', 0xc9a24a, cx + 0.05, gf + 0.0155, 5.3, 0.5, 0.003, 4.78, { solid: false, lod: 2 });
  // Console table on the party wall with a mirror, lamp, bowl and keys.
  table(-0.8, 4.75, Math.PI / 2, 0.9, 0.3, 0.82, WALNUT, { th: 0.035, leg: 0.045, kind: 'console' });
  B('wood', WALNUT, -0.8, gf + 0.55, 4.75, 0.26, 0.2, 0.84, { lod: 1, kind: 'console' });
  B('brass', BRASS, -0.69, gf + 0.55, 4.75, 0.01, 0.02, 0.12, { lod: 2, solid: false });
  tableLamp(-0.82, gf + 0.82, 4.45, 0xf0d8a0, 0x6f8a86, 0.9);
  C('ceramic', 0xd9d2c0, -0.85, gf + 0.855, 5.0, 0.08, 0.05, { lod: 2, r2: 0.06, solid: false });
  B('iron', 0x2b2c2d, -0.85, gf + 0.885, 5.0, 0.04, 0.005, 0.02, { lod: 2, solid: false });
  B('wood', 0xa07b4f, -0.67, gf + 1.55, 4.75, 0.025, 0.7, 0.55, { lod: 1, solid: false });
  B('glass', 0xc9d6d6, -0.682, gf + 1.55, 4.75, 0.008, 0.62, 0.47, { lod: 1, solid: false });
  // Radiator under the stairs end of the hall wall.
  for (let i = 0; i < 7; i++) B('enamel', 0xf0efe9, -0.7, gf + 0.37, 5.45 + i * 0.06, 0.06, 0.52, 0.045, { lod: 1, solid: i === 0 || i === 6, kind: 'radiator' });
  B('enamel', 0xf0efe9, -0.7, gf + 0.38, 5.62, 0.06, 0.5, 0.36, { lod: 1, kind: 'radiator' });
  // Coat rail by the front door: hooks, coats, a scarf, a hat; the shoe rack under it; umbrella stand.
  B('wood', 0x8a6a48, -0.675, gf + 1.6, 7.8, 0.025, 0.1, 0.9, { lod: 1, solid: false });
  const coats = [[7.5, 0x4d5b6b, 0.62, 0.0], [7.72, 0x8a6a48, 0.7, 0.1], [7.95, 0x7a3b36, 0.55, -0.1], [8.15, 0xcfbf9a, 0.6, 0.0]];
  coats.forEach(([z, c, hh, tilt], i) => {
    R('brass', BRASS, [-0.69, gf + 1.58, z], [-0.72, gf + 1.62, z], 0.008, { lod: 2, solid: false });
    B('fabric', c, -0.78, gf + 1.5 - hh / 2, z, 0.2, hh, 0.22 + (i % 2) * 0.04, { lod: 1, rz: tilt * 0.4, kind: 'coat' });
    B('fabric', jit(c, 0.2, i), -0.77, gf + 1.5 - hh * 0.9, z, 0.24, 0.06, 0.2, { lod: 2, solid: false });
  });
  B('fabric', 0xb8423a, -0.745, gf + 1.45, 7.62, 0.04, 0.4, 0.06, { lod: 2, solid: false });
  C('fabric', 0x3d4a52, -0.74, gf + 1.67, 8.28, 0.1, 0.07, { lod: 2, solid: false });
  // Shoe rack.
  grp(-0.83, gf, 7.75, 0, () => {
    for (const y of [0.0, 0.2, 0.4]) B('wood', 0x9b7a52, 0, y + 0.015, 0, 0.3, 0.025, 0.6, { lod: 1, kind: 'rack' });
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) B('wood', 0x9b7a52, sx * 0.14, 0.2, sz * 0.29, 0.025, 0.4, 0.025, { lod: 1, kind: 'rack' });
    [[0x2b2c2d, -0.15], [0x7a4a2f, 0.0], [0x3d4a6b, 0.15], [0xb8423a, 0.22]].forEach(([c, z], k) => {
      B('rubber', c, -0.03, 0.045 + (k % 3) * 0.2, z, 0.1, 0.075, 0.26, { lod: 2, solid: false, yaw: 0.1 * k });
    });
  });
  // Umbrella stand in the corner, three umbrellas.
  C('enamel', 0x274a41, -0.82, gf + 0.27, 8.2, 0.095, 0.54, { lod: 1, r2: 0.085, kind: 'stand' });
  for (const [dx, dz, c, tilt] of [[-0.03, 0.02, 0x2b2c2d, 0.15], [0.03, -0.03, 0x7a3b36, -0.1], [0.0, 0.04, 0x3d4a6b, 0.05]]) {
    R('wood', 0x7a5a3a, [-0.82 + dx, gf + 0.3, 8.2 + dz], [-0.82 + dx + tilt * 0.4, gf + 1.0, 8.2 + dz], 0.012, { lod: 2, solid: false });
    R('fabric', c, [-0.82 + dx + tilt * 0.4, gf + 0.55, 8.2 + dz], [-0.82 + dx + tilt * 0.38, gf + 0.98, 8.2 + dz], 0.026, { lod: 2, solid: false });
  }
  // Pendant with a glass shade, pictures along the stairs, a barometer, a long case clock under the landing.
  lampShade(-1.1, c1 - 0.3, 5.5, 0.17, 0.2, 0xf0e4c4);
  R('iron', 0x2b2c2d, [-1.1, c1 - 0.2, 5.5], [-1.1, c1, 5.5], 0.006, { lod: 2, solid: false });
  C('paint', WHITE, -1.1, c1 - 0.012, 5.5, 0.09, 0.024, { lod: 2, solid: false });
  picture(-0.66, gf + 1.45, 6.0, -Math.PI / 2, 0.5, 0.4, 0x6f8a86, 0xb8964f);
  picture(-0.66, gf + 1.5, 3.4, -Math.PI / 2, 0.3, 0.4, 0xb9855a);
  picture(-2.44, stairLine(6.4) + 1.25, 6.4, Math.PI / 2, 0.7, 0.5, 0x8aa07a, 0xb8964f);
  picture(-2.44, stairLine(5.2) + 1.3, 5.2, Math.PI / 2, 0.4, 0.5, 0xc9a24a);
  picture(-2.44, stairLine(4.2) + 1.35, 4.2, Math.PI / 2, 0.45, 0.6, 0x8c6a8a);
  picture(-2.44, stairLine(7.5) + 1.3, 7.5, Math.PI / 2, 0.45, 0.35, 0x6b7b8c);
  // Clock case (tall, under the landing, against the end wall).
  grp(-2.15, gf, 2.62, 0, () => {
    B('wood', DARKWOOD, 0, 0.9, 0, 0.3, 1.8, 0.2, { lod: 1, kind: 'clock' });
    B('wood', 0x4a3020, 0, 1.55, 0.105, 0.2, 0.2, 0.01, { lod: 2, solid: false });
    C('paper', 0xf1ecdd, 0, 1.55, 0.112, 0.085, 0.006, { lod: 2, solid: false, rx: Math.PI / 2 });
    B('glass', 0xc9d6d6, 0, 0.85, 0.105, 0.17, 0.62, 0.006, { lod: 2, solid: false });
    C('brass', BRASS, 0, 0.55, 0.112, 0.035, 0.008, { lod: 2, solid: false, rx: Math.PI / 2 });
  });
}

// ---------------------------------------------------------------------------------- under the stairs
{
  // A vacuum cleaner, boots, an ironing board and a basket in the cupboard.
  grp(-2.1, gf, 4.5, 0.3, () => {
    C('enamel', 0xb8423a, 0, 0.12, 0, 0.13, 0.24, { lod: 1, r2: 0.12, kind: 'hoover' });
    C('enamel', 0x3d3f41, 0, 0.27, 0, 0.1, 0.06, { lod: 2, solid: false });
    R('steel', 0xb5b8ba, [0, 0.3, 0], [0.05, 0.95, -0.05], 0.015, { lod: 1, kind: 'hoover', seg: 6 });
    B('iron', 0x2b2c2d, 0.06, 0.97, -0.05, 0.12, 0.03, 0.04, { lod: 2, solid: false });
    R('rubber', 0x2b2c2d, [0.1, 0.2, 0.0], [0.4, 0.03, 0.15], 0.012, { lod: 2, solid: false });
  });
  for (const [x, z, y] of [[-2.2, 5.3, 0], [-2.1, 5.45, 0.2]]) C('rubber', 0x2b3a2b, x, gf + 0.15, z + y, 0.06, 0.3, { lod: 2, kind: 'boot' });
  B('wicker', 0xb89a62, -2.2, gf + 0.14, 6.1, 0.4, 0.28, 0.5, { lod: 1, kind: 'basket' });
  B('wood', 0xc7b48a, -2.42, gf + 0.55, 4.6, 0.04, 1.1, 0.4, { lod: 1, rz: 0.08, kind: 'board' });
  B('paper', 0xb08a5a, -2.1, gf + 0.16, 7.0, 0.5, 0.32, 0.4, { lod: 2, kind: 'box' });
}

// ---------------------------------------------------------------------------------- the dining room
export const DINING = { table: { x: 1.0, z: 3.6, w: 1.7, d: 0.8, top: gf + 0.76 }, stand: { x: 1.55, z: 3.86 } };
{
  const T = DINING.table;
  // Rug under the table, table, runner, bowl, vase, candlesticks, placemats.
  B('fabric', 0x7b3f3a, T.x, gf + 0.012, T.z, 2.5, 0.014, 1.7, { solid: false, lod: 1 });
  B('fabric', 0xc9a24a, T.x, gf + 0.0165, T.z, 2.3, 0.004, 1.5, { solid: false, lod: 2 });
  B('fabric', 0x5b6b4f, T.x, gf + 0.0185, T.z, 2.1, 0.004, 1.3, { solid: false, lod: 2 });
  table(T.x, T.z, 0, T.w, T.d, 0.76, 0x9c7048, { th: 0.045, leg: 0.07, kind: 'diningtable' });
  B('fabric', 0xe9e2cf, T.x + 0.1, 0.004, T.z, 1.3, 0.006, 0.34, { solid: false, lod: 2 });
  C('ceramic', 0xd9d2c0, 1.25, 0.04, 3.65, 0.13, 0.06, { lod: 2, r2: 0.09, solid: false });
  for (const [dx, dz, c] of [[-0.04, 0.0, 0xc0453a], [0.04, 0.03, 0x6b8f3a], [0.0, -0.05, 0xd8a53a], [0.05, -0.04, 0xc0453a]]) O('petal', c, 1.25 + dx, 0.09, 3.65 + dz, 0.04, { lod: 2, solid: false });
  C('glass', 0xdbe9e6, 1.62, 0.1, 3.5, 0.04, 0.2, { lod: 2, r2: 0.03, solid: false });
  for (const [dx, c] of [[-0.02, 0xe8c24a], [0.02, 0xd9d2c0], [0.0, 0xcf6a5a]]) O('petal', c, 1.62 + dx, 0.24, 3.5, 0.035, { lod: 2, solid: false });
  for (const x of [0.85, 1.05]) { C('brass', BRASS, x, 0.07, 3.75, 0.02, 0.14, { lod: 2, r2: 0.012, solid: false }); C('paper', 0xf1ecdd, x, 0.2, 3.75, 0.01, 0.1, { lod: 2, solid: false }); }
  for (const [x, z, yw] of [[0.5, 3.88, Math.PI], [1.0, 3.88, Math.PI], [0.5, 3.32, 0], [1.0, 3.32, 0], [1.5, 3.32, 0]]) {
    C('ceramic', 0xf3efe6, x, 0.008, z, 0.1, 0.012, { lod: 2, solid: false });
    B('fabric', 0xb8423a, x - 0.18, 0.004, z, 0.05, 0.004, 0.2, { lod: 2, solid: false });
    void yw;
  }
  // Six chairs, pulled in at the table (north side faces +z, south side faces -z), a couple turned out a little.
  [[0.45, 3.1, 0.04], [1.0, 3.02, -0.06], [1.55, 3.12, 0.02]].forEach(([x, z, a], i) => chair(x, z, a, gf, i === 1 ? 0x7a5236 : WALNUT, [0x9c4a3c, 0x5b6b4f, 0x9c4a3c][i]));
  [[0.45, 4.1, Math.PI + 0.03], [1.0, 4.18, Math.PI - 0.1]].forEach(([x, z, a], i) => chair(x, z, a, gf, i === 1 ? 0x7a5236 : WALNUT, [0x5b6b4f, 0x9c4a3c, 0x5b6b4f][i]));
  // Pendant light over the table.
  lampShade(0.8, 1.02, 3.6, 0.24, 0.17, 0xf0dca0, { r2: 0.07 });
  R('iron', 0x2b2c2d, [0.8, 1.1, 3.6], [0.8, c1, 3.6], 0.005, { lod: 2, solid: false });
  C('paint', WHITE, 0.8, c1 - 0.012, 3.6, 0.1, 0.024, { lod: 2, solid: false });
  // Sideboard under the window, with a lamp, frames, plates and a bowl.
  grp(2.62, gf, 3.55, Math.PI / 2, () => {
    B('wood', 0x6b4a31, 0, 0.4, 0, 1.2, 0.76, 0.43, { lod: 1, kind: 'sideboard' });
    B('wood', 0x7d5a3c, 0, 0.785, 0, 1.24, 0.03, 0.47, { lod: 1, solid: false });
    for (const x of [-0.3, 0.3]) B('wood', 0x5c3f29, x, 0.4, 0.222, 0.56, 0.66, 0.012, { lod: 2, solid: false });
    for (const x of [-0.3, 0.3]) O('brass', BRASS, x, 0.45, 0.235, 0.015, { lod: 2, solid: false });
    for (const x of [-0.58, 0.58]) B('wood', 0x4f3623, x, 0.05, 0.0, 0.05, 0.1, 0.38, { lod: 2, solid: false });
    tableLamp(-0.48, 0.8, 0.0, 0xf0d8a0, 0x9c4a3c);
    B('wood', 0xa07b4f, -0.1, 0.9, -0.1, 0.2, 0.28, 0.02, { lod: 2, solid: false, rx: -0.2 });
    B('paper', 0xaab8c2, -0.1, 0.9, -0.09, 0.16, 0.22, 0.004, { lod: 2, solid: false, rx: -0.2 });
    C('ceramic', 0xe9e4d8, 0.25, 0.95, 0.0, 0.12, 0.28, { lod: 2, r2: 0.09, rx: Math.PI / 2, solid: false });
    for (let i = 0; i < 5; i++) C('ceramic', i % 2 ? 0xdde7ee : 0xf3efe6, 0.3, 0.84 + i * 0.012, 0.02, 0.1 - i * 0.004, 0.01, { lod: 2, solid: false });
    C('ceramic', 0xc9663e, 0.58, 0.83, -0.08, 0.07, 0.07, { lod: 2, r2: 0.05, solid: false });
    O('ceramic', 0x7f9c8a, 0.58, 0.88, -0.08, 0.03, { lod: 2, solid: false });
  });
  // China cabinet against the cross wall, with plates and cups behind glass.
  grp(0.15, gf, 4.52, Math.PI, () => {
    B('wood', 0x6e4a31, 0, 0.99, 0, 1.0, 1.98, 0.4, { lod: 1, kind: 'cabinet' });
    B('wood', 0x5c3f29, 0, 0.4, 0.205, 0.9, 0.72, 0.012, { lod: 2, solid: false });
    B('glass', 0xdce8e6, 0, 1.35, 0.205, 0.86, 0.9, 0.008, { lod: 2, solid: false });
    for (const y of [0.98, 1.3, 1.62]) {
      B('wood', 0x8a6a48, 0, y, 0.01, 0.9, 0.02, 0.34, { lod: 2, solid: false });
      for (let i = 0; i < 6; i++) C('ceramic', i % 3 ? 0xf3efe6 : 0x6f8aa8, -0.36 + i * 0.145, y + 0.1, 0.1, 0.07, 0.012, { lod: 2, solid: false, rx: Math.PI / 2 - 0.2, rz: 0 });
    }
  });
  // Plants in the corners, a radiator and pictures.
  plant(2.62, gf, 2.62, 0.15, 0.36, 0.95, { leafCol: 0x4a7a46 });
  plant(-0.28, gf + 0.0, 4.5, 0.1, 0.22, 0.4);
  for (let i = 0; i < 8; i++) B('enamel', 0xf0efe9, -0.58, gf + 0.38, 2.45 + i * 0.055, 0.04, 0.52, 0.04, { lod: 1, solid: i === 0 || i === 7, kind: 'radiator' });
  B('enamel', 0xf0efe9, -0.58, gf + 0.38, 2.66, 0.04, 0.5, 0.4, { lod: 1, kind: 'radiator' });
  picture(0.9, gf + 1.45, 2.36, 0, 0.8, 0.55, 0x7a9a8c, 0xb8964f);
  picture(2.0, gf + 1.5, 2.36, 0, 0.4, 0.5, 0xc9a24a);
  picture(-0.54, gf + 1.5, 4.3, Math.PI / 2, 0.35, 0.45, 0x8a6a8c);
  C('paint', WHITE, 0.3, c1 - 0.012, 3.6, 0.12, 0.024, { lod: 2, solid: false });
}

// ---------------------------------------------------------------------------------- the living room
{
  // Rug and sofa, armchairs, coffee table with teapot, bookcases, TV, standard lamp, plants.
  B('fabric', 0x6f5a52, 1.0, gf + 0.012, 6.5, 2.35, 0.014, 1.7, { solid: false, lod: 1 });
  B('fabric', 0xc2a37b, 1.0, gf + 0.0165, 6.5, 2.15, 0.004, 1.5, { solid: false, lod: 2 });
  B('fabric', 0x7a8f86, 1.0, gf + 0.0185, 6.5, 1.85, 0.004, 1.2, { solid: false, lod: 2 });
  sofa(0.55, 5.3, 0, 1.3, 0x5f7a63, { d: 0.88 });
  sofa(1.95, 5.4, -0.5, 0.95, 0x9a5a4a, { d: 0.9 });
  sofa(0.15, 7.75, Math.PI * 0.8, 0.95, 0x9a5a4a, { d: 0.9 });
  // Coffee table, teapot, biscuits, a magazine.
  grp(0.95, gf, 6.45, 0, () => {
    B('wood', 0x7d5a3c, 0, 0.43, 0, 1.0, 0.04, 0.55, { lod: 1, kind: 'coffeetable' });
    B('wood', 0x7d5a3c, 0, 0.14, 0, 0.9, 0.025, 0.45, { lod: 1, kind: 'coffeetable' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', 0x6b4a31, sx * 0.44, 0.21, sz * 0.22, 0.05, 0.42, 0.05, { lod: 1, kind: 'coffeetable' });
    for (let i = 0; i < 3; i++) B('paper', [0x7a4a3a, 0x3d5c5c, 0xc9b78a][i], 0.32, 0.158 + i * 0.022, 0.0, 0.22 - i * 0.02, 0.02, 0.17, { lod: 2, solid: false, yaw: i * 0.4 });
    B('paper', 0xe8d8b0, -0.28, 0.455, 0.12, 0.25, 0.008, 0.18, { lod: 2, solid: false, yaw: 0.3 });
    B('paper', 0x6b8cae, -0.27, 0.463, 0.12, 0.22, 0.008, 0.16, { lod: 2, solid: false, yaw: 0.1 });
  });
  teapot(0.95, gf + 0.45, 6.37, 0.4, 0xd9d2c0);
  for (let i = 0; i < 4; i++) C('wicker', 0xd8b878, 0.7 + (i % 2) * 0.04, gf + 0.465 + i * 0.012, 6.62 + (i % 2) * 0.02, 0.035, 0.012, { lod: 2, solid: false });
  // Bookcases on the party wall.
  function bookcase(x, z, yaw, w, h, shelves, seed) {
    grp(x, gf, z, yaw, () => {
      const d = 0.3;
      B('wood', 0x6e4a31, -w / 2 + 0.015, h / 2, 0, 0.03, h, d, { lod: 1, kind: 'bookcase' });
      B('wood', 0x6e4a31, w / 2 - 0.015, h / 2, 0, 0.03, h, d, { lod: 1, kind: 'bookcase' });
      B('wood', 0x5c3f29, 0, h / 2, -d / 2 + 0.01, w, h, 0.02, { lod: 1, kind: 'bookcase' });
      B('wood', 0x6e4a31, 0, h - 0.015, 0, w, 0.03, d, { lod: 1, kind: 'bookcase' });
      B('wood', 0x6e4a31, 0, 0.1, 0.0, w, 0.2, d, { lod: 1, kind: 'bookcase' });
      for (let s = 0; s < shelves; s++) {
        const y = 0.2 + (h - 0.2 - 0.03) * (s / shelves);
        B('wood', 0x7d5a3c, 0, y, 0.0, w - 0.06, 0.025, d - 0.02, { lod: 1, kind: 'bookcase' });
        if (s > 0) books(((hash(seed + s) - 0.5) * 0.1), y + 0.0125, 0.0, (w - 0.1) * (0.7 + 0.3 * hash(seed + s * 2)), ((h - 0.23) / shelves) - 0.07, seed * 5 + s, { d: 0.22 });
        else books(0, y + 0.0125, 0, (w - 0.1) * 0.9, ((h - 0.23) / shelves) - 0.07, seed * 5, { d: 0.22 });
      }
    });
  }
  bookcase(-0.4, 5.3, Math.PI / 2, 0.85, 1.95, 5, 3);
  bookcase(-0.4, 6.12, Math.PI / 2, 0.75, 1.5, 4, 5);
  // TV on a low cabinet by the bay, east wall.
  grp(2.62, gf, 7.65, -Math.PI / 2, () => {
    B('wood', 0x4f3623, 0, 0.23, 0, 0.9, 0.46, 0.4, { lod: 1, kind: 'tvunit' });
    B('wood', 0x5c3f29, 0, 0.23, 0.205, 0.84, 0.36, 0.01, { lod: 2, solid: false });
    B('iron', 0x15181a, 0, 0.78, 0.0, 0.84, 0.5, 0.06, { lod: 1, kind: 'tv' });
    B('glass', 0x23363f, 0, 0.78, 0.032, 0.78, 0.44, 0.004, { lod: 1, solid: false });
    B('iron', 0x15181a, 0, 0.5, 0.0, 0.2, 0.06, 0.12, { lod: 2, solid: false });
  });
  // Standard lamp with a glowing shade.
  C('brass', BRASS, -0.3, gf + 0.015, 8.25, 0.12, 0.03, { lod: 1 });
  C('brass', BRASS, -0.3, gf + 0.8, 8.25, 0.012, 1.55, { lod: 1 });
  lampShade(-0.3, gf + 1.62, 8.25, 0.2, 0.26, 0xf0d29a, { r2: 0.14 });
  // Bay: a plant stand, a fern, curtains, a window seat cushion.
  plant(0.2, gf, 8.72, 0.14, 0.28, 0.55, { leafCol: 0x5a8a4a });
  plant(1.95, gf, 8.74, 0.12, 0.62, 0.45, { leafCol: 0x4e7a3f, potCol: 0x6f8a86 });
  B('wood', 0x6b4a31, 1.95, gf + 0.31, 8.74, 0.1, 0.62, 0.1, { lod: 2, solid: false });
  for (const x of [-0.02, 2.2]) B('fabric', 0xcdb59a, x, gf + 1.1, 8.55, 0.25, 2.3, 0.04, { lod: 2, solid: false });
  R('brass', BRASS, [-0.1, gf + 2.25, 8.5], [2.3, gf + 2.25, 8.5], 0.012, { lod: 2, solid: false });
  // Fireplace on the right wall: surround, mantel, hearth, grate with coals, mirror, ornaments.
  grp(2.45, gf, 6.5, -Math.PI / 2, () => {
    B('stone', 0xcdbfa8, 0, 0.5, 0.02, 1.3, 1.0, 0.06, { lod: 1, kind: 'fireplace' });
    B('iron', 0x1f1f20, 0, 0.3, 0.052, 0.7, 0.58, 0.01, { lod: 1, solid: false });
    for (const sx of [-1, 1]) B('stone', 0xbfb09a, sx * 0.4, 0.45, 0.06, 0.14, 0.9, 0.05, { lod: 1, solid: false });
    B('wood', 0x6e4a31, 0, 1.2 - 0.04 - 0.06 + 0.06, 0.08, 1.55, 0.05, 0.28, { lod: 1, kind: 'mantel' });
    B('iron', 0x2b2c2d, 0, 0.12, 0.07, 0.55, 0.12, 0.1, { lod: 1, solid: false });
    for (let i = 0; i < 6; i++) O('glow', i % 2 ? 0xd9692a : 0xf0a23a, -0.2 + i * 0.08, 0.17, 0.075, 0.04, { lod: 2, solid: false });
    B('stone', 0xb4a58e, 0, 0.02, 0.4, 1.3, 0.04, 0.8, { lod: 1, kind: 'hearth' });
    B('wood', 0xa8884f, 0, 1.75, 0.05, 0.8, 0.6, 0.03, { lod: 2, solid: false });
    B('glass', 0xc9d6d6, 0, 1.75, 0.068, 0.7, 0.5, 0.006, { lod: 2, solid: false });
    C('brass', BRASS, -0.5, 1.28, 0.1, 0.02, 0.08, { lod: 2, solid: false });
    B('wood', 0x3b2a20, 0.45, 1.34, 0.1, 0.16, 0.2, 0.08, { lod: 2, solid: false });
    C('ceramic', 0x6f8aa8, 0.1, 1.31, 0.1, 0.045, 0.14, { lod: 2, r2: 0.03, solid: false });
    C('ceramic', 0xd9b45a, -0.2, 1.3, 0.1, 0.04, 0.1, { lod: 2, r2: 0.03, solid: false });
    C('brass', BRASS, 0.3, 1.31, 0.1, 0.012, 0.12, { lod: 2, solid: false });
  });
  C('wicker', 0xb89a62, 2.2, gf + 0.18, 7.05, 0.17, 0.36, { lod: 1, r2: 0.2, kind: 'basket' });
  for (let i = 0; i < 3; i++) C('bark', 0x6b4a31, 2.2 + (i - 1) * 0.07, gf + 0.4, 7.05, 0.05, 0.22, { lod: 2, solid: false, rz: 0.2 * (i - 1) });
  // Ceiling light with a big paper shade, pictures.
  lampShade(0.9, c1 - 0.3, 6.4, 0.24, 0.26, 0xf3e6c6, { r2: 0.2 });
  R('iron', 0x2b2c2d, [0.9, c1 - 0.17, 6.4], [0.9, c1, 6.4], 0.005, { lod: 2, solid: false });
  picture(1.0, gf + 1.5, 4.86, 0, 0.9, 0.6, 0x6f8aa8, 0xb8964f);
  picture(-0.54, gf + 1.55, 6.9, Math.PI / 2, 0.35, 0.5, 0xc9a24a);
  picture(1.2, gf + 1.5, 8.38, Math.PI, 0.5, 0.4, 0x8c6a5a);
}

// ---------------------------------------------------------------------------------- the landing
{
  B('fabric', 0x3f5a63, -1.1, f1 + 0.012, 5.4, 0.55, 0.014, 5.8, { solid: false, lod: 1 });
  B('fabric', 0xc9a24a, -1.1, f1 + 0.0155, 5.4, 0.45, 0.003, 5.7, { solid: false, lod: 2 });
  B('fabric', 0x3f5a63, -1.95, f1 + 0.012, 3.05, 0.9, 0.014, 0.8, { solid: false, lod: 1 });
  // Small table under the back window with a plant, a lamp-less bowl, a photo.
  table(-2.05, 2.62, 0, 0.55, 0.3, 0.7, 0x8a6a48, { th: 0.03, leg: 0.04, y0: f1, kind: 'smalltable' });
  plant(-2.1, f1 + 0.7, 2.62, 0.1, 0.2, 0.4, { leafCol: 0x5a8a4a });
  B('wood', 0xa07b4f, -1.9, f1 + 0.78, 2.5, 0.12, 0.16, 0.015, { lod: 2, solid: false, rx: -0.2 });
  picture(-2.44, f1 + 1.6, 3.3, Math.PI / 2, 0.4, 0.5, 0x8aa07a);
  picture(-0.66, f1 + 1.6, 4.0, -Math.PI / 2, 0.6, 0.45, 0x9a8a6c, 0xb8964f);
  picture(-0.66, f1 + 1.55, 6.0, -Math.PI / 2, 0.3, 0.4, 0xb9855a);
  picture(-2.44, f1 + 1.7, 7.0, Math.PI / 2, 0.8, 0.6, 0x6f8aa8, 0xb8964f);
  picture(-2.44, f1 + 2.4, 5.2, Math.PI / 2, 0.45, 0.6, 0xc9a24a);
  picture(-2.44, f1 + 1.55, 5.9, Math.PI / 2, 0.4, 0.3, 0x8c6a8a);
  // Stair lantern hanging in the void on a long cord.
  R('iron', 0x2b2c2d, [-2.0, 3.65, 5.8], [-2.0, c2, 5.8], 0.006, { lod: 2, solid: false });
  lampShade(-2.0, 3.45, 5.8, 0.15, 0.3, 0xf0dca0, { r2: 0.11 });
  C('brass', BRASS, -2.0, 3.64, 5.8, 0.05, 0.05, { lod: 2, solid: false });
  // Radiator under the landing window? No: one on the corridor wall by the stairs end.
  for (let i = 0; i < 6; i++) B('enamel', 0xf0efe9, -0.7, f1 + 0.37, 3.7 + i * 0.06, 0.06, 0.5, 0.045, { lod: 1, solid: i === 0 || i === 5, kind: 'radiator' });
  B('enamel', 0xf0efe9, -0.7, f1 + 0.38, 3.85, 0.06, 0.48, 0.3, { lod: 1, kind: 'radiator' });
  // Landing ceiling rose.
  lampShade(-1.1, c2 - 0.3, 3.2, 0.14, 0.18, 0xf0e4c4);
  R('iron', 0x2b2c2d, [-1.1, c2 - 0.2, 3.2], [-1.1, c2, 3.2], 0.005, { lod: 2, solid: false });
}

// ---------------------------------------------------------------------------------- the back bedroom
{
  const y = f1;
  B('fabric', 0xd2c2a6, 1.1, y + 0.012, 3.5, 3.0, 0.014, 1.9, { solid: false, lod: 1 });
  B('fabric', 0x9aa6b8, 1.1, y + 0.0165, 3.5, 2.7, 0.004, 1.6, { solid: false, lod: 2 });
  // Double bed along the right wall, head to the cross wall.
  grp(2.05, y, 3.55, Math.PI, () => {            // local +z (foot) points back (-z world); head at local -z
    const L = 2.02, W = 1.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', 0x6e4a31, sx * (W / 2 - 0.04), 0.1, sz * (L / 2 - 0.04), 0.07, 0.2, 0.07, { lod: 1, kind: 'bed' });
    B('wood', 0x6e4a31, 0, 0.27, 0, W, 0.16, L, { lod: 1, kind: 'bed' });
    B('fabric', 0xf1ede4, 0, 0.42, 0.0, W - 0.04, 0.16, L - 0.04, { lod: 1, kind: 'mattress' });
    B('wood', 0x6e4a31, 0, 0.62, -L / 2 + 0.02, W + 0.04, 0.9, 0.05, { lod: 1, kind: 'bed' });
    B('wood', 0x6e4a31, 0, 0.45, L / 2 - 0.02, W + 0.04, 0.5, 0.05, { lod: 1, kind: 'bed' });
    B('fabric', 0x6f86a8, 0, 0.53, 0.3, W - 0.02, 0.05, L * 0.62, { lod: 1, solid: false });
    B('fabric', 0xe3d6b8, 0, 0.545, 0.23, W - 0.06, 0.03, 0.5, { lod: 2, solid: false, rx: 0.02 });
    for (const sx of [-1, 1]) B('fabric', 0xfaf7ee, sx * 0.38, 0.54, -L / 2 + 0.28, 0.6, 0.13, 0.36, { lod: 1, solid: false, rx: -0.12 });
    B('fabric', 0xc9a24a, 0, 0.57, 0.5, 0.45, 0.1, 0.3, { lod: 2, solid: false, rx: -0.3 });
  });
  // Bedside tables with lamp and cup.
  grp(1.0, y, 4.35, 0, () => {
    B('wood', 0x8a6a48, 0, 0.565, 0, 0.42, 0.03, 0.4, { lod: 1, kind: 'bedside' });
    B('wood', 0x7a5a3c, 0, 0.375, 0, 0.38, 0.35, 0.36, { lod: 1, kind: 'bedside' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', 0x6e4a31, sx * 0.18, 0.1, sz * 0.17, 0.04, 0.2, 0.04, { lod: 1, kind: 'bedside' });
    B('wood', 0x6b4a31, 0, 0.38, 0.185, 0.3, 0.12, 0.012, { lod: 2, solid: false });
    O('brass', BRASS, 0, 0.38, 0.2, 0.012, { lod: 2, solid: false });
  });
  tableLamp(0.88, y + 0.58, 4.4, 0xf0d8a0, 0x6f8aa8, 0.9);
  B('enamel', 0x3d4a52, 1.12, y + 0.61, 4.5, 0.07, 0.06, 0.04, { lod: 2, solid: false });
  // Wardrobe on the cross wall.
  grp(0.1, y, 4.32, Math.PI, () => {
    B('wood', 0x7a5236, 0, 1.0, 0, 1.05, 2.0, 0.55, { lod: 1, kind: 'wardrobe' });
    B('wood', 0x8a6040, 0, 2.02, 0, 1.12, 0.05, 0.6, { lod: 1, solid: false });
    for (const sx of [-1, 1]) {
      B('wood', 0x6e4a31, sx * 0.255, 1.1, 0.28, 0.48, 1.6, 0.015, { lod: 2, solid: false });
      B('wood', 0x8a6040, sx * 0.255, 1.1, 0.29, 0.34, 1.2, 0.01, { lod: 2, solid: false });
      O('brass', BRASS, sx * 0.04, 1.0, 0.3, 0.018, { lod: 2, solid: false });
    }
  });
  // Dressing table with a triple mirror, stool, brush and bottles; a hanging mirror shape.
  grp(-0.1, y, 2.62, 0, () => {
    B('wood', 0xcfc2a8, 0, 0.73, 0, 0.9, 0.035, 0.42, { lod: 1, kind: 'dressing' });
    for (const sx of [-1, 1]) B('wood', 0xcfc2a8, sx * 0.4, 0.36, 0, 0.3, 0.7, 0.4, { lod: 1, kind: 'dressing' });
    B('wood', 0xbdb092, 0, 0.62, 0.0, 0.5, 0.1, 0.38, { lod: 2, solid: false });
    B('glass', 0xc9d6d6, 0, 1.18, -0.18, 0.5, 0.7, 0.01, { lod: 1, kind: 'mirror' });
    for (const sx of [-1, 1]) B('glass', 0xc9d6d6, sx * 0.34, 1.12, -0.09, 0.26, 0.56, 0.01, { lod: 2, solid: false, yaw: -sx * 0.7 });
    for (const [dx, hh, c] of [[-0.3, 0.14, 0xb9d3e8], [-0.22, 0.1, 0xe3b9c9], [0.25, 0.12, 0xd8c88a]]) C('glass', c, dx, 0.745 + hh / 2, 0.0, 0.03, hh, { lod: 2, solid: false });
    B('wood', 0x8a6a48, 0.1, 0.755, 0.1, 0.12, 0.012, 0.05, { lod: 2, solid: false, yaw: 0.4 });
    C('wood', 0xd2c2a6, 0, 0.23, 0.55, 0.17, 0.46, { lod: 1, kind: 'stool' });
    C('fabric', 0x9aa6b8, 0, 0.47, 0.55, 0.17, 0.05, { lod: 2, solid: false });
  });
  // Armchair with a throw, a laundry basket, pictures, pendant.
  sofa(0.3, 3.9, 0.3, 0.8, 0x8c6f9a, { y0: f1, d: 0.8 });
  picture(2.83, y + 1.55, 3.0, -Math.PI / 2, 0.5, 0.65, 0x6f8aa8, 0xb8964f);
  picture(1.2, y + 1.7, 4.58, Math.PI, 0.5, 0.4, 0xb9855a);
  lampShade(0.9, c2 - 0.3, 3.5, 0.2, 0.2, 0xf0e4d0, { r2: 0.16 });
  R('iron', 0x2b2c2d, [0.9, c2 - 0.2, 3.5], [0.9, c2, 3.5], 0.005, { lod: 2, solid: false });
}

// ---------------------------------------------------------------------------------- the bathroom
export const BATH = { x0: 0.1, x1: 1.8, z0: 4.75, z1: 5.5, rim: f1 + 0.62, rack: { x: 1.12, z: 5.12 } };
{
  const y = f1, Bt = BATH, bw = Bt.x1 - Bt.x0, bd = Bt.z1 - Bt.z0, bx = (Bt.x0 + Bt.x1) / 2, bz = (Bt.z0 + Bt.z1) / 2, rim = Bt.rim - y;
  B('wood', 0x7a8a8c, 0.6, y + 0.012, 5.35, 3.3, 0.01, 1.28, { solid: false, lod: 1 });
  // Claw-foot bath: four walls and a floor, brass-and-iron feet.
  for (const sz of [-1, 1]) B('enamel', 0xf4f2ea, bx, y + 0.2 + (rim - 0.2) / 2, bz + sz * (bd / 2 - 0.03), bw, rim - 0.2, 0.06, { lod: 1, kind: 'bath' });
  for (const sx of [-1, 1]) B('enamel', 0xf4f2ea, bx + sx * (bw / 2 - 0.03), y + 0.2 + (rim - 0.2) / 2, bz, 0.06, rim - 0.2, bd, { lod: 1, kind: 'bath' });
  B('enamel', 0xf4f2ea, bx, y + 0.22, bz, bw - 0.1, 0.05, bd - 0.1, { lod: 1, kind: 'bath' });
  B('enamel', 0xe9e6dc, bx, y + rim - 0.01, bz, bw - 0.1, 0.02, bd - 0.1, { lod: 2, solid: false });
  B('enamel', 0xfaf8f0, bx, y + rim + 0.0, bz, bw + 0.04, 0.025, bd + 0.04, { lod: 1, solid: false });
  B('enamel', 0x4d6f78, bx, y + 0.3, bz, bw - 0.09, 0.012, bd - 0.09, { lod: 2, solid: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    C('iron', 0x2b2c2d, bx + sx * (bw / 2 - 0.14), y + 0.1, bz + sz * (bd / 2 - 0.12), 0.04, 0.2, { lod: 1, r2: 0.028, kind: 'bath' });
    O('brass', BRASS, bx + sx * (bw / 2 - 0.14), y + 0.025, bz + sz * (bd / 2 - 0.12), 0.04, { lod: 2, solid: false });
  }
  // Taps and a mixer-spout on the wall end, hand-shower on a hook.
  R('steel', 0xc9ccce, [Bt.x0 + 0.02, y + rim + 0.12, bz], [Bt.x0 + 0.02, y + rim + 0.12, bz], 0.02, { lod: 2, solid: false });
  C('steel', 0xc9ccce, Bt.x0 + 0.05, y + rim + 0.1, bz, 0.018, 0.2, { lod: 2, solid: false });
  R('steel', 0xc9ccce, [Bt.x0 + 0.05, y + rim + 0.2, bz], [Bt.x0 + 0.17, y + rim + 0.22, bz], 0.012, { lod: 2, solid: false });
  for (const dz of [-0.09, 0.09]) O('steel', 0xc9ccce, Bt.x0 + 0.05, y + rim + 0.24, bz + dz, 0.025, { lod: 2, solid: false });
  // Bath rack across the bath with soap, sponge, a book; a yellow duck on the rim.
  B('wood', 0xb5895a, Bt.rack.x, y + rim + 0.025, bz, 0.5, 0.02, 0.84, { lod: 1, kind: 'rack' });
  for (const dz of [-1, 1]) B('wood', 0xa07b4f, Bt.rack.x, y + rim + 0.04, bz + dz * 0.4, 0.5, 0.05, 0.025, { lod: 1, solid: false });
  B('ceramic', 0xe8d8c0, 1.0, y + rim + 0.05, 5.32, 0.07, 0.03, 0.045, { lod: 2, solid: false, yaw: 0.4 });
  B('fabric', 0xd9c24a, 1.28, y + rim + 0.05, 5.3, 0.09, 0.035, 0.06, { lod: 2, solid: false });
  B('paper', 0x7a5a3a, 1.05, y + rim + 0.045, 4.93, 0.17, 0.025, 0.12, { lod: 2, solid: false, yaw: 0.2 });
  O('rubber', 0xf0cc3a, 1.55, y + rim + 0.06, 4.85, 0.04, { lod: 2, solid: false });
  O('rubber', 0xf0cc3a, 1.585, y + rim + 0.1, 4.85, 0.026, { lod: 2, solid: false });
  B('rubber', 0xe0803a, 1.62, y + rim + 0.095, 4.85, 0.025, 0.01, 0.015, { lod: 2, solid: false });
  // Pedestal basin, mirror cabinet, towel rail, toilet, laundry basket.
  grp(0.55, y, 5.78, Math.PI, () => {
    C('ceramic', 0xf4f2ea, 0, 0.36, 0.0, 0.07, 0.72, { lod: 1, r2: 0.08, kind: 'basin' });
    B('ceramic', 0xf4f2ea, 0, 0.82, 0.0, 0.56, 0.16, 0.42, { lod: 1, kind: 'basin' });
    B('ceramic', 0xe8e5da, 0, 0.9, 0.0, 0.46, 0.01, 0.32, { lod: 2, solid: false });
    C('steel', 0xc9ccce, 0, 0.95, -0.15, 0.012, 0.1, { lod: 2, solid: false });
    R('steel', 0xc9ccce, [0, 1.0, -0.15], [0, 1.0, -0.06], 0.01, { lod: 2, solid: false });
    B('wood', 0xd8d2c0, 0, 1.55, -0.16, 0.55, 0.7, 0.1, { lod: 1, kind: 'cabinet' });
    B('glass', 0xc9d6d6, 0, 1.55, -0.108, 0.5, 0.64, 0.006, { lod: 1, solid: false });
    C('ceramic', 0xe3b9c9, -0.2, 0.935, 0.0, 0.03, 0.08, { lod: 2, solid: false });
  });
  grp(2.5, y, 5.36, -Math.PI / 2, () => {          // toilet facing west, cistern on the east wall
    B('ceramic', 0xf4f2ea, 0, 0.2, 0.0, 0.38, 0.4, 0.5, { lod: 1, kind: 'toilet' });
    B('ceramic', 0xf4f2ea, 0, 0.42, 0.05, 0.4, 0.04, 0.5, { lod: 1, solid: false });
    B('wood', 0xa07b4f, 0, 0.44, 0.06, 0.38, 0.02, 0.44, { lod: 2, solid: false });
    B('ceramic', 0xf4f2ea, 0, 0.72, -0.22, 0.42, 0.5, 0.18, { lod: 1, kind: 'toilet' });
    B('ceramic', 0xe8e5da, 0, 0.99, -0.22, 0.44, 0.03, 0.2, { lod: 2, solid: false });
    O('steel', 0xc9ccce, 0.1, 0.92, -0.22, 0.02, { lod: 2, solid: false });
  });
  // Towel rail (a heated ladder) on the cross wall with towels.
  for (const x of [1.5, 1.65, 1.8, 1.95]) R('steel', 0xdfe2e3, [x, y + 0.3, 5.95], [x, y + 1.2, 5.95], 0.012, { lod: 2, kind: 'rail', solid: x === 1.5 || x === 1.95 });
  for (const yy of [0.5, 0.75, 1.0, 1.2]) R('steel', 0xdfe2e3, [1.5, y + yy, 5.95], [1.95, y + yy, 5.95], 0.012, { lod: 2, solid: false });
  B('fabric', 0xb9d3d6, 1.72, y + 0.88, 5.93, 0.4, 0.5, 0.025, { lod: 2, solid: false });
  B('fabric', 0xe9c9b9, 1.72, y + 0.55, 5.93, 0.4, 0.28, 0.025, { lod: 2, solid: false });
  C('wicker', 0xb89a62, -0.28, y + 0.25, 5.72, 0.2, 0.5, { lod: 1, r2: 0.23, kind: 'basket' });
  B('fabric', 0x9bb5b0, 0.4, y + 0.016, 5.35, 0.7, 0.012, 0.45, { lod: 2, solid: false });
  lampShade(0.9, c2 - 0.18, 5.35, 0.14, 0.14, 0xf2f0e8);
  picture(1.4, y + 1.7, 4.71, 0, 0.4, 0.3, 0x8aa8b8);
}

// ---------------------------------------------------------------------------------- the kids' room
{
  const y = f1;
  B('fabric', 0x3d7a8c, 1.35, y + 0.012, 7.3, 2.1, 0.012, 1.75, { solid: false, lod: 1 });
  B('fabric', 0xd8c24a, 1.35, y + 0.0155, 7.3, 1.9, 0.004, 1.55, { solid: false, lod: 2 });
  // Bunk bed against the north wall: four posts, two mattresses on slats, a ladder, a guard rail.
  grp(1.4, y, 6.65, 0, () => {
    const L = 2.0, W = 0.95;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', PINE, sx * (L / 2 - 0.035), 0.83, sz * (W / 2 - 0.035), 0.07, 1.66, 0.07, { lod: 1, kind: 'bunk' });
    for (const yy of [0.34, 1.08]) {
      for (const sz of [-1, 1]) B('wood', PINE, 0, yy, sz * (W / 2 - 0.035), L, 0.14, 0.04, { lod: 1, kind: 'bunk' });
      B('wood', 0xe8c892, 0, yy - 0.04, 0, L - 0.08, 0.025, W - 0.08, { lod: 1, kind: 'bunk' });
      B('fabric', 0xf1ede4, 0, yy + 0.07, 0, L - 0.12, 0.12, W - 0.12, { lod: 1, kind: 'mattress' });
    }
    B('fabric', 0x3d7a8c, 0.1, 1.2, 0.0, 1.5, 0.06, 0.88, { lod: 2, solid: false });
    B('fabric', 0xd96a4a, -0.1, 0.45, 0.0, 1.5, 0.06, 0.88, { lod: 2, solid: false });
    B('fabric', 0xfaf7ee, -L / 2 + 0.3, 1.24, 0.0, 0.34, 0.1, 0.5, { lod: 2, solid: false, rz: 0.1 });
    for (const sz of [-1, 1]) for (const yy of [1.35, 1.52]) B('wood', PINE, 0, yy, sz * (W / 2 - 0.035), L - 0.14, 0.04, 0.03, { lod: 1, kind: 'bunk', solid: sz > 0 });
    for (const yy of [1.35, 1.52]) B('wood', PINE, L / 2 - 0.035, yy, 0, 0.03, 0.04, W - 0.14, { lod: 1, kind: 'bunk' });
    for (let i = 0; i < 5; i++) B('wood', PINE, L / 2 - 0.03, 0.2 + i * 0.22, W / 2 + 0.07, 0.05, 0.04, 0.12, { lod: 1, solid: false });
    for (const dz of [0.07, 0.19]) B('wood', PINE, L / 2 - 0.03, 0.7, W / 2 + dz, 0.04, 1.4, 0.03, { lod: 1, solid: false });
    O('fabric', 0xb08a5a, -0.5, 1.2, 0.2, 0.09, { lod: 2, solid: false, sy: 0.7 });       // teddy
    O('fabric', 0xb08a5a, -0.5, 1.31, 0.2, 0.055, { lod: 2, solid: false });
  });
  // Low bookshelf, toy box, beanbag.
  grp(-0.0, y, 6.3, 0, () => {
    B('wood', 0xe8c892, -0.0, 0.5, 0, 0.8, 1.0, 0.3, { lod: 1, kind: 'bookshelf' });
    for (const yy of [0.25, 0.5, 0.75]) books(0, yy, 0.0, 0.7, 0.18, 21 + yy * 7, { d: 0.22 });
  });
  grp(0.35, y, 8.15, 0, () => {
    B('wood', 0xd96a4a, 0, 0.2, 0, 0.7, 0.4, 0.4, { lod: 1, kind: 'toybox' });
    B('wood', 0xe8c892, 0, 0.405, -0.1, 0.74, 0.03, 0.22, { lod: 1, solid: false, rx: 0.9 });
    O('rubber', 0xd9692a, 0.1, 0.46, 0.0, 0.07, { lod: 2, solid: false });
    B('wood', 0x3d7a8c, -0.15, 0.46, 0.05, 0.1, 0.1, 0.1, { lod: 2, solid: false, yaw: 0.5 });
    B('fabric', 0xc27a5a, 0.0, 0.43, 0.1, 0.12, 0.06, 0.2, { lod: 2, solid: false, yaw: 0.3 });
  });
  O('fabric', 0x7a8f46, 1.1, y + 0.2, 8.1, 0.28, { lod: 1, sy: 0.7, kind: 'beanbag' });
  // Wooden train set: an oval of track on the rug, an engine and wagons, a tunnel, a station.
  {
    const cx = 1.3, cz = 7.6, a = 0.62, b = 0.38, n = 22;
    for (let i = 0; i < n; i++) {
      const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
      const x0 = cx + Math.cos(t0) * a, z0 = cz + Math.sin(t0) * b, x1 = cx + Math.cos(t1) * a, z1 = cz + Math.sin(t1) * b;
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
      B('wood', 0xc9a06a, (x0 + x1) / 2, y + 0.025, (z0 + z1) / 2, len + 0.01, 0.018, 0.05, { yaw: ang, lod: 2, solid: false });
      B('wood', 0x8a6a48, (x0 + x1) / 2, y + 0.036, (z0 + z1) / 2, len, 0.006, 0.03, { yaw: ang, lod: 2, solid: false });
    }
    const car = (t, col, long, hgt) => {
      const x = cx + Math.cos(t) * a, z = cz + Math.sin(t) * b, ang = Math.atan2(-(b * Math.cos(t)), -a * Math.sin(t));
      B('wood', col, x, y + 0.05 + hgt / 2, z, long, hgt, 0.07, { yaw: ang, lod: 2, kind: 'toy' });
      for (const s of [-1, 1]) O('wood', 0x2b2c2d, x + Math.cos(ang) * s * long * 0.3, y + 0.044, z - Math.sin(ang) * s * long * 0.3, 0.018, { lod: 2, solid: false });
      return [x, z, ang];
    };
    const [ex, ez, ea] = car(0.6, 0x2f6b4a, 0.16, 0.07);
    O('wood', 0x2f6b4a, ex + Math.cos(ea) * 0.05, y + 0.14, ez - Math.sin(ea) * 0.05, 0.035, { lod: 2, solid: false });
    C('iron', 0x2b2c2d, ex + Math.cos(ea) * 0.05, y + 0.18, ez - Math.sin(ea) * 0.05, 0.015, 0.05, { lod: 2, solid: false });
    car(0.45, 0xb8423a, 0.12, 0.06); car(0.33, 0xe8c24a, 0.12, 0.06); car(0.21, 0x3d6ba6, 0.12, 0.06);
    // Tunnel over the near track.
    grp(cx - 0.02, y, cz + b + 0.01, 0, () => {
      B('wood', 0x8a6a48, -0.1, 0.1, 0, 0.03, 0.2, 0.2, { lod: 2, kind: 'toy' });
      B('wood', 0x8a6a48, 0.1, 0.1, 0, 0.03, 0.2, 0.2, { lod: 2, kind: 'toy' });
      B('wood', 0xb8423a, 0, 0.215, 0, 0.26, 0.04, 0.22, { lod: 2, kind: 'toy' });
    });
    B('wood', 0xd8c24a, cx - a - 0.12, y + 0.08, cz, 0.12, 0.16, 0.3, { lod: 2, kind: 'toy' });
    B('wood', 0xb8423a, cx - a - 0.12, y + 0.17, cz, 0.15, 0.025, 0.34, { lod: 2, solid: false });
    for (const [dx, dz, c] of [[-0.3, 0.0, 0xd96a4a], [-0.22, 0.03, 0x3d7a8c], [-0.26, -0.04, 0xd8c24a]]) B('wood', c, cx + dx, y + 0.04, cz + dz + 0.0, 0.07, 0.07, 0.07, { lod: 2, solid: false, yaw: dx * 5 });
  }
  // Play tent (a patterned A-frame) by the window wall, east side.
  grp(2.4, y, 8.0, 0.2, () => {
    for (const sx of [-1, 1]) B('fabric', sx > 0 ? 0xd96a4a : 0xe8c24a, sx * 0.24, 0.46, 0, 0.04, 0.95, 0.9, { lod: 1, rz: -sx * 0.46, kind: 'tent' });
    B('fabric', 0x3d7a8c, 0, 0.45, -0.45, 0.62, 0.8, 0.03, { lod: 2, solid: false });
    B('fabric', 0x8a5a4a, 0, 0.012, 0, 0.9, 0.012, 0.9, { lod: 2, solid: false });
    R('wood', PINE, [-0.45 * 0.5, 0.88, 0.0], [0.45 * 0.5, 0.88, 0.0], 0.015, { lod: 2, solid: false });
    for (const [dx, c] of [[-0.08, 0xd96a4a], [0.1, 0x6b8f3a]]) O('fabric', c, dx, 0.13, 0.22, 0.09, { lod: 2, solid: false, sy: 0.9 });
  });
  // A model aeroplane hanging from the ceiling on a thread, turning in the draught.
  grp(0.25, c2 - 0.8, 7.35, 0.4, () => {
    R('paper', 0xe9e4d8, [0, 0.8, 0], [0, 0.14, 0], 0.004, { lod: 2, solid: false, seg: 3 });
    C('wood', 0xd8d2c0, 0, 0.05, 0.0, 0.045, 0.34, { lod: 1, r2: 0.02, rx: Math.PI / 2, kind: 'plane' });
    B('wood', 0xb8423a, 0, 0.05, 0.0, 0.62, 0.018, 0.1, { lod: 1, kind: 'plane' });
    B('wood', 0xb8423a, 0, 0.1, 0.17, 0.2, 0.018, 0.06, { lod: 2, solid: false });
    B('wood', 0xb8423a, 0, 0.1, 0.17, 0.016, 0.1, 0.06, { lod: 2, solid: false });
    B('iron', 0x2b2c2d, 0, 0.05, -0.18, 0.03, 0.18, 0.012, { lod: 2, solid: false });
    O('wood', 0xd8d2c0, 0, 0.05, -0.17, 0.035, { lod: 2, solid: false, sy: 0.9 });
  });
  // Posters, a curtain, ceiling shade.
  picture(2.83, y + 1.5, 7.2, -Math.PI / 2, 0.5, 0.7, 0x4a7a9c);
  picture(2.83, y + 1.55, 7.9, -Math.PI / 2, 0.35, 0.45, 0xc9663e);
  picture(1.0, y + 1.7, 6.12, 0, 0.55, 0.4, 0x7a9a46);
  lampShade(0.9, c2 - 0.28, 7.0, 0.19, 0.18, 0xf0e8c0, { r2: 0.15 });
  R('iron', 0x2b2c2d, [0.9, c2 - 0.19, 7.0], [0.9, c2, 7.0], 0.005, { lod: 2, solid: false });
}

// ---------------------------------------------------------------------------------- the loft's contents
export const LOFTCUP = { x: -0.3, z: 5.55, stand: 0 };
{
  const y = loft;
  // Cold-water tank on a platform, lagged pipes.
  grp(1.85, y, 3.55, 0, () => {
    B('wood', 0xa89170, 0, 0.03, 0, 1.0, 0.06, 0.75, { lod: 1, kind: 'tank' });
    B('enamel', 0xa6b3b6, 0, 0.33, 0, 0.84, 0.54, 0.56, { lod: 1, kind: 'tank' });
    B('enamel', 0x93a1a4, 0, 0.61, 0, 0.86, 0.03, 0.58, { lod: 2, solid: false });
    for (const sx of [-1, 1]) B('steel', 0x9aa0a2, sx * 0.43, 0.33, 0, 0.012, 0.5, 0.52, { lod: 2, solid: false });
    R('fabric', 0xd9d0a0, [0.1, 0.12, 0.28], [0.1, 0.12, 1.0], 0.04, { lod: 1, solid: false, seg: 6 });
    R('fabric', 0xd9d0a0, [-0.3, 0.12, 0.28], [-0.9, 0.12, 0.6], 0.035, { lod: 1, solid: false, seg: 6 });
    R('copper', 0xb87333, [0.38, 0.5, -0.3], [0.38, 0.9, -0.3], 0.011, { lod: 2, solid: false });
    R('copper', 0xb87333, [0.38, 0.9, -0.3], [0.5, 0.9, -0.5], 0.011, { lod: 2, solid: false });
  });
  // Cardboard boxes stacked by the ridge, with the cup on top.
  {
    const bx = -0.3, bz = 5.55;
    const stack = [[0.52, 0.38, 0.42, 0xb08a5a, 0.1], [0.46, 0.34, 0.38, 0xa8825a, -0.2], [0.4, 0.3, 0.34, 0xbf9a68, 0.25]];
    let h = 0;
    stack.forEach(([w, hh, d, c, yw], i) => {
      B('paper', c, bx, y + h + hh / 2, bz, w, hh, d, { yaw: yw, lod: 1, kind: 'box' });
      B('paper', 0xd8c9a0, bx, y + h + hh / 2, bz, w + 0.004, 0.05, d + 0.004, { yaw: yw, lod: 2, solid: false });
      B('paper', 0xe9e2cf, bx + Math.cos(yw) * 0.0, y + h + hh * 0.6, bz + d / 2 + 0.001, 0.2, 0.1, 0.004, { yaw: yw, lod: 2, solid: false });
      h += hh;
      void i;
    });
    LOFTCUP.stand = y + h;
    // A second box beside it, and a lampshade bag, a roll of wrapping paper.
    B('paper', 0xa8825a, bx - 0.55, y + 0.17, bz + 0.1, 0.5, 0.34, 0.4, { yaw: -0.3, lod: 1, kind: 'box' });
    C('paper', 0xc2453a, bx - 0.52, y + 0.5, bz + 0.1, 0.05, 0.6, { lod: 2, solid: false, rz: 1.2 });
  }
  // The old train set: an oval of track, a black engine and carriages, a station and a transformer.
  {
    const cx = -1.2, cz = 6.45, a = 0.5, b = 0.32, n = 20;
    B('wood', 0x7a5a3a, cx, y + 0.014, cz, 1.4, 0.03, 0.95, { lod: 1, kind: 'trainboard' });
    for (let i = 0; i < n; i++) {
      const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
      const x0 = cx + Math.cos(t0) * a, z0 = cz + Math.sin(t0) * b, x1 = cx + Math.cos(t1) * a, z1 = cz + Math.sin(t1) * b;
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
      B('iron', 0x4a4a48, (x0 + x1) / 2, y + 0.036, (z0 + z1) / 2, len + 0.01, 0.012, 0.045, { yaw: ang, lod: 2, solid: false });
      B('wood', 0x6a4a30, (x0 + x1) / 2, y + 0.034, (z0 + z1) / 2, 0.025, 0.008, 0.06, { yaw: ang, lod: 2, solid: false });
    }
    const car = (t, col, long, hgt) => {
      const x = cx + Math.cos(t) * a, z = cz + Math.sin(t) * b, ang = Math.atan2(-(b * Math.cos(t)), -a * Math.sin(t));
      B('iron', col, x, y + 0.045 + hgt / 2 + 0.02, z, long, hgt, 0.06, { yaw: ang, lod: 2, kind: 'toy' });
      return [x, z, ang];
    };
    const [ex, ez, ea] = car(0.5, 0x23262a, 0.16, 0.06);
    C('iron', 0x23262a, ex + Math.cos(ea) * 0.03, y + 0.12, ez - Math.sin(ea) * 0.03, 0.028, 0.08, { lod: 2, solid: false });
    C('iron', 0x23262a, ex + Math.cos(ea) * 0.06, y + 0.16, ez - Math.sin(ea) * 0.06, 0.018, 0.04, { lod: 2, solid: false });
    car(0.33, 0x6e2a2a, 0.14, 0.06); car(0.2, 0x3a4a6a, 0.14, 0.06);
    B('wood', 0xcfc2a0, cx + 0.38, y + 0.1, cz + 0.3, 0.2, 0.14, 0.12, { lod: 2, kind: 'toy' });
    B('wood', 0x7a3b36, cx + 0.38, y + 0.185, cz + 0.3, 0.23, 0.03, 0.15, { lod: 2, solid: false });
    B('iron', 0x2b2c2d, cx - 0.5, y + 0.08, cz - 0.35, 0.12, 0.1, 0.1, { lod: 2, kind: 'toy' });
    R('rubber', 0x2b2c2d, [cx - 0.5, y + 0.1, cz - 0.3], [cx - 0.35, y + 0.04, cz - 0.1], 0.006, { lod: 2, solid: false });
  }
  // Rocking horse.
  grp(-1.75, y, 7.2, 0.2, () => {
    for (const sx of [-1, 1]) {
      for (let i = -2; i < 2; i++) {
        const t0 = i * 0.2, t1 = (i + 1) * 0.2;
        R('wood', 0x8a5a36, [sx * 0.13, 0.05 + (1 - Math.cos(t0 * 1.3)) * 0.4, t0 * 0.9 + 0.0], [sx * 0.13, 0.05 + (1 - Math.cos(t1 * 1.3)) * 0.4, t1 * 0.9], 0.022, { lod: 1, kind: 'horse', seg: 5 });
      }
      R('wood', 0x8a5a36, [sx * 0.13, 0.12, 0.35], [sx * 0.1, 0.4, 0.3], 0.02, { lod: 1, kind: 'horse', seg: 5 });
      R('wood', 0x8a5a36, [sx * 0.13, 0.12, -0.35], [sx * 0.1, 0.4, -0.3], 0.02, { lod: 1, kind: 'horse', seg: 5 });
    }
    C('wood', 0xb8a090, 0, 0.52, 0.0, 0.11, 0.55, { lod: 1, rx: Math.PI / 2, kind: 'horse', r2: 0.1 });
    B('fabric', 0x7a3b36, 0, 0.64, 0.02, 0.24, 0.04, 0.3, { lod: 2, solid: false });
    R('wood', 0xb8a090, [0, 0.58, 0.25], [0, 0.88, 0.38], 0.06, { lod: 1, kind: 'horse', seg: 6 });
    O('wood', 0xb8a090, 0, 0.9, 0.44, 0.075, { lod: 1, kind: 'horse', sy: 1.1 });
    B('wood', 0xa89080, 0, 0.88, 0.52, 0.07, 0.07, 0.12, { lod: 2, solid: false });
    R('rubber', 0x3a2a20, [0, 0.95, 0.34], [0, 0.72, 0.28], 0.025, { lod: 2, solid: false });
    R('rubber', 0x3a2a20, [0, 0.58, -0.28], [0, 0.4, -0.38], 0.02, { lod: 2, solid: false });
    for (const sx of [-1, 1]) R('wood', 0x6b4a31, [sx * 0.1, 0.9, 0.46], [sx * 0.18, 0.96, 0.5], 0.01, { lod: 2, solid: false });
    O('iron', 0x15181a, 0.04, 0.93, 0.5, 0.012, { lod: 2, solid: false });
    O('iron', 0x15181a, -0.04, 0.93, 0.5, 0.012, { lod: 2, solid: false });
  });
  // Christmas box with tinsel and baubles, a plastic tree lying down.
  grp(-1.95, y, 3.25, 0.4, () => {
    B('paper', 0x9c3b32, 0, 0.17, 0, 0.55, 0.34, 0.4, { lod: 1, kind: 'box' });
    B('paper', 0x8a3229, 0, 0.35, -0.2, 0.55, 0.012, 0.2, { lod: 2, solid: false, rx: -1.0 });
    B('paper', 0x8a3229, 0, 0.35, 0.2, 0.55, 0.012, 0.2, { lod: 2, solid: false, rx: 1.0 });
    const cols = [0xc0392b, 0xd8a53a, 0x2f6b9a, 0x4a8a4a, 0xe3b9c9, 0xcfcfcf];
    for (let i = 0; i < 11; i++) O('glow', cols[i % cols.length], -0.2 + (i % 4) * 0.13, 0.37 + (i % 3) * 0.02, -0.12 + Math.floor(i / 4) * 0.12, 0.045, { lod: 2, solid: false });
    R('fabric', 0xd8b94a, [-0.25, 0.4, -0.15], [0.3, 0.46, 0.05], 0.025, { lod: 2, solid: false, seg: 5 });
    R('fabric', 0xc0392b, [-0.28, 0.42, 0.1], [0.2, 0.38, -0.1], 0.02, { lod: 2, solid: false, seg: 5 });
    C('leaf', 0x2f5a35, 0.7, 0.12, 0.2, 0.17, 0.8, { lod: 1, r2: 0.04, rz: Math.PI / 2 - 0.08, kind: 'tree', seg: 8 });
  });
  // The dusty armchair under a dust sheet, a steamer trunk, a stack of suitcases, a standing lamp.
  grp(1.0, y, 5.85, Math.PI, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) C('wood', DARKWOOD, sx * 0.35, 0.06, sz * 0.32, 0.03, 0.12, { lod: 1, solid: false });
    B('fabric', 0x9a8e78, 0, 0.27, 0.0, 0.86, 0.3, 0.8, { lod: 1, kind: 'armchair' });
    B('fabric', 0x9a8e78, -0.33, 0.45, 0.0, 0.2, 0.54, 0.8, { lod: 1, kind: 'armchair' });
    B('fabric', 0x9a8e78, 0.33, 0.45, 0.0, 0.2, 0.54, 0.8, { lod: 1, kind: 'armchair' });
    B('fabric', 0x9a8e78, 0, 0.6, -0.32, 0.7, 0.9, 0.18, { lod: 1, kind: 'armchair' });
    B('fabric', 0xd9d5c6, 0.05, 0.58, 0.02, 0.9, 0.04, 0.84, { lod: 2, solid: false, rx: 0.05, rz: 0.02 });
    B('fabric', 0xd9d5c6, -0.46, 0.4, 0.0, 0.03, 0.4, 0.8, { lod: 2, solid: false });
    B('fabric', 0xd9d5c6, 0.0, 0.8, -0.4, 0.74, 0.02, 0.1, { lod: 2, solid: false });
  });
  grp(2.55, y, 5.05, 0.1, () => {
    B('wood', 0x6b4a31, 0, 0.2, 0, 0.7, 0.4, 0.4, { lod: 1, kind: 'trunk' });
    B('wood', 0x7d5a3c, 0, 0.42, 0, 0.72, 0.06, 0.42, { lod: 1, solid: false });
    for (const sx of [-0.2, 0.2]) B('iron', 0x2b2c2d, sx, 0.2, 0.0, 0.03, 0.44, 0.42, { lod: 2, solid: false });
    B('brass', BRASS, 0, 0.3, 0.205, 0.05, 0.04, 0.012, { lod: 2, solid: false });
    B('paper', 0x8a6a48, -0.05, 0.64, 0.0, 0.5, 0.2, 0.34, { lod: 1, kind: 'case' });
    B('paper', 0x3d4a5b, 0.0, 0.84, 0.0, 0.42, 0.18, 0.3, { lod: 1, kind: 'case', yaw: 0.2 });
  });
  C('brass', BRASS, -2.2, y + 0.55, 5.0, 0.014, 1.1, { lod: 1 });
  C('brass', BRASS, -2.2, y + 0.01, 5.0, 0.1, 0.02, { lod: 1 });
  lampShade(-2.2, y + 1.15, 5.0, 0.15, 0.2, 0xcfc0a0, { r2: 0.1 });
}

// ---------------------------------------------------------------------------------- the round gable window (frame and sash)
{
  const g = GABLE_WIN;
  Tor('paint', WHITE, g.x - 0.02, g.y, g.z, g.r + 0.02, 0.03, { yaw: -Math.PI / 2, lod: 1, seg: 20 });
  Tor('paint', WHITE, g.x + 0.07, g.y, g.z, g.r + 0.02, 0.025, { yaw: -Math.PI / 2, lod: 1, seg: 20 });
  // The round sash, hinged on its far edge and standing open inside the loft (plane z = const).
  Tor('paint', WHITE, -2.15, g.y, g.z - g.r, 0.27, 0.02, { lod: 1, seg: 18 });
  C('glass', 0xdbe9e6, -2.15, g.y, g.z - g.r, 0.26, 0.006, { lod: 1, solid: false, rx: Math.PI / 2, seg: 18 });
  B('glass', 0xffffff, -2.15, g.y, g.z - g.r, 0.48, 0.48, 0.03, { ...hidden, cm: 'glass' });
}

// ---------------------------------------------------------------------------------- the rooms (finishes for the renderer)
// Wall bands run from the floor: [from, to, colour] in metres above it. 'rail' is the dado rail's height.
export const ROOMS = [
  { id: 'cupboard', x0: IX0, x1: STAIR_X1 - 0.07, z0: 3.76, z1: 7.6, y0: gf, y1: c1, floor: ['boards', 0x7a6a55], ceil: 0xcfc6b2, bands: [[0, 3, 0xc9bda3]], plain: true },
  { id: 'stairwell', x0: IX0, x1: STAIR_X1, z0: 3.7, z1: IZ1, y0: gf, y1: c2, floor: ['tile', 0xffffff], ceil: 0xf0e8d6, bands: [[0, 0.95, 0x7f9482], [0.95, 9, 0xe9dfc6]], rail: 0.95, dadoPanels: true },
  { id: 'hall', x0: IX0, x1: P1[0], z0: IZ0, z1: IZ1, y0: gf, y1: c1, floor: ['tile', 0xffffff], ceil: 0xf0e8d6, bands: [[0, 0.95, 0x7f9482], [0.95, 9, 0xe9dfc6]], rail: 0.95, dadoPanels: true },
  { id: 'dining', x0: P1[1], x1: IX1, z0: IZ0, z1: 4.75, y0: gf, y1: c1, floor: ['boards', 0x8a6444], ceil: 0xf2ebd8, bands: [[0, 0.9, 0xf0ece0], [0.9, 9, 0xc9a35e]], rail: 0.9 },
  { id: 'living', x0: P1[1], x1: IX1, z0: 4.85, z1: IZ1, y0: gf, y1: c1, floor: ['boards', 0x9a7450], ceil: 0xf2ebd8, bands: [[0, 9, 0xb8c8bd]], rail: 0 },
  { id: 'landing', x0: IX0, x1: STAIR_X1, z0: IZ0, z1: 3.7, y0: f1, y1: c2, floor: ['carpet', 0xb9ab92], ceil: 0xf2ebd8, bands: [[0, 0.95, 0x7f9482], [0.95, 9, 0xe9dfc6]], rail: 0.95 },
  { id: 'corridor', x0: STAIR_X1, x1: P1[0], z0: IZ0, z1: IZ1, y0: f1, y1: c2, floor: ['carpet', 0xb9ab92], ceil: 0xf2ebd8, bands: [[0, 0.95, 0x7f9482], [0.95, 9, 0xe9dfc6]], rail: 0.95 },
  { id: 'stairvoid', x0: IX0, x1: STAIR_X1, z0: 3.7, z1: IZ1, y0: c1, y1: c2, floor: null, ceil: null, bands: [[0, 9, 0xe9dfc6]], rail: 0, skirt: false },
  { id: 'bedroom', x0: P1[1], x1: IX1, z0: IZ0, z1: 4.6, y0: f1, y1: c2, floor: ['carpet', 0xd8cdb8], ceil: 0xf4eee0, bands: [[0, 9, 0xcfc6d8]], rail: 0 },
  { id: 'bathroom', x0: P1[1], x1: IX1, z0: 4.7, z1: 6.0, y0: f1, y1: c2, floor: ['tile', 0xffffff], ceil: 0xf4f2ea, bands: [[0, 1.4, 0xf0f2ec, 'metro'], [1.4, 9, 0xc4dad4]], rail: 1.4, tiled: 1.4 },
  { id: 'kids', x0: P1[1], x1: IX1, z0: 6.1, z1: IZ1, y0: f1, y1: c2, floor: ['boards', 0xc9a672], ceil: 0xf4eee0, bands: [[0, 0.9, 0x6fa0a8], [0.9, 9, 0xf0dfa0]], rail: 0.9 },
  { id: 'loft', x0: IX0, x1: IX1, z0: IZ0, z1: IZ1, y0: c2, y1: M.ridgeY + 1, floor: null, ceil: null, bands: [[0, 9, 0xb9a78f]], rail: 0, plain: true, skirt: false },
];
export function roomAt(x, y, z) {
  for (const r of ROOMS) if (x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6 && y >= r.y0 - 1e-6 && y <= r.y1 + 1e-6) return r;
  return null;
}

// ---------------------------------------------------------------------------------- cups and the tea stand
const mugOf = (id, name, x, z, standY, glaze, rim, hy) => ({ id, name, x, z, standY, baseY: standY, rOut: 0.047, rIn: 0.0415, height: 0.096, bottom: 0.009, water: 0.074, handleYaw: hy, glaze, rim });
const cupOf = (id, name, x, z, standY, glaze, rim, hy) => ({ id, name, shape: 'teacup', x, z, standY, baseY: standY + 0.008, rOut: 0.05, rIn: 0.045, height: 0.064, bottom: 0.007, water: 0.05, handleYaw: hy, glaze, rim, saucer: 0.082 });
export const CUPS = [
  cupOf('house-coffee', 'Coffee table teacup', 1.15, 6.5, gf + 0.45, 0xf2ece0, 0x3f6aa6, -Math.PI * 0.5),
  mugOf('house-bath', 'Bath rack mug', BATH.rack.x, BATH.rack.z, f1 + 0.62 + 0.035, 0xe8c24a, 0xf3f1ea, Math.PI * 0.75),
  cupOf('house-bedside', 'Bedside teacup', 1.1, 4.3, f1 + 0.58, 0xe9d6c4, 0xb5534a, Math.PI),
  mugOf('house-loft', 'Loft box mug', LOFTCUP.x, LOFTCUP.z, LOFTCUP.stand, 0x7f9c8a, 0xf3eadc, Math.PI * 0.25),
  mugOf('house-chimney', 'Chimney-top mug', 2.62, 6.5, STACK.top + 0.005, 0xc9663e, 0xf0e2c8, Math.PI * 1.1),
];
// Imported by value from layout.js's STATION (importing layout.js here would be a cycle).
const STATION = { baseHalf: [0.12, 0.0075, 0.045], postX: 0.105, postHalf: 0.007, postHeight: 0.265, barY: 0.255, barHalf: 0.0055, pegReach: 0.062, pegY: 0.252, pegXs: [-0.055, 0, 0.055] };
export const STATIONS = [{ ...STATION, x: DINING.stand.x, z: DINING.stand.z, y: DINING.table.top }];

// ---------------------------------------------------------------------------------- colliders
const qIdent = (q) => Math.abs(q[0]) < 1e-6 && Math.abs(q[1]) < 1e-6 && Math.abs(q[2]) < 1e-6;
export function colliders(w) {
  for (const p of WALL_PIECES) {
    const am = (p.a0 + p.a1) / 2, ym = (p.y0 + p.y1) / 2, tm = (p.t0 + p.t1) / 2, ha = (p.a1 - p.a0) / 2, hy = (p.y1 - p.y0) / 2, ht = (p.t1 - p.t0) / 2;
    const brick = p.ext || p.gable;
    if (p.axis === 'z') w.box(ha, hy, ht, am, ym, tm, 'house', brick ? 'brick' : 'stone');
    else w.box(ht, hy, ha, tm, ym, am, 'house', brick ? 'brick' : 'stone');
  }
  for (const r of ROOF_PIECES) w.boxQ(r.hx, r.hy, r.hz, r.x, r.y, r.z, 'roof', r.slab ? 'tile' : 'wood', { x: r.q[0], y: r.q[1], z: r.q[2], w: r.q[3] });
  for (const p of PARTS) {
    if (!p.solid) continue;
    const q = p.q && { x: p.q[0], y: p.q[1], z: p.q[2], w: p.q[3] };
    switch (p.s) {
      case 'b':
        if (qIdent(p.q) && Math.abs(Math.abs(p.q[3]) - 1) < 1e-6) w.box(p.hx, p.hy, p.hz, p.x, p.y, p.z, p.kind, p.cm);
        else w.boxQ(p.hx, p.hy, p.hz, p.x, p.y, p.z, p.kind, p.cm, q);
        break;
      case 'c': {
        const upright = Math.abs(p.q[0]) < 1e-5 && Math.abs(p.q[2]) < 1e-5;
        if (upright) w.cyl((p.r + p.r2) / 2, p.hh, p.x, p.y, p.z, p.kind, p.cm);
        else {
          const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3]));
          const len = Math.max(0, p.hh - p.r);
          w.rail([p.x - ax.x * len, p.y - ax.y * len, p.z - ax.z * len], [p.x + ax.x * len, p.y + ax.y * len, p.z + ax.z * len], p.r, p.kind, p.cm);
        }
        break;
      }
      case 'o': w.ball(p.r * 0.95, p.x, p.y, p.z, p.kind, p.cm); break;
      case 'r': w.rail(p.a, p.b, p.r, p.kind, p.cm); break;
      case 'h': {
        const pts = [];
        for (const y of [p.y0, p.y1]) for (const [x, z] of p.pts) pts.push(x, y, z);
        w.hull(pts, p.kind, p.cm);
        break;
      }
      case 'x': w.hull(p.pts, p.kind, p.cm); break;
      default: break;
    }
  }
}
