import * as THREE from 'three';
import { brickTexture, roofTexture, foliageTexture, leafTexture, barkTexture } from '../gardenTextures.js';
import { boxUV, T } from '../batch.js';
import { WIND_GLSL } from '../grass.js';
import { FY } from '../../sim/world/plan.js';
import { roofSlabs, gables, chimneys } from '../../sim/world/shapes.js';
import { patchWaterMaterial } from '../openWater.js';

// The neighbourhood's shared materials and builders: houses, windows, doors, trees, hedges and fences.
// Materials are white-based where they can be (tint each piece through ctx.add's colour) so the whole
// world merges into a few draw calls per chunk. Builders take the same specs as src/sim/world/shapes.js.
let lib = null;
export function worldKit(quality) {
  if (lib) return lib;
  const big = quality.textureSize >= 2048 && !quality.lite;
  const brick = new THREE.MeshStandardMaterial({ map: brickTexture(big ? 1024 : 512), roughness: 0.92 });
  brick.map.repeat.set(1 / 0.9, 1 / 0.9);
  const roof = new THREE.MeshStandardMaterial({ map: roofTexture(big ? 512 : 256), roughness: 0.8 });
  roof.map.repeat.set(1 / 0.9, 1 / 0.9);
  const leafy = new THREE.MeshStandardMaterial({ map: foliageTexture(big ? 512 : 256), roughness: 0.9 });
  leafy.map.repeat.set(1.6, 1.6);
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(256), roughness: 0.95 });
  bark.map.repeat.set(2, 1);
  lib = {
    // Red stock brick (tile 0.9 m: use boxUV(w, h, d, 1)); tint lightly (0xffffff, 0xe8d8c8 weathered).
    brick,
    // Clay roof tiles (tile 0.9 m); tint 0x8a8f98 for slate grey, 0xd09080 for bright new clay.
    roof,
    // Glass of houses you can't see into: a cool blue-grey that catches the sky, brighter at a glance than
    // head on (tint it a little darker or lighter per pane; white is the base).
    window: new THREE.MeshStandardMaterial({ color: 0x6d7c88, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.1 }),
    // Dense foliage for canopies and hedges (tile ~0.6 m), and tree bark.
    leafy, bark,
    // Water you can see through a little (ponds, puddles): drawn last, no depth write.
    // (The environment is the kitchen's room light box: outdoors its square ceiling panels would show as square
    // glints on the ponds, so the water takes only a little of it.)
    water: new THREE.MeshStandardMaterial({ color: 0x40564e, roughness: 0.1, metalness: 0.2, envMapIntensity: 0.2, transparent: true, opacity: 0.86, depthWrite: false }),
  };
  for (const [k, m] of Object.entries(lib)) m.name = `world-${k}`;
  lib.leafy.name = 'world-leaf';
  lib.water.name = 'world-glass-water';
  // Ripples, cat's paws, froth and glitter under the rotor wash (see openWater.js).
  patchWaterMaterial(lib.water);
  return lib;
}

