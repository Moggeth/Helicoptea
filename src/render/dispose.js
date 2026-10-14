// Shared scene assets outlive individual bags and wrecks. Only release resources explicitly
// owned by a retiring object. Independent preview scenes can release their complete asset set.
export function disposeTree(root, { all = false, textures = false } = {}) {
  const geometries = new Set(), materials = new Set(), maps = new Set();
  root.traverse((o) => {
    if (o.geometry && (all || o.userData.disposeGeo)) geometries.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m && (all || m.userData.disposeOwned)) materials.add(m);
    }
  });
  for (const m of materials) {
    if (textures) {
      for (const v of Object.values(m)) if (v?.isTexture) maps.add(v);
      for (const u of Object.values(m.uniforms || {})) if (u.value?.isTexture) maps.add(u.value);
    }
    m.dispose();
  }
  for (const g of geometries) g.dispose();
  for (const t of maps) t.dispose();
}
