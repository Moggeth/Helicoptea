// Headless physics checks: run with `npm run check`. Drives the real simulation with the same
// stick inputs a player produces (via a scripted autopilot) and asserts on physical outcomes.
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { CFG } from '../src/config.js';
import { springCollective, springStick } from '../src/sim/collective.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const SLOW = 1.8; // the heavy tuning needs more (sim) time for scripted manoeuvres
const run = (sim, seconds, fn) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) sim.step(fn ? fn(i * sim.dt) : zero()); };
const f = (x, d = 3) => Number(x).toFixed(d);

// 1. Rests on the pad without drifting or exploding.
{
  const sim = new Sim();
  const p0 = sim.heli.pos.clone();
  run(sim, 2);
  check('heli rests on pad', sim.state === 'flying' && sim.heli.pos.distanceTo(p0) < 0.01, `moved ${f(sim.heli.pos.distanceTo(p0), 4)} m`);
  const bagsOk = sim.bags.length === sim.pegs.length && sim.pegs.every((p) => p.bag && p.bag.attach.kind === 'peg' && p.bag.pos.y > p.tip.y - 0.22);
  check('a bag hangs from every peg on both stands', bagsOk, sim.bags.map((b) => f(b.pos.y)).join(', '));
}

// 2. Assist on: lift off, hover, neutral stick holds attitude level and sinks/climbs on command.
{
  const sim = new Sim();
  run(sim, 1.2, () => ({ ...zero(), collective: 1 }));
  const yUp = sim.heli.pos.y;
  run(sim, 3);
  const vy = Math.abs(sim.heli.vel.y), tilt = Math.acos(Math.min(1, sim.heli.up.y));
  check('assist: climbs on collective', yUp > 0.25, `y=${f(yUp)}`);
  check('assist: neutral stick hovers level', vy < 0.05 && tilt < 0.05 && sim.state === 'flying', `vy=${f(vy)} tilt=${f(tilt)}`);
  // full forward cyclic gives sensible forward speed
  run(sim, 1.0, () => ({ ...zero(), collective: 1 }));
  run(sim, 0.9, () => ({ ...zero(), pitch: 1 }));
  const vF = -sim.heli.vel.z;
  check('assist: forward cyclic accelerates forward', vF > 0.4 && vF < 2.5, `v=${f(vF)} m/s`);
  run(sim, 3);
  check('assist: drift settles after release', sim.heli && sim.heli.vel.length() < 0.15, sim.heli ? `v=${f(sim.heli.vel.length())}` : `crashed: ${sim.crashInfo?.reason}`);
}

// 3. Assist off: a pulse of cyclic leaves the heli tilted (no auto-level) -> drifting.
{
  CFG.collective.mode = 'hold'; // these checks trim the collective by hand, as the hold lever does
  const sim = new Sim();
  sim.assist = false;
  let c = 0;
  sim.heli.collective = 1.43 / CFG.heli.thrustToWeight; // climb away from the pad...
  run(sim, 0.7);
  sim.heli.collective = 1.06 / CFG.heli.thrustToWeight; // ...then trim to roughly hover, as a player would
  run(sim, 0.5);
  run(sim, 0.15, () => ({ ...zero(), pitch: 1 }));
  const tilt0 = Math.acos(sim.heli.up.y);
  run(sim, 0.8);
  const tilt1 = Math.acos(sim.heli.up.y);
  check('assist off: attitude persists after releasing cyclic', tilt1 > tilt0 * 0.6 && tilt1 > 0.08, `tilt ${f(tilt0)} -> ${f(tilt1)} rad`);
  check('assist off: helicopter drifts without correction', sim.heli ? sim.heli.vel.length() > 0.2 : true, `v=${f(sim.heli ? sim.heli.vel.length() : 0)}`);
  CFG.collective.mode = 'spring';
}

