import * as THREE from 'three';
import { Batcher, T } from '../batch.js';
import { BASKET, basketPivot } from '../../sim/extras/baskets.js';
import { registerExtraSound } from '../../audio/extras.js';

// Hanging flower baskets (see src/sim/extras/baskets.js): black wrought-iron scroll brackets on the garden
// wall, and two moss-lined wire baskets on three chains, spilling petunias, trailing lobelia and ivy.
// Draw calls: the two brackets (one merged mesh) and one mesh per basket (wire, moss, chains, planting
// on one atlas texture). Trailing stems sway in the vertex shader: they keep hanging plumb as the basket
// tilts, lag behind its swing, and flutter in the rotor wash.

const _p = new THREE.Vector3(), _qi = new THREE.Quaternion(), _a = new THREE.Vector3(), _g = new THREE.Vector3(), _o = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- atlas (512 px)
// Regions in UV space [u0, v0, u1, v1].
const R_MOSS = [0, 0.5, 0.5, 1], R_IVY = [0.5, 0.5, 1, 1], R_PETUNIA = [0, 0, 0.5, 0.5];
const R_LOBELIA = [0.5, 0.25, 0.75, 0.5], R_LEAF = [0.75, 0.25, 1, 0.5], R_PLAIN = [0.55, 0.03, 0.95, 0.2];

function atlasTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 512;
  const r = rng(77);
  g.clearRect(0, 0, size, size);
  // Moss (top left): olive and brown flecks over a dark base.
  g.fillStyle = '#4a5530'; g.fillRect(0, 0, 256 * s, 256 * s);
  const moss = ['#5f6c35', '#3b4524', '#77803f', '#6b5a36', '#8b9150', '#2f3a1d', '#a3a066'];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = moss[Math.floor(r() * moss.length)];
    g.globalAlpha = 0.5 + r() * 0.5;
    g.beginPath(); g.arc(r() * 256 * s, r() * 256 * s, (0.6 + r() * 2.2) * s, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // Ivy leaf (top right): five pointed lobes, dark glossy green with pale veins.
  {
    const cx = 384 * s, cy = 140 * s, R = 105 * s;
    g.save(); g.translate(cx, cy);
    g.beginPath();
    const lobes = [[-Math.PI / 2, 1], [-Math.PI / 2 - 1.05, 0.72], [-Math.PI / 2 + 1.05, 0.72], [-Math.PI / 2 - 2.0, 0.5], [-Math.PI / 2 + 2.0, 0.5]];
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
      let rr = 0.32;
      for (const [la, lr] of lobes) { const d = Math.atan2(Math.sin(a - la), Math.cos(a - la)); rr = Math.max(rr, lr * Math.exp(-d * d / 0.09)); }
      // The leaf's base is notched where the stalk meets it.
      const db = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
      rr *= 1 - 0.35 * Math.exp(-db * db / 0.05);
      pts.push([Math.cos(a) * rr * R, Math.sin(a) * rr * R + 0.15 * R]);
    }
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    const grd = g.createRadialGradient(0, 0.25 * R, 0, 0, 0, R);
    grd.addColorStop(0, '#3d5a2c'); grd.addColorStop(1, '#22361a');
    g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(190,205,160,0.75)'; g.lineWidth = 2.2 * s;
    for (const [la, lr] of lobes) { g.beginPath(); g.moveTo(0, 0.4 * R); g.lineTo(Math.cos(la) * lr * R * 0.85, Math.sin(la) * lr * R * 0.85 + 0.15 * R); g.stroke(); }
    g.restore();
  }
  // Petunia (bottom left): a round, shallowly lobed trumpet face, white (tinted per flower) with darker
  // veins running out from a deep throat.
  {
    const cx = 128 * s, cy = 384 * s, R = 118 * s;
    g.save(); g.translate(cx, cy);
    g.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      const rr = R * (0.9 + 0.07 * Math.cos(5 * a) + 0.03 * Math.sin(13 * a));
      i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr, 0);
    }
    g.closePath();
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, R);
    grd.addColorStop(0, '#2a1a20'); grd.addColorStop(0.12, '#6a4a56'); grd.addColorStop(0.3, '#e8e0e4'); grd.addColorStop(0.85, '#ffffff'); grd.addColorStop(1, '#f2eaee');
    g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(70,40,55,0.35)'; g.lineWidth = 1.6 * s;
    for (let i = 0; i < 25; i++) {
      const a = (i / 25) * Math.PI * 2 + r() * 0.1;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12);
      g.quadraticCurveTo(Math.cos(a + 0.08) * R * 0.45, Math.sin(a + 0.08) * R * 0.45, Math.cos(a) * R * (0.6 + r() * 0.2), Math.sin(a) * R * (0.6 + r() * 0.2));
      g.stroke();
    }
    // Five pleat lines (where the trumpet folds).
    g.strokeStyle = 'rgba(120,90,105,0.25)'; g.lineWidth = 3 * s;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); g.stroke(); }
    g.fillStyle = '#d8d070'; g.beginPath(); g.arc(0, 0, 5 * s, 0, Math.PI * 2); g.fill(); // stamens
    g.restore();
  }
  // Lobelia (bottom middle): a spray of tiny flowers, three broad lower petals and two narrow upper ones,
  // each with a pale eye; tinted blue or white per spray.
  {
    const ox = 256 * s, oy = 256 * s;
    const flower = (x, y, sz, rot) => {
      g.save(); g.translate(ox + x * s, oy + y * s); g.rotate(rot);
      g.fillStyle = '#ffffff';
      for (const [a, len, w] of [[Math.PI / 2, 1, 0.42], [Math.PI / 2 - 0.75, 0.95, 0.4], [Math.PI / 2 + 0.75, 0.95, 0.4], [-Math.PI / 2 - 0.45, 0.6, 0.22], [-Math.PI / 2 + 0.45, 0.6, 0.22]]) {
        g.save(); g.rotate(a - Math.PI / 2);
        g.beginPath(); g.ellipse(0, len * sz * 0.55 * s, w * sz * s, len * sz * 0.55 * s, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      g.fillStyle = '#c9cfe0'; g.beginPath(); g.arc(0, 0.1 * sz * s, 0.3 * sz * s, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    for (let i = 0; i < 9; i++) flower(20 + r() * 88, 20 + r() * 88, 13 + r() * 6, r() * 6);
  }
  // Small ovate leaf (bottom right): petunia and lobelia foliage, mid green with a midrib.
  {
    const cx = 448 * s, cy = 320 * s;
    g.save(); g.translate(cx, cy);
    g.beginPath(); g.moveTo(0, 56 * s);
    g.bezierCurveTo(38 * s, 30 * s, 34 * s, -30 * s, 0, -58 * s);
    g.bezierCurveTo(-34 * s, -30 * s, -38 * s, 30 * s, 0, 56 * s);
    const grd = g.createLinearGradient(-30 * s, 0, 30 * s, 0);
    grd.addColorStop(0, '#4c7432'); grd.addColorStop(1, '#5f8a3c');
    g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(170,200,130,0.6)'; g.lineWidth = 2 * s;
    g.beginPath(); g.moveTo(0, 54 * s); g.lineTo(0, -50 * s); g.stroke();
    g.restore();
  }
  // Plain (wire, chains, stems, shadowy foliage depth).
  g.fillStyle = '#ffffff'; g.fillRect(256 * s, 420 * s, 256 * s, 92 * s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- geometry accumulator
class Acc {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.sway = []; }
  // geo: any BufferGeometry with 0..1 uvs; rect: atlas region; sway(x, y, z) -> hanging length for the shader.
  add(geo, m, rect, color, sway = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      this.pos.push(x, y, z);
      this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      const u = U ? U.getX(i) : 0.5, v = U ? U.getY(i) : 0.5;
      this.uv.push(rect[0] + (rect[2] - rect[0]) * u, rect[1] + (rect[3] - rect[1]) * v);
      this.col.push(c.r, c.g, c.b);
      this.sway.push(typeof sway === 'function' ? sway(x, y, z) : sway);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.12; // room for the trails' sway
    return g;
  }
}

// A leaf or flower card: unit plane in local xy, base at the origin, pointing +y, facing +z; cupped a little.
function card(cup = 0, segs = 2) {
  const g = new THREE.PlaneGeometry(1, 1, segs, segs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, x, y, -cup * (1 - (x * x + y * y) * 4) * 0.5);
  }
  g.computeVertexNormals();
  return g;
}
// Matrix placing a card at p with its face normal n and its 'up' (tip direction) roughly along t.
function cardMatrix(p, n, t, size, spin = 0) {
  const z = n.clone().normalize();
  const x = new THREE.Vector3().crossVectors(t, z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  if (spin) m.multiply(new THREE.Matrix4().makeRotationZ(spin));
  m.scale(new THREE.Vector3(size, size, size));
  m.setPosition(p);
  return m;
}

const PETUNIA = [0xb83a78, 0x7b3f96, 0xf3efe8, 0xe7a9c2, 0x8a2440, 0xc0506a];
const LOBELIA = [0x3e50b8, 0x4a5fc8, 0x6c6fd0, 0xf2f2f6];

function basketGeometry(def, lite) {
  const B = BASKET, R = B.r, D = B.depth;
  const r = rng(def.seed);
  const A = new Acc();
  const n = lite ? 0.55 : 1;
  const jit = (c, k = 0.08) => { const col = new THREE.Color(c); col.offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * k, (r() - 0.5) * k); return col; };
  const bowl = (phi, alpha, k = 1) => new THREE.Vector3(R * k * Math.cos(phi) * Math.cos(alpha), -D * k * Math.sin(phi), R * k * Math.cos(phi) * Math.sin(alpha));
  const WIRE = 0x1d211c;
  // Wire frame: ten ribs, rim, a middle ring and a foot ring.
  for (let i = 0; i < 10; i++) {
    const al = (i / 10) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 8; k++) pts.push(bowl((k / 8) * Math.PI / 2 * 0.86, al, 1.035));
    A.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0022, 4), null, R_PLAIN, WIRE);
  }
  const ring = (rad, y, tube) => A.add(new THREE.TorusGeometry(rad, tube, 4, 40), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, y, 0), R_PLAIN, WIRE);
  ring(R * 1.035, 0, 0.003);
  ring(R * 1.035 * Math.cos(0.55), -D * 1.035 * Math.sin(0.55), 0.0022);
  ring(R * 1.035 * Math.cos(1.35), -D * 1.035 * Math.sin(1.35), 0.0026);
  // Moss liner: a lathe just inside the wires, bulging out between them, with a ragged lip over the rim.
  {
    const prof = [];
    for (let k = 10; k >= 0; k--) { const ph = (k / 10) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.002, R * 1.02 * Math.cos(ph)), -D * 1.02 * Math.sin(ph))); }
    prof.push(new THREE.Vector2(R * 1.055, 0.012), new THREE.Vector2(R * 0.98, 0.02));
    const g = new THREE.LatheGeometry(prof, 40);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const bump = 1 + 0.035 * Math.sin(a * 10) * Math.sin(a * 10) * Math.cos(y * 60) + 0.02 * Math.sin(a * 23 + y * 90) + (y > 0 ? 0.04 * Math.sin(a * 17) : 0);
      p.setXYZ(i, x * bump, y + (y > 0.005 ? 0.008 * Math.sin(a * 13) : 0), z * bump);
    }
    g.computeVertexNormals();
    A.add(g, null, R_MOSS, jit(0xe6eadc, 0.05));
  }
  // Soil and shadowy depth of foliage: a low dark dome over the bowl.
  A.add(new THREE.SphereGeometry(R * 0.98, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeScale(1.04, 0.6, 1.04), R_MOSS, 0x6f9a52, 0.01);
  // Chains: three, from clips on the rim to a ring at the hook.
  const top = new THREE.Vector3(0, B.chain - 0.014, 0);
  const linkGeo = () => new THREE.TorusGeometry(0.0055, 0.0012, 4, lite ? 6 : 10);
  for (let c = 0; c < 3; c++) {
    const al = (c / 3) * Math.PI * 2 + 0.5;
    const s0 = new THREE.Vector3(R * 1.035 * Math.cos(al), 0.004, R * 1.035 * Math.sin(al));
    const dir = top.clone().sub(s0);
    const L = dir.length();
    dir.normalize();
    const pitch = 0.0145;
    const count = Math.floor(L / pitch);
    for (let i = 0; i < count; i++) {
      const pc = s0.clone().addScaledVector(dir, (i + 0.5) * (L / count));
      // Torus lies in its xy plane: stretch along y, point y along the chain, alternate the plane.
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
      const qs = new THREE.Quaternion().setFromAxisAngle(UP, (i % 2) * Math.PI / 2 + al);
      const m = new THREE.Matrix4().compose(pc, q.multiply(qs), new THREE.Vector3(1, 1.55, 1));
      A.add(linkGeo(), m, R_PLAIN, 0x1a1b1c);
    }
    // A small S-clip hooked under the rim.
    A.add(new THREE.TorusGeometry(0.006, 0.0014, 4, 10, Math.PI * 1.5), new THREE.Matrix4().makeRotationY(-al).setPosition(s0.x, s0.y - 0.004, s0.z), R_PLAIN, 0x1a1b1c);
  }
  A.add(new THREE.TorusGeometry(0.011, 0.0022, 6, 18), new THREE.Matrix4().makeRotationY(-def.yaw).setPosition(top.x, top.y, top.z), R_PLAIN, 0x1a1b1c);

  // Planting: leaves and flowers over the dome and spilling over the rim.
  const dome = (u, v) => { // u around, v from top (0) to the rim (1)
    const a = u * Math.PI * 2, ph = v * Math.PI / 2;
    return new THREE.Vector3(Math.sin(ph) * R * 1.1 * Math.cos(a), Math.cos(ph) * R * 0.62 + 0.01, Math.sin(ph) * R * 1.1 * Math.sin(a));
  };
  const nL = Math.round(230 * n);
  for (let i = 0; i < nL; i++) {
    const u = r(), v = Math.sqrt(r()) * 1.08;
    const p = dome(u, Math.min(1, v));
    if (v > 1) p.y -= (v - 1) * 0.3;
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    const nrm = p.clone().setY(p.y * 2.5).normalize().add(new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).multiplyScalar(1.3)).normalize();
    p.addScaledVector(nrm, r() * 0.012);
    const tip = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(r() - 0.5, 0.2 + r() * 0.4, r() - 0.5)).normalize();
    A.add(card(0.25), cardMatrix(p, nrm, tip, 0.032 + r() * 0.014), R_LEAF, jit(0xd8e0c8, 0.12), 0.015);
  }
  // Petunias: trumpets facing out and up over the crown and round the rim.
  const nP = Math.round(46 * n);
  const flowerAt = (p, nrm, size, sway) => {
    const col = jit(PETUNIA[Math.floor(r() * PETUNIA.length)], 0.06);
    A.add(card(0.55, 3), cardMatrix(p, nrm, UP.clone().add(new THREE.Vector3(r() - 0.5, 0, r() - 0.5)).normalize(), size, r() * 6), R_PETUNIA, col, sway);
  };
  for (let i = 0; i < nP; i++) {
    const u = r(), v = 0.25 + r() * 0.85;
    const p = dome(u, Math.min(1, v));
    if (v > 1) p.y -= (v - 1) * 0.35;
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    const nrm = out.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, 0.9 - v * 0.8, 0)).add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.5)).normalize();
    p.addScaledVector(nrm, 0.012);
    flowerAt(p, nrm, 0.046 + r() * 0.012, 0.02);
  }
  // Lobelia: sprays of tiny flowers frothing over the rim.
  const nB = Math.round(90 * n);
  for (let i = 0; i < nB; i++) {
    const a = r() * Math.PI * 2, drop = Math.pow(r(), 1.6) * 0.09;
    const p = new THREE.Vector3(Math.cos(a) * (R * 1.06 + drop * 0.25), 0.02 - drop + r() * 0.03, Math.sin(a) * (R * 1.06 + drop * 0.25));
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const nrm = out.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.6 - 0.2, r() - 0.5)).normalize();
    const col = jit(LOBELIA[r() < 0.8 ? Math.floor(r() * 3) : 3], 0.08);
    A.add(card(0.1), cardMatrix(p, nrm, UP, 0.034 + r() * 0.012, r() * 6), R_LOBELIA, col, Math.max(0.01, -p.y + 0.02));
  }
  // Trailing stems: petunia and lobelia trails, and long ivy.
  const trails = [];
  for (let i = 0; i < 5; i++) trails.push({ kind: 'ivy', len: 0.24 + r() * 0.18 });
  for (let i = 0; i < 8; i++) trails.push({ kind: 'petunia', len: 0.1 + r() * 0.14 });
  for (let i = 0; i < 4; i++) trails.push({ kind: 'lobelia', len: 0.08 + r() * 0.1 });
  for (let i = trails.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [trails[i], trails[j]] = [trails[j], trails[i]]; }
  const trailCount = Math.round(trails.length * n);
  for (let ti = 0; ti < trailCount; ti++) {
    const tr = trails[ti];
    const a = (ti / trailCount) * Math.PI * 2 + r() * 0.5;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const s0 = out.clone().multiplyScalar(R * 0.95).setY(0.015);
    const bulge = 0.05 + r() * 0.04, wander = (r() - 0.5) * 0.08;
    const pts = [
      s0,
      s0.clone().addScaledVector(out, bulge * 0.7).setY(0.02),
      s0.clone().addScaledVector(out, bulge).setY(-tr.len * 0.25).addScaledVector(side, wander * 0.3),
      s0.clone().addScaledVector(out, bulge * 0.95).setY(-tr.len * 0.6).addScaledVector(side, wander * 0.7),
      s0.clone().addScaledVector(out, bulge * 0.85).setY(-tr.len).addScaledVector(side, wander),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const swayOf = (x, y) => Math.max(0.01, -y + 0.02);
    A.add(new THREE.TubeGeometry(curve, 12, tr.kind === 'ivy' ? 0.0016 : 0.0019, 3), null, R_PLAIN, tr.kind === 'ivy' ? 0x5a4a32 : 0x5a7a34, swayOf);
    const steps = Math.round(tr.len / (tr.kind === 'ivy' ? 0.024 : 0.026));
    for (let k = 1; k <= steps; k++) {
      const t = 0.12 + 0.88 * (k / steps);
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const lr = k % 2 ? 1 : -1;
      const sideN = new THREE.Vector3().crossVectors(tan, UP).normalize();
      const lp = p.clone().addScaledVector(sideN, lr * 0.008);
      const nrm = out.clone().add(new THREE.Vector3(0, 0.25, 0)).add(sideN.clone().multiplyScalar(lr * 0.3)).normalize();
      const sz = 1 - 0.45 * t;
      if (tr.kind === 'ivy') {
        const inrm = out.clone().add(new THREE.Vector3((r() - 0.5) * 0.8, 0.1 + r() * 0.3, (r() - 0.5) * 0.8)).normalize();
        A.add(card(0.15), cardMatrix(lp, inrm, sideN.clone().multiplyScalar(lr * 0.6).add(new THREE.Vector3(0, -1, 0)).normalize(), (0.05 + r() * 0.012) * (1 - 0.35 * t)), R_IVY, jit(0xe4ead8, 0.1), swayOf(0, lp.y));
      } else {
        A.add(card(0.25), cardMatrix(lp, nrm, sideN.clone().multiplyScalar(lr).add(new THREE.Vector3(0, -0.3, 0)).normalize(), (0.03 + r() * 0.008) * sz), R_LEAF, jit(0xd8e0c8, 0.12), swayOf(0, lp.y));
        if (tr.kind === 'petunia' && (k % 3 === 2 || k === steps)) {
          const fn = out.clone().add(new THREE.Vector3(0, -0.25 - r() * 0.4, 0)).add(sideN.clone().multiplyScalar((r() - 0.5) * 0.8)).normalize();
          flowerAt(p.clone().addScaledVector(fn, 0.012), fn, 0.042 + r() * 0.01, swayOf(0, p.y));
        }
        if (tr.kind === 'lobelia') {
          const col = jit(LOBELIA[Math.floor(r() * 3)], 0.08);
          A.add(card(0.1), cardMatrix(p.clone().addScaledVector(out, 0.008), out.clone().add(new THREE.Vector3(r() - 0.5, 0, r() - 0.5)).normalize(), UP, 0.03, r() * 6), R_LOBELIA, col, swayOf(0, p.y));
        }
      }
    }
  }
  return A.build();
}

