// Controller layout checks (part of `npm run check`): the presets route sticks and buttons as documented,
// every preset is clash-free, remapping resolves clashes without leaving anything dark, inverts and
// presets persist, old saved settings and pad wirings migrate, and the skycrane's tank buttons and the
// menus behave. Drives the real Gamepads class with an emulated standard pad.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
let nowMs = 1000;
globalThis.performance = { now: () => nowMs };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [{ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: pad.axes.slice(), buttons: pad.buttons.map((b) => ({ ...b })) }] }, configurable: true });

const L = await import('../src/input/layouts.js');
const { Gamepads, migrateBinding } = await import('../src/input/gamepad.js');
const { BTN } = L;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, e = 0.02) => Math.abs(a - b) < e;

// Virtual sticks are +up; a standard pad reports up as negative.
const sticks = (lx = 0, ly = 0, rx = 0, ry = 0) => { pad.axes = [lx, -ly, rx, -ry]; };
const press = (i, v = 1) => { pad.buttons[i] = { pressed: v > 0.1, value: v }; };
const releaseAll = () => { for (let i = 0; i < pad.buttons.length; i++) pad.buttons[i] = { pressed: false, value: 0 }; };
const reset = () => { store.clear(); sticks(); releaseAll(); };
const fresh = () => { const g = new Gamepads(); g.settings.expo = 0; g.settings.deadZone = 0; return g; };
const frame = (g, opts = {}) => { g.triggerMode = opts.tank ? 'tank' : 'collective'; nowMs += opts.ms ?? 16; g.poll((opts.ms ?? 16) / 1000, !!opts.menu); return g.takeEvents(); };

// ---------------------------------------------------------------- presets
check('default preset is Aim', L.defaultLayout().preset === 'aim');
for (const id of L.PRESET_ORDER) {
  const m = L.mappingOf(L.choosePreset(L.defaultLayout(), id));
  const c = L.conflicts(m);
  check(`preset ${id} has no clashes`, c.length === 0, JSON.stringify(c));
  const used = L.FLIGHT_AXES.map((a) => m.axes[a]);
  check(`preset ${id} flies all four axes from four different inputs`, new Set(used).size === 4 && !used.includes('none'), used.join());
  check(`preset ${id}: yaw is never on a button`, ['lx', 'rx', 'ly', 'ry'].includes(m.axes.yaw));
  const hooks = L.activeButtons(m, 'heli').attach;
  check(`preset ${id}: hook / release on A and a bumper`, hooks.includes(BTN.A) && (hooks.includes(BTN.LB) || hooks.includes(BTN.RB)), hooks.map(L.buttonName).join());
  for (const ctx of ['heli', 'tank']) {
    const b = L.activeButtons(m, ctx);
    const owners = new Map();
    let dup = null;
    for (const [id2, list] of Object.entries(b)) for (const x of list) { if (owners.has(x)) dup = `${L.buttonName(x)}: ${owners.get(x)} + ${id2}`; owners.set(x, id2); }
    const ax = L.activeAxes(m, ctx).axes;
    const trigAxis = Object.values(ax).includes('trig');
    check(`preset ${id} (${ctx}): one job per button`, !dup && !(trigAxis && (owners.has(BTN.LT) || owners.has(BTN.RT))), dup || '');
  }
}

// ---------------------------------------------------------------- Aim routing
reset();
let g = fresh();
sticks(0, 0, 0, 1); frame(g);
check('Aim: right stick up pitches forward', near(g.out.pitch, 1) && near(g.out.yaw, 0), JSON.stringify(g.out));
sticks(0, 0, 1, 0); frame(g);
check('Aim: right stick right turns right', near(g.out.yaw, 1) && near(g.out.pitch, 0));
sticks(0, 1, 0, 0); frame(g);
check('Aim: left stick up adds lift', near(g.out.collective, 1) && near(g.out.roll, 0));
sticks(-1, 0, 0, 0); frame(g);
check('Aim: left stick left rolls left', near(g.out.roll, -1) && near(g.out.yaw, 0));
sticks(); press(BTN.RT, 1); press(BTN.LT, 1); frame(g);
check('Aim: triggers do not touch lift (they pour and hold the bolted camera)', near(g.out.collective, 0));
check('Aim: RT pours from the bucket', g.pour === true);
check('Aim: LT holds the bolted-on camera', g.isHeld('boltCam'));
releaseAll(); frame(g);
check('Aim: releasing LT lets go of the bolted camera', !g.isHeld('boltCam'));

