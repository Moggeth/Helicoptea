import * as THREE from 'three';
import { FY, STREAM, POND, KNOLL, WOOD, streamZ, groundHeight } from './plan.js';
import { treeColliders, runColliders } from './shapes.js';

// The 'park' area (box AREAS.park in plan.js): a meadow below the allotments, a stream across it (a timber
// footbridge, stepping stones, a weir), a pond with a jetty and a rowing boat, the big oak on the knoll
// with a rope swing, woodland (a fallen log, a bluebell glade, a den), and the park's furniture: gravel
// paths, benches, an octagonal bandstand, a children's play area, bins, a picnic. This module holds the
// layout shared with the drawing (src/render/world/areas/park.js), the fixed colliders, the cups and the
// tea stand. Everything stands on groundHeight().

const G = groundHeight;
const TAU = Math.PI * 2;

// Local frame helper: a point (lx, lz) in a frame at (x, z) turned by yaw about y (same turn as T() and
// w.box's yaw: local +x -> (cos, -sin), local +z -> (sin, cos)).
export const frameAt = (c, lx, lz) => { const s = Math.sin(c.yaw || 0), k = Math.cos(c.yaw || 0); return [c.x + lx * k + lz * s, c.z - lx * s + lz * k]; };
const gy = (c, lx, lz) => { const [x, z] = frameAt(c, lx, lz); return G(x, z); };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ the layout
const bridgeX = -7.5;
const bridgeSlope = (streamZ(bridgeX + 0.01) - streamZ(bridgeX - 0.01)) / 0.02;

export const PK = {
  gate: { x: 4.0, z: -24.5 },                       // where the allotments' stile or gap meets the park
  paths: {
    // Gravel walks: [points], width.
    gate: { pts: [[4.0, -24.3], [3.2, -25.6], [0.6, -26.8], [-0.4, -27.2]], w: 1.9 },
    bridge: { pts: [[-4.6, -28.3], [-6.3, -28.9], [-7.3, -29.8], [-7.5, -30.6]], w: 1.7 },
    over: { pts: [[-7.5, -33.8], [-7.9, -34.8], [-8.6, -35.5]], w: 1.7 },
    pondRound: { pts: [[-7.5, -33.8], [-5.8, -34.5], [-3.2, -34.4], [-0.6, -33.6], [2.2, -33.1], [4.8, -33.7], [7.2, -35.8]], w: 1.7 },
    east: { pts: [[4.0, -24.6], [5.2, -25.5], [8.0, -25.7], [12.5, -25.6], [15.5, -26.3]], w: 1.5 },
  },
  // Dirt tracks in the wood.
  woodPath: [[7.2, -35.8], [9.4, -37.6], [11.4, -39.6], [13.0, -41.0], [15.4, -41.0], [17.2, -38.6], [17.4, -35.6], [16.2, -33.4]],
  bandstand: { x: -2.5, z: -27.2, R: 2.05, rRoof: 2.75, plat: 0.78, colH: 3.0, apexH: 4.5, rPlat: 2.45, gapYaw: [0, Math.PI] },
  bridge: { x: bridgeX, z: streamZ(bridgeX), yaw: -Math.atan(bridgeSlope), w: 1.1, len: 4.2 },
  weir: { x: -12.6, z: streamZ(-12.6), yaw: -Math.atan((streamZ(-12.59) - streamZ(-12.61)) / 0.02), drop: 0.13 },
  stones: { x: 3.7, n: 5 },
  jetty: { x: -9.0, z: -35.1, yaw: 0, w: 1.35, len: 3.4, deckAbove: 0.62 },
  boat: { x: -10.8, z: -37.3, yaw: 0.1, L: 2.55, B: 1.12 },
  oak: { x: KNOLL.x, z: KNOLL.z, trunkR: 0.62, trunkH: 3.1 },
  swing: { limbAngle: 1.62 },                      // the rope-swing limb's direction (radians from +x towards +z)
  play: { x0: 0.0, x1: 7.0, z0: -39.8, z1: -33.7, gate: [2.2, 3.4] },
  benchFlask: { x: 6.3, z: -26.7, yaw: Math.PI },
  benchPond: { x: -5.55, z: -36.6, yaw: -2.18 },
  bins: [[7.8, -26.4], [-0.9, -25.4], [-5.9, -35.2], [1.6, -33.9]],
  picnic: { x: 11.2, z: -26.4, yaw: 0.2, w: 1.9, d: 1.5 },
  glade: { x: 15.6, z: -37.2, r: 3.0 },
  log: { a: [8.2, -41.9], b: [13.3, -43.0], hA: 1.5, hB: 0.34, r: 0.33 },
  den: { x: 10.9, z: -34.8 },
  kite: { x: 0, z: 0 },                              // set below from the oak
  slalom: { x0: 8.4, dx: 1.85, z: -45.3, n: 6 },
};
PK.pond = POND;

// The bandstand's octagon: vertices at 22.5 + 45k degrees, radius r.
export function octagon(c, r, y = 0) {
  const out = [];
  for (let k = 0; k < 8; k++) { const a = (22.5 + 45 * k) * Math.PI / 180; out.push([c.x + r * Math.cos(a), y, c.z + r * Math.sin(a)]); }
  return out;
}
export function bandstandInfo() {
  const B = PK.bandstand;
  let lo = Infinity, hi = -Infinity;
  for (const p of octagon(B, B.rPlat)) { const g = G(p[0], p[2]); lo = Math.min(lo, g); hi = Math.max(hi, g); }
  const gc = G(B.x, B.z);
  const top = Math.max(gc, hi) + B.plat;
  return { top, base: lo - 0.15, gc };
}

