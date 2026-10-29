import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../../physics.js';
import { ROOM, DRESSER, SILL } from '../../layout.js';

// kitchenShelves: the windowsill herbs and a loose enamel jug of sweet peas, the dresser's worktop (biscuit
// tin, cake tins) and top (cookery books between iron bookends, a mantel clock), and a two-tier wall shelf of
// preserving jars on the front wall with a bunch of lavender hanging from it (drawn by
// src/render/extras/zones/kitchenShelves.js). Everything fixed is a primitive collider on sim.props.fixed;
// the jug of sweet peas is the one dynamic body (replayed as 'sweetjug').

export const SILLTOP = SILL.top;                    // 0.05
export const SILL_Z = ROOM.minZ + SILL.depth / 2;   // middle of the sill's depth

// Herb pots on the sill: x, top radius, bottom radius, height (pot stands on a 6 mm saucer).
export const HERBS = [
  { id: 'basil', x: -0.93, rt: 0.05, rb: 0.036, h: 0.092 },
  { id: 'rosemary', x: -0.7, rt: 0.054, rb: 0.038, h: 0.1 },
  { id: 'mint', x: -0.45, rt: 0.06, rb: 0.043, h: 0.11 },
  { id: 'thyme', x: -0.23, rt: 0.042, rb: 0.03, h: 0.07 },
];
export const SAUCER_T = 0.006;

// The enamel jug of sweet peas (loose, at the right of the sill).
export const JUG = { id: 'sweetjug', x: 0.37, z: SILL_Z + 0.01, r: 0.043, rt: 0.047, h: 0.11, mass: 0.045 };

// Dresser worktop and top.
export const WORK = DRESSER.baseTop;                // 0.12
export const TOPY = DRESSER.top + 0.012 + 0.0125;   // top of the cornice board
export const TIN = { x: 1.13, z: 2.0, hx: 0.1, hz: 0.07, h: 0.062, lidH: 0.018, yaw: 0.16 };
export const CAKE = [
  { x: 1.43, z: 2.03, r: 0.106, h: 0.08, lidH: 0.014 },
  { x: 1.43, z: 2.03, r: 0.072, h: 0.05, lidH: 0.012, y0: 0.094 },
];
export const BOOKZ = { z: 1.99, d: 0.19 };
// Books left to right: thickness, height, lean (rad, about z).
export const BOOKS = [
  [0.03, 0.272, 0], [0.026, 0.254, 0], [0.04, 0.288, 0], [0.022, 0.24, 0], [0.034, 0.266, 0], [0.028, 0.25, 0], [0.032, 0.28, -0.2],
];
export const BOOKS_X0 = 0.69;
// World pose of each book (centre x, centre y, lean about z) and where the row ends.
export const BOOK_POSE = [];
export let BOOKS_END = BOOKS_X0;
{
  let x = BOOKS_X0;
  for (const [t, h, lean] of BOOKS) {
    const cx = x + t / 2;
    BOOK_POSE.push({ t, h, lean, x: cx - Math.sin(lean) * h / 2, y: TOPY + Math.cos(lean) * h / 2 + Math.abs(Math.sin(lean)) * t / 2 });
    x += t;
  }
  BOOKS_END = x;
}
export const CLOCK = { x: 1.2, z: 2.0, w: 0.2, d: 0.095, base: 0.012, lower: 0.15, arch: 0.1 };

// The wall shelf on the front wall (z = ROOM.maxZ), two boards, on the plain wall between the picture and the
// dresser (the hall doorway is at x -1.85..-1.05).
export const SHELF = { x0: -0.2, x1: 0.52, depth: 0.15, t: 0.02, ys: [0.5, 0.84] };
const JX = SHELF.x0 + 1.62;   // the jars' x below are laid out for a shelf starting at -1.62
// Jars: kind, x, shelf index, radius, height.
export const JARS = [
  { kind: 'jam', x: -1.575, s: 0, r: 0.036, h: 0.105, fill: 0x8a1520, label: 0, lid: 0 },
  { kind: 'jam', x: -1.485, s: 0, r: 0.036, h: 0.105, fill: 0x3f1730, label: 1, lid: 1 },
  { kind: 'bottle', x: -1.4, s: 0, r: 0.029, h: 0.165, fill: 0x4a2412, label: 2 },
  { kind: 'jam', x: -1.31, s: 0, r: 0.04, h: 0.085, fill: 0xd9801f, label: 3, lid: 2 },
  { kind: 'jam', x: -1.215, s: 0, r: 0.036, h: 0.105, fill: 0x7a2a3a, label: 4, lid: 0 },
  { kind: 'bottle', x: -1.13, s: 0, r: 0.027, h: 0.15, fill: 0x7a1a14, label: 5 },
  { kind: 'kilner', x: -1.56, s: 1, r: 0.05, h: 0.13, fill: 0x6b1e3a, label: -1 },
  { kind: 'kilner', x: -1.45, s: 1, r: 0.05, h: 0.13, fill: 0xe3b83a, label: -1 },
  { kind: 'crock', x: -1.335, s: 1, r: 0.05, h: 0.11 },
  { kind: 'kilner', x: -1.215, s: 1, r: 0.05, h: 0.13, fill: 0x8a5a2a, label: -1 },
  { kind: 'kilner', x: -1.1, s: 1, r: 0.045, h: 0.11, fill: 0x9c5a25, label: -1 },
].map((j) => ({ ...j, x: j.x + JX }));
export const LAV = { x: SHELF.x1 - 0.03, y: SHELF.ys[0] - SHELF.t / 2 - 0.004, z: ROOM.maxZ - 0.045, len: 0.21 };

