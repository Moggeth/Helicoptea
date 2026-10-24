import * as THREE from 'three';
import { RippleField } from './rippleField.js';

// Open water outdoors (the ponds, the stream, the troughs, the fountain, puddles on the lane and the
// patio) under the rotor wash. Two parts:
//
//  1. A register of where water lies: every horizontal triangle drawn with the world's water material,
//     binned by 1 m tile. waterAt(x, z) gives the surface height there (NaN when dry). LiquidWash uses it
//     to find where a wake meets water and where spray lands.
//  2. One ripple field anchored in the world (OpenWash), parked under whichever wake is working the
//     water and moved along after it, so a pass low over a pond leaves its wake rippling behind. Its
//     cells are masked to the water (shores and puddle edges reflect) and its edge is a sponge.
//
// The world's water is drawn with one shared material (and its merged, faded and phone copies), patched
// by patchWaterMaterial(): the shader reads the field by world position for its normals, adds the
// roughened, streaky annulus of cat's paws, white froth where the field is most agitated, and glitter.
// The uniforms are shared, so one update a frame drives every copy.

const TILE = 1;
const tiles = new Map();   // tile key -> flat list of triangles [ax, az, bx, bz, cx, cz, y, ...]
const tkey = (ix, iz) => (ix + 512) * 2048 + (iz + 512);
export const waterStats = { tris: 0, bodies: 0 };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _ab = new THREE.Vector3();

// Register a water mesh's geometry (positions transformed by matrix): its upward-facing triangles.
export function registerWater(geo, matrix = null) {
  const pos = geo.attributes.position, idx = geo.index;
  if (!pos) return;
  const count = idx ? idx.count : pos.count;
  let added = 0;
  for (let t = 0; t + 2 < count; t += 3) {
    const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
    _a.fromBufferAttribute(pos, ia); _b.fromBufferAttribute(pos, ib); _c.fromBufferAttribute(pos, ic);
    if (matrix) { _a.applyMatrix4(matrix); _b.applyMatrix4(matrix); _c.applyMatrix4(matrix); }
    _n.subVectors(_b, _a).cross(_ab.subVectors(_c, _a));
    const len = _n.length();
    if (len < 1e-9 || Math.abs(_n.y) / len < 0.9) continue;   // the sides of a box of water, say
    const y = (_a.y + _b.y + _c.y) / 3;
    const x0 = Math.floor(Math.min(_a.x, _b.x, _c.x) / TILE), x1 = Math.floor(Math.max(_a.x, _b.x, _c.x) / TILE);
    const z0 = Math.floor(Math.min(_a.z, _b.z, _c.z) / TILE), z1 = Math.floor(Math.max(_a.z, _b.z, _c.z) / TILE);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = tkey(ix, iz);
      let list = tiles.get(k);
      if (!list) tiles.set(k, (list = []));
      list.push(_a.x, _a.z, _b.x, _b.z, _c.x, _c.z, y);
    }
    added++;
  }
  waterStats.tris += added;
  if (added) waterStats.bodies++;
}

export function clearWater() { tiles.clear(); waterStats.tris = 0; waterStats.bodies = 0; }

// The water surface's height at (x, z), or NaN where there is none. Where water lies over water (a
// fountain's bowls), the highest.
export function waterAt(x, z) {
  const list = tiles.get(tkey(Math.floor(x / TILE), Math.floor(z / TILE)));
  if (!list) return NaN;
  let best = NaN;
  for (let i = 0; i < list.length; i += 7) {
    const ax = list[i], az = list[i + 1], bx = list[i + 2], bz = list[i + 3], cx = list[i + 4], cz = list[i + 5];
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
    const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
    const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    if (((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0))) continue;
    const y = list[i + 6];
    if (!(y <= best)) best = y;
  }
  return best;
}
export const hasWater = () => tiles.size > 0;

// ---------------------------------------------------------------- the field
// Shared by every copy of the water material.
export const OPEN_U = {
  uOWField: { value: null },
  uOWBox: { value: new THREE.Vector4(0, 0, 1, 0) },        // x0, z0, 1/span, on
  uOWWash: { value: new THREE.Vector4(0, 0, 0, 0.03) },    // centre x, z (world), strength, ring radius
  uOWFoot: { value: 0.12 },
  uOWTime: { value: 0 },
  uOWSlope: { value: 2.2 },
};

