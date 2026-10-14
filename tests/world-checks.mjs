// Headless checks for the bigger world (house + tea garden): every cup is usable, the back door and the
// window are flyable, the garden stand works, crashes outside restart cleanly, and the garden is closed.
// Run: node tests/world-checks.mjs
import * as THREE from 'three';
import { initPhysics, RAPIER, GROUPS } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { TeaBag } from '../src/sim/teabag.js';
import { CFG } from '../src/config.js';
import { GARDEN, BACKDOOR, WINDOW, ROOM, PAD, RADIO, COUNTER, TREE, LAMP, DRESSER, linePoint } from '../src/sim/layout.js';
import { gearDrop } from '../src/sim/aircraft.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const SLOW = 1.8;
const run = (sim, seconds, fn) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n; i++) sim.step(fn ? fn(i * sim.dt) : zero()); };
const f = (x, d = 3) => Number(x).toFixed(d);
const hookDrop = -CFG.heli.hookOffset[1];

function pilot(sim) {
  const ap = new Autopilot();
  ap.yaw = 0;
  const goto = (x, y, z, secs, opts = {}) => {
    ap.target.set(x, y, z);
    ap.maxSpeed = opts.speed ?? 0.35;
    let minY = Infinity;
    run(sim, secs * SLOW, () => {
      if (!sim.heli) return zero();
      minY = Math.min(minY, sim.heli.pos.y);
      const cb = sim.carriedBag();
      const swing = cb && opts.damp ? cb.vel.clone().sub(sim.heli.vel) : null;
      return ap.update(sim.heli, swing);
    });
    return minY;
  };
  return { ap, goto };
}

// 1. Every cup beyond the kitchen table holds a bag dropped into it: it immerses, wets and brews.
{
  const sim = new Sim();
  for (const cup of sim.cups.slice(2)) {
    const bag = new TeaBag(sim, new THREE.Vector3(cup.x, cup.topY + 0.045, cup.z), new THREE.Quaternion());
    sim.bags.push(bag);
    let maxImm = 0;
    run(sim, 5, () => { maxImm = Math.max(maxImm, bag.immersion); return zero(); });
    check(`${cup.name}: a dropped bag immerses and brews`, maxImm > 0.5 && cup.brew > 0.05 && bag.pos.y > cup.floorY - 0.01,
      `immersion ${f(maxImm)}, brew ${f(cup.brew)}, bag y ${f(bag.pos.y)} floor ${f(cup.floorY)}`);
  }
  check('only the dosed cups brewed', sim.cups[0].brew === 0 && sim.cups[1].brew === 0);
}

// 2. Out through the back door, hook a bag on the garden stand, dip it in the garden teacup.
{
  const sim = new Sim();
  const { ap, goto } = pilot(sim);
  const dx = (BACKDOOR.x0 + BACKDOOR.x1) / 2;
  goto(sim.heli.pos.x, 0.35, sim.heli.pos.z, 2);
  goto(dx, 0.35, -0.9, 7);
  goto(dx, 0.35, -2.2, 7, { speed: 0.3 });
  check('flies out through the back door', sim.state === 'flying' && sim.heli.pos.z < GARDEN.maxZ - 0.3, `heli at ${sim.heli ? sim.heli.pos.toArray().map((v) => f(v)).join(',') : sim.crashInfo?.reason}`);
  const peg = sim.pegs.find((p) => p.station === 1 && p.index === 1);
  goto(peg.tip.x, 0.38, peg.tip.z + 0.004, 7, { speed: 0.3 });
  goto(peg.tip.x, peg.tip.y + hookDrop + 0.008, peg.tip.z + 0.004, 4, { speed: 0.12 });
  const cand = sim.attachCandidate();
  check('reaches a loop on the garden stand', cand === peg.bag, `hook-loop ${sim.heli ? f(sim.heli.hookWorld.distanceTo(peg.tip)) : '-'} m, state ${sim.state}`);
  sim.toggleAttach();
  const bag = sim.carriedBag();
  check('hooks the garden bag', !!bag);
  if (bag) {
    const cup = sim.cups.find((c) => c.id === 'garden');
    goto(peg.tip.x, 0.4, peg.tip.z + 0.03, 2.5, { speed: 0.15 });
    goto(cup.x, 0.38, cup.z, 7, { speed: 0.25, damp: true });
    ap.target.set(cup.x, cup.topY + 0.3, cup.z);
    ap.maxSpeed = 0.1;
    run(sim, 4 * SLOW, () => (sim.heli ? ap.update(sim.heli, bag.vel.clone().sub(sim.heli.vel), bag.pos) : zero()));
    const yForDip = cup.waterY - 0.02 + CFG.cargo.bagHalf[1] * 2 + CFG.cargo.ropeLength + hookDrop;
    ap.target.set(cup.x + sim.heli.pos.x - bag.pos.x, yForDip, cup.z + sim.heli.pos.z - bag.pos.z);
    ap.maxSpeed = 0.05;
    let maxImm = 0;
    run(sim, 10 * SLOW, () => { if (!sim.heli) return zero(); maxImm = Math.max(maxImm, bag.immersion); return ap.update(sim.heli, bag.vel.clone().sub(sim.heli.vel)); });
    check('dips into the garden teacup', maxImm > 0.5 && cup.brew > 0.1 && sim.state === 'flying', `immersion ${f(maxImm)}, brew ${f(cup.brew)}, state ${sim.state}`);
  }
}

