import * as THREE from 'three';

// Thin tube rebuilt in place each frame from the string's verlet points (no allocation per frame).
const RADIAL = 5;

export class StringMesh {
  constructor(nPoints, radius, material) {
    this.n = nPoints;
    this.radius = radius;
    const verts = nPoints * RADIAL;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    const idx = [];
    for (let i = 0; i < nPoints - 1; i++) for (let r = 0; r < RADIAL; r++) {
      const a = i * RADIAL + r, b = i * RADIAL + (r + 1) % RADIAL, c = a + RADIAL, d = b + RADIAL;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    // Per-ring colour (white unless stained), for materials with vertexColors on.
    this.col = new Float32Array(verts * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.userData.disposeGeo = true;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.t = new THREE.Vector3(); this.nA = new THREE.Vector3(); this.bA = new THREE.Vector3(); this.tmp = new THREE.Vector3();
  }

  // stain[i] 0..1 for each point: tints that ring towards the tea colour.
  setStain(stain, r = 0.55, g = 0.36, b = 0.2) {
    for (let i = 0; i < this.n; i++) {
      const s = stain[i] || 0;
      for (let k = 0; k < RADIAL; k++) {
        const j = (i * RADIAL + k) * 3;
        this.col[j] = 1 + (r - 1) * s; this.col[j + 1] = 1 + (g - 1) * s; this.col[j + 2] = 1 + (b - 1) * s;
      }
    }
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  update(pts) {
    const n = this.n, t = this.t, nA = this.nA, bA = this.bA, tmp = this.tmp;
    nA.set(1, 0, 0);
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n - 1, i + 1) * 3;
      t.set(pts[i1] - pts[i0], pts[i1 + 1] - pts[i0 + 1], pts[i1 + 2] - pts[i0 + 2]);
      if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
      t.normalize();
      // parallel transport the normal
      tmp.copy(t).multiplyScalar(nA.dot(t));
      nA.sub(tmp);
      if (nA.lengthSq() < 1e-8) { nA.set(0, 0, 1).sub(tmp.copy(t).multiplyScalar(t.z)); }
      nA.normalize();
      bA.crossVectors(t, nA);
      for (let r = 0; r < RADIAL; r++) {
        const a = (r / RADIAL) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = nA.x * ca + bA.x * sa, ny = nA.y * ca + bA.y * sa, nz = nA.z * ca + bA.z * sa;
        const k = (i * RADIAL + r) * 3;
        this.pos[k] = pts[i * 3] + nx * this.radius;
        this.pos[k + 1] = pts[i * 3 + 1] + ny * this.radius;
        this.pos[k + 2] = pts[i * 3 + 2] + nz * this.radius;
        this.nrm[k] = nx; this.nrm[k + 1] = ny; this.nrm[k + 2] = nz;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }
}
