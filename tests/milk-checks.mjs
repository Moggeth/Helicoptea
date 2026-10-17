import { performanceBudget } from './performance-budget.mjs';
// Headless milk checks (part of `npm run check`): the bucket hangs on its hanger, hooks like a bag,
// fills by dipping (mass rises, the bowl level falls), pours through its valve into a cup (the tea
// lightens), misses make bounded puddles, sloshes, and milk is conserved throughout.
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { CFG } from '../src/config.js';
import { BUCKET } from '../src/sim/milk.js';
import { milkyTea, teaColor } from '../src/render/water.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const run = (sim, seconds, fn) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) sim.step(fn ? fn(i * sim.dt) : zero()); };
const f = (x, d = 3) => Number(x).toFixed(d);
const ml = (v) => `${f(v * 1e6, 2)} ml`;
const same = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(a, b); // conservation, to float precision
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const SLOW = 1.8;

// Fly with the scripted autopilot (the same stick inputs a player makes). opts.aim: steer the cargo, not the heli.
function pilot(sim, ap) {
  return (x, y, z, secs, opts = {}) => {
    ap.target.set(x, y, z);
    ap.maxSpeed = opts.speed ?? 0.3;
    run(sim, secs * SLOW, () => {
      if (!sim.heli) return zero();
      const k = opts.cargo;
      const swing = k && opts.damp ? k.vel.clone().sub(sim.heli.vel) : null;
      const ctl = ap.update(sim.heli, swing, opts.aim ? k.pos : null);
      return opts.pour ? { ...ctl, pour: true } : ctl;
    });
  };
}

// 1. Resting state.
{
  const sim = new Sim();
  run(sim, 2);
  const k = sim.milk.bucket;
  check('bucket hangs still from its hanger', k && k.attach && k.attach.kind === 'peg' && k.pos.y > 0.04 && k.vel.length() < 0.01, `y ${f(k.pos.y)} v ${f(k.vel.length(), 4)}`);
  check('bucket starts empty at its dry mass', k.vol === 0 && Math.abs(k.mass - CFG.milk.dryMass) < 1e-9, `${f(k.mass * 1000, 2)} g`);
  check('bucket holds about 12 ml', BUCKET.CAPACITY > 10e-6 && BUCKET.CAPACITY < 14e-6, ml(BUCKET.CAPACITY));
  check('a bag still hangs from every peg on both stands', sim.bags.length === sim.pegs.filter((p) => p.station < 2).length && sim.bags.every((b) => b.attach && b.attach.kind === 'peg'));
}

// 2. Physics of filling, without a pilot: lower the bucket into the bowl on a kinematic line.
{
  const sim = new Sim();
  const k = sim.milk.bucket, bowl = sim.milk.bowl;
  sim.detachBag(k, true);
  const total0 = sim.milk.totalMilk();
  // place it upright, just above the milk in the bowl
  k.body.setTranslation({ x: bowl.x, y: bowl.waterY + 0.03, z: bowl.z }, true);
  k.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  run(sim, 0.05);
  const level0 = bowl.waterY;
  let maxImm = 0, t63 = null;
  const n = Math.round(4 / sim.dt);
  for (let i = 0; i < n; i++) {
    sim.step(zero());
    maxImm = Math.max(maxImm, k.immersion);
    if (t63 === null && k.vol > 0.63 * BUCKET.CAPACITY) t63 = i * sim.dt;
  }
  check('dropped bucket sinks into the milk (ballast beats buoyancy)', maxImm > 0.6, `max immersion ${f(maxImm)}`);
  check('bucket fills through its base valve', k.vol > 0.85 * BUCKET.CAPACITY, `${ml(k.vol)} of ${ml(BUCKET.CAPACITY)}, 63% after ${t63 === null ? '-' : f(t63, 2)} s`);
  check('filling takes a moment, not an instant', t63 !== null && t63 > 0.15 && t63 < 3, `${t63 === null ? '-' : f(t63, 2)} s`);
  check('contents are milk', Math.abs(k.milkFrac - 1) < 1e-9);
  const drop = level0 - bowl.waterY, expect = k.vol / bowl.area;
  check('bowl level falls by what the bucket took', Math.abs(drop - expect) < 2e-4, `${f(drop * 1000, 2)} mm vs ${f(expect * 1000, 2)} mm`);
  check('milk is conserved while filling', same(sim.milk.totalMilk(), total0), `${ml(total0)} -> ${ml(sim.milk.totalMilk())}`);
  check('full bucket weighs dry + milk', Math.abs(k.mass - (CFG.milk.dryMass + k.vol * CFG.milk.density)) < 1e-9, `${f(k.mass * 1000, 1)} g`);
}