// ------------------------------------------------------------------ the trees
// kind: 'oak' | 'birch' | 'ash' | 'conifer'. crown: [dx, dy, dz, r] with dy from the ground (as shapes.js).
function mkTree(kind, x, z, rnd) {
  const y = G(x, z);
  let trunkH, trunkR, crown = [];
  if (kind === 'oak') {
    trunkH = 2.3 + rnd() * 0.8; trunkR = 0.26 + rnd() * 0.12;
    const n = 4 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = 0.9 + rnd() * 1.6; crown.push([Math.cos(a) * d, trunkH + 1.3 + rnd() * 2.4, Math.sin(a) * d, 1.5 + rnd() * 0.7]); }
    crown.push([0, trunkH + 3.6 + rnd(), 0, 1.7 + rnd() * 0.4]);
  } else if (kind === 'ash') {
    trunkH = 3.0 + rnd() * 0.8; trunkR = 0.17 + rnd() * 0.07;
    const n = 4;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rnd(), d = 0.7 + rnd() * 0.9; crown.push([Math.cos(a) * d, trunkH + 1.0 + rnd() * 2.8, Math.sin(a) * d, 1.2 + rnd() * 0.5]); }
    crown.push([0, trunkH + 3.4, 0, 1.3]);
  } else if (kind === 'birch') {
    trunkH = 2.8 + rnd() * 0.8; trunkR = 0.075 + rnd() * 0.04;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + rnd(), d = 0.35 + rnd() * 0.45; crown.push([Math.cos(a) * d, trunkH + 0.6 + i * 1.0 + rnd() * 0.5, Math.sin(a) * d, 0.8 + rnd() * 0.35]); }
    crown.push([0, trunkH + 3.2, 0, 0.8]);
  } else {
    trunkH = 1.4; trunkR = 0.16 + rnd() * 0.05;
    const s = 0.85 + rnd() * 0.35;
    crown = [[0, 2.8 * s, 0, 1.75 * s], [0, 4.3 * s, 0, 1.4 * s], [0, 5.7 * s, 0, 1.0 * s], [0, 6.8 * s, 0, 0.6 * s]];
  }
  return { kind, x, z, y, trunkH, trunkR, crown, seed: Math.round(x * 131 + z * 71) & 0xffff };
}

// Is (x, z) kept clear of trees (water, paths, furniture)?
function nearSeg(x, z, pts, w) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < w) return true;
  }
  return false;
}
function blockedForTree(x, z, margin = 0) {
  if (Math.abs(z - streamZ(x)) < 2.3 + margin) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2.4) return true;
  if (Math.hypot(x - PK.oak.x, z - PK.oak.z) < 4.6) return true;
  const P = PK.play;
  if (x > P.x0 - 1.5 && x < P.x1 + 1.5 && z > P.z0 - 1.5 && z < P.z1 + 1.5) return true;
  if (Math.hypot(x - PK.glade.x, z - PK.glade.z) < PK.glade.r + 0.4) return true;
  if (nearSeg(x, z, PK.woodPath, 1.25)) return true;
  if (nearSeg(x, z, PK.paths.pondRound.pts, 1.6)) return true;
  if (Math.hypot(x - PK.den.x, z - PK.den.z) < 2.0) return true;
  // The fallen log and its head-room.
  if (nearSeg(x, z, [PK.log.a, PK.log.b], 1.9)) return true;
  // Slalom row corridor.
  const S = PK.slalom;
  if (x > S.x0 - 3 && x < S.x0 + S.dx * S.n && Math.abs(z - S.z) < 2.3) return true;
  if (Math.hypot(x - PK.picnic.x, z - PK.picnic.z) < 3) return true;
  return false;
}

let treeCache = null;
export function parkTrees() {
  if (treeCache) return treeCache;
  const rnd = rng(4242), out = [];
  const far = (x, z, d) => out.every((t) => Math.hypot(t.x - x, t.z - z) > d);
  // The slalom row: seven trunks in a line along x, mixed species.
  const S = PK.slalom, kinds = ['oak', 'ash', 'birch', 'oak', 'ash', 'birch'];
  for (let i = 0; i < S.n; i++) out.push({ ...mkTree(kinds[i % kinds.length], S.x0 + i * S.dx, S.z + (i % 2 ? 0.25 : -0.2), rnd), row: true });
  // Woodland, jittered over the wood's box (not in the stream, glade, paths...).
  let tries = 0;
  const kindsW = ['oak', 'oak', 'birch', 'ash', 'conifer', 'birch', 'ash', 'oak', 'conifer'];
  while (out.length < 44 && tries++ < 6000) {
    const x = WOOD.x0 + 0.6 + rnd() * (WOOD.x1 - WOOD.x0 - 1.2), z = WOOD.z0 + rnd() * (WOOD.z1 - WOOD.z0);
    if (blockedForTree(x, z) || !far(x, z, 1.55)) continue;
    out.push(mkTree(kindsW[out.length % kindsW.length], x, z, rnd));
  }
  // The back slope and the west side: a few trees to close the horizon, and lone park trees.
  const edge = [
    [-16.5, -45.5, 'oak'], [-12.5, -46.2, 'ash'], [-8.0, -46.4, 'oak'], [-4.0, -46.6, 'birch'], [0.5, -46.0, 'ash'], [4.2, -46.6, 'oak'],
    [-17.6, -41.0, 'ash'], [-17.0, -36.0, 'oak'], [-16.4, -28.6, 'birch'], [-18.0, -33.4, 'conifer'],
    [-15.0, -26.6, 'ash'], [12.8, -28.0, 'ash'], [17.3, -27.6, 'oak'], [7.6, -28.3, 'birch'],
    [-12.8, -44.0, 'conifer'], [-1.6, -45.0, 'conifer'],
  ];
  for (const [x, z, k] of edge) if (!blockedForTree(x, z, -1.2)) out.push(mkTree(k, x, z, rnd));
  treeCache = out;
  return out;
}

