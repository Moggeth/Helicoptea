import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { registerExtraSound } from '../../../audio/extras.js';
import { ROOM } from '../../../sim/layout.js';
import { KR } from '../../../sim/extras/zones/kitchenRoom.js';
import { wakeStir } from '../chimes.js';

// kitchenRoom: the kitchen's walls, ceiling and floor edges.
//   1  coat rail on the left wall: oak board, iron hooks, a waxed raincoat, a striped scarf and a furled
//      umbrella on its crook. The three hang as little damped pendulums and swing in the rotor's wash.
//   2  a pulley clothes airer under the ceiling with a tea towel, a pillowcase and other laundry; the cloth
//      flaps in the wash (two bones each: it swings at the slat and flutters lower down).
//   3  cat bed on the front wall: bolster and cushion, a tartan blanket, two bowls on a rubber mat and a
//      loose jingle ball that wash rolls about and whose bell rings (sim: kitchenRoom).
//   4  a wicker log basket with logs and kindling.
//   5  a boot tray with a pair of wellingtons, a yard broom leaning in the corner and a dustpan on a hook.
//   6  a painted step stool in the back-left corner.
// Draw calls of its own: two skinned meshes (coat rail, airer), the tartan blanket and the jingle ball.
// Everything else goes in the shared batch.

const fy = ROOM.floorY;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler(), _a = new THREE.Vector3();
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ sound: the little bell in the ball
let lastBell = 0;
registerExtraSound('jingleBall', (audio, e, now) => {
  if (now - lastBell < 0.06) return;
  lastBell = now;
  const s = 0.3 + 0.7 * (e.strength || 0.5), o = audio.spot(e.pos);
  const k = 0.94 + Math.random() * 0.12;
  audio.tone({ freq: 3900 * k, type: 'sine', gain: 0.03 * s, attack: 0.001, decay: 0.28, out: o });
  audio.tone({ freq: 5350 * k, type: 'sine', gain: 0.022 * s, attack: 0.001, decay: 0.2, out: o });
  audio.tone({ freq: 8100 * k, type: 'sine', gain: 0.01 * s, attack: 0.001, decay: 0.1, out: o });
  audio.noiseBurst({ freq: 4200, q: 2, gain: 0.03 * s, attack: 0.001, decay: 0.03, out: o });
  audio.tone({ freq: 240, to: 180, type: 'triangle', gain: 0.03 * s, attack: 0.001, decay: 0.05, out: o });
});

// ------------------------------------------------------------------ geometry helpers
// Planar UVs in metres from the dominant normal (so grain keeps its real size on any box).
function muv(g, s = 2) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) * s, p.getY(i) * s);
    else if (ay >= az) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s);
    else uv.setXY(i, p.getX(i) * s, p.getY(i) * s);
  }
  return g;
}
function rbox(w, h, d, r = 0.003, seg = 2) {
  const rr = Math.max(0.0002, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  return muv(new RoundedBoxGeometry(w, h, d, seg, rr));
}
function sbox(w, h, d) { return muv(new THREE.BoxGeometry(w, h, d)); }
// Cylinder from a to b.
function rod(a, b, r, radial = 6, closed = true) {
  const d = _v.subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), radial, 1, !closed);
  g.applyMatrix4(new THREE.Matrix4().compose(_w.addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}
function lathe(prof, seg = 24) { return new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(Math.max(x, 0.0001), y)), seg); }
function sphere(r, sx = 1, sy = 1, sz = 1, seg = 14) { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)); g.scale(sx, sy, sz); return g; }
// A tube along a path with a radius that runs from r0 to r1.
function taperTube(pts, r0, r1, seg = 14, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg), r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}
function hash(n) { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
// A slightly varied tint: amt is the fraction of change either way.
function jit(hex, amt, seed) {
  const c = new THREE.Color(hex), k = 1 + (hash(seed) - 0.5) * 2 * amt;
  c.multiplyScalar(k);
  return c.getHex();
}

// ------------------------------------------------------------------ skinned pieces (the pendulums)
// One skinned mesh holds fabric, wood and metal parts with a vertex colour and a material index (a 5 x 1
// look-up texture gives roughness and metalness). Parts are added in world coordinates, weighted between
// the bones of a chain by their height.
const MATS = [[0.95, 0], [0.55, 0], [0.3, 1], [0.5, 0], [0.3, 0]]; // fabric, wood, metal, leather, gloss
class Skin {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.si = []; this.sw = []; this.bones = []; }
  // pivot: world point the bone turns about; dyn: its swing model (see Group.step).
  bone(pivot, parent, dyn) { this.bones.push({ pivot: pivot.clone(), parent, dyn }); return this.bones.length - 1; }
  add(geo, matrix, chain, color, mat = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, c = new THREE.Color(color);
    const ys = chain.map((b) => this.bones[b].pivot.y);
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      this.pos.push(P.getX(i), y, P.getZ(i));
      this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      this.uv.push((mat + 0.5) / MATS.length, 0.5);
      this.col.push(c.r, c.g, c.b);
      let k = 0;
      while (k < chain.length - 1 && y < ys[k + 1]) k++;
      if (k >= chain.length - 1 || y >= ys[k]) { this.si.push(chain[Math.min(k, chain.length - 1)], 0, 0, 0); this.sw.push(1, 0, 0, 0); }
      else { const f = (ys[k] - y) / (ys[k] - ys[k + 1]); this.si.push(chain[k], chain[k + 1], 0, 0); this.sw.push(1 - f, f, 0, 0); }
    }
    g.dispose();
    geo.dispose();
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    const mesh = new THREE.SkinnedMesh(g, material);
    const objs = this.bones.map((b) => { const o = new THREE.Bone(); o.position.copy(b.pivot); return o; });
    this.bones.forEach((b, i) => {
      if (b.parent >= 0) { objs[b.parent].add(objs[i]); objs[i].position.copy(b.pivot).sub(this.bones[b.parent].pivot); } else mesh.add(objs[i]);
    });
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(objs));
    mesh.castShadow = false; // bones move under a still mesh: the shadow cache would keep a stale shadow
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 0.15;
    mesh.frustumCulled = true;
    mesh.userData.bones = objs;
    return mesh;
  }
}
function skinMaterial() {
  const d = new Uint8Array(MATS.length * 4);
  MATS.forEach(([r, m], i) => { d[i * 4] = 255; d[i * 4 + 1] = Math.round(r * 255); d[i * 4 + 2] = Math.round(m * 255); d[i * 4 + 3] = 255; });
  const tex = new THREE.DataTexture(d, MATS.length, 1);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, roughnessMap: tex, metalnessMap: tex, side: THREE.DoubleSide, envMapIntensity: 1.1 });
}

