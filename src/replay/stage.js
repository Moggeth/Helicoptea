import * as THREE from 'three';
import { CFG } from '../config.js';
import { BUCKET } from '../sim/milk.js';
import { StringMesh } from '../render/strings.js';
import { newBagLook, placeTag } from '../render/bagLook.js';
import { cloneHeliPart } from '../render/models.js';
import { cloneChinookPart } from '../render/chinookModel.js';
import { cloneSkycranePart } from '../render/skycraneModel.js';
import { milkyTea } from '../render/water.js';
import { surfaceY } from '../sim/layout.js';
import { CH, NCH, sampleEntity, ROPE_POINTS, HOSE_POINTS } from './format.js';
import { applyDamageLook } from '../render/crashFx.js';
import { disposeTree } from '../render/dispose.js';

// Poses the scene from a recorded flight. Nothing is re-simulated: every transform comes from the
// snapshots, interpolated between samples. Live objects that the recording doesn't own are hidden while
// the replay is open and restored afterwards; the aircraft models, hose and props are posed in place and
// the live view takes them back on its next frame.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _iq = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const HUB = { micro: CFG.heli.rotorHubOffset, chinook: [0, 0.048, 0], skycrane: CFG.skycrane.hub };
const SMOOTH = 28;
const BAG_ANCHOR = CFG.cargo.bagHalf[1];
const FX_EVENTS = new Set(['crash', 'rotorShatter', 'tailStrike', 'teaStrike', 'rotorTick']); // drawn by the crash effects

// Angle interpolation the short way round (rotor phases wrap).
function lerpAngle(a, b, f) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * f; }

