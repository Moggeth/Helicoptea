import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../../physics.js';
import { ROOM } from '../../layout.js';

// The left flower border (along the left fence, z -2.5..-4.5): fixed colliders for the sweet-pea wigwam's
// bamboo canes, and two loose terracotta flower pots on the lawn edge (one standing, one lying on its
// side) that rotor wash tips and rolls with a clay clunk. Drawn by src/render/extras/zones/bedLeft.js.

const fy = ROOM.floorY;

// Sweet-pea wigwam: seven canes from a ring on the ground to one apex, bound with twine.
export const WIG = { x: -3.0, z: -4.2, r: 0.24, h: 1.02, n: 7, cane: 0.0055 };

// Loose pots (small and light). `lying` pots start on their side.
export const POTS = [
  { id: 'blpot1', x: -2.62, z: -3.55, rb: 0.036, rt: 0.052, h: 0.085, mass: 0.018, yaw: 0.7, lying: false },
  { id: 'blpot2', x: -2.64, z: -2.76, rb: 0.036, rt: 0.052, h: 0.085, mass: 0.018, yaw: 2.2, lying: true },
];

// Home pose of a pot.
function homeOf(d) {
  if (!d.lying) return { x: d.x, y: fy + d.h / 2 + 0.0005, z: d.z, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw) };
  const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw);
  return { x: d.x, y: fy + d.rt + 0.0005, z: d.z, q: qb.multiply(qa) };
}

const RHO = 1.2;
const WASH_GAIN = 28;

export function wigwamCane(i, out = {}) {
  const a = (i / WIG.n) * Math.PI * 2 + 0.3;
  out.bx = WIG.x + Math.cos(a) * WIG.r; out.bz = WIG.z + Math.sin(a) * WIG.r;
  // Canes cross slightly at the top: the apex is a small ring, not a point.
  out.tx = WIG.x + Math.cos(a + Math.PI) * 0.012; out.tz = WIG.z + Math.sin(a + Math.PI) * 0.012;
  out.by = fy; out.ty = fy + WIG.h;
  return out;
}

export function create(sim, lite) {
  const world = sim.world;
  const parent = sim.props && sim.props.fixed ? sim.props.fixed : undefined;

  // ---------------------------------------------------------------- wigwam canes (fixed capsules)
  const cn = {}, up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion();
  for (let i = 0; i < WIG.n; i++) {
    wigwamCane(i, cn);
    d.set(cn.tx - cn.bx, cn.ty - cn.by, cn.tz - cn.bz);
    const len = d.length(); d.divideScalar(len);
    q.setFromUnitVectors(up, d);
    const desc = RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2 - WIG.cane), WIG.cane * 1.2)
      .setTranslation((cn.bx + cn.tx) / 2, (cn.by + cn.ty) / 2, (cn.bz + cn.tz) / 2)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCollisionGroups(GROUPS.world).setFriction(0.5).setRestitution(0.1);
    const c = world.createCollider(desc, parent);
    sim.register(c, { kind: 'bedLeft', material: 'wood' });
  }

  // ---------------------------------------------------------------- loose pots
  const pots = [];
  const defs = lite ? POTS.slice(0, 1) : POTS;
  let lastClunk = -1;
  for (const def of defs) {
    const home = homeOf(def);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z)
      .setRotation({ x: home.q.x, y: home.q.y, z: home.q.z, w: home.q.w })
      .setLinearDamping(0.06).setAngularDamping(0.3).setCanSleep(true));
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      pts.push(Math.cos(a) * def.rb, -def.h / 2, Math.sin(a) * def.rb, Math.cos(a) * def.rt, def.h / 2, Math.sin(a) * def.rt);
    }
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setMass(def.mass).setFriction(0.7).setRestitution(0.14)
      .setCollisionGroups(GROUPS.debris).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1.2);
    const c = world.createCollider(desc, body);
    const pot = { def, body, track: new Track(body), home, pushed: false, moved: false };
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
  const _q = new THREE.Quaternion(), pv = new THREE.Vector3(), a3 = new THREE.Vector3(), _o = new THREE.Vector3();
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
        pv.set(t.x, t.y - 0.02, t.z);
        sim.props.airAt(pv, a3);
        const lv = b.linvel();
        air.x = a3.x - lv.x; air.y = a3.y - lv.y; air.z = a3.z - lv.z;
        const sp = Math.hypot(air.x, air.y, air.z);
        if (sp < 0.3) continue;
        const dd = pot.def, area = (dd.rb + dd.rt) * dd.h;
        let k = 0.5 * RHO * 1.0 * area * sp * WASH_GAIN;
        const fmax = 1.5 * dd.mass * 9.81;
        if (k * sp > fmax) k = fmax / sp;
        const r = b.rotation();
        _o.set(0, dd.h * 0.5, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
        const ph = sim.time * 9 + dd.x * 31;
        b.addForceAtPoint({ x: air.x * k * (1 + 0.25 * Math.sin(ph)), y: air.y * k, z: air.z * k * (1 + 0.25 * Math.cos(ph * 1.3)) },
          { x: t.x + _o.x, y: t.y + _o.y, z: t.z + _o.z }, true);
        pot.pushed = true;
      }
    },

    afterStep() {
      for (const pot of pots) if (!pot.body.isSleeping() || pot.moved) { pot.track.capture(pot.body); pot.moved = !pot.body.isSleeping(); }
    },

    reset() {
      for (const pot of pots) {
        const b = pot.body, h = pot.home;
        b.setTranslation({ x: h.x, y: h.y, z: h.z }, true);
        b.setRotation({ x: h.q.x, y: h.q.y, z: h.q.z, w: h.q.w }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        b.resetForces(true); b.resetTorques(true);
        pot.track.capture(b); pot.track.capture(b);
        pot.moved = true;
      }
    },
  };
}
