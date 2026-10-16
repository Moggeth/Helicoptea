import { FY, STREET, FRONT_LINE } from './plan.js';
import { treeColliders, runColliders, roofSlabs, gables, chimneys } from './shapes.js';

// The 'street' area (box AREAS.street in plan.js): the five front gardens (z 8.55..12.9), the street with its
// pavements, furniture, cars and telegraph wires, and across the road the parade of shops with the tea room.
// Fixed colliders, cups and a tea stand live here; src/render/world/areas/street.js draws it from the same
// numbers (everything the renderer needs is exported).
//
// Heights: FY is the ground, PV the top of the raised pavements (0.1 m up). Shop floors are at PV.

export const PV = FY + 0.1;
const TAU = Math.PI * 2;
void TAU;

// ------------------------------------------------------------------ the front wall, piers and gates
export const WALL = { z: STREET.wallZ + STREET.wallT / 2, t: STREET.wallT, h: 0.6, copeH: 0.05, copeT: 0.2 };
// Openings in the front wall: five pedestrian gates (on each front door's line) and the drive's wide gate.
export const GATES = [[-15.05, -14.15], [-7.85, -6.95], [-1.95, -1.05], [6.55, 7.45], [8.3, 10.7], [13.75, 14.65]];
export const PIER = { w: 0.28, h: 0.95, cap: 0.34, capH: 0.07 };
export const pierXs = () => GATES.flatMap(([a, b]) => [a - PIER.w / 2, b + PIER.w / 2]);
// Open gate leaves, swung inward: [x, length, height]. The drive's two ranch gates are folded back.
export const LEAVES = [[-15.0, 0.85, 0.95], [-7.8, 0.85, 0.95], [-1.9, 0.85, 0.95], [6.6, 0.85, 0.95], [8.35, 1.2, 1.0], [10.65, 1.2, 1.0], [13.8, 0.85, 0.95]];
// Walls between the front gardens (z 8.6..12.84) and hedges between others.
export const DIVIDER_WALLS = [{ x: -10.6, h: 0.55 }, { x: -3.46, h: 0.55 }, { x: 3.86, h: 0.55 }];
export const DIVIDER_HEDGES = [{ x: -17.8, h: 1.25 }, { x: 11.0, h: 1.2 }, { x: 18.2, h: 1.25 }];
export const DIV_Z0 = 8.62, DIV_Z1 = 12.84;
// Hedges inside the gardens: { a, b, h, d } (clipped privet, box).
export const HEDGES = [
  { a: [-17.6, 12.45], b: [-15.5, 12.45], h: 1.15, d: 0.55, kind: 'privet' },
  { a: [-13.7, 12.45], b: [-10.8, 12.45], h: 1.15, d: 0.55, kind: 'privet' },
  { a: [-8.02, 9.5], b: [-8.02, 12.4], h: 0.42, d: 0.32, kind: 'box' },
  { a: [-6.78, 9.5], b: [-6.78, 12.4], h: 0.42, d: 0.32, kind: 'box' },
  { a: [13.4, 9.7], b: [13.4, 12.3], h: 0.4, d: 0.3, kind: 'box' },
  { a: [15.0, 9.7], b: [15.0, 12.3], h: 0.4, d: 0.3, kind: 'box' },
  { a: [13.4, 12.3], b: [15.0, 12.3], h: 0.4, d: 0.3, kind: 'box' },
];
// Garden furniture and planting.
export const BIN_STORE = { x0: -12.3, x1: -10.75, z0: 8.62, z1: 9.5, h: 1.2 };
export const WHEELIES = [   // [x, z, yaw, colour]
  [4.5, 9.05, 0.05, 0x2f5a3a], [5.2, 9.1, -0.1, 0x25282a], [5.9, 9.05, 0.08, 0x2a4f86],
  [-11.9, 8.98, 0, 0x2f5a3a], [-11.15, 9.0, 0.05, 0x25282a],
];
export const BIRD_TABLE = { x: -5.2, z: 11.0, post: 1.4 };
export const BAY_POTS = [[-8.3, 9.05, 0.2], [-6.55, 9.05, 0.2], [-2.45, 8.95, 0.22], [13.35, 9.0, 0.2], [15.05, 9.0, 0.2], [-15.55, 9.0, 0.2], [-13.65, 9.0, 0.2]];
export const DOOR_POTS = [[-0.72, 8.95, 0.15], [6.35, 8.9, 0.14], [7.7, 8.9, 0.14]];
export const BENCH = { x0: 0.45, x1: 1.95, z0: 9.5, z1: 9.95, seat: 0.43 };
export const SCRAPER = { x: -2.25, z: 8.8 };
export const MILK = [[-0.84, 8.8], [-0.75, 8.84]];
export const ROSES = [   // [x, z, r]  rose bushes against the front wall and fences
  [-17.1, 12.1, 0.34], [-12.7, 12.1, 0.36], [-11.5, 12.0, 0.32],
  [-9.9, 12.2, 0.34], [-9.1, 12.0, 0.3], [-5.9, 12.2, 0.34], [-4.5, 12.1, 0.36],
  [-3.0, 12.2, 0.32], [-2.7, 11.2, 0.28], [2.2, 12.2, 0.36], [3.0, 12.0, 0.34], [3.3, 10.8, 0.3],
  [4.5, 12.2, 0.34], [5.4, 12.0, 0.32], [11.8, 12.2, 0.34], [12.6, 12.0, 0.32], [17.2, 12.2, 0.36], [16.2, 12.0, 0.3],
];
export const LAVENDER = (() => {   // mounds along the paths
  const out = [];
  for (const [x, z0, z1, side] of [[-1.5, 9.3, 12.2, 0.75], [-14.6, 9.3, 12.2, 0.75]]) {
    for (let z = z0; z <= z1; z += 0.62) { out.push([x - side, z + (out.length % 2) * 0.05, 0.19]); out.push([x + side, z + 0.3, 0.19]); }
  }
  return out;
})();
export const DRIVE = { x0: 8.3, x1: 10.7, z0: 8.55, z1: STREET.wallZ };
// Small ornamental trees in the front gardens and on the pavements.
export const GARDEN_TREES = [
  { x: 16.6, z: 10.9, kind: 'apple', trunkH: 1.5, trunkR: 0.07, crown: [[0, 2.2, 0, 0.95], [0.5, 1.9, 0.3, 0.6], [-0.5, 1.95, -0.2, 0.6]] },
  { x: -16.5, z: 10.2, kind: 'birch', trunkH: 1.9, trunkR: 0.06, crown: [[0, 2.9, 0, 0.9], [0.35, 2.45, 0.2, 0.55], [-0.35, 2.5, -0.25, 0.5]] },
];
export const STREET_TREES = [   // in paving squares (ground = pavement top)
  { x: -16.4, z: 13.95, kind: 'birch', trunkH: 2.3, trunkR: 0.07, crown: [[0, 3.5, 0, 1.1], [0.55, 3.1, 0.2, 0.75], [-0.5, 3.15, -0.25, 0.75], [0.1, 4.1, 0.1, 0.6]] },
  { x: 5.9, z: 14.05, kind: 'apple', trunkH: 2.1, trunkR: 0.08, crown: [[0, 3.3, 0, 1.15], [0.6, 2.9, 0.1, 0.8], [-0.6, 3.0, -0.2, 0.8], [0, 3.9, 0.1, 0.6]] },
  { x: -14.2, z: 21.5, kind: 'birch', trunkH: 2.3, trunkR: 0.07, crown: [[0, 3.5, 0, 1.1], [0.55, 3.1, 0.2, 0.75], [-0.5, 3.15, -0.25, 0.75], [0.1, 4.1, 0.1, 0.6]] },
  { x: 14.0, z: 21.6, kind: 'apple', trunkH: 2.1, trunkR: 0.08, crown: [[0, 3.3, 0, 1.15], [0.6, 2.9, 0.1, 0.8], [-0.6, 3.0, -0.2, 0.8], [0, 3.9, 0.1, 0.6]] },
];