// ------------------------------------------------------------------ the big oak
// Limbs radiate from the top of the bole; the crown is a ring of lobes on them (solid at 0.82 of their size).
export function oakSpec() {
  const O = PK.oak, y = G(O.x, O.z);
  const limbs = [
    { a: 18, reach: 4.3, h: 6.2, r: 2.45 }, { a: 78, reach: 3.7, h: 5.9, r: 2.25 }, { a: 140, reach: 4.4, h: 6.5, r: 2.5 },
    { a: 205, reach: 3.7, h: 5.8, r: 2.25 }, { a: 262, reach: 4.0, h: 6.1, r: 2.35 }, { a: 322, reach: 3.5, h: 5.6, r: 2.1 },
  ].map((l) => ({ ...l, dx: Math.cos(l.a * Math.PI / 180) * l.reach, dz: Math.sin(l.a * Math.PI / 180) * l.reach }));
  const crown = [];
  for (const l of limbs) crown.push([l.dx, l.h, l.dz, l.r]);
  crown.push([0, 8.5, 0, 2.9], [1.5, 7.6, -1.2, 2.4], [-1.3, 7.3, 1.1, 2.4]);
  for (const l of limbs.filter((_, i) => i % 2 === 0)) crown.push([l.dx * 0.55, l.h + 1.5, l.dz * 0.55, 2.0]);
  return { x: O.x, z: O.z, y, trunkH: O.trunkH, trunkR: O.trunkR, crown, limbs, kind: 'oak', seed: 77 };
}
// The swing limb and the rope.
export function swingInfo() {
  const o = oakSpec(), a = PK.swing.limbAngle, c = Math.cos(a), s = Math.sin(a);
  const y0 = o.y + 3.3;
  const root = [o.x + c * 0.4, y0, o.z + s * 0.4], tip = [o.x + c * 3.9, y0 + 0.5, o.z + s * 3.9];
  const hang = [o.x + c * 3.0 + 0.0, 0, o.z + s * 3.0];
  const hy = y0 + 0.5 * (3.0 - 0.4) / 3.5;       // limb height at the rope
  const gyr = G(hang[0], hang[2]);
  const seatY = gyr + 0.62;
  return { root, tip, hang, limbY: hy, seatY, ground: gyr, seatYaw: a + Math.PI / 2 };
}

// The kite caught on the outside of one lobe of the oak: a flat diamond leaning on the foliage.
export function kiteInfo() {
  const o = oakSpec(), l = o.limbs[3], phi = 235 * Math.PI / 180, r = l.r;
  const pos = [o.x + l.dx + Math.cos(phi) * r * 0.93, o.y + l.h - 0.1, o.z + l.dz + Math.sin(phi) * r * 0.93];
  return { pos, phi, yaw: Math.PI / 2 - phi, tilt: 0.38, hw: 0.3, hh: 0.4 };
}

// ------------------------------------------------------------------ structures: shared layout numbers
export function jettyInfo() {
  const J = PK.jetty, deckTop = POND.water + J.deckAbove;
  const piles = [];
  for (let i = 0; i <= 3; i++) for (const sx of [-1, 1]) piles.push([J.x + sx * (J.w / 2 - 0.08), J.z - 0.25 - i * (J.len - 0.5) / 3]);
  return { deckTop, piles, z0: J.z, z1: J.z - J.len };
}
export function bridgeInfo() {
  const B = PK.bridge, e0 = gy(B, 0, -B.len / 2 - 0.9), e1 = gy(B, 0, B.len / 2 + 0.9);
  const deckTop = Math.max(e0, e1, STREAM.water + 0.45) + 0.42;
  return { deckTop, under: deckTop - 0.22, e0, e1 };
}
export function benchInfo(b) { return { ...b, y: G(b.x, b.z) }; }

// Play area
export function playInfo() {
  const P = PK.play;
  const sw = { x: 3.4, z: -38.4, yaw: 0.0, span: 1.7, top: 2.3 };
  const cf = { x: 5.5, z: -35.2, yaw: 0.0, half: 0.55, plat: 1.2 };
  const rb = { x: 1.7, z: -35.2, r: 0.95, h: 0.3 };
  return { P, sw, cf, rb };
}

