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
    const heavy = heli.type === 'chinook' || heli.type === 'skycrane';
    const A = heavy ? CFG[heli.type].assist : CFG.assist;
    const g = CFG.physics.gravity;
    const p = heli.pos, v = heli.vel;
    const ap = aim || p;
    const ex = this.target.x - ap.x, ez = this.target.z - ap.z;
    // Integral action removes steady offsets (ground effect differences, wash off nearby objects).
    const win = heavy ? 0.15 : 0.06;
    if (Math.hypot(ex, ez) < win) { this.ix += ex * dt; this.iz += ez * dt; } else { this.ix *= 0.99; this.iz *= 0.99; }
    const heavyMicro = !heavy;
    const iMax = heavyMicro ? 0.02 : 0.06;
    this.ix = THREE.MathUtils.clamp(this.ix, -iMax, iMax); this.iz = THREE.MathUtils.clamp(this.iz, -iMax, iMax);
    const dist = Math.hypot(ex, ez);
    const sp = Math.min(this.maxSpeed, dist * (heavyMicro ? 0.9 : 1.4));
    let vdx = dist > 1e-4 ? ex / dist * sp : 0, vdz = dist > 1e-4 ? ez / dist * sp : 0;
    const kv = heavy ? 1.5 : 1.7; // heavy machines: gentler velocity loop
    const ki = heavyMicro ? 2 : 0.8;
    let ax = (vdx - v.x) * kv + this.ix * ki, az = (vdz - v.z) * kv + this.iz * ki;
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
