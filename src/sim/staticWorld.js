import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';
import { buildHouseColliders } from './house.js';
import { TABLE, PAD, STATIONS, CUPS, DISCARD, TEAPOT, SUGAR, VASE, JUG, PLATE, BOOKS } from './layout.js';

// Builds every fixed collider. Thin ceramic walls are rings of overlapping boxes so cups stay
// genuinely hollow: bags enter through the opening and rest on the real interior floor.
export function buildStaticWorld(sim, { bare = false } = {}) {
  const world = sim.world;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  const add = (desc, x, y, z, kind = 'world', material = 'wood', rot = null) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.12);
    if (rot) desc.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    const c = world.createCollider(desc, body);
    sim.register(c, { kind, material });
    return c;
  };
  const box = (hx, hy, hz, x, y, z, kind, material, yaw = 0) => {
    const rot = yaw ? q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).clone() : null;
    return add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, kind, material, rot);
  };
  const cyl = (r, hh, x, y, z, kind, material) => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, kind, material);

  if (bare) {
    box(2, 0.02, 2, 0.3, -0.02, 0.2, 'table', 'wood');
    cyl(PAD.radius, PAD.height / 2, PAD.x, PAD.height / 2, PAD.z, 'pad', 'cork');
    return body;
  }

  // Table; the house shell, counter and garden.
  box(TABLE.halfX, TABLE.thickness / 2, TABLE.halfZ, 0, -TABLE.thickness / 2, 0, 'table', 'wood');
  buildHouseColliders(add, box, cyl);
  // Table legs (so debris falling off the edge behaves).
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(0.03, TABLE.height / 2, 0.03, sx * (TABLE.halfX - 0.08), -TABLE.height / 2, sz * (TABLE.halfZ - 0.08), 'table', 'wood');
  }

  // Launch pad (cork coaster).
  cyl(PAD.radius, PAD.height / 2, PAD.x, PAD.height / 2, PAD.z, 'pad', 'cork');

  // Tea stands (kitchen table and garden table).
  for (const S of STATIONS) {
    box(S.baseHalf[0], S.baseHalf[1], S.baseHalf[2], S.x, S.y + S.baseHalf[1], S.z, 'station', 'wood');
    for (const sx of [-1, 1]) {
      box(S.postHalf, S.postHeight / 2, S.postHalf, S.x + sx * S.postX, S.y + S.postHeight / 2, S.z, 'station', 'wood');
    }
    box(S.postX + S.postHalf, S.barHalf, S.barHalf, S.x, S.y + S.barY, S.z, 'station', 'wood');
    for (const px of S.pegXs) {
      box(0.0022, 0.0022, S.pegReach / 2, S.x + px, S.y + S.pegY, S.z + S.pegReach / 2, 'station', 'wood');
    }
  }

  // Cups: floor disc, segmented wall ring, handle.
  for (const C of CUPS) buildCupColliders(C, add, box, cyl);

  // Discard saucer: plate + low rim ring so bags tend to stay on it.
  cyl(DISCARD.radius, DISCARD.thickness / 2, DISCARD.x, DISCARD.thickness / 2, DISCARD.z, 'saucer', 'ceramic');
  ring(add, DISCARD.x, DISCARD.z, DISCARD.radius - 0.004, 0.004, DISCARD.thickness, DISCARD.rimHeight, 18, 'saucer');

  // Teapot: body, lid, spout, handle.
  const T = TEAPOT;
  cyl(T.bodyR, T.bodyH / 2, T.x, T.bodyH / 2, T.z, 'teapot', 'ceramic');
  add(RAPIER.ColliderDesc.ball(T.bodyR * 0.62), T.x, T.lidY - 0.035, T.z, 'teapot', 'ceramic');
  add(RAPIER.ColliderDesc.ball(0.013), T.x, T.knobY, T.z, 'teapot', 'ceramic');
  {
    const dir = new THREE.Vector3(Math.cos(T.spoutYaw), 0.9, -Math.sin(T.spoutYaw)).normalize();
    const start = new THREE.Vector3(T.x + Math.cos(T.spoutYaw) * T.bodyR * 0.85, 0.05, T.z - Math.sin(T.spoutYaw) * T.bodyR * 0.85);
    const mid = start.clone().addScaledVector(dir, 0.055);
    const rq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    add(RAPIER.ColliderDesc.capsule(0.05, 0.014), mid.x, mid.y, mid.z, 'teapot', 'ceramic', rq);
    const hx = T.x + Math.cos(T.handleYaw) * (T.bodyR + 0.03), hz = T.z - Math.sin(T.handleYaw) * (T.bodyR + 0.03);
    box(0.03, 0.045, 0.008, hx, 0.085, hz, 'teapot', 'ceramic', T.handleYaw);
  }

  // Sugar bowl with lid.
  cyl(SUGAR.r, (SUGAR.h + SUGAR.lidH) / 2, SUGAR.x, (SUGAR.h + SUGAR.lidH) / 2, SUGAR.z, 'sugar', 'ceramic');

  // Bud vase and flower stems (thin, rotor-catching obstacles).
  cyl(VASE.r, VASE.h / 2, VASE.x, VASE.h / 2, VASE.z, 'vase', 'glass');
  for (const st of VASE.stems) {
    const a = new THREE.Vector3(VASE.x + st[0], VASE.h - 0.02, VASE.z + st[1]);
    const b = new THREE.Vector3(VASE.x + st[0] + st[3], st[2], VASE.z + st[1] + st[4]);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const rq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    add(RAPIER.ColliderDesc.capsule(len / 2, 0.003), mid.x, mid.y, mid.z, 'flower', 'plant', rq);
    add(RAPIER.ColliderDesc.ball(0.021), b.x, b.y + 0.008, b.z, 'flower', 'plant');
  }

  cyl(JUG.r, JUG.h / 2, JUG.x, JUG.h / 2, JUG.z, 'jug', 'ceramic');
  cyl(PLATE.r, PLATE.h / 2, PLATE.x, PLATE.h / 2, PLATE.z, 'plate', 'ceramic');

  let y = 0;
  for (const [hx, hh, hz, yaw] of BOOKS.books) {
    box(hx, hh / 2, hz, BOOKS.x, y + hh / 2, BOOKS.z, 'books', 'paper', yaw);
    y += hh;
  }
  e.set(0, 0, 0);
  return body;
}