// 4. Full loop: attach at the stand, carry, dip into the mug, brew, extract, discard, land.
{
  const sim = new Sim();
  const ap = new Autopilot();
  const heli = () => sim.heli;
  const peg = sim.pegs[1];
  ap.yaw = 0;
  // take off and go to the peg loop (hook ~at loop height)
  const hookDrop = -CFG.heli.hookOffset[1];
  const goto = (x, y, z, secs, opts = {}) => {
    ap.target.set(x, y, z);
    ap.maxSpeed = opts.speed ?? 0.35;
    run(sim, secs * SLOW, () => {
      if (!sim.heli) return zero();
      const cb = sim.carriedBag();
      const swing = cb && opts.damp ? cb.vel.clone().sub(sim.heli.vel) : null;
      return ap.update(sim.heli, swing);
    });
  };
  goto(sim.heli.pos.x, 0.42, sim.heli.pos.z, 2);
  goto(peg.tip.x, 0.42, peg.tip.z + 0.004, 4, { speed: 0.3 });
  goto(peg.tip.x, peg.tip.y + hookDrop + 0.008, peg.tip.z + 0.004, 3, { speed: 0.15 });
  const cand = sim.attachCandidate();
  const dHook = sim.heli.hookWorld.distanceTo(peg.tip);
  check('reach the stand loop with the hook', !!cand, `hook-loop distance ${f(dHook)} m, state ${sim.state}`);
  const attached = sim.toggleAttach();
  const bag = sim.carriedBag();
  check('attach by proximity', attached && !!bag);
  if (bag) {
    goto(peg.tip.x, 0.45, peg.tip.z + 0.03, 2.5, { speed: 0.15 });
    const ropeD = bag.anchorWorld.distanceTo(sim.heli.hookWorld);
    check('bag hangs on string below heli', ropeD > CFG.cargo.ropeLength * 0.9 && ropeD < CFG.cargo.ropeLength + CFG.cargo.attachRadius && bag.pos.y < sim.heli.pos.y - 0.1, `rope ${f(ropeD)} m`);
    // carry to mug: hover above then descend so bag goes into the tea
    const mug = sim.cups[0];
    let maxSwing = 0;
    goto(mug.x, 0.4, mug.z, 7, { speed: 0.3, damp: true });
    const lateral = Math.hypot(bag.pos.x - sim.heli.pos.x, bag.pos.z - sim.heli.pos.z);
    check('carry across the table', sim.state === 'flying' && Math.hypot(sim.heli.pos.x - mug.x, sim.heli.pos.z - mug.z) < 0.05, `heli-mug ${f(Math.hypot(sim.heli.pos.x - mug.x, sim.heli.pos.z - mug.z))} m, bag offset ${f(lateral)}`);
    // acceleration makes the bag swing: hard push and measure lateral offset
    // descend so the bag goes into water: bag bottom at waterY - 0.03
    const hookYForDip = mug.waterY - 0.02 + CFG.cargo.bagHalf[1] * 2 + CFG.cargo.ropeLength;
    const yForDip = hookYForDip + hookDrop;
    const massBefore = bag.mass;
    const brewMugBefore = mug.brew, brewCupBefore = sim.cups[1].brew;
    let maxImm = 0, tensionInWater = 0;
    ap.target.set(mug.x, yForDip, mug.z);
    ap.maxSpeed = 0.1;
    // Hold above the rim until the bag is centred, then lower it in.
    ap.target.set(mug.x, 0.36, mug.z); // bag just above the rim
    run(sim, 4 * SLOW, () => (sim.heli ? ap.update(sim.heli, bag.vel.clone().sub(sim.heli.vel), bag.pos) : zero()));
    // Lower straight down, holding the heli where it put the bag over the cup.
    ap.target.set(mug.x + sim.heli.pos.x - bag.pos.x, yForDip, mug.z + sim.heli.pos.z - bag.pos.z);
    ap.maxSpeed = 0.05;
    run(sim, 10 * SLOW, () => { if (!sim.heli) return zero(); maxImm = Math.max(maxImm, bag.immersion); return ap.update(sim.heli, bag.vel.clone().sub(sim.heli.vel)); });
    check('bag immerses in the mug water', maxImm > 0.5, `max immersion ${f(maxImm)} heli y ${f(sim.heli ? sim.heli.pos.y : -1)} bag y ${f(bag.pos.y)} waterY ${f(mug.waterY)}`);
    check('wetness increases mass while soaking', bag.mass > massBefore + 0.004, `mass ${f(massBefore * 1000, 1)} g -> ${f(bag.mass * 1000, 1)} g, wet ${f(bag.wetness)}`);
    check('tea brews only in the immersed cup', mug.brew > brewMugBefore + 0.15 && sim.cups[1].brew === brewCupBefore, `mug ${f(mug.brew)} teacup ${f(sim.cups[1].brew)}`);
    check('no crash while dipping', sim.state === 'flying', sim.crashInfo ? `${sim.crashInfo.reason} at ${sim.crashInfo.pos.toArray().map((v) => f(v)).join(',')} impact ${f(sim.crashInfo.impact)}` : '');
    // extraction: climb, bag heavier, drains over time
    const wetAtExtract = bag.wetness;
    goto(mug.x, 0.45, mug.z, 3, { speed: 0.1 });
    const wetAfter3 = bag.wetness;
    check('extracted bag remains wet and heavy', bag.immersion === 0 && wetAfter3 > 0.5 * wetAtExtract && bag.mass > 0.008, `wet ${f(wetAtExtract)} -> ${f(wetAfter3)}, mass ${f(bag.mass * 1000, 1)} g`);
    check('heli can lift the fully wet bag', sim.heli && sim.heli.pos.y > 0.4, `heli y ${f(sim.heli ? sim.heli.pos.y : 0)}, collective ${f(sim.heli ? sim.heli.collective : 0)}`);
    const brewAtExtract = mug.brew;
    goto(0.5, 0.42, -0.29, 6, { speed: 0.3, damp: true });
    check('brewing stops after extraction', Math.abs(mug.brew - brewAtExtract) < 1e-6, `${f(brewAtExtract, 4)} -> ${f(mug.brew, 4)}`);
    check('bag drains gradually', bag.wetness < wetAfter3 && bag.wetness > 0.2, `wet ${f(bag.wetness)}`);
    ap.target.set(0.5, 0.3, -0.29); ap.maxSpeed = 0.1;
    run(sim, 4 * SLOW, () => (sim.heli ? ap.update(sim.heli, bag.vel.clone().sub(sim.heli.vel), bag.pos) : zero()));
    console.log('      before release: heli', sim.heli?.pos.toArray().map((x) => f(x)).join(','), 'bag', bag.pos.toArray().map((x) => f(x)).join(','));
    sim.toggleAttach();
    run(sim, 2, () => (sim.heli ? ap.update(sim.heli) : zero()));
    const onSaucer = sim.onDiscard(bag);
    check('released bag falls onto the discard saucer', !bag.attach && onSaucer, `bag at ${f(bag.pos.x)},${f(bag.pos.y)},${f(bag.pos.z)}`);
    // land on pad
    goto(-0.56, 0.3, 0.24, 7, { speed: 0.35 });
    goto(-0.56, 0.0, 0.24, 5, { speed: 0.1 });
    run(sim, 1);
    const evTypes = new Set(sim.events.map((e) => e.type));
    check('feedback events fire: extraction and touchdown', evTypes.has('extract') && evTypes.has('touchdown'), [...evTypes].filter((t) => ['snatch', 'extract', 'touchdown', 'scrape'].includes(t)).join(', '));
    check('lands back on the pad intact', sim.state === 'flying' && sim.heli.grounded, `y=${f(sim.heli ? sim.heli.pos.y : 0)} state ${sim.state}`);
  }
}

