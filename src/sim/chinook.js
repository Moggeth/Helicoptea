import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from './physics.js';
import { CFG } from '../config.js';
import { stepCollective, hookedMass } from './collective.js';

// Tandem-rotor heavy lifter. Body frame as the micro heli: nose towards -Z, right +X, up +Y, origin at
// the centre of mass. Each rotor is a separate thrust vector applied at its own hub, so every moment
// (pitch from differential collective, roll from lateral cyclic, yaw from differential lateral cyclic,
// hook loads off the CG, one rotor in ground effect over the teapot) comes out of the geometry.
// Parts are shared with the render model and the destruction system so wreckage is recognisable.
const B = (rotor, k) => ({ name: `blade${rotor ? 'A' : 'F'}${k}`, pos: [0, 0, 0], half: [0.05, 0.0016, 0.0042], mass: 0.0012, collide: false, blade: { rotor, k } });
export const CHINOOK_PARTS = [
  { name: 'noseCab', pos: [0, 0.0, -0.065], half: [0.0195, 0.018, 0.02], mass: 0.012, collide: true },
  { name: 'cabin', pos: [0, 0.002, 0], half: [0.0205, 0.02, 0.045], mass: 0.026, collide: true },
  { name: 'aftCabin', pos: [0, 0.004, 0.066], half: [0.0205, 0.018, 0.021], mass: 0.011, collide: true },
  { name: 'fwdPylon', pos: [0, 0.029, -0.064], half: [0.008, 0.009, 0.018], mass: 0.006, collide: true },
  { name: 'aftPylon', pos: [0, 0.034, 0.064], half: [0.009, 0.013, 0.022], mass: 0.008, collide: true },
  { name: 'engineL', pos: [-0.0175, 0.031, 0.058], half: [0.0055, 0.0055, 0.017], mass: 0.005, collide: true },
  { name: 'engineR', pos: [0.0175, 0.031, 0.058], half: [0.0055, 0.0055, 0.017], mass: 0.005, collide: true },
  { name: 'sponsonL', pos: [-0.0245, -0.011, -0.002], half: [0.005, 0.007, 0.046], mass: 0.004, collide: true },
  { name: 'sponsonR', pos: [0.0245, -0.011, -0.002], half: [0.005, 0.007, 0.046], mass: 0.004, collide: true },
  { name: 'gearFL', pos: [-0.019, -0.026, -0.05], half: [0.0032, 0.005, 0.005], mass: 0.0015, collide: true, gear: true },
  { name: 'gearFR', pos: [0.019, -0.026, -0.05], half: [0.0032, 0.005, 0.005], mass: 0.0015, collide: true, gear: true },
  { name: 'gearRL', pos: [-0.021, -0.026, 0.046], half: [0.0032, 0.005, 0.005], mass: 0.0015, collide: true, gear: true },
  { name: 'gearRR', pos: [0.021, -0.026, 0.046], half: [0.0032, 0.005, 0.005], mass: 0.0015, collide: true, gear: true },
  B(0, 0), B(0, 1), B(0, 2), B(1, 0), B(1, 1), B(1, 2),
];
export const CHINOOK_MASS = CHINOOK_PARTS.reduce((s, p) => s + p.mass, 0);
// Front rotor turns counter-clockwise seen from above (+1 about body Y), aft rotor clockwise (-1).
export const ROTOR_DIR = [1, -1];
const BLADE_SPAN = 0.05; // part origin is at mid-span
// Hub plus a ring of six at 0.6 R, staggered so no straight bar under the hub lines up with three samples.

const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3(), _vh = new THREE.Vector3();
const _ax = new THREE.Vector3(), _F = new THREE.Vector3(), _Ft = new THREE.Vector3(), _hub = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _tb = new THREE.Vector3(), _wb = new THREE.Vector3(), _pt = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

