// Headless checks for the Chinook's biscuits (run by `npm run check`): the stand, the winch, how each kind
// crumbles in tea, the chocolate finger's snap and straw, the neighbours taking one, and that carrying biscuits
// leaves the flight model alone.
import * as THREE from 'three';
import { initPhysics, RAPIER } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { KINDS, KIND, LINE, geomOf } from '../src/sim/biscuits.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  biscuits: ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const f = (x, d = 3) => Number(x).toFixed(d);

// A crane hook (kinematic) standing in for the Chinook's, so a biscuit can be held exactly where wanted.
function crane(sim, b, at) {
  const hook = at.clone();
  const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hook.x, hook.y, hook.z).setCanSleep(false));
  const fake = { body, def: { hooks: [[0, 0, 0]] }, hookWorlds: [hook] };
  sim.detachBag(b, true);
  const a = b.anchorLocal.clone().applyQuaternion(b.quat);
  b.body.setTranslation({ x: hook.x - a.x, y: hook.y - LINE - a.y, z: hook.z - a.z }, true);
  b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  b.resting = false;
  sim.attachBag(b, { kind: 'heli', heli: fake, hook: 0 });
  // (Rapier doesn't wake a body for a kinematic one pulling on it; the Chinook never sleeps.)
  return { hook, step(ctl = zero()) { body.setNextKinematicTranslation(hook); if (b.body) b.body.wakeUp(); sim.step(ctl); } };
}
const take = (sim) => { const out = []; for (const e of sim.drainEvents()) out.push(e); return out; };

// 1. The stand: one of each kind hanging still on the Chinook; none for the other aircraft.
{
  const sim = new Sim({ aircraft: 'chinook' });
  for (let i = 0; i < 480; i++) sim.step(zero());
  const kinds = sim.biscuits.list.map((b) => b.kind.id).sort().join(',');
  check('the stand holds one of each of the six kinds', kinds === KINDS.map((k) => k.id).sort().join(','), kinds);
  check('they hang still and go to sleep', sim.biscuits.list.every((b) => b.resting), sim.biscuits.list.filter((b) => !b.resting).map((b) => b.kind.id).join(',') || 'all asleep');
  const micro = new Sim({ aircraft: 'micro' });
  check('no biscuits for the micro heli', micro.biscuits.list.length === 0);
  micro.setAircraft('chinook');
  check('switching to the Chinook fills the stand', micro.biscuits.list.length === 6);
  micro.setAircraft('skycrane');
  check('switching away clears them', micro.biscuits.list.length === 0);
}

// 2. Each kind in the mug: soaked bands break off at the wet line, at its own rate.
const firstBreak = {};
for (const k of KINDS) {
  const sim = new Sim({ aircraft: 'chinook' });
  const cup = sim.cups[0];
  const b = sim.biscuits.list.find((x) => x.kind === k);
  const G = geomOf(k);
  if (k.shape === 'finger') continue;
  const bottom = G.anchor[1] + (k.shape === 'round' ? k.r : k.h / 2);   // clip tie to the lowest edge
  const c = crane(sim, b, new THREE.Vector3(cup.x, cup.waterY - 0.02 + bottom + LINE, cup.z));
  let t = 0, broke = null, piece = null;
  for (let i = 0; i < 240 * 20 && broke === null; i++) {
    c.step(); t += sim.dt;
    for (const e of take(sim)) if (e.type === 'biscuitBreak') { broke = t; piece = e.chunk; }
  }
  firstBreak[k.id] = broke ?? 99;
  check(`${k.name}: the wet edge breaks off in the tea`, broke !== null && piece && piece.a === 0, `after ${f(broke ?? 99, 1)} s, bands ${piece?.a}-${piece?.b}`);
}
check('rich tea goes first, ginger nut lasts longest', firstBreak.richtea < firstBreak.digestive && firstBreak.digestive < firstBreak.oat && firstBreak.oat < firstBreak.ginger,
  KINDS.filter((k) => firstBreak[k.id]).map((k) => `${k.id} ${f(firstBreak[k.id], 1)}`).join(', '));
