import * as THREE from 'three';
import { RAPIER, GROUPS, G, Track } from './physics.js';
import { CFG } from '../config.js';
import { surfaceY, ROOM, SUGAR, PLATE, SPOON, GTABLE, LAMP, MOBILE, TREE, CAT, BENCH, RADIO, COUNTER, BIRDBATH } from './layout.js';
import { catBalls } from './house.js';

// Loose, light things that make the house feel alive: napkins that lift and tumble in rotor wash, sugar
// cubes, a spoon and biscuits to knock about, a watering can, a pendant lamp and a toy-plane mobile that
// swing on their cords, apples that drop when you buzz the tree, the cat's paw, and the radio switch.
//
// Props sit in the debris collision group: the helicopter, bags and wreckage push them about, the rotor
// never counts them as a strike, and a bump never counts as a crash. The lamp is the exception: it is
// solid enough to hurt (world group). The cat's paw is kinematic and only touches tea bags.

const grp = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
const PAW_GROUP = grp(G.WORLD, G.BAG);
const RHO = 1.2;
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(), _p = new THREE.Vector3();

// Prop definitions: shape, size, mass, where it starts, and how the air takes it.
function defs(lite) {
  const out = [];
  const T = 0; // kitchen table top
  // Gingham napkins: one on the kitchen table, one on the garden table. Flat plates that catch the wash.
  out.push({ id: 'napkin', shape: 'box', half: [0.055, 0.0015, 0.055], mass: 0.002, pos: [-0.3, T + 0.0016, 0.39], yaw: 0.3, air: 'plate', area: 0.0121, color: 0xc4473f });
  out.push({ id: 'napkin2', shape: 'box', half: [0.055, 0.0015, 0.055], mass: 0.002, pos: [0.3, GTABLE.top + 0.0016, -2.74], yaw: -0.4, air: 'plate', area: 0.0121, color: 0x3f6aa6 });
  out.push({ id: 'spoon', shape: 'spoon', half: [0.007, 0.003, 0.068], mass: 0.012, pos: [SPOON.x, T + 0.0031, SPOON.z + 0.04], yaw: SPOON.yaw });
  if (!lite) {
    out.push({ id: 'sugar1', shape: 'box', half: [0.008, 0.008, 0.008], mass: 0.0025, pos: [SUGAR.x + 0.07, T + 0.008, SUGAR.z + 0.05], yaw: 0.3 });
    out.push({ id: 'sugar2', shape: 'box', half: [0.008, 0.008, 0.008], mass: 0.0025, pos: [SUGAR.x + 0.088, T + 0.008, SUGAR.z + 0.028], yaw: 1.1 });
    out.push({ id: 'sugar3', shape: 'box', half: [0.008, 0.008, 0.008], mass: 0.0025, pos: [SUGAR.x + 0.078, T + 0.024, SUGAR.z + 0.04], yaw: 0.7 });
    // The top two biscuits on the plate (the bottom two are part of the plate).
    out.push({ id: 'biscuit1', shape: 'disc', r: 0.026, h: 0.006, mass: 0.008, pos: [PLATE.x + 0.007, PLATE.h * 0.6 + 0.004 + 2 * 0.0035 + 0.006, PLATE.z - 0.01], rot: [0.15, 0, 0.12], air: 'plate', area: 0.002 });
    out.push({ id: 'biscuit2', shape: 'disc', r: 0.026, h: 0.006, mass: 0.008, pos: [PLATE.x + 0.023, PLATE.h * 0.6 + 0.004 + 3 * 0.0035 + 0.012, PLATE.z + 0.01], rot: [-0.15, 0, 0.12], air: 'plate', area: 0.002 });
    out.push({ id: 'can', shape: 'can', half: [0.06, 0.085, 0.06], mass: 0.09, pos: [BIRDBATH.x + 0.34, ROOM.floorY + 0.086, BIRDBATH.z + 0.22], yaw: 2.2 });
  }
  return out;
}