// ------------------------------------------------------------------ pavements, kerbs, road
export const NEAR_PAV = { z0: STREET.pavement.z0, z1: STREET.pavement.z1 };
export const FAR_PAV = { z0: STREET.pavement2.z0, z1: STREET.parade.z0 };   // runs on under the shop forecourts
export const KERB = { w: 0.15 };
export const ROAD = { z0: STREET.road.z0, z1: STREET.road.z1, mid: (STREET.road.z0 + STREET.road.z1) / 2 };
export const MANHOLES = [[-6.2, 17.15], [8.4, 18.5]];
export const DRAINS = [[-12.5, 14.93], [3.5, 14.93], [15.0, 14.93], [-8.0, 20.67], [9.0, 20.67], [-17, 20.67]];

// ------------------------------------------------------------------ lamp posts, telegraph poles and wires
export const LAMPS = [[-14.6, 14.4], [-9.8, 14.4], [3.6, 14.4], [17.2, 14.4], [-11.0, 21.2], [-1.0, 21.2], [11.5, 21.2], [18.4, 21.2]];
export const LAMP = { h: 4.3, shaftR: 0.06, baseR: 0.13, baseH: 0.7 };
export const POLES = [
  { x: -12.4, z: 14.5, h: 7.0 }, { x: 0.8, z: 14.5, h: 7.2 }, { x: 13.0, z: 14.5, h: 7.0 },
];
export const POLE = { r: 0.1, armY: [6.2, 5.35], armHalf: 1.05, wireDz: [-0.8, 0, 0.8], wireR: 0.011, sag: 0.45 };
// The wires: [[x, y, z], [x, y, z]] ends, sagging by 'sag' at the middle. Built from the poles.
export function wireList() {
  const out = [];
  const ends = [{ x: BOUNDS_X0, z: POLES[0].z, h: POLES[0].h, stub: true }, ...POLES, { x: BOUNDS_X1, z: POLES[2].z, h: POLES[2].h, stub: true }];
  for (let i = 0; i + 1 < ends.length; i++) {
    const a = ends[i], b = ends[i + 1];
    for (const arm of POLE.armY) for (const dz of POLE.wireDz) {
      out.push({ a: [a.x, FY + arm, a.z + dz], b: [b.x, FY + arm, b.z + dz], sag: (b.x - a.x) > 20 || Math.abs(b.x - a.x) < 10 ? POLE.sag * 0.7 : POLE.sag, kind: 'line' });
    }
  }
  // Service drops from poles to the house fronts (a bracket on the wall under the eaves).
  const drops = [[0, -14.6], [0, -7.4], [1, -1.0], [1, 7.0], [2, 14.2], [2, 7.0]];
  for (const [pi, hx] of drops) {
    const p = POLES[pi];
    for (const dz of [-0.04, 0.04]) out.push({ a: [p.x, FY + POLE.armY[1] - 0.15, p.z + dz], b: [hx, 3.9, FRONT_LINE + 0.12], sag: 0.22, kind: 'drop' });
  }
  return out;
}
const BOUNDS_X0 = -19.45, BOUNDS_X1 = 19.45;
export const WIRE_SEGMENTS = 9;
export function wirePoint(w, t) {
  return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t - w.sag * 4 * t * (1 - t), w.a[2] + (w.b[2] - w.a[2]) * t];
}

// ------------------------------------------------------------------ street furniture
export const PILLAR = { x: 3.4, z: 21.5, r: 0.24, h: 1.5, capR: 0.28 };
export const SHELTER = { x0: -6.2, x1: -3.2, zBack: 13.3, zFront: 14.5, roof: 2.3 };   // roof height above FY
export const PHONE = { x: 12.2, z: 13.88, w: 0.95, h: 2.45 };       // door on the -x face, open
export const BIKE = { x: -9.0, z: 21.75 };
export const BUSFLAG = { x: -2.9, z: 14.6 };
export const BOLLARDS = [[-12.2, 20.98], [-11.4, 20.98], [-10.6, 20.98], [-9.8, 20.98], [15.6, 14.62], [16.3, 14.62]];

