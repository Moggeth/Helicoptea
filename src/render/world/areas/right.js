import * as THREE from 'three';
import { FY, FRONT_DOORS } from '../../../sim/world/plan.js';
import { buildHouse, buildTree, buildFence, windowAt, doorOnFace, leafCards, taperTube, mulberry } from '../kit.js';
import { roofSlabs, gables } from '../../../sim/world/shapes.js';
import * as S from '../../../sim/world/right.js';

// Draws the 'right' area: our right side passage, p+1's family garden, p+2's formal garden and the strip
// (colliders and every number in src/sim/world/right.js; what is drawn here is what is hit there).
// lod 0 structure (walls, roofs, hedges, the oak), lod 1 detail (furniture, fences, play things), lod 2 fine
// (clutter, leaf cards). Static meshes go through ctx.add; the fountain spray and the leaf cards are live.

const g = FY;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s1 = new THREE.Vector3(1, 1, 1);
const PI = Math.PI;

// ----------------------------------------------------------------------------------------------- helpers
// Everything is placed by x, z and height above the ground (h), like the collider helpers in the sim file.
function mkHelpers(ctx) {
  const { kit: k, wk, T, boxUV } = ctx;
  const add = ctx.add;
  const H = { k, wk, T, add, ctx };
  // Axis-aligned box from extents (same arguments as the sim file's AB).
  H.box = (mat, col, x0, x1, h0, h1, z0, z1, lod = 1, uv = 1, ry = 0) =>
    add(boxUV(x1 - x0, h1 - h0, z1 - z0, uv), mat, T((x0 + x1) / 2, g + (h0 + h1) / 2, (z0 + z1) / 2, ry), col, lod);
  // Box by centre and size, turned about y.
  H.boxC = (mat, col, cx, h, cz, w, hh, d, ry = 0, lod = 1, uv = 1, rx = 0, rz = 0) =>
    add(boxUV(w, hh, d, uv), mat, T(cx, g + h, cz, ry, rx, rz), col, lod);
  H.cyl = (mat, col, x, z, h0, h1, rb, rt = rb, seg = 10, lod = 1, open = false) =>
    add(new THREE.CylinderGeometry(rt, rb, h1 - h0, seg, 1, open), mat, T(x, g + (h0 + h1) / 2, z), col, lod);
  H.ball = (mat, col, x, h, z, r, sx = 1, sy = 1, sz = 1, seg = 10, lod = 1, ry = 0) =>
    add(new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7))), mat, T(x, g + h, z, ry, 0, 0, sx, sy, sz), col, lod);
  // A round rod between two points [x, h, z].
  H.rod = (mat, col, a, b, r, seg = 6, lod = 1, r2 = r) => {
    _a.set(a[0], g + a[1], a[2]); _b.set(b[0], g + b[1], b[2]);
    _c.subVectors(_b, _a);
    const len = _c.length();
    if (len < 1e-5) return;
    const geo = new THREE.CylinderGeometry(r2, r, len, seg, 1);
    _q.setFromUnitVectors(UP, _c.normalize());
    add(geo, mat, _m4.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, _s1).clone(), col, lod);
  };
  // A rectangular beam between two points; w across (along the 'side' hint), d the other way.
  H.beam = (mat, col, a, b, w, d, side = [1, 0, 0], lod = 1, uv = 1) => {
    _a.set(a[0], g + a[1], a[2]); _b.set(b[0], g + b[1], b[2]);
    const dir = _c.subVectors(_b, _a), len = dir.length();
    if (len < 1e-5) return;
    dir.normalize();
    const xs = new THREE.Vector3(...side).addScaledVector(dir, -new THREE.Vector3(...side).dot(dir));
    if (xs.lengthSq() < 1e-6) xs.set(0, 0, 1).addScaledVector(dir, -dir.z);
    xs.normalize();
    const zs = new THREE.Vector3().crossVectors(xs, dir);
    const m = new THREE.Matrix4().makeBasis(xs, dir.clone(), zs).setPosition(_a.clone().add(_b).multiplyScalar(0.5));
    add(boxUV(w, len, d, uv), mat, m, col, lod);
  };
  // Lumpy foliage blob at (x, h, z), radius r, optionally squashed.
  H.blob = (col, x, h, z, r, sx = 1, sy = 0.85, sz = 1, seed = 1, lod = 0, amp = 0.2, ry = 0) =>
    add(ctx.blobGeometry(r, lod >= 2 ? 1 : 2, seed, amp), wk.leafy, T(x, g + h, z, ry, 0, 0, sx, sy, sz), col, lod);
  return H;
}

// Planar UVs in metres for generated shapes (hedges, topiary) so the foliage texture keeps its scale.
function foliageUV(geo, k = 1.3) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.6) * k; uv[i * 2 + 1] = (p.getY(i) + p.getX(i) * 0.3 - p.getZ(i) * 0.2) * k; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// A clipped-hedge block: a rounded box with a little noise, centred on the origin.
function clippedBlock(w, h, d, r = 0.1, seed = 1, amp = 0.03) {
  const sw = Math.max(1, Math.round(w / 0.28)), sh = Math.max(1, Math.round(h / 0.28)), sd = Math.max(1, Math.round(d / 0.28));
  const geo = new THREE.BoxGeometry(w, h, d, sw, sh, sd), p = geo.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    n.copy(v).sub(q);
    if (n.lengthSq() > 1e-10) n.normalize(); else n.set(0, 1, 0);
    const noise = Math.sin(v.x * 7.3 + seed) * Math.sin(v.y * 6.1 + seed * 2) * Math.sin(v.z * 8.9 + seed * 3);
    v.copy(q).addScaledVector(n, r + noise * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return foliageUV(geo);
}

// A lathe from a profile of [radius, height] pairs.
function lathe(profile, seg = 16, uvk = 1) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * PI * Math.max(0.1, Math.hypot(p.getX(i), p.getZ(i))) * uvk, p.getY(i) * uvk);
  return geo;
}

const rgb = (h) => new THREE.Color(h);
const mix = (a, b, t) => rgb(a).lerp(rgb(b), t).getHex();
const jit = (rnd, hex, a = 0.9, b = 1.08) => rgb(hex).multiplyScalar(a + (b - a) * rnd()).getHex();

// Wire mesh texture (an alpha-tested grid) for the chicken run.
let wireMat = null;
function wireMaterial() {
  if (wireMat) return wireMat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = '#c9ced0'; x.lineWidth = 3.2;
  x.beginPath();
  for (let i = 0; i <= 64; i += 32) { x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); }
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  wireMat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
  wireMat.name = 'world-wire';
  return wireMat;
}
const wirePlane = (w, h, cell = 0.05) => {
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / cell / 2, uv.getY(i) * h / cell / 2);
  return geo;
};


// ----------------------------------------------------------------------------------------------- houses
const Y = (h) => g + h;

function houses(H) {
  const { ctx, k, wk, add } = H;
  // ---- number 1: a 1930s pebbledash semi with a two-storey bay and clay tiles
  {
    const trim = 0xf4f0e6;
    buildHouse(ctx, { ...S.H1, wall: 'render', wallColor: 0xdad1bb, roofColor: 0xe6c6b2, trimColor: trim,
      windows: [
        { face: 'front', u: 4.2, y: Y(0.95), w: 1.2, h: 1.2, style: 'casement', bars: 3 },
        { face: 'front', u: 4.2, y: Y(3.5), w: 1.2, h: 1.2, style: 'casement', bars: 3 },
        { face: 'front', u: 2.3, y: Y(3.6), w: 0.7, h: 0.9, style: 'casement', bars: 2 },
        { face: 'back', u: 2.8, y: Y(0.95), w: 1.2, h: 1.0, style: 'casement', bars: 3 },
        { face: 'back', u: 4.5, y: Y(1.1), w: 0.8, h: 0.9, style: 'casement', bars: 2 },
        { face: 'back', u: 1.2, y: Y(3.5), w: 0.9, h: 1.2, style: 'casement', bars: 2 },
        { face: 'back', u: 3.0, y: Y(3.5), w: 1.2, h: 1.2, style: 'casement', bars: 3 },
        { face: 'back', u: 4.6, y: Y(3.8), w: 0.6, h: 0.9, style: 'casement', bars: 2, curtains: false },
        { face: 'left', u: 2.2, y: Y(1.0), w: 0.7, h: 1.0, style: 'casement', bars: 2 },
        { face: 'left', u: 2.2, y: Y(3.5), w: 0.7, h: 1.2, style: 'casement', bars: 2 },
        { face: 'right', u: 3.0, y: Y(3.8), w: 0.6, h: 0.9, style: 'casement', bars: 2, curtains: false },
      ],
      doors: [
        { face: 'front', u: 7.0 - S.H1.x0, w: 0.9, h: 2.05, color: 0x2c5a45, glazed: true },
        { face: 'back', u: 1.2, w: 0.9, h: 2.05, color: 0x8b3a2e, glazed: true },
        { face: 'right', u: 4.3, w: 0.8, h: 2.0, color: 0x5b3a2a },
      ] });
    // The two-storey bay: pebbledash walls, three windows a storey, a half-hipped tiled roof.
    const B = S.BAY1, wallC = 0xdad1bb;
    H.box(k.paint, wallC, B.x0, B.x1, 0, B.top - g, B.z0 - 0.02, B.z1, 0, 1);
    H.box(wk.brick, 0x9a8a80, B.x0 - 0.015, B.x1 + 0.015, 0, 0.18, B.z0, B.z1 + 0.015, 1, 1);
    H.box(k.paint, trim, B.x0 - 0.04, B.x1 + 0.04, 2.55, 2.7, B.z0, B.z1 + 0.05, 1);              // string course between the storeys
    const cx = (B.x0 + B.x1) / 2;
    for (const [yy, hh] of [[0.95, 1.2], [3.5, 1.2]]) {
      windowAt(ctx, { x: cx, y: Y(yy), z: B.z1 + 0.004, ry: 0, w: 0.9, h: hh, style: 'casement', bars: 3, trim });
      windowAt(ctx, { x: B.x0 - 0.004, y: Y(yy), z: (B.z0 + B.z1) / 2 + 0.03, ry: -PI / 2, w: 0.3, h: hh, style: 'casement', bars: 1, trim, curtains: false });
      windowAt(ctx, { x: B.x1 + 0.004, y: Y(yy), z: (B.z0 + B.z1) / 2 + 0.03, ry: PI / 2, w: 0.3, h: hh, style: 'casement', bars: 1, trim, curtains: false });
    }
    // roof
    const o = 0.12, x0 = B.x0 - o, x1 = B.x1 + o, z1 = B.z1 + o, y0 = B.top, y1 = B.ridge;
    const tri = (p) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
      geo.computeVertexNormals();
      const uv = [];
      for (const q of p) uv.push(q[0] + q[2] * 0.4, q[1] * 1.2 + q[2] * 0.8);
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return geo;
    };
    const rc = 0xe6c6b2;
    const r0 = [x0, y0, z1], r1 = [x1, y0, z1], r2 = [x1 - 0.5, y1, B.z0], r3 = [x0 + 0.5, y1, B.z0];
    const rl = [x0, y0, B.z0], rr = [x1, y0, B.z0];
    // both windings of each facet, so it shows from any side
    for (const f of [[r0, r1, r2], [r0, r2, r3], [r0, r3, rl], [r1, rr, r2]]) { add(tri(f), wk.roof, null, rc, 0); add(tri([f[0], f[2], f[1]]), wk.roof, null, rc, 0); }
    H.box(k.paint, trim, x0, x1, y0 - g - 0.13, y0 - g, z1 - 0.025, z1, 1);
    // porch hood over the front door, on two brackets
    const P = S.HOOD1;
    H.box(k.paint, trim, P.x0, P.x1, P.y - g, P.y - g + 0.1, P.z0, P.z1, 1);
    H.box(k.paint, trim, P.x0, P.x1, P.y - g - 0.12, P.y - g, P.z1 - 0.04, P.z1, 1);
    for (const x of [P.x0 + 0.08, P.x1 - 0.08]) H.beam(k.paint, trim, [x, P.y - g - 0.4, P.z0], [x, P.y - g, P.z1 - 0.05], 0.05, 0.05, [1, 0, 0], 1);
    H.box(k.stone, 0xb8b0a0, P.x0 + 0.1, P.x1 - 0.1, 0, 0.1, P.z0, P.z1, 1);                         // doorstep
    // downpipes, the aerial on the chimney, a dish on the side wall
    const s = S.H1;
    for (const [x, z] of [[s.x0 + 0.05, s.z0 - 0.05], [s.x1 - 0.05, s.z0 - 0.05], [s.x1 - 0.05, s.z1 + 0.05]]) H.cyl(k.paint, 0x25282b, x, z, 0, s.eave - g - 0.12, 0.035, 0.035, 8, 1);
    const ch = s.chimneys[0], top = ch.top - g + 0.3, mz = (s.z0 + s.z1) / 2;
    H.rod(k.zinc, 0x9aa0a2, [ch.u, top - 0.3, mz], [ch.u, top + 1.3, mz], 0.012, 5, 2);
    for (const hh of [0.5, 0.9, 1.25]) H.box(k.zinc, 0x9aa0a2, ch.u - 0.35 + hh * 0.1, ch.u + 0.35 - hh * 0.1, top + hh, top + hh + 0.012, mz - 0.006, mz + 0.006, 2);
    H.cyl(k.paint, 0xe8e6e0, s.x1 + 0.12, 6.2, 3.7, 3.72, 0.16, 0.16, 12, 2);
    H.rod(k.zinc, 0x777777, [s.x1 + 0.01, 3.7, 6.2], [s.x1 + 0.12, 3.71, 6.2], 0.012, 5, 2);
    H.box(k.stone, 0xb8b0a0, 8.5, 9.5, 0, 0.12, 2.5 - 0.35, 2.5, 1);                                 // back doorstep
  }

  // ---- number 2: a Victorian villa, brick, a slate roof, tall sashes, a stone bay and steps
  {
    const trim = 0xece6d8, s = S.H2, brickC = 0xe7d2be;
    buildHouse(ctx, { ...s, wall: 'brick', wallColor: brickC, roofColor: 0x7c838c, trimColor: trim,
      windows: [
        { face: 'front', u: 4.4, y: Y(0.55), w: 0.95, h: 2.0, style: 'sash', bars: 2 },
        { face: 'front', u: 1.2, y: Y(3.5), w: 0.95, h: 1.9, style: 'sash', bars: 2 },
        { face: 'front', u: 2.4, y: Y(3.5), w: 0.95, h: 1.9, style: 'sash', bars: 2 },
        { face: 'front', u: 4.4, y: Y(3.5), w: 0.95, h: 1.9, style: 'sash', bars: 2 },
        { face: 'front', u: 2.8, y: Y(6.0), w: 0.6, h: 0.8, style: 'casement', bars: 2, curtains: false },
        { face: 'back', u: 1.0, y: Y(0.55), w: 0.95, h: 2.0, style: 'sash', bars: 2 },
        { face: 'back', u: 4.4, y: Y(0.55), w: 0.95, h: 2.0, style: 'sash', bars: 2 },
        { face: 'back', u: 5.3, y: Y(1.0), w: 0.6, h: 1.4, style: 'sash', bars: 2 },
        { face: 'back', u: 1.0, y: Y(3.5), w: 0.95, h: 1.9, style: 'sash', bars: 2 },
        { face: 'back', u: 2.7, y: Y(3.5), w: 0.95, h: 1.9, style: 'sash', bars: 2 },
        { face: 'back', u: 4.4, y: Y(3.5), w: 0.95, h: 1.9, style: 'sash', bars: 2 },
        { face: 'back', u: 2.8, y: Y(6.0), w: 0.6, h: 0.8, style: 'casement', bars: 2, curtains: false },
        { face: 'left', u: 2.0, y: Y(0.55), w: 0.8, h: 2.0, style: 'sash', bars: 2 },
        { face: 'left', u: 4.2, y: Y(0.55), w: 0.8, h: 2.0, style: 'sash', bars: 2 },
        { face: 'left', u: 2.0, y: Y(3.5), w: 0.8, h: 1.9, style: 'sash', bars: 2 },
        { face: 'left', u: 4.2, y: Y(3.5), w: 0.8, h: 1.9, style: 'sash', bars: 2 },
        { face: 'right', u: 2.0, y: Y(0.55), w: 0.8, h: 2.0, style: 'sash', bars: 2 },
        { face: 'right', u: 4.2, y: Y(3.5), w: 0.8, h: 1.9, style: 'sash', bars: 2 },
      ],
      doors: [
        { face: 'front', u: 14.2 - s.x0, w: 1.0, h: 2.4, color: 0x5a2733, glazed: true },
        { face: 'back', u: 2.7, w: 1.0, h: 2.3, color: 0x2b4a3a, glazed: true },
      ] });
    // Stone bay, ground floor, with a lead roof and cornice.
    const B = S.BAY2, cx = (B.x0 + B.x1) / 2;
    H.box(k.stone, 0xd8cfba, B.x0, B.x1, 0, B.top, B.z0 - 0.02, B.z1, 0, 1.2);
    H.box(k.stone, 0xcfc6b0, B.x0 - 0.06, B.x1 + 0.06, B.top, B.top + 0.14, B.z0 - 0.02, B.z1 + 0.08, 1);
    H.box(k.zinc, 0x6c7176, B.x0 - 0.04, B.x1 + 0.04, B.top + 0.14, B.top + 0.2, B.z0 - 0.02, B.z1 + 0.05, 1);
    H.box(k.stone, 0xcfc6b0, B.x0 - 0.04, B.x1 + 0.04, 0, 0.35, B.z0 - 0.02, B.z1 + 0.04, 1);
    windowAt(ctx, { x: cx, y: Y(0.6), z: B.z1 + 0.004, ry: 0, w: 0.85, h: 1.9, style: 'sash', bars: 2, trim });
    windowAt(ctx, { x: B.x0 - 0.004, y: Y(0.6), z: (B.z0 + B.z1) / 2, ry: -PI / 2, w: 0.3, h: 1.9, style: 'sash', bars: 1, trim, curtains: false });
    windowAt(ctx, { x: B.x1 + 0.004, y: Y(0.6), z: (B.z0 + B.z1) / 2, ry: PI / 2, w: 0.3, h: 1.9, style: 'sash', bars: 1, trim, curtains: false });
    // Front steps (three treads) up to the door; a stone surround with a pediment.
    H.box(k.stone, 0xc4bcaa, 13.5, 14.9, 0, 0.15, 8.55, 9.15, 1);
    H.box(k.stone, 0xcdc5b3, 13.5, 14.9, 0.15, 0.3, 8.55, 8.97, 1);
    H.box(k.stone, 0xd6cebc, 13.5, 14.9, 0.3, 0.45, 8.55, 8.79, 1);
    for (const sx of [-0.62, 0.62]) H.box(k.stone, 0xd0c8b4, 14.2 + sx - 0.07, 14.2 + sx + 0.07, 0.45, 2.55, 8.55, 8.68, 1);
    H.box(k.stone, 0xd0c8b4, 14.2 - 0.76, 14.2 + 0.76, 2.55, 2.75, 8.55, 8.72, 1);
    H.box(k.stone, 0xd6cebc, 14.2 - 0.82, 14.2 + 0.82, 2.75, 2.82, 8.55, 8.78, 1);
    // Cast-iron downpipes, finials on the gables.
    for (const [x, z] of [[s.x0 + 0.06, s.z1 + 0.06], [s.x1 - 0.06, s.z1 + 0.06], [s.x0 + 0.06, s.z0 - 0.06], [s.x1 - 0.06, s.z0 - 0.06]]) H.cyl(k.iron, 0x23262a, x, z, 0, s.eave - g - 0.1, 0.04, 0.04, 8, 1);
    for (const zz of [s.z1 + 0.3, s.z0 - 0.3]) {
      H.ball(k.stone, 0xcfc6b0, 14.6, s.ridgeY - g + 0.08, zz, 0.07, 1, 1.4, 1, 8, 1);
      H.rod(k.stone, 0xcfc6b0, [14.6, s.ridgeY - g - 0.1, zz], [14.6, s.ridgeY - g + 0.1, zz], 0.025, 6, 1);
    }
    // Window boxes on the back sills.
    for (const u of [1.0, 4.4]) {
      const x = s.x1 - u;
      H.box(k.wood, 0x56402e, x - 0.45, x + 0.45, 0.35, 0.55, s.z0 - 0.2, s.z0 - 0.02, 2);
      for (let i = 0; i < 5; i++) H.blob(0xa8c090, x - 0.36 + i * 0.18, 0.62, s.z0 - 0.11, 0.1, 1, 0.8, 1, i + u * 7, 2, 0.2);
    }
  }
}