// 4b. Swing: a burst of acceleration makes the bag swing, and the swinging bag moves the heli.
{
  const pickUp = (withBag) => {
    const sim = new Sim();
    const ap = new Autopilot();
    const peg = sim.pegs[1];
    const go = (x, y, z, secs, speed) => { ap.target.set(x, y, z); ap.maxSpeed = speed; run(sim, secs * SLOW, () => (sim.heli ? ap.update(sim.heli) : zero())); };
    go(sim.heli.pos.x, 0.42, sim.heli.pos.z, 2, 0.35);
    go(peg.tip.x, 0.42, peg.tip.z + 0.004, 4, 0.3);
    go(peg.tip.x, peg.tip.y + 0.054, peg.tip.z + 0.004, 3, 0.15);
    if (withBag) sim.toggleAttach();
    go(peg.tip.x, 0.45, peg.tip.z + 0.05, 3, 0.15);
    return sim;
  };
  const trial = (withBag) => {
    const sim = pickUp(withBag);
    sim.assist = false;                                   // the bag's pull on the airframe, unmasked by assist
    CFG.collective.mode = 'hold';                         // keep the hover collective the assist left
    const p0 = sim.heli.pos.clone();
    run(sim, 0.2, () => ({ ...zero(), roll: 1 }));       // hard sideways acceleration
    run(sim, 0.2, () => ({ ...zero(), roll: -1 }));
    let maxAngle = 0, maxHeliRoll = 0;
    const xs = [];
    run(sim, 2.0, (t) => {
      const b = sim.carriedBag();
      if (b) {
        const d = b.anchorWorld.clone().sub(sim.heli.hookWorld);
        maxAngle = Math.max(maxAngle, Math.atan2(Math.hypot(d.x, d.z), -d.y));
      }
      if (!sim.heli) return zero();
      xs.push(sim.heli.pos.x);
      maxHeliRoll = Math.max(maxHeliRoll, Math.abs(Math.asin(Math.max(-1, Math.min(1, sim.heli.up.x)))));
      return zero();
    });
    CFG.collective.mode = 'spring';
    return { sim, maxAngle, dx: sim.heli.pos.x - p0.x, xs };
  };
  // Hook a bag (string slack at the peg) and climb away hard: the string should snatch taut.
  {
    const sim = new Sim();
    const ap = new Autopilot();
    const peg = sim.pegs[1];
    const go = (x, y, z, secs, speed) => { ap.target.set(x, y, z); ap.maxSpeed = speed; run(sim, secs * SLOW, () => (sim.heli ? ap.update(sim.heli) : zero())); };
    go(sim.heli.pos.x, 0.42, sim.heli.pos.z, 2, 0.35);
    go(peg.tip.x, 0.42, peg.tip.z + 0.004, 4, 0.3);
    go(peg.tip.x, peg.tip.y + 0.04, peg.tip.z + 0.004, 3, 0.15);
    sim.toggleAttach();
    sim.drainEvents();
    run(sim, 0.8, () => ({ ...zero(), collective: 1 }));
    const sn = sim.drainEvents().filter((e) => e.type === 'snatch');
    check('a slack string snatching taut is felt (snatch event)', sn.length > 0, sn.length ? `rel speed ${f(sn[0].speed)} m/s` : 'none');
  }
  const a = trial(true), b = trial(false);
  check('acceleration makes the bag swing', a.maxAngle > 0.1, `max string angle ${f(a.maxAngle * 57.3, 1)} deg`);
  const diff = Math.max(...a.xs.map((x, i) => Math.abs(x - b.xs[i])));
  check('the swinging bag moves the helicopter', diff > 0.01, `max path difference vs no bag ${f(diff * 100, 1)} cm, drift ${f(a.dx)} vs ${f(b.dx)} m`);
}

