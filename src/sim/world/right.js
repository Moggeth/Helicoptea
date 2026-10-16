import * as THREE from 'three';
import { FY } from './plan.js';
import { houseColliders, roofSlabs, gables, runColliders } from './shapes.js';

// The 'right' area (box AREAS.right in plan.js): the neighbours on our right.
//   our right side passage  x 3.0..3.8, z -1.62..8.55 (a board fence on x = 3.8, a gate at the kitchen corner,
//                           bins, pots, a drainpipe, an open side gate at the front)
//   p+1  x 3.8..11.0        a family garden behind a 1930s pebbledash semi: a big oak with a treehouse, swings,
//                           a slide over a sandpit, a paddling pool, a chicken coop and run, a shed, vegetable
//                           beds with canes, a patio with a barbecue and a table under a parasol
//   p+2  x 11.0..18.2       a formal garden behind a Victorian villa: striped lawn, topiary, a yew hedge with
//                           an arch, a wisteria pergola, a fountain, a sundial, a walled corner of espalier pears
//   the strip x 18.2..19.5  behind an old brick wall
// Drawn by src/render/world/areas/right.js, which imports the numbers below so what you see is what you hit.
// All heights written 'h' are metres above the ground (FY); the helpers add FY.

const g = FY;

// ---------------------------------------------------------------------------------------------- houses
export const H1 = { x0: 4.7, x1: 10.2, z0: 2.5, z1: 8.55, eave: 4.45, ridgeY: 6.95, ridge: 'x', overhang: 0.3,
  chimneys: [{ u: 5.4, v: 0, w: 0.9, d: 0.5, top: 7.75 }] };
export const H2 = { x0: 11.8, x1: 17.4, z0: 2.4, z1: 8.55, eave: 4.95, ridgeY: 7.95, ridge: 'z', overhang: 0.35,
  chimneys: [{ u: 5.5, v: -2.4, w: 0.75, d: 0.55, top: 9.1 }, { u: 5.5, v: 2.4, w: 0.75, d: 0.55, top: 9.1 }] };
// The semi's two-storey bay (rectangular, with a half-hipped tiled roof) and its door hood.
export const BAY1 = { x0: 5.0, x1: 6.5, z0: 8.55, z1: 9.15, top: 4.45, ridge: 5.25 };
export const HOOD1 = { x0: 6.35, x1: 7.65, z0: 8.55, z1: 9.1, y: g + 2.35 };
// The villa's single-storey stone bay and its front steps.
export const BAY2 = { x0: 12.3, x1: 13.7, z0: 8.55, z1: 9.1, top: 2.9 };

// ---------------------------------------------------------------------------------------------- our passage
export const FENCE_X = 3.8;
export const GATE_K = { postX: 2.565, hingeX: 3.7, z: -1.62, len: 1.0, open: 1.0 };   // the kitchen-corner gate, ajar (open angle in radians)
export const BINS = [{ x: 3.4, z: 0.2 }, { x: 3.4, z: 0.82 }];
export const DRAIN = { x: 2.557, z: 2.05, top: 2.4, r: 0.03 };
export const POTS = { x: 3.55, z: 4.15 };

// ---------------------------------------------------------------------------------------------- p+1
export const TREE1 = { x: 6.1, z: -3.4, trunkH: 4.2, trunkR: 0.34,
  crown: [[0.2, 6.7, 0.0, 2.3], [-1.0, 5.7, 0.8, 1.35], [1.9, 6.0, 0.1, 1.8], [-0.4, 6.4, -1.5, 1.7], [0.4, 8.4, 0.1, 1.5], [2.4, 5.5, -1.2, 1.25], [-1.2, 6.6, -0.8, 1.3]] };
// Treehouse: cabin x0..x1, z0..z1 (door on +z at doorX, window on -z), floor top 2.1 above the ground.
export const TH = { x0: 6.55, x1: 8.15, z0: -4.2, z1: -2.6, floor: 2.1, wallH: 1.35, doorX: [7.15, 7.85], doorTop: 3.25, winBottom: 2.55, winTop: 3.25,
  deck: { x0: 6.45, x1: 8.65, z0: -4.3, z1: -2.1 }, ridge: 4.05, shelf: { x0: 6.6, x1: 8.15, z0: -4.6, z1: -4.2 },
  ladder: { x: [8.15, 8.55], zTop: -2.18, zBot: -1.34, top: 2.9 }, rope: { x: [6.65, 7.05], z: -2.12 } };
export const SWING = { x0: 4.15, x1: 6.45, z: -0.9, bar: 2.2, spread: 0.75, seats: [4.65, 5.95], seatH: 0.42 };
export const TOWER = { x0: 8.85, x1: 9.75, z0: -1.3, z1: -0.4, deck: 1.25, chuteEnd: { z: -3.3, h: 0.22 } };
export const SANDPIT = { x0: 8.75, x1: 9.85, z0: -4.3, z1: -3.2 };
export const POOL = { x: 5.25, z: 1.4, r: 0.88 };
export const BED1 = { x0: 9.95, x1: 10.9, z0: -4.4, z1: -1.0, caneX: 10.42, canes: [-4.05, -3.15, -2.25, -1.35], caneH: 1.9 };
export const SHED = { x0: 9.0, x1: 10.9, z0: -6.3, z1: -4.8, h: 2.05, door: [9.1, 9.9], doorH: 1.8, hole: { x0: 10.1, x1: 10.6, z0: -6.15, z1: -5.65 } };
export const BENCH1 = { x0: 9.55, x1: 10.85, z0: -6.25, z1: -5.75, h: 0.9 };
export const COOP = { x0: 4.2, x1: 5.15, z0: -6.25, z1: -5.45, legs: 0.45, h: 1.1, ridge: 1.5,
  run: { x0: 5.15, x1: 6.55, z0: -6.3, z1: -5.0, h: 1.1 } };
