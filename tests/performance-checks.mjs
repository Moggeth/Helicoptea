import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AirField } from '../src/sim/air.js';
import { CFG } from '../src/config.js';
import { batchStaticMeshes, freezeWorldBranch, updateVisibleMatrices } from '../src/render/sceneWork.js';
import { indexedCopy } from '../src/render/batch.js';
import { LoadCamera } from '../src/render/cockpitCam.js';

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
