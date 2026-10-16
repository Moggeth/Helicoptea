// Headless skycrane checks (part of `npm run check`): the S-64-style tanker's flight model, its snorkel
// hose (reel, collisions, swinging), the pump that only works with the intake under a surface, the tank's
// mass and slosh, analog belly doors, the salvo and auto-fill combos, crashes and milk conservation.
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { CFG } from '../src/config.js';
import { SKYCRANE_MASS, TANK_CAPACITY } from '../src/sim/skycrane.js';
import { CHINOOK_MASS } from '../src/sim/chinook.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const run = (sim, seconds, fn) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) sim.step(fn ? fn(i * sim.dt) : zero()); };
const f = (x, d = 3) => Number(x).toFixed(d);
const ml = (v) => `${f(v * 1e6, 1)} ml`;
const same = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(a, b);
const SC = CFG.skycrane;
const why = (sim) => (sim.crashInfo ? `${sim.crashInfo.reason} at ${sim.crashInfo.pos.toArray().map((v) => f(v, 2)).join(',')}` : '');

function pilot(sim, ap) {
  return (x, y, z, secs, extra = {}) => {
    ap.target.set(x, y, z);
    ap.maxSpeed = extra.speed ?? 0.3;
    run(sim, secs, () => (sim.heli ? { ...ap.update(sim.heli), ...(extra.ctl || {}) } : zero()));
  };
}
const climb = (sim) => { run(sim, 2.0, () => ({ ...zero(), collective: 1 })); run(sim, 1.5); };

// 1. On the pad.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  const p0 = sim.heli.pos.clone();
  run(sim, 2);
  const h = sim.heli;
  check('rests on the pad on its wheels', sim.state === 'flying' && h.grounded && h.pos.distanceTo(p0) < 0.01, `moved ${f(h.pos.distanceTo(p0), 4)} m`);
  check('six main blades and a tail rotor sensor', h.def.parts.filter((p) => p.blade).length === 6 && h.rotors.length === 2);
  check('heavier than the Chinook', SKYCRANE_MASS > CHINOOK_MASS, `${f(SKYCRANE_MASS * 1000, 1)} g vs ${f(CHINOOK_MASS * 1000, 1)} g`);
  check('tank holds about 32 ml', TANK_CAPACITY > 28e-6 && TANK_CAPACITY < 36e-6, ml(TANK_CAPACITY));
  check('the snorkel lies on the pad, not through it', h.hose.segs.every((s) => s.pos.y > 0.002) && h.hose.headWorld.y < 0.03, `head y ${f(h.hose.headWorld.y)}`);
}

// 2. Assisted hover, tail rotor and torque.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  climb(sim);
  const h = sim.heli;
  const yUp = h.pos.y;
  run(sim, 3);
  check('assist: climbs on collective', yUp > 0.2, `y ${f(yUp)}`);
  check('assist: hovers level and nearly still', h.vel.length() < 0.15 && Math.acos(Math.min(1, h.up.y)) < 0.08 && sim.state === 'flying', `v ${f(h.vel.length())} tilt ${f(Math.acos(h.up.y))}`);
  check('hover holds heading with the tail rotor idle (no torque to fight)', Math.abs(h.tailT) < 0.002 && Math.abs(h.body.angvel().y) < 0.03, `tail ${f(h.tailT * 1000, 1)} mN, yaw rate ${f(h.body.angvel().y)}`);
  // sideways: roll right, then let go
  run(sim, 1.0, () => ({ ...zero(), roll: 1 }));
  const vx = h.vel.x;
  run(sim, 4);
  check('assist: roll stick flies sideways', vx > 0.3, `vx ${f(vx)}`);
  check('assist: drift settles after release', sim.heli && sim.heli.vel.length() < 0.15, sim.heli ? `v ${f(sim.heli.vel.length())}` : why(sim));
  const hd0 = h.heading();
  run(sim, 1.5, () => ({ ...zero(), yaw: 1 }));
  const rate = h.body.angvel().y;
  run(sim, 2.5);
  const hd1 = h.heading();
  run(sim, 2);
  check('yaw: pedal turns at the commanded rate', Math.abs(-rate - SC.assist.yawRate) < 0.25, `${f(-rate)} rad/s (cmd ${SC.assist.yawRate})`);
  check('yaw: holds heading after release', Math.abs(h.heading() - hd1) < 0.05 && Math.abs(hd1 - hd0) > 0.5, `drift ${f(h.heading() - hd1)} rad`);
}

