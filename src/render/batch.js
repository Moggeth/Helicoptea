import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Collects static meshes and merges them by material (one draw call per material and shadow flag),
// with a per-piece vertex colour so one material can carry many tints.
export class Batcher {
  constructor() { this.groups = new Map(); }

  // rm: [roughness, metalness] per piece, for materials that read them from the vertices (see
  // src/render/world/index.js); every piece in such a group must pass it.
  add(geo, mat, matrix, color = 0xffffff, { cast = true, receive = true, rm = null } = {}) {
    // Kept indexed (shared vertices: a sphere or tube has a quarter of the vertices that way); pieces without
    // an index get a plain one so every piece merges alike.
    // (Copies of just the attributes kept, rather than a clone of everything trimmed afterwards: thousands of
    // pieces go through here while the world loads.)
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k].clone());
    const count = g.attributes.position.count;
    if (geo.index) g.setIndex(geo.index.clone());
    else { const ix = new (count - 1 > 65535 ? Uint32Array : Uint16Array)(count); for (let i = 0; i < count; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
    if (matrix) g.applyMatrix4(matrix);
    if (globalThis.__pieceAudit) auditPiece(g, mat);
    if (rm) {
      const a = new Uint8Array(g.attributes.position.count * 2);
      for (let i = 0; i < a.length; i += 2) { a[i] = Math.round(rm[0] * 255); a[i + 1] = Math.round(rm[1] * 255); }
      g.setAttribute('rm', new THREE.BufferAttribute(a, 2, true));
    }
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    // Tint as normalised shorts (linear colour needs more than a byte in the darks) and normals as bytes:
    // less than half the memory of floats, which phones need.
    // A piece may carry a per-vertex 'shade' (baked occlusion and wear, see chairs.js) that scales its tint.
    const c = new THREE.Color(color), sh = geo.attributes.shade;
    const col = new Uint16Array(n * 3), cr = Math.round(c.r * 65535), cg = Math.round(c.g * 65535), cb = Math.round(c.b * 65535);
    if (sh) for (let i = 0; i < n; i++) { const k = sh.getX(i); col[i * 3] = Math.min(65535, cr * k); col[i * 3 + 1] = Math.min(65535, cg * k); col[i * 3 + 2] = Math.min(65535, cb * k); }
    else for (let i = 0; i < n; i++) { col[i * 3] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    const nf = g.attributes.normal.array, ni = new Int8Array(nf.length);
    for (let i = 0; i < nf.length; i++) ni[i] = Math.round(Math.max(-1, Math.min(1, nf[i])) * 127);
    g.setAttribute('normal', new THREE.BufferAttribute(ni, 3, true));
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
      // A copy with vertex colours on, so a material shared with unmerged meshes is left alone.
      const vc = mat.vertexColors ? mat : Object.assign(mat.clone(), { vertexColors: true, onBeforeCompile: mat.onBeforeCompile });
      const m = new THREE.Mesh(merged, vc);
      m.castShadow = cast; m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      if (globalThis.__pieceAudit) m.userData.audited = true;
      parent.add(m);
      out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

// tests/audit-world.mjs sets globalThis.__pieceAudit to an array before the game loads: every static piece's
// world box, material and the line that placed it, for finding floating, buried and stray props.
function auditPiece(g, mat) {
  g.computeBoundingBox();
  const b = g.boundingBox, site = (new Error().stack || '').split('\n').slice(2, 7).map((l) => l.replace(/^.*\/src\//, '').replace(/[?][^:]*/, '').replace(/\)$/, '')).join(' < ');
  globalThis.__pieceAudit.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, mat.name || mat.type, site]);
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
