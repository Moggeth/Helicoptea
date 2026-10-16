import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM, TREE, GARDEN, HEDGE } from '../../sim/layout.js';

// A heap of fallen apple leaves under the apple tree. One shaped, curled leaf geometry (serrated ovate
// blade, midrib, petiole) in one InstancedMesh, each leaf its own autumn colour. Rotor wash lifts and
// scatters them: a woken leaf's velocity relaxes towards the local air (faster when it presents its face to
// the flow), it falls against heavy drag with a side-slipping flutter, tumbles, and settles flat on the
// ground where it then sleeps. Sleeping leaves cost nothing; leaves stay where they're blown until the
// sandbox is reset. One draw call (plus its shadow).

const FY = ROOM.floorY;
const LEN = 0.072;           // blade length (m)
const WID = 0.04;            // blade width
const PET = 0.018;           // petiole length
// The pile: a heap against the trunk, thinning out to a scatter over the patch under the tree.
const PILE = { x: 2.56, z: -5.32, rx: 0.3, rz: 0.25, h: 0.1 };
const AREA = { x0: 2.0, x1: 3.4, z0: -4.8, z1: -5.9 };
const TRUNK_R = TREE.trunkR * 1.35;
// Autumn apple leaves: mostly dull yellows, ochres and browns, a few russet and a few still greenish.
const PALETTE = [0xc49a48, 0xb8873a, 0xcfa752, 0xa8743a, 0x9a6234, 0x8a5a36, 0x7a4e30, 0x9c5a32, 0xa86a3a, 0x9c9448, 0x86884a, 0xb89a5a];

function leafTexture() {
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let s = 5;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // u (x) runs base -> tip over [0.1, 1]; the petiole uses x < 0.08. v (y) runs across the blade.
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, W, H);
  // Mottling and browning: darker towards the edges and the tip, a few dry spots.
  for (let i = 0; i < 900; i++) {
    const x = W * (0.1 + rnd() * 0.9), y = rnd() * H, e = Math.abs(y / H - 0.5) * 2;
    const a = 0.04 + 0.12 * e * e + 0.1 * Math.max(0, x / W - 0.75);
    g.fillStyle = `rgba(${90 + rnd() * 40},${60 + rnd() * 30},${30 + rnd() * 20},${a})`;
    g.beginPath(); g.arc(x, y, 2 + rnd() * 5, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 7; i++) {
    const x = W * (0.25 + rnd() * 0.65), y = H * (0.2 + rnd() * 0.6), r = 2 + rnd() * 4;
    g.fillStyle = 'rgba(70,40,20,0.55)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(180,140,60,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 1.5, 0, Math.PI * 2); g.stroke();
  }
  const edge = g.createLinearGradient(0, 0, 0, H);
  edge.addColorStop(0, 'rgba(80,45,20,0.55)'); edge.addColorStop(0.12, 'rgba(80,45,20,0.12)'); edge.addColorStop(0.5, 'rgba(0,0,0,0)');
  edge.addColorStop(0.88, 'rgba(80,45,20,0.12)'); edge.addColorStop(1, 'rgba(80,45,20,0.55)');
  g.fillStyle = edge; g.fillRect(W * 0.08, 0, W, H);
  // Veins: a pale midrib and pinnate laterals curving towards the tip.
  g.strokeStyle = 'rgba(255,248,225,0.85)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(W * 0.1, H / 2); g.lineTo(W, H / 2); g.stroke();
  g.lineWidth = 1.4; g.strokeStyle = 'rgba(255,246,220,0.6)';
  for (let i = 0; i < 8; i++) {
    const x0 = W * (0.16 + i * 0.1);
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(x0, H / 2);
      g.quadraticCurveTo(x0 + W * 0.05, H / 2 + sd * H * 0.25, x0 + W * 0.12, H / 2 + sd * H * 0.47); g.stroke();
    }
  }
  // Petiole: darker, woody.
  g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, W * 0.08, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// The leaf lies along +x (petiole at the origin side), face up (+y), edges curled up a little and the tip
