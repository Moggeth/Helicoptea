import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../physics.js';
import { ROOM } from '../layout.js';

// A weathered potting bench against the left fence on the patio side, with terracotta pots, a seed tray,
// a trowel, twine and gloves on it and a galvanised bucket underneath. Fixed colliders for the bench and
// the larger things on it (the helicopter can land on the slatted top); two little pots at the front edge
// are loose (debris group): rotor wash or a nudge tips them over with a clay clunk. Replayed as bpot1/2.
//
// This module also holds the fixed colliders for the kitchen's fiddle-leaf fig (drawn by
// src/render/extras/kitchenPolish.js, which has no sim module of its own): pot, trunk and two soft canopy
// shapes.

const fy = ROOM.floorY;

// Bench frame (shared with the render module). Slats run along z; the front is at x1.
export const PB = {
  x0: -3.355, x1: -2.98, z0: -2.45, z1: -1.85,
  top: fy + 0.84, slatT: 0.022, overhang: 0.018,
  shelf: fy + 0.3, back: fy + 1.08, leg: 0.045,
};

// Things on the bench: [x, z, ...]. Pots: bottom radius, top radius, height.
export const ITEMS = {
  tray: { x: -3.215, z: -2.28, hx: 0.1, hz: 0.155, h: 0.058 },
  stack: { x: -3.265, z: -1.95, rb: 0.045, rt: 0.064, h: 0.105, n: 3, step: 0.022 },
  seedPot: { x: -3.235, z: -2.07, rb: 0.038, rt: 0.054, h: 0.088 },
  twine: { x: -3.115, z: -1.925, r: 0.042 },
  gloves: { x: -3.1, z: -2.14 },                    // on the lower shelf
  trowel: { x: -3.055, z: -2.29, yaw: 0.06 },
  shelfStack: { x: -3.21, z: -1.99, rb: 0.055, rt: 0.078, h: 0.13, n: 4, step: 0.026 },
  upturned: { x: -3.2, z: -2.3, rb: 0.062, rt: 0.088, h: 0.15 },
  bucket: { x: -3.14, z: -2.16, rb: 0.105, rt: 0.13, h: 0.24 },
};

// Loose pots (small, light, at the front edge of the top).
export const LOOSE = [
  { id: 'bpot1', x: -3.026, z: -1.93, rb: 0.024, rt: 0.034, h: 0.052, mass: 0.022, yaw: 0.4 },
  { id: 'bpot2', x: -3.03, z: -2.06, rb: 0.024, rt: 0.034, h: 0.052, mass: 0.022, yaw: 1.9 },
];

// The fiddle-leaf fig in the kitchen's front-left corner (between the fridge and the front wall).
export const FIG = { x: -2.15, z: 1.93, potR: 0.165, potRb: 0.13, potH: 0.34, saucerR: 0.17, saucerH: 0.03, trunkTop: 0.55 };

const RHO = 1.2;
const WASH_GAIN = 28;   // outwash right at a surface is much stronger than the sampled wake (see props.js)

