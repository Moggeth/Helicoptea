// Static table layout shared by physics colliders and render meshes (metres, table top at y = 0).

export const TABLE = { halfX: 0.86, halfZ: 0.52, thickness: 0.045, height: 0.76 };

export const ROOM = { minX: -2.4, maxX: 2.4, minZ: -1.5, maxZ: 2.2, floorY: -0.76, ceilingY: 1.7 };

export const PAD = { x: -0.56, z: 0.24, radius: 0.105, height: 0.007 };

// Tea stand: bags hang by their loops from three pegs pointing towards the launch side (+z).
export const STATION = {
  x: -0.52, z: -0.2,
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
