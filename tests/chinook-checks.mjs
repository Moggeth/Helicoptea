import { performanceBudget } from './performance-budget.mjs';
// Headless physics checks for the tandem-rotor Chinook (run by `npm run check` after sim-checks).
// Same approach as sim-checks: drive the real simulation with player-style stick inputs and assert
// on physical outcomes, including how the two rotors share the work.
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { CFG } from '../src/config.js';
import { CHINOOK_PARTS } from '../src/sim/chinook.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  chinook: ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const run = (sim, seconds, fn) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) sim.step(fn ? fn(i * sim.dt) : zero()); };
const f = (x, d = 3) => Number(x).toFixed(d);
const tilt = (h) => Math.acos(Math.min(1, h.up.y));
const C = CFG.chinook;
const make = () => new Sim({ aircraft: 'chinook' });
const SLOW = 1.8; // the heavy tuning needs more (sim) time for scripted manoeuvres, as in sim-checks
const hover = (sim, secs = 3) => { run(sim, 2.2, () => ({ ...zero(), collective: 1 })); run(sim, secs * 1.5); };
const fly = (sim, ap, x, y, z, secs, speed = 0.3, aim = null) => {
  ap.target.set(x, y, z); ap.maxSpeed = speed;
  run(sim, secs * SLOW, () => (sim.heli ? ap.update(sim.heli, null, aim ? aim() : null) : zero()));
};

// Keep station (autopilot) until a given hook comes within reach of the peg's loop, then hook it there,
// as a player would press the button at the right moment. Returns the hook-to-loop distance.
const hookWhenInReach = (sim, ap, peg, hook, secs) => {
  const loop = new THREE.Vector3();
  let d = 99;
  const n = Math.round(secs / sim.dt);
  for (let i = 0; i < n && sim.heli; i++) {
    sim.step(ap.update(sim.heli));
    if (!peg.bag) break;
    d = peg.bag.loopPosition(loop).distanceTo(sim.heli.hookWorlds[hook]);
    if (d < CFG.cargo.attachRadius * 0.8) {
      const bag = peg.bag;
      sim.detachBag(bag, true);
      sim.attachBag(bag, { kind: 'heli', heli: sim.heli, hook });
      break;
    }
  }
  return d;
};

// 1. Sits on its four wheels on the pad.
{
  const sim = make();
  const p0 = sim.heli.pos.clone();
  run(sim, 2);
  const h = sim.heli;
  check('rests on the pad on its wheels', sim.state === 'flying' && h.pos.distanceTo(p0) < 0.01 && h.grounded && tilt(h) < 0.02, `moved ${f(h.pos.distanceTo(p0), 4)} m, tilt ${f(tilt(h))}`);
  check('two rotors, three hooks, no tail rotor', h.rotors.length === 2 && h.hookWorlds.length === 3 && !CHINOOK_PARTS.some((p) => /tail/i.test(p.name)));
  check('much heavier than the micro heli', h.def.mass > 3 * CFG.heli.mass, `${f(h.def.mass * 1000, 1)} g vs ${f(CFG.heli.mass * 1000, 1)} g`);
}

// 2. Assisted hover: the rotors share the load evenly and their torques cancel.
{
  const sim = make();
  run(sim, 2.2, () => ({ ...zero(), collective: 1 }));
  const yUp = sim.heli.pos.y;
  run(sim, 6);
  const h = sim.heli;
  check('assist: climbs on collective', yUp > 0.25, `y=${f(yUp)}`);
  check('assist: neutral stick hovers level', Math.abs(h.vel.y) < 0.03 && tilt(h) < 0.03 && h.vel.length() < 0.05, `vy=${f(h.vel.y)} tilt=${f(tilt(h))} v=${f(h.vel.length())}`);
  const split = Math.abs(h.rotorT[0] - h.rotorT[1]) / (h.rotorT[0] + h.rotorT[1]);
  check('hover: both rotors carry half the weight', split < 0.03, `front ${f(h.rotorT[0])} N, aft ${f(h.rotorT[1])} N`);
  check('hover: no yaw without pedals', Math.abs(h.body.angvel().y) < 0.02, `yaw rate ${f(h.body.angvel().y)} rad/s`);
  check('hover: collective near half', h.collective > 0.4 && h.collective < 0.65, `collective ${f(h.collective)}`);
}

