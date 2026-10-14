import * as THREE from 'three';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { CFG } from '../config.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Presentation-only life for the three aircraft, layered over the models after the view has placed
// them each frame (nothing here touches the simulation):
// - blades cone up with thrust and droop when unloaded; discs blow back with airspeed and lag the
//   fuselage in pitch and roll (gyroscopic flapping lag)
// - motion-blur rotor discs: a sweep trailing each blade in its direction of rotation, coned with
//   the blades, replacing the old ghost-blade copies (fewer draw calls)
// - light glows: steady red/green/white nav lights, white anti-collision strobes (double flash),
//   a rotating red beacon, and a landing light with a faint beam and a pool of light where it lands
// - spinning compressor faces in the intakes, oleo struts that compress under weight on wheels
// - a fine airframe buzz with rotor speed and load, and the transverse-flow shudder through ~0.3 m/s
// Each aircraft's spec (lights, exhausts, intakes, gear, coning) lives at the bottom of this file.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _k = new THREE.Vector3(), _qi = new THREE.Quaternion(), _w = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

let glowTex = null, FAN_MAT = null, GLOW_GEO = null;

// Transparent fx must not punch holes in the canvas: blend colour normally (or additively) but leave
// the framebuffer's alpha alone, otherwise the page background shows through as a pale haze.
function keepAlpha(mat, additive = false) {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.SrcAlphaFactor;
  mat.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  // faint horizontal star streak, like a lens catching a point light
  const st = g.createLinearGradient(0, 32, 64, 32);
  st.addColorStop(0, 'rgba(255,255,255,0)'); st.addColorStop(0.5, 'rgba(255,255,255,0.35)'); st.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = st; g.fillRect(0, 31, 64, 2);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let poolTex = null;
function poolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,248,226,1)'); gr.addColorStop(0.5, 'rgba(255,240,210,0.45)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

