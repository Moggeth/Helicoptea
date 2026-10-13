import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from './physics.js';
import { CFG } from '../config.js';
import { CUPS, PAD, STATION, DISCARD, TABLE } from './layout.js';
import { buildStaticWorld } from './staticWorld.js';
import { Helicopter, HELI_PARTS } from './helicopter.js';
import { TeaBag } from './teabag.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

class Cup {
  constructor(def) {
    Object.assign(this, def);
    this.floorY = def.baseY + def.bottom;
    this.topY = def.baseY + def.height;
    this.waterY = def.baseY + def.water;
    this.brew = 0;
    this.steep = 0;      // how strongly a bag is steeping right now (for the plume visual)
    this.bagPos = new THREE.Vector3(def.x, this.waterY, def.z);
  }
  surfaceOffset() { return 0; }
}

class Peg {
  constructor(i) {
    this.index = i;
    this.tip = new THREE.Vector3(STATION.x + STATION.pegXs[i], STATION.pegY + 0.0045, STATION.z + STATION.pegReach - 0.004);
    this.bag = null;
    this.emptyFor = 99;
  }
}

class Debris {
  constructor(sim, part, worldPos, worldQuat, vel, angvel, wreckId) {
    this.part = part;
    this.wreckId = wreckId;
    this.id = Debris.next++;
    this.born = sim.time;
    this.retiring = 0;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(worldPos.x, worldPos.y, worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w })
      .setLinvel(vel.x, vel.y, vel.z)
      .setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z })
      .setCcdEnabled(true)
      .setLinearDamping(0.05)
      .setAngularDamping(0.4);
    this.body = sim.world.createRigidBody(desc);
    const cd = RAPIER.ColliderDesc.cuboid(part.half[0], Math.max(part.half[1], 0.002), part.half[2])
      .setMass(part.mass).setFriction(0.6).setRestitution(0.28).setCollisionGroups(GROUPS.debris)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.01);
    this.collider = sim.world.createCollider(cd, this.body);
    sim.register(this.collider, { kind: 'debris', debris: this });
    this.track = new Track(this.body);
    this.smoke = part.name === 'fuselage' ? 2.6 : (part.name === 'tailBoom' ? 1.2 : 0);
  }
}
Debris.next = 1;

