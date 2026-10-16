import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../../physics.js';
import { ROOM, WALL_T } from '../../layout.js';

// Patio set pieces (drawn by src/render/extras/zones/patio.js).
//   fixed colliders: a striped deckchair (frame rails and the seat), a cast-iron boot scraper, a herb
//     trough, a storm lantern (kind 'patio', GROUPS.world);
//   loose bodies (debris group): a yard broom leaning on the wall and a pair of green wellingtons standing
//     by the back door. Rotor wash tips them; they clatter when they fall. Recorded as pbroom, pwelly1/2.
// The deckchair sling and the lantern flame are render-only (they read the air through ctx.airAt).

const fy = ROOM.floorY;
export const WALL_Z = ROOM.minZ - WALL_T;      // outer face of the house wall (-1.62)

// Deckchair. Local frame: lateral x, forward u (toward the garden = world -z), height above the ground.
export const CHAIR = {
  x: -0.52, z: -2.17, yaw: 0.0,
  top: [-0.42, 0.8], foot: [-0.08, 0.0],        // main frame: head rail down to the ground under the seat
  hinge: [-0.2, 0.27],                          // where the seat frame hangs from the main frame
  front: [0.4, 0.34],                           // the seat frame's front rail
  legFoot: [0.53, 0.0],                         // front legs meet the ground
  railX: 0.25, seatX: 0.205, legX: 0.275, slingW: 0.43,
};
export const chairWorld = (lx, u, y) => {
  const c = Math.cos(CHAIR.yaw), s = Math.sin(CHAIR.yaw);
  // forward u points to -z; yaw turns about +y
  return [CHAIR.x + lx * c - (-u) * s, fy + y, CHAIR.z + lx * s + (-u) * c];
};

export const TROUGH = { x: 0.1, z: -1.735, hx: 0.31, hy: 0.075, hz: 0.085 };
export const SCRAPER = { x: 1.74, z: -1.74 };
export const LANTERN_AT = { x: 2.285, z: -1.82, r: 0.055, h: 0.3 };

// Loose things. Boot frame: y up from the sole, +z toward the toe; the body origin sits at BOOT_C.
export const BOOT_C = { x: 0, y: 0.17, z: 0.07 };
export const WELLIES = [
  { id: 'pwelly1', x: 0.485, z: -1.735, yaw: Math.PI + 0.05, mass: 0.045 },
  { id: 'pwelly2', x: 0.655, z: -1.75, yaw: Math.PI - 0.1, mass: 0.045 },
];
export const BROOM = { x: -1.6, zFoot: -1.787, length: 1.3, handleR: 0.012, headHalf: [0.15, 0.045, 0.026], lean: 0.115, com: 0.5, mass: 0.07 };

const RHO = 1.2;
const WASH_GAIN = 30;