// Motion-blur disc for a rotor: a soft sweep trailing every blade in the direction of rotation,
// brighter and longer towards the tips, a tip-path ring, and coning (the disc lifts towards the rim).
// Colours are linear and go through the same tone mapping and colour space as lit materials, so the
// disc looks the same with and without the AO composer.
export function rotorBlurMaterial(radius, blades, dir, a0 = 0, tip = [0.55, 0.56, 0.54], base = [0.025, 0.027, 0.03]) {
  return keepAlpha(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uOpacity: { value: 0 }, uCone: { value: 0 }, uSpeed: { value: 1 },
      uTip: { value: new THREE.Color(...tip) }, uBase: { value: new THREE.Color(...base) },
    },
    vertexShader: `uniform float uCone; varying vec2 vP;
      void main(){ vP = position.xy; vec3 p = position; p.z += length(p.xy) * uCone;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uOpacity; uniform float uSpeed; uniform vec3 uTip; uniform vec3 uBase; varying vec2 vP;
      const float R = ${radius.toFixed(4)}; const float N = ${blades.toFixed(1)}; const float DIR = ${dir.toFixed(1)}; const float A0 = ${a0.toFixed(4)};
      void main(){
        float r = length(vP) / R;
        float th = atan(vP.y, vP.x);
        // fraction of a blade spacing behind the nearest blade (0 at the blade, 1 at the next one)
        float behind = fract(-DIR * (th - A0) * N / 6.2831853);
        float len = mix(3.6, 1.9, smoothstep(0.2, 1.0, r)) / max(uSpeed, 0.3);   // longer streaks at the tips
        float sweep = exp(-behind * len) * smoothstep(0.08, 0.35, r);
        float disc = 0.03 + 0.04 * smoothstep(0.65, 0.98, r);
        float ring = smoothstep(0.93, 0.965, r) * (1.0 - smoothstep(0.97, 1.0, r));
        float a = disc * 0.6 + sweep * 0.26 + ring * 0.07;
        vec3 col = mix(uBase, uTip, ring * 0.6 + sweep * 0.3 * smoothstep(0.88, 1.0, r));
        gl_FragColor = vec4(col, a * uOpacity * (1.0 - smoothstep(0.985, 1.0, r)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
}

class Glow {
  constructor(parent, pos, color, size, kind, phase = 0) {
    // A camera-facing quad rather than a THREE.Sprite: the AO pass skips transparent meshes but would
    // draw sprites into its normal buffer and leave dark wedges around every light.
    this.mat = keepAlpha(new THREE.MeshBasicMaterial({ map: glowTexture(), color, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }), true);
    this.sprite = new THREE.Mesh(GLOW_GEO || (GLOW_GEO = new THREE.PlaneGeometry(1, 1)), this.mat);
    this.sprite.position.set(...pos);
    this.sprite.scale.setScalar(size);
    this.sprite.renderOrder = 6;
    this.sprite.userData.noAO = true;
    this.base = size;
    this.kind = kind;           // 'nav' | 'strobe' | 'beacon' | 'lamp'
    this.phase = phase;
    parent.add(this.sprite);
  }
  update(t, on, faceQ) {
    if (faceQ) this.sprite.quaternion.copy(faceQ);
    let k = 0;
    if (on) {
      if (this.kind === 'nav') k = 0.75 + 0.05 * Math.sin(t * 50 + this.phase);
      else if (this.kind === 'strobe') { const c = (t + this.phase) % 1.35; k = c < 0.04 || (c > 0.14 && c < 0.18) ? 1.6 : 0; }
      else if (this.kind === 'beacon') { const c = ((t + this.phase) * 1.15) % 1; k = Math.pow(Math.max(0, Math.cos(c * Math.PI * 2)), 6) * 1.3; }
      else k = 1;
    }
    this.mat.opacity = Math.min(1, k);
    this.sprite.scale.setScalar(this.base * (0.7 + 0.5 * Math.min(1.6, k)));
    this.sprite.visible = k > 0.01;
  }
}

// Weathering on the airframe paint, in body coordinates: soot fanning back from each exhaust, a dirtier
// belly, and faint streaks running aft with the airflow. Patched into the model's own lit materials.
function applyGrime(model, spec) {
  const ex = (spec.exhausts || []).slice(0, 2);
  const U = {
    uBodyInv: { value: new THREE.Matrix4() },
    uGrime: { value: spec.grime ?? 1 },
    uSoot0: { value: new THREE.Vector3(...(ex[0] ? ex[0].pos : [0, -9, 0])) },
    uSootDir0: { value: new THREE.Vector3(...(ex[0] ? ex[0].dir : [0, 0, 1])).normalize() },
    uSoot1: { value: new THREE.Vector3(...(ex[1] ? ex[1].pos : [0, -9, 0])) },
    uSootDir1: { value: new THREE.Vector3(...(ex[1] ? ex[1].dir : [0, 0, 1])).normalize() },
    uBelly: { value: spec.bellyY ?? -0.012 },
  };
  const done = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || done.has(m) || m.transparent || !(m.isMeshStandardMaterial) || (m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0) || m.metalness > 0.7) continue;
      done.add(m);
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            uniform mat4 uBodyInv; varying vec3 vBody;`)
          .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
            vBody = (uBodyInv * modelMatrix * vec4(transformed, 1.0)).xyz;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform float uGrime; uniform float uBelly; uniform vec3 uSoot0; uniform vec3 uSootDir0; uniform vec3 uSoot1; uniform vec3 uSootDir1; varying vec3 vBody;
            float gHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
            float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
              return mix(mix(gHash(i), gHash(i+vec2(1,0)), f.x), mix(gHash(i+vec2(0,1)), gHash(i+vec2(1,1)), f.x), f.y); }
            float soot(vec3 p, vec3 s, vec3 d){ vec3 r = p - s; float al = dot(r, d); float pe = length(r - d * al);
              return (1.0 - smoothstep(0.0, 0.004 + al * 0.35, pe)) * smoothstep(-0.003, 0.003, al) * (1.0 - smoothstep(0.02, 0.07, al)); }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            {
              float st = gNoise(vec2(vBody.x * 260.0 + vBody.y * 140.0, vBody.z * 22.0));
              float st2 = gNoise(vec2(vBody.x * 90.0 - vBody.y * 70.0, vBody.z * 9.0 + 3.1));
              float g = 0.07 * smoothstep(0.55, 0.95, st) + 0.05 * st2;
              g += 0.12 * (1.0 - smoothstep(uBelly - 0.012, uBelly, vBody.y));
              float sk = soot(vBody, uSoot0, uSootDir0) + soot(vBody, uSoot1, uSootDir1);
              g += 0.55 * min(sk, 1.0) * (0.75 + 0.25 * st);
              diffuseColor.rgb *= 1.0 - clamp(g * uGrime, 0.0, 0.8);
            }`);
      };
      m.customProgramCacheKey = () => 'grime';
      m.needsUpdate = true;
    }
  });
  return U;
}

class AircraftFx {
  constructor(view, model, spec, quality) {
    this.view = view;
    this.model = model;
    this.spec = spec;
    this.quality = quality;
    this.t = 0;
    this.root = new THREE.Group();     // fx that must not ride into debris clones live here
    this.root.name = 'fx';
    model.add(this.root);
    this.basePos = new THREE.Vector3();

    // Rotors: blade rest poses, blur discs, ghosts retired.
    this.rotors = spec.rotors(model).map((r) => {
      const blades = r.blades.map((g) => {
        const pos0 = g.position.clone();
        const az = Math.atan2(-pos0.z, pos0.x);
        return { g, r0: Math.hypot(pos0.x, pos0.z), y0: pos0.y, az, q0: g.quaternion.clone() };
      });
      const disc = r.group.userData.disc;
      if (disc) {
        disc.material = rotorBlurMaterial(r.radius, blades.length, r.dir, blades.length ? blades[0].az : 0, r.tip, r.base);
        disc.userData.noAO = true;
      }
      for (const gh of (r.group.userData.ghosts || [])) gh.visible = false;
      r.group.rotation.order = 'ZXY';   // spin innermost, then the disc tilt
      return { ...r, blades, disc, cone: 0, coneV: 0, tiltX: 0, tiltZ: 0, addX: 0, addZ: 0, finalX: NaN, finalZ: NaN };
    });
    this.extraGhosts = spec.ghosts ? spec.ghosts(model) : [];
    for (const gh of this.extraGhosts) gh.visible = false;

    // Lights.
    this.glows = (spec.lights || []).map((L, i) => new Glow(this.root, L.pos, L.color, L.size || 0.012, L.kind, L.phase ?? i * 0.37));

    // Landing light: lens glow, a faint additive beam cone and a pool of light where it lands.
    if (spec.landing) {
      const L = spec.landing;
      this.lamp = new Glow(this.root, L.pos, 0xfff4dc, 0.014, 'lamp');
      const beamGeo = new THREE.ConeGeometry(0.045, 0.16, 24, 1, true);
      beamGeo.translate(0, -0.08, 0);
      beamGeo.rotateX(Math.PI);           // apex at the origin, opening along +Y
      this.beamMat = keepAlpha(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uI: { value: 0 } },
        vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = position.y / 0.16; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uI; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = uI * (1.0 - vT) * (1.0 - vT) * edge; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      }), true);
      this.beam = new THREE.Mesh(beamGeo, this.beamMat);
      this.beam.position.set(...L.pos);
      this.beam.quaternion.setFromUnitVectors(Y, _d.set(...L.dir).normalize());
      this.beam.userData.noAO = true;
      this.beam.renderOrder = 5;
      this.root.add(this.beam);
      this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), keepAlpha(new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 }), true));
      this.pool.rotation.x = -Math.PI / 2;
      this.pool.userData.noAO = true;
      this.pool.visible = false;
      view.scene.add(this.pool);
    }

    // Compressor faces spinning in the intakes.
    this.fans = (spec.intakes || []).map((I) => {
      const g = new THREE.Group();
      const hubM = FAN_MAT || (FAN_MAT = new THREE.MeshStandardMaterial({ color: 0x6b6f72, roughness: 0.35, metalness: 0.9 }));
      const bladeGeo = new THREE.BoxGeometry(I.r * 0.92, I.r * 0.16, I.r * 0.04);
      bladeGeo.translate(I.r * 0.5, 0, 0);
      const geos = [];
      for (let k = 0; k < 9; k++) { const b = bladeGeo.clone(); b.rotateY(0.45); b.rotateZ(k / 9 * Math.PI * 2); geos.push(b); }
      geos.push(new THREE.SphereGeometry(I.r * 0.3, 10, 8).toNonIndexed());
      g.add(new THREE.Mesh(mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)), false), hubM));
      g.userData.noAO = true;
      g.position.set(...I.pos);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _d.set(...I.dir).normalize());
      this.root.add(g);
      return g;
    });

    this.grime = applyGrime(model, spec);
    this.buildDetails(spec.details || []);

    // Gear legs that compress under weight on wheels.
    this.gear = (spec.gear ? spec.gear(model) : []).map((g) => ({ g, y0: g.position.y }));
    this.comp = 0;
  }

  // Small fittings (wire-strike cutters, antennas, mirrors, formation lights), merged by material.
  buildDetails(list) {
    if (!list.length) return;
    const byMat = new Map();
    const push = (mat, g) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g.index ? g.toNonIndexed() : g); };
    const M = DETAIL_MATS();
    for (const d of list) {
      if (d.rod) {
        const [a, b] = d.rod.map((v) => new THREE.Vector3(...v));
        const len = a.distanceTo(b);
        const g = new THREE.CylinderGeometry(d.r1 ?? d.r, d.r, len, 6);
        g.translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
        g.translate(a.x, a.y, a.z);
        push(M[d.mat || 'dark'], g);
      } else if (d.box) {
        const g = new THREE.BoxGeometry(...d.box);
        if (d.rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...d.rot)));
        g.translate(...d.pos);
        push(M[d.mat || 'dark'], g);
      }
    }
    for (const [mat, geos] of byMat) {
      for (const g of geos) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); }
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = mat !== M.slime;
      if (mat === M.slime) mesh.userData.noAO = true;
      this.root.add(mesh);
    }
  }

  // A jolt through the airframe (hard touchdown, bump) makes the blades flap down and ring.
  kick(dv) {
    for (const R of this.rotors) R.coneV -= Math.min(1.2, dv * 1.4) * (R.coneK * 12 + 0.2);
  }

  setVisible(on) {
    this.root.visible = on;
    if (this.pool) this.pool.visible = on && this.pool.visible;
  }

  update(h, dt, alive, camera) {
    const S = this.spec, M = this.model;
    this.t += dt;
    const t = this.t;
    const rs = alive ? h.rotorSpeed : 0;
    const rs2 = rs * rs;
    const weight = h.def.mass * CFG.physics.gravity;
    _qi.copy(h.quat).invert();
    const vb = _v.copy(h.vel).applyQuaternion(_qi);                 // body-frame velocity
    const av = h.body ? h.body.angvel() : { x: 0, y: 0, z: 0 };
    const wb = _w.set(av.x, av.y, av.z).applyQuaternion(_qi);       // body-frame rates
    const k = 1 - Math.exp(-dt * 10);

    // --- Rotors: coning, droop, blowback and flapping lag.
    this.rotors.forEach((R, i) => {
      const T = R.thrust ? R.thrust(h) : h.thrust / this.rotors.length;
      const share = weight / this.rotors.length;
      const coneT = R.coneK * clamp(T / share, 0, 2.2) * rs2 - R.droop * (1 - rs2) - R.droop * 0.35 * clamp(1 - T / share, 0, 1);
      // Blades are a lightly damped spring: they sail up when loaded and bounce on a hard touchdown.
      const wn = 26, zeta = 0.35;
      const n = Math.max(1, Math.ceil(dt / 0.008)), h1 = dt / n;
      for (let s = 0; s < n; s++) {
        R.coneV += ((coneT - R.cone) * wn * wn - 2 * zeta * wn * R.coneV) * h1;
        R.cone += R.coneV * h1;
      }
      for (const B of R.blades) {
        const c = R.cone;
        const ca = Math.cos(B.az), sa = Math.sin(B.az);
        B.g.position.set(ca * B.r0 * Math.cos(c), B.y0 + B.r0 * Math.sin(c), -sa * B.r0 * Math.cos(c));
        _k.set(sa, 0, ca);
        B.g.quaternion.setFromAxisAngle(_k, c).multiply(B.q0);
      }
      if (R.disc) {
        R.disc.material.uniforms.uCone.value = Math.tan(R.cone);
        R.disc.material.uniforms.uOpacity.value = Math.min(1, rs) * 0.95;
        R.disc.material.uniforms.uSpeed.value = rs;
      }
      // The view has set any cyclic disc tilt this frame; add blowback (disc tilts away from the
      // relative wind) and lag (the disc trails the fuselage's pitch and roll rates).
      const blowX = clamp(vb.z * 0.05, -0.05, 0.05), blowZ = clamp(-vb.x * 0.05, -0.05, 0.05);
      const lagX = clamp(-wb.x * 0.02, -0.04, 0.04), lagZ = clamp(-wb.z * 0.02, -0.04, 0.04);
      const ctl = R.stickTilt ? R.stickTilt(h) : [0, 0];
      R.tiltX += (blowX + lagX + ctl[0] - R.tiltX) * k;
      R.tiltZ += (blowZ + lagZ + ctl[1] - R.tiltZ) * k;
      const g = R.group;
      g.rotation.order = 'ZXY';   // the view may reset it; spin innermost, then the disc tilt
      // Add on top of whatever the view (cyclic) and the crash layer (worn-rotor shake) set this frame;
      // if nobody reset an axis since last frame, take back our previous addition first.
      const addX = R.tiltX * rs2, addZ = R.tiltZ * rs2;
      const bx = g.rotation.x === R.finalX ? g.rotation.x - R.addX : g.rotation.x;
      const bz = g.rotation.z === R.finalZ ? g.rotation.z - R.addZ : g.rotation.z;
      g.rotation.x = R.finalX = bx + addX; R.addX = addX;
      g.rotation.z = R.finalZ = bz + addZ; R.addZ = addZ;
      for (const gh of (g.userData.ghosts || [])) gh.visible = false;   // the crash layer may restore them
    });

    for (const gh of this.extraGhosts) gh.visible = false;

    // --- Airframe buzz (model only; cameras follow the physics pose).
    const vh = Math.hypot(vb.x, vb.z);
    const shudder = Math.exp(-((vh - 0.3) ** 2) / 0.012) * 0.6;    // transverse flow effect
    const amp = alive ? (S.buzz || 0.00012) * rs2 * (0.5 + h.thrustFrac + shudder) : 0;
    if (amp > 0) {
      M.position.x += amp * (Math.sin(t * 173) * 0.6 + Math.sin(t * 241 + 1.1) * 0.4);
      M.position.y += amp * (Math.sin(t * 197 + 2.3) * 0.7 + Math.sin(t * 263) * 0.3);
      M.position.z += amp * Math.sin(t * 151 + 0.4) * 0.5;
      M.rotateZ(amp * 6 * Math.sin(t * 131 + 0.7));
      M.rotateX(amp * 4 * Math.sin(t * 113 + 1.9));
    }

    // --- Lights.
    // Light quads face the camera: their local rotation undoes the airframe's.
    const faceQ = camera ? _q.copy(M.quaternion).invert().multiply(camera.quaternion) : null;
    for (const G of this.glows) G.update(t, alive, faceQ);
    M.updateMatrixWorld();
    this.grime.uBodyInv.value.copy(M.matrixWorld).invert();

    // --- Landing light: on the ground and in the low hover it lights a pool below.
    if (this.lamp) {
      const L = S.landing;
      const low = clamp(1 - h.groundDist / 0.45, 0, 1);
      this.lamp.update(t, alive, faceQ);
      this.lamp.mat.opacity = alive ? 0.55 + 0.45 * low : 0;
      this.beamMat.uniforms.uI.value = alive ? 0.05 + 0.1 * low : 0;
      this.beam.visible = alive;
      // Where does the beam land?
      _p.set(...L.pos).applyQuaternion(h.quat).add(h.pos);
      _d.set(...L.dir).normalize().applyQuaternion(h.quat);
      let hit = null;
      if (alive && h.body) hit = this.view.sim.world.castRay(new RAPIER.Ray({ x: _p.x, y: _p.y, z: _p.z }, { x: _d.x, y: _d.y, z: _d.z }), 0.6, true, undefined, GROUPS.queryWorld, undefined, h.body);
      if (hit && this.root.visible) {
        const dist = hit.timeOfImpact;
        this.pool.visible = true;
        this.pool.position.set(_p.x + _d.x * dist, _p.y + _d.y * dist + 0.0008, _p.z + _d.z * dist);
        const s = 0.02 + dist * 0.42;
        this.pool.scale.set(s, s * (1 + 0.8 * (1 - Math.abs(_d.y))), 1);
        this.pool.rotation.z = Math.atan2(_d.x, _d.z);
        this.pool.material.opacity = clamp(0.5 * (1 - dist / 0.6), 0, 0.5) * (0.6 + 0.4 * low);
      } else this.pool.visible = false;
    }

    // --- Intake fans.
    for (const f of this.fans) f.rotateZ(dt * 90 * rs);

    // --- Oleo struts: compress under the aircraft's weight while it sits on its wheels.
    if (this.gear.length) {
      const onWheels = alive && h.skidClearance < 0.004 ? clamp(1 - h.thrust / weight, 0, 1) : 0;
      this.comp += (onWheels - this.comp) * (1 - Math.exp(-dt * 14));
      for (const G of this.gear) G.g.position.y = G.y0 + this.comp * (S.gearTravel || 0.0016);
    }
  }
}

// ---------------------------------------------------------------- specs (body frame, metres)
export const FX_SPECS = {
  micro: {
    buzz: 0.00011,
    rotors: (m) => {
      const U = m.userData;
      return [{
        group: U.rotor, blades: [U.parts.bladeA, U.parts.bladeB], radius: CFG.heli.rotorRadius, dir: 1,
        coneK: 0.025, droop: 0.03,
        // teetering two-blade rotor: the disc follows the cyclic directly
        stickTilt: (h) => [-h.ctlEcho.pitch * 0.05, -h.ctlEcho.roll * 0.05],
      }];
    },
    ghosts: (m) => m.userData.ghosts || [],
    lights: [
      { pos: [-0.0255, 0.0125, 0.109], color: 0xff3a24, kind: 'nav', size: 0.009 },
      { pos: [0.0255, 0.0125, 0.109], color: 0x3aff74, kind: 'nav', size: 0.009 },
      { pos: [0, 0.0305, 0.1635], color: 0xffffff, kind: 'nav', size: 0.008 },
      { pos: [0, 0.0425, 0.03], color: 0xff2410, kind: 'beacon', size: 0.016 },
      { pos: [0, 0.0315, 0.1615], color: 0xf4f8ff, kind: 'strobe', size: 0.014 },
    ],
    landing: { pos: [0, -0.029, -0.044], dir: [0, -1, -0.45] },
    details: [
      // wire-strike protection: roof cutter ahead of the engine fairing, chin cutter below the nose
      { rod: [[0, 0.025, -0.024], [0, 0.036, -0.036]], r: 0.0006, r1: 0.0012 },
      { box: [0.0009, 0.0035, 0.009], pos: [0, 0.029, -0.027], rot: [0.75, 0, 0] },
      { rod: [[0, -0.024, -0.05], [0, -0.032, -0.06]], r: 0.0005, r1: 0.001 },
      // VHF whip on the boom, a second blade antenna under it
      { rod: [[0, 0.0145, 0.07], [0, 0.036, 0.083]], r: 0.00025, r1: 0.0004, mat: 'black' },
      { box: [0.0007, 0.005, 0.004], pos: [0, 0.0045, 0.06], rot: [-0.3, 0, 0], mat: 'black' },
    ],
    exhausts: [
      { pos: [-0.0068, 0.040, 0.043], dir: [-0.25, 0.55, 0.8], r: 0.0019, len: 0.03 },
      { pos: [0.0068, 0.040, 0.043], dir: [0.25, 0.55, 0.8], r: 0.0019, len: 0.03 },
    ],
  },
  chinook: {
    buzz: 0.00009,
    gearTravel: 0.0018,
    rotors: (m) => m.userData.rotors.map((g, i) => ({
      group: g, blades: [0, 1, 2].map((k) => m.userData.parts[`blade${i ? 'A' : 'F'}${k}`]),
      radius: CFG.chinook.rotorRadius, dir: i ? -1 : 1, coneK: 0.07, droop: 0.04,
      thrust: (h) => h.rotorT[i],
    })),
    lights: [
      { pos: [-0.0302, -0.008, -0.04], color: 0xff3a24, kind: 'nav', size: 0.01 },
      { pos: [0.0302, -0.008, -0.04], color: 0x3aff74, kind: 'nav', size: 0.01 },
      { pos: [0, 0.0315, 0.0955], color: 0xffffff, kind: 'nav', size: 0.009 },
      { pos: [0, 0.0465, 0.088], color: 0xff2410, kind: 'beacon', size: 0.018 },
      { pos: [0, -0.0215, 0.02], color: 0xff2410, kind: 'beacon', size: 0.016, phase: 0.45 },
      { pos: [-0.0302, -0.008, 0.044], color: 0xf4f8ff, kind: 'strobe', size: 0.022 },
      { pos: [0.0302, -0.008, 0.044], color: 0xf4f8ff, kind: 'strobe', size: 0.022, phase: 0.02 },
    ],
    landing: { pos: [0, -0.0165, -0.072], dir: [0, -1, -0.35] },
    details: [
      // formation lights along the nose, cabin and aft pylon, both sides
      ...[-1, 1].flatMap((sx) => [
        { box: [0.0004, 0.0022, 0.009], pos: [sx * 0.0198, 0.0075, -0.069], mat: 'slime' },
        { box: [0.0004, 0.0022, 0.012], pos: [sx * 0.0209, 0.015, 0.03], mat: 'slime' },
        { box: [0.0004, 0.0022, 0.01], pos: [sx * 0.0121, 0.04, 0.072], mat: 'slime' },
        // rear-view mirrors on arms ahead of the cockpit
        { rod: [[sx * 0.0175, 0.003, -0.08], [sx * 0.0225, 0.007, -0.083]], r: 0.00035 },
        { box: [0.0004, 0.003, 0.0045], pos: [sx * 0.0228, 0.0075, -0.0832], rot: [0, sx * 0.4, 0], mat: 'mirror' },
      ]),
      // blade antennas on the spine and belly
      { box: [0.0007, 0.0045, 0.005], pos: [0, 0.0295, -0.015], rot: [-0.3, 0, 0], mat: 'black' },
      { box: [0.0007, 0.0045, 0.005], pos: [0, 0.0295, 0.012], rot: [-0.3, 0, 0], mat: 'black' },
      { box: [0.0007, 0.004, 0.005], pos: [0, -0.0205, -0.045], rot: [0.3, 0, 0], mat: 'black' },
    ],
    exhausts: [
      { pos: [-0.0175, 0.031, 0.079], dir: [0, 0.12, 1], r: 0.0044, len: 0.04 },
      { pos: [0.0175, 0.031, 0.079], dir: [0, 0.12, 1], r: 0.0044, len: 0.04 },
    ],
    intakes: [
      { pos: [-0.0175, 0.031, 0.0405], dir: [0, 0, -1], r: 0.0041 },
      { pos: [0.0175, 0.031, 0.0405], dir: [0, 0, -1], r: 0.0041 },
    ],
    gear: (m) => ['gearFL', 'gearFR', 'gearRL', 'gearRR'].map((n) => m.userData.parts[n]),
  },
  skycrane: {
    buzz: 0.0001,
    gearTravel: 0.0022,
    rotors: (m) => [{
      group: m.userData.rotor, blades: [0, 1, 2, 3, 4, 5].map((k) => m.userData.parts[`blade${k}`]),
      radius: CFG.skycrane.rotorRadius, dir: 1, coneK: 0.06, droop: 0.045, ownTiltX: true,
      tip: [0.92, 0.9, 0.86],
    }],
    lights: [
      { pos: [-0.0098, 0.012, -0.045], color: 0xff3a24, kind: 'nav', size: 0.009 },
      { pos: [0.0098, 0.012, -0.045], color: 0x3aff74, kind: 'nav', size: 0.009 },
      { pos: [0.0222, 0.054, 0.131], color: 0x3aff74, kind: 'nav', size: 0.008 },
      { pos: [0, 0.0302, 0.07], color: 0xff2410, kind: 'beacon', size: 0.016 },
      { pos: [0, -0.0272, -0.002], color: 0xff2410, kind: 'beacon', size: 0.015, phase: 0.5 },
      { pos: [0, 0.0565, 0.124], color: 0xf4f8ff, kind: 'strobe', size: 0.02 },
    ],
    landing: { pos: [0, -0.0115, -0.074], dir: [0, -1, -0.3] },
    details: [
      ...[-1, 1].flatMap((sx) => [
        { rod: [[sx * 0.012, 0.004, -0.076], [sx * 0.0165, 0.008, -0.079]], r: 0.0003 },
        { box: [0.0004, 0.0028, 0.004], pos: [sx * 0.0168, 0.0085, -0.0792], rot: [0, sx * 0.4, 0], mat: 'mirror' },
      ]),
      { rod: [[0, 0.03, 0.055], [0, 0.05, 0.066]], r: 0.00025, r1: 0.0004, mat: 'black' },
      { box: [0.0007, 0.0045, 0.005], pos: [0, 0.0235, -0.03], rot: [-0.3, 0, 0], mat: 'black' },
    ],
    exhausts: [
      { pos: [-0.0115, 0.029, 0.038], dir: [-0.34, 0.1, 0.94], r: 0.0036, len: 0.036 },
      { pos: [0.0115, 0.029, 0.038], dir: [0.34, 0.1, 0.94], r: 0.0036, len: 0.036 },
    ],
    intakes: [
      { pos: [-0.0092, 0.0285, -0.0015], dir: [0, 0, -1], r: 0.004 },
      { pos: [0.0092, 0.0285, -0.0015], dir: [0, 0, -1], r: 0.004 },
    ],
    gear: (m) => ['gearNL', 'gearNR', 'gearML', 'gearMR'].map((n) => m.userData.parts[n]),
  },
};

let detailMats = null;
function DETAIL_MATS() {
  if (detailMats) return detailMats;
  detailMats = {
    dark: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5, metalness: 0.6 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.3, metalness: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.7 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.05, metalness: 1.0 }),
    // formation ("slime") lights: pale green electroluminescent strips, dimly lit
    slime: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.42, 0.85, 0.5), toneMapped: false }),
  };
  return detailMats;
}

// One effects layer per aircraft model; only the flying one updates and shows.
export class AircraftFxSet {
  constructor(view, models, quality) {
    this.view = view;
    this.sets = {};
    // ?fx=0 leaves the models exactly as built (for comparisons and frame-cost measurements).
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('fx') === '0') return;
    for (const [id, model] of Object.entries(models)) this.sets[id] = new AircraftFx(view, model, FX_SPECS[id], quality);
  }
  kick(h, dv) {
    const fx = h && this.sets[h.type];
    if (fx) fx.kick(dv);
  }

  update(h, dt, camera) {
    for (const [id, fx] of Object.entries(this.sets)) {
      const active = !!h && h.type === id && fx.model.visible;
      fx.setVisible(active);
      if (active) fx.update(h, dt, true, camera);
      else if (fx.pool) fx.pool.visible = false;
    }
  }
}
