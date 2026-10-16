import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../../physics.js';
import { ROOM } from '../../layout.js';

// The kitchen's floor edges and walls: a coat rail with a raincoat, scarf and umbrella (left wall), a pulley
// clothes airer with laundry under the ceiling, a cat bed with a tartan blanket, bowls and a jingle ball
// (front wall), a wicker log basket, a boot tray with wellingtons and a yard broom (back-left corner under the window) and a painted step
// stool with a dustpan on the wall (back-right nook beside the door).
// Everything solid gets fixed colliders (attached to the props' fixed body). The cloth, the coat, the
// scarf and the umbrella are soft and have none. The jingle ball is the one loose body: rotor wash rolls it
// about the tiles and its bell rings when it knocks into things. Replayed as 'jball'.

const fy = ROOM.floorY;
export const KR = {
  rail: { x: ROOM.minX, y: 0.62, z0: 0.2, z1: 0.76, hooks: [0.27, 0.38, 0.51, 0.64] },
  airer: { x0: 0.75, x1: 1.75, z: 0.38, y: 1.2, slats: 6, gap: 0.075 },
  bed: { x: 0.12, z: 1.92, r: 0.26 },
  mat: { x: 0.47, z: 1.6, yaw: 0.1 },
  ball: { x: 0.2, z: 1.48, r: 0.03, mass: 0.012 },
  basket: { x: -0.36, z: 1.98, r: 0.19, h: 0.34 },
  tray: { x: -1.5, z: -1.25, hx: 0.17, hz: 0.16, yaw: 0.04 },
  boots: [{ x: -1.58, z: -1.27, yaw: 0.14 }, { x: -1.41, z: -1.24, yaw: -0.1 }],
  broom: { x: -1.17, z: -1.345, lean: 0.112, len: 1.3 },
  stool: { x: 1.93, z: -1.2, yaw: 0.07, h: 0.42 },
};

const RHO = 1.2;

