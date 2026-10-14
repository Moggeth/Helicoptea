// Headless flight-tuning checks (part of `npm run check`): the board's defaults are exactly today's
// game, every knob reaches real config values, global and per-aircraft multipliers combine, resets and
// presets work, export/import round-trips and clamps, the stick shaping curve behaves, and a tuned
// aircraft really flies differently.
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { CFG } from '../src/config.js';
import { Tuning, aircraftRange } from '../src/tuning/tuning.js';
import { KNOBS, KNOB, AIRCRAFT, PRESETS, GROUPS, knobDefault, appliesTo } from '../src/tuning/knobs.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const get = (path) => path.split('.').reduce((o, k) => o[k], CFG);
const snapshot = () => JSON.stringify(CFG);

const before = snapshot();
const t = new Tuning({ storage: false });
check('defaults leave every config value untouched', snapshot() === before);
check('defaults leave the sticks alone', [-1, -0.37, -0.02, 0, 0.02, 0.5, 1].every((x) => t.shape(x) === x));

// Registry sanity.
const missing = [];
for (const k of KNOBS) for (const path of t.paths(k)) { try { if (get(path) === undefined) missing.push(path); } catch { missing.push(path); } }
check('every knob targets a real config value', missing.length === 0, missing.join(', '));
const paths = KNOBS.flatMap((k) => t.paths(k));
check('thrust and cyclic lag are never exposed', !paths.some((p) => /thrustLag|cyclicLag/i.test(p)));
check('every knob belongs to a group', KNOBS.every((k) => GROUPS.some((g) => g.id === k.group)));
check('every default sits inside its range', KNOBS.every((k) => k.kind === 'world' || (knobDefault(k) >= k.min && knobDefault(k) <= k.max)));
check('every knob has a preview clip with both end labels', KNOBS.every((k) => k.clip && k.clip.scenario && (k.clip.scenario === 'curve' || (k.clip.low && k.clip.high))));
const ids = KNOBS.map((k) => k.id);
check('knob ids are unique', new Set(ids).size === ids.length);

// Global multiplier.
const cyc = CFG.heli.cyclicTorque, chLat = CFG.chinook.latCyclic;
t.setGlobal('rotationRate', 2);
check('global rotation rate doubles the micro cyclic', Math.abs(CFG.heli.cyclicTorque - cyc * 2) < 1e-12, `${cyc} → ${CFG.heli.cyclicTorque}`);
check('global rotation rate reaches the Chinook too', Math.abs(CFG.chinook.latCyclic - chLat * 2) < 1e-12);
// Per-aircraft multiplier stacks on top.
t.setAircraft('chinook', 'rotationRate', 0.5);
check('per-aircraft multiplier stacks on the global one', Math.abs(CFG.chinook.latCyclic - chLat) < 1e-12 && Math.abs(CFG.heli.cyclicTorque - cyc * 2) < 1e-12);
check('changed counts per tab', t.changedCount('global') === 1 && t.changedCount('chinook') === 1 && t.changedCount('micro') === 0);
t.resetAircraft('chinook', 'rotationRate');
check('resetting a per-aircraft knob restores the global value', Math.abs(CFG.chinook.latCyclic - chLat * 2) < 1e-12);
t.resetGlobal('rotationRate');
check('resetting a global knob restores the base value', CFG.heli.cyclicTorque === cyc && CFG.chinook.latCyclic === chLat);

// Excess kind: only the part above 1 scales.
const gem = CFG.heli.groundEffectMax;
t.setGlobal('groundCushion', 0);
check('ground cushion 0 removes ground effect entirely', Math.abs(CFG.heli.groundEffectMax - 1) < 1e-12, `${gem} → ${CFG.heli.groundEffectMax}`);
t.setGlobal('groundCushion', 2);
check('ground cushion ×2 doubles the extra lift', Math.abs(CFG.heli.groundEffectMax - (1 + (gem - 1) * 2)) < 1e-12);

// Groups and reset all.
t.setGlobal('buffet', 0); t.setGlobal('coasting', 3);
t.resetGroup('global', 'flavour');
check('reset group clears only that group', !t.isChanged('global', 'groundCushion') && !t.isChanged('global', 'buffet') && t.isChanged('global', 'coasting'));
t.resetAll();
check('reset all restores the exact config', snapshot() === before);

