// Static table layout shared by physics colliders and render meshes (metres, table top at y = 0).

export const TABLE = { halfX: 0.86, halfZ: 0.52, thickness: 0.045, height: 0.76 };

export const ROOM = { minX: -2.4, maxX: 2.4, minZ: -1.5, maxZ: 2.2, floorY: -0.76, ceilingY: 1.7 };

export const PAD = { x: -0.56, z: 0.24, radius: 0.105, height: 0.007 };

// Tea stand: bags hang by their loops from three pegs pointing towards the launch side (+z).
export const STATION = {
  x: -0.52, z: -0.2, y: 0,
  baseHalf: [0.12, 0.0075, 0.045],
  postX: 0.105, postHalf: 0.007, postHeight: 0.265,
  barY: 0.255, barHalf: 0.0055,
  pegReach: 0.062, pegY: 0.252,
  pegXs: [-0.055, 0, 0.055],
};

// Cups: radius, height and water level chosen so a 4.8 cm bag fits through with some care.
export const CUPS = [
  { id: 'mug', name: 'Mug', x: 0.14, z: -0.13, baseY: 0, rOut: 0.047, rIn: 0.0415, height: 0.096,
    bottom: 0.009, water: 0.074, handleYaw: 0, glaze: 0x7f9c8a, rim: 0xf3eadc },
  { id: 'teacup', name: 'Teacup', x: 0.53, z: 0.17, baseY: 0.008, rOut: 0.05, rIn: 0.045, height: 0.064,
    bottom: 0.007, water: 0.05, handleYaw: -Math.PI * 0.5, glaze: 0xf2ece0, rim: 0x3f6aa6, saucer: 0.082 },
  // Beyond the table (see the house and garden below). standY is the surface a cup stands on.
  { id: 'sill', name: 'Windowsill cup', shape: 'teacup', x: 0.17, z: -1.39, standY: 0.05, baseY: 0.05, rOut: 0.044, rIn: 0.0395, height: 0.06,
    bottom: 0.007, water: 0.047, handleYaw: Math.PI, glaze: 0xe9d6c4, rim: 0xb5534a },
  { id: 'counter', name: 'Counter mug', x: 2.02, z: 0.42, standY: 0.14, baseY: 0.14, rOut: 0.047, rIn: 0.0415, height: 0.096,
    bottom: 0.009, water: 0.074, handleYaw: Math.PI * 0.5, glaze: 0x2f4f6b, rim: 0xe9e2d4 },
  { id: 'garden', name: 'Garden teacup', shape: 'teacup', x: 0.66, z: -2.8, standY: -0.05, baseY: -0.042, rOut: 0.05, rIn: 0.045, height: 0.064,
    bottom: 0.007, water: 0.05, handleYaw: -Math.PI * 0.5, glaze: 0xf4efe2, rim: 0x5f8f5a, saucer: 0.082 },
  { id: 'stump', name: 'Stump mug', x: 2.35, z: -4.15, standY: -0.44, baseY: -0.44, rOut: 0.047, rIn: 0.0415, height: 0.096,
    bottom: 0.009, water: 0.074, handleYaw: Math.PI * 0.75, glaze: 0xc9663e, rim: 0xf0e2c8 },
  { id: 'bench', name: 'Bench mug', x: -1.32, z: -5.5, standY: -0.31, baseY: -0.31, rOut: 0.045, rIn: 0.041, height: 0.088,
    bottom: 0.008, water: 0.068, handleYaw: 0, glaze: 0xf3f1ea, rim: 0x2b4a8a },
  // Secrets: the garden gnome's own teacup, and a chipped mug left on the chimney stack.
  { id: 'gnome', name: "Gnome's teacup", shape: 'teacup', x: -2.43, z: -3.0, standY: -0.56, baseY: -0.56, rOut: 0.046, rIn: 0.0415, height: 0.058,
    bottom: 0.007, water: 0.045, handleYaw: Math.PI * 0.5, glaze: 0xe8c547, rim: 0xc0392b },
  { id: 'chimney', name: 'Chimney mug', x: 1.69, z: 0.1, standY: 3.4, baseY: 3.4, rOut: 0.047, rIn: 0.0415, height: 0.096,
    bottom: 0.009, water: 0.074, handleYaw: Math.PI, glaze: 0x3f5e4a, rim: 0xd8d0bf },
];