export function ring(add, cx, cz, r, halfT, baseY, height, n, kind) {
  const seg = (2 * Math.PI * r / n) * 0.56;
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    add(RAPIER.ColliderDesc.cuboid(halfT, height / 2, seg), x, baseY + height / 2, z, kind, 'ceramic', q);
  }
}

function buildCupColliders(C, add, box, cyl) {
  const mid = (C.rOut + C.rIn) / 2;
  const halfT = (C.rOut - C.rIn) / 2;
  cyl(C.rOut, C.bottom / 2, C.x, C.baseY + C.bottom / 2, C.z, 'cup', 'ceramic');
  ring(add, C.x, C.z, mid, halfT, C.baseY, C.height, C.standY === undefined ? 22 : 16, 'cup'); // cups beyond the table: fewer, still overlapping, wall segments
  // Handle: two short arms and an upright grip, outside the wall.
  const hx = Math.cos(C.handleYaw), hz = -Math.sin(C.handleYaw);
  const at = (d) => [C.x + hx * d, C.z + hz * d];
  const [gx, gz] = at(C.rOut + 0.024);
  box(0.004, C.height * 0.3, 0.006, gx, C.baseY + C.height * 0.5, gz, 'cup', 'ceramic', C.handleYaw);
  for (const fy of [0.28, 0.74]) {
    const [ax, az] = at(C.rOut + 0.012);
    box(0.013, 0.004, 0.006, ax, C.baseY + C.height * fy, az, 'cup', 'ceramic', C.handleYaw);
  }
  if (C.saucer) {
    cyl(C.saucer, 0.004, C.x, (C.standY || 0) + 0.004, C.z, 'saucer', 'ceramic');
  }
}
