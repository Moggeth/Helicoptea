import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { boxUV, planeUV, T } from '../../batch.js';
import * as TX from '../../textures.js';
import { FY, MAIN } from '../../../sim/world/plan.js';
import {
  WALL_PIECES, PARTS, ROOF_PIECES, ROOMS, roomAt, cutRect, LV, VOID, STAIR_X1, HATCH, BAY, GABLE_WIN, P1, ARCH, CHAIRS, SOFAS,
} from '../../../sim/world/house.js';
import { placeChair, placeSofa } from '../../chairs.js';
import { mulberry } from '../kit.js';

// Draws the main house (plan.js MAIN): brick walls with plaster inside, the roof and gables, and every
// room's finishes; the furniture and fittings are the sim's PARTS (what you see is what you hit).
// Walls, floors, ceilings, roof lod 0; furniture lod 1; small clutter lod 2.
const M = MAIN, O_ = M.outer;
const { gf, c1, f1, c2, eave } = LV;

let shared = null;
function sharedMaterials() {
  if (shared) return shared;
  const plasterTex = TX.plasterTexture();
  plasterTex.repeat.set(1 / 1.6, 1 / 1.23);
  const plaster = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.95 });
  plaster.name = 'house-plaster';
  // Chequer tiles (a 0.4 m repeat of four tiles).
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = (x + y) % 2 ? '#3b3b3d' : '#f1ede2';
    g.fillRect(x * 64, y * 64, 64, 64);
    g.strokeStyle = 'rgba(120,110,95,0.7)';
    g.lineWidth = 2;
    g.strokeRect(x * 64 + 1, y * 64 + 1, 62, 62);
  }
  const chk = new THREE.CanvasTexture(cv);
  chk.colorSpace = THREE.SRGBColorSpace;
  chk.wrapS = chk.wrapT = THREE.RepeatWrapping;
  chk.repeat.set(1 / 0.4, 1 / 0.4);
  chk.anisotropy = 4;
  const tile = new THREE.MeshStandardMaterial({ map: chk, roughness: 0.4 });
  tile.name = 'house-tile';
  const metroTex = TX.tileTexture();
  metroTex.repeat.set(1, 1);
  const metro = new THREE.MeshStandardMaterial({ map: metroTex, roughness: 0.3 });
  metro.name = 'house-metro';
  const glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd89a, emissiveIntensity: 0.65, roughness: 0.8 });
  glow.name = 'house-glow';
  shared = { plaster, tile, metro, glow };
  return shared;
}

const hash = (n) => { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const jit = (hex, amt, seed) => {
  const k = 1 + (hash(seed) - 0.5) * 2 * amt, c = new THREE.Color(hex).multiplyScalar(k);
  return c.getHex();
};
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _u = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const matrix = (x, y, z, q) => new THREE.Matrix4().compose(_p.set(x, y, z), q || _q.identity(), _s);

// A leaf one unit long: a pointed oval blade on y (0 at the stalk, 1 the tip), x across, z its face; cupped
// along the midrib and arching back at the tip.
let blade = null;
function bladeGeometry() {
  if (blade) return blade;
  const nx = 4, ny = 6, pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) {
    const t = j / ny, half = 0.25 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.94 + 0.03)), 0.7) * (1 - 0.2 * t);
    for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1;
      pos.push(u * half, t, 0.07 * u * u * (half / 0.25) - 0.3 * t * t);
      uv.push(0.5 + u * half, t);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  return blade;
}
// A spray of leaves on stalks from the soil of a pot: the inner ones upright, the outer ones arching out.
function housePlant(add, k, p, lite) {
  const rnd = mulberry(Math.floor(p.seed) + 7), leaf = bladeGeometry();
  const n = lite ? Math.ceil(p.n * 0.6) : p.n, stalk = new THREE.CylinderGeometry(0.0025, 0.004, 1, 5);
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), xv = new THREE.Vector3(), zv = new THREE.Vector3(), base_ = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, az = i * 2.39996 + p.seed, el = 1.35 - 0.95 * f + (rnd() - 0.5) * 0.25;
    const len = p.leafH * (0.42 + 0.3 * (1 - f) + 0.15 * rnd()), stem = p.leafH * (0.1 + 0.4 * (1 - f) * rnd());
    const sr = p.r * 0.5 * rnd();
    base_.set(p.x + Math.cos(az) * sr, p.y + stem, p.z + Math.sin(az) * sr);
    // Stalk from the soil to the leaf.
    const s0 = new THREE.Vector3(p.x + Math.cos(az) * sr * 0.3, p.y, p.z + Math.sin(az) * sr * 0.3);
    d.subVectors(base_, s0);
    const sl = d.length();
    if (sl > 0.01) add(stalk, k.leaf, new THREE.Matrix4().compose(s0.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(up, d.normalize()), new THREE.Vector3(1, sl, 1)), jit(0x5f7a3a, 0.1, i + p.seed), 2);
    // Leaf: its y along (az, el), x level, z (its face) towards the sky.
    d.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    xv.crossVectors(up, d).normalize();
    zv.crossVectors(xv, d).normalize();
    const twist = (rnd() - 0.5) * 0.5;
    const m = new THREE.Matrix4().makeBasis(xv, d, zv).multiply(new THREE.Matrix4().makeRotationY(twist));
    m.scale(new THREE.Vector3(len * (0.9 + 0.3 * rnd()), len, len)).setPosition(base_);
    add(leaf, k.leaf, m, jit(p.col, 0.22, i * 3.3 + p.seed), 1);
  }
}

