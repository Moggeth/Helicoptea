// Headless checks for the tea bag and its string, on all three aircraft: the drawn string stays tied on at
// both ends, straight and at its real length while it carries the bag (it used to fold down over the bag
// and run 15-40% long), sags when slack without passing through the bag, a bag lifted straight off its peg
// does not snag under it, and a spun bag winds its string up, swings back and settles.
// Usage: node tests/bag-checks.mjs
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { CFG } from '../src/config.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f = (x, d = 1) => Number(x).toFixed(d);
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const H = CFG.cargo.bagHalf;
const _u = new THREE.Vector3(), _iq = new THREE.Quaternion(), _p = new THREE.Vector3();

// What the drawn string looks like against the rope that holds the bag.
function stringShape(b) {
  const s = b.str, N = b.N;
  let len = 0, fold = 0, inside = 0, sag = 0;
  for (let i = 0; i < N; i++) len += Math.hypot(s[i * 3 + 3] - s[i * 3], s[i * 3 + 4] - s[i * 3 + 1], s[i * 3 + 5] - s[i * 3 + 2]);
  _u.set(0, 1, 0).applyQuaternion(b.quat);
  _iq.copy(b.quat).invert();
  const ax = s[0], ay = s[1], az = s[2], ex = s[N * 3], ey = s[N * 3 + 1], ez = s[N * 3 + 2];
  const cl = Math.hypot(ex - ax, ey - ay, ez - az) || 1e-9;
  for (let i = 1; i <= N; i++) {
    const dx = s[i * 3] - b.anchorWorld.x, dy = s[i * 3 + 1] - b.anchorWorld.y, dz = s[i * 3 + 2] - b.anchorWorld.z;
    fold = Math.max(fold, -(dx * _u.x + dy * _u.y + dz * _u.z));                       // hanging below the tie point
    _p.set(s[i * 3] - b.pos.x, s[i * 3 + 1] - b.pos.y, s[i * 3 + 2] - b.pos.z).applyQuaternion(_iq);
    if (Math.abs(_p.x) < H[0] - 0.0005 && Math.abs(_p.y) < H[1] - 0.0005 && Math.abs(_p.z) < H[2] - 0.0005) inside++;
    const px = s[i * 3] - ax, py = s[i * 3 + 1] - ay, pz = s[i * 3 + 2] - az;
    const t = (px * (ex - ax) + py * (ey - ay) + pz * (ez - az)) / (cl * cl);
    sag = Math.max(sag, Math.hypot(px - t * (ex - ax), py - t * (ey - ay), pz - t * (ez - az)));
  }
  const start = Math.hypot(ax - b.anchorWorld.x, ay - b.anchorWorld.y, az - b.anchorWorld.z);
  const e = b.attach ? b.attach.endWorld() : null;
  const end = e ? Math.hypot(ex - e.x, ey - e.y, ez - e.z) : 0;
  return { ratio: len / (b.attach ? b.attach.length : b.ropeLength), fold, inside, sag, start, end };
}