// lifted, as a drying leaf does. Centred on its blade's middle.
function leafGeometry() {
  const nu = 16, nv = 6, pos = [], uv = [], idx = [];
  const x0 = -LEN / 2;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    // Ovate outline: widest a third of the way up, an acute tip, a rounded base; serrated.
    let hw = WID / 2 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85);
    const tooth = (u * 22) % 1;
    hw *= 1 + 0.05 * (tooth < 0.7 ? tooth / 0.7 : (1 - tooth) / 0.3) * (u > 0.08 && u < 0.97 ? 1 : 0);
    if (i === 0) hw = 0.0012;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv * 2 - 1;
      const x = x0 + u * LEN, z = v * hw;
      const y = 0.16 * Math.abs(v) ** 2 * hw + 0.07 * LEN * u * u - 0.0015 * (1 - Math.abs(v)) * Math.sin(Math.PI * u);
      pos.push(x, y, z);
      uv.push(0.1 + 0.9 * u, (v + 1) / 2);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  // Petiole: a thin strip curving slightly up off the ground.
  const pet = new THREE.PlaneGeometry(PET, 0.0016, 3, 1).rotateX(-Math.PI / 2).translate(x0 - PET / 2, 0.001, 0);
  const pp = pet.attributes.position, pu = pet.attributes.uv;
  for (let k = 0; k < pp.count; k++) { const d = (x0 - pp.getX(k)) / PET; pp.setY(k, 0.001 + 0.004 * d * d); pu.setXY(k, 0.04, pu.getY(k)); }
  pet.computeVertexNormals();
  return mergeGeometries([blade.toNonIndexed(), pet.toNonIndexed()], false);
}

function sandboxReset(sim, fn) {
  const ex = sim && sim.extras;
  if (!ex) return;
  if (!ex.__resetHooks) {
    ex.__resetHooks = [];
    const r0 = ex.reset.bind(ex);
    ex.reset = () => { r0(); for (const f of ex.__resetHooks) f(); };
  }
  ex.__resetHooks.push(fn);
}

