import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM } from '../../../sim/layout.js';
import { BR } from '../../../sim/extras/zones/bedRight.js';
import { Batcher, T, boxUV, blobGeometry } from '../../batch.js';
import { registerExtraSound } from '../../../audio/extras.js';
import { wakeStir } from '../chimes.js';

// The right-hand border and lawn edge (see src/sim/extras/zones/bedRight.js), six pieces:
//  1 water butt on a concrete block stand, with a zinc watering can,
//  2 a wooden cold frame with a glass lid propped on a stick: the lid lifts in the rotor wash and clacks back,
//  3 a raised vegetable bed: lettuces, a row of carrots, three cabbages (the leaves sway in the wash),
//  4 a runner-bean wigwam (canes, twine, twining vines, trifoliate leaves, scarlet flowers, hanging pods),
//  5 a bird scarer on the wigwam: two foil pie tins on strings that swing, spin and clink in the wash,
//  6 a slatted compost bin with a heap (eggshells, a banana skin, spent tea bags) and a slipped lid.
// Everything static goes in the shared batch; own draw calls: the lid (wood, glass) and the tins (one mesh).

const fy = ROOM.floorY;

// ------------------------------------------------------------------------------------------ helpers
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const shade = (hex, lo = 0.88, hi = 1.1) => new THREE.Color(hex).multiplyScalar(lo + (hi - lo) * rnd());
const UP = new THREE.Vector3(0, 1, 0);

// A thin tapered cylinder between two points.
function rod(a, b, r0, r1 = r0, radial = 5) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, false);
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

