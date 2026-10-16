// Headless checks for the left neighbours' area (src/sim/world/left.js): every flight route is swept with a ball
// the size of the micro heli's rotor disc, key solids are ray-checked, and every cup is open to the sky.
// Run: node tests/area-left-checks.mjs
import { worldSim, sweep, ray, cupOpen, checker } from './route-lib.mjs';
import { FY } from '../src/sim/world/plan.js';
import { CUPS, STATIONS } from '../src/sim/world/left.js';

const { check, done } = checker('left area');
const sim = await worldSim();
// Points are [x, height above the ground, z].
const P = (x, h, z) => [x, FY + h, z];
const route = (name, pts, r = 0.11, note = '') => {
  const res = sweep(sim, pts.map((p) => P(...p)), r);
  check(`route: ${name} (ball r ${r}${note ? ', ' + note : ''})`, res.clear, res.clear ? '' : res);
};
// A route must also be blocked where it should be: a sweep through a solid fails.
const blocked = (name, pts, r = 0.11) => {
  const res = sweep(sim, pts.map((p) => P(...p)), r);
  check(`blocked: ${name}`, !res.clear, res.clear ? 'passed through' : `${res.kind} at ${res.at}`);
};
const hit = (name, o, dir, kind, dMin, dMax) => {
  const r = ray(sim, [o[0], FY + o[1], o[2]], dir, 30);
  const ok = !!r && (!kind || r.kind === kind) && r.dist >= dMin && r.dist <= dMax;
  check(`ray: ${name}`, ok, r ? `${r.kind} ${r.material} at ${r.dist.toFixed(2)} m` : 'no hit');
};
const miss = (name, o, dir, within) => {
  const r = ray(sim, [o[0], FY + o[1], o[2]], dir, within);
  check(`ray open: ${name}`, !r, r ? `${r.kind} at ${r.dist.toFixed(2)} m` : '');
};

// ---------------------------------------------------------------- routes (medium 0.5 m and up unless noted)
// 1. Fence-hole slalom: through the 0.3 m gap of three missing boards in the p-1 | p-2 fence, weave the nettles,
//    brambles and the old bath, and over the collapsed length of the old brick wall into the strip.
route('fence-hole slalom', [[-9.3, 0.45, -1.15], [-10.2, 0.45, -1.15], [-11.2, 0.45, -1.15], [-12.0, 0.45, -1.0], [-12.7, 0.5, -1.15], [-13.4, 0.5, -1.2], [-14.6, 0.5, -1.3], [-15.4, 0.6, -1.0], [-16.4, 0.95, -1.7], [-17.3, 0.95, -2.15], [-18.4, 0.95, -2.15]], 0.11, 'tight 0.3 m at the hole');
blocked('fence beside the hole', [[-9.3, 0.45, -0.6], [-11.5, 0.45, -0.6]]);
blocked('fence shifted 0.2 m into the boards', [[-9.3, 0.45, -1.4], [-11.5, 0.45, -1.4]]);
// 2. Greenhouse: in the open end, down the aisle, up out of the roof vent.
route('greenhouse fly-through (door in, vent out)', [[-6.6, 1.2, -5.0], [-7.6, 1.2, -5.0], [-9.4, 1.2, -5.0], [-9.4, 1.3, -4.48], [-9.4, 2.9, -4.48], [-9.4, 3.2, -3.4]], 0.11, 'door 0.7 m, vent 0.8 m');
blocked('greenhouse roof beside the vent', [[-8.7, 1.3, -4.48], [-8.7, 2.9, -4.48]]);
blocked('greenhouse side glass', [[-9.0, 1.2, -3.2], [-9.0, 1.2, -4.6]]);
// 3. Caravan: in at the open door, across the aisle, out of the propped window.
route('caravan fly-through (door in, window out)', [[-15.5, 1.4, -1.6], [-15.5, 1.4, -2.6], [-15.5, 1.5, -3.3], [-14.0, 1.57, -3.4], [-14.0, 1.57, -4.4], [-14.0, 1.57, -5.3]], 0.11, 'door 0.7 m, window gap 0.5 m');
blocked('caravan wall beside the door', [[-16.4, 1.4, -1.6], [-16.4, 1.4, -3.3]]);
// 4. Our side passage run: from our tea garden out through the open gate at the kitchen corner, down the passage, out the front.
route('side passage run (garden, gate, passage, front)', [[-2.9, 1.3, -3.4], [-2.96, 1.3, -1.8], [-3.0, 1.3, 0.5], [-3.0, 1.3, 4.0], [-3.0, 1.3, 7.5], [-3.0, 1.3, 9.6]], 0.11, 'gate 0.88 m');
route('side passage, low through the gate to the bins', [[-2.96, 0.6, -1.4], [-2.96, 0.6, -1.0], [-2.96, 0.6, 2.4]], 0.11, 'gate 0.88 m');
blocked('passage bins block the low run', [[-3.1, 0.5, 2.6], [-3.1, 0.5, 4.2]]);
// 5. Under the swing seat (seat base 0.42 m off the ground).
route('under the swing seat', [[-4.75, 0.24, -3.8], [-4.75, 0.24, -5.2], [-4.75, 0.24, -6.0]], 0.11, 'gap 0.42 m');
blocked('swing seat itself', [[-4.75, 0.5, -3.8], [-4.75, 0.5, -5.2]]);
// 6. Between the washing: through two gaps of the rotary line.
route('between the washing', [[-6.75, 1.15, -4.9], [-6.8, 1.15, -3.9], [-6.9, 1.15, -2.3], [-6.9, 1.15, -1.6]], 0.11, 'gaps 0.5 m');
blocked('through a hanging sheet', [[-8.5, 1.15, -3.1], [-7.1, 1.15, -3.1], [-5.8, 1.15, -3.1]]);
// 7. Round the conservatory: over the patio, along its front, down the rockery side.
route('round the conservatory', [[-4.6, 1.25, 1.6], [-4.6, 1.25, -0.45], [-9.45, 1.25, -0.45], [-9.45, 1.25, 1.9]], 0.11, 'corridor 0.5 m by the rockery');
// 8. Conservatory fly-through: down through the open roof vent, out of the French door onto the patio.
route('conservatory fly-through (vent in, French door out)', [[-8.0, 3.8, 1.0], [-8.0, 1.3, 1.0], [-7.0, 1.3, 1.25], [-5.4, 1.3, 1.25]], 0.11, 'vent 0.75 m, door 0.9 m');
blocked('conservatory glass front', [[-7.5, 1.3, -1.0], [-7.5, 1.3, 0.8]]);
// 9. Trampoline net: in at the entrance, over the mat, up and out of the open top.
route('trampoline net entrance and out over the top', [[-4.85, 1.5, 0.3], [-4.85, 1.5, -1.2], [-4.85, 1.6, -2.0], [-4.85, 3.2, -2.0]], 0.11, 'entrance 0.9 m');
blocked('trampoline net away from the entrance', [[-4.85, 1.5, -5.0], [-4.85, 1.5, -2.5]]);
// 10. The back gate of p-1 onto the lane (a gate ajar), and the old wall's collapsed length.
route('p-1 back gate to the lane', [[-6.85, 1.0, -4.8], [-6.85, 1.0, -6.4], [-6.85, 1.0, -7.4]], 0.11, 'gate 1.0 m');
blocked('p-1 back fence beside the gate', [[-8.5, 1.0, -5.0], [-8.5, 1.0, -7.0]]);

