import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildHouse, windowAt, buildHedge, leafCards, taperTube, mulberry } from '../kit.js';
import { FY, BACK_LINE, FRONT_LINE } from '../../../sim/world/plan.js';
import * as L from '../../../sim/world/left.js';
import { placeChair } from '../../chairs.js';

// Draws the 'left' area (AREAS.left in src/sim/world/plan.js; colliders in src/sim/world/left.js): the two
// neighbours' houses and gardens, the strip beyond the old wall and our own left side passage.
// Every solid in L.SOLIDS and L.FOLIAGE is drawn from the same numbers the colliders use; this file adds the
// look: houses, boards, bricks, leaves, flowers, water and the few things that move (fountain, ripples, koi,
// butterflies; all cheap, and asleep unless the camera is near).
const Y = (h) => FY + h;
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const rad = (d) => d * Math.PI / 180;
const col = new THREE.Color();
const jit = (hex, rnd, amt = 0.05) => { col.setHex(hex); col.offsetHSL((rnd() - 0.5) * amt * 0.4, (rnd() - 0.5) * amt * 1.6, (rnd() - 0.5) * amt * 2); return col.getHex(); };
const matrixOf = (x, y, z, rot, ry = 0, sx = 1, sy = 1, sz = 1) => {
  if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')); else _q.setFromAxisAngle(UP, ry);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
};
// A matrix standing a y-axis shape between two points.
const between = (a, b) => {
  _w.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _w.length();
  _q.setFromUnitVectors(UP, _w.normalize());
  return { len, m: new THREE.Matrix4().compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(1, 1, 1)) };
};

// A curved, double-sided strap (a leaf blade, a palm frond, an iris): length len along +y from the origin, width
// wid, arching over by bend radians; tipped to a point.
function blade(len, wid, bend = 0.6, segs = 4, round = 0) {
  const pos = [], idx = [];
  let y = 0, z = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = bend * t;
    if (i > 0) { y += Math.cos(bend * (i - 0.5) / segs) * len / segs; z += Math.sin(bend * (i - 0.5) / segs) * len / segs; }
    const w = wid * 0.5 * (round ? Math.sin(Math.PI * (0.12 + 0.88 * t)) : (1 - t * 0.92)) * Math.cos(a * 0.1);
    pos.push(-w, y, z, w, y, z);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i <= segs; i++) uv.push(0, i / segs, 1, i / segs);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// A simple pointed oval leaf in the xz plane (pointing +z), flat.
function oval(len, wid, up = 0) {
  const p = [0, 0, 0, -wid * 0.5, up * len * 0.3, len * 0.35, wid * 0.5, up * len * 0.3, len * 0.35, -wid * 0.3, up * len * 0.7, len * 0.75, wid * 0.3, up * len * 0.7, len * 0.75, 0, up * len, len];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 0.35, 1, 0.35, 0.2, 0.75, 0.8, 0.75, 0.5, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5].map((i) => i)); g.computeVertexNormals();
  return g;
}
// Accumulate transformed geometries and flush them as one mesh per tint.
class Parts {
  constructor() { this.list = []; }
  add(geo, m) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); this.list.push(g); return this; }
  merged() { if (!this.list.length) return null; const g = mergeGeometries(this.list, false); this.list.forEach((x) => x.dispose()); this.list = []; return g; }
}

let netTexture = null;
function netMaterial() {
  if (netTexture) return netTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.moveTo(0, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  netTexture = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 });
  netTexture.name = 'left-net';
  return netTexture;
}

export function build(ctx) {
  const k = ctx.kit, wk = ctx.wk, G = ctx.ground, T = ctx.T, boxUV = ctx.boxUV, planeUV = ctx.planeUV;
  const rnd = mulberry(20260417);
  const net = netMaterial();
  const M = (key) => (typeof key !== 'string' ? key : key === 'net' ? net : (k[key] || wk[key] || k.paint));
  const add = (geo, key, m, c = 0xffffff, lod = 1) => ctx.add(geo, M(key), m, c, lod);
  const gy = ctx.groundY;
  void gy;

  paintGround(ctx);
  houses(ctx, { add, M, rnd });
  solids(ctx, { add, M, rnd });
  chairs(ctx, { add });
  runs(ctx, { add });
  foliage(ctx, { add, M, rnd });
  gardenDetail(ctx, { add, M, rnd });
  animated(ctx, { add, M, rnd });
  void T; void boxUV; void planeUV; void k; void wk;
}

// ------------------------------------------------------------------ the ground
function paintGround(ctx) {
  const G = ctx.ground;
  // p-1: kept lawn with mowing stripes; p-2: rough meadow with worn paths; the strip: weeds and earth.
  G.rect(-10.6, BACK_LINE, -3.4, FRONT_LINE, { type: 'grass', color: '#667d38' });
  for (let x = -10.5, i = 0; x < -3.5; x += 0.45, i++) if (i % 2 === 0) G.rect(x, -6.3, Math.min(x + 0.45, -3.5), 2.4, { type: 'grass', color: '#738d44' });
  G.rect(-17.8, BACK_LINE, -10.6, FRONT_LINE, { type: 'meadow', color: '#6b7234' });
  for (const [x, z, r] of [[-12.6, -2.1, 1.0], [-15.7, -1.8, 0.9], [-14.6, -5.0, 1.2], [-11.7, -0.3, 0.9], [-17.0, 2.3, 1.1], [-13.0, 4.2, 1.4], [-15.5, 5.2, 1.2]]) G.circle(x, z, r, { type: 'meadow', color: '#5b6a2c', alpha: 0.75 });
  G.rect(-19.5, BACK_LINE, -17.8, FRONT_LINE, { type: 'meadow', color: '#686f33' });
  G.path([[-18.6, -6.0], [-18.4, 0], [-18.5, 8]], 0.7, { type: 'dirt', color: '#7a664d', alpha: 0.6 });
  // Worn earth paths in p-2: hole to the lean-to, lean-to to the caravan door, caravan to the wall gap.
  G.path([[-10.7, -1.15], [-11.4, -1.0], [-12.4, -1.0], [-13.2, -1.1]], 0.55, { type: 'dirt', color: '#7d694f', alpha: 0.6 });
  G.path([[-14.1, 0.7], [-14.2, -0.9], [-15.2, -2.0], [-15.5, -2.8]], 0.55, { type: 'dirt', color: '#7d694f', alpha: 0.55 });
  G.path([[-15.4, -1.9], [-16.7, -2.15], [-18.2, -2.15]], 0.5, { type: 'dirt', color: '#7d694f', alpha: 0.55 });
  // Our left side passage: paving slabs.
  G.rect(L.PASSAGE.x0, L.PASSAGE.z0, L.PASSAGE.x1, L.PASSAGE.z1, { type: 'paving', color: '#a39f94', lines: 0.6 });
  // Side passages by the houses: concrete, gravel, concrete.
  G.rect(-10.6, 2.4, -9.7, FRONT_LINE, { type: 'paving', color: '#9d998e', lines: 0.9 });
  G.rect(-4.7, 2.4, -3.4, FRONT_LINE, { type: 'paving', color: '#a39f94', lines: 0.6 });
  G.rect(-17.8, 2.7, -17.0, FRONT_LINE, { type: 'gravel', color: '#9a8f7a' });
  G.rect(-11.4, 2.7, -10.6, FRONT_LINE, { type: 'paving', color: '#8f8b80', lines: 0.9 });
  // p-1: the patio (sandstone paving), a gravel path from the back gate to the greenhouse, stepping stones.
  G.rect(L.PATIO1.x0, L.PATIO1.z0, L.PATIO1.x1, 2.4, { type: 'paving', color: '#b2a58d', lines: 0.45 });
  G.rect(-6.0, 2.4 - 0.1, L.PATIO1.x0, 2.4, { type: 'paving', color: '#b2a58d', lines: 0.45 });
  G.rect(L.CONS.x0, L.CONS.zF, L.CONS.x1, L.CONS.zB, { type: 'paving', color: '#a86a4a', lines: 0.3 });
  G.path([[-6.6, -6.35], [-6.6, -5.4], [-7.4, -5.0], [-8.2, -5.0]], 0.8, { type: 'gravel', color: '#b4a88e' });
  G.rect(-7.95, -5.35, -7.2, -4.65, { type: 'paving', color: '#a9a398', lines: 0.4 });
  const steps = [[-7.2, -0.9], [-7.55, -1.5], [-7.2, -2.1], [-6.6, -1.4]];
  void steps;
  for (const [x, z] of [[-8.2, -0.3], [-7.6, -0.9], [-7.3, -1.55], [-7.35, -2.2]]) G.circle(x, z, 0.2, { type: 'paving', color: '#a6a193' });
  // Beds: along the fences, round the pond and the rockery, under the greenhouse and the tomato pots.
  for (const [x0, z0, x1, z1] of [[-3.95, -5.9, -3.45, -3.2], [-3.95, 0.3, -3.45, 2.0], [-10.55, -3.3, -10.0, -0.6], [-10.5, -0.7, -9.7, 1.9], [-10.3, -6.0, -7.8, -5.0], [-7.85, -6.0, -3.5, -5.95]]) G.rect(x0, z0, x1, z1, { type: 'soil', color: '#4a3a2b' });
  G.circle(L.POND1.x, L.POND1.z, 1.1, { type: 'soil', color: '#6d6a5a', alpha: 0.65 });
  G.circle(L.POND2.x, L.POND2.z, 1.25, { type: 'soil', color: '#4a4a35', alpha: 0.8 });
  G.rect(-15.0, -1.4, -12.8, 0.5, { type: 'dirt', color: '#72604a', alpha: 0.3 });
  // The greenhouse floor, the caravan's shadow-dark grass and the trampoline's circle of tired grass.
  G.rect(L.GH.x0, L.GH.z0, L.GH.x1, L.GH.z1, { type: 'paving', color: '#8f8a7e', lines: 0.4 });
  G.circle(L.TRAMP.x, L.TRAMP.z, 1.35, { type: 'grass', color: '#566f30', alpha: 0.7 });
  G.circle(L.ROT.x, L.ROT.z, 0.2, { type: 'paving', color: '#8a867b' });
  // Shadows of the big things (the houses, hedges and trees paint their own).
  G.shadowRect(L.CARAVAN.x0, L.CARAVAN.z0, L.CARAVAN.x1, L.CARAVAN.z1, 2.4, 0.45);
  G.shadowRect(L.GH.x0, L.GH.z0, L.GH.x1, L.GH.z1, 1.8, 0.28);
  G.shadowRect(L.CONS.x0, L.CONS.zF, L.CONS.x1, L.CONS.zB, 2.8, 0.34);
  G.shadowCircle(L.TRAMP.x, L.TRAMP.z, 1.25, 0.85, 0.34);
  G.shadowRect(L.SWING.cx - 1.05, L.SWING.cz - 0.7, L.SWING.cx + 1.05, L.SWING.cz + 0.7, 2.0, 0.34);
  G.shadowCircle(L.ROT.x, L.ROT.z, 1.0, 1.5, 0.2);
  G.shadowRect(L.LEANTO.x0, L.LEANTO.z0, L.LEANTO.x1, L.LEANTO.z1, 2.3, 0.36);
  G.shadowRect(-3.45, -1.62, -3.35, FRONT_LINE, 1.8, 0.3);
  G.shadowRect(-10.65, BACK_LINE, -10.55, FRONT_LINE, 1.8, 0.3);
  G.shadowRect(-10.6, BACK_LINE - 0.05, -3.4, BACK_LINE + 0.05, 1.8, 0.3);
  G.shadowRect(-17.9, BACK_LINE, -17.7, FRONT_LINE, 1.9, 0.34);
  G.shadowRect(-19.5, BACK_LINE, -18.9, FRONT_LINE, 2.6, 0.3);
  G.shadowRect(-19.4, BACK_LINE, -10.6, BACK_LINE + 0.9, 2.4, 0.34);
  G.shadowCircle(L.BUDDLEIA.x, L.BUDDLEIA.z, 1.2, 1.4, 0.3);
  G.shadowCircle(-16.4, 0.4, 1.0, 0.7, 0.22);
}

