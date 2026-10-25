import * as THREE from 'three';

// Conservative occupancy of a bilinearly filtered grass mask. A summed-area table makes a tile query
// constant time; expanding by one texel includes both filter taps at boundaries.
export class GrassOccupancy {
  constructor(mask) {
    this.rect = mask.rect;
    const { data, width, height } = mask.texture.image;
    this.width = width; this.height = height;
    this.sum = new Uint32Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        row += data[(y * width + x) * 4] > 0 ? 1 : 0;
        this.sum[(y + 1) * (width + 1) + x + 1] = this.sum[y * (width + 1) + x + 1] + row;
      }
    }
  }
  intersects(x0, z0, x1, z1) {
    const r = this.rect, w = this.width, h = this.height;
    if (x1 < r.x || z1 < r.y || x0 > r.x + r.z || z0 > r.y + r.w) return false;
    const a = Math.max(0, Math.floor((x0 - r.x) / r.z * w) - 1);
    const b = Math.min(w, Math.ceil((x1 - r.x) / r.z * w) + 1);
    const c = Math.max(0, Math.floor((z0 - r.y) / r.w * h) - 1);
    const d = Math.min(h, Math.ceil((z1 - r.y) / r.w * h) + 1);
    const s = this.sum, stride = w + 1;
    return s[d * stride + b] - s[c * stride + b] - s[d * stride + a] + s[c * stride + a] > 0;
  }
}

// Shared blade geometry and material, small static instance buffers. Moving the window changes only
// uniforms and bounds, never uploads blade/instance buffers. Each camera culls the same tiles itself.
export function grassTiles(base, material, nx, nz, mask, { tuft = 1, shadows = false, tileSize = 64 } = {}) {
  const root = new THREE.Group();
  root.material = material; // layer uniforms remain accessible to Grass
  const occupancy = new GrassOccupancy(mask);
  const tiles = [];
  for (let z = 0; z < nz; z += tileSize) for (let x = 0; x < nx; x += tileSize) {
    const w = Math.min(tileSize, nx - x), h = Math.min(tileSize, nz - z);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    for (const [key, a] of Object.entries(base.attributes)) g.setAttribute(key, a);
    const cells = new Float32Array(w * h * 2);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 2; cells[k] = x + i; cells[k + 1] = z + j;
    }
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    g.instanceCount = w * h;
    g.boundingSphere = new THREE.Sphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'grass-tile'; mesh.receiveShadow = shadows;
    mesh.userData.noAO = true; mesh.renderOrder = -1;
    root.add(mesh); tiles.push({ mesh, x, z, w, h });
  }
  let lastX = NaN, lastZ = NaN;
  const box = new THREE.Box3();
  root.updateTiles = () => {
    const u = material.userData.u, win = u.uWin.value;
    if (win.x === lastX && win.y === lastZ) return;
    lastX = win.x; lastZ = win.y;
    // Maximum blade arc length, flower width and per-tuft root jitter from grassBlade().
    const pad = u.uBlade.value.z * 1.3 * 1.25 + u.uBlade.value.x * 2.6;
    for (const t of tiles) {
      const x0 = (win.x + t.x) * win.z, z0 = (win.y + t.z) * win.z;
      const x1 = (win.x + t.x + t.w + (tuft - 1) * 0.4131) * win.z;
      const z1 = (win.y + t.z + t.h + (tuft - 1) * 0.7593) * win.z;
      t.mesh.visible = occupancy.intersects(x0, z0, x1, z1);
      if (!t.mesh.visible) continue;
      box.min.set(x0 - pad, u.uGroundY.value - pad, z0 - pad);
      box.max.set(x1 + pad, u.uGroundY.value + u.uHeightScale.value + pad, z1 + pad);
      box.getBoundingSphere(t.mesh.geometry.boundingSphere);
    }
  };
  root.updateTiles();
  return root;
}
