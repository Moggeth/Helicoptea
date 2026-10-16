import * as THREE from 'three';

// Shader warm-up: show every object under the given roots (hidden effects, pooled debris, off-screen props),
// switch off frustum culling, run `draw` (real renders through every path the game uses) and put
// everything back. Anything drawn here has its shader programs, shadow-map variants and vertex layouts
// built now, at load, rather than the first time it appears in flight.
export function warmEverything(renderer, roots, draw, shadowVariants = true) {
  const undo = [];
  const extra = shadowVariants ? shadowVariantCasters() : null;
  if (extra) roots[0].add(extra);
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.visible) { undo.push(o, 'visible', false); o.visible = true; }
      if (o.frustumCulled) { undo.push(o, 'frustumCulled', true); o.frustumCulled = false; }
    });
  }
  try { draw(); } finally {
    for (let i = 0; i < undo.length; i += 3) undo[i][undo[i + 1]] = undo[i + 2];
    if (extra) {
      roots[0].remove(extra);
      extra.traverse((o) => { if (o.isMesh) { o.material.dispose(); o.dispose?.(); } });
      extra.children[0].geometry.dispose();
    }
  }
  renderer.info.reset();
}

// three.js draws most shadow casters with one shared depth material, and picks its shader variant (map or
// none, which side, instanced or not) from whichever caster happens to be drawn when instancing switches
// on or off. Which combinations come up depends on what is in the shadow camera's view and in what order,
// so new ones keep turning up in flight (each a compile). Tiny casters in every combination, ordered so
// instancing changes between each pair, build all of them now. They stay out of sight (zero scale).
let tex = null;
function shadowVariantCasters() {
  const g = new THREE.Group();
  if (!tex) { tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); tex.needsUpdate = true; }
  const geo = new THREE.PlaneGeometry(1e-4, 1e-4);
  for (const map of [null, tex]) {
    for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
      const mat = new THREE.MeshBasicMaterial({ map, side, colorWrite: false, depthWrite: false });
      const plain = new THREE.Mesh(geo, mat);
      const inst = new THREE.InstancedMesh(geo, mat, 1);
      const instC = new THREE.InstancedMesh(geo, mat, 1);
      instC.setColorAt(0, new THREE.Color(1, 1, 1));
      for (const m of [plain, inst, instC]) { m.castShadow = true; m.scale.setScalar(1e-6); g.add(m); }
    }
  }
  return g;
}
