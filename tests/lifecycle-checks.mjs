import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PreviewRig } from '../src/tuning/preview.js';
import { disposeTree } from '../src/render/dispose.js';
import { StringMesh } from '../src/render/strings.js';
import { Sim } from '../src/sim/sim.js';
import { initPhysics } from '../src/sim/physics.js';

// Re-selecting rows before the next browser frame must not multiply simulation/render loops.
const pending = new Map(); let next = 0, renders = 0;
globalThis.requestAnimationFrame = (f) => { pending.set(++next, f); return next; };
globalThis.cancelAnimationFrame = (id) => pending.delete(id);
const rig = Object.create(PreviewRig.prototype);
Object.assign(rig, { running: false, ensureSides() {}, valuesFor: () => [1, 2], resetSides() {},
  applySide: () => 1, tuning: { apply() {} }, sides: [{ t: 0, advance() {} }, { t: 0, advance() {} }], render() { renders++; } });
for (let i = 0; i < 20; i++) { rig.stop(); rig.show({ knobId: 'rotationRate', aircraft: 'micro' }); }
assert.equal(pending.size, 1);
const [id, frame] = [...pending][0]; pending.delete(id); frame(performance.now());
assert.equal(renders, 1); assert.equal(pending.size, 1);
rig.stop(); assert.equal(pending.size, 0);
console.log('PASS  rapid preview changes own exactly one cancellable frame loop');

const shared = new THREE.MeshBasicMaterial(), owned = shared.clone();
owned.userData.disposeOwned = true;
const rope = new StringMesh(3, 0.001, shared);
const tree = new THREE.Group(); tree.add(rope.mesh, new THREE.Mesh(rope.mesh.geometry, owned));
let geoFrees = 0, sharedFrees = 0, ownedFrees = 0;
rope.mesh.geometry.addEventListener('dispose', () => geoFrees++);
shared.addEventListener('dispose', () => sharedFrees++); owned.addEventListener('dispose', () => ownedFrees++);
disposeTree(tree);
assert.equal(geoFrees, 1); assert.equal(ownedFrees, 1); assert.equal(sharedFrees, 0);
console.log('PASS  retirement frees unique assets once and preserves shared materials');

await initPhysics();
const sim = new Sim({ lite: true, bare: true });
let worlds = 0, queues = 0;
const worldFree = sim.world.free.bind(sim.world), queueFree = sim.eventQueue.free.bind(sim.eventQueue);
sim.world.free = () => { worlds++; worldFree(); }; sim.eventQueue.free = () => { queues++; queueFree(); };
sim.dispose(); sim.dispose();
assert.equal(worlds, 1); assert.equal(queues, 1); assert.equal(sim.colliderInfo.size, 0);
console.log('PASS  preview simulation releases its Rapier world and event queue exactly once');