// ------------------------------------------------------------------ the two houses
function houses(ctx, { add, M, rnd }) {
  const k = ctx.kit, wk = ctx.wk, T = ctx.T, boxUV = ctx.boxUV;
  void M; void k;
  for (const H of [L.P1, L.P2]) {
    buildHouse(ctx, H);
    // Ridge capping along the ridge, a vent tile or two and a few slipped tiles.
    const alongX = H.ridge === 'x', len = (alongX ? H.x1 - H.x0 : H.z1 - H.z0) + 0.6;
    const mx = (H.x0 + H.x1) / 2, mz = (H.z0 + H.z1) / 2;
    add(boxUV(alongX ? len : 0.22, 0.1, alongX ? 0.22 : len, 1), 'roof', T(mx, H.ridgeY + 0.04, mz), H.roofColor ? jitCol(H.roofColor, 0.88) : 0xffffff, 0);
    // Gutters' downpipes at the rear corners and front.
    for (const [x, z] of [[H.x1 + 0.04, H.z1 + 0.05], [H.x0 - 0.04, H.z0 - 0.05]]) {
      const b = between([x, Y(0.1), z], [x, H.eave - 0.15, z]);
      add(new THREE.CylinderGeometry(0.035, 0.035, b.len, 8), 'paint', b.m, 0x2b2e30, 1);
    }
    // A TV aerial on the nearer chimney and a bird on the ridge's end.
    const ch = H.chimneys[0], cxm = alongX ? ch.u : mx, czm = alongX ? mz : ch.u;
    const top = ch.top + 0.28;
    add(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 5), 'steel', T(cxm, top + 0.6, czm), 0x888888, 1);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.01, 0.01, 0.6 - i * 0.08), 'steel', T(cxm, top + 0.25 + i * 0.22, czm, 0), 0x888888, 2);
    // Moss and a few darker tiles scattered on the slopes (flat patches just off the roof).
    void rnd;
  }
  // ---- p-1: the front bay, with a lead roof and three windows, pots and a house number
  {
    const B = L.BAY, brick = (w, h, d, x, y, z, ry = 0, c = 0xf0e0d4, lod = 0) => add(boxUV(w, h, d, 1), 'brick', T(x, y, z, ry), c, lod);
    const hh = B.roofY - FY;
    brick(B.wFront, hh, 0.45, B.cx, FY + hh / 2, FRONT_LINE + 0.225);
    for (const s of [-1, 1]) brick(0.54, hh, 0.14, B.cx + s * 0.64, FY + hh / 2, FRONT_LINE + 0.2, s * 0.65);
    add(new THREE.BoxGeometry(2.0, 0.07, 0.75), 'zinc', T(B.cx, B.roofY + 0.035, FRONT_LINE + 0.3), 0x6b7378, 0);
    add(new THREE.BoxGeometry(2.0, 0.12, 0.04), 'paint', T(B.cx, B.roofY - 0.07, FRONT_LINE + 0.66), 0xf4f1ea, 1);
    add(new THREE.BoxGeometry(1.5, 0.1, 0.55), 'stone', T(B.cx, FY + 0.05, FRONT_LINE + 0.35), 0xb5ad9c, 1);
    windowAt(ctx, { x: B.cx, y: Y(0.55), z: FRONT_LINE + 0.452, ry: 0, w: 0.8, h: 1.55, style: 'sash', bars: 2, trim: 0xf4f1ea });
    for (const s of [-1, 1]) windowAt(ctx, { x: B.cx + s * 0.62, y: Y(0.6), z: FRONT_LINE + 0.26 - 0.0, ry: s * 0.65, w: 0.33, h: 1.4, style: 'casement', bars: 1, trim: 0xf4f1ea, lod: 1 });
    // Pots either side of the door.
    for (const [x, z, c] of [[-8.05, FRONT_LINE + 0.26, 0xb9683f], [-6.75, FRONT_LINE + 0.26, 0xa65a3a]]) {
      add(new THREE.CylinderGeometry(0.16, 0.12, 0.32, 10), 'terracotta', T(x, FY + 0.16, z), c, 1);
      add(ctx.blobGeometry(0.2, 1, Math.round(x * 7)), 'leaf', T(x, FY + 0.45, z, 0, 0, 0, 1, 0.9, 1), 0x4f7a3a, 1);
    }
    // House number plate and a letterbox on the door.
    add(new THREE.BoxGeometry(0.16, 0.1, 0.012), 'enamel', T(-7.4, Y(2.15), FRONT_LINE + 0.07), 0xeeeeee, 2);
    // Gatepost: none (the front garden belongs to the street).
  }
  // ---- p-2: a porch roof on two posts over the door, climbing rose, window boxes, gable window
  {
    const P = L.PORCH, cxp = (P.x0 + P.x1) / 2;
    const len = Math.hypot(P.z1 - P.z0, P.wallY - P.frontY), sl = Math.atan2(P.wallY - P.frontY, P.z1 - P.z0);
    for (const x of [P.x0, P.x1]) { const b = between([x, FY, P.z1], [x, P.frontY, P.z1]); add(new THREE.BoxGeometry(0.1, b.len, 0.1), 'wood', b.m, 0xe8e2d0, 1); }
    add(boxUV(P.x1 - P.x0 + 0.3, 0.06, len, 1), 'roof', matrixOf(cxp, (P.wallY + P.frontY) / 2 + 0.05, (P.z0 + P.z1) / 2, [sl, 0, 0]), 0xc98a72, 0);
    add(new THREE.BoxGeometry(P.x1 - P.x0 + 0.3, 0.14, 0.04), 'paint', matrixOf(cxp, P.frontY - 0.04, P.z1 + 0.04, [sl, 0, 0]), 0x5a6b5a, 1);
    add(new THREE.BoxGeometry(P.x1 - P.x0 - 0.1, 0.1, 0.6), 'stone', T(cxp, FY + 0.05, P.z1 - 0.3), 0xb5ad9c, 1);
    windowAt(ctx, { x: L.P2_GABLE_WINDOW.x, y: L.P2_GABLE_WINDOW.y, z: FRONT_LINE + 0.0, ry: 0, w: L.P2_GABLE_WINDOW.w, h: L.P2_GABLE_WINDOW.h, style: 'casement', bars: 2, trim: 0x5a6b5a });
    // Window boxes under the two ground-floor windows.
    for (const xc of [-16.3, -12.7]) {
      const w = xc === -16.3 ? 1.0 : 1.35;
      add(new THREE.BoxGeometry(w, 0.15, 0.17), 'weathered', T(xc, Y(0.88), FRONT_LINE + 0.1), 0x5a6b5a, 1);
      for (let i = 0; i < 6; i++) add(ctx.blobGeometry(0.12, 1, i + xc), 'leaf', T(xc - w * 0.42 + i * w * 0.17, Y(1.04), FRONT_LINE + 0.1, 0, 0, 0, 1, 0.8, 1), jit(i % 2 ? 0xb5303a : 0x4f7a3a, rnd, 0.05), 2);
    }
  }
}
const jitCol = (hex, f) => col.setHex(hex).multiplyScalar(f).getHex();


// ------------------------------------------------------------------ the patio's bistro chairs (the chair kit)
function chairs(ctx, { add }) {
  L.BISTRO_CHAIRS.forEach(([x, z, yaw], i) => {
    const mx = ctx.T(x, FY, z, yaw);
    placeChair('bistro', { frame: ['paint', 0x2b3a32], foot: ['rubber', 0x2a2a28] }, (g, key, col, lod) => add(g, key, mx, col, lod), { lite: ctx.lite, seed: 11 + i });
  });
}

