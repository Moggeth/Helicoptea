import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from './physics.js';
import { CFG } from '../config.js';
import { stepCollective, hookedMass } from './collective.js';

// Skycrane tanker (S-64 Air-Crane style). Body frame as the other aircraft: nose towards -Z, right +X,
// up +Y, origin at the dry centre of mass. One six-blade main rotor whose thrust vector tilts with the
// cyclic (moments from the thrust line and the hub), a four-blade tail rotor on the left of the tail
// pylon that pushes sideways against the main rotor's torque, a belly tank with slosh and analog belly
// doors, and a snorkel hose made of real rigid segments that hangs, swings, drags and collides. The
// pump only moves liquid while the intake is actually under a surface.
const B = (k) => ({ name: `blade${k}`, pos: [0, 0, 0], half: [0.05, 0.0016, 0.004], mass: 0.0012, collide: false, blade: { rotor: 0, k } });
export const SKYCRANE_PARTS = [
  { name: 'cockpit', pos: [0, 0.004, -0.067], half: [0.0135, 0.015, 0.0165], mass: 0.014, collide: true },
  { name: 'spine', pos: [0, 0.013, -0.004], half: [0.0085, 0.0085, 0.05], mass: 0.042, collide: true },
  { name: 'engines', pos: [0, 0.029, 0.008], half: [0.014, 0.008, 0.026], mass: 0.016, collide: true },
  { name: 'tailBoom', pos: [0, 0.024, 0.085], half: [0.005, 0.009, 0.035], mass: 0.008, collide: true },
  { name: 'tailPylon', pos: [0, 0.04, 0.123], half: [0.0035, 0.016, 0.009], mass: 0.004, collide: true },
  { name: 'tank', pos: [0, -0.0155, -0.002], half: [0.0165, 0.0105, 0.0315], mass: 0.012, collide: true },
  { name: 'gearNL', pos: [-0.009, -0.034, -0.062], half: [0.0028, 0.007, 0.0045], mass: 0.0015, collide: true, gear: true },
  { name: 'gearNR', pos: [0.009, -0.034, -0.062], half: [0.0028, 0.007, 0.0045], mass: 0.0015, collide: true, gear: true },
  { name: 'gearML', pos: [-0.034, -0.034, 0.032], half: [0.0035, 0.007, 0.006], mass: 0.002, collide: true, gear: true },
  { name: 'gearMR', pos: [0.034, -0.034, 0.032], half: [0.0035, 0.007, 0.006], mass: 0.002, collide: true, gear: true },
  B(0), B(1), B(2), B(3), B(4), B(5),
];
export const SKYCRANE_MASS = SKYCRANE_PARTS.reduce((s, p) => s + p.mass, 0);
const BLADE_SPAN = 0.05;

const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3(), _vh = new THREE.Vector3();
const _ax = new THREE.Vector3(), _F = new THREE.Vector3(), _Ft = new THREE.Vector3(), _hub = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _tb = new THREE.Vector3(), _wb = new THREE.Vector3(), _pt = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- tank (body frame)
const T = CFG.skycrane.tank;
const TANK_AREA = 4 * T.half[0] * T.half[2];
export const TANK_CAPACITY = TANK_AREA * 2 * T.half[1];
const TANK_FLOOR = T.center[1] - T.half[1];
const densityOf = (milk) => 1000 + (CFG.milk.density - 1000) * milk;