export class Chinook {
  constructor(sim, pos, yaw) {
    this.sim = sim;
    const C = CFG.chinook;
    this.type = 'chinook';
    this.def = {
      id: 'chinook', name: 'Chinook', mass: CHINOOK_MASS, parts: CHINOOK_PARTS, hooks: C.hooks,
      rotorRadius: C.rotorRadius, gearDrop: C.gearDrop, thrustToWeight: C.thrustToWeight,
      impactDv: C.impactDv, explosionImpulse: C.explosionImpulse, scale: 1.6,
    };
    const world = sim.world;
    const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setAdditionalMassProperties(CHINOOK_MASS, { x: 0, y: 0, z: 0 },
        { x: C.inertia[0], y: C.inertia[1], z: C.inertia[2] }, { x: 0, y: 0, z: 0, w: 1 });
    this.body = world.createRigidBody(desc);
    this.colliders = [];
    for (const p of CHINOOK_PARTS) {
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
    // One blade-disc sensor per rotor. The aft disc sits higher so the overlapping blades clear.
    this.rotors = C.hubs.map((h, i) => {
      const rd = RAPIER.ColliderDesc.cylinder(0.005, C.rotorRadius)
        .setTranslation(h[0], h[1], h[2])
        .setSensor(true).setDensity(0).setCollisionGroups(GROUPS.rotor);
      const c = world.createCollider(rd, this.body);
      sim.register(c, { kind: 'rotor', rotorIndex: i });
      return c;
    });
    this.rotor = this.rotors[0];

    this.track = new Track(this.body);
    this.collective = C.idleCollective;
    this.rotorThrust = [0, 0];
    this.tCommon = 0; this.tDiff = 0;
    this.cmdPitch = 0; this.cmdRoll = 0;  // assist: slew-limited commanded attitude         // lagged blade thrust per rotor, before ground effect etc.
    this.rotorT = [0, 0];              // actual thrust per rotor this step (N)
    this.tilt = [0, 0];                // lagged lateral disc tilt per rotor (rad, + = towards +X)
    this.rotorGround = [1.2, 1.2];     // hub to surface below, per rotor
    this.thrust = 0;
    this.thrustFrac = 0;
    this.rotorSpeed = 0.82;
    this.rotorPhase = Math.random() * 6.28;   // forward rotor; the aft rotor is geared to it
    this.tailPhase = 0;
    this.integ = 0;
    this.trim = [0, 0];                // assist pitch/roll trim (learned hook-load offsets)
    this.yawInteg = 0;
    this.groundDist = 1;
    this.skidClearance = 1;
    this.grounded = true;
    this.load = 0;
    this.rotorContact = 0;
    this.lastAssist = null;
    this.hookWorlds = C.hooks.map(() => new THREE.Vector3());
    this.hookWorld = this.hookWorlds[1];
    this.hubWorlds = C.hubs.map(() => new THREE.Vector3());
    this.up = new THREE.Vector3(0, 1, 0);
    this.vel = new THREE.Vector3();
    this.pos = new THREE.Vector3().copy(pos);
    this.quat = q.clone();
    this.ctlEcho = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.mix = { pitch: 0, roll: 0, yaw: 0 };   // commands actually sent to the rotors (after assist)
    this.predVel = new THREE.Vector3();
    this.impactAcc = 0;
    this.updateCached();
  }

  updateCached() {
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(v.x, v.y, v.z);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    const C = CFG.chinook;
    for (let i = 0; i < C.hooks.length; i++) this.hookWorlds[i].set(...C.hooks[i]).applyQuaternion(this.quat).add(this.pos);
    for (let i = 0; i < C.hubs.length; i++) this.hubWorlds[i].set(...C.hubs[i]).applyQuaternion(this.quat).add(this.pos);
  }

  heading() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    return Math.atan2(-_fwd.x, -_fwd.z);
  }

  // Rotor phases for rendering and debris. Synchronised 60 degrees apart so the overlapping blades mesh.
  phaseOf(rotor) { return rotor === 0 ? this.rotorPhase : -this.rotorPhase + Math.PI / 3; }