// Vehicles (nose along local +x; yaw turns about y). Shapes are the same for colliders and meshes.
export const CAR_KINDS = {
  hatch: { L: 3.7, W: 1.66, body: { x: [-1.75, 1.75], y: [0.2, 0.84], hw: 0.83 }, cab: { bx: [-1.35, 0.85], tx: [-1.15, 0.35], y: [0.84, 1.42], bhw: 0.78, thw: 0.66 }, wheels: [[-1.15, 0.29], [1.1, 0.29]] },
  saloon: { L: 3.95, W: 1.58, body: { x: [-1.98, 1.98], y: [0.22, 0.82], hw: 0.79 }, cab: { bx: [-1.15, 0.85], tx: [-0.95, 0.4], y: [0.82, 1.5], bhw: 0.75, thw: 0.62 }, wheels: [[-1.25, 0.27], [1.2, 0.27]] },
  landrover: { L: 4.3, W: 1.82, body: { x: [-2.15, 2.15], y: [0.38, 1.22], hw: 0.91 }, cab: { bx: [-2.1, 0.8], tx: [-2.05, 0.7], y: [1.22, 2.0], bhw: 0.88, thw: 0.84 }, wheels: [[-1.4, 0.37], [1.4, 0.37]] },
  float: { L: 3.7, W: 1.62, body: { x: [-1.85, 1.85], y: [0.36, 0.72], hw: 0.81 }, cab: { bx: [0.55, 1.85], tx: [0.55, 1.7], y: [0.72, 1.95], bhw: 0.78, thw: 0.74 }, wheels: [[-1.15, 0.3], [1.15, 0.3]] },
};
export const CARS = [
  { id: 'landrover', kind: 'landrover', x: 2.0, z: 15.95, yaw: 0, colour: 0x4c6a50 },
  { id: 'float', kind: 'float', x: 12.5, z: 15.85, yaw: Math.PI, colour: 0xe9e4d6 },
  { id: 'hatch', kind: 'hatch', x: -14.0, z: 15.9, yaw: 0, colour: 0x7a2c2c },
  { id: 'saloon', kind: 'saloon', x: -4.2, z: 19.75, yaw: Math.PI, colour: 0x9ab0b8 },
  { id: 'drivecar', kind: 'hatch', x: 9.5, z: 10.85, yaw: Math.PI / 2, colour: 0x2f4f86 },
];
export const carPoint = (c, lx, lz) => [c.x + lx * Math.cos(c.yaw) + lz * Math.sin(c.yaw), c.z - lx * Math.sin(c.yaw) + lz * Math.cos(c.yaw)];
export const CRATES = { x: [-1.5, -1.1, -0.7, -0.3], z: [-0.48, -0.16, 0.16, 0.48], y0: 0.72, w: 0.4, d: 0.3, h: 0.3 };   // milk float load

// ------------------------------------------------------------------ the parade
export const BLD = { z0: STREET.parade.z0, z1: 29.4, eave: 5.9, ridgeY: 7.95, floorTop: PV, ceil: FY + 3.15, x0: -19.5, x1: 19.5 };
export const UNITS = [   // x0, x1, what
  { id: 'hardware', x0: -19.5, x1: -12.8, brick: 0xd8c0b0 },
  { id: 'greengrocer', x0: -12.8, x1: -6.8, brick: 0xe6d6c8 },
  { id: 'tearoom', x0: -6.8, x1: 2.6, brick: 0xe0c8b4 },
  { id: 'post', x0: 2.6, x1: 11.0, brick: 0xcfb8a8 },
  { id: 'chemist', x0: 11.0, x1: 15.2, brick: 0xe4d2c2 },
  { id: 'tolet', x0: 15.2, x1: 19.5, brick: 0xd6bfae },
];
export const ROOF = { x0: BLD.x0, x1: BLD.x1, z0: BLD.z0, z1: BLD.z1, eave: BLD.eave, ridgeY: BLD.ridgeY, ridge: 'x', overhang: 0.3,
  chimneys: [-12.8, -6.8, 2.6, 11.0, 15.2, -19.0].map((u, i) => ({ u: u + (i === 5 ? 0.4 : 0), v: i % 2 ? 0.25 : -0.1, w: 0.95, d: 0.55, top: BLD.ridgeY + 0.95 + (i % 3) * 0.12 })) };
export const YARD = { z0: BLD.z1, z1: 31.0, wallH: 1.9, wallT: 0.12 };
export const TEAROOM = {
  x0: -6.8, x1: 2.6, in: { x0: -6.6, x1: 2.4, z0: BLD.z0 + 0.2, z1: BLD.z1 - 0.2 },
  door: [-2.2, -1.2, 2.15],           // front door opening x0, x1, height above the floor
  backDoor: [-4.4, -3.4, 2.15],
  backWindow: [-6.2, -5.0, 1.0, 2.0],  // x0, x1, sill and head above the floor
  bay: { x0: -6.0, x1: -3.0, ox0: -5.55, ox1: -3.45, z: BLD.z0 - 0.45, top: 2.4 },
  window: { x0: -0.9, x1: 2.0, y0: 0.55, y1: 2.35 },
  awning: { x0: -6.8, x1: -0.6, zOut: 22.85, yWall: FY + 3.0, yOut: FY + 2.5 },
  counter: { x0: -0.4, x1: 2.4, z0: 26.9, z1: 27.7, h: 1.0 },
  backBar: { x0: -0.4, x1: 2.4, z0: 28.85, z1: 29.2, h: 0.95 },
  tables: [[-5.45, 25.4], [-5.45, 27.1], [0.5, 25.4], [1.9, 25.4]],
  chairs: [[-4.75, 25.4, -Math.PI / 2], [-4.75, 27.1, -Math.PI / 2], [0.5, 24.75, 0], [0.5, 26.05, Math.PI], [1.9, 24.75, 0], [1.9, 26.05, Math.PI]],
  banquette: { x0: -6.6, x1: -6.1, z0: 24.9, z1: 27.9 },
  table: { r: 0.36, h: 0.74 },
};
// Outdoor furniture on the forecourt: round tables [x, z] and the chairs round them [x, z, facing].
export const FORECOURT = {
  tables: [[-5.2, 22.95], [-3.8, 22.95], [0.55, 22.95], [1.85, 22.95]],
  chairs: [[-5.2, 22.35, 0], [-5.75, 22.95, Math.PI / 2], [-3.8, 22.35, 0], [-3.25, 22.95, -Math.PI / 2], [0.55, 22.35, 0], [0.0, 22.95, Math.PI / 2], [1.85, 22.35, 0], [2.35, 22.95, -Math.PI / 2]],
};
export const TABLE_TOP = PV + 0.74;
export const GREENGROCER = { x0: -12.6, x1: -7.0, stands: [[-11.6, 23.1], [-10.0, 23.1], [-8.4, 23.1]], awning: { x0: -12.8, x1: -6.8, zOut: 22.75, yWall: FY + 3.0, yOut: FY + 2.4 } };
export const HARDWARE = { barrow: [-17.6, 23.0], ladder: [-14.2, 23.78], bags: [-15.6, 23.2] };
export const HANGING_BASKETS = [-19.0, -13.0, -2.6, 6.0, 15.2, 19.0];
export const BUNTING = { z: BLD.z0 - 0.3, y: FY + 3.75, sag: 0.3, hooks: [-18.8, -14.6, -10.4, -6.2, -2.0, 2.2, 6.4, 10.6, 14.8, 19.0] };

