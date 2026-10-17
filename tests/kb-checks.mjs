// Keyboard and mouse checks (part of `npm run check`): the schemes are clash-free and fly all four axes,
// the original keys survive as the default, remapping never leaves a job dark, saved layouts load
// defensively, and the real Input class turns keys and pointer-locked mouse movement into the right
// stick values: the lift springs back like the pad's, the mouse nose mode springs back (and holds tilt with
// Assist on), and the virtual stick stays put until centred.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let nowMs = 1000;
globalThis.performance = { now: () => nowMs };
const listeners = new Map();
const on = (t, f) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(f); };
globalThis.window = { addEventListener: on };
globalThis.document = { addEventListener: on, hidden: false, pointerLockElement: null, exitPointerLock() { this.pointerLockElement = null; fire('pointerlockchange', {}); } };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
const fire = (t, e) => { for (const f of listeners.get(t) || []) f(e); };
const key = (code, down = true, extra = {}) => fire(down ? 'keydown' : 'keyup', { code, repeat: false, shiftKey: false, preventDefault() {}, target: null, ...extra });

const K = await import('../src/input/kbLayouts.js');
const { Input } = await import('../src/input/input.js');
const { CFG } = await import('../src/config.js');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, e = 0.02) => Math.abs(a - b) < e;

// ---------------------------------------------------------------- presets
check('default scheme is Battlefield: one click and the mouse flies', K.defaultKbLayout().preset === 'battlefield');
const km = K.kbMappingOf(K.chooseKbPreset(K.defaultKbLayout(), 'keyboard'));
const old = { collUp: ['KeyW'], collDown: ['KeyS'], yawLeft: ['KeyA', 'KeyQ'], yawRight: ['KeyD', 'KeyE'], pitchFwd: ['ArrowUp', 'KeyI'], pitchBack: ['ArrowDown', 'KeyK'], rollLeft: ['ArrowLeft', 'KeyJ'], rollRight: ['ArrowRight', 'KeyL'], attach: ['Space', 'Enter'], assist: ['KeyF'], restart: ['KeyR'], pour: ['KeyG'], pump: ['KeyT'], camNext: ['KeyC'], aircraft: ['KeyV'], mark: ['KeyN'] };
check('keyboard only keeps every original key', Object.entries(old).every(([id, keys]) => JSON.stringify(km.keys[id]) === JSON.stringify(keys)));
for (const id of K.KB_PRESET_ORDER) {
  const m = K.kbMappingOf(K.chooseKbPreset(K.defaultKbLayout(), id));
  check(`scheme ${id} has no clashes`, K.kbConflicts(m).length === 0, JSON.stringify(K.kbConflicts(m)));
  check(`scheme ${id}: every flight direction has a key`, K.KB_FLIGHT.every((f) => m.keys[f.id].length > 0));
  check(`scheme ${id}: W / S are the lift`, m.keys.collUp[0] === 'KeyW' && m.keys.collDown[0] === 'KeyS');
  check(`scheme ${id}: no reserved keys`, Object.values(m.keys).flat().every((k) => K.isBindable(k)), Object.values(m.keys).flat().filter((k) => !K.isBindable(k)).join());
  if (id !== 'keyboard') {
    check(`scheme ${id} flies with the mouse and never puts lift on it`, K.mouseFlies(m) && !['collective'].includes(m.mouse.x) && m.mouse.x !== m.mouse.y);
    check(`scheme ${id}: the mouse can look around`, m.keys.freeLook.length > 0);
  }
}
check('Battlefield: mouse ↔ rolls, ↕ pitches, A / D turn', (() => { const m = K.kbMappingOf({ preset: 'battlefield' }); return m.mouse.x === 'roll' && m.mouse.y === 'pitch' && m.keys.yawLeft[0] === 'KeyA'; })());
check('Battlefield mouse-turns: mouse ↔ turns, A / D bank', (() => { const m = K.kbMappingOf({ preset: 'battlefieldYaw' }); return m.mouse.x === 'yaw' && m.keys.rollLeft[0] === 'KeyA'; })());
check('virtual stick holds and has a centre key', (() => { const m = K.kbMappingOf({ preset: 'mouseStick' }); return m.mouse.mode === 'stick' && m.keys.centreStick.length > 0; })());