// 5. Crash thresholds: gentle landing survives; a hard dive destroys; bag touching table does not.
{
  const sim = new Sim();
  run(sim, 1.5, () => ({ ...zero(), collective: 1 }));
  sim.assist = false;
  CFG.collective.mode = 'hold';
  sim.heli.collective = 0.2;
  run(sim, 2.5);
  CFG.collective.mode = 'spring';
  check('hard drop onto the table explodes', sim.state === 'destroyed', `reason ${sim.crashInfo?.reason} impact ${f(sim.crashInfo?.impact ?? 0)}`);
  const debrisN = sim.debris.length;
  check('crash spawns recognisable debris parts', debrisN === 8, `${debrisN} parts`);
  sim.crash('again');
  check('no duplicate explosion for the same crash', sim.debris.length === debrisN);
  sim.restartFlight();
  check('restart flight restores heli on pad', sim.state === 'flying' && sim.heli.grounded !== undefined);
  // Crash right on the pad, then restart: the new heli must not spawn into the wreck and explode.
  for (let k = 0; k < 4; k++) {
    sim.heli.body.setTranslation({ x: sim.heli.pos.x, y: 0.12, z: sim.heli.pos.z }, true);
    sim.heli.body.setLinvel({ x: 0, y: -2.5, z: 0 }, true);
    run(sim, 0.6);
    sim.restartFlight();
  }
  run(sim, 2);
  check('restart onto a wrecked pad does not re-explode', sim.state === 'flying', `state ${sim.state}, debris ${sim.debris.length}`);

  const sim2 = new Sim();
  sim2.assist = true;
  run(sim2, 1.0, () => ({ ...zero(), collective: 1 }));
  run(sim2, 4, () => ({ ...zero(), collective: -1 }));
  check('gentle assisted landing survives', sim2.state === 'flying', `state ${sim2.state}`);
}