// ------------------------------------------------------------------ cups and the tea stand
const teacup = (id, name, x, z, standY, glaze, rim, yaw) => ({ id, name, shape: 'teacup', x, z, standY, baseY: standY + 0.008, rOut: 0.05, rIn: 0.045, height: 0.064,
  bottom: 0.007, water: 0.05, handleYaw: yaw, glaze, rim, saucer: 0.082 });
const mug = (id, name, x, z, standY, glaze, rim, yaw) => ({ id, name, x, z, standY, baseY: standY, rOut: 0.047, rIn: 0.0415, height: 0.096,
  bottom: 0.009, water: 0.074, handleYaw: yaw, glaze, rim });
export const CAR_ROOF = { id: 'landrover', lx: -0.9 };
const LR = CARS[0];
export const CUPS = [
  teacup('street-tearoom', 'Tea room cup', 1.9, 25.4, TABLE_TOP, 0xf4efe2, 0xb5534a, Math.PI * 0.5),
  teacup('street-forecourt', 'Forecourt cup', 0.62, 23.08, TABLE_TOP, 0xf2ece0, 0x3f6aa6, -Math.PI * 0.5),
  mug('street-pillarbox', 'Pillar box mug', PILLAR.x, PILLAR.z, PV + PILLAR.h, 0xb8452f, 0xf0e6d2, Math.PI),
  mug('street-shelter', 'Bus shelter mug', -4.7, 13.9, FY + SHELTER.roof, 0x2f4f6b, 0xe9e2d4, Math.PI * 0.75),
  teacup('street-landrover', 'Land Rover cup', LR.x + CAR_ROOF.lx, LR.z, FY + CAR_KINDS.landrover.cab.y[1], 0xe9d6c4, 0x4c6a50, Math.PI),
];
const STAND_BASE = { baseHalf: [0.12, 0.0075, 0.045], postX: 0.105, postHalf: 0.007, postHeight: 0.265, barY: 0.255, barHalf: 0.0055, pegReach: 0.062, pegY: 0.252, pegXs: [-0.055, 0, 0.055] };
export const STAND = { ...STAND_BASE, x: 1.85, z: 22.78, y: TABLE_TOP };
export const STATIONS = [STAND];

