import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AirField } from '../src/sim/air.js';
import { CFG } from '../src/config.js';

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
