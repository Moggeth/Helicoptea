import * as THREE from 'three';
import { makeNoise, fbm } from '../../gardenTextures.js';
import { FY, BOUNDS, groundHeight, SUN_DIR } from '../../../sim/world/plan.js';

// The far distance beyond the walls of the world: a ring of English countryside from the edge of the painted
// ground map (x +-26, z -54..38) out to 350 m. One ring of rolling hills carrying a painted patchwork of
// fields and hedgerows (one canvas texture), plus one merged mesh of hedgerow trees, woods, farms, a church on
// a rise, a windmill, a water tower, telegraph poles and the rooftops of the rest of the village; and a few
// flocks of birds. Nothing is fogged by the scene: every colour is pre-mixed toward the haze by distance
// (vertex colours, an additive haze attribute), so far hills read as pale blue-green silhouettes instead of
// vanishing into the fog, on desktop and with the shorter phone fog alike.
// Returns { update(dt, camera) }.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const MAPR = { x0: -26, x1: 26, z0: -54, z1: 38 };          // the painted ground map
const CEN = { x: 0, z: -8 };                                 // centre of the ring
const R_OUT = 350;
const EXT = 352;                                             // the texture covers CEN +- EXT
const rectDist = (x, z) => Math.hypot(Math.max(MAPR.x0 - x, 0, x - MAPR.x1), Math.max(MAPR.z0 - z, 0, z - MAPR.z1));
const boxD = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

// Icosahedron (shared by every tree crown).
const T_ = (1 + Math.sqrt(5)) / 2;
const ICO_V = [[-1, T_, 0], [1, T_, 0], [-1, -T_, 0], [1, -T_, 0], [0, -1, T_], [0, 1, T_], [0, -1, -T_], [0, 1, -T_], [T_, 0, -1], [T_, 0, 1], [-T_, 0, -1], [-T_, 0, 1]]
  .map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
const OCT_V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OCT_F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

function subdivide(V, F) {
  const verts = V.map((v) => v.slice()), cache = new Map(), faces = [];
  const mid = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (cache.has(key)) return cache.get(key);
    const p = verts[a].map((c, i) => (c + verts[b][i]) / 2), l = Math.hypot(...p);
    verts.push(p.map((c) => c / l)); cache.set(key, verts.length - 1); return verts.length - 1;
  };
  for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  return [verts, faces];
}
const [ICO2_V, ICO2_F] = subdivide(ICO_V, ICO_F);