// 5b. Assist off, sprung lift stick (the default): centred settles gently, held up climbs, nothing sticks.
{
  for (const aircraft of ['micro', 'chinook', 'skycrane']) {
    const sim = new Sim({ aircraft });
    sim.assist = false;
    const tw = sim.heli.def.thrustToWeight;
    // Keep the cyclic level as a pilot would, so only the lift stick is under test. (This simple leveller
    // can't hold the skycrane's lagged disc, so it only takes off; the levels are shared code, checked below.)
    const level = (c) => () => {
      const h = sim.heli; if (!h) return zero();
      const q = h.quat.clone().invert(), w = h.body.angvel(), wb = new THREE.Vector3(w.x, w.y, w.z).applyQuaternion(q);
      const up = h.up.clone().applyQuaternion(q);
      return { pitch: Math.max(-1, Math.min(1, up.z * 8 + wb.x * 1.2)), roll: Math.max(-1, Math.min(1, -up.x * 8 + wb.z * 1.2)), yaw: 0, collective: c };
    };
    run(sim, 0.6, level(0));
    check(`${aircraft} spring: centred stick on the pad stays down at idle`, sim.heli.grounded && sim.heli.collective < 0.2, `collective ${f(sim.heli.collective)}`);
    const y0 = sim.heli.pos.y;
    let vMax = 0;
    run(sim, 0.7, (t) => { vMax = Math.max(vMax, sim.heli ? sim.heli.vel.y : 0); return level(1)(); });
    const climbed = sim.heli.pos.y - y0;
    check(`${aircraft} spring: holding lift up climbs, firmly not wildly`, climbed > 0.12 && vMax < 1.3, `+${f(climbed)} m, peak ${f(vMax)} m/s`);
    if (aircraft === 'skycrane') continue;
    run(sim, 2.5, level(0));
    const vy = sim.heli ? sim.heli.vel.y : NaN;
    check(`${aircraft} spring: letting go settles gently`, sim.state === 'flying' && vy < -0.05 && vy > -0.45, `vy ${f(vy)} m/s`);
    run(sim, 6, level(0));
    check(`${aircraft} spring: hands-off settle lands safely and idles`, sim.state === 'flying' && sim.heli.grounded && sim.heli.collective < 0.2, `${sim.state}, collective ${f(sim.heli?.collective ?? 0)}`);
  }
  // The levels: centre is measured against the all-up weight, full up is capped by the rotor.
  const tw = CFG.heli.thrustToWeight;
  const hoverWith = (load) => springCollective(0, tw, load) * tw / load;
  check('spring: centre stick sits just under hover, empty or loaded', Math.abs(hoverWith(1) - CFG.collective.neutral) < 1e-9 && Math.abs(hoverWith(1.5) - CFG.collective.neutral) < 1e-9);
  check('spring: full up is never more than full collective', springCollective(1, tw, 1.9) === 1 && springCollective(1, tw, 1) < 1);
  check('spring: the stick inverse round-trips', [-1, -0.4, 0, 0.3, 1].every((s) => Math.abs(springStick(springCollective(s, tw), tw) - s) < 1e-9));
  // Hold mode is still there: the collective stays where the stick left it.
  CFG.collective.mode = 'hold';
  const sim = new Sim();
  sim.assist = false;
  run(sim, 1.0, () => ({ ...zero(), collective: 1 }));
  const c1 = sim.heli.collective;
  run(sim, 0.3);
  check('hold mode: collective stays where you leave it', c1 > 0.3 && Math.abs(sim.heli.collective - c1) < 1e-9, `${f(c1)} -> ${f(sim.heli.collective)}`);
  CFG.collective.mode = 'spring';
}

// 6. Repeated crash/restart cycles stay bounded.
{
  const sim = new Sim();
  let maxBodies = 0;
  for (let k = 0; k < 25; k++) {
    sim.restartFlight();
    run(sim, 1.0, () => ({ ...zero(), collective: 1, pitch: 0.4 }));
    if (sim.state === 'flying') sim.crash('test');
    run(sim, 0.5);
    maxBodies = Math.max(maxBodies, sim.world.bodies.len());
  }
  check('25 crash/restart cycles keep body count bounded', maxBodies < 60 && sim.debris.length <= CFG.crash.maxDebris && sim.bags.length <= CFG.cargo.maxBags, `max bodies ${maxBodies}, debris ${sim.debris.length}, bags ${sim.bags.length}`);
  const t0 = performance.now();
  run(sim, 2);
  const ms = (performance.now() - t0) / (2 / sim.dt);
  check('physics step cost', ms < 1.0, `${f(ms, 3)} ms per 240 Hz step (${sim.world.bodies.len()} bodies)`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
