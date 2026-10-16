import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROOM } from '../../sim/layout.js';
import { PB, ITEMS, LOOSE } from '../../sim/extras/pottingBench.js';
import { Batcher, T, boxUV } from '../batch.js';
import { vesselGeometry } from '../models.js';
import { makeNoise, fbm } from '../gardenTextures.js';
import { registerExtraSound } from '../../audio/extras.js';

// The potting bench by the left fence (see src/sim/extras/pottingBench.js): weathered slatted bench with a
// lower shelf and a back board, terracotta pots (stacked, upturned, one with a tomato seedling), a wooden
// seed tray of seedlings, a hand trowel and fork with ash handles, a ball of jute twine, a pair of gloves
// and a galvanised bucket. Statics merge into four draw calls; the two loose pots are one InstancedMesh.

const fy = ROOM.floorY;

export function canvasTex(size, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Per-pixel painter: fn(u, v) -> [r, g, b] (0..255).
function paint(size, fn) {
  return canvasTex(size, (c, S) => {
    const img = c.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [r, g, b] = fn(x / S, y / S), i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

// Silvered, weathered softwood: grey with brown in the grain, darker checks and a little lichen.
function weatheredWood(size) {
  const n = makeNoise(17), m = makeNoise(29);
  return paint(size, (u, v) => {
    const grain = fbm(n, u * size / 7, v * size / 120, 4);
    const ring = 0.5 + 0.5 * Math.sin(u * size / 3.2 + grain * 10);
    let g = 0.72 + 0.28 * grain + 0.08 * ring;
    const check = fbm(m, u * 60, v * 4, 3);
    if (check > 0.74) g *= 0.9;
    const r = 138 * g, gg = 128 * g, b = 114 * g;
    const lichen = Math.max(0, fbm(m, u * 9 + 3, v * 9, 4) - 0.62) * 3;
    return [r * (1 - lichen * 0.25) + 150 * lichen * 0.25, gg * (1 - lichen * 0.2) + 160 * lichen * 0.2, b * (1 - lichen * 0.3) + 90 * lichen * 0.3];
  });
}

// Unglazed terracotta: warm orange-brown, mottled, a white salt bloom and green algae low on the wall.
export function terracottaTex(size) {
  const n = makeNoise(41), m = makeNoise(43);
  return paint(size, (u, v) => {
    const f = fbm(n, u * 22, v * 22, 4);
    let r = 168 + 40 * (f - 0.5), g = 96 + 24 * (f - 0.5), b = 70 + 18 * (f - 0.5);
    const hv = 1 - v; // canvas y down -> lathe v up
    const bloom = Math.max(0, fbm(m, u * 14, hv * 10, 4) - 0.5) * 2.2 * THREE.MathUtils.smoothstep(hv, 0.08, 0.3) * (1 - THREE.MathUtils.smoothstep(hv, 0.5, 0.62));
    r += (226 - r) * bloom * 0.6; g += (214 - g) * bloom * 0.6; b += (196 - b) * bloom * 0.6;
    const algae = (1 - THREE.MathUtils.smoothstep(hv, 0.06, 0.22)) * Math.max(0, fbm(m, u * 20 + 5, hv * 20, 3) - 0.35);
    r -= 70 * algae; g -= 20 * algae; b -= 30 * algae;
    const speck = fbm(n, u * 200, v * 200, 2) > 0.74 ? 0.85 : 1;
    return [r * speck, g * speck, b * speck];
  });
}

// Galvanised zinc: grey spangle (crystal patches of slightly different brightness).
function spangleTex(size) {
  const n = makeNoise(53);
  const cells = [];
  for (let i = 0; i < 90; i++) cells.push([Math.random(), Math.random(), 0.82 + Math.random() * 0.3]);
  return paint(size, (u, v) => {
    let best = 9, val = 1;
    for (const [cx, cy, s] of cells) {
      let dx = Math.abs(u - cx), dy = Math.abs(v - cy);
      dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; val = s; }
    }
    const g = 175 * val * (0.92 + 0.12 * fbm(n, u * 40, v * 40, 3));
    return [g, g * 1.01, g * 1.03];
  });
}

// A fine, neutral grain for the soft things (soil, twine, gloves, leaves, handles): vertex colours carry the hue.
function grainTex(size) {
  const n = makeNoise(61);
  return paint(size, (u, v) => { const g = 200 + 55 * fbm(n, u * 64, v * 64, 3); return [g, g, g]; });
}

// Terracotta pot with a collar, as a lathe (open top, real wall thickness).
export function potGeometry(rb, rt, h, seg = 28) {
  const col = Math.max(0.004, rt * 0.09), th = Math.max(0.0045, rt * 0.1), ch = h * 0.2;
  const wallTop = rt - col;
  const p = [];
  const V = (r, y) => p.push(new THREE.Vector2(Math.max(0.0001, r), y));
  V(0, 0.001); V(rb * 0.6, 0.001); V(rb - 0.003, 0); V(rb, 0.004);
  for (let i = 1; i <= 6; i++) { const t = i / 6; V(rb + (wallTop - rb) * t, 0.004 + (h - ch - 0.004) * t); }
  V(rt - 0.0005, h - ch + 0.002); V(rt, h - ch + 0.006); V(rt, h - 0.003); V(rt - 0.002, h);
  V(rt - th + 0.001, h); V(rt - th, h - 0.003);
  for (let i = 1; i <= 4; i++) { const t = i / 4; V(rt - th + (rb - th - (rt - th)) * t, h - 0.003 - (h - 0.003 - th) * t); }
  V((rb - th) * 0.5, th); V(0, th);
  return new THREE.LatheGeometry(p, seg);
}

// Box helper with metre UVs at a position, yaw and tilt.
const bx = (w, h, d) => boxUV(w, h, d, 1);

export function build(ctx) {
  const { scene, lite, hi } = ctx;
  const b = new Batcher();
  const texS = lite ? 256 : 512;
  const rnd = (() => { let s = 1234; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const shade = (base, lo = 0.85, hi2 = 1.08) => new THREE.Color(base).multiplyScalar(lo + (hi2 - lo) * rnd());

  const woodTex = weatheredWood(texS);
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.92 });
  const clay = new THREE.MeshStandardMaterial({ map: terracottaTex(256), roughness: 0.88 });
  const zinc = new THREE.MeshStandardMaterial({ map: spangleTex(256), metalness: 0.85, roughness: 0.42, side: THREE.DoubleSide });
  const soft = new THREE.MeshStandardMaterial({ map: grainTex(128), roughness: 0.85, side: THREE.DoubleSide });

  // ---------------------------------------------------------------- bench frame
  const cz = (PB.z0 + PB.z1) / 2, len = PB.z1 - PB.z0, depth = PB.x1 - PB.x0, cx = (PB.x0 + PB.x1) / 2;
  const L = PB.leg;
  const WOOD = 0xf0ece6;
  for (const lx of [PB.x0 + L / 2, PB.x1 - L / 2]) for (const lz of [PB.z0 + L / 2, PB.z1 - L / 2]) {
    const top = lx < cx ? PB.back : PB.top - PB.slatT;
    b.add(bx(L, top - fy, L), wood, T(lx, (top + fy) / 2, lz, rnd() * 0.01), shade(WOOD, 0.8, 0.95));
  }
  // Top: five slats with gaps, running along z, slightly cupped and uneven.
  const ns = 5, gap = 0.007, sw = (depth + PB.overhang - gap * (ns - 1)) / ns;
  for (let i = 0; i < ns; i++) {
    const x = PB.x0 + sw / 2 + i * (sw + gap);
    b.add(bx(sw, PB.slatT, len + 0.02), wood, T(x, PB.top - PB.slatT / 2 - rnd() * 0.0015, cz, 0, 0, (rnd() - 0.5) * 0.012), shade(WOOD, 0.9, 1.08));
  }
  // Aprons under the top: front, back and the two ends.
  b.add(bx(0.02, 0.085, len - 2 * L), wood, T(PB.x1 - 0.012, PB.top - PB.slatT - 0.0425, cz), shade(WOOD, 0.8, 0.95));
  b.add(bx(0.02, 0.085, len - 2 * L), wood, T(PB.x0 + L / 2, PB.top - PB.slatT - 0.0425, cz), shade(WOOD, 0.75, 0.9));
  for (const z of [PB.z0 + L / 2, PB.z1 - L / 2]) b.add(bx(depth - 2 * L, 0.085, 0.02), wood, T(cx, PB.top - PB.slatT - 0.0425, z), shade(WOOD, 0.8, 0.95));
  // Lower shelf: rails at the ends and four slats.
  for (const z of [PB.z0 + L / 2, PB.z1 - L / 2]) b.add(bx(depth - 2 * L + 0.01, 0.05, 0.022), wood, T(cx, PB.shelf - 0.04, z), shade(WOOD, 0.75, 0.9));
  const nl = 4, lgap = 0.012, lw = (depth - lgap * (nl - 1)) / nl;
  for (let i = 0; i < nl; i++) b.add(bx(lw, 0.018, len - 0.004), wood, T(PB.x0 + lw / 2 + i * (lw + lgap), PB.shelf - 0.009, cz, 0, 0, (rnd() - 0.5) * 0.01), shade(WOOD, 0.85, 1.05));
  // Back board (two boards) between the back legs, with a capping strip.
  const bh = (PB.back - PB.top) / 2;
  for (let i = 0; i < 2; i++) b.add(bx(0.016, bh - 0.004, len - 2 * L + 0.004), wood, T(PB.x0 + L / 2 + 0.005, PB.top + bh * (i + 0.5), cz), shade(WOOD, 0.82, 1.0));
  b.add(bx(0.06, 0.018, len + 0.01), wood, T(PB.x0 + 0.025, PB.back + 0.009, cz), shade(WOOD, 0.9, 1.05));
  // A diagonal brace on each end, between the shelf and the top.
  for (const z of [PB.z0 + 0.012, PB.z1 - 0.012]) {
    const h = PB.top - PB.slatT - 0.085 - PB.shelf, w = depth - 2 * L, dl = Math.hypot(h, w);
    b.add(bx(dl, 0.045, 0.016), wood, T(cx, PB.shelf + h / 2, z + (z < cz ? -0.012 : 0.012), 0, 0, Math.atan2(h, w)), shade(WOOD, 0.8, 0.95));
  }
  // Coach-bolt heads on the legs.
  for (const lx of [PB.x0 + L / 2, PB.x1 - L / 2]) for (const z of [PB.z0 - 0.002, PB.z1 + 0.002]) for (const y of [PB.top - 0.06, PB.shelf - 0.04]) {
    b.add(new THREE.SphereGeometry(0.007, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), zinc, T(lx, y, z, 0, z < cz ? -Math.PI / 2 : Math.PI / 2), 0x6a625a);
  }

  // ---------------------------------------------------------------- terracotta pots
  const I = ITEMS, t = PB.top;
  const pot = (P, x, y, z, tint = 0xffffff, rx = 0, rz = 0, ry = rnd() * 6) => b.add(potGeometry(P.rb, P.rt, P.h), clay, T(x, y, z, ry, rx, rz), shade(tint, 0.88, 1.05));
  for (let i = 0; i < I.stack.n; i++) pot(I.stack, I.stack.x + (rnd() - 0.5) * 0.004, t + i * I.stack.step, I.stack.z, 0xffffff, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04);
  for (let i = 0; i < I.shelfStack.n; i++) pot(I.shelfStack, I.shelfStack.x + (rnd() - 0.5) * 0.004, PB.shelf + i * I.shelfStack.step, I.shelfStack.z, 0xf0e4dc, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04);
  // Upturned pot (rim down).
  pot(I.upturned, I.upturned.x, PB.shelf + I.upturned.h, I.upturned.z, 0xe8dcd4, Math.PI);
  // Pot with a tomato seedling: soil, stem, leaves, a plant label.
  const SP = I.seedPot;
  pot(SP, SP.x, t, SP.z);
  const SOIL = 0x3a2a1f;
  const soilDisc = (r, x, y, z, seed) => {
    const g = new THREE.CircleGeometry(r, 18, 0, Math.PI * 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i); p.setZ(i, 0.003 * Math.sin(px * 300 + seed) * Math.sin(py * 260 + seed * 2)); }
    g.computeVertexNormals();
    b.add(g, soft, T(x, y, z, 0, -Math.PI / 2), SOIL);
  };
  soilDisc(SP.rt - 0.006, SP.x, t + SP.h - 0.012, SP.z, 1);
  const GREEN = 0x4f7a34;
  const leaf = (x, y, z, ry, rx, l, w, c = GREEN) => b.add(new THREE.SphereGeometry(1, 8, 5), soft, T(x, y, z, ry, rx, 0, w, 0.12 * w, l).multiply(new THREE.Matrix4().makeTranslation(0, 0, 1)), shade(c, 0.85, 1.1));
  {
    const sy = t + SP.h - 0.012, top = sy + 0.11;
    const stem = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(SP.x, sy, SP.z), new THREE.Vector3(SP.x + 0.005, sy + 0.06, SP.z), new THREE.Vector3(SP.x + 0.012, top, SP.z - 0.006)), 8, 0.0022, 5, false);
    b.add(stem, soft, null, 0x5d8a3c);
    for (let k = 0; k < 7; k++) {
      const h = 0.025 + k * 0.012, a = k * 2.4;
      const x = SP.x + 0.012 * h / 0.11, y = sy + h, z = SP.z - 0.006 * h / 0.11;
      const l = 0.016 + 0.012 * Math.sin(Math.PI * Math.min(1, (k + 1) / 7));
      leaf(x, y, z, a, 0.15 - k * 0.08, l, l * 0.7, 0x55803a);
      leaf(x, y + 0.003, z, a + 0.5, 0.25 - k * 0.06, l * 0.6, l * 0.45, 0x5a8a3c);
      leaf(x, y + 0.003, z, a - 0.5, 0.25 - k * 0.06, l * 0.6, l * 0.45, 0x5a8a3c);
    }
    // Plant label (white plastic, pencil writing is too small to read anyway).
    b.add(bx(0.012, 0.075, 0.0015), soft, T(SP.x - 0.025, sy + 0.025, SP.z + 0.02, 0.6, 0.12), 0xf2efe8);
  }

  // ---------------------------------------------------------------- seed tray of seedlings
  {
    const S = I.tray, wt = 0.009, h = S.h;
    for (const sx of [-1, 1]) b.add(bx(wt, h, S.hz * 2), wood, T(S.x + sx * (S.hx - wt / 2), t + h / 2, S.z), shade(0xfff2e0, 0.95, 1.1));
    for (const sz of [-1, 1]) b.add(bx(S.hx * 2 - 2 * wt, h, wt), wood, T(S.x, t + h / 2, S.z + sz * (S.hz - wt / 2)), shade(0xfff2e0, 0.95, 1.1));
    b.add(bx(S.hx * 2 - 2 * wt, 0.006, S.hz * 2 - 2 * wt), wood, T(S.x, t + 0.003, S.z), 0xd8c8b0);
    // Soil surface, a little lumpy, below the rim.
    const g = new THREE.PlaneGeometry(S.hx * 2 - 2 * wt, S.hz * 2 - 2 * wt, 12, 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.0025 * Math.sin(p.getX(i) * 210) * Math.sin(p.getY(i) * 170 + 1) + 0.0015 * Math.sin(p.getY(i) * 520));
    g.computeVertexNormals();
    b.add(g, soft, T(S.x, t + h - 0.012, S.z, 0, -Math.PI / 2), SOIL);
    // Seedlings in rows: a hooked stem and two seed leaves each, the odd one with its first true leaves.
    const rows = 4, cols = lite ? 5 : 7;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() < 0.08) continue;
      const x = S.x - S.hx + wt + (r + 0.5) * (2 * S.hx - 2 * wt) / rows + (rnd() - 0.5) * 0.008;
      const z = S.z - S.hz + wt + (c + 0.5) * (2 * S.hz - 2 * wt) / cols + (rnd() - 0.5) * 0.008;
      const y0 = t + h - 0.012, ht = 0.018 + rnd() * 0.022, lean = (rnd() - 0.5) * 0.008;
      b.add(new THREE.CylinderGeometry(0.0009, 0.0012, ht, 4), soft, T(x + lean / 2, y0 + ht / 2, z, 0, 0, -lean / ht * 0.9), 0x8fae5a);
      const a = rnd() * Math.PI;
      const l = 0.007 + rnd() * 0.004;
      for (const s of [0, Math.PI]) leaf(x + lean, y0 + ht, z, a + s, -0.3 - rnd() * 0.3, l, l * 0.55, 0x6f9a3c);
      if (rnd() < 0.3) leaf(x + lean, y0 + ht + 0.003, z, a + Math.PI / 2, -0.9, l * 1.2, l * 0.5, 0x4e7a30);
    }
    // White plastic label at the end of a row.
    b.add(bx(0.011, 0.065, 0.0015), soft, T(S.x - S.hx + 0.025, t + h + 0.005, S.z + S.hz - 0.02, 0.2, -0.15), 0xf4f1ea);
  }

  // ---------------------------------------------------------------- tools: trowel on the top, fork on a nail
  const ASH = 0xd8c09a, STEEL = 0x9c9a96;
  const handle = (lenH, r) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12;
      const rr = r * (0.82 + 0.28 * Math.sin(Math.PI * Math.min(1, s * 1.15)) + (s > 0.92 ? -0.25 * (s - 0.92) / 0.08 : 0));
      pts.push(new THREE.Vector2(Math.max(0.0005, rr), s * lenH));
    }
    pts.push(new THREE.Vector2(0.0001, lenH));
    return new THREE.LatheGeometry(pts, 12);
  };
  // Blade: a pointed scoop (a grid bent into a trough).
  const scoop = (lenB, wB, dip, tines = 0) => {
    const nx = 8, ny = 10, pos = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const v = j / ny, u = i / nx * 2 - 1;
      const half = wB * 0.5 * (tines ? 1 : Math.sin(Math.PI * Math.min(1, 0.25 + v * 0.95)) ** 0.7);
      pos.push(u * half, v * lenB, dip * (1 - u * u) * (tines ? 0.25 : 1) * Math.sin(Math.PI * Math.min(1, 0.15 + v)));
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (tines && j > 3 && (i % 3 === 2)) continue;          // gaps between tines (from 40 % of the length)
      const a = j * (nx + 1) + i, c = a + nx + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  {
    // Trowel lying on the top, blade (concave up) towards the back of the bench (-z), a little yawed.
    const Tr = I.trowel, m = T(Tr.x, t, Tr.z, Tr.yaw);
    const place = (g, mat, local, c) => b.add(g, mat, m.clone().multiply(local), c);
    place(scoop(0.13, 0.066, 0.013), zinc, T(0, 0.015, -0.02, Math.PI, Math.PI / 2), 0x6f6c68);
    place(new THREE.CylinderGeometry(0.0035, 0.0045, 0.045, 6), zinc, T(0, 0.016, 0.0, 0, Math.PI / 2 + 0.08), 0x6f6d69);
    place(new THREE.CylinderGeometry(0.0115, 0.0125, 0.022, 14), zinc, T(0, 0.0135, 0.031, 0, Math.PI / 2), 0xb5b0a6);
    place(handle(0.112, 0.0135), soft, T(0, 0.0135, 0.04, 0, Math.PI / 2), shade(ASH, 0.95, 1.05));
  }
  {
    // Hand fork stuck in a corner of the seed tray, leaning out.
    const S = I.tray, m = T(S.x - S.hx + 0.04, t + S.h - 0.05, S.z - S.hz + 0.035, 0.5, 0, -0.32);
    const place = (g, mat, local, c) => b.add(g, mat, m.clone().multiply(local), c);
    // Three flat-ish tines splayed from a bridge, their tips buried in the compost.
    for (const k of [-1, 0, 1]) {
      const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(k * 0.012, 0.1, 0), new THREE.Vector3(k * 0.02, 0.06, 0.004), new THREE.Vector3(k * 0.021, 0.0, -0.006));
      place(new THREE.TubeGeometry(c, 8, 0.0028, 5, false), zinc, new THREE.Matrix4(), 0x7d7b77);
    }
    place(new RoundedBoxGeometry(0.03, 0.012, 0.007, 1, 0.003), zinc, T(0, 0.102, 0), 0x7d7b77);
    place(new THREE.CylinderGeometry(0.0035, 0.0045, 0.035, 6), zinc, T(0, 0.115, 0), 0x6f6d69);
    place(new THREE.CylinderGeometry(0.0115, 0.0125, 0.022, 14), zinc, T(0, 0.142, 0), 0xb5b0a6);
    place(handle(0.11, 0.013), soft, T(0, 0.152, 0), shade(ASH, 0.9, 1.0));
  }

  // ---------------------------------------------------------------- twine, gloves, spilt soil
  {
    const Tw = I.twine, c = new THREE.Vector3(Tw.x, t + Tw.r * 0.92, Tw.z);
    b.add(new THREE.SphereGeometry(Tw.r * 0.93, 16, 12), soft, T(c.x, c.y, c.z, 0, 0, 0, 1, 0.92, 1), 0xa8875a);
    // Wound strands: great circles at many angles, then a loose end trailing over the top.
    const pts = [], wraps = hi ? 44 : 26, seg = 26;
    const ax = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
    for (let k = 0; k < wraps; k++) {
      ax.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      u.set(1, 0, 0).cross(ax); if (u.lengthSq() < 0.01) u.set(0, 1, 0).cross(ax); u.normalize();
      w.copy(ax).cross(u);
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2;
        ring.push(new THREE.Vector3().addScaledVector(u, Math.cos(a)).addScaledVector(w, Math.sin(a)).multiplyScalar(Tw.r).multiply(new THREE.Vector3(1, 0.92, 1)).add(c));
      }
      pts.push(ring);
    }
    for (const ring of pts) b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), seg, 0.0022, 4, true), soft, null, shade(0xc9a467, 0.85, 1.08));
    const end = new THREE.CatmullRomCurve3([c.clone().add(new THREE.Vector3(0.01, Tw.r * 0.9, 0)), c.clone().add(new THREE.Vector3(0.04, Tw.r * 0.3, 0.02)), new THREE.Vector3(c.x + 0.07, t + 0.002, c.z + 0.03), new THREE.Vector3(c.x + 0.09, t + 0.002, c.z + 0.07)]);
    b.add(new THREE.TubeGeometry(end, 16, 0.0016, 4, false), soft, null, 0xc9a467);
  }
  {
    // Gardening gloves: suede palms, green canvas backs, knit cuffs; one lies across the other.
    const G = I.gloves;
    const glove = (x, z, yaw, y, flip) => {
      const m = T(x, y, z, yaw, 0, flip ? 0.08 : -0.05);
      const place = (g, local, col) => b.add(g, soft, m.clone().multiply(local), col);
      const palm = new RoundedBoxGeometry(0.075, 0.016, 0.085, 2, 0.007);
      place(palm, T(0, 0.008, 0), 0x6b7552);
      place(new RoundedBoxGeometry(0.07, 0.006, 0.08, 2, 0.003), T(0, 0.001, 0.002), 0xb08a5e);
      for (let k = 0; k < 4; k++) {
        const fl = [0.05, 0.058, 0.055, 0.045][k], fx = -0.027 + k * 0.018;
        place(new THREE.CapsuleGeometry(0.0075, fl, 3, 8), T(fx, 0.007, -0.043 - fl / 2, (k - 1.5) * 0.05 + (rnd() - 0.5) * 0.1, Math.PI / 2 + 0.06, 0, 1, 0.75, 1), shade(0x6b7552, 0.92, 1.05));
      }
      place(new THREE.CapsuleGeometry(0.0085, 0.04, 3, 8), T(flip ? -0.045 : 0.045, 0.006, -0.02, flip ? 0.7 : -0.7, Math.PI / 2, 0, 1, 0.75, 1), 0xa9845a);
      place(new THREE.CylinderGeometry(0.036, 0.038, 0.045, 16, 1, true), T(0, 0.009, 0.062, 0, Math.PI / 2, 0, 1, 1, 0.38), 0x8e7a5c);
    };
    glove(G.x, G.z - 0.01, 0.35 + Math.PI / 2, PB.shelf, false);
    glove(G.x + 0.01, G.z + 0.02, -0.5 + Math.PI / 2, PB.shelf + 0.013, true);
  }
  // Spilt compost on the top and the shelf: little clusters of crumbs.
  for (let i = 0; i < 7; i++) {
    const x = PB.x0 + 0.06 + rnd() * (depth - 0.08), z = PB.z0 + 0.05 + rnd() * (len - 0.1), y = (i < 4 ? t : PB.shelf) - 0.0005;
    for (let k = 0; k < 6; k++) {
      const r = 0.002 + rnd() * 0.004;
      b.add(new THREE.SphereGeometry(r, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), soft, T(x + (rnd() - 0.5) * 0.03, y, z + (rnd() - 0.5) * 0.03, rnd() * 3, 0, 0, 1, 0.5, 1 + rnd()), shade(SOIL, 0.8, 1.3));
    }
  }
  // The upturned pot's drainage hole.
  b.add(new THREE.CircleGeometry(0.009, 12), soft, T(I.upturned.x, PB.shelf + I.upturned.h + 0.0012, I.upturned.z, 0, -Math.PI / 2), 0x1e1612);

  // ---------------------------------------------------------------- galvanised bucket underneath
  {
    const B = I.bucket, x = B.x, z = B.z;
    b.add(vesselGeometry({ rOutBottom: B.rb, rOut: B.rt, rIn: B.rt - 0.003, rInBottom: B.rb - 0.003, height: B.h, bottom: 0.004, foot: 0.006, segments: 40 }), zinc, T(x, fy + 0.001, z), 0xffffff);
    b.add(new THREE.TorusGeometry(B.rt + 0.001, 0.004, 6, 40), zinc, T(x, fy + B.h, z, 0, Math.PI / 2), 0xe0e0e0);
    for (const hgt of [0.06, 0.17]) b.add(new THREE.TorusGeometry(B.rb + (B.rt - B.rb) * hgt / B.h + 0.001, 0.0025, 5, 40), zinc, T(x, fy + hgt, z, 0, Math.PI / 2), 0xd0d0d0); // pressed ribs
    // Ears and the wire handle, lying down towards the fence.
    for (const s of [-1, 1]) b.add(bx(0.022, 0.03, 0.004), zinc, T(x, fy + B.h - 0.03, z + s * (B.rt - 0.002)), 0xc8c8c8);
    b.add(new THREE.TorusGeometry(B.rt + 0.004, 0.0028, 5, 28, Math.PI), zinc, T(x - 0.002, fy + B.h - 0.026, z, Math.PI / 2, 0, 0, 1, 1, 1).multiply(new THREE.Matrix4().makeRotationX(-1.2)), 0xb8b8b8);
    // A little dirty water in the bottom.
    b.add(new THREE.CircleGeometry(B.rb - 0.004, 24), soft, T(x, fy + 0.03, z, 0, -Math.PI / 2), 0x3a3428);
  }

  for (const m of b.build(scene)) m.userData.potBench = true;

  // ---------------------------------------------------------------- loose pots (instanced)
  const sim = ctx.sim, mod = sim && sim.extras && sim.extras.mods.pottingBench;
  const pots = mod && mod.pots ? mod.pots : [];
  let inst = null;
  if (pots.length) {
    const d0 = LOOSE[0];
    const g = potGeometry(d0.rb, d0.rt, d0.h, 22).translate(0, -d0.h / 2, 0);
    inst = new THREE.InstancedMesh(g, clay, pots.length);
    inst.castShadow = true; inst.receiveShadow = true;
    const col = new THREE.Color();
    pots.forEach((p, i) => { inst.setColorAt(i, col.setHex(i ? 0xf2e2d6 : 0xffffff)); });
    scene.add(inst);
  }
  const _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  const posed = pots.map(() => -1);
  let clock = 0;
  pots.forEach((p, i) => {
    ctx.replayProxy(p.def.id, (o) => { posed[i] = clock; inst.setMatrixAt(i, _m.compose(o.position, o.quaternion, _s)); inst.instanceMatrix.needsUpdate = true; });
  });
  const last = pots.map(() => new THREE.Vector3(1e9, 0, 0)), lastQ = pots.map(() => new THREE.Quaternion());

  // Clay clunk: a hollow knock with a short gritty scrape.
  registerExtraSound('clayPot', (audio, e, now) => {
    if (now - (audio._clayT || 0) < 0.06) return;
    audio._clayT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos);
    const f = 520 + Math.random() * 160;
    audio.tone({ freq: f, to: f * 0.92, type: 'triangle', gain: 0.05 + 0.12 * s, attack: 0.001, decay: 0.07, out: o });
    audio.tone({ freq: f * 2.7, type: 'sine', gain: 0.02 + 0.04 * s, attack: 0.001, decay: 0.035, out: o });
    audio.noiseBurst({ freq: 1400, q: 1.4, gain: 0.03 + 0.07 * s, decay: 0.05, out: o });
  });

  return {
    update(dt) {
      clock += dt;
      if (!inst) return;
      let dirty = false;
      for (let i = 0; i < pots.length; i++) {
        if (clock - posed[i] < 0.25) continue;            // the replay is posing it
        const p = pots[i];
        p.track.sample(1, _p, _q);
        if (_p.distanceToSquared(last[i]) < 1e-12 && Math.abs(_q.dot(lastQ[i])) > 0.9999999) continue;
        last[i].copy(_p); lastQ[i].copy(_q);
        inst.setMatrixAt(i, _m.compose(_p, _q, _s));
        dirty = true;
      }
      if (dirty) { inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere(); }
    },
  };
}