// 2b. Hands off: an assisted hover holds still (no slow creep).
{
  const sim = new Sim({ aircraft: 'skycrane' });
  run(sim, 1);
  run(sim, 0.8, () => ({ ...zero(), collective: 1 }));
  run(sim, 3);
  const p0 = sim.heli.pos.clone();
  let vmax = 0;
  const n = Math.round(8 / sim.dt);
  for (let i = 0; i < n; i++) { sim.step(zero()); if (sim.heli) vmax = Math.max(vmax, Math.hypot(sim.heli.vel.x, sim.heli.vel.z)); }
  const moved = sim.heli ? Math.hypot(sim.heli.pos.x - p0.x, sim.heli.pos.z - p0.z) : 99;
  check('hands-off assisted hover holds still', sim.state === 'flying' && vmax < 0.04 && moved < 0.06, 'max drift ' + f(vmax) + ' m/s, moved ' + f(moved * 100, 1) + ' cm in 8 s');
}

// 3. Assist off: attitude persists, and more collective yaws it (torque).
{
  const sim = new Sim({ aircraft: 'skycrane' });
  climb(sim);
  sim.assist = false;
  run(sim, 0.05);
  const h = sim.heli;
  run(sim, 0.4, () => ({ ...zero(), pitch: 1 }));
  const t0 = Math.acos(h.up.y);
  run(sim, 0.6);
  const t1 = Math.acos(h.up.y);
  check('assist off: attitude persists after releasing cyclic', t1 > t0 * 0.6 && t1 > 0.04, `tilt ${f(t0)} -> ${f(t1)}`);
  const sim2 = new Sim({ aircraft: 'skycrane' });
  climb(sim2);
  sim2.assist = false;
  run(sim2, 0.05);
  const w0 = sim2.heli.body.angvel().y;
  run(sim2, 0.5, () => ({ ...zero(), collective: 1 }));
  const w1 = sim2.heli.body.angvel().y;
  check('assist off: pulling collective leaves the nose alone (no hidden torque)', Math.abs(w1 - w0) < 0.03, `yaw rate ${f(w0)} -> ${f(w1)} rad/s`);
}

// 4. The hose: hangs, reels, swings and collides.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  climb(sim);
  const h = sim.heli;
  run(sim, 2);
  const hang = h.hose.anchorWorld.y - h.hose.headWorld.y;
  check('the snorkel hangs straight down in a hover', hang > h.hose.length * 0.85 && Math.hypot(h.hose.anchorWorld.x - h.hose.headWorld.x, h.hose.anchorWorld.z - h.hose.headWorld.z) < 0.03, `drop ${f(hang)} of ${f(h.hose.length)} m`);
  const L0 = h.hose.length;
  run(sim, 1.2, () => ({ ...zero(), reel: 1 }));
  run(sim, 1.0);
  const L1 = h.hose.length, hang1 = h.hose.anchorWorld.y - h.hose.headWorld.y;
  check('reel out pays out hose', L1 > L0 + 0.06 && hang1 > hang + 0.05, `${f(L0)} -> ${f(L1)} m, hangs ${f(hang1)} m`);
  run(sim, 2.0, () => ({ ...zero(), reel: -1 }));
  check('reel in winds it back up (to its stop)', h.hose.length <= SC.hose.minLength + 1e-6, `${f(h.hose.length)} m`);
  // swing: accelerate sideways, the head trails behind
  run(sim, 1.0, () => ({ ...zero(), reel: 1 }));
  run(sim, 1.0);
  run(sim, 0.7, () => ({ ...zero(), roll: 1 }));
  const trail = h.hose.anchorWorld.x - h.hose.headWorld.x;
  check('the hose swings behind when the skycrane accelerates', trail > 0.01, `head trails ${f(trail * 100, 1)} cm`);
  run(sim, 4);
  // descend until the hose touches the table: segments stay above it
  sim.heli && (sim.heli.hose.length = SC.hose.maxLength);
  const ap = new Autopilot();
  // over open table (where it has drifted to depends on the flight above, so pick the spot)
  pilot(sim, ap)(0.25, 0.3, 0.15, 6, { speed: 0.3 });
  pilot(sim, ap)(0.25, 0.17, 0.15, 4, { speed: 0.1 });
  const minY = Math.min(...h.hose.segs.map((s) => s.pos.y));
  check('hose segments collide with the table', sim.state === 'flying' && minY > 0, `lowest segment ${f(minY, 4)} m at ${h.pos.toArray().map((v) => f(v, 2))}`);
  check('a dragging hose does not crash the aircraft', sim.state === 'flying', why(sim));
}

