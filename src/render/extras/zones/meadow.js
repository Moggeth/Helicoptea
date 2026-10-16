import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM, BENCH, TREE } from '../../../sim/layout.js';
import { MD, pileLogs } from '../../../sim/extras/zones/meadow.js';
import { registerExtraSound } from '../../../audio/extras.js';

// The meadow's set pieces along the back border and in the long grass (see the sim module for the colliders):
//   1. wildflower drifts: poppies, cornflowers, ox-eye daisies and buttercups on bendy stems (sway in the
//      breeze and the rotor wash through the shared sway material; merged into the shared batch)
//   2. a white WBC beehive on a stand, with honey bees that fly out to the flowers and back, enter and leave
//      the hive, and scatter in rotor wash (one instanced mesh)
//   3. a compact wooden wheelbarrow of mown grass
//   4. a sundial on a stone baluster, with a small tortoiseshell butterfly that flies off when the rotor
//      comes near, flutters round the meadow and lands again on a flower or the dial
//   5. a stacked log pile beside a hedgehog house (with its hedgehog), three loose split logs on top
//   6. a garden rake and a digging fork leaning on the hedge
// Own draw calls: bees (1), butterfly (1), log atlas (1, static), loose logs (1).

const FY = ROOM.floorY;
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

let rs = 90210;
const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const rr = (a, b) => a + (b - a) * rnd();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ small geometry helpers
const scaleUV = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };
// Cylinder from a to b.
function rod(a, b, r, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1);
  scaleUV(g, 0.25, L * 2.5);
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), V(1, 1, 1)));
  return g;
}
// Square frustum (axis-aligned): base width wb, top width wt, height h, depth ratio dr.
function frustum(wb, wt, h, dr = 1) {
  const g = new THREE.CylinderGeometry(wt * 0.70711, wb * 0.70711, h, 4, 1).rotateY(Math.PI / 4);
  g.scale(1, 1, dr);
  return scaleUV(g, wb * 4 * 2.5, h * 2.5);
}
// A slab between four corners (a to b along the length, a to d up), thickness t on the side away from `side`.
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
function slab(a, b, c, d, t, side) {
  _e1.subVectors(b, a); _e2.subVectors(d, a);
  _n.crossVectors(_e1, _e2).normalize();
  _c.copy(a).add(b).add(c).add(d).multiplyScalar(0.25).sub(side);
  if (_n.dot(_c) < 0) _n.negate();           // n now points away from `side`
  const off = _n.clone().multiplyScalar(t);
  const P = [a, b, c, d, a.clone().add(off), b.clone().add(off), c.clone().add(off), d.clone().add(off)];
  const faces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const pos = [], uv = [];
  const e1n = _e1.clone().normalize(), e2n = _e2.clone().sub(e1n.clone().multiplyScalar(_e2.dot(e1n))).normalize();
  for (const f of faces) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const p = P[f[k]];
      pos.push(p.x, p.y, p.z);
      const q = p.clone().sub(a);
      uv.push(q.dot(e1n) * 2, q.dot(e2n) * 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// A frame: puts a part at local (x, y, z, ry, rx, rz) inside a root transform into the shared batch.
function frame(ctx, x, y, z, yaw = 0, pitch = 0, roll = 0) {
  const R = ctx.T(x, y, z, yaw, pitch, roll);
  return (geo, mat, tint, lx = 0, ly = 0, lz = 0, ry = 0, rx = 0, rz = 0, o = {}) => {
    const { sx = 1, sy = 1, sz = 1, cast = true, receive = true } = o;
    ctx.batch.add(geo, mat, R.clone().multiply(ctx.T(lx, ly, lz, ry, rx, rz, sx, sy, sz)), tint, { cast, receive });
  };
}
const jitter = (hex, k = 0.08) => {
  const c = new THREE.Color(hex), f = 1 + (rnd() - 0.5) * 2 * k;
  return c.multiplyScalar(f).getHex();
};

// Leaf strip along +y (width in x), curving over towards +z; `teeth` makes a jagged (lobed) edge.
function leafStrip(len, w, bend, teeth = 0, segs = 5) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    let hw = w * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.75)) * (0.35 + 0.65 * (1 - Math.abs(t - 0.4)));
    if (teeth) hw *= 1 - 0.35 * (i % 2);
    const y = t * len, z = bend * t * t * len;
    pos.push(-hw, y, z - hw * 0.35, hw, y, z - hw * 0.35, 0, y, z);   // folded along the midrib (V section)
    uv.push(0, t, 1, t, 0.5, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3, b = a + 3;
    idx.push(a, b, a + 2, a + 2, b, b + 2, a + 2, b + 2, a + 1, a + 1, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// A cupped, slightly crinkled patch of a disc (poppy and buttercup petals): x = a*rx, z = b*rz, y = depth*(a^2+b^2).
function cupPatch(rx, rz, depth, cu = 0, cv = 0, su = 1, sv = 1, lift = 0, rings = 3, segs = 12, crinkle = 0.0022) {
  const pos = [], uv = [], idx = [];
  const pt = (r, th) => {
    const a = cu + su * r * Math.cos(th), b = cv + sv * r * Math.sin(th);
    const cr = crinkle * Math.sin(th * 5 + r * 5) * r * r;
    pos.push(a * rx, depth * rx * (a * a + b * b) + lift + cr, b * rz);
    uv.push(0.5 + 0.5 * r * Math.cos(th), 0.5 + 0.5 * r * Math.sin(th));
  };
  pt(0, 0);
  for (let k = 1; k <= rings; k++) for (let j = 0; j < segs; j++) pt(k / rings, j / segs * TAU);
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + (j + 1) % segs);
  for (let k = 1; k < rings; k++) for (let j = 0; j < segs; j++) {
    const a = 1 + (k - 1) * segs + j, b = 1 + (k - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Flat petal along +y from a shape, set at `tilt` from the head's axis and `yaw` around it.
function ringPetal(shapeGeo, base, tilt, yaw, up = 0) {
  const g = shapeGeo.clone();
  g.translate(0, base, 0);
  g.rotateZ(-tilt);
  g.rotateY(yaw);
  g.translate(0, up, 0);
  return g;
}
function ellipseShape(w, len, n = 8) {
  const s = new THREE.Shape();
  s.absellipse(0, len / 2, w / 2, len / 2, 0, TAU, false);
  return new THREE.ShapeGeometry(s, n);
}
function starShape(w, len) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w * 0.28, len * 0.45); s.lineTo(w * 0.5, len * 0.98); s.lineTo(w * 0.27, len * 0.84);
  s.lineTo(0, len); s.lineTo(-w * 0.27, len * 0.84); s.lineTo(-w * 0.5, len * 0.98); s.lineTo(-w * 0.28, len * 0.45); s.closePath();
  return new THREE.ShapeGeometry(s, 1);
}
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (list) => mergeGeometries(list.map(ni).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }), false);

// ------------------------------------------------------------------ 1. wildflowers
function flowerHeads() {
  // Poppy: four crinkled scarlet petals opening in a wide bowl (the inner pair a little more upright), a dark
  // blotch at each base inside, and a grey-green seed pod with a dark crown in a ring of dark stamens.
  const poppyPetals = [], poppyCore = [], poppyPod = [];
  for (let i = 0; i < 4; i++) {
    const big = i % 2 === 0, sz = big ? 0.034 : 0.03, yaw = i * Math.PI / 2 + 0.25;
    const petal = cupPatch(sz, sz * 1.08, big ? 0.3 : 0.34, 0, 0, 1, 1, 0, 5, 18, 0.003);
    const blot = cupPatch(sz, sz * 1.08, big ? 0.3 : 0.34, -0.66, 0, 0.26, 0.42, 0.0008, 1, 10, 0);
    for (const g of [petal, blot]) { g.translate(sz * 0.92, 0.001 + (big ? 0 : 0.0015), 0); g.rotateZ(big ? 0.62 : 0.82); g.rotateY(yaw); }
    poppyPetals.push(petal); poppyCore.push(blot);
  }
  poppyCore.push(new THREE.CylinderGeometry(0.014, 0.012, 0.006, 16, 1, true).translate(0, 0.005, 0));   // stamens
  poppyPod.push(new THREE.SphereGeometry(0.0075, 10, 6).scale(1, 0.95, 1).translate(0, 0.0085, 0));
  poppyCore.push(new THREE.CylinderGeometry(0.0062, 0.0062, 0.0012, 8).translate(0, 0.0158, 0));          // the crown

  // Cornflower: a ring of eight ragged blue florets round a ring of smaller violet ones, in a green bract bowl.
  const cfOuter = [], cfInner = [], cfCore = [];
  const star = starShape(0.012, 0.028), starS = starShape(0.0075, 0.017);
  for (let i = 0; i < 8; i++) cfOuter.push(ringPetal(star, 0.006, 1.15 + rnd() * 0.15, i / 8 * TAU + rnd() * 0.2, 0.004));
  for (let i = 0; i < 7; i++) cfInner.push(ringPetal(starS, 0.003, 0.5 + rnd() * 0.15, i / 7 * TAU + 0.3, 0.007));
  cfCore.push(new THREE.SphereGeometry(0.0085, 8, 5, 0, TAU, Math.PI / 2, Math.PI / 2).scale(1.2, 1.1, 1.2).translate(0, 0.004, 0));

  // Ox-eye daisy: eighteen white rays, a domed yellow disc.
  const dzPetals = [], dzCore = [];
  const ray = ellipseShape(0.0072, 0.03, 6);
  for (let i = 0; i < 18; i++) dzPetals.push(ringPetal(ray, 0.009, 1.38 + (i % 2) * 0.16 + rnd() * 0.1, i / 18 * TAU + rnd() * 0.08, 0.002));
  dzCore.push(new THREE.SphereGeometry(0.0125, 10, 5).scale(1, 0.5, 1).translate(0, 0.0025, 0));

  // Buttercup: five glossy yellow petals in a shallow cup, a green boss of stamens.
  const bcPetals = [], bcCore = [];
  for (let i = 0; i < 5; i++) {
    const g = cupPatch(0.0125, 0.0125, 0.7, 0, 0, 1, 1, 0, 2, 10, 0.0006);
    g.translate(0.011, 0.001, 0); g.rotateZ(0.7); g.rotateY(i / 5 * TAU + 0.4);
    bcPetals.push(g);
  }
  bcCore.push(new THREE.SphereGeometry(0.0055, 7, 4).scale(1, 0.7, 1).translate(0, 0.002, 0));
  bcCore.push(new THREE.CylinderGeometry(0.0085, 0.0075, 0.0025, 9).translate(0, 0.004, 0));

  return {
    poppy: { petals: merge(poppyPetals), core: merge(poppyCore), pod: merge(poppyPod) },
    corn: { petals: merge(cfOuter), inner: merge(cfInner), core: merge(cfCore) },
    daisy: { petals: merge(dzPetals), core: merge(dzCore) },
    buttercup: { petals: merge(bcPetals), core: merge(bcCore) },
  };
}