g.setInvert('pitch', true);
sticks(0, 0, 0, 1); frame(g);
check('invert pitch: right stick up raises the nose', near(g.out.pitch, -1));
const g2 = fresh();
check('invert pitch persists', g2.layout.invert.pitch === true);
g.setInvert('pitch', false);

// Buttons in flight.
sticks(); releaseAll(); frame(g);
press(BTN.RB); let ev = frame(g); releaseAll(); frame(g);
check('Aim: RB hooks and drops (thumbs stay on the sticks)', ev.includes('attach'), ev.join());
press(BTN.A); ev = frame(g); releaseAll(); frame(g);
check('Aim: A still hooks', ev.includes('attach'));
press(BTN.LB); ev = frame(g); releaseAll(); frame(g);
check('Aim: LB marks a moment for the flight notes', ev.includes('mark'));
frame(g, { ms: 1000 }); press(BTN.RT, 1); ev = frame(g); releaseAll(); frame(g, { ms: 120 }); press(BTN.RT, 1); ev = ev.concat(frame(g)); releaseAll(); frame(g);
check('Aim: two pulls salvo exactly once', ev.filter((e) => e === 'salvo').length === 1);
check('Aim: two quick pulls of RT latch the bucket open (salvo)', ev.includes('salvo'), ev.join());

// Look: hold L3, the right stick looks and stops flying.
press(BTN.L3); sticks(0, 0, 0.9, 0.9); frame(g, { ms: 200 }); frame(g, { ms: 200 });
check('hold L3: the right stick looks instead of flying', g.look && near(g.out.pitch, 0) && near(g.out.yaw, 0) && g.look.x > 0.5, JSON.stringify(g.look));
sticks(); ev = frame(g); releaseAll(); ev = ev.concat(frame(g));
check('a long L3 hold does not also switch view', !ev.includes('view'));
press(BTN.L3); frame(g, { ms: 50 }); releaseAll(); ev = frame(g);
check('a quick L3 tap switches view', ev.includes('view'));

// ---------------------------------------------------------------- skycrane in Aim
reset(); g = fresh();
press(BTN.RT, 0.5); frame(g, { tank: true });
check('Aim skycrane: RT opens the belly doors part-way (analog)', g.doors > 0.2 && g.doors < 0.9, g.doors.toFixed(2));
releaseAll(); press(BTN.LB); frame(g, { tank: true });
check('Aim skycrane: LB pumps', g.pump > 0.9);
releaseAll(); ev = frame(g, { tank: true });
press(BTN.LB); ev = frame(g, { tank: true }); releaseAll(); frame(g, { tank: true, ms: 100 }); press(BTN.LB); ev = ev.concat(frame(g, { tank: true })); releaseAll(); frame(g, { tank: true });
check('Aim skycrane: LB tapped twice = auto-fill', ev.includes('autofill'), ev.join());
check('Aim skycrane: LB does not also mark there', !ev.includes('mark'));
press(BTN.UP); frame(g, { tank: true });
check('Aim skycrane: d-pad up reels the hose in', g.reel === -1);
releaseAll(); press(BTN.DOWN); frame(g, { tank: true });
check('Aim skycrane: d-pad down reels it out', g.reel === 1 && g.cam.zoom === 0, `reel ${g.reel} zoom ${g.cam.zoom}`);
releaseAll(); press(BTN.LT); frame(g, { tank: true });
check('Aim skycrane: LT is still the bolted camera', g.isHeld('boltCam') && g.pump === 0);
releaseAll(); press(BTN.RB); ev = frame(g, { tank: true }); releaseAll(); frame(g, { tank: true });
check('Aim skycrane: RB hooks', ev.includes('attach'));