// ------------------------------------------------------------------ cups
const mug = (id, name, x, z, y, glaze, rim, yaw) => ({
  id, name, x, z, standY: y, baseY: y, rOut: 0.047, rIn: 0.0415, height: 0.096,
  bottom: 0.009, water: 0.074, handleYaw: yaw, glaze, rim,
});
const tea = (id, name, x, z, y, glaze, rim, yaw) => ({
  id, name, shape: 'teacup', x, z, standY: y, baseY: y + 0.008, rOut: 0.05, rIn: 0.045, height: 0.064,
  bottom: 0.007, water: 0.05, handleYaw: yaw, glaze, rim, saucer: 0.082,
});

export const bandstandCup = () => {
  const B = PK.bandstand, { top } = bandstandInfo(), a = 45 * Math.PI / 180, r = B.R * Math.cos(Math.PI / 8);
  return { x: B.x + r * Math.cos(a), z: B.z + r * Math.sin(a), y: top + 1.04 + 0.0, side: a };
};
export const benchCup = () => { const b = PK.benchFlask, y = G(b.x, b.z) + 0.47; return { x: b.x + 0.22, z: b.z, y }; };
export const jettyCup = () => { const J = PK.jetty, i = jettyInfo(); return { x: J.x + 0.1, z: J.z - J.len + 0.42, y: i.deckTop }; };
export const picnicInfo = () => {
  const P = PK.picnic, y = G(P.x, P.z) + 0.02;
  return { ...P, y, hamper: { lx: -0.2, lz: -0.35, w: 0.62, d: 0.4, h: 0.3 } };
};
export const swingCup = () => { const p = playInfo(), g = G(p.sw.x + 0.55, p.sw.z); return { x: p.sw.x + 0.55, z: p.sw.z, y: g + 0.5 }; };

const bc = bandstandCup(), bn = benchCup(), jc = jettyCup(), pn = picnicInfo(), sc = swingCup();
const hamperPos = (lx, lz) => { const s = Math.sin(pn.yaw), k = Math.cos(pn.yaw); return [pn.x + lx * k + lz * s, pn.z - lx * s + lz * k]; };
const [hx, hz] = hamperPos(pn.hamper.lx, pn.hamper.lz);
const [pcx, pcz] = hamperPos(pn.hamper.lx + 0.02, pn.hamper.lz + 0.78);

export const CUPS = [
  mug('park-bandstand', 'Bandstand mug', bc.x, bc.z, bc.y, 0x7a3b32, 0xf0e6d2, Math.PI * 0.5),
  mug('park-bench', 'Park bench mug', bn.x, bn.z, bn.y, 0xe8e2d0, 0x3d5a80, Math.PI),
  tea('park-jetty', 'Jetty teacup', jc.x, jc.z, jc.y, 0xeee6d6, 0x5b7fa6, -Math.PI * 0.5),
  tea('park-picnic', 'Picnic teacup', pcx, pcz, pn.y, 0xf6efe0, 0xb0554a, Math.PI * 0.5),
  mug('park-swing', 'Swing seat mug', sc.x, sc.z, sc.y, 0x4f7a5e, 0xe9e0cc, 0),
];
export const STATIONS = [{
  x: hx, z: hz, y: pn.y + pn.hamper.h,
  baseHalf: [0.12, 0.0075, 0.045],
  postX: 0.105, postHalf: 0.007, postHeight: 0.265,
  barY: 0.255, barHalf: 0.0055,
  pegReach: 0.062, pegY: 0.252,
  pegXs: [-0.055, 0, 0.055],
}];

// ------------------------------------------------------------------ colliders
export function colliders(w) {
  streamAndBridge(w);
  pond(w);
  oak(w);
  trees(w);
  woodland(w);
  furniture(w);
  bandstand(w);
  playArea(w);
  picnic(w);
}

const Y = new THREE.Vector3(0, 1, 0);

