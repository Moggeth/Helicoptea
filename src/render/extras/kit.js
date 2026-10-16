import * as THREE from 'three';
import { WIND_GLSL } from '../grass.js';
import { boardTexture, barkTexture, makeNoise, fbm } from '../gardenTextures.js';
import { glazeMaterial } from '../models.js';

// Shared kit for the set pieces: one material per kind (so static parts merge across every piece into a
// few draw calls through the shared Batcher; tint each piece with the Batcher's per-piece colour), and a
// sway patch that bends foliage in the breeze and the rotor wash on the GPU.

function canvasTex(size, draw, srgb = true, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// Mottled grey-scale grain (multiplied by the vertex tint): keeps flat colours from looking plastic.
function mottle(size, seed, lo = 0.78, hi = 1, scale = 6) {
  return canvasTex(size, (c, S) => {
    const n = makeNoise(seed), img = c.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = lo + (hi - lo) * fbm(n, x / S * scale, y / S * scale, 4);
      const i = (y * S + x) * 4, b = Math.round(255 * Math.min(1, v));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

let lib = null;
// Materials by name. All are white-based so the Batcher's per-piece colour sets the real colour:
//   wood (grained, tint it oak/pine/painted), weathered (silvery outdoor timber), bark, paint (satin),
//   terracotta, stone, soil, ceramic (glossy glaze), enamel, brass, copper, iron (black wrought iron),
//   zinc (galvanised), steel, fabric, wicker, paper, leaf (double-sided, alpha-free solid leaves),
//   petal (double-sided, slight translucency look), glass (transparent), rubber.
export function kitMaterials() {
  if (lib) return lib;
  const grain = boardTexture(512, [200, 200, 200], true);
  const rough = mottle(256, 11, 0.72, 1, 5);
  const fine = mottle(256, 23, 0.86, 1, 14);
  const std = (o) => new THREE.MeshStandardMaterial({ color: 0xffffff, ...o });
  lib = {
    wood: std({ map: grain, roughness: 0.62 }),
    weathered: std({ map: grain, roughness: 0.9 }),
    bark: std({ map: barkTexture(256), roughness: 0.95 }),
    paint: std({ map: fine, roughness: 0.45 }),
    terracotta: std({ map: rough, roughness: 0.92 }),
    stone: std({ map: rough, roughness: 0.95 }),
    soil: std({ map: rough, roughness: 1 }),
    ceramic: glazeMaterial(0xffffff, { roughness: 0.18 }),
    enamel: std({ map: fine, roughness: 0.25, metalness: 0.05 }),
    brass: std({ map: fine, metalness: 1, roughness: 0.32 }),
    copper: std({ map: fine, metalness: 1, roughness: 0.36 }),
    iron: std({ map: rough, metalness: 0.6, roughness: 0.65 }),
    zinc: std({ map: rough, metalness: 0.75, roughness: 0.5 }),
    steel: std({ map: fine, metalness: 1, roughness: 0.22 }),
    fabric: std({ map: fine, roughness: 0.95 }),
    wicker: std({ map: grain, roughness: 0.85 }),
    paper: std({ map: fine, roughness: 0.9 }),
    leaf: std({ map: fine, roughness: 0.6, side: THREE.DoubleSide }),
    petal: std({ map: fine, roughness: 0.55, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.28, depthWrite: false }),
    rubber: std({ map: fine, roughness: 0.85 }),
  };
  for (const [k, m] of Object.entries(lib)) m.name = `kit-${k}`;
  return lib;
}

const swayed = new Map();
// A swaying copy of a kit material (or any material): vertices bend with height above baseY (0 at the base,
// full at baseY + height), pushed by the garden breeze, the rotor outwash on the lawn and the downwash under a
// hovering rotor. amount 1 suits soft perennials; 0.3 a shrub; 2 grasses. Works on merged statics and on
// InstancedMesh. The shadow map keeps the rest pose (casters sway too little to matter).
export function swayMaterial(base, wind, { baseY = -0.76, height = 0.4, amount = 1, indoor = false } = {}) {
  const key = `${base.uuid}|${baseY}|${height}|${amount}|${indoor}`;
  if (swayed.has(key)) return swayed.get(key);
  const m = base.clone();
  m.name = `${base.name}-sway`;
  const su = { uSwayBase: { value: baseY }, uSwayH: { value: height }, uSwayAmt: { value: amount }, uIndoor: { value: indoor ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wind, su);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${WIND_GLSL}
        uniform float uSwayBase; uniform float uSwayH; uniform float uSwayAmt; uniform float uIndoor;
        vec3 swHub(vec4 hub, vec3 p){
          if (hub.w <= 0.0) return vec3(0.0);
          vec2 d = p.xz - hub.xz; float r = length(d); float below = hub.y - p.y;
          if (r > 0.45 || below < -0.05 || below > 1.2) return vec3(0.0);
          float k = hub.w * (1.0 - r / 0.45) * (1.0 - below / 1.2);
          vec2 out2 = r > 1e-3 ? d / r : vec2(0.0);
          return vec3(out2.x * 0.02 + sin(uTime * 29.0 + p.x * 40.0) * 0.006, -0.02, out2.y * 0.02 + cos(uTime * 31.0 + p.z * 40.0) * 0.006) * k;
        }`)
      .replace('#include <project_vertex>', `
        vec4 swW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          swW = instanceMatrix * swW;
        #endif
        swW = modelMatrix * swW;
        float swH = clamp((swW.y - uSwayBase) / uSwayH, 0.0, 1.0);
        swH *= swH;
        float press = 0.0;
        vec2 w = uIndoor > 0.5 ? vec2(0.0) : gWind(swW.xz, press);
        float ph = gHash12(floor(swW.xz * 30.0)) * 6.28;
        vec2 flutter = vec2(sin(uTime * 6.0 + ph), cos(uTime * 5.3 + ph)) * (0.15 + 0.35 * length(w));
        vec3 off = vec3(w.x + flutter.x * 0.3, -press * 0.25, w.y + flutter.y * 0.3) * 0.018 * uSwayAmt * swH;
        off += (swHub(uHub0, swW.xyz) + swHub(uHub1, swW.xyz)) * uSwayAmt * swH;
        swW.xyz += off;
        vec4 mvPosition = viewMatrix * swW;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => `sway|${base.uuid}`;
  swayed.set(key, m);
  return m;
}
