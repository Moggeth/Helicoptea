import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { registerExtraSound } from '../../audio/extras.js';
import { DOMINO } from '../../sim/extras/dominoes.js';

// The domino run: one InstancedMesh. The faces (drilled black pips, the thin body-line and the brass
// spinner pin) are drawn in the shader from each tile's pip pair, so there is no texture at all.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();

let lastClack = 0;
registerExtraSound('domino', (audio, e, now) => {
  if (now - lastClack < 0.022) return;
  lastClack = now;
  const o = audio.spot(e.pos);
  const s = 0.35 + 0.65 * (e.strength || 0.5), k = e.pitch || 1;
  // A crisp, dry click with a little hollow body under it.
  audio.noiseBurst({ freq: 3400 * k, q: 3.5, gain: 0.05 * s, attack: 0.001, decay: 0.022, out: o });
  audio.tone({ freq: 1750 * k, to: 1500 * k, type: 'triangle', gain: 0.022 * s, attack: 0.001, decay: 0.035, out: o });
  audio.tone({ freq: 620 * k, to: 520 * k, type: 'sine', gain: 0.03 * s, attack: 0.001, decay: 0.05, out: o });
});

function dominoMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.28, sheen: 0 });
  const D = DOMINO;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aPips;\nvarying vec2 vPips;\nvarying vec3 vDLocal;\nvarying vec3 vDLocalN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDLocal = position; vDLocalN = normal; vPips = aPips;');
    const f = (x) => x.toFixed(5);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vPips;
varying vec3 vDLocal;
varying vec3 vDLocalN;
// Distance to the nearest pip of a half-face showing n pips (q in metres from the half's centre).
float pipDist(vec2 q, float n) {
  float o = ${f(0.0085 * D.scale / 1.25)};
  float d = 1.0;
  if (n == 1.0 || n == 3.0 || n == 5.0) d = min(d, length(q));
  if (n >= 2.0) { d = min(d, length(q - vec2(-o, -o))); d = min(d, length(q - vec2(o, o))); }
  if (n >= 4.0) { d = min(d, length(q - vec2(o, -o))); d = min(d, length(q - vec2(-o, o))); }
  if (n == 6.0) { d = min(d, length(q - vec2(-o, 0.0))); d = min(d, length(q - vec2(o, 0.0))); }
  return d;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dInk = 0.0, dBrass = 0.0;
if (vDLocalN.z < -0.9 && vDLocal.z < 0.0) {
  // The face looks back along the run, towards whoever comes to knock the first one over.
  vec2 p = vDLocal.xy;
  float hq = ${f(D.h / 4)};
  float top = step(0.0, p.y);
  vec2 q = vec2(p.x, p.y - (top > 0.5 ? hq : -hq));
  float n = floor((top > 0.5 ? vPips.x : vPips.y) + 0.5);
  float d = pipDist(q, n);
  float rp = ${f(0.0022)};
  float aa = fwidth(d) * 0.8 + 1e-5;
  float pip = 1.0 - smoothstep(rp - aa, rp + aa, d);
  // The drilled pip: a dark well with a soft shaded lip.
  float lip = smoothstep(rp * 0.55, rp, d) * pip;
  // The body-line across the middle (stopping short of the edges) and the brass spinner pin.
  float line = (1.0 - smoothstep(${f(0.00035)}, ${f(0.00035)} + aa, abs(p.y))) * step(abs(p.x), ${f(D.w / 2 - 0.0035)});
  float spin = 1.0 - smoothstep(${f(0.0017)} - aa, ${f(0.0017)} + aa, length(p));
  dInk = max(pip, line * (1.0 - spin));
  dBrass = spin;
  vec3 ink = mix(vec3(0.012, 0.011, 0.01), vec3(0.09, 0.085, 0.08), lip);
  diffuseColor.rgb = mix(diffuseColor.rgb, ink, dInk);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.60, 0.30), dBrass);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, dInk); roughnessFactor = mix(roughnessFactor, 0.3, dBrass);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, dBrass);');
  };
  mat.customProgramCacheKey = () => 'domino-faces';
  return mat;
}

export function build(ctx) {
  const sim = ctx.sim;
  const mod = sim && sim.extras && sim.extras.mods.dominoes;
  if (!mod || !mod.items || !mod.items.length) return {};
  const D = DOMINO, items = mod.items, n = items.length;
  const geo = new RoundedBoxGeometry(D.w, D.h, D.t, ctx.lite ? 1 : 2, 0.0011);
  const pips = new Float32Array(n * 2);
  items.forEach((it, i) => { pips[i * 2] = it.def.pips[0]; pips[i * 2 + 1] = it.def.pips[1]; });
  geo.setAttribute('aPips', new THREE.InstancedBufferAttribute(pips, 2));
  const mesh = new THREE.InstancedMesh(geo, dominoMaterial(), n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Bone-white with the faintest variation from tile to tile.
  const c = new THREE.Color();
  items.forEach((it, i) => { const v = Math.sin(i * 12.9898) * 43758.5453; const r = v - Math.floor(v); c.setRGB(0.93 + r * 0.03, 0.9 + r * 0.025, 0.83 + r * 0.02).convertSRGBToLinear(); mesh.setColorAt(i, c); });
  mesh.castShadow = true; mesh.receiveShadow = true;
  ctx.scene.add(mesh);

  const place = (i, p, q) => { _m.compose(p, q, _s); mesh.setMatrixAt(i, _m); };
  for (let i = 0; i < n; i++) { items[i].track.sample(1, _p, _q); place(i, _p, _q); }
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius += 0.35; // tiles can scatter a little way
  // The flight replay poses each tile through its proxy.
  // (After a replay has posed them, the live run is written back on the next frame.)
  let seen = mod.version, posedByReplay = false;
  items.forEach((it, i) => ctx.replayProxy(`domino${i + 1}`, (o) => { place(i, o.position, o.quaternion); mesh.instanceMatrix.needsUpdate = true; posedByReplay = true; }));

  return {
    mesh,
    update() {
      // Only when a tile has moved (a run at rest costs nothing).
      if (mod.version === seen && !posedByReplay) return;
      seen = mod.version; posedByReplay = false;
      for (let i = 0; i < n; i++) { items[i].track.sample(1, _p, _q); place(i, _p, _q); }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
