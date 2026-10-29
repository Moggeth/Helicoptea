import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM, GARDEN } from '../../../sim/layout.js';
import { WALL_Z, FENCE, POST_Z, NEST, THERMO, TRELLIS, FESTOON } from '../../../sim/extras/zones/fences.js';

// Fences and the house's garden wall.
//   1. A robin on the right-hand fence's middle post: turns its head, flicks its tail, and when the
//      helicopter (or its wash) comes close it takes off with a sharp "tic" and flies away over the fence;
//      later, once the air is quiet again, it flies back in and lands on the same post. One skinned mesh.
//   2. Festoon lights along the left fence: black cable swagged between the post tops with glass bulbs
//      hanging from rubber sockets. Each bulb is a little pendulum that swings in the rotor's wash.
//   3. A nest box on the brick wall (pitched roof, 32 mm hole with a zinc plate).
//   4. Ivy climbing the house corner by the drain pipe (leaves flutter in the breeze and wash).
//   5. A trellis panel on the right fence with a clematis in flower (sways like the ivy).
//   6. An outdoor thermometer on an oak backboard, with a printed enamel scale.
// Draw calls of its own: the robin (1), the festoon bulbs (1), the thermometer's printed scale (1); the rest
// goes into the shared batch.

const fy = ROOM.floorY;
const UP = new THREE.Vector3(0, 1, 0);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// A thin cylinder from a to b (open ends).
const _d = new THREE.Vector3(), _m = new THREE.Vector3();
function rod(a, b, r, radial = 5, r2 = r) {
  _d.subVectors(b, a);
  const g = new THREE.CylinderGeometry(r2, r, _d.length(), radial, 1, true);
  g.applyMatrix4(new THREE.Matrix4().compose(_m.addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, _d.clone().normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}
// Box from a to b with a square-ish section (w across, t deep), rolled by `roll` about its length.
function slat(ax, ay, bx, by, w, t) {
  const len = Math.hypot(bx - ax, by - ay);
  const g = new THREE.BoxGeometry(t, w, len);
  return { g, cx: (ax + bx) / 2, cy: (ay + by) / 2, ang: Math.atan2(by - ay, bx - ax), len };
}

export function build(ctx) {
  const { batch, kit, T, boxUV, lite, hi } = ctx;
  const R = rng(4242);
  const api = [];

  // ================================================================ 3. nest box on the wall
  {
    const N = NEST, z0 = WALL_Z - N.plateT;               // box back face
    const wood = 0x96704a, dark = 0x4a3a2a;
    // Back plate screwed to the brick, with two zinc-headed screws.
    batch.add(boxUV(N.plateW, N.plateH, N.plateT, 3), kit.weathered, T(N.x, N.y, WALL_Z - N.plateT / 2), 0x8a6a46, { cast: true, receive: true });
    for (const dy of [0.16, -0.16]) batch.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 8), kit.zinc, T(N.x, N.y + dy, WALL_Z - N.plateT - 0.001, 0, Math.PI / 2), 0xa8abae, { cast: false });
    const w = N.w - 0.02, d = N.d, th = 0.014;
    // Floor, sides (they step down from the high back to the lower front), back and front.
    batch.add(boxUV(w, th, d - 0.01, 3), kit.wood, T(N.x, N.y0 + th / 2, z0 - d / 2), wood, { cast: true });
    const front = N.hFront, back = N.hBack;
    for (const sx of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(d, 0); s.lineTo(d, front); s.lineTo(0, back); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false });
      // shape x -> -z (away from the wall), y -> up, extrude -> x
      g.rotateY(Math.PI / 2);
      batch.add(g, kit.wood, T(N.x + (sx > 0 ? w / 2 : -w / 2 - th), N.y0, z0), wood, { cast: true });
    }
    batch.add(boxUV(w, back, th, 3), kit.wood, T(N.x, N.y0 + back / 2, z0 - th / 2), wood, { cast: false });
    // Front with a 32 mm hole (ExtrudeGeometry with a hole path), and a zinc guard plate round it.
    const hy = front * 0.66, hr = 0.016;
    const fs = new THREE.Shape();
    fs.moveTo(-w / 2, 0); fs.lineTo(w / 2, 0); fs.lineTo(w / 2, front); fs.lineTo(-w / 2, front); fs.closePath();
    const hole = new THREE.Path(); hole.absarc(0, hy, hr, 0, Math.PI * 2, true); fs.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(fs, { depth: th, bevelEnabled: false, curveSegments: 20 });
    fg.rotateY(Math.PI);
    batch.add(fg, kit.wood, T(N.x, N.y0, z0 - d + th), wood, { cast: true });
    const ps = new THREE.Shape();
    ps.moveTo(-0.032, -0.032); ps.lineTo(0.032, -0.032); ps.lineTo(0.032, 0.032); ps.lineTo(-0.032, 0.032); ps.closePath();
    const ph = new THREE.Path(); ph.absarc(0, 0, hr, 0, Math.PI * 2, true); ps.holes.push(ph);
    const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.0025, bevelEnabled: false, curveSegments: 20 });
    pg.rotateY(Math.PI);
    batch.add(pg, kit.zinc, T(N.x, N.y0 + hy, z0 - d - 0.0005), 0x9ea2a4, { cast: false });
    // The dark inside, seen through the hole.
    batch.add(new THREE.PlaneGeometry(w - 0.03, front - 0.03), kit.paint, T(N.x, N.y0 + front / 2, z0 - th - 0.002, Math.PI), 0x0b0805, { cast: false, receive: false });
    // Roof: a board sloping from the high back down to the front, overhanging, with a strip of zinc on top.
    const slope = Math.atan2(back - front, d), rl = d / Math.cos(slope) + 0.05, rw = N.w + 0.03;
    const cy = N.y0 + (front + back) / 2 + 0.012, cz = z0 - d / 2 - 0.022;
    batch.add(boxUV(rw, 0.016, rl, 3), kit.wood, T(N.x, cy, cz, 0, slope), 0x86613f, { cast: true });
    batch.add(boxUV(rw + 0.004, 0.003, rl + 0.004, 3), kit.zinc, T(N.x, cy + 0.0095, cz, 0, slope), 0x6b7076, { cast: true });
    // A hinged-lid hook on the left side, and a small drip bead along the front edge.
    batch.add(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 6), kit.brass, T(N.x - w / 2 - th - 0.002, N.y0 + front * 0.5, z0 - d + 0.02), 0xb89a4a, { cast: false });
    void dark;
  }

  // ================================================================ 6. outdoor thermometer
  {
    const Th = THERMO, zf = WALL_Z - Th.t;
    const oak = 0x7a5333;
    batch.add(boxUV(Th.w, Th.h, Th.t, 3), kit.wood, T(Th.x, Th.y, WALL_Z - Th.t / 2), oak, { cast: true });
    // Pointed pediment on top and a rounded foot.
    const ps = new THREE.Shape();
    ps.moveTo(-Th.w / 2, 0); ps.lineTo(Th.w / 2, 0); ps.lineTo(0, 0.04); ps.closePath();
    const pg = new THREE.ExtrudeGeometry(ps, { depth: Th.t, bevelEnabled: false });
    pg.rotateY(Math.PI);
    batch.add(pg, kit.wood, T(Th.x, Th.y + Th.h / 2, WALL_Z), oak, { cast: true });
    batch.add(new THREE.CylinderGeometry(Th.w / 2, Th.w / 2, Th.t, 14, 1, false, 0, Math.PI), kit.wood, T(Th.x, Th.y - Th.h / 2, WALL_Z - Th.t / 2, 0, 0, 0), oak, { cast: false });
    // Enamel scale plate and the glass tube with its red column and bulb.
    const sw = 0.052, sh = 0.3, sy = Th.y + 0.008;
    batch.add(boxUV(sw + 0.006, sh + 0.006, 0.002, 3), kit.zinc, T(Th.x, sy, zf - 0.0005), 0x7a7a74, { cast: false });
    const tubeZ = zf - 0.0095;
    const col = 0.0028;
    // Liquid column from the bulb up to about 14 degrees.
    const yBulb = sy - sh / 2 + 0.006;
    batch.add(new THREE.SphereGeometry(0.0085, 14, 10), kit.enamel, T(Th.x, yBulb, tubeZ), 0xb81818, { cast: false });
    const levelY = sy - sh / 2 + 0.03 + (14 + 20) / 70 * (sh - 0.06);
    batch.add(new THREE.CylinderGeometry(col, col, levelY - yBulb, 8), kit.enamel, T(Th.x, (levelY + yBulb) / 2, tubeZ), 0xc21a1a, { cast: false });
    batch.add(new THREE.CylinderGeometry(0.0046, 0.0046, sh - 0.01, 10), kit.glass, T(Th.x, sy + 0.002, tubeZ), 0xffffff, { cast: false, receive: false });
    batch.add(new THREE.SphereGeometry(0.0115, 14, 10), kit.glass, T(Th.x, yBulb, tubeZ), 0xffffff, { cast: false, receive: false });
    // Brass clips and screws.
    for (const dy of [0.12, -0.05]) batch.add(boxUV(0.014, 0.006, 0.004, 3), kit.brass, T(Th.x, sy + dy, tubeZ - 0.003), 0xb89a4a, { cast: false });
    for (const dy of [0.18, -0.18]) batch.add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 8), kit.brass, T(Th.x, Th.y + dy, zf - 0.001, 0, Math.PI / 2), 0xb89a4a, { cast: false });
    // The printed scale (the thermometer's own little material).
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
    const g = cv.getContext('2d');
    g.fillStyle = '#f1ede2'; g.fillRect(0, 0, 128, 512);
    g.fillStyle = '#222'; g.strokeStyle = '#222';
    const y0 = 512 * (1 - 0.03 / sh * 1) - 0, topPx = 512 * (0.03 / sh), botPx = 512 - topPx;
    void y0;
    for (let t = -20; t <= 50; t += 2) {
      const y = botPx - (t + 20) / 70 * (botPx - topPx);
      const major = t % 10 === 0;
      g.lineWidth = major ? 3 : 1.5;
      g.beginPath(); g.moveTo(64 - (major ? 22 : 12), y); g.lineTo(64 - 2, y); g.stroke();
      if (major) { g.font = 'bold 26px sans-serif'; g.textAlign = 'right'; g.fillText(String(t), 40, y + 9); }
    }
    for (let f = -20; f <= 120; f += 10) {
      const t = (f - 32) * 5 / 9, y = botPx - (t + 20) / 70 * (botPx - topPx);
      if (y < topPx - 4 || y > botPx + 4) continue;
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(66, y); g.lineTo(78, y); g.stroke();
      if (f % 20 === 0) { g.font = '20px sans-serif'; g.textAlign = 'left'; g.fillStyle = '#7a2020'; g.fillText(String(f), 84, y + 7); g.fillStyle = '#222'; }
    }
    g.fillStyle = '#222'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center';
    g.fillText('°C', 34, 26); g.fillStyle = '#7a2020'; g.fillText('°F', 96, 26);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.0 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
    face.position.set(Th.x, sy, zf - 0.0018); face.rotation.y = Math.PI;
    face.matrixAutoUpdate = false; face.updateMatrix();
    face.receiveShadow = true;
    ctx.scene.add(face);
  }

  // ================================================================ 4. ivy up the house corner
  {
    const leafG = (() => {
      const pts = [[0, 0], [0.12, 0.05], [0.38, 0.08], [0.5, 0.2], [0.32, 0.28], [0.46, 0.5], [0.2, 0.52], [0, 1.0], [-0.2, 0.52], [-0.46, 0.5], [-0.32, 0.28], [-0.5, 0.2], [-0.38, 0.08], [-0.12, 0.05]];
      const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
      const g = new THREE.ShapeGeometry(s);
      // Fold along the midrib, curl the lobes a little and bow the tip.
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        p.setZ(i, Math.abs(x) * 0.22 + y * y * 0.08);
      }
      g.computeVertexNormals();
      return g;
    })();
    const leafMat = ctx.sway(kit.leaf, { baseY: fy, height: 2.0, amount: 0.7 });
    const stemMat = kit.bark;
    const nL = lite ? 220 : 480;
    const stems = [];
    const leaves = [];
    // Shoots: [x, y, heading (0 = up, + right), length, depth layer]
    const shoots = [[-2.46, fy, 0.05, 2.0, 0], [-2.38, fy, -0.15, 1.5, 0], [-2.31, fy, 0.18, 1.1, 1], [-2.43, fy, 0.5, 1.7, 1], [-2.2, fy, 0.9, 0.55, 1], [-2.5, fy + 0.3, 0.3, 1.2, 1]];
    const wallX0 = -2.5, wallX1 = -2.08;
    const queue = shoots.slice();
    let guard = 0;
    while (queue.length && guard++ < 60) {
      let [x, y, hd, len, layer] = queue.shift();
      let t = 0, side = 1;
      let thick = layer === 0 ? 0.007 : 0.004;
      const path = [[x, y]];
      while (t < len) {
        const step = 0.045 + R() * 0.02;
        hd += (R() - 0.5) * 0.5 - hd * 0.12;
        x += Math.sin(hd) * step; y += Math.cos(hd) * step;
        x = clamp(x, wallX0, wallX1);
        // keep clear of the thermometer and the nest box
        if (y > 0.35 && y < 0.9 && x > -2.3) x = -2.3;
        if (y > 0.75 && x > -2.12) x = -2.12;
        t += step;
        path.push([x, y]);
        const young = t / len;
        const sc = (0.066 + R() * 0.03) * (1 - young * 0.35) * (y > 1.1 ? 0.8 : 1);
        for (let k = 0; k < (layer === 0 ? 2 : 1); k++) {
          const off = (0.02 + R() * 0.03) * side * (k ? -1 : 1);
          leaves.push([x + off, y + (R() - 0.5) * 0.03, layer, sc, hd + (R() - 0.5) * 1.6 + (side > 0 ? -0.5 : 0.5), 0.12 + R() * 0.5, young]);
        }
        side = -side;
        if (R() < 0.13 && queue.length < 40 && len - t > 0.2) queue.push([x, y, hd + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), (len - t) * (0.4 + R() * 0.3), 1]);
      }
      stems.push({ path, thick, layer });
    }
    // Filler leaves so the corner is full, thick at the foot.
    while (leaves.length < nL) {
      const y = fy + Math.pow(R(), 1.7) * 2.0, x = wallX0 + R() * (wallX1 - wallX0) * (0.6 - Math.min(0.3, y * 0.1)) ;
      if (y > 0.35 && y < 0.9 && x > -2.3) continue;
      leaves.push([x, y, 1, 0.062 + R() * 0.035, R() * 6.28, 0.15 + R() * 0.5, R()]);
    }
    const cols = [0x2c5a28, 0x35672d, 0x3f7231, 0x274f26, 0x4a7d34, 0x5d8f3c];
    for (const [x, y, layer, sc, rot, tilt, young] of leaves) {
      const z = WALL_Z - 0.012 - layer * 0.006 - R() * 0.012;
      const c = young > 0.8 ? 0x6f9c3e : cols[Math.floor(R() * cols.length)];
      batch.add(leafG, leafMat, T(x, y, z, Math.PI, tilt, rot, sc, sc, sc), c, { cast: false });
    }
    const wood = 0x5b4a36;
    for (const s of stems) {
      for (let i = 0; i + 1 < s.path.length; i++) {
        const th = s.thick * (1 - i / s.path.length * 0.6);
        const a = new THREE.Vector3(s.path[i][0], s.path[i][1], WALL_Z - 0.006 - s.layer * 0.004);
        const b = new THREE.Vector3(s.path[i + 1][0], s.path[i + 1][1], WALL_Z - 0.006 - s.layer * 0.004);
        batch.add(rod(a, b, th, 5), stemMat, null, s.layer ? 0xb8a37a : 0xd6c3a0, { cast: false });
      }
    }
  }

  // ================================================================ 5. trellis and clematis on the right fence
  {
    const Tr = TRELLIS, zc = (Tr.z0 + Tr.z1) / 2, W = Tr.z1 - Tr.z0, H = Tr.y1 - Tr.y0, xB = Tr.x + 0.004;
    const tim = 0x93805e;
    // Frame (four battens), and spacer rails to the fence.
    batch.add(boxUV(0.022, H, 0.036, 3), kit.weathered, T(xB, (Tr.y0 + Tr.y1) / 2, Tr.z0 + 0.018), tim, { cast: true });
    batch.add(boxUV(0.022, H, 0.036, 3), kit.weathered, T(xB, (Tr.y0 + Tr.y1) / 2, Tr.z1 - 0.018), tim, { cast: true });
    batch.add(boxUV(0.022, 0.036, W, 3), kit.weathered, T(xB, Tr.y0 + 0.018, zc), tim, { cast: true });
    batch.add(boxUV(0.022, 0.036, W, 3), kit.weathered, T(xB, Tr.y1 - 0.018, zc), tim, { cast: true });
    for (const y of [Tr.y0 + 0.2, Tr.y1 - 0.2]) batch.add(boxUV(0.02, 0.04, W - 0.1, 3), kit.weathered, T(Tr.x + 0.022, y, zc), 0x7a6a50, { cast: false });
    // Diagonal lattice: two layers of slats at +-45 degrees, spacing 0.14 along z, clipped to the frame.
    const sp = 0.14, zl = Tr.z0 + 0.036, zr = Tr.z1 - 0.036, yb = Tr.y0 + 0.036, yt = Tr.y1 - 0.036;
    const clip = (zA, yA, dz, dy) => {
      let t0 = -10, t1 = 10;
      for (const [a0, d0, lo, hi] of [[zA, dz, zl, zr], [yA, dy, yb, yt]]) {
        if (Math.abs(d0) < 1e-9) { if (a0 < lo || a0 > hi) return null; continue; }
        const u = (lo - a0) / d0, v = (hi - a0) / d0;
        t0 = Math.max(t0, Math.min(u, v)); t1 = Math.min(t1, Math.max(u, v));
      }
      return t1 - t0 > 0.02 ? [zA + dz * t0, yA + dy * t0, zA + dz * t1, yA + dy * t1] : null;
    };
    for (const dirSign of [1, -1]) {
      for (let c = -H; c < W + H; c += sp) {
        const zA = zl + c, yA = dirSign > 0 ? yb : yt;
        const seg = clip(zA, yA, 0.7071, dirSign * 0.7071);
        if (!seg) continue;
        const s = slat(seg[0], seg[1], seg[2], seg[3], 0.014, 0.007);
        // geometry runs along z, thin in x; rotate about x to the diagonal
        const gg = s.g;
        batch.add(gg, kit.weathered, T(Tr.x + (dirSign > 0 ? 0.004 : -0.004) + 0.004, s.cy, s.cx, 0, -Math.atan2(seg[3] - seg[1], seg[2] - seg[0])), tim, { cast: true });
      }
    }

    // ---- the clematis
    const leafMat = ctx.sway(kit.leaf, { baseY: fy, height: 1.7, amount: 0.9 });
    const petalMat = ctx.sway(kit.petal, { baseY: fy, height: 1.7, amount: 0.9 });
    const leaflet = (() => {
      const pts = [[0, 0], [0.2, 0.18], [0.3, 0.5], [0.15, 0.85], [0, 1.0], [-0.15, 0.85], [-0.3, 0.5], [-0.2, 0.18]];
      const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
      const g = new THREE.ShapeGeometry(s);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.3);
      g.computeVertexNormals();
      return g;
    })();
    // A trifoliate leaf: three leaflets on short stalks.
    const trifoliate = (() => {
      const parts = [];
      for (const [ang, sx, off] of [[0, 1, 0.0], [0.95, 0.8, 0.0], [-0.95, 0.8, 0.0]]) {
        const g = leaflet.clone();
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(-ang) * 0.08 - Math.sin(ang) * 0, 0.12 + off + (ang ? 0 : 0.12), 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang), new THREE.Vector3(sx * 0.9, sx * 0.9, 1)));
        parts.push(g.index ? g.toNonIndexed() : g);
      }
      parts.push(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.2, 0), 0.012, 4));
      return mergeGeometries(parts.map((g) => { const h = g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g; for (const k of Object.keys(h.attributes)) if (!['position', 'normal', 'uv'].includes(k)) h.deleteAttribute(k); if (!h.attributes.uv) h.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(h.attributes.position.count * 2), 2)); return h; }), false);
    })();
    // A tepal (lanceolate, cupped, with a crease), and its paler central bar.
    const tepal = (L, Wd, bar) => {
      const nx = 6, ny = 4, pos = [], idx = [];
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
        const t = i / nx, s = j / ny * 2 - 1;
        const half = Wd * Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.5 * (bar ? 0.28 : 1) + 0.0005;
        pos.push(t * L, s * half, (-Math.abs(s) * 0.004 * (1 - t) + t * t * 0.012) * (bar ? 1.06 : 1) + (bar ? 0.0006 : 0));
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const a = i * (ny + 1) + j, b = a + 1, c = a + ny + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const tp = tepal(0.052, 0.026, false), tb = tepal(0.048, 0.026, true);
    const flowerParts = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.25, m = new THREE.Matrix4().makeRotationZ(a);
      flowerParts.push({ g: tp, m, bar: false });
      flowerParts.push({ g: tb, m, bar: true });
    }
    const stamen = new THREE.CylinderGeometry(0.011, 0.012, 0.005, 12).rotateX(Math.PI / 2);
    const anther = new THREE.BoxGeometry(0.0022, 0.0022, 0.012);

    const strands = [];
    const nStr = 6;
    for (let s = 0; s < nStr; s++) {
      let z = Tr.z0 + 0.1 + (s + R() * 0.6) / nStr * (W - 0.2), y = fy + 0.02, hd = (R() - 0.5) * 0.5;
      const path = [[z, y]];
      for (let i = 0; i < 40 && y < Tr.y1 - 0.02; i++) {
        hd += (R() - 0.5) * 0.9 - hd * 0.2;
        z += Math.sin(hd) * 0.05; y += Math.cos(hd) * 0.05 + 0.012;
        z = clamp(z, Tr.z0 + 0.05, Tr.z1 - 0.05);
        path.push([z, y]);
      }
      strands.push(path);
    }
    const vineX = Tr.x - 0.011;
    for (let s = 0; s < strands.length; s++) {
      const path = strands[s];
      for (let i = 0; i + 1 < path.length; i++) {
        const th = 0.0035 * (1 - i / path.length * 0.5) + (i < 8 ? 0.001 : 0);
        const a = new THREE.Vector3(vineX - (i % 2 ? 0.003 : 0), path[i][1], path[i][0]);
        const b = new THREE.Vector3(vineX - (i % 2 ? 0 : 0.003), path[i + 1][1], path[i + 1][0]);
        batch.add(rod(a, b, th, 5), kit.bark, null, i < 6 ? 0xb9a07a : 0x9cb060, { cast: false });
      }
      // trifoliate leaves along the strand, alternating sides
      for (let i = 2; i < path.length; i++) {
        const lc = path[i];
        const sc = 0.062 * (0.8 + R() * 0.5) * (i > path.length - 5 ? 0.75 : 1);
        const hs = [0x3a6a2e, 0x46793a, 0x2f5c2a, 0x57873b][Math.floor(R() * 4)];
        const rotZ = (i % 2 ? 1 : -1) * (0.6 + R() * 0.9) + (R() - 0.5) * 0.4 - 0.0;
        batch.add(trifoliate, leafMat, T(vineX - 0.012 - R() * 0.014, lc[1], lc[0], -Math.PI / 2, 0.15 + R() * 0.55, rotZ, sc, sc, sc), hs, { cast: false });
        if (R() < 0.45) batch.add(trifoliate, leafMat, T(vineX - 0.01 - R() * 0.02, lc[1] + 0.02, lc[0] + (R() - 0.5) * 0.05, -Math.PI / 2, 0.25 + R() * 0.5, R() * 6.28, sc * 0.85, sc * 0.85, sc * 0.85), hs, { cast: false });
      }
    }
    // Flowers: deep violet with a pale bar on each tepal, cream stamens.
    const nF = lite ? 8 : 15;
    const flowers = [];
    for (let i = 0; i < nF; i++) {
      const sp2 = strands[Math.floor(R() * strands.length)];
      const k = 3 + Math.floor(R() * (sp2.length - 4));
      const [z, y] = sp2[k];
      if (y < fy + 0.45) { i--; continue; }
      flowers.push([z + (R() - 0.5) * 0.06, y + (R() - 0.5) * 0.05, R() * 6.28, 0.15 + R() * 0.45, 1.35 + R() * 0.4]);
    }
    for (const [z, y, spin, tilt, sc] of flowers) {
      const x = vineX - 0.03 - R() * 0.012;
      const cols = [0x4d2a85, 0x5a2f90, 0x432679][Math.floor(R() * 3)];
      const baseM = T(x, y, z, -Math.PI / 2, tilt, spin, sc, sc, sc);
      for (const fp of flowerParts) {
        const m = baseM.clone().multiply(fp.m);
        batch.add(fp.g, petalMat, m, fp.bar ? 0x9a72c4 : cols, { cast: false });
      }
      batch.add(stamen, kit.petal, baseM.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.003)), 0xe8dfb0, { cast: false });
      for (let a = 0; a < 8; a++) {
        const an = a / 8 * Math.PI * 2 + spin;
        const m = baseM.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(an) * 0.007, Math.sin(an) * 0.007, 0.01), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(an) * 0.4, -Math.cos(an) * 0.4, 0)), new THREE.Vector3(1, 1, 1)));
        batch.add(anther, kit.petal, m, 0x6a2a3e, { cast: false });
      }
    }
    // Buds, and a few spent seed heads.
    for (let i = 0; i < (lite ? 3 : 6); i++) {
      const sp2 = strands[Math.floor(R() * strands.length)], k = 4 + Math.floor(R() * (sp2.length - 5));
      const [z, y] = sp2[k];
      const g = new THREE.SphereGeometry(0.012, 8, 6); g.scale(0.7, 1.7, 0.7);
      batch.add(g, kit.petal, T(vineX - 0.03, y + 0.015, z + 0.01, 0, 0, 0.2), i % 2 ? 0x5f4a8c : 0x6e9b4a, { cast: false });
    }
  }

  // ================================================================ 2. festoon lights along the left fence
  const festoon = (() => {
    const F = FESTOON, xW = F.x;
    const spans = POST_Z.length - 1;
    const per = lite ? 5 : 8;
    const anchors = [];                          // attach points of the bulbs
    const cable = 0x171614;
    for (let s = 0; s < spans; s++) {
      const za = POST_Z[s], zb = POST_Z[s + 1];
      const pt = (t) => new THREE.Vector3(xW, F.y - 4 * F.sag * t * (1 - t), za + (zb - za) * t);
      const N = 16;
      for (let i = 0; i < N; i++) batch.add(rod(pt(i / N), pt((i + 1) / N), 0.0022, 5), kit.rubber, null, cable, { cast: false });
      // screw eye on the post, and a fixing clip
      batch.add(new THREE.TorusGeometry(0.008, 0.0018, 5, 10), kit.steel, T(xW + 0.005, F.y + 0.004, za, Math.PI / 2), 0x9a9a98, { cast: false });
      for (let k = 0; k < per; k++) {
        const t = (k + 0.5) / per;
        anchors.push(pt(t));
      }
    }
    batch.add(new THREE.TorusGeometry(0.008, 0.0018, 5, 10), kit.steel, T(xW + 0.005, F.y + 0.004, POST_Z[spans], Math.PI / 2), 0x9a9a98, { cast: false });
    // Bulb pendant geometry (origin at the attach point on the cable, hanging down).
    const parts = [];
    const add = (g, color, m) => {
      const h = g.index ? g.toNonIndexed() : g;
      if (m) h.applyMatrix4(m);
      const c = new THREE.Color(color), n = h.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      h.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      for (const k of Object.keys(h.attributes)) if (!['position', 'color', 'normal'].includes(k)) h.deleteAttribute(k);
      parts.push(h);
    };
    add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.012, 6), 0x151412, new THREE.Matrix4().makeTranslation(0, -0.004, 0));      // clip
    add(new THREE.CylinderGeometry(0.0115, 0.0105, 0.026, 12), 0x1a1917, new THREE.Matrix4().makeTranslation(0, -0.021, 0));      // rubber socket
    add(new THREE.CylinderGeometry(0.0118, 0.0118, 0.005, 12), 0x8a6e32, new THREE.Matrix4().makeTranslation(0, -0.0365, 0));     // brass collar
    const lathe = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, y = -0.039 - t * 0.058;
      const r = 0.0085 + 0.0115 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * (t > 0.82 ? Math.sqrt(Math.max(0, 1 - (t - 0.82) / 0.18 * ((t - 0.82) / 0.18))) : 1);
      lathe.push(new THREE.Vector2(Math.max(0.0005, r), y));
    }
    add(new THREE.LatheGeometry(lathe, 16), 0xffe0a6, null);                                                                      // glass, glowing
    add(new THREE.TorusGeometry(0.0072, 0.0007, 4, 12), 0xfffbe8, new THREE.Matrix4().makeTranslation(0, -0.066, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));       // filament loop
    const geo = mergeGeometries(parts, false);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, anchors.length);
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    const n = anchors.length;
    const ax = new Float32Array(n), az = new Float32Array(n), vx = new Float32Array(n), vz = new Float32Array(n);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) ph[i] = R() * 6.28;
    const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _mm = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _a = new THREE.Vector3(), _pp = new THREE.Vector3();
    const write = () => {
      for (let i = 0; i < n; i++) {
        _e.set(az[i], 0, -ax[i], 'XYZ');
        _q.setFromEuler(_e);
        _mm.compose(anchors[i], _q, _one);
        mesh.setMatrixAt(i, _mm);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    write();
    ctx.scene.add(mesh);
    const zMin = POST_Z[spans] - 0.9, zMax = POST_Z[0] + 0.9;
    let active = false, t = 0;
    return {
      update(dt, sim) {
        const air = sim && sim.air;
        let near = false;
        if (air && !air.calm) {
          for (const wk of air.wakes) {
            if (!wk.active) continue;
            if (wk.hub.x < xW + 1.6 && wk.hub.z > zMin && wk.hub.z < zMax && wk.hub.y > -0.2 && wk.hub.y < 1.6) { near = true; break; }
            if (wk.vg && wk.hit.x < xW + 1.6 && wk.hit.z > zMin && wk.hit.z < zMax && wk.hub.y < 1.6) { near = true; break; }
          }
        }
        if (!near && !active) return;
        t += dt;
        const h = Math.min(dt, 1 / 30);
        let energy = 0;
        const W2 = 9.81 / 0.07, C = 1.5;
        for (let i = 0; i < n; i++) {
          _a.set(0, 0, 0);
          if (near) { _pp.copy(anchors[i]); _pp.y -= 0.05; ctx.airAt(_pp, _a); }
          const wx = _a.x, wz = _a.z;
          // Air pushes the bulb sideways; the swing it settles to goes with the air speed, plus the eddies round the rotor.
          const eddy = near ? stir(sim, _pp, _a) : 0;
          const tx = clamp(0.45 * _a.x + eddy * 0.35 * Math.sin(t * 13 + ph[i]), -1, 1), tz = clamp(0.45 * _a.z + eddy * 0.35 * Math.cos(t * 11 + ph[i] * 1.7), -1, 1);
          // Neighbours drag each other a little.
          const nbx = (i > 0 ? ax[i - 1] : 0) + (i < n - 1 ? ax[i + 1] : 0) - 2 * ax[i];
          const nbz = (i > 0 ? az[i - 1] : 0) + (i < n - 1 ? az[i + 1] : 0) - 2 * az[i];
          vx[i] += (-W2 * (ax[i] - tx) - C * vx[i] + 6 * nbx) * h;
          vz[i] += (-W2 * (az[i] - tz) - C * vz[i] + 6 * nbz) * h;
          ax[i] = clamp(ax[i] + vx[i] * h, -1.1, 1.1); az[i] = clamp(az[i] + vz[i] * h, -1.1, 1.1);
          energy += Math.abs(ax[i]) + Math.abs(az[i]) + Math.abs(vx[i]) * 0.02 + Math.abs(vz[i]) * 0.02;
        }
        active = near || energy > 0.004;
        if (!active) { ax.fill(0); az.fill(0); vx.fill(0); vz.fill(0); }
        write();
      },
    };
  })();
  api.push(festoon);

  // ================================================================ 1. the robin
  const robin = buildRobin(ctx, rng(77));
  api.push(robin);

  return { update(dt, sim, camera) { for (const a of api) a.update(dt, sim, camera); } };
}