// 3. The window is flyable too: out through a lower pane of the open casement.
{
  const sim = new Sim();
  const { goto } = pilot(sim);
  const wx = WINDOW.x - WINDOW.w / 4;
  goto(sim.heli.pos.x, 0.42, sim.heli.pos.z, 2);
  goto(wx, 0.42, -0.9, 7);
  goto(wx, 0.42, -2.3, 8, { speed: 0.25 });
  check('flies out through the open window', sim.state === 'flying' && sim.heli.pos.z < -2.0, `heli at ${sim.heli ? sim.heli.pos.toArray().map((v) => f(v)).join(',') : sim.crashInfo?.reason}`);
}

// 4. A crash in the garden restarts on the kitchen pad with cargo; reset restores both stands.
{
  const sim = new Sim();
  const h = sim.heli;
  h.body.setTranslation({ x: 0.3, y: GARDEN.groundY + 0.25, z: -4.4 }, true);
  h.body.setLinvel({ x: 0, y: -2.5, z: 0 }, true);
  run(sim, 1.5);
  check('a hard landing on the lawn explodes', sim.state === 'destroyed', `state ${sim.state}`);
  sim.restartFlight();
  run(sim, 0.5);
  check('restart puts the heli back on the kitchen pad', sim.state === 'flying' && Math.hypot(sim.heli.pos.x - PAD.x, sim.heli.pos.z - PAD.z) < 0.02);
  check('the kitchen stand has bags after a restart', sim.pegs.filter((p) => p.station === 0).every((p) => p.bag));
  sim.cups.forEach((c) => { c.brew = 0.5; });
  sim.resetSandbox();
  run(sim, 0.2);
  check('reset sandbox refills both stands and empties every cup', sim.pegs.every((p) => p.bag) && sim.cups.every((c) => c.brew === 0) && sim.bags.length === sim.pegs.length);
}

// 5. The world is closed: the fences stop anything leaving the garden, and the house has no gaps.
{
  const sim = new Sim();
  run(sim, 0.05); // build the query structures
  const ray = (o, d, max) => sim.world.castRay(new RAPIER.Ray(o, d), max, true, undefined, GROUPS.queryWorld);
  const c = { x: (GARDEN.minX + GARDEN.maxX) / 2, y: 1.5, z: (GARDEN.minZ + GARDEN.maxZ) / 2 };
  const out = [[1, 0, 0], [-1, 0, 0], [0, 0, -1]].map(([x, y, z]) => ray(c, { x, y, z }, 20));
  check('fences (and the invisible walls above them) close the garden', out.every((h) => h && h.timeOfImpact < 4.5), out.map((h) => (h ? f(h.timeOfImpact, 2) : 'none')).join(', '));
  const high = ray({ x: c.x, y: 5, z: c.z }, { x: 1, y: 0, z: 0 }, 20);
  check('the boundary is still there 5 m up', !!high && high.timeOfImpact < 4.5);
  const wall = ray({ x: -1.6, y: 0.3, z: 0 }, { x: 0, y: 0, z: -1 }, 5);
  check('the back wall beside the window is solid', !!wall && Math.abs(wall.timeOfImpact - (0 - ROOM.minZ)) < 0.01, wall ? f(wall.timeOfImpact) : 'none');
  const mid = linePoint(0.5);
  const line = ray({ x: mid[0], y: mid[1] + 0.3, z: mid[2] }, { x: 0, y: -1, z: 0 }, 0.6);
  check('the washing line is solid (a rotor will find it)', !!line && Math.abs(line.timeOfImpact - 0.3) < 0.02, line ? f(line.timeOfImpact) : 'none');
  const dr = ray({ x: (DRESSER.x0 + DRESSER.x1) / 2, y: DRESSER.shelves[1] + 0.3, z: DRESSER.z1 - 0.1 }, { x: 0, y: -1, z: 0 }, 0.5);
  check('the dresser shelves hold things up', !!dr && dr.timeOfImpact < 0.3, dr ? f(dr.timeOfImpact) : 'none');
  const door = ray({ x: (BACKDOOR.x0 + BACKDOOR.x1) / 2, y: 0.3, z: 0 }, { x: 0, y: 0, z: -1 }, 2.0);
  check('the doorway is open', !door || door.timeOfImpact > 1.9, door ? f(door.timeOfImpact) : 'clear');
}

