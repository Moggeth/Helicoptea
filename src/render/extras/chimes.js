import * as THREE from 'three';
import { TREE } from '../../sim/layout.js';
import { barkTexture } from '../gardenTextures.js';

// A wind chime on a low limb of the apple tree: a turned wooden top, six tuned aluminium tubes on cords,
// a wooden striker and a wind sail below it. Render-only: the tubes, the striker and the whole chime are
// small damped pendulums driven by the air (the breeze, and the rotor's inflow, downwash and outwash);
// when the striker meets a tube, that tube rings its note (D major pentatonic; free-free bar partials,
// a slow beat between two nearly equal modes, a long ring) through a small bank of oscillators that is
// built on the first strike and let go after a quiet spell.
// Draw calls: the limb (bark) and the chime (one skinned mesh: wood, cord and metal on one material).

const NOTES = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66]; // D5 E5 F#5 A5 B5 D6
const PARTIALS = [[1, 1, 5.2], [1.0023, 0.55, 4.1], [2.756, 0.42, 2.0], [5.404, 0.16, 0.75], [8.933, 0.05, 0.3]]; // ratio, level, ring (s)
const G = 9.81, RHO = 1.2;
const L_MAX = 0.24;                   // the D5 tube; the others are shorter as 1/sqrt(f) (bending modes go as 1/L^2)
const RT = 0.0065;                    // tube radius (13 mm tube)
const RC = 0.035;                     // circle of tube holes in the top
const RS = 0.022;                     // striker radius
const DISC_R = 0.05, DISC_T = 0.016;
const CORD = 0.024;                   // disc to the top of each tube
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _e = new THREE.Euler();

function taperTube(curve, r0, r1, seg, radial) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg);
    const r = r0 + (r1 - r0) * Math.pow(i / seg, 0.8);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// Geometry accumulator for the skinned chime: every piece rides one bone.
class Skin {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.origins = []; }
  // Pieces are given in their bone's frame; the bind pose has no rotations, so bind space is that plus the bone's origin.
  add(geo, m, bone, color, metal = false) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const o = this.origins[bone];
    g.translate(o.x, o.y, o.z);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal;
    const c = new THREE.Color(color);
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      this.uv.push(metal ? 0.75 : 0.25, 0.5);
      this.col.push(c.r, c.g, c.b);
      this.idx.push(bone, 0, 0, 0);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.idx, 4));
    const w = new Float32Array(this.idx.length);
    for (let i = 0; i < w.length; i += 4) w[i] = 1;
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    return g;
  }
}

