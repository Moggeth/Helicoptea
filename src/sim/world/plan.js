// The neighbourhood around the house and tea garden: the big map's frame, shared by physics and rendering.
// Metres, table top at y = 0, the ground at FY. The kitchen (a single-storey back extension) and its tea
// garden keep their layout in src/sim/layout.js; everything here is around them.
//
// The street runs along x in front of the house (+z); the gardens are behind (-z). Five plots side by side,
// ours in the middle. Behind the gardens a back lane, then allotments, then a park with a stream, a pond and
// woodland, and hills on the horizon. Across the street, a parade of shops with a tea room.
//
// This module imports nothing, so the area modules (src/sim/world/*.js) can use it at load time without
// import cycles through layout.js.

export const FY = -0.76;              // ground level everywhere on the flat (the kitchen floor and lawn)

// The whole flyable world: invisible walls at the edges and a lid on the sky.
export const BOUNDS = { minX: -19.5, maxX: 19.5, minZ: -48.5, maxZ: 31.5, top: FY + 24 };

// Plots along the street, 7.2 m wide; ours (index 0) is the original garden's width.
export const PLOTS = [
  { id: 'p-2', x0: -17.8, x1: -10.6 },
  { id: 'p-1', x0: -10.6, x1: -3.4 },
  { id: 'p0', x0: -3.4, x1: 3.8 },
  { id: 'p+1', x0: 3.8, x1: 11.0 },
  { id: 'p+2', x0: 11.0, x1: 18.2 },
];
export const BACK_LINE = -6.4;        // the back hedges and fences of every garden
export const FRONT_LINE = 8.55;       // the building line: front walls of the houses on our side

// The main house: two storeys and a loft in front of the kitchen extension. Interior box; walls are WALL
// thick outside it. The rear wall (z 2.2 to 2.35) is shared with the kitchen's front wall.
export const MAIN = {
  x0: -2.45, x1: 2.85, z0: 2.35, z1: 8.4, wall: 0.15,
  outer: { x0: -2.6, x1: 3.0, z0: 2.2, z1: 8.55 },
  gf: FY, gfCeil: 1.74,               // ground floor and its ceiling
  ff: 1.94, ffCeil: 4.34,             // first floor (floor slab 1.74..1.94) and its ceiling
  loft: 4.46,                         // loft floor (joists 4.34..4.46)
  eave: 4.6,                          // wall plate: where the roof starts
  ridgeY: 7.3, ridgeZ: 5.375,         // ridge along x over the middle of the plan
  overhang: 0.3,
};
// The doorway from the kitchen into the hall (through the kitchen's front wall).
export const KITCHEN_HALL_DOOR = { x0: -1.85, x1: -1.05, top: FY + 2.0 };
// The front door (closed, with a big dog flap) on the front wall, and the path to it.
export const FRONT_DOOR = { x0: -1.95, x1: -1.05, top: FY + 2.05, flap: { x0: -1.66, x1: -1.34, y0: FY + 0.03, y1: FY + 0.31 } };

// In front of the houses: front gardens, then the street.
export const STREET = {
  gardenZ0: FRONT_LINE, wallZ: 12.9, wallT: 0.12,      // low front garden walls at z 12.9..13.02
  pavement: { z0: 13.02, z1: 14.8, top: FY + 0.1 },
  road: { z0: 14.8, z1: 20.8 },
  pavement2: { z0: 20.8, z1: 22.6, top: FY + 0.1 },
  parade: { z0: 23.8, z1: 31.0 },                      // shop fronts at z0 (facing -z), forecourt 22.6..23.8
};

// Behind the gardens.
export const LANE = { z0: -9.3, z1: BACK_LINE };       // gravel back lane along x
export const ALLOTMENTS = { z0: -24.5, z1: -9.3 };
export const PARK = { z0: BOUNDS.minZ, z1: -24.5 };
// The garden gate through our back hedge (the hedge is z -6.4..-5.71 including its bulge).
export const HEDGE_GATE = { x0: 1.55, x1: 2.25 };