for (const id of ['micro', 'chinook', 'skycrane']) {
  const sim = new Sim();
  if (id !== 'micro') sim.setAircraft(id);
  const ap = new Autopilot();
  let watch = null;
  const runS = (secs, fn) => { for (let i = 0, n = Math.round(secs / sim.dt); i < n; i++) { sim.step(sim.heli ? fn() : zero()); if (watch && sim.carriedBag() && sim.carriedBag().strPhase) watch(); } };   // right after the string steps (half rate)
  const hookTo = (x, y, z, secs, speed) => runS(secs, () => {
    const o = sim.heli.pos.clone().sub(sim.heli.hookWorlds[0]);
    ap.target.set(x + o.x, y + o.y, z + o.z); ap.maxSpeed = speed;
    return ap.update(sim.heli);
  });
  const peg = sim.pegs[1];
  hookTo(sim.heli.pos.x, 0.4, sim.heli.pos.z, 3, 0.3);
  hookTo(peg.tip.x, 0.4, peg.tip.z, 6, 0.3);
  hookTo(peg.tip.x, peg.tip.y + 0.004, peg.tip.z, 5, 0.12);
  if (!sim.attachCandidateInfo()) { check(`${id}: reaches a bag loop`, false, `state ${sim.state}`); continue; }
  sim.toggleAttach();
  const bag = sim.carriedBag();
  // Straight up off the peg: the bag must pass its peg, not wedge under it and drag the aircraft down.
  hookTo(peg.tip.x, peg.tip.y + 0.3, peg.tip.z, 5, 0.1);
  check(`${id}: a bag lifted straight up off its peg comes away cleanly`, sim.state === 'flying' && sim.carriedBag() === bag && bag.pos.y > peg.tip.y + 0.06,
    `state ${sim.state}, bag y ${f(bag.pos.y, 3)} vs peg ${f(peg.tip.y, 3)}`);
  if (sim.state !== 'flying') continue;
  // Carry it across the table and hover: the string is the rope, drawn.
  let worst = { ratio: 0, fold: 0, inside: 0, sag: 0, start: 0, end: 0 };
  watch = () => { const s = stringShape(bag); for (const k in worst) worst[k] = Math.max(worst[k], s[k]); };
  hookTo(0.0, 0.5, -0.3, 6, 0.3);
  hookTo(0.0, 0.5, -0.3, 2, 0.3);
  watch = null;
  check(`${id}: carried string keeps its real length (no stretch)`, worst.ratio < 1.01, `drawn/rope ${f(worst.ratio, 3)}`);
  check(`${id}: carried string never folds down past the bag's tie point`, worst.fold < 0.001, `${f(worst.fold * 1000)} mm`);
  check(`${id}: carried string never passes through the bag`, worst.inside === 0, `${worst.inside} points inside`);
  check(`${id}: string tied on at both ends`, worst.start < 0.0005 && worst.end < 0.005, `bag end ${f(worst.start * 1000, 2)} mm, hook end ${f(worst.end * 1000, 2)} mm (string steps at half rate)`);
  const taut = stringShape(bag);
  check(`${id}: a taut string is drawn straight`, taut.sag < 0.0005, `sag ${f(taut.sag * 1000, 2)} mm`);
  // Drop the aircraft a little faster than the bag can fall: the rope goes slack and the string sags.
  let maxSag = 0, inside = 0;
  watch = () => { const s = stringShape(bag); maxSag = Math.max(maxSag, s.sag); inside += s.inside; };
  { const v = bag.body.linvel(); bag.body.setLinvel({ x: v.x, y: v.y + 0.9, z: v.z }, true); }   // a bump tosses the bag up
  runS(0.25, () => ap.update(sim.heli));
  watch = null;
  check(`${id}: a slack string sags (and still keeps out of the bag)`, maxSag > 0.004 && inside === 0, `sag ${f(maxSag * 1000)} mm, ${inside} points inside`);
  hookTo(0.0, 0.5, -0.3, 4, 0.3);
  // Spin the hanging bag about its string: it winds up, turns back and settles.
  bag.body.setAngvel({ x: 0, y: 12, z: 0 }, true);
  let tw = [], wy = [];
  watch = () => { tw.push(bag.twist || 0); wy.push(bag.body.angvel().y); };
  hookTo(0.0, 0.5, -0.3, 7, 0.3);
  watch = null;
  const peak = Math.max(...tw.map(Math.abs));
  let reversals = 0, sgn = 0;
  for (const w of wy) if (Math.abs(w) > 0.3) { const s = Math.sign(w); if (sgn && s !== sgn) reversals++; sgn = s; }
  const late = Math.max(...wy.slice(-240).map(Math.abs));
  check(`${id}: a spun bag winds its string up and swings back`, peak > 1 && reversals >= 2, `wound ${f(peak, 2)} rad, ${reversals} reversals`);
  check(`${id}: and settles instead of spinning on`, late < 1.0, `last second |ω| ≤ ${f(late, 2)} rad/s`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} bag checks passed`);
process.exit(failed.length ? 1 : 0);
