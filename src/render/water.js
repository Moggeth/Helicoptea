import * as THREE from 'three';

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

const MAX_RIPPLES = 8;

export class TeaSurface {
  constructor(cup, sunDir) {
    this.cup = cup;
    this.ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.next = 0;
    this.color = new THREE.Color();
    this.plumeColor = new THREE.Color();
    this.displayBrew = cup.brew;
    const geo = new THREE.CircleGeometry(cup.rIn - 0.0004, 64);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color() },
        uPlume: { value: new THREE.Color() },
        uOpacity: { value: 0.6 },
        uRadius: { value: cup.rIn },
        uRipples: { value: this.ripples },
        uBag: { value: new THREE.Vector4(0, 0, 0, 0) },
        uWash: { value: new THREE.Vector4(0, 0, 0, 0.03) },
        uSun: { value: sunDir.clone().normalize() },
        uSky: { value: new THREE.Color(1.0, 0.97, 0.9) },
      },
      vertexShader: `
        varying vec3 vWorld; varying vec2 vLocal;
        void main(){
          vLocal = position.xz;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uTime, uOpacity, uRadius;
        uniform vec3 uColor, uPlume, uSun, uSky;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        uniform vec4 uBag;
        uniform vec4 uWash;
        varying vec3 vWorld; varying vec2 vLocal;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        void main(){
          // Ripple normal: sum of damped travelling rings (analytic slope).
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
            // reflection from the wall
            float back = 2.0 * uRadius - front;
            float env2 = exp(-age * 2.8) * exp(-pow((dist - back) * 60.0, 2.0)) * r.w * 0.5;
            grad -= (d / dist) * cos((dist - back) * k) * env2;
          }
          // Rotor downwash pressing a dimple into the tea, with wind-roughened chop around it.
          if (uWash.z > 0.001) {
            vec2 dw = vLocal - uWash.xy;
            float r2 = dot(dw, dw) / (uWash.w * uWash.w);
            grad += dw / (uWash.w * uWash.w) * 2.0 * uWash.z * exp(-r2) * 0.9;
            grad += uWash.z * 0.5 * vec2(noise(vLocal * 260.0 + uTime * 9.0) - 0.5, noise(vLocal * 260.0 - uTime * 8.0 + 3.0) - 0.5);
          }
          // Gentle idle shimmer.
          grad += 0.05 * vec2(noise(vLocal * 120.0 + uTime * 0.6) - 0.5, noise(vLocal * 120.0 - uTime * 0.5 + 7.0) - 0.5);
          vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 H = normalize(V + normalize(uSun));
          float spec = pow(max(dot(n, H), 0.0), 220.0) * 2.2;
          // Plume of freshly steeped tea swirling around the bag.
          float d = length(vLocal - uBag.xy);
          float swirl = noise(vec2(atan(vLocal.y - uBag.y, vLocal.x - uBag.x) * 3.0 + uTime * 0.7, d * 90.0 - uTime * 1.5));
          float plume = uBag.z * exp(-d * d / (0.0009 + 0.0006 * swirl)) ;
          vec3 base = mix(uColor, uPlume, clamp(plume, 0.0, 0.85));
          // Meniscus: brighter rim where the tea meets the glaze.
          float r = length(vLocal) / uRadius;
          float men = smoothstep(0.9, 1.0, r);
          base = mix(base, base * 1.25 + 0.04, men * 0.6);
          vec3 col = mix(base, uSky * 0.9, fres * 0.55) + spec * vec3(1.0, 0.95, 0.85);
          float alpha = clamp(uOpacity + fres * 0.3 + plume * 0.25 + men * 0.15, 0.0, 1.0);
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

  update(time, dt) {
    const cup = this.cup;
    // Smooth display so colour changes read as diffusion rather than flicker.
    this.displayBrew += (cup.brew - this.displayBrew) * Math.min(1, dt * 1.5);
    teaColor(this.displayBrew, this.color);
    teaColor(Math.min(1, this.displayBrew + 0.35), this.plumeColor);
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uColor.value.copy(this.color);
    u.uPlume.value.copy(this.plumeColor);
    u.uOpacity.value = THREE.MathUtils.lerp(0.42, 0.97, Math.pow(this.displayBrew, 0.55));
    // Wash dimple: set by the view while the rotor wake lands in this cup, eased in and out.
    this.washS = (this.washS || 0) + ((this.wash || 0) - (this.washS || 0)) * Math.min(1, dt * 6);
    this.wash = 0;
    // The wake landing closest to this cup (the Chinook has one per rotor).
    let wk = null;
    for (const w of (this.air ? this.air.wakes : [])) {
      if (w.active && (!wk || Math.hypot(w.hit.x - cup.x, w.hit.z - cup.z) < Math.hypot(wk.hit.x - cup.x, wk.hit.z - cup.z))) wk = w;
    }
    if (wk) u.uWash.value.set(wk.hit.x - cup.x, wk.hit.z - cup.z, this.washS, Math.max(0.012, (wk.footR || 0.08) * 0.35));
    else u.uWash.value.z = this.washS;
    const steep = cup.steep;
    u.uBag.value.set(cup.bagPos.x - cup.x, cup.bagPos.z - cup.z, Math.max(u.uBag.value.z * Math.exp(-dt * 0.8), steep), 0);
  }
}
