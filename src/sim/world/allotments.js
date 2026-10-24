import * as THREE from 'three';
import { FY, HEDGE_GATE, groundHeight } from './plan.js';
import { roofSlabs, treeColliders, runColliders } from './shapes.js';
import { LADDER, ladderPostZ, FOLDING, foldingMainZ, DECK } from '../chairShapes.js';

// The 'allotments' area (AREAS.allotments in plan.js): the back lane behind the gardens, the allotments
// beyond it (z -9.5 to -24.5) and the hedge and stile at the park's edge. Fixed colliders, cups and the tea
// stand live here; src/render/world/areas/allotments.js draws the same numbers (everything it needs is
// exported below, so what you see is what you hit).
//
// Heights called h are metres above the ground (FY); Y(h) is the world y. Oriented things (sheds, frames)
// use a local frame: local x to the right, local z towards the front (the door side), turned by yaw about y.

export const Y = (h) => FY + h;
const TAU = Math.PI * 2;

export class Fr {
  constructor(x, z, yaw = 0) { this.x = x; this.z = z; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); }
  p(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]; }
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const quat = (rx, ry, rz) => _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')).clone();
const qLocal = (yaw, rx, ry, rz) => { _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); _q2.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); return _q.multiply(_q2).clone(); };

// ------------------------------------------------------------------ the numbers shared with the renderer
export const FENCE_Z = -9.5;                       // the allotment fence along the lane's far side
export const SIDE_X = 19.2;                        // side hedges at x = +-SIDE_X
export const PARK_HEDGE = { z0: -24.5, z1: -23.8, h: 1.75, gap: [3.5, 4.5] };
export const STILE = { x: 4.0, z: -24.15, w: 1.0, top: 1.05, mid: 0.55 };

// Five-bar field gate between the main way's posts.
export const FIELD_GATE = { x0: 2.5, x1: 5.5, post: 0.16, postH: 1.75, leaf0: 2.6, leaf1: 5.4, bars: [0.22, 0.54, 0.86, 1.18, 1.5], barHalf: 0.032, barT: 0.045 };
// The chain-link run (to the west) and the post-and-rail run (to the east) either side of it.
export const FENCES = { chain: { x0: -SIDE_X, x1: 2.42, h: 1.35 }, rail: { x0: 5.58, x1: SIDE_X, h: 1.15 } };
export const NOTICE = { x: 6.9, z: -9.3, w: 0.95, h: 0.62, y0: 1.15 };

// Our garden's back gate: a timber arch in the hedge gap (honeysuckle on it) and an open gate in the lane.
export const GATE = { x0: HEDGE_GATE.x0, x1: HEDGE_GATE.x1, zc: -6.15, postT: 0.11, postH: 2.2, beamH: 2.08 };
export const GATE_LEAF = { hingeX: 1.49, z0: -6.42, z1: -7.12, h0: 0.06, h1: 1.06, t: 0.04 };

export const VERGE = (() => {
  // Tall verge clumps along the allotment fence's lane side (cow parsley, nettles, docks): solid at 0.8.
  const out = []; let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let x = -19; x < 19.2; x += 0.9 + r() * 1.4) {
    if (x > 2.2 && x < 5.8) continue;              // the field gate
    if (x > 6.3 && x < 7.5) continue;              // the noticeboard
    out.push({ x, z: -9.22 + r() * 0.12, kind: r() < 0.55 ? 'parsley' : r() < 0.6 ? 'nettle' : 'dock', h: 0.55 + r() * 0.55, r: 0.2 + r() * 0.12 });
  }
  return out;
})();
export const BINS = [{ x: -14.4, z: -8.92, yaw: 0.08, col: 0x2f5b3c }, { x: -13.72, z: -8.9, yaw: -0.05, col: 0x26292d }, { x: -13.0, z: -8.95, yaw: 0.2, col: 0x2d4c6e }];
export const LAMP = { x: 11.8, z: -9.3, h: 4.6 };
export const POLES = [{ x: -16.8, z: -9.3, h: 6.9 }, { x: 17.2, z: -9.3, h: 6.9 }];
export const WIRE_H = 6.35, WIRE_SAG = 0.75, WIRE_Z = [-9.0, -9.62];
export const PUDDLES = [
  { x: -9.5, z: -8.15, rx: 0.9, rz: 0.34 }, { x: -1.6, z: -7.1, rx: 1.15, rz: 0.3 }, { x: 4.9, z: -8.55, rx: 0.8, rz: 0.3 },
  { x: 8.6, z: -7.25, rx: 1.2, rz: 0.4 }, { x: 13.4, z: -8.2, rx: 0.7, rz: 0.3 }, { x: -15.4, z: -7.1, rx: 1.0, rz: 0.35 },
];

// Polytunnel along x: a half-ellipse skin on hoops, a door frame at each end (hw wide, h high), tomatoes inside.
export const PT = { x0: -4.2, x1: 2.2, zc: -12.6, rx: 1.5, ry: 2.0, doorHW: 0.6, doorH: 1.7, hoops: 7, tomatoZ: 0.86, tomatoHW: 0.23, tomatoH: 1.35 };
// Runner-bean A-frame tunnel along x.
export const BT = { x0: -10.8, x1: -6.4, zc: -12.6, hw: 0.9, top: 2.3, thick: 0.14, pairs: 7 };
// Sunflower slalom along x at z = SL.zc, stems alternating either side; background rows behind.
export const SL = { zc: -17.6, x0: -11.0, step: 0.85, n: 7, off: 0.12 };
export const SUNFLOWERS = (() => {
  const out = [];
  for (let i = 0; i < SL.n; i++) out.push({ x: SL.x0 + i * SL.step, z: SL.zc + (i % 2 ? SL.off : -SL.off), h: 2.45 + 0.12 * ((i * 7) % 3), slalom: true });
  for (let i = 0; i < 7; i++) out.push({ x: SL.x0 + 0.4 + i * 0.85, z: -19.15 - 0.12 * (i % 2), h: 2.25 + 0.15 * ((i * 5) % 3) });
  for (let i = 0; i < 6; i++) out.push({ x: SL.x0 + 0.1 + i * 0.95, z: -15.95 + 0.1 * (i % 2), h: 1.7 + 0.2 * ((i * 3) % 3), dwarf: true });
  return out;
})();

