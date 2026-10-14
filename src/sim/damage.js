import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';
import { CFG } from '../config.js';

// Damage model: what rotor and tail strikes do to a live aircraft before (and instead of) the final crash.
//   Blade wear     light rotor contact chips the blades: lift falls off and a 1/rev shake grows.
//   Rotor shatter  a fast strike (or worn-out blades) throws the blades off as debris; the rotor's angular
//                  momentum whips the airframe round and it falls as a hulk until it hits something.
//                  The Chinook can lose one rotor and keep the other: it pitches over violently.
//   Tail strike    the tail rotor is fragile: any contact takes it off. With no anti-torque the main rotor's
//                  reaction spins the airframe up, faster with more collective, and it spirals down.
//   Tea            the cabin going under the tea floods it (a dunk crash); blade tips in the tea chip them.
// Everything here is presentation-free: it emits events (rotorTick, rotorShatter, tailStrike, teaStrike)
// and decides the crash reason and kind. With rotor strikes off, blades pass through scenery harmlessly.
export const DAMAGE = {
  wearLoss: 0.35,        // share of a rotor's lift gone with fully worn blades
  shake: 0.4,            // 1/rev shake torque at full wear, x cyclic authority
  hulkTime: 1.2,         // s a rotorless hulk falls before it is called a crash anyway
  oneRotorTime: 2.6,     // s the Chinook flies on one rotor before it is called a crash anyway
  shedKick: 9,           // rad/s of yaw the airframe picks up when a rotor stops dead (scaled by its size)
  tailSpin: 9,           // rad/s terminal spin at hover thrust with no tail rotor (micro; larger ones turn slower)
  spinLag: 0.6,          // s spin-up time constant
  teaWear: 3.5,
  shedRecoil: 0.4,       // m/s the airframe is thrown back off what its blades bit into
  tailRecoil: 0.18,          // blade wear per second with the tips in the tea
};

export const CRASH_KINDS = { impact: 'impact', 'rotor strike': 'shatter', 'tail strike': 'spin', rollover: 'thrash', floor: 'fall', fall: 'fall', dunk: 'dunk' };

const FALL_SPEED = 2.0, FALL_BELOW = -0.35; // hitting at this speed down at floor or garden level is a long fall
const MICRO_TAIL = { hub: [-0.006, 0.026, 0.152], r: 0.0172 };
const CABIN = { micro: ['fuselage', 'tailBoom'], chinook: ['noseCab', 'cabin', 'aftCabin'], skycrane: ['cockpit', 'spine', 'engines'] };
const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Rotor geometry per aircraft (body frame): hubs, spin direction about body Y, which rotor each blade is on.
export function rotorsOf(type) {
  if (type === 'chinook') return CFG.chinook.hubs.map((h, i) => ({ hub: h, dir: i ? -1 : 1 }));
  if (type === 'skycrane') return [{ hub: CFG.skycrane.hub, dir: 1 }];
  return [{ hub: CFG.heli.rotorHubOffset, dir: 1 }];
}
export function tailOf(type) {
  if (type === 'skycrane') return { hub: CFG.skycrane.tailHub, r: CFG.skycrane.tailRadius };
  if (type === 'micro') return MICRO_TAIL;
  return null; // the Chinook has no tail rotor
}
const bladeRotor = (part) => (typeof part.blade === 'object' ? part.blade.rotor : 0);

// Local pose of a blade (as the crash code places them).
export function bladeLocal(heli, part) {
  if (heli.bladePose) return heli.bladePose(part);
  const ang = heli.rotorPhase + (part.blade > 0 ? 0 : Math.PI);
  return {
    pos: new THREE.Vector3(Math.cos(ang) * 0.05, part.pos[1], -Math.sin(ang) * 0.05),
    quat: new THREE.Quaternion().setFromAxisAngle(Y, heli.rotorPhase),
    spin: 1,
  };
}

export class Damage {
  constructor(sim) {
    this.sim = sim;
    this.rotorStrikes = true;   // settings toggle (on by default)
  }

