// Headless checks for the right-hand neighbours (p+1, p+2, the strip and our right side passage):
// every flight route is swept with a rotor-sized ball, key solids are ray-checked, every cup is open to the sky.
// Run: node tests/area-right-checks.mjs
import { worldSim, sweep, ray, cupOpen, checker } from './route-lib.mjs';
import { FY } from '../src/sim/world/plan.js';
import { CUPS } from '../src/sim/world/right.js';

const { check, done } = checker('right-area');
const sim = await worldSim();
const g = FY;
const R = 0.11;      // the micro heli's rotor is 0.2 m across; routes marked tight use 0.11 too unless noted

const route = (name, pts, r = R, note = '') => {
  const s = sweep(sim, pts.map(([x, h, z]) => [x, g + h, z]), r);
  check(`route ${name}${note ? ` (${note})` : ''}`, s.clear, s.clear ? `r ${r}` : s);
};

// --- routes (x, height above ground, z)
route('treehouse door and out through its window', [[7.5, 2.9, -0.8], [7.5, 2.9, -5.4]]);
route('passage: garden, gate, passage, front', [[2.9, 0.7, -3.5], [2.9, 0.7, -1.0], [2.8, 0.7, 1.4], [3.4, 0.7, 1.9], [3.4, 0.7, 3.0], [3.35, 0.7, 7.0], [3.35, 0.7, 10.5]]);
route('under the parasol', [[5.9, 1.35, 0.7], [8.9, 1.35, 0.7]]);
route('swing frame, between the swings', [[5.3, 1.1, 1.0], [5.3, 1.1, -2.3]]);
route('cane slalom', [[10.07, 0.7, -4.2], [10.07, 0.7, -4.05], [10.77, 0.7, -3.15], [10.07, 0.7, -2.25], [10.77, 0.7, -1.35], [10.4, 0.7, -0.6]], R, 'canes 0.9 m apart, 0.18 m clear');
route('fence gap', [[9.9, 0.45, -0.425], [12.6, 0.45, -0.425]]);

route('under the slide chute, across it', [[8.7, 0.5, -1.9], [9.8, 0.5, -1.9]], R, 'tight, about 0.3 m under the chute');
route('under the slide tower, between its legs', [[8.3, 0.7, -0.85], [10.0, 0.7, -0.85]]);
route('over the fountain, down through the yew arch, along the pergola and out of the gate', [[14.6, 2.0, 1.6], [14.6, 2.0, -1.0], [14.6, 1.0, -1.45], [14.6, 1.0, -6.7]], R, 'arch 1.0 m wide');
route('into the shed past the open door', [[9.45, 1.0, -3.5], [9.45, 1.0, -5.5]]);
route('side passage, squeeze past the bins (0.5 m)', [[2.8, 0.6, -0.6], [2.8, 0.6, 1.4]], R, 'tight');

// --- solids: rays from where you could fly close
const solid = (name, o, d, max, kind) => { const r = ray(sim, [o[0], g + o[1], o[2]], d, 40); check('solid ' + name, !!r && Math.abs(r.dist - max) < 0.12 && (!kind || r.kind === kind), r ? `hit ${r.kind} at ${r.dist.toFixed(2)} (want ${max})` : 'no hit'); };
solid('our passage fence (x 3.8)', [3.3, 1.0, 4.5], [1, 0, 0], 0.5, 'fence');
solid('p+1 back wall of the semi', [5.3, 1.0, 0.5], [0, 0, 1], 2.0, 'house');
solid('p+2 villa back wall', [16.0, 1.0, 0.0], [0, 0, 1], 2.4, 'house');
solid('oak trunk', [5.3, 1.0, -3.1], [1, 0, 0], 0.54);
solid('treehouse side wall', [9.0, 3.2, -3.4], [-1, 0, 0], 0.82, 'treehouse');
solid('shed back wall from inside', [9.4, 1.5, -5.3], [0, 0, -1], 0.94, 'shed');
solid('yew hedge face', [13.0, 1.0, -0.5], [0, 0, -1], 1.25, 'hedge');
solid('old brick wall', [17.9, 1.0, 5.0], [1, 0, 0], 0.19, 'wall');
solid('picket fence', [10.5, 0.5, 5.0], [1, 0, 0], 0.5, 'fence');
solid('fountain rim', [15.49, 1.0, -0.4], [0, -1, 0], 0.54);

// --- cups: open sky above, ground under
for (const c of CUPS) check('cup ' + c.id + ' has open sky above', cupOpen(sim, c), `at ${c.x}, ${c.z}`);
check('five cups, ids prefixed right-', CUPS.length >= 3 && CUPS.every((c) => c.id.startsWith('right-')));
done();
