// Flight stick / HOTAS checks (part of `npm run check`), on an emulated X56: two non-standard devices as
// Chrome reports them. The gamepad layer leaves them alone, the X56 defaults fly (stick tilts, twist turns,
// throttle lifts), the throttle can be the collective itself, nothing is smoothed or delayed, buttons and
// the hat work, and Teach and button remapping store what the player actually moved.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let nowMs = 1000;
globalThis.performance = { now: () => nowMs };
const listeners = new Map();
const on = (t, f) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(f); };
globalThis.window = { addEventListener: on };
globalThis.document = { addEventListener: on, hidden: false };
const btns = (n) => Array.from({ length: n }, () => ({ pressed: false, value: 0 }));
const STICK_ID = 'Saitek Pro Flight X-56 Rhino Stick (Vendor: 0738 Product: 2221)';
const THR_ID = 'Saitek Pro Flight X-56 Rhino Throttle (Vendor: 0738 Product: a221)';
const stick = { id: STICK_ID, index: 0, connected: true, mapping: '', axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2857], buttons: btns(17) };
const thr = { id: THR_ID, index: 1, connected: true, mapping: '', axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2857], buttons: btns(36) };
const xbox = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 2, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: btns(17) };
let pads = [stick, thr];
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads.map((p) => ({ ...p, axes: p.axes.slice(), buttons: p.buttons.map((b) => ({ ...b })) })) }, configurable: true });

const Hm = await import('../src/input/hotas.js');
const { Input } = await import('../src/input/input.js');
const { stepCollective } = await import('../src/sim/collective.js');
const { CFG } = await import('../src/config.js');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, e = 0.02) => Math.abs(a - b) < e;
const press = (dev, i, v = true) => { dev.buttons[i] = { pressed: v, value: v ? 1 : 0 }; };
const rest = () => { stick.axes.fill(0); stick.axes[9] = 1.2857; thr.axes.fill(0); thr.axes[9] = 1.2857; };

check('the X56 stick and throttle are recognised as flight sticks', Hm.isFlightStick(STICK_ID) && Hm.isFlightStick(THR_ID) && Hm.roleOf(THR_ID) === 'throttle' && Hm.roleOf(STICK_ID) === 'stick');
check('an Xbox pad is not', !Hm.isFlightStick(xbox.id));
check('Firefox-style ids are recognised too', Hm.isFlightStick('0738-2221-Saitek Pro Flight X-56 Rhino Stick'));

const inp = new Input(null);
pads = [stick, thr, xbox];
check('the gamepad layer leaves the X56 alone', inp.pads.list().length === 1 && inp.pads.list()[0].id === xbox.id);
pads = [stick, thr];
const H = inp.hotas;
const frame = (dt = 1 / 120) => { nowMs += dt * 1000; return { ...inp.update(dt) }; };
frame();
check('the HOTAS is seen', H.connected && H.devices.length === 2);
check('finding it says so', inp.takeNotices().some((n) => /found/.test(n)));

// ---------------------------------------------------------------- X56 defaults
stick.axes[0] = 1; let c = frame();
check('stick right: full roll right, on the first frame (no smoothing)', near(c.roll, 1), c.roll.toFixed(3));
check('the HUD switches to flight-stick prompts', inp.source === 'hotas');
stick.axes[0] = 0; c = frame();
check('stick centred: roll back to zero at once', c.roll === 0);
stick.axes[1] = -1; c = frame();
check('stick pushed forward: nose down', near(c.pitch, 1), c.pitch.toFixed(3));
stick.axes[1] = 0; stick.axes[5] = 0.6; c = frame();
check('twist right turns right (yaw on the twist, not a button)', c.yaw > 0.5, c.yaw.toFixed(3));
stick.axes[5] = 0.02; c = frame();
check('a small dead zone hides sensor noise', c.yaw === 0);
rest();
thr.axes[0] = -1; c = frame();
check('spring lift (default): throttle forward is full lift stick', near(c.collective, 1) && c.lever === null, `${c.collective} ${c.lever}`);
thr.axes[0] = 0; c = frame();
check('spring lift: throttle half way is centre stick (gentle settle with Assist off)', c.collective === 0);
thr.axes[0] = 1; c = frame();
check('spring lift: throttle back is full down', near(c.collective, -1));

H.setProfile({ ...H.profile, lift: 'lever' });
thr.axes[0] = -1; c = frame();
check('lever: throttle forward is the full collective', c.lever === 1 && near(c.collective, 1), `${c.lever}`);
thr.axes[0] = 0.04; c = frame();
check('lever: near the middle holds height with Assist on', c.collective === 0 && near(c.lever, 0.48));
thr.axes[0] = 0.5; c = frame();
check('lever: set back from the middle sinks with Assist on', c.collective < -0.2, c.collective.toFixed(3));
const def = CFG.heli;
check('lever: with Assist off the rotor takes the lever position as it is', near(stepCollective(0.3, c.collective, def, 1 / 120, { lever: c.lever }), c.lever, 1e-9));
check('lever: wins over hold mode too', (() => { CFG.collective.mode = 'hold'; const v = stepCollective(0.9, 1, def, 1 / 120, { lever: 0.4 }); CFG.collective.mode = 'spring'; return v === 0.4; })());
check('no lever: the spring collective is unchanged', stepCollective(0.3, 0, def, 1 / 120, {}) === stepCollective(0.3, 0, def, 1 / 120, { lever: null }));
H.setProfile({ ...H.profile, lift: 'spring' });
rest(); frame();