// ------------------------------------------------------------------ houses
// A closed house's exterior from a houseColliders spec (src/sim/world/shapes.js) plus how it looks:
//   wall: 'brick' | 'render' (painted render), wallColor, roofColor, trimColor (window frames, fascias)
//   windows: [{ face: 'front'|'back'|'left'|'right', u, y, w, h, style: 'sash'|'casement', bars }]
//            u is the centre along the face measured from its left end as you face it from outside,
//            y the bottom of the opening; front is +z, back -z, left -x, right +x.
//   doors:   [{ face, u, w, h, color, glazed }]
// Walls, roof and chimneys are lod 0; frames, sills, gutters and pots lod 1.
export function buildHouse(ctx, s) {
  const k = ctx.kit, wk = ctx.wk, y0 = s.y0 ?? FY;
  const trim = s.trimColor ?? 0xf1ede4;
  const W = s.x1 - s.x0, D = s.z1 - s.z0, H = s.eave - y0;
  const wallMat = s.wall === 'render' ? k.paint : wk.brick;
  const wallCol = s.wallColor ?? (s.wall === 'render' ? 0xece4d4 : 0xffffff);
  ctx.add(boxUV(W, H, D, 1), wallMat, T((s.x0 + s.x1) / 2, y0 + H / 2, (s.z0 + s.z1) / 2), wallCol, 0);
  // Plinth (a darker course of brick at the bottom).
  ctx.add(boxUV(W + 0.03, 0.18, D + 0.03, 1), wk.brick, T((s.x0 + s.x1) / 2, y0 + 0.09, (s.z0 + s.z1) / 2), 0x9a8a80, 1);
  // Roof slopes with fascias and gutters along the eaves.
  const slabs = roofSlabs(s), alongX = (s.ridge || 'x') === 'x';
  for (const r of slabs) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(r.cx, r.cy, r.cz), r.quat, new THREE.Vector3(1, 1, 1));
    ctx.add(boxUV(r.hx * 2, 0.06, r.hz * 2, 1), wk.roof, m, s.roofColor ?? 0xffffff, 0);
  }
  {
    const ov = s.overhang ?? 0.3, ey = slabs[0].eaveY;
    const len = alongX ? W + ov * 1.2 : D + ov * 1.2;
    for (const side of [-1, 1]) {
      const e = alongX ? (side < 0 ? s.z0 - ov : s.z1 + ov) : (side < 0 ? s.x0 - ov : s.x1 + ov);
      const px = alongX ? (s.x0 + s.x1) / 2 : e, pz = alongX ? e : (s.z0 + s.z1) / 2, ry = alongX ? 0 : Math.PI / 2;
      ctx.add(new THREE.BoxGeometry(len, 0.16, 0.025), k.paint, T(px, ey - 0.06, pz, ry), trim, 1);
      ctx.add(new THREE.CylinderGeometry(0.05, 0.05, len, 10, 1, true, 0, Math.PI), k.paint, T(alongX ? px : px + side * 0.06, ey - 0.12, alongX ? pz + side * 0.06 : pz, ry, 0, Math.PI / 2), 0x2d3033, 1);
      // Soffit under the overhang.
      const sw = ov, sc = alongX ? (side < 0 ? s.z0 - ov / 2 : s.z1 + ov / 2) : (side < 0 ? s.x0 - ov / 2 : s.x1 + ov / 2);
      ctx.add(new THREE.BoxGeometry(alongX ? len : sw, 0.02, alongX ? sw : len), k.paint, T(alongX ? px : sc, ey - 0.13, alongX ? sc : pz), trim, 1);
    }
  }
  // Gables (brick or render triangles), with a barge board along each verge.
  for (const g of gables(s)) {
    const geo = new THREE.BufferGeometry();
    const [a, b, c] = g, inward = alongX ? (a[0] === s.x0 ? 1 : -1) : (a[2] === s.z0 ? 1 : -1);
    const off = (p, d) => (alongX ? [p[0] + inward * d, p[1], p[2]] : [p[0], p[1], p[2] + inward * d]);
    const pts = [a, b, c, off(a, 0.25), off(b, 0.25), off(c, 0.25)];
    const pos = [];
    const tri = (i, j, l) => pos.push(...pts[i], ...pts[j], ...pts[l]);
    tri(0, 2, 1); tri(3, 4, 5);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // Flat UVs in metres on the gable plane.
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(alongX ? pos[i + 2] : pos[i], pos[i + 1]);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    // Face outwards whichever way round the points came.
    const n = geo.attributes.normal, outward = -inward;
    if ((alongX ? n.getX(0) : n.getZ(0)) * outward < 0) { const p = geo.attributes.position; for (let i = 0; i < p.count; i += 3) { for (const ax of [0, 1, 2]) { const t = p.array[i * 3 + 3 + ax]; p.array[i * 3 + 3 + ax] = p.array[i * 3 + 6 + ax]; p.array[i * 3 + 6 + ax] = t; } } geo.computeVertexNormals(); }
    ctx.add(geo, wallMat, null, wallCol, 0);
  }
  // Chimneys with a stone cap and pots.
  for (const c of chimneys(s)) {
    const h = c.top - c.y0 + 0.6;
    ctx.add(boxUV(c.hx * 2, h, c.hz * 2, 1), wk.brick, T(c.cx, c.top - h / 2, c.cz), 0xffffff, 0);
    ctx.add(new THREE.BoxGeometry(c.hx * 2 + 0.06, 0.06, c.hz * 2 + 0.06), k.stone, T(c.cx, c.top - 0.03, c.cz), 0xcfc6b4, 1);
    const n = Math.max(1, Math.round((c.hx > c.hz ? c.hx : c.hz) * 2 / 0.3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5, px = c.hx > c.hz ? c.cx + t * c.hx * 2 : c.cx, pz = c.hx > c.hz ? c.cz : c.cz + t * c.hz * 2;
      ctx.add(new THREE.CylinderGeometry(0.065, 0.08, 0.3, 10), k.terracotta, T(px, c.top + 0.15, pz), 0xb8643f, 1);
    }
  }
  for (const win of s.windows || []) windowOnFace(ctx, s, win, trim);
  for (const d of s.doors || []) doorOnFace(ctx, s, d, trim);
  // Its shadow on the ground.
  ctx.ground.shadowRect(s.x0, s.z0, s.x1, s.z1, (s.eave + s.ridgeY) / 2 - y0, 0.42);
}

