import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AirField } from '../src/sim/air.js';
import { CFG } from '../src/config.js';
import { batchStaticMeshes, freezeWorldBranch, updateVisibleMatrices } from '../src/render/sceneWork.js';
import { indexedCopy } from '../src/render/batch.js';
import { LoadCamera } from '../src/render/cockpitCam.js';
import { RippleField } from '../src/render/rippleField.js';
import { resolutionPressure } from '../src/render/resolutionBudget.js';
import { ShadowCache } from '../src/render/shadowCache.js';
import { StringMesh } from '../src/render/strings.js';
import { ParticlePool } from '../src/render/particles.js';
import { Cockpit } from '../src/render/cockpit.js';
import { PhoneRender } from '../src/render/phoneRender.js';

function fieldAt(x, y, z) {
  const heli = { pos: new THREE.Vector3(x, y, z), quat: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), thrust: CFG.heli.mass * 9.81 };
  return new AirField({ heli, world: { castRay: () => ({ timeOfImpact: y + CFG.heli.rotorHubOffset[1] }) } });
}

test('an exterior wake stays active without solving or uploading an empty kitchen grid', () => {
  const air = fieldAt(8, 0.4, -8);
  let solves = 0;
  air.project = () => { solves++; };
  for (let i = 0; i < 120; i++) air.update(1 / 60);
  assert.equal(solves, 0);
  assert.equal(air.gridVersion, 0);
  assert.equal(air.anyWake, true);
  assert.equal(air.calm, false);
  const w = air.wake;
  assert.ok(air.sample(w.hub.x, w.hub.y - 0.02, w.hub.z, new THREE.Vector3()).y < 0);
});

test('table forcing wakes the solver; residual gusts settle and stop changing the texture', () => {
  const air = fieldAt(0.5, 0.2, 0.3);
  air.update(1 / 60);
  assert.ok(air.gridVersion > 0);
  assert.ok(air.energy > 0);
  air.sim.heli = null;
  for (let i = 0; i < 2400 && air.energy; i++) air.update(1 / 60);
  assert.equal(air.energy, 0);
  const version = air.gridVersion;
  air.update(1 / 60);
  assert.equal(air.gridVersion, version);
  assert.equal(air.calm, true);
  assert.ok(air.u.every((v) => v === 0));
  air.clear();
  assert.equal(air.gridVersion, version + 1);
});

test('visible matrix walk matches Three for moving parents and newly revealed children', () => {
  const root = new THREE.Scene(), parent = new THREE.Group(), child = new THREE.Object3D();
  root.add(parent); parent.add(child);
  parent.position.set(2, 3, -4); parent.rotation.y = 0.8; parent.scale.set(2, 1, 3);
  child.position.set(1, -1, 2);
  const reference = root.clone(true);
  let visits = 0;
  const update = child.updateMatrix.bind(child);
  child.updateMatrix = () => { visits++; update(); };
  child.visible = false;
  updateVisibleMatrices(root);
  assert.equal(visits, 0);
  child.visible = true;
  parent.position.x += 2; reference.children[0].position.x += 2;
  updateVisibleMatrices(root); reference.updateMatrixWorld();
  assert.deepEqual(child.matrixWorld.elements, reference.children[0].children[0].matrixWorld.elements);
  assert.equal(visits, 1);
});

test('explicit frozen branches avoid all descendant transforms without affecting live siblings', () => {
  const root = new THREE.Scene(), still = new THREE.Group(), live = new THREE.Object3D(), child = new THREE.Object3D();
  root.add(still, live); still.add(child);
  child.position.x = 4;
  freezeWorldBranch(still);
  child.updateMatrix = () => { throw new Error('frozen branch visited'); };
  live.position.z = 3;
  updateVisibleMatrices(root);
  assert.equal(child.matrixWorld.elements[12], 4);
  assert.equal(live.matrixWorld.elements[14], 3);
});

test('static batching preserves indexed geometry, material and world positions; animated parts stay separate', () => {
  const root = new THREE.Scene(), mat = new THREE.MeshStandardMaterial();
  // Sphere has one material and no multi-material groups.
  const geo = new THREE.SphereGeometry(0.2, 8, 6);
  const a = new THREE.Mesh(geo, mat), b = a.clone(), animated = a.clone();
  a.position.x = -2; b.position.x = 2; animated.position.y = 4;
  const glass = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.5 }));
  root.add(a, b, animated, glass);
  const stats = batchStaticMeshes(root, new Set([animated]));
  assert.equal(stats.saved, 1);
  assert.equal(root.children.length, 3);
  const merged = root.getObjectByName('kitchen-static');
  assert.equal(merged.material, mat);
  assert.equal(merged.geometry.index.count, geo.index.count * 2);
  assert.ok(merged.geometry.boundingBox.min.x < -2);
  assert.ok(merged.geometry.boundingBox.max.x > 2);
  assert.equal(animated.parent, root);
  assert.equal(glass.parent, root);
});

