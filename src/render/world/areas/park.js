import * as THREE from 'three';
import { FY, STREAM, POND, KNOLL, BOUNDS, streamZ, groundHeight } from '../../../sim/world/plan.js';
import {
  PK, frameAt, octagon, bandstandInfo, parkTrees, oakSpec, swingInfo, jettyInfo, bridgeInfo, steppingStones, bankBoulders, pondStones,
  logBoulder, denBranches, woodStumps, playInfo, slideInfo, picnicInfo, bandstandCup, kiteInfo,
} from '../../../sim/world/park.js';
import { taperTube, mulberry } from '../kit.js';
import { WIND_GLSL } from '../../grass.js';
import { boxUV } from '../../batch.js';


// Draws the 'park' area (AREAS.park in src/sim/world/plan.js; colliders in src/sim/world/park.js).
// See src/render/world/index.js for ctx. Everything stands on groundY. Layout numbers come from the sim file.
//
//   ground: gravel walks, dirt tracks in the wood, mown lawn (stripes) against long meadow, mud, bare earth
//   water: the stream (a strip along streamZ with a flowing ripple layer, a weir step) and the pond (a fan
//          out to its true shoreline, lily pads, a ripple layer), reeds, bulrushes, boulders
//   structures: footbridge, stepping stones, weir, jetty, rowing boat, bandstand, play area, picnic
//   trees: the big oak with a rope swing and a caught kite, the wood (merged canopies, leaf cards on near
//          trees only), a fallen log, a bluebell glade, a den of branches, benches and bins
const G = groundHeight;
const TAU = Math.PI * 2;
const UPV = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ small geometry helpers
// A cylinder (or tapered) from a to b.
function rod(a, b, r0, r1 = r0, seg = 6, uv = 2) {
  const A = Array.isArray(a) ? V(...a) : a, B = Array.isArray(b) ? V(...b) : b;
  const d = B.clone().sub(A), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
  const u = g.attributes.uv;
  for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * r0 * 6 * uv, u.getY(i) * L * uv);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize()), V(1, 1, 1)));
  return g;
}
// A box of width w (across), thickness t, running from a to b, with its top facing roughly up.
const _m4 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function beam(a, b, w, t, upHint = UPV) {
  const A = Array.isArray(a) ? V(...a) : a, B = Array.isArray(b) ? V(...b) : b;
  _z.subVectors(B, A); const L = _z.length(); _z.normalize();
  _x.crossVectors(upHint, _z); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize();
  _y.crossVectors(_z, _x).normalize();
  _m4.makeBasis(_x, _y, _z).setPosition(A.clone().add(B).multiplyScalar(0.5));
  return { geo: boxUV(w, t, L, 1), m: _m4.clone() };
}
// A prism over a convex polygon [[x, z], ...] from y0 to y1: outward sides (uv in metres) and an optional top.
function prism(poly, y0, y1, { top = true, uvs = 1 } = {}) {
  const pos = [], uv = [];
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let u = 0;
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = -(q[1] - p[1]), nz = q[0] - p[0];
    const out = ((p[0] + q[0]) / 2 - cx) * nx + ((p[1] + q[1]) / 2 - cz) * nz > 0;
    const A = [p[0], y0, p[1]], B = [q[0], y0, q[1]], C = [q[0], y1, q[1]], D = [p[0], y1, p[1]];
    const ua = [u * uvs, y0 * uvs], ub = [(u + len) * uvs, y0 * uvs], uc = [(u + len) * uvs, y1 * uvs], ud = [u * uvs, y1 * uvs];
    if (out) { tri(A, B, C, ua, ub, uc); tri(A, C, D, ua, uc, ud); } else { tri(A, C, B, ua, uc, ub); tri(A, D, C, ua, ud, uc); }
    u += len;
  }
  if (top) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const cr = (p[1] - cz) * (q[0] - cx) - (p[0] - cx) * (q[1] - cz);
      const C = [cx, y1, cz], P = [p[0], y1, p[1]], Q = [q[0], y1, q[1]];
      const uC = [cx * uvs, cz * uvs], uP = [p[0] * uvs, p[1] * uvs], uQ = [q[0] * uvs, q[1] * uvs];
      if (cr > 0) tri(C, P, Q, uC, uP, uQ); else tri(C, Q, P, uC, uQ, uP);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// A flat triangle fan / facet with metre uvs and a chosen facing (up = true: normal +y side).
function facet(a, b, c, flip = false) {
  const g = new THREE.BufferGeometry();
  const P = flip ? [a, c, b] : [a, b, c];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap((p) => [p[0] * 1.2 + p[2] * 0.3, p[1] * 1.2]), 2));
  g.computeVertexNormals();
  return g;
}

// A clump of reeds: n blades each bending over, tapered, from the origin (y up).
function reedGeometry(rnd, n, h0, h1, { width = 0.022, curve = 0.35 } = {}) {
  const pos = [], uv = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, lean = (0.04 + rnd() * curve), h = h0 + rnd() * (h1 - h0), ox = (rnd() - 0.5) * 0.14, oz = (rnd() - 0.5) * 0.14;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, seg = 4;
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg, t1 = (s + 1) / seg;
      const P = (t, side) => {
        const bend = lean * t * t * h, wd = width * (1 - t * 0.85) * side;
        return [ox + dx * bend + px * wd, h * t, oz + dz * bend + pz * wd];
      };
      const a0 = P(t0, -1), a1 = P(t0, 1), b0 = P(t1, -1), b1 = P(t1, 1);
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
      uv.push(0, t0, 1, t0, 1, t1, 0, t0, 1, t1, 0, t1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Distance from (x, z) to a polyline.
function distSeg(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}
// Smooth a polyline with Catmull-Rom for painting and edging.
function smoothPath(pts, per = 6) {
  const out = [], P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ------------------------------------------------------------------ the build
export function build(ctx) {
  const k = ctx.kit, wk = ctx.wk, T = ctx.T;
  const rnd = mulberry(8675309);
  const S = { ctx, k, wk, T, rnd };
  // Short forms.
  const add = (geo, mat, x = 0, y = 0, z = 0, col = 0xffffff, lod = 1, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => ctx.add(geo, mat, T(x, y, z, ry, rx, rz, sx, sy, sz), col, lod);
  const addG = (geo, mat, col = 0xffffff, lod = 1) => ctx.add(geo, mat, null, col, lod);
  const jit = (hex, a = 0.9, b = 1.08) => { const c = new THREE.Color(hex), f = a + (b - a) * rnd(); return c.multiplyScalar(f).getHex(); };
  Object.assign(S, { add, addG, jit });

  paintGround(S);
  water(S);
  banks(S);
  bridge(S);
  weirAndStones(S);
  pond(S);
  oakTree(S);
  wood(S);
  bandstand(S);
  furniture(S);
  playground(S);
  picnic(S);
}

// ------------------------------------------------------------------ the shoreline of the pond (from the terrain)
function shoreline(cx, cz, level, n = 96, grow = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, c = Math.cos(a), s = Math.sin(a);
    let lo = 0.2, hi = 9;
    for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (G(cx + c * mid, cz + s * mid) > level) hi = mid; else lo = mid; }
    const r = (lo + hi) / 2 + grow;
    pts.push([cx + c * r, cz + s * r, a, r]);
  }
  return pts;
}
let shoreCache = null;
const pondShore = () => shoreCache || (shoreCache = shoreline(POND.x, POND.z, POND.water + 0.005));

// ------------------------------------------------------------------ painting the ground
function paintGround(S) {
  const { ctx, rnd } = S, g = ctx.ground;
  const P = PK.paths;
  // Leaf-litter floor of the wood.
  const W = { x0: 6.4, x1: 19.5, z0: -47, z1: -32.6 };
  g.rect(W.x0, W.z0, W.x1, W.z1, { type: 'grass', color: '#5f7039', alpha: 0.6 });
  for (let i = 0; i < 70; i++) {
    const x = W.x0 + rnd() * (W.x1 - W.x0), z = W.z0 + rnd() * (W.z1 - W.z0);
    if (Math.abs(z - streamZ(x)) < 2.6) continue;
    g.circle(x, z, 0.5 + rnd() * 1.3, { type: rnd() < 0.5 ? 'dirt' : 'grass', color: rnd() < 0.5 ? '#5d4c34' : '#4c5a30', alpha: 0.35 });
  }
  // Mown lawns: the north lawn below the allotments (down to the stream bank), the pond lawn, the play area.
  const lawnEdge = (x) => Math.min(-26, streamZ(x) + 2.2 + 0.25 * Math.sin(x * 1.7));
  const lawn = [[-10.5, -24.45], [16.5, -24.45]];
  for (let x = 16.5; x >= -10.5; x -= 1.5) lawn.push([x, lawnEdge(x)]);
  g.poly(lawn, { type: 'grass', color: '#6f8d3f' });
  for (let i = 0, x = -10.5; x < 16.5; x += 1.35, i++) {
    if (i % 2) continue;
    const pts = [[x, -24.5], [x + 1.35, -24.5]];
    for (let xx = x + 1.35; xx >= x - 0.01; xx -= 0.45) pts.push([xx, lawnEdge(xx)]);
    g.poly(pts, { type: 'grass', color: '#7a9a46', alpha: 0.5 });
  }
  const pl = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * TAU, r = 6.9 + 0.5 * Math.sin(a * 3 + 1); pl.push([-7.0 + Math.cos(a) * r, -37.6 + Math.sin(a) * r]); }
  g.poly(pl, { type: 'grass', color: '#6c8a3e', alpha: 0.9 });
  const PA = PK.play;
  g.rect(PA.x0 - 1.4, PA.z0 - 1.4, PA.x1 + 1.4, PA.z1 + 1.4, { type: 'grass', color: '#6e8b3f' });
  for (const b of [PK.benchFlask, PK.benchPond]) g.circle(b.x, b.z, 0.9, { type: 'dirt', color: '#74603f', alpha: 0.45 });
  // Paths: a verge of packed earth, then gravel with a paler wheel-worn middle.
  const gravel = (pts, w, per = 5) => {
    const sp = smoothPath(pts, per);
    g.path(sp, w + 0.5, { type: 'dirt', color: '#6f6247', alpha: 0.55 });
    g.path(sp, w, { type: 'gravel', color: '#a89d86' });
    g.path(sp, w * 0.55, { type: 'gravel', color: '#b3a88f', alpha: 0.5 });
  };
  for (const key of Object.keys(P)) gravel(P[key].pts, P[key].w);
  g.circle(PK.gate.x + 0.2, PK.gate.z - 0.7, 1.7, { type: 'gravel', color: '#a89d86' });
  const B = PK.bandstand;
  g.circle(B.x, B.z, 3.35, { type: 'dirt', color: '#6f6247', alpha: 0.5 });
  g.circle(B.x, B.z, 3.0, { type: 'gravel', color: '#a89d86' });
  // Dirt tracks in the wood; a deer track along the slalom row.
  const wp = smoothPath(PK.woodPath, 5);
  g.path(wp, 1.55, { type: 'dirt', color: '#5f4d36', alpha: 0.7 });
  g.path(wp, 0.9, { type: 'dirt', color: '#76603f', alpha: 0.6 });
  const S2 = PK.slalom;
  g.path([[S2.x0 - 2, S2.z + 0.3], [S2.x0 + 6, S2.z - 0.2], [S2.x0 + S2.dx * S2.n, S2.z + 0.2]], 0.55, { type: 'dirt', color: '#6a5740', alpha: 0.45 });
  // Bare earth and roots under the big oak, scuffed under the rope swing.
  const O = oakSpec(), SW = swingInfo();
  g.circle(O.x, O.z, 1.6, { type: 'soil', color: '#4f3e2c', alpha: 0.7 });
  g.circle(O.x, O.z, 3.0, { type: 'dirt', color: '#5d4c34', alpha: 0.35 });
  g.circle(SW.hang[0], SW.hang[2], 0.95, { type: 'dirt', color: '#7a6244', alpha: 0.9 });
  g.circle(SW.hang[0], SW.hang[2], 0.55, { type: 'soil', color: '#6a5238', alpha: 0.6 });
  // Play area: wood-chip safety surface; darker under the swings, the roundabout and the slide's foot.
  g.rect(PA.x0 + 0.05, PA.z0 + 0.05, PA.x1 - 0.05, PA.z1 - 0.05, { type: 'dirt', color: '#7d6544' });
  const PI = playInfo();
  g.rect(PI.sw.x - 2.0, PI.sw.z - 1.4, PI.sw.x + 2.0, PI.sw.z + 1.4, { type: 'soil', color: '#5d4630', alpha: 0.7 });
  g.circle(PI.rb.x, PI.rb.z, 1.5, { type: 'soil', color: '#5d4630', alpha: 0.5 });
  const sl = slideInfo();
  g.circle(sl.x1 + 0.2, sl.cz, 0.7, { type: 'soil', color: '#5d4630', alpha: 0.6 });
  // Mud and trampled earth round the pond; a pebble beach at the jetty; wet banks along the stream.
  const sh = pondShore();
  g.poly(sh.map((p) => [POND.x + Math.cos(p[2]) * (p[3] + 1.0), POND.z + Math.sin(p[2]) * (p[3] + 1.0)]), { type: 'dirt', color: '#5e4e38', alpha: 0.35 });
  g.poly(sh.map((p) => [POND.x + Math.cos(p[2]) * (p[3] + 0.45 + 0.2 * Math.sin(p[2] * 5)), POND.z + Math.sin(p[2]) * (p[3] + 0.45 + 0.2 * Math.sin(p[2] * 5))]), { type: 'soil', color: '#4a3d2c', alpha: 0.7 });
  g.circle(PK.jetty.x, PK.jetty.z + 0.3, 1.5, { type: 'gravel', color: '#8e8672', alpha: 0.8 });
  const sc = [];
  for (let x = -19.8; x <= 19.8; x += 0.8) sc.push([x, streamZ(x)]);
  g.path(sc, 3.6, { type: 'dirt', color: '#5e5038', alpha: 0.4 });
  g.path(sc, 2.0, { type: 'dirt', color: '#51442f', alpha: 0.55 });
  g.path(sc, 1.5, { type: 'gravel', color: '#6c6756', alpha: 0.9 });
  // The bluebell glade: a haze of blue-violet over the leaf litter.
  const GL = PK.glade;
  g.circle(GL.x, GL.z, GL.r * 1.05, { type: 'grass', color: '#5d7a42', alpha: 0.6 });
  for (let i = 0; i < 46; i++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * GL.r * 1.02;
    g.circle(GL.x + Math.cos(a) * r, GL.z + Math.sin(a) * r, 0.5 + rnd() * 0.7, { type: 'grass', color: rnd() < 0.7 ? '#8a92c8' : '#9892c4', alpha: 0.24 });
  }
  // The picnic: trodden grass under the blanket.
  const PN = picnicInfo();
  g.circle(PN.x, PN.z, 1.5, { type: 'grass', color: '#6a8a3c', alpha: 0.9 });
  g.poly([[-1, -0.8], [1, -0.8], [1, 0.8], [-1, 0.8]].map(([a, b]) => frameAt(PN, a * PN.w / 2 * 1.02, b * PN.d / 2 * 1.02)), { type: 'gravel', color: '#c9b9a8' });
  // Shadows of the big structures.
  const bi = bandstandInfo();
  g.shadowCircle(B.x, B.z, 2.6, bi.top - G(B.x, B.z) + 3.3, 0.38);
  g.shadowRect(PI.cf.x - 0.6, PI.cf.z - 0.6, PI.cf.x + 0.6, PI.cf.z + 0.6, 2.0, 0.35);
  g.shadowRect(PI.sw.x - 1.8, PI.sw.z - 0.05, PI.sw.x + 1.8, PI.sw.z + 0.05, 2.2, 0.28);
}

// ------------------------------------------------------------------ water
let rippleTex = null;
function ripples() {
  if (rippleTex) return rippleTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), r = mulberry(5);
  x.clearRect(0, 0, 256, 256);
  x.lineCap = 'round';
  for (let i = 0; i < 50; i++) {
    const px = r() * 256, py = r() * 256, len = 8 + r() * 24, a = (r() - 0.5) * 0.5, al = 0.07 + r() * 0.2, lw = 0.8 + r() * 1.4, wob = (r() - 0.5) * 5;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      x.strokeStyle = `rgba(235,245,240,${al})`;
      x.lineWidth = lw;
      x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(px + ox + len / 2, py + oy + Math.sin(a) * 6 + wob, px + ox + len * Math.cos(a), py + oy + len * Math.sin(a)); x.stroke();
    }
  }
  rippleTex = new THREE.CanvasTexture(c);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.colorSpace = THREE.SRGBColorSpace; rippleTex.anisotropy = 4;
  return rippleTex;
}
const faceUp = (g) => {
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.index.needsUpdate = true; g.computeVertexNormals(); }
  return g;
};
function water(S) {
  const { ctx, wk } = S;
  const W = PK.weir, wl = STREAM.water, hw = 1.12;
  // The stream: two strips along streamZ (the lower after the weir).
  const strip = (x0, x1, y, step = 0.5) => {
    const pos = [], uv = [], idx = [];
    const n = Math.max(1, Math.round((x1 - x0) / step));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, zc = streamZ(x);
      pos.push(x, y, zc - hw, x, y, zc + hw);
      uv.push(x * 0.45, 0, x * 0.45, 1);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return faceUp(g);
  };
  const x0 = BOUNDS.minX - 0.5, x1 = BOUNDS.maxX + 0.5;
  // Cut at the world's 12 m chunk lines so each piece is drawn with its own chunk.
  const pieces = (a, b) => {
    const cuts = [a]; for (let c = Math.ceil((a + 0.01) / 12) * 12; c < b - 0.01; c += 12) cuts.push(c); cuts.push(b);
    return cuts.slice(0, -1).map((c, i) => [c, cuts[i + 1]]);
  };
  const tex = ripples();
  const rm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.3, metalness: 0, color: 0xe8f2ee });
  rm.name = 'park-ripple';
  const foamTex = tex.clone(); foamTex.needsUpdate = true; foamTex.repeat.set(2.2, 1.4);
  const fm = new THREE.MeshStandardMaterial({ map: foamTex, transparent: true, opacity: 0.8, depthWrite: false, roughness: 0.4, color: 0xffffff });
  fm.name = 'park-foam';
  for (const [a, b] of pieces(W.x + 0.14, x1)) {
    ctx.add(strip(a, b, wl), wk.water, null, 0xffffff, 0);
    const rip = new THREE.Mesh(strip(a, b, wl + 0.004), rm); rip.renderOrder = 3; rip.matrixAutoUpdate = false; ctx.object(rip, 1);
  }
  for (const [a, b] of pieces(x0, W.x - 0.14)) {
    ctx.add(strip(a, b, wl - W.drop), wk.water, null, 0xe8f0ee, 0);
    const rip = new THREE.Mesh(strip(a, b, wl - W.drop + 0.004), rm); rip.renderOrder = 3; rip.matrixAutoUpdate = false; ctx.object(rip, 1);
  }
  const foam = new THREE.Mesh(strip(W.x - 2.0, W.x - 0.14, wl - W.drop + 0.006, 0.25), fm);
  foam.renderOrder = 4; foam.matrixAutoUpdate = false;
  ctx.object(foam, 1);

  // The pond: a fan out to its shoreline, and a ripple layer drifting on the wind.
  const sh = pondShore();
  const pos = [POND.x, POND.water, POND.z], uv = [POND.x * 0.4, POND.z * 0.4], idx = [];
  sh.forEach((p) => { const r = p[3] + 0.06, x = POND.x + Math.cos(p[2]) * r, z = POND.z + Math.sin(p[2]) * r; pos.push(x, POND.water, z); uv.push(x * 0.4, z * 0.4); });
  for (let i = 0; i < sh.length; i++) idx.push(0, 1 + i, 1 + (i + 1) % sh.length);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  pg.setIndex(idx); faceUp(pg);
  ctx.add(pg, wk.water, null, 0xdfe8e0, 0);
  const pr = pg.clone(); pr.translate(0, 0.004, 0);
  const pm = rm.clone(); pm.map = tex.clone(); pm.map.needsUpdate = true; pm.map.repeat.set(0.9, 0.9); pm.opacity = 0.4; pm.name = 'park-pond-ripple';
  const prm = new THREE.Mesh(pr, pm); prm.renderOrder = 3; prm.matrixAutoUpdate = false;
  ctx.object(prm, 1);

  let t = 0;
  ctx.update((dt) => {
    t += dt;
    tex.offset.x += dt * 0.16;
    foamTex.offset.x += dt * 0.55;
    pm.map.offset.x += dt * 0.012; pm.map.offset.y = Math.sin(t * 0.1) * 0.04;
  });
}