// ------------------------------------------------------------------ every solid in the list, drawn as it collides
function solids(ctx, { add, rnd }) {
  const boxUV = ctx.boxUV;
  const rockGeo = (r, seed) => ctx.blobGeometry(r, 1, seed, 0.2);
  let n = 0;
  for (const s of L.SOLIDS) {
    if (s.novis) continue;
    n++;
    const lod = s.lod ?? 1;
    const c = s.c ?? 0xffffff;
    if (s.k === 'box') {
      const w = s.hx * 2, h = s.hy * 2, d = s.hz * 2;
      if (s.m === 'net') add(boxUV(w, h, d, 4.17), 'net', matrixOf(s.x, s.y, s.z, s.rot, s.ry || 0), c, lod);
      else if (s.m === 'glass' || s.m === 'water') add(new THREE.BoxGeometry(w, h, d), s.m, matrixOf(s.x, s.y, s.z, s.rot, s.ry || 0), c, lod);
      else add(boxUV(w, h, d, 1), s.m, matrixOf(s.x, s.y, s.z, s.rot, s.ry || 0), c, lod);
    } else if (s.k === 'cyl' && s.look === 'rock') {
      add(rockGeo(1, n), 'stone', matrixOf(s.x, s.y, s.z, null, rnd() * 6, s.r * 1.08, s.hh * 1.25, s.r * 1.08), c, lod);
    } else if (s.k === 'cyl') {
      add(new THREE.CylinderGeometry(s.r, s.r, s.hh * 2, s.seg || 10), s.m, matrixOf(s.x, s.y, s.z, s.rot, s.ry || 0), c, lod);
    } else if (s.k === 'ball') {
      const g = s.m === 'stone' ? rockGeo(s.r, n) : new THREE.SphereGeometry(s.r, 8, 6);
      add(g, s.m, matrixOf(s.x, s.y, s.z, null, rnd() * 6, 1, s.m === 'stone' ? 0.8 : 1, 1), c, lod);
    } else if (s.k === 'rail') {
      const b = between(s.a, s.b);
      add(new THREE.CylinderGeometry(s.r, s.r, b.len + s.r, s.r < 0.02 ? 5 : 7), s.m, b.m, c, lod);
    }
  }
}

// ------------------------------------------------------------------ fences, the old wall and the hedges
const segmentsOf = (len, gaps) => {
  const out = []; let u0 = 0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > u0) out.push([u0, g0]); u0 = g1; }
  out.push([u0, len]);
  return out;
};
function runs(ctx, { add }) {
  const boxUV = ctx.boxUV, T = ctx.T;
  for (const R of L.RUNS) {
    const len = Math.hypot(R.b[0] - R.a[0], R.b[1] - R.a[1]), dx = (R.b[0] - R.a[0]) / len, dz = (R.b[1] - R.a[1]) / len, yaw = Math.atan2(-dz, dx);
    const at = (u, yy, off = 0) => T(R.a[0] + dx * u - dz * off, FY + yy, R.a[1] + dz * u + dx * off, yaw);
    const open = (u0, u1) => R.gaps.some(([g0, g1]) => u1 > g0 + 1e-6 && u0 < g1 - 1e-6);
    const r2 = mulberry(Math.round(len * 100 + R.a[0] * 7));
    const segs = segmentsOf(len, R.gaps);
    if (R.style === 'board') {
      const face = R.id === 'passage' ? -1 : 1;     // the boarded face looks into our passage / p-1's garden
      const np = Math.max(1, Math.round(len / 1.8));
      for (let i = 0; i <= np; i++) {
        const u = len * i / np;
        if (open(u - 0.06, u + 0.06)) continue;
        add(boxUV(0.09, R.h + 0.12, 0.09, 1), 'weathered', at(u, (R.h + 0.12) / 2, 0), jit(R.color, r2, 0.06), 1);
        add(new THREE.BoxGeometry(0.11, 0.03, 0.11), 'weathered', at(u, R.h + 0.135, 0), jitCol(R.color, 0.8), 1);
      }
      for (let u = 0; u < len - 0.01; u += 0.1) {
        if (open(u, u + 0.1)) continue;
        const hh = R.h - 0.12 + (r2() - 0.5) * 0.014;
        add(boxUV(0.097, hh, 0.02, 1), 'weathered', at(u + 0.05, 0.14 + hh / 2, face * 0.032), jit(R.color, r2, 0.08), 1);
      }
      for (const yy of [0.35, R.h - 0.25]) for (const [a, b] of segs) add(boxUV(b - a, 0.075, 0.03, 1), 'weathered', at((a + b) / 2, yy, -face * 0.03), jitCol(R.color, 0.85), 1);
      for (const [a, b] of segs) {
        add(boxUV(b - a, 0.16, 0.035, 1), 'weathered', at((a + b) / 2, 0.08, face * 0.03), jitCol(R.color, 0.6), 1);
        add(boxUV(b - a, 0.035, 0.09, 1), 'weathered', at((a + b) / 2, R.h + 0.03, 0), jitCol(R.color, 0.75), 1);
      }
      // The hole: ragged board stubs at its edges.
      for (const [g0, g1] of R.gaps) {
        add(boxUV(0.097, 0.42, 0.02, 1), 'weathered', at(g0 - 0.05, 0.14 + 0.2, face * 0.032), 0x6e6454, 2);
        add(boxUV(0.097, 0.3, 0.02, 1), 'weathered', at(g1 + 0.05, R.h - 0.14, face * 0.032), 0x6e6454, 2);
      }
    } else if (R.style === 'brick') {
      // The old wall: brick with a stone cap, piers every 3 m, and a collapsed length.
      for (const [a, b] of segs) {
        add(boxUV(b - a, R.h, 0.22, 1), 'brick', at((a + b) / 2, R.h / 2, 0), 0xcbb8a6, 0);
        add(boxUV(b - a, 0.05, 0.3, 1), 'stone', at((a + b) / 2, R.h + 0.025, 0), 0xb8b2a2, 1);
      }
      for (let u = 0.1; u < len; u += 3.0) if (!open(u - 0.2, u + 0.2)) add(boxUV(0.36, R.h + 0.06, 0.36, 1), 'brick', at(u, (R.h + 0.06) / 2, 0), 0xc6b09d, 1);
      for (const [g0, g1] of R.gaps) {
        const zc = R.a[1] + (g0 + g1) / 2;
        add(boxUV(0.22, L.OLDWALL_LOW.h, g1 - g0, 1), 'brick', T(R.a[0], FY + L.OLDWALL_LOW.h / 2, zc), 0xb9a592, 1);
        for (let i = 0; i < 16; i++) {
          const side = i % 2 ? 1 : -1, bz = zc + (r2() - 0.5) * (g1 - g0 + 0.5), bxx = R.a[0] + side * (0.2 + r2() * 0.5);
          add(boxUV(0.22, 0.07, 0.1, 1), 'brick', T(bxx, FY + 0.035 + (r2() < 0.2 ? 0.07 : 0), bz, r2() * 3, r2() * 0.1, r2() * 0.1), jit(0xcbb8a6, r2, 0.1), 2);
        }
      }
    }
  }
  // Ivy on the old wall (leaf cards both faces).
  {
    const pts = [], ow = L.RUNS[3];
    for (let i = 0; i < 90; i++) {
      const z = BACK_LINE + 0.3 + r3(i) * (FRONT_LINE - BACK_LINE - 0.6);
      if (z > -2.7 && z < -1.6) continue;
      const side = r3(i + 400) < 0.5 ? 1 : -1;
      const y = FY + 0.2 + Math.pow(r3(i + 800), 0.7) * 1.75;
      pts.push([ow.a[0] + side * 0.125, y, z, side, 0.1, 0]);
    }
    ctx.object(leafCards(ctx, pts, { size: 0.22, hue: 105 }), 2);
  }
  // Hedges: an overgrown privet along p-2's back, the strip's elder-and-bramble hedge.
  for (const H of L.HEDGES) {
    buildHedge(ctx, { a: H.a, b: H.b, h: H.h, d: H.d, gaps: H.gaps, y: FY, color: H.color });
    const len = Math.hypot(H.b[0] - H.a[0], H.b[1] - H.a[1]), dx = (H.b[0] - H.a[0]) / len, dz = (H.b[1] - H.a[1]) / len;
    const pts = [];
    const n = Math.round(len * (ctx.hi ? 26 : 16) * H.d);
    for (let i = 0; i < n; i++) {
      const u = r3(i * 3 + 1) * len;
      if (H.gaps.some(([g0, g1]) => u > g0 - 0.2 && u < g1 + 0.2)) continue;
      const side = r3(i * 3 + 2) < 0.5 ? 1 : -1, y = FY + 0.25 + r3(i * 3 + 3) * (H.h - 0.1);
      const nx = -dz * side, nz = dx * side;
      pts.push([H.a[0] + dx * u + nx * H.d * 0.5, y, H.a[1] + dz * u + nz * H.d * 0.5, nx, 0.2, nz]);
    }
    ctx.object(leafCards(ctx, pts, { size: 0.3, hue: 100 }), 2);
  }
  // The back gate of p-1 (swung open on its far hinge) and p-2's gate in the hedge, hanging off one hinge.
  for (const [G, c1, c2] of [[L.GATE1, 0x7a8a68, 0x6a7a58], [L.GATE2, 0x7d6a4c, 0x6a5a40]]) {
    const cxg = G.hx - Math.cos(G.ang) * G.len / 2, czg = G.hz + Math.sin(G.ang) * G.len / 2;
    add(boxUV(G.len, G.h, 0.05, 1), 'weathered', matrixOf(cxg, FY + G.h / 2, czg, null, G.ang), c1, 1);
    for (const f of [0.15, 0.5, 0.85]) add(boxUV(G.len, 0.08, 0.03, 1), 'weathered', matrixOf(cxg - Math.sin(G.ang) * 0.04, FY + G.h * f, czg - Math.cos(G.ang) * 0.04, null, G.ang), c2, 1);
    add(boxUV(G.len, 0.07, 0.03, 1), 'weathered', matrixOf(cxg - Math.sin(G.ang) * 0.04, FY + G.h * 0.5, czg - Math.cos(G.ang) * 0.04, [0, G.ang, G.diag || 0.5]), c2, 1);
    add(boxUV(0.1, G.h + 0.45, 0.1, 1), 'weathered', T(G.hx, FY + (G.h + 0.45) / 2, G.hz), 0x8a7b62, 1);
    add(boxUV(0.1, G.h + 0.45, 0.1, 1), 'weathered', T(G.hx - G.gap, FY + (G.h + 0.45) / 2, G.hz), 0x8a7b62, 1);
    add(new THREE.BoxGeometry(0.2, 0.06, 0.04), 'iron', T(G.hx - G.gap + 0.07, FY + G.h * 0.7, G.hz + 0.05), 0x2a2a2a, 2);
  }
}
const r3 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };


