// Headless crash and damage checks (part of `npm run check`): every staged crash on every aircraft ends
// the way it should (reason and kind), rotor strikes throw the blades off before the airframe falls,
// worn blades lose lift, a tail strike spins the aircraft up (less with the collective down), dunks
// stay in the cup, the rotor-strike toggle makes blades pass through, and the flight log keeps it all.
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { stageCrash } from '../src/sim/crashStage.js';
import { FlightRecorder } from '../src/replay/recorder.js';
import { CH } from '../src/replay/format.js';
import { HELI_PARTS } from '../src/sim/helicopter.js';
import { CHINOOK_PARTS } from '../src/sim/chinook.js';
import { SKYCRANE_PARTS } from '../src/sim/skycrane.js';

const PARTS = { micro: HELI_PARTS, chinook: CHINOOK_PARTS, skycrane: SKYCRANE_PARTS };

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
const f = (x, d = 2) => Number(x).toFixed(d);

// Stage a crash, run until it ends (or `secs`), and report what happened.
function trial(aircraft, kind, { secs = 4, ctl = zero, opts = {} } = {}) {
  const sim = new Sim({ aircraft, ...opts });
  for (let i = 0; i < 60; i++) sim.step(zero());
  stageCrash(sim, kind);
  const ev = [];
  let maxSpin = 0;
  for (let t = 0; t < secs && sim.state === 'flying'; t += sim.dt) {
    sim.step(ctl(t));
    if (sim.heli) maxSpin = Math.max(maxSpin, Math.abs(sim.heli.dmg.spin));
    for (const e of sim.drainEvents()) ev.push({ ...e, t: sim.time });
  }
  for (let i = 0; i < 30; i++) { sim.step(zero()); sim.drainEvents(); }
  const crash = ev.find((e) => e.type === 'crash');
  return { sim, ev, crash, maxSpin, first: (type) => ev.find((e) => e.type === type) };
}

const EXPECT = {
  rotor: ['rotor strike', 'shatter'], wear: ['rotor strike', 'shatter'], dunk: ['dunk', 'dunk'],
  rollover: ['rollover', 'thrash'], impact: ['impact', 'impact'], fall: ['fall', 'fall'],
};

for (const aircraft of ['micro', 'chinook', 'skycrane']) {
  for (const [kind, [reason, crashKind]] of Object.entries(EXPECT)) {
    const r = trial(aircraft, kind, { ctl: kind === 'wear' ? () => ({ ...zero(), pitch: 0.15 }) : zero });
    check(`${aircraft} ${kind}: ends as ${reason} (${crashKind})`, r.crash && r.crash.reason === reason && r.crash.kind === crashKind,
      r.crash ? `${r.crash.reason}/${r.crash.kind} at ${f(r.crash.t - r.ev[0]?.t || 0)} s` : 'no crash');
  }

  // Rotor strike: the blades go first, as debris, and the airframe falls before it is called a crash.
  const r = trial(aircraft, 'rotor');
  const sh = r.first('rotorShatter');
  const blades = r.sim.debris.filter((d) => d.part.blade).length;
  const names = r.sim.debris.map((d) => d.part.name);
  check(`${aircraft}: rotor strike throws the blades off before the crash`, sh && r.crash && sh.parts.length > 0 && r.crash.t - sh.t > 0.04 && blades > 0,
    sh ? `${sh.parts.length} blades off, crash ${f(r.crash ? r.crash.t - sh.t : -1)} s later on ${sh.material}` : 'no shatter');
  check(`${aircraft}: every part becomes exactly one piece of wreckage`, names.length === PARTS[aircraft].length && new Set(names).size === names.length, `${names.length} pieces of ${PARTS[aircraft].length} parts`);
  check(`${aircraft}: the rotor strike is named for what the blades hit`, r.crash && r.crash.material === sh?.material, `${r.crash?.material} / ${sh?.material}`);
}

// Worn blades lose lift: a fixed collective with full wear climbs less (assist off).
{
  const climb = (wear) => {
    const sim = new Sim();
    sim.assist = false;
    sim.heli.collective = 0.7;
    if (wear) sim.heli.dmg.wear[0] = wear;
    for (let i = 0; i < 240; i++) sim.step(zero());
    return sim.heli.pos.y;
  };
  const a = climb(0), b = climb(1);
  check('worn blades lose lift', b < a - 0.03, `climbed ${f(a, 3)} m clean, ${f(b, 3)} m worn`);
  const shake = (wear) => {
    const sim = new Sim();
    for (let i = 0; i < 240; i++) sim.step({ ...zero(), collective: 1 });
    sim.heli.dmg.wear[0] = wear;
    let peak = 0;
    for (let i = 0; i < 120; i++) { sim.step(zero()); const w = sim.heli.body.angvel(); peak = Math.max(peak, Math.hypot(w.x, w.z)); }
    return peak;
  };
  const w0 = [shake(0), shake(0.8)];
  check('worn blades shake the airframe', w0[1] > w0[0] * 2 && w0[1] > 0.03, `peak roll/pitch rate ${f(w0[0], 3)} clean, ${f(w0[1], 3)} rad/s worn`);
}

