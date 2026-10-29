import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxUV, planeUV } from '../../batch.js';
import { buildHedge, buildTree, leafCards, mulberry } from '../kit.js';
import { FY } from '../../../sim/world/plan.js';
import { roofSlabs } from '../../../sim/world/shapes.js';
import * as A from '../../../sim/world/allotments.js';
import { placeChair } from '../../chairs.js';

// Draws the back lane and the allotments (AREAS.allotments in src/sim/world/plan.js; colliders and every
// number drawn here live in src/sim/world/allotments.js, so what you see is what you hit).
//
// What is here: the gravel lane (grass strip, puddles, verges, bins, a lamp post, a telegraph pole with
// wires), our garden's back gate under a honeysuckle arch, the allotment fence with its five-bar field gate
// and noticeboard, fourteen plots (vegetable rows, bean tunnel and wigwams, sweet peas, sunflower slalom,
// fruit and brassica cages, polytunnel, cold frames, butts, compost, bonfire, barrows, scarecrow, pond),
// five sheds and the tea hut, the park-edge hedge with its stile. Plants are swaying merged statics (one draw
// per material per chunk); the signboards and the netting are the only textures (512 and 128 px).
const { Y, Fr } = A;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ geometry helpers
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const mergeG = (list) => mergeGeometries(list.map(nonIdx));
function cylG(rt, rb, h, seg = 8) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  const uv = g.attributes.uv, r = Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * r, uv.getY(i) * h);
  return g;
}
function rodG(a, b, r0, r1 = r0, seg = 6) {
  const d = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)), L = d.length();
  const g = cylG(r1, r0, L, seg);
  const mid = new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}
