import * as THREE from 'three';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { ROOM, TABLE } from '../sim/layout.js';
import { groundHeight } from '../sim/world/plan.js';
import { teaColor } from './water.js';

// Camera modes beyond the chase rig (camera.js) and the pilot's seat (cockpitCam.js). Each rig poses the
// world camera from the interpolated airframe pose and reports the lens it wants; main.js owns the lens.
// Body frame: x right, y up, z aft (the nose points to -z). Model scale: a micro-heli cabin is 4.5 cm wide.

export const CAM_MODES = [
  { id: 'chase', name: 'Chase', blurb: 'Horizon-steady, turns with your heading, frames the load' },
  { id: 'cockpit', name: 'Cockpit', blurb: "Pilot's seat; the head sways with the g" },
  { id: 'locked', name: 'Locked chase', blurb: 'Bolted behind the tail: rolls and pitches with the airframe' },
  { id: 'nose', name: 'Nose cam', blurb: 'Hard-mounted on the nose, nothing in the way' },
  { id: 'orbit', name: 'Orbit', blurb: 'Free orbit that does not turn with the aircraft' },
  { id: 'tripod', name: 'Tripod', blurb: 'A camera operator on the table, panning and zooming' },
  { id: 'cargo', name: 'Cargo cam', blurb: "Ride the load down: the tea bag's-eye view" },
];
export const CAM_IDS = CAM_MODES.map((m) => m.id);
export const CAM_NAME = Object.fromEntries(CAM_MODES.map((m) => [m.id, m.name]));
// Modes C / L3 step through by default (Orbit is a mouse / d-pad toy, one press away on 5).
export const DEFAULT_CYCLE = ['chase', 'cockpit', 'locked', 'nose', 'tripod', 'cargo'];
// Number keys pick a mode directly; 1 keeps its old job (cockpit, and back again).
export const CAM_KEYS = { Digit2: 'chase', Digit3: 'locked', Digit4: 'nose', Digit5: 'orbit', Digit6: 'tripod', Digit7: 'cargo' };
// Modes where dragging (or the d-pad) turns the view rather than orbiting the chase camera.
export const LOOK_MODES = new Set(['cockpit', 'cargo']);

// Hard mounts, per aircraft (body frame, metres). nose: forward-looking hood camera just under the nose.
// bolt: the GoPro, on a stub arm off the right side, looking straight down past the skid or sponson, image
// top towards the nose; tilt [forward, inboard] in radians leans it so the hook line sits in frame.
// locked: rigid chase offset [up, back] and its downward aim.
export const MOUNTS = {
  micro: { nose: [0, -0.019, -0.073], nosePitch: -0.2, bolt: [0.041, -0.016, -0.012], boltTilt: [0.05, 0.2], locked: [0.085, 0.3], lockedPitch: -0.2 },
  chinook: { nose: [0, -0.008, -0.098], nosePitch: -0.18, bolt: [0.047, -0.004, -0.014], boltTilt: [0.03, 0.14], locked: [0.12, 0.42], lockedPitch: -0.2 },
  skycrane: { nose: [0, -0.005, -0.097], nosePitch: -0.2, bolt: [0.028, -0.012, -0.024], boltTilt: [-0.04, 0.18], locked: [0.12, 0.42], lockedPitch: -0.2 },
};

const G = new THREE.Vector3(0, 9.81, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;

// Shortens a camera arm so it stays on the near side of walls, window bars and furniture.
function keepClear(sim, from, to, out) {
  out.copy(to);
  if (!sim) return out;
  const dir = _w.subVectors(to, from);
  const len = dir.length();
  if (len < 1e-5) return out;
  dir.divideScalar(len);
  const hit = sim.world.castRay(new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z }), len, true, undefined, GROUPS.queryWorld);
  if (hit && hit.timeOfImpact > 0.004) out.copy(from).addScaledVector(dir, Math.max(0.004, hit.timeOfImpact - 0.01));
  if (Math.abs(out.x) < TABLE.halfX + 0.05 && Math.abs(out.z) < TABLE.halfZ + 0.05) out.y = Math.max(out.y, 0.004);
  out.y = Math.max(out.y, groundHeight(out.x, out.z) + 0.01);
  return out;
}

