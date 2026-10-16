import * as THREE from 'three';
import { registerExtraSound } from '../../../audio/extras.js';
import { ROOM } from '../../../sim/layout.js';
import { CHAIR, TROUGH, SCRAPER, LANTERN_AT, BOOT_C, WELLIES, BROOM, WALL_Z } from '../../../sim/extras/zones/patio.js';

// Patio set pieces (colliders and loose bodies in src/sim/extras/zones/patio.js).
//   1 deckchair      beech frame in the shared batch, a striped canvas sling of its own that flaps in the wash
//   2 boot scraper   cast iron with scrolled standards and a coir brush, plus a coir doormat (batch only)
//   3 herb trough    painted timber trough of chives, mint, parsley, rosemary and thyme (swaying foliage)
//   4 wellies        a pair of green wellingtons by the door (loose bodies, one instanced mesh)
//   5 yard broom     leaning on the wall (loose body, one mesh); knocked over it clatters
//   6 storm lantern  enamelled hurricane lamp whose flame leans and flickers in the wash and blows out
// Own draw calls: sling, wellies, broom, flame.

const fy = ROOM.floorY;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);

// Seeded random so the pieces look the same on every run.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// A timber bar between two points (lx, y, z in the piece's frame), kept in the plane x = const.
function bar(a, b, w, d) {
  const dir = _b.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = new THREE.BoxGeometry(w, len, d);
  _q.setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(_m.compose(_a.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _one));
  return g;
}
// A round rod between two points.
function rod(a, b, r, seg = 8) {
  const dir = _b.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  _q.setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(_m.compose(_a.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _one));
  return g;
}
const merge = (list) => { // tiny merge for dynamic meshes with a colour attribute
  const pos = [], nor = [], col = [];
  for (const { geo, color } of list) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const P = g.attributes.position, N = g.attributes.normal, K = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i));
      if (K) col.push(c.r * K.getX(i), c.g * K.getY(i), c.b * K.getZ(i)); else col.push(c.r, c.g, c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
};

