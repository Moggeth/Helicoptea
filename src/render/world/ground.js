import * as THREE from 'three';
import { makeNoise, fbm } from '../gardenTextures.js';
import { FY, PARK, MAIN, STREAM, POND, groundHeight, shadowOffset } from '../../sim/world/plan.js';
import { ROOM, WALL_T, GARDEN } from '../../sim/layout.js';

// The ground of the neighbourhood: one big painted map (colour, and what the surface is made of) under
// tiling detail, with soft sun shadows painted in under the big things. The tea garden and the house keep
// their own floors; this covers everything else, out to where the far hills take over.
//
// Areas paint it through ctx.ground (a GroundPainter) while they build:
//   ground.rect(x0, z0, x1, z1, opts)   ground.circle(x, z, r, opts)   ground.poly([[x, z], ...], opts)
//   ground.path([[x, z], ...], width, opts)
//     opts: { type: 'grass' | 'meadow' | 'gravel' | 'tarmac' | 'paving' | 'soil' | 'dirt', color: '#rrggbb'
//             (default per type), alpha: 0..1, lines: spacing in m for paving joints }
//   ground.shadowRect(x0, z0, x1, z1, height, strength = 0.45)   a block's shadow (its footprint swept along
//   ground.shadowCircle(x, z, r, height, strength = 0.35)        the sun to height h): houses, sheds, walls
//                                                                and tree canopies (height = canopy centre)
export const MAP = { x0: -26, x1: 26, z0: -54, z1: 38 };

const TYPE_COLOR = {
  grass: '#6f8a40', meadow: '#7f8a48', gravel: '#a39883', tarmac: '#4b4c4f', paving: '#a8a296', soil: '#56412f', dirt: '#7a664d',
};
// Surface classes in the type map: R grass, G gravel, B hard (tarmac, paving); black is soil.
const TYPE_RGB = {
  grass: 'rgb(255,0,0)', meadow: 'rgb(255,0,0)', gravel: 'rgb(0,255,0)', tarmac: 'rgb(0,0,255)', paving: 'rgb(0,0,255)', soil: 'rgb(0,0,0)', dirt: 'rgb(60,140,0)',
};

export class GroundPainter {
  constructor(quality) {
    this.ppm = quality.lite ? 8 : quality.name === 'low' ? 8 : 14;   // pixels per metre
    this.ops = [];
    this.shadows = [];
  }
  rect(x0, z0, x1, z1, o = {}) { this.ops.push({ k: 'poly', pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], o }); }
  circle(x, z, r, o = {}) { this.ops.push({ k: 'circle', x, z, r, o }); }
  poly(pts, o = {}) { this.ops.push({ k: 'poly', pts, o }); }
  path(pts, width, o = {}) { this.ops.push({ k: 'path', pts, width, o }); }
  shadowRect(x0, z0, x1, z1, h, strength = 0.45) { this.shadows.push({ k: 'rect', x0, z0, x1, z1, h, s: strength }); }
  shadowCircle(x, z, r, h, strength = 0.35) { this.shadows.push({ k: 'circle', x, z, r, h, s: strength }); }
}

function shape(ctx, op, X, Z) {
  ctx.beginPath();
  if (op.k === 'circle') ctx.arc(X(op.x), Z(op.z), op.r * (X(1) - X(0)), 0, Math.PI * 2);
  else {
    const p = op.pts;
    ctx.moveTo(X(p[0][0]), Z(p[0][1]));
    for (let i = 1; i < p.length; i++) ctx.lineTo(X(p[i][0]), Z(p[i][1]));
    if (op.k !== 'path') ctx.closePath();
  }
}