// 5. Pump: only with the intake under the surface. Auto-fill over the crock.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  const ap = new Autopilot();
  const go = pilot(sim, ap);
  const h = sim.heli, bowl = sim.milk.bowl;
  const total0 = sim.milk.totalMilk();
  climb(sim);
  go(h.pos.x, 0.4, h.pos.z, 2);
  run(sim, 1.0, () => ({ ...ap.update(h), pump: 1 }));
  check('pumping in the air moves nothing', h.tank.vol === 0 && h.tank.pump > 0.9, `pump ${f(h.tank.pump, 2)}, tank ${ml(h.tank.vol)}`);
  go(bowl.x, 0.4, bowl.z, 6);
  go(bowl.x, 0.215, bowl.z, 5, { speed: 0.12 });
  const massEmpty = sim.heli.body.mass();
  const bowl0 = bowl.vol;
  let maxDepth = 0;
  h.autoFill();
  let pumpedSeen = false;
  for (let i = 0; i < 9 / sim.dt && h.tank.auto; i++) {
    sim.step(ap.update(h));
    maxDepth = Math.max(maxDepth, h.hose.depth);
    if (h.tank.pumping) pumpedSeen = true;
    if (!sim.heli) break;
  }
  check('auto-fill reels the snorkel into the milk', maxDepth > 0.004, `intake depth up to ${f(maxDepth * 1000, 1)} mm`);
  check('the pump runs only with the intake submerged', pumpedSeen);
  check('auto-fill fills the tank', h.tank.vol > TANK_CAPACITY * 0.95, `${ml(h.tank.vol)}`);
  check('auto-fill reels the hose back up when done', !h.tank.auto && h.hose.length < SC.hose.startLength, `${f(h.hose.length)} m`);
  check('the crock gives what the tank took', Math.abs((bowl0 - bowl.vol) - h.tank.vol) < 1e-9, `${ml(bowl0 - bowl.vol)} out, ${ml(h.tank.vol)} in`);
  check('a full tank adds its milk to the aircraft mass', sim.heli.body.mass() > massEmpty + 0.012, `${f(massEmpty * 1000, 1)} -> ${f(sim.heli.body.mass() * 1000, 1)} g (rigid share)`);
  go(bowl.x, 0.42, bowl.z, 4, { speed: 0.15 });
  check('it still climbs away full', sim.state === 'flying' && h.pos.y > 0.35, `y ${f(h.pos.y)} ${why(sim)}`);
  check('milk is conserved through the pump', same(sim.milk.totalMilk(), total0), `${ml(total0)} -> ${ml(sim.milk.totalMilk())}`);

  // 6. Slosh in the tank.
  const tilt = () => Math.acos(Math.min(1, h.tank.surfN.dot(h.up))) * 57.3;
  let maxT = 0;
  run(sim, 0.4, () => { maxT = Math.max(maxT, tilt()); return { ...ap.update(h), pitch: 1 }; });
  run(sim, 0.6, () => { maxT = Math.max(maxT, tilt()); return { ...zero(), pitch: -1 }; });
  go(h.pos.x, 0.42, h.pos.z, 5, { speed: 0.1 });
  check('the milk sloshes when the skycrane accelerates', maxT > 3, `surface tilt up to ${f(maxT, 1)} deg`);
  check('slosh settles in a steady hover', tilt() < 3, `${f(tilt(), 2)} deg`);

  // 7. Doors: analog flow rate, aimed into the teacup.
  const cup = sim.cups[1];
  go(cup.x, 0.42, cup.z, 7);
  go(cup.x, 0.42, cup.z, 2, { speed: 0.08 });
  let q20 = 0, q100 = 0;
  run(sim, 0.4, () => { q20 = Math.max(q20, h.tank.flowOut); return { ...ap.update(h), doors: 0.2 }; });
  const cupBefore = cup.vol;
  run(sim, 0.25, () => { q100 = Math.max(q100, h.tank.flowOut); return { ...ap.update(h), doors: 1 }; });
  run(sim, 0.4, () => ap.update(h));
  check('belly doors meter the flow (a crack trickles, wide open gushes)', q20 > 0 && q100 > 3 * q20, `${ml(q20)}/s at 20%, ${ml(q100)}/s full`);
  // salvo combo: latch fully open until empty
  const v0 = h.tank.vol;
  const r = sim.milk.salvo();
  let tEmpty = null;
  for (let i = 0; i < 3 / sim.dt; i++) { sim.step(ap.update(h)); if (tEmpty === null && h.tank.vol <= 0) tEmpty = i * sim.dt; }
  run(sim, 1);
  check('salvo combo dumps the whole tank', r === 'salvo' && h.tank.vol === 0 && tEmpty !== null && tEmpty < 2, `${ml(v0)} in ${tEmpty === null ? '-' : f(tEmpty, 2)} s`);
  check('salvo un-latches once empty', !h.tank.salvo && h.tank.doors < 0.05);
  const inCup = cup.vol - cupBefore;
  check('the drop lands in the teacup and lightens it', cup.milk > 0.04 && inCup > v0 * 0.4, `${ml(inCup)} landed, teacup ${f(cup.milk * 100, 1)}% milk`);
  check('milk is conserved through a drop', same(sim.milk.totalMilk(), total0), `${ml(total0)} -> ${ml(sim.milk.totalMilk())}`);
  check('no crash in the whole tanker loop', sim.state === 'flying', why(sim));
}