// ------------------------------------------------------------------ soft foliage and flowers
// Points on the shell of an ellipsoid with outward normals, for leaf cards.
function shell(cx, cy, cz, rx, ry, rz, n, rnd, out) {
  for (let i = 0; i < n; i++) {
    _v.set(rnd() * 2 - 1, rnd() * 1.5 - 0.5, rnd() * 2 - 1);
    if (_v.lengthSq() < 0.01) continue;
    _v.normalize();
    out.push([cx + _v.x * rx, cy + _v.y * ry, cz + _v.z * rz, _v.x, _v.y + 0.2, _v.z]);
  }
}
const GREENS = [0x4f7a3a, 0x5a8442, 0x47703a, 0x628c48, 0x3f6a34];

function foliage(ctx, { add, rnd }) {
  const k = ctx.kit, wk = ctx.wk, boxUV = ctx.boxUV, T = ctx.T;
  void boxUV;
  const sway = (tall, amount = 1) => ctx.sway(k.leaf, { baseY: FY, height: tall, amount });
  const swayK = { 0.6: 0, 1.0: 0, 1.6: 0, 2.4: 0 };
  void swayK;
  const bucket = (t) => (t <= 0.7 ? 0.7 : t <= 1.1 ? 1.1 : t <= 1.7 ? 1.7 : 2.6);
  const leafPts = [];                     // leaf cards for all the soft things, flushed at the end
  const flower = (geo, key, x, y, z, c, lod = 2, s = 1) => add(geo, key, T(x, y, z, rnd() * 6, 0, 0, s, s, s), c, lod);
  const ball4 = new THREE.SphereGeometry(0.03, 6, 4);
  const lumps = (f, r, tones, count = 3, flat = 0.85) => {
    for (let i = 0; i < count; i++) {
      const rr = r * (0.55 + rnd() * 0.3);
      // Never through the fence into our garden (x -3.4).
      const lx = Math.min(f.x + (rnd() - 0.5) * r * 0.9, f.x < -3.4 ? -3.46 - rr * 1.2 : Infinity);
      add(ctx.blobGeometry(rr, 1, Math.round(f.x * 13 + i * 7), 0.25), wk.leafy, T(lx, f.y + (rnd() - 0.4) * r * 0.5, f.z + (rnd() - 0.5) * r * 0.9, rnd() * 6, 0, 0, 1, flat, 1), tones[i % tones.length], 0);
    }
  };
  for (const f of L.FOLIAGE) {
    const r = f.r;
    switch (f.kind) {
      case 'shrub': case 'rose': case 'elder': {
        const tones = f.kind === 'shrub' ? [0x6a8c4a, 0x5a7d3f, 0x74954f] : f.kind === 'elder' ? [0x8aa466, 0x7a9658] : [0x587a40, 0x4f7038];
        lumps(f, r * 1.15, tones, 3, 0.8);
        shell(f.x, f.y, f.z, r * 1.05, r * 0.85, r * 1.05, ctx.hi ? 40 : 24, rnd, leafPts);
        if (f.kind === 'rose') for (let i = 0; i < 16; i++) { _v.set(rnd() * 2 - 1, rnd() * 1.2 - 0.2, rnd() * 2 - 1).normalize(); flower(new THREE.SphereGeometry(0.035, 6, 4), 'petal', f.x + _v.x * r, f.y + _v.y * r * 0.8, f.z + _v.z * r, jit(i % 3 ? 0xd9566f : 0xf2c6cf, rnd, 0.04), 2); }
        if (f.kind === 'elder') for (let i = 0; i < 14; i++) { _v.set(rnd() * 2 - 1, rnd() * 0.8, rnd() * 2 - 1).normalize(); add(new THREE.CylinderGeometry(0.1, 0.09, 0.03, 8), 'petal', T(f.x + _v.x * r * 1.1, f.y + 0.1 + _v.y * r, f.z + _v.z * r * 1.1, 0, 0.2, 0.2), 0xf1ecd2, 2); }
        break;
      }
      case 'palm': {
        const parts = new Parts();
        const fr = blade(1.15, 0.2, 1.1, 6, 1);
        for (let i = 0; i < 11; i++) {
          const a = i / 11 * Math.PI * 2 + rnd() * 0.4, tilt = 0.5 + rnd() * 0.5;
          parts.add(fr, matrixOf(f.x, FY + 0.46, f.z, [tilt, a, 0], 0, 1, 0.85 + rnd() * 0.3, 1));
        }
        const g = parts.merged();
        add(g, 'leaf', new THREE.Matrix4(), 0x3f6a34, 1);
        break;
      }
      case 'fern': {
        const parts = new Parts();
        const fr = blade(0.5, 0.12, 0.9, 4, 1);
        for (let i = 0; i < 9; i++) parts.add(fr, matrixOf(f.x, FY + 0.5, f.z, [0.7 + rnd() * 0.5, i / 9 * 6.28, 0]));
        add(parts.merged(), 'leaf', new THREE.Matrix4(), 0x4a7a3a, 1);
        add(new THREE.CylinderGeometry(0.17, 0.12, 0.3, 10), 'terracotta', T(f.x, FY + 0.15, f.z), 0xa8553a, 1);
        break;
      }
      case 'geranium': {
        add(ctx.blobGeometry(r * 0.75, 1, Math.round(f.x * 9), 0.2), wk.leafy, T(f.x, f.y - 0.03, f.z, 0, 0, 0, 1, 0.7, 1), 0x5a7d3f, 1);
        for (let i = 0; i < 9; i++) { _v.set(rnd() * 2 - 1, rnd() * 0.7 + 0.2, rnd() * 2 - 1).normalize(); flower(ball4, 'petal', f.x + _v.x * r * 0.8, f.y + _v.y * r * 0.4 + 0.02, f.z + _v.z * r * 0.8, jit(i % 4 ? 0xc43540 : 0xe8808c, rnd, 0.04), 2, 1.1); }
        break;
      }
      case 'seedling': add(ctx.blobGeometry(0.07, 0, 1, 0.2), wk.leafy, T(f.x, f.y, f.z, 0, 0, 0, 1, 0.7, 1), 0x6a9a4a, 2); break;
      case 'tomato': {
        // A tied-in tomato plant: leafy stem up its cane, trusses of fruit hanging from it.
        const parts = new Parts(), tall = 1.25;
        for (let i = 0; i < 9; i++) {
          const h = 0.25 + i * (tall - 0.25) / 9, a = i * 2.1 + f.seed;
          for (const s of [0, Math.PI]) {
            const lf = oval(0.2, 0.12, 0.2);
            parts.add(lf, matrixOf(f.x, FY + h, f.z, [0.25, a + s, 0]));
          }
        }
        add(parts.merged(), 'leaf', new THREE.Matrix4(), 0x4d7a35, 1);
        for (let i = 0; i < 4; i++) {
          const h = 0.5 + i * 0.22, a = i * 1.7 + f.seed;
          for (let j = 0; j < 3; j++) flower(new THREE.SphereGeometry(0.03, 6, 5), 'enamel', f.x + Math.cos(a) * (0.1 + j * 0.02), FY + h - j * 0.03, f.z + Math.sin(a) * (0.1 + j * 0.02), i < 2 ? 0xc8321f : 0x8ab04a, 2);
        }
        break;
      }
      case 'alpine': {
        add(ctx.blobGeometry(r, 1, Math.round(f.z * 11), 0.2), wk.leafy, T(f.x, f.y - 0.04, f.z, 0, 0, 0, 1.2, 0.5, 1.2), jit(0x6f9a58, rnd, 0.05), 1);
        for (let i = 0; i < 6; i++) flower(ball4, 'petal', f.x + (rnd() - 0.5) * r * 1.6, f.y + 0.0 + rnd() * 0.04, f.z + (rnd() - 0.5) * r * 1.6, [0xe6a8c2, 0xf4f0f4, 0xb89ad0, 0xf2d06a][i % 4], 2, 0.7);
        break;
      }
      case 'nasturtium': {
        const parts = new Parts();
        for (let i = 0; i < 7; i++) {
          const a = rnd() * 6.28, d = rnd() * 0.22;
          parts.add(new THREE.CircleGeometry(0.06 + rnd() * 0.04, 8).rotateX(-Math.PI / 2), matrixOf(f.x + Math.cos(a) * d, f.y + rnd() * 0.05, f.z + Math.sin(a) * d, [rnd() * 0.3, rnd() * 6, 0]));
        }
        add(parts.merged(), 'leaf', new THREE.Matrix4(), 0x5e8a3e, 2);
        for (let i = 0; i < 3; i++) flower(ball4, 'petal', f.x + (rnd() - 0.5) * 0.4, f.y + 0.07, f.z + (rnd() - 0.5) * 0.3, [0xe8742a, 0xf0b02a, 0xc8421f][i], 2, 1.2);
        break;
      }
      case 'apple': {
        lumps(f, r * 1.1, [0x7a9a58, 0x6c8c4c, 0x86a45f], 3, 0.75);
        shell(f.x, f.y, f.z, r, r * 0.8, r, ctx.hi ? 46 : 26, rnd, leafPts);
        for (let i = 0; i < 6; i++) { _v.set(rnd() * 2 - 1, -0.2 - rnd() * 0.6, rnd() * 2 - 1).normalize(); flower(new THREE.SphereGeometry(0.035, 6, 5), 'enamel', f.x + _v.x * r * 0.85, f.y + _v.y * r * 0.7, f.z + _v.z * r * 0.85, [0xb8321f, 0x9ab04a, 0xc4652a][i % 3], 2); }
        break;
      }
      case 'nettle': {
        const tall = f.tall, band = bucket(tall), mat = sway(band, 1.4), n = Math.round(14 * (r / 0.4) * (ctx.hi ? 1 : 0.6));
        const parts = [new Parts(), new Parts(), new Parts()], stems = new Parts();
        for (let i = 0; i < n; i++) {
          const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r * 0.95, h = tall * (0.55 + rnd() * 0.45);
          const sx = f.x + Math.cos(a) * d, sz = f.z + Math.sin(a) * d, lean = (rnd() - 0.5) * 0.25;
          const b = between([sx, FY, sz], [sx + Math.cos(a) * h * lean, FY + h, sz + Math.sin(a) * h * lean]);
          stems.add(new THREE.CylinderGeometry(0.005, 0.008, b.len, 4), b.m);
          for (let j = 0; j < 7; j++) {
            const t = 0.25 + j * 0.11, y = FY + h * t, ang = j * 1.7 + i, lfl = 0.07 + (1 - t) * 0.05 + 0.05;
            for (const s of [0, Math.PI]) parts[(i + j) % 3].add(oval(lfl * 2.2, lfl * 1.25, 0.35), matrixOf(sx + Math.cos(a) * h * lean * t, y, sz + Math.sin(a) * h * lean * t, [0.35 + rnd() * 0.3, ang + s, 0], 0, 1, 1, 1));
          }
        }
        add(stems.merged(), 'leaf', new THREE.Matrix4(), 0x5a7a3a, 1);
        [0x3a5f2a, 0x46703a, 0x2f5226].forEach((c, i) => { const g = parts[i].merged(); if (g) add(g, mat, new THREE.Matrix4(), c, 1); });
        break;
      }
      case 'bramble': {
        const tall = f.tall, band = bucket(tall), mat = sway(band, 0.5), canes = new Parts(), lv = [new Parts(), new Parts()];
        const nc = ctx.hi ? 7 : 5;
        for (let i = 0; i < nc; i++) {
          const a = i / nc * 6.28 + rnd(), reach = r * (0.8 + rnd() * 0.5), top = tall * (0.7 + rnd() * 0.5);
          const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(f.x + Math.cos(a) * 0.05, FY, f.z + Math.sin(a) * 0.05), new THREE.Vector3(f.x + Math.cos(a) * reach * 0.3, FY + top * 0.95, f.z + Math.sin(a) * reach * 0.3), new THREE.Vector3(f.x + Math.cos(a) * reach * 0.8, FY + top * 0.75, f.z + Math.sin(a) * reach * 0.8), new THREE.Vector3(f.x + Math.cos(a) * reach * 1.05, FY + top * 0.2, f.z + Math.sin(a) * reach * 1.05)]);
          canes.add(new THREE.TubeGeometry(cv, 8, 0.011, 4, false), new THREE.Matrix4());
          for (let j = 1; j < 9; j++) {
            const p = cv.getPointAt(j / 9);
            for (let q = 0; q < 3; q++) lv[(j + q) % 2].add(oval(0.11, 0.065, 0.25), matrixOf(p.x, p.y, p.z, [0.3 + rnd() * 0.6, a + (q - 1) * 0.9 + rnd(), 0]));
            if (j % 3 === 0) flower(new THREE.SphereGeometry(0.018, 5, 4), 'enamel', p.x, p.y - 0.03, p.z, [0x2a1a33, 0x7a2a3a, 0x3a2a40][j % 3], 2);
          }
        }
        add(canes.merged(), 'weathered', new THREE.Matrix4(), 0x6a4a3a, 1);
        [0x3d6232, 0x4f7a3a].forEach((c, i) => { const g = lv[i].merged(); if (g) add(g, mat, new THREE.Matrix4(), c, 1); });
        break;
      }
      case 'buddleia': {
        lumps(f, r * 1.15, [0x5f7f4f, 0x6a8a58, 0x55744a], 4, 0.9);
        shell(f.x, f.y, f.z, r * 1.1, r * 1.0, r * 1.1, ctx.hi ? 60 : 30, rnd, leafPts);
        // Arching sprays and purple flower cones at the tips.
        const sprays = new Parts();
        for (let i = 0; i < 60; i++) {
          _v.set(rnd() * 2 - 1, rnd() * 1.3 - 0.1, rnd() * 2 - 1).normalize();
          const px = f.x + _v.x * r * 1.1, py = f.y + _v.y * r * 0.95, pz = f.z + _v.z * r * 1.1;
          const cone = new THREE.ConeGeometry(0.028, 0.16 + rnd() * 0.08, 5).translate(0, 0.09, 0);
          sprays.add(cone, matrixOf(px, py, pz, [_v.z * 0.6 + 0.3, 0, -_v.x * 0.6]));
        }
        add(sprays.merged(), 'petal', new THREE.Matrix4(), 0x9d7bc4, 1);
        break;
      }
      default: break;
    }
  }
  // Leaf cards over all the soft shapes (one instanced draw per hue).
  if (leafPts.length) ctx.object(leafCards(ctx, leafPts, { size: 0.24, hue: 100 }), 2);
  // Wild flowers in p-2 and the strip, daisies in p-1's lawn.
  {
    const wild = new Parts(), petals = [[], [], []];
    for (let i = 0; i < (ctx.lite ? 40 : 110); i++) {
      const x = -17.7 + rnd() * 7.0, z = -6.1 + rnd() * 11;
      if (x < -17.1 && z > -0.6 && z < 1.4) continue;
      const stem = 0.18 + rnd() * 0.3;
      const kind = i % 3;
      petals[kind].push([x, z, stem]);
    }
    void wild;
    const cols = [0xf3d03a, 0xf6f1e4, 0xe56aa0];
    petals.forEach((list, c) => list.forEach(([x, z, stem]) => {
      add(new THREE.CylinderGeometry(0.003, 0.003, stem, 3), 'leaf', T(x, FY + stem / 2, z), 0x5a8a3a, 2);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 7), 'petal', T(x, FY + stem, z, 0, 0.2, 0.1), cols[c], 2);
    }));
    for (let i = 0; i < (ctx.lite ? 0 : 70); i++) {
      const x = -10.3 + rnd() * 6.6, z = -6.0 + rnd() * 8.2;
      if (Math.hypot(x - L.TRAMP.x, z - L.TRAMP.z) < 1.4 || (x > -9.8 && x < -8.3 && z > -3.1 && z < -1.5)) continue;
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 6), 'petal', T(x, FY + 0.012, z), 0xf4f1ea, 2);
    }
  }
}