function paint(g) {
  const W = Math.round((MAP.x1 - MAP.x0) * g.ppm), H = Math.round((MAP.z1 - MAP.z0) * g.ppm);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const [cc, col] = mk(W, H), [tc, typ] = mk(W, H);
  const X = (x) => (x - MAP.x0) * g.ppm, Z = (z) => (z - MAP.z0) * g.ppm;
  // Base: rough grass everywhere, mottled at a few metres' scale.
  col.fillStyle = TYPE_COLOR.meadow; col.fillRect(0, 0, W, H);
  typ.fillStyle = TYPE_RGB.grass; typ.fillRect(0, 0, W, H);
  {
    const n = makeNoise(707), s = 2, w = Math.ceil(W / g.ppm * s), h = Math.ceil(H / g.ppm * s);
    const [nc, nx] = mk(w, h), img = nx.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = fbm(n, i / s * 0.35, j / s * 0.35, 4), k = (j * w + i) * 4;
      img.data[k] = 150 + 105 * v; img.data[k + 1] = 165 + 90 * v; img.data[k + 2] = 120 + 100 * v; img.data[k + 3] = 80;
    }
    nx.putImageData(img, 0, 0);
    col.imageSmoothingEnabled = true;
    col.globalCompositeOperation = 'multiply';
    col.drawImage(nc, 0, 0, W, H);
    col.globalCompositeOperation = 'source-over';
  }
  for (const op of g.ops) {
    const o = op.o, type = o.type || 'grass';
    col.globalAlpha = typ.globalAlpha = o.alpha ?? 1;
    col.fillStyle = col.strokeStyle = o.color || TYPE_COLOR[type] || TYPE_COLOR.grass;
    typ.fillStyle = typ.strokeStyle = TYPE_RGB[type] || TYPE_RGB.grass;
    for (const ctx of [col, typ]) {
      shape(ctx, op, X, Z);
      if (op.k === 'path') { ctx.lineWidth = op.width * g.ppm; ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(); } else ctx.fill();
    }
    // Paving joints.
    if (o.lines && op.k === 'poly') {
      col.save(); shape(col, op, X, Z); col.clip();
      col.globalAlpha = 0.28; col.strokeStyle = '#3a3630'; col.lineWidth = Math.max(1, g.ppm * 0.012);
      const xs = op.pts.map((p) => p[0]), zs = op.pts.map((p) => p[1]);
      const a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...zs), d = Math.max(...zs);
      col.beginPath();
      for (let x = Math.ceil(a / o.lines) * o.lines; x < b; x += o.lines) { col.moveTo(X(x), Z(c)); col.lineTo(X(x), Z(d)); }
      for (let z = Math.ceil(c / o.lines) * o.lines; z < d; z += o.lines) { col.moveTo(X(a), Z(z)); col.lineTo(X(b), Z(z)); }
      col.stroke(); col.restore();
    }
  }
  col.globalAlpha = typ.globalAlpha = 1;
  // Sun shadows, drawn small and scaled up so their edges are soft (penumbra ~ half a metre).
  if (g.shadows.length) {
    const sp = 2.5, sw = Math.ceil(W / g.ppm * sp), sh = Math.ceil(H / g.ppm * sp);
    const [scv, s] = mk(sw, sh);
    s.fillStyle = '#fff'; s.fillRect(0, 0, sw, sh);
    const SX = (x) => (x - MAP.x0) * sp, SZ = (z) => (z - MAP.z0) * sp;
    for (const o of g.shadows) {
      const [dx, dz] = shadowOffset(o.h);
      const v = Math.round(255 * (1 - o.s));
      s.fillStyle = `rgb(${v},${v},${v})`;
      s.globalCompositeOperation = 'darken';
      s.beginPath();
      if (o.k === 'rect') {
        // Footprint swept along the shadow direction: the convex hull of the base and its offset copy.
        const c = [[o.x0, o.z0], [o.x1, o.z0], [o.x1, o.z1], [o.x0, o.z1]];
        const pts = [...c, ...c.map(([x, z]) => [x + dx, z + dz])];
        const hull = convexHull(pts);
        s.moveTo(SX(hull[0][0]), SZ(hull[0][1]));
        for (const [x, z] of hull.slice(1)) s.lineTo(SX(x), SZ(z));
        s.closePath();
      } else {
        s.ellipse(SX(o.x + dx), SZ(o.z + dz), o.r * sp, o.r * sp * 1.05, 0, 0, Math.PI * 2);
      }
      s.fill();
    }
    s.globalCompositeOperation = 'source-over';
    // Blur by halving twice and drawing back up.
    const [b1, b1x] = mk(Math.ceil(sw / 2), Math.ceil(sh / 2));
    b1x.drawImage(scv, 0, 0, b1.width, b1.height);
    col.globalCompositeOperation = 'multiply';
    col.imageSmoothingEnabled = true;
    col.drawImage(b1, 0, 0, W, H);
    col.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(cc);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 8;
  const types = new THREE.CanvasTexture(tc);
  types.flipY = false; types.generateMipmaps = true; types.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, types, W, H, mask: grassMask(g) };
}