// 3. The full loop with the micro heli: hook the bucket, dip it in the bowl, carry, pour into the teacup.
{
  const sim = new Sim();
  const ap = new Autopilot();
  const goto = pilot(sim, ap);
  const k = sim.milk.bucket, bowl = sim.milk.bowl, cup = sim.cups[1];
  const tip = sim.milk.hanger.tip;
  const hookDrop = -CFG.heli.hookOffset[1];
  const total0 = sim.milk.totalMilk();
  ap.yaw = 0;
  goto(sim.heli.pos.x, 0.42, sim.heli.pos.z, 2);
  goto(tip.x, 0.42, tip.z + 0.004, 5);
  goto(tip.x, tip.y + hookDrop + 0.008, tip.z + 0.004, 3, { speed: 0.15 });
  const cand = sim.attachCandidate();
  check('hook reaches the bucket line', cand === k, `hook-loop ${f(sim.heli ? sim.heli.hookWorld.distanceTo(tip) : -1)} m, state ${sim.state}`);
  sim.toggleAttach();
  check('bucket hooks on like a bag', k.attach && k.attach.kind === 'heli' && sim.carriedCargo().includes(k));
  goto(tip.x, 0.42, tip.z + 0.03, 2.5, { speed: 0.15 });
  const loadEmpty = sim.heli ? sim.heli.load : 0;
  // over the bowl, then lower until the bucket sits in the milk
  goto(bowl.x, 0.42, bowl.z, 5, { cargo: k, damp: true });
  goto(bowl.x, 0.36, bowl.z, 3, { cargo: k, damp: true, aim: true, speed: 0.1 });
  const lineY = CFG.milk.lineLength + BUCKET.swivelY - BUCKET.yBot; // hook to bucket bottom
  ap.target.set(bowl.x + (sim.heli ? sim.heli.pos.x - k.pos.x : 0), bowl.floorY + 0.004 + lineY + hookDrop, bowl.z + (sim.heli ? sim.heli.pos.z - k.pos.z : 0));
  ap.maxSpeed = 0.05;
  let maxImm = 0;
  run(sim, 6 * SLOW, () => { if (!sim.heli) return zero(); maxImm = Math.max(maxImm, k.immersion); return ap.update(sim.heli, k.vel.clone().sub(sim.heli.vel)); });
  check('bucket dips into the milk bowl', maxImm > 0.5, `max immersion ${f(maxImm)}, bucket y ${f(k.pos.y)} milk at ${f(bowl.waterY)}`);
  check('dipping fills the bucket', k.vol > 0.7 * BUCKET.CAPACITY, `${ml(k.vol)}`);
  const dipY = sim.heli ? sim.heli.pos.y : 0;
  check('no crash while dipping', sim.state === 'flying', sim.crashInfo ? sim.crashInfo.reason : '');
  goto(bowl.x, 0.45, bowl.z, 4, { cargo: k, damp: true, speed: 0.12 });
  const volLifted = k.vol;
  check('one-way valve keeps the milk on the way out', volLifted > 0.65 * BUCKET.CAPACITY && k.immersion === 0, `${ml(volLifted)}`);
  run(sim, 0.6, () => (sim.heli ? ap.update(sim.heli, k.vel.clone().sub(sim.heli.vel)) : zero()));
  const loadFull = sim.heli ? sim.heli.load : 0;
  check('the helicopter carries the extra weight', loadFull > loadEmpty + 0.06, `line tension ${f(loadEmpty * 1000, 0)} -> ${f(loadFull * 1000, 0)} mN`);
  check('micro heli can lift a full bucket', sim.heli && sim.heli.pos.y > dipY + 0.12, `heli y ${f(dipY)} -> ${f(sim.heli ? sim.heli.pos.y : 0)}`);
  // carry to the teacup and hold the bucket over it
  const cupCol0 = milkyTea(cup.brew, cup.milk, new THREE.Color());
  const cupVol0 = cup.vol;
  goto(cup.x, 0.45, cup.z, 7, { cargo: k, damp: true, speed: 0.25 });
  goto(cup.x, 0.40, cup.z, 4, { cargo: k, damp: true, aim: true, speed: 0.08 });
  check('a steady carry spills little', k.spilled < 0.05 * BUCKET.CAPACITY, `${ml(k.spilled)} over the rim on the way`);
  const before = k.vol;
  let sawParcels = 0;
  ap.maxSpeed = 0.05;
  run(sim, 3 * SLOW, () => { if (!sim.heli) return zero(); sawParcels = Math.max(sawParcels, sim.milk.parcels.length); return { ...ap.update(sim.heli, k.vel.clone().sub(sim.heli.vel), k.pos), pour: true }; });
  run(sim, 1.0, () => (sim.heli ? ap.update(sim.heli, k.vel.clone().sub(sim.heli.vel), k.pos) : zero()));
  const poured = before - k.vol;
  check('holding pour opens the valve and empties the bucket', poured > 0.6 * before && k.valveOpen === false, `${ml(before)} -> ${ml(k.vol)}`);
  check('milk falls as a bounded stream', sawParcels > 3 && sawParcels <= CFG.milk.maxParcels, `${sawParcels} parcels at most`);
  const inCup = cup.vol - cupVol0;
  check('the stream lands in the cup below', inCup > 0.5 * poured, `${ml(inCup)} of ${ml(poured)} in the teacup, milk ${f(cup.milk * 100, 1)}%`);
  const cupCol1 = milkyTea(cup.brew, cup.milk, new THREE.Color());
  check('milk lightens the cup', cup.milk > 0.04 && lum(cupCol1) > lum(cupCol0) + 0.01, `luminance ${f(lum(cupCol0))} -> ${f(lum(cupCol1))}`);
  check('cup level rises without overflowing', cup.waterY > cup.level0 && cup.waterY < cup.topY, `${f(cup.level0 * 1000, 1)} -> ${f(cup.waterY * 1000, 1)} mm (rim ${f(cup.topY * 1000, 1)})`);
  check('only the cup under the stream changed much', sim.cups[0].milk < 0.002, `mug milk ${f(sim.cups[0].milk * 100, 3)}%`);
  check('milk is conserved through dip, carry and pour', same(sim.milk.totalMilk(), total0), `difference ${f((sim.milk.totalMilk() - total0) * 1e9, 4)} µl`);
  check('no crash in the whole loop', sim.state === 'flying', sim.crashInfo ? sim.crashInfo.reason : '');
}