  // A fresh aircraft: clean state, plus a tail-rotor sensor on the micro heli (the skycrane has its own).
  attach(heli) {
    const sim = this.sim;
    const rotors = rotorsOf(heli.type);
    heli.dmg = { wear: rotors.map(() => 0), shed: 0, tail: false, hulk: false, shedT: 0, tickT: 0, teaT: 0, spin: 0 };
    heli.shed = new Set();
    heli.dmg.sensors = heli.rotors.map((c, i) => ({ c, rotor: i, tail: heli.type === 'skycrane' && i === 1 }));
    if (heli.type === 'micro') {
      const T = MICRO_TAIL;
      const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      const c = sim.world.createCollider(RAPIER.ColliderDesc.cylinder(0.002, T.r).setTranslation(...T.hub)
        .setRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w }).setSensor(true).setDensity(0).setCollisionGroups(GROUPS.rotor), heli.body);
      sim.register(c, { kind: 'rotor', rotorIndex: 1, tail: true });
      heli.rotors.push(c);
      heli.dmg.sensors.push({ c, rotor: 1, tail: true });
    }
    // Probe points on the cabin (corners and centre of its boxes), for tea.
    const names = CABIN[heli.type] || [];
    heli.dmg.probes = [];
    for (const p of heli.def.parts) {
      if (!names.includes(p.name)) continue;
      const [hx, hy, hz] = p.half.map((h) => h * 0.95);
      heli.dmg.probes.push(new THREE.Vector3(...p.pos));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) heli.dmg.probes.push(new THREE.Vector3(p.pos[0] + sx * hx, p.pos[1] + sy * hy, p.pos[2] + sz * hz));
    }
  }

  mainCount(heli) { return heli.dmg.wear.length; }
  allShed(heli) { const n = this.mainCount(heli); return (heli.dmg.shed & ((1 << n) - 1)) === (1 << n) - 1; }

  // ------------------------------------------------------------- forces
  // A hulk (every main rotor gone) skips the flight model: gravity, a little drag, the rotor winding down.
  hulkStep(heli, dt) {
    const D = heli.dmg;
    if (!D || !D.hulk) return false;
    const body = heli.body;
    heli.updateCached();
    body.resetForces(true);
    body.resetTorques(true);
    const m = body.mass(), v = heli.vel, sp = v.length();
    _a.copy(v).multiplyScalar(-0.02 * sp * (heli.def.scale || 1));
    body.addForce({ x: _a.x, y: _a.y, z: _a.z }, true);
    heli.predVel.copy(v).addScaledVector(_a, dt / m);
    heli.predVel.y -= CFG.physics.gravity * dt;
    heli.rotorSpeed *= Math.exp(-dt / 0.25);
    heli.thrust = 0; heli.thrustFrac = 0;
    if (heli.rotorT) heli.rotorT.fill(0);
    heli.rotorPhase += heli.rotorSpeed * 30 * dt;
    heli.tailPhase += heli.rotorSpeed * 120 * dt;
    if (heli.hose) heli.hose.applyForces(dt, this.sim.milk.vessels);
    return true;
  }

  // After the flight model: worn rotors lose lift and shake; a shed rotor makes none; no tail rotor, no anti-torque.
  afterForces(heli, dt) {
    const D = heli.dmg;
    if (!D) return;
    const body = heli.body;
    const rotors = rotorsOf(heli.type);
    const I = body.principalInertia();
    let fx = 0, fy = 0, fz = 0;
    for (let i = 0; i < rotors.length; i++) {
      const gone = D.shed & (1 << i);
      const wear = D.wear[i];
      if (!gone && wear < 0.01) continue;
      const T = heli.rotorT ? heli.rotorT[i] : heli.thrust;
      const loss = gone ? 1 : wear * DAMAGE.wearLoss;
      const hub = _b.set(...rotors[i].hub).applyQuaternion(heli.quat).add(heli.pos);
      _a.copy(heli.up).multiplyScalar(-loss * T);
      body.addForceAtPoint({ x: _a.x, y: _a.y, z: _a.z }, { x: hub.x, y: hub.y, z: hub.z }, true);
      fx += _a.x; fy += _a.y; fz += _a.z;
      if (!gone) {
        // Out-of-balance blades: a torque in the disc plane turning once per revolution.
        const ph = heli.phaseOf ? heli.phaseOf(i) : heli.rotorPhase;
        const amp = wear * DAMAGE.shake * I.x * 12 * heli.rotorSpeed * heli.rotorSpeed;
        _c.set(Math.cos(ph) * amp, 0, Math.sin(ph) * amp).applyQuaternion(heli.quat);
        body.addTorque({ x: _c.x, y: _c.y, z: _c.z }, true);
      }
    }
    heli.predVel.x += fx * dt / body.mass(); heli.predVel.y += fy * dt / body.mass(); heli.predVel.z += fz * dt / body.mass();
    if (D.tail) {
      // Remove every yaw moment the flight model made (pedals, assist, tail rotor, reaction, damping) and put
      // back the unbalanced main-rotor reaction against plain aerodynamic damping.
      const t = body.userTorque();
      _c.set(t.x, t.y, t.z);
      const up = heli.up;
      _c.addScaledVector(up, -_c.dot(up));
      const av = body.angvel();
      const wy = _w.set(av.x, av.y, av.z).dot(up);
      const damp = I.y / DAMAGE.spinLag;
      const k = 1 / Math.sqrt(heli.def.scale || 1);
      const reaction = -rotorsOf(heli.type)[0].dir * damp * DAMAGE.tailSpin * k * (heli.def.thrustToWeight || 2) * heli.thrustFrac;
      _c.addScaledVector(up, reaction - damp * wy);
      body.resetTorques(true);
      body.addTorque({ x: _c.x, y: _c.y, z: _c.z }, true);
      D.spin = wy;
    }
  }

  // ------------------------------------------------------------- contacts
  // Rotor and tail sensors against the world. Returns true if any blade touched something.
  contacts(heli, dt, speed) {
    const sim = this.sim, D = heli.dmg;
    if (!D) return false;
    let any = false;
    D.tickT -= dt;
    if (D.shed) D.shedT += dt;
    for (const s of D.sensors) {
      const bit = s.tail ? 4 : 1 << s.rotor;
      if (D.shed & bit) continue;
      let hit = null;
      sim.world.intersectionPairsWith(s.c, (other) => {
        const info = sim.colliderInfo.get(other.handle);
        if (info && info.kind !== 'heli' && !hit) hit = { info, other };
      });
      if (!hit) continue;
      any = true;
      if (heli.rotorSpeed < 0.4) continue;
      const point = this.contactPoint(heli, s, hit.other);
      const material = hit.info.material || hit.info.kind;
      if (!this.rotorStrikes) {
        // Blades pass through: a light brush now and then, nothing more.
        if (D.tickT <= 0) { D.tickT = 0.12; sim.emit('rotorTick', { pos: point, material, harmless: true }); }
        continue;
      }
      if (s.tail) { if (!D.hulk) this.loseTail(heli, point, material); continue; }
      D.wear[s.rotor] = Math.min(1, D.wear[s.rotor] + dt * (1 + speed * 6) / CFG.crash.rotorStrikeBudget);
      if (D.tickT <= 0) { D.tickT = 0.035; sim.emit('rotorTick', { pos: point, material, wear: D.wear[s.rotor] }); }
      if (speed > CFG.crash.rotorStrikeSpeed || D.wear[s.rotor] >= 1) this.shedRotor(heli, s.rotor, point, material);
    }
    heli.rotorContact = Math.max(...D.wear) * CFG.crash.rotorStrikeBudget; // telemetry: the old contact budget
    return any;
  }

  // Where on the disc the blades met the obstacle: towards the nearest point of it, at about 90% span.
  contactPoint(heli, s, other) {
    const T = s.tail ? tailOf(heli.type) : null;
    const hubL = T ? T.hub : rotorsOf(heli.type)[s.rotor].hub;
    const hub = _b.set(...hubL).applyQuaternion(heli.quat).add(heli.pos);
    const axis = T ? _c.set(1, 0, 0).applyQuaternion(heli.quat) : _c.copy(heli.up);
    const pr = other.projectPoint({ x: hub.x, y: hub.y, z: hub.z }, false);
    const t = pr ? pr.point : other.translation();
    _a.set(t.x, t.y, t.z).sub(hub);
    _a.addScaledVector(axis, -_a.dot(axis));
    if (_a.lengthSq() < 1e-10) _a.set(1, 0, 0);
    const r = T ? T.r : heli.def.rotorRadius;
    return _a.setLength(r * 0.9).add(hub).clone();
  }

  loseTail(heli, point, material) {
    const D = heli.dmg;
    if (D.tail) return;
    D.tail = true;
    D.shed |= 4;
    const T = tailOf(heli.type);
    const hub = new THREE.Vector3(...T.hub).applyQuaternion(heli.quat).add(heli.pos);
    this.recoil(heli, point, DAMAGE.tailRecoil);
    this.sim.emit('tailStrike', { pos: hub, point, material, aircraft: heli.type, scale: heli.def.scale || 1 });
  }

  // Blades biting into something throw the aircraft back off it (horizontally): the speed it was closing at
  // is turned round, plus a kick.
  recoil(heli, point, dv) {
    if (!point) return;
    _a.copy(heli.pos).sub(point); _a.y = 0;
    if (_a.lengthSq() < 1e-10) return;
    _a.normalize();
    const closing = Math.max(0, -heli.vel.dot(_a));
    _a.multiplyScalar((closing * 1.4 + dv) * heli.body.mass());
    heli.body.applyImpulse({ x: _a.x, y: 0, z: _a.z }, true);
    heli.predVel.addScaledVector(_a, 1 / heli.body.mass()); // a push from the blades, not an impact
  }

  // The blades of rotor i come off: debris flung at blade speed, the airframe whipped round.
  shedRotor(heli, i, point, material) {
    const sim = this.sim, D = heli.dmg;
    if (D.shed & (1 << i)) return;
    D.shed |= 1 << i;
    D.struck = material;
    const R = rotorsOf(heli.type)[i];
    const body = heli.body;
    const av = body.angvel();
    const w = new THREE.Vector3(av.x, av.y, av.z);
    const parts = [];
    const wreckId = sim.wreckCount + 1;
    const hubW = new THREE.Vector3(...R.hub).applyQuaternion(heli.quat).add(heli.pos);
    const omega = heli.rotorSpeed * (heli.type === 'micro' ? 52 : heli.type === 'chinook' ? 30 : 26); // rad/s, as drawn
    for (const part of heli.def.parts) {
      if (!part.blade || bladeRotor(part) !== i || heli.shed.has(part.name)) continue;
      const pose = bladeLocal(heli, part);
      const wp = pose.pos.clone().applyQuaternion(heli.quat).add(heli.pos);
      const wq = heli.quat.clone().multiply(pose.quat);
      const r = wp.clone().sub(hubW);
      // Tip speed at mid-span, tangential to the disc (blades leave on the tangent, like a sling).
      const tang = new THREE.Vector3().crossVectors(heli.up, r).multiplyScalar(R.dir * omega * 0.55);
      const v = heli.vel.clone().add(new THREE.Vector3().crossVectors(w, wp.clone().sub(heli.pos))).add(tang).addScaledVector(heli.up, 0.3 + Math.random() * 0.4);
      const ang = heli.up.clone().multiplyScalar(R.dir * omega * (0.5 + Math.random() * 0.4));
      const d = sim.spawnDebris(part, wp, wq, v, ang, wreckId);
      d.smoke = 0;
      sim.debris.push(d);
      parts.push(d);
      heli.shed.add(part.name);
    }
    sim.limitDebris();
    // The stopped rotor's angular momentum goes into the airframe, with a lurch off the struck side.
    const I = body.principalInertia();
    const kick = DAMAGE.shedKick / Math.sqrt(heli.def.scale || 1);
    _a.copy(heli.up).multiplyScalar(R.dir * kick * I.y);
    _b.set(Math.random() - 0.5, 0, Math.random() - 0.5).applyQuaternion(heli.quat).multiplyScalar(kick * 0.35 * I.x);
    _a.add(_b);
    body.applyTorqueImpulse({ x: _a.x, y: _a.y, z: _a.z }, true);
    this.recoil(heli, point, DAMAGE.shedRecoil);
    if (this.allShed(heli)) D.hulk = true;
    sim.emit('rotorShatter', { pos: hubW, point, material, rotor: i, parts, aircraft: heli.type, scale: heli.def.scale || 1, up: heli.up.clone(), dir: R.dir });
  }

  // Scenery the airframe is in contact with right now (not bags, props, wreckage or its own hose).
  touching(heli) {
    let hit = null;
    for (const c of heli.colliders) {
      this.sim.world.contactPairsWith(c, (other) => {
        const info = this.sim.colliderInfo.get(other.handle);
        if (!hit && info && !['heli', 'bag', 'debris', 'prop', 'hose', 'rotor'].includes(info.kind)) hit = info;
      });
      if (hit) break;
    }
    return hit;
  }

  // ------------------------------------------------------------- tea
  // Returns the cup the cabin went into (a dunk), or null. Blade tips in the tea chip the blades.
  tea(heli, dt) {
    const sim = this.sim, D = heli.dmg;
    if (!D) return null;
    const reach = 0.16 * Math.max(1, heli.def.scale || 1);
    let inCup = null; // the cabin is down inside a cup but not yet in the tea: any crash now is a dunk
    D.teaT -= dt;
    for (let ci = 0; ci < sim.cups.length; ci++) {
      const c = sim.cups[ci];
      const dx = heli.pos.x - c.x, dz = heli.pos.z - c.z;
      if (dx * dx + dz * dz > (c.rOut + reach) ** 2 || heli.pos.y > c.topY + reach || heli.pos.y < c.floorY - reach) continue;
      const r2 = c.rIn * c.rIn;
      for (const p of D.probes) {
        _a.copy(p).applyQuaternion(heli.quat).add(heli.pos);
        const ex = _a.x - c.x, ez = _a.z - c.z;
        if (ex * ex + ez * ez < r2 && _a.y > c.floorY - 0.005) {
          if (_a.y < c.waterY) return { cup: c, index: ci, pos: _a.clone(), wet: true };
          if (_a.y < c.topY) inCup = { cup: c, index: ci, pos: _a.clone(), wet: false };
        }
      }
      if (!this.rotorStrikes) continue;
      // Blade tips: six points round each turning disc.
      const rotors = rotorsOf(heli.type);
      for (let i = 0; i < rotors.length; i++) {
        if (D.shed & (1 << i) || heli.rotorSpeed < 0.4) continue;
        for (let k = 0; k < 6; k++) {
          const a = heli.rotorPhase + k * Math.PI / 3, R = heli.def.rotorRadius * 0.92;
          _a.set(rotors[i].hub[0] + Math.cos(a) * R, rotors[i].hub[1], rotors[i].hub[2] + Math.sin(a) * R).applyQuaternion(heli.quat).add(heli.pos);
          const ex = _a.x - c.x, ez = _a.z - c.z;
          if (ex * ex + ez * ez < r2 && _a.y < c.waterY + 0.001 && _a.y > c.waterY - 0.02) {
            D.wear[i] = Math.min(1, D.wear[i] + dt * DAMAGE.teaWear);
            if (D.teaT <= 0) { D.teaT = 0.05; sim.emit('teaStrike', { cup: c, cupIndex: ci, pos: _a.clone(), up: heli.up.clone(), dir: rotors[i].dir }); }
            if (D.wear[i] >= 1) this.shedRotor(heli, i, _a.clone(), 'tea');
            break;
          }
        }
      }
    }
    return inCup;
  }

  // ------------------------------------------------------------- verdict
  // Decide whether this step ends the flight, and how. Returns { reason, impact, kind, ... } or null.
  verdict(heli, impact, anyContact, other, speed, dunk) {
    const D = heli.dmg;
    const material = other ? other.material || other.kind : null;
    const v = this.judge(heli, impact, anyContact, material, speed);
    if (dunk && (dunk.wet || v)) return { reason: 'dunk', impact: Math.max(impact, speed), cup: dunk.index, at: dunk.pos, material: 'tea' };
    return v;
  }

  judge(heli, impact, anyContact, material, speed) {
    const D = heli.dmg;
    const over = heli.up.y < CFG.crash.rolloverUpY;
    // A hard hit after a long drop (onto the floor or the garden) is a fall; damage names its own cause.
    const why = D && D.tail ? 'tail strike' : D && D.shed ? 'rotor strike' : heli.predVel.y < -FALL_SPEED && heli.pos.y < FALL_BELOW ? 'fall' : 'impact';
    const struck = D && D.struck ? D.struck : material; // a rotor strike is named for what the blades hit
    if (impact > heli.def.impactDv) return { reason: why, impact, material: why === 'rotor strike' ? struck : material };
    if (D && D.hulk && ((anyContact && impact > CFG.crash.bumpDv) || D.shedT > DAMAGE.hulkTime)) return { reason: over && anyContact ? 'rollover' : 'rotor strike', impact: Math.max(impact, speed), material: struck };
    if (D && D.shed & 3 && !D.hulk && D.shedT > DAMAGE.oneRotorTime) return { reason: 'rotor strike', impact: speed, material: struck };
    if (heli.pos.y < -0.72 && heli.up.y < 0.5) return { reason: 'floor', impact: 1, material };
    if (anyContact && over) return { reason: D && D.tail ? 'tail strike' : 'rollover', impact: 1, material };
    return null;
  }
}