// 2b. Downwash: each rotor drives its own wake column into the table's outwash field.
{
  const sim = make();
  run(sim, 0.8, () => ({ ...zero(), collective: 1 }));
  run(sim, 1.5);
  const [a, b] = sim.air.wakes;
  check('downwash: two wake columns reach the table', a.active && b.active && a.vg > 0.3 && b.vg > 0.3 && a.hit.distanceTo(b.hit) > 0.1, `vg ${f(a.vg, 2)} / ${f(b.vg, 2)} m/s, ${f(a.hit.distanceTo(b.hit), 3)} m apart, outwash ${f(sim.air.maxSpeed(), 2)} m/s`);
}

// 3. Pitch is differential collective: nose-down stick unloads the front rotor and loads the aft one.
{
  const sim = make();
  hover(sim);
  let diff = 0;
  run(sim, 0.25, () => { diff = Math.max(diff, sim.heli.rotorThrust[1] - sim.heli.rotorThrust[0]); return { ...zero(), pitch: 1 }; });
  check('forward stick: aft rotor thrust exceeds forward rotor', diff > 0.3 * C.diffCollective * C.thrustToWeight * sim.heli.def.mass * 9.81 / 2, `max aft-front ${f(diff, 4)} N`);
  run(sim, 0.75, () => ({ ...zero(), pitch: 1 }));
  const vF = -sim.heli.vel.z;
  check('assist: forward cyclic accelerates forward', vF > 0.25 && vF < 2, `v=${f(vF)} m/s`);
  run(sim, 5);
  if (!sim.heli) console.log('      crash at', sim.crashInfo.pos.toArray().map((x) => f(x)).join(','));
  check('assist: drift settles after release', sim.heli && sim.heli.vel.length() < 0.15 && tilt(sim.heli) < 0.04, sim.heli ? `v=${f(sim.heli.vel.length())} tilt ${f(tilt(sim.heli))}` : `crashed: ${sim.crashInfo?.reason}`);
}

// 4. Weightier than the micro: slower to get moving from the same stick input.
{
  const timeTo = (sim, speed) => {
    hover(sim);
    let t = 0;
    while (t < 4 && sim.heli && -sim.heli.vel.z < speed) { run(sim, 0.01, () => ({ ...zero(), pitch: 1 })); t += 0.01; }
    return t;
  };
  const tc = timeTo(make(), 0.3), tm = timeTo(new Sim(), 0.3);
  check('slower to accelerate than the micro heli', tc > tm * 1.25, `0 -> 0.3 m/s: chinook ${f(tc, 2)} s, micro ${f(tm, 2)} s`);
}

// 5. Roll tilts both discs the same way; yaw tilts them in opposite directions (no tail rotor).
{
  const sim = make();
  hover(sim);
  let a = 0, b = 0;
  run(sim, 0.3, () => { a = Math.max(a, sim.heli.tilt[0]); b = Math.max(b, sim.heli.tilt[1]); return { ...zero(), roll: 1 }; });
  check('roll: both discs tilt the same way', a > 0.02 && b > 0.02 && Math.abs(a - b) < 0.5 * Math.max(a, b), `front ${f(a)} aft ${f(b)} rad`);
  run(sim, 4);
  const h0 = sim.heli.heading();
  let tf = 0, ta = 0;
  run(sim, 2, (t) => { if (Math.abs(t - 1) < 0.003) { tf = sim.heli.tilt[0]; ta = sim.heli.tilt[1]; } return { ...zero(), yaw: -1 }; });
  const dh = Math.atan2(Math.sin(sim.heli.heading() - h0), Math.cos(sim.heli.heading() - h0));
  check('yaw: discs tilt in opposite directions', tf * ta < 0 && Math.abs(tf) > 0.005 && Math.abs(ta) > 0.005, `front ${f(tf)} aft ${f(ta)} rad`);
  check('yaw: turns at the commanded rate', dh > 1.2 && dh < 2.2, `heading change ${f(dh)} rad in 2 s (target ${f(2 * C.assist.yawRate)})`);
  run(sim, 2);
  const h1 = sim.heli.heading();
  run(sim, 3);
  check('yaw: holds heading after release', Math.abs(sim.heli.heading() - h1) < 0.05, `drift ${f(sim.heli.heading() - h1)} rad`);
}