// Fruit cage and brassica cage (netted frames, solid nets).
export const CAGES = [
  { id: 'fruit', x0: -18.0, x1: -14.2, z0: -19.0, z1: -16.2, h: 2.0 },
  { id: 'brassica', x0: 7.3, x1: 11.5, z0: -23.0, z1: -21.3, h: 1.15 },
];

// Sheds. style 'apex' (ridge along z, door in the gable), 'flat' (felt roof), 'mono' (falls towards -x local).
// openings: { wall: 'front'|'back'|'left'|'right', u (centre from the wall's middle), w, y0, y1, open }.
export const SHEDS = {
  A: { id: 'A', x: 8.5, z: -17.9, yaw: 0, w: 2.4, d: 2.9, style: 'apex', wallH: 1.95, ridgeH: 2.75, t: 0.07,
    openings: [{ wall: 'front', u: 0, w: 0.85, y0: 0, y1: 1.82, open: true }, { wall: 'right', u: 0.3, w: 0.6, y0: 0.95, y1: 1.45, open: false }],
    door: { wall: 'front', hinge: -0.425, leaf: 0.85, open: 100 } },
  B: { id: 'B', x: 1.5, z: -17.4, yaw: 0, w: 1.9, d: 1.8, style: 'flat', wallH: 1.95, t: 0.07,
    openings: [{ wall: 'front', u: 0.2, w: 0.75, y0: 0, y1: 1.78, open: false }, { wall: 'left', u: 0, w: 0.7, y0: 0.9, y1: 1.5, open: false }] },
  C: { id: 'C', x: -2.0, z: -17.6, yaw: -Math.PI / 2, w: 2.2, d: 2.6, style: 'mono', wallH: 1.85, highH: 2.2, t: 0.07,
    openings: [{ wall: 'front', u: 0, w: 0.82, y0: 0, y1: 1.78, open: true }, { wall: 'back', u: 0, w: 0.62, y0: 0.85, y1: 1.4, open: true }],
    door: { wall: 'front', hinge: 0.41, leaf: 0.82, open: 95 } },
  D: { id: 'D', x: -17.7, z: -13.9, yaw: 0, w: 1.7, d: 1.45, style: 'mono', wallH: 1.5, highH: 1.85, t: 0.06, openings: [] },
  E: { id: 'E', x: -8.6, z: -21.95, yaw: 0, w: 2.5, d: 1.7, style: 'mono', wallH: 1.7, highH: 2.1, t: 0.05, openings: [], glazed: true },
};
// The roof of shed B carries a cup (standY); shed A's shelf carries another.
export const SHED_ROOF_B = 1.95 + 0.06;               // h of the top of the felt roof
export const SHELF_A = { h: 0.95, depth: 0.26, hw: 0.5, t: 0.03 };

// The tea hut with its veranda, a table with the tea stand, chairs, the communal trough.
export const HUT = { x0: 6.6, x1: 10.8, z0: -14.4, z1: -11.8, eave: 2.5, ridge: 3.3, ov: 0.25,
  deck: { x0: 6.6, x1: 10.9, z0: -11.8, z1: -10.55, top: 0.2 },
  posts: [6.75, 8.5, 10.7].map((x) => ({ x, z: -10.72 })), roofFront: -10.85, roofH: 2.2,
  rail: { x0: 6.75, x1: 9.3, z: -10.72, top: 1.2, mid: 0.65 },
  table: { x: 10.1, z: -11.35, hx: 0.55, hz: 0.3, top: 0.94, t: 0.04 } };
export const TEA_STAND = { x: 10.1, z: -11.2, h: HUT.table.top };
export const CHAIRS = [
  { x: 6.95, z: -11.15, yaw: 0.15, kind: 'wood' }, { x: 8.55, z: -11.3, yaw: -0.35, kind: 'folding' },
  { x: 11.45, z: -10.9, yaw: 0.5, kind: 'deck' }, { x: 6.1, z: -10.9, yaw: -0.2, kind: 'wood2' },
];
export const TROUGH = { x: 12.3, z: -12.4, hx: 0.3, hz: 0.7, h: 0.55, plank: { h: 0.575, hx: 0.45, hz: 0.1, z: -12.1 } };

// Scarecrow and the cup on its hat brim.
export const SCARECROW = { x: 16.0, z: -17.6, yaw: 0.35, hatBrimH: 1.79, brimR: 0.27, crownR: 0.115 };

// Wigwams of bean poles: [x, z, base radius, height].
export const WIGWAMS = [[6.2, -16.4, 0.55, 2.2], [6.2, -18.0, 0.55, 2.1], [6.3, -19.2, 0.5, 2.0], [-12.9, -22.6, 0.5, 2.1]];
// Sweet-pea cane rows along x: [x0, x1, z, height, half-width at the base].
export const PEA_ROWS = [[-18.2, -13.8, -11.3, 2.0, 0.45], [-18.2, -13.8, -12.5, 2.0, 0.45]];

export const BUTTS = [
  { x: 6.15, z: -12.9, r: 0.31, h: 0.95, col: 0x2f5a3a }, { x: 10.05, z: -17.0, r: 0.3, h: 0.9, col: 0x2d4c6e },
  { x: -15.95, z: -14.1, r: 0.31, h: 0.95, col: 0x2f5a3a }, { x: -10.5, z: -21.3, r: 0.3, h: 0.9, col: 0x3d3f42 },
];
export const COLDFRAMES = [{ x: 11.3, z: -16.0, w: 1.3, d: 0.7, open: true, yaw: 0 }, { x: 11.3, z: -18.3, w: 1.3, d: 0.7, open: false, yaw: 0 }, { x: -1.2, z: -20.9, w: 1.3, d: 0.7, open: false, yaw: 0 }];
export const COMPOST = { x0: 15.4, z0: -14.5, bayW: 1.0, bayD: 1.05, n: 3, h: 1.0 };
export const BONFIRE = { x: 14.3, z: -13.2, r: 0.95, h: 1.3 };
export const BARROWS = [{ x: 14.6, z: -11.3, yaw: 0.4 }, { x: -3.3, z: -15.2, yaw: 2.6 }, { x: -12.0, z: -20.9, yaw: -0.4 }];
export const POND = { x: -15.8, z: -22.0, r: 1.15 };
export const LOGS = { x: -18.0, z: -21.2 };
export const TREES = [
  { x: -1.3, z: -22.3, trunkH: 0.95, trunkR: 0.085, crown: [[0, 2.0, 0, 0.85], [-0.55, 1.8, 0.25, 0.55], [0.5, 1.85, -0.2, 0.6]], kind: 'apple', seed: 4 },
  { x: 6.4, z: -22.4, trunkH: 0.95, trunkR: 0.08, crown: [[0, 1.95, 0, 0.8], [0.5, 1.8, 0.2, 0.55], [-0.5, 1.8, -0.25, 0.55]], kind: 'apple', seed: 9 },
  { x: 16.5, z: -22.0, trunkH: 1.0, trunkR: 0.09, crown: [[0, 2.1, 0, 0.9], [-0.6, 1.85, 0.2, 0.55], [0.55, 1.9, 0.25, 0.6]], kind: 'apple', seed: 14 },
];