// Where flowers must not grow (rectangles x0,x1,z0,z1 and circles x,z,r).
const KEEP_OUT_R = [
  [BENCH.x - BENCH.halfX - 0.1, BENCH.x + BENCH.halfX + 0.1, -5.95, -5.15],
  [-0.62, 0.05, -5.98, -4.9],           // wheelbarrow
  [-3.45, -2.72, -5.98, -5.5],          // log pile
  [-2.82, -2.38, -5.9, -5.45],          // hedgehog house
  [-1.06, -0.66, -5.85, -5.5],          // tools
  [1.9, 3.5, -6.1, -4.75],              // apple tree and its leaves
];
const KEEP_OUT_C = [
  [MD.hive.x, MD.hive.z, 0.4], [MD.sundial.x, MD.sundial.z, 0.24], [-3.28, -4.55, 0.12],
  [0.1, -4.6, 0.19], [-0.4, -5.0, 0.19], [-0.95, -5.25, 0.19],   // stepping stones
];
const free = (x, z) => {
  if (x < -3.3 || x > 3.7 || z > -4.78 || z < -5.9) return false;
  for (const [x0, x1, z0, z1] of KEEP_OUT_R) if (x > x0 && x < x1 && z > z0 && z < z1) return false;
  for (const [cx, cz, r] of KEEP_OUT_C) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
  return true;
};

const DRIFTS = [
  { x: -2.95, z: -5.05, r: 0.5, n: 14, mix: [0.25, 0.25, 0.25, 0.25] },
  { x: -1.7, z: -4.98, r: 0.8, n: 34, mix: [0.5, 0.3, 0.2, 0] },
  { x: 0.7, z: -4.98, r: 0.5, n: 24, mix: [0.2, 0.3, 0.5, 0] },
  { x: 1.55, z: -5.3, r: 0.55, n: 24, mix: [0, 0.2, 0.3, 0.5] },
  { x: 0.95, z: -5.72, r: 0.3, n: 12, mix: [0.6, 0.25, 0.15, 0] },
  { x: -0.05, z: -4.85, r: 0.35, n: 10, mix: [0.3, 0.3, 0.2, 0.2] },
];
const KINDS = ['poppy', 'corn', 'daisy', 'buttercup'];

function buildFlowers(ctx) {
  const petalM = ctx.sway(ctx.kit.petal, { baseY: FY, height: 0.6, amount: 1.4 });
  const leafM = ctx.sway(ctx.kit.leaf, { baseY: FY, height: 0.6, amount: 1.1 });
  const H = flowerHeads();
  const leafGeos = {
    poppy: [leafStrip(0.1, 0.045, 0.5, 1, 6), leafStrip(0.07, 0.035, 0.4, 1, 5)],
    corn: [leafStrip(0.11, 0.012, 0.35, 0, 5), leafStrip(0.08, 0.01, 0.3, 0, 4)],
    daisy: [leafStrip(0.09, 0.03, 0.55, 1, 5), leafStrip(0.06, 0.02, 0.4, 0, 4)],
    buttercup: [leafStrip(0.07, 0.04, 0.5, 1, 4), leafStrip(0.05, 0.03, 0.4, 1, 4)],
  };
  const stemTints = { poppy: 0x82965a, corn: 0x8aa27c, daisy: 0x63903e, buttercup: 0x6f9c37 };
  const leafTints = [0x4b7a2c, 0x5a8a34, 0x6a9740, 0x557f33];
  const heights = { poppy: [0.4, 0.6], corn: [0.46, 0.68], daisy: [0.44, 0.66], buttercup: [0.36, 0.5] };
  const perches = [];
  const k = ctx.lite ? 0.6 : 1;
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
  const opt = { cast: false, receive: true };

  for (const dr of DRIFTS) {
    const n = Math.round(dr.n * k);
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      do {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * dr.r;
        x = dr.x + Math.cos(a) * d; z = dr.z + Math.sin(a) * d * 0.7;
      } while (!free(x, z) && ++tries < 12);
      if (tries >= 12) continue;
      let u = rnd(), kind = 0, acc = 0;
      for (let m = 0; m < 4; m++) { acc += dr.mix[m]; if (u < acc) { kind = m; break; } }
      const name = KINDS[kind], [h0, h1] = heights[name];
      const h = rr(h0, h1), lean = rr(0.02, 0.07), la = rnd() * TAU;
      const dx = Math.cos(la) * lean, dz = Math.sin(la) * lean;
      const pts = [V(x, FY - 0.01, z), V(x + dx * 0.2, FY + h * 0.35, z + dz * 0.2), V(x + dx * 0.55, FY + h * 0.7, z + dz * 0.55), V(x + dx * 0.85, FY + h * 0.92, z + dz * 0.85), V(x + dx, FY + h, z + dz)];
      if (name === 'poppy') pts[4].add(V(Math.cos(la) * 0.025, -0.012, Math.sin(la) * 0.025));   // the nod
      const curve = new THREE.CatmullRomCurve3(pts);
      const sr = name === 'poppy' ? 0.0022 : name === 'daisy' ? 0.0026 : 0.002;
      ctx.batch.add(new THREE.TubeGeometry(curve, 7, sr, 4, false), leafM, null, jitter(stemTints[name]), opt);
      // Leaves along the lower stem.
      const nl = name === 'buttercup' ? 3 : 4;
      for (let l = 0; l < nl; l++) {
        const t = (l + rnd() * 0.6) / nl * 0.55, p = curve.getPoint(t);
        const big = l === 0 ? 1 : 0.7 - l * 0.08;
        const g = leafGeos[name][l % 2];
        ctx.batch.add(g, leafM, ctx.T(p.x, p.y, p.z, rnd() * TAU, rr(0.7, 1.25), 0, big, big, big), jitter(leafTints[(rnd() * 4) | 0], 0.1), opt);
      }
      // Head.
      const tip = curve.getPoint(1), tan = curve.getTangent(1);
      _q.setFromUnitVectors(UP, tan);
      const tilt = name === 'poppy' ? rr(0.35, 0.7) : name === 'buttercup' ? rr(0.1, 0.35) : rr(0.15, 0.5);
      _q2.setFromAxisAngle(V(Math.cos(la + 1.6), 0, Math.sin(la + 1.6)), tilt);
      _q.premultiply(_q2);
      _q2.setFromAxisAngle(UP, rnd() * TAU);
      _q.multiply(_q2);
      const sc = rr(0.9, 1.15);
      const hm = _m.compose(tip, _q, _s.set(sc, sc, sc)).clone();
      const hd = H[name];
      if (name === 'poppy') {
        ctx.batch.add(hd.petals, petalM, hm, jitter(rnd() < 0.2 ? 0xe5532e : 0xd92a1d, 0.1), opt);
        ctx.batch.add(hd.core, petalM, hm, 0x1e1a1c, opt);
        ctx.batch.add(hd.pod, petalM, hm, 0x8d9c74, opt);
      } else if (name === 'corn') {
        ctx.batch.add(hd.petals, petalM, hm, jitter(0x3f63d8, 0.1), opt);
        ctx.batch.add(hd.inner, petalM, hm, 0x6a3fb2, opt);
        ctx.batch.add(hd.core, petalM, hm, 0x8d9e72, opt);
      } else if (name === 'daisy') {
        ctx.batch.add(hd.petals, petalM, hm, jitter(0xf6f4ea, 0.03), opt);
        ctx.batch.add(hd.core, petalM, hm, 0xe9b81a, opt);
      } else {
        ctx.batch.add(hd.petals, petalM, hm, jitter(0xf3c812, 0.06), opt);
        ctx.batch.add(hd.core, petalM, hm, 0x9fb23a, opt);
      }
      perches.push(V(tip.x, tip.y + 0.006, tip.z));
    }
  }
  return perches;
}

