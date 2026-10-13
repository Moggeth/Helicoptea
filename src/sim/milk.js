import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';
import { CFG } from '../config.js';
import { TABLE, ROOM, CUPS, MILK_BOWL, BUCKET_HANGER, stringColliders } from './layout.js';
import { TeaBag } from './teabag.js';
import { ring } from './staticWorld.js';

// Milk: a Bambi-style bucket on the bag line, the bowl it is dipped in, liquid bookkeeping for every
// vessel (bowl and cups: volume, level, milk fraction, tea strength), the falling stream and puddles.
// Everything here is simulation; the view only mirrors it.

const M = CFG.milk;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3();
const _w = new THREE.Vector3(), _up = new THREE.Vector3(), _e = new THREE.Vector3(), _ve = new THREE.Vector3();
const _gf = new THREE.Vector3(), _d = new THREE.Vector3(), _dl = new THREE.Vector3(), _vr = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ---------------------------------------------------------------- bucket geometry (body frame)
// Interior is a frustum (base radius R0, rim radius R1, height H) above a base of wall thickness.
// The body origin sits at the middle of the outer envelope.
const H = M.height, R0 = M.baseR, R1 = M.rimR, WALL = M.wall;
const HO = H + WALL;
const yBot = -HO / 2, yFloor = yBot + WALL, yRim = HO / 2;
const radiusAt = (h) => R0 + (R1 - R0) * h / H;
const volumeTo = (h) => { const r = radiusAt(h); return Math.PI / 3 * h * (R0 * R0 + R0 * r + r * r); };
const CAPACITY = volumeTo(H);
function heightOf(v) {
  if (v <= 0) return 0;
  if (v >= CAPACITY) return H;
  let lo = 0, hi = H;
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (volumeTo(m) < v) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const outerR = (y) => R0 + WALL + (R1 - R0) * (y - yBot) / HO;
// Envelope sample points: 4 slices x 3 points, each carrying its share of the displaced volume.
const SAMPLES = [];
let ENVELOPE = 0;
for (let k = 0; k < 4; k++) {
  const y0 = yBot + HO * k / 4, y1 = yBot + HO * (k + 1) / 4;
  const ra = outerR(y0), rb = outerR(y1);
  const vol = Math.PI / 3 * (y1 - y0) * (ra * ra + ra * rb + rb * rb);
  ENVELOPE += vol;
  for (let j = 0; j < 3; j++) {
    const ang = (j / 3) * Math.PI * 2 + k * 0.5;
    const r = 0.6 * (ra + rb) / 2;
    SAMPLES.push({ p: new THREE.Vector3(Math.cos(ang) * r, (y0 + y1) / 2, Math.sin(ang) * r), vol: vol / 3 });
  }
}
for (const s of SAMPLES) s.frac = s.vol / ENVELOPE;

export const BUCKET = { H, HO, R0, R1, WALL, yBot, yFloor, yRim, radiusAt, heightOf, volumeTo, CAPACITY, swivelY: yRim + M.bridle };

const densityOf = (milk) => 1000 + (M.density - 1000) * milk;
const orifice = (r) => M.dischargeCd * Math.PI * r * r;

// ---------------------------------------------------------------- the bucket
export class MilkBucket extends TeaBag {
  build(world, pos, quat) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(0.02)
      .setAngularDamping(0.3);
    this.body = world.createRigidBody(desc);
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(Math.cos(a) * (R0 + WALL), yBot, Math.sin(a) * (R0 + WALL));
      pts.push(Math.cos(a) * (R1 + WALL), yRim, Math.sin(a) * (R1 + WALL));
    }
    const cd = (RAPIER.ColliderDesc.convexHull(new Float32Array(pts)) || RAPIER.ColliderDesc.cylinder(HO / 2, R1))
      .setMass(M.dryMass)
      .setFriction(0.6)
      .setRestitution(0.05)
      .setCollisionGroups(GROUPS.bag)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(0.02);
    this.collider = world.createCollider(cd, this.body);
    this.sim.register(this.collider, { kind: 'bag', bag: this, bucket: true });
    this.isBucket = true;
    // Contents.
    this.vol = 0;              // m^3
    this.milkFrac = 1;         // volume fraction of milk in the contents
    this.brew = 0;             // tea strength of the non-milk part
    this.fillH = 0;
    this.vessel = null;        // vessel the bucket is dipped in
    this.valveOpen = false;
    this.flowIn = 0; this.flowOut = 0; this.spillRate = 0; // m^3/s, for HUD, audio and checks
    this.xs = new THREE.Vector3().copy(pos); // slosh mass (world)
    this.vs = new THREE.Vector3();
    this.surfN = new THREE.Vector3(0, 1, 0); // free surface normal (world), from the slosh state
    this.gFelt = CFG.physics.gravity;
    this.applied = { m: -1, y: 0 };
    this.spilled = 0;          // total over the rim (for checks)
  }

  get anchorY() { return BUCKET.swivelY; }
  get ropeLength() { return M.lineLength; }
  get liquidMass() { return this.vol * densityOf(this.milkFrac); }
  get mass() { return M.dryMass + this.liquidMass; }
  get fill() { return this.vol / CAPACITY; }

  local(x, y, z, out) { return out.set(x, y, z).applyQuaternion(this.quat).add(this.pos); }
  pointVel(p, out) { return out.copy(p).sub(this.pos).cross(_w).negate().add(this.vel); } // v + w x r

  applyForces(dt, ctl) {
    this.updateCached();
    const sim = this.sim, sys = sim.milk;
    const body = this.body;
    body.resetForces(true);
    body.resetTorques(true);
    const av = body.angvel();
    _w.set(av.x, av.y, av.z);
    const g = CFG.physics.gravity;
    _up.set(0, 1, 0).applyQuaternion(this.quat);

    // ---- dipped: buoyancy of the submerged envelope (contents count as bucket mass) and liquid drag.
    let vessel = null;
    for (const v of sys.vessels) {
      const dx = this.pos.x - v.x, dz = this.pos.z - v.z;
      if (dx * dx + dz * dz < (v.rIn + 0.03) ** 2 && this.pos.y < v.waterY + 0.04 && this.pos.y > v.floorY - 0.03) { vessel = v; break; }
    }
    let sub = 0;
    if (vessel) {
      const rho = densityOf(vessel.milk);
      const mass = this.mass;
      for (const s of SAMPLES) {
        this.local(s.p.x, s.p.y, s.p.z, _a);
        const dx = _a.x - vessel.x, dz = _a.z - vessel.z;
        if (dx * dx + dz * dz > (vessel.rIn - 0.001) ** 2 || _a.y < vessel.floorY - 0.004) continue;
        const d = THREE.MathUtils.clamp((vessel.waterY - _a.y) / 0.004 + 0.5, 0, 1);
        if (d <= 0) continue;
        sub += d * s.frac;
        _f.set(0, rho * g * s.vol * d, 0);
        this.pointVel(_a, _c);
        const mPt = mass * s.frac;
        const k = (M.dragLinear + M.dragK * _c.length()) * d * s.frac;
        _f.addScaledVector(_c, -(mPt / dt) * (1 - Math.exp(-k * dt / mPt)));
        body.addForceAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: _a.x, y: _a.y, z: _a.z }, true);
      }
    }
    this.immersion = sub;
    this.vessel = sub > 0.005 ? vessel : null;

    // ---- air: drag against the moving air (rotor wash pushes an empty bucket about).
    if (sub < 0.95) {
      const mass = this.mass;
      if (sim.air.near(this.pos)) sim.air.sample(this.pos.x, this.pos.y, this.pos.z, _b); else _b.set(0, 0, 0);
      _vr.copy(this.vel).sub(_b);
      const k = (0.0015 + 0.5 * 1.2 * (2 * R1 * HO) * _vr.length()) * (1 - sub);
      _f.copy(_vr).multiplyScalar(-(mass / dt) * (1 - Math.exp(-k * dt / mass)));
      body.addForce({ x: _f.x, y: _f.y, z: _f.z }, true);
    }

    // ---- contents: pressure at the base, valves, rim flooding, spilling.
    const onHook = !!this.attach && this.attach.kind === 'heli' && sim.state === 'flying';
    if (!onHook || this.vol <= 0) this.latched = false;
    this.valveOpen = onHook && (!!(ctl && ctl.pour) || this.latched);
    this.fillH = heightOf(this.vol);
    const cosT = Math.max(0, this.surfN.dot(_up));
    const pIn = this.fillH * cosT * this.gFelt;          // pressure / density at the base (m^2/s^2)
    const valveW = this.local(0, yBot - 0.0015, 0, _e).clone();
    let pOut = 0, inLiquid = null;
    if (vessel) {
      const dx = valveW.x - vessel.x, dz = valveW.z - vessel.z;
      if (dx * dx + dz * dz < vessel.rIn * vessel.rIn && valveW.y < vessel.waterY && valveW.y > vessel.floorY - 0.002) {
        pOut = (vessel.waterY - valveW.y) * g;
        inLiquid = vessel;
      }
    }
    let qIn = 0, qOut = 0;
    if (inLiquid && pOut > pIn) {
      qIn += orifice(M.inletR) * Math.sqrt(2 * (pOut - pIn)); // one-way fill valve
      if (this.valveOpen) qIn += orifice(M.valveR) * Math.sqrt(2 * (pOut - pIn));
      // Rim under the surface: it floods over the top (weir flow).
      const rimDepth = vessel.waterY - this.local(0, yRim, 0, _a).y;
      if (rimDepth > 0) qIn += M.dischargeCd * (2 / 3) * Math.sqrt(2 * g) * (2 * Math.PI * R1) * Math.pow(rimDepth, 1.5);
    } else if (this.valveOpen && pIn > pOut && this.vol > 0) {
      qOut = orifice(M.valveR) * Math.sqrt(2 * (pIn - pOut));
    }
    // Tilted or sloshing hard: contents over the low side of the rim spill out.
    let qSpill = 0;
    if (this.vol > 0) {
      const tanT = cosT > 0.2 ? Math.sqrt(Math.max(0, 1 - cosT * cosT)) / cosT : 99;
      const over = this.fillH + R1 * Math.min(tanT, 5) - H;
      if (cosT < 0.2) qSpill = this.vol / 0.25;
      else if (over > 0) qSpill = M.dischargeCd * (2 / 3) * Math.sqrt(2 * this.gFelt) * (1.5 * R1) * Math.pow(over, 1.5);
    }
    this.flowIn = 0; this.flowOut = 0; this.spillRate = 0;
    if (qIn > 0 && inLiquid) {
      const want = Math.min(qIn * dt, CAPACITY - this.vol);
      if (want > 0) {
        const got = sys.take(inLiquid, want);
        if (got.vol > 0) {
          this.mix(got.vol, got.milk, got.brew);
          this.flowIn = got.vol / dt;
        }
      }
    }
    if (qOut > 0) {
      const dv = Math.min(this.vol, qOut * dt);
      this.vol -= dv;
      this.flowOut = dv / dt;
      if (inLiquid) sys.pourInto(inLiquid, dv, this.milkFrac, this.brew, valveW); // valve under the surface
      else {
        const speed = Math.sqrt(2 * Math.max(0, pIn - pOut));
        this.pointVel(valveW, _c).addScaledVector(_up, -speed);
        sys.emit('valve', dv, valveW, _c, this.milkFrac, this.brew);
      }
    }
    if (qSpill > 0 && this.vol > 0) {
      const dv = Math.min(this.vol, qSpill * dt);
      this.vol -= dv;
      this.spillRate = dv / dt;
      this.spilled += dv;
      // Low side of the rim: opposite to the surface normal's lean relative to the bucket axis.
      _d.copy(this.surfN).addScaledVector(_up, -this.surfN.dot(_up));
      if (_d.lengthSq() < 1e-8) _d.set(1, 0, 0); else _d.normalize().negate();
      _a.copy(_up).multiplyScalar(yRim).addScaledVector(_d, R1 + WALL).add(this.pos);
      this.pointVel(_a, _c).addScaledVector(_d, 0.12);
      if (inLiquid && vessel.waterY > _a.y) sys.pourInto(vessel, dv, this.milkFrac, this.brew, _a);
      else sys.emit('spill', dv, _a, _c, this.milkFrac, this.brew);
    }
    if (this.vol < 1e-12) { sys.gone += this.vol * this.milkFrac; this.vol = 0; } // a film left on the fabric
    this.fillH = heightOf(this.vol);

    // ---- slosh: first mode of a cylindrical tank as a spring-mass (lateral) on a stiff axial spring.
    const mLiq = this.liquidMass;
    const ms = M.sloshFrac * mLiq;
    this.local(0, yFloor + this.fillH * 0.45, 0, _e);           // equilibrium point (world)
    this.pointVel(_e, _ve);
    const Rf = radiusAt(this.fillH);
    if (ms < 2e-5 || this.fillH < 0.0008) {
      this.xs.copy(_e); this.vs.copy(_ve);
      this.surfN.copy(_up).set(0, 1, 0);
      this.gFelt = g;
    } else {
      const wl2 = 1.841 * g / Rf * Math.tanh(1.841 * this.fillH / Rf);
      const wl = Math.sqrt(wl2), wa = 3 * wl, wa2 = wa * wa;
      _d.copy(this.xs).sub(_e);
      // keep the slosh mass inside the bucket
      _a.copy(_up).multiplyScalar(_d.dot(_up));
      _dl.copy(_d).sub(_a);
      if (_dl.length() > Rf * 0.8) _dl.setLength(Rf * 0.8);
      _vr.copy(this.vs).sub(_ve);
      const vax = _vr.dot(_up);
      _b.copy(_vr).addScaledVector(_up, -vax); // lateral relative velocity
      // spring + damper acceleration on the slosh mass (towards equilibrium)
      _gf.copy(_dl).multiplyScalar(wl2).addScaledVector(_a, wa2);  // = felt gravity when at rest
      _f.copy(_gf).negate()
        .addScaledVector(_b, -2 * M.sloshDamping * wl)
        .addScaledVector(_up, -2 * 0.6 * wa * vax);
      // reaction on the bucket, at the equilibrium point
      _c.copy(_f).multiplyScalar(-ms);
      body.addForceAtPoint({ x: _c.x, y: _c.y, z: _c.z }, { x: _e.x, y: _e.y, z: _e.z }, true);
      // integrate the slosh mass (semi-implicit Euler)
      this.vs.addScaledVector(_f, dt);
      this.vs.y -= g * dt;
      this.xs.copy(_e).add(_dl).add(_a).addScaledVector(this.vs, dt);
      // free surface: normal against the felt gravity
      const gl = _gf.length();
      this.gFelt = THREE.MathUtils.clamp(gl, 0.2 * g, 3 * g);
      if (gl > 0.5) this.surfN.copy(_gf).multiplyScalar(-1 / gl);
    }

    // ---- mass of the contents (rigid share), placed low in the bucket.
    const mRigid = (1 - M.sloshFrac) * mLiq;
    const comY = yFloor + this.fillH * 0.42;
    if (Math.abs(mRigid - this.applied.m) > 3e-5 || Math.abs(comY - this.applied.y) > 0.0015) {
      this.applied.m = mRigid; this.applied.y = comY;
      if (mRigid < 1e-6) body.setAdditionalMass(0, true);
      else {
        const r = radiusAt(this.fillH * 0.5), h = Math.max(this.fillH, 0.001);
        const ixx = mRigid * (3 * r * r + h * h) / 12, iyy = mRigid * r * r / 2;
        body.setAdditionalMassProperties(mRigid, { x: 0, y: comY, z: 0 }, { x: ixx, y: iyy, z: ixx }, { x: 0, y: 0, z: 0, w: 1 }, true);
      }
    }
  }

  mix(vol, milk, brew) {
    const w0 = this.vol * (1 - this.milkFrac), w1 = vol * (1 - milk);
    if (w0 + w1 > 1e-12) this.brew = (this.brew * w0 + brew * w1) / (w0 + w1);
    const mv = this.vol * this.milkFrac + vol * milk;
    this.vol += vol;
    this.milkFrac = this.vol > 0 ? mv / this.vol : 1;
  }

  emptyNow() { this.vol = 0; this.fillH = 0; }
}