// 6. Assist off: attitude persists after a cyclic pulse, and the helicopter drifts.
{
  const sim = make();
  sim.assist = false;
  run(sim, 1.2, () => ({ ...zero(), collective: 1 }));
  sim.heli.collective = 0.56;
  run(sim, 1.2);
  sim.heli.collective = 0.5;
  run(sim, 0.3);
  run(sim, 0.18, () => ({ ...zero(), pitch: 1 }));
  const t0 = tilt(sim.heli);
  run(sim, 0.6);
  const t1 = sim.heli ? tilt(sim.heli) : 0;
  check('assist off: attitude persists after releasing cyclic', sim.heli && t1 > t0 * 0.6 && t1 > 0.06, `tilt ${f(t0)} -> ${f(t1)} rad`);
  check('assist off: drifts without correction', sim.heli && sim.heli.vel.length() > 0.15, `v=${f(sim.heli ? sim.heli.vel.length() : 0)}`);
  check('assist off: no crash in open air', sim.state === 'flying', sim.crashInfo?.reason || '');
}

// 7. Heavy haul: line up along the tea stand and hook all three bags, one per hook, then lift them.
{
  const sim = make();
  const ap = new Autopilot();
  ap.yaw = Math.PI / 2; // nose towards -x: the three hooks line up with the three pegs
  const peg = sim.pegs[1];
  const hookDrop = -C.hooks[1][1];
  fly(sim, ap, sim.heli.pos.x, 0.42, sim.heli.pos.z, 3);
  fly(sim, ap, peg.tip.x, 0.42, peg.tip.z + 0.004, 5, 0.25);
  fly(sim, ap, peg.tip.x, peg.tip.y + hookDrop + 0.012, peg.tip.z + 0.004, 10, 0.08); // lighter drag: give it time to settle
  fly(sim, ap, peg.tip.x, peg.tip.y + hookDrop + 0.012, peg.tip.z + 0.004, 5, 0.03);
  if (process.env.DEBUG_HOOKS) console.log('heli', sim.heli.pos.toArray().map((v) => f(v)), 'hdg', f(sim.heli.heading()), 'hooks', sim.heli.hookWorlds.map((h) => h.toArray().map((v) => f(v)).join(',')), 'pegs', sim.pegs.map((p) => [f(p.tip.x), f(p.tip.y), f(p.tip.z)]));
  let hooked = 0;
  for (let i = 0; i < 3; i++) if (sim.attachCandidate() && sim.toggleAttach()) hooked++;
  const bags = sim.carriedBags();
  const hooks = new Set(bags.map((b) => b.attach.hook));
  check('hooks three bags at once, one per hook', hooked === 3 && bags.length === 3 && hooks.size === 3, `hooked ${hooked}, hooks used ${[...hooks].join(',')}, state ${sim.state}`);
  const collEmpty = 0.541;
  fly(sim, ap, peg.tip.x, 0.48, peg.tip.z + 0.06, 5, 0.12);
  const h = sim.heli;
  check('lifts all three bags clear of the stand', h && sim.carriedBags().length === 3 && sim.carriedBags().every((b) => b.pos.y > 0.15 && !b.attach.peg), h ? `bag heights ${sim.carriedBags().map((b) => f(b.pos.y)).join(', ')}` : `crashed ${sim.crashInfo?.reason}`);
  check('carrying more needs more collective', h && h.collective > collEmpty + 0.02, h ? `collective ${f(h.collective)}` : '');
  // A drop releases everything.
  const released = sim.toggleAttach();
  check('release drops every carried bag', released && sim.carriedBags().length === 0);
}