// Striped deckchair canvas: faded teal and cream with a thin red pinstripe, a hem at each end.
function slingTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const bands = [[0x2f5f6b, 30], [0xeadfc4, 14], [0xb4503a, 5], [0xeadfc4, 14], [0x2f5f6b, 30], [0xeadfc4, 14], [0xb4503a, 5], [0xeadfc4, 14]];
  const total = bands.reduce((s, b) => s + b[1], 0);
  let x = 0;
  const n = 2;
  for (let k = 0; k < n; k++) for (const [col, w] of bands) { const ww = w / total * 256 / n; g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(x, 0, ww + 1, 512); x += ww; }
  // Weave: fine horizontal and vertical threads.
  const r = rng(5);
  for (let i = 0; i < 512; i += 2) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.06})`; g.fillRect(0, i, 256, 1); }
  for (let i = 0; i < 256; i += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(i, 0, 1, 512); }
  for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,30,20'},${0.04 + r() * 0.06})`; g.fillRect(r() * 256, r() * 512, 2 + r() * 3, 1); }
  // Hems and stitching.
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 256, 14); g.fillRect(0, 498, 256, 14);
  g.strokeStyle = 'rgba(240,235,220,0.8)'; g.setLineDash([6, 4]); g.lineWidth = 1.5;
  for (const y of [10, 502]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function build(ctx) {
  const { scene, batch, kit, lite } = ctx;
  const T = ctx.T;
  const add = (geo, mat, m, color, opts = {}) => batch.add(geo, mat, m, color, { cast: true, receive: true, ...opts });
  const rnd = rng(77);

  // ================================================================ 1 deckchair
  const root = T(CHAIR.x, fy, CHAIR.z, Math.PI + CHAIR.yaw);     // local forward (+z) points to the garden (-z)
  const C = CHAIR;
  const P = (lx, p) => [lx, p[1], p[0]];                          // chair coordinates (u, y) -> local (x, y, z)
  {
    const wood = (g, tint) => add(g, kit.wood, root, tint);
    const frame = 0xc29a62;
    for (const sx of [-1, 1]) {
      wood(bar(P(sx * C.railX, C.top), P(sx * C.railX, C.foot), 0.024, 0.04), frame);                       // main frame
      wood(bar(P(sx * C.seatX, [C.hinge[0] - 0.09, C.hinge[1] - 0.06]), P(sx * C.seatX, [C.front[0] + 0.01, C.front[1]]), 0.022, 0.034), 0xb98f58); // seat frame
      wood(bar(P(sx * C.legX, [C.front[0] - 0.03, C.front[1] + 0.03]), P(sx * C.legX, C.legFoot), 0.022, 0.036), 0xbf9560); // front legs
      // Brass-headed bolt at the hinge and a worn rubber foot.
      add(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 10).rotateZ(Math.PI / 2), kit.brass, T(sx * 0.262, C.hinge[1], C.hinge[0]).premultiply(root), 0xc9a24e, { cast: false });
    }
    // Cross rails: the head dowel the canvas wraps, the front dowel, and the rungs.
    const dow = (y, u, half, r, tint) => add(new THREE.CylinderGeometry(r, r, half * 2, 10).rotateZ(Math.PI / 2), kit.wood, T(0, y, u).premultiply(root), tint);
    dow(C.top[1] + 0.003, C.top[0] - 0.003, 0.258, 0.0155, 0xb88a52);
    dow(C.front[1], C.front[0], 0.236, 0.0155, 0xb88a52);
    dow(0.285, C.hinge[0] + 0.008, 0.26, 0.011, 0xa9804c);
    const onMain = (y) => C.top[0] + (C.foot[0] - C.top[0]) * (C.top[1] - y) / (C.top[1] - C.foot[1]);
    dow(0.56, onMain(0.56), 0.25, 0.012, 0xb48a54);
    dow(0.14, onMain(0.14), 0.25, 0.011, 0xb48a54);
    dow(0.17, 0.5, 0.275, 0.011, 0xbd935c);
    // Little rubber feet.
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.014, 0.016, 0.014, 8), kit.rubber, T(sx * C.railX, 0.007, C.foot[0]).premultiply(root), 0x2a2a28, { cast: false });
      add(new THREE.CylinderGeometry(0.014, 0.016, 0.014, 8), kit.rubber, T(sx * C.legX, 0.007, C.legFoot[0]).premultiply(root), 0x2a2a28, { cast: false });
    }
  }
  // The sling: a grid of vertices from the head dowel to the front dowel, sagging, flapping in the wash.
  const NS = 14, NW = 6;
  const slingGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array((NS + 1) * (NW + 1) * 3);
  const sUV = new Float32Array((NS + 1) * (NW + 1) * 2);
  const sIdx = [];
  for (let i = 0; i <= NS; i++) for (let j = 0; j <= NW; j++) {
    const k = i * (NW + 1) + j;
    sUV[k * 2] = j / NW; sUV[k * 2 + 1] = 1 - i / NS;
    if (i < NS && j < NW) { const a = k, b = k + 1, c = k + NW + 1, d = k + NW + 2; sIdx.push(a, c, b, b, c, d); }
  }
  slingGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  slingGeo.setAttribute('uv', new THREE.BufferAttribute(sUV, 2));
  slingGeo.setIndex(sIdx);
  const slingMat = new THREE.MeshStandardMaterial({ map: slingTexture(), roughness: 0.92, side: THREE.DoubleSide });
  const sling = new THREE.Mesh(slingGeo, slingMat);
  sling.castShadow = true; sling.receiveShadow = true;
  sling.matrixAutoUpdate = false; sling.matrix.copy(root); sling.matrixWorldNeedsUpdate = true; sling.frustumCulled = false;
  scene.add(sling);
  // Rest shape and chord normal in (u, y).
  const du = C.front[0] - C.top[0], dyc = C.front[1] - C.top[1], chord = Math.hypot(du, dyc);
  const nU = -dyc / chord, nY = du / chord;
  const halfW = C.slingW / 2;
  let slingAmp = 0, slingPh = 0, slingBias = 0, slingRest = false;
  function shapeSling(amp, ph, bias) {
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, env = Math.sin(Math.PI * s);
      for (let j = 0; j <= NW; j++) {
        const lx = (j / NW * 2 - 1) * halfW, e = lx / halfW;
        let u = C.top[0] + du * s, y = C.top[1] + dyc * s - (0.075 + 0.02 * (1 - e * e)) * env + 0.02 * e * e * env;
        // Flap: a travelling wave along the sling, stronger toward the free middle, plus edge flutter.
        const w = amp * env * (0.6 * Math.sin(ph * 1.0 + s * 7) + 0.4 * Math.sin(ph * 1.73 + e * 3.1 + s * 3)) * 0.075 * (1 + 0.6 * e * e);
        const off = w + bias * env;
        u += nU * off; y += nY * off;
        const k = (i * (NW + 1) + j) * 3;
        sPos[k] = lx; sPos[k + 1] = y; sPos[k + 2] = u;
      }
    }
    slingGeo.attributes.position.needsUpdate = true;
    slingGeo.computeVertexNormals();
    slingGeo.computeBoundingSphere();
  }
  shapeSling(0, 0, 0);

  // ================================================================ 2 boot scraper and doormat
  {
    const S = SCRAPER, iron = 0x24262a;
    const at = (x, y, z, ry = 0) => T(S.x + x, fy + y, S.z + z, ry);
    // Standards: a flat cast plate with a foot and a rolled scroll at the top.
    const sh = new THREE.Shape();
    sh.moveTo(-0.115, 0); sh.lineTo(0.115, 0); sh.lineTo(0.115, 0.022); sh.lineTo(0.032, 0.05); sh.lineTo(0.02, 0.2); sh.lineTo(0.03, 0.235);
    sh.lineTo(-0.03, 0.235); sh.lineTo(-0.02, 0.2); sh.lineTo(-0.032, 0.05); sh.lineTo(-0.115, 0.022); sh.closePath();
    const plate = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.0025, bevelSegments: 1 });
    plate.translate(0, 0, -0.008).rotateY(Math.PI / 2);                // profile in the z-y plane, thickness along x
    const scroll = new THREE.TorusGeometry(0.03, 0.0085, 6, 14, Math.PI * 1.6);
    for (const sx of [-1, 1]) {
      add(plate, kit.iron, at(sx * 0.15, 0.0, 0), iron);
      add(scroll.clone().rotateY(Math.PI / 2), kit.iron, at(sx * 0.15, 0.262, 0.0, 0), iron);
      add(new THREE.SphereGeometry(0.012, 8, 6), kit.iron, at(sx * 0.15, 0.239, 0.0), iron);
    }
    // The blade, a heavy flat bar with a worn edge, set between the standards.
    add(new THREE.BoxGeometry(0.29, 0.07, 0.009), kit.iron, at(0, 0.115, -0.045), 0x464a50);
    add(new THREE.BoxGeometry(0.29, 0.01, 0.026), kit.iron, at(0, 0.155, -0.045), 0x5a5e65);
    // Cross stays, and a coir brush bar at the back.
    add(new THREE.BoxGeometry(0.3, 0.016, 0.016), kit.iron, at(0, 0.05, 0.085), iron);
    add(new THREE.BoxGeometry(0.3, 0.014, 0.014), kit.iron, at(0, 0.05, -0.085), iron);
    add(new THREE.BoxGeometry(0.27, 0.052, 0.05), kit.fabric, at(0, 0.052, 0.03), 0x6e4e30);
    for (let i = 0; i < 18; i++) add(new THREE.BoxGeometry(0.012, 0.03, 0.044), kit.fabric, at(-0.12 + i * 0.0145 + rnd() * 0.004, 0.092 + rnd() * 0.01, 0.03), 0x7a5736 + (i % 3) * 0x050302, { cast: false });
    // Little cast-in rivet heads.
    for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.006, 6, 4), kit.iron, at(sx * 0.1, 0.17, -0.02), 0x4a4d52, { cast: false });
  }
  {
    // Coir doormat outside the back door: a woven bed with a darker border and rope-like ribs.
    const mx = 1.18, mz = -1.9, mw = 0.7, md = 0.42;
    const base = (w, d, h, y, tint, x = 0, z = 0) => add(new THREE.BoxGeometry(w, h, d), kit.fabric, T(mx + x, fy + y, mz + z), tint, { cast: false });
    base(mw, md, 0.016, 0.008, 0x4a3623);
    base(mw - 0.05, md - 0.05, 0.01, 0.019, 0x826140);
    // Fine coir ribs across the mat, barely different in tone, as in a real woven mat.
    const nr = 58;
    for (let i = 0; i < nr; i++) base(0.0085, md - 0.054, 0.004, 0.0255, i % 2 ? 0x8a6945 : 0x7b5b3a, -mw / 2 + 0.034 + i * ((mw - 0.068) / (nr - 1)), 0);
    // A darker woven band inside the border.
    for (const sz of [-1, 1]) base(mw - 0.1, 0.016, 0.0045, 0.0275, 0x5a4029, 0, sz * (md / 2 - 0.045));
    for (const sx of [-1, 1]) base(0.016, md - 0.1, 0.0045, 0.0275, 0x5a4029, sx * (mw / 2 - 0.045), 0);
  }

  // ================================================================ 3 herb trough
  {
    const Tr = TROUGH, paint = 0x62785a;
    const at = (x, y, z, ry = 0) => T(Tr.x + x, fy + y, Tr.z + z, ry);
    const board = (w, h, d, x, y, z, tint = paint) => add(ctx.boxUV(w, h, d, 3), kit.wood, at(x, y, z), tint);
    const ht = 0.03 + Tr.hy * 2;                                    // top edge
    board(Tr.hx * 2, 0.07, 0.018, 0, 0.03 + 0.036, Tr.hz - 0.009);   // front (two boards)
    board(Tr.hx * 2, 0.07, 0.018, 0, 0.03 + 0.114, Tr.hz - 0.009);
    board(Tr.hx * 2, 0.07, 0.018, 0, 0.03 + 0.036, -Tr.hz + 0.009);
    board(Tr.hx * 2, 0.07, 0.018, 0, 0.03 + 0.114, -Tr.hz + 0.009);
    for (const sx of [-1, 1]) board(0.02, Tr.hy * 2, Tr.hz * 2, sx * (Tr.hx - 0.01), 0.03 + Tr.hy, 0);
    board(Tr.hx * 2 - 0.02, 0.014, Tr.hz * 2, 0, 0.034, 0, 0x4f6049);
    for (const sx of [-1, 0, 1]) add(ctx.boxUV(0.03, 0.04, Tr.hz * 2 + 0.02, 3), kit.wood, at(sx * (Tr.hx - 0.045), 0.02, 0), 0x56694e);  // feet
    // A top rail all round, and little iron corner brackets.
    board(Tr.hx * 2 + 0.014, 0.012, 0.022, 0, ht + 0.004, Tr.hz - 0.002, 0x70876a);
    board(Tr.hx * 2 + 0.014, 0.012, 0.022, 0, ht + 0.004, -Tr.hz + 0.002, 0x70876a);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.05, 0.004), kit.iron, at(sx * (Tr.hx - 0.002), 0.03 + Tr.hy, sz * (Tr.hz + 0.0)), 0x2c2d2f, { cast: false });
    // Soil, with a few stones and the odd weed.
    const soilTop = fy + 0.03 + Tr.hy * 2 - 0.022;
    add(ctx.boxUV(Tr.hx * 2 - 0.04, 0.03, Tr.hz * 2 - 0.04, 6), kit.soil, T(Tr.x, soilTop - 0.015, Tr.z), 0x40301f, { cast: false });
    // Plants: swaying foliage. Leaves bend with height above the soil.
    const lf = ctx.sway(kit.leaf, { baseY: soilTop, height: 0.22, amount: 1.4 });
    const pt = ctx.sway(kit.petal, { baseY: soilTop, height: 0.22, amount: 1.4 });
    const gr = (c, v = 0.12) => new THREE.Color(c).offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * v, (rnd() - 0.5) * v).getHex();
    const sy = soilTop;
    const place = (g, mat, x, y, z, ry, rx, rz, col, sc = 1) => add(g, mat, T(Tr.x + x, y, Tr.z + z, ry, rx, rz, sc, sc, sc), col, { cast: false });
    // Chives: a tuft of hollow green blades with a few round mauve flowers.
    {
      const cx = -0.225, blade = new THREE.CylinderGeometry(0.0014, 0.0034, 0.2, 4, 1).translate(0, 0.1, 0);
      const n = lite ? 22 : 40;
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.035, tilt = 0.08 + rnd() * 0.32, len = 0.5 + rnd() * 0.55;
        place(blade, lf, cx + Math.cos(a) * r, sy, Math.sin(a) * r * 0.9, a, tilt, 0, gr(0x4e8035), len);
      }
      for (let k = 0; k < 4; k++) {
        const a = rnd() * 6.28, r = 0.012 + rnd() * 0.025, h = 0.12 + rnd() * 0.05;
        place(new THREE.CylinderGeometry(0.0016, 0.0022, h, 4).translate(0, h / 2, 0), lf, cx + Math.cos(a) * r, sy, Math.sin(a) * r, 0, 0.06, 0, 0x5c8b3b);
        place(new THREE.IcosahedronGeometry(0.0125, 1), pt, cx + Math.cos(a) * r, sy + h + 0.004, Math.sin(a) * r, 0, 0, 0, gr(0xa163b8, 0.2));
      }
    }
    // Mint: spreading stems with pairs of toothed oval leaves.
    {
      const cx = -0.085, leaf = new THREE.SphereGeometry(0.0175, 7, 5).scale(1, 0.14, 1.45);
      const n = lite ? 42 : 80;
      for (let i = 0; i < n; i++) {
        const h = 0.01 + Math.pow(rnd(), 0.8) * 0.1, a = rnd() * 6.28, r = Math.sqrt(rnd()) * (0.04 + 0.05 * (1 - h / 0.11));
        place(leaf, lf, cx + Math.cos(a) * r, sy + h, Math.sin(a) * r * 0.85, rnd() * 6.28, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.7, gr(0x3b7f38, 0.2), 0.8 + rnd() * 0.5);
      }
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; place(new THREE.CylinderGeometry(0.0011, 0.0015, 0.1, 4).translate(0, 0.05, 0), lf, cx + Math.cos(a) * 0.02, sy, Math.sin(a) * 0.02, 0, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0x5a7a3c); }
    }
    // Curly parsley: dense low rosettes of frilly leaflets.
    {
      const cx = 0.065, leaflet = new THREE.IcosahedronGeometry(0.011, 0).scale(1, 0.55, 1);
      const n = lite ? 40 : 90;
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.052, h = 0.012 + (1 - r / 0.052) * 0.05 + rnd() * 0.025;
        place(leaflet, lf, cx + Math.cos(a) * r, sy + h, Math.sin(a) * r * 0.9, rnd() * 6.28, rnd() * 0.5, rnd() * 0.5, gr(0x2a6a28, 0.18), 0.8 + rnd() * 0.7);
      }
    }
    // Rosemary: a woody little bush of needle leaves.
    {
      const cx = 0.215, needle = new THREE.ConeGeometry(0.0021, 0.05, 3).translate(0, 0.025, 0);
      const n = lite ? 70 : 150;
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, up = rnd(), r = 0.012 + up * 0.04 * (0.55 + 0.45 * rnd()), tilt = 0.3 + up * 0.9 + rnd() * 0.3;
        place(needle, lf, cx + Math.cos(a) * r * 0.6, sy + 0.03 + (1 - up) * 0.09 + rnd() * 0.03, Math.sin(a) * r * 0.55, a, tilt, 0, gr(0x566f4a, 0.2), 0.8 + rnd() * 0.6);
      }
      for (let k = 0; k < 3; k++) place(new THREE.CylinderGeometry(0.003, 0.004, 0.09, 5).translate(0, 0.045, 0), lf, cx + (k - 1) * 0.015, sy, (rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.3, (k - 1) * 0.2, 0x5b4630);
      for (let k = 0; k < 6; k++) { const a = rnd() * 6.28; place(new THREE.SphereGeometry(0.005, 5, 4), pt, cx + Math.cos(a) * 0.028, sy + 0.1 + rnd() * 0.035, Math.sin(a) * 0.026, 0, 0, 0, 0x8fa6e0); }
    }
    // Thyme spilling over the front-left edge.
    {
      const cx = -0.1, tiny = new THREE.IcosahedronGeometry(0.0065, 0).scale(1, 0.7, 1);
      const n = lite ? 22 : 46;
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.04;
        place(tiny, lf, cx + 0.34 * 0 + Math.cos(a) * r * 0.9 + 0.0, sy + 0.006 + rnd() * 0.02, 0.045 + Math.sin(a) * r * 0.5, rnd() * 6, 0, 0, gr(0x6f8a5b, 0.2), 0.8 + rnd() * 0.6);
      }
    }
  }

  // ================================================================ 4 wellies and 5 yard broom (loose bodies)
  const dynMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
  // Wellington boot: a lofted shell (shaft, ankle, foot) with a sole, a heel and a dark opening.
  function wellyGeometry() {
    const ctrl = [ // [y, z, half-width, half-depth, squareness]
      [0.378, 0.0, 0.066, 0.063, 1.0], [0.33, 0.0, 0.059, 0.057, 1.0], [0.25, 0.0, 0.054, 0.052, 1.0], [0.17, 0.004, 0.054, 0.054, 1.0],
      [0.11, 0.024, 0.058, 0.058, 0.9], [0.075, 0.075, 0.058, 0.05, 0.75], [0.055, 0.135, 0.054, 0.039, 0.62], [0.044, 0.195, 0.046, 0.03, 0.62], [0.037, 0.229, 0.027, 0.017, 0.85], [0.033, 0.243, 0.004, 0.003, 1.0],
    ];
    const pts = ctrl.map((c) => new THREE.Vector3(0, c[0], c[1]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const R = 26, S = 20;
    const pos = [], idx = [], col = [], nor = [];
    const green = new THREE.Color(0x1d4a2a), sole = new THREE.Color(0x1a1a18), rim = new THREE.Color(0x2c6a3c);
    for (let i = 0; i <= R; i++) {
      const t = i / R, p = curve.getPoint(t), tan = curve.getTangent(t);
      const f = t * (ctrl.length - 1), k = Math.min(ctrl.length - 2, Math.floor(f)), u = f - k, A = ctrl[k], B = ctrl[k + 1];
      const lerp = (n) => A[n] + (B[n] - A[n]) * u;
      const wx = lerp(2), rn = lerp(3), sq = lerp(4);
      const nrm = new THREE.Vector3(0, -tan.z, tan.y).normalize();
      const wrinkle = 1 + 0.03 * Math.exp(-Math.pow((p.y - 0.14) / 0.04, 2)) * Math.sin(p.y * 160) + (i === 0 ? 0.012 : 0);
      for (let j = 0; j <= S; j++) {
        const a = j / S * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const e = 1 - (1 - sq) * 1.2;                 // superellipse exponent: 1 is round, smaller is boxier (the foot)
        const cx = Math.sign(ca) * Math.pow(Math.abs(ca), e), cy = Math.sign(sa) * Math.pow(Math.abs(sa), e);
        const q2 = new THREE.Vector3(wx * cx * wrinkle, 0, 0).addScaledVector(nrm, rn * cy * wrinkle).add(p);
        pos.push(q2.x, q2.y, q2.z);
        const c = new THREE.Color().copy(green).lerp(sole, Math.max(0, 1 - q2.y / 0.05) * 0.0).lerp(rim, i === 0 ? 1 : 0).multiplyScalar(0.92 + 0.1 * Math.sin(j * 1.7 + i));
        col.push(c.r, c.g, c.b);
        nor.push(0, 1, 0);
      }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) {
      const a = i * (S + 1) + j, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    // Toe cap.
    const last = R * (S + 1), tip = pos.length / 3, tp = curve.getPoint(1);
    pos.push(tp.x + 0.0, tp.y, tp.z + 0.004); col.push(0.11, 0.29, 0.16); nor.push(0, 0, 1);
    for (let j = 0; j < S; j++) idx.push(last + j + 1, last + j, tip);
    // Dark opening a little below the rim.
    const mouth = pos.length / 3;
    pos.push(0, 0.346, 0); col.push(0.03, 0.05, 0.04); nor.push(0, 1, 0);
    for (let j = 0; j < S; j++) idx.push(j, j + 1, mouth);
    const body = new THREE.BufferGeometry();
    body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    body.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    body.setIndex(idx);
    body.computeVertexNormals();
    const parts = [{ geo: body, color: 0xffffff }];
    // Sole: a flat outline extruded, and a heel block.
    const so = new THREE.Shape();
    so.moveTo(-0.056, 0.0); so.lineTo(0.056, 0.0); so.lineTo(0.064, 0.12); so.quadraticCurveTo(0.078, 0.24, 0.04, 0.3); so.quadraticCurveTo(0, 0.325, -0.04, 0.3);
    so.quadraticCurveTo(-0.078, 0.24, -0.064, 0.12); so.closePath();
    // rotateX(+90) maps the outline's y to +z and the extrusion to -y; shifted so the underside is y = 0 and the heel at z = -0.075
    parts.push({ geo: new THREE.ExtrudeGeometry(so, { depth: 0.017, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 }).rotateX(Math.PI / 2).translate(0, 0.02, -0.075), color: 0x1b1b19 });
    const g = merge(parts);
    g.translate(-BOOT_C.x, -BOOT_C.y, -BOOT_C.z);
    return g;
  }
  const nW = lite ? 1 : WELLIES.length;
  const wellyGeo = wellyGeometry();
  const wellies = new THREE.InstancedMesh(wellyGeo, dynMat, nW);
  wellies.castShadow = true; wellies.receiveShadow = true; wellies.frustumCulled = false;
  scene.add(wellies);

  function broomGeometry() {
    const B = BROOM, o = -B.com, parts = [];
    const bb = (geo, y, tint) => parts.push({ geo: geo.translate(0, o + y, 0), color: tint });
    // Handle: a turned ash pole, a little tapered, a hanging hole at the top and a loop of twine.
    bb(new THREE.CylinderGeometry(B.handleR * 0.92, B.handleR, B.length - 0.1, 10).translate(0, (B.length + 0.1) / 2, 0), 0, 0xb8905a);
    bb(new THREE.TorusGeometry(0.012, 0.0022, 5, 10).rotateY(Math.PI / 2).translate(0, B.length - 0.06, 0.0), 0, 0x6d5434);
    // Stock: the wooden block the bristles are set in, with the handle socket.
    bb(new THREE.BoxGeometry(0.3, 0.03, 0.05), 0.135, 0xa87c46);
    bb(new THREE.CylinderGeometry(0.014, 0.02, 0.05, 8), 0.17, 0x9b7440);
    // Bristles: many splayed tufts of stiff palmyra-style fibre, ragged at the ends.
    const rr = rng(31);
    const tuft = new THREE.CylinderGeometry(0.011, 0.0075, 1, 4);
    const n = 52;
    for (let i = 0; i < n; i++) {
      const x = ((i + rr() * 0.6) / n - 0.5) * 0.292, z = (rr() - 0.5) * 0.04, h = 0.115 + rr() * 0.015, splay = x / 0.15 * 0.1;
      const g = tuft.clone().scale(1, h, 1).translate(0, h / 2, 0).rotateZ(-splay).rotateX((z / 0.025) * 0.08).translate(x, 0.0, z);
      const shade = 0.82 + rr() * 0.25;
      parts.push({ geo: g.translate(0, o + 0.0, 0), color: new THREE.Color(0xc9a359).multiplyScalar(shade).getHex() });
    }
    // Binding wire round the bristle neck.
    bb(new THREE.BoxGeometry(0.304, 0.006, 0.054), 0.12, 0x3b3c3e);
    bb(new THREE.BoxGeometry(0.304, 0.004, 0.054), 0.098, 0x3b3c3e);
    return merge(parts);
  }
  const broomGeo = broomGeometry();
  const broom = new THREE.Mesh(broomGeo, dynMat);
  broom.castShadow = true; broom.receiveShadow = true; broom.frustumCulled = false;
  scene.add(broom);

  // Knocks: rubber thud and the wooden clatter of the broom.
  registerExtraSound('pBoot', (audio, e, now) => {
    if (now - (audio._bootT || 0) < 0.07) return;
    audio._bootT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos);
    audio.tone({ freq: 150 + Math.random() * 40, to: 90, type: 'sine', gain: 0.07 + 0.12 * s, attack: 0.002, decay: 0.09, out: o });
    audio.noiseBurst({ freq: 700, q: 0.8, gain: 0.03 + 0.06 * s, decay: 0.05, out: o });
  });
  registerExtraSound('pBroom', (audio, e, now) => {
    if (now - (audio._broomT || 0) < 0.05) return;
    audio._broomT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos);
    const f = 380 + Math.random() * 120;
    audio.tone({ freq: f, to: f * 0.8, type: 'triangle', gain: 0.04 + 0.1 * s, attack: 0.001, decay: 0.12, out: o });
    audio.noiseBurst({ freq: 2200, q: 0.9, gain: 0.03 + 0.06 * s, decay: 0.09, out: o });
  });

  // ================================================================ 6 storm lantern
  const L = LANTERN_AT;
  {
    const green = 0x234638, base = (g, mat, y, tint, o = {}) => add(g, mat, T(L.x, fy + y, L.z), tint, o);
    base(new THREE.CylinderGeometry(0.05, 0.056, 0.016, 20), kit.enamel, 0.008, green);
    base(new THREE.CylinderGeometry(0.044, 0.05, 0.036, 20), kit.enamel, 0.034, green);          // fount
    base(new THREE.TorusGeometry(0.0475, 0.004, 6, 20).rotateX(Math.PI / 2), kit.brass, 0.052, 0xb48a3c);
    base(new THREE.CylinderGeometry(0.03, 0.036, 0.008, 16), kit.brass, 0.06, 0xb48a3c);
    base(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 8), kit.brass, 0.066, 0xb48a3c);       // wick holder
    base(new THREE.BoxGeometry(0.02, 0.012, 0.0025), kit.fabric, 0.075, 0xe8e0c8, { cast: false });
    // Globe: a clear glass chimney, wider in the middle, with a bead at each end.
    const prof = [[0.031, 0], [0.036, 0.012], [0.041, 0.04], [0.038, 0.08], [0.027, 0.115], [0.021, 0.14], [0.02, 0.18]].map((p) => new THREE.Vector2(p[0], p[1]));
    base(new THREE.LatheGeometry(prof, 20), kit.glass, 0.066, 0xe6f0ee, { cast: false });
    // Top: a cap with a pierced dome and a vent chimney.
    base(new THREE.CylinderGeometry(0.0225, 0.025, 0.012, 16), kit.enamel, 0.252, green);
    base(new THREE.SphereGeometry(0.034, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), kit.enamel, 0.258, green);
    base(new THREE.CylinderGeometry(0.009, 0.014, 0.022, 10), kit.enamel, 0.285, green);
    base(new THREE.CylinderGeometry(0.016, 0.01, 0.008, 10), kit.enamel, 0.298, green);
    // Cage wires, a carrying hoop and its pivots.
    for (const a of [0.4, 0.4 + Math.PI]) {
      const x = Math.cos(a) * 0.043, z = Math.sin(a) * 0.043;
      add(rod([0, 0, 0], [0, 0.19, 0], 0.0022, 5), kit.iron, T(L.x + x, fy + 0.062, L.z + z), 0x2a2b2d, { cast: false });
    }
    add(new THREE.TorusGeometry(0.046, 0.0028, 5, 22, Math.PI).rotateZ(0), kit.iron, T(L.x, fy + 0.252, L.z, -0.4), 0x2a2b2d, { cast: false });
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb64a, transparent: true, opacity: 0.92, depthWrite: false });
  const flameGeo = new THREE.LatheGeometry([[0.0, 0.0], [0.0042, 0.003], [0.0068, 0.011], [0.0062, 0.022], [0.0036, 0.032], [0.0, 0.043]].map((p) => new THREE.Vector2(p[0], p[1])), 8);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  const flameBase = new THREE.Vector3(L.x, fy + 0.0766, L.z);
  flame.position.copy(flameBase);
  scene.add(flame);

  // ================================================================ per-frame
  const sim = ctx.sim;
  const air = new THREE.Vector3(), air2 = new THREE.Vector3(), probe = new THREE.Vector3();
  const chairMid = new THREE.Vector3(C.x, fy + 0.4, C.z);
  const nearArea = (cx, cz, r) => {
    const A = sim && sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(cx - wk.hub.x) < r && Math.abs(cz - wk.hub.z) < r) return true;
      if (wk.vg && Math.abs(cx - wk.hit.x) < r && Math.abs(cz - wk.hit.z) < r) return true;
    }
    return false;
  };
  // Dynamic bodies.
  const mod = () => (sim && sim.extras && sim.extras.mods && sim.extras.mods.patio) || null;
  const lastP = [], lastQ = [];
  const _p = new THREE.Vector3(), _q2 = new THREE.Quaternion();
  const posedAt = [];
  let clock = 0;
  WELLIES.slice(0, nW).forEach((w, i) => {
    lastP[i] = new THREE.Vector3(1e9, 0, 0); lastQ[i] = new THREE.Quaternion(); posedAt[i] = -1;
    ctx.replayProxy(w.id, (o) => { posedAt[i] = clock; wellies.setMatrixAt(i, _m.compose(o.position, o.quaternion, _one)); wellies.instanceMatrix.needsUpdate = true; });
  });
  let broomPosed = -1;
  const lastBP = new THREE.Vector3(1e9, 0, 0), lastBQ = new THREE.Quaternion();
  ctx.replayProxy('pbroom', (o) => { broomPosed = clock; broom.position.copy(o.position); broom.quaternion.copy(o.quaternion); });
  // Initial placement from the sim's home poses.
  {
    const M = mod();
    if (M) for (const t of M.things) {
      if (t.def.id === 'pbroom') { broom.position.set(t.def.p.x, t.def.p.y, t.def.p.z); broom.quaternion.set(t.def.q.x, t.def.q.y, t.def.q.z, t.def.q.w); }
      else { const i = WELLIES.findIndex((w) => w.id === t.def.id); if (i >= 0 && i < nW) wellies.setMatrixAt(i, _m.compose(_p.set(t.def.p.x, t.def.p.y, t.def.p.z), _q2.set(t.def.q.x, t.def.q.y, t.def.q.z, t.def.q.w), _one)); }
    }
    wellies.instanceMatrix.needsUpdate = true;
  }
  // Flame state.
  let lit = true, relight = 0, strain = 0, fl = 0, ft = 0;

  return {
    update(dt) {
      clock += dt;
      ft += dt;
      const M = mod();
      // Dynamic bodies follow the physics (skipped while the replay poses them, and while at rest).
      if (M) {
        let dirty = false;
        for (const t of M.things) {
          if (t.def.id === 'pbroom') {
            if (clock - broomPosed < 0.25) continue;
            t.track.sample(1, _p, _q2);
            if (_p.distanceToSquared(lastBP) < 1e-12 && Math.abs(_q2.dot(lastBQ)) > 0.9999999) continue;
            lastBP.copy(_p); lastBQ.copy(_q2);
            broom.position.copy(_p); broom.quaternion.copy(_q2);
          } else {
            const i = WELLIES.findIndex((w) => w.id === t.def.id);
            if (i < 0 || i >= nW || clock - posedAt[i] < 0.25) continue;
            t.track.sample(1, _p, _q2);
            if (_p.distanceToSquared(lastP[i]) < 1e-12 && Math.abs(_q2.dot(lastQ[i])) > 0.9999999) continue;
            lastP[i].copy(_p); lastQ[i].copy(_q2);
            wellies.setMatrixAt(i, _m.compose(_p, _q2, _one));
            dirty = true;
          }
        }
        if (dirty) { wellies.instanceMatrix.needsUpdate = true; }
      }
      // Deckchair sling: only worked while a rotor is close; settles back to rest after.
      const nearChair = nearArea(C.x, C.z, 1.4);
      if (nearChair || slingAmp > 0.004) {
        probe.set(C.x, fy + 0.45, C.z);
        ctx.airAt(probe, air);
        const sp = air.length() * 2.4;                      // outwash is thin at the sample point: a gain stands in for the gusts
        const target = Math.min(1.2, sp / 2.2);
        slingAmp += (target - slingAmp) * Math.min(1, dt * (target > slingAmp ? 6 : 1.6));
        slingPh += dt * (6 + 14 * slingAmp);
        const b = THREE.MathUtils.clamp((air.y * nY - air.z * nU) * 0.02, -0.07, 0.07);   // push along the sling's normal
        slingBias += (b - slingBias) * Math.min(1, dt * 8);
        shapeSling(slingAmp, slingPh, slingBias);
        slingRest = false;
      } else if (!slingRest) { shapeSling(0, 0, 0); slingRest = true; }
      void chairMid;
      // Storm lantern flame.
      const nearL = nearArea(L.x, L.z, 1.4);
      air.set(0, 0, 0);
      if (nearL) {
        // The rotor's column is narrow: sample the air round the lantern's top and keep the strongest.
        let best = -1;
        for (let k = 0; k < 5; k++) {
          probe.set(L.x + (k === 1 ? 0.05 : k === 2 ? -0.05 : 0), fy + 0.33, L.z + (k === 3 ? 0.05 : k === 4 ? -0.05 : 0));
          ctx.airAt(probe, air2);
          const m2 = air2.lengthSq();
          if (m2 > best) { best = m2; air.copy(air2); }
        }
      }
      const wind = Math.hypot(air.x, air.z) + Math.max(0, -air.y) * 0.6;
      if (lit) {
        strain = wind > 1.5 ? strain + dt : Math.max(0, strain - dt * 0.8);
        if (strain > 0.28) { lit = false; relight = 4 + Math.random() * 3; flame.visible = false; }
      } else {
        relight -= dt;
        if (relight <= 0 && wind < 1.2) { lit = true; strain = 0; flame.visible = true; }
      }
      if (lit) {
        const f1 = Math.sin(ft * 17.3) * 0.5 + Math.sin(ft * 29.1 + 1.3) * 0.3 + Math.sin(ft * 7.1) * 0.2;
        fl += (f1 - fl) * Math.min(1, dt * 20);
        const k = 1 + 0.08 * fl + Math.min(0.5, wind * 0.15) * Math.abs(fl);
        const lean = Math.min(0.9, wind * 0.22);
        flame.scale.set(1 + 0.1 * Math.abs(fl) * 0, k * (1 - 0.15 * lean), 1);
        flame.rotation.set(air.z * lean * 0.8 + fl * 0.04, 0, -air.x * lean * 0.8 + fl * 0.05);
        flameMat.opacity = 0.82 + 0.12 * fl;
      }
    },
  };
}
void WALL_Z;
