// Headless checks for the street area (front gardens, street, parade and tea room).
// Sweeps every flight route with a ball the size of the rotor disc (r 0.11; the phone box needs 0.09: its door
// is 0.75 m wide), ray-checks key solids, and checks every street cup and the tea stand.
// Run: node tests/area-street-checks.mjs
import { worldSim, sweep, ray, cupOpen, checker } from './route-lib.mjs';
import { FY } from '../src/sim/world/plan.js';
import * as S from '../src/sim/world/street.js';

const { check, done } = checker('street');
const sim = await worldSim();
const route = (name, pts, r = 0.11, note = '') => { const s = sweep(sim, pts, r); check(`route: ${name} (r ${r}${note ? ', ' + note : ''})`, s.clear, s.clear ? '' : s); };

// 1. Down the street weaving lamp posts and parked cars (easy, 1 m up, over the low cars, round the tall ones).
route('street slalom', [[-18.5, 1.45, 17.0], [-14.6, 1.45, 14.75], [-13, 1.45, 17.5], [-11, 1.45, 19.5], [-9.8, 1.45, 14.75], [-6.5, 1.45, 17.2], [-1, 1.45, 17.5], [3.6, 1.45, 14.75], [8, 1.45, 17.3], [11.5, 1.45, 19.5], [12.5, 1.45, 17.3], [17.2, 1.45, 14.75], [18.4, 1.45, 19.9]], 0.11, 'easy');
// 2. Threading the telegraph wires: along the span between two columns of wires, then past the pole between its crossarms.
{
  const [a, b] = [S.POLES[0], S.POLES[1]], pts = [], zc = a.z - 0.4;
  const ymid = FY + (S.POLE.armY[0] + S.POLE.armY[1]) / 2;
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([a.x + 0.6 + (b.x - a.x - 1.2) * t, ymid - S.POLE.sag * 4 * t * (1 - t), zc]); }
  route('wires: along the span between two columns', pts, 0.11, 'tight');
  route('wires: through the pole, between its two crossarms', [[b.x - 1.5, ymid - 0.0, zc], [b.x + 1.5, ymid, zc]], 0.11, 'tight');
  route('wires: under the lowest, over the street', [[-10, FY + 3.5, 17.5], [10, FY + 3.5, 17.5]], 0.11, 'easy');
}
// 3. Under the bus shelter roof and out the other open end.
route('bus shelter: in one end, out the other', [[-8.5, 0.44, 13.95], [-4.7, 0.44, 13.95], [-1.5, 0.44, 13.95]], 0.11, 'medium');
// 4. Into the phone box through its open door and out again.
{
  const P = S.PHONE, y = FY + 0.8;
  route('phone box: in through the open door and out', [[P.x - 2.5, y, P.z], [P.x - 0.3, y, P.z], [P.x + 0.05, y, P.z], [P.x - 0.3, y, P.z], [P.x - 2.5, y, P.z]], 0.09, 'tight, 0.75 m door');
}
// 5. Into the tea room by its open front door and out the back, then up over the yard.
{
  const y = -0.2;
  route('tea room: front door, past the tables, out the back door, up over the yard',
    [[-1.7, y, 21.5], [-1.7, y, 24.4], [-2.0, y, 25.6], [-3.4, y, 28.2], [-3.95, y, 29.1], [-3.95, y, 30.2], [-3.95, 1.6, 30.2], [-3.95, 1.6, 31.3]], 0.11, 'tight at the doors (1.0 m)');
  route('tea room: in at the front door, out the open back window', [[-1.7, y, 21.5], [-1.7, y, 25.6], [-3.0, y, 26.6], [-3.4, 0.8, 28.4], [-5.6, 0.8, 28.9], [-5.6, 0.8, 30.4]], 0.11, 'medium');
}
// 6. A hop along the front gardens: in at a gate, over the walls, out at the next gate.
route('front gardens: gates and walls', [[-14.6, -0.26, 14.0], [-14.6, -0.26, 10.8], [-14.6, 0.8, 10.8], [-7.4, 0.8, 13.8], [-7.4, -0.26, 13.8], [-7.4, -0.26, 10.2], [-7.4, 1.4, 10.2], [-1.5, 1.4, 13.8], [-1.5, -0.26, 13.8], [-1.5, -0.26, 9.9]], 0.11, 'medium at the gates');
route('front gardens: the drive gate', [[9.5, -0.2, 14.5], [9.5, 1.0, 13.2], [9.5, 1.0, 12.3]], 0.11, 'easy');
// 7. Up and over the parade roofs, weaving past the chimney stacks.
route('parade roofs and chimneys', [[-17, 8.4, 26.6], [-15.5, 8.4, 26.6], [-14.8, 7.9, 28.3], [-9.8, 7.9, 28.3], [-9.8, 8.4, 26.6], [-9.2, 7.9, 25.0], [-2.1, 7.9, 25.0], [-2.1, 8.4, 26.6], [-1.6, 7.9, 28.3], [6.8, 7.9, 28.3], [6.8, 8.4, 26.6], [7.4, 7.9, 25.0], [13.1, 7.9, 25.0], [13.1, 8.4, 26.6], [13.6, 7.9, 28.3], [18, 7.9, 28.3]], 0.11, 'easy');
route('over the forecourt tables', [[-6, 0.6, 22.0], [2, 0.6, 22.0]], 0.11, 'easy');