check('the kinds crumble at clearly different rates', firstBreak.ginger > 3 * firstBreak.richtea, `ginger ${f(firstBreak.ginger, 1)} s vs rich tea ${f(firstBreak.richtea, 1)} s`);

// 3. Dry biscuits ride the hook without falling apart; the winch pays out and reels in.
{
  const sim = new Sim({ aircraft: 'chinook' });
  const b = sim.biscuits.list.find((x) => x.kind.id === 'richtea');
  const c = crane(sim, b, new THREE.Vector3(0.1, 0.45, 0.3));
  let breaks = 0;
  for (let i = 0; i < 240 * 4; i++) { c.step(); for (const e of take(sim)) if (e.type === 'biscuitBreak') breaks++; }
  check('a dry biscuit rides the hook in one piece', breaks === 0 && b.lo === 0 && b.hi === b.nb - 1);
  for (let i = 0; i < 240 * 2; i++) c.step({ ...zero(), dunk: 1 });
  const out = b.attach.length, hang = c.hook.y - b.anchorWorld.y;
  check('holding dunk pays the line out', out > LINE + 0.09 && hang > LINE + 0.085, `line ${f(out)} m, hangs ${f(hang)} m`);
  for (let i = 0; i < 240 * 1.2; i++) c.step({ ...zero(), dunk: 0.5 });
  check('a half-pulled trigger stops it half way', Math.abs(b.attach.length - (LINE + 0.05)) < 0.004, `line ${f(b.attach.length)} m`);
  for (let i = 0; i < 240 * 2; i++) c.step();
  check('letting go reels it back in', Math.abs(b.attach.length - LINE) < 0.002, `line ${f(b.attach.length)} m`);
}

// 4. The chocolate cream finger: knock an end on the table and it snaps; with both ends off, one end in the tea
// and the other out, it draws tea up, then goes soft from inside a few seconds later.
{
  const sim = new Sim({ aircraft: 'chinook' });
  const b = sim.biscuits.list.find((x) => x.kind.id === 'chocfinger');
  const c = crane(sim, b, new THREE.Vector3(0.3, 0.3, 0.3));
  for (let i = 0; i < 480; i++) c.step();
  // Drop the hook fast so the low end hits the table top.
  let snaps = 0;
  for (let i = 0; i < 240 * 1.5 && !snaps; i++) { c.hook.y -= 0.5 / 240; c.step(); for (const e of take(sim)) if (e.type === 'biscuitSnap') snaps++; }
  check('rapping an end on the table snaps it off', snaps === 1 && (b.lo === 1 || b.hi === b.nb - 2), `bands ${b.lo}-${b.hi}`);
  const soft = new Sim({ aircraft: 'chinook' });
  const w = soft.biscuits.list.find((x) => x.kind.id === 'chocfinger');
  const cc = crane(soft, w, new THREE.Vector3(0.4, 0.4, 0.3));
  for (let i = 0; i < 480; i++) cc.step();
  w.breakOff(0, 0, 'snap'); w.breakOff(w.nb - 1, w.nb - 1, 'snap');
  for (let i = 0; i < 480; i++) cc.step();
  // Put the low end into the mug near its far wall, the rest out over the rim.
  const cup = soft.cups[0];
  const lo = w.sample(w.lo, 0, new THREE.Vector3()).applyQuaternion(w.quat).add(w.pos);
  const hi = w.sample(w.hi, 0, new THREE.Vector3()).applyQuaternion(w.quat).add(w.pos);
  const dir = hi.clone().sub(lo).setY(0).normalize();
  cc.hook.x += cup.x - 0.025 * dir.x - lo.x; cc.hook.z += cup.z - 0.025 * dir.z - lo.z;
  for (let i = 0; i < 480; i++) cc.step();
  let slamAt = null, brokeAt = null;
  for (let i = 0; i < 240 * 14 && brokeAt === null; i++) {
    if (w.imm[w.lo] < 0.6 && slamAt === null) cc.hook.y -= 0.03 / 240;
    cc.step();
    for (const e of take(soft)) {
      if (e.type === 'biscuitSlam') slamAt = soft.time;
      if (e.type === 'biscuitBreak' && slamAt !== null) brokeAt = soft.time;
    }
  }
  check('both ends off and one end in: it draws tea up (the slam)', slamAt !== null && w.fill > 0.6, `fill ${f(w.fill, 2)}`);
  check('it then gives a couple of seconds before it goes', brokeAt !== null && brokeAt - slamAt > 1.8 && brokeAt - slamAt < 6, `${f((brokeAt ?? 0) - (slamAt ?? 0), 1)} s`);
  // An unsnapped chocolate finger dipped the same way draws nothing.
  const plain = new Sim({ aircraft: 'chinook' });
  const p = plain.biscuits.list.find((x) => x.kind.id === 'chocfinger');
  const pc = crane(plain, p, new THREE.Vector3(0.4, 0.4, 0.3));
  for (let i = 0; i < 480; i++) pc.step();
  const plo = p.sample(p.lo, 0, new THREE.Vector3()).applyQuaternion(p.quat).add(p.pos);
  const phi = p.sample(p.hi, 0, new THREE.Vector3()).applyQuaternion(p.quat).add(p.pos);
  const pd = phi.clone().sub(plo).setY(0).normalize();
  pc.hook.x += cup.x - 0.025 * pd.x - plo.x; pc.hook.z += cup.z - 0.025 * pd.z - plo.z;
  for (let i = 0; i < 480; i++) pc.step();
  for (let i = 0; i < 240 * 5; i++) { if (p.imm[p.lo] < 0.6) pc.hook.y -= 0.03 / 240; pc.step(); }
  check('a whole chocolate finger does not draw tea', p.fill === 0 && !p.slam);
}