// ----------------------------------------------------------------------------------------------- gates, fences, our passage
// A ledged-and-braced timber gate (axis-aligned or turned): boards, three ledges, a diagonal brace, strap
// hinges and a latch. cx, cz is the middle of the leaf; ry turns it (0: the leaf runs along x, facing +z);
// face is the side the ledges are on (+1 towards local +z).
function ledgedGate(H, { cx, cz, ry = 0, w, h0, h1, face = 1, col = 0x8a7a64, hinge = -1, lod = 1, braceCol }) {
  const { k } = H, rnd = mulberry(Math.round(cx * 31 + cz * 17));
  const at = (lx, lz) => [cx + Math.cos(ry) * lx + Math.sin(ry) * lz, cz - Math.sin(ry) * lx + Math.cos(ry) * lz];
  const hh = h1 - h0, n = Math.max(3, Math.round(w / 0.1)), bw = w / n;
  for (let i = 0; i < n; i++) {
    const [x, z] = at(-w / 2 + bw * (i + 0.5), 0);
    H.boxC(k.weathered, jit(rnd, col, 0.88, 1.06), x, h0 + hh / 2 + (rnd() - 0.5) * 0.01, z, bw - 0.004, hh - 0.01 * rnd(), 0.02, ry, lod);
  }
  for (const fy of [0.12, 0.5, 0.88]) {
    const [x, z] = at(0, face * 0.022);
    H.boxC(k.weathered, jit(rnd, col, 0.8, 0.95), x, h0 + hh * fy, z, w - 0.03, 0.12, 0.03, ry, lod);
  }
  { // brace from the low hinge corner up to the latch side
    const a = at(hinge * (w / 2 - 0.08), face * 0.04), b = at(-hinge * (w / 2 - 0.08), face * 0.04);
    H.beam(k.weathered, braceCol ?? jit(rnd, col, 0.8, 0.9), [a[0], h0 + hh * 0.12, a[1]], [b[0], h0 + hh * 0.88, b[1]], 0.11, 0.03, [Math.sin(ry), 0, Math.cos(ry)], lod);
  }
  for (const fy of [0.12, 0.88]) {   // strap hinges and the latch
    const [x, z] = at(hinge * (w / 2 - 0.18), face * 0.045);
    H.boxC(k.iron, 0x1c1d1e, x, h0 + hh * fy, z, 0.34, 0.045, 0.012, ry, lod + 1 > 2 ? 2 : lod + 1);
  }
  { const [x, z] = at(-hinge * (w / 2 - 0.08), face * 0.045); H.boxC(k.iron, 0x1c1d1e, x, h0 + hh * 0.5, z, 0.14, 0.04, 0.02, ry, 2); }
}

// A square gate/fence post with a cap.
function post(H, x, z, hgt, col, w = 0.12, cap = true) {
  const { k } = H;
  H.box(k.weathered, col, x - w / 2, x + w / 2, 0, hgt, z - w / 2, z + w / 2, 1);
  if (cap) H.box(k.weathered, mix(col, 0x000000, 0.2), x - w / 2 - 0.02, x + w / 2 + 0.02, hgt, hgt + 0.04, z - w / 2 - 0.02, z + w / 2 + 0.02, 1);
}

function boundaries(H) {
  const { ctx, k, wk, T } = H;
  const { boxUV } = ctx;
  const rnd = mulberry(99);
  // Our right side passage's board fence (1.8 m, close-boarded) and p+1's back fence.
  buildFence(ctx, { a: [3.8, -1.62], b: [3.8, 8.55], h: 1.8, style: 'board', color: 0x9a8c7a });
  buildFence(ctx, { a: [3.8, -6.4], b: [11.0, -6.4], h: 1.8, style: 'board', color: 0x927f69 });
  // The picket fence between the two gardens, with a gap kids have worn through.
  const gz = S.FENCE_GAP;
  buildFence(ctx, { a: [11.0, -6.4], b: [11.0, 8.55], h: 1.3, style: 'picket', color: 0xd3ccba, gaps: [[gz.z0 + 6.4, gz.z1 + 6.4]] });
  for (const z of [gz.z0 - 0.02, gz.z1 + 0.02]) post(H, 11.0, z, 1.4, 0xcbc4b0, 0.09, false);     // posts at both ends of the gap
  H.rod(k.weathered, 0xd3ccba, [10.78, 0.02, gz.z0 - 0.12], [10.98, 1.0, gz.z0 - 0.05], 0.03, 5, 2);   // a picket leaning in the gap
  H.boxC(k.weathered, 0xcdc6b2, 11.2, 0.012, gz.z1 + 0.35, 0.07, 0.02, 0.9, 0.5, 2);                    // and one lying in the grass
  // Back gates onto the lane: p+1's is a closed ledged-and-braced timber gate between two big posts.
  ledgedGate(H, { cx: 7.15, cz: -6.37, w: 0.9, h0: 0.0, h1: 1.8, face: 1, col: 0x7d6e58, hinge: -1 });
  for (const x of [6.64, 7.66]) post(H, x, -6.4, 2.0, 0x8a7a64, 0.14);
  // p+1's left passage gate and the p+2 side gates.
  ledgedGate(H, { cx: 4.25, cz: 2.55, w: 0.88, h0: 0.0, h1: 1.75, face: -1, col: 0x8a7a64, hinge: 1 });
  post(H, 4.72, 2.55, 1.9, 0x8a7a64, 0.1);
  ledgedGate(H, { cx: 11.4, cz: 2.55, w: 0.78, h0: 0.0, h1: 1.75, face: -1, col: 0x7e6f5a, hinge: 1 });
  post(H, 11.82, 2.55, 1.9, 0x7e6f5a, 0.1);
  // iron side gate on the right of the villa: bars between two stone-capped brick posts
  {
    const x0 = 17.45, x1 = 18.05, z = 2.55;
    H.box(k.iron, 0x1f2224, x0, x1, 0.1, 0.16, z - 0.015, z + 0.015, 1);
    H.box(k.iron, 0x1f2224, x0, x1, 1.74, 1.8, z - 0.015, z + 0.015, 1);
    for (let x = x0 + 0.04; x < x1; x += 0.075) H.rod(k.iron, 0x1f2224, [x, 0.1, z], [x, 1.8, z], 0.007, 5, 2);
    for (let x = x0 + 0.04; x < x1; x += 0.15) H.ball(k.iron, 0x1f2224, x, 1.84, z, 0.016, 1, 1, 1, 6, 2);
  }
  void rnd; void wk;

  // ---- the old brick wall at x = 18.2 with pillars and ivy, and the hedge behind it
  {
    const W = S.WALL2, len = 8.55 + 6.4;
    ctx.add(boxUV(W.t, W.h, len, 1), wk.brick, T(W.x, g + W.h / 2, (8.55 - 6.4) / 2), 0xd4b8a2, 0);
    ctx.add(boxUV(W.t + 0.08, 0.07, len, 1), k.stone, T(W.x, g + W.h + 0.035, (8.55 - 6.4) / 2), 0xb9b09c, 1);
    for (let z = -6.2; z < 8.6; z += 3.0) {
      ctx.add(boxUV(0.38, W.h + 0.12, 0.38, 1), wk.brick, T(W.x, g + (W.h + 0.12) / 2, z), 0xcaaa94, 0);
      ctx.add(boxUV(0.46, 0.08, 0.46, 1), k.stone, T(W.x, g + W.h + 0.16, z), 0xc2b9a5, 1);
    }
    // ivy on the strip side and a rambling rose on the garden side
    const ra = mulberry(7);
    for (let i = 0; i < 26; i++) {
      const z = -6.0 + ra() * 14.4, hh = 0.5 + ra() * 1.7, r = 0.18 + ra() * 0.28;
      H.blob(jit(ra, 0x7d9468, 0.85, 1.1), W.x + 0.13, hh, z, r, 0.3, 0.9, 1.1, i, 1, 0.3);
    }
    for (let i = 0; i < 12; i++) {
      const z = -5.0 + ra() * 12, hh = 0.4 + ra() * 1.5, r = 0.16 + ra() * 0.2;
      H.blob(jit(ra, 0x8aa070, 0.85, 1.1), W.x - 0.13, hh, z, r, 0.3, 0.9, 1.1, i + 40, 1, 0.3);
    }
  }
}


// ----------------------------------------------------------------------------------------------- our right side passage
function passage(H) {
  const { ctx, k, wk } = H;
  const rnd = mulberry(5);
  // The kitchen-corner garden gate, ajar: a latch post against the wall, the hinge post, the leaf.
  {
    const G = S.GATE_K, a = G.open, cx = G.hingeX - Math.cos(a) * G.len / 2, cz = G.z + Math.sin(a) * G.len / 2;
    post(H, 2.565, -1.62, 1.9, 0x8a7a64, 0.09);
    post(H, 3.77, -1.62, 1.95, 0x8a7a64, 0.1);
    ledgedGate(H, { cx, cz, ry: a, w: G.len, h0: 0.15, h1: 1.75, face: 1, col: 0x86755f, hinge: 1 });
    H.box(k.iron, 0x1c1d1e, 2.52, 2.66, 0.95, 1.03, -1.665, -1.62, 2);                       // the latch keep on the post
    H.cyl(k.iron, 0x1c1d1e, 3.7, -1.62, 0.1, 1.7, 0.012, 0.012, 5, 2);                         // hinge pin
  }
  // Wheelie bins against the fence: a black one and one with a blue lid; wheels, a handle, a stencilled number.
  for (const [i, b] of S.BINS.entries()) {
    const body = i === 0 ? 0x2b2f31 : 0x34383b, lid = i === 0 ? 0x2b2f31 : 0x2b5a88;
    H.box(k.rubber, body, b.x - 0.34, b.x + 0.34, 0.06, 1.0, b.z - 0.26, b.z + 0.26, 1);
    H.box(k.rubber, lid, b.x - 0.36, b.x + 0.36, 1.0, 1.07, b.z - 0.28, b.z + 0.28, 1);
    H.box(k.rubber, mix(lid, 0x000000, 0.2), b.x - 0.3, b.x + 0.3, 0.9, 1.0, b.z - 0.27, b.z + 0.27, 1);
    H.box(k.rubber, body, b.x - 0.2, b.x + 0.2, 0.02, 0.07, b.z - 0.26, b.z + 0.26, 1);
    for (const sz of [-1, 1]) H.cyl(k.rubber, 0x1c1c1c, b.x + 0.28, b.z + sz * 0.27, 0.03, 0.2, 0.09, 0.09, 8, 1);
    H.rod(k.rubber, 0x1c1c1c, [b.x + 0.34, 1.05, b.z - 0.2], [b.x + 0.4, 1.05, b.z + 0.2], 0.02, 6, 2);
    H.box(k.paint, 0xe6e6e0, b.x - 0.345, b.x - 0.335, 0.62, 0.86, b.z - 0.08 + i * 0.05, b.z + 0.1 + i * 0.05, 2);
  }
  // Down pipe on the kitchen wall with a hopper head, brackets, and a gully at the foot.
  {
    const D = S.DRAIN;
    H.cyl(k.paint, 0x24272a, D.x, D.z, 0.05, D.top - 0.1, D.r, D.r, 8, 1);
    H.box(k.paint, 0x24272a, 2.52, 2.66, D.top - 0.3, D.top, D.z - 0.08, D.z + 0.08, 1);
    H.box(k.paint, 0x24272a, 2.52, 2.62, D.top - 0.12, D.top - 0.06, D.z + 0.08, D.z + 0.5, 2);
    for (const hh of [0.4, 1.2, 2.0]) H.box(k.iron, 0x1c1d1e, D.x - 0.045, D.x + 0.045, hh, hh + 0.025, D.z - 0.03, D.z + 0.03, 2);
    H.cyl(k.stone, 0x9a9588, D.x + 0.18, D.z, 0, 0.005, 0.14, 0.14, 8, 2);
    H.box(k.iron, 0x1c1d1e, D.x + 0.07, D.x + 0.29, 0.0, 0.012, D.z - 0.11, D.z + 0.11, 2);
  }
  // A stack of terracotta pots, a lone pot of dead geraniums, a watering can, a bag of compost.
  {
    const P = S.POTS;
    for (let i = 0; i < 4; i++) H.cyl(k.terracotta, jit(rnd, 0xb8643f, 0.85, 1.05), P.x + (rnd() - 0.5) * 0.01, P.z + (rnd() - 0.5) * 0.01, i * 0.11, i * 0.11 + 0.22, 0.125, 0.17, 12, 1);
    for (let i = 0; i < 4; i++) H.cyl(k.terracotta, 0x9a5434, P.x, P.z, i * 0.11 + 0.2, i * 0.11 + 0.22, 0.17, 0.18, 12, 1);
    H.cyl(k.terracotta, 0xb0603c, 3.3, 5.0, 0, 0.3, 0.1, 0.15, 12, 1);
    H.cyl(k.soil, 0x3b2c20, 3.3, 5.0, 0.27, 0.29, 0.14, 0.14, 10, 2);
    for (let i = 0; i < 5; i++) H.rod(k.paint, 0x7a6a3a, [3.3, 0.28, 5.0], [3.3 + (rnd() - 0.5) * 0.2, 0.55 + rnd() * 0.15, 5.0 + (rnd() - 0.5) * 0.2], 0.006, 4, 2);
    H.cyl(k.zinc, 0xa0a6a8, 3.62, 6.0, 0, 0.26, 0.09, 0.09, 10, 1);
    H.rod(k.zinc, 0xa0a6a8, [3.62, 0.06, 6.0], [3.8 - 0.1, 0.34, 6.0 + 0.12], 0.012, 5, 2);
    H.rod(k.zinc, 0xa0a6a8, [3.56, 0.26, 5.94], [3.56, 0.4, 6.06], 0.009, 5, 2);
    H.box(k.paper, 0xe8e0c8, 3.3, 3.7, 0.0, 0.1, 6.6, 6.95, 2);
  }
  // The front side gate, open: the leaf folded back against the fence, on the post at the corner.
  {
    ledgedGate(H, { cx: 3.725, cz: 7.85, ry: PI / 2, w: 0.9, h0: 0.1, h1: 1.75, face: 1, col: 0x86755f, hinge: 1 });
    post(H, 3.74, 8.46, 1.95, 0x86755f, 0.12);
    H.box(k.iron, 0x1c1d1e, 3.0, 3.06, 0.9, 1.0, 8.2, 8.5, 2);
  }
  // Moss and weeds along the foot of the fence, a snail trail of leaves.
  for (let i = 0; i < 14; i++) {
    const z = -1.2 + rnd() * 9.6;
    H.blob(jit(rnd, 0x6f8a4c, 0.8, 1.1), 3.72 - rnd() * 0.04, 0.04 + rnd() * 0.04, z, 0.05 + rnd() * 0.06, 1.4, 0.5, 1.2, i, 2, 0.3);
  }
  void ctx; void wk;
}


