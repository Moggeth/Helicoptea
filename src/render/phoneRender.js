import * as THREE from 'three';

// The phone renderer: the same scene, drawn for a phone's CPU and GPU budget (120 Hz on a Galaxy S24 Ultra).
//
// On a phone the frame was CPU-bound in three.js's per-draw work: ~330 draw calls a frame (hundreds of small
// props, cups and a helicopter of ~50 parts, each a separate mesh with a physically based material) and
// ~110 more for the sun's shadow map, with ~200 shader programs to compile while loading. Here:
//  - Materials: physically based ones become Lambert (one diffuse term, a fraction of the uniforms and of
//    the shader), and the environment map's light comes from a matched hemisphere light. A few dozen
//    programs instead of ~200, so loading compiles far less too. The originals stay the source of truth:
//    colour, opacity, emissive and the like are copied across every frame, so effects that tint a
//    material still work.
//  - Draws: meshes that share a material are drawn as one BatchedMesh (one multi-draw, per-instance culling),
//    whether they stand still or move: each frame the instances whose world matrix or visibility changed
//    are updated. The originals stay in the scene, where the game moves and hides them as before; they just
//    sit on a layer the cameras don't draw. Anything that can't be batched safely (custom shaders,
//    transparency, skinning, instancing, mirrored transforms, multi-material meshes) draws as before.
//  - No shadow maps (main.js turns them off); the depth cues' contact shadows ground the aircraft and loads.
const HIDDEN_LAYER = 31;
const MAX_VERTS = 4000;   // per mesh: larger ones draw alone
const STOCK_OBC = THREE.Material.prototype.onBeforeCompile;
// Shader hooks that are only looks, dropped on phones: the aircraft's grime and soot (render/aircraftFx.js),
// the garden's swaying foliage (the world's is already still on phones), and the world kit's per-vertex
// roughness and metalness (Lambert has neither). Each sway material was a shader program of its own.
const COSMETIC = /^(?:grime$|sway\||world-kit-rm$)/;
const plain = (m) => m.onBeforeCompile === STOCK_OBC || COSMETIC.test(m.customProgramCacheKey?.() || '');
const WALK_EVERY = 30;      // frames between walks for new materials
function releaseArray() { this.array = null; }
const _box = new THREE.Box3(), _sphere = new THREE.Sphere();
const _proj = new THREE.Matrix4(), _mat = new THREE.Matrix4(), _frustum = new THREE.Frustum();

// A batch's onBeforeRender. three.js's culls each instance against the camera, then re-uploads the batch's
// list of instances to draw on every render, even when the list is the same as last time (nearly always:
// about 100 texture uploads a frame). This culls the same way and uploads the list only when it changed.
function cullBatch(renderer, scene, camera, geometry) {
  const index = geometry.getIndex();
  const bytes = index === null ? 1 : index.array.BYTES_PER_ELEMENT;
  const info = this._drawInfo, ranges = this._drawRanges, starts = this._multiDrawStarts, counts = this._multiDrawCounts;
  const tex = this._indirectTexture, ids = tex.image.data;
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.matrixWorld);
  _frustum.setFromProjectionMatrix(_proj, renderer.coordinateSystem);
  let count = 0, changed = false;
  for (let i = 0, l = info.length; i < l; i++) {
    const d = info[i];
    if (!d.visible || !d.active) continue;
    this.getMatrixAt(i, _mat);
    if (!_frustum.intersectsSphere(this.getBoundingSphereAt(d.geometryIndex, _sphere).applyMatrix4(_mat))) continue;
    const r = ranges[d.geometryIndex];
    starts[count] = r.start * bytes;
    counts[count] = r.count;
    if (ids[count] !== i) { ids[count] = i; changed = true; }
    count++;
  }
  if (changed || count !== this._multiDrawCount) tex.needsUpdate = true;
  this._multiDrawCount = count;
  this._visibilityChanged = false;
}

