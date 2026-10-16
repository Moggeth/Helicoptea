import * as dominoes from './extras/dominoes.js';
import * as panRack from './extras/panRack.js';
import * as baskets from './extras/baskets.js';
import * as pottingBench from './extras/pottingBench.js';

// Extra set pieces for the house and tea garden, one module each (src/sim/extras/*.js, drawn by the
// matching src/render/extras/*.js). A module's create(sim, lite) returns an object with any of:
//   recorded: [{ id, body }]   bodies the flight recorder keeps (replayed as prop:<id>)
//   applyForces(dt)            before the physics step (air on things, motors)
//   afterStep(dt)              after it (capture Tracks, emit events)
//   reset()                    Shift+R: put everything back
// Modules may add fixed colliders, dynamic bodies and joints of their own (register each collider with
// sim.register). They must stay DOM-free: the headless checks build the sim in Node.
const MODULES = { dominoes, panRack, baskets, pottingBench };

export class Extras {
  constructor(sim, lite = false) {
    this.sim = sim;
    this.mods = {};
    this.list = [];
    if (sim.bare) return;
    for (const [name, mod] of Object.entries(MODULES)) {
      if (!mod.create) continue;
      const m = mod.create(sim, lite) || {};
      this.mods[name] = m;
      this.list.push(m);
    }
  }

  // Every recorded body: [{ id, body }].
  recorded() {
    const out = [];
    for (const m of this.list) if (m.recorded) out.push(...m.recorded);
    return out;
  }

  applyForces(dt) { for (const m of this.list) if (m.applyForces) m.applyForces(dt); }
  afterStep(dt) { for (const m of this.list) if (m.afterStep) m.afterStep(dt); }
  reset() { for (const m of this.list) if (m.reset) m.reset(); }
}
