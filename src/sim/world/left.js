import * as THREE from 'three';
import { FY, BACK_LINE, FRONT_LINE, FRONT_DOORS } from './plan.js';
import { houseColliders, runColliders } from './shapes.js';

// The 'left' area (box AREAS.left in plan.js): two neighbours' houses and gardens and the strip beyond, plus our own
// left side passage. Fixed colliders, its cups and tea stand. Drawn by src/render/world/areas/left.js, which reads
// the SOLIDS, FOLIAGE, RUNS and HOUSES lists below so what you see is what you hit.
//
//   p-1  x -10.6..-3.4   brick and slate house, conservatory with an open roof vent; a kept garden: koi pond with
//        fountain, greenhouse (open door and roof vent), trampoline in a net, rotary washing line, rockery,
//        swing seat with canopy, patio with a tea stand.
//   p-2  x -17.8..-10.6  rendered cottage with a lean-to; a wilder garden: old caravan (door and window open),
//        nettles and brambles, fallen apple tree, bath planter, rusty bike, buddleia, wildlife pond.
//   strip x -19.5..-17.8 beyond the old brick wall.
//   our left side passage x -3.4..-2.6 (z -1.62..8.55).
//
// Heights below are above the ground (FY) unless a name says abs.
const Y = (h) => FY + h;
export const GROUND_Y = FY;
const rad = (d) => d * Math.PI / 180;

// ---------------------------------------------------------------- solids
// { k: 'box'|'cyl'|'ball'|'rail', x, y (abs centre), z, hx, hy, hz | r, hh | a, b, r, ry, rot:[rx,ry,rz], m (kit/world
//   material key for the look), c (tint), ph (physical material), kind, lod, nocol (look only), novis (collider only) }
export const SOLIDS = [];
const PH = { wood: 'wood', weathered: 'wood', paint: 'wood', wicker: 'wood', bark: 'wood', stone: 'stone', brick: 'brick', iron: 'metal', zinc: 'metal', steel: 'metal', brass: 'metal', copper: 'metal', enamel: 'metal', glass: 'glass', fabric: 'cloth', terracotta: 'ceramic', ceramic: 'ceramic', soil: 'plant', leaf: 'plant', leafy: 'plant', rubber: 'plastic', roof: 'tile', net: 'rope' };
const put = (s, o = {}) => { SOLIDS.push({ m: 'paint', lod: 1, kind: 'garden', ...o, ...s }); return s; };
// Box by footprint centre, size, bottom height and height.
export const bx = (cx, cz, w, d, y0, h, o = {}) => put({ k: 'box', x: cx, y: Y(y0) + h / 2, z: cz, hx: w / 2, hy: h / 2, hz: d / 2 }, o);
// Box by centre (x, height above ground, z), half sizes and a tilt [rx, ry, rz] (YXZ).
export const tb = (cx, ch, cz, hx, hy, hz, rot, o = {}) => put({ k: 'box', x: cx, y: Y(ch), z: cz, hx, hy, hz, rot }, o);
export const cy = (cx, cz, r, y0, h, o = {}) => put({ k: 'cyl', x: cx, y: Y(y0) + h / 2, z: cz, r, hh: h / 2 }, o);
export const bl = (x, h, z, r, o = {}) => put({ k: 'ball', x, y: Y(h), z, r }, o);
export const rl = (a, b, r, o = {}) => put({ k: 'rail', a: [a[0], Y(a[1]), a[2]], b: [b[0], Y(b[1]), b[2]], r }, o);

// Soft foliage: a ball you can brush at about 0.8 of its visible size. kind picks the look.
export const FOLIAGE = [];
const fol = (x, h, z, r, o = {}) => { FOLIAGE.push({ x, y: Y(h), z, r, ...o }); return o; };

// ---------------------------------------------------------------- the two houses
const house = (id, s) => ({ id, ...s });
export const P1 = house('p-1', {
  x0: -9.7, x1: -4.7, z0: 2.4, z1: FRONT_LINE, eave: Y(5.1), ridgeY: Y(7.5), ridge: 'x', overhang: 0.3,
  chimneys: [{ u: -9.0, v: 0, w: 0.9, d: 0.55, top: Y(8.3) }, { u: -5.4, v: 0, w: 0.9, d: 0.55, top: Y(8.3) }],
  wall: 'brick', wallColor: 0xf0e0d4, roofColor: 0x9099a4, trimColor: 0xf4f1ea,
  windows: [
    { face: 'front', u: -5.9 - -9.7, y: Y(0.95), w: 1.1, h: 1.35, style: 'sash', bars: 2 },
    { face: 'front', u: -8.75 - -9.7, y: Y(3.25), w: 1.05, h: 1.4, style: 'sash', bars: 2 },
    { face: 'front', u: -5.9 - -9.7, y: Y(3.25), w: 1.05, h: 1.4, style: 'sash', bars: 2 },
    { face: 'front', u: -7.4 - -9.7, y: Y(3.6), w: 0.55, h: 0.9, style: 'casement', bars: 1 },
    { face: 'back', u: -4.7 - -5.5, y: Y(0.95), w: 1.1, h: 1.25, style: 'sash', bars: 2 },
    { face: 'back', u: -4.7 - -8.5, y: Y(3.3), w: 1.0, h: 1.3, style: 'sash', bars: 2 },
    { face: 'back', u: -4.7 - -5.5, y: Y(3.3), w: 1.0, h: 1.3, style: 'sash', bars: 2 },
    { face: 'back', u: -4.7 - -7.1, y: Y(3.7), w: 0.5, h: 0.75, style: 'casement', bars: 1, curtains: false },
    { face: 'right', u: FRONT_LINE - 5.6, y: Y(3.5), w: 0.55, h: 0.85, style: 'casement', bars: 1, curtains: false },
    { face: 'left', u: 5.2 - 2.4, y: Y(3.5), w: 0.55, h: 0.85, style: 'casement', bars: 1, curtains: false },
  ],
  doors: [
    { face: 'front', u: FRONT_DOORS['p-1'] - -9.7, w: 0.95, h: 2.1, color: 0x2b4d3a, glazed: true },
    { face: 'back', u: -4.7 - -7.6, w: 0.95, h: 2.1, color: 0xf0eee6, glazed: true },
  ],
});
export const P2 = house('p-2', {
  x0: -17.0, x1: -11.4, z0: 2.7, z1: FRONT_LINE, eave: Y(5.0), ridgeY: Y(7.5), ridge: 'z', overhang: 0.3,
  chimneys: [{ u: 3.9, v: 0, w: 0.6, d: 1.0, top: Y(8.4) }],
  wall: 'render', wallColor: 0xdfd6b8, roofColor: 0xc98a72, trimColor: 0x5a6b5a,
  windows: [
    { face: 'front', u: -16.3 - -17.0, y: Y(0.95), w: 0.95, h: 1.25, style: 'casement', bars: 2 },
    { face: 'front', u: -12.7 - -17.0, y: Y(0.95), w: 1.3, h: 1.25, style: 'casement', bars: 3 },
    { face: 'front', u: -15.6 - -17.0, y: Y(3.3), w: 1.0, h: 1.25, style: 'casement', bars: 2 },
    { face: 'front', u: -12.9 - -17.0, y: Y(3.3), w: 1.0, h: 1.25, style: 'casement', bars: 2 },
    { face: 'back', u: -11.4 - -15.8, y: Y(3.3), w: 1.0, h: 1.25, style: 'casement', bars: 2 },
    { face: 'back', u: -11.4 - -13.0, y: Y(3.3), w: 1.0, h: 1.25, style: 'casement', bars: 2 },
    { face: 'back', u: -11.4 - -12.3, y: Y(0.95), w: 1.0, h: 1.2, style: 'casement', bars: 2 },
    { face: 'left', u: 5.4 - 2.7, y: Y(3.4), w: 0.7, h: 1.0, style: 'casement', bars: 1 },
    { face: 'right', u: FRONT_LINE - 5.6, y: Y(3.4), w: 0.7, h: 1.0, style: 'casement', bars: 1 },
  ],
  doors: [
    { face: 'front', u: FRONT_DOORS['p-2'] - -17.0, w: 0.9, h: 2.05, color: 0x7a2f2f, glazed: false },
    { face: 'back', u: -11.4 - -14.0, w: 0.9, h: 2.05, color: 0x5a6b5a, glazed: true },
  ],
});
// A gable window (the front gable of p-2) and the bay and porch below.
export const P2_GABLE_WINDOW = { x: -14.2, y: Y(5.45), z: FRONT_LINE, w: 0.7, h: 0.75 };
export const BAY = { cx: -8.75, front: 9.0, wFront: 1.0, wBack: 1.6, roofY: Y(2.75) };
export const PORCH = { x0: -15.35, x1: -13.85, z0: FRONT_LINE, z1: FRONT_LINE + 0.95, wallY: Y(2.55), frontY: Y(2.3) };

// ---------------------------------------------------------------- fences, walls and hedges
// RUNS: a = [x, z], b = [x, z]; the render draws them, the colliders are runColliders from the same numbers.
// gaps are [from, to] metres along the run.
export const RUNS = [
  // Our passage's fence (1.8 m close-boarded) from the garden's corner to the street.
  { id: 'passage', style: 'board', a: [-3.4, -1.62], b: [-3.4, FRONT_LINE], h: 1.8, color: 0xa39378, gaps: [], t: 0.09, post: true },
  // p-1 | p-2 fence with a hole of three missing boards (0.3 m) at z -1.3..-1.0.
  { id: 'between', style: 'board', a: [-10.6, BACK_LINE], b: [-10.6, FRONT_LINE], h: 1.8, color: 0x8f836d, gaps: [[5.1, 5.4]], t: 0.09, post: true },
  // p-1 back fence (z = BACK_LINE) with a gate gap.
  { id: 'back1', style: 'board', a: [-10.6, BACK_LINE], b: [-3.4, BACK_LINE], h: 1.8, color: 0x9a8d72, gaps: [[3.5, 4.5]], t: 0.09, post: true },
  // p-2 old brick wall (x = -17.8) with a collapsed length.
  { id: 'oldwall', style: 'brick', a: [-17.8, BACK_LINE], b: [-17.8, FRONT_LINE], h: 1.9, color: 0xc9b5a3, gaps: [[3.8, 4.7]], t: 0.22, post: false },
];
// Overgrown hedges: p-2's back hedge (gate gap) and the strip's outer hedge.
export const HEDGES = [
  { id: 'back2', a: [-19.4, BACK_LINE + 0.45], b: [-10.6, BACK_LINE + 0.45], h: 2.5, d: 0.9, gaps: [[4.5, 5.5]], color: 0xa9bb98 },
  { id: 'outer', a: [-19.2, BACK_LINE + 0.1], b: [-19.2, FRONT_LINE], h: 2.7, d: 0.6, gaps: [], color: 0xb2c29e },
];
export const OLDWALL_LOW = { z0: -2.6, z1: -1.7, h: 0.55 };