// ----------------------------------------------------------------------------------------------- p+1: the oak, the treehouse
function signTexture(lines, w = 256, h = 96, bg = '#7a5a3a', fg = '#efe3c4') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${0.03 + (i % 5) * 0.015})`; x.fillRect(0, (i * 7) % h, w, 1.5); }
  x.fillStyle = fg; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((t, i) => x.fillText(t, w / 2 + (i ? 4 : -2), h * (0.3 + 0.4 * i) + (i ? 3 : 0)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function oakAndTreehouse(H) {
  const { ctx, k, wk, add, T } = H;
  const { boxUV } = ctx;
  const rnd = mulberry(31);
  const T1 = S.TREE1;
  buildTree(ctx, { ...T1, kind: 'oak', seed: 41 });
  // A big limb out over the lawn with a tyre swing on a rope.
  {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(T1.x - 0.2, g + 3.5, T1.z), new THREE.Vector3(T1.x - 0.75, g + 3.75, T1.z + 0.02), new THREE.Vector3(4.7, g + 3.95, T1.z)]);
    add(taperTube(curve, 0.1, 0.05, 8, 7), wk.bark, null, 0xb0a090, 1);
    H.rod(k.fabric, 0xb7a27a, [4.9, 3.9, T1.z], [4.9, 0.9, T1.z], 0.014, 6, 1);
    add(new THREE.TorusGeometry(0.22, 0.1, 8, 16).rotateX(PI / 2 + 0.08), k.rubber, T(4.9, g + 0.72, T1.z), 0x1d1d1d, 1);
    H.ball(k.rubber, 0x6b6b66, 4.9, 0.88, T1.z, 0.03, 1, 1, 1, 6, 2);
    // a few leaves, fallen from it
    for (let i = 0; i < 9; i++) H.boxC(k.leaf, jit(rnd, 0x8a8a4a, 0.7, 1.1), 5.6 + (rnd() - 0.5) * 2.4, 0.01, T1.z + (rnd() - 0.5) * 2.6, 0.07, 0.004, 0.05, rnd() * 6, 2);
  }
  // --- the treehouse
  const t = S.TH, D = t.deck, f = t.floor, wt = 0.03;
  const wood = 0xa88b66, wood2 = 0x9a7f5e, trimBlue = 0x4a7ba0;
  // deck planks and joists
  for (let z = D.z0 + 0.15; z < D.z1; z += 0.3) H.box(k.weathered, jit(rnd, 0x9b8466, 0.85, 1.05), D.x0, D.x1, f - 0.04, f, z - 0.145, z + 0.145, 1);
  H.box(k.weathered, 0x7c6a52, D.x0, D.x1, f - 0.1, f - 0.04, D.z0, D.z1, 1);
  for (const z of [D.z0 + 0.1, -3.7, -3.1, -2.5, D.z1 - 0.1]) H.box(k.weathered, 0x6d5c47, D.x0, D.x1, f - 0.26, f - 0.1, z - 0.04, z + 0.04, 1);
  for (const [x, z] of [[8.55, -2.2], [8.55, -4.2], [6.52, -2.2]]) {
    H.box(k.weathered, 0x7a6850, x - 0.045, x + 0.045, 0, f - 0.1, z - 0.045, z + 0.045, 1);
    H.cyl(k.soil, 0x70705c, x, z, 0, 0.1, 0.1, 0.12, 6, 1);
  }
  H.beam(k.weathered, 0x7a6850, [8.55, 0.45, -2.2], [8.55, 1.7, -3.2], 0.07, 0.05, [0, 0, 1], 2);
  H.beam(k.weathered, 0x7a6850, [8.55, 0.45, -4.2], [8.55, 1.7, -3.2], 0.07, 0.05, [0, 0, 1], 2);
  H.beam(k.weathered, 0x6d5c47, [T1.x + 0.36, f - 0.45, -3.1], [8.0, f - 0.12, -3.1], 0.09, 0.09, [0, 0, 1], 1);
  H.beam(k.weathered, 0x6d5c47, [T1.x + 0.34, f - 0.5, -3.7], [7.4, f - 0.12, -3.7], 0.07, 0.07, [0, 0, 1], 1);
  for (const z of [-3.1]) H.cyl(k.iron, 0x25272a, T1.x + 0.34, z, f - 0.52, f - 0.4, 0.04, 0.04, 8, 2);   // a bolt through the trunk
  // walls
  const w0 = f, w1 = f + t.wallH;
  const wall = (x0, x1, h0, h1, z0, z1, col = wood) => H.box(k.weathered, jit(rnd, col, 0.9, 1.05), x0, x1, h0, h1, z0, z1, 1);
  wall(t.x0, t.doorX[0], w0, w1, t.z1 - wt, t.z1 + wt);
  wall(t.doorX[1], t.x1, w0, w1, t.z1 - wt, t.z1 + wt);
  wall(t.doorX[0], t.doorX[1], t.doorTop, w1, t.z1 - wt, t.z1 + wt, wood2);
  wall(t.x0, t.doorX[0], w0, w1, t.z0 - wt, t.z0 + wt);
  wall(t.doorX[1], t.x1, w0, w1, t.z0 - wt, t.z0 + wt);
  wall(t.doorX[0], t.doorX[1], w0, t.winBottom, t.z0 - wt, t.z0 + wt, wood2);
  wall(t.doorX[0], t.doorX[1], t.winTop, w1, t.z0 - wt, t.z0 + wt, wood2);
  wall(t.x0 - wt, t.x0 + wt, w0, w1, t.z0, t.z1);
  wall(t.x1 - wt, t.x1 + wt, w0, w1, t.z0, t.z1);
  // plank lines on the walls
  for (const z of [t.z1 + wt + 0.002, t.z0 - wt - 0.002]) for (let x = t.x0 + 0.2; x < t.x1; x += 0.2) {
    if (x > t.doorX[0] - 0.02 && x < t.doorX[1] + 0.02) continue;
    H.box(k.weathered, 0x5e4e3a, x - 0.004, x + 0.004, w0, w1, z - 0.001, z + 0.001, 2);
  }
  // door and window trim, shutters, a doorstep
  const trimC = 0xf0ead8;
  for (const z of [t.z1, t.z0]) {
    const zz = z + (z === t.z1 ? wt + 0.012 : -wt - 0.012);
    H.box(k.paint, trimC, t.doorX[0] - 0.05, t.doorX[0], w0, t.doorTop + 0.05, zz - 0.012, zz + 0.012, 1);
    H.box(k.paint, trimC, t.doorX[1], t.doorX[1] + 0.05, w0, t.doorTop + 0.05, zz - 0.012, zz + 0.012, 1);
    H.box(k.paint, trimC, t.doorX[0] - 0.05, t.doorX[1] + 0.05, t.doorTop, t.doorTop + 0.06, zz - 0.012, zz + 0.012, 1);
  }
  H.box(k.paint, trimC, t.doorX[0], t.doorX[1], t.winBottom - 0.04, t.winBottom, t.z0 - wt - 0.05, t.z0 + wt, 1);
  for (const [x0, x1] of [[6.93, 7.13], [7.87, 8.07]]) H.box(k.paint, trimBlue, x0, x1, t.winBottom, t.winTop, t.z0 - wt - 0.025, t.z0 - wt, 1);
  H.box(k.weathered, 0xa89070, t.doorX[0] - 0.03, t.doorX[1] + 0.03, f, f + 0.04, t.z1 - 0.1, t.z1 + 0.1, 1);   // threshold
  // a sign by the door
  {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.2), new THREE.MeshStandardMaterial({ map: signTexture(['CLUB HOUSE', 'KNOCK FIRST']), roughness: 0.8 }));
    sg.position.set(6.82, g + f + 0.95, t.z1 + wt + 0.015);
    ctx.object(sg, 2);
    H.box(k.weathered, 0x4a3a2c, 6.55, 7.1, f + 0.83, f + 0.86, t.z1 + wt, t.z1 + wt + 0.012, 2);
  }
  // roof with barge boards and a ridge
  const spec = { x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, eave: g + w1, ridgeY: g + t.ridge, ridge: 'z', overhang: 0.2 };
  for (const r of roofSlabs(spec)) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(r.cx, r.cy, r.cz), r.quat, new THREE.Vector3(1, 1, 1));
    add(boxUV(r.hx * 2, 0.06, r.hz * 2, 1), wk.roof, m, 0x9c8a74, 1);
  }
  for (const tri of gables(spec)) {
    const sh = new THREE.Shape();
    sh.moveTo(tri[0][0], tri[0][1]); sh.lineTo(tri[1][0], tri[1][1]);
    sh.lineTo(tri[2][0], tri[2][1]); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
    const z = tri[0][2];
    // the extrusion runs along +z: shift so it sits inside the end wall
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 1.5, pos.getY(i) * 1.5);
    add(geo, k.weathered, T(0, 0, z === t.z0 ? z - 0.03 : z - 0.03), 0xa28664, 1);
  }
  H.beam(k.weathered, 0x6d5c47, [7.35, t.ridge + 0.02, t.z0 - 0.12], [7.35, t.ridge + 0.02, t.z1 + 0.12], 0.09, 0.06, [1, 0, 0], 1);
  // flag on the ridge
  H.rod(k.steel, 0xb0b4b6, [7.35, t.ridge, -3.4], [7.35, t.ridge + 0.85, -3.4], 0.008, 5, 2);
  for (const side of [0, 1]) add(new THREE.PlaneGeometry(0.34, 0.22), k.fabric, T(7.35 + 0.17, g + t.ridge + 0.72, -3.4 + (side ? 0.002 : -0.002), side ? 0 : PI), 0xc23b30, 2);
  // bunting from the roof corners to the tree, and a lantern on the porch beam
  {
    const a = [t.x1 + 0.1, t.ridge - 0.5, t.z1 + 0.12], b = [T1.x + 0.1, 3.7, T1.z + 0.3];
    const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * PI) * 0.22, a[2] + (b[2] - a[2]) * u]); }
    for (let i = 0; i < pts.length - 1; i++) H.rod(k.fabric, 0xb7a27a, pts[i], pts[i + 1], 0.004, 4, 2);
    const cols = [0xc23b30, 0xe8c23a, 0x3f7fa8, 0xe9e2d0, 0x5a9a52];
    for (let i = 0; i < pts.length - 1; i++) {
      const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, (pts[i][2] + pts[i + 1][2]) / 2];
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.07, 0, 0, 0.07, 0, 0, 0, -0.14, 0], 3));
      tri.computeVertexNormals();
      add(tri, k.fabric, T(m[0], g + m[1], m[2], 0.6), cols[i % 5], 2);
      add(tri.clone().rotateY(PI), k.fabric, T(m[0], g + m[1], m[2], 0.6), cols[i % 5], 2);
    }
  }
  // sill shelf with brackets, a window box of geraniums
  const SH = t.shelf;
  H.box(k.weathered, 0x8f7a5c, SH.x0, SH.x1, t.winBottom - 0.04, t.winBottom, SH.z0, SH.z1, 1);
  for (const x of [SH.x0 + 0.12, SH.x1 - 0.12]) {
    H.beam(k.weathered, 0x6d5c47, [x, t.winBottom - 0.36, t.z0 - wt], [x, t.winBottom - 0.04, SH.z0 + 0.05], 0.04, 0.04, [1, 0, 0], 1);
  }
  H.box(k.weathered, 0x5a7a50, 6.65, 7.1, t.winBottom, t.winBottom + 0.14, -4.56, -4.44, 1);
  for (let i = 0; i < 4; i++) {
    H.blob(jit(rnd, 0x7aa05a, 0.8, 1.1), 6.72 + i * 0.12, t.winBottom + 0.22, -4.5, 0.09, 1, 0.8, 1, i + 3, 2, 0.25);
    H.ball(k.petal, [0xd94f6e, 0xe86a4a, 0xc23a55, 0xf0a5b5][i], 6.72 + i * 0.12 + 0.02, t.winBottom + 0.3, -4.5, 0.035, 1, 0.8, 1, 6, 2);
  }
  // right-hand rail: posts, a top rail and a mid rail, slats
  const rx = D.x1 - 0.03;
  for (const z of [D.z0 + 0.04, D.z1 - 0.04, (D.z0 + D.z1) / 2]) H.cyl(k.weathered, 0x7a6850, rx, z, f, f + 0.9, 0.03, 0.03, 6, 1);
  H.rod(k.weathered, 0x8a7458, [rx, f + 0.9, D.z0 + 0.04], [rx, f + 0.9, D.z1 - 0.04], 0.025, 6, 1);
  H.rod(k.weathered, 0x8a7458, [rx, f + 0.45, D.z0 + 0.04], [rx, f + 0.45, D.z1 - 0.04], 0.02, 6, 1);
  // wooden ladder (front right) and rope ladder (front left)
  const L = t.ladder, zAt = (h) => L.zBot + (L.zTop - L.zBot) * (h / L.top);
  for (const x of L.x) H.beam(k.weathered, 0x8a7458, [x, 0, L.zBot], [x, L.top, L.zTop], 0.05, 0.05, [0, 0, 1], 1);
  for (let h = 0.3; h < 2.1; h += 0.32) H.rod(k.weathered, 0x9b8466, [L.x[0], h, zAt(h)], [L.x[1], h, zAt(h)], 0.016, 6, 1);
  const R = t.rope;
  for (const x of R.x) H.rod(k.fabric, 0xc9b389, [x, f - 0.02, R.z], [x, 0.3, R.z], 0.012, 6, 1);
  for (let h = 0.4; h < f - 0.1; h += 0.3) H.rod(k.weathered, 0xa88b66, [R.x[0] - 0.04, h, R.z], [R.x[1] + 0.04, h, R.z], 0.016, 6, 1);
  for (const x of R.x) H.ball(k.fabric, 0xc9b389, x, 0.3, R.z, 0.03, 1, 1.4, 1, 6, 2);
  ctx.ground.shadowRect(D.x0, D.z0, D.x1, D.z1, 3.0, 0.4);
  }


// ----------------------------------------------------------------------------------------------- p+1: swings, slide, sandpit, pool
function playThings(H) {
  const { ctx, k, wk, add, T } = H;
  const { boxUV } = ctx;
  const rnd = mulberry(77);
  // --- swing set: green tubular steel A-frames, a top bar, two belt swings on chains
  {
    const W = S.SWING, green = 0x3f6b4a;
    H.rod(k.enamel, green, [W.x0 - 0.05, W.bar, W.z], [W.x1 + 0.05, W.bar, W.z], 0.04, 8, 1);
    for (const x of [W.x0, W.x1]) {
      H.rod(k.enamel, green, [x, W.bar + 0.02, W.z], [x, 0, W.z - W.spread], 0.035, 8, 1);
      H.rod(k.enamel, green, [x, W.bar + 0.02, W.z], [x, 0, W.z + W.spread], 0.035, 8, 1);
      H.rod(k.enamel, green, [x, 0.8, W.z - W.spread * 0.6], [x, 0.8, W.z + W.spread * 0.6], 0.02, 6, 1);
      H.ball(k.enamel, green, x, W.bar + 0.02, W.z, 0.055, 1, 1, 1, 8, 1);
      for (const sz of [-1, 1]) H.box(k.steel, 0x9aa0a2, x - 0.07, x + 0.07, 0, 0.02, W.z + sz * W.spread - 0.07, W.z + sz * W.spread + 0.07, 2);
    }
    for (const sx of W.seats) {
      for (const dx of [-0.21, 0.21]) {
        H.rod(k.zinc, 0xa8aeb0, [sx + dx, W.bar - 0.05, W.z], [sx + dx, W.seatH + 0.03, W.z], 0.008, 5, 1);
        H.ball(k.zinc, 0xa8aeb0, sx + dx, W.bar - 0.04, W.z, 0.018, 1, 1.4, 1, 6, 2);
      }
      add(new THREE.BoxGeometry(0.44, 0.035, 0.2, 1, 1, 1).translate(0, 0, 0), k.rubber, T(sx, g + W.seatH + 0.0175, W.z), 0x1e1f20, 1);
      H.box(k.rubber, 0x2a2b2c, sx - 0.2, sx + 0.2, W.seatH + 0.035, W.seatH + 0.05, W.z - 0.09, W.z + 0.09, 2);
    }
    ctx.ground.shadowRect(W.x0, W.z - W.spread, W.x1, W.z + W.spread, 0.9, 0.18);
  }
  // --- slide tower and chute
  {
    const Tw = S.TOWER, cx = (Tw.x0 + Tw.x1) / 2, ch = Tw.chuteEnd, stain = 0xb58a50;
    for (const x of [Tw.x0 + 0.04, Tw.x1 - 0.04]) for (const z of [Tw.z0 + 0.04, Tw.z1 - 0.04]) H.box(k.wood, stain, x - 0.04, x + 0.04, 0, Tw.deck, z - 0.04, z + 0.04, 1);
    for (let z = Tw.z0 + 0.05; z < Tw.z1; z += 0.1) H.box(k.wood, jit(rnd, 0xbc9358, 0.9, 1.06), Tw.x0, Tw.x1, Tw.deck - 0.04, Tw.deck, z - 0.05, z + 0.05, 1);
    for (const [x, z] of [[Tw.x0 + 0.04, Tw.z0 + 0.04], [Tw.x1 - 0.04, Tw.z0 + 0.04], [Tw.x0 + 0.04, Tw.z1 - 0.04], [Tw.x1 - 0.04, Tw.z1 - 0.04]]) H.box(k.wood, stain, x - 0.045, x + 0.045, Tw.deck, Tw.deck + 0.7, z - 0.045, z + 0.045, 1);
    for (const x of [Tw.x0 + 0.03, Tw.x1 - 0.03]) {
      H.rod(k.wood, 0xa57c46, [x, Tw.deck + 0.6, Tw.z0 + 0.04], [x, Tw.deck + 0.6, Tw.z1 - 0.04], 0.022, 6, 1);
      H.rod(k.wood, 0xa57c46, [x, Tw.deck + 0.3, Tw.z0 + 0.04], [x, Tw.deck + 0.3, Tw.z1 - 0.04], 0.018, 6, 1);
    }
    H.rod(k.wood, 0xa57c46, [Tw.x0 + 0.03, Tw.deck + 0.6, Tw.z1 - 0.03], [Tw.x1 - 0.03, Tw.deck + 0.6, Tw.z1 - 0.03], 0.02, 6, 1);
    for (let x = Tw.x0 + 0.12; x < Tw.x1; x += 0.14) H.rod(k.wood, 0xa57c46, [x, Tw.deck, Tw.z1 - 0.03], [x, Tw.deck + 0.6, Tw.z1 - 0.03], 0.01, 5, 2);
    // ladder
    for (const x of [cx - 0.19, cx + 0.19]) H.beam(k.wood, stain, [x, 0, Tw.z1 + 0.58], [x, Tw.deck + 0.4, Tw.z1 - 0.02], 0.045, 0.045, [0, 0, 1], 1);
    for (let h = 0.3; h < Tw.deck; h += 0.3) { const z = Tw.z1 + 0.58 - 0.6 * (h / (Tw.deck + 0.4)); H.rod(k.wood, 0xa57c46, [cx - 0.19, h, z], [cx + 0.19, h, z], 0.015, 6, 1); }
    // chute
    const dz = ch.z - Tw.z0, dh = ch.h - Tw.deck, len = Math.hypot(dz, dh), a = Math.atan2(-dh, -dz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, g + (Tw.deck + ch.h) / 2 - 0.02, (Tw.z0 + ch.z) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0, 0)), _s1);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0, 0)));
    add(boxUV(0.46, 0.03, len, 1), k.enamel, m, 0xe6bf34, 1);
    for (const sx of [-0.235, 0.235]) {
      const m2 = new THREE.Matrix4().compose(new THREE.Vector3(cx + sx, g + (Tw.deck + ch.h) / 2 - 0.02 + up.y * 0.05, (Tw.z0 + ch.z) / 2 + up.z * 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0, 0)), _s1);
      add(boxUV(0.04, 0.1, len, 1), k.enamel, m2, 0xd9a82a, 1);
    }
    ctx.ground.shadowRect(Tw.x0, ch.z, Tw.x1, Tw.z1, 1.0, 0.2);
  }
  // --- sandpit: timber edge, sand, a bucket, a spade, the remains of a castle
  {
    const P = S.SANDPIT, e = 0.05;
    for (const [x0, x1, z0, z1] of [[P.x0, P.x1, P.z0, P.z0 + e], [P.x0, P.x1, P.z1 - e, P.z1], [P.x0, P.x0 + e, P.z0, P.z1], [P.x1 - e, P.x1, P.z0, P.z1]]) H.box(k.weathered, 0x7a6850, x0, x1, 0, 0.16, z0, z1, 1);
    H.box(k.soil, 0xd5c196, P.x0 + e, P.x1 - e, 0, 0.1, P.z0 + e, P.z1 - e, 1);
    H.cyl(k.rubber, 0xc23b30, P.x1 - 0.25, P.z0 + 0.3, 0.1, 0.26, 0.075, 0.095, 10, 1);
    H.cyl(k.rubber, 0xa42f26, P.x1 - 0.25, P.z0 + 0.3, 0.255, 0.265, 0.1, 0.1, 10, 2);
    H.rod(k.rubber, 0x3f7fa8, [P.x0 + 0.25, 0.1, P.z0 + 0.8], [P.x0 + 0.4, 0.14, P.z0 + 0.95], 0.012, 5, 2);
    H.box(k.rubber, 0x3f7fa8, P.x0 + 0.37, P.x0 + 0.47, 0.12, 0.125, P.z0 + 0.93, P.z0 + 1.03, 2);
    for (let i = 0; i < 6; i++) H.blob(jit(rnd, 0xd0bb8e, 0.9, 1.05), P.x0 + 0.3 + rnd() * 0.5, 0.11, P.z0 + 0.2 + rnd() * 0.4, 0.04 + rnd() * 0.03, 1, 0.6, 1, i, 2, 0.3);
    H.cyl(k.soil, 0xcab582, P.x0 + 0.5, P.z0 + 0.4, 0.1, 0.19, 0.12, 0.08, 8, 2);
  }
  // --- paddling pool: an inflatable ring, a thin wall, water, a duck
  {
    const Pl = S.POOL;
    H.cyl(k.rubber, 0x6aa2c9, Pl.x, Pl.z, 0, 0.03, Pl.r - 0.03, Pl.r - 0.03, 24, 1);
    add(new THREE.CylinderGeometry(Pl.r - 0.02, Pl.r - 0.02, 0.16, 24, 1, true), k.rubber, T(Pl.x, g + 0.09, Pl.z), 0x4f86b5, 1);
    add(new THREE.TorusGeometry(Pl.r - 0.06, 0.08, 8, 28).rotateX(PI / 2), k.rubber, T(Pl.x, g + 0.14, Pl.z), 0x4f86b5, 1);
    add(new THREE.CircleGeometry(Pl.r - 0.1, 24).rotateX(-PI / 2), wk.water, T(Pl.x, g + 0.115, Pl.z), 0x9fc4d8, 1);
    H.ball(k.rubber, 0xf0cf3a, Pl.x + 0.25, 0.14, Pl.z - 0.1, 0.05, 1.2, 0.8, 0.9, 8, 2);
    H.ball(k.rubber, 0xf0cf3a, Pl.x + 0.31, 0.19, Pl.z - 0.1, 0.03, 1, 1, 1, 6, 2);
    H.box(k.rubber, 0xe07a2a, Pl.x + 0.335, Pl.x + 0.36, 0.185, 0.2, Pl.z - 0.11, Pl.z - 0.09, 2);
    H.ball(k.rubber, 0xe8e4d6, 5.9, 0.11, -1.75, 0.11, 1, 1, 1, 10, 1);
    ctx.ground.shadowCircle(Pl.x, Pl.z, 0.8, 0.1, 0.12);
  }
}

// A box whose UVs are in metres, with its length along z.
function boxUV3(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, uv.getX(f * 4 + i) * dims[f][0], uv.getY(f * 4 + i) * dims[f][1]);
  return geo;
}


// ----------------------------------------------------------------------------------------------- p+1: chicken coop and run
function hen(H, x, z, yaw, col, pecking, scale = 1) {
  const { k, add, T } = H;
  const s = scale;
  const at = (lx, h, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, h, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  const body = at(0, 0.17 * s, 0);
  H.ball(k.fabric, col, body[0], body[1], body[2], 0.11 * s, 0.85, 0.95, 1.3, 9, 2, yaw);
  const tail = at(0, 0.24 * s, -0.16 * s);
  H.ball(k.fabric, mix(col, 0x000000, 0.25), tail[0], tail[1], tail[2], 0.08 * s, 0.35, 1.0, 0.8, 7, 2, yaw);
  const hd = pecking ? at(0, 0.1 * s, 0.17 * s) : at(0, 0.3 * s, 0.13 * s);
  H.ball(k.fabric, col, hd[0], hd[1], hd[2], 0.04 * s, 1, 1, 1.1, 7, 2, yaw);
  const nk = pecking ? at(0, 0.18 * s, 0.1 * s) : at(0, 0.24 * s, 0.1 * s);
  H.ball(k.fabric, col, nk[0], nk[1], nk[2], 0.05 * s, 0.9, 1.1, 0.9, 7, 2, yaw);
  const cb = pecking ? at(0, 0.145 * s, 0.17 * s) : at(0, 0.34 * s, 0.13 * s);
  H.ball(k.petal, 0xc0302a, cb[0], cb[1], cb[2], 0.016 * s, 0.6, 1.2, 1.4, 5, 2, yaw);
  const bk = pecking ? at(0, 0.075 * s, 0.215 * s) : at(0, 0.295 * s, 0.175 * s);
  H.ball(k.paint, 0xd9a43a, bk[0], bk[1], bk[2], 0.014 * s, 0.7, 0.7, 1.4, 5, 2, yaw);
  for (const sx of [-0.045, 0.045]) { const f = at(sx * s, 0, 0); H.rod(k.paint, 0xd9a43a, [f[0], 0.07 * s, f[2]], [f[0], 0.0, f[2]], 0.007, 4, 2); }
  void add; void T;
}

function coop(H) {
  const { ctx, k, wk, add, T } = H;
  const { boxUV } = ctx;
  const rnd = mulberry(12);
  const C = S.COOP, R = C.run, sage = 0x7c9a82, trim = 0xeae4d4;
  // legs, floor, body
  for (const x of [C.x0 + 0.06, C.x1 - 0.06]) for (const z of [C.z0 + 0.06, C.z1 - 0.06]) H.box(k.weathered, 0x8a7a66, x - 0.035, x + 0.035, 0, C.legs, z - 0.035, z + 0.035, 1);
  H.box(k.wood, sage, C.x0, C.x1, C.legs, C.h, C.z0, C.z1, 1);
  for (let h = C.legs + 0.1; h < C.h; h += 0.1) for (const z of [C.z1 + 0.002, C.z0 - 0.002]) H.box(k.paint, mix(sage, 0x000000, 0.25), C.x0, C.x1, h, h + 0.006, z - 0.002, z + 0.002, 2);
  for (const x of [C.x0, C.x1]) for (const z of [C.z0, C.z1]) H.box(k.paint, trim, x - 0.025, x + 0.025, C.legs, C.h, z - 0.025, z + 0.025, 1);
  // pop-hole (shut), with a pulley cord, and the ramp
  const hx = 4.62;
  H.box(k.paint, trim, hx - 0.19, hx + 0.19, C.legs + 0.12, C.legs + 0.5, C.z1, C.z1 + 0.015, 2);
  H.box(k.wood, 0x6f5a40, hx - 0.15, hx + 0.15, C.legs + 0.14, C.legs + 0.46, C.z1 + 0.012, C.z1 + 0.026, 2);
  H.rod(k.fabric, 0xb7a27a, [hx + 0.16, C.legs + 0.46, C.z1 + 0.02], [hx + 0.24, C.legs + 0.1, C.z1 + 0.03], 0.004, 4, 2);
  {
    const a = Math.atan2(C.legs - 0.04, 0.55), len = Math.hypot(0.55, C.legs);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(4.75, g + C.legs / 2 + 0.02, C.z1 + 0.275), new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)), _s1);
    add(boxUV(0.28, 0.024, len, 1), k.weathered, m, 0x8f7a5c, 1);
    for (let i = 0; i < 5; i++) {
      const u = -len / 2 + (i + 0.5) * len / 5, mm = new THREE.Matrix4().compose(new THREE.Vector3(4.75, g + C.legs / 2 + 0.02 - Math.sin(a) * u + 0.014, C.z1 + 0.275 + Math.cos(a) * u), new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)), _s1);
      add(boxUV(0.26, 0.012, 0.02, 1), k.weathered, mm, 0x6d5c47, 2);
    }
  }
  // roof (felt on boards) and gables
  const spec = { x0: C.x0, x1: C.x1, z0: C.z0, z1: C.z1, eave: g + C.h, ridgeY: g + C.ridge, ridge: 'x', overhang: 0.1 };
  for (const r of roofSlabs(spec)) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(r.cx, r.cy, r.cz), r.quat, _s1);
    add(boxUV(r.hx * 2, 0.024, r.hz * 2, 1), k.paint, m, 0x3a3d3f, 1);
  }
  for (const tri of gables(spec)) {
    const sh = new THREE.Shape();
    sh.moveTo(tri[0][2], tri[0][1]); sh.lineTo(tri[1][2], tri[1][1]); sh.lineTo(tri[2][2], tri[2][1]); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
    const uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * 2, p.getY(i) * 2);
    geo.rotateY(-PI / 2);   // shape x (z) -> world, extrude along +x
    add(geo, k.wood, T(tri[0][0] + 0.025, 0, 0), sage, 1);
  }
  H.beam(k.paint, trim, [C.x0 - 0.12, C.ridge + 0.015, (C.z0 + C.z1) / 2], [C.x1 + 0.12, C.ridge + 0.015, (C.z0 + C.z1) / 2], 0.07, 0.04, [0, 0, 1], 1);
  // nest box on the left end with a hinged lid
  H.box(k.wood, 0x7c9a82, C.x0 - 0.1, C.x0, C.h - 0.4, C.h - 0.1, C.z0 + 0.2, C.z0 + 0.6, 1);
  H.beam(k.paint, 0x3a3d3f, [C.x0 - 0.12, C.h - 0.04, C.z0 + 0.17], [C.x0 + 0.01, C.h - 0.1, C.z0 + 0.17], 0.04, 0.0, [0, 0, 1], 2);
  H.box(k.paint, 0x3a3d3f, C.x0 - 0.12, C.x0 + 0.01, C.h - 0.1, C.h - 0.07, C.z0 + 0.17, C.z0 + 0.63, 1);
  // run: posts, base board, wire, top frame
  const wm = wireMaterial();
  for (const x of [R.x0, R.x1]) for (const z of [R.z0 + 0.03, R.z1]) H.box(k.weathered, 0x8a7a66, x - 0.035, x + 0.035, 0, R.h + 0.05, z - 0.035, z + 0.035, 1);
  H.box(k.weathered, 0x7a6a56, R.x0, R.x1, 0, 0.18, R.z1 - 0.012, R.z1 + 0.012, 1);
  H.box(k.weathered, 0x7a6a56, R.x1 - 0.012, R.x1 + 0.012, 0, 0.18, R.z0, R.z1, 1);
  H.box(k.weathered, 0x8a7a66, R.x0, R.x1, R.h - 0.03, R.h + 0.02, R.z1 - 0.025, R.z1 + 0.025, 1);
  H.box(k.weathered, 0x8a7a66, R.x1 - 0.025, R.x1 + 0.025, R.h - 0.03, R.h + 0.02, R.z0, R.z1, 1);
  H.box(k.weathered, 0x8a7a66, R.x0, R.x1, R.h - 0.03, R.h + 0.02, R.z0, R.z0 + 0.04, 1);
  add(wirePlane(R.x1 - R.x0, R.h - 0.18), wm, T((R.x0 + R.x1) / 2, g + 0.18 + (R.h - 0.18) / 2, R.z1), 0xffffff, 1);
  add(wirePlane(R.z1 - R.z0, R.h - 0.18), wm, T(R.x1, g + 0.18 + (R.h - 0.18) / 2, (R.z0 + R.z1) / 2, PI / 2), 0xffffff, 1);
  add(wirePlane(R.x1 - R.x0, R.z1 - R.z0).rotateX(-PI / 2), wm, T((R.x0 + R.x1) / 2, g + R.h, (R.z0 + R.z1) / 2), 0xffffff, 1);
  add(wirePlane(R.x1 - R.x0, R.h - 0.18), wm, T((R.x0 + R.x1) / 2, g + 0.18 + (R.h - 0.18) / 2, R.z0 + 0.03), 0xffffff, 2);
  // inside: straw, a perch, a feeder, a drinker, a dust bath
  H.box(k.paper, 0xcdb46a, R.x0 + 0.05, R.x0 + 0.75, 0, 0.03, R.z1 - 0.65, R.z1 - 0.1, 2);
  for (let i = 0; i < 14; i++) H.rod(k.paper, jit(rnd, 0xcdb46a, 0.85, 1.1), [R.x0 + 0.1 + rnd() * 0.65, 0.03, R.z1 - 0.65 + rnd() * 0.5], [R.x0 + 0.1 + rnd() * 0.65, 0.05, R.z1 - 0.65 + rnd() * 0.5], 0.004, 3, 2);
  H.rod(k.weathered, 0x8f7a5c, [R.x0 + 0.1, 0.5, R.z0 + 0.25], [R.x1 - 0.1, 0.5, R.z0 + 0.25], 0.025, 6, 1);
  H.cyl(k.zinc, 0xa8aeb0, R.x1 - 0.3, R.z1 - 0.3, 0, 0.22, 0.09, 0.08, 10, 1);
  H.cyl(k.zinc, 0xa8aeb0, R.x1 - 0.3, R.z1 - 0.3, 0.22, 0.3, 0.02, 0.1, 10, 1);
  H.cyl(k.enamel, 0x3f7fa8, R.x0 + 0.45, R.z0 + 0.4, 0, 0.05, 0.1, 0.1, 10, 1);
  H.cyl(k.enamel, 0x3f7fa8, R.x0 + 0.45, R.z0 + 0.4, 0.05, 0.3, 0.06, 0.06, 10, 1);
  // hens
  hen(H, 5.6, -5.5, 0.4, 0xa8552a, false);
  hen(H, 5.95, -5.75, -2.2, 0x2a2623, true);
  hen(H, 6.2, -5.3, 1.1, 0xe3d9bf, false, 0.95);
  hen(H, 5.45, -5.2, 2.6, 0xb8803a, true, 0.9);
  ctx.ground.shadowRect(C.x0, C.z0, C.x1, C.z1, 1.0, 0.25);
  ctx.ground.shadowRect(R.x0, R.z0, R.x1, R.z1, 0.5, 0.1);
  void wk;
}

// ----------------------------------------------------------------------------------------------- p+1: the shed
function shed(H) {
  const { ctx, k, wk, add, T } = H;
  const { boxUV } = ctx;
  const rnd = mulberry(23);
  const Sh = S.SHED, t = 0.06, h = Sh.h, green = 0x54684b, trim = 0xe6e0cf, B = S.BENCH1, Hh = Sh.hole;
  const wall = (x0, x1, h0, h1, z0, z1) => H.box(k.paint, jit(rnd, green, 0.96, 1.04), x0, x1, h0, h1, z0, z1, 0, 1);
  wall(Sh.x0, Sh.x1, 0, h, Sh.z0, Sh.z0 + t);
  wall(Sh.x0, Sh.x0 + t, 0, h, Sh.z0, Sh.z1);
  wall(Sh.x1 - t, Sh.x1, 0, h, Sh.z0, Sh.z1);
  wall(Sh.x0, Sh.door[0], 0, h, Sh.z1 - t, Sh.z1);
  wall(Sh.door[1], Sh.x1, 0, h, Sh.z1 - t, Sh.z1);
  wall(Sh.door[0], Sh.door[1], Sh.doorH, h, Sh.z1 - t, Sh.z1);
  // shiplap lines and corner trims
  for (let hh = 0.14; hh < h; hh += 0.14) {
    const dk = mix(green, 0x000000, 0.35);
    H.box(k.paint, dk, Sh.x0, Sh.x1, hh, hh + 0.006, Sh.z0 - 0.002, Sh.z0, 2);
    H.box(k.paint, dk, Sh.x0 - 0.002, Sh.x0, hh, hh + 0.006, Sh.z0, Sh.z1, 2);
    H.box(k.paint, dk, Sh.x1, Sh.x1 + 0.002, hh, hh + 0.006, Sh.z0, Sh.z1, 2);
    if (hh < Sh.doorH) { H.box(k.paint, dk, Sh.x1 - 0.8, Sh.x1, hh, hh + 0.006, Sh.z1, Sh.z1 + 0.002, 2); H.box(k.paint, dk, Sh.x0, Sh.door[0], hh, hh + 0.006, Sh.z1, Sh.z1 + 0.002, 2); }
  }
  for (const [x, z] of [[Sh.x0, Sh.z0], [Sh.x1, Sh.z0], [Sh.x0, Sh.z1], [Sh.x1, Sh.z1]]) H.box(k.paint, trim, x - 0.03, x + 0.03, 0, h, z - 0.03, z + 0.03, 1);
  for (const [x0, x1] of [[Sh.door[0] - 0.05, Sh.door[0]], [Sh.door[1], Sh.door[1] + 0.05]]) H.box(k.paint, trim, x0, x1, 0, Sh.doorH + 0.05, Sh.z1 - 0.01, Sh.z1 + 0.02, 1);
  H.box(k.paint, trim, Sh.door[0] - 0.05, Sh.door[1] + 0.05, Sh.doorH, Sh.doorH + 0.05, Sh.z1 - 0.01, Sh.z1 + 0.02, 1);
  // the door, swung open and back against the front wall
  ledgedGate(H, { cx: Sh.door[0] - 0.04, cz: Sh.z1 + 0.425, ry: PI / 2, w: 0.85, h0: 0.05, h1: 1.8, face: -1, col: green, hinge: 1, braceCol: mix(green, 0xffffff, 0.1) });
  // interior lining, floor, ceiling
  const lin = 0xb09a78;
  H.box(k.weathered, lin, Sh.x0 + t, Sh.x1 - t, 0, h - 0.04, Sh.z0 + t, Sh.z0 + t + 0.01, 1);
  H.box(k.weathered, lin, Sh.x0 + t, Sh.x0 + t + 0.01, 0, h - 0.04, Sh.z0 + t, Sh.z1 - t, 1);
  H.box(k.weathered, lin, Sh.x1 - t - 0.01, Sh.x1 - t, 0, h - 0.04, Sh.z0 + t, Sh.z1 - t, 1);
  H.box(k.weathered, 0xa08c6c, Sh.x0 + t, Sh.x1 - t, 0, 0.03, Sh.z0 + t, Sh.z1 - t, 1);
  for (const [x0, x1, z0, z1] of [[Sh.x0 + t, Hh.x0, Sh.z0 + t, Sh.z1 - t], [Hh.x1, Sh.x1 - t, Sh.z0 + t, Sh.z1 - t], [Hh.x0, Hh.x1, Hh.z1, Sh.z1 - t], [Hh.x0, Hh.x1, Sh.z0 + t, Hh.z0]])
    H.box(k.weathered, 0x8a7556, x0, x1, h - 0.04, h, z0, z1, 1);
  // roof: boards and felt with an upstand round the rooflight opening
  const rt = 0.08, rcol = 0x33363a;
  for (const [x0, x1, z0, z1] of [[Sh.x0 - 0.08, Hh.x0, Sh.z0 - 0.04, Sh.z1 + 0.12], [Hh.x1, Sh.x1 + 0.08, Sh.z0 - 0.04, Sh.z1 + 0.12], [Hh.x0, Hh.x1, Hh.z1, Sh.z1 + 0.12], [Hh.x0, Hh.x1, Sh.z0 - 0.04, Hh.z0]])
    H.box(k.paint, jit(rnd, rcol, 0.9, 1.15), x0, x1, h, h + rt, z0, z1, 0);
  H.box(k.paint, trim, Sh.x0 - 0.08, Sh.x1 + 0.08, h - 0.06, h + 0.02, Sh.z1 + 0.1, Sh.z1 + 0.125, 1);          // fascia
  for (const [x0, x1, z0, z1] of [[Hh.x0 - 0.04, Hh.x0, Hh.z0 - 0.04, Hh.z1 + 0.04], [Hh.x1, Hh.x1 + 0.04, Hh.z0 - 0.04, Hh.z1 + 0.04], [Hh.x0, Hh.x1, Hh.z0 - 0.04, Hh.z0], [Hh.x0, Hh.x1, Hh.z1, Hh.z1 + 0.04]])
    H.box(k.paint, trim, x0, x1, h + rt, h + rt + 0.05, z0, z1, 1);
  // the pane that slid off, lying on the roof
  add(boxUV(0.55, 0.012, 0.55, 1), k.glass, T(9.675, g + h + rt + 0.026, -5.625, 0.15), 0xbfd8e4, 1);
  for (let i = 0; i < 5; i++) H.box(k.glass, 0xa9c8d6, 9.4 + i * 0.1375 - 0.02, 9.4 + i * 0.1375 + 0.02, h + rt + 0.032, h + rt + 0.045, -5.9, -5.35, 2);
  // workbench: top, legs, shelf, vice; pegboard of tools; shelf of tins; spade and rake; clutter
  H.box(k.wood, 0xb89a68, B.x0, B.x1, B.h - 0.04, B.h, B.z0, B.z1, 1);
  for (let x = B.x0 + 0.16; x < B.x1; x += 0.16) H.box(k.paint, 0x4a3c28, x - 0.002, x + 0.002, B.h - 0.0005, B.h + 0.001, B.z0, B.z1, 2);
  for (const x of [B.x0 + 0.05, B.x1 - 0.05]) for (const z of [B.z0 + 0.04, B.z1 - 0.04]) H.box(k.weathered, 0x7a6850, x - 0.04, x + 0.04, 0, B.h - 0.04, z - 0.04, z + 0.04, 1);
  H.box(k.weathered, 0x8f7a5c, B.x0, B.x1, 0.2, 0.23, B.z0, B.z1, 1);
  H.box(k.iron, 0x3b3f42, B.x0 + 0.05, B.x0 + 0.2, B.h, B.h + 0.14, B.z1 - 0.2, B.z1 - 0.05, 1);
  H.box(k.iron, 0x7a2f26, B.x0 + 0.05, B.x0 + 0.2, B.h + 0.14, B.h + 0.17, B.z1 - 0.2, B.z1 - 0.05, 2);
  H.rod(k.iron, 0x25272a, [B.x0 + 0.125, B.h + 0.08, B.z1 - 0.05], [B.x0 + 0.125, B.h + 0.08, B.z1 + 0.0], 0.012, 6, 2);
  H.box(k.wood, 0xc9ad7c, B.x0, B.x1, 1.1, 1.75, Sh.z0 + t, Sh.z0 + t + 0.02, 1);                                // pegboard
  for (let x = B.x0 + 0.05; x < B.x1; x += 0.08) for (let y = 1.15; y < 1.75; y += 0.08) H.box(k.paint, 0x7a6a4c, x - 0.004, x + 0.004, y - 0.004, y + 0.004, Sh.z0 + t + 0.019, Sh.z0 + t + 0.021, 2);
  const pz = Sh.z0 + t + 0.02;
  { // tools hung on the pegboard
    const steel = 0xa8aeb0, wood = 0x9a7a4c, red = 0xb23a2e;
    H.rod(k.wood, wood, [B.x0 + 0.12, 1.3, pz + 0.015], [B.x0 + 0.12, 1.55, pz + 0.015], 0.012, 5, 2);
    H.box(k.steel, steel, B.x0 + 0.06, B.x0 + 0.18, 1.55, 1.62, pz + 0.005, pz + 0.025, 2);
    H.box(k.steel, steel, B.x0 + 0.3, B.x0 + 0.62, 1.4, 1.5, pz + 0.005, pz + 0.012, 2);
    H.box(k.wood, wood, B.x0 + 0.62, B.x0 + 0.72, 1.4, 1.5, pz + 0.005, pz + 0.025, 2);
    H.box(k.steel, steel, B.x0 + 0.3, B.x0 + 0.62, 1.2, 1.28, pz + 0.005, pz + 0.012, 2);
    H.box(k.wood, wood, B.x0 + 0.62, B.x0 + 0.72, 1.2, 1.28, pz + 0.005, pz + 0.025, 2);
    for (let i = 0; i < 4; i++) H.box(k.steel, steel, B.x0 + 0.85 + i * 0.07, B.x0 + 0.87 + i * 0.07, 1.3 + i * 0.03, 1.6, pz + 0.005, pz + 0.015, 2);
    H.box(k.rubber, red, B.x0 + 1.05, B.x0 + 1.2, 1.5, 1.54, pz + 0.005, pz + 0.02, 2);
    H.box(k.steel, steel, B.x1 - 0.06, B.x1 - 0.02, 1.25, 1.5, pz + 0.005, pz + 0.012, 2);
    H.ball(k.steel, steel, B.x1 - 0.2, 1.3, pz + 0.02, 0.05, 1, 1, 0.3, 8, 2);
  }
  {
    const x = Sh.x0 + t + 0.02;
    H.box(k.weathered, 0x8f7a5c, Sh.x0 + t, Sh.x0 + t + 0.25, 1.38, 1.41, -6.0, -5.2, 1);
    for (const [z, col] of [[-5.9, 0xb23a2e], [-5.78, 0x3f7fa8], [-5.66, 0xe8c23a], [-5.5, 0x4a7a4a]]) H.cyl(k.zinc, col, x + 0.12, z, 1.41, 1.53, 0.045, 0.05, 10, 2);
    H.cyl(k.terracotta, 0xb0603c, x + 0.1, -5.3, 1.41, 1.56, 0.07, 0.1, 10, 2);
    for (const z of [-5.55, -5.3]) {
      H.rod(k.wood, 0x9a7a4c, [x, 0.05, z], [x, 1.5, z], 0.02, 6, 1);
    }
    H.box(k.steel, 0xa8aeb0, x - 0.004, x + 0.014, 1.25, 1.5, -5.55 - 0.1, -5.55 + 0.1, 2);                     // spade blade
    for (let i = 0; i < 6; i++) H.box(k.steel, 0xa8aeb0, x - 0.004, x + 0.016, 1.45, 1.5, -5.3 - 0.09 + i * 0.036, -5.3 - 0.07 + i * 0.036, 2);
    // under the bench: a stack of pots and a sack
    for (let i = 0; i < 3; i++) H.cyl(k.terracotta, jit(rnd, 0xb8643f, 0.85, 1.05), 9.85, -6.0, 0.23 + i * 0.06, 0.23 + i * 0.06 + 0.12, 0.07, 0.1, 10, 2);
    H.box(k.paper, 0xcdb88a, 10.2, 10.7, 0, 0.45, -6.2, -5.85, 1);
    H.cyl(k.zinc, 0xa8aeb0, 9.35, -5.4, 0, 0.3, 0.1, 0.1, 10, 2);
  }
  // clutter on the bench: jar of screws, a mug of pencils, a radio, a tin
  H.cyl(k.glass, 0xcfe0e0, 9.75, -6.05, B.h, B.h + 0.1, 0.035, 0.035, 10, 2);
  H.box(k.enamel, 0x35557a, 9.9, 10.1, B.h, B.h + 0.12, -6.18, -6.0, 2);
  H.rod(k.steel, 0xa8aeb0, [9.95, B.h + 0.12, -6.1], [10.05, B.h + 0.3, -6.1], 0.004, 4, 2);
  H.cyl(k.zinc, 0xb8bcc0, 10.7, -5.95, B.h, B.h + 0.07, 0.05, 0.05, 10, 2);
  H.rod(k.wood, 0x9a7a4c, [9.62, B.h + 0.015, -5.82], [9.88, B.h + 0.015, -5.9], 0.015, 5, 2);
  H.box(k.steel, 0xa8aeb0, 9.86, 9.95, B.h, B.h + 0.045, -5.93, -5.87, 2);
  // water butt with a lid and a tap, fed by a spout from the shed roof; the doorstep
  H.cyl(k.enamel, 0x2f5a3a, 8.65, -5.75, 0, 0.9, 0.24, 0.22, 14, 1);
  H.cyl(k.enamel, 0x244a2e, 8.65, -5.75, 0.9, 0.93, 0.25, 0.25, 14, 1);
  H.cyl(k.brass, 0xb08a3a, 8.84, -5.75, 0.2, 0.26, 0.015, 0.015, 6, 2);
  H.rod(k.paint, 0x24272a, [8.9, h + 0.05, -5.75], [8.7, 0.95, -5.75], 0.022, 6, 1);
  H.box(k.stone, 0xb0aa9a, Sh.door[0] - 0.1, Sh.door[1] + 0.1, 0, 0.06, Sh.z1, Sh.z1 + 0.4, 1);
  // a roof-light's frame warmth: the sun comes through, so the bench gets a patch of light
  ctx.ground.shadowRect(Sh.x0, Sh.z0, Sh.x1, Sh.z1, h, 0.4);
  void wk; void T;
}


// ----------------------------------------------------------------------------------------------- p+1: vegetable bed, patio
function vegBed(H) {
  const { ctx, k } = H;
  const rnd = mulberry(61);
  const B = S.BED1, e = 0.04;
  for (const [x0, x1, z0, z1] of [[B.x0, B.x1, B.z0, B.z0 + e], [B.x0, B.x1, B.z1 - e, B.z1], [B.x0, B.x0 + e, B.z0, B.z1], [B.x1 - e, B.x1, B.z0, B.z1]])
    H.box(k.weathered, jit(rnd, 0x8a7458, 0.85, 1.05), x0, x1, 0, 0.3, z0, z1, 1);
  for (const x of [B.x0, B.x1 - 0.06]) for (const z of [B.z0, B.z1 - 0.06]) H.box(k.weathered, 0x756248, x, x + 0.06, 0, 0.32, z, z + 0.06, 1);
  H.box(k.soil, 0x3a2c20, B.x0 + e, B.x1 - e, 0, 0.26, B.z0 + e, B.z1 - e, 1);
  // runner beans up bamboo canes, a string along the tops
  for (const z of B.canes) {
    H.rod(k.paper, 0xb9a265, [B.caneX, 0.26, z], [B.caneX, B.caneH, z], 0.008, 5, 1);
    for (let hh = 0.4; hh < 1.7; hh += 0.26) H.blob(jit(rnd, 0x6f9a48, 0.8, 1.15), B.caneX + (rnd() - 0.5) * 0.04, hh, z + (rnd() - 0.5) * 0.04, 0.055 + rnd() * 0.02, 1, 1.1, 1, hh * 17 + z, 2, 0.25);
    for (let i = 0; i < 3; i++) H.ball(k.petal, 0xd0402e, B.caneX + (rnd() - 0.5) * 0.08, 0.7 + rnd() * 0.9, z + (rnd() - 0.5) * 0.08, 0.016, 1, 1, 1, 5, 2);
  }
  H.rod(k.paper, 0xb9a265, [B.caneX, B.caneH - 0.02, B.canes[0]], [B.caneX, B.caneH - 0.02, B.canes[B.canes.length - 1]], 0.008, 5, 1);
  for (let i = 0; i < B.canes.length; i++) H.ball(k.fabric, 0xc9b389, B.caneX, B.caneH - 0.02, B.canes[i], 0.012, 1, 1, 1, 5, 2);
  // rows of lettuce and cabbages either side, onions at the end
  for (let z = B.z0 + 0.25; z < B.z1 - 0.2; z += 0.3) {
    H.blob(jit(rnd, 0x8fb45a, 0.8, 1.15), B.x0 + 0.16, 0.3, z, 0.1, 1.2, 0.5, 1.2, z * 9, 1, 0.3);
    H.blob(jit(rnd, 0x7a9a72, 0.8, 1.15), B.x1 - 0.17, 0.32, z + 0.1, 0.12, 1.2, 0.6, 1.2, z * 5 + 3, 1, 0.3);
  }
  for (let z = B.z1 - 0.5; z < B.z1 - 0.1; z += 0.07) H.rod(k.paper, 0x8fa860, [B.caneX + 0.18, 0.26, z], [B.caneX + 0.18 + (rnd() - 0.5) * 0.08, 0.5, z], 0.007, 4, 2);
  ctx.ground.shadowRect(B.x0, B.z0, B.x1, B.z1, 0.3, 0.2);
}

function patio(H) {
  const { ctx, k, add, T } = H;
  const rnd = mulberry(83);
  const teak = 0xc9a977, Tb = S.TABLE, P = S.PARASOL;
  // table: slatted top on a frame, four legs
  for (let z = Tb.z - Tb.hz + 0.065; z < Tb.z + Tb.hz; z += 0.13) H.box(k.wood, jit(rnd, teak, 0.92, 1.05), Tb.x - Tb.hx, Tb.x + Tb.hx, Tb.h - 0.04, Tb.h, z - 0.063, z + 0.063, 1);
  for (const x of [Tb.x - Tb.hx + 0.08, Tb.x + Tb.hx - 0.08]) H.box(k.wood, 0xb89868, x - 0.025, x + 0.025, Tb.h - 0.1, Tb.h - 0.04, Tb.z - Tb.hz, Tb.z + Tb.hz, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = Tb.x + sx * (Tb.hx - 0.07), z = Tb.z + sz * (Tb.hz - 0.07);
    H.box(k.wood, 0xb89868, x - 0.03, x + 0.03, 0, Tb.h - 0.04, z - 0.03, z + 0.03, 1);
  }
  // parasol: pole, stone base, ribs, striped canopy with a scalloped valance
  H.cyl(k.steel, 0xb4b8ba, P.x, P.z, 0, P.apex + 0.05, 0.02, 0.02, 8, 1);
  H.cyl(k.stone, 0x9a968a, P.x, P.z, 0, 0.05, 0.22, 0.22, 12, 1);
  H.ball(k.brass, 0xc9a24e, P.x, P.apex + 0.1, P.z, 0.025, 1, 1, 1, 8, 1);
  const N = 8, cols = [0xe9dfc3, 0xb8573a];
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * PI * 2, a1 = ((i + 1) / N) * PI * 2;
    const rim = (a) => [P.x + Math.sin(a) * P.r, g + P.edge, P.z + Math.cos(a) * P.r];
    const ap = [P.x, g + P.apex, P.z], r0 = rim(a0), r1 = rim(a1);
    for (const flip of [false, true]) {
      const geo = new THREE.BufferGeometry();
      const tri = flip ? [ap, r1, r0] : [ap, r0, r1];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 1, 0, 0, 1, 0], 2));
      geo.computeVertexNormals();
      add(geo, k.fabric, null, cols[i % 2], 1);
    }
    for (const flip of [false, true]) {
      const q = new THREE.BufferGeometry(), d = 0.11;
      const v = [r0, r1, [r1[0], r1[1] - d, r1[2]], [r0[0], r0[1] - d, r0[2]]];
      const idx = flip ? [0, 3, 2, 0, 2, 1] : [0, 2, 3, 0, 1, 2];
      q.setAttribute('position', new THREE.Float32BufferAttribute(idx.flatMap((j) => v[j]), 3));
      q.setAttribute('uv', new THREE.Float32BufferAttribute(idx.flatMap((j) => [j === 1 || j === 2 ? 1 : 0, j >= 2 ? 0 : 1]), 2));
      q.computeVertexNormals();
      add(q, k.fabric, null, cols[i % 2], 1);
    }
    H.rod(k.steel, 0xb4b8ba, [P.x, P.apex - 0.04, P.z], [P.x + Math.sin(a0) * (P.r - 0.03), P.edge - 0.03, P.z + Math.cos(a0) * (P.r - 0.03)], 0.006, 4, 2);
  }
  // four folding wooden chairs
  for (const [cx, cz, yaw] of S.CHAIRS1) {
    const s = Math.sin(yaw), c = Math.cos(yaw), at = (u, v) => [cx + c * u + s * v, cz - s * u + c * v];
    const col = jit(rnd, 0xbf9b66, 0.9, 1.05);
    for (let v = -0.2; v < 0.21; v += 0.08) { const [x, z] = at(0, v); H.boxC(k.wood, col, x, 0.445, z, 0.44, 0.03, 0.065, yaw, 1); }
    for (const u of [-0.19, 0.19]) for (const v of [-0.19, 0.19]) { const [x, z] = at(u, v); H.box(k.wood, 0xa88458, x - 0.02, x + 0.02, 0, 0.43, z - 0.02, z + 0.02, 1); }
    for (const u of [-0.19, 0.19]) { const [x, z] = at(u, -0.2); H.boxC(k.wood, 0xa88458, x, 0.7, z, 0.04, 0.5, 0.025, yaw, 1); }
    for (const hh of [0.58, 0.7, 0.82]) { const [x, z] = at(0, -0.2); H.boxC(k.wood, col, x, hh, z, 0.4, 0.07, 0.02, yaw, 1); }
    for (const u of [-0.19, 0.19]) { const [x1, z1] = at(u, 0.19), [x2, z2] = at(u, -0.19); H.rod(k.wood, 0xa88458, [x1, 0.25, z1], [x2, 0.25, z2], 0.01, 5, 2); }
  }
  // the barbecue: a black kettle on three legs with its lid on, a thermometer, a coal bag
  {
    const Bq = S.BBQ, blk = 0x1c1c1e;
    H.ball(k.enamel, blk, Bq.x, 0.62, Bq.z, 0.28, 1, 0.85, 1, 14, 1);
    H.ball(k.enamel, blk, Bq.x, 0.8, Bq.z, 0.285, 1, 0.55, 1, 14, 1);
    add(new THREE.TorusGeometry(0.285, 0.012, 6, 20).rotateX(PI / 2), k.steel, T(Bq.x, g + 0.7, Bq.z), 0xb4b8ba, 2);
    H.rod(k.wood, 0x5a3f26, [Bq.x - 0.12, 0.93, Bq.z], [Bq.x + 0.12, 0.93, Bq.z], 0.014, 6, 2);
    for (const sx of [-1, 1]) H.rod(k.steel, 0xb4b8ba, [Bq.x + sx * 0.12, 0.93, Bq.z], [Bq.x + sx * 0.1, 0.82, Bq.z], 0.008, 4, 2);
    H.cyl(k.steel, 0xb4b8ba, Bq.x + 0.1, Bq.z - 0.1, 0.9, 0.93, 0.02, 0.02, 8, 2);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; H.rod(k.iron, 0x25272a, [Bq.x + Math.cos(a) * 0.2, 0.5, Bq.z + Math.sin(a) * 0.2], [Bq.x + Math.cos(a) * 0.3, 0, Bq.z + Math.sin(a) * 0.3], 0.015, 6, 1); }
    H.cyl(k.enamel, blk, Bq.x, Bq.z, 0.18, 0.2, 0.2, 0.2, 12, 2);
    H.box(k.paper, 0x3a2f28, 10.05, 10.2, 0, 0.58, 2.1, 2.5, 1);                         // not collided: it leans on the passage side of the house
    H.box(k.paper, 0x6a5a48, 10.0, 10.18, 0.25, 0.4, 2.1, 2.5, 2);
  }
  // side table with a board, tongs, a plate of burgers
  {
    const St = S.SIDE_TABLE;
    for (let z = St.z - St.hz + 0.05; z < St.z + St.hz; z += 0.1) H.box(k.wood, jit(rnd, teak, 0.9, 1.05), St.x - St.hx, St.x + St.hx, St.h - 0.03, St.h, z - 0.048, z + 0.048, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) H.box(k.wood, 0xa88458, St.x + sx * (St.hx - 0.04) - 0.02, St.x + sx * (St.hx - 0.04) + 0.02, 0, St.h - 0.03, St.z + sz * (St.hz - 0.04) - 0.02, St.z + sz * (St.hz - 0.04) + 0.02, 1);
    H.box(k.wood, 0x8a6a42, St.x - 0.22, St.x - 0.05, St.h, St.h + 0.02, St.z - 0.12, St.z + 0.08, 2);
    H.rod(k.steel, 0xb4b8ba, [St.x - 0.18, St.h + 0.025, St.z + 0.12], [St.x - 0.02, St.h + 0.025, St.z + 0.13], 0.006, 4, 2);
    H.cyl(k.ceramic, 0xe8e2d0, St.x + 0.1, St.z + 0.1, St.h, St.h + 0.012, 0.06, 0.07, 10, 2);
  }
  // terracotta pots of geraniums at the corners of the patio
  for (const [x, z] of [[6.75, 2.3], [10.0, 2.32], [8.1, 2.36]]) {
    H.cyl(k.terracotta, jit(rnd, 0xb8643f, 0.85, 1.05), x, z, 0, 0.26, 0.12, 0.17, 12, 1);
    for (let i = 0; i < 4; i++) H.blob(jit(rnd, 0x6f9a48, 0.8, 1.15), x + (rnd() - 0.5) * 0.14, 0.34, z + (rnd() - 0.5) * 0.14, 0.1, 1, 0.8, 1, i + x, 2, 0.25);
    for (let i = 0; i < 4; i++) H.ball(k.petal, [0xd94f6e, 0xc23a55, 0xe86a4a][i % 3], x + (rnd() - 0.5) * 0.2, 0.42 + rnd() * 0.05, z + (rnd() - 0.5) * 0.2, 0.04, 1, 0.8, 1, 6, 2);
  }
  ctx.ground.shadowCircle(P.x, P.z, P.r * 0.9, 1.95, 0.3);
}


// ----------------------------------------------------------------------------------------------- p+2: hedges, walls, gate
function yewHedges(H) {
  const { ctx, k, wk, add, T } = H;
  const yew = 0x7c9468, yew2 = 0x86a070, rnd = mulberry(404);
  const hedge = (x0, x1, h0, h1, z, d, col, seed, r = 0.15, rz = 0) =>
    add(clippedBlock(x1 - x0, h1 - h0, d, r, seed, 0.035), wk.leafy, T((x0 + x1) / 2, g + (h0 + h1) / 2, z, 0, 0, rz), col, 0);
  // The cross hedge with its arch (the opening is 1 m wide, 1.7 m to the springing, chamfered to a flat 2 m top).
  const Hd = S.HEDGE2, z = Hd.z, d = Hd.t;
  hedge(11.0, Hd.arch[0], 0, Hd.h, z, d, yew, 1);
  hedge(Hd.arch[1], 18.09, 0, Hd.h, z, d, yew2, 2);
  hedge(Hd.arch[0] - 0.1, Hd.arch[1] + 0.1, 1.95, Hd.h, z, d, yew, 3);
  for (const [cx, col] of [[Hd.arch[0] + 0.0, yew], [Hd.arch[1] - 0.0, yew2]]) add(clippedBlock(0.42, 0.42, d, 0.07, cx, 0.03), wk.leafy, T(cx, g + 2.0, z, 0, 0, PI / 4), col, 0);
  // a few topiary buttons along the top of the hedge
  for (const x of [12.0, 13.4, 15.8, 17.2]) add(blobGeom(ctx, 0.3, x), wk.leafy, T(x, g + Hd.h + 0.12, z, 0, 0, 0, 1, 0.9, 1), jit(rnd, yew, 0.95, 1.1), 0);
  // The back hedge, then brick piers either side of the open iron gate, then the walled corner.
  const B = S.BACK2, hz = B.z;
  hedge(11.0, B.pierX[0] - 0.15, 0, B.h, hz, 0.85, yew, 4);
  for (const x of B.pierX) {
    ctx.add(ctx.boxUV(0.34, 2.0, 0.34, 1), wk.brick, T(x, g + 1.0, hz - 0.05), 0xd0b09a, 0);
    ctx.add(ctx.boxUV(0.44, 0.07, 0.44, 1), k.stone, T(x, g + 2.035, hz - 0.05), 0xcfc6b2, 1);
    ctx.add(new THREE.SphereGeometry(0.1, 10, 7), k.stone, T(x, g + 2.17, hz - 0.05, 0, 0, 0, 1, 1.15, 1), 0xcfc6b2, 1);
  }
  ctx.add(ctx.boxUV(2.74, S.WALL2.h, 0.22, 1), wk.brick, T((B.wallX0 + 18.09) / 2, g + S.WALL2.h / 2, -6.4 + 0.11), 0xd4b8a2, 0);
  ctx.add(ctx.boxUV(2.74, 0.07, 0.3, 1), k.stone, T((B.wallX0 + 18.09) / 2, g + S.WALL2.h + 0.035, -6.4 + 0.11), 0xb9b09c, 1);
  // the iron gate, swung open against the right pier
  {
    const x = B.gap[1] - 0.02, z0 = -6.3, z1 = -5.3, ir = 0x1f2224;
    H.box(k.iron, ir, x - 0.015, x + 0.015, 0.1, 0.16, z0, z1, 1);
    H.box(k.iron, ir, x - 0.015, x + 0.015, 0.85, 0.9, z0, z1, 1);
    H.box(k.iron, ir, x - 0.015, x + 0.015, 1.64, 1.7, z0, z1, 1);
    for (let zz = z0 + 0.03; zz < z1; zz += 0.085) {
      H.rod(k.iron, ir, [x, 0.1, zz], [x, 1.7, zz], 0.007, 5, 1);
      H.ball(k.iron, ir, x, 1.74, zz, 0.014, 0.8, 1.6, 0.8, 5, 2);
    }
    for (let zz = z0 + 0.14; zz < z1 - 0.1; zz += 0.34) add(new THREE.TorusGeometry(0.09, 0.006, 5, 12, PI * 1.5).rotateY(PI / 2), k.iron, T(x, g + 1.25, zz), ir, 2);
    H.box(k.iron, ir, x - 0.02, x + 0.02, 0.0, 1.72, z0 - 0.015, z0 + 0.012, 1);
    H.box(k.iron, ir, x - 0.02, x + 0.02, 0.0, 1.72, z1 - 0.012, z1 + 0.015, 1);
    for (const hh of [0.4, 1.4]) H.box(k.iron, ir, B.gap[1] - 0.02, B.gap[1] + 0.05, hh, hh + 0.05, z0 - 0.02, z0 + 0.02, 2);
  }
  ctx.ground.shadowRect(11.0, Hd.z - d / 2, 18.09, Hd.z + d / 2, 1.8, 0.4);
  ctx.ground.shadowRect(11.0, hz - 0.42, B.pierX[0], hz + 0.42, 1.8, 0.4);
  ctx.ground.shadowRect(B.wallX0, -6.4, 18.09, -6.18, 1.6, 0.4);
}
function blobGeom(ctx, r, seed) { return ctx.blobGeometry(r, 1, seed, 0.06); }

// ----------------------------------------------------------------------------------------------- p+2: fountain
function fountain(H) {
  const { ctx, k, wk, add, T } = H;
  const F = S.FOUNTAIN, stone = 0xcfc6b2, rnd = mulberry(55);
  // basin: outer wall, coping (flat top, rounded outside), inner wall down to the floor
  add(lathe([[1.0, 0], [1.0, 0.4], [0.99, 0.44], [0.96, 0.455], [0.93, 0.46], [0.78, 0.46], [0.78, 0.44], [0.77, 0.3], [0.76, 0.04], [0, 0.04]], 28, 1), k.stone, T(F.x, g, F.z), stone, 1);
  add(lathe([[0.757, 0.045], [0.767, 0.3], [0.772, F.water + 0.002]], 28, 1), k.stone, T(F.x, g, F.z), 0x76896a, 1);          // algae below the waterline
  add(new THREE.CircleGeometry(0.762, 28).rotateX(-PI / 2), wk.water, T(F.x, g + F.water, F.z), 0x7c9a90, 1);
  // pedestal, stem, two bowls, finial
  add(lathe([[0.3, 0], [0.3, 0.06], [0.22, 0.1], [0.2, 0.3], [0.24, 0.5], [0.26, 0.66], [0.26, 0.7]], 20, 1), k.stone, T(F.x, g, F.z), stone, 1);
  add(lathe([[0.1, 0.7], [0.3, 0.7], [0.5, 0.74], [0.52, 0.82], [0.46, 0.82], [0.4, 0.8], [0.1, 0.78]], 24, 1), k.stone, T(F.x, g, F.z), stone, 1);
  add(lathe([[0.09, 0.78], [0.075, 1.0], [0.085, 1.2]], 14, 1), k.stone, T(F.x, g, F.z), stone, 1);
  add(lathe([[0.06, 1.18], [0.15, 1.2], [0.28, 1.27], [0.29, 1.3], [0.25, 1.3], [0.15, 1.26], [0.05, 1.25]], 20, 1), k.stone, T(F.x, g, F.z), stone, 1);
  H.ball(k.stone, stone, F.x, 1.36, F.z, 0.07, 1, 1, 1, 10, 1);
  add(new THREE.CircleGeometry(0.4, 20).rotateX(-PI / 2), wk.water, T(F.x, g + 0.8, F.z), 0x8fb0a8, 1);
  add(new THREE.CircleGeometry(0.24, 16).rotateX(-PI / 2), wk.water, T(F.x, g + 1.285, F.z), 0x8fb0a8, 1);
  // curtains of falling water between the bowls
  for (const prof of [[[0.29, 1.28], [0.315, 1.05], [0.31, 0.83]], [[0.46, 0.8], [0.6, 0.6], [0.66, 0.345]]]) {
    add(lathe(prof, 20, 1), k.glass, T(F.x, g, F.z), 0xe8f6f8, 1);
    add(lathe(prof.slice().reverse(), 20, 1), k.glass, T(F.x, g, F.z), 0xe8f6f8, 1);
  }
  // lily pads, one in flower
  for (const [a, r, s] of [[0.5, 0.62, 0.11], [2.2, 0.66, 0.09], [4.1, 0.6, 0.12], [5.4, 0.68, 0.08]]) {
    add(new THREE.CircleGeometry(s, 9).rotateX(-PI / 2), k.leaf, T(F.x + Math.cos(a) * r, g + F.water + 0.004, F.z + Math.sin(a) * r), jit(rnd, 0x55793a, 0.8, 1.15), 2);
  }
  H.ball(k.petal, 0xf0b8c8, F.x + Math.cos(4.1) * 0.6, F.water + 0.03, F.z + Math.sin(4.1) * 0.6, 0.035, 1, 0.6, 1, 6, 2);
  // spray: droplets in three arcs, animated while the camera is near
  const jet = 14, cascade = 16, ring = 20, n = jet + cascade + ring;
  const mat = new THREE.MeshStandardMaterial({ color: 0xdff0f4, roughness: 0.1, transparent: true, opacity: 0.75, depthWrite: false });
  mat.name = 'world-glass-water-drops';
  const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.014, 0), mat, n);
  inst.frustumCulled = false;
  inst.userData.noAO = true;
  const o = new THREE.Object3D();
  let time = 0;
  const place = () => {
    for (let i = 0; i < n; i++) {
      let x, y, z, s = 1;
      if (i < jet) {
        const t = (time * 0.85 + i / jet) % 1, a = i * 2.4;
        y = 1.44 + 0.62 * 4 * t * (1 - t); x = Math.cos(a) * 0.06 * (t < 0.5 ? t * 2 : 1 - (t - 0.5) * 0.0 + 0); z = Math.sin(a) * 0.06 * Math.min(1, t * 2);
        x = Math.cos(a) * 0.05 * t; z = Math.sin(a) * 0.05 * t;
      } else if (i < jet + cascade) {
        const j = i - jet, t = (time * 0.9 + j / cascade * 1.3) % 1, a = (j / cascade) * PI * 2;
        const r = 0.285 + 0.03 * t; y = 1.27 - 0.47 * t * t; x = Math.cos(a) * r; z = Math.sin(a) * r; s = 0.8;
      } else {
        const j = i - jet - cascade, t = (time * 0.8 + j / ring * 1.7) % 1, a = (j / ring) * PI * 2 + 0.2;
        const r = 0.5 + 0.12 * t; y = 0.8 - 0.46 * t * t; x = Math.cos(a) * r; z = Math.sin(a) * r;
      }
      o.position.set(F.x + x, g + y, F.z + z); o.scale.setScalar(s); o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  place();
  ctx.object(inst, 1);
  ctx.update((dt, sim, camera) => {
    if (!camera || Math.abs(camera.position.x - F.x) > 22 || Math.abs(camera.position.z - F.z) > 22) return;
    time += dt;
    place();
  });
  ctx.ground.shadowCircle(F.x, F.z, 0.95, 0.5, 0.2);
}

// ----------------------------------------------------------------------------------------------- p+2: the wisteria pergola
function pergola(H) {
  const { ctx, k, wk, add, T } = H;
  const P = S.PERGOLA, rnd = mulberry(909), oak = 0xb3a283, oak2 = 0xa49575;
  const zA = P.z[0] + 0.1, zB = P.z[P.z.length - 1] - 0.1;
  for (const x of [P.x0, P.x1]) for (const z of P.z) {
    H.box(k.weathered, jit(rnd, oak, 0.92, 1.05), x - 0.065, x + 0.065, 0, P.h, z - 0.065, z + 0.065, 1);
    H.box(k.iron, 0x2a2c2e, x - 0.08, x + 0.08, 0, 0.05, z - 0.08, z + 0.08, 2);
  }
  for (const x of [P.x0, P.x1]) H.box(k.weathered, oak2, x - 0.05, x + 0.05, P.h, P.h + 0.2, zB, zA, 1);
  for (let z = P.z[0]; z >= zB - 0.001; z -= 0.5) H.box(k.weathered, jit(rnd, oak, 0.9, 1.05), P.x0 - 0.3, P.x1 + 0.3, P.h + 0.2, P.h + 0.28, z - 0.04, z + 0.04, 1);
  // diagonal braces at the posts
  for (const x of [P.x0, P.x1]) for (const z of P.z) {
    const s = x === P.x0 ? 1 : -1;
    H.beam(k.weathered, oak2, [x, P.h - 0.5, z], [x + s * 0.5, P.h, z], 0.05, 0.05, [0, 0, 1], 2);
  }
  // the old twisted stems climbing the near posts, and along the side beams
  for (const [x, z] of [[P.x0, P.z[0]], [P.x1, P.z[1]], [P.x0, P.z[2]], [P.x1, P.z[3]]]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12, a = u * PI * 3 + x; pts.push(new THREE.Vector3(x + Math.cos(a) * 0.1, g + u * (P.h + 0.25), z + Math.sin(a) * 0.1)); }
    add(taperTube(new THREE.CatmullRomCurve3(pts), 0.04, 0.02, 14, 5), wk.bark, null, 0x9a8a7a, 1);
  }
  for (const x of [P.x0 - 0.05, P.x1 + 0.05]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(x + Math.sin(u * 9) * 0.04, g + P.h + 0.3 + Math.sin(u * 7) * 0.02, P.z[0] + (zB - P.z[0]) * u)); }
    add(taperTube(new THREE.CatmullRomCurve3(pts), 0.025, 0.018, 16, 5), wk.bark, null, 0x9a8a7a, 1);
  }
  // foliage mat on top (a lumpy sheet), more where the stems are
  for (let x = P.x0 - 0.1; x <= P.x1 + 0.12; x += 0.46) for (let z = zA + 0.1; z > zB - 0.15; z -= 0.46) {
    H.blob(jit(rnd, 0xa6c07c, 0.8, 1.1), x + (rnd() - 0.5) * 0.12, P.mat + 0.0, z + (rnd() - 0.5) * 0.12, 0.3 + rnd() * 0.06, 1, 0.5, 1, x * 5 + z * 7, 1, 0.3, rnd() * 6);
  }
  // racemes of wisteria hanging from the mat, clear of the flight path below
  const lil = [0xa68bc6, 0xb69bd2, 0x8f78b8, 0xc3acd8, 0xe3dcee, 0x9a82bd];
  for (let i = 0; i < 42; i++) {
    const x = P.x0 - 0.15 + rnd() * (P.x1 - P.x0 + 0.3), z = zA - 0.1 - rnd() * (zA - zB - 0.2), len = 0.32 + rnd() * 0.3;
    const edge = Math.abs(x - (P.x0 + P.x1) / 2) > 0.7;
    const top = P.mat - 0.08;
    if (!edge && rnd() < 0.3) continue;
    add(new THREE.ConeGeometry(0.045 + rnd() * 0.02, len, 6, 1).rotateX(PI), k.petal, T(x, g + top - len / 2, z, rnd() * 6), jit(rnd, lil[i % lil.length], 0.92, 1.05), 1);
    add(new THREE.ConeGeometry(0.03, len * 0.55, 5, 1).rotateX(PI), k.petal, T(x + 0.04, g + top - len * 0.3, z + 0.03), jit(rnd, lil[(i + 2) % lil.length], 0.92, 1.05), 2);
  }
  // fallen petals on the path
  for (let i = 0; i < 22; i++) H.boxC(k.petal, jit(rnd, lil[i % lil.length], 0.9, 1.05), 14.6 + (rnd() - 0.5) * 1.8, 0.004, zA - rnd() * (zA - zB), 0.03, 0.004, 0.02, rnd() * 6, 2);
  ctx.ground.shadowRect(P.x0 - 0.3, zB - 0.1, P.x1 + 0.3, zA + 0.1, P.h, 0.45);
}


// ----------------------------------------------------------------------------------------------- p+2: topiary, bench, sundial, espalier, borders
function sundialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, '#b89a58'); grd.addColorStop(1, '#8c7340');
  x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(${i % 3 ? '60,70,40' : '230,210,150'},${0.04 + (i % 7) * 0.01})`; x.fillRect((i * 97) % 256, (i * 53) % 256, 2 + (i % 4), 1.5); }
  x.strokeStyle = '#2b2418'; x.lineWidth = 2;
  x.beginPath(); x.arc(128, 128, 116, 0, PI * 2); x.stroke();
  x.beginPath(); x.arc(128, 128, 84, 0, PI * 2); x.stroke();
  x.font = 'bold 20px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#2b2418';
  const num = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = i * PI / 6 - PI / 2 + PI, ca = Math.cos(a), sa = Math.sin(a);
    x.beginPath(); x.moveTo(128 + ca * 40, 128 + sa * 40); x.lineTo(128 + ca * 84, 128 + sa * 84); x.stroke();
    x.save(); x.translate(128 + ca * 100, 128 + sa * 100); x.rotate(a + PI / 2); x.fillText(num[i], 0, 0); x.restore();
  }
  x.font = 'italic 11px serif';
  x.fillText('HORAS NON NUMERO NISI SERENAS', 128, 128 + 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function formalGarden(H) {
  const { ctx, k, wk, add, T } = H;
  const { boxUV } = ctx;
  const rnd = mulberry(1212);
  const box = 0x7f9a6e, stone = 0xd2cab6;
  // clipped balls on stone pots
  for (const [i, [x, z]] of S.BALLS.entries()) {
    add(lathe([[0.16, 0], [0.2, 0.02], [0.22, 0.4], [0.24, 0.42], [0.2, 0.42]], 14, 1), k.stone, T(x, g, z), stone, 1);
    H.rod(k.weathered, 0x6a5a40, [x, 0.4, z], [x, 0.54, z], 0.025, 5, 1);
    add(ctx.blobGeometry(0.41, 2, 11 + i, 0.045), wk.leafy, T(x, g + 0.78, z, 0, 0, 0, 1, 0.97, 1), jit(rnd, box, 0.95, 1.1), 0);
  }
  // cones
  for (const [i, [x, z]] of S.CONES.entries()) {
    add(lathe([[0.15, 0], [0.19, 0.02], [0.2, 0.3], [0.22, 0.32], [0.18, 0.32]], 14, 1), k.stone, T(x, g, z), stone, 1);
    add(foliageUV(new THREE.LatheGeometry([[0.0, 0.3], [0.4, 0.3], [0.37, 0.6], [0.3, 0.98], [0.2, 1.38], [0.1, 1.68], [0.03, 1.8], [0, 1.82]].map(([r, y]) => new THREE.Vector2(r, y)), 14)), wk.leafy, T(x, g, z, i), jit(rnd, box, 0.95, 1.1), 0);
  }
  // the peacock: clipped plinth, body, neck and head, a fanned tail
  {
    const K = S.PEACOCK, col = 0x7a9768, col2 = 0x86a373;
    add(clippedBlock(0.62, 0.46, 0.64, 0.07, 3, 0.02), wk.leafy, T(K.x, g + 0.23, K.z), col, 0);
    add(ctx.blobGeometry(0.33, 2, 5, 0.04), wk.leafy, T(K.x, g + 0.74, K.z, 0, 0, 0, 0.85, 0.95, 1.35), col2, 0);
    const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(K.x, g + 0.82, K.z + 0.14), new THREE.Vector3(K.x, g + 1.05, K.z + 0.26), new THREE.Vector3(K.x, g + 1.25, K.z + 0.22), new THREE.Vector3(K.x, g + 1.36, K.z + 0.27)]);
    add(foliageUV(taperTube(neck, 0.12, 0.06, 12, 7)), wk.leafy, null, col2, 0);
    add(ctx.blobGeometry(0.1, 2, 9, 0.04), wk.leafy, T(K.x, g + 1.4, K.z + 0.29, 0, 0, 0, 0.9, 1, 1.15), col2, 0);
    add(new THREE.ConeGeometry(0.035, 0.14, 6).rotateX(PI / 2), wk.leafy, T(K.x, g + 1.4, K.z + 0.4), col, 1);       // beak
    for (const sx of [-0.04, 0, 0.04]) add(new THREE.ConeGeometry(0.018, 0.14, 5), wk.leafy, T(K.x + sx, g + 1.54, K.z + 0.27, 0, -0.2, sx * 4), col, 1);   // crest
    // tail: eleven feather blocks fanned out behind, tipped with round "eyes"
    for (let i = 0; i < 11; i++) {
      const a = -1.25 + i * 0.25, len = 0.62 + (i % 2) * 0.06;
      const cx = K.x + Math.sin(a) * len * 0.5, cy = 0.55 + Math.cos(a) * len * 0.5, cz = K.z - 0.2 - (1 - Math.abs(Math.sin(a))) * 0.04;
      add(ctx.blobGeometry(0.18, 1, 20 + i, 0.05), wk.leafy, T(cx, g + cy, cz, 0, 0, -a, 0.34, len / 0.36 * 0.95, 0.7), jit(rnd, i % 2 ? col : col2, 0.95, 1.1), 0);
      add(ctx.blobGeometry(0.09, 1, 30 + i, 0.05), wk.leafy, T(K.x + Math.sin(a) * (len - 0.02), g + 0.55 + Math.cos(a) * (len - 0.02), cz + 0.06, 0, 0, 0, 1, 1, 0.7), 0x92b07a, 0);
    }
    ctx.ground.shadowCircle(K.x + 0.2, K.z + 0.3, 0.7, 0.9, 0.25);
  }
  // urns on plinths
  for (const [x, z] of S.URNS) {
    H.box(k.stone, 0xcdc5b1, x - 0.2, x + 0.2, 0, 0.5, z - 0.2, z + 0.2, 1);
    H.box(k.stone, 0xd8d0bc, x - 0.24, x + 0.24, 0.5, 0.56, z - 0.24, z + 0.24, 1);
    add(lathe([[0.1, 0.56], [0.09, 0.62], [0.2, 0.74], [0.23, 0.86], [0.2, 0.93], [0.24, 0.96], [0.2, 0.97], [0.16, 0.95]], 16, 1), k.stone, T(x, g, z), 0xd8d0bc, 1);
    H.blob(0x88a45c, x, 1.07, z, 0.24, 1, 0.8, 1, x * 3, 1, 0.25);
    for (let i = 0; i < 6; i++) H.ball(k.petal, [0xd94f6e, 0xf2d0a8, 0xe8e0d0][i % 3], x + (rnd() - 0.5) * 0.3, 1.12 + rnd() * 0.1, z + (rnd() - 0.5) * 0.3, 0.04, 1, 0.8, 1, 6, 2);
  }
  // bench by the hedge: silvered teak, slatted seat and back, scrolled arms
  {
    const Be = S.BENCH2, tk = 0xb8aa92;
    for (let z = Be.z - Be.hz + 0.05; z < Be.z + Be.hz; z += 0.11) H.box(k.wood, jit(rnd, tk, 0.9, 1.05), Be.x - Be.hx, Be.x + Be.hx, 0.43, 0.47, z - 0.05, z + 0.05, 1);
    for (let hh = 0.52; hh < 0.95; hh += 0.1) H.box(k.wood, jit(rnd, tk, 0.9, 1.05), Be.x - Be.hx, Be.x + Be.hx, hh, hh + 0.07, Be.z - Be.hz, Be.z - Be.hz + 0.05, 1);
    for (const sx of [-1, 1]) {
      const x = Be.x + sx * (Be.hx - 0.06);
      H.box(k.wood, 0xa89a82, x - 0.04, x + 0.04, 0, 0.43, Be.z - Be.hz, Be.z + Be.hz, 1);
      H.box(k.wood, 0xa89a82, x + sx * 0.05 - 0.03, x + sx * 0.05 + 0.03, 0.47, 0.68, Be.z - Be.hz, Be.z + Be.hz - 0.1, 1);
      H.box(k.wood, 0xa89a82, x + sx * 0.05 - 0.04, x + sx * 0.05 + 0.04, 0.66, 0.7, Be.z - Be.hz, Be.z + Be.hz - 0.08, 1);
    }
    H.box(k.wood, 0xa89a82, Be.x - Be.hx, Be.x + Be.hx, 0.2, 0.24, Be.z - Be.hz + 0.05, Be.z + Be.hz - 0.05, 2);
  }
  // sundial
  {
    const D = S.SUNDIAL;
    H.box(k.stone, 0xc2baa6, D.x - 0.28, D.x + 0.28, 0, 0.06, D.z - 0.28, D.z + 0.28, 1);
    H.box(k.stone, 0xcdc5b1, D.x - 0.24, D.x + 0.24, 0.06, 0.12, D.z - 0.24, D.z + 0.24, 1);
    add(lathe([[0.18, 0.12], [0.145, 0.2], [0.115, 0.5], [0.135, 0.78], [0.17, 0.9], [0.2, 0.93], [0.21, D.top - 0.02]], 18, 1), k.stone, T(D.x, g, D.z), 0xd2cab6, 1);
    add(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 20), k.brass, T(D.x, g + D.top + 0.005, D.z), 0x9a7c44, 1);
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: sundialTexture(), metalness: 0.5, roughness: 0.5 }));
    plate.position.set(D.x, g + D.top + 0.031, D.z);
    ctx.object(plate, 1);
    const sh = new THREE.Shape(); sh.moveTo(-0.01, 0); sh.lineTo(0.09, 0); sh.lineTo(-0.01, 0.13); sh.closePath();
    add(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }).rotateY(-PI / 2), k.brass, T(D.x + 0.006, g + D.top + 0.03, D.z), 0xb08a3a, 1);
    ctx.ground.shadowCircle(D.x, D.z, 0.3, 0.5, 0.2);
  }
  // espalier pears: two on the back wall, three on the right wall, trained on wires
  {
    const wallB = -6.18, wallR = 18.09, leafPts = [];
    const P3 = (wall, s, h, d) => (wall === 'b' ? [s, h, wallB + d] : [wallR - d, h, s]);
    const normal = (wall) => (wall === 'b' ? [0, 0.3, 1] : [-1, 0.3, 0]);
    const tiers = [0.42, 0.8, 1.18, 1.52];
    for (const [wall, s0] of [['b', 16.1], ['b', 17.0], ['r', -5.3], ['r', -4.3], ['r', -3.3]]) {
      const dir = wall === 'b' ? 1 : 1;
      H.rod(k.weathered, 0x6b5a46, P3(wall, s0, 0.15, 0.05), P3(wall, s0, 1.62, 0.05), 0.018, 5, 1, 0.012);
      for (const [ti, h] of tiers.entries()) for (const side of [-1, 1]) {
        const len = 0.5 - ti * 0.03, a = P3(wall, s0, h, 0.05), b = P3(wall, s0 + side * dir * len, h + 0.04, 0.05);
        H.rod(k.weathered, 0x6b5a46, a, b, 0.012, 5, 1, 0.007);
        for (let u = 0.15; u < len; u += 0.17) {
          const p = P3(wall, s0 + side * dir * u, h + 0.03 + (rnd() - 0.5) * 0.04, 0.09);
          H.blob(jit(rnd, 0x7c9a54, 0.8, 1.15), p[0], p[1], p[2], 0.07 + rnd() * 0.03, wall === 'b' ? 1 : 0.5, 0.75, wall === 'b' ? 0.5 : 1, ti * 9 + u * 7 + s0, 1, 0.3);
          const q = P3(wall, s0 + side * dir * u, h + 0.03, 0.09);
          for (let m = 0; m < 4; m++) leafPts.push([q[0] + (rnd() - 0.5) * 0.12, q[1] + (rnd() - 0.4) * 0.1, q[2] + (rnd() - 0.5) * 0.12, ...normal(wall)]);
          if (rnd() < 0.22) { const f = P3(wall, s0 + side * dir * u + (rnd() - 0.5) * 0.05, h - 0.03, 0.1); H.ball(k.petal, rnd() < 0.5 ? 0xb3b34a : 0xc7a640, f[0], f[1], f[2], 0.028, 0.85, 1.25, 0.85, 7, 2); }
        }
      }
    }
    // wires along both walls
    for (const h of tiers) {
      const a = P3('b', 15.55, h, 0.04), b = P3('b', 17.95, h, 0.04), c = P3('r', -6.0, h, 0.04), d = P3('r', -3.0, h, 0.04);
      H.rod(k.steel, 0x8a8e90, a, b, 0.0025, 3, 2); H.rod(k.steel, 0x8a8e90, c, d, 0.0025, 3, 2);
    }
    if (!ctx.lite) ctx.object(leafCards(ctx, leafPts, { size: 0.16, hue: 112 }), 2);
  }
  // borders: lavender mounds, roses, box
  const sh = [[11.45, 0.55, 0.34, 'lav'], [11.4, 1.2, 0.3, 'rose'], [11.5, -1.2, 0.3, 'box'], [17.8, 0.55, 0.34, 'lav'], [17.85, -0.9, 0.3, 'rose'], [17.8, 1.3, 0.3, 'box'], [12.0, -3.4, 0.4, 'rose'], [12.2, -4.3, 0.36, 'lav'], [12.4, -5.2, 0.4, 'rose']];
  for (const [i, [x, z, r, kind]] of sh.entries()) {
    const col = kind === 'lav' ? 0x9ba68c : kind === 'rose' ? 0x7f9a62 : 0x6f8e62;
    H.blob(jit(rnd, col, 0.9, 1.1), x, r * 0.95, z, r * 1.15, 1, 0.85, 1, i * 3, 1, 0.22);
    if (kind === 'lav') for (let m = 0; m < 14; m++) { const a = rnd() * PI * 2, rr = rnd() * r; add(new THREE.ConeGeometry(0.013, 0.1, 5), k.petal, T(x + Math.cos(a) * rr, g + r * 1.45 + rnd() * 0.04, z + Math.sin(a) * rr), jit(rnd, 0x8a63b8, 0.85, 1.15), 2); }
    if (kind === 'rose') for (let m = 0; m < 9; m++) { const a = rnd() * PI * 2, rr = rnd() * r * 0.9; H.ball(k.petal, [0xe9a0b0, 0xd94f6e, 0xf2e0d0, 0xe8c8b8][m % 4], x + Math.cos(a) * rr, r * 1.35 + rnd() * 0.08, z + Math.sin(a) * rr, 0.04, 1, 0.8, 1, 6, 2); }
  }
}