const RHO = 1.2, WASH = 140;

// Air drawn in towards a rotor's wake and its gusty edge, added to what sim.props.airAt gives (which is only
// the straight-down column and the wall jet on a surface): lets a pendulum or a light jug feel a rotor that
// passes beside it. Adds to out; t is the sim or render clock.
export function entrain(sim, p, out, t) {
  const A = sim.air;
  if (!A || A.calm) return out;
  for (const wk of A.wakes) {
    if (!wk.active) continue;
    const dy = wk.hub.y - p.y;
    if (dy < -0.06 || dy > 1.0) continue;
    const dx = wk.hub.x - p.x, dz = wk.hub.z - p.z, r = Math.hypot(dx, dz) + 1e-4;
    if (r > wk.radius * 3.2) continue;
    const fall = 0.35 + 0.65 * (1 - Math.max(0, dy) / 1.0);
    const pull = wk.vi * 0.7 * Math.exp(-r / (wk.radius * 1.4)) * fall;
    out.x += dx / r * pull; out.z += dz / r * pull;
    if (r < wk.radius * 1.6) {
      const g = wk.vi * 0.3 * fall;
      out.x += Math.sin(t * 21 + p.x * 40) * g; out.z += Math.cos(t * 17 + p.z * 40) * g;
    }
  }
  return out;
}