// Gates: p-1's back gate stands open (65 degrees on its right hinge); p-2's hangs off its hinge in the hedge.
export const GATE1 = { hx: -6.1, hz: BACK_LINE, ang: rad(65), len: 1.0, h: 1.5, gap: 1.0, diag: 0.5 };
export const GATE2 = { hx: -13.9, hz: BACK_LINE + 0.45, ang: rad(58), len: 0.9, h: 1.2, gap: 1.0, diag: -0.6 };
for (const G of [GATE1, GATE2]) {
  bx(G.hx - Math.cos(G.ang) * G.len / 2, G.hz + Math.sin(G.ang) * G.len / 2, G.len, 0.05, 0.0, G.h, { m: 'weathered', c: 0x7a8a68, kind: 'gate', ry: G.ang, nocol: false, novis: true });
  bx(G.hx, G.hz, 0.1, 0.1, 0, G.h + 0.45, { m: 'weathered', c: 0x8a7b62, kind: 'gate', novis: true });
  bx(G.hx - G.gap, G.hz, 0.1, 0.1, 0, G.h + 0.45, { m: 'weathered', c: 0x8a7b62, kind: 'gate', novis: true });
}

// ---------------------------------------------------------------- our left side passage
const gateGreen = 0x4f6e55;
export const PASSAGE = { x0: -3.4, x1: -2.6, z0: -1.62, z1: FRONT_LINE };
{
  // The open garden gate at the kitchen corner: hinged on a post at the fence end, swung back along the fence.
  bx(-3.38, -1.56, 0.1, 0.1, 0, 1.75, { m: 'weathered', c: 0x8a7b62, kind: 'gate' });
  bx(-3.3, -1.1, 0.05, 0.92, 0.12, 1.45, { m: 'paint', c: gateGreen, kind: 'gate', lod: 1 });
  // The open side gate at the front.
  bx(-3.38, 8.33, 0.1, 0.1, 0, 1.95, { m: 'weathered', c: 0x8a7b62, kind: 'gate' });
  bx(-3.3, 7.85, 0.05, 0.9, 0.12, 1.7, { m: 'paint', c: gateGreen, kind: 'gate' });
  // Wheelie bins against the fence.
  for (const [z, col, lid] of [[3.25, 0x3f6b3f, 0x355a38], [3.93, 0x2d2f31, 0x25282a]]) {
    bx(-3.15, z, 0.46, 0.56, 0.0, 0.98, { m: 'paint', c: col, ph: 'plastic', kind: 'bin' });
    bx(-3.15, z, 0.5, 0.6, 0.98, 0.07, { m: 'paint', c: lid, ph: 'plastic', kind: 'bin' });
  }
  // A recycling box stacked on a crate.
  bx(-3.18, 4.65, 0.36, 0.44, 0, 0.3, { m: 'paint', c: 0x2f5f8f, ph: 'plastic', kind: 'bin' });
  // Water butt under the downpipe, against the house wall.
  cy(-2.88, 6.3, 0.26, 0, 0.95, { m: 'paint', c: 0x2f5a3c, ph: 'plastic', kind: 'butt', seg: 14 });
  cy(-2.88, 6.3, 0.25, 0.95, 0.03, { m: 'paint', c: 0x244630, ph: 'plastic', kind: 'butt', seg: 14 });
  bx(-2.88, 6.3, 0.1, 0.1, 0.4, 0.05, { m: 'paint', c: 0x244630, ph: 'plastic', kind: 'butt', nocol: true });
  // A bike leaning on the fence (its frame in a plane that tilts towards the fence).
  const bz0 = 6.95, lean = 0.12;
  const BP = (z, h) => [-3.2 - lean * h, h, z];
  for (const wz of [bz0, bz0 + 1.02]) {
    for (let i = 0; i < 10; i++) {
      const a0 = i / 10 * Math.PI * 2, a1 = (i + 1) / 10 * Math.PI * 2;
      rl(BP(wz + Math.cos(a0) * 0.34, 0.34 + Math.sin(a0) * 0.34), BP(wz + Math.cos(a1) * 0.34, 0.34 + Math.sin(a1) * 0.34), 0.016, { m: 'steel', c: 0x2a2a2a, kind: 'bike' });
    }
    rl(BP(wz - 0.34, 0.34), BP(wz + 0.34, 0.34), 0.007, { m: 'steel', c: 0x777777, kind: 'bike' });
    rl(BP(wz, 0.0), BP(wz, 0.68), 0.007, { m: 'steel', c: 0x777777, kind: 'bike' });
  }
  rl(BP(bz0, 0.34), BP(bz0 + 0.45, 0.62), 0.014, { m: 'paint', c: 0xb23a2a, kind: 'bike' });
  rl(BP(bz0 + 0.45, 0.62), BP(bz0 + 0.95, 0.66), 0.014, { m: 'paint', c: 0xb23a2a, kind: 'bike' });
  rl(BP(bz0, 0.34), BP(bz0 + 0.5, 0.2), 0.012, { m: 'paint', c: 0xb23a2a, kind: 'bike' });
  rl(BP(bz0 + 0.5, 0.2), BP(bz0 + 0.95, 0.66), 0.012, { m: 'paint', c: 0xb23a2a, kind: 'bike' });
  rl(BP(bz0 + 1.02, 0.34), BP(bz0 + 0.95, 0.92), 0.013, { m: 'steel', c: 0x888888, kind: 'bike' });
  rl(BP(bz0 + 0.8, 0.98), BP(bz0 + 1.12, 1.0), 0.013, { m: 'steel', c: 0x333333, kind: 'bike' });
  bx(BP(0, 0.7)[0], bz0 + 0.4, 0.06, 0.22, 0.68, 0.05, { m: 'rubber', c: 0x222222, kind: 'bike' });
  // Stack of terracotta pots and a coiled hose on a reel near the front.
  for (let i = 0; i < 3; i++) cy(-3.2, 5.3 + i * 0.001, 0.16 - i * 0.0, i * 0.17, 0.17, { m: 'terracotta', c: 0xb9683f, kind: 'pot', seg: 10 });
  cy(-3.15, 5.35, 0.2, 0.0, 0.5, { m: 'iron', c: 0x2e3a32, kind: 'reel', seg: 10, nocol: true });
  bx(-3.15, 5.0, 0.3, 0.3, 0.0, 0.5, { m: 'iron', c: 0x2e3a32, kind: 'reel', novis: true });
}