// The stream winds along x across the park; the pond sits in the far left corner of the park.
export const STREAM = { z: -31, bed: FY - 0.42, water: FY - 0.14, halfW: 0.55, bank: 1.6 };
export const streamZ = (x) => STREAM.z + 1.4 * Math.sin(x * 0.16 + 0.5) + 0.6 * Math.sin(x * 0.37);
export const POND = { x: -9, z: -39, r: 3.4, bed: FY - 0.55, water: FY - 0.13 };
export const KNOLL = { x: -3, z: -41, r: 4.2, h: 0.8 };  // the big oak's rise
export const WOOD = { x0: 7, x1: 19.5, z0: -46.5, z1: -27.5 };

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Height of the ground (not of anything standing on it) at a point. Flat at FY everywhere but the park,
// which rolls a little, rises towards its far edge and sides, and dips into the stream and the pond.
export function groundHeight(x, z) {
  if (z > PARK.z1) return FY;
  const t = smooth(PARK.z1, PARK.z1 - 2.5, z);
  let h = 0.32 * (0.5 + 0.5 * Math.sin(x * 0.23 + 0.7) * Math.cos(z * 0.19 - 0.4)) + 0.18 * (0.5 + 0.5 * Math.sin(x * 0.11 - z * 0.07));
  h += 2.6 * smooth(-42, BOUNDS.minZ, z) + 1.6 * smooth(14.5, BOUNDS.maxX, Math.abs(x));
  const kd = Math.hypot(x - KNOLL.x, z - KNOLL.z);
  h += KNOLL.h * Math.exp(-(kd * kd) / (KNOLL.r * KNOLL.r * 0.5));
  h = FY + t * h;
  const ds = Math.abs(z - streamZ(x));
  if (ds < STREAM.bank) h = STREAM.bed + (h - STREAM.bed) * smooth(STREAM.halfW, STREAM.bank, ds);
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if (dp < POND.r + 1.3) h = POND.bed + (h - POND.bed) * smooth(POND.r * 0.55, POND.r + 1.3, dp);
  return h;
}

// Streaming areas: each builds its own colliders (always) and its meshes, which are drawn by distance from
// their box (see src/render/world/index.js). Boxes are x0, x1, z0, z1 (and a top for tall things).
export const AREAS = {
  house: { x0: MAIN.outer.x0, x1: MAIN.outer.x1, z0: MAIN.outer.z0, z1: MAIN.outer.z1 + 0.7, top: 9 },
  left: { x0: BOUNDS.minX, x1: MAIN.outer.x0, z0: BACK_LINE, z1: FRONT_LINE, top: 9 },
  right: { x0: MAIN.outer.x1, x1: BOUNDS.maxX, z0: BACK_LINE, z1: FRONT_LINE, top: 9 },
  street: { x0: BOUNDS.minX, x1: BOUNDS.maxX, z0: FRONT_LINE, z1: BOUNDS.maxZ, top: 10 },
  allotments: { x0: BOUNDS.minX, x1: BOUNDS.maxX, z0: ALLOTMENTS.z0, z1: BACK_LINE, top: 5 },
  park: { x0: BOUNDS.minX, x1: BOUNDS.maxX, z0: BOUNDS.minZ, z1: ALLOTMENTS.z0, top: 14 },
};

// Where the sun is (from the kitchen's sun light): shadows fall along +x and +z. Ground shadows painted
// under big things use this.
export const SUN_DIR = (() => { const v = [-0.9, 1.9, -1.6], l = Math.hypot(...v); return v.map((c) => c / l); })();
// Offset on the ground of the shadow of a point h above it.
export const shadowOffset = (h) => [-SUN_DIR[0] / SUN_DIR[1] * h, -SUN_DIR[2] / SUN_DIR[1] * h];