export function create(sim, lite) {
  const world = sim.world;
  const fixed = sim.props && sim.props.fixed;
  const add = (desc, x, y, z, material, rot) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.08);
    if (rot) desc.setRotation(rot);
    const c = fixed ? world.createCollider(desc, fixed) : world.createCollider(desc);
    sim.register(c, { kind: 'shelves', material });
    return c;
  };
  const box = (hx, hy, hz, x, y, z, m = 'wood', rot) => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, m, rot);
  const cyl = (r, hh, x, y, z, m = 'ceramic') => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, m);
  const yawQ = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

  // Herb pots (a tapered pot is close enough to a cylinder at its mean radius) and their saucers.
  for (const p of HERBS) {
    cyl(p.rt + 0.008, SAUCER_T / 2, p.x, SILLTOP + SAUCER_T / 2, SILL_Z, 'ceramic');
    cyl((p.rt + p.rb) / 2, p.h / 2, p.x, SILLTOP + SAUCER_T + p.h / 2, SILL_Z, 'ceramic');
  }

  // Dresser worktop: biscuit tin and the two cake tins.
  box(TIN.hx, (TIN.h + TIN.lidH) / 2, TIN.hz, TIN.x, WORK + (TIN.h + TIN.lidH) / 2, TIN.z, 'metal', yawQ(TIN.yaw));
  for (const c of CAKE) {
    const y0 = WORK + (c.y0 || 0);
    cyl(c.r, (c.h + c.lidH) / 2, c.x, y0 + (c.h + c.lidH) / 2, c.z, 'metal');
  }

  // Dresser top: books (each its own box; the leaning one is tilted), bookends and the mantel clock.
  for (const b of BOOK_POSE) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), b.lean);
    box(b.t / 2, b.h / 2, BOOKZ.d / 2, b.x, b.y, BOOKZ.z, 'cloth', { x: q.x, y: q.y, z: q.z, w: q.w });
  }
  box(0.0025, 0.06, 0.045, BOOKS_X0 - 0.0045, TOPY + 0.06, BOOKZ.z, 'metal');
  box(0.0025, 0.06, 0.045, BOOKS_END + 0.0245, TOPY + 0.06, BOOKZ.z, 'metal');
  {
    const C = CLOCK, y0 = TOPY + C.base;
    box(C.w / 2 + 0.006, C.base / 2, C.d / 2 + 0.006, C.x, TOPY + C.base / 2, C.z, 'wood');
    box(C.w / 2, C.lower / 2, C.d / 2, C.x, y0 + C.lower / 2, C.z, 'wood');
    box(C.w / 2 * 0.86, C.arch / 2, C.d / 2, C.x, y0 + C.lower + C.arch / 2 - 0.005, C.z, 'wood');
  }

  // Wall shelf: two boards and the jars.
  for (const y of SHELF.ys) {
    box((SHELF.x1 - SHELF.x0) / 2, SHELF.t / 2, SHELF.depth / 2, (SHELF.x0 + SHELF.x1) / 2, y, ROOM.maxZ - SHELF.depth / 2, 'wood');
  }
  for (const j of JARS) {
    const y = SHELF.ys[j.s] + SHELF.t / 2;
    cyl(j.r, j.h / 2, j.x, y + j.h / 2, ROOM.maxZ - SHELF.depth / 2 + 0.005, j.kind === 'crock' ? 'ceramic' : 'glass');
  }

  // ---------------------------------------------------------------- the jug of sweet peas
  const J = JUG;
  const home = { x: J.x, y: SILLTOP + J.h / 2 + 0.0004, z: J.z };
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z)
    .setLinearDamping(0.06).setAngularDamping(0.3).setCanSleep(true));
  const cdesc = RAPIER.ColliderDesc.cylinder(J.h / 2, (J.r + J.rt) / 2).setMass(J.mass).setFriction(0.6).setRestitution(0.12)
    .setCollisionGroups(GROUPS.debris).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1.0);
  let lastKnock = -1;
  sim.register(world.createCollider(cdesc, body), {
    kind: 'prop', material: 'metal',
    onImpact(imp) {
      if (imp < 0.004 || sim.time < 0.5 || sim.time - lastKnock < 0.09) return;
      const v = body.linvel(), w = body.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z < 0.01 && w.x * w.x + w.y * w.y + w.z * w.z < 1) return;
      lastKnock = sim.time;
      const p = body.translation();
      sim.emit('extra', { kind: 'enamelJug', pos: { x: p.x, y: p.y, z: p.z }, strength: Math.min(1, imp / 0.05) });
    },
  });
  const jug = { body, track: new Track(body), pushed: false, moved: true };

  const air = { x: 0, y: 0, z: 0 };
  const a3 = new THREE.Vector3(), pv = new THREE.Vector3(), _q = new THREE.Quaternion(), _o = new THREE.Vector3();
  const near = (p) => {
    const A = sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 1.0 && Math.abs(p.z - wk.hub.z) < 1.0) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 1.0 && Math.abs(p.z - wk.hit.z) < 1.0) return true;
    }
    return false;
  };

  return {
    recorded: [{ id: J.id, body }],
    jug,

    applyForces() {
      const b = jug.body;
      if (jug.pushed) { b.resetForces(false); b.resetTorques(false); jug.pushed = false; }
      const t = b.translation();
      if (!sim.props || !near(t)) return;
      pv.set(t.x, t.y, t.z);
      sim.props.airAt(pv, a3);
      entrain(sim, pv, a3, sim.time);
      const lv = b.linvel();
      air.x = a3.x - lv.x; air.y = (a3.y - lv.y) * 0.15; air.z = a3.z - lv.z;   // the downward column pins it; the sideways wash pushes
      const sp = Math.hypot(air.x, air.y, air.z);
      if (sp < 0.3) return;
      let k = 0.5 * RHO * 1.0 * (2 * J.r * J.h) * sp * WASH;
      const fmax = 2.2 * J.mass * 9.81;
      if (k * sp > fmax) k = fmax / sp;
      const r = b.rotation();
      _o.set(0, J.h * 0.45, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
      const ph = sim.time * 8;
      b.addForceAtPoint({ x: air.x * k * (1 + 0.25 * Math.sin(ph)), y: air.y * k, z: air.z * k * (1 + 0.25 * Math.cos(ph * 1.3)) },
        { x: t.x + _o.x, y: t.y + _o.y, z: t.z + _o.z }, true);
      jug.pushed = true;
    },

    afterStep() {
      if (!jug.body.isSleeping() || jug.moved) { jug.track.capture(jug.body); jug.moved = !jug.body.isSleeping(); }
    },

    reset() {
      const b = jug.body;
      b.setTranslation(home, true);
      b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      b.resetForces(true); b.resetTorques(true);
      jug.track.capture(b); jug.track.capture(b);
      jug.moved = true;
    },
  };
}
