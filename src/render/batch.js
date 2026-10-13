import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Collects static meshes and merges them by material (one draw call per material and shadow flag),
// with a per-piece vertex colour so one material can carry many tints.
export class Batcher {
  constructor() { this.groups = new Map(); }

  add(geo, mat, matrix, color = 0xffffff, { cast = true, receive = true } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const key = `${mat.uuid}|${cast ? 1 : 0}${receive ? 1 : 0}`;
    if (!this.groups.has(key)) this.groups.set(key, { mat, cast, receive, list: [] });
    this.groups.get(key).list.push(g);
    return this;
  }

  build(parent) {
    const out = [];
    for (const { mat, cast, receive, list } of this.groups.values()) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      mat.vertexColors = true;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast; m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      parent.add(m);
      out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// Transform helper: position, Euler rotation (YXZ), scale.
export function T(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}
void _m;

// Box whose UVs are in metres (times `scale`), so tiling textures keep their real size on any box.
export function boxUV(w, h, d, scale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] * scale, uv.getY(i) * dims[f][1] * scale);
  }
  return g;
}

// Plane with UVs in metres.
export function planeUV(w, h, scale = 1, sx = 1, sy = 1) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * scale, uv.getY(i) * h * scale);
  return g;
}

// Lumpy foliage blob: a displaced icosphere.
export function blobGeometry(r, detail = 2, seed = 1, amp = 0.22) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const uvs = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 9.1 / r + seed) * Math.sin(v.y * 7.3 / r + seed * 2.1) * Math.sin(v.z * 8.7 / r + seed * 0.7);
    v.multiplyScalar(1 + amp * n);
    p.setXYZ(i, v.x, v.y, v.z);
    uvs.push(Math.atan2(v.z, v.x) / Math.PI * 2 * r * 2, Math.acos(THREE.MathUtils.clamp(v.y / (r * (1 + amp)), -1, 1)) * r * 2);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