// ------------------------------------------------------------------ banks: reeds, rushes, irises, boulders, meadow flowers
function banks(S) {
  const { ctx, k, rnd, add, addG, jit } = S;
  const wl = STREAM.water;
  const reedMat = ctx.sway(k.leaf, { baseY: wl - 0.12, height: 1.7, amount: 1.3 });
  const reeds = [0, 1, 2, 3, 4, 5].map((i) => reedGeometry(mulberry(100 + i), 9, 0.9, 1.7, { width: 0.02, curve: 0.45 }));
  const sedge = [0, 1, 2, 3].map((i) => reedGeometry(mulberry(200 + i), 12, 0.28, 0.6, { width: 0.016, curve: 0.9 }));
  const iris = [0, 1, 2].map((i) => reedGeometry(mulberry(300 + i), 7, 0.5, 0.85, { width: 0.032, curve: 0.25 }));
  const greens = [0x6b8a40, 0x7a9548, 0x86904c, 0x60803c, 0x93a05a];
  const bx = PK.bridge.x, st = PK.stones.x, wx = PK.weir.x;
  const clear = (x) => Math.abs(x - bx) < 1.15 || Math.abs(x - wx) < 0.9 || Math.abs(x - st) < 0.5;
  // The water's edge on one side of the stream at x: the first dry point going outwards.
  const edge = (x, side) => {
    const zc = streamZ(x);
    for (let d = 0.45; d < 2.0; d += 0.04) { const z = zc + side * d; if (G(x, z) > wl - 0.02) return z; }
    return zc + side * 1.2;
  };
  for (let x = -19.2; x < 19.4; x += 0.38) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.34 || clear(x)) continue;
      const ze = edge(x, side), z = ze + side * rnd() * 0.35, y = G(x, z);
      const r = rnd();
      if (r < 0.46) add(reeds[(rnd() * 6) | 0], reedMat, x + (rnd() - 0.5) * 0.3, y - 0.03, z, jit(greens[(rnd() * 5) | 0], 0.85, 1.05), 1, rnd() * TAU);
      else if (r < 0.8) add(sedge[(rnd() * 4) | 0], reedMat, x, y - 0.02, z + side * 0.25, jit(greens[(rnd() * 5) | 0], 0.8, 1.0), 1, rnd() * TAU);
      else if (r < 0.9) {
        add(iris[(rnd() * 3) | 0], reedMat, x, y - 0.03, z, jit(0x6f9446, 0.9, 1.08), 1, rnd() * TAU);
        for (let f = 0; f < 2; f++) add(new THREE.SphereGeometry(0.035, 7, 5), k.petal, x + (rnd() - 0.5) * 0.12, y + 0.5 + rnd() * 0.2, z + (rnd() - 0.5) * 0.12, 0xe6c52e, 2, 0, 0, 0, 1, 0.7, 1.3);
      } else addBulrush(S, x, z, y, reedMat);
    }
  }
  // Boulders along the banks (mossy on the shady side).
  for (const b of bankBoulders()) stone(S, b.x, b.y, b.z, b.r, b.x * 3.1);
  // Wild flowers in the long grass: ox-eye daisies, buttercups, red campion, cow parsley and teasels; fine detail.
  const stemMat = ctx.sway(k.leaf, { baseY: FY, height: 1.4, amount: 1.1 });
  const flowers = (n, test, build) => {
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const x = -19 + rnd() * 38, z = -48 + rnd() * 23.4;
      if (!test(x, z)) continue;
      i++;
      build(x, G(x, z), z);
    }
  };
  const inMeadow = (x, z) => {
    if (Math.abs(z - streamZ(x)) < 1.6) return false;
    if (z > -26.2 && x > -10.5 && x < 16.5 && z > Math.min(-26, streamZ(x) + 2.2)) return false;     // the mown lawn
    if (distSeg(x, z, [[-7.5, -33.8], [-5.8, -34.5], [-0.6, -33.6], [4.8, -33.7]]) < 1.4) return false;
    if (Math.hypot(x + 7, z + 37.6) < 5.5 || Math.hypot(x - POND.x, z - POND.z) < 5) return false;
    const P = PK.play; if (x > P.x0 - 1.6 && x < P.x1 + 1.6 && z > P.z0 - 1.6 && z < P.z1 + 1.6) return false;
    if (x > 6.8 && z < -32.5 && z > -47) return false;                                                // the wood
    if (Math.hypot(x - PK.bandstand.x, z - PK.bandstand.z) < 3.4 || Math.hypot(x - PK.picnic.x, z - PK.picnic.z) < 2) return false;
    return G(x, z) > wl + 0.15;
  };
  const daisy = new THREE.CircleGeometry(0.028, 7).rotateX(-Math.PI / 2 + 0.25);
  const stem = (h, ang) => new THREE.PlaneGeometry(0.008, h).translate(0, h / 2, 0).rotateY(ang);
  flowers(130, inMeadow, (x, y, z) => {
    const h = 0.3 + rnd() * 0.25, kind = rnd();
    const cols = kind < 0.4 ? [0xf5f2e6, 0xe8c52c] : kind < 0.7 ? [0xf0cf30, 0xf0cf30] : kind < 0.88 ? [0xb94a73, 0xb94a73] : [0xe9e6d8, 0xe9e6d8];
    for (let n = 0, cnt = 2 + ((rnd() * 4) | 0); n < cnt; n++) {
      const dx = (rnd() - 0.5) * 0.35, dz = (rnd() - 0.5) * 0.35, hh = h * (0.7 + rnd() * 0.5);
      add(stem(hh, rnd() * 3), stemMat, x + dx, y, z + dz, 0x6c8a3e, 2);
      add(daisy, k.petal, x + dx, y + hh, z + dz, jit(cols[0], 0.92, 1.0), 2, rnd() * TAU);
      if (kind < 0.4) add(new THREE.SphereGeometry(0.011, 5, 4), k.petal, x + dx, y + hh + 0.004, z + dz, cols[1], 2);
    }
  });
  // Cow parsley and tall grass seed heads along the hedge line and the stream's far banks.
  const umbel = new THREE.CircleGeometry(0.075, 8).rotateX(-Math.PI / 2 + 0.15);
  flowers(46, (x, z) => inMeadow(x, z) && (z > -27.5 || Math.abs(z - streamZ(x)) < 3.6), (x, y, z) => {
    const h = 0.7 + rnd() * 0.45;
    add(stem(h, rnd() * 3), stemMat, x, y, z, 0x739346, 2);
    add(umbel, k.petal, x, y + h, z, 0xf2f0e6, 2, rnd() * TAU);
    add(umbel, k.petal, x + 0.06, y + h * 0.78, z + 0.04, 0xeeece0, 2, rnd() * TAU, 0, 0, 0.7, 0.7, 0.7);
  });
  // Dock and nettle leaf rosettes.
  const dock = new THREE.CircleGeometry(0.2, 7).rotateX(-Math.PI / 2);
  flowers(40, inMeadow, (x, y, z) => {
    for (let i = 0; i < 3; i++) add(dock, k.leaf, x + (rnd() - 0.5) * 0.2, y + 0.07 + i * 0.03, z + (rnd() - 0.5) * 0.2, jit(0x587a35, 0.8, 1.05), 2, rnd() * TAU, 0.18, (rnd() - 0.5) * 0.3, 0.9, 1, 1.3);
  });
}