// ---------------------------------------------------------------- vessels, stream, puddles
export class MilkSystem {
  constructor(sim) {
    this.sim = sim;
    this.buildStatics();
    // Every open liquid container: the milk bowl and the cups.
    const B = MILK_BOWL;
    this.bowl = {
      id: 'milk', name: 'Milk', isBowl: true, x: B.x, z: B.z, rIn: B.rIn, rOut: B.rOut,
      baseY: 0, floorY: B.bottom, topY: B.height, waterY: B.level, brew: 0, milk: 1, steep: 0,
      bagPos: new THREE.Vector3(B.x, B.level, B.z), surfaceOffset() { return 0; },
    };
    this.vessels = [this.bowl, ...sim.cups];
    for (const v of this.vessels) {
      v.area = Math.PI * v.rIn * v.rIn;
      v.level0 = v.waterY;
      v.capacity = v.area * (v.topY - 0.004 - v.floorY);
      v.minVol = v.area * 0.0015;
      if (v.milk === undefined) v.milk = 0;
      this.restoreVessel(v);
    }
    const H_ = BUCKET_HANGER;
    this.hanger = { index: -1, tip: new THREE.Vector3(H_.x, H_.armY + 0.0045, H_.z + H_.reach - 0.004), bag: null, emptyFor: 0 };
    this.parcels = [];
    this.puddles = [];
    this.nextPuddle = 1;
    this.run = 0;
    this.src = { valve: { acc: 0, run: 0, live: false, was: false }, spill: { acc: 0, run: 0, live: false, was: false }, doors: { acc: 0, run: 0, live: false, was: false } };
    this.land = new Map();
    this.splashAcc = null;
    this.lowSince = 0;
    this.gone = 0;            // milk that soaked in, dried or reached the floor (keeps the books balanced)
    this.statics = [...stringColliders().map((c) => ({ x: c[0], z: c[1], r: c[2], top: c[3] })),
      ...CUPS.filter((c) => c.saucer).map((c) => ({ x: c.x, z: c.z, r: c.saucer, top: 0.008 })),
      { x: H_.x, z: H_.z, r: H_.baseHalf[0] * 1.2, top: H_.baseHalf[1] * 2 }];
    this.bucket = null;
    this.spawnBucket();
  }