// Open and cups --------------------------------------------------------------------------------------------
const MUG = { rOut: 0.047, rIn: 0.0415, height: 0.096, bottom: 0.009, water: 0.074 };
const TEACUP = { shape: 'teacup', rOut: 0.05, rIn: 0.045, height: 0.064, bottom: 0.007, water: 0.05, saucer: 0.082 };
const shelfCupZ = (S) => { const f = new Fr(S.x, S.z, S.yaw); return f.p(0, -S.d / 2 + S.t + SHELF_A.depth / 2); };
const [shedCupX, shedCupZ] = shelfCupZ(SHEDS.A);

export const CUPS = [
  { id: 'allot-shed', name: 'Shed shelf mug', ...MUG, x: shedCupX, z: shedCupZ, standY: Y(SHELF_A.h), baseY: Y(SHELF_A.h), handleYaw: Math.PI * 0.5, glaze: 0xc9663e, rim: 0xf0e2c8 },
  { id: 'allot-roof', name: 'Shed roof teacup', ...TEACUP, x: 1.45, z: -17.4, standY: Y(SHED_ROOF_B), baseY: Y(SHED_ROOF_B) + 0.008, handleYaw: -Math.PI * 0.5, glaze: 0xf2ece0, rim: 0x5f8f5a },
  { id: 'allot-trough', name: 'Trough mug', ...MUG, x: 12.3, z: -12.1, standY: Y(TROUGH.plank.h + 0.015), baseY: Y(TROUGH.plank.h + 0.015), handleYaw: Math.PI, glaze: 0x2f4f6b, rim: 0xe9e2d4 },
  { id: 'allot-hat', name: "Scarecrow's hat mug", ...MUG, x: SCARECROW.x + 0.19, z: SCARECROW.z, standY: Y(SCARECROW.hatBrimH), baseY: Y(SCARECROW.hatBrimH), handleYaw: Math.PI * 0.5, glaze: 0xe8c547, rim: 0xc0392b },
  { id: 'allot-hut', name: 'Veranda rail mug', ...MUG, x: 7.6, z: HUT.rail.z, standY: Y(HUT.rail.top), baseY: Y(HUT.rail.top), handleYaw: 0, glaze: 0xf3f1ea, rim: 0x2b4a8a },
];
export const STATIONS = [{
  x: TEA_STAND.x, z: TEA_STAND.z, y: Y(TEA_STAND.h),
  baseHalf: [0.12, 0.0075, 0.045], postX: 0.105, postHalf: 0.007, postHeight: 0.265, barY: 0.255, barHalf: 0.0055, pegReach: 0.062, pegY: 0.252, pegXs: [-0.055, 0, 0.055],
}];

// ------------------------------------------------------------------ shed geometry (local frame, shared)
// Solid wall boxes of a shed, honouring the open openings: [{ cx, h, cz, hx, hy, hz, wall }] (h = centre height).
export function wallBoxes(S) {
  const out = [], t = S.t, w = S.w, d = S.d;
  const hOf = (wall) => (S.style === 'mono' ? (wall === 'right' ? S.highH : S.wallH) : S.wallH);
  for (const wall of ['front', 'back', 'left', 'right']) {
    const alongX = wall === 'front' || wall === 'back';
    const len = alongX ? w : d - 2 * t, H = hOf(wall);
    const ops = S.openings.filter((o) => o.wall === wall && o.open).map((o) => [o.u - o.w / 2, o.u + o.w / 2, o.y0, o.y1]).sort((a, b) => a[0] - b[0]);
    const rects = [];
    let u = -len / 2;
    for (const [a, b, y0, y1] of ops) {
      if (a > u) rects.push([u, a, 0, H]);
      if (y0 > 0.001) rects.push([a, b, 0, y0]);
      if (y1 < H - 0.001) rects.push([a, b, y1, H]);
      u = b;
    }
    if (u < len / 2) rects.push([u, len / 2, 0, H]);
    // Glazed/closed openings stay solid (the render draws the window in the wall).
    const side = wall === 'front' ? 1 : wall === 'back' ? -1 : wall === 'right' ? 1 : -1;
    for (const [a, b, y0, y1] of rects) {
      const cu = (a + b) / 2, hu = (b - a) / 2, ch = (y0 + y1) / 2, hh = (y1 - y0) / 2;
      if (hu < 0.002 || hh < 0.002) continue;
      if (alongX) out.push({ wall, cx: cu, h: ch, cz: side * (d / 2 - t / 2), hx: hu, hy: hh, hz: t / 2 });
      else out.push({ wall, cx: side * (w / 2 - t / 2), h: ch, cz: cu, hx: t / 2, hy: hh, hz: hu });
    }
  }
  return out;
}

// Above-wall solids as convex hulls (gables, mono-pitch wedges): arrays of [lx, h, lz] points.
export function wallHulls(S) {
  const out = [], w = S.w, d = S.d, t = S.t;
  if (S.style === 'apex') {
    for (const sz of [1, -1]) {
      const z0 = sz * d / 2, z1 = sz * (d / 2 - t);
      out.push([[-w / 2, S.wallH, z0], [w / 2, S.wallH, z0], [0, S.ridgeH, z0], [-w / 2, S.wallH, z1], [w / 2, S.wallH, z1], [0, S.ridgeH, z1]]);
    }
  } else if (S.style === 'mono') {
    for (const sz of [1, -1]) {
      const z0 = sz * d / 2, z1 = sz * (d / 2 - t);
      out.push([[-w / 2, S.wallH, z0], [w / 2, S.wallH, z0], [w / 2, S.highH, z0], [-w / 2, S.wallH, z1], [w / 2, S.wallH, z1], [w / 2, S.highH, z1]]);
    }
  }
  return out;
}

