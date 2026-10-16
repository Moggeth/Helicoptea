import * as THREE from 'three';
import { RAPIER, GROUPS } from '../../physics.js';
import { ROOM } from '../../layout.js';

// The right-hand border and the lawn edge beside it (see src/render/extras/zones/bedRight.js): a green
// water butt on a concrete block stand with a zinc watering can, a wooden cold frame with a propped glass
// lid, a raised vegetable bed (lettuce, carrots, cabbages), a runner-bean wigwam with a bird scarer and a
// slatted compost bin. Everything here is fixed scenery (GROUPS.world, attached to sim.props.fixed), except the
// cold frame's glass lid: a hinged plate (one degree of freedom) resting on a prop stick, driven by the rotor
// air. Blown from below or the side it lifts and clacks back; pressed hard from above it knocks the stick out
// and slams shut (Shift+R props it open again). The scarer's tins on the wigwam are render-only.

const fy = ROOM.floorY;

export const BR = {
  stand: { x: 3.52, z: -2.74, half: 0.22, h: 0.2 },
  butt: { x: 3.52, z: -2.74, r: 0.22, h: 0.74 },
  can: { x: 3.5, z: -2.36, yaw: 0.35 },
  frame: { x0: 3.3, x1: 3.76, z0: -3.78, z1: -3.04, back: 0.3, front: 0.18, lidL: 0.5, alpha0: 0.44 },
  bed: { x0: 2.62, x1: 3.22, z0: -3.74, z1: -2.48, h: 0.15, soil: 0.128 },
  wig: { x: 2.96, z: -4.3, r: 0.27, h: 0.96 },
  compost: { x0: 3.3, x1: 3.78, z0: -4.88, z1: -3.98, h: 0.8 },
};