export function create(sim, lite) {
  const world = sim.world;
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dv = new THREE.Vector3();
  const add = (desc, x, y, z, material, rot) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.1);
    if (rot) desc.setRotation(rot);
    const c = world.createCollider(desc);
    sim.register(c, { kind: 'patio', material });
    return c;
  };
  const cyl = (r, hh, x, y, z, material) => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, material);
  const box = (hx, hy, hz, x, y, z, material, rot) => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, material, rot);
  // A rail between two world points.
  const rail = (a, b, r, material = 'wood') => {
    dv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dv.length();
    q.setFromUnitVectors(up, dv.normalize());
    return add(RAPIER.ColliderDesc.capsule(Math.max(0.001, len / 2 - r), r), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, material, { x: q.x, y: q.y, z: q.z, w: q.w });
  };

  // ---------------------------------------------------------------- deckchair
  {
    const C = CHAIR, W = (lx, p) => chairWorld(lx, p[0], p[1]);
    for (const sx of [-1, 1]) {
      rail(W(sx * C.railX, C.top), W(sx * C.railX, C.foot), 0.014);                  // main frame
      rail(W(sx * C.seatX, C.hinge), W(sx * C.seatX, C.front), 0.013);               // seat frame
      rail(W(sx * C.legX, C.front), W(sx * C.legX, C.legFoot), 0.014);               // front legs
    }
    // The canvas seat: a thin tilted slab so a helicopter can land on the sling.
    const a = chairWorld(0, C.top[0], C.top[1] - 0.02), b = chairWorld(0, C.front[0], C.front[1] + 0.02);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.1, (a[2] + b[2]) / 2];
    dv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dv.length();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dv.normalize());
    box(C.slingW / 2, 0.004, len / 2 * 0.9, mid[0], mid[1], mid[2], 'cloth', { x: q.x, y: q.y, z: q.z, w: q.w });
  }

  // ---------------------------------------------------------------- herb trough, scraper, lantern
  {
    const T = TROUGH;
    box(T.hx, T.hy, T.hz, T.x, fy + 0.03 + T.hy, T.z, 'wood');
    box(T.hx - 0.02, 0.03, T.hz - 0.01, T.x, fy + 0.03, T.z, 'wood');                 // feet
    const S = SCRAPER;
    box(0.15, 0.02, 0.13, S.x, fy + 0.02, S.z, 'metal');                              // frame with the blade
    box(0.15, 0.1, 0.012, S.x, fy + 0.1, S.z - 0.01, 'metal');
    for (const sx of [-1, 1]) box(0.012, 0.15, 0.1, S.x + sx * 0.15, fy + 0.16, S.z, 'metal');
    const L = LANTERN_AT;
    cyl(L.r, L.h / 2, L.x, fy + L.h / 2, L.z, 'metal');
  }

  // ---------------------------------------------------------------- loose bodies
  const things = [];
  let lastKnock = -1;
  const home = (b, p, rot) => ({ p, rot });
  void home;
  const spawn = (def, desc0, parts, kind, material, extra = {}) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(def.p.x, def.p.y, def.p.z).setRotation(def.q)
      .setLinearDamping(0.06).setAngularDamping(0.3).setCanSleep(true));
    parts.forEach((fn, i) => {
      const desc = fn(RAPIER.ColliderDesc).setFriction(0.75).setRestitution(0.12).setCollisionGroups(GROUPS.debris)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1.0);
      const c = world.createCollider(desc, body);
      sim.register(c, {
        kind: 'prop', material,
        onImpact(imp) {
          if (imp < 0.004 || sim.time < 0.5 || sim.time - lastKnock < 0.08) return;
          const v = body.linvel(), w = body.angvel();
          if (v.x * v.x + v.y * v.y + v.z * v.z < 0.01 && w.x * w.x + w.y * w.y + w.z * w.z < 1) return;
          lastKnock = sim.time;
          const p = body.translation();
          sim.emit('extra', { kind: kind, pos: { x: p.x, y: p.y, z: p.z }, strength: Math.min(1, imp / 0.05) });
        },
      });
      void i;
    });
    const t = { def, body, track: new Track(body), pushed: false, moved: false, ...extra };
    things.push(t);
    return t;
  };

  // Wellies: shaft cylinder plus foot box (loft coordinates minus the body origin BOOT_C).
  const wd = lite ? WELLIES.slice(0, 1) : WELLIES;
  for (const w of wd) {
    const qq = new THREE.Quaternion().setFromAxisAngle(up, w.yaw);
    const def = { id: w.id, p: { x: w.x, y: fy + BOOT_C.y + 0.0006, z: w.z }, q: { x: qq.x, y: qq.y, z: qq.z, w: qq.w } };
    // World position of the heel (boot z = 0) is at w.z, toe toward -z (yaw ~ pi).
    spawn(def, null, [
      (D) => D.cylinder(0.14, 0.057).setTranslation(0, 0.23 - BOOT_C.y, -BOOT_C.z).setMass(w.mass * 0.45),
      (D) => D.cuboid(0.056, 0.045, 0.125).setTranslation(0, 0.045 - BOOT_C.y, 0.11 - BOOT_C.z).setMass(w.mass * 0.55),
    ], 'pBoot', 'rubber', { mass: w.mass, kindTop: 0.2, r: 0.06, h: 0.38 });
  }

  // Broom: the handle and head in a frame whose origin is a point along the handle (BROOM.com from the foot).
  {
    const B = BROOM, c = Math.cos(B.lean), s = Math.sin(B.lean);
    const axis = new THREE.Vector3(0, c, s);         // handle direction (top toward the wall at +z)
    const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), B.lean);
    // Foot point: the bottom of the head sits on the ground, the bristles are nearly vertical.
    const foot = new THREE.Vector3(B.x, fy + 0.008, B.zFoot);
    const o = foot.clone().addScaledVector(axis, B.com);
    const def = { id: 'pbroom', p: { x: o.x, y: o.y, z: o.z }, q: { x: qq.x, y: qq.y, z: qq.z, w: qq.w } };
    const span = B.length - B.com;                    // handle length above the origin
    spawn(def, null, [
      (D) => D.capsule(Math.max(0.01, (B.length - 0.1) / 2 - B.handleR), B.handleR).setTranslation(0, (B.length - 0.1) / 2 - B.com + 0.1, 0).setMass(B.mass * 0.35),
      (D) => D.cuboid(B.headHalf[0], 0.07, B.headHalf[2]).setTranslation(0, 0.07 - B.com, 0).setMass(B.mass * 0.65),
    ], 'pBroom', 'wood', { broom: true, mass: B.mass, span });
  }

  // ---------------------------------------------------------------- air on the loose things
  const air = { x: 0, y: 0, z: 0 };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), pv = new THREE.Vector3(), a3 = new THREE.Vector3(), ap = new THREE.Vector3(), as = new THREE.Vector3();
  const near = (p) => {
    const A = sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 1.1 && Math.abs(p.z - wk.hub.z) < 1.1) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 1.1 && Math.abs(p.z - wk.hit.z) < 1.1) return true;
    }
    return false;
  };

  return {
    recorded: things.map((t) => ({ id: t.def.id, body: t.body })),
    things,

    applyForces() {
      for (const t of things) {
        const b = t.body;
        if (t.pushed) { b.resetForces(false); b.resetTorques(false); t.pushed = false; }
        const tr = b.translation();
        if (!near(tr) || !sim.props) continue;
        const r = b.rotation();
        _q.set(r.x, r.y, r.z, r.w);
        // Sample the air at a few heights up the thing; the strongest sample pushes it.
        let best = -1;
        for (const oy of t.broom ? [-0.3, -0.1, 0.15, 0.4] : [-0.1, 0.05, 0.2]) {
          _p.set(0, oy, 0).applyQuaternion(_q);
          pv.set(tr.x + _p.x, tr.y + _p.y, tr.z + _p.z);
          sim.props.airAt(pv, a3);
          const m2 = a3.lengthSq();
          if (m2 > best) { best = m2; ap.copy(pv); as.copy(a3); }
        }
        a3.copy(as); pv.copy(ap);
        const lv = b.linvel();
        air.x = a3.x - lv.x; air.y = a3.y - lv.y; air.z = a3.z - lv.z;
        const sp = Math.hypot(air.x, air.y, air.z);
        if (sp < 0.3) continue;
        const area = t.broom ? 0.07 : 0.03;
        let k = 0.5 * RHO * 1.0 * area * sp * WASH_GAIN;
        const fmax = 1.6 * t.mass * 9.81;
        if (k * sp > fmax) k = fmax / sp;
        const ph = sim.time * 9 + t.def.p.x * 31;
        b.addForceAtPoint({ x: air.x * k * (1 + 0.25 * Math.sin(ph)), y: air.y * k * 0.3, z: air.z * k * (1 + 0.25 * Math.cos(ph * 1.3)) }, { x: pv.x, y: pv.y, z: pv.z }, true);
        t.pushed = true;
      }
    },

    afterStep() {
      for (const t of things) if (!t.body.isSleeping() || t.moved) { t.track.capture(t.body); t.moved = !t.body.isSleeping(); }
    },

    reset() {
      for (const t of things) {
        const b = t.body;
        b.setTranslation(t.def.p, true);
        b.setRotation(t.def.q, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        b.resetForces(true); b.resetTorques(true);
        t.track.capture(b); t.track.capture(b);
        t.moved = true;
      }
    },
  };
}
