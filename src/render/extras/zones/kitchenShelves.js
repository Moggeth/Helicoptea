import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM } from '../../../sim/layout.js';
import * as K from '../../../sim/extras/zones/kitchenShelves.js';
import { registerExtraSound } from '../../../audio/extras.js';

// kitchenShelves: the shelves and sills of the kitchen, dressed.
//   1. Windowsill herbs: basil, rosemary, mint and thyme in terracotta pots on saucers (they sway in the wash).
//   2. A loose enamel jug of sweet peas on the sill (a dynamic body: wash rocks it, a nudge tips it off).
//   3. The dresser worktop: a lithographed biscuit tin and two stacked cake tins.
//   4. A row of cookery books between iron bookends on top of the dresser, the last one leaning.
//   5. A walnut mantel clock beside them: real time, a ticking second hand and a swinging pendulum.
//   6. A two-tier wall shelf of preserving jars (gingham covers, labels, Kilner jars, a bottle, a crock).
//   7. A bunch of drying lavender hung under the shelf: a two-axis pendulum swung by the rotor wash.
// Draw calls of its own: the label atlas (merged statics), the loose jug, the clock's hands and pendulum, and
// the lavender. Everything else goes into the shared batch with the kit's materials.

const AT = 512;
const { SILLTOP, SILL_Z, HERBS, JUG, WORK, TOPY, TIN, CAKE, BOOKZ, BOOK_POSE, BOOKS_X0, BOOKS_END, CLOCK, SHELF, JARS, LAV } = K;

// ---------------------------------------------------------------------------------------------- the atlas
// One 512 px canvas: book spines, the clock face, the biscuit tin lid, tin and jar labels, gingham, a white pixel.
const SPINE_PX = 1333;                                       // px per metre of spine width
const SPINE_H = 360;
const SPINES = [
  ['THE ENGLISH KITCHEN', '#7a2e2a', '#e4c46a'], ['PRESERVES', '#2f4a3a', '#e8d9a0'], ['A YEAR OF PUDDINGS & PIES', '#26364f', '#d8b86a'],
  ['TEA', '#b59a5a', '#3a2a14'], ['THE FARMHOUSE LARDER', '#6b3b2a', '#ecd9a0'], ['BREAD', '#8a3b4a', '#ecd9a0'], ['SUNDAY BAKING', '#3d5e63', '#f0e2b0'],
];
const WHITE = [404, 500, 8, 8];
const CLOCK_R = [288, 0, 192, 192], TIN_R = [288, 192, 192, 136], CAKE_R = [288, 328, 96, 96];
const GING_R = [[384, 328, 64, 64], [448, 328, 64, 64], [448, 392, 64, 64]];
const LABEL_R = (i) => (i < 5 ? [i * 80, 392, 80, 48] : [(i - 5) * 80, 440, 80, 48]);
const spineRect = (i) => {
  let x = 0;
  for (let k = 0; k < i; k++) x += Math.round(BOOK_POSE[k].t * SPINE_PX);
  return [x, 0, Math.round(BOOK_POSE[i].t * SPINE_PX), SPINE_H];
};

function paintAtlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = AT;
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, AT, AT);
  const serif = 'Georgia, "Times New Roman", serif';
  // Spines.
  SPINES.forEach(([title, cloth, gilt], i) => {
    const [x, y, w, h] = spineRect(i);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = cloth; c.fillRect(x, y, w, h);
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = gilt;
    for (const yy of [14, 22, h - 22, h - 14]) c.fillRect(x + 4, yy, w - 8, 2);
    c.fillRect(x + 4, 74, w - 8, 1.5); c.fillRect(x + 4, h - 74, w - 8, 1.5);
    c.translate(x + w / 2, h / 2); c.rotate(Math.PI / 2);
    let fs = Math.min(w * 0.4, 22);
    c.font = `bold ${fs}px ${serif}`;
    const maxW = h - 168;
    const tw = c.measureText(title).width;
    if (tw > maxW) { fs *= maxW / tw; c.font = `bold ${fs}px ${serif}`; }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = gilt;
    c.fillText(title, 0, 1);
    c.restore();
    // Publisher's mark at the foot.
    c.fillStyle = gilt; c.beginPath(); c.arc(x + w / 2, h - 44, Math.min(w * 0.18, 6), 0, Math.PI * 2); c.fill();
  });
  // Clock face: cream enamel, black roman numerals, minute track.
  {
    const [x, y, w, h] = CLOCK_R, cx = x + w / 2, cy = y + h / 2, R = 92;
    c.fillStyle = '#d8d0bc'; c.fillRect(x, y, w, h);
    const g = c.createRadialGradient(cx, cy - 8, 10, cx, cy, R);
    g.addColorStop(0, '#f6f0df'); g.addColorStop(1, '#e8dfc8');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1c1812'; c.lineWidth = 2.2;
    c.beginPath(); c.arc(cx, cy, R - 4, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cy, R - 20, 0, Math.PI * 2); c.lineWidth = 1.2; c.stroke();
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, big = i % 5 === 0;
      c.lineWidth = big ? 2.2 : 1;
      c.beginPath(); c.moveTo(cx + Math.sin(a) * (R - 20), cy - Math.cos(a) * (R - 20)); c.lineTo(cx + Math.sin(a) * (R - (big ? 28 : 25)), cy - Math.cos(a) * (R - (big ? 28 : 25))); c.stroke();
    }
    const nums = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    c.fillStyle = '#1c1812'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 15px ${serif}`;
    nums.forEach((n, i) => {
      const a = i / 12 * Math.PI * 2, rr = R - 42;
      c.save(); c.translate(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); c.rotate(a); c.fillText(n, 0, 0); c.restore();
    });
    c.font = `italic 9px ${serif}`; c.fillText('Whitlock & Daughters', cx, cy + 30); c.font = `7px ${serif}`; c.fillText('8 DAY', cx, cy + 40);
    // Winding holes.
    c.fillStyle = '#8c7e5c'; for (const dx of [-17, 17]) { c.beginPath(); c.arc(cx + dx, cy + 12, 2.2, 0, Math.PI * 2); c.fill(); }
  }
  // Biscuit tin lid: tartan border, a navy field, gold lettering and a thistle.
  {
    const [x, y, w, h] = TIN_R;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = '#7d1f1f'; c.fillRect(x, y, w, h);
    c.globalAlpha = 0.75; c.fillStyle = '#1f4a2f';
    for (let i = 0; i < w; i += 16) c.fillRect(x + i, y, 6, h);
    for (let j = 0; j < h; j += 16) c.fillRect(x, y + j, w, 6);
    c.globalAlpha = 0.9; c.fillStyle = '#e6c85a';
    for (let i = 8; i < w; i += 32) c.fillRect(x + i, y, 1.5, h);
    for (let j = 8; j < h; j += 32) c.fillRect(x, y + j, w, 1.5);
    c.globalAlpha = 1;
    c.fillStyle = '#1b2a4a'; c.fillRect(x + 14, y + 12, w - 28, h - 24);
    c.strokeStyle = '#e0bf58'; c.lineWidth = 2; c.strokeRect(x + 18, y + 16, w - 36, h - 32);
    c.fillStyle = '#e8c860'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold 15px ${serif}`; c.fillText('SHORTBREAD', x + w / 2, y + 34);
    c.font = `italic 9px ${serif}`; c.fillText('baked with finest butter', x + w / 2, y + 100);
    c.font = `7px ${serif}`; c.fillText('THE MAGPIE BISCUIT CO.', x + w / 2, y + 112);
    // Thistle.
    const tx = x + w / 2, ty = y + 70;
    c.strokeStyle = '#6fa060'; c.lineWidth = 2; c.beginPath(); c.moveTo(tx, ty + 18); c.lineTo(tx, ty + 4); c.stroke();
    c.beginPath(); c.moveTo(tx, ty + 14); c.quadraticCurveTo(tx - 14, ty + 6, tx - 18, ty - 2); c.moveTo(tx, ty + 12); c.quadraticCurveTo(tx + 14, ty + 4, tx + 18, ty - 4); c.stroke();
    c.fillStyle = '#5a7f4a'; c.beginPath(); c.ellipse(tx, ty + 2, 7, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b05aa6';
    for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(tx + i * 2, ty - 1); c.lineTo(tx + i * 3.2, ty - 15 - (5 - Math.abs(i)) * 0.6); c.lineTo(tx + i * 2 + 2, ty - 1); c.fill(); }
    c.restore();
  }
  // Cake tin label: cream with a red double rule.
  {
    const [x, y, w, h] = CAKE_R;
    c.fillStyle = '#efe6cf'; c.fillRect(x, y, w, h);
    c.strokeStyle = '#a8362b'; c.lineWidth = 2; c.strokeRect(x + 4, y + 18, w - 8, h - 36);
    c.lineWidth = 0.8; c.strokeRect(x + 7, y + 21, w - 14, h - 42);
    c.fillStyle = '#a8362b'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 26px ${serif}`; c.fillText('CAKE', x + w / 2, y + h / 2 + 1);
  }
  // Gingham: red, blue, green.
  GING_R.forEach(([x, y, w, h], i) => {
    const col = ['190,40,40', '50,80,160', '60,130,80'][i];
    c.fillStyle = '#f4f0e6'; c.fillRect(x, y, w, h);
    c.fillStyle = `rgba(${col},0.5)`;
    for (let k = 0; k < 8; k += 2) { c.fillRect(x + k * 8, y, 8, h); c.fillRect(x, y + k * 8, w, 8); }
  });
  // Jar labels.
  const labels = [['Strawberry', 'Jam  •  July', '#c0392b'], ['Damson', 'Jam  •  Sept', '#5a2a4a'], ['Green Tomato', 'Chutney  •  Oct', '#3a5a2a'], ['Seville', 'Marmalade  •  Jan', '#c47a1a'], ['Plum', 'Jam  •  Aug', '#7a2a3a'], ['Brown Sauce', 'Home made', '#5a3a1a']];
  labels.forEach(([a, b, col], i) => {
    const [x, y, w, h] = LABEL_R(i);
    c.fillStyle = '#f2ebd6'; c.fillRect(x, y, w, h);
    c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(x + 3, y + 3, w - 6, h - 6);
    c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = 17; c.font = `italic ${fs}px "Brush Script MT", "Segoe Script", cursive, ${serif}`;
    const tw = c.measureText(a).width; if (tw > w - 14) { fs *= (w - 14) / tw; c.font = `italic ${fs}px "Brush Script MT", "Segoe Script", cursive, ${serif}`; }
    c.fillText(a, x + w / 2, y + 19);
    c.fillStyle = '#4a3a2a'; c.font = `9px ${serif}`; c.fillText(b, x + w / 2, y + 35);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Remap a geometry's 0..1 UVs into an atlas rectangle (canvas pixels, y down). flipU mirrors it.
function region(g, [x, y, w, h], flipU = false) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i); const v = uv.getY(i);
    if (flipU) u = 1 - u;
    uv.setXY(i, (x + u * w) / AT, 1 - (y + (1 - v) * h) / AT);
  }
  return g;
}
function whiteUV(g) {
  const n = g.attributes.position.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = (WHITE[0] + 4) / AT; uv[i * 2 + 1] = 1 - (WHITE[1] + 4) / AT; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------------------------------------- geometry helpers
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// Tapered tube along a polyline / spline.
function taperTube(pts, r0, r1, seg = 6, radial = 5) {
  const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg), r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
// A straight rod from a to b.
function rod(a, b, r, radial = 6) {
  const d = _a.subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, false);
  g.applyMatrix4(new THREE.Matrix4().compose(_b.addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}

// A leaf lying along +z with the blade across x: ovate, pointed, cupped (edges up) and drooping at the tip.
const leafCache = new Map();
function leafGeo(len, wid, { nL = 4, nW = 2, cup = 0.3, droop = 0.2, tip = 0.8, serr = 0, wave = 0, foldRib = 0 } = {}) {
  const key = [len, wid, nL, nW, cup, droop, tip, serr, wave, foldRib].join('|');
  if (leafCache.has(key)) return leafCache.get(key);
  const pos = [], uv = [], idx = [];
  const cols = 2 * nW + 1;
  for (let i = 0; i <= nL; i++) {
    const t = i / nL;
    let w = wid / 2 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, tip))), 0.72);
    if (serr && i > 0 && i < nL) w *= 1 + serr * (i % 2 ? 1 : -1);
    for (let j = -nW; j <= nW; j++) {
      const u = j / nW, x = u * w;
      let y = cup * Math.abs(x) - droop * len * t * t - foldRib * (1 - Math.abs(u)) * wid * 0.1;
      if (wave) y += wave * Math.sin(t * 9 + u * 3);
      pos.push(x, y, t * len);
      uv.push(0.5 + u * 0.5, t);
    }
  }
  for (let i = 0; i < nL; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  leafCache.set(key, g);
  return g;
}
// A fan-shaped petal from the origin up +y, curling about x (bend > 0 curls toward +z), ruffled rim.
function fanPetal(R, spread, bend, { nR = 3, nA = 6, ruffle = 0.08, seed = 0 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i <= nR; i++) for (let j = 0; j <= nA; j++) {
    const f = i / nR, a = (j / nA - 0.5) * spread;
    const r = R * f * (1 + (i === nR ? ruffle * Math.sin(j * 2.9 + seed) : 0));
    pos.push(Math.sin(a) * r, Math.cos(a) * r, bend * f * f * R);
  }
  for (let i = 0; i < nR; i++) for (let j = 0; j < nA; j++) {
    const a = i * (nA + 1) + j, b = a + 1, c = a + nA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Vertex-coloured geometry accumulator for the moving meshes (jug and sweet peas, lavender).
class ColGeo {
  constructor() { this.p = []; this.n = []; this.c = []; }
  add(geo, m, color) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, col = new THREE.Color(color);
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i)); this.n.push(N.getX(i), N.getY(i), N.getZ(i));
      this.c.push(col.r, col.g, col.b);
    }
    g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// Jitter a colour a little in lightness and hue so a mass of leaves never reads as one flat green.
const _c = new THREE.Color(), _hsl = {};
function vary(hex, rng, dl = 0.08, dh = 0.015) {
  _c.set(hex).getHSL(_hsl);
  return _c.setHSL(_hsl.h + (rng() - 0.5) * dh, _hsl.s, Math.min(1, Math.max(0, _hsl.l + (rng() - 0.5) * dl))).getHex();
}

export function build(ctx) {
  const { kit, batch, lite } = ctx;
  const T = ctx.T;
  const atlasTex = paintAtlas();
  const atlas = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.62, metalness: 0 });
  atlas.name = 'kitchenShelves-atlas';
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.02, side: THREE.DoubleSide });
  const mul = (base, ...a) => base.clone().multiply(T(...a));
  const put = (g, mat, m, color = 0xffffff, o) => batch.add(g, mat, m, color, o);
  const small = { cast: false, receive: true };

  // ============================================================================================ 1. sill herbs
  const leafMat = ctx.sway(kit.leaf, { baseY: SILLTOP + 0.05, height: 0.2, amount: 1.15, indoor: true });
  const nz = lite ? 0.6 : 1;
  const potGeo = (p) => {
    const { rt, rb, h } = p, lip = 0.02;
    return lathe([[0, 0], [rb * 0.9, 0], [rb, 0.003], [rt * 0.94, h - lip], [rt * 0.94 + 0.001, h - lip - 0.001], [rt + 0.0015, h - lip + 0.002], [rt + 0.0015, h - 0.002], [rt, h],
      [rt - 0.005, h - 0.001], [rt - 0.0055, h - 0.014], [0.0, h - 0.016]].map(([r, y]) => [r, y]), 36);
  };
  const saucerGeo = (p) => lathe([[0, 0], [p.rb * 1.05, 0], [p.rt + 0.006, 0.0025], [p.rt + 0.0085, K.SAUCER_T], [p.rt + 0.006, K.SAUCER_T], [p.rb * 1.0, 0.0035], [0, 0.0035]], 32);
  const potTints = [0xc9693c, 0xbf6038, 0xcf7347, 0xb85a34];
  const soilY = (p) => SILLTOP + K.SAUCER_T + p.h - 0.016;
  HERBS.forEach((p, i) => {
    const m0 = T(p.x, SILLTOP, SILL_Z);
    put(saucerGeo(p), kit.terracotta, m0, vary(potTints[i], rngOf(i + 3), 0.06), { cast: true, receive: true });
    put(potGeo(p), kit.terracotta, T(p.x, SILLTOP + K.SAUCER_T, SILL_Z, i * 1.3), vary(potTints[i], rngOf(i + 9), 0.1), { cast: true, receive: true });
    // A little green algae low down on the clay.
    { const rr = (y) => p.rb + (p.rt * 0.94 - p.rb) * y / (p.h - 0.02) + 0.0016; put(new THREE.CylinderGeometry(rr(0.012), rr(0.003), 0.009, 36, 1, true), kit.terracotta, T(p.x, SILLTOP + K.SAUCER_T + 0.0075, SILL_Z), 0x8a7a4a, small); }
    put(new THREE.CylinderGeometry(p.rt - 0.006, p.rt - 0.006, 0.004, 28), kit.soil, T(p.x, soilY(p) + 0.002, SILL_Z), vary(0x35291e, rngOf(i + 40), 0.1), small);
  });
  const leaf = (g, x, y, z, yaw, elev, roll, color) => put(g, leafMat, T(x, y, z, yaw, -elev, roll), color, small);
  const stem = (pts, r0, r1, color, seg = 5, radial = 5) => put(taperTube(pts, r0, r1, seg, radial), leafMat, null, color, small);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Basil: a leafy stem with opposite pairs of broad cupped leaves, bigger ones low down, a tuft at the top.
  {
    const p = HERBS[0], rng = rngOf(101), y0 = soilY(p) + 0.004, cx = p.x, cz = SILL_Z;
    const H = 0.15;
    stem([V(cx, y0 - 0.004, cz), V(cx + 0.004, y0 + H * 0.5, cz - 0.003), V(cx + 0.002, y0 + H, cz + 0.002)], 0.0026, 0.0012, 0x6c9d4a);
    const big = leafGeo(0.056, 0.04, { nL: 6, nW: 3, cup: 0.5, droop: 0.35, tip: 0.72, wave: 0.0012, foldRib: 1 });
    for (let k = 0; k < 8; k++) {   // low leaves on their own petioles
      const a = k * 1.05 + rng() * 0.4, ex = Math.sin(a) * 0.012, ez = Math.cos(a) * 0.012;
      stem([V(cx, y0, cz), V(cx + ex, y0 + 0.014, cz + ez), V(cx + ex * 1.8, y0 + 0.022 + rng() * 0.012, cz + ez * 1.8)], 0.0014, 0.0009, 0x78a850, 3, 4);
      leaf(big, cx + ex * 1.8, y0 + 0.024 + rng() * 0.01, cz + ez * 1.8, a, 0.25 + rng() * 0.25, 0, vary(0x3f8a32, rng));
    }
    const nodes = 7;
    for (let n = 0; n < nodes; n++) {
      const h = 0.035 + n * 0.0185, s = 1 - n * 0.1;
      const sx = cx + 0.004 * (h / H), sz = cz - 0.003 * (h / H);
      for (let k = 0; k < 2; k++) {
        const a = n * 1.2 + k * Math.PI + rng() * 0.2;
        const pl = 0.012 * s, dx = Math.sin(a), dz = Math.cos(a);
        stem([V(sx, y0 + h, sz), V(sx + dx * pl, y0 + h + 0.007, sz + dz * pl)], 0.0011, 0.0008, 0x78a850, 1, 4);
        leaf(leafGeo(0.056 * s, 0.04 * s, { nL: 6, nW: 3, cup: 0.5, droop: 0.3, tip: 0.72, wave: 0.001, foldRib: 1 }), sx + dx * pl, y0 + h + 0.007, sz + dz * pl, a, 0.45 + 0.25 * (n / nodes), 0, vary(n < 3 ? 0x3f8a32 : 0x4f9a3a, rng));
      }
      if (n === 2 || n === 3) {   // side shoots
        const a = n * 2.3 + 0.7, dx = Math.sin(a), dz = Math.cos(a);
        stem([V(sx, y0 + h, sz), V(sx + dx * 0.02, y0 + h + 0.025, sz + dz * 0.02), V(sx + dx * 0.03, y0 + h + 0.045, sz + dz * 0.03)], 0.0011, 0.0007, 0x6c9d4a, 3, 4);
        for (let k = 0; k < 2; k++) leaf(leafGeo(0.026, 0.019, { nL: 4, nW: 2, cup: 0.5, droop: 0.2 }), sx + dx * 0.03, y0 + h + 0.045, sz + dz * 0.03, a + (k ? 0.9 : -0.9), 0.5, 0, vary(0x57a53f, rng));
      }
    }
    for (let k = 0; k < 4; k++) leaf(leafGeo(0.022, 0.015, { nL: 4, nW: 2, cup: 0.6, droop: 0.1 }), cx + 0.002, y0 + H - 0.004, cz + 0.002, k * 1.6 + 0.4, 1.0, 0, vary(0x65b24a, rng));
  }

  // Rosemary: woody upright stems clothed in narrow needles, a few pale blue flowers.
  {
    const p = HERBS[1], rng = rngOf(202), y0 = soilY(p) + 0.004, cx = p.x, cz = SILL_Z;
    const needleSets = [leafGeo(0.023, 0.0042, { nL: 2, nW: 1, cup: 0.0, droop: 0.12, tip: 0.55 }), leafGeo(0.019, 0.004, { nL: 2, nW: 1, cup: 0.0, droop: 0.1, tip: 0.55 }), leafGeo(0.027, 0.0045, { nL: 2, nW: 1, cup: 0, droop: 0.15, tip: 0.55 })];
    const nStems = Math.round(14 * nz);
    for (let s = 0; s < nStems; s++) {
      const a = s * 2.4 + rng() * 0.6, lean = 0.2 + rng() * 0.55, L = 0.13 + rng() * 0.075;
      const ox = Math.sin(a) * 0.012 * rng(), oz = Math.cos(a) * 0.012 * rng();
      const path = (t) => V(cx + ox + Math.sin(a) * lean * L * t * t, y0 + L * t, cz + oz + Math.cos(a) * lean * L * t * t);
      stem([path(0), path(0.3), path(0.65), path(1)], 0.0017, 0.0007, 0x77603f, 6, 4);
      stem([path(0.45), path(0.7), path(1)], 0.0011, 0.0007, 0x7f9a58, 4, 4);
      const steps = Math.round(12 * (0.7 + 0.3 * nz));
      for (let n = 0; n < steps; n++) {
        const t = 0.26 + 0.74 * n / (steps - 1), q = path(t);
        const sc = 0.65 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05));
        for (let k = 0; k < 4; k++) {
          const ang = a + n * 0.9 + k * 1.6 + rng() * 0.3;
          leaf(needleSets[(n + k) % 3], q.x, q.y, q.z, ang, 0.6 + rng() * 0.45 - t * 0.1, 0, vary(0x4d6a45, rng, 0.12));
        }
      }
      if (rng() < 0.4) {
        const q = path(0.88);
        for (let k = 0; k < 3; k++) put(new THREE.IcosahedronGeometry(0.0042, 0), leafMat, T(q.x + (rng() - 0.5) * 0.008, q.y + (rng() - 0.5) * 0.008, q.z + (rng() - 0.5) * 0.008, 0, 0, 0, 1, 1.2, 1), vary(0xa6bdea, rng, 0.1), small);
      }
    }
  }

  // Mint: upright, slightly purple stems with opposite pairs of wrinkled, toothed leaves.
  {
    const p = HERBS[2], rng = rngOf(303), y0 = soilY(p) + 0.004, cx = p.x, cz = SILL_Z;
    const nStems = Math.round(10 * (0.6 + 0.4 * nz));
    for (let s = 0; s < nStems; s++) {
      const a = s * 2.4 + rng() * 0.5, lean = 0.12 + rng() * 0.35, L = 0.1 + rng() * 0.09;
      const ox = Math.sin(a) * 0.02 * rng(), oz = Math.cos(a) * 0.02 * rng();
      const path = (t) => V(cx + ox + Math.sin(a) * lean * L * t * t, y0 + L * t, cz + oz + Math.cos(a) * lean * L * t * t);
      stem([path(0), path(0.5), path(1)], 0.0021, 0.0011, 0x6b5a45, 4, 4);
      const nodes = Math.round(3 + L * 28);
      for (let n = 0; n < nodes; n++) {
        const t = 0.2 + 0.8 * n / (nodes - 1), q = path(t), sc = 1.05 - 0.55 * t;
        for (let k = 0; k < 2; k++) {
          const ang = a + n * 1.57 + k * Math.PI + rng() * 0.2;
          const dx = Math.sin(ang), dz = Math.cos(ang), pl = 0.007 * sc;
          stem([q, V(q.x + dx * pl, q.y + 0.003, q.z + dz * pl)], 0.0009, 0.0007, 0x6c9a48, 1, 4);
          leaf(leafGeo(0.04 * sc, 0.027 * sc, { nL: 6, nW: 2, cup: 0.38, droop: 0.28, tip: 0.8, serr: 0.07, wave: 0.0009, foldRib: 1 }), q.x + dx * pl, q.y + 0.003, q.z + dz * pl, ang, 0.38 + 0.4 * t, 0, vary(0x3a8c3c, rng, 0.14));
        }
      }
      const q = path(1);
      for (let k = 0; k < 3; k++) leaf(leafGeo(0.015, 0.01, { nL: 3, nW: 1, cup: 0.5, droop: 0.05 }), q.x, q.y, q.z, k * 2.1 + a, 1.0, 0, vary(0x5ab04a, rng));
    }
  }

  // Thyme: a low tussock of wiry stems with tiny paired leaves and a few pink flowers.
  {
    const p = HERBS[3], rng = rngOf(404), y0 = soilY(p) + 0.004, cx = p.x, cz = SILL_Z;
    const tiny = leafGeo(0.0085, 0.0048, { nL: 2, nW: 1, cup: 0.2, droop: 0.05 });
    const nStems = Math.round(15 * nz);
    for (let s = 0; s < nStems; s++) {
      const a = s * 2.4 + rng(), L = 0.045 + rng() * 0.04, lean = 0.5 + rng() * 0.8;
      const path = (t) => V(cx + Math.sin(a) * lean * L * t, y0 + L * Math.sin(t * Math.PI * 0.55), cz + Math.cos(a) * lean * L * t);
      stem([path(0), path(0.5), path(1)], 0.0009, 0.0005, 0x6f6446, 4, 4);
      const nodes = Math.round(9 * (0.6 + 0.4 * nz));
      for (let n = 0; n < nodes; n++) {
        const t = 0.15 + 0.85 * n / (nodes - 1), q = path(t);
        for (let k = 0; k < 2; k++) leaf(tiny, q.x, q.y, q.z, a + n * 1.7 + k * Math.PI, 0.4 + rng() * 0.5, 0, vary(0x57794a, rng, 0.12));
      }
      if (rng() < 0.5) { const q = path(1); put(new THREE.IcosahedronGeometry(0.0034, 0), leafMat, T(q.x, q.y + 0.002, q.z), vary(0xd8a2c6, rng, 0.1), small); }
    }
  }

  // ============================================================================================ 3. dresser worktop
  {
    // Biscuit tin.
    const q = TIN, y0 = WORK, B = T(q.x, y0, q.z, q.yaw);
    const body = new RoundedBoxGeometry(q.hx * 2, q.h, q.hz * 2, 3, 0.004);
    put(whiteUV(body), atlas, mul(B, 0, q.h / 2, 0), 0x1d3a5e, { cast: true, receive: true });
    put(whiteUV(new RoundedBoxGeometry(q.hx * 2 - 0.004, 0.006, q.hz * 2 - 0.004, 2, 0.002)), atlas, mul(B, 0, q.h, 0), 0x9a8a5a);   // rim bead
    // Lid, set slightly askew, with the lithograph on top and a little bead round its edge.
    const L = mul(B, 0.012, q.h + q.lidH / 2 + 0.001, 0.004, 0.06);
    put(whiteUV(new RoundedBoxGeometry(q.hx * 2 + 0.006, q.lidH, q.hz * 2 + 0.006, 3, 0.005)), atlas, L, 0x7d1f1f, { cast: true, receive: true });
    const lid = new THREE.PlaneGeometry(q.hx * 2 - 0.004, q.hz * 2 - 0.004).rotateX(-Math.PI / 2).rotateY(Math.PI);
    region(lid, TIN_R);
    put(lid, atlas, mul(L, 0, q.lidH / 2 + 0.0006, 0), 0xffffff, small);
    // Embossed band on the body: two thin gold lines.
    for (const yy of [0.012, q.h - 0.012]) put(whiteUV(new THREE.BoxGeometry(q.hx * 2 + 0.0008, 0.002, q.hz * 2 + 0.0008)), atlas, mul(B, 0, yy, 0), 0xc9a447, small);
  }
  {
    // Two cake tins, stacked: cream enamel with a red lid, and a smaller green one.
    const specs = [
      { c: CAKE[0], body: 0xe8dcc0, lid: 0xa8362b, label: true },
      { c: CAKE[1], body: 0x2f5d50, lid: 0x24473d, label: false },
    ];
    for (const { c, body, lid, label } of specs) {
      const y0 = WORK + (c.y0 || 0), B = T(c.x, y0, c.z, label ? 0.3 : 0);
      put(whiteUV(lathe([[0, 0], [c.r - 0.006, 0], [c.r - 0.002, 0.002], [c.r, 0.006], [c.r, c.h - 0.004], [c.r + 0.0025, c.h - 0.002], [c.r + 0.0025, c.h + 0.001], [c.r, c.h + 0.001], [0, c.h + 0.001]], 48)), atlas, B, body, { cast: true, receive: true });
      put(new THREE.TorusGeometry(c.r, 0.0022, 6, 48).rotateX(Math.PI / 2), kit.enamel, mul(B, 0, c.h, 0), body, small);
      put(new THREE.TorusGeometry(c.r, 0.0022, 6, 48).rotateX(Math.PI / 2), kit.enamel, mul(B, 0, 0.004, 0), body, small);
      // Lid: shallow dome with a rolled rim and a little handle.
      put(whiteUV(lathe([[c.r - 0.003, c.h - 0.004], [c.r + 0.0035, c.h - 0.004], [c.r + 0.0035, c.h + c.lidH - 0.006], [c.r - 0.006, c.h + c.lidH - 0.003], [c.r * 0.35, c.h + c.lidH - 0.0005], [0, c.h + c.lidH]], 48)), atlas, B, lid, { cast: true, receive: true });
      put(new THREE.TorusGeometry(0.014, 0.0035, 6, 14, Math.PI).rotateZ(0), kit.steel, mul(B, 0, c.h + c.lidH + 0.0005, 0, 0, 0, 0, 1, 1), 0x9a9a98, small);
      if (label) {
        // Label stuck to the front of the tin (faces the room, -z).
        const lg = new THREE.CylinderGeometry(c.r + 0.0008, c.r + 0.0008, 0.034, 20, 1, true, Math.PI - 0.5, 1.0);
        region(lg, CAKE_R);
        put(lg, atlas, mul(B, 0, c.h * 0.5, 0), 0xffffff, small);
      }
    }
  }

  // ============================================================================================ 4. cookery books
  {
    const B0 = 0xeadfc6;
    const cloth = [0x7a2e2a, 0x2f4a3a, 0x26364f, 0xb59a5a, 0x6b3b2a, 0x8a3b4a, 0x3d5e63];
    BOOK_POSE.forEach((b, i) => {
      const M = T(b.x, b.y, BOOKZ.z, 0, 0, b.lean), d = BOOKZ.d, t = b.t, h = b.h, bt = 0.0022;
      const wh = (g) => whiteUV(g);
      for (const sx of [-1, 1]) put(wh(new THREE.BoxGeometry(bt, h, d)), atlas, mul(M, sx * (t / 2 - bt / 2), 0, 0), cloth[i], { cast: true, receive: true });
      put(wh(new THREE.BoxGeometry(t, h, bt)), atlas, mul(M, 0, 0, -(d / 2 - bt / 2)), cloth[i], { cast: true, receive: true });
      put(wh(new THREE.BoxGeometry(t - 2 * bt, h - 0.005, d - bt - 0.0028)), atlas, mul(M, 0, 0, (bt - 0.0028) / 2 - 0.0001), B0, small);
      const sp = new THREE.PlaneGeometry(t, h);
      // The plane faces +z; turn it round to face the room (-z), keeping the text upright.
      region(sp, spineRect(i));
      put(sp, atlas, mul(M, 0, 0, -d / 2 - 0.0004, Math.PI), 0xffffff, small);
    });
    // Iron bookends: an upright plate with a scrolled top and a base plate under the books.
    const iron = kit.iron;
    const bookend = (x, dir) => {
      put(new THREE.BoxGeometry(0.005, 0.12, 0.09), iron, T(x, TOPY + 0.06, BOOKZ.z), 0x3a3a40, { cast: true, receive: true });
      put(new THREE.BoxGeometry(0.1, 0.0016, 0.09), iron, T(x + dir * 0.0475, TOPY + 0.0008, BOOKZ.z), 0x1e1e22, small);
      put(new THREE.TorusGeometry(0.022, 0.0026, 6, 18).rotateY(Math.PI / 2), iron, T(x, TOPY + 0.065, BOOKZ.z), 0x34343a, small);
      put(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 8).rotateZ(Math.PI / 2), iron, T(x, TOPY + 0.123, BOOKZ.z), 0x34343a, small);
    };
    bookend(BOOKS_X0 - 0.0045, 1);
    bookend(BOOKS_END + 0.0245, -1);
  }

  // ============================================================================================ 5. mantel clock
  const C = CLOCK;
  const clockY0 = TOPY + C.base, dialY = clockY0 + C.lower, zf = C.z - C.d / 2;
  const DR = 0.066, dialCY = dialY + 0.012, wyc = clockY0 + 0.046;
  {
    const wood = kit.wood, mah = 0x5a2e1b, mah2 = 0x6e3a22;
    put(boxRound(C.w + 0.012, C.base, C.d + 0.012, 0.002), wood, T(C.x, TOPY + C.base / 2, C.z), mah, { cast: true, receive: true });
    put(boxRound(C.w, C.lower, C.d, 0.003), wood, T(C.x, clockY0 + C.lower / 2, C.z), mah2, { cast: true, receive: true });
    // Arched head: half-cylinder along z, with a stepped moulding round the front of the arch and the case.
    put(new THREE.CylinderGeometry(C.w / 2, C.w / 2, C.d, 40, 1, false, -Math.PI / 2, Math.PI), wood, T(C.x, dialY - 0.004, C.z, 0, -Math.PI / 2), mah2, { cast: true, receive: true });
    put(new THREE.CylinderGeometry(C.w / 2 + 0.004, C.w / 2 + 0.004, 0.005, 40, 1, false, -Math.PI / 2, Math.PI), wood, T(C.x, dialY - 0.003, zf + 0.0005, 0, -Math.PI / 2), mah, small);
    put(new THREE.SphereGeometry(0.0075, 12, 10), kit.brass, T(C.x, dialY + C.w / 2 + 0.01, C.z), 0xc9a24a, small);
    put(new THREE.CylinderGeometry(0.003, 0.005, 0.008, 10), kit.brass, T(C.x, dialY + C.w / 2 + 0.003, C.z), 0xc9a24a, small);
    for (const sx of [-1, 1]) {
      for (const dz of [-1, 1]) put(new THREE.SphereGeometry(0.01, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), kit.brass, T(C.x + sx * (C.w / 2 - 0.004), TOPY + 0.002, C.z + dz * (C.d / 2 - 0.012), 0, Math.PI, 0, 1, 0.8, 1), 0xb8923f, small);
      put(new THREE.CylinderGeometry(0.0045, 0.0045, 0.1, 10), kit.brass, T(C.x + sx * (C.w / 2 - 0.0075), clockY0 + 0.075, zf - 0.003, 0, 0, 0), 0xc9a24a, small);   // reeded columns
    }
    // Dial: face and brass bezel (no glass: a milky pane would wash the dial out).
    const face = new THREE.CircleGeometry(DR, 48); region(face, CLOCK_R);
    put(face, atlas, T(C.x, dialCY, zf - 0.003, Math.PI), 0xffffff, small);
    put(new THREE.TorusGeometry(DR + 0.003, 0.0038, 8, 56), kit.brass, T(C.x, dialCY, zf - 0.0045), 0xd0a84e, small);
    // Lower case: a dark pendulum window in a brass frame, on a lighter inlaid panel.
    const ww = 0.09, wh = 0.06;
    put(whiteUV(new THREE.BoxGeometry(0.15, 0.092, 0.0025)), atlas, T(C.x, wyc, zf + 0.0001), 0x82492c, small);
    put(whiteUV(new THREE.PlaneGeometry(ww, wh)), atlas, T(C.x, wyc, zf - 0.0013, Math.PI), 0x15100a, small);
    for (const [bw, bh, bx, by] of [[ww + 0.008, 0.004, 0, wh / 2 + 0.002], [ww + 0.008, 0.004, 0, -wh / 2 - 0.002], [0.004, wh, -ww / 2 - 0.002, 0], [0.004, wh, ww / 2 + 0.002, 0]])
      put(new THREE.BoxGeometry(bw, bh, 0.005), kit.brass, T(C.x + bx, wyc + by, zf - 0.0028), 0xc9a24a, small);
  }
  // Clock hands + pendulum: one mesh, vertices rewritten each tick.
  const clock = (() => {
    const hands = [
      // [triangles in (lateral, along) pairs, colour, z layer]
      { z: 0.0030, col: 0x14110c, tri: [[-0.0026, -0.012, 0.0026, -0.012, 0.002, 0.026], [-0.0026, -0.012, 0.002, 0.026, -0.002, 0.026], [0, 0.022, 0.0082, 0.036, 0, 0.05], [0, 0.022, 0, 0.05, -0.0082, 0.036], [0, 0.05, 0.0014, 0.05, 0, 0.056]] },
      { z: 0.0045, col: 0x14110c, tri: [[-0.002, -0.014, 0.002, -0.014, 0.0016, 0.062], [-0.002, -0.014, 0.0016, 0.062, -0.0016, 0.062], [0, 0.046, 0.005, 0.056, 0, 0.066], [0, 0.046, 0, 0.066, -0.005, 0.056], [0, 0.066, 0.0012, 0.066, 0, 0.0715]] },
      { z: 0.0060, col: 0x7a1c14, tri: [[-0.0009, -0.02, 0.0009, -0.02, 0.0006, 0.068], [-0.0009, -0.02, 0.0006, 0.068, -0.0006, 0.068], [-0.003, -0.016, 0, -0.008, 0.003, -0.016], [-0.003, -0.016, -0.003, -0.01, 0, -0.008]] },
    ];
    const pend = { rod: [-0.0009, 0, 0.0009, 0, 0.0009, -0.04, -0.0009, 0, 0.0009, -0.04, -0.0009, -0.04], bob: 14 };
    let n = 0;
    for (const hd of hands) n += hd.tri.length * 3;
    n += 6 + pend.bob * 3;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) nor[i * 3 + 2] = -1;
    const cc = new THREE.Color();
    let o = 0;
    for (const hd of hands) { cc.set(hd.col); for (let i = 0; i < hd.tri.length * 3; i++, o++) { col[o * 3] = cc.r; col[o * 3 + 1] = cc.g; col[o * 3 + 2] = cc.b; } }
    cc.set(0xc9a24a);
    for (let i = 0; i < 6 + pend.bob * 3; i++, o++) { col[o * 3] = cc.r; col[o * 3 + 1] = cc.g; col[o * 3 + 2] = cc.b; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(C.x, dialY, zf), 0.2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    ctx.scene.add(mesh);
    const px = C.x, ptop = wyc + 0.027, zp = zf - 0.0021, hs = DR / 0.0765;
    const write = (secs, swing) => {
      let w = 0;
      const hr = secs / 43200, mn = (secs % 3600) / 3600, sc = Math.floor(secs % 60);
      const angs = [hr * Math.PI * 2, mn * Math.PI * 2, sc / 60 * Math.PI * 2];
      hands.forEach((hd, k) => {
        const th = angs[k], s = Math.sin(th), c = Math.cos(th);
        for (const tri of hd.tri) for (let v = 0; v < 3; v++) {
          const lx = tri[v * 2], ly = tri[v * 2 + 1];
          // along = (-s, c), lateral = (-c, -s) on the wall plane seen from the room.
          pos[w++] = px + (-s * ly + -c * lx) * hs; pos[w++] = dialCY + (c * ly + -s * lx) * hs; pos[w++] = zf - 0.0042 - hd.z * 0.5;
        }
      });
      // Pendulum rod and bob, swinging about its pivot at the top of the window.
      const th = swing, s = Math.sin(th), c = Math.cos(th);
      const put2 = (lx, ly) => { pos[w++] = px + lx * c - ly * s; pos[w++] = ptop + ly * c + lx * s; pos[w++] = zp; };
      for (let i = 0; i < 6; i++) put2(pend.rod[i * 2], pend.rod[i * 2 + 1]);
      for (let i = 0; i < pend.bob; i++) {
        const a0 = i / pend.bob * Math.PI * 2, a1 = (i + 1) / pend.bob * Math.PI * 2;
        put2(0, -0.04); put2(Math.cos(a0) * 0.011, -0.04 + Math.sin(a0) * 0.011); put2(Math.cos(a1) * 0.011, -0.04 + Math.sin(a1) * 0.011);
      }
      geo.attributes.position.needsUpdate = true;
    };
    return { mesh, write, lastSec: -1 };
  })();
  const tzOff = new Date().getTimezoneOffset() * 60;

  // ============================================================================================ 6. preserving jars
  {
    const wood = kit.wood, paint = kit.paint;
    const zc = ROOM.maxZ - SHELF.depth / 2;
    // Boards, front lips and brackets.
    SHELF.ys.forEach((y, si) => {
      const len = SHELF.x1 - SHELF.x0, cx = (SHELF.x0 + SHELF.x1) / 2;
      put(new THREE.BoxGeometry(len, SHELF.t, SHELF.depth), wood, T(cx, y, zc), si ? 0xe0c398 : 0xd9b88a, { cast: true, receive: true });
      put(new THREE.BoxGeometry(len, 0.012, 0.007), wood, T(cx, y + SHELF.t / 2 + 0.006, ROOM.maxZ - SHELF.depth + 0.0035), si ? 0xc9aa7c : 0xc4a275, small);   // plate lip
      put(new THREE.BoxGeometry(len + 0.01, 0.008, 0.004), wood, T(cx, y - 0.002, ROOM.maxZ - SHELF.depth - 0.0005), 0xcdb084, small);
      for (const bx of [SHELF.x0 + 0.07, SHELF.x1 - 0.07]) {
        const by = y - SHELF.t / 2;
        put(new THREE.BoxGeometry(0.016, 0.11, 0.012), paint, T(bx, by - 0.055, ROOM.maxZ - 0.006), 0xe9e0c8, small);
        put(new THREE.BoxGeometry(0.016, 0.012, SHELF.depth - 0.02), paint, T(bx, by - 0.006, ROOM.maxZ - 0.01 - (SHELF.depth - 0.02) / 2), 0xe9e0c8, small);
        const dl = Math.hypot(0.1, SHELF.depth - 0.03);
        put(new THREE.BoxGeometry(0.012, 0.008, dl), paint, T(bx, by - 0.055, ROOM.maxZ - 0.01 - (SHELF.depth - 0.03) / 2, 0, Math.atan2(0.1, SHELF.depth - 0.03) * 0.96), 0xe9e0c8, small);
      }
    });
    // Jars.
    const glass = kit.glass, jamMat = kit.ceramic;
    JARS.forEach((j, i) => {
      const rng = rngOf(500 + i);
      const y0 = SHELF.ys[j.s] + SHELF.t / 2, jz = zc + 0.005 + (rng() - 0.5) * 0.01;
      const B = T(j.x, y0, jz, (rng() - 0.5) * 0.6);
      const r = j.r, h = j.h;
      if (j.kind === 'jam') {
        put(lathe([[0, 0], [r * 0.86, 0], [r * 0.97, 0.004], [r, 0.012], [r, h * 0.7], [r * 0.96, h * 0.8], [r * 0.84, h * 0.87], [r * 0.8, h * 0.89], [r * 0.8, h - 0.002], [r * 0.83, h], [0, h]], 28), glass, B, 0x93ab9f, { cast: false, receive: false });
        put(lathe([[0, 0.003], [r * 0.93, 0.003], [r * 0.93, h * 0.68], [r * 0.9, h * 0.78], [0, h * 0.78]], 24), jamMat, B, j.fill, small);
        // Label on the front (faces the room).
        const lg = new THREE.CylinderGeometry(r + 0.0007, r + 0.0007, 0.036, 18, 1, true, Math.PI - 0.62, 1.24);
        region(lg, LABEL_R(j.label));
        put(lg, atlas, mul(B, 0, h * 0.4, 0), 0xffffff, small);
        // Gingham cover tied with string, skirt fluted at the edge.
        const R = r * 1.2, sk = [[0, h + 0.005], [r * 0.7, h + 0.0045], [r * 0.9, h + 0.002], [r * 1.0, h - 0.006], [r * 1.12, h - 0.017], [r * 1.18, h - 0.026]];
        const cg = lathe(sk, 32), cp = cg.attributes.position, cuv = cg.attributes.uv;
        for (let k = 0; k < cp.count; k++) {
          const x = cp.getX(k), z = cp.getZ(k), y = cp.getY(k), rr = Math.hypot(x, z);
          const th = Math.atan2(z, x), f = Math.max(0, (rr - r * 0.95) / (r * 0.25));
          cp.setY(k, y + Math.sin(th * 9) * 0.0035 * f);
          cp.setXYZ(k, x * (1 + Math.sin(th * 9) * 0.04 * f), cp.getY(k), z * (1 + Math.sin(th * 9) * 0.04 * f));
          cuv.setXY(k, 0.5 + x / (2 * R), 0.5 + z / (2 * R));
        }
        cg.computeVertexNormals();
        region(cg, GING_R[j.lid]);
        put(cg, atlas, B, 0xffffff, small);
        put(new THREE.TorusGeometry(r * 0.83, 0.0013, 5, 24).rotateX(Math.PI / 2), kit.paper, mul(B, 0, h - 0.0045, 0), 0xa8844e, small);
      } else if (j.kind === 'kilner') {
        put(lathe([[0, 0], [r * 0.9, 0], [r, 0.008], [r, h * 0.86], [r * 0.985, h * 0.9], [r * 1.0, h * 0.91], [r, h - 0.002], [r * 0.97, h], [0, h]], 32), glass, B, 0x93ab9f, { cast: false, receive: false });
        put(lathe([[0, 0.004], [r * 0.93, 0.004], [r * 0.94, h * 0.7], [r * 0.9, h * 0.76], [0, h * 0.76]], 28), jamMat, B, j.fill, small);
        put(new THREE.TorusGeometry(r * 0.99, 0.0022, 6, 36).rotateX(Math.PI / 2), kit.rubber, mul(B, 0, h + 0.0005, 0), 0xc8602a, small);
        put(new THREE.SphereGeometry(r * 0.98, 28, 8, 0, Math.PI * 2, 0, 0.45), glass, mul(B, 0, h - r * 0.98 * Math.cos(0.45) + 0.003, 0), 0x9fb8ac, { cast: false, receive: false });
        put(new THREE.SphereGeometry(0.0045, 8, 6), kit.glass, mul(B, 0, h + 0.008, 0), 0x9fb8ac, small);
        // Wire clamp over the lid, down the front to a bail.
        put(taperTube([V(0, h + 0.008, -0.006), V(0, h + 0.014, -r * 0.55), V(0, h * 0.9 + 0.006, -r * 1.02), V(0, h * 0.68, -r * 1.012)], 0.0012, 0.0012, 8, 4).applyMatrix4(B), kit.steel, null, 0xb8b8b6, small);
        put(new THREE.TorusGeometry(0.007, 0.0012, 5, 12).rotateX(Math.PI / 2), kit.steel, mul(B, 0, h * 0.67, -r * 1.012 + 0.0, 0, 0, 0), 0xb8b8b6, small);
      } else if (j.kind === 'bottle') {
        put(lathe([[0, 0], [r * 0.9, 0], [r, 0.005], [r, h * 0.55], [r * 0.92, h * 0.64], [r * 0.5, h * 0.78], [r * 0.4, h * 0.88], [r * 0.43, h * 0.95], [r * 0.5, h], [0, h]], 28), glass, B, 0x8aa396, { cast: false, receive: false });
        put(lathe([[0, 0.003], [r * 0.93, 0.003], [r * 0.93, h * 0.5], [r * 0.82, h * 0.6], [0, h * 0.6]], 24), jamMat, B, j.fill, small);
        put(new THREE.CylinderGeometry(r * 0.38, r * 0.3, 0.02, 12), kit.wood, mul(B, 0, h + 0.006, 0), 0xc9a46a, small);
        const lg = new THREE.CylinderGeometry(r + 0.0007, r + 0.0007, 0.04, 18, 1, true, Math.PI - 0.8, 1.6);
        region(lg, LABEL_R(j.label));
        put(lg, atlas, mul(B, 0, h * 0.3, 0), 0xffffff, small);
        put(new THREE.CylinderGeometry(r * 0.48, r * 0.48, 0.012, 14, 1, true), kit.paper, mul(B, 0, h * 0.89, 0), 0x9a1f1f, small);   // red wax seal
      } else {
        put(lathe([[0, 0], [r * 0.85, 0], [r, 0.006], [r * 1.02, h * 0.5], [r, h * 0.88], [r * 0.93, h], [r * 0.82, h], [r * 0.84, h * 0.9], [0, h * 0.9]], 32), kit.ceramic, B, 0xc9b48a, { cast: true, receive: true });
        put(new THREE.TorusGeometry(r * 1.0, 0.0035, 6, 32).rotateX(Math.PI / 2), kit.ceramic, mul(B, 0, h * 0.62, 0), 0x6b4a2a, small);
        put(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.007, 28), kit.wood, mul(B, 0, h + 0.0035, 0), 0xc4a374, small);
        put(new THREE.CylinderGeometry(0.006, 0.008, 0.012, 10), kit.wood, mul(B, 0, h + 0.012, 0), 0x9a7a4a, small);
      }
    });
    // Cup hook for the lavender.
    put(new THREE.CylinderGeometry(0.0022, 0.0022, 0.012, 8), kit.brass, T(LAV.x, SHELF.ys[0] - SHELF.t / 2 - 0.005, LAV.z), 0xc9a24a, small);
    put(new THREE.TorusGeometry(0.0055, 0.0014, 6, 14, Math.PI * 1.35).rotateZ(Math.PI * 0.82), kit.brass, T(LAV.x, SHELF.ys[0] - SHELF.t / 2 - 0.0115, LAV.z, Math.PI / 2), 0xc9a24a, small);
  }

  // ============================================================================================ 7. lavender
  const lav = (() => {
    const cg = new ColGeo(), rng = rngOf(77);
    const top = 0.0, tie = -0.03, L = K.LAV.len;
    // String loop up to the hook.
    cg.add(rod(V(0, 0, 0), V(0.0, tie, 0), 0.0008, 4), null, 0xa8844e);
    const nS = lite ? 20 : 32;
    for (let s = 0; s < nS; s++) {
      const a = rng() * Math.PI * 2, spread = 0.006 + rng() * 0.022, len = L * (0.85 + rng() * 0.15);
      const bot = V(Math.sin(a) * spread, tie - len, Math.cos(a) * spread), mid = V(Math.sin(a) * spread * 0.4 + (rng() - 0.5) * 0.004, tie - len * 0.5, Math.cos(a) * spread * 0.4 + (rng() - 0.5) * 0.004);
      cg.add(taperTube([V(0, tie - 0.004, 0), mid, bot], 0.0011, 0.0006, 4, 4), null, vary(0x8f9468, rng, 0.12));
      // Flower spike: stacked whorls of little buds, narrowing to the tip, dried to a dusty violet-grey.
      const spikeL = 0.04 + rng() * 0.012, nW = 7;
      for (let k = 0; k < nW; k++) {
        const f = k / (nW - 1), y = bot.y + spikeL * f, rr = 0.0036 * (1 - f * 0.55) + 0.0006;
        const b = 0.5 + 0.5 * (1 - f);
        cg.add(new THREE.IcosahedronGeometry(1, 0), T(bot.x, y, bot.z, rng() * 6, 0, 0, rr * 1.5, rr * 1.15, rr * 1.5), vary(f < 0.15 ? 0x7a6a98 : (rng() < 0.3 ? 0x8c7aa8 : 0x6c5c8c), rng, 0.1));
        void b;
      }
      // Two long narrow leaves low on the stem (silvery, dried).
      for (let k = 0; k < 2; k++) cg.add(leafGeo(0.03, 0.0028, { nL: 2, nW: 1, cup: 0, droop: 0.1, tip: 0.6 }), T(mid.x, mid.y + 0.01, mid.z, a + k * Math.PI, 2.2 + rng() * 0.3), vary(0x8e9a7a, rng, 0.1));
    }
    // Raffia ties.
    cg.add(new THREE.TorusGeometry(0.012, 0.0016, 5, 16).rotateX(Math.PI / 2), T(0, tie - 0.004, 0), 0xb8924e);
    cg.add(new THREE.TorusGeometry(0.0125, 0.0014, 5, 16).rotateX(Math.PI / 2), T(0, tie - 0.011, 0), 0xc4a05c);
    const m = new THREE.Mesh(cg.build(), plain);
    m.castShadow = true; m.receiveShadow = false;
    m.position.set(LAV.x, LAV.y, LAV.z);
    m.matrixAutoUpdate = true;
    ctx.scene.add(m);
    return { m, ax: 0, az: 0, vx: 0, vz: 0, active: false, c: new THREE.Vector3(), a: new THREE.Vector3() };
  })();

  // ============================================================================================ 2. the loose jug of sweet peas
  const sim = ctx.sim, mod = sim && sim.extras && sim.extras.mods.kitchenShelves;
  const jug = (() => {
    const cg = new ColGeo(), rng = rngOf(909);
    const h = JUG.h, oy = -h / 2;
    const cream = 0xece3cc, blue = 0x2e4b8c;
    // Body: a thick enamel shell.
    cg.add(lathe([[0, 0], [0.034, 0], [0.039, 0.003], [0.0425, 0.02], [0.0435, 0.05], [0.0445, 0.084], [0.0462, 0.103], [0.0475, 0.108], [0.0472, 0.1105], [0.0445, 0.1105], [0.0432, 0.106], [0.042, 0.09], [0.041, 0.012], [0, 0.012]], 32), T(0, oy, 0), cream);
    cg.add(new THREE.TorusGeometry(0.0468, 0.0034, 8, 36).rotateX(Math.PI / 2), T(0, oy + 0.1085, 0), blue);
    cg.add(new THREE.TorusGeometry(0.0388, 0.0026, 8, 36).rotateX(Math.PI / 2), T(0, oy + 0.0035, 0), blue);
    // Handle: a strap in blue enamel.
    cg.add(new THREE.TorusGeometry(0.027, 0.0046, 8, 20, Math.PI * 1.25), T(0.057, oy + 0.066, 0, 0, 0, -Math.PI * 0.625), blue);
    // A few chips in the enamel, showing dark.
    cg.add(new THREE.IcosahedronGeometry(0.0022, 0), T(-0.0395, oy + 0.04, 0.019, 0, 0, 0, 1, 1, 0.5), 0x2a2622);
    cg.add(new THREE.IcosahedronGeometry(0.0016, 0), T(0.0205, oy + 0.095, -0.0405, 0, 0, 0, 1, 1, 0.5), 0x2a2622);
    // Sweet peas.
    const pal = [0xd7679a, 0xe9bdd2, 0x8a5ac0, 0xf4eef0, 0xc0345a, 0x7787d6, 0xf0a08a, 0xb98adb];
    const banner = fanPetal(0.0175, 3.0, -0.45, { nR: 4, nA: 10, ruffle: 0.1, seed: 1 });
    const wing = fanPetal(0.012, 2.2, 0.55, { nR: 3, nA: 7, ruffle: 0.08, seed: 2 });
    const keel = fanPetal(0.008, 1.4, 0.9, { nR: 2, nA: 4, ruffle: 0, seed: 3 });
    const leafG = leafGeo(0.022, 0.011, { nL: 3, nW: 1, cup: 0.2, droop: 0.1 });
    const stems = lite ? 9 : 13;
    for (let s = 0; s < stems; s++) {
      const a = s * 2.4 + rng() * 0.5, spread = 0.02 + rng() * 0.07, hh = 0.14 + rng() * 0.12;
      const base = V(Math.sin(a) * 0.012, oy + h - 0.015, Math.cos(a) * 0.012);
      const q1 = V(Math.sin(a) * spread * 0.2, base.y + hh * 0.45, Math.cos(a) * spread * 0.2), top = V(Math.sin(a) * spread, base.y + hh, Math.cos(a) * spread);
      const path = new THREE.CatmullRomCurve3([base, q1, top], false, 'centripetal');
      cg.add(taperTube([base, q1, top], 0.0011, 0.0007, 6, 4), null, vary(0x7aa352, rng));
      // A pair of small leaves and a tendril lower on the stem.
      const lp = path.getPoint(0.55);
      for (let k = 0; k < 2; k++) cg.add(leafG, T(lp.x, lp.y, lp.z, a + (k ? 1.5 : -1.5), -0.5), vary(0x6a9a48, rng));
      if (s % 3 === 0) {
        const tp = path.getPoint(0.72), pts = [];
        for (let k = 0; k <= 8; k++) { const ang = k * 1.1, rr = 0.004 * (1 - k / 10); pts.push(V(tp.x + Math.cos(ang) * rr + Math.sin(a) * k * 0.002, tp.y + k * 0.0016 + Math.sin(ang) * rr, tp.z + Math.cos(a) * k * 0.002)); }
        cg.add(taperTube(pts, 0.0005, 0.0003, 14, 3), null, 0x7fa65a);
      }
      // Raceme: 3 flowers on short pedicels near the top, facing outward.
      const col = pal[(s * 3 + (rng() * 3 | 0)) % pal.length];
      for (let k = 0; k < 3; k++) {
        const t = 0.78 + k * 0.1, p = path.getPoint(Math.min(1, t));
        const out = a + (k - 1) * 0.5 + (rng() - 0.5) * 0.4, ped = 0.01;
        const fx = p.x + Math.sin(out) * ped, fy = p.y + 0.002 + k * 0.001, fz = p.z + Math.cos(out) * ped;
        cg.add(rod(p, V(fx, fy, fz), 0.0005, 3), null, 0x7fa65a);
        const sc = 0.85 + rng() * 0.3;
        const c1 = vary(col, rng, 0.1);
        const M = T(fx, fy, fz, out, -0.15, (rng() - 0.5) * 0.4, sc, sc, sc);
        cg.add(banner, mul(M, 0, 0.001, 0.001, 0, -0.35), c1);
        for (const sx of [-1, 1]) cg.add(wing, mul(M, sx * 0.005, 0.0005, 0.006, sx * 0.5, 0.25, sx * -0.35), vary(col, rng, 0.14));
        cg.add(keel, mul(M, 0, 0.0, 0.009, 0, 0.3), vary(col, rng, 0.2));
        cg.add(new THREE.IcosahedronGeometry(0.0022, 0), T(fx, fy - 0.0015, fz, 0, 0, 0, 1, 1.2, 1), 0x7aa352);   // calyx
      }
      if (k_buds(rng)) {
        const p = path.getPoint(1);
        cg.add(new THREE.IcosahedronGeometry(0.0034, 0), T(p.x, p.y + 0.004, p.z, 0, 0, 0, 0.8, 1.3, 0.8), vary(0xb3d0c4, rng));
      }
    }
    const mesh = new THREE.Mesh(cg.build(), plain);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(K.JUG.x, SILLTOP + h / 2 + 0.0004, K.JUG.z);
    mesh.frustumCulled = false;
    ctx.scene.add(mesh);
    return mesh;
  })();
  function k_buds(rng) { return rng() < 0.7; }

  // Jug follows its body (and the flight replay's proxy).
  const jg = mod && mod.jug;
  if (mod) mod.lav = lav;
  let clockT = 0, posedAt = -1;
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  const lastP = new THREE.Vector3(1e9, 0, 0), lastQ = new THREE.Quaternion();
  ctx.replayProxy(JUG.id, (o) => { posedAt = clockT; jug.position.copy(o.position); jug.quaternion.copy(o.quaternion); });

  registerExtraSound('enamelJug', (audio, e, now) => {
    if (now - (audio._enamelT || 0) < 0.07) return;
    audio._enamelT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos), f = 1250 + Math.random() * 200;
    audio.tone({ freq: f, to: f * 0.97, type: 'sine', gain: 0.03 + 0.07 * s, attack: 0.001, decay: 0.16, out: o });
    audio.tone({ freq: f * 2.3, type: 'sine', gain: 0.012 + 0.03 * s, attack: 0.001, decay: 0.08, out: o });
    audio.noiseBurst({ freq: 2800, q: 1.2, gain: 0.02 + 0.05 * s, decay: 0.03, out: o });
  });

  // ============================================================================================ per frame
  const air = new THREE.Vector3();
  const nearWake = (p, r) => {
    const A = sim && sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < r && Math.abs(p.z - wk.hub.z) < r) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < r && Math.abs(p.z - wk.hit.z) < r) return true;
    }
    return false;
  };
  const W0 = 9.0, ZETA = 0.1, LAV_GAIN = 40;   // lavender pendulum: natural rate (rad/s), damping ratio, wash gain
  const LAVC = new THREE.Vector3(LAV.x, LAV.y - 0.12, LAV.z);

  return {
    lav,
    update(dt, _sim, camera) {
      dt = Math.min(dt, 0.05);
      clockT += dt;
      // Jug.
      if (jg && clockT - posedAt > 0.25) {
        jg.track.sample(1, _p, _q);
        if (_p.distanceToSquared(lastP) > 1e-12 || Math.abs(_q.dot(lastQ)) < 0.9999999) { jug.position.copy(_p); jug.quaternion.copy(_q); lastP.copy(_p); lastQ.copy(_q); }
      }
      // Clock: hands tick once a second; the pendulum swings (a half-period of 0.5 s) while the camera is close.
      const now = Date.now() / 1000;
      const secs = (now - tzOff) % 43200;
      const near = camera && camera.position.distanceToSquared(_p.set(C.x, dialCY, C.z)) < 9;
      const sec = Math.floor(secs);
      if (sec !== clock.lastSec || near) {
        clock.lastSec = sec;
        clock.write(near ? secs : sec, 0.16 * Math.sin(now * Math.PI * 2 * 1.0) * 0.5);
      }
      // Lavender: a damped pendulum pushed by the air (rotor wash and its outwash), only near a rotor.
      const L = lav;
      const windy = nearWake(LAVC, 1.0);
      let ax = 0, az = 0;
      if (windy && sim.props) {
        sim.props.airAt(LAVC, air);
        K.entrain(sim, LAVC, air, clockT);
        const rx = air.x - L.vx * 0.12, rz = air.z - L.vz * 0.12, sp = Math.hypot(rx, rz);
        const k = Math.min(sp, 4) * LAV_GAIN;      // |rel| * rel, capped
        ax = rx * k; az = rz * k;
        L.active = true;
      }
      if (L.active) {
        // Integrate (semi-implicit), a few substeps for stability.
        const n = 2, h = dt / n;
        for (let i = 0; i < n; i++) {
          L.vx += (-W0 * W0 * L.ax - 2 * ZETA * W0 * L.vx + ax) * h;
          L.vz += (-W0 * W0 * L.az - 2 * ZETA * W0 * L.vz + az) * h;
          L.ax += L.vx * h; L.az += L.vz * h;
          const lim = 1.1;
          if (L.ax > lim) { L.ax = lim; L.vx *= -0.3; } else if (L.ax < -lim) { L.ax = -lim; L.vx *= -0.3; }
          if (L.az > 0.16) { L.az = 0.16; L.vz *= -0.25; } else if (L.az < -lim) { L.az = -lim; L.vz *= -0.3; }
        }
        L.m.rotation.set(-L.az, 0, L.ax);
        if (!windy && Math.abs(L.ax) + Math.abs(L.az) + Math.abs(L.vx) * 0.05 + Math.abs(L.vz) * 0.05 < 0.0015) { L.active = false; L.ax = L.az = L.vx = L.vz = 0; L.m.rotation.set(0, 0, 0); }
      }
    },
  };
}

// A rounded box (bevelled edges), UVs irrelevant (the wood kit material wraps by its own UVs).
function boxRound(w, h, d, r) {
  const g = new RoundedBoxGeometry(w, h, d, 2, r);
  return g;
}
void mergeGeometries;