// ---------------------------------------------------------------- key solids
hit('house p-1 front wall', [-7.0, 1.0, 12.0], [0, 0, -1], 'house', 3.0, 3.6);
hit('house p-2 front wall', [-15.5, 1.0, 12.0], [0, 0, -1], null, 2.0, 4.0);
hit('p-1 roof from above', [-7.2, 12, 5.5], [0, -1, 0], 'roof', 3.0, 6.0);
hit('p-2 roof from above', [-14.2, 12, 5.5], [0, -1, 0], null, 3.0, 6.5);
hit('our passage fence from the passage', [-3.0, 0.6, 2.0], [-1, 0, 0], 'fence', 0.3, 0.45);
hit('between-fence from p-1', [-8.0, 0.6, -3.5], [-1, 0, 0], null, 2.0, 7.0);
hit('old brick wall', [-17.2, 0.6, -0.8], [-1, 0, 0], 'wall', 0.4, 0.55);
hit('trampoline mat from above', [-4.85, 6, -2.0], [0, -1, 0], 'trampoline', 5.1, 5.25);
hit('swing canopy from above', [-4.75, 6, -5.15], [0, -1, 0], 'swing', 3.5, 4.5);
hit('koi pond water from above', [-9.6, 4, -2.35], [0, -1, 0], 'pond', 3.85, 3.95);
hit('conservatory roof from above', [-6.6, 8, 0.6], [0, -1, 0], 'conservatory', 4.4, 6.0);
hit('greenhouse roof from above', [-9.0, 8, -4.5], [0, -1, 0], 'greenhouse', 5.0, 7.5);
hit('caravan roof from above', [-14.0, 8, -3.5], [0, -1, 0], 'caravan', 4.5, 6.0);
hit('bath rim end', [-14.8, 1.0, -0.35], [0, -1, 0], 'bath', 0.3, 0.5);
miss('conservatory vent from above', [-8.0, 6, 1.0], [0, -1, 0], 5.0);
miss('greenhouse vent from above', [-9.4, 6, -4.48], [0, -1, 0], 4.5);
miss('caravan window outwards', [-14.0, 1.6, -4.0], [0, 0, -1], 1.7);

// ---------------------------------------------------------------- cups and the tea stand
for (const c of CUPS) {
  const live = sim.cups.find((x) => x.id === c.id);
  check(`cup ${c.id} exists in the sim`, !!live);
  check(`cup ${c.id} is open to the sky`, cupOpen(sim, c));
  const under = ray(sim, [c.x + c.rOut * 0.8, c.baseY - 0.012 + (c.saucer ? 0.0 : 0.0), c.z], [0, -1, 0], 0.5);
  check(`cup ${c.id} stands on something`, !!under && under.dist < 0.05, under ? `${under.kind} ${under.material} ${under.dist.toFixed(3)}` : 'nothing below');
}
for (const S of STATIONS) {
  const live = sim.pegs.some((p) => Math.abs(p.tip.x - (S.x + S.pegXs[0])) < 0.1 && Math.abs(p.tip.z - (S.z + S.pegReach)) < 0.1);
  check('tea stand pegs exist in the sim', live);
  const out = sweep(sim, [[S.x, S.y + S.pegY, S.z + 0.12], [S.x, S.y + S.pegY, S.z + 0.45]], 0.03);
  check('tea stand has 0.4 m clear on its +z side', out.clear, out.clear ? '' : out);
  const under = ray(sim, [S.x, S.y + 0.2, S.z], [0, -1, 0], 0.5);
  check('tea stand stands on the table', !!under && under.dist < 0.21, under ? `${under.kind} at ${under.dist.toFixed(3)}` : 'nothing below');
}
done();