export function create(sim) {
  const world = sim.world;
  const fixed = sim.props && sim.props.fixed;
  const add = (desc, x, y, z, material, rot) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.1);
    if (rot) desc.setRotation(rot);
    const c = fixed ? world.createCollider(desc, fixed) : world.createCollider(desc);
    sim.register(c, { kind: 'bedRight', material });
    return c;
  };
  const box = (hx, hy, hz, x, y, z, material = 'wood', rot) => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, material, rot);
  const cyl = (r, hh, x, y, z, material = 'tile') => add(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, material);

  // The cold frame's lid: hinge at the back top edge; a is its opening angle above horizontal (negative: it
  // slopes down to the front when shut), propped on the stick at alpha0.
  const FR = BR.frame;
  const closedA = -Math.atan2(FR.back - FR.front, FR.x1 - FR.x0);
  const lid = { a: FR.alpha0, w: 0, propped: true, closedA, hingeY: 0, cz: 0, collider: null, posed: NaN, t: 0, lastKnock: -9 };
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const poseLid = () => {
    if (!lid.collider || Math.abs(lid.posed - lid.a) < 1e-4) return;
    lid.posed = lid.a;
    const a = lid.a;
    _q.setFromEuler(_e.set(0, 0, -a));
    lid.collider.setTranslationWrtParent({ x: FR.x1 - Math.cos(a) * FR.lidL / 2, y: lid.hingeY + Math.sin(a) * FR.lidL / 2, z: lid.cz });
    lid.collider.setRotationWrtParent({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  };

  // Water butt on its block stand, and the watering can.
  {
    const S = BR.stand, B = BR.butt;
    box(S.half, S.h / 2, S.half, S.x, fy + S.h / 2, S.z, 'stone');
    cyl(B.r, B.h / 2, B.x, fy + S.h + B.h / 2, B.z, 'tile');
    const c = BR.can, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    cyl(0.085, 0.115, c.x, fy + 0.115, c.z, 'metal');
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.yaw, Math.PI / 2 - 0.55, 'YXZ'));
    add(RAPIER.ColliderDesc.capsule(0.12, 0.012), c.x - cy * 0.17, fy + 0.2, c.z + sy * 0.17, 'metal', { x: q.x, y: q.y, z: q.z, w: q.w });
  }

  // Cold frame: four boards (the side boards are stepped to the average height) and the propped lid.
  {
    const F = BR.frame, cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2, hx = (F.x1 - F.x0) / 2, hz = (F.z1 - F.z0) / 2;
    const mid = (F.back + F.front) / 2;
    box(0.011, F.back / 2, hz, F.x1 - 0.011, fy + F.back / 2, cz);
    box(0.011, F.front / 2, hz, F.x0 + 0.011, fy + F.front / 2, cz);
    for (const z of [F.z0 + 0.011, F.z1 - 0.011]) box(hx, mid / 2, 0.011, cx, fy + mid / 2, z);
    // The lid at rest, held up by the prop stick.
    const hingeY = fy + F.back + 0.012, w = (F.z1 - F.z0) + 0.02;
    lid.hingeY = hingeY; lid.cz = cz;
    lid.collider = box(F.lidL / 2, 0.012, w / 2, 0, 0, 0, 'glass');
    poseLid();
  }

  // Raised bed: sleeper boards round a soil fill, and the cabbage heads.
  {
    const b = BR.bed, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    box((b.x1 - b.x0) / 2, b.soil / 2, (b.z1 - b.z0) / 2, cx, fy + b.soil / 2, cz, 'stone');
    box(0.02, b.h / 2, (b.z1 - b.z0) / 2 + 0.02, b.x0 - 0.0, fy + b.h / 2, cz);
    box(0.02, b.h / 2, (b.z1 - b.z0) / 2 + 0.02, b.x1 + 0.0, fy + b.h / 2, cz);
    box((b.x1 - b.x0) / 2, b.h / 2, 0.02, cx, fy + b.h / 2, b.z0);
    box((b.x1 - b.x0) / 2, b.h / 2, 0.02, cx, fy + b.h / 2, b.z1);
    for (const z of [-2.78, -3.12, -3.46]) add(RAPIER.ColliderDesc.ball(0.075), 3.06, fy + b.soil + 0.07, z, 'plant');
  }

  // Bean wigwam: six canes leaning to the apex and the scarer's pole above it.
  {
    const W = BR.wig, top = fy + W.h;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.2, bx = W.x + Math.cos(a) * W.r, bz = W.z + Math.sin(a) * W.r;
      const mx = (bx + W.x) / 2, mz = (bz + W.z) / 2, my = (fy + top) / 2;
      const dx = W.x - bx, dy = top - fy, dz = W.z - bz, len = Math.hypot(dx, dy, dz);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
      add(RAPIER.ColliderDesc.capsule(len / 2 - 0.012, 0.012), mx, my, mz, 'wood', { x: q.x, y: q.y, z: q.z, w: q.w });
    }
    add(RAPIER.ColliderDesc.capsule(0.12, 0.007), W.x, top + 0.1, W.z, 'wood');
  }

  // Compost bin: posts, slatted walls (one solid box each), and the heap.
  {
    const C = BR.compost, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2, hx = (C.x1 - C.x0) / 2, hz = (C.z1 - C.z0) / 2;
    box(0.012, C.h / 2, hz, C.x1 - 0.012, fy + C.h / 2, cz);
    for (const z of [C.z0 + 0.012, C.z1 - 0.012]) box(hx, C.h / 2, 0.012, cx, fy + C.h / 2, z);
    box(0.012, 0.25, hz, C.x0 + 0.012, fy + 0.25, cz);
    box(hx - 0.02, 0.28, hz - 0.02, cx, fy + 0.28, cz, 'stone');
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.35, 0.06, 'YXZ'));
    box(0.27, 0.012, 0.2, C.x1 - 0.3, fy + C.h + 0.03, C.z0 + 0.3, 'wood', { x: q.x, y: q.y, z: q.z, w: q.w });
  }

  // ---- the lid's hinge dynamics
  const air = new THREE.Vector3(), air2 = new THREE.Vector3(), probe = new THREE.Vector3(), nrm = new THREE.Vector3();
  const wakeNear = (x, z, r) => {
    const A = sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(wk.hub.x - x) < r && Math.abs(wk.hub.z - z) < r) return true;
      if (wk.vg && Math.abs(wk.hit.x - x) < r && Math.abs(wk.hit.z - z) < r) return true;
    }
    return false;
  };
  const GAIN = 28 * 0.1;                       // heavy glass: air load per unit mass, with the outwash boost
  function stepLid(dt) {
    lid.t += dt;
    const L = FR.lidL, restA = lid.propped ? FR.alpha0 : closedA;
    const mx = FR.x1 - Math.cos(lid.a) * L / 2, my = lid.hingeY + Math.sin(lid.a) * L / 2;
    let vn = 0;
    if (sim.props && wakeNear(mx, lid.cz, 1.0)) {
      // The wake stops at the glass, so sample just either side of it and take the stronger side.
      nrm.set(Math.sin(lid.a), Math.cos(lid.a), 0);
      probe.set(mx + nrm.x * 0.035, my + nrm.y * 0.035, lid.cz); sim.props.airAt(probe, air);
      probe.set(mx - nrm.x * 0.035, my - nrm.y * 0.035, lid.cz); sim.props.airAt(probe, air2);
      const a = air.lengthSq() >= air2.lengthSq() ? air : air2;
      vn = a.dot(nrm);
      if (lid.propped && vn < -2.2 && lid.t - lid.lastKnock > 0.5) {      // hammered from above: the stick goes
        lid.propped = false; lid.lastKnock = lid.t;
        sim.emit('extra', { kind: 'bedStick', pos: { x: mx, y: my, z: lid.cz }, strength: Math.min(1, -vn / 4) });
      }
    }
    if (!wakeNear(mx, lid.cz, 1.0) && Math.abs(lid.w) < 1e-3 && Math.abs(lid.a - (lid.propped ? FR.alpha0 : closedA)) < 1e-4) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) {
      const acc = 3 / (2 * L) * (GAIN * vn * Math.abs(vn) - 9.81 * Math.cos(lid.a)) - 1.4 * lid.w;
      lid.w += acc * h; lid.a += lid.w * h;
      const floor = lid.propped ? FR.alpha0 : closedA;
      if (lid.a < floor) {
        const hit = -lid.w;
        lid.a = floor; lid.w = hit * (lid.propped ? 0.28 : 0.22);
        if (hit > 0.6) sim.emit('extra', { kind: 'bedClack', pos: { x: mx, y: my, z: lid.cz }, strength: Math.min(1, hit / 3.5) });
      } else if (lid.a > 1.38) { lid.a = 1.38; lid.w = -lid.w * 0.3; }
    }
    poseLid();
  }

  return {
    lid,
    applyForces(dt) { stepLid(dt); },
    reset() { lid.a = FR.alpha0; lid.w = 0; lid.propped = true; poseLid(); },
  };
}