// ---------------------------------------------------------------- snorkel hose
// Rigid ball segments joined by rope links (they go slack, never stretch), hung from the tank. The reel
// changes the link length. Segments collide with the world and the cargo but not with the airframe.
class Hose {
  constructor(heli) {
    const H = CFG.skycrane.hose;
    this.heli = heli;
    this.sim = heli.sim;
    this.length = H.startLength;
    this.appliedLength = this.length;
    this.n = H.segments;
    this.segs = [];
    this.joints = [];
    this.anchorWorld = new THREE.Vector3();
    this.headWorld = new THREE.Vector3();
    this.submerged = null;     // vessel the intake is under the surface of
    this.depth = 0;
    const world = this.sim.world;
    heli.updateCached();
    this.anchorWorld.set(...H.anchor).applyQuaternion(heli.quat).add(heli.pos);
    const segLen = this.length / this.n;
    // Lay it out hanging down, then along the ground towards the nose where it meets the pad.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(heli.quat);
    const floorY = heli.pos.y - CFG.skycrane.gearDrop + H.headRadius + 0.0005;
    const p = this.anchorWorld.clone();
    for (let i = 0; i < this.n; i++) {
      const head = i === this.n - 1;
      const drop = Math.min(segLen * 0.98, Math.max(0, p.y - floorY));
      p.y -= drop;
      p.addScaledVector(fwd, Math.sqrt(Math.max(0, (segLen * 0.98) ** 2 - drop * drop)));
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
        .setCanSleep(false).setCcdEnabled(true).setLinearDamping(0.4).setAngularDamping(1.5));
      const r = head ? H.headRadius : H.radius;
      const c = world.createCollider(RAPIER.ColliderDesc.ball(r).setMass(head ? H.headMass : H.segMass).setFriction(0.8).setRestitution(0.05)
        .setCollisionGroups(GROUPS.hose), body);
      this.sim.register(c, { kind: 'hose', material: 'rubber' });
      this.segs.push({ body, collider: c, pos: p.clone(), vel: new THREE.Vector3(), track: new Track(body), r, mass: head ? H.headMass : H.segMass });
    }
    this.link(segLen);
  }

  link(segLen) {
    const world = this.sim.world;
    for (const j of this.joints) if (world.getImpulseJoint(j.handle)) world.removeImpulseJoint(j, true);
    this.joints.length = 0;
    const a = CFG.skycrane.hose.anchor;
    this.joints.push(world.createImpulseJoint(RAPIER.JointData.rope(segLen, { x: a[0], y: a[1], z: a[2] }, { x: 0, y: 0, z: 0 }), this.heli.body, this.segs[0].body, true));
    for (let i = 1; i < this.n; i++) {
      this.joints.push(world.createImpulseJoint(RAPIER.JointData.rope(segLen, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), this.segs[i - 1].body, this.segs[i].body, true));
    }
    this.appliedLength = segLen * this.n;
  }

  reel(rate, dt) {
    const H = CFG.skycrane.hose;
    if (rate) this.length = clamp(this.length + rate * H.reelSpeed * dt, H.minLength, H.maxLength);
    // Re-rig the links when the reel has moved more than a millimetre (about 30 times a second at most).
    if (Math.abs(this.length - this.appliedLength) > 0.001 && this.sim.stepCount % 8 === 0) this.link(this.length / this.n);
  }

  // Air and liquid drag on each segment; returns the vessel the intake is in (if under its surface).
  applyForces(dt, vessels) {
    const air = this.sim.air;
    this.anchorWorld.set(...CFG.skycrane.hose.anchor).applyQuaternion(this.heli.quat).add(this.heli.pos);
    this.submerged = null; this.depth = 0;
    for (let i = 0; i < this.n; i++) {
      const s = this.segs[i];
      const t = s.body.translation(), v = s.body.linvel();
      s.pos.set(t.x, t.y, t.z); s.vel.set(v.x, v.y, v.z);
      s.body.resetForces(true);
      let wet = null;
      for (const ves of vessels) {
        const dx = s.pos.x - ves.x, dz = s.pos.z - ves.z;
        if (dx * dx + dz * dz < ves.rIn * ves.rIn && s.pos.y < ves.waterY && s.pos.y > ves.floorY - 0.003) { wet = ves; break; }
      }
      // Velocity relative to the air (rotor wash blows the hose about) or to the liquid.
      if (!wet && air.near(s.pos)) air.sample(s.pos.x, s.pos.y, s.pos.z, _a); else _a.set(0, 0, 0);
      _b.copy(s.vel).sub(_a);
      const sp = _b.length();
      const area = 2 * s.r * 0.018;
      const k = wet ? (0.02 + 0.5 * 1030 * 1.0 * area * sp) * 0.5 : 0.5 * 1.2 * 1.1 * area * sp + 0.0004;
      _F.copy(_b).multiplyScalar(-(s.mass / dt) * (1 - Math.exp(-k * dt / s.mass)));
      if (wet) _F.y += densityOf(wet.milk) * CFG.physics.gravity * (4 / 3) * Math.PI * s.r ** 3; // buoyancy
      s.body.addForce({ x: _F.x, y: _F.y, z: _F.z }, true);
      if (i === this.n - 1) {
        this.headWorld.copy(s.pos);
        if (wet) { this.submerged = wet; this.depth = wet.waterY - s.pos.y; }
      }
    }
    this.feedback(dt);
  }

  // Feedback events shared with the other cargo: a slack hose snapping taut is a 'snatch'; hose dragged
  // across a surface 'scrape's.
  feedback(dt) {
    const sim = this.sim, head = this.segs[this.n - 1];
    const d = this.anchorWorld.distanceTo(head.pos);
    const taut = d > this.length * 0.96;
    if (taut && this.wasSlack) {
      _c.copy(head.pos).sub(this.anchorWorld).normalize();
      const rel = _d.copy(head.vel).sub(this.heli.vel).dot(_c);
      if (rel > 0.12) sim.emit('snatch', { pos: head.pos.clone(), speed: rel, mass: CFG.skycrane.hose.headMass + (this.n - 1) * CFG.skycrane.hose.segMass, hose: true });
    }
    if (d < this.length * 0.93) this.wasSlack = true; else if (taut) this.wasSlack = false;
    this.scrapeT = (this.scrapeT || 0) + dt;
    if (this.scrapeT > 0.12) {
      for (const s of this.segs) {
        const hs = Math.hypot(s.vel.x, s.vel.z);
        if (hs > 0.08 && Math.abs(s.vel.y) < 0.05 && s.pos.y < s.r + 0.0025 && s.pos.y > -0.01) {
          this.scrapeT = 0;
          sim.emit('scrape', { pos: s.pos.clone(), speed: hs * 0.5, hose: true });
          break;
        }
      }
    }
  }

  afterStep() { for (const s of this.segs) s.track.capture(s.body); }

  // Interpolated centres, anchor first (for the tube mesh).
  sample(alpha, anchor, out) {
    out[0] = anchor.x; out[1] = anchor.y; out[2] = anchor.z;
    for (let i = 0; i < this.n; i++) {
      this.segs[i].track.sample(alpha, _pt);
      out[(i + 1) * 3] = _pt.x; out[(i + 1) * 3 + 1] = _pt.y; out[(i + 1) * 3 + 2] = _pt.z;
    }
    return out;
  }

  destroy() {
    const world = this.sim.world;
    for (const j of this.joints) if (world.getImpulseJoint(j.handle)) world.removeImpulseJoint(j, true);
    for (const s of this.segs) { this.sim.unregister(s.collider); world.removeRigidBody(s.body); }
    this.segs.length = 0;
  }
}