export function create(sim, lite) {
  const world = sim.world;
  const fixed = sim.props && sim.props.fixed;
  const add = (desc, x, y, z, kind, material, rot) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.1);
    if (rot) desc.setRotation(rot);
    const c = fixed ? world.createCollider(desc, fixed) : world.createCollider(desc);
    sim.register(c, { kind, material });
    return c;
  };
  const box = (hx, hy, hz, x, y, z, material = 'wood', rot) => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, 'kitchenRoom', material, rot);
  const cyl = (r, hh, x, y, z, material = 'ceramic') => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, 'kitchenRoom', material);
  const yawQ = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

  // Coat rail.
  const R = KR.rail;
  box(0.03, 0.0425, (R.z1 - R.z0) / 2, R.x + 0.03, R.y, (R.z0 + R.z1) / 2, 'wood');
  for (const z of R.hooks) box(0.03, 0.02, 0.012, R.x + 0.06, R.y + 0.012, z, 'metal');

  // Clothes airer (the rack and its two end frames; the laundry is soft).
  const A = KR.airer, ax = (A.x0 + A.x1) / 2, az = A.z;
  box((A.x1 - A.x0) / 2, 0.035, (A.slats - 1) * A.gap / 2 + 0.03, ax, A.y - 0.01, az, 'wood');

  // Cat bed: a flat base, and a ring of balls for the bolster so a helicopter can settle in the hollow.
  const B = KR.bed;
  cyl(B.r - 0.005, 0.018, B.x, fy + 0.018, B.z, 'cloth');
  const nb = lite ? 10 : 14;
  for (let i = 0; i < nb; i++) {
    const a = i / nb * Math.PI * 2;
    add(RAPIER.ColliderDesc.ball(0.053), B.x + Math.cos(a) * 0.2, fy + 0.066, B.z + Math.sin(a) * 0.2, 'kitchenRoom', 'cloth');
  }
  // Bowls.
  {
    const M = KR.mat, c = Math.cos(M.yaw), s = Math.sin(M.yaw);
    for (const o of [-0.09, 0.09]) cyl(0.062, 0.025, M.x + c * o, fy + 0.025 + 0.006, M.z - s * o, 'ceramic');
  }
  // Log basket.
  const K = KR.basket;
  cyl(K.r - 0.005, K.h / 2 + 0.03, K.x, fy + K.h / 2 + 0.03, K.z, 'wood');

  // Boot tray, boots, broom.
  const Tt = KR.tray;
  box(Tt.hx, 0.015, Tt.hz, Tt.x, fy + 0.015, Tt.z, 'cloth', yawQ(Tt.yaw));
  for (const b of KR.boots) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    cyl(0.058, 0.15, b.x - s * 0.05, fy + 0.03 + 0.15 + 0.03, b.z - 0.05 * c, 'cloth');
    box(0.05, 0.035, 0.12, b.x + s * 0.03, fy + 0.03 + 0.035, b.z + c * 0.03, 'cloth', yawQ(b.yaw));
  }
  {
    const Br = KR.broom, a = Br.lean;
    // Bristles, then the handle leaning back against the wall (rotation about x tilts its top towards -z).
    box(0.15, 0.05, 0.026, Br.x, fy + 0.05, Br.z, 'cloth');
    const q = { x: Math.sin(-a / 2), y: 0, z: 0, w: Math.cos(a / 2) };
    const mid = Br.len / 2 + 0.05;
    box(0.0135, Br.len / 2, 0.0135, Br.x, fy + mid * Math.cos(a), Br.z - mid * Math.sin(a), 'wood', q);
  }

  // Step stool.
  {
    const S = KR.stool, c = Math.cos(S.yaw), s = Math.sin(S.yaw);
    const q = yawQ(S.yaw);
    // local (lx, lz) to world.
    const W = (lx, lz) => [S.x + c * lx + s * lz, S.z - s * lx + c * lz];
    for (const sx of [-0.17, 0.17]) { const [x, z] = W(sx, 0); box(0.011, S.h / 2, 0.14, x, fy + S.h / 2, z, 'wood', q); }
    { const [x, z] = W(0, 0); box(0.19, 0.014, 0.14, x, fy + S.h - 0.014, z, 'wood', q); }
    { const [x, z] = W(0, 0.03); box(0.17, 0.01, 0.1, x, fy + 0.21, z, 'wood', q); }
  }

  // ---------------------------------------------------------------- the jingle ball
  const D = KR.ball;
  const home = { x: D.x, y: fy + D.r + 0.0005, z: D.z };
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z)
    .setLinearDamping(0.12).setAngularDamping(0.25).setCanSleep(true));
  const cdesc = RAPIER.ColliderDesc.ball(D.r).setMass(D.mass).setFriction(0.5).setRestitution(0.55)
    .setCollisionGroups(GROUPS.debris).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.05);
  const collider = world.createCollider(cdesc, body);
  let lastJingle = -1;
  sim.register(collider, {
    kind: 'prop', material: 'wood',
    onImpact(imp) {
      if (imp < 0.0006 || sim.time < 0.5 || sim.time - lastJingle < 0.07) return;
      lastJingle = sim.time;
      const t = body.translation();
      sim.emit('extra', { kind: 'jingleBall', pos: new THREE.Vector3(t.x, t.y, t.z), strength: Math.min(1, imp / 0.01) });
    },
  });
  const ball = { body, track: new Track(body), pushed: false, moved: false };
  const mod = { ball, version: 0 };
  const _a = new THREE.Vector3(), _p = new THREE.Vector3();
  const near = (p) => {
    const A2 = sim.air;
    if (!A2 || A2.calm) return false;
    for (const wk of A2.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 1.0 && Math.abs(p.z - wk.hub.z) < 1.0) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 1.0 && Math.abs(p.z - wk.hit.z) < 1.0) return true;
    }
    return false;
  };

  mod.recorded = [{ id: 'jball', body }];
  mod.applyForces = () => {
    if (ball.pushed) { body.resetForces(false); ball.pushed = false; }
    const t = body.translation();
    if (!near(t) || !sim.props) return;
    _p.set(t.x, t.y, t.z);
    sim.props.airAt(_p, _a);
    const lv = body.linvel();
    const rx = _a.x - lv.x, ry = _a.y - lv.y, rz = _a.z - lv.z;
    const sp = Math.hypot(rx, ry, rz);
    if (sp < 0.3) return;
    // Outwash along the floor is a thin, fast jet: lift the sampled speed a little, with some gusting.
    const gust = 5 * (1 + 0.3 * Math.sin(sim.time * 17) + 0.2 * Math.sin(sim.time * 29 + 1));
    let k = 0.5 * RHO * 0.5 * Math.PI * D.r * D.r * sp * gust;
    const fmax = 2.2 * D.mass * 9.81;
    if (k * sp > fmax) k = fmax / sp;
    body.addForce({ x: rx * k, y: Math.max(0, ry * k * 0.2), z: rz * k }, true);
    ball.pushed = true;
    ball.moved = true;
  };
  mod.afterStep = () => {
    if (!body.isSleeping() || ball.moved) { ball.track.capture(body); ball.moved = !body.isSleeping(); mod.version++; }
  };
  mod.reset = () => {
    body.setTranslation(home, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.resetForces(true); body.resetTorques(true);
    ball.track.capture(body); ball.track.capture(body);
    ball.moved = true; ball.pushed = false;
    mod.version++;
  };
  return mod;
}