// Roof slabs of a shed in the local frame: { c: [lx, h, lz], half: [hx, hy, hz], r: [rx, ry, rz] }.
export function roofPieces(S) {
  const w = S.w, d = S.d;
  if (S.style === 'flat') return [{ c: [0, S.wallH + 0.03, 0], half: [w / 2 + 0.1, 0.03, d / 2 + 0.1], r: [0, 0, 0] }];
  if (S.style === 'mono') {
    const rise = S.highH - S.wallH, ov = 0.12, ang = Math.atan2(rise, w), L = (w + 2 * ov) / Math.cos(ang);
    return [{ c: [0, (S.wallH + S.highH) / 2 + 0.035, 0], half: [L / 2, 0.025, d / 2 + 0.1], r: [0, 0, ang] }];
  }
  // apex, ridge along z: two slopes meeting at the ridge, with a little overhang
  const ov = 0.14, run = w / 2, rise = S.ridgeH - S.wallH, ang = Math.atan2(rise, run);
  const L = (run + ov) / Math.cos(ang);
  const lowH = S.wallH - ov * Math.tan(ang);
  return [-1, 1].map((s) => ({ c: [s * (run + ov) / 2, (lowH + S.ridgeH) / 2 + 0.03, 0], half: [L / 2, 0.022, d / 2 + 0.18], r: [0, 0, -s * ang] }));
}

