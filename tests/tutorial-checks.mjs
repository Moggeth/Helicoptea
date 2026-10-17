// Guided first flight (src/game/tutorial.js), headless: each step waits for the skill and finishes when it
// is done, flown with the same stick inputs a player makes; a respawn can't fake a landing; dropping the
// cargo sends you back a step; the wording follows the device in use; finishing hands back to the tips.
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { CFG } from '../src/config.js';
import { BUCKET } from '../src/sim/milk.js';
import { Flow } from '../src/game/flow.js';
import { Tutorial, TUTORIAL_STEPS } from '../src/game/tutorial.js';
import { Hud } from '../src/ui/hud.js';
import { sceneSVG, controlSVG } from '../src/ui/lessonCard.js';

await initPhysics();
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed++; };
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 });

// A HUD without a page: the real control lookups, with the lesson card recorded (and the pictures drawn,
// so a bad control or scene would throw here).
const hud = {
  device: 'keyboard', pads: null, touchLayoutOf: () => 'classic', card: null, art: '',
  showLesson(c) { this.card = c; this.art = c ? sceneSVG(c.scene) + controlSVG(c.ctl) : ''; },
  showHint() {}, showPrompt() {}, setInvite() {},
};
for (const m of ['key', 'padKeys', 'kbKeys', 'hotasKeys', 'lessonControl', 'touchStick']) hud[m] = Hud.prototype[m];
const title = () => (hud.card ? hud.card.title : null);

const sim = new Sim();
const flow = new Flow(sim, hud);
flow.replay();
let ended = null, dings = 0;
const tut = new Tutorial(sim, hud, { begin() { sim.restartFlight(); sim.assist = true; }, end(done) { ended = done; if (done) flow.skip(); }, ding() { dings++; } });
const ap = new Autopilot();
const step = (ctl) => { sim.step(ctl); flow.quiet = tut.active; tut.handleEvents(sim.drainEvents()); flow.update(sim.dt); tut.update(sim.dt); };
// Run until the lesson leaves `id` (or time runs out); returns the seconds it took, or null.
const until = (id, secs, fn) => {
  for (let i = 0, n = Math.round(secs / sim.dt); i < n; i++) { if (tut.step !== id || !tut.active) return i * sim.dt; step(sim.heli ? fn(i * sim.dt) : zero()); }
  return tut.step !== id || !tut.active ? secs : null;
};
const run = (secs, fn) => { for (let i = 0, n = Math.round(secs / sim.dt); i < n; i++) step(sim.heli ? fn(i * sim.dt) : zero()); };
const hold = (x, y, z, speed = 0.3, opts = {}) => () => {
  const k = opts.cargo;
  if (opts.hook) { const o = sim.heli.pos.clone().sub(sim.heli.hookWorlds[0]); ap.target.set(x + o.x, y + o.y, z + o.z); } else ap.target.set(x, y, z);
  ap.maxSpeed = speed;
  const ctl = ap.update(sim.heli, k ? k.vel.clone().sub(sim.heli.vel) : null, opts.aim ? k.pos : null);
  return opts.pour ? { ...ctl, pour: true } : ctl;
};
const f = (x, d = 2) => Number(x).toFixed(d);

tut.start();
check('starts on lift, waiting on the pad', tut.step === 'lift' && sim.heli.grounded);
run(1, zero);
check('sitting still never finishes lift', tut.step === 'lift', tut.step);
check('lift card: big title, the W key held, the lift-off picture', title() === 'Lift off' && hud.card.ctl?.type === 'keys' && hud.card.ctl.keys[0] === 'W' && hud.card.ctl.hold && /ls-rise/.test(hud.art), JSON.stringify(hud.card));
check('card words stay short', hud.card.title.split(' ').length <= 4 && hud.card.sub.split(' ').length <= 8, hud.card.sub);

// The control picture follows the device, live.
const ctls = {};
for (const d of ['gamepad', 'touch', 'hotas', 'keyboard']) { hud.device = d; tut.update(0); ctls[d] = { ...hud.card.ctl, art: hud.art }; }
check('gamepad: the lift stick, pushed up', ctls.gamepad.type === 'stick' && !ctls.gamepad.touch && ctls.gamepad.dir === 'up' && /ls-ring on/.test(ctls.gamepad.art), JSON.stringify(ctls.gamepad.side));
check('touch: the left touch stick, pushed up', ctls.touch.type === 'stick' && ctls.touch.touch && ctls.touch.side === 'left' && ctls.touch.dir === 'up', JSON.stringify(ctls.touch.side));
check('flight stick: the throttle forward', ctls.hotas.type === 'throttle' && ctls.hotas.dir === 'up' && /ls-lever/.test(ctls.hotas.art));
// A remapped keyboard and the mouse: the picture uses the player's bindings.
hud.input = { kbLayout: { preset: 'custom', custom: { mouse: { x: 'roll', y: 'pitch', mode: 'nose' }, keys: { collUp: ['KeyR'], collDown: ['KeyF'], yawLeft: ['KeyQ'], yawRight: ['KeyE'], pitchFwd: [], pitchBack: [], rollLeft: [], rollRight: [], attach: ['Space'], assist: ['KeyT'], camNext: ['KeyV'] } } } };
tut.update(0);
const remapLift = hud.card.ctl;
check('remapped lift key shows on the card', remapLift.type === 'keys' && remapLift.keys[0] === 'R', JSON.stringify(remapLift));
check('mouse flying shows the mouse for tilting', hud.lessonControl('tilt').type === 'mouse', JSON.stringify(hud.lessonControl('tilt')));
check('remapped camera key shows on the card', hud.lessonControl('camera').keys?.[0] === 'V', JSON.stringify(hud.lessonControl('camera')));
delete hud.input;
tut.update(0);