test('aircraft batches retain the exact triangle attributes while reusing indexed vertices', () => {
  for (const original of [new THREE.SphereGeometry(1, 24, 16), new THREE.BoxGeometry(1, 2, 3).toNonIndexed()]) {
    const indexed = indexedCopy(original);
    const expanded = indexed.toNonIndexed(), reference = original.index ? original.toNonIndexed() : original;
    for (const name of ['position', 'normal', 'uv']) assert.deepEqual(expanded.attributes[name].array, reference.attributes[name].array);
    assert.notEqual(indexed.attributes.position.array, original.attributes.position.array);
    if (original.index) assert.ok(indexed.attributes.position.count < reference.attributes.position.count / 3);
  }
});

test('rate-limited hook-camera frames do no world culling; render failure restores state', () => {
  let before = 0, after = 0, draws = 0, target = null;
  const renderer = { shadowMap: { autoUpdate: true }, getRenderTarget: () => target, setRenderTarget: (v) => { target = v; }, clear() {}, render() { draws++; } };
  const cam = new LoadCamera(renderer, { name: 'medium', lite: true });
  cam.render({}, false, () => before++, () => after++);
  for (let i = 0; i < 20; i++) cam.render({}, false, () => before++, () => after++);
  assert.equal(draws, 1); assert.equal(before, 1); assert.equal(after, 1);
  assert.equal(target, null); assert.equal(renderer.shadowMap.autoUpdate, true);
  renderer.render = () => { throw new Error('driver failure'); };
  assert.throws(() => cam.render({}, true, () => before++, () => after++), /driver failure/);
  assert.equal(before, 2); assert.equal(after, 2);
  assert.equal(target, null); assert.equal(renderer.shadowMap.autoUpdate, true);
});

test('120 Hz resolution fallback reacts without GPU timers, preserves CPU-bound frames and battery cap', () => {
  assert.equal(resolutionPressure(16.7, -1, 2, 120).slow, true);
  assert.equal(resolutionPressure(16.7, -1, 10, 120).slow, false);
  assert.equal(resolutionPressure(16.7, -1, 2, 60).slow, false);
  assert.equal(resolutionPressure(33.3, -1, 2, 120, 30).slow, false);
  assert.equal(resolutionPressure(16.7, 12, 2, 120).slow, true);
  assert.equal(resolutionPressure(8.33, -1, 2, 120).roomy, true);
});

test('liquid footprint cache preserves the analytic blade forcing for every aircraft', () => {
  for (const nb of [2, 3, 6]) {
    const field = new RippleField(0.045, 32);
    const f = { x: 0.002, z: -0.003, a: 0.0187, depth: 0.0033, I: 0, nb, omega: -17, phase: 0.6 };
    field.step(1 / 240, [f]);
    for (let k = 0; k < field.n ** 2; k++) {
      if (!field.shape[0][k]) continue;
      const dx = field.cx[k] - f.x, dz = field.cz[k] - f.z, r2 = dx * dx + dz * dz;
      const pulse = 0.35 * Math.sin(field.t * f.omega * nb + f.phase);
      const exact = -field.k * f.depth * Math.exp(-r2 / (f.a ** 2)) * (1 + pulse + 0.6 * Math.min(1, r2 / (f.a ** 2) * 2.5) * Math.cos(nb * (Math.atan2(dz, dx) - field.t * f.omega - f.phase)));
      assert.ok(Math.abs(field.F[k] - exact) < 2e-7, `${nb} blades, cell ${k}`);
    }
    for (let i = 0; i < 20; i++) field.step(1 / 120, [f]);
    assert.equal(field.shapeBuilds, 1);
    f.x += 0.001; field.step(1 / 120, [f]);
    assert.equal(field.shapeBuilds, 2);
    const version = field.texture.version;
    assert.equal(field.step(0, [f]), false);
    assert.equal(field.texture.version, version);
    field.texture.dispose();
  }
});

test('changing shadow casters also refreshes the camera key in the same frame', () => {
  const cache = Object.create(ShadowCache.prototype);
  let cameraChecks = 0, renders = 0;
  Object.assign(cache, { light: new THREE.DirectionalLight(), visible: [], stats: {},
    classify: () => true, cameraMoved: () => { cameraChecks++; return true; } });
  cache.render(() => { renders++; }, [cache.light], new THREE.Scene(), new THREE.PerspectiveCamera());
  assert.equal(cameraChecks, 1);
  assert.equal(renders, 1);
});

test('unchanged strings keep their vertex versions and shadows; motion and radius still invalidate', () => {
  const rope = new StringMesh(3, 0.001, new THREE.MeshStandardMaterial());
  const pts = new Float32Array([0, 0, 0, 0, 0.1, 0, 0.05, 0.2, 0]);
  rope.update(pts);
  const position = rope.mesh.geometry.attributes.position, version = position.version;
  const original = position.array.slice();
  rope.update(pts);
  assert.equal(position.version, version);
  assert.deepEqual(position.array, original);
  pts[3] += 0.02; rope.update(pts);
  assert.equal(position.version, version + 1);
  assert.notDeepEqual(position.array, original);
  rope.radius *= 2; rope.update(pts);
  assert.equal(position.version, version + 2);
});