export const PATIO = { x0: 6.5, x1: 10.2, z0: 0.3, z1: 2.5 };
export const TABLE = { x: 7.3, z: 1.2, hx: 0.625, hz: 0.4, h: 0.72 };
export const PARASOL = { x: TABLE.x, z: TABLE.z, r: 1.2, edge: 1.95, apex: 2.35 };
export const CHAIRS1 = [[6.8, 0.4, 0], [7.8, 0.4, 0], [6.8, 2.0, Math.PI], [7.8, 2.0, Math.PI]];   // x, z, yaw (0 faces +z)
export const BBQ = { x: 9.85, z: 0.9 };
export const SIDE_TABLE = { x: 9.2, z: 1.15, hx: 0.25, hz: 0.2, h: 0.75 };
export const FENCE_GAP = { z0: -0.75, z1: -0.1 };                                  // the gap in the x = 11.0 fence

// ---------------------------------------------------------------------------------------------- p+2
export const AXIS2 = 14.6;
export const HEDGE2 = { z: -2.1, t: 0.85, h: 2.4, arch: [14.1, 15.1], archSide: 1.7, archTop: 2.0 };
export const FOUNTAIN = { x: AXIS2, z: -0.4, r: 1.0, rim: 0.46, wall: 0.22, water: 0.33, pedestal: 0.26 };
export const PERGOLA = { x0: 13.55, x1: 15.65, z: [-3.0, -4.0, -5.0, -5.9], h: 2.5, mat: 2.78 };
export const SUNDIAL = { x: 16.85, z: -4.4, top: 1.0 };
export const BACK2 = { z: -6.1, t: 0.7, h: 2.2, pierX: [14.0, 15.2], gap: [14.15, 15.05], wallX0: 15.35 };
export const WALL2 = { x: 18.2, t: 0.22, h: 2.0 };
export const BENCH2 = { x: 12.45, z: -1.5, hx: 0.75, hz: 0.27 };
export const CONES = [[13.5, -1.2], [15.7, -1.2]];
export const BALLS = [[12.5, 0.55], [16.7, 0.55]];
export const PEACOCK = { x: 17.15, z: -0.25 };
export const URNS = [[12.05, 1.75], [17.15, 1.75]];

// ---------------------------------------------------------------------------------------------- the strip
export const STRIP = { x0: 18.2, x1: 19.5, hedgeX: 19.3 };

// ---------------------------------------------------------------------------------------------- cups and stands
const MUG = { rOut: 0.047, rIn: 0.0415, height: 0.096, bottom: 0.009, water: 0.074 };
const TEACUP = { shape: 'teacup', rOut: 0.044, rIn: 0.0395, height: 0.06, bottom: 0.007, water: 0.047 };
export const CUPS = [
  { id: 'right-treehouse', name: 'Treehouse windowsill mug', ...MUG, x: 7.95, z: -4.42, standY: g + TH.winBottom, baseY: g + TH.winBottom,
    handleYaw: Math.PI * 0.5, glaze: 0xb8472f, rim: 0xf0e6d2 },
  { id: 'right-shed', name: 'Shed bench mug', ...MUG, x: 10.35, z: -5.95, standY: g + BENCH1.h, baseY: g + BENCH1.h,
    handleYaw: Math.PI * 0.25, glaze: 0x3d5a73, rim: 0xe6dfcf },
  { id: 'right-bbq', name: 'Barbecue side-table cup', ...TEACUP, x: 9.25, z: 1.15, standY: g + SIDE_TABLE.h + 0.01, baseY: g + SIDE_TABLE.h + 0.01,
    handleYaw: Math.PI, glaze: 0xf2ead8, rim: 0xc0553e },
  { id: 'right-fountain', name: 'Fountain rim mug', ...MUG, x: FOUNTAIN.x + 0.89, z: FOUNTAIN.z, standY: g + FOUNTAIN.rim, baseY: g + FOUNTAIN.rim,
    handleYaw: Math.PI * 0.75, glaze: 0x5a7a52, rim: 0xe9e2d0 },
  { id: 'right-sundial', name: 'Sundial teacup', ...TEACUP, x: SUNDIAL.x + 0.09, z: SUNDIAL.z + 0.07, standY: g + SUNDIAL.top + 0.03, baseY: g + SUNDIAL.top + 0.03,
    handleYaw: Math.PI * 1.25, glaze: 0xefe6cf, rim: 0x6b4f8f },
];
const STATION = { baseHalf: [0.12, 0.0075, 0.045], postX: 0.105, postHalf: 0.007, postHeight: 0.265, barY: 0.255, barHalf: 0.0055, pegReach: 0.062, pegY: 0.252, pegXs: [-0.055, 0, 0.055] };
// One stand on p+1's garden table; its pegs point to +z with the rest of the table open in front.
export const STATIONS = [{ ...STATION, x: 6.85, z: 0.98, y: g + TABLE.h - 0.01 }];

// ---------------------------------------------------------------------------------------------- colliders
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const quatYX = (ry, rx = 0, rz = 0) => _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')).clone();
const ang = (a) => ({ s: Math.sin(a), c: Math.cos(a) });

