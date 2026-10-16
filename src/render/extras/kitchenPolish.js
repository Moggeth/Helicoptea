import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROOM, COUNTER } from '../../sim/layout.js';
import { FIG } from '../../sim/extras/pottingBench.js';
import { Batcher, T, boxUV } from '../batch.js';
import { glazeMaterial, vesselGeometry } from '../models.js';
import { makeNoise, fbm } from '../gardenTextures.js';
import { canvasTex } from './pottingBench.js';

// Kitchen polish: Shaker cabinetry over the counter's plain slabs (framed doors with recessed panels, a
// row of drawers, aged-brass cup pulls, knobs and hinge knuckles, a recessed plinth, a worktop edge, end
// panels, panelled upper doors under a crown moulding), and a fiddle-leaf fig in a glazed stoneware pot in
// the front-left corner whose leaves sway and flutter in rotor wash. Its colliders live in
// src/sim/extras/pottingBench.js (this module has no sim side). Draw calls: paint, brass, glaze, the soil
// and trunk, and the leaves (one InstancedMesh).

const fy = ROOM.floorY;
const SAGE = 0x8fa79a, SHADOW = 0x29322d, PLINTH = 0x7b9286, CREAM = 0xe8e0d0;

// Faint brushed-paint texture (near white; vertex colours carry the paint colour).
function paintTex(size) {
  const n = makeNoise(71);
  return canvasTex(size, (c, S) => {
    const img = c.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const g = 243 + 11 * fbm(n, x / 3, y / 60, 3) - 5 * fbm(n, x / 40 + 9, y / 40, 2);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, g); img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

// Reactive stoneware glaze: deep blue-green with paler runs from the rim, breaking tan at the rim, a bare
// clay foot. Mapped on a lathe (u around, v up the outside, over the rim and down the inside).
function glazeTex(size) {
  const n = makeNoise(83);
  const runs = [];
  for (let i = 0; i < 46; i++) runs.push([Math.random(), 0.005 + Math.random() * 0.012, 0.12 + Math.random() * 0.3]);
  return canvasTex(size, (c, S) => {
    const img = c.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = 1 - y / S, i = (y * S + x) * 4;
      const f = fbm(n, u * 30, v * 30, 4);
      let r = 38 + 22 * f, g = 74 + 26 * f, b = 84 + 24 * f;
      if (v < 0.5) {
        // Runs down from the rim (v = 0.5) on the outside.
        let run = 0;
        for (const [ru, w, l] of runs) {
          let du = Math.abs(u - ru); du = Math.min(du, 1 - du);
          if (du < w && v > 0.5 - l) run = Math.max(run, (1 - du / w) * THREE.MathUtils.smoothstep(v, 0.5 - l, 0.5 - l + 0.08));
        }
        r += (112 - r) * run * 0.55; g += (150 - g) * run * 0.55; b += (150 - b) * run * 0.55;
      }
      const brk = Math.exp(-(((v - 0.53) / 0.04) ** 2));
      r += (170 - r) * brk * 0.7; g += (160 - g) * brk * 0.7; b += (130 - b) * brk * 0.7;
      if (v < 0.075) { const t = THREE.MathUtils.smoothstep(v, 0.06, 0.075); r = 150 * (1 - t) + r * t; g = 118 * (1 - t) + g * t; b = 88 * (1 - t) + b * t; }
      if (fbm(n, u * 300, v * 300, 1) > 0.8) { r *= 0.7; g *= 0.7; b *= 0.7; }
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

// Fiddle-leaf fig leaf: glossy deep green, pale midrib, curving lateral veins, a lighter edge.
function leafTex(w, h) {
  const n = makeNoise(97);
  return canvasTex(w, (c) => {
    c.canvas.height = h;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3d6a2c'); g.addColorStop(0.6, '#2f5a24'); g.addColorStop(1, '#2a5222');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const img = c.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, k = 0.88 + 0.22 * fbm(n, x / 18, y / 18, 3);
      img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
    }
    c.putImageData(img, 0, 0);
    // Lateral veins (canvas y = 0 is the tip): fine, pale, a little irregular, fading towards the margin.
    c.lineCap = 'round';
    for (let k = 0; k < 13; k++) {
      const y0 = h * (0.1 + k * 0.068 + 0.012 * Math.sin(k * 2.3));
      for (const s of [-1, 1]) {
        const lean = 0.07 + 0.03 * Math.sin(k * 1.7 + s);
        const gr = c.createLinearGradient(w / 2, 0, w / 2 + s * w * 0.45, 0);
        gr.addColorStop(0, 'rgba(200,218,150,0.45)'); gr.addColorStop(1, 'rgba(200,218,150,0.0)');
        c.strokeStyle = gr; c.lineWidth = w * 0.009;
        c.beginPath(); c.moveTo(w / 2, y0); c.quadraticCurveTo(w / 2 + s * w * 0.2, y0 - h * 0.025, w / 2 + s * w * 0.46, y0 - h * lean); c.stroke();
      }
    }
    // A slightly lighter rim.
    c.strokeStyle = 'rgba(120,150,70,0.25)'; c.lineWidth = w * 0.03; c.strokeRect(0, 0, w, h);
    c.strokeStyle = 'rgba(214,226,160,0.75)'; c.lineWidth = w * 0.028;
    c.beginPath(); c.moveTo(w / 2, h * 0.04); c.lineTo(w / 2, h); c.stroke();
  }, { repeat: false });
}

// One leaf (plus petiole) as a bent grid: y along the leaf (petiole -0.12..0, blade 0..1), x across, z the
// face normal. Width follows a fiddle outline (broad above the middle, a rounded tip).
function leafGeometry(nx, ny) {
  const pos = [], uv = [], idx = [];
  const rows = [];
  for (let j = 0; j <= ny + 2; j++) {
    let y, half;
    if (j < 2) { y = -0.09 + j * 0.045; half = 0.0065; }
    else {
      const t = (j - 2) / ny;
      y = t;
      // Fiddle outline: a wedge base, a faint waist, broadest near the top and a blunt rounded tip.
      const f = t < 0.7 ? 0.2 + 0.8 * THREE.MathUtils.smootherstep(t, 0, 0.7) - 0.08 * Math.exp(-(((t - 0.42) / 0.09) ** 2)) : Math.sqrt(Math.max(0, 1 - ((t - 0.7) / 0.305) ** 2));
      half = 0.37 * f;
      half = Math.max(half, 0.0065);
    }
    rows.push([y, half]);
  }
  rows.forEach(([y, half], j) => {
    const t = Math.max(0, y);
    for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1, x = u * half;
      const z = 0.05 * u * u * half / 0.33 - 0.14 * t * t + 0.012 * Math.sin(t * 17 + u * 2) * Math.abs(u) - 0.02 * Math.abs(u) * (1 - t);
      pos.push(x, y, z);
      uv.push(0.5 + x * 1.45, Math.max(0, 1 - Math.max(0, y)));
    }
  });
  const W = nx + 1;
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < nx; i++) {
    const a = j * W + i, b2 = a + W;
    idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Tapered tube along a curve.
function taperTube(curve, segs, r0, r1, radial = 8) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [], uv = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, p);
    const r = r0 + (r1 - r0) * i / segs, N = frames.normals[i], B = frames.binormals[i];
    for (let k = 0; k <= radial; k++) {
      const a = k / radial * Math.PI * 2;
      pos.push(p.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), p.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), p.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
      uv.push(k / radial * 0.1, i / segs * curve.getLength());
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function build(ctx) {
  const { scene, lite } = ctx;
  const b = new Batcher();
  const paint = new THREE.MeshStandardMaterial({ map: paintTex(lite ? 128 : 256), roughness: 0.52 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xa8854a, metalness: 1, roughness: 0.36, side: THREE.DoubleSide });
  const box = (w, h, d) => boxUV(w, h, d, 1);
  buildCabinets(b, paint, brass, box, lite);
  buildPotAndTrunk(b, lite);
  b.build(scene);
  const fig = buildLeaves(ctx);
  return { update: fig.update };
}

// ---------------------------------------------------------------- cabinets
function buildCabinets(b, paint, brass, box, lite) {
  const C = COUNTER;
  const xs = C.x1 - 0.62;                 // front face of the lower carcass (kitchen.js draws it 0.62 deep)
  const z0 = -1.0, z1 = 1.4;              // the drawn counter runs 0.2 +- 1.2
  const fT = 0.026, xf = xs - fT;         // face frame: 26 mm proud of the slab
  const doorT = 0.021, gap = 0.0025;
  const plinthTop = fy + 0.1, wtUnder = C.top - 0.04;

  // Knob: a turned mushroom, axis out of the door (-x).
  const knobGeo = new THREE.LatheGeometry([[0.0001, 0], [0.009, 0], [0.009, 0.002], [0.0055, 0.008], [0.006, 0.013], [0.0135, 0.019], [0.015, 0.023], [0.0125, 0.027], [0.0001, 0.0285]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  knobGeo.rotateZ(Math.PI / 2);   // +y -> -x
  // Cup pull: back plate and a hood open at the bottom, axis along z.
  const cupPull = (x, y, z) => {
    const r = 0.0155, L = 0.072;
    b.add(new RoundedBoxGeometry(0.004, 0.036, 0.096, 2, 0.0015), brass, T(x - 0.002, y + 0.003, z));
    const hood = new THREE.CylinderGeometry(r, r, L, 16, 1, true, Math.PI, Math.PI / 2 + 0.55);
    hood.rotateX(Math.PI / 2);
    b.add(hood, brass, T(x - 0.004, y + 0.006, z));
    for (const s of [-1, 1]) b.add(new THREE.CircleGeometry(r, 10, Math.PI / 2, Math.PI / 2 + 0.55), brass, T(x - 0.004, y + 0.006, z + s * L / 2));
  };
  const knob = (x, y, z) => b.add(knobGeo, brass, T(x, y, z));
  const hinges = (x, yA, yB, z) => { for (const y of [yA, yB]) b.add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 8), brass, T(x - 0.002, y, z)); };

  // Shaker door: frame (stiles and rails) with a recessed flat panel, lying in the yz plane, front at xFront.
  const door = (xFront, yA, yB, zA, zB, rail = 0.062, tint = SAGE) => {
    const w = zB - zA, h = yB - yA, cx = xFront + doorT / 2, cy = (yA + yB) / 2, cz = (zA + zB) / 2;
    for (const s of [-1, 1]) b.add(box(doorT, h, rail), paint, T(cx, cy, cz + s * (w - rail) / 2), tint);
    for (const s of [-1, 1]) b.add(box(doorT, rail, w - 2 * rail), paint, T(cx, cy + s * (h - rail) / 2, cz), tint);
    // Panel: 8 mm back from the frame, with a hairline shadow round it (a slightly darker rebate).
    b.add(box(0.006, h - 2 * rail + 0.006, w - 2 * rail + 0.006), paint, T(xFront + 0.012, cy, cz), new THREE.Color(tint).multiplyScalar(0.7));
    b.add(box(doorT - 0.008, h - 2 * rail, w - 2 * rail), paint, T(xFront + 0.008 + (doorT - 0.008) / 2, cy, cz), tint);
  };
  const drawer = (xFront, yA, yB, zA, zB, tint = SAGE) => {
    b.add(new RoundedBoxGeometry(doorT, yB - yA, zB - zA, 2, 0.0025), paint, T(xFront + doorT / 2, (yA + yB) / 2, (zA + zB) / 2), tint);
  };
  // Dark reveal behind an opening (so the gaps round doors read as gaps).
  const reveal = (yA, yB, zA, zB) => b.add(box(0.006, yB - yA, zB - zA), paint, T(xs - 0.003, (yA + yB) / 2, (zA + zB) / 2), SHADOW);

  // ---------------------------------------------------------------- lower run
  const stile = 0.04, railT = 0.03, midR = 0.035;
  const yDoorA = plinthTop + railT, yDrA = wtUnder - railT - 0.15, yTop = wtUnder - railT;
  const bounds = [z0, z0 + 0.6, z0 + 1.2, z0 + 1.8, z1];
  // Face frame: rails full length, stiles at each unit boundary.
  const ff = (yA, yB, zA, zB) => b.add(box(fT, yB - yA, zB - zA), paint, T(xs - fT / 2, (yA + yB) / 2, (zA + zB) / 2), SAGE);
  ff(plinthTop, plinthTop + railT, z0, z1);
  ff(yTop, wtUnder, z0, z1);
  bounds.forEach((z, i) => {
    const zA = i === 0 ? z : i === bounds.length - 1 ? z - stile : z - stile / 2;
    ff(plinthTop + railT, yTop, zA, zA + stile);
  });
  for (let u = 0; u < 4; u++) {
    const zA = bounds[u] + (u === 0 ? stile : stile / 2), zB = bounds[u + 1] - (u === 3 ? stile : stile / 2), zc = (zA + zB) / 2;
    const xF = xf + 0.001;
    if (u === 1) {
      // Pan drawers: deep, middle, top.
      const ys = [[yDoorA, fy + 0.43], [fy + 0.43 + midR, yDrA - midR], [yDrA, yTop]];
      for (let k = 0; k < ys.length; k++) {
        const [a, c] = ys[k];
        if (k < 2) ff(c, c + midR, zA, zB);
        reveal(a, c, zA, zB);
        drawer(xF, a + gap, c - gap, zA + gap, zB - gap);
        cupPull(xF, k === 2 ? (a + c) / 2 : c - 0.06, zc);
      }
    } else {
      ff(yDrA - midR, yDrA, zA, zB);
      reveal(yDrA, yTop, zA, zB); reveal(yDoorA, yDrA - midR, zA, zB);
      drawer(xF, yDrA + gap, yTop - gap, zA + gap, zB - gap);
      cupPull(xF, (yDrA + yTop) / 2, zc);
      door(xF, yDoorA + gap, yDrA - midR - gap, zA + gap, zB - gap);
      const hingeLeft = u % 2 === 0, zk = hingeLeft ? zB - 0.045 : zA + 0.045, zh = hingeLeft ? zA + gap / 2 : zB - gap / 2;
      knob(xF, yDrA - midR - 0.075, zk);
      hinges(xF, yDoorA + 0.09, yDrA - midR - 0.09, zh);
    }
  }
  // Recessed plinth (toe kick), and end panels on both ends of the run.
  b.add(box(0.012, plinthTop - fy, z1 - z0), paint, T(xs - 0.002, (plinthTop + fy) / 2, (z0 + z1) / 2), PLINTH);
  for (const [z, s] of [[z0, -1], [z1, 1]]) {
    b.add(box(C.x1 - xf - 0.01, wtUnder - fy, 0.018), paint, T((xf + 0.01 + C.x1) / 2, (wtUnder + fy) / 2, z + s * 0.009), SAGE);
    // A framed look on the end panel: a shallow recessed field.
    b.add(box(C.x1 - xf - 0.13, wtUnder - fy - 0.24, 0.004), paint, T((xf + C.x1) / 2 + 0.01, (wtUnder + fy) / 2 + 0.03, z + s * 0.0185), new THREE.Color(SAGE).multiplyScalar(0.94));
  }
  // Worktop edge: a rounded nosing across the front and both ends (the worktop itself is kitchen.js's).
  const wz0 = -1.02, wz1 = 1.42, nose = 0.022;
  b.add(new RoundedBoxGeometry(nose, 0.0432, wz1 - wz0 + 0.004, 3, 0.007), paint, T(C.x0 - 0.012 + nose / 2, C.top - 0.0206, (wz0 + wz1) / 2), CREAM);
  for (const z of [wz0 - 0.004, wz1 + 0.004]) b.add(new RoundedBoxGeometry(C.x1 - C.x0 + 0.01, 0.0432, 0.012, 3, 0.005), paint, T((C.x0 + C.x1) / 2 - 0.006, C.top - 0.0206, z), CREAM);

  // ---------------------------------------------------------------- upper cabinets
  const ux = C.x1 - C.upperDepth, uf = ux - 0.022, uA = C.upperY0, uB = C.upperY1;
  const ufr = (yA, yB, zA, zB) => b.add(box(0.022, yB - yA, zB - zA), paint, T(ux - 0.011, (yA + yB) / 2, (zA + zB) / 2), SAGE);
  const uTopR = 0.045, uBotR = 0.03;
  ufr(uA, uA + uBotR, z0, z1); ufr(uB - uTopR, uB, z0, z1);
  bounds.forEach((z, i) => { const zA = i === 0 ? z : i === bounds.length - 1 ? z - stile : z - stile / 2; ufr(uA + uBotR, uB - uTopR, zA, zA + stile); });
  for (let u = 0; u < 4; u++) {
    const zA = bounds[u] + (u === 0 ? stile : stile / 2), zB = bounds[u + 1] - (u === 3 ? stile : stile / 2), zm = (zA + zB) / 2;
    const yA = uA + uBotR, yB = uB - uTopR;
    b.add(box(0.006, yB - yA, zB - zA), paint, T(ux - 0.003, (yA + yB) / 2, zm), SHADOW);
    for (const [a, c, s] of [[zA, zm, -1], [zm, zB, 1]]) {
      door(uf + 0.001, yA + gap, yB - gap, a + (s < 0 ? gap : gap / 2), c - (s < 0 ? gap / 2 : gap), 0.05);
      knob(uf + 0.001, yA + 0.06, s < 0 ? c - 0.03 : a + 0.03);
      hinges(uf + 0.001, yA + 0.07, yB - 0.07, s < 0 ? a + gap / 2 : c - gap / 2);
    }
  }
  for (const [z, s] of [[z0, -1], [z1, 1]]) b.add(box(C.upperDepth + 0.022, uB - uA, 0.016), paint, T(C.x1 - (C.upperDepth + 0.022) / 2, (uA + uB) / 2, z + s * 0.008), SAGE);
  // Light rail under the uppers, and a crown moulding (cove, bead and a flat cap) round the top.
  b.add(box(0.03, 0.022, z1 - z0 + 0.04), paint, T(uf + 0.012, uA - 0.006, (z0 + z1) / 2), SAGE);
  const crown = new THREE.Shape();
  // Profile in (out, up) from the carcass face: flat fascia, a cove sweeping out, a bead, the cap.
  crown.moveTo(0, 0); crown.lineTo(-0.024, 0); crown.lineTo(-0.024, 0.016);
  for (let i = 1; i <= 8; i++) { const a = i / 8 * Math.PI / 2; crown.lineTo(-0.024 - 0.03 * (1 - Math.cos(a)), 0.016 + 0.03 * Math.sin(a)); }
  crown.lineTo(-0.058, 0.046); crown.lineTo(-0.058, 0.054); crown.lineTo(-0.062, 0.054); crown.lineTo(-0.062, 0.066); crown.lineTo(0, 0.066); crown.lineTo(0, 0);
  const run = (len) => { const g = new THREE.ExtrudeGeometry(crown, { depth: len, bevelEnabled: false, curveSegments: 4 }); return g; };
  // Front run (along z): shape x = out (-x world), y = up.
  b.add(run(z1 - z0 + 0.124), paint, T(ux, uB, z0 - 0.062), SAGE);
  // Returns on the two ends, mitred by overlap (shape x along -z / +z).
  b.add(run(C.upperDepth + 0.062), paint, T(C.x1, uB, z0, -Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1, 1, 1)), SAGE);
  b.add(run(C.upperDepth + 0.062), paint, T(ux - 0.062, uB, z1, Math.PI / 2), SAGE);
}

// ---------------------------------------------------------------- fig: pot, saucer, soil, trunk
const LEAF = [];   // filled by buildPotAndTrunk: [{ p: Vector3, dir, roll, s, h, young }]
let TRUNK_TOP = null;

function buildPotAndTrunk(b, lite) {
  const F = FIG, x = F.x, z = F.z;
  const glaze = glazeMaterial(0xffffff, { roughness: 0.28, extra: { map: glazeTex(lite ? 128 : 256), clearcoat: 0.7 } });
  const earth = new THREE.MeshStandardMaterial({ map: canvasTex(128, (c, S) => {
    const n = makeNoise(5); const img = c.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const g = 170 + 85 * fbm(n, (i % S) / 6, Math.floor(i / S) / 6, 3); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
  }), roughness: 0.92 });
  // Saucer and pot.
  b.add(vesselGeometry({ rOutBottom: F.saucerR - 0.02, rOut: F.saucerR, rIn: F.saucerR - 0.008, rInBottom: F.saucerR - 0.026, height: F.saucerH, bottom: 0.007, foot: 0.004, segments: 48 }), glaze, T(x, fy, z));
  b.add(vesselGeometry({ rOutBottom: F.potRb, rOut: F.potR, rIn: F.potR - 0.012, rInBottom: F.potRb - 0.014, height: F.potH, bottom: 0.02, foot: 0.008, segments: 56, belly: 0.012 }), glaze, T(x, fy + 0.007, z, 0.7));
  // Soil with grit and a little moss.
  const soilY = fy + 0.007 + F.potH - 0.035;
  const sg = new THREE.CircleGeometry(F.potR - 0.013, 28);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, 0.004 * Math.sin(sp.getX(i) * 90) * Math.sin(sp.getY(i) * 70 + 1));
  sg.computeVertexNormals();
  b.add(sg, earth, T(x, soilY, z, 0, -Math.PI / 2), 0x3a2c22);
  const rnd = (() => { let s = 77; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  for (let i = 0; i < (lite ? 8 : 18); i++) {
    const a = rnd() * Math.PI * 2, r = 0.03 + rnd() * 0.11;
    b.add(new THREE.IcosahedronGeometry(0.004 + rnd() * 0.003, 0), earth, T(x + Math.cos(a) * r, soilY + 0.002, z + Math.sin(a) * r, rnd() * 3, rnd() * 3), i % 3 ? 0xd8d4cc : 0x5f7a3a);
  }
  // Trunk (tapered, a gentle S) and one side branch into the room.
  const base = new THREE.Vector3(x, soilY - 0.01, z);
  const trunk = new THREE.CatmullRomCurve3([base, new THREE.Vector3(x + 0.015, soilY + 0.3, z - 0.01), new THREE.Vector3(x + 0.0, 0.12, z - 0.02), new THREE.Vector3(x + 0.03, 0.38, z - 0.03), new THREE.Vector3(x + 0.05, 0.6, z - 0.05)]);
  b.add(taperTube(trunk, 24, 0.019, 0.007, 9), earth, null, 0x7a6a58);
  const bStart = trunk.getPointAt(0.42);
  const branch = new THREE.CatmullRomCurve3([bStart, bStart.clone().add(new THREE.Vector3(0.07, 0.07, -0.05)), bStart.clone().add(new THREE.Vector3(0.16, 0.2, -0.12)), bStart.clone().add(new THREE.Vector3(0.2, 0.34, -0.16))]);
  b.add(taperTube(branch, 14, 0.011, 0.005, 7), earth, null, 0x7d6c5a);
  TRUNK_TOP = trunk.getPointAt(1);
  // Leaves: spiral up the trunk's top two thirds and the branch, bigger below, small and upright at the tips.
  LEAF.length = 0;
  const n = lite ? 22 : 36, nb = Math.round(n * 0.3);
  const place = (curve, count, t0, seed, hBase) => {
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const t = t0 + (1 - t0) * (i + 0.5) / count;
      curve.getPointAt(Math.min(1, t), p);
      let az = seed + i * 2.4;
      const young = t > 0.88;
      const el = young ? 0.85 + rnd() * 0.3 : 0.55 - 0.45 * (1 - t) + rnd() * 0.3;
      const s = (young ? 0.13 + rnd() * 0.06 : 0.25 + 0.09 * Math.sin(Math.PI * t) + rnd() * 0.05) * hBase;
      // Keep the leaves out of the walls: turn a leaf that would reach the side or front wall into the room.
      for (let k = 0; k < 12; k++) {
        const tipX = p.x + Math.cos(az) * Math.cos(el) * s * 1.05, tipZ = p.z + Math.sin(az) * Math.cos(el) * s * 1.05;
        if (tipX > ROOM.minX + 0.04 && tipZ < ROOM.maxZ - 0.04) break;
        az += 0.45;
      }
      const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      LEAF.push({ p: p.clone(), dir, roll: (rnd() - 0.5) * 0.7, s, h: THREE.MathUtils.clamp((p.y - soilY) / 1.1, 0, 1), young, ph: rnd() * 6.28, fq: 7 + rnd() * 6 });
    }
  };
  place(trunk, n - nb, 0.3, 0.3, 1);
  place(branch, nb, 0.25, 1.7, 0.95);
  // One fallen leaf on the floor by the saucer (they do that).
  LEAF.push({ p: new THREE.Vector3(x + 0.26, fy + 0.004, z - 0.12), dir: new THREE.Vector3(Math.cos(-0.6), 0.02, Math.sin(-0.6)), roll: 0.3, s: 0.24, h: 0, young: false, fallen: true, ph: 0, fq: 0 });
}

// ---------------------------------------------------------------- fig: the leaves (instanced, animated)
function buildLeaves(ctx) {
  const { scene, lite } = ctx;
  const geo = leafGeometry(lite ? 6 : 8, lite ? 9 : 14);
  const mat = new THREE.MeshPhysicalMaterial({ map: leafTex(lite ? 128 : 256, lite ? 256 : 512), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, side: THREE.DoubleSide });
  const N = LEAF.length;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), M = new THREE.Matrix4();
  const rest = LEAF.map((L, i) => {
    Y.copy(L.dir).normalize();
    Z.copy(up).addScaledVector(Y, -Y.dot(up)).normalize();
    Z.applyAxisAngle(Y, L.roll);
    X.crossVectors(Y, Z).normalize();
    M.makeBasis(X, Y, Z);
    const q = new THREE.Quaternion().setFromRotationMatrix(M);
    col.setHex(L.fallen ? 0x8a8a3a : L.young ? 0xc8e0a0 : 0xffffff).multiplyScalar(L.fallen ? 1 : 0.92 + 0.16 * ((i * 0.618) % 1));
    mesh.setColorAt(i, col);
    return { q, p: L.p, s: L.s };
  });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _p = new THREE.Vector3(), _sv = new THREE.Vector3();
  const _a = new THREE.Vector3(), _lo = new THREE.Vector3(), _hi = new THREE.Vector3(), _sLo = new THREE.Vector3(), _sHi = new THREE.Vector3(), _air = new THREE.Vector3(), _d = new THREE.Vector3();
  const writeRest = () => { for (let i = 0; i < N; i++) mesh.setMatrixAt(i, _m.compose(rest[i].p, rest[i].q, _sv.setScalar(rest[i].s))); mesh.instanceMatrix.needsUpdate = true; };
  writeRest();
  mesh.computeBoundingSphere();
  scene.add(mesh);

  const F = FIG, cLo = new THREE.Vector3(F.x + 0.12, -0.2, F.z - 0.1), cHi = new THREE.Vector3(F.x + 0.08, 0.64, F.z - 0.08);
  let t = 0, energy = 0, atRest = true, rustleT = 0;
  const near = (sim) => {
    const A = sim && sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.hypot(wk.hub.x - F.x, wk.hub.z - F.z) < 1.6) return true;
      if (wk.vg && Math.hypot(wk.hit.x - F.x, wk.hit.z - F.z) < 1.4) return true;
    }
    return false;
  };
  return {
    update(dt, sim) {
      t += dt;
      const live = near(sim);
      if (live) {
        ctx.airAt(cLo, _lo); ctx.airAt(cHi, _hi);
        // The wake stops on the canopy's (soft) collider, so add the air arriving there: the column's
        // speed where it lands, fading with distance from the trunk.
        for (const wk of sim.air.wakes) {
          if (!wk.active || !wk.vg || wk.hit.y < fy + 0.3) continue;
          const d = Math.hypot(wk.hit.x - F.x - 0.08, wk.hit.z - F.z + 0.08);
          if (d > 0.5) continue;
          const f = wk.vg * (1 - d / 0.5);
          _hi.addScaledVector(wk.dir, f); _lo.addScaledVector(wk.dir, f * 0.6);
        }
      } else { _lo.set(0, 0, 0); _hi.set(0, 0, 0); }
      const k = 1 - Math.exp(-dt * 5);
      _sLo.lerp(_lo, k); _sHi.lerp(_hi, k);
      const e = Math.max(_sLo.length(), _sHi.length());
      energy += (e - energy) * (1 - Math.exp(-dt * (e > energy ? 8 : 1.5)));
      if (!live && energy < 0.02) {
        if (!atRest) { writeRest(); atRest = true; _sLo.set(0, 0, 0); _sHi.set(0, 0, 0); energy = 0; }
        return;
      }
      atRest = false;
      for (let i = 0; i < N; i++) {
        const L = LEAF[i], R = rest[i];
        if (L.fallen) continue;
        _air.copy(_sLo).lerp(_sHi, L.h);
        const sp = _air.length();
        // Lean with the air about the leaf's base: tip goes downwind (stiffer when the air runs along it).
        _d.copy(L.dir);
        _ax.crossVectors(_d, _air);
        const across = _ax.length();
        _q.copy(R.q);
        if (across > 1e-4) {
          const ang = Math.min(0.75, 0.16 * across / (1 + 0.15 * sp));
          _dq.setFromAxisAngle(_ax.multiplyScalar(1 / across), ang);
          _q.premultiply(_dq);
        }
        // Flutter: twist about the midrib and flap about the petiole, faster and bigger in stronger air.
        const fl = Math.min(0.5, 0.07 * energy + 0.03 * energy * energy) * (L.young ? 1.4 : 1);
        if (fl > 0.002) {
          const w = t * L.fq * (0.8 + 0.1 * energy) + L.ph;
          _dq.setFromAxisAngle(_d, fl * Math.sin(w));
          _q.premultiply(_dq);
          _ax.crossVectors(_d, up).normalize();
          _dq.setFromAxisAngle(_ax, 0.6 * fl * Math.sin(w * 1.37 + 1.1));
          _q.premultiply(_dq);
        }
        // The crown sways a little as a whole.
        _p.copy(R.p).addScaledVector(_air, Math.min(0.02, 0.006 * L.h * L.h * 1.5));
        _p.y -= Math.min(0.01, 0.002 * L.h * Math.max(0, -_air.y));
        mesh.setMatrixAt(i, _m.compose(_p, _q, _sv.setScalar(R.s)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      // A dry rustle now and then in a stiff draught.
      const A = ctx.audio;
      if (A && A.ready && energy > 1.2 && t > rustleT) {
        rustleT = t + 0.09 + Math.random() * 0.2 / Math.min(3, energy);
        A.noiseBurst({ freq: 2600 + Math.random() * 2600, q: 0.9, gain: Math.min(0.05, 0.01 * energy), attack: 0.01, decay: 0.08 + Math.random() * 0.1, out: A.spot(cHi, 0.7) });
      }
    },
  };
}