export class ReplayStage {
  constructor(view, kitchen, extraHide = () => []) {
    this.view = view;
    this.extraHide = extraHide;   // live-only overlays (the depth cues) that the replay doesn't own
    this.scene = view.scene;
    this.charm = kitchen.garden && kitchen.garden.charm;
    this.bags = new Map();
    this.buckets = new Map();
    this.debris = new Map();
    this.hidden = [];
    this.buf = new Float32Array(64);
    this.row = new Float32Array(NCH);
    this.heliPos = new THREE.Vector3();
    this.heliQuat = new THREE.Quaternion();
    this.focus = new THREE.Vector3();
    this.wreck = null;
    this.flight = null;
    this.raw = new Float32Array(HOSE_POINTS * 3);
    this.hosePts = new Float32Array(SMOOTH * 3);
    this.curvePts = Array.from({ length: HOSE_POINTS }, () => new THREE.Vector3());
    this.curve = new THREE.CatmullRomCurve3(this.curvePts, false, 'centripetal');
    this.lastS = 0;
    // What the cockpit and its instruments read in the replay (the same surface as a live aircraft).
    const self = this;
    this.puppet = {
      type: 'micro', def: null, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), angvel: { x: 0, y: 0, z: 0 },
      body: { angvel: () => self.puppet.angvel },
      ctlEcho: { pitch: 0, roll: 0, yaw: 0, collective: 0 }, collective: 0, rotorSpeed: 1, thrustFrac: 0, skidClearance: 0, grounded: false, tankMass: 0,
      heading() { const f = _a.set(0, 0, -1).applyQuaternion(this.quat); return Math.atan2(-f.x, -f.z); },
    };
    this.cargoMass = [{ mass: 0 }];
    this.fakeSim = { carriedCargo: () => (this.cargoMass[0].mass > 0 ? this.cargoMass : []) };
  }

  // ---------------------------------------------------------------- enter / leave
  enter() {
    const v = this.view, mv = v.milkView;
    const objs = [v.cue, v.guide, v.bagBlob, v.dripPoints, mv.segs, mv.beads, mv.blob, ...this.extraHide()];
    for (const b of v.bags.values()) objs.push(b.group, b.tag, b.string.mesh);
    for (const d of v.debris.values()) objs.push(d.mesh);
    if (mv.bucketV) objs.push(mv.bucketV.group, mv.bucketV.string.mesh);
    for (const f of v.fading) objs.push(...f.objs);
    this.hidden = objs.filter(Boolean).map((o) => [o, o.visible]);
    for (const [o] of this.hidden) o.visible = false;
    v.fx.clear(); v.smoke.clear();
    v.setFirstPerson(false);  // debris clones copy real materials, never the first-person stand-ins
    this.active = true;
  }

  leave() {
    for (const [o, vis] of this.hidden) o.visible = vis;
    this.hidden = [];
    this.setFlight(null);
    this.view.fx.clear(); this.view.smoke.clear();
    this.view.flashT = 99;
    this.active = false;
  }

  *allMeshes() {
    for (const b of this.bags.values()) { yield b.group; yield b.tag; yield b.string.mesh; }
    for (const b of this.buckets.values()) { yield b.group; yield b.string.mesh; }
    for (const d of this.debris.values()) yield d;
  }

  setFlight(f) {
    if (f === this.flight) return;
    this.flight = f;
    // Entity IDs differ across recordings. Keeping their meshes would grow the scene forever.
    for (const m of this.allMeshes()) {
      this.scene.remove(m);
      disposeTree(m);
    }
    this.bags.clear();
    this.buckets.clear();
    this.debris.clear();
    this.view.fx.clear(); this.view.smoke.clear();
  }

  // Channel row at fractional sample s (positions and scalars interpolated, attitude slerped).
  sampleRow(f, s) {
    const n = f.n, r = this.row;
    const i = Math.max(0, Math.min(n - 1, Math.floor(s))), j = Math.min(n - 1, i + 1), t = Math.max(0, Math.min(1, s - i));
    const A = f.samples.row(i), B = f.samples.row(j);
    // A sample where the aircraft died (or a jump) is not interpolated across.
    const lerp = A[CH.alive] === B[CH.alive] ? t : 0;
    for (let k = 0; k < r.length; k++) r[k] = A[k] + (B[k] - A[k]) * lerp;
    for (const k of [CH.rotorPhase, CH.rotorPhase2, CH.tailPhase]) r[k] = lerpAngle(A[k], B[k], lerp);
    for (const k of [CH.src, CH.assist, CH.alive, CH.grounded, CH.nCarried, CH.shed]) r[k] = lerp < 0.5 ? A[k] : B[k];
    _q.set(A[CH.qx], A[CH.qy], A[CH.qz], A[CH.qw]);
    _iq.set(B[CH.qx], B[CH.qy], B[CH.qz], B[CH.qw]);
    _q.slerp(_iq, lerp);
    r[CH.qx] = _q.x; r[CH.qy] = _q.y; r[CH.qz] = _q.z; r[CH.qw] = _q.w;
    return r;
  }

  // ---------------------------------------------------------------- pose the scene at fractional sample s
  pose(f, s, playDt, firstPerson) {
    this.setFlight(f);
    const v = this.view, r = this.sampleRow(f, s);
    const type = f.aircraft;
    const alive = r[CH.alive] > 0.5;
    this.heliPos.set(r[CH.px], r[CH.py], r[CH.pz]);
    this.heliQuat.set(r[CH.qx], r[CH.qy], r[CH.qz], r[CH.qw]);
    const models = { micro: v.heliModel, chinook: v.chinookModel, skycrane: v.skycrane.model };
    for (const [k, m] of Object.entries(models)) m.visible = alive && k === type;
    if (alive) applyDamageLook(models[type], type, r[CH.shed]);
    v.setFirstPerson(alive && firstPerson);
    const rs = r[CH.rotorSpeed];
    if (alive) {
      const M = models[type];
      M.position.copy(this.heliPos); M.quaternion.copy(this.heliQuat);
      const U = M.userData;
      if (type === 'micro') {
        U.rotor.rotation.y = r[CH.rotorPhase];
        U.rotor.userData.disc.material.uniforms.uOpacity.value = Math.min(1, rs) * 0.9;
        for (const gh of U.ghosts) { gh.rotation.y = gh.userData.offset; gh.children.forEach((m) => { m.material.opacity = 0.14 * rs; }); }
        U.tailRotor.rotation.x = r[CH.tailPhase];
      } else if (type === 'chinook') {
        U.rotors.forEach((ro, i) => {
          ro.rotation.order = 'ZYX';
          ro.rotation.y = i ? r[CH.rotorPhase2] : r[CH.rotorPhase];
          ro.rotation.z = -(i ? r[CH.tilt1] : r[CH.tilt0]);
          ro.userData.disc.material.uniforms.uOpacity.value = Math.min(1, rs) * 0.9;
          for (const gh of ro.userData.ghosts) { gh.rotation.y = gh.userData.offset; gh.children.forEach((m) => { m.material.opacity = 0.12 * rs; }); }
        });
      } else {
        const ro = U.rotor;
        ro.rotation.order = 'ZYX';
        ro.rotation.y = r[CH.rotorPhase]; ro.rotation.x = -r[CH.tilt0]; ro.rotation.z = -r[CH.tilt1];
        ro.userData.disc.material.uniforms.uOpacity.value = Math.min(1, rs) * 0.95;
        for (const gh of ro.userData.ghosts) { gh.rotation.y = gh.userData.offset; gh.children.forEach((m) => { m.material.opacity = 0.12 * rs; }); }
        U.tailRotor.rotation.x = r[CH.tailPhase];
        U.tailRotor.userData.disc.material.uniforms.uOpacity.value = Math.min(1, rs) * 0.7;
        for (const d of U.doors) d.rotation.z = -d.userData.side * r[CH.tankDoors] * 1.25;
      }
      // Contact shadow under the hub.
      const hd = r[CH.hubAgl];
      const hub = _p.set(...HUB[type]).applyQuaternion(this.heliQuat).add(this.heliPos);
      const B = v.heliBlob;
      B.visible = hd < 1.1;
      B.position.set(hub.x, hub.y - hd + 0.0012, hub.z);
      const sz = (type === 'micro' ? 0.09 : 0.12) + hd * 0.15;
      if (type === 'micro') B.scale.set(sz, sz * 1.3, 1); else B.scale.set(sz * 0.85, sz * 1.95, 1);
      _a.set(0, 0, -1).applyQuaternion(this.heliQuat);
      B.rotation.z = Math.atan2(-_a.x, -_a.z);
      B.material.opacity = (type === 'micro' ? 0.42 : 0.48) * Math.max(0, 1 - hd / 0.9);
    } else v.heliBlob.visible = false;

    // Puppet for the cockpit and instruments.
    const P = this.puppet;
    P.type = type; P.def = f.def || P.def;
    P.pos.copy(this.heliPos); P.quat.copy(this.heliQuat);
    P.vel.set(r[CH.vx], r[CH.vy], r[CH.vz]);
    // Body rates back to a world angular velocity (for the head's rotational lag).
    _v.set(r[CH['rate.pitch']], -r[CH['rate.yaw']], -r[CH['rate.roll']]).multiplyScalar(Math.PI / 180).applyQuaternion(this.heliQuat);
    P.angvel.x = _v.x; P.angvel.y = _v.y; P.angvel.z = _v.z;
    P.ctlEcho.pitch = r[CH['in.pitch']]; P.ctlEcho.roll = r[CH['in.roll']]; P.ctlEcho.yaw = r[CH['in.yaw']]; P.ctlEcho.collective = r[CH['in.coll']];
    P.collective = r[CH.collective]; P.rotorSpeed = rs; P.thrustFrac = r[CH.thrustFrac]; P.skidClearance = r[CH.agl]; P.grounded = r[CH.grounded] > 0.5;
    P.tankMass = type === 'skycrane' && f.def ? Math.max(0, r[CH.tankFill]) * 0.032 * CFG.milk.density / 1000 : 0;
    this.cargoMass[0].mass = r[CH.loadMass];

    // Things that move.
    const buf = this.buf;
    for (const m of this.allMeshes()) m.visible = false;
    let hoseShown = false;
    const wreckFocus = [];
    this.carriedPos = null;
    for (const e of f.entities.values()) {
      if (!sampleEntity(e, s, buf)) continue;
      if (e.kind === 'bag') this.poseBag(e, buf, f, alive);
      else if (e.kind === 'bucket') this.poseBucket(e, buf, f, alive);
      else if (e.kind === 'debris') { const m = this.debrisMesh(e); if (m) { m.visible = true; m.position.set(buf[0], buf[1], buf[2]); m.quaternion.set(buf[3], buf[4], buf[5], buf[6]); if (/^(fuselage|cabin|spine)$/.test(e.meta.part)) wreckFocus.push(m.position); } }
      else if (e.kind === 'prop') this.poseProp(e, buf, playDt);
      else if (e.kind === 'hose' && alive && type === 'skycrane') { this.poseHose(buf); hoseShown = true; }
    }
    if (!hoseShown) { v.skycrane.hose.mesh.visible = false; v.skycrane.nozzle.visible = false; }

    // Where the cameras look: the aircraft, or after the crash its main wreck.
    if (alive) { this.focus.copy(this.heliPos); this.wreck = null; }
    else if (wreckFocus.length) { this.focus.copy(wreckFocus[wreckFocus.length - 1]); this.wreck = this.focus; }
    this.alive = alive;
    this.fx(f, s, playDt);
    this.lastS = s;
    return r;
  }

  hookWorld(f, hook, out) {
    const hooks = f.def && f.def.hooks;
    const h = hooks && hooks[hook] ? hooks[hook] : [0, -0.02, 0];
    return out.set(h[0], h[1], h[2]).applyQuaternion(this.heliQuat).add(this.heliPos);
  }

  // The recorded string, its ends pinned to the drawn bag and hook (as the live view does).
  pinRope(pts, n, bagPos, bagQuat, anchorY, carried, f, alive) {
    const a = _a.set(0, anchorY, 0).applyQuaternion(bagQuat).add(bagPos);
    const d0x = a.x - pts[0], d0y = a.y - pts[1], d0z = a.z - pts[2];
    let dNx = 0, dNy = 0, dNz = 0;
    if (carried && alive) {
      const e = this.hookWorld(f, carried - 1, _v);
      const k = (n - 1) * 3;
      dNx = e.x - pts[k]; dNy = e.y - pts[k + 1]; dNz = e.z - pts[k + 2];
    }
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), k = i * 3;
      pts[k] += d0x * (1 - t) + dNx * t; pts[k + 1] += d0y * (1 - t) + dNy * t; pts[k + 2] += d0z * (1 - t) + dNz * t;
    }
  }

  poseBag(e, b, f, alive) {
    let m = this.bags.get(e.id);
    if (!m) {
      const A = this.view.bagAssets;
      const group = A.makeBag(), tag = A.makeTag();
      const string = new StringMesh(ROPE_POINTS, 0.00085, this.view.stringMat);
      string.pts = new Float32Array(ROPE_POINTS * 3);
      string.mesh.userData.noAO = true;
      this.scene.add(group, tag, string.mesh);
      m = { group, tag, string, look: newBagLook(ROPE_POINTS) };
      this.bags.set(e.id, m);
    }
    m.group.visible = m.tag.visible = m.string.mesh.visible = true;
    m.group.position.set(b[0], b[1], b[2]);
    m.group.quaternion.set(b[3], b[4], b[5], b[6]);
    const w = b[7], stain = b[8];
    // The replay records wetness, not how far up it soaked: a wet bag is drawn soaked through.
    m.group.userData.setWet(w, w > 0.05 ? CFG.cargo.bagHalf[1] + 0.002 : -1, stain);
    const pts = m.string.pts;
    pts.set(b.subarray(9 + 1, 9 + 1 + ROPE_POINTS * 3));
    const att = Math.round(b[9]);
    if (att > 0 && alive) this.carriedPos = (this.carriedPos || new THREE.Vector3()).copy(m.group.position);
    this.pinRope(pts, ROPE_POINTS, m.group.position, m.group.quaternion, BAG_ANCHOR, Math.max(0, att), f, alive);
    m.string.update(pts);
    // Tag beside the string at the loop end (held still: replay frames are not a steady clock).
    placeTag(m.tag, pts, ROPE_POINTS - 1, att > 0, m.group.quaternion, m.look, 0);
  }

  poseBucket(e, b, f, alive) {
    let m = this.buckets.get(e.id);
    if (!m) {
      const mv = this.view.milkView;
      const group = mv.bucketParts.make();
      const string = new StringMesh(ROPE_POINTS, 0.00095, this.view.stringMat);
      string.pts = new Float32Array(ROPE_POINTS * 3);
      string.mesh.userData.noAO = true;
      this.scene.add(group, string.mesh);
      m = { group, string };
      this.buckets.set(e.id, m);
    }
    m.group.visible = m.string.mesh.visible = true;
    m.group.position.set(b[0], b[1], b[2]);
    m.group.quaternion.set(b[3], b[4], b[5], b[6]);
    if (Math.round(b[10]) > 0 && alive) this.carriedPos = (this.carriedPos || new THREE.Vector3()).copy(m.group.position);
    const milk = m.group.userData.milk;
    const h = b[7];
    milk.visible = h > 1e-4;
    if (milk.visible) {
      const rr = BUCKET.radiusAt(h) - 0.0002;
      // Level in the world (the live view also tilts it with the slosh; the replay keeps it level).
      _iq.copy(m.group.quaternion).invert();
      _v.set(0, 1, 0).applyQuaternion(_iq);
      const maxTilt = Math.atan2(Math.max(0.0005, BUCKET.H - h), rr) * 0.95;
      const tilt = Math.min(Math.acos(THREE.MathUtils.clamp(_v.y, -1, 1)), maxTilt);
      const ax = _a.set(_v.z, 0, -_v.x);
      if (ax.lengthSq() > 1e-10) milk.quaternion.setFromAxisAngle(ax.normalize(), tilt); else milk.quaternion.identity();
      milk.position.set(0, BUCKET.yFloor + h, 0);
      milk.scale.set(rr, 1, rr);
      milkyTea(b[9], b[8], milk.material.color);
    }
    const pts = m.string.pts;
    pts.set(b.subarray(11, 11 + ROPE_POINTS * 3));
    this.pinRope(pts, ROPE_POINTS, m.group.position, m.group.quaternion, BUCKET.swivelY, Math.max(0, Math.round(b[10])), f, alive);
    m.string.update(pts);
  }

  poseHose(b) {
    const S = this.view.skycrane;
    // Anchor on the drawn airframe, then a smooth tube through the segments.
    _a.set(...CFG.skycrane.hose.anchor).applyQuaternion(this.heliQuat).add(this.heliPos);
    this.curvePts[0].copy(_a);
    for (let i = 1; i < HOSE_POINTS; i++) this.curvePts[i].set(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]);
    for (let i = 0; i < SMOOTH; i++) {
      this.curve.getPoint(i / (SMOOTH - 1), _v);
      this.hosePts[i * 3] = _v.x; this.hosePts[i * 3 + 1] = _v.y; this.hosePts[i * 3 + 2] = _v.z;
    }
    S.hose.radius = CFG.skycrane.hose.radius * 1.1;
    S.hose.update(this.hosePts);
    S.hose.mesh.visible = true;
    const head = this.curvePts[HOSE_POINTS - 1], prev = this.curvePts[HOSE_POINTS - 2];
    S.nozzle.visible = true;
    S.nozzle.position.copy(head);
    _v.subVectors(prev, head);
    if (_v.lengthSq() < 1e-10) _v.set(0, 1, 0);
    S.nozzle.quaternion.setFromUnitVectors(UP, _v.normalize());
  }

  poseProp(e, b, playDt) {
    const C = this.charm && this.charm.replay;
    if (!C) return;
    const id = e.id.slice(5);
    _p.set(b[0], b[1], b[2]); _q.set(b[3], b[4], b[5], b[6]);
    if (id === 'lamp') C.placeLamp(_p, _q);
    else if (id === 'mobile') C.placeMobile(_p, _q, playDt * 6);
    else { const m = C.props.get(id); if (m) { m.position.copy(_p); m.quaternion.copy(_q); if (m.onPosed) m.onPosed(m); } }
  }

  debrisMesh(e) {
    let m = this.debris.get(e.id);
    if (m) return m;
    const v = this.view, ac = e.meta.aircraft, name = e.meta.part;
    const fp = v.firstPerson;
    v.setFirstPerson(false);  // clone the real materials, never the first-person stand-ins
    try {
      m = ac === 'skycrane' ? cloneSkycranePart(v.skycrane.model, name) : ac === 'chinook' ? cloneChinookPart(v.chinookModel, name) : cloneHeliPart(v.heliModel, name);
    } catch { m = null; }
    v.setFirstPerson(!!fp);
    if (!m) return null;
    for (const em of m.userData.embers || []) em.emissiveIntensity = 0;
    this.scene.add(m);
    this.debris.set(e.id, m);
    return m;
  }

  // Effects replayed from events: each crash's own effect as playback passes it, strikes, dust at touchdowns.
  fx(f, s, playDt) {
    const v = this.view;
    const prev = this.lastS;
    if (s > prev && s - prev < 30) {
      for (const e of f.events) {
        if (e.i <= prev || e.i > s) continue;
        if (FX_EVENTS.has(e.type)) v.crashFx.play({ ...e, aircraft: f.aircraft, scale: e.scale ?? (f.aircraft === 'micro' ? 1 : 1.5) });
        else if ((e.type === 'touchdown' || e.type === 'bump') && e.pos) v.dust(_p.set(...e.pos), Math.min(1, (e.speed || e.dv || 0.3) * 2));
      }
    } else if (Math.abs(s - prev) > 1e-6) { v.fx.clear(); v.smoke.clear(); v.crashFx.clear(); }
    const floorFn = (x, z) => surfaceY(x, z) + 0.001;
    const calm = (x, y, z, o) => o.set(0, 0, 0);
    v.fx.update(playDt, floorFn, calm);
    v.smoke.update(playDt, floorFn, calm);
    v.crashFx.update(playDt);
    v.flashT += playDt;
    v.flash.intensity = v.flashT < 0.6 ? 7 * Math.exp(-v.flashT * 9) : 0;
  }
}