// Air the rotor column stirs up round itself: drawn in towards it, churned in eddies a few rotor radii out.
// Adds the drawn-in flow to out; returns the eddies' strength (m/s).
function stir(sim, p, out) {
  let eddy = 0;
  for (const wk of sim.air.wakes) {
    if (!wk.active) continue;
    const rx = p.x - wk.hub.x, ry = p.y - wk.hub.y, rz = p.z - wk.hub.z;
    const s = rx * wk.dir.x + ry * wk.dir.y + rz * wk.dir.z;
    if (s < -0.3 || s > wk.len + 0.15) continue;
    const px = rx - wk.dir.x * s, py = ry - wk.dir.y * s, pz = rz - wk.dir.z * s;
    const d = Math.hypot(px, py, pz) + 1e-4, R = wk.radius;
    if (d > R * 6) continue;
    const near = Math.exp(-Math.max(0, d - R) / (1.5 * R)) * (s < 0 ? Math.exp(s / 0.12) : 1);
    const pull = wk.vi * 0.3 * near * Math.min(1, R / d);
    out.x -= px / d * pull; out.y -= py / d * pull; out.z -= pz / d * pull;
    out.addScaledVector(wk.dir, wk.vi * 0.2 * near);
    eddy = Math.max(eddy, wk.vi * 0.8 * near);
  }
  return eddy;
}