// ------------------------------------------------------------------ 2. beehive
function buildHive(ctx) {
  const H = MD.hive, wood = ctx.kit.wood, paint = ctx.kit.paint, zinc = ctx.kit.zinc, bx = (w, h, d) => ctx.boxUV(w, h, d, 2.5);
  const put = frame(ctx, H.x, FY, H.z, 0);
  const W = 0xf1ede2, W2 = 0xe6e0d2, DARK = 0x1b140f;
  const y0 = H.legH;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(bx(0.042, H.legH, 0.042), wood, W2, sx * 0.215, H.legH / 2, sz * 0.215);
  for (const sz of [-1, 1]) put(bx(0.43, 0.026, 0.026), wood, W2, 0, 0.09, sz * 0.215, 0, 0, 0, { cast: false });
  for (const sx of [-1, 1]) put(bx(0.026, 0.026, 0.43), wood, W2, sx * 0.215, 0.09, 0, 0, 0, 0, { cast: false });
  put(bx(0.5, 0.03, 0.5), paint, W, 0, y0 - 0.015, 0);
  put(bx(0.5, H.floorT, 0.56), paint, 0xece7da, 0, y0 + H.floorT / 2, 0.025);
  // The alighting board slopes down from the floor's front edge.
  put(bx(0.2, 0.014, 0.19), wood, 0xd8d1c0, 0, y0 + 0.008, 0.37, 0, 0.32, 0, { cast: false });
  put(bx(0.17, 0.007, 0.012), wood, 0xcfc7b4, 0, y0 + 0.016, 0.285, 0, 0.1, 0, { cast: false });
  for (let i = 0; i < H.lifts; i++) {
    const yb = y0 + H.floorT + i * (H.lift - 0.002);
    put(bx(0.516, 0.014, 0.516), paint, W, 0, yb + 0.007, 0);                       // the skirt each lift stands on
    put(frustum(0.5, 0.455, H.lift, 1), paint, i === 1 ? 0xf4f0e6 : W, 0, yb + H.lift / 2, 0);
    for (const s of [-1, 1]) put(bx(0.004, 0.02, 0.08), wood, DARK, s * 0.2335, yb + H.lift * 0.62, 0, 0, 0, 0, { cast: false });   // hand slots
    put(bx(0.07, 0.02, 0.004), wood, DARK, 0, yb + H.lift * 0.62, -0.2335, 0, 0, 0, { cast: false });
  }
  const yTop = y0 + H.floorT + H.lifts * (H.lift - 0.002) + 0.002;
  // The entrance slot and its reducer.
  put(bx(0.13, 0.016, 0.012), wood, DARK, 0, y0 + H.floorT + 0.011, 0.255, 0, 0, 0, { cast: false });
  put(bx(0.5, 0.018, 0.5), paint, W, 0, yTop + 0.009, 0);                           // crown board
  put(bx(0.6, 0.026, 0.6), paint, W, 0, yTop + 0.031, 0);                           // eaves
  put(frustum(0.6, 0.22, 0.12, 1), zinc, 0xb3b8b6, 0, yTop + 0.044 + 0.06, 0);       // the sheet-metal pyramid
  put(bx(0.25, 0.008, 0.25), zinc, 0x9fa5a3, 0, yTop + 0.168, 0, 0, 0, 0, { cast: false });
  put(new THREE.CylinderGeometry(0.03, 0.036, 0.034, 12), paint, W, 0, yTop + 0.19, 0);  // vent
  put(new THREE.SphereGeometry(0.03, 10, 6, 0, TAU, 0, Math.PI / 2), zinc, 0xb8bdbb, 0, yTop + 0.205, 0);
  // Weathering: a green stain on the lowest lift, a pollen-yellow smear round the entrance.
  put(new THREE.PlaneGeometry(0.2, 0.03), wood, 0xcfd8b8, 0, y0 + H.floorT + 0.02, 0.2575 - 0.003, 0, 0, 0, { cast: false });
  return { entrance: V(H.x, FY + y0 + H.floorT + 0.02, H.z + 0.27), top: FY + yTop + 0.2 };
}

