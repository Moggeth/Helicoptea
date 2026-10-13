import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from './physics.js';
import { CFG } from '../config.js';
import { TABLE, CUPS, stringColliders } from './layout.js';

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _n = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3(), _vn = new THREE.Vector3(), _vt = new THREE.Vector3();
const STRING_COLLIDERS = stringColliders();

// Sample points across the bag's mid-plane (local). Immersion, buoyancy and drag are evaluated per point,
// so a bag half in the tea feels half in the tea and drag produces natural torques.
const C = CFG.cargo;
const SAMPLES = [];
for (const sx of [-0.8, 0, 0.8]) for (const sy of [-0.82, 0, 0.82]) SAMPLES.push(new THREE.Vector3(sx * C.bagHalf[0], sy * C.bagHalf[1], 0));

let nextId = 1;

export class TeaBag {
  constructor(sim, pos, quat) {
    this.sim = sim;
    this.id = nextId++;
    const world = sim.world;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(0.02)
      .setAngularDamping(0.25);
    this.body = world.createRigidBody(desc);
    const cd = RAPIER.ColliderDesc.cuboid(C.bagHalf[0], C.bagHalf[1], C.bagHalf[2])
      .setMass(C.dryMass)
      .setFriction(0.75)
      .setRestitution(0.04)
      .setCollisionGroups(GROUPS.bag)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(0.02);
    this.collider = world.createCollider(cd, this.body);
    sim.register(this.collider, { kind: 'bag', bag: this });

    this.track = new Track(this.body);
    this.wetness = 0;
    this.peakWet = 0;
    this.potency = 1;
    this.immersion = 0;
    this.cup = null;          // cup currently immersed in
    this.attach = null;       // { kind: 'peg' | 'heli', joint, length, peg? }
    this.born = sim.time;
    this.retiring = 0;        // > 0 while fading out
    this.lowSince = 0;
    this.massApplied = 0;
    this.dripAcc = 0;
    this.wasImmersed = false;
    this.pos = new THREE.Vector3().copy(pos);
    this.quat = new THREE.Quaternion().copy(quat);
    this.vel = new THREE.Vector3();
    this.anchorWorld = new THREE.Vector3();
    this.tension = 0;

    // Visual string (verlet), simulated at the fixed rate so it is deterministic and interpolatable.
    const N = C.ropeSegments;
    this.N = N;
    this.str = new Float32Array((N + 1) * 3);
    this.strPrev = new Float32Array((N + 1) * 3);
    this.strRender0 = new Float32Array((N + 1) * 3);
    this.strRender1 = new Float32Array((N + 1) * 3);
    this.updateCached();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      this.str[i * 3] = this.anchorWorld.x;
      this.str[i * 3 + 1] = this.anchorWorld.y + t * C.ropeLength;
      this.str[i * 3 + 2] = this.anchorWorld.z;
    }
    this.strPrev.set(this.str); this.strRender0.set(this.str); this.strRender1.set(this.str);
  }

  get mass() { return C.dryMass + C.waterCapacity * this.wetness; }

  updateCached() {
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(v.x, v.y, v.z);
    this.anchorWorld.set(0, C.bagHalf[1], 0).applyQuaternion(this.quat).add(this.pos);
  }

  loopPosition(out) {
    const i = this.N * 3;
    return out.set(this.str[i], this.str[i + 1], this.str[i + 2]);
  }

  applyForces(dt) {
    this.updateCached();
    const body = this.body;
    body.resetForces(true);
    body.resetTorques(true);
    const av = body.angvel();
    _w.set(av.x, av.y, av.z);
    const g = CFG.physics.gravity;
    const mass = this.mass;

    // Find the cup whose interior water volume contains sample points.
    let cup = null;
    for (const c of this.sim.cups) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      if (dx * dx + dz * dz < (c.rIn + 0.05) ** 2 && this.pos.y < c.waterY + 0.05 && this.pos.y > c.floorY - 0.04) { cup = c; break; }
    }

    _n.set(0, 0, 1).applyQuaternion(this.quat); // bag face normal
    let sub = 0;
    if (cup) {
      const V = THREE.MathUtils.lerp(C.dryVolume, C.wetVolume, this.wetness);
      const mPt = mass / SAMPLES.length;
      for (const s of SAMPLES) {
        _p.copy(s).applyQuaternion(this.quat).add(this.pos);
        const dx = _p.x - cup.x, dz = _p.z - cup.z;
        if (dx * dx + dz * dz > (cup.rIn - 0.0015) ** 2 || _p.y < cup.floorY - 0.004) continue;
        const surf = cup.waterY + cup.surfaceOffset(_p.x, _p.z);
        const d = THREE.MathUtils.clamp((surf - _p.y) / 0.007 + 0.5, 0, 1);
        if (d <= 0) continue;
        const frac = d / SAMPLES.length;
        sub += frac;
        // Buoyancy.
        _f.set(0, C.waterDensity * g * V * frac, 0);
        // Velocity-dependent drag, integrated implicitly per point so it can never overshoot.
        _r.copy(_p).sub(this.pos);
        _v.crossVectors(_w, _r).add(this.vel);
        _vn.copy(_n).multiplyScalar(_v.dot(_n));
        _vt.copy(_v).sub(_vn);
        const kn = (C.dragLinear + C.dragNormal * _vn.length()) * d * 1.0;
        const kt = (C.dragLinear + C.dragTangent * _vt.length()) * d * 1.0;
        _f.addScaledVector(_vn, -(mPt / dt) * (1 - Math.exp(-kn * dt / mPt)));
        _f.addScaledVector(_vt, -(mPt / dt) * (1 - Math.exp(-kt * dt / mPt)));
        body.addForceAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: _p.x, y: _p.y, z: _p.z }, true);
      }
    }
    this.immersion = sub;
    const sp0 = this.vel.length();
    const windy = this.sim.air.near(this.pos);
    this.cup = sub > 0.01 ? cup : null;

    if (sub < 0.95 && !windy && sp0 > 1e-4) {
      const k = C.airDrag * (0.3 + sp0);
      const fac = -(mass / dt) * (1 - Math.exp(-k * dt / mass)) * (1 - sub);
      body.addForce({ x: this.vel.x * fac, y: this.vel.y * fac, z: this.vel.z * fac }, true);
    }
    // Air drag against the moving air (rotor wake and outwash), at three points down the bag so a gust
    // makes it flutter and twist. Flat-plate model: broadside drag much larger than edge-on.
    if (sub < 0.95 && windy) {
      const air = this.sim.air;
      const dryPart = 1 - sub;
      const mPt = mass / 3;
      for (const sy of [-0.75, 0, 0.75]) {
        _p.set(0, sy * C.bagHalf[1], 0).applyQuaternion(this.quat).add(this.pos);
        air.sample(_p.x, _p.y, _p.z, _f);
        _f.multiplyScalar(CFG.air.bagDrag);
        _r.copy(_p).sub(this.pos);
        _v.crossVectors(_w, _r).add(this.vel).sub(_f); // velocity relative to the air
        _vn.copy(_n).multiplyScalar(_v.dot(_n));
        _vt.copy(_v).sub(_vn);
        const kn = (C.airDrag * 0.3 + 0.5 * 1.2 * 1.2 * 0.00288 * _vn.length()) * dryPart / 3;
        const kt = (C.airDrag * 0.3 + 0.5 * 1.2 * 0.1 * 0.00288 * _vt.length()) * dryPart / 3;
        _f.copy(_vn).multiplyScalar(-(mPt / dt) * (1 - Math.exp(-kn * dt / mPt)));
        _f.addScaledVector(_vt, -(mPt / dt) * (1 - Math.exp(-kt * dt / mPt)));
        body.addForceAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: _p.x, y: _p.y, z: _p.z }, true);
      }
    }

    // Wetness: soaks while immersed, drains (with drips) after extraction.
    if (this.immersion > 0.02) {
      this.wetness += this.immersion * (1 - this.wetness) * dt / C.soakTime;
      this.peakWet = Math.max(this.peakWet, this.wetness);
    } else if (this.wetness > 0) {
      const floor = this.peakWet * C.dampFloor;
      const dw = Math.max(0, this.wetness - floor) * dt / C.drainTime;
      this.wetness -= dw;
      this.dripAcc += dw * C.waterCapacity;
      while (this.dripAcc > C.dripMass) {
        this.dripAcc -= C.dripMass;
        this.sim.spawnDrip(this);
      }
    }
    // Apply mass changes gradually (well below 1% per step), keeping the rope constraint stable.
    const wantExtra = C.waterCapacity * this.wetness;
    if (Math.abs(wantExtra - this.massApplied) > 0.00004) {
      this.massApplied = wantExtra;
      body.setAdditionalMass(wantExtra, true);
    }

    // Brewing: only from actual immersion in this cup's water.
    if (this.cup && this.potency > 0) {
      const rate = this.immersion * this.potency / C.brewTime;
      this.cup.brew += rate * (1 - this.cup.brew) * dt;
      this.cup.steep = Math.max(this.cup.steep, this.immersion);
      this.cup.bagPos.copy(this.pos);
      this.potency = Math.max(0, this.potency - this.immersion * dt / C.potencyLife);
    }
  }

  afterStep(dt) {
    this.track.capture(this.body);
    this.updateCached();
    // Strings run at half the physics rate; a free bag at rest in still air lets its string sleep.
    this.strPhase = !this.strPhase;
    if (!this.strPhase) return;
    const still = !this.attach && this.vel.lengthSq() < 2.5e-5 && !this.sim.air.near(this.pos, 0.4);
    if (still && this.strSettled) { this.strRender0.set(this.strRender1); return; }
    this.stepString(dt * 2);
    this.strSettled = still && this.strMotion < 1e-5;
  }

  // String verlet: pinned at the bag; the loop end is pinned to the peg or hook while attached.
  stepString(dt) {
    const N = this.N, s = this.str, p = this.strPrev;
    const seg = (this.attach ? this.attach.length : C.ropeLength) / N;
    const g = CFG.physics.gravity * dt * dt;
    const end = this.attach ? this.attach.endWorld() : null;
    let motion = 0;
    const air = this.sim.air, fl = CFG.air.stringFlutter;
    const windy = air.wake.active && air.near(this.pos, 0.4);
    for (let i = 0; i <= N; i++) {
      const k = i * 3;
      const x = s[k], y = s[k + 1], z = s[k + 2];
      const wet = this.inWater(x, y, z);
      const damp = wet ? 0.8 : 0.992;
      let ax = 0, ay = 0, az = 0;
      if (!wet && windy) {
        air.sample(x, y, z, _f);
        ax = (_f.x * dt - (x - p[k])) * fl; ay = (_f.y * dt - (y - p[k + 1])) * fl; az = (_f.z * dt - (z - p[k + 2])) * fl;
      }
      motion = Math.max(motion, Math.abs(x - p[k]) + Math.abs(y - p[k + 1]) + Math.abs(z - p[k + 2]));
      s[k] += (x - p[k]) * damp + ax;
      s[k + 1] += (y - p[k + 1]) * damp - g + ay;
      s[k + 2] += (z - p[k + 2]) * damp + az;
      p[k] = x; p[k + 1] = y; p[k + 2] = z;
    }
    for (let it = 0; it < 6; it++) {
      s[0] = this.anchorWorld.x; s[1] = this.anchorWorld.y; s[2] = this.anchorWorld.z;
      if (end) { s[N * 3] = end.x; s[N * 3 + 1] = end.y; s[N * 3 + 2] = end.z; }
      for (let i = 0; i < N; i++) {
        const a = i * 3, b = a + 3;
        const dx = s[b] - s[a], dy = s[b + 1] - s[a + 1], dz = s[b + 2] - s[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d <= seg) continue; // a string resists stretch, never compression
        const diff = (d - seg) / d;
        const wa = i === 0 ? 0 : (end && i + 1 === N ? 1 : 0.5);
        const wb = (end && i + 1 === N) ? 0 : (i === 0 ? 1 : 0.5);
        s[a] += dx * diff * wa; s[a + 1] += dy * diff * wa; s[a + 2] += dz * diff * wa;
        s[b] -= dx * diff * wb; s[b + 1] -= dy * diff * wb; s[b + 2] -= dz * diff * wb;
      }
      this.collideString();
    }
    s[0] = this.anchorWorld.x; s[1] = this.anchorWorld.y; s[2] = this.anchorWorld.z;
    if (end) { s[N * 3] = end.x; s[N * 3 + 1] = end.y; s[N * 3 + 2] = end.z; }
    this.strRender0.set(this.strRender1);
    this.strRender1.set(s);
    this.strMotion = motion;
  }

  inWater(x, y, z) {
    for (const c of this.sim.cups) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < c.rIn * c.rIn && y < c.waterY && y > c.floorY) return true;
    }
    return false;
  }

  collideString() {
    const s = this.str, N = this.N, r = 0.0008;
    for (let i = 1; i <= N; i++) {
      const k = i * 3;
      let x = s[k], y = s[k + 1], z = s[k + 2];
      if (Math.abs(x) < TABLE.halfX && Math.abs(z) < TABLE.halfZ && y < r && y > -0.03) y = r;
      for (const c of this.sim.cups) {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz);
        if (y < c.topY && y > c.baseY && d < c.rOut + r && d > c.rIn - r) {
          const toIn = d - (c.rIn - r), toOut = (c.rOut + r) - d;
          const nd = toIn < toOut ? c.rIn - r : c.rOut + r;
          // Close to the rim top: drape over instead of pushing sideways.
          if (c.topY - y < Math.min(toIn, toOut)) y = c.topY + r;
          else if (d > 1e-6) { x = c.x + dx / d * nd; z = c.z + dz / d * nd; }
        } else if (d < c.rIn && y < c.floorY + r && y > c.baseY - 0.01) y = c.floorY + r;
      }
      for (const [cx, cz, cr, top] of STRING_COLLIDERS) {
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < cr * cr && y < top + r && y > -0.02) {
          const d = Math.sqrt(d2);
          if (top + r - y < cr - d) y = top + r;
          else if (d > 1e-6) { x = cx + dx / d * cr; z = cz + dz / d * cr; }
        }
      }
      s[k] = x; s[k + 1] = y; s[k + 2] = z;
    }
  }

  // Interpolated string positions for rendering.
  sampleString(alpha, out) {
    const a = this.strRender0, b = this.strRender1;
    for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * alpha;
    return out;
  }

  destroy() {
    if (this.attach) this.sim.detachBag(this, true);
    this.sim.world.removeRigidBody(this.body);
    this.body = null;
  }
}

export { CUPS };