  restoreVessel(v) {
    v.waterY = v.level0;
    v.vol = v.area * (v.waterY - v.floorY);
    v.vol0 = v.vol;
    v.milk = v.isBowl ? 1 : 0;
    if (!v.isBowl) v.brew = v.brew || 0;
  }

  setLevel(v) { v.waterY = v.floorY + v.vol / v.area; }

  // Draw liquid out of a vessel (never below a thin residue). Returns what came out.
  take(v, want) {
    const vol = Math.max(0, Math.min(want, v.vol - v.minVol));
    v.vol -= vol;
    this.setLevel(v);
    return { vol, milk: v.milk, brew: v.brew };
  }

  // Liquid arriving in a vessel mixes in. Anything above the brim runs over the side.
  pourInto(v, vol, milk, brew, at) {
    const w0 = v.vol * (1 - v.milk), w1 = vol * (1 - milk);
    if (w0 + w1 > 1e-12) v.brew = (v.brew * w0 + brew * w1) / (w0 + w1);
    const mv = v.vol * v.milk + vol * milk;
    v.vol += vol;
    v.milk = Math.min(1, mv / v.vol);
    let over = 0;
    if (v.vol > v.capacity) { over = v.vol - v.capacity; v.vol = v.capacity; }
    this.setLevel(v);
    const L = this.land.get(v) || { vol: 0, x: 0, z: 0 };
    L.vol += vol; L.x = at ? at.x : v.x; L.z = at ? at.z : v.z;
    this.land.set(v, L);
    if (over > 0) {
      const a = at ? Math.atan2(at.z - v.z, at.x - v.x) : Math.random() * 6.283;
      const rr = (v.rOut || v.rIn) + 0.012;
      this.addPuddle(v.x + Math.cos(a) * rr, v.saucer ? 0.0085 : 0, v.z + Math.sin(a) * rr, over, v.milk, v.brew);
    }
  }