function addBulrush(S, x, z, y, mat) {
  const { k, rnd, add, addG, jit } = S;
  const n = 2 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const dx = (rnd() - 0.5) * 0.25, dz = (rnd() - 0.5) * 0.25, h = 1.35 + rnd() * 0.6, lean = (rnd() - 0.5) * 0.12;
    const a = [x + dx, y - 0.04, z + dz], b = [x + dx + lean * h, y + h, z + dz + lean * h * 0.5];
    addG(rod(a, b, 0.008, 0.005, 5), mat, jit(0x728c45, 0.85, 1.05), 1);
    addG(rod([b[0] - lean * 0.15, b[1] - 0.2, b[2] - lean * 0.07], [b[0], b[1] - 0.02, b[2]], 0.02, 0.017, 6), k.wood, 0x5a3a24, 1);
    addG(rod([b[0], b[1] - 0.02, b[2]], [b[0] + lean * 0.05, b[1] + 0.08, b[2]], 0.004, 0.002, 4), mat, 0x8a7a50, 2);
  }
  // Long ribbon leaves.
  add(reedGeometry(mulberry((x * 100) | 0), 5, 0.8, 1.2, { width: 0.016, curve: 0.5 }), mat, x, y - 0.02, z, jit(0x6b8a40, 0.9, 1.05), 1);
}

// A boulder: a flattened blob, tinted grey-brown with moss on some.
function stone(S, x, y, z, r, seed) {
  const { ctx, add, jit } = S;
  const mossy = Math.sin(seed * 12.9898) > 0.1;
  add(ctx.blobGeometry(r, 1, seed, 0.2), S.k.stone, x, y, z, jit(mossy ? 0x6c7260 : 0x7d786d, 0.85, 1.05), 1, seed, 0, 0, 1.15, 0.78, 1);
  if (mossy) add(ctx.blobGeometry(r * 0.7, 1, seed + 3, 0.25), S.wk.leafy, x, y + r * 0.22, z, jit(0x5c7a3c, 0.85, 1.0), 1, seed, 0, 0, 1, 0.45, 1);
}

// ------------------------------------------------------------------ the footbridge
function bridge(S) {
  const { ctx, k, add, addG, jit, rnd } = S;
  const B = PK.bridge, I = bridgeInfo(), hw = B.w / 2, Lh = B.len / 2, top = I.deckTop;
  const P = (lx, lz) => frameAt(B, lx, lz);
  const at = (geo, mat, lx, y, lz, col, lod, ry = 0, rx = 0, rz = 0) => { const [x, z] = P(lx, lz); add(geo, mat, x, y, z, col, lod, B.yaw + ry, rx, rz); };
  const oak = 0x8a7a62, oakDark = 0x6f6150;
  // Stringers (three), a baulk under each end, and a solid deck block that carries the planks from far away.
  for (const lx of [-hw + 0.1, 0, hw - 0.1]) at(boxUV(0.1, 0.16, B.len + 0.1, 1), k.weathered, lx, top - 0.14, 0, oakDark, 0);
  for (const sg of [-1, 1]) {
    const [ex, ez] = P(0, sg * (Lh - 0.12)), g = G(ex, ez);
    at(boxUV(B.w, I.under - g + 0.25, 0.28, 1), k.weathered, 0, (I.under + g - 0.25) / 2 + 0.0, sg * (Lh - 0.12), 0x7c6e5a, 0);
    at(boxUV(B.w + 0.3, 0.12, 0.7, 1), k.stone, 0, g - 0.02, sg * (Lh - 0.12), 0x6e6b62, 1);
  }
  // Deck planks laid across, with gaps and worn edges.
  const np = Math.round(B.len / 0.155);
  for (let i = 0; i < np; i++) {
    const lz = -Lh + (i + 0.5) * B.len / np;
    at(boxUV(B.w + 0.06, 0.05, B.len / np - 0.012, 1), k.weathered, 0, top - 0.025 + (rnd() - 0.5) * 0.004, lz, jit(oak, 0.82, 1.1), 1);
  }
  // Kick boards and the posts and rails.
  for (const sx of [-1, 1]) {
    const lx = sx * (hw - 0.04);
    at(boxUV(0.035, 0.1, B.len, 1), k.weathered, sx * (hw + 0.005), top + 0.06, 0, oakDark, 1);
    const n = 5, zs = [];
    for (let i = 0; i < n; i++) zs.push(-Lh + 0.12 + i * (2 * Lh - 0.24) / (n - 1));
    for (const lz of zs) {
      at(boxUV(0.1, 1.0, 0.1, 1), k.weathered, lx, top + 0.49, lz, jit(oak, 0.85, 1.0), 1);
      at(new THREE.ConeGeometry(0.075, 0.07, 4).rotateY(Math.PI / 4), k.weathered, lx, top + 1.035, lz, 0x7b6c58, 1);
    }
    const len = zs[n - 1] - zs[0];
    at(boxUV(0.09, 0.06, len + 0.1, 1), k.weathered, lx, top + 0.97, (zs[0] + zs[n - 1]) / 2, jit(oak, 0.9, 1.05), 1);
    at(boxUV(0.05, 0.05, len, 1), k.weathered, lx, top + 0.66, (zs[0] + zs[n - 1]) / 2, oakDark, 1);
    at(boxUV(0.04, 0.04, len, 1), k.weathered, lx, top + 0.35, (zs[0] + zs[n - 1]) / 2, oakDark, 2);
    for (let i = 0; i < 17; i++) { const lz = zs[0] + 0.1 + i * (len - 0.2) / 16; at(boxUV(0.025, 0.58, 0.025, 1), k.weathered, lx, top + 0.62, lz, oakDark, 2); }
  }
  // Steps at both ends.
  for (const sg of [-1, 1]) for (let s = 1; s <= 2; s++) {
    const lz = sg * (Lh + 0.22 + (s - 1) * 0.42), [sx, sz] = P(0, lz), g0 = G(sx, sz), stop = top - s * 0.21;
    at(boxUV(B.w, stop - g0 + 0.15, 0.42, 1), k.weathered, 0, (stop + g0 - 0.15) / 2, lz, jit(0x7a6c58, 0.9, 1.05), 1);
    at(boxUV(B.w + 0.04, 0.045, 0.43, 1), k.weathered, 0, stop - 0.022, lz, jit(oak, 0.85, 1.1), 1);
  }
  ctx.ground.shadowRect(P(-hw, -Lh)[0] - 0.1, Math.min(P(0, -Lh)[1], P(0, Lh)[1]), P(hw, Lh)[0] + 0.1, Math.max(P(0, -Lh)[1], P(0, Lh)[1]), 0.5, 0.3);
}

// ------------------------------------------------------------------ the weir and stepping stones
function weirAndStones(S) {
  const { ctx, k, add, jit, rnd } = S;
  const V0 = PK.weir, wl = STREAM.water;
  const P = (lx, lz) => frameAt(V0, lx, lz);
  const at = (geo, mat, lx, y, lz, col, lod, ry = 0) => { const [x, z] = P(lx, lz); add(geo, mat, x, y, z, col, lod, V0.yaw + ry); };
  // The lip: a concrete-and-stone step across the channel with a timber capping.
  const bot = STREAM.bed - 0.3, h = wl + 0.1 - bot;
  at(boxUV(0.26, h, 3.0, 1), k.stone, 0, bot + h / 2, 0, 0x77746b, 0);
  at(boxUV(0.34, 0.07, 3.0, 1), k.weathered, 0, wl + 0.115, 0, 0x7b6c58, 1);
  // Wing walls of brick-and-stone against the banks, with dressed stone caps.
  for (const sg of [-1, 1]) {
    const [px, pz] = P(0, sg * 1.62), g = G(px, pz), hh = g + 0.25 - bot;
    at(boxUV(0.6, hh, 0.56, 1), k.stone, 0, bot + hh / 2, sg * 1.62, jit(0x716e64, 0.9, 1.05), 0);
    at(boxUV(0.66, 0.07, 0.62, 1), k.stone, 0, g + 0.26, sg * 1.62, 0x8e8a7f, 1);
    // Sluice posts.
    at(boxUV(0.14, 0.9, 0.14, 1), k.weathered, 0, wl + 0.1 + 0.45, sg * 1.3, jit(0x6b5d4a, 0.9, 1.0), 1);
  }
  at(boxUV(0.12, 0.12, 2.74, 1), k.weathered, 0, wl + 0.95, 0, 0x6b5d4a, 1);
  // Stop boards stacked in the slot and green slime on the face.
  for (let i = 0; i < 3; i++) at(boxUV(0.05, 0.13, 2.4, 1), k.weathered, 0.16, wl + 0.2 + i * 0.14, 0, jit(0x7d6f5a, 0.85, 1.0), 2);
  // Stepping stones.
  for (const s of steppingStones()) {
    const g = ctx.blobGeometry(s.r, 1, s.x * 7, 0.12);
    add(g, k.stone, s.x, s.top - s.r * 0.42, s.z, jit(0x77736a, 0.85, 1.05), 1, s.x, 0, 0, 1.12, 0.46, 1.08);
  }
}

// ------------------------------------------------------------------ the pond: jetty, boat, lilies, reeds, ducks
function pond(S) {
  const { ctx, k, add, addG, jit, rnd } = S;
  const J = PK.jetty, I = jettyInfo(), hw = J.w / 2, top = I.deckTop;
  const cz = J.z - J.len / 2;
  const oak = 0x86775f;
  // Jetty: stringers, bearers, planks, piles, mooring post.
  for (const sx of [-0.45, 0, 0.45]) add(boxUV(0.1, 0.16, J.len, 1), k.weathered, J.x + sx, top - 0.14, cz, 0x66584a, 0);
  for (const [px, pz] of I.piles) {
    const gp = Math.min(G(px, pz), POND.bed) - 0.05;
    addG(rod([px, gp, pz], [px, top + 0.12, pz], 0.075, 0.07, 7), k.weathered, jit(0x5d503f, 0.85, 1.05), 0);
  }
  for (let i = 0; i <= 3; i++) {
    const pz = J.z - 0.25 - i * (J.len - 0.5) / 3;
    add(boxUV(J.w + 0.1, 0.12, 0.12, 1), k.weathered, J.x, top - 0.2, pz, 0x5f5242, 1);
  }
  const npl = Math.round(J.len / 0.155);
  for (let i = 0; i < npl; i++) add(boxUV(J.w, 0.05, J.len / npl - 0.012, 1), k.weathered, J.x, top - 0.025, J.z - (i + 0.5) * J.len / npl, jit(oak, 0.78, 1.1), 1);
  // Landing steps at the shore end.
  for (let s = 1; s <= 2; s++) {
    const sz = J.z + 0.15 + s * 0.4, g = G(J.x, sz), stop = top - s * 0.18;
    add(boxUV(J.w, stop - g + 0.15, 0.4, 1), k.weathered, J.x, (stop + g - 0.15) / 2, sz, 0x6c5e4c, 1);
    add(boxUV(J.w + 0.04, 0.045, 0.41, 1), k.weathered, J.x, stop - 0.022, sz, jit(oak, 0.85, 1.1), 1);
  }
  const post = [J.x - hw + 0.1, J.z - J.len + 0.1];
  addG(rod([post[0], top, post[1]], [post[0], top + 0.55, post[1]], 0.075, 0.065, 7), k.weathered, 0x62544a, 1);
  add(new THREE.SphereGeometry(0.075, 8, 6), k.weathered, post[0], top + 0.55, post[1], 0x62544a, 1, 0, 0, 0, 1, 0.6, 1);
  // A coil of rope on the deck and a lifebelt hung on the first pair of posts' rail.
  addG(new THREE.TorusGeometry(0.1, 0.014, 5, 14).rotateX(-Math.PI / 2).translate(post[0] + 0.3, top + 0.02, post[1] + 0.35), k.fabric, 0xc7b58a, 2);
  // Rowing boat moored alongside with a bow line to the end pile.
  boat(S);

  // Lily pads and flowers on open water.
  const sh = pondShore();
  const padMat = k.leaf;
  const ducksAt = { x: -7.9, z: -40.4, r: 1.7 };
  const nearBoat = (x, z) => Math.hypot(x - PK.boat.x, z - PK.boat.z) < 1.9;
  const nearJetty = (x, z) => Math.abs(x - J.x) < 1.5 && z < J.z + 0.5 && z > J.z - J.len - 1.0;
  let pads = 0;
  for (let tries = 0; pads < 46 && tries < 600; tries++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * 3.3, x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    if (G(x, z) > POND.water - 0.1 || nearBoat(x, z) || nearJetty(x, z) || Math.hypot(x - ducksAt.x, z - ducksAt.z) < ducksAt.r) continue;
    // Clustered: favour the west and south.
    if (rnd() > 0.45 + 0.5 * Math.max(0, -Math.cos(a - 0.4))) continue;
    pads++;
    const rr = 0.1 + rnd() * 0.12;
    addG(new THREE.CircleGeometry(rr, 12, 0.3, TAU - 0.5).rotateX(-Math.PI / 2).rotateY(rnd() * TAU).translate(x, POND.water + 0.012, z), padMat, jit(0x4f7a3a, 0.8, 1.15), 1);
    if (rnd() < 0.16) {
      const pink = rnd() < 0.35, col = pink ? 0xe9b5c5 : 0xf5f1e4;
      for (let p = 0; p < 7; p++) addG(new THREE.ConeGeometry(0.03, 0.09, 4).translate(0, 0.04, 0).rotateZ(1.0).rotateY(p / 7 * TAU).translate(x, POND.water + 0.02, z), k.petal, col, 2);
      addG(new THREE.SphereGeometry(0.02, 6, 5).translate(x, POND.water + 0.04, z), k.petal, 0xe6c32e, 2);
    }
  }
  // Reeds, rushes and bulrushes round the shore (not by the jetty or the boat), and shore stones.
  const reedMat = ctx.sway(k.leaf, { baseY: POND.water - 0.12, height: 1.7, amount: 1.3 });
  const reeds = [0, 1, 2, 3].map((i) => reedGeometry(mulberry(400 + i), 10, 0.9, 1.8, { width: 0.02, curve: 0.45 }));
  for (const p of sh) {
    const ang = p[2];
    if (rnd() < 0.34) continue;
    const r = p[3] - 0.05 + rnd() * 0.5, x = POND.x + Math.cos(ang) * r, z = POND.z + Math.sin(ang) * r;
    if (nearJetty(x, z) || Math.hypot(x - J.x, z - J.z) < 1.5 || nearBoat(x, z) && rnd() < 0.6) continue;
    const y = G(x, z);
    if (rnd() < 0.62) add(reeds[(rnd() * 4) | 0], reedMat, x, y - 0.03, z, jit(0x6f8e43, 0.85, 1.08), 1, rnd() * TAU);
    else addBulrush(S, x, z, y, reedMat);
  }
  for (const b of pondStones()) stone(S, b.x, b.y, b.z, b.r, b.x * 2.3);
  // Ducks.
  ducks(S);
}