// ---------------------------------------------------------------- brackets (static)
function buildBrackets(scene, lite) {
  const B = BASKET;
  const iron = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.55 });
  const b = new Batcher();
  const IRON = 0x1b1c1d;
  for (const def of B.list) {
    const x = def.x, W = B.wallZ, by = B.bracketY;
    const at = (u, y) => new THREE.Vector3(x, y, W - u);
    // Flat strip along a curve in the bracket's plane (wider across than it is deep).
    const strip = (pts, r = 0.0034, segs = 24) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([u, y]) => at(u, y))), segs, r, lite ? 4 : 6);
      g.translate(-x, 0, 0); g.scale(1.7, 1, 1); g.translate(x, 0, 0);
      b.add(g, iron, null, IRON);
    };
    // Wall plate with two screws.
    b.add(new THREE.BoxGeometry(0.03, 0.26, 0.007), iron, T(x, by - 0.105, W - 0.0035), IRON);
    for (const y of [by - 0.01, by - 0.215]) b.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 10), iron, T(x, y, W - 0.008, 0, Math.PI / 2), 0x2a2b2c);
    // Arm (a square bar with a little upturned scroll at the tip).
    b.add(new THREE.BoxGeometry(0.011, 0.012, B.reach + 0.012), iron, T(x, by, W - (B.reach + 0.012) / 2), IRON);
    const tip = [];
    for (let k = 0; k <= 14; k++) { const a = -Math.PI / 2 + (k / 14) * Math.PI * 1.6, rr = 0.016 * (1 - k / 22); tip.push([B.reach + 0.012 + Math.cos(a) * rr, by + 0.016 + Math.sin(a) * rr]); }
    strip(tip, 0.003, 20);
    // Brace: sweeps from the foot of the plate out under the arm.
    strip([[0.006, by - 0.22], [0.02, by - 0.13], [0.06, by - 0.06], [0.13, by - 0.025], [0.2, by - 0.008]], 0.0036, 30);
    // C-scroll in the corner, and a smaller one curling off the brace.
    const spiral = (cu, cy, r0, r1, a0, turns, cw = 1) => {
      const pts = [];
      const N = 30;
      for (let k = 0; k <= N; k++) { const t = k / N, a = a0 + cw * t * turns * Math.PI * 2, rr = r0 + (r1 - r0) * t; pts.push([cu + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      strip(pts, 0.003, 40);
    };
    spiral(0.052, by - 0.052, 0.044, 0.01, Math.PI * 0.95, 1.25, -1);
    spiral(0.115, by - 0.06, 0.024, 0.006, Math.PI * 0.3, 1.2, 1);
    // Collars where the scrolls meet the bars.
    for (const [u, y] of [[0.008, by - 0.05], [0.05, by - 0.008], [0.2, by - 0.008]]) b.add(new THREE.BoxGeometry(0.02, 0.012, 0.008), iron, T(x, y, W - u), IRON);
    // Eye under the arm and an S-hook down to the chains' ring (the joint).
    const piv = basketPivot(def);
    b.add(new THREE.TorusGeometry(0.0075, 0.0018, 5, 14), iron, T(x, by - 0.012, piv.z, Math.PI / 2), IRON);
    const hk = [];
    const hy0 = by - 0.019, hy1 = piv.y;
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      // Down the shank, then round the bottom bend that cradles the ring.
      if (t < 0.55) hk.push([B.reach + 0.002 * Math.sin(t * 6), hy0 - (hy0 - hy1 - 0.008) * (t / 0.55)]);
      else { const a = Math.PI + ((t - 0.55) / 0.45) * Math.PI * 1.1; hk.push([B.reach + 0.008 + Math.cos(a) * 0.008, hy1 + 0.008 + Math.sin(a) * 0.008]); }
    }
    const hg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hk.map(([u, y]) => at(u, y))), 24, 0.0017, 5);
    b.add(hg, iron, null, IRON);
  }
  const meshes = b.build(scene);
  for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; }
  return meshes;
}