// 6. Things to play with: napkins blow about, the lamp swings, the cat bats at bags, the radio switches on
// when you land on it, apples drop when you buzz the tree, and a sandbox reset tidies it all up.
{
  const sim = new Sim();
  const { goto } = pilot(sim);
  const napkin = sim.props.items.find((i) => i.def.id === 'napkin');
  const n0 = napkin.body.translation();
  goto(n0.x - 0.12, 0.12, n0.z, 6, { speed: 0.2 });
  const n1 = napkin.body.translation();
  check('rotor wash moves the napkin', Math.hypot(n1.x - n0.x, n1.z - n0.z) > 0.03 || n1.y < -0.1, `moved ${f(Math.hypot(n1.x - n0.x, n1.z - n0.z))} m, y ${f(n1.y)}`);
  const lamp = sim.props.lamp.body;
  lamp.applyImpulse({ x: 0.12, y: 0, z: 0 }, true);
  let maxSwing = 0;
  run(sim, 1.0, () => { const t = lamp.translation(); maxSwing = Math.max(maxSwing, Math.hypot(t.x - LAMP.x, t.z - LAMP.z)); return sim.heli ? new Autopilot().update(sim.heli) : zero(); });
  const top = lamp.translation();
  check('the pendant lamp swings on its cord and stays hung', maxSwing > 0.03 && Math.abs(Math.hypot(top.x - LAMP.x, top.y - ROOM.ceilingY + LAMP.length, top.z - LAMP.z)) < 0.2, `swing ${f(maxSwing)} m`);
  // Cat: a bag dangling into reach gets a swipe.
  const c = sim.props.cat;
  const bag = new TeaBag(sim, c.shoulder.clone().addScaledVector(c.fwd, 0.2).add(new THREE.Vector3(0, 0.02, 0)), new THREE.Quaternion());
  sim.bags.push(bag);
  const bp0 = bag.pos.clone();
  let swiped = 0, maxV = 0;
  run(sim, 1.5, () => { swiped = c.swipes; maxV = Math.max(maxV, bag.vel.length()); return zero(); });
  check('the cat swipes at a bag in reach and knocks it', swiped > 0 && maxV > 0.3 && bag.pos.distanceTo(bp0) > 0.05, `swipes ${swiped}, bag speed ${f(maxV)} m/s`);
  // Radio: land on it (placed there by the harness), lift off, land again.
  const land = () => {
    sim.heli.body.setTranslation({ x: RADIO.x, y: COUNTER.top + RADIO.h + gearDrop(sim.aircraft) + 0.002, z: RADIO.z }, true);
    sim.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true); sim.heli.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.heli.body.setRotation({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, true);
    run(sim, 1.5, () => ({ ...zero(), collective: -1 }));
  };
  sim.restartFlight();
  land();
  const on1 = sim.props.radio.on;
  run(sim, 0.6, () => ({ ...zero(), collective: 1 }));
  land();
  check('landing on the radio switches it on, landing again switches it off', on1 === true && sim.props.radio.on === false && sim.state === 'flying', `on ${on1} then ${sim.props.radio.on}`);
  // Apples.
  sim.restartFlight();
  const can = TREE.canopy[1];
  sim.heli.body.setTranslation({ x: TREE.x + can[0], y: can[1] - can[3] - 0.12, z: TREE.z + can[2] + 0.1 }, true);
  sim.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  const hold = new Autopilot(); hold.target.set(TREE.x + can[0], can[1] - can[3] - 0.12, TREE.z + can[2] + 0.1);
  let dropped = 0;
  for (let i = 0; i < 8 && sim.state === 'flying'; i++) { run(sim, 2, () => (sim.heli ? hold.update(sim.heli) : zero())); dropped = Math.max(dropped, sim.props.apples.length); }
  check('buzzing the apple tree shakes apples down (a few at most)', dropped > 0 && sim.props.apples.length <= 4, `apples ${dropped}, state ${sim.state}`);
  sim.resetSandbox();
  run(sim, 0.1);
  const n2 = napkin.body.translation();
  check('reset sandbox puts the props back', Math.hypot(n2.x - n0.x, n2.z - n0.z) < 0.005 && sim.props.apples.length === 0 && !sim.props.radio.on);
  check('dynamic bodies stay bounded', sim.world.bodies.len() < 40, `${sim.world.bodies.len()} bodies`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} world checks passed`);
process.exit(failed.length ? 1 : 0);