function boat(S) {
  const { ctx, k, add, addG, jit } = S;
  const B = PK.boat, wl = POND.water;
  const P = (lx, lz) => frameAt(B, lx, lz);
  const NS = 16, rows = [[0, -0.14, 0.0], [0.22, -0.1, 0.62], [0.39, -0.02, 0.8], [0.62, 0.1, 0.9], [0.82, 0.22, 0.97], [1.0, 0.36, 1.0]];
  // A section: for station t along the boat (0 stern, 1 bow), half-width and height of each row.
  const half = (t) => { const e = Math.abs(2 * t - 1); return (B.B / 2) * (t < 0.5 ? 0.62 + 0.38 * Math.sqrt(1 - e * e * 0.7) : Math.pow(1 - Math.pow(e, 2.2), 0.55)); };
  const sheer = (t) => 0.05 * Math.pow(2 * t - 1, 2) * 1.0 + 0.0;
  const point = (t, j, inset) => {
    const [, y, f] = rows[j], hwid = Math.max(0.02, half(t) * f - inset), lz = (0.5 - t) * B.L;     // bow towards -z
    return [hwid, wl + y + (j >= 4 ? sheer(t) : 0) - (inset ? 0 : 0), lz];
  };
  const loft = (j0, j1, inset, flip) => {
    const pos = [], uv = [];
    for (let s = 0; s < NS; s++) {
      const t0 = s / NS, t1 = (s + 1) / NS;
      for (let j = j0; j < j1; j++) for (const side of [-1, 1]) {
        const a = point(t0, j, inset), b = point(t1, j, inset), c = point(t1, j + 1, inset), d = point(t0, j + 1, inset);
        const q = [a, b, c, d].map((p) => [side * p[0], p[1], p[2]]);
        const order = (side > 0) !== !!flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const i of order) { pos.push(...q[i]); uv.push(q[i][2] * 1.5, q[i][1] * 4); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const [bx, bz] = P(0, 0);
  const place = (g, mat, col, lod) => ctx.add(g.clone().applyMatrix4(S.T(bx, 0, bz, B.yaw)), mat, null, col, lod);
  // Hull below the sheer strake in dark green, the top strakes cream; the inside bare varnished wood.
  place(loft(0, 4, 0, false), k.paint, 0x2d4a3c, 0);
  place(loft(3, 5, 0, false), k.paint, 0xe9e1cc, 0);
  place(loft(0, 5, 0.03, true), k.wood, 0xc9a16a, 0);
  // Gunwale and the stem and stern posts.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let s = 0; s <= NS; s++) { const t = s / NS, p = point(t, 5, 0); pts.push(V(side * p[0], p[1] + 0.012, p[2])); }
    addG(taperTube(new THREE.CatmullRomCurve3(pts), 0.026, 0.026, 24, 6).applyMatrix4(S.T(bx, 0, bz, B.yaw)), k.wood, 0x9a6b3e, 1);
  }
  // Floorboards, thwarts, stern seat.
  const loc = (lx, y, lz) => { const [x, z] = P(lx, lz); return [x, y, z]; };
  for (let i = 0; i < 7; i++) { const [x, y, z] = loc(0, wl + 0.035, -0.9 + i * 0.3); add(boxUV(B.B * 0.4, 0.02, 0.26, 1), k.wood, x, y, z, jit(0xb98f5c, 0.85, 1.05), 1, B.yaw); }
  for (const lz of [-0.35, 0.45]) {
    const [x, y, z] = loc(0, wl + 0.2, lz); add(boxUV(B.B * 0.86, 0.03, 0.2, 1), k.wood, x, y, z, 0xc09a66, 1, B.yaw);
  }
  { const [x, y, z] = loc(0, wl + 0.14, B.L * 0.4); add(boxUV(B.B * 0.6, 0.03, 0.26, 1), k.wood, x, y, z, 0xc09a66, 1, B.yaw); }
  // Oars shipped across the thwarts, blades out over the gunwale.
  for (const side of [-1, 1]) {
    const a = loc(side * 1.35, wl + 0.33, -0.1 + side * 0.1), b = loc(-side * 0.5, wl + 0.27, 0.45 + side * 0.04);
    addG(rod(a, b, 0.018, 0.016, 6), k.wood, 0xc4a070, 1);
    const [bxx, byy, bzz] = loc(side * 1.5, wl + 0.34, -0.1 + side * 0.1);
    add(boxUV(0.015, 0.1, 0.34, 1), k.paint, bxx, byy, bzz, 0xe9e1cc, 1, B.yaw, 0, side * 0.08);
  }
  // Bow line to the jetty's end pile, and a name on the bow (a pale plate).
  const J = PK.jetty, bow = loc(0, wl + 0.33, -B.L / 2 + 0.05), pile = [J.x - J.w / 2 + 0.08, jettyInfo().deckTop - 0.35, J.z - 0.25 - 3 * (J.len - 0.5) / 3];
  const mid = [(bow[0] + pile[0]) / 2, Math.min(bow[1], pile[1]) - 0.1, (bow[2] + pile[2]) / 2];
  addG(taperTube(new THREE.QuadraticBezierCurve3(V(...bow), V(...mid), V(...pile)), 0.012, 0.012, 8, 5), k.fabric, 0xb9a77c, 1);
}

// ------------------------------------------------------------------ ducks (live, a few draw calls)
function duckGeometry(kind) {
  const parts = [];
  const col = { body: kind === 'drake' ? 0x8b8d90 : kind === 'hen' ? 0x8d6b47 : 0xcaa24a, head: kind === 'drake' ? 0x2f6a45 : kind === 'hen' ? 0x9a7b55 : 0xd9b25a, breast: kind === 'drake' ? 0x6a4a3a : kind === 'hen' ? 0x80613f : 0xe6c870 };
  const P = (g, c, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => {
    g.scale(sx, sy, sz); if (rx) g.rotateX(rx); g.translate(x, y, z);
    const n = g.attributes.position.count, cc = new THREE.Color(c), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.index) g = g.toNonIndexed();
    parts.push(g);
  };
  const s = kind === 'duckling' ? 0.4 : 1;
  P(new THREE.SphereGeometry(0.1, 10, 8), col.body, 0, 0.065 * s, 0, 1.0 * s, 0.82 * s, 1.75 * s);
  P(new THREE.SphereGeometry(0.075, 8, 6), col.breast, 0, 0.07 * s, -0.1 * s, 1.0 * s, 0.9 * s, 1.0 * s);
  P(new THREE.ConeGeometry(0.05, 0.14, 6), kind === 'drake' ? 0x2a2a2e : col.body, 0, 0.1 * s, 0.2 * s, 1 * s, 1 * s, 0.7 * s, Math.PI / 2 + 0.5);
  P(new THREE.CylinderGeometry(0.03, 0.045, 0.14, 7), col.head, 0, 0.17 * s, -0.14 * s, s, s, s, -0.45);
  P(new THREE.SphereGeometry(0.052, 9, 7), col.head, 0, 0.245 * s, -0.19 * s, s, s * 0.95, s * 1.1);
  P(new THREE.BoxGeometry(0.04, 0.016, 0.075), kind === 'drake' ? 0xd9b83a : 0xc9893a, 0, 0.235 * s, -0.255 * s, s, s, s);
  if (kind === 'drake') P(new THREE.TorusGeometry(0.038, 0.007, 4, 10), 0xf1efe8, 0, 0.19 * s, -0.17 * s, 1, 1, 1, Math.PI / 2 + 0.45);
  P(new THREE.SphereGeometry(0.008, 4, 3), 0x151515, 0.04 * s, 0.255 * s, -0.2 * s);
  P(new THREE.SphereGeometry(0.008, 4, 3), 0x151515, -0.04 * s, 0.255 * s, -0.2 * s);
  // Wing patches.
  P(new THREE.SphereGeometry(0.07, 7, 5), kind === 'drake' ? 0x6f7376 : col.body, 0.07 * s, 0.1 * s, 0.03 * s, 0.4 * s, 0.6 * s, 1.5 * s);
  P(new THREE.SphereGeometry(0.07, 7, 5), kind === 'drake' ? 0x6f7376 : col.body, -0.07 * s, 0.1 * s, 0.03 * s, 0.4 * s, 0.6 * s, 1.5 * s);
  let total = 0; for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), cl = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) { g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); cl.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(total * 2), 2));
  return out;
}

function ducks(S) {
  const { ctx, k } = S;
  const mat = k.paint.clone(); mat.vertexColors = true; mat.name = 'park-duck';
  const cx = -7.9, cz = -40.4;
  // A mallard pair and a hen with three ducklings; each swims a slow loop and bobs.
  const list = [
    { kind: 'drake', a: 0.0, sp: 0.16, rx: 1.35, rz: 0.9, ph: 0.0, lead: null },
    { kind: 'hen', a: 2.4, sp: -0.12, rx: 1.0, rz: 0.75, ph: 1.0, lead: null },
    { kind: 'duckling', lead: 1, lag: 0.34 }, { kind: 'duckling', lead: 1, lag: 0.5 }, { kind: 'duckling', lead: 1, lag: 0.68 },
  ];
  const geos = { drake: duckGeometry('drake'), hen: duckGeometry('hen'), duckling: duckGeometry('duckling') };
  const group = new THREE.Group();
  group.name = 'park-ducks';
  for (const d of list) { d.mesh = new THREE.Mesh(geos[d.kind], mat); d.mesh.castShadow = true; d.mesh.frustumCulled = false; group.add(d.mesh); }
  ctx.object(group, 1, [cx, cz]);
  let t = 0;
  const pos = (d, tt) => {
    const L = d.lead !== null ? list[d.lead] : d, a = L.a + (d.lead !== null ? -Math.sign(L.sp) * d.lag : 0) + L.sp * tt;
    return [cx + Math.cos(a) * L.rx, cz + Math.sin(a) * L.rz, a, L];
  };
  const set = (tt) => {
    for (const d of list) {
      const [x, z, a, L] = pos(d, tt), [x2, z2] = pos(d, tt + 0.05);
      const heading = Math.atan2(-(x2 - x), -(z2 - z));       // the model faces -z; yaw turns it
      const y = POND.water + 0.004 + 0.006 * Math.sin(tt * 1.7 + a * 2 + (d.lead !== null ? 1.3 : 0));
      d.mesh.position.set(x, y, z);
      d.mesh.rotation.set(0.04 * Math.sin(tt * 1.3 + a), heading, 0.035 * Math.sin(tt * 1.1 + a * 1.7), 'YXZ');
      d.mesh.updateMatrix();
    }
  };
  set(0);
  ctx.update((dt) => { t += dt; set(t); });
}

// ------------------------------------------------------------------ trees
const PAL = {
  oak: { leaf: [0x6f9341, 0x608539, 0x7ea34c, 0x567632], bark: 0xd2c2ac, hue: 100 },
  ash: { leaf: [0x7ea34f, 0x6e9644, 0x8db25c], bark: 0xd6ccba, hue: 104 },
  birch: { leaf: [0x9fbd4e, 0x8fb343, 0xb0c966], bark: 0xf0ece2, hue: 82 },
  conifer: { leaf: [0x35502c, 0x2e4a2a, 0x3f5a33], bark: 0x9a7d62, hue: 120 },
};

// Leaf cards from every near tree are gathered per 12 m chunk and made into one instanced draw each.
function cardsAdd(S, hue, pts) {
  if (!S.cards) S.cards = new Map();
  for (const p of pts) {
    const key = `${hue}|${Math.floor(p[0] / 12)}|${Math.floor(p[2] / 12)}`;
    let a = S.cards.get(key);
    if (!a) S.cards.set(key, a = { hue, pts: [] });
    a.pts.push(p);
  }
}
function cardsFlush(S) {
  if (!S.cards) return;
  for (const { hue, pts } of S.cards.values()) S.ctx.object(leafCards(S.ctx, pts, { size: 0.34, hue }), 2);
  S.cards = null;
}

// Leaf cards as in the kit (swaying, instanced, alpha-tested), but with a leaf texture whose transparent
// pixels carry leaf colour: the kit's canvas texture has black under its alpha, which mip-maps into dark
// fringes at a distance. Same program as the kit's cards (same cache key).
const leafTexCache = new Map();
function leafTex(hue) {
  if (leafTexCache.has(hue)) return leafTexCache.get(hue);
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true }), r = mulberry(hue * 7 + 3);
  x.clearRect(0, 0, S, S);
  for (let n = 0; n < 11; n++) {
    const px = S * (0.15 + r() * 0.7), py = S * (0.15 + r() * 0.7), a = r() * TAU, L = S * (0.14 + r() * 0.1), W = L * 0.42;
    x.save(); x.translate(px, py); x.rotate(a);
    const l = 28 + r() * 20;
    x.fillStyle = `hsl(${hue - 8 + r() * 22},${42 + r() * 20}%,${l}%)`;
    x.beginPath(); x.moveTo(-L, 0); x.quadraticCurveTo(0, -W, L, 0); x.quadraticCurveTo(0, W, -L, 0); x.fill();
    x.strokeStyle = `hsla(${hue},30%,${l + 16}%,0.55)`; x.lineWidth = S / 170;
    x.beginPath(); x.moveTo(-L * 0.9, 0); x.lineTo(L * 0.9, 0); x.stroke();
    x.restore();
  }
  const img = x.getImageData(0, 0, S, S), d = img.data, fill = new THREE.Color().setHSL(hue / 360, 0.4, 0.3);
  const fr = Math.round(fill.r * 255), fg = Math.round(fill.g * 255), fb = Math.round(fill.b * 255);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 30) { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; }
  const t = new THREE.DataTexture(new Uint8Array(d), S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  leafTexCache.set(hue, t);
  return t;
}
const cardMats = new Map();
function leafCards(ctx, pts, { size = 0.3, hue = 100 } = {}) {
  let mat = cardMats.get(hue);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: leafTex(hue), alphaTest: 0.45, side: THREE.DoubleSide });
    mat.name = 'world-leafcards';
    const wind = ctx.wind || {};
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, wind);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
${WIND_GLSL}`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
            vec3 io = instanceMatrix[3].xyz;
          #else
            vec3 io = vec3(0.0);
          #endif
          vec3 wp = (modelMatrix * mvPosition).xyz;
          float ph = gHash12(io.xz * 13.0) * 6.28;
          float press; vec2 wv = gWind(io.xz, press);
          float sp = length(wv);
          wp += vec3(wv.x, 0.0, wv.y) * 0.006 + vec3(sin(uTime * (2.4 + sp * 3.0) + ph), sin(uTime * 3.3 + ph * 1.7) * 0.5, cos(uTime * (2.1 + sp * 3.0) + ph)) * (0.004 + 0.006 * sp);
          mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;`);
    };
    mat.customProgramCacheKey = () => 'world-leafcards';
    cardMats.set(hue, mat);
  }
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size), mat, pts.length);
  const o = new THREE.Object3D(), col = new THREE.Color(), r = mulberry(pts.length + hue);
  pts.forEach(([x, y, z, nx, ny, nz], i) => {
    o.position.set(x, y, z);
    o.lookAt(x + nx + (r() - 0.5) * 1.2, y + ny + (r() - 0.5) * 1.2, z + nz + (r() - 0.5) * 1.2);
    o.rotateZ(r() * TAU);
    const sc = 0.75 + r() * 0.5;
    o.scale.set(sc, sc, sc);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    col.setHSL(0.24 + (r() - 0.5) * 0.05, 0.4 + r() * 0.22, 0.54 + r() * 0.2);
    mesh.setColorAt(i, col.multiplyScalar(1.5));
  });
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.noAO = true;
  mesh.computeBoundingSphere();
  return mesh;
}