// ------------------------------------------------------------------ flat polygons (glass panes) and small helpers
function polyGeo(pts) {
  const pos = [], uv = [], idx = [];
  pts.forEach((p) => { pos.push(p[0], p[1], p[2]); uv.push(p[0] + p[2], p[1]); });
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const polyBoth = (pts) => mergeGeometries([polyGeo(pts), polyGeo([...pts].reverse())]);

// ------------------------------------------------------------------ garden set pieces, the look beyond the solids
function gardenDetail(ctx, { add, rnd }) {
  const k = ctx.kit, wk = ctx.wk, T = ctx.T, boxUV = ctx.boxUV;
  const glassC = 0xe8f2f2;
  const white = 0xf7f6f1;
  // ---------------- the conservatory: glazed gables, mullions, roof bars, a hanging basket, curtains of leaves
  {
    const C = L.CONS;
    for (const side of [-1, 1]) {
      const x = side < 0 ? C.x0 + 0.04 : C.x1 - 0.04;
      const spans = side < 0 ? [[C.zF + 0.1, C.zB - 0.1]] : [[C.zF + 0.1, C.door.z0 - 0.02], [C.door.z1 + 0.02, C.zB - 0.1]];
      for (const [za, zb] of spans) {
        add(polyBoth([[x, Y(C.dwarf + 0.04), za], [x, Y(C.dwarf + 0.04), zb], [x, Y(L.consRoofY(zb) - 0.08), zb], [x, Y(L.consRoofY(za) - 0.08), za]]), 'glass', new THREE.Matrix4(), glassC, 0);
      }
      for (let z = C.zF + 0.7; z < C.zB - 0.3; z += 0.7) {
        if (side > 0 && z > C.door.z0 - 0.2 && z < C.door.z1 + 0.2) continue;
        add(new THREE.BoxGeometry(0.045, L.consRoofY(z) - C.dwarf - 0.1, 0.045), 'paint', T(x, Y((C.dwarf + L.consRoofY(z) - 0.1) / 2), z), white, 1);
      }
    }
    // Brick plinth course and a stone sill all round.
    add(boxUV(C.x1 - C.x0 + 0.1, 0.05, 0.3, 1), 'stone', T((C.x0 + C.x1) / 2, Y(C.dwarf + 0.0), C.zF), 0xcfc6b4, 1);
    for (const x of [C.x0, C.x1]) add(boxUV(0.3, 0.05, C.zB - C.zF, 1), 'stone', T(x, Y(C.dwarf), (C.zF + C.zB) / 2), 0xcfc6b4, 1);
    // Finial and cresting along the front eave.
    add(new THREE.BoxGeometry(C.x1 - C.x0 + 0.2, 0.05, 0.1), 'paint', T((C.x0 + C.x1) / 2, Y(C.eaveF + 0.02), C.zF - 0.08), white, 1);
    // Hanging basket in the corner and a floor tile pattern is painted on the ground.
    add(new THREE.CylinderGeometry(0.15, 0.08, 0.14, 10), 'wicker', T(-6.3, Y(2.2), 0.4), 0xb89a68, 2);
    add(ctx.blobGeometry(0.2, 1, 5, 0.2), wk.leafy, T(-6.3, Y(2.3), 0.4, 0, 0, 0, 1, 0.8, 1), 0x6f9a4f, 2);
    for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(0.03, 6, 4), 'petal', T(-6.3 + (rnd() - 0.5) * 0.3, Y(2.35), 0.4 + (rnd() - 0.5) * 0.3), [0xd9566f, 0xf2c6cf, 0xb83a5a][i % 3], 2);
    // Curtains of the roller blind on the back wall window glimpsed through the glass.
    add(new THREE.PlaneGeometry(1.0, 1.1), 'fabric', T(-5.5, Y(1.5), L.P1.z0 - 0.03, Math.PI), 0xe6dcc4, 2);
  }
  // ---------------- the greenhouse: glazed gables, wall bars, an aluminium door frame and the sill ledge
  {
    const G = L.GH, zr = (G.z0 + G.z1) / 2, hz = (G.z1 - G.z0) / 2, W = G.x1 - G.x0;
    const topAt = (z) => G.eave + (G.ridge - G.eave) * (1 - Math.abs(z - zr) / hz);
    // Far gable and the door gable.
    add(polyBoth([[G.x0 + 0.05, Y(G.eave), G.z0 + 0.06], [G.x0 + 0.05, Y(G.eave), G.z1 - 0.06], [G.x0 + 0.05, Y(G.ridge - 0.04), zr]]), 'glass', new THREE.Matrix4(), glassC, 0);
    const dz0 = G.door.z0, dz1 = G.door.z1, x = G.x1 - 0.05;
    add(polyBoth([[x, Y(G.eave), G.z0 + 0.06], [x, Y(G.eave), dz0], [x, Y(topAt(dz0)), dz0]]), 'glass', new THREE.Matrix4(), glassC, 0);
    add(polyBoth([[x, Y(G.eave), dz1], [x, Y(G.eave), G.z1 - 0.06], [x, Y(topAt(dz1)), dz1]]), 'glass', new THREE.Matrix4(), glassC, 0);
    add(polyBoth([[x, Y(G.door.h), dz0], [x, Y(G.door.h), dz1], [x, Y(topAt(dz1)), dz1], [x, Y(G.ridge - 0.04), zr], [x, Y(topAt(dz0)), dz0]]), 'glass', new THREE.Matrix4(), glassC, 0);
    // Wall mullions and roof glazing bars on the gables.
    for (let i = 1; i < 4; i++) for (const z of [G.z0 + 0.05, G.z1 - 0.05]) add(new THREE.BoxGeometry(0.025, G.eave - G.base, 0.03), 'paint', T(G.x0 + i * W / 4, Y((G.base + G.eave) / 2), z), 0xc9d0d1, 1);
    for (const z of [G.z0 + 0.2, G.z1 - 0.2, zr]) add(new THREE.BoxGeometry(0.025, 0.4, 0.03), 'paint', T(G.x0 + 0.05, Y(G.eave + 0.2), z), 0xc9d0d1, 2);
    for (const y of [0.9]) for (const z of [G.z0 + 0.05, G.z1 - 0.05]) add(new THREE.BoxGeometry(W, 0.025, 0.03), 'paint', T((G.x0 + G.x1) / 2, Y(y), z), 0xc9d0d1, 2);
    // The sliding-door's track and handle, a hanging thermometer, a spray bottle and string on the staging.
    add(new THREE.BoxGeometry(0.03, 0.14, 0.03), 'brass', T(G.x1 + 0.0, Y(0.95), G.door.z1 + 0.1), 0xb8a064, 2);
    add(new THREE.BoxGeometry(0.04, 0.2, 0.01), 'enamel', T(G.x0 + 0.1, Y(1.1), -5.0), 0xeeeeee, 2);
    // A ribbon of tomato labels and twine between canes along the back.
    add(new THREE.CylinderGeometry(0.004, 0.004, 2.0, 3).rotateZ(Math.PI / 2), 'fabric', T(-9.1, Y(1.35), -5.62), 0xb8a070, 2);
  }
  // ---------------- the trampoline: frame ring, the green spring pad and the net's top edge, a toy ball
  {
    const Tm = L.TRAMP;
    add(new THREE.RingGeometry(Tm.r * 0.78, Tm.r + 0.01, 28, 1).rotateX(-Math.PI / 2), 'rubber', T(Tm.x, Y(Tm.frameY + 0.056), Tm.z), 0x24402b, 1);
    add(new THREE.TorusGeometry(Tm.r + 0.02, 0.03, 6, 28).rotateX(Math.PI / 2), 'steel', T(Tm.x, Y(Tm.frameY - 0.01), Tm.z), 0x3a3d40, 1);
    add(new THREE.TorusGeometry(Tm.r * 0.78, 0.01, 4, 28).rotateX(Math.PI / 2), 'steel', T(Tm.x, Y(Tm.frameY + 0.06), Tm.z), 0x555a5c, 2);
    for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283, rr = Tm.r * 0.92; add(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 3), 'steel', T(Tm.x + Math.cos(a) * rr, Y(Tm.frameY + 0.03), Tm.z + Math.sin(a) * rr, 0, 0, 0), 0x9a9ea0, 2); }
    // The net's upper hem: a dark band along the top between poles.
    add(new THREE.TorusGeometry(Tm.r + 0.02, 0.012, 4, 28).rotateX(Math.PI / 2), 'rubber', T(Tm.x, Y(Tm.netTop - 0.05), Tm.z), 0x1a1c1d, 2);
    add(new THREE.SphereGeometry(0.11, 10, 8), 'rubber', T(Tm.x + 0.4, Y(Tm.frameY + 0.17), Tm.z - 0.3), 0xd34a2a, 2);
    // The entrance's rolled-back flap hangs from the left pole.
    const p = L.TRAMP_POLES[0];
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), 'fabric', T(p.x, Y(2.0), p.z, 0, 0, 0), 0x1c1f20, 2);
  }
  // ---------------- the rotary line: loops, pegs and the washing
  {
    const R = L.ROT;
    for (const rr of [R.R, R.R * 0.62, R.R * 0.34]) add(new THREE.TorusGeometry(rr, 0.004, 3, 32).rotateX(Math.PI / 2), 'paper', T(R.x, Y(R.lineY + (rr === R.R ? 0 : 0.05)), R.z), 0xf0f0e8, 1);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(new THREE.CylinderGeometry(0.007, 0.007, 1.05, 5).rotateZ(Math.PI / 2), 'steel', T(R.x + Math.cos(a) * 0.52, Y(1.74), R.z + Math.sin(a) * 0.52, -a), 0xb9bdbf, 1); }
    for (const [ang, w, hang, kind, colr] of L.ROT_ITEMS) {
      const an = ang + R.turn, px = R.x + Math.cos(an) * R.R, pz = R.z + Math.sin(an) * R.R;
      const nseg = 10, g = new THREE.PlaneGeometry(w, hang, nseg, 4), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / w + 0.5, v = (p.getY(i) + hang / 2) / hang;          // v: 0 bottom, 1 line
        const fold = Math.sin(u * Math.PI * (kind === 'sheet' ? 3 : 2) + ang * 3) * 0.035 * (1 - v * 0.6);
        p.setZ(i, fold + (1 - v) * Math.sin(u * Math.PI) * 0.03);
        p.setY(i, p.getY(i) + (v < 0.12 ? Math.sin(u * 14) * 0.012 : 0) - Math.sin(u * Math.PI) * 0.03 * (1 - v));
      }
      g.computeVertexNormals();
      const m = matrixOf(px, Y(R.lineY - hang / 2), pz, null, -an - Math.PI / 2);
      add(g, 'fabric', m, colr, 1);
      const g2 = g.clone(); g2.scale(1, 1, -1); const ix = g2.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      g2.computeVertexNormals();
      add(g2, 'fabric', matrixOf(px, Y(R.lineY - hang / 2), pz, null, -an - Math.PI / 2), colr, 1);
      if (kind === 'sheet') add(new THREE.PlaneGeometry(w * 0.96, 0.035), 'fabric', m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -hang / 2 + 0.2, 0.02)), jitCol(colr, 0.9), 2);
      for (const s of [-0.38, 0.38]) add(new THREE.BoxGeometry(0.02, 0.07, 0.03), 'wood', matrixOf(px + Math.cos(an + Math.PI / 2) * s * w, Y(R.lineY - 0.02), pz + Math.sin(an + Math.PI / 2) * s * w, null, -an - Math.PI / 2), [0xd9b04a, 0xb04a3a][s > 0 ? 1 : 0], 2);
    }
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 8), 'stone', T(R.x, Y(0.02), R.z), 0x8a867b, 2);
  }
  // ---------------- the swing seat's striped canopy
  {
    const S = L.SWING, pitch = rad(9), half = 0.7, cl = half / Math.cos(pitch);
    for (let i = 0; i < 14; i++) {
      const x = S.cx - 1.05 + 0.075 + i * 0.15;
      for (const sz of [-1, 1]) add(boxUV(0.15, 0.012, cl, 1), 'fabric', matrixOf(x, Y(S.topY + 0.1) + 0.011, S.cz + sz * half / 2, [sz * pitch, 0, 0]), i % 2 ? 0x4a6b52 : 0xe9e1cc, 1);
    }
    // Fringe along the valance, a tassel at each corner.
    for (const sz of [-1, 1]) for (let i = 0; i < 21; i++) add(new THREE.BoxGeometry(0.03, 0.045, 0.012), 'fabric', T(S.cx - 1.0 + i * 0.1, Y(S.topY - 0.09), S.cz + sz * (half + 0.04)), i % 2 ? 0xe9e1cc : 0x4a6b52, 2);
    // Throw cushions.
    for (const [dx, c] of [[-0.55, 0xb5534a], [0.5, 0x4a6b8a]]) add(boxUV(0.34, 0.34, 0.1, 1), 'fabric', matrixOf(S.cx + dx, Y(S.seatY + 0.33), S.cz - 0.18, [-0.22, 0.2, 0.1]), c, 1);
  }
  // ---------------- the koi pond: bed, water, lily pads and flowers, irises
  {
    const P = L.POND1;
    add(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), 'soil', T(P.x, Y(0.03), P.z, P.rot, 0, 0, P.rx + 0.02, 1, P.rz + 0.02), 0x1f2a22, 1);
    add(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), 'water', T(P.x, Y(P.water), P.z, P.rot, 0, 0, P.rx + 0.03, 1, P.rz + 0.03), 0xffffff, 1);
    for (const [dx, dz, r, fl] of [[-0.35, 0.18, 0.13, 1], [0.38, -0.22, 0.12, 0], [-0.1, -0.38, 0.1, 0], [0.5, 0.2, 0.09, 1], [-0.52, -0.15, 0.1, 0]]) {
      const x = P.x + dx, z = P.z + dz;
      add(new THREE.CircleGeometry(r, 10, 0.3, 5.7).rotateX(-Math.PI / 2), 'leaf', T(x, Y(P.water + 0.006), z, rnd() * 6), 0x4f7a3a, 1);
      if (fl) for (let i = 0; i < 6; i++) add(new THREE.ConeGeometry(0.025, 0.07, 5), 'petal', T(x + Math.cos(i * 1.05) * 0.03, Y(P.water + 0.04), z + Math.sin(i * 1.05) * 0.03, 0, Math.cos(i * 1.05) * 0.6, Math.sin(i * 1.05) * 0.6), 0xf0a8c0, 2);
    }
    // Irises and sedge at the corners of the kerb.
    const parts = new Parts();
    const bl = blade(0.62, 0.045, 0.45, 3);
    for (const [ang, n] of [[0.9, 8], [2.6, 7], [4.1, 8], [5.4, 7]]) {
      const bx0 = P.x + Math.cos(ang) * (P.rx + 0.12), bz0 = P.z + Math.sin(ang) * (P.rz + 0.12);
      for (let i = 0; i < n; i++) parts.add(bl, matrixOf(bx0 + (rnd() - 0.5) * 0.15, FY + 0.12, bz0 + (rnd() - 0.5) * 0.15, [0.1 + rnd() * 0.35, rnd() * 6.28, 0], 0, 1, 0.7 + rnd() * 0.7, 1));
    }
    add(parts.merged(), ctx.sway(k.leaf, { baseY: FY, height: 0.8, amount: 0.8 }), new THREE.Matrix4(), 0x4f7a3a, 1);
    for (const [ang, c] of [[0.9, 0x7a5ab0], [4.1, 0xe8d04a], [2.6, 0x7a5ab0]]) add(new THREE.ConeGeometry(0.035, 0.1, 6), 'petal', T(P.x + Math.cos(ang) * (P.rx + 0.12), Y(0.72), P.z + Math.sin(ang) * (P.rz + 0.12)), c, 2);
    // Moss and lichen on the kerb stones (little dark-green caps).
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; add(new THREE.CylinderGeometry(0.1, 0.12, 0.012, 7), 'leaf', T(P.x + Math.cos(a) * (P.rx + 0.09), Y(P.rim + 0.01), P.z + Math.sin(a) * (P.rz + 0.09), a), jit(0x5a7a40, rnd, 0.1), 2); }
  }
  // ---------------- the wildlife pond: dark water, duckweed, reeds with bulrushes, a frog
  {
    const P = L.POND2;
    add(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), 'soil', T(P.x, Y(0.02), P.z, 0.4, 0, 0, P.rx, 1, P.rz), 0x1d241a, 1);
    add(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), 'water', T(P.x, Y(0.06), P.z, 0.4, 0, 0, P.rx + 0.02, 1, P.rz + 0.02), 0x8aa070, 1);
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 0.6; add(new THREE.CircleGeometry(0.05 + rnd() * 0.04, 6).rotateX(-Math.PI / 2), 'leaf', T(P.x + Math.cos(a) * d * 1.2, Y(0.07), P.z + Math.sin(a) * d * 0.9, rnd() * 6), 0x7aa24a, 2); }
    const reeds = new Parts(), heads = new Parts();
    const bl = blade(1.4, 0.03, 0.3, 4);
    for (let i = 0; i < (ctx.hi ? 60 : 34); i++) {
      const a = rnd() * 6.28, d = 0.8 + rnd() * 0.25, x = P.x + Math.cos(a) * P.rx * d, z = P.z + Math.sin(a) * P.rz * d;
      const h = 0.8 + rnd() * 0.8;
      reeds.add(bl, matrixOf(x, FY + 0.03, z, [0.05 + rnd() * 0.35, rnd() * 6.28, 0], 0, 1, h / 1.4, 1));
      if (i % 5 === 0) { const hb = between([x, FY + 0.03, z], [x, FY + 1.1 + rnd() * 0.3, z]); heads.add(new THREE.CylinderGeometry(0.008, 0.008, hb.len, 4), hb.m); heads.add(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 6), new THREE.Matrix4().compose(new THREE.Vector3(x, FY + 1.15 + rnd() * 0.25, z), _q.identity(), _s.set(1, 1, 1))); }
    }
    add(reeds.merged(), ctx.sway(k.leaf, { baseY: FY, height: 1.7, amount: 1.4 }), new THREE.Matrix4(), 0x6a8a45, 1);
    add(heads.merged(), 'bark', new THREE.Matrix4(), 0x5a4030, 1);
    add(new THREE.SphereGeometry(0.035, 7, 5), 'leaf', T(P.x + 0.75, Y(0.2), P.z + 0.25, 0, 0, 0, 1.2, 0.7, 1.6), 0x6a8a30, 2);
    // Log with brackets of fungus.
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 7), 'paper', T(P.x - 0.7 + i * 0.4, Y(0.15 + i * 0.015), P.z + 0.22 + i * 0.3, 0, 0.5, 0.2), 0xe6dcc0, 2);
  }
  // ---------------- the caravan: windows, rust, a rooflight, wheel hubs, curtains
  {
    const C = L.CARAVAN, cx = (C.x0 + C.x1) / 2, trim = 0x5d6f5c;
    const win = (x, z, side, w = 0.7, h = 0.5, y0 = C.floor + 1.05) => {
      const ry = side > 0 ? 0 : Math.PI;
      windowAt(ctx, { x, y: y0, z: z + side * 0.002, ry, w, h, style: 'casement', bars: 2, trim, curtains: false, lod: 1 });
    };
    win(-16.55, C.z1, 1); win(-13.55, C.z1, 1, 0.8, 0.5); win(-16.4, C.z0, -1); win(-15.2, C.z0, -1);
    // Orange check curtains at the windows (dark glass glimpsed through the door).
    for (const [x, z, s] of [[-16.55, C.z1 - 0.07, -1], [-13.55, C.z1 - 0.07, -1], [-14.0, C.z0 + 0.07, 1]]) for (const sx of [-1, 1]) add(new THREE.PlaneGeometry(0.28, 0.55), 'fabric', T(x + sx * 0.3, C.floor + 1.3, z, s > 0 ? 0 : Math.PI), 0xd2864a, 2);
    // Rust runs and a green belt rail.
    for (let i = 0; i < 12; i++) {
      const x = C.x0 + 0.2 + rnd() * (C.x1 - C.x0 - 0.4), len = 0.15 + rnd() * 0.5;
      for (const [z, s] of [[C.z1, 1], [C.z0, -1]]) add(new THREE.BoxGeometry(0.012 + rnd() * 0.014, len, 0.003), 'iron', T(x, FY + C.floor + 0.2 + len / 2 + rnd() * 0.9, z + s * 0.004), 0xb59878, 2);
    }
    // Roof: a rooflight, an aerial, moss, a vent.
    add(new THREE.BoxGeometry(0.55, 0.05, 0.55), 'paint', T(cx - 0.5, Y(C.floor + C.h - 0.05 + 0.12), (C.z0 + C.z1) / 2), 0xcfc9b0, 1);
    add(new THREE.BoxGeometry(0.4, 0.02, 0.4), 'glass', T(cx - 0.5, Y(C.floor + C.h + 0.1), (C.z0 + C.z1) / 2), 0xdcecec, 1);
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8), 'paint', T(cx + 1.0, Y(C.floor + C.h + 0.06), (C.z0 + C.z1) / 2 - 0.2), 0xcfc9b0, 2);
    for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.05 + rnd() * 0.06, 0.06, 0.008, 6), 'leaf', T(C.x0 + 0.3 + rnd() * (C.x1 - C.x0 - 0.6), Y(C.floor + C.h + 0.17), C.z0 + 0.15 + rnd() * (C.z1 - C.z0 - 0.3), rnd() * 6), jit(0x7a8a5a, rnd, 0.1), 2);
    // Wheel hubs and a mudguard over each tyre (the missing wheel stands on bricks).
    const czm = (C.z0 + C.z1) / 2;
    for (const [x, sz] of [[cx + 0.35, -1], [cx + 0.35, 1], [cx - 1.3, 1]]) {
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 10).rotateX(Math.PI / 2), 'steel', T(x, FY + 0.32, czm + sz * 1.15), 0x9a9690, 2);
      add(boxUV(0.8, 0.04, 0.3, 1), 'paint', T(x, FY + 0.7, czm + sz * 1.04), 0xcfc9b0, 1);
    }
    // Awning rail with a rolled, faded awning and a tin lantern on the step.
    add(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8).rotateZ(Math.PI / 2), 'fabric', T(-15.0, FY + C.floor + 2.15, C.z1 + 0.07), 0xc9b88a, 1);
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 8), 'enamel', T(-15.2, FY + 0.1, C.z1 + 0.28), 0x6a7a52, 2);
    // Interior: shelf and tiny stove through the door, a picture and lamp.
    add(new THREE.BoxGeometry(1.2, 0.03, 0.2), 'wood', T(-13.6, FY + C.floor + 1.5, C.z1 - 0.2), 0xb89868, 2);
    add(new THREE.BoxGeometry(0.5, 0.35, 0.4), 'enamel', T(-13.4, FY + C.floor + 1.0, C.z1 - 0.35), 0xe0dccb, 2);
    add(new THREE.BoxGeometry(0.34, 0.28, 0.01), 'paper', T(-16.0, FY + C.floor + 1.5, C.z0 + 0.1), 0xb89a68, 2);
  }
  // ---------------- p-2's lean-to: gutter, tools on the wall, a stack of pots, a rag rug
  {
    const A = L.LEANTO;
    add(new THREE.BoxGeometry(A.x1 - A.x0 + 0.3, 0.07, 0.07), 'zinc', T((A.x0 + A.x1) / 2, Y(A.hFront - 0.02), A.z0 - 0.02), 0x8a8f8a, 1);
    for (const [x, len, c] of [[-15.45, 1.3, 0x7a5a3a], [-15.3, 1.1, 0x7a5a3a], [-13.45, 0.9, 0x6a6a6a]]) {
      add(new THREE.CylinderGeometry(0.012, 0.012, len, 5), 'wood', T(x, Y(1.3), A.z0 + 0.6, 0, 0.0, 0.0), c, 2);
    }
    add(new THREE.BoxGeometry(0.22, 0.03, 0.2), 'iron', T(-15.3, Y(0.65), A.z0 + 0.58), 0x777777, 2);
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.1, 0.07, 0.12, 8), 'terracotta', T(-13.0, Y(0.06 + i * 0.1), A.z0 + 0.45), 0xa8553a, 2);
    add(new THREE.BoxGeometry(0.9, 0.012, 0.6), 'fabric', T(-14.1, Y(0.007), 1.7), 0x9a5a4a, 2);
    for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), 'bark', T(-15.2 + (i % 3) * 0.17, Y(0.15 + Math.floor(i / 3) * 0.16), 2.35 - 0.0, 0, 0, Math.PI / 2), jit(0x8a6e52, rnd, 0.08), 2);
  }
  // ---------------- the bath planter: stains, a chip, ivy over the rim
  {
    const B = L.BATH, c = Math.cos(B.yaw), s = Math.sin(B.yaw);
    const at = (lx, lz) => [B.x + lx * c + lz * s, B.z - lx * s + lz * c];
    for (let i = 0; i < 6; i++) { const [x, z] = at(-0.7 + i * 0.28, B.hw + 0.001); add(new THREE.BoxGeometry(0.05, 0.18 + rnd() * 0.15, 0.004), 'iron', T(x, Y(0.35), z, B.yaw), 0x8a6a40, 2); }
    const [ix, iz] = at(0.2, -B.hw - 0.02);
    add(new THREE.CircleGeometry(0.09, 6), 'leaf', T(ix, Y(0.5), iz, B.yaw + Math.PI), 0x4a7a3a, 2);
  }
  // ---------------- p-1's patio: cloth, teapot and sugar bowl, a book
  {
    const Tb = L.PATIO1.table;
    add(new THREE.CylinderGeometry(Tb.r - 0.04, Tb.r - 0.04, 0.004, 14), 'fabric', T(Tb.x, Y(Tb.top + 0.002), Tb.z), 0xd8d2bd, 1);
    const tp = [Tb.x + 0.42, Tb.z - 0.28];
    add(new THREE.SphereGeometry(0.07, 10, 7), 'ceramic', T(tp[0], Y(Tb.top + 0.07), tp[1], 0, 0, 0, 1, 0.85, 1), 0xf0ebdc, 1);
    add(new THREE.CylinderGeometry(0.03, 0.04, 0.02, 8), 'ceramic', T(tp[0], Y(Tb.top + 0.14), tp[1]), 0x3f6aa6, 2);
    add(new THREE.BoxGeometry(0.15, 0.02, 0.11), 'paper', T(Tb.x - 0.25, Y(Tb.top + 0.015), Tb.z + 0.3, 0.4), 0xb04a3a, 2);
  }
  // ---------------- the garden gate, side gate and the passage's boards, ledges and braces
  {
    for (const [x, z0, z1, h] of [[-3.3, -1.1 - 0.92, -1.1 + 0.92, 1.45], [-3.3, 7.85 - 0.9, 7.85 + 0.9, 1.7]]) {
      const zc = (z0 + z1) / 2, len = z1 - z0;
      for (let u = 0.05; u < len - 0.02; u += 0.1) add(boxUV(0.095, h - 0.28, 0.02, 1), 'weathered', T(x + 0.025, Y(0.12 + (h - 0.28) / 2), z0 + u), jit(0x6f8a68, rnd, 0.08), 1);
      for (const yy of [0.25, h - 0.3]) add(boxUV(0.03, 0.12, len, 1), 'weathered', T(x + 0.05, Y(yy), zc), 0x5a7a58, 1);
      add(boxUV(0.03, 0.1, Math.hypot(len, h - 0.55), 1), 'weathered', matrixOf(x + 0.05, Y(h / 2 - 0.02), zc, [-Math.atan2(h - 0.55, len), 0, 0]), 0x5a7a58, 1);
    }
    // A downpipe's foot and a drain gully with a cover in the passage.
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 8), 'iron', T(-3.0, FY + 0.004, 5.2), 0x3a3a3a, 2);
    // Moss between the slabs and a few weeds at the fence foot.
    for (let i = 0; i < 12; i++) add(new THREE.CylinderGeometry(0.05, 0.06, 0.01, 6), 'leaf', T(-3.35 + rnd() * 0.1, FY + 0.005, -1.4 + rnd() * 9.6), jit(0x5a7a40, rnd, 0.1), 2);
  }
}