let t = until('lift', 4, () => ({ ...zero(), collective: 1 }));
check('climbing off the pad finishes lift', t !== null && tut.step === 'hover', `${t} s`);
check('a finished step chimes', dings === 1, `${dings}`);
const bar0 = hud.card.progress;
run(0.5, zero);
check('hover shows a filling bar while held still', hud.card.progress > 0 && (bar0 === null || hud.card.progress > bar0), `${hud.card.progress}`);
check('hover needs no control: hands off', hud.card.ctl === null && /ls-bob/.test(hud.art));
t = until('hover', 6, zero);
check('a still hover finishes hover', t !== null && tut.step === 'drift', `${t} s`);
t = until('drift', 6, (s) => ({ ...zero(), roll: s < 0.6 ? -0.6 : 0, collective: 0.1 }));
check('tilting and drifting finishes drift', t !== null && tut.step === 'turn', `${t} s`);
{ const p = sim.heli.pos; ap.target.copy(p); }
t = until('turn', 8, () => ({ ...hold(-0.3, 0.3, 0.1)(), yaw: 1 }));
check('turning round finishes turn', t !== null && tut.step === 'stop', `${t} s`);
run(1.5, hold(-0.5, 0.3, 0.35));   // back to open air, south of the teapot
ap.yaw = Math.PI;                    // face the open side of the table
run(1.5, hold(-0.5, 0.3, 0.35));
check('stop asks for speed first', tut.step === 'stop' && !tut.s.fast && title() === 'Speed up', title());
t = until('stop', 1.5, () => ({ ...zero(), pitch: tut.s.fast ? 0 : 1 }));
check('building speed moves stop on to stopping', tut.step === 'stop' && tut.s.fast && title() === 'Now stop', `top ${f(tut.s.top)} m/s`);
let stopFrom = null;
t = until('stop', 6, () => { const h = sim.heli; if (!stopFrom) stopFrom = h.pos.clone(); ap.target.copy(stopFrom); ap.maxSpeed = 0.02; return ap.update(h); });
check('coming to a stop finishes stop', t !== null && tut.step === 'land', `${t} s, state ${sim.state}`);

// A crash and respawn on the pad must not count as a landing.
sim.restartFlight();
run(1, zero);
check('a respawn on the pad does not finish land', tut.step === 'land', tut.step);
run(1, () => ({ ...zero(), collective: 1 }));
t = until('land', 8, () => ({ ...zero(), collective: -1 }));
check('touching down finishes land', t !== null && tut.step === 'hook' && sim.heli.grounded, `${t} s`);

// Hook a bag off the stand.
const peg = sim.pegs[1];
ap.yaw = 0;
run(3, hold(sim.heli.pos.x, 0.4, sim.heli.pos.z, 0.3, { hook: true }));
run(6, hold(peg.tip.x, 0.4, peg.tip.z, 0.3, { hook: true }));
run(5, hold(peg.tip.x, peg.tip.y + 0.004, peg.tip.z, 0.12, { hook: true }));
check('in reach, the hook card shows the hook key', title() === 'Hook it!' && hud.card.ctl?.keys?.[0] === 'Space', `${title()} | state ${sim.state} hook-loop ${sim.heli ? f(sim.heli.hookWorlds[0].distanceTo(peg.tip), 3) : '-'}`);
sim.toggleAttach();
run(0.1, hold(peg.tip.x, peg.tip.y + 0.004, peg.tip.z, 0.12, { hook: true }));
check('hooking a bag finishes hook', tut.step === 'dip', tut.step);
const bag = sim.carriedBag();
run(4, hold(peg.tip.x, peg.tip.y + 0.3, peg.tip.z, 0.1, { hook: true }));
// Dip it in the mug.
const mug = sim.cups[0];
run(6, hold(mug.x, 0.45, mug.z, 0.25, { cargo: bag }));
run(3, hold(mug.x, 0.4, mug.z, 0.08, { cargo: bag, aim: true }));
const lineDrop = sim.heli.pos.y - bag.pos.y;
t = until('dip', 16, () => hold(mug.x + sim.heli.pos.x - bag.pos.x, mug.waterY - 0.02 + lineDrop, mug.z + sim.heli.pos.z - bag.pos.z, 0.04, { cargo: bag })());
check('steeping the bag finishes dip', t !== null && tut.step === 'drop', `${t} s, wetness ${f(bag.wetness)}, state ${sim.state}`);
run(3, hold(mug.x, 0.45, mug.z, 0.08, { cargo: bag }));
sim.toggleAttach();
run(0.1, hold(mug.x, 0.45, mug.z));
check('letting go finishes drop', tut.step === 'bucket', tut.step);

