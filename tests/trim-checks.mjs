// Headless hands-off trim checks (part of `npm run check`): with Flight Assist off and no input, every
// aircraft holds its attitude. Anything hung off the mast axis (the skycrane's snorkel, its tank, a body
// part) shows up here as a slow pitch or roll that the pilot would have to hold off with the stick.
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { CFG } from '../src/config.js';
import { AIRCRAFT_IDS } from '../src/sim/aircraft.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const run = (sim, seconds, fn) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) sim.step(fn ? fn(i * sim.dt) : zero()); };
const f = (x, d = 3) => Number(x).toFixed(d);

const cases = [
  ...AIRCRAFT_IDS.map((id) => ({ id, label: id })),
  { id: 'skycrane', label: 'skycrane, full tank', setup: (h) => { h.tank.vol = h.tank.capacity; }, climb: 4 }, // filled high up: the assist sags before it learns the weight
  { id: 'skycrane', label: 'skycrane, hose reeled right out', setup: (h) => { h.hose.length = CFG.skycrane.hose.maxLength; } },
];

CFG.collective.mode = 'hold'; // assist off, the collective stays where the assisted hover left it
for (const c of cases) {
  const sim = new Sim({ aircraft: c.id });
  run(sim, 1);
  run(sim, c.climb ?? 2, () => ({ ...zero(), collective: 1 }));
  c.setup?.(sim.heli);
  run(sim, 6); // assisted hover: settles, learns any load, trims
  const h = sim.heli;
  sim.assist = false;
  const q0 = h.quat.clone();
  run(sim, 2);
  if (!sim.heli) { check(`${c.label}: holds its attitude hands-off with Assist off`, false, `crashed: ${sim.crashInfo?.reason}`); continue; }
  const e = new THREE.Euler().setFromQuaternion(q0.invert().multiply(sim.heli.quat), 'YXZ');
  const w = sim.heli.body.angvel();
  const rate = Math.hypot(w.x, w.z);
  check(`${c.label}: holds its attitude hands-off with Assist off`,
    !sim.heli.grounded && Math.abs(e.x) < 0.01 && Math.abs(e.z) < 0.01 && rate < 0.01,
    `after 2 s pitch ${f(e.x)} roll ${f(e.z)} rad, rate ${f(rate)} rad/s, y ${f(sim.heli.pos.y)}`);
}
CFG.collective.mode = 'spring';

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} trim checks passed`);
process.exit(failed.length ? 1 : 0);