// ------------------------------------------------------------------ colliders
export function colliders(w) {
  const S = (x0, x1, y0, y1, z0, z1, kind, mat = 'brick') => w.box((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, kind, mat);
  const X0 = -19.5, X1 = 19.5;

  // ---- front walls, piers, gates, dividers
  {
    const gaps = GATES.map(([a, b]) => [a - X0, b - X0]);
    runColliders(w, { a: [X0, WALL.z], b: [X1, WALL.z], h: WALL.h, t: WALL.t, gaps, y: FY, kind: 'wall', material: 'brick' });
    runColliders(w, { a: [X0, WALL.z], b: [X1, WALL.z], h: WALL.copeH, t: WALL.copeT, gaps: GATES.map(([a, b]) => [a - X0 - 0.14, b - X0 + 0.14]), y: FY + WALL.h, kind: 'wall', material: 'stone' });
    for (const px of pierXs()) {
      S(px - PIER.w / 2, px + PIER.w / 2, FY, FY + PIER.h, WALL.z - PIER.w / 2, WALL.z + PIER.w / 2, 'pier');
      S(px - PIER.cap / 2, px + PIER.cap / 2, FY + PIER.h, FY + PIER.h + PIER.capH, WALL.z - PIER.cap / 2, WALL.z + PIER.cap / 2, 'pier', 'stone');
    }
    for (const [x, len, h] of LEAVES) {
      const side = x < 0 ? 1 : 1;
      void side;
      S(x - 0.025, x + 0.025, FY + 0.1, FY + h, WALL.z - 0.1 - len, WALL.z - 0.1, 'gate', 'wood');
    }
    for (const d of DIVIDER_WALLS) {
      runColliders(w, { a: [d.x, DIV_Z0], b: [d.x, DIV_Z1], h: d.h, t: 0.12, y: FY, kind: 'wall', material: 'brick' });
      runColliders(w, { a: [d.x, DIV_Z0], b: [d.x, DIV_Z1], h: 0.05, t: 0.2, y: FY + d.h, kind: 'wall', material: 'stone' });
    }
    for (const d of DIVIDER_HEDGES) runColliders(w, { a: [d.x, DIV_Z0], b: [d.x, DIV_Z1], h: d.h * 0.95, t: 0.4, y: FY, kind: 'hedge', material: 'plant' });
    for (const h of HEDGES) runColliders(w, { a: h.a, b: h.b, h: h.h * 0.92, t: h.d * 0.8, y: FY, kind: 'hedge', material: 'plant' });
  }
  // ---- garden furniture and planting
  {
    const B = BIN_STORE;
    S(B.x0, B.x0 + 0.05, FY, FY + B.h, B.z0, B.z1, 'binstore', 'wood');
    S(B.x1 - 0.05, B.x1, FY, FY + B.h, B.z0, B.z1, 'binstore', 'wood');
    S(B.x0, B.x1, FY + B.h - 0.06, FY + B.h, B.z0, B.z1, 'binstore', 'wood');
    for (const [x, z, yaw] of WHEELIES) w.box(0.29, 0.53, 0.36, x, FY + 0.53, z, 'bin', 'plastic', yaw);
    const T = BIRD_TABLE;
    w.cyl(0.03, T.post / 2, T.x, FY + T.post / 2, T.z, 'birdtable', 'wood');
    w.box(0.22, 0.02, 0.22, T.x, FY + T.post + 0.02, T.z, 'birdtable', 'wood');
    w.box(0.2, 0.1, 0.02, T.x, FY + T.post + 0.17, T.z - 0.1, 'birdtable', 'wood');
    for (const [x, z, r] of BAY_POTS) {
      w.cyl(r, 0.22, x, FY + 0.22, z, 'pot', 'ceramic');
      w.cyl(0.035, 0.45, x, FY + 0.45 + 0.4, z, 'bay', 'wood');
      w.ball(0.36 * 0.8, x, FY + 1.5, z, 'bay', 'plant');
    }
    for (const [x, z, r] of DOOR_POTS) { w.cyl(r, 0.17, x, FY + 0.17, z, 'pot', 'ceramic'); w.ball(r * 1.3 * 0.8, x, FY + 0.45, z, 'pot', 'plant'); }
    const Bn = BENCH, bx = (Bn.x0 + Bn.x1) / 2, bhx = (Bn.x1 - Bn.x0) / 2;
    w.box(bhx, 0.02, (Bn.z1 - Bn.z0) / 2, bx, FY + Bn.seat, (Bn.z0 + Bn.z1) / 2, 'bench', 'wood');
    w.box(bhx, 0.22, 0.02, bx, FY + Bn.seat + 0.24, Bn.z0 + 0.03, 'bench', 'wood');
    for (const sx of [-1, 1]) w.box(0.025, Bn.seat / 2, (Bn.z1 - Bn.z0) / 2 - 0.02, bx + sx * (bhx - 0.07), FY + Bn.seat / 2, (Bn.z0 + Bn.z1) / 2, 'bench', 'metal');
    w.box(0.15, 0.07, 0.12, SCRAPER.x, FY + 0.07, SCRAPER.z, 'scraper', 'metal');
    w.box(0.15, 0.12, 0.012, SCRAPER.x, FY + 0.13, SCRAPER.z - 0.1, 'scraper', 'metal');
    for (const [x, z] of MILK) w.cyl(0.03, 0.11, x, FY + 0.11, z, 'milk', 'ceramic');
    for (const [x, z, r] of ROSES) w.ball(r * 0.8, x, FY + r * 0.9, z, 'rose', 'plant');
    for (const [x, z, r] of LAVENDER) w.ball(r * 0.8, x, FY + r * 0.85, z, 'lavender', 'plant');
    for (const t of GARDEN_TREES) treeColliders(w, { ...t, y: FY });
    for (const t of STREET_TREES) treeColliders(w, { ...t, y: PV });
  }

  // ---- the drive car and the other vehicles
  for (const c of CARS) {
    const K = CAR_KINDS[c.kind], at = (lx, ly, lz) => [...carPoint(c, lx, lz)];
    const [bx, bz] = at((K.body.x[0] + K.body.x[1]) / 2, 0, 0);
    w.box((K.body.x[1] - K.body.x[0]) / 2, (K.body.y[1] - K.body.y[0]) / 2, K.body.hw, bx, FY + (K.body.y[0] + K.body.y[1]) / 2, bz, 'car', 'metal', c.yaw);
    const C = K.cab, pts = [];
    for (const [lx, y, hw] of [[C.bx[0], C.y[0], C.bhw], [C.bx[1], C.y[0], C.bhw], [C.tx[0], C.y[1], C.thw], [C.tx[1], C.y[1], C.thw]]) {
      for (const sz of [-1, 1]) { const [px, pz] = at(lx, 0, sz * hw); pts.push(px, FY + y, pz); }
    }
    w.hull(pts, 'car', 'metal');
    if (c.kind === 'float') {
      const [cx, cz] = at(-0.9, 0, 0);
      w.box(0.8, 0.3, 0.66, cx, FY + CRATES.y0 + 0.3, cz, 'crates', 'plastic', c.yaw);
    }
  }

  // ---- pavements, kerbs
  {
    const nz = (NEAR_PAV.z0 + NEAR_PAV.z1) / 2, fz = (FAR_PAV.z0 + FAR_PAV.z1) / 2;
    w.box(19.6, 0.05, (NEAR_PAV.z1 - NEAR_PAV.z0) / 2, 0, FY + 0.05, nz, 'pavement', 'stone');
    w.box(19.6, 0.05, (FAR_PAV.z1 - FAR_PAV.z0) / 2, 0, FY + 0.05, fz, 'pavement', 'stone');
  }

  // ---- lamp posts and telegraph poles
  for (const [x, z] of LAMPS) {
    w.cyl(LAMP.baseR, LAMP.baseH / 2, x, PV + LAMP.baseH / 2, z, 'lamp', 'metal');
    w.cyl(LAMP.shaftR + 0.01, (LAMP.h - LAMP.baseH) / 2, x, PV + (LAMP.h + LAMP.baseH) / 2, z, 'lamp', 'metal');
    w.box(0.2, 0.25, 0.2, x, PV + LAMP.h + 0.3, z, 'lamp', 'glass');
  }
  for (const P of POLES) {
    w.cyl(POLE.r, P.h / 2, P.x, PV + P.h / 2, P.z, 'pole', 'wood');
    for (const ay of POLE.armY) w.box(0.05, 0.05, POLE.armHalf, P.x, FY + ay - 0.05, P.z, 'pole', 'wood');
  }
  for (const wire of wireList()) {
    let prev = wirePoint(wire, 0);
    for (let i = 1; i <= WIRE_SEGMENTS; i++) { const p = wirePoint(wire, i / WIRE_SEGMENTS); w.rail(prev, p, POLE.wireR + 0.003, 'wire', 'rope'); prev = p; }
  }

  // ---- pillar box, bus shelter, phone box, bollards, bike
  {
    w.cyl(PILLAR.r, 0.72, PILLAR.x, PV + 0.72, PILLAR.z, 'pillarbox', 'metal');
    w.cyl(PILLAR.capR, 0.045, PILLAR.x, PV + PILLAR.h - 0.045, PILLAR.z, 'pillarbox', 'metal');
    w.cyl(0.3, 0.05, PILLAR.x, PV + 0.05, PILLAR.z, 'pillarbox', 'metal');

    const Sh = SHELTER, sx = (Sh.x0 + Sh.x1) / 2, sz = (Sh.zBack + Sh.zFront) / 2;
    w.box((Sh.x1 - Sh.x0) / 2 + 0.15, 0.045, (Sh.zFront - Sh.zBack) / 2 + 0.15, sx, FY + Sh.roof - 0.045, sz, 'shelter', 'metal');
    S(Sh.x0, Sh.x1, PV, FY + Sh.roof - 0.09, Sh.zBack - 0.015, Sh.zBack + 0.015, 'shelter', 'glass');
    for (const px of [Sh.x0 + 0.04, Sh.x1 - 0.04]) {
      w.box(0.04, (Sh.roof - 0.09) / 2, 0.04, px, FY + (Sh.roof - 0.09) / 2, Sh.zFront - 0.05, 'shelter', 'metal');
    }
    // the bench and an advert panel inside
    w.box(0.7, 0.025, 0.2, sx - 0.3, FY + 0.5, Sh.zBack + 0.28, 'shelter', 'wood');
    w.box(0.6, 0.02, 0.03, sx + 0.6, FY + 0.55, Sh.zBack + 0.1, 'shelter', 'metal');

    const Pb = PHONE, h = 0.475;
    w.box(h, 0.1, h, Pb.x, FY + 0.1, Pb.z, 'phonebox', 'metal');
    for (const [sx2, sz2] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) w.box(0.045, (Pb.h - 0.4) / 2, 0.045, Pb.x + sx2 * 0.42, FY + 0.2 + (Pb.h - 0.4) / 2, Pb.z + sz2 * 0.42, 'phonebox', 'metal');
    S(Pb.x + 0.42 - 0.015, Pb.x + 0.42 + 0.015, FY + 0.2, FY + Pb.h - 0.28, Pb.z - 0.42, Pb.z + 0.42, 'phonebox', 'glass');
    S(Pb.x - 0.42, Pb.x + 0.42, FY + 0.2, FY + Pb.h - 0.28, Pb.z - 0.435, Pb.z - 0.405, 'phonebox', 'glass');
    S(Pb.x - 0.42, Pb.x + 0.42, FY + 0.2, FY + Pb.h - 0.28, Pb.z + 0.405, Pb.z + 0.435, 'phonebox', 'glass');
    w.box(h + 0.04, 0.12, h + 0.04, Pb.x, FY + Pb.h - 0.22, Pb.z, 'phonebox', 'metal');
    w.box(0.3, 0.05, 0.3, Pb.x, FY + Pb.h - 0.06, Pb.z, 'phonebox', 'metal');
    // the door, hinged on the +z post and swung out to point along -x
    S(Pb.x - 0.45 - 0.78, Pb.x - 0.45, FY + 0.2, FY + 2.15, Pb.z + 0.44, Pb.z + 0.48, 'phonebox', 'glass');
    // the phone and its shelf on the back (+x) wall
    w.box(0.12, 0.2, 0.17, Pb.x + 0.3, FY + 1.35, Pb.z, 'phonebox', 'plastic');
    w.box(0.1, 0.015, 0.3, Pb.x + 0.32, FY + 1.05, Pb.z, 'phonebox', 'wood');

    w.cyl(0.035, 1.35, BUSFLAG.x, PV + 1.35, BUSFLAG.z, 'busflag', 'metal');
    w.box(0.28, 0.25, 0.02, BUSFLAG.x, PV + 2.6, BUSFLAG.z, 'busflag', 'metal');
    for (const [x, z] of BOLLARDS) { w.cyl(0.07, 0.4, x, PV + 0.4, z, 'bollard', 'metal'); }
    // a Sheffield hoop and the bike hanging on it
    const Bk = BIKE;
    for (const sx2 of [-0.35, 0.35]) w.cyl(0.02, 0.4, Bk.x + sx2, PV + 0.4, Bk.z, 'bike', 'metal');
    w.box(0.37, 0.02, 0.02, Bk.x, PV + 0.82, Bk.z, 'bike', 'metal');
    for (const wx of [-0.55, 0.55]) {
      const pts = [];
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; for (const dz of [-0.015, 0.015]) pts.push(Bk.x + wx + Math.cos(a) * 0.34, PV + 0.34 + Math.sin(a) * 0.34, Bk.z + dz + 0.3); }
      w.hull(pts, 'bike', 'metal');
    }
    w.rail([Bk.x - 0.55, PV + 0.34, Bk.z + 0.3], [Bk.x - 0.1, PV + 0.62, Bk.z + 0.3], 0.025, 'bike', 'metal');
    w.rail([Bk.x - 0.1, PV + 0.62, Bk.z + 0.3], [Bk.x + 0.55, PV + 0.34, Bk.z + 0.3], 0.025, 'bike', 'metal');
    w.rail([Bk.x + 0.5, PV + 0.4, Bk.z + 0.3], [Bk.x + 0.46, PV + 1.0, Bk.z + 0.3], 0.02, 'bike', 'metal');
    w.box(0.14, 0.015, 0.035, Bk.x - 0.1, PV + 0.82, Bk.z + 0.3, 'bike', 'plastic');
    w.box(0.2, 0.012, 0.012, Bk.x + 0.46, PV + 1.02, Bk.z + 0.3, 'bike', 'metal');
  }

  // ---- the parade
  const B = BLD, EAVE = B.eave;
  // solid units
  for (const u of UNITS) {
    if (u.id === 'tearoom') continue;
    S(u.x0, u.x1, FY, EAVE, B.z0, B.z1, 'shop', 'brick');
  }
  // the tea room's shell, hollow
  {
    const T = TEAROOM, C = B.ceil, fl = PV;
    S(T.x0, T.x1, FY, fl, B.z0, B.z1, 'tearoom', 'tile');                         // floor
    S(T.x0, T.x1, C, EAVE, B.z0, B.z1, 'tearoom', 'brick');                       // flat above
    S(T.x0, T.in.x0, FY, C, B.z0, B.z1, 'tearoom', 'brick');                      // side walls
    S(T.in.x1, T.x1, FY, C, B.z0, B.z1, 'tearoom', 'brick');
    // front wall (z0..z0+0.2) with the door open; windows are glass, so solid
    S(T.in.x0, T.door[0], FY, C, B.z0, B.z0 + 0.2, 'tearoom', 'brick');
    S(T.door[1], T.in.x1, FY, C, B.z0, B.z0 + 0.2, 'tearoom', 'brick');
    S(T.door[0], T.door[1], fl + T.door[2], C, B.z0, B.z0 + 0.2, 'tearoom', 'brick');
    S(T.door[0] - 0.04, T.door[0], fl, fl + 2.1, B.z0 + 0.2, B.z0 + 1.15, 'tearoom', 'wood');   // the front door, swung back against the wall
    // the bay window: a canted glass front over a stallriser
    {
      const b = T.bay, pts = [], z0 = B.z0;
      for (const [x, z] of [[b.x0, z0], [b.ox0, b.z], [b.ox1, b.z], [b.x1, z0]]) for (const y of [FY, fl + b.top]) pts.push(x, y, z);
      w.hull(pts, 'tearoom', 'glass');
    }
    // back wall with an open door and an open window
    const zb = B.z1 - 0.2;
    S(T.in.x0 - 0.2, T.backWindow[0], FY, C, zb, B.z1, 'tearoom', 'brick');
    S(T.backWindow[0], T.backWindow[1], FY, fl + T.backWindow[2], zb, B.z1, 'tearoom', 'brick');
    S(T.backWindow[0], T.backWindow[1], fl + T.backWindow[3], C, zb, B.z1, 'tearoom', 'brick');
    S(T.backWindow[1], T.backDoor[0], FY, C, zb, B.z1, 'tearoom', 'brick');
    S(T.backDoor[0], T.backDoor[1], fl + T.backDoor[2], C, zb, B.z1, 'tearoom', 'brick');
    S(T.backDoor[1], T.in.x1 + 0.2, FY, C, zb, B.z1, 'tearoom', 'brick');
    // the back door's leaf, open into the yard along the right-hand jamb
    S(T.backDoor[1] - 0.04, T.backDoor[1], fl, fl + 2.1, B.z1, B.z1 + 0.95, 'tearoom', 'wood');
    // counter, back bar, banquette, tables, chairs
    const ct = T.counter, bb = T.backBar, bq = T.banquette;
    S(ct.x0, ct.x1, fl, fl + ct.h, ct.z0, ct.z1, 'counter', 'wood');
    S(ct.x0 + 0.5, ct.x0 + 2.0, fl + ct.h, fl + ct.h + 0.36, ct.z0 + 0.08, ct.z1 - 0.12, 'counter', 'glass');   // the cake display
    S(bb.x0, bb.x1, fl, fl + bb.h, bb.z0, bb.z1, 'counter', 'wood');
    for (const sy of [1.25, 1.65]) S(bb.x0 + 0.1, bb.x1 - 0.1, fl + sy, fl + sy + 0.03, bb.z0 + 0.1, bb.z1 + 0.0, 'shelf', 'wood');
    S(bq.x0, bq.x1, fl, fl + 0.45, bq.z0, bq.z1, 'banquette', 'cloth');
    S(bq.x0, bq.x0 + 0.1, fl + 0.45, fl + 1.0, bq.z0, bq.z1, 'banquette', 'cloth');
    for (const [x, z] of T.tables) { w.cyl(0.04, 0.37, x, fl + 0.37, z, 'table', 'metal'); w.cyl(T.table.r, 0.015, x, fl + T.table.h - 0.015, z, 'table', 'wood'); w.cyl(0.2, 0.012, x, fl + 0.012, z, 'table', 'metal'); }
    for (const [x, z, yaw] of T.chairs) chairColliders(w, x, fl, z, yaw);
  }
  // forecourt
  {
    const F = FORECOURT, fl = PV;
    for (const [x, z] of F.tables) { w.cyl(0.04, 0.37, x, fl + 0.37, z, 'table', 'metal'); w.cyl(0.36, 0.015, x, fl + 0.725, z, 'table', 'metal'); w.cyl(0.2, 0.012, x, fl + 0.012, z, 'table', 'metal'); }
    for (const [x, z, yaw] of F.chairs) chairColliders(w, x, fl, z, yaw);
    // the bay window's sill-planters and the awning
    awningCollider(w, TEAROOM.awning);
    awningCollider(w, GREENGROCER.awning);
    // A-board
    w.box(0.22, 0.45, 0.02, -2.6, fl + 0.45, 23.35, 'aboard', 'wood');
  }
  // greengrocer stands and the hardware shop's outdoor stock
  {
    for (const [x, z] of GREENGROCER.stands) {
      S(x - 0.7, x + 0.7, PV, PV + 0.55, z - 0.35, z + 0.35, 'crates', 'wood');
      S(x - 0.7, x + 0.7, PV + 0.55, PV + 0.9, z + 0.05, z + 0.35, 'crates', 'wood');
    }
    const [bx, bz] = HARDWARE.barrow;
    S(bx - 0.55, bx + 0.55, PV + 0.25, PV + 0.62, bz - 0.35, bz + 0.35, 'barrow', 'metal');
    const [lx] = HARDWARE.ladder;
    w.rail([lx - 0.2, PV, 22.95], [lx - 0.2, PV + 2.7, 23.74], 0.025, 'ladder', 'wood');
    w.rail([lx + 0.2, PV, 22.95], [lx + 0.2, PV + 2.7, 23.74], 0.025, 'ladder', 'wood');
    const [gx, gz] = HARDWARE.bags;
    S(gx - 0.6, gx + 0.6, PV, PV + 0.5, gz - 0.25, gz + 0.35, 'bags', 'cloth');
    S(gx - 0.45, gx + 0.45, PV + 0.5, PV + 0.9, gz - 0.2, gz + 0.3, 'bags', 'cloth');
    // post office / newsagent paper racks
    S(5.6, 6.3, PV, PV + 1.2, 23.45, 23.75, 'rack', 'metal');
    S(8.6, 9.3, PV, PV + 1.0, 23.5, 23.75, 'rack', 'metal');
    // shop signs (hanging blades) on the front, hung clear of the street's flight space
    for (const [x, y] of [[-6.8, 3.0], [2.6, 3.0], [11.0, 3.0]]) w.box(0.02, 0.28, 0.35, x, FY + y, B.z0 - 0.4, 'sign', 'wood');
  }
  // hanging baskets
  for (const x of HANGING_BASKETS) w.ball(0.16, x, FY + 2.3, B.z0 - 0.4, 'basket', 'plant');
  // bunting strings
  for (let i = 0; i + 1 < BUNTING.hooks.length; i++) {
    const a = BUNTING.hooks[i], b = BUNTING.hooks[i + 1];
    let prev = [a, BUNTING.y, BUNTING.z];
    for (let k = 1; k <= 5; k++) { const t = k / 5, p = [a + (b - a) * t, BUNTING.y - BUNTING.sag * 4 * t * (1 - t), BUNTING.z]; w.rail(prev, p, 0.008, 'bunting', 'rope'); prev = p; }
  }
  // roof, gables, chimneys
  {
    for (const r of roofSlabs(ROOF)) w.boxQ(r.hx, r.hy, r.hz, r.cx, r.cy, r.cz, 'roof', 'tile', r.quat);
    for (const g of gables(ROOF)) {
      const pts = [];
      for (const p of g) pts.push(...p);
      for (const p of g) pts.push(p[0] + (p[0] === ROOF.x0 ? 0.2 : -0.2), p[1], p[2]);
      w.hull(pts, 'shop', 'brick');
    }
    for (const c of chimneys(ROOF)) S(c.cx - c.hx, c.cx + c.hx, c.y0 - 1, c.top, c.cz - c.hz, c.cz + c.hz, 'chimney', 'brick');
  }
  // rear yards: boundary wall, dividers, clutter
  {
    const Y = YARD;
    S(-19.5, 19.5, FY, FY + Y.wallH, Y.z1, Y.z1 + Y.wallT, 'yardwall', 'brick');
    for (const u of UNITS) if (u.x0 > -19) S(u.x0 - 0.06, u.x0 + 0.06, FY, FY + Y.wallH, Y.z0, Y.z1, 'yardwall', 'brick');
    // tea room yard: bins, a water butt, crates, a drainpipe
    for (const [x, z, yaw] of [[-0.3, 30.35, 0.05], [0.5, 30.4, -0.04], [1.3, 30.35, 0.06]]) w.box(0.29, 0.53, 0.36, x, FY + 0.53, z, 'bin', 'plastic', yaw);
    w.cyl(0.3, 0.45, -6.2, FY + 0.45, 30.5, 'butt', 'plastic');
    S(2.0, 2.4, FY, FY + 0.45, 29.6, 30.2, 'crates', 'wood');
    S(-2.6, -2.2, FY, FY + 0.6, 29.5, 29.9, 'crates', 'wood');
    for (const x of [-6.55, 2.3]) w.cyl(0.05, (BLD.eave - FY) / 2, x, (BLD.eave + FY) / 2, BLD.z1 + 0.06, 'pipe', 'metal');
  }
}