const _v = new THREE.Vector3();
function shellPoints(rnd, x, y, z, dx, dy, dz, r, n, out) {
  for (let i = 0; i < n; i++) {
    _v.set(rnd() * 2 - 1, rnd() * 1.6 - 0.5, rnd() * 2 - 1).normalize();
    const rr = r * (0.9 + rnd() * 0.22);
    out.push([x + dx + _v.x * rr, y + dy + _v.y * rr * 0.9, z + dz + _v.z * rr, _v.x, _v.y + 0.3, _v.z]);
  }
}

// A woodland tree from the sim's spec (trunk, limbs to each lobe, lumpy lobes of foliage, leaf cards near).
function drawTree(S, t, { detail = 1, density = 1 } = {}) {
  const { ctx, wk, addG } = S, rnd = mulberry(t.seed + 11);
  const pal = PAL[t.kind], y = t.y, kind = t.kind;
  const top = Math.max(...t.crown.map((c) => c[1]));
  const bark = pal.bark, jitc = (c, a = 0.9, b = 1.08) => S.jit(c, a, b);
  const trunk = new THREE.CatmullRomCurve3([
    V(t.x, y - 0.06, t.z), V(t.x + (rnd() - 0.5) * 0.12, y + t.trunkH * 0.5, t.z + (rnd() - 0.5) * 0.12),
    V(t.x + (rnd() - 0.5) * 0.18, y + t.trunkH, t.z + (rnd() - 0.5) * 0.18), V(t.x, y + top * (kind === 'conifer' ? 0.95 : 0.8), t.z),
  ]);
  addG(taperTube(trunk, t.trunkR * 1.2, t.trunkR * (kind === 'conifer' ? 0.1 : 0.32), 8, ctx.lite ? 6 : 8), wk.bark, bark, 0);
  if (kind === 'oak' || kind === 'ash') {
    // Flared root base.
    S.add(new THREE.CylinderGeometry(t.trunkR * 1.02, t.trunkR * 1.75, 0.55, 8, 1), wk.bark, t.x, y + 0.15, t.z, bark, 1, rnd() * 6);
  }
  const tones = pal.leaf;
  if (kind !== 'conifer') {
    for (const [dx, dy, dz, r] of t.crown) {
      const e = V(t.x + dx * 0.8, y + dy - r * 0.2, t.z + dz * 0.8);
      const st = V(t.x, y + t.trunkH * (0.85 + rnd() * 0.2), t.z);
      const m = st.clone().lerp(e, 0.5).add(V(0, r * 0.25, 0));
      addG(taperTube(new THREE.QuadraticBezierCurve3(st, m, e), t.trunkR * 0.55, t.trunkR * 0.14, 6, 5), wk.bark, bark, 1);
    }
  }
  for (const [dx, dy, dz, r] of t.crown) {
    const n = kind === 'conifer' ? 2 : 2 + (r > 1.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const rr = r * (0.55 + rnd() * 0.2);
      const g = kind === 'conifer' ? new THREE.ConeGeometry(r * (i ? 0.78 : 1), r * 1.9, ctx.lite ? 8 : 11, 2) : ctx.blobGeometry(rr, detail, rnd() * 40, 0.2);
      const ox = kind === 'conifer' ? 0 : (rnd() - 0.5) * r * 0.6, oy = kind === 'conifer' ? i * r * 0.7 : (rnd() - 0.4) * r * 0.4, oz = kind === 'conifer' ? 0 : (rnd() - 0.5) * r * 0.6;
      S.add(g, S.k.leaf, t.x + dx + ox, y + dy + oy, t.z + dz + oz, jitc(tones[i % tones.length], 0.88, 1.1), 0, rnd() * 6, 0, 0, 1, kind === 'conifer' ? 1 : 0.85, 1);
    if (kind !== 'conifer' && i === 0) S.add(ctx.blobGeometry(r * 0.62, 1, rnd() * 40, 0.15), wk.leafy, t.x + dx, y + dy - r * 0.1, t.z + dz, 0x8aa070, 0, rnd() * 6);
    }
  }
  const cx = t.crown.reduce((s, c) => s + c[0], 0) / t.crown.length, cz = t.crown.reduce((s, c) => s + c[2], 0) / t.crown.length;
  ctx.ground.shadowCircle(t.x + cx, t.z + cz, Math.max(...t.crown.map((c) => Math.hypot(c[0] - cx, c[2] - cz) + c[3])) * 0.9, top * 0.75, 0.22);
  if (!ctx.lite && kind !== 'conifer') {
    const pts = [];
    for (const [dx, dy, dz, r] of t.crown) shellPoints(rnd, t.x, y, t.z, dx, dy, dz, r, Math.round((ctx.hi ? 44 : 26) * r * r * density), pts);
    cardsAdd(S, pal.hue, pts);
  }
}

// ------------------------------------------------------------------ the big oak
function oakTree(S) {
  const { ctx, k, wk, add, addG, jit, rnd } = S;
  const o = oakSpec(), y = o.y, bark = 0xcfbfa8, tones = PAL.oak.leaf;
  const R = mulberry(2024);
  // Bole: gently twisting, fluted at the foot.
  const bole = new THREE.CatmullRomCurve3([V(o.x, y - 0.1, o.z), V(o.x + 0.06, y + 0.9, o.z - 0.04), V(o.x - 0.05, y + 2.0, o.z + 0.05), V(o.x + 0.02, y + o.trunkH + 0.5, o.z)]);
  addG(taperTube(bole, o.trunkR * 1.22, o.trunkR * 0.8, 12, 12), wk.bark, bark, 0);
  addG(taperTube(new THREE.CatmullRomCurve3([V(o.x, y + o.trunkH - 0.4, o.z), V(o.x, y + o.trunkH + 1.0, o.z), V(o.x + 0.1, y + 7.5, o.z - 0.05)]), o.trunkR * 0.8, o.trunkR * 0.28, 8, 9), wk.bark, bark, 0);
  // Root buttresses running out over the ground.
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.5, c = Math.cos(a), s = Math.sin(a);
    const cv = new THREE.CubicBezierCurve3(V(o.x + c * 0.3, y + 0.8, o.z + s * 0.3), V(o.x + c * 0.7, y + 0.4, o.z + s * 0.7), V(o.x + c * 1.2, y + 0.16, o.z + s * 1.2), V(o.x + c * 2.1, G(o.x + c * 2.1, o.z + s * 2.1) - 0.04, o.z + s * 2.1));
    addG(taperTube(cv, 0.3, 0.07, 8, 8), wk.bark, jit(bark, 0.85, 1.0), 1);
  }
  // Limbs to each lobe: a thick limb that forks into twigs reaching the foliage.
  for (const l of o.limbs) {
    const ang = Math.atan2(l.dz, l.dx);
    const a = V(o.x + Math.cos(ang) * 0.2, y + o.trunkH - 0.1, o.z + Math.sin(ang) * 0.2);
    const mid = V(o.x + l.dx * 0.5, y + o.trunkH + (l.h - o.trunkH) * 0.35 + 0.3, o.z + l.dz * 0.5);
    const e = V(o.x + l.dx * 0.82, y + l.h - 0.4, o.z + l.dz * 0.82);
    addG(taperTube(new THREE.QuadraticBezierCurve3(a, a.clone().lerp(mid, 0.5).add(V(0, 0.15, 0)), mid), 0.3, 0.2, 7, 8), wk.bark, bark, 0);
    addG(taperTube(new THREE.QuadraticBezierCurve3(mid, mid.clone().lerp(e, 0.5).add(V(0, 0.2, 0)), e), 0.2, 0.12, 7, 8), wk.bark, bark, 0);
    // Hanging clusters of leaves at the limb's end, so it vanishes into foliage.
    for (let i = 0; i < 3; i++) add(ctx.blobGeometry(0.85 + R() * 0.3, 1, R() * 40, 0.25), k.leaf, e.x + (R() - 0.5) * 1.2 + l.dx * 0.02, e.y - 0.1 + R() * 0.5, e.z + (R() - 0.5) * 1.2, jit(tones[i % 4], 0.85, 1.05), 0, R() * 6, 0, 0, 1, 0.8, 1);
    for (let i = 0; i < 4; i++) {
      const aa = ang + (i - 1.5) * 0.55, tip = V(o.x + l.dx + Math.cos(aa) * l.r * 0.75, y + l.h + (R() - 0.2) * l.r * 0.5, o.z + l.dz + Math.sin(aa) * l.r * 0.75);
      const st = mid.clone().lerp(e, 0.4 + i * 0.15);
      addG(taperTube(new THREE.QuadraticBezierCurve3(st, st.clone().lerp(tip, 0.5).add(V(0, 0.3, 0)), tip), 0.12, 0.04, 6, 6), wk.bark, bark, 0);
    }
  }
  // The rope swing's limb: a long near-horizontal branch over the knoll's south face.
  const SW = swingInfo();
  {
    const mid = V((SW.root[0] + SW.tip[0]) / 2, (SW.root[1] + SW.tip[1]) / 2 + 0.12, (SW.root[2] + SW.tip[2]) / 2);
    addG(taperTube(new THREE.QuadraticBezierCurve3(V(...SW.root), mid, V(...SW.tip)), 0.2, 0.1, 10, 8), wk.bark, bark, 0);
    // Dead stub and knobs.
    addG(rod(V(...SW.tip), V(SW.tip[0] + 0.3 * Math.cos(PK.swing.limbAngle + 0.5), SW.tip[1] + 0.35, SW.tip[2] + 0.3 * Math.sin(PK.swing.limbAngle + 0.5)), 0.09, 0.04, 6), wk.bark, bark, 1);
    // The rope: two lines to a plank seat, knotted round the limb.
    const c = Math.cos(PK.swing.limbAngle), s = Math.sin(PK.swing.limbAngle);
    for (const d of [-0.2, 0.2]) {
      const px = SW.hang[0] - s * d, pz = SW.hang[2] + c * d;
      addG(taperTube(new THREE.CatmullRomCurve3([V(px, SW.limbY - 0.05, pz), V(px + 0.01, (SW.limbY + SW.seatY) / 2, pz), V(px, SW.seatY + 0.03, pz)]), 0.014, 0.014, 6, 5), k.fabric, 0xa68f66, 1);
      add(new THREE.SphereGeometry(0.03, 6, 5), k.fabric, px, SW.seatY + 0.04, pz, 0x8e7a55, 1);
    }
    for (const d of [-0.2, 0.2]) add(new THREE.TorusGeometry(0.1, 0.014, 5, 10), k.fabric, SW.hang[0] - s * d, SW.limbY - 0.04, SW.hang[2] + c * d, 0x9a8458, 1, PK.swing.limbAngle, Math.PI / 2, 0);
    add(boxUV(0.44, 0.04, 0.2, 1), k.weathered, SW.hang[0], SW.seatY, SW.hang[2], 0x7d6b52, 1, -PK.swing.limbAngle + Math.PI / 2);
  }
  // Foliage: five lumpy blobs per lobe with darker ones set deep for shadow.
  for (const [dx, dy, dz, r] of o.crown) {
    for (let i = 0; i < 5; i++) {
      const rr = r * (0.5 + R() * 0.22), ox = (R() - 0.5) * r * 0.7, oy = (R() - 0.35) * r * 0.5, oz = (R() - 0.5) * r * 0.7;
      add(ctx.blobGeometry(rr, 2, R() * 40, 0.22), k.leaf, o.x + dx + ox, y + dy + oy, o.z + dz + oz, jit(tones[i % 4], 0.88, 1.1), 0, R() * 6, 0, 0, 1, 0.82, 1);
    }
    add(ctx.blobGeometry(r * 0.75, 1, R() * 40, 0.15), wk.leafy, o.x + dx, y + dy - r * 0.05, o.z + dz, 0x93aa78, 0, R() * 6);
  }
  ctx.ground.shadowCircle(o.x - 1.0, o.z + 0.5, 6.2, 6.0, 0.3);
  if (!ctx.lite) {
    const pts = [];
    for (const [dx, dy, dz, r] of o.crown) shellPoints(R, o.x, y, o.z, dx, dy, dz, r, Math.round((ctx.hi ? 700 : 380) * r * r / 5), pts);
    cardsAdd(S, 100, pts);
  }
  // The kite caught in the oak, its tail hanging down through the leaves.
  kite(S);
}