// ---------------------------------------------------------------- remapping
let r = K.bindKey(K.defaultKbLayout(), 'attach', 'KeyW');
let m = K.kbMappingOf(r.layout);
check('binding a used key moves it', m.keys.attach.includes('KeyW') && !m.keys.collUp.includes('KeyW') && r.layout.preset === 'custom', r.notes.join('; '));
check('a job robbed of its only key is said out loud', r.notes.some((n) => /More lift/.test(n)));
r = K.bindKey(K.defaultKbLayout(), 'collUp', 'KeyF', 0);
m = K.kbMappingOf(r.layout);
check('replacing a key hands the old one to whoever lost theirs', m.keys.collUp[0] === 'KeyF' && m.keys.assist[0] === 'KeyW', r.notes.join('; '));
check('remapped layout stays clash-free', K.kbConflicts(m).length === 0);
r = K.bindKey(K.defaultKbLayout(), 'attach', 'Escape');
check('Esc cannot be taken', r.layout.preset === 'battlefield' && /kept/.test(r.notes[0] || ''));
r = K.bindKey(K.defaultKbLayout(), 'attach', 'Digit3');
check('camera digits cannot be taken', r.layout.preset === 'battlefield');
r = K.bindKey(K.defaultKbLayout(), 'attach', 'Mouse0');
check('mouse buttons can be bound', K.kbMappingOf(r.layout).keys.attach.includes('Mouse0'));
r = K.bindKey(K.bindKey(K.defaultKbLayout(), 'attach', 'KeyO').layout, 'attach', 'KeyY');
check('at most three keys per job', K.kbMappingOf(r.layout).keys.attach.length === 3 && r.notes.length === 1);
r = K.setMouseAxis(K.chooseKbPreset(K.defaultKbLayout(), 'battlefield'), 'x', 'pitch');
m = K.kbMappingOf(r.layout);
check('pointing both mouse directions at one axis swaps them', m.mouse.x === 'pitch' && m.mouse.y === 'roll', r.notes.join());
const bad = K.normalizeKbLayout({ preset: 'custom', custom: { mouse: { x: 'roll', y: 'roll', mode: 'warp' }, keys: { collUp: ['KeyW', 'Escape', 7], collDown: ['KeyW', 'KeyS'] } }, mouseSens: 99 });
const bm = K.kbMappingOf(bad);
check('saved layouts load defensively', bm.mouse.y === 'none' && bm.mouse.mode === 'nose' && JSON.stringify(bm.keys.collUp) === '["KeyW"]' && JSON.stringify(bm.keys.collDown) === '["KeyS"]' && bad.mouseSens === 1);
check('a custom layout without its data falls back', K.normalizeKbLayout({ preset: 'custom' }).preset === 'battlefield');
check('key names read like keys', K.keyName('KeyW') === 'W' && K.keyName('ArrowUp') === '↑' && K.keyName('Mouse2') === 'Right mouse' && K.keyName('AltLeft') === 'Left Alt');

// ---------------------------------------------------------------- the real input
const cl = new Map();
const canvas = { addEventListener(t, f) { cl.set(t, f); }, setPointerCapture() {}, requestPointerLock() { document.pointerLockElement = canvas; fire('pointerlockchange', {}); } };
const run = (inp, secs, dt = 1 / 120) => { let c; for (let t = 0; t < secs - 1e-9; t += dt) { nowMs += dt * 1000; c = inp.update(dt); } return { ...c }; };
const inp = new Input(null);
inp.bindCanvas(canvas);
check('a fresh player gets Battlefield', inp.kbLayout.preset === 'battlefield' && inp.mouseFlies);
inp.chooseKbPreset('keyboard');
check('keyboard only: the mouse does not fly', !inp.mouseFlies);
key('KeyW');
let c = run(inp, 0.5);
check('W held: full lift stick', near(c.collective, 1), c.collective.toFixed(2));
key('KeyW', false);
c = run(inp, 0.4);
check('W let go: the lift stick springs back to centre (gentle sink with Assist off)', c.collective === 0, c.collective.toFixed(2));
key('ArrowUp'); c = run(inp, 0.4); key('ArrowUp', false);
check('arrow up tilts forward', near(c.pitch, 1), c.pitch.toFixed(2));
run(inp, 0.4);

