import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PEOPLE } from '../sim/people.js';
import { BONE, BONE_COUNT, NICKS, bodyOf } from '../sim/personPose.js';

// Draws the neighbours (src/sim/people.js). Each person is one skinned mesh, every part of them (clothes,
// face, glasses, the book they hold, the nicks a rotor left) built in its own bone's frame and merged with
// vertex colours, so a person is a single draw call, and everyone shares one material (one shader program,
// built in the load-time warm-up with the rest of the world). The sim solves the bone matrices; drawing a
// person copies them into its bone texture, only when they have changed.

const TAU = Math.PI * 2;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();
const IDENT = new THREE.Matrix4();
const STAND_IN = { matrixWorld: IDENT, isBone: true };
let material = null;
function releaseArray() { this.array = null; }
function peopleMaterial() {
  if (!material) {
    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    material.name = 'people';
  }
  return material;
}

// A matrix from position, rotation (x, y, z Euler) and scale.
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}

// Collects the parts of one person.
class Kit {
  constructor() { this.parts = []; }
  add(geo, bone, color, matrix, shade = 0.16) {
    let g = geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.index) g = mergeVertices(g);
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count, nor = g.attributes.normal;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      // A little light from above baked in: undersides a shade darker.
      const k = 1 - shade * (0.5 - 0.5 * nor.getY(i));
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      si[i * 4] = bone; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.parts.push(g);
    return g;
  }
  // A limb piece down -y from y0 to y1 (y0 > y1), radius r0 at y0, r1 at y1; depth scales z.
  tube(bone, color, r0, r1, y0, y1, seg = 8, x = 0, z = 0, sx = 1, sz = 1) {
    const h = y0 - y1;
    return this.add(new THREE.CylinderGeometry(r0, r1, h, seg, 1), bone, color, M(x, (y0 + y1) / 2, z, 0, 0, 0, sx, 1, sz));
  }
  ball(bone, color, r, x, y, z, sx = 1, sy = 1, sz = 1, w = 10, h = 7) {
    return this.add(new THREE.SphereGeometry(r, w, h), bone, color, M(x, y, z, 0, 0, 0, sx, sy, sz));
  }
  box(bone, color, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, r = 0) {
    const g = r ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, bone, color, M(x, y, z, rx, ry, rz));
  }
  // A body piece turned round y from a profile of [radius, y], squashed front to back (sz) and widened (sx).
  lathe(bone, color, prof, sx, sz, seg = 12, x = 0, z = 0) {
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg).rotateY(Math.PI); // its seam at the back
    return this.add(g, bone, color, M(x, 0, z, 0, 0, 0, sx, 1, sz));
  }
  build() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return g;
  }
}

const darker = (hex, k) => _c.set(hex).multiplyScalar(k).getHex();

