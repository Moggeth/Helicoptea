import * as THREE from 'three';

// Phone batches never change geometry after construction. Cache each transformed bound until its
// instance matrix changes, so the main view and hook camera share the same exact culling sphere.
export function cacheBatchBounds(batch) {
  const bounds = [], matrix = new THREE.Matrix4();
  const setMatrixAt = batch.setMatrixAt;
  batch.setMatrixAt = function (id, value) {
    if (bounds[id]) bounds[id].dirty = true;
    return setMatrixAt.call(this, id, value);
  };
  return (id, geometryIndex) => {
    let entry = bounds[id];
    if (!entry) entry = bounds[id] = { sphere: new THREE.Sphere(), dirty: true };
    if (entry.dirty) {
      batch.getMatrixAt(id, matrix);
      batch.getBoundingSphereAt(geometryIndex, entry.sphere).applyMatrix4(matrix);
      entry.dirty = false;
    }
    return entry.sphere;
  };
}