// Swing model of a group of bones: each bone is a damped pendulum in two angles (th.x about z, which
// moves the free end towards +x; th.y about x, towards +z) driven by the air at its probe point.
class Group {
  constructor(name, centre, radius, skin, mesh) {
    this.name = name; this.centre = centre; this.radius = radius; this.mesh = mesh;
    this.links = skin.bones.map((b, i) => {
      const d = b.dyn || {};
      return {
        bone: mesh.userData.bones[i], L: d.L ?? 0.3, w0x: d.w0x ?? 25, w0z: d.w0z ?? 25, damp: d.damp ?? 1, g: d.g ?? 1, cx: d.cx ?? 1, cz: d.cz ?? 1,
        rest: new THREE.Vector2(d.restX || 0, d.restZ || 0), minX: d.minX ?? -9, lim: d.lim ?? 0.9,
        th: new THREE.Vector2(d.restX || 0, d.restZ || 0), om: new THREE.Vector2(), probe: new THREE.Vector3(b.pivot.x, b.pivot.y - (d.L ?? 0.3), b.pivot.z),
        air: new THREE.Vector3(), seed: i * 1.7 + 0.3,
      };
    });
    this.active = false; this.near = false; this.acc = 0;
    this.pose();
  }
  pose() {
    for (const l of this.links) { _e.set(-l.th.y, 0, l.th.x); l.bone.quaternion.setFromEuler(_e); }
  }
  step(h) {
    let energy = 0;
    for (const l of this.links) {
      const a = l.air;
      const rx = a.x - l.om.x * l.L, rz = a.z - l.om.y * l.L;
      const sp = Math.hypot(rx, rz, a.y * 0.3);
      l.om.x += (-l.w0x * (l.th.x - l.rest.x) - l.damp * l.om.x + l.g * l.cx * rx * sp) * h;
      l.om.y += (-l.w0z * (l.th.y - l.rest.y) - l.damp * l.om.y + l.g * l.cz * rz * sp) * h;
      l.th.x += l.om.x * h; l.th.y += l.om.y * h;
      if (l.th.x < l.minX) { l.th.x = l.minX; if (l.om.x < 0) l.om.x *= -0.25; }
      const m = Math.hypot(l.th.x, l.th.y);
      if (m > l.lim) { l.th.multiplyScalar(l.lim / m); l.om.multiplyScalar(0.5); }
      energy += Math.abs(l.th.x - l.rest.x) + Math.abs(l.th.y - l.rest.y) + Math.abs(l.om.x) + Math.abs(l.om.y) * 0.5;
    }
    return energy;
  }
}

