import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../physics.js';
import { ROOM, WALL_T } from '../layout.js';

// Two hanging flower baskets on wrought-iron wall brackets on the house's garden wall, either side of the
// window and the back door. Each basket is a rigid pendulum (moss-lined wire bowl, planting, three chains)
// on a ball joint at its bracket's hook. Solid like the pendant lamp: a rotor that touches one strikes.
// The rotor wash pushes them about (drag sampled at a few points round the planting, so a downwash on one
// side tips the basket), the chains resist twisting, and a hard swing makes the chains creak.

const WALL_Z = ROOM.minZ - WALL_T; // the brick face on the garden side
export const BASKET = {
  wallZ: WALL_Z,
  bracketY: 1.05,  // top bar of the bracket
  reach: 0.3,      // wall face to the hook
  hookDrop: 0.035, // hook eye below the bar: the joint
  chain: 0.33,     // joint to the rim plane
  r: 0.15,         // rim radius (a 30 cm basket)
  depth: 0.13,     // bowl depth below the rim
  mass: 0.3,       // lighter than a real watered basket, so a small rotor can rock it
  list: [
    { id: 'basket1', x: -1.3, seed: 11, yaw: 0.35 },
    { id: 'basket2', x: 2.1, seed: 23, yaw: -0.5 },
  ],
};
// Joint (hook eye) of a basket.
export function basketPivot(b, out = new THREE.Vector3()) {
  return out.set(b.x, BASKET.bracketY - BASKET.hookDrop, BASKET.wallZ - BASKET.reach);
}

const RHO = 1.2;
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _o = new THREE.Vector3(), _w = new THREE.Vector3();
// Points (body frame) where the air is felt: the crown of the planting and four sides of the bowl.
const PROBES = [[0, 0.03, 0], [0.13, -0.03, 0], [-0.13, -0.03, 0], [0, -0.03, 0.13], [0, -0.03, -0.13]];
const PROBE_AREA = [0.03, 0.016, 0.016, 0.016, 0.016]; // m^2 each (the bushy planting and the bowl, ~0.09 m^2)

// Air the rotor column stirs up round itself: drawn in towards it and churned in eddies a few rotor radii
// out. Adds the drawn-in flow to out; returns the eddies' strength (m/s).
function stir(sim, p, out) {
  let eddy = 0;
  for (const wk of sim.air.wakes) {
    if (!wk.active) continue;
    const rx = p.x - wk.hub.x, ry = p.y - wk.hub.y, rz = p.z - wk.hub.z;
    const s = rx * wk.dir.x + ry * wk.dir.y + rz * wk.dir.z;
    if (s < -0.3 || s > wk.len + 0.15) continue;
    const px = rx - wk.dir.x * s, py = ry - wk.dir.y * s, pz = rz - wk.dir.z * s;
    const d = Math.hypot(px, py, pz) + 1e-4, R = wk.radius;
    if (d > R * 6) continue;
    const near = Math.exp(-Math.max(0, d - R) / (1.5 * R)) * (s < 0 ? Math.exp(s / 0.12) : 1);
    const pull = wk.vi * 0.3 * near * Math.min(1, R / d);
    out.x -= px / d * pull; out.y -= py / d * pull; out.z -= pz / d * pull;
    out.addScaledVector(wk.dir, wk.vi * 0.2 * near);
    eddy = Math.max(eddy, wk.vi * 0.8 * near);
  }
  return eddy;
}

