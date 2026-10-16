// Headless checks for the park (src/sim/world/park.js): every flight route is open for a rotor-sized ball,
// key solids are solid, the cups are open to the sky, and the tea stand has its 0.4 m in front.
// Run: node tests/area-park-checks.mjs
import { worldSim, sweep, ray, cupOpen, checker } from './route-lib.mjs';
import { STREAM, POND, streamZ, groundHeight as G } from '../src/sim/world/plan.js';
import { PK, parkTrees, bandstandInfo, bridgeInfo, jettyInfo, swingInfo, oakSpec, kiteInfo, playInfo, slideInfo, picnicInfo, STATIONS } from '../src/sim/world/park.js';

const sim = await worldSim();
const { check, done } = checker('park');
const R = 0.11;
const route = (name, pts, r = R, note = '') => { const s = sweep(sim, pts, r); check(`route: ${name} (ball r ${r})${note ? ' ' + note : ''}`, s.clear, s.clear ? '' : s); };
const solid = (name, o, d, kind, maxD) => { const h = ray(sim, o, d, 30); check(`solid: ${name}`, !!h && (!kind || h.kind === kind) && (maxD === undefined || h.dist <= maxD), h || 'no hit'); };

// 1. A long scenic run along the stream, from the east side to the west, low over the water (medium).
{
  const pts = [];
  for (let x = 17.5; x >= -17.5; x -= 0.5) pts.push([x, STREAM.water + 0.3, streamZ(x)]);
  route('scenic run along the stream, east to west, 0.3 m over the water', pts);
}
// 2. Under the footbridge, along the water (medium).
{
  const B = PK.bridge, I = bridgeInfo(), pts = [];
  for (let x = B.x + 4; x >= B.x - 4; x -= 0.5) pts.push([x, STREAM.water + 0.25, streamZ(x)]);
  route(`under the footbridge (deck underside ${I.under.toFixed(2)}, water ${STREAM.water.toFixed(2)})`, pts, R, '(medium)');
  solid('footbridge deck from above', [B.x, I.deckTop + 2, B.z], [0, -1, 0], 'footbridge', 2.1);
  solid('footbridge rail from the side', [B.x + 3, I.deckTop + 0.97, B.z], [-1, 0, 0], 'footbridge', 3);
}
// 3. Under the jetty: in from the pond end along its axis, and across between the piles.
{
  const J = PK.jetty, I = jettyInfo();
  route('under the jetty from the pond end, along its length', [[J.x, POND.water - 0.1, J.z - J.len - 1.5], [J.x, POND.water - 0.1, J.z - 1.2]], R, '(medium)');
  route('under the jetty, across between the piles', [[J.x + 1.5, POND.water - 0.1, J.z - 1.7], [J.x - 0.8, POND.water - 0.1, J.z - 1.7]], R, '(medium)');
  solid('jetty deck from above', [J.x, I.deckTop + 2, J.z - 1.5], [0, -1, 0], 'jetty', 2.1);
}
// 4. Through the bandstand's open sides, and round its roof.
{
  const B = PK.bandstand, I = bandstandInfo();
  route('through the bandstand, open side to open side', [[B.x + 5, I.top + 1.0, B.z], [B.x - 5, I.top + 1.0, B.z]], R, '(easy)');
  const ring = [];
  for (let a = 0; a <= 360; a += 30) ring.push([B.x + 3.5 * Math.cos(a * Math.PI / 180), I.top + 3.6, B.z + 3.5 * Math.sin(a * Math.PI / 180)]);
  route('round the bandstand roof, just outside the eaves', ring, R, '(easy)');
  solid('bandstand roof from above', [B.x + 1, I.top + 7, B.z], [0, -1, 0], 'bandstand', 4);
  solid('bandstand balustrade from outside', [B.x + 1.2, I.top + 0.6, B.z - 6], [0, 0, 1], 'bandstand');
}
// 5. Slalom through the woodland row of trunks (alternating sides, 1.1 m off each trunk).
{
  const S = PK.slalom, pts = [];
  const side = (i) => (i % 2 ? 1 : -1);
  pts.push([S.x0 - 1.8, S.z]);
  for (let i = 0; i < S.n; i++) pts.push([S.x0 + i * S.dx, S.z + side(i) * 1.1]);
  pts.push([S.x0 + S.n * S.dx - 0.2, S.z]);
  const dense = [];
  for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < 4; k++) { const t = k / 4, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; dense.push([x, G(x, z) + 1.15, z]); }
  const l = pts[pts.length - 1]; dense.push([l[0], G(l[0], l[1]) + 1.15, l[1]]);
  route('woodland slalom, 6 trunks', dense, R, '(medium)');
}
// 6. Under the fallen log (crossing it near its high end).
{
  const L = PK.log, t = 0.27, x = L.a[0] + (L.b[0] - L.a[0]) * t, z = L.a[1] + (L.b[1] - L.a[1]) * t;
  const dx = L.b[0] - L.a[0], dz = L.b[1] - L.a[1], len = Math.hypot(dx, dz), px = -dz / len, pz = dx / len;
  const y = G(x, z) + 0.45;
  route('under the fallen log', [[x + px * 3, y, z + pz * 3], [x - px * 3, y, z - pz * 3]], R, '(medium)');
  solid('fallen log from above', [x, G(x, z) + 3, z], [0, -1, 0], 'log', 3);
}
// 7. Under the oak's limbs, past the rope swing.
{
  const o = oakSpec(), SW = swingInfo();
  const pts = [[-7.0, -39.2], [-5.0, -39.0], [-3.2, -39.0], [-1.5, -39.0], [0.5, -39.2]].map(([x, z]) => [x, G(x, z) + 1.4, z]);
  route('under the oak, past the rope swing (1 m off the ropes)', pts, R, '(easy)');
  solid('oak trunk', [o.x + 4, o.y + 1.5, o.z], [-1, 0, 0], 'oak', 4);
  solid('rope-swing seat from above', [SW.hang[0], SW.seatY + 1, SW.hang[2]], [0, -1, 0], 'swing', 1.1);
  solid('oak canopy from above', [o.x, o.y + 14, o.z], [0, -1, 0], 'oak', 8);
  const K = kiteInfo();
  solid('kite in the oak', [K.pos[0] + Math.cos(K.phi) * 2, K.pos[1] + 0.5, K.pos[2] + Math.sin(K.phi) * 2], [-Math.cos(K.phi), -0.2, -Math.sin(K.phi)], undefined, 4);
}
// 8. From the allotments' stile across the meadow, over the stream, to the pond.
{
  const g = PK.gate;
  const pts = [[g.x, g.z - 0.3], [1.0, -28.0], [-2.0, -31.0], [-4.5, -33.6], [-6.5, -35.6], [-8.2, -37.0]].map(([x, z]) => [x, Math.max(G(x, z), STREAM.water) + 1.6, z]);
  route("from the allotments' stile across the meadow to the pond", pts, R, '(easy)');
}
// 9. Other things that must be solid.
{
  const P = playInfo(), sl = slideInfo(), pc = picnicInfo();
  solid('play-area swing frame bar', [P.sw.x, P.sw.top + 4, P.sw.z], [0, -1, 0], undefined, 5);
  solid('climbing-frame platform', [P.cf.x, G(P.cf.x, P.cf.z) + P.cf.plat + 3, P.cf.z + 0.3], [0, -1, 0], undefined, 3.2);
  solid('slide chute', [sl.cx, sl.cy + 1, sl.cz], [0, -1, 0], 'slide', 1.2);
  solid('hamper', [pc.x - 0.2, pc.y + 1, pc.z - 0.35], [0, -1, 0], undefined, 1);
  solid('bench seat', [PK.benchFlask.x, G(PK.benchFlask.x, PK.benchFlask.z) + 1, PK.benchFlask.z], [0, -1, 0], 'bench', 2);
  const trees = parkTrees(), t = trees[0];
  solid('a wood tree trunk', [t.x + 3, t.y + 1.2, t.z], [-1, 0, 0], 'tree', 3);
  const wooded = trees.filter((q) => q.x > 7 && q.x < 19.5 && q.z < -27.5).length;
  check(`woodland has 25 to 40 trees (${wooded} in the wood, ${trees.length} with the edge and park trees)`, wooded >= 25 && wooded <= 40);
}
// 10. Cups and the tea stand.
for (const c of sim.cups.filter((q) => q.id.startsWith('park-'))) check(`cup ${c.id} open to the sky above its mouth (${c.x.toFixed(2)}, ${c.z.toFixed(2)}, y ${c.baseY.toFixed(2)})`, cupOpen(sim, c));
check('five park cups', sim.cups.filter((q) => q.id.startsWith('park-')).length === 5);
for (const S of STATIONS) {
  const s = sweep(sim, [[S.x, S.y + 0.25, S.z + 0.14], [S.x, S.y + 0.25, S.z + 0.4]], 0.03);
  check(`tea stand at (${S.x.toFixed(2)}, ${S.z.toFixed(2)}) has 0.4 m clear on +z`, s.clear, s.clear ? '' : s);
  const up = sweep(sim, [[S.x, S.y + 0.9, S.z + 0.1], [S.x, S.y + 0.3, S.z + 0.1]], 0.05);
  check('tea stand has open sky above its pegs', up.clear);
}
done();