// Where a point u along a face (from its left end seen from outside) is, and which way the face looks.
export function facePoint(s, face, u) {
  switch (face) {
    case 'front': return { x: s.x0 + u, z: s.z1, ry: 0, nx: 0, nz: 1 };
    case 'back': return { x: s.x1 - u, z: s.z0, ry: Math.PI, nx: 0, nz: -1 };
    case 'left': return { x: s.x0, z: s.z0 + u, ry: -Math.PI / 2, nx: -1, nz: 0 };
    default: return { x: s.x1, z: s.z1 - u, ry: Math.PI / 2, nx: 1, nz: 0 };
  }
}

// A window drawn on a solid wall: dark glass a little recessed behind a painted frame, glazing bars,
// a stone sill. Also used for real (open) windows in rooms you can fly into: pass glass: false.
export function windowOnFace(ctx, s, win, trim = 0xf1ede4) {
  const p = facePoint(s, win.face, win.u);
  windowAt(ctx, { x: p.x + p.nx * 0.001, y: win.y, z: p.z + p.nz * 0.001, ry: p.ry, w: win.w, h: win.h, style: win.style, bars: win.bars, trim, curtains: win.curtains ?? true });
}

// Window centred on (x, z) in a wall plane facing ry (0 = +z), bottom of the opening at y.
export function windowAt(ctx, { x, y, z, ry = 0, w, h, style = 'sash', bars = 2, trim = 0xf1ede4, glass = true, curtains = true, lod = 1 }) {
  const k = ctx.kit, wk = ctx.wk;
  const at = (lx, ly, lz) => T(x + Math.cos(ry) * lx + Math.sin(ry) * lz, y + ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz, ry);
  const f = 0.055;
  // Panes differ a little (each catches a different patch of sky), and the curtains read from down the street.
  const pick = Math.abs(Math.round(x * 3 + z * 7));
  if (glass) ctx.add(new THREE.PlaneGeometry(w, h), wk.window, at(0, h / 2, 0.004), [0xffffff, 0xe2e6ea, 0xc8ced4, 0xf0f2f4, 0xd6dbe0][pick % 5], 0);
  if (glass && curtains) for (const sx of [-1, 1]) ctx.add(new THREE.PlaneGeometry(w * 0.22, h * 0.92), k.fabric, at(sx * w * 0.37, h * 0.48, 0.006), [0xd9c9a8, 0xb9c4c9, 0xc9a8a0, 0xe0dccf][pick % 4], 1);
  // Frame and bars.
  ctx.add(new THREE.BoxGeometry(w + f * 2, f, 0.06), k.paint, at(0, h + f / 2, 0.02), trim, lod);
  ctx.add(new THREE.BoxGeometry(f, h + f * 2, 0.06), k.paint, at(-w / 2 - f / 2, h / 2, 0.02), trim, lod);
  ctx.add(new THREE.BoxGeometry(f, h + f * 2, 0.06), k.paint, at(w / 2 + f / 2, h / 2, 0.02), trim, lod);
  if (style === 'sash') ctx.add(new THREE.BoxGeometry(w, 0.045, 0.05), k.paint, at(0, h / 2, 0.025), trim, lod);
  for (let i = 1; i < bars; i++) ctx.add(new THREE.BoxGeometry(0.022, h, 0.03), k.paint, at(-w / 2 + (w * i) / bars, h / 2, 0.02), trim, Math.max(lod, 2));
  // Stone sill.
  ctx.add(new THREE.BoxGeometry(w + 0.16, 0.05, 0.1), k.stone, at(0, -0.025, 0.05), 0xcfc6b4, lod);
}