// 8. A load on the forward hook pitches the nose down until the assist learns the trim.
{
  const sim = make();
  const ap = new Autopilot();
  ap.yaw = 0; // nose towards the stand: the forward hook reaches the middle loop first
  const peg = sim.pegs[1];
  const hookDrop = -C.hooks[0][1];
  fly(sim, ap, sim.heli.pos.x, 0.42, sim.heli.pos.z, 3);
  fly(sim, ap, peg.tip.x, 0.42, peg.tip.z + 0.034, 5, 0.25);
  fly(sim, ap, peg.tip.x, peg.tip.y + hookDrop + 0.02, peg.tip.z + 0.026, 8, 0.1);
  // Hang the middle bag on the forward hook (both end hooks and the centre one are often in reach here;
  // which one Space picks depends on centimetres, so take the forward one explicitly).
  const dFwd = hookWhenInReach(sim, ap, peg, 0, 8);
  const bag = sim.carriedBags()[0];
  check('forward hook reaches the middle bag', !!bag && bag.attach.hook === 0, `closest approach ${f(dFwd)} m`);
  if (bag) {
    // Soak the bag (as if it had been dipped) so the offset load is large.
    bag.wetness = 1; bag.peakWet = 1;
    fly(sim, ap, peg.tip.x, 0.5, peg.tip.z + 0.12, 6, 0.1);
    const h = sim.heli;
    check('assist trims out an off-centre load', h && tilt(h) < 0.06 && h.vel.length() < 0.1 && Math.abs(h.trim[0]) > 0.05, h ? `tilt ${f(tilt(h))} v ${f(h.vel.length())} pitch trim ${f(h.trim[0])}` : `crashed ${sim.crashInfo?.reason}`);
  }
}

// 9. Full tea run with the centre hook: pick up, dip into the mug, brew, lift out, drop on the saucer, land.
{
  const sim = make();
  const ap = new Autopilot();
  const peg = sim.pegs[1];
  const hookDrop = -C.hooks[1][1];
  ap.yaw = 0;
  fly(sim, ap, sim.heli.pos.x, 0.42, sim.heli.pos.z, 3);
  fly(sim, ap, peg.tip.x, 0.42, peg.tip.z + 0.004, 5, 0.25);
  fly(sim, ap, peg.tip.x, peg.tip.y + hookDrop + 0.02, peg.tip.z + 0.004, 7, 0.1);
  const dMid = hookWhenInReach(sim, ap, peg, 1, 8);
  const bag = sim.carriedBags()[0];
  check('centre hook reaches a bag', !!bag && bag.attach.hook === 1, `closest approach ${f(dMid)} m`);
  if (bag) {
    const mug = sim.cups[0];
    const swing = () => bag.vel.clone().sub(sim.heli.vel);
    fly(sim, ap, peg.tip.x, 0.46, peg.tip.z + 0.05, 2.5, 0.12);
    ap.target.set(mug.x, 0.4, mug.z); ap.maxSpeed = 0.25;
    run(sim, 8 * SLOW, () => (sim.heli ? ap.update(sim.heli, swing()) : zero()));
    ap.target.set(mug.x, 0.32, mug.z); ap.maxSpeed = 0.08;
    run(sim, 5 * SLOW, () => (sim.heli ? ap.update(sim.heli, swing(), bag.pos) : zero()));
    const yForDip = mug.waterY - 0.02 + CFG.cargo.bagHalf[1] * 2 + CFG.cargo.ropeLength + hookDrop;
    ap.target.set(mug.x + sim.heli.pos.x - bag.pos.x, yForDip, mug.z + sim.heli.pos.z - bag.pos.z);
    ap.maxSpeed = 0.05;
    let maxImm = 0;
    const brew0 = mug.brew;
    run(sim, 10, () => { if (!sim.heli) return zero(); maxImm = Math.max(maxImm, bag.immersion); return ap.update(sim.heli, swing()); });
    check('dips the bag into the mug', maxImm > 0.5 && sim.state === 'flying', `max immersion ${f(maxImm)}, state ${sim.state}`);
    check('the tea brews', mug.brew > brew0 + 0.15, `brew ${f(brew0)} -> ${f(mug.brew)}`);
    fly(sim, ap, mug.x, 0.45, mug.z, 3, 0.1);
    check('lifts the soaked bag out', sim.heli && bag.immersion === 0 && bag.mass > 0.008 && bag.attach, `mass ${f(bag.mass * 1000, 1)} g`);
    ap.target.set(0.5, 0.42, -0.29); ap.maxSpeed = 0.25;
    run(sim, 7 * SLOW, () => (sim.heli ? ap.update(sim.heli, swing()) : zero()));
    ap.target.set(0.5, 0.3, -0.29); ap.maxSpeed = 0.08;
    run(sim, 5 * SLOW, () => (sim.heli ? ap.update(sim.heli, swing(), bag.pos) : zero()));
    sim.toggleAttach();
    run(sim, 2, () => (sim.heli ? ap.update(sim.heli) : zero()));
    check('drops the bag on the saucer', !bag.attach && sim.onDiscard(bag), `bag at ${f(bag.pos.x)},${f(bag.pos.y)},${f(bag.pos.z)}`);
    fly(sim, ap, -0.56, 0.3, 0.24, 8, 0.3);
    fly(sim, ap, -0.56, 0.0, 0.24, 7, 0.08);
    run(sim, 1);
    check('lands back on the pad intact', sim.state === 'flying' && sim.heli.grounded, `y=${f(sim.heli ? sim.heli.pos.y : 0)} state ${sim.state} ${sim.crashInfo?.reason || ''}`);
  }
}