// Where grass grows on the neighbourhood's lawns, for the grass blades (src/render/grass.js): R presence,
// G length (lawn short, meadow long), B wild flowers, A the ground's height above FY (0..HS m).
const HS = 4;
function grassMask(g) {
  const ppm = g.ppm >= 14 ? 5 : 3;
  const W = Math.round((MAP.x1 - MAP.x0) * ppm), H = Math.round((MAP.z1 - MAP.z0) * ppm);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const X = (x) => (x - MAP.x0) * ppm, Z = (z) => (z - MAP.z0) * ppm;
  const LEN = { grass: 'rgb(255,70,0)', meadow: 'rgb(255,215,40)' };
  ctx.fillStyle = LEN.meadow; ctx.fillRect(0, 0, W, H);
  for (const op of g.ops) {
    const type = op.o.type || 'grass';
    ctx.globalAlpha = op.o.alpha ?? 1;
    ctx.fillStyle = ctx.strokeStyle = LEN[type] || 'rgb(0,0,0)';
    shape(ctx, op, X, Z);
    if (op.k === 'path') { ctx.lineWidth = op.width * ppm; ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(); } else ctx.fill();
  }
  ctx.globalAlpha = 1;
  // None in the tea garden, the kitchen and the house (they have their own floors and grass).
  ctx.fillStyle = '#000';
  const hole = (x0, z0, x1, z1) => ctx.fillRect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm);
  hole(GARDEN.minX, GARDEN.minZ, GARDEN.maxX, ROOM.minZ - WALL_T);
  hole(ROOM.minX - WALL_T, ROOM.minZ - WALL_T, ROOM.maxX + WALL_T, ROOM.maxZ);
  hole(MAIN.outer.x0, MAIN.outer.z0, MAIN.outer.x1, MAIN.outer.z1 + 0.7);
  const src = ctx.getImageData(0, 0, W, H).data, d = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4, x = MAP.x0 + (i + 0.5) / ppm, z = MAP.z0 + (j + 0.5) / ppm;
    const h = groundHeight(x, z);
    const wet = h < Math.max(STREAM.water, POND.water) + 0.04 && z < PARK.z1;
    d[k] = wet ? 0 : src[k]; d[k + 1] = src[k + 1]; d[k + 2] = src[k + 2];
    d[k + 3] = Math.round(255 * Math.min(1, Math.max(0, (h - FY) / HS)));
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { texture: t, rect: new THREE.Vector4(MAP.x0, MAP.z0, MAP.x1 - MAP.x0, MAP.z1 - MAP.z0), heightScale: HS };
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Tiling surface detail, one kind per channel: R grass, G gravel, B tarmac and paving, A soil. Grey values
// around 0.5; the ground shader brightens and darkens the painted colour with them.
let detailTex = null;
function detailTexture() {
  if (detailTex) return detailTex;
  const S = 256, d = new Uint8Array(S * S * 4);
  const n1 = makeNoise(31), n2 = makeNoise(32), n3 = makeNoise(33);
  let seed = 9;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const wrap = (f, x, y, p) => { // tileable fbm by blending four offsets
    const u = x / S, v = y / S;
    return f(x, y) * (1 - u) * (1 - v) + f(x - S, y) * u * (1 - v) + f(x, y - S) * (1 - u) * v + f(x - S, y - S) * u * v + 0 * p;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = (y * S + x) * 4;
    const g = wrap((a, b) => fbm(n1, a / 9, b / 9, 4), x, y);
    const streak = wrap((a, b) => fbm(n2, a / 2.2, b / 30, 2), x, y);
    d[k] = 255 * Math.min(1, Math.max(0, 0.15 + 0.55 * g + 0.45 * streak));
    const grit = wrap((a, b) => fbm(n3, a / 1.6, b / 1.6, 2), x, y);
    d[k + 1] = 255 * Math.min(1, Math.max(0, 0.1 + 0.9 * grit));
    const t = wrap((a, b) => fbm(n2, a / 3, b / 3, 3), x, y);
    d[k + 2] = 255 * Math.min(1, Math.max(0, 0.32 + 0.4 * t));
    const s = wrap((a, b) => fbm(n1, a / 5 + 40, b / 5, 4), x, y);
    d[k + 3] = 255 * Math.min(1, Math.max(0, 0.1 + 0.8 * s));
  }
  // Pebbles in the gravel, aggregate in the tarmac.
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(r() * S), y = Math.floor(r() * S), v = r();
    const k = (y * S + x) * 4;
    d[k + 1] = v < 0.5 ? 40 + v * 120 : 210 + v * 45;
    if (i < 1500) d[(((Math.floor(r() * S)) * S + Math.floor(r() * S)) * 4) + 2] = r() < 0.5 ? 70 : 185;
  }
  detailTex = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.magFilter = THREE.LinearFilter; detailTex.minFilter = THREE.LinearMipmapLinearFilter;
  detailTex.generateMipmaps = true; detailTex.anisotropy = 8;
  detailTex.needsUpdate = true;
  return detailTex;
}