export class Props {
  constructor(sim, lite = false) {
    this.sim = sim;
    this.lite = lite;
    this.items = [];
    this.apples = [];
    this.fixed = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const d of defs(lite)) this.items.push(this.make(d));
    this.lamp = this.pendulum('lamp', LAMP.x, LAMP.z, LAMP.length, 0.35, GROUPS.world, (add) => {
      add(RAPIER.ColliderDesc.cone(LAMP.shadeH / 2, LAMP.shadeR), 0, 0, 0);
      add(RAPIER.ColliderDesc.capsule(LAMP.length / 2 - 0.05, 0.005), 0, LAMP.length / 2 + 0.03, 0);
    }, { lin: 0.15, ang: 0.6 });
    this.mobile = this.pendulum('mobile', MOBILE.x, MOBILE.z, MOBILE.length, 0.03, GROUPS.debris, (add) => {
      add(RAPIER.ColliderDesc.cuboid(MOBILE.arm, 0.004, 0.004), 0, 0, 0);
      for (const s of [-1, 1]) add(RAPIER.ColliderDesc.cuboid(0.045 * MOBILE.scale, 0.012 * MOBILE.scale, 0.04 * MOBILE.scale), s * MOBILE.arm, -0.09 * MOBILE.scale, 0);
      add(RAPIER.ColliderDesc.capsule(MOBILE.length / 2 - 0.02, 0.002), 0, MOBILE.length / 2, 0);
    }, { lin: 0.3, ang: 0.08 });
    // The cat's paw: kinematic, animated in afterStep.
    const balls = catBalls();
    const chest = balls[1];
    this.cat = {
      shoulder: new THREE.Vector3(chest[0].x, chest[1] + 0.01, chest[0].z),
      fwd: new THREE.Vector3(Math.sin(CAT.yaw), 0, Math.cos(CAT.yaw)),
      rest: new THREE.Vector3(), paw: new THREE.Vector3(), target: new THREE.Vector3(), look: new THREE.Vector3(),
      t: -1, cool: 0, swipes: 0, alert: 0,
    };
    this.cat.rest.copy(this.cat.shoulder).addScaledVector(this.cat.fwd, 0.07).add(new THREE.Vector3(0, -0.12, 0));
    this.cat.paw.copy(this.cat.rest);
    this.paw = sim.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.cat.rest.x, this.cat.rest.y, this.cat.rest.z));
    const pc = sim.world.createCollider(RAPIER.ColliderDesc.capsule(0.03, 0.02).setCollisionGroups(PAW_GROUP).setFriction(0.9), this.paw);
    sim.register(pc, { kind: 'paw', material: 'fur' });
    this.radio = { on: false, landed: false, armed: true, onFor: 0, offFor: 0 };
    this.appleAcc = 0;
  }

  make(d) {
    const sim = this.sim;
    const rot = d.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...d.rot)) : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw || 0);
    const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...d.pos).setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
      .setLinearDamping(0.05).setAngularDamping(0.3).setCcdEnabled(d.mass < 0.01));
    let cd;
    if (d.shape === 'disc') cd = RAPIER.ColliderDesc.cylinder(d.h / 2, d.r);
    else if (d.shape === 'can') cd = RAPIER.ColliderDesc.cylinder(d.half[1], d.half[0]);
    else cd = RAPIER.ColliderDesc.cuboid(...d.half);
    cd.setMass(d.mass).setFriction(0.6).setRestitution(0.15).setCollisionGroups(GROUPS.debris);
    const c = sim.world.createCollider(cd, body);
    sim.register(c, { kind: 'prop', material: d.id.startsWith('sugar') ? 'sugar' : d.id === 'spoon' ? 'metal' : 'paper' });
    if (d.shape === 'can') {
      const spout = RAPIER.ColliderDesc.capsule(0.06, 0.009).setTranslation(0.1, 0.02, 0).setRotation(quatZ(-0.9)).setMass(0.005).setCollisionGroups(GROUPS.debris);
      sim.register(sim.world.createCollider(spout, body), { kind: 'prop', material: 'metal' });
    }
    return { def: d, body, track: new Track(body), home: { p: new THREE.Vector3(...d.pos), q: rot.clone() } };
  }

  // A rigid pendulum on a ball joint under the ceiling: the lamp and the mobile.
  pendulum(id, x, z, length, mass, group, build, damping) {
    const sim = this.sim;
    const y = ROOM.ceilingY - length;
    const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setLinearDamping(damping.lin).setAngularDamping(damping.ang).setCanSleep(true));
    let first = true;
    build((desc, lx, ly, lz) => {
      desc.setTranslation(lx, ly, lz).setCollisionGroups(group).setFriction(0.5).setRestitution(0.2);
      desc.setMass(first ? mass : mass * 0.05);
      first = false;
      const c = sim.world.createCollider(desc, body);
      sim.register(c, { kind: id === 'lamp' ? 'lamp' : 'prop', material: id === 'lamp' ? 'metal' : 'wood' });
    });
    const jd = RAPIER.JointData.spherical({ x, y: ROOM.ceilingY, z }, { x: 0, y: length, z: 0 });
    sim.world.createImpulseJoint(jd, this.fixed, body, true);
    return { id, body, track: new Track(body), length, home: new THREE.Vector3(x, y, z), spin: 0 };
  }

  // Air on a point: the sim's air field plus, beyond its table grid, a radial wall jet where a wake lands.
  airAt(p, out) {
    const air = this.sim.air;
    out.set(0, 0, 0);
    if (air.calm) return out;
    let close = false;
    for (const wk of air.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 0.9 && Math.abs(p.z - wk.hub.z) < 0.9) close = true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 0.9 && Math.abs(p.z - wk.hit.z) < 0.9) close = true;
    }
    if (!close && !air.near(p, 0.5)) return out;
    air.sample(p.x, p.y, p.z, out);
    const onGrid = p.x > air.x0 && p.x < air.x0 + air.nx * air.h && p.z > air.z0 && p.z < air.z0 + air.nz * air.h && Math.abs(p.y) < 0.2;
    if (onGrid) return out;
    for (const wk of air.wakes) {
      const dy = p.y - wk.hit.y;
      if (!wk.active || !wk.vg || dy < -0.01 || dy > 0.12) continue;
      const dx = p.x - wk.hit.x, dz = p.z - wk.hit.z, r = Math.hypot(dx, dz) + 1e-4, R = wk.footR;
      if (r > 8 * R) continue;
      const v = (r < R ? wk.vg * r / R : wk.vg * Math.pow(R / r, 0.6) * Math.exp(-(r - R) / (8 * R))) * Math.exp(-Math.max(0, p.y - wk.hit.y) / 0.035);
      out.x += dx / r * v; out.z += dz / r * v;
    }
    return out;
  }

  // Inflow above a rotor: air drawn down through the disc (only momentum theory, a gentle tug).
  inflow(p, out) {
    const heli = this.sim.heli;
    if (!heli) return out;
    for (const wk of this.sim.air.wakes) {
      if (!wk.active) continue;
      const gap = p.y - wk.hub.y, r = Math.hypot(p.x - wk.hub.x, p.z - wk.hub.z);
      if (gap < 0 || gap > 0.6 || r > wk.radius * 1.4) continue;
      const k = wk.vi * (1 - gap / 0.6) * (1 - r / (wk.radius * 1.4));
      out.y -= k;
      out.x -= (p.x - wk.hub.x) / (r + 0.02) * k * 0.4; // drawn in towards the disc
      out.z -= (p.z - wk.hub.z) / (r + 0.02) * k * 0.4;
    }
    return out;
  }

  applyForces(dt) {
    // Rapier keeps user forces until they're reset, so clear last step's before adding this step's.
    for (const it of this.items) {
      const d = it.def;
      if (!d.air) continue;
      if (it.pushed) { it.body.resetForces(false); it.body.resetTorques(false); it.pushed = false; }
      const t = it.body.translation();
      _p.set(t.x, t.y, t.z);
      this.airAt(_p, _a);
      if (_a.lengthSq() < 0.04) continue;
      const lv = it.body.linvel();
      _v.set(_a.x - lv.x, _a.y - lv.y, _a.z - lv.z);
      const r = it.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      _n.set(0, 1, 0).applyQuaternion(_q);
      const vn = _v.dot(_n), sp = _v.length();
      // Pressure on the face, a little skin friction, and lift from air running across a flat thing
      // lying near a surface (it gets under the edges): enough to flip a napkin in strong outwash.
      _f.copy(_n).multiplyScalar(0.5 * RHO * 1.2 * d.area * vn * Math.abs(vn));
      _f.addScaledVector(_v, 0.5 * RHO * 0.08 * d.area * sp).addScaledVector(_n, -vn * 0.5 * RHO * 0.08 * d.area * sp);
      // (Only while lying on something, and never more than a little over its weight: it flips and
      // skitters, it doesn't take off.)
      const tang = Math.sqrt(Math.max(0, sp * sp - vn * vn));
      if (t.y - surfaceY(t.x, t.z) < 0.012) _f.y += Math.min(1.25 * d.mass * 9.81, 0.5 * RHO * 0.55 * d.area * tang * tang * Math.abs(_n.y));
      // Apply slightly off-centre (a wandering corner) so things flutter and tumble rather than slide.
      const ph = this.sim.time * 7 + d.pos[0] * 13;
      const ex = d.half ? d.half[0] : d.r, ez = d.half ? d.half[2] : d.r;
      const off = _a.set(Math.cos(ph) * ex * 0.6, 0, Math.sin(ph * 1.3) * ez * 0.6).applyQuaternion(_q);
      // Never more than a few times its weight: a gust tumbles a napkin, it doesn't fire it across the room.
      const fmax = 3 * d.mass * 9.81, fl = _f.length();
      if (fl > fmax) _f.multiplyScalar(fmax / fl);
      it.body.addForceAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: t.x + off.x, y: t.y + off.y, z: t.z + off.z }, true);
      it.pushed = true;
    }
    // Lamp and mobile: drag on the shade / planes from the air around them.
    for (const pd of [this.lamp, this.mobile]) {
      if (pd.pushed) { pd.body.resetForces(false); pd.body.resetTorques(false); pd.pushed = false; }
      const t = pd.body.translation();
      _p.set(t.x, t.y, t.z);
      this.airAt(_p, _a);
      this.inflow(_p, _a);
      if (_a.lengthSq() < 0.01) continue;
      const lv = pd.body.linvel();
      _v.set(_a.x - lv.x, _a.y - lv.y, _a.z - lv.z);
      const area = pd.id === 'lamp' ? 0.08 : 0.01;
      _f.copy(_v).multiplyScalar(0.5 * RHO * 1.0 * area * _v.length());
      pd.body.addForce({ x: _f.x, y: _f.y, z: _f.z }, true);
      pd.pushed = true;
      if (pd.id === 'mobile') {
        // Swirl from the rotor below sets the planes turning (the rotor turns them one way only).
        const swirl = Math.min(2, Math.hypot(_a.x, _a.z) + Math.max(0, -_a.y));
        pd.body.addTorque({ x: 0, y: 2.5e-5 * swirl, z: 0 }, true);
      }
    }
  }

  afterStep(dt) {
    const sim = this.sim;
    for (const it of this.items) it.track.capture(it.body);
    this.lamp.track.capture(this.lamp.body);
    this.mobile.track.capture(this.mobile.body);
    for (const a of this.apples) a.track.capture(a.body);
    this.stepCat(dt);
    this.stepRadio();
    if (sim.stepCount % 12 === 0) this.stepApples(dt * 12);
  }

  // The cat watches whatever dangles, and swipes at tea bags that come within reach.
  stepCat(dt) {
    const C = this.cat, sim = this.sim;
    let near = null, nd = 0.62;
    for (const b of sim.cargoItems ? sim.cargoItems() : sim.bags) {
      const d = b.pos.distanceTo(C.shoulder);
      if (d < nd) { nd = d; near = b; }
    }
    if (near) C.look.copy(near.pos);
    else if (sim.heli && sim.heli.pos.distanceTo(C.shoulder) < 1.4) C.look.copy(sim.heli.pos);
    else C.look.copy(C.shoulder).addScaledVector(C.fwd, 1).setY(C.shoulder.y + 0.1);
    C.alert += ((near ? 1 : 0) - C.alert) * Math.min(1, dt * 3);
    C.cool -= dt;
    const reach = 0.3;
    if (C.t < 0 && near && nd < reach && C.cool <= 0 && near.pos.y > BENCH.seat - 0.02) {
      C.t = 0;
      C.target.copy(near.pos);
      C.swipes++;
      sim.emit('catSwipe', { pos: C.shoulder.clone() });
    }
    if (C.t >= 0) {
      C.t += dt;
      const t = C.t;
      // Wind up (lift and draw back), strike through the target, follow through, return.
      const dir = _v.copy(C.target).sub(C.shoulder);
      const L = Math.min(reach, dir.length());
      dir.normalize();
      const side = _n.set(-dir.z, 0, dir.x);
      let pos;
      if (t < 0.14) pos = C.rest.clone().lerp(C.shoulder.clone().addScaledVector(dir, 0.04).add(new THREE.Vector3(0, 0.08, 0)).addScaledVector(side, -0.05), t / 0.14);
      else if (t < 0.32) {
        const k = (t - 0.14) / 0.18;
        pos = C.shoulder.clone().addScaledVector(dir, 0.04 + (L + 0.04) * k).addScaledVector(side, -0.05 + 0.12 * k).add(new THREE.Vector3(0, 0.08 - 0.08 * k, 0));
      } else if (t < 0.7) {
        const k = (t - 0.32) / 0.38;
        pos = C.shoulder.clone().addScaledVector(dir, L + 0.08).addScaledVector(side, 0.07).lerp(C.rest, k * k * (3 - 2 * k));
      } else { pos = C.rest.clone(); C.t = -1; C.cool = 0.8 + Math.random() * 1.6; }
      C.paw.copy(pos);
      this.paw.setNextKinematicTranslation({ x: C.paw.x, y: C.paw.y, z: C.paw.z });
    } else C.paw.copy(C.rest);
  }

  // Land on the radio to switch it on (and again to switch it off).
  stepRadio() {
    const h = this.sim.heli, R = this.radio;
    const on = !!h && h.grounded && Math.abs(h.pos.x - RADIO.x) < RADIO.halfX + 0.04 && Math.abs(h.pos.z - RADIO.z) < RADIO.halfZ + 0.04 && h.pos.y > COUNTER.top + RADIO.h;
    // Debounced: settle on it for a moment to switch, and lift off properly before it can switch again.
    const dt = this.sim.dt;
    if (on) { R.onFor += dt; R.offFor = 0; } else { R.offFor += dt; R.onFor = 0; }
    if (R.offFor > 0.3) R.armed = true;
    if (R.armed && R.onFor > 0.25) { R.armed = false; R.on = !R.on; this.sim.emit('radio', { on: R.on }); }
    R.landed = on;
  }

  // Buzz the apple tree and an apple drops (at most a few at a time; they rot away).
  stepApples(dt) {
    const sim = this.sim;
    for (const a of [...this.apples]) {
      a.age += dt;
      if (a.age > 30) this.removeApple(a);
    }
    const max = this.lite ? 2 : 4;
    let shake = 0;
    for (const wk of sim.air.wakes) {
      if (!wk.active) continue;
      for (const [dx, y, dz, r] of TREE.canopy) {
        const d = Math.hypot(wk.hub.x - TREE.x - dx, wk.hub.y - y, wk.hub.z - TREE.z - dz);
        if (d < r + 0.25) shake = Math.max(shake, wk.vi * (1 - Math.max(0, d - r) / 0.25));
      }
    }
    if (shake > 0 && this.apples.length < max && Math.random() < shake * 0.08 * dt * 12) {
      const [dx, y, dz, r] = TREE.canopy[Math.floor(Math.random() * TREE.canopy.length)];
      const a = Math.random() * Math.PI * 2;
      const p = new THREE.Vector3(TREE.x + dx + Math.cos(a) * r * 0.75, y - r * 0.55, TREE.z + dz + Math.sin(a) * r * 0.75);
      const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setAngularDamping(0.6).setLinearDamping(0.02));
      const c = sim.world.createCollider(RAPIER.ColliderDesc.ball(0.034).setMass(0.09).setFriction(0.8).setRestitution(0.35).setCollisionGroups(GROUPS.debris), body);
      sim.register(c, { kind: 'prop', material: 'apple' });
      const apple = { body, collider: c, track: new Track(body), age: 0, id: Props.nextApple++, red: Math.random() < 0.7 };
      this.apples.push(apple);
      sim.emit('appleDrop', { apple });
    }
  }

  removeApple(a) {
    const i = this.apples.indexOf(a);
    if (i >= 0) this.apples.splice(i, 1);
    this.sim.unregister(a.collider);
    this.sim.world.removeRigidBody(a.body);
    this.sim.emit('appleGone', { id: a.id });
  }

  reset() {
    for (const it of this.items) {
      const { p, q } = it.home;
      it.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      it.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      it.track.capture(it.body); it.track.capture(it.body);
    }
    for (const pd of [this.lamp, this.mobile]) {
      pd.body.setTranslation({ x: pd.home.x, y: pd.home.y, z: pd.home.z }, true);
      pd.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      pd.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pd.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    for (const a of [...this.apples]) this.removeApple(a);
    if (this.radio.on) { this.radio.on = false; this.sim.emit('radio', { on: false }); }
  }
}
Props.nextApple = 1;

function quatZ(a) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a); return { x: q.x, y: q.y, z: q.z, w: q.w }; }
void CFG;