// ---------------------------------------------------------------- p-1: the conservatory
export const CONS = { x0: -9.2, x1: -6.0, zF: -0.1, zB: 2.4, dwarf: 0.65, eaveF: 2.4, eaveB: 3.0, door: { z0: 0.8, z1: 1.7 }, vent: { xc: -8.0, z0: 0.55, z1: 1.45, open: 108 } };
export const consRoofY = (z) => CONS.eaveF + (CONS.eaveB - CONS.eaveF) * (z - CONS.zF) / (CONS.zB - CONS.zF);
{
  const C = CONS, W = C.x1 - C.x0, D = C.zB - C.zF, wm = 0.22;
  const glass = { m: 'glass', c: 0xeaf3f5, kind: 'conservatory', lod: 0, ph: 'glass' };
  // Brick dwarf walls (front, left and right with the door opening) and a tiled floor.
  bx((C.x0 + C.x1) / 2, C.zF + wm / 2, W, wm, 0, C.dwarf, { m: 'brick', c: 0xf0e0d4, kind: 'conservatory', lod: 0, ph: 'brick' });
  bx(C.x0 + wm / 2, (C.zF + C.zB) / 2, wm, D, 0, C.dwarf, { m: 'brick', c: 0xf0e0d4, kind: 'conservatory', lod: 0, ph: 'brick' });
  bx(C.x1 - wm / 2, (C.zF + C.door.z0) / 2, wm, C.door.z0 - C.zF, 0, C.dwarf, { m: 'brick', c: 0xf0e0d4, kind: 'conservatory', lod: 0, ph: 'brick' });
  bx(C.x1 - wm / 2, (C.door.z1 + C.zB) / 2, wm, C.zB - C.door.z1, 0, C.dwarf, { m: 'brick', c: 0xf0e0d4, kind: 'conservatory', lod: 0, ph: 'brick' });
  bx((C.x0 + C.x1) / 2, (C.zF + C.zB) / 2, W - wm, D - wm, 0, 0.06, { m: 'stone', c: 0xa86a4a, kind: 'conservatory', lod: 1, ph: 'stone' });
  // White frame: sill capping, front eave beam, corner posts, mullions.
  const frame = { m: 'paint', c: 0xf7f6f1, kind: 'conservatory', ph: 'metal' };
  bx((C.x0 + C.x1) / 2, C.zF + 0.04, W + 0.1, 0.1, C.dwarf, 0.06, { ...frame, lod: 1 });
  bx((C.x0 + C.x1) / 2, C.zF + 0.03, W + 0.12, 0.12, C.eaveF - 0.07, 0.1, { ...frame, lod: 0 });
  for (const x of [C.x0 + 0.03, C.x1 - 0.03]) bx(x, C.zF + 0.04, 0.07, 0.07, C.dwarf, C.eaveF - C.dwarf - 0.05, { ...frame, lod: 1 });
  for (let i = 1; i < 4; i++) bx(C.x0 + i * W / 4, C.zF + 0.04, 0.045, 0.05, C.dwarf, C.eaveF - C.dwarf - 0.05, { ...frame, lod: 1, nocol: true });
  bx((C.x0 + C.x1) / 2, C.zF + 0.04, W, 0.04, 1.55, 0.035, { ...frame, lod: 1, nocol: true });
  // Front glass.
  bx((C.x0 + C.x1) / 2, C.zF + 0.05, W - 0.1, 0.014, C.dwarf + 0.06, C.eaveF - C.dwarf - 0.17, glass);
  // Side glass: the top follows the roof (visual polygon in the renderer; the collider steps up under it).
  for (const side of [-1, 1]) {
    const x = side < 0 ? C.x0 + 0.04 : C.x1 - 0.04;
    const zs = side < 0 ? [[C.zF + 0.1, C.zB - 0.1]] : [[C.zF + 0.1, C.door.z0 - 0.02], [C.door.z1 + 0.02, C.zB - 0.1]];
    for (const [za, zb] of zs) {
      const n = Math.max(1, Math.round((zb - za) / 0.6));
      for (let i = 0; i < n; i++) {
        const z0 = za + (zb - za) * i / n, z1 = za + (zb - za) * (i + 1) / n, top = consRoofY(z0) - 0.08;
        bx(x, (z0 + z1) / 2, 0.014, z1 - z0, C.dwarf + 0.04, top - C.dwarf - 0.04, { ...glass, nocol: false, novis: true });
      }
    }
    bx(x, (C.zF + C.zB) / 2, 0.07, D, C.eaveF - 0.07, 0.07, { ...frame, lod: 1, nocol: true });
  }
  // The French door onto the patio stands open: a leaf hinged on the near jamb, swung out.
  bx(C.x1 + 0.45, C.door.z0 - 0.04, 0.9, 0.04, 0.08, 2.05, { m: 'glass', c: 0xe8f2f2, kind: 'conservatory', ph: 'glass', lod: 1 });
  for (const [dx, dw] of [[0.02, 0.06], [0.88, 0.06]]) bx(C.x1 + dx, C.door.z0 - 0.04, dw, 0.05, 0.08, 2.05, { m: 'paint', c: 0xf7f6f1, kind: 'conservatory', ph: 'metal', lod: 1, nocol: true });
  for (const y0 of [0.08, 2.07]) bx(C.x1 + 0.45, C.door.z0 - 0.04, 0.9, 0.05, y0, 0.06, { m: 'paint', c: 0xf7f6f1, kind: 'conservatory', ph: 'metal', lod: 1, nocol: true });
  bx(C.x1 + 0.45, C.door.z0 - 0.04, 0.9, 0.05, 1.0, 0.05, { m: 'paint', c: 0xf7f6f1, kind: 'conservatory', ph: 'metal', lod: 1, nocol: true });
  bx(C.x1 - 0.03, C.door.z0 - 0.03, 0.07, 0.07, 0.06, 2.1, { ...frame, lod: 1 });
  bx(C.x1 - 0.03, C.door.z1 + 0.03, 0.07, 0.07, 0.06, 2.1, { ...frame, lod: 1 });
  bx(C.x1 - 0.03, (C.door.z0 + C.door.z1) / 2, 0.07, C.door.z1 - C.door.z0, 2.14, 0.1, { ...frame, lod: 1 });
  // Roof: four bays across, the second has the vent. Lean-to glass, front low, back high.
  const L = Math.hypot(D, C.eaveB - C.eaveF), pitch = Math.atan2(C.eaveB - C.eaveF, D);
  const bay = W / 4;
  const slab = (xc, zA, zB2, w) => {
    const mid = (zA + zB2) / 2, len = (zB2 - zA) * L / D;
    tb(xc, consRoofY(mid) + 0.04, mid, w / 2, 0.012, len / 2, [-pitch, 0, 0], { ...glass });
  };
  for (let i = 0; i < 4; i++) {
    const xc = C.x0 + bay * (i + 0.5);
    if (i === 1) {
      slab(xc, C.zF - 0.12, C.vent.z0, bay - 0.06);
      slab(xc, C.vent.z1, C.zB, bay - 0.06);
      // The vent pane hinged along its top edge, propped wide open (past upright).
      const len = (C.vent.z1 - C.vent.z0) * L / D, hz = C.vent.z1, hy = consRoofY(hz) + 0.05;
      const phi = rad(C.vent.open) - pitch;                    // angle above the horizontal towards -z
      const dz = -Math.cos(phi), dy = Math.sin(phi);
      tb(xc, hy + dy * len / 2, hz + dz * len / 2, (bay - 0.08) / 2, 0.012, len / 2, [Math.atan2(-dy, dz), 0, 0], { ...glass, lod: 1 });
      // Frame round the opening and the stay.
      for (const s of [-1, 1]) bx(xc + s * (bay / 2 - 0.02), (C.vent.z0 + C.vent.z1) / 2, 0.045, C.vent.z1 - C.vent.z0, consRoofY((C.vent.z0 + C.vent.z1) / 2) + 0.02, 0.06, { ...frame, lod: 1, nocol: false, rot: undefined });
      rl([xc + 0.2, hy + 0.02, hz - 0.1], [xc + 0.2, hy + 0.5, hz + 0.15], 0.006, { m: 'steel', c: 0xaaaaaa, kind: 'conservatory', lod: 2, nocol: true });
    } else slab(xc, C.zF - 0.12, C.zB, bay - 0.06);
  }
  // Rafters along each bay line (look and the thin rails of the frame).
  for (let i = 0; i <= 4; i++) {
    const x = C.x0 + bay * i, mid = (C.zF + C.zB) / 2;
    const skip = i === 1 || i === 2;
    tb(x, consRoofY(mid) + 0.09, mid, 0.025, 0.03, L / 2 + 0.06, [-pitch, 0, 0], { ...frame, lod: 0, nocol: skip ? true : false, ph: 'metal' });
  }
  bx((C.x0 + C.x1) / 2, C.zB - 0.05, W, 0.1, C.eaveB - 0.06, 0.12, { ...frame, lod: 1 });
  // Furniture: a wicker sofa against the house wall, a glass-topped table, a palm in a pot, a floor lamp.
  const wick = { m: 'wicker', c: 0xc9a76c, kind: 'conservatory', lod: 1 };
  bx(-8.1, 2.08, 1.7, 0.6, 0.08, 0.38, { ...wick });
  bx(-8.1, 2.3, 1.7, 0.16, 0.4, 0.5, { ...wick });
  for (const s of [-1, 1]) bx(-8.1 + s * 0.8, 2.08, 0.12, 0.6, 0.4, 0.2, { ...wick });
  bx(-8.1, 2.02, 1.5, 0.48, 0.46, 0.12, { m: 'fabric', c: 0xd9cdb4, kind: 'conservatory', ph: 'cloth', lod: 2, nocol: true });
  bx(-8.55, 0.5, 0.7, 0.5, 0.0, 0.38, { ...wick, nocol: true, novis: false });
  bx(-8.55, 0.5, 0.74, 0.54, 0.38, 0.03, { m: 'glass', c: 0xdce8ea, kind: 'conservatory', ph: 'glass', lod: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(-8.55 + sx * 0.3, 0.5 + sz * 0.2, 0.05, 0.05, 0.0, 0.38, { ...wick });
  cy(-8.95, 0.05, 0.2, 0.06, 0.4, { m: 'terracotta', c: 0xa8553a, kind: 'conservatory', seg: 10 });
  rl([-6.35, 0.06, 2.1], [-6.35, 1.55, 2.1], 0.014, { m: 'brass', c: 0xb8a064, kind: 'conservatory' });
  cy(-6.35, 2.1, 0.17, 1.5, 0.22, { m: 'fabric', c: 0xe9dcc0, kind: 'conservatory', ph: 'cloth', seg: 10, lod: 2 });
  cy(-6.35, 2.1, 0.12, 0.06, 0.02, { m: 'iron', c: 0x333333, kind: 'conservatory', seg: 8 });
  fol(-8.95, 1.05, 0.05, 0.5, { kind: 'palm' });
  fol(-6.4, 0.55, -0.0, 0.22, { kind: 'fern', pot: true });
}

// ---------------------------------------------------------------- p-1: patio
export const PATIO1 = { x0: -5.95, x1: -3.55, z0: -0.5, z1: 2.4, table: { x: -4.85, z: 0.8, r: 0.55, top: 0.72 } };
{
  const t = PATIO1.table, wh = { m: 'paint', c: 0x2b3a32, kind: 'patio', ph: 'metal' };
  cy(t.x, t.z, t.r, t.top - 0.03, 0.03, { m: 'paint', c: 0x3a4f43, kind: 'patio', ph: 'metal', seg: 16 });
  cy(t.x, t.z, 0.04, 0.0, t.top - 0.03, { ...wh, seg: 8 });
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.4; rl([t.x, 0.03, t.z], [t.x + Math.cos(a) * 0.32, 0.02, t.z + Math.sin(a) * 0.32], 0.014, wh); }
  // Bistro chairs.
  const chair = (cx, cz, yaw) => {
    const f = (lx, lz) => [cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
    bx(cx, cz, 0.4, 0.4, 0.43, 0.03, { ...wh, ry: yaw });
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const [px, pz] = f(lx, lz); rl([px, 0.0, pz], [px, 0.43, pz], 0.012, wh); }
    const [b0x, b0z] = f(-0.18, -0.2), [b1x, b1z] = f(0.18, -0.2);
    rl([b0x, 0.43, b0z], [b0x, 0.9, b0z], 0.012, wh); rl([b1x, 0.43, b1z], [b1x, 0.9, b1z], 0.012, wh);
    const [bmx, bmz] = f(0, -0.2);
    bx(bmx, bmz, 0.4, 0.03, 0.78, 0.12, { ...wh, ry: yaw });
    bx(cx, cz, 0.36, 0.36, 0.455, 0.03, { m: 'fabric', c: 0xc9b891, kind: 'patio', ph: 'cloth', ry: yaw, lod: 2, nocol: true });
  };
  chair(-4.85, 1.78, 0); chair(-5.7, 0.8, -Math.PI / 2);
  // Terracotta pots with geraniums along the house wall, a kettle barbecue at the end.
  for (const [x, z, r, h] of [[-4.0, 2.2, 0.17, 0.34], [-4.45, 2.28, 0.13, 0.26], [-5.6, 2.26, 0.15, 0.3]]) {
    cy(x, z, r, 0, h, { m: 'terracotta', c: 0xb9683f, kind: 'pot', seg: 10 });
    fol(x, h + 0.12, z, r * 1.3, { kind: 'geranium' });
  }
  cy(-3.95, -0.1, 0.27, 0.35, 0.3, { m: 'iron', c: 0x2a2a2a, kind: 'bbq', seg: 12 });
  for (const sx of [-1, 1]) rl([-3.95 + sx * 0.18, 0.0, -0.1], [-3.95 + sx * 0.08, 0.38, -0.1], 0.012, { m: 'iron', c: 0x2a2a2a, kind: 'bbq' });
}
// A teapot on the patio table (beside the stand, out of its way).
cy(PATIO1.table.x + 0.42, PATIO1.table.z - 0.28, 0.07, PATIO1.table.top, 0.12, { m: 'ceramic', c: 0xf0ebdc, kind: 'teapot', seg: 10, ph: 'ceramic', novis: true });
export const STATIONS = [{
  x: -4.97, z: 0.5, y: Y(0.72),
  baseHalf: [0.12, 0.0075, 0.045], postX: 0.105, postHalf: 0.007, postHeight: 0.265, barY: 0.255, barHalf: 0.0055, pegReach: 0.062, pegY: 0.252, pegXs: [-0.055, 0, 0.055],
}];

// ---------------------------------------------------------------- p-1: greenhouse
export const GH = { x0: -10.3, x1: -7.9, z0: -5.9, z1: -4.1, base: 0.25, eave: 1.45, ridge: 2.15, door: { z0: -5.35, z1: -4.65, h: 1.75 }, vent: { xc: -9.4, len: 1.0, open: 75 } };
{
  const G = GH, zr = (G.z0 + G.z1) / 2, hz = (G.z1 - G.z0) / 2, W = G.x1 - G.x0;
  const al = { m: 'paint', c: 0xc9d0d1, kind: 'greenhouse', ph: 'metal' };
  const glass = { m: 'glass', c: 0xe8f2f2, kind: 'greenhouse', ph: 'glass', lod: 0 };
  // Low brick plinth all round but the doorway.
  const pl = { m: 'brick', c: 0xe6d2c3, kind: 'greenhouse', ph: 'brick', lod: 1 };
  bx((G.x0 + G.x1) / 2, G.z0 + 0.05, W, 0.1, 0, G.base, pl); bx((G.x0 + G.x1) / 2, G.z1 - 0.05, W, 0.1, 0, G.base, pl);
  bx(G.x0 + 0.05, zr, 0.1, G.z1 - G.z0 - 0.2, 0, G.base, pl);
  bx(G.x1 - 0.05, (G.z0 + G.door.z0) / 2, 0.1, G.door.z0 - G.z0 - 0.1, 0, G.base, pl);
  bx(G.x1 - 0.05, (G.z1 + G.door.z1) / 2, 0.1, G.z1 - G.door.z1 - 0.1, 0, G.base, pl);
  // Glass walls.
  bx((G.x0 + G.x1) / 2, G.z0 + 0.05, W - 0.12, 0.014, G.base, G.eave - G.base, glass);
  bx((G.x0 + G.x1) / 2, G.z1 - 0.05, W - 0.12, 0.014, G.base, G.eave - G.base, glass);
  bx(G.x0 + 0.05, zr, 0.014, G.z1 - G.z0 - 0.12, G.base, G.eave - G.base, glass);
  bx(G.x1 - 0.05, (G.z0 + G.door.z0) / 2, 0.014, G.door.z0 - G.z0 - 0.05, G.base, G.eave - G.base, glass);
  bx(G.x1 - 0.05, (G.z1 + G.door.z1) / 2, 0.014, G.z1 - G.door.z1 - 0.05, G.base, G.eave - G.base, glass);
  // Gables: stepped colliders under a pointed pane.
  for (const x of [G.x0 + 0.05, G.x1 - 0.05]) {
    bx(x, zr, 0.014, hz * 1.2, G.eave, 0.28, { ...glass, novis: true });
    bx(x, zr, 0.014, hz * 0.55, G.eave + 0.28, 0.3, { ...glass, novis: true });
  }
  bx(G.x1 - 0.05, zr, 0.05, G.door.z1 - G.door.z0 + 0.1, G.door.h, 0.1, { ...al, lod: 1 });
  // Door frame and the door itself standing open (hinged on the front jamb, swung out).
  for (const z of [G.door.z0 - 0.025, G.door.z1 + 0.025]) bx(G.x1 - 0.05, z, 0.05, 0.05, 0.0, G.door.h + 0.1, { ...al, lod: 1 });
  bx(G.x1 + 0.3, G.door.z1 + 0.03, 0.62, 0.035, 0.08, G.door.h - 0.1, { ...glass, lod: 1 });
  for (const [dx, w2] of [[0.0, 0.05], [0.6, 0.05]]) bx(G.x1 + dx, G.door.z1 + 0.03, w2, 0.045, 0.06, G.door.h - 0.05, { ...al, lod: 1, nocol: true });
  for (const y0 of [0.06, G.door.h - 0.04, 0.9]) bx(G.x1 + 0.3, G.door.z1 + 0.03, 0.66, 0.045, y0, 0.05, { ...al, lod: 1, nocol: true });
  // Frame: corner posts, eave and ridge rails.
  for (const x of [G.x0 + 0.03, G.x1 - 0.03]) for (const z of [G.z0 + 0.03, G.z1 - 0.03]) bx(x, z, 0.06, 0.06, 0, G.eave, { ...al, lod: 1 });
  const ey = (z) => G.eave + (G.ridge - G.eave) * (1 - Math.abs(z - zr) / hz);
  void ey;
  for (const z of [G.z0 + 0.03, G.z1 - 0.03]) bx((G.x0 + G.x1) / 2, z, W + 0.1, 0.06, G.eave - 0.03, 0.05, { ...al, lod: 1 });
  bx((G.x0 + G.x1) / 2, zr, W + 0.14, 0.07, G.ridge - 0.02, 0.07, { ...al, lod: 1 });
  const pitch = Math.atan2(G.ridge - G.eave, hz), L = Math.hypot(hz, G.ridge - G.eave);
  const nb = 4, bw = W / nb;
  for (const side of [-1, 1]) {        // -1: back slope (towards -z), +1: front slope
    for (let i = 0; i < nb; i++) {
      const xc = G.x0 + bw * (i + 0.5);
      const cz = zr + side * hz / 2, ch = (G.eave + G.ridge) / 2 + 0.02;
      if (side === 1 && Math.abs(xc - GH.vent.xc) < 0.01) {
        // The roof vent: a lower fixed pane, and the vent pane hinged at the ridge, propped up past 60 degrees.
        const vl = GH.vent.len, rest = L - vl;
        const a = side * pitch;
        // lower fixed strip
        const zz = zr + side * (vl * Math.cos(pitch) + rest * Math.cos(pitch) / 2), hh = G.ridge - (vl + rest / 2) * Math.sin(pitch);
        tb(xc, hh + 0.02, zz, bw / 2 - 0.03, 0.01, rest / 2, [a, 0, 0], { ...glass });
        const phi = rad(GH.vent.open);                           // angle above the horizontal towards +z
        const dz = Math.cos(phi), dy = Math.sin(phi);
        tb(xc, G.ridge + dy * vl / 2 + 0.03, zr + dz * vl / 2 + 0.03, bw / 2 - 0.04, 0.01, vl / 2, [Math.atan2(-dy, dz), 0, 0], { ...glass, lod: 1 });
        for (const s of [-1, 1]) tb(xc + s * (bw / 2 - 0.01), G.ridge - vl / 2 * Math.sin(pitch) + 0.02, zr + vl / 2 * Math.cos(pitch), 0.015, 0.02, vl / 2, [a, 0, 0], { ...al, lod: 1 });
        continue;
      }
      tb(xc, ch, cz, bw / 2 - 0.03, 0.01, L / 2, [side * pitch, 0, 0], { ...glass });
    }
    for (let i = 0; i <= nb; i++) {
      const x = G.x0 + bw * i;
      tb(x, (G.eave + G.ridge) / 2 + 0.05, zr + side * hz / 2, 0.02, 0.025, L / 2, [side * pitch, 0, 0], { ...al, lod: 1, nocol: true });
    }
  }
  // Staging along the front wall (the vent's side), pots and seed trays on it; tomatoes in pots along the back.
  const wood = { m: 'weathered', c: 0xb9a07c, kind: 'greenhouse', lod: 1 };
  bx(-9.35, -4.35, 1.95, 0.4, 0.78, 0.04, wood);
  bx(-9.35, -4.35, 1.95, 0.36, 0.28, 0.03, wood);
  for (const x of [-10.28 + 0.1, -9.35, -8.4]) for (const z of [-4.18, -4.52]) bx(x, z, 0.04, 0.04, 0.0, 0.78, { ...wood, nocol: z > -4.3 && x === -9.35 });
  for (let i = 0; i < 5; i++) {
    const x = -10.15 + i * 0.37 + (i === 3 ? 0.3 : 0);
    if (Math.abs(x - -9.4) < 0.28) continue;
    cy(x, -4.3, 0.065, 0.82, 0.1, { m: 'terracotta', c: [0xb9683f, 0xa65a3a, 0xc27a50][i % 3], kind: 'pot', seg: 8, lod: 2 });
    fol(x, 1.0, -4.3, 0.1, { kind: 'seedling' });
  }
  bx(-8.65, -4.4, 0.42, 0.26, 0.82, 0.04, { m: 'paint', c: 0x2b2b2b, kind: 'greenhouse', ph: 'plastic', lod: 2 });
  // The cup's place: a shelf corner under the vent.
  // Tomatoes: pots on the floor along the back wall, with canes and the plants themselves.
  for (let i = 0; i < 5; i++) {
    const x = -10.05 + i * 0.5;
    cy(x, -5.62, 0.14, 0.0, 0.28, { m: 'terracotta', c: [0xb9683f, 0xa65a3a][i % 2], kind: 'pot', seg: 10 });
    rl([x, 0.05, -5.62], [x, 1.5, -5.62], 0.008, { m: 'wood', c: 0xc9b07c, kind: 'cane', nocol: true, lod: 1 });
    fol(x, 0.95, -5.62, 0.34, { kind: 'tomato', seed: i });
  }
  // Watering can, a bag of compost and a trug by the door.
  cy(-7.55, -4.1, 0.1, 0.0, 0.2, { m: 'zinc', c: 0x9aa4a0, kind: 'can', seg: 10 });
  bx(-7.55, -5.8, 0.3, 0.55, 0.0, 0.3, { m: 'paint', c: 0x2e5a3a, kind: 'compost', ph: 'plastic', lod: 2 });
}
export const GH_CUP_AT = { x: -9.4, z: -4.45, y: Y(0.82) };

// ---------------------------------------------------------------- p-1: trampoline in a net
export const TRAMP = { x: -4.85, z: -2.0, r: 1.22, frameY: 0.8, netTop: 2.75, opening: { ang: 0, half: 22.5 } };
export const TRAMP_POLES = Array.from({ length: 8 }, (_, i) => { const a = rad(22.5 + 45 * i); return { x: TRAMP.x + Math.sin(a) * (TRAMP.r + 0.04), z: TRAMP.z + Math.cos(a) * (TRAMP.r + 0.04), a }; });
{
  const T = TRAMP, st = { m: 'steel', c: 0x3a3d40, kind: 'trampoline', ph: 'metal' };
  // Mat and spring cover as one solid disc (a ball cannot get through the springs), legs and frame ring.
  cy(T.x, T.z, T.r, T.frameY - 0.05, 0.1, { m: 'rubber', c: 0x1b1d1f, kind: 'trampoline', ph: 'plastic', seg: 20 });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + 0.2, x = T.x + Math.cos(a) * (T.r - 0.12), z = T.z + Math.sin(a) * (T.r - 0.12);
    rl([x, T.frameY - 0.05, z], [x + Math.cos(a) * 0.18, 0.0, z + Math.sin(a) * 0.18], 0.022, st);
  }
  // Net poles and the enclosure net between them (the opening faces +z, the patio).
  const nets = TRAMP_POLES;
  nets.forEach((p) => rl([p.x, T.frameY, p.z], [p.x - Math.sin(p.a) * 0.04, T.netTop, p.z - Math.cos(p.a) * 0.04], 0.018, { ...st, c: 0x2a2d2f }));
  for (let i = 0; i < 7; i++) {   // segment 7 (between the last and first pole) is the entrance, facing +z
    const p0 = nets[i], p1 = nets[(i + 1) % 8];
    const mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2, len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const yaw = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
    bx(mx, mz, len - 0.04, 0.02, T.frameY + 0.05, T.netTop - T.frameY - 0.1, { m: 'net', c: 0x1c1f20, kind: 'trampoline', ph: 'rope', ry: yaw, lod: 1 });
  }
  // The net's top edge is a foam-capped pole at each post.
  nets.forEach((p) => cy(p.x - Math.sin(p.a) * 0.04, p.z - Math.cos(p.a) * 0.04, 0.03, T.netTop - 0.02, 0.1, { m: 'rubber', c: 0x1d2a3a, kind: 'trampoline', ph: 'plastic', seg: 8 }));
}