  // Local pose of a blade part (debris spawn).
  bladePose(part) {
    const { rotor, k } = part.blade;
    const h = CFG.chinook.hubs[rotor];
    const a = this.phaseOf(rotor) + k * Math.PI * 2 / 3;
    return {
      pos: new THREE.Vector3(h[0] + Math.cos(a) * BLADE_SPAN, h[1], h[2] - Math.sin(a) * BLADE_SPAN),
      quat: new THREE.Quaternion().setFromAxisAngle(Y, a),
      spin: ROTOR_DIR[rotor],
    };
  }

  // ctl: { pitch, roll, yaw, collective } each in [-1, 1]; assist: boolean.
  applyForces(dt, ctl, assist) {
    const C = CFG.chinook, A = C.assist;
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
    const mass = CHINOOK_MASS;
    const weight = mass * g;
    const TmaxRot = C.thrustToWeight * weight / 2;
    this.ctlEcho.pitch = ctl.pitch; this.ctlEcho.roll = ctl.roll; this.ctlEcho.yaw = ctl.yaw; this.ctlEcho.collective = ctl.collective;

    // Ground probes: one under each hub (height over what's below, for the wash and the cameras) and
    // one under the CG (landed state).
    for (let i = 0; i < 2; i++) {
      const hp = this.hubWorlds[i];
      const hit = this.sim.world.castRay(new RAPIER.Ray({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: -1, z: 0 }), 1.2, true, undefined, GROUPS.queryWorld, undefined, body);
      this.rotorGround[i] = hit ? hit.timeOfImpact : 1.2;
    }
    const cg = this.sim.world.castRay(new RAPIER.Ray({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, { x: 0, y: -1, z: 0 }), 1.2, true, undefined, GROUPS.queryWorld, undefined, body);
    const cgDist = cg ? cg.timeOfImpact : 1.2;
    this.groundDist = Math.min(this.rotorGround[0], this.rotorGround[1]);
    this.skidClearance = cgDist - C.gearDrop * Math.max(up.y, 0.3);
    this.grounded = this.skidClearance < 0.006 && up.y > 0.85 && Math.abs(vel.y) < 0.15;

    if (this.lastAssist !== assist) {
      if (assist) {
        const cur = this.thrust * Math.max(up.y, 0.5);
        this.integ = this.grounded || this.thrust < 1e-6 ? 0 : clamp(cur / weight - 1, A.integMin, A.integMax);
        this.trim[0] = this.trim[1] = 0;
        // Start the commanded attitude from where the aircraft is, so engaging assist doesn't snap it level.
        _fwd.set(0, 0, -1).applyQuaternion(q); _fwd.y = 0; _fwd.normalize();
        _right.crossVectors(_fwd, Y);
        this.cmdPitch = clamp(Math.atan2(up.dot(_fwd), up.y), -A.maxTilt, A.maxTilt);
        this.cmdRoll = clamp(Math.atan2(up.dot(_right), up.y), -A.maxTilt, A.maxTilt);
      }
      this.lastAssist = assist;
    }

    // Rotor speed: spins up to full and stays there.
    this.rotorSpeed += (1 - this.rotorSpeed) * (1 - Math.exp(-dt / C.spoolTime));
    const rs2 = this.rotorSpeed * this.rotorSpeed;
    const TrotNow = TmaxRot * rs2;

    // Control-power numbers from the geometry (used to turn assist torques into rotor commands).
    const hf = C.hubs[0], ha = C.hubs[1];
    const D = C.diffCollective * TrotNow;                 // newtons of differential collective at full stick
    const pitchPower = D * (ha[2] - hf[2]);               // N m of pitch per unit stick (nose down)
    const Tf = Math.max(this.rotorThrust[0], 0.25 * weight), Ta = Math.max(this.rotorThrust[1], 0.25 * weight);
    const rollPower = (Tf * hf[1] + Ta * ha[1]) * C.latCyclic;
    const yawPower = (Tf * -hf[2] + Ta * ha[2]) * C.yawCyclic;

    let pCmd, rCmd, yCmd;
    if (assist) {
      // Collective: climb-rate command whose integrator learns the cargo, as on the micro heli.
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
        const accel = g * (1 + this.integ) + A.vKp * err;
        const Tneed = mass * accel / Math.max(up.y, 0.55);
        this.collective = clamp(Tneed / (2 * TrotNow), 0, 1);
      }
      // Attitude hold (an AFCS): neutral cyclic means level, deflection commands a tilt in the heading frame.
      // It works only through the same rotor controls the pilot has, within their physical range.
      _fwd.set(0, 0, -1).applyQuaternion(q); _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize();
      _right.crossVectors(_fwd, Y);
      // The commanded attitude glides towards the stick (heavy, smooth), then is held firmly.
      const step = A.tiltSlew * dt;
      this.cmdPitch += clamp(ctl.pitch * A.maxTilt - this.cmdPitch, -step, step);
      this.cmdRoll += clamp(ctl.roll * A.maxTilt - this.cmdRoll, -step, step);
      const desired = _a.set(0, 1, 0)
        .addScaledVector(_fwd, Math.tan(this.cmdPitch))
        .addScaledVector(_right, Math.tan(this.cmdRoll));
      const neutral = 1 - Math.min(1, Math.hypot(ctl.pitch, ctl.roll) * 1.6);
      if (neutral > 0) {
        desired.x += clamp(-vel.x * A.driftDamping, -A.driftTiltMax, A.driftTiltMax) * neutral;
        desired.z += clamp(-vel.z * A.driftDamping, -A.driftTiltMax, A.driftTiltMax) * neutral;
      }
      desired.normalize();
      const errB = _b.crossVectors(up, desired).applyQuaternion(_qi);
      const tx = C.inertia[0] * (A.tiltKp * errB.x - A.tiltKd * wb.x);
      const tz = C.inertia[2] * (A.tiltKp * errB.z - A.tiltKd * wb.z);
      // Trim integrators learn steady offsets (a soaked bag on the forward hook) while airborne.
      if (!this.grounded) {
        this.trim[0] = clamp(this.trim[0] + errB.x * A.trimKi * dt, -A.trimMax, A.trimMax);
        this.trim[1] = clamp(this.trim[1] + errB.z * A.trimKi * dt, -A.trimMax, A.trimMax);
      }
      pCmd = clamp(-tx / pitchPower - this.trim[0], -1, 1);
      rCmd = clamp(-tz / rollPower - this.trim[1], -1, 1);
      // Yaw-rate hold. Hub damping at the commanded rate and the rotor torque imbalance are fed forward;
      // the integrator holds the heading against weathervaning when the pedals are centred.
      const rateCmd = -ctl.yaw * A.yawRate;
      if (this.grounded) this.yawInteg = 0;
      else if (Math.abs(ctl.yaw) > 0.05) this.yawInteg *= Math.exp(-dt / 0.1); // turning: rate only
      else this.yawInteg = clamp(this.yawInteg + (rateCmd - wb.y) * dt, -0.4, 0.4);
      const ty = C.inertia[1] * (A.yawKp * (rateCmd - wb.y) + A.yawKi * this.yawInteg) + C.angDamp[1] * rateCmd;
      yCmd = clamp(-ty / yawPower, -1, 1);
    } else {
      this.collective = stepCollective(this.collective, ctl.collective, C, dt, { grounded: this.grounded, load: 1 + hookedMass(this.sim) / CHINOOK_MASS, settle: 0.35 });
      pCmd = ctl.pitch; rCmd = ctl.roll; yCmd = ctl.yaw;
    }
    this.mix.pitch = pCmd; this.mix.roll = rCmd; this.mix.yaw = yCmd;

    // Mixer: collective on both, differential collective for pitch, lateral cyclic for roll and yaw.
    const base = this.collective * TrotNow;
    const tCmd = [clamp(base - pCmd * D, 0, TrotNow), clamp(base + pCmd * D, 0, TrotNow)];
    const sCmd = [rCmd * C.latCyclic + yCmd * C.yawCyclic, rCmd * C.latCyclic - yCmd * C.yawCyclic];
    const kT = 1 - Math.exp(-dt / C.thrustLag), kD = 1 - Math.exp(-dt / C.diffLag), kS = 1 - Math.exp(-dt / C.cyclicLag);
    // Common thrust follows the collective slowly (big rotors, lots of air to accelerate); the
    // differential part follows the pitch control a little quicker, as blade pitch changes do.
    this.tCommon += ((tCmd[0] + tCmd[1]) / 2 - this.tCommon) * kT;
    this.tDiff += ((tCmd[1] - tCmd[0]) / 2 - this.tDiff) * kD;
    this.rotorThrust[0] = Math.max(0, this.tCommon - this.tDiff);
    this.rotorThrust[1] = Math.max(0, this.tCommon + this.tDiff);


    _Ft.set(0, 0, 0);
    _tb.set(0, 0, 0);
    body.resetForces(true);
    body.resetTorques(true);
    let Tsum = 0;
    for (let i = 0; i < 2; i++) {
      this.tilt[i] += (sCmd[i] - this.tilt[i]) * kS;
      const T = this.rotorThrust[i];
      this.rotorT[i] = T;
      Tsum += T;
      // Disc axis tilted laterally by the cyclic, in world space.
      const s = this.tilt[i];
      _ax.set(Math.sin(s), Math.cos(s), 0).applyQuaternion(q);
      const hp = this.hubWorlds[i];
      _r.copy(hp).sub(this.pos);
      _vh.crossVectors(wWorld, _r).add(vel);             // hub velocity: pitching moves the hubs up and down
      const vAx = _vh.dot(_ax);
      _F.copy(_ax).multiplyScalar(T - C.dragAxial * vAx); // inflow change damps vertical motion and pitch
      body.addForceAtPoint({ x: _F.x, y: _F.y, z: _F.z }, { x: hp.x, y: hp.y, z: hp.z }, true);
      _Ft.add(_F);
      // H-force in the disc plane. Applied level with the CG (not up at the hub): with low drag, a lever arm
      // up there turned forward speed into nose-up pitch and set up a slow pitch/speed oscillation (phugoid).
      _a.copy(_vh).addScaledVector(_ax, -vAx);
      _F.copy(_a).multiplyScalar(-C.dragPlane);
      _pt.copy(hp).addScaledVector(_ax, -_r.dot(_ax));
      body.addForceAtPoint({ x: _F.x, y: _F.y, z: _F.z }, { x: _pt.x, y: _pt.y, z: _pt.z }, true);
      _Ft.add(_F);
    }
    this.thrust = Tsum;
    this.thrustFrac = (this.rotorThrust[0] + this.rotorThrust[1]) / (2 * TmaxRot);

    // Body drag.
    // Quadratic drag mostly horizontal: caps cruise speed but lets slow drift glide and a drop fall hard.
    const vhz = Math.hypot(vel.x, vel.z);
    _F.copy(vel).multiplyScalar(-C.dragLinear - 0.1 * C.dragQuad * vel.length());
    _F.x -= C.dragQuad * vhz * vel.x; _F.z -= C.dragQuad * vhz * vel.z;
    _Ft.add(_F);
    body.addForce({ x: _F.x, y: _F.y, z: _F.z }, true);

    this.predVel.copy(vel).addScaledVector(_Ft, dt / mass);
    this.predVel.y -= g * dt;

    // Hub and flapping damping.
    const damp = 0.35 + 0.65 * this.rotorSpeed;
    _tb.set(-C.angDamp[0] * wb.x * damp, -C.angDamp[1] * wb.y * damp, -C.angDamp[2] * wb.z * damp);
    _tb.applyQuaternion(q);
    body.addTorque({ x: _tb.x, y: _tb.y, z: _tb.z }, true);

    this.rotorPhase += this.rotorSpeed * 30 * dt;
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