// 4. Missing the cup: puddles, bounded, and they dry.
{
  const sim = new Sim();
  const k = sim.milk.bucket;
  sim.detachBag(k, true);
  const total0 = sim.milk.totalMilk();
  // A full bucket held high over open table by its line from a fake hook: emulate with a fixed peg.
  const peg = { tip: new THREE.Vector3(0.0, 0.32, 0.3), bag: null, emptyFor: 0 };
  k.body.setTranslation({ x: peg.tip.x, y: peg.tip.y - CFG.milk.lineLength - BUCKET.swivelY, z: peg.tip.z }, true);
  sim.attachBag(k, { kind: 'peg', peg });
  const bowl = sim.milk.bowl;
  const got = sim.milk.take(bowl, BUCKET.CAPACITY);
  k.mix(got.vol, got.milk, got.brew);
  run(sim, 0.5);
  // the valve only answers to a pilot, so open it as the heli would
  k.attach.kind = 'heli';
  const ctlPour = () => ({ ...zero(), pour: true });
  let maxParcels = 0;
  run(sim, 2.5, () => { maxParcels = Math.max(maxParcels, sim.milk.parcels.length); return ctlPour(); });
  k.attach.kind = 'peg';
  run(sim, 1);
  const pd = sim.milk.puddles;
  check('missed milk makes a puddle on the table', pd.length >= 1 && pd.some((p) => p.y === 0 && p.r > 0.01), pd.map((p) => `r ${f(p.r * 100, 1)} cm`).join(', '));
  check('puddles stay bounded', pd.length <= CFG.milk.maxPuddles && pd.every((p) => p.r <= CFG.milk.puddleMaxR + 1e-9), `${pd.length} puddles`);
  check('stream parcels stay bounded', maxParcels <= CFG.milk.maxParcels, `${maxParcels}`);
  check('milk is conserved into puddles (counting what dried)', same(sim.milk.totalMilk(), total0), `difference ${f((sim.milk.totalMilk() - total0) * 1e9, 4)} µl, dried ${ml(sim.milk.gone)}`);
  // many spills from many places still give at most maxPuddles
  for (let i = 0; i < 40; i++) sim.milk.addPuddle(-0.7 + i * 0.035, 0, 0.45 - (i % 5) * 0.05, 2e-6, 1, 0);
  check('forty separate spills still make at most the puddle cap', sim.milk.puddles.length <= CFG.milk.maxPuddles, `${sim.milk.puddles.length}`);
  const v0 = sim.milk.puddles.reduce((s, p) => s + p.vol, 0);
  run(sim, 30);
  const v1 = sim.milk.puddles.reduce((s, p) => s + p.vol, 0);
  check('puddles soak in and dry', v1 < v0 * 0.9, `${ml(v0)} -> ${ml(v1)} on the table`);
}