// Copied from the original material every frame (cheap: a few hundred numbers in all).
function syncMaterial(src, dst) {
  dst.color.copy(src.color);
  dst.emissive.copy(src.emissive);
  dst.emissiveIntensity = src.emissiveIntensity;
  dst.opacity = src.opacity;
  dst.visible = src.visible;
  if (dst.map !== src.map) { dst.map = src.map; dst.needsUpdate = true; }
  if (dst.transparent !== src.transparent) { dst.transparent = src.transparent; dst.needsUpdate = true; }
}

export class PhoneRender {
  constructor(renderer, scenes, { fill } = {}) {
    this.renderer = renderer;
    this.scenes = scenes;
    this.lambert = new WeakMap();   // original material -> its Lambert stand-in (or itself when kept)
    this.synced = [];               // [original, lambert] pairs
    this.batches = [];
    this.members = [];
    this.frame = 0;
    this.stats = { materials: 0, kept: 0, batches: 0, members: 0, ejected: 0 };
    // The environment map's diffuse light, which Lambert doesn't read: a hemisphere light per scene.
    for (const s of scenes) {
      if (!s.environment) continue;
      const k = (s.environmentIntensity ?? 1) * (fill ?? 1);
      const h = new THREE.HemisphereLight(0xf2ece2, 0x9a8a74, k);
      h.name = 'phone-env-fill';
      s.add(h);
    }
  }

  // ---------------------------------------------------------------- materials
  convertMaterial(m) {
    const done = this.lambert.get(m);
    if (done) return done;
    let out = m;
    if (m.isMeshStandardMaterial && plain(m)) {
      // Glossy surfaces (glazed china, varnish, paint, metal) keep a highlight with Phong; the rest is Lambert.
      const glossy = m.roughness < 0.45 || m.metalness > 0.5;
      out = new (glossy ? THREE.MeshPhongMaterial : THREE.MeshLambertMaterial)({
        name: m.name, color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
        // No normal, bump, AO or light maps: fine surface detail a phone screen barely shows, and each
        // combination of them was another shader program.
        alphaMap: m.alphaMap,
        transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors, fog: m.fog,
        flatShading: m.flatShading, depthWrite: m.depthWrite, depthTest: m.depthTest, blending: m.blending, toneMapped: m.toneMapped,
        polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
        colorWrite: m.colorWrite, wireframe: m.wireframe, visible: m.visible,
      });
      if (glossy) {
        out.shininess = Math.round(8 + 120 * (1 - Math.min(1, m.roughness / 0.45)) ** 2);
        // Metal tints its highlight with its own colour; a dielectric's is a faint white.
        out.specular.copy(m.metalness > 0.5 ? m.color : new THREE.Color(0xffffff)).multiplyScalar(m.metalness > 0.5 ? 0.6 : 0.25 * (1 - m.roughness));
      }
      // Clear glass (true transmission is off on phones anyway): keep it see-through.
      if (m.isMeshPhysicalMaterial && m.transmission > 0 && !m.transparent) { out.transparent = true; out.opacity = Math.min(m.opacity, 0.35); out.depthWrite = false; }
      out.userData = m.userData;
      if (!(m.isMeshPhysicalMaterial && m.transmission > 0)) this.synced.push([m, out]);
      this.stats.materials++;
    } else this.stats.kept++;
    this.lambert.set(m, out);
    if (out !== m) this.lambert.set(out, out);
    return out;
  }

