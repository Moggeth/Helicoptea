import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOM, POTS } from '../../sim/layout.js';

// Garden windmills: three painted-tin whirligigs on stakes, two in the big patio pots and one in the lawn
// by the path. Each head turns on its stake like a weathervane (a tail fin keeps the wheel facing the
// breeze) and the wheel has real angular momentum: air through the disc drives it towards a tip-speed
// ratio, so rotor wash whirrs it up in a moment and it then coasts down slowly against bearing friction.
// Render-only (no bodies). Draw calls: stakes (static, one merged mesh), heads (instanced), wheels (instanced).

const FY = ROOM.floorY;
const BLADES = 8;
const R_TIP = 0.105;        // wheel radius (m)
const TSR = 2.0;            // tip-speed ratio the blades drive towards
// Muted enamel paints: [blade A, blade B, tail fin].
const PAINTS = [
  [0x6f8a6c, 0xe2d8bf, 0x6f8a6c],   // sage and cream
  [0x7e3a31, 0xe0d4b8, 0x7e3a31],   // oxblood and cream
  [0x4c5f71, 0xc0974f, 0x4c5f71],   // slate blue and ochre
];
const BRASS = 0xb38f58, ZINC = 0xa9aeb0;

// The three windmills: stake foot (x, y, z), stake top height, which paint, stake kind.
function sites() {
  const out = [];
  {
    const [x, z, , h] = POTS[0];
    out.push({ x: x + 0.035, z: z + 0.025, foot: FY + h * 0.92, top: -0.05, paint: 0, stake: 'rod', yaw0: 2.6 });
  }
  {
    const [x, z, , h] = POTS[2];
    out.push({ x: x - 0.04, z: z + 0.03, foot: FY + h * 0.92, top: -0.02, paint: 1, stake: 'rod', yaw0: 3.4 });
  }
  out.push({ x: 1.13, z: -3.58, foot: FY - 0.02, top: -0.2, paint: 2, stake: 'wood', yaw0: 2.2 });
  return out;
}

// One standard material for every part, with metalness and roughness carried per vertex (aMR.xy), so
// brass, zinc, enamel and stained wood all draw in one call per mesh. Instanced meshes add two paints per
// instance (iPaintA, iPaintB) picked by the vertex's paint slot (aMR.z: 1 = A, 2 = B, 4 = A, never blurred).
// With `blur`, a fast wheel's blades thin out (hashed alpha) and a soft disc (slot 3) fades in instead, so a
// whirring wheel reads as a blur rather than strobing at the frame rate.
function mrMaterial(instanced, blur = false) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0, transparent: blur });
  m.onBeforeCompile = (s) => {
    let v = 'attribute vec3 aMR;\nvarying vec2 vMR;\n' + (instanced ? 'attribute vec3 iPaintA;\nattribute vec3 iPaintB;\n' : '') + (blur ? 'attribute float iBlur;\nvarying float vFade;\n' : '') + s.vertexShader;
    let inj = '\n  vMR = aMR.xy;';
    if (instanced) inj += '\n  if (aMR.z > 0.5) vColor.rgb *= aMR.z < 1.5 || aMR.z > 3.5 ? iPaintA : aMR.z < 2.5 ? iPaintB : mix(iPaintA, iPaintB, 0.45);';
    if (blur) inj += '\n  vFade = aMR.z > 2.5 && aMR.z < 3.5 ? iBlur * 0.6 : aMR.z > 0.5 && aMR.z < 2.5 ? 1.0 - iBlur * 0.7 : 1.0;';
    s.vertexShader = v.replace('#include <color_vertex>', '#include <color_vertex>' + inj);
    let f = 'varying vec2 vMR;\n' + (blur ? 'varying float vFade;\n' : '') + s.fragmentShader
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.x;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMR.y;');
    if (blur) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vFade;');
    s.fragmentShader = f;
  };
  m.customProgramCacheKey = () => `helicoptea-mr${instanced ? 'i' : ''}${blur ? 'b' : ''}`;
  return m;
}

// Shadow pass for the wheels: the blur disc never casts.
function wheelDepthMaterial() {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (s) => {
    s.vertexShader = 'attribute vec3 aMR;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  if (aMR.z > 2.5 && aMR.z < 3.5) transformed = vec3(0.0);');
  };
  d.customProgramCacheKey = () => 'helicoptea-mr-depth';
  return d;
}

