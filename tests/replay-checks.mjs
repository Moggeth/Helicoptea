// Headless flight-recorder checks (part of `npm run check`): every aircraft is recorded at a fixed rate,
// snapshots match the live simulation exactly, moving things are keyframed and still ones are not,
// crashes keep their wreckage, the ring buffer stays bounded, notes attach to the right moment, the
// disk format round-trips, and recording costs next to nothing.
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { FlightRecorder } from '../src/replay/recorder.js';
import { CH, encodeFlight, decodeFlight, sampleEntity, RECORD_EVERY } from '../src/replay/format.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f3 = (x) => Number(x).toFixed(3);

for (const aircraft of ['micro', 'chinook', 'skycrane']) {
  const sim = new Sim({ aircraft });
  const ended = [];
  const input = { source: 'gamepad', kb: { pitch: 0, roll: 0, yaw: 0, collective: 0 }, gp: { pitch: 0.1, roll: 0, yaw: 0, collective: 0.5 }, touch: { pitch: 0, roll: 0, yaw: 0, collective: 0 }, raw: { axes: [0.01, -0.6, 0.12, 0], buttons: Array(17).fill(0) } };
  const rec = new FlightRecorder(sim, { getInput: () => input, onFlightEnd: (fl) => ended.push(fl) });
  rec.worldSpeed = 0.7;
  const ap = new Autopilot();
  ap.target.set(sim.heli.pos.x + 0.15, sim.heli.pos.y + 0.25, sim.heli.pos.z - 0.1);
  const probes = [];
  let steps = 0, simMs = 0;
  const step = (ctl) => {
    const t0 = performance.now();
    sim.step(ctl);
    simMs += performance.now() - t0;
    rec.afterStep(ctl);
    steps++;
    if (steps % 97 === 0 && sim.heli) probes.push({ i: rec.cur.n - 1, onSample: (steps - 1) % RECORD_EVERY === 0, x: sim.heli.pos.x, y: sim.heli.pos.y, vy: sim.heli.vel.y, coll: ctl.collective });
    sim.drainEvents();
    rec.frameEnd();
  };
  for (let i = 0; i < 240 * 5; i++) step({ ...ap.update(sim.heli, null, null, sim.dt), pour: false, doors: 0, pump: 0, reel: 0 });
  const note = rec.addNote({ tag: 'bad', text: 'wobbly here', source: 'flight' });
  const fl = rec.cur;
  // Snapshot exactness: a probe taken right after a recorded step equals the recorded row.
  const exact = probes.filter((p) => p.onSample);
  const worst = Math.max(0, ...exact.map((p) => Math.max(Math.abs(fl.samples.get(p.i, CH.px) - p.x), Math.abs(fl.samples.get(p.i, CH.py) - p.y), Math.abs(fl.samples.get(p.i, CH.vy) - p.vy))));
  check(`${aircraft}: recorded at 60 Hz`, fl.recordHz === 60 && Math.abs(fl.n - 5 * 60) <= 1, `${fl.n} samples in 5 s`);
  check(`${aircraft}: samples equal the live state exactly`, exact.length > 0 && worst < 1e-6, `${exact.length} probes, worst ${worst.toExponential(1)}`);
  check(`${aircraft}: as-flown time follows the world speed`, Math.abs(fl.wallDuration() - fl.duration() / 0.7) < 0.02, `${f3(fl.duration())} s sim, ${f3(fl.wallDuration())} s as flown`);
  check(`${aircraft}: raw and processed inputs logged`, fl.samples.get(10, CH.src) === 1 && Math.abs(fl.samples.get(10, CH['gp.ax1']) + 0.6) < 1e-6 && Math.abs(fl.samples.get(10, CH['gp.coll']) - 0.5) < 1e-6 && fl.samples.get(fl.n - 1, CH.assist) === 1);
  const flying = fl.samples.get(fl.n - 1, CH.agl) > 0.05 && fl.samples.get(fl.n - 1, CH.alive) === 1 && fl.samples.get(fl.n - 1, CH.thrust) > 0;
  check(`${aircraft}: telemetry (altitude, thrust) logged`, flying, `agl ${f3(fl.samples.get(fl.n - 1, CH.agl))} m, T/W ${f3(fl.samples.get(fl.n - 1, CH.tw))}`);
  check(`${aircraft}: note attaches to the moment`, note && Math.abs(note.wall - fl.wallDuration()) < 1e-3 && note.tag === 'bad');
  // Entities: bags hang still in calm air (few keys), props are there, the skycrane's hose is tracked.
  const bags = [...fl.entities.values()].filter((e) => e.kind === 'bag');
  const props = [...fl.entities.values()].filter((e) => e.kind === 'prop');
  const keysPerBag = bags.reduce((s, e) => s + e.keys.n, 0) / Math.max(1, bags.length);
  check(`${aircraft}: bags and props tracked, still things barely keyed`, bags.length === sim.bags.length && props.length >= 4 && keysPerBag < fl.n, `${bags.length} bags (${keysPerBag.toFixed(0)} keys each of ${fl.n} samples), ${props.length} props`);
  if (aircraft === 'skycrane') check('skycrane: snorkel hose keyframed', [...fl.entities.values()].some((e) => e.kind === 'hose' && e.keys.n > 10));

  // Crash: wreckage keyed with its part names; recording stops 10 s after; restart ends the flight.
  const debrisProbe = [];
  sim.crash('impact', 2);
  for (let i = 0; i < 240 * 3; i++) {
    step({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
    if (i === 240 * 2 && sim.debris.length) { const d = sim.debris[0]; const t = d.body.translation(); debrisProbe.push({ id: `debris:${d.id}`, i: fl.n - 1, x: t.x, y: t.y, z: t.z, onSample: (steps - 1) % RECORD_EVERY === 0 }); }
  }
  const deb = [...fl.entities.values()].filter((e) => e.kind === 'debris');
  check(`${aircraft}: crash logged with its wreckage`, fl.crash() && fl.crash().reason === 'impact' && deb.length === sim.debris.length && deb.every((e) => e.meta.part && e.meta.aircraft === aircraft), `${deb.length} pieces`);
  const out = new Float32Array(7);
  const dp = debrisProbe[0];
  if (dp) {
    const e = fl.entities.get(dp.id);
    sampleEntity(e, dp.i, out);
    const err = Math.hypot(out[0] - dp.x, out[1] - dp.y, out[2] - dp.z);
    check(`${aircraft}: wreckage replays where it was`, !dp.onSample || err < 2e-4, `error ${(err * 1000).toFixed(3)} mm`);
  }
  // Round trip through the disk format.
  const { json, bin } = encodeFlight(fl);
  const back = decodeFlight(JSON.parse(JSON.stringify(json)), bin.slice(0));
  let diff = 0;
  for (let i = 0; i < fl.n; i += 7) for (let k = 0; k < 40; k++) diff = Math.max(diff, Math.abs(back.samples.get(i, k) - fl.samples.get(i, k)));
  const o1 = new Float32Array(60), o2 = new Float32Array(60);
  let ediff = 0;
  for (const e of fl.entities.values()) {
    const e2 = back.entities.get(e.id);
    for (let s = 0; s < fl.n; s += 13.7) { const a = sampleEntity(e, s, o1), b = sampleEntity(e2, s, o2); if (a !== b) ediff = 1; else if (a) for (let k = 0; k < e.keys.width - 1; k++) ediff = Math.max(ediff, Math.abs(o1[k] - o2[k])); }
  }
  check(`${aircraft}: JSON + binary round trip is exact`, diff === 0 && ediff === 0 && back.notes.length === 1 && back.events.length === fl.events.length, `${(bin.byteLength / 1024).toFixed(0)} KB binary, ${(JSON.stringify(json).length / 1024).toFixed(0)} KB JSON for ${f3(fl.wallDuration())} s`);
  sim.restartFlight();
  step({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
  check(`${aircraft}: restart ends the flight and starts the next`, ended.includes(fl) && fl.ended && rec.cur !== fl && rec.flights.length === 2);
  const perStep = rec.recordMs / steps, simStep = simMs / steps;
  check(`${aircraft}: recording overhead is small`, perStep < Math.max(0.02, simStep * 0.1), `${(perStep * 1000).toFixed(1)} µs per step vs ${(simStep * 1000).toFixed(0)} µs simulation`);
}

// Ring buffer: bounded flight count.
{
  const sim = new Sim();
  const rec = new FlightRecorder(sim, { maxFlights: 3 });
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 60; i++) { sim.step({ pitch: 0, roll: 0, yaw: 0, collective: 0.3 }); rec.afterStep(null); sim.drainEvents(); rec.frameEnd(); }
    sim.restartFlight();
  }
  check('ring buffer keeps only the most recent flights', rec.flights.length <= 3, `${rec.flights.length} kept`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} replay checks passed`);
if (failed.length) process.exit(1);