// ------------------------------------------------------------------ the module
export function build(ctx) {
  const K = ctx.kit, lite = ctx.lite, scene = ctx.scene, B = ctx.batch;
  const sim = ctx.sim;
  const mod = sim && sim.extras && sim.extras.mods.kitchenRoom;
  const put = (g, mat, m, color, o) => B.add(g, mat, m, color, o);
  const at = (g, mat, x, y, z, ry, rx, rz, color, o) => B.add(g, mat, ctx.T(x, y, z, ry, rx, rz), color, o);
  const small = { cast: false, receive: true };
  // A local frame: parts given relative to a position and yaw.
  const frame = (x, y, z, yaw = 0) => {
    const F = ctx.T(x, y, z, yaw);
    return (g, mat, lx, ly, lz, ry, rx, rz, color, o) => B.add(g, mat, F.clone().multiply(ctx.T(lx, ly, lz, ry, rx, rz)), color, o);
  };
  const skMat = skinMaterial();
  const groups = [];

  // ================================================================ 1. coat rail
  const R = KR.rail;
  const hookP = (z) => new THREE.Vector3(R.x + 0.04, R.y + 0.008, z); // where things hang
  {
    const zc = (R.z0 + R.z1) / 2, len = R.z1 - R.z0;
    at(rbox(0.024, 0.085, len, 0.008, 3), K.wood, R.x + 0.012, R.y, zc, 0, 0, 0, 0x7d4e2a);
    at(rbox(0.034, 0.012, len + 0.008, 0.005, 3), K.wood, R.x + 0.017, R.y + 0.0475, zc, 0, 0, 0, 0x6f4425, small);
    at(rbox(0.03, 0.01, len + 0.004, 0.004, 3), K.wood, R.x + 0.015, R.y - 0.0475, zc, 0, 0, 0, 0x6f4425, small);
    for (const z of [R.z0 + 0.025, R.z1 - 0.025]) {
      at(new THREE.CylinderGeometry(0.0075, 0.0075, 0.004, 10), K.brass, R.x + 0.026, R.y + 0.02, z, 0, 0, Math.PI / 2, 0xb08d4a, small);
    }
    for (const z of R.hooks) {
      const p = hookP(z);
      // Round base plate, then a cast-iron arm out and up to a ball.
      at(new THREE.CylinderGeometry(0.0155, 0.0165, 0.006, 16), K.iron, R.x + 0.027, R.y, z, 0, 0, Math.PI / 2, 0x1d1b19, small);
      at(new THREE.SphereGeometry(0.0095, 10, 8), K.iron, R.x + 0.032, R.y, z, 0, 0, 0, 0x1d1b19, small);
      put(taperTube([new THREE.Vector3(R.x + 0.03, R.y, z), new THREE.Vector3(R.x + 0.05, R.y, z), new THREE.Vector3(R.x + 0.064, R.y + 0.005, z), new THREE.Vector3(R.x + 0.07, R.y + 0.02, z), new THREE.Vector3(R.x + 0.068, R.y + 0.036, z)], 0.0075, 0.0045, 10, 8), K.iron, null, 0x1d1b19, small);
      at(new THREE.SphereGeometry(0.0085, 10, 8), K.iron, R.x + 0.067, R.y + 0.042, z, 0, 0, 0, 0x1d1b19, small);
      void p;
    }
  }

  const coatSkin = new Skin();
  {
    const S = coatSkin;
    // ---- raincoat (a waxed jacket) on the fourth hook
    const zc = R.hooks[3], P = hookP(zc), backX = R.x + 0.03;
    const b0 = S.bone(P, -1, { L: 0.42, w0x: 22, w0z: 22, damp: 1.5, g: 1.7, cx: 1, cz: 0.6, minX: -0.03, lim: 0.6 });
    const b1 = S.bone(new THREE.Vector3(P.x, P.y - 0.32, P.z), b0, { L: 0.36, w0x: 28, w0z: 28, damp: 1.1, g: 2.6, cx: 1, cz: 0.7, minX: -0.05, lim: 0.5 });
    const chain = [b0, b1];
    const COAT = [[0, 0.05, 0.035], [-0.03, 0.11, 0.055], [-0.07, 0.16, 0.085], [-0.15, 0.172, 0.1], [-0.32, 0.176, 0.112], [-0.55, 0.18, 0.118], [-0.76, 0.19, 0.122]];
    const sec = (y) => {
      for (let i = 0; i < COAT.length - 1; i++) if (y >= COAT[i + 1][0]) {
        const f = (COAT[i][0] - y) / (COAT[i][0] - COAT[i + 1][0]);
        return [COAT[i][1] + (COAT[i + 1][1] - COAT[i][1]) * f, COAT[i][2] + (COAT[i + 1][2] - COAT[i][2]) * f];
      }
      return [COAT[COAT.length - 1][1], COAT[COAT.length - 1][2]];
    };
    const oy = P.y - 0.016; // the coat hangs from a loop just below the arm
    const frontX = (y, z) => { const [hw, hd] = sec(y); const t = Math.max(0, 1 - (z / hw) ** 2); return backX + hd * (1 + Math.sqrt(t)); };
    const loft = (y0, y1, rings, seg, grow = 1) => {
      const pos = [], idx = [];
      for (let j = 0; j <= rings; j++) {
        const y = y0 + (y1 - y0) * j / rings;
        const [hw0, hd0] = sec(y), hw = hw0 * grow, hd = hd0 * grow;
        const fk = Math.min(1, -y / 0.5);
        for (let i = 0; i < seg; i++) {
          const a = i / seg * TAU, c = Math.cos(a), s = Math.sin(a);
          const fold = 0.05 * fk * (Math.sin(a * 5 + 1.3 + y * 5) + 0.6 * Math.sin(a * 8 + 0.5 - y * 7)) + 0.02 * fk * Math.sin(a * 3 + y * 3);
          pos.push(Math.max(backX, backX + hd * (1 + c * (1 + fold))), oy + y, zc + hw * s * (1 + fold));
        }
      }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const a = j * seg + i, b = j * seg + (i + 1) % seg, c2 = a + seg, d = b + seg;
        idx.push(a, c2, b, b, c2, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const seg = lite ? 16 : 26;
    S.add(loft(-0.03, -0.76, lite ? 14 : 24, seg), null, chain, 0x46532f, 0);
    S.add(loft(0, -0.05, 3, seg, 1.1), null, chain, 0x3a2a1c, 0);              // corduroy collar
    // Dark lining showing at the hem.
    {
      const [hw, hd] = sec(-0.7);
      const g = new THREE.CircleGeometry(1, seg);
      g.rotateX(Math.PI / 2);
      g.scale(hd, 1, hw);
      S.add(g, ctx.T(backX + hd, oy - 0.69, zc), chain, 0x17130f, 0);
    }
    // Hanging loop round the arm and down to the collar.
    {
      const g = new THREE.TorusGeometry(0.012, 0.0028, 6, 14);
      g.rotateY(Math.PI / 2);
      S.add(g, ctx.T(P.x, P.y + 0.0, P.z), chain, 0x3d4a2a, 0);
      S.add(sbox(0.004, 0.03, 0.014), ctx.T(P.x + 0.012, P.y - 0.008, P.z), chain, 0x3d4a2a, 0);
    }
    // Sleeves: hung down at the sides, a little forward, ending in knitted cuffs.
    for (const sd of [-1, 1]) {
      const pts = [[backX + 0.085, -0.075, sd * 0.158], [backX + 0.105, -0.2, sd * 0.19], [backX + 0.108, -0.42, sd * 0.2], [backX + 0.1, -0.64, sd * 0.19]]
        .map(([x, y, z]) => new THREE.Vector3(x, oy + y, zc + z));
      S.add(taperTube(pts, 0.05, 0.036, 14, 10), null, chain, 0x46532f, 0);
      const e0 = pts[3].clone(), e1 = pts[3].clone().add(new THREE.Vector3(-0.002, -0.05, sd * -0.002));
      S.add(rod(e0, e1, 0.034, 10), null, chain, 0x23221f, 0);
    }
    // Patch pockets with flaps and a brass stud, and the storm flap down the front with its studs.
    for (const sd of [-1, 1]) {
      const z = sd * 0.082, y = -0.42, fx = frontX(y, z);
      const ang = Math.atan2(-(frontX(y, z + 0.01) - frontX(y, z - 0.01)), 0.02) * -1;
      const m = ctx.T(fx + 0.002, oy + y, zc + z, ang);
      S.add(rbox(0.012, 0.12, 0.105, 0.003), m, chain, 0x3f4c2b, 0);
      S.add(rbox(0.016, 0.04, 0.11, 0.003), m.clone().multiply(ctx.T(0.003, 0.056, 0)), chain, 0x3a4727, 0);
      S.add(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10), m.clone().multiply(ctx.T(0.011, 0.046, 0, 0, 0, Math.PI / 2)), chain, 0xb08d4a, 2);
    }
    {
      const nSeg = 17;
      for (let k = 0; k < nSeg; k++) {
        const y0 = -0.04 - k * 0.0425, ym = y0 - 0.02125;
        S.add(sbox(0.006, 0.0446, 0.05), ctx.T(frontX(ym, 0) + 0.001, oy + ym, zc, 0), chain, 0x42502b, 0);
      }
      for (let k = 0; k < 5; k++) { const y1 = -0.15 - k * 0.14; S.add(new THREE.CylinderGeometry(0.0048, 0.0048, 0.004, 10), ctx.T(frontX(y1, 0.017) + 0.005, oy + y1, zc + 0.017, 0, 0, Math.PI / 2), chain, 0xb08d4a, 2); }
      S.add(rbox(0.004, 0.7, 0.003, 0.001, 1), ctx.T(frontX(-0.4, -0.004) + 0.004, oy - 0.4, zc - 0.004), chain, 0x2b3320, 0);
      S.add(loft(-0.31, -0.355, 3, seg, 1.012), null, chain, 0x3b4827, 0);                                   // drawcord channel
      S.add(loft(-0.725, -0.76, 2, seg, 1.008), null, chain, 0x3b4827, 0);                                    // hem band
    }
    // Waist drawcord toggles and a little hood cord at the neck.
    for (const sd of [-1, 1]) {
      S.add(rod(new THREE.Vector3(frontX(-0.07, sd * 0.03) + 0.003, oy - 0.07, zc + sd * 0.03), new THREE.Vector3(frontX(-0.15, sd * 0.034) + 0.003, oy - 0.15, zc + sd * 0.034), 0.0018, 4), null, chain, 0x1d211a, 0);
    }

    // ---- furled umbrella on the second hook, hung by its crook
    {
      const zk = R.hooks[1], Pu = hookP(zk), rh = 0.0105, Rc = 0.026, yc = Pu.y + 0.0055 - Rc + rh;
      const bu = S.bone(Pu, -1, { L: 0.45, w0x: 21, w0z: 21, damp: 0.55, g: 1.3, cx: 0.7, cz: 0.7, minX: -0.07, lim: 0.6, restX: 0, restZ: -0.06 });
      const ch = [bu];
      const pts = [new THREE.Vector3(Pu.x, yc - 0.04, zk - Rc)];
      for (let i = 0; i <= 10; i++) { const a = Math.PI - i / 10 * Math.PI; pts.push(new THREE.Vector3(Pu.x, yc + Math.sin(a) * Rc, zk + Math.cos(a) * Rc)); }
      pts.push(new THREE.Vector3(Pu.x, yc - 0.05, zk + Rc));
      pts.push(new THREE.Vector3(Pu.x, yc - 0.12, zk + Rc));
      S.add(taperTube(pts, rh * 0.85, rh, 28, 8), null, ch, 0x5b3a22, 1);
      S.add(rod(new THREE.Vector3(Pu.x, yc - 0.12, zk + Rc), new THREE.Vector3(Pu.x, yc - 0.135, zk + Rc), 0.0125, 10), null, ch, 0xb08d4a, 2);
      // The furled canopy: folds twisted round the shaft, a strap and a brass ferrule.
      const top = yc - 0.135, len = 0.68, seg = 10, radial = 16;
      const pos = [], idx = [];
      const prof = (t) => 0.011 + 0.026 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62 + 0.15) * (1 - Math.pow(t, 3) * 0.7) * (t > 0.92 ? 1 - (t - 0.92) * 8 : 1);
      for (let j = 0; j <= 24; j++) {
        const t = j / 24, y = top - t * len, r = Math.max(0.0035, prof(t));
        for (let i = 0; i < radial; i++) {
          const a = i / radial * TAU, f = 1 + 0.17 * Math.cos(a * 4 + t * 7) * Math.min(1, t * 5);
          pos.push(Pu.x + Math.cos(a) * r * f, y, zk + Rc + Math.sin(a) * r * f);
        }
      }
      for (let j = 0; j < 24; j++) for (let i = 0; i < radial; i++) {
        const a = j * radial + i, b = j * radial + (i + 1) % radial, c2 = a + radial, d = b + radial;
        idx.push(a, c2, b, b, c2, d);
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals();
      S.add(cg, null, ch, 0x1f2a45, 0);
      S.add(lathe([[0.034, 0], [0.037, 0.006], [0.037, 0.03], [0.034, 0.036], [0.031, 0.036], [0.031, 0]], 14), ctx.T(Pu.x, top - len * 0.55 - 0.036, zk + Rc), ch, 0xd9cdb0, 0);
      S.add(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), ctx.T(Pu.x + 0.036, top - len * 0.55 - 0.018, zk + Rc, 0, 0, Math.PI / 2), ch, 0xb08d4a, 2);
      S.add(lathe([[0.0015, 0.0], [0.004, 0.012], [0.0045, 0.05], [0.0055, 0.056], [0.0001, 0.056]], 8), ctx.T(Pu.x, top - len + 0.002, zk + Rc, 0, Math.PI), ch, 0xb08d4a, 2);
      void ch;
    }

    // ---- striped knitted scarf on the first hook
    {
      const zs = R.hooks[0], Ps = hookP(zs);
      const bs0 = S.bone(Ps, -1, { L: 0.25, w0x: 36, w0z: 36, damp: 0.9, g: 4.5, cx: 1, cz: 0.4, minX: -0.02, lim: 0.9 });
      const bs1 = S.bone(new THREE.Vector3(Ps.x, Ps.y - 0.2, Ps.z), bs0, { L: 0.2, w0x: 46, w0z: 46, damp: 0.75, g: 6.5, cx: 1, cz: 0.4, minX: -0.04, lim: 0.9 });
      const ch = [bs0, bs1];
      const cols = [0xe4d8bb, 0xa6322d, 0xe4d8bb, 0x233a5e, 0xe4d8bb, 0xa6322d];
      const wS = 0.075;
      // Over the arm, then a long tail in front and a short one behind.
      S.add(rbox(0.036, 0.016, wS, 0.006), ctx.T(Ps.x + 0.003, Ps.y + 0.0105, Ps.z), ch, 0xe4d8bb, 0);
      for (const [dx, len, ph] of [[0.0155, 0.52, 0], [-0.0075, 0.37, 2]]) {
        const rows = Math.round(len / 0.028);
        for (let k = 0; k < rows; k++) {
          const y = Ps.y - 0.004 - k * 0.028 - 0.014;
          S.add(sbox(0.012, 0.0288, wS), ctx.T(Ps.x + dx, y, Ps.z), ch, jit(cols[Math.floor((k + ph) / 2) % cols.length], 0.04, k + dx * 99), 0);
        }
        const yb = Ps.y - 0.004 - rows * 0.028;
        for (let k = 0; k < 9; k++) {
          S.add(rbox(0.0035, 0.045, 0.0035, 0.0012, 1), ctx.T(Ps.x + dx + (k % 2 ? 0.002 : -0.002), yb - 0.02, Ps.z - wS / 2 + 0.006 + k * (wS - 0.012) / 8), ch, 0xe4d8bb, 0);
        }
      }
    }
  }
  const coatMesh = coatSkin.build(skMat);
  scene.add(coatMesh);
  groups.push(new Group('coat', new THREE.Vector3(-2.25, 0.2, 0.5), 1.35, coatSkin, coatMesh));

  // ================================================================ 2. clothes airer
  const A = KR.airer;
  const airSkin = new Skin();
  {
    const zs = Array.from({ length: A.slats }, (_, i) => A.z + (i - (A.slats - 1) / 2) * A.gap);
    const zLo = zs[0] - 0.03, zHi = zs[A.slats - 1] + 0.03;
    const ex = [A.x0 + 0.07, A.x1 - 0.07], yBar = A.y - 0.0345, ceil = ROOM.ceilingY;
    zs.forEach((z, i) => at(rbox(A.x1 - A.x0, 0.026, 0.026, 0.0065, 2), K.wood, (A.x0 + A.x1) / 2, A.y, z, 0, 0, 0, jit(0xc8a56e, 0.07, i + 5)));
    for (const x of ex) {
      // Iron end frame: a bar across the slats, a standard with braces and an eye, and scrolled ends.
      at(rbox(0.024, 0.016, zHi - zLo + 0.02, 0.004), K.iron, x, yBar, A.z, 0, 0, 0, 0x201e1c);
      for (const z of zs) {
        at(rbox(0.032, 0.012, 0.03, 0.003), K.iron, x, yBar + 0.0135, z, 0, 0, 0, 0x201e1c, small);
        for (const s of [-1, 1]) at(rbox(0.032, 0.026, 0.004, 0.0015, 1), K.iron, x, yBar + 0.024, z + s * 0.0185, 0, 0, 0, 0x201e1c, small);
      }
      at(rbox(0.016, 0.1, 0.016, 0.004), K.iron, x, A.y + 0.04, A.z, 0, 0, 0, 0x201e1c);
      for (const s of [-1, 1]) {
        put(rod(new THREE.Vector3(x, yBar, A.z + s * (zHi - zLo) / 2), new THREE.Vector3(x, A.y + 0.07, A.z + s * 0.012), 0.0042, 6), K.iron, null, 0x201e1c, small);
        at(new THREE.TorusGeometry(0.02, 0.0045, 6, 14, Math.PI * 1.5), K.iron, x, yBar - 0.012, A.z + s * ((zHi - zLo) / 2 + 0.014), 0, 0, s > 0 ? 0.6 : -0.6 + Math.PI, 0x201e1c, small);
        void s;
      }
      at(new THREE.TorusGeometry(0.0125, 0.003, 6, 14), K.iron, x, A.y + 0.098, A.z, Math.PI / 2, 0, 0, 0x201e1c, small);
      // Rope to the ceiling pulley.
      put(rod(new THREE.Vector3(x, A.y + 0.098, A.z), new THREE.Vector3(x, ceil - 0.045, A.z), 0.0033, 6), K.fabric, null, 0xdcd1b6, small);
      at(rbox(0.05, 0.036, 0.03, 0.006), K.iron, x, ceil - 0.036, A.z, 0, 0, 0, 0x2a2826, small);
      at(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 14), K.iron, x, ceil - 0.036, A.z, 0, Math.PI / 2, 0, 0x4a4743, small);
      at(new THREE.CylinderGeometry(0.036, 0.04, 0.007, 14), K.iron, x, ceil - 0.0035, A.z, 0, 0, 0, 0x201e1c, small);
      put(rod(new THREE.Vector3(x, ceil - 0.018, A.z), new THREE.Vector3(x, ceil - 0.004, A.z), 0.012, 8), K.iron, null, 0x201e1c, small);
    }

    // ---- the laundry: each piece hangs over a slat as two sheets that swing about the slat and flutter lower down
    const hang = (slat, x, w, drop, rows, opts = {}) => {
      const z = zs[slat], top = A.y + 0.0135;
      const b0 = airSkin.bone(new THREE.Vector3(x, top, z), -1, { L: drop * 0.4, w0x: 160, w0z: 9.81 / (drop * 0.45), damp: 0.7, g: 12, cx: 0.1, cz: 1, lim: 0.7 });
      const b1 = airSkin.bone(new THREE.Vector3(x, top - drop * 0.45, z), b0, { L: drop * 0.3, w0x: 160, w0z: 9.81 / (drop * 0.3) * 1.4, damp: 0.55, g: 18, cx: 0.1, cz: 1, lim: 0.9 });
      const ch = [b0, b1];
      const th = opts.thick || 0.0045, off = 0.0185 + th / 2;
      airSkin.add(rbox(w, 0.0045, 0.052, 0.002, 1), ctx.T(x, top + 0.0005, z), ch, rows[0][1], 0);
      for (const sd of [-1, 1]) {
        const d = drop * (sd < 0 ? 0.93 : 1);
        let y = top - 0.002;
        const zz = z + sd * off;
        for (const [h, col] of rows) {
          const hh = Math.min(h * d / drop, y - (top - d));
          if (hh <= 0.0005) break;
          const q = new THREE.PlaneGeometry(w, hh, Math.max(4, Math.round(w / 0.03)), 2);
          const qp = q.attributes.position;
          for (let vi = 0; vi < qp.count; vi++) {
            const px = qp.getX(vi), py = qp.getY(vi) + y - hh / 2, k = (top - py) / d;
            qp.setZ(vi, 0.0045 * Math.sin(px * 38 + sd * 1.3 + slat * 2.1 + k * 3) * (0.35 + k) + 0.003 * Math.sin(px * 71 + slat));
          }
          q.computeVertexNormals();
          q.rotateY(sd < 0 ? Math.PI : 0);
          airSkin.add(q, ctx.T(x, y - hh / 2, zz), ch, jit(col, 0.025, y * 99 + sd), 0);
          y -= hh;
        }
        // Side edges and hem of the folded cloth so it has some thickness.
        airSkin.add(sbox(0.003, d, off * 2 - 0.0005 + 0.003), ctx.T(x - w / 2, top - d / 2, z), ch, jit(rows[0][1], 0.04, 5 + sd), 0);
        airSkin.add(sbox(0.003, d, off * 2 - 0.0005 + 0.003), ctx.T(x + w / 2, top - d / 2, z), ch, jit(rows[0][1], 0.04, 7 + sd), 0);
        if (opts.hem) airSkin.add(new THREE.PlaneGeometry(w, 0.008).rotateY(sd < 0 ? Math.PI : 0), ctx.T(x, top - d + 0.004, zz), ch, opts.hem, 0);
      }
      // Pegs.
      if (opts.pegs) for (const px of [-w / 2 + 0.03, w / 2 - 0.03]) {
        airSkin.add(rbox(0.012, 0.05, 0.0165 * 2 + th * 2 + 0.002, 0.002, 1), ctx.T(x + px, top - 0.006, z), ch, 0xc4a068, 1);
        airSkin.add(rbox(0.014, 0.012, 0.0165 * 2 + th * 2 + 0.006, 0.002, 1), ctx.T(x + px, top - 0.034, z), ch, 0xb89258, 1);
      }
    };
    const cream = 0xe6dfcd;
    const towel = (c) => [[0.255, cream], [0.012, c], [0.012, cream], [0.012, c], [0.2, cream]];
    hang(0, 0.95, 0.3, 0.4, towel(0xb3322c), { hem: 0xd9d1bd });
    hang(2, 1.2, 0.4, 0.52, [[0.6, 0xa9b9c8]], { pegs: true, hem: 0x95a8bb });
    hang(4, 1.52, 0.3, 0.4, [[0.04, 0x35507f], [0.04, cream], [0.04, 0x35507f], [0.04, cream], [0.04, 0x35507f], [0.04, cream], [0.04, 0x35507f], [0.04, cream], [0.04, 0x35507f], [0.04, cream], [0.04, 0x35507f]], { hem: 0x35507f });
    hang(5, 0.88, 0.26, 0.34, [[0.07, 0x7d9677], [0.34, 0x8da586]], { thick: 0.0065, hem: 0x6c8467 });
    hang(1, 1.58, 0.085, 0.19, [[0.2, 0x2c3f63]], { thick: 0.012 });  // socks
    hang(1, 1.67, 0.085, 0.19, [[0.2, 0x8c8a85]], { thick: 0.012 });
    hang(3, 1.0, 0.2, 0.2, [[0.3, 0xdcc27a]], { thick: 0.0055 });     // a dishcloth
  }
  {
    // The airer is an iron-and-pine rack: static; its rope passes the pulley and ties off on a wall cleat (skipped).
  }
  const airMesh = airSkin.build(skMat);
  scene.add(airMesh);
  groups.push(new Group('airer', new THREE.Vector3((A.x0 + A.x1) / 2, 1.0, A.z), 1.5, airSkin, airMesh));

  // ================================================================ 3. cat bed, bowls, blanket, jingle ball
  const Bd = KR.bed;
  {
    const f = frame(Bd.x, fy, Bd.z, 0);
    f(lathe([[0, 0], [0.245, 0], [0.258, 0.008], [0.261, 0.026], [0.252, 0.04], [0.2, 0.046], [0.0, 0.046]], 40), K.fabric, 0, 0, 0, 0, 0, 0, 0x5f5040, small);
    const bol = new THREE.TorusGeometry(0.2, 0.055, lite ? 10 : 14, lite ? 28 : 44);
    bol.rotateX(Math.PI / 2); bol.scale(1, 0.95, 1);
    f(bol, K.fabric, 0, 0.066, 0, 0, 0, 0, 0x8f7e66);
    // Quilted bolster seams and piping.
    for (let i = 0; i < (lite ? 8 : 14); i++) {
      const a = i / (lite ? 8 : 14) * TAU;
      f(new THREE.TorusGeometry(0.0548, 0.0016, 4, 12), K.fabric, Math.cos(a) * 0.2, 0.066, Math.sin(a) * 0.2, -a + Math.PI / 2, 0, 0, 0x6f604b, small);
    }
    f(lathe([[0, 0.055], [0.05, 0.056], [0.1, 0.061], [0.15, 0.071], [0.172, 0.064], [0.172, 0.0], [0, 0]], 40), K.fabric, 0, 0, 0, 0, 0, 0, 0xcdbfa1, { cast: false, receive: true });
    f(new THREE.SphereGeometry(0.007, 8, 6), K.fabric, 0, 0.056, 0, 0, 0, 0, 0x5a4a38, small);
  }
  // Tartan blanket (own material: a printed canvas, so one draw call).
  const tartan = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.fillStyle = '#1d4a35'; g.fillRect(0, 0, 256, 256);
    const bands = [[0, 36, '#1b2a55', 1], [48, 6, '#a3232a', 0.85], [64, 3, '#e6d9a8', 0.8], [86, 3, '#e6d9a8', 0.8], [104, 24, '#14301f', 0.6], [136, 6, '#a3232a', 0.85], [160, 36, '#1b2a55', 1], [214, 3, '#d9b648', 0.85], [230, 12, '#14301f', 0.6]];
    for (const [p, w, col, al] of bands) { g.globalAlpha = al * 0.8; g.fillStyle = col; g.fillRect(p, 0, w, 256); g.fillRect(0, p, 256, w); }
    g.globalAlpha = 0.18; // twill diagonal
    for (let i = -256; i < 512; i += 3) { g.strokeStyle = i % 6 ? '#000' : '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  })();
  {
    const nu = lite ? 20 : 34, nv = lite ? 22 : 38, W = 0.48, H = 0.5, yaw = 0.5;
    const cx = Bd.x + 0.07, cz = Bd.z - 0.17, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const bedH = (r) => {
      let y = 0;
      if (r < 0.172) y = 0.056 + 0.017 * Math.pow(r / 0.172, 2.2);
      const dr = r - 0.2;
      if (r > 0.145 && r < 0.255) y = Math.max(y, 0.066 + Math.sqrt(Math.max(0, 0.055 * 0.055 - dr * dr)) * 0.95);
      if (r >= 0.255) y = Math.max(0, 0.066 - (r - 0.255) * 1.15);
      return y;
    };
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const lx = (i / nu - 0.5) * W, lz = (j / nv - 0.5) * H;
      const wx = cx + lx * cy + lz * sy, wz = cz - lx * sy + lz * cy;
      const r = Math.hypot(wx - Bd.x, wz - Bd.z);
      const h = bedH(r);
      const fold = h > 0.012 ? 0.0065 * Math.sin(lx * 23 + lz * 7) * Math.sin(lz * 15 - lx * 4 + 1) + 0.004 * Math.sin(lx * 41 + lz * 29) : 0.0014 * Math.sin(lx * 30);
      const edge = (i === 0 || i === nu || j === 0 || j === nv) ? 0.0015 : 0;
      pos.push(wx, fy + Math.max(0.0035, h + 0.0115 + fold) + edge, wz);
      uv.push(lx * 7.5, lz * 7.5);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c2 = a + nu + 1, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tartan, roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
    scene.add(m);
  }
  // Mat and bowls.
  {
    const M = KR.mat, f = frame(M.x, fy, M.z, M.yaw);
    f(rbox(0.4, 0.008, 0.21, 0.0035), K.rubber, 0, 0.004, 0, 0, 0, 0, 0x3a6a66, small);
    f(rbox(0.38, 0.0042, 0.19, 0.002), K.rubber, 0, 0.0085, 0, 0, 0, 0, 0x2f5a56, small);
    const bowl = (ox, rimCol, water) => {
      const rT = 0.063, rB = 0.044, h = 0.05;
      f(lathe([[0.0, 0.0], [rB, 0.0], [rB + 0.002, 0.005], [rT, h], [rT - 0.005, h], [rT - 0.007, h - 0.004], [rB - 0.002, 0.009], [0, 0.009]], 32), K.ceramic, ox, 0.008, 0, 0, 0, 0, 0xeee7d8);
      f(lathe([[rT - 0.0005, h - 0.011], [rT + 0.0004, h - 0.011], [rT + 0.0004, h], [rT - 0.0005, h]], 32), K.ceramic, ox, 0.008, 0, 0, 0, 0, rimCol, small);
      f(lathe([[rB, 0.004], [rB + 0.0025, 0.004], [rB + 0.0025, 0.0], [rB, 0]], 28), K.ceramic, ox, 0.008, 0, 0, 0, 0, 0x4d423a, small);
      if (water) f(new THREE.CylinderGeometry(0.0555, 0.0535, 0.003, 28), K.glass, ox, 0.008 + 0.034, 0, 0, 0, 0, 0xb4dcec, small);
      else {
        const n = lite ? 12 : 30;
        for (let i = 0; i < n; i++) {
          const a = i * 2.399, rr = Math.sqrt((i + 0.5) / n) * 0.049, hgt = 0.0095 + 0.0125 * (1 - (rr / 0.049) ** 2) + (i % 3) * 0.003;
          f(sphere(0.0065, 1.1, 0.7, 0.9, 6), K.rubber, ox + Math.cos(a) * rr, 0.008 + hgt, Math.sin(a) * rr, a, 0.3 * ((i % 5) - 2) / 2, 0, jit(i % 2 ? 0x6e4a2c : 0x8b5e36, 0.12, i), small);
        }
      }
    };
    bowl(-0.095, 0xb5534a, false);
    bowl(0.095, 0x3f6aa6, true);
  }

  // The jingle ball (dynamic): red with cream slots and a gold bell inside you can hear but not see.
  let ballMesh = null;
  if (mod && mod.ball) {
    const D = KR.ball;
    const parts = [];
    const sph = new THREE.SphereGeometry(D.r, 24, 16).toNonIndexed();
    const cols = [];
    const c0 = new THREE.Color(0xc03a2e), c1 = new THREE.Color(0xe9dcc0);
    const P = sph.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i) / D.r, x = P.getX(i) / D.r, z = P.getZ(i) / D.r;
      const band = Math.sin(Math.atan2(z, x) * 3 + 0.4) > 0.86 || Math.abs(y) > 0.93 ? 1 : 0;
      const c = band ? c1 : c0; cols.push(c.r, c.g, c.b);
    }
    sph.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    parts.push(sph);
    const merged = sph;
    ballMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 }));
    ballMesh.castShadow = true; ballMesh.receiveShadow = true;
    scene.add(ballMesh);
    ballMesh.position.set(D.x, fy + D.r, D.z);
  }

  // ================================================================ 4. wicker log basket
  {
    const Kb = KR.basket, f = frame(Kb.x, fy, Kb.z, 0.4);
    const h = Kb.h, rb = 0.15, rt = Kb.r;
    const rAt = (y) => rb + (rt - rb) * Math.pow(y / h, 0.85);
    f(lathe([[0, 0.012], [rb - 0.005, 0.01], [rb + 0.004, 0.03], [rt - 0.01, h * 0.55], [rt, h - 0.005], [rt - 0.012, h - 0.003], [rt - 0.014, 0.05], [0, 0.04]], 36), K.wicker, 0, 0, 0, 0, 0, 0, 0xb48f56);
    const rings = lite ? 8 : 14;
    for (let i = 0; i < rings; i++) {
      const y = 0.03 + i * (h - 0.05) / (rings - 1);
      const g = new THREE.TorusGeometry(rAt(y) + 0.002, 0.0048, 5, lite ? 22 : 36);
      g.rotateX(Math.PI / 2);
      f(g, K.wicker, 0, y, 0, i * 0.4, 0, 0, jit(i % 2 ? 0xc29c60 : 0xb08a52, 0.05, i), small);
    }
    const stakes = lite ? 14 : 28;
    for (let i = 0; i < stakes; i++) {
      const a = i / stakes * TAU, c = Math.cos(a), s = Math.sin(a);
      f(rod(new THREE.Vector3(c * (rb + 0.004), 0.01, s * (rb + 0.004)), new THREE.Vector3(c * (rt + 0.005), h, s * (rt + 0.005)), 0.0036, 5), K.wicker, 0, 0, 0, 0, 0, 0, jit(0xbf9a5e, 0.06, i * 3), small);
    }
    const rim = new THREE.TorusGeometry(rt + 0.001, 0.0105, 7, lite ? 28 : 44); rim.rotateX(Math.PI / 2);
    f(rim, K.wicker, 0, h, 0, 0, 0, 0, 0xb08a52);
    const foot = new THREE.TorusGeometry(rb + 0.002, 0.008, 6, 30); foot.rotateX(Math.PI / 2);
    f(foot, K.wicker, 0, 0.012, 0, 0, 0, 0, 0x8d6a3a, small);
    // Two woven loop handles.
    for (const s of [-1, 1]) {
      const g = new THREE.TorusGeometry(0.058, 0.0085, 6, 18, Math.PI); g.rotateY(Math.PI / 2);
      f(g, K.wicker, s * (rt - 0.002), h - 0.005, 0, 0, 0, 0, 0xa8834a);
    }
    // Logs and kindling stood up inside, tops showing over the rim.
    const logs = [[0.0, 0.0, 0.055, 0.36, 0.0], [0.085, 0.03, 0.05, 0.4, 0.12], [-0.08, 0.04, 0.052, 0.37, -0.1], [0.03, -0.085, 0.048, 0.43, 0.08], [-0.03, 0.095, 0.046, 0.4, -0.06], [0.105, -0.06, 0.04, 0.34, 0.1], [-0.1, -0.06, 0.042, 0.42, -0.14], [0.0, 0.0, 0.04, 0.5, 0.0]];
    const nl = lite ? 6 : logs.length;
    for (let i = 0; i < nl; i++) {
      const [lx, lz, r, len, tilt] = logs[i];
      if (i === 7) continue;
      const birch = i % 3 === 1, tint = birch ? 0xefe8d8 : jit(0x8a6a48, 0.18, i);
      const F2 = ctx.T(Kb.x, fy, Kb.z, 0.4).multiply(ctx.T(lx, 0.03, lz, i * 1.9, tilt, -tilt * 0.6));
      put(new THREE.CylinderGeometry(r, r * 1.04, len, 12, 1, true), K.bark, F2.clone().multiply(ctx.T(0, len / 2, 0)), tint);
      put(new THREE.CircleGeometry(r * 0.985, 12), K.wood, F2.clone().multiply(ctx.T(0, len + 0.0006, 0, 0, -Math.PI / 2)), jit(0xdcbf93, 0.08, i * 7), small);
      put(new THREE.CircleGeometry(r * 0.2, 8), K.wood, F2.clone().multiply(ctx.T(0, len + 0.0012, 0, 0, -Math.PI / 2)), 0x8a6238, small);
      put(new THREE.RingGeometry(r * 0.55, r * 0.58, 16), K.wood, F2.clone().multiply(ctx.T(0, len + 0.0009, 0, 0, -Math.PI / 2)), 0xb58d5c, small);
    }
    // Kindling sticks leaning across the top.
    const sticks = lite ? 3 : 6;
    for (let i = 0; i < sticks; i++) {
      const a = i * 1.1 + 0.4, tx = Math.cos(a) * 0.1, tz = Math.sin(a) * 0.1;
      const p0 = new THREE.Vector3(tx * 0.3, 0.05, tz * 0.3), p1 = new THREE.Vector3(tx * 0.6 + 0.03, 0.36 + (i % 3) * 0.04, tz * 0.6);
      const F2 = ctx.T(Kb.x, fy, Kb.z, 0.4);
      put(rod(p0.applyMatrix4(F2), p1.applyMatrix4(F2), 0.0085 + (i % 3) * 0.002, 6), K.bark, null, jit(0x8a6a44, 0.15, i + 20), small);
    }
  }

  // ================================================================ 5. boots, tray, broom, dustpan
  {
    const Tr = KR.tray, f = frame(Tr.x, fy, Tr.z, Tr.yaw);
    f(rbox(Tr.hx * 2, 0.012, Tr.hz * 2, 0.004), K.rubber, 0, 0.006, 0, 0, 0, 0, 0x2b2d2a);
    for (const [w, d, x, z] of [[Tr.hx * 2, 0.012, 0, -Tr.hz + 0.006], [Tr.hx * 2, 0.012, 0, Tr.hz - 0.006], [0.012, Tr.hz * 2, -Tr.hx + 0.006, 0], [0.012, Tr.hz * 2, Tr.hx - 0.006, 0]])
      f(rbox(w, 0.034, d, 0.005), K.rubber, x, 0.017, z, 0, 0, 0, 0x33362f, small);
    // Pebbles and a few flecks of dried mud.
    const nP = lite ? 14 : 34;
    for (let i = 0; i < nP; i++) {
      const lx = (hash(i * 3 + 1) * 2 - 1) * (Tr.hx - 0.022), lz = (hash(i * 3 + 2) * 2 - 1) * (Tr.hz - 0.022), r = 0.011 + hash(i + 40) * 0.01;
      f(sphere(r, 1.2, 0.55, 1, 7), K.stone, lx, 0.012 + r * 0.4, lz, hash(i) * 6, 0, 0, jit([0x8d8a82, 0xa8a398, 0x6f6c65, 0xb4a88e][i % 4], 0.1, i), small);
    }
    // Wellingtons: dark green rubber, ankle crease, rolled top, lugged sole.
    KR.boots.forEach((b, bi) => {
      const g = frame(b.x, fy + 0.012 + 0.012, b.z, b.yaw);
      const green = bi ? 0x2c4b2e : 0x27432a;
      g(sphere(0.0555, 1, 0.2, 2.6, 18), K.rubber, 0, 0.0, 0.012, 0, 0, 0, 0x1b1816);                  // sole
      g(rbox(0.084, 0.034, 0.06, 0.012), K.rubber, 0, 0.012, -0.095, 0, 0, 0, 0x1b1816, small);          // heel
      g(sphere(0.049, 1, 0.78, 2.45, 20), K.enamel, 0, 0.034, 0.024, 0, 0, 0, green);                       // the foot
      g(sphere(0.053, 1, 1.12, 1.3, 16), K.enamel, 0, 0.09, -0.045, 0, 0, 0, green, small);             // ankle
      const shaft = new THREE.CylinderGeometry(0.0605, 0.0525, 0.3, 24, 1, true);
      g(shaft, K.enamel, 0, 0.22, -0.05, 0, -0.03, 0, green);
      const rim = new THREE.TorusGeometry(0.0607, 0.0042, 6, 24); rim.rotateX(Math.PI / 2);
      g(rim, K.enamel, 0, 0.37, -0.0558, 0, -0.03, 0, jit(green, 0.12, bi), small);
      g(new THREE.CircleGeometry(0.057, 20).rotateX(-Math.PI / 2), K.rubber, 0, 0.36, -0.0552, 0, -0.03, 0, 0x0e0c0b, small);
      // sole lugs and the welt
      for (let i = 0; i < 7; i++) g(rbox(0.082, 0.007, 0.012, 0.002, 1), K.rubber, 0, -0.01, 0.05 + i * 0.0215 - 0.18 + 0.1, 0, 0, 0, 0x120f0e, small);
      
      // pull-on strap tab at the back of the top
      g(rbox(0.026, 0.045, 0.006, 0.002, 1), K.enamel, 0, 0.35, -0.113, 0, 0, 0, green, small);
    });
    // Yard broom leaning in the corner.
    const Br = KR.broom;
    const bm = ctx.T(Br.x, fy, Br.z, 0, -Br.lean, 0);
    const bf = (g, mat, lx, ly, lz, ry, rx, rz, color, o) => B.add(g, mat, bm.clone().multiply(ctx.T(lx, ly, lz, ry, rx, rz)), color, o);
    bf(new THREE.CylinderGeometry(0.0138, 0.0138, Br.len, 12), K.wood, 0, 0.05 + Br.len / 2, 0, 0, 0, 0, 0xc6a26a);
    bf(new THREE.SphereGeometry(0.0145, 10, 8), K.wood, 0, 0.05 + Br.len, 0, 0, 0, 0, 0xc6a26a, small);
    bf(new THREE.TorusGeometry(0.0175, 0.0032, 5, 12), K.rope || K.fabric, 0, 0.05 + Br.len - 0.03, 0, 0, Math.PI / 2, 0, 0xcdb68a, small);
    // A tapered head: wooden stock, bristles flaring down, wire bands.
    bf(rbox(0.3, 0.036, 0.046, 0.01), K.wood, 0, 0.104, 0, 0, 0, 0, 0x9a7444);
    const bris = new THREE.CylinderGeometry(0.1, 0.145, 0.095, 4, 1, true); bris.rotateY(Math.PI / 4); bris.scale(1.4, 1, 0.36);
    bf(bris, K.wicker, 0, 0.05, 0, 0, 0, 0, 0xc9b078);
    bf(new THREE.PlaneGeometry(0.26, 0.04).rotateX(Math.PI / 2), K.wicker, 0, 0.0025, 0, 0, 0, 0, 0xb59a60, small);
    const nB = lite ? 14 : 34;
    for (let i = 0; i < nB; i++) {
      const lx = (i / (nB - 1) - 0.5) * 0.285, ln = 0.012 + hash(i + 3) * 0.018;
      bf(rbox(0.012, ln, 0.04, 0.0015, 1), K.wicker, lx, ln / 2 - 0.003, (hash(i + 9) - 0.5) * 0.004, 0, 0, (hash(i + 5) - 0.5) * 0.3, jit(0xbfa56a, 0.12, i), small);
    }
    bf(rbox(0.25, 0.008, 0.052, 0.0025, 1), K.steel, 0, 0.088, 0, 0, 0, 0, 0x9a9c9e, small);
    bf(rbox(0.29, 0.008, 0.052, 0.0025, 1), K.steel, 0, 0.0545, 0, 0, 0, 0, 0x7a7c7e, small);
    // Dustpan hung on a hook on the right wall (a galvanised pan, a handle loop, a hand brush beside it).
    const wx = ROOM.maxX, zp = -1.19, yp = -0.04;
    at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.05, 8), K.brass, wx - 0.025, yp + 0.14, zp, 0, 0, Math.PI / 2, 0xb08d4a, small);
    at(new THREE.SphereGeometry(0.0075, 8, 6), K.brass, wx - 0.05, yp + 0.14, zp, 0, 0, 0, 0xb08d4a, small);
    at(rbox(0.006, 0.26, 0.22, 0.002, 1), K.zinc, wx - 0.012, yp, zp, 0, 0, 0, 0xb4b8b6);
    at(rbox(0.05, 0.006, 0.22, 0.002, 1), K.zinc, wx - 0.036, yp - 0.13, zp, 0, 0, -0.12, 0xb4b8b6, small);
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.05, 0); sh.lineTo(0, 0.12); sh.closePath();
      const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false });
      at(gg, K.zinc, wx - 0.055, yp - 0.13, zp + s * 0.108 - 0.002, 0, 0, 0, 0xa7aaa8, small);
    }
    at(new THREE.TorusGeometry(0.03, 0.004, 6, 16), K.zinc, wx - 0.03, yp + 0.15, zp, Math.PI / 2, 0, 0, 0xb4b8b6, small);
    at(rbox(0.006, 0.14, 0.06, 0.003, 1), K.paint, wx - 0.014, yp + 0.14, zp, 0, 0, 0, 0x8a2d27, small);
  }

  // ================================================================ 6. step stool
  {
    const S = KR.stool, f = frame(S.x, fy, S.z, S.yaw);
    const h = S.h, paint = 0xe0d6bb, pine = 0xc7a26a;
    for (const sx of [-1, 1]) {
      // Side board with a cut-out between the feet.
      const sh = new THREE.Shape();
      sh.moveTo(-0.15, 0); sh.lineTo(-0.1, 0); sh.lineTo(-0.1, 0.04); sh.quadraticCurveTo(0, 0.09, 0.1, 0.04); sh.lineTo(0.1, 0); sh.lineTo(0.15, 0);
      sh.lineTo(0.125, h - 0.03); sh.lineTo(0.125, h - 0.0); sh.lineTo(-0.125, h - 0.0); sh.lineTo(-0.125, h - 0.03); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
      const g2 = muv(g, 2);
      g2.rotateY(Math.PI / 2);
      f(g2, K.paint, sx * 0.17 - 0.011, 0, 0, 0, 0, 0, paint);
      // small hand-hole in the side
      f(rbox(0.004, 0.012, 0.05, 0.002, 1), K.paint, sx * 0.17 - sx * 0.0, h - 0.07, 0, 0, 0, 0, 0xa59b82, small);
    }
    const top = new THREE.Shape(); top.moveTo(-0.2, -0.145); top.lineTo(0.2, -0.145); top.lineTo(0.2, 0.145); top.lineTo(-0.2, 0.145); top.closePath();
    const hole = new THREE.Path(); hole.absellipse(0, 0.0, 0.07, 0.016, 0, TAU, false); top.holes.push(hole);
    const tg = new THREE.ExtrudeGeometry(top, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 14 });
    tg.rotateX(-Math.PI / 2); // lies flat; extrusion becomes +y
    f(muv(tg, 2), K.wood, 0, h - 0.026, 0, 0, 0, 0, pine);
    f(rbox(0.34, 0.02, 0.2, 0.004), K.wood, 0, 0.215, 0.03, 0, 0, 0, jit(pine, 0.05, 3));
    f(rbox(0.34, 0.075, 0.015, 0.003), K.paint, 0, 0.3, -0.115, 0, 0, 0, paint);
    f(rbox(0.34, 0.03, 0.015, 0.003), K.paint, 0, 0.09, -0.12, 0, 0, 0, paint, small);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f(new THREE.CylinderGeometry(0.017, 0.019, 0.007, 10), K.rubber, sx * 0.17, 0.0035, sz * 0.125, 0, 0, 0, 0x2a2724, small);
    // brass screws on the top and a paint drip or two
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 8), K.brass, sx * 0.17, h + 0.0015, sz * 0.1, 0, 0, 0, 0xb08d4a, small);
  }

  // ================================================================ update
  const seenAir = new THREE.Vector3(), probe = new THREE.Vector3();
  let t = 0;
  const H = 1 / 120;
  const wakeNearTo = (g) => {
    const air = sim && sim.air;
    if (!air || air.calm) return false;
    for (const wk of air.wakes) {
      if (!wk.active) continue;
      if (Math.hypot(wk.hub.x - g.centre.x, wk.hub.y - g.centre.y, wk.hub.z - g.centre.z) < g.radius) return true;
      if (wk.vg && Math.hypot(wk.hit.x - g.centre.x, wk.hit.z - g.centre.z) < g.radius) return true;
    }
    return false;
  };
  const sample = (p, out, k) => {
    out.set(0, 0, 0);
    ctx.airAt(p, out);
    if (sim.props && sim.props.inflow) sim.props.inflow(p, out);
    const e = Math.max(out.length() * 0.45, wakeStir(sim, p, out));
    out.x += e * (0.7 * Math.sin(t * 7.3 + k * 2.1) + 0.5 * Math.sin(t * 12.9 + k * 4.3)) * (0.6 + 0.4 * Math.sin(t * 2.3 + k));
    out.z += e * (0.7 * Math.cos(t * 6.1 + k * 1.3) + 0.5 * Math.cos(t * 11.1 + k * 3.7)) * (0.6 + 0.4 * Math.sin(t * 1.7 + 2 * k));
    if (out.lengthSq() > 49) out.setLength(7);
    return out;
  };

  // The ball follows its body (and the replay's stand-in).
  let seen = -1, posed = false, wasPosed = false;
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  if (ballMesh) {
    ctx.replayProxy('jball', (o) => { ballMesh.position.copy(o.position); ballMesh.quaternion.copy(o.quaternion); posed = true; });
  }
  void seenAir; void probe; void _a;

  return {
    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);
      t += dt;
      if (ballMesh && mod) {
        // While a replay poses the ball its stand-in drives the mesh; afterwards the live body is written back.
        if (posed) { posed = false; wasPosed = true; }
        else if (wasPosed || mod.version !== seen) {
          mod.ball.track.sample(1, _p, _q); ballMesh.position.copy(_p); ballMesh.quaternion.copy(_q);
          seen = mod.version; wasPosed = false;
        }
      }
      if (!sim) return;
      for (const g of groups) {
        const near = wakeNearTo(g);
        if (!near && !g.active) continue;
        let n = 0;
        // Air at each bone (only while a rotor is near; otherwise the group settles still).
        for (const l of g.links) {
          if (near) { l.probe.set(l.bone.matrixWorld.elements[12], l.bone.matrixWorld.elements[13] - l.L * 0.8, l.bone.matrixWorld.elements[14]); sample(l.probe, l.air, l.seed); } else l.air.set(0, 0, 0);
        }
        let energy = 0;
        const steps = Math.min(6, Math.ceil(dt / H)), h = dt / steps;
        for (let i = 0; i < steps; i++) { energy = g.step(h); n++; }
        g.pose();
        g.mesh.updateMatrixWorld(true);
        g.active = near || energy > 0.004;
        if (!g.active) { for (const l of g.links) { l.th.copy(l.rest); l.om.set(0, 0, 0); } g.pose(); }
      }
    },
  };
}