// ---------------------------------------------------------------- p-1: swing seat with a canopy
export const SWING = { cx: -4.75, cz: -5.15, hl: 0.95, topY: 2.0, seatY: 0.46 };
{
  const S = SWING, frame = { m: 'iron', c: 0x24382c, kind: 'swing', ph: 'metal' };
  for (const sx of [-1, 1]) {
    const x = S.cx + sx * 0.85;
    rl([x, 0.0, S.cz - 0.68], [x, S.topY, S.cz], 0.026, frame);
    rl([x, 0.0, S.cz + 0.68], [x, S.topY, S.cz], 0.026, frame);
    rl([x, 0.3, S.cz - 0.4], [x, 0.3, S.cz + 0.4], 0.016, { ...frame, nocol: true });
  }
  rl([S.cx - 0.95, S.topY, S.cz], [S.cx + 0.95, S.topY, S.cz], 0.03, frame);
  // The seat: slatted base, back, arms and cushions; hung by four chains.
  const wd = { m: 'weathered', c: 0xa88a5a, kind: 'swing' };
  bx(S.cx, S.cz, 1.7, 0.56, S.seatY - 0.04, 0.05, wd);
  bx(S.cx, S.cz - 0.27, 1.7, 0.05, S.seatY, 0.5, wd);
  for (const sx of [-1, 1]) bx(S.cx + sx * 0.82, S.cz, 0.05, 0.56, S.seatY, 0.26, wd);
  bx(S.cx, S.cz + 0.02, 1.56, 0.5, S.seatY + 0.01, 0.1, { m: 'fabric', c: 0xd7c9a6, kind: 'swing', ph: 'cloth', lod: 1 });
  bx(S.cx, S.cz - 0.2, 1.56, 0.12, S.seatY + 0.1, 0.4, { m: 'fabric', c: 0xcdbf9c, kind: 'swing', ph: 'cloth', lod: 1, nocol: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rl([S.cx + sx * 0.8, S.topY - 0.02, S.cz + (sz > 0 ? 0.0 : 0.0)], [S.cx + sx * 0.82, S.seatY + 0.25, S.cz + sz * 0.26], 0.007, { m: 'steel', c: 0x777777, kind: 'swing', nocol: true });
  // Canopy: two sloped halves of striped canvas, with a valance.
  const pitch = rad(9), half = 0.7, cl = half / Math.cos(pitch);
  for (const sz of [-1, 1]) {
    tb(S.cx, S.topY + 0.1 - 0.0, S.cz + sz * half / 2, 1.05, 0.015, cl / 2, [sz * pitch, 0, 0], { m: 'fabric', c: 0xe9e1cc, kind: 'swing', ph: 'cloth', lod: 0, nocol: false });
  }
  for (const sz of [-1, 1]) bx(S.cx, S.cz + sz * (half + 0.02), 2.1, 0.03, S.topY - 0.06, 0.16, { m: 'fabric', c: 0x4a6b52, kind: 'swing', ph: 'cloth', lod: 1 });
  for (const sx of [-1, 1]) bx(S.cx + sx * 1.06, S.cz, 0.03, 1.4, S.topY - 0.04, 0.14, { m: 'fabric', c: 0x4a6b52, kind: 'swing', ph: 'cloth', lod: 1 });
}

// ---------------------------------------------------------------- p-1: rotary washing line
export const ROT = { x: -7.1, z: -3.1, R: 0.85, lineY: 1.62, turn: -1.2 };
export const ROT_ITEMS = [
  // [angle (rad, 0 = +x, towards +z), width, hang, kind, colour]; the gaps at 0 and 2.54 rad stay open for flying through
  [0.94, 0.9, 0.85, 'sheet', 0xe9e6dc], [1.925, 0.52, 0.5, 'towel', 0x3f6b8a], [3.38, 0.9, 0.85, 'sheet', 0xdfe7ea],
  [4.385, 0.55, 0.55, 'towel', 0xd9c27a], [5.36, 0.85, 0.8, 'sheet', 0xcdd9c5],
];
{
  const R = ROT, st = { m: 'steel', c: 0xb9bdbf, kind: 'washing', ph: 'metal' };
  rl([R.x, 0.0, R.z], [R.x, 1.9, R.z], 0.022, st);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    rl([R.x, 1.82, R.z], [R.x + Math.cos(a) * 1.05, 1.66, R.z + Math.sin(a) * 1.05], 0.012, { ...st, nocol: true });
  }
  cy(R.x, R.z, 0.12, 1.78, 0.14, { m: 'rubber', c: 0xc9473a, kind: 'washing', ph: 'plastic', seg: 8 });
  for (const [ang, w, hang] of ROT_ITEMS) {
    const an = ang + R.turn, px = R.x + Math.cos(an) * R.R, pz = R.z + Math.sin(an) * R.R;
    bx(px, pz, w, 0.03, R.lineY - hang, hang, { m: 'fabric', c: 0xffffff, kind: 'washing', ph: 'cloth', ry: -an - Math.PI / 2, lod: 1, novis: true });
  }
}

// ---------------------------------------------------------------- p-1: koi pond, rockery, heron
export const POND1 = { x: -9.2, z: -2.35, rx: 0.88, rz: 0.66, rot: 0.25, rim: 0.14, water: 0.09 };
export const FOUNTAIN = { x: -9.1, z: -2.4, h: 0.55 };
{
  const P = POND1;
  // Raised stone kerb round the pond.
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, c = Math.cos(P.rot), s = Math.sin(P.rot);
    const ex = Math.cos(a) * (P.rx + 0.07), ez = Math.sin(a) * (P.rz + 0.07);
    const x = P.x + ex * c - ez * s, z = P.z + ex * s + ez * c;
    const ang = Math.atan2(-(Math.cos(a) * (P.rz + 0.07) * c + -Math.sin(a) * (P.rx + 0.07) * s * 0), 1);
    void ang;
    cy(x, z, 0.17 + 0.03 * Math.sin(i * 2.3), 0.0, P.rim + 0.02 * Math.cos(i * 1.7), { m: 'stone', c: [0xa9a395, 0xb3ac9b, 0x9a9588, 0xaaa597][i % 4], kind: 'pond', ph: 'stone', seg: 7, look: 'rock' });
  }
  // The water as a solid thin disc (never see through into the ground).
  cy(P.x, P.z, 0.55, P.water - 0.02, 0.03, { m: 'water', c: 0xffffff, kind: 'pond', ph: 'water', nocol: false, novis: true });
  // Fountain: a stone pedestal and bowl on a plinth in the pond.
  cy(FOUNTAIN.x, FOUNTAIN.z, 0.06, 0.0, 0.34, { m: 'stone', c: 0xb7b09f, kind: 'pond', ph: 'stone', seg: 8 });
  cy(FOUNTAIN.x, FOUNTAIN.z, 0.15, 0.34, 0.07, { m: 'stone', c: 0xb7b09f, kind: 'pond', ph: 'stone', seg: 12 });
  cy(FOUNTAIN.x, FOUNTAIN.z, 0.03, 0.41, 0.14, { m: 'copper', c: 0xb87a4a, kind: 'pond', ph: 'metal', seg: 6, nocol: false });
  // A heron ornament on the rim and a stone toad.
  rl([-9.95, 0.14, -1.55], [-9.95, 0.62, -1.55], 0.012, { m: 'iron', c: 0x4a4a4a, kind: 'heron' });
  bl(-9.95, 0.8, -1.55, 0.13, { m: 'paint', c: 0x8a949a, kind: 'heron', ph: 'metal', lod: 1 });
  rl([-9.95, 0.85, -1.55], [-9.88, 1.12, -1.6], 0.025, { m: 'paint', c: 0x9aa4aa, kind: 'heron', ph: 'metal' });
  bl(-9.88, 1.15, -1.62, 0.04, { m: 'paint', c: 0x9aa4aa, kind: 'heron', ph: 'metal', lod: 1 });
  rl([-9.88, 1.14, -1.62], [-9.78, 1.12, -1.78], 0.01, { m: 'brass', c: 0xd9a830, kind: 'heron', ph: 'metal' });
  // Rockery along the left fence.
  const rk = [[-10.15, 0.0, 0.28, 0.4], [-10.1, 0.9, 0.34, 0.5], [-10.2, 1.5, 0.3, 0.42], [-9.9, -0.35, 0.22, 0.3], [-9.95, 0.45, 0.2, 0.34], [-10.0, 1.1, 0.2, 0.3], [-10.35, 0.5, 0.25, 0.7], [-10.3, 1.2, 0.24, 0.65], [-9.85, 1.75, 0.22, 0.3], [-10.35, -0.2, 0.2, 0.5], [-10.28, 1.85, 0.2, 0.5]];
  rk.forEach(([x, z, r, h], i) => bl(x, h * 0.55, z, r, { m: 'stone', c: [0x8d8a82, 0x9a968a, 0x7e7c75, 0xa49f92][i % 4], kind: 'rockery', ph: 'stone', lod: 0 }));
  for (const [x, z, h, r] of [[-10.1, 0.3, 0.55, 0.16], [-9.98, 0.9, 0.5, 0.14], [-10.2, 0.0, 0.62, 0.13], [-10.05, 1.5, 0.52, 0.15], [-9.9, 1.2, 0.35, 0.12], [-10.3, 0.8, 0.9, 0.16]]) fol(x, h, z, r, { kind: 'alpine' });
  bx(-10.1, 0.65, 0.78, 2.5, 0.0, 0.12, { m: 'soil', c: 0x4a3a2c, kind: 'rockery', ph: 'plant', lod: 1 });
  // The cup's drum: a stone millstone table beside the pond.
  cy(-8.7, -0.95, 0.2, 0.0, 0.34, { m: 'stone', c: 0x8d8a82, kind: 'stone', ph: 'stone', seg: 12 });
  cy(-8.7, -0.95, 0.24, 0.34, 0.05, { m: 'stone', c: 0x777670, kind: 'stone', ph: 'stone', seg: 14 });
}
export const KOI_CUP_AT = { x: -8.7, z: -0.95, y: Y(0.39) };