export const DISCARD = { x: 0.5, z: -0.29, radius: 0.078, rimHeight: 0.013, thickness: 0.006 };

// Obstacles and set dressing that collide. Primitive colliders, richer render meshes.
export const TEAPOT = { x: -0.13, z: 0.1, bodyR: 0.1, bodyH: 0.13, lidY: 0.155, knobY: 0.178, spoutYaw: 0, handleYaw: Math.PI };
export const SUGAR = { x: 0.33, z: -0.04, r: 0.044, h: 0.056, lidH: 0.022 };
export const VASE = { x: 0.31, z: 0.33, r: 0.028, h: 0.12,
  stems: [ [0.012, 0.0, 0.3, 0.02, 0.05], [-0.02, 0.012, 0.26, -0.05, 0.03], [0.004, -0.018, 0.22, 0.02, -0.05] ] };
export const JUG = { x: 0.74, z: -0.06, r: 0.034, h: 0.088 };
export const PLATE = { x: 0.06, z: 0.36, r: 0.085, h: 0.009 };
export const BOOKS = { x: -0.72, z: -0.34, books: [ [0.11, 0.024, 0.075, 0.1], [0.1, 0.02, 0.07, -0.08], [0.095, 0.03, 0.068, 0.05] ] };
export const SPOON = { x: 0.24, z: -0.2, yaw: 0.5 };

// ---------------------------------------------------------------- house and garden
// The kitchen's back wall (z = ROOM.minZ) has an open back door and an open casement window onto a small
// walled tea garden. The garden ground is level with the kitchen floor.
export const WALL_T = 0.12;
export const BACKDOOR = { x0: 0.78, x1: 1.58, top: ROOM.floorY + 2.0 };
export const WINDOW = { x: -0.25, w: 1.5, y: 0.62, h: 1.05, bar: 0.05, mullion: 0.025, transomY: 0.74, transomH: 0.022 };
export const SILL = { x: -0.25, w: 1.7, top: 0.05, h: 0.03, depth: 0.2 };
export const COUNTER = { x0: ROOM.maxX - 0.66, x1: ROOM.maxX, z0: -1.0, z1: 1.4, top: ROOM.floorY + 0.9, upperY0: 0.9, upperY1: 1.5, upperDepth: 0.36 };
export const KETTLE = { x: ROOM.maxX - 0.32, z: -0.35, r: 0.09, h: 0.2 };
export const CHAIRS = [[0.2, 0.85, 0], [1.25, -0.2, -Math.PI / 2]];

export const GARDEN = { minX: -3.4, maxX: 3.8, minZ: -6.4, maxZ: ROOM.minZ - WALL_T, groundY: ROOM.floorY, fenceH: 1.2 };
export const PATIO = { minX: -1.7, maxX: 2.35, minZ: -2.4, maxZ: GARDEN.maxZ };
export const GTABLE = { x: 0.35, z: -2.95, halfX: 0.55, halfZ: 0.34, top: -0.05, thickness: 0.03 };
// A second tea stand on the garden table, so the garden can be played on its own.
export const GARDEN_STATION = { ...STATION, x: 0.02, z: -3.06, y: GTABLE.top };
export const STATIONS = [STATION, GARDEN_STATION];
export const GTEAPOT = { x: 0.62, z: -3.12, r: 0.075, h: 0.11 };
export const GJAR = { x: -0.12, z: -2.72, r: 0.035, h: 0.11 };
export const GCHAIRS = [[0.0, -2.38, 0], [0.95, -2.42, 0.25]];
export const ARCH = { x: 0.35, z: -4.0, halfW: 0.5, post: 0.03, top: 0.62 };
export const BIRDBATH = { x: -1.55, z: -3.65, r: 0.25, stemR: 0.075, top: -0.14 };
export const STUMP = { x: 2.35, z: -4.15, r: 0.19, top: -0.44 };
export const BENCH = { x: -1.7, z: -5.55, halfX: 0.65, halfZ: 0.21, seat: -0.31, backTop: 0.12 };
export const TREE = { x: 2.75, z: -5.55, trunkR: 0.09, trunkTop: 0.95, canopy: [[0, 1.55, 0, 0.62], [-0.45, 1.3, 0.25, 0.42], [0.4, 1.35, 0.2, 0.45], [0.05, 1.95, -0.1, 0.45]] };
export const POTS = [[-1.25, -1.86, 0.12, 0.24], [-0.92, -1.9, 0.09, 0.17], [2.05, -1.88, 0.13, 0.28]]; // x, z, r, height
export const HEDGE = { z0: GARDEN.minZ, z1: GARDEN.minZ + 0.45, top: ROOM.floorY + 1.35 };
export const MEADOW_Z = -4.7; // long grass beyond this line