// Static and instanced parts: colour, metalness/roughness and a paint slot per vertex. Slot 0 keeps the
// vertex colour; slots 1 and 2 multiply it by the instance's paint A or B (so one geometry serves all
// three windmills, each in its own colours).
class Parts {
  constructor() { this.list = []; }
  add(geo, matrix, color, metal, rough, slot = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color), col = new Float32Array(n * 3), mr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mr[i * 3] = metal; mr[i * 3 + 1] = rough; mr[i * 3 + 2] = slot; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aMR', new THREE.Float32BufferAttribute(mr, 3));
    this.list.push(g);
    return this;
  }
  build() { const g = mergeGeometries(this.list, false); for (const x of this.list) x.dispose(); this.list = []; return g; }
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));

// A pressed-tin blade lying along +x from r0 to r1, pitched about its own length, twisted towards the tip
// and cupped across its chord, with a rounded end. Wheel axis is +z.
function bladeGeometry(r0, r1, w0, w1, pitch0, pitch1, cup) {
  const nu = 9, nv = 6, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, r = r0 + (r1 - r0) * u;
    let w = w0 + (w1 - w0) * Math.sqrt(u);
    if (u > 0.78) w *= Math.sqrt(Math.max(0, 1 - ((u - 0.78) / 0.22) ** 2)) * 0.9 + 0.1;
    const p = pitch0 + (pitch1 - pitch0) * u;
    const cy = Math.cos(p), cz = Math.sin(p), ny = -Math.sin(p), nz = Math.cos(p);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv * 2 - 1, c = v * w / 2, k = cup * w * (1 - v * v);
      pos.push(r, c * cy + k * ny, c * cz + k * nz);
      uv.push(u, j / nv);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A flat tail fin in the yz plane (head frame: +z forward), a swept pennant with a curved trailing edge.
function finGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(-0.012, 0.035); s.quadraticCurveTo(-0.05, 0.05, -0.085, 0.048);
  s.quadraticCurveTo(-0.07, 0.01, -0.09, -0.022); s.quadraticCurveTo(-0.04, -0.014, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateY(Math.PI / 2); // shape x -> -z (tail extends backwards), shape y -> y
  return g;
}

function wheelGeometry() {
  const P = new Parts();
  for (let b = 0; b < BLADES; b++) {
    const a = b / BLADES * Math.PI * 2;
    const wear = 0.93 + 0.1 * ((b * 37) % 7) / 7; // each blade's paint a touch different
    P.add(bladeGeometry(0.03, R_TIP, 0.026, 0.044, 0.62, 0.36, 0.12), M(0, 0, 0, 0, 0, a), new THREE.Color(wear, wear, wear), 0.3, 0.42, b % 2 ? 2 : 1);
    // Spoke: a zinc strap riveted under each blade.
    P.add(new THREE.BoxGeometry(0.05, 0.004, 0.0016), M(0.03, 0, -0.002, 0, 0, a), ZINC, 0.85, 0.45);
    P.add(new THREE.SphereGeometry(0.0022, 6, 4), M(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.003), BRASS, 1, 0.35);
  }
  // Hub: a painted backing disc, a brass boss and a domed brass nose cap.
  P.add(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 24), M(0, 0, -0.003, Math.PI / 2), 0xffffff, 0.3, 0.45, 4);
  // The blur disc (only seen when the wheel is whirring): faint concentric banding where the paints alternate.
  P.add(new THREE.RingGeometry(0.026, R_TIP * 0.97, 32, 1), M(0, 0, 0.004), 0xf0f0f0, 0.25, 0.5, 3);
  P.add(new THREE.CylinderGeometry(0.014, 0.016, 0.012, 20), M(0, 0, 0.004, Math.PI / 2), BRASS, 1, 0.32);
  P.add(new THREE.SphereGeometry(0.0145, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0, 0, 0.01, Math.PI / 2), BRASS, 1, 0.26);
  return P.build();
}

function headGeometry() {
  const P = new Parts();
  // Bearing barrel along z (the wheel's axle runs through it), a yaw collar under it, the tail boom and fin.
  P.add(new THREE.CylinderGeometry(0.0075, 0.0085, 0.07, 16), M(0, 0.02, -0.025, Math.PI / 2), ZINC, 0.8, 0.4);
  P.add(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 16), M(0, 0.02, 0.008, Math.PI / 2), BRASS, 1, 0.3);
  P.add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.024, 14), M(0, 0.006, 0), BRASS, 1, 0.34);
  P.add(new THREE.CylinderGeometry(0.0026, 0.0026, 0.11, 8), M(0, 0.02, -0.11, Math.PI / 2), ZINC, 0.8, 0.45);
  P.add(finGeometry(), M(0, 0.018, -0.085, 0, 0, 0, 0.85), 0xffffff, 0.3, 0.45, 1);
  P.add(new THREE.SphereGeometry(0.0035, 8, 6), M(0, 0.02, -0.166), BRASS, 1, 0.3);
  return P.build();
}