export function doorOnFace(ctx, s, d, trim = 0xf1ede4) {
  const p = facePoint(s, d.face, d.u), k = ctx.kit, y0 = s.y0 ?? FY;
  const at = (lx, ly, lz) => T(p.x + Math.cos(p.ry) * lx + Math.sin(p.ry) * lz, y0 + ly, p.z - Math.sin(p.ry) * lx + Math.cos(p.ry) * lz, p.ry);
  const w = d.w ?? 0.9, h = d.h ?? 2.05;
  ctx.add(new THREE.BoxGeometry(w, h, 0.05), k.paint, at(0, h / 2, 0.02), d.color ?? 0x2f4f6b, 0);
  for (const sx of [-1, 1]) ctx.add(new THREE.BoxGeometry(0.07, h + 0.07, 0.07), k.paint, at(sx * (w / 2 + 0.035), (h + 0.07) / 2, 0.03), trim, 1);
  ctx.add(new THREE.BoxGeometry(w + 0.14, 0.07, 0.07), k.paint, at(0, h + 0.035, 0.03), trim, 1);
  if (d.glazed) ctx.add(new THREE.PlaneGeometry(w * 0.5, h * 0.22), ctx.wk.window, at(0, h * 0.78, 0.047), 0xffffff, 1);
  for (const sy of [0.25, 0.55]) ctx.add(new THREE.BoxGeometry(w * 0.7, h * 0.2, 0.015), k.paint, at(0, h * sy, 0.05), d.color ?? 0x2f4f6b, 2);
  ctx.add(new THREE.SphereGeometry(0.03, 10, 8), k.brass, at(w * 0.36, h * 0.48, 0.07), 0xffffff, 1);
  ctx.add(new THREE.BoxGeometry(w + 0.2, 0.06, 0.3), k.stone, at(0, 0.03, 0.15), 0xcfc6b4, 1);
}

