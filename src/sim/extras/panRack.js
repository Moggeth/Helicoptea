import * as THREE from 'three';
import { RAPIER, GROUPS, G, Track } from '../physics.js';
import { ROOM } from '../layout.js';

// A wrought-iron pot rack hung on chains from the ceiling in front of the range, with copper pans and a
// ladle on S-hooks. The rack is fixed; each pan is a pendulum on a ball joint at its hook (solid like the
// pendant lamp: a rotor strike on one counts). They swing in rotor wash and when knocked, and clang into
// each other and the rack.

const grp = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
// Like GROUPS.world, but the pans also meet each other and the rack (world never meets world).
const PAN_GROUP = grp(G.WORLD, G.WORLD | G.HELI | G.BAG | G.DEBRIS | G.ROTOR | G.HOSE);

export const RACK = {
  x0: -1.69, x1: -1.41, z0: -0.97, z1: -0.13, y: 1.42,   // the frame (rails along z at x0 and x1)
  bar: 0.006,                                             // round bar radius
  hangers: [[-1.55, -0.86], [-1.55, -0.24]],              // ceiling hooks; two chains from each to the corners
  hook: 0.065,                                            // S-hook: rail to the handle's hanging hole
};

// Hanging things. kind: 'skillet' | 'saucepan' | 'ladle'. r: rim radius, d: depth, hl: handle length,
// face: +1 opening faces the room (+x), -1 faces the range. handle: 'iron' | 'brass'.
export const PANS = [
  { id: 'pan1', kind: 'skillet', rail: 0, z: -0.83, r: 0.115, d: 0.045, hl: 0.16, face: 1, handle: 'iron', mass: 0.34, tint: [1, 1, 1] },
  { id: 'pan2', kind: 'saucepan', rail: 1, z: -0.67, r: 0.08, d: 0.085, hl: 0.15, face: -1, handle: 'iron', mass: 0.26, tint: [1.03, 0.98, 0.96] },
  { id: 'pan3', kind: 'saucepan', rail: 0, z: -0.53, r: 0.095, d: 0.1, hl: 0.16, face: 1, handle: 'brass', mass: 0.3, tint: [0.97, 0.99, 1.02] },
  { id: 'pan4', kind: 'saucepan', rail: 1, z: -0.37, r: 0.1, d: 0.07, hl: 0.165, face: 1, handle: 'iron', mass: 0.3, tint: [1.02, 1.0, 0.97] },
  { id: 'pan5', kind: 'saucepan', rail: 0, z: -0.27, r: 0.065, d: 0.065, hl: 0.12, face: -1, handle: 'brass', mass: 0.18, tint: [0.98, 0.97, 1.0] },
  { id: 'pan6', kind: 'ladle', rail: 1, z: -0.2, r: 0.042, d: 0.035, hl: 0.27, face: 1, handle: 'brass', mass: 0.08, tint: [1, 1, 1] },
];
export const PANS_LITE = ['pan1', 'pan3', 'pan4', 'pan6'];

// Shape of a hanging thing, shared with the renderer. Built in the "upright" pan frame (P): the pan's axis
// along +y (base at y = 0, rim at y = d), the handle reaching out along +x and a little up to its hanging
// hole. M takes P to the body frame: the hole sits on the S-hook just under the rail (body origin, the
// ball joint), and the pan is turned so its centre of mass hangs straight below the hole, as a real one does.
export function panFrame(p) {
  const ladle = p.kind === 'ladle';
  const ang = ladle ? 1.25 : p.kind === 'skillet' ? 0.16 : 0.22;
  const A = ladle ? new THREE.Vector3(p.r * 0.92, p.r * 0.95, 0) : new THREE.Vector3(p.r - 0.004, p.d * (p.kind === 'skillet' ? 0.62 : 0.78), 0);
  const B = A.clone().add(new THREE.Vector3(Math.cos(ang) * p.hl, Math.sin(ang) * p.hl, 0));
  const bodyC = ladle ? new THREE.Vector3(0, p.r * 0.6, 0) : new THREE.Vector3(0, p.d * 0.42, 0);
  const wb = ladle ? 0.55 : 0.8;
  const com = bodyC.clone().multiplyScalar(wb).addScaledVector(A.clone().add(B).multiplyScalar(0.5), 1 - wb);
  const u = com.clone().sub(B);
  const rot = new THREE.Matrix4().makeRotationZ(-Math.PI / 2 - Math.atan2(u.y, u.x));
  const axis = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);
  if (Math.sign(axis.x) !== p.face) rot.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
  const M = rot.clone();
  const hole = B.clone().applyMatrix4(rot);
  M.premultiply(new THREE.Matrix4().makeTranslation(-hole.x, -RACK.hook - hole.y, -hole.z));
  const toBody = (v) => v.clone().applyMatrix4(M);
  // Lowest point (rim and base circles).
  let bottom = 0;
  for (let i = 0; i < 24; i++) {
    const a2 = i / 24 * Math.PI * 2;
    for (const y of ladle ? [0, p.r] : [0, p.d]) {
      const rr = ladle && y === 0 ? 0 : p.r;
      bottom = Math.min(bottom, toBody(new THREE.Vector3(Math.cos(a2) * rr, y, Math.sin(a2) * rr)).y);
    }
  }
  if (ladle) bottom = Math.min(bottom, toBody(new THREE.Vector3(0, 0, 0)).y);
  return { M, A, B, ang, bodyC, centre: toBody(ladle ? new THREE.Vector3(0, p.r * 0.5, 0) : new THREE.Vector3(0, p.d / 2, 0)),
    axis: new THREE.Vector3(0, 1, 0).transformDirection(M), bottom, toBody };
}