// Bees: one instanced mesh; wings beat in the shader.
function buildBees(ctx, hive, perches) {
  const parts = [];
  const col = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    return g.index ? g.toNonIndexed() : g;
  };
  // Abdomen: stripes of amber and black, along +z.
  const ab = new THREE.SphereGeometry(1, 10, 8).scale(0.0036, 0.0034, 0.0058).translate(0, 0, -0.0058);
  { const n = ab.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const z = ab.attributes.position.getZ(i) + 0.0058; c.setHex(Math.floor((z + 0.006) / 0.0026) % 2 ? 0x16110c : 0xdba22a); c.toArray(a, i * 3); }
    ab.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); ab.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(n), 1)); parts.push(ni(ab)); }
  parts.push(col(new THREE.SphereGeometry(1, 8, 6).scale(0.0033, 0.003, 0.0034).translate(0, 0.0003, 0.0008), 0x5a4020));
  parts.push(col(new THREE.SphereGeometry(1, 7, 5).scale(0.0024, 0.0024, 0.0022).translate(0, 0, 0.0043), 0x1a1510));
  // Wings: two pairs of pale veined quads, hinged at the thorax.
  for (const s of [-1, 1]) for (const [len, w, zc] of [[0.0078, 0.0034, -0.0012], [0.0056, 0.0024, -0.0004]]) {
    const g = new THREE.PlaneGeometry(len, w, 1, 1).rotateX(-Math.PI / 2).translate(s * (len / 2 + 0.0008), 0.0033, zc);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    new THREE.Color(0xdde6ea).toArray(a, 0); for (let i = 0; i < n; i++) new THREE.Color(0xdde6ea).toArray(a, i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    parts.push(ni(g));
  }
  for (const g of parts) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aWing'].includes(k)) g.deleteAttribute(k); }
  const geo = mergeGeometries(parts, false);
  const uT = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBeeT = uT;
    sh.vertexShader = 'attribute float aWing; uniform float uBeeT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      if (aWing > 0.5) {
        float ph = instanceMatrix[3].x * 53.0 + instanceMatrix[3].z * 37.0;
        float a = (0.55 + 0.5 * sin(uBeeT * 190.0 + ph)) * sign(position.x);
        vec2 r = transformed.xy - vec2(0.0, 0.0033);
        float cs = cos(a), sn = sin(a);
        transformed.xy = vec2(r.x * cs - r.y * sn, r.x * sn + r.y * cs) + vec2(0.0, 0.0033);
      }`);
  };
  mat.customProgramCacheKey = () => 'meadow-bees';
  const N = ctx.lite ? 8 : 16;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'meadow:bees';
  ctx.scene.add(mesh);

  const E = hive.entrance;
  const bees = [];
  for (let i = 0; i < N; i++) {
    bees.push({ p: E.clone().add(V(rr(-0.15, 0.15), rr(0.0, 0.2), rr(0.05, 0.3))), v: V(0, 0, 0), dir: V(0, 0, 1), mode: 0, t: rr(0.5, 6), ph: rnd() * TAU, tg: V(), inside: 0, scat: 0, rad: rr(0.1, 0.3), spd: rr(0.7, 1.3), hover: i % 2 });
  }
  const _m = new THREE.Matrix4(), _zero = V(0, 0, 0), _nd = V(), _sc = V(1, 1, 1), _tg = V(), _a = V(), _w = V();
  const near = (sim, p, r) => {
    const A = sim && sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < r && Math.abs(p.z - wk.hub.z) < r) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < r && Math.abs(p.z - wk.hit.z) < r) return true;
    }
    return false;
  };
  let t = 0;
  return {
    update(dt, sim) {
      t += dt; uT.value = t;
      const dts = Math.min(dt, 0.05);
      const wash = near(sim, E, 3.2);
      for (let i = 0; i < N; i++) {
        const b = bees[i];
        b.t -= dts;
        let kp = 14, kd = 5;
        if (b.mode === 0) {          // loiter at the entrance, in loops
          const w = t * (0.9 + b.hover * 0.5) + b.ph;
          _tg.set(E.x + Math.cos(w) * b.rad, E.y + 0.06 + Math.sin(w * 1.7) * 0.07 + b.rad * 0.3, E.z + 0.08 + Math.abs(Math.sin(w)) * b.rad);
          if (b.t <= 0) {
            if (rnd() < 0.55 && perches.length) { b.mode = 1; b.tg.copy(perches[(rnd() * perches.length) | 0]); b.t = 14; }
            else { b.mode = 3; b.t = 8; }
          }
        } else if (b.mode === 1) {   // out to a flower
          _tg.copy(b.tg); _tg.y += 0.02 + Math.sin(t * 5 + b.ph) * 0.01 + Math.max(0, 0.3 - b.p.distanceTo(b.tg)) * 0.0;
          if (b.p.distanceTo(b.tg) < 0.03 || b.t <= 0) { b.mode = 2; b.t = rr(2, 5); }
          kp = 9 * b.spd;
        } else if (b.mode === 2) {   // working the flower
          _tg.copy(b.tg); _tg.x += Math.sin(t * 7 + b.ph) * 0.006; _tg.y += 0.012 + Math.sin(t * 9 + b.ph) * 0.004;
          kp = 40; kd = 9;
          if (b.t <= 0) { b.mode = 3; b.t = 12; }
        } else if (b.mode === 3) {   // home to the alighting board
          _tg.set(E.x, E.y + 0.01, E.z + 0.02);
          kp = 9 * b.spd;
          if (b.p.distanceTo(_tg) < 0.035) { b.mode = 5; b.t = rr(1.5, 5); b.p.copy(E).add(V(0, 0, -0.1)); b.v.set(0, 0, 0); }
        } else if (b.mode === 4) {   // frightened off
          _tg.copy(b.tg);
          kp = 20;
          if (b.t <= 0) { b.mode = 3; b.t = 10; }
        } else {                      // inside the hive
          b.inside = 1;
          if (b.t <= 0) { b.mode = 0; b.t = rr(1.5, 6); b.inside = 0; b.p.copy(E).add(V(0, 0.01, 0.02)); }
        }
        if (b.mode !== 5) {
          // Spring towards the target, damped, with a little buzz of its own.
          _a.subVectors(_tg, b.p).multiplyScalar(kp).addScaledVector(b.v, -kd);
          _a.x += Math.sin(t * 13 + b.ph) * 0.9; _a.y += Math.cos(t * 11 + b.ph * 1.3) * 0.9; _a.z += Math.sin(t * 9.5 + b.ph * 0.7) * 0.9;
          b.v.addScaledVector(_a, dts);
          const sp = b.v.length(), mx = b.mode === 4 ? 1.6 : 1.1 * b.spd;
          if (sp > mx) b.v.multiplyScalar(mx / sp);
          // Rotor wash blows a bee about, and frightens it.
          if (wash && near(sim, b.p, 1.0)) {
            ctx.airAt(b.p, _w);
            const ws = _w.length();
            if (ws > 0.15) {
              b.v.addScaledVector(_w, Math.min(1, dts * 9));
              if (ws > 0.5 && b.mode !== 4) { b.mode = 4; b.t = rr(1.5, 3.5); _nd.copy(_w).setY(0).normalize(); b.tg.copy(b.p).addScaledVector(_nd, 0.7).add(V(rr(-0.2, 0.2), rr(0.1, 0.35), rr(-0.2, 0.2))); b.tg.y = Math.min(b.tg.y, 0.35); }
            }
          }
          b.p.addScaledVector(b.v, dts);
          if (b.p.y < FY + 0.02) { b.p.y = FY + 0.02; b.v.y = Math.max(0, b.v.y); }
          if (b.v.lengthSq() > 0.004) b.dir.lerp(_nd.copy(b.v).normalize(), Math.min(1, dts * 10)).normalize();
        }
        // Pose: +z along the heading.
        _nd.copy(b.dir).negate();
        _m.lookAt(_zero, _nd, UP);
        const s = b.inside || b.mode === 5 ? 0 : 1;
        _m.scale(_sc.set(s, s, s));
        _m.setPosition(b.p);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ 3. wheelbarrow
function buildBarrow(ctx) {
  const B = MD.barrow, wood = ctx.kit.wood, zinc = ctx.kit.zinc, iron = ctx.kit.iron, rubber = ctx.kit.rubber;
  const bx = (w, h, d) => ctx.boxUV(w, h, d, 2.5);
  const put = frame(ctx, B.x, FY, B.z, B.yaw);
  const PAINT = 0x6f8d6a, ASH = 0xcbb287, GRIP = 0x5a3b24;
  // The tray: corners of the inner surface, boards in three courses.
  const bb = (z) => V(-0.25, 0.225, z), fb = (z) => V(0.27, 0.315, z), br = (z) => V(-0.33, 0.45, z), fr = (z) => V(0.34, 0.455, z);
  const course = (a, b, c, d, t, side, n = 3) => {
    for (let i = 0; i < n; i++) {
      const s0 = i / n + 0.004, s1 = (i + 1) / n - 0.004;
      const lerp = (p, q, s) => p.clone().lerp(q, s);
      const p0 = lerp(a, d, s0), p1 = lerp(b, c, s0), p2 = lerp(b, c, s1), p3 = lerp(a, d, s1);
      ctx.batch.add(slab(p0, p1, p2, p3, t, side), wood, ctx.T(B.x, FY, B.z, B.yaw), jitter(PAINT, 0.07), { cast: true, receive: true });
    }
  };
  const mid = V(0, 0.35, 0);
  const zL = 0.17, zR = -0.17, zl = 0.095, zr = -0.095, zTL = 0.3, zTR = -0.3, zfl = 0.175, zfr = -0.175;
  course(bb(zL), fb(zl), fr(zfl), br(zTL), 0.014, mid);                  // left side
  course(bb(zR), fb(zr), fr(zfr), br(zTR), 0.014, mid);                  // right side
  course(bb(zR), bb(zL), br(zTL), br(zTR), 0.014, mid);                  // back
  course(fb(zl), fb(zr), fr(zfr), fr(zfl), 0.014, mid);                  // front
  // Floor boards.
  for (let i = 0; i < 4; i++) {
    const z0 = -0.17 + i * 0.085 + 0.003, z1 = z0 + 0.079, k0 = z0 / 0.17, k1 = z1 / 0.17;
    const w0 = 0.17 + (0.095 - 0.17) * 0, back0 = bb(0).setZ(z0), back1 = bb(0).setZ(z1);
    void w0; void k0; void k1;
    const f0 = fb(0).setZ(z0 * 0.56), f1 = fb(0).setZ(z1 * 0.56);
    ctx.batch.add(slab(back0, f0, f1, back1, 0.014, V(0, 1, 0)), wood, ctx.T(B.x, FY, B.z, B.yaw), jitter(0x8f7a58, 0.08), { cast: true, receive: true });
  }
  // Rim: a strip of flat steel round the top edge would be fiddly; the boards' top courses carry a darker band instead.
  // Rails (ash), grips, cross bar, legs.
  for (const s of [-1, 1]) {
    const A = V(0.36, 0.2, s * 0.075), Bp = V(-0.3, 0.21, s * 0.17), C = V(-0.5, 0.3, s * 0.2);
    put(rod(A, Bp, 0.0125, 6), ctx.kit.paint, ASH);
    put(rod(Bp, C, 0.0125, 6), ctx.kit.paint, ASH);
    put(rod(V(-0.4, 0.265, s * 0.19), V(-0.54, 0.325, s * 0.205), 0.0175, 8), rubber, GRIP);
    put(rod(V(-0.3, 0.21, s * 0.17), V(-0.34, 0.01, s * 0.2), 0.012, 6), ctx.kit.paint, ASH);        // legs
    put(bx(0.075, 0.016, 0.034), wood, 0x7a6850, -0.34, 0.008, s * 0.2);                     // feet
    put(rod(V(0.36, 0.2, s * 0.075), V(0.36, 0.14, s * 0.065), 0.01, 6), zinc, 0xaeb2b2);   // fork
  }
  put(rod(V(-0.3, 0.205, -0.17), V(-0.3, 0.205, 0.17), 0.009, 6), ctx.kit.paint, ASH);
  put(rod(V(0.0, 0.205, -0.15), V(0.0, 0.205, 0.15), 0.009, 6), ctx.kit.paint, ASH);
  put(rod(V(-0.34, 0.015, -0.2), V(-0.34, 0.015, 0.2), 0.008, 6), iron, 0x57595a);
  // Wheel, hub and axle.
  put(new THREE.TorusGeometry(0.112, 0.03, 8, 22), rubber, 0x1d1d1c, 0.36, 0.14, 0);
  put(new THREE.CylinderGeometry(0.1, 0.1, 0.045, 18).rotateX(Math.PI / 2), zinc, 0xa9adad, 0.36, 0.14, 0, 0, 0, 0, { cast: false });
  put(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 10).rotateX(Math.PI / 2), iron, 0x4c4e4e, 0.36, 0.14, 0, 0, 0, 0, { cast: false });
  put(rod(V(0.36, 0.14, -0.07), V(0.36, 0.14, 0.07), 0.007, 6), iron, 0x3a3b3b);
  // Mown clippings: two lumpy heaps and a scatter of blades.
  const leafM = ctx.sway(ctx.kit.leaf, { baseY: FY, height: 0.6, amount: 1.1 });
  ctx.batch.add(ctx.blobGeometry(0.18, 2, 3, 0.3), leafM, ctx.T(B.x, FY, B.z, B.yaw).clone().multiply(ctx.T(0.02, 0.33, 0, 0, 0, 0, 1.25, 0.55, 0.85)), 0x74903a, { cast: false });
  ctx.batch.add(ctx.blobGeometry(0.12, 2, 8, 0.3), leafM, ctx.T(B.x, FY, B.z, B.yaw).clone().multiply(ctx.T(-0.12, 0.36, 0.03, 0, 0, 0, 1.2, 0.6, 1)), 0x7f9a40, { cast: false });
  const blades = [];
  for (let i = 0; i < 110; i++) {
    const g = leafStrip(rr(0.04, 0.085), 0.0042, rr(-0.5, 0.9), 0, 2);
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.16;
    g.applyMatrix4(ctx.T(-0.0 + Math.cos(a) * r * 1.3, 0.36 + (1 - r / 0.16) * 0.06 + rnd() * 0.03, Math.sin(a) * r * 0.9, rnd() * TAU, rr(0.4, 1.4), 0));
    blades.push(ni(g));
  }
  ctx.batch.add(mergeGeometries(blades, false), leafM, ctx.T(B.x, FY, B.z, B.yaw).clone().multiply(ctx.T(0.02, 0, 0)), 0x9db646, { cast: false });
}

// ------------------------------------------------------------------ 4. sundial
function buildSundial(ctx) {
  const S = MD.sundial, stone = ctx.kit.stone, brass = ctx.kit.brass, bx = (w, h, d) => ctx.boxUV(w, h, d, 2.5);
  const put = frame(ctx, S.x, FY, S.z, 0.3);
  const ST = 0xbdb8a8, ST2 = 0xa7a597, MOSS = 0x8e9a76;
  put(bx(0.32, 0.07, 0.32), stone, MOSS, 0, 0.035, 0);
  put(bx(0.26, 0.05, 0.26), stone, ST2, 0, 0.095, 0);
  // Baluster: swelling shaft with a neck, a waist and a collar.
  const prof = [[0.095, 0], [0.1, 0.03], [0.074, 0.08], [0.066, 0.13], [0.09, 0.22], [0.112, 0.31], [0.1, 0.38], [0.068, 0.46], [0.056, 0.52], [0.06, 0.57], [0.086, 0.6], [0.09, 0.62], [0.07, 0.635]].map(([r, y]) => new THREE.Vector2(r, y));
  put(scaleUV(new THREE.LatheGeometry(prof, 22), 1.6, 1.6), stone, ST, 0, 0.12, 0, Math.PI / 10);
  const topY = S.h;
  put(new THREE.CylinderGeometry(0.18, 0.15, 0.05, 8), stone, ST, 0, topY - 0.065, 0, Math.PI / 8);
  put(new THREE.CylinderGeometry(0.155, 0.16, 0.014, 8), stone, 0xcac5b5, 0, topY - 0.033, 0, Math.PI / 8);
  // The dial plate: brass, chamfered, with a dark engraved ring, hour lines and the gnomon.
  put(new THREE.CylinderGeometry(0.15, 0.158, 0.014, 36), brass, 0xb08a42, 0, topY - 0.019, 0, 0, 0, 0, { cast: false });
  put(new THREE.CylinderGeometry(0.143, 0.147, 0.006, 36), brass, 0xc19a4e, 0, topY - 0.009, 0, 0, 0, 0, { cast: false });
  const iron = ctx.kit.iron, lat = 51.5 * Math.PI / 180;
  put(new THREE.RingGeometry(0.113, 0.118, 40).rotateX(-Math.PI / 2), iron, 0x3a2e1e, 0, topY - 0.0055, 0, 0, 0, 0, { cast: false });
  put(new THREE.RingGeometry(0.128, 0.131, 40).rotateX(-Math.PI / 2), iron, 0x3a2e1e, 0, topY - 0.0055, 0, 0, 0, 0, { cast: false });
  for (let h = -6; h <= 6; h++) {
    const th = Math.abs(h) === 6 ? Math.sign(h) * Math.PI / 2 : Math.atan(Math.sin(lat) * Math.tan(h * Math.PI / 12));
    const r0 = 0.03, r1 = 0.113, len = r1 - r0, rm = (r0 + r1) / 2;
    // North is -z: direction (sin th, -cos th).
    put(ctx.boxUV(0.0022, 0.0012, len, 1), iron, 0x3a2e1e, Math.sin(th) * rm, topY - 0.0058, -Math.cos(th) * rm, th, 0, 0, { cast: false });
    // Numerals as short bold ticks between the rings.
    put(ctx.boxUV(0.005, 0.0012, 0.011, 1), iron, 0x3a2e1e, Math.sin(th) * 0.1225, topY - 0.0058, -Math.cos(th) * 0.1225, th, 0, 0, { cast: false });
  }
  const Lg = 0.085, Hg = Lg * Math.tan(lat);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(Lg, 0); sh.lineTo(Lg, Hg); sh.lineTo(0.0, 0.004); sh.closePath();
  const gn = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }).translate(0, 0, -0.002).rotateY(Math.PI / 2);
  put(gn, brass, 0xa9823c, 0, topY - 0.0058, 0);
  put(new THREE.CylinderGeometry(0.011, 0.014, 0.008, 12), brass, 0xa9823c, 0, topY - 0.0045, 0, 0, 0, 0, { cast: false });
  return V(S.x, FY + topY + 0.0, S.z);
}

// A tortoiseshell butterfly: wings are one alpha-tested texture, flapped in the shader.
function wingTexture() {
  const W = 256, Hh = 128, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, Hh);
  // Body pixel (corner) stays opaque dark.
  g.fillStyle = '#1b130d'; g.fillRect(0, 0, 6, 6);
  // The right wing: body at x = 0. Forewing (upper), hindwing (lower); v runs up the canvas (front of the butterfly at the top).
  const wing = () => {
    g.beginPath();
    g.moveTo(8, 56);
    g.bezierCurveTo(40, 6, 150, 2, 238, 20);                        // leading edge of the forewing
    g.bezierCurveTo(250, 40, 232, 54, 214, 60);                     // outer edge, notched
    g.lineTo(226, 70); g.bezierCurveTo(238, 92, 206, 118, 170, 122);
    g.bezierCurveTo(120, 126, 60, 118, 8, 92);
    g.closePath();
  };
  g.save(); wing(); g.clip();
  const gr = g.createLinearGradient(0, 0, 240, 0);
  gr.addColorStop(0, '#6a3a14'); gr.addColorStop(0.15, '#d45f12'); gr.addColorStop(0.7, '#ee8a1c'); gr.addColorStop(1, '#f0a02a');
  g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  // Black blotches and the yellow-white patch on the forewing.
  g.fillStyle = '#17110c';
  for (const [x, y, rx, ry] of [[100, 36, 18, 14], [140, 30, 14, 12], [118, 62, 10, 8], [60, 78, 26, 18], [30, 66, 18, 24]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.3, 0, TAU); g.fill(); }
  g.fillStyle = '#f3dc86'; g.beginPath(); g.ellipse(190, 30, 14, 9, 0.3, 0, TAU); g.fill();
  // Dark margin with a row of blue crescents.
  g.strokeStyle = '#2a1a0e'; g.lineWidth = 16; wing(); g.stroke();
  g.fillStyle = '#4a77c8';
  [[36, 97], [60, 106], [84, 112], [108, 115], [132, 115], [156, 112], [180, 106]].forEach(([x, y], i) => { g.beginPath(); g.ellipse(x, y, 8, 3.6, 0.15 - i * 0.07, 0, TAU); g.fill(); });
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildButterfly(ctx, dial, perches) {
  const SPAN = 0.036, LEN = 0.03;
  const parts = [];
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(SPAN, LEN, 1, 1).rotateX(-Math.PI / 2);
    g.translate(s * SPAN / 2, 0, 0);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) { uv.setXY(i, Math.abs(pos.getX(i)) / SPAN, 1 - (pos.getZ(i) / LEN + 0.5)); }
    const n = g.attributes.position.count;
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    parts.push(g);
  }
  // Body: thin tapered capsule along z (uv in the opaque corner), head and two antennae.
  const body = new THREE.CapsuleGeometry(0.0013, 0.016, 3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.0);
  const bn = body.attributes.position.count;
  for (let i = 0; i < bn; i++) body.attributes.uv.setXY(i, 0.01, 0.01);
  body.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(bn), 1));
  parts.push(body);
  for (const s of [-1, 1]) {
    const a = new THREE.CylinderGeometry(0.0003, 0.0003, 0.012, 3).translate(0, 0.006, 0).rotateZ(-s * 0.5).rotateX(-1.05).translate(s * 0.001, 0, -0.011);
    // Rotated so it points forward (-z is forward in the wing frame: the wing's top edge is -z).
    const an = a.attributes.position.count;
    for (let i = 0; i < an; i++) a.attributes.uv.setXY(i, 0.01, 0.01);
    a.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(an), 1));
    parts.push(a);
  }
  const geo = mergeGeometries(parts.map((g) => { const n = ni(g); for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'aWing'].includes(k)) n.deleteAttribute(k); return n; }), false);
  const uFlap = { value: 0.3 };
  const mat = new THREE.MeshStandardMaterial({ map: wingTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlap = uFlap;
    sh.vertexShader = 'attribute float aWing; uniform float uFlap;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      if (aWing > 0.5) {
        float a = uFlap * sign(position.x);
        float cs = cos(a), sn = sin(a);
        transformed.xy = vec2(transformed.x * cs - transformed.y * sn, transformed.x * sn + transformed.y * cs);
      }`);
  };
  mat.customProgramCacheKey = () => 'meadow-butterfly';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'meadow:butterfly';
  ctx.scene.add(mesh);

  const p = dial.clone().add(V(0.09, 0.001, 0.05)), v = V(), tg = p.clone(), dirv = V(0, 0, -1);
  let mode = 0, timer = rr(8, 14), hop = 0, yaw = 0.7, t = 0, flap = 0.3, vy = 0;
  const _m = new THREE.Matrix4(), _zero = V(), _nd = V(), _sc = V(1, 1, 1), _w = V();
  const nearWake = (sim) => {
    const A = sim && sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 0.8 && Math.abs(p.z - wk.hub.z) < 0.8) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 1.0 && Math.abs(p.z - wk.hit.z) < 1.0) return true;
    }
    return false;
  };
  const pickPerch = () => {
    // Mostly a flower, sometimes the dial.
    if (rnd() < 0.25) tg.copy(dial).add(V(rr(-0.08, 0.08), 0.001, rr(-0.08, 0.08)));
    else tg.copy(perches[(rnd() * perches.length) | 0]);
  };
  return {
    update(dt, sim) {
      t += dt;
      const dts = Math.min(dt, 0.05);
      const scared = nearWake(sim);
      if (mode === 0) {              // resting, wings slowly opening and closing
        flap = 0.9 + Math.sin(t * 1.3) * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.37));
        timer -= dts;
        if (scared || timer <= 0) { mode = 1; timer = scared ? rr(9, 15) : rr(5, 9); pickPerch(); tg.y += 0.35; v.set(rr(-0.2, 0.2), 0.5, rr(-0.2, 0.2)); }
      } else if (mode === 1) {       // flutter about
        flap = Math.sin(t * 70) * 0.55 + 0.35;
        timer -= dts;
        // Wander on a bobbing course towards a point above the next perch.
        _nd.subVectors(tg, p);
        const dist = _nd.length();
        _nd.multiplyScalar(1 / (dist + 1e-4));
        v.addScaledVector(_nd, dts * 2.4);
        v.x += Math.sin(t * 3.1 + 1.3) * dts * 1.2; v.z += Math.cos(t * 2.7) * dts * 1.2;
        v.y += Math.sin(t * 9) * dts * 1.0;
        const sp = v.length();
        if (sp > 0.55) v.multiplyScalar(0.55 / sp);
        if (scared) { ctx.airAt(p, _w); v.addScaledVector(_w, dts * 3); }
        p.addScaledVector(v, dts);
        if (p.y < FY + 0.1) p.y = FY + 0.1;
        if (timer <= 0 && !scared) { mode = 2; tg.y = tg.y - 0.35; if (rnd() < 0.5) pickPerch(); }
        else if (dist < 0.12 && !scared && timer < 6) { mode = 2; }
      } else {                       // landing
        flap = Math.sin(t * 50) * 0.5 + 0.2;
        _nd.subVectors(tg, p);
        const dist = _nd.length();
        v.lerp(_nd.multiplyScalar(2.2), Math.min(1, dts * 3));
        if (scared) { mode = 1; timer = rr(6, 10); }
        p.addScaledVector(v, dts);
        if (dist < 0.012) { mode = 0; timer = rr(10, 22); v.set(0, 0, 0); p.copy(tg); }
      }
      hop += 0;
      void vy; void hop; void dirv;
      // Orientation: along the horizontal velocity when flying; slowly turning on a perch.
      if (mode !== 0 && v.x * v.x + v.z * v.z > 0.004) {
        let d = Math.atan2(-v.x, -v.z) - yaw;
        d = ((d + Math.PI * 3) % TAU) - Math.PI;
        yaw += d * Math.min(1, dts * 6);
      }
      uFlap.value = mode === 0 ? 0.3 + flap * 0.9 : flap + 0.5;
      _m.makeRotationY(yaw);
      _m.scale(_sc);
      _m.setPosition(p.x, p.y + (mode === 0 ? 0.0 : 0.0), p.z);
      mesh.matrix.copy(_m);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldNeedsUpdate = true;
      mesh.updateMatrixWorld(true);
      void _zero;
    },
  };
}