// 8a. A crash spills what was aboard: a fuller tank throws more gouts, further, and pools more milk.
{
  const spill = (fill) => {
    const sim = new Sim({ aircraft: 'skycrane' });
    const total0 = sim.milk.totalMilk();
    const got = sim.milk.take(sim.milk.bowl, TANK_CAPACITY * fill);
    sim.heli.tank.vol = got.vol; sim.heli.tank.milk = 1;
    sim.heli.body.setTranslation({ x: -0.1, y: 0.35, z: 0.25 }, true);
    run(sim, 0.05);
    sim.heli.body.setLinvel({ x: 0, y: -2.5, z: 0 }, true);
    let gouts = 0, reach = 0, burst = null;
    const seen = new Set();
    run(sim, 1.5, () => {
      for (const e of sim.events) if (e.type === 'tankBurst') burst = e;
      for (const q of sim.milk.parcels) if (q.src === 'spill' && !seen.has(q.run)) { seen.add(q.run); gouts++; }
      return zero();
    });
    run(sim, 6);
    const c = sim.crashInfo ? sim.crashInfo.pos : new THREE.Vector3();
    let pooled = 0;
    for (const pd of sim.milk.puddles) { pooled += pd.vol; reach = Math.max(reach, Math.hypot(pd.x - c.x, pd.z - c.z)); }
    return { crashed: sim.state === 'destroyed', burst, gouts, pooled, reach, conserved: same(sim.milk.totalMilk(), total0), vol: got.vol };
  };
  const lo = spill(0.2), hi = spill(1);
  check('a crash with milk aboard bursts the tank', lo.crashed && hi.crashed && !!hi.burst && Math.abs(hi.burst.fill - 1) < 0.02, hi.burst ? `fill ${f(hi.burst.fill, 2)}` : 'no burst');
  check('a full tank throws more gouts than a fifth-full one', hi.gouts > lo.gouts + 8, `${lo.gouts} vs ${hi.gouts}`);
  check('the spill pools in proportion to what was aboard', hi.pooled > lo.pooled * 2.5 && hi.pooled > hi.vol * 0.3, `${ml(lo.pooled)} vs ${ml(hi.pooled)} pooled`);
  check('milk is conserved through both spills', lo.conserved && hi.conserved);
}