// A thin cylinder from a to b.
function rod(a, b, r, radial = 5) {
  const d = _v.subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), radial, 1, true);
  const m = new THREE.Matrix4().compose(_w.addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

export function build(ctx) {
  const scene = ctx.scene, lite = ctx.lite;
  // ---------------------------------------------------------------- the limb
  const limb = new THREE.QuadraticBezierCurve3(new THREE.Vector3(TREE.x - 0.005, 0.7, TREE.z + 0.015), new THREE.Vector3(TREE.x - 0.25, 0.93, TREE.z + 0.25), new THREE.Vector3(TREE.x - 0.63, 0.975, TREE.z + 0.6));
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(256), roughness: 0.95 });
  bark.map.repeat.set(1, 1);
  const parts = [taperTube(limb, 0.036, 0.011, 16, 9)];
  // Two twigs off the end, and a stub where an old shoot was pruned.
  const end = limb.getPoint(1), mid = limb.getPoint(0.55);
  parts.push(taperTube(new THREE.QuadraticBezierCurve3(limb.getPoint(0.86), limb.getPoint(0.9).add(new THREE.Vector3(0.02, 0.08, 0.04)), limb.getPoint(0.86).add(new THREE.Vector3(0.0, 0.2, 0.12))), 0.009, 0.003, 8, 5));
  parts.push(taperTube(new THREE.QuadraticBezierCurve3(end, end.clone().add(new THREE.Vector3(-0.05, 0.03, 0.02)), end.clone().add(new THREE.Vector3(-0.09, 0.1, 0.03))), 0.008, 0.003, 6, 5));
  parts.push(taperTube(new THREE.LineCurve3(mid, mid.clone().add(new THREE.Vector3(0.015, 0.05, -0.02))), 0.014, 0.011, 2, 7));
  const limbGeo = mergeSimple(parts);
  const limbMesh = new THREE.Mesh(limbGeo, bark);
  limbMesh.castShadow = true; limbMesh.receiveShadow = true;
  limbMesh.matrixAutoUpdate = false;
  scene.add(limbMesh);

  // Where on the limb the chime hangs: the point nearest x 2.3, on its underside.
  let ht = 0.5;
  for (let t = 0.3; t < 0.98; t += 0.005) if (Math.abs(limb.getPoint(t).x - 2.3) < Math.abs(limb.getPoint(ht).x - 2.3)) ht = t;
  const lp = limb.getPoint(ht);
  const lr = 0.036 + (0.011 - 0.036) * Math.pow(ht, 0.8);
  const H = new THREE.Vector3(lp.x, lp.y - lr, lp.z);
  // Heights.
  const discTop = 0.75, discBot = discTop - DISC_T, ringY = discTop + 0.07, strikerY = 0.62, sailTop = 0.555, sailH = 0.085;
  const dHit = discBot - strikerY;        // pivot (underside of the top) to the striker
  const dSail = discBot - (sailTop - sailH * 0.45);

  // ---------------------------------------------------------------- bones and mesh
  const S = new Skin();
  const root = new THREE.Bone(); root.position.copy(H);
  const bones = [root];
  const discC = new THREE.Vector3(H.x, discBot, H.z); // world: centre of the top's underside
  const tubes = [];
  const yaw0 = 0.4;
  for (let i = 0; i < 6; i++) {
    const a = yaw0 + (i / 6) * Math.PI * 2;
    const hole = new THREE.Vector3(Math.cos(a) * RC, 0, Math.sin(a) * RC);
    const L = L_MAX * Math.sqrt(NOTES[0] / NOTES[i]);
    const bone = new THREE.Bone();
    bone.position.copy(discC).add(hole).sub(H);
    root.add(bone);
    bones.push(bone);
    // Effective pendulum: cord plus the tube's own swing.
    const m = 2700 * Math.PI * (RT * RT - (RT - 0.001) ** 2) * L;
    const lc = CORD + L / 2;
    const I = m * (lc * lc + L * L / 12);
    tubes.push({ i, hole, L, bone, boneIndex: bones.length - 1, m, I, lc, w0: Math.sqrt(m * G * lc / I), th: new THREE.Vector2(), om: new THREE.Vector2(), last: -9, f: NOTES[i] });
  }
  const strikerBone = new THREE.Bone();
  strikerBone.position.copy(discC).sub(H);
  root.add(strikerBone);
  bones.push(strikerBone);
  const SI = bones.length - 1;
  S.origins = [H.clone(), ...tubes.map((tb) => discC.clone().add(tb.hole)), discC.clone()];
  const WOOD = 0x6e4a2c, CORDC = 0x2e2924, ALU = 0xdfe3e8, BRASS = 0xb08d4a;
  // Hanging cord, brass ring, three-leg bridle to the top.
  const ringW = new THREE.Vector3(H.x, ringY, H.z);
  const rel = (p) => p.clone().sub(H); // bone-local for the root (bind pose: bones carry no rotation)
  S.add(rod(new THREE.Vector3(0, 0.004, 0), rel(ringW).add(new THREE.Vector3(0, 0.012, 0)), 0.0011), null, 0, CORDC);
  S.add(new THREE.TorusGeometry(0.009, 0.0016, 6, 16), new THREE.Matrix4().setPosition(rel(ringW)), 0, BRASS, true);
  // A turn of cord round the limb.
  S.add(new THREE.TorusGeometry(lr + 0.0015, 0.0012, 4, 14), new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), limb.getTangent(ht))).setPosition(0, lr, 0), 0, CORDC);
  for (let k = 0; k < 3; k++) {
    const a = yaw0 + Math.PI / 6 + (k / 3) * Math.PI * 2;
    S.add(rod(rel(ringW).add(new THREE.Vector3(0, -0.008, 0)), rel(new THREE.Vector3(H.x + Math.cos(a) * DISC_R * 0.78, discTop, H.z + Math.sin(a) * DISC_R * 0.78)), 0.0009), null, 0, CORDC);
  }
  // The turned top: a disc with a rounded edge, a bead and a raised boss.
  {
    const R = DISC_R, t = DISC_T;
    const prof = [[0.0001, 0], [R * 0.92, 0], [R, t * 0.2], [R, t * 0.55], [R * 0.94, t * 0.85], [R * 0.86, t * 0.92], [R * 0.84, t * 1.0], [R * 0.4, t * 1.02], [R * 0.32, t * 1.25], [R * 0.12, t * 1.35], [0.0001, t * 1.36]].map(([x, y]) => new THREE.Vector2(x, y));
    S.add(new THREE.LatheGeometry(prof, 32), new THREE.Matrix4().setPosition(rel(discC)), 0, WOOD);
    // Screw eye on top.
    S.add(new THREE.TorusGeometry(0.005, 0.0012, 5, 12), new THREE.Matrix4().setPosition(rel(new THREE.Vector3(H.x, discTop + DISC_T * 0.4 + 0.006, H.z))), 0, BRASS, true);
  }
  // Tubes on their cords (a V through a cross-hole near each tube's top).
  for (const tb of tubes) {
    const top = -CORD, b = tb.boneIndex;
    const out = new THREE.Vector3(tb.hole.x, 0, tb.hole.z).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const tube = new THREE.CylinderGeometry(RT, RT, tb.L, lite ? 10 : 18, 1, true);
    S.add(tube, new THREE.Matrix4().setPosition(0, top - tb.L / 2, 0), b, ALU, true);
    S.add(new THREE.CylinderGeometry(RT - 0.001, RT - 0.001, tb.L, lite ? 10 : 18, 1, true), new THREE.Matrix4().setPosition(0, top - tb.L / 2, 0), b, 0x8d9196, true);
    for (const s of [-1, 1]) S.add(rod(new THREE.Vector3(0, 0, 0), side.clone().multiplyScalar(s * RT).setY(top - 0.007), 0.0007, 4), null, b, CORDC);
  }
  // Striker, its cord, and the sail.
  {
    S.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -(discBot - sailTop) + 0.002, 0), 0.0008, 4), null, SI, CORDC);
    const prof = [[0.0001, -0.0055], [RS * 0.85, -0.0055], [RS, -0.002], [RS, 0.002], [RS * 0.85, 0.0055], [0.0001, 0.0055]].map(([x, y]) => new THREE.Vector2(x, y));
    S.add(new THREE.LatheGeometry(prof, 24), new THREE.Matrix4().setPosition(0, -dHit, 0), SI, 0x7a5434);
    const sh = new THREE.Shape();
    const w = 0.03, h = sailH;
    sh.moveTo(0, 0);
    sh.bezierCurveTo(w * 0.7, -h * 0.08, w, -h * 0.45, w * 0.55, -h * 0.85);
    sh.quadraticCurveTo(0, -h * 1.08, -w * 0.55, -h * 0.85);
    sh.bezierCurveTo(-w, -h * 0.45, -w * 0.7, -h * 0.08, 0, 0);
    const sail = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 10 });
    sail.translate(0, 0, -0.0015);
    S.add(sail, new THREE.Matrix4().setPosition(0, -(discBot - sailTop), 0), SI, 0x8f6a46);
  }
  const geo = S.build();
  const mr = new Uint8Array([0, 150, 0, 255, 0, 80, 215, 255]); // G: roughness, B: metalness (wood | metal)
  const mrTex = new THREE.DataTexture(mr, 2, 1);
  mrTex.magFilter = mrTex.minFilter = THREE.NearestFilter;
  mrTex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, roughnessMap: mrTex, metalnessMap: mrTex, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = false; // bones move under a still mesh: the shadow cache would keep a stale shadow
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius += 0.08;
  scene.add(mesh);

  // ---------------------------------------------------------------- simulation
  const lHang = H.y - discBot;             // whole chime on its cord
  const striker = { th: new THREE.Vector2(), om: new THREE.Vector2(), m: 0.008 + 0.004, I: 0.008 * dHit * dHit + 0.004 * dSail * dSail, yaw: 0, yawV: 0 };
  striker.w0 = Math.sqrt(G * (0.008 * dHit + 0.004 * dSail) / striker.I);
  const sway = { th: new THREE.Vector2(), om: new THREE.Vector2() };
  const airT = new THREE.Vector3(), airS = new THREE.Vector3(), probe = new THREE.Vector3();
  const state = { strikes: 0, time: 0, bank: null, lastStrike: -99, tokens: 4, active: true };
  let wakeNear = false;

  function strike(tb, speed) {
    state.strikes++;
    const A = ctx.audio;
    if (!A || !A.ready || !A.ctx || !A.sfxBus) return;
    const now = A.ctx.currentTime;
    if (now - tb.last < 0.07 || state.tokens < 1) return;
    tb.last = now;
    state.tokens -= 1;
    state.lastStrike = now;
    const amp = Math.min(1, Math.max(0.12, speed / 0.22));
    ring(A, tb, amp, now);
  }

  // A persistent bank: one set of oscillators per tube (started on demand), retriggered by envelopes.
  function bankFor(A) {
    if (state.bank && state.bank.ctx === A.ctx) return state.bank;
    const c = A.ctx;
    const bus = c.createGain(), pan = c.createStereoPanner(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 18000;
    bus.gain.value = 0;
    bus.connect(pan).connect(lp).connect(A.sfxBus);
    const voices = tubes.map((tb) => PARTIALS.map(([ratio]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = tb.f * ratio;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g).connect(bus); o.start();
      return { o, g };
    }));
    state.bank = { ctx: c, bus, pan, lp, voices };
    placeBank(A);
    return state.bank;
  }
  function placeBank(A) {
    const B = state.bank;
    if (!B) return;
    probe.set(H.x, (discBot + 0.5) / 2, H.z);
    const P = A.place(probe);
    const t = A.ctx.currentTime;
    B.bus.gain.setTargetAtTime(P.gain, t, 0.05);
    B.pan.pan.setTargetAtTime(Number.isFinite(P.pan) ? P.pan : 0, t, 0.05);
    B.lp.frequency.setTargetAtTime(Math.min(18000, P.lp), t, 0.05);
  }
  function freeBank() {
    const B = state.bank;
    if (!B) return;
    for (const set of B.voices) for (const v of set) { try { v.o.stop(); v.o.disconnect(); v.g.disconnect(); } catch { /* ignore */ } }
    try { B.bus.disconnect(); B.pan.disconnect(); B.lp.disconnect(); } catch { /* ignore */ }
    state.bank = null;
  }
  function ring(A, tb, amp, now) {
    const B = bankFor(A);
    const set = B.voices[tb.i];
    const base = 0.055 * amp * (1.12 - tb.i * 0.04);
    for (let k = 0; k < PARTIALS.length; k++) {
      const [, level, decay] = PARTIALS[k];
      // A harder strike brings up the upper partials more.
      const lv = base * level * (k >= 2 ? 0.5 + 0.7 * amp : 1);
      const g = set[k].g.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.00001, g.value), now);
      g.linearRampToValueAtTime(Math.min(0.12, g.value * 0.5 + lv), now + 0.0025);
      g.setTargetAtTime(0, now + 0.0025, decay / 6.9);
    }
    // The tick of wood on metal.
    const o = A.spot(tb.world || probe, 1, 1);
    A.noiseBurst({ freq: 5200 + tb.i * 300, q: 1.6, gain: 0.05 * amp, attack: 0.001, decay: 0.025, out: o });
    A.tone({ freq: 2100, type: 'triangle', gain: 0.012 * amp, attack: 0.001, decay: 0.03, out: o });
  }

  // Air at a point: the rotor's wash and inflow (only near a wake), plus the breeze.
  function airAt(p, out, t, k) {
    out.set(0, 0, 0);
    if (wakeNear) {
      ctx.airAt(p, out);
      if (ctx.sim.props && ctx.sim.props.inflow) ctx.sim.props.inflow(p, out);
      // The wash is turbulent: its speed, and the eddies it throws off round the column, churn the air.
      const e = Math.max(out.length() * 0.45, wakeStir(ctx.sim, p, out));
      out.x += e * (0.7 * Math.sin(t * 7.3 + k * 2.1) + 0.5 * Math.sin(t * 12.9 + k * 4.3)) * (0.6 + 0.4 * Math.sin(t * 2.3 + k));
      out.z += e * (0.7 * Math.cos(t * 6.1 + k * 1.3) + 0.5 * Math.cos(t * 11.1 + k * 3.7)) * (0.6 + 0.4 * Math.sin(t * 1.7 + 2 * k));
    }
    // Breeze: mostly a breath, with an occasional gust.
    const gust = Math.max(0, Math.sin(t * 0.13) * Math.sin(t * 0.31 + 1) - 0.3) * 1.6;
    const b = 0.18 + 0.12 * Math.sin(t * 0.7 + k) + gust * (0.7 + 0.3 * Math.sin(t * 3.1 + k));
    out.x += 0.8 * b + 0.15 * Math.sin(t * 1.3 + k * 3) + 0.3 * gust * Math.sin(t * 5.9 + k * 3.1);
    out.z += 0.6 * b + 0.15 * Math.cos(t * 1.1 + k * 2) + 0.3 * gust * Math.cos(t * 6.7 + k * 2.3);
    return out;
  }

  const hitPos = new THREE.Vector2(), sPos = new THREE.Vector2(), nrm = new THREE.Vector2();
  function step(h, t) {
    // Whole chime on its hanging cord (light drag, slow).
    {
      const w0 = Math.sqrt(G / (lHang + 0.12));
      const fx = (airT.x + airS.x) * 0.5 - sway.om.x * (lHang + 0.12), fz = (airT.z + airS.z) * 0.5 - sway.om.y * (lHang + 0.12);
      const sp = Math.hypot(fx, fz);
      const k = 0.5 * RHO * 1.1 * 0.012 * sp / 0.16 / (lHang + 0.12);
      sway.om.x += (-w0 * w0 * sway.th.x - 0.8 * sway.om.x + k * fx) * h;
      sway.om.y += (-w0 * w0 * sway.th.y - 0.8 * sway.om.y + k * fz) * h;
      sway.th.addScaledVector(sway.om, h);
    }
    // Tubes: drag on each along its length.
    for (const tb of tubes) {
      const vx = airT.x - tb.om.x * tb.lc, vz = airT.z - tb.om.y * tb.lc;
      const sp = Math.hypot(vx, vz);
      const k = 0.5 * RHO * 1.0 * (2 * RT * tb.L) * sp * tb.lc / tb.I;
      tb.om.x += (-tb.w0 * tb.w0 * tb.th.x - 1.2 * tb.om.x + k * vx) * h;
      tb.om.y += (-tb.w0 * tb.w0 * tb.th.y - 1.2 * tb.om.y + k * vz) * h;
      tb.th.addScaledVector(tb.om, h);
    }
    // Striker and sail: the sail catches the air.
    {
      const vx = airS.x - striker.om.x * dSail, vz = airS.z - striker.om.y * dSail;
      const sp = Math.hypot(vx, vz);
      const area = 0.06 * sailH * 0.8 * (0.55 + 0.45 * Math.abs(Math.cos(striker.yaw)));
      const k = 0.5 * RHO * 1.2 * area * sp * dSail / striker.I;
      striker.om.x += (-striker.w0 * striker.w0 * striker.th.x - 0.5 * striker.om.x + k * vx) * h;
      striker.om.y += (-striker.w0 * striker.w0 * striker.th.y - 0.5 * striker.om.y + k * vz) * h;
      striker.th.addScaledVector(striker.om, h);
      // The sail weathervanes about its cord.
      const want = Math.atan2(vx, vz);
      const dy = Math.atan2(Math.sin(want - striker.yaw), Math.cos(want - striker.yaw));
      striker.yawV += (dy * Math.min(1, sp) * 6 - striker.yawV * 1.5 - striker.yaw * 0.6) * h;
      striker.yaw += striker.yawV * h;
    }
    // Collisions in the plane of the striker.
    sPos.set(striker.th.x * dHit, striker.th.y * dHit);
    for (const tb of tubes) {
      hitPos.set(tb.hole.x + tb.th.x * dHit, tb.hole.z + tb.th.y * dHit);
      nrm.subVectors(hitPos, sPos);
      const d = nrm.length(), minD = RS + RT;
      if (d >= minD || d < 1e-6) continue;
      nrm.divideScalar(d);
      const mt = tb.I / (dHit * dHit), ms = striker.I / (dHit * dHit);
      const vrel = (tb.om.x - striker.om.x) * dHit * nrm.x + (tb.om.y - striker.om.y) * dHit * nrm.y;
      // Push apart (by inverse mass).
      const pen = minD - d, wt = (1 / mt) / (1 / mt + 1 / ms);
      tb.th.addScaledVector(nrm, pen * wt / dHit);
      striker.th.addScaledVector(nrm, -pen * (1 - wt) / dHit);
      if (vrel >= 0) continue;
      const J = -(1 + 0.45) * vrel / (1 / mt + 1 / ms);
      tb.om.addScaledVector(nrm, J / mt / dHit);
      striker.om.addScaledVector(nrm, -J / ms / dHit);
      if (-vrel > 0.012) strike(tb, -vrel);
    }
    // Tubes knock each other only rarely (and quietly): keep them from passing through.
    for (let i = 0; i < tubes.length; i++) {
      const a = tubes[i], b = tubes[(i + 1) % tubes.length];
      const ax = a.hole.x + a.th.x * 0.1, az = a.hole.z + a.th.y * 0.1, bx = b.hole.x + b.th.x * 0.1, bz = b.hole.z + b.th.y * 0.1;
      const d = Math.hypot(bx - ax, bz - az);
      if (d < 2 * RT && d > 1e-6) {
        const nx = (bx - ax) / d, nz = (bz - az) / d, pen = (2 * RT - d) / 0.2;
        a.th.x -= nx * pen; a.th.y -= nz * pen; b.th.x += nx * pen; b.th.y += nz * pen;
      }
    }
    void t;
  }

  for (const tb of tubes) tb.world = new THREE.Vector3(H.x + tb.hole.x, strikerY, H.z + tb.hole.z);
  let acc = 0;
  const H_STEP = 1 / 240;
  const api = mesh.__extraApi = {
    get strikes() { return state.strikes; },
    tubes, striker, H, airT, airS,
    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);
      state.time += dt;
      const t = state.time;
      const A = ctx.audio;
      state.tokens = Math.min(4, state.tokens + dt * 3.5);
      // Is a rotor close enough to matter?
      wakeNear = false;
      const air = ctx.sim && ctx.sim.air;
      if (air && !air.calm) for (const wk of air.wakes) {
        if (!wk.active) continue;
        if (Math.hypot(wk.hub.x - H.x, wk.hub.z - H.z) < 1.0 || (wk.vg && Math.hypot(wk.hit.x - H.x, wk.hit.z - H.z) < 1.3)) wakeNear = true;
      }
      probe.set(H.x, strikerY, H.z);
      airAt(probe, airT, t, 0);
      probe.set(H.x, sailTop - sailH * 0.5, H.z);
      airAt(probe, airS, t, 1.7);
      // Clamp silly speeds (right in the column) so the integration stays sane.
      if (airT.lengthSq() > 64) airT.setLength(8);
      if (airS.lengthSq() > 64) airS.setLength(8);
      acc += dt;
      let n = 0;
      while (acc >= H_STEP && n < 16) { step(H_STEP, t); acc -= H_STEP; n++; }
      if (n === 16) acc = 0;
      // Pose the bones.
      _e.set(-sway.th.y, 0, sway.th.x);
      root.quaternion.setFromEuler(_e);
      for (const tb of tubes) { _e.set(-tb.th.y, 0, tb.th.x); tb.bone.quaternion.setFromEuler(_e); }
      _e.set(-striker.th.y, striker.yaw, striker.th.x);
      strikerBone.quaternion.setFromEuler(_e);
      // Audio: keep the bank placed while it rings, let it go after a quiet spell.
      if (state.bank && A && A.ctx) {
        const now = A.ctx.currentTime;
        if (now - state.lastStrike > 9) freeBank();
        else placeBank(A);
      }
    },
  };
  return api;
}