// ----------------------------------------------------------------------------------------------- the strip behind the old wall
function strip(H) {
  const { ctx, k, wk } = H;
  const rnd = mulberry(1717);
  buildFence(ctx, { a: [18.2, -6.4], b: [19.5, -6.4], h: 1.8, style: 'board', color: 0x8a7a66 });
  // hawthorn and bramble hedge at the world's edge
  {
    const a = [S.STRIP.hedgeX, -6.4], b = [S.STRIP.hedgeX, 8.55];
    const len = b[1] - a[1], n = Math.ceil(len / 0.8);
    for (let i = 0; i < n; i++) {
      const z = a[1] + (i + 0.5) * len / n;
      ctx.add(ctx.blobGeometry(0.5, 2, i * 3 + 1, 0.22), wk.leafy, H.T(a[0], g + 1.2 + (rnd() - 0.5) * 0.15, z, rnd() * 6, 0, 0, 1.05, 2.3, 0.75), jit(rnd, 0x8fa27a, 0.85, 1.12), 0);
    }
  }
  // compost bays built of pallets, with weeds on top; a log pile; a water butt with a down pipe; nettles
  for (const [x0, x1, z0, z1] of [[18.55, 19.15, -4.95, -4.0]]) {
    H.box(k.weathered, 0x8a7a66, x0, x1, 0, 0.95, z0, z0 + 0.04, 1);
    H.box(k.weathered, 0x8a7a66, x0, x1, 0, 0.95, z1 - 0.04, z1, 1);
    H.box(k.weathered, 0x8a7a66, x1 - 0.04, x1, 0, 0.95, z0, z1, 1);
    H.box(k.soil, 0x2e2418, x0 + 0.04, x1 - 0.04, 0, 0.8, z0 + 0.04, z1 - 0.04, 1);
    for (let i = 0; i < 7; i++) H.blob(jit(rnd, 0x8fa062, 0.8, 1.1), x0 + 0.15 + rnd() * 0.3, 0.85, z0 + 0.15 + rnd() * 0.65, 0.12, 1, 0.6, 1, i, 1, 0.3);
    for (let hh = 0.12; hh < 0.95; hh += 0.14) H.box(k.weathered, 0x7a6a56, x0 - 0.01, x0 + 0.01, hh, hh + 0.05, z0, z1, 2);
  }
  for (let i = 0; i < 16; i++) {
    const r = 0.06 + rnd() * 0.02, row = Math.floor(i / 5), col = i % 5 + (row % 2) * 0.5, zz = -1.5 + col * 0.38, hh = 0.07 + row * 0.12;
    H.cyl(k.bark, jit(rnd, 0x8a7458, 0.7, 1.1), 18.75 + (rnd() - 0.5) * 0.08, zz, hh - 0.0, hh + 0, r, r, 8, 1);
  }
  H.box(k.bark, 0x6a5440, 18.6, 19.1, 0, 0.7, -1.6, 0.4, 1);
  H.cyl(k.enamel, 0x2f5a3a, 18.6, 3.5, 0, 0.95, 0.34, 0.3, 14, 1);
  H.cyl(k.enamel, 0x244a2e, 18.6, 3.5, 0.95, 0.99, 0.35, 0.35, 14, 1);
  H.rod(k.paint, 0x24272a, [18.3, 2.05, 3.5], [18.45, 1.0, 3.5], 0.025, 6, 1);
  for (let i = 0; i < 30; i++) {
    const z = -6.0 + rnd() * 14, x = 18.4 + rnd() * 0.7;
    if ((z > -5 && z < -3.9) || (z > -1.7 && z < 0.5 && x > 18.5 && x < 19.2) || (z > 3.1 && z < 3.9)) continue;
    H.blob(jit(rnd, rnd() < 0.5 ? 0x5f7f3c : 0x7a8a42, 0.8, 1.1), x, 0.3 + rnd() * 0.35, z, 0.18 + rnd() * 0.2, 1, 0.9, 1, i, 1, 0.35);
  }
  ctx.ground.shadowRect(18.2, -6.4, 19.5, 8.55, 1.6, 0.2);
}


