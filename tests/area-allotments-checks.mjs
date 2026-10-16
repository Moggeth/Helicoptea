// Headless checks for the back lane and the allotments (src/sim/world/allotments.js): every flight route is
// swept with a rotor-sized ball, key solids are ray-checked, and every cup is open to the sky and stands on
// something solid. Run: node tests/area-allotments-checks.mjs
import { worldSim, sweep, ray, cupOpen, checker } from './route-lib.mjs';
import { CUPS } from '../src/sim/layout.js';
import { FY } from '../src/sim/world/plan.js';
import { Y, SL, SUNFLOWERS, SHEDS, FIELD_GATE, PT, BT, STILE, HUT, TEA_STAND, GATE, SCARECROW, SHED_ROOF_B, Fr, PARK_HEDGE } from '../src/sim/world/allotments.js';

const { check, done } = checker('allotments');
const sim = await worldSim();
const P = (x, h, z) => [x, Y(h), z];
const R = 0.11;

const route = (name, pts, r = R, note = '') => {
  const s = sweep(sim, pts, r);
  check(`route: ${name} (ball r ${r})${note ? ' ' + note : ''}`, s.clear, s.clear ? `${pts.length} points` : s);
};

// 1. Out of our garden's back gate (0.7 m gap, honeysuckle arch overhead, open gate leaf beside it).
route('out of our back gate', [P(1.9, 0.7, -4.6), P(1.9, 0.7, -6.15), P(1.9, 0.7, -7.6)]);
route('across the lane to the field gate', [P(1.9, 0.7, -7.6), P(2.6, 0.9, -8.2), P(3.3, 1.02, -8.8)]);
// 2. Between the field gate's bars (gap 0.256 m between the 3rd and 4th bar), tight: ball r 0.11 passes with 1.5 cm.
route('between the field gate bars', [P(3.3, 1.02, -8.8), P(3.3, 1.02, -9.5), P(3.3, 1.02, -10.6)], R, '(tight)');
// 3. Through the polytunnel (open doors at both ends, tomatoes either side).
route('through the polytunnel', [P(3.3, 1.02, -10.6), P(3.0, 1.0, -12.6), P(PT.x1 + 0.3, 1.0, PT.zc), P(PT.x0 - 0.4, 1.0, PT.zc)]);
// 4. Through the runner-bean tunnel.
route('through the bean tunnel', [P(PT.x0 - 0.4, 1.0, PT.zc), P(BT.x1 + 0.6, 1.1, BT.zc), P(BT.x0 - 0.6, 1.1, BT.zc)]);
// 5. The sunflower slalom.
{
  const pts = [P(SL.x0 - 0.9, 1.08, SL.zc)];
  SUNFLOWERS.filter((s) => s.slalom).forEach((s) => pts.push(P(s.x, 1.08, SL.zc + (s.z < SL.zc ? 1 : -1) * 0.28)));
  pts.push(P(SL.x0 + (SL.n - 1) * SL.step + 0.9, 1.08, SL.zc));
  route('sunflower slalom', pts);
  const straight = sweep(sim, [P(SL.x0 - 0.9, 1.08, SL.zc), P(SL.x0 + (SL.n - 1) * SL.step + 0.9, 1.08, SL.zc)], R);
  check('slalom is a real slalom (the straight line is blocked)', !straight.clear, straight);
}
// 6. In at a shed's door and out of its window (shed C).
{
  const S = SHEDS.C, F = new Fr(S.x, S.z, S.yaw);
  const a = F.p(0, S.d / 2 + 1.2), b = F.p(0, S.d / 2), c = F.p(0, -S.d / 2), d = F.p(0, -S.d / 2 - 1.0);
  route('in the shed door and out of its window', [P(a[0], 1.12, a[1]), P(b[0], 1.12, b[1]), P(c[0], 1.12, c[1]), P(d[0], 1.12, d[1])], R, '(tight window)');
  const blocked = sweep(sim, [P(a[0], 1.9, a[1]), P(d[0], 1.9, d[1])], R);
  check('shed C is solid above its door (the roof stops you)', !blocked.clear, blocked);
  const side = F.p(1.0, 1.4);
  const rr = ray(sim, P(side[0], 1.2, side[1]), [Math.sin(S.yaw) * -1, 0, 0], 4);
  void rr;
}
// 7. Over the shed roofs.
route('over the shed roofs', [P(-4.6, 3.0, -17.6), P(-2.0, 3.0, -17.6), P(1.2, 3.1, -17.4), P(4.0, 3.1, -17.6), P(8.5, 3.6, -17.9), P(10.5, 3.2, -17.9)]);
// 8. Over the stile into the park.
route('over the stile into the park', [P(10.5, 3.2, -17.9), P(4.0, 2.4, -21.0), P(STILE.x, 1.5, -23.2), P(STILE.x, 1.5, STILE.z), P(STILE.x, 1.6, -26.5)]);
{
  const low = sweep(sim, [P(STILE.x, 0.7, -22.6), P(STILE.x, 0.7, -25.6)], R);
  check('the stile rail stops a low flight', !low.clear, low);
  const hedge = sweep(sim, [P(1.0, 1.0, -22.6), P(1.0, 1.0, -25.6)], R);
  check('the park hedge is solid away from the stile gap', !hedge.clear, hedge);
}