// ---------------------------------------------------------------- p-2: the old caravan
export const CARAVAN = { x0: -17.2, x1: -13.0, z0: -4.9, z1: -2.9, floor: 0.5, h: 2.2, door: { x: -15.5, w: 0.7 }, win: { x: -14.0, w: 0.9, y0: 1.3, y1: 1.95 } };
{
  const C = CARAVAN, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2, th = 0.06;
  const body = { m: 'paint', c: 0xd8d2b8, kind: 'caravan', ph: 'metal', lod: 0 };
  const trim = { m: 'paint', c: 0x5d6f5c, kind: 'caravan', ph: 'metal', lod: 1 };
  // Floor and chassis.
  bx(cx, cz, C.x1 - C.x0, C.z1 - C.z0, C.floor - 0.1, 0.1, { ...body, c: 0x6b6558 });
  bx(cx, cz, C.x1 - C.x0 - 0.3, 0.1, 0.3, 0.12, { m: 'iron', c: 0x5a4a3a, kind: 'caravan', ph: 'metal', lod: 1 });
  // Walls: the front (+z) wall has the door opening, the back (-z) wall a window opening, both ends solid.
  const wallH = C.h - 0.15;
  const dx0 = C.door.x - C.door.w / 2, dx1 = C.door.x + C.door.w / 2;
  bx((C.x0 + dx0) / 2, C.z1 - th / 2, dx0 - C.x0, th, C.floor, wallH, body);
  bx((dx1 + C.x1) / 2, C.z1 - th / 2, C.x1 - dx1, th, C.floor, wallH, body);
  bx(C.door.x, C.z1 - th / 2, C.door.w, th, C.floor + 1.8, wallH - 1.8, body);
  const wx0 = C.win.x - C.win.w / 2, wx1 = C.win.x + C.win.w / 2;
  bx((C.x0 + wx0) / 2, C.z0 + th / 2, wx0 - C.x0, th, C.floor, wallH, body);
  bx((wx1 + C.x1) / 2, C.z0 + th / 2, C.x1 - wx1, th, C.floor, wallH, body);
  bx(C.win.x, C.z0 + th / 2, C.win.w, th, C.floor, C.win.y0 - C.floor, body);
  bx(C.win.x, C.z0 + th / 2, C.win.w, th, C.win.y1, C.floor + wallH - C.win.y1, body);
  for (const x of [C.x0 + th / 2, C.x1 - th / 2]) bx(x, cz, th, C.z1 - C.z0, C.floor, wallH, { ...body, c: 0xd2cdb4 });
  // Roof: a shallow dome of two slabs, a skylight hatch left ajar, and rusty roof rails.
  bx(cx, cz, C.x1 - C.x0 + 0.1, C.z1 - C.z0 + 0.1, C.floor + wallH, 0.07, { ...body, c: 0xe2ddc9 });
  for (const sz of [-1, 1]) tb(cx, C.floor + wallH + 0.14, cz + sz * 0.55, (C.x1 - C.x0) / 2, 0.025, 0.55, [sz * -rad(9) * -1, 0, 0], { ...body, c: 0xe2ddc9, nocol: true });
  // Belt rail, green trim and a skirt.
  bx(cx, C.z1 + 0.006, C.x1 - C.x0, 0.012, C.floor + 0.95, 0.12, { ...trim, nocol: true });
  bx(cx, C.z0 - 0.006, C.x1 - C.x0, 0.012, C.floor + 0.95, 0.12, { ...trim, nocol: true });
  bx(cx, C.z1 + 0.006, C.x1 - C.x0, 0.012, C.floor, 0.1, { ...trim, nocol: true });
  // Door standing open, hinged on its left (x low) edge, swung out about 100 degrees.
  bx(dx0 - 0.04, C.z1 + 0.33, 0.04, 0.66, C.floor, 1.75, { ...trim, c: 0xc9c2a6, lod: 1 });
  // Step and a tow hitch with a jockey wheel.
  bx(C.door.x, C.z1 + 0.25, 0.7, 0.4, 0.0, C.floor - 0.1, { m: 'stone', c: 0x9a9588, kind: 'step', ph: 'stone' });
  rl([C.x1, C.floor - 0.1, cz - 0.3], [C.x1 + 1.0, 0.45, cz], 0.025, { m: 'iron', c: 0x5a4a3a, kind: 'caravan', ph: 'metal' });
  rl([C.x1, C.floor - 0.1, cz + 0.3], [C.x1 + 1.0, 0.45, cz], 0.025, { m: 'iron', c: 0x5a4a3a, kind: 'caravan', ph: 'metal' });
  cy(C.x1 + 0.9, cz, 0.12, 0.0, 0.1, { m: 'rubber', c: 0x222222, kind: 'caravan', ph: 'plastic', seg: 8 });
  rl([C.x1 + 0.9, 0.1, cz], [C.x1 + 0.9, 0.45, cz], 0.02, { m: 'iron', c: 0x5a4a3a, kind: 'caravan', ph: 'metal' });
  // Wheels (one has gone: it sits on bricks).
  for (const [x, flat] of [[cx + 0.35, false], [cx - 1.3, true]]) for (const sz of [-1, 1]) {
    const z = cz + sz * (C.z1 - C.z0) / 2 * 0.98;
    if (flat && sz < 0) { bx(x, z, 0.4, 0.2, 0.0, 0.5, { m: 'brick', c: 0xe0cbb8, kind: 'caravan', ph: 'brick' }); continue; }
    cy(x, z + sz * 0.06, 0.32, 0.23, 0.18, { m: 'rubber', c: 0x232323, kind: 'caravan', ph: 'plastic', seg: 14, rot: [Math.PI / 2, 0, 0] });
  }
  // Interior: benches along the back wall and the front ends, a table by the window, a shelf, a cooker.
  const cush = { m: 'fabric', c: 0x7a5b4a, kind: 'caravan', ph: 'cloth', lod: 1 };
  bx((C.x0 + wx0 - 0.1) / 2 + 0.05, C.z0 + th + 0.28, wx0 - C.x0 - 0.45, 0.5, C.floor, 0.42, { m: 'wood', c: 0xa88a64, kind: 'caravan', lod: 1 });
  bx((C.x0 + wx0 - 0.1) / 2 + 0.05, C.z0 + th + 0.28, wx0 - C.x0 - 0.45, 0.5, C.floor + 0.42, 0.1, cush);
  bx((C.x0 + wx0 - 0.1) / 2 + 0.05, C.z0 + th + 0.04, wx0 - C.x0 - 0.45, 0.08, C.floor + 0.52, 0.55, { ...cush, c: 0x6b4f40 });
  bx(C.x1 - th - 0.28, cz, 0.5, 1.5, C.floor, 0.42, { m: 'wood', c: 0xa88a64, kind: 'caravan', lod: 1 });
  bx(C.x1 - th - 0.28, cz, 0.5, 1.5, C.floor + 0.42, 0.1, cush);
  bx(C.x0 + th + 0.3, cz - 0.4, 0.6, 0.7, C.floor, 0.9, { m: 'wood', c: 0xc7b78e, kind: 'caravan', lod: 1 });
  cy(-14.9, -3.7, 0.28, C.floor + 0.7, 0.03, { m: 'wood', c: 0xd8c9a2, kind: 'caravan', seg: 12 });
  rl([-14.9, C.floor, -3.7], [-14.9, C.floor + 0.7, -3.7], 0.03, { m: 'iron', c: 0x4a4a4a, kind: 'caravan', ph: 'metal' });
  // The window: a pane hinged along its top edge, propped open outwards.
  const wy = C.win.y1, wz = C.z0;
  { // hinged along its top edge, propped out 35 degrees: direction from the hinge (dy, dz)
    const dy = -Math.cos(rad(75)), dz = -Math.sin(rad(75)), len = 0.44;
    tb(C.win.x, wy + dy * len / 2, wz + dz * len / 2, C.win.w / 2 - 0.02, 0.012, len / 2, [Math.atan2(-dy, dz), 0, 0], { m: 'glass', c: 0xe8f2f2, kind: 'caravan', ph: 'glass', lod: 1 });
  }
  bx(C.win.x, wz - 0.06, C.win.w + 0.12, 0.05, C.win.y0 - 0.05, 0.05, { ...trim, lod: 1 });
  rl([C.win.x - 0.3, wy, wz], [C.win.x - 0.3, wy + 0.04, wz - 0.3], 0.006, { m: 'steel', c: 0x999999, kind: 'caravan', nocol: true, lod: 2 });
  // Gas bottle and a pair of cracked flowerpots at the door; the fold-up camping table beside it.
  cy(C.x1 - 0.7, C.z1 + 0.18, 0.12, 0.0, 0.42, { m: 'paint', c: 0x5a7a52, kind: 'caravan', ph: 'metal', seg: 10 });
  cy(C.x0 + 0.5, C.z1 + 0.2, 0.16, 0.0, 0.3, { m: 'terracotta', c: 0xa65a3a, kind: 'pot', seg: 10 });
}
export const CAMP = { x: -14.0, z: -2.35, top: 0.72, hx: 0.38, hz: 0.28 };
{
  const T = CAMP, s = { m: 'steel', c: 0x8c8f90, kind: 'camptable', ph: 'metal' };
  bx(T.x, T.z, T.hx * 2, T.hz * 2, T.top - 0.04, 0.04, { m: 'wood', c: 0xb89868, kind: 'camptable' });
  for (const sx of [-1, 1]) {
    rl([T.x + sx * (T.hx - 0.04), T.top - 0.04, T.z - T.hz + 0.04], [T.x + sx * (T.hx + 0.08), 0.0, T.z + 0.02], 0.014, s);
    rl([T.x + sx * (T.hx - 0.04), T.top - 0.04, T.z + T.hz - 0.04], [T.x + sx * (T.hx + 0.08), 0.0, T.z - 0.02], 0.014, s);
  }
}
export const CARAVAN_CUP_AT = { x: -13.85, z: -2.3, y: Y(0.72) };
{ // a tin plate and a teapot kept company on the table
  cy(-14.2, -2.4, 0.09, 0.72, 0.012, { m: 'enamel', c: 0xe8e2d0, kind: 'camptable', ph: 'metal', seg: 12, lod: 2 });
}