  convert(root) {
    root.traverse((o) => {
      if (!o.material || o.isBatchedMesh) return;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => this.convertMaterial(m));
      else o.material = this.convertMaterial(o.material);
    });
  }

  // ---------------------------------------------------------------- batching
  eligible(o) { return this.why(o) === null; }

  // Why a mesh can't be batched (null: it can). Also used to see what is left drawing alone.
  why(o) {
    if (!o.isMesh || o.isBatchedMesh) return 'not a mesh';
    if (o.isInstancedMesh) return 'instanced';
    if (o.isSkinnedMesh) return 'skinned';
    if (o.userData.noBatch) return 'noBatch';
    const m = o.material, g = o.geometry;
    if (Array.isArray(m) || !m) return 'multi-material';
    if (m.transparent) return 'transparent';
    if (m.onBeforeCompile !== STOCK_OBC || m.isShaderMaterial) return 'custom shader';
    if (!(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial)) return `material ${m.type}`;
    if (!this.matKey(m)) return 'emissive';
    if (!g) return 'no geometry';
    // Big meshes (the world's merged chunks, terrain) are one draw already: batching would only copy them.
    if (g.attributes.position && g.attributes.position.count > MAX_VERTS) return 'big';
    if (g.morphAttributes.position) return 'morph';
    // BatchedMesh copies vertices once; changing sight-glass milk levels and other deforming meshes
    // must keep drawing from their live buffers.
    if (Object.values(g.attributes).some((a) => a.usage !== THREE.StaticDrawUsage)) return 'dynamic geometry';
    if (g.drawRange.count !== Infinity || g.drawRange.start !== 0) return 'draw range';
    if (o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return 'onBeforeRender';
    if (o.frustumCulled === false) return 'not culled';
    if (o.layers.mask !== 1) return 'layers';
    for (const name in g.attributes) { const a = g.attributes[name]; if (a.isInterleavedBufferAttribute || !a.array || a.array.length === 0) return `attribute ${name} released`; }
    if (g.index && g.index.array.length === 0) return 'index released';
    if (o.matrixWorld.determinant() < 0) return 'mirrored';
    return null;
  }

  // What a batch's shared material must agree on (colour is per instance, so it is left out).
  // (anyColours: leave vertex colours out, for grouping: see batch().)
  matKey(m, anyColours = false) {
    if (m.isMeshBasicMaterial) return `basic|${m.uuid}`;
    if (!(m.isMeshLambertMaterial || m.isMeshPhongMaterial) || m.emissive.getHex() !== 0) return null;   // glowing ones change at runtime
    const id = (t) => (t ? t.uuid : '-');
    return [m.type, m.isMeshPhongMaterial ? `${m.shininess}|${m.specular.getHexString()}` : '', id(m.map), id(m.normalMap), id(m.bumpMap), id(m.alphaMap), id(m.aoMap), m.side, anyColours ? '*' : m.vertexColors, m.flatShading, m.alphaTest, m.fog, m.depthWrite, m.depthTest, m.toneMapped, m.polygonOffset].join('|');
  }

  // The attributes a batch draws with: for Lambert and Phong, position and normal, and uv where a texture
  // reads it (colour is dealt with in batch()); for the rest, every attribute the geometry has.
  layout(o) {
    const m = o.material, g = o.geometry;
    if (m.isMeshBasicMaterial) return Object.keys(g.attributes).sort();
    return ['position', 'normal', ...(m.map || m.alphaMap ? ['uv'] : [])].filter((n) => g.attributes[n]);
  }

  // Groups the scene's eligible meshes by material (colour aside) and attribute layout into BatchedMeshes,
  // each with a material of its own (a material shared with a mesh drawn alone would switch shader variant
  // between the two every frame) and each mesh's colour per instance.
  // Meshes with and without an index, and with and without vertex colours, share a batch: an unindexed
  // geometry is drawn through an index of its own vertices in order, and one without vertex colours through
  // white ones (which leave its colour as it was).
  batch(scene, { minMembers = 2 } = {}) {
    scene.updateMatrixWorld();
    const desc = (a) => `${a.itemSize}${a.normalized ? 'n' : ''}${a.array.constructor.name}`;
    const base = new Map();
    scene.traverse((o) => {
      if (!this.eligible(o)) return;
      const m = o.material, g = o.geometry;
      const mk = this.matKey(m, !m.isMeshBasicMaterial);
      if (!mk) return;
      // A material with vertex colours on a geometry without them stays apart (it draws black, as it did).
      if (!m.isMeshBasicMaterial && m.vertexColors && !g.attributes.color) return;
      const names = this.layout(o);
      const key = `${mk}|${names.map((n) => n + desc(g.attributes[n])).join()}` + (m.isMeshBasicMaterial && g.index ? '|i' : '');
      if (!base.has(key)) base.set(key, []);
      base.get(key).push(o);
    });
    // Within a group, the vertex-coloured meshes split by how their colours are stored; the others join the
    // first of those (or make a group of their own when none has colours).
    const groups = [];
    for (const list of base.values()) {
      const byColour = new Map(), plain = [];
      for (const o of list) {
        if (o.material.isMeshBasicMaterial || !o.material.vertexColors) { plain.push(o); continue; }
        const k = desc(o.geometry.attributes.color);
        if (!byColour.has(k)) byColour.set(k, []);
        byColour.get(k).push(o);
      }
      const coloured = [...byColour.values()];
      // White in the first coloured format, if it has a plain white (floats, or normalised integers).
      const fmt = coloured.length ? coloured[0][0].geometry.attributes.color : null;
      if (fmt && (fmt.array instanceof Float32Array || (fmt.normalized && (fmt.array instanceof Uint8Array || fmt.array instanceof Uint16Array)))) coloured[0].push(...plain);
      else if (plain.length) groups.push(plain);
      groups.push(...coloured);
    }
    for (const list of groups) {
      if (list.length < minMembers) continue;
      const lead = list.find((o) => o.material.vertexColors) || list[0];
      const names = this.layout(lead);
      const colour = !lead.material.isMeshBasicMaterial && lead.material.vertexColors ? lead.geometry.attributes.color : null;
      const indexed = list.some((o) => o.geometry.index);
      // What each geometry is drawn as in the batch: its own arrays, plus white colours and an index where
      // the batch needs them.
      const views = new Map();
      for (const o of list) {
        const g = o.geometry;
        if (views.has(g)) continue;
        const v = new THREE.BufferGeometry(), count = g.attributes.position.count;
        for (const n of names) v.setAttribute(n, g.attributes[n]);
        if (colour) {
          if (o.material.vertexColors) v.setAttribute('color', g.attributes.color);
          else {
            const C = colour.array.constructor, white = C === Float32Array ? 1 : 2 ** (8 * C.BYTES_PER_ELEMENT) - 1;
            v.setAttribute('color', new THREE.BufferAttribute(new C(count * colour.itemSize).fill(white), colour.itemSize, colour.normalized));
          }
        }
        if (g.index) v.setIndex(g.index);
        else if (indexed) { const ix = new (count > 65535 ? Uint32Array : Uint16Array)(count); for (let i = 0; i < count; i++) ix[i] = i; v.setIndex(new THREE.BufferAttribute(ix, 1)); }
        views.set(g, v);
      }
      let verts = 0, idx = 0;
      for (const v of views.values()) { verts += v.attributes.position.count; idx += v.index ? v.index.count : 0; }
      const mat = lead.material.clone();
      mat.color.set(0xffffff);
      mat.name = `phone-batch:${list[0].material.name || list[0].material.type}`;
      const bm = new THREE.BatchedMesh(list.length, verts, Math.max(idx, 1), mat);
      bm.name = mat.name;
      bm.frustumCulled = false;          // culled per instance instead
      bm.sortObjects = false;            // opaque only: no sorting needed
      bm.matrixAutoUpdate = false;
      bm.onBeforeRender = cullBatch;
      const ids = new Map();
      try { for (const [g, v] of views) ids.set(g, bm.addGeometry(v)); } catch (err) { console.warn('[Helicoptea] phone batch skipped', err.message); bm.dispose(); mat.dispose(); continue; }
      for (const o of list) {
        const id = bm.addInstance(ids.get(o.geometry));
        bm.setMatrixAt(id, o.matrixWorld);
        const c = o.material.color;
        bm.setColorAt(id, c);
        // Compare doubles with doubles: a Float32 snapshot rounds stationary rotations/translations,
        // making them look changed every frame and repeatedly uploading the instance matrix texture.
        const mem = { o, bm, id, m: new Float64Array(o.matrixWorld.elements), vis: true, mat: o.material, key: this.matKey(o.material), r: c.r, g: c.g, b: c.b, dead: false };
        o.layers.set(HIDDEN_LAYER);
        this.members.push(mem);
      }
      // Nothing is added to a batch after this, so its vertex arrays can go once they are on the GPU (the index
      // stays: the multi-draw reads its element size).
      // (Each geometry's culling bounds are worked out from them first: lazily, they would be read later.)
      for (const gid of ids.values()) { bm.getBoundingBoxAt(gid, _box); bm.getBoundingSphereAt(gid, _sphere); }
      for (const attr of Object.values(bm.geometry.attributes)) attr.onUpload(releaseArray);
      scene.add(bm);
      this.batches.push(bm);
    }
    this.stats.batches = this.batches.length;
    this.stats.members = this.members.length;
    this.scene = scene;
  }

  // A member that changed material (or anything else batching can't follow) goes back to drawing alone.
  eject(mem) {
    mem.dead = true;
    mem.bm.setVisibleAt(mem.id, false);
    mem.o.layers.set(0);
    this.stats.ejected++;
  }

  // Each frame, after the scene's world matrices are updated and before it is drawn.
  update() {
    for (let i = 0; i < this.synced.length; i++) syncMaterial(this.synced[i][0], this.synced[i][1]);
    if (++this.frame % WALK_EVERY === 0) for (const s of this.scenes) this.convert(s);
    const scene = this.scene;
    for (let i = 0; i < this.members.length; i++) {
      const mem = this.members[i];
      if (mem.dead) continue;
      const o = mem.o;
      let mat = o.material;
      // Aircraft effects can restore an original PBR material after a camera/damage transition. Reuse
      // its existing phone stand-in before deciding whether this is a genuine material replacement.
      if (mat !== mem.mat && this.lambert.get(mat) === mem.mat) { mat = o.material = mem.mat; }
      if (mat !== mem.mat) {
        // First person temporarily replaces the surrounding airframe with an invisible material. Keep
        // its instance reserved so returning to chase restores batching instead of losing it forever.
        if (mat && !Array.isArray(mat) && !mat.visible) {
          if (mem.vis) { mem.vis = false; mem.bm.setVisibleAt(mem.id, false); }
          continue;
        }
        this.eject(mem); continue;
      }
      // Drawn only when it, its material and every ancestor are visible and it is still in the scene.
      let vis = o.visible && mat.visible, p = o.parent;
      while (vis && p && p !== scene) { vis = p.visible; p = p.parent; }
      if (p !== scene) vis = false;
      if (vis !== mem.vis) { mem.vis = vis; mem.bm.setVisibleAt(mem.id, vis); }
      if (!vis) continue;
      const c = mat.color;
      if (c.r !== mem.r || c.g !== mem.g || c.b !== mem.b) { mem.r = c.r; mem.g = c.g; mem.b = c.b; mem.bm.setColorAt(mem.id, c); }
      // A change batching can't follow (it started glowing, became see-through, took another texture...).
      if (mat.version !== mem.ver) { mem.ver = mat.version; if (this.matKey(mat) !== mem.key || mat.transparent) { this.eject(mem); continue; } }
      const e = o.matrixWorld.elements, m = mem.m;
      if (e[12] !== m[12] || e[13] !== m[13] || e[14] !== m[14] || e[0] !== m[0] || e[1] !== m[1] || e[2] !== m[2] || e[4] !== m[4] || e[5] !== m[5] || e[6] !== m[6] || e[8] !== m[8] || e[9] !== m[9] || e[10] !== m[10]) {
        m.set(e);
        mem.bm.setMatrixAt(mem.id, o.matrixWorld);
      }
    }
  }
}