function streamAndBridge(w) {
  // Footbridge: deck on stringers, steps at both ends, handrails, abutment blocks.
  const B = PK.bridge, I = bridgeInfo(), hw = B.w / 2, L = B.len / 2;
  const deckT = 0.22, deckC = I.deckTop - deckT / 2;
  const P = (lx, lz) => frameAt(B, lx, lz);
  let [cx, cz] = P(0, 0);
  w.box(hw, deckT / 2, L, cx, deckC, cz, 'footbridge', 'wood', B.yaw);
  for (const sg of [-1, 1]) {
    // Abutment sills under the stringer ends.
    const [ax, az] = P(0, sg * (L - 0.12)), g = G(ax, az);
    w.box(hw, (I.deckTop - deckT - g + 0.15) / 2, 0.14, ax, (I.deckTop - deckT + g - 0.15) / 2, az, 'footbridge', 'wood', B.yaw);
    // Two steps each end.
    for (let s = 1; s <= 2; s++) {
      const [sx, sz] = P(0, sg * (L + 0.22 + (s - 1) * 0.42)), sg0 = G(sx, sz), top = I.deckTop - s * 0.21;
      w.box(hw, (top - sg0 + 0.15) / 2, 0.21, sx, (top + sg0 - 0.15) / 2, sz, 'footbridge', 'wood', B.yaw);
    }
  }
  for (const sx of [-1, 1]) {
    const lx = sx * (hw - 0.04), top = I.deckTop;
    const n = 5, pts = [];
    for (let i = 0; i < n; i++) pts.push(P(lx, -L + 0.12 + i * (2 * L - 0.24) / (n - 1)));
    for (const [px, pz] of pts) w.rail([px, top, pz], [px, top + 0.98, pz], 0.045, 'footbridge', 'wood');
    for (const h of [0.97, 0.66, 0.35]) w.rail([pts[0][0], top + h, pts[0][1]], [pts[n - 1][0], top + h, pts[n - 1][1]], h > 0.9 ? 0.04 : 0.025, 'footbridge', 'wood');
  }
  // Weir: a plank wall across the channel, wing walls, a post and beam.
  {
    const V = PK.weir, wl = STREAM.water;
    const P2 = (lx, lz) => frameAt(V, lx, lz);
    const [wx, wz] = P2(0, 0);
    w.box(0.13, (wl + 0.1 - (STREAM.bed - 0.3)) / 2, 1.5, wx, (wl + 0.1 + STREAM.bed - 0.3) / 2, wz, 'weir', 'stone', V.yaw);
    for (const sg of [-1, 1]) {
      const [px, pz] = P2(0.0, sg * 1.62), g = G(px, pz);
      w.box(0.3, (g + 0.25 - (STREAM.bed - 0.3)) / 2, 0.28, px, (g + 0.25 + STREAM.bed - 0.3) / 2, pz, 'weir', 'stone', V.yaw);
      const [qx, qz] = P2(0.0, sg * 1.3);
      w.rail([qx, wl + 0.1, qz], [qx, wl + 0.95, qz], 0.06, 'weir', 'wood');
    }
    const [ax, az] = P2(0, -1.3), [bx, bz] = P2(0, 1.3);
    w.rail([ax, wl + 0.95, az], [bx, wl + 0.95, bz], 0.05, 'weir', 'wood');
  }
  // Stepping stones across the channel.
  for (const s of steppingStones()) w.cyl(s.r * 0.95, (s.top - (STREAM.bed - 0.1)) / 2, s.x, (s.top + STREAM.bed - 0.1) / 2, s.z, 'stone', 'stone');
  // Boulders on the banks.
  for (const b of bankBoulders()) w.ball(b.r * 0.92, b.x, b.y, b.z, 'stone', 'stone');
}

export function steppingStones() {
  const { x, n } = PK.stones, out = [], z0 = streamZ(x);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * 0.68;
    out.push({ x: x + t * 0.1 + (i % 2 ? 0.05 : -0.05), z: z0 + t, r: 0.26 + (i % 3) * 0.02, top: STREAM.water + 0.12 + (i % 2) * 0.02 });
  }
  return out;
}
export function bankBoulders() {
  const out = [], spots = [[-12.2, 0.9, 0.34], [-12.9, -1.2, 0.27], [-3.2, 1.25, 0.3], [0.2, -1.05, 0.38], [5.6, 1.15, 0.3], [6.4, -0.95, 0.24], [9.4, 1.3, 0.34], [12.8, -1.1, 0.4], [-16.0, 1.0, 0.45], [-9.6, -1.3, 0.28], [1.7, 1.2, 0.26], [15.2, 1.1, 0.32]];
  for (const [x, dz, r] of spots) { const z = streamZ(x) + dz; out.push({ x, z, r, y: G(x, z) + r * 0.25 }); }
  return out;
}

function pond(w) {
  // Jetty: deck, joists and piles; mooring post at the end.
  const J = PK.jetty, I = jettyInfo(), hw = J.w / 2;
  w.box(hw, 0.11, J.len / 2, J.x, I.deckTop - 0.11, J.z - J.len / 2, 'jetty', 'wood');
  for (let s = 1; s <= 2; s++) { const sz = J.z + 0.15 + s * 0.4, g = G(J.x, sz), top = I.deckTop - s * 0.18; w.box(hw, (top - g + 0.15) / 2, 0.2, J.x, (top + g - 0.15) / 2, sz, 'jetty', 'wood'); }
  for (const [px, pz] of I.piles) {
    const g = G(px, pz);
    w.rail([px, Math.min(g, POND.bed) - 0.05, pz], [px, I.deckTop + 0.12, pz], 0.07, 'jetty', 'wood');
  }
  const post = [J.x - hw + 0.1, J.z - J.len + 0.1];
  w.rail([post[0], I.deckTop, post[1]], [post[0], I.deckTop + 0.55, post[1]], 0.07, 'jetty', 'wood');
  // Rowing boat moored alongside.
  const B = PK.boat, wl = POND.water;
  const P = (lx, lz) => frameAt(B, lx, lz);
  let [bx, bz] = P(0, 0);
  w.box(B.B * 0.27, 0.05, B.L * 0.4, bx, wl + 0.02, bz, 'boat', 'wood', B.yaw);
  for (const sg of [-1, 1]) {
    const [sx, sz] = P(sg * B.B * 0.38, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sg * 0.5).premultiply(new THREE.Quaternion().setFromAxisAngle(Y, B.yaw));
    w.boxQ(0.03, 0.2, B.L * 0.42, sx, wl + 0.19, sz, 'boat', 'wood', q);
  }
  for (const sg of [-1, 1]) {
    const [sx, sz] = P(0, sg * B.L * 0.455);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -sg * 0.5).premultiply(new THREE.Quaternion().setFromAxisAngle(Y, B.yaw));
    w.boxQ(B.B * 0.3, 0.2, 0.03, sx, wl + 0.2, sz, 'boat', 'wood', q);
  }
  for (const lz of [-0.35, 0.45]) { const [tx, tz] = P(0, lz); w.box(B.B * 0.4, 0.02, 0.1, tx, wl + 0.22, tz, 'boat', 'wood', B.yaw); }
  // Bulrush clumps are soft; boulders on the shore.
  for (const b of pondStones()) w.ball(b.r * 0.9, b.x, b.y, b.z, 'stone', 'stone');
}
export function pondStones() {
  const out = [];
  for (const [a, r, rr] of [[40, 3.75, 0.3], [75, 3.9, 0.22], [160, 3.9, 0.36], [215, 3.85, 0.26], [300, 3.9, 0.3], [335, 3.8, 0.24]]) {
    const x = POND.x + Math.cos(a * Math.PI / 180) * r, z = POND.z + Math.sin(a * Math.PI / 180) * r;
    out.push({ x, z, r: rr, y: G(x, z) + rr * 0.25 });
  }
  return out;
}

