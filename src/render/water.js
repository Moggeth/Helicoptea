import * as THREE from 'three';
import { RippleField, FIELD_H_SCALE, FIELD_SLOPE } from './rippleField.js';

// Tea colour ramp: hot water -> straw -> amber -> mahogany -> builder's.
const RAMP = [
  [0.0, new THREE.Color(0.86, 0.85, 0.78)],
  [0.12, new THREE.Color(0.9, 0.74, 0.42)],
  [0.32, new THREE.Color(0.78, 0.47, 0.16)],
  [0.58, new THREE.Color(0.55, 0.25, 0.07)],
  [0.82, new THREE.Color(0.33, 0.13, 0.04)],
  [1.0, new THREE.Color(0.2, 0.075, 0.025)],
];
export function teaColor(brew, out = new THREE.Color()) {
  const b = THREE.MathUtils.clamp(brew, 0, 1);
  for (let i = 1; i < RAMP.length; i++) {
    if (b <= RAMP[i][0]) {
      const t = (b - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]);
      return out.copy(RAMP[i - 1][1]).lerp(RAMP[i][1], t);
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

// Milky tea: milk scatters light, so even a splash turns tea opaque and pale. The tea still tints it
// (its absorption, softened as milk takes over), and pure milk is milk.
const MILK = new THREE.Color(0.97, 0.955, 0.92);
const _t = new THREE.Color();
export function milkyTea(brew, milk, out = new THREE.Color()) {
  teaColor(brew, out);
  const m = THREE.MathUtils.clamp(milk || 0, 0, 1);
  if (m <= 0) return out;
  const k = 1 - Math.exp(-m * 11);           // how much the milk's scattering has taken over
  const e = 0.55 * (1 - m);                  // tea's tint fades as the brew is diluted
  _t.setRGB(MILK.r * Math.pow(out.r, e), MILK.g * Math.pow(out.g, e), MILK.b * Math.pow(out.b, e));
  return out.lerp(_t, k);
}
// What a cup of this strength is called (the HUD's brew chip and the cockpit's load page).
export const BREW_NAMES = [[0.08, 'Just water'], [0.22, 'Pale'], [0.42, 'Golden'], [0.62, 'Proper'], [0.82, 'Strong'], [2, "Builder's"]];
export const brewName = (brew) => BREW_NAMES.find(([t]) => brew < t)[1];
// Opacity of a cup's surface: brew darkens it, milk clouds it.
export function teaOpacity(brew, milk) {
  const base = THREE.MathUtils.lerp(0.42, 0.97, Math.pow(THREE.MathUtils.clamp(brew, 0, 1), 0.55));
  return THREE.MathUtils.lerp(base, 0.985, 1 - Math.exp(-(milk || 0) * 14));
}

const MAX_RIPPLES = 8;

// PMREM environment (the kitchen's room environment) for reflections, and the ripple grid size for this
// quality tier (phones get a coarser grid); set by the view before surfaces exist.
let ENV = null, FIELD_N = 40;
export function setLiquidEnvironment(tex, quality) { ENV = tex; FIELD_N = !quality || quality.name === 'high' ? 40 : 32; }
function cubeUVDefines(tex) {
  // Same constants three.js derives for its own materials (WebGLProgram generateCubeUVSize).
  const imageHeight = tex.image.height;
  const maxMip = Math.log2(imageHeight) - 2;
  return {
    ENVMAP_TYPE_CUBE_UV: '',
    CUBEUV_TEXEL_WIDTH: 1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16)),
    CUBEUV_TEXEL_HEIGHT: 1 / imageHeight,
    CUBEUV_MAX_MIP: maxMip.toFixed(1),
  };
}