// ------------------------------------------------------------------ trees
// A tree from a treeColliders spec, plus kind: 'oak' | 'birch' | 'apple' | 'ash' | 'conifer' and a seed.
// Trunk and canopy lumps are lod 0 (seen from anywhere); limbs lod 1; leaf cards (swaying) lod 2.
const _v = new THREE.Vector3(), _n = new THREE.Vector3();
export function buildTree(ctx, s) {
  const wk = ctx.wk, y = s.y ?? ctx.groundY(s.x, s.z), rnd = mulberry(s.seed ?? Math.round(s.x * 97 + s.z * 13));
  const kind = s.kind || 'oak';
  const barkCol = kind === 'birch' ? 0xe8e4dc : kind === 'conifer' ? 0x8a7a6a : 0xb0a090;
  const top = Math.max(...s.crown.map((c) => c[1]));
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(s.x, y - 0.05, s.z), new THREE.Vector3(s.x + (rnd() - 0.5) * 0.1, y + s.trunkH * 0.5, s.z + (rnd() - 0.5) * 0.1),
    new THREE.Vector3(s.x + (rnd() - 0.5) * 0.15, y + s.trunkH, s.z + (rnd() - 0.5) * 0.15), new THREE.Vector3(s.x, y + top * 0.85, s.z),
  ]);
  ctx.add(taperTube(trunk, s.trunkR * 1.3, s.trunkR * 0.35, 10, 9), wk.bark, null, barkCol, 0);
  for (const [dx, dy, dz, r] of s.crown) {
    const e = new THREE.Vector3(s.x + dx * 0.8, y + dy - r * 0.2, s.z + dz * 0.8);
    const st = new THREE.Vector3(s.x, y + s.trunkH * (0.85 + rnd() * 0.2), s.z);
    const m = st.clone().lerp(e, 0.5).add(_v.set(0, r * 0.25, 0));
    ctx.add(taperTube(new THREE.QuadraticBezierCurve3(st, m, e), s.trunkR * 0.55, s.trunkR * 0.15, 6, 6), wk.bark, null, barkCol, 1);
  }
  const tones = kind === 'birch' ? [0xd8e0a0, 0xc8d890] : kind === 'conifer' ? [0x6a8070, 0x5f7565] : kind === 'apple' ? [0xb8c8a0, 0xa8b890] : [0xa8b890, 0x98aa80, 0xb4c098];
  for (const [dx, dy, dz, r] of s.crown) {
    const n = kind === 'conifer' ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const rr = n === 1 ? r : r * (0.55 + rnd() * 0.25);
      const g = kind === 'conifer' ? coniferTier(r, r * 2.6, ctx.lite ? 10 : 14, rnd) : blob(rr, rnd, ctx.lite);
      const ox = n === 1 ? 0 : (rnd() - 0.5) * r * 0.9, oy = n === 1 ? 0 : (rnd() - 0.4) * r * 0.6, oz = n === 1 ? 0 : (rnd() - 0.5) * r * 0.9;
      ctx.add(g, wk.leafy, T(s.x + dx + ox, y + dy + oy, s.z + dz + oz, rnd() * 6), tones[i % tones.length], 0);
    }
  }
  ctx.ground.shadowCircle(s.x + s.crown[0][0], s.z + s.crown[0][2], Math.max(...s.crown.map((c) => Math.hypot(c[0], c[2]) + c[3])) * 0.9, top * 0.8, 0.24);
  if (!ctx.lite && kind !== 'conifer') {
    const pts = [];
    const n = Math.round((ctx.hi ? 60 : 30) * s.crown.reduce((a, c) => a + c[3] * c[3], 0));
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz, r] = s.crown[Math.floor(rnd() * s.crown.length)];
      _v.set(rnd() * 2 - 1, rnd() * 1.6 - 0.6, rnd() * 2 - 1).normalize();
      const rr = r * (0.88 + rnd() * 0.18);
      pts.push([s.x + dx + _v.x * rr, y + dy + _v.y * rr * 0.9, s.z + dz + _v.z * rr, _v.x, _v.y + 0.3, _v.z]);
    }
    ctx.object(leafCards(ctx, pts, { size: 0.28, hue: kind === 'birch' ? 80 : 100 }), 2);
  }
}

// One tier of a conifer: a cone whose skirt is cut into drooping branch tips (every other point of the rim
// pushed out and down) and whose sides are a little uneven, so a stack of them reads as layered boughs rather
// than a toy's cones.
export function coniferTier(r, h, seg, rnd) {
  const g = new THREE.ConeGeometry(r, h, seg, 2);
  const p = g.attributes.position, wob = [];
  for (let i = 0; i <= seg; i++) wob.push(1 + (rnd() - 0.5) * 0.16);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, z);
    if (rr < 1e-5) continue;
    const a = Math.atan2(z, x), k = Math.round(((a / (Math.PI * 2)) + 1) % 1 * seg) % seg;
    const t = (h / 2 - y) / h;                       // 0 at the tip, 1 at the skirt
    let f = wob[k], dy = 0;
    if (t > 0.99) { if (k % 2) { f *= 1.2; dy = -0.13 * h; } else f *= 0.86; }
    else f *= 1 + 0.05 * Math.sin(a * 3 + rr * 7);
    p.setXYZ(i, x * f, y + dy, z * f);
  }
  g.computeVertexNormals();
  return g;
}