// ------------------------------------------------------------------ 5. log pile, hedgehog house, loose logs
function logAtlas() {
  const W = 512, Hh = 128, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  // First quarter: rough bark with vertical furrows.
  g.fillStyle = '#5f5043'; g.fillRect(0, 0, 128, Hh);
  for (let i = 0; i < 520; i++) {
    const x = rnd() * 128, y = rnd() * Hh, l = 6 + rnd() * 26, k = 50 + rnd() * 80;
    g.strokeStyle = `rgba(${k - 25},${k - 34},${k - 44},${0.35 + rnd() * 0.45})`; g.lineWidth = 1 + rnd() * 2.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y + l); g.stroke();
  }
  for (let i = 0; i < 200; i++) { const x = rnd() * 128, y = rnd() * Hh; g.fillStyle = `rgba(185,172,150,${rnd() * 0.2})`; g.fillRect(x, y, 2 + rnd() * 4, 1 + rnd() * 3); }
  // Three end-grain cells: freshly cut (pale), seasoned (honey), weathered (silver grey, cracked).
  const cells = [
    { bg: '#e9d6ac', ring: [150, 108, 64], bark: '#3a2d22', checks: 2 },
    { bg: '#d2ae78', ring: [120, 80, 44], bark: '#40322a', checks: 4 },
    { bg: '#a89f90', ring: [92, 84, 74], bark: '#4a4640', checks: 6 },
  ];
  cells.forEach((cell, k) => {
    g.save(); g.translate(128 * (k + 1), 0);
    g.fillStyle = cell.bg; g.fillRect(0, 0, 128, Hh);
    g.fillStyle = cell.bark; g.beginPath(); g.arc(64, 64, 64, 0, TAU); g.fill();       // dark bark rim
    g.fillStyle = cell.bg; g.beginPath(); g.arc(64, 64, 53 + rnd() * 3, 0, TAU); g.fill();
    g.strokeStyle = k === 0 ? '#caa66e' : '#8a6a42'; g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 54, 0, TAU); g.stroke();
    const ox = (rnd() - 0.5) * 12, oy = (rnd() - 0.5) * 12;
    for (let r = 51; r > 2; r -= 2 + rnd() * 2.6) {
      const f = r / 51;
      g.strokeStyle = `rgba(${cell.ring[0] + rnd() * 20},${cell.ring[1] + rnd() * 16},${cell.ring[2] + rnd() * 14},${0.35 + rnd() * 0.4})`; g.lineWidth = 0.7 + rnd() * 1.5;
      g.beginPath(); g.ellipse(64 + ox * (1 - f), 64 + oy * (1 - f), r, r * (0.9 + rnd() * 0.08), rnd() * 0.3, 0, TAU); g.stroke();
    }
    g.fillStyle = 'rgba(80,50,28,0.8)'; g.beginPath(); g.arc(64 + ox, 64 + oy, 2.2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(55,36,20,0.75)'; g.lineWidth = 1.2;
    for (let i = 0; i < cell.checks; i++) {
      const a = rnd() * TAU, l = 20 + rnd() * 32; g.beginPath(); g.moveTo(64 + ox, 64 + oy);
      g.lineTo(64 + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 4, 64 + Math.sin(a) * l * 0.5 + (rnd() - 0.5) * 4); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke();
    }
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// A log along +z of unit radius and length 1 (scale it): bark on the side, end grain of tone 0..2 on both ends, a
// slightly irregular outline. shape 0 round, 1 half-round (flat face), 2 quarter.
const logCache = new Map();
function logGeometry(tone = 1, shape = 0, seed = 1) {
  const key = `${tone}|${shape}|${seed}`;
  if (logCache.has(key)) return logCache.get(key);
  const span = shape === 0 ? TAU : shape === 1 ? Math.PI : Math.PI / 2;
  const seg = shape === 0 ? 16 : 10;
  const wob = (a) => 1 + 0.06 * Math.sin(a * 3 + seed) + 0.035 * Math.sin(a * 5 + seed * 2.3) + 0.02 * Math.sin(a * 9 + seed * 0.7);
  const cx = 0.375 + 0.25 * tone;     // centre of the end-grain cell in the atlas
  const pos = [], uv = [];
  const tri = (a, b, c) => { for (const q of [a, b, c]) { pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); } };
  const rim = (a, z) => { const w = wob(a); return [Math.cos(a) * w, Math.sin(a) * w, z]; };
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * span, a1 = (i + 1) / seg * span;
    const u0 = 0.01 + 0.23 * (i / seg), u1 = 0.01 + 0.23 * ((i + 1) / seg);
    const p00 = [...rim(a0, 0.5), u0, 1], p10 = [...rim(a1, 0.5), u1, 1], p01 = [...rim(a0, -0.5), u0, 0], p11 = [...rim(a1, -0.5), u1, 0];
    tri(p00, p01, p10); tri(p10, p01, p11);
    for (const z of [0.5, -0.5]) {
      const c = [0, 0, z, cx, 0.5], e0 = [...rim(a0, z), cx + 0.125 * Math.cos(a0), 0.5 + 0.5 * Math.sin(a0)], e1 = [...rim(a1, z), cx + 0.125 * Math.cos(a1), 0.5 + 0.5 * Math.sin(a1)];
      if (z > 0) tri(c, e0, e1); else tri(c, e1, e0);
    }
  }
  // Flat split faces (plain pale wood from the margin of the end cell).
  const flat = (a) => {
    const r0 = rim(a, 0.5), r1 = rim(a, -0.5), c0 = [0, 0, 0.5], c1 = [0, 0, -0.5];
    const f = (v, u, w) => [...v, cx - 0.115 + u, 0.02 + w];
    tri(f(c0, 0, 0), f(c1, 0.02, 0), f(r0, 0, 0.05)); tri(f(r0, 0, 0.05), f(c1, 0.02, 0), f(r1, 0.02, 0.05));
  };
  if (shape === 1) { flat(0); flat(Math.PI); }
  if (shape === 2) { flat(0); flat(Math.PI / 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  logCache.set(key, g);
  return g;
}

function buildPile(ctx, atlas) {
  const P = MD.pile, wood = ctx.kit.weathered;
  const barks = [0xffffff, 0xe6d8c6, 0xcfc0ae, 0xf2e8d8, 0xb8a894];
  for (const l of pileLogs()) {
    const tint = barks[l.seed % barks.length];
    const g = logGeometry(l.tone, l.shape, 1 + (l.seed % 5));
    ctx.batch.add(g, atlas, ctx.T(l.x, l.y, l.z, l.yaw, l.tilt, l.roll, l.r, l.r, l.L), tint, { cast: true, receive: true });
  }
  // A pallet-board base and four stakes at the ends.
  const bx = (w, h, d) => ctx.boxUV(w, h, d, 2.5);
  ctx.batch.add(bx(P.x1 - P.x0 + 0.02, 0.026, 0.3), wood, ctx.T((P.x0 + P.x1) / 2, FY + 0.013, (P.z0 + P.z1) / 2), 0x6f6252);
  for (const x of [P.x0 - 0.012, P.x1 + 0.012]) for (const z of [P.z0 + 0.04, P.z1 - 0.04]) ctx.batch.add(bx(0.034, 0.4, 0.034), wood, ctx.T(x, FY + 0.2, z, rr(-0.1, 0.1), rr(-0.03, 0.03)), jitter(0x77685a, 0.1));
}

// A hedgehog: a spiny body made of spikes on an icosphere, a pale snout, dark nose and eyes, little feet.
function hedgehogParts() {
  const ico = ni(new THREE.IcosahedronGeometry(1, 2));
  const p = ico.attributes.position, out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.copy(a).add(b).add(c).normalize();
    const f = 1 + 0.2 + rnd() * 0.16;
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, n.x * f, n.y * f, n.z * f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  g.scale(0.06, 0.05, 0.085);                       // length along z
  return g;
}

function buildHouse(ctx) {
  const Hh = MD.house, wood = ctx.kit.weathered, rubber = ctx.kit.rubber, leafM = ctx.sway(ctx.kit.leaf, { baseY: FY, height: 0.5, amount: 1.0 });
  const bx = (w, h, d) => ctx.boxUV(w, h, d, 2.5);
  const put = frame(ctx, Hh.x, FY, Hh.z, Hh.yaw);
  const WD = 0x76624c, h = 0.13, base = 0.02;
  // Walls: a plinth, the box, and a gable front and back.
  put(bx(Hh.w + 0.02, 0.02, Hh.d + 0.02), wood, 0x5d5040, 0, base / 2, 0);
  put(bx(Hh.w, h, Hh.d), wood, WD, 0, base + h / 2, 0);
  const gable = new THREE.Shape(); gable.moveTo(-Hh.w / 2, 0); gable.lineTo(Hh.w / 2, 0); gable.lineTo(0, 0.07); gable.closePath();
  put(new THREE.ExtrudeGeometry(gable, { depth: Hh.d, bevelEnabled: false }).translate(0, 0, -Hh.d / 2), wood, WD, 0, base + h, 0);
  // Felt roof: pitched, with an overhang; the felt is laid in overlapping strips and ridges over the battens.
  const ang = Math.atan2(0.07, Hh.w / 2), rl = Math.hypot(Hh.w / 2, 0.07) + 0.03, rd = Hh.d + 0.07;
  const felt = (len, depth, ph) => {
    const g = new THREE.PlaneGeometry(len, depth, 26, 8).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const batten = Math.pow(Math.max(0, Math.cos((x + ph) * 2 * Math.PI / 0.046)), 6) * 0.0028;
      const sag = -0.003 * Math.sin((x / len + 0.5) * Math.PI);
      const wave = 0.0012 * Math.sin(z * 90 + x * 30 + ph * 7);
      p.setY(i, batten + sag + wave);
    }
    g.computeVertexNormals();
    return scaleUV(g, 4, 4);
  };
  const FELT = [0x2f332f, 0x363b35, 0x2b2f2c];
  for (const s of [-1, 1]) {
    const cx = s * (Hh.w / 4 + 0.006), cy = base + h + 0.052, rz = s > 0 ? -ang : ang;
    put(bx(rl, 0.01, rd), wood, 0x5a4c3a, cx, cy, 0.015, 0, 0, rz, { cast: false });
    for (let k = 0; k < 3; k++) {
      put(felt(rl - 0.004, rd / 3 + 0.01, k * 0.3 + (s > 0 ? 0.2 : 0)), rubber, FELT[(k + (s > 0 ? 1 : 0)) % 3], cx, cy + 0.007 + k * 0.0008, 0.015 + (k - 1) * rd / 3, 0, 0, rz);
    }
  }
  put(bx(0.026, 0.014, rd + 0.01), wood, 0x4f4234, 0, base + h + 0.074, 0.015, 0, 0, 0, { cast: false });
  for (const s of [-1, 1]) for (const zz of [rd / 2 + 0.014, -rd / 2 + 0.016]) put(bx(rl, 0.02, 0.01), wood, 0x76624c, s * (Hh.w / 4 + 0.006), base + h + 0.052, zz, 0, 0, s > 0 ? -ang : ang, { cast: false });
  // Weighted down with a stone; fallen leaves on the felt.
  put(ctx.blobGeometry(0.03, 1, 12, 0.3), ctx.kit.stone, 0x8a8678, 0.0, base + h + 0.086, -0.02, 0.4, 0, 0, { sx: 1.2, sy: 0.55, sz: 0.9 });
  for (let i = 0; i < 4; i++) {
    const sd = i % 2 ? 1 : -1, x = rr(0.03, 0.11);
    put(leafStrip(0.035, 0.02, 0.3, 1, 3), leafM, [0x9a6a2c, 0xb08a38, 0x7c4f26, 0x8a7a30][i % 4], sd * x, base + h + 0.07 - x * 0.45, rr(-0.1, 0.12), rnd() * TAU, 1.5708, sd * -ang * 0.0, { cast: false });
  }
  put(ctx.blobGeometry(0.05, 1, 4, 0.3), leafM, 0x5f7a2f, -0.07, base + h + 0.062, 0.02, 0, 0, 0, { sx: 1.2, sy: 0.22, sz: 1, cast: false });
  put(ctx.blobGeometry(0.04, 1, 7, 0.3), leafM, 0x6c8434, 0.075, base + h + 0.05, -0.04, 0, 0, 0, { sx: 1.3, sy: 0.2, sz: 1, cast: false });
  // The entrance tunnel at the front: two sides, a roof and a floor, and a dark doorway into the box.
  const tz = Hh.d / 2 + 0.05, tw = 0.1, th = 0.085;
  put(bx(0.012, th, 0.11), wood, 0x6a5844, -tw / 2, base + th / 2, tz);
  put(bx(0.012, th, 0.11), wood, 0x6a5844, tw / 2, base + th / 2, tz);
  put(bx(tw + 0.024, 0.012, 0.12), wood, 0x6a5844, 0, base + th + 0.006, tz);
  put(bx(tw, 0.01, 0.11), wood, 0x4e4234, 0, base + 0.005, tz);
  put(bx(tw, th, 0.004), wood, 0x120d09, 0, base + th / 2, Hh.d / 2 + 0.002, 0, 0, 0, { cast: false });
  // Leaf litter against the walls.
  for (let i = 0; i < 6; i++) put(ctx.blobGeometry(0.03, 1, i, 0.35), leafM, jitter(0x7a5a2a, 0.2), rr(-0.18, 0.18), 0.012, rr(-0.18, 0.22), rnd() * 6, 0, 0, { sx: 1.4, sy: 0.35, sz: 1.1, cast: false });
  // The hedgehog, at the mouth of the tunnel, facing out.
  const hg = frame(ctx, Hh.x, FY, Hh.z, Hh.yaw);
  const fz = tz + 0.1;
  hg(hedgehogParts(), ctx.kit.fabric, 0x6e5640, 0, 0.055, fz - 0.03, 0.05, 0, 0, { sy: 1 });
  hg(new THREE.ConeGeometry(0.026, 0.07, 8).rotateX(Math.PI / 2).translate(0, 0, 0.035).scale(1, 0.85, 1), ctx.kit.fabric, 0xc3ad8c, 0, 0.037, fz + 0.075, 0.05, 0.08, 0);
  hg(new THREE.SphereGeometry(0.0085, 8, 6), ctx.kit.rubber, 0x111010, 0.001, 0.034, fz + 0.147, 0.05);
  for (const s of [-1, 1]) {
    hg(new THREE.SphereGeometry(0.0055, 6, 5), ctx.kit.rubber, 0x0c0b0a, s * 0.018, 0.058, fz + 0.1, 0.05, 0, 0, { cast: false });
    hg(new THREE.SphereGeometry(0.01, 6, 5).scale(1, 0.8, 0.5), ctx.kit.fabric, 0x8d7258, s * 0.03, 0.074, fz + 0.062, 0.05, 0, 0, { cast: false });
    hg(new THREE.CapsuleGeometry(0.006, 0.014, 2, 5).rotateX(Math.PI / 2), ctx.kit.fabric, 0xa68a6c, s * 0.026, 0.01, fz + 0.075, 0.05);
  }
}

// ------------------------------------------------------------------ 6. rake and fork
function buildTools(ctx) {
  const wood = ctx.kit.paint, steel = ctx.kit.zinc, iron = ctx.kit.iron;
  const bx = (w, h, d) => ctx.boxUV(w, h, d, 3);
  for (const T of MD.tools) {
    const put = frame(ctx, T.x, FY, T.z, T.yaw, -0.2, 0);
    put(rod(V(0, 0.16, 0), V(0, 1.27, 0), 0.0135, 7), wood, 0xd1b88a);
    put(new THREE.CylinderGeometry(0.013, 0.021, 0.075, 8), steel, 0xaab0b2, 0, 0.2, 0);          // the socket
    if (T.kind === 'fork') {
      for (let i = -1.5; i <= 1.5; i++) {
        put(bx(0.011, 0.19, 0.0065), steel, 0xcdd2d4, i * 0.03, 0.095, 0, 0, 0.0, 0);
        put(new THREE.ConeGeometry(0.0075, 0.03, 4).rotateX(0).rotateY(Math.PI / 4).scale(1, 1, 0.55), steel, 0xcdd2d4, i * 0.03, 0.0, 0, 0, 0, Math.PI);
      }
      put(bx(0.105, 0.016, 0.0095), steel, 0xb8bdbf, 0, 0.19, 0);
      put(bx(0.012, 0.045, 0.01), steel, 0xb8bdbf, -0.035, 0.2, 0, 0, 0, 0.35); put(bx(0.012, 0.045, 0.01), steel, 0xb8bdbf, 0.035, 0.2, 0, 0, 0, -0.35);
      // D handle at the top.
      put(new THREE.TorusGeometry(0.048, 0.0105, 6, 14, Math.PI).rotateZ(-Math.PI / 2 + Math.PI / 2).translate(0, 1.27, 0), wood, 0xc3a374, 0, 0, 0, 0, 0, 0);
      put(rod(V(-0.048, 1.27, 0), V(-0.048, 1.31, 0), 0.0105, 6), wood, 0xc3a374);
      put(rod(V(0.048, 1.27, 0), V(0.048, 1.31, 0), 0.0105, 6), wood, 0xc3a374);
      put(rod(V(-0.048, 1.31, 0), V(0.048, 1.31, 0), 0.0115, 7), wood, 0xb89868);
    } else {
      // Bow rake: a bar of tines on a bow that springs to the socket.
      put(bx(0.34, 0.016, 0.012), steel, 0xb4babc, 0, 0.055, 0);
      for (let i = 0; i < 12; i++) put(bx(0.0045, 0.052, 0.0045), steel, 0xc0c5c7, -0.1625 + i * 0.0295, 0.026, 0, 0, 0, 0, { cast: false });
      for (const s of [-1, 1]) {
        put(rod(V(s * 0.168, 0.06, 0), V(s * 0.01, 0.23, 0), 0.0055, 5), steel, 0xaab0b2);
        put(rod(V(s * 0.168, 0.06, 0), V(s * 0.168, 0.08, 0), 0.0055, 5), steel, 0xaab0b2);
      }
    }
    void iron;
  }
}

// ------------------------------------------------------------------ module
export function build(ctx) {
  const perches = buildFlowers(ctx);
  const hive = buildHive(ctx);
  buildBarrow(ctx);
  const dial = buildSundial(ctx);
  const atlas = new THREE.MeshStandardMaterial({ map: logAtlas(), roughness: 0.92, side: THREE.DoubleSide });
  atlas.name = 'meadow-logs';
  buildPile(ctx, atlas);
  buildHouse(ctx);
  buildTools(ctx);

  const bees = buildBees(ctx, hive, perches);
  const fly = buildButterfly(ctx, dial, perches);

  // ---------------------------------------------------------------- loose split logs (instanced)
  const sim = ctx.sim, mod = sim && sim.extras && sim.extras.mods.meadow;
  const logs = mod && mod.logs ? mod.logs : [];
  let inst = null;
  const sc = logs.map((l) => new THREE.Vector3(l.def.r, l.def.L, l.def.r));
  if (logs.length) {
    const g = logGeometry(0, 0, 3).clone().rotateX(Math.PI / 2);     // along y, like the colliders
    inst = new THREE.InstancedMesh(g, atlas, logs.length);
    inst.castShadow = true; inst.receiveShadow = true;
    const col = new THREE.Color();
    logs.forEach((l, i) => inst.setColorAt(i, col.setHex([0xd9bd92, 0xc4a07a, 0xe0c9a2][i % 3])));
    inst.name = 'meadow:logs';
    ctx.scene.add(inst);
  }
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  const posed = logs.map(() => -1), last = logs.map(() => new THREE.Vector3(1e9, 0, 0)), lastQ = logs.map(() => new THREE.Quaternion());
  let clock = 0;
  logs.forEach((l, i) => {
    ctx.replayProxy(l.id, (o) => { posed[i] = clock; inst.setMatrixAt(i, _m.compose(o.position, o.quaternion, sc[i])); inst.instanceMatrix.needsUpdate = true; });
    l.track.sample(1, _p, _q);
    inst.setMatrixAt(i, _m.compose(_p, _q, sc[i]));
  });
  if (inst) inst.instanceMatrix.needsUpdate = true;

  // A dry wooden knock.
  registerExtraSound('woodKnock', (audio, e, now) => {
    if (now - (audio._woodKnockT || 0) < 0.05) return;
    audio._woodKnockT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos);
    const f = 300 + Math.random() * 120;
    audio.tone({ freq: f, to: f * 0.8, type: 'triangle', gain: 0.04 + 0.1 * s, attack: 0.001, decay: 0.05, out: o });
    audio.noiseBurst({ freq: 1800, q: 1.2, gain: 0.03 + 0.06 * s, decay: 0.035, out: o });
  });

  return {
    update(dt, sim2) {
      clock += dt;
      bees.update(dt, sim2);
      fly.update(dt, sim2);
      if (!inst) return;
      let dirty = false;
      for (let i = 0; i < logs.length; i++) {
        if (clock - posed[i] < 0.25) continue;
        logs[i].track.sample(1, _p, _q);
        if (_p.distanceToSquared(last[i]) < 1e-12 && Math.abs(_q.dot(lastQ[i])) > 0.9999999) continue;
        last[i].copy(_p); lastQ[i].copy(_q);
        inst.setMatrixAt(i, _m.compose(_p, _q, sc[i]));
        dirty = true;
      }
      if (dirty) { inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere(); }
    },
  };
}
void TREE;