export function build(ctx) {
  const k = ctx.kit, wk = ctx.wk, S = sharedMaterials();
  const mats = { ...k, brick: wk.brick, roof: wk.roof, plaster: S.plaster, tile: S.tile, glow: S.glow };
  const add = (g, m, mx, col, lod) => ctx.add(g, m, mx, col, lod);

  // ------------------------------------------------------------------ parts
  const polyGeo = (pts, y0, y1) => {
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    return g;
  };
  for (const p of PARTS) {
    if (p.role === 'hidden') continue;
    const m = mats[p.mat] || k.paint;
    switch (p.s) {
      case 'b': add(boxUV(p.hx * 2, p.hy * 2, p.hz * 2, 1), m, matrix(p.x, p.y, p.z, new THREE.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3])), p.col, p.lod); break;
      case 'c': add(new THREE.CylinderGeometry(p.r2, p.r, p.hh * 2, p.seg), m, matrix(p.x, p.y, p.z, new THREE.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3])), p.col, p.lod); break;
      case 'o': {
        const g = new THREE.SphereGeometry(p.r, 10, 7);
        add(g, m, new THREE.Matrix4().compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(1, p.sy, 1)), p.col, p.lod);
        _s.set(1, 1, 1);
        break;
      }
      case 'r': {
        _d.set(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
        const len = _d.length();
        if (len < 1e-5) break;
        const q = new THREE.Quaternion().setFromUnitVectors(_u, _d.clone().normalize());
        add(new THREE.CylinderGeometry(p.r, p.r, len, p.seg), m, matrix((p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2, q), p.col, p.lod);
        break;
      }
      case 'p': {
        const q = new THREE.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3]);
        add(new THREE.PlaneGeometry(p.w, p.h), m, matrix(p.x, p.y, p.z, q), p.col, p.lod);
        add(new THREE.PlaneGeometry(p.w, p.h), m, matrix(p.x, p.y, p.z, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(_u, Math.PI))), p.col, p.lod);
        break;
      }
      case 't': add(new THREE.TorusGeometry(p.R, p.r, 6, p.seg), m, matrix(p.x, p.y, p.z, new THREE.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3])), p.col, p.lod); break;
      case 'h': add(polyGeo(p.pts, p.y0, p.y1), m, null, p.col, p.lod); break;
      case 'f': housePlant(add, k, p, ctx.lite); break;
      case 'x': add(new ConvexGeometry(chunk3(p.pts)), m, null, p.col, p.lod); break;
      default: break;
    }
  }

  // Dining chairs: the chair kit's ladder-back with a drop-in seat, where the sim stood each one.
  CHAIRS.forEach((c, i) => {
    const mx = T(c.x, c.y, c.z, c.yaw);
    placeChair('ladder', { frame: ['wood', c.col], pad: ['fabric', c.seatCol] }, (g, key, col, lod) => add(g, k[key], mx, col, lod), { lite: ctx.lite, seed: i + 3 });
  });
  // Sofas and armchairs, likewise.
  SOFAS.forEach((s, i) => {
    const mx = T(s.x, s.y, s.z, s.yaw);
    placeSofa(s, { cover: ['fabric', s.col], frame: ['wood', 0x4f3423], metal: ['brass', 0xc9a24e] }, (g, key, col, lod) => add(g, k[key], mx, col, lod), { lite: ctx.lite, seed: i + 13 });
  });

  // ------------------------------------------------------------------ walls: brick core outside, plaster skins inside
  const skirtCol = 0xf3efe6;
  const skinOf = (room, p, side) => {
    // side 0: the low-t face, 1: the high-t face.
    const t = side ? p.t1 : p.t0, ym0 = p.y0, ym1 = p.y1, len = p.a1 - p.a0, am = (p.a0 + p.a1) / 2;
    const ry = p.axis === 'z' ? (side ? 0 : Math.PI) : (side ? Math.PI / 2 : -Math.PI / 2);
    const at = (y, off = 0) => {
      const tt = t + (side ? off : -off);
      return p.axis === 'z' ? [am, y, tt] : [tt, y, am];
    };
    for (const b of room.bands) {
      const lo = Math.max(ym0, room.y0 + b[0]), hi = Math.min(ym1, room.y0 + b[1]);
      if (hi - lo < 0.005) continue;
      const c = at((lo + hi) / 2);
      add(planeUV(len, hi - lo, 1), b[3] === 'metro' ? S.metro : S.plaster, T(c[0], c[1], c[2], ry), jit(b[2], 0.04, am * 3 + lo), 0);
    }
    if (room.plain) return;
    const along = (w, h, d, y, off, mat, col, lod) => {
      const c = at(y, off);
      add(new THREE.BoxGeometry(p.axis === 'z' ? w : d, h, p.axis === 'z' ? d : w), mat, T(c[0], c[1], c[2]), col, lod);
    };
    if (room.skirt !== false && ym0 <= room.y0 + 0.01) along(len, 0.12, 0.022, ym0 + 0.06, 0.011, k.paint, skirtCol, 1);
    if (room.rail && ym0 < room.y0 + room.rail && ym1 > room.y0 + room.rail) along(len, 0.05, 0.026, room.y0 + room.rail, 0.013, k.paint, skirtCol, 1);
    if (room.ceil && ym1 >= room.y1 - 0.01) along(len, 0.06, 0.05, ym1 - 0.03, 0.025, k.paint, skirtCol, 1);
    if (room.dadoPanels && ym0 <= room.y0 + 0.01 && len > 0.5) {
      for (let a = p.a0 + 0.3; a < p.a1 - 0.2; a += 0.55) {
        const c = at(room.y0 + 0.5, 0.004);
        const x = p.axis === 'z' ? a : c[0], z = p.axis === 'z' ? c[2] : a;
        add(new THREE.BoxGeometry(p.axis === 'z' ? 0.4 : 0.008, 0.62, p.axis === 'z' ? 0.008 : 0.4), k.paint, T(x, c[1], z), 0x91a58e, 2);
      }
    }
  };
  for (const p of WALL_PIECES) {
    if (p.gable) continue;
    const am = (p.a0 + p.a1) / 2, ym = (p.y0 + p.y1) / 2;
    const probe = (t) => (p.axis === 'z' ? roomAt(am, ym, t) : roomAt(t, ym, am));
    const lo = probe(p.t0 - 0.05), hi = probe(p.t1 + 0.05);
    const brickLo = p.ext === 'lo', brickHi = p.ext === 'hi';
    const t0 = p.t0 + (brickLo ? 0 : 0.003), t1 = p.t1 - (brickHi ? 0 : 0.003);
    const len = p.a1 - p.a0, h = p.y1 - p.y0, tm = (t0 + t1) / 2, th = t1 - t0;
    const mat = p.ext ? wk.brick : S.plaster;
    const geo = p.axis === 'z' ? boxUV(len, h, th, 1) : boxUV(th, h, len, 1);
    const mx = p.axis === 'z' ? T(am, ym, tm) : T(tm, ym, am);
    add(geo, mat, mx, p.ext ? jit(0xffffff, 0.04, am) : 0xe8dfca, 0);
    if (lo) skinOf(lo, p, 0);
    if (hi) skinOf(hi, p, 1);
  }

  // ------------------------------------------------------------------ floors and ceilings
  const floorPlane = (x0, x1, z0, z1, y, kind, col, down = false) => {
    const w = x1 - x0, d = z1 - z0;
    if (w < 0.01 || d < 0.01) return;
    const geo = planeUV(w, d, 1);
    const m = kind === 'tile' ? S.tile : kind === 'boards' ? k.wood : kind === 'carpet' ? k.fabric : S.plaster;
    add(geo, m, T((x0 + x1) / 2, y, (z0 + z1) / 2, 0, down ? Math.PI / 2 : -Math.PI / 2), col, 0);
  };
  for (const r of ROOMS) {
    if (r.floor && r.id !== 'cupboard') floorPlane(r.x0, r.x1, r.z0, r.z1, r.y0 + (r.y0 < 0 ? 0.01 : 0.002), r.floor[0], r.floor[1]);
    if (!r.ceil) continue;
    let rects = [[r.x0, r.x1, r.z0, r.z1]];
    if (r.id === 'hall') rects = cutRect(rects[0], [VOID.x0, VOID.x1, VOID.z0, VOID.z1]);
    if (r.y1 === c2 && r.id !== 'stairwell') for (const h of [[HATCH.x0, HATCH.x1, HATCH.z0, HATCH.z1]]) rects = rects.flatMap((q) => cutRect(q, h));
    for (const q of rects) floorPlane(q[0], q[1], q[2], q[3], r.y1, 'plaster', r.ceil, true);
  }
  // Ceiling of the stairwell void (first-floor ceiling level) and of the loft floor's boards are drawn by the loft parts.
  // The living room's bay floor.
  {
    const pts = [BAY.A, BAY.B, BAY.D, BAY.C].map(([x, z]) => [x, z]);
    add(polyGeo(pts, gf + 0.0, gf + 0.012), k.wood, null, 0x9a7450, 0);
  }
  // Loft floor edge strips are the joists: nothing more. Stair underside is the stair blocks.

  // ------------------------------------------------------------------ exterior: roof, eaves, gables
  const ov = M.overhang, hzr = (O_.z1 - O_.z0) / 2, half = hzr + ov, rise = (M.ridgeY - eave) * half / hzr, eaveY = M.ridgeY - rise;
  const rq = (q) => new THREE.Quaternion(q[0], q[1], q[2], q[3]);
  for (const r of ROOF_PIECES) {
    if (!r.slab) continue;
    const q = rq(r.q);
    add(boxUV(r.hx * 2, r.hy * 2, r.hz * 2, 1), wk.roof, matrix(r.x, r.y, r.z, q), 0xf2e6e0, 0);
    // Felt underlay seen from the loft.
    const off = new THREE.Vector3(0, -(r.hy + 0.003), 0).applyQuaternion(q);
    add(new THREE.BoxGeometry(r.hx * 2, 0.004, r.hz * 2), k.paper, matrix(r.x + off.x, r.y + off.y, r.z + off.z, q), 0x4a423a, 1);
  }
  const lenX = O_.x1 - O_.x0 + ov * 1.2, cx = (O_.x0 + O_.x1) / 2;
  for (const side of [-1, 1]) {
    const ez = side < 0 ? O_.z0 - ov : O_.z1 + ov;
    add(new THREE.BoxGeometry(lenX, 0.16, 0.025), k.paint, T(cx, eaveY - 0.06, ez), 0xf1ede4, 1);
    add(new THREE.CylinderGeometry(0.05, 0.05, lenX, 10, 1, true, 0, Math.PI), k.paint, T(cx, eaveY - 0.12, ez + side * 0.06, 0, 0, Math.PI / 2), 0x2d3033, 1);
    add(new THREE.BoxGeometry(lenX, 0.02, ov), k.paint, T(cx, eaveY - 0.13, side < 0 ? O_.z0 - ov / 2 : O_.z1 + ov / 2), 0xf1ede4, 1);
  }
  add(new THREE.CylinderGeometry(0.09, 0.09, O_.x1 - O_.x0 + 0.3, 8, 1, false, 0, Math.PI * 2), k.terracotta, T(cx, M.ridgeY + 0.03, M.ridgeZ, Math.PI / 2, 0, Math.PI / 2), 0xb5593f, 0);
  // Barge boards along the gable edges.
  for (const r of ROOF_PIECES) {
    if (!r.slab) continue;
    const q = rq(r.q);
    for (const sx of [-1, 1]) {
      const edge = sx * r.hx;
      const ex = r.x + edge, off = new THREE.Vector3(0, -0.07, 0).applyQuaternion(q);
      if (Math.abs(ex - O_.x0) > 0.4 && Math.abs(ex - O_.x1) > 0.4) continue;
      add(new THREE.BoxGeometry(0.03, 0.18, r.hz * 2), k.paint, matrix(ex + off.x, r.y + off.y, r.z + off.z, q), 0xf1ede4, 1);
    }
  }
  // Gable triangles (brick), with the round window cut through the left one.
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(O_.z0, eave); shape.lineTo(O_.z1, eave); shape.lineTo(M.ridgeZ, M.ridgeY); shape.lineTo(O_.z0, eave);
    if (sx < 0) { const h = new THREE.Path(); h.absarc(GABLE_WIN.z, GABLE_WIN.y, GABLE_WIN.r, 0, Math.PI * 2, true); shape.holes.push(h); }
    const g = new THREE.ExtrudeGeometry(shape, { depth: M.wall, bevelEnabled: false, curveSegments: 16 });
    g.rotateY(-Math.PI / 2);
    add(g, wk.brick, T(sx > 0 ? O_.x1 : M.x0, 0, 0), 0xffffff, 0);
  }
  // Plinth course and drainpipes.
  for (const [a0, a1] of [[O_.x0, -1.95], [-1.05, BAY.A[0]], [BAY.B[0], O_.x1]]) {
    add(new THREE.BoxGeometry(a1 - a0, 0.18, 0.02), wk.brick, T((a0 + a1) / 2, gf + 0.09, O_.z1 + 0.01), 0x8f8077, 1);
  }
  for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.18, O_.z1 - O_.z0), wk.brick, T(sz < 0 ? O_.x0 - 0.01 : O_.x1 + 0.01, gf + 0.09, (O_.z0 + O_.z1) / 2), 0x8f8077, 1);
  for (const x of [O_.x0 + 0.06, O_.x1 - 0.06]) add(new THREE.CylinderGeometry(0.03, 0.03, eaveY - 0.12 - gf, 8), k.paint, T(x, (eaveY - 0.12 + gf) / 2, O_.z1 + ov - 0.04), 0x2d3033, 1);
  // Lead flashing where the kitchen roof's front slope meets the back wall.
  {
    const kz = O_.z0, slope = Math.atan2(0.969, 1.93);
    add(new THREE.BoxGeometry(5.4, 0.012, 0.3), k.zinc, T(0, 2.075, kz - 0.1, 0, slope), 0x8d9296, 1);
    add(new THREE.BoxGeometry(5.4, 0.2, 0.012), k.zinc, T(0, 2.14, kz - 0.006), 0x8d9296, 1);
    for (let x = -2.6; x < 2.7; x += 0.9) add(new THREE.BoxGeometry(0.012, 0.012, 0.3), k.zinc, T(x, 2.083, kz - 0.1, 0, slope), 0x70757a, 2);
  }
  ctx.ground.shadowRect(O_.x0, O_.z0, O_.x1, O_.z1, (eave + M.ridgeY) / 2 - gf, 0.42);
  void FY; void STAIR_X1; void P1; void ARCH;
}

function chunk3(flat) {
  const out = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
  return out;
}
