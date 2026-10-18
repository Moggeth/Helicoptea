// Focused regressions for phone batch preservation and unchanged liquid forcing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PhoneRender} from '../src/render/phoneRender.js';
import {RippleField} from '../src/render/rippleField.js';

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
    for (const [key, delta] of [['x', 0.001], ['z', -0.001], ['a', 0.001], ['nb', 1]]) {
      const before = field.shapeBuilds;
      f[key] += delta; field.step(1 / 120, [f]);
      assert.equal(field.shapeBuilds, before + 1, `${key} invalidates the footprint`);
    }
    const version = field.texture.version;
    assert.equal(field.step(0, [f]), false);
    assert.equal(field.texture.version, version);
    field.texture.dispose();
  }
});