function chairColliders(w, x, fl, z, yaw) {
  // seat at 0.45 m, back to 0.9 m on the side the chair faces away from (facing: yaw 0 looks toward +z)
  const c = Math.cos(yaw), s = Math.sin(yaw);
  w.box(0.2, 0.02, 0.2, x, fl + 0.45, z, 'chair', 'metal', yaw);
  w.box(0.2, 0.22, 0.015, x - 0.185 * s, fl + 0.68, z - 0.185 * c, 'chair', 'metal', yaw);
  for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) w.cyl(0.012, 0.225, x + lx * c + lz * s, fl + 0.225, z - lx * s + lz * c, 'chair', 'metal');
}

function awningCollider(w, A) {
  // a sloped canvas slab from the wall (z = parade front) out to zOut, plus its front valance
  const z0 = BLD.z0, len = Math.hypot(z0 - A.zOut, A.yWall - A.yOut), tilt = Math.atan2(A.yWall - A.yOut, z0 - A.zOut);
  const cx = (A.x0 + A.x1) / 2, cz = (z0 + A.zOut) / 2, cy = (A.yWall + A.yOut) / 2;
  const q = { x: -Math.sin(tilt / 2), y: 0, z: 0, w: Math.cos(tilt / 2) };   // about x: the far (+z) end rises
  w.boxQ((A.x1 - A.x0) / 2, 0.015, len / 2, cx, cy, cz, 'awning', 'cloth', q);
  w.box((A.x1 - A.x0) / 2, 0.09, 0.012, cx, A.yOut - 0.09, A.zOut, 'awning', 'cloth');
}