// ----------------------------------------------------------------------------------------------- the ground
function paintGround(H) {
  const G = H.ctx.ground;
  const rnd = mulberry(2024);
  const pave = { type: 'paving', color: '#a9a396', lines: 0.6 };
  // ---- passage slabs, p+1 lawn with mower stripes, wear and bark chips
  G.rect(2.52, -1.62, 3.8, 2.2, pave);
  G.rect(3.0, 2.2, 3.8, 8.55, pave);
  G.rect(3.8, 2.5, 4.7, 8.55, { type: 'paving', color: '#a39e92', lines: 0.6 });
  G.rect(10.2, 2.5, 11.0, 8.55, { type: 'paving', color: '#a39e92', lines: 0.6 });
  G.rect(3.8, -6.4, 11.0, 2.5, { type: 'grass', color: '#66793c' });
  for (let z = -6.4, i = 0; z < 2.5; z += 0.5, i++) if (i % 2) G.rect(3.8, z, 11.0, Math.min(2.5, z + 0.5), { type: 'grass', color: '#72863f', alpha: 0.5 });
  for (let i = 0; i < 10; i++) G.circle(4.3 + rnd() * 6, -5.5 + rnd() * 7, 0.2 + rnd() * 0.4, { type: 'grass', color: rnd() < 0.5 ? '#7a8442' : '#5c7036', alpha: 0.4 });
  G.rect(3.95, -1.85, 6.7, 0.15, { type: 'dirt', color: '#6b4a2f', alpha: 0.9 });                     // bark chips under the swings
  G.rect(8.7, -4.5, 9.9, 0.4, { type: 'dirt', color: '#6b4a2f', alpha: 0.85 });                      // and round the slide
  G.rect(8.75, -4.3, 9.85, -3.2, { type: 'dirt', color: '#d5c196' });                                // sand
  G.circle(4.9, -3.4, 0.5, { type: 'dirt', color: '#6a5a40', alpha: 0.8 });                          // worn under the tyre
  G.circle(5.25, 1.4, 1.05, { type: 'grass', color: '#7d9248', alpha: 0.8 });                         // lush round the pool
  G.rect(6.5, 0.3, 10.2, 2.5, { type: 'paving', color: '#b2aa9a', lines: 0.6 });                    // patio
  G.path([[10.4, 0.3], [10.5, -0.4], [10.0, -1.4], [9.4, -3.0], [9.5, -4.6]], 0.55, { type: 'gravel', color: '#a39883' });   // path to the shed
  G.rect(8.9, -6.4, 11.0, -4.5, { type: 'paving', color: '#9a9588', lines: 0.6 });                   // shed base
  G.rect(5.15, -6.3, 6.55, -5.0, { type: 'dirt', color: '#6e5a3e' });                                // run floor
  G.rect(4.2, -6.3, 5.15, -5.0, { type: 'dirt', color: '#6e5a3e', alpha: 0.7 });
  G.rect(9.95, -4.4, 10.9, -1.0, { type: 'soil', color: '#3a2c20' });                                 // vegetable bed
  G.rect(3.95, -2.2, 4.5, 0.3, { type: 'soil', color: '#4a3828', alpha: 0.6 });                      // a worn strip by the fence
  // ---- p+2: striped formal lawn, terrace, gravel, beds
  G.rect(11.0, -6.4, 18.2, 2.4, { type: 'grass', color: '#617a3a' });
  for (let x = 11.0, i = 0; x < 18.1; x += 0.6, i++) {
    const c = i % 2 ? '#6f8841' : '#5b7436';
    G.rect(x, -1.65, Math.min(18.1, x + 0.6), 0.95, { type: 'grass', color: c });
    G.rect(x, -6.0, Math.min(18.1, x + 0.6), -2.55, { type: 'grass', color: c });
  }
  G.rect(11.8, 0.9, 17.4, 2.4, { type: 'paving', color: '#b7b0a0', lines: 0.45 });                    // terrace
  G.circle(14.6, -0.4, 1.7, { type: 'gravel', color: '#b3a88f' });                                    // gravel round the fountain
  G.rect(14.0, 0.5, 15.2, 0.95, { type: 'gravel', color: '#b3a88f' });
  G.rect(14.0, -2.55, 15.2, -1.0, { type: 'gravel', color: '#b3a88f' });                              // to the arch
  G.rect(14.0, -6.4, 15.2, -2.55, { type: 'gravel', color: '#b3a88f' });                              // under the pergola and to the gate
  G.rect(11.0, -1.65, 11.75, 1.4, { type: 'soil', color: '#46352a' });                                // borders
  G.rect(17.45, -1.65, 18.1, 1.4, { type: 'soil', color: '#46352a' });
  G.rect(11.0, -5.8, 13.2, -2.9, { type: 'soil', color: '#46352a' });                                 // the rose bed
  G.rect(15.4, -6.2, 18.1, -5.6, { type: 'soil', color: '#46352a' });                                 // under the espalier
  G.rect(17.7, -6.2, 18.1, -3.0, { type: 'soil', color: '#46352a' });
  G.circle(16.85, -4.4, 1.1, { type: 'gravel', color: '#b3a88f' });                                   // gravel round the sundial
  G.rect(14.0, -6.45, 15.2, -6.2, { type: 'gravel', color: '#a39883' });
  // ---- the strip behind the wall
  G.rect(18.2, -6.4, 19.5, 8.55, { type: 'meadow', color: '#6b7637' });
  G.path([[18.9, -3.4], [18.8, 0], [18.9, 3.0], [18.8, 8.5]], 0.5, { type: 'dirt', color: '#7a664d', alpha: 0.8 });
}

export function build(ctx) {
  const H = mkHelpers(ctx);
  paintGround(H);
  houses(H);
  boundaries(H);
  passage(H);
  oakAndTreehouse(H);
  playThings(H);
  coop(H);
  shed(H);
  vegBed(H);
  patio(H);
  yewHedges(H);
  fountain(H);
  pergola(H);
  formalGarden(H);
  strip(H);
}
