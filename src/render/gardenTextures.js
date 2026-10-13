import * as THREE from 'three';
import { GARDEN, PATIO, MEADOW_Z, BIRDBATH, STUMP, TREE, ARCH, BENCH, GTABLE, HEDGE, POTS, BACKDOOR } from '../sim/layout.js';

// Procedural textures for the house exterior and the tea garden (no external image assets).

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTexture(c, { srgb = true, wrap = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
export function makeNoise(seed) {
  const r = rng(seed);
  const P = 256, g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((y & (P - 1)) * P) + (x & (P - 1))];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(n, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2; }
  return s;
}

// Soft red stock brick in Flemish-ish stretcher bond. One tile = 0.9 m square (4 bricks x 12 courses).
export function brickTexture(size = 1024) {
  const [c, ctx] = canvas(size, size);
  const r = rng(77), n = makeNoise(78);
  const cols = 4, rows = 12, bw = size / cols, bh = size / rows, m = Math.max(2, size / 220);
  ctx.fillStyle = '#b7ab98';
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < rows; row++) {
    for (let col = -1; col <= cols; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      const h = 8 + r() * 14, s = 38 + r() * 18, l = 34 + r() * 14 - (r() < 0.08 ? 10 : 0);
      ctx.fillStyle = `hsl(${h},${s}%,${l}%)`;
      ctx.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
    }
  }
  // Grain, soot and lichen.
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const g = 0.86 + 0.22 * fbm(n, x / 9, y / 9, 3) + (r() - 0.5) * 0.08;
    const lich = Math.max(0, fbm(n, x / 60 + 40, y / 60, 3) - 0.62) * 1.6;
    img.data[i] = img.data[i] * g * (1 - lich * 0.3) + 90 * lich;
    img.data[i + 1] = img.data[i + 1] * g + 110 * lich;
    img.data[i + 2] = img.data[i + 2] * g + 70 * lich;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

// Clay roof tiles; one tile = 1 m square.
export function roofTexture(size = 512) {
  const [c, ctx] = canvas(size, size);
  const r = rng(91);
  const rows = 6, cols = 4, th = size / rows, tw = size / cols;
  ctx.fillStyle = '#3d2a22';
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < rows; row++) for (let col = -1; col <= cols; col++) {
    const x = col * tw + (row % 2 ? tw / 2 : 0), y = row * th;
    const l = 30 + r() * 12;
    const g = ctx.createLinearGradient(0, y, 0, y + th);
    g.addColorStop(0, `hsl(${12 + r() * 8},${35 + r() * 10}%,${l - 8}%)`);
    g.addColorStop(1, `hsl(${12 + r() * 8},${40 + r() * 10}%,${l + 4}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(x + 2, y + 1, tw - 4, th - 3);
  }
  return toTexture(c);
}

// Weathered sandstone flags; one tile = 1.2 m square.
export function flagTexture(size = 1024) {
  const [c, ctx] = canvas(size, size);
  const r = rng(13), n = makeNoise(14);
  ctx.fillStyle = '#8f8574';
  ctx.fillRect(0, 0, size, size);
  const unit = size / 6;
  const rowsH = [2, 1, 2, 1];
  let y = 0;
  for (const rh of rowsH) {
    let x = -r() * unit;
    while (x < size) {
      const w = unit * (1 + Math.floor(r() * 3));
      const l = 62 + r() * 12, h = 32 + r() * 14;
      ctx.fillStyle = `hsl(${h},${18 + r() * 12}%,${l}%)`;
      ctx.fillRect(x + 3, y + 3, w - 6, rh * unit - 6);
      x += w;
    }
    y += rh * unit;
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
    const i = (yy * size + xx) * 4;
    const g = 0.84 + 0.26 * fbm(n, xx / 22, yy / 22, 4);
    img.data[i] *= g; img.data[i + 1] *= g; img.data[i + 2] *= g * 0.97;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

// Fence boards / bench slats: silvered softwood. One tile = 1 m.
export function boardTexture(size = 512, tint = [150, 128, 100]) {
  const [c, ctx] = canvas(size, size);
  const n = makeNoise(55);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = fbm(n, x / 5, y / 90, 4);
    const g = 0.72 + 0.4 * grain + 0.06 * Math.sin(y / 3 + grain * 12);
    img.data[i] = tint[0] * g; img.data[i + 1] = tint[1] * g; img.data[i + 2] = tint[2] * g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

// Bark, wrapping round a trunk (u around, v up). One tile ~ 0.5 m.
export function barkTexture(size = 512) {
  const [c, ctx] = canvas(size, size);
  const n = makeNoise(61);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const f = fbm(n, x / 14, y / 70, 5);
    const ridge = Math.pow(Math.abs(Math.sin(x / size * Math.PI * 18 + f * 6)), 0.6);
    const g = 0.45 + 0.55 * ridge * (0.7 + 0.5 * f);
    img.data[i] = 96 * g; img.data[i + 1] = 82 * g; img.data[i + 2] = 66 * g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

// A small cluster of leaves on transparent ground, for leaf cards (alpha tested).
export function leafTexture(size = 256, hue = 100) {
  const [c, ctx] = canvas(size, size);
  const r = rng(hue * 7 + 3);
  ctx.clearRect(0, 0, size, size);
  for (let k = 0; k < 9; k++) {
    const x = size * (0.2 + r() * 0.6), y = size * (0.2 + r() * 0.6), a = r() * Math.PI * 2;
    const L = size * (0.17 + r() * 0.1), W = L * 0.42;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    const l = 26 + r() * 16;
    ctx.fillStyle = `hsl(${hue - 8 + r() * 22},${40 + r() * 20}%,${l}%)`;
    ctx.beginPath();
    ctx.moveTo(-L, 0);
    ctx.quadraticCurveTo(0, -W, L, 0);
    ctx.quadraticCurveTo(0, W, -L, 0);
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue},30%,${l + 18}%,0.6)`;
    ctx.lineWidth = size / 160;
    ctx.beginPath(); ctx.moveTo(-L * 0.9, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke();
    ctx.restore();
  }
  return toTexture(c, { wrap: false, aniso: 4 });
}

// ------------------------------------------------------------------ garden ground and grass mask
// Both are painted from the same layout so lawn, patio, stepping stones and beds agree.
const GW = GARDEN.maxX - GARDEN.minX, GD = GARDEN.maxZ - GARDEN.minZ;
export const STONES = (() => {
  // Stepping stones: patio -> under the arch -> bench, and a branch to the stump.
  const out = [];
  const path = [[0.35, -2.75], [0.35, -3.4], [0.35, -4.0], [0.1, -4.6], [-0.4, -5.0], [-0.95, -5.25]];
  for (let i = 0; i < path.length; i++) out.push([path[i][0], path[i][1], 0.17, 0.13, i * 0.7]);
  out.push([0.95, -4.25, 0.15, 0.12, 0.3], [1.55, -4.3, 0.16, 0.12, 1.2]);
  return out.filter(([, z]) => z < GTABLE.z - GTABLE.halfZ - 0.15 || z > GTABLE.z + GTABLE.halfZ);
})();

// Borders: soil beds along the side fences and in front of the hedge, planted with flowers.
export const BEDS = [
  { x0: GARDEN.minX, x1: GARDEN.minX + 0.55, z0: -5.95, z1: -2.5 },
  { x0: GARDEN.maxX - 0.55, x1: GARDEN.maxX, z0: -5.95, z1: -2.3 },
  { x0: GARDEN.minX, x1: GARDEN.maxX, z0: HEDGE.z1, z1: HEDGE.z1 + 0.42 },
];

function inBed(x, z) {
  for (const b of BEDS) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
  return null;
}

// What grows at (x, z): presence 0..1, height 0..1 (lawn -> meadow), bed/flower flag 0..1.
export function groundAt(x, z) {
  if (x < GARDEN.minX || x > GARDEN.maxX || z < GARDEN.minZ || z > GARDEN.maxZ) return [0, 0, 0];
  if (z > PATIO.minZ && x > PATIO.minX && x < PATIO.maxX) return [0, 0, 0];
  if (z < HEDGE.z1) return [0, 0, 0];
  for (const [sx, sz, a, b] of STONES) if (((x - sx) / a) ** 2 + ((z - sz) / b) ** 2 < 1) return [0, 0, 0];
  const clear = (cx, cz, r) => Math.hypot(x - cx, z - cz) < r;
  if (clear(BIRDBATH.x, BIRDBATH.z, BIRDBATH.stemR + 0.12)) return [0, 0, 0];
  if (clear(STUMP.x, STUMP.z, STUMP.r + 0.02)) return [0, 0, 0];
  if (clear(TREE.x, TREE.z, TREE.trunkR + 0.03)) return [0, 0, 0];
  for (const sx of [-1, 1]) if (clear(ARCH.x + sx * ARCH.halfW, ARCH.z, 0.06)) return [0, 0, 0];
  for (const [px, pz, pr] of POTS) if (clear(px, pz, pr)) return [0, 0, 0];
  const bed = inBed(x, z);
  if (bed) return [0.9, 0.85, 1];
  // Long meadow grass towards the back, a soft edge into the mown lawn; longer round the tree.
  let h = THREE.MathUtils.smoothstep(-z, -MEADOW_Z - 0.25, -MEADOW_Z + 0.35);
  h = Math.max(h, 0.8 * (1 - THREE.MathUtils.smoothstep(Math.hypot(x - TREE.x, z - TREE.z), 0.35, 0.9)));
  h = Math.max(h, 0.55 * (1 - THREE.MathUtils.smoothstep(Math.hypot(x - BIRDBATH.x, z - BIRDBATH.z), 0.3, 0.6)));
  // Fence lines grow a little long too.
  const edge = Math.min(x - GARDEN.minX, GARDEN.maxX - x);
  h = Math.max(h, 0.5 * (1 - THREE.MathUtils.smoothstep(edge, 0.6, 0.9)));
  // Thinner under the garden table and bench (shade), feet trodden near the patio.
  let p = 1;
  if (Math.abs(x - BENCH.x) < BENCH.halfX + 0.1 && Math.abs(z - BENCH.z) < BENCH.halfZ + 0.12) { p = 0.6; h *= 0.5; }
  if (z > PATIO.minZ - 0.12) p *= 0.7;
  return [p, h, 0];
}

// RGBA mask texture covering the garden rectangle (R presence, G height, B bed).
export function grassMask(res = 512) {
  const W = res, H = Math.round(res * GD / GW);
  const data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = GARDEN.minX + (i + 0.5) / W * GW, z = GARDEN.minZ + (j + 0.5) / H * GD;
    const [p, h, b] = groundAt(x, z);
    const k = (j * W + i) * 4;
    data[k] = p * 255; data[k + 1] = h * 255; data[k + 2] = b * 255; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { texture: t, rect: new THREE.Vector4(GARDEN.minX, GARDEN.minZ, GW, GD) };
}

// Colour of the ground under the grass: lawn soil-green with mown stripes, flags, stones, beds.
export function groundTexture(res = 2048) {
  const W = res, H = Math.round(res * GD / GW);
  const [c, ctx] = canvas(W, H);
  const n = makeNoise(101), r = rng(102);
  const img = ctx.createImageData(W, H);
  const px = GW / W;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = GARDEN.minX + (i + 0.5) * px, z = GARDEN.minZ + (j + 0.5) / H * GD;
    const k = (j * W + i) * 4;
    const f = fbm(n, x * 9, z * 9, 4), f2 = fbm(n, x * 60 + 9, z * 60, 2);
    let col;
    if (z > PATIO.minZ && x > PATIO.minX && x < PATIO.maxX) {
      col = [84, 78, 68, 255]; // under the patio mesh
    } else if (inBed(x, z)) {
      const g = 0.7 + 0.5 * f;
      col = [74 * g, 56 * g, 40 * g, 255];
    } else {
      let stone = null;
      for (const s of STONES) if (((x - s[0]) / s[2]) ** 2 + ((z - s[1]) / s[3]) ** 2 < 1) { stone = s; break; }
      if (stone) {
        const g = 0.78 + 0.3 * f2 + 0.1 * f;
        col = [168 * g, 158 * g, 140 * g, 255];
      } else {
        const stripe = Math.floor((x - GARDEN.minX) / 0.45) % 2 ? 1.06 : 0.95;
        const meadow = THREE.MathUtils.smoothstep(-z, -MEADOW_Z - 0.25, -MEADOW_Z + 0.35);
        const g = (0.75 + 0.45 * f) * (meadow > 0.5 ? 1 : stripe) * (0.92 + 0.16 * f2);
        col = [52 * g + meadow * 14, 78 * g + meadow * 6, 32 * g, 255];
      }
    }
    data4(img.data, k, col);
  }
  ctx.putImageData(img, 0, 0);
  // Dark soft edges round stones.
  ctx.globalCompositeOperation = 'source-atop';
  for (const [sx, sz, a, b] of STONES) {
    const cx = (sx - GARDEN.minX) / GW * W, cy = (sz - GARDEN.minZ) / GD * H;
    ctx.strokeStyle = 'rgba(30,26,20,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, a / px, b / px * (H / GD) / (W / GW), 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  void r; void BACKDOOR;
  return toTexture(c, { wrap: false });
}
function data4(d, k, col) { d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = col[3]; }