// 8. Crash with milk aboard: the tank bursts, the hose goes, bodies stay bounded.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  const total0 = sim.milk.totalMilk();
  const got = sim.milk.take(sim.milk.bowl, 2e-5);
  sim.heli.tank.vol = got.vol; sim.heli.tank.milk = 1;
  sim.heli.body.setTranslation({ x: 0.0, y: 0.6, z: 0.3 }, true);
  run(sim, 0.05);
  sim.heli.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
  let parcels = 0, leakSeen = false;
  run(sim, 1.5, () => { parcels = Math.max(parcels, sim.milk.parcels.length); leakSeen ||= !!(sim.milk.leak && sim.milk.leak.debris); return zero(); });
  run(sim, 5, () => { leakSeen ||= !!(sim.milk.leak && sim.milk.leak.debris); return zero(); });
  const tankWreck = sim.debris.find((d) => d.part.name === 'tank');
  const tw = tankWreck && tankWreck.body.translation();
  const poolNearWreck = !!tw && sim.milk.puddles.some((pd) => Math.hypot(pd.x - tw.x, pd.z - tw.z) < pd.r + 0.04);
  check('a hard drop onto the table explodes', sim.state === 'destroyed', sim.crashInfo ? sim.crashInfo.reason : 'no crash');
  check('the tank bursts milk everywhere', parcels > 5 || sim.milk.puddles.length > 0, `${parcels} parcels, ${sim.milk.puddles.length} puddles`);
  check('breaks into its named parts', sim.debris.length === 16, `${sim.debris.length} pieces`);
  check('milk is conserved through a crash', same(sim.milk.totalMilk(), total0), `${ml(total0)} -> ${ml(sim.milk.totalMilk())}`);
  check('the split tank glugs out of the wreck and pools by it', leakSeen && !sim.milk.leak && poolNearWreck,
    `leak ${leakSeen ? 'ran' : 'never ran'}, pool by the wreck ${poolNearWreck ? 'yes' : 'no'}`);
  let maxBodies = 0;
  for (let i = 0; i < 12; i++) {
    sim.restartFlight();
    run(sim, 0.2);
    sim.heli.body.setTranslation({ x: 0.0, y: 0.5, z: 0.3 }, true);
    sim.heli.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
    run(sim, 0.6);
    maxBodies = Math.max(maxBodies, sim.world.bodies.len() - sim.extras.recorded().length); // the set pieces' own bodies are fixed in number
  }
  check('12 crash/restart cycles stay bounded', maxBodies < 75 && sim.debris.length <= CFG.crash.maxDebris, `max bodies ${maxBodies}, debris ${sim.debris.length}`);
  sim.restartFlight();
  run(sim, 1);
  check('restart puts a fresh skycrane on the pad', sim.state === 'flying' && sim.heli.type === 'skycrane' && sim.heli.grounded && sim.heli.tank.vol === 0);
}

