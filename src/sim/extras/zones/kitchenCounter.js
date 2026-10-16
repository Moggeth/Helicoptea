import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../../physics.js';
import { COUNTER } from '../../layout.js';

// The kitchen counter's free spots and the tiled wall above it (x 1.74..2.4, z -1.0..1.4):
//   a wall-mounted spice rack, a stoneware utensil crock, a cookbook on a stand, a chopping board leaning on
//   the tiles, a granite mortar with a loose pestle, three stoneware storage jars, a cake stand with a glass
//   dome over a Victoria sponge, and a rail of hanging kitchen tools (drawn by src/render/extras/zones/
//   kitchenCounter.js; the swinging tools and rattling spoons are render-only springs).
// Fixed colliders for everything solid. Two loose bodies (debris group, recorded for the replay):
//   the glass dome (a compound shell, so the cake underneath stays solid) that rotor wash slides off its
//   stand, and the pestle, which rolls about on the worktop.

export const T = COUNTER.top;          // worktop surface (0.14)
const WALL = 2.4;                      // tiled wall (room's right wall)

// Placement, shared with the render module.
export const KC = {
  crock: { x: 2.28, z: -0.56, rb: 0.046, r: 0.054, h: 0.125 },
  rack: { z0: -0.95, z1: -0.3, depth: 0.075, y0: 0.5, y1: 0.63, shelfT: 0.012, jarH: 0.058 },
  rail: { y: 0.64, z0: 0.05, z1: 0.56, x: WALL - 0.02 },
  board: { z: -0.145, len: 0.34, w: 0.2, t: 0.02, lean: 0.24 },
  mortar: { x: 1.865, z: 0.0, r: 0.064, h: 0.07 },
  pestle: { x: 1.83, z: -0.2, yaw: 0.35, len: 0.15, r0: 0.0108, r1: 0.0178, mass: 0.02 },
  jars: [ { x: 1.835, z: 0.17, r: 0.04, h: 0.15 }, { x: 1.84, z: 0.26, r: 0.036, h: 0.125 }, { x: 1.845, z: 0.345, r: 0.032, h: 0.1 } ],
  book: { x: 1.945, z: -0.64, yaw: 0, w: 0.2, h: 0.255, tilt: 0.42 },
  cake: { x: 2.255, z: 0.69, plateR: 0.126, plateY: 0.082, cakeR: 0.086, cakeH: 0.068 },
  dome: { r: 0.106, wallH: 0.07, h: 0.172, mass: 0.035 },
};

const RHO = 1.2;
const WASH_GAIN = 28;