export function colliders(w) {
  const AB = (x0, x1, h0, h1, z0, z1, kind, mat) => w.box((x1 - x0) / 2, (h1 - h0) / 2, (z1 - z0) / 2, (x0 + x1) / 2, g + (h0 + h1) / 2, (z0 + z1) / 2, kind, mat);
  const CY = (r, h0, h1, x, z, kind, mat) => w.cyl(r, (h1 - h0) / 2, x, g + (h0 + h1) / 2, z, kind, mat);
  const RL = (a, b, r, kind, mat) => w.rail([a[0], g + a[1], a[2]], [b[0], g + b[1], b[2]], r, kind, mat);
  const BL = (r, x, h, z, kind, mat) => w.ball(r, x, g + h, z, kind, mat);
  // An upright prism of a convex 2D polygon [[x, h]...] spanning z0..z1.
  const prismXH = (poly, z0, z1, kind, mat) => { const p = []; for (const [x, h] of poly) for (const z of [z0, z1]) p.push(x, g + h, z); w.hull(p, kind, mat); };
  const prismZH = (poly, x0, x1, kind, mat) => { const p = []; for (const [z, h] of poly) for (const x of [x0, x1]) p.push(x, g + h, z); w.hull(p, kind, mat); };

  // ======================================================================== our right side passage
  runColliders(w, { a: [FENCE_X, -1.62], b: [FENCE_X, 8.55], h: 1.8, t: 0.07 });
  {
    // Kitchen-corner gate: a latch post against the kitchen wall, a hinge post at the fence end, the leaf ajar.
    AB(2.52, 2.61, 0, 1.9, -1.665, -1.575, 'gate', 'wood');
    AB(3.72, 3.82, 0, 1.95, -1.67, -1.57, 'gate', 'wood');
    const G = GATE_K, a = G.open, cx = G.hingeX - Math.cos(a) * G.len / 2, cz = G.z + Math.sin(a) * G.len / 2;
    w.box(G.len / 2, 0.8, 0.03, cx, g + 0.15 + 0.8, cz, 'gate', 'wood', a);
  }
  for (const b of BINS) {   // wheelie bins: 0.72 deep (x), 0.56 wide (z), 1.07 tall, a lid on top
    w.box(0.34, 0.5, 0.26, b.x, g + 0.52, b.z, 'bin', 'plastic');
    w.box(0.36, 0.03, 0.28, b.x, g + 1.04, b.z, 'bin', 'plastic');
  }
  CY(DRAIN.r, 0, DRAIN.top - 0.1, DRAIN.x, DRAIN.z, 'pipe', 'metal');
  AB(2.52, 2.66, DRAIN.top - 0.3, DRAIN.top, DRAIN.z - 0.08, DRAIN.z + 0.08, 'pipe', 'metal');       // the hopper head
  CY(0.16, 0, 0.5, POTS.x, POTS.z, 'pot', 'ceramic');                                               // a stack of terracotta pots
  CY(0.14, 0, 0.3, 3.3, 5.0, 'pot', 'ceramic');
  CY(0.09, 0, 0.26, 3.62, 6.0, 'can', 'metal');                                                      // watering can
  AB(3.69, 3.76, 0.1, 1.75, 7.4, 8.3, 'gate', 'wood');                                               // the front side gate, open against the fence
  AB(3.68, 3.8, 0, 1.95, 8.4, 8.52, 'gate', 'wood');
  AB(3.0, 3.05, 0.9, 1.0, 8.2, 8.5, 'gate', 'metal');                                                // its bolt plate on the house wall

  // ======================================================================== p+1 boundaries
  runColliders(w, { a: [3.8, -6.4], b: [11.0, -6.4], h: 1.8, t: 0.07 });                              // back fence (a closed gate in it)
  runColliders(w, { a: [11.0, -6.4], b: [11.0, 8.55], h: 1.15, t: 0.05, gaps: [[FENCE_GAP.z0 + 6.4, FENCE_GAP.z1 + 6.4]] });
  AB(3.8, 4.7, 0, 1.75, 2.52, 2.58, 'gate', 'wood');                                                  // p+1's own side gate, closed
  // The semi.
  houseColliders(w, H1);
  AB(BAY1.x0, BAY1.x1, 0, BAY1.top - g, BAY1.z0, BAY1.z1, 'house', 'brick');
  {   // half-hipped roof over the bay
    const o = 0.12, x0 = BAY1.x0 - o, x1 = BAY1.x1 + o, z1 = BAY1.z1 + o, h0 = BAY1.top - g + 0.0, h1 = BAY1.ridge - g;
    const p = [x0, g + h0, BAY1.z0, x1, g + h0, BAY1.z0, x0, g + h0, z1, x1, g + h0, z1, x0 + 0.5, g + h1, BAY1.z0, x1 - 0.5, g + h1, BAY1.z0];
    w.hull(p, 'roof', 'tile');
  }
  AB(HOOD1.x0, HOOD1.x1, HOOD1.y - g, HOOD1.y - g + 0.1, HOOD1.z0, HOOD1.z1, 'porch', 'wood');
  AB(HOOD1.x0, HOOD1.x0 + 0.06, 1.2, HOOD1.y - g, HOOD1.z1 - 0.06, HOOD1.z1, 'porch', 'wood');
  AB(HOOD1.x1 - 0.06, HOOD1.x1, 1.2, HOOD1.y - g, HOOD1.z1 - 0.06, HOOD1.z1, 'porch', 'wood');

  // ======================================================================== p+1: the oak and the treehouse
  {
    const T1 = TREE1, k = 0.82;
    CY(0.40, 0, 1.4, T1.x, T1.z, 'tree', 'wood');
    CY(0.32, 1.4, 2.8, T1.x, T1.z, 'tree', 'wood');
    CY(0.25, 2.8, T1.trunkH, T1.x, T1.z, 'tree', 'wood');
    for (const [dx, dy, dz, r] of T1.crown) w.ball(r * k, T1.x + dx, g + dy, T1.z + dz, 'tree', 'plant');
    // A limb over the lawn with a tyre swing on a rope.
    RL([T1.x - 0.2, 3.5, T1.z], [4.7, 3.95, T1.z], 0.07, 'tree', 'wood');
    RL([4.9, 3.9, T1.z], [4.9, 0.9, T1.z], 0.012, 'rope', 'rope');
    CY(0.31, 0.6, 0.82, 4.9, T1.z, 'tyre', 'rubber');
    // The treehouse: deck, walls with the door and window cut, a gabled roof, a sill shelf, ladders.
    const t = TH, D = t.deck, f = t.floor, wt = 0.03;
    AB(D.x0, D.x1, f - 0.1, f, D.z0, D.z1, 'treehouse', 'wood');
    for (const [x, z] of [[8.55, -2.2], [8.55, -4.2], [6.52, -2.2]]) AB(x - 0.045, x + 0.045, 0, f - 0.1, z - 0.045, z + 0.045, 'treehouse', 'wood');
    RL([6.46, f - 0.45, -3.1], [8.0, f - 0.12, -3.1], 0.04, 'treehouse', 'wood');                      // beams from the trunk
    const wallH0 = f, wallH1 = f + t.wallH;
    // front (+z) wall with the door
    AB(t.x0, t.doorX[0], wallH0, wallH1, t.z1 - wt, t.z1 + wt, 'treehouse', 'wood');
    AB(t.doorX[1], t.x1, wallH0, wallH1, t.z1 - wt, t.z1 + wt, 'treehouse', 'wood');
    AB(t.doorX[0], t.doorX[1], t.doorTop, wallH1, t.z1 - wt, t.z1 + wt, 'treehouse', 'wood');
    // back (-z) wall with the window
    AB(t.x0, t.doorX[0], wallH0, wallH1, t.z0 - wt, t.z0 + wt, 'treehouse', 'wood');
    AB(t.doorX[1], t.x1, wallH0, wallH1, t.z0 - wt, t.z0 + wt, 'treehouse', 'wood');
    AB(t.doorX[0], t.doorX[1], wallH0, t.winBottom, t.z0 - wt, t.z0 + wt, 'treehouse', 'wood');
    AB(t.doorX[0], t.doorX[1], t.winTop, wallH1, t.z0 - wt, t.z0 + wt, 'treehouse', 'wood');
    AB(t.x0 - wt, t.x0 + wt, wallH0, wallH1, t.z0, t.z1, 'treehouse', 'wood');
    AB(t.x1 - wt, t.x1 + wt, wallH0, wallH1, t.z0, t.z1, 'treehouse', 'wood');
    const spec = { x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, eave: g + wallH1, ridgeY: g + t.ridge, ridge: 'z', overhang: 0.2 };
    for (const r of roofSlabs(spec)) w.boxQ(r.hx, r.hy, r.hz, r.cx, r.cy, r.cz, 'treehouse', 'wood', r.quat);
    for (const tri of gables(spec)) { const p = []; for (const q of tri) p.push(...q); for (const q of tri) p.push(q[0], q[1], q[2] + (q[2] === t.z0 ? 0.05 : -0.05)); w.hull(p, 'treehouse', 'wood'); }
    // sill shelf with two brackets
    const S = t.shelf;
    AB(S.x0, S.x1, t.winBottom - 0.04, t.winBottom, S.z0, S.z1, 'treehouse', 'wood');
    for (const x of [S.x0 + 0.12, S.x1 - 0.12]) prismZH([[S.z1, t.winBottom - 0.04], [S.z0 + 0.05, t.winBottom - 0.04], [S.z1, t.winBottom - 0.34]], x - 0.02, x + 0.02, 'treehouse', 'wood');
    AB(6.65, 7.1, t.winBottom, t.winBottom + 0.14, -4.56, -4.44, 'treehouse', 'wood');   // window box
    // railing along the right edge of the deck
    RL([D.x1 - 0.03, f + 0.9, D.z0 + 0.04], [D.x1 - 0.03, f + 0.9, D.z1 - 0.04], 0.025, 'treehouse', 'wood');
    RL([D.x1 - 0.03, f + 0.45, D.z0 + 0.04], [D.x1 - 0.03, f + 0.45, D.z1 - 0.04], 0.02, 'treehouse', 'wood');
    for (const z of [D.z0 + 0.04, D.z1 - 0.04, (D.z0 + D.z1) / 2]) RL([D.x1 - 0.03, f, z], [D.x1 - 0.03, f + 0.9, z], 0.03, 'treehouse', 'wood');
    // wooden ladder (front right) and rope ladder (front left)
    const L = t.ladder, zAt = (h) => L.zBot + (L.zTop - L.zBot) * (h / L.top);
    for (const x of L.x) RL([x, 0, L.zBot], [x, L.top, L.zTop], 0.025, 'ladder', 'wood');
    for (let h = 0.3; h < 2.1; h += 0.32) RL([L.x[0], h, zAt(h)], [L.x[1], h, zAt(h)], 0.016, 'ladder', 'wood');
    const R = t.rope;
    for (const x of R.x) RL([x, f - 0.02, R.z], [x, 0.3, R.z], 0.012, 'rope', 'rope');
    for (let h = 0.4; h < f - 0.1; h += 0.3) RL([R.x[0] - 0.04, h, R.z], [R.x[1] + 0.04, h, R.z], 0.016, 'rope', 'wood');
  }

  // ======================================================================== p+1: swings, slide, sandpit, pool
  {
    const S = SWING;
    RL([S.x0, S.bar, S.z], [S.x1, S.bar, S.z], 0.04, 'swing', 'metal');
    for (const x of [S.x0, S.x1]) {
      RL([x, S.bar, S.z], [x, 0, S.z - S.spread], 0.035, 'swing', 'metal');
      RL([x, S.bar, S.z], [x, 0, S.z + S.spread], 0.035, 'swing', 'metal');
      RL([x, 0.8, S.z - S.spread * 0.6], [x, 0.8, S.z + S.spread * 0.6], 0.02, 'swing', 'metal');
    }
    for (const sx of S.seats) {
      for (const dx of [-0.21, 0.21]) RL([sx + dx, S.bar - 0.05, S.z], [sx + dx, S.seatH + 0.03, S.z], 0.009, 'swing', 'metal');
      AB(sx - 0.22, sx + 0.22, S.seatH, S.seatH + 0.035, S.z - 0.1, S.z + 0.1, 'swing', 'plastic');
    }
    // Slide tower: four posts, a deck, side rails, a ladder, and the chute down to the sandpit.
    const T = TOWER, cx = (T.x0 + T.x1) / 2, cz1 = T.z0, ch = T.chuteEnd;
    for (const x of [T.x0 + 0.04, T.x1 - 0.04]) for (const z of [T.z0 + 0.04, T.z1 - 0.04]) AB(x - 0.04, x + 0.04, 0, T.deck, z - 0.04, z + 0.04, 'slide', 'wood');
    AB(T.x0, T.x1, T.deck - 0.04, T.deck, T.z0, T.z1, 'slide', 'wood');
    for (const x of [T.x0 + 0.03, T.x1 - 0.03]) { RL([x, T.deck + 0.6, T.z0 + 0.04], [x, T.deck + 0.6, T.z1 - 0.04], 0.022, 'slide', 'wood'); RL([x, T.deck + 0.3, T.z0 + 0.04], [x, T.deck + 0.3, T.z1 - 0.04], 0.018, 'slide', 'wood'); }
    RL([T.x0 + 0.03, T.deck + 0.6, T.z1 - 0.03], [T.x1 - 0.03, T.deck + 0.6, T.z1 - 0.03], 0.02, 'slide', 'wood');
    for (const x of [cx - 0.19, cx + 0.19]) RL([x, 0, T.z1 + 0.58], [x, T.deck + 0.4, T.z1 - 0.02], 0.022, 'slide', 'wood');
    for (let h = 0.3; h < T.deck; h += 0.3) { const z = T.z1 + 0.58 - 0.6 * (h / (T.deck + 0.4)); RL([cx - 0.19, h, z], [cx + 0.19, h, z], 0.015, 'slide', 'wood'); }
    // chute: from the deck edge (cz1, deck) down to (ch.z, ch.h)
    const dz = ch.z - cz1, dh = ch.h - T.deck, len = Math.hypot(dz, dh), a = Math.atan2(-dh, -dz);   // downhill towards -z
    const mid = [cx, g + (T.deck + ch.h) / 2 - 0.02, (cz1 + ch.z) / 2];
    const qa = quatYX(0, -a);
    w.boxQ(0.23, 0.015, len / 2, mid[0], mid[1], mid[2], 'slide', 'plastic', qa);
    _v.set(0, 1, 0).applyQuaternion(qa);
    for (const sx of [-0.235, 0.235]) w.boxQ(0.02, 0.05, len / 2, mid[0] + sx, mid[1] + _v.y * 0.05, mid[2] + _v.z * 0.05, 'slide', 'plastic', qa);
    // sandpit
    const P = SANDPIT, e = 0.025;
    AB(P.x0, P.x1, 0, 0.16, P.z0, P.z0 + 2 * e, 'sandpit', 'wood');
    AB(P.x0, P.x1, 0, 0.16, P.z1 - 2 * e, P.z1, 'sandpit', 'wood');
    AB(P.x0, P.x0 + 2 * e, 0, 0.16, P.z0, P.z1, 'sandpit', 'wood');
    AB(P.x1 - 2 * e, P.x1, 0, 0.16, P.z0, P.z1, 'sandpit', 'wood');
    AB(P.x0, P.x1, 0, 0.1, P.z0, P.z1, 'sandpit', 'sand');
    CY(0.075, 0.1, 0.26, P.x1 - 0.25, P.z0 + 0.3, 'toy', 'plastic');
    // paddling pool: an inflatable ring and a thin floor
    const Pl = POOL;
    CY(Pl.r, 0, 0.04, Pl.x, Pl.z, 'pool', 'plastic');
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, r = Pl.r - 0.06;
      RL([Pl.x + Math.cos(a0) * r, 0.14, Pl.z + Math.sin(a0) * r], [Pl.x + Math.cos(a1) * r, 0.14, Pl.z + Math.sin(a1) * r], 0.08, 'pool', 'plastic');
    }
    BL(0.11, 5.9, 0.11, -1.75, 'ball', 'plastic');                                                    // a football on the lawn
  }

  // ======================================================================== p+1: chicken coop and run
  {
    const C = COOP, R = C.run;
    for (const x of [C.x0 + 0.06, C.x1 - 0.06]) for (const z of [C.z0 + 0.06, C.z1 - 0.06]) AB(x - 0.035, x + 0.035, 0, C.legs, z - 0.035, z + 0.035, 'coop', 'wood');
    AB(C.x0, C.x1, C.legs, C.h, C.z0, C.z1, 'coop', 'wood');
    const spec = { x0: C.x0, x1: C.x1, z0: C.z0, z1: C.z1, eave: g + C.h, ridgeY: g + C.ridge, ridge: 'x', overhang: 0.1 };
    for (const r of roofSlabs(spec)) w.boxQ(r.hx, r.hy, r.hz, r.cx, r.cy, r.cz, 'coop', 'wood', r.quat);
    for (const tri of gables(spec)) { const p = []; for (const q of tri) p.push(...q); for (const q of tri) p.push(q[0] + (q[0] === C.x0 ? 0.05 : -0.05), q[1], q[2]); w.hull(p, 'coop', 'wood'); }
    AB(C.x0 - 0.1, C.x0, C.h - 0.4, C.h - 0.04, C.z0 + 0.2, C.z0 + 0.6, 'coop', 'wood');            // nest box on the left end
    { const a = Math.atan2(C.legs - 0.04, 0.55), len = Math.hypot(0.55, C.legs); w.boxQ(0.14, 0.012, len / 2, 4.75, g + C.legs / 2 + 0.02, C.z1 + 0.275, 'coop', 'wood', quatYX(0, a)); }
    // run: corner posts, a wire box
    const wx = (R.x0 + R.x1) / 2, wz = (R.z0 + R.z1) / 2;
    for (const x of [R.x0, R.x1]) for (const z of [R.z0 + 0.03, R.z1]) AB(x - 0.035, x + 0.035, 0, R.h + 0.05, z - 0.035, z + 0.035, 'run', 'wood');
    AB(R.x0, R.x1, 0, R.h, R.z1 - 0.01, R.z1 + 0.01, 'run', 'wire');
    AB(R.x1 - 0.01, R.x1 + 0.01, 0, R.h, R.z0, R.z1, 'run', 'wire');
    AB(R.x0, R.x1, R.h - 0.01, R.h + 0.01, R.z0, R.z1, 'run', 'wire');
    void wx; void wz;
  }

  // ======================================================================== p+1: shed
  {
    const S = SHED, t = 0.06, h = S.h;
    AB(S.x0, S.x1, 0, h, S.z0, S.z0 + t, 'shed', 'wood');                                             // back
    AB(S.x0, S.x0 + t, 0, h, S.z0, S.z1, 'shed', 'wood');                                             // left
    AB(S.x1 - t, S.x1, 0, h, S.z0, S.z1, 'shed', 'wood');                                             // right
    AB(S.x0, S.door[0], 0, h, S.z1 - t, S.z1, 'shed', 'wood');                                        // front jamb
    AB(S.door[1], S.x1, 0, h, S.z1 - t, S.z1, 'shed', 'wood');
    AB(S.door[0], S.door[1], S.doorH, h, S.z1 - t, S.z1, 'shed', 'wood');
    AB(S.door[0] - 0.06, S.door[0] - 0.02, 0.05, S.doorH, S.z1, S.z1 + 0.85, 'shed', 'wood');          // the open door, swung back against the wall
    const H = S.hole, rt = 0.08;
    AB(S.x0 - 0.08, H.x0, h, h + rt, S.z0 - 0.04, S.z1 + 0.12, 'shed', 'felt');                      // flat felt roof with a rooflight opening
    AB(H.x1, S.x1 + 0.08, h, h + rt, S.z0 - 0.04, S.z1 + 0.12, 'shed', 'felt');
    AB(H.x0, H.x1, h, h + rt, H.z1, S.z1 + 0.12, 'shed', 'felt');
    AB(H.x0, H.x1, h, h + rt, S.z0 - 0.04, H.z0, 'shed', 'felt');
    AB(9.4, 9.95, h + rt, h + rt + 0.04, -5.9, -5.35, 'shed', 'plastic');                              // the slid-off rooflight pane
    // workbench with a shelf under it, a vice, and a pegboard of tools above
    const B = BENCH1;
    AB(B.x0, B.x1, B.h - 0.04, B.h, B.z0, B.z1, 'bench', 'wood');
    for (const x of [B.x0 + 0.05, B.x1 - 0.05]) for (const z of [B.z0 + 0.04, B.z1 - 0.04]) AB(x - 0.04, x + 0.04, 0, B.h - 0.04, z - 0.04, z + 0.04, 'bench', 'wood');
    AB(B.x0, B.x1, 0.2, 0.23, B.z0, B.z1, 'bench', 'wood');
    AB(B.x0 + 0.05, B.x0 + 0.2, B.h, B.h + 0.14, B.z1 - 0.2, B.z1 - 0.05, 'bench', 'metal');
    AB(B.x0, B.x1, 1.1, 1.75, S.z0 + t, S.z0 + t + 0.02, 'tools', 'wood');
    AB(S.x0 + t, S.x0 + t + 0.25, 1.38, 1.41, -6.0, -5.2, 'tools', 'wood');                            // a shelf on the left wall
    for (const z of [-5.55, -5.3]) RL([S.x0 + t + 0.02, 0.05, z], [S.x0 + t + 0.02, 1.5, z], 0.02, 'tools', 'wood');   // a spade and a rake
    CY(0.24, 0, 0.9, 8.65, -5.75, 'butt', 'plastic');                                                    // a water butt beside the shed
  }

  // ======================================================================== p+1: vegetable bed and canes
  {
    const B = BED1, e = 0.04;
    AB(B.x0, B.x1, 0, 0.3, B.z0, B.z0 + e, 'bed', 'wood');
    AB(B.x0, B.x1, 0, 0.3, B.z1 - e, B.z1, 'bed', 'wood');
    AB(B.x0, B.x0 + e, 0, 0.3, B.z0, B.z1, 'bed', 'wood');
    AB(B.x1 - e, B.x1, 0, 0.3, B.z0, B.z1, 'bed', 'wood');
    AB(B.x0 + e, B.x1 - e, 0, 0.26, B.z0 + e, B.z1 - e, 'bed', 'soil');
    for (const z of B.canes) RL([B.caneX, 0.26, z], [B.caneX, B.caneH, z], 0.008, 'cane', 'wood');
    RL([B.caneX, B.caneH - 0.02, B.canes[0]], [B.caneX, B.caneH - 0.02, B.canes[B.canes.length - 1]], 0.008, 'cane', 'wood');
  }

  // ======================================================================== p+1: patio
  AB(10.05, 10.2, 0, 0.58, 2.1, 2.5, 'bag', 'paper');
  {
    const T = TABLE, P = PARASOL;
    AB(T.x - T.hx, T.x + T.hx, T.h - 0.04, T.h, T.z - T.hz, T.z + T.hz, 'table', 'wood');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) AB(T.x + sx * (T.hx - 0.07) - 0.03, T.x + sx * (T.hx - 0.07) + 0.03, 0, T.h - 0.04, T.z + sz * (T.hz - 0.07) - 0.03, T.z + sz * (T.hz - 0.07) + 0.03, 'table', 'wood');
    CY(0.02, 0, P.apex, P.x, P.z, 'parasol', 'metal');
    CY(0.22, 0, 0.05, P.x, P.z, 'parasol', 'stone');
    const sl = Math.atan2(P.apex - P.edge, P.r), len = Math.hypot(P.r, P.apex - P.edge);
    for (let i = 0; i < 8; i++) {
      const ph = (i / 8) * Math.PI * 2, s = ang(ph), q = quatYX(ph, sl);
      const mx = P.x + s.s * P.r / 2, mz = P.z + s.c * P.r / 2, my = g + (P.edge + P.apex) / 2;
      w.boxQ(0.36, 0.012, len / 2, mx, my, mz, 'parasol', 'cloth', q);
    }
    for (const [cx, cz, yaw] of CHAIRS1) {
      const s = ang(yaw), fwd = [s.s, s.c], side = [s.c, -s.s];                      // facing +z at yaw 0
      const at = (u, v) => [cx + side[0] * u + fwd[0] * v, cz + side[1] * u + fwd[1] * v];
      AB(cx - 0.22, cx + 0.22, 0.43, 0.46, cz - 0.22, cz + 0.22, 'chair', 'wood');
      for (const u of [-0.19, 0.19]) for (const v of [-0.19, 0.19]) { const [x, z] = at(u, v); AB(x - 0.02, x + 0.02, 0, 0.43, z - 0.02, z + 0.02, 'chair', 'wood'); }
      const [bx, bz] = at(0, -0.2);
      const br = Math.abs(fwd[1]) > 0.5 ? [0.22, 0.02] : [0.02, 0.22];
      AB(bx - br[0], bx + br[0], 0.46, 0.95, bz - br[1], bz + br[1], 'chair', 'wood');
    }
    // barbecue (a kettle on three legs) and its side table
    const Bq = BBQ;
    BL(0.29, Bq.x, 0.7, Bq.z, 'bbq', 'metal');
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; RL([Bq.x + Math.cos(a) * 0.2, 0.5, Bq.z + Math.sin(a) * 0.2], [Bq.x + Math.cos(a) * 0.3, 0, Bq.z + Math.sin(a) * 0.3], 0.015, 'bbq', 'metal'); }
    const St = SIDE_TABLE;
    AB(St.x - St.hx, St.x + St.hx, St.h - 0.03, St.h, St.z - St.hz, St.z + St.hz, 'table', 'wood');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) AB(St.x + sx * (St.hx - 0.04) - 0.02, St.x + sx * (St.hx - 0.04) + 0.02, 0, St.h - 0.03, St.z + sz * (St.hz - 0.04) - 0.02, St.z + sz * (St.hz - 0.04) + 0.02, 'table', 'wood');
  }

  // ======================================================================== p+2: house, bay, boundary walls
  houseColliders(w, H2);
  AB(BAY2.x0, BAY2.x1, 0, BAY2.top, BAY2.z0, BAY2.z1, 'house', 'stone');
  AB(13.5, 14.9, 0, 0.15, 8.55, 9.15, 'steps', 'stone');                                              // the front steps, three treads
  AB(13.5, 14.9, 0.15, 0.3, 8.55, 8.97, 'steps', 'stone');
  AB(13.5, 14.9, 0.3, 0.45, 8.55, 8.79, 'steps', 'stone');
  AB(11.0, 11.8, 0, 1.75, 2.52, 2.58, 'gate', 'wood');                                                // side gates, closed
  AB(17.4, 18.09, 0, 1.8, 2.52, 2.58, 'gate', 'metal');
  // The old brick wall at x = 18.2 with a pillar every 3 m; the hedge along the back of the strip.
  AB(WALL2.x - WALL2.t / 2, WALL2.x + WALL2.t / 2, 0, WALL2.h, -6.4, 8.55, 'wall', 'brick');
  for (let z = -6.2; z < 8.6; z += 3.0) AB(WALL2.x - 0.19, WALL2.x + 0.19, 0, WALL2.h + 0.12, z - 0.19, z + 0.19, 'wall', 'brick');
  runColliders(w, { a: [STRIP.hedgeX, -6.4], b: [STRIP.hedgeX, 8.55], h: 2.4, t: 0.55, kind: 'hedge', material: 'plant' });
  runColliders(w, { a: [18.2, -6.4], b: [19.5, -6.4], h: 1.8, t: 0.06 });
  AB(18.55, 19.15, 0, 0.95, -4.95, -4.0, 'bin', 'wood');                                              // compost bays
  AB(18.6, 19.1, 0, 0.7, -1.6, 0.4, 'logs', 'wood');                                                  // a log pile
  CY(0.32, 0, 0.95, 18.6, 3.5, 'butt', 'plastic');                                                    // a water butt

  // ======================================================================== p+2: the formal garden
  {
    // Yew hedge across the garden with an arch.
    const H = HEDGE2, thick = 0.7, z0 = H.z - thick / 2, z1 = H.z + thick / 2;
    AB(11.0, H.arch[0], 0, H.h - 0.05, z0, z1, 'hedge', 'plant');
    AB(H.arch[1], 18.09, 0, H.h - 0.05, z0, z1, 'hedge', 'plant');
    AB(H.arch[0], H.arch[1], H.archTop, H.h - 0.05, z0, z1, 'hedge', 'plant');
    const c = 0.3;
    prismXH([[H.arch[0], H.archSide], [H.arch[0] + c, H.archTop], [H.arch[0], H.archTop]], z0, z1, 'hedge', 'plant');
    prismXH([[H.arch[1], H.archSide], [H.arch[1] - c, H.archTop], [H.arch[1], H.archTop]], z0, z1, 'hedge', 'plant');
    // Back hedge, piers and the open iron gate onto the lane; the walled corner.
    const B = BACK2, bz0 = B.z - B.t / 2, bz1 = B.z + B.t / 2;
    AB(11.0, B.pierX[0] - 0.15, 0, B.h - 0.05, bz0, bz1, 'hedge', 'plant');
    for (const x of B.pierX) AB(x - 0.17, x + 0.17, 0, 2.0, B.z - 0.17 - 0.05, B.z + 0.17 - 0.05, 'wall', 'brick');
    AB(B.wallX0, 18.09, 0, WALL2.h, -6.4, -6.4 + 0.22, 'wall', 'brick');
    AB(B.gap[1] - 0.02, B.gap[1] + 0.02, 0.1, 1.7, -6.3, -5.3, 'gate', 'metal');                      // the gate leaf, swung open against the right pier's inner face
    // Fountain: a ring of coping stones, the floor, a pedestal and two bowls.
    const F = FOUNTAIN, n = 14, rm = F.r - F.wall / 2, seg = 2 * Math.PI * rm / n / 2 + 0.02;
    CY(F.r - 0.05, 0, 0.04, F.x, F.z, 'fountain', 'stone');
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * Math.PI * 2;
      w.box(seg, F.rim / 2, F.wall / 2, F.x + Math.cos(a) * rm, g + F.rim / 2, F.z - Math.sin(a) * rm, 'fountain', 'stone', a + Math.PI / 2);
    }
    CY(F.pedestal, 0, 0.7, F.x, F.z, 'fountain', 'stone');
    CY(0.5, 0.7, 0.82, F.x, F.z, 'fountain', 'stone');
    CY(0.09, 0.82, 1.2, F.x, F.z, 'fountain', 'stone');
    CY(0.28, 1.2, 1.28, F.x, F.z, 'fountain', 'stone');
    BL(0.07, F.x, 1.36, F.z, 'fountain', 'stone');
    // Sundial: plinth, shaft, plate and gnomon.
    const D = SUNDIAL;
    AB(D.x - 0.28, D.x + 0.28, 0, 0.12, D.z - 0.28, D.z + 0.28, 'sundial', 'stone');
    CY(0.14, 0.12, D.top - 0.02, D.x, D.z, 'sundial', 'stone');
    CY(0.2, D.top - 0.02, D.top + 0.03, D.x, D.z, 'sundial', 'stone');
    w.hull([D.x - 0.006, g + D.top + 0.03, D.z - 0.01, D.x + 0.006, g + D.top + 0.03, D.z - 0.01, D.x - 0.006, g + D.top + 0.03, D.z + 0.09, D.x + 0.006, g + D.top + 0.03, D.z + 0.09, D.x - 0.006, g + D.top + 0.16, D.z - 0.01, D.x + 0.006, g + D.top + 0.16, D.z - 0.01], 'sundial', 'metal');
    // Pergola: posts, side beams, cross rafters, and the thick wisteria mat on top.
    const P = PERGOLA;
    for (const x of [P.x0, P.x1]) for (const z of P.z) AB(x - 0.065, x + 0.065, 0, P.h, z - 0.065, z + 0.065, 'pergola', 'wood');
    const zA = P.z[0] + 0.1, zB = P.z[P.z.length - 1] - 0.1;
    for (const x of [P.x0, P.x1]) AB(x - 0.05, x + 0.05, P.h, P.h + 0.2, zB, zA, 'pergola', 'wood');
    for (let z = P.z[0]; z >= zB - 0.001; z -= 0.5) AB(P.x0 - 0.3, P.x1 + 0.3, P.h + 0.2, P.h + 0.28, z - 0.04, z + 0.04, 'pergola', 'wood');
    AB(P.x0 - 0.1, P.x1 + 0.1, P.h + 0.28, P.mat + 0.1, zB - 0.1, zA + 0.1, 'pergola', 'plant');
    // Topiary: clipped balls on pots, cones, the peacock.
    for (const [x, z] of BALLS) { CY(0.2, 0, 0.42, x, z, 'topiary', 'ceramic'); BL(0.34, x, 0.76, z, 'topiary', 'plant'); }
    for (const [x, z] of CONES) {
      CY(0.19, 0, 0.3, x, z, 'topiary', 'ceramic');
      const p = [];
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; p.push(x + Math.cos(a) * 0.34, g + 0.3, z + Math.sin(a) * 0.34); }
      p.push(x, g + 1.8, z);
      w.hull(p, 'topiary', 'plant');
    }
    {
      const K = PEACOCK;
      AB(K.x - 0.28, K.x + 0.28, 0, 0.45, K.z - 0.3, K.z + 0.3, 'topiary', 'plant');                   // clipped plinth
      BL(0.27, K.x, 0.72, K.z, 'topiary', 'plant');                                                     // body
      w.rail([K.x, g + 0.85, K.z + 0.1], [K.x, g + 1.25, K.z + 0.22], 0.08, 'topiary', 'plant');       // neck
      BL(0.1, K.x, 1.36, K.z + 0.26, 'topiary', 'plant');                                               // head
      const p = [];                                                                                      // the tail fan, a half disc behind (towards -z)
      for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; for (const dz of [-0.14, -0.4]) p.push(K.x + Math.cos(a) * 0.62, g + 0.5 + Math.sin(a) * 0.82, K.z - 0.16 + dz); }
      w.hull(p, 'topiary', 'plant');
    }
    for (const [x, z] of URNS) { AB(x - 0.2, x + 0.2, 0, 0.5, z - 0.2, z + 0.2, 'urn', 'stone'); CY(0.2, 0.5, 0.95, x, z, 'urn', 'stone'); BL(0.2, x, 1.05, z, 'plant', 'plant'); }
    // Bench by the hedge.
    const Be = BENCH2;
    AB(Be.x - Be.hx, Be.x + Be.hx, 0.43, 0.47, Be.z - Be.hz, Be.z + Be.hz, 'bench', 'wood');
    AB(Be.x - Be.hx, Be.x + Be.hx, 0.47, 0.95, Be.z - Be.hz, Be.z - Be.hz + 0.05, 'bench', 'wood');
    for (const sx of [-1, 1]) { AB(Be.x + sx * (Be.hx - 0.06) - 0.04, Be.x + sx * (Be.hx - 0.06) + 0.04, 0, 0.43, Be.z - Be.hz, Be.z + Be.hz, 'bench', 'wood'); AB(Be.x + sx * (Be.hx - 0.01) - 0.03, Be.x + sx * (Be.hx - 0.01) + 0.03, 0.47, 0.68, Be.z - Be.hz, Be.z + Be.hz - 0.1, 'bench', 'wood'); }
    // Espalier pears on the two walls of the corner.
    AB(15.5, 18.0, 0.25, 1.7, -6.19 - 0.0, -6.19 + 0.13, 'espalier', 'plant');
    AB(18.09 - 0.14, 18.09, 0.25, 1.7, -6.0, -3.0, 'espalier', 'plant');
    // Border shrubs and lavender along the fence and wall.
    for (const [x, z, r] of [[11.45, 0.55, 0.34], [11.4, 1.2, 0.3], [11.5, -1.2, 0.3], [17.8, 0.55, 0.34], [17.85, -0.9, 0.3], [17.8, 1.3, 0.3], [12.0, -3.4, 0.4], [12.2, -4.3, 0.36], [12.4, -5.2, 0.4]]) BL(r * 0.95, x, r * 0.95, z, 'shrub', 'plant');
  }
}
