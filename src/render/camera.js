import * as THREE from 'three';
import { CFG } from '../config.js';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { TABLE, ROOM } from '../sim/layout.js';

// Horizon-stable chase camera. Follows the helicopter's heading (never its roll), frames the
// dangling bag, avoids scenery with a ray cast, and never jumps when cargo or the heli changes.
export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;            // camera heading (radians, same convention as heli.heading())
    this.orbitYaw = 0;       // user offset
    this.orbitPitch = 0;
    this.zoom = 1;
    this.sizeScale = 1;      // bigger aircraft: stand further back
    this.focus = new THREE.Vector3(-0.56, 0.08, 0.24);
    this.pos = new THREE.Vector3(-0.56, 0.3, 0.7);
    this.look = this.focus.clone();
    this.dist = CFG.camera.distance;
    this.shake = 0;
    this.shakeT = 0;
    this.initialised = false;
    this._d = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  recenter(heading) {
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.zoom = 1;
    if (heading !== undefined) this.yaw = heading;
  }

  addShake(amount) { this.shake = Math.min(0.02, this.shake + amount); }

  // target: interpolated heli position (or wreck focus); heading: heli heading; bagPos: optional
  update(dt, target, heading, bagPos, sim, extraLookDown = 0) {
    const C = CFG.camera;
    if (!this.initialised) { this.yaw = heading; this.initialised = true; }
    // Heading follow, rate-limited and smooth.
    let dy = heading - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-dt * C.yawFollow));

    // Focus: between the heli and the bag so both stay in frame.
    const f = this._t.copy(target);
    if (bagPos) f.lerp(bagPos, C.cargoLookBias);
    this.focus.lerp(f, 1 - Math.exp(-dt * C.lookFollow));
    const wantDist = (bagPos ? C.cargoDistance : C.distance) * this.zoom * this.sizeScale;
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-dt * 2.5));

    const yaw = this.yaw + this.orbitYaw;
    const el = THREE.MathUtils.clamp(C.elevation + this.orbitPitch + extraLookDown, 0.08, 1.35);
    const back = this._d.set(Math.sin(yaw), 0, Math.cos(yaw)); // behind the nose (nose is -z at yaw 0)
    const desired = new THREE.Vector3()
      .copy(this.focus)
      .addScaledVector(back, Math.cos(el) * this.dist)
      .add(new THREE.Vector3(0, Math.sin(el) * this.dist, 0));

    // Keep out of scenery: cast from focus to desired position.
    if (sim) {
      const dir = desired.clone().sub(this.focus);
      const len = dir.length();
      dir.divideScalar(len);
      const ray = new RAPIER.Ray({ x: this.focus.x, y: this.focus.y, z: this.focus.z }, { x: dir.x, y: dir.y, z: dir.z });
      const hit = sim.world.castRay(ray, len, true, undefined, GROUPS.queryWorld);
      if (hit && hit.timeOfImpact > 0.02) desired.copy(this.focus).addScaledVector(dir, Math.max(0.06, hit.timeOfImpact - 0.02));
    }
    // Never below the table top when over it.
    if (Math.abs(desired.x) < TABLE.halfX + 0.05 && Math.abs(desired.z) < TABLE.halfZ + 0.05) desired.y = Math.max(desired.y, 0.03);
    desired.y = Math.max(desired.y, ROOM.floorY + 0.03); // never under the floor or lawn

    if (this.pos.distanceTo(desired) > 1.5) this.pos.copy(desired);
    this.pos.lerp(desired, 1 - Math.exp(-dt * C.posFollow));
    // The smoothed position can cut a corner through a window bar or door frame: keep it on the near side.
    if (sim) {
      const dir = this._t.copy(this.pos).sub(this.focus);
      const len = dir.length();
      if (len > 1e-4) {
        dir.divideScalar(len);
        const hit = sim.world.castRay(new RAPIER.Ray({ x: this.focus.x, y: this.focus.y, z: this.focus.z }, { x: dir.x, y: dir.y, z: dir.z }), len, true, undefined, GROUPS.queryWorld);
        if (hit && hit.timeOfImpact > 0.02) this.pos.copy(this.focus).addScaledVector(dir, Math.max(0.06, hit.timeOfImpact - 0.02));
      }
    }
    this.look.lerp(this.focus, 1 - Math.exp(-dt * C.lookFollow * 1.5));

    this.camera.position.copy(this.pos);
    if (this.shake > 0.0001) {
      this.shakeT += dt;
      const s = this.shake;
      this.camera.position.x += Math.sin(this.shakeT * 53) * s;
      this.camera.position.y += Math.sin(this.shakeT * 61 + 1.3) * s * 0.7;
      this.camera.position.z += Math.sin(this.shakeT * 47 + 2.1) * s;
      this.shake *= Math.exp(-dt * 5);
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }
}