// ---------------------------------------------------------------- sounds
registerExtraSound('basketCreak', (audio, e, now) => {
  if (now - (audio._basketCreakT || 0) < 0.35) return;
  audio._basketCreakT = now;
  const o = audio.spot(e.pos, 1, 3);
  const s = e.strength || 0.5;
  // Stick-slip: a few rasping grains of iron on iron, the hook groaning in the ring.
  const f = 1500 + Math.random() * 700;
  for (let i = 0; i < 4; i++) {
    audio.noiseBurst({ freq: f * (1 + i * 0.06), q: 9, gain: 0.03 * s, attack: 0.008, decay: 0.05 + Math.random() * 0.04, delay: i * (0.045 + Math.random() * 0.03), out: o });
  }
  audio.tone({ freq: 620 + Math.random() * 120, to: 540, type: 'triangle', gain: 0.012 * s, attack: 0.03, decay: 0.22, out: o });
});
registerExtraSound('basketKnock', (audio, e, now) => {
  if (now - (audio._basketKnockT || 0) < 0.12) return;
  audio._basketKnockT = now;
  const o = audio.spot(e.pos);
  const s = e.strength || 0.5;
  audio.noiseBurst({ freq: 1800, type: 'lowpass', q: 0.7, gain: 0.12 * s, attack: 0.004, decay: 0.22, sweepTo: 600, out: o }); // leaves
  audio.tone({ freq: 130, to: 80, type: 'sine', gain: 0.1 * s, attack: 0.003, decay: 0.12, out: o });                     // the bowl
  audio.noiseBurst({ freq: 3200, q: 6, gain: 0.03 * s, decay: 0.06, delay: 0.03, out: o });                             // chain jingle
});