function kite(S) {
  const { ctx, k, addG } = S, K = kiteInfo();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-K.tilt, K.yaw, 0, 'YXZ'));
  const M = new THREE.Matrix4().compose(V(...K.pos), q, V(1, 1, 1));
  // Four-quartered diamond on crossed spars.
  const hw = K.hw, hh = K.hh, cy = hh * 0.2;
  const tri = (p, q, r, col) => {
    for (const flip of [false, true]) {
      const pts = flip ? [p, r, q] : [p, q, r], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((v) => [v[0], v[1], 0.004]), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(pts.flatMap((v) => [v[0], v[1]]), 2));
      g.computeVertexNormals();
      ctx.add(g, k.paper, M, col, 1);
    }
  };
  const Tp = [0, hh], Lp = [-hw, cy], Rp = [hw, cy], Bp = [0, -hh], Cp = [0, cy];
  tri(Cp, Tp, Lp, 0xc9372c); tri(Cp, Rp, Tp, 0xe8c33a); tri(Cp, Lp, Bp, 0xe8c33a); tri(Cp, Bp, Rp, 0xc9372c);
  ctx.add(rod([0, -hh, 0.008], [0, hh, 0.008], 0.005, 0.005, 4), k.wood, M, 0xc9a56a, 2);
  ctx.add(rod([-hw, cy, 0.008], [hw, cy, 0.008], 0.005, 0.005, 4), k.wood, M, 0xc9a56a, 2);
  // Tail with bows and a trailing string to the ground.
  const base = V(K.pos[0], K.pos[1], K.pos[2]).add(V(0, -hh, 0).applyQuaternion(q));
  const out = V(Math.cos(K.phi), 0, Math.sin(K.phi));
  const pts = [base.clone()];
  for (let i = 1; i <= 8; i++) pts.push(base.clone().add(out.clone().multiplyScalar(0.12 * i + Math.sin(i * 0.9) * 0.1)).add(V(0, -0.38 * i, 0)).add(V(-out.z, 0, out.x).multiplyScalar(Math.sin(i * 1.2) * 0.18)));
  const curve = new THREE.CatmullRomCurve3(pts);
  addG(taperTube(curve, 0.006, 0.006, 24, 4), k.fabric, 0xd8cdb4, 2);
  for (let i = 1; i < 8; i++) {
    const p = curve.getPointAt(i / 8);
    const g = new THREE.ConeGeometry(0.05, 0.12, 3).rotateX(Math.PI / 2);
    ctx.add(g, k.paper, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.7, 0.4 * (i % 2 ? 1 : -1))), V(1, 1, 1)), i % 2 ? 0xc9372c : 0x2f5aa3, 2);
  }
  // The line, trailing out of the tree down to a dangling loop.
  const l0 = V(K.pos[0], K.pos[1] - 0.1, K.pos[2]).add(out.clone().multiplyScalar(-0.02)), gnd = G(l0.x + out.x * 1.2, l0.z + out.z * 1.2);
  addG(taperTube(new THREE.CatmullRomCurve3([l0, l0.clone().add(out.clone().multiplyScalar(0.7)).add(V(0, -1.2, 0)), l0.clone().add(out.clone().multiplyScalar(1.2)).add(V(0, -3.3, 0)), V(l0.x + out.x * 1.3 + 0.3, gnd + 1.4, l0.z + out.z * 1.3)]), 0.004, 0.004, 14, 4), k.fabric, 0xe8e2d0, 2);
}

// ------------------------------------------------------------------ the wood
function wood(S) {
  const { ctx, k, wk, add, addG, jit, rnd } = S;
  const trees = parkTrees();
  const edge = (t) => t.x < 6.5 || t.z < -45.2;
  for (const t of trees) drawTree(S, t, { detail: ctx.lite || edge(t) ? 1 : 1, density: edge(t) ? 0.8 : 1 });
  cardsFlush(S);
  // Stumps with ringed tops.
  for (const s of woodStumps()) {
    addG(rod([s.x, s.y, s.z], [s.x, s.y + s.h, s.z], s.r * 1.1, s.r, 9), wk.bark, 0x7d6e5c, 1);
    add(new THREE.CircleGeometry(s.r, 9).rotateX(-Math.PI / 2), k.wood, s.x, s.y + s.h + 0.003, s.z, 0xc2a173, 1);
    add(new THREE.TorusGeometry(s.r * 0.5, 0.004, 3, 14).rotateX(Math.PI / 2), k.wood, s.x, s.y + s.h + 0.006, s.z, 0x8e6e48, 2);
    add(ctx.blobGeometry(s.r * 0.5, 1, s.x, 0.2), wk.leafy, s.x + s.r * 0.6, s.y + s.h * 0.4, s.z, 0x5b7a3b, 2, 0, 0, 0, 1, 0.5, 0.6);
  }
  // The fallen log: a long trunk with the boulder it lies on, bark stripped and mossy on top, bracket fungi.
  {
    const L = PK.log, ya = G(L.a[0], L.a[1]) + L.hA, yb = G(L.b[0], L.b[1]) + L.hB;
    const a = V(L.a[0], ya, L.a[1]), b = V(L.b[0], yb, L.b[1]);
    const mid = a.clone().lerp(b, 0.5).add(V(0, -0.02, 0));
    addG(taperTube(new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(V(0, -0.02, 0)), b]), L.r * 1.05, L.r * 0.82, 14, 10), wk.bark, 0x786a5a, 0);
    // The broken root-end disc and the splintered top.
    add(new THREE.CircleGeometry(L.r * 1.05, 10), k.wood, a.x - 0.0, a.y, a.z, 0xb8956a, 1);
    const dir = b.clone().sub(a).normalize();
    for (const t of [0.3, 0.62]) {
      const p = a.clone().lerp(b, t), sgn = t < 0.5 ? -1 : 1;
      addG(rod(p.clone().add(V(0, 0.1, 0)), p.clone().add(V(0.25, 0.6, 0.55 * sgn)), 0.06, 0.035, 6), wk.bark, 0x786a5a, 1);
      for (let i = 0; i < 4; i++) addG(taperTube(new THREE.QuadraticBezierCurve3(p.clone().add(V(0.25, 0.6, 0.55 * sgn)), p.clone().add(V(0.4 + i * 0.1, 0.85, 0.8 * sgn + i * 0.1 - 0.15)), p.clone().add(V(0.5 + i * 0.12, 0.95 + (i % 2) * 0.1, 1.0 * sgn + (i - 1.5) * 0.25))), 0.03, 0.01, 4, 4), wk.bark, 0x786a5a, 2);
    }
    // Moss along the top, brackets.
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + rnd() * 0.85, p = a.clone().lerp(b, t);
      add(ctx.blobGeometry(0.2 + rnd() * 0.15, 1, i * 3, 0.25), wk.leafy, p.x, p.y + L.r * 0.8, p.z + (rnd() - 0.5) * 0.3, jit(0x5f8040, 0.8, 1.1), 1, rnd() * 6, 0, 0, 1.6, 0.35, 1);
    }
    for (let i = 0; i < 4; i++) {
      const t = 0.2 + rnd() * 0.6, p = a.clone().lerp(b, t), side = i % 2 ? 1 : -1;
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8, 1, false, 0, Math.PI), k.wood, p.x, p.y + 0.05, p.z + side * (L.r * 0.93), jit(0xb99a68, 0.8, 1.1), 2, side > 0 ? 0 : Math.PI, 0, 0.3 * side);
    }
    void mid; void dir;
    const bo = logBoulder();
    add(ctx.blobGeometry(bo.r, 2, 6, 0.18), k.stone, bo.x, bo.y, bo.z, 0x6c705f, 1, 0.4, 0, 0, 1.1, 0.88, 1);
    add(ctx.blobGeometry(bo.r * 0.8, 1, 7, 0.2), wk.leafy, bo.x, bo.y + bo.r * 0.36, bo.z, 0x55743a, 1, 1.0, 0, 0, 1, 0.5, 1);
  }
  // The den: branches leaning on a ring, a few leafy twigs thrown over, a log seat inside, a ring of stones.
  {
    const D = PK.den;
    const bs = denBranches();
    for (const b of bs) {
      addG(taperTube(new THREE.QuadraticBezierCurve3(V(...b.a), V((b.a[0] + b.b[0]) / 2 + 0.02, (b.a[1] + b.b[1]) / 2 + 0.05, (b.a[2] + b.b[2]) / 2), V(...b.b)), b.r * 1.15, b.r * 0.7, 6, 5), wk.bark, jit(0x6f6050, 0.8, 1.1), 1);
      add(ctx.blobGeometry(0.28, 1, b.a[0], 0.3), wk.leafy, (b.a[0] * 0.55 + b.b[0] * 0.45), (b.a[1] * 0.45 + b.b[1] * 0.55) + 0.1, (b.a[2] * 0.55 + b.b[2] * 0.45), jit(0x5f7a3c, 0.8, 1.1), 1, rnd() * 6, 0, 0, 1, 0.5, 1);
    }
    const yd = G(D.x, D.z);
    addG(rod([D.x - 0.25, yd + 0.17, D.z - 0.1], [D.x + 0.35, yd + 0.17, D.z + 0.05], 0.13, 0.12, 8), wk.bark, 0x77685a, 2);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; add(ctx.blobGeometry(0.13, 1, i, 0.2), k.stone, D.x + Math.cos(a) * 0.75, G(D.x + Math.cos(a) * 0.75, D.z + Math.sin(a) * 0.75) + 0.05, D.z + Math.sin(a) * 0.75, 0x73706a, 2, i, 0, 0, 1, 0.6, 1); }
  }
  // Bluebell glade, ferns and the odd toadstool.
  glade(S);
  // Brambles and nettles at the wood's edge near the path.
  const fern = [0, 1, 2, 3].map((i) => reedGeometry(mulberry(500 + i), 10, 0.35, 0.7, { width: 0.045, curve: 1.3 }));
  const fernMat = k.leaf;
  const blocked = (x, z) => Math.hypot(x - PK.glade.x, z - PK.glade.z) < PK.glade.r || distSeg(x, z, PK.woodPath) < 1.0 || Math.abs(z - streamZ(x)) < 2.0;
  for (let i = 0, tries = 0; i < 70 && tries < 600; tries++) {
    const x = 6.8 + rnd() * 12.4, z = -47 + rnd() * 18;
    if (blocked(x, z) || z > -28.2 && z < -27) continue;
    i++;
    add(fern[(rnd() * 4) | 0], fernMat, x, G(x, z) - 0.02, z, jit(0x52743a, 0.8, 1.1), 1, rnd() * TAU);
  }
}

function glade(S) {
  const { ctx, k, add, jit, rnd } = S;
  const GL = PK.glade;
  const stem = (h) => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0, 0, 0), V(0.03, h * 0.7, 0), V(0.1, h * 0.85, 0.02)), 4, 0.003, 3);
  const bell = new THREE.ConeGeometry(0.012, 0.03, 5).translate(0, -0.015, 0);
  const clump = (seed) => {
    const r = mulberry(seed), parts = [];
    for (let s = 0; s < 3; s++) {
      const h = 0.22 + r() * 0.12, a = r() * TAU;
      const sg = stem(h); sg.rotateY(a); parts.push({ g: sg, c: 0x6d8a45 });
      for (let b = 0; b < 5; b++) {
        const t = 0.45 + b * 0.1, px = 0.1 * t * Math.cos(a) + (b % 2 ? 0.012 : -0.012), pz = 0.1 * t * -Math.sin(a);
        const bg = bell.clone().translate(0.03 * t * Math.cos(a) + 0.07 * t, h * t * 0.92 - 0.01 * b, 0.0).rotateY(a); void px; void pz;
        parts.push({ g: bg, c: b % 2 ? 0x5b5fc4 : 0x6e66cc });
      }
    }
    return parts;
  };
  const clumps = [0, 1, 2, 3, 4, 5].map((i) => clump(900 + i));
  const leaf = reedGeometry(mulberry(77), 6, 0.18, 0.3, { width: 0.022, curve: 0.8 });
  for (let i = 0; i < 110; i++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * (GL.r + 0.4), x = GL.x + Math.cos(a) * r, z = GL.z + Math.sin(a) * r;
    const y = G(x, z), cl = clumps[(rnd() * 6) | 0], ry = rnd() * TAU;
    for (const p of cl) add(p.g, p.c === 0x6d8a45 ? k.leaf : k.petal, x, y, z, p.c === 0x6d8a45 ? jit(p.c, 0.85, 1.05) : jit(p.c, 0.85, 1.12), 2, ry);
    add(leaf, k.leaf, x, y - 0.01, z, jit(0x557a3a, 0.85, 1.05), 2, ry + 1);
  }
  // Wood anemones and a few red campion at the edge; fly agaric by the log.
  for (let i = 0; i < 24; i++) {
    const a = rnd() * TAU, r = GL.r + 0.3 + rnd() * 2.4, x = GL.x + Math.cos(a) * r, z = GL.z + Math.sin(a) * r;
    if (Math.abs(z - streamZ(x)) < 2.2) continue;
    add(new THREE.CircleGeometry(0.03, 6).rotateX(-Math.PI / 2 + 0.2), k.petal, x, G(x, z) + 0.12, z, 0xf3f1ea, 2);
    add(new THREE.PlaneGeometry(0.006, 0.12).translate(0, 0.06, 0), k.leaf, x, G(x, z), z, 0x6d8a45, 2, rnd() * 3);
  }
  const L = PK.log;
  for (let i = 0; i < 6; i++) {
    const x = L.a[0] + 1.3 + rnd() * 2.6, z = L.a[1] + 1.0 + rnd() * 0.9, y = G(x, z), h = 0.05 + rnd() * 0.05;
    add(new THREE.CylinderGeometry(0.008, 0.011, h, 5), k.paper, x, y + h / 2, z, 0xeae4d2, 2);
    add(new THREE.SphereGeometry(0.03 + rnd() * 0.02, 7, 4, 0, TAU, 0, Math.PI / 2), k.paint, x, y + h, z, 0xb53a2a, 2, 0, 0, 0, 1, 0.8, 1);
  }
}

// ------------------------------------------------------------------ the bandstand
// A triangle with a chosen facing (up = normal has positive y).
function tri(a, b, c, up, uvs = 1.2) {
  const n = new THREE.Vector3().subVectors(V(...b), V(...a)).cross(new THREE.Vector3().subVectors(V(...c), V(...a)));
  const P = (n.y > 0) === up ? [a, b, c] : [a, c, b];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap((p) => [(p[0] + p[2] * 0.4) * uvs, p[1] * uvs]), 2));
  g.computeVertexNormals();
  return g;
}

