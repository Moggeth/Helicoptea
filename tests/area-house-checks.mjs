// Headless checks for the main house (src/sim/world/house.js): its flight routes are open to a rotor-sized
// ball (radius 0.11 m unless stated), its walls, floors, shut glass and furniture are solid, every cup has open
// sky above it and a surface under it, and the dining table's tea stand has room for the pegs.
// Run: node tests/area-house-checks.mjs
import { worldSim, sweep, ray, cupOpen, checker } from './route-lib.mjs';
import { CUPS, STATIONS } from '../src/sim/world/house.js';
import { FY, FRONT_DOOR } from '../src/sim/world/plan.js';

const sim = await worldSim();
const { check, done } = checker('main house');

const route = (name, pts, r = 0.11, note = '') => {
  const s = sweep(sim, pts, r);
  check(`route: ${name} (ball r ${r}${note ? ', ' + note : ''})`, s.clear, s.clear ? '' : s);
};
const solid = (name, o, dir, expect, tol = 0.06) => {
  const h = ray(sim, o, dir, 30);
  check(`solid: ${name}`, !!h && Math.abs(h.dist - expect) < tol, h ? `hit ${h.kind}/${h.material} at ${h.dist.toFixed(3)}, expected ${expect}` : 'no hit');
};

const fy = FY, flapY = FRONT_DOOR.flap.y0 + 0.14;

// ------------------------------------------------------------------ routes
route('kitchen, hall, up the stairwell, landing, bedroom, out of the back window, over the kitchen roof', [
  [-1.45, 0.3, 1.8], [-1.45, 0.3, 2.6], [-1.12, 0.5, 3.0], [-1.12, 0.5, 7.9], [-2.0, 0.9, 7.9], [-2.0, 2.9, 7.9], [-2.0, 2.9, 3.0],
  [-1.1, 2.9, 3.0], [0.2, 2.8, 3.1], [0.9, 2.78, 2.6], [1.2, 2.76, 2.45], [1.2, 2.76, 1.5], [1.2, 3.5, 0.2], [1.2, 3.5, -2.0]]);
route('front garden, through the dog flap, into the hall', [[-1.5, flapY, 11.0], [-1.5, flapY, 8.2], [-1.12, flapY, 7.5], [-1.12, 0.3, 4.0]], 0.11, 'flap opening is 0.32 x 0.28 m');
route('the bay window, in and out (lower sash raised)', [[1.1, 0.3, 11.5], [1.1, 0.3, 7.6], [1.1, 0.3, 11.5]]);
route('kids\' room front window (casement open), in', [[1.1, 3.4, 12.0], [1.1, 3.4, 7.7], [1.1, 3.4, 11.0]]);
route('stairwell front window (casement open), in over the stairs', [[-1.28, 3.55, 11.0], [-1.28, 3.55, 7.0], [-1.9, 3.0, 6.0], [-1.9, 3.0, 3.5]]);
route('bathroom side window (top-hung), in to the landing', [[3.6, 3.35, 5.35], [2.6, 3.35, 5.35], [0.3, 3.35, 5.35], [-0.8, 3.35, 5.35]]);
route('round gable window, into the loft', [[-3.4, 5.75, RZ()], [-1.4, 5.75, RZ()]]);
route('landing, up the hatch, through the loft, out of the dormer, over the ridge, in at the roof light, back down the hatch', [
  [-1.1, 3.0, 3.2], [-1.1, 3.0, 4.85], [-1.1, 5.6, 4.85], [0.65, 5.6, 4.85], [0.65, 5.7, 3.0], [0.65, 5.7, 2.3], [0.65, 7.9, 2.3], [0.65, 7.9, 5.4],
  [1.85, 7.9, 6.85], [1.85, 5.6, 6.85], [1.85, 5.6, 4.85], [-1.1, 5.6, 4.85], [-1.1, 2.8, 4.85]]);
route('under the dining table, between the chairs', [[-0.3, -0.45, 3.5], [2.1, -0.45, 3.5]]);
route('round the chimney stack', [[2.0, 7.7, 5.0], [2.0, 7.7, 7.6], [3.4, 7.7, 7.6], [3.4, 7.7, 5.2], [2.0, 7.7, 5.2], [2.0, 7.7, 7.0]]);
route('hall to the dining room doorway and out again', [[-1.12, 0.3, 3.4], [0.2, 0.3, 3.5], [-1.12, 0.3, 3.4]]);
route('hall to the living room doorway, through the arch to the dining room', [[-1.12, 0.3, 6.9], [0.0, 0.3, 6.9], [0.9, 0.3, 6.9], [0.9, 0.3, 5.9], [1.9, 0.35, 5.2], [1.9, 0.35, 4.0]]);

