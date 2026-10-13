import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { ROOM, WALL_T, BACKDOOR, WINDOW, SILL, COUNTER, KETTLE, CHAIRS, GARDEN, GTABLE, GTEAPOT, GJAR, GCHAIRS,
  ARCH, BIRDBATH, STUMP, BENCH, TREE, POTS, HEDGE, ROOF, CHIMNEY, BOUNDS, FRIDGE, RADIO, CLOCK, FRAMES, CURTAINS,
  CAT, GNOME, LANTERN, CUPS } from './layout.js';

// Colliders for the house shell (back wall with an open door and window), the kitchen counter and chairs,
// and the tea garden behind the house. Primitive shapes; the render meshes are richer.
export function buildHouseColliders(add, box, cyl) {
  const fy = ROOM.floorY;
  const wallH = 2.6, wallY = fy + wallH / 2 - 0.05;
  // Floor and garden ground (one slab), ceiling over the house only.
  box(6, 0.05, 6, 0, fy - 0.05, 0, 'floor', 'tile');
  const hx = (ROOM.maxX - ROOM.minX) / 2 + WALL_T, hz = (ROOM.maxZ - ROOM.minZ) / 2 + WALL_T;
  const cx = (ROOM.maxX + ROOM.minX) / 2, cz = (ROOM.maxZ + ROOM.minZ) / 2;
  box(hx, 0.05, hz, cx, ROOM.ceilingY + 0.05, cz, 'wall', 'plaster');
  box(WALL_T / 2, wallH / 2, hz, ROOM.minX - WALL_T / 2, wallY, cz, 'wall', 'plaster');
  box(WALL_T / 2, wallH / 2, hz, ROOM.maxX + WALL_T / 2, wallY, cz, 'wall', 'plaster');
  box(hx, wallH / 2, WALL_T / 2, cx, wallY, ROOM.maxZ + WALL_T / 2, 'wall', 'plaster');
  // Back wall, around the openings.
  for (const [x0, x1, y0, y1] of backWallPieces()) {
    box((x1 - x0) / 2, (y1 - y0) / 2, WALL_T / 2, (x0 + x1) / 2, (y0 + y1) / 2, ROOM.minZ - WALL_T / 2, 'wall', 'plaster');
  }
  // Window frame: mullion and transom split the opening into four panes; the sill stands proud inside.
  const W = WINDOW, wz = ROOM.minZ - WALL_T / 2;
  box(W.mullion / 2, W.h / 2, WALL_T / 2, W.x, W.y, wz, 'wall', 'wood');
  box(W.w / 2, W.transomH / 2, WALL_T / 2, W.x, W.transomY, wz, 'wall', 'wood');
  box(SILL.w / 2, SILL.h / 2, SILL.depth / 2, SILL.x, SILL.top - SILL.h / 2, ROOM.minZ + SILL.depth / 2, 'wall', 'wood');
  cyl(0.06, 0.05, W.x - 0.5, SILL.top + 0.05, ROOM.minZ + 0.07, 'pot', 'ceramic');
  // Opened sashes and the door leaf are solid (glass included).
  for (const sh of sashes()) add(RAPIER.ColliderDesc.cuboid(sh.w / 2, sh.h / 2, 0.018), sh.cx, sh.cy, sh.cz, 'wall', 'wood', sh.quat);
  {
    const d = doorLeaf();
    add(RAPIER.ColliderDesc.cuboid(d.w / 2, d.h / 2, 0.025), d.cx, d.cy, d.cz, 'wall', 'wood', d.quat);
  }

  // Kitchen counter with upper cabinets and the kettle; the two chairs.
  const C = COUNTER;
  box((C.x1 - C.x0) / 2, (C.top - fy) / 2, (C.z1 - C.z0) / 2, (C.x0 + C.x1) / 2, (C.top + fy) / 2, (C.z0 + C.z1) / 2, 'counter', 'wood');
  box(C.upperDepth / 2, (C.upperY1 - C.upperY0) / 2, (C.z1 - C.z0) / 2, C.x1 - C.upperDepth / 2, (C.upperY0 + C.upperY1) / 2, (C.z0 + C.z1) / 2, 'counter', 'wood');
  cyl(KETTLE.r * 0.85, KETTLE.h / 2, KETTLE.x, C.top + KETTLE.h / 2, KETTLE.z, 'kettle', 'metal');
  for (const [x, z, yaw] of CHAIRS) chairColliders(box, x, z, yaw, -0.3, 0.42, 0.4, 0.45);

  // Garden boundary: fences with tall invisible walls just behind them (the sky has no lid).
  const G = GARDEN;
  const gx = (G.minX + G.maxX) / 2, gz = (G.minZ + G.maxZ) / 2;
  const tallH = 8;
  const Bd = BOUNDS, bz = (Bd.minZ + Bd.maxZ) / 2, bhz = (Bd.maxZ - Bd.minZ) / 2 + 0.1;
  box(0.05, tallH / 2, bhz, Bd.minX - 0.05, fy + tallH / 2, bz, 'fence', 'wood');
  box(0.05, tallH / 2, bhz, Bd.maxX + 0.05, fy + tallH / 2, bz, 'fence', 'wood');
  box((G.maxX - G.minX) / 2 + 0.1, tallH / 2, 0.05, gx, fy + tallH / 2, G.minZ - 0.05, 'fence', 'wood');
  // In front of the house (only reachable over the roof) and a lid high above everything.
  box((Bd.maxX - Bd.minX) / 2 + 0.1, tallH / 2, 0.05, gx, fy + tallH / 2, Bd.maxZ + 0.05, 'fence', 'wood');
  box((Bd.maxX - Bd.minX) / 2 + 0.1, 0.05, bhz, gx, Bd.top + 0.05, bz, 'fence', 'wood');
  // Short fence runs from the house corners to the side fences.
  box((ROOM.minX - WALL_T - G.minX) / 2, tallH / 2, 0.05, (ROOM.minX - WALL_T + G.minX) / 2, fy + tallH / 2, G.maxZ + 0.05, 'fence', 'wood');
  box((G.maxX - ROOM.maxX - WALL_T) / 2, tallH / 2, 0.05, (G.maxX + ROOM.maxX + WALL_T) / 2, fy + tallH / 2, G.maxZ + 0.05, 'fence', 'wood');
  // Roof slopes, gable ends and the chimney stack with its pots.
  const Rf = ROOF, ridgeY = Rf.eaveY + Rf.rise;
  for (const ez of [Rf.eaveZ, Rf.frontEaveZ]) {
    const run = Math.abs(Rf.ridgeZ - ez), len = Math.hypot(run, Rf.rise), pitch = Math.atan2(Rf.rise, run) * (ez < Rf.ridgeZ ? -1 : 1);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, 0));
    add(RAPIER.ColliderDesc.cuboid(Rf.halfX, Rf.thick / 2, len / 2), 0, (Rf.eaveY + ridgeY) / 2, (ez + Rf.ridgeZ) / 2, 'roof', 'tile', q);
  }
  // Soffits close the gap between the wall tops and the roof at both eaves.
  for (const [ez, wz] of [[Rf.eaveZ, ROOM.minZ - WALL_T], [Rf.frontEaveZ, ROOM.maxZ + WALL_T]]) {
    const yTop = Rf.eaveY + Math.abs(wz - ez) * Rf.rise / Math.abs(Rf.ridgeZ - ez), pts = [];
    for (const x of [-Rf.halfX, Rf.halfX]) pts.push(x, Rf.eaveY - 0.09, ez, x, Rf.eaveY, ez, x, Rf.eaveY - 0.09, wz, x, yTop, wz);
    add(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)), 0, 0, 0, 'roof', 'wood');
  }
  for (const x of [ROOM.minX - WALL_T, ROOM.maxX]) {
    const top = ROOM.floorY + 2.55, z0 = ROOM.minZ - WALL_T, z1 = ROOM.maxZ + WALL_T, pts = [];
    for (const dx of [0, WALL_T]) pts.push(x + dx, top, z0, x + dx, top, z1, x + dx, ridgeY - 0.05, Rf.ridgeZ);
    add(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)), 0, 0, 0, 'wall', 'brick');
  }
  const Ch = CHIMNEY;
  box(Ch.halfX, (Ch.top - 2.2) / 2, Ch.halfZ, Ch.x, (Ch.top + 2.2) / 2, Ch.z, 'chimney', 'brick');
  for (const [px, pz] of Ch.pots) cyl(Ch.potR, Ch.potH / 2, px, Ch.top + Ch.potH / 2, pz, 'chimney', 'ceramic');

  // Kitchen charm: fridge, radio, wall clock, picture frames, curtains and rail, the sill plant's leaves.
  box((FRIDGE.x1 - FRIDGE.x0) / 2, (FRIDGE.top - fy) / 2, (FRIDGE.z1 - FRIDGE.z0) / 2, (FRIDGE.x0 + FRIDGE.x1) / 2, (FRIDGE.top + fy) / 2, (FRIDGE.z0 + FRIDGE.z1) / 2, 'fridge', 'metal');
  box(RADIO.halfX, RADIO.h / 2, RADIO.halfZ, RADIO.x, COUNTER.top + RADIO.h / 2, RADIO.z, 'radio', 'wood');
  add(RAPIER.ColliderDesc.cylinder(0.02, CLOCK.r), CLOCK.x, CLOCK.y, ROOM.minZ + 0.02, 'clock', 'wood', new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
  for (const F of FRAMES) {
    if (F.wall === 'left') box(0.012, F.h / 2, F.w / 2, ROOM.minX + 0.012, F.y, F.z, 'frame', 'wood');
    else box(F.w / 2, F.h / 2, 0.012, F.x, F.y, ROOM.maxZ - 0.012, 'frame', 'wood');
  }
  for (const [x0, x1] of CURTAINS.panels) box((x1 - x0) / 2, (CURTAINS.rail - 0.05 - fy - 0.6) / 2, CURTAINS.depth / 2, (x0 + x1) / 2, (CURTAINS.rail - 0.05 + fy + 0.6) / 2, ROOM.minZ + 0.02 + CURTAINS.depth / 2, 'curtain', 'cloth');
  add(RAPIER.ColliderDesc.capsule((CURTAINS.panels[1][1] - CURTAINS.panels[0][0]) / 2 + 0.03, 0.012), (CURTAINS.panels[0][0] + CURTAINS.panels[1][1]) / 2, CURTAINS.rail, ROOM.minZ + 0.06, 'curtain', 'wood', new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)));
  add(RAPIER.ColliderDesc.ball(0.075), W.x - 0.5, SILL.top + 0.17, ROOM.minZ + 0.07, 'plant', 'plant');
  // Outside: lantern by the door, down pipe at the corner.
  box(0.05, 0.08, 0.05, LANTERN.x, LANTERN.y, LANTERN.z, 'lantern', 'metal');
  cyl(0.032, (ROOF.eaveY - fy) / 2, ROOM.minX - WALL_T - 0.05, (ROOF.eaveY + fy) / 2, ROOM.minZ - WALL_T - 0.05, 'pipe', 'metal');

  // Hedge along the back fence.
  box((G.maxX - G.minX) / 2, (HEDGE.top - fy) / 2, (HEDGE.z1 - HEDGE.z0) / 2, gx, (HEDGE.top + fy) / 2, (HEDGE.z0 + HEDGE.z1) / 2, 'hedge', 'plant');

  // Garden table on four legs, its teapot and jam jar of flowers, two chairs.
  const T = GTABLE;
  box(T.halfX, T.thickness / 2, T.halfZ, T.x, T.top - T.thickness / 2, T.z, 'table', 'wood');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(0.025, (T.top - T.thickness - fy) / 2, 0.025, T.x + sx * (T.halfX - 0.07), (T.top - T.thickness + fy) / 2, T.z + sz * (T.halfZ - 0.06), 'table', 'wood');
  }
  cyl(GTEAPOT.r, GTEAPOT.h / 2, GTEAPOT.x, T.top + GTEAPOT.h / 2, GTEAPOT.z, 'teapot', 'ceramic');
  cyl(GJAR.r, GJAR.h / 2, GJAR.x, T.top + GJAR.h / 2, GJAR.z, 'vase', 'glass');
  add(RAPIER.ColliderDesc.ball(0.05), GJAR.x, T.top + GJAR.h + 0.06, GJAR.z, 'flower', 'plant');
  for (const [x, z, yaw] of GCHAIRS) chairColliders(box, x, z, yaw, fy + 0.45, 0.4, 0.4, 0.48);

  // Rose arch: two posts and a top beam.
  const A = ARCH;
  // Posts are fattened to take in the climbing rose's leaves.
  for (const sx of [-1, 1]) box(A.post + 0.025, (A.top - fy) / 2, A.post + 0.04, A.x + sx * A.halfW, (A.top + fy) / 2, A.z, 'arch', 'plant');
  box(A.halfW + A.post, 0.04, A.post * 1.6, A.x, A.top + 0.04, A.z, 'arch', 'wood');

  // Bird bath, tree stump, bench, apple tree, patio pots.
  const B = BIRDBATH;
  cyl(B.stemR, (B.top - 0.06 - fy) / 2, B.x, (B.top - 0.06 + fy) / 2, B.z, 'birdbath', 'stone');
  cyl(B.r, 0.03, B.x, B.top - 0.03, B.z, 'birdbath', 'stone');
  cyl(STUMP.r, (STUMP.top - fy) / 2, STUMP.x, (STUMP.top + fy) / 2, STUMP.z, 'stump', 'wood');
  const N = BENCH;
  box(N.halfX, 0.02, N.halfZ, N.x, N.seat - 0.02, N.z, 'bench', 'wood');
  box(N.halfX, (N.backTop - N.seat) / 2, 0.025, N.x, (N.backTop + N.seat) / 2 + 0.03, N.z - N.halfZ + 0.02, 'bench', 'wood');
  for (const sx of [-1, 1]) box(0.03, (N.seat + 0.12 - fy) / 2, N.halfZ, N.x + sx * (N.halfX + 0.02), (N.seat + 0.12 + fy) / 2, N.z, 'bench', 'wood');
  const R = TREE;
  cyl(R.trunkR, (R.trunkTop - fy) / 2, R.x, (R.trunkTop + fy) / 2, R.z, 'tree', 'wood');
  for (const [dx, y, dz, r] of R.canopy) add(RAPIER.ColliderDesc.ball(r * 0.82), R.x + dx, y, R.z + dz, 'tree', 'plant');
  for (const [x, z, r, h] of POTS) {
    cyl(r, h / 2, x, ROOM.floorY + h / 2, z, 'pot', 'ceramic');
    add(RAPIER.ColliderDesc.ball(r * 0.95), x, ROOM.floorY + h + r * 0.45, z, 'plant', 'plant');
  }

  // The garden gnome (and the little tray his teacup sits on) and the cat on the bench.
  {
    const g = GNOME, gc = CUPS.find((c) => c.id === 'gnome');
    cyl(0.085, 0.09, g.x, fy + 0.09, g.z, 'gnome', 'ceramic');
    add(RAPIER.ColliderDesc.ball(0.062), g.x, fy + 0.235, g.z, 'gnome', 'ceramic');
    add(RAPIER.ColliderDesc.cone(0.07, 0.06), g.x, fy + 0.33, g.z, 'gnome', 'ceramic');
    cyl(0.05, 0.004, gc.x, gc.standY - 0.004, gc.z, 'saucer', 'ceramic');
    box(0.06, 0.012, 0.03, (g.x + gc.x) / 2, gc.standY - 0.02, gc.z, 'gnome', 'ceramic');
  }
  for (const [f, y, r] of catBalls()) add(RAPIER.ColliderDesc.ball(r), f.x, y, f.z, 'cat', 'fur');
}