// ------------------------------------------------------------------ the few things that move
function animated(ctx, { rnd }) {
  const P = L.POND1, F = L.FOUNTAIN;
  // Fountain droplets, three ripple rings and a school of koi; butterflies on the buddleia. All of it asleep
  // unless the camera is within ~40 m, and the instanced meshes are tiny.
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xdfeff2, transparent: true, opacity: 0.7, depthWrite: false });
  dropMat.name = 'left-drops';
  const ND = 14;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.009, 4, 3), dropMat, ND);
  drops.frustumCulled = false; drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8f4f4, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  ringMat.name = 'left-ripple';
  const rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 24).rotateX(-Math.PI / 2), ringMat); m.position.set(F.x, Y(P.water + 0.004), F.z); m.frustumCulled = false; return m; });
  const koiMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  koiMat.name = 'left-koi';
  const NK = 6;
  const koi = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6).scale(0.28, 0.07, 0.1), koiMat, NK);
  koi.frustumCulled = false; koi.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  [0xe8742a, 0xf2eee0, 0xd8522a, 0xf0b060, 0x2a2a2a, 0xe8742a].forEach((c, i) => koi.setColorAt(i, col.setHex(c)));
  const wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  wingMat.name = 'left-wings';
  const NB = 5;
  const wings = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.04).translate(0.025, 0, 0).rotateX(-Math.PI / 2), wingMat, NB * 2);
  wings.frustumCulled = false; wings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  [0xd96a2a, 0xf0e6a0, 0x3a5aa0, 0xe8e0d0, 0xc9462a].forEach((c, i) => { wings.setColorAt(i * 2, col.setHex(c)); wings.setColorAt(i * 2 + 1, col.setHex(c)); });
  const bf = Array.from({ length: NB }, () => ({ ph: rnd() * 6, a: rnd() * 6, r: 0.5 + rnd() * 0.7, h: 1.0 + rnd() * 1.4 }));
  const o = new THREE.Object3D();
  let t = 0;
  const tick = (dt) => {
    t += Math.min(dt, 0.05);
    for (let i = 0; i < ND; i++) {
      const ph = ((t * 0.9 + i / ND) % 1), a = i * 2.4 + 0.5, spread = 0.045 + 0.05 * ((i * 7) % 5) / 5;
      const up = 0.55 * ph - 0.5 * 2.2 * ph * ph * 0.66;
      o.position.set(F.x + Math.cos(a) * spread * ph * 3.0, Y(F.h) + Math.max(-0.02, up * 0.42 + 0.05), F.z + Math.sin(a) * spread * ph * 3.0);
      o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix();
      drops.setMatrixAt(i, o.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
    rings.forEach((r, i) => { const p = ((t * 0.28 + i / 3) % 1), s = 0.08 + p * 0.6; r.scale.set(s, 1, s * 0.75); r.rotation.y = P.rot; r.visible = p < 0.97; });
    for (let i = 0; i < NK; i++) {
      const dir = i % 2 ? -1 : 1, sp = 0.22 + i * 0.03, a = t * sp * dir + i * 1.3, rx = (P.rx - 0.2) * (0.5 + 0.1 * i), rz = (P.rz - 0.15) * (0.5 + 0.1 * i);
      const cr = Math.cos(P.rot), sr = Math.sin(P.rot), lx = Math.cos(a) * rx, lz = Math.sin(a) * rz;
      const dx = -Math.sin(a) * rx * dir, dz = Math.cos(a) * rz * dir;
      o.position.set(P.x + lx * cr - lz * sr, Y(0.05 + 0.012 * Math.sin(t * 0.7 + i)), P.z + lx * sr + lz * cr);
      o.rotation.set(0, Math.atan2(-(dx * sr + dz * cr), dx * cr - dz * sr) + Math.sin(t * 2 + i) * 0.15, 0);
      o.scale.set(1 + (i % 3) * 0.12, 1, 1 + (i % 3) * 0.12); o.updateMatrix();
      koi.setMatrixAt(i, o.matrix);
    }
    koi.instanceMatrix.needsUpdate = true;
    bf.forEach((d, i) => {
      d.a += Math.min(dt, 0.05) * (0.5 + 0.2 * Math.sin(t + d.ph));
      const fl = Math.sin(t * 22 + d.ph) * 0.9;
      for (const s of [-1, 1]) {
        o.position.set(L.BUDDLEIA.x + Math.cos(d.a) * d.r * 1.2, Y(d.h) + Math.sin(t * 1.3 + d.ph) * 0.12, L.BUDDLEIA.z + Math.sin(d.a * 1.1) * d.r);
        o.rotation.set(0, -d.a + Math.PI / 2, s * fl);
        o.scale.set(s, 1, 1); o.updateMatrix();
        wings.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), o.matrix);
      }
    });
    wings.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  const pond = new THREE.Group(); pond.add(drops, koi, ...rings);
  ctx.object(pond, 1, [P.x, P.z]);
  ctx.object(wings, 1, [L.BUDDLEIA.x, L.BUDDLEIA.z]);
  ctx.update(tick);
}