function bandstand(S) {
  const { ctx, k, wk, add, addG, jit, rnd } = S;
  const B = PK.bandstand, I = bandstandInfo(), top = I.top;
  const cream = 0xe6dfcd, green = 0x2f4a3c, roofCol = 0x587562;
  const polyP = (r) => octagon(B, r).map((p) => [p[0], p[2]]);
  // Brick plinth with a stone coping, and a timber deck on top.
  addG(prism(polyP(B.rPlat), I.base, top - 0.12, { top: false }), wk.brick, 0xe2d2c2, 0);
  addG(prism(polyP(B.rPlat + 0.05), top - 0.12, top - 0.05, { top: false }), k.stone, 0xa39d90, 1);
  addG(prism(polyP(B.rPlat + 0.03), top - 0.05, top, { top: true, uvs: 1.4 }), k.weathered, 0x8c7a62, 0);
  // Deck boards (fine lines) on top.
  for (let i = -8; i <= 8; i++) {
    const half = Math.sqrt(Math.max(0, B.rPlat * B.rPlat - (i * 0.27) ** 2)) * 0.93;
    if (half < 0.3) continue;
    add(new THREE.BoxGeometry(2 * half, 0.004, 0.01), k.weathered, B.x, top + 0.002, B.z + i * 0.27 + 0.135, 0x5c4d3c, 2);
  }
  // Steps on the open sides, with plain iron handrails.
  for (const sg of [-1, 1]) for (let s = 0; s < 3; s++) {
    const d = B.rPlat * Math.cos(Math.PI / 8) + 0.2 + s * 0.3, sx = B.x + sg * d, sy = top - (s + 1) * 0.26, g = G(sx, B.z);
    add(boxUV(0.3, sy - g + 0.15, 1.6, 1), k.stone, sx, (sy + g - 0.15) / 2, B.z, jit(0x908a7d, 0.9, 1.05), 1);
    add(boxUV(0.34, 0.05, 1.64, 1), k.stone, sx, sy - 0.025, B.z, 0xa6a094, 1);
  }
  // Columns: slim cast iron on square feet with a capital, painted green.
  const v = octagon(B, B.R);
  for (const p of v) {
    addG(rod([p[0], top, p[2]], [p[0], top + B.colH, p[2]], 0.05, 0.044, 8), k.iron, green, 0);
    add(new THREE.BoxGeometry(0.17, 0.14, 0.17), k.iron, p[0], top + 0.07, p[2], 0x273d31, 1);
    add(new THREE.BoxGeometry(0.15, 0.06, 0.15), k.iron, p[0], top + 0.4, p[2], 0x273d31, 2);
    add(new THREE.BoxGeometry(0.2, 0.1, 0.2), k.iron, p[0], top + B.colH - 0.05, p[2], 0x273d31, 1);
  }
  // Balustrades (six sides): top rail, lower rail, turned spindles.
  for (let kk = 0; kk < 8; kk++) {
    if (kk === 7 || kk === 3) continue;
    const a = v[kk], b = v[(kk + 1) % 8], mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    add(boxUV(len - 0.04, 0.05, 0.18, 1), k.weathered, mx, top + 1.015, mz, 0xcfc7b4, 1, yaw);
    add(boxUV(len - 0.04, 0.09, 0.07, 1), k.paint, mx, top + 0.15, mz, cream, 1, yaw);
    add(boxUV(len - 0.04, 0.05, 0.05, 1), k.paint, mx, top + 0.95, mz, cream, 1, yaw);
    const n = Math.round((len - 0.2) / 0.12);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5, px = mx + Math.cos(yaw) * t * (len - 0.2), pz = mz - Math.sin(yaw) * t * (len - 0.2);
      addG(rod([px, top + 0.18, pz], [px, top + 0.94, pz], 0.014, 0.014, 5), k.paint, cream, 2);
      add(new THREE.SphereGeometry(0.022, 5, 4), k.paint, px, top + 0.56, pz, cream, 2, 0, 0, 0, 1, 1.6, 1);
    }
  }
  // Roof: eight green sheet-metal facets with hip ribs, a cream timber ceiling, fascia and a scalloped valance.
  const apex = [B.x, top + B.apexH, B.z], eaveY = top + B.colH + 0.05;
  const E = octagon(B, B.rRoof).map((p) => [p[0], eaveY, p[2]]);
  for (let kk = 0; kk < 8; kk++) {
    const a = E[kk], b = E[(kk + 1) % 8];
    addG(tri(apex, a, b, true, 1.5), k.zinc, jit(roofCol, 0.92, 1.06), 0);
    const apex2 = [apex[0], apex[1] - 0.12, apex[2]], a2 = [a[0], a[1] - 0.2, a[2]], b2 = [b[0], b[1] - 0.2, b[2]];
    addG(tri(apex2, a2, b2, false, 1.3), k.weathered, 0xcdbf9f, 0);
    addG(rod(apex, a, 0.022, 0.026, 6), k.copper, 0x7a6a50, 1);
    // standing seams
    for (let sI = 1; sI < 5; sI++) {
      const f = sI / 5, p0 = [apex[0] + (a[0] - apex[0]) * f + (b[0] - a[0]) * 0 , apex[1] + (a[1] - apex[1]) * f, apex[2] + (a[2] - apex[2]) * f];
      void p0;
    }
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]), mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
    // valance: cream pendant triangles along the eave
    const nP = 7;
    for (let i = 0; i < nP; i++) {
      const t0 = i / nP, t1 = (i + 1) / nP;
      const p0 = [a[0] + (b[0] - a[0]) * t0, eaveY - 0.2, a[2] + (b[2] - a[2]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, eaveY - 0.2, a[2] + (b[2] - a[2]) * t1];
      const pm = [(p0[0] + p1[0]) / 2, eaveY - 0.42, (p0[2] + p1[2]) / 2];
      const g = tri(p0, p1, pm, true);
      addG(g, k.paint, i % 2 ? 0x3f5f4d : cream, 1);
      addG(tri(p0, pm, p1, true), k.paint, i % 2 ? 0x3f5f4d : cream, 1);
    }
    void len; void yaw; void mx; void mz;
  }
  addG(prism(E.map((p) => [p[0], p[2]]), eaveY - 0.2, eaveY, { top: false }), k.paint, cream, 1);
  addG(rod([B.x, apex[1] - 0.05, B.z], [B.x, apex[1] + 0.65, B.z], 0.025, 0.012, 6), k.iron, 0x2c2d2d, 1);
  add(new THREE.SphereGeometry(0.07, 8, 6), k.brass, B.x, apex[1] + 0.7, B.z, 0xffffff, 1);
  add(new THREE.ConeGeometry(0.02, 0.2, 5), k.brass, B.x, apex[1] + 0.85, B.z, 0xffffff, 2);
  // Bunting from column to column under the eaves.
  for (let kk = 0; kk < 8; kk++) {
    const a = v[kk], b = v[(kk + 1) % 8], y0 = top + B.colH - 0.22;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(a[0] + (b[0] - a[0]) * t * 1.0, y0 - 0.24 * Math.sin(t * Math.PI), a[2] + (b[2] - a[2]) * t)); }
    const cv = new THREE.CatmullRomCurve3(pts);
    addG(taperTube(cv, 0.004, 0.004, 12, 3), k.fabric, 0xe8e2cf, 2);
    for (let i = 1; i < 9; i++) {
      const p = cv.getPointAt((i - 0.5) / 9), p2 = cv.getPointAt(Math.min(1, (i + 0.1) / 9)), p1 = cv.getPointAt((i - 1.1) / 9 < 0 ? 0 : (i - 1.1) / 9);
      const q0 = [p1.x, p1.y, p1.z], q1 = [p2.x, p2.y, p2.z], qm = [p.x, p.y - 0.17, p.z];
      const col = [0xc2463a, 0xe6c04a, 0x3f7aa8, 0xf0ece0][i % 4];
      addG(tri(q0, q1, qm, true), k.fabric, col, 2); addG(tri(q0, qm, q1, true), k.fabric, col, 2);
    }
  }
  // A brass plaque by the steps.
  const mp = B.x + (B.rPlat * Math.cos(Math.PI / 8) + 0.02);
  void mp;
}

// ------------------------------------------------------------------ benches, bins, fence
function bench(S, b, flask) {
  const { k, add, addG, jit } = S;
  const y = G(b.x, b.z), P = (lx, lz) => frameAt(b, lx, lz);
  const at = (geo, mat, lx, yy, lz, col, lod, rx = 0, rz = 0) => { const [x, z] = P(lx, lz); add(geo, mat, x, yy, z, col, lod, b.yaw, rx, rz); };
  const teak = 0x9b6a3a, iron = 0x222b27;
  for (const lz of [0.15, 0.05, -0.05, -0.15]) at(boxUV(1.5, 0.035, 0.1, 1), k.wood, 0, y + 0.46, lz, jit(teak, 0.85, 1.08), 1);
  for (const yy of [0.58, 0.7, 0.82]) at(boxUV(1.5, 0.11, 0.025, 1), k.wood, 0, y + yy, -0.23 - (yy - 0.58) * 0.08, jit(teak, 0.85, 1.08), 1, -0.1);
  for (const sg of [-1, 1]) {
    const lx = sg * 0.69;
    at(boxUV(0.03, 0.46, 0.4, 1), k.iron, lx, y + 0.25, 0, iron, 1);
    at(boxUV(0.05, 0.045, 0.52, 1), k.iron, lx, y + 0.6, 0, iron, 1);
    at(boxUV(0.035, 0.46, 0.04, 1), k.iron, lx, y + 0.7, -0.24, iron, 1, -0.1);
    at(new THREE.SphereGeometry(0.035, 6, 5), k.iron, lx, y + 0.62, 0.26, iron, 2);
    at(boxUV(0.04, 0.03, 0.46, 1), k.iron, lx, y + 0.015, 0, iron, 2);
  }
  at(boxUV(0.14, 0.04, 0.005, 1), k.brass, 0, y + 0.84, -0.275, 0xffffff, 2, -0.1);
  if (flask) {
    const [x, z] = P(-0.42, 0.02);
    addG(rod([x, y + 0.48, z], [x, y + 0.7, z], 0.038, 0.038, 10), k.paint, 0x2f5a44, 1);
    addG(rod([x, y + 0.7, z], [x, y + 0.745, z], 0.034, 0.034, 10), k.paint, 0xe8e4d8, 1);
    add(new THREE.TorusGeometry(0.038, 0.005, 4, 12).rotateX(Math.PI / 2), k.steel, x, y + 0.5, z, 0xffffff, 2);
  }
}

function bin(S, x, z) {
  const { k, add, addG } = S, y = G(x, z);
  addG(rod([x, y, z], [x, y + 0.84, z], 0.22, 0.205, 12), k.paint, 0x3b5744, 1);
  add(new THREE.TorusGeometry(0.215, 0.012, 4, 14).rotateX(Math.PI / 2), k.paint, x, y + 0.1, z, 0x2e4538, 2);
  add(new THREE.TorusGeometry(0.215, 0.012, 4, 14).rotateX(Math.PI / 2), k.paint, x, y + 0.5, z, 0x2e4538, 2);
  add(new THREE.SphereGeometry(0.235, 12, 6, 0, TAU, 0, Math.PI / 2.4), k.paint, x, y + 0.84, z, 0x2a3f33, 1, 0, 0, 0, 1, 0.55, 1);
  add(new THREE.CircleGeometry(0.1, 10).rotateX(-0.3), k.paint, x + 0.0, y + 0.77, z + 0.22, 0x0e0f0f, 1, 0, 0, 0, 1.3, 0.7, 1);
  add(boxUV(0.12, 0.05, 0.004, 1), k.brass, x, y + 0.66, z + 0.205, 0xe2d6a0, 2);
  ctxShadow(S, x, z, 0.3);
}
const ctxShadow = (S, x, z, r) => S.ctx.ground.shadowCircle(x, z, r, 0.5, 0.18);

function furniture(S) {
  const { ctx, k, add, addG, jit } = S;
  bench(S, PK.benchFlask, true);
  bench(S, PK.benchPond, false);
  for (const [x, z] of PK.bins) bin(S, x, z);
  // Play-area picket fence (posts and pickets stepping down the slope), with a gate gap.
  const P = PK.play;
  const run = (a, b, gap = null) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 2)), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, yaw = Math.atan2(-dz, dx);
    for (let i = 0; i < n; i++) {
      const p = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], q = [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n];
      const y = Math.min(G(p[0], p[1]), G(q[0], q[1]), G((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) - 0.02, seg = len / n;
      const open = (u) => gap && u > gap[0] - 0.02 && u < gap[1] + 0.02;
      for (const u of [0, seg]) {
        const uu = i * seg + u;
        if (gap && (Math.abs(uu - gap[0]) < 0.05 || Math.abs(uu - gap[1]) < 0.05)) continue;
        if (open(uu) && !(Math.abs(uu - gap[0]) < 0.05 || Math.abs(uu - gap[1]) < 0.05)) continue;
        add(boxUV(0.09, 1.05, 0.09, 1), k.weathered, p[0] + dx * u, y + 0.5, p[1] + dz * u, 0x6a5a48, 1);
      }
      for (let u = 0.05; u < seg; u += 0.115) {
        const uu = i * seg + u;
        if (open(uu)) continue;
        add(boxUV(0.07, 0.86, 0.02, 1), k.paint, p[0] + dx * u, y + 0.5, p[1] + dz * u, jit(0x55725c, 0.85, 1.08), 1, yaw);
      }
      for (const yy of [0.22, 0.72]) {
        let u0 = 0;
        const segs = gap ? [[0, Math.max(0, gap[0] - i * seg)], [Math.min(seg, gap[1] - i * seg), seg]] : [[0, seg]];
        for (const [s0, s1] of segs) if (s1 - s0 > 0.05) add(boxUV(s1 - s0, 0.06, 0.035, 1), k.weathered, p[0] + dx * (s0 + s1) / 2, y + yy, p[1] + dz * (s0 + s1) / 2, 0x6a5a48, 1, yaw);
        void u0;
      }
    }
  };
  run([P.x0, P.z1], [P.x1, P.z1], [P.gate[0] - P.x0, P.gate[1] - P.x0]);
  run([P.x1, P.z1], [P.x1, P.z0]);
  run([P.x1, P.z0], [P.x0, P.z0]);
  run([P.x0, P.z0], [P.x0, P.z1]);
  void ctx; void addG;
}