export class Sim {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -CFG.physics.gravity, z: 0 });
    this.dt = 1 / CFG.physics.hz;
    this.world.timestep = this.dt;
    const ip = this.world.integrationParameters;
    ip.lengthUnit = CFG.physics.lengthUnit;
    ip.numSolverIterations = CFG.physics.solverIterations;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.colliderInfo = new Map();
    this.time = 0;
    this.stepCount = 0;
    this.events = [];
    this.assist = true;
    this.cups = CUPS.map((c) => new Cup(c));
    this.pegs = STATION.pegXs.map((_, i) => new Peg(i));
    this.bags = [];
    this.debris = [];
    this.drips = [];
    this.heli = null;
    this.state = 'flying'; // 'flying' | 'destroyed'
    this.crashInfo = null;
    this.wreckCount = 0;
    this.lastStepMs = 0;
    this.heliId = 0;
    buildStaticWorld(this);
    this.spawnHeli();
    for (const p of this.pegs) this.refillPeg(p);
  }

  register(collider, info) { this.colliderInfo.set(collider.handle, info); }
  unregister(collider) { if (collider) this.colliderInfo.delete(collider.handle); }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  spawnHeli() {
    const H = CFG.heli;
    const pos = new THREE.Vector3(PAD.x, PAD.height + H.skidDrop + 0.0015, PAD.z);
    this.heli = new Helicopter(this, pos, 0);
    for (const c of this.heli.colliders) this.colliderInfo.get(c.handle).heli = this.heli;
    this.heliId++;
    this.state = 'flying';
    this.crashInfo = null;
  }

  // ---------- bags ----------
  refillPeg(peg) {
    if (peg.bag) return;
    if (!this.makeRoomForBag()) return;
    const quat = new THREE.Quaternion(); // hanging upright, face towards +z
    const anchorY = peg.tip.y - CFG.cargo.ropeLength * 0.995;
    const pos = new THREE.Vector3(peg.tip.x, anchorY - CFG.cargo.bagHalf[1], peg.tip.z);
    const bag = new TeaBag(this, pos, quat);
    this.bags.push(bag);
    this.attachBag(bag, { kind: 'peg', peg });
    peg.bag = bag;
    peg.emptyFor = 0;
    this.emit('bagSpawn', { bag });
  }

  makeRoomForBag() {
    if (this.bags.length < CFG.cargo.maxBags) return true;
    // Retire the least interesting free bag: off-table first, then spent/discarded, never one brewing if avoidable.
    let best = null, bestScore = -Infinity;
    for (const b of this.bags) {
      if (b.attach || b.retiring) continue;
      let score = (this.time - b.born) * 0.01;
      if (b.pos.y < -0.05) score += 10;
      if (this.onDiscard(b)) score += 5;
      if (!b.cup) score += 3;
      score += (1 - b.potency) * 2;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (!best) return false;
    this.removeBag(best);
    return true;
  }

  onDiscard(b) {
    const dx = b.pos.x - DISCARD.x, dz = b.pos.z - DISCARD.z;
    return dx * dx + dz * dz < DISCARD.radius * DISCARD.radius && b.pos.y < 0.05;
  }

  removeBag(bag) {
    const i = this.bags.indexOf(bag);
    if (i >= 0) this.bags.splice(i, 1);
    for (const p of this.pegs) if (p.bag === bag) p.bag = null;
    this.unregister(bag.collider);
    bag.destroy();
    this.emit('bagRemoved', { id: bag.id });
  }

  attachBag(bag, target) {
    const C = CFG.cargo;
    let body1, anchor1, endWorld;
    if (target.kind === 'peg') {
      body1 = this.fixedBody || (this.fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
      anchor1 = target.peg.tip.clone();
      endWorld = () => target.peg.tip;
    } else {
      const heli = target.heli;
      body1 = heli.body;
      const h = CFG.heli.hookOffset;
      anchor1 = new THREE.Vector3(h[0], h[1], h[2]);
      endWorld = () => heli.hookWorld;
    }
    bag.updateCached();
    const endNow = endWorld();
    const dist = endNow.distanceTo(bag.anchorWorld);
    const length = Math.max(C.ropeLength, dist + 0.001);
    const jd = RAPIER.JointData.rope(length, { x: anchor1.x, y: anchor1.y, z: anchor1.z }, { x: 0, y: C.bagHalf[1], z: 0 });
    const joint = this.world.createImpulseJoint(jd, body1, bag.body, true);
    bag.attach = { kind: target.kind, joint, length, peg: target.peg || null, heli: target.heli || null, endWorld };
  }

  detachBag(bag, silent = false) {
    if (!bag.attach) return;
    const a = bag.attach;
    if (a.joint && this.world.getImpulseJoint(a.joint.handle)) this.world.removeImpulseJoint(a.joint, true);
    if (a.kind === 'peg' && a.peg) { a.peg.bag = null; a.peg.emptyFor = 0; }
    bag.attach = null;
    if (!silent) this.emit('release', { bag });
  }

  carriedBag() {
    if (!this.heli) return null;
    for (const b of this.bags) if (b.attach && b.attach.kind === 'heli') return b;
    return null;
  }

  // Nearest bag loop within reach of the hook (proximity attach).
  attachCandidate() {
    if (!this.heli || this.state !== 'flying' || this.carriedBag()) return null;
    let best = null, bestD = CFG.cargo.attachRadius;
    for (const b of this.bags) {
      if (b.retiring) continue;
      b.loopPosition(_a);
      const d = _a.distanceTo(this.heli.hookWorld);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  toggleAttach() {
    if (this.state !== 'flying') return false;
    const carried = this.carriedBag();
    if (carried) { this.detachBag(carried); return true; }
    const cand = this.attachCandidate();
    if (!cand) return false;
    const fromPeg = cand.attach && cand.attach.kind === 'peg';
    if (cand.attach) this.detachBag(cand, true);
    this.attachBag(cand, { kind: 'heli', heli: this.heli });
    this.emit('attach', { bag: cand, fromPeg });
    return true;
  }

  spawnDrip(bag) {
    if (this.drips.length > 80) return;
    // Drip from the lowest point of the bag.
    _a.set(0, -CFG.cargo.bagHalf[1], 0).applyQuaternion(bag.quat).add(bag.pos);
    _b.set(CFG.cargo.bagHalf[0] * (Math.random() * 1.6 - 0.8), CFG.cargo.bagHalf[1], 0).applyQuaternion(bag.quat).add(bag.pos);
    const p = _a.y < _b.y ? _a.clone() : _b.clone();
    this.drips.push({ p, v: bag.vel.clone().multiplyScalar(0.8), age: 0, brew: bag.cup ? bag.cup.brew : 0.5 * (1 - bag.potency) + 0.35 });
  }

  stepDrips(dt) {
    const g = CFG.physics.gravity;
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      d.age += dt;
      d.v.y -= g * dt;
      d.p.addScaledVector(d.v, dt);
      let landed = null;
      for (const c of this.cups) {
        const dx = d.p.x - c.x, dz = d.p.z - c.z;
        if (dx * dx + dz * dz < c.rIn * c.rIn && d.p.y < c.waterY) { landed = { cup: c }; break; }
        if (dx * dx + dz * dz < c.rOut * c.rOut && d.p.y < c.topY && d.p.y > c.topY - 0.01) { landed = { surface: true }; break; }
      }
      if (!landed && d.p.y < 0.0 && Math.abs(d.p.x) < TABLE.halfX && Math.abs(d.p.z) < TABLE.halfZ) landed = { surface: true };
      if (!landed && (d.p.y < -0.76 || d.age > 3)) landed = { lost: true };
      if (landed) {
        if (!landed.lost) this.emit('drip', { pos: d.p.clone(), cup: landed.cup || null, brew: d.brew });
        this.drips.splice(i, 1);
      }
    }
  }

  // ---------- crash ----------
  crash(reason, impact = 1.5) {
    if (this.state !== 'flying' || !this.heli) return;
    const heli = this.heli;
    const carried = this.carriedBag();
    if (carried) this.detachBag(carried, true);
    const pos = heli.pos.clone(), quat = heli.quat.clone(), vel = heli.vel.clone();
    const av = heli.body.angvel();
    const w = new THREE.Vector3(av.x, av.y, av.z);
    const up = heli.up.clone();
    const rotorPhase = heli.rotorPhase, rotorSpeed = heli.rotorSpeed;
    for (const c of heli.colliders) this.unregister(c);
    this.unregister(heli.rotor);
    heli.destroy();
    this.heli = null;
    this.state = 'destroyed';
    const wreckId = ++this.wreckCount;
    const parts = [];
    const center = pos.clone().addScaledVector(up, -0.01);
    for (const part of HELI_PARTS) {
      const local = new THREE.Vector3(...part.pos);
      let localQ = new THREE.Quaternion();
      if (part.blade) {
        const ang = rotorPhase + (part.blade > 0 ? 0 : Math.PI);
        local.set(Math.cos(ang) * 0.05, part.pos[1], -Math.sin(ang) * 0.05);
        // Blade B's model is already turned half a revolution, so both share the rotor phase.
        localQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotorPhase);
      }
      const wp = local.clone().applyQuaternion(quat).add(pos);
      const wq = quat.clone().multiply(localQ);
      const r = wp.clone().sub(pos);
      const v = vel.clone().add(new THREE.Vector3().crossVectors(w, r));
      const out = wp.clone().sub(center);
      if (out.lengthSq() < 1e-8) out.set(Math.random() - 0.5, 0.5, Math.random() - 0.5);
      out.normalize();
      const kick = CFG.crash.explosionImpulse * (0.65 + Math.random() * 0.7) * (part.mass < 0.002 ? 1.35 : 0.85);
      v.addScaledVector(out, kick).addScaledVector(up, 0.5 + Math.random() * 0.4);
      // A shattered rotor keeps spinning; other parts tumble.
      const ang = part.blade
        ? up.clone().multiplyScalar(rotorSpeed * 40 * (0.6 + Math.random() * 0.4))
        : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(40);
      const d = new Debris(this, part, wp, wq, v, ang, wreckId);
      this.debris.push(d);
      parts.push(d);
    }
    // Shove nearby bags.
    for (const b of this.bags) {
      const dvec = b.pos.clone().sub(pos);
      const dist = dvec.length();
      if (dist < 0.3) {
        const s = (1 - dist / 0.3) * 0.012;
        dvec.normalize().multiplyScalar(s);
        b.body.applyImpulse({ x: dvec.x, y: dvec.y + s * 0.5, z: dvec.z }, true);
      }
    }
    this.limitDebris();
    this.crashInfo = { reason, pos, vel, impact, time: this.time, wreckId };
    this.emit('crash', { pos, vel, reason, impact, wreckId, parts });
  }

  limitDebris() {
    while (this.debris.length > CFG.crash.maxDebris) {
      const oldest = this.debris[0].wreckId;
      for (const d of this.debris.filter((x) => x.wreckId === oldest)) this.removeDebris(d);
    }
  }

  removeDebris(d) {
    const i = this.debris.indexOf(d);
    if (i >= 0) this.debris.splice(i, 1);
    this.unregister(d.collider);
    this.world.removeRigidBody(d.body);
    this.emit('debrisRemoved', { id: d.id });
  }

  // ---------- flow ----------
  restartFlight() {
    if (this.heli) {
      const carried = this.carriedBag();
      if (carried) this.detachBag(carried, true);
      for (const c of this.heli.colliders) this.unregister(c);
      this.unregister(this.heli.rotor);
      this.heli.destroy();
      this.heli = null;
    }
    this.spawnHeli();
    for (const p of this.pegs) this.refillPeg(p);
    // Guarantee usable cargo even if every bag slot was taken by bags in cups.
    if (!this.pegs.some((p) => p.bag)) {
      const p = this.pegs[1];
      const victim = this.bags.find((b) => !b.attach);
      if (victim) this.removeBag(victim);
      this.refillPeg(p);
    }
    this.emit('restart', {});
  }

  resetSandbox() {
    for (const b of [...this.bags]) this.removeBag(b);
    for (const d of [...this.debris]) this.removeDebris(d);
    this.drips.length = 0;
    for (const c of this.cups) { c.brew = 0; c.steep = 0; }
    for (const p of this.pegs) { p.bag = null; }
    this.restartFlight();
    this.emit('reset', {});
  }

  // ---------- main step ----------
  step(ctl) {
    const t0 = performance.now();
    const dt = this.dt;
    for (const c of this.cups) c.steep = 0;
    if (this.heli) this.heli.applyForces(dt, ctl, this.assist);
    for (const b of this.bags) b.applyForces(dt);

    this.world.step(this.eventQueue);
    this.time += dt;
    this.stepCount++;

    let impact = 0, impactPos = null, anyContact = false, bagHeliHit = 0;
    this.eventQueue.drainContactForceEvents((ev) => {
      const i1 = this.colliderInfo.get(ev.collider1());
      const i2 = this.colliderInfo.get(ev.collider2());
      if (!i1 || !i2) return;
      const imp = ev.totalForceMagnitude() * dt;
      const heliInfo = i1.kind === 'heli' ? i1 : (i2.kind === 'heli' ? i2 : null);
      if (heliInfo) {
        const other = heliInfo === i1 ? i2 : i1;
        if (other.kind === 'bag') { bagHeliHit = Math.max(bagHeliHit, imp); return; }
        anyContact = true;
        const dv = imp / CFG.heli.mass;
        if (dv > impact) { impact = dv; impactPos = other; }
        return;
      }
      const bagInfo = i1.kind === 'bag' ? i1 : (i2.kind === 'bag' ? i2 : null);
      if (bagInfo) {
        const other = bagInfo === i1 ? i2 : i1;
        const dv = imp / bagInfo.bag.mass;
        if (dv > 0.12) this.emit('bagHit', { pos: bagInfo.bag.pos.clone(), dv, material: other.material || other.kind });
        return;
      }
      const debInfo = i1.kind === 'debris' ? i1 : (i2.kind === 'debris' ? i2 : null);
      if (debInfo) {
        const dv = imp / debInfo.debris.part.mass;
        if (dv > 0.35) {
          const t = debInfo.debris.body.translation();
          this.emit('clatter', { pos: new THREE.Vector3(t.x, t.y, t.z), dv });
        }
      }
    });

    if (this.heli) {
      const heli = this.heli;
      heli.afterStep();
      // Rotor strike: blades touching scenery.
      let rotorHit = false;
      this.world.intersectionPairsWith(heli.rotor, (other) => {
        const info = this.colliderInfo.get(other.handle);
        if (info && (info.kind !== 'heli')) rotorHit = true;
      });
      const speed = heli.vel.length();
      // Impact severity: velocity change not explained by flight forces, summed over a few ms
      // (contacts are often resolved across two or three steps).
      // Resting support (at most gravity per step) is not an impact.
      const dvStep = anyContact ? Math.max(0, heli.vel.distanceTo(heli.predVel) - CFG.physics.gravity * dt * 1.1) : 0;
      heli.impactAcc = heli.impactAcc * Math.pow(0.5, dt / 0.012) + dvStep;
      impact = Math.max(impact, heli.impactAcc);
      if (rotorHit && heli.rotorSpeed > 0.4) {
        heli.rotorContact += dt * (1 + speed * 6);
        if (Math.random() < 0.3) this.emit('rotorTick', { pos: heli.pos.clone() });
      } else heli.rotorContact = Math.max(0, heli.rotorContact - dt * 0.5);

      if (impact > CFG.crash.impactDv) this.crash('impact', impact);
      else if (rotorHit && speed > CFG.crash.rotorStrikeSpeed) this.crash('rotor strike', speed);
      else if (heli.rotorContact > CFG.crash.rotorStrikeBudget) this.crash('rotor strike', speed);
      else if (anyContact && heli.up.y < CFG.crash.rolloverUpY) this.crash('rollover', 1);
      else if (heli.pos.y < -0.72 && heli.up.y < 0.5) this.crash('floor', 1);
      else if (impact > CFG.crash.bumpDv) this.emit('bump', { pos: heli.pos.clone(), dv: impact });
      if (bagHeliHit > 0.0005) this.emit('bagHit', { pos: heli.pos.clone(), dv: bagHeliHit / 0.004, material: 'heli' });
    }

    for (const b of this.bags) {
      b.afterStep(dt);
      // Splash on entry.
      const imm = b.immersion > 0.05;
      if (imm && !b.wasImmersed) this.emit('splash', { cup: b.cup, pos: b.pos.clone(), speed: Math.abs(b.vel.y) + 0.3 * Math.hypot(b.vel.x, b.vel.z), bag: b });
      if (!imm && b.wasImmersed && b.vel.y > 0.05) this.emit('extract', { pos: b.pos.clone(), speed: b.vel.y, bag: b });
      b.wasImmersed = imm;
      // Rope tension on the hook (for audio and debug).
      if (b.attach) {
        const d = b.anchorWorld.distanceTo(b.attach.endWorld());
        // A loop caught slightly beyond full string length is taken in while the string is slack.
        if (b.attach.kind === 'heli' && b.attach.length > CFG.cargo.ropeLength + 0.0005 && d < b.attach.length - 0.002 && this.stepCount % 6 === 0) {
          const heli = b.attach.heli;
          this.world.removeImpulseJoint(b.attach.joint, true);
          b.attach.length = Math.max(CFG.cargo.ropeLength, d + 0.001);
          const h = CFG.heli.hookOffset;
          const jd = RAPIER.JointData.rope(b.attach.length, { x: h[0], y: h[1], z: h[2] }, { x: 0, y: CFG.cargo.bagHalf[1], z: 0 });
          b.attach.joint = this.world.createImpulseJoint(jd, heli.body, b.body, true);
        }
        b.tension = d > b.attach.length * 0.985 ? b.mass * CFG.physics.gravity : 0;
      } else b.tension = 0;
    }
    if (this.heli) {
      const cb = this.carriedBag();
      this.heli.load = cb ? cb.tension : 0;
    }
    for (const d of this.debris) d.track.capture(d.body);
    this.stepDrips(dt);

    // Housekeeping at a low rate.
    if (this.stepCount % 12 === 0) this.housekeeping(dt * 12);
    this.lastStepMs = performance.now() - t0;
  }

  housekeeping(dt) {
    for (const p of this.pegs) {
      if (!p.bag) {
        p.emptyFor += dt;
        if (p.emptyFor > CFG.cargo.pegRefillDelay) this.refillPeg(p);
      }
    }
    for (const b of [...this.bags]) {
      if (b.pos.y < -0.6) b.lowSince += dt; else b.lowSince = 0;
      if (b.lowSince > 6 && !b.attach) this.removeBag(b);
    }
    for (const d of [...this.debris]) {
      if (this.time - d.born > CFG.crash.debrisLife) this.removeDebris(d);
    }
  }
}
