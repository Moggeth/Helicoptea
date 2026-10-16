import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM, GARDEN } from '../../sim/layout.js';

// Dandelion clocks in the meadow's long grass. Each head is a ball of real seeds (achene, beak and a
// parachute pappus), and every seed of every head is one instance of one InstancedMesh: attached seeds sit
// round their head and follow its stalk (bent in the shader by a per-head offset), so a still meadow costs
// nothing but a dozen spring updates. Strong rotor wash at a head pulls its seeds off; each then drifts on
// the air field and the breeze, sinking slowly, and fades after some seconds. Heads regrow after ~40 s.
// Draw calls: stalks (instanced) and seeds (instanced, blended).

const FY = ROOM.floorY;
const LREF = 0.38;          // stalk geometry's height (instances scale it)
const R_REC = 0.0032;       // receptacle radius
const SINK = 0.28;          // a dandelion seed's terminal fall speed (m/s)
const REGROW = 40;          // seconds after a head is blown before it is a clock again

// Heads in the meadow (z < -4.7), clear of the bench, the tree and its leaf pile, the stump, the stepping
// stones and the washing-line post: x, z, stalk length, static lean x, z.
const HEADS = [
  [-0.18, -4.86, 0.36, 0.02, -0.01], [0.04, -5.34, 0.41, -0.015, 0.02], [0.47, -5.1, 0.38, 0.01, 0.02],
  [0.56, -5.17, 0.33, 0.03, -0.015], [0.83, -4.88, 0.4, -0.02, -0.01], [1.02, -5.56, 0.44, 0.0, 0.025],
  [1.38, -5.06, 0.37, 0.02, 0.01], [1.62, -5.66, 0.39, -0.01, 0.0], [-0.62, -5.55, 0.42, 0.015, -0.02],
  [-0.68, -5.47, 0.35, -0.025, 0.01], [-2.76, -4.95, 0.38, 0.01, 0.02], [-3.04, -5.3, 0.43, 0.02, -0.01],
  [-2.62, -5.86, 0.36, -0.02, -0.02],
];

function seedTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Fine white filaments radiating from the beak's tip, each with a few barbs, fading towards the end.
  for (let i = 0; i < 56; i++) {
    const a = i / 56 * Math.PI * 2 + rnd() * 0.08, L = S * (0.4 + rnd() * 0.08);
    const ca = Math.cos(a), sa = Math.sin(a);
    const grad = g.createLinearGradient(0, 0, ca * L, sa * L);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.7, 'rgba(255,255,255,0.75)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * L, sa * L); g.stroke();
    g.lineWidth = 0.7; g.strokeStyle = 'rgba(255,255,255,0.45)';
    for (let k = 0; k < 5; k++) {
      const r = L * (0.35 + k * 0.12), bx = ca * r, by = sa * r, s = (k % 2 ? 1 : -1) * 0.5;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + s) * 5, by + Math.sin(a + s) * 5); g.stroke();
    }
  }
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath(); g.arc(0, 0, 4, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One seed along +y: achene (brown), slender beak, and the pappus as a shallow open umbrella at the top.
function seedGeometry() {
  const parts = [];
  const quad = (w, y0, y1, col) => {
    for (const ry of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(w, y1 - y0);
      g.translate(0, (y0 + y1) / 2, 0); g.rotateY(ry);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.5);
      colour(g, col); parts.push(g.toNonIndexed());
    }
  };
  const colour = (g, col) => {
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  };
  quad(0.0011, 0, 0.0042, 0x6e5034);
  quad(0.00035, 0.0042, 0.0145, 0xd9d3c2);
  // Pappus: a fan of filaments (texture) from the beak tip, cupped upwards.
  const n = 12, R = 0.0068, y0 = 0.0145, pos = [], uv = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    pos.push(0, y0, 0, Math.cos(a1) * R, y0 + 0.0026, Math.sin(a1) * R, Math.cos(a0) * R, y0 + 0.0026, Math.sin(a0) * R);
    uv.push(0.5, 0.5, 0.5 + 0.5 * Math.cos(a1), 0.5 + 0.5 * Math.sin(a1), 0.5 + 0.5 * Math.cos(a0), 0.5 + 0.5 * Math.sin(a0));
  }
  const p = new THREE.BufferGeometry();
  p.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  p.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  p.computeVertexNormals();
  colour(p, 0xf6f4ec);
  parts.push(p);
  for (const g of parts) if (!g.attributes.normal) g.computeVertexNormals();
  return mergeGeometries(parts, false);
}