// Roof (gable along x) and the chimney stack on its back slope, near the ridge.
export const ROOF = { eaveZ: ROOM.minZ - WALL_T - 0.28, eaveY: ROOM.floorY + 2.6 - 0.05 + 0.02, ridgeZ: (ROOM.maxZ + ROOM.minZ) / 2, rise: 1.13,
  frontEaveZ: ROOM.maxZ + WALL_T + 0.28, halfX: (ROOM.maxX - ROOM.minX) / 2 + WALL_T + 0.2, thick: 0.05 };
export const CHIMNEY = { x: 1.575, z: 0.1, halfX: 0.225, halfZ: 0.22, top: 3.4, pots: [[1.45, -0.02], [1.45, 0.22]], potR: 0.075, potH: 0.28 };
// The play space: everything outside it is walled off (invisible walls behind fences and the house).
export const BOUNDS = { minX: GARDEN.minX, maxX: GARDEN.maxX, minZ: GARDEN.minZ, maxZ: ROOF.frontEaveZ + 0.1, top: ROOM.floorY + 8 };

// Kitchen charm.
export const FRIDGE = { x0: ROOM.minX, x1: ROOM.minX + 0.68, z0: 0.9, z1: 1.5, top: ROOM.floorY + 1.8 };
export const RADIO = { x: ROOM.maxX - 0.2, z: -0.8, halfX: 0.06, halfZ: 0.13, h: 0.16 }; // on the counter
export const CLOCK = { x: -1.62, y: 1.2, r: 0.14 };                                         // on the back wall, inside
export const FRAMES = [
  { wall: 'left', z: -0.55, y: 0.78, w: 0.42, h: 0.32 },
  { wall: 'left', z: 0.15, y: 0.9, w: 0.26, h: 0.34 },
  { wall: 'front', x: -0.5, y: 0.82, w: 0.56, h: 0.4 },
];
export const CURTAINS = { rail: 1.24, panels: [[-1.24, -1.06], [0.52, 0.68]], depth: 0.07 };
export const LAMP = { x: 0.05, z: 0.05, length: 0.45, shadeR: 0.16, shadeH: 0.14 };           // hangs from the ceiling
export const MOBILE = { x: -1.45, z: 1.15, length: 0.42, arm: 0.26, scale: 2 };              // toy planes on a ceiling mobile

// Garden characters.
export const CAT = { x: -1.76, z: -5.5, yaw: -1.25 };   // sits on the bench, guarding the bench mug
export const GNOME = { x: -2.55, z: -3.0, yaw: Math.PI / 2 };
export const LANTERN = { x: BACKDOOR.x1 + 0.22, y: BACKDOOR.top + 0.05, z: ROOM.minZ - WALL_T - 0.07 };