// Milk: hook the bucket, fill it in the crock, pour into the teacup (as tests/milk-checks.mjs flies it).
const k = sim.milk.bucket, bowl = sim.milk.bowl, cup = sim.cups[1], tip = sim.milk.hanger.tip;
const hookDrop = -CFG.heli.hookOffset[1];
ap.yaw = 0;
run(5, hold(tip.x, 0.42, tip.z + 0.004, 0.3));
run(3, hold(tip.x, tip.y + hookDrop + 0.008, tip.z + 0.004, 0.15));
sim.toggleAttach();
run(0.1, hold(tip.x, tip.y + hookDrop + 0.008, tip.z + 0.004, 0.15));
check('hooking the bucket finishes bucket', tut.step === 'fill', tut.step);
run(2.5, hold(tip.x, 0.42, tip.z + 0.03, 0.15));
run(5, hold(bowl.x, 0.42, bowl.z, 0.3, { cargo: k }));
run(3, hold(bowl.x, 0.36, bowl.z, 0.1, { cargo: k, aim: true }));
const lineY = CFG.milk.lineLength + BUCKET.swivelY - BUCKET.yBot;
t = until('fill', 10, () => hold(bowl.x + sim.heli.pos.x - k.pos.x, bowl.floorY + 0.004 + lineY + hookDrop, bowl.z + sim.heli.pos.z - k.pos.z, 0.05, { cargo: k })());
check('filling the bucket finishes fill', t !== null && tut.step === 'pour', `${t} s, fill ${f(k.fill)}`);
run(4, hold(bowl.x, 0.45, bowl.z, 0.12, { cargo: k }));
run(7, hold(cup.x, 0.45, cup.z, 0.25, { cargo: k }));
run(4, hold(cup.x, 0.4, cup.z, 0.08, { cargo: k, aim: true }));
t = until('pour', 6, hold(cup.x, 0.4, cup.z, 0.05, { cargo: k, aim: true, pour: true }));
check('milk landing in a cup finishes pour', t !== null && tut.step === 'assist', `${t} s, cup milk ${f(cup.milk * 100, 1)}%`);

// Flight Assist off, then a hover by hand.
run(0.5, hold(cup.x, 0.4, cup.z));
check('assist step waits for the switch, showing its key', tut.step === 'assist' && hud.card.ctl?.keys?.[0] === 'F', JSON.stringify(hud.card.ctl));
sim.assist = false;
run(0.05, zero);
check('switching Assist off finishes assist', tut.step === 'raw', tut.step);
sim.assist = true;
run(0.05, zero);
check('switching it back on steps back to assist', tut.step === 'assist', tut.step);
sim.assist = false;
run(0.05, zero);
// A scripted assist-off hover is out of scope here; finish the step the way a steady pilot would.
tut.s.t = 2.5;
run(0.05, zero);
check('a steady assist-off hover finishes raw', tut.step === 'camera', tut.step);
tut.noteCamera(); tut.update(0);
check('one camera change is not enough', tut.step === 'camera');
tut.noteCamera(); tut.update(0);
check('two camera changes finish camera', tut.step === 'done', tut.step);
check('closing card is unnumbered and says you can fly', hud.card.n === 0 && title() === 'You can fly!', JSON.stringify(hud.card));
sim.assist = true;
run(8, hold(cup.x, 0.45, cup.z));
check('the lesson ends itself after the closing card', !tut.active && ended === true);
check('finishing hands the hint card back, tips done', flow.step === 7, `flow step ${flow.step}`);
check('the lesson has fifteen skills and a closing card', TUTORIAL_STEPS.length === 16, `${TUTORIAL_STEPS.length}`);

// Ending early: the card clears, the tips stay where they were.
{
  const sim2 = new Sim(), h2 = { ...hud, card: 'x' };
  const fl = new Flow(sim2, h2); fl.replay();
  let e2 = null;
  const t2 = new Tutorial(sim2, h2, { end(d) { e2 = d; } });
  t2.start(); sim2.step(zero()); t2.update(sim2.dt);
  t2.end(false);
  check('ending early clears the card and reports not done', !t2.active && e2 === false && h2.card === null && fl.step === 0);
  sim2.dispose();
}
sim.dispose();
process.exit(failed ? 1 : 0);