// 9. Switching aircraft, and the bucket's latch combo on the micro heli.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  run(sim, 0.5);
  sim.setAircraft('micro');
  run(sim, 1);
  check('switch to the micro heli from the skycrane', sim.heli.type === 'micro' && sim.state === 'flying' && sim.world.bodies.len() - sim.extras.recorded().length < 30, `${sim.world.bodies.len()} bodies, ${sim.extras.recorded().length} of them set pieces`);
  sim.setAircraft('skycrane');
  run(sim, 1);
  check('switch back to the skycrane sits on the pad', sim.heli.type === 'skycrane' && sim.heli.grounded);
  sim.setAircraft('micro');
  const k = sim.milk.bucket;
  sim.detachBag(k, true);
  // hover the micro (so the bucket hangs in the air rather than in the table)
  sim.assist = true;
  sim.heli.body.setTranslation({ x: sim.heli.pos.x, y: 0.4, z: sim.heli.pos.z }, true);
  run(sim, 1.0);
  const hw = sim.heli.hookWorlds[0];
  k.body.setTranslation({ x: hw.x, y: hw.y - 0.17, z: hw.z }, true);
  sim.attachBag(k, { kind: 'heli', heli: sim.heli, hook: 0 });
  const got = sim.milk.take(sim.milk.bowl, 8e-6); k.mix(got.vol, got.milk, got.brew);
  const v0 = k.vol;
  const r = sim.milk.salvo();
  run(sim, 0.6);
  check('micro heli: salvo combo latches the bucket valve open', r === 'latched' && k.valveOpen && k.vol < v0 * 0.5, `valve ${k.valveOpen}, ${f(v0 * 1e6, 2)} ml -> ${f(k.vol * 1e6, 2)} ml`);
  run(sim, 4);
  check('the latch lets go once the bucket is empty', k.vol === 0 && !k.latched && !k.valveOpen, `${ml(k.vol)}`);
}

// 10. Feedback events: wheels touch down, a dragged hose scrapes, a snapping hose snatches.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  const seen = new Set();
  const tap = () => { for (const e of sim.drainEvents()) seen.add(e.type); };
  const step = (secs, fn) => { const n = Math.round(secs / sim.dt); for (let i = 0; i < n; i++) { sim.step(fn ? fn() : zero()); tap(); } };
  step(1.6, () => ({ ...zero(), collective: 1 }));
  step(1.0, () => ({ ...zero(), reel: 1 }));
  step(1.0);
  step(0.5, () => ({ ...zero(), collective: -1 }));
  const ap = new Autopilot();
  ap.target.set(sim.heli.pos.x, 0.16, sim.heli.pos.z); ap.maxSpeed = 0.2;
  step(3, () => ap.update(sim.heli));
  ap.target.set(sim.heli.pos.x + 0.25, 0.16, sim.heli.pos.z);
  step(3, () => ap.update(sim.heli));
  check('a hose dragged across the table scrapes', seen.has('scrape'));
  ap.target.set(sim.heli.pos.x, 0.45, sim.heli.pos.z); ap.maxSpeed = 0.5;
  step(2.5, () => ({ ...ap.update(sim.heli), collective: 1 }));
  check('climbing away snaps the slack hose taut (snatch)', seen.has('snatch'));
  const fly = () => (sim.heli ? ap.update(sim.heli) : zero());
  ap.target.set(-0.56, 0.4, 0.24); ap.maxSpeed = 0.25;
  step(6, fly);
  ap.target.set(-0.56, 0.2, 0.24); ap.maxSpeed = 0.1;
  step(4, fly);
  step(3, () => ({ ...(sim.heli ? ap.update(sim.heli) : zero()), collective: -1 }));
  check('landing on the wheels gives a touchdown', seen.has('touchdown') && sim.state === 'flying', [...seen].join(', ') + (sim.heli ? ` at ${sim.heli.pos.toArray().map((v) => f(v)).join(',')} grounded ${sim.heli.grounded} clear ${f(sim.heli.skidClearance, 4)}` : ''));
}

// 11. Cost.
{
  const sim = new Sim({ aircraft: 'skycrane' });
  sim.heli.tank.vol = TANK_CAPACITY * 0.8;
  climb(sim);
  const t0 = performance.now();
  run(sim, 1, () => ({ ...zero(), doors: 0.5, reel: 0.3 }));
  const ms = (performance.now() - t0) / Math.round(1 / sim.dt);
  check('physics step cost with hose and stream', ms < 1.2, `${f(ms, 3)} ms per step (${sim.world.bodies.len()} bodies, ${sim.milk.parcels.length} parcels)`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} skycrane checks passed`);
process.exit(failed.length ? 1 : 0);
