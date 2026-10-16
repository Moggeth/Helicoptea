import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BIRDBATH } from '../../sim/layout.js';

// A folded newspaper boat afloat in the bird bath. Render-only kinematics: it rides the water, bobs and
// rocks, is blown across the bath by the rotor's outwash (and drifts in the breeze), bumps gently off the
// rim, turns slowly, and settles when the air goes still. Slightly soggy newsprint: the paper darkens and
// sags where it has drunk the water. One draw call.

const WATER_Y = BIRDBATH.top - 0.02;   // the bath's still water level (see View.birdbath)
const R_IN = BIRDBATH.r * 0.86;        // the water's radius
const L = 0.124, H = 0.03, W = 0.026;  // length, side height, half beam at the gunwale
const KEEL = 0.034;                    // half length of the keel fold
const MID = 0.03;                      // gunwale shoulders (x)
const SAIL = 0.07;                     // peak of the middle fold above the keel
const DRAFT = 0.006;
const R_BOAT = 0.056;                  // collision radius with the rim (its half length, nearly)
const _p = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

function newsprint(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size / 2;
  const g = c.getContext('2d');
  const k = size / 512;
  let s = 1234;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = '#e6e1d2'; g.fillRect(0, 0, c.width, c.height);
  // Fibres and foxing.
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${120 + r() * 60},${110 + r() * 50},${90 + r() * 40},${0.05 + r() * 0.08})`; g.fillRect(r() * c.width, r() * c.height, (1 + r() * 3) * k, (0.5 + r()) * k); }
  // Headline, a photo, and columns of small type (made-up words, too small to read at the boat's size).
  const words = ['parish', 'fete', 'marrow', 'record', 'rain', 'council', 'hedge', 'bus', 'route', 'jam', 'stall', 'garden', 'show', 'notes', 'weather', 'cricket', 'green', 'bridge', 'repairs', 'lost', 'cat', 'found', 'church', 'roof', 'appeal', 'allotment', 'onions', 'prize', 'village', 'hall'];
  g.fillStyle = 'rgba(40,38,36,0.6)';
  g.font = `bold ${30 * k}px Georgia, serif`;
  g.fillText('MARROW BREAKS VILLAGE RECORD', 14 * k, 40 * k);
  g.fillStyle = 'rgba(40,38,36,0.5)';
  g.fillRect(14 * k, 50 * k, c.width - 28 * k, 1.5 * k);
  // Halftone photo.
  const px = 300 * k, py = 62 * k, pw = 190 * k, ph = 120 * k;
  for (let y = 0; y < ph; y += 4 * k) for (let x = 0; x < pw; x += 4 * k) {
    const v = 0.5 + 0.35 * Math.sin(x / pw * 5 + y / ph * 3) * Math.cos(y / ph * 4) + (r() - 0.5) * 0.2;
    g.fillStyle = `rgba(30,30,30,${0.1 + v * 0.3})`;
    g.beginPath(); g.arc(px + x, py + y, 1.6 * k * v + 0.3, 0, Math.PI * 2); g.fill();
  }
  g.font = `${9 * k}px Georgia, serif`;
  const cols = [[14, 62, 130], [152, 62, 130], [300, 192, 190], [14, 192, 130], [152, 192, 130]];
  for (const [x0, y0, w] of cols) {
    for (let y = y0 * k; y < c.height - 8 * k; y += 10.5 * k) {
      if (y0 === 62 && y > 182 * k) break;
      let line = '';
      while (g.measureText(line).width < w * k - 20 * k) line += words[Math.floor(r() * words.length)] + ' ';
      g.fillStyle = `rgba(45,42,40,${0.28 + r() * 0.14})`;
      g.fillText(line, x0 * k, y);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A panel: bilinear patch through four corners (p00, p10, p01, p11), with a grid and a sag function.
function patch(p00, p10, p01, p11, nu, nv, uvOf, sag) {
  const g = new THREE.PlaneGeometry(1, 1, nu, nv);
  const P = g.attributes.position, U = g.attributes.uv;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    const u = U.getX(i), v = U.getY(i);
    a.lerpVectors(p00, p10, u); b.lerpVectors(p01, p11, u);
    a.lerp(b, v);
    if (sag) sag(a, u, v);
    P.setXYZ(i, a.x, a.y, a.z);
    const [tu, tv] = uvOf(a);
    U.setXY(i, tu, tv);
  }
  g.computeVertexNormals();
  return g;
}

function boatGeometry() {
  const parts = [];
  const uvSide = (s) => (p) => [(p.x + L / 2) / L * 0.62 + 0.04, 0.12 + p.y / 0.08 * 0.4 + (s > 0 ? 0.5 : 0)];
  for (const s of [-1, 1]) {
    const K1 = new THREE.Vector3(-KEEL, 0, 0), K2 = new THREE.Vector3(KEEL, 0, 0);
    const M1 = new THREE.Vector3(MID, H, s * W), M2 = new THREE.Vector3(-MID, H, s * W);
    const B = new THREE.Vector3(L / 2, H * 1.08, s * 0.0015), S = new THREE.Vector3(-L / 2, H * 1.08, s * 0.0015);
    // Soggy: sides belly out a little and the gunwale droops amidships.
    const sag = (p, u, v) => { p.z += s * 0.0035 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v * 0.8); p.y -= 0.0022 * Math.sin(Math.PI * u) * v; };
    parts.push(patch(K1, K2, M2, M1, 6, 3, uvSide(s), sag));
    parts.push(patch(K2, K2.clone().lerp(B, 0.5).setZ(0), M1, B, 3, 3, uvSide(s), (p, u, v) => { p.z += s * 0.002 * Math.sin(Math.PI * v) * (1 - u); }));
    parts.push(patch(S, S.clone().lerp(K1, 0.5).setZ(0), M2, K1, 3, 3, uvSide(s), (p, u, v) => { p.z += s * 0.002 * Math.sin(Math.PI * v) * u; }));
    // The middle fold (the 'sail'): two layers of paper rising from the keel, a touch apart.
    const off = s * 0.0011;
    parts.push(patch(new THREE.Vector3(-KEEL * 1.15, 0.002, off), new THREE.Vector3(KEEL * 1.15, 0.002, off), new THREE.Vector3(-0.003, SAIL, off), new THREE.Vector3(0.003, SAIL, off), 4, 4,
      (p) => [0.7 + (p.x + KEEL) / (2 * KEEL) * 0.26, 0.1 + p.y / SAIL * 0.8 * 0.5 + (s > 0 ? 0.45 : 0)],
      (p, u, v) => { p.z += 0.004 * v * v + s * 0.0006 * Math.sin(Math.PI * u); p.x += 0.003 * v * v; }));
  }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false);
  for (const g of parts) g.dispose();
  // Wetness: darker and greyer near the waterline and in a few blotches.
  const P = merged.attributes.position;
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const blot = Math.max(0, Math.sin(x * 140 + z * 90) * Math.sin(y * 210 - x * 60) - 0.55) * 1.6;
    const wet = Math.min(1, THREE.MathUtils.smoothstep(0.016, 0.002, y) + blot * 0.5);
    col[i * 3] = 1 - wet * 0.36; col[i * 3 + 1] = 1 - wet * 0.34; col[i * 3 + 2] = 1 - wet * 0.28;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeBoundingSphere();
  return merged;
}

export function build(ctx) {
  const mat = new THREE.MeshStandardMaterial({ map: newsprint(ctx.lite ? 256 : 512), vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(boatGeometry(), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  const B = BIRDBATH;
  const st = {
    x: 0.05, z: -0.03, vx: 0, vz: 0,
    yaw: 0.7, yawV: 0.04,
    heave: 0, heaveV: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0,
    chop: 0, time: Math.random() * 10,
  };
  const air = new THREE.Vector3();
  let still = 0;
  function place() {
    _e.set(st.roll, st.yaw, st.pitch); // roll about the boat's length (x), pitch about its beam (z)
    mesh.quaternion.setFromEuler(_e);
    mesh.position.set(B.x + st.x, WATER_Y - DRAFT + st.heave, B.z + st.z);
  }
  place();
  return mesh.__extraApi = {
    state: st,
    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.05);
      st.time += dt;
      const t = st.time;
      // The air at the boat (the rotor only when a wake is about; a faint breeze always).
      air.set(0, 0, 0);
      const sim = ctx.sim, A = sim && sim.air;
      let near = false;
      if (A && !A.calm) for (const wk of A.wakes) if (wk.active && (Math.hypot(wk.hub.x - B.x, wk.hub.z - B.z) < 1.2 || (wk.vg && Math.hypot(wk.hit.x - B.x, wk.hit.z - B.z) < 1.0))) near = true;
      if (near) {
        _p.set(B.x + st.x, B.top + 0.012, B.z + st.z);
        ctx.airAt(_p, air);
        // Right under the column the air comes straight down: it presses the boat and kicks up a chop.
        const down = Math.max(0, -air.y);
        st.chop = Math.min(1, Math.max(st.chop, down * 0.25 + Math.hypot(air.x, air.z) * 0.15));
        st.heaveV -= down * down * 0.02 * dt * 60;
        air.y = 0;
      }
      if (!near && still > 3 && st.chop < 0.01) { // calm and settled: idle bob only (cheap)
        st.heave = 0.0006 * Math.sin(t * 1.3);
        st.roll = 0.015 * Math.sin(t * 0.9 + 1); st.pitch = 0.01 * Math.sin(t * 0.7);
        st.yaw += st.yawV * dt; st.yawV *= Math.exp(-dt * 0.2);
        place();
        return;
      }
      // A breath of breeze that wanders round, so a calm boat meanders rather than parks on the rim.
      const ba = t * 0.05 + Math.sin(t * 0.13) * 2;
      air.x += 0.045 * Math.cos(ba); air.z += 0.045 * Math.sin(ba);
      // Forces in the boat's frame: little resistance lengthwise, a lot sideways.
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      const fx = cy, fz = -sy; // boat's +x (bow) in world xz
      const rx = air.x - st.vx, rz = air.z - st.vz, rs = Math.hypot(rx, rz);
      let ax = 0.9 * rs * rx, az = 0.9 * rs * rz;                 // air drag on the hull and the fold
      const vl = st.vx * fx + st.vz * fz;                          // speed along the boat
      const vsx = st.vx - vl * fx, vsz = st.vz - vl * fz;           // and sideways
      const vs = Math.hypot(vsx, vsz);
      ax -= 10 * Math.abs(vl) * vl * fx + 36 * vs * vsx + 0.6 * st.vx;
      az -= 10 * Math.abs(vl) * vl * fz + 36 * vs * vsz + 0.6 * st.vz;
      st.vx += ax * dt; st.vz += az * dt;
      st.x += st.vx * dt; st.z += st.vz * dt;
      // The rim: a soft bounce, a turn.
      const r = Math.hypot(st.x, st.z), lim = R_IN - R_BOAT;
      if (r > lim) {
        const nx = st.x / r, nz = st.z / r;
        st.x = nx * lim; st.z = nz * lim;
        const vn = st.vx * nx + st.vz * nz;
        if (vn > 0) {
          st.vx -= 1.35 * vn * nx; st.vz -= 1.35 * vn * nz;
          // Glancing off the stone turns it a little (more for a harder knock); it rubs along the rim.
          const vt = st.vx * -nz + st.vz * nx;
          st.yawV += vt * Math.min(1, vn * 20) * 4;
          st.vx *= 0.97; st.vz *= 0.97;
          st.rollV += vn * 8;
          st.chop = Math.min(1, st.chop + vn * 0.5);
        }
        st.yawV *= Math.exp(-dt * 2);
      }
      // Yaw: the air turns it (off-centre push on the fold), the water damps it.
      const torque = (rx * fz - rz * fx) * rs * 0.25 + Math.sin(t * 0.37) * rs * 0.12;
      st.yawV += (torque - st.yawV * 1.2) * dt;
      st.yawV = THREE.MathUtils.clamp(st.yawV, -1.2, 1.2);
      st.yaw += st.yawV * dt;
      // Heave, roll and pitch: springs on the water, stirred by the chop and heeled by the air.
      st.chop *= Math.exp(-dt * 0.9);
      const ch = st.chop;
      const crossW = rx * -fz + rz * fx;                             // air across the boat
      const heel = THREE.MathUtils.clamp(crossW * rs * 0.08, -0.35, 0.35);
      st.heaveV += (-90 * st.heave - 4 * st.heaveV + ch * 0.12 * Math.sin(t * 11.3) + ch * 0.06 * Math.sin(t * 17.1)) * dt;
      st.heave += st.heaveV * dt;
      st.rollV += (-70 * (st.roll - heel) - 3 * st.rollV + ch * 9 * Math.sin(t * 9.7 + 1)) * dt;
      st.roll += st.rollV * dt;
      st.pitchV += (-80 * st.pitch - 3 * st.pitchV + ch * 6 * Math.sin(t * 8.3 + 2) + vl * 2) * dt;
      st.pitch += st.pitchV * dt;
      const moving = Math.hypot(st.vx, st.vz) + Math.abs(st.yawV) * 0.05 + ch;
      still = moving < 0.004 ? still + dt : 0;
      place();
    },
  };
}