export class OpenWash {
  constructor(quality) {
    const hi = !quality || quality.name === 'high' || quality.name === 'ultra';
    this.span = 1.6;                                  // m across: a few rotor footprints and its wake trail
    this.field = new RippleField(this.span / 2, hi ? 64 : 44, { open: true, hScale: 0.03, slope: 2.2, c: 0.6, gamma: 2.4 });
    this.field.gen = 0;
    OPEN_U.uOWField.value = this.field.texture;
    OPEN_U.uOWSlope.value = this.field.slope;
    this.x = 0; this.z = 0; this.y = NaN;            // where the grid's centre sits, and its water level
    this.forcing = [];                                // field-local, filled by LiquidWash.couple()
    this.washS = 0;
    this.moves = 0;
    // The look of spray thrown off it: pond water, a little milky with silt.
    this.spray = new THREE.Color(0.78, 0.84, 0.82);
  }

  get on() { return this.field.on; }

  // Park the grid with its centre at (x, z) over water at height y: what was rippling where the grids
  // overlap carries over, and the mask is rebuilt from the register.
  place(x, z, y) {
    const F = this.field, n = F.n, dx = F.dx;
    x = Math.round(x / dx) * dx; z = Math.round(z / dx) * dx;
    if (x === this.x && z === this.z && Math.abs(y - this.y) < 0.002) return;
    const si = Math.round((x - this.x) / dx), sj = Math.round((z - this.z) / dx);
    const keep = Number.isFinite(this.y) && Math.abs(y - this.y) < 0.01 && Math.abs(si) < n && Math.abs(sj) < n && F.live;
    if (keep) {
      for (const arr of [F.h, F.v, F.e]) {
        const old = arr.slice();
        arr.fill(0);
        for (let j = 0; j < n; j++) {
          const oj = j + sj;
          if (oj < 0 || oj >= n) continue;
          for (let i = 0; i < n; i++) { const oi = i + si; if (oi >= 0 && oi < n) arr[j * n + i] = old[oj * n + oi]; }
        }
      }
    } else { F.h.fill(0); F.v.fill(0); F.e.fill(0); }
    this.x = x; this.z = z; this.y = y;
    let cells = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const wy = i > 0 && j > 0 && i < n - 1 && j < n - 1 ? waterAt(x + F.cx[k], z + F.cz[k]) : NaN;
      const m = Math.abs(wy - y) < 0.012 ? 1 : 0;
      F.mask[k] = m;
      if (!m) { F.h[k] = 0; F.v[k] = 0; F.e[k] = 0; }
      cells += m;
    }
    F.cells = Math.max(1, cells);
    F.gen++;
    this.moves++;
    OPEN_U.uOWBox.value.set(x - F.R, z - F.R, 1 / this.span, OPEN_U.uOWBox.value.w);
  }

  // Is (x, z) on the grid and on its water? Then the height of the water there (field included).
  surfaceY(x, z) {
    const F = this.field, i = Math.floor((x - this.x + F.R) / F.dx), j = Math.floor((z - this.z + F.R) / F.dx);
    if (i < 0 || j < 0 || i >= F.n || j >= F.n) return NaN;
    const k = j * F.n + i;
    return F.mask[k] ? this.y + F.h[k] : NaN;
  }

  update(dt, time) {
    let top = null;
    for (const f of this.forcing) if (!top || f.I > top.I) top = f;
    this.washS += ((top ? top.I : 0) - this.washS) * Math.min(1, dt * 6);
    const W = OPEN_U.uOWWash.value;
    if (top) { W.set(this.x + top.x, this.z + top.z, this.washS, top.ring); OPEN_U.uOWFoot.value = top.foot; }
    else W.z = this.washS < 0.002 ? 0 : this.washS;
    this.field.step(dt, this.forcing);
    OPEN_U.uOWBox.value.w = this.field.on;
    OPEN_U.uOWTime.value = time;
  }

  clear() { this.forcing.length = 0; this.washS = 0; this.field.flatten(); OPEN_U.uOWWash.value.z = 0; OPEN_U.uOWBox.value.w = 0; }
}