// ---------------------------------------------------------------- Classic keeps the old layout exactly
reset(); g = fresh(); g.choosePreset('mode2');
sticks(0.8, 0, 0, 0); frame(g);
check('Classic: left stick sideways turns', near(g.out.yaw, 0.8) && near(g.out.roll, 0));
sticks(0, 0, 0.7, 0.6); frame(g);
check('Classic: right stick tilts', near(g.out.roll, 0.7) && near(g.out.pitch, 0.6));
sticks(); press(BTN.RT, 1); frame(g);
check('Classic: the triggers add lift', near(g.out.collective, 1));
releaseAll(); press(BTN.RB); frame(g);
check('Classic: RB pours', g.pour === true);
releaseAll(); frame(g); press(BTN.LB); ev = frame(g); releaseAll(); frame(g);
check('Classic: LB hooks and drops', ev.includes('attach'), ev.join());
g.settings.triggers = false; releaseAll(); press(BTN.RT, 1); frame(g);
check('Classic: "free triggers add lift" can be turned off', near(g.out.collective, 0));
g.settings.triggers = true;
releaseAll(); press(BTN.LT, 0.6); frame(g, { tank: true });
check('Classic skycrane: LT pumps by how hard you pull', g.pump > 0.6 && g.pump < 0.8 && near(g.out.collective, 0), g.pump.toFixed(2));
releaseAll(); press(BTN.LB); press(BTN.RB); ev = frame(g, { tank: true }); releaseAll(); frame(g, { tank: true });
check('Classic skycrane: both bumpers = auto-fill', ev.includes('autofill'));

// ---------------------------------------------------------------- Mode 1 and Arcade
reset(); g = fresh(); g.choosePreset('mode1');
sticks(0, 1, 0, 0); frame(g);
check('Mode 1: left stick up pitches forward', near(g.out.pitch, 1) && near(g.out.collective, 0));
sticks(0, 0, 0, 1); frame(g);
check('Mode 1: right stick up adds lift', near(g.out.collective, 1));

reset(); g = fresh(); g.choosePreset('arcade');
press(BTN.RT, 1); frame(g);
check('Arcade: RT climbs', near(g.out.collective, 1));
releaseAll(); press(BTN.LT, 1); frame(g);
check('Arcade: LT sinks', near(g.out.collective, -1));
releaseAll(); sticks(0, 1, 0, 0); frame(g);
check('Arcade: left stick up pitches forward', near(g.out.pitch, 1));
sticks(); releaseAll(); frame(g); press(BTN.LB); ev = frame(g); releaseAll(); frame(g);
check('Arcade: LB hooks and drops', ev.includes('attach'), ev.join());
press(BTN.R3); frame(g);
check('Arcade: R3 holds the bolted-on camera', g.isHeld('boltCam'));
releaseAll(); frame(g);
sticks(0, 0, 0, 1); frame(g, { tank: true });
check('Arcade skycrane: lift moves to the right stick ↕ (triggers run the tank)', near(g.out.collective, 1));
sticks(); press(BTN.RT, 1); frame(g, { tank: true });
check('Arcade skycrane: RT opens the doors, not lift', g.doors > 0.9 && near(g.out.collective, 0));

// ---------------------------------------------------------------- cycling and persistence
reset(); g = fresh();
const names = [];
for (let i = 0; i < L.PRESET_ORDER.length; i++) names.push(g.cyclePreset(1));
check('cycling visits every preset and comes back to Aim', names.length === 5 && names[names.length - 1] === 'Aim' && new Set(names).size === 5, names.join(' → '));
g.choosePreset('mode1');
check('the chosen preset persists', fresh().layout.preset === 'mode1');
check('cycling backwards works', g.cyclePreset(-1) === 'Classic (RC Mode 2)');