// Height of the solid surface under a point (for particles landing and the like).
export function surfaceY(x, z) {
  if (Math.abs(x) < TABLE.halfX && Math.abs(z) < TABLE.halfZ) return 0;
  if (Math.abs(x - GTABLE.x) < GTABLE.halfX && Math.abs(z - GTABLE.z) < GTABLE.halfZ) return GTABLE.top;
  if (x > COUNTER.x0 && z > COUNTER.z0 && z < COUNTER.z1) return COUNTER.top;
  return ROOM.floorY;
}

// Cylinders (x, z, radius, topY, bottomY) used by the visual string verlet to avoid obvious clipping.
export function stringColliders() {
  const out = [];
  out.push([TEAPOT.x, TEAPOT.z, TEAPOT.bodyR, TEAPOT.knobY, 0]);
  out.push([SUGAR.x, SUGAR.z, SUGAR.r, SUGAR.h + SUGAR.lidH, 0]);
  out.push([VASE.x, VASE.z, VASE.r, VASE.h, 0]);
  out.push([JUG.x, JUG.z, JUG.r, JUG.h, 0]);
  out.push([PAD.x, PAD.z, PAD.radius, PAD.height, 0]);
  out.push([PLATE.x, PLATE.z, PLATE.r, PLATE.h, 0]);
  out.push([DISCARD.x, DISCARD.z, DISCARD.radius, DISCARD.thickness, 0]);
  return out;
}

// Milk station: a wide bowl to dip the bucket in, and a hanger the bucket waits on (arm points to +z).
export const MILK_BOWL = { x: -0.22, z: -0.34, rOut: 0.068, rIn: 0.062, height: 0.046, bottom: 0.006, level: 0.036 };
export const BUCKET_HANGER = { x: -0.06, z: -0.43, postHalf: 0.0065, height: 0.272, armY: 0.262, reach: 0.068, baseHalf: [0.03, 0.006, 0.03] };

// ---------------------------------------------------------------- more of the house and garden
// Welsh dresser against the front wall: cupboard base, open shelves of plates and hooked cups.
export const DRESSER = { x0: 0.6, x1: 1.6, z0: ROOM.maxZ - 0.42, z1: ROOM.maxZ, baseTop: ROOM.floorY + 0.88, top: 1.3, shelves: [0.46, 0.8, 1.12], shelfDepth: 0.2 };
// Range cooker on the left wall, with a towel rail along its front and a flue to the ceiling.
export const RANGE = { x0: ROOM.minX, x1: ROOM.minX + 0.65, z0: -1.05, z1: -0.05, top: ROOM.floorY + 0.9, lids: [[-2.02, -0.8], [-2.02, -0.32]], lidR: 0.12, flue: [ROOM.minX + 0.09, -0.17], railY: 0.07 };
export const TOWEL = { z0: -0.76, z1: -0.46, drop: 0.32 }; // hangs over the range's rail
// Washing line from a prop post by the left fence to the apple tree, with tea towels pegged on it.
export const LINE = { a: [-3.28, 0.55, -4.55], b: [TREE.x - 0.11, 0.6, TREE.z + 0.06], sag: 0.14, towels: [0.32, 0.52, 0.72] };
export const FEEDER = { x: 2.33, z: -5.3, y: 0.72, r: 0.05, h: 0.16, hangFrom: 1.02 };
export const BREADBIN = { x: ROOM.maxX - 0.19, z: 1.15, halfX: 0.12, halfZ: 0.17, h: 0.2 };
export const FRUITBOWL = { x: ROOM.maxX - 0.45, z: 0.8, r: 0.12, h: 0.06 };
export const CADDIES = [[ROOM.maxX - 0.12, 0.05], [ROOM.maxX - 0.12, 0.16], [ROOM.maxX - 0.12, 0.27]]; // tea tins on the counter
export const CADDY = { r: 0.042, h: 0.13 };

// Point on the washing line at t (0..1), sagging as a parabola.
export function linePoint(t, out = [0, 0, 0]) {
  const { a, b, sag } = LINE;
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  out[1] -= 4 * sag * t * (1 - t);
  return out;
}