// ---------------------------------------------------------------- build
export function build(ctx) {
  const sim = ctx.sim;
  const mod = sim && sim.extras && sim.extras.mods.baskets;
  if (!mod || !mod.items) return {};
  const lite = ctx.lite;
  buildBrackets(ctx.scene, lite);
  const atlas = atlasTexture(lite ? 256 : 512);
  const shared = { uTime: { value: 0 } };
  const baskets = [];
  for (const it of mod.items) {
    const geo = basketGeometry(it.def, lite);
    const uniforms = { uSway: { value: new THREE.Vector3() }, uFlutter: { value: 0.003 } };
    const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.uniforms.uSway = uniforms.uSway;
      sh.uniforms.uFlutter = uniforms.uFlutter;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;\nuniform vec3 uSway;\nuniform float uFlutter;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float hang = aSway;
          vec3 fl = vec3(sin(uTime * 7.3 + position.y * 37.0 + position.x * 23.0), 0.4 * sin(uTime * 9.1 + position.z * 29.0), cos(uTime * 6.1 + position.z * 31.0 + position.y * 19.0));
          transformed += uSway * hang + fl * uFlutter * (hang + 0.004);`);
    };
    mat.customProgramCacheKey = () => 'helicoptea-basket';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    const b = {
      it, mesh, uniforms, hold: 0,
      tilt: new THREE.Vector3(), tiltV: new THREE.Vector3(),       // trails' lag (world, per metre of hang)
      lastP: new THREE.Vector3().copy(it.track.currP), vel: new THREE.Vector3(), lastV: new THREE.Vector3(),
      breezePh: it.def.seed * 1.7,
    };
    it.track.sample(1, mesh.position, mesh.quaternion);
    mesh.updateMatrix();
    // The flight replay poses the basket through a proxy.
    ctx.replayProxy(it.def.id, (proxy) => {
      mesh.position.copy(proxy.position); mesh.quaternion.copy(proxy.quaternion);
      b.hold = 2;
    });
    baskets.push(b);
  }

  let time = 0;
  return baskets[0].mesh.__extraApi = {
    baskets,
    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);
      time += dt;
      shared.uTime.value = time;
      for (const b of baskets) {
        const { mesh, it, uniforms } = b;
        if (b.hold > 0) b.hold--;
        else it.track.sample(1, mesh.position, mesh.quaternion);
        // Basket velocity and acceleration (for the trails' lag).
        _p.copy(mesh.position);
        b.vel.copy(_p).sub(b.lastP).divideScalar(dt);
        b.lastP.copy(_p);
        _a.copy(b.vel).sub(b.lastV).divideScalar(dt);
        b.lastV.copy(b.vel);
        if (_a.lengthSq() > 400) _a.setLength(20);
        // Air round the trails (only sampled when a rotor is about).
        let airS = 0;
        _g.set(0, 0, 0);
        const near = sim.air && !sim.air.calm && sim.air.wakes.some((wk) => wk.active && Math.abs(wk.hub.x - _p.x) < 1.2 && Math.abs(wk.hub.z - _p.z) < 1.2);
        if (near) {
          _o.set(_p.x, _p.y - 0.12, _p.z);
          ctx.airAt(_o, _g);
          _g.sub(b.vel);
          airS = _g.length();
        }
        // A whisper of breeze.
        const br = 0.25 * (0.6 + 0.4 * Math.sin(time * 0.37 + b.breezePh)) * (0.7 + 0.3 * Math.sin(time * 1.9 + b.breezePh * 2));
        _g.x += 0.8 * br; _g.z += 0.6 * br;
        // Trails as a damped hanging spring: pulled by gravity back under their roots, lagging the basket's
        // swing, pushed by the air.
        const k = 38, c = 3.2, kd = 3.5;
        b.tiltV.x += (-k * b.tilt.x - c * b.tiltV.x - _a.x * 0.6 + kd * _g.x) * dt;
        b.tiltV.z += (-k * b.tilt.z - c * b.tiltV.z - _a.z * 0.6 + kd * _g.z) * dt;
        b.tiltV.y = 0;
        b.tilt.addScaledVector(b.tiltV, dt);
        if (b.tilt.length() > 0.7) b.tilt.setLength(0.7);
        // Plumb correction: world down in the basket's frame, minus its own down.
        _qi.copy(mesh.quaternion).invert();
        _o.set(0, -1, 0).applyQuaternion(_qi).add(UP);
        _o.add(_g.copy(b.tilt).applyQuaternion(_qi));
        uniforms.uSway.value.copy(_o);
        uniforms.uFlutter.value = 0.0025 + Math.min(0.03, airS * 0.007);
      }
    },
  };
}