// Felt acceleration, in body axes, shared by the rigid rigs for their speed feel.
class GSense {
  constructor() { this.prev = new THREE.Vector3(); this.acc = new THREE.Vector3(); this.has = false; this.body = new THREE.Vector3(); }
  reset() { this.has = false; this.acc.set(0, 0, 0); this.body.set(0, 0, 0); }
  update(dt, h, quat) {
    if (!h || dt <= 0) return this.body;
    if (this.has) this.acc.lerp(_v.subVectors(h.vel, this.prev).divideScalar(Math.max(dt, 1e-3)), 1 - Math.exp(-dt / 0.08));
    this.prev.copy(h.vel); this.has = true;
    _qi.copy(quat).invert();
    return this.body.copy(this.acc).applyQuaternion(_qi);
  }
}

// ---------------------------------------------------------------- locked chase
// Bolted rigidly behind and above: the horizon tilts as you bank and the world rushes as you pitch over.
// The only give is "speed feel": the arm stretches a little under acceleration and the lens widens with speed.
export class LockedRig {
  constructor() { this.g = new GSense(); this.off = new THREE.Vector3(); this.offVel = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.fovKick = 0; }
  reset() { this.g.reset(); this.off.set(0, 0, 0); this.offVel.set(0, 0, 0); this.fovKick = 0; }
  update(dt, h, pos, quat, type, scale, feel, carrying, sim) {
    const M = MOUNTS[type] || MOUNTS.micro;
    const aB = this.g.update(dt, h, quat);
    // Arm stretch: the camera trails acceleration (about 1.5 cm per g at full feel, micro scale), sprung.
    const tgt = _a.set(-aB.x, -aB.y * 0.5, -aB.z).multiplyScalar(0.0016 * feel * scale);
    tgt.clampLength(0, 0.03 * scale);
    if (dt > 0) {
      const om = 9, ze = 0.7, s = Math.min(dt, 0.033);
      this.offVel.addScaledVector(_b.subVectors(tgt, this.off).multiplyScalar(om * om).addScaledVector(this.offVel, -2 * ze * om), s);
      this.off.addScaledVector(this.offVel, s);
    }
    const up = M.locked[0] * scale * (carrying ? 1.25 : 1), back = M.locked[1] * scale * (carrying ? 1.15 : 1);
    _v.set(0, up, back).add(this.off).applyQuaternion(quat).add(pos);
    const pivot = _b.set(0, up * 0.5, 0).applyQuaternion(quat).add(pos);
    keepClear(sim, pivot, _v, this.pos);
    this.quat.copy(quat).multiply(_q.setFromEuler(_e.set(M.lockedPitch - (carrying ? 0.12 : 0), 0, 0)));
    const fwd = h ? -_w.copy(h.vel).applyQuaternion(_qi.copy(quat).invert()).z : 0;
    const want = feel * (9 * clamp(fwd / 1.2, -0.3, 1) + clamp(-aB.z * 0.6, -3, 5));
    this.fovKick += (want - this.fovKick) * (1 - Math.exp(-dt * 4));
    return this;
  }
}

// ---------------------------------------------------------------- nose cam
// A hood camera under the nose: rigid, no cockpit, wide. The speed feel is the lens alone.
export class NoseRig {
  constructor() { this.g = new GSense(); this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.fovKick = 0; this.t = 0; }
  reset() { this.g.reset(); this.fovKick = 0; }
  update(dt, h, pos, quat, type, feel, vibration) {
    const M = MOUNTS[type] || MOUNTS.micro;
    const aB = this.g.update(dt, h, quat);
    this.pos.set(...M.nose).applyQuaternion(quat).add(pos);
    this.t += dt;
    // Airframe buzz through the mount: tiny, fast, worse at high collective.
    const amp = h ? vibration * 2 * h.rotorSpeed * (0.3 + 0.7 * Math.min(1, h.thrustFrac)) * 0.0012 : 0;
    _e.set(M.nosePitch + amp * Math.sin(this.t * 151.3), amp * 0.6 * Math.sin(this.t * 197.1 + 1), amp * 0.4 * Math.sin(this.t * 173.7 + 2), 'YXZ');
    this.quat.copy(quat).multiply(_q.setFromEuler(_e));
    const fwd = h ? -_w.copy(h.vel).applyQuaternion(_qi.copy(quat).invert()).z : 0;
    const want = feel * (12 * clamp(fwd / 1.2, -0.3, 1) + clamp(-aB.z * 0.8, -3, 6));
    this.fovKick += (want - this.fovKick) * (1 - Math.exp(-dt * 4));
    return this;
  }
}