// A leaf blade, base at the origin, standing up and leaning out along +z, narrowing to the tip.
function blade(len, wid, { yaw = 0, lean = 0.4, curl = 0.3, taper = 0.85, seg = 3, y0 = 0 } = {}) {
  const g = new THREE.PlaneGeometry(wid, len, 1, seg);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = y / len;
    p.setX(i, p.getX(i) * (1 - taper * t * t));
    p.setZ(i, lean * len * t + curl * len * t * t);
    p.setY(i, y - curl * len * t * t * 0.3 + y0);
  }
  g.rotateY(yaw);
  g.computeVertexNormals();
  return g;
}
function ico(r, detail = 1, sx = 1, sy = 1, sz = 1, y = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(sx, sy, sz); g.translate(0, y, 0);
  return g;
}
// A closed prism from two triangles (a0 a1 a2 front, b0 b1 b2 back), UVs in metres. pts: 6 world points.
function prism(pts) {
  const P = pts.map((p) => new THREE.Vector3(...p));
  const cen = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / 6);
  const faces = [[0, 1, 2], [3, 5, 4], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]];
  const pos = [], uv = [];
  for (const f of faces) {
    const tris = f.length === 3 ? [[f[0], f[1], f[2]]] : [[f[0], f[1], f[2]], [f[0], f[2], f[3]]];
    for (const [i, j, k] of tris) {
      const n = new THREE.Vector3().subVectors(P[j], P[i]).cross(new THREE.Vector3().subVectors(P[k], P[i]));
      const fc = P[i].clone().add(P[j]).add(P[k]).multiplyScalar(1 / 3).sub(cen);
      const order = n.dot(fc) >= 0 ? [i, j, k] : [i, k, j];
      const nn = n.normalize(), e1 = Math.abs(nn.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(nn).normalize();
      const e2 = nn.clone().cross(e1);
      for (const q of order) { pos.push(P[q].x, P[q].y, P[q].z); uv.push(P[q].dot(e1), P[q].dot(e2)); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath();
  for (let i = -4; i <= 8; i++) { g.moveTo(i * 32, 0); g.lineTo(i * 32 + 128, 128); g.moveTo(i * 32 + 128, 0); g.lineTo(i * 32, 128); }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// One 512 px sheet holds both signboards: the association's noticeboard (top) and the tea hut's board (bottom).
function signTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2f4b36'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#6b5a3c'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
  g.fillStyle = '#efe9d6'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center';
  g.fillText('ELM LANE ALLOTMENTS', 256, 52);
  g.font = 'italic 17px Georgia, serif'; g.fillText('Members please close the gate behind you', 256, 76);
  const notes = [[28, 96, 100, 70, '#f4efe0'], [140, 100, 90, 62, '#e8e2a8'], [244, 94, 110, 74, '#f4efe0'], [364, 98, 112, 66, '#d9e4ea'], [40, 180, 120, 56, '#efd7d0'], [180, 176, 104, 62, '#f4efe0'], [300, 176, 90, 60, '#e8e2a8'], [400, 174, 90, 64, '#f4efe0']];
  let s = 5; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (const [x, y, w, h, col] of notes) {
    g.fillStyle = col; g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((r() - 0.5) * 0.08); g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#8a3b2a'; g.beginPath(); g.arc(0, -h / 2 + 6, 3, 0, TAU); g.fill();
    g.fillStyle = '#3a3a3a';
    for (let l = 0; l < 5; l++) g.fillRect(-w / 2 + 8, -h / 2 + 16 + l * 8, (w - 16) * (0.5 + 0.5 * r()), 2);
    g.restore();
  }
  g.fillStyle = '#e9e2cc'; g.fillRect(0, 256, 512, 256);
  g.fillStyle = '#2a2a28'; g.fillRect(8, 264, 496, 240);
  g.fillStyle = '#f2efe4'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center';
  g.fillText('TEA HUT', 256, 330);
  g.font = 'italic 28px Georgia, serif'; g.fillText('kettle is always on', 256, 372);
  g.font = '26px Georgia, serif'; g.fillStyle = '#e8c547';
  g.fillText('tea 50p   biscuits 20p', 256, 430); g.fillText('(honesty tin on the table)', 256, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function signGeo(w, h, v0, v1) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

// ------------------------------------------------------------------ build
export function build(ctx) {
  const k = ctx.kit, wk = ctx.wk, gp = ctx.ground, T = ctx.T;
  const rnd = mulberry(20261017);
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const jit = (hex, kk = 0.07) => new THREE.Color(hex).multiplyScalar(1 + (rnd() - 0.5) * 2 * kk).getHex();
  const add = (g, m, M, c, lod = 1) => ctx.add(g, m, M, c, lod);
  const B = (m, c, w, h, d, x, hc, z, ry = 0, lod = 1, rx = 0, rz = 0) => add(boxUV(w, h, d, 1), m, T(x, FY + hc, z, ry, rx, rz), c, lod);
  const FB = (F, m, c, w, h, d, lx, hc, lz, ry = 0, lod = 1, rx = 0, rz = 0) => { const [x, z] = F.p(lx, lz); return B(m, c, w, h, d, x, hc, z, F.yaw + ry, lod, rx, rz); };
  const Cy = (m, c, rt, rb, h, x, hc, z, seg = 8, lod = 1, rx = 0, rz = 0, ry = 0) => add(cylG(rt, rb, h, seg), m, T(x, FY + hc, z, ry, rx, rz), c, lod);
  const FCy = (F, m, c, rt, rb, h, lx, hc, lz, seg = 8, lod = 1, rx = 0, rz = 0) => { const [x, z] = F.p(lx, lz); return Cy(m, c, rt, rb, h, x, hc, z, seg, lod, rx, rz, F.yaw); };
  const Rod = (m, c, a, b, r0, r1 = r0, seg = 6, lod = 1) => add(rodG([a[0], FY + a[1], a[2]], [b[0], FY + b[1], b[2]], r0, r1, seg), m, null, c, lod);
  const blobCache = new Map();
  const blobG = (r, seed = 1, amp = 0.2, detail = 1) => {
    const key = `${r.toFixed(2)}|${seed}|${amp}|${detail}`;
    if (!blobCache.has(key)) blobCache.set(key, ctx.blobGeometry(r, detail, seed, amp));
    return blobCache.get(key);
  };
  const Blob = (m, c, r, x, hc, z, { sx = 1, sy = 1, sz = 1, ry = 0, lod = 1, seed = 1 + Math.floor(rnd() * 5), amp = 0.2, detail = 1 } = {}) => add(blobG(r, seed, amp, detail), m, T(x, FY + hc, z, ry, 0, 0, sx, sy, sz), c, lod);

  const swLow = ctx.sway(k.leaf, { baseY: FY, height: 0.45, amount: 1.1 });
  const swMid = ctx.sway(k.leaf, { baseY: FY, height: 1.2, amount: 0.9 });
  const swTall = ctx.sway(k.leaf, { baseY: FY, height: 2.4, amount: 0.8 });
  const swPetal = ctx.sway(k.petal, { baseY: FY, height: 1.6, amount: 1.0 });
  const netMat = new THREE.MeshLambertMaterial({ map: netTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
  netMat.name = 'world-net';
  const poly = k.glass.clone();
  poly.side = THREE.DoubleSide; poly.opacity = 0.2; poly.name = 'kit-glass-poly';
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.85 });
  signMat.name = 'world-sign';

  // Weathered paint and timber colours.
  const COL = { oak: 0x9a8566, grey: 0x8c8678, silver: 0x9d9a90, pine: 0xc5a574, green: 0x56705a, sage: 0x7f947a, cream: 0xe3d9bd, blue: 0x55738f, red: 0x8b3d2c,
    felt: 0x2d2e2b, zinc: 0xa9b0b0, rust: 0x8a5a3c, black: 0x1f2021, brick: 0xa8553d, iron: 0x33383a };

  // ================================================================== ground
  {
    const g = gp;
    // The whole allotment: mown grass paths; the lane's gravel; plots dug over later.
    g.rect(-19.5, -24.5, 19.5, -9.4, { type: 'grass', color: '#6c8240' });
    g.path([[4, -9.6], [4, -23.6]], 1.1, { type: 'dirt', color: '#8a7656', alpha: 0.5 });
    g.rect(-19.5, -9.45, 19.5, -6.4, { type: 'gravel', color: '#a39a86' });
    g.rect(-26, -9.45, -19.5, -6.4, { type: 'gravel', color: '#a39a86' });
    g.rect(19.5, -9.45, 26, -6.4, { type: 'gravel', color: '#a39a86' });
    // Tyre ruts of dirt, the grass strip between them, scuffed edges.
    for (const z of [-7.12, -8.75]) g.path([[-26, z + 0.05], [-12, z - 0.06], [0, z + 0.04], [12, z - 0.05], [26, z + 0.03]], 0.55, { type: 'dirt', color: '#857359', alpha: 0.55 });
    g.path(Array.from({ length: 14 }, (_, i) => [-26 + i * 4, -7.93 + 0.1 * Math.sin(i * 1.7)]), 0.48, { type: 'grass', color: '#667a38' });
    g.path([[-26, -9.3], [26, -9.3]], 0.42, { type: 'meadow', color: '#6a7838', alpha: 0.95 });
    g.path([[-26, -6.55], [-1.2, -6.55]], 0.3, { type: 'meadow', color: '#6a7838', alpha: 0.8 });
    g.path([[3.2, -6.55], [26, -6.55]], 0.3, { type: 'meadow', color: '#6a7838', alpha: 0.8 });
    g.circle(1.9, -6.9, 0.9, { type: 'dirt', color: '#7e6c52', alpha: 0.65 });     // worn in front of our gate
    g.circle(3.9, -8.9, 1.3, { type: 'dirt', color: '#7e6c52', alpha: 0.6 });      // and the field gate
    for (const p of A.PUDDLES) g.poly(Array.from({ length: 14 }, (_, i) => [p.x + Math.cos(i / 14 * TAU) * p.rx * 1.15, p.z + Math.sin(i / 14 * TAU) * p.rz * 1.2]), { type: 'dirt', color: '#5d5545', alpha: 0.8 });

    // Plots: dug soil, one tone each, with mulch and weeds painted in.
    const soil = (x0, z0, x1, z1, col = '#523c2a', type = 'soil') => g.rect(x0, z0, x1, z1, { type, color: col });
    soil(-18.9, -14.6, -12.7, -10.6, '#4f3a29'); soil(-11.6, -14.6, -5.5, -10.6, '#574130'); soil(-4.4, -14.6, 2.4, -10.6, '#463425');
    soil(13.2, -14.6, 18.9, -10.6, '#5a4430'); soil(-18.9, -19.5, -12.7, -15.7, '#514131', 'dirt'); soil(-11.6, -19.5, -5.5, -15.7, '#4d3a29');
    soil(-4.4, -19.5, 2.4, -15.7, '#5b4632'); soil(5.6, -19.5, 12.1, -15.7, '#4a3827'); soil(13.2, -19.5, 18.9, -15.7, '#58432f');
    soil(-18.9, -23.2, -12.7, -20.6, '#47362a'); soil(-11.6, -23.2, -5.5, -20.6, '#523d2b'); soil(-4.4, -23.2, 2.4, -20.6, '#4d3b2a');
    soil(5.6, -23.2, 12.1, -20.6, '#563f2d'); soil(13.2, -23.2, 18.9, -20.6, '#4b392a');
    // The tea hut's green is mown; straw and woodchip under the hut's veranda, the barrows and the bonfire.
    g.rect(5.6, -14.6, 12.1, -10.6, { type: 'grass', color: '#71873f' });
    g.rect(A.HUT.x0 - 0.2, A.HUT.z0 - 0.2, A.HUT.deck.x1 + 0.1, A.HUT.deck.z1 + 0.05, { type: 'dirt', color: '#74644d' });
    g.circle(A.BONFIRE.x, A.BONFIRE.z, 1.5, { type: 'dirt', color: '#3a3128', alpha: 0.85 });
    g.circle(A.BONFIRE.x, A.BONFIRE.z, 0.9, { type: 'soil', color: '#2a231c', alpha: 0.9 });
    // straw mulch spread round crops: a few overlapping, ragged patches rather than one bright disc
    for (const [x, z, r] of [[-10.6, -16.8, 0.9], [-7.2, -19.1, 0.8], [15.8, -19.0, 0.9], [1.2, -22.1, 0.8], [-16.2, -17.6, 1.4], [8.6, -17.2, 1.0]]) {
      for (let i = 0; i < 4; i++) {
        const a = i * 1.9 + x, d = r * 0.35 * (i ? 1 : 0);
        g.circle(x + Math.cos(a) * d, z + Math.sin(a) * d, r * (i ? 0.55 : 0.7), { type: 'dirt', color: i % 2 ? '#9a8656' : '#8a7650', alpha: 0.45 });
      }
    }
    // the polytunnel's floor
    g.rect(A.PT.x0, A.PT.zc - 1.4, A.PT.x1, A.PT.zc + 1.4, { type: 'soil', color: '#3f3022' });
    g.rect(A.PT.x0, A.PT.zc - 0.45, A.PT.x1, A.PT.zc + 0.45, { type: 'dirt', color: '#8f7b5c' });
    // the pond bank
    g.circle(A.POND.x, A.POND.z, A.POND.r + 0.7, { type: 'meadow', color: '#58733a' });
    g.circle(A.POND.x, A.POND.z, A.POND.r + 0.1, { type: 'soil', color: '#3c3126' });
    // under the park hedge
    g.rect(-19.5, -24.5, 19.5, -23.8, { type: 'meadow', color: '#5f7836' });
  }

  // ================================================================== shadows
  {
    const g = gp;
    for (const S of Object.values(A.SHEDS)) {
      const F = new Fr(S.x, S.z, S.yaw), xs = [], zs = [];
      for (const [lx, lz] of [[-S.w / 2, -S.d / 2], [S.w / 2, -S.d / 2], [S.w / 2, S.d / 2], [-S.w / 2, S.d / 2]]) { const [x, z] = F.p(lx, lz); xs.push(x); zs.push(z); }
      g.shadowRect(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), (S.ridgeH || S.highH || S.wallH) * 0.8, 0.42);
    }
    const H = A.HUT;
    g.shadowRect(H.x0, H.z0, H.x1, H.z1, 2.9, 0.42);
    g.shadowRect(H.x0, H.z1, H.x1, H.roofFront, 2.0, 0.28);
    const P = A.PT;
    g.shadowRect(P.x0, P.zc - 1.5, P.x1, P.zc + 1.5, 1.3, 0.22);
    g.shadowRect(A.BT.x0, A.BT.zc - 0.9, A.BT.x1, A.BT.zc + 0.9, 1.4, 0.3);
    for (const c of A.CAGES) g.shadowRect(c.x0, c.z0, c.x1, c.z1, c.h * 0.9, 0.2);
    g.shadowRect(-19.5, A.FENCE_Z - 0.05, A.FENCES.chain.x1, A.FENCE_Z + 0.05, 1.2, 0.16);
    g.shadowRect(A.FENCES.rail.x0, A.FENCE_Z - 0.05, 19.5, A.FENCE_Z + 0.05, 1.0, 0.2);
    g.shadowRect(-19.5, A.PARK_HEDGE.z0, 19.5, A.PARK_HEDGE.z1, A.PARK_HEDGE.h * 0.7, 0.3);
    for (const p of A.POLES) g.shadowRect(p.x - 0.1, p.z - 0.1, p.x + 0.1, p.z + 0.1, p.h * 0.7, 0.3);
    g.shadowRect(A.LAMP.x - 0.05, A.LAMP.z - 0.05, A.LAMP.x + 0.05, A.LAMP.z + 0.05, A.LAMP.h * 0.7, 0.25);
    for (const b of A.BINS) g.shadowRect(b.x - 0.3, b.z - 0.35, b.x + 0.3, b.z + 0.35, 0.9, 0.35);
    for (const b of A.BUTTS) g.shadowCircle(b.x, b.z, b.r, b.h * 0.7, 0.3);
    for (const w of A.WIGWAMS) g.shadowCircle(w[0], w[1], w[2], w[3] * 0.5, 0.25);
    for (const r of A.PEA_ROWS) g.shadowRect(r[0], r[2] - r[4], r[1], r[2] + r[4], r[3] * 0.7, 0.2);
    g.shadowCircle(A.SCARECROW.x, A.SCARECROW.z, 0.3, 1.2, 0.2);
    g.shadowCircle(A.BONFIRE.x, A.BONFIRE.z, A.BONFIRE.r, 0.9, 0.3);
  }

  // ================================================================== plant geometry
  const PC = {};
  const plantGeo = (kind, v) => {
    const key = `${kind}${v}`;
    if (PC[key]) return PC[key];
    const L = [];
    const ring = (n, len, wid, o) => { for (let i = 0; i < n; i++) L.push(blade(len * (0.85 + 0.3 * ((i * 7 + v) % 5) / 5), wid, { yaw: i / n * TAU + v, ...o })); };
    switch (kind) {
      case 'cabbage': { const r = 0.12 + 0.012 * v; L.push(ico(r, 1, 1, 0.82, 1, r * 0.8)); ring(7, r * 1.7, r * 1.6, { lean: 1.1, curl: 0.5, taper: 0.5, y0: 0.01 }); break; }
      case 'leek': ring(6, 0.34, 0.05, { lean: 0.35, curl: 0.55, taper: 0.7, y0: 0.12 }); L.push(cylG(0.014, 0.02, 0.22, 6).translate(0, 0.11, 0)); break;
      case 'onion': ring(6, 0.3, 0.022, { lean: 0.18, curl: 0.5, taper: 0.9, y0: 0.03 }); L.push(ico(0.04, 0, 1, 0.85, 1, 0.025)); break;
      case 'lettuce': ring(9, 0.12, 0.095, { lean: 1.25, curl: 0.8, taper: 0.3, y0: 0.005 }); ring(5, 0.1, 0.07, { lean: 0.5, curl: 0.4, taper: 0.4, y0: 0.03 }); break;
      case 'potato': ring(8, 0.34, 0.14, { lean: 0.7, curl: 0.55, taper: 0.55, y0: 0.05 }); ring(5, 0.28, 0.12, { lean: 0.3, curl: 0.4, taper: 0.5, y0: 0.16 }); break;
      case 'beet': ring(7, 0.26, 0.075, { lean: 0.7, curl: 0.45, taper: 0.55, y0: 0.03 }); L.push(ico(0.035, 0, 1, 0.8, 1, 0.01)); break;
      case 'carrot': ring(9, 0.2, 0.026, { lean: 0.45, curl: 0.5, taper: 0.7, y0: 0.01 }); break;
      case 'chard': ring(7, 0.34, 0.13, { lean: 0.55, curl: 0.5, taper: 0.45, y0: 0.02 }); break;
      case 'kale': L.push(cylG(0.018, 0.026, 0.42, 6).translate(0, 0.21, 0)); for (let h = 0; h < 4; h++) ring(4, 0.26, 0.15, { lean: 1.3, curl: 0.7, taper: 0.3, y0: 0.12 + h * 0.08 }); break;
      case 'rhubarb': ring(7, 0.38, 0.3, { lean: 1.0, curl: 0.6, taper: 0.35, y0: 0.2 }); for (let i = 0; i < 6; i++) L.push(rodG([0, 0, 0], [Math.cos(i / 6 * TAU + v) * 0.16, 0.26, Math.sin(i / 6 * TAU + v) * 0.16], 0.018, 0.012, 5)); break;
      case 'corn': L.push(cylG(0.012, 0.018, 1.45, 6).translate(0, 0.72, 0)); for (let h = 0; h < 5; h++) ring(2, 0.55, 0.075, { lean: 1.1, curl: 0.9, taper: 0.75, y0: 0.35 + h * 0.2 }); L.push(ico(0.025, 0, 1, 2, 1, 1.5)); break;
      case 'bean': for (let i = 0; i < 3; i++) L.push(cylG(0.008, 0.01, 0.75, 5).translate(Math.cos(i * 2.1) * 0.05, 0.37, Math.sin(i * 2.1) * 0.05)); ring(8, 0.2, 0.1, { lean: 0.9, curl: 0.5, taper: 0.4, y0: 0.2 }); ring(6, 0.2, 0.1, { lean: 0.9, curl: 0.5, taper: 0.4, y0: 0.45 }); break;
      case 'strawb': ring(8, 0.13, 0.08, { lean: 1.0, curl: 0.7, taper: 0.3, y0: 0.02 }); break;
      case 'squash': L.push(ico(0.17, 1, 1, 0.7, 1, 0.1)); break;
      case 'squashleaf': ring(6, 0.3, 0.26, { lean: 1.7, curl: 0.2, taper: 0.2, y0: 0.05 }); break;
      case 'dahlia': ring(10, 0.4, 0.17, { lean: 0.8, curl: 0.4, taper: 0.5, y0: 0.05 }); ring(8, 0.3, 0.15, { lean: 0.4, curl: 0.3, taper: 0.5, y0: 0.4 }); break;
      case 'tomato': L.push(cylG(0.008, 0.01, 1.7, 5).translate(0, 0.85, 0)); for (let h = 0; h < 6; h++) ring(3, 0.24, 0.11, { lean: 0.9, curl: 0.5, taper: 0.4, y0: 0.2 + h * 0.25 }); break;
      case 'weed': ring(6, 0.28, 0.06, { lean: 0.5, curl: 0.5, taper: 0.7 }); break;
      default: ring(6, 0.2, 0.1);
    }
    PC[key] = mergeG(L);
    return PC[key];
  };
  const PLANT_COL = {
    cabbage: [0x7a9a78, 0x6f9070, 0x86a27c, 0x5f8566], leek: [0x6a8f6a, 0x5f8664], onion: [0x8aa65a, 0x7c9a52], lettuce: [0x8fb257, 0x9ac060, 0xa23f46, 0x7ea84e],
    potato: [0x4f7a3e, 0x56813f, 0x486f3a], beet: [0x5b7a46, 0x6a5a48], carrot: [0x6f9a46, 0x7aa24c], chard: [0x5a8a4c, 0x6a9250], kale: [0x4b6a50, 0x56755a, 0x435f4a],
    rhubarb: [0x6a8d3c, 0x74963e], corn: [0x8aa94c, 0x7b9c46], bean: [0x5f8a3a, 0x6b9442], strawb: [0x6e9a42], squash: [0xd8782a, 0xe09436, 0xc8873a], squashleaf: [0x5e8a3a],
    dahlia: [0x4d7d38, 0x5a8a40], tomato: [0x5c8a3c, 0x66963f], weed: [0x6a8a3a, 0x7a9a44],
  };
  const MATS = { cabbage: swLow, leek: swLow, onion: swLow, lettuce: swLow, potato: swLow, beet: swLow, carrot: swLow, chard: swLow, kale: swMid, rhubarb: swLow, corn: swTall, bean: swMid, strawb: swLow, squash: swLow, squashleaf: swLow, dahlia: swMid, tomato: swTall, weed: swLow };
  // A grid of plants in a rectangle (rows run along x); skip(x, z) leaves gaps. Each is one merged static.
  function bed(kind, x0, z0, x1, z1, dx, dz, o = {}) {
    const cols = PLANT_COL[kind];
    for (let z = z0 + dz / 2; z < z1; z += dz) {
      for (let x = x0 + dx / 2; x < x1; x += dx) {
        if (o.skip && o.skip(x, z)) continue;
        const px = x + rr(-0.03, 0.03), pz = z + rr(-0.03, 0.03), s = (o.scale ?? 1) * rr(0.85, 1.15);
        const v = Math.floor(rnd() * 3);
        add(plantGeo(kind, v), MATS[kind], T(px, FY + (o.y ?? 0), pz, rnd() * TAU, 0, 0, s, s * (o.sy ?? 1), s), jit(pick(cols), 0.08), o.lod ?? 1);
        if (kind === 'squash') add(plantGeo('squash', 0), MATS.squash, T(px + 0.1, FY, pz + 0.05, 0, 0, 0, 0.6, 0.6, 0.6), jit(0xd8782a), 2);
        if (o.fruit) o.fruit(px, pz, s);
      }
    }
  }
  // Furrows and ridges in a dug plot (rows along x): soil ridges in k.soil.
  function ridges(x0, z0, x1, z1, dz, col = 0x4a3726, h = 0.12) {
    for (let z = z0 + dz / 2; z < z1; z += dz) B(k.soil, jit(col, 0.12), x1 - x0, h, dz * 0.6, (x0 + x1) / 2, h / 2, z, 0, 1);
  }
  function weeds(n, x0, z0, x1, z1) { for (let i = 0; i < n; i++) add(plantGeo('weed', i % 3), swLow, T(rr(x0, x1), FY, rr(z0, z1), rnd() * TAU, 0, 0, rr(0.7, 1.3), rr(0.8, 1.5), rr(0.7, 1.3)), jit(pick(PLANT_COL.weed)), 2); }

  // ================================================================== the lane
  {
    // Verges: cow parsley, nettles, docks and grass tufts along the fence, patches along our side.
    const parsley = (x, z, h) => {
      const n = 5 + Math.floor(h * 6);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, d = rr(0.02, 0.2), hh = h * rr(0.55, 1.05), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        Rod(swMid, 0x7a9a50, [px, 0, pz], [px + rr(-0.06, 0.06), hh, pz + rr(-0.06, 0.06)], 0.006, 0.004, 4, 1);
        for (let q = 0; q < 4; q++) Blob(swPetal, 0xf4f2e6, 0.034, px + Math.cos(q * 1.6) * 0.05, hh + 0.03, pz + Math.sin(q * 1.6) * 0.05, { sy: 0.5, lod: q ? 2 : 1, detail: 0, seed: i });
        if (i % 2 === 0) add(blade(hh * 0.5, 0.1, { yaw: a, lean: 0.8, curl: 0.5, taper: 0.4 }), swMid, T(px, FY, pz), jit(0x5e8a3c), 2);
      }
      for (let i = 0; i < 4; i++) add(blade(0.35, 0.14, { yaw: i * 1.6, lean: 0.9, curl: 0.5, taper: 0.4 }), swLow, T(x, FY, z), jit(0x5e8a3c), 1);
    };
    const nettle = (x, z, h) => { for (let i = 0; i < 9; i++) add(blade(h * rr(0.6, 1), 0.12, { yaw: i * 0.7 + rr(0, 0.5), lean: 0.4, curl: 0.5, taper: 0.5 }), swMid, T(x + rr(-0.1, 0.1), FY, z + rr(-0.1, 0.1)), jit(0x3f6a34, 0.1), 1); };
    const dock = (x, z, h) => { for (let i = 0; i < 6; i++) add(blade(0.45, 0.2, { yaw: i * 1.1, lean: 1.2, curl: 0.5, taper: 0.4 }), swLow, T(x, FY, z), jit(0x5f7e34), 1); Rod(swMid, 0x8a4a2a, [x, 0, z], [x, h, z], 0.008, 0.006, 4, 1); Blob(swMid, 0x8a4a2a, 0.04, x, h, z, { sy: 2.2, detail: 0, lod: 2 }); };
    for (const v of A.VERGE) (v.kind === 'parsley' ? parsley : v.kind === 'nettle' ? nettle : dock)(v.x, v.z, v.h);
    for (let x = -19.3; x < 19.3; x += rr(0.5, 1.1)) {
      const z = rnd() < 0.7 ? rr(-9.35, -9.1) : rr(-6.75, -6.45);
      if (Math.abs(x - 1.9) < 0.9 && z > -7.5) continue;
      for (let i = 0; i < 7; i++) add(blade(rr(0.12, 0.3), 0.025, { yaw: rnd() * TAU, lean: 0.6, curl: 0.7, taper: 0.9 }), swLow, T(x + rr(-0.08, 0.08), FY, z + rr(-0.08, 0.08)), jit(0x6f8a3c, 0.1), 2);
    }
    // Along our side of the lane: dandelion clocks, a clump of nettles at each hedge foot.
    for (let x = -19; x < 19; x += rr(1.6, 3.4)) { if (Math.abs(x - 1.9) < 1.2) continue; if (rnd() < 0.5) nettle(x, rr(-6.8, -6.5), rr(0.4, 0.7)); else dock(x, rr(-6.8, -6.5), 0.5); }
    // Grass strip tufts down the middle.
    for (let x = -19.4; x < 19.4; x += rr(0.3, 0.7)) for (let i = 0; i < 5; i++) add(blade(rr(0.12, 0.26), 0.022, { yaw: rnd() * TAU, lean: 0.5, curl: 0.8, taper: 0.9 }), swLow, T(x + rr(-0.1, 0.1), FY, -7.93 + rr(-0.18, 0.18)), jit(0x6c8a3a, 0.1), 2);
    // Puddles: dark still water (the sky shows in it).
    {
      const pg = [];
      for (const p of A.PUDDLES) {
        const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2);
        g.scale(p.rx, 1, p.rz); g.translate(p.x, FY + 0.004, p.z);
        pg.push(g);
      }
      const m = new THREE.Mesh(mergeG(pg), wk.water);
      m.renderOrder = -1;
      ctx.object(m, 1);
    }
    // Wheelie bins by the fence: body, sloped lid, wheels, axle, a stray bag by one.
    for (const b of A.BINS) {
      const F = new Fr(b.x, b.z, b.yaw);
      FB(F, k.paint, b.col, 0.56, 0.9, 0.7, 0, 0.5, 0, 0, 1);
      FB(F, k.paint, b.col, 0.6, 0.06, 0.74, 0, 1.0, 0.0, 0, 1, 0.05);
      FB(F, k.paint, jit(b.col, 0.1), 0.62, 0.05, 0.08, 0, 1.03, 0.38, 0, 1);
      FB(F, k.rubber, 0x1c1c1c, 0.08, 0.2, 0.2, -0.28, 0.1, -0.3, 0, 1); FB(F, k.rubber, 0x1c1c1c, 0.08, 0.2, 0.2, 0.28, 0.1, -0.3, 0, 1);
      FB(F, k.rubber, 0x1c1c1c, 0.5, 0.06, 0.1, 0, 1.05, -0.36, 0, 2);
    }
    Blob(k.fabric, 0x1f2224, 0.2, -12.25, 0.2, -8.7, { sx: 1.1, sy: 0.9, lod: 1 });
    // Lamp post: steel pole, bracket arm, lantern with a glass panel.
    {
      const L = A.LAMP;
      Cy(k.steel, 0x39463f, 0.04, 0.06, L.h, L.x, L.h / 2, L.z, 8, 0);
      Cy(k.steel, 0x39463f, 0.09, 0.09, 0.4, L.x, 0.2, L.z, 8, 1);
      B(k.steel, 0x39463f, 0.4, 0.04, 0.04, L.x - 0.18, L.h, L.z, 0, 1);
      B(k.steel, 0x39463f, 0.36, 0.05, 0.16, L.x - 0.36, L.h - 0.0, L.z, 0, 1);
      B(k.paint, 0xf3e8c8, 0.3, 0.07, 0.15, L.x - 0.36, L.h - 0.06, L.z, 0, 1);
      add(new THREE.CylinderGeometry(0.0, 0.2, 0.1, 4).rotateY(Math.PI / 4), k.steel, T(L.x - 0.36, FY + L.h + 0.07, L.z), 0x39463f, 1);
    }
    // Telegraph poles with cross-arms, insulators and steps, and the wires between them.
    for (const p of A.POLES) {
      const tilt = p.x < 0 ? 0.012 : -0.01;
      add(cylG(0.075, 0.115, p.h, 9), k.weathered, T(p.x, FY + p.h / 2, p.z, 0, 0, tilt), 0x4a3b2d, 0);
      B(k.weathered, 0x47392b, 0.1, 0.12, 1.3, p.x, p.h - 0.4, p.z, 0, 1);
      B(k.weathered, 0x47392b, 0.06, 0.4, 0.06, p.x, p.h - 0.65, p.z + 0.2, 0, 2, 0, 0.5);
      for (const z of [-0.6, -0.2, 0.2, 0.6]) Cy(k.ceramic, 0x6b5a48, 0.025, 0.04, 0.1, p.x, p.h - 0.28, p.z + z, 7, 1);
      for (let h = 1.5; h < 4.5; h += 0.45) B(k.iron, 0x2a2a2a, 0.025, 0.02, 0.12, p.x - 0.1, h, p.z, 0, 2);
      B(k.paper, 0xd8d4c8, 0.3, 0.12, 0.01, p.x - 0.1, 1.6, p.z - 0.1, 0, 2);           // a faded poster
    }
    for (const wz of A.WIRE_Z) {
      const [a, b] = A.POLES, n = 10;
      let prev = [a.x, A.WIRE_H, wz];
      for (let i = 1; i <= n; i++) {
        const t = i / n, x = a.x + (b.x - a.x) * t, h = A.WIRE_H - A.WIRE_SAG * 4 * t * (1 - t);
        Rod(k.iron, 0x1c1c1c, prev, [x, h, wz], 0.008, 0.008, 4, 0);
        prev = [x, h, wz];
      }
    }
    // A swallow on the wire.
    Blob(k.fabric, 0x1c2230, 0.035, -2.3, A.WIRE_H - A.WIRE_SAG * 4 * 0.5 * 0.5 + 0.04, A.WIRE_Z[0], { sx: 1.4, sy: 0.9, lod: 1, detail: 0 });
  }

  // ================================================================== our back gate: timber arch, honeysuckle, an open gate
  {
    const G = A.GATE, oak = COL.oak, xm = (G.x0 + G.x1) / 2, zc = G.zc;
    for (const px of [G.x0 - 0.05, G.x1 + 0.05]) {
      B(k.weathered, oak, G.postT, G.postH, 0.12, px, G.postH / 2, zc, 0, 0);
      B(k.weathered, jit(oak), 0.15, 0.04, 0.16, px, G.postH + 0.02, zc, 0, 1);
      B(k.weathered, jit(oak), 0.06, 0.5, 0.05, px + (px < xm ? 0.09 : -0.09), G.postH - 0.4, zc, 0, 1, 0, px < xm ? 0.7 : -0.7);   // brace
    }
    B(k.weathered, oak, 1.0, 0.16, 0.14, xm, G.beamH, zc, 0, 0);
    B(k.weathered, jit(oak), 0.96, 0.06, 0.2, xm, G.beamH + 0.11, zc, 0, 1);
    B(k.weathered, jit(oak), 0.4, 0.08, 0.1, xm, G.beamH + 0.2, zc, 0, 1, 0, 0);
    // Honeysuckle: dark leafy lumps on the arch and down the posts, cream and apricot flowers, leaf cards.
    const hs = wk.leafy, leafPts = [];
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1, t = rnd();
      const px = i < 8 ? xm + rr(-0.45, 0.45) : (side < 0 ? G.x0 - 0.1 - rr(0, 0.25) : G.x1 + 0.1 + rr(0, 0.25));
      const h = i < 8 ? G.beamH + 0.12 + rr(0, 0.18) : rr(0.8, 2.15);
      Blob(hs, jit(0xa0b888, 0.12), rr(0.1, 0.17), px, h, zc + rr(-0.14, 0.14) + (side * t * 0.1), { sx: 1.1, sy: 0.8, lod: 0 });
      leafPts.push([px + rr(-0.1, 0.1), FY + h + 0.05, zc + rr(-0.2, 0.2), rr(-1, 1), 0.3, rr(-1, 1)]);
    }
    for (let i = 0; i < 24; i++) {
      const px = rnd() < 0.5 ? xm + rr(-0.46, 0.46) : (rnd() < 0.5 ? G.x0 - 0.1 - rr(0, 0.3) : G.x1 + 0.1 + rr(0, 0.3));
      const h = Math.abs(px - xm) < 0.5 ? G.beamH + 0.12 + rr(0, 0.25) : rr(1.0, 2.15);
      add(new THREE.ConeGeometry(0.014, 0.07, 5), k.petal, T(px, FY + h, zc + rr(-0.22, 0.22), rr(0, 6), rr(0.8, 2.2), rr(0, 6)), pick([0xf1e6c0, 0xf0d9a0, 0xe8b88a, 0xf4ecd0]), 2);
    }
    // Hanging strands inside the corners of the arch (outside the 0.7 m gap).
    for (const px of [G.x0 - 0.06, G.x1 + 0.06]) for (let i = 0; i < 3; i++) Rod(swMid, 0xa0b888, [px, G.beamH - 0.05, zc + rr(-0.1, 0.1)], [px + rr(-0.02, 0.02), G.beamH - rr(0.3, 0.7), zc + rr(-0.1, 0.1)], 0.006, 0.004, 4, 2);
    ctx.object(leafCards(ctx, leafPts, { size: 0.12, hue: 105 }), 2);
    // The open gate leaf, hinged on the west post and swung into the lane: pickets, rails, brace, hinges, latch.
    const L = A.GATE_LEAF, F = new Fr(L.hingeX, L.z0, Math.PI / 2);
    const len = L.z0 - L.z1, white = 0xe6dfcb;
    FB(F, k.paint, jit(white, 0.04), len, 0.07, 0.04, len / 2, 0.15, 0, 0, 1);
    FB(F, k.paint, jit(white, 0.04), len, 0.07, 0.04, len / 2, 0.52, 0, 0, 1);
    FB(F, k.paint, jit(white, 0.04), len, 0.07, 0.04, len / 2, 0.96, 0, 0, 1);
    for (let i = 0; i < 8; i++) {
      const x = 0.05 + i * (len - 0.1) / 7;
      FB(F, k.paint, jit(white, 0.05), 0.065, 0.92, 0.018, x, 0.57, 0.03, 0, 1);
      FB(F, k.paint, jit(white, 0.05), 0.065, 0.065, 0.018, x, 1.05, 0.03, 0, 1, 0, Math.PI / 4);
    }
    FB(F, k.paint, jit(white, 0.04), len * 1.12, 0.06, 0.03, len / 2, 0.52, -0.03, 0, 1, 0, 0.62);
    for (const h of [0.14, 0.92]) FB(F, k.iron, 0x25272a, 0.25, 0.025, 0.01, 0.1, h, 0.05, 0, 1);
    FB(F, k.iron, 0x25272a, 0.1, 0.04, 0.01, len - 0.07, 0.8, 0.05, 0, 2);
    // Worn grass dragged flat where it swings.
    gp.circle(1.2, -6.9, 0.7, { type: 'dirt', color: '#7e6c52', alpha: 0.4 });
  }

  // ================================================================== the allotment fence, field gate, noticeboard
  {
    const FZ = A.FENCE_Z, C = A.FENCES.chain, R = A.FENCES.rail, g = A.FIELD_GATE;
    // Chain-link: galvanised posts, a top rail, a bottom wire and the mesh itself, with bramble tangles.
    const len = C.x1 - C.x0;
    add(planeUV(len, C.h - 0.05, 5), netMat, T((C.x0 + C.x1) / 2, FY + 0.05 + (C.h - 0.05) / 2, FZ), 0xaeb4b4, 0);
    const nC = Math.round(len / 2.4);
    for (let i = 0; i <= nC; i++) {
      const x = C.x0 + len * i / nC;
      Cy(k.zinc, 0x9aa2a2, 0.03, 0.03, C.h + 0.1, x, (C.h + 0.1) / 2 - 0.0, FZ - 0.04, 6, 0);
      if (i % 4 === 1) Rod(k.zinc, 0x9aa2a2, [x, 0.1, FZ - 0.04], [x + 0.5, C.h + 0.08, FZ - 0.04], 0.012, 0.012, 5, 2);
    }
    Rod(k.zinc, 0x9aa2a2, [C.x0, C.h + 0.08, FZ - 0.04], [C.x1, C.h + 0.08, FZ - 0.04], 0.016, 0.016, 5, 1);
    Rod(k.zinc, 0x8c9494, [C.x0, 0.06, FZ - 0.02], [C.x1, 0.06, FZ - 0.02], 0.007, 0.007, 4, 2);
    for (let i = 0; i < 26; i++) { const x = rr(C.x0 + 0.5, C.x1 - 0.3); Blob(wk.leafy, jit(0xa0b888, 0.15), rr(0.18, 0.4), x, rr(0.3, 0.9), FZ - 0.08 + rr(-0.04, 0.12), { sx: rr(1.2, 2.2), sy: 0.8, sz: 0.6, lod: 1, amp: 0.35 }); }
    for (let i = 0; i < 6; i++) Blob(wk.leafy, jit(0xa0b888, 0.15), rr(0.2, 0.3), rr(C.x0 + 1, C.x1 - 1), rr(1.0, 1.3), FZ - 0.06, { sx: 1.8, sy: 0.7, sz: 0.5, lod: 1, amp: 0.35 });
    // Post-and-rail east of the gate.
    const nR = Math.round((R.x1 - R.x0) / 2.4);
    for (let i = 0; i <= nR; i++) {
      const x = R.x0 + (R.x1 - R.x0) * i / nR;
      B(k.weathered, jit(COL.grey, 0.1), 0.1, R.h + 0.08, 0.1, x, (R.h + 0.08) / 2, FZ, 0, 0);
      B(k.weathered, jit(COL.silver, 0.08), 0.12, 0.025, 0.12, x, R.h + 0.09, FZ, 0, 1);
    }
    for (const rh of [0.3, 0.72, 1.12]) B(k.weathered, jit(COL.grey, 0.08), R.x1 - R.x0, 0.07, 0.044, (R.x0 + R.x1) / 2, rh, FZ + 0.06, 0, 0);
    // Gate posts with caps, the five-bar gate, braces, hinges, chain and latch.
    for (const px of [g.x0, g.x1]) {
      B(k.weathered, COL.oak, g.post, g.postH, g.post, px, g.postH / 2, FZ, 0, 0);
      B(k.weathered, jit(COL.oak), g.post + 0.04, 0.05, g.post + 0.04, px, g.postH + 0.02, FZ, 0, 1);
      B(k.weathered, jit(COL.oak), g.post + 0.02, 0.05, g.post + 0.02, px, g.postH - 0.06, FZ, 0, 2, 0, 0);
    }
    const gx0 = g.leaf0, gx1 = g.leaf1, gm = (gx0 + gx1) / 2, gw = gx1 - gx0;
    for (const bh of g.bars) B(k.weathered, jit(0xb0a284, 0.06), gw, g.barHalf * 2, g.barT, gm, bh, FZ, 0, 0);
    for (const sx of [gx0 + 0.04, gx1 - 0.04]) B(k.weathered, jit(0xb0a284, 0.06), 0.08, g.bars[4] - g.bars[0] + 0.1, g.barT, sx, (g.bars[4] + g.bars[0]) / 2, FZ, 0, 0);
    B(k.weathered, jit(0xb0a284, 0.06), 0.08, g.bars[4] - g.bars[0] + 0.1, g.barT, gm + 0.2, (g.bars[4] + g.bars[0]) / 2, FZ, 0, 0);
    Rod(k.weathered, jit(0xb0a284, 0.06), [gx0 + 0.08, g.bars[0], FZ], [gx1 - 0.08, g.bars[4], FZ], 0.03, 0.03, 6, 0);
    for (const h of [0.35, 1.35]) { B(k.iron, 0x23262a, 0.3, 0.035, 0.012, gx0 + 0.15, h, FZ - 0.03, 0, 1); B(k.iron, 0x23262a, 0.3, 0.035, 0.012, gx0 + 0.15, h, FZ + 0.03, 0, 2); }
    B(k.iron, 0x23262a, 0.22, 0.035, 0.012, gx1 - 0.16, 1.3, FZ - 0.03, 0, 1);
    Rod(k.iron, 0x2a2c2e, [gx1 - 0.04, 1.28, FZ - 0.05], [g.x1 - 0.1, 1.22, FZ - 0.09], 0.006, 0.006, 4, 2);
    Blob(k.iron, 0x5a3a20, 0.035, g.x1 - 0.1, 1.2, FZ - 0.1, { detail: 0, sx: 1.2, sy: 1.4, lod: 2 });            // padlock
    // Weeds and a worn patch at the gate's foot, bramble over the east post.
    for (let i = 0; i < 12; i++) add(blade(rr(0.15, 0.3), 0.03, { yaw: rnd() * TAU, lean: 0.6, curl: 0.6, taper: 0.9 }), swLow, T(rr(g.x0 - 0.2, g.x0 + 0.1), FY, FZ + rr(-0.1, 0.12)), jit(0x6f8a3c), 2);
    Blob(wk.leafy, 0xa0b888, 0.3, g.x1 + 0.1, 0.5, FZ + 0.05, { sx: 1.1, sy: 0.9, lod: 1, amp: 0.3 });
    // Noticeboard on two posts, with a little roof and the signboard texture.
    {
      const n = A.NOTICE;
      for (const sx of [-1, 1]) B(k.weathered, COL.oak, 0.08, n.y0 + n.h, 0.08, n.x + sx * (n.w / 2 - 0.05), (n.y0 + n.h) / 2, n.z, 0, 1);
      B(k.weathered, 0x60503a, n.w, n.h, 0.05, n.x, n.y0 + n.h / 2, n.z, 0, 1);
      B(k.weathered, 0x7a6a4c, n.w + 0.1, 0.05, 0.13, n.x, n.y0 + n.h + 0.05, n.z, 0, 1);
      B(k.weathered, 0x7a6a4c, n.w + 0.1, 0.03, 0.04, n.x, n.y0 + n.h + 0.0, n.z + 0.07, 0, 2, 0.5);
      const m = new THREE.Mesh(signGeo(n.w - 0.06, n.h - 0.06, 0.5, 1), signMat);
      m.position.set(n.x, Y(n.y0 + n.h / 2), n.z + 0.028);
      ctx.object(m, 1);
    }
  }

  // ================================================================== sheds
  function cladding(F, S, col, mat, opt = {}) {
    // Wall boxes with openings left open, battens on the outside, corner boards.
    const boxes = A.wallBoxes(S);
    for (const b of boxes) {
      FB(F, mat, col, b.hx * 2, b.hy * 2, b.hz * 2, b.cx, b.h, b.cz, 0, 0);
      if (opt.battens) {
        const outward = b.wall === 'front' ? 1 : b.wall === 'back' ? -1 : 0, outX = b.wall === 'right' ? 1 : b.wall === 'left' ? -1 : 0;
        const alongX = b.wall === 'front' || b.wall === 'back', len = alongX ? b.hx * 2 : b.hz * 2;
        for (let u = -len / 2 + 0.15; u < len / 2 - 0.05; u += opt.battens) {
          const c = alongX ? b.cx + u : b.cz + u;
          if (alongX) FB(F, mat, jit(col, 0.05), 0.045, b.hy * 2, 0.02, c, b.h, b.cz + outward * (b.hz + 0.009), 0, 1);
          else FB(F, mat, jit(col, 0.05), 0.02, b.hy * 2, 0.045, b.cx + outX * (b.hx + 0.009), b.h, c, 0, 1);
        }
      }
      if (opt.laps) {
        const outward = b.wall === 'front' ? 1 : b.wall === 'back' ? -1 : 0, outX = b.wall === 'right' ? 1 : b.wall === 'left' ? -1 : 0;
        const alongX = b.wall === 'front' || b.wall === 'back';
        for (let y = b.h - b.hy + 0.14; y < b.h + b.hy - 0.02; y += opt.laps) {
          if (alongX) FB(F, mat, jit(col, 0.06), b.hx * 2, 0.014, 0.012, b.cx, y, b.cz + outward * (b.hz + 0.005), 0, 2);
          else FB(F, mat, jit(col, 0.06), 0.012, 0.014, b.hz * 2, b.cx + outX * (b.hx + 0.005), y, b.cz, 0, 2);
        }
      }
    }
    for (const h of A.wallHulls(S)) {
      const pts = h.map(([lx, hh, lz]) => { const [x, z] = F.p(lx, lz); return [x, FY + hh, z]; });
      add(prism(pts), mat, null, col, 0);
    }
    // corner posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const hh = S.style === 'mono' ? (sx > 0 ? S.highH : S.wallH) : S.wallH;
      FB(F, k.weathered, opt.trim ?? COL.cream, 0.065, hh, 0.065, sx * (S.w / 2 + 0.003), hh / 2, sz * (S.d / 2 + 0.003), 0, 1);
    }
  }
  function doorLeaf(F, lx, hc, lz, ry, w, h, col, mat = k.weathered, open = false) {
    // A ledged-and-braced door lying in the plane that is ry from the frame's x axis, hinged at (lx, lz).
    const [x, z] = F.p(lx, lz), yaw = F.yaw + ry, c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, y, o = 0) => [x + c * u + s * o, y, z - s * u + c * o];
    const put = (m, cl, ww, hh, dd, u, y, o, lod = 1, rz = 0) => { const p = at(u, y, o); B(m, cl, ww, hh, dd, p[0], p[1], p[2], yaw, lod, 0, rz); };
    put(mat, col, w, h, 0.03, w / 2, h / 2, 0, 0);
    for (const y of [0.18, h / 2, h - 0.18]) put(mat, jit(col, 0.06), w * 0.9, 0.12, 0.02, w / 2, y, 0.022, 1);
    put(mat, jit(col, 0.06), Math.hypot(w, h * 0.55) * 0.9, 0.1, 0.02, w / 2, h / 2, 0.022, 1, Math.atan2(h * 0.55, w) * -1);
    put(k.iron, 0x25272a, 0.3, 0.03, 0.01, 0.15, h - 0.15, 0.036, 1); put(k.iron, 0x25272a, 0.3, 0.03, 0.01, 0.15, 0.2, 0.036, 1);
    put(k.iron, 0x2a2c2e, 0.03, 0.12, 0.04, w - 0.07, h * 0.5, 0.03, 1);
    void open; void hc; void ry;
  }
  function win(F, lx, hc, lz, ry, w, h, { glass = true, frame = COL.cream, bars = 2, curtain = false } = {}) {
    const [x, z] = F.p(lx, lz), yaw = F.yaw + ry, c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, y, o = 0) => [x + c * u + s * o, y, z - s * u + c * o];
    const put = (m, cl, ww, hh, dd, u, y, o, lod = 1) => { const p = at(u, y, o); B(m, cl, ww, hh, dd, p[0], p[1], p[2], yaw, lod); };
    const f = 0.045, y0 = hc - h / 2;
    put(k.paint, frame, w + f * 2, f, 0.09, 0, y0 + h + f / 2, 0); put(k.paint, frame, w + f * 2, f, 0.09, 0, y0 - f / 2, 0);
    put(k.paint, frame, f, h, 0.09, -w / 2 - f / 2, hc, 0); put(k.paint, frame, f, h, 0.09, w / 2 + f / 2, hc, 0);
    put(k.stone, 0xb0aa9a, w + 0.14, 0.03, 0.14, 0, y0 - f - 0.015, 0.03);
    if (glass) {
      const p = at(0, hc, 0);
      add(new THREE.PlaneGeometry(w, h), k.glass, T(p[0], FY + p[1], p[2], yaw), 0xc8d8dc, 1);
      for (let i = 1; i < bars; i++) put(k.paint, frame, 0.02, h, 0.03, -w / 2 + w * i / bars, hc, 0.01, 2);
      put(k.paint, frame, w, 0.02, 0.03, 0, hc, 0.01, 2);
    }
    if (curtain) { const p = at(0, hc + h * 0.2, -0.03); add(new THREE.PlaneGeometry(w * 0.9, h * 0.5), k.fabric, T(p[0], FY + p[1], p[2], yaw), 0xe9e1cf, 2); }
  }
  function roofDetails(F, S, col, kind) {
    for (const r of A.roofPieces(S)) {
      const m = (kind === 'felt') ? k.paint : (kind === 'tile' ? k.paint : k.zinc);
      FB(F, m, col, r.half[0] * 2, r.half[1] * 2, r.half[2] * 2, r.c[0], r.c[1], r.c[2], 0, 0, 0, r.r[2]);
      if (kind === 'corrugated') {
        // ribs
        const n = Math.round(r.half[0] * 2 / 0.12);
        for (let i = 0; i < n; i++) {
          const u = -r.half[0] + (i + 0.5) / n * r.half[0] * 2;
          const cr = Math.cos(r.r[2]), sr = Math.sin(r.r[2]);
          FB(F, k.zinc, jit(col, 0.05), 0.045, 0.02, r.half[2] * 2, r.c[0] + cr * u, r.c[1] + sr * u + 0.03, r.c[2], 0, 2, 0, r.r[2]);
        }
      }
      if (kind === 'tile') {
        const cr = Math.cos(r.r[2]), sr = Math.sin(r.r[2]);
        for (let u = -r.half[0] + 0.15; u < r.half[0] - 0.05; u += 0.2) FB(F, k.paint, jit(col, 0.14), 0.025, 0.014, r.half[2] * 2 * 0.98, r.c[0] + cr * u, r.c[1] + sr * u + 0.024, r.c[2], 0, 2, 0, r.r[2]);
      }
    }
  }

  // ---- Shed A: green board-and-batten, apex roof, open door, shelf with the mug, potting bench
  {
    const S = A.SHEDS.A, F = new Fr(S.x, S.z, S.yaw);
    cladding(F, S, COL.green, k.paint, { battens: 0.42, trim: COL.cream });
    roofDetails(F, S, 0x3a3a38, 'tile');
    // ridge cap and barge boards
    FB(F, k.weathered, 0x2a2a28, 0.16, 0.05, S.d + 0.38, 0, S.ridgeH + 0.03, 0, 0, 1);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) FB(F, k.paint, COL.cream, 0.04, 0.8, 0.03, sx * 0.62, S.wallH + 0.32, sz * (S.d / 2 + 0.2), 0, 1, 0, sx * -0.7);
    FB(F, k.weathered, COL.oak, S.w - 2 * S.t, 0.06, S.d - 2 * S.t, 0, 0.03, 0, 0, 1);              // floor boards
    // door frame (open) and the leaf swung back against the wall
    const op = S.openings[0], hw = op.w / 2;
    for (const sx of [-1, 1]) FB(F, k.paint, COL.cream, 0.06, op.y1 + 0.05, 0.1, sx * (hw + 0.03), (op.y1 + 0.05) / 2, S.d / 2, 0, 1);
    FB(F, k.paint, COL.cream, op.w + 0.18, 0.07, 0.1, 0, op.y1 + 0.035, S.d / 2, 0, 1);
    {
      const D = S.door, ang = D.open * Math.PI / 180, c = D.hinge < 0 ? 1 : -1, dx = c * Math.cos(ang), dz = Math.sin(ang);
      doorLeaf(F, D.hinge, 0, S.d / 2 + 0.04, -Math.atan2(dz, dx), D.leaf, op.y1 - 0.04, COL.green, k.paint, true);
    }
    // glazed window in the east wall
    win(F, S.w / 2 + 0.005, 1.2, 0.3, Math.PI / 2, 0.6, 0.5, { frame: COL.cream, bars: 2 });
    // gutter and downpipe to the butt
    FB(F, k.zinc, 0x4a5050, 0.07, 0.07, S.d + 0.3, S.w / 2 + 0.2, S.wallH - 0.15, 0, 0, 1);
    { const [px, pz] = F.p(S.w / 2 + 0.22, 0.9); Cy(k.zinc, 0x4a5050, 0.025, 0.025, S.wallH - 0.2, px, (S.wallH - 0.2) / 2, pz, 6, 1); }
    // inside: shelf with jars, tools on the wall, a potting bench, trays of seedlings, boots
    const sh = A.SHELF_A, backZ = -S.d / 2 + S.t;
    FB(F, k.weathered, COL.pine, sh.hw * 2, sh.t, sh.depth, 0, sh.h - sh.t / 2, backZ + sh.depth / 2, 0, 1);
    for (const sx of [-1, 1]) FB(F, k.weathered, COL.pine, 0.03, 0.2, 0.2, sx * (sh.hw - 0.05), sh.h - sh.t - 0.1, backZ + 0.13, 0, 1, 0, 0.0);
    FCy(F, k.ceramic, 0xd8d0b8, 0.04, 0.04, 0.12, -0.42, sh.h + 0.06, backZ + 0.13, 8, 1);
    FCy(F, k.ceramic, 0xc9b890, 0.035, 0.035, 0.1, -0.32, sh.h + 0.05, backZ + 0.13, 8, 1);
    FB(F, k.paper, 0xb8503a, 0.1, 0.05, 0.06, 0.38, sh.h + 0.025, backZ + 0.13, 0.3, 2);
    FB(F, k.wicker, 0xc8a870, 0.12, 0.07, 0.12, 0.2, sh.h + 0.035, backZ + 0.13, 0, 2);
    FB(F, k.weathered, COL.pine, 0.5, 0.04, 0.2, -0.3, 1.5, backZ + 0.12, 0, 1);
    FB(F, k.weathered, COL.pine, 0.5, 0.04, 0.2, 0.0, 1.5, backZ + 0.12, 0, 1);     // gap-less upper shelf under the ridge
    FCy(F, k.terracotta, 0xb8643f, 0.07, 0.05, 0.12, -0.25, 1.58, backZ + 0.12, 9, 2);
    // potting bench on the right
    FB(F, k.weathered, COL.pine, 0.62, 0.05, 0.62, 0.74, 0.86, 0.2, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) FB(F, k.weathered, COL.pine, 0.05, 0.84, 0.05, 0.74 + sx * 0.28, 0.42, 0.2 + sz * 0.28, 0, 1);
    for (let i = 0; i < 3; i++) { FB(F, k.weathered, 0x7a6a52, 0.28, 0.05, 0.18, 0.66 + (i % 2) * 0.05, 0.91 + (i > 1 ? 0.0 : 0), 0.0 + i * 0.22 - 0.1, 0, 1); }
    for (let i = 0; i < 8; i++) { const [x, z] = F.p(0.58 + rnd() * 0.22, -0.1 + rnd() * 0.5); add(plantGeo('lettuce', 0), swLow, T(x, FY + 0.935, z, rnd() * 6, 0, 0, 0.5, 0.5, 0.5), jit(0x8fb257), 2); }
    FB(F, k.weathered, 0xa8a090, 0.45, 0.05, 0.3, 0.7, 0.1, 0.9, 0, 1);   // sack of compost
    FB(F, k.fabric, 0xc8b88a, 0.38, 0.22, 0.26, 0.72, 0.13, 0.95, 0.1, 1);
    for (let i = 0; i < 3; i++) FCy(F, k.terracotta, jit(0xb8643f), 0.08 - i * 0.003, 0.055, 0.14, -0.84, 0.07 + i * 0.12, S.d / 2 - 0.4, 9, 1);
    FB(F, k.rubber, 0x2d4a35, 0.1, 0.34, 0.12, -0.7, 0.17, -0.2, 0, 2); FB(F, k.rubber, 0x2d4a35, 0.1, 0.34, 0.12, -0.55, 0.17, -0.2, 0.3, 2);
    // spade and fork on the left wall
    const lw = -S.w / 2 + S.t + 0.04;
    FB(F, k.weathered, COL.pine, 0.035, 1.2, 0.035, lw, 0.9, 0.1, 0, 1); FB(F, k.steel, 0x9aa0a0, 0.2, 0.28, 0.01, lw, 0.2, 0.1, 0, 1);
    FB(F, k.weathered, COL.pine, 0.035, 1.3, 0.035, lw, 0.95, 0.5, 0, 1);
  }

  // ---- Shed B: cream shiplap, flat felt roof (with the teacup on top), padlocked door, net curtain
  {
    const S = A.SHEDS.B, F = new Fr(S.x, S.z, S.yaw);
    cladding(F, S, COL.cream, k.paint, { laps: 0.14, trim: 0x8a9a7a });
    roofDetails(F, S, COL.felt, 'felt');
    FB(F, k.paint, 0x8a9a7a, S.w + 0.24, 0.07, 0.05, 0, S.wallH - 0.0, S.d / 2 + 0.1, 0, 1);
    FB(F, k.paint, 0x8a9a7a, S.w + 0.24, 0.07, 0.05, 0, S.wallH - 0.0, -S.d / 2 - 0.1, 0, 1);
    for (const sx of [-1, 1]) FB(F, k.paint, 0x8a9a7a, 0.05, 0.07, S.d + 0.24, sx * (S.w / 2 + 0.1), S.wallH, 0, 0, 1);
    // raised lip round the roof edge where moss gathers
    for (let i = 0; i < 6; i++) Blob(wk.leafy, 0xb0c090, rr(0.05, 0.09), S.x + rr(-0.8, 0.8), A.SHED_ROOF_B + 0.01, S.z + rr(-0.7, 0.7), { sy: 0.2, sx: 1.4, lod: 2, detail: 0 });
    const op = S.openings[0];
    doorLeaf(F, op.u - op.w / 2, 0, S.d / 2 + 0.035, 0, op.w, op.y1, 0x6a7a5a, k.paint);
    for (const sx of [-1, 1]) FB(F, k.paint, 0x8a9a7a, 0.05, op.y1 + 0.04, 0.09, op.u + sx * (op.w / 2 + 0.025), (op.y1 + 0.04) / 2, S.d / 2, 0, 1);
    FB(F, k.paint, 0x8a9a7a, op.w + 0.14, 0.06, 0.09, op.u, op.y1 + 0.03, S.d / 2, 0, 1);
    win(F, -S.w / 2 - 0.005, 1.2, 0, -Math.PI / 2, 0.7, 0.6, { frame: 0x8a9a7a, bars: 2, curtain: true });
    // a hanging basket of lobelia and a coiled hose by the door
    Rod(k.iron, 0x25272a, ...[F.p(S.w / 2 - 0.2, S.d / 2 + 0.3)].map(([x, z]) => [x, 1.7, z]), ...[F.p(S.w / 2 - 0.2, S.d / 2 + 0.02)].map(([x, z]) => [x, 1.7, z]), 0.012, 0.012, 5, 2);
    {
      const [bx, bz] = F.p(S.w / 2 - 0.2, S.d / 2 + 0.3);
      Cy(k.wicker, 0x6a5a40, 0.14, 0.09, 0.14, bx, 1.55, bz, 9, 1); Blob(swMid, 0x6a8a46, 0.15, bx, 1.68, bz, { sy: 0.6, lod: 1 }); Blob(swPetal, 0x6a7fd0, 0.06, bx + 0.05, 1.7, bz, { lod: 2, detail: 0 });
      const [hx, hz] = F.p(0.9, S.d / 2 + 0.3);
      add(new THREE.TorusGeometry(0.18, 0.025, 6, 14).rotateX(Math.PI / 2), k.rubber, T(hx, FY + 0.03, hz), 0x2f6a3a, 2);
      add(new THREE.TorusGeometry(0.14, 0.025, 6, 14).rotateX(Math.PI / 2), k.rubber, T(hx, FY + 0.08, hz), 0x2f6a3a, 2);
    }
  }

  // ---- Shed C: bare timber, rusty corrugated roof, door open, window open with a propped shutter (the route)
  {
    const S = A.SHEDS.C, F = new Fr(S.x, S.z, S.yaw);
    cladding(F, S, COL.grey, k.weathered, { laps: 0.16, trim: 0x70695c });
    roofDetails(F, S, 0x9a6a50, 'corrugated');
    FB(F, k.weathered, COL.grey, S.w - 2 * S.t, 0.06, S.d - 2 * S.t, 0, 0.03, 0, 0, 1);
    const op = S.openings[0], hw = op.w / 2;
    for (const sx of [-1, 1]) FB(F, k.paint, COL.red, 0.07, op.y1 + 0.05, 0.1, sx * (hw + 0.035), (op.y1 + 0.05) / 2, S.d / 2, 0, 1);
    FB(F, k.paint, COL.red, op.w + 0.2, 0.07, 0.1, 0, op.y1 + 0.035, S.d / 2, 0, 1);
    {
      const D = S.door, ang = D.open * Math.PI / 180, c = D.hinge < 0 ? 1 : -1, dx = c * Math.cos(ang), dz = Math.sin(ang);
      doorLeaf(F, D.hinge, 0, S.d / 2 + 0.04, -Math.atan2(dz, dx), D.leaf, op.y1 - 0.04, COL.red, k.paint, true);
    }
    // back window: frame with no glass; the shutter swung up on its hinge and propped on a stick
    const bo = S.openings[1], bf = 0.05;
    for (const sx of [-1, 1]) FB(F, k.paint, COL.red, bf, bo.y1 - bo.y0 + 0.1, 0.1, sx * (bo.w / 2 + bf / 2), (bo.y0 + bo.y1) / 2, -S.d / 2, 0, 1);
    FB(F, k.paint, COL.red, bo.w + 0.14, bf, 0.1, 0, bo.y1 + bf / 2, -S.d / 2, 0, 1);
    FB(F, k.paint, COL.red, bo.w + 0.16, bf, 0.14, 0, bo.y0 - bf / 2, -S.d / 2, 0, 1);
    FB(F, k.weathered, jit(COL.grey, 0.1), 0.68, 0.025, 0.58, 0, 1.52, -S.d / 2 - 0.28, 0, 1);
    FB(F, k.weathered, COL.red, 0.68, 0.045, 0.04, 0, 1.52, -S.d / 2 - 0.58, 0, 1);
    { const [sx, sz] = F.p(0.3, -S.d / 2 - 0.52); Rod(k.weathered, COL.oak, [sx, 0, sz], [sx, 1.5, sz], 0.014, 0.014, 5, 1); }
    // inside: bench along the left wall, shelf over it with paint tins and jars, tools on pegs
    FB(F, k.weathered, COL.pine, 0.56, 0.05, 2.0, -0.78, 0.86, 0, 0, 1);
    for (const sz of [-0.95, -0.3, 0.3, 0.95]) FB(F, k.weathered, COL.pine, 0.05, 0.84, 0.05, -0.78, 0.42, sz, 0, 1);
    FB(F, k.weathered, COL.pine, 0.24, 0.03, 2.0, -0.9, 1.55, 0, 0, 1);
    for (let i = 0; i < 6; i++) FCy(F, k.zinc, jit(0x9aa0a0, 0.1), 0.05, 0.05, 0.12, -0.9, 1.62, -0.85 + i * 0.32, 8, 1);
    for (let i = 0; i < 4; i++) FCy(F, k.ceramic, jit(0xcfc7b0), 0.04, 0.04, 0.1, -0.78, 0.94, -0.7 + i * 0.45, 8, 2);
    FB(F, k.steel, 0x6a7070, 0.08, 0.1, 0.12, -0.7, 0.96, 0.8, 0, 2);                                   // vice
    for (let i = 0; i < 5; i++) { const z = -0.8 + i * 0.4; FB(F, k.weathered, COL.pine, 0.03, 0.5 + 0.12 * (i % 3), 0.03, -0.96, 1.15 + 0.1 * (i % 2), z, 0, 2); }
    FB(F, k.rubber, 0x2a2a2a, 0.34, 0.04, 0.34, 0.55, 0.05, -0.7, 0, 2);                                   // a tyre mat
    FB(F, k.wicker, 0xb89a68, 0.42, 0.06, 0.4, 0.62, 0.45, 0.9, 0, 1); for (const sx of [-1, 1]) for (const sz of [-1, 1]) FB(F, k.weathered, COL.pine, 0.03, 0.4, 0.03, 0.62 + sx * 0.18, 0.2, 0.9 + sz * 0.18, 0, 2);   // stool
    // window box on the high side of the roof for rain: gutter into the butt
    FB(F, k.zinc, 0x4a5050, 0.07, 0.07, S.d + 0.2, S.w / 2 + 0.16, S.highH - 0.12, 0, 0, 1);
  }

  // ---- Shed D: pallet hut with stones on its felt roof
  {
    const S = A.SHEDS.D, F = new Fr(S.x, S.z, S.yaw);
    cladding(F, S, 0x8b8579, k.weathered, { laps: 0.12, trim: 0x6f6a5f });
    roofDetails(F, S, COL.felt, 'felt');
    doorLeaf(F, -0.35, 0, S.d / 2 + 0.03, 0, 0.7, 1.35, 0x777060, k.weathered);
    FCy(F, k.rubber, 0x2a2a2a, 0.02, 0.02, 0.25, 0.27, 0.8, S.d / 2 + 0.06, 6, 2);
    for (let i = 0; i < 5; i++) { const lx = rr(-0.7, 0.7), lz = rr(-0.5, 0.5), [x, z] = F.p(lx, lz); Blob(k.stone, 0x9a948a, rr(0.07, 0.11), x, (S.wallH + S.highH) / 2 + 0.07 + lx * 0.2, z, { sy: 0.7, lod: 1, detail: 0 }); }
    for (let i = 0; i < 3; i++) { const [x, z] = F.p(rr(-0.7, 0.7), rr(-0.5, 0.5)); Blob(wk.leafy, 0xb0c090, 0.1, x, (S.wallH + S.highH) / 2 + 0.09, z, { sy: 0.3, lod: 2, detail: 0 }); }
    // wigwam of old bean poles leaning against the side and a rain-water butt
    for (let i = 0; i < 5; i++) { const [x, z] = F.p(-S.w / 2 - 0.1 - i * 0.04, -0.5 + i * 0.2); Rod(k.weathered, COL.pine, [x, 0, z], [x - 0.03, 1.9, z], 0.016, 0.012, 5, 1); }
  }

  // ---- Shed E: recycled window greenhouse-shed
  {
    const S = A.SHEDS.E, F = new Fr(S.x, S.z, S.yaw);
    const pal = [0xe9e4d4, 0x4c6a85, 0x56705a, 0x8b3d2c, 0xe3d9bd, 0x7b8a99];
    B(k.stone, 0xa8553d, S.w + 0.12, 0.2, S.d + 0.12, S.x, 0.1, S.z, 0, 1);       // brick plinth
    // timber frame with panes of different old windows
    const hl = S.wallH, hh = S.highH;
    const wallPanes = (len, along, face, hOf) => {
      const n = Math.max(2, Math.round(len / 0.62));
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * len / n, w = len / n - 0.03, hgt = hOf(u) - 0.3, hc = 0.2 + hgt / 2;
        const fr = pal[(i * 2 + (along ? 1 : 0)) % pal.length];
        const lx = along ? u : face * (S.w / 2 - 0.025), lz = along ? face * (S.d / 2 - 0.025) : u;
        const ry = along ? 0 : Math.PI / 2;
        const [x, z] = F.p(lx, lz), yaw = F.yaw + ry;
        add(new THREE.PlaneGeometry(w, hgt), k.glass, T(x, FY + hc, z, yaw), 0xd0e0d8, 1);
        const cx = Math.cos(yaw), sx = -Math.sin(yaw);
        for (const sd of [-1, 1]) { B(k.paint, fr, 0.045, hgt + 0.08, 0.05, x + cx * sd * (w / 2), hc, z + sx * sd * (w / 2), yaw, 1); }
        B(k.paint, fr, w + 0.09, 0.045, 0.05, x, 0.2 + hgt + 0.0, z, yaw, 1); B(k.paint, fr, w + 0.09, 0.045, 0.05, x, 0.2, z, yaw, 1);
        B(k.paint, fr, w, 0.025, 0.03, x, hc, z, yaw, 2);
      }
    };
    wallPanes(S.w, true, 1, (u) => hl + (hh - hl) * (u / S.w + 0.5));
    wallPanes(S.w, true, -1, (u) => hl + (hh - hl) * (u / S.w + 0.5));
    wallPanes(S.d, false, -1, () => hl); wallPanes(S.d, false, 1, () => hh);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) FB(F, k.weathered, COL.pine, 0.08, sx > 0 ? hh : hl, 0.08, sx * S.w / 2, (sx > 0 ? hh : hl) / 2, sz * S.d / 2, 0, 1);
    for (const r of A.roofPieces(S)) FB(F, k.glass, 0xc8d8d0, r.half[0] * 2, 0.02, r.half[2] * 2, r.c[0], r.c[1], r.c[2], 0, 1, 0, r.r[2]);
    for (let i = 0; i <= 5; i++) { const lx = -S.w / 2 - 0.12 + i * (S.w + 0.24) / 5; const r = A.roofPieces(S)[0]; FB(F, k.weathered, COL.pine, 0.05, 0.04, S.d + 0.2, lx, r.c[1] + (lx / S.w) * (hh - hl) + 0.0, 0, 0, 1, 0, r.r[2]); }
    // inside: a staging bench with seed trays and a row of tomato plants in pots
    FB(F, k.weathered, COL.pine, S.w - 0.4, 0.05, 0.5, 0, 0.8, -S.d / 2 + 0.4, 0, 1);
    for (let i = 0; i < 6; i++) { const [x, z] = F.p(-0.9 + i * 0.36, -S.d / 2 + 0.4); add(plantGeo('tomato', i % 3), swMid, T(x, FY + 0.83, z, rnd() * 6, 0, 0, 0.55, 0.55, 0.55), jit(0x5c8a3c), 1); FCy(F, k.terracotta, 0xb8643f, 0.07, 0.05, 0.1, -0.9 + i * 0.36, 0.88, -S.d / 2 + 0.4, 8, 2); }
    for (let i = 0; i < 4; i++) { const [x, z] = F.p(-0.7 + i * 0.4, 0.45); add(plantGeo('lettuce', 1), swLow, T(x, FY + 0.03, z, rnd() * 6, 0, 0, 0.8, 0.8, 0.8), jit(0x8fb257), 2); }
    // the door: a stable-door of an old front door, a step, boots
    FB(F, k.paint, 0x56705a, 0.7, 1.6, 0.04, 0.55, 0.9, S.d / 2 + 0.05, 0, 1);
    FB(F, k.stone, 0xa8a29a, 0.7, 0.1, 0.3, 0.55, 0.05, S.d / 2 + 0.3, 0, 1);
  }

  // ================================================================== the tea hut
  {
    const H = A.HUT, W = H.x1 - H.x0, D = H.z1 - H.z0, sage = 0x7f947a, cream = COL.cream, xm = (H.x0 + H.x1) / 2, zm = (H.z0 + H.z1) / 2;
    // body: board-and-batten in sage, cream trim, plinth
    B(k.paint, sage, W, H.eave, D, xm, H.eave / 2, zm, 0, 0);
    for (let x = H.x0 + 0.2; x < H.x1; x += 0.45) { B(k.paint, jit(sage, 0.04), 0.05, H.eave, 0.02, x, H.eave / 2, H.z1 + 0.01, 0, 1); B(k.paint, jit(sage, 0.04), 0.05, H.eave, 0.02, x, H.eave / 2, H.z0 - 0.01, 0, 1); }
    for (let z = H.z0 + 0.2; z < H.z1; z += 0.45) { B(k.paint, jit(sage, 0.04), 0.02, H.eave, 0.05, H.x0 - 0.01, H.eave / 2, z, 0, 1); B(k.paint, jit(sage, 0.04), 0.02, H.eave, 0.05, H.x1 + 0.01, H.eave / 2, z, 0, 1); }
    B(k.stone, 0x8a847a, W + 0.1, 0.2, D + 0.1, xm, 0.1, zm, 0, 1);
    for (const sx of [H.x0, H.x1]) for (const sz of [H.z0, H.z1]) B(k.paint, cream, 0.09, H.eave, 0.09, sx, H.eave / 2, sz, 0, 1);
    // roof (two slopes, clay-coloured tin sheets), gable ends, barge boards, ridge cap
    const spec = { x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1, eave: Y(H.eave), ridgeY: Y(H.ridge), ridge: 'x', overhang: H.ov };
    // Reuse the shared roof slabs through the sim's shapes via the renderer's kit: slabs are given by the same function.
    const slabs = roofSlabs(spec);
    for (const r of slabs) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(r.cx, r.cy, r.cz), r.quat, new THREE.Vector3(1, 1, 1));
      add(boxUV(r.hx * 2, 0.06, r.hz * 2, 1), k.zinc, m, 0x8a4a3a, 0);
      for (let i = 0; i < Math.round(r.hx * 2 / 0.14); i++) {
        const u = -r.hx + (i + 0.5) * r.hx * 2 / Math.round(r.hx * 2 / 0.14);
        const mm = new THREE.Matrix4().compose(new THREE.Vector3(r.cx + u, r.cy, r.cz), r.quat, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, 0.04, 0));
        add(boxUV(0.045, 0.025, r.hz * 2, 1), k.zinc, mm, 0x7a3e30, 2);
      }
    }
    for (const gx of [H.x0, H.x1]) {
      const sx = gx === H.x0 ? 1 : -1;
      add(prism([[gx, FY + H.eave, H.z0], [gx, FY + H.eave, H.z1], [gx, FY + H.ridge, zm], [gx + sx * 0.18, FY + H.eave, H.z0], [gx + sx * 0.18, FY + H.eave, H.z1], [gx + sx * 0.18, FY + H.ridge, zm]]), k.paint, null, sage, 0);
    }
    B(k.weathered, 0x6a3a2e, W + 0.5, 0.05, 0.16, xm, H.ridge + 0.04, zm, 0, 1);
    // front door (open window above) and serving hatch with a propped shutter
    {
      const FZ = H.z1;
      B(k.paint, 0x8b3d2c, 0.9, 1.95, 0.05, 7.55, 0.2 + 1.0, FZ + 0.03, 0, 1);
      B(k.paint, cream, 1.05, 0.08, 0.1, 7.55, 0.2 + 2.0, FZ + 0.05, 0, 1);
      for (const sx of [-1, 1]) B(k.paint, cream, 0.06, 2.0, 0.1, 7.55 + sx * 0.5, 1.2, FZ + 0.05, 0, 1);
      B(k.brass, 0xc8a050, 0.04, 0.12, 0.05, 7.95, 1.25, FZ + 0.08, 0, 1);
      B(k.paint, 0x3a4a52, 0.6, 0.55, 0.01, 7.55, 1.6, FZ + 0.057, 0, 2);
      // hatch
      B(k.paint, 0x2a2a28, 1.1, 0.7, 0.04, 9.6, 1.55, FZ + 0.01, 0, 1);
      for (const sx of [-1, 1]) B(k.paint, cream, 0.06, 0.78, 0.1, 9.6 + sx * 0.58, 1.55, FZ + 0.05, 0, 1);
      B(k.paint, cream, 1.24, 0.06, 0.1, 9.6, 1.94, FZ + 0.05, 0, 1); B(k.paint, cream, 1.3, 0.05, 0.28, 9.6, 1.13, FZ + 0.14, 0, 1);
      B(k.weathered, jit(sage), 1.12, 0.03, 0.72, 9.6, 2.35, FZ + 0.38, 0, 1, -0.04);                       // shutter propped up as an awning
      Rod(k.weathered, COL.oak, [9.15, 0.2, FZ + 0.62], [9.15, 2.3, FZ + 0.62], 0.014, 0.014, 5, 1);
      // jars, cake stand and cloche on the hatch shelf
      for (let i = 0; i < 4; i++) Cy(k.ceramic, [0xd8c8a0, 0xb8503a, 0x6a8a46, 0xd8d0b8][i], 0.035, 0.035, 0.1, 9.25 + i * 0.12, 1.21 + 0.05, FZ + 0.16, 8, 2);
      Cy(k.ceramic, 0xe9e2d0, 0.12, 0.12, 0.012, 9.95, 1.18, FZ + 0.16, 12, 2); add(new THREE.SphereGeometry(0.1, 10, 6, 0, TAU, 0, Math.PI / 2), k.glass, T(9.95, FY + 1.19, FZ + 0.16), 0xffffff, 2);
    }
    // west wall: water butt feed, east wall window, back wall little window
    win({ p: (lx, lz) => [lx, lz], yaw: 0 }, H.x1 + 0.0, 1.4, zm, Math.PI / 2, 0.6, 0.6, { frame: cream, bars: 2 });
    win({ p: (lx, lz) => [lx, lz], yaw: 0 }, 8.7, 1.4, H.z0 - 0.005, Math.PI, 0.7, 0.6, { frame: cream, bars: 2 });
    // stove flue
    Cy(k.steel, 0x2a2a2a, 0.055, 0.055, 1.4, 7.6, H.ridge + 0.4, -13.1, 8, 1); Cy(k.steel, 0x2a2a2a, 0.1, 0.07, 0.1, 7.6, H.ridge + 1.15, -13.1, 8, 1);
    // gutter on the back, downpipe to the butt at the west end
    B(k.zinc, 0x4a5050, W + 0.4, 0.07, 0.08, xm, 2.18, H.z0 - 0.28, 0, 1);
    { const b = A.BUTTS[0]; Cy(k.zinc, 0x4a5050, 0.025, 0.025, 2.0, b.x, 1.2, H.z0 - 0.2, 6, 1); Rod(k.zinc, 0x4a5050, [b.x, 2.15, H.z0 - 0.26], [b.x, 2.15, H.z0 - 0.2], 0.025, 0.025, 6, 1); }
    // sign board over the veranda, bunting along the front
    {
      const m = new THREE.Mesh(signGeo(1.0, 0.5, 0, 0.5), signMat);
      m.position.set(8.9, Y(2.0), H.z1 + 0.12);
      ctx.object(m, 1);
      B(k.weathered, 0x60503a, 1.08, 0.58, 0.04, 8.9, 2.0, H.z1 + 0.09, 0, 1);
      Rod(k.iron, 0x25272a, [8.5, 2.28, H.z1 + 0.1], [8.5, 2.46, H.z1 + 0.1], 0.006, 0.006, 4, 2); Rod(k.iron, 0x25272a, [9.3, 2.28, H.z1 + 0.1], [9.3, 2.46, H.z1 + 0.1], 0.006, 0.006, 4, 2);
      const flags = [0xc0392b, 0xe8c547, 0x3f6aa6, 0xf0ece0, 0x5f8f5a, 0xd96b8a];
      const a = [6.75, 2.0, -10.76], b = [10.7, 2.0, -10.76];
      for (let i = 0; i < 18; i++) {
        const t = (i + 0.5) / 18, x = a[0] + (b[0] - a[0]) * t, h = 2.06 - 0.18 * 4 * t * (1 - t) - 0.0;
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0, -0.14, 0], 3));
        tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); tri.computeVertexNormals();
        add(tri, k.fabric, T(x, FY + h, -10.76, 0, 0, 0), flags[i % flags.length], 2);
      }
      Rod(k.fabric, 0x6a5a48, [a[0], 2.08, a[2]], [b[0], 2.08, b[2]], 0.004, 0.004, 3, 2);
    }
    // the veranda: deck boards, step, posts, roof, rails, table, chairs
    const Dk = H.deck;
    B(k.weathered, 0x9a8d74, Dk.x1 - Dk.x0, Dk.top, Dk.z1 - Dk.z0, (Dk.x0 + Dk.x1) / 2, Dk.top / 2, (Dk.z0 + Dk.z1) / 2, 0, 0);
    for (let z = Dk.z0 + 0.07; z < Dk.z1; z += 0.14) B(k.weathered, jit(0xa89c82, 0.1), Dk.x1 - Dk.x0 + 0.04, 0.012, 0.012, (Dk.x0 + Dk.x1) / 2, Dk.top + 0.002, z, 0, 2);
    B(k.weathered, 0x8f8268, 0.9, 0.12, 0.3, 8.0, 0.06, Dk.z1 + 0.15, 0, 1);
    for (const p of H.posts) { B(k.weathered, COL.oak, 0.1, H.roofH, 0.1, p.x, H.roofH / 2, p.z, 0, 1); B(k.weathered, COL.oak, 0.14, 0.05, 0.14, p.x, H.roofH + 0.02, p.z, 0, 2); }
    B(k.weathered, COL.oak, 4.3, 0.12, 0.1, xm + 0.05, H.roofH + 0.05, -10.72, 0, 1);
    {
      const zA = H.z1 - 0.2, hA = H.eave - 0.14, zB = H.roofFront, hB = H.roofH + 0.1, len = Math.hypot(zA - zB, hA - hB), ang = Math.atan2(hA - hB, zB - zA);
      add(boxUV(W + 0.5, 0.06, len, 1), k.zinc, T(xm, FY + (hA + hB) / 2, (zA + zB) / 2, 0, ang, 0), 0x8a4a3a, 0);
      for (let x = H.x0 - 0.2; x < H.x1 + 0.25; x += 0.14) add(boxUV(0.045, 0.025, len, 1), k.zinc, T(x, FY + (hA + hB) / 2 + 0.04, (zA + zB) / 2, 0, ang, 0), 0x7a3e30, 2);
    }
    const R = H.rail;
    B(k.weathered, 0xb8aa88, R.x1 - R.x0, 0.04, 0.16, (R.x0 + R.x1) / 2, R.top - 0.02, R.z, 0, 1);
    B(k.weathered, 0xb8aa88, R.x1 - R.x0, 0.04, 0.05, (R.x0 + R.x1) / 2, R.mid, R.z, 0, 1);
    for (let x = R.x0 + 0.12; x < R.x1 - 0.05; x += 0.2) B(k.weathered, jit(0xc8b890, 0.05), 0.035, R.top - Dk.top, 0.035, x, Dk.top + (R.top - Dk.top) / 2, R.z, 0, 1);
    B(k.weathered, 0xb8aa88, 0.05, R.top - Dk.top, Dk.z1 - Dk.z0 - 0.1, Dk.x0 + 0.03, Dk.top + (R.top - Dk.top) / 2, (Dk.z0 + Dk.z1 - 0.1) / 2, 0, 1);
    // table with oilcloth, kettle, tray of mugs, honesty tin, tea stand (drawn by the world's stand builder)
    const Tb = H.table;
    B(k.weathered, 0xa89470, Tb.hx * 2, Tb.t, Tb.hz * 2, Tb.x, Tb.top - Tb.t / 2, Tb.z, 0, 1);
    B(k.fabric, 0xc7d2dc, Tb.hx * 2 + 0.06, 0.006, Tb.hz * 2 + 0.06, Tb.x, Tb.top + 0.003, Tb.z, 0, 1);
    for (let i = 0; i < 9; i++) B(k.fabric, 0x5f8fbf, 0.07, 0.002, Tb.hz * 2 + 0.06, Tb.x - 0.5 + i * 0.125, Tb.top + 0.007, Tb.z, 0, 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(k.weathered, 0x8f8268, 0.05, Tb.top - Tb.t - Dk.top, 0.05, Tb.x + sx * (Tb.hx - 0.06), Dk.top + (Tb.top - Tb.t - Dk.top) / 2, Tb.z + sz * (Tb.hz - 0.06), 0, 1);
    Cy(k.enamel, 0x2f4f6b, 0.085, 0.095, 0.16, 9.72, Tb.top + 0.09, -11.4, 12, 1);                           // kettle
    Cy(k.enamel, 0x2f4f6b, 0.07, 0.085, 0.03, 9.72, Tb.top + 0.19, -11.4, 12, 1); Cy(k.brass, 0xc8a050, 0.015, 0.02, 0.03, 9.72, Tb.top + 0.225, -11.4, 6, 2);
    Rod(k.enamel, 0x2f4f6b, [9.72, Tb.top + 0.2, -11.4], [9.97, Tb.top + 0.22, -11.5], 0.02, 0.012, 6, 1); Rod(k.enamel, 0x2f4f6b, [9.72 - 0.08, Tb.top + 0.1, -11.4], [9.72 - 0.16, Tb.top + 0.14, -11.4], 0.012, 0.015, 6, 2);
    B(k.zinc, 0xc8cccc, 0.28, 0.02, 0.2, 9.72, Tb.top + 0.01, -11.4, 0, 1);
    Cy(k.enamel, 0x6f4a2a, 0.05, 0.05, 0.12, 10.45, Tb.top + 0.06, -11.55, 10, 1); B(k.enamel, 0x6f4a2a, 0.12, 0.05, 0.08, 10.45, Tb.top + 0.045, -11.55, 0, 2);
    for (let i = 0; i < 3; i++) { Cy(k.ceramic, [0xe8d8b0, 0x6a8a9a, 0xc9663e][i], 0.036, 0.032, 0.08, 9.45 + i * 0.1, Tb.top + 0.04, -11.2 + 0.12 * (i % 2), 9, 1); }
    // chairs from the chair kit: an old kitchen chair, a church-hall folding chair, a deckchair, a painted one
    const pals = {
      wood: ['ladder-board', { frame: [k.weathered, 0x8a5a3a], seat: [k.weathered, 0x977050] }],
      wood2: ['ladder-board', { frame: [k.weathered, 0x3f6a7a], seat: [k.weathered, 0x4a7686] }],
      folding: ['folding', { frame: [k.paint, 0x8f9a97], pad: [k.fabric, 0x3f6aa6], foot: [k.rubber, 0x2a2a28], metal: [k.steel, 0xb8bcbc] }],
      deck: ['deck', { frame: [k.wood, 0xc29a62], stripeA: [k.fabric, 0xc0392b], stripeB: [k.fabric, 0xe8d8a8], metal: [k.brass, 0xc9a24e] }],
    };
    A.CHAIRS.forEach((c, i) => {
      const dh = c.x > 6.7 && c.x < 10.9 && c.z > -11.8 ? Dk.top : 0, mx = T(c.x, FY + dh, c.z, c.yaw), [style, pal] = pals[c.kind];
      placeChair(style, pal, (g, m, col, lod) => add(g, m, mx, col, lod), { lite: ctx.lite, seed: 41 + i });
    });
    // a small shelf with enamel mugs beside the door, potted geraniums on the step, a stack of logs
    for (let i = 0; i < 3; i++) { Cy(k.terracotta, 0xb8643f, 0.09, 0.065, 0.14, 6.95 + i * 0.22, Dk.top + 0.07, Dk.z1 + 0.35, 9, 1); Blob(swMid, 0x4f7a3e, 0.12, 6.95 + i * 0.22, Dk.top + 0.2, Dk.z1 + 0.35, { sy: 0.7, lod: 1 }); Blob(swPetal, [0xc0392b, 0xe07a8a, 0xf0ece0][i], 0.05, 6.95 + i * 0.22, Dk.top + 0.27, Dk.z1 + 0.35, { lod: 2, detail: 0 }); }
    for (let i = 0; i < 9; i++) Cy(k.bark, 0x6a5a48, 0.07, 0.07, 0.4, H.x0 + 0.12 + (i % 3) * 0.15, 0.1 + Math.floor(i / 3) * 0.14, H.z0 - 0.32 + (i % 2) * 0.02, 7, 1, Math.PI / 2, 0, 0.0);
    // the communal trough: galvanised tank, the plank, a standpipe and tap, a hose reel, a watering can
    {
      const Tr = A.TROUGH;
      B(k.zinc, 0xaab2b2, Tr.hx * 2, Tr.h, Tr.hz * 2, Tr.x, Tr.h / 2, Tr.z, 0, 0);
      B(k.zinc, 0x8a9494, Tr.hx * 2 + 0.04, 0.04, Tr.hz * 2 + 0.04, Tr.x, Tr.h - 0.02, Tr.z, 0, 1);
      add(new THREE.PlaneGeometry(Tr.hx * 2 - 0.1, Tr.hz * 2 - 0.1).rotateX(-Math.PI / 2), wk.water, T(Tr.x, FY + Tr.h - 0.06, Tr.z), 0x4a6a60, 1);
      B(k.weathered, 0xa89470, Tr.plank.hx * 2, 0.03, Tr.plank.hz * 2, Tr.x, Tr.plank.h, Tr.plank.z, 0, 1);
      for (const sz of [-1, 1]) B(k.zinc, 0x8a9494, 0.05, 0.03, Tr.hz * 2 + 0.06, Tr.x + sz * 0.4, Tr.h - 0.04, Tr.z, 0, 2);
      Cy(k.zinc, 0x8c9494, 0.03, 0.03, 0.9, Tr.x + 0.55, 0.45, Tr.z - 0.45, 8, 1); Cy(k.brass, 0xc8a050, 0.02, 0.02, 0.1, Tr.x + 0.55, 0.78, Tr.z - 0.45 + 0.0, 6, 1); Rod(k.brass, 0xc8a050, [Tr.x + 0.55, 0.7, Tr.z - 0.45], [Tr.x + 0.46, 0.64, Tr.z - 0.45], 0.012, 0.014, 6, 1);
      Cy(k.zinc, 0xaab2b2, 0.1, 0.12, 0.22, Tr.x + 0.52, 0.11, Tr.z - 0.75, 9, 1); Rod(k.zinc, 0xaab2b2, [Tr.x + 0.42, 0.12, Tr.z - 0.75], [Tr.x + 0.22, 0.34, Tr.z - 0.75], 0.012, 0.01, 5, 1);
    }
  }

  // ================================================================== the polytunnel
  {
    const P = A.PT, len = P.x1 - P.x0, n = 14;
    const pt = (i) => { const a = Math.PI * i / n; return [P.zc + P.rx * Math.cos(a), P.ry * Math.sin(a)]; };
    // skin: a faceted half-ellipse, two layers of polythene viewed from outside and in
    {
      const pos = [], uv = [];
      for (let i = 0; i < n; i++) {
        const [z0, h0] = pt(i), [z1, h1] = pt(i + 1);
        const q = [[P.x0, h0, z0], [P.x1, h0, z0], [P.x1, h1, z1], [P.x0, h1, z1]];
        for (const j of [0, 1, 2, 0, 2, 3]) { pos.push(q[j][0], FY + q[j][1], q[j][2]); uv.push(q[j][0] * 0.5, q[j][1]); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      add(g, poly, null, 0xe8efe6, 1);
      // end walls with a door cut out
      for (const xe of [P.x0, P.x1]) {
        const sh = new THREE.Shape();
        for (let i = 0; i <= n; i++) { const [z, h] = pt(i); if (i === 0) sh.moveTo(z - P.zc, h); else sh.lineTo(z - P.zc, h); }
        const hole = new THREE.Path();
        hole.moveTo(-P.doorHW, 0.0); hole.lineTo(P.doorHW, 0.0); hole.lineTo(P.doorHW, P.doorH); hole.lineTo(-P.doorHW, P.doorH); hole.lineTo(-P.doorHW, 0);
        sh.holes.push(hole);
        const eg = new THREE.ShapeGeometry(sh);
        eg.rotateY(xe === P.x0 ? Math.PI / 2 : -Math.PI / 2);
        eg.translate(xe, FY, P.zc);
        add(eg, poly, null, 0xe8efe6, 1);
      }
    }
    // hoops, a ridge purlin, base boards, door frames, tied-back doors
    for (let i = 0; i < P.hoops; i++) {
      const x = P.x0 + 0.1 + (len - 0.2) * i / (P.hoops - 1);
      const pts = [];
      for (let j = 0; j <= 20; j++) { const a = Math.PI * j / 20; pts.push(new THREE.Vector3(x, FY + (P.ry - 0.03) * Math.sin(a) * 0.995, P.zc + (P.rx - 0.03) * Math.cos(a))); }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.022, 5, false), k.zinc, null, 0xb0b6b6, 1);
    }
    Rod(k.zinc, 0xb0b6b6, [P.x0, P.ry - 0.06, P.zc], [P.x1, P.ry - 0.06, P.zc], 0.016, 0.016, 5, 1);
    for (const s of [-1, 1]) { B(k.weathered, 0x8f8268, len, 0.25, 0.04, (P.x0 + P.x1) / 2, 0.12, P.zc + s * (P.rx - 0.02), 0, 1); Rod(k.zinc, 0xa0a6a6, [P.x0, 0.9, P.zc + s * 1.24], [P.x1, 0.9, P.zc + s * 1.24], 0.01, 0.01, 4, 2); }
    for (const xe of [P.x0, P.x1]) {
      const sx = xe === P.x0 ? 1 : -1;
      for (const s of [-1, 1]) B(k.weathered, COL.pine, 0.06, P.doorH + 0.05, 0.07, xe + sx * 0.03, (P.doorH + 0.05) / 2, P.zc + s * (P.doorHW + 0.035), 0, 1);
      B(k.weathered, COL.pine, 0.06, 0.07, P.doorHW * 2 + 0.14, xe + sx * 0.03, P.doorH + 0.035, P.zc, 0, 1);
      // door sheet rolled and tied up at the side
      Cy(k.fabric, 0xdfe8dd, 0.05, 0.05, P.doorH * 0.9, xe + sx * 0.12, P.doorH * 0.5, P.zc + P.doorHW + 0.13, 7, 2);
    }
    // inside: grow bags with tomatoes on canes and strings, a central path, a few red fruit, a watering can and a chair
    for (const s of [-1, 1]) {
      const z = P.zc + s * P.tomatoZ;
      B(k.rubber, 0x1d1f20, len - 0.8, 0.12, 0.34, (P.x0 + P.x1) / 2, 0.06, z, 0, 1);
      for (let x = P.x0 + 0.55; x < P.x1 - 0.4; x += 0.55) {
        add(plantGeo('tomato', Math.floor(rnd() * 3)), swTall, T(x, FY + 0.1, z, rnd() * 6, 0, 0, 1, 1, 1), jit(0x5c8a3c, 0.1), 1);
        Rod(k.weathered, COL.pine, [x, 0.1, z], [x, 1.75, z], 0.01, 0.008, 4, 2);
        for (let f = 0; f < 4; f++) Blob(swMid, f < 2 ? 0xc23a2a : 0xd8b22a, 0.028, x + rr(-0.07, 0.07), rr(0.5, 1.3), z + rr(-0.07, 0.07), { lod: 2, detail: 0 });
      }
    }
    // bits and pieces
    Cy(k.zinc, 0xaab2b2, 0.1, 0.12, 0.22, P.x0 + 1.0, 0.11, P.zc + 0.25, 9, 2);
    const stool = [P.x1 - 1.0, P.zc - 0.2]; B(k.weathered, COL.pine, 0.3, 0.04, 0.3, stool[0], 0.4, stool[1], 0.3, 2); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(k.weathered, COL.pine, 0.03, 0.4, 0.03, stool[0] + sx * 0.12, 0.2, stool[1] + sz * 0.12, 0.3, 2);
  }

  // ================================================================== the runner-bean tunnel
  {
    const Bn = A.BT, L = Bn.x1 - Bn.x0, mx = (Bn.x0 + Bn.x1) / 2, ang = Math.atan2(Bn.top, Bn.hw), sl = Math.hypot(Bn.hw, Bn.top);
    for (const s of [-1, 1]) {
      // canes in pairs crossing at the top, with three horizontal ties
      for (let i = 0; i < Bn.pairs; i++) {
        const x = Bn.x0 + 0.12 + (L - 0.24) * i / (Bn.pairs - 1);
        Rod(k.wicker, 0xb9a06a, [x, 0, Bn.zc + s * Bn.hw], [x, Bn.top + 0.12, Bn.zc - s * 0.04], 0.012, 0.008, 5, 1);
      }
      for (const f of [0.3, 0.6, 0.88]) Rod(k.wicker, 0xb9a06a, [Bn.x0, Bn.top * f, Bn.zc + s * Bn.hw * (1 - f)], [Bn.x1, Bn.top * f, Bn.zc + s * Bn.hw * (1 - f)], 0.009, 0.009, 4, 1);
      // the foliage mass on each slope: a dark slab with leaf cards and flowers
      add(boxUV(L, Bn.thick, sl, 1), wk.leafy, T(mx, FY + Bn.top / 2, Bn.zc + s * Bn.hw / 2, 0, s * ang, 0), 0x9ab482, 0);
      for (let i = 0; i < 420; i++) {
        const u = rnd(), v = rnd(), x = Bn.x0 + u * L, hh = v * Bn.top, z = Bn.zc + s * Bn.hw * (1 - v), out = (rnd() < 0.5 ? 1 : -1);
        const off = Bn.thick / 2 * out + 0.0, nz = s * Math.cos(ang), ny = Math.sin(ang);
        const px = x, py = hh + ny * off * 0.0 + 0.0, pz = z + nz * off;
        add(blade(0.13, 0.12, { yaw: rnd() * TAU, lean: rr(0.3, 1.4), curl: 0.3, taper: 0.4, seg: 1 }), swMid, T(px, FY + py, pz, 0, rr(-0.8, 0.8), rr(-0.8, 0.8)), jit(0x4f7a3a, 0.14), i < 180 ? 1 : 2);
      }
      for (let i = 0; i < 70; i++) {
        const u = rnd(), v = rr(0.1, 0.95), x = Bn.x0 + u * L, z = Bn.zc + s * Bn.hw * (1 - v) + s * rr(0.04, 0.1) * Math.cos(ang);
        Blob(swPetal, 0xc23a22, 0.022, x, v * Bn.top, z, { sy: 0.7, lod: 2, detail: 0 });
      }
      for (let i = 0; i < 26; i++) {      // hanging pods
        const u = rnd(), v = rr(0.2, 0.7), x = Bn.x0 + u * L, z = Bn.zc + s * Bn.hw * (1 - v) - s * 0.09;
        add(new THREE.CylinderGeometry(0.008, 0.006, rr(0.14, 0.26), 4).translate(0, -0.1, 0), swMid, T(x, FY + v * Bn.top, z, 0, rr(-0.2, 0.2), rr(-0.2, 0.2)), 0x5f8a3a, 2);
      }
    }
    B(k.wicker, 0xb9a06a, L, 0.025, 0.025, mx, Bn.top + 0.06, Bn.zc, 0, 1);
    // straw mulch and a bucket and a trug at the end
    Cy(k.zinc, 0xaab2b2, 0.14, 0.11, 0.25, Bn.x0 - 0.5, 0.125, Bn.zc + 0.8, 9, 1);
    B(k.wicker, 0xb89a68, 0.5, 0.15, 0.3, Bn.x1 + 0.6, 0.075, Bn.zc - 0.9, 0.4, 1);
  }

  // ================================================================== sunflowers, wigwams, sweet peas, cages, frames, butts etc.
  {
    // sunflowers: bendy stems, big leaves, a brown disc ringed with petals, nodding towards the lane
    for (const s of A.SUNFLOWERS) {
      const sc = s.dwarf ? 0.8 : 1;
      Rod(swTall, 0x5f7a3a, [s.x, 0, s.z], [s.x + 0.04, s.h, s.z + 0.02], 0.025, 0.016, 6, 1);
      const nl = s.dwarf ? 5 : 8;
      for (let i = 0; i < nl; i++) {
        const t = 0.15 + 0.7 * i / nl;
        add(blade(0.26 * sc, 0.2 * sc, { yaw: i * 2.4 + s.x, lean: 1.5, curl: 0.5, taper: 0.5, seg: 2 }), swTall, T(s.x + 0.04 * t, FY + s.h * t, s.z, 0, 0, 0), jit(0x4e7a34, 0.1), 1);
      }
      // head faces east-south-east
      const hy = s.h + 0.03, hx = s.x + 0.04 + 0.05, hz = s.z + 0.03;
      const yaw = 0.35 + (Math.abs(s.x * 3.7) % 0.5);
      add(new THREE.CylinderGeometry(0.1 * sc, 0.1 * sc, 0.045, 12).rotateX(Math.PI / 2), k.soil, T(hx, FY + hy, hz, yaw, 0.2, 0), 0x4a3320, 1);
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU;
        const bl = blade(0.085 * sc, 0.042 * sc, { yaw: 0, lean: 0.0, curl: 0.2, taper: 0.5, seg: 1 });
        bl.rotateZ(a - Math.PI / 2); bl.translate(Math.cos(a) * 0.1 * sc, Math.sin(a) * 0.1 * sc, 0.0);
        const M = new THREE.Matrix4().compose(new THREE.Vector3(hx, FY + hy, hz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
        add(bl, swPetal, M, jit(0xe8b81c, 0.08), 1);
      }
      Blob(swTall, 0x4e7a34, 0.09 * sc, hx - Math.sin(yaw) * 0.04, hy - 0.02, hz - Math.cos(yaw) * 0.04, { sz: 0.2, ry: yaw, lod: 2, detail: 0 });
    }
    // wigwams: ring of canes tied at the top, bean foliage and scarlet flowers
    for (const [x, z, r, h] of A.WIGWAMS) {
      const n = 8;
      for (let i = 0; i < n; i++) { const a = i / n * TAU; Rod(k.wicker, 0xb9a06a, [x + Math.cos(a) * r, 0, z + Math.sin(a) * r], [x + Math.cos(a) * 0.03, h + 0.15, z + Math.sin(a) * 0.03], 0.013, 0.008, 5, 1); }
      for (const f of [0.35, 0.65]) { const rr_ = r * (1 - f); add(new THREE.TorusGeometry(rr_, 0.006, 4, 12).rotateX(Math.PI / 2), k.wicker, T(x, FY + h * f, z), 0xb9a06a, 2); }
      for (let i = 0; i < 70; i++) {
        const a = rnd() * TAU, v = rr(0.05, 0.9), rad = r * (1 - v) * 0.95 + rr(0, 0.08);
        add(blade(0.14, 0.13, { yaw: rnd() * TAU, lean: rr(0.3, 1.2), curl: 0.3, taper: 0.4, seg: 1 }), swMid, T(x + Math.cos(a) * rad, FY + v * h, z + Math.sin(a) * rad, 0, rr(-0.7, 0.7), rr(-0.7, 0.7)), jit(0x4f7a3a, 0.14), i < 40 ? 1 : 2);
        if (i % 4 === 0) Blob(swPetal, 0xc23a22, 0.022, x + Math.cos(a) * rad, FY * 0 + v * h, z + Math.sin(a) * rad, { lod: 2, detail: 0 });
      }
      Blob(swMid, 0x4f7a3a, r * 0.5, x, h * 0.75, z, { sy: 1.5, lod: 0, amp: 0.3 });
    }
    // sweet-pea cane rows: crossed canes, netting between, foliage and pastel flowers
    for (const [x0, x1, z, h, hw] of A.PEA_ROWS) {
      const L = x1 - x0, ang = Math.atan2(h, hw), sl = Math.hypot(h, hw);
      for (let x = x0 + 0.1; x < x1; x += 0.45) for (const s of [-1, 1]) Rod(k.wicker, 0xb9a06a, [x, 0, z + s * hw], [x, h + 0.1, z - s * 0.03], 0.011, 0.007, 5, 1);
      Rod(k.wicker, 0xb9a06a, [x0, h + 0.1, z], [x1, h + 0.1, z], 0.01, 0.01, 4, 1);
      for (const s of [-1, 1]) {
        add(boxUV(L, 0.1, sl, 1), wk.leafy, T((x0 + x1) / 2, FY + h / 2, z + s * hw / 2, 0, s * ang, 0), 0xa8c090, 1);
        for (let i = 0; i < 110; i++) {
          const v = rnd(), x = x0 + rnd() * L;
          add(blade(0.1, 0.07, { yaw: rnd() * TAU, lean: 0.6, curl: 0.3, taper: 0.4, seg: 1 }), swTall, T(x, FY + v * h, z + s * (hw * (1 - v) + rr(0.03, 0.08)), 0, rr(-0.6, 0.6), rr(-0.6, 0.6)), jit(0x587c42, 0.12), i < 40 ? 1 : 2);
          if (i % 2 === 0 && v > 0.25) Blob(swPetal, pick([0xe7a0c0, 0xb18bd4, 0xf4f0e8, 0xd9627e, 0x8f7fd0]), 0.026, x, v * h, z + s * (hw * (1 - v) + 0.09), { sy: 0.7, lod: 2, detail: 0 });
        }
      }
      B(k.wicker, 0xb9a06a, 0.03, 0.4, 0.03, x0 - 0.1, 0.2, z, 0, 2);
    }
    // cages: timber posts, netting stretched over, bushes inside
    for (const c of A.CAGES) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, W = c.x1 - c.x0, D = c.z1 - c.z0;
      const dark = c.id === 'fruit' ? 0x2a2c2a : 0xe8ece0;
      for (const [px, pz] of [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1], [cx, c.z0], [cx, c.z1]]) B(k.weathered, COL.oak, 0.06, c.h + 0.1, 0.06, px, (c.h + 0.1) / 2, pz, 0, 1);
      for (const z of [c.z0, c.z1]) B(k.weathered, COL.oak, W, 0.05, 0.05, cx, c.h + 0.05, z, 0, 1);
      for (const x of [c.x0, c.x1]) B(k.weathered, COL.oak, 0.05, 0.05, D, x, c.h + 0.05, cz, 0, 1);
      const nm = c.id === 'fruit' ? 6 : 9;
      add(planeUV(W, c.h, nm), netMat, T(cx, FY + c.h / 2, c.z0), dark, 1); add(planeUV(W, c.h, nm), netMat, T(cx, FY + c.h / 2, c.z1, Math.PI), dark, 1);
      add(planeUV(D, c.h, nm), netMat, T(c.x0, FY + c.h / 2, cz, -Math.PI / 2), dark, 1); add(planeUV(D, c.h, nm), netMat, T(c.x1, FY + c.h / 2, cz, Math.PI / 2), dark, 1);
      add(planeUV(W, D, nm).rotateX(-Math.PI / 2), netMat, T(cx, FY + c.h + 0.02, cz), dark, 1);
    }
    {
      const c = A.CAGES[0];
      for (let i = 0; i < 9; i++) {
        const x = c.x0 + 0.5 + (i % 3) * 1.3, z = c.z0 + 0.6 + Math.floor(i / 3) * 0.85;
        Blob(swMid, jit(i % 2 ? 0x587c42 : 0x4f7a3a), rr(0.3, 0.4), x, 0.5, z, { sy: 0.85, lod: 1 });
        for (let f = 0; f < 6; f++) Blob(swMid, i % 3 === 0 ? 0xb8283a : i % 3 === 1 ? 0x2a2a35 : 0xc8d870, 0.025, x + rr(-0.28, 0.28), rr(0.3, 0.75), z + rr(-0.28, 0.28), { lod: 2, detail: 0 });
      }
      bed('strawb', c.x0 + 0.2, c.z1 - 0.7, c.x1 - 0.2, c.z1 - 0.2, 0.32, 0.3);
      B(k.weathered, COL.pine, 0.9, 0.04, 0.05, (c.x0 + c.x1) / 2, 1.6, c.z1 + 0.02, 0, 2);
      const c2 = A.CAGES[1];
      bed('cabbage', c2.x0 + 0.15, c2.z0 + 0.15, c2.x1 - 0.1, c2.z1 - 0.1, 0.55, 0.55);
      for (const [x, z] of [[c2.x0 + 0.3, c2.z0 + 0.3], [c2.x1 - 0.3, c2.z1 - 0.3]]) Cy(k.bark, 0x6a5a48, 0.012, 0.012, 1.1, x, 0.55, z, 5, 2);
    }
    // cold frames: timber box, a glass lid (propped open or shut), seedlings inside
    for (const c of A.COLDFRAMES) {
      const F = new Fr(c.x, c.z, c.yaw);
      FB(F, k.weathered, 0x9a8c72, c.w, 0.34, 0.03, 0, 0.17, c.d / 2, 0, 1); FB(F, k.weathered, 0x9a8c72, c.w, 0.34, 0.03, 0, 0.17, -c.d / 2, 0, 1);
      for (const sx of [-1, 1]) FB(F, k.weathered, 0x9a8c72, 0.03, 0.34, c.d, sx * c.w / 2, 0.17, 0, 0, 1);
      for (let i = 0; i < 8; i++) { const [x, z] = F.p(rr(-c.w / 2 + 0.1, c.w / 2 - 0.1), rr(-c.d / 2 + 0.1, c.d / 2 - 0.1)); add(plantGeo('lettuce', i % 3), swLow, T(x, FY + 0.1, z, rnd() * 6, 0, 0, 0.8, 0.8, 0.8), jit(0x8fb257), 1); }
      FB(F, k.soil, 0x4a3827, c.w - 0.06, 0.2, c.d - 0.06, 0, 0.1, 0, 0, 2);
      if (c.open) {
        const a = 55 * Math.PI / 180, Ln = c.d + 0.04;
        const [lx, lz] = [0, -c.d / 2 - Math.cos(a) * Ln / 2 + 0.02], lh = 0.36 + Math.sin(a) * Ln / 2;
        FB(F, k.glass, 0xd8e6e0, c.w, 0.012, Ln, lx, lh, lz, 0, 1, a);
        for (const sx of [-1, 1]) FB(F, k.paint, COL.cream, 0.035, 0.03, Ln, sx * c.w / 2, lh, lz, 0, 1, a);
        FB(F, k.paint, COL.cream, c.w, 0.03, 0.035, 0, lh + Math.sin(a) * Ln / 2, lz - Math.cos(a) * Ln / 2, 0, 2);
        { const [sx, sz] = F.p(0.3, -c.d / 2 - 0.35); Rod(k.weathered, COL.pine, [sx, 0.02, sz], [sx, 0.7, sz + 0.0], 0.012, 0.012, 4, 2); }
      } else {
        FB(F, k.glass, 0xd8e6e0, c.w, 0.012, c.d + 0.04, 0, 0.36, 0, 0, 1, 0.12);
        for (const sx of [-1, 1]) FB(F, k.paint, COL.cream, 0.035, 0.03, c.d + 0.04, sx * c.w / 2, 0.36, 0, 0, 1, 0.12);
      }
    }
    // water butts on brick stands, with lids, taps and overflow pipes
    for (const b of A.BUTTS) {
      B(k.stone, COL.brick, 0.62, 0.3, 0.62, b.x, 0.15, b.z, 0, 1);
      Cy(k.paint, b.col, b.r, b.r * 0.94, b.h, b.x, 0.3 + b.h / 2, b.z, 14, 0);
      Cy(k.paint, jit(b.col, 0.1), b.r * 1.02, b.r * 1.02, 0.04, b.x, 0.3 + b.h, b.z, 14, 1);
      for (const hy of [0.45, 0.8]) add(new THREE.TorusGeometry(b.r * 0.99, 0.012, 4, 14).rotateX(Math.PI / 2), k.paint, T(b.x, FY + 0.3 + b.h * hy, b.z), jit(b.col, 0.15), 2);
      Cy(k.brass, 0xc8a050, 0.014, 0.014, 0.12, b.x, 0.5, b.z + b.r + 0.04, 6, 1, Math.PI / 2);
      Cy(k.paint, 0x1c1c1c, 0.02, 0.02, 0.4, b.x + b.r * 0.7, 0.3 + b.h * 0.9, b.z - b.r * 0.7, 6, 2);
    }
    // compost bays: pallet sides, the heaps, a fork stuck in one, old carpet over the third
    {
      const C = A.COMPOST, ca = [0x6b4a30, 0x4a3a28, 0x7a6a3a];
      for (let i = 0; i < C.n; i++) {
        const cx = C.x0 + C.bayW * (i + 0.5), cz = C.z0 - C.bayD / 2;
        Blob(k.soil, jit(ca[i], 0.1), 0.52, cx, i === 2 ? 0.5 : 0.4 + i * 0.1, cz, { sy: 0.6, sx: 1.0, lod: 1, amp: 0.3 });
        if (i === 0) for (let w = 0; w < 7; w++) add(blade(0.35, 0.1, { yaw: rnd() * TAU, lean: 0.6, curl: 0.5 }), swLow, T(cx + rr(-0.3, 0.3), FY + 0.55, cz + rr(-0.3, 0.3)), jit(0x5f8a3a), 2);
      }
      const pallet = (x, z, w, h, yaw) => { for (let y = 0.07; y < h; y += 0.15) B(k.weathered, jit(0x9a8c72, 0.1), w, 0.1, 0.03, x, y, z, yaw, 1); };
      for (let i = 0; i <= C.n; i++) { const x = C.x0 + C.bayW * i; B(k.weathered, 0x8f8268, 0.06, C.h, 0.06, x, C.h / 2, C.z0 - 0.03, 0, 1); B(k.weathered, 0x8f8268, 0.06, C.h, 0.06, x, C.h / 2, C.z0 - C.bayD, 0, 1); B(k.weathered, jit(0x9a8c72, 0.1), 0.03, C.h, C.bayD, x, C.h / 2, C.z0 - C.bayD / 2, 0, 1); }
      for (let i = 0; i < C.n; i++) {
        pallet(C.x0 + C.bayW * (i + 0.5), C.z0 - C.bayD, C.bayW, C.h, 0);
        for (let y = 0.07; y < 0.6; y += 0.15) B(k.weathered, jit(0x9a8c72, 0.1), C.bayW - 0.05, 0.1, 0.03, C.x0 + C.bayW * (i + 0.5), y, C.z0 + 0.0, 0, 1);
      }
      B(k.fabric, 0x4a3f36, C.bayW + 0.1, 0.03, C.bayD + 0.2, C.x0 + C.bayW * 2.5, 1.0, C.z0 - C.bayD / 2, 0, 1, 0.0, 0.0);
      const [fx, fz] = [C.x0 + 0.5, C.z0 - 0.4]; Rod(k.weathered, COL.pine, [fx, 0.3, fz], [fx + 0.15, 1.45, fz + 0.05], 0.015, 0.015, 5, 1); Rod(k.steel, 0x9aa0a0, [fx, 0.3, fz], [fx - 0.02, 0.0, fz], 0.01, 0.01, 4, 2);
    }
    // bonfire pile: sticks, branches and old pallets; a rake leaning on it; the ashes round it
    {
      const Bf = A.BONFIRE;
      for (let i = 0; i < 70; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * Bf.r * 0.85, h = (1 - d / (Bf.r * 0.9)) * Bf.h * rr(0.5, 1.0);
        const len = rr(0.4, 1.0), yaw = a + rr(-0.6, 0.6), tilt = rr(0.6, 1.5);
        Cy(k.bark, jit(pick([0x6a5a48, 0x7a6a50, 0x5a4a38])), 0.012 + rnd() * 0.018, 0.01, len, Bf.x + Math.cos(a) * d, h + 0.05, Bf.z + Math.sin(a) * d, 5, 1, tilt, 0, yaw);
      }
      for (let i = 0; i < 4; i++) { const a = i * 1.6; B(k.weathered, 0x8a7d62, 1.0, 0.1, 0.12, Bf.x + Math.cos(a) * 0.5, 0.2 + i * 0.1, Bf.z + Math.sin(a) * 0.5, a, 1, 0.1); }
      Blob(wk.leafy, 0xb0c090, 0.5, Bf.x + 0.3, 0.75, Bf.z - 0.2, { sy: 0.5, lod: 1, amp: 0.3 });
      const [rx, rz] = [Bf.x + Bf.r + 0.1, Bf.z + 0.4]; Rod(k.weathered, COL.pine, [rx, 0, rz], [rx - 0.5, 1.4, rz - 0.15], 0.014, 0.014, 5, 1); B(k.steel, 0x8c9494, 0.3, 0.02, 0.05, rx + 0.02, 0.02, rz, 0.2, 2);
    }
    // wheelbarrows: galvanised tub on a wheel, wooden handles and legs; one full of weeds
    for (const b of A.BARROWS) {
      const F = new Fr(b.x, b.z, b.yaw);
      { const [tx, tz] = F.p(0, -0.1); add(new THREE.CylinderGeometry(0.4, 0.25, 0.26, 4).rotateY(Math.PI / 4).scale(1, 1, 1.3), k.zinc, T(tx, FY + 0.5, tz, b.yaw), 0xaab2b2, 1); }
      FCy(F, k.rubber, 0x1c1c1c, 0.2, 0.2, 0.08, 0, 0.2, 0.46, 12, 1, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        const [x1, z1] = F.p(sx * 0.24, -0.1), [x2, z2] = F.p(sx * 0.24, -0.88); Rod(k.weathered, 0xa88a60, [x1, 0.4, z1], [x2, 0.62, z2], 0.02, 0.02, 5, 1);
        const [lx, lz] = F.p(sx * 0.24, -0.82); Rod(k.weathered, 0xa88a60, [lx, 0, lz], [lx, 0.55, lz], 0.016, 0.016, 5, 1);
        // the handles run on under the tub to the wheel's axle
        const [ax, az] = F.p(sx * 0.055, 0.46); Rod(k.weathered, 0xa88a60, [x1, 0.4, z1], [ax, 0.2, az], 0.018, 0.016, 5, 1);
      }
      for (let i = 0; i < 5; i++) { const [x, z] = F.p(rr(-0.2, 0.2), rr(-0.25, 0.1)); add(blade(0.3, 0.1, { yaw: rnd() * TAU, lean: 0.8, curl: 0.5 }), swLow, T(x, FY + 0.6, z), jit(0x5f8a3a), 2); }
    }
    // the scarecrow: post, crossbar, sack body and head, straw hands, a battered straw hat, CDs on strings, a crow
    {
      const S = A.SCARECROW, F = new Fr(S.x, S.z, S.yaw);
      Rod(k.weathered, COL.oak, [S.x, 0, S.z], [S.x, 1.7, S.z], 0.04, 0.035, 6, 1);
      const [a1, b1] = F.p(-0.78, 0), [a2, b2] = F.p(0.78, 0);
      Rod(k.weathered, COL.oak, [a1, 1.42, b1], [a2, 1.42, b2], 0.025, 0.025, 6, 1);
      FB(F, k.fabric, 0x5a4a3a, 0.4, 0.62, 0.22, 0, 1.17, 0, 0, 1);                                               // old waxed coat
      FB(F, k.fabric, 0x6a5a4a, 0.18, 0.5, 0.17, -0.26, 1.28, 0, 0, 1, 0, 0.4); FB(F, k.fabric, 0x6a5a4a, 0.18, 0.5, 0.17, 0.26, 1.28, 0, 0, 1, 0, -0.4);
      Blob(k.fabric, 0xc8b88a, 0.13, S.x, 1.62, S.z, { sy: 1.05, lod: 1, detail: 1 });
      for (const sx of [-1, 1]) { const [ex, ez] = F.p(sx * 0.82, 0); for (let i = 0; i < 7; i++) Rod(k.wicker, 0xd8c070, [ex - sx * 0.04 * Math.cos(S.yaw), 1.42, ez], [ex + sx * rr(0.05, 0.15) * Math.cos(S.yaw), 1.42 - rr(0.05, 0.22), ez + rr(-0.05, 0.05)], 0.004, 0.003, 3, 2); }
      for (const [dx, dz] of [[-0.04, -0.11], [0.04, -0.11]]) { const [ex, ez] = F.p(dx, dz); Blob(k.enamel, 0x181818, 0.014, ex, 1.65, ez, { lod: 2, detail: 0 }); }
      const hat = A.SCARECROW;
      Cy(k.wicker, 0xd6bd74, hat.brimR, hat.brimR, 0.014, S.x, hat.hatBrimH - 0.007, S.z, 14, 1);
      Cy(k.wicker, 0xc9ad62, hat.crownR, hat.crownR * 1.05, 0.15, S.x, hat.hatBrimH + 0.075, S.z, 12, 1);
      Cy(k.fabric, 0x8b3d2c, hat.crownR * 1.06, hat.crownR * 1.06, 0.03, S.x, hat.hatBrimH + 0.04, S.z, 12, 2);
      for (let i = 0; i < 4; i++) { const [x, z] = F.p(-0.5 + i * 0.35, 0.05); Rod(k.fabric, 0xe8e8e0, [x, 1.4, z], [x, 1.1 - i * 0.04, z], 0.002, 0.002, 3, 2); add(new THREE.CircleGeometry(0.06, 10), k.steel, T(x, FY + 1.06 - i * 0.04, z, F.yaw), 0xd0d4dc, 2); }
      // the crow on the left arm tip
      const [cx, cz] = F.p(-0.55, 0);
      Blob(k.fabric, 0x15171a, 0.05, cx, 1.5, cz, { sx: 1.3, sy: 0.9, ry: S.yaw, lod: 1, detail: 1 }); Blob(k.fabric, 0x15171a, 0.03, cx, 1.56, cz, { lod: 1, detail: 0 });
    }
    // the pond, with a stone rim, marginal reeds, lily pads, a log, bulrushes
    {
      const P = A.POND;
      const wg = new THREE.CircleGeometry(P.r, 28); wg.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(wg, wk.water); m.position.set(P.x, FY + 0.02, P.z); m.renderOrder = -1;
      ctx.object(m, 1);
      add(new THREE.RingGeometry(P.r - 0.02, P.r + 0.35, 28).rotateX(-Math.PI / 2), k.soil, T(P.x, FY + 0.012, P.z), 0x3a2f24, 1);
      for (let i = 0; i < 22; i++) { const a = i / 22 * TAU + rr(-0.1, 0.1), r = P.r + 0.08 + rr(0, 0.12); Blob(k.stone, jit(pick([0x9a948a, 0x88837a, 0xaaa496])), rr(0.1, 0.18), P.x + Math.cos(a) * r, 0.05, P.z + Math.sin(a) * r, { sy: 0.6, lod: 1, detail: 0 }); }
      for (let i = 0; i < 9; i++) {
        const a = 0.2 + i * 0.55, r = P.r + rr(-0.15, 0.15), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        for (let j = 0; j < 8; j++) add(blade(rr(0.7, 1.2), 0.025, { yaw: rnd() * TAU, lean: 0.1, curl: 0.5, taper: 0.9, seg: 3 }), swMid, T(x + rr(-0.1, 0.1), FY, z + rr(-0.1, 0.1)), jit(0x587c42, 0.12), 1);
        if (i % 3 === 0) for (let j = 0; j < 3; j++) { Rod(swMid, 0x587c42, [x + j * 0.04, 0, z], [x + j * 0.04, 1.0 + j * 0.1, z], 0.008, 0.006, 4, 1); Cy(k.bark, 0x4a3320, 0.02, 0.02, 0.14, x + j * 0.04, 1.05 + j * 0.1, z, 6, 1); }
      }
      for (let i = 0; i < 7; i++) { const a = rnd() * TAU, r = rnd() * P.r * 0.7; add(new THREE.CircleGeometry(rr(0.09, 0.15), 10).rotateX(-Math.PI / 2), k.leaf, T(P.x + Math.cos(a) * r, FY + 0.026, P.z + Math.sin(a) * r), jit(0x5f8a3a), 1); }
      Blob(swPetal, 0xf4f0e8, 0.05, P.x + 0.3, 0.05, P.z - 0.2, { sy: 0.4, lod: 2, detail: 0 });
      const L = A.LOGS;
      for (const [dx, dz, y, yaw, r, len] of [[0, 0, 0.1, 0.3, 0.1, 1.0], [0.05, 0.03, 0.28, -0.2, 0.09, 0.9], [-0.3, 0.4, 0.11, 1.6, 0.11, 0.5]]) Cy(k.bark, 0x6a5a48, r, r, len, L.x + dx, y, L.z + dz, 8, 1, Math.PI / 2, 0, yaw);
      // insect hotel: a stack of pallets with canes, bricks and straw, leaning against the hedge-end
      B(k.weathered, 0x8a7d62, 0.8, 0.05, 0.45, L.x + 0.9, 0.05, L.z - 0.2, 0.1, 1); B(k.weathered, 0x8a7d62, 0.8, 0.05, 0.45, L.x + 0.9, 0.4, L.z - 0.2, 0.1, 1);
      for (const sx of [-1, 1]) B(k.weathered, 0x8a7d62, 0.05, 0.4, 0.45, L.x + 0.9 + sx * 0.38, 0.22, L.z - 0.2, 0.1, 1);
      for (let i = 0; i < 20; i++) Rod(k.wicker, 0xb9a06a, [L.x + 0.6 + i * 0.035, 0.14 + (i % 3) * 0.08, L.z - 0.0], [L.x + 0.6 + i * 0.035, 0.14 + (i % 3) * 0.08, L.z - 0.38], 0.01, 0.01, 4, 2);
    }
  }

  // ================================================================== crops in the plots
  {
    const fruitTom = null; void fruitTom;
    // A1: leeks, dahlias, a bean bed; B1: onions and lettuce flanking the bean tunnel; C1: carrots by the polytunnel
    bed('leek', -15.4, -14.45, -13.0, -13.75, 0.2, 0.24);
    bed('dahlia', -13.6, -12.6, -13.0, -10.7, 0.8, 0.8, { scale: 1.1 });
    bed('onion', -11.3, -14.4, -5.8, -13.7, 0.17, 0.22);
    bed('lettuce', -11.3, -11.7, -5.8, -10.7, 0.28, 0.3);
    ridges(-11.3, -11.7, -5.8, -10.7, 0.3, 0x574130, 0.06);
    bed('carrot', -3.9, -14.45, 2.0, -14.0, 0.1, 0.16, { lod: 2 });
    bed('beet', -3.9, -11.0, 2.0, -10.7, 0.22, 0.22);
    // E1: potato ridges with haulm
    ridges(15.9, -12.6, 18.7, -10.6, 0.55, 0x5a4430, 0.16);
    bed('potato', 15.9, -12.6, 18.7, -10.6, 0.5, 0.55, { y: 0.14 });
    weeds(8, 13.4, -14.4, 15.4, -12.2);
    // B2: sweetcorn, courgettes and pumpkins behind the slalom; carrots
    bed('corn', -11.2, -16.55, -5.7, -16.1, 0.55, 0.45, { skip: (x, z) => A.SUNFLOWERS.some((s) => Math.hypot(s.x - x, s.z - z) < 0.45) });
    bed('squash', -11.2, -20.3, -5.7, -19.8, 1.0, 0.5, { y: 0 });
    bed('squashleaf', -11.2, -20.3, -5.7, -19.8, 1.0, 0.5, { y: 0 });
    // A2: rhubarb and broad beans beside the fruit cage
    bed('rhubarb', -13.5, -19.4, -12.9, -16.0, 0.6, 0.8, { scale: 1.1 });
    bed('bean', -13.9, -15.9, -12.9, -15.7, 0.25, 0.2);
    // C2: leeks and beetroot round shed C, onions round shed B
    bed('leek', -4.2, -15.5, -0.8, -15.05, 0.2, 0.22);
    bed('beet', -4.2, -19.4, -0.8, -18.9, 0.22, 0.22);
    bed('onion', 0.2, -15.5, 2.4, -15.0, 0.17, 0.2); bed('onion', 0.3, -19.4, 2.3, -18.9, 0.17, 0.2);
    // D2/E2: kale, chard, cabbage, beetroot rows beside the scarecrow
    bed('kale', 13.5, -16.3, 18.7, -15.8, 0.6, 0.5);
    bed('chard', 13.5, -19.4, 18.7, -18.8, 0.45, 0.5);
    bed('cabbage', 13.9, -18.0, 15.4, -17.0, 0.5, 0.5);
    bed('lettuce', 6.8, -15.9, 7.2, -15.8, 0.2, 0.2);
    // row 3
    bed('potato', -4.2, -22.9, -2.4, -21.2, 0.45, 0.5); ridges(-4.2, -22.9, -2.4, -21.2, 0.5, 0x4d3b2a, 0.14);
    bed('onion', 0.2, -22.9, 2.3, -22.1, 0.17, 0.22); bed('lettuce', 0.2, -21.7, 1.5, -21.0, 0.28, 0.3);
    bed('rhubarb', -6.7, -22.9, -5.8, -21.0, 0.6, 0.8);
    bed('cabbage', 12.0, -23.0, 12.0, -21.3, 0.5, 0.5);
    bed('chard', 13.4, -22.9, 15.2, -21.0, 0.45, 0.5); bed('squash', 17.0, -21.4, 18.7, -20.8, 0.9, 0.6); bed('squashleaf', 17.0, -21.4, 18.7, -20.8, 0.9, 0.6);
    bed('strawb', -10.8, -22.9, -9.9, -21.5, 0.3, 0.3);
    // forcers: upturned buckets over the rhubarb
    for (const [x, z] of [[-6.3, -22.1], [-6.4, -21.5]]) { Cy(k.terracotta, 0x8a8f8a, 0.17, 0.2, 0.42, x, 0.21, z, 10, 1); }
    // pea-straw and bamboo cane bundles by the sheds; seed packet on a stick marks each row
    for (const [x, z] of [[-4.0, -14.8], [2.2, -14.9], [-10.9, -15.1], [5.9, -14.8], [-12.2, -19.0], [13.1, -15.0], [12.2, -23.0], [-12.6, -23.2], [18.6, -19.5], [-17.9, -10.9]]) {
      B(k.weathered, 0xd8d0a8, 0.045, 0.2, 0.01, x, 0.22, z, rnd() * 0.3, 2); Rod(k.wicker, 0xb9a06a, [x, 0, z], [x, 0.13, z], 0.004, 0.004, 3, 2);
    }
    for (let i = 0; i < 28; i++) { const x = rr(-18.6, 18.6), z = rr(-23.2, -10.7); weeds(1, x, z, x + 0.1, z + 0.1); }
    // allotment plot numbers on corner posts
    for (const [x, z] of [[-18.9, -10.55], [-11.6, -10.55], [-4.4, -10.55], [5.6, -10.55], [13.2, -10.55], [-18.9, -15.65], [-11.6, -15.65], [-4.4, -15.65], [5.6, -15.65], [13.2, -15.65], [-18.9, -20.55], [-11.6, -20.55], [-4.4, -20.55], [5.6, -20.55], [13.2, -20.55]]) {
      B(k.weathered, COL.pine, 0.05, 0.55, 0.05, x, 0.275, z, 0, 2); B(k.paint, pick([0xe8e0c8, 0xd9c547, 0xcfd8d0]), 0.14, 0.1, 0.012, x, 0.5, z + 0.03, 0, 2);
    }
    // a bench by the main way with a flask on it
    B(k.weathered, 0x9a8c72, 1.2, 0.05, 0.4, 6.0, 0.45, -13.9, 0, 1); for (const sx of [-1, 1]) B(k.weathered, 0x7a6a52, 0.06, 0.45, 0.4, 6.0 + sx * 0.5, 0.225, -13.9, 0, 1);
  }

  // ================================================================== trees
  for (const t of A.TREES) buildTree(ctx, { ...t });

  // ================================================================== hedges: park edge with the stile, side hedges
  {
    const H = A.PARK_HEDGE, zc = (H.z0 + H.z1) / 2, S = A.STILE;
    const g0 = H.gap[0] + 19.5, g1 = H.gap[1] + 19.5;
    buildHedge(ctx, { a: [-19.5, zc], b: [19.5, zc], h: H.h, d: H.z1 - H.z0 + 0.1, gaps: [[g0, g1]], color: 0xa8bc98 });
    for (const sx of [-A.SIDE_X, A.SIDE_X]) buildHedge(ctx, { a: [sx, A.FENCE_Z], b: [sx, H.z0], h: 1.8, d: 0.6, color: 0xb0c29c });
    // leaf cards on the park hedge's faces
    if (!ctx.lite) {
      const pts = [];
      for (let i = 0; i < 360; i++) {
        const x = rr(-19.4, 19.4); if (x > H.gap[0] - 0.1 && x < H.gap[1] + 0.1) continue;
        pts.push(rnd() < 0.8 ? [x, FY + rr(0.1, H.h - 0.05), H.z1 + 0.02, 0, 0, 1] : [x, FY + H.h - 0.03, rr(H.z0, H.z1), 0, 1, 0]);
      }
      ctx.object(leafCards(ctx, pts, { size: 0.16, hue: 100 }), 2);
    }
    // the stile: two stout posts, two rails across the gap, a step each side
    const gp2 = ctx.groundY(S.x, zc - 0.67) - FY;
    for (const sx of [-1, 1]) { B(k.weathered, COL.oak, 0.11, 1.4, 0.11, S.x + sx * (S.w / 2 + 0.005), 0.7, zc, 0, 1); B(k.weathered, jit(COL.oak), 0.14, 0.04, 0.14, S.x + sx * (S.w / 2 + 0.005), 1.42, zc, 0, 2); }
    for (const rh of [S.top, S.mid]) B(k.weathered, 0xa89470, S.w + 0.1, 0.08, 0.07, S.x, rh, zc, 0, 1);
    B(k.weathered, 0xa89470, 0.6, 0.28, 0.4, S.x, 0.14, zc + 0.62, 0, 1);
    B(k.weathered, 0xa89470, 0.6, 0.4, 0.4, S.x, gp2 + 0.1, zc - 0.67, 0, 1);
    B(k.paint, 0xd9c547, 0.14, 0.1, 0.01, S.x - 0.5, 1.35, zc + 0.07, 0, 2);              // footpath waymark
    // cow parsley and nettles in the gap's shoulders
    for (let i = 0; i < 10; i++) Rod(swMid, 0x7a9a50, [S.x + (i % 2 ? 0.85 : -0.85) + rr(-0.2, 0.2), 0, zc + rr(-0.3, 0.5)], [S.x + (i % 2 ? 0.9 : -0.9), rr(0.7, 1.1), zc + rr(-0.3, 0.5)], 0.006, 0.004, 4, 2);
  }
}