// ---------------------------------------------------------------- buttons and hat
press(stick, 0); frame(); frame(); press(stick, 0, false); frame();
let acts = inp.takeActions();
check('trigger hooks, once per pull', acts.filter((a) => a === 'attach').length === 1, acts.join());
press(stick, 1); c = frame();
check('A held pours', c.pour === true);
press(stick, 1, false); c = frame();
check('released, it stops', c.pour === false);
press(thr, 0); frame(); press(thr, 0, false); frame();
check('throttle E toggles Flight Assist', inp.takeActions().includes('assist'));
stick.axes[9] = -1; frame();
check('hat up zooms the camera in', inp.camOrbit.zoom < 0, inp.camOrbit.zoom.toFixed(4));
check('the hat reads eight ways', JSON.stringify(Hm.hatDir(-1)) === '{"x":0,"y":1}' && JSON.stringify(Hm.hatDir(-0.4286)) === '{"x":1,"y":0}' && Hm.hatDir(1.2857) === null);
stick.axes[9] = 1.2857; frame();
inp.menuMode = true; stick.axes[0] = 1; c = frame(); inp.menuMode = false; stick.axes[0] = 0;
check('menus open: the stick does not fly', c.roll === 0);
frame();

// ---------------------------------------------------------------- teach
let views = [];
H.startTeach((v) => views.push(v));
const run = (n = 60) => { for (let i = 0; i < n; i++) frame(); };
// Pretend this stick reports roll on axis 2, reversed, and pitch on axis 1 the right way round.
run(); stick.axes[2] = -0.9; run(); stick.axes[2] = 0; run();
run(); stick.axes[1] = 0.8; run(); stick.axes[1] = 0; run();
run(); stick.axes[5] = 0.9; run(); stick.axes[5] = 0; run();
// Throttle starts in the middle: pulled back first (ignored), then pushed forward (counts).
run(); thr.axes[4] = 0.5; run(); thr.axes[4] = 1; run(); thr.axes[4] = 0.4; run(); thr.axes[4] = -0.4; run(); thr.axes[4] = -1; run();
const P = H.profile;
check('teach walks through four steps and finishes', views.length === 5 && views[4].done && P.taught, JSON.stringify(views.map((v) => v && (v.step || v.done))));
check('teach: roll found where it was moved, with its direction', P.axes.roll.dev === STICK_ID && P.axes.roll.index === 2 && P.axes.roll.sign === -1, JSON.stringify(P.axes.roll));
check('teach: pitch', P.axes.pitch.index === 1 && P.axes.pitch.sign === 1);
check('teach: yaw', P.axes.yaw.index === 5);
check('teach: throttle forward is more lift even after pulling it back first', P.axes.collective.dev === THR_ID && P.axes.collective.index === 4 && P.axes.collective.sign === -1, JSON.stringify(P.axes.collective));
rest(); stick.axes[2] = -1; c = frame();
check('the taught axis flies', near(c.roll, 1), c.roll.toFixed(3));
rest(); frame();
check('the profile is saved', JSON.parse(store.get('helicoptea.hotas')).axes.roll.index === 2);
const again = new Input(null);
check('and comes back on reload', again.hotas.profile.axes.roll.index === 2 && again.hotas.profile.taught);

// ---------------------------------------------------------------- remap a button
let got;
H.startCapture((r) => { got = r; });
press(thr, 7); frame(); press(thr, 7, false); frame();
check('button capture takes the next press on either device', got && got.dev === THR_ID && got.index === 7);
H.bind('restart', got);
H.bind('mark', got);
check('a button does one job: binding it again moves it', H.profile.buttons.mark.some((r) => r.index === 7) && !H.profile.buttons.restart.some((r) => r.index === 7));
H.resetProfile();
check('back to X56 defaults', !H.profile.taught && H.profile.axes.roll.dev === '@stick');
const bad = Hm.normalizeHotas({ axes: { roll: { dev: 5, index: -1 } }, lift: 'rocket', deadZone: 9, buttons: { attach: [{ dev: 'x', index: 900 }] } });
check('saved profiles load defensively', bad.axes.roll.dev === '@stick' && bad.lift === 'spring' && bad.deadZone === 0.03 && bad.buttons.attach.length === 0);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} flight stick checks passed`);
process.exit(failed.length ? 1 : 0);