// ------------------------------------------------------------------ the play area
function playground(S) {
  const { ctx, k, add, addG, jit } = S;
  const { sw, cf, rb } = playInfo();
  const frameCol = 0x35603f, steel = 0xb7bcbd;
  // Swing set.
  const top = G(sw.x, sw.z) + sw.top;
  for (const sx of [-1, 1]) {
    const bx = sw.x + sx * sw.span;
    for (const sz of [-1, 1]) {
      const foot = [bx, G(bx, sw.z + sz * 0.7) - 0.05, sw.z + sz * 0.7];
      addG(rod(foot, [bx, G(bx, sw.z) + sw.top, sw.z], 0.045, 0.045, 8), k.paint, frameCol, 1);
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 8), k.iron, foot[0], foot[1] + 0.2, foot[2], 0x444444, 2);
    }
    add(new THREE.SphereGeometry(0.075, 8, 6), k.paint, bx, G(bx, sw.z) + sw.top, sw.z, frameCol, 1);
  }
  addG(rod([sw.x - sw.span - 0.1, top, sw.z], [sw.x + sw.span + 0.1, top, sw.z], 0.05, 0.05, 8), k.paint, frameCol, 1);
  for (const sx of [-0.55, 0.55]) {
    const g = G(sw.x + sx, sw.z);
    for (const o of [-0.2, 0.2]) {
      addG(rod([sw.x + sx + o, top - 0.04, sw.z], [sw.x + sx + o, g + 0.5, sw.z], 0.008, 0.008, 4), k.steel, steel, 1);
      add(new THREE.TorusGeometry(0.02, 0.005, 4, 8), k.steel, sw.x + sx + o, top - 0.04, sw.z, steel, 2, 0, Math.PI / 2);
      for (let y = g + 0.56; y < top - 0.1; y += 0.075) add(new THREE.CylinderGeometry(0.011, 0.011, 0.045, 5), k.steel, sw.x + sx + o, y, sw.z, steel, 2, 0, y % 0.15 > 0.075 ? Math.PI / 2 : 0, 0, 1, 1, 1);
    }
    add(boxUV(0.44, 0.04, 0.18, 1), k.rubber, sw.x + sx, g + 0.48, sw.z, 0x242426, 1);
    add(new THREE.BoxGeometry(0.46, 0.012, 0.2), k.rubber, sw.x + sx, g + 0.465, sw.z, 0x353537, 2);
  }
  // Climbing frame: timber posts, deck, guard boards, a shingled roof, ladder and slide.
  const g0 = G(cf.x, cf.z), h = cf.half;
  const tim = 0x8a6d4b;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = cf.x + sx * h, pz = cf.z + sz * h;
    addG(rod([px, G(px, pz) - 0.05, pz], [px, g0 + cf.plat + 1.0, pz], 0.06, 0.06, 6), k.weathered, jit(tim, 0.9, 1.05), 1);
  }
  add(boxUV(2 * h + 0.16, 0.07, 2 * h + 0.16, 1), k.weathered, cf.x, g0 + cf.plat, cf.z, 0x9a7d58, 1);
  for (const sz of [-1, 1]) {
    add(boxUV(2 * h, 0.5, 0.025, 1), k.weathered, cf.x, g0 + cf.plat + 0.35, cf.z + sz * h, 0x7c6448, 1);
    for (let i = 0; i < 9; i++) add(boxUV(0.035, 0.55, 0.03, 1), k.weathered, cf.x - h + 0.08 + i * (2 * h - 0.16) / 8, g0 + cf.plat + 0.4, cf.z + sz * (h + 0.02), 0x8a7050, 2);
    add(boxUV(2 * h + 0.1, 0.05, 0.06, 1), k.weathered, cf.x, g0 + cf.plat + 0.62, cf.z + sz * h, 0x7c6448, 1);
  }
  for (const sg of [-1, 1]) {
    const q = [cf.x, g0 + cf.plat + 1.15, cf.z];
    add(boxUV(2 * h + 0.5, 0.035, 1.25, 1), k.weathered, q[0], q[1] + 0.15, q[2] + sg * 0.5, 0x6f4f38, 1, 0, sg * 0.5, 0);
  }
  add(boxUV(2 * h + 0.55, 0.06, 0.07, 1), k.weathered, cf.x, g0 + cf.plat + 1.42, cf.z, 0x5f4330, 1);
  // Ship's wheel on the barrier, and a small flag.
  add(new THREE.TorusGeometry(0.1, 0.012, 4, 10), k.paint, cf.x - 0.2, g0 + cf.plat + 0.5, cf.z + h + 0.045, 0xb5392c, 2, 0, 0, 0);
  addG(rod([cf.x + 0.2, g0 + cf.plat + 1.0, cf.z], [cf.x + 0.2, g0 + cf.plat + 1.75, cf.z], 0.012, 0.012, 4), k.wood, 0x6b5a45, 2);
  // Ladder on the west side.
  const lx = cf.x - h - 0.28;
  for (const sz of [-0.25, 0.25]) addG(rod([lx - 0.05, g0 - 0.05, cf.z + sz], [lx + 0.28, g0 + cf.plat, cf.z + sz], 0.03, 0.03, 6), k.weathered, tim, 1);
  for (let i = 1; i <= 5; i++) { const t = i / 6; addG(rod([lx - 0.05 + 0.33 * t, g0 - 0.05 + (cf.plat + 0.05) * t, cf.z - 0.25], [lx - 0.05 + 0.33 * t, g0 - 0.05 + (cf.plat + 0.05) * t, cf.z + 0.25], 0.017, 0.017, 5), k.weathered, 0xa88c64, 2); }
  // Slide: a steel chute with painted sides, on two legs.
  const sl = slideInfo();
  const slM = new THREE.Matrix4().compose(V(sl.cx, sl.cy, sl.cz), sl.q, V(1, 1, 1));
  ctx.add(boxUV(sl.len, 0.025, 0.54, 1), k.steel, slM, 0xc8ccce, 1);
  for (const sg of [-1, 1]) ctx.add(boxUV(sl.len, 0.2, 0.025, 1), k.paint, slM.clone().multiply(S.T(0, 0.08, sg * 0.27)), 0xb5392c, 1);
  ctx.add(boxUV(0.1, 0.12, 0.6, 1), k.paint, slM.clone().multiply(S.T(sl.len / 2, 0.01, 0)), 0xb5392c, 2);
  for (const sg of [-1, 1]) {
    const t = 0.55, x = sl.x0 + (sl.x1 - sl.x0) * t, yy = sl.y0 + (sl.y1 - sl.y0) * t, gg = G(x, sl.cz + sg * 0.3);
    addG(rod([x, gg - 0.05, sl.cz + sg * 0.3], [x, yy - 0.03, sl.cz + sg * 0.3], 0.025, 0.025, 6), k.paint, frameCol, 2);
  }
  // Roundabout: a steel disc on a post with a hoop of rails.
  const gr = G(rb.x, rb.z);
  addG(rod([rb.x, gr, rb.z], [rb.x, gr + rb.h, rb.z], 0.07, 0.06, 8), k.iron, 0x3a3a3c, 1);
  addG(new THREE.CylinderGeometry(rb.r, rb.r * 0.97, 0.06, 20).translate(rb.x, gr + rb.h, rb.z), k.paint, 0x3f6a8c, 1);
  add(new THREE.CylinderGeometry(rb.r * 0.86, rb.r * 0.86, 0.004, 20), k.zinc, rb.x, gr + rb.h + 0.032, rb.z, 0x8e9a9e, 2);
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + 0.4, a1 = (i + 1) * Math.PI / 2 + 0.4, p0 = [rb.x + Math.cos(a0) * 0.75, rb.z + Math.sin(a0) * 0.75], p1 = [rb.x + Math.cos(a1) * 0.75, rb.z + Math.sin(a1) * 0.75];
    addG(rod([p0[0], gr + rb.h, p0[1]], [p0[0], gr + rb.h + 0.7, p0[1]], 0.02, 0.02, 5), k.steel, 0xd8c24a, 1);
    addG(rod([p0[0], gr + rb.h + 0.7, p0[1]], [p1[0], gr + rb.h + 0.7, p1[1]], 0.02, 0.02, 5), k.steel, 0xd8c24a, 1);
    add(new THREE.SphereGeometry(0.025, 5, 4), k.steel, p0[0], gr + rb.h + 0.7, p0[1], 0xd8c24a, 2);
  }
  // A "Please close the gate" sign on the gate post.
  const P = PK.play, gx = P.gate[0] - 0.02, gz = P.z1;
  add(boxUV(0.12, 1.15, 0.12, 1), k.weathered, gx, G(gx, gz) + 0.55, gz, 0x5f4f3e, 1);
  add(boxUV(0.12, 1.15, 0.12, 1), k.weathered, P.gate[1] + 0.02, G(P.gate[1], gz) + 0.55, gz, 0x5f4f3e, 1);
  add(boxUV(0.34, 0.2, 0.012, 1), k.paint, gx + 0.0, G(gx, gz) + 0.86, gz + 0.075, 0x2f5a44, 2);
  ctx.ground.shadowRect(sl.x0, sl.cz - 0.3, sl.x1, sl.cz + 0.3, 0.9, 0.2);
}

// ------------------------------------------------------------------ the picnic
let gingham = null;
function ginghamMat(k) {
  if (gingham) return gingham;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#efe9dc'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(176,52,48,0.62)';
  for (let i = 0; i < 4; i++) { x.fillRect(i * 32, 0, 16, 128); }
  for (let i = 0; i < 4; i++) { x.fillRect(0, i * 32, 128, 16); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  gingham = k.fabric.clone();
  gingham.map = t; gingham.name = 'park-gingham';
  return gingham;
}

function picnic(S) {
  const { ctx, k, add, addG, jit, rnd } = S;
  const P = picnicInfo(), H = P.hamper;
  const at = (lx, lz) => frameAt(P, lx, lz);
  // The blanket, draped over the lumps of the meadow with a turned-up corner.
  {
    const nx = 12, nz = 10, pos = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const lx = (i / nx - 0.5) * P.w, lz = (j / nz - 0.5) * P.d, [x, z] = at(lx, lz);
      let y = G(x, z) + 0.014 + 0.006 * Math.sin(lx * 9 + lz * 7);
      const cx = lx - P.w / 2, cz = lz - P.d / 2;                      // the +x,+z corner curls up
      const d = Math.hypot(cx, cz);
      if (d < 0.35) y += (0.35 - d) * 0.14;
      pos.push(x, y, z); uv.push(lx * 4.2, lz * 4.2);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); faceUp(g);
    ctx.add(g, ginghamMat(k), null, 0xffffff, 1);
  }
  // Hamper: wicker body, domed lid, leather straps and a brass catch.
  {
    const [hx, hz] = at(H.lx, H.lz), y = P.y;
    add(boxUV(H.w, H.h - 0.07, H.d, 1.6), k.wicker, hx, y + (H.h - 0.07) / 2, hz, 0xb88b55, 1, P.yaw);
    add(boxUV(H.w + 0.02, 0.07, H.d + 0.02, 1.6), k.wicker, hx, y + H.h - 0.035, hz, 0xc29a62, 1, P.yaw);
    for (const sx of [-0.18, 0.18]) {
      const [sx2, sz2] = at(H.lx + sx, H.lz);
      add(boxUV(0.035, H.h - 0.01, H.d + 0.03, 1), k.fabric, sx2, y + (H.h - 0.01) / 2, sz2, 0x4a3426, 2, P.yaw);
    }
    const [bx, bz] = at(H.lx, H.lz + H.d / 2 + 0.014);
    add(boxUV(0.04, 0.04, 0.012, 1), k.brass, bx, y + H.h - 0.07, bz, 0xffffff, 2, P.yaw);
    // Corner posts of the hamper (stiffening) and a rope handle.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [px, pz] = at(H.lx + sx * H.w / 2, H.lz + sz * H.d / 2); addG(rod([px, y, pz], [px, y + H.h - 0.07, pz], 0.012, 0.012, 5), k.wicker, 0x9c7242, 2); }
  }
  // On the blanket: a folded tartan rug, a plate with sandwiches, a jam-jar of wild flowers, a paperback.
  const flat = (geo, mat, lx, lz, dy, col, lod, ry = 0) => { const [x, z] = at(lx, lz); add(geo, mat, x, G(x, z) + dy, z, col, lod, P.yaw + ry); };
  flat(boxUV(0.4, 0.07, 0.3, 1), k.fabric, 0.62, -0.38, 0.045, 0x5a2f35, 1, 0.2);
  flat(boxUV(0.4, 0.012, 0.3, 1), k.fabric, 0.62, -0.38, 0.082, 0x3e5a45, 2, 0.2);
  flat(new THREE.CylinderGeometry(0.11, 0.09, 0.014, 14), k.ceramic, -0.55, 0.12, 0.024, 0xefe9da, 1);
  for (let i = 0; i < 4; i++) flat(boxUV(0.07, 0.025, 0.07, 1), k.paper, -0.58 + (i % 2) * 0.06, 0.09 + (i >> 1) * 0.07, 0.04, jit(0xd9c192, 0.9, 1.08), 2, i * 0.3);
  flat(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8), k.glass, -0.3, 0.4, 0.06, 0xdde6e0, 2);
  flat(new THREE.CylinderGeometry(0.022, 0.026, 0.07, 8), k.glass, -0.3, 0.4, 0.05, 0xb0212a, 2);
  for (let i = 0; i < 3; i++) flat(new THREE.CircleGeometry(0.018, 6).rotateX(-Math.PI / 2 + 0.3), k.petal, -0.3 + (i - 1) * 0.02, 0.4, 0.14 + i * 0.01, [0xf2f0e4, 0xe6c24a, 0xc94b6a][i], 2);
  flat(boxUV(0.15, 0.025, 0.22, 1), k.paper, 0.1, 0.5, 0.027, 0xc8d3c0, 2, 0.5);
  flat(new THREE.CylinderGeometry(0.17, 0.2, 0.012, 12), k.wicker, 0.45, 0.45, 0.02, 0xd8bd7c, 2);
  flat(new THREE.CylinderGeometry(0.085, 0.1, 0.05, 12), k.wicker, 0.45, 0.45, 0.04, 0xd0b274, 2);
  ctx.ground.shadowRect(P.x - 0.4, P.z - 0.3, P.x + 0.4, P.z + 0.3, 0.3, 0.15);
}