// ---------------------------------------------------------------- aircraft
export class Skycrane {
  constructor(sim, pos, yaw) {
    this.sim = sim;
    const C = CFG.skycrane;
    this.type = 'skycrane';
    const self = this;
    this.def = {
      id: 'skycrane', name: 'Skycrane', parts: SKYCRANE_PARTS, hooks: C.hooks,
      rotorRadius: C.rotorRadius, gearDrop: C.gearDrop, thrustToWeight: C.thrustToWeight,
      impactDv: C.impactDv, explosionImpulse: C.explosionImpulse, scale: 1.7,
      get mass() { return SKYCRANE_MASS + self.tankMass; }, // impacts and HUD see the milk aboard
    };
    const world = sim.world;
    const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setAdditionalMassProperties(SKYCRANE_MASS, { x: 0, y: 0, z: 0 }, { x: C.inertia[0], y: C.inertia[1], z: C.inertia[2] }, { x: 0, y: 0, z: 0, w: 1 });
    this.body = world.createRigidBody(desc);
    this.colliders = [];
    for (const p of SKYCRANE_PARTS) {
      if (!p.collide) continue;
      const cd = RAPIER.ColliderDesc.cuboid(p.half[0], p.half[1], p.half[2])
        .setTranslation(p.pos[0], p.pos[1], p.pos[2])
        .setDensity(0)
        .setFriction(p.gear ? 0.7 : 0.4)
        .setRestitution(p.gear ? 0.05 : 0.08)
        .setCollisionGroups(GROUPS.heli)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(0.012);
      const c = world.createCollider(cd, this.body);
      sim.register(c, { kind: 'heli', part: p.name });
      this.colliders.push(c);
    }
    // Rotor sensors: the main disc, and the tail rotor's disc (a tail strike is a rotor strike).
    const h = C.hub, th = C.tailHub;
    const main = world.createCollider(RAPIER.ColliderDesc.cylinder(0.005, C.rotorRadius).setTranslation(h[0], h[1], h[2])
      .setSensor(true).setDensity(0).setCollisionGroups(GROUPS.rotor), this.body);
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const tail = world.createCollider(RAPIER.ColliderDesc.cylinder(0.003, C.tailRadius).setTranslation(th[0], th[1], th[2])
      .setRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w }).setSensor(true).setDensity(0).setCollisionGroups(GROUPS.rotor), this.body);
    sim.register(main, { kind: 'rotor', rotorIndex: 0 });
    sim.register(tail, { kind: 'rotor', rotorIndex: 1 });
    this.rotors = [main, tail];
    this.rotor = main;

    this.track = new Track(this.body);
    this.collective = C.idleCollective;
    this.tLag = 0;
    this.tilt = [0, 0];             // lagged disc tilt: [pitch (+ = forward), roll (+ = right)], rad
    this.tailT = 0;                 // lagged tail rotor thrust (N, + pushes the tail to the right)
    this.cmdPitch = 0; this.cmdRoll = 0;
    this.rotorT = [0];
    this.rotorGround = [1.2];
    this.thrust = 0;
    this.thrustFrac = 0;
    this.rotorSpeed = 0.82;
    this.rotorPhase = Math.random() * 6.28;
    this.tailPhase = 0;
    this.integ = 0;
    this.trim = [0, 0];
    this.velInt = [0, 0];            // assist: integrated hands-off drift (m)
    this.discTrim = [0, 0];
    this.yawInteg = 0;
    this.groundDist = 1;
    this.skidClearance = 1;
    this.grounded = true;
    this.load = 0;
    this.rotorContact = 0;
    this.lastAssist = null;
    this.hookWorlds = C.hooks.map(() => new THREE.Vector3());
    this.hookWorld = this.hookWorlds[0];
    this.hubWorlds = [new THREE.Vector3()];
    this.up = new THREE.Vector3(0, 1, 0);
    this.vel = new THREE.Vector3();
    this.pos = new THREE.Vector3().copy(pos);
    this.quat = q.clone();
    this.ctlEcho = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.mix = { pitch: 0, roll: 0, yaw: 0 };
    this.predVel = new THREE.Vector3();
    this.impactAcc = 0;
    // Tank and its systems.
    this.tank = { vol: 0, milk: 1, brew: 0, fillH: 0, doors: 0, doorCmd: 0, pump: 0, pumping: false, flowIn: 0, flowOut: 0,
      salvo: false, auto: null, xs: new THREE.Vector3(), vs: new THREE.Vector3(), surfN: new THREE.Vector3(0, 1, 0), gFelt: CFG.physics.gravity,
      applied: { m: -1, y: 0 }, capacity: TANK_CAPACITY };
    this.spread = { u: new THREE.Vector3(), v: new THREE.Vector3() };
    this.updateCached();
    this.tank.xs.copy(this.pos);
    this.hose = new Hose(this);
  }

  get tankMass() { return this.tank ? this.tank.vol * densityOf(this.tank.milk) : 0; }

  updateCached() {
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(v.x, v.y, v.z);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    const C = CFG.skycrane;
    for (let i = 0; i < C.hooks.length; i++) this.hookWorlds[i].set(...C.hooks[i]).applyQuaternion(this.quat).add(this.pos);
    this.hubWorlds[0].set(...C.hub).applyQuaternion(this.quat).add(this.pos);
  }

  heading() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    return Math.atan2(-_fwd.x, -_fwd.z);
  }

  phaseOf() { return this.rotorPhase; }

  bladePose(part) {
    const h = CFG.skycrane.hub;
    const a = this.rotorPhase + part.blade.k * Math.PI / 3;
    return {
      pos: new THREE.Vector3(h[0] + Math.cos(a) * BLADE_SPAN, h[1], h[2] - Math.sin(a) * BLADE_SPAN),
      quat: new THREE.Quaternion().setFromAxisAngle(Y, a),
      spin: 1,
    };
  }

  local(x, y, z, out) { return out.set(x, y, z).applyQuaternion(this.quat).add(this.pos); }
  pointVel(p, out, w) { return out.copy(p).sub(this.pos).cross(w).negate().add(this.vel); }

  // ctl: { pitch, roll, yaw, collective } in [-1, 1], plus tank controls: doors [0, 1], pump [0, 1], reel [-1, 1].
  applyForces(dt, ctl, assist) {
    const C = CFG.skycrane, A = C.assist;
    const body = this.body;
    this.updateCached();
    const q = _q.copy(this.quat);
    _qi.copy(q).invert();
    const up = this.up;
    const vel = _v.copy(this.vel);
    const av = body.angvel();
    const wWorld = _w.set(av.x, av.y, av.z);
    const wb = _wb.copy(wWorld).applyQuaternion(_qi);
    const g = CFG.physics.gravity;
    const dryWeight = SKYCRANE_MASS * g;
    const mass = SKYCRANE_MASS + this.tankMass;
    const Tmax = C.thrustToWeight * dryWeight;
    this.ctlEcho.pitch = ctl.pitch; this.ctlEcho.roll = ctl.roll; this.ctlEcho.yaw = ctl.yaw; this.ctlEcho.collective = ctl.collective;
    body.resetForces(true);
    body.resetTorques(true);

    // Ground probes: one under the hub (height over what's below) and one under the CG (landed state).
    const hp0 = this.hubWorlds[0];
    const hit = this.sim.world.castRay(new RAPIER.Ray({ x: hp0.x, y: hp0.y, z: hp0.z }, { x: 0, y: -1, z: 0 }), 1.2, true, undefined, GROUPS.queryWorld, undefined, body);
    this.rotorGround[0] = hit ? hit.timeOfImpact : 1.2;
    const cg = this.sim.world.castRay(new RAPIER.Ray({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, { x: 0, y: -1, z: 0 }), 1.2, true, undefined, GROUPS.queryWorld, undefined, body);
    const cgDist = cg ? cg.timeOfImpact : 1.2;
    this.groundDist = this.rotorGround[0];
    this.skidClearance = cgDist - C.gearDrop * Math.max(up.y, 0.3);
    this.grounded = this.skidClearance < 0.006 && up.y > 0.85 && Math.abs(vel.y) < 0.15;

    if (this.lastAssist !== assist) {
      if (assist) {
        const cur = this.thrust * Math.max(up.y, 0.5);
        this.integ = this.grounded || this.thrust < 1e-6 ? 0 : clamp(cur / dryWeight - 1, A.integMin, A.integMax);
        this.trim[0] = this.trim[1] = 0;
        _fwd.set(0, 0, -1).applyQuaternion(q); _fwd.y = 0; _fwd.normalize();
        _right.crossVectors(_fwd, Y);
        this.cmdPitch = clamp(Math.atan2(up.dot(_fwd), up.y), -A.maxTilt, A.maxTilt);
        this.cmdRoll = clamp(Math.atan2(up.dot(_right), up.y), -A.maxTilt, A.maxTilt);
      }
      this.lastAssist = assist;
    }

    this.rotorSpeed += (1 - this.rotorSpeed) * (1 - Math.exp(-dt / C.spoolTime));
    const rs2 = this.rotorSpeed * this.rotorSpeed;
    const TNow = Tmax * rs2;
    const h = C.hub, th = C.tailHub;
    // Control power: thrust line about the CG plus the hub moment, per unit of stick.
    const Tref = Math.max(this.tLag, 0.5 * dryWeight);
    const cycPower = (Tref * h[1] + C.hubStiffness * rs2) * C.cyclicMax;
    const tailArm = th[2];

    let pCmd, rCmd, yawTorque;
    if (assist) {
      if (this.grounded && ctl.collective <= 0.02) {
        this.collective += (C.idleCollective - this.collective) * (1 - Math.exp(-dt / 0.35));
        this.integ *= Math.exp(-dt / 0.3);
        this.trim[0] *= Math.exp(-dt / 0.3); this.trim[1] *= Math.exp(-dt / 0.3);
      } else {
        if (this.grounded) this.integ = Math.max(this.integ, 0);
        const vCmd = ctl.collective >= 0 ? ctl.collective * A.climbRate : ctl.collective * A.sinkRate;
        const err = vCmd - vel.y;
        const learn = Math.abs(vCmd) > 0.05 ? 0.15 : 1;
        this.integ = clamp(this.integ + err * A.vKi * learn * dt, A.integMin, A.integMax);
        // The AFCS knows only the dry weight; the integrator learns the milk aboard (so filling sags first).
        const accel = g * (1 + this.integ) + A.vKp * err;
        this.collective = clamp(SKYCRANE_MASS * accel / Math.max(up.y, 0.55) / TNow, 0, 1);
      }
      _fwd.set(0, 0, -1).applyQuaternion(q); _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize();
      _right.crossVectors(_fwd, Y);
      const step = A.tiltSlew * dt;
      this.cmdPitch += clamp(ctl.pitch * A.maxTilt - this.cmdPitch, -step, step);
      this.cmdRoll += clamp(ctl.roll * A.maxTilt - this.cmdRoll, -step, step);
      const desired = _a.set(0, 1, 0).addScaledVector(_fwd, Math.tan(this.cmdPitch)).addScaledVector(_right, Math.tan(this.cmdRoll));
      const neutral = 1 - Math.min(1, Math.hypot(ctl.pitch, ctl.roll) * 1.6);
      if (neutral > 0) {
        desired.x += clamp(-vel.x * A.driftDamping, -A.driftTiltMax, A.driftTiltMax) * neutral;
        desired.z += clamp(-vel.z * A.driftDamping, -A.driftTiltMax, A.driftTiltMax) * neutral;
      }
      // Hands-off hover hold: an off-centre load (milk, the hose) needs a little disc tilt to balance, and that
      // tilt pushes sideways. Integrating the drift and leaning against it lets the fuselage settle at whatever
      // attitude makes the disc level, so it holds still. (Feeding the disc tilt itself back into the target
      // attitude, as before, chased its own control action and crept at ~0.1 m/s for seconds.)
      // Only truly hands-off (sticks centred): any cyclic means the pilot is flying, and the hold lets go.
      if (Math.max(Math.abs(ctl.pitch), Math.abs(ctl.roll)) < 0.02 && !this.grounded) {
        this.velInt[0] = clamp(this.velInt[0] + vel.x * dt, -A.holdMax, A.holdMax);
        this.velInt[1] = clamp(this.velInt[1] + vel.z * dt, -A.holdMax, A.holdMax);
      } else { const k = Math.exp(-dt / 0.15); this.velInt[0] *= k; this.velInt[1] *= k; }
      const hold = Math.max(Math.abs(ctl.pitch), Math.abs(ctl.roll)) < 0.02 && !this.grounded ? 1 : 0;
      desired.x -= A.holdKi * this.velInt[0] + hold * A.holdKp * vel.x;
      desired.z -= A.holdKi * this.velInt[1] + hold * A.holdKp * vel.z;
      // Let the fuselage hang so the disc is level against the steady part of the trim (the learned load
      // offset), not against the instantaneous disc tilt, which includes the hold's own corrections.
      const kd = 1 - Math.exp(-dt / 1.5);
      this.discTrim[0] += (-this.trim[0] * C.cyclicMax - this.discTrim[0]) * kd;
      this.discTrim[1] += (-this.trim[1] * C.cyclicMax - this.discTrim[1]) * kd;
      if (!this.grounded) desired.addScaledVector(_fwd, Math.tan(-this.discTrim[0])).addScaledVector(_right, Math.tan(-this.discTrim[1]));
      desired.normalize();
      const errB = _b.crossVectors(up, desired).applyQuaternion(_qi);
      const tx = C.inertia[0] * (A.tiltKp * errB.x - A.tiltKd * wb.x);
      const tz = C.inertia[2] * (A.tiltKp * errB.z - A.tiltKd * wb.z);
      if (!this.grounded) {
        this.trim[0] = clamp(this.trim[0] + errB.x * A.trimKi * dt, -A.trimMax, A.trimMax);
        this.trim[1] = clamp(this.trim[1] + errB.z * A.trimKi * dt, -A.trimMax, A.trimMax);
      }
      pCmd = clamp(-tx / cycPower - this.trim[0], -1, 1);
      rCmd = clamp(-tz / cycPower - this.trim[1], -1, 1);
      const rateCmd = -ctl.yaw * A.yawRate;
      if (this.grounded) this.yawInteg = 0;
      else if (Math.abs(ctl.yaw) > 0.05) this.yawInteg *= Math.exp(-dt / 0.1);
      else this.yawInteg = clamp(this.yawInteg + (rateCmd - wb.y) * dt, -0.4, 0.4);
      yawTorque = C.inertia[1] * (A.yawKp * (rateCmd - wb.y) + A.yawKi * this.yawInteg) + C.angDamp[1] * rateCmd;
    } else {
      this.collective = stepCollective(this.collective, ctl.collective, C, dt, { grounded: this.grounded, load: 1 + (this.tankMass + hookedMass(this.sim)) / SKYCRANE_MASS, settle: 0.35, lever: ctl.lever });
      pCmd = ctl.pitch; rCmd = ctl.roll;
      yawTorque = -ctl.yaw * C.tailMax * tailArm;
    }
    this.mix.pitch = pCmd; this.mix.roll = rCmd;
    const tailCmd = clamp(yawTorque / tailArm, -C.tailMax, C.tailMax);
    this.mix.yaw = tailCmd / C.tailMax;

    // Main rotor: lagged thrust, lagged disc tilt; thrust along the disc axis at the hub, hub moment too.
    const kT = 1 - Math.exp(-dt / C.thrustLag), kS = 1 - Math.exp(-dt / C.cyclicLag), kY = 1 - Math.exp(-dt / C.tailLag);
    this.tLag += (this.collective * TNow - this.tLag) * kT;
    this.tilt[0] += (pCmd * C.cyclicMax - this.tilt[0]) * kS;
    this.tilt[1] += (rCmd * C.cyclicMax - this.tilt[1]) * kS;
    this.tailT += (tailCmd - this.tailT) * kY;
    const Tm = this.tLag;
    this.rotorT[0] = Tm;
    this.thrust = Tm;
    this.thrustFrac = this.tLag / Tmax;
    _ax.set(Math.sin(this.tilt[1]), 1, -Math.sin(this.tilt[0])).normalize().applyQuaternion(q);
    const hp = this.hubWorlds[0];
    _r.copy(hp).sub(this.pos);
    _vh.crossVectors(wWorld, _r).add(vel);
    const vAx = _vh.dot(_ax);
    _Ft.set(0, 0, 0);
    _F.copy(_ax).multiplyScalar(Tm - C.dragAxial * vAx);
    body.addForceAtPoint({ x: _F.x, y: _F.y, z: _F.z }, { x: hp.x, y: hp.y, z: hp.z }, true);
    _Ft.add(_F);
    _a.copy(_vh).addScaledVector(_ax, -vAx);
    _F.copy(_a).multiplyScalar(-C.dragPlane);
    _pt.copy(hp).addScaledVector(_ax, -_r.dot(_ax));
    body.addForceAtPoint({ x: _F.x, y: _F.y, z: _F.z }, { x: _pt.x, y: _pt.y, z: _pt.z }, true);
    _Ft.add(_F);
    // Hub moment of the tilted disc (articulated head offset): about the axis from up to the disc axis.
    _tb.crossVectors(this.up, _ax).multiplyScalar(C.hubStiffness * rs2);
    // Tail rotor: pure yaw (the moment of its push at the tail pylon), so pedals turn the nose without
    // also pushing the aircraft sideways.
    _F.set(this.tailT * this.rotorSpeed, 0, 0).applyQuaternion(q);
    this.local(th[0], th[1], th[2], _pt);
    _r.copy(_pt).sub(this.pos);
    _a.crossVectors(_r, _F);
    _tb.addScaledVector(_ax.copy(this.up), _a.dot(this.up));

    // Body drag.
    const vhz = Math.hypot(vel.x, vel.z);
    _F.copy(vel).multiplyScalar(-C.dragLinear - 0.1 * C.dragQuad * vel.length());
    _F.x -= C.dragQuad * vhz * vel.x; _F.z -= C.dragQuad * vhz * vel.z;
    _Ft.add(_F);
    body.addForce({ x: _F.x, y: _F.y, z: _F.z }, true);

    const damp = 0.35 + 0.65 * this.rotorSpeed;
    _c.set(-C.angDamp[0] * wb.x * damp, -C.angDamp[1] * wb.y * damp, -C.angDamp[2] * wb.z * damp);
    _c.applyQuaternion(q).add(_tb);
    body.addTorque({ x: _c.x, y: _c.y, z: _c.z }, true);

    // Auto-fill (a combo): reel the snorkel down until it is under the surface, pump until full, reel back up.
    // Any manual hose or pump input hands control back to the pilot.
    const TK = this.tank;
    let reel = ctl.reel || 0, pump = ctl.pump || 0;
    if (TK.auto) {
      const A2 = TK.auto, H = C.hose;
      A2.t += dt;
      // (the button that started it may still be down for a moment: ignore inputs right at the start)
      if ((A2.t > 0.4 && (Math.abs(reel) > 0.15 || pump > 0.15)) || this.sim.state !== 'flying') TK.auto = null;
      else if (A2.phase === 'down') {
        reel = 1;
        if (this.hose.submerged && this.hose.depth > 0.004) { A2.phase = 'pump'; A2.t = 0; this.sim.emit('autoFill', { phase: 'pump' }); }
      } else if (A2.phase === 'pump') {
        pump = 1;
        A2.dry = this.hose.submerged ? 0 : A2.dry + dt;
        if (TK.vol >= TK.capacity * 0.985 || A2.dry > 0.6) { A2.phase = 'up'; this.sim.emit('autoFill', { phase: 'up', full: TK.vol >= TK.capacity * 0.985 }); }
      } else if (A2.phase === 'up') {
        reel = -1;
        if (this.hose.length <= H.startLength * 0.7) { TK.auto = null; this.sim.emit('autoFill', { phase: 'done' }); }
      }
    }
    this.applyTank(dt, ctl.doors || 0, pump, wWorld, _Ft);
    this.hose.reel(reel, dt);
    this.hose.applyForces(dt, this.sim.milk.vessels);

    this.predVel.copy(vel).addScaledVector(_Ft, dt / body.mass());
    this.predVel.y -= g * dt;
    this.rotorPhase += this.rotorSpeed * 26 * dt;
    this.tailPhase += this.rotorSpeed * 120 * dt;
  }

  // Tank: pump in through the hose, belly doors out, slosh, mass properties.
  applyTank(dt, doorsIn, pumpIn0, wWorld, Ftot) {
    const C = CFG.skycrane, TK = this.tank, sys = this.sim.milk, body = this.body;
    const g = CFG.physics.gravity;
    const flying = this.sim.state === 'flying';
    // Pump: spools up while held; moves milk only while the intake is under a surface.
    const pumpIn = flying ? clamp(pumpIn0, 0, 1) : 0;
    TK.pump += (pumpIn - TK.pump) * (1 - Math.exp(-dt / C.tank.pumpSpool));
    TK.flowIn = 0;
    TK.pumping = false;
    const ves = this.hose.submerged;
    if (TK.pump > 0.02 && ves && this.hose.depth > 0.0015 && TK.vol < TK.capacity) {
      const got = sys.take(ves, Math.min(C.tank.pumpRate * TK.pump * dt, TK.capacity - TK.vol));
      if (got.vol > 0) {
        const w0 = TK.vol * (1 - TK.milk), w1 = got.vol * (1 - got.milk);
        if (w0 + w1 > 1e-12) TK.brew = (TK.brew * w0 + got.brew * w1) / (w0 + w1);
        const mv = TK.vol * TK.milk + got.vol * got.milk;
        TK.vol += got.vol;
        TK.milk = mv / TK.vol;
        TK.flowIn = got.vol / dt;
        TK.pumping = true;
      }
    }
    // Doors: a salvo latches them fully open until the tank is empty.
    if (TK.salvo && (TK.vol <= 0 || !flying)) TK.salvo = false;
    TK.doorCmd = flying ? (TK.salvo ? 1 : clamp(doorsIn, 0, 1)) : 0;
    const kd = TK.doorCmd > TK.doors ? 1 - Math.exp(-dt / 0.06) : 1 - Math.exp(-dt * C.tank.doorClose);
    TK.doors += (TK.doorCmd - TK.doors) * kd;
    if (TK.doors < 0.002) TK.doors = 0;
    TK.fillH = TK.vol / TANK_AREA;
    const cosT = Math.max(0, TK.surfN.dot(this.up));
    const pIn = TK.fillH * cosT * TK.gFelt;
    TK.flowOut = 0;
    if (TK.doors > 0 && TK.vol > 0 && pIn > 0) {
      const dv = Math.min(TK.vol, CFG.milk.dischargeCd * C.tank.doorArea * TK.doors * Math.sqrt(2 * pIn) * dt);
      TK.vol -= dv;
      TK.flowOut = dv / dt;
      // The doors span most of the tank floor: the milk leaves as a curtain, not a single jet.
      const door = this.local(T.center[0], TANK_FLOOR - 0.0015, T.center[2], _e).clone();
      this.pointVel(door, _d, wWorld).addScaledVector(this.up, -Math.sqrt(2 * pIn));
      this.spread.u.set(T.half[0] * 0.8 * TK.doors, 0, 0).applyQuaternion(this.quat);
      this.spread.v.set(0, 0, T.half[2] * 0.8).applyQuaternion(this.quat);
      sys.emit('doors', dv, door, _d, TK.milk, TK.brew, this.spread);
    }
    if (TK.vol < 1e-12) { sys.gone += TK.vol * TK.milk; TK.vol = 0; }
    TK.fillH = TK.vol / TANK_AREA;

    // Slosh: first modes of a rectangular tank (one per horizontal axis) on a stiff vertical spring.
    const mLiq = this.tankMass;
    const ms = C.tank.sloshFrac * mLiq;
    this.local(T.center[0], TANK_FLOOR + TK.fillH * 0.5, T.center[2], _e);
    this.pointVel(_e, _a, wWorld);
    if (ms < 2e-5 || TK.fillH < 0.0006) {
      TK.xs.copy(_e); TK.vs.copy(_a); TK.surfN.set(0, 1, 0); TK.gFelt = g;
    } else {
      const Lx = 2 * T.half[0], Lz = 2 * T.half[2], hh = TK.fillH;
      const wx2 = Math.PI * g / Lx * Math.tanh(Math.PI * hh / Lx);
      const wz2 = Math.PI * g / Lz * Math.tanh(Math.PI * hh / Lz);
      const wa2 = 9 * Math.max(wx2, wz2);
      _d.copy(TK.xs).sub(_e).applyQuaternion(_qi);             // displacement in the body frame
      _d.x = clamp(_d.x, -T.half[0] * 0.8, T.half[0] * 0.8);
      _d.z = clamp(_d.z, -T.half[2] * 0.8, T.half[2] * 0.8);
      _b.copy(TK.vs).sub(_a).applyQuaternion(_qi);              // relative velocity, body frame
      const gfx = wx2 * _d.x, gfy = wa2 * _d.y, gfz = wz2 * _d.z;
      _c.set(-gfx - 2 * C.tank.sloshDamping * Math.sqrt(wx2) * _b.x,
        -gfy - 2 * 0.6 * Math.sqrt(wa2) * _b.y,
        -gfz - 2 * C.tank.sloshDamping * Math.sqrt(wz2) * _b.z).applyQuaternion(this.quat);
      _F.copy(_c).multiplyScalar(-ms);
      body.addForceAtPoint({ x: _F.x, y: _F.y, z: _F.z }, { x: _e.x, y: _e.y, z: _e.z }, true);
      Ftot.add(_F);
      TK.vs.addScaledVector(_c, dt);
      TK.vs.y -= g * dt;
      TK.xs.copy(_d).applyQuaternion(this.quat).add(_e).addScaledVector(TK.vs, dt);
      _b.set(gfx, gfy, gfz).applyQuaternion(this.quat);          // felt gravity (world)
      const gl = _b.length();
      TK.gFelt = clamp(gl, 0.2 * g, 3 * g);
      if (gl > 0.5) TK.surfN.copy(_b).multiplyScalar(-1 / gl);
    }
    // Rigid share of the milk, low in the tank: mass, centre of mass and inertia of the whole aircraft.
    const mR = (1 - C.tank.sloshFrac) * mLiq;
    const comY = TANK_FLOOR + TK.fillH * 0.5;
    if (Math.abs(mR - TK.applied.m) > 5e-5 || Math.abs(comY - TK.applied.y) > 0.001) {
      TK.applied.m = mR; TK.applied.y = comY;
      const M = SKYCRANE_MASS + mR;
      const cy = mR * comY / M, cz = mR * T.center[2] / M;
      const lx = 2 * T.half[0], lz = 2 * T.half[2], hh = Math.max(TK.fillH, 0.001);
      const dy = comY - cy, dz = T.center[2] - cz;
      const I = C.inertia;
      body.setAdditionalMassProperties(M, { x: 0, y: cy, z: cz }, {
        x: I[0] + SKYCRANE_MASS * (cy * cy + cz * cz) + mR * ((hh * hh + lz * lz) / 12 + dy * dy + dz * dz),
        y: I[1] + SKYCRANE_MASS * cz * cz + mR * ((lx * lx + lz * lz) / 12 + dz * dz),
        z: I[2] + SKYCRANE_MASS * cy * cy + mR * ((lx * lx + hh * hh) / 12 + dy * dy),
      }, { x: 0, y: 0, z: 0, w: 1 }, true);
    }
  }

  // Combos. Salvo latches the belly doors fully open until the tank is empty (again to close them).
  salvo() {
    const TK = this.tank;
    if (TK.salvo) { TK.salvo = false; return 'closed'; }
    if (TK.vol <= 1e-8) return 'empty';
    TK.salvo = true;
    return 'salvo';
  }

  autoFill() {
    const TK = this.tank;
    if (TK.auto) { TK.auto = null; return 'cancelled'; }
    TK.auto = { phase: 'down', t: 0, dry: 0 };
    return 'started';
  }

  afterStep() {
    this.track.capture(this.body);
    this.updateCached();
    this.hose.afterStep();
  }

  destroy() {
    // A crash bursts the tank; a restart puts the aircraft (and its milk) away.
    const TK = this.tank, sys = this.sim.milk;
    if (TK.vol > 0) {
      if (this.crashing) sys.crashTank(this.local(T.center[0], T.center[1], T.center[2], new THREE.Vector3()), this.vel, TK.vol, TK.vol / TK.capacity, TK.milk, TK.brew, this.crashImpact ?? 1.5);
      else sys.gone += TK.vol * TK.milk;
      TK.vol = 0;
    }
    this.hose.destroy();
    this.sim.world.removeRigidBody(this.body);
    this.body = null;
  }
}