export function build(ctx) {
  const N = ctx.lite ? 120 : 250;
  const mat = new THREE.MeshStandardMaterial({ map: leafTexture(), side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  const mesh = new THREE.InstancedMesh(leafGeometry(), mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = !ctx.lite;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'leaves:leaves';
  ctx.scene.add(mesh);

  // ---------------------------------------------------------------- the heap
  let rs = 4321;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const home = new Float32Array(N * 7);    // x, y, z, quaternion
  const P = new Float32Array(N * 3), V = new Float32Array(N * 3), Q = new Float32Array(N * 4), Wv = new Float32Array(N * 3);
  const rest = new Float32Array(N);        // ground height a leaf settles at (a little jitter avoids z-fighting)
  const thr = new Float32Array(N), ph = new Float32Array(N);
  const awake = new Uint8Array(N);         // 0 asleep, 1 awake
  const airborne = new Uint8Array(N);
  const calmT = new Float32Array(N);
  const list = [];                         // awake leaves
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x, z, y;
    for (let tries = 0; ; tries++) {
      if (i < N * 0.82) {
        // In the heap: denser and higher towards its middle.
        const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.75);
        x = PILE.x + Math.cos(a) * r * PILE.rx; z = PILE.z + Math.sin(a) * r * PILE.rz;
        y = FY + 0.004 + PILE.h * Math.pow(1 - r * r, 1.3) * (0.35 + 0.65 * rnd());
      } else {
        x = AREA.x0 + 0.05 + rnd() * (AREA.x1 - AREA.x0 - 0.1); z = AREA.z1 + 0.05 + rnd() * (AREA.z0 - AREA.z1 - 0.1);
        y = FY + 0.003 + rnd() * 0.006;
      }
      if (Math.hypot(x - TREE.x, z - TREE.z) > TRUNK_R + 0.03 || tries > 20) break;
    }
    const flip = rnd() < 0.35;
    _e.set((rnd() - 0.5) * 0.7 + (flip ? Math.PI : 0), rnd() * Math.PI * 2, (rnd() - 0.5) * 0.7, 'YXZ');
    _q.setFromEuler(_e);
    home[i * 7] = x; home[i * 7 + 1] = y; home[i * 7 + 2] = z;
    _q.toArray(home, i * 7 + 3);
    rest[i] = FY + 0.003 + rnd() * 0.006;
    thr[i] = 0.9 + rnd() * 0.9;
    ph[i] = rnd() * 6.28;
    col.setHex(PALETTE[(rnd() * PALETTE.length) | 0]).multiplyScalar(0.82 + rnd() * 0.3);
    mesh.setColorAt(i, col);
  }
  const _sc = new THREE.Vector3();
  const place = (i) => {
    _q.fromArray(Q, i * 4);
    _m.compose(_p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), _q, _sc.copy(_s));
    mesh.setMatrixAt(i, _m);
  };
  const resetAll = () => {
    for (let i = 0; i < N; i++) {
      P[i * 3] = home[i * 7]; P[i * 3 + 1] = home[i * 7 + 1]; P[i * 3 + 2] = home[i * 7 + 2];
      for (let k = 0; k < 4; k++) Q[i * 4 + k] = home[i * 7 + 3 + k];
      V[i * 3] = V[i * 3 + 1] = V[i * 3 + 2] = 0; Wv[i * 3] = Wv[i * 3 + 1] = Wv[i * 3 + 2] = 0;
      awake[i] = 0; airborne[i] = 0; calmT[i] = 0;
      place(i);
    }
    list.length = 0;
    mesh.instanceMatrix.needsUpdate = true;
  };
  resetAll();
  mesh.instanceColor.needsUpdate = true;
  sandboxReset(ctx.sim, resetAll);

  const wake = (i) => { if (!awake[i]) { awake[i] = 1; calmT[i] = 0; list.push(i); } };
  // A leaf that leaves its spot lets the ones lying on it drop.
  const unsupport = (i) => {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    for (let j = 0; j < N; j++) {
      if (awake[j] || P[j * 3 + 1] <= y + 0.002) continue;
      const dx = P[j * 3] - x, dz = P[j * 3 + 2] - z;
      if (dx * dx + dz * dz < 0.0036) wake(j);
    }
  };

  // Is a rotor wake blowing anywhere near the leaves? (bounds of everything awake or at home)
  const box = { x0: AREA.x0, x1: AREA.x1, z0: AREA.z1, z1: AREA.z0 };
  const near = (sim) => {
    const air = sim && sim.air;
    if (!air || air.calm) return null;
    for (const wk of air.wakes) {
      if (!wk.active) continue;
      const reach = wk.vg ? Math.max(0.3, 8 * wk.footR) : 0.25;
      const px = wk.vg ? wk.hit.x : wk.hub.x, pz = wk.vg ? wk.hit.z : wk.hub.z;
      if (wk.vg && wk.hit.y > FY + 0.25) continue; // landing on something high (the stump): no outwash here
      if (px > box.x0 - reach && px < box.x1 + reach && pz > box.z0 - reach && pz < box.z1 + reach) return wk;
    }
    return null;
  };

  const defBreeze = new THREE.Vector4(0.8, 0.6, 0.6, 0.6);
  const _air = new THREE.Vector3();
  let t = 0;

  const api = {
    update(dt, sim) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 1 / 30);
      t += dt;
      const wk = near(sim);
      if (!wk && !list.length) return;   // a still heap: nothing to do
      // Wake sleeping leaves the wash can move.
      if (wk) {
        const hx = wk.vg ? wk.hit.x : wk.hub.x, hz = wk.vg ? wk.hit.z : wk.hub.z;
        const reach = (wk.vg ? Math.max(0.3, 8 * wk.footR) : 0.25) ** 2;
        for (let i = 0; i < N; i++) {
          if (awake[i]) continue;
          const dx = P[i * 3] - hx, dz = P[i * 3 + 2] - hz;
          if (dx * dx + dz * dz > reach) continue;
          _p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
          ctx.airAt(_p, _air);
          if (Math.hypot(_air.x, _air.z) > thr[i]) { wake(i); unsupport(i); }
        }
      }
      const g = ctx.kitchen && ctx.kitchen.garden;
      const B = g && g.grass ? g.grass.uniforms.uBreeze.value : defBreeze;
      for (let n = list.length - 1; n >= 0; n--) {
        const i = list[n], i3 = i * 3;
        _p.set(P[i3], P[i3 + 1], P[i3 + 2]);
        if (wk) {
          // The outwash sheet is thin at the ground, but it is what drives everything here: a leaf above it
          // feels it fading over a thicker layer (the jet thickens and rolls up into eddies), the column's
          // own downwash, and updrafts where the eddies lift off.
          const h = Math.max(0, P[i3 + 1] - rest[i]);
          ctx.airAt(_p, _a);
          _p.y = rest[i] + 0.004;
          ctx.airAt(_p, _air);
          const fade = Math.exp(-h / 0.16), gs = Math.hypot(_air.x, _air.z);
          _air.x *= fade; _air.z *= fade;
          _air.y = _a.y;
          if (gs > 0.7 && h < 0.5) _air.y += gs * (0.5 + 0.7 * Math.max(0, Math.sin(t * 3.3 + ph[i] * 2))) * Math.exp(-h / 0.3);
        } else _air.set(0, 0, 0);
        // A little of the breeze reaches down to a leaf in flight.
        const lift = P[i3 + 1] - FY;
        if (lift > 0.03) { const b = B.z * Math.min(1, lift * 3); _air.x += B.x * b; _air.z += B.y * b; }
        _q.fromArray(Q, i * 4);
        _n.set(0, 1, 0).applyQuaternion(_q);   // the leaf's face normal
        const hs = Math.hypot(_air.x, _air.z);
        const onGround = P[i3 + 1] <= rest[i] + 0.0005;
        if (onGround && hs > thr[i]) {
          // Caught by the outwash: the air gets under its edge and flips it up.
          airborne[i] = 1;
          V[i3 + 1] = Math.max(V[i3 + 1], (0.4 + 0.5 * rnd()) * hs);
          Wv[i3] += (rnd() - 0.5) * 30; Wv[i3 + 2] += (rnd() - 0.5) * 30;
        }
        if (!onGround || airborne[i]) {
          airborne[i] = 1;
          // Drag: a leaf flat-on to the relative wind takes it fully, edge-on much less.
          const rx = _air.x - V[i3], ry = _air.y - V[i3 + 1], rz = _air.z - V[i3 + 2];
          const rl = Math.hypot(rx, ry, rz) + 1e-6;
          const face = Math.abs(_n.x * rx + _n.y * ry + _n.z * rz) / rl;
          const k = 2.5 + 9 * face;
          V[i3] += rx * k * dt; V[i3 + 1] += (ry * k - 9.8) * dt; V[i3 + 2] += rz * k * dt;
          // Flutter: falling flat, a leaf side-slips back and forth.
          const fl = Math.sin(t * 7 + ph[i]) * Math.min(1.5, Math.abs(V[i3 + 1])) * 3.5;
          V[i3] += Math.cos(ph[i]) * fl * dt; V[i3 + 2] += Math.sin(ph[i]) * fl * dt;
          // Tumble: spin relaxes towards a rate set by the airflow.
          const spinK = Math.min(1, 3 * dt), target = 4 + rl * 5;
          Wv[i3] += (Math.sin(ph[i] + t) * target - Wv[i3]) * spinK;
          Wv[i3 + 1] += (Math.cos(ph[i] * 2) * target * 0.5 - Wv[i3 + 1]) * spinK;
          Wv[i3 + 2] += (Math.cos(ph[i] + t * 0.7) * target - Wv[i3 + 2]) * spinK;
        } else {
          // Sliding along: ground friction, and the face settles flat.
          const f = Math.exp(-8 * dt);
          V[i3] = (V[i3] + (_air.x * 0.3) * dt) * f; V[i3 + 2] = (V[i3 + 2] + (_air.z * 0.3) * dt) * f; V[i3 + 1] = 0;
          Wv[i3] *= f; Wv[i3 + 1] *= f; Wv[i3 + 2] *= f;
        }
        P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
        // Rotation.
        const wl = Math.hypot(Wv[i3], Wv[i3 + 1], Wv[i3 + 2]);
        if (wl > 1e-4) { _a.set(Wv[i3] / wl, Wv[i3 + 1] / wl, Wv[i3 + 2] / wl); _q2.setFromAxisAngle(_a, wl * dt); _q.premultiply(_q2); }
        // Landing.
        if (P[i3 + 1] <= rest[i]) {
          P[i3 + 1] = rest[i];
          if (V[i3 + 1] < 0) V[i3 + 1] = 0;
          if (hs < thr[i]) airborne[i] = 0;
        }
        if (!airborne[i]) {
          // Lie flat (face up or down, whichever is nearer), keeping its heading.
          _n.set(0, 1, 0).applyQuaternion(_q);
          _a.set(0, _n.y >= 0 ? 1 : -1, 0);
          _q2.setFromUnitVectors(_n, _a);
          _q3.identity().slerp(_q2, Math.min(1, 12 * dt));
          _q.premultiply(_q3);
        }
        _q.normalize().toArray(Q, i * 4);
        // Walls, hedge and the trunk.
        if (P[i3] < GARDEN.minX + 0.03) { P[i3] = GARDEN.minX + 0.03; V[i3] = 0; }
        if (P[i3] > GARDEN.maxX - 0.03) { P[i3] = GARDEN.maxX - 0.03; V[i3] = 0; }
        if (P[i3 + 2] < HEDGE.z1 + 0.02) { P[i3 + 2] = HEDGE.z1 + 0.02; V[i3 + 2] = 0; }
        const tx = P[i3] - TREE.x, tz = P[i3 + 2] - TREE.z, td = Math.hypot(tx, tz);
        if (td < TRUNK_R && P[i3 + 1] < TREE.trunkTop) { P[i3] = TREE.x + tx / (td + 1e-6) * TRUNK_R; P[i3 + 2] = TREE.z + tz / (td + 1e-6) * TRUNK_R; V[i3] *= -0.3; V[i3 + 2] *= -0.3; }
        if (P[i3 + 1] > 2.5) { P[i3 + 1] = 2.5; V[i3 + 1] = Math.min(0, V[i3 + 1]); }
        place(i);
        // Sleep once it has lain still in calm air for a moment.
        const still = !airborne[i] && Math.hypot(V[i3], V[i3 + 2]) < 0.02 && hs < thr[i] * 0.7;
        calmT[i] = still ? calmT[i] + dt : 0;
        if (calmT[i] > 0.4) { awake[i] = 0; V[i3] = V[i3 + 1] = V[i3 + 2] = 0; Wv[i3] = Wv[i3 + 1] = Wv[i3 + 2] = 0; list[n] = list[list.length - 1]; list.pop(); }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    get state() {
      let moved = 0;
      for (let i = 0; i < N; i++) if (Math.hypot(P[i * 3] - home[i * 7], P[i * 3 + 2] - home[i * 7 + 2]) > 0.05) moved++;
      let air = 0, top = 0;
      for (const i of list) { if (airborne[i]) air++; top = Math.max(top, P[i * 3 + 1] - FY); }
      return { awake: list.length, moved, airborne: air, top: +top.toFixed(3) };
    },
  };
  mesh.userData.mod = api;
  return api;
}