// 5. A neighbour reaches for a biscuit brought close, takes it off the line and eats it.
{
  const sim = new Sim({ aircraft: 'chinook' });
  const person = sim.people.list.find((q) => q.def.id === 'edie');
  const sh = person.poser.j.shL.clone().applyMatrix4(person.place);
  const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), person.yaw);
  const b = sim.biscuits.list.find((x) => x.kind.id === 'digestive');
  const spot = sh.clone().addScaledVector(fwd, 0.32).add(new THREE.Vector3(0, 0.05, 0));
  const c = crane(sim, b, spot.clone().add(new THREE.Vector3(0, LINE + 0.0375, 0)));
  const seen = [];
  for (let i = 0; i < 240 * 5; i++) { c.step(); for (const e of take(sim)) if (/^biscuit(Taken|Eaten|Bite)$|^personSay$/.test(e.type)) seen.push(e.type + (e.word ? `:${e.word}` : '')); }
  check('a neighbour takes a biscuit brought within reach', seen.includes('biscuitTaken'), seen.join(' '));
  check('and eats it in bites, pleased', seen.filter((s) => s === 'biscuitBite').length === 3 && seen.includes('personSay:mm') && seen.includes('biscuitEaten') && !sim.biscuits.list.includes(b));
  check('it leaves the physics while in hand', b.body === null);
  // Crumbs in their own tea: a doubtful hum.
  const cup = sim.cups[person.cupIndex];
  const r = sim.biscuits.list.find((x) => x.kind.id === 'richtea');
  const rc = crane(sim, r, new THREE.Vector3(cup.x, cup.waterY - 0.025 + r.anchorLocal.y + KIND.richtea.r + LINE, cup.z));
  const words = [];
  for (let i = 0; i < 240 * 8; i++) { rc.step(); for (const e of take(sim)) if (e.type === 'personSay' && e.who === 'Edie') words.push(e.word); }
  check('a soggy piece in their tea gets a "hmm"', words.includes('hmm'), words.join(' '));
}