// ---------------------------------------------------------------- p-2: bath planter
export const BATH = { x: -14.0, z: -0.35, yaw: 0.12, hl: 0.85, hw: 0.4, rim: 0.6 };
{
  const B = BATH, c = Math.cos(B.yaw), s = Math.sin(B.yaw);
  const at = (lx, lz) => [B.x + lx * c + lz * s, B.z - lx * s + lz * c];
  const en = { m: 'enamel', c: 0xd9d8cc, kind: 'bath', ph: 'metal', lod: 1 };
  // Walls, rolled rim at the tap end wide enough to stand a mug on, feet.
  for (const side of [-1, 1]) { const [x, z] = at(0, side * (B.hw - 0.025)); bx(x, z, B.hl * 2, 0.05, 0.16, B.rim - 0.16, { ...en, ry: B.yaw }); }
  for (const side of [-1, 1]) { const [x, z] = at(side * (B.hl - 0.025), 0); bx(x, z, 0.05, B.hw * 2 - 0.02, 0.16, B.rim - 0.16, { ...en, ry: B.yaw }); }
  { const [x, z] = at(0, 0); bx(x, z, B.hl * 2 - 0.05, B.hw * 2 - 0.05, 0.16, 0.08, { ...en, c: 0x8a8070, ry: B.yaw }); }
  { const [x, z] = at(-B.hl + 0.1, 0); bx(x, z, 0.2, B.hw * 2 + 0.04, B.rim - 0.03, 0.03, { ...en, c: 0xe3e2d6, ry: B.yaw }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [x, z] = at(sx * (B.hl - 0.14), sz * (B.hw - 0.12)); cy(x, z, 0.045, 0.0, 0.16, { m: 'iron', c: 0x2b2b2b, kind: 'bath', ph: 'metal', seg: 6 }); }
  { const [x, z] = at(0, 0); bx(x, z, B.hl * 2 - 0.1, B.hw * 2 - 0.1, 0.4, 0.12, { m: 'soil', c: 0x3d2f24, kind: 'bath', ph: 'plant', ry: B.yaw, lod: 1 }); }
  { const [x, z] = at(-B.hl - 0.08, 0.1); rl([x, 0.45, z], [x, 0.74, z], 0.012, { m: 'brass', c: 0xb9a35a, kind: 'bath', ph: 'metal' }); }
  for (let i = 0; i < 6; i++) { const [x, z] = at(-0.5 + i * 0.22, (i % 2 - 0.5) * 0.3); fol(x, 0.72, z, 0.2, { kind: 'nasturtium', seed: i }); }
}
export const BATH_CUP_AT = (() => { const B = BATH, c = Math.cos(B.yaw), s = Math.sin(B.yaw), lx = -B.hl + 0.1; return { x: B.x + lx * c, z: B.z - lx * s, y: Y(B.rim) }; })();

// ---------------------------------------------------------------- p-2: bicycle, lean-to, tree, pond
export const BIKE = { x: -17.38, z0: -0.1, lean: 0.2 };
{
  const B = BIKE, ru = { m: 'iron', c: 0x6b3f2a, kind: 'bike', ph: 'metal' };
  const P = (z, h) => [B.x - B.lean * h, h, z];
  for (const wz of [B.z0, B.z0 + 1.02]) {
    for (let i = 0; i < 10; i++) {
      const a0 = i / 10 * Math.PI * 2, a1 = (i + 1) / 10 * Math.PI * 2;
      rl(P(wz + Math.cos(a0) * 0.34, 0.34 + Math.sin(a0) * 0.34), P(wz + Math.cos(a1) * 0.34, 0.34 + Math.sin(a1) * 0.34), 0.016, { ...ru, c: 0x7a4a30 });
    }
    rl(P(wz - 0.34, 0.34), P(wz + 0.34, 0.34), 0.008, { ...ru, c: 0x7a4a30 });
    rl(P(wz, 0.0), P(wz, 0.68), 0.008, { ...ru, c: 0x7a4a30 });
  }
  const z0 = B.z0;
  rl(P(z0, 0.34), P(z0 + 0.45, 0.62), 0.016, ru); rl(P(z0 + 0.45, 0.62), P(z0 + 0.95, 0.66), 0.016, ru);
  rl(P(z0, 0.34), P(z0 + 0.5, 0.2), 0.014, ru); rl(P(z0 + 0.5, 0.2), P(z0 + 0.95, 0.66), 0.014, ru);
  rl(P(z0 + 1.02, 0.34), P(z0 + 0.95, 0.92), 0.014, ru); rl(P(z0 + 0.8, 0.98), P(z0 + 1.12, 1.0), 0.014, { ...ru, c: 0x4a3a30 });
  bx(P(z0 + 0.38, 0.7)[0], z0 + 0.4, 0.06, 0.22, 0.68, 0.05, { m: 'rubber', c: 0x4a3328, kind: 'bike' });
}
export const LEANTO = { x0: -15.6, x1: -12.6, z0: 0.9, z1: 2.7, hBack: 2.55, hFront: 2.15 };
{
  const L = LEANTO, wood = { m: 'weathered', c: 0x8a7b62, kind: 'leanto', lod: 1 }, roofc = { m: 'zinc', c: 0x7d8c82, kind: 'leanto', ph: 'metal', lod: 0 };
  // Walls of old boards (left side, right side half) and the corrugated roof; the front is open.
  bx(L.x0 + 0.04, (L.z0 + L.z1) / 2, 0.08, L.z1 - L.z0, 0, 2.3, wood);
  bx(L.x1 - 0.04, (L.z0 + 1.3) / 2 + 0.55, 0.08, 1.3 - L.z0 + 0.55 - 0.0, 0, 2.2, wood);
  bx(L.x1 - 0.04, L.z0 + 0.25, 0.08, 0.5, 0, 2.2, wood);
  for (const x of [L.x0, L.x1]) bx(x, L.z0 + 0.04, 0.09, 0.09, 0, L.hFront, { ...wood, c: 0x6f6350 });
  const sl = Math.atan2(L.hBack - L.hFront, L.z1 - L.z0), len = Math.hypot(L.z1 - L.z0, L.hBack - L.hFront);
  tb((L.x0 + L.x1) / 2, (L.hBack + L.hFront) / 2 + 0.05, (L.z0 + L.z1) / 2, (L.x1 - L.x0) / 2 + 0.15, 0.025, len / 2, [-sl, 0, 0], roofc);
  // Inside: a log pile, a coal bunker and an old mangle.
  bx(-15.2, 2.35, 0.7, 0.55, 0.0, 0.7, { m: 'bark', c: 0x8a6e52, kind: 'logs', ph: 'wood' });
  bx(-13.2, 2.3, 0.8, 0.7, 0.0, 0.8, { m: 'zinc', c: 0x6a6f6c, kind: 'bunker', ph: 'metal' });
  bx(-14.2, 2.45, 0.5, 0.35, 0.0, 0.9, { m: 'iron', c: 0x3a3a3a, kind: 'mangle', ph: 'metal' });
  bx(-14.2, 1.65, 0.9, 0.2, 0.0, 0.05, { m: 'stone', c: 0x9a9588, kind: 'step', ph: 'stone', lod: 2, nocol: true });
}
export const TREE_FALLEN = { x0: -16.9, z0: -2.0, x1: -16.5, z1: 0.0, r0: 0.17, r1: 0.1 };
{
  const T = TREE_FALLEN;
  rl([T.x0, 0.2, T.z0], [(T.x0 + T.x1) / 2, 0.32, (T.z0 + T.z1) / 2], T.r0 * 0.9, { m: 'bark', c: 0x8a7a68, kind: 'tree', ph: 'wood', lod: 0 });
  rl([(T.x0 + T.x1) / 2, 0.32, (T.z0 + T.z1) / 2], [T.x1, 0.44, T.z1], T.r1 * 0.95, { m: 'bark', c: 0x8a7a68, kind: 'tree', ph: 'wood', lod: 0 });
  bx(T.x0 - 0.02, T.z0 - 0.15, 0.4, 0.35, 0.0, 0.5, { m: 'bark', c: 0x6f604f, kind: 'tree', ph: 'wood', nocol: false });
  // A few of its boughs lying on the grass.
  for (const [dx, dz, h] of [[0.5, 0.5, 0.6], [-0.4, 0.55, 0.7], [0.1, 0.9, 0.9]]) rl([T.x1, 0.44, T.z1], [T.x1 + dx, 0.3 + h * 0.3, T.z1 + dz], 0.05, { m: 'bark', c: 0x8a7a68, kind: 'tree', ph: 'wood', lod: 1 });
  for (const [dx, dz, h, r] of [[0.0, 0.55, 0.65, 0.65], [0.45, 0.85, 0.7, 0.5], [-0.5, 0.9, 0.7, 0.5], [0.15, 1.15, 0.85, 0.5]]) fol(T.x1 + dx, h, T.z1 + dz, r, { kind: 'apple' });
}
export const POND2 = { x: -11.8, z: -4.2, rx: 0.85, rz: 0.7 };
{
  const P = POND2;
  cy(P.x, P.z, 0.52, -0.01, 0.04, { m: 'water', c: 0xffffff, kind: 'pond', ph: 'water', novis: true });
  const n = 12;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; bl(P.x + Math.cos(a) * (P.rx + 0.03), 0.05, P.z + Math.sin(a) * (P.rz + 0.03), 0.16 + 0.04 * Math.sin(i * 3), { m: 'stone', c: [0x8f8a7c, 0x7b786d, 0x9a9588][i % 3], kind: 'pond', ph: 'stone', lod: 1 }); }
  rl([P.x - 0.9, 0.12, P.z + 0.1], [P.x + 0.5, 0.1, P.z + 0.7], 0.09, { m: 'bark', c: 0x6b5d4c, kind: 'log', ph: 'wood' });
}