// The liquid surface in one vessel: tea, milk, or (with opts.water) clear water.
// Shading: analytic dunk ripples + the rotor-wash height field (RippleField) for displacement and normals,
// reflections of the vessel's own inner wall and rim (ray against the cylinder) and of the room
// (PMREM), the rim's crescent shadow from the sun, wind-roughened streaks and glitter under the wash.
export class TeaSurface {
  constructor(cup, sunDir, opts = {}) {
    this.cup = cup;
    this.opts = opts;
    this.ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.next = 0;
    this.color = new THREE.Color();
    this.plumeColor = new THREE.Color();
    this.displayBrew = cup.brew;
    this.displayMilk = cup.milk || 0;
    this.forcing = [];        // rotor wash on this surface this frame (filled by LiquidWash)
    this.washS = 0;
    const fieldN = opts.fieldN || FIELD_N;
    this.field = new RippleField(cup.rIn, fieldN);
    const R = cup.rIn - 0.0004;
    const geo = new THREE.RingGeometry(0, R, 64, fieldN >= 40 ? 16 : 10);
    geo.rotateX(-Math.PI / 2);
    const env = opts.env !== undefined ? opts.env : ENV;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      defines: env ? cubeUVDefines(env) : {},
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color() },
        uPlume: { value: new THREE.Color() },
        uOpacity: { value: 0.6 },
        uRadius: { value: cup.rIn },
        uFree: { value: 0.02 },
        uRipples: { value: this.ripples },
        uBag: { value: new THREE.Vector4(0, 0, 0, 0) },
        uWash: { value: new THREE.Vector4(0, 0, 0, 0.03) },
        uFoot: { value: 0.1 },
        uSun: { value: sunDir.clone().normalize() },
        uSky: { value: new THREE.Color(1.0, 0.97, 0.9) },
        uWall: { value: new THREE.Color(opts.wall ?? cup.glaze ?? 0xf2ece0) },
        uRim: { value: new THREE.Color(opts.rim ?? cup.rim ?? opts.wall ?? cup.glaze ?? 0xf2ece0) },
        uField: { value: this.field.texture },
        uFieldOn: { value: 0 },
        uHScale: { value: FIELD_H_SCALE },
        uSlope: { value: FIELD_SLOPE },
        uClear: { value: opts.water ? 1 : 0 },
        envMap: { value: env },
        uEnvInt: { value: opts.envIntensity ?? 0.5 },
      },
      vertexShader: `
        uniform sampler2D uField; uniform float uFieldOn, uRadius, uHScale;
        varying vec3 vWorld; varying vec2 vLocal;
        void main(){
          vLocal = position.xz;
          vec3 p = position;
          if (uFieldOn > 0.5) p.y += (texture2D(uField, vLocal / (2.0 * uRadius) + 0.5).b - 0.5) * uHScale;
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uTime, uOpacity, uRadius, uFree, uFieldOn, uSlope, uClear, uEnvInt, uFoot;
        uniform vec3 uColor, uPlume, uSun, uSky, uWall, uRim;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        uniform vec4 uBag;
        uniform vec4 uWash;
        uniform sampler2D uField;
        #ifdef ENVMAP_TYPE_CUBE_UV
        uniform sampler2D envMap;
        #endif
        #include <cube_uv_reflection_fragment>
        varying vec3 vWorld; varying vec2 vLocal;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        vec3 room(vec3 d, float rough){
          #ifdef ENVMAP_TYPE_CUBE_UV
            return textureCubeUV(envMap, d, rough).rgb * uEnvInt;
          #else
            return uSky * mix(0.55, 0.95, clamp(d.y, 0.0, 1.0));
          #endif
        }
        // Distance along ray (p, d) in the xz plane to the vessel's inner wall (p is inside).
        float toWall(vec2 p, vec2 d){
          float a = max(dot(d, d), 1e-6), b = 2.0 * dot(p, d), c = dot(p, p) - uRadius * uRadius;
          return (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
        }
        void main(){
          // Dunk and drip ripples: damped travelling rings (analytic slope), with their wall echo.
          vec2 grad = vec2(0.0);
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > 2.5) continue;
            vec2 d = vLocal - r.xy;
            float dist = length(d) + 1e-5;
            float front = age * 0.16;
            float k = 260.0;
            float env = exp(-age * 2.2) * exp(-pow((dist - front) * 60.0, 2.0)) * r.w;
            grad += (d / dist) * cos((dist - front) * k) * env;
            float back = 2.0 * uRadius - front;
            float env2 = exp(-age * 2.8) * exp(-pow((dist - back) * 60.0, 2.0)) * r.w * 0.5;
            grad -= (d / dist) * cos((dist - back) * k) * env2;
          }
          // Rotor wash height field: dimple, pounding rings, spiral lobes.
          float energy = 0.0;
          if (uFieldOn > 0.5) {
            vec4 F = texture2D(uField, vLocal / (2.0 * uRadius) + 0.5);
            grad += (F.rg * 2.0 - 1.0) * uSlope;
            energy = F.a;
          }
          // Outwash shearing the surface: a roughened annulus of cat's paws racing outward, calm in the eye.
          float rough = 0.0;
          if (uWash.z > 0.001) {
            vec2 dw = vLocal - uWash.xy;
            float d = length(dw) + 1e-5, a = uWash.w;
            vec2 rd = dw / d;
            float ring = smoothstep(0.2 * a, 0.8 * a, d) * exp(-pow(max(0.0, d - 1.2 * a) / (0.6 * uFoot), 2.0));
            float th = atan(dw.y, dw.x);
            // Streaks: long along the flow, narrow across it, racing outward.
            float paws = noise(vec2(th * 11.0, d / a * 2.0 - uTime * 5.5)) * noise(vec2(th * 27.0 + 3.0, d / a * 4.5 - uTime * 9.0));
            rough = uWash.z * ring * (0.25 + 2.4 * paws);
            // Capillary chop riding the streaks: short crests across the flow.
            float c1 = noise(vec2(d * 700.0 - uTime * 40.0, th * 40.0)) - 0.5;
            float c2 = noise(vLocal * 380.0 - rd * uTime * 12.0 + 5.0) - 0.5;
            grad += rough * (rd * c1 * 0.4 + vec2(-rd.y, rd.x) * c2 * 0.2);
          }
          rough = clamp(rough + energy * 0.9, 0.0, 1.0);
          // Gentle idle shimmer.
          grad += 0.022 * vec2(noise(vLocal * 70.0 + uTime * 0.5) - 0.5, noise(vLocal * 70.0 - uTime * 0.4 + 7.0) - 0.5);
          vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 L = normalize(uSun);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          fres = min(fres * (1.0 - 0.6 * rough), 1.0 - 0.55 * rough);   // a roughened patch loses its mirror sheen and reads darker

          // Reflection: the vessel's inner wall and rim if the reflected ray meets them, else the room.
          vec3 R = reflect(-V, n);
          vec3 refl;
          float tw = toWall(vLocal, R.xz);
          float hy = tw * R.y;
          if (hy < uFree) {
            vec2 hp = vLocal + R.xz * tw;
            vec3 wn = vec3(-hp / uRadius, 0.0);
            float lit = 0.5 + 0.3 * clamp(hy / uFree, 0.0, 1.0) + 0.35 * max(dot(wn, L), 0.0);
            refl = mix(uWall, uRim, step(uFree - 0.004, hy)) * lit;
          } else refl = room(R, 0.04 + rough * 0.45);

          // Crescent shadow of the rim on the liquid when the sun is low enough.
          float ts = toWall(vLocal, L.xz);
          float sunlit = smoothstep(uFree - 0.002, uFree + 0.002, ts * L.y);

          // Body colour: tea, the plume steeping around the bag, a bright meniscus where it meets the glaze.
          float bd = length(vLocal - uBag.xy);
          float swirl = noise(vec2(atan(vLocal.y - uBag.y, vLocal.x - uBag.x) * 3.0 + uTime * 0.7, bd * 90.0 - uTime * 1.5));
          float plume = uBag.z * exp(-bd * bd / (0.0009 + 0.0006 * swirl));
          vec3 base = mix(uColor, uPlume, clamp(plume, 0.0, 0.85));
          float rr = length(vLocal) / uRadius;
          float men = smoothstep(0.9, 1.0, rr);
          base = mix(base, base * 1.25 + 0.04, men * 0.6);
          base *= mix(0.62, 1.0, sunlit);
          // Clear water: you see the vessel's floor through it, lit through the surface.
          base = mix(base, base * (0.75 + 0.35 * max(L.y, 0.0)) * mix(0.7, 1.0, sunlit), uClear);

          // Sun: one tight glint when calm, a field of glitter when the wash roughens it.
          vec3 Hh = normalize(V + L);
          float nh = max(dot(n, Hh), 0.0);
          float spec = pow(nh, mix(260.0, 900.0, rough)) * mix(2.4, 1.8, rough) * sunlit;   // glitter: many tiny glints, not a smear

          vec3 col = mix(base, refl, fres * 0.9) + spec * vec3(1.0, 0.95, 0.85);
          // Light crossing the tea at a slant travels further through it, so it hides the cup floor sooner.
          float op = 1.0 - pow(1.0 - uOpacity, 1.0 / max(abs(V.y), 0.2));
          float alpha = clamp(op + fres * 0.5 + plume * 0.25 + men * 0.15 + spec, 0.0, 1.0);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(cup.x, cup.waterY, cup.z);
    this.mesh.renderOrder = 2;
  }

  addRipple(x, z, amp, time) {
    const r = this.ripples[this.next];
    this.next = (this.next + 1) % MAX_RIPPLES;
    r.set(x - this.cup.x, z - this.cup.z, time, Math.min(amp, 1.6));
  }

  // A drop or a punch landing on the surface: rings in the height field (they echo off the walls).
  kick(x, z, amp) { this.field.impulse(x - this.cup.x, z - this.cup.z, amp, 0.003); }

  update(time, dt) {
    const cup = this.cup;
    const u = this.material.uniforms;
    if (this.opts.water) {
      this.color.set(this.opts.water.color);
      this.plumeColor.copy(this.color);
      u.uOpacity.value = this.opts.water.opacity;
    } else {
      // Smooth display so colour changes read as diffusion rather than flicker.
      this.displayBrew += (cup.brew - this.displayBrew) * Math.min(1, dt * 1.5);
      this.displayMilk += ((cup.milk || 0) - this.displayMilk) * Math.min(1, dt * 2.5);
      milkyTea(this.displayBrew, this.displayMilk, this.color);
      milkyTea(Math.min(1, this.displayBrew + 0.35), this.displayMilk * 0.8, this.plumeColor);
      u.uOpacity.value = teaOpacity(this.displayBrew, this.displayMilk);
    }
    u.uTime.value = time;
    u.uColor.value.copy(this.color);
    u.uPlume.value.copy(this.plumeColor);
    u.uFree.value = Math.max(0.002, (cup.topY ?? cup.waterY + 0.02) - cup.waterY);
    // Rotor wash: the strongest forcing drives the shader's roughened annulus, eased in and out.
    let top = null;
    for (const f of this.forcing) if (!top || f.I > top.I) top = f;
    this.washS += ((top ? top.I : 0) - this.washS) * Math.min(1, dt * 6);
    if (top) { u.uWash.value.set(top.x, top.z, this.washS, top.ring); u.uFoot.value = top.foot; }
    else u.uWash.value.z = this.washS;
    this.field.step(dt, this.forcing);
    u.uFieldOn.value = this.field.on;
    const steep = cup.steep || 0;
    if (cup.bagPos) u.uBag.value.set(cup.bagPos.x - cup.x, cup.bagPos.z - cup.z, Math.max(u.uBag.value.z * Math.exp(-dt * 0.8), steep), 0);
    // Milk poured in billows as a pale cloud where it lands, then mixes in (the view sets cloud/cloudAt).
    if (this.cloud > 0.01) {
      this.cloud *= Math.exp(-dt * 0.6);
      if (this.cloud > steep) {
        u.uBag.value.set(this.cloudAt[0], this.cloudAt[1], Math.max(u.uBag.value.z, Math.min(0.85, this.cloud)), 0);
        u.uPlume.value.lerp(MILK, Math.min(1, this.cloud * 1.5));
      }
    }
  }
}