// Solids: rays that must hit what is drawn.
const hit = (name, o, d, max, kind) => { const r = ray(sim, o, d, max); check(`solid: ${name}`, !!r && (!kind || r.kind === kind), r || 'nothing hit'); };
hit('front garden wall from the street', [-12, FY + 0.3, 14.0], [0, 0, -1], 3, 'wall');
hit('pillar box top', [S.PILLAR.x + 0.17, 3, S.PILLAR.z], [0, -1, 0], 6, 'pillarbox');
hit('bus shelter roof', [-5.7, 3, 13.9], [0, -1, 0], 6, 'shelter');
hit('bus shelter glass back', [-4.7, 0.2, 14.0], [0, 0, -1], 3, 'shelter');
hit('phone box glass side', [S.PHONE.x, 0.2, S.PHONE.z + 2], [0, 0, -1], 4, 'phonebox');
hit('phone box roof', [S.PHONE.x, 3, S.PHONE.z], [0, -1, 0], 6, 'phonebox');
hit('Land Rover roof', [S.CARS[0].x + 0.5, 3, S.CARS[0].z], [0, -1, 0], 6, 'car');
hit('milk float crates', [S.CARS[1].x + 0.9, 3, S.CARS[1].z], [0, -1, 0], 6);
hit('lamp post', [-14.6, 1.0, 12], [0, 0, 1], 5, 'lamp');
hit('telegraph pole', [S.POLES[1].x, 1.0, 12], [0, 0, 1], 5, 'pole');
hit('a wire', [S.POLES[0].x + 3, 8, S.POLES[0].z - 0.8], [0, -1, 0], 6, 'wire');
hit('tea room bay glass', [-4.5, 0.3, 22.0], [0, 0, 1], 3, 'tearoom');
hit('tea room counter from inside', [1.0, -0.1, 24.5], [0, 0, 1], 4, 'counter');
hit('greengrocer front', [-10, 3.0, 21.5], [0, 0, 1], 4, 'shop');
hit('terrace roof', [-9.8, 12, 26], [0, -1, 0], 14, 'roof');
hit('chimney stack', [-12.8, 8, 20], [0, 0, 1], 12, 'chimney');
hit('yard wall', [-4, 0.2, 30.5], [0, 0, 1], 3, 'yardwall');
hit('bench under the bay window', [1.2, 0.8, 9.7], [0, -1, 0], 3, 'bench');
hit('bird table', [S.BIRD_TABLE.x, 2, S.BIRD_TABLE.z], [0, -1, 0], 5, 'birdtable');

// Cups: open sky above the opening, something solid under it.
for (const cup of sim.cups.filter((c) => c.id.startsWith('street-'))) {
  check(`cup ${cup.id} has open sky above it`, cupOpen(sim, cup));
  const below = ray(sim, [cup.x, cup.standY + 0.02, cup.z], [0, -1, 0], 1);
  check(`cup ${cup.id} stands on something`, !!below && below.dist < 0.05, below || 'nothing below');
}
// The tea stand on the forecourt table: 0.4 m clear on its +z side, and a table under it.
{
  const T = S.STAND;
  const s = sweep(sim, [[T.x, T.y + 0.25, T.z + 0.12], [T.x, T.y + 0.25, T.z + 0.46]], 0.05);
  check('tea stand: 0.4 m clear on its +z side', s.clear, s);
  const u = sweep(sim, [[T.x, T.y + 1.2, T.z], [T.x, T.y + 0.5, T.z]], 0.1);
  check('tea stand: open sky above it', u.clear, u);
  const below = ray(sim, [T.x, T.y + 0.02, T.z], [0, -1, 0], 1);
  check('tea stand: table under it', !!below && below.dist < 0.05, below || 'nothing below');
  check('tea stand registered', sim.pegs.some((p) => Math.abs(p.tip.x - T.x) < 0.2 && Math.abs(p.tip.z - T.z) < 0.2));
}
done();