// ---------------------------------------------------------------- the shader
const NOISE = `
  float owHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  float owNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(owHash(i), owHash(i+vec2(1,0)), f.x), mix(owHash(i+vec2(0,1)), owHash(i+vec2(1,1)), f.x), f.y); }`;

// Works on the standard material and on the phones' Phong stand-in (the chunks it hooks are in both).
export function patchWaterMaterial(mat) {
  mat.userData.portableHook = true;   // phoneRender: keep this hook on the cheaper stand-in
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, OPEN_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOWW;')
      .replace('#include <project_vertex>', 'vOWW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vOWW;
uniform sampler2D uOWField; uniform vec4 uOWBox, uOWWash; uniform float uOWFoot, uOWTime, uOWSlope;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 owG = vec2(0.0); float owE = 0.0, owRough = 0.0;
  vec2 owL = vOWW.xz - uOWBox.xy;   // (noise from small numbers: world coordinates are too big for its hash)
  if (uOWBox.w > 0.5) {
    vec2 uv = (vOWW.xz - uOWBox.xy) * uOWBox.z;
    if (uv.x > 0.004 && uv.y > 0.004 && uv.x < 0.996 && uv.y < 0.996) {
      vec4 F = texture2D(uOWField, uv);
      owG = (F.rg * 2.0 - 1.0) * uOWSlope; owE = F.a;
    }
  }
  if (uOWWash.z > 0.001) {
    // The outwash tearing across the water: a ring of cat's paws streaming outward, curling with the
    // rotor's swirl, glassy in the eye.
    vec2 dw = vOWW.xz - uOWWash.xy;
    float d = length(dw) + 1e-5, a = uOWWash.w;
    vec2 rd = dw / d;
    float ring = smoothstep(0.2 * a, 0.8 * a, d) * exp(-pow(max(0.0, d - 1.2 * a) / (0.9 * uOWFoot), 2.0));
    float th = atan(dw.y, dw.x) + d / a * 0.35;
    float paws = owNoise(vec2(th * 11.0, d / a * 2.0 - uOWTime * 5.5)) * owNoise(vec2(th * 27.0 + 3.0, d / a * 4.5 - uOWTime * 9.0));
    owRough = uOWWash.z * ring * (0.3 + 2.6 * paws);
    float c1 = owNoise(vec2(d * 260.0 - uOWTime * 30.0, th * 40.0)) - 0.5;
    float c2 = owNoise(owL * 160.0 - rd * uOWTime * 10.0 + 5.0) - 0.5;
    owG += owRough * (rd * c1 * 0.45 + vec2(-rd.y, rd.x) * c2 * 0.22);
  }
  owRough = clamp(owRough + owE * 0.9, 0.0, 1.0);
  // Froth: where it is worked hardest the surface whitens in flecks, streaming with the flow.
  float owFl = owNoise(owL * 90.0 + uOWTime * vec2(1.3, -0.9)) * owNoise(owL * 210.0 - uOWTime * vec2(0.7, 1.6));
  float owFroth = smoothstep(0.55, 0.95, owE) * smoothstep(0.3, 0.55, owFl);
  diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.2 * owRough), vec3(0.9, 0.93, 0.9), owFroth * 0.75);
  diffuseColor.a = max(diffuseColor.a, owFroth * 0.9);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (owRough + owE > 0.0) normal = normalize(normal + (viewMatrix * vec4(-owG.x, 0.0, -owG.y, 0.0)).xyz);`)
      .replace('#include <opaque_fragment>', `
  // Glitter: tiny glints winking in the roughened water.
  vec2 owGc = owL * 300.0;
  float owGl = step(0.992 - 0.02 * owRough, owHash(floor(owGc) + floor(uOWTime * 24.0) * 0.37)) * smoothstep(0.42, 0.1, length(fract(owGc) - 0.5));
  outgoingLight += vec3(1.0, 0.96, 0.88) * owGl * owRough * 1.2;
#include <opaque_fragment>`);
    // (Only the standard material has roughness; the Phong stand-in has no such chunk.)
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', `roughnessFactor = min(1.0, roughnessFactor + owRough * 0.45);
#include <lights_physical_fragment>`);
  };
  mat.customProgramCacheKey = () => 'world-water-wash';
  return mat;
}
