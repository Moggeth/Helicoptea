import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Explicitly immutable world-space branches. Never freeze aircraft, cloth, props, cups (visibility), or
// any branch whose parent moves. Visibility and shadow/AO flags can still change without moving vertices.
const frozen = new WeakSet();
export function freezeWorldBranch(root) {
  root.updateMatrixWorld(true);
  frozen.add(root);
}

// Three r169's matrix walk visits invisible aircraft and every child of frozen world chunks. Follow its
// transform rules, but visit only branches that can draw. A branch revealed this frame is updated before
// any shadow, main or hook-camera render. Keep the native methods available for warm-up and explicit poses.
export function updateVisibleMatrices(root, force = false) {
  if (!root.visible || frozen.has(root)) return;
  if (root.matrixAutoUpdate) root.updateMatrix();
  if (root.matrixWorldNeedsUpdate || force) {
    if (root.matrixWorldAutoUpdate) {
      if (root.parent === null) root.matrixWorld.copy(root.matrix);
      else root.matrixWorld.multiplyMatrices(root.parent.matrixWorld, root.matrix);
    }
    root.matrixWorldNeedsUpdate = false;
    force = true;
  }
  for (const child of root.children) updateVisibleMatrices(child, force);
}

// Same-material opaque scenery only: preserve indices, every vertex attribute, material identity and
// shadow flags. No quantization, material approximation, or merging across animated/transparent parts.
// Call while constructing the kitchen, before its animated garden/props have been added.
export function batchStaticMeshes(root, exclude = new Set()) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), matrix = new THREE.Matrix4();
  const groups = new Map();
  const visit = (o) => {
    if (exclude.has(o) || !o.visible) return;
    const m = o.material, g = o.geometry;
    if (o.isMesh && !o.children.length && !o.isInstancedMesh && !o.isSkinnedMesh && m && !Array.isArray(m)
        && !m.transparent && !m.transmission && !g.morphAttributes.position
        && g.drawRange.start === 0 && g.drawRange.count === Infinity) {
      const layout = Object.entries(g.attributes).map(([k, a]) => `${k}:${a.array.constructor.name}:${a.itemSize}:${a.normalized}`).sort().join(',');
      const key = `${m.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}|${o.layers.mask}|${!!o.userData.noAO}|${!!g.index}|${layout}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  const stats = { before: 0, after: 0, saved: 0 };
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.clone().applyMatrix4(matrix.multiplyMatrices(inverse, o.matrixWorld));
      g.clearGroups(); // Single-material meshes draw the whole geometry, regardless of its groups.
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = list[0], mesh = new THREE.Mesh(merged, first.material);
    mesh.name = 'kitchen-static';
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder; mesh.layers.mask = first.layers.mask;
    mesh.userData.noAO = first.userData.noAO;
    mesh.matrixAutoUpdate = false;
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    root.add(mesh);
    freezeWorldBranch(mesh);
    for (const o of list) o.removeFromParent();
    stats.before += list.length; stats.after++;
  }
  stats.saved = stats.before - stats.after;
  return stats;
}