// Solids you can see: gate bars, the shut fence, the hut, sheds, tunnel skin, nets.
const hit = (name, o, d, max, kindIs) => {
  const r = ray(sim, o, d, max);
  check(`solid: ${name}`, !!r && (!kindIs || kindIs.includes(r.kind)), r);
};
hit('gate bar (lowest)', P(3.3, 0.22, -8.0), [0, 0, -1], 3, ['gate']);
hit('gate bar (top)', P(3.3, 1.5, -8.0), [0, 0, -1], 3, ['gate']);
hit('chain-link fence', P(-10, 0.8, -8.0), [0, 0, -1], 3, ['chainlink']);
hit('post-and-rail fence rail', P(14, 0.3, -8.5), [0, 0, -1], 3);
hit('our open gate leaf', P(0.5, 0.6, -6.8), [1, 0, 0], 3, ['gate']);
hit('honeysuckle arch beam', P(1.9, 3.0, -6.15), [0, -1, 0], 2, ['arch', 'honeysuckle']);
hit('polytunnel skin (from above)', P(-1, 4, PT.zc), [0, -1, 0], 4, ['polytunnel']);
hit('polytunnel end wall above the door', P(PT.x1 + 1, PT.doorH + 0.1 + 0.1, PT.zc), [-1, 0, 0], 3, ['polytunnel']);
hit('bean tunnel roof (from above)', P(-8.6, 4, BT.zc), [0, -1, 0], 4, ['beantunnel']);
hit('shed A wall', P(7.8, 1.0, -15.5), [0, 0, -1], 4, ['shed']);
hit('shed B roof (from above)', P(0.9, 4, -17.4), [0, -1, 0], 4, ['shedroof']);
hit('tea hut wall', P(8.7, 1.5, -10.0), [0, 0, -1], 5);
hit('tea hut roof', P(8.7, 5, -13.1), [0, -1, 0], 6, ['hutroof']);
hit('fruit cage net', P(-14.8, 1.0, -15.4), [0, 0, -1], 5, ['net']);
hit('scarecrow post', P(SCARECROW.x - 2, 1.0, SCARECROW.z), [1, 0, 0], 3, ['scarecrow']);
hit('lamp post', P(11.8, 2, -8.0), [0, 0, -1], 2, ['lamp']);
hit('wheelie bin', P(-14.4, 0.5, -7.5), [0, 0, -1], 2, ['bin']);
{
  // The tea stand's +z side stays open for 0.4 m.
  const s = sweep(sim, [P(TEA_STAND.x, TEA_STAND.h + 0.12, TEA_STAND.z + 0.07), P(TEA_STAND.x, TEA_STAND.h + 0.12, TEA_STAND.z + 0.45)], 0.03);
  check('tea stand: 0.4 m clear on its +z side', s.clear, s);
  const ap = sweep(sim, [P(TEA_STAND.x, TEA_STAND.h + 0.45, -10.0), P(TEA_STAND.x, TEA_STAND.h + 0.45, TEA_STAND.z + 0.3)], R);
  check('tea stand: the helicopter can approach it from the lane side', ap.clear, ap);
  const tb = ray(sim, P(TEA_STAND.x + 0.3, TEA_STAND.h + 0.3, TEA_STAND.z), [0, -1, 0], 1);
  check('tea stand stands on the veranda table', !!tb && Math.abs(tb.dist - 0.3) < 0.02, tb);
}

// Cups: open sky above, and a solid surface at the stated height.
for (const c of CUPS.filter((c) => c.id.startsWith('allot-'))) {
  const open = cupOpen(sim, c);
  check(`cup ${c.id}: open to the sky above`, open);
  const want = c.standY + (c.saucer ? 0.008 : 0), off = c.saucer ? 0.065 : c.rOut + 0.025;
  const ok = [[off, 0], [-off, 0], [0, off], [0, -off]].some(([dx, dz]) => {
    const r = ray(sim, [c.x + dx, c.standY + 0.25, c.z + dz], [0, -1, 0], 1);
    return r && r.kind !== 'cup' && Math.abs(c.standY + 0.25 - r.dist - want) < 0.012;
  });
  check(`cup ${c.id}: stands on something solid at y ${c.standY.toFixed(3)}`, ok);
}
{
  // The shed cup is reachable through the open door: a bag-sized ball goes in and gets above the cup.
  const c = CUPS.find((q) => q.id === 'allot-shed'), S = SHEDS.A;
  const inside = sweep(sim, [P(S.x, 1.3, S.z + S.d / 2 + 1.0), P(S.x, 1.3, S.z + S.d / 2), P(S.x, 1.3, c.z + 0.45), P(c.x, c.baseY + 0.25 - FY, c.z + 0.05)], 0.09);
  check('route: in at the open shed door to the shelf mug (ball r 0.09 with a bag)', inside.clear, inside);
}
done();