// Rectangles [x0, x1, y0, y1] of the back wall left after cutting the door and the window.
export function backWallPieces() {
  const fy = ROOM.floorY, top = fy + 2.6 - 0.05;
  const W = WINDOW;
  const wx0 = W.x - W.w / 2, wx1 = W.x + W.w / 2, wy0 = W.y - W.h / 2, wy1 = W.y + W.h / 2;
  const D = BACKDOOR;
  const L = ROOM.minX - WALL_T, Rr = ROOM.maxX + WALL_T;
  return [
    [L, wx0, fy, top],              // left of the window
    [wx0, wx1, fy, wy0],            // under the window
    [wx0, wx1, wy1, top],           // over the window
    [wx1, D.x0, fy, top],           // between window and door
    [D.x0, D.x1, D.top, top],       // over the door
    [D.x1, Rr, fy, top],            // right of the door
  ];
}

// The window's four opened sashes: casements swung out square to the wall, fanlights tilted out at the
// bottom. Each has its centre, size, orientation and a matrix for placing parts in its local frame.
export function sashes() {
  const W = WINDOW, zo = ROOM.minZ - WALL_T;
  const wx0 = W.x - W.w / 2, wx1 = W.x + W.w / 2, wy0 = W.y - W.h / 2, wy1 = W.y + W.h / 2;
  const sw = W.w / 2 - W.mullion / 2;
  const lowH = W.transomY - W.transomH / 2 - wy0, highH = wy1 - (W.transomY + W.transomH / 2);
  const out = [];
  const mk = (w, h, cx, cy, cz, euler) => {
    const quat = new THREE.Quaternion().setFromEuler(euler);
    const base = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), quat, new THREE.Vector3(1, 1, 1));
    out.push({ w, h, cx, cy, cz, quat, matrix: (lx, ly, lz = 0) => base.clone().multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)) });
  };
  const ly = wy0 + lowH / 2;
  mk(sw, lowH, wx0 + 0.02, ly, zo - sw / 2 - 0.01, new THREE.Euler(0, Math.PI / 2, 0));
  mk(sw, lowH, wx1 - 0.02, ly, zo - sw / 2 - 0.01, new THREE.Euler(0, Math.PI / 2, 0));
  const a = 0.6;
  for (const cx of [W.x - W.mullion / 2 - sw / 2, W.x + W.mullion / 2 + sw / 2]) {
    mk(sw, highH, cx, wy1 - highH / 2 * Math.cos(a), zo - 0.02 - highH / 2 * Math.sin(a), new THREE.Euler(a, 0, 0));
  }
  return out;
}