const RHO = 1.2;
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _n = new THREE.Vector3();

export function create(sim, lite) {
  const R = RACK, fy = ROOM.floorY; void fy;
  // The rack and the pans' ball joints hang off the props' fixed body (no extra body for a static frame).
  const fixed = sim.props.fixed;
  const mod = { items: [], recorded: [], clangs: 0 };
  // The rack: two rails, two cross bars, and the chains (thin, but solid enough for a rotor to find).
  const add = (desc, x, y, z, rot) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.5).setRestitution(0.2);
    if (rot) desc.setRotation(rot);
    sim.register(sim.world.createCollider(desc, fixed), { kind: 'rack', material: 'metal' });
  };
  const cz = (R.z0 + R.z1) / 2, cx = (R.x0 + R.x1) / 2;
  for (const x of [R.x0, R.x1]) add(RAPIER.ColliderDesc.cuboid(R.bar, R.bar, (R.z1 - R.z0) / 2), x, R.y, cz);
  for (const z of [R.z0, R.z1]) add(RAPIER.ColliderDesc.cuboid((R.x1 - R.x0) / 2, R.bar, R.bar), cx, R.y, z);
  for (const [hx, hz] of R.hangers) {
    for (const x of [R.x0, R.x1]) {
      const z = hz < cz ? R.z0 : R.z1;
      const a = new THREE.Vector3(hx, ROOM.ceilingY, hz), b = new THREE.Vector3(x, R.y, z);
      const d = a.clone().sub(b), len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      const m = a.clone().add(b).multiplyScalar(0.5);
      add(RAPIER.ColliderDesc.capsule(len / 2 - 0.01, 0.004), m.x, m.y, m.z, { x: q.x, y: q.y, z: q.z, w: q.w });
    }
  }

  const list = lite ? PANS.filter((p) => PANS_LITE.includes(p.id)) : PANS;
  for (const p of list) {
    const x = p.rail ? R.x1 : R.x0, y = R.y + R.bar, z = p.z;
    const f = panFrame(p);
    const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setLinearDamping(0.08).setAngularDamping(0.5).setCanSleep(true));
    const info = {
      kind: 'pan', material: 'metal', pan: null,
      onImpact(imp, other) {
        const it = info.pan;
        if (!it || imp < 0.0025 || sim.time - it.lastClang < 0.07) return;
        if (other && other.kind === 'rack' && imp < 0.006) return;
        it.lastClang = sim.time;
        mod.clangs++;
        const t = body.translation();
        const r = body.rotation();
        _p.copy(f.centre).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
        sim.emit('extra', { kind: 'panClang', pos: new THREE.Vector3(t.x + _p.x, t.y + _p.y, t.z + _p.z), strength: Math.min(1, imp / 0.03), size: p.r, ladle: p.kind === 'ladle', other: other ? other.kind : null });
      },
    };
    const col = (desc, lx, ly, lz, mass, rot) => {
      desc.setTranslation(lx, ly, lz).setCollisionGroups(PAN_GROUP).setFriction(0.4).setRestitution(0.3).setMass(mass)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.5);
      if (rot) desc.setRotation(rot);
      sim.register(sim.world.createCollider(desc, body), info);
    };
    // Colliders in the pan's own frame, carried into the body frame.
    const qP = new THREE.Quaternion().setFromRotationMatrix(f.M);
    const place = (desc, local, localQ, mass) => {
      const c = f.toBody(local), q = qP.clone();
      if (localQ) q.multiply(localQ);
      col(desc, c.x, c.y, c.z, mass, { x: q.x, y: q.y, z: q.z, w: q.w });
    };
    if (p.kind === 'ladle') place(RAPIER.ColliderDesc.ball(p.r), new THREE.Vector3(0, p.r * 0.55, 0), null, p.mass * 0.55);
    else place(RAPIER.ColliderDesc.cylinder(p.d / 2, p.r), new THREE.Vector3(0, p.d / 2, 0), null, p.mass * 0.8);
    // The handle, stopping short of the hole so it stays clear of the rail.
    const hA = f.A, hB = f.A.clone().lerp(f.B, 0.85), hl = hA.distanceTo(hB);
    const hq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hB.clone().sub(hA).normalize());
    place(RAPIER.ColliderDesc.capsule(hl / 2, 0.008), hA.clone().add(hB).multiplyScalar(0.5), hq, p.mass * (p.kind === 'ladle' ? 0.45 : 0.2));
    // Settle it exactly: turn the body so its real centre of mass hangs straight under the hook.
    const lc = body.localCom();
    const home = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(lc.x, lc.y, lc.z).normalize(), new THREE.Vector3(0, -1, 0));
    body.setRotation({ x: home.x, y: home.y, z: home.z, w: home.w }, false);
    const jd = RAPIER.JointData.spherical({ x, y, z }, { x: 0, y: 0, z: 0 });
    sim.world.createImpulseJoint(jd, fixed, body, true);
    const it = { def: p, body, track: new Track(body), home: new THREE.Vector3(x, y, z), homeQ: home, lastClang: -1, pushed: false, frame: f,
      area: p.kind === 'ladle' ? 0.006 : Math.PI * p.r * p.r };
    it.homeAxis = it.frame.axis.clone().applyQuaternion(home).setY(0).normalize();
    // Twist stiffness and damping scaled to the pan's moment of inertia about the vertical.
    const I = it.body.mass() * (p.kind === 'ladle' ? 0.03 * 0.03 : p.r * p.r * 0.5);
    it.twistK = I * 4; it.twistC = I * 1.2;
    info.pan = it;
    mod.items.push(it);
    mod.recorded.push({ id: p.id, body });
  }

  // Air: drag on each pan's face from the wash around it, and the inflow above a rotor.
  mod.applyForces = () => {
    const air = sim.air;
    let near = false;
    if (!air.calm) for (const wk of air.wakes) {
      if (!wk.active) continue;
      if (Math.abs(wk.hub.x - cx) < 0.9 && Math.abs(wk.hub.z - cz) < 1.0 && wk.hub.y > 0.3) near = true;
    }
    for (const it of mod.items) {
      if (it.pushed) { it.body.resetForces(false); it.body.resetTorques(false); it.pushed = false; }
      if (!near && it.body.isSleeping()) continue;
      const t = it.body.translation(), r = it.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      // The S-hook seats in its notch: a gentle twist back to the pan's usual heading, so a knocked pan
      // doesn't hang side-on for ever.
      _n.copy(it.frame.axis).applyQuaternion(_q);
      const yaw = Math.atan2(it.homeAxis.z * _n.x - it.homeAxis.x * _n.z, _n.x * it.homeAxis.x + _n.z * it.homeAxis.z);
      const w = it.body.angvel();
      it.body.addTorque({ x: 0, y: -(it.twistK * yaw + it.twistC * w.y), z: 0 }, false);
      it.pushed = true;
      if (!near) continue;
      _p.copy(it.frame.centre).applyQuaternion(_q).add(_v.set(t.x, t.y, t.z));
      sim.props.airAt(_p, _a);
      sim.props.inflow(_p, _a);
      // Close to a spinning rotor the air is anything but steady: the tip vortices and the swirl of the
      // disc buffet whatever hangs beside it, outwards and round with the blades, in gusts.
      for (const wk of air.wakes) {
        if (!wk.active) continue;
        const dx = _p.x - wk.hub.x, dy = _p.y - wk.hub.y, dz = _p.z - wk.hub.z, d = Math.hypot(dx, dy, dz) + 1e-3;
        const reach = wk.radius * 4.5;
        if (d > reach) continue;
        const k = wk.vi * 2.8 * (1 - d / reach) * (0.75 + 0.5 * Math.sin(sim.time * 5.3 + it.def.z * 17) * Math.sin(sim.time * 2.1 + it.def.z * 5));
        const rh = Math.hypot(dx, dz) + 0.02;
        _a.x += (dx / rh * 0.8 - dz / rh * 0.6) * k;
        _a.z += (dz / rh * 0.8 + dx / rh * 0.6) * k;
      }
      if (_a.lengthSq() < 0.04) continue;
      const lv = it.body.linvel();
      _a.x -= lv.x; _a.y -= lv.y; _a.z -= lv.z;
      // A pan is a plate: pressure on its face, a little drag edge-on.
      _n.copy(it.frame.axis).applyQuaternion(_q);
      const vn = _a.dot(_n);
      _f.copy(_n).multiplyScalar(0.5 * RHO * 1.2 * it.area * vn * Math.abs(vn));
      _f.addScaledVector(_a, 0.5 * RHO * 0.25 * it.area * _a.length());
      it.body.addForceAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: _p.x, y: _p.y, z: _p.z }, true);
      it.pushed = true;
    }
  };

  mod.afterStep = () => { for (const it of mod.items) it.track.capture(it.body); };

  mod.reset = () => {
    for (const it of mod.items) {
      it.body.resetForces(false); it.pushed = false;
      it.body.setTranslation({ x: it.home.x, y: it.home.y, z: it.home.z }, true);
      it.body.setRotation({ x: it.homeQ.x, y: it.homeQ.y, z: it.homeQ.z, w: it.homeQ.w }, true);
      it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      it.track.capture(it.body); it.track.capture(it.body);
    }
  };
  return mod;
}
