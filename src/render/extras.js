import * as THREE from 'three';
import * as dominoes from './extras/dominoes.js';
import * as panRack from './extras/panRack.js';
import * as baskets from './extras/baskets.js';
import * as pottingBench from './extras/pottingBench.js';
import * as kitchenPolish from './extras/kitchenPolish.js';
import * as pinwheels from './extras/pinwheels.js';
import * as dandelions from './extras/dandelions.js';
import * as leaves from './extras/leaves.js';
import * as chimes from './extras/chimes.js';
import * as paperBoat from './extras/paperBoat.js';
import * as kitchenCounter from './extras/zones/kitchenCounter.js';
import * as kitchenRoom from './extras/zones/kitchenRoom.js';
import * as kitchenShelves from './extras/zones/kitchenShelves.js';
import * as patio from './extras/zones/patio.js';
import * as bedLeft from './extras/zones/bedLeft.js';
import * as bedRight from './extras/zones/bedRight.js';
import * as meadow from './extras/zones/meadow.js';
import * as fences from './extras/zones/fences.js';
import { Batcher, T, boxUV, planeUV, blobGeometry } from './batch.js';
import { kitMaterials, swayMaterial } from './extras/kit.js';

// Draws the extra set pieces (see src/sim/extras.js). Each module's build(ctx) returns an object with an
// optional update(dt, sim, camera), called every rendered frame (also while a replay plays). Render-only
// pieces (pinwheels, dandelions, leaves, chimes, the paper boat) read the air through ctx.airAt.
const MODULES = { dominoes, panRack, baskets, pottingBench, kitchenPolish, pinwheels, dandelions, leaves, chimes, paperBoat,
  kitchenCounter, kitchenRoom, kitchenShelves, patio, bedLeft, bedRight, meadow, fences };

export function buildExtras(scene, quality, kitchen, charm, sim, wind) {
  const replayProps = charm && charm.replay ? charm.replay.props : new Map();
  // Static parts of every piece go into one shared Batcher (built after all modules), merged by material.
  const batch = new Batcher();
  const kit = kitMaterials();
  const ctx = {
    scene, quality, kitchen, sim, wind,
    // Shared static batch: ctx.batch.add(geometry, ctx.kit.wood, T(x, y, z, ry), 0xb08050, { cast, receive }).
    batch, kit, T, boxUV, planeUV, blobGeometry,
    // Foliage that bends in breeze and wash: ctx.sway(ctx.kit.leaf, { baseY, height, amount, indoor }).
    sway: (mat, opts) => swayMaterial(mat, wind || {}, opts),
    lite: !!quality.lite,
    hi: quality.name === 'high' || quality.name === 'ultra',
    // The game's audio engine (src/audio/audio.js): tone(), noiseBurst(), spot(pos). Null until started.
    get audio() { return charm ? charm.audio : null; },
    // Air velocity at a point (rotor wash, outwash along surfaces); writes into out and returns it.
    airAt: (p, out) => (sim && sim.props ? sim.props.airAt(p, out) : out.set(0, 0, 0)),
    shadowed(o, cast = true, receive = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; },
    // A stand-in the flight replay poses for a recorded body (prop:<id>); onPosed runs after each pose so an
    // instanced or merged mesh can copy the pose in. Returns the Object3D (not added to the scene).
    replayProxy(id, onPosed) {
      const o = new THREE.Object3D();
      if (onPosed) o.onPosed = onPosed;
      replayProps.set(id, o);
      return o;
    },
  };
  const mods = [];
  for (const [name, mod] of Object.entries(MODULES)) {
    if (!mod.build) continue;
    const m = mod.build(ctx) || {};
    m.name = name;
    mods.push(m);
  }
  batch.build(scene);
  return {
    mods,
    update(dt, sim2, camera) { for (const m of mods) if (m.update) m.update(dt, sim2, camera); },
  };
}