// ------------------------------------------------------------------------------------------- a person
function personGeometry(def) {
  const B = bodyOf(def), s = B.s, g = B.g, L = def.look, K = new Kit();
  const top = L.top, under = L.under || top, skin = L.skin, hair = L.hair;
  const skirt = !!L.skirt, bottom = L.bottom, legs = L.legs || bottom;
  const style = L.topStyle;
  const bare = style === 'tshirt' || L.rolled;   // forearms showing

  // Pelvis: the seat of the trousers (or skirt) and a belt.
  K.ball(BONE.pelvis, bottom, 1, 0, -0.012 * s, -0.012 * s, 0.168 * s * g, 0.105 * s, 0.13 * s * g, 10, 6);
  if (!skirt && style !== 'coat') K.tube(BONE.pelvis, 0x3a2a20, B.waist * 1.03, B.waist * 1.03, 0.085 * s, 0.06 * s, 10, 0, 0, 1, 0.74);
  if (style === 'coat') K.tube(BONE.pelvis, top, B.waist * 1.08, 0.17 * s * g, 0.09 * s, -0.08 * s, 10, 0, -0.01, 1, 0.82); // the coat's skirts

  // Spine: the middle.
  K.lathe(BONE.spine, top, [[B.waist * 0.96, -0.012], [B.waist, 0.03 * s], [(B.waist + B.chestR) * 0.5, B.spine * 0.6], [B.chestR * 0.9, B.spine + 0.02 * s]], 1.05, 0.72);
  if (g > 1.1) K.ball(BONE.spine, top, B.waist * 0.92, 0, 0.075 * s, B.waist * 0.2, 1, 0.9, 0.78);
  const front = (y) => (y > B.spine ? B.chestR : B.waist + (B.chestR - B.waist) * (y / B.spine)) * 0.72;
  if (style === 'cardigan' || style === 'coat') {
    // Buttons down the front, the blouse showing in the V above them.
    const bc = style === 'coat' ? 0x2a2420 : darker(top, 0.7);
    for (const y of [0.04, 0.12]) K.ball(BONE.spine, bc, (style === 'coat' ? 0.011 : 0.007) * s, 0, y * s, front(y * s) + 0.003, 1, 1, 0.6, 6, 4);
    for (const y of [0.03, 0.11]) K.ball(BONE.chest, bc, (style === 'coat' ? 0.011 : 0.007) * s, 0, y * s, B.chestR * 0.71 + 0.002, 1, 1, 0.6, 6, 4);
  }
  if (L.apron) {
    K.box(BONE.spine, L.apron, 0.27 * s, 0.24 * s, 0.008, 0, 0.05 * s, B.waist * 0.74 + 0.006);
    K.box(BONE.pelvis, L.apron, 0.29 * s, 0.32 * s, 0.008, 0, -0.1 * s, B.waist * 0.76 + 0.012, 0.06);
    K.box(BONE.spine, darker(L.apron, 0.8), 0.32 * s * g, 0.018 * s, 0.01, 0, 0.0, B.waist * 0.72 + 0.004);  // the ties
  }

  // Chest: shoulders, collar, and what hangs at the neck.
  // Rounded over the shoulders into the neck.
  const cr = B.chestR, ch = B.chest;
  K.lathe(BONE.chest, top, [[cr * 0.95, -0.005], [cr * 1.0, ch * 0.35], [cr * 0.97, ch * 0.72], [cr * 0.88, ch - 0.03 * s], [cr * 0.62, ch - 0.008 * s], [0.06 * s, ch + 0.004 * s]], 1.18, 0.7, 14);
  for (const side of [1, -1]) K.ball(BONE.chest, top, 0.05 * s, side * B.shoulderW * 0.9, B.chest - 0.04 * s, -0.012 * s, 1, 1, 1, 8, 6);
  if (style === 'cardigan' || style === 'coat') {
    // The neckline: blouse or jumper under it.
    for (const side of [1, -1]) K.box(BONE.chest, under, 0.022 * s, 0.075 * s, 0.006, side * 0.019 * s, B.chest - 0.05 * s, B.chestR * 0.66, -0.32, 0, side * 0.45);
    if (style === 'coat') for (const side of [1, -1]) K.box(BONE.chest, darker(top, 0.82), 0.05 * s, 0.13 * s, 0.01, side * 0.04 * s, B.chest - 0.08 * s, B.chestR * 0.68, -0.2, 0, side * 0.35);
  }
  K.tube(BONE.chest, style === 'shirt' || style === 'cardigan' ? under : top, 0.058 * s, 0.062 * s, B.chest + 0.016 * s, B.chest - 0.008 * s, 9, 0, 0.004, 1, 0.9);
  if (style === 'shirt') for (const side of [1, -1]) K.box(BONE.chest, under, 0.045 * s, 0.006, 0.035 * s, side * 0.03 * s, B.chest - 0.005 * s, 0.045 * s, 0.6, side * 0.5, 0);
  if (L.brooch) K.ball(BONE.chest, L.brooch, 0.011 * s, 0.07 * s, B.chest - 0.07 * s, B.chestR * 0.69, 1, 1, 0.5, 6, 4);
  if (L.pearls) K.add(new THREE.TorusGeometry(0.066 * s, 0.006 * s, 4, 14), BONE.chest, 0xf2ead8, M(0, B.chest - 0.025 * s, 0.022 * s, Math.PI / 2 - 0.55, 0, 0, 1, 1.0, 1), 0.05);
  if (L.apron) K.box(BONE.chest, L.apron, 0.2 * s, 0.17 * s, 0.008, 0, B.chest * 0.45, B.chestR * 0.7 + 0.006);
  if (L.scarf) {
    K.add(new THREE.TorusGeometry(0.068 * s, 0.024 * s, 6, 12), BONE.chest, L.scarf, M(0, B.chest - 0.004, 0, Math.PI / 2 - 0.15, 0, 0, 1, 0.92, 1));
    K.box(BONE.chest, L.scarf, 0.05 * s, 0.17 * s, 0.018 * s, 0.035 * s, B.chest - 0.1 * s, B.chestR * 0.7 + 0.008, -0.08, 0, -0.08, 0.006);
    K.box(BONE.chest, darker(L.scarf, 0.85), 0.05 * s, 0.012 * s, 0.02 * s, 0.035 * s, B.chest - 0.17 * s, B.chestR * 0.7 + 0.01, -0.08, 0, -0.08); // a stripe at the end
  }

  // Head.
  const r = B.headR, hy = B.neck + r, fz = 0.01 * s; // skull centre (and how far forward it sits)
  K.tube(BONE.head, skin, 0.043 * s, 0.05 * s, B.neck + 0.03 * s, -0.01, 8, 0, 0.004);
  // The head: an egg, narrower at the jaw (one surface, so nothing fights over the cheeks).
  // Round on top (the hair fits over it), the jaw brought forward a little.
  const egg = [[0, -1.0], [0.38, -0.95], [0.62, -0.78], [0.8, -0.5], [0.93, -0.15], [0.98, 0.15], [0.92, 0.4], [0.8, 0.6], [0.6, 0.8], [0.32, 0.95], [0, 1.0]];
  const head = new THREE.LatheGeometry(egg.map(([x, y]) => new THREE.Vector2(Math.max(x * r, 1e-4), y * r)), 12).rotateY(Math.PI);
  const hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) if (hp.getY(i) < 0) hp.setZ(i, hp.getZ(i) - hp.getY(i) * 0.16);
  head.computeVertexNormals();
  K.add(head, BONE.head, skin, M(0, hy, fz, 0, 0, 0, 0.9, 1.06, 0.98));
  K.ball(BONE.head, darker(skin, 0.94), r * 0.16, 0, B.neck + r * 0.93, r * 0.94, 0.9, 1.15, 1.05, 7, 5);  // nose
  const ears = L.ears || 1;
  for (const side of [1, -1]) {
    K.ball(BONE.head, darker(skin, 0.95), 0.012 * s * ears, side * r * 0.88, B.neck + r * 1.0, -0.004, 0.75, 2.4, 1.7, 7, 5);
    K.box(BONE.head, darker(hair, 0.7), 0.03 * s, 0.006 * s, 0.008 * s, side * 0.034 * s, B.neck + r * 1.3, fz + r * 0.95, -0.15, 0, side * 0.12);  // brows
    if (L.earrings) K.ball(BONE.head, 0xd9b45a, 0.006 * s, side * r * 0.9, B.neck + r * 0.78, 0, 1, 1, 1, 5, 4);
  }
  // Hair.
  const cap = (k, phi, tilt, sy = 1.06) => K.add(new THREE.SphereGeometry(r * k, 12, 7, 0, TAU, 0, phi), BONE.head, hair, M(0, hy, 0.01 * s, tilt, 0, 0, 0.92, sy, 1.0), 0.25);
  switch (L.hairStyle) {
    case 'bun': cap(1.05, Math.PI * 0.55, -0.35); K.ball(BONE.head, hair, r * 0.4, 0, hy + r * 0.62, -r * 0.62, 1, 0.9, 1, 9, 6); break;
    case 'short': cap(1.06, Math.PI * 0.6, -0.45); break;
    case 'crop': cap(1.05, Math.PI * 0.5, -0.5); break;
    case 'ponytail':
      cap(1.07, Math.PI * 0.56, -0.52);
      K.ball(BONE.head, 0xb8283a, 0.018 * s, 0, hy + r * 0.25, -r * 0.98, 1, 1, 1, 6, 4);   // the band
      K.add(new THREE.ConeGeometry(0.035 * s, 0.17 * s, 7), BONE.head, hair, M(0, hy - r * 0.35, -r * 1.05, Math.PI + 0.2, 0, 0), 0.25);
      break;
    case 'curls':
      for (let i = 0; i < 18; i++) {
        const a = i * 2.39996, y = 1 - (i / 17) * 1.2, rr = Math.sqrt(Math.max(0, 1 - y * y));
        if (y < -0.1 && Math.cos(a) * rr > 0.2) continue;   // keep the face clear
        K.ball(BONE.head, darker(hair, 0.92 + 0.08 * (i % 3) / 2), r * 0.33, Math.sin(a) * rr * r * 0.86, hy + y * r * 0.95, -Math.abs(Math.cos(a)) * rr * r * 0.6 * (y > 0.5 ? 0.5 : 1) - 0.01 * s, 1, 1, 1, 6, 4);
      }
      break;
    case 'bald': case 'cap':
      K.add(new THREE.TorusGeometry(r * 0.9, r * 0.17, 5, 12, Math.PI * 1.15), BONE.head, hair, M(0, hy - r * 0.05, -0.004, Math.PI / 2 - 0.1, 0, Math.PI * 1.425), 0.25);
      break;
    default: break;
  }
  if (L.cap) {
    K.add(new THREE.SphereGeometry(r * 1.08, 12, 6, 0, TAU, 0, Math.PI * 0.5), BONE.head, L.cap, M(0, hy + r * 0.12, -0.005, -0.12, 0, 0, 0.96, 0.62, 1.04));
    K.box(BONE.head, darker(L.cap, 0.9), r * 1.4, 0.008 * s, r * 0.62, 0, hy + r * 0.32, r * 0.92, 0.2, 0, 0, 0.003);
  }
  if (L.glasses) {
    for (const side of [1, -1]) {
      K.add(new THREE.TorusGeometry(0.02 * s, 0.0026 * s, 4, 10), BONE.head, L.glasses, M(side * 0.035 * s, B.neck + r * 1.1, fz + r * 1.06), 0);
      K.box(BONE.head, L.glasses, 0.003 * s, 0.003 * s, r * 0.95, side * r * 0.86, B.neck + r * 1.12, fz + r * 0.55);
    }
    K.box(BONE.head, L.glasses, 0.012 * s, 0.003 * s, 0.003 * s, 0, B.neck + r * 1.13, fz + r * 1.06);
  }
  if (L.beard) K.ball(BONE.head, L.beard, r * 0.56, 0, B.neck + r * 0.36, r * 0.4, 1.16, 0.85, 0.95, 9, 6);
  if (L.moustache || L.beard) K.box(BONE.head, L.moustache || L.beard, 0.05 * s, 0.012 * s, 0.014 * s, 0, B.neck + r * 0.74, fz + r * 0.97, 0, 0, 0, 0.004);
  // Eyes (they blink by squashing), and three mouths for the face it pulls.
  for (const side of [1, -1]) K.ball(BONE.eyes, 0x221a16, 0.0115 * s, side * 0.035 * s, 0, 0, 1, 1.1, 0.6, 7, 5);
  K.box(BONE.mouthN, 0x6e3530, 0.032 * s, 0.0045 * s, 0.006 * s, 0, 0, 0);
  K.add(new THREE.TorusGeometry(0.016 * s, 0.0028 * s, 3, 8, Math.PI), BONE.mouthS, 0x6e3530, M(0, 0.012 * s, 0, 0, 0, Math.PI, 1, 0.8, 1), 0);
  K.add(new THREE.CylinderGeometry(0.0095 * s, 0.0095 * s, 0.006 * s, 9), BONE.mouthO, 0x3a1816, M(0, -0.002 * s, 0, Math.PI / 2, 0, 0, 1, 1, 1.35), 0);

  // Arms: sleeves, cuffs, wrists, hands.
  for (const side of [1, -1]) {
    const ua = side > 0 ? BONE.uaL : BONE.uaR, fa = side > 0 ? BONE.faL : BONE.faR, hb = side > 0 ? BONE.handL : BONE.handR;
    if (style === 'tshirt') {
      K.tube(ua, top, 0.05 * s, 0.045 * s, 0.03 * s, -B.ua * 0.45, 8);
      K.tube(ua, skin, 0.04 * s, 0.037 * s, -B.ua * 0.42, -B.ua - 0.01, 8);
    } else K.tube(ua, top, 0.048 * s, 0.041 * s, 0.03 * s, -B.ua - 0.012, 8);
    K.ball(fa, bare && style === 'tshirt' ? skin : top, 0.041 * s, 0, 0, 0, 1, 1, 1, 8, 5);  // the elbow
    if (bare) {
      K.tube(fa, skin, 0.038 * s, 0.029 * s, 0.005, -B.fa, 8);
      if (L.rolled) K.tube(fa, top, 0.046 * s, 0.045 * s, -0.01 * s, -0.05 * s, 8);
    } else {
      K.tube(fa, top, 0.041 * s, 0.034 * s, 0.01, -B.fa * 0.86, 8);
      K.tube(fa, style === 'cardigan' || style === 'coat' ? under : darker(top, 0.85), 0.036 * s, 0.035 * s, -B.fa * 0.8, -B.fa * 0.9, 8);
      K.tube(fa, skin, 0.028 * s, 0.027 * s, -B.fa * 0.88, -B.fa - 0.004, 7);
    }
    if (L.watch && side > 0) {
      K.tube(fa, 0x3a2a20, 0.031 * s, 0.031 * s, -B.fa * 0.88, -B.fa * 0.94, 8);
      K.box(fa, 0xd8d4c8, 0.008 * s, 0.018 * s, 0.018 * s, 0.03 * s, -B.fa * 0.91, 0);
    }
    // The hand: palm and fingers, a thumb towards the front.
    K.box(hb, skin, 0.024 * s, 0.05 * s, 0.068 * s, 0, -0.026 * s, 0);
    K.box(hb, skin, 0.02 * s, 0.045 * s, 0.06 * s, -side * 0.004 * s, -0.068 * s, -0.002, 0.25, 0, 0);
    K.box(hb, darker(skin, 0.97), 0.018 * s, 0.045 * s, 0.02 * s, -side * 0.01 * s, -0.03 * s, 0.036 * s, -0.5, 0, -side * 0.2);
    // What they hold.
    if (L.tongs && side < 0) for (const dz of [-0.008, 0.008]) K.box(hb, 0x9a9e9e, 0.006 * s, 0.32 * s, 0.01 * s, -0.012 * s, -0.2 * s, dz * s + 0.012, dz > 0 ? 0.035 : -0.035);
    if (L.pen && side < 0) K.add(new THREE.CylinderGeometry(0.0042 * s, 0.0042 * s, 0.13 * s, 6), hb, 0x23345a, M(-0.012 * s, -0.07 * s, 0.03 * s, 0.9, 0, 0));
    if (L.bag && side > 0) {
      K.box(hb, 0xb08a5a, 0.075 * s, 0.11 * s, 0.065 * s, side * 0.04 * s, -0.08 * s, 0.01, 0, 0, 0, 0.006 * s);
      K.ball(hb, 0xa07a4a, 0.04 * s, side * 0.04 * s, -0.02 * s, 0.01, 0.9, 0.5, 0.75, 6, 4);   // its screwed-up top
    }
  }

  // Legs: thighs, knees, shins, socks, shoes.
  for (const side of [1, -1]) {
    const th = side > 0 ? BONE.thL : BONE.thR, sh = side > 0 ? BONE.shL : BONE.shR, ft = side > 0 ? BONE.footL : BONE.footR;
    if (skirt) {
      // A skirt over the knees: each thigh's half widened towards the other, a flare at the hem.
      K.tube(th, bottom, 0.08 * s * g, 0.072 * s, 0.035 * s, -B.th - 0.01, 9, -side * 0.018 * s, 0, 1.35, 1);
      K.tube(th, darker(bottom, 0.94), 0.079 * s, 0.085 * s, -B.th + 0.005, -B.th - 0.035 * s, 9, -side * 0.018 * s, -0.01 * s, 1.35, 1);
    } else {
      K.tube(th, bottom, 0.074 * s * g, 0.059 * s, 0.035 * s, -B.th - 0.005, 9);
      K.ball(th, bottom, 0.056 * s, 0, -B.th, 0.004, 1, 1, 1, 8, 5);  // the knee
    }
    K.tube(sh, skirt ? legs : bottom, skirt ? 0.047 * s : 0.057 * s, skirt ? 0.033 * s : 0.05 * s, skirt ? -0.03 * s : 0.01, -B.sh * 0.9, 8);
    K.tube(sh, L.socks || legs, 0.034 * s, 0.032 * s, -B.sh * 0.88, -B.sh - 0.02 * s, 7);
    if (!skirt) K.tube(sh, darker(bottom, 0.9), 0.053 * s, 0.054 * s, -B.sh * 0.84, -B.sh * 0.9, 8); // trouser hems
    // Shoes, toes forward, sole on the floor.
    const fl = B.foot, ah = B.ankle;
    K.box(ft, L.shoes, 0.082 * s, 0.062 * s, fl * 0.92, 0, -ah + 0.038 * s, fl * 0.25, 0, 0, 0, 0.022 * s);
    K.box(ft, darker(L.shoes, 0.55), 0.086 * s, 0.014 * s, fl * 0.96, 0, -ah + 0.007, fl * 0.25, 0, 0, 0, 0.004);
    K.box(ft, darker(L.shoes, 0.75), 0.03 * s, 0.006, fl * 0.3, 0, -ah + 0.07 * s, fl * 0.33, -0.25, 0, 0);  // laces
  }

  // The prop bone: the knitting, a newspaper, the paperback, the crossword.
  switch (def.habit) {
    case 'knit': {
      for (const sd of [1, -1]) K.add(new THREE.CylinderGeometry(0.0028 * s, 0.0028 * s, 0.27 * s, 5), BONE.prop, 0xc9c2b0, M(0, 0.04 * s, 0, 0, 0, sd * 1.25), 0);
      K.box(BONE.prop, 0xc98a3a, 0.13 * s, 0.1 * s, 0.014 * s, 0, -0.02 * s, 0, 0, 0, 0, 0.005);
      for (let i = 0; i < 4; i++) K.box(BONE.prop, 0xb07a30, 0.13 * s, 0.006, 0.016 * s, 0, -0.06 * s + i * 0.025 * s, 0, 0, 0, 0);   // rows
      K.ball(BONE.pelvis, 0xc98a3a, 0.045 * s, 0.2 * s, -0.04 * s, 0.07 * s, 1, 1, 1, 8, 6);   // the ball of wool beside her
      break;
    }
    case 'doze': case 'crossword': {
      // Newsprint: an open broadsheet (doze) or one folded to the puzzle; columns of grey type.
      const w = def.habit === 'doze' ? 0.38 : 0.2, h = def.habit === 'doze' ? 0.28 : 0.15;
      for (const sd of [1, -1]) {
        K.box(BONE.prop, 0xe2ddcf, w / 2 * s, h * s, 0.003, sd * w / 4 * s, 0, sd * 0.004 * (def.habit === 'doze' ? 1 : 0), 0, sd * 0.12, 0);
        for (let i = 0; i < 4; i++) K.box(BONE.prop, 0x9a968c, (w / 2 - 0.03) * s, 0.008 * s, 0.004, sd * w / 4 * s, (h / 2 - 0.03 - i * 0.04) * s, -0.0015 + sd * 0.003, 0, sd * 0.12, 0);
      }
      if (def.habit === 'crossword') K.box(BONE.prop, 0xf6f2e6, 0.07 * s, 0.07 * s, 0.004, -0.04 * s, -0.02 * s, -0.003);   // the grid
      break;
    }
    case 'read': {
      // A paperback open towards her (the pages face -z).
      for (const sd of [1, -1]) {
        K.box(BONE.prop, L.book || 0x7a3a3a, 0.12 * s, 0.18 * s, 0.006, sd * 0.06 * s, 0, 0.008, 0, -sd * 0.18, 0);
        K.box(BONE.prop, 0xf0e8d6, 0.11 * s, 0.17 * s, 0.014, sd * 0.057 * s, 0, -0.004, 0, -sd * 0.18, 0);
      }
      break;
    }
    default: break;
  }

  // Nicks: small red marks, flat on the skin (each nick bone sits on the surface, facing out along +z).
  for (let i = 0; i < NICKS; i++) {
    const c = new THREE.CircleGeometry(0.009, 6);
    K.add(c, BONE.nick + i, i % 2 ? 0xa3201c : 0xb52a22, M(0, 0, 0, 0, 0, i * 0.7, 1, 0.55, 1), 0);
    K.add(new THREE.CircleGeometry(0.004, 5), BONE.nick + i, 0x7a1210, M(0.002, 0.001, 0.0005), 0);
  }
  return K.build();
}