// Stalk along +y (height LREF): a hollow pale stem, the bald receptacle on top and reflexed bracts under it.
function stalkGeometry() {
  const parts = [];
  const colour = (g, top, bottom) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c0 = new THREE.Color(bottom), c1 = new THREE.Color(top), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const t = THREE.MathUtils.clamp(g.attributes.position.getY(i) / LREF, 0, 1); c.copy(c0).lerp(c1, t).toArray(a, i * 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const stem = new THREE.CylinderGeometry(0.0014, 0.0019, LREF, 6, 10, true).translate(0, LREF / 2, 0);
  colour(stem, 0x9fae74, 0x8a6a58);
  const rec = new THREE.SphereGeometry(R_REC, 10, 6).scale(1, 0.7, 1).translate(0, LREF + 0.0005, 0);
  colour(rec, 0xb8a37c, 0xb8a37c);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    const b = new THREE.PlaneGeometry(0.0016, 0.012, 1, 3);
    const p = b.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.006; p.setZ(k, -0.0035 * (y / 0.012) ** 2); }
    b.translate(0, -0.006, 0).rotateX(Math.PI - 0.5).rotateY(-a).translate(Math.cos(a) * 0.0018, LREF - 0.002, Math.sin(a) * 0.0018);
    b.computeVertexNormals();
    colour(b, 0x4f6a35, 0x4f6a35);
  }
  return mergeGeometries(parts, false);
}