export function build(ctx, root) {
  const lite = !!ctx.lite;
  const S = lite ? 512 : 1024;
  const rnd = mulberry(90210);
  const nA = makeNoise(5151), nB = makeNoise(6262), nC = makeNoise(7373);
  const L = SUN_DIR, LG = 0.78;
  const C = (hex) => new THREE.Color(hex);

  // ------------------------------------------------------------------ where the village is
  const villageMask = (x, z) => {
    const w = (nB(x / 60 + 11, z / 60 + 4) - 0.5) * 44;
    const south = 1 - sm(0, 30, boxD(x, z, -175, 175, 43, 162) + w);
    const strip = 1 - sm(0, 22, boxD(Math.abs(x), z, 27, 152, -8, 46) + w * 0.6);
    return Math.max(south, strip);
  };

  // ------------------------------------------------------------------ ground height
  const knolls = [
    { x: -70, z: -165, h: 12, r: 55 },     // the church
    { x: 95, z: -215, h: 14, r: 50 },      // the water tower
    { x: 205, z: -25, h: 9, r: 40 },       // the windmill
  ];
  const baseH = (x, z) => {
    const d = rectDist(x, z);
    const e = groundHeight(clamp(x, MAPR.x0, MAPR.x1), clamp(z, MAPR.z0, MAPR.z1)) - FY;
    const big = fbm(nA, x / 240 + 3.1, z / 240 + 7.7, 3);
    const mid = fbm(nB, x / 85 + 1.3, z / 85 + 9.1, 3);
    let h = 40 * (big - 0.41) + 7 * (mid - 0.5);
    h += 30 * sm(20, 320, -z - 30);                       // the land rises to the north
    h += 6 * sm(60, 300, Math.abs(x));
    for (const k of knolls) { const dd = Math.hypot(x - k.x, z - k.z) / k.r; h += k.h * Math.exp(-dd * dd); }
    const v = villageMask(x, z);
    h *= (1 - 0.9 * v) * sm(12, 120, d);
    return e + h;
  };
  const sites = [];
  const site = (x, z, r0, r1) => { const s = { x, z, r0, r1, h: baseH(x, z) }; sites.push(s); return s; };
  const H = (x, z) => {
    let h = baseH(x, z);
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i], dd = Math.hypot(x - s.x, z - s.z);
      if (dd < s.r1) { const t = 1 - sm(s.r0, s.r1, dd); h += (s.h - h) * t; }
    }
    return FY + h;
  };

  // ------------------------------------------------------------------ haze
  const NEAR = lite ? 16 : 28, FAR = lite ? 92 : 165, FINF = 0.93;
  const fogC = C(0xe4e0d4);
  const f60 = clamp((60 - NEAR) / (FAR - NEAR), 0, 1);
  const hzc = [0, 0, 0];
  function hazeAt(x, y, z) {
    const dx = Math.max(BOUNDS.minX - x, 0, x - BOUNDS.maxX), dz = Math.max(BOUNDS.minZ - z, 0, z - BOUNDS.maxZ);
    const d = Math.hypot(dx, dz) + 14;
    const f = d <= 60 ? clamp((d - NEAR) / (FAR - NEAR), 0, 1) : FINF - (FINF - f60) * Math.exp(-(d - 60) / 140);
    // Far haze takes the colour of the sky behind it (as seen from a nominal height), a touch bluer.
    const ex = x - CEN.x, ey = y - (FY + 10), ez = z - CEN.z, l = Math.hypot(ex, ey, ez) || 1, dy = ey / l;
    let sr, sg, sb;
    if (dy >= 0) { const t = Math.pow(dy, 0.55); sr = 0.89 + (0.36 - 0.89) * t; sg = 0.88 + (0.55 - 0.88) * t; sb = 0.83 + (0.82 - 0.83) * t; }
    else { const m = clamp(-dy * 4, 0, 1); sr = 0.89 + (0.42 - 0.89) * m; sg = 0.88 + (0.5 - 0.88) * m; sb = 0.83 + (0.36 - 0.83) * m; }
    const w = sm(110, 300, d) * 0.85;
    hzc[0] = fogC.r + (sr * 0.83 - fogC.r) * w;
    hzc[1] = fogC.g + (sg * 0.9 - fogC.g) * w;
    hzc[2] = fogC.b + (sb * 0.98 - fogC.b) * w;
    return f;
  }
  const shade = (nx, ny, nz) => {
    const nd = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const amb = 0.17 + 0.13 * (0.5 + 0.5 * ny);
    return [(amb * 0.95 + nd * 1.0) * LG, (amb + nd * 0.95) * LG, (amb * 1.06 + nd * 0.86) * LG];
  };

  // ------------------------------------------------------------------ mesh accumulator
  class MB {
    constructor() { this.p = []; this.c = []; this.h = []; this.u = []; }
    vert(x, y, z, r, g, b, u = 0.5, v = 0.5) {
      const f = hazeAt(x, y, z);
      this.p.push(x, y, z); this.c.push(r * (1 - f), g * (1 - f), b * (1 - f));
      this.h.push(hzc[0] * f, hzc[1] * f, hzc[2] * f); this.u.push(u, v);
    }
    // One flat-shaded triangle; its normal is turned to point away from `centre`.
    tri(a, b, c, col, centre, k = 1) {
      let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (centre) {
        const dx = (a[0] + b[0] + c[0]) / 3 - centre[0], dy = (a[1] + b[1] + c[1]) / 3 - centre[1], dz = (a[2] + b[2] + c[2]) / 3 - centre[2];
        if (nx * dx + ny * dy + nz * dz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      }
      const s = shade(nx, ny, nz), r = col[0] * s[0] * k, g = col[1] * s[1] * k, bl = col[2] * s[2] * k;
      this.vert(a[0], a[1], a[2], r, g, bl); this.vert(b[0], b[1], b[2], r, g, bl); this.vert(c[0], c[1], c[2], r, g, bl);
    }
    quad(a, b, c, d, col, centre, k = 1) { this.tri(a, b, c, col, centre, k); this.tri(a, c, d, col, centre, k); }
    get tris() { return this.p.length / 9; }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('hz', new THREE.Float32BufferAttribute(this.h, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      g.computeBoundingSphere();
      return g;
    }
  }
  const jit = (c, a = 0.12) => { const k = 1 + (rnd() - 0.5) * a, t = (rnd() - 0.5) * a * 0.5; return [c.r * (k + t), c.g * k, c.b * (k - t)]; };

  const obj = new MB();

  // ------------------------------------------------------------------ solids
  function box(x0, y0, z0, x1, y1, z1, col, bottom = false) {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const P = (x, y, z) => [x, y, z];
    obj.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), col, c);
    obj.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col, c);
    obj.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), col, c);
    obj.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), col, c);
    obj.quad(P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), col, c);
    if (bottom) obj.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), col, c);
  }
  // A (tapered) upright prism with n sides, optionally capped with a cone.
  function frustum(cx, cz, r0, r1, y0, y1, n, col, cone = 0, coneCol = col, cap = true) {
    const c = [cx, (y0 + y1) / 2, cz];
    const ring = (r, y, i) => [cx + Math.cos(i / n * 6.2832) * r, y, cz + Math.sin(i / n * 6.2832) * r];
    for (let i = 0; i < n; i++) {
      obj.quad(ring(r0, y0, i), ring(r0, y0, i + 1), ring(r1, y1, i + 1), ring(r1, y1, i), col, c);
      if (cone > 0) obj.tri(ring(r1, y1, i), ring(r1, y1, i + 1), [cx, y1 + cone, cz], coneCol, c);
      else if (cap) obj.tri(ring(r1, y1, i), ring(r1, y1, i + 1), [cx, y1, cz], col, c);
    }
  }
  // A gable-roofed building. Its floor sits on the lowest corner of the ground; the walls reach down below it.
  function house(cx, cz, w, d, eave, ridge, alongX, wallCol, roofCol, chim = 1) {
    const hs = [H(cx - w / 2, cz - d / 2), H(cx + w / 2, cz - d / 2), H(cx - w / 2, cz + d / 2), H(cx + w / 2, cz + d / 2)];
    houseCount++;
    const y0 = Math.min(...hs), yb = y0 - 1.6, ye = y0 + eave, yr = y0 + ridge;
    const lenU = alongX ? w : d, lenV = alongX ? d : w, ov = 0.45;
    const P = (u, y, v) => (alongX ? [cx + u, y, cz + v] : [cx + v, y, cz + u]);
    const hu = lenU / 2, hv = lenV / 2, mid = [cx, (yb + yr) / 2, cz];
    for (const [u0, v0, u1, v1] of [[-hu, -hv, hu, -hv], [hu, -hv, hu, hv], [hu, hv, -hu, hv], [-hu, hv, -hu, -hv]]) obj.quad(P(u0, yb, v0), P(u1, yb, v1), P(u1, ye, v1), P(u0, ye, v0), wallCol, mid);
    obj.tri(P(-hu, ye, -hv), P(-hu, ye, hv), P(-hu, yr, 0), wallCol, mid);
    obj.tri(P(hu, ye, -hv), P(hu, ye, hv), P(hu, yr, 0), wallCol, mid);
    const rc = [cx, ye, cz];
    for (const sg of [-1, 1]) obj.quad(P(-hu - ov, ye - 0.25, sg * (hv + ov)), P(hu + ov, ye - 0.25, sg * (hv + ov)), P(hu + ov, yr + 0.08, 0), P(-hu - ov, yr + 0.08, 0), roofCol, rc);
    const brick = [0.36, 0.17, 0.12];
    const nch = Math.hypot(cx - CEN.x, cz - CEN.z) > 150 ? Math.min(chim, 1) : Math.min(chim, 2);
    for (let i = 0; i < nch; i++) {
      const u = (nch === 1 ? (rnd() < 0.5 ? -1 : 1) * hu * 0.78 : (i / (nch - 1) - 0.5) * lenU * 0.8), s = Math.max(0.9, w * 0.07 + 0.3), v = (rnd() - 0.5) * 0.3;
      const p0 = P(u - s / 2, yr - 0.8, v - s / 2), p1 = P(u + s / 2, yr + 1.5 + rnd() * 0.6, v + s / 2);
      box(Math.min(p0[0], p1[0]), yr - 0.8, Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2]), brick);
    }
    return { x0: cx - w / 2 - 1, x1: cx + w / 2 + 1, z0: cz - d / 2 - 1, z1: cz + d / 2 + 1 };
  }

  // ------------------------------------------------------------------ trees
  const treeCols = [C(0x4b6a2e), C(0x55733a), C(0x476030), C(0x5d7c3a), C(0x4e6a35), C(0x6a7c3a), C(0x425d2d)];
  const darkCols = [C(0x42623d), C(0x486840)];
  const barkCol = C(0x4a3b2d);
  let treeCount = 0, houseCount = 0, treeTris = 0;
  function blob(cx, cy, cz, rx, ry, rz, col, base, top, lod = 1) {
    const VV = lod === 2 ? ICO2_V : ICO_V, FF = lod === 2 ? ICO2_F : ICO_F;
    const p1 = rnd() * 6.3, p2 = rnd() * 6.3, p3 = rnd() * 6.3;
    const V = VV.map((v) => {
      const k = lod === 2 ? 1 + 0.13 * Math.sin(v[0] * 3.3 + p1) * Math.sin(v[1] * 2.9 + p2) + 0.1 * Math.sin(v[2] * 4.1 + p3) + (rnd() - 0.5) * 0.06 : 0.86 + rnd() * 0.3;
      return [cx + v[0] * rx * k, cy + v[1] * ry * k, cz + v[2] * rz * k];
    });
    for (const f of FF) {
      const a = V[f[0]], b = V[f[1]], c = V[f[2]];
      const fy = clamp(((a[1] + b[1] + c[1]) / 3 - base) / Math.max(0.1, top - base), 0, 1);
      obj.tri(a, b, c, col, [cx, cy, cz], (0.7 + 0.4 * fy) * (0.96 + rnd() * 0.08));
    }
  }
  // h: total height; r: crown radius.
  function tree(x, z, h, r, kind = 0, detail = true) {
    const y0 = H(x, z), dC = Math.hypot(x - CEN.x, z - CEN.z), lod = dC < 62 && detail ? 2 : 1;
    let col;
    if (kind === 2) col = jit(darkCols[(rnd() * darkCols.length) | 0], 0.14);
    else col = jit(treeCols[(rnd() * treeCols.length) | 0], 0.16);
    const rx = kind === 1 ? r * 0.5 : r, ry = kind === 1 ? Math.min(h * 0.5, r * 2.4) : r * (0.9 + rnd() * 0.25);
    const cy = y0 + h - ry;
    blob(x, cy, z, rx, ry, rx, col, y0 + h - 2 * ry, y0 + h, lod);
    if (detail && dC < 120 && r > 4.2 && kind === 0) {
      const a = rnd() * 6.28;
      blob(x + Math.cos(a) * r * 0.55, cy - ry * 0.2, z + Math.sin(a) * r * 0.55, rx * 0.66, ry * 0.7, rx * 0.66, col, y0 + h - 2 * ry, y0 + h, 1);
    }
    if (detail && dC < 120) {
      const tw = Math.max(0.45, r * 0.12), top = Math.max(cy - ry * 0.2, y0 + 2);
      const P = (a, y) => [x + Math.cos(a) * (y > top - 0.1 ? tw * 0.6 : tw), y, z + Math.sin(a) * (y > top - 0.1 ? tw * 0.6 : tw)];
      const cc = [x, (y0 + top) / 2, z];
      for (let i = 0; i < 3; i++) { const a0 = i * 2.0944 + 0.78, a1 = a0 + 2.0944; obj.quad(P(a0, y0 - 0.4), P(a1, y0 - 0.4), P(a1, top), P(a0, top), barkCol.toArray(), cc); }
    }
    treeCount++;
  }

  // ------------------------------------------------------------------ fields, hedges, woods (painted)
  const FIELD_TYPES = [
    // colour, rows colour, row alpha, weight
    { c: '#6e8c3e', r: '#5b7833', a: 0.10, w: 30 },   // pasture
    { c: '#7aa040', r: '#64853a', a: 0.08, w: 14 },   // lush grass
    { c: '#b6a550', r: '#948540', a: 0.16, w: 12 },   // barley
    { c: '#d0b862', r: '#ac9444', a: 0.16, w: 10 },   // wheat
    { c: '#a8995c', r: '#8c7e48', a: 0.18, w: 6 },    // stubble
    { c: '#7a5a3c', r: '#5e442c', a: 0.30, w: 8 },    // ploughed
    { c: '#bdb046', r: '#a69b3a', a: 0.10, w: 4 },    // rape
    { c: '#52703a', r: '#425c2c', a: 0.08, w: 8 },    // dark grass
    { c: '#82924a', r: '#6e7e3e', a: 0.10, w: 8 },    // hay meadow
  ];
  const WSUM = FIELD_TYPES.reduce((a, t) => a + t.w, 0);
  const pickType = () => { let r = rnd() * WSUM; for (const t of FIELD_TYPES) { if ((r -= t.w) < 0) return t; } return FIELD_TYPES[0]; };

  const fields = [];
  const edges = new Map();
  {
    const cs = 84, n = Math.ceil(2 * EXT / cs) + 2, ox = CEN.x - EXT - cs, oz = CEN.z - EXT - cs;
    const Pt = [];
    for (let i = 0; i <= n; i++) { Pt[i] = []; for (let j = 0; j <= n; j++) Pt[i][j] = [ox + i * cs + (rnd() - 0.5) * cs * 0.62, oz + j * cs + (rnd() - 0.5) * cs * 0.62]; }
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const addEdge = (a, b) => {
      const k = [a, b].sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`).join('|');
      if (!edges.has(k)) edges.set(k, [a, b]);
    };
    const addField = (pts) => {
      const type = pickType();
      fields.push({ pts, type, ang: rnd() * 3.14, bl: (rnd() * 4) | 0 });
      for (let i = 0; i < pts.length; i++) addEdge(pts[i], pts[(i + 1) % pts.length]);
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = Pt[i][j], b = Pt[i + 1][j], c = Pt[i + 1][j + 1], d = Pt[i][j + 1];
      const m = rnd();
      if (m < 0.4) addField([a, b, c, d]);
      else if (m < 0.65) { const t = 0.38 + rnd() * 0.24, p = lerp2(a, b, t), q = lerp2(d, c, t); addField([a, p, q, d]); addField([p, b, c, q]); }
      else if (m < 0.9) { const t = 0.38 + rnd() * 0.24, p = lerp2(a, d, t), q = lerp2(b, c, t); addField([a, b, q, p]); addField([p, q, c, d]); }
      else {
        const t = 0.4 + rnd() * 0.2, u = 0.4 + rnd() * 0.2, pa = lerp2(a, b, t), pb = lerp2(d, c, t), pc = lerp2(a, d, u), pd = lerp2(b, c, u), mm = lerp2(lerp2(a, c, 0.5), lerp2(b, d, 0.5), 0.5);
        addField([a, pa, mm, pc]); addField([pa, b, pd, mm]); addField([mm, pd, c, pb]); addField([pc, mm, pb, d]);
      }
    }
  }

  // Woods: ragged blobs.
  const woods = [];
  {
    const spots = [[-55, -105, 38, 30], [70, -120, 46, 32], [-150, -75, 40, 34], [150, -150, 52, 36], [-215, -190, 60, 40], [30, -265, 56, 34], [200, 70, 40, 30], [-230, 60, 44, 32],
      [-30, 235, 48, 30], [130, 215, 40, 30], [-170, 190, 38, 28], [250, -80, 40, 30]];
    for (const [x, z, rx, rz] of spots) woods.push({ x, z, rx, rz, rot: rnd() * 3.14, ph: rnd() * 10 });
  }
  const woodR = (w, a) => 1 + 0.28 * Math.sin(a * 3 + w.ph) + 0.16 * Math.sin(a * 5 + w.ph * 2.1);
  const inWood = (w, x, z) => {
    const dx = x - w.x, dz = z - w.z, c = Math.cos(w.rot), s = Math.sin(w.rot), u = (dx * c + dz * s) / w.rx, v = (-dx * s + dz * c) / w.rz;
    return Math.hypot(u, v) < 0.92 * woodR(w, Math.atan2(v, u)) * 0.85;
  };

  // Farms, the hamlet round the church, and the lanes.
  const farms = [{ x: -150, z: -30 }, { x: 170, z: -80 }, { x: 48, z: -205 }, { x: -120, z: 205 }, { x: 215, z: 120 }, { x: -225, z: 20 }];
  for (const f of farms) site(f.x, f.z, 36, 56);
  site(-70, -165, 26, 50); site(95, -215, 12, 28); site(205, -25, 14, 32);
  const lanes = [
    [[26, 17.8], [150, 17.8], [210, 32], [262, 62], [352, 72]],
    [[-26, 17.8], [-150, 17.8], [-215, 10], [-280, -20], [-352, -34]],
    [[0, 160], [14, 215], [58, 262], [82, 352]],
    [[-150, 17.8], [-125, -60], [-92, -120], [-70, -165], [-48, -250], [-62, -352]],
    [[-352, -60], [-100, -84], [100, -80], [352, -96]],
    [[170, -80], [140, -20], [205, 20], [262, 62]],
    [[48, -205], [60, -140], [100, -86]],
    [[-120, 205], [-95, 150]],
  ];

  // ------------------------------------------------------------------ the texture
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g2 = canvas.getContext('2d');
  const k = S / (2 * EXT), X0 = CEN.x - EXT, Z0 = CEN.z - EXT;
  const cx_ = (x) => (x - X0) * k, cz_ = (z) => (z - Z0) * k;
  const path = (pts, close = true) => { g2.beginPath(); g2.moveTo(cx_(pts[0][0]), cz_(pts[0][1])); for (let i = 1; i < pts.length; i++) g2.lineTo(cx_(pts[i][0]), cz_(pts[i][1])); if (close) g2.closePath(); };
  const smoothPath = (pts) => {
    g2.beginPath(); g2.moveTo(cx_(pts[0][0]), cz_(pts[0][1]));
    for (let i = 1; i < pts.length - 1; i++) { const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; g2.quadraticCurveTo(cx_(pts[i][0]), cz_(pts[i][1]), cx_(m[0]), cz_(m[1])); }
    const l = pts[pts.length - 1]; g2.lineTo(cx_(l[0]), cz_(l[1]));
  };
  g2.fillStyle = '#6e8c3e'; g2.fillRect(0, 0, S, S);
  for (const f of fields) {
    g2.save();
    path(f.pts); g2.fillStyle = f.type.c; g2.fill(); g2.clip();
    const mx = f.pts.reduce((a, p) => a + p[0], 0) / f.pts.length, mz = f.pts.reduce((a, p) => a + p[1], 0) / f.pts.length;
    // Crop rows / ploughing.
    g2.strokeStyle = f.type.r; g2.globalAlpha = f.type.a * 2.2; g2.lineWidth = Math.max(1, k * 1.6);
    const ca = Math.cos(f.ang), sa = Math.sin(f.ang), sp = Math.max(2.4, k * 3.6);
    g2.beginPath();
    for (let t = -70 * k; t < 70 * k; t += sp) {
      const px = cx_(mx) - sa * t, pz = cz_(mz) + ca * t;
      g2.moveTo(px - ca * 90 * k, pz - sa * 90 * k); g2.lineTo(px + ca * 90 * k, pz + sa * 90 * k);
    }
    g2.stroke();
    // Blotches of lighter and darker growth.
    for (let b = 0; b < 4 + f.bl; b++) {
      g2.globalAlpha = 0.10 + rnd() * 0.10; g2.fillStyle = rnd() < 0.5 ? '#2c3a1c' : '#f0e4a0';
      g2.beginPath(); g2.ellipse(cx_(mx + (rnd() - 0.5) * 70), cz_(mz + (rnd() - 0.5) * 70), (6 + rnd() * 24) * k, (6 + rnd() * 18) * k, rnd() * 3, 0, 6.2832); g2.fill();
    }
    g2.restore();
  }
  g2.globalAlpha = 1;
  g2.lineCap = g2.lineJoin = 'round';
  // Verges and hedges along the edges (a few boundaries are open or fenced).
  const edgeList = [...edges.values()].filter(() => rnd() > 0.1);
  g2.strokeStyle = 'rgba(122,142,64,0.55)'; g2.lineWidth = Math.max(2, k * 6);
  g2.beginPath(); for (const [a, b] of edgeList) { g2.moveTo(cx_(a[0]), cz_(a[1])); g2.lineTo(cx_(b[0]), cz_(b[1])); } g2.stroke();
  g2.strokeStyle = '#34492a'; g2.lineWidth = Math.max(1.6, k * 3.2);
  g2.beginPath(); for (const [a, b] of edgeList) { g2.moveTo(cx_(a[0]), cz_(a[1])); g2.lineTo(cx_(b[0]), cz_(b[1])); } g2.stroke();
  // Lanes.
  for (const ln of lanes) {
    smoothPath(ln); g2.strokeStyle = 'rgba(128,140,72,0.8)'; g2.lineWidth = Math.max(3, k * 9); g2.stroke();
    smoothPath(ln); g2.strokeStyle = '#78746a'; g2.lineWidth = Math.max(1.5, k * 4.4); g2.stroke();
  }
  // Woods.
  for (const w of woods) {
    g2.beginPath();
    for (let i = 0; i <= 36; i++) {
      const a = i / 36 * 6.2832, r = woodR(w, a) * 0.85, u = Math.cos(a) * w.rx * r, v = Math.sin(a) * w.rz * r;
      const x = w.x + u * Math.cos(w.rot) - v * Math.sin(w.rot), z = w.z + u * Math.sin(w.rot) + v * Math.cos(w.rot);
      if (i) g2.lineTo(cx_(x), cz_(z)); else g2.moveTo(cx_(x), cz_(z));
    }
    g2.closePath(); g2.fillStyle = '#35502b'; g2.fill();
  }
  // Farm yards.
  for (const f of farms) {
    g2.fillStyle = '#857a62'; g2.fillRect(cx_(f.x - 24), cz_(f.z - 14), 52 * k, 34 * k);
    g2.fillStyle = '#6f8a45'; g2.fillRect(cx_(f.x - 26), cz_(f.z + 20), 56 * k, 8 * k);
  }
  g2.fillStyle = '#7d8a52'; g2.beginPath(); g2.ellipse(cx_(-70), cz_(-160), 24 * k, 28 * k, 0, 0, 6.2832); g2.fill();          // the churchyard
  g2.fillStyle = '#6f8a45'; g2.beginPath(); g2.ellipse(cx_(-70), cz_(-162), 19 * k, 22 * k, 0, 0, 6.2832); g2.fill();
  // Allotments and the back lane beyond the map's sides.
  for (const sg of [-1, 1]) {
    g2.fillStyle = '#a39883'; g2.fillRect(cx_(sg > 0 ? 26 : -100), cz_(-9.3), 74 * k, 3 * k);
    for (let x = 27; x < 100; x += 6) for (let z = -24.5; z < -10; z += 7) {
      g2.fillStyle = rnd() < 0.45 ? '#5a4833' : rnd() < 0.5 ? '#587a37' : '#4a6b30';
      g2.fillRect(cx_(sg > 0 ? x : -x - 5), cz_(z), 5 * k, 6 * k);
    }
  }

  // Village garden ground and the soft meadow where the map meets the ring (per pixel).
  {
    const vc = document.createElement('canvas'); vc.width = vc.height = S;
    const vg = vc.getContext('2d'), vi = vg.createImageData(S, S);
    const mc = document.createElement('canvas'); mc.width = mc.height = S;
    const mg = mc.getContext('2d'), mi = mg.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = X0 + (i + 0.5) / k, z = Z0 + (j + 0.5) / k, p = (j * S + i) * 4;
      const m = villageMask(x, z);
      if (m > 0.01) {
        const nv = 0.82 + 0.3 * nC(x / 6, z / 6);
        vi.data[p] = 104 * nv; vi.data[p + 1] = 136 * nv; vi.data[p + 2] = 64 * nv; vi.data[p + 3] = 255 * sm(0, 0.7, m);
      }
      const a = 1 - sm(4, 48, rectDist(x, z));
      if (a > 0.005) { const nv = 0.9 + 0.2 * nC(x / 9 + 50, z / 9); mi.data[p] = 118 * nv; mi.data[p + 1] = 126 * nv; mi.data[p + 2] = 68 * nv; mi.data[p + 3] = 255 * a; }
    }
    vg.putImageData(vi, 0, 0); mg.putImageData(mi, 0, 0);
    g2.drawImage(vc, 0, 0); g2.drawImage(mc, 0, 0);
  }
  // Village streets and the street beyond the parade.
  {
    const road = (pts, w) => {
      path(pts, false); g2.strokeStyle = '#8f8c80'; g2.lineWidth = (w + 3) * k; g2.stroke();
      path(pts, false); g2.strokeStyle = '#55565a'; g2.lineWidth = w * k; g2.stroke();
    };
    g2.lineCap = 'butt';
    for (const side of [-1, 1]) road([[side * 26, 17.8], [side * 150, 17.8]], 6);
    for (const zs of [57, 97, 137]) road([[-175, zs], [175, zs]], 6);
    for (const xr of [-70, 60]) road([[xr, 45], [xr, 150]], 6);
    // The cricket green and a pond.
    g2.fillStyle = '#7ca147'; g2.fillRect(cx_(-140), cz_(104), 38 * k, 24 * k);
    g2.fillStyle = '#566b6a'; g2.beginPath(); g2.ellipse(cx_(112), cz_(112), 9 * k, 6 * k, 0, 0, 6.2832); g2.fill();
    g2.lineCap = 'round';
  }
  // A soft mottle over everything.
  {
    const nS = 256, nc = document.createElement('canvas'); nc.width = nc.height = nS;
    const nx = nc.getContext('2d'), ni = nx.createImageData(nS, nS);
    for (let j = 0; j < nS; j++) for (let i = 0; i < nS; i++) {
      const v = fbm(nC, i / 22 + 4, j / 22 + 9, 4), p = (j * nS + i) * 4;
      ni.data[p] = 190 + 90 * v; ni.data[p + 1] = 195 + 80 * v; ni.data[p + 2] = 175 + 80 * v; ni.data[p + 3] = 255;
    }
    nx.putImageData(ni, 0, 0);
    g2.globalCompositeOperation = 'multiply'; g2.imageSmoothingEnabled = true; g2.drawImage(nc, 0, 0, S, S); g2.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = lite ? 4 : 8;

  // ------------------------------------------------------------------ the terrain ring
  const terrain = new MB();
  {
    const NA = 112, M = 18;
    // Angles: uniform, plus the four corners of the map so the inner edge follows the rectangle exactly.
    const angs = [];
    for (let i = 0; i < NA; i++) angs.push(i / NA * 6.2832 - 3.1416);
    for (const [x, z] of [[MAPR.x0, MAPR.z0], [MAPR.x1, MAPR.z0], [MAPR.x1, MAPR.z1], [MAPR.x0, MAPR.z1]]) angs.push(Math.atan2(z - CEN.z, x - CEN.x));
    angs.sort((a, b) => a - b);
    const rings = [];       // rings[j][i] = [x, y, z]
    const edgeIn = (a) => {
      const c = Math.cos(a), s = Math.sin(a);
      const tx = c > 0 ? (MAPR.x1 - CEN.x) / c : c < 0 ? (MAPR.x0 - CEN.x) / c : 1e9, tz = s > 0 ? (MAPR.z1 - CEN.z) / s : s < 0 ? (MAPR.z0 - CEN.z) / s : 1e9;
      const t = Math.min(tx, tz);
      return [CEN.x + c * t, CEN.z + s * t, c, s];
    };
    const ins = angs.map(edgeIn);
    // Ring 0 tucks a hand under the map; ring 1 is the map's own edge.
    rings.push(ins.map(([x, z, c, s]) => { const xx = x - c * 0.25, zz = z - s * 0.25; return [xx, groundHeight(clamp(xx, MAPR.x0, MAPR.x1), clamp(zz, MAPR.z0, MAPR.z1)) - 0.06, zz]; }));
    for (let j = 0; j <= M; j++) {
      const u = Math.pow(j / M, 1.7);
      rings.push(ins.map(([x, z, c, s]) => {
        const ox = CEN.x + c * R_OUT, oz = CEN.z + s * R_OUT;
        const xx = x + (ox - x) * u, zz = z + (oz - z) * u;
        return [xx, j === 0 ? groundHeight(clamp(xx, MAPR.x0, MAPR.x1), clamp(zz, MAPR.z0, MAPR.z1)) : H(xx, zz), zz];
      }));
    }
    const vcol = (p) => {
      const e = 6, hx = H(p[0] + e, p[2]) - H(p[0] - e, p[2]), hz = H(p[0], p[2] + e) - H(p[0], p[2] - e);
      // Exaggerate the slope a little so the hills read.
      let nx = -hx / (2 * e) * 2.2, nz = -hz / (2 * e) * 2.2, ny = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      return shade(nx, ny, nz);
    };
    const info = rings.map((ring, j) => ring.map((p) => ({ p, c: j === 0 ? shade(0, 1, 0) : vcol(p) })));
    const push = (q) => terrain.vert(q.p[0], q.p[1], q.p[2], q.c[0], q.c[1], q.c[2], (q.p[0] - X0) / (2 * EXT), (q.p[2] - Z0) / (2 * EXT));
    const na = angs.length;
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < na; i++) {
      const i1 = (i + 1) % na, a = info[j][i], b = info[j][i1], c = info[j + 1][i], d = info[j + 1][i1];
      push(a); push(b); push(c);
      push(b); push(d); push(c);
    }
  }

  // ------------------------------------------------------------------ hedgerow trees
  const roughOK = (x, z) => rectDist(x, z) > 11 && villageMask(x, z) < 0.3;
  const nearWood = (x, z) => woods.some((w) => inWood(w, x, z));
  for (const [a, b] of edges.values()) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dd = Math.hypot(mx - CEN.x, mz - CEN.z);
    const spacing = dd < 120 ? 20 : dd < 210 ? 34 : 60;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    for (let t = rnd() * spacing; t < len; t += spacing * (0.7 + rnd() * 0.6)) {
      if (rnd() < 0.5) continue;
      const x = a[0] + dx * t - dz * (rnd() - 0.5) * 3, z = a[1] + dz * t + dx * (rnd() - 0.5) * 3;
      if (!roughOK(x, z) || nearWood(x, z)) continue;
      const r = rnd();
      if (r < 0.1) tree(x, z, 15 + rnd() * 6, 2.6 + rnd(), 1);
      else if (r < 0.16) tree(x, z, 10 + rnd() * 3, 3.6, 2);
      else tree(x, z, 9.5 + rnd() * 6.5, 4 + rnd() * 3);
      if (dd < 100 && rnd() < 0.25) tree(x + (rnd() - 0.5) * 9, z + (rnd() - 0.5) * 9, 7 + rnd() * 4, 3 + rnd() * 1.8);
    }
  }
  // Woods.
  for (const w of woods) {
    const sp = lite ? 18 : 15, n = Math.ceil(Math.max(w.rx, w.rz) * 2 / sp);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const u = i * sp + (rnd() - 0.5) * sp * 0.7, v = j * sp + (rnd() - 0.5) * sp * 0.7;
      const x = w.x + u * Math.cos(w.rot) - v * Math.sin(w.rot), z = w.z + u * Math.sin(w.rot) + v * Math.cos(w.rot);
      if (!inWood(w, x, z) || rectDist(x, z) < 9) continue;
      const dd = Math.hypot(x - CEN.x, z - CEN.z);
      tree(x, z, 12 + rnd() * 6, 5.5 + rnd() * 2.5, rnd() < 0.18 ? 2 : 0, dd < 160);
    }
  }

  // ------------------------------------------------------------------ farms
  const wallCols = [C(0x8a5243), C(0x7d4a3a), C(0xa3917a), C(0xc9c0ac), C(0x94604a), C(0xb8aa8c), C(0xd2cbb8)];
  const roofCols = [C(0x6a4038), C(0x7a463a), C(0x4f545b), C(0x5d4439), C(0x44494f), C(0x7e4a3a)];
  const pick = (a) => jit(a[(rnd() * a.length) | 0], 0.14);
  for (const f of farms) {
    house(f.x - 14, f.z + 6, 11, 7.5, 5.4, 8.6, true, pick(wallCols), jit(roofCols[(rnd() * 2) | 0], 0.1), 2);
    house(f.x + 9, f.z - 4, 11, 22, 5, 8.8, false, jit(C(0x6e5a44), 0.15), jit(C(0x7e8484), 0.1), 0);
    house(f.x + 12, f.z + 14, 15, 6.5, 3.4, 5.6, true, jit(C(0x8a7458), 0.15), jit(C(0x9a5a40), 0.1), 0);
    house(f.x - 8, f.z - 8, 8, 5, 3, 5, true, pick(wallCols), jit(roofCols[3], 0.1), 1);
    frustum(f.x + 23, f.z - 2, 2.2, 2.2, H(f.x + 23, f.z - 2) - 1, H(f.x + 23, f.z - 2) + 13, 8, jit(C(0xb4b4a8), 0.1), 2.2, jit(C(0x6a6e70), 0.1));
    frustum(f.x + 23, f.z + 5, 1.8, 1.8, H(f.x + 23, f.z + 5) - 1, H(f.x + 23, f.z + 5) + 10, 8, jit(C(0xb4b4a8), 0.1), 1.8, jit(C(0x6a6e70), 0.1));
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28 + rnd() * 0.4, rr = 30 + rnd() * 14;
      tree(f.x + Math.cos(a) * rr * 1.1, f.z + Math.sin(a) * rr * 0.8, 13 + rnd() * 6, 4.8 + rnd() * 2);
    }
  }

  // ------------------------------------------------------------------ the church, its hamlet, a windmill, a water tower
  {
    const cx = -70, cz = -165, stone = jit(C(0xb4aa90), 0.06), slate = jit(C(0x555b62), 0.06);
    house(cx, cz + 6, 8, 20, 6.5, 11.5, false, stone, slate, 0);
    house(cx, cz - 8.5, 6, 7, 5, 8.5, false, stone, slate, 0);
    const y0 = H(cx, cz - 6) - 1.5, tz = cz + 17.5, ty = H(cx, cz) + 17;
    box(cx - 3.2, y0, tz - 3.2, cx + 3.2, ty, tz + 3.2, stone, false);
    box(cx - 3.5, ty - 0.1, tz - 3.5, cx + 3.5, ty + 1.2, tz + 3.5, stone, true);                       // the parapet
    frustum(cx, tz, 2.7, 0.15, ty + 1.2, ty + 15, 8, slate);                                              // the spire
    box(cx - 0.12, ty + 14, tz - 0.12, cx + 0.12, ty + 16.5, tz + 0.12, [0.5, 0.4, 0.2]);
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, r = 9 + rnd() * 12; tree(cx + Math.cos(a) * r, cz + Math.sin(a) * r * 1.1, 8 + rnd() * 3, 2.6 + rnd(), 2); }
    // Cottages by the lane.
    const cot = [[-46, -150, true], [-92, -138, true], [-100, -170, false], [-45, -185, false], [-88, -195, true], [-52, -128, true]];
    for (const [x, z, ax] of cot) house(x, z, ax ? 9 : 6.5, ax ? 6.5 : 9, 4.4, 7, ax, pick(wallCols), pick(roofCols), 1);
  }
  {
    // The windmill: a brick tower mill with a white cap and four sails.
    const mx = 205, mz = -25, my = H(mx, mz);
    frustum(mx, mz, 4.8, 2.9, my - 1.5, my + 14, 8, jit(C(0x8a5a44), 0.08));
    frustum(mx, mz, 3.3, 3.3, my + 14, my + 15.4, 8, jit(C(0xdad4c4), 0.04), 3.4, jit(C(0x5c5348), 0.05));
    const hub = [mx, my + 15.4, mz + 3.4], sailCol = jit(C(0xcfc6b0), 0.05), rot = 0.5;
    for (let i = 0; i < 4; i++) {
      const a = rot + i * 1.5708, ca = Math.cos(a), sa = Math.sin(a);
      const P = (l, w, zz) => [hub[0] + ca * l - sa * w, hub[1] + sa * l + ca * w, hub[2] + zz];
      const q = [P(1, -0.55, 0), P(11.5, -0.55, 0), P(11.5, 0.55, 0), P(1, 0.55, 0)];
      obj.quad(q[0], q[1], q[2], q[3], sailCol, [hub[0], hub[1], hub[2] - 5]);
      obj.quad(q[3], q[2], q[1], q[0], sailCol, [hub[0], hub[1], hub[2] + 5]);
    }
    // The water tower.
    const wx = 95, wz = -215, wy = H(wx, wz), con = jit(C(0xaaa8a0), 0.05);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) box(wx + dx - 0.45, wy - 1, wz + dz - 0.45, wx + dx + 0.45, wy + 22, wz + dz + 0.45, con);
    box(wx - 3.6, wy + 11, wz - 3.6, wx + 3.6, wy + 11.5, wz + 3.6, con, true);
    frustum(wx, wz, 5.2, 5.2, wy + 22, wy + 28.5, 10, jit(C(0xc4c2b8), 0.05), 3, jit(C(0x6c7076), 0.05));
  }

  // ------------------------------------------------------------------ the village
  {
    const noHouse = (x, z) => (x > -146 && x < -98 && z > 98 && z < 134) || (x > 100 && x < 124 && z > 100 && z < 124) || rectDist(x, z) < 7;
    const crossAt = [-70, 60];
    const row = (zc, xa, xb, depth, eave, ridge, shops) => {
      let x = xa;
      while (x < xb) {
        const n = 1 + ((rnd() * 3.2) | 0), unit = 6.4 + rnd() * 1.2, len = n * unit, cx = x + len / 2;
        const dd = depth + (rnd() - 0.5) * 0.8;
        const ok = !crossAt.some((xr) => Math.abs(cx - xr) < len / 2 + 5) && !noHouse(cx, zc) && villageMask(cx, zc) > 0.35 + 0.35 * rnd();
        if (ok) {
          const low = !shops && rnd() < 0.12;
          const e = low ? 3 : eave + rnd() * 0.5, rd = low ? 5.2 : ridge + rnd() * 0.6;
          house(cx, zc, len, dd, e, rd, true, shops ? pick(wallCols) : pick(wallCols), pick(roofCols), Math.min(3, n + 1));
          if (rnd() < 0.55) {
            const side = rnd() < 0.5 ? -1 : 1;
            tree(cx + (rnd() - 0.5) * len, zc + side * (dd / 2 + 4 + rnd() * 3), 6.5 + rnd() * 3.5, 2.8 + rnd() * 1.3, rnd() < 0.15 ? 2 : 0, false);
          }
        }
        x += len + 1.5 + rnd() * (rnd() < 0.25 ? 9 : 2.5);
      }
    };
    // Our street carries on past the map: houses on our side, the parade's row of shops and houses opposite.
    for (const [xa, xb] of [[30, 150], [-150, -30]]) {
      row(5.4, xa, xb, 6.35, 5.2, 7.9, false);
      row(27.4, xa, xb, 7.2, 6.3, 8.6, true);
    }
    // The rest of the village behind the parade.
    for (const zs of [57, 97, 137]) {
      row(zs - 10.5, -175, 175, 6.8, 5.2, 7.9, false);
      row(zs + 10.5, -175, 175, 6.8, 5.2, 7.9, false);
    }
    // A scatter of trees in the gaps.
    for (let i = 0; i < 40; i++) {
      const x = (rnd() - 0.5) * 340, z = 40 + rnd() * 125;
      if (villageMask(x, z) > 0.5 && !noHouse(x, z) && Math.abs(((z - 57) % 40 + 40) % 40 - 20) > 8) tree(x, z, 8 + rnd() * 6, 3.4 + rnd() * 1.6, 0, false);
    }
  }

  // ------------------------------------------------------------------ telegraph poles
  {
    const zAt = (x) => { const pl = lanes[4]; let best = -82; for (let i = 0; i < pl.length - 1; i++) if (x >= pl[i][0] && x <= pl[i + 1][0]) best = pl[i][1] + (pl[i + 1][1] - pl[i][1]) * (x - pl[i][0]) / (pl[i + 1][0] - pl[i][0]); return best + 3.6; };
    const wood = [0.2, 0.15, 0.11], wire = [0.07, 0.07, 0.08];
    let prev = null;
    for (let x = -300; x <= 300; x += 44) {
      const z = zAt(x), y = H(x, z), top = y + 8.4;
      box(x - 0.16, y - 0.3, z - 0.16, x + 0.16, top, z + 0.16, wood);
      box(x - 1.3, top - 0.9, z - 0.09, x + 1.3, top - 0.7, z + 0.09, wood);
      const pts = [-1.1, 0, 1.1].map((o) => [x + o, top - 0.6, z]);
      if (prev) {
        for (let wI = 0; wI < 3; wI++) {
          const a = prev[wI], b = pts[wI], seg = 4;
          let q = a;
          for (let s = 1; s <= seg; s++) {
            const t = s / seg, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 1.3, a[2] + (b[2] - a[2]) * t];
            const up = [0, 0.18, 0], dn = [0, -0.18, 0];
            obj.quad([q[0] + dn[0], q[1] + dn[1] - 0.0, q[2]], [p[0], p[1] - 0.18, p[2]], [p[0], p[1] + 0.18, p[2]], [q[0] + up[0], q[1] + up[1], q[2]], wire, null);
            obj.quad([q[0], q[1] + 0.18, q[2]], [p[0], p[1] + 0.18, p[2]], [p[0], p[1] - 0.18, p[2]], [q[0], q[1] - 0.18, q[2]], wire, null);
            q = p;
          }
        }
      }
      prev = pts;
    }
  }

  // ------------------------------------------------------------------ materials
  const patch = (m) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 hz; varying vec3 vHz;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHz = hz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHz;').replace('#include <opaque_fragment>', 'outgoingLight += vHz;\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => (m.map ? 'horizon-map' : 'horizon');
    return m;
  };
  const terrainMat = patch(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, fog: false }));
  const objMat = patch(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  terrainMat.name = 'horizon-terrain'; objMat.name = 'horizon-objects';
  const tMesh = new THREE.Mesh(terrain.geometry(), terrainMat);
  const oMesh = new THREE.Mesh(obj.geometry(), objMat);
  for (const m of [tMesh, oMesh]) { m.userData.noAO = true; m.castShadow = m.receiveShadow = false; m.matrixAutoUpdate = false; m.name = 'horizon'; root.add(m); }
  tMesh.renderOrder = -3;

  // ------------------------------------------------------------------ birds
  const flocks = [
    { cx: -40, cz: -150, rr: 70, w: 0.05, y: 55, n: 14, ph: 0 },
    { cx: 90, cz: -60, rr: 90, w: -0.035, y: 38, n: 10, ph: 2 },
    { cx: -80, cz: 120, rr: 80, w: 0.04, y: 70, n: 12, ph: 4 },
  ];
  const nBirds = flocks.reduce((a, f) => a + f.n, 0);
  const bpos = new Float32Array(nBirds * 3);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const bmat = new THREE.PointsMaterial({ color: 0x1c1d20, size: lite ? 2.2 : 2.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75, depthWrite: false });
  const birds = new THREE.Points(bgeo, bmat);
  birds.frustumCulled = false; birds.userData.noAO = true; birds.name = 'horizon-birds';
  root.add(birds);
  const offs = flocks.map((f) => Array.from({ length: f.n }, () => [(rnd() - 0.5) * 22, (rnd() - 0.5) * 7, (rnd() - 0.5) * 22, rnd() * 6.28]));
  let time = 0;
  const setBirds = () => {
    let o = 0;
    flocks.forEach((f, fi) => {
      const a = f.ph + time * f.w, fx = f.cx + Math.cos(a) * f.rr, fz = f.cz + Math.sin(a) * f.rr, fy = FY + f.y + Math.sin(time * 0.07 + f.ph) * 6;
      for (const b of offs[fi]) {
        bpos[o++] = fx + b[0] + Math.sin(time * 0.6 + b[3]) * 2.5;
        bpos[o++] = fy + b[1] + Math.sin(time * 1.3 + b[3] * 2) * 0.9;
        bpos[o++] = fz + b[2] + Math.cos(time * 0.5 + b[3]) * 2.5;
      }
    });
    bgeo.attributes.position.needsUpdate = true;
  };
  setBirds();

  const total = Math.round(terrain.tris + obj.tris);
  console.info(`[horizon] ${total} tris (terrain ${terrain.tris}, objects ${obj.tris}), ${treeCount} trees, ${houseCount} houses, 3 draws`);

  return {
    tris: total,
    update(dt) {
      time += Math.min(dt, 0.1);
      setBirds();
    },
  };
}