// ---------------------------------------------------------------- overgrown plants (soft)
export const NETTLES = [[-11.7, -0.15, 0.5, 1.35], [-12.6, -2.1, 0.45, 1.2], [-15.7, -1.8, 0.4, 1.3], [-17.1, 2.3, 0.5, 1.4], [-12.2, 4.5, 0.4, 1.0], [-17.3, -5.4, 0.5, 1.5], [-10.9, -5.2, 0.4, 1.2], [-14.6, 1.0, 0.35, 1.15]];
export const BRAMBLES = [[-12.3, 1.4, 0.7, 0.9], [-16.9, 1.4, 0.45, 0.85], [-14.6, -5.0, 0.6, 1.0], [-12.9, -3.0, 0.4, 0.8], [-17.5, -3.6, 0.35, 1.1]];
export const BUDDLEIA = { x: -11.9, z: 1.9, r: 0.95 };
for (const [x, z, r, h] of NETTLES) fol(x, h * 0.5, z, Math.max(r, h * 0.35), { kind: 'nettle', tall: h, seed: Math.round(x * 7 + z * 3) });
for (const [x, z, r, h] of BRAMBLES) fol(x, h * 0.55, z, r, { kind: 'bramble', tall: h, seed: Math.round(x * 5 + z) });
fol(BUDDLEIA.x, 1.55, BUDDLEIA.z, BUDDLEIA.r, { kind: 'buddleia' });
fol(BUDDLEIA.x + 0.5, 2.0, BUDDLEIA.z - 0.3, 0.6, { kind: 'buddleia' });
// Tidy borders and shrubs in p-1 (those along our fence stand clear of it: none of their leaves come through).
for (const [x, h, z, r, k] of [[-4.1, 0.7, 2.0, 0.55, 'shrub'], [-4.1, 0.6, -3.7, 0.5, 'shrub'], [-10.2, 0.5, -3.2, 0.4, 'shrub'], [-4.05, 0.55, -5.6, 0.45, 'rose'], [-4.15, 0.5, 6.6, 0.45, 'shrub']]) fol(x, h, z, r, { kind: k });
fol(-10.2, 0.9, 5.0, 0.5, { kind: 'shrub' });
// Bushes on the strip.
fol(-18.4, 1.0, 3.5, 0.6, { kind: 'bramble', tall: 1.0 });
fol(-18.5, 1.4, -3.7, 0.7, { kind: 'elder' });
fol(-18.3, 1.0, -4.6, 0.5, { kind: 'nettle', tall: 1.2 });

