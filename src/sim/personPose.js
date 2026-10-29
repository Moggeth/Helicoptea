import * as THREE from 'three';

// A person's skeleton and the pose solver shared by the sim (colliders that follow the body) and the renderer
// (one skinned mesh per person). Person space: y up from the floor under the seat, the person facing +z, so
// +x is their left. Every bone's matrix is solved straight into person space; the mesh is built with each
// part in its own bone's frame, so the bone matrices are also the skinning matrices (no inverses).
//
// Bone frames:
//   pelvis, spine, chest   origin on the spine, +y up the body, +z forward
//   head                   origin at the base of the neck; the skull's centre is NECK + headR above it
//   eyes, mouth*           on the face, scaled to blink and to change the mouth's shape
//   upper arm, forearm,    origin at the joint, the limb running down -y, +z its front (knee caps, the
//   thigh, shin            inside of the elbow)
//   hand                   origin at the wrist, fingers down -y, palm towards -x on the left hand (+x right)
//   foot                   origin at the ankle, toes along +z, sole at -ankle
//   prop                   whatever the person holds (a book, the knitting), placed by the animation
//   nick0..2               small red nicks left by rotor blades, carried by the bone they landed on

export const BONE = {
  pelvis: 0, spine: 1, chest: 2, head: 3, eyes: 4, mouthN: 5, mouthS: 6, mouthO: 7,
  uaL: 8, faL: 9, handL: 10, uaR: 11, faR: 12, handR: 13,
  thL: 14, shL: 15, footL: 16, thR: 17, shR: 18, footR: 19, prop: 20, nick: 21,
};
export const NICKS = 3;
export const BONE_COUNT = BONE.nick + NICKS;

// Body measurements (metres) for a person of a given size (1 is about 1.7 m tall) and girth.
export function bodyOf(def) {
  const s = def.size || 1, g = def.girth || 1;
  return {
    s, g,
    pelvisUp: 0.1 * s * (0.9 + 0.1 * g),   // pelvis joint above the seat
    hipW: 0.088 * s * (0.92 + 0.08 * g),
    spine: 0.2 * s, chest: 0.245 * s, neck: 0.06 * s, headR: 0.108 * s,
    shoulderW: 0.172 * s * (0.94 + 0.06 * g),
    ua: 0.285 * s, fa: 0.25 * s, hand: 0.085 * s,
    th: 0.43 * s, sh: 0.42 * s, ankle: 0.075 * s, foot: 0.25 * s,
    waist: 0.145 * s * g, chestR: 0.15 * s * (0.85 + 0.15 * g),
  };
}

const _e = new THREE.Euler();
const _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

// A rotation matrix from yaw (about y), then pitch (about x), then roll (about z), applied to m in place.
function rot(m, yaw, pitch, roll = 0) {
  _e.set(pitch, yaw, roll, 'YXZ');
  return m.multiply(_m.makeRotationFromEuler(_e));
}

