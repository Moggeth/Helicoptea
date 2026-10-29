import * as THREE from 'three';
import { buildTree, buildHedge, windowAt, mulberry } from '../kit.js';
import { FY, FRONT_DOORS, FRONT_LINE } from '../../../sim/world/plan.js';
import { roofSlabs, gables, chimneys } from '../../../sim/world/shapes.js';
import * as S from '../../../sim/world/street.js';
import { placeChair } from '../../chairs.js';

// Draws the 'street' area (AREAS.street in src/sim/world/plan.js; colliders and numbers in
// src/sim/world/street.js): the five front gardens, the street with its pavements, cars, lamps and telegraph
// wires, and across the road the parade of shops with the tea room (open front door, a way out the back).
//
// Everything is static and merged by the world (ctx.add). Own materials, all the standard program with a map
// and vertex tint like the kit's: paving (a tiling flag texture), the sign atlas (512 px, one canvas holding
// every fascia, blade sign and board) and a warm emissive 'glow' for shop windows and lanterns.
const { PV, BLD, TEAROOM: TR } = S;
const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function speckle(g, w, h, n, seed, a = 0.08, dark = true) {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = dark ? `rgba(20,16,10,${a * r()})` : `rgba(255,250,235,${a * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// Paving: four 0.6 m flags to a 1.2 m tile, each a little different, with mortar joints and wear.
function pavingTexture() {
  const [c, g] = canvas(256, 256), r = mulberry(31);
  g.fillStyle = '#4a463f'; g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const v = 168 + r() * 22;
    g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
    for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,84,70' : '230,226,212'},${0.05 + r() * 0.1})`; g.fillRect(i * 128 + r() * 120, j * 128 + r() * 120, 2 + r() * 14, 1 + r() * 8); }
    if (r() < 0.5) { g.fillStyle = 'rgba(60,70,40,0.12)'; g.beginPath(); g.ellipse(i * 128 + r() * 100 + 14, j * 128 + r() * 100 + 14, 10 + r() * 14, 6 + r() * 8, r() * 3, 0, PI * 2); g.fill(); }
  }
  speckle(g, 256, 256, 500, 5, 0.25);
  const t = tex(c); t.repeat.set(1 / 1.2, 1 / 1.2);
  return t;
}
// Black and cream tiles for the tea room floor (0.3 m squares, a 0.6 m texture).
function checkerTexture() {
  const [c, g] = canvas(128, 128), r = mulberry(8);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const dark = (i + j) & 1;
    g.fillStyle = dark ? '#2a2826' : '#e2d9c3'; g.fillRect(i * 64, j * 64, 64, 64);
    for (let k = 0; k < 24; k++) { g.fillStyle = dark ? `rgba(255,255,255,${0.03 * r()})` : `rgba(80,60,30,${0.08 * r()})`; g.fillRect(i * 64 + r() * 60, j * 64 + r() * 60, 3 + r() * 12, 1 + r() * 2); }
    g.strokeStyle = 'rgba(40,30,20,0.55)'; g.lineWidth = 1.5; g.strokeRect(i * 64 + 0.5, j * 64 + 0.5, 63, 63);
  }
  const t = tex(c); t.repeat.set(1 / 0.6, 1 / 0.6);
  return t;
}
// The sign atlas: every fascia board, blade sign and plate on one 512 x 512 canvas.
const CELLS = {
  tearoom: [0, 0, 512, 64], post: [0, 64, 512, 64], green: [0, 128, 512, 64], hardware: [0, 192, 512, 64], chemist: [0, 256, 512, 64],
  tolet: [0, 320, 384, 64], telephone: [384, 320, 128, 32], busstop: [384, 352, 128, 32],
  bladeTea: [0, 384, 128, 128], bladePost: [128, 384, 128, 128], bladeChem: [256, 384, 128, 128], menu: [384, 384, 128, 128],
};
function signAtlas() {
  const [c, g] = canvas(512, 512), r = mulberry(77);
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 512, 512);
  const board = (name, bg, fg, draw, border = true) => {
    const [x, y, w, h] = CELLS[name];
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.025 + r() * 0.04})`; g.fillRect(x + r() * w, y + r() * h, 6 + r() * 40, 1); }
    if (border) { g.strokeStyle = fg; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, w - 8, h - 8); g.globalAlpha = 0.5; g.strokeRect(x + 8, y + 8, w - 16, h - 16); g.globalAlpha = 1; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    draw(x, y, w, h);
    g.restore();
  };
  board('tearoom', '#1f4a3a', '#e8c872', (x, y, w, h) => { g.font = 'italic bold 40px Georgia, serif'; g.fillText('The Copper Kettle', x + w * 0.38, y + h / 2 + 1); g.font = 'bold 20px Georgia, serif'; g.fillText('TEA ROOMS', x + w * 0.87, y + h / 2 + 1); });
  board('post', '#a8231f', '#f6efd8', (x, y, w, h) => { g.font = 'bold 34px Arial, sans-serif'; g.fillText('POST OFFICE', x + w * 0.3, y + h / 2 + 1); g.font = 'bold 22px Arial, sans-serif'; g.fillText('& NEWSAGENT', x + w * 0.75, y + h / 2 + 1); });
  board('green', '#35542f', '#efe6cb', (x, y, w, h) => { g.font = 'bold 28px Georgia, serif'; g.fillText('J. PIPPIN', x + w * 0.22, y + h / 2); g.font = 'bold 32px Georgia, serif'; g.fillText('GREENGROCER', x + w * 0.68, y + h / 2); });
  board('hardware', '#23324a', '#ece6d4', (x, y, w, h) => { g.font = 'bold 30px Arial, sans-serif'; g.fillText("HARTLEY'S HARDWARE", x + w * 0.5, y + h / 2); });
  board('chemist', '#efece2', '#2d6a3e', (x, y, w, h) => { g.font = 'bold 40px Georgia, serif'; g.fillText('CHEMIST', x + w * 0.5, y + h / 2); g.fillRect(x + 22, y + 18, 28, 28); g.fillRect(x + 12, y + 28, 48, 8); g.fillRect(x + w - 50, y + 18, 28, 28); g.fillRect(x + w - 60, y + 28, 48, 8); });
  board('tolet', '#4d4a42', '#9d957d', (x, y, w, h) => { g.font = 'bold 28px Georgia, serif'; g.globalAlpha = 0.75; g.fillText("FLETCHER'S FISHERIES", x + w / 2, y + h / 2); g.globalAlpha = 1; }, false);
  board('telephone', '#f2efe4', '#2a2a2a', (x, y, w, h) => { g.font = 'bold 20px Arial, sans-serif'; g.fillText('TELEPHONE', x + w / 2, y + h / 2 + 1); }, false);
  board('busstop', '#1f3d73', '#f2efe4', (x, y, w, h) => { g.font = 'bold 20px Arial, sans-serif'; g.fillText('BUS STOP', x + w / 2, y + h / 2 + 1); }, false);
  board('bladeTea', '#f3ead4', '#1f4a3a', (x, y, w, h) => {
    g.font = 'italic bold 22px Georgia, serif'; g.fillText('Teas', x + w / 2, y + 24);
    g.fillStyle = '#1f4a3a'; g.beginPath(); g.ellipse(x + w / 2, y + 66, 28, 18, 0, 0, PI); g.fill(); g.fillRect(x + w / 2 - 28, y + 62, 56, 4);
    g.strokeStyle = '#1f4a3a'; g.lineWidth = 4; g.beginPath(); g.arc(x + w / 2 + 32, y + 66, 8, -1.2, 1.5); g.stroke();
    g.font = 'bold 16px Georgia, serif'; g.fillText('& Cakes', x + w / 2, y + 104);
  });
  board('bladePost', '#a8231f', '#f6efd8', (x, y, w, h) => { g.font = 'bold 19px Arial, sans-serif'; g.fillText('POST', x + w / 2, y + 44); g.fillText('OFFICE', x + w / 2, y + 70); g.fillRect(x + 44, y + 90, w - 88, 3); });
  board('bladeChem', '#efece2', '#2d6a3e', (x, y, w, h) => { g.fillRect(x + w / 2 - 14, y + 20, 28, 88); g.fillRect(x + w / 2 - 44, y + 50, 88, 28); });
  board('menu', '#2b3a33', '#efe9d8', (x, y, w, h) => {
    g.font = 'bold 15px Georgia, serif'; g.fillText("Today's", x + w / 2, y + 18);
    g.font = '13px Georgia, serif'; g.textAlign = 'left';
    ['Pot of tea  2.20', 'Cream tea  5.50', 'Victoria sponge', 'Bakewell tart', 'Toasted teacake', 'Cheese scone'].forEach((s, i) => g.fillText(s, x + 14, y + 40 + i * 14));
    g.textAlign = 'center';
  });
  return tex(c, false);
}
function signGeo(name, w, h) {
  const [x, y, cw, ch] = CELLS[name], geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  const u0 = x / 512, u1 = (x + cw) / 512, v0 = 1 - (y + ch) / 512, v1 = 1 - y / 512;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geo;
}

// A solid with a different top and bottom rectangle ([x0, x1, z0, z1]), between y0 and y1: wheelie bins, car
// cabins, roofs. Flat shaded, UVs in metres.
function frustum(bot, top, y0, y1) {
  const corner = (r, y) => [[r[0], y, r[2]], [r[1], y, r[2]], [r[1], y, r[3]], [r[0], y, r[3]]];
  const b = corner(bot, y0), t = corner(top, y1);
  const mid = [(bot[0] + bot[1] + top[0] + top[1]) / 4, (y0 + y1) / 2, (bot[2] + bot[3] + top[2] + top[3]) / 4];
  const pos = [], uv = [];
  const tri = (p, q, s) => {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...q), new THREE.Vector3(...p)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...s), new THREE.Vector3(...p)));
    const c = [(p[0] + q[0] + s[0]) / 3 - mid[0], (p[1] + q[1] + s[1]) / 3 - mid[1], (p[2] + q[2] + s[2]) / 3 - mid[2]];
    if (n.x * c[0] + n.y * c[1] + n.z * c[2] < 0) [q, s] = [s, q];
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (const v of [p, q, s]) { pos.push(...v); if (ay >= ax && ay >= az) uv.push(v[0], v[2]); else if (ax >= az) uv.push(v[2], v[1]); else uv.push(v[0], v[1]); }
  };
  const quad = (p, q, s, u) => { tri(p, q, s); tri(p, s, u); };
  quad(b[0], b[1], b[2], b[3]); quad(t[0], t[1], t[2], t[3]);
  for (let i = 0; i < 4; i++) quad(b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ build
export function build(ctx) {
  const { kit: k, wk, T, boxUV } = ctx;
  const add = ctx.add;
  const M = {
    pav: new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.93 }),
    floor: new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.55 }),
    sign: new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.55 }),
    glow: new THREE.MeshStandardMaterial({ map: k.paint.map, roughness: 0.35, emissive: 0xffd49a, emissiveIntensity: 0.55 }),
  };
  M.pav.name = 'street-paving'; M.floor.name = 'street-floor'; M.sign.name = 'street-sign'; M.glow.name = 'street-glow';
  const leafyLow = ctx.sway(wk.leafy, { baseY: FY, height: 1.0, amount: 0.6 });

  // --- primitives (all in world coordinates; x0..x1, y0..y1, z0..z1)
  const box = (x0, x1, y0, y1, z0, z1, mat, col = 0xffffff, lod = 1, uv = false) =>
    add(uv ? boxUV(x1 - x0, y1 - y0, z1 - z0, 1) : new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), col, lod);
  const boxC = (w, h, d, x, y, z, ry, mat, col = 0xffffff, lod = 1, rx = 0, rz = 0) =>
    add(new THREE.BoxGeometry(w, h, d), mat, T(x, y, z, ry, rx, rz), col, lod);
  const cyl = (rb, rt, y0, y1, x, z, mat, col = 0xffffff, lod = 1, seg = 10) =>
    add(new THREE.CylinderGeometry(rt, rb, y1 - y0, seg, 1), mat, T(x, (y0 + y1) / 2, z), col, lod);
  const ball = (r, x, y, z, mat, col = 0xffffff, lod = 1, sx = 1, sy = 1, sz = 1, seg = 8) =>
    add(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat, T(x, y, z, 0, 0, 0, sx, sy, sz), col, lod);
  const blob = (r, x, y, z, mat, col, lod = 1, seed = 1, sx = 1, sy = 1, sz = 1) =>
    add(ctx.blobGeometry(r, 1, seed, 0.2), mat, T(x, y, z, seed, 0, 0, sx, sy, sz), col, lod);
  const _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
  const rod = (a, b, r, mat, col = 0xffffff, lod = 1, seg = 6) => {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _a.length();
    _q.setFromUnitVectors(UP, _a.normalize());
    add(new THREE.CylinderGeometry(r, r, len, seg, 1), mat, new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _one), col, lod);
  };
  const plane = (w, h, x, y, z, ry, mat, col = 0xffffff, lod = 1, rx = 0) => add(new THREE.PlaneGeometry(w, h), mat, T(x, y, z, ry, rx), col, lod);
  const sign = (name, w, h, x, y, z, ry, lod = 1, rx = 0) => add(signGeo(name, w, h), M.sign, T(x, y, z, ry, rx), 0xffffff, lod);
  const H = { ctx, k, wk, M, T, add, box, boxC, cyl, ball, blob, rod, plane, sign, frustum, rnd: mulberry(4242), leafyLow, boxUV };

  paintGround(H);
  pavements(H);
  frontGardens(H);
  streetFurniture(H);
  vehicles(H);
  wires(H);
  parade(H);
  teaRoom(H);
  forecourts(H);
  yards(H);
}

// ------------------------------------------------------------------ painted ground
function paintGround(H) {
  const g = H.ctx.ground, r = mulberry(99);
  const X0 = -26, X1 = 26;
  const hard = (x0, z0, x1, z1, color, lines, alpha = 1) => g.rect(x0, z0, x1, z1, { type: 'paving', color, lines, alpha });
  // --- front lawns, mown in stripes, with beds along the wall
  g.rect(X0, FRONT_LINE, X1, 12.9, { type: 'grass', color: '#68843f' });
  for (let x = -19.5; x < 19.5; x += 0.55) if (Math.floor((x + 19.5) / 0.55) % 2) g.rect(x, FRONT_LINE, x + 0.55, 12.9, { type: 'grass', color: '#729048', alpha: 0.5 });
  const gateOf = { 0: [-15.05, -14.15], 1: [-7.85, -6.95], 2: [-1.95, -1.05], 3: [6.55, 7.45], 4: [13.75, 14.65] };
  const plots = [[-17.8, -10.6, 0], [-10.6, -3.4, 1], [-3.4, 3.8, 2], [3.8, 11.0, 3], [11.0, 18.2, 4]];
  for (const [x0, x1, i] of plots) {
    const [a, b] = gateOf[i];
    for (const [s0, s1] of [[x0 + 0.1, a - 0.15], [b + 0.15, x1 - 0.1]]) {
      if (i === 3 && s0 > 8) continue;            // the drive
      g.rect(s0, 11.95, s1, 12.88, { type: 'soil', color: '#4b3a2b' });
    }
  }
  g.rect(8.3, FRONT_LINE, 10.7, 12.9, { type: 'gravel', color: '#a39883' });                      // the drive
  g.rect(8.3, 12.2, 10.7, 12.9, { type: 'paving', color: '#8e5f4c', lines: 0.2 });
  g.circle(9.5, 10.7, 0.45, { type: 'tarmac', color: '#2c2b28', alpha: 0.3 });
  g.rect(8.2, FRONT_LINE, 8.3, 12.9, { type: 'paving', color: '#7b4f40', lines: 0.2 });
  g.rect(10.7, FRONT_LINE, 10.8, 12.9, { type: 'paving', color: '#7b4f40', lines: 0.2 });
  // --- paths from each gate to each door
  const path = (x, z0, z1, w, color, lines) => hard(x - w / 2, z0, x + w / 2, z1, color, lines);
  path(FRONT_DOORS['p-2'], FRONT_LINE, 12.9, 0.9, '#9a6a58', 0.23);
  hard(FRONT_DOORS['p-2'] - 0.7, FRONT_LINE, FRONT_DOORS['p-2'] + 0.7, 9.2, '#9a6a58', 0.23);
  path(FRONT_DOORS['p-1'], FRONT_LINE, 12.9, 0.9, '#b8b1a2', 0.6);
  hard(FRONT_DOORS['p-1'] - 0.8, FRONT_LINE, FRONT_DOORS['p-1'] + 0.8, 9.2, '#b8b1a2', 0.6);
  path(7.0, FRONT_LINE, 12.9, 0.9, '#a8a296', 0.45);
  path(FRONT_DOORS['p+2'], FRONT_LINE, 12.9, 0.9, '#c2b28e', 0.3);
  hard(FRONT_DOORS['p+2'] - 0.7, FRONT_LINE, FRONT_DOORS['p+2'] + 0.7, 9.2, '#c2b28e', 0.3);
  // ours: Victorian tiles (laid as thin 3D tiles in frontGardens)
  hard(-2.0, FRONT_LINE, -1.0, 12.9, '#3a3632', 0.3);   // under the whole path: no grass through the tiles
  // --- the road: tarmac, white and yellow lines, patches, stains
  g.rect(X0, S.ROAD.z0, X1, S.ROAD.z1, { type: 'tarmac', color: '#4a4b4e' });
  hard(X0, S.NEAR_PAV.z0, X1, S.NEAR_PAV.z1, '#a8a296', 0.6);
  hard(X0, S.FAR_PAV.z0, X1, S.FAR_PAV.z1, '#a8a296', 0.6);
  const tar = (x0, z0, x1, z1, color, alpha = 1) => g.rect(x0, z0, x1, z1, { type: 'tarmac', color, alpha });
  for (let x = -25; x < 25; x += 3) tar(x, S.ROAD.mid - 0.05, x + 1.6, S.ROAD.mid + 0.05, '#d9d6ca', 0.9);                // centre dashes
  for (const dz of [0.15, 0.27]) tar(X0, S.ROAD.z1 - dz - 0.05, X1, S.ROAD.z1 - dz, '#c4ad3a', 0.85);                       // double yellows, parade side
  tar(X0, S.ROAD.z0 + 0.15, X1, S.ROAD.z0 + 0.2, '#d9d6ca', 0.4);
  for (let i = 0; i < 9; i++) { const x = -18 + i * 4.6 + r() * 1.5, z = 15.3 + r() * 5, w = 0.8 + r() * 1.8, h = 0.6 + r() * 1.4; tar(x, z, x + w, z + h, r() < 0.5 ? '#3d3e41' : '#55565a', 0.7); }  // patches
  tar(-3.0, 16.2, -0.6, 17.1, '#34353a', 0.85); tar(5.8, 18.6, 7.6, 19.4, '#3a3b3f', 0.85);
  for (let i = 0; i < 16; i++) {                                                                                  // cracks
    const x = -19 + r() * 38, z = 14.9 + r() * 5.8, pts = [[x, z]];
    for (let k = 0; k < 5; k++) pts.push([pts[k][0] + (r() - 0.35) * 0.7, pts[k][1] + (r() - 0.5) * 0.5]);
    g.path(pts, 0.025, { type: 'tarmac', color: '#2b2c2e', alpha: 0.7 });
  }
  g.circle(-9, 15.2, 0.7, { type: 'tarmac', color: '#2f3033', alpha: 0.4 });  // oil by the kerb
  g.circle(12.6, 15.0, 1.2, { type: 'tarmac', color: '#3a4046', alpha: 0.35 });  // a damp patch
  for (const [x, z] of S.MANHOLES) g.circle(x, z, 0.5, { type: 'tarmac', color: '#3b3a38', alpha: 0.45 });
  // --- the shops' footprint (no grass blades through the floors) and the rear yards behind
  hard(X0, S.BLD.z0, X1, S.BLD.z1, '#8d8678', 0.5);
  hard(X0, S.YARD.z0, X1, S.YARD.z1, '#8d8678', 0.5, 0.95);
  g.rect(X0, S.YARD.z1, X1, 31.6, { type: 'gravel', color: '#8e8672' });
  // --- shadows of the big things
  g.shadowRect(-19.5, S.BLD.z0, 19.5, S.BLD.z1, 6.5, 0.42);
  g.shadowRect(-19.5, 12.9, 19.5, 13.02, 0.6, 0.22);
  g.shadowRect(-19.5, S.YARD.z1, 19.5, S.YARD.z1 + 0.12, 1.9, 0.3);
  for (const c of S.CARS) {
    const K = S.CAR_KINDS[c.kind], p = [S.carPoint(c, K.body.x[0], -K.body.hw), S.carPoint(c, K.body.x[1], K.body.hw)];
    g.shadowRect(Math.min(p[0][0], p[1][0]), Math.min(p[0][1], p[1][1]), Math.max(p[0][0], p[1][0]), Math.max(p[0][1], p[1][1]), K.cab.y[1] * 0.8, 0.4);
  }
  const Sh = S.SHELTER;
  g.shadowRect(Sh.x0, Sh.zBack, Sh.x1, Sh.zFront, Sh.roof, 0.38);
  g.shadowRect(S.PHONE.x - 0.45, S.PHONE.z - 0.45, S.PHONE.x + 0.45, S.PHONE.z + 0.45, 2.3, 0.4);
  g.shadowCircle(S.PILLAR.x, S.PILLAR.z, 0.26, 1.5, 0.4);
  for (const [x, z] of S.LAMPS) g.shadowCircle(x, z, 0.1, 2.0, 0.25);
  for (const P of S.POLES) g.shadowRect(P.x - 0.1, P.z - 0.1, P.x + 0.1, P.z + 0.1, P.h * 0.9, 0.3);
}

// ------------------------------------------------------------------ pavements, kerbs, road furniture
function pavements(H) {
  const { box, cyl, M, k, wk } = H;
  const X0 = -19.5, X1 = 19.5;
  box(X0, X1, FY, PV, S.NEAR_PAV.z0, S.NEAR_PAV.z1, M.pav, 0xffffff, 0, true);
  box(X0, X1, FY, PV, S.FAR_PAV.z0, 22.6, M.pav, 0xffffff, 0, true);
  box(X0, X1, FY, PV, 22.6, S.FAR_PAV.z1, M.pav, 0xc8ced0, 0, true);                          // the forecourts: cooler flags
  // kerbs, a little proud of the pavement's edge, with joints every 0.9 m
  for (const [za, zb] of [[S.NEAR_PAV.z1 - 0.15, S.NEAR_PAV.z1 + 0.02], [S.FAR_PAV.z0 - 0.02, S.FAR_PAV.z0 + 0.15]]) {
    box(X0, X1, FY, PV + 0.003, za, zb, k.stone, 0xcbc6bb, 0, true);
    const face = za < 15 ? zb : za;
    for (let x = X0 + 0.45; x < X1; x += 0.9) box(x - 0.006, x + 0.006, FY, PV, face - 0.004, face + 0.004, k.iron, 0x3a3733, 2);
  }
  // utility covers set in the pavements
  for (const [x, z, w, d, c] of [[-16.8, 13.4, 0.45, 0.3, 0x3d3a36], [-1.6, 13.6, 0.3, 0.3, 0x3d3a36], [11.2, 14.2, 0.6, 0.4, 0x3d3a36], [-5.0, 21.6, 0.45, 0.3, 0x3d3a36], [15.8, 21.2, 0.3, 0.3, 0x5a4a2a]]) {
    box(x - w / 2, x + w / 2, PV, PV + 0.006, z - d / 2, z + d / 2, k.iron, c, 2);
    for (let i = 1; i < 4; i++) box(x - w / 2 + (w * i) / 4 - 0.004, x - w / 2 + (w * i) / 4 + 0.004, PV + 0.006, PV + 0.008, z - d / 2, z + d / 2, k.iron, 0x1c1b19, 2);
  }
  // road drains and manholes
  for (const [x, z] of S.DRAINS) {
    box(x - 0.3, x + 0.3, FY, FY + 0.012, z - 0.16, z + 0.16, k.iron, 0x3f3c38, 1);
    for (let i = 0; i < 6; i++) box(x - 0.26 + i * 0.1, x - 0.2 + i * 0.1, FY + 0.012, FY + 0.014, z - 0.13, z + 0.13, k.iron, 0x161513, 2);
  }
  for (const [x, z] of S.MANHOLES) {
    cyl(0.4, 0.4, FY, FY + 0.008, x, z, k.iron, 0x2f2d2a, 1, 16);
    cyl(0.35, 0.35, FY + 0.008, FY + 0.016, x, z, k.iron, 0x4c4843, 1, 16);
    cyl(0.25, 0.25, FY + 0.016, FY + 0.019, x, z, k.iron, 0x3a3733, 2, 12);
    for (let a = 0; a < 6; a++) { const t = a / 6 * PI; H.boxC(0.62, 0.003, 0.02, x, FY + 0.02, z, t, k.iron, 0x211f1d, 2); }
  }
  // street trees' grilles
  for (const t of S.STREET_TREES) {
    for (const [dx, dz, w, d] of [[0, -0.4, 0.9, 0.1], [0, 0.4, 0.9, 0.1], [-0.4, 0, 0.1, 0.7], [0.4, 0, 0.1, 0.7]]) box(t.x + dx - w / 2, t.x + dx + w / 2, PV, PV + 0.025, t.z + dz - d / 2, t.z + dz + d / 2, k.iron, 0x2f2d2a, 1);
    box(t.x - 0.35, t.x + 0.35, PV, PV + 0.018, t.z - 0.35, t.z + 0.35, k.soil, 0x4a3a2c, 1);
    for (let i = 0; i < 6; i++) H.blob(0.05 + H.rnd() * 0.04, t.x + (H.rnd() - 0.5) * 0.5, PV + 0.03, t.z + (H.rnd() - 0.5) * 0.5, wk.leafy, 0x8fae6a, 2, i, 1, 0.5, 1);
    buildTree(H.ctx, { ...t, y: PV, seed: Math.round(t.x * 31) });
  }
}

// ------------------------------------------------------------------ front gardens
function wheelie(H, x, z, yaw, colour, lidOpen = false) {
  const { add, T, k, frustum, box, cyl } = H;
  // body: a tapering tub 0.58 x 0.72 at the top, 0.5 x 0.6 at the foot, 1.06 m tall on two wheels
  add(frustum([-0.25, 0.25, -0.3, 0.3], [-0.29, 0.29, -0.36, 0.36], 0, 0.95), k.rubber, T(x, FY + 0.08, z, yaw), colour, 1);
  add(new THREE.BoxGeometry(0.62, 0.05, 0.76), k.rubber, T(x, FY + 1.05, z, yaw), colour, 1);
  add(new THREE.BoxGeometry(0.56, 0.035, 0.05), k.rubber, T(x - Math.sin(yaw) * 0 , FY + 1.02, z + 0.4 * Math.cos(yaw), yaw), colour, 2);   // the lid's lip
  for (const sx of [-0.3, 0.3]) add(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 10), k.rubber, T(x + sx * Math.cos(yaw) - 0.28 * Math.sin(yaw), FY + 0.085, z - sx * Math.sin(yaw) - 0.28 * Math.cos(yaw), yaw, 0, PI / 2), 0x1e1e1e, 2);
  void box; void cyl; void lidOpen;
}

function frontGardens(H) {
  const { ctx, k, wk, M, add, T, box, boxC, cyl, ball, blob, rod, frustum, leafyLow, boxUV, plane } = H;
  const WZ = S.WALL.z, X0 = -19.5, X1 = 19.5;
  const rnd = mulberry(1729);
  const jitter = (c, a = 0.06) => { const col = new THREE.Color(c), f = 1 - a + rnd() * a * 2; return col.multiplyScalar(f).getHex(); };
  const brickBox = (x0, x1, y0, y1, z0, z1, col, lod = 1) => box(x0, x1, y0, y1, z0, z1, wk.brick, col, lod, true);

  // --- the front wall: 0.6 m of brick with coping, in the gaps between the gates
  {
    const gs = S.GATES.slice().sort((a, b) => a[0] - b[0]);
    let prev = X0;
    const segs = [];
    for (const [a, b] of gs) { segs.push([prev, a]); prev = b; }
    segs.push([prev, X1]);
    for (const [a, b] of segs) {
      const col = [0xffffff, 0xf0e2d4, 0xe8d6c6, 0xfaf0e6][Math.floor(rnd() * 4)];
      brickBox(a, b, FY, FY + S.WALL.h, WZ - S.WALL.t / 2, WZ + S.WALL.t / 2, col, 0);
      box(a - 0.04, b + 0.04, FY + S.WALL.h, FY + S.WALL.h + S.WALL.copeH, WZ - S.WALL.copeT / 2, WZ + S.WALL.copeT / 2, k.stone, jitter(0xcdc7ba), 1, true);
      // lichen and moss on the coping
      for (let x = a + 0.5; x < b - 0.3; x += 0.7 + rnd() * 1.4) if (rnd() < 0.55) blob(0.07 + rnd() * 0.05, x, FY + S.WALL.h + S.WALL.copeH, WZ + (rnd() - 0.5) * 0.1, wk.leafy, 0x6f8a3c, 2, Math.round(x * 13), 1.5, 0.25, 0.8);
    }
    // ivy on the street face, here and there
    for (const x of [-16.2, -12.0, -9.7, -4.9, 4.4, 12.3, 16.8]) {
      blob(0.28, x, FY + 0.34, WZ + 0.1, leafyLow, 0x4f6c3f, 1, Math.round(x * 7), 1.2, 1, 0.3);
      blob(0.2, x + 0.3, FY + 0.5, WZ + 0.1, leafyLow, 0x5a7845, 2, Math.round(x * 5), 1, 1, 0.3);
    }
  }
  // --- piers with a string course, stone caps and pyramids (ball finials on the drive's)
  for (const px of S.pierXs()) {
    brickBox(px - 0.14, px + 0.14, FY, FY + S.PIER.h, WZ - 0.14, WZ + 0.14, jitter(0xefe0d2), 0);
    box(px - 0.16, px + 0.16, FY + 0.78, FY + 0.83, WZ - 0.16, WZ + 0.16, k.stone, 0xcdc7ba, 1, true);
    box(px - S.PIER.cap / 2, px + S.PIER.cap / 2, FY + S.PIER.h, FY + S.PIER.h + S.PIER.capH, WZ - S.PIER.cap / 2, WZ + S.PIER.cap / 2, k.stone, 0xcfc9bc, 1, true);
    if (px > 8 && px < 11) ball(0.1, px, FY + S.PIER.h + S.PIER.capH + 0.1, WZ, k.stone, 0xcfc9bc, 1, 1, 1, 1, 10);
    else add(new THREE.ConeGeometry(0.2, 0.13, 4), k.stone, T(px, FY + S.PIER.h + S.PIER.capH + 0.065, WZ, PI / 4), 0xcfc9bc, 1);
  }
  // --- gate leaves, standing open
  {
    const colours = [0x3f5a46, 0x2a2a2a, 0xe8e4da, 0x6b4a30, 0x2e2e2c, 0x2e2e2c, 0x2f4f6b];
    S.LEAVES.forEach(([x, len, h], i) => {
      const z1 = WZ - 0.1, z0 = z1 - len, y0 = FY + 0.1, col = colours[i], spear = i === 1 || i === 4 || i === 5;
      for (const [ya, yb] of [[0.0, 0.06], [h * 0.5 - 0.1, h * 0.5 - 0.04], [h - 0.18, h - 0.1]]) box(x - 0.025, x + 0.025, y0 + ya, y0 + yb, z0, z1, k.wood, col, 1);
      const n = Math.floor(len / 0.105);
      for (let p = 0; p < n; p++) {
        const z = z0 + (p + 0.5) * (len / n), top = h - 0.1;
        box(x - 0.012, x + 0.012, y0 + 0.02, y0 + top, z - 0.03, z + 0.03, k.wood, col, 2);
        if (spear) add(new THREE.ConeGeometry(0.03, 0.08, 4), k.iron, T(x, y0 + top + 0.04, z, PI / 4), col, 2);
      }
      for (const z of [z0 + 0.02, z1 - 0.02]) box(x - 0.03, x + 0.03, y0 - 0.04, y0 + h - 0.06, z - 0.025, z + 0.025, k.wood, col, 1);
    });
  }
  // --- walls and hedges between the gardens
  for (const d of S.DIVIDER_WALLS) {
    brickBox(d.x - 0.06, d.x + 0.06, FY, FY + d.h, S.DIV_Z0, S.DIV_Z1, jitter(0xf2e4d6), 1);
    box(d.x - 0.1, d.x + 0.1, FY + d.h, FY + d.h + 0.05, S.DIV_Z0, S.DIV_Z1, k.stone, 0xcdc7ba, 1, true);
  }
  for (const d of S.DIVIDER_HEDGES) buildHedge(ctx, { a: [d.x, S.DIV_Z0], b: [d.x, S.DIV_Z1], h: d.h, d: 0.5, color: jitter(0xa4bc8f, 0.04) });
  for (const h of S.HEDGES) buildHedge(ctx, { a: h.a, b: h.b, h: h.h, d: h.d, color: h.kind === 'privet' ? 0xa2bd8c : 0x7fa070 });

  // --- planting: roses (bushes with blooms) and lavender along the paths
  {
    const bloom = [0xb8283a, 0xd96b8a, 0xf0d8d0, 0xe8c24a, 0xc84b3a, 0xe58aa0];
    for (const [x, z, r] of S.ROSES) {
      const seed = Math.round(x * 17 + z * 5), c = bloom[Math.abs(seed) % bloom.length];
      blob(r, x, FY + r * 0.85, z, leafyLow, jitter(0x7d9a62, 0.1), 1, seed, 1, 0.85, 1);
      blob(r * 0.7, x + r * 0.45, FY + r * 0.7, z - r * 0.2, leafyLow, jitter(0x6f8c58, 0.1), 1, seed + 2, 1, 0.8, 1);
      for (let i = 0; i < 9; i++) {
        const a = rnd() * PI * 2, e = 0.2 + rnd() * 1.0, rr = r * 0.95;
        ball(0.035, x + Math.cos(a) * Math.cos(e) * rr, FY + r * 0.85 + Math.sin(e) * rr * 0.8, z + Math.sin(a) * Math.cos(e) * rr, k.petal, jitter(c, 0.1), 2, 1, 0.8, 1, 5);
      }
    }
    for (const [x, z, r] of S.LAVENDER) {
      const seed = Math.round(x * 31 + z * 7);
      blob(r, x, FY + r * 0.7, z, leafyLow, jitter(0x8a9a86, 0.1), 1, seed, 1.2, 0.8, 1.2);
      blob(r * 0.66, x, FY + r * 1.15, z, leafyLow, jitter(0x8d78b8, 0.1), 2, seed + 3, 1.1, 0.8, 1.1);
    }
  }
  // --- bay trees in terracotta pots, door pots of geraniums
  for (const [x, z, r] of S.BAY_POTS) {
    cyl(r * 0.66, r, FY, FY + 0.45, x, z, k.terracotta, 0xb8643f, 1, 12);
    cyl(r + 0.02, r + 0.02, FY + 0.41, FY + 0.46, x, z, k.terracotta, 0xb0603c, 1, 12);
    cyl(r - 0.02, r - 0.02, FY + 0.45, FY + 0.465, x, z, k.soil, 0x3a2c20, 2, 10);
    rod([x, FY + 0.45, z], [x + 0.01, FY + 1.3, z - 0.01], 0.028, k.wood, 0x5b4630, 1, 6);
    blob(0.36, x, FY + 1.5, z, wk.leafy, 0x4f7b44, 1, Math.round(x * 3), 1, 0.95, 1);
    blob(0.22, x + 0.14, FY + 1.34, z + 0.1, wk.leafy, 0x5a8450, 1, Math.round(x * 5), 1, 1, 1);
  }
  for (const [x, z, r] of S.DOOR_POTS) {
    cyl(r * 0.7, r, FY, FY + 0.32, x, z, k.terracotta, 0xc07040, 1, 10);
    blob(r * 1.3, x, FY + 0.45, z, leafyLow, 0x5f8a4c, 1, Math.round(x * 3), 1, 0.8, 1);
    for (let i = 0; i < 7; i++) ball(0.04, x + (rnd() - 0.5) * r * 2, FY + 0.5 + rnd() * 0.12, z + (rnd() - 0.5) * r * 2, k.petal, [0xd23a3a, 0xe8789a, 0xf2f0e8][i % 3], 2, 1, 1, 1, 5);
  }

  // --- the bin store (slatted timber, the lid propped open a little) and the wheelie bins
  {
    const B = S.BIN_STORE, wood = 0x7a6a52;
    box(B.x0, B.x0 + 0.05, FY, FY + B.h, B.z0, B.z1, k.weathered, wood, 1, true);
    box(B.x1 - 0.05, B.x1, FY, FY + B.h, B.z0, B.z1, k.weathered, wood, 1, true);
    for (let y = FY + 0.2; y < FY + B.h - 0.1; y += 0.3) { box(B.x0 - 0.01, B.x1 + 0.01, y, y + 0.03, B.z1 - 0.02, B.z1 + 0.01, k.weathered, 0x6f5f48, 2); }
    boxC(B.x1 - B.x0 + 0.2, 0.05, B.z1 - B.z0 + 0.2, (B.x0 + B.x1) / 2, FY + B.h - 0.03, (B.z0 + B.z1) / 2, 0, k.weathered, 0x6a5a44, 1, -0.04);
    box(B.x0, B.x1, FY + B.h - 0.12, FY + B.h - 0.06, B.z0, B.z0 + 0.02, k.weathered, 0x6a5a44, 2);
  }
  for (const [x, z, yaw, col] of S.WHEELIES) wheelie(H, x, z, yaw, col);

  // --- bird table with a robin
  {
    const T0 = S.BIRD_TABLE, y = FY + T0.post;
    cyl(0.03, 0.03, FY, y, T0.x, T0.z, k.wood, 0x6e5a40, 1, 6);
    box(T0.x - 0.22, T0.x + 0.22, y, y + 0.04, T0.z - 0.22, T0.z + 0.22, k.wood, 0x8a6e4a, 1);
    box(T0.x - 0.22, T0.x + 0.22, y + 0.04, y + 0.07, T0.z + 0.2, T0.z + 0.22, k.wood, 0x8a6e4a, 2);
    box(T0.x - 0.22, T0.x - 0.2, y + 0.04, y + 0.07, T0.z - 0.22, T0.z + 0.22, k.wood, 0x8a6e4a, 2);
    box(T0.x + 0.2, T0.x + 0.22, y + 0.04, y + 0.07, T0.z - 0.22, T0.z + 0.22, k.wood, 0x8a6e4a, 2);
    for (const sx of [-0.19, 0.19]) box(T0.x + sx - 0.01, T0.x + sx + 0.01, y + 0.04, y + 0.32, T0.z - 0.12, T0.z - 0.1, k.wood, 0x6e5a40, 2);
    for (const sx of [-1, 1]) boxC(0.28, 0.02, 0.5, T0.x + sx * 0.12, y + 0.34, T0.z - 0.11, 0, k.wood, 0x7a3c2a, 1, 0, -sx * 0.7);
    for (let i = 0; i < 9; i++) ball(0.012, T0.x + (rnd() - 0.5) * 0.3, y + 0.045, T0.z + 0.08 + (rnd() - 0.5) * 0.1, k.paper, 0xd9c08a, 2, 1, 0.7, 1, 4);
    ball(0.035, T0.x + 0.15, y + 0.075, T0.z + 0.12, k.fabric, 0x8a6a4a, 2, 1.2, 1, 1.5, 6);
    ball(0.028, T0.x + 0.15, y + 0.085, T0.z + 0.145, k.fabric, 0xc4552e, 2, 1, 1, 1, 6);
    ball(0.024, T0.x + 0.15, y + 0.11, T0.z + 0.16, k.fabric, 0x7a5a3e, 2, 1, 1, 1, 6);
  }

  // --- our front: the Victorian tiled path, red, buff and black, 0.3 m a tile
  {
    let row = 0;
    for (let z = FRONT_LINE; z < 12.9 - 0.01; z += 0.3, row++) for (let c = 0; c < 3; c++) {
      const col = c === 1 ? ((row & 1) ? 0xd8c8a0 : 0x8e3b2b) : ((row & 1) === (c === 0 ? 0 : 1) ? 0x2a2727 : 0x8e3b2b);
      const x = -1.95 + c * 0.3;
      box(x + 0.006, x + 0.294, FY, FY + 0.012, z + 0.006, Math.min(z + 0.294, 12.9), k.stone, col, 1, true);
    }
    box(-1.95, -1.05, FY, FY + 0.008, FRONT_LINE, 12.9, k.stone, 0x3a3632, 1, true);
  }
  // --- our front: doormat, milk bottles, boot scraper, bench under the bay, a pot of tulips
  {
    box(-1.86, -1.14, FY, FY + 0.018, 8.9, 9.32, k.fabric, 0x6a5238, 1);
    box(-1.84, -1.16, FY + 0.018, FY + 0.021, 8.92, 9.3, k.fabric, 0x4a3828, 2);
    for (const [x, z] of S.MILK) {
      cyl(0.03, 0.03, FY, FY + 0.16, x, z, k.ceramic, 0xf4f1e6, 1, 10);
      cyl(0.03, 0.016, FY + 0.16, FY + 0.21, x, z, k.ceramic, 0xf4f1e6, 1, 10);
      cyl(0.018, 0.018, FY + 0.21, FY + 0.225, x, z, k.steel, 0xc9ced6, 2, 8);
    }
    box(-0.9, -0.62, FY, FY + 0.03, 8.72, 8.9, k.stone, 0xb5aea0, 1, true);       // the stone the bottles stand on
    const sc = S.SCRAPER;
    box(sc.x - 0.15, sc.x + 0.15, FY, FY + 0.04, sc.z - 0.12, sc.z + 0.12, k.iron, 0x1e1e1e, 1);
    box(sc.x - 0.14, sc.x + 0.14, FY + 0.04, FY + 0.075, sc.z - 0.08, sc.z + 0.1, k.fabric, 0x4b3b2a, 2);
    box(sc.x - 0.15, sc.x + 0.15, FY + 0.04, FY + 0.25, sc.z - 0.112, sc.z - 0.1, k.iron, 0x1e1e1e, 1);
    for (const s2 of [-1, 1]) { box(sc.x + s2 * 0.15 - 0.01, sc.x + s2 * 0.15 + 0.01, FY + 0.04, FY + 0.2, sc.z - 0.12, sc.z + 0.1, k.iron, 0x1e1e1e, 2); ball(0.025, sc.x + s2 * 0.15, FY + 0.21, sc.z - 0.1, k.iron, 0x1e1e1e, 2, 1, 1, 1, 6); }
    // the bench: green slats on cast-iron ends
    const Bn = S.BENCH, bx = (Bn.x0 + Bn.x1) / 2, w2 = (Bn.x1 - Bn.x0) / 2, y = FY + Bn.seat;
    for (let i = 0; i < 4; i++) box(bx - w2, bx + w2, y - 0.02, y + 0.02, Bn.z0 + 0.05 + i * 0.1, Bn.z0 + 0.05 + i * 0.1 + 0.085, k.wood, 0x3e5a45, 1);
    for (let i = 0; i < 3; i++) box(bx - w2, bx + w2, y + 0.07 + i * 0.12, y + 0.07 + i * 0.12 + 0.09, Bn.z0 + 0.02, Bn.z0 + 0.04, k.wood, 0x3e5a45, 1);
    for (const s2 of [-1, 1]) {
      const ex = bx + s2 * (w2 - 0.07);
      box(ex - 0.025, ex + 0.025, FY, y - 0.02, Bn.z0 + 0.03, Bn.z0 + 0.07, k.iron, 0x232323, 1);
      box(ex - 0.025, ex + 0.025, FY, y - 0.02, Bn.z1 - 0.07, Bn.z1 - 0.03, k.iron, 0x232323, 1);
      box(ex - 0.03, ex + 0.03, y - 0.02, y - 0.005, Bn.z0 + 0.03, Bn.z1 - 0.03, k.iron, 0x232323, 1);
      box(ex - 0.03, ex + 0.03, y + 0.2, y + 0.225, Bn.z0 + 0.02, Bn.z1 - 0.1, k.iron, 0x232323, 1);
      box(ex - 0.025, ex + 0.025, y, y + 0.46, Bn.z0 + 0.02, Bn.z0 + 0.05, k.iron, 0x232323, 1);
      box(ex - 0.025, ex + 0.025, y + 0.2, y + 0.225, Bn.z1 - 0.1, Bn.z1 - 0.06, k.iron, 0x232323, 2);
      box(ex - 0.02, ex + 0.02, y, y + 0.2, Bn.z1 - 0.1, Bn.z1 - 0.07, k.iron, 0x232323, 2);
    }
    // a cat asleep on it
    ball(0.1, bx - 0.45, y + 0.12, Bn.z0 + 0.25, k.fabric, 0xc9884a, 2, 1.6, 0.8, 1, 8);
    ball(0.055, bx - 0.28, y + 0.14, Bn.z0 + 0.26, k.fabric, 0xc9884a, 2, 1, 1, 1, 6);
  }
  // --- garden trees
  for (const t of S.GARDEN_TREES) buildTree(ctx, { ...t, y: FY, seed: Math.round(t.x * 13) });
  void boxUV; void frustum; void M;
}

// ------------------------------------------------------------------ lamp posts, pillar box, bus shelter, phone box, bollards, bike
function streetFurniture(H) {
  const { ctx, k, wk, M, add, T, box, boxC, cyl, ball, blob, rod, plane, sign, frustum } = H;
  const iron = 0x1f2a26;

  // --- cast-iron lamp posts with glowing lanterns
  for (const [x, z] of S.LAMPS) {
    const L = S.LAMP, top = PV + L.h;
    cyl(0.16, 0.11, PV, PV + 0.22, x, z, k.iron, iron, 1, 12);
    cyl(0.11, 0.095, PV + 0.22, PV + 0.7, x, z, k.iron, iron, 1, 12);
    for (let a = 0; a < 6; a++) { const t = a / 6 * PI * 2; box(x + Math.cos(t) * 0.1 - 0.012, x + Math.cos(t) * 0.1 + 0.012, PV + 0.25, PV + 0.65, z + Math.sin(t) * 0.1 - 0.012, z + Math.sin(t) * 0.1 + 0.012, k.iron, 0x2b3631, 2); }
    cyl(0.115, 0.115, PV + 0.68, PV + 0.73, x, z, k.iron, iron, 1, 12);
    cyl(0.07, 0.052, PV + 0.73, top, x, z, k.iron, iron, 1, 10);
    cyl(0.085, 0.085, PV + 1.7, PV + 1.76, x, z, k.iron, iron, 2, 10);
    cyl(0.075, 0.075, top - 0.2, top - 0.15, x, z, k.iron, iron, 2, 10);
    boxC(0.7, 0.02, 0.02, x, top - 0.45, z, 0, k.iron, iron, 2);          // the lamplighter's ladder bar
    // lantern: an inverted-pyramid glass with iron corners, a pierced cap and a finial
    add(frustum([-0.1, 0.1, -0.1, 0.1], [-0.2, 0.2, -0.2, 0.2], 0, 0.34), M.glow, T(x, top + 0.02, z, PI / 4), 0xffeccc, 1);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod([x + a * 0.1 * 1.0, top + 0.02, z + b * 0.1], [x + a * 0.2, top + 0.36, z + b * 0.2], 0.012, k.iron, iron, 2, 5);
    add(new THREE.ConeGeometry(0.32, 0.2, 4), k.iron, T(x, top + 0.46, z, PI / 4), iron, 1);
    ball(0.045, x, top + 0.6, z, k.iron, iron, 2, 1, 1.4, 1, 6);
    cyl(0.12, 0.12, top - 0.02, top + 0.03, x, z, k.iron, iron, 2, 8);
  }

  // --- telegraph poles with two crossarms and ceramic insulators
  for (const P of S.POLES) {
    cyl(0.12, 0.085, PV, PV + P.h, P.x, P.z, k.weathered, 0x4a3a2c, 1, 8);
    add(new THREE.ConeGeometry(0.1, 0.12, 8), k.weathered, T(P.x, PV + P.h + 0.06, P.z), 0x4a3a2c, 2);
    for (const ay of S.POLE.armY) {
      box(P.x - 0.05, P.x + 0.05, FY + ay - 0.1, FY + ay, P.z - S.POLE.armHalf, P.z + S.POLE.armHalf, k.weathered, 0x54432f, 1, true);
      for (const s of [-1, 1]) rod([P.x, FY + ay - 0.5, P.z + s * 0.02], [P.x, FY + ay - 0.08, P.z + s * 0.55], 0.025, k.weathered, 0x4a3a2c, 2, 5);
      for (const dz of S.POLE.wireDz) {
        cyl(0.012, 0.012, FY + ay, FY + ay + 0.1, P.x, P.z + dz, k.iron, 0x303030, 2, 5);
        cyl(0.04, 0.03, FY + ay + 0.06, FY + ay + 0.13, P.x, P.z + dz, k.ceramic, 0x8a6a4a, 2, 8);
        cyl(0.03, 0.04, FY + ay + 0.12, FY + ay + 0.16, P.x, P.z + dz, k.ceramic, 0x8a6a4a, 2, 8);
      }
    }
    for (const y of [1.6, 2.2, 2.8, 3.4]) { box(P.x - 0.03, P.x + 0.03, PV + y, PV + y + 0.02, P.z + 0.08, P.z + 0.2, k.iron, 0x3a3a3a, 2); }
    box(P.x - 0.07, P.x + 0.07, PV + 2.4, PV + 2.52, P.z + 0.1, P.z + 0.11, k.enamel, 0xe8e2d0, 2);
    // guy wire anchor stub
    rod([P.x, PV + 5.2, P.z], [P.x + (P.x < 0 ? -0.8 : 0.8), PV + 0.2, P.z + 0.5], 0.006, k.iron, 0x252525, 2, 4);
  }

  // --- pillar box
  {
    const P = S.PILLAR, red = 0xa81c16;
    cyl(0.3, 0.27, PV, PV + 0.12, P.x, P.z, k.enamel, red, 1, 14);
    cyl(0.25, 0.24, PV + 0.12, PV + 1.42, P.x, P.z, k.enamel, red, 0, 14);
    cyl(0.285, 0.275, PV + 1.4, PV + 1.5, P.x, P.z, k.enamel, red, 0, 14);
    cyl(0.29, 0.29, PV + 1.36, PV + 1.4, P.x, P.z, k.enamel, red, 1, 14);
    cyl(0.256, 0.256, PV + 0.68, PV + 0.72, P.x, P.z, k.enamel, red, 2, 14);
    box(P.x - 0.12, P.x + 0.12, PV + 1.02, PV + 1.1, P.z - 0.275, P.z - 0.235, k.enamel, 0x161616, 1);          // the posting slot, facing the road
    box(P.x - 0.15, P.x + 0.15, PV + 1.0, PV + 1.12, P.z - 0.262, P.z - 0.248, k.enamel, red, 1);
    box(P.x - 0.07, P.x + 0.07, PV + 0.62, PV + 0.82, P.z - 0.248, P.z - 0.24, k.enamel, 0xe8e0c8, 2);
    box(P.x - 0.012, P.x + 0.012, PV + 0.2, PV + 1.34, P.z - 0.25, P.z - 0.24, k.enamel, 0x4a0e0b, 2);
    plane(0.1, 0.1, P.x, PV + 1.25, P.z - 0.2465, PI, k.brass, 0xc9a24e, 2);
  }

  // --- bus shelter: green-painted steel, a glass back, a flat roof you could put a cup on, open ends
  {
    const Sh = S.SHELTER, sx = (Sh.x0 + Sh.x1) / 2, sz = (Sh.zBack + Sh.zFront) / 2, top = FY + Sh.roof, col = 0x2e4a44;
    box(Sh.x0 - 0.15, Sh.x1 + 0.15, top - 0.09, top, Sh.zBack - 0.15, Sh.zFront + 0.15, k.paint, col, 0);
    for (const [xa, xb, za, zb] of [[Sh.x0 - 0.15, Sh.x1 + 0.15, Sh.zFront + 0.13, Sh.zFront + 0.15], [Sh.x0 - 0.15, Sh.x1 + 0.15, Sh.zBack - 0.15, Sh.zBack - 0.13], [Sh.x0 - 0.15, Sh.x0 - 0.13, Sh.zBack - 0.15, Sh.zFront + 0.15], [Sh.x1 + 0.13, Sh.x1 + 0.15, Sh.zBack - 0.15, Sh.zFront + 0.15]]) box(xa, xb, top, top + 0.025, za, zb, k.paint, col, 1);
    sign('busstop', 0.64, 0.16, sx, top - 0.045, Sh.zFront + 0.152, 0, 1);
    for (const px of [Sh.x0 + 0.04, Sh.x1 - 0.04]) box(px - 0.04, px + 0.04, FY, top - 0.09, Sh.zFront - 0.09, Sh.zFront - 0.01, k.paint, col, 1);
    // back wall: three glass panes in a frame, a lit poster, a timetable
    const yb = PV, yt = top - 0.09;
    for (let i = 0; i < 3; i++) {
      const xa = Sh.x0 + (Sh.x1 - Sh.x0) * i / 3, xb = Sh.x0 + (Sh.x1 - Sh.x0) * (i + 1) / 3;
      plane(xb - xa - 0.06, yt - yb - 0.2, (xa + xb) / 2, (yb + yt) / 2, Sh.zBack, PI, k.glass, 0xdfeff0, 1);
    }
    for (let i = 0; i <= 3; i++) { const x = Sh.x0 + (Sh.x1 - Sh.x0) * i / 3; box(x - 0.03, x + 0.03, yb, yt, Sh.zBack - 0.03, Sh.zBack + 0.03, k.paint, col, 1); }
    box(Sh.x0, Sh.x1, yb, yb + 0.1, Sh.zBack - 0.03, Sh.zBack + 0.03, k.paint, col, 1);
    box(Sh.x0, Sh.x1, yt - 0.1, yt, Sh.zBack - 0.03, Sh.zBack + 0.03, k.paint, col, 1);
    box(sx - 0.45, sx + 0.45, PV + 0.55, PV + 1.85, Sh.zBack + 0.02, Sh.zBack + 0.06, M.glow, 0xe8d6a8, 1);              // lit poster
    box(sx - 0.45, sx + 0.45, PV + 1.3, PV + 1.4, Sh.zBack + 0.06, Sh.zBack + 0.065, k.paper, 0xb23a2a, 2);
    box(sx + 0.7, sx + 1.05, PV + 1.05, PV + 1.55, Sh.zBack + 0.03, Sh.zBack + 0.05, k.paper, 0xf2f0e6, 2);
    // the bench inside
    for (let i = 0; i < 3; i++) box(sx - 1.0, sx + 0.4, FY + 0.5 - 0.02, FY + 0.5 + 0.02, Sh.zBack + 0.09 + i * 0.13, Sh.zBack + 0.09 + i * 0.13 + 0.11, k.wood, 0x6a4a30, 1);
    for (const x of [sx - 0.95, sx + 0.35]) { box(x - 0.025, x + 0.025, PV, FY + 0.48, Sh.zBack + 0.1, Sh.zBack + 0.14, k.iron, 0x2b2b2b, 1); box(x - 0.025, x + 0.025, PV, FY + 0.48, Sh.zBack + 0.4, Sh.zBack + 0.44, k.iron, 0x2b2b2b, 1); }
    // chewing-gum stains and a dropped glove
    for (let i = 0; i < 5; i++) ball(0.02, sx + (H.rnd() - 0.5) * 2.4, PV + 0.002, sz + (H.rnd() - 0.5) * 0.9, k.rubber, 0x5a5650, 2, 1, 0.1, 1, 5);
  }
  // a bus-stop flag by the shelter
  {
    const x = S.BUSFLAG.x, z = S.BUSFLAG.z;
    cyl(0.03, 0.03, PV, PV + 2.7, x, z, k.steel, 0x9aa0a6, 1, 8);
    box(x - 0.28, x + 0.28, PV + 2.35, PV + 2.85, z - 0.015, z + 0.015, k.enamel, 0x1f3d73, 1);
    box(x - 0.28, x + 0.28, PV + 2.35, PV + 2.4, z - 0.02, z + 0.02, k.enamel, 0xc43a2e, 2);
    sign('busstop', 0.5, 0.125, x, PV + 2.64, z - 0.0175, PI, 1);
  }

  // --- the red phone box (K6): door open onto the pavement, glazing bars, lit TELEPHONE panels
  {
    const P = S.PHONE, red = 0xb3201c, hw = 0.475, top = FY + P.h;
    box(P.x - hw, P.x + hw, FY, FY + 0.2, P.z - hw, P.z + hw, k.paint, red, 1);
    box(P.x - hw - 0.01, P.x + hw + 0.01, FY + 0.18, FY + 0.22, P.z - hw - 0.01, P.z + hw + 0.01, k.paint, red, 2);
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(P.x + sx * 0.42 - 0.045, P.x + sx * 0.42 + 0.045, FY + 0.2, top - 0.2, P.z + sz * 0.42 - 0.045, P.z + sz * 0.42 + 0.045, k.paint, red, 1);
    // glazed faces: +x (back), -z, +z
    const faces = [
      { x: P.x + 0.42, z: P.z, ry: PI / 2 }, { x: P.x, z: P.z - 0.42, ry: PI }, { x: P.x, z: P.z + 0.42, ry: 0 },
    ];
    for (const f of faces) {
      const gw = 0.78, y0 = FY + 0.2, y1 = top - 0.34, cs = Math.cos(f.ry), sn = Math.sin(f.ry);
      const at = (lx, y, lz = 0) => [f.x + cs * lx + sn * lz, y, f.z - sn * lx + cs * lz];
      const p0 = at(0, (y0 + y1) / 2, 0.0);
      add(new THREE.PlaneGeometry(gw, y1 - y0), k.glass, T(p0[0], p0[1], p0[2], f.ry), 0xdcecee, 1);
      for (let i = 0; i <= 3; i++) { const q = at(-gw / 2 + gw * i / 3, (y0 + y1) / 2); add(new THREE.BoxGeometry(0.03, y1 - y0, 0.04), k.paint, T(q[0], q[1], q[2], f.ry), red, 1); }
      for (let j = 0; j <= 8; j++) { const q = at(0, y0 + (y1 - y0) * j / 8); add(new THREE.BoxGeometry(gw, 0.025, 0.04), k.paint, T(q[0], q[1], q[2], f.ry), red, j % 2 ? 2 : 1); }
    }
    // the door, swung open about the +z post to point along -x
    {
      const hx = P.x - 0.45, hz = P.z + 0.46, len = 0.78, y0 = FY + 0.2, y1 = FY + 2.15;
      box(hx - len, hx, y0, y1, hz - 0.02, hz + 0.02, k.paint, red, 1);
      add(new THREE.PlaneGeometry(len - 0.12, y1 - y0 - 0.5), k.glass, T(hx - len / 2, (y0 + y1) / 2 + 0.1, hz - 0.022, PI), 0xdcecee, 1);
      add(new THREE.PlaneGeometry(len - 0.12, y1 - y0 - 0.5), k.glass, T(hx - len / 2, (y0 + y1) / 2 + 0.1, hz + 0.022, 0), 0xdcecee, 2);
      for (let j = 0; j <= 7; j++) box(hx - len + 0.03, hx - 0.03, y0 + 0.3 + (y1 - y0 - 0.55) * j / 7, y0 + 0.3 + (y1 - y0 - 0.55) * j / 7 + 0.022, hz - 0.03, hz + 0.03, k.paint, red, 2);
      for (let i = 1; i < 3; i++) box(hx - len * i / 3 - 0.011, hx - len * i / 3 + 0.011, y0 + 0.3, y1 - 0.25, hz - 0.03, hz + 0.03, k.paint, red, 2);
      ball(0.025, hx - len + 0.1, (y0 + y1) / 2 - 0.1, hz - 0.045, k.brass, 0xc9a24e, 2, 1, 1, 0.7, 6);
    }
    // crown: lit panels, a shallow dome and a ring
    box(P.x - hw - 0.02, P.x + hw + 0.02, top - 0.34, top - 0.1, P.z - hw - 0.02, P.z + hw + 0.02, k.paint, red, 1);
    for (const f of [{ x: P.x - hw - 0.022, z: P.z, ry: -PI / 2 }, { x: P.x + hw + 0.022, z: P.z, ry: PI / 2 }, { x: P.x, z: P.z - hw - 0.022, ry: PI }, { x: P.x, z: P.z + hw + 0.022, ry: 0 }]) sign('telephone', 0.36, 0.09, f.x, top - 0.22, f.z, f.ry, 1);
    add(frustum([-0.5, 0.5, -0.5, 0.5], [-0.3, 0.3, -0.3, 0.3], 0, 0.09), k.paint, T(P.x, top - 0.1, P.z), red, 1);
    cyl(0.08, 0.05, top - 0.01, top + 0.03, P.x, P.z, k.paint, red, 2, 8);
    // inside: the payphone on the back wall, its shelf and a directory, a floor grating
    box(P.x + 0.22, P.x + 0.4, FY + 1.15, FY + 1.55, P.z - 0.085, P.z + 0.085, k.rubber, 0x1d1d1d, 1);
    box(P.x + 0.2, P.x + 0.22, FY + 1.3, FY + 1.5, P.z - 0.06, P.z + 0.06, k.steel, 0x9aa0a6, 2);
    box(P.x + 0.2, P.x + 0.4, FY + 1.05, FY + 1.065, P.z - 0.15, P.z + 0.15, k.wood, 0x6a4a30, 1);
    box(P.x + 0.24, P.x + 0.38, FY + 1.065, FY + 1.11, P.z - 0.09, P.z + 0.09, k.paper, 0xd8c88a, 2);
    box(P.x - 0.4, P.x + 0.4, FY + 0.2, FY + 0.215, P.z - 0.4, P.z + 0.4, k.iron, 0x262626, 2);
    M.glow && box(P.x - 0.3, P.x + 0.3, top - 0.43, top - 0.41, P.z - 0.3, P.z + 0.3, M.glow, 0xfff0d0, 2);
  }

  // --- bollards
  for (const [x, z] of S.BOLLARDS) {
    cyl(0.09, 0.08, PV, PV + 0.12, x, z, k.iron, 0x1f1f1f, 1, 10);
    cyl(0.07, 0.065, PV + 0.12, PV + 0.74, x, z, k.iron, 0x1f1f1f, 1, 10);
    cyl(0.072, 0.072, PV + 0.5, PV + 0.58, x, z, k.paint, 0xe8e8e0, 2, 10);
    ball(0.068, x, PV + 0.74, z, k.iron, 0x1f1f1f, 1, 1, 0.85, 1, 8);
  }

  // --- a bike leaning on a Sheffield stand
  {
    const B = S.BIKE, z = B.z + 0.3, cream = 0xe3d8b8;
    for (const sx of [-0.35, 0.35]) cyl(0.02, 0.02, PV, PV + 0.8, B.x + sx, B.z, k.steel, 0xa0a6ac, 1, 6);
    box(B.x - 0.37, B.x + 0.37, PV + 0.8, PV + 0.84, B.z - 0.02, B.z + 0.02, k.steel, 0xa0a6ac, 1);
    for (const wx of [-0.55, 0.55]) {
      add(new THREE.TorusGeometry(0.325, 0.016, 6, 20), k.rubber, T(B.x + wx, PV + 0.34, z), 0x1d1d1d, 1);
      add(new THREE.TorusGeometry(0.3, 0.006, 4, 20), k.steel, T(B.x + wx, PV + 0.34, z), 0xb8bdc2, 2);
      for (let a = 0; a < 6; a++) boxC(0.6, 0.003, 0.003, B.x + wx, PV + 0.34, z, 0, k.steel, 0xb8bdc2, 2, 0, a / 6 * PI);
    }
    const R = [B.x - 0.55, PV + 0.34, z], Q = [B.x - 0.1, PV + 0.62, z], F = [B.x + 0.55, PV + 0.34, z];
    rod(R, Q, 0.014, k.paint, cream, 1, 6); rod(Q, F, 0.014, k.paint, cream, 1, 6);
    rod([B.x + 0.5, PV + 0.4, z], [B.x + 0.46, PV + 1.0, z], 0.013, k.paint, cream, 1, 6);
    rod(Q, [B.x - 0.1, PV + 0.8, z], 0.012, k.steel, 0xa0a6ac, 2, 5);
    box(B.x - 0.24, B.x + 0.04, PV + 0.8, PV + 0.84, z - 0.07, z + 0.07, k.rubber, 0x4a2e1c, 1);
    box(B.x + 0.36, B.x + 0.56, PV + 1.0, PV + 1.014, z - 0.2, z + 0.2, k.steel, 0xa0a6ac, 1);
    box(B.x + 0.38, B.x + 0.62, PV + 0.72, PV + 0.95, z - 0.17, z + 0.17, k.wicker, 0xb89a62, 1);            // wicker basket on the bars
    for (let i = 0; i < 4; i++) ball(0.04, B.x + 0.5 + (i % 2) * 0.06 - 0.03, PV + 0.96, z - 0.1 + i * 0.07, k.petal, [0xe8c24a, 0xd96b8a, 0xf2f0e8, 0xc84b3a][i], 2, 1, 1, 1, 5);
    rod([B.x - 0.1, PV + 0.62, z + 0.03], [B.x - 0.1, PV + 0.62, z - 0.03], 0.02, k.steel, 0x8a8f94, 2, 6);
  }
  void ctx; void wk; void blob;
}

// ------------------------------------------------------------------ vehicles
function vehicles(H) {
  for (const c of S.CARS) car(H, c);
}
const lerpRect = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function car(H, c) {
  const { k, wk, M, add, T, frustum, rnd } = H;
  const K = S.CAR_KINDS[c.kind], root = T(c.x, FY, c.z, c.yaw);
  const put = (geo, mat, local, col, lod = 1) => add(geo, mat, root.clone().multiply(local), col, lod);
  const bx = (x0, x1, y0, y1, z0, z1, mat, col, lod = 1) => put(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), col, lod);
  const B = K.body, C = K.cab, hw = B.hw, x0 = B.x[0], x1 = B.x[1];
  const paint = c.colour, glass = wk.window;
  const kind = c.kind;
  const trim = 0xc9ced6;
  // ---- body shell and cabin
  if (kind === 'float') {
    bx(x0, x1, B.y[0], B.y[1], -hw, hw, k.paint, paint, 0);                                              // the chassis and flatbed
    bx(x0 - 0.02, 0.55, B.y[1], B.y[1] + 0.04, -hw - 0.03, hw + 0.03, k.paint, 0xd8d2c0, 1);
    bx(x0, 0.55, B.y[1] + 0.04, B.y[1] + 0.2, -hw, -hw + 0.03, k.paint, paint, 1);                          // low side boards
    bx(x0, 0.55, B.y[1] + 0.04, B.y[1] + 0.2, hw - 0.03, hw, k.paint, paint, 1);
    bx(x0, x0 + 0.03, B.y[1] + 0.04, B.y[1] + 0.2, -hw, hw, k.paint, paint, 1);
    put(frustum([C.bx[0], C.bx[1], -C.bhw, C.bhw], [C.tx[0], C.tx[1], -C.thw, C.thw], C.y[0], C.y[1]), k.paint, T(0, 0, 0), paint, 0);
    // big windscreen and side windows in the cab
    put(new THREE.BoxGeometry(0.02, 0.75, 1.36), glass, T(1.775, 1.475, 0, 0, 0, 0.12), 0xffffff, 1);
    for (const s of [-1, 1]) bx(0.75, 1.55, 1.1, 1.8, Math.min(s * 0.752, s * 0.772), Math.max(s * 0.752, s * 0.772), glass, 0xffffff, 1);
    bx(C.bx[0] - 0.0, C.bx[1] + 0.0, C.y[1] - 0.06, C.y[1] + 0.03, -C.thw - 0.03, C.thw + 0.03, k.paint, 0xd8d2c0, 1);                // roof
    // milk crates, two high, with a bottle top in each corner
    const crateCols = [0xd8a828, 0xcf9d20, 0xb83a2a];
    for (let i = 0; i < S.CRATES.x.length; i++) for (let j = 0; j < S.CRATES.z.length; j++) for (let l = 0; l < 2; l++) {
      const cx = S.CRATES.x[i], cz = S.CRATES.z[j], cy = S.CRATES.y0 + l * S.CRATES.h;
      bx(cx - 0.195, cx + 0.195, cy, cy + S.CRATES.h - 0.01, cz - 0.148, cz + 0.148, k.rubber, crateCols[(i + j + l) % 3], 1);
      if (l === 1) for (let a = 0; a < 3; a++) for (let b = 0; b < 4; b++) {
        const capCol = (i + j + a + b) % 5 === 0 ? 0x2a5aa8 : (i + a) % 3 === 0 ? 0xd8dce0 : 0xc8ccd0;
        put(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), k.ceramic, T(cx - 0.11 + a * 0.11, cy + S.CRATES.h + 0.02, cz - 0.1 + b * 0.067), (i + b) % 2 ? 0xf2f0e6 : capCol, 2);
      }
    }
    // headlamps, the front panel, a roof lamp
    for (const s of [-1, 1]) put(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), k.steel, T(x1 - 0.0, 0.55, s * 0.5, 0, 0, PI / 2), trim, 1);
    for (const s of [-1, 1]) put(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), M.glow, T(x1 + 0.01, 0.55, s * 0.5, 0, 0, PI / 2), 0xfff4d0, 1);
  } else {
    const roofTop = kind === 'landrover' ? 0xe8e4d8 : paint;
    // lower body: a loaf with its hood and tail sloping in a little
    const topRect = kind === 'landrover' ? [x0 + 0.02, x1 - 0.02, -hw + 0.02, hw - 0.02] : kind === 'saloon' ? [x0 + 0.18, x1 - 0.35, -hw + 0.08, hw - 0.08] : [x0 + 0.12, x1 - 0.32, -hw + 0.05, hw - 0.05];
    put(frustum([x0, x1, -hw, hw], topRect, B.y[0], B.y[1]), k.paint, T(0, 0, 0), paint, 0);
    // cabin: dark glass between a painted waist and a roof slab, with pillars
    const bot = [C.bx[0], C.bx[1], -C.bhw, C.bhw], top = [C.tx[0], C.tx[1], -C.thw, C.thw];
    put(frustum(lerpRect(bot, top, 0.0), lerpRect(bot, top, 0.86), C.y[0], C.y[0] + (C.y[1] - C.y[0]) * 0.86), glass, T(0, 0, 0), 0xffffff, 0);
    put(frustum(lerpRect(bot, top, 0.84), top, C.y[0] + (C.y[1] - C.y[0]) * 0.84, C.y[1]), k.paint, T(0, 0, 0), roofTop, 0);
    for (const sz of [-1, 1]) for (const f of [0, 1]) {
      const a = [bot[f] + 0, C.y[0], sz * C.bhw], b = [top[f], C.y[1] - 0.02, sz * C.thw];
      addRod(H, root, a, b, 0.03, k.paint, paint);
    }
    for (const sz of [-1, 1]) addRod(H, root, [(bot[0] + bot[1]) / 2 - 0.1, C.y[0], sz * (C.bhw + 0.002)], [(top[0] + top[1]) / 2 - 0.1, C.y[1] - 0.05, sz * (C.thw + 0.002)], 0.022, k.paint, paint);
    // door seams and handles
    for (const sz of [-1, 1]) {
      bx(-0.05, -0.04, B.y[0] + 0.1, C.y[1] - 0.12, sz * (hw + 0.0), sz * (hw + 0.004), k.rubber, 0x1c1c1c, 2);
      bx(0.62, 0.64, B.y[0] + 0.05, C.y[0] + 0.1, sz * (hw), sz * (hw + 0.004), k.rubber, 0x1c1c1c, 2);
      bx(-0.45, -0.3, B.y[1] - 0.06, B.y[1] - 0.04, sz * (hw + 0.004), sz * (hw + 0.02), k.steel, trim, 2);
      bx(0.55, 0.68, C.y[0] + 0.02, C.y[0] + 0.1, sz * (C.bhw + 0.004), sz * (C.bhw + 0.06), k.paint, paint, 2);
    }
    // bumpers, plates, lamps
    for (const [x, y] of [[x1, 0.3], [x0, 0.3]]) bx(x - 0.03, x + 0.07, y - 0.06, y + 0.05, -hw - 0.03, hw + 0.03, k.steel, trim, 1);
    bx(x1 + 0.0, x1 + 0.02, 0.33, 0.45, -0.25, 0.25, k.enamel, 0xf0eee6, 2);
    bx(x0 - 0.02, x0 + 0.0, 0.33, 0.45, -0.25, 0.25, k.enamel, 0xe0bc2a, 2);
    for (const s of [-1, 1]) {
      put(new THREE.CylinderGeometry(0.095, 0.095, 0.07, 12), k.steel, T(x1 - 0.02, B.y[1] - 0.2, s * (hw - 0.22), 0, 0, PI / 2), trim, 1);
      put(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 12), M.glow, T(x1 - 0.005, B.y[1] - 0.2, s * (hw - 0.22), 0, 0, PI / 2), 0xfff4d0, 1);
      bx(x0 - 0.02, x0 + 0.03, B.y[1] - 0.26, B.y[1] - 0.14, s * (hw - 0.33) - 0.1, s * (hw - 0.33) + 0.1, k.enamel, 0xb21e1a, 1);
    }
    bx(x1 - 0.02, x1 + 0.0, B.y[0] + 0.12, B.y[1] - 0.3, -0.3, 0.3, k.iron, 0x222222, 2);                  // grille
    if (kind === 'landrover') {
      // a roof rack of rails, a spare wheel on the tailgate, wheel-arch flares, side steps, snorkel
      for (const z of [-0.78, 0.78]) bx(-1.9, 0.5, C.y[1] + 0.01, C.y[1] + 0.05, z - 0.02, z + 0.02, k.steel, 0x2a2a2a, 1);
      for (let x = -1.8; x < 0.5; x += 0.45) bx(x - 0.02, x + 0.02, C.y[1] + 0.01, C.y[1] + 0.05, -0.8, 0.8, k.steel, 0x2a2a2a, 2);
      put(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 14), k.rubber, T(x0 - 0.1, 1.05, 0, 0, 0, PI / 2), 0x1d1d1d, 1);
      put(new THREE.CylinderGeometry(0.2, 0.2, 0.21, 10), k.steel, T(x0 - 0.1, 1.05, 0, 0, 0, PI / 2), 0xd8dce0, 2);
      for (const s of [-1, 1]) for (const [lx, r] of K.wheels) bx(lx - r - 0.1, lx + r + 0.1, B.y[0] + 0.25, B.y[0] + 0.3, s * (hw + 0.12) - 0.1, s * (hw + 0.12) + 0.1, k.rubber, 0x1d1d1d, 1);
      for (const s of [-1, 1]) bx(-0.5, 0.7, B.y[0] - 0.03, B.y[0] + 0.02, s * (hw + 0.1) - 0.08, s * (hw + 0.1) + 0.08, k.steel, 0x303030, 1);
      rod2(H, root, [0.72, 1.15, -0.9], [0.72, 2.3, -0.9], 0.03, 0x222222);
    } else {
      // rounded wings
      for (const s of [-1, 1]) for (const [lx] of K.wheels) {
        add(H.ctx.blobGeometry(0.34, 1, 5 + (lx > 0 ? 1 : 0), 0.04), k.paint, root.clone().multiply(T(lx, B.y[0] + 0.28, s * (hw - 0.04), 0, 0, 0, 1.15, 0.95, 0.4)), paint, 1);
      }
      if (kind === 'saloon') {
        bx(x1 - 0.1, x1 + 0.03, B.y[1] - 0.45, B.y[1] - 0.12, -0.28, 0.28, k.steel, trim, 1);              // chrome grille
        for (let i = 0; i < 6; i++) bx(x1 - 0.02, x1 + 0.04, B.y[1] - 0.43 + i * 0.05, B.y[1] - 0.41 + i * 0.05, -0.26, 0.26, k.iron, 0x303030, 2);
        bx(-0.3, 0.9, B.y[1] - 0.02, B.y[1] + 0.01, -0.01, 0.01, k.steel, trim, 2);
        for (const s of [-1, 1]) bx(-0.05, 0.05, B.y[0] + 0.03, B.y[0] + 0.08, s * (hw + 0.03) - 0.4, s * (hw + 0.03) + 0.4, k.steel, trim, 2);
      }
    }
  }
  // ---- wheels: tyres, hubs and a dark arch behind each
  for (const s of [-1, 1]) for (const [lx, r] of K.wheels) {
    const zc = s * (hw - 0.06);
    put(new THREE.CylinderGeometry(r, r, 0.2, 14), k.rubber, T(lx, r, zc, 0, PI / 2, 0), 0x1a1a1a, 1);
    put(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.205, 10), k.steel, T(lx, r, zc, 0, PI / 2, 0), kind === 'saloon' ? 0xd8dce0 : 0x9aa0a6, 1);
    put(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.22, 6), k.steel, T(lx, r, zc, 0, PI / 2, 0), 0xe8ecf0, 2);
    put(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.02, 14), k.rubber, T(lx, r + 0.02, s * (hw - 0.01), 0, PI / 2, 0), 0x0c0c0c, 2);
  }
  // ---- dirt and a little shine
  void rnd;
}
function addRod(H, root, a, b, r, mat, col) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
  H.add(new THREE.CylinderGeometry(r, r, len, 5, 1), mat, root.clone().multiply(m), col, 1);
}
function rod2(H, root, a, b, r, col) { addRod(H, root, a, b, r, H.k.iron, col); }

// ------------------------------------------------------------------ the parade: a two-storey terrace of shops with flats above
const FACADE = {
  hardware: { win: [[-18.9, -17.3], [-15.7, -13.4]], door: [-17.0, -16.0], fascia: 0x23324a, trim: 0xe8e2d0, stall: 0x2c4268, sign: 'hardware', roof: 0x727880, render: null },
  greengrocer: { win: [[-12.4, -10.1], [-8.6, -7.2]], door: [-9.9, -8.9], fascia: 0x35542f, trim: 0xe9e0c4, stall: 0x2f4a2b, sign: 'green', roof: 0x6a7078, render: null },
  tearoom: { fascia: 0x1f4a3a, trim: 0xf1e8cf, stall: 0x1f4a3a, sign: 'tearoom', roof: 0x7a8088, render: 0xe6d8bc },
  post: { win: [[4.6, 7.4], [7.8, 10.6]], door: [3.2, 4.2], fascia: 0xa8231f, trim: 0xf0e6cf, stall: 0x8a1c18, sign: 'post', roof: 0x6f757d, render: 0xe4d6bc },
  chemist: { win: [[12.8, 14.8]], door: [11.4, 12.4], fascia: 0xefece2, trim: 0x2d6a3e, stall: 0x2d6a3e, sign: 'chemist', roof: 0x747a82, render: 0xc4d4c6 },
  tolet: { win: [[17.0, 19.1]], door: [15.6, 16.6], fascia: 0x4d4a42, trim: 0xb8b09a, stall: 0x58544a, sign: 'tolet', roof: 0x6a7078, render: null },
};
const WS = PV + 0.55, WT = PV + 2.35;            // shop windows: sill and head
const REC = 0.45;                                // how far the shop windows and doors sit back

function parade(H) {
  const { ctx, k, wk, M, add, T, box, boxC, cyl, ball, blob, rod, plane, sign, rnd, leafyLow } = H;
  const z0 = BLD.z0, z1 = BLD.z1, eave = BLD.eave;
  const brick = (x0, x1, y0, y1, za, zb, col, lod = 0) => box(x0, x1, y0, y1, za, zb, wk.brick, col, lod, true);
  const paint = (x0, x1, y0, y1, za, zb, col, lod = 1) => box(x0, x1, y0, y1, za, zb, k.paint, col, lod);

  for (const u of S.UNITS) {
    const F = FACADE[u.id], solid = u.id !== 'tearoom';
    const wins = F.win || [], door = F.door;
    // --- masonry
    if (solid) {
      brick(u.x0, u.x1, FY, WT, z0 + REC, z1, u.brick, 0);
      brick(u.x0, u.x1, WT, eave, z0, z1, u.brick, 0);
      const opens = [...wins.map((w) => ({ a: w[0], b: w[1], win: true })), { a: door[0], b: door[1], door: true }].sort((p, q) => p.a - q.a);
      let prev = u.x0;
      for (const o of opens) {
        if (o.a > prev) brick(prev, o.a, FY, WT, z0, z0 + REC, u.brick, 1);
        if (o.win) brick(o.a, o.b, FY, WS, z0, z0 + REC, u.brick, 1);
        if (o.door) brick(o.a, o.b, PV + 2.15, WT, z0, z0 + REC, u.brick, 1);
        prev = o.b;
      }
      if (prev < u.x1) brick(prev, u.x1, FY, WT, z0, z0 + REC, u.brick, 1);
    } else {
      brick(u.x0, u.x1, BLD.ceil, eave, z0, z1, u.brick, 0);     // the flat above the tea room; the room below is built in teaRoom()
    }
    if (F.render) paint(u.x0, u.x1, PV + 3.2, eave, z0 - 0.025, z0, F.render, 1);
    // --- shopfront: pilasters, fascia and its sign, cornice, stallriser panels
    paint(u.x0, u.x0 + 0.22, FY, PV + 3.05, z0 - 0.12, z0, F.trim, 1);
    paint(u.x1 - 0.22, u.x1, FY, PV + 3.05, z0 - 0.12, z0, F.trim, 1);
    for (const x of [u.x0 + 0.11, u.x1 - 0.11]) { paint(x - 0.15, x + 0.15, PV + 2.95, PV + 3.07, z0 - 0.15, z0 - 0.02, F.trim, 1); paint(x - 0.15, x + 0.15, PV, PV + 0.14, z0 - 0.15, z0 - 0.02, F.trim, 1); }
    paint(u.x0 + 0.22, u.x1 - 0.22, PV + 2.4, PV + 3.02, z0 - 0.09, z0, F.fascia, 0);
    const sw = Math.min(4.4, u.x1 - u.x0 - 0.7);
    sign(F.sign, sw, sw / 8, (u.x0 + u.x1) / 2, PV + 2.71, z0 - 0.0925, PI, 1);
    paint(u.x0 + 0.22, u.x1 - 0.22, PV + 2.4, PV + 2.44, z0 - 0.1, z0 - 0.085, F.trim, 2);
    paint(u.x0 + 0.22, u.x1 - 0.22, PV + 2.99, PV + 3.03, z0 - 0.1, z0 - 0.085, F.trim, 2);
    box(u.x0, u.x1, PV + 3.07, PV + 3.2, z0 - 0.17, z0 - 0.02, k.stone, 0xcfc9b8, 1, true);
    box(u.x0, u.x1, PV + 3.2, PV + 3.25, z0 - 0.12, z0 - 0.02, k.stone, 0xc4bead, 2, true);
    if (solid) {
      let prev = u.x0 + 0.22;
      const opens = [...wins.map((w) => [w[0], w[1]]), door].sort((p, q) => p[0] - q[0]);
      for (const [a, b] of opens) { if (a - prev > 0.05 && a > prev + 0.3) paint(prev, a, PV, PV + 0.55, z0 - 0.04, z0, F.stall, 1); prev = b; }
      // windows
      for (const [a, b] of wins) shopWindow(H, u, F, a, b);
      shopDoor(H, u, F, door[0], door[1]);
    }
    // --- flats above: sash windows with curtains, boxes of flowers, a few lit
    {
      const W = u.x1 - u.x0, n = Math.max(2, Math.round(W / 2.3));
      for (let i = 0; i < n; i++) {
        const x = u.x0 + W * (i + 0.5) / n, ry = PI;
        windowAt(ctx, { x, y: FY + 4.05, z: z0 - 0.001, ry, w: 1.05, h: 1.55, style: 'sash', bars: 3, trim: 0xf1ede4, curtains: rnd() < 0.8 });
        if (rnd() < 0.45) {
          box(x - 0.55, x + 0.55, FY + 3.88, FY + 4.04, z0 - 0.2, z0 - 0.02, k.wood, 0x6a8a5c, 1);
          for (let f = 0; f < 6; f++) blob(0.09, x - 0.45 + f * 0.18, FY + 4.1, z0 - 0.12, leafyLow, [0xb8283a, 0xd96b8a, 0xf2f0e8, 0x8a5aa8][f % 4], 2, f + Math.round(x), 1, 0.8, 1);
        }
      }
    }
  }
  // --- first-floor string course, and a faded painted advert on the end wall
  box(BLD.x0, BLD.x1, FY + 3.35, FY + 3.45, z0 - 0.03, z0, k.stone, 0xcfc9b8, 1, true);
  // --- drainpipes down the party walls
  for (const x of [-12.8, -6.8, 2.6, 11.0, 15.2]) {
    cyl(0.04, 0.04, PV + 0.15, eave - 0.1, x + 0.0, z0 - 0.2, k.iron, 0x23282a, 1, 8);
    for (const y of [0.8, 1.8, 2.8, 3.8, 4.8]) cyl(0.05, 0.05, PV + y, PV + y + 0.04, x, z0 - 0.2, k.iron, 0x23282a, 2, 8);
    box(x - 0.1, x + 0.1, eave - 0.45, eave - 0.1, z0 - 0.3, z0 - 0.12, k.iron, 0x23282a, 1);
  }
  // --- the roof: slate in a different shade over each unit, gutters, gables, chimneys with pots and an aerial
  {
    const slabs = roofSlabs(S.ROOF), ey = slabs[0].eaveY, ov = S.ROOF.overhang;
    for (const r of slabs) {
      for (const u of S.UNITS) {
        const xa = u.x0 - (u.x0 <= BLD.x0 + 0.01 ? ov * 0.6 : 0), xb = u.x1 + (u.x1 >= BLD.x1 - 0.01 ? ov * 0.6 : 0);
        const m = new THREE.Matrix4().compose(new THREE.Vector3((xa + xb) / 2, r.cy, r.cz), r.quat, new THREE.Vector3(1, 1, 1));
        add(H.boxUV(xb - xa, 0.06, r.hz * 2, 1), wk.roof, m, FACADE[u.id].roof, 0);
      }
    }
    const len = BLD.x1 - BLD.x0 + ov * 1.2;
    for (const side of [-1, 1]) {
      const e = side < 0 ? z0 - ov : z1 + ov;
      add(new THREE.BoxGeometry(len, 0.16, 0.025), k.paint, T(0, ey - 0.06, e), 0xf1ede4, 1);
      add(new THREE.CylinderGeometry(0.05, 0.05, len, 10, 1, true, 0, PI), k.paint, T(0, ey - 0.12, e + side * 0.06, 0, 0, PI / 2), 0x2d3033, 1);
      add(new THREE.BoxGeometry(len, 0.02, ov), k.paint, T(0, ey - 0.13, side < 0 ? z0 - ov / 2 : z1 + ov / 2), 0xf1ede4, 1);
    }
    // ridge cap
    add(new THREE.BoxGeometry(len - 0.4, 0.07, 0.16), wk.roof, T(0, BLD.ridgeY + 0.03, (z0 + z1) / 2), 0x5e636a, 1);
    // gable ends
    for (const g of gables(S.ROOF)) {
      const left = g[0][0] === BLD.x0, shape = new THREE.Shape();
      shape.moveTo(-z0, eave); shape.lineTo(-z1, eave); shape.lineTo(-(z0 + z1) / 2, BLD.ridgeY); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
      geo.rotateY(PI / 2);
      geo.translate(left ? BLD.x0 : BLD.x1 - 0.25, 0, 0);
      add(geo, wk.brick, null, 0xd2bcaa, 0);
    }
    // chimneys
    let ci = 0;
    for (const c of chimneys(S.ROOF)) {
      const h = c.top - c.y0 + 0.6;
      add(H.boxUV(c.hx * 2, h, c.hz * 2, 1), wk.brick, T(c.cx, c.top - h / 2, c.cz), ci % 2 ? 0xd8b8a0 : 0xffffff, 0);
      add(new THREE.BoxGeometry(c.hx * 2 + 0.08, 0.07, c.hz * 2 + 0.08), k.stone, T(c.cx, c.top - 0.035, c.cz), 0xcfc6b4, 1);
      box(c.cx - c.hx - 0.02, c.cx + c.hx + 0.02, c.top - 0.55, c.top - 0.5, c.cz - c.hz - 0.02, c.cz + c.hz + 0.02, k.stone, 0xb8b1a2, 2);
      const n = 3 + (ci % 2);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5, px = c.cx + t * (c.hx * 2 - 0.15);
        cyl(0.075, 0.062, c.top, c.top + 0.34, px, c.cz, k.terracotta, [0xb8643f, 0xa85a38, 0xc07048][(i + ci) % 3], 1, 10);
        cyl(0.085, 0.085, c.top + 0.3, c.top + 0.36, px, c.cz, k.terracotta, 0xb8643f, 2, 10);
      }
      if (ci === 2) {                                                  // a television aerial on the stack
        rod([c.cx - 0.2, c.top, c.cz], [c.cx - 0.2, c.top + 1.6, c.cz], 0.014, k.steel, 0x9aa0a6, 1, 5);
        for (let j = 0; j < 5; j++) boxC(0.5 - j * 0.07, 0.012, 0.012, c.cx - 0.2, c.top + 0.7 + j * 0.2, c.cz, 0, k.steel, 0x9aa0a6, 2);
      }
      ci++;
    }
    // a satellite dish on the back, flashing down the party walls
    add(new THREE.SphereGeometry(0.28, 10, 6, 0, PI * 2, 0, 0.9), k.paint, T(6.5, 4.4, z1 + 0.25, 0, -0.9), 0xe8e4dc, 1);
    rod([6.5, 4.0, z1 + 0.05], [6.5, 4.4, z1 + 0.25], 0.012, k.steel, 0x9aa0a6, 2, 5);
  }
  // --- hanging baskets with their brackets
  for (const x of S.HANGING_BASKETS) {
    const y = FY + 2.3, z = z0 - 0.4;
    rod([x, y + 0.32, z0 - 0.03], [x, y + 0.32, z], 0.012, k.iron, 0x222222, 2, 5);
    rod([x, y + 0.12, z0 - 0.03], [x, y + 0.32, z - 0.02], 0.01, k.iron, 0x222222, 2, 5);
    ball(0.17, x, y, z, k.iron, 0x3a3a3a, 2, 1, 0.55, 1, 8);
    blob(0.2, x, y + 0.06, z, leafyLow, 0x5f8a4c, 1, Math.round(x * 11), 1, 0.8, 1);
    for (let i = 0; i < 11; i++) { const a = rnd() * PI * 2, rr = 0.1 + rnd() * 0.12; ball(0.04, x + Math.cos(a) * rr, y + 0.1 + rnd() * 0.08, z + Math.sin(a) * rr, k.petal, [0xd23a8a, 0x8a5aa8, 0xf2f0e8, 0xd24a3a, 0xe8c24a][i % 5], 2, 1, 1, 1, 5); }
    for (const s of [-1, 1]) rod([x + s * 0.14, y + 0.03, z], [x, y + 0.3, z], 0.004, k.iron, 0x222222, 2, 4);
    rod([x, y + 0.03, z + 0.14], [x, y + 0.3, z], 0.004, k.iron, 0x222222, 2, 4);
    for (let i = 0; i < 4; i++) blob(0.05, x + (i - 1.5) * 0.08, y - 0.12 - (i % 2) * 0.05, z + 0.1, leafyLow, 0x4f7a42, 2, i + Math.round(x), 0.6, 1.4, 0.6);
  }
  // --- hanging signs on iron brackets
  for (const [x, name, y] of [[-6.8, 'bladeTea', 3.0], [2.6, 'bladePost', 3.0], [11.0, 'bladeChem', 3.0]]) {
    const yy = FY + y, z = z0 - 0.4;
    rod([x, yy + 0.32, z0 - 0.02], [x, yy + 0.32, z0 - 0.78], 0.014, k.iron, 0x202020, 1, 5);
    rod([x, yy + 0.1, z0 - 0.02], [x, yy + 0.32, z0 - 0.5], 0.012, k.iron, 0x202020, 2, 5);
    for (const s of [-1, 1]) {
      sign(name, 0.56, 0.56, x + s * 0.022, yy, z, s * PI / 2, 1);
      for (const dz of [-0.28, 0.28]) rod([x + s * 0.02, yy + 0.28, z + dz], [x + s * 0.02, yy + 0.32, z + dz], 0.004, k.iron, 0x202020, 2, 4);
    }
    box(x - 0.02, x + 0.02, yy - 0.28, yy + 0.28, z - 0.285, z + 0.285, k.paint, 0xf3ead4, 2);
  }
  // --- bunting along the parade
  {
    const BU = S.BUNTING, cols = [0xb8283a, 0xe8c24a, 0x2f6aa6, 0xf2f0e8, 0x3f8a5a, 0xd96b8a];
    for (let i = 0; i < BU.hooks.length; i++) {
      const x = BU.hooks[i];
      rod([x, BU.y, z0 - 0.02], [x, BU.y, BU.z], 0.012, k.iron, 0x303030, 2, 4);
    }
    let fi = 0;
    for (let i = 0; i + 1 < BU.hooks.length; i++) {
      const a = BU.hooks[i], b = BU.hooks[i + 1];
      let prev = [a, BU.y, BU.z];
      for (let s = 1; s <= 12; s++) {
        const t = s / 12, p = [a + (b - a) * t, BU.y - BU.sag * 4 * t * (1 - t), BU.z];
        rod(prev, p, 0.005, k.rubber, 0xd8d0b8, 2, 4);
        prev = p;
      }
      const n = Math.floor((b - a) / 0.3);
      for (let f = 0; f < n; f++) {
        const t = (f + 0.5) / n, x = a + (b - a) * t, y = BU.y - BU.sag * 4 * t * (1 - t);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, 0, -0.2, 0], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        g.computeVertexNormals();
        add(g, k.leaf, T(x, y, BU.z + (f % 2) * 0.01, (rnd() - 0.5) * 0.3), cols[fi++ % cols.length], 2);
      }
    }
  }
}

// A shop window: stone sill, painted frame with a transom, glass in front of a lit backdrop and the display.
function shopWindow(H, u, F, a, b) {
  const { k, wk, M, box, boxC, cyl, ball, blob, plane, rnd } = H;
  const z0 = BLD.z0, w = b - a, cx = (a + b) / 2, trim = F.trim;
  box(a - 0.06, b + 0.06, WS - 0.05, WS + 0.02, z0 - 0.1, z0 + 0.12, k.stone, 0xcfc9b8, 1, true);                       // sill
  box(a, b, WS + 0.02, WS + 0.06, z0 + 0.04, REC + z0 - 0.02, k.wood, F.stall, 1);                                       // display floor
  box(a, b, WS + 0.06, WT, z0 + REC - 0.04, z0 + REC - 0.02, M.glow, 0xf2e2bc, 1);                                      // the lit backdrop
  plane(w, WT - WS, cx, (WS + WT) / 2, z0 + 0.03, PI, k.glass, 0xdfeaec, 1);
  for (const x of [a, b]) box(x - 0.035, x + 0.035, WS, WT, z0 - 0.02, z0 + 0.07, k.paint, trim, 1);
  box(a, b, WT - 0.07, WT, z0 - 0.02, z0 + 0.07, k.paint, trim, 1);
  box(a, b, WS, WS + 0.06, z0 - 0.02, z0 + 0.07, k.paint, trim, 1);
  box(a, b, PV + 1.95, PV + 2.0, z0 - 0.01, z0 + 0.06, k.paint, trim, 2);
  const n = Math.max(0, Math.round(w / 1.2) - 1);
  for (let i = 1; i <= n; i++) { const x = a + w * i / (n + 1); box(x - 0.02, x + 0.02, WS, WT, z0 - 0.01, z0 + 0.06, k.paint, trim, 2); }
  // a gold name on the glass and a hand-written offers card
  display(H, u.id, a, b);
  void wk; void boxC; void cyl; void ball; void blob; void rnd;
}

function shopDoor(H, u, F, a, b) {
  const { k, M, box, ball, plane } = H;
  const z0 = BLD.z0, zz = z0 + REC - 0.1, col = u.id === 'tolet' ? 0x6a6252 : { hardware: 0x23324a, greengrocer: 0x35542f, post: 0x8a1c18, chemist: 0x2d6a3e }[u.id];
  box(a, b, PV, PV + 2.15, zz, zz + 0.05, k.paint, col, 1);
  for (const x of [a, b]) box(x - 0.05, x + 0.05, PV, PV + 2.15, z0 + 0.02, z0 + REC, k.paint, F.trim, 1);
  box(a, b, PV, PV + 0.02, z0 + 0.02, zz + 0.05, k.stone, 0xb8b2a2, 1);
  if (u.id !== 'tolet') {
    plane(b - a - 0.3, 1.0, (a + b) / 2, PV + 1.45, zz - 0.003, PI, M.glow, 0xdfd2b0, 1);
    for (let j = 0; j < 3; j++) box(a + 0.1, b - 0.1, PV + 1.0 + j * 0.34 + 0.16, PV + 1.0 + j * 0.34 + 0.18, zz - 0.012, zz, k.paint, col, 2);
    box(a + 0.15, b - 0.15, PV + 0.15, PV + 0.85, zz - 0.012, zz, k.paint, col, 2);
    box((a + b) / 2 - 0.11, (a + b) / 2 + 0.11, PV + 0.98, PV + 1.06, zz - 0.012, zz, k.brass, 0xc9a24e, 2);        // letter plate
    box((a + b) / 2 - 0.1, (a + b) / 2 + 0.1, PV + 1.9, PV + 2.12, zz - 0.012, zz - 0.002, k.paper, 0xf2ead2, 2); // a small OPEN card
  } else {
    box(a + 0.04, b - 0.04, PV + 0.05, PV + 2.1, zz - 0.02, zz, k.wood, 0x9a8a68, 1);                              // plywood over the door
    box(a + 0.04, b - 0.04, PV + 1.0, PV + 1.06, zz - 0.03, zz - 0.02, k.wood, 0x7a6a4c, 2);
  }
  ball(0.035, b - 0.12, PV + 1.0, zz - 0.04, k.brass, 0xc9a24e, 2, 1, 1, 1, 6);
  void plane;
}

// What is in each shop window (sits on the display floor, behind the glass).
function display(H, id, a, b) {
  const { k, M, box, boxC, cyl, ball, blob, plane, rod, add, T } = H;
  const z0 = BLD.z0, zc = z0 + 0.24, y0 = WS + 0.06, rnd = mulberry(Math.round(a * 100));
  const tin = [0xb8283a, 0x2f6aa6, 0xe8c24a, 0x3f8a5a, 0xf2f0e8, 0x7a4a9a, 0xd96b2a];
  if (id === 'hardware') {
    if (b - a < 2) {
      for (let r = 0; r < 3; r++) {
        box(a + 0.05, b - 0.05, y0 + r * 0.55 + 0.4, y0 + r * 0.55 + 0.43, z0 + 0.1, z0 + REC - 0.06, k.wood, 0xc8b898, 2);
        for (let i = 0; i < 7; i++) {
          const x = a + 0.15 + i * (b - a - 0.3) / 6;
          if (r === 0) { cyl(0.07, 0.07, y0 + r * 0.55 + 0.43, y0 + r * 0.55 + 0.56, x, zc, k.steel, tin[(i + r) % tin.length], 2, 10); cyl(0.07, 0.07, y0 + r * 0.55 + 0.56, y0 + r * 0.55 + 0.7, x, zc + 0.05, k.steel, tin[(i + r + 2) % tin.length], 2, 10); }
          else if (r === 1) { cyl(0.05, 0.07, y0 + r * 0.55 + 0.43, y0 + r * 0.55 + 0.56, x, zc, k.terracotta, 0xb8643f, 2, 8); }
          else { cyl(0.07, 0.07, y0 + r * 0.55 + 0.43, y0 + r * 0.55 + 0.6, x, zc, k.zinc, 0xaab0b4, 2, 10); rod([x + 0.07, y0 + r * 0.55 + 0.5, zc], [x + 0.17, y0 + r * 0.55 + 0.6, zc], 0.012, k.zinc, 0xaab0b4, 2, 5); }
        }
      }
      for (let i = 0; i < 6; i++) cyl(0.085, 0.085, y0, y0 + 0.2, a + 0.18 + i * (b - a - 0.3) / 5, zc, k.steel, tin[i % tin.length], 2, 10);
    } else {
      box(a + 0.05, b - 0.05, y0 + 0.3, y0 + 1.75, z0 + REC - 0.08, z0 + REC - 0.06, k.wood, 0xb8a888, 2);          // pegboard
      for (let i = 0; i < 9; i++) {
        const x = a + 0.2 + i * (b - a - 0.4) / 8, hY = y0 + 1.0 + (i % 3) * 0.2;
        rod([x, hY - 0.35, zc + 0.12], [x, hY + 0.1, zc + 0.12], 0.012, k.wood, 0x9a6a3a, 2, 5);
        box(x - 0.05, x + 0.05, hY + 0.1, hY + 0.17, zc + 0.1, zc + 0.14, k.steel, 0x8a9096, 2);
      }
      for (let i = 0; i < 5; i++) cyl(0.17 - i * 0.004, 0.14, y0 + i * 0.16, y0 + i * 0.16 + 0.22, b - 0.35, zc, k.zinc, 0x9aa0a4, 2, 10);
      add(new THREE.TorusGeometry(0.14, 0.035, 6, 14), k.fabric, T(a + 0.4, y0 + 0.05, zc, 0, PI / 2), 0xc8b078, 2);
      for (let i = 0; i < 5; i++) cyl(0.04, 0.04, y0, y0 + 0.14, a + 0.9 + i * 0.12, zc + 0.05, k.steel, tin[i], 2, 8);
    }
  } else if (id === 'greengrocer') {
    box(a + 0.05, b - 0.05, y0, y0 + 0.4, z0 + 0.12, z0 + REC - 0.1, k.wood, 0xa88a5a, 2);
    for (let i = 0; i < Math.floor((b - a) / 0.2); i++) {
      const x = a + 0.15 + i * 0.2, c = [0xb8283a, 0x6a9a3a, 0xe8a42a, 0xd8c040, 0x8a1c28][(i + Math.round(a)) % 5];
      ball(0.08, x, y0 + 0.47, zc - 0.05 + (i % 2) * 0.1, k.leaf, c, 2, 1, 1, 1, 6);
      if (i % 3 === 0) ball(0.11, x + 0.05, y0 + 0.5, zc + 0.12, k.leaf, 0x5a8a3a, 2, 1, 0.9, 1, 7);
    }
    plane(0.5, 0.4, b - 0.4, y0 + 0.75, z0 + 0.3, PI, k.paper, 0x23302a, 2, -0.1);
    for (let j = 0; j < 4; j++) box(b - 0.62, b - 0.2 - (j % 2) * 0.1, y0 + 0.86 - j * 0.09, y0 + 0.875 - j * 0.09, z0 + 0.292, z0 + 0.296, k.paper, 0xe8e4d0, 2);
    box(a + 0.1, b - 0.1, y0 + 0.9, y0 + 0.93, z0 + 0.1, z0 + REC - 0.06, k.wood, 0xa88a5a, 2);
    for (let i = 0; i < 6; i++) ball(0.1, a + 0.2 + i * (b - a - 0.4) / 5, y0 + 1.04, zc, k.petal, [0xe8789a, 0xe8c24a, 0xf2f0e8][i % 3], 2, 1, 1, 1, 6);
  } else if (id === 'post') {
    for (let r = 0; r < 3; r++) for (let i = 0; i < Math.floor((b - a) / 0.2); i++) {
      const c = [0xf2d8d8, 0xd8e8f2, 0xf2ecc8, 0xd8f0d8, 0xe8d0f0, 0xf2f0e8][(i * 7 + r * 3) % 6];
      plane(0.13, 0.18, a + 0.2 + i * 0.2, y0 + 1.05 + r * 0.24, z0 + REC - 0.075, PI, k.paper, c, 2);
    }
    box(a + 0.05, b - 0.05, y0, y0 + 0.62, z0 + 0.14, z0 + REC - 0.1, k.wood, 0x9a7a52, 2);
    for (let i = 0; i < Math.floor((b - a) / 0.22); i++) {
      const x = a + 0.2 + i * 0.22, c = [0xe8d0c0, 0xd0e0e8, 0xf0e8b8, 0xe0c8d8][i % 4];
      plane(0.18, 0.26, x, y0 + 0.78, z0 + 0.16, PI, k.paper, c, 2, -0.22);
      box(x - 0.07, x + 0.07, y0 + 0.74, y0 + 0.75, z0 + 0.158, z0 + 0.162, k.paper, 0x222222, 2);
    }
    for (let i = 0; i < 6; i++) { ball(0.07, a + 0.2 + i * (b - a - 0.4) / 5, y0 + 0.1, zc + 0.05, k.fabric, [0xc9884a, 0xd96b8a, 0x6a8ac8, 0xe8c24a, 0x8a5a3a, 0xf2f0e8][i], 2, 1, 1.1, 1, 7); }
    box(b - 0.55, b - 0.1, y0 + 1.5, y0 + 1.7, z0 + REC - 0.08, z0 + REC - 0.06, k.paper, 0xe8c42a, 2);
  } else if (id === 'chemist') {
    for (let r = 0; r < 4; r++) {
      box(a + 0.05, b - 0.05, y0 + r * 0.42 + 0.3, y0 + r * 0.42 + 0.32, z0 + 0.1, z0 + REC - 0.06, k.paint, 0xf0eee6, 2);
      for (let i = 0; i < 9; i++) {
        const x = a + 0.12 + i * (b - a - 0.24) / 8, h = 0.1 + ((i * 5 + r * 3) % 4) * 0.025, c = [0xc8e0f0, 0xf0d8a8, 0xd8f0d0, 0xf0c8d0, 0xf2f0e8, 0x2d6a3e][(i + r * 2) % 6];
        cyl(0.03, 0.03, y0 + r * 0.42 + 0.32, y0 + r * 0.42 + 0.32 + h, x, zc, k.ceramic, c, 2, 8);
        cyl(0.02, 0.02, y0 + r * 0.42 + 0.32 + h, y0 + r * 0.42 + 0.32 + h + 0.03, x, zc, k.paint, 0xf2f0e8, 2, 6);
      }
    }
    ball(0.16, (a + b) / 2, y0 + 0.17, zc + 0.05, k.ceramic, 0xf2f0e8, 2, 1.2, 1, 1.2, 9);          // the big mortar
  } else if (id === 'tolet') {
    plane(b - a - 0.1, WT - WS - 0.1, (a + b) / 2, (WS + WT) / 2, z0 + REC - 0.06, PI, k.paper, 0xd8cfb4, 1);          // papered over
    box((a + b) / 2 - 0.5, (a + b) / 2 + 0.5, WS + 0.7, WS + 1.3, z0 + REC - 0.1, z0 + REC - 0.08, k.paper, 0xe8e4d8, 1);
    box((a + b) / 2 - 0.46, (a + b) / 2 + 0.46, WS + 0.74, WS + 1.26, z0 + REC - 0.11, z0 + REC - 0.1, k.paint, 0xb8281e, 1);
    box((a + b) / 2 - 0.3, (a + b) / 2 + 0.3, WS + 0.93, WS + 1.07, z0 + REC - 0.115, z0 + REC - 0.11, k.paper, 0xf2f0e8, 1);
    for (let i = 0; i < 12; i++) plane(0.2 + rnd() * 0.2, 0.3, a + 0.2 + rnd() * (b - a - 0.4), WS + 0.2 + rnd() * 1.4, z0 + REC - 0.065, PI, k.paper, [0xe8e4d8, 0xd8d0bc][i % 2], 2, 0);
  }
  void blob; void M;
}

// ------------------------------------------------------------------ small crockery and furniture used in several places
function placeAt(H, x, y, z, yaw) {
  const root = H.T(x, y, z, yaw);
  return (geo, mat, local, col, lod = 1) => H.add(geo, mat, root.clone().multiply(local), col, lod);
}
// A decorative cup and saucer standing at (x, y, z) (y = the surface).
function crockery(H, x, y, z, glaze = 0xf2ece0, rim = 0x3f6aa6) {
  const { k, add, T } = H;
  add(new THREE.CylinderGeometry(0.07, 0.055, 0.012, 12), k.ceramic, T(x, y + 0.006, z), glaze, 2);
  add(new THREE.CylinderGeometry(0.047, 0.032, 0.06, 12), k.ceramic, T(x, y + 0.042, z), glaze, 2);
  add(new THREE.TorusGeometry(0.047, 0.003, 4, 12), k.ceramic, T(x, y + 0.071, z, 0, PI / 2), rim, 2);
  add(new THREE.TorusGeometry(0.018, 0.005, 5, 8, PI), k.ceramic, T(x + 0.05, y + 0.045, z, 0, 0, -PI / 2), glaze, 2);
}
function teapot(H, x, y, z, col = 0xc9684a) {
  const { k, add, T } = H;
  add(new THREE.SphereGeometry(0.075, 10, 7), k.ceramic, T(x, y + 0.075, z, 0, 0, 0, 1, 0.85, 1), col, 2);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), k.ceramic, T(x, y + 0.145, z), col, 2);
  add(new THREE.SphereGeometry(0.014, 6, 5), k.ceramic, T(x, y + 0.165, z), col, 2);
  add(new THREE.CylinderGeometry(0.012, 0.02, 0.1, 6), k.ceramic, T(x + 0.1, y + 0.1, z, 0, 0, -0.9), col, 2);
  add(new THREE.TorusGeometry(0.04, 0.007, 5, 8, PI), k.ceramic, T(x - 0.08, y + 0.085, z, 0, 0, PI / 2), col, 2);
}
function cakeStand(H, x, y, z) {
  const { k, add, T, cyl } = H;
  cyl(0.004, 0.004, y, y + 0.36, x, z, k.steel, 0xd8dce0, 2, 5);
  [[0.0, 0.14, 0xf4efe2], [0.17, 0.11, 0xf4efe2], [0.31, 0.08, 0xf4efe2]].forEach(([dy, r, c], i) => {
    add(new THREE.CylinderGeometry(r, r, 0.008, 14), k.ceramic, T(x, y + 0.03 + dy, z), c, 2);
    const cc = [[0xd9a05a, 0xf0d8a0, 0xb8283a], [0xe8a0b0, 0x7a4a2a, 0xf0e8d0], [0xf0e8d0, 0xd9a05a, 0xb8283a]][i];
    for (let j = 0; j < 3 + (2 - i); j++) {
      const a = j / (3 + (2 - i)) * PI * 2, rr = r * 0.55;
      add(new THREE.CylinderGeometry(0.035, 0.037, 0.045, 8), k.paper, T(x + Math.cos(a) * rr, y + 0.058 + dy, z + Math.sin(a) * rr), cc[j % 3], 2);
      add(new THREE.SphereGeometry(0.036, 7, 4, 0, PI * 2, 0, PI / 2), k.paper, T(x + Math.cos(a) * rr, y + 0.08 + dy, z + Math.sin(a) * rr), cc[(j + 1) % 3], 2);
    }
  });
}
// Chairs from the chair kit: bentwood with a red cushion inside the tea room, painted bistro chairs outside.
let chairSeed = 0;
function chair(H, x, base, z, yaw, col, cafe = false) {
  const { k } = H, mx = H.T(x, base, z, yaw);
  const pal = cafe ? { frame: ['wood', col], cane: ['wicker', 0xd6b47c], pad: ['fabric', 0x9a3a3a] } : { frame: ['paint', col], foot: ['rubber', 0x2a2a28] };
  placeChair(cafe ? 'bentwood' : 'bistro', pal, (g, key, c, lod) => H.add(g, k[key], mx, c, lod), { lite: H.ctx.lite, seed: 31 + chairSeed++ });
}
function roundTable(H, x, base, z, col, cloth = null) {
  const { k, cyl } = H;
  cyl(0.2, 0.18, base, base + 0.025, x, z, k.iron, 0x2a2a2a, 1, 12);
  cyl(0.04, 0.03, base + 0.02, base + 0.71, x, z, k.iron, 0x2a2a2a, 1, 8);
  cyl(0.36, 0.36, base + 0.71, base + 0.74, x, z, k.paint, col, 1, 16);
  if (cloth) cyl(0.37, 0.37, base + 0.74, base + 0.745, x, z, k.fabric, cloth, 2, 16);
}

// ------------------------------------------------------------------ the tea room
function teaRoom(H) {
  const { ctx, k, wk, M, add, T, box, boxC, cyl, ball, blob, rod, plane, sign, rnd } = H;
  const z0 = BLD.z0, z1 = BLD.z1, C = BLD.ceil, fl = PV, I = TR.in;
  const cream = 0xeee2c6, green = 0x2e5a48;
  const wall = (x0, x1, y0, y1, za, zb, lod = 1) => box(x0, x1, y0, y1, za, zb, k.paint, cream, lod);
  const upper = BLD.eave;
  void upper;
  // --- shell: front wall in pieces round the bay, the door and the window; side walls; back wall with an open door and window
  const fz = z0 + 0.2, bz = z1 - 0.2;
  const b = TR.bay, win = TR.window, door = TR.door, bd = TR.backDoor, bw = TR.backWindow;
  wall(TR.x0, b.x0, FY, C, z0, fz, 0);
  wall(b.x0, b.x1, FY, WS, z0, fz); wall(b.x0, b.x1, fl + 2.45, C, z0, fz);
  wall(b.x1, door[0], FY, C, z0, fz, 0);
  wall(door[0], door[1], fl + door[2], C, z0, fz);
  wall(door[1], win.x0, FY, C, z0, fz, 0);
  wall(win.x0, win.x1, FY, fl + win.y0, z0, fz); wall(win.x0, win.x1, fl + win.y1, C, z0, fz);
  wall(win.x1, TR.x1, FY, C, z0, fz, 0);
  wall(TR.x0, I.x0, FY, C, z0, z1, 0); wall(I.x1, TR.x1, FY, C, z0, z1, 0);
  wall(TR.x0, bw[0], FY, C, bz, z1, 0);
  wall(bw[0], bw[1], FY, fl + bw[2], bz, z1); wall(bw[0], bw[1], fl + bw[3], C, bz, z1);
  wall(bw[1], bd[0], FY, C, bz, z1, 0);
  wall(bd[0], bd[1], fl + bd[2], C, bz, z1);
  wall(bd[1], TR.x1, FY, C, bz, z1, 0);
  // outer faces rendered in cream; plinth
  box(TR.x0, TR.x1, FY, fl + 0.15, z0 - 0.02, z0, k.stone, 0x8a8478, 1, true);
  // floor, ceiling with beams and a cornice
  add(ctx.planeUV(I.x1 - I.x0, I.z1 - I.z0, 1), M.floor, T((I.x0 + I.x1) / 2, fl + 0.003, (I.z0 + I.z1) / 2, 0, -PI / 2), 0xffffff, 1);
  add(new THREE.PlaneGeometry(I.x1 - I.x0, I.z1 - I.z0), k.paint, T((I.x0 + I.x1) / 2, C - 0.002, (I.z0 + I.z1) / 2, 0, PI / 2), 0xf4eedf, 1);
  for (let x = I.x0 + 1.5; x < I.x1; x += 1.5) box(x - 0.07, x + 0.07, C - 0.14, C, I.z0, I.z1, k.wood, 0x6a4a30, 2);
  box(I.x0, I.x1, C - 0.1, C, I.z0, I.z0 + 0.1, k.paint, 0xf4eedf, 2); box(I.x0, I.x1, C - 0.1, C, I.z1 - 0.1, I.z1, k.paint, 0xf4eedf, 2);
  // dado panelling in racing green round the room, and a picture rail
  const panel = (x0, x1, za, zb, along) => along ? box(x0, x1, fl, fl + 0.95, za, zb, k.wood, green, 1) : box(za, zb, fl, fl + 0.95, x0, x1, k.wood, green, 1);
  box(I.x0, I.x0 + 0.02, fl, fl + 0.95, I.z0, I.z1, k.wood, green, 1);
  box(I.x0, I.x0 + 0.03, fl + 0.95, fl + 0.99, I.z0, I.z1, k.wood, 0xf1e8d0, 2);
  panel(b.x1, door[0], I.z0, I.z0 + 0.02, true); panel(door[1], win.x0, I.z0, I.z0 + 0.02, true); panel(win.x1, I.x1, I.z0, I.z0 + 0.02, true);
  panel(I.x0, bw[0], I.z1 - 0.02, I.z1, true); panel(bw[1], bd[0], I.z1 - 0.02, I.z1, true); panel(bd[1], I.x1, I.z1 - 0.02, I.z1, true);
  box(I.x1 - 0.02, I.x1, fl, fl + 0.95, I.z0, I.z1, k.wood, green, 1);
  // framed prints and a clock on the walls
  const prints = [[I.x0 + 0.03, 26.1, 0xc8a878], [I.x0 + 0.03, 27.4, 0x8aa8b8], [I.x0 + 0.03, 25.0, 0xb8c8a0]];
  for (const [x, z, c] of prints) { box(x, x + 0.03, fl + 1.3, fl + 1.85, z - 0.25, z + 0.25, k.wood, 0x5a4028, 2); box(x + 0.03, x + 0.035, fl + 1.35, fl + 1.8, z - 0.2, z + 0.2, k.paper, c, 2); }
  for (const z of [25.4, 27.5]) { box(I.x1 - 0.03, I.x1, fl + 1.3, fl + 1.85, z - 0.25, z + 0.25, k.wood, 0x5a4028, 2); box(I.x1 - 0.035, I.x1 - 0.03, fl + 1.35, fl + 1.8, z - 0.2, z + 0.2, k.paper, 0xc8b898, 2); }
  // --- the bay: canted glazing over a panelled stallriser, with a cushioned window seat inside
  {
    const pts = [[b.x0, z0], [b.ox0, b.z], [b.ox1, b.z], [b.x1, z0]];
    for (let i = 0; i < 3; i++) {
      const [xa, za] = pts[i], [xb, zb] = pts[i + 1], dx = xb - xa, dz = zb - za, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx), cx = (xa + xb) / 2, cz = (za + zb) / 2;
      const at = (lx, y, off = 0) => T(cx + Math.cos(yaw) * lx + Math.sin(yaw) * off, y, cz - Math.sin(yaw) * lx + Math.cos(yaw) * off, yaw);
      add(new THREE.BoxGeometry(len, 0.55, 0.1), k.paint, at(0, fl + 0.275, -0.03), green, 1);
      add(new THREE.BoxGeometry(len, 0.55 - 0.1, 0.012), k.paint, at(0, fl + 0.275, -0.085), 0x3a6a56, 2);
      add(new THREE.BoxGeometry(len + 0.06, 0.06, 0.16), k.stone, at(0, fl + 0.58, -0.04), 0xcfc9b8, 1);
      add(new THREE.BoxGeometry(len, 0.2, 0.1), k.paint, at(0, fl + 2.3, -0.03), green, 1);
      add(new THREE.PlaneGeometry(len, 1.7), k.glass, T(cx, fl + 1.4, cz, yaw), 0xdfeaec, 1);
      add(new THREE.PlaneGeometry(len, 1.7), k.glass, T(cx, fl + 1.4, cz, yaw + PI), 0xdfeaec, 1);
      add(new THREE.BoxGeometry(len, 0.04, 0.05), k.paint, at(0, fl + 1.95, -0.01), 0xf1e8cf, 2);
      for (const e of [-1, 1]) add(new THREE.BoxGeometry(0.06, 1.75, 0.08), k.paint, at(e * len / 2, fl + 1.4, -0.01), 0xf1e8cf, 1);
      if (len > 1) add(new THREE.BoxGeometry(0.03, 1.7, 0.05), k.paint, at(0, fl + 1.4, -0.01), 0xf1e8cf, 2);
      add(new THREE.BoxGeometry(len, 0.04, 0.5), k.wood, at(0, fl + 0.58, 0.3), 0x6a4a30, 2);
    }
    // the roof of the bay: a shallow lead-covered slope
    add(H.frustum([b.x0, b.x1, z0 - 0.02, z0 + 0.0], [b.ox0 - 0.05, b.ox1 + 0.05, b.z - 0.05, b.z + 0.0], 0, 0.01), k.zinc, T(0, fl + 2.4, 0), 0x6a6e70, 1);
    box(b.ox0 - 0.08, b.ox1 + 0.08, fl + 2.34, fl + 2.4, b.z - 0.06, b.z + 0.02, k.stone, 0xcfc9b8, 1, true);
    // a display on the seat: teapots and a cake stand, a vase
    teapot(H, -5.3, fl + 0.6, 23.75, 0xc9684a); teapot(H, -4.6, fl + 0.6, 23.7, 0x3f6aa6); cakeStand(H, -3.9, fl + 0.6, 23.75);
    crockery(H, -5.0, fl + 0.6, 23.65, 0xf2ece0, 0xb5534a); crockery(H, -4.25, fl + 0.6, 23.62, 0xf2ece0, 0x3f6aa6);
  }
  // --- right-hand window: glazed, with a sill of plants
  {
    const w = win.x1 - win.x0, cx = (win.x0 + win.x1) / 2;
    plane(w, win.y1 - win.y0, cx, fl + (win.y0 + win.y1) / 2, z0 + 0.03, PI, k.glass, 0xdfeaec, 1);
    plane(w, win.y1 - win.y0, cx, fl + (win.y0 + win.y1) / 2, z0 + 0.03, 0, k.glass, 0xdfeaec, 1);
    for (const x of [win.x0, cx, win.x1]) box(x - 0.035, x + 0.035, fl + win.y0, fl + win.y1, z0 - 0.02, z0 + 0.08, k.paint, 0xf1e8cf, 1);
    box(win.x0, win.x1, fl + win.y1 - 0.06, fl + win.y1, z0 - 0.02, z0 + 0.08, k.paint, 0xf1e8cf, 1);
    box(win.x0, win.x1, fl + win.y0, fl + win.y0 + 0.06, z0 - 0.02, z0 + 0.08, k.paint, 0xf1e8cf, 1);
    box(win.x0, win.x1, fl + 1.55, fl + 1.6, z0 - 0.01, z0 + 0.07, k.paint, 0xf1e8cf, 2);
    box(win.x0 - 0.06, win.x1 + 0.06, fl + win.y0 - 0.05, fl + win.y0 + 0.02, z0 - 0.1, z0 + 0.12, k.stone, 0xcfc9b8, 1, true);
    box(win.x0, win.x1, fl, fl + win.y0 - 0.05, z0 - 0.04, z0, k.paint, green, 1);
    box(win.x0, win.x1, fl + win.y0 + 0.06, fl + win.y0 + 0.1, z0 + 0.02, z0 + 0.4, k.wood, 0x6a4a30, 2);
    for (let i = 0; i < 4; i++) { const x = win.x0 + 0.3 + i * 0.7; cyl(0.07, 0.09, fl + win.y0 + 0.1, fl + win.y0 + 0.26, x, z0 + 0.2, k.terracotta, 0xb8643f, 2, 8); blob(0.13, x, fl + win.y0 + 0.36, z0 + 0.2, wk.leafy, [0x5f8a4c, 0x6a9a58][i % 2], 2, i, 1, 0.9, 1); ball(0.04, x + 0.04, fl + win.y0 + 0.46, z0 + 0.2, k.petal, [0xd23a3a, 0xe8789a, 0xf2f0e8][i % 3], 2, 1, 1, 1, 5); }
    // the printed gold lettering on the glass
    box(win.x0 + 0.2, win.x1 - 0.2, fl + 2.1, fl + 2.14, z0 + 0.025, z0 + 0.027, k.brass, 0xc9a24e, 2);
  }
  // --- the door: green with panes, swung open against the front wall, a step, a brass handle
  {
    const hx = door[0] - 0.02, y1 = fl + door[2];
    box(hx - 0.02, hx + 0.02, fl, y1, z0 + 0.2, z0 + 1.15, k.paint, 0x2e5a48, 1);
    box(hx - 0.025, hx - 0.015, fl + 1.0, y1 - 0.15, z0 + 0.3, z0 + 1.05, k.glass, 0xdfeaec, 1);
    for (const y of [0.08, 0.95, 1.0]) box(hx - 0.03, hx + 0.03, fl + y, fl + y + 0.05, z0 + 0.2, z0 + 1.15, k.paint, 0x3a6a56, 2);
    ball(0.025, hx - 0.04, fl + 1.0, z0 + 0.3, k.brass, 0xc9a24e, 2, 1, 1, 1, 6);
    for (const x of [door[0] - 0.06, door[1] + 0.06]) box(x - 0.05, x + 0.05, fl, fl + door[2] + 0.05, z0 - 0.02, z0 + 0.2, k.paint, 0xf1e8cf, 1);
    box(door[0] - 0.1, door[1] + 0.1, fl + door[2], fl + door[2] + 0.1, z0 - 0.02, z0 + 0.2, k.paint, 0xf1e8cf, 1);
    box(door[0] - 0.1, door[1] + 0.1, fl - 0.0, fl + 0.03, z0 - 0.3, z0 + 0.2, k.stone, 0xb8b2a2, 1);
    cyl(0.03, 0.03, fl + door[2] - 0.5, fl + door[2] - 0.1, door[1] + 0.12, z0 - 0.14, k.brass, 0xc9a24e, 2, 6);
  }
  // --- back door (open into the yard) and the open sash window
  {
    const x = bd[1];
    box(x - 0.04, x, fl, fl + 2.1, z1, z1 + 0.95, k.paint, 0x2e5a48, 1);
    box(x - 0.045, x + 0.005, fl + 0.9, fl + 1.0, z1, z1 + 0.95, k.paint, 0x3a6a56, 2);
    box(x - 0.045, x + 0.005, fl + 0.1, fl + 0.2, z1, z1 + 0.95, k.paint, 0x3a6a56, 2);
    ball(0.025, x + 0.03, fl + 1.0, z1 + 0.85, k.brass, 0xc9a24e, 2, 1, 1, 1, 6);
    for (const xx of [bd[0] - 0.05, bd[1] + 0.05]) box(xx - 0.05, xx + 0.05, fl, fl + bd[2], z1 - 0.2, z1 + 0.02, k.paint, 0xf1e8cf, 1);
    box(bd[0] - 0.1, bd[1] + 0.1, fl + bd[2], fl + bd[2] + 0.08, z1 - 0.2, z1 + 0.02, k.paint, 0xf1e8cf, 1);
    box(bd[0] - 0.05, bd[1] + 0.05, fl - 0.02, fl + 0.03, z1 - 0.2, z1 + 0.35, k.stone, 0xb8b2a2, 1);
    // window: frame, a raised lower sash, half a net curtain
    const wx0 = bw[0], wx1 = bw[1], wy0 = fl + bw[2], wy1 = fl + bw[3], mx = (wx0 + wx1) / 2;
    for (const xx of [wx0, wx1]) box(xx - 0.04, xx + 0.04, wy0, wy1, z1 - 0.2, z1 + 0.04, k.paint, 0xf1e8cf, 1);
    box(wx0, wx1, wy1 - 0.06, wy1, z1 - 0.2, z1 + 0.04, k.paint, 0xf1e8cf, 1);
    box(wx0 - 0.06, wx1 + 0.06, wy0 - 0.05, wy0 + 0.01, z1 - 0.2, z1 + 0.12, k.stone, 0xcfc9b8, 1, true);
    box(wx0, wx1, wy0 + 0.55, wy0 + 0.6, z1 - 0.12, z1 - 0.06, k.paint, 0xf1e8cf, 1);        // the sash rails, lower one raised
    box(wx0 + 0.03, wx1 - 0.03, wy0 + 0.6, wy0 + 0.66, z1 - 0.1, z1 - 0.08, k.paint, 0xf1e8cf, 2);
    plane(0.6, 0.5, mx - 0.25, wy1 - 0.3, z1 - 0.09, PI, k.fabric, 0xeee8da, 2);
    cyl(0.06, 0.08, wy0, wy0 + 0.14, mx + 0.25, z1 - 0.12, k.terracotta, 0xb8643f, 2, 8);
    blob(0.1, mx + 0.25, wy0 + 0.25, z1 - 0.12, wk.leafy, 0x5f8a4c, 2, 3, 1, 1, 1);
  }
  // --- inside: counter, display case, till, urn, back bar with crockery, menu board
  {
    const ct = TR.counter, bb = TR.backBar, y = fl + ct.h;
    box(ct.x0, ct.x1, fl, y - 0.04, ct.z0, ct.z1, k.wood, 0x6a4a30, 1);
    for (let x = ct.x0 + 0.1; x < ct.x1 - 0.1; x += 0.35) box(x, x + 0.3, fl + 0.15, y - 0.12, ct.z0 - 0.015, ct.z0, k.wood, 0x5a3e28, 2);
    box(ct.x0 - 0.04, ct.x1, y - 0.04, y, ct.z0 - 0.04, ct.z1 + 0.03, k.stone, 0xe8e2d4, 1);
    // glass case with three shelves of cakes and a lit base
    const g0 = ct.x0 + 0.5, g1 = ct.x0 + 2.0, gz0 = ct.z0 + 0.08, gz1 = ct.z1 - 0.12;
    box(g0, g1, y, y + 0.04, gz0, gz1, k.paint, 0xf0eadc, 1);
    box(g0, g1, y + 0.04, y + 0.06, gz0 + 0.02, gz1 - 0.02, M.glow, 0xfff0d0, 1);
    for (const [xa, xb, za, zb] of [[g0, g1, gz0, gz0 + 0.01], [g0, g1, gz1 - 0.01, gz1], [g0, g0 + 0.01, gz0, gz1], [g1 - 0.01, g1, gz0, gz1]]) box(xa, xb, y + 0.04, y + 0.36, za, zb, k.glass, 0xdfeaec, 1);
    box(g0, g1, y + 0.36, y + 0.38, gz0, gz1, k.paint, 0xf0eadc, 1);
    box(g0 + 0.03, g1 - 0.03, y + 0.2, y + 0.215, gz0 + 0.03, gz1 - 0.03, k.glass, 0xdfeaec, 2);
    // the glass shelf's chrome edge and the four posts it rests on, so it reads as a shelf
    box(g0 + 0.03, g1 - 0.03, y + 0.198, y + 0.217, gz0 + 0.028, gz0 + 0.036, k.steel, 0xd0d4d8, 2);
    for (const px of [g0 + 0.035, g1 - 0.035]) for (const pz of [gz0 + 0.035, gz1 - 0.035]) cyl(0.006, 0.006, y + 0.06, y + 0.2, px, pz, k.steel, 0xd0d4d8, 2, 6);
    const cakes = [0xd9a05a, 0x6a3f24, 0xe8a0b0, 0xf0e8d0, 0xb8283a, 0xd9a05a];
    for (let i = 0; i < 6; i++) { const x = g0 + 0.15 + i * 0.24; cyl(0.1, 0.1, y + 0.06, y + 0.14, x, (gz0 + gz1) / 2, k.paper, cakes[i], 2, 10); if (i % 2) cyl(0.1, 0.1, y + 0.215, y + 0.28, x, (gz0 + gz1) / 2, k.paper, cakes[(i + 2) % 6], 2, 10); }
    // till, a steel tea urn, a stack of saucers
    box(ct.x1 - 0.5, ct.x1 - 0.1, y, y + 0.08, ct.z0 + 0.15, ct.z0 + 0.6, k.enamel, 0x2a2a2a, 1);
    box(ct.x1 - 0.5, ct.x1 - 0.1, y + 0.08, y + 0.28, ct.z0 + 0.4, ct.z0 + 0.6, k.enamel, 0x2a2a2a, 2);
    box(ct.x1 - 0.46, ct.x1 - 0.14, y + 0.2, y + 0.25, ct.z0 + 0.38, ct.z0 + 0.4, M.glow, 0xbfe8c0, 2);
    cyl(0.12, 0.12, y, y + 0.5, ct.x0 + 0.25, ct.z0 + 0.4, k.steel, 0xc9ced6, 1, 12);
    cyl(0.1, 0.1, y + 0.5, y + 0.55, ct.x0 + 0.25, ct.z0 + 0.4, k.steel, 0xc9ced6, 2, 12);
    cyl(0.015, 0.015, y + 0.12, y + 0.18, ct.x0 + 0.25, ct.z0 + 0.28, k.brass, 0xc9a24e, 2, 5);
    for (let i = 0; i < 5; i++) cyl(0.07, 0.07, y + i * 0.012, y + i * 0.012 + 0.01, ct.x0 + 0.75 - 0.0, ct.z0 + 0.7, k.ceramic, 0xf2ece0, 2, 10);
    // back bar: cupboards below, open shelves of cups and teapots above, a mirror, the menu board and a clock
    box(bb.x0, bb.x1, fl, fl + bb.h, bb.z0, bb.z1, k.wood, green, 1);
    box(bb.x0 - 0.02, bb.x1 + 0.0, fl + bb.h, fl + bb.h + 0.04, bb.z0 - 0.04, bb.z1, k.stone, 0xe8e2d4, 1);
    for (const sy of [1.25, 1.65]) box(bb.x0 + 0.1, bb.x1 - 0.1, fl + sy, fl + sy + 0.03, bb.z0 + 0.1, bb.z1, k.wood, 0x6a4a30, 1);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 10; i++) {
      const x = bb.x0 + 0.25 + i * 0.22, yy = fl + [1.28, 1.68][row];
      if (row === 0) crockery(H, x, yy, bb.z1 - 0.1, [0xf2ece0, 0xe8c0c0, 0xc0d8e8][i % 3], 0xb5534a); else if (i % 2) teapot(H, x, yy, bb.z1 - 0.1, [0xc9684a, 0x3f6aa6, 0xe8e4d0, 0x3f8a5a][i % 4]); else cyl(0.05, 0.05, yy, yy + 0.09, x, bb.z1 - 0.1, k.ceramic, 0xe8e4d0, 2, 8);
    }
    sign('menu', 0.8, 0.8, -2.0 + 0.0, fl + 1.5, I.z1 - 0.012, PI, 1);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), k.paint, T(-3.2, fl + 2.0, I.z1 - 0.03, 0, PI / 2), 0xf4eedf, 2);
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 16), k.paint, T(-3.2, fl + 2.0, I.z1 - 0.035, 0, PI / 2), 0xf8f4ea, 2);
    box(-3.205, -3.195, fl + 2.0, fl + 2.14, I.z1 - 0.06, I.z1 - 0.05, k.iron, 0x222222, 2);
    // a chalk 'cake of the day' stand on the counter
  }
  // --- window seat banquette, tables set for tea, chairs, pendant lights
  {
    const bq = TR.banquette;
    box(bq.x0, bq.x1, fl, fl + 0.4, bq.z0, bq.z1, k.wood, green, 1);
    box(bq.x0, bq.x1, fl + 0.4, fl + 0.5, bq.z0, bq.z1, k.fabric, 0x9a3a3a, 1);
    box(bq.x0, bq.x0 + 0.1, fl + 0.5, fl + 1.0, bq.z0, bq.z1, k.fabric, 0x9a3a3a, 1);
    for (const z of [25.3, 26.4, 27.5]) for (let i = 0; i < 1; i++) ball(0.11, bq.x0 + 0.22, fl + 0.62, z, k.fabric, [0xc9a86a, 0x6a8a9a, 0xb8707a][Math.round(z) % 3], 2, 0.6, 1, 1.2, 7);
    TR.tables.forEach(([x, z], i) => {
      roundTable(H, x, fl, z, 0xe8e0cc, [0xe8d8d0, 0xd0e0e0, 0xe8d8d0, 0xf0e8d0][i]);
      teapot(H, x - 0.12, fl + 0.745, z + 0.12, [0xc9684a, 0x3f6aa6, 0xe8e4d0][i % 3]);
      if (i !== 3) crockery(H, x + 0.1, fl + 0.745, z - 0.13); else { crockery(H, x - 0.13, fl + 0.745, z - 0.1, 0xf2ece0, 0xb5534a); }
      ball(0.03, x, fl + 0.77, z + 0.0, k.ceramic, 0xf2f0e8, 2, 1, 1, 1, 6);
      cyl(0.02, 0.02, fl + 0.745, fl + 0.82, x - 0.02, z + 0.02, k.ceramic, 0x6a8ac8, 2, 6);
      for (let f = 0; f < 3; f++) ball(0.025, x - 0.02 + (f - 1) * 0.02, fl + 0.84 + (f % 2) * 0.01, z + 0.02, k.petal, [0xe8c24a, 0xd96b8a, 0xf2f0e8][f], 2, 1, 1, 1, 5);
    });
    for (const [x, z, yaw] of TR.chairs) chair(H, x, fl, z, yaw, 0x4a3426, true);
    for (const [x, z] of [[-5.45, 26.3], [0.5, 26.3], [1.9, 24.0]]) {
      rod([x, C, z], [x, C - 0.55, z], 0.006, k.iron, 0x222222, 2, 4);
      add(new THREE.ConeGeometry(0.18, 0.16, 12, 1, true), M.glow, T(x, C - 0.63, z), 0xfff0cf, 1);
      add(new THREE.ConeGeometry(0.18, 0.16, 12, 1, true), k.paint, T(x, C - 0.625, z, 0, PI), green, 2);
    }
    // a coat stand by the door, an umbrella stand, a potted palm
    cyl(0.03, 0.03, fl, fl + 1.7, -2.65, 24.5, k.wood, 0x4a3426, 2, 6);
    for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + 0.4; rod([-2.65, fl + 1.65, 24.5], [-2.65 + Math.cos(a) * 0.15, fl + 1.72, 24.5 + Math.sin(a) * 0.15], 0.01, k.wood, 0x4a3426, 2, 4); }
    blob(0.2, -2.65, fl + 1.5, 24.5, k.fabric, 0x4a5a6a, 2, 2, 1, 1.4, 0.7);
    cyl(0.14, 0.17, fl, fl + 0.36, -6.2, 28.8, k.terracotta, 0xb8643f, 2, 10);
    blob(0.3, -6.2, fl + 0.7, 28.8, wk.leafy, 0x4f7b44, 2, 4, 1, 1.3, 1);
  }
  // --- the doormat and a hanging 'Open' sign are on the door; the A-board outside belongs to the forecourt
}

// ------------------------------------------------------------------ forecourts: tea tables, awnings, produce, tools, racks
function awning(H, A, colA, colB, ribs = true) {
  const { k, add, T, box, rod } = H;
  const z0 = BLD.z0, len = Math.hypot(z0 - A.zOut, A.yWall - A.yOut), tilt = Math.atan2(A.yWall - A.yOut, z0 - A.zOut);
  const cz = (z0 + A.zOut) / 2, cy = (A.yWall + A.yOut) / 2, step = 0.28;
  let i = 0;
  for (let x = A.x0; x < A.x1 - 0.01; x += step, i++) {
    const w = Math.min(step, A.x1 - x), c = i % 2 ? colA : colB;
    add(new THREE.BoxGeometry(w, 0.03, len), k.fabric, T(x + w / 2, cy, cz, 0, -tilt), c, 1);
    add(new THREE.BoxGeometry(w, 0.2, 0.012), k.fabric, T(x + w / 2, A.yOut - 0.1, A.zOut), c, 1);
    add(new THREE.CylinderGeometry(w / 2, w / 2, 0.012, 8, 1, false, 0, PI), k.fabric, T(x + w / 2, A.yOut - 0.2, A.zOut, 0, PI / 2, 0), c, 2);
  }
  if (ribs) {
    box(A.x0, A.x1, A.yOut - 0.03, A.yOut + 0.01, A.zOut - 0.02, A.zOut + 0.0, k.iron, 0x2a2a2a, 2);
    for (let x = A.x0 + 0.3; x < A.x1; x += 1.9) rod([x, A.yWall - 0.45, z0 - 0.02], [x, A.yOut - 0.04, A.zOut + 0.04], 0.012, k.iron, 0x2a2a2a, 2, 5);
    box(A.x0, A.x1, A.yWall - 0.05, A.yWall + 0.1, z0 - 0.1, z0 - 0.02, k.iron, 0x2a2a2a, 2);
  }
}
function heap(H, x, y, z, w, d, col, n, r = 0.045) {
  const rnd = mulberry(Math.round(x * 131 + z * 17 + n));
  for (let i = 0; i < n; i++) H.ball(r * (0.85 + rnd() * 0.3), x + (rnd() - 0.5) * w, y + r * 0.8 + rnd() * r * 0.8, z + (rnd() - 0.5) * d, H.k.leaf, col(i), 2, 1, 0.92, 1, 6);
}

function forecourts(H) {
  const { ctx, k, wk, M, add, T, box, boxC, cyl, ball, blob, rod, plane, sign, rnd } = H;
  const z0 = BLD.z0, F = S.FORECOURT, fl = PV;
  // --- tea room awning and the greengrocer's
  awning(H, TR.awning, 0xe8e0c8, 0x2e5a48);
  awning(H, S.GREENGROCER.awning, 0xf0ece0, 0x35542f);
  // --- tables and chairs on the forecourt, laid for tea
  F.tables.forEach(([x, z], i) => {
    roundTable(H, x, fl, z, 0x2d5a45);
    if (i < 2) { teapot(H, x - 0.1, fl + 0.74, z + 0.1, [0xc9684a, 0x3f6aa6][i]); crockery(H, x + 0.1, fl + 0.74, z - 0.1); crockery(H, x + 0.08, fl + 0.74, z + 0.14, 0xe8c0c0, 0xb5534a); }
    if (i === 2) { cakeStand(H, 0.4, fl + 0.74, 22.88); teapot(H, 0.78, fl + 0.74, 22.82, 0x3f8a5a); box(0.3, 0.45, fl + 0.74, fl + 0.745, 23.1, 23.25, k.paper, 0xf2f0e8, 2); }
    if (i === 3) { cyl(0.035, 0.03, fl + 0.74, fl + 0.86, 1.55, 23.2, k.ceramic, 0x6a8ac8, 2, 7); for (let f = 0; f < 4; f++) ball(0.03, 1.55 + (f - 1.5) * 0.02, fl + 0.88, 23.2, k.petal, [0xe8c24a, 0xd96b8a, 0xf2f0e8, 0xb8283a][f], 2, 1, 1, 1, 5); }
  });
  for (const [x, z, yaw] of F.chairs) chair(H, x, fl, z, yaw, 0x2c4a3c, false);
  // planters either side of the shopfront: tubs of box balls
  for (const x of [-6.45, 2.25]) {
    cyl(0.22, 0.26, fl, fl + 0.5, x, 23.45, k.wood, 0x2e5a48, 2, 10);
    blob(0.3, x, fl + 0.82, 23.45, wk.leafy, 0x4f7b44, 2, Math.round(x * 3), 1, 1, 1);
  }
  // A-board menu outside the door
  {
    const x = -2.6, z = 23.35;
    for (const s of [-1, 1]) boxC(0.46, 0.8, 0.025, x, fl + 0.45, z + s * 0.14, 0, k.wood, 0x3a3a3a, 1, -s * 0.22);
    add(signGeo('menu', 0.4, 0.4), M.sign, T(x, fl + 0.5, z - 0.141, PI, 0.0), 0xffffff, 1);
    add(signGeo('menu', 0.4, 0.4), M.sign, T(x, fl + 0.5, z + 0.141, 0, 0.0), 0xffffff, 2);
  }
  // --- greengrocer: stepped stands under the awning, crates of produce, sacks, a scale
  {
    const prod = [
      (i) => [0xb8283a, 0x6a9a3a, 0xc83c2a][i % 3], (i) => [0xe8982a, 0xe8b02a][i % 2], (i) => [0xc8301e, 0xd84a2a][i % 2],
      (i) => [0x8a5a2a, 0xa07a3a][i % 2], (i) => [0xe87a2a][0], (i) => [0x6a9a3a, 0x5a8a30][i % 2], (i) => [0xd8c24a][0],
    ];
    S.GREENGROCER.stands.forEach(([x, z], si) => {
      const wood = 0xa88a5a;
      box(x - 0.7, x + 0.7, fl, fl + 0.5, z - 0.34, z + 0.34, k.wood, wood, 1, true);
      box(x - 0.7, x + 0.7, fl + 0.5, fl + 0.55, z - 0.35, z + 0.35, k.wood, 0x8a6e44, 1);
      box(x - 0.7, x + 0.7, fl + 0.55, fl + 0.9, z + 0.05, z + 0.35, k.wood, wood, 1, true);
      for (let i = 0; i < 3; i++) {
        const cx = x - 0.46 + i * 0.46;
        box(cx - 0.21, cx + 0.21, fl + 0.5, fl + 0.58, z - 0.3, z + 0.0, k.wood, 0xb89a68, 1);
        box(cx - 0.2, cx + 0.2, fl + 0.58, fl + 0.62, z - 0.29, z - 0.01, k.rubber, prod[(si * 3 + i) % prod.length](0) , 2);
        heap(H, cx, fl + 0.62, z - 0.15, 0.3, 0.22, prod[(si * 3 + i) % prod.length], 9);
        const cu = x - 0.46 + i * 0.46;
        box(cu - 0.2, cu + 0.2, fl + 0.9, fl + 0.94, z + 0.07, z + 0.33, k.rubber, prod[(si * 2 + i + 2) % prod.length](1), 2);
        heap(H, cu, fl + 0.94, z + 0.2, 0.3, 0.2, prod[(si * 2 + i + 2) % prod.length], 7);
      }
      // price tickets on little sticks
      for (let i = 0; i < 3; i++) { const cx = x - 0.46 + i * 0.46; box(cx - 0.06, cx + 0.06, fl + 0.56, fl + 0.66, z - 0.33, z - 0.325, k.paper, 0xf2f0e8, 2); }
      // legs of the shelving
      for (const sx of [-0.68, 0.68]) box(x + sx - 0.02, x + sx + 0.02, fl + 0.9, fl + 1.0, z + 0.05, z + 0.35, k.wood, wood, 2);
    });
    // sacks of potatoes and a brass scale
    for (const [x, z] of [[-12.35, 23.15], [-12.1, 23.45]]) { blob(0.22, x, fl + 0.26, z, k.fabric, 0xb8a078, 1, Math.round(x * 3), 1, 1.2, 1); box(x - 0.1, x + 0.1, fl + 0.45, fl + 0.5, z - 0.02, z + 0.02, k.fabric, 0x8a7a5a, 2); }
    cyl(0.1, 0.1, fl, fl + 0.05, -7.25, 23.3, k.iron, 0x222222, 2, 8);
    cyl(0.02, 0.02, fl + 0.05, fl + 0.8, -7.25, 23.3, k.iron, 0x222222, 2, 5);
    cyl(0.14, 0.14, fl + 0.8, fl + 0.82, -7.25, 23.3, k.brass, 0xc9a24e, 2, 10);
  }
  // --- hardware: wheelbarrow of pots, a ladder, bags of compost, buckets, brooms
  {
    const [bx, bz] = S.HARDWARE.barrow;
    add(H.frustum([-0.4, 0.4, -0.25, 0.25], [-0.55, 0.55, -0.35, 0.35], 0, 0.37), k.zinc, T(bx, fl + 0.25, bz), 0x8f9a8a, 1);
    cyl(0.22, 0.22, fl, fl + 0.44, bx + 0.7, bz, k.rubber, 0x1d1d1d, 2, 12);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), k.rubber, T(bx + 0.7, fl + 0.22, bz, 0, PI / 2), 0x1d1d1d, 1);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 8), k.steel, T(bx + 0.7, fl + 0.22, bz, 0, PI / 2), 0xaab0b4, 2);
    for (const s of [-1, 1]) { rod([bx - 0.6, fl + 0.5, bz + s * 0.3], [bx - 1.05, fl + 0.7, bz + s * 0.38], 0.018, k.wood, 0xb89a68, 1, 5); rod([bx - 0.3, fl + 0.3, bz + s * 0.3], [bx - 0.34, fl, bz + s * 0.3], 0.015, k.iron, 0x2a2a2a, 2, 5); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; cyl(0.1, 0.13, fl + 0.62, fl + 0.82, bx - 0.25 + Math.cos(a) * 0.28 * (i > 0), bz + Math.sin(a) * 0.17 * (i > 0), k.terracotta, 0xb8643f, 2, 9); }
    const [lx] = S.HARDWARE.ladder;
    for (const s of [-1, 1]) rod([lx + s * 0.2, fl, 22.95], [lx + s * 0.2, fl + 2.7, 23.74], 0.025, k.zinc, 0xc9a875, 1, 6);
    for (let i = 1; i < 9; i++) { const t = i / 9.5; rod([lx - 0.2, fl + 2.7 * t, 22.95 + 0.79 * t], [lx + 0.2, fl + 2.7 * t, 22.95 + 0.79 * t], 0.013, k.wood, 0xb89a68, 2, 5); }
    const [gx, gz] = S.HARDWARE.bags;
    for (let l = 0; l < 2; l++) for (let i = 0; i < (l ? 3 : 4); i++) {
      const x = gx + (i - (l ? 1 : 1.5)) * 0.3, y = fl + l * 0.45;
      box(x - 0.14, x + 0.14, y, y + 0.43, gz - 0.22, gz + 0.3, k.fabric, [0x6a5a3e, 0x4a6a3a, 0x7a6a4e][(i + l) % 3], 1);
      box(x - 0.1, x + 0.1, y + 0.2, y + 0.3, gz + 0.3, gz + 0.305, k.paper, 0xf2f0e8, 2);
    }
    for (let i = 0; i < 4; i++) cyl(0.17 - i * 0.003, 0.14, fl + i * 0.0, fl + 0.3, -13.4 + i * 0.0, 23.45, k.zinc, 0x9aa0a4, 2, 10);
    for (let i = 0; i < 3; i++) { cyl(0.17, 0.14, fl + i * 0.32, fl + 0.3 + i * 0.32, -13.4, 23.45, k.zinc, 0x9aa0a4, 2, 10); }
    for (let i = 0; i < 5; i++) { rod([-18.7 + i * 0.07, fl + 0.05, 23.72], [-18.65 + i * 0.07, fl + 1.5, 23.68], 0.014, k.wood, 0xb89a68, 2, 5); add(new THREE.BoxGeometry(0.2, 0.07, 0.03), k.fabric, T(-18.65 + i * 0.07, fl + 0.12, 23.7), 0xc8a050, 2); }
  }
  // --- post office: a newspaper rack, a postcard spinner
  {
    box(5.6, 6.3, fl, fl + 1.2, 23.45, 23.75, k.iron, 0x303030, 1);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) plane(0.18, 0.22, 5.72 + i * 0.22, fl + 0.18 + r * 0.26, 23.435, PI, k.paper, [0xe8e4d8, 0xf2f0e8, 0xdcd4c0][(i + r) % 3], 2);
    box(5.6, 6.3, fl + 1.2, fl + 1.28, 23.42, 23.78, k.paint, 0xa8231f, 1);
    cyl(0.04, 0.04, fl, fl + 1.0, 8.95, 23.62, k.iron, 0x303030, 2, 6);
    cyl(0.17, 0.17, fl + 0.9, fl + 1.35, 8.95, 23.62, k.iron, 0x303030, 1, 10);
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; box(8.95 + Math.cos(a) * 0.18 - 0.05, 8.95 + Math.cos(a) * 0.18 + 0.05, fl + 0.95, fl + 1.3, 23.62 + Math.sin(a) * 0.18 - 0.005, 23.62 + Math.sin(a) * 0.18 + 0.005, k.paper, [0xf2d8d8, 0xd8e8f2, 0xf2ecc8, 0xd8f0d8][i % 4], 2); }
  }
}

// ------------------------------------------------------------------ rear yards behind the parade
function yards(H) {
  const { ctx, k, wk, M, add, T, box, boxC, cyl, ball, blob, rod, plane, rnd, leafyLow } = H;
  const Y = S.YARD, z1 = BLD.z1;
  const brick = (x0, x1, y0, y1, za, zb, col, lod = 1) => box(x0, x1, y0, y1, za, zb, wk.brick, col, lod, true);
  // the back wall, with a timber gate for each unit, and the dividing walls between yards
  brick(-19.5, 19.5, FY, FY + Y.wallH, Y.z1, Y.z1 + Y.wallT, 0xe0cfbe);
  box(-19.5, 19.5, FY + Y.wallH, FY + Y.wallH + 0.05, Y.z1 - 0.04, Y.z1 + Y.wallT + 0.04, k.stone, 0xc8c2b4, 1, true);
  for (const u of S.UNITS) {
    const x = (u.x0 + u.x1) / 2 + (u.id === 'tearoom' ? -1.0 : 1.0);
    box(x - 0.5, x + 0.5, FY, FY + 1.85, Y.z1 - 0.025, Y.z1, k.wood, 0x6a5a48, 1);
    for (const y of [0.25, 0.9, 1.55]) box(x - 0.5, x + 0.5, FY + y, FY + y + 0.1, Y.z1 - 0.04, Y.z1 - 0.025, k.wood, 0x5a4a38, 2);
    box(x + 0.35, x + 0.45, FY + 0.95, FY + 1.0, Y.z1 - 0.05, Y.z1 - 0.025, k.iron, 0x222222, 2);
    if (u.x0 > -19) { brick(u.x0 - 0.06, u.x0 + 0.06, FY, FY + Y.wallH, Y.z0, Y.z1, 0xe0cfbe); box(u.x0 - 0.1, u.x0 + 0.1, FY + Y.wallH, FY + Y.wallH + 0.05, Y.z0, Y.z1, k.stone, 0xc8c2b4, 2, true); }
  }
  // rear windows and doors on the solid units; the tea room's are built in teaRoom()
  for (const u of S.UNITS) {
    if (u.id === 'tearoom') continue;
    const W = u.x1 - u.x0, n = Math.max(2, Math.round(W / 2.6));
    for (let i = 0; i < n; i++) {
      const x = u.x0 + W * (i + 0.5) / n;
      windowAt(ctx, { x, y: FY + 4.1, z: z1 + 0.001, ry: 0, w: 0.95, h: 1.35, style: 'sash', bars: 2, trim: 0xf1ede4, curtains: rnd() < 0.7 });
      if (i === n - 1) { box(x - 0.4, x + 0.4, PV, PV + 2.05, z1 + 0.0, z1 + 0.05, k.paint, 0x4a5a6a, 1); ball(0.025, x + 0.3, PV + 1.0, z1 + 0.07, k.brass, 0xc9a24e, 2, 1, 1, 1, 6); box(x - 0.5, x + 0.5, PV + 2.05, PV + 2.12, z1, z1 + 0.1, k.stone, 0xcfc9b8, 1); }
      else windowAt(ctx, { x, y: PV + 0.95, z: z1 + 0.001, ry: 0, w: 0.9, h: 1.0, style: 'casement', bars: 2, trim: 0xf1ede4, curtains: rnd() < 0.5 });
    }
    cyl(0.04, 0.04, FY, BLD.eave - 0.1, u.x1 - 0.2, z1 + 0.06, k.iron, 0x23282a, 2, 8);
  }
  // clutter in the yards: bins, crates, a water butt, planters, a ladder, a cat
  const wheel = (x, z, yaw, col) => { const { frustum } = H; add(frustum([-0.25, 0.25, -0.3, 0.3], [-0.29, 0.29, -0.36, 0.36], 0, 0.95), k.rubber, T(x, FY + 0.08, z, yaw), col, 1); add(new THREE.BoxGeometry(0.62, 0.05, 0.76), k.rubber, T(x, FY + 1.05, z, yaw), col, 1); };
  for (const [x, z, yaw] of [[-0.3, 30.35, 0.05], [0.5, 30.4, -0.04], [1.3, 30.35, 0.06]]) wheel(x, z, yaw, 0x25282a);
  cyl(0.3, 0.32, FY, FY + 0.9, -6.2, 30.5, k.rubber, 0x2f5a3a, 1, 12);
  cyl(0.31, 0.31, FY + 0.88, FY + 0.93, -6.2, 30.5, k.rubber, 0x25402a, 2, 12);
  for (let i = 0; i < 3; i++) { box(2.0, 2.4, FY + i * 0.15, FY + i * 0.15 + 0.14, 29.6, 30.2, k.wood, 0x9a7a52, 1); }
  for (let i = 0; i < 3; i++) box(-2.6, -2.2, FY + i * 0.2, FY + i * 0.2 + 0.19, 29.5, 29.9, k.rubber, [0xd8a828, 0xb83a2a, 0xd8a828][i], 1);
  rod([-5.5, FY, 30.9], [-5.2, FY + 1.6, 30.95], 0.02, k.wood, 0xb89a68, 2, 5);
  ball(0.09, 2.2, FY + 0.5, 29.7, k.fabric, 0x2a2a2a, 2, 1.4, 0.8, 1, 7);                  // the yard cat on the crates
  for (const x of [-10.0, -3.0 + 0, 7.0, 13.0, 17.4]) {
    wheel(x, 30.4, 0.04, [0x25282a, 0x2f5a3a, 0x2a4f86][Math.round(x) % 3]);
    cyl(0.2, 0.17, FY, FY + 0.4, x + 0.7, 30.3, k.terracotta, 0xb8643f, 2, 9);
    blob(0.26, x + 0.7, FY + 0.65, 30.3, leafyLow, 0x5f8a4c, 2, Math.round(x), 1, 1, 1);
  }
  box(-17.5, -16.6, FY, FY + 0.5, 29.9, 30.5, k.wood, 0x8a7a5a, 1);
  void M; void plane; void boxC;
}

// ------------------------------------------------------------------ telegraph wires: sagging lines pole to pole, and drops to the house fronts
function wires(H) {
  const { k, rod, box } = H;
  for (const w of S.wireList()) {
    let prev = S.wirePoint(w, 0);
    for (let i = 1; i <= S.WIRE_SEGMENTS; i++) {
      const p = S.wirePoint(w, i / S.WIRE_SEGMENTS);
      rod(prev, p, 0.007, k.iron, 0x1c1c1c, 1, 4);
      prev = p;
    }
    if (w.kind === 'drop') {
      const e = w.b;
      box(e[0] - 0.07, e[0] + 0.07, e[1] - 0.07, e[1] + 0.07, FRONT_LINE, FRONT_LINE + 0.05, k.iron, 0x303030, 2);
      H.cyl(0.025, 0.02, e[1] - 0.03, e[1] + 0.03, e[0], FRONT_LINE + 0.08, k.ceramic, 0x8a6a4a, 2, 6);
    }
  }
}