// 5. Slosh: a full bucket swung sideways sloshes, and the surface settles level again.
{
  const sim = new Sim();
  const k = sim.milk.bucket;
  const got = sim.milk.take(sim.milk.bowl, BUCKET.CAPACITY * 0.65);
  k.mix(got.vol, got.milk, got.brew);
  run(sim, 1.5);
  // surface tilt relative to the bucket (a swinging bucket carries its milk level with it)
  const tilt = () => Math.acos(Math.min(1, k.surfN.dot(new THREE.Vector3(0, 1, 0).applyQuaternion(k.quat)))) * 57.3;
  const t0 = tilt();
  const vol0 = k.vol;
  k.body.applyImpulse({ x: k.mass * 0.04, y: 0, z: 0 }, true);
  let maxT = 0;
  run(sim, 0.4, () => { maxT = Math.max(maxT, tilt()); return zero(); });
  run(sim, 4);
  const t1 = tilt();
  check('a shove makes the milk slosh', maxT > 3, `surface tilt up to ${f(maxT, 1)} deg`);
  check('slosh settles back level', t1 < 1.5 && t0 < 1.5, `${f(t0, 2)} -> ${f(t1, 2)} deg`);
  check('gentle slosh with freeboard does not spill', k.vol > vol0 * 0.999, `${ml(vol0)} -> ${ml(k.vol)}`);
  k.body.applyImpulse({ x: k.mass * 0.3, y: 0, z: 0 }, true);
  run(sim, 1);
  check('a hard jolt slops milk over the rim', k.vol < vol0 * 0.97 && k.spilled > 0, `${ml(vol0)} -> ${ml(k.vol)}`);
}