test('particle pools upload only live prefixes and idle pools do no uploads', () => {
  const pool = new ParticlePool(100);
  pool.update(1 / 120);
  assert.equal(pool.posAttr.version, 0);
  assert.equal(pool.points.visible, false);
  pool.emit({ p: [0, 1, 0], v: [0, 0, 0], life: 1, size0: 0.01, col0: [1, 1, 1] });
  pool.update(1 / 120);
  assert.equal(pool.points.visible, true);
  assert.deepEqual(pool.posAttr.updateRanges, [{ start: 0, count: 3 }]);
  assert.deepEqual(pool.colAttr.updateRanges, [{ start: 0, count: 4 }]);
  assert.equal(pool.points.geometry.drawRange.count, 1);
  pool.clear(); const version = pool.posAttr.version;
  pool.update(1 / 120);
  assert.equal(pool.posAttr.version, version);
  assert.equal(pool.points.visible, false);
});

test('cockpit renderer updates live instruments without visiting a cached hidden interior', () => {
  const scene = new THREE.Scene(), live = new THREE.Object3D(), hidden = new THREE.Group();
  scene.matrixWorldAutoUpdate = false;
  scene.add(live, hidden); hidden.visible = false;
  hidden.updateMatrix = () => { throw new Error('retired interior visited'); };
  live.position.x = 0.2;
  const renderer = { autoClear: true, shadowMap: {}, clearDepth() {}, render(s) { assert.equal(s, scene); assert.equal(live.matrixWorld.elements[12], 0.2); } };
  const cockpit = Object.assign(Object.create(Cockpit.prototype), { renderer, scene, quality: {}, camera: new THREE.PerspectiveCamera() });
  cockpit.render();
  assert.equal(renderer.autoClear, true);
});

test('phone material simplification preserves functional custom shaders such as wet tea paper', () => {
  const phone = new PhoneRender({}, []);
  const wet = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  wet.onBeforeCompile = () => {};
  wet.customProgramCacheKey = () => 'teabag-wet-paper';
  assert.equal(phone.convertMaterial(wet), wet);
  const plain = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  assert.ok(phone.convertMaterial(plain).isMeshLambertMaterial);
  for (const key of ['grime', 'sway|123', 'world-kit-rm']) {
    const cosmetic = wet.clone(); cosmetic.onBeforeCompile = wet.onBeforeCompile;
    cosmetic.customProgramCacheKey = () => key;
    assert.ok(phone.convertMaterial(cosmetic).isMeshLambertMaterial, key);
  }
});

test('phone airframe batches survive first-person hiding and still eject genuine material replacements', () => {
  const scene = new THREE.Scene(), mat = new THREE.MeshLambertMaterial();
  const o = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
  scene.add(o); o.layers.set(31);
  const visibility = [], phone = new PhoneRender({}, [scene]);
  phone.scene = scene;
  const mem = { o, mat, id: 0, bm: { setVisibleAt: (id, v) => visibility.push(v) }, vis: true, dead: false,
    m: new Float32Array(o.matrixWorld.elements), r: mat.color.r, g: mat.color.g, b: mat.color.b, key: phone.matKey(mat), ver: mat.version };
  phone.members.push(mem);
  o.material = new THREE.MeshBasicMaterial({ visible: false }); phone.update();
  assert.equal(mem.dead, false); assert.equal(phone.stats.ejected, 0);
  o.material = mat; phone.update();
  assert.deepEqual(visibility, [false, true]); assert.equal(o.layers.mask, 2 ** 31);
  const original = new THREE.MeshStandardMaterial(); phone.lambert.set(original, mat);
  o.material = original; phone.update();
  assert.equal(o.material, mat); assert.equal(mem.dead, false);
  o.material = mat.clone(); phone.update();
  assert.equal(mem.dead, true); assert.equal(phone.stats.ejected, 1); assert.equal(o.layers.mask, 1);
});

test('stationary phone instances do not upload rounded matrix changes; real movement still updates', () => {
  const scene = new THREE.Scene(), mat = new THREE.MeshLambertMaterial(), geo = new THREE.SphereGeometry(1, 8, 6);
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
  a.position.x = 0.1; b.position.x = 0.2; a.rotation.y = 0.123; b.rotation.z = 0.234;
  scene.add(a, b);
  const phone = new PhoneRender({}, [scene]); phone.batch(scene);
  assert.equal(phone.members.length, 2);
  const batch = phone.batches[0], original = batch.setMatrixAt.bind(batch);
  let uploads = 0;
  batch.setMatrixAt = (...args) => { uploads++; return original(...args); };
  for (let i = 0; i < 120; i++) phone.update();
  assert.equal(uploads, 0);
  a.position.x += 0.01; scene.updateMatrixWorld(); phone.update();
  assert.equal(uploads, 1);
  batch.dispose(); batch.material.dispose(); geo.dispose(); mat.dispose();
});

test('phone batching leaves animated vertex buffers live, including skycrane milk sight levels', () => {
  const phone = new PhoneRender({}, []), geo = new THREE.SphereGeometry(1, 8, 6);
  geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const milk = new THREE.Mesh(geo, new THREE.MeshPhongMaterial());
  assert.equal(phone.why(milk), 'dynamic geometry');
});