// Tail strike: the tail rotor goes, the airframe spins up, the pedals do nothing, lowering the collective slows it.
for (const aircraft of ['micro', 'skycrane']) {
  const r = trial(aircraft, 'tail', { secs: 3, ctl: () => ({ ...zero(), yaw: 1 }) });
  check(`${aircraft}: tail strike takes the tail rotor, not the aircraft`, r.first('tailStrike') && !r.crash && r.sim.heli.dmg.tail && (r.sim.heli.dmg.shed & 4), r.crash ? r.crash.reason : 'flying');
  check(`${aircraft}: no tail rotor, it spins (and the pedals cannot stop it)`, r.maxSpin > 5, `${f(r.maxSpin)} rad/s`);
  const sim = r.sim;
  const spinHigh = Math.abs(sim.heli.dmg.spin);
  for (let i = 0; i < 240 * 1.2 && sim.heli; i++) sim.step({ ...zero(), collective: -1 });
  const spinLow = sim.heli ? Math.abs(sim.heli.dmg.spin) : 99;
  check(`${aircraft}: lowering the collective slows the spin`, spinLow < spinHigh * 0.8, `${f(spinHigh)} → ${f(spinLow)} rad/s`);
  // Then a hard landing with no tail rotor is a tail-strike crash with its spin.
  const sim2 = trial(aircraft, 'tail', { secs: 1.5 }).sim;
  const p2 = sim2.heli.pos;
  sim2.heli.body.setTranslation({ x: p2.x + 0.15, y: -0.76 + 0.15, z: p2.z }, true);
  sim2.heli.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
  sim2.heli.thrust = 0;
  const ev = [];
  for (let i = 0; i < 240 && sim2.state === 'flying'; i++) { sim2.step(zero()); ev.push(...sim2.drainEvents()); }
  const c = ev.find((e) => e.type === 'crash');
  check(`${aircraft}: crashing with no tail rotor is a spin crash`, c && c.reason === 'tail strike' && c.kind === 'spin' && Math.abs(c.spin) > 1, c ? `${c.reason}/${c.kind}, spinning ${f(c.spin)} rad/s` : 'no crash');
}
{
  const r = trial('chinook', 'tail');
  // (How the rotorless airframe lands, upright or on its side, varies with the random lurch.)
  check('chinook: no tail rotor to strike, its rotors strike instead', r.first('rotorShatter') && r.crash && ['rotor strike', 'rollover'].includes(r.crash.reason) && !r.first('tailStrike'),
    r.crash ? `${r.crash.reason} after ${r.ev.filter((e) => e.type === 'rotorShatter').length} rotor(s) shed` : 'no crash');
}

// Dunk: the wreck stays in the cup, no fire kick.
{
  const r = trial('micro', 'dunk');
  const cup = r.sim.cups[r.crash?.cup ?? 1];
  const near = r.sim.debris.filter((d) => { const t = d.body.translation(); return Math.hypot(t.x - cup.x, t.z - cup.z) < 0.15; }).length;
  check('dunk: names the cup and keeps the wreck in and around it', r.crash && r.crash.cup === 1 && near >= r.sim.debris.length * 0.6, `${near}/${r.sim.debris.length} pieces within 15 cm`);
}

// Toggle off: blades pass through scenery, nothing breaks.
{
  const r = trial('micro', 'wear', { secs: 1.2, ctl: () => ({ ...zero(), pitch: 0.15 }), opts: { rotorStrikes: false } });
  const ticks = r.ev.filter((e) => e.type === 'rotorTick');
  check('rotor strikes off: blades pass through the wall harmlessly', !r.first('rotorShatter') && (r.sim.heli ? r.sim.heli.dmg.wear[0] === 0 : true) && ticks.every((e) => e.harmless) && ticks.length > 0,
    `${ticks.length} harmless brushes, ${r.crash ? 'crashed: ' + r.crash.reason : 'still flying'}`);
  const r2 = trial('micro', 'tail', { secs: 1, opts: { rotorStrikes: false } });
  check('rotor strikes off: the tail rotor survives contact', !r2.first('tailStrike') && r2.sim.heli && !r2.sim.heli.dmg.tail);
}

// The flight log keeps the strike, the lost rotor and the crash kind.
{
  const sim = new Sim();
  const rec = new FlightRecorder(sim, { getInput: () => null });
  rec.worldSpeed = 0.7;
  for (let i = 0; i < 60; i++) { sim.step(zero()); rec.afterStep(zero()); sim.drainEvents(); rec.frameEnd(); }
  stageCrash(sim, 'rotor');
  for (let i = 0; i < 240 * 2; i++) { sim.step(zero()); rec.afterStep(zero()); sim.drainEvents(); rec.frameEnd(); }
  const fl = rec.cur;
  const types = new Set(fl.events.map((e) => e.type));
  let shedRow = -1;
  for (let i = 0; i < fl.n; i++) if (fl.samples.get(i, CH.shed) & 1) { shedRow = i; break; }
  const c = fl.crash();
  check('flight log keeps the shatter, the lost rotor and the crash kind', types.has('rotorShatter') && c && c.kind === 'shatter' && shedRow >= 0 && shedRow < c.i,
    `events ${[...types].join(', ')}; rotor gone from sample ${shedRow}, crash at ${c?.i}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} crash checks passed`);
process.exit(failed.length ? 1 : 0);