// ---------------------------------------------------------------------------- the robin
// One skinned mesh (vertex-coloured plumage) with five bones: root, two wings, tail and head.
function buildRobin(ctx, R) {
  const POST = { x: GARDEN.maxX, y: FENCE.postTop, z: POST_Z[1] };
  const BODY_TILT = 0.55;
  const GROUND = 0.066;                          // body centre above the perch

  const pos = [], nrm = [], col = [], sidx = [], swt = [];
  const _c = new THREE.Color();
  const jitter = (x, y, z) => 0.93 + 0.14 * (Math.sin(x * 310 + y * 170 + 1.3) * Math.sin(z * 260 - y * 210) * 0.5 + 0.5);
  function part(geo, matrix, color, bone) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const P0 = g.attributes.position;
    const orig = new Float32Array(P0.array);
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      if (typeof color === 'function') color(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2], _c); else _c.set(color);
      const j = jitter(P.getX(i), P.getY(i), P.getZ(i));
      col.push(_c.r * j, _c.g * j, _c.b * j);
      sidx.push(bone, 0, 0, 0); swt.push(1, 0, 0, 0);
    }
  }
  const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')), new THREE.Vector3(sx, sy, sz));
  const brown = new THREE.Color(0x6a553a), orange = new THREE.Color(0xd9561f), cream = new THREE.Color(0xe6dfce), grey = new THREE.Color(0x8d9296), flank = new THREE.Color(0x8a7556);
  // Plumage on a body ellipsoid: unit-sphere coordinates s, front +x, up +y.
  const bodyColor = (x, y, z, out) => {
    const front = smooth(0.1, 0.55, x), low = smooth(0.5, 0.0, y);
    const w = front * low * smooth(1.0, 0.7, Math.abs(z) * 1.1 + 0.0);       // orange breast
    out.copy(brown);
    const belly = smooth(0.0, -0.6, y) * smooth(0.45, -0.1, x);
    out.lerp(cream, belly);
    const band = Math.max(0, 1 - Math.abs(w - 0.35) * 3.2) * (1 - belly);    // grey edge round the orange
    out.lerp(grey, band * 0.65);
    out.lerp(orange, smooth(0.25, 0.8, w));
    out.lerp(flank, smooth(0.5, 1.0, Math.abs(z)) * smooth(0.5, -0.1, y) * (1 - w) * 0.6);
  };
  const headColor = (x, y, z, out) => {
    const face = smooth(0.1, 0.55, x) * smooth(0.65, -0.15, y) * smooth(1.0, 0.6, Math.abs(z));
    out.copy(brown);
    const band = Math.max(0, 1 - Math.abs(face - 0.3) * 3.4);
    out.lerp(grey, band * 0.7);
    out.lerp(orange, smooth(0.3, 0.85, face));
    out.lerp(cream, smooth(-0.3, -0.9, y) * smooth(0.2, -0.3, x) * 0.5);
  };
  const sph = new THREE.SphereGeometry(1, 18, 12);
  // body (bone 0)
  part(sph, M(0, 0, 0, 0, 0, BODY_TILT, 0.054, 0.042, 0.04), bodyColor, 0);
  // legs and feet (bone 0)
  const legC = 0x8a6a56;
  for (const sz of [-1, 1]) {
    part(rod(new THREE.Vector3(0.006, -0.026, sz * 0.012), new THREE.Vector3(0.012, -GROUND + 0.002, sz * 0.012), 0.0022, 5), null, legC, 0);
    for (const a of [-0.35, 0, 0.35]) part(rod(new THREE.Vector3(0.012, -GROUND + 0.001, sz * 0.012), new THREE.Vector3(0.012 + Math.cos(a) * 0.014, -GROUND + 0.001, sz * 0.012 + Math.sin(a) * 0.014), 0.0012, 4), null, legC, 0);
    part(rod(new THREE.Vector3(0.012, -GROUND + 0.001, sz * 0.012), new THREE.Vector3(0.0, -GROUND + 0.001, sz * 0.012), 0.0012, 4), null, legC, 0);
  }
  // head (bone 4): skull, beak, eyes
  part(sph, M(0.054, 0.05, 0, 0, 0, 0, 0.0255, 0.0245, 0.0235), headColor, 4);
  part(new THREE.ConeGeometry(0.0042, 0.016, 7).rotateZ(-Math.PI / 2), M(0.0865, 0.0525, 0, 0, 0, -0.08), 0x2b2420, 4);
  for (const sz of [-1, 1]) {
    part(new THREE.SphereGeometry(0.0044, 8, 6), M(0.0645, 0.0605, sz * 0.0165), 0x080605, 4);
    part(new THREE.SphereGeometry(0.0011, 4, 3), M(0.0668, 0.0625, sz * 0.0178), 0xfafafa, 4);
  }
  // tail (bone 3): a notched fan, cocked a little
  {
    const s = new THREE.Shape();
    s.moveTo(0, -0.009); s.lineTo(-0.058, -0.016); s.lineTo(-0.068, -0.006); s.lineTo(-0.062, 0.0); s.lineTo(-0.068, 0.006); s.lineTo(-0.058, 0.016); s.lineTo(0, 0.009); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    part(g, M(-0.04, -0.02, 0, 0, 0, 0.12), (x, y, z, out) => out.set(0x5d4a34), 3);
  }
  // wings (bones 1 right, 2 left): a tapered primary shape and its darker tip, in the spread pose
  for (const side of [1, -1]) {
    const s = new THREE.Shape();
    const pts = [[0.02, 0], [0.019, 0.034], [0.008, 0.07], [-0.014, 0.1], [-0.042, 0.085], [-0.056, 0.05], [-0.058, 0.018], [-0.046, 0]];
    s.moveTo(pts[0][0], -pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.0035, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);                     // shape (x, -zl) -> (x, 0, zl)
    if (side < 0) g.scale(1, 1, -1);
    part(g, M(0.012, 0.034, side * 0.028), (x, y, z, out) => { const k = smooth(0.05, 0.09, Math.abs(z)); out.set(0x65513a).lerp(_c.set(0x4a3b2a), k * 0.7); out.lerp(_c.set(0x8c7556), smooth(0.014, 0.0, x) * 0.0); }, side > 0 ? 1 : 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sidx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(swt, 4));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  const root = new THREE.Bone(), bR = new THREE.Bone(), bL = new THREE.Bone(), bT = new THREE.Bone(), bH = new THREE.Bone();
  bR.position.set(0.012, 0.034, 0.028); bL.position.set(0.012, 0.034, -0.028);
  bT.position.set(-0.04, -0.02, 0); bH.position.set(0.046, 0.034, 0);
  root.add(bR, bL, bT, bH);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  const skel = new THREE.Skeleton([root, bR, bL, bT, bH]);
  mesh.bind(skel);
  mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = false;
  const bird = new THREE.Group();
  bird.rotation.order = 'YZX';
  bird.add(mesh);
  ctx.scene.add(bird);

  // Poses.
  const qFoldR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.5, 'XYZ')).multiply(new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2));
  const qFoldL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.5, 'XYZ')).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2));
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), ex = new THREE.Vector3(1, 0, 0);
  const setWings = (spread, flap) => {
    qa.setFromAxisAngle(ex, flap); qb.setFromAxisAngle(UP, -0.22); qc.copy(qa).multiply(qb);
    bR.quaternion.copy(qFoldR).slerp(qc, spread);
    qa.setFromAxisAngle(ex, -flap); qb.setFromAxisAngle(UP, 0.22); qc.copy(qa).multiply(qb);
    bL.quaternion.copy(qFoldL).slerp(qc, spread);
  };
  setWings(0, 0);

  // Behaviour.
  const FACE = Math.PI + 0.5;                      // perched: looking into the garden, a little towards the house
  const st = { mode: 'perch', t: 0, headT: 1.5, headTarget: 0, head: 0, headP: 0, tailT: 3, tailK: 0, tail: 0, bobT: 5, bob: 0, away: 0, cool: 0 };
  const flight = { vx: 0, vz: 0, x0: 0, y0: 0, z0: 0, yaw: 0, dir: new THREE.Vector2(1, 0), sx: 0, sy: 0, sz: 0, call: 0 };
  const _p = new THREE.Vector3();
  bird.position.set(POST.x, POST.y + GROUND, POST.z);
  bird.rotation.y = FACE;

  const chirp = (kind) => {
    const A = ctx.audio;
    if (!A || !A.ready || !A.ctx || !A.spot) return;
    try {
      const o = A.spot(bird.position, 1, 4);
      if (kind === 'alarm') {
        for (let i = 0; i < 3; i++) A.tone({ freq: 5200, to: 3900, type: 'sine', gain: 0.05, attack: 0.001, decay: 0.035, delay: i * 0.11, out: o });
      } else {
        const notes = [5600, 4800, 5900, 4400, 5200];
        notes.forEach((f, i) => A.tone({ freq: f * (1 + (R() - 0.5) * 0.06), to: f * 0.82, type: 'sine', gain: 0.04, attack: 0.004, decay: 0.09, delay: i * 0.12, out: o }));
      }
    } catch { /* audio not ready */ }
  };

  const tooClose = (sim) => {
    const h = sim && sim.heli;
    if (!h || !h.pos) return false;
    const dx = h.pos.x - POST.x, dy = h.pos.y - (POST.y + 0.06), dz = h.pos.z - POST.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.55) return true;
    const air = sim.air;
    if (air && !air.calm) for (const wk of air.wakes) {
      if (!wk.active) continue;
      if (Math.hypot(wk.hub.x - POST.x, wk.hub.y - POST.y, wk.hub.z - POST.z) < 0.9) return true;
      if (wk.vg && Math.hypot(wk.hit.x - POST.x, wk.hit.z - POST.z) < 0.9 && wk.hub.y < POST.y + 0.9) return true;
    }
    return false;
  };
  const heliFar = (sim, r) => {
    const h = sim && sim.heli;
    if (!h || !h.pos) return true;
    return Math.hypot(h.pos.x - POST.x, h.pos.y - POST.y, h.pos.z - POST.z) > r && !tooClose(sim);
  };

  function pose(f, flap, pitch) {
    // f = flightness (0 perched ... 1 flying), flap = wing angle, pitch = body climb angle
    setWings(f, flap);
    bird.rotation.z = f * (pitch - BODY_TILT * 0.9);
  }

  return {
    update(dt, sim) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 1 / 20);
      st.t += dt;
      if (st.mode === 'perch') {
        // head turns, tail flicks, small bows
        st.headT -= dt;
        if (st.headT <= 0) { st.headTarget = (R() - 0.5) * 1.7; st.headT = 0.6 + R() * 2.8; if (R() < 0.3) st.headTarget = 0; }
        st.head += (st.headTarget - st.head) * Math.min(1, dt * 9);
        st.tailT -= dt;
        if (st.tailT <= 0) { st.tailK = 1; st.tailT = 1.5 + R() * 5; }
        st.tailK = Math.max(0, st.tailK - dt * 2.4);
        st.tail = Math.sin(st.tailK * Math.PI * 2.2) * st.tailK * 0.5 + 0.0;
        st.bobT -= dt;
        if (st.bobT <= 0) { st.bob = 1; st.bobT = 3 + R() * 7; }
        st.bob = Math.max(0, st.bob - dt * 2.2);
        const b = Math.sin(st.bob * Math.PI) * 0.22;
        bH.quaternion.setFromEuler(_e.set(0, st.head, -0.0 - b * 0.4, 'XYZ'));
        bT.quaternion.setFromAxisAngle(_Z, st.tail - b * 0.3);
        bird.rotation.z = -b * 0.3;
        setWings(0, 0);
        bird.position.set(POST.x, POST.y + GROUND, POST.z);
        bird.rotation.y = FACE;
        st.cool -= dt;
        if (st.cool <= 0 && tooClose(sim)) {
          // away over the fence, in the direction away from the helicopter but always outwards
          const h = sim.heli.pos;
          let dx = POST.x - h.x, dz = POST.z - h.z;
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          let ox = 0.75 + Math.max(0, dx) * 0.25, oz = dz * 0.45;
          const ol = Math.hypot(ox, oz); ox /= ol; oz /= ol;
          flight.dir.set(ox, oz);
          st.mode = 'fly'; st.t = 0; flight.call = 0;
          chirp('alarm');
        }
      } else if (st.mode === 'fly') {
        // Accelerating bounding flight up and out; the head tucks forward, the tail streams.
        const t = st.t, sp = Math.min(5.0, 1.0 + t * 3.2);
        const vh = sp, vy = 1.15 * Math.exp(-t * 0.8) + 0.18 + Math.sin(t * 9.0) * 0.35 * smooth(0.2, 0.6, t);
        flight.sx += flight.dir.x * vh * dt; flight.sz += flight.dir.y * vh * dt; flight.sy += vy * dt;
        bird.position.set(POST.x + flight.sx, POST.y + GROUND + flight.sy, POST.z + flight.sz);
        const yaw = Math.atan2(-flight.dir.y, flight.dir.x);
        // yaw: ease from the perched heading round to the flight heading
        let dy = yaw - FACE; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        bird.rotation.y = FACE + dy * smooth(0.0, 0.25, t);
        const phase = t * 62;
        const f = smooth(0.0, 0.14, t);
        pose(f, Math.sin(phase) * 0.85 - 0.1, Math.atan2(vy, vh));
        bH.quaternion.setFromEuler(_e.set(0, 0, 0, 'XYZ'));
        bT.quaternion.setFromAxisAngle(_Z, -0.2);
        if (t > 3.4) { st.mode = 'away'; st.t = 0; st.away = 14 + R() * 14; bird.visible = false; }
      } else if (st.mode === 'away') {
        bird.visible = false;
        if (st.t > st.away && heliFar(sim, 1.6)) {
          st.mode = 'return'; st.t = 0; bird.visible = true;
          const a = (R() - 0.5) * 0.8;
          flight.x0 = 3.2 + Math.cos(a) * 0.4; flight.z0 = POST.z + Math.sin(a) * 2.4 - 0.2; flight.y0 = POST.y + 1.1;
          // fly in over the fence from the neighbour's side, heading into the garden, then curve onto the post
          flight.sx = POST.x + 3.5; flight.sz = flight.z0 - POST.z; flight.sy = 1.4;
          bird.visible = true;
        }
      } else if (st.mode === 'return') {
        // Quadratic path from outside to the post, slowing, wings spread wide at the flare.
        const T0 = 2.1, u = Math.min(1, st.t / T0);
        const e = 1 - (1 - u) * (1 - u);
        const sx = flight.sx * (1 - e), sz = flight.sz * (1 - e), sy = flight.sy * (1 - e) * (1 - e * 0.0) * (1 - u * 0.0);
        const bump = Math.sin(Math.min(1, u * 1.1) * Math.PI) * 0.1;
        bird.position.set(POST.x + sx, POST.y + GROUND + sy + bump * (1 - u), POST.z + sz);
        const vxx = -(flight.sx) * (1 - u) * 2, vzz = -flight.sz * (1 - u) * 2, vyy = -flight.sy * 2 * (1 - e);
        const hs = Math.hypot(vxx, vzz) + 1e-3;
        const yaw = Math.atan2(-vzz, vxx);
        let dy = yaw - FACE; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        bird.rotation.y = FACE + dy * (1 - smooth(0.82, 1.0, u));
        const f = 1 - smooth(0.9, 1.0, u);
        const flare = smooth(0.7, 0.95, u);
        pose(f, Math.sin(st.t * 60) * (0.85 - flare * 0.35) + flare * 0.25, Math.atan2(vyy, hs) * (1 - flare) + flare * 0.5);
        bT.quaternion.setFromAxisAngle(_Z, -0.2 * (1 - flare) + flare * 0.35);
        bH.quaternion.setFromEuler(_e.set(0, 0, 0, 'XYZ'));
        if (tooClose(sim) && u < 0.95) { st.mode = 'fly'; st.t = 0; flight.sx = bird.position.x - POST.x; flight.sy = bird.position.y - POST.y - GROUND; flight.sz = bird.position.z - POST.z; flight.dir.set(0.8, (R() - 0.5) * 0.5).normalize(); chirp('alarm'); }
        else if (u >= 1) { st.mode = 'perch'; st.t = 0; st.cool = 1.5; st.headT = 0.5; chirp('song'); }
      }
    },
  };
}
const _e = new THREE.Euler(), _Z = new THREE.Vector3(0, 0, 1);
