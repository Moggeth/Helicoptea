import * as THREE from 'three';
import { Batcher, T, boxUV, planeUV, blobGeometry } from '../batch.js';
import { kitMaterials, swayMaterial } from '../extras/kit.js';
import { worldKit } from './kit.js';
import { GroundPainter, buildGround } from './ground.js';
import { AREAS, BOUNDS, groundHeight } from '../../sim/world/plan.js';
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
const CHUNK = 12;
const AREA_MODULES = { house, left, right, street, allotments, park };

const _c = new THREE.Vector3(), _p = new THREE.Vector3(), _box = new THREE.Box3();

export function buildWorld(scene, quality, { kitchen, sim, wind, teaStand, charm } = {}) {
  const lite = !!quality.lite;
  const hi = quality.name === 'high' || quality.name === 'ultra';
  // Draw distances (metres from the camera to a chunk's box).
  const DIST = lite ? { lod0: 95, lod1: 28, lod2: 0, update: 26 } : { lod0: 170, lod1: 55, lod2: 24, update: 40 };
  const kit = kitMaterials();
  const wk = worldKit(quality);
  const ground = new GroundPainter(quality);
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const chunks = new Map();
  const chunkAt = (x, z) => {
    const ix = Math.floor(x / CHUNK), iz = Math.floor(z / CHUNK), key = `${ix},${iz}`;
    let c = chunks.get(key);
    if (!c) {
      c = { key, batch: [new Batcher(), new Batcher(), new Batcher()], groups: [0, 1, 2].map((l) => { const g = new THREE.Group(); g.name = `world-${key}-lod${l}`; root.add(g); return g; }),
        box: new THREE.Box3(new THREE.Vector3(ix * CHUNK, BOUNDS.top, iz * CHUNK), new THREE.Vector3(ix * CHUNK + CHUNK, -1, iz * CHUNK + CHUNK)), dist: 0 };
      chunks.set(key, c);
    }
    return c;
  };
  const updaters = [];
  let current = null;

  const replayProps = charm && charm.replay ? charm.replay.props : new Map();
  const ctx = {
    scene, quality, kitchen, sim, wind, lite, hi,
    kit, wk, T, boxUV, planeUV, blobGeometry,
    ground,
    groundY: groundHeight,
    // Static mesh, merged into its chunk by material. colour tints the (white-based) material per piece.
    add(geo, mat, matrix = null, color = 0xffffff, lod = 1) {
      if (lod >= 2 && lite) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox.getCenter(_c);
      if (matrix) _c.applyMatrix4(matrix);
      chunkAt(_c.x, _c.z).batch[lod].add(geo, mat, matrix, color);
    },
    // A live object (animated, instanced, transparent...): culled with the chunk its position is in.
    object(obj, lod = 1) {
      if (lod >= 2 && lite) return obj;
      obj.updateMatrixWorld(true);
      _box.setFromObject(obj);
      if (_box.isEmpty()) _box.getCenter(_c).copy(obj.position); else _box.getCenter(_c);
      const c = chunkAt(_c.x, _c.z);
      c.groups[lod].add(obj);
      if (!_box.isEmpty()) c.box.union(_box);
      return obj;
    },
    update(fn) { updaters.push({ fn, area: current }); },
    // Foliage that bends in breeze and rotor wash (see src/render/extras/kit.js).
    sway: (mat, opts) => swayMaterial(mat, wind || {}, opts),
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
  const skip = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('noworld')) || '';
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
    for (let l = 0; l < 3; l++) {
      for (const m of c.batch[l].build(c.groups[l])) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        c.box.union(m.geometry.boundingBox);
        // Foliage adds a lot of triangles and almost no visible occlusion: keep it out of the AO pass.
        if (/leaf|petal|sway|glass/.test(m.material.name)) m.userData.noAO = true;
      }
    }
    if (c.box.min.y > c.box.max.y) { c.box.min.y = -1; c.box.max.y = 1; }
  }

  // The ground beyond the house and garden, painted by the areas, and the far hills round it all.
  const groundMesh = buildGround(ground, quality);
  root.add(groundMesh);
  const far = skip === 'all' || skip.split(',').includes('horizon') ? null : horizon.build(ctx, root);

  const list = [...chunks.values()];
  let frame = 0;
  return {
    root, chunks, built, ground: groundMesh, far, DIST,
    stats() {
      let draws = 0, tris = 0;
      root.traverseVisible((o) => { if (o.isMesh) { draws++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
      return { chunks: list.length, draws, tris: Math.round(tris) };
    },
    update(dt, simNow, camera) {
      // Chunks by distance (every other frame is plenty: the camera moves centimetres per frame).
      if ((frame++ & 1) === 0 || dt === 0) {
        const cp = camera.position;
        for (const c of list) {
          const d = c.box.distanceToPoint(cp);
          c.dist = d;
          c.groups[0].visible = d < DIST.lod0;
          c.groups[1].visible = d < DIST.lod1;
          c.groups[2].visible = d < DIST.lod2;
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
