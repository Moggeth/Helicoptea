import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM } from '../../../sim/layout.js';
import { WIG, POTS, wigwamCane } from '../../../sim/extras/zones/bedLeft.js';

// The left flower border along the left fence (z -2.5..-4.5), all real size and mostly procedural foliage
// that bends in the breeze and the rotor wash (ctx.sway):
//   hollyhocks against the fence, foxgloves, three lavender clumps with bumblebees working them (they flee the
//   rotor), a blue mophead hydrangea, hostas, ferns, a sweet-pea wigwam of bamboo canes with two CDs hung as
//   bird scarers (they swing and spin in the wash), a row of edging cobbles, plant labels and two terracotta
//   pots on the lawn edge that the wash tips over (sim module: bedLeft).
// Static parts all go in the shared batch; own draw calls: bees, scarers, labels, pots.

const fy = ROOM.floorY;

function rngOf(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const col = new THREE.Color();
// Slightly vary a colour: hue, saturation and lightness offsets scaled by amt.
function jit(hex, rnd, amt = 0.04) {
  col.setHex(hex);
  col.offsetHSL((rnd() - 0.5) * amt * 0.5, (rnd() - 0.5) * amt * 2, (rnd() - 0.5) * amt * 2);
  return col.getHex();
}

// ---------------------------------------------------------------- geometry helpers
// A leaf starting at the origin and growing along +z: rise = initial elevation, bend = how much it arches over
// (radians along its length), pet = fraction that is leaf stalk, k/p shape the outline, fold lifts the edges,
// ripple corrugates it across (veins).
function leafGeo({ len, wid, rise = 0.5, bend = 0.8, segs = 6, across = 3, k = 0.6, p = 0.7, pet = 0, fold = 0, ripple = 0, nrip = 6, twist = 0, edge = 0, rib = 0, tip = 0 }) {
  segs = Math.ceil(segs * 1.5); across = Math.ceil(across * 1.5);
  const pos = [], uv = [], idx = [];
  let y = 0, z = 0;
  const ds = len / segs, cols = across * 2 + 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    if (i > 0) { const e = rise - bend * (i - 0.5) / segs; y += Math.sin(e) * ds; z += Math.cos(e) * ds; }
    const e = rise - bend * t, uy = Math.cos(e), uz = -Math.sin(e), roll = twist * t;
    let w;
    if (t < pet) w = 0.06;
    else {
      const s = (t - pet) / (1 - pet);
      w = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(s, k))), p);
      w *= 1 - tip * s * s;
      if (t < pet + 0.1) w = Math.max(w, 0.06 * (1 - (t - pet) / 0.1));
    }
    const half = wid * w * 0.5;
    for (let j = 0; j < cols; j++) {
      const u = j / across - 1;
      const lift = (fold * Math.abs(u) * wid * w - rib * Math.max(0, 1 - Math.abs(u) * 4) * wid * w * 0.12 + ripple * Math.cos(u * nrip * Math.PI * 0.5) * w + edge * Math.sin(u * 7 + t * 9) * w * Math.abs(u) * 0.01);
      pos.push(u * half * Math.cos(roll), y + u * half * Math.sin(roll) + uy * lift, z + uz * lift);
      uv.push(j / (cols - 1), t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Tapered tube through points (THREE.Vector3[]), radius r0 at the first and r1 at the last point.
function tubeGeo(pts, r0, r1, rad = 4) {
  const pos = [], idx = [], n = pts.length;
  const t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), ref = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    ref.set(Math.abs(t.y) > 0.9 ? 1 : 0, Math.abs(t.y) > 0.9 ? 0 : 1, 0);
    a.crossVectors(t, ref).normalize(); b.crossVectors(t, a).normalize();
    const r = r0 + (r1 - r0) * i / (n - 1);
    for (let j = 0; j < rad; j++) {
      const ang = j / rad * Math.PI * 2, c = Math.cos(ang) * r, s = Math.sin(ang) * r;
      pos.push(pts[i].x + a.x * c + b.x * s, pts[i].y + a.y * c + b.y * s, pts[i].z + a.z * c + b.z * s);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < rad; j++) {
    const q = (j + 1) % rad, A = i * rad + j, B = i * rad + q, C = (i + 1) * rad + j, D = (i + 1) * rad + q;
    idx.push(A, C, B, B, C, D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// A flower facing +z: n overlapping petals, cupped (cup), with a frilled edge (ruff) and a lobed outline (lobe).
function bloomGeo({ n = 5, r = 0.04, cup = 0.5, ruff = 0.1, lobe = 0.12, rings = 3, arcs = 5, over = 1.25 }) {
  const pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const base = pos.length / 3;
    for (let ring = 0; ring <= rings; ring++) for (let a = 0; a <= arcs; a++) {
      const f = a / arcs - 0.5, phi = (i + f * over) * Math.PI * 2 / n;
      const rho = r * (ring / rings) * (1 - lobe * (1 - Math.cos(f * Math.PI)) * (ring / rings));
      const s = rho / r;
      const z = cup * r * Math.pow(s, 1.6) + ruff * r * Math.sin(phi * n * 2.5 + i) * s * s * 0.5 + i * 0.0004;
      pos.push(Math.cos(phi) * rho, Math.sin(phi) * rho, z);
    }
    for (let ring = 0; ring < rings; ring++) for (let a = 0; a < arcs; a++) {
      const A = base + ring * (arcs + 1) + a, B = A + 1, C = A + arcs + 1, D = C + 1;
      idx.push(A, B, C, B, D, C);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// A lathe about +z (base at the origin, mouth/tip at +z) from [radius, z] pairs.
function lathe(profile, seg = 8) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

function plain(g) {
  const o = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
  return o;
}
function mergeAll(list) { return mergeGeometries(list.map(plain), false); }

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Yaw and pitch (T's convention: positive pitch droops) that point +z along d.
function orient(d) { return [Math.atan2(d.x, d.z), -Math.atan2(d.y, Math.hypot(d.x, d.z))]; }

// ---------------------------------------------------------------- the module
export function build(ctx) {
  const { scene, batch, kit, T, lite } = ctx;
  const sim = ctx.sim;
  const tall = ctx.sway(kit.leaf, { baseY: fy, height: 1.25, amount: 1.1 });
  const low = ctx.sway(kit.leaf, { baseY: fy, height: 0.55, amount: 0.9 });
  const q = lite ? 0.6 : 1;
  const bloomPts = [];     // lavender spike tips, for the bees

  const at = (px, pz, yaw, lx, ly, lz, ry = 0, rx = 0, rz = 0, s = 1) => T(px, fy, pz, yaw).multiply(T(lx, ly, lz, ry, rx, rz, s, s, s));
  const put = (geo, mat, M, color, cast = true) => batch.add(geo, mat, M, color, { cast, receive: true });

  // ---------------------------------------------------------------- hollyhocks (against the fence)
  {
    const defs = [
      { x: -3.32, z: -2.72, H: 1.12, c: 0xe7a1b8, seed: 3 },
      { x: -3.31, z: -3.02, H: 0.98, c: 0x9a2442, seed: 7 },
      { x: -3.33, z: -3.3, H: 1.08, c: 0xf0dc90, seed: 11 },
    ];
    for (const d of defs) {
      const rnd = rngOf(d.seed * 131);
      const pl = (lx, ly, lz, ry, rx, rz, s) => at(d.x, d.z, 0, lx, ly, lz, ry, rx, rz, s);
      // Stem, leaning gently out from the fence.
      const lean = 0.05 + rnd() * 0.03;
      const sp = [];
      for (let i = 0; i <= 9; i++) { const t = i / 9; sp.push(V(lean * t * t, d.H * t, Math.sin(t * 2.4 + d.seed) * 0.012)); }
      put(tubeGeo(sp, 0.0095, 0.0042, 5), tall, pl(0, 0, 0, 0, 0, 0, 1), 0x55723a);
      const stemAt = (y) => { const t = y / d.H; return V(lean * t * t, y, Math.sin(t * 2.4 + d.seed) * 0.012); };
      // Round leaves on long stalks, big at the base.
      const nl = Math.round(9 * q);
      for (let i = 0; i < nl; i++) {
        const t = i / (nl - 1), y = 0.02 + t * 0.52, sz = 0.17 - t * 0.08;
        const g = leafGeo({ len: sz * 2.0, wid: sz * 1.05, rise: 0.55 - t * 0.2, bend: 1.0 + (rnd() - 0.5) * 0.4, segs: 6, across: 3, k: 0.95, p: 0.45, pet: 0.45, fold: 0.08, ripple: 0.004, nrip: 5, edge: 1 });
        const sa = stemAt(y);
        put(g, tall, pl(sa.x, y, sa.z, i * 2.4 + rnd() * 0.6, 0, 0, 1), jit(0x436f2f, rnd, 0.06));
      }
      // Flowers up the top half, facing out into the garden (+x).
      const nf = Math.round(10 * q);
      const bloom = bloomGeo({ n: 5, r: 0.5, cup: 0.55, ruff: 0.1, lobe: 0.1 });
      const throat = bloomGeo({ n: 5, r: 0.5, cup: 0.5, ruff: 0, lobe: 0.2, rings: 2 });
      const calyx = bloomGeo({ n: 5, r: 0.5, cup: 0.3, ruff: 0, lobe: 0.5, rings: 2, over: 0.9 });
      const boss = new THREE.CylinderGeometry(0.1, 0.12, 0.7, 6).rotateX(Math.PI / 2).translate(0, 0, 0.35);
      for (let i = 0; i < nf; i++) {
        const t = i / (nf - 1), y = d.H * (0.5 + 0.43 * t), sa = stemAt(y);
        const size = 0.088 - 0.034 * t;
        const yaw = Math.PI / 2 + (i % 2 ? 1 : -1) * (0.35 + rnd() * 1.1);
        const dir = V(Math.sin(yaw), 0, Math.cos(yaw));
        const pitch = -0.12 + rnd() * 0.25;
        const off = 0.028 + size * 0.2;
        const col1 = jit(d.c, rnd, 0.08);
        // Short stalk, green calyx, the big saucer of petals, a darker throat and the stamen column.
        const stalk = tubeGeo([V(0, 0, 0), V(dir.x * off * 0.5, 0.004, dir.z * off * 0.5), V(dir.x * off, 0.0, dir.z * off)], 0.0034, 0.0028, 4);
        put(stalk, tall, pl(sa.x, y, sa.z, 0, 0, 0, 1), 0x55723a, false);
        const base = pl(sa.x + dir.x * off, y, sa.z + dir.z * off, yaw, pitch, rnd() * 6.28, 1);
        const sm = (s) => new THREE.Matrix4().makeScale(s, s, s);
        put(calyx, tall, base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.004)).multiply(sm(size * 0.42)), 0x6a8a45, false);
        put(bloom, tall, base.clone().multiply(sm(size)), col1);
        put(throat, tall, base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.002)).multiply(sm(size * 0.36)), jit(d.c === 0xf0dc90 ? 0xd9a440 : 0x5b1228, rnd, 0.05), false);
        put(boss, tall, base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.004)).multiply(sm(size * 0.09)), 0xe8d27a, false);
      }
      // Buds at the tip.
      const bud = new THREE.IcosahedronGeometry(0.01, 1);
      for (let i = 0; i < 5; i++) {
        const y = d.H * (0.94 + i * 0.012), sa = stemAt(Math.min(y, d.H));
        const a = i * 2.1, rr = i === 4 ? 0 : 0.012;
        put(bud, tall, pl(sa.x + Math.cos(a) * rr, Math.min(y, d.H) + (i === 4 ? 0.014 : 0), sa.z + Math.sin(a) * rr, 0, 0, 0, 1 - i * 0.12), i < 2 ? jit(d.c, rnd, 0.05) : 0x7d9a52, false);
      }
    }
  }

  // ---------------------------------------------------------------- foxgloves
  {
    const defs = [
      { x: -3.32, z: -3.98, H: 0.98, c: 0xb85a96, seed: 5 },
      { x: -3.27, z: -4.14, H: 0.86, c: 0xeadde6, seed: 9 },
      { x: -3.06, z: -3.14, H: 0, c: 0, seed: 21, leafy: true },   // a first-year rosette in front of the hollyhocks
    ];
    const bellP = [[0.0006, 0], [0.003, 0.0035], [0.0065, 0.011], [0.0105, 0.021], [0.0128, 0.03], [0.0138, 0.037], [0.0145, 0.04]];
    const bell = lathe(bellP, 8);
    const lip = lathe([[0.0145, 0.04], [0.016, 0.0425], [0.0135, 0.043]], 8);
    const inner = new THREE.CircleGeometry(0.0125, 8).translate(0, 0, 0.032);
    for (const d of defs) {
      const rnd = rngOf(d.seed * 977);
      const pl = (lx, ly, lz, ry, rx, rz, s) => at(d.x, d.z, 0, lx, ly, lz, ry, rx, rz, s);
      const nb = Math.round(9 * q);
      for (let i = 0; i < nb; i++) {
        const sz = d.leafy ? 1 : 1.0;
        const g = leafGeo({ len: (0.2 + rnd() * 0.09) * sz, wid: 0.068, rise: 0.5 + rnd() * 0.3, bend: 1.0 + rnd() * 0.3, segs: 6, across: 3, k: 0.72, p: 0.75, pet: 0.12, fold: 0.14, ripple: 0.0035, nrip: 7, edge: 1 });
        put(g, low, pl(Math.cos(i * 2.4) * 0.012, 0.005, Math.sin(i * 2.4) * 0.012, i * 2.4 + rnd() * 0.4, 0, 0, 1), jit(0x46663a, rnd, 0.07));
      }
      if (d.leafy) continue;
      const sp = [];
      for (let i = 0; i <= 9; i++) { const t = i / 9; sp.push(V(0.05 * t * t, d.H * t, Math.sin(t * 2 + d.seed) * 0.01)); }
      put(tubeGeo(sp, 0.0075, 0.0025, 5), tall, pl(0, 0, 0, 0, 0, 0, 1), 0x5a7540);
      const stemAt = (y) => { const t = y / d.H; return V(0.05 * t * t, y, Math.sin(t * 2 + d.seed) * 0.01); };
      // A few stem leaves.
      for (let i = 0; i < 3; i++) {
        const y = 0.12 + i * 0.1, sa = stemAt(y);
        put(leafGeo({ len: 0.11 - i * 0.025, wid: 0.04, rise: 0.8, bend: 0.8, segs: 4, across: 2, k: 0.7, p: 0.8, fold: 0.1 }), tall, pl(sa.x, y, sa.z, 1 + i * 2.2, 0, 0, 1), 0x4f6f3a);
      }
      const nbells = Math.round(18 * q);
      for (let i = 0; i < nbells; i++) {
        const t = i / (nbells - 1), y = d.H * (0.4 + 0.52 * t), sa = stemAt(y);
        const size = (1.0 - 0.45 * t) * (d.H > 0.9 ? 1 : 0.95);
        const yaw = Math.PI / 2 + Math.sin(i * 2.1) * 1.2 + (rnd() - 0.5) * 0.3;
        const dir = V(Math.sin(yaw), 0, Math.cos(yaw));
        const ped = 0.016 * size;
        put(tubeGeo([V(0, 0, 0), V(dir.x * ped, 0.004, dir.z * ped)], 0.0018, 0.0014, 3), tall, pl(sa.x, y, sa.z, 0, 0, 0, 1), 0x7f9a58, false);
        const base = pl(sa.x + dir.x * ped, y + 0.004, sa.z + dir.z * ped, yaw, 0.85 + rnd() * 0.25, 0, size);
        const c1 = jit(d.c, rnd, 0.06);
        put(bell, tall, base, c1);
        put(lip, tall, base, c1, false);
        put(inner, tall, base, d.c === 0xeadde6 ? 0xc7a3b8 : 0x6b2650, false);
      }
      for (let i = 0; i < 6; i++) {
        const t = i / 5, y = d.H * (0.93 + 0.07 * t), sa = stemAt(Math.min(y, d.H));
        const bud = new THREE.IcosahedronGeometry(0.0075 * (1 - t * 0.55), 1);
        put(bud, tall, pl(sa.x + Math.cos(i * 2.4) * 0.006, Math.min(y, d.H) + 0.002, sa.z + Math.sin(i * 2.4) * 0.006, 0, 0, 0, 1), i < 3 ? 0x9a7f6a : 0x7f9a58, false);
      }
    }
  }

  // ---------------------------------------------------------------- lavender (three clumps)
  {
    const defs = [{ x: -2.97, z: -2.78, seed: 4 }, { x: -2.97, z: -3.08, seed: 8 }, { x: -2.96, z: -3.38, seed: 13 }];
    // A flower spike: whorls of tiny flowers, along +z.
    const spikes = [];
    for (let v = 0; v < 3; v++) {
      const prof = [];
      const n = 11, L = 0.056 + v * 0.008;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const whorl = 0.62 + 0.38 * Math.abs(Math.cos(t * Math.PI * (4 + v)));
        const env = Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04)) ** 0.55;
        prof.push([Math.max(0.0004, 0.0052 * env * whorl), t * L]);
      }
      prof[n][0] = 0.0006;
      spikes.push(lathe(prof, 6));
    }
    const mats = [0x7d62b8, 0x8c6fc6, 0x6f55a8, 0x9378cc];
    for (const d of defs) {
      const rnd = rngOf(d.seed * 4001);
      const pl = (lx, ly, lz, ry, rx, rz, s) => at(d.x, d.z, 0, lx, ly, lz, ry, rx, rz, s);
      // Woody base and the grey-green mound of narrow leaves.
      put(new THREE.IcosahedronGeometry(0.035, 1).scale(1.3, 0.6, 1.3), low, pl(0, 0.02, 0, 0, 0, 0, 1), 0x5e4a36, false);
      const nlv = Math.round(46 * q);
      for (let i = 0; i < nlv; i++) {
        const a = rnd() * Math.PI * 2, rr = rnd() * 0.04;
        const g = leafGeo({ len: 0.1 + rnd() * 0.1, wid: 0.0085, rise: 0.75 + rnd() * 0.5, bend: 0.45 + rnd() * 0.5, segs: 3, across: 1, k: 0.8, p: 0.6 });
        put(g, low, pl(Math.cos(a) * rr, 0.03, Math.sin(a) * rr, a, 0, 0, 1), jit(0x73866b, rnd, 0.08), false);
      }
      const ns = Math.round(30 * q);
      for (let i = 0; i < ns; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.04;
        const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
        const reach = 0.04 + rnd() * 0.15;
        const H = 0.27 + rnd() * 0.17 - reach * 0.4;
        const tx = bx + Math.cos(a) * reach, tz = bz + Math.sin(a) * reach;
        const mx = bx + Math.cos(a) * reach * 0.35, mz = bz + Math.sin(a) * reach * 0.35;
        const pts = [V(bx, 0.035, bz), V(mx, H * 0.55, mz), V(tx * 0.93 + bx * 0.07, H * 0.9, tz * 0.93 + bz * 0.07), V(tx, H, tz)];
        const curve = new THREE.CatmullRomCurve3(pts);
        const sp = curve.getPoints(5);
        put(tubeGeo(sp, 0.0017, 0.0012, 3), low, pl(0, 0, 0, 0, 0, 0, 1), 0x819c64, false);
        const tg = sp[5].clone().sub(sp[4]);
        const [yw, pt] = orient(tg);
        const sv = (i + d.seed) % 3;
        put(spikes[sv], low, pl(tx, H, tz, yw, pt, 0, 1), jit(mats[i % mats.length], rnd, 0.06));
        // Bees come to the tips on the clump's front.
        if (i % 3 === 0) bloomPts.push(V(d.x + tx, fy + H + 0.03, d.z + tz));
      }
    }
  }

  // ---------------------------------------------------------------- hydrangea (blue mophead)
  {
    const hx = -3.08, hz = -3.7, rnd = rngOf(77777);
    const pl = (lx, ly, lz, ry, rx, rz, s) => at(hx, hz, 0, lx, ly, lz, ry, rx, rz, s);
    // Leaves in tiers.
    const nl = Math.round(46 * q);
    for (let i = 0; i < nl; i++) {
      const t = i / nl, a = i * 2.4 + rnd() * 0.5;
      const tier = (i % 3) / 3;
      const rr = 0.02 + 0.07 * tier, y = 0.12 + 0.3 * tier + rnd() * 0.08;
      const g = leafGeo({ len: 0.12 + rnd() * 0.04, wid: 0.082, rise: 0.25 + rnd() * 0.5 - tier * 0.2, bend: 0.5 + rnd() * 0.4, segs: 5, across: 3, k: 0.8, p: 0.55, pet: 0.12, fold: 0.1, ripple: 0.002, nrip: 6, edge: 1 });
      put(g, low, pl(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.PI / 2 - a + (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.4, 1), jit(0x366a2c, rnd, 0.09));
      void t;
    }
    // Woody stems.
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      put(tubeGeo([V(0, 0, 0), V(Math.cos(a) * 0.05, 0.26, Math.sin(a) * 0.05), V(Math.cos(a) * 0.12, 0.44, Math.sin(a) * 0.12)], 0.007, 0.004, 4), low, pl(0, 0, 0, 0, 0, 0, 1), 0x6a5a3e, false);
    }
    // Florets: many small four-petalled stars over a dome, three blue-to-lilac tints and a pale eye in each.
    const star = bloomGeo({ n: 4, r: 0.5, cup: 0.08, ruff: 0, lobe: 0.35, rings: 1, arcs: 2, over: 1.0 });
    const eye = new THREE.CircleGeometry(0.11, 5).translate(0, 0, 0.05);
    const heads = [[0.1, 0.46, 0.0, 0.07], [0.0, 0.54, -0.07, 0.072], [-0.09, 0.44, 0.06, 0.064], [0.1, 0.4, 0.13, 0.06], [0.1, 0.55, -0.15, 0.058], [-0.02, 0.38, 0.17, 0.056], [0.17, 0.35, -0.09, 0.052], [0.0, 0.33, -0.17, 0.052]];
    // Three overlapping tints graded by height: lilac-blue on top, deeper blue lower down (no hard band).
    const tints = [0x9a9fe4, 0x7c93e0, 0x5f7dd2];
    const o = new THREE.Object3D();
    heads.slice(0, lite ? 5 : 7).forEach(([hx2, hy, hz2, r], hi) => {
      put(new THREE.IcosahedronGeometry(r * 0.72, 1), low, pl(hx2, hy - r * 0.1, hz2, 0, 0, 0, 1).multiply(new THREE.Matrix4().makeScale(1, 0.85, 1)), 0x5a6cb8, false);
      const m = Math.round((lite ? 120 : 300) * (r / 0.06) ** 2);
      const groups = [[], [], []], eyes = [];
      const ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < m; i++) {
        // Fibonacci dome over the top ~65% of a slightly flattened sphere.
        const f = (i + 0.5) / m, yy = 1 - f * 1.3, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), ph = i * ga;
        const nx = Math.cos(ph) * rr, ny = yy, nz = Math.sin(ph) * rr;
        o.position.set(nx * r, ny * r * 0.8, nz * r);
        o.lookAt(nx * 2 * r, ny * 2 * r, nz * 2 * r);       // faces outward along the sphere normal
        o.rotateX((rnd() - 0.5) * 0.5); o.rotateY((rnd() - 0.5) * 0.5); o.rotateZ(rnd() * 6.28);
        const sc = (0.033 + rnd() * 0.01) * (r / 0.06) ** 0.3;
        o.scale.set(sc, sc, sc); o.updateMatrix();
        const gv = Math.min(2, Math.max(0, Math.floor((f + (rnd() - 0.5) * 0.45) * 3)));
        groups[gv].push(star.clone().applyMatrix4(o.matrix));
        if (i % 3 === 0 && f < 0.7) eyes.push(eye.clone().applyMatrix4(o.matrix));
      }
      groups.forEach((gl, gi) => { if (gl.length) put(mergeAll(gl), low, pl(hx2, hy, hz2, 0, 0, 0, 1), jit(tints[gi], rnd, 0.03)); });
      put(mergeAll(eyes), low, pl(hx2, hy, hz2, 0, 0, 0, 1), 0xdfe6f8, false);
    });
  }

  // ---------------------------------------------------------------- hostas
  {
    const defs = [{ x: -2.86, z: -3.88, seed: 2, scape: true, n: 11 }, { x: -2.82, z: -4.52, seed: 6, scape: false, n: 9 }];
    for (const d of defs) {
      const rnd = rngOf(d.seed * 5003);
      const pl = (lx, ly, lz, ry, rx, rz, s) => at(d.x, d.z, 0, lx, ly, lz, ry, rx, rz, s);
      const n = Math.round(d.n * (lite ? 0.75 : 1));
      for (let i = 0; i < n; i++) {
        const outer = i < n * 0.6;
        const sz = outer ? 0.27 + rnd() * 0.04 : 0.19 + rnd() * 0.03;
        const a = i * 2.4 + rnd() * 0.4, tw = (rnd() - 0.5) * 0.4;
        const lp = { rise: outer ? 0.45 : 0.95, bend: outer ? 1.0 : 0.7, segs: 10, across: 6, k: 0.6, p: 0.55, pet: 0.2, fold: 0.16, ripple: 0.006, nrip: 8, twist: tw, edge: 1, rib: 1, tip: 0.45 };
        const px0 = Math.cos(a) * 0.012, pz0 = Math.sin(a) * 0.012;
        // Cream margin leaf underneath, green blade slightly narrower and lifted on top: classic variegation.
        put(leafGeo({ ...lp, len: sz, wid: sz * 0.76 }), low, pl(px0, 0.01, pz0, a, 0, 0, 1), jit(0xc9c590, rnd, 0.05));
        put(leafGeo({ ...lp, len: sz - 0.005, wid: sz * 0.76 - 0.007 }), low, pl(px0, 0.0122, pz0, a, 0, 0, 1), jit(outer ? 0x3a6d5e : 0x4d7a4a, rnd, 0.06), false);
      }
      if (d.scape) {
        const sp = [V(0, 0.02, 0), V(0.02, 0.28, 0.01), V(0.05, 0.47, 0.02)];
        put(tubeGeo(sp, 0.004, 0.002, 4), low, pl(0, 0, 0, 0, 0, 0, 1), 0x6f8d58, false);
        const bell = lathe([[0.001, 0], [0.004, 0.006], [0.0075, 0.016], [0.0105, 0.026], [0.012, 0.031]], 6);
        for (let i = 0; i < 11; i++) {
          const t = i / 10, y = 0.27 + t * 0.2, a = i * 2.2;
          put(bell, low, pl(0.02 + t * 0.03 + Math.cos(a) * 0.006, y, 0.01 + Math.sin(a) * 0.006, a, 1.0, 0, 0.9 - 0.3 * t), jit(0xb9a2dc, rnd, 0.04), false);
        }
      }
    }
  }

  // ---------------------------------------------------------------- ferns
  {
    const frond = (L, seed) => {
      const rnd = rngOf(seed);
      const pos = [], idx = [];
      const rise = 1.1 + rnd() * 0.3, bend = 1.4 + rnd() * 0.4;
      const N = 22, ds = L / N;
      let y = 0, z = 0;
      const sp = [];
      for (let i = 0; i <= N; i++) {
        if (i) { const e = rise - bend * (i - 0.5) / N; y += Math.sin(e) * ds; z += Math.cos(e) * ds; }
        sp.push([y, z, rise - bend * i / N]);
      }
      const pin = (i, side) => {
        const t = i / N, [py, pz, e] = sp[i];
        const len = 0.066 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.1)), 0.8) + 0.006;
        const w = ds * 1.05, base = pos.length / 3;
        // Pinna: a triangle from the rachis out to a tip that sweeps forward and droops.
        pos.push(0, py, pz, 0, py + Math.sin(e) * w, pz + Math.cos(e) * w, side * len, py - len * 0.25 + Math.sin(e) * len * 0.5, pz + Math.cos(e) * len * 0.5 + w * 0.6);
        if (side > 0) idx.push(base, base + 2, base + 1); else idx.push(base, base + 1, base + 2);
      };
      for (let i = 1; i < N; i++) { pin(i, 1); pin(i, -1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return { g, sp };
    };
    const defs = [{ x: -3.14, z: -3.38, seed: 3, n: 11 }, { x: -3.23, z: -4.42, seed: 5, n: 9 }];
    for (const d of defs) {
      const rnd = rngOf(d.seed * 811);
      const n = Math.round(d.n * (lite ? 0.7 : 1));
      for (let i = 0; i < n; i++) {
        const L = 0.3 + rnd() * 0.14;
        const { g, sp } = frond(L, d.seed * 100 + i);
        const a = i * 2.4 + rnd() * 0.3;
        put(g, low, at(d.x, d.z, 0, Math.cos(a) * 0.015, 0.02, Math.sin(a) * 0.015, a, 0, 0, 1), jit(0x3a6a2d, rnd, 0.08), false);
        put(tubeGeo(sp.map((s) => V(0, s[0], s[1])), 0.0022, 0.0008, 3), low, at(d.x, d.z, 0, Math.cos(a) * 0.015, 0.02, Math.sin(a) * 0.015, a, 0, 0, 1), 0x6d7a3a, false);
      }
    }
  }

  // ---------------------------------------------------------------- cane wigwam with sweet peas
  const W = { x: WIG.x, z: WIG.z };
  const apexY = fy + WIG.h;
  {
    const rnd = rngOf(31415);
    const cn = {};
    const cane = new THREE.CylinderGeometry(WIG.cane, WIG.cane * 1.1, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const pea = bloomGeo({ n: 3, r: 0.5, cup: 0.9, ruff: 0.15, lobe: 0.2, rings: 2, arcs: 4, over: 1.4 });
    const keel = bloomGeo({ n: 2, r: 0.5, cup: 1.4, ruff: 0, lobe: 0.3, rings: 2, arcs: 3, over: 0.9 });
    const peaCols = [0xf0a8cb, 0xa98bdc, 0xf6efe8, 0xc9407f, 0xf5987e, 0xd78bd6, 0x8c7cd0];
    const d = V(0, 0, 0);
    const vineGeo = (i, a0) => {
      wigwamCane(i, cn);
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = 0.04 + 0.92 * k / 16;
        const cx = cn.bx + (cn.tx - cn.bx) * t, cy = cn.by + (cn.ty - cn.by) * t, cz = cn.bz + (cn.tz - cn.bz) * t;
        const ph = t * 26 + a0, r = 0.011;
        pts.push(V(cx - W.x + Math.cos(ph) * r, cy - fy + 0.0, cz - W.z + Math.sin(ph) * r));
      }
      return pts;
    };
    for (let i = 0; i < WIG.n; i++) {
      wigwamCane(i, cn);
      d.set(cn.tx - cn.bx, cn.ty - cn.by, cn.tz - cn.bz);
      const len = d.length();
      const [yw, pt] = orient(d);
      // The cane itself (pale bamboo) with a few nodes.
      put(cane, kit.wood, T(cn.bx, cn.by + 0.0, cn.bz, yw, pt, 0, 1, 1, len), 0xcdb77c);
      for (let nd = 1; nd < 5; nd++) {
        const t = nd / 5.3;
        put(new THREE.TorusGeometry(WIG.cane * 1.25, 0.0014, 4, 8), kit.wood, T(cn.bx + (cn.tx - cn.bx) * t, cn.by + (cn.ty - cn.by) * t, cn.bz + (cn.tz - cn.bz) * t, yw, pt), 0xa88f58, false);
      }
      // Vine up the cane, leaf pairs and flowers.
      const pts = vineGeo(i, i * 1.7);
      put(tubeGeo(pts, 0.0022, 0.0013, 3), tall, T(W.x, fy, W.z), 0x52703a, false);
      const nlp = Math.round(8 * q);
      for (let k = 0; k < nlp; k++) {
        const t = 0.1 + 0.8 * k / (nlp - 1), pi = Math.round(t * 16), p0 = pts[Math.min(16, pi)];
        const g = leafGeo({ len: 0.05, wid: 0.028, rise: 0.5, bend: 0.5, segs: 3, across: 2, k: 0.7, p: 0.6, pet: 0.15, fold: 0.1 });
        const ya = rnd() * 6.28;
        for (const s of [0, 1]) put(g, tall, T(W.x + p0.x, fy + p0.y, W.z + p0.z, ya + s * 3.1 + (rnd() - 0.5) * 0.5, 0.3 * rnd() + 0.2, 0), jit(0x527a38, rnd, 0.07), false);
      }
      const nfl = Math.round(7 * q);
      for (let k = 0; k < nfl; k++) {
        const t = 0.4 + 0.5 * (k / Math.max(1, nfl - 1)), pi = Math.round(t * 16), p0 = pts[Math.min(16, pi)];
        const ya = rnd() * 6.28, c1 = jit(peaCols[(i + k * 2) % peaCols.length], rnd, 0.05);
        const sz = 0.034 + rnd() * 0.01;
        const sx = W.x + p0.x + Math.cos(ya) * 0.018, sy = fy + p0.y + 0.012, sz2 = W.z + p0.z + Math.sin(ya) * 0.018;
        put(tubeGeo([V(0, 0, 0), V(Math.cos(ya) * 0.01, 0.01, Math.sin(ya) * 0.01), V(Math.cos(ya) * 0.018, 0.012, Math.sin(ya) * 0.018)], 0.001, 0.0008, 3), tall, T(W.x + p0.x, fy + p0.y, W.z + p0.z), 0x7fa056, false);
        const M = T(sx, sy, sz2, Math.PI / 2 - ya + 1.6, -0.2 + rnd() * 0.4, rnd() * 0.6 - 0.3, sz, sz, sz);
        put(pea, tall, M, c1);
        put(keel, tall, M.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.05, 0.12).multiply(new THREE.Matrix4().makeScale(0.55, 0.55, 0.55))), jit(peaCols[(i + k * 2 + 1) % peaCols.length], rnd, 0.05), false);
      }
    }
    // Jute: a bound top and two hoops.
    const jute = 0x8c7142;
    put(new THREE.TorusGeometry(0.014, 0.0035, 5, 10).rotateX(Math.PI / 2), kit.fabric, T(W.x, apexY - 0.04, W.z), jute, false);
    put(new THREE.TorusGeometry(0.016, 0.0035, 5, 10).rotateX(Math.PI / 2), kit.fabric, T(W.x, apexY - 0.07, W.z), jute, false);
    for (const t of [0.34, 0.62]) put(new THREE.TorusGeometry(WIG.r * (1 - t) + 0.002, 0.0018, 4, 28).rotateX(Math.PI / 2), kit.fabric, T(W.x, fy + WIG.h * t, W.z), jute, false);
    // The cross cane the scarers hang from, tied to the apex.
    put(cane, kit.wood, T(W.x - 0.06, apexY - 0.03, W.z + 0.005, Math.PI / 2, -0.06, 0, 1, 1, 0.4), 0xc6ae72);
  }

  // ---------------------------------------------------------------- edging cobbles
  {
    const rnd = rngOf(2468);
    const blobs = [0, 1, 2].map((i) => ctx.blobGeometry(0.06, 1, 3 + i * 5, 0.16));
    const stones = lite ? 14 : 22;
    for (let i = 0; i < stones; i++) {
      const z = -2.55 - i * (2.0 / stones) + (rnd() - 0.5) * 0.02, x = -2.755 + (rnd() - 0.5) * 0.03;
      const s = 0.8 + rnd() * 0.5;
      put(blobs[i % 3], kit.stone, T(x, fy + 0.012, z, rnd() * 6.28, 0, 0, s * 1.15, s * 0.55, s * 0.95), jit(0xb4ad9a, rnd, 0.12));
    }
  }

  // ---------------------------------------------------------------- plant labels (one canvas atlas)
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const names = [['LAVENDER', 'Lavandula'], ['FOXGLOVE', 'Digitalis'], ['HOSTA', 'blue umbrellas'], ['HYDRANGEA', 'macrophylla']];
    names.forEach(([a, b], i) => {
      const x = (i % 2) * 128, y = Math.floor(i / 2) * 64;
      g.fillStyle = '#f1efe6'; g.fillRect(x, y, 128, 64);
      g.fillStyle = '#3d6a38'; g.fillRect(x, y, 128, 14);
      g.fillStyle = '#26332a'; g.textAlign = 'center';
      g.font = 'bold 17px sans-serif'; g.fillText(a, x + 64, y + 38);
      g.font = 'italic 12px serif'; g.fillStyle = '#4a4f48'; g.fillText(b, x + 64, y + 55);
    });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
    const list = [];
    const spots = [[-2.86, -3.0, 0.2], [-3.2, -3.99, 0.15], [-2.76, -3.85, 0.1], [-2.8, -3.46, 0.18]];
    // Match labels to what grows behind them: lavender, foxglove, hosta, hydrangea.
    spots.forEach(([x, z, yaw], i) => {
      const p = new THREE.PlaneGeometry(0.052, 0.084);
      const uv = p.attributes.uv, ox = (i % 2) * 0.5, oy = 1 - (Math.floor(i / 2) + 1) * 0.5;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, ox + uv.getX(k) * 0.5, oy + uv.getY(k) * 0.5);
      p.rotateX(-0.12).rotateY(Math.PI / 2 + yaw).translate(x, fy + 0.085, z);
      list.push(p);
      // The stake is a plain strip of white plastic below the tag.
      const st = new THREE.BoxGeometry(0.004, 0.09, 0.016).rotateY(yaw).translate(x - 0.002, fy + 0.025, z);
      put(st, kit.paint, new THREE.Matrix4(), 0xe8e6dc, false);
    });
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.material.side = THREE.DoubleSide;
    m.castShadow = false; m.receiveShadow = true;
    scene.add(m);
  }

  // ---------------------------------------------------------------- bumblebees (one instanced mesh)
  const bees = [];
  let beeMesh = null;
  {
    const parts = [];
    const colorize = (g, fn) => {
      const p = g.attributes.position, cs = [];
      for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i)); cs.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
      return g;
    };
    const C = (h) => new THREE.Color(h);
    const sph = (rx, ry, rz, x, y, z, fn) => colorize(new THREE.SphereGeometry(1, 8, 6).scale(rx, ry, rz).translate(x, y, z), fn);
    parts.push(sph(0.0046, 0.0044, 0.0046, 0, 0.0004, 0.0024, () => C(0xcfa21e)));                      // thorax
    parts.push(sph(0.0054, 0.0050, 0.0072, 0, -0.0002, -0.0062, (x, y, z) => (z > -0.0035 ? C(0xcfa21e) : z > -0.0085 ? C(0x16130f) : z > -0.0112 ? C(0xd8aa22) : C(0xeeeadc)))); // abdomen
    parts.push(sph(0.0027, 0.0026, 0.0028, 0, 0.0003, 0.0069, () => C(0x15120e)));                      // head
    const wing = (s) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.004, 0.0035, s * 0.0085, 0.0075, 0.0045, s * 0.0085, 0.0075, -0.0015, 0, 0.004, -0.0015], 3));
      g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
      return colorize(g, () => C(0xc9d2d6));
    };
    parts.push(wing(1), wing(-1));
    const geo = mergeGeometries(parts.map((g) => { const o = g.toNonIndexed(); for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k); return o; }), false);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const n = lite ? 3 : 6;
    beeMesh = new THREE.InstancedMesh(geo, mat, n);
    beeMesh.castShadow = true; beeMesh.receiveShadow = false; beeMesh.frustumCulled = false;
    const rnd = rngOf(999);
    for (let i = 0; i < n; i++) {
      const tgt = bloomPts[Math.floor(rnd() * bloomPts.length)] || V(-2.9, -0.5, -3.0);
      bees.push({ p: tgt.clone().add(V(0, 0.01, 0.02)), v: V(0, 0, 0), tgt: tgt.clone(), t: rnd() * 3, mode: 0, yaw: rnd() * 6.28, ph: rnd() * 6.28, fleeT: 0 });
    }
    scene.add(beeMesh);
  }

  // ---------------------------------------------------------------- CD bird scarers (instanced, swing and spin)
  const scar = [];
  let scarMesh = null;
  {
    const L = 0.24, R = 0.06;
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#b8bcc2'; g.fillRect(0, 0, 128, 128);
      if (g.createConicGradient) {
        const cg = g.createConicGradient(0.4, 64, 64);
        ['#e4e6ea', '#9fd0d8', '#e8dff0', '#d8e6b8', '#f0e0d0', '#a8b8e0', '#e4e6ea'].forEach((s, i, a) => cg.addColorStop(i / (a.length - 1), s));
        g.globalAlpha = 0.85; g.fillStyle = cg; g.fillRect(0, 0, 128, 128); g.globalAlpha = 1;
      }
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
      for (let r = 14; r < 64; r += 3) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.stroke(); }
      g.fillStyle = '#d9dbe0'; g.beginPath(); g.arc(64, 64, 17, 0, 7); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    })();
    const ring = new THREE.RingGeometry(0.0075, R, 36, 1);
    ring.translate(0, 0, 0).rotateX(0).translate(0, -L, 0);
    const str = new THREE.CylinderGeometry(0.0007, 0.0007, L, 3).translate(0, -L / 2, 0);
    const geo = mergeGeometries([plain(ring), plain(str)], false);
    // The ring is built facing +z, hanging at the end of the thread.
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, metalness: 0.75, side: THREE.DoubleSide });
    scarMesh = new THREE.InstancedMesh(geo, mat, 2);
    scarMesh.castShadow = true; scarMesh.receiveShadow = false; scarMesh.frustumCulled = false;
    const px = [W.x + 0.24, W.x + 0.13];
    for (let i = 0; i < 2; i++) scar.push({ pivot: V(px[i], apexY - 0.03 + 0.008 * (1 - i), W.z + 0.005), ax: 0, az: 0, vx: 0, vz: 0, psi: i * 1.7, wpsi: 0, rest: false });
    scene.add(scarMesh);
  }

  // ---------------------------------------------------------------- loose terracotta pots
  const mod = sim && sim.extras && sim.extras.mods.bedLeft;
  const pots = mod && mod.pots ? mod.pots : [];
  let potMesh = null;
  if (pots.length) {
    const d0 = POTS[0];
    const { rb, rt, h } = d0;
    const prof = [[0.0001, 0], [rb * 0.95, 0], [rb, 0.002], [rt * 0.97, h * 0.84], [rt * 0.99, h * 0.855], [rt * 1.07, h * 0.87], [rt * 1.075, h * 0.96], [rt * 1.04, h],
      [rt * 0.96, h], [rt * 0.9, h * 0.96], [rb * 0.9, 0.004], [0.0001, 0.004]];
    const innerFrom = 8;
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - h / 2)), 28);
    const cs = [], P = g.attributes.position, per = prof.length;
    for (let i = 0; i < P.count; i++) {
      const j = i % per, inner = j >= innerFrom;
      cs.push(inner ? 0.55 : 1, inner ? 0.36 : 0.86, inner ? 0.28 : 0.78);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    const mat = kit.terracotta.clone(); mat.vertexColors = true; mat.color.setHex(0xe0804e);
    potMesh = new THREE.InstancedMesh(g, mat, pots.length);
    potMesh.castShadow = true; potMesh.receiveShadow = true;
    scene.add(potMesh);
  }
  const _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  const posed = pots.map(() => -1);
  let clock = 0;
  pots.forEach((p, i) => {
    ctx.replayProxy(p.def.id, (o) => { posed[i] = clock; potMesh.setMatrixAt(i, _m.compose(o.position, o.quaternion, _s)); potMesh.instanceMatrix.needsUpdate = true; });
  });
  const lastP = pots.map(() => new THREE.Vector3(1e9, 0, 0)), lastQ = pots.map(() => new THREE.Quaternion());

  // ---------------------------------------------------------------- per-frame
  const _a = new THREE.Vector3(), _e = new THREE.Euler(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _u = new THREE.Vector3(0, 1, 0), _bp = new THREE.Vector3();
  const wakeNear = (p, r) => {
    const A = sim && sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.hypot(p.x - wk.hub.x, p.y - wk.hub.y, p.z - wk.hub.z) < r) return wk;
      if (wk.vg && Math.hypot(p.x - wk.hit.x, p.z - wk.hit.z) < r * 1.2 && p.y < wk.hit.y + 0.3) return wk;
    }
    return false;
  };
  const pickBloom = (b) => {
    const t = bloomPts[Math.floor(Math.random() * bloomPts.length)];
    if (t) b.tgt.copy(t);
  };
  let beeT = 0;

  return {
    update(dt, sim2, camera) {
      clock += dt;
      // Pots follow their bodies.
      if (potMesh) {
        let dirty = false;
        for (let i = 0; i < pots.length; i++) {
          if (clock - posed[i] < 0.25) continue;
          const p = pots[i];
          p.track.sample(1, _p, _q);
          if (_p.distanceToSquared(lastP[i]) < 1e-12 && Math.abs(_q.dot(lastQ[i])) > 0.9999999) continue;
          lastP[i].copy(_p); lastQ[i].copy(_q);
          potMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
          dirty = true;
        }
        if (dirty) { potMesh.instanceMatrix.needsUpdate = true; potMesh.computeBoundingSphere(); }
      }

      const far = camera && camera.position.distanceToSquared(_bp.set(W.x, fy + 0.3, W.z)) > 49;

      // Scarer discs: a damped pendulum pushed by the air, spinning when the wind catches it.
      if (scarMesh) {
        let any = false;
        for (let i = 0; i < scar.length; i++) {
          const s = scar[i];
          _a.set(s.pivot.x, s.pivot.y - 0.2, s.pivot.z);
          let ax = 0, ay = 0, az = 0;
          if (wakeNear(_a, 1.0)) { ctx.airAt(_a, _bp); ax = _bp.x; ay = _bp.y; az = _bp.z; }
          const calm = ax === 0 && az === 0 && ay === 0;
          if (calm && s.rest) continue;
          any = true;
          // Small time-steps for the stiff pendulum.
          const n = Math.max(1, Math.ceil(dt / 0.008)), h = Math.min(dt, 0.05) / n;
          for (let k = 0; k < n; k++) {
            const gx = -9.81 / 0.24 * s.ax, gz = -9.81 / 0.24 * s.az;
            const dx = (ax - s.vx * 0.24), dz = (az - s.vz * 0.24);
            const sp = Math.hypot(dx, dz) + 1e-4;
            const drag = 0.9 * sp / 0.24 * 0.9;
            s.vx += (gx + dx * drag * 0.9 + (Math.abs(ay) * 0.4) * Math.sin(clock * 11 + i) * 0.3) * h - s.vx * 0.35 * h;
            s.vz += (gz + dz * drag * 0.9) * h - s.vz * 0.35 * h;
            s.ax += s.vx * h; s.az += s.vz * h;
            s.ax = Math.max(-1.2, Math.min(1.2, s.ax)); s.az = Math.max(-1.2, Math.min(1.2, s.az));
            const target = (ax * 0.6 + az * 0.6 + ay * 0.8) * 4 * (i ? -1 : 1);
            s.wpsi += (target - s.wpsi) * 2.0 * h - s.wpsi * 0.6 * h;
            s.psi += s.wpsi * h;
          }
          s.rest = calm && Math.abs(s.ax) + Math.abs(s.az) + Math.abs(s.vx) + Math.abs(s.vz) < 0.004 && Math.abs(s.wpsi) < 0.02;
        }
        if (any || !scarMesh.userData.init) {
          scarMesh.userData.init = true;
          for (let i = 0; i < scar.length; i++) {
            const s = scar[i];
            // Displacement +x tilts the thread about +z by minus its angle.
            _qa.setFromEuler(_e.set(s.az, 0, -s.ax, 'XYZ'));
            _qb.setFromAxisAngle(_u, s.psi);
            _qa.multiply(_qb);
            scarMesh.setMatrixAt(i, _m.compose(s.pivot, _qa, _s));
          }
          scarMesh.instanceMatrix.needsUpdate = true;
        }
      }

      // Bees: forage between lavender spikes, bolt from the rotor wash.
      if (beeMesh && !far && dt > 0) {
        beeT += dt;
        for (let i = 0; i < bees.length; i++) {
          const b = bees[i];
          const wk = wakeNear(b.p, 0.6);
          if (wk && b.mode !== 2) { b.mode = 2; b.fleeT = 2.2 + Math.random() * 1.5; _a.set(b.p.x - wk.hub.x, 0, b.p.z - wk.hub.z); if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0); _a.normalize(); b.v.set(_a.x * 1.4, 0.7, _a.z * 1.4); }
          if (b.mode === 2) {
            b.fleeT -= dt;
            b.p.addScaledVector(b.v, dt);
            b.v.multiplyScalar(1 - 0.5 * dt);
            b.v.x += Math.sin(beeT * 3 + b.ph) * dt * 1.5; b.v.z += Math.cos(beeT * 2.6 + b.ph) * dt * 1.5;
            if (b.p.y > fy + 1.2) b.v.y = -0.3;
            if (b.fleeT <= 0 && !wk) { b.mode = 1; pickBloom(b); }
          } else if (b.mode === 1) {
            _a.subVectors(b.tgt, b.p);
            const dist = _a.length();
            if (dist < 0.02) { b.mode = 0; b.t = 2 + Math.random() * 4; b.v.set(0, 0, 0); }
            else { _a.multiplyScalar(1 / dist); const sp = Math.min(0.9, 0.2 + dist * 1.6); b.v.lerp(_a.multiplyScalar(sp), Math.min(1, dt * 4)); b.p.addScaledVector(b.v, dt); }
          } else {
            b.t -= dt;
            b.p.x += Math.sin(beeT * 7 + b.ph) * 0.0004; b.p.y += Math.sin(beeT * 5 + b.ph * 2) * 0.0003; b.p.z += Math.cos(beeT * 6 + b.ph) * 0.0004;
            if (b.t <= 0) { b.mode = 1; pickBloom(b); }
          }
          const sp2 = Math.hypot(b.v.x, b.v.z);
          if (sp2 > 0.08) { let dy = (Math.atan2(b.v.x, b.v.z) - b.yaw) % (Math.PI * 2); if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; b.yaw += dy * Math.min(1, dt * 6); }
          // Hovering bees tilt their tails down.
          const pitch = b.mode === 0 ? 0.55 : 0.15;
          _qa.setFromEuler(_e.set(-pitch, b.yaw, Math.sin(beeT * 40 + b.ph) * 0.05, 'YXZ'));
          beeMesh.setMatrixAt(i, _m.compose(b.p, _qa, _s));
        }
        beeMesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
