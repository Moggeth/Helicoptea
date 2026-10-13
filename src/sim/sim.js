import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from './physics.js';
import { CFG } from '../config.js';
import { CUPS, PAD, STATION, STATIONS, DISCARD, TABLE } from './layout.js';
import { buildStaticWorld } from './staticWorld.js';
import { createAircraft, gearDrop, AIRCRAFT_IDS } from './aircraft.js';
import { TeaBag } from './teabag.js';
import { AirField } from './air.js';
import { MilkSystem } from './milk.js';

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
  constructor(i, S = STATION, station = 0) {
    this.index = i;
    this.station = station;
    this.tip = new THREE.Vector3(S.x + S.pegXs[i], S.y + S.pegY + 0.0045, S.z + S.pegReach - 0.004);
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
  constructor(opts = {}) {
    this.aircraft = AIRCRAFT_IDS.includes(opts.aircraft) ? opts.aircraft : 'micro';
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
    // Kitchen pegs first (pegs[1] is the kitchen's middle peg), then the garden stand's.
    this.pegs = STATIONS.flatMap((S, si) => S.pegXs.map((_, i) => new Peg(i, S, si)));
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
    this.air = new AirField(this);
    this.spawnHeli();
    for (const p of this.pegs) this.refillPeg(p);
    this.milk = new MilkSystem(this);
  }

  register(collider, info) { this.colliderInfo.set(collider.handle, info); }
  unregister(collider) { if (collider) this.colliderInfo.delete(collider.handle); }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  spawnHeli() {
    const pos = new THREE.Vector3(PAD.x, PAD.height + gearDrop(this.aircraft) + 0.0015, PAD.z);
    this.heli = createAircraft(this, this.aircraft, pos, 0);
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
      const hook = target.hook || 0;
      body1 = heli.body;
      anchor1 = new THREE.Vector3(...heli.def.hooks[hook]);
      endWorld = () => heli.hookWorlds[hook];
    }
    bag.updateCached();
    const endNow = endWorld();
    const dist = endNow.distanceTo(bag.anchorWorld);
    const length = Math.max(bag.ropeLength, dist + 0.001);
    const jd = RAPIER.JointData.rope(length, { x: anchor1.x, y: anchor1.y, z: anchor1.z }, { x: 0, y: bag.anchorY, z: 0 });
    const joint = this.world.createImpulseJoint(jd, body1, bag.body, true);
    bag.attach = { kind: target.kind, joint, length, peg: target.peg || null, heli: target.heli || null, hook: target.hook || 0, anchor: anchor1, endWorld };
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

  carriedBags() {
    return this.heli ? this.bags.filter((b) => b.attach && b.attach.kind === 'heli') : [];
  }

  // Everything on the hooks: bags plus the milk bucket.
  carriedCargo() {
    const out = this.carriedBags();
    const k = this.milk && this.milk.bucket;
    if (this.heli && k && k.attach && k.attach.kind === 'heli') out.push(k);
    return out;
  }

  cargoItems() { return this.milk && this.milk.bucket ? [...this.bags, this.milk.bucket] : this.bags; }

  // Nearest bag loop within reach of a free hook (proximity attach). The Chinook has three hooks.
  attachCandidateInfo() {
    if (!this.heli || this.state !== 'flying') return null;
    const hooks = this.heli.hookWorlds;
    const used = new Set(this.carriedCargo().map((b) => b.attach.hook));
    if (used.size >= hooks.length) return null;
    let best = null, bestD = CFG.cargo.attachRadius;
    for (const b of this.cargoItems()) {
      if (b.retiring || (b.attach && b.attach.kind === 'heli')) continue;
      b.loopPosition(_a);
      for (let i = 0; i < hooks.length; i++) {
        if (used.has(i)) continue;
        const d = _a.distanceTo(hooks[i]);
        if (d < bestD) { bestD = d; best = { bag: b, hook: i }; }
      }
    }
    return best;
  }

  attachCandidate() {
    const c = this.attachCandidateInfo();
    return c ? c.bag : null;
  }

  // Hook the bag in reach if there is one (and a free hook); otherwise release everything carried.
  toggleAttach() {
    if (this.state !== 'flying') return false;
    const cand = this.attachCandidateInfo();
    if (!cand) {
      const carried = this.carriedCargo();
      for (const b of carried) this.detachBag(b);
      return carried.length > 0;
    }
    const bag = cand.bag;
    const fromPeg = bag.attach && bag.attach.kind === 'peg';
    if (bag.attach) this.detachBag(bag, true);
    this.attachBag(bag, { kind: 'heli', heli: this.heli, hook: cand.hook });
    this.emit('attach', { bag, fromPeg, hook: cand.hook });
    return true;
  }

  // Switch aircraft: the current one is put away (not crashed) and the new one starts on the pad.
  setAircraft(id) {
    if (!AIRCRAFT_IDS.includes(id) || id === this.aircraft) return false;
    this.aircraft = id;
    this.restartFlight();
    this.emit('aircraft', { id });
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
    const def = heli.def;
    for (const b of this.carriedCargo()) this.detachBag(b, true);
    const pos = heli.pos.clone(), quat = heli.quat.clone(), vel = heli.vel.clone();
    const av = heli.body.angvel();
    const w = new THREE.Vector3(av.x, av.y, av.z);
    const up = heli.up.clone();
    const rotorPhase = heli.rotorPhase, rotorSpeed = heli.rotorSpeed;
    const blades = def.parts.filter((p) => p.blade).map((p) => (heli.bladePose ? heli.bladePose(p) : null));
    for (const c of heli.colliders) this.unregister(c);
    for (const r of heli.rotors) this.unregister(r);
    heli.destroy();
    this.heli = null;
    this.state = 'destroyed';
    const wreckId = ++this.wreckCount;
    const parts = [];
    const center = pos.clone().addScaledVector(up, -0.01);
    const heavy = def.scale > 1;
    let bladeN = 0;
    for (const part of def.parts) {
      const local = new THREE.Vector3(...part.pos);
      let localQ = new THREE.Quaternion();
      let spin = 1;
      const pose = part.blade ? blades[bladeN++] : null;
      if (pose) {
        local.copy(pose.pos);
        localQ.copy(pose.quat);
        spin = pose.spin;
      } else if (part.blade) {
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
      const light = part.mass < (heavy ? 0.0055 : 0.002);
      const kick = def.explosionImpulse * (0.65 + Math.random() * 0.7) * (light ? 1.35 : 0.85);
      v.addScaledVector(out, kick).addScaledVector(up, 0.5 + Math.random() * 0.4);
      // A shattered rotor keeps spinning (each rotor its own way); other parts tumble, big ones slower.
      const ang = part.blade
        ? up.clone().multiplyScalar(spin * rotorSpeed * (heavy ? 26 : 40) * (0.6 + Math.random() * 0.4))
        : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(part.mass > 0.01 ? 14 : 40);
      const d = new Debris(this, part, wp, wq, v, ang, wreckId);
      this.debris.push(d);
      parts.push(d);
    }
    // Shove nearby bags (and the bucket).
    for (const b of this.cargoItems()) {
      const dvec = b.pos.clone().sub(pos);
      const dist = dvec.length();
      const reach = 0.3 * def.scale;
      if (dist < reach) {
        const s = (1 - dist / reach) * 0.012 * def.scale;
        dvec.normalize().multiplyScalar(s);
        b.body.applyImpulse({ x: dvec.x, y: dvec.y + s * 0.5, z: dvec.z }, true);
      }
    }
    this.limitDebris();
    this.crashInfo = { reason, pos, vel, impact, time: this.time, wreckId, aircraft: def.id };
    this.emit('crash', { pos, vel, reason, impact, wreckId, parts, aircraft: def.id, scale: def.scale });
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
      for (const b of this.carriedCargo()) this.detachBag(b, true);
      for (const c of this.heli.colliders) this.unregister(c);
      for (const r of this.heli.rotors) this.unregister(r);
      this.heli.destroy();
      this.heli = null;
    }
    // Clear wreckage off the pad so the new helicopter doesn't spawn inside it.
    for (const d of [...this.debris]) {
      const t = d.body.translation();
      if (Math.hypot(t.x - PAD.x, t.z - PAD.z) < PAD.radius + 0.12 && t.y < 0.15) this.removeDebris(d);
    }
    this.spawnHeli();
    for (const p of this.pegs) this.refillPeg(p);
    // Guarantee usable cargo even if every bag slot was taken by bags in cups.
    if (!this.pegs.some((p) => p.bag && p.station === 0)) {
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
    this.milk.reset();
    this.air.clear();
    for (const p of this.pegs) { p.bag = null; }
    this.restartFlight();
    this.emit('reset', {});
  }

  // ---------- main step ----------
  step(ctl) {
    const t0 = performance.now();
    const dt = this.dt;
    for (const c of this.cups) c.steep = 0;
    if (this.stepCount % CFG.air.updateEvery === 0) this.air.update(dt * CFG.air.updateEvery);
    if (this.heli) this.heli.applyForces(dt, ctl, this.assist);
    for (const b of this.bags) b.applyForces(dt);
    this.milk.applyForces(dt, ctl);

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
        if (other.kind === 'debris') return; // loose wreckage nudges, it doesn't destroy
        anyContact = true;
        const dv = imp / this.heli.def.mass;
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
      for (const r of heli.rotors) {
        this.world.intersectionPairsWith(r, (other) => {
          const info = this.colliderInfo.get(other.handle);
          if (info && (info.kind !== 'heli')) rotorHit = true;
        });
      }
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

      if (impact > heli.def.impactDv) this.crash('impact', impact);
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
      this.updateRope(b);
    }
    this.milk.afterStep(dt);
    if (this.heli) {
      let load = 0;
      for (const b of this.carriedCargo()) load += b.tension;
      this.heli.load = load;
    }
    for (const d of this.debris) d.track.capture(d.body);
    this.stepDrips(dt);

    // Housekeeping at a low rate.
    if (this.stepCount % 12 === 0) this.housekeeping(dt * 12);
    this.lastStepMs = performance.now() - t0;
  }

  // Rope tension on the hook (for audio and debug).
  updateRope(b) {
    if (b.attach) {
      const d = b.anchorWorld.distanceTo(b.attach.endWorld());
      // A loop caught slightly beyond full string length is taken in while the string is slack.
      if (b.attach.kind === 'heli' && b.attach.length > b.ropeLength + 0.0005 && d < b.attach.length - 0.002 && this.stepCount % 6 === 0) {
        const heli = b.attach.heli;
        this.world.removeImpulseJoint(b.attach.joint, true);
        b.attach.length = Math.max(b.ropeLength, d + 0.001);
        const h = b.attach.anchor;
        const jd = RAPIER.JointData.rope(b.attach.length, { x: h.x, y: h.y, z: h.z }, { x: 0, y: b.anchorY, z: 0 });
        b.attach.joint = this.world.createImpulseJoint(jd, heli.body, b.body, true);
      }
      b.tension = d > b.attach.length * 0.985 ? b.mass * CFG.physics.gravity : 0;
    } else b.tension = 0;
  }

  housekeeping(dt) {
    this.milk.housekeeping(dt);
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