// ---------------------------------------------------------------- bolted GoPro (hold)
// Hard-mounted on a stub arm off the right side, looking straight down. The airframe edge fills one side
// of the frame and the hook line hangs through the middle: line the load up over the cup and lower.
export class BoltRig {
  constructor() { this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.t = 0; this.base = new THREE.Quaternion(); }
  update(dt, h, pos, quat, type, vibration) {
    const M = MOUNTS[type] || MOUNTS.micro;
    this.pos.set(...M.bolt).applyQuaternion(quat).add(pos);
    // Camera looks along body -y; image up is the nose (-z); image right is body +x.
    _m.makeBasis(_a.set(1, 0, 0), _b.set(0, 0, -1), _v.set(0, 1, 0));
    this.base.setFromRotationMatrix(_m);
    this.t += dt;
    const amp = h ? vibration * 2 * h.rotorSpeed * (0.35 + 0.65 * Math.min(1, h.thrustFrac)) * 0.0022 : 0;
    // Lean: forward (towards the nose, image top) and inboard (towards the hook line, image left).
    _e.set(M.boltTilt[0] + amp * Math.sin(this.t * 143.9), M.boltTilt[1] + amp * Math.sin(this.t * 211.3 + 0.7), amp * 0.5 * Math.sin(this.t * 167.2 + 1.9), 'YXZ');
    this.quat.copy(quat).multiply(this.base).multiply(_q.setFromEuler(_e));
    return this;
  }
}

// ---------------------------------------------------------------- tripod
// Someone on the table with a long lens: stands still, pans after you with a human lag, zooms to keep the
// aircraft (and load) a steady size, and moves to a fresh spot ahead of you when you fly off or out of sight.
export class TripodRig {
  constructor() { this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.fov = 30; this.valid = false; this.blockedT = 0; this.checkT = 0; this.cuts = 0; this.t = 0; this.side = 1; }
  reset() { this.valid = false; }
  place(focus, vel, scale, sim) {
    const sp = Math.hypot(vel.x, vel.z);
    const dirA = sp > 0.08 ? Math.atan2(vel.x, vel.z) : Math.random() * Math.PI * 2;
    const lead = _a.copy(focus).addScaledVector(vel, sp > 0.08 ? 0.9 : 0);
    this.side = -this.side;
    const offs = [0.7, -0.7, 1.2, -1.2, 0.35, -0.35, 1.8, -1.8, 2.6, -2.6, 0, Math.PI];
    for (const o of offs) {
      const ang = dirA + o * this.side;
      for (const d of [0.62, 0.45, 0.32]) {
        const dist = d * scale;
        const c = _v.set(lead.x + Math.sin(ang) * dist, focus.y + 0.035 * scale + 0.02, lead.z + Math.cos(ang) * dist);
        if (c.x < ROOM.minX + 0.1 || c.x > ROOM.maxX - 0.1 || c.z < ROOM.minZ + 0.1 || c.z > ROOM.maxZ - 0.1) continue;
        c.y = Math.max(c.y, ROOM.floorY + 0.05);
        if (Math.abs(c.x) < TABLE.halfX && Math.abs(c.z) < TABLE.halfZ) c.y = Math.max(c.y, 0.03);
        if (this.blocked(sim, c, focus)) continue;
        this.pos.copy(c);
        this.look.copy(focus);
        this.valid = true;
        this.cuts++;
        return true;
      }
    }
    return false;
  }
  blocked(sim, from, to) {
    if (!sim) return false;
    const dir = _w.subVectors(to, from);
    const len = dir.length();
    if (len < 1e-4) return false;
    dir.divideScalar(len);
    const hit = sim.world.castRay(new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z }), len - 0.03, true, undefined, GROUPS.queryWorld);
    return !!hit;
  }
  update(dt, focus, vel, frameR, scale, sim) {
    this.t += dt;
    const far = this.valid && this.pos.distanceTo(focus) > 1.25 * scale;
    this.checkT -= dt;
    if (this.valid && this.checkT <= 0) { this.checkT = 0.2; this.blockedT = this.blocked(sim, this.pos, focus) ? this.blockedT + 0.2 : 0; }
    if (!this.valid || far || this.blockedT > 0.6) { this.blockedT = 0; if (!this.place(focus, vel, scale, sim) && !this.valid) this.pos.set(focus.x, focus.y + 0.2, focus.z + 0.4); }
    // Operator lag, and a breath of hand-held drift.
    this.look.lerp(focus, 1 - Math.exp(-dt * 5));
    _a.copy(this.look);
    _a.x += Math.sin(this.t * 0.7) * 0.0015 * scale; _a.y += Math.sin(this.t * 0.53 + 1) * 0.001 * scale;
    _m.lookAt(this.pos, _a, _b.set(0, 1, 0));
    this.quat.setFromRotationMatrix(_m);
    const d = this.pos.distanceTo(this.look);
    const want = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(frameR / Math.max(d, 1e-3))), 7, 55);
    this.fov += (want - this.fov) * (1 - Math.exp(-dt * 2.5));
    return this;
  }
}