export function groundMaterial(g) {
  const { tex, types, mask } = paint(g);
  const size = new THREE.Vector2(MAP.x1 - MAP.x0, MAP.z1 - MAP.z0);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  mat.name = 'world-ground';
  const u = { uTypes: { value: types }, uDetail: { value: detailTexture() }, uSize: { value: size } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uTypes; uniform sampler2D uDetail; uniform vec2 uSize;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 gw = texture2D(uTypes, vMapUv).rgb;
          vec4 wv = vec4(gw, max(0.0, 1.0 - gw.r - gw.g - gw.b));
          vec2 wuv = vMapUv * uSize;
          vec4 dt = texture2D(uDetail, wuv / 1.7) * 0.55 + texture2D(uDetail, wuv / 0.41 + 0.37) * 0.45;
          float lum = dot(wv, dt) / max(dot(wv, vec4(1.0)), 1e-3);
          diffuseColor.rgb *= 0.6 + 0.8 * lum;
        }`);
  };
  mat.customProgramCacheKey = () => 'world-ground';
  mat.userData.u = u;
  mat.userData.grassMask = mask;
  return mat;
}

// Flat rectangles round the house and garden (which have their own floors), and the park's rolling terrain.
export function buildGround(g, quality) {
  const mat = groundMaterial(g);
  const W = MAP.x1 - MAP.x0, H = MAP.z1 - MAP.z0;
  const pos = [], uv = [], idx = [];
  const vert = (x, y, z) => { pos.push(x, y, z); uv.push((x - MAP.x0) / W, (z - MAP.z0) / H); return pos.length / 3 - 1; };
  const quad = (x0, z0, x1, z1) => {
    if (x1 <= x0 || z1 <= z0) return;
    const a = vert(x0, FY, z0), b = vert(x1, FY, z0), c = vert(x1, FY, z1), d = vert(x0, FY, z1);
    idx.push(a, d, c, a, c, b);
  };
  // Holes: the tea garden, the kitchen and the main house.
  const Gz0 = GARDEN.minZ, Gz1 = ROOM.minZ - WALL_T, Kz1 = ROOM.maxZ, O = MAIN.outer;
  const zf0 = PARK.z1;
  quad(MAP.x0, zf0, MAP.x1, Gz0);
  quad(MAP.x0, Gz0, GARDEN.minX, Gz1); quad(GARDEN.maxX, Gz0, MAP.x1, Gz1);
  quad(MAP.x0, Gz1, ROOM.minX - WALL_T, Kz1); quad(ROOM.maxX + WALL_T, Gz1, MAP.x1, Kz1);
  quad(MAP.x0, Kz1, O.x0, O.z1); quad(O.x1, Kz1, MAP.x1, O.z1);
  quad(MAP.x0, O.z1, MAP.x1, MAP.z1);
  // Terrain grid over the park.
  const step = quality.lite ? 1 : 0.5;
  const nx = Math.round(W / step), nz = Math.round((zf0 - MAP.z0) / step);
  const base = pos.length / 3;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = MAP.x0 + i * step, z = MAP.z0 + j * step;
    vert(x, groundHeight(x, z), z);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1;
    idx.push(a, d, c, a, c, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'world-ground';
  mesh.receiveShadow = quality.shadows > 0;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.noAO = true;
  mesh.renderOrder = 9; // after what stands on it (fewer pixels shaded twice)
  return mesh;
}