// Air the rotor column stirs up around itself: drawn in towards the column (entrainment) and churned in
// eddies reaching a few rotor radii out. Adds the drawn-in flow to out; returns the eddies' strength (m/s).
export function wakeStir(sim, p, out) {
  let eddy = 0;
  for (const wk of sim.air.wakes) {
    if (!wk.active) continue;
    const rx = p.x - wk.hub.x, ry = p.y - wk.hub.y, rz = p.z - wk.hub.z;
    const s = rx * wk.dir.x + ry * wk.dir.y + rz * wk.dir.z;
    if (s < -0.3 || s > wk.len + 0.15) continue;
    const px = rx - wk.dir.x * s, py = ry - wk.dir.y * s, pz = rz - wk.dir.z * s;
    const d = Math.hypot(px, py, pz) + 1e-4, R = wk.radius;
    if (d > R * 6) continue;
    const near = Math.exp(-Math.max(0, d - R) / (2 * R)) * (s < 0 ? Math.exp(s / 0.12) : 1);
    const pull = wk.vi * 0.3 * near * Math.min(1, R / d);
    out.x -= px / d * pull; out.y -= py / d * pull; out.z -= pz / d * pull;
    out.addScaledVector(wk.dir, wk.vi * 0.2 * near);
    eddy = Math.max(eddy, wk.vi * 1.4 * near);
  }
  return eddy;
}

function mergeSimple(list) {
  let n = 0;
  for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose(); g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
void _a;