// ------------------------------------------------------------------ colliders
export function colliders(w) {
  const bx = (hx, hh, hz, x, h, z, kind, mat, yaw = 0) => w.box(hx, hh, hz, x, Y(h), z, kind, mat, yaw);
  const cy = (r, hh, x, h, z, kind, mat) => w.cyl(r, hh, x, Y(h), z, kind, mat);
  const ball = (r, x, h, z, kind, mat) => w.ball(r, x, Y(h), z, kind, mat);
  const rail = (a, b, r, kind, mat) => w.rail([a[0], Y(a[1]), a[2]], [b[0], Y(b[1]), b[2]], r, kind, mat);
  const hull = (pts, kind, mat) => w.hull(pts.flatMap(([x, h, z]) => [x, Y(h), z]), kind, mat);
  const fbx = (F, hx, hh, hz, lx, h, lz, kind, mat, ry = 0) => { const [x, z] = F.p(lx, lz); return w.box(hx, hh, hz, x, Y(h), z, kind, mat, F.yaw + ry); };
  const fbq = (F, hx, hh, hz, lx, h, lz, kind, mat, rx, ry, rz) => { const [x, z] = F.p(lx, lz); return w.boxQ(hx, hh, hz, x, Y(h), z, kind, mat, qLocal(F.yaw, rx, ry, rz)); };
  const fhull = (F, pts, kind, mat) => hull(pts.map(([lx, h, lz]) => { const [x, z] = F.p(lx, lz); return [x, h, z]; }), kind, mat);
  const fcyl = (F, r, hh, lx, h, lz, kind, mat) => { const [x, z] = F.p(lx, lz); return cy(r, hh, x, h, z, kind, mat); };

  // ---- the lane: bins, lamp post, telegraph poles and their wires
  for (const v of VERGE) if (v.h > 0.7) ball(v.r * 0.8, v.x, v.h * 0.5, v.z, 'verge', 'plant');
  for (const b of BINS) bx(0.29, 0.53, 0.36, b.x, 0.53, b.z, 'bin', 'plastic', b.yaw);
  cy(0.05, LAMP.h / 2, LAMP.x, LAMP.h / 2, LAMP.z, 'lamp', 'metal');
  bx(0.2, 0.09, 0.09, LAMP.x - 0.2, LAMP.h + 0.02, LAMP.z, 'lamp', 'metal');
  for (const p of POLES) {
    cy(0.1, p.h / 2, p.x, p.h / 2, p.z, 'pole', 'wood');
    bx(0.06, 0.06, 0.62, p.x, p.h - 0.4, p.z, 'pole', 'wood');
  }
  for (const wz of WIRE_Z) {
    const [a, b] = POLES, n = 10;
    let prev = [a.x, WIRE_H, wz];
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, h = WIRE_H - WIRE_SAG * 4 * t * (1 - t);
      rail(prev, [x, h, wz], 0.012, 'wire', 'metal');
      prev = [x, h, wz];
    }
  }

  // ---- our back gate: timber arch in the hedge gap (posts sit in the hedge), open gate leaf in the lane
  for (const px of [GATE.x0 - 0.05, GATE.x1 + 0.05]) bx(GATE.postT / 2, GATE.postH / 2, 0.06, px, GATE.postH / 2, GATE.zc, 'gatepost', 'wood');
  bx(0.5, 0.1, 0.13, (GATE.x0 + GATE.x1) / 2, GATE.beamH, GATE.zc, 'arch', 'wood');
  bx(0.46, 0.09, 0.2, (GATE.x0 + GATE.x1) / 2, GATE.beamH + 0.2, GATE.zc, 'honeysuckle', 'plant');
  {
    const G = GATE_LEAF, len = G.z0 - G.z1, zc = (G.z0 + G.z1) / 2;
    bx(G.t / 2, (G.h1 - G.h0) / 2, len / 2, G.hingeX, (G.h0 + G.h1) / 2, zc, 'gate', 'wood');
  }

  // ---- the allotment fence along the lane's far side, and the five-bar gate in it
  {
    const C = FENCES.chain, R = FENCES.rail, t = 0.02;
    runColliders(w, { a: [C.x0, FENCE_Z], b: [C.x1, FENCE_Z], h: C.h, t, kind: 'chainlink', material: 'metal' });
    const nC = Math.round((C.x1 - C.x0) / 2.4);
    for (let i = 0; i <= nC; i++) bx(0.045, (C.h + 0.1) / 2, 0.045, C.x0 + (C.x1 - C.x0) * i / nC, (C.h + 0.1) / 2, FENCE_Z, 'fencepost', 'wood');
    const nR = Math.round((R.x1 - R.x0) / 2.4);
    for (let i = 0; i <= nR; i++) {
      const x = R.x0 + (R.x1 - R.x0) * i / nR;
      bx(0.05, (R.h + 0.08) / 2, 0.05, x, (R.h + 0.08) / 2, FENCE_Z, 'fencepost', 'wood');
    }
    for (const rh of [0.3, 0.72, 1.12]) bx((R.x1 - R.x0) / 2, 0.035, 0.022, (R.x0 + R.x1) / 2, rh, FENCE_Z + 0.06, 'fence', 'wood');
    const g = FIELD_GATE;
    for (const px of [g.x0, g.x1]) bx(g.post / 2, g.postH / 2, g.post / 2, px, g.postH / 2, FENCE_Z, 'gatepost', 'wood');
    for (const bh of g.bars) bx((g.leaf1 - g.leaf0) / 2, g.barHalf, g.barT / 2, (g.leaf0 + g.leaf1) / 2, bh, FENCE_Z, 'gate', 'wood');
    for (const sx of [g.leaf0 + 0.04, g.leaf1 - 0.04]) bx(0.04, (g.bars[4] - g.bars[0] + 0.1) / 2, g.barT / 2, sx, (g.bars[4] + g.bars[0]) / 2, FENCE_Z, 'gate', 'wood');
    bx(0.04, (g.bars[4] - g.bars[0] + 0.1) / 2, g.barT / 2, (g.leaf0 + g.leaf1) / 2 + 0.2, (g.bars[4] + g.bars[0]) / 2, FENCE_Z, 'gate', 'wood');
    rail([g.leaf0 + 0.08, g.bars[0], FENCE_Z], [g.leaf1 - 0.08, g.bars[4], FENCE_Z], 0.03, 'gate', 'wood');
    // Noticeboard on two posts, lane side of the fence.
    const n = NOTICE;
    for (const sx of [-1, 1]) bx(0.04, (n.y0 + n.h) / 2, 0.04, n.x + sx * (n.w / 2 - 0.05), (n.y0 + n.h) / 2, n.z, 'sign', 'wood');
    bx(n.w / 2, n.h / 2, 0.03, n.x, n.y0 + n.h / 2, n.z, 'sign', 'wood');
    bx(n.w / 2 + 0.04, 0.03, 0.07, n.x, n.y0 + n.h + 0.05, n.z, 'sign', 'wood');   // little roof
  }
  // Side hedges and the park-edge hedge with the stile gap.
  for (const sx of [-SIDE_X, SIDE_X]) runColliders(w, { a: [sx, FENCE_Z], b: [sx, PARK_HEDGE.z0], h: 1.8, t: 0.55, kind: 'hedge', material: 'plant' });
  {
    const H = PARK_HEDGE, zc = (H.z0 + H.z1) / 2;
    runColliders(w, { a: [-SIDE_X - 0.3, zc], b: [SIDE_X + 0.3, zc], h: H.h, t: H.z1 - H.z0, gaps: [[H.gap[0] + SIDE_X + 0.3, H.gap[1] + SIDE_X + 0.3]], kind: 'hedge', material: 'plant' });
    const S = STILE, gy = 0, gp = groundHeight(S.x, zc - 0.67) - FY;
    for (const sx of [-1, 1]) bx(0.055, 0.7, 0.055, S.x + sx * (S.w / 2 + 0.005), 0.7 + gy, zc, 'stile', 'wood');
    for (const rh of [S.top, S.mid]) bx(S.w / 2, 0.04, 0.035, S.x, rh + gy, zc, 'stile', 'wood');
    bx(0.3, 0.14, 0.2, S.x, 0.14, zc + 0.62, 'stile', 'wood');
    bx(0.3, 0.2, 0.2, S.x, gp + 0.1, zc - 0.67, 'stile', 'wood');
  }

  // ---- sheds
  for (const S of Object.values(SHEDS)) {
    const F = new Fr(S.x, S.z, S.yaw);
    if (S.glazed) {
      // Recycled-window greenhouse shed: one solid body, glass faces.
      fbx(F, S.w / 2, (S.highH + S.wallH) / 4, S.d / 2, 0, (S.highH + S.wallH) / 4, 0, 'shed', 'glass');
      fhull(F, [[-S.w / 2, S.wallH, S.d / 2], [S.w / 2, S.wallH, S.d / 2], [S.w / 2, S.highH, S.d / 2], [-S.w / 2, S.wallH, -S.d / 2], [S.w / 2, S.wallH, -S.d / 2], [S.w / 2, S.highH, -S.d / 2]], 'shed', 'glass');
    } else {
      for (const b of wallBoxes(S)) fbx(F, b.hx, b.hy, b.hz, b.cx, b.h, b.cz, 'shed', 'wood');
      for (const h of wallHulls(S)) fhull(F, h, 'shed', 'wood');
      // Floor boards (a little proud of the ground), so you can land inside.
      fbx(F, S.w / 2 - S.t, 0.03, S.d / 2 - S.t, 0, 0.03, 0, 'shed', 'wood');
    }
    for (const r of roofPieces(S)) fbq(F, r.half[0], r.half[1], r.half[2], r.c[0], r.c[1], r.c[2], 'shedroof', S.style === 'apex' ? 'tile' : 'metal', r.r[0], r.r[1], r.r[2]);
    if (S.id === 'C') {
      // The back shutter propped open above the window like an awning.
      const [sx, sz] = F.p(0, -S.d / 2 - 0.3);
      fbx(F, 0.34, 0.012, 0.3, 0, 1.52, -S.d / 2 - 0.28, 'shutter', 'wood');
      void sx; void sz;
    }
    if (S.door) {
      // The door swung open past square against the outside of the wall.
      const D = S.door, ang = D.open * Math.PI / 180, c = D.hinge < 0 ? 1 : -1;
      const dx = c * Math.cos(ang), dz = Math.sin(ang);
      fbx(F, D.leaf / 2, 0.9, 0.02, D.hinge + dx * D.leaf / 2, 0.92, S.d / 2 + 0.03 + dz * D.leaf / 2, 'door', 'wood', -Math.atan2(dz, dx));
    }
  }
  // Inside shed A: the shelf (with the mug on it), potting bench, hanging tools.
  {
    const S = SHEDS.A, F = new Fr(S.x, S.z, S.yaw), sh = SHELF_A;
    fbx(F, sh.hw, sh.t / 2, sh.depth / 2, 0, sh.h - sh.t / 2, -S.d / 2 + S.t + sh.depth / 2, 'shelf', 'wood');
    fbx(F, 0.32, 0.43, 0.3, 0.74, 0.43, 0.2, 'bench', 'wood');                      // potting bench under the right window
    fbx(F, 0.06, 0.55, 0.06, 0.74, 0.55, 0.2, 'bench', 'wood');
    fbx(F, 0.4, 0.04, 0.12, 0.7, 1.52, -0.55, 'shelf', 'wood');
    fbx(F, 0.2, 0.3, 0.2, -0.8, 0.3, S.d / 2 - 0.4, 'stack', 'ceramic');             // stack of pots by the door
  }
  // Inside shed C: a bench along one wall and a shelf over it (the route passes down the middle).
  {
    const S = SHEDS.C, F = new Fr(S.x, S.z, S.yaw);
    fbx(F, 0.28, 0.42, 1.0, -0.78, 0.42, 0.0, 'bench', 'wood');
    fbx(F, 0.13, 0.03, 1.0, -0.9, 1.55, 0.0, 'shelf', 'wood');
  }

  // ---- tea hut: body, roof, veranda, table, chairs, trough
  {
    const H = HUT, spec = { x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1, eave: Y(H.eave), ridgeY: Y(H.ridge), ridge: 'x', overhang: H.ov };
    const hh = H.eave / 2;
    bx((H.x1 - H.x0) / 2, hh, (H.z1 - H.z0) / 2, (H.x0 + H.x1) / 2, hh, (H.z0 + H.z1) / 2, 'hut', 'wood');
    for (const r of roofSlabs(spec)) w.boxQ(r.hx, r.hy, r.hz, r.cx, r.cy, r.cz, 'hutroof', 'tile', r.quat);
    for (const gx of [H.x0, H.x1]) {
      const sx = gx === H.x0 ? 1 : -1, z0 = H.z0, z1 = H.z1, zm = (z0 + z1) / 2;
      hull([[gx, H.eave, z0], [gx, H.eave, z1], [gx, H.ridge, zm], [gx + sx * 0.18, H.eave, z0], [gx + sx * 0.18, H.eave, z1], [gx + sx * 0.18, H.ridge, zm]], 'hut', 'wood');
    }
    const D = H.deck;
    bx((D.x1 - D.x0) / 2, D.top / 2, (D.z1 - D.z0) / 2, (D.x0 + D.x1) / 2, D.top / 2, (D.z0 + D.z1) / 2, 'deck', 'wood');
    bx(0.45, 0.06, 0.15, 8.0, 0.06, D.z1 + 0.15, 'step', 'wood');
    for (const p of H.posts) bx(0.05, H.roofH / 2, 0.05, p.x, H.roofH / 2, p.z, 'post', 'wood');
    // veranda roof: from the hut's front eave down to roofFront
    {
      const zA = H.z1 - 0.2, hA = H.eave - 0.14, zB = H.roofFront, hB = H.roofH + 0.1, len = Math.hypot(zA - zB, hA - hB);
      w.boxQ((H.x1 - H.x0 + 0.5) / 2, 0.03, len / 2, (H.x0 + H.x1) / 2, Y((hA + hB) / 2), (zA + zB) / 2, 'hutroof', 'metal', quat(Math.atan2(hA - hB, zB - zA), 0, 0));
    }
    const R = H.rail;
    bx((R.x1 - R.x0) / 2, 0.02, 0.08, (R.x0 + R.x1) / 2, R.top - 0.02, R.z, 'rail', 'wood');
    bx((R.x1 - R.x0) / 2, 0.02, 0.025, (R.x0 + R.x1) / 2, R.mid, R.z, 'rail', 'wood');
    // balusters
    for (let x = R.x0 + 0.12; x < R.x1 - 0.05; x += 0.2) bx(0.017, (R.top - D.top) / 2, 0.017, x, D.top + (R.top - D.top) / 2, R.z, 'rail', 'wood');
    // side rail on the west end and the open table bay
    bx(0.025, (R.top - D.top) / 2, (D.z1 - 0.1 - D.z0) / 2 , D.x0 + 0.03, D.top + (R.top - D.top) / 2, (D.z0 + D.z1 - 0.1) / 2, 'rail', 'wood');
    const T = H.table;
    bx(T.hx, T.t / 2, T.hz, T.x, T.top - T.t / 2, T.z, 'table', 'wood');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(0.025, (T.top - T.t - D.top) / 2, 0.025, T.x + sx * (T.hx - 0.06), D.top + (T.top - T.t - D.top) / 2, T.z + sz * (T.hz - 0.06), 'table', 'wood');
    // the tea hut's kettle and tray on the table
    cy(0.09, 0.09, 9.72, T.top + 0.09, -11.4, 'kettle', 'metal');
    bx(0.14, 0.01, 0.1, 9.72, T.top + 0.01, -11.4, 'tray', 'metal');
    bx(0.12, 0.05, 0.08, 10.45, T.top + 0.05, -11.55, 'tin', 'metal');
    for (const c of CHAIRS) chair(c);
    const Tr = TROUGH;
    bx(Tr.hx, Tr.h / 2, Tr.hz, Tr.x, Tr.h / 2, Tr.z, 'trough', 'metal');
    bx(Tr.plank.hx, 0.015, Tr.plank.hz, Tr.x, Tr.plank.h, Tr.plank.z, 'plank', 'wood');
    cy(0.055, 0.7, 7.6, H.ridge + 0.4, -13.1, 'flue', 'metal');
    // the standpipe and tap beside it
    cy(0.03, 0.45, Tr.x + 0.55, 0.45, Tr.z - 0.45, 'pipe', 'metal');
  }
  // Chair colliders fitted to the chair kit's models (src/sim/chairShapes.js; drawn by src/render/chairs.js).
  function chair(c) {
    const F = new Fr(c.x, c.z, c.yaw);
    const dh = c.x > 6.7 && c.x < 10.9 && c.z > -11.8 ? HUT.deck.top : 0;
    // A bar in the chair's side plane at x = lx, from a to b given as [z, y] in the chair frame.
    const bar = (lx, a, b, hw, hd) => {
      const dz = b[0] - a[0], dy = b[1] - a[1];
      fbq(F, hw, Math.hypot(dz, dy) / 2, hd, lx, dh + (a[1] + b[1]) / 2, (a[0] + b[0]) / 2, 'chair', 'wood', Math.atan2(dz, dy), 0, 0);
    };
    if (c.kind === 'deck') {
      const D = DECK, zy = (p) => [p[0], p[1]];
      for (const sx of [-1, 1]) {
        bar(sx * D.railX, zy(D.foot), zy(D.top), 0.012, 0.02);
        bar(sx * D.seatX, [D.hinge[0] - 0.09, D.hinge[1] - 0.06], [D.front[0] + 0.01, D.front[1]], 0.011, 0.017);
        bar(sx * D.legX, zy(D.legFoot), [D.front[0] - 0.03, D.front[1] + 0.03], 0.011, 0.018);
      }
      bar(0, [D.top[0], D.top[1]], [0.02, 0.43], D.slingW / 2, 0.006);                     // the sagging sling, in two slabs
      bar(0, [0.02, 0.43], [D.front[0], D.front[1] + 0.01], D.slingW / 2, 0.006);
    } else if (c.kind === 'folding') {
      const Fd = FOLDING, lean = Math.atan2(Fd.main[0][2] - Fd.main[1][2], Fd.main[1][1]);
      for (const sx of [-1, 1]) {
        bar(sx * 0.194, [Fd.main[0][2], 0], [Fd.main[1][2], Fd.main[1][1]], 0.011, 0.011);
        bar(sx * 0.181, [Fd.rear[0][2], 0], [Fd.rear[1][2], Fd.rear[1][1]], 0.011, 0.011);
      }
      fbx(F, 0.19, 0.021, 0.18, 0, dh + 0.449, 0.01, 'chair', 'metal');
      fbq(F, 0.185, 0.07, 0.012, 0, dh + Fd.backY, foldingMainZ(Fd.backY) - 0.02, 'chair', 'metal', -lean, 0, 0);
    } else {
      const L = LADDER;
      fbx(F, 0.21, 0.051, 0.205, 0, dh + 0.411, 0, 'chair', 'wood');
      for (const sx of [-1, 1]) {
        fbx(F, 0.0185, 0.18, 0.0185, sx * L.front.x, dh + 0.18, L.front.z, 'chair', 'wood');
        fbx(F, 0.017, 0.18, 0.017, sx * L.back.x, dh + 0.18, (L.postFootZ + L.back.z) / 2, 'chair', 'wood');
        bar(sx * (L.back.x - 0.002), [L.back.z, L.rail], [L.postTop.z, L.postTop.y], 0.017, 0.016);
      }
      fbq(F, L.back.x - 0.01, 0.185, 0.015, 0, dh + 0.757, ladderPostZ(0.757) - 0.012, 'chair', 'wood', -L.rake, 0, 0);
    }
  }

  // ---- sweet-pea cane rows: two foliage slabs leaning together per row
  for (const [x0, x1, z, hgt, hw] of PEA_ROWS) {
    const ang = Math.atan2(hgt, hw), L = Math.hypot(hw, hgt);
    for (const s of [-1, 1]) w.boxQ((x1 - x0) / 2, 0.06, L / 2, (x0 + x1) / 2, Y(hgt / 2), z + s * hw / 2, 'sweetpeas', 'plant', quat(s * ang, 0, 0));
  }

  // ---- bean wigwams (cone hulls), the bean tunnel, the polytunnel, sunflowers, cages
  for (const [x, z, r, hgt] of WIGWAMS) {
    const pts = [[x, hgt, z]];
    for (let i = 0; i < 8; i++) pts.push([x + Math.cos(i / 8 * TAU) * r * 0.8, 0, z + Math.sin(i / 8 * TAU) * r * 0.8]);
    hull(pts, 'wigwam', 'plant');
  }
  {
    const B = BT, ang = Math.atan2(B.top, B.hw), L = Math.hypot(B.hw, B.top);
    for (const s of [-1, 1]) w.boxQ((B.x1 - B.x0) / 2, B.thick / 2, L / 2, (B.x0 + B.x1) / 2, Y(B.top / 2), B.zc + s * B.hw / 2, 'beantunnel', 'plant', quat(s * ang, 0, 0));
    bx((B.x1 - B.x0) / 2, 0.05, 0.06, (B.x0 + B.x1) / 2, B.top, B.zc, 'beantunnel', 'plant');
  }
  {
    const P = PT, n = 14, len = P.x1 - P.x0;
    const pt = (i) => { const a = Math.PI * i / n; return [P.zc + P.rx * Math.cos(a), P.ry * Math.sin(a)]; };
    for (let i = 0; i < n; i++) {
      const [z0, h0] = pt(i), [z1, h1] = pt(i + 1);
      const L = Math.hypot(z1 - z0, h1 - h0), ang = Math.atan2(h1 - h0, z1 - z0);
      // skip nothing: end walls are separate hulls, the skin is one slab per panel
      w.boxQ(len / 2, 0.025, L / 2, (P.x0 + P.x1) / 2, Y((h0 + h1) / 2), (z0 + z1) / 2, 'polytunnel', 'plastic', quat(-ang, 0, 0));
    }
    // end walls with the door cut out: left piece, right piece, lintel piece (convex hulls)
    for (const xe of [P.x0, P.x1]) {
      const sx = xe === P.x0 ? 1 : -1, dx = 0.04 * sx;
      const el = (dz) => P.ry * Math.sqrt(1 - (dz / P.rx) ** 2);
      const arc = (a, b, k) => { const o = []; for (let i = 0; i <= k; i++) { const dz = a + (b - a) * i / k; o.push([dz, el(dz)]); } return o; };
      const mk = (poly) => { const pts = []; for (const [dz, h] of poly) { pts.push([xe, h, P.zc + dz]); pts.push([xe + dx, h, P.zc + dz]); } hull(pts, 'polytunnel', 'plastic'); };
      mk([[-P.rx, 0], [-P.doorHW, 0], ...arc(-P.doorHW, -P.rx + 0.0001, 5)]);
      mk([[P.doorHW, 0], [P.rx, 0], ...arc(P.rx - 0.0001, P.doorHW, 5)]);
      mk([[-P.doorHW, P.doorH], [P.doorHW, P.doorH], ...arc(P.doorHW, -P.doorHW, 4)]);
      for (const sz of [-1, 1]) bx(0.05, P.doorH / 2, 0.04, xe + dx / 2, P.doorH / 2, P.zc + sz * (P.doorHW + 0.035), 'doorframe', 'wood');
    }
    // tomatoes along both sides (a solid row each)
    for (const s of [-1, 1]) bx(len / 2 - 0.4, P.tomatoH / 2, P.tomatoHW, (P.x0 + P.x1) / 2, P.tomatoH / 2, P.zc + s * P.tomatoZ, 'tomatoes', 'plant');
  }
  for (const s of SUNFLOWERS) {
    rail([s.x, 0, s.z], [s.x, s.h, s.z], 0.032, 'sunflower', 'plant');
    ball(s.dwarf ? 0.15 : 0.19, s.x, s.h + 0.02, s.z, 'sunflower', 'plant');
    if (s.slalom) { ball(0.17, s.x, 1.05, s.z, 'sunflower', 'plant'); ball(0.15, s.x, 1.6, s.z, 'sunflower', 'plant'); } else ball(0.15, s.x, 0.9, s.z, 'sunflower', 'plant');
  }
  for (const c of CAGES) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    bx(hx, c.h / 2, 0.02, cx, c.h / 2, c.z0, 'net', 'rope');
    bx(hx, c.h / 2, 0.02, cx, c.h / 2, c.z1, 'net', 'rope');
    bx(0.02, c.h / 2, hz, c.x0, c.h / 2, cz, 'net', 'rope');
    bx(0.02, c.h / 2, hz, c.x1, c.h / 2, cz, 'net', 'rope');
    bx(hx, 0.02, hz, cx, c.h, cz, 'net', 'rope');
    for (const [px, pz] of [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1], [cx, c.z0], [cx, c.z1]]) bx(0.03, (c.h + 0.1) / 2, 0.03, px, (c.h + 0.1) / 2, pz, 'cage', 'wood');
  }

  // ---- water butts, cold frames, compost bays, bonfire, barrows, scarecrow, logs
  for (const b of BUTTS) { cy(b.r, b.h / 2, b.x, 0.3 + b.h / 2, b.z, 'butt', 'plastic'); bx(0.35, 0.15, 0.35, b.x, 0.15, b.z, 'butt', 'stone'); }
  for (const c of COLDFRAMES) {
    const F = new Fr(c.x, c.z, c.yaw);
    fbx(F, c.w / 2, 0.17, c.d / 2, 0, 0.17, 0, 'coldframe', 'wood');
    if (c.open) {
      const a = 55 * Math.PI / 180, L = c.d + 0.04;
      fbq(F, c.w / 2, 0.012, L / 2, 0, 0.36 + Math.sin(a) * L / 2, -c.d / 2 - Math.cos(a) * L / 2 + 0.02, 'coldframe', 'glass', a, 0, 0);
    } else fbq(F, c.w / 2, 0.012, c.d / 2 + 0.02, 0, 0.36, 0, 'coldframe', 'glass', 0.12, 0, 0);
  }
  for (let i = 0; i < COMPOST.n; i++) {
    const cx = COMPOST.x0 + COMPOST.bayW * (i + 0.5), cz = COMPOST.z0 - COMPOST.bayD / 2, h = COMPOST.h;
    bx(0.03, h / 2, COMPOST.bayD / 2, COMPOST.x0 + COMPOST.bayW * i, h / 2, cz, 'compost', 'wood');
    bx(COMPOST.bayW / 2, h / 2, 0.03, cx, h / 2, cz - COMPOST.bayD / 2, 'compost', 'wood');
    bx(COMPOST.bayW / 2, 0.3, 0.03, cx, 0.3, cz + COMPOST.bayD / 2, 'compost', 'wood');
  }
  bx(0.03, COMPOST.h / 2, COMPOST.bayD / 2, COMPOST.x0 + COMPOST.bayW * COMPOST.n, COMPOST.h / 2, COMPOST.z0 - COMPOST.bayD / 2, 'compost', 'wood');
  {
    const B = BONFIRE, pts = [[B.x, B.h, B.z]];
    for (let i = 0; i < 9; i++) pts.push([B.x + Math.cos(i / 9 * TAU) * B.r * 0.85, 0.05, B.z + Math.sin(i / 9 * TAU) * B.r * 0.85]);
    hull(pts, 'bonfire', 'wood');
  }
  for (const b of BARROWS) {
    const F = new Fr(b.x, b.z, b.yaw);
    fbx(F, 0.28, 0.14, 0.4, 0, 0.5, -0.1, 'barrow', 'metal');
    fcyl(F, 0.2, 0.04, 0, 0.2, 0.46, 'barrow', 'rubber');
    for (const sx of [-1, 1]) { const [x1, z1] = F.p(sx * 0.24, -0.1), [x2, z2] = F.p(sx * 0.24, -0.88); rail([x1, 0.38, z1], [x2, 0.62, z2], 0.02, 'barrow', 'wood'); const [lx, lz] = F.p(sx * 0.24, -0.82); cy(0.014, 0.19, lx, 0.19, lz, 'barrow', 'wood'); }
  }
  {
    const S = SCARECROW, F = new Fr(S.x, S.z, S.yaw);
    rail([S.x, 0, S.z], [S.x, 1.7, S.z], 0.04, 'scarecrow', 'wood');
    const [a1, b1] = F.p(-0.78, 0), [a2, b2] = F.p(0.78, 0);
    rail([a1, 1.42, b1], [a2, 1.42, b2], 0.025, 'scarecrow', 'wood');
    fbx(F, 0.19, 0.3, 0.1, 0, 1.2, 0, 'scarecrow', 'cloth');
    ball(0.12, S.x, 1.62, S.z, 'scarecrow', 'cloth');
    cy(S.brimR, 0.007, S.x, S.hatBrimH - 0.007, S.z, 'hat', 'cloth');
    cy(S.crownR, 0.08, S.x, S.hatBrimH + 0.07, S.z, 'hat', 'cloth');
  }
  {
    const L = LOGS;
    bx(0.5, 0.1, 0.13, L.x, 0.1, L.z, 'logs', 'wood', 0.3);
    bx(0.45, 0.09, 0.12, L.x + 0.05, 0.28, L.z + 0.03, 'logs', 'wood', -0.2);
    cy(0.12, 0.11, L.x - 0.2, 0.11, L.z + 0.4, 'logs', 'wood');
  }
  // reeds and marginals round the wildlife pond
  for (let i = 0; i < 5; i++) { const a = 0.4 + i * 0.5; ball(0.17, POND.x + Math.cos(a) * (POND.r + 0.1), 0.5, POND.z - Math.sin(a) * (POND.r + 0.1) - 0.2, 'reeds', 'plant'); }

  // ---- fruit trees
  for (const t of TREES) treeColliders(w, { x: t.x, z: t.z, trunkH: t.trunkH, trunkR: t.trunkR, crown: t.crown });
}