// ------------------------------------------------------------------ solid
solid('the hall wall to the dining room', [-1.1, 0.8, 4.4], [1, 0, 0], 0.45);
solid('the front wall from the street', [-0.4, 0.5, 14], [0, 0, -1], 14 - 8.55, 0.05);
solid('the left gable wall from outside', [-3.2, 0.5, 5], [1, 0, 0], 0.6, 0.05);
solid('the right wall from outside', [3.4, 0.5, 5.0], [-1, 0, 0], 0.4, 0.05);
solid('the rear wall above the kitchen roof', [0.0, 3.4, -2.0], [0, 0, 1], 4.2, 0.05);
solid('the first-floor slab from below', [1.6, 0.5, 7.0], [0, 1, 0], 1.24, 0.03);
solid('the bedroom floor from above', [1.0, 3.0, 3.0], [0, -1, 0], 3.0 - 1.94, 0.03);
solid('the loft floor from the bedroom', [1.0, 3.0, 3.0], [0, 1, 0], 4.34 - 3.0, 0.03);
solid('the roof from above', [-0.2, 10, 3.5], [0, -1, 0], 10 - 5.72, 0.1);
solid('the roof from the loft', [-0.2, 5.0, 7.0], [0, 1, 0], 0.9, 0.35);
solid('the shut dining window glass', [3.6, 0.5, 3.55], [-1, 0, 0], 0.675, 0.06);
solid('the shut bay side window glass', [-0.3, 0.6, 9.2], [1, 0, -1], 0.5, 0.45);
solid('the landing window glass (shut)', [-1.9, 3.4, -1.0], [0, 0, 1], 3.2, 0.08);
solid('the closed front door leaf', [-1.8, 0.4, 11.0], [0, 0, -1], 11 - 8.525, 0.05);
solid('the sofa seat', [0.5, 1.2, 5.3], [0, -1, 0], 1.2 - (fy + 0.42), 0.08);
solid('a dining chair seat', [0.45, 1.0, 3.1], [0, -1, 0], 1.0 - (fy + 0.45), 0.05);
solid('the dining table top', [1.0, 1.0, 3.6], [0, -1, 0], 1.0, 0.04);
solid('the bed', [2.05, 4.0, 3.55], [0, -1, 0], 4.0 - (1.94 + 0.5), 0.1);
solid('the wardrobe', [0.1, 3.0, 3.0], [0, 0, 1], 1.0, 0.1);
solid('the claw-foot bath rim', [0.9, 3.5, 4.78], [0, -1, 0], 3.5 - (1.94 + 0.62), 0.08);
solid('the bunk bed top mattress', [1.4, 4.0, 6.65], [0, -1, 0], 4.0 - (1.94 + 1.2), 0.1);
solid('a stair tread', [-2.0, 1.5, 5.4], [0, -1, 0], 1.5 - (fy + 0.193 * 8), 0.06);
solid('the stair balustrade', [-1.2, 0.0, 6.9], [-1, 0, 0], 0.35, 0.1);
solid('the chimney stack', [3.5, 7.0, 6.5], [-1, 0, 0], 0.5, 0.06);
solid('the hall radiator', [-1.1, 0.0, 5.7], [1, 0, 0], 0.42, 0.06);

// ------------------------------------------------------------------ cups and the tea stand
for (const c of CUPS) {
  check(`cup ${c.id}: open sky above its opening`, cupOpen(sim, c));
  const h = ray(sim, [c.x, c.standY + 0.3, c.z], [0, -1, 0], 1);
  check(`cup ${c.id}: stands on something solid`, !!h && Math.abs(h.dist - 0.3) < 0.04, h ? `surface ${(c.standY + 0.3 - h.dist).toFixed(3)} vs standY ${c.standY.toFixed(3)}` : 'nothing under it');
}
for (const S of STATIONS) {
  const h = ray(sim, [S.x, S.y + 0.4, S.z + 0.1], [0, -1, 0], 1);
  check('tea stand on the dining table: the table is under it', !!h && Math.abs(h.dist - 0.4) < 0.03, h ? `table top ${(S.y + 0.4 - h.dist).toFixed(3)} vs ${S.y}` : 'none');
  const s = sweep(sim, [[S.x, S.y + S.pegY, S.z + 0.1], [S.x, S.y + S.pegY, S.z + 0.47]], 0.03);
  check('tea stand: 0.4 m clear on its +z side at peg height', s.clear, s.clear ? '' : s);
  const up = sweep(sim, [[S.x, S.y + 0.3, S.z + 0.1], [S.x, S.y + 1.3, S.z + 0.1]], 0.05);
  check('tea stand: open air above its pegs for a bag', up.clear, up.clear ? '' : up);
}

function RZ() { return 5.375; }
done();