// Presets.
t.applyPreset('floaty');
check('floaty preset sets its knobs', Object.entries(PRESETS.floaty.global).every(([id, v]) => t.getGlobal(id) === v));
check('floaty preset lowers gravity', Math.abs(CFG.physics.gravity - 9.81 * PRESETS.floaty.global.gravity) < 0.05, `g ${CFG.physics.gravity.toFixed(2)}`);
t.applyPreset('snappy');
check('snappy preset replaces floaty', t.getGlobal('gravity') === 1 && t.getGlobal('rotationRate') === PRESETS.snappy.global.rotationRate);
t.applyPreset('current');
check('current preset is the shipped game', snapshot() === before);

// Stick shaping.
t.setGlobal('deadzone', 0.1); t.setGlobal('expo', 0.5); t.setGlobal('rates', 1);
check('deadzone swallows small inputs', t.shape(0.08) === 0 && t.shape(-0.08) === 0);
check('expo softens the centre but keeps full deflection', t.shape(0.5) < 0.5 && Math.abs(t.shape(1) - 1) < 1e-9 && t.shape(-1) === -t.shape(1));
let mono = true; for (let x = 0.1; x <= 1; x += 0.01) if (t.shape(x + 0.01) < t.shape(x) - 1e-12) mono = false;
check('the stick curve never folds back', mono);
t.setGlobal('rates', 0.6);
check('rates scale full deflection', Math.abs(t.shape(1) - 0.6) < 1e-9);
const ctl = t.shapeCtl({ pitch: 1, roll: 0.05, yaw: -1, collective: 0.05 });
check('shaping applies to cyclic and pedals, never the collective', Math.abs(ctl.pitch - 0.6) < 1e-9 && ctl.roll === 0 && Math.abs(ctl.yaw + 0.6) < 1e-9 && ctl.collective === 0.05);
t.resetAll();

// Export and import.
t.setGlobal('coasting', 0.4); t.setAircraft('skycrane', 'thrustToWeight', 1.2); t.setGlobal('expo', 0.3);
const text = t.exportText();
const cfgTuned = snapshot();
t.resetAll();
t.importState(JSON.parse(text));
check('export then import round-trips exactly', snapshot() === cfgTuned && t.getAircraft('skycrane', 'thrustToWeight') === 1.2 && t.getGlobal('expo') === 0.3);
t.importState({ global: { coasting: 999, bogus: 3, gravity: 'heavy' }, aircraft: { micro: { thrustToWeight: 9 }, chinook: { pitchResponse: 1.3 }, skycrane: { pitchResponse: 2 } } });
const [, hiT] = aircraftRange(KNOB.thrustToWeight);
check('import clamps to each knob range', t.getGlobal('coasting') === KNOB.coasting.max && t.getAircraft('micro', 'thrustToWeight') === hiT);
check('import ignores unknown knobs, bad values and knobs that do not apply', !('bogus' in t.state.global) && !('gravity' in t.state.global) && t.getAircraft('chinook', 'pitchResponse') === 1.3 && !('pitchResponse' in t.state.aircraft.skycrane));
let threw = false; try { t.importState('nonsense'); } catch { threw = true; }
check('import rejects something that is not a tuning file', threw);
t.resetAll();

// Per-aircraft-only knobs only show where they apply.
check('Chinook-only knobs apply only to the Chinook', KNOBS.filter((k) => k.only).every((k) => AIRCRAFT.every((a) => appliesTo(k, a) === k.only.includes(a))));

// It really changes the flight: a micro with top-speed cap ×0.3 goes further in the same dash.
async function dash(mult) {
  t.resetAll();
  if (mult !== 1) t.setGlobal('topSpeed', mult);
  const sim = new Sim({ aircraft: 'micro', lite: true, bare: true });
  sim.world.gravity = { x: 0, y: -CFG.physics.gravity, z: 0 };
  const h = sim.heli;
  h.body.setTranslation({ x: -0.5, y: 0.4, z: 0 }, true);
  sim.assist = true;
  const x0 = sim.heli.pos.x;
  for (let i = 0; i < 240 * 2 && sim.heli; i++) sim.step({ pitch: 1, roll: 0, yaw: 0, collective: 0 });
  const out = { dist: sim.heli ? Math.hypot(sim.heli.pos.x - x0, sim.heli.pos.z) : 0, speed: sim.heli ? sim.heli.vel.length() : 0, state: sim.state };
  return out;
}
const a = await dash(1), b = await dash(0.3);
check('a tuned knob really changes the flight', b.speed > a.speed * 1.1 && a.state === 'flying' && b.state === 'flying', `speed after 2 s ${a.speed.toFixed(2)} → ${b.speed.toFixed(2)} m/s`);
t.resetAll();
check('everything back to the shipped config at the end', snapshot() === before);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tuning checks passed`);
process.exit(failed.length ? 1 : 0);