// ---------------------------------------------------------------- cargo cam
// Rides the load, hanging under the string: the swing is your swing. It looks down and forward past the
// load (drag or the d-pad to look about, even straight up at the aircraft). Under the surface the world
// goes the colour of the tea.
export class CargoRig {
  constructor() { this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.lookYaw = 0; this.lookPitch = 0; this.under = null; this.kind = 'hook'; }
  reset() { this.lookYaw = this.lookPitch = 0; this.up.set(0, 1, 0); }
  addLook(dy, dp) { this.lookYaw = clamp(this.lookYaw + dy, -3, 3); this.lookPitch = clamp(this.lookPitch + dp, -0.9, 2.2); }
  recenter() { this.lookYaw = this.lookPitch = 0; }
  // load: { pos, top, kind } with top the point the line hangs from; heading: aircraft heading.
  update(dt, load, heading, sim) {
    this.kind = load.kind;
    _a.subVectors(load.top, load.pos);
    if (_a.lengthSq() < 1e-8) _a.set(0, 1, 0);
    _a.normalize();
    // The string swings fast; a little smoothing keeps the picture readable without hiding the swing.
    this.up.lerp(_a, 1 - Math.exp(-dt * 18)).normalize();
    const up = this.up;
    // Where the lens sits: dangling just under the load, so the cup comes up at you and you go in first.
    const below = { bag: 0.046, bucket: 0.03, hose: -0.004, hook: 0.002 }[load.kind] ?? 0.01;
    const behind = { bag: 0.006, bucket: 0.008, hose: 0.012, hook: 0.004 }[load.kind] ?? 0.01;
    // Forward: the aircraft's heading, made square to the line.
    const fwd = _b.set(-Math.sin(heading), 0, -Math.cos(heading));
    fwd.addScaledVector(up, -fwd.dot(up));
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    fwd.applyAxisAngle(up, this.lookYaw);
    _a.copy(load.pos).addScaledVector(up, -below).addScaledVector(fwd, -behind);
    keepClear(sim, load.pos, _a, this.pos);   // never through the table or a cup wall
    // a: angle from straight down towards forward; look up past the horizon to see the aircraft above.
    const a = clamp((load.kind === 'hose' ? 0.3 : 0.42) + this.lookPitch, 0.02, 3.1);
    const dir = _v.copy(up).multiplyScalar(-Math.cos(a)).addScaledVector(fwd, Math.sin(a)).normalize();
    const imgUp = _w.copy(up).addScaledVector(dir, -up.dot(dir));
    if (imgUp.lengthSq() < 1e-6) imgUp.copy(fwd); else imgUp.normalize();
    const right = _a.crossVectors(imgUp, dir.negate()); // camera x = y × z, with z = -dir
    _m.makeBasis(right, imgUp, dir);
    this.quat.setFromRotationMatrix(_m);
    this.under = liquidAt(sim, this.pos);
    return this;
  }
}

// The liquid a point is under, if any: { kind: 'tea' | 'milk', color, depth }.
const _c = new THREE.Color();
export function liquidAt(sim, p) {
  if (!sim || !sim.milk) return null;
  for (const v of sim.milk.vessels) {
    if (p.y >= v.waterY || p.y < (v.floorY ?? v.waterY - 0.2)) continue;
    if (Math.hypot(p.x - v.x, p.z - v.z) > v.rIn) continue;
    if (v.isBowl) return { kind: 'milk', color: _c.setRGB(0.93, 0.91, 0.85).clone(), depth: v.waterY - p.y };
    teaColor(v.brew || 0, _c);
    if (v.milk) _c.lerp(new THREE.Color(0.92, 0.86, 0.74), Math.min(1, v.milk * 2));
    return { kind: 'tea', color: _c.clone(), depth: v.waterY - p.y };
  }
  return null;
}