export function build(ctx) {
  const S = sites();

  // ---------------------------------------------------------------- stakes (static)
  {
    const P = new Parts();
    for (const s of S) {
      const h = s.top - s.foot;
      if (s.stake === 'rod') {
        P.add(new THREE.CylinderGeometry(0.0035, 0.0035, h, 10), M(s.x, s.foot + h / 2, s.z), ZINC, 0.85, 0.5);
        P.add(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 12), M(s.x, s.top - 0.005, s.z), BRASS, 1, 0.35);
      } else {
        // Square oak stake, stained and weathered, with a chamfered top under a brass ferrule.
        P.add(new THREE.CylinderGeometry(0.012, 0.012, h - 0.03, 4), M(s.x, s.foot + (h - 0.03) / 2, s.z, 0, Math.PI / 4), 0x6b4a33, 0, 0.82);
        P.add(new THREE.CylinderGeometry(0.008, 0.012, 0.012, 4), M(s.x, s.top - 0.024, s.z, 0, Math.PI / 4), 0x5e412d, 0, 0.82);
        P.add(new THREE.CylinderGeometry(0.0055, 0.0065, 0.022, 12), M(s.x, s.top - 0.011, s.z), BRASS, 1, 0.38);
      }
    }
    const m = new THREE.Mesh(P.build(), mrMaterial(false));
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
    ctx.scene.add(m);
  }

  // ---------------------------------------------------------------- heads and wheels (instanced)
  const instanced = (geo, mat) => {
    const pa = new Float32Array(S.length * 3), pb = new Float32Array(S.length * 3), c = new THREE.Color();
    S.forEach((s, i) => { c.set(PAINTS[s.paint][0]).toArray(pa, i * 3); c.set(PAINTS[s.paint][1]).toArray(pb, i * 3); });
    geo.setAttribute('iPaintA', new THREE.InstancedBufferAttribute(pa, 3));
    geo.setAttribute('iPaintB', new THREE.InstancedBufferAttribute(pb, 3));
    const m = new THREE.InstancedMesh(geo, mat, S.length);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false; // three spread-out instances: the base geometry's bounds don't cover them
    ctx.scene.add(m);
    return m;
  };
  const heads = instanced(headGeometry(), mrMaterial(true));
  const wheelGeo = wheelGeometry();
  const blurAttr = new THREE.InstancedBufferAttribute(new Float32Array(S.length), 1);
  blurAttr.setUsage(THREE.DynamicDrawUsage);
  wheelGeo.setAttribute('iBlur', blurAttr);
  const wheels = instanced(wheelGeo, mrMaterial(true, true));
  wheels.customDepthMaterial = wheelDepthMaterial();
  wheels.receiveShadow = false; // thin double-sided tin: self-shadowing only shows as acne
  heads.name = 'pinwheels:heads'; wheels.name = 'pinwheels:wheels';

  // ---------------------------------------------------------------- state
  const st = S.map((s, i) => ({
    s, yaw: s.yaw0, yawVel: 0, spin: i * 0.7, w: 0, ph: i * 2.17 + 0.4, hub: new THREE.Vector3(s.x, s.top + 0.02, s.z),
    tick: 0, lastRev: 0,
  }));
  const _air = new THREE.Vector3(), _a = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _yAxis = new THREE.Vector3(0, 1, 0), _zAxis = new THREE.Vector3(0, 0, 1), _off = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  const _mw = new THREE.Matrix4(), _mh = new THREE.Matrix4();
  const defBreeze = new THREE.Vector4(0.8, 0.6, 0.6, 0.6);
  let t = 0;

  const washNear = (sim, p) => {
    const air = sim && sim.air;
    if (!air || air.calm) return false;
    for (const wk of air.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 0.6 && Math.abs(p.z - wk.hub.z) < 0.6) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 0.9 && Math.abs(p.z - wk.hit.z) < 0.9) return true;
    }
    return false;
  };

  const pose = (k) => {
    const p = st[k];
    _q.setFromAxisAngle(_yAxis, p.yaw);
    _mh.compose(_p.set(p.s.x, p.s.top, p.s.z), _q, _one);
    heads.setMatrixAt(k, _mh);
    _q2.setFromAxisAngle(_zAxis, p.spin);
    _mw.compose(_off.set(0, 0.02, 0.016), _q2, _one);
    _mw.premultiply(_mh);
    wheels.setMatrixAt(k, _mw);
    blurAttr.array[k] = THREE.MathUtils.smoothstep(Math.abs(p.w), 14, 45);
  };
  for (let k = 0; k < st.length; k++) pose(k);
  heads.instanceMatrix.needsUpdate = wheels.instanceMatrix.needsUpdate = blurAttr.needsUpdate = true;

  const api = {
    update(dt, sim) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 1 / 20);
      t += dt;
      const g = ctx.kitchen && ctx.kitchen.garden;
      const B = g && g.grass ? g.grass.uniforms.uBreeze.value : defBreeze;
      const audio = ctx.audio;
      for (let k = 0; k < st.length; k++) {
        const p = st[k];
        // Breeze at the wheel: the garden's breeze with gusts of its own.
        const gn = 0.5 + 0.28 * Math.sin(t * 0.83 + p.ph) + 0.22 * Math.sin(t * 2.31 + p.ph * 1.7);
        const bs = B.z * 0.9 * (1 - B.w + B.w * 1.8 * gn);
        _air.set(B.x * bs, 0, B.y * bs);
        // Rotor wash through the disc: centre and four points round it, in the head's frame.
        if (washNear(sim, p.hub)) {
          const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
          _a.set(0, 0, 0);
          ctx.airAt(p.hub, _off); _a.add(_off);
          for (let j = 0; j < 4; j++) {
            const ang = j * Math.PI / 2 + 0.4, rx = Math.cos(ang) * R_TIP * 0.7, ry = Math.sin(ang) * R_TIP * 0.7;
            _p.set(p.hub.x + rx * cy, p.hub.y + ry, p.hub.z - rx * sy);
            ctx.airAt(_p, _off); _a.add(_off);
          }
          _air.addScaledVector(_a, 0.2);
        }
        // Weathervane: the tail fin swings the wheel to face the horizontal air.
        const vh = Math.hypot(_air.x, _air.z);
        if (vh > 0.02) {
          const want = Math.atan2(-_air.x, -_air.z);
          let e = want - p.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
          p.yawVel += (5 * vh * vh * Math.sin(e) - (0.9 + 2.2 * vh) * p.yawVel) * dt;
        } else p.yawVel -= p.yawVel * 0.9 * dt;
        p.yaw += p.yawVel * dt;
        // Wheel: axial flow plus a share of the cross flow (wash from above still sets it going).
        const nx = Math.sin(p.yaw), nz = Math.cos(p.yaw);
        const ax = -(_air.x * nx + _air.z * nz);
        const cx = _air.x + ax * nx, cyy = _air.y, cz = _air.z + ax * nz;
        const cross = Math.sqrt(cx * cx + cyy * cyy + cz * cz);
        // Bearing stiction: the faintest airs don't turn it.
        const raw = ax + (ax >= 0 ? 1 : -1) * 0.8 * cross;
        const vAbs = Math.max(0, Math.abs(raw) - 0.4), drive = Math.sign(raw) * vAbs;
        const target = TSR * drive / R_TIP;
        // Blades bite hard when driven up to speed; they let go gently when the air falls away (coasting).
        const rate = (Math.abs(target) > Math.abs(p.w) && target * p.w >= 0) ? 2.2 * vAbs : 0.35 * vAbs + 0.05;
        p.w += (target - p.w) * Math.min(1, rate * dt);
        const fr = 0.5 * dt; // bearing friction
        p.w = Math.abs(p.w) <= fr ? 0 : p.w - Math.sign(p.w) * fr;
        p.spin += p.w * dt;
        if (p.spin > 1e4 || p.spin < -1e4) p.spin %= Math.PI * 2;
        pose(k);
        heads.instanceMatrix.needsUpdate = wheels.instanceMatrix.needsUpdate = blurAttr.needsUpdate = true;
        // A soft whirr and the tick of the bearing when it's really going.
        const aw = Math.abs(p.w);
        if (audio && audio.ready && aw > 14) {
          p.tick -= dt;
          if (p.tick <= 0) {
            p.tick = 0.11;
            const lvl = Math.min(1, (aw - 14) / 40);
            const o = audio.spot(p.hub, 1, 1);
            audio.noiseBurst({ freq: 900 + aw * 45, q: 1.6, gain: 0.006 + 0.012 * lvl, attack: 0.03, decay: 0.12, out: o });
            if (Math.floor(p.spin / (Math.PI * 2)) !== p.lastRev) audio.tone({ freq: 2600 + (k * 300), type: 'triangle', gain: 0.003 + 0.004 * lvl, attack: 0.001, decay: 0.012, out: o });
          }
          p.lastRev = Math.floor(p.spin / (Math.PI * 2));
        }
      }
    },
    // For tests: the wheels' state.
    get state() { return st.map((p) => ({ yaw: +p.yaw.toFixed(2), w: +p.w.toFixed(2) })); },
  };
  wheels.userData.mod = api;
  return api;
}
