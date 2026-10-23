import * as THREE from 'three';
import { Batcher, T, boxUV, planeUV, blobGeometry } from '../batch.js';
import { kitMaterials, swayMaterial } from '../extras/kit.js';
import { worldKit } from './kit.js';
import { GroundPainter, buildGround } from './ground.js';
import { AREAS, BOUNDS, MAIN, groundHeight } from '../../sim/world/plan.js';
import { ROOM } from '../../sim/layout.js';
import { WORLD_STATIONS } from '../../sim/world/index.js';
import * as house from './areas/house.js';
import * as left from './areas/left.js';
import * as right from './areas/right.js';
import * as street from './areas/street.js';
import * as allotments from './areas/allotments.js';
import * as park from './areas/park.js';
import * as horizon from './areas/horizon.js';

// Draws the neighbourhood (src/sim/world/plan.js) and streams its detail by distance.
//
// Every area module's build(ctx) adds static meshes through ctx.add(geometry, material, matrix, colour, lod).
// They are merged per material into chunks of the world (CHUNK metres square, chosen by where each piece's
// centre lands), so the view frustum culls whole chunks and each chunk's detail is drawn only near the camera:
//   lod 0  structure (walls, roofs, big trees, roads): drawn out to the fog
//   lod 1  detail (furniture, fences, bushes, props): drawn within DIST.lod1 of the camera
//   lod 2  fine (small clutter, leaf cards, ornaments): not built on phones and the low tier; within DIST.lod2
// Live objects (anything animated) go in through ctx.object(obj, lod) and are culled with their chunk;
// ctx.update(fn) runs fn(dt, sim, camera) each frame while the camera is within DIST.update of the area.
// Chunk size per level of detail: structure in big chunks (few draw calls). Phones draw fewer, bigger chunks:
// they are held back by draw calls far more than by triangles the frustum could have culled.
const CHUNK = [40, 24, 12], CHUNK_LITE = [40, 16, 12];
const AO_DIST = 8, SHADOW_DIST = 6;
function freeArray() { this.array = null; }
// Distance across the ground from a point to an area's box.
function areaDist(A, p) { return Math.hypot(Math.max(A.x0 - p.x, 0, p.x - A.x1), Math.max(A.z0 - p.z, 0, p.z - A.z1)); } // chunk size per level of detail: structure in big chunks (few draw calls)
const AREA_MODULES = { house, left, right, street, allotments, park };

const _c = new THREE.Vector3(), _p = new THREE.Vector3(), _box = new THREE.Box3();

