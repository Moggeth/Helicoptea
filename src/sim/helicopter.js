import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from './physics.js';
import { CFG } from '../config.js';

// Body frame: nose towards -Z, right +X, up +Y. Origin is the centre of mass.
// Parts are shared with the render model and the destruction system so wreckage is recognisable.
export const HELI_PARTS = [
  { name: 'fuselage', pos: [0, 0.005, -0.006], half: [0.0185, 0.034, 0.056], mass: 0.0095, collide: true },
  { name: 'tailBoom', pos: [0, 0.0095, 0.098], half: [0.0055, 0.0055, 0.053], mass: 0.0018, collide: true },
  { name: 'tail', pos: [0.0, 0.02, 0.149], half: [0.004, 0.021, 0.013], mass: 0.0012, collide: true },
  { name: 'skidL', pos: [-0.0265, -0.0405, -0.005], half: [0.0035, 0.0062, 0.05], mass: 0.0015, collide: true },
  { name: 'skidR', pos: [0.0265, -0.0405, -0.005], half: [0.0035, 0.0062, 0.05], mass: 0.0015, collide: true },
  { name: 'mast', pos: [0, 0.047, 0], half: [0.006, 0.007, 0.006], mass: 0.0016, collide: false },
  { name: 'bladeA', pos: [0.05, 0.053, 0], half: [0.05, 0.0015, 0.0045], mass: 0.0009, collide: false, blade: 1 },
  { name: 'bladeB', pos: [-0.05, 0.053, 0], half: [0.05, 0.0015, 0.0045], mass: 0.0009, collide: false, blade: -1 },
];

const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

export class Helicopter {
  constructor(sim, pos, yaw) {
    this.sim = sim;
    const H = CFG.heli;
    const world = sim.world;
    const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setAdditionalMassProperties(H.mass, { x: 0, y: 0, z: 0 },
        { x: H.inertia[0], y: H.inertia[1], z: H.inertia[2] }, { x: 0, y: 0, z: 0, w: 1 });
    this.body = world.createRigidBody(desc);
    this.colliders = [];
    for (const p of HELI_PARTS) {
      if (!p.collide) continue;
      const cd = RAPIER.ColliderDesc.cuboid(p.half[0], p.half[1], p.half[2])
        .setTranslation(p.pos[0], p.pos[1], p.pos[2])
        .setDensity(0)
        .setFriction(p.name.startsWith('skid') ? 0.55 : 0.4)
        .setRestitution(0.08)
        .setCollisionGroups(GROUPS.heli)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(0.004);
      const c = world.createCollider(cd, this.body);
      sim.register(c, { kind: 'heli', part: p.name });
      this.colliders.push(c);
    }
    const rd = RAPIER.ColliderDesc.cylinder(0.005, H.rotorRadius)
      .setTranslation(H.rotorHubOffset[0], H.rotorHubOffset[1], H.rotorHubOffset[2])
      .setSensor(true).setDensity(0).setCollisionGroups(GROUPS.rotor);
    this.rotor = world.createCollider(rd, this.body);
    sim.register(this.rotor, { kind: 'rotor' });

    this.track = new Track(this.body);
    this.collective = H.idleCollective;
    this.thrust = 0;
    this.thrustFrac = 0;
    this.rotorSpeed = 0.82;      // rotors are already turning on the pad: ready to fly
    this.rotorPhase = Math.random() * 6.28;
    this.tailPhase = 0;
    this.integ = 0;
    this.groundDist = 1;         // rotor hub to surface below
    this.skidClearance = 1;
    this.grounded = true;
    this.load = 0;               // extra vertical force the rotor is carrying (rope tension), for audio
    this.rotorContact = 0;
    this.lastAssist = null;
    this.hookWorld = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.vel = new THREE.Vector3();
    this.pos = new THREE.Vector3().copy(pos);
    this.quat = q.clone();
    this.ctlEcho = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.predVel = new THREE.Vector3();
    this.impactAcc = 0;
    this.turb = [0, 0, 0];
    this.cmdPitch = 0; this.cmdRoll = 0;
    this.updateCached();
  }

  updateCached() {
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(v.x, v.y, v.z);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    const h = CFG.heli.hookOffset;
    this.hookWorld.set(h[0], h[1], h[2]).applyQuaternion(this.quat).add(this.pos);
  }