function blob(r, rnd, lite = false) {
  const g = new THREE.IcosahedronGeometry(r, lite ? 1 : 2);
  const p = g.attributes.position, seed = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const n = Math.sin(_v.x * 5.1 / r + seed) * Math.sin(_v.y * 4.3 / r + seed * 2.1) * Math.sin(_v.z * 4.7 / r + seed * 0.7);
    _v.multiplyScalar(1 + 0.2 * n);
    _v.y *= 0.85;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  // Mostly the rounded normal of the whole lump, a little of each facet's: canopies and hedges read as soft
  // masses of leaves in the light instead of cut gems.
  const nm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i) / 0.72, p.getZ(i)).normalize();
    _n.fromBufferAttribute(nm, i).multiplyScalar(0.3).addScaledVector(_v, 0.7).normalize();
    nm.setXYZ(i, _n.x, _n.y, _n.z);
  }
  return g;
}

export function taperTube(curve, r0, r1, seg, radial) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, r = r0 + (r1 - r0) * t;
    curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      _v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, _v.x, _v.y, _v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// Swaying alpha-tested leaf cards (one instanced draw), as the tea garden's trees have.
const leafMats = new Map();
export function leafCards(ctx, pts, { size = 0.25, hue = 100 } = {}) {
  let mat = leafMats.get(hue);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ map: leafTexture(256, hue), alphaTest: 0.45, side: THREE.DoubleSide });
    mat.name = 'world-leafcards';
    const wind = ctx.wind || {};
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, wind);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
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
    leafMats.set(hue, mat);
  }
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size), mat, pts.length);
  const o = new THREE.Object3D(), col = new THREE.Color(), r = mulberry(pts.length + hue);
  pts.forEach(([x, y, z, nx, ny, nz], i) => {
    o.position.set(x, y, z);
    o.lookAt(x + nx + (r() - 0.5) * 1.2, y + ny + (r() - 0.5) * 1.2, z + nz + (r() - 0.5) * 1.2);
    o.rotateZ(r() * Math.PI * 2);
    const sc = 0.75 + r() * 0.5;
    o.scale.set(sc, sc, sc);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    col.setHSL(0.25 + (r() - 0.5) * 0.05, 0.3 + r() * 0.2, 0.42 + r() * 0.18);
    mesh.setColorAt(i, col.multiplyScalar(1.5));
  });
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noAO = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// ------------------------------------------------------------------ hedges and fences
// A clipped hedge from a to b ([x, z]), height h, depth d: lumpy foliage blocks (lod 0) and leaf cards on
// its faces (lod 2). gaps: [[from, to]] metres along it.
export function buildHedge(ctx, { a, b, h, d = 0.5, gaps = [], y = FY, color = 0xb8c8a8 }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, yaw = Math.atan2(-dz, dx);
  const rnd = mulberry(Math.round(a[0] * 31 + a[1] * 17 + len * 7));
  const open = (u) => gaps.some(([g0, g1]) => u > g0 - 0.15 && u < g1 + 0.15);
  const seg = 0.9;
  for (let u = seg / 2; u < len; u += seg) {
    if (open(u)) continue;
    const g = blob(0.5, rnd, ctx.lite);
    ctx.add(g, ctx.wk.leafy, T(a[0] + dx * u, y + h * 0.5, a[1] + dz * u, yaw, 0, 0, seg * 1.25, h * 1.15, d * 1.1), color, 0);
  }
  ctx.ground.shadowRect(Math.min(a[0], b[0]) - d / 2, Math.min(a[1], b[1]) - d / 2, Math.max(a[0], b[0]) + d / 2, Math.max(a[1], b[1]) + d / 2, h * 0.7, 0.35);
}