function oak(w) {
  const o = oakSpec();
  // Bole with a flare of roots, limbs, lobes (treeColliders), and the swing.
  w.cyl(o.trunkR * 0.9, o.trunkH / 2, o.x, o.y + o.trunkH / 2, o.z, 'oak', 'wood');
  w.cyl(o.trunkR * 1.2, 0.3, o.x, o.y + 0.3, o.z, 'oak', 'wood');
  for (const l of o.limbs) {
    const a = [o.x + Math.cos(Math.atan2(l.dz, l.dx)) * 0.2, o.y + o.trunkH - 0.1, o.z + Math.sin(Math.atan2(l.dz, l.dx)) * 0.2];
    const mid = [o.x + l.dx * 0.5, o.y + o.trunkH + (l.h - o.trunkH) * 0.35 + 0.3, o.z + l.dz * 0.5];
    const e = [o.x + l.dx * 0.82, o.y + l.h - 0.4, o.z + l.dz * 0.82];
    w.rail(a, mid, 0.26, 'oak', 'wood');
    w.rail(mid, e, 0.17, 'oak', 'wood');
  }
  for (const [dx, dy, dz, r] of o.crown) w.ball(r * 0.82, o.x + dx, o.y + dy, o.z + dz, 'oak', 'plant');
  const S = swingInfo();
  w.rail(S.root, S.tip, 0.16, 'oak', 'wood');
  for (const dxs of [-0.2, 0.2]) {
    const c = Math.cos(PK.swing.limbAngle), s = Math.sin(PK.swing.limbAngle);
    // Seat across the rope (perpendicular to the limb).
    const px = S.hang[0] - s * dxs, pz = S.hang[2] + c * dxs;
    w.rail([px, S.limbY - 0.05, pz], [px, S.seatY + 0.03, pz], 0.012, 'rope', 'rope');
  }
  w.box(0.22, 0.02, 0.1, S.hang[0], S.seatY, S.hang[2], 'swing', 'wood', -PK.swing.limbAngle + Math.PI / 2 + 0);
  // Root buttresses.
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.5, c = Math.cos(a), s = Math.sin(a);
    w.rail([o.x + c * 0.4, o.y + 0.65, o.z + s * 0.4], [o.x + c * 1.45, G(o.x + c * 1.45, o.z + s * 1.45) + 0.05, o.z + s * 1.45], 0.17, 'oak', 'wood');
  }
  // The caught kite.
  const K = kiteInfo();
  w.boxQ(K.hw, K.hh, 0.012, K.pos[0], K.pos[1], K.pos[2], 'kite', 'cloth', new THREE.Quaternion().setFromEuler(new THREE.Euler(-K.tilt, K.yaw, 0, 'YXZ')));
}

function trees(w) {
  for (const t of parkTrees()) treeColliders(w, t, 'tree');
}

function woodland(w) {
  // Fallen log lying from a boulder to the ground, and the boulder.
  const L = PK.log, ya = G(L.a[0], L.a[1]), yb = G(L.b[0], L.b[1]);
  w.rail([L.a[0], ya + L.hA, L.a[1]], [L.b[0], yb + L.hB, L.b[1]], L.r, 'log', 'wood');
  // Broken limb stubs on it (the thick ones).
  for (const t of [0.3, 0.62]) {
    const px = L.a[0] + (L.b[0] - L.a[0]) * t, pz = L.a[1] + (L.b[1] - L.a[1]) * t, py = ya + L.hA + (yb + L.hB - ya - L.hA) * t;
    w.rail([px, py + 0.1, pz], [px + 0.25, py + 0.6, pz + 0.55 * (t < 0.5 ? -1 : 1)], 0.05, 'log', 'wood');
  }
  const bo = logBoulder();
  w.ball(bo.r * 0.9, bo.x, bo.y, bo.z, 'stone', 'stone');
  // Den: branches leaning on a ring round a hollow.
  for (const b of denBranches()) w.rail(b.a, b.b, b.r, 'den', 'wood');
  // A few mossy boulders and stumps.
  for (const s of woodStumps()) w.cyl(s.r, s.h / 2, s.x, s.y + s.h / 2, s.z, 'stump', 'wood');
}
export function logBoulder() {
  const L = PK.log, x = L.a[0] - 0.2, z = L.a[1] + 0.1, r = 0.95;
  return { x, z, r, y: G(x, z) + r * 0.55 };
}
export function denBranches() {
  const D = PK.den, y = G(D.x, D.z), out = [], n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.2;
    if (i === 0) continue;                       // the doorway
    const r0 = 1.25, ax = D.x + Math.cos(a) * r0, az = D.z + Math.sin(a) * r0, bx = D.x + Math.cos(a) * 0.12, bz = D.z + Math.sin(a) * 0.12;
    out.push({ a: [ax, G(ax, az) - 0.02, az], b: [bx, y + 1.85 + (i % 3) * 0.08, bz], r: 0.035 + (i % 2) * 0.012 });
  }
  return out;
}
export function woodStumps() {
  return [[9.6, -33.6, 0.3, 0.5], [18.1, -43.2, 0.4, 0.4], [13.0, -35.4, 0.25, 0.35]].map(([x, z, r, h]) => ({ x, z, r, h, y: G(x, z) - 0.05 }));
}