export function create(sim, lite) {
  const world = sim.world;
  const add = (desc, x, y, z, kind, material, rot) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.1);
    if (rot) desc.setRotation(rot);
    const c = world.createCollider(desc);      // parentless: fixed, and no extra rigid body
    sim.register(c, { kind, material });
    return c;
  };
  const box = (hx, hy, hz, x, y, z, kind = 'bench', material = 'wood') => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, kind, material);
  const cyl = (r, hh, x, y, z, kind = 'bench', material = 'ceramic') => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, kind, material);

  // ---------------------------------------------------------------- bench
  const cx = (PB.x0 + PB.x1) / 2, cz = (PB.z0 + PB.z1) / 2, hz = (PB.z1 - PB.z0) / 2;
  box((PB.x1 + PB.overhang - PB.x0) / 2, PB.slatT / 2, hz + 0.01, (PB.x0 + PB.x1 + PB.overhang) / 2, PB.top - PB.slatT / 2, cz);
  box((PB.x1 - PB.x0) / 2, 0.04, hz, cx, PB.top - PB.slatT - 0.04, cz);                 // aprons under the top
  box((PB.x1 - PB.x0) / 2, 0.012, hz, cx, PB.shelf - 0.012, cz);                         // lower shelf
  box(0.012, (PB.back - PB.top) / 2, hz, PB.x0 + 0.012, (PB.back + PB.top) / 2, cz);     // back board
  for (const lx of [PB.x0 + PB.leg / 2, PB.x1 - PB.leg / 2]) for (const lz of [PB.z0 + PB.leg / 2, PB.z1 - PB.leg / 2]) {
    const top = lx < cx ? PB.back : PB.top - PB.slatT;
    box(PB.leg / 2, (top - fy) / 2, PB.leg / 2, lx, (top + fy) / 2, lz);
  }
  // Larger things on and under it.
  const I = ITEMS, t = PB.top;
  box(I.tray.hx, I.tray.h / 2, I.tray.hz, I.tray.x, t + I.tray.h / 2, I.tray.z, 'bench', 'wood');
  const sh = I.stack.h + (I.stack.n - 1) * I.stack.step;
  cyl(I.stack.rt, sh / 2, I.stack.x, t + sh / 2, I.stack.z);
  cyl(I.seedPot.rt, I.seedPot.h / 2, I.seedPot.x, t + I.seedPot.h / 2, I.seedPot.z);
  add(RAPIER.ColliderDesc.ball(I.twine.r), I.twine.x, t + I.twine.r * 0.9, I.twine.z, 'bench', 'cloth');
  const ssh = I.shelfStack.h + (I.shelfStack.n - 1) * I.shelfStack.step;
  cyl(I.shelfStack.rt, ssh / 2, I.shelfStack.x, PB.shelf + ssh / 2, I.shelfStack.z);
  cyl(I.upturned.rt, I.upturned.h / 2, I.upturned.x, PB.shelf + I.upturned.h / 2, I.upturned.z);
  cyl(I.bucket.rt, I.bucket.h / 2, I.bucket.x, fy + I.bucket.h / 2, I.bucket.z, 'bench', 'metal');

  // ---------------------------------------------------------------- the kitchen fig (see the header)
  {
    const F = FIG;
    cyl(F.saucerR, F.saucerH / 2, F.x, fy + F.saucerH / 2, F.z, 'plant', 'ceramic');
    cyl(F.potR, F.potH / 2, F.x, fy + F.potH / 2 + 0.006, F.z, 'plant', 'ceramic');
    const base = fy + F.potH, len = F.trunkTop - base;
    add(RAPIER.ColliderDesc.capsule(len / 2, 0.025), F.x + 0.02, base + len / 2, F.z - 0.01, 'plant', 'plant');
    // Soft canopy: smaller than the drawn leaves, so a careful pilot can brush the tips.
    add(RAPIER.ColliderDesc.ball(0.16), F.x + 0.06, 0.04, F.z - 0.06, 'plant', 'plant');
    add(RAPIER.ColliderDesc.ball(0.14), F.x + 0.08, 0.4, F.z - 0.08, 'plant', 'plant');
  }

  // ---------------------------------------------------------------- loose pots
  const pots = [];
  const defs = lite ? LOOSE.slice(0, 1) : LOOSE;
  let lastClunk = -1;
  for (const d of defs) {
    const home = { x: d.x, y: PB.top + d.h / 2 + 0.0005, z: d.z };
    const hq = { x: 0, y: Math.sin(d.yaw / 2), z: 0, w: Math.cos(d.yaw / 2) };
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z).setRotation(hq)
      .setLinearDamping(0.05).setAngularDamping(0.25).setCanSleep(true));
    // Tapered pot: hull of the base and rim rings (centred on its middle).
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      pts.push(Math.cos(a) * d.rb, -d.h / 2, Math.sin(a) * d.rb, Math.cos(a) * d.rt, d.h / 2, Math.sin(a) * d.rt);
    }
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setMass(d.mass).setFriction(0.65).setRestitution(0.15)
      .setCollisionGroups(GROUPS.debris).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1.2);
    const c = world.createCollider(desc, body);
    const pot = { def: d, body, track: new Track(body), home, hq, pushed: false };
    sim.register(c, {
      kind: 'prop', material: 'ceramic',
      onImpact(imp) {
        if (imp < 0.004 || sim.time < 0.5 || sim.time - lastClunk < 0.09) return;
        const v = body.linvel(), w = body.angvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z < 0.01 && w.x * w.x + w.y * w.y + w.z * w.z < 1) return;
        lastClunk = sim.time;
        const p = body.translation();
        sim.emit('extra', { kind: 'clayPot', pos: { x: p.x, y: p.y, z: p.z }, strength: Math.min(1, imp / 0.05) });
      },
    });
    pots.push(pot);
  }

  const air = { x: 0, y: 0, z: 0 };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), pv = new THREE.Vector3(), a3 = new THREE.Vector3();
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
    recorded: pots.map((p) => ({ id: p.def.id, body: p.body })),
    pots,

    applyForces() {
      for (const pot of pots) {
        const b = pot.body;
        if (pot.pushed) { b.resetForces(false); b.resetTorques(false); pot.pushed = false; }
        const t = b.translation();
        if (!near(t) || !sim.props) continue;
        pv.set(t.x, t.y - pot.def.h * 0.35, t.z);     // the outwash is fastest right at the bench top
        sim.props.airAt(pv, a3);
        const lv = b.linvel();
        air.x = a3.x - lv.x; air.y = a3.y - lv.y; air.z = a3.z - lv.z;
        const sp = Math.hypot(air.x, air.y, air.z);
        if (sp < 0.3) continue;
        const d = pot.def, area = (d.rb + d.rt) * d.h;
        let k = 0.5 * RHO * 1.0 * area * sp * WASH_GAIN;
        const fmax = 1.5 * d.mass * 9.81;
        if (k * sp > fmax) k = fmax / sp;
        // Pushed near the rim (the pot tips rather than slides), the force from the wandering wash.
        const r = b.rotation();
        _p.set(0, d.h * 0.5, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
        const ph = sim.time * 9 + d.x * 31;
        b.addForceAtPoint({ x: air.x * k * (1 + 0.25 * Math.sin(ph)), y: air.y * k, z: air.z * k * (1 + 0.25 * Math.cos(ph * 1.3)) },
          { x: t.x + _p.x, y: t.y + _p.y, z: t.z + _p.z }, true);
        pot.pushed = true;
      }
    },

    afterStep() {
      for (const pot of pots) if (!pot.body.isSleeping() || pot.moved) { pot.track.capture(pot.body); pot.moved = !pot.body.isSleeping(); }
    },

    reset() {
      for (const pot of pots) {
        const b = pot.body;
        b.setTranslation(pot.home, true);
        b.setRotation(pot.hq, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        b.resetForces(true); b.resetTorques(true);
        pot.track.capture(b); pot.track.capture(b);
        pot.moved = true;
      }
    },
  };
}