// 6. Space drops the bucket, which closes its valve; reset restores everything.
{
  const sim = new Sim();
  const k = sim.milk.bucket;
  sim.detachBag(k, true);
  sim.attachBag(k, { kind: 'heli', heli: sim.heli, hook: 0 });
  check('attach candidate ignores a hook already in use', sim.attachCandidateInfo() === null || sim.attachCandidateInfo().bag !== k);
  sim.toggleAttach();
  check('release drops the bucket', !k.attach);
  run(sim, 0.2, () => ({ ...zero(), pour: true }));
  check('a dropped bucket cannot be opened', k.valveOpen === false);
  sim.milk.take(sim.milk.bowl, 5e-5);
  sim.cups[1].milk = 0.3;
  sim.milk.addPuddle(0, 0, 0.3, 5e-6, 1, 0);
  sim.resetSandbox();
  run(sim, 0.5);
  const b2 = sim.milk.bucket;
  check('reset sandbox puts a clean bucket back on its hanger', b2 && b2 !== k && b2.vol === 0 && b2.attach && b2.attach.kind === 'peg');
  check('reset sandbox refills the bowl and clears milk', Math.abs(sim.milk.bowl.waterY - sim.milk.bowl.level0) < 1e-9 && sim.cups.every((c) => c.milk === 0 && Math.abs(c.waterY - c.level0) < 1e-9) && sim.milk.puddles.length === 0);
}

// 7. Chinook: bucket on one hook and a tea bag on another at the same time.
{
  const sim = new Sim({ aircraft: 'chinook' });
  const k = sim.milk.bucket;
  sim.detachBag(k, true);
  sim.attachBag(k, { kind: 'heli', heli: sim.heli, hook: 0 });
  const bag = sim.bags[0];
  sim.detachBag(bag, true);
  sim.attachBag(bag, { kind: 'heli', heli: sim.heli, hook: 2 });
  run(sim, 0.5);
  check('Chinook carries the bucket and a bag on separate hooks', sim.carriedCargo().length === 2 && new Set(sim.carriedCargo().map((c) => c.attach.hook)).size === 2);
  sim.toggleAttach();
  check('Chinook release drops both', sim.carriedCargo().length === 0);
}

// 8. Colour model: milk always lightens tea and pure milk is near white.
{
  const c = new THREE.Color();
  let mono = true;
  for (const brew of [0, 0.3, 0.6, 1]) {
    let prev = -1;
    for (const m of [0, 0.05, 0.1, 0.2, 0.4, 0.7, 1]) { const L = lum(milkyTea(brew, m, c)); if (L < prev - 1e-6) mono = false; prev = L; }
  }
  check('milk lightens tea monotonically', mono);
  check('pure milk is near white, strong tea with no milk is dark', lum(milkyTea(0.6, 1, c)) > 0.85 && lum(milkyTea(0.9, 0, new THREE.Color())) < lum(teaColor(0.3)));
}

// 9. Cost: a pouring stream does not blow the step budget.
{
  const sim = new Sim();
  const k = sim.milk.bucket;
  const got = sim.milk.take(sim.milk.bowl, BUCKET.CAPACITY);
  k.mix(got.vol, got.milk, got.brew);
  k.attach.kind = 'heli';
  run(sim, 0.3, () => ({ ...zero(), pour: true }));
  const t0 = performance.now();
  run(sim, 1, () => ({ ...zero(), pour: true }));
  const ms = (performance.now() - t0) / Math.round(1 / sim.dt);
  k.attach.kind = 'peg';
  performanceBudget(check, 'physics step cost while pouring', ms, 1.0, `${f(ms, 3)} ms per step, ${sim.milk.parcels.length} parcels`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} milk checks passed`);
process.exit(failed.length ? 1 : 0);