// ------------------------------------------------------------------ park furniture
export function benchColliders(w, b, flask = false) {
  const y = b.y ?? G(b.x, b.z), P = (lx, lz) => frameAt(b, lx, lz);
  let [sx, sz] = P(0, 0);
  w.box(0.76, 0.025, 0.22, sx, y + 0.455, sz, 'bench', 'wood', b.yaw);
  [sx, sz] = P(0, -0.22);
  w.box(0.76, 0.2, 0.025, sx, y + 0.72, sz, 'bench', 'wood', b.yaw);
  for (const sg of [-1, 1]) {
    [sx, sz] = P(sg * 0.69, -0.02);
    w.box(0.03, 0.26, 0.24, sx, y + 0.3, sz, 'bench', 'iron', b.yaw);
  }
  if (flask) { [sx, sz] = P(-0.42, 0.02); w.cyl(0.04, 0.12, sx, y + 0.48 + 0.12, sz, 'flask', 'metal'); }
}

function furniture(w) {
  benchColliders(w, benchInfo(PK.benchFlask), true);
  benchColliders(w, benchInfo(PK.benchPond));
  for (const [x, z] of PK.bins) { const y = G(x, z); w.cyl(0.23, 0.46, x, y + 0.46, z, 'bin', 'metal'); }
  // Play area picket fence with a gate gap on the north side.
  const P = PK.play;
  const run = (a, b, gaps = []) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i < n; i++) {
      const p = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], q = [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n];
      const y = Math.min(G(p[0], p[1]), G(q[0], q[1]), G((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) - 0.02;
      const g = gaps.map(([g0, g1]) => [g0 - i * len / n, g1 - i * len / n]).filter(([g0, g1]) => g1 > 0 && g0 < len / n);
      runColliders(w, { a: p, b: q, h: 0.95, t: 0.05, gaps: g, y, kind: 'fence' });
    }
  };
  run([P.x0, P.z1], [P.x1, P.z1], [[P.gate[0] - P.x0, P.gate[1] - P.x0]]);
  run([P.x1, P.z1], [P.x1, P.z0]);
  run([P.x1, P.z0], [P.x0, P.z0]);
  run([P.x0, P.z0], [P.x0, P.z1]);
}

function bandstand(w) {
  const B = PK.bandstand, I = bandstandInfo(), top = I.top;
  const oct = octagon(B, B.rPlat);
  const pts = [];
  for (const p of oct) pts.push(p[0], top, p[2]);
  for (const p of oct) pts.push(p[0], I.base, p[2]);
  w.hull(pts, 'bandstand', 'wood');
  // Steps on the two open sides.
  for (const sg of [-1, 1]) {
    for (let s = 0; s < 3; s++) {
      const d = B.rPlat * Math.cos(Math.PI / 8) + 0.2 + s * 0.3, sx = B.x + sg * d, sz = B.z, sy = top - (s + 1) * 0.26, g = G(sx, sz);
      w.box(0.15, (sy - g + 0.15) / 2, 0.8, sx, (sy + g - 0.15) / 2, sz, 'bandstand', 'stone');
    }
  }
  // Columns and balustrades (six sides; the two on the x axis are open).
  const v = octagon(B, B.R);
  for (const p of v) w.rail([p[0], top, p[2]], [p[0], top + B.colH, p[2]], 0.055, 'bandstand', 'iron');
  for (let k = 0; k < 8; k++) {
    if (k === 7 || k === 3) continue;                         // the open sides at 0 and 180 degrees
    const a = v[k], b = v[(k + 1) % 8], mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    w.box(len / 2 - 0.05, 0.4, 0.03, mx, top + 0.5, mz, 'bandstand', 'wood', yaw);
    w.box(len / 2 - 0.02, 0.025, 0.09, mx, top + 1.015, mz, 'bandstand', 'wood', yaw);
  }
  // Roof: eight thin pyramid facets, with a fascia rim; a finial.
  const topY = top + B.apexH, eaveY = top + B.colH + 0.05;
  const E = octagon(B, B.rRoof);
  for (let k = 0; k < 8; k++) {
    const a = E[k], b = E[(k + 1) % 8], p = [];
    p.push(B.x, topY, B.z, a[0], eaveY, a[2], b[0], eaveY, b[2]);
    p.push(B.x, topY - 0.12, B.z, a[0], eaveY - 0.2, a[2], b[0], eaveY - 0.2, b[2]);
    w.hull(p, 'bandstand', 'tile');
  }
  w.rail([B.x, topY - 0.05, B.z], [B.x, topY + 0.65, B.z], 0.025, 'bandstand', 'iron');
  w.ball(0.07, B.x, topY + 0.7, B.z, 'bandstand', 'iron');
}

