import * as THREE from 'three';
import { CFG } from '../config.js';

// A simple position-hold pilot that produces the same stick inputs a player would (assist mode).
// Used by the headless checks and the debug "demo flight"; it never touches the physics directly.
export class Autopilot {
  constructor() {
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.maxSpeed = 0.35;
    this.ix = 0; this.iz = 0;
    this.ctl = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
  }
  // aim: optional point (e.g. the dangling bag) that should arrive over target instead of the heli.
  update(heli, swingVel = null, aim = null, dt = 1 / 240) {
    const A = CFG.assist;
    const g = CFG.physics.gravity;
    const p = heli.pos, v = heli.vel;
    const ap = aim || p;
    const ex = this.target.x - ap.x, ez = this.target.z - ap.z;
    if (Math.hypot(ex, ez) < 0.06) { this.ix += ex * dt; this.iz += ez * dt; } else { this.ix *= 0.99; this.iz *= 0.99; }
    const dist = Math.hypot(ex, ez);
    const sp = Math.min(this.maxSpeed, dist * 1.4);
    let vdx = dist > 1e-4 ? ex / dist * sp : 0, vdz = dist > 1e-4 ? ez / dist * sp : 0;
    let ax = (vdx - v.x) * 2.6 + this.ix * 3, az = (vdz - v.z) * 2.6 + this.iz * 3;
    if (swingVel) { ax -= swingVel.x * 0.9; az -= swingVel.z * 0.9; }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(heli.quat); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const aF = ax * fwd.x + az * fwd.z, aR = ax * right.x + az * right.z;
    const k = 1 / Math.tan(A.maxTilt);
    this.ctl.pitch = THREE.MathUtils.clamp(Math.atan(aF / g) * k, -1, 1);
    this.ctl.roll = THREE.MathUtils.clamp(Math.atan(aR / g) * k, -1, 1);
    const vy = THREE.MathUtils.clamp((this.target.y - p.y) * 2.5, -A.sinkRate, A.climbRate);
    this.ctl.collective = vy >= 0 ? vy / A.climbRate : vy / A.sinkRate;
    let dy = this.yaw - heli.heading();
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.ctl.yaw = THREE.MathUtils.clamp(-dy * 1.5, -1, 1);
    return this.ctl;
  }
}
