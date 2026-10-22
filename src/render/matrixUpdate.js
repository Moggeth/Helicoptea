import * as THREE from 'three';

// World matrices for a whole scene, remade only where something moved.
//
// scene.updateMatrixWorld() composes every object's matrix from its position, rotation and scale and
// multiplies it into its parent's, for all ~1,300 objects each frame, though nearly all of them are still
// scenery (on a phone, about a tenth of the frame). Here the scene is kept as a flat list in tree order with
// the position, rotation and scale each matrix was made from. An object's matrices are remade when those
// changed or its parent's world matrix was remade this frame; otherwise they keep the exact values a full
// update would give them again. An object that doesn't compose its own matrix (matrixAutoUpdate off) is
// also remade when code asks with matrixWorldNeedsUpdate. (On the others that flag means little:
// getWorldPosition() and the like set it on every ancestor up to the scene.)
//
// The list is rebuilt, and every matrix remade once, when anything is added or removed anywhere (Object3D
// add and remove, which attach, clear and removeFromParent go through). Objects with their own
// updateMatrixWorld (other than cameras, handled here) update their subtree the usual way.
let graphVersion = 0;
let patched = false;
function patchGraph() {
  if (patched) return;
  patched = true;
  const P = THREE.Object3D.prototype, add = P.add, remove = P.remove;
  P.add = function (...a) { graphVersion++; return add.apply(this, a); };
  P.remove = function (...a) { graphVersion++; return remove.apply(this, a); };
}
const STOCK = THREE.Object3D.prototype.updateMatrixWorld;
const CAMERA = THREE.Camera.prototype.updateMatrixWorld;
const PLAIN = 0, CAM = 1, OWN = 2;

export class MatrixUpdater {
  constructor(root) {
    patchGraph();
    this.root = root;
    this.version = -1;
    this.nodes = [];
    this.frame = 0;
    this.force = true;
    this.stats = { nodes: 0, updated: 0, rebuilds: 0 };
  }

  rebuild() {
    const nodes = this.nodes, parents = [], kinds = [];
    nodes.length = 0;
    const visit = (o, p) => {
      const i = nodes.length, own = o.updateMatrixWorld;
      const kind = own === STOCK ? PLAIN : own === CAMERA ? CAM : OWN;
      nodes.push(o); parents.push(p); kinds.push(kind);
      if (kind !== OWN) for (let k = 0; k < o.children.length; k++) visit(o.children[k], i);   // OWN: walks its own
    };
    visit(this.root, -1);
    const n = nodes.length;
    this.parents = Int32Array.from(parents);
    this.kinds = Uint8Array.from(kinds);
    this.trs = new Float64Array(n * 10);
    this.moved = new Uint32Array(n);   // frame its world matrix was last remade
    this.version = graphVersion;
    this.force = true;
    this.stats.nodes = n;
    this.stats.rebuilds++;
  }

  update() {
    if (this.version !== graphVersion) this.rebuild();
    const nodes = this.nodes, parents = this.parents, kinds = this.kinds, trs = this.trs, moved = this.moved;
    const frame = ++this.frame, force = this.force;
    this.force = false;
    let updated = 0;
    for (let i = 0, n = nodes.length; i < n; i++) {
      const o = nodes[i], pi = parents[i];
      let dirty = force || (pi >= 0 && moved[pi] === frame);
      if (o.matrixAutoUpdate) {
        const p = o.position, q = o.quaternion, sc = o.scale, j = i * 10;
        if (force || p.x !== trs[j] || p.y !== trs[j + 1] || p.z !== trs[j + 2] || q.x !== trs[j + 3] || q.y !== trs[j + 4] || q.z !== trs[j + 5] || q.w !== trs[j + 6] || sc.x !== trs[j + 7] || sc.y !== trs[j + 8] || sc.z !== trs[j + 9]) {
          trs[j] = p.x; trs[j + 1] = p.y; trs[j + 2] = p.z; trs[j + 3] = q.x; trs[j + 4] = q.y; trs[j + 5] = q.z; trs[j + 6] = q.w; trs[j + 7] = sc.x; trs[j + 8] = sc.y; trs[j + 9] = sc.z;
          o.matrix.compose(p, q, sc);
          dirty = true;
        }
      } else if (o.matrixWorldNeedsUpdate) dirty = true;
      const kind = kinds[i];
      if (kind === OWN) {
        // Its own update, which walks its subtree: forced when something above it moved, as it would be.
        o.updateMatrixWorld(dirty);
        moved[i] = frame; updated++;
        continue;
      }
      if (!dirty) continue;
      if (o.matrixWorldAutoUpdate) {
        if (pi < 0) o.matrixWorld.copy(o.matrix);
        else o.matrixWorld.multiplyMatrices(nodes[pi].matrixWorld, o.matrix);
      }
      o.matrixWorldNeedsUpdate = false;
      if (kind === CAM) o.matrixWorldInverse.copy(o.matrixWorld).invert();
      moved[i] = frame; updated++;
    }
    this.stats.updated = updated;
  }
}