// 6. Flying with biscuits: the hooks are under the rotors' centre, so hanging biscuits put no turn on
// the airframe (Assist off, hands off), and the Chinook still climbs away with three.
{
  const yawDrift = (n, handsOff = true) => {
    const sim = new Sim({ aircraft: 'chinook' });
    sim.assist = true;
    for (let i = 0; i < 240 * 2.2; i++) sim.step({ ...zero(), collective: 1 });
    const ap = new Autopilot();
    ap.target.copy(sim.heli.pos);
    for (let i = 0; i < 240 * 3; i++) sim.step(ap.update(sim.heli));
    const biscuits = sim.biscuits.list.filter((b) => b.kind.shape === 'round').slice(0, n);
    biscuits.forEach((b, i) => {
      sim.detachBag(b, true);
      const hook = sim.heli.hookWorlds[[1, 0, 2][i]];
      // Faces fore and aft, so three side by side on hooks 3 cm apart don't overlap.
      const q = new THREE.Quaternion().copy(sim.heli.quat);
      const a = b.anchorLocal.clone().applyQuaternion(q);
      b.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      b.body.setTranslation({ x: hook.x - a.x, y: hook.y - LINE - a.y, z: hook.z - a.z }, true);
      b.body.setLinvel({ x: sim.heli.vel.x, y: sim.heli.vel.y, z: sim.heli.vel.z }, true);
      b.resting = false;
      sim.attachBag(b, { kind: 'heli', heli: sim.heli, hook: [1, 0, 2][i] });
    });
    for (let i = 0; i < 240 * 3; i++) sim.step(ap.update(sim.heli));
    if (!handsOff) return { sim };
    sim.assist = false;
    let maxYaw = 0;
    const y0 = sim.heli.heading();
    for (let i = 0; i < 240 * 1.5 && sim.heli; i++) { sim.step(zero()); const w = sim.heli.body.angvel(); maxYaw = Math.max(maxYaw, Math.abs(w.y)); }
    return { maxYaw, turn: sim.heli ? Math.abs(sim.heli.heading() - y0) : 9, sim };
  };
  const none = yawDrift(0), one = yawDrift(1);
  check('Assist off, hands off: a biscuit on the centre hook adds no turn', one.maxYaw < none.maxYaw + 0.05 && one.turn < 0.08, `yaw rate ${f(none.maxYaw)} -> ${f(one.maxYaw)} rad/s, turned ${f(one.turn)} rad`);
  const climb = (n) => {
    const sim = yawDrift(n, false).sim;
    const load = sim.carriedCargo().reduce((m, b) => m + b.mass, 0);
    const y0 = sim.heli ? sim.heli.pos.y : 0;
    sim.assist = true;
    for (let i = 0; i < 240 * 2.5 && sim.heli; i++) sim.step({ ...zero(), collective: 1 });
    return { load, dy: sim.heli ? sim.heli.pos.y - y0 : -1, n: sim.carriedCargo().length };
  };
  const light = climb(0), laden = climb(3);
  check('it climbs away with three biscuits on', laden.n === 3 && laden.dy > 0.08 && laden.dy > 0.15 * light.dy, `${f(laden.load * 1000, 1)} g on: climbed ${f(laden.dy)} m vs ${f(light.dy)} m empty`);
}

// 7. Housekeeping: a crash drops what was carried, a restart puts a fresh one on the empty peg, and
// biscuits on the stand cost the physics little.
{
  const sim = new Sim({ aircraft: 'chinook' });
  const b = sim.biscuits.list[0];
  sim.detachBag(b, true);
  sim.attachBag(b, { kind: 'heli', heli: sim.heli, hook: 1 });
  sim.crash('impact', 2);
  check('a crash lets go of the biscuits', !b.attach);
  sim.restartFlight();
  for (let i = 0; i < 240 * 4; i++) sim.step(zero());
  check('the stand refills its empty peg', sim.biscuits.pegs.every((p) => p.bag), `${sim.biscuits.list.length} biscuits`);
  const cost = (off) => {
    const s = new Sim({ aircraft: 'chinook' });
    if (off) { Object.defineProperty(s.biscuits, 'active', { get: () => false }); s.biscuits.reset(); }
    for (let i = 0; i < 480; i++) s.step(zero());
    const t0 = performance.now();
    for (let i = 0; i < 1200; i++) s.step(zero());
    return (performance.now() - t0) / 1200;
  };
  let a = 0, z = 0;
  for (let r = 0; r < 3; r++) { a += cost(false); z += cost(true); }
  check('six biscuits at rest on the stand cost under 0.06 ms a step', (a - z) / 3 < 0.06, `${f(z / 3)} -> ${f(a / 3)} ms`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} biscuit checks passed`);
process.exit(failed.length ? 1 : 0);