export function create(sim, lite) {
  void lite;
  const fixed = sim.props && sim.props.fixed ? sim.props.fixed : sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const B = BASKET;
  const items = [];
  for (const def of B.list) {
    const piv = basketPivot(def);
    const home = new THREE.Vector3(piv.x, piv.y - B.chain, piv.z);
    const homeQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.yaw);
    const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z)
      .setRotation({ x: homeQ.x, y: homeQ.y, z: homeQ.z, w: homeQ.w })
      .setLinearDamping(0.25).setAngularDamping(0.5).setCanSleep(true));
    const it = { def, body, track: null, home, homeQ, pivot: piv, pushed: false, knock: 0, prevSide: 0, creakT: -9, peak: 0 };
    // Planting and bowl: one ball (mass), the chains: a cone up to the hook.
    const ball = RAPIER.ColliderDesc.ball(B.r + 0.01).setTranslation(0, -0.02, 0).setMass(B.mass)
      .setCollisionGroups(GROUPS.world).setFriction(0.8).setRestitution(0.1)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.02);
    const onImpact = (imp) => { it.knock = Math.max(it.knock, imp); };
    sim.register(sim.world.createCollider(ball, body), { kind: 'basket', material: 'plant', onImpact });
    const cone = RAPIER.ColliderDesc.cone(B.chain / 2, B.r * 0.95).setTranslation(0, B.chain / 2, 0).setMass(0.03)
      .setCollisionGroups(GROUPS.world).setFriction(0.4).setRestitution(0.2)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.02);
    sim.register(sim.world.createCollider(cone, body), { kind: 'basket', material: 'metal', onImpact });
    const jd = RAPIER.JointData.spherical({ x: piv.x, y: piv.y, z: piv.z }, { x: 0, y: B.chain, z: 0 });
    sim.world.createImpulseJoint(jd, fixed, body, true);
    it.track = new Track(body);
    items.push(it);
    // The bracket: wall plate and arm (fixed, solid).
    const arm = RAPIER.ColliderDesc.cuboid(0.012, 0.03, B.reach / 2).setTranslation(def.x, B.bracketY - 0.02, B.wallZ - B.reach / 2)
      .setCollisionGroups(GROUPS.world).setFriction(0.5);
    sim.register(sim.world.createCollider(arm, fixed), { kind: 'bracket', material: 'metal' });
    const plate = RAPIER.ColliderDesc.cuboid(0.022, 0.15, 0.008).setTranslation(def.x, B.bracketY - 0.1, B.wallZ - 0.008)
      .setCollisionGroups(GROUPS.world);
    sim.register(sim.world.createCollider(plate, fixed), { kind: 'bracket', material: 'metal' });
  }

  function airNear(p) {
    const air = sim.air;
    if (air.calm) return false;
    for (const wk of air.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 1.0 && Math.abs(p.z - wk.hub.z) < 1.0 && p.y - wk.hub.y < 0.8) return true;
    }
    return false;
  }

  return {
    recorded: items.map((it) => ({ id: it.def.id, body: it.body })),
    items,
    applyForces() {
      for (const it of items) {
        const body = it.body;
        if (it.pushed) { body.resetForces(false); body.resetTorques(false); it.pushed = false; }
        const t = body.translation();
        _p.set(t.x, t.y, t.z);
        const r = body.rotation();
        _q.set(r.x, r.y, r.z, r.w);
        // Three chains resist twisting: restoring torque about the hang axis (and a little damping).
        const tw = 2 * Math.atan2(_q.y, _q.w) - it.def.yaw;
        const twist = Math.atan2(Math.sin(tw), Math.cos(tw));
        const av = body.angvel();
        const asleep = body.isSleeping();
        if (!asleep && (Math.abs(twist) > 0.002 || Math.abs(av.y) > 0.01)) {
          body.addTorque({ x: 0, y: -0.2 * twist - 0.004 * av.y, z: 0 }, true);
          it.pushed = true;
        }
        if (!airNear(_p)) continue;
        const lv = body.linvel();
        let any = false;
        for (let k = 0; k < PROBES.length; k++) {
          const pr = PROBES[k];
          _o.set(pr[0], pr[1], pr[2]).applyQuaternion(_q);
          _w.copy(_p).add(_o);
          sim.props.airAt(_w, _a);
          sim.props.inflow(_w, _a);
          // Rotor wash is gusty: the column and the eddies it sheds round itself buffet the planting.
          const e = Math.max(_a.length() * 0.5, stir(sim, _w, _a));
          _a.x += e * Math.sin(sim.time * 5.2 + k * 1.9 + it.def.seed);
          _a.z += e * Math.cos(sim.time * 4.6 + k * 1.3 + it.def.seed);
          if (_a.lengthSq() < 0.04) continue;
          // Point velocity of the body there (v + w x r).
          _v.set(_a.x - (lv.x + av.y * _o.z - av.z * _o.y), _a.y - (lv.y + av.z * _o.x - av.x * _o.z), _a.z - (lv.z + av.x * _o.y - av.y * _o.x));
          const sp = _v.length();
          _v.multiplyScalar(0.5 * RHO * 1.2 * PROBE_AREA[k] * sp * 1.6); // (a few times strict drag, as the lamp)
          body.addForceAtPoint({ x: _v.x, y: _v.y, z: _v.z }, { x: _w.x, y: _w.y, z: _w.z }, true);
          any = true;
        }
        // A wake landing on the basket itself (the air field stops the column at the first solid thing
        // it meets): the column's momentum pushes on the planting where it lands.
        for (const wk of sim.air.wakes) {
          if (!wk.active || !wk.vg || wk.hit.distanceTo(_p) > B.r + 0.07) continue;
          const g = 1 + 0.45 * Math.sin(sim.time * 5.4 + it.def.seed) * Math.sin(sim.time * 1.3 + 0.5);
          // (Momentum flux of the column, made a few times stronger than strict theory, as the lamp is.)
          const F = RHO * Math.PI * wk.radius * wk.radius * wk.vi * wk.vi * 2.5 * g;
          body.addForceAtPoint({ x: wk.dir.x * F, y: wk.dir.y * F, z: wk.dir.z * F }, { x: wk.hit.x, y: wk.hit.y, z: wk.hit.z }, true);
          any = true;
        }
        if (any) it.pushed = true;
      }
    },
    afterStep() {
      for (const it of items) {
        it.track.capture(it.body);
        // Knocks (a rotor, an airframe, a tea bag): a soft rustle and thump.
        if (it.knock > 0.004) {
          if (sim.time - (it.knockT || -9) > 0.15) {
            it.knockT = sim.time;
            sim.emit('extra', { kind: 'basketKnock', pos: it.track.currP.clone(), strength: Math.min(1, it.knock * 20) });
          }
        }
        it.knock = 0;
        // Creak at each end of a hard swing (the swing turns round: the sideways speed changes sign).
        if (it.body.isSleeping()) continue;
        const lv = it.body.linvel();
        const sp = Math.hypot(lv.x, lv.z);
        it.peak = Math.max(it.peak * 0.995, sp);
        const off = Math.hypot(it.track.currP.x - it.home.x, it.track.currP.z - it.home.z);
        const side = Math.sign((it.track.currP.x - it.home.x) * lv.x + (it.track.currP.z - it.home.z) * lv.z);
        if (side < 0 && it.prevSide > 0 && off > 0.025 && it.peak > 0.12 && sim.time - it.creakT > 0.5) {
          it.creakT = sim.time;
          sim.emit('extra', { kind: 'basketCreak', pos: it.pivot.clone(), strength: Math.min(1, off / 0.1) });
          it.peak *= 0.6;
        }
        if (side !== 0) it.prevSide = side;
      }
    },
    reset() {
      for (const it of items) {
        const b = it.body;
        b.resetForces(false); b.resetTorques(false); it.pushed = false;
        b.setTranslation({ x: it.home.x, y: it.home.y, z: it.home.z }, true);
        b.setRotation({ x: it.homeQ.x, y: it.homeQ.y, z: it.homeQ.z, w: it.homeQ.w }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        it.track.capture(b); it.track.capture(b);
        it.knock = 0; it.peak = 0; it.prevSide = 0;
      }
    },
  };
}