// A tube along a curve whose radius follows rf(u).
function tube(curve, seg, radial, rf) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg), r = rf(i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// A leaf blade lying along +x from its base at the origin: length len, width wid, its outline shaped by k
// (small k: widest near the base) and sharp, tip lifted by bend (fraction of the length; negative droops),
// edges cupped up by cup and frilled by ruf.
function leafGeo(len, wid, o = {}) {
  const { nu = 6, nv = 4, bend = 0, cup = 0, ruf = 0, k = 0.75, sharp = 0.7, s = 0, rib = false } = o;
  const pos = [], uv = [], idx = [];
  const cols = rib ? 1 : nv;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const hw = rib ? 0.0055 * (1 - 0.6 * u) : Math.max(0.0035, wid / 2 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, k))), sharp));
    for (let j = 0; j <= cols; j++) {
      const v = -1 + 2 * j / cols;
      let y = bend * len * u * u + (rib ? 0.0012 : cup * wid * v * v * (0.25 + 0.75 * u));
      if (!rib && ruf) y += ruf * wid * Math.sin(u * 16 + s + v * 4) * Math.sin(v * 9 + s * 1.7 + u * 5) * Math.pow(Math.abs(v), 1.4);
      pos.push(u * len, y, v * hw);
      uv.push(u * len, v * hw + 0.5);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A carrot frond: a rachis arching out and up with pairs of feathery leaflets.
function frondGeo(len, nodes, twin) {
  const pos = [], idx = [];
  const P = (u) => [len * 0.5 * u, len * (0.95 * u - 0.5 * u * u), 0];
  const quad = (a, b, c, d) => { const n = pos.length / 3; pos.push(...a, ...b, ...c, ...d); idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3); };
  const tri = (a, b, c) => { const n = pos.length / 3; pos.push(...a, ...b, ...c); idx.push(n, n + 1, n + 2); };
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = P(i / N), b = P((i + 1) / N), w = 0.0016 * (1 - i / N * 0.6);
    quad([a[0], a[1], -w], [a[0], a[1], w], [b[0], b[1], -w], [b[0], b[1], w]);
  }
  for (let k = 1; k <= nodes; k++) {
    const u = 0.22 + 0.74 * k / nodes, c = P(u);
    const pl = 0.05 * (1.0 - 0.7 * u);
    for (const sd of [-1, 1]) {
      const n = twin ? 3 : 2;
      for (let m = 0; m < n; m++) {
        const ang = (m - (n - 1) / 2) * 0.55, ca = Math.cos(ang), sa = Math.sin(ang);
        const dx = 0.25 * ca + 0.35 * sa, dz = sd * 0.9 * ca, dy = 0.15;
        const lx = c[0] + dx * pl, ly = c[1] + dy * pl, lz = sd * dz * pl * 0 + dz * pl;
        const wv = pl * 0.16;
        tri([c[0], c[1], c[2]], [lx, ly, lz], [(c[0] + lx) / 2 + 0, (c[1] + ly) / 2 + wv * 0.5, (c[2] + lz) / 2 + wv * 0.4]);
        tri([c[0], c[1], c[2]], [(c[0] + lx) / 2, (c[1] + ly) / 2 - wv * 0.2, (c[2] + lz) / 2 - wv * 0.8], [lx, ly, lz]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Lathe from a flat list [r, y, r, y ...].
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.reduce((a, v, i) => { if (i % 2 === 0) a.push(new THREE.Vector2(Math.max(0.0001, v), pts[i + 1])); return a; }, []), seg);

// A bed of soil: a grid with furrows/ridges (given as x offsets) and a little noise.
function soilGrid(w, d, nx, nz, ridges, seedv, amp = 0.004) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = -w / 2 + w * i / nx, z = -d / 2 + d * j / nz;
    let y = amp * (Math.sin(x * 61 + seedv) * Math.sin(z * 47 + seedv * 2) + 0.5 * Math.sin(x * 130 + z * 90 + seedv));
    for (const rx of ridges) y += 0.012 * Math.exp(-Math.pow((x - rx) / 0.045, 2));
    pos.push(x, y, z); uv.push(x * 2.5, z * 2.5);
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = i * (nz + 1) + j, b = a + 1, c = a + nz + 1, e = c + 1;
    idx.push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function build(ctx) {
  const { kit, lite, batch } = ctx;
  const add = (geo, mat, x, y, z, color, o = {}) => batch.add(geo, mat, T(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1), color, { cast: o.cast !== false, receive: true });
  const addM = (geo, mat, m, color, cast = true) => batch.add(geo, mat, m, color, { cast, receive: true });
  const ID = () => new THREE.Matrix4();
  const wood = kit.weathered, W = BR;
  const vegMat = ctx.sway(kit.leaf, { baseY: fy + 0.12, height: 0.26, amount: 1.1 });
  const beanMat = ctx.sway(kit.leaf, { baseY: fy, height: 0.95, amount: 0.9 });
  const flowMat = ctx.sway(kit.petal, { baseY: fy, height: 0.95, amount: 0.9 });
  const weeds = []; void weeds;

  // ======================================================================================= 1 water butt
  {
    const S = W.stand, B = W.butt, by = fy + S.h;
    // Stand: two layers of hollow concrete blocks, crossed.
    const blockG = boxUV(0.44, 0.1, 0.215, 1);
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 2; i++) {
        const off = (i - 0.5) * 0.2175, y = fy + 0.05 + layer * 0.1;
        const m = layer === 0 ? T(S.x, y, S.z + off, 0.0) : T(S.x + off, y, S.z, Math.PI / 2 + 0.012 * (i ? 1 : -1));
        addM(blockG, kit.stone, m, shade(0x9b9a95, 0.9, 1.05));
      }
    }
    // Hollows in the block ends that show: layer 0 towards the lawn, layer 1 towards the patio and the bed.
    for (const off of [-0.1088, 0.1088]) for (const hz of [-0.048, 0.048]) {
      addM(boxUV(0.004, 0.05, 0.05, 1), kit.rubber, T(S.x - 0.2205, fy + 0.05, S.z + off + hz), 0x23211f, false);
      for (const sd of [-1, 1]) addM(boxUV(0.05, 0.05, 0.004, 1), kit.rubber, T(S.x + off + hz, fy + 0.15, S.z + sd * 0.2205), 0x23211f, false);
    }
    // The butt: a lathe in dark green plastic with three moulded ribs.
    const prof = [0, 0, 0.19, 0, 0.205, 0.006, 0.214, 0.02];
    for (let y = 0.04; y <= 0.70; y += 0.02) {
      let r = 0.214 + 0.004 * (y / 0.7);
      for (const ry of [0.17, 0.38, 0.59]) r += 0.011 * Math.exp(-Math.pow((y - ry) / 0.018, 2));
      prof.push(r, y);
    }
    prof.push(0.216, 0.715, 0.21, 0.735, 0.2, 0.74, 0.19, 0.735);
    const buttG = lathe(prof, lite ? 28 : 44);
    add(buttG, kit.paint, B.x, by, B.z, shade(0x2d5035, 0.95, 1.02));
    // Lid: slightly domed with a screw cap and a moulded handle.
    const lidG = lathe([0.19, -0.002, 0.214, -0.012, 0.222, -0.004, 0.222, 0.02, 0.205, 0.022, 0.16, 0.03, 0.09, 0.044, 0.05, 0.052, 0, 0.056], lite ? 28 : 44);
    add(lidG, kit.paint, B.x, by + 0.74, B.z, 0x376040);
    add(new THREE.CylinderGeometry(0.052, 0.056, 0.026, 20), kit.paint, B.x + 0.02, by + 0.74 + 0.064, B.z, 0x2b4a31);
    addM(new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI), kit.paint, T(B.x - 0.12, by + 0.74 + 0.046, B.z, Math.PI / 2, 0, 0), 0x376040);
    // Tap on the lawn side: body, lever and a drip stain on the stand.
    const ty = by + 0.1;
    addM(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10), kit.brass, T(B.x - B.r - 0.02, ty, B.z, 0, 0, Math.PI / 2), 0xc9a252, true);
    addM(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), kit.brass, T(B.x - B.r + 0.004, ty, B.z, 0, 0, Math.PI / 2), 0xb08c3e, false);
    addM(new THREE.CylinderGeometry(0.012, 0.012, 0.034, 10), kit.brass, T(B.x - B.r - 0.045, ty - 0.016, B.z), 0xc9a252, true);
    addM(new THREE.CylinderGeometry(0.0055, 0.0055, 0.07, 6), kit.brass, T(B.x - B.r - 0.032, ty + 0.03, B.z, 0, 0, 0.0), 0xc9a252, false);
    addM(boxUV(0.07, 0.01, 0.014, 1), kit.brass, T(B.x - B.r - 0.032, ty + 0.067, B.z, 0, 0, 0.0), 0xb8944a, false);
    // Overflow stub near the top.
    addM(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), kit.paint, T(B.x, by + 0.62, B.z + B.r + 0.015, 0, Math.PI / 2, 0), 0x1d3024, false);
    // A paving slab under the tap and the can, and the damp patch of soil round the stand.
    addM(boxUV(0.5, 0.03, 0.7, 1), kit.stone, T(B.x - 0.04, fy + 0.015, B.z - 0.15, 0.04), 0xa09d96);
  }

  // ======================================================================================= watering can
  {
    const c = W.can, y0 = fy + 0.03;
    const body = lathe([0, 0, 0.08, 0, 0.086, 0.006, 0.086, 0.02, 0.083, 0.12, 0.08, 0.215, 0.088, 0.22, 0.088, 0.228, 0.078, 0.232, 0.0, 0.232], 26);
    const z = kit.zinc;
    const yaw = c.yaw;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    // local frame: spout towards -x_local; convert (lx, lz) to world
    const L = (lx, lz) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
    add(body, z, c.x, y0, c.z, 0xb4bcc1);
    // Rolled bands and seam.
    add(new THREE.TorusGeometry(0.0865, 0.004, 5, 24), z, c.x, y0 + 0.02, c.z, 0x9aa3a8, { rx: Math.PI / 2, cast: false });
    add(new THREE.TorusGeometry(0.0885, 0.004, 5, 24), z, c.x, y0 + 0.222, c.z, 0x9aa3a8, { rx: Math.PI / 2, cast: false });
    // Filler neck.
    const [fx, fz] = L(0.03, 0);
    add(new THREE.CylinderGeometry(0.036, 0.04, 0.03, 18, 1, true), z, fx, y0 + 0.246, fz, 0xa8b1b6, { cast: false });
    add(new THREE.CircleGeometry(0.034, 14), kit.rubber, fx, y0 + 0.2325, fz, 0x25282a, { rx: -Math.PI / 2, cast: false });
    // Long spout rising to the rose.
    const p0 = new THREE.Vector3(...[L(-0.075, 0)[0], y0 + 0.04, L(-0.075, 0)[1]]);
    const p1 = new THREE.Vector3(L(-0.2, 0)[0], y0 + 0.17, L(-0.2, 0)[1]);
    const p2 = new THREE.Vector3(L(-0.285, 0)[0], y0 + 0.27, L(-0.285, 0)[1]);
    const sp = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    addM(tube(sp, 12, 10, (u) => 0.021 - 0.011 * u), z, ID(), 0xb0b8bd, true);
    // Rose: a short cone and a dished face, pointing along the spout's end.
    const dir = sp.getTangent(1).normalize();
    const rose = new THREE.Matrix4().compose(p2.clone().addScaledVector(dir, 0.012), new THREE.Quaternion().setFromUnitVectors(UP, dir), new THREE.Vector3(1, 1, 1));
    addM(new THREE.CylinderGeometry(0.04, 0.012, 0.034, 18), z, rose, 0xa9b1b6, true);
    addM(new THREE.CircleGeometry(0.036, 18).rotateX(-Math.PI / 2).translate(0, 0.018, 0), kit.rubber, rose, 0x32373a, false);
    // Perforations on the rose face.
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, r = i < 6 ? 0.016 : 0.028;
      const hm = rose.clone().multiply(new THREE.Matrix4().makeTranslation(Math.cos(a * (i < 6 ? 1 : 1)) * r, 0.0185, Math.sin(a) * r));
      addM(new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 5), kit.steel, hm, 0x15181a, false);
    }
    // Handles: a loop on the back, a bar over the top.
    const h0 = new THREE.CatmullRomCurve3([new THREE.Vector3(...[L(0.082, 0)[0], y0 + 0.04, L(0.082, 0)[1]]), new THREE.Vector3(...[L(0.15, 0)[0], y0 + 0.1, L(0.15, 0)[1]]), new THREE.Vector3(...[L(0.15, 0)[0], y0 + 0.19, L(0.15, 0)[1]]), new THREE.Vector3(...[L(0.075, 0)[0], y0 + 0.228, L(0.075, 0)[1]])]);
    addM(tube(h0, 14, 6, () => 0.0065), z, ID(), 0x9ba4a9, true);
    const h1 = new THREE.CatmullRomCurve3([new THREE.Vector3(...[L(0.075, 0)[0], y0 + 0.228, L(0.075, 0)[1]]), new THREE.Vector3(...[L(0.0, 0)[0], y0 + 0.31, L(0.0, 0)[1]]), new THREE.Vector3(...[L(-0.1, 0)[0], y0 + 0.26, L(-0.1, 0)[1]]), new THREE.Vector3(...[L(-0.085, 0)[0], y0 + 0.2, L(-0.085, 0)[1]])]);
    addM(tube(h1, 14, 6, () => 0.0058), z, ID(), 0x9ba4a9, true);
    // A dent and a streak of rust at the base.
    add(new THREE.CylinderGeometry(0.0865, 0.0865, 0.012, 24, 1, true), kit.iron, c.x, y0 + 0.007, c.z, 0x8a5a3a, { cast: false });
  }

  // ======================================================================================= cold frame
  const F = W.frame, fcz = (F.z0 + F.z1) / 2, fW = F.z1 - F.z0, fD = F.x1 - F.x0;
  const lidHingeY = fy + F.back + 0.012;
  {
    const wd = 0.02;
    // Side boards stepped to the slope, as extrusions; front and back boards.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(fD, 0); shape.lineTo(fD, F.back); shape.lineTo(0, F.front); shape.closePath();
    const sideG = new THREE.ExtrudeGeometry(shape, { depth: wd, bevelEnabled: false });
    // Planks on the side boards read better than a plain slab: add two grooves.
    for (const [z, sd] of [[F.z0, 1], [F.z1 - wd, 1]]) {
      addM(sideG, wood, T(F.x0, fy, z), shade(0x8d7b63, 0.9, 1.05));
      void sd;
      for (const gy of [0.07, 0.14]) {
        const hh = F.front + (F.back - F.front) * 0.5;
        void hh;
        addM(boxUV(fD, 0.004, 0.004, 1), kit.iron, T(F.x0 + fD / 2, fy + gy, z === F.z0 ? z - 0.001 : z + wd + 0.001), 0x4a3f33, false);
      }
    }
    addM(boxUV(wd, F.back, fW, 1), wood, T(F.x1 - wd / 2, fy + F.back / 2, fcz), shade(0x93816a, 0.92, 1.0));
    addM(boxUV(wd, F.front, fW, 1), wood, T(F.x0 + wd / 2, fy + F.front / 2, fcz), shade(0x927f68, 0.92, 1.0));
    // Corner posts inside.
    for (const [x, h] of [[F.x0 + wd + 0.016, F.front], [F.x1 - wd - 0.016, F.back]]) for (const z of [F.z0 + wd + 0.016, F.z1 - wd - 0.016]) {
      addM(boxUV(0.032, h, 0.032, 1), wood, T(x, fy + h / 2, z), 0x806e58, false);
    }
    // Hinge knuckles along the back top, two screws on each side board.
    for (const z of [fcz - fW * 0.36, fcz + fW * 0.36]) {
      addM(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8), kit.steel, T(F.x1 + 0.004, lidHingeY - 0.004, z, 0, Math.PI / 2, 0), 0x777a7c, false);
      addM(boxUV(0.05, 0.002, 0.028, 1), kit.steel, T(F.x1 - 0.026, F.back + fy + 0.001, z), 0x6e7173, false);
    }
    // Soil inside, with rows of seedlings.
    const sy = fy + 0.115;
    addM(soilGrid(fD - 0.06, fW - 0.06, 14, 24, [-0.12, 0, 0.12], 3, 0.003), kit.soil, T(F.x0 + fD / 2, sy, fcz), 0x3b2c21, false);
  }
  // Seedlings in the frame.
  {
    const sy = fy + 0.118, small = leafGeo(0.05, 0.034, { nu: 4, nv: 2, k: 0.55, cup: 0.12, bend: -0.1 });
    const rows = lite ? [3.42, 3.6] : [3.4, 3.52, 3.64];
    for (const rx of rows) for (let z = F.z0 + 0.1; z < F.z1 - 0.08; z += 0.12) {
      const sc = rr(0.7, 1.05), n = lite ? 4 : 6;
      for (let i = 0; i < n; i++) add(small, kit.leaf, rx + rr(-0.01, 0.01), sy, z + rr(-0.012, 0.012), shade(rnd() < 0.2 ? 0x8bb04a : 0x76a23f, 0.85, 1.12), { ry: i * 2.4 + rr(0, 1), rz: rr(0.2, 0.95), sx: sc, sy: sc, sz: sc, cast: false });
    }
  }

  // The lid: a separate group (it moves). A wooden frame round a glass pane, hinged at the back top edge.
  const lid = new THREE.Group();
  {
    const L = F.lidL, w = fW + 0.04, lb = new Batcher();
    const lw = kit.wood;
    lb.add(boxUV(0.045, 0.024, w, 1), lw, T(-0.0225, 0.012, 0), 0xa8947a, { cast: false });
    lb.add(boxUV(0.045, 0.024, w, 1), lw, T(-L + 0.0225, 0.012, 0), 0xa8947a, { cast: false });
    for (const z of [-w / 2 + 0.02, w / 2 - 0.02]) lb.add(boxUV(L - 0.09, 0.024, 0.04, 1), lw, T(-L / 2, 0.012, z), 0xa38f75, { cast: false });
    lb.add(boxUV(L - 0.09, 0.014, 0.022, 1), lw, T(-L / 2, 0.009, 0), 0xa38f75, { cast: false });
    lb.add(boxUV(0.022, 0.014, w - 0.08, 1), lw, T(-L / 2, 0.009, 0), 0xa38f75, { cast: false });
    lb.add(boxUV(L - 0.07, 0.004, w - 0.07, 1), kit.glass, T(-L / 2, 0.016, 0), 0xa9d4cb, { cast: false, receive: false });
    // Mitred corner screws.
    for (const [x, z] of [[-0.022, -w / 2 + 0.02], [-0.022, w / 2 - 0.02], [-L + 0.022, -w / 2 + 0.02], [-L + 0.022, w / 2 - 0.02]]) lb.add(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 6), kit.steel, T(x, 0.025, z), 0x6e7173, { cast: false });
    // A bit of moss on the lid edge and a pair of leaves stuck on the glass.
    lb.add(blobGeometry(0.014, 1, 4, 0.3), kit.leaf, T(-L + 0.03, 0.026, w / 2 - 0.05, 0, 0, 0, 1.5, 0.35, 1), 0x4f6e32, { cast: false });
    lb.add(leafGeo(0.04, 0.02, { nu: 4, nv: 2 }), kit.leaf, T(-0.22, 0.019, -0.1, 0.6), 0x8a6a2a, { cast: false });
    lb.build(lid);
  }
  // The prop stick: a lath standing on the front board under the lid; knocked out, it falls into the frame.
  const stickBase = new THREE.Vector3(F.x0 + 0.05, fy + F.front, F.z1 - 0.1);
  const stickLen = (lidHingeY + ((F.x1 - stickBase.x) / Math.cos(F.alpha0)) * Math.sin(F.alpha0) - 0.011) - stickBase.y;
  const stickMat = kit.wood.clone(); stickMat.color.set(0x9b8467);
  const stick = new THREE.Mesh(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, stickLen, 0), 0.0095, 0.008, 4), stickMat);
  stick.position.copy(stickBase); stick.castShadow = true; stick.receiveShadow = true;
  ctx.scene.add(stick);
  lid.position.set(F.x1, lidHingeY, fcz);
  lid.rotation.z = -F.alpha0;
  ctx.scene.add(lid);

  // ======================================================================================= vegetable bed
  const B = W.bed, bcx = (B.x0 + B.x1) / 2, bcz = (B.z0 + B.z1) / 2, soilY = fy + B.soil;
  {
    // Sleeper boards, two high, with corner posts.
    const bl = B.z1 - B.z0, bw = B.x1 - B.x0, th = 0.04, hh = B.h / 2;
    for (let layer = 0; layer < 2; layer++) {
      const y = fy + hh * (layer + 0.5);
      for (const x of [B.x0 - th / 2, B.x1 + th / 2]) addM(boxUV(th, hh - 0.003, bl + th * 2, 1), wood, T(x, y, bcz), shade(0x8a7860, 0.86, 1.05));
      for (const z of [B.z0 - th / 2, B.z1 + th / 2]) addM(boxUV(bw, hh - 0.003, th, 1), wood, T(bcx, y, z), shade(0x8a7860, 0.86, 1.05));
    }
    for (const x of [B.x0 - th / 2, B.x1 + th / 2]) for (const z of [B.z0 - th / 2, B.z1 + th / 2]) addM(boxUV(0.05, B.h + 0.03, 0.05, 1), wood, T(x, fy + (B.h + 0.03) / 2 - 0.005, z), 0x74634e);
    // The soil, ridged along the rows, with scattered clods.
    const ridges = [2.68 - bcx, 2.86 - bcx, 3.06 - bcx];
    addM(soilGrid(bw, bl, lite ? 14 : 22, lite ? 30 : 52, ridges, 1, 0.005), kit.soil, T(bcx, soilY - 0.004, bcz), 0x3c2d22, false);
    for (let i = 0; i < (lite ? 20 : 45); i++) add(blobGeometry(rr(0.007, 0.016), 1, i, 0.25), kit.soil, rr(B.x0 + 0.01, B.x1 - 0.01), soilY + 0.002, rr(B.z0 + 0.01, B.z1 - 0.01), shade(0x3e3024, 0.8, 1.25), { sy: 0.7, cast: false });
    // Straw mulch scraps.
    for (let i = 0; i < (lite ? 10 : 30); i++) add(new THREE.CylinderGeometry(0.0016, 0.0016, rr(0.03, 0.06), 3), kit.paper, rr(B.x0 + 0.02, B.x1 - 0.02), soilY + 0.006, rr(B.z0 + 0.02, B.z1 - 0.02), shade(0xc9b172, 0.85, 1.1), { ry: rr(0, 3), rz: Math.PI / 2, cast: false });
  }

  // Lettuces along the left row (x 2.70), a mix of green cos-type and red oak-leaf.
  const lettuce = (x, y, z, color, sc = 1, n = 12) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), len = (0.1 - 0.045 * t) * sc;
      const g = leafGeo(len, len * 0.92, { nu: 7, nv: 5, k: 0.6, sharp: 0.6, cup: 0.3 - 0.1 * t, bend: -0.2 + 0.55 * t, ruf: 0.1 * (1 - t * 0.5), s: i * 1.3 });
      add(g, vegMat, x, y + 0.008 * sc, z, shade(color, 0.82, 1.18), { ry: i * 2.4 + rr(-0.2, 0.2), rz: 0.18 + t * 1.15 + rr(-0.05, 0.05), cast: i < 4 });
    }
    add(blobGeometry(0.03 * sc, 1, 3, 0.2), vegMat, x, y + 0.03 * sc, z, shade(color, 1.0, 1.3), { sy: 0.9, cast: false });
  };
  {
    const cols = [0x78a447, 0x8cb04e, 0x86392f, 0x6b9a3f, 0x93402e, 0x80ab4a];
    let k = 0;
    for (let z = -2.62; z > -3.68; z -= 0.178) lettuce(2.7 + rr(-0.01, 0.01), soilY, z + rr(-0.01, 0.01), cols[k++ % cols.length], rr(0.85, 1.1), lite ? 9 : 12);
  }

  // Carrots: a feathery row, with the orange shoulders just showing.
  {
    const fronds = [frondGeo(0.17, 7, !lite), frondGeo(0.2, 7, !lite), frondGeo(0.15, 6, !lite)];
    const nF = lite ? 4 : 5;
    for (let z = -2.55; z > -3.7; z -= 0.088) {
      const cx = 2.865 + rr(-0.015, 0.015), cz = z + rr(-0.01, 0.01);
      for (let i = 0; i < nF; i++) add(fronds[(i + Math.floor(rnd() * 3)) % 3], vegMat, cx, soilY + 0.003, cz, shade(0x62a03d, 0.8, 1.18), { ry: i * (Math.PI * 2 / nF) + rr(-0.3, 0.3), rz: rr(-0.1, 0.25), cast: false, sx: rr(0.85, 1.1), sy: rr(0.85, 1.15), sz: 1 });
      add(new THREE.CylinderGeometry(0.013, 0.006, 0.014, 8), kit.paint, cx, soilY, cz, shade(0xd9732a, 0.9, 1.1), { cast: false });
    }
    // Two pulled carrots and a trowel's worth of soil lying on the bed's edge board.
    for (let i = 0; i < 3; i++) {
      const base = new THREE.Vector3(2.95 + i * 0.012, fy + B.h + 0.011, -2.38 + i * 0.015);
      const tip = new THREE.Vector3(base.x - 0.01 - i * 0.004, fy + B.h + 0.008, base.z - 0.13 + i * 0.01);
      addM(rod(base, tip, 0.012, 0.0015, 8), kit.paint, ID(), shade(0xd8702a, 0.9, 1.12), false);
      for (let r = 0; r < 4; r++) {
        const q = base.clone().lerp(tip, 0.2 + r * 0.17);
        addM(new THREE.TorusGeometry(0.0095 - r * 0.0015, 0.0007, 4, 8), kit.paint, new THREE.Matrix4().makeTranslation(q.x, q.y, q.z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), 0xa5551f, false);
      }
      for (let f = 0; f < 3; f++) add(fronds[f], vegMat, base.x, base.y + 0.003, base.z + 0.01, 0x6aa341, { ry: Math.PI + (f - 1) * 0.5 + i * 0.3, rz: 0.2, cast: false, sx: 0.7, sy: 0.6 });
    }
  }

  // Cabbages: heads wrapped in curling leaves, big blue-green outer leaves with pale ribs.
  const cabbage = (x, z, sc, hue) => {
    const y = soilY;
    add(blobGeometry(0.058 * sc, 2, x * 10, 0.05), vegMat, x, y + 0.058 * sc, z, shade(hue === 0 ? 0x6f9a7a : 0x6a9274, 0.92, 1.08), { sy: 0.95 });
    const nOut = lite ? 7 : 9, nWrap = lite ? 6 : 10;
    // Wrapper leaves: broad, rounded and cupped, folded over the head in two overlapping tiers.
    for (let i = 0; i < nWrap; i++) {
      const tier = i % 2, L = (0.098 + 0.014 * tier) * sc;
      const bd = 0.2 + 0.25 * tier;
      const g = leafGeo(L, L * 1.35, { nu: 8, nv: 6, k: 0.85, sharp: 0.28, cup: 0.55, bend: bd, ruf: 0.012, s: i });
      const ang = i * (Math.PI * 2 / nWrap) + tier * 0.4 + rr(-0.12, 0.12);
      const px = x + Math.cos(ang) * 0.028 * sc, pz = z - Math.sin(ang) * 0.028 * sc;
      const el = 1.02 + 0.18 * tier + rr(-0.05, 0.05);
      add(g, vegMat, px, y + 0.008 * sc, pz, shade(0x62907a, 0.88, 1.12), { ry: ang, rz: el, cast: false });
      if (!lite) add(leafGeo(L * 0.95, 0, { rib: true, nu: 7, bend: bd }), vegMat, px, y + 0.008 * sc, pz, shade(0xbdd0b0, 0.92, 1.05), { ry: ang, rz: el, cast: false });
    }
    for (let i = 0; i < nOut; i++) {
      const L = rr(0.15, 0.185) * sc, wid = L * rr(1.0, 1.15), s = i * 1.7;
      const ang = i * (Math.PI * 2 / nOut) + rr(-0.15, 0.15), el = 0.12 + 0.34 * (i % 3) / 2 + rr(0, 0.1);
      const bd = -0.55 + (i % 3) * 0.12;
      const g = leafGeo(L, wid, { nu: lite ? 8 : 11, nv: lite ? 6 : 8, k: 0.7, sharp: 0.3, cup: 0.22, bend: bd, ruf: 0.05, s });
      const col = shade(hue === 0 ? 0x4f7f62 : 0x5a8467, 0.82, 1.12);
      add(g, vegMat, x + Math.cos(ang) * 0.02 * sc, y + 0.015 * sc, z - Math.sin(ang) * 0.02 * sc, col, { ry: ang, rz: el, cast: i % 2 === 0 });
      add(leafGeo(L * 0.92, wid, { rib: true, nu: 8, bend: bd }), vegMat, x + Math.cos(ang) * 0.02 * sc, y + 0.015 * sc, z - Math.sin(ang) * 0.02 * sc, shade(0xb5c9a4, 0.9, 1.05), { ry: ang, rz: el, cast: false });
    }
  };
  cabbage(3.06, -2.78, 1.0, 0);
  cabbage(3.06, -3.12, 0.92, 1);
  cabbage(3.06, -3.47, 1.05, 0);

  // Plant labels at the row ends (white plastic on a short stick) and a cane with a twine ring.
  for (const [x, z, h] of [[2.7, -2.5, 0.075], [2.865, -2.5, 0.07], [3.06, -2.52, 0.08]]) {
    addM(boxUV(0.004, 0.095, 0.004, 1), kit.paper, T(x + 0.05, soilY + 0.04, z), 0xb59b6a, false);
    addM(boxUV(0.05, h, 0.002, 1), kit.paper, T(x + 0.05, soilY + 0.1, z, 0.25), 0xe9e7da, false);
  }

  // ======================================================================================= bean wigwam
  const Wg = W.wig, apexY = fy + Wg.h;
  const canes = [];
  {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + 0.2;
      const b = new THREE.Vector3(Wg.x + Math.cos(a) * Wg.r, fy, Wg.z + Math.sin(a) * Wg.r);
      const t = new THREE.Vector3(Wg.x + rr(-0.006, 0.006), apexY, Wg.z + rr(-0.006, 0.006));
      const d = new THREE.Vector3().subVectors(t, b).normalize();
      canes.push({ b, t, d, a });
      // Sticks past the apex, then bamboo with darker nodes.
      const tipP = t.clone().addScaledVector(d, 0.07);
      addM(rod(b.clone().setY(fy - 0.02), tipP, 0.0075, 0.0055, 6), kit.wicker, ID(), shade(0xb59d62, 0.85, 1.12), true);
      for (let k = 1; k <= 5; k++) {
        const p = b.clone().lerp(t, k / 6 + rr(-0.03, 0.03));
        addM(new THREE.TorusGeometry(0.0072 - k * 0.0003, 0.0016, 4, 8), kit.wicker, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d), new THREE.Vector3(1, 1, 1)), 0x7a6a3c, false);
      }
    }
    // Twine: tight turns at the apex and a hoop round the middle.
    for (let k = 0; k < 4; k++) addM(new THREE.TorusGeometry(0.0125 + k * 0.0005, 0.0026, 5, 14), kit.fabric, T(Wg.x, apexY - 0.002 - k * 0.0065, Wg.z, 0, Math.PI / 2, 0), shade(0x9c7d4a, 0.9, 1.1), false);
    const hy = fy + 0.5, hr = Wg.r * (1 - 0.5 / Wg.h) * 0 + Wg.r * (1 - (0.5 / Wg.h)) ;
    void hy; void hr;
    // The scarer's pole: a cane lashed on and standing above the apex, with a cross cane.
    addM(rod(new THREE.Vector3(Wg.x + 0.006, apexY - 0.03, Wg.z), new THREE.Vector3(Wg.x + 0.003, apexY + 0.23, Wg.z), 0.0062, 0.0055, 6), kit.wicker, ID(), 0xb9a169, true);
    addM(rod(new THREE.Vector3(Wg.x + 0.003, apexY + 0.2, Wg.z - 0.16), new THREE.Vector3(Wg.x + 0.003, apexY + 0.2, Wg.z + 0.16), 0.0052, 0.0052, 6), kit.wicker, ID(), 0xb39b62, true);
    for (const dy of [0, 0.006]) addM(new THREE.TorusGeometry(0.0085, 0.0021, 5, 12), kit.fabric, T(Wg.x + 0.003, apexY + 0.2 - 0.0 + dy, Wg.z, 0, 0, 0), 0x9c7d4a, false);
    for (const sd of [-1, 1]) addM(new THREE.TorusGeometry(0.0062, 0.0015, 5, 10), kit.fabric, T(Wg.x + 0.003, apexY + 0.2, Wg.z + sd * 0.14, 0, Math.PI / 2, 0), 0x9c7d4a, false);
  }
  // Soil mound and a ring of dark earth at the cane feet, with a few weeds.
  addM(new THREE.CylinderGeometry(Wg.r + 0.06, Wg.r + 0.09, 0.012, 24), kit.soil, T(Wg.x, fy + 0.006, Wg.z), 0x3c2d22, false);
  // Vines twining up the canes.
  {
    const leaflet = [leafGeo(0.07, 0.062, { nu: 4, nv: 2, k: 0.5, sharp: 0.8, cup: 0.18, bend: -0.25 }), leafGeo(0.056, 0.05, { nu: 4, nv: 2, k: 0.5, sharp: 0.8, cup: 0.18, bend: -0.2 })];
    const flowerG = blobGeometry(0.0048, 1, 2, 0.25), podCache = [];
    for (let i = 0; i < 3; i++) {
      const len = rr(0.1, 0.16);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, -len * 0.55, 0.004), new THREE.Vector3(0.026, -len, 0.008));
      podCache.push(tube(curve, 7, 5, (u) => 0.0052 * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * u)), 0.5) * (1 - 0.1 * u) + 0.0004));
    }
    const growth = [0.97, 0.86, 0.93, 0.78, 0.95, 0.88];
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    canes.forEach((c, ci) => {
      const g = growth[ci], turns = 6.5, pts = [];
      e1.set(-c.d.z, 0, c.d.x).normalize(); e2.crossVectors(c.d, e1);
      const ph0 = rr(0, 6.28), dir = ci % 2 ? 1 : -1;
      const at = (t) => {
        const ph = ph0 + dir * t * turns * Math.PI * 2, rho = 0.011;
        return new THREE.Vector3().lerpVectors(c.b, c.t, t).addScaledVector(e1, Math.cos(ph) * rho).addScaledVector(e2, Math.sin(ph) * rho);
      };
      for (let k = 0; k <= 36; k++) pts.push(at(0.03 + (g - 0.03) * k / 36));
      addM(tube(new THREE.CatmullRomCurve3(pts), 36, 4, (u) => 0.0032 - 0.0015 * u), beanMat, ID(), shade(0x6d8c3c, 0.8, 1.1), false);
      // Leaves at nodes every few cm, alternating sides; smaller towards the growing tip.
      let side = ci;
      for (let t = 0.1; t < g; t += lite ? 0.07 : 0.048) {
        side++;
        const P = at(t), out = new THREE.Vector3(P.x - Wg.x, 0, P.z - Wg.z).normalize();
        const sc = (1.05 - 0.55 * t / g) * rr(0.85, 1.15);
        const yaw = Math.atan2(-out.z, out.x) + (side % 2 ? 0.7 : -0.7) + rr(-0.3, 0.3);
        const ca = Math.cos(yaw), sa = Math.sin(yaw), pl = 0.04 * sc;
        const Q = new THREE.Vector3(P.x + ca * pl, P.y + 0.012, P.z - sa * pl);
        addM(rod(P, Q, 0.0013, 0.001, 3), beanMat, ID(), 0x6d8c3c, false);
        for (let l = 0; l < 3; l++) {
          const off = (l - 1) * 0.62;
          const jy = yaw + off * (l === 1 ? 0 : 1) * 0.8;
          const bx = Q.x + (l === 1 ? 0 : -sa * -off * 0.01), bz = Q.z + (l === 1 ? 0 : -ca * off * 0.01);
          add(leaflet[l === 1 ? 0 : 1], beanMat, bx, Q.y, bz, shade(0x3e7a2b, 0.75, 1.14), { ry: jy, rz: rr(-0.25, 0.1), sx: sc, sy: sc, sz: sc, cast: false });
        }
      }
      // Scarlet flower clusters on short stalks, and pods hanging below.
      if (ci !== 3) for (let k = 0; k < 3; k++) {
        const t = rr(0.48, g - 0.02), P = at(t), out = new THREE.Vector3(P.x - Wg.x, 0, P.z - Wg.z).normalize();
        const tip = P.clone().addScaledVector(out, 0.035).add(new THREE.Vector3(0, 0.03, 0));
        addM(rod(P, tip, 0.0012, 0.001, 3), beanMat, ID(), 0x7a9a40, false);
        for (let f = 0; f < 7; f++) {
          const fp = tip.clone().addScaledVector(out, f * 0.003).add(new THREE.Vector3(rr(-0.012, 0.012), -f * 0.0055 + 0.012, rr(-0.012, 0.012)));
          addM(flowerG, flowMat, new THREE.Matrix4().compose(fp, new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(0, 3), rr(0, 6), 0)), new THREE.Vector3(1, 0.5, 1.5)), shade(rnd() < 0.2 ? 0xe86a4a : 0xd8321c, 0.85, 1.15), false);
        }
      }
      for (let k = 0; k < (lite ? 1 : 2); k++) {
        const t = rr(0.2, 0.55), P = at(t);
        const q = new THREE.Quaternion().setFromAxisAngle(UP, rr(0, 6.28));
        addM(podCache[(ci + k) % 3], beanMat, new THREE.Matrix4().compose(P.clone().add(new THREE.Vector3(0, -0.004, 0)), q, new THREE.Vector3(1, 1, 1)), shade(0x5d9330, 0.8, 1.1), true);
      }
    });
  }

  // ======================================================================================= compost bin
  {
    const C = W.compost, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2, bw = C.x1 - C.x0, bd = C.z1 - C.z0;
    const P = 0.052, h = C.h;
    for (const x of [C.x0 + P / 2, C.x1 - P / 2]) for (const z of [C.z0 + P / 2, C.z1 - P / 2]) {
      addM(boxUV(P, h + 0.02, P, 1), wood, T(x, fy + (h + 0.02) / 2, z), shade(0x7d6c57, 0.85, 1.0));
      addM(boxUV(P + 0.01, 0.012, P + 0.01, 1), wood, T(x, fy + h + 0.02, z), 0x6e5e4b, false);
    }
    const sh = 0.088, gap = 0.012, nS = 8;
    for (let i = 0; i < nS; i++) {
      const y = fy + 0.03 + sh / 2 + i * (sh + gap);
      const tint = () => shade(0x8f7d67, 0.78, 1.08);
      // Back (fence side) and the two sides: full height.
      addM(boxUV(0.018, sh, bd - 2 * P + 0.01, 1), wood, T(C.x1 - 0.012, y, cz, rr(-0.004, 0.004)), tint());
      for (const z of [C.z0 + 0.012, C.z1 - 0.012]) addM(boxUV(bw - 2 * P + 0.01, sh, 0.018, 1), wood, T(cx, y, z, 0, 0, rr(-0.004, 0.004)), tint());
      // Front: slats run in the channel, the top ones taken out.
      if (i < 5) addM(boxUV(0.018, sh, bd - 2 * P + 0.01, 1), wood, T(C.x0 + 0.012, y + (i === 4 ? 0.01 : 0), cz, 0, 0, i === 4 ? 0.04 : 0), tint());
    }
    // A slat lying on the ground in front.
    addM(boxUV(0.09, 0.018, 0.5, 1), wood, T(C.x0 - 0.1, fy + 0.009, cz - 0.2, 0.2), 0x8a7863, false);
    // The heap, bulging over the lowered front.
    const topY = (x, z) => fy + 0.58 - 1.3 * (x - cx) * (x - cx) - 0.9 * (z - cz) * (z - cz);
    addM(boxUV(bw - 0.12, 0.3, bd - 0.12, 1), kit.soil, T(cx, fy + 0.3, cz), 0x2f2218, false);
    for (let i = 0; i < (lite ? 60 : 170); i++) {
      const x = cx + rr(-0.19, 0.19), z = cz + rr(-0.4, 0.4), r = rr(0.014, 0.034);
      const pick = rnd(), col = pick < 0.5 ? 0x3a2a1d : pick < 0.8 ? 0x4b3825 : 0x2b1f16;
      add(blobGeometry(r, 1, i, 0.45), kit.soil, x, topY(x, z) - r * 0.3, z, shade(col, 0.8, 1.3), { sx: rr(0.9, 1.5), sy: rr(0.4, 0.7), sz: rr(0.9, 1.4), ry: rr(0, 6), cast: false });
    }
    // Grass clippings, leaves and kitchen waste on top.
    for (let i = 0; i < (lite ? 25 : 60); i++) {
      const x = cx + rr(-0.17, 0.2), z = cz + rr(-0.34, 0.34);
      add(leafGeo(rr(0.05, 0.08), 0.014, { nu: 3, nv: 1, bend: rr(-0.2, 0.2) }), kit.leaf, x, topY(x, z) + 0.01, z, shade(rnd() < 0.3 ? 0xb4b24a : 0x6f9a3a, 0.7, 1.15), { ry: rr(0, 6.3), rz: rr(0, 0.5), cast: false });
    }
    for (let i = 0; i < 4; i++) {
      const x = cx + rr(-0.12, 0.14), z = cz + rr(-0.28, 0.28);
      add(new THREE.SphereGeometry(0.0125, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.6), kit.paper, x, topY(x, z) + 0.028, z, shade(0xe6dcc3, 0.9, 1.05), { rx: rr(0, 2), rz: rr(0, 2), sy: 0.8, cast: false });
    }
    // Spent tea bags with their strings and tags.
    for (const [dx, dz, yaw] of [[-0.06, -0.12, 0.4], [0.08, 0.16, -0.7], [0.01, 0.3, 1.9]]) {
      const x = cx + dx, z = cz + dz, y = topY(x, z) + 0.03;
      add(blobGeometry(0.02, 1, 1, 0.08), kit.paper, x, y, z, shade(0x5d3f27, 0.8, 1.1), { sx: 1.25, sy: 0.3, sz: 1.0, ry: yaw, cast: false });
      const sx = Math.cos(yaw) * 0.032, sz = -Math.sin(yaw) * 0.032;
      addM(rod(new THREE.Vector3(x, y + 0.002, z), new THREE.Vector3(x + sx, y + 0.003, z + sz), 0.0006, 0.0006, 3), kit.paper, ID(), 0xd8cfb8, false);
      addM(boxUV(0.011, 0.0012, 0.015, 1), kit.paper, T(x + sx * 1.3, y + 0.003, z + sz * 1.3, yaw), 0xe8e4d6, false);
    }
    // A banana skin, a cabbage stalk and a couple of tatty outer leaves.
    {
      const x = cx - 0.05, z = cz + 0.0, y = topY(x, z) + 0.03;
      add(leafGeo(0.12, 0.034, { nu: 7, nv: 2, k: 0.6, sharp: 0.5, bend: 0.12, cup: 0.35 }), kit.paper, x, y, z, 0xd9bf45, { ry: 0.9, rz: 0.08, cast: false });
      add(leafGeo(0.12, 0.034, { nu: 7, nv: 2, k: 0.6, sharp: 0.5, bend: 0.12, cup: 0.35 }), kit.paper, x, y, z, 0xcfb23c, { ry: 0.9 + 2.3, rz: 0.1, cast: false });
      add(new THREE.CylinderGeometry(0.009, 0.007, 0.034, 8), kit.paint, x, y, z, 0x3a2d1b, { cast: false });
      add(new THREE.CylinderGeometry(0.014, 0.017, 0.07, 8), kit.paper, cx + 0.12, topY(cx + 0.12, cz - 0.2) + 0.02, cz - 0.2, 0xd9dcb4, { rz: 1.3, ry: 0.4, cast: false });
      add(leafGeo(0.11, 0.1, { nu: 6, nv: 4, k: 0.6, ruf: 0.05, bend: -0.2 }), kit.leaf, cx + 0.04, topY(cx + 0.04, cz - 0.24) + 0.02, cz - 0.24, 0x7f9360, { ry: 2.4, rz: 0.15, cast: false });
    }
    // The lid, slid half off: three boards and two battens.
    const lidBase = T(C.x1 - 0.3, fy + C.h + 0.03, C.z0 + 0.3, 0.35, 0.0, 0.06);
    const lidWood = [0x93806a, 0x8a7861, 0x98856f, 0x8e7b65];
    for (let i = 0; i < 4; i++) addM(boxUV(0.54, 0.018, 0.098, 1), wood, lidBase.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.15 + i * 0.1)), lidWood[i], true);
    for (const x of [-0.2, 0.2]) addM(boxUV(0.05, 0.022, 0.4, 1), wood, lidBase.clone().multiply(new THREE.Matrix4().makeTranslation(x, -0.02, 0)), 0x7a6954, false);
    // A snail on the corner post and a couple of flies are left to the imagination.
  }

  // ======================================================================================= interactive parts
  // --- the lid and its stick follow the sim's hinge; the scarer's tins are driven here.
  const air = new THREE.Vector3(), probe = new THREE.Vector3();
  const near = (x, z, r) => {
    const A = ctx.sim && ctx.sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(wk.hub.x - x) < r && Math.abs(wk.hub.z - z) < r) return true;
      if (wk.vg && Math.abs(wk.hit.x - x) < r && Math.abs(wk.hit.z - z) < r) return true;
    }
    return false;
  };
  const sound = (kind, pos, amp) => {
    const A = ctx.audio;
    if (!A || !A.ready || !A.ctx || !A.spot) return;
    const o = A.spot(pos);
    {
      const f = 2500 + rnd() * 1100;
      A.tone({ freq: f, to: f * 0.985, type: 'triangle', gain: 0.03 * amp, attack: 0.001, decay: 0.11, out: o });
      A.tone({ freq: f * 1.52, type: 'sine', gain: 0.013 * amp, attack: 0.001, decay: 0.08, out: o });
      A.noiseBurst({ freq: 5200, q: 1.8, gain: 0.04 * amp, attack: 0.001, decay: 0.025, out: o });
    }
  };

  // --- the scarer: two foil pie tins on strings from the cross cane.
  const TIN_R = 0.052;
  const tinGeo = (() => {
    const L = 0.001;
    // Fluted pie tin (axis y, rim up), then turned to face along z so it hangs on edge from its string.
    const prof = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.034, 0), new THREE.Vector2(0.036, 0.002), new THREE.Vector2(0.046, 0.0125), new THREE.Vector2(0.0485, 0.0135), new THREE.Vector2(0.0525, 0.0135), new THREE.Vector2(0.0525, 0.0145), new THREE.Vector2(0.0485, 0.0145), new THREE.Vector2(0.0455, 0.0125), new THREE.Vector2(0.0345, 0.0012), new THREE.Vector2(0.0001, 0.0012)];
    void L;
    const g = new THREE.LatheGeometry(prof, 36);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const r = Math.hypot(v.x, v.z), y = v.y;
      if (r > 0.034) { const fl = 1 + 0.045 * Math.cos(Math.atan2(v.z, v.x) * 24) * Math.min(1, (r - 0.034) / 0.012); v.x *= fl; v.z *= fl; }
      void y;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.rotateX(Math.PI / 2);                                   // axis now z: dish opens towards +z
    g.translate(0, -(0.002 + TIN_R), 0);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  })();
  // One InstancedMesh: both tins share one geometry (string and tin).
  const scarer = (() => {
    const len = 0.14;
    const s = new THREE.CylinderGeometry(0.0007, 0.0007, len, 3).translate(0, -len / 2, 0).toNonIndexed();
    const sc = new Float32Array(s.attributes.position.count * 3);
    for (let i = 0; i < sc.length; i += 3) { sc[i] = 0.62; sc[i + 1] = 0.5; sc[i + 2] = 0.3; }
    s.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const t = tinGeo.clone().translate(0, -len, 0).toNonIndexed();
    for (const g of [s, t]) { g.deleteAttribute('uv'); }
    const g = mergeGeometries([s, t], false);
    const mat = kit.steel.clone(); mat.vertexColors = true; mat.side = THREE.DoubleSide; mat.color.set(0xffffff); mat.roughness = 0.34;
    const mesh = new THREE.InstancedMesh(g, mat, 2);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.setColorAt(0, new THREE.Color(0xe9ecee)); mesh.setColorAt(1, new THREE.Color(0xd0cdc6));
    ctx.scene.add(mesh);
    return mesh;
  })();
  const pivotY = apexY + 0.2 - 0.004;
  const tins = [{ z: -0.14, L: 0.14 + TIN_R, ax: 0.3, az: 0.0, vx: 0, vz: 0, spin: 0, spinV: 0 }, { z: 0.14, L: 0.14 + TIN_R, ax: -0.2, az: 0, vx: 0, vz: 0, spin: 1, spinV: 0 }];
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tp = new THREE.Vector3(), td = new THREE.Vector3(), ts = new THREE.Vector3(1, 1, 1);
  const DOWN = new THREE.Vector3(0, -1, 0);
  const bobs = [new THREE.Vector3(), new THREE.Vector3()];
  const tinState = { t: 0, lastClink: -9, idle: false };
  function poseTins() {
    for (let i = 0; i < 2; i++) {
      const T0 = tins[i];
      td.set(Math.sin(T0.ax), -Math.cos(T0.ax) * Math.cos(T0.az), Math.sin(T0.az)).normalize();
      tq.setFromUnitVectors(DOWN, td);
      tq2.setFromAxisAngle(UP, T0.spin);
      tq.multiply(tq2);
      tp.set(Wg.x + 0.003, pivotY, Wg.z + T0.z);
      tm.compose(tp, tq, ts);
      scarer.setMatrixAt(i, tm);
      bobs[i].copy(tp).addScaledVector(td, T0.L);
    }
    scarer.instanceMatrix.needsUpdate = true;
  }
  poseTins();
  function stepTins(dt) {
    const wk = near(Wg.x, Wg.z, 1.0);
    const g = 9.81, c = 1.3, tt = tinState.t;
    let moving = wk;
    for (const T0 of tins) if (Math.abs(T0.vx) + Math.abs(T0.vz) + Math.abs(T0.ax) + Math.abs(T0.az) > 0.003 || Math.abs(T0.spinV) > 0.01) moving = true;
    // Breeze, always on (a gentle sway), and the wash near a wake.
    const gust = Math.max(0, Math.sin(tt * 0.13) * Math.sin(tt * 0.31 + 1) - 0.3) * 1.6;
    const sub = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 240))));
    const h = dt / sub;
    for (let k = 0; k < tins.length; k++) {
      const T0 = tins[k];
      air.set(0, 0, 0);
      if (wk) {
        probe.set(Wg.x, pivotY - T0.L, Wg.z + T0.z); ctx.airAt(probe, air);
        if (ctx.sim.props && ctx.sim.props.inflow) ctx.sim.props.inflow(probe, air);
        const e = Math.max(air.length() * 0.45, wakeStir(ctx.sim, probe, air));
        air.x += e * (0.7 * Math.sin(tt * 7.3 + k * 2.1) + 0.5 * Math.sin(tt * 12.9 + k * 4.3));
        air.z += e * (0.7 * Math.cos(tt * 6.1 + k * 1.3) + 0.5 * Math.cos(tt * 11.1 + k * 3.7));
      }
      const b = 0.14 + 0.1 * Math.sin(tt * 0.7 + k) + gust * (0.7 + 0.3 * Math.sin(tt * 3.1 + k));
      air.x += 0.8 * b; air.z += 0.5 * b * Math.cos(tt * 1.1 + k * 2);
      if (air.lengthSq() > 49) air.setLength(7);
      for (let i = 0; i < sub; i++) {
        const ux = air.x - T0.L * T0.vx, uz = air.z - T0.L * T0.vz;
        const drag = 0.48;
        T0.vx += (-(g / T0.L) * Math.sin(T0.ax) + drag * Math.abs(ux) * ux / T0.L - c * T0.vx) * h;
        T0.vz += (-(g / T0.L) * Math.sin(T0.az) + drag * Math.abs(uz) * uz / T0.L - c * T0.vz) * h;
        T0.ax += T0.vx * h; T0.az += T0.vz * h;
        T0.spinV += (Math.hypot(air.x, air.z) * 4 * Math.sin(tt * 2.3 + k * 3) - 1.5 * T0.spinV) * h;
        T0.spin += T0.spinV * h;
      }
      T0.ax = Math.max(-1.3, Math.min(1.3, T0.ax)); T0.az = Math.max(-1.3, Math.min(1.3, T0.az));
    }
    // Tin meets tin.
    const p0 = tins[0], p1 = tins[1];
    poseTins();
    const dx = bobs[1].x - bobs[0].x, dy = bobs[1].y - bobs[0].y, dz = bobs[1].z - bobs[0].z, d = Math.hypot(dx, dy, dz);
    if (d < TIN_R * 1.9 && d > 1e-4) {
      const v0 = p0.L * p0.vz, v1 = p1.L * p1.vz;
      if (v0 - v1 > 0.02) {
        const e = 0.75, n0 = ((1 - e) * v0 + (1 + e) * v1) / 2, n1 = ((1 + e) * v0 + (1 - e) * v1) / 2;
        p0.vz = n0 / p0.L; p1.vz = n1 / p1.L;
        if (tinState.t - tinState.lastClink > 0.09) { tinState.lastClink = tinState.t; sound('clink', bobs[0], Math.min(1, (v0 - v1) / 0.6)); }
        p0.spinV += rr(-3, 3); p1.spinV += rr(-3, 3);
      }
    }
    void moving;
  }

  // Sounds for the lid (events from the sim's hinge).
  registerExtraSound('bedClack', (audio, e, now) => {
    if (now - (audio._bedClackT || 0) < 0.08) return;
    audio._bedClackT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos);
    audio.tone({ freq: 190 + Math.random() * 30, to: 150, type: 'triangle', gain: 0.05 + 0.09 * s, attack: 0.001, decay: 0.06, out: o });
    audio.noiseBurst({ freq: 1800, q: 1.1, gain: 0.03 + 0.06 * s, attack: 0.001, decay: 0.05, out: o });
    audio.tone({ freq: 3300 + Math.random() * 400, type: 'sine', gain: 0.008 + 0.02 * s, attack: 0.001, decay: 0.22, out: o });
  });
  registerExtraSound('bedStick', (audio, e, now) => {
    if (now - (audio._bedStickT || 0) < 0.3) return;
    audio._bedStickT = now;
    const o = audio.spot(e.pos);
    audio.noiseBurst({ freq: 900, q: 1.4, gain: 0.05, attack: 0.001, decay: 0.07, out: o });
    audio.tone({ freq: 420, to: 300, type: 'triangle', gain: 0.04, attack: 0.001, decay: 0.09, out: o, delay: 0.12 });
    audio.noiseBurst({ freq: 700, q: 1.2, gain: 0.04, attack: 0.001, decay: 0.06, out: o, delay: 0.3 });
  });

  const sim = ctx.sim, stickTmp = { t: 0 };
  const STICK_END = 1.77;
  const api = {
    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);
      tinState.t += dt;
      const st = sim && sim.extras && sim.extras.mods.bedRight;
      if (st) {
        lid.rotation.z = -st.lid.a;
        if (st.lid.propped) { if (stickTmp.t !== 0) { stickTmp.t = 0; stick.rotation.z = 0; } }
        else if (stickTmp.t < 0.5) {
          stickTmp.t += dt;
          const k = Math.min(1, stickTmp.t / 0.45);
          stick.rotation.z = -STICK_END * k * k;
        }
      }
      stepTins(dt);
    },
    tins,
  };
  lid.userData.bedRight = api;      // for the test scripts
  return api;
}