// Shader posing: an instance's vertices move by its head's offset (uOff), scaled along the stalk (t^2) for
// stalks, fully for attached seeds. The offset is added in world space after the instance transform.
function poseShader(s, n, kind, uOff) {
  s.uniforms.uOff = uOff;
  const head = kind === 'stalk'
    ? 'attribute float iHead;\nuniform vec3 uOff[' + n + '];\n'
    : 'attribute vec3 iSeed;\nuniform vec3 uOff[' + n + '];\nvarying float vFade;\n';
  const off = kind === 'stalk'
    ? 'float tt = clamp(position.y / ' + LREF.toFixed(4) + ', 0.0, 1.05);\n  vec3 bendOff = uOff[int(iHead + 0.5)] * (tt * tt);'
    : 'vec3 bendOff = uOff[int(iSeed.x + 0.5)] * iSeed.y;\n  vFade = iSeed.z;';
  s.vertexShader = head + s.vertexShader.replace('#include <project_vertex>', `${off}
  vec4 mvPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition.xyz += bendOff;
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`);
  if (kind === 'seed') s.fragmentShader = 'varying float vFade;\n' + s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vFade;');
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
  const NH = HEADS.length;
  const PER = ctx.lite ? 36 : 72;
  const SS = ctx.lite ? 1.25 : 1;    // half the seeds on the low tier: a little larger, so a head stays full
  const N = NH * PER;
  const uOff = { value: Array.from({ length: NH }, () => new THREE.Vector3()) };

  // ---------------------------------------------------------------- stalks
  const stalkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  stalkMat.onBeforeCompile = (s) => poseShader(s, NH, 'stalk', uOff);
  stalkMat.customProgramCacheKey = () => 'helicoptea-dandelion-stalk';
  const sg = stalkGeometry();
  const hi = new Float32Array(NH);
  for (let i = 0; i < NH; i++) hi[i] = i;
  sg.setAttribute('iHead', new THREE.InstancedBufferAttribute(hi, 1));
  const stalks = new THREE.InstancedMesh(sg, stalkMat, NH);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const heads = HEADS.map(([x, z, L, lx, lz], i) => {
    _q.setFromAxisAngle(_up, i * 2.4);
    _m.compose(_p.set(x, FY - 0.01, z), _q, _s.set(1, L / LREF, 1));
    stalks.setMatrixAt(i, _m);
    return {
      i, L, lean: new THREE.Vector3(lx, 0, lz), tip: new THREE.Vector3(x, FY - 0.01 + L, z),
      o: new THREE.Vector3(lx, 0, lz), ov: new THREE.Vector3(), ph: i * 1.93,
      blownAt: -1, attached: PER, gone: 0, fadeIn: 0,
    };
  });
  stalks.frustumCulled = false;
  stalks.receiveShadow = true;
  stalks.name = 'dandelions:stalks';
  ctx.scene.add(stalks);

  // ---------------------------------------------------------------- seeds
  const seedMat = new THREE.MeshLambertMaterial({ map: seedTexture(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.03, emissive: 0x5c5c58 });
  seedMat.onBeforeCompile = (s) => poseShader(s, NH, 'seed', uOff);
  seedMat.customProgramCacheKey = () => 'helicoptea-dandelion-seed';
  const geo = seedGeometry();
  const seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); // head, attached (0/1), fade
  seedAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iSeed', seedAttr);
  const seeds = new THREE.InstancedMesh(geo, seedMat, N);
  seeds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  seeds.frustumCulled = false;
  seeds.renderOrder = 2;
  seeds.name = 'dandelions:seeds';
  ctx.scene.add(seeds);

  // Seed state.
  const state = new Uint8Array(N);          // 0 attached, 1 flying, 2 landed (fading), 3 gone
  const dir = new Float32Array(N * 3);      // direction from the receptacle (attached)
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const age = new Float32Array(N), life = new Float32Array(N), thr = new Float32Array(N), spin = new Float32Array(N);
  const live = [];                          // indices of flying or landed seeds
  let rs = 977;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const placeAttached = (k) => {
    const h = heads[(k / PER) | 0];
    _v.set(dir[k * 3], dir[k * 3 + 1], dir[k * 3 + 2]);
    _q.setFromUnitVectors(_up, _v);
    _p.copy(h.tip).addScaledVector(_v, R_REC * 0.8);
    _m.compose(_p, _q, _s.set(SS, SS, SS));
    seeds.setMatrixAt(k, _m);
  };
  for (let h = 0; h < NH; h++) {
    for (let j = 0; j < PER; j++) {
      const k = h * PER + j;
      // Fibonacci sphere, leaving the underside (where the stalk is) bare.
      const y = 1 - (j + 0.5) / PER * 1.82, r = Math.sqrt(Math.max(0, 1 - y * y)), a = j * 2.39996 + h;
      _v.set(Math.cos(a) * r, y, Math.sin(a) * r).normalize();
      dir[k * 3] = _v.x; dir[k * 3 + 1] = _v.y; dir[k * 3 + 2] = _v.z;
      thr[k] = 1.1 + rnd() * 1.9;
      spin[k] = rnd() * 6.28;
      seedAttr.setXYZ(k, h, 1, 1);
      placeAttached(k);
    }
  }

  const defBreeze = new THREE.Vector4(0.8, 0.6, 0.6, 0.6);
  const _air = new THREE.Vector3(), _wash = new THREE.Vector3(), _ax = new THREE.Vector3();
  let t = 0, seedsDirty = false, attrDirty = false, breezeT = 6;

  const resetAll = () => {
    for (let k = 0; k < N; k++) { state[k] = 0; seedAttr.setXYZ(k, (k / PER) | 0, 1, 1); placeAttached(k); }
    for (const h of heads) { h.blownAt = -1; h.attached = PER; h.gone = 0; h.fadeIn = 0; }
    live.length = 0;
    seedsDirty = attrDirty = true;
  };
  sandboxReset(ctx.sim, resetAll);

  const release = (k, h, vx, vy, vz) => {
    state[k] = 1; age[k] = 0; life[k] = 6 + rnd() * 5;
    const i3 = k * 3;
    pos[i3] = h.tip.x + h.o.x + dir[i3] * 0.012; pos[i3 + 1] = h.tip.y + h.o.y + dir[i3 + 1] * 0.012; pos[i3 + 2] = h.tip.z + h.o.z + dir[i3 + 2] * 0.012;
    vel[i3] = vx + dir[i3] * 0.25; vel[i3 + 1] = vy + dir[i3 + 1] * 0.25; vel[i3 + 2] = vz + dir[i3 + 2] * 0.25;
    seedAttr.setY(k, 0);
    live.push(k);
    h.attached--;
    if (h.blownAt < 0) h.blownAt = t;
    attrDirty = true;
  };

  const washAt = (sim, p) => {
    const air = sim && sim.air;
    if (!air || air.calm) return false;
    for (const wk of air.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 0.5 && Math.abs(p.z - wk.hub.z) < 0.5) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 1.0 && Math.abs(p.z - wk.hit.z) < 1.0) return true;
    }
    return false;
  };

  const api = {
    update(dt, sim) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 1 / 20);
      t += dt;
      const g = ctx.kitchen && ctx.kitchen.garden;
      const B = g && g.grass ? g.grass.uniforms.uBreeze.value : defBreeze;
      // ---- heads: stalk springs, wash, release, regrowth
      for (const h of heads) {
        const gn = 0.5 + 0.3 * Math.sin(t * 1.1 + h.ph) + 0.2 * Math.sin(t * 2.9 + h.ph * 1.3);
        const bs = B.z * 0.8 * (1 - B.w + B.w * 1.8 * gn);
        _air.set(B.x * bs, 0, B.y * bs);
        _wash.set(0, 0, 0);
        _p.copy(h.tip).add(h.o);
        if (washAt(sim, _p)) { ctx.airAt(_p, _wash); _air.add(_wash); }
        // Drag bends the stalk (a v|v| load against a springy stem), the head bobs and settles.
        const sp = _air.length(), give = h.attached > PER * 0.3 ? 0.045 : 0.025;
        const lim = 0.55 * h.L;
        let tx = h.lean.x + _air.x * sp * give, tz = h.lean.z + _air.z * sp * give;
        const tl = Math.hypot(tx, tz);
        if (tl > lim) { tx *= lim / tl; tz *= lim / tl; }
        const kS = 70, cS = 6;
        h.ov.x += ((tx - h.o.x) * kS - h.ov.x * cS) * dt;
        h.ov.z += ((tz - h.o.z) * kS - h.ov.z * cS) * dt;
        h.o.x += h.ov.x * dt; h.o.z += h.ov.z * dt;
        h.o.y = -(h.o.x * h.o.x + h.o.z * h.o.z) / (1.6 * h.L) + Math.min(0, _wash.y) * 0.004;
        uOff.value[h.i].copy(h.o);
        // Seeds let go where the wash is strong enough for each.
        const ws = _wash.length();
        if (ws > 1.1 && h.attached > 0) {
          for (let j = 0; j < PER; j++) {
            const k = h.i * PER + j;
            if (state[k] !== 0 || ws < thr[k]) continue;
            if (rnd() < Math.min(1, (ws - thr[k]) * 5 * dt)) release(k, h, _air.x * 0.6, _air.y * 0.4, _air.z * 0.6);
          }
        }
        // Now and then a gust takes a single seed.
        if (h.attached > PER * 0.5 && rnd() < dt / 300) {
          const k = h.i * PER + ((rnd() * PER) | 0);
          if (state[k] === 0) release(k, h, _air.x, 0.05, _air.z);
        }
        // Regrowth: a fresh clock fades in once the old seeds have all gone.
        if (h.blownAt >= 0 && t - h.blownAt > REGROW && h.attached + h.gone >= PER) {
          for (let j = 0; j < PER; j++) { const k = h.i * PER + j; if (state[k] === 3) { state[k] = 0; seedAttr.setXYZ(k, h.i, 1, 0); placeAttached(k); } }
          h.attached = PER; h.gone = 0; h.blownAt = -1; h.fadeIn = 1e-3;
          seedsDirty = attrDirty = true;
        }
        if (h.fadeIn > 0) {
          h.fadeIn = Math.min(1, h.fadeIn + dt / 3);
          for (let j = 0; j < PER; j++) { const k = h.i * PER + j; if (state[k] === 0 && seedAttr.getZ(k) < h.fadeIn) seedAttr.setZ(k, h.fadeIn); }
          if (h.fadeIn >= 1) h.fadeIn = 0;
          attrDirty = true;
        }
      }
      // ---- free seeds
      if (live.length) {
        breezeT += dt;
        let anyWake = false;
        const air = sim && sim.air;
        if (air && !air.calm) for (const wk of air.wakes) if (wk.active) anyWake = true;
        const bs = B.z * 0.9;
        for (let n = live.length - 1; n >= 0; n--) {
          const k = live[n], i3 = k * 3;
          age[k] += dt;
          if (state[k] === 1) {
            _p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
            if (anyWake) ctx.airAt(_p, _air); else _air.set(0, 0, 0);
            // Breeze with eddies of its own; seeds sink at their terminal speed through it.
            const e = spin[k];
            _air.x += B.x * bs * (0.7 + 0.5 * Math.sin(t * 0.7 + e)) + 0.12 * Math.sin(t * 1.9 + e * 3);
            _air.z += B.y * bs * (0.7 + 0.5 * Math.sin(t * 0.6 + e * 2)) + 0.12 * Math.cos(t * 1.7 + e * 5);
            _air.y += -SINK + 0.1 * Math.sin(t * 1.3 + e * 4);
            // Eddies in a fast outwash near the ground toss seeds back up instead of pinning them down.
            const hs = Math.hypot(_air.x, _air.z);
            if (hs > 0.7 && pos[i3 + 1] < FY + 0.4) _air.y += 0.7 * hs * (0.6 + 0.4 * Math.sin(t * 3.1 + e * 7));
            const kk = Math.min(1, 7 * dt);
            vel[i3] += (_air.x - vel[i3]) * kk; vel[i3 + 1] += (_air.y - vel[i3 + 1]) * kk; vel[i3 + 2] += (_air.z - vel[i3 + 2]) * kk;
            pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
            // Keep inside the garden walls (they fetch up against the fence and fall).
            if (pos[i3] < GARDEN.minX + 0.02 || pos[i3] > GARDEN.maxX - 0.02) { pos[i3] = THREE.MathUtils.clamp(pos[i3], GARDEN.minX + 0.02, GARDEN.maxX - 0.02); vel[i3] = 0; }
            if (pos[i3 + 2] < GARDEN.minZ + 0.45) { pos[i3 + 2] = GARDEN.minZ + 0.45; vel[i3 + 2] = 0; }
            const ground = FY + 0.05 + (spin[k] % 1) * 0.12; // they come to rest on the grass tops
            if (pos[i3 + 1] < ground) {
              pos[i3 + 1] = ground;
              if (vel[i3 + 1] < 0) vel[i3 + 1] = 0;
              if (hs < 0.5) { state[k] = 2; age[k] = Math.max(age[k], life[k] - 2.5); }
            }
            // Pappus up, tilting with the slip through the air.
            _ax.set((vel[i3] - _air.x) * -1.5, 1, (vel[i3 + 2] - _air.z) * -1.5).normalize();
          } else _ax.set(0, 1, 0);
          _q.setFromUnitVectors(_up, _ax);
          _m.compose(_p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]), _q, _s.set(SS, SS, SS));
          seeds.setMatrixAt(k, _m);
          const f = THREE.MathUtils.clamp((life[k] - age[k]) / 2.5, 0, 1);
          seedAttr.setZ(k, f);
          if (age[k] >= life[k]) {
            state[k] = 3;
            _m.makeScale(0, 0, 0); seeds.setMatrixAt(k, _m);
            live[n] = live[live.length - 1]; live.pop();
            heads[(k / PER) | 0].gone++;
          }
        }
        seedsDirty = attrDirty = true;
      }
      if (seedsDirty) { seeds.instanceMatrix.needsUpdate = true; seedsDirty = false; }
      if (attrDirty) { seedAttr.needsUpdate = true; attrDirty = false; }
    },
    get state() { return { attached: heads.map((h) => h.attached), flying: live.length }; },
  };
  seeds.userData.mod = api;
  return api;
}