function playArea(w) {
  const { sw, cf, rb } = playInfo();
  // Swings: two A-frames and a top bar, two chains each seat, two seats.
  const gs = (dx) => G(sw.x + dx, sw.z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = sw.x + sx * sw.span, apex = [bx, G(bx, sw.z) + sw.top, sw.z], foot = [bx, G(bx, sw.z + sz * 0.7) - 0.05, sw.z + sz * 0.7];
    w.rail(foot, apex, 0.045, 'swing', 'metal');
  }
  w.rail([sw.x - sw.span - 0.1, G(sw.x, sw.z) + sw.top, sw.z], [sw.x + sw.span + 0.1, G(sw.x, sw.z) + sw.top, sw.z], 0.05, 'swing', 'metal');
  for (const sx of [-0.55, 0.55]) {
    const g = gs(sx), top = G(sw.x, sw.z) + sw.top;
    for (const o of [-0.2, 0.2]) w.rail([sw.x + sx + o, top - 0.04, sw.z], [sw.x + sx + o, g + 0.5, sw.z], 0.012, 'swing', 'metal');
    w.box(0.22, 0.02, 0.09, sw.x + sx, g + 0.48, sw.z, 'swing', 'rubber');
  }
  // Climbing frame: four posts, platform, barriers, roof, slide, ladder.
  const g0 = G(cf.x, cf.z), h = cf.half;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = cf.x + sx * h, pz = cf.z + sz * h;
    w.rail([px, G(px, pz) - 0.05, pz], [px, g0 + cf.plat + 1.0, pz], 0.06, 'play', 'wood');
  }
  w.box(h + 0.08, 0.035, h + 0.08, cf.x, g0 + cf.plat, cf.z, 'play', 'wood');
  // Barriers on the north, south and west sides (ladder west, slide east).
  w.box(h, 0.3, 0.02, cf.x, g0 + cf.plat + 0.35, cf.z - h, 'play', 'wood');
  w.box(h, 0.3, 0.02, cf.x, g0 + cf.plat + 0.35, cf.z + h, 'play', 'wood');
  // Roof (two slopes).
  for (const sg of [-1, 1]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sg * 0.5);
    w.boxQ(h + 0.25, 0.02, 0.62, cf.x, g0 + cf.plat + 1.15 + 0.15, cf.z + sg * 0.5, 'play', 'wood', q);
  }
  // Slide: from the platform edge (east) down to the ground.
  const sl = slideInfo();
  w.boxQ(0.27, 0.025, sl.len / 2, sl.cx, sl.cy, sl.cz, 'slide', 'metal', sl.q);
  for (const sg of [-1, 1]) w.boxQ(0.02, 0.1, sl.len / 2, sl.cx, sl.cy + 0.08, sl.cz + sg * 0.27, 'slide', 'metal', sl.q);
  for (const sg of [-1, 1]) {
    const tt = 0.55, x = sl.x0 + (sl.x1 - sl.x0) * tt, yy = sl.y0 + (sl.y1 - sl.y0) * tt;
    w.rail([x, G(x, sl.cz + sg * 0.3) - 0.05, sl.cz + sg * 0.3], [x, yy - 0.03, sl.cz + sg * 0.3], 0.025, 'slide', 'metal');
  }
  // Ladder on the west side: two rails and rungs as one thin slab.
  const lx = cf.x - h - 0.28;
  for (const sz of [-0.25, 0.25]) w.rail([lx - 0.05, g0 - 0.05, cf.z + sz], [lx + 0.28, g0 + cf.plat, cf.z + sz], 0.025, 'play', 'wood');
  // Roundabout.
  const gr = G(rb.x, rb.z);
  w.cyl(0.07, 0.15, rb.x, gr + 0.15, rb.z, 'play', 'metal');
  w.cyl(rb.r, 0.03, rb.x, gr + rb.h, rb.z, 'play', 'metal');
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4, px = rb.x + Math.cos(a) * 0.75, pz = rb.z + Math.sin(a) * 0.75;
    w.rail([px, gr + rb.h, pz], [px, gr + rb.h + 0.7, pz], 0.02, 'play', 'metal');
  }
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + 0.4, a1 = (i + 1) * Math.PI / 2 + 0.4;
    w.rail([rb.x + Math.cos(a0) * 0.75, gr + rb.h + 0.7, rb.z + Math.sin(a0) * 0.75], [rb.x + Math.cos(a1) * 0.75, gr + rb.h + 0.7, rb.z + Math.sin(a1) * 0.75], 0.02, 'play', 'metal');
  }
}
export function slideInfo() {
  const { cf } = playInfo(), g0 = G(cf.x, cf.z), h = cf.half;
  const x0 = cf.x + h + 0.05, y0 = g0 + cf.plat + 0.03, x1 = x0 + 1.95, y1 = G(x1, cf.z) + 0.12;
  const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
  return { x0, y0, x1, y1, len, ang, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: cf.z, q };
}

function picnic(w) {
  const P = picnicInfo(), H = P.hamper;
  const [x, z] = frameAt(P, H.lx, H.lz);
  w.box(H.w / 2, H.h / 2, H.d / 2, x, P.y + H.h / 2, z, 'hamper', 'wicker', P.yaw);
  const [rx, rz] = frameAt(P, 0.62, -0.38);
  w.box(0.2, 0.045, 0.15, rx, G(rx, rz) + 0.045, rz, 'rug', 'cloth', P.yaw + 0.2);
}