// ---------------------------------------------------------------- strip: a water tank, pallets and a barrow
{
  cy(-18.35, 1.2, 0.4, 0.0, 0.8, { m: 'paint', c: 0x3d5a46, kind: 'tank', ph: 'plastic', seg: 14 });
  bx(-18.4, 5.5, 0.8, 1.1, 0.0, 0.14, { m: 'weathered', c: 0x9a8566, kind: 'pallet' });
  bx(-18.4, 5.5, 0.8, 1.1, 0.14, 0.14, { m: 'weathered', c: 0x8c785a, kind: 'pallet', ry: 0.2 });
  bx(-18.45, 6.9, 0.7, 0.9, 0.0, 0.4, { m: 'zinc', c: 0x7d8c82, kind: 'bin', ph: 'metal', nocol: false });
  rl([-18.4, 0.1, -0.5], [-18.3, 0.1, 0.5], 0.02, { m: 'iron', c: 0x6b3f2a, kind: 'barrow', nocol: true });
}

// ---------------------------------------------------------------- cups
export const CUPS = [
  { id: 'left-greenhouse', name: 'Greenhouse mug', x: GH_CUP_AT.x, z: GH_CUP_AT.z, standY: GH_CUP_AT.y, baseY: GH_CUP_AT.y, rOut: 0.047, rIn: 0.0415, height: 0.096, bottom: 0.009, water: 0.074, handleYaw: Math.PI * 0.5, glaze: 0xb9503a, rim: 0xf0e4cc },
  { id: 'left-koi', name: 'Koi pond teacup', shape: 'teacup', x: KOI_CUP_AT.x, z: KOI_CUP_AT.z, standY: KOI_CUP_AT.y, baseY: KOI_CUP_AT.y + 0.008, rOut: 0.05, rIn: 0.045, height: 0.064, bottom: 0.007, water: 0.05, handleYaw: -Math.PI * 0.3, glaze: 0xf2ece0, rim: 0x3f6aa6, saucer: 0.082 },
  { id: 'left-patio', name: 'Patio teacup', shape: 'teacup', x: -4.5, z: 0.92, standY: Y(0.72), baseY: Y(0.72) + 0.008, rOut: 0.05, rIn: 0.045, height: 0.064, bottom: 0.007, water: 0.05, handleYaw: Math.PI * 0.5, glaze: 0xf4efe2, rim: 0xb5534a, saucer: 0.082 },
  { id: 'left-caravan', name: 'Caravan mug', x: CARAVAN_CUP_AT.x, z: CARAVAN_CUP_AT.z, standY: CARAVAN_CUP_AT.y, baseY: CARAVAN_CUP_AT.y, rOut: 0.047, rIn: 0.0415, height: 0.096, bottom: 0.009, water: 0.074, handleYaw: Math.PI, glaze: 0x3f5e8a, rim: 0xf0e4cc },
  { id: 'left-bath', name: 'Bath rim mug', x: BATH_CUP_AT.x, z: BATH_CUP_AT.z, standY: BATH_CUP_AT.y, baseY: BATH_CUP_AT.y, rOut: 0.045, rIn: 0.041, height: 0.088, bottom: 0.008, water: 0.068, handleYaw: -Math.PI * 0.5, glaze: 0xe8c547, rim: 0x6a4a2a },
];

// ---------------------------------------------------------------- colliders
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export const quatOf = (rot) => _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')).clone();

export function colliders(w) {
  // Houses.
  for (const H of [P1, P2]) houseColliders(w, H, 'house');
  // p-1's bay window and p-2's porch.
  {
    const B = BAY, y0 = FY, hh = (B.roofY - y0) / 2;
    w.box(B.wFront / 2, hh, 0.225, B.cx, y0 + hh, FRONT_LINE + 0.225, 'bay', 'brick');
    for (const s of [-1, 1]) w.box(0.27, hh, 0.07, B.cx + s * 0.64, y0 + hh, FRONT_LINE + 0.2, 'bay', 'brick', s * 0.65);
    w.box(0.95, 0.05, 0.3, B.cx, B.roofY + 0.04, FRONT_LINE + 0.2, 'bay', 'metal');
    const P = PORCH;
    for (const x of [P.x0, P.x1]) w.rail([x, FY, P.z1], [x, P.frontY, P.z1], 0.05, 'porch', 'wood');
    const len = Math.hypot(P.z1 - P.z0, P.wallY - P.frontY), sl = Math.atan2(P.wallY - P.frontY, P.z1 - P.z0);
    w.boxQ((P.x1 - P.x0) / 2 + 0.15, 0.03, len / 2, (P.x0 + P.x1) / 2, (P.wallY + P.frontY) / 2 + 0.05, (P.z0 + P.z1) / 2, 'porch', 'tile', quatOf([sl, 0, 0]));
  }
  // Fences, walls and hedges.
  for (const R of RUNS) {
    runColliders(w, { a: R.a, b: R.b, h: R.h, t: R.t, gaps: R.gaps, y: FY, kind: R.style === 'brick' ? 'wall' : 'fence', material: R.style === 'brick' ? 'brick' : 'wood' });
  }
  { // the collapsed length of the old wall stands as a low stump with rubble
    const ow = RUNS[3], len = ow.b[1] - ow.a[1];
    void len;
    const O = OLDWALL_LOW;
    w.box(0.11, O.h / 2, (O.z1 - O.z0) / 2, ow.a[0], FY + O.h / 2, (O.z0 + O.z1) / 2, 'wall', 'brick');
  }
  for (const H of HEDGES) {
    const len = Math.hypot(H.b[0] - H.a[0], H.b[1] - H.a[1]);
    const gaps = [...H.gaps].sort((a, b) => a[0] - b[0]);
    let s0 = 0;
    const segs = [];
    for (const [g0, g1] of gaps) { if (g0 > s0) segs.push([s0, g0]); s0 = Math.max(s0, g1); }
    if (s0 < len) segs.push([s0, len]);
    const dx = (H.b[0] - H.a[0]) / len, dz = (H.b[1] - H.a[1]) / len, yaw = Math.atan2(-dz, dx);
    for (const [u0, u1] of segs) {
      const um = (u0 + u1) / 2;
      w.box((u1 - u0) / 2, H.h * 0.46, H.d * 0.42, H.a[0] + dx * um, FY + H.h * 0.46, H.a[1] + dz * um, 'hedge', 'plant', yaw);
    }
  }
  // Everything solid in the list.
  for (const s of SOLIDS) {
    if (s.nocol) continue;
    const kind = s.kind, ph = s.ph || PH[s.m] || 'wood';
    if (s.k === 'box') {
      if (s.rot) w.boxQ(s.hx, s.hy, s.hz, s.x, s.y, s.z, kind, ph, quatOf(s.rot));
      else w.box(s.hx, s.hy, s.hz, s.x, s.y, s.z, kind, ph, s.ry || 0);
    } else if (s.k === 'cyl') {
      if (s.rot) { // a cylinder lying on its side: a box-ish approximation by a capsule along the axis
        w.boxQ(s.r * 0.9, s.hh, s.r * 0.9, s.x, s.y, s.z, kind, ph, quatOf(s.rot));
      } else w.cyl(s.r, s.hh, s.x, s.y, s.z, kind, ph);
    } else if (s.k === 'ball') w.ball(s.r, s.x, s.y, s.z, kind, ph);
    else if (s.k === 'rail') w.rail(s.a, s.b, s.r, kind, ph);
  }
  // Soft foliage.
  for (const f of FOLIAGE) {
    if (f.kind === 'nettle' || f.kind === 'bramble') {
      const hh = (f.tall || 1.2) / 2;
      w.cyl(f.r * 0.8, hh * 0.9, f.x, FY + hh * 0.9, f.z, 'plant', 'plant');
    } else w.ball(f.r * 0.8, f.x, f.y, f.z, 'plant', 'plant');
  }
}