// ---------------------------------------------------------------- remapping and clashes
reset(); g = fresh();
let notes = g.setAxis('yaw', 'ly');
let m = L.mappingOf(g.layout);
check('moving turn onto the left stick ↕ swaps lift onto turn\'s old place', m.axes.yaw === 'ly' && m.axes.collective === 'rx' && L.conflicts(m).length === 0, `${JSON.stringify(m.axes)} | ${notes.join('; ')}`);
check('an edit becomes a Custom layout', g.layout.preset === 'custom' && L.presetName(g.layout) === 'Custom');
check('the custom layout persists', L.FLIGHT_AXES.every((a) => L.mappingOf(fresh().layout).axes[a] === m.axes[a]));
const order = []; for (let i = 0; i < 6; i++) order.push(g.cyclePreset(1));
check('cycling includes your custom layout', order.includes('Custom'), order.join(' → '));
sticks(0, 1, 0, 0); g.choosePreset('custom'); frame(g);
check('custom layout flies: left stick up now turns', near(g.out.yaw, 1) && near(g.out.collective, 0));
sticks();

reset(); g = fresh();
notes = g.bind('recenter', BTN.Y, 0);
m = L.mappingOf(g.layout);
check('rebinding recenter to Y: Flight Assist takes B instead of going dark', m.buttons.recenter[0] === BTN.Y && m.buttons.assist.includes(BTN.B) && !m.buttons.assist.includes(BTN.Y), notes.join('; '));
check('no clashes after a rebind', L.conflicts(m).length === 0);
notes = g.bind('help', BTN.RB);
m = L.mappingOf(g.layout);
check('adding RB to help takes it off hook, which keeps A', m.buttons.help.includes(BTN.RB) && !m.buttons.attach.includes(BTN.RB) && m.buttons.attach.includes(BTN.A), notes.join('; '));
check('skycrane-only and general bindings may share (the skycrane one wins there)', L.conflicts(L.mappingOf(L.choosePreset(L.defaultLayout(), 'mode2'))).length === 0);
g.unbind('help', BTN.RB);
check('unbind removes just that button', !L.mappingOf(g.layout).buttons.help.includes(BTN.RB));

reset(); g = fresh();
notes = g.setAxis('collective', 'trig');
m = L.mappingOf(g.layout);
check('putting lift on the triggers frees them from pour and the bolted camera', m.axes.collective === 'trig' && !m.buttons.pour.includes(BTN.RT) && !m.buttons.boltCam.includes(BTN.LT) && L.conflicts(m).length === 0, notes.join('; '));
check('…and says what moved', notes.some((n) => /RT/.test(n)) && notes.some((n) => /LT/.test(n)), notes.join('; '));
notes = g.bind('pour', BTN.RT);
m = L.mappingOf(g.layout);
check('binding pour back to RT moves lift off the triggers to a free stick axis', m.axes.collective !== 'trig' && m.buttons.pour.includes(BTN.RT) && L.conflicts(m).length === 0, `${m.axes.collective} | ${notes.join('; ')}`);

reset(); g = fresh();
for (const b of [BTN.X, BTN.Y]) g.bind('mark', b);
const before = L.mappingOf(g.layout).buttons.mark.length;
notes = g.bind('mark', BTN.START);
check(`an action holds at most ${L.MAX_PER_ACTION} buttons`, L.mappingOf(g.layout).buttons.mark.length === before && before === L.MAX_PER_ACTION, notes.join('; '));

// Capturing a press for the settings panel.
reset(); g = fresh();
let got;
g.startCapture('button', (r) => { got = r; });
press(BTN.A); frame(g, { menu: true });
check('capture ignores the button still held from opening it', got === undefined);
releaseAll(); frame(g, { menu: true }); press(BTN.X); ev = frame(g, { menu: true });
check('capture takes the next press and swallows it', got && got.button === BTN.X && !ev.includes('confirm'), JSON.stringify(got));
releaseAll(); frame(g, { menu: true });
got = undefined; g.startCapture('button', (r) => { got = r; });
for (let i = 0; i < 10; i++) frame(g, { menu: true, ms: 1000 });
check('capture times out on its own', got === null && !g.capture);