// --------------------------------------------------------------------------------------- in the world
// Builds the people of one area of the neighbourhood (area null: the tea garden's) into the world's chunks.
export function buildPeople(ctx, area) {
  const sim = ctx.sim;
  if (!sim || !sim.people) return [];
  const mat = peopleMaterial(), out = [];
  PEOPLE.forEach((def, i) => {
    if (def.area !== area) return;
    const live = sim.people.list[i];
    const geo = personGeometry(def);
    // On the GPU once uploaded: no copy kept in script memory (bounds are set below, nothing reads it back).
    for (const a of [...Object.values(geo.attributes), geo.index]) a.onUpload(releaseArray);
    // Stand-in bones: only their count matters (the update below never reads them).
    const bones = new Array(BONE_COUNT).fill(STAND_IN);
    const skeleton = new THREE.Skeleton(bones, bones.map(() => IDENT));
    // The sim solves the bone matrices in person space; the inverses are all identity (each part was built
    // in its bone's frame), so they go straight into the bone texture, only when the pose has changed.
    let shown = -1;
    skeleton.update = function update() {
      if (live.version === shown) return;
      shown = live.version;
      this.boneMatrices.set(live.poser.out);
      if (this.boneTexture) this.boneTexture.needsUpdate = true;
    };
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = `person-${def.id}`;
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.bind(skeleton, IDENT);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(live.place);
    mesh.matrixWorld.copy(live.place);
    // Bounds in person space (the pose stays within these).
    mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-0.75, 0, -0.75), new THREE.Vector3(0.75, 1.9, 1.1));
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    mesh.userData.casts = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    skeleton.update();
    // Neighbours are detail (lod 1); the tea garden's is drawn with the kitchen's view through the door too.
    ctx.object(mesh, area ? 1 : 0);
    // A soft shadow on the ground under whoever is standing.
    if (live.kind === 'stand' && ctx.ground && ctx.ground.shadowCircle) ctx.ground.shadowCircle(def.at[0], def.at[2], 0.25, 0.9, 0.3);
    out.push(mesh);
  });
  return out;
}