  // ---------------------------------------------------------------- statics: bowl and hanger
  buildStatics() {
    const sim = this.sim, world = sim.world;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const add = (desc, x, y, z, kind = 'world', material = 'wood', rot = null) => {
      desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.12);
      if (rot) desc.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
      const c = world.createCollider(desc, body);
      sim.register(c, { kind, material });
      return c;
    };
    const B = MILK_BOWL;
    add(RAPIER.ColliderDesc.cylinder(B.bottom / 2, B.rOut), B.x, B.bottom / 2, B.z, 'bowl', 'ceramic');
    ring(add, B.x, B.z, (B.rOut + B.rIn) / 2, (B.rOut - B.rIn) / 2, 0, B.height, 28, 'bowl');
    const H_ = BUCKET_HANGER;
    add(RAPIER.ColliderDesc.cuboid(...H_.baseHalf), H_.x, H_.baseHalf[1], H_.z, 'station', 'wood');
    add(RAPIER.ColliderDesc.cuboid(H_.postHalf, H_.height / 2, H_.postHalf), H_.x, H_.height / 2, H_.z, 'station', 'wood');
    add(RAPIER.ColliderDesc.cuboid(0.0024, 0.0024, H_.reach / 2), H_.x, H_.armY, H_.z + H_.reach / 2, 'station', 'wood');
  }

  // ---------------------------------------------------------------- bucket lifecycle
  spawnBucket() {
    const tip = this.hanger.tip;
    const pos = new THREE.Vector3(tip.x, tip.y - M.lineLength * 0.995 - BUCKET.swivelY, tip.z);
    const b = new MilkBucket(this.sim, pos, new THREE.Quaternion());
    this.bucket = b;
    this.sim.attachBag(b, { kind: 'peg', peg: this.hanger });
    this.hanger.bag = b;
    this.lowSince = 0;
    this.sim.emit('bucketSpawn', { bag: b });
  }

  removeBucket() {
    const b = this.bucket;
    if (!b) return;
    this.sim.unregister(b.collider);
    b.destroy();
    this.hanger.bag = null;
    this.bucket = null;
    this.sim.emit('bucketRemoved', { id: b.id });
  }

  reset() {
    this.removeBucket();
    for (const v of this.vessels) this.restoreVessel(v);
    this.parcels.length = 0;
    this.puddles.length = 0;
    this.gone = 0;
    this.land.clear();
    for (const s of Object.values(this.src)) { s.acc = 0; s.live = s.was = false; }
    this.spawnBucket();
  }

  // ---------------------------------------------------------------- per step
  applyForces(dt, ctl) {
    for (const s of Object.values(this.src)) s.live = false;
    if (this.bucket) this.bucket.applyForces(dt, ctl);
  }

  afterStep(dt) {
    const sim = this.sim, b = this.bucket;
    if (b) {
      b.afterStep(dt);
      sim.updateRope(b);
      const imm = b.immersion > 0.04;
      if (imm && !b.wasImmersed) sim.emit('bucketSplash', { vessel: b.vessel, pos: b.pos.clone(), speed: Math.abs(b.vel.y) + 0.3 * Math.hypot(b.vel.x, b.vel.z) });
      b.wasImmersed = imm;
    }
    // A source that stopped this step releases what it has gathered.
    for (const [name, s] of Object.entries(this.src)) {
      if (!s.live && s.acc > 0) this.flush(name, true);
      s.was = s.live;
    }
    this.stepParcels(dt);
    if (sim.stepCount % 4 === 0) {
      for (const [v, L] of this.land) sim.emit('milkLand', { vessel: v, pos: new THREE.Vector3(L.x, v.waterY, L.z), vol: L.vol, milk: v.milk });
      this.land.clear();
      if (this.splashAcc) { sim.emit('milkSplash', this.splashAcc); this.splashAcc = null; }
    }
  }

  // Liquid leaving the bucket gathers into stream parcels (bounded count; overflow merges, never vanishes).
  // spread: { u, v } half-width vectors (world) of a wide outlet, such as the skycrane's belly doors.
  emit(name, vol, pos, vel, milk, brew, spread = null) {
    const s = this.src[name];
    if (!s.was) s.run = ++this.run;
    s.live = true;
    if (s.acc > 0) {
      const t = vol / (s.acc + vol);
      s.milk += (milk - s.milk) * t; s.brew += (brew - s.brew) * t;
    } else { s.milk = milk; s.brew = brew; }
    s.acc += vol;
    s.pos = (s.pos || new THREE.Vector3()).copy(pos);
    s.vel = (s.vel || new THREE.Vector3()).copy(vel);
    s.spread = spread;
    if (this.sim.stepCount % (spread ? 2 * M.parcelEvery : M.parcelEvery) === 0) this.flush(name, false);
  }

  flush(name, last) {
    const s = this.src[name];
    if (s.acc <= 0) return;
    const ps = this.parcels;
    if (ps.length >= M.maxParcels) {
      // At the cap: fold into the newest parcel of this run (or the newest of all).
      let tgt = null;
      for (let i = ps.length - 1; i >= 0; i--) if (ps[i].run === s.run) { tgt = ps[i]; break; }
      tgt = tgt || ps[ps.length - 1];
      tgt.vol += s.acc;
    } else {
      const j = 0.06; // a stream wobbles a little
      // A wide outlet (belly doors) pours as a curtain: three lanes across the opening.
      const lanes = s.spread && ps.length + 3 <= M.maxParcels ? 3 : 1;
      for (let lane = 0; lane < lanes; lane++) {
        const p = s.pos.clone();
        if (s.spread) p.addScaledVector(s.spread.u, lanes > 1 ? (lane - 1) * 0.75 + (Math.random() - 0.5) * 0.2 : Math.random() * 2 - 1).addScaledVector(s.spread.v, (Math.random() * 2 - 1) * 0.5);
        ps.push({ p, v: s.vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * j, 0, (Math.random() - 0.5) * j)),
          vol: s.acc / lanes, milk: s.milk, brew: s.brew, age: 0, run: s.run, last, src: name, wide: !!s.spread, lane });
      }
    }
    s.acc = 0;
  }

  stepParcels(dt) {
    const g = CFG.physics.gravity, air = this.sim.air;
    const ps = this.parcels;
    const relax = 1 - Math.exp(-dt / M.streamDrag);
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.age += dt;
      const prevY = q.p.y;
      q.v.y -= g * dt;
      if (air.near(q.p, 0.35)) {
        air.sample(q.p.x, q.p.y, q.p.z, _a);
        // relax towards the air velocity, without losing the fall (gravity already applied)
        q.v.x += (_a.x - q.v.x) * relax;
        q.v.z += (_a.z - q.v.z) * relax;
        if (_a.y < q.v.y) q.v.y += (_a.y - q.v.y) * relax;
      }
      q.p.addScaledVector(q.v, dt);
      if (this.collideParcel(q, prevY)) ps.splice(i, 1);
    }
  }

  // Returns true when the parcel has landed somewhere (and is consumed).
  collideParcel(q, prevY) {
    const p = q.p;
    for (const v of this.vessels) {
      const dx = p.x - v.x, dz = p.z - v.z, r2 = dx * dx + dz * dz;
      if (r2 < v.rIn * v.rIn && p.y < v.waterY && prevY >= v.floorY) {
        this.pourInto(v, q.vol, q.milk, q.brew, p);
        return true;
      }
      if (r2 < v.rOut * v.rOut && r2 >= v.rIn * v.rIn && p.y < v.topY && prevY >= v.topY - 0.003) {
        // Struck the rim: about half goes in, the rest splashes down the outside.
        this.pourInto(v, q.vol * 0.5, q.milk, q.brew, p);
        const a = Math.atan2(dz, dx), rr = v.rOut + 0.012;
        this.splash(p, q, 0.5);
        this.addPuddle(v.x + Math.cos(a) * rr, v.saucer ? 0.0085 : 0, v.z + Math.sin(a) * rr, q.vol * 0.5, q.milk, q.brew);
        return true;
      }
    }
    for (const s of this.statics) {
      const dx = p.x - s.x, dz = p.z - s.z, r2 = dx * dx + dz * dz;
      if (r2 < s.r * s.r && p.y < s.top && prevY >= s.top - 0.004) {
        this.splash(_b.set(p.x, s.top, p.z), q, 1);
        if (s.top < 0.016) this.addPuddle(p.x, s.top, p.z, q.vol, q.milk, q.brew);
        else {
          const a = Math.atan2(dz, dx), rr = s.r + 0.01;  // runs down the side onto the table
          this.addPuddle(s.x + Math.cos(a) * rr, 0, s.z + Math.sin(a) * rr, q.vol, q.milk, q.brew);
        }
        return true;
      }
    }
    if (p.y < 0 && prevY >= -0.004 && Math.abs(p.x) < TABLE.halfX && Math.abs(p.z) < TABLE.halfZ) {
      this.splash(_b.set(p.x, 0, p.z), q, 1);
      this.addPuddle(p.x, 0, p.z, q.vol, q.milk, q.brew);
      return true;
    }
    if (p.y < ROOM.floorY) { this.splash(_b.set(p.x, ROOM.floorY, p.z), q, 1); this.gone += q.vol * q.milk; return true; }
    if (q.age > 4) { this.gone += q.vol * q.milk; return true; }
    return false;
  }

  // A burst tank: the contents fly out in all directions (bounded: merges into the cap if needed).
  burst(pos, vel, vol, milk, brew) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(0.4 + Math.random() * 0.8).add(vel);
      const q = { p: pos.clone(), v, vol: vol / n, milk, brew, age: 0, run: ++this.run, last: true, src: 'spill', wide: true };
      if (this.parcels.length < M.maxParcels) this.parcels.push(q);
      else this.parcels[this.parcels.length - 1].vol += q.vol;
    }
  }

  splash(at, q, share) {
    const sp = q.v.length();
    if (!this.splashAcc) this.splashAcc = { pos: at.clone(), vol: 0, speed: 0, milk: q.milk, brew: q.brew, n: 0 };
    const s = this.splashAcc;
    s.pos.copy(at); s.vol += q.vol * share; s.speed = Math.max(s.speed, sp); s.milk = q.milk; s.brew = q.brew; s.n++;
  }

  // Puddles merge with a neighbour on the same surface; the count is bounded.
  addPuddle(x, y, z, vol, milk, brew) {
    if (vol <= 0) return;
    let best = null, bd = Infinity;
    for (const pd of this.puddles) {
      if (Math.abs(pd.y - y) > 0.004) continue;
      const d = Math.hypot(pd.x - x, pd.z - z);
      if (d < pd.r + 0.012 && d < bd) { bd = d; best = pd; }
    }
    if (!best && this.puddles.length >= M.maxPuddles) {
      for (const pd of this.puddles) { const d = Math.hypot(pd.x - x, pd.z - z) + Math.abs(pd.y - y) * 10; if (d < bd) { bd = d; best = pd; } }
    }
    if (best) {
      const t = vol / (best.vol + vol);
      // a puddle creeps towards new arrivals, but only part way
      best.x += (x - best.x) * t * 0.5; best.z += (z - best.z) * t * 0.5;
      best.milk += (milk - best.milk) * t; best.brew += (brew - best.brew) * t;
      best.vol += vol;
    } else {
      best = { id: this.nextPuddle++, x, y, z, vol, milk, brew, r: 0, born: this.sim.time, seed: Math.random() };
      this.puddles.push(best);
    }
    best.r = Math.min(M.puddleMaxR, Math.sqrt(best.vol / (Math.PI * M.film)));
  }

  housekeeping(dt) {
    // Puddles soak in and dry slowly.
    const k = Math.exp(-dt / M.puddleLife);
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const pd = this.puddles[i];
      this.gone += pd.vol * (1 - k) * pd.milk;
      pd.vol *= k;
      pd.r = Math.min(M.puddleMaxR, Math.sqrt(pd.vol / (Math.PI * M.film)));
      if (pd.r < 0.003) { this.gone += pd.vol * pd.milk; this.puddles.splice(i, 1); }
    }
    // A bucket lost off the table comes back to its hanger.
    const b = this.bucket;
    if (!b) { this.spawnBucket(); return; }
    if (b.pos.y < -0.6 && !(b.attach && b.attach.kind === 'heli')) this.lowSince += dt; else this.lowSince = 0;
    if (this.lowSince > 4) { this.removeBucket(); this.spawnBucket(); }
  }

  // Combos: a salvo empties the skycrane's tank (or latches the bucket's valve open); auto-fill is the
  // skycrane's snorkel routine. Each returns what happened, for a toast.
  salvo() {
    const h = this.sim.heli;
    if (!h || this.sim.state !== 'flying') return null;
    if (h.tank) return h.salvo();
    const k = this.bucket;
    if (!k || !this.sim.carriedCargo().includes(k)) return null;
    if (k.latched) { k.latched = false; return 'closed'; }
    if (k.vol <= 1e-8) return 'empty';
    k.latched = true;
    return 'latched';
  }

  autoFill() {
    const h = this.sim.heli;
    return h && h.tank && this.sim.state === 'flying' ? h.autoFill() : null;
  }

  // Total milk anywhere (for conservation checks): vessels, bucket, stream, puddles.
  totalMilk() {
    let t = 0;
    for (const v of this.vessels) t += v.vol * v.milk;
    if (this.bucket) t += this.bucket.vol * this.bucket.milkFrac;
    for (const q of this.parcels) t += q.vol * q.milk;
    for (const s of Object.values(this.src)) t += s.acc * (s.milk ?? 1);
    for (const pd of this.puddles) t += pd.vol * pd.milk;
    const tk = this.sim.heli && this.sim.heli.tank;
    if (tk) t += tk.vol * tk.milk;
    return t + this.gone;
  }
}