// ---------------------------------------------------------------- menus are not remappable
reset(); g = fresh();
g.bind('assist', BTN.A);
press(BTN.A); ev = frame(g, { menu: true }); releaseAll(); frame(g, { menu: true });
check('A always selects in menus, whatever it does in flight', ev.includes('confirm') && !ev.includes('assist'));
sticks(0, 1, 0, 0); ev = frame(g, { menu: true });
check('the left stick always moves through menus', ev.includes('nav-up'));
check('menus hold the sticks at zero', near(g.out.collective, 0) && near(g.out.pitch, 0));

// ---------------------------------------------------------------- migration and robustness
reset();
store.set('helicoptea.pad.settings', JSON.stringify({ invertPitch: true, invertCollective: true, deadZone: 0.2 }));
g = new Gamepads();
check('old invert settings carry over to the new layout', g.layout.invert.pitch && g.layout.invert.collective && g.layout.preset === 'aim');
check('old shaping settings are kept', g.settings.deadZone === 0.2);
const oldWiring = { custom: true, axes: { collective: { type: 'axis', index: 1, sign: -1 }, yaw: { type: 'axis', index: 0, sign: 1 }, pitch: { type: 'axis', index: 5, sign: -1 }, roll: { type: 'axis', index: 2, sign: 1 } }, buttons: { attach: [2], assist: [0], pour: [7], back: [3] } };
const mig = migrateBinding(oldWiring);
check('an old custom pad wiring migrates to the virtual pad', mig.v === 2 && mig.sticks.ry.index === 5 && mig.sticks.ly.sign === -1 && mig.pad[BTN.A] === 2 && mig.pad[BTN.Y] === 0 && mig.pad[BTN.B] === 3 && mig.pad[BTN.RB] === 7, JSON.stringify(mig));
const junk = L.normalizeLayout({ preset: 'nope', custom: { axes: { yaw: 'banana' }, buttons: { attach: [99, 0, 0, 'x'] } }, invert: { pitch: 'yes' } });
check('junk saved layouts load safely', junk.preset === 'aim' && junk.custom.axes.yaw === 'none' && JSON.stringify(junk.custom.buttons.attach) === '[0]' && junk.invert.pitch === true);
store.set('helicoptea.pad.layout', '{not json');
check('a corrupt saved layout falls back to Aim', new Gamepads().layout.preset === 'aim');

// ---------------------------------------------------------------- other systems can add actions
reset();
const added = L.registerAction({ id: 'testCam', label: 'Test camera', ctx: 'all' }, { aim: [BTN.X] });
g = fresh();
press(BTN.X); ev = frame(g);
check('registerAction: a new action gets its default button and fires', added && ev.includes('testCam') && g.isHeld('testCam'), ev.join());
check('registerAction: …which clashes with help on X until resolved', L.conflicts(L.mappingOf(g.layout)).some((c) => c.button === BTN.X));
releaseAll();

// D-pad camera rates use wall time at both low and high refresh rates. Exercise the
// real pad mapping and Input integration at exact timesteps independently of GPU load.
const { Input } = await import('../src/input/input.js');
for (const hz of [30, 60, 120]) {
  for (const mode of ['chase', 'locked', 'cockpit']) {
    reset();
    const input = Object.create(Input.prototype);
    Object.assign(input, { pads: fresh(), gp: {}, source: 'keyboard', menuMode: false,
      viewMode: mode, actions: [], notices: [], camOrbit: {yaw:0,pitch:0,zoom:0}, look: {yaw:0,pitch:0,zoom:0} });
    input.pollGamepad(1 / hz);
    press(BTN.LEFT); press(BTN.DOWN);
    for (let i = 0; i < hz; i++) input.pollGamepad(1 / hz);
    const looking = mode === 'cockpit';
    const yaw = looking ? input.look.yaw : input.camOrbit.yaw;
    const vertical = looking ? input.look.pitch : input.camOrbit.zoom;
    check(`D-pad ${mode} is time-based at ${hz} Hz`, near(yaw, looking ? 1.5 : 1.8, 1e-8) && near(vertical, looking ? -1.1 : 1.2, 1e-8), `yaw=${yaw} vertical=${vertical}`);
  }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controller layout checks passed`);
if (failed.length) process.exit(1);