inp.chooseKbPreset('battlefield');
check('Battlefield: the mouse flies', inp.mouseFlies);
inp.mouseMove(100, 0);
c = run(inp, 1 / 120);
check('mouse moves nothing until the pointer is captured', c.roll === 0 && inp.mstick.x === 0);
canvas.requestPointerLock();
check('pointer captured', inp.locked);
inp.assist = false;
inp.mouseMove(40, 0);
c = run(inp, 1 / 120);
const want = 40 / CFG.input.mouse.nosePx * Math.exp(-(1 / 120) / CFG.input.mouse.spring);
check('nose mode: mouse right banks right in proportion to the distance', near(c.roll, want, 0.01), `${c.roll.toFixed(3)} vs ${want.toFixed(3)}`);
c = run(inp, 0.5);
check('nose mode: the push springs back once the mouse stops', Math.abs(c.roll) < 0.01, c.roll.toFixed(4));
inp.mouseMove(0, -40);
c = run(inp, 1 / 120);
check('mouse forward dips the nose', c.pitch > 0.1, c.pitch.toFixed(3));
run(inp, 0.5);
inp.setMouseFeel('invertMouse', true);
inp.mouseMove(0, -40); c = run(inp, 1 / 120);
check('invert mouse ↕ reverses pitch', c.pitch < -0.1, c.pitch.toFixed(3));
inp.setMouseFeel('invertMouse', false);
run(inp, 0.5);
inp.assist = true;
inp.mouseMove(0, -200);
c = run(inp, 1);
check('nose mode with Assist on: a big tilt stays where you leave it', near(c.pitch, 200 / CFG.input.mouse.stickPx, 0.01), c.pitch.toFixed(3));
inp.mouseMove(0, 120);
c = run(inp, 3);
check('brought back near level, it settles to exactly level by itself', c.pitch === 0, c.pitch.toFixed(4));
inp.mouseMove(30, -30);
const c0 = run(inp, 1 / 120);
c = run(inp, 0.3);
check('a small tilt eases back gently, not at once', Math.abs(c.roll) < Math.abs(c0.roll) && Math.abs(c.roll) > 0.2 * Math.abs(c0.roll), `${c0.roll.toFixed(3)} -> ${c.roll.toFixed(3)}`);
c = run(inp, 2);
check('and reaches level in both axes', c.roll === 0 && c.pitch === 0);
const rate0 = CFG.input.mouse.levelRate;
CFG.input.mouse.levelRate = 0;
inp.mouseMove(0, -40); c = run(inp, 2);
check('levelling at 0 (tuning board) leaves small tilts alone', near(c.pitch, 40 / CFG.input.mouse.stickPx, 0.005), c.pitch.toFixed(3));
CFG.input.mouse.levelRate = rate0;
inp.setKbLayout(inp.kbLayout);
inp.chooseKbPreset('mouseStick'); canvas.requestPointerLock();
inp.mouseMove(40, 0); c = run(inp, 2);
check('the virtual stick never self-levels', near(c.roll, 40 / CFG.input.mouse.stickPx, 0.005), c.roll.toFixed(3));
inp.chooseKbPreset('battlefield'); canvas.requestPointerLock();
inp.setKbLayout(inp.kbLayout);   // re-centres
inp.assist = false;

inp.chooseKbPreset('battlefieldYaw');
canvas.requestPointerLock();
inp.mouseMove(30, 0); c = run(inp, 1 / 120);
check('mouse-turns: mouse right yaws right', c.yaw > 0.1 && c.roll === 0, `yaw ${c.yaw.toFixed(3)}`);
c = run(inp, 0.5);
check('mouse-turns: yaw springs back even with Assist on', (inp.assist = true) && (inp.mouseMove(30, 0), Math.abs(run(inp, 0.5).yaw) < 0.01));
inp.assist = false;

inp.chooseKbPreset('mouseStick');
canvas.requestPointerLock();
inp.mouseMove(200, 0);
c = run(inp, 1);
check('virtual stick: stays deflected', near(c.roll, 200 / CFG.input.mouse.stickPx, 0.01), c.roll.toFixed(3));
inp.mouseMove(2000, -2000);
c = run(inp, 1 / 120);
check('virtual stick: limited to the ring', near(Math.hypot(c.roll, c.pitch), 1, 0.01), Math.hypot(c.roll, c.pitch).toFixed(3));
key('KeyQ'); key('KeyQ', false);
c = run(inp, 1 / 120);
check('virtual stick: Q centres it', c.roll === 0 && c.pitch === 0);
inp.mouseMove(100, 0);
const move = (x, y) => cl.get('pointermove')({ pointerType: 'mouse', movementX: x, movementY: y });
key('AltLeft'); move(300, 0); key('AltLeft', false);
move(0, 0);
check('free look held: the mouse looks instead of flying', near(inp.mstick.x, 100 / CFG.input.mouse.stickPx, 0.01));
inp.mouseMove(100, 0);
document.exitPointerLock();
c = run(inp, 1 / 120);
check('letting go of the pointer lets go of the stick', !inp.locked && c.roll === 0 && inp.mstick.x === 0);
check('Esc out of the pointer mid-flight pauses', inp.takeActions().includes('pause'));

inp.chooseKbPreset('keyboard');
inp.bindKey('collUp', 'KeyO');
key('KeyO'); c = run(inp, 0.5); key('KeyO', false);
check('a remapped lift key flies', near(c.collective, 1), c.collective.toFixed(2));
key('KeyR', true, { shiftKey: true }); key('KeyR', false);
key('KeyR'); key('KeyR', false);
key('KeyH'); key('KeyH', false);
const acts = inp.takeActions();
check('Shift+restart resets, restart restarts, H is still help', acts.includes('reset') && acts.includes('restart') && acts.includes('help'), acts.join());
const saved = JSON.parse(store.get('helicoptea.kb.layout'));
check('the layout is saved', saved.preset === 'custom' && saved.custom.keys.collUp.includes('KeyO'));
const again = new Input(null);
check('and comes back on reload', again.kbMap.keys.collUp.includes('KeyO'));
let captured = null;
again.startKbCapture((res) => { captured = res; });
key('KeyJ');
check('remapping capture takes the next key and does not fly with it', captured?.code === 'KeyJ' && !again.keys.has('KeyJ'));

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} keyboard and mouse checks passed`);
process.exit(failed.length ? 1 : 0);