// Detail doesn't pop in and out at its draw distance: over the last few metres it dissolves (an ordered
// dither by distance from the camera, so it stays opaque and needs no sorting), and a chunk comes off only
// once all of it is past the limit. Only the chunks reaching into that stretch draw with the dissolving
// variant of their materials (a discard costs the GPU its early depth test); the rest draw as they were.
// uLodFade: (width of the stretch, draw distance), shared by every variant of one level of detail.
const fadeKey = new WeakMap();
function lodFadeMaterial(m, u) {
  const f = m.clone();
  f.userData = m.userData;
  f.name = `${m.name}|lodfade`;
  const base = m.onBeforeCompile, key = m.customProgramCacheKey();
  f.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <clipping_planes_fragment>')) return;
    sh.uniforms.uLodFade = u;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLodW;')
      .replace('#include <project_vertex>', 'vLodW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLodW; uniform vec2 uLodFade;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          float k = smoothstep(0.0, 1.0, (uLodFade.y - distance(vLodW, cameraPosition)) / uLodFade.x);
          vec2 q = mod(floor(gl_FragCoord.xy), 4.0), a = floor(q * 0.5), b = mod(q, 2.0);
          float t = fract(a.x * 0.5 + a.y * a.y * 0.75) * 0.25 + fract(b.x * 0.5 + b.y * b.y * 0.75);
          if (k <= t * 0.94 + 0.03) discard;
        }`);
  };
  f.customProgramCacheKey = () => `${key}|lodfade`;
  fadeKey.set(f, true);
  return f;
}

// The set-piece kit has a material per kind of surface, but most differ only in roughness and metalness over
// one of three grain textures. In the world's merged chunks they share one material per texture, reading
// roughness and metalness from the vertices: a third of the draw calls (and of those in the AO pass).
const SHARED = { grain: ['wood', 'weathered', 'wicker'], rough: ['terracotta', 'stone', 'soil', 'iron', 'zinc'], fine: ['paint', 'enamel', 'brass', 'copper', 'steel', 'fabric', 'paper', 'rubber'] };
function sharedMaterials(kit) {
  const by = new Map();
  for (const [cls, names] of Object.entries(SHARED)) {
    const m = kit[names[0]].clone();
    m.name = `world-kit-${cls}`;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 rm;
varying vec2 vRM;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vRM = rm;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vRM;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
    };
    m.customProgramCacheKey = () => `world-kit-rm`;
    for (const n of names) by.set(kit[n], { mat: m, rm: [kit[n].roughness, kit[n].metalness] });
  }
  return by;
}

export function buildWorld(scene, quality, { kitchen, sim, wind, teaStand, charm } = {}) {
  const lite = !!quality.lite;
  const hi = quality.name === 'high' || quality.name === 'ultra';
  // Draw distances (metres from the camera to a chunk's box).
  const DIST = lite ? { lod0: 56, lod1: 13, lod2: 0, update: 12 } : { lod0: 170, lod1: 40, lod2: 18, update: 20 };
  // Indoors (the kitchen and the house) the world outside is only seen through windows and doors: its detail
  // closes in.
  const IN = lite ? { lod0: 16, lod1: 6, lod2: 0 } : { lod0: 24, lod1: 7, lod2: 5 };
  // How far before its draw distance each level of detail starts to dissolve (lod 0 goes into the fog).
  const BAND = lite ? [0, 3, 0] : [0, 8, 5], IN_BAND = [0, 2, 1.5];
  const fadeU = [null, { value: new THREE.Vector2(1, 1) }, { value: new THREE.Vector2(1, 1) }];
  const kit = kitMaterials();
  const wk = worldKit(quality);
  const shared = sharedMaterials(kit);
  const ground = new GroundPainter(quality);
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const chunks = new Map();
  // Chunks are per area too, so the house's insides and the outside can be told apart (see update()).
  const chunkAt = (x, z, lod) => {
    const area = current ? current.name : 'misc';
    const S = (lite ? CHUNK_LITE : CHUNK)[lod], ix = Math.floor(x / S), iz = Math.floor(z / S), key = `${area}:${lod}:${ix},${iz}`;
    let c = chunks.get(key);
    if (!c) {
      const group = new THREE.Group();
      group.name = `world-${key}`;
      root.add(group);
      c = { key, lod, area, areaBox: AREAS[area] || null, batch: new Batcher(), group, box: new THREE.Box3(new THREE.Vector3(ix * S, BOUNDS.top, iz * S), new THREE.Vector3(ix * S + S, -1, iz * S + S)), dist: 0,
        cell: new THREE.Box3(new THREE.Vector3(ix * S - 4, -10, iz * S - 4), new THREE.Vector3(ix * S + S + 4, 60, iz * S + S + 4)) };
      chunks.set(key, c);
    }
    return c;
  };
  const updaters = [];
  let thin = 0;
  let current = null;

  const replayProps = charm && charm.replay ? charm.replay.props : new Map();
  const ctx = {
    scene, quality, kitchen, sim, wind, lite, hi,
    kit, wk, T, boxUV, planeUV,
    // Foliage lumps: a coarser sphere on phones.
    blobGeometry: (r, detail = 2, seed = 1, amp = 0.22) => blobGeometry(r, lite ? Math.min(detail, 1) : detail, seed, amp),
    ground,
    groundY: groundHeight,
    // Static mesh, merged into its chunk by material. colour tints the (white-based) material per piece.
    add(geo, mat, matrix = null, color = 0xffffff, lod = 1) {
      if (lod >= 2 && lite) return;
      // Phones get half the small leaves and petals (they are most of the world's triangles).
      if (lite && lod >= 1 && /leaf|petal/.test(mat.name) && (thin++ & 1)) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getCenter(_c);
      if (matrix) _c.applyMatrix4(matrix);
      const s = shared.get(mat);
      chunkAt(_c.x, _c.z, lod).batch.add(geo, s ? s.mat : mat, matrix, color, s ? { rm: s.rm } : undefined);
    },
    // A live object (animated, instanced, transparent...): culled with the chunk its position is in. at: [x, z]
    // where it really is, for things posed only once they animate (instances, children placed per frame).
    object(obj, lod = 1, at = null) {
      if (lod >= 2 && lite) return obj;
      obj.updateMatrixWorld(true);
      _box.setFromObject(obj);
      if (at) { _c.set(at[0], 0, at[1]); _box.makeEmpty(); } else if (_box.isEmpty()) _c.copy(obj.position); else _box.getCenter(_c);
      const c = chunkAt(_c.x, _c.z, lod);
      c.group.add(obj);
      c.live = true;
      if (!_box.isEmpty()) c.box.union(_box);
      return obj;
    },
    update(fn) { updaters.push({ fn, area: current }); },
    // Foliage that bends in breeze and rotor wash (see src/render/extras/kit.js).
    // (Phones keep it still: one material fewer per kind of plant in every chunk, and a cheaper vertex shader.)
    sway: (mat, opts) => (lite ? mat : swayMaterial(mat, wind || {}, opts)),
    get audio() { return charm ? charm.audio : null; },
    airAt: (p, out) => (sim && sim.props ? sim.props.airAt(p, out) : out.set(0, 0, 0)),
    replayProxy(id, onPosed) {
      const o = new THREE.Object3D();
      if (onPosed) o.onPosed = onPosed;
      replayProps.set(id, o);
      return o;
    },
    teaStand,
  };

  // ?noworld=all or ?noworld=park,street hides areas (for measuring what each costs).
  // Safe mode (after a phone crash, see main.js) leaves the whole neighbourhood out too.
  const skip = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('noworld')) || (quality.noWorld ? 'all' : '');
  const built = [];
  for (const [name, mod] of Object.entries(AREA_MODULES)) {
    if (!mod.build || skip === 'all' || skip.split(',').includes(name)) continue;
    current = { name, box: AREAS[name] };
    ctx.area = current.box;
    mod.build(ctx);
    built.push(name);
  }
  current = null;
  // The areas' tea stands (their pegs and bags are the sim's).
  if (teaStand) for (const S of WORLD_STATIONS) ctx.object(teaStand(S), 1).traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });

  // Merge each chunk's statics; fit the chunk boxes to what they hold.
  for (const c of chunks.values()) {
    c.merged = c.batch.build(c.group);
    for (const m of c.merged) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      m.geometry.computeBoundingSphere();
      c.box.union(m.geometry.boundingBox);
      // The merged vertices live on the GPU once uploaded: let go of the copy in script memory (phones keep
      // their tabs alive on far less).
      for (const a of Object.values(m.geometry.attributes)) a.onUpload(freeArray);
      // Foliage adds a lot of triangles and almost no visible occlusion: keep it out of the AO pass.
      if (/leaf|petal|sway|glass/.test(m.material.name)) m.userData.noAO = m.userData.foliage = true;
    }
    if (c.box.min.y > c.box.max.y) { c.box.min.y = -1; c.box.max.y = 1; }
    // A long piece (a path, a fence run) shouldn't drag a whole chunk's detail into view from afar: the box
    // that decides drawing stays within a few metres of the chunk's own square.
    c.box.intersect(c.cell);
    // Nothing in a chunk moves except live objects: skip the per-frame matrix walk for the rest.
    c.group.matrixAutoUpdate = false;
    c.group.updateMatrixWorld(true);
    c.on = true;
    // A chunk of merged statics never moves: skip it in the per-frame matrix walk altogether.
    if (!c.live) c.group.matrixWorldAutoUpdate = false;
    for (const o of c.group.children) if (o.userData.static !== false && o.matrixAutoUpdate === false) o.matrixWorldAutoUpdate = false;
  }
  root.matrixAutoUpdate = false;

  // The ground beyond the house and garden, painted by the areas, and the far hills round it all.
  const groundMesh = buildGround(ground, quality);
  root.add(groundMesh);
  const far = skip === 'all' || skip.split(',').includes('horizon') ? null : horizon.build(ctx, root);

  const list = [...chunks.values()];
  const extrasInRoot = root.children.filter((o) => o !== groundMesh && !list.some((c) => c.group === o));
  let frame = 0;
  let wasInside = null;
  return {
    root, chunks, built, ground: groundMesh, far, DIST,
    // The dissolving variants of the detail chunks' materials, made from the materials they draw with now
    // (on phones, after the cheaper stand-ins replaced them and small pieces went into batches). Returns a
    // hidden group drawing each variant, kept in the scene so the shader warm-ups build those programs too.
    prepareFades() {
      const warm = new THREE.Group();
      warm.name = 'world-lod-fade-warm';
      warm.visible = false;
      warm.matrixAutoUpdate = false;
      const made = new Map();
      for (const c of list) {
        if (c.lod < 1 || !c.merged) continue;
        c.fadeMeshes = [];
        for (const m of c.merged) {
          // Meshes drawn through a phone batch (moved to a hidden layer) keep their material.
          if (Array.isArray(m.material) || m.layers.mask !== 1 || fadeKey.has(m.material)) continue;
          const k = `${m.material.uuid}|${c.lod}`;
          let f = made.get(k);
          if (!f) {
            f = lodFadeMaterial(m.material, fadeU[c.lod]);
            made.set(k, f);
            const w = new THREE.Mesh(m.geometry, f);
            w.matrixAutoUpdate = false; w.frustumCulled = false; w.userData.noAO = true;
            warm.add(w);
          }
          m.userData.lodSolid = m.material;
          m.userData.lodFade = f;
          c.fadeMeshes.push(m);
        }
      }
      root.add(warm);
      return warm;
    },
    stats() {
      let draws = 0, tris = 0;
      root.traverseVisible((o) => { if (o.isMesh) { draws++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
      return { chunks: list.length, draws, tris: Math.round(tris) };
    },
    // Around a short-sighted extra render (the hook camera, looking down a few metres): only the chunks within
    // reach of it draw; restore() puts back what the main view had.
    inset(cam, reach) {
      this.saved = this.saved || [];
      this.saved.length = 0;
      for (const c of list) { this.saved.push(c.group.visible); if (c.on && c.box.distanceToPoint(cam.position) > reach) c.group.visible = false; }
      // The far hills and the like are far out of its reach.
      for (const o of extrasInRoot) { this.saved.push(o.visible); o.visible = false; }
    },
    restore() {
      if (!this.saved) return;
      let i = 0;
      for (const c of list) c.group.visible = this.saved[i++];
      for (const o of extrasInRoot) o.visible = this.saved[i++];
    },
    update(dt, simNow, camera) {
      // Chunks by distance (every other frame is plenty, every fourth on phones: the camera moves centimetres
      // per frame).
      if ((frame++ & (lite ? 3 : 1)) === 0 || dt === 0) {
        const cp = camera.position;
        const inside = (cp.x > ROOM.minX && cp.x < ROOM.maxX && cp.z > ROOM.minZ && cp.z < ROOM.maxZ && cp.y < ROOM.ceilingY)
          || (cp.x > MAIN.x0 && cp.x < MAIN.x1 && cp.z > MAIN.z0 && cp.z < MAIN.z1 && cp.y < MAIN.eave);
        const lim = inside ? [IN.lod0, IN.lod1, IN.lod2] : [DIST.lod0, DIST.lod1, DIST.lod2];
        const band = inside ? IN_BAND : BAND;
        if (inside !== wasInside) { wasInside = inside; for (let l = 1; l < 3; l++) fadeU[l].value.set(Math.max(band[l], 0.01), lim[l]); }
        for (const c of list) {
          const d = c.box.distanceToPoint(cp);
          c.dist = d;
          // Indoors, the outside is seen through a window or two: only the structure of the areas close by.
          let vis = d < lim[c.lod];
          if (inside && c.area !== 'house') vis = vis && c.lod === 0 && (!c.areaBox || areaDist(c.areaBox, cp) < IN.lod0);
          // Out of sight chunks come off the scene altogether: every render walks the scene graph, and a hidden
          // group still costs a visit in each.
          if (vis !== c.on) { c.on = vis; if (vis) root.add(c.group); else root.remove(c.group); }
          // Dissolving while any of it reaches into the last stretch before the draw distance.
          if (c.on && c.fadeMeshes) {
            const b = c.box, fx = Math.max(Math.abs(cp.x - b.min.x), Math.abs(cp.x - b.max.x)), fy = Math.max(Math.abs(cp.y - b.min.y), Math.abs(cp.y - b.max.y)), fz = Math.max(Math.abs(cp.z - b.min.z), Math.abs(cp.z - b.max.z));
            const fading = band[c.lod] > 0 && Math.hypot(fx, fy, fz) > lim[c.lod] - band[c.lod];
            if (fading !== c.fading) { c.fading = fading; for (const m of c.fadeMeshes) m.material = fading ? m.userData.lodFade : m.userData.lodSolid; }
          }
          // Ambient occlusion only matters close up: far chunks skip the AO pass (it draws them all again).
          const far = d > AO_DIST;
          if (c.on && c.aoFar !== far) { c.aoFar = far; for (const m of c.group.children) if (!m.userData.alwaysNoAO) m.userData.noAO = far || !!m.userData.foliage; }
          // The sun's shadow map covers a few metres round the aircraft: far chunks needn't be offered to it
          // (the shadow cache sorts every caster it is given, every frame).
          const casts = d < SHADOW_DIST;
          if (c.on && c.casts !== casts) { c.casts = casts; c.group.traverse((m) => { if (m.isMesh && m.userData.casts !== false) { if (m.userData.casts === undefined) m.userData.casts = m.castShadow; m.castShadow = casts && m.userData.casts; } }); }
        }
      }
      const cp = camera.position;
      for (const u of updaters) {
        if (u.area) {
          const A = u.area.box;
          _p.set(Math.min(Math.max(cp.x, A.x0), A.x1), cp.y, Math.min(Math.max(cp.z, A.z0), A.z1));
          if (_p.distanceTo(cp) > DIST.update) continue;
        }
        u.fn(dt, simNow, camera);
      }
      if (far && far.update) far.update(dt, camera);
    },
  };
}