  heading() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    return Math.atan2(-_fwd.x, -_fwd.z);
  }

  // ctl: { pitch, roll, yaw, collective } each in [-1, 1]; assist: boolean.
  applyForces(dt, ctl, assist) {
    const H = CFG.heli, A = CFG.assist;
    const body = this.body;
    this.updateCached();
    const q = _q.copy(this.quat);
    const up = _up.copy(this.up);
    const vel = _v.copy(this.vel);
    const av = body.angvel();
    const wWorld = _w.set(av.x, av.y, av.z);
    const g = CFG.physics.gravity;
    const weight = H.mass * g;
    const Tmax = H.thrustToWeight * weight;
    this.ctlEcho.pitch = ctl.pitch; this.ctlEcho.roll = ctl.roll; this.ctlEcho.yaw = ctl.yaw; this.ctlEcho.collective = ctl.collective;

    // Ground probe from the rotor hub (ground effect, landed state, shadows).
    _a.set(H.rotorHubOffset[0], H.rotorHubOffset[1], H.rotorHubOffset[2]).applyQuaternion(q).add(this.pos);
    const ray = new RAPIER.Ray({ x: _a.x, y: _a.y, z: _a.z }, { x: 0, y: -1, z: 0 });
    const hit = this.sim.world.castRay(ray, 1.2, true, undefined, GROUPS.queryWorld, undefined, body);
    this.groundDist = hit ? hit.timeOfImpact : 1.2;
    this.skidClearance = this.groundDist - (H.rotorHubOffset[1] + H.skidDrop) * Math.max(up.y, 0.3);
    this.grounded = this.skidClearance < 0.006 && up.y > 0.85 && Math.abs(vel.y) < 0.15;

    // Bumpless transfer when the assist is toggled.
    if (this.lastAssist !== assist) {
      if (assist) {
        _fwd.set(0, 0, -1).applyQuaternion(q); _fwd.y = 0; _fwd.normalize();
        _right.crossVectors(_fwd, Y);
        this.cmdPitch = THREE.MathUtils.clamp(Math.atan2(up.dot(_fwd), up.y), -A.maxTilt, A.maxTilt);
        this.cmdRoll = THREE.MathUtils.clamp(Math.atan2(up.dot(_right), up.y), -A.maxTilt, A.maxTilt);
        const cur = this.thrust * Math.max(up.y, 0.5);
        this.integ = this.grounded || this.thrust < 1e-6 ? 0 : THREE.MathUtils.clamp(cur / weight - 1, A.integMin, A.integMax);
      }
      this.lastAssist = assist;
    }

    // Rotor speed governor: automatic, droops a little under heavy collective.
    const rsTarget = 1 - H.governorDroop * this.thrustFrac;
    this.rotorSpeed += (rsTarget - this.rotorSpeed) * (1 - Math.exp(-dt / H.spoolTime));
    const rs2 = this.rotorSpeed * this.rotorSpeed;
    const TmaxNow = Tmax * rs2;

    // Collective.
    if (assist) {
      if (this.grounded && ctl.collective <= 0.02) {
        this.collective += (H.idleCollective - this.collective) * (1 - Math.exp(-dt / 0.25));
        this.integ *= Math.exp(-dt / 0.3);
      } else {
        if (this.grounded) this.integ = Math.max(this.integ, 0);
        const vCmd = ctl.collective >= 0 ? ctl.collective * A.climbRate : ctl.collective * A.sinkRate;
        const err = vCmd - vel.y;
        // Learn the load mainly while holding altitude, so climbs and descents don't wind it up.
        const learn = Math.abs(vCmd) > 0.05 ? 0.15 : 1;
        this.integ = THREE.MathUtils.clamp(this.integ + err * A.vKi * learn * dt, A.integMin, A.integMax);
        const accel = g * (1 + this.integ) + A.vKp * err;
        const Tneed = H.mass * accel / Math.max(up.y, 0.55);
        this.collective = THREE.MathUtils.clamp(Tneed / TmaxNow, 0, 1);
      }
    } else {
      this.collective = THREE.MathUtils.clamp(this.collective + ctl.collective * H.collectiveRate * dt, 0, 1);
    }

    // Thrust with lag, ground effect and a touch of translational lift.
    const tCmd = this.collective * TmaxNow;
    this.thrust += (tCmd - this.thrust) * (1 - Math.exp(-dt / H.thrustLag));
    this.thrustFrac = this.thrust / Tmax;
    const z = Math.max(this.groundDist, 0.02);
    const k = H.rotorRadius / (4 * z);
    const ge = Math.min(1 / Math.max(1 - k * k, 0.01), H.groundEffectMax);
    const vh = Math.hypot(vel.x, vel.z);
    const etl = 1 + H.translationalLift * Math.min(vh / 0.8, 1);
    const T = this.thrust * ge * etl;

    const F = _b.copy(up).multiplyScalar(T);
    // Aerodynamic drag: rotor plane (H-force), axial and quadratic body drag.
    const vAx = up.dot(vel);
    _c.copy(up).multiplyScalar(vAx);
    _d.copy(vel).sub(_c);
    // Quadratic drag mostly in the rotor plane: caps cruise speed but lets the heli drop hard.
    F.addScaledVector(_d, -H.dragPlane - H.dragQuad * _d.length()).addScaledVector(_c, -H.dragAxial).addScaledVector(vel, -0.02 * vel.length());

    body.resetForces(true);
    body.resetTorques(true);
    body.addForce({ x: F.x, y: F.y, z: F.z }, true);
    // Predicted free-flight velocity: any extra change after the step came from contacts or the rope.
    this.predVel.copy(vel).addScaledVector(F, dt / H.mass);
    this.predVel.y -= g * dt;

    // Torques in body frame.
    _qi.copy(q).invert();
    const wb = _c.copy(wWorld).applyQuaternion(_qi);
    const damp = 0.35 + 0.65 * this.rotorSpeed;
    const tb = _d.set(-H.angDamp[0] * wb.x * damp, -H.angDamp[1] * wb.y * damp, -H.angDamp[2] * wb.z * damp);
    // Main rotor reaction torque: more collective, more yaw to the right that must be countered.
    tb.y += -H.reactionTorque * (T / weight - 1);

    const tWorld = new THREE.Vector3();
    if (assist) {
      // Attitude hold: neutral cyclic means level; deflection commands a tilt in the heading frame.
      _fwd.set(0, 0, -1).applyQuaternion(q); _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize();
      _right.crossVectors(_fwd, Y);
      // The commanded attitude glides towards the stick (heavy, smooth), but is then held firmly.
      const step = A.tiltSlew * dt;
      this.cmdPitch += THREE.MathUtils.clamp(ctl.pitch * A.maxTilt - this.cmdPitch, -step, step);
      this.cmdRoll += THREE.MathUtils.clamp(ctl.roll * A.maxTilt - this.cmdRoll, -step, step);
      const desired = new THREE.Vector3(0, 1, 0)
        .addScaledVector(_fwd, Math.tan(this.cmdPitch))
        .addScaledVector(_right, Math.tan(this.cmdRoll));
      const neutral = 1 - Math.min(1, Math.hypot(ctl.pitch, ctl.roll) * 1.6);
      if (neutral > 0) {
        const dx = THREE.MathUtils.clamp(-vel.x * A.driftDamping, -A.driftTiltMax, A.driftTiltMax);
        const dz = THREE.MathUtils.clamp(-vel.z * A.driftDamping, -A.driftTiltMax, A.driftTiltMax);
        desired.x += dx * neutral; desired.z += dz * neutral;
      }
      desired.normalize();
      const err = new THREE.Vector3().crossVectors(up, desired);
      const wTilt = wWorld.clone().addScaledVector(up, -wWorld.dot(up));
      const I = H.inertia[0];
      tWorld.copy(err).multiplyScalar(A.tiltKp * I).addScaledVector(wTilt, -A.tiltKd * I);
      const lim = H.cyclicTorque * A.torqueLimit * rs2;
      if (tWorld.length() > lim) tWorld.setLength(lim);
      // Yaw rate hold (also cancels rotor reaction torque).
      const rCmd = -ctl.yaw * A.yawRate;
      const ty = THREE.MathUtils.clamp(H.inertia[1] * A.yawKp * (rCmd - wb.y) + H.reactionTorque * (T / weight - 1),
        -H.yawTorque * 1.5, H.yawTorque * 1.5);
      tb.y += ty;
    } else {
      tb.x += -ctl.pitch * H.cyclicTorque * rs2;
      tb.z += -ctl.roll * H.cyclicTorque * rs2;
      tb.y += -ctl.yaw * H.yawTorque * rs2;
    }
    // Ground-effect recirculation: a cushion of re-ingested air buffets the rotor when hovering low.
    const cushion = Math.max(0, 1 - this.groundDist / (1.6 * H.rotorRadius)) * Math.min(1.5, this.thrustFrac * 2.2) * CFG.air.buffet;
    for (let a = 0; a < 3; a++) {
      this.turb[a] += (-this.turb[a] * 6 + (Math.random() * 2 - 1) * 38) * dt;
    }
    if (cushion > 0.01 && !this.grounded) {
      const amp = H.cyclicTorque * 0.22 * cushion;
      tb.x += this.turb[0] * amp; tb.z += this.turb[1] * amp; tb.y += this.turb[2] * amp * 0.5;
    }
    tb.applyQuaternion(q).add(tWorld);
    body.addTorque({ x: tb.x, y: tb.y, z: tb.z }, true);

    this.rotorPhase += this.rotorSpeed * 52 * dt;
    this.tailPhase += this.rotorSpeed * 160 * dt;
  }

  afterStep() {
    this.track.capture(this.body);
    this.updateCached();
  }

  destroy() {
    this.sim.world.removeRigidBody(this.body);
    this.body = null;
  }
}