// The back door, hinged at its right-hand jamb and opened ~170 degrees into the kitchen, nearly flat to
// the wall. Local +x runs from the hinge to the free edge; local +z faces the room.
export function doorLeaf() {
  const D = BACKDOOR, w = D.x1 - D.x0, h = D.top - ROOM.floorY;
  const ang = Math.PI - 0.17;
  const hx = D.x1, hz = ROOM.minZ + 0.03;
  const dir = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
  const cx = hx + dir.x * w / 2, cy = ROOM.floorY + h / 2 + 0.005, cz = hz + dir.z * w / 2;
  const yaw = Math.atan2(-dir.z, dir.x);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const base = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), quat, new THREE.Vector3(1, 1, 1));
  return { w, h, cx, cy, cz, quat, matrix: (lx, ly, lz = 0) => base.clone().multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)) };
}

// The cat's solid parts: [point (x, z), height, radius] from haunches to head. The paw is a separate
// kinematic body (see props.js).
export function catBalls() {
  const c = CAT, seat = BENCH.seat;
  const fwd = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) };
  const at = (d) => ({ x: c.x + fwd.x * d, z: c.z + fwd.z * d });
  return [[at(-0.04), seat + 0.1, 0.105], [at(0.05), seat + 0.17, 0.085], [at(0.08), seat + 0.3, 0.068]];
}

function chairColliders(box, x, z, yaw, seatY, w, d, backH) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const at = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyQuaternion(q).add(new THREE.Vector3(x, 0, z));
  const fy = ROOM.floorY;
  let p = at(0, 0);
  box(w / 2, 0.02, d / 2, p.x, seatY, p.z, 'chair', 'wood', yaw);
  p = at(0, d / 2 - 0.015);
  box(w / 2, backH / 2, 0.015, p.x, seatY + backH / 2, p.z, 'chair', 'wood', yaw);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p = at(sx * (w / 2 - 0.03), sz * (d / 2 - 0.03));
    box(0.014, (seatY - fy) / 2, 0.014, p.x, (seatY + fy) / 2, p.z, 'chair', 'wood', yaw);
  }
}