// 10. Breakup: a hard drop explodes into recognisable pieces; rotors keep spinning their own ways.
{
  const sim = make();
  run(sim, 1.5, () => ({ ...zero(), collective: 1 }));
  sim.assist = false;
  CFG.collective.mode = 'hold';
  sim.heli.collective = 0.15;
  for (let i = 0; i < 2.5 / sim.dt && sim.state === 'flying'; i++) sim.step(zero());
  CFG.collective.mode = 'spring';
  run(sim, 0.03);
  const spin = (re) => sim.debris.filter((d) => re.test(d.part.name)).map((d) => d.body.angvel());
    const fwd = spin(/^bladeF/).map((w) => w.y), aft = spin(/^bladeA/).map((w) => w.y);
  check('hard drop onto the table explodes', sim.state === "destroyed", `reason ${sim.crashInfo?.reason} impact ${f(sim.crashInfo?.impact ?? 0)}`);
  check('breaks into its named parts', sim.debris.length === CHINOOK_PARTS.length, `${sim.debris.length} of ${CHINOOK_PARTS.length} parts`);
  check('forward and aft blades spin opposite ways', fwd.length === 3 && aft.length === 3 && fwd.filter((w) => w > 0).length >= 2 && aft.filter((w) => w < 0).length >= 2, `fwd ${fwd.map((w) => f(w, 0)).join(',')} aft ${aft.map((w) => f(w, 0)).join(',')}`);
  const n = sim.debris.length;
  sim.crash('again');
  check('no duplicate explosion for the same crash', sim.debris.length === n);
  sim.restartFlight();
  check('restart puts a new Chinook on the pad', sim.state === 'flying' && sim.heli.type === 'chinook');

  const sim2 = make();
  run(sim2, 1.2, () => ({ ...zero(), collective: 1 }));
  run(sim2, 6, () => ({ ...zero(), collective: -1 }));
  check('gentle assisted landing survives', sim2.state === 'flying' && sim2.heli.grounded, `state ${sim2.state}`);
}

// 11. Switching aircraft keeps the tea table, and cycles stay bounded.
{
  const sim = make();
  sim.cups[0].brew = 0.4;
  sim.setAircraft('micro');
  check('switch to the micro heli keeps the brew', sim.heli.type === 'micro' && sim.cups[0].brew === 0.4 && sim.heli.grounded !== undefined);
  sim.setAircraft('chinook');
  run(sim, 1);
  check('switch back to the Chinook sits on the pad', sim.heli.type === 'chinook' && sim.heli.grounded, `y ${f(sim.heli.pos.y)}`);
  let maxBodies = 0;
  for (let k = 0; k < 20; k++) {
    sim.restartFlight();
    run(sim, 1.0, () => ({ ...zero(), collective: 1, pitch: 0.4 }));
    if (sim.state === 'flying') sim.crash('test');
    run(sim, 0.4);
    maxBodies = Math.max(maxBodies, sim.world.bodies.len() - sim.extras.recorded().length); // the set pieces' own bodies are fixed in number
  }
  check('20 crash/restart cycles stay bounded', maxBodies < 70 && sim.debris.length <= CFG.crash.maxDebris, `max bodies ${maxBodies}, debris ${sim.debris.length}`);
  const t0 = performance.now();
  run(sim, 2);
  const ms = (performance.now() - t0) / (2 / sim.dt);
  performanceBudget(check, 'physics step cost', ms, 1.0, `${f(ms, 3)} ms per 240 Hz step`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} chinook checks passed`);
process.exit(failed.length ? 1 : 0);