// A fence run from a to b. style: 'board' (close-boarded), 'picket', 'postrail' (two or three rails),
// 'panel' (lap panels between concrete posts), 'chainlink'. gaps as for hedges.
export function buildFence(ctx, { a, b, h = 1.2, style = 'board', color = 0x9a8a78, gaps = [], y = FY, rails = 3 }) {
  const k = ctx.kit;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, yaw = Math.atan2(-dz, dx);
  const rnd = mulberry(Math.round(a[0] * 13 + a[1] * 7 + len));
  const at = (u, yy, off = 0) => T(a[0] + dx * u - dz * off, y + yy, a[1] + dz * u + dx * off, yaw);
  const open = (u, m = 0.05) => gaps.some(([g0, g1]) => u > g0 - m && u < g1 + m);
  const postGap = style === 'postrail' ? 2.4 : 1.8;
  const np = Math.max(1, Math.round(len / postGap));
  for (let i = 0; i <= np; i++) {
    const u = len * i / np;
    if (open(u, 0.02) && !open(u - 0.06) && !open(u + 0.06)) continue;
    ctx.add(boxUV(0.09, h + 0.1, 0.09, 1), style === 'panel' ? k.stone : k.weathered, at(u, (h + 0.1) / 2), style === 'panel' ? 0xc8c2b6 : color, 0);
  }
  if (style === 'board' || style === 'picket') {
    const pitch = style === 'picket' ? 0.11 : 0.1, bw = style === 'picket' ? 0.07 : 0.098;
    for (let u = pitch / 2; u < len; u += pitch) {
      if (open(u)) continue;
      const hh = (style === 'picket' ? h * 0.85 : h) + (rnd() - 0.5) * 0.015;
      ctx.add(boxUV(bw, hh, 0.018, 1), k.weathered, at(u, 0.04 + hh / 2, 0.03), shade(rnd, color, 0.88, 1.06), 1);
    }
    for (const yy of style === 'picket' ? [0.2, h * 0.65] : [0.25, h - 0.15]) addRail(ctx, len, open, (u0, u1) => ctx.add(boxUV(u1 - u0, 0.07, 0.03, 1), k.weathered, at((u0 + u1) / 2, yy), color, 1));
  } else if (style === 'postrail') {
    for (let r = 0; r < rails; r++) {
      const yy = 0.25 + (h - 0.3) * r / Math.max(1, rails - 1);
      addRail(ctx, len, open, (u0, u1) => ctx.add(boxUV(u1 - u0, 0.09, 0.04, 1), k.weathered, at((u0 + u1) / 2, yy, 0.05), color, 0));
    }
  } else if (style === 'panel') {
    addRail(ctx, len, open, (u0, u1) => {
      for (let yy = 0.08; yy < h; yy += 0.15) ctx.add(boxUV(u1 - u0, 0.16, 0.02, 1), k.weathered, at((u0 + u1) / 2, yy + 0.075, 0.0, 0), shade(rnd, color, 0.9, 1.05), 0);
    });
  } else if (style === 'chainlink') {
    addRail(ctx, len, open, (u0, u1) => ctx.add(new THREE.PlaneGeometry(u1 - u0, h), k.zinc, at((u0 + u1) / 2, h / 2), 0x9aa0a0, 0));
  }
}

function addRail(ctx, len, open, fn) {
  let u0 = 0;
  const step = 0.05;
  for (let u = 0; u <= len + 1e-6; u += step) {
    const o = open(u, 0) || u >= len;
    if (o) { if (u - u0 > 0.06) fn(u0, Math.min(u, len)); u0 = u + step; }
  }
}

function shade(rnd, hex, a, b) {
  const c = new THREE.Color(hex), k = a + (b - a) * rnd();
  return c.multiplyScalar(k).getHex();
}

export function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