export function create(sim, lite) {
  const world = sim.world;
  const fixed = (sim.props && sim.props.fixed) || null;
  const add = (desc, x, y, z, material = 'wood', rot) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.1);
    if (rot) desc.setRotation(rot);
    const c = fixed ? world.createCollider(desc, fixed) : world.createCollider(desc);
    sim.register(c, { kind: 'kitchenCounter', material });
    return c;
  };
  const box = (hx, hy, hz, x, y, z, material, rot) => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, material, rot);
  const cyl = (r, hh, x, y, z, material = 'ceramic') => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, material);
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const rotOf = (rx, ry, rz) => { q.setFromEuler(e.set(rx, ry, rz, 'YXZ')); return { x: q.x, y: q.y, z: q.z, w: q.w }; };

  // Utensil crock (the spoons themselves are thin and soft: no colliders).
  { const C = KC.crock; cyl(C.r, C.h / 2, C.x, T + C.h / 2, C.z); }
  // Spice rack: a collider per shelf (jars included).
  { const R = KC.rack, hz = (R.z1 - R.z0) / 2, cz = (R.z0 + R.z1) / 2;
    for (const y of [R.y0, R.y1]) box(R.depth / 2, (R.jarH + R.shelfT * 2) / 2, hz, WALL - R.depth / 2, y + R.jarH / 2 - R.shelfT / 2, cz, 'wood'); }
  // Wall rail: just the thin rod, as a small box (the hanging tools swing free of it).
  { const R = KC.rail; box(0.012, 0.012, (R.z1 - R.z0) / 2, R.x, R.y, (R.z0 + R.z1) / 2, 'metal'); }
  // Chopping board leaning on the tiles: a tilted slab (its top edge touches the wall).
  { const B = KC.board, a = B.lean, cx = WALL - 0.002 - (B.t / 2) * Math.cos(a) - (B.len / 2) * Math.sin(a), cy = T + (B.len / 2) * Math.cos(a) + (B.t / 2) * Math.sin(a);
    box(B.t / 2, B.len / 2, B.w / 2, cx, cy, B.z, 'wood', rotOf(0, 0, -a)); }
  // Mortar (granite).
  { const M = KC.mortar; cyl(M.r, M.h / 2, M.x, T + M.h / 2, M.z, 'stone'); }
  // Storage jars.
  for (const J of KC.jars) cyl(J.r, J.h / 2, J.x, T + J.h / 2, J.z);
  // Cookbook on its stand: a block (stand and leaning book).
  { const B = KC.book; box(0.05, B.h / 2 * 0.9, B.w / 2, B.x + 0.012, T + B.h / 2 * 0.92, B.z, 'wood', rotOf(0, 0, B.tilt * 0.55)); }
  // Cake stand: the pedestal, the plate and the sponge.
  { const K = KC.cake;
    cyl(0.06, 0.035, K.x, T + 0.035, K.z, 'ceramic');
    cyl(K.plateR, 0.005, K.x, T + K.plateY - 0.005, K.z, 'ceramic');
    // (Only a core of the sponge is solid (the dome is nearly as wide): a dome slid by the wash may clip its outer ring, but it can slide.)
    cyl(0.02, K.cakeH / 2, K.x, T + K.plateY + K.cakeH / 2, K.z, 'cloth'); }

  // ---------------------------------------------------------------- loose bodies
  const loose = [];
  let lastKnock = -1;
  const makeBody = (id, home, hq, collidersFn, mass, kind) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z).setRotation(hq)
      .setLinearDamping(0.08).setAngularDamping(0.35).setCanSleep(true));
    const item = { id, body, track: new Track(body), home, hq, pushed: false, moved: true, kind };
    collidersFn(body, item);
    loose.push(item);
    return item;
  };
  const register = (c, item, material, sound, thr) => {
    sim.register(c, {
      kind: 'prop', material,
      onImpact(imp) {
        if (imp < 0.003 || sim.time < 0.5 || sim.time - lastKnock < 0.08) return;
        const v = item.body.linvel(), w = item.body.angvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z < 0.01 && w.x * w.x + w.y * w.y + w.z * w.z < 1) return;
        lastKnock = sim.time;
        const p = item.body.translation();
        sim.emit('extra', { kind: sound, pos: { x: p.x, y: p.y, z: p.z }, strength: Math.min(1, imp / thr) });
      },
    });
  };
  const events = (d) => d.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.8);

  // The glass dome: body origin at the middle of its rim. Eight wall slabs for the base ring and a convex
  // hull for the cap (so the cake stays outside the shape).
  {
    const D = KC.dome, K = KC.cake;
    const home = { x: K.x, y: T + K.plateY + 0.0006, z: K.z };
    makeBody('kdome', home, { x: 0, y: 0, z: 0, w: 1 }, (body, item) => {
      const n = lite ? 6 : 8, rw = D.r - 0.003, half = rw * Math.tan(Math.PI / n);
      for (let i = 0; i < n; i++) {
        const a = (i + 0.5) / n * Math.PI * 2;
        const desc = events(RAPIER.ColliderDesc.cuboid(0.003, D.wallH / 2, half)
          .setTranslation(Math.cos(a) * rw, D.wallH / 2, -Math.sin(a) * rw).setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) })
          .setMass(D.mass / (n + 1)).setFriction(0.3).setRestitution(0.12).setCollisionGroups(GROUPS.debris));
        register(world.createCollider(desc, body), item, 'glass', 'glassKnock', 0.04);
      }
      // Cap: the solid shell from just above the cake to the knob.
      const pts = [], rings = [[D.wallH, D.r - 0.004], [D.wallH + 0.04, D.r - 0.012], [D.wallH + 0.08, D.r - 0.03], [D.wallH + 0.115, 0.058], [D.wallH + 0.145, 0.03], [D.h, 0.014]];
      for (const [y, r] of rings) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push(Math.cos(a) * r, y, Math.sin(a) * r); }
      const desc = events(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setMass(D.mass / (n + 1)).setFriction(0.3).setRestitution(0.12).setCollisionGroups(GROUPS.debris));
      register(world.createCollider(desc, body), item, 'glass', 'glassKnock', 0.04);
      item.h = D.h; item.rad = D.r;
    }, D.mass, 'dome');
  }
  // The pestle: a granite capsule lying on the worktop beside the mortar.
  {
    const P = KC.pestle;
    const home = { x: P.x, y: T + P.r1 + 0.001, z: P.z };
    const hq = rotOf(0, P.yaw, Math.PI / 2);
    makeBody('kpestle', home, hq, (body, item) => {
      // An eight-sided tapered hull (a round capsule would roll about for ever): thin handle end, fat head.
      const half = P.len / 2, pts = [];
      for (const [y, r] of [[-half, P.r0 * 0.75], [-half + 0.012, P.r0], [half - 0.014, P.r1], [half, P.r1 * 0.8]])
        for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; pts.push(Math.cos(a) * r, y, Math.sin(a) * r); }
      const desc = events(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setMass(P.mass).setFriction(0.6).setRestitution(0.12).setCollisionGroups(GROUPS.debris));
      register(world.createCollider(desc, body), item, 'stone', 'stoneKnock', 0.03);
      item.h = P.r1 * 2; item.rad = P.len / 2;
    }, P.mass, 'pestle');
  }

  const air = { x: 0, y: 0, z: 0 };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), pv = new THREE.Vector3(), a3 = new THREE.Vector3();
  const near = (p) => {
    const A = sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 0.9 && Math.abs(p.z - wk.hub.z) < 0.9) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 0.9 && Math.abs(p.z - wk.hit.z) < 0.9) return true;
    }
    return false;
  };

  return {
    recorded: loose.map((l) => ({ id: l.id, body: l.body })),
    loose,

    applyForces() {
      for (const it of loose) {
        const b = it.body;
        if (it.pushed) { b.resetForces(false); b.resetTorques(false); it.pushed = false; }
        const t = b.translation();
        if (!near(t) || !sim.props) continue;
        pv.set(t.x, it.kind === 'dome' ? T + 0.012 : t.y, t.z);      // outwash hugs the worktop: sample it there
        sim.props.airAt(pv, a3);
        const lv = b.linvel();
        if (it.kind === 'dome') { a3.x *= 1.6; a3.z *= 1.6; }
        air.x = a3.x - lv.x; air.y = Math.min(a3.y, 0) - lv.y * 0.3; air.z = a3.z - lv.z;
        const sp = Math.hypot(air.x, air.z);
        if (sp < 0.3) continue;
        const area = it.kind === 'dome' ? 0.2 * 0.1 : 0.15 * 0.03;
        let k = 0.5 * RHO * 1.0 * area * sp * WASH_GAIN;
        const mass = it.kind === 'dome' ? KC.dome.mass : KC.pestle.mass;
        const fmax = (it.kind === 'dome' ? 2.4 : 1.6) * mass * 9.81;
        if (k * sp > fmax) k = fmax / sp;
        const r = b.rotation();
        _p.set(0, it.kind === 'dome' ? it.h * 0.6 : 0, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
        const ph = sim.time * 8 + t.x * 31;
        b.addForceAtPoint({ x: air.x * k * (1 + 0.25 * Math.sin(ph)), y: 0, z: air.z * k * (1 + 0.25 * Math.cos(ph * 1.3)) },
          { x: t.x + _p.x, y: t.y + _p.y, z: t.z + _p.z }, true);
        it.pushed = true;
      }
    },

    afterStep() {
      for (const it of loose) if (!it.body.isSleeping() || it.moved) { it.track.capture(it.body); it.moved = !it.body.isSleeping(); }
    },

    reset() {
      for (const it of loose) {
        const b = it.body;
        b.setTranslation(it.home, true);
        b.setRotation(it.hq, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        b.resetForces(true); b.resetTorques(true);
        it.track.capture(b); it.track.capture(b);
        it.moved = true;
      }
    },
  };
}