export class Poser {
  constructor(def) {
    this.def = def;
    this.b = bodyOf(def);
    this.m = Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());
    this.out = new Float32Array(BONE_COUNT * 16);
    // Joint positions of the last solve (person space), for the colliders.
    this.j = {
      pelvis: new THREE.Vector3(), neck: new THREE.Vector3(), head: new THREE.Vector3(),
      shL: new THREE.Vector3(), elL: new THREE.Vector3(), wrL: new THREE.Vector3(),
      shR: new THREE.Vector3(), elR: new THREE.Vector3(), wrR: new THREE.Vector3(),
      hipL: new THREE.Vector3(), knL: new THREE.Vector3(), anL: new THREE.Vector3(),
      hipR: new THREE.Vector3(), knR: new THREE.Vector3(), anR: new THREE.Vector3(),
    };
    for (const m of this.m) m.makeScale(0, 0, 0);
  }

  // Two-bone limb from root a to target t: lengths l1, l2, the middle joint bending towards pole (a direction).
  // front: +1 when the limb's +z faces the bend (knees), -1 when it faces away (elbows). Writes the two bone
  // matrices and returns the end point actually reached (in end).
  limb(a, t, l1, l2, pole, front, m1, m2, mid, end) {
    _d.subVectors(t, a);
    let dist = _d.length();
    const lo = Math.abs(l1 - l2) + 1e-3, hi = (l1 + l2) * 0.9995;
    dist = Math.min(hi, Math.max(lo, dist));
    _d.normalize();
    const ax = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - ax * ax));
    _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
    if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_d, -_d.z);
    _p.normalize();
    mid.copy(a).addScaledVector(_d, ax).addScaledVector(_p, h);
    end.copy(a).addScaledVector(_d, dist);
    this.segment(m1, a, mid, _p, front);
    this.segment(m2, mid, end, _p, front);
    return end;
  }

  // A bone at a running to b (down its -y), its +z towards bend * front.
  segment(m, a, b, bend, front) {
    _y.subVectors(a, b).normalize();
    _z.copy(bend).multiplyScalar(front).addScaledVector(_y, -_y.dot(bend) * front).normalize();
    _x.crossVectors(_y, _z);
    m.makeBasis(_x, _y, _z).setPosition(a);
  }

  // P: the pose (see People in src/sim/people.js for how it is animated).
  //   pelvis [x, y, z], lean (back), yaw, roll; bend (spine forward), chestBend, twist, breath
  //   head [yaw, pitch, roll]; hands: handL, handR target wrists; poleL, poleR elbow directions; rollL, rollR
  //   feet: footL, footR target ankles, kneeL, kneeR knee directions, footYawL/R, footPitchL/R
  //   blink (1 open), mouth [neutral, smile, ow], prop (a Matrix4 or null), nicks [{ bone, local }]
  solve(P) {
    const B = this.b, M = this.m, J = this.j;
    const pel = M[BONE.pelvis];
    pel.makeTranslation(P.pelvis[0], P.pelvis[1], P.pelvis[2]);
    rot(pel, P.yaw || 0, -(P.lean || 0), P.roll || 0);
    J.pelvis.setFromMatrixPosition(pel);
    const sp = M[BONE.spine].copy(pel);
    rot(sp, 0, P.bend || 0, 0);
    const ch = M[BONE.chest].copy(sp).multiply(_m.makeTranslation(0, B.spine, 0));
    rot(ch, P.twist || 0, (P.chestBend || 0) - (P.breath || 0) * 0.025, 0);
    const hd = M[BONE.head].copy(ch).multiply(_m.makeTranslation(0, B.chest, 0));
    J.neck.setFromMatrixPosition(hd);
    rot(hd, P.head[0], P.head[1], P.head[2]);
    J.head.set(0, B.neck + B.headR, 0.01 * B.s).applyMatrix4(hd);
    // Face parts.
    const r = B.headR;
    M[BONE.eyes].copy(hd).multiply(_m.makeTranslation(0, B.neck + r * 1.1, 0.01 * B.s + r * 0.95)).multiply(_m.makeScale(1, Math.max(0.08, P.blink ?? 1), 1));
    const mo = P.mouth || [1, 0, 0];
    for (let i = 0; i < 3; i++) {
      const k = Math.max(0, Math.min(1, mo[i]));
      M[BONE.mouthN + i].copy(hd).multiply(_m.makeTranslation(0, B.neck + r * 0.6, r * 0.965)).multiply(_m.makeScale(k, k, k));
    }
    // Arms.
    const breathUp = (P.breath || 0) * 0.006 * B.s;
    for (const side of [1, -1]) {
      const L = side > 0;
      const sh = (L ? J.shL : J.shR).set(side * B.shoulderW, B.chest - 0.035 * B.s + breathUp, -0.012 * B.s).applyMatrix4(ch);
      const t = L ? P.handL : P.handR;
      _b.set(t[0], t[1], t[2]);
      const pole = L ? P.poleL : P.poleR;
      _c.set(pole ? pole[0] : side * 0.5, pole ? pole[1] : -0.6, pole ? pole[2] : -0.6);
      const wr = L ? J.wrL : J.wrR, el = L ? J.elL : J.elR;
      this.limb(sh, _b, B.ua, B.fa, _c, -1, M[L ? BONE.uaL : BONE.uaR], M[L ? BONE.faL : BONE.faR], el, wr);
      const hm = M[L ? BONE.handL : BONE.handR].copy(M[L ? BONE.faL : BONE.faR]);
      hm.setPosition(wr);
      rot(hm, (L ? P.rollL : P.rollR) || 0, (L ? P.bendL : P.bendR) || 0, 0);
    }
    // Legs.
    for (const side of [1, -1]) {
      const L = side > 0;
      const hip = (L ? J.hipL : J.hipR).set(side * B.hipW, 0, 0).applyMatrix4(pel);
      const t = L ? P.footL : P.footR;
      _b.set(t[0], t[1], t[2]);
      const kn = L ? P.kneeL : P.kneeR;
      _c.set(kn ? kn[0] : side * 0.15, kn ? kn[1] : 0.4, kn ? kn[2] : 1);
      const an = L ? J.anL : J.anR, kj = L ? J.knL : J.knR;
      this.limb(hip, _b, B.th, B.sh, _c, 1, M[L ? BONE.thL : BONE.thR], M[L ? BONE.shL : BONE.shR], kj, an);
      const fm = M[L ? BONE.footL : BONE.footR].makeTranslation(an.x, an.y, an.z);
      rot(fm, (L ? P.footYawL : P.footYawR) ?? side * 0.12, (L ? P.footPitchL : P.footPitchR) || 0, 0);
    }
    // The prop and the nicks.
    if (P.prop) M[BONE.prop].copy(P.prop); else M[BONE.prop].makeScale(0, 0, 0);
    for (let i = 0; i < NICKS; i++) {
      const n = P.nicks && P.nicks[i];
      if (n) M[BONE.nick + i].multiplyMatrices(M[n.bone], n.local); else M[BONE.nick + i].makeScale(0, 0, 0);
    }
    for (let i = 0; i < BONE_COUNT; i++) M[i].toArray(this.out, i * 16);
    return this.out;
  }
}

// Points on a seated person used for hands at rest: the top of a thigh, a fraction f along it.
export function onThigh(J, side, f, up, out) {
  const hip = side > 0 ? J.hipL : J.hipR, kn = side > 0 ? J.knL : J.knR;
  return out.lerpVectors(hip, kn, f).setY(out.y + up);
}
