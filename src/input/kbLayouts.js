// Keyboard and mouse layouts: which key or mouse movement flies what. Pure data and functions (no DOM), so
// the node checks can drive it directly. The keyboard counterpart of layouts.js: presets plus the player's
// own edits, saved as { preset, custom, mouseSens, invertMouse }.
//
// Keys are KeyboardEvent.code values ('KeyW', 'ArrowUp', 'Space'); mouse buttons are 'Mouse0' (left),
// 'Mouse1' (middle), 'Mouse2' (right), 'Mouse3' and 'Mouse4' (the side buttons).
//
// The mouse flies when a scheme gives it an axis. Mouse ↔ and ↕ each drive one of roll, pitch or yaw, and the
// scheme's mouse mode says how mouse movement becomes a stick deflection (input.js does the sums):
//   'nose'  (Battlefield style): moving the mouse moves the nose. Each movement is a short push of the cyclic
//           that springs back, so how far you move the mouse is how far the helicopter rotates, and with
//           Flight Assist off the rotation carries on until you stop it, as a real airframe's would. With
//           Assist on, pitch and roll become a tilt that stays where you leave it.
//   'stick' (virtual stick, the flight-sim "mouse joystick"): the mouse position is the stick. It stays where
//           you leave it, drawn as a dot in a ring; the centre-stick key or middle mouse puts it back.
// Neither mode touches the lift: W / S work like the gamepad's sprung lift stick (hold to climb).

export const KB_FLIGHT = [
  { id: 'collUp', label: 'More lift (hold to climb)', axis: 'collective', dir: 1 },
  { id: 'collDown', label: 'Less lift', axis: 'collective', dir: -1 },
  { id: 'yawLeft', label: 'Turn left', axis: 'yaw', dir: -1 },
  { id: 'yawRight', label: 'Turn right', axis: 'yaw', dir: 1 },
  { id: 'pitchFwd', label: 'Tilt forward', axis: 'pitch', dir: 1 },
  { id: 'pitchBack', label: 'Tilt back', axis: 'pitch', dir: -1 },
  { id: 'rollLeft', label: 'Tilt left', axis: 'roll', dir: -1 },
  { id: 'rollRight', label: 'Tilt right', axis: 'roll', dir: 1 },
];

// held: read every frame while down. Otherwise a press fires once, as an action of the same id.
export const KB_ACTIONS = [
  { id: 'attach', label: 'Hook / release' },
  { id: 'pour', label: 'Pour milk, or the skycrane\'s belly doors (hold; double-tap or Shift: salvo)', held: true },
  { id: 'pump', label: 'Skycrane: pump (hold; double-tap or Shift: auto-fill)', held: true },
  { id: 'reelIn', label: 'Skycrane: reel the hose in (hold)', held: true },
  { id: 'reelOut', label: 'Skycrane: reel the hose out (hold)', held: true },
  { id: 'freeLook', label: 'Free look (hold: the mouse looks around instead of flying)', held: true },
  { id: 'centreStick', label: 'Centre the mouse stick' },
  { id: 'boltCam', label: 'Bolted-on GoPro (hold)', held: true },
  { id: 'assist', label: 'Flight Assist on / off' },
  { id: 'restart', label: 'Restart flight (with Shift: reset the sandbox)' },
  { id: 'camNext', label: 'Next camera (with Shift: previous)' },
  { id: 'recenter', label: 'Recenter camera / look ahead' },
  { id: 'mark', label: 'Mark this moment for a flight note' },
  { id: 'aircraft', label: 'Switch aircraft' },
];
export const KB_BINDS = [...KB_FLIGHT, ...KB_ACTIONS];
export const KB_BIND = Object.fromEntries(KB_BINDS.map((b) => [b.id, b]));
export const MAX_KEYS = 3;

// Keys that always do the same thing, so no layout can lock you out of pausing, help or the menus.
// Digits 1 to 7 pick cameras; Shift is the modifier for reset, salvo and previous camera.
export const FIXED_KEYS = {
  Escape: 'pause', KeyP: 'pause', KeyH: 'help', Slash: 'help', KeyM: 'mute', Backquote: 'debug', F3: 'debug', F2: 'fpsmeter', Home: 'recenter',
};
const RESERVED = new Set([...Object.keys(FIXED_KEYS), 'Tab', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight', 'ContextMenu', 'CapsLock',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`), ...Array.from({ length: 7 }, (_, i) => `Digit${i + 1}`)]);
export function isReserved(code) { return RESERVED.has(code); }
export function isBindable(code) { return typeof code === 'string' && /^(Key|Digit|Arrow|Numpad|Mouse)|^(Space|Enter|Backspace|Insert|Delete|End|PageUp|PageDown|Comma|Period|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|IntlBackslash|AltLeft|AltRight|ControlLeft|ControlRight)$/.test(code) && !RESERVED.has(code); }

export const MOUSE_TARGETS = ['roll', 'pitch', 'yaw', 'none'];
export const MOUSE_TARGET_LABEL = { roll: 'Tilt sideways (roll)', pitch: 'Tilt forward / back (pitch)', yaw: 'Turn (yaw)', none: 'Nothing (drag orbits the camera)' };
export const MOUSE_MODES = ['nose', 'stick'];
export const MOUSE_MODE_LABEL = { nose: 'Moves the nose, springs back (Battlefield)', stick: 'Virtual stick, stays where you leave it' };

// Shared by every preset: the actions sit where they always have.
const ACTION_KEYS = {
  attach: ['Space', 'Enter'], pour: ['KeyG'], pump: ['KeyT'], reelIn: ['KeyZ'], reelOut: ['KeyX'], freeLook: [], centreStick: [],
  boltCam: ['KeyB', 'Mouse2'], assist: ['KeyF'], restart: ['KeyR'], camNext: ['KeyC'], recenter: ['KeyU'], mark: ['KeyN'], aircraft: ['KeyV'],
};
const MOUSE_ACTIONS = { ...ACTION_KEYS, freeLook: ['AltLeft', 'Mouse1'] };

export const KB_PRESETS = {
  keyboard: {
    name: 'Keyboard only', blurb: 'The original keys. W / S lift, A / D turn (or Q / E), the arrows (or I J K L) tilt. The mouse just orbits the camera.',
    mouse: { x: 'none', y: 'none', mode: 'nose' },
    keys: {
      collUp: ['KeyW'], collDown: ['KeyS'], yawLeft: ['KeyA', 'KeyQ'], yawRight: ['KeyD', 'KeyE'],
      pitchFwd: ['ArrowUp', 'KeyI'], pitchBack: ['ArrowDown', 'KeyK'], rollLeft: ['ArrowLeft', 'KeyJ'], rollRight: ['ArrowRight', 'KeyL'], ...ACTION_KEYS,
    },
  },
  battlefield: {
    name: 'Battlefield (mouse tilts)', blurb: 'W / S lift, A / D turn, the mouse tilts: push it forward to dip the nose, sideways to bank. Hold Alt or the middle button to look around.',
    mouse: { x: 'roll', y: 'pitch', mode: 'nose' },
    keys: {
      collUp: ['KeyW'], collDown: ['KeyS'], yawLeft: ['KeyA'], yawRight: ['KeyD'],
      pitchFwd: ['ArrowUp'], pitchBack: ['ArrowDown'], rollLeft: ['ArrowLeft', 'KeyQ'], rollRight: ['ArrowRight', 'KeyE'], ...MOUSE_ACTIONS,
    },
  },
  battlefieldYaw: {
    name: 'Battlefield, mouse turns', blurb: 'The popular swap: the mouse turns and pitches the nose like aiming, A / D bank. W / S lift, Q / E also turn.',
    mouse: { x: 'yaw', y: 'pitch', mode: 'nose' },
    keys: {
      collUp: ['KeyW'], collDown: ['KeyS'], yawLeft: ['KeyQ'], yawRight: ['KeyE'],
      pitchFwd: ['ArrowUp'], pitchBack: ['ArrowDown'], rollLeft: ['KeyA', 'ArrowLeft'], rollRight: ['KeyD', 'ArrowRight'], ...MOUSE_ACTIONS,
    },
  },
  mouseStick: {
    name: 'Virtual stick (mouse joystick)', blurb: 'The flight-sim way: the mouse is the cyclic and stays where you leave it, shown as a dot in a ring. Q or the middle button centres it. W / S lift, A / D turn.',
    mouse: { x: 'roll', y: 'pitch', mode: 'stick' },
    keys: {
      collUp: ['KeyW'], collDown: ['KeyS'], yawLeft: ['KeyA'], yawRight: ['KeyD'],
      pitchFwd: ['ArrowUp'], pitchBack: ['ArrowDown'], rollLeft: ['ArrowLeft'], rollRight: ['ArrowRight'], ...ACTION_KEYS, freeLook: ['AltLeft'], centreStick: ['KeyQ', 'Mouse1'],
    },
  },
};
export const KB_PRESET_ORDER = ['keyboard', 'battlefield', 'battlefieldYaw', 'mouseStick'];
export const KB_DEFAULT_PRESET = 'keyboard';

// ---------------------------------------------------------------- layout state

const copyMap = (m) => ({ mouse: { ...m.mouse }, keys: Object.fromEntries(Object.entries(m.keys).map(([k, v]) => [k, v.slice()])) });

export function defaultKbLayout() { return { preset: KB_DEFAULT_PRESET, custom: null, mouseSens: 1, invertMouse: false }; }

// The mapping in force: a preset's or the player's own, always complete.
export function kbMappingOf(layout) {
  const src = layout.preset === 'custom' && layout.custom ? layout.custom : (KB_PRESETS[layout.preset] || KB_PRESETS[KB_DEFAULT_PRESET]);
  const m = copyMap(src);
  for (const k of ['x', 'y']) if (!MOUSE_TARGETS.includes(m.mouse[k])) m.mouse[k] = 'none';
  if (!MOUSE_MODES.includes(m.mouse.mode)) m.mouse.mode = 'nose';
  for (const { id } of KB_BINDS) if (!Array.isArray(m.keys[id])) m.keys[id] = [];
  return m;
}

export const mouseFlies = (m) => m.mouse.x !== 'none' || m.mouse.y !== 'none';

// Loads a saved layout defensively: unknown fields dropped, bad keys and duplicates removed.
export function normalizeKbLayout(saved) {
  const L = defaultKbLayout();
  if (!saved || typeof saved !== 'object') return L;
  if (saved.preset === 'custom' || KB_PRESETS[saved.preset]) L.preset = saved.preset;
  if (saved.custom && typeof saved.custom === 'object') {
    const c = { mouse: { x: 'none', y: 'none', mode: 'nose' }, keys: {} };
    for (const k of ['x', 'y']) if (MOUSE_TARGETS.includes(saved.custom.mouse?.[k])) c.mouse[k] = saved.custom.mouse[k];
    if (c.mouse.x === c.mouse.y) c.mouse.y = 'none';
    if (MOUSE_MODES.includes(saved.custom.mouse?.mode)) c.mouse.mode = saved.custom.mouse.mode;
    const taken = new Set();
    for (const { id } of KB_BINDS) {
      const v = saved.custom.keys?.[id];
      c.keys[id] = (Array.isArray(v) ? v : []).filter((k) => isBindable(k) && !taken.has(k)).slice(0, MAX_KEYS);
      for (const k of c.keys[id]) taken.add(k);
    }
    L.custom = c;
  }
  const s = Number(saved.mouseSens);
  if (Number.isFinite(s) && s >= 0.2 && s <= 3) L.mouseSens = s;
  L.invertMouse = !!saved.invertMouse;
  if (L.preset === 'custom' && !L.custom) L.preset = KB_DEFAULT_PRESET;
  return L;
}

export function chooseKbPreset(layout, id) {
  if (id === 'custom' ? !layout.custom : !KB_PRESETS[id]) return layout;
  return { ...layout, preset: id };
}

export function kbPresetName(layout) { return layout.preset === 'custom' ? 'Custom' : (KB_PRESETS[layout.preset]?.name || 'Custom'); }

// Every key used twice. Empty for a valid map.
export function kbConflicts(m) {
  const out = [];
  const seen = new Map();
  for (const { id } of KB_BINDS) {
    for (const k of m.keys[id]) {
      if (seen.has(k)) out.push({ key: k, a: seen.get(k), b: id });
      else seen.set(k, id);
    }
  }
  if (m.mouse.x !== 'none' && m.mouse.x === m.mouse.y) out.push({ key: 'mouse', a: 'x', b: 'y' });
  return out;
}

// ---------------------------------------------------------------- editing (always leaves a valid map)
// Each edit copies the mapping in force into the player's custom layout. Returns { layout, notes }.

const MOUSE_NAMES = ['Left mouse', 'Middle mouse', 'Right mouse', 'Mouse 4', 'Mouse 5'];
const SPECIAL = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter', AltLeft: 'Left Alt', AltRight: 'Right Alt',
  ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', Backspace: 'Backspace', Comma: ',', Period: '.', Semicolon: ';', Quote: '\'',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', IntlBackslash: '\\', PageUp: 'Page Up', PageDown: 'Page Down',
};
export function keyName(code) {
  if (!code) return 'unbound';
  if (code.startsWith('Mouse')) return MOUSE_NAMES[+code.slice(5)] || code;
  if (SPECIAL[code]) return SPECIAL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
const shortLabel = (id) => (KB_BIND[id]?.label || id).replace(/\s*\(.*$/, '').replace(/^Skycrane: /, 'Skycrane ');

function editable(layout) {
  return { m: kbMappingOf(layout), done: (m, notes) => ({ layout: { ...layout, preset: 'custom', custom: m }, notes }) };
}

// Binds a key (or replaces slot `slot`). Whatever had that key loses it; if that leaves it with nothing, it
// takes the key this binding gave up, so nothing goes dark.
export function bindKey(layout, id, code, slot = null) {
  if (!KB_BIND[id]) return { layout, notes: [] };
  if (!isBindable(code)) return { layout, notes: [isReserved(code) ? `${keyName(code)} is kept for menus, cameras and Shift combos` : `${keyName(code)} can't be bound`] };
  const { m, done } = editable(layout);
  const list = m.keys[id];
  if (list.includes(code)) return { layout, notes: [] };
  const notes = [];
  const replaced = slot !== null && slot < list.length ? list[slot] : null;
  if (replaced !== null) list[slot] = code;
  else if (list.length < MAX_KEYS) list.push(code);
  else return { layout, notes: [`${shortLabel(id)} already has ${MAX_KEYS} keys`] };
  for (const B of KB_BINDS) {
    if (B.id === id || !m.keys[B.id].includes(code)) continue;
    m.keys[B.id] = m.keys[B.id].filter((k) => k !== code);
    if (!m.keys[B.id].length && replaced !== null) { m.keys[B.id] = [replaced]; notes.push(`${shortLabel(B.id)} moved to ${keyName(replaced)}`); }
    else notes.push(`${keyName(code)} no longer does ${shortLabel(B.id)}`);
  }
  return done(m, notes);
}

export function unbindKey(layout, id, code) {
  if (!KB_BIND[id]) return { layout, notes: [] };
  const { m, done } = editable(layout);
  if (!m.keys[id].includes(code)) return { layout, notes: [] };
  m.keys[id] = m.keys[id].filter((k) => k !== code);
  return done(m, []);
}

// Points mouse ↔ or ↕ at a flight axis. The other mouse direction swaps rather than doubling up.
export function setMouseAxis(layout, dir, target) {
  if (!['x', 'y'].includes(dir) || !MOUSE_TARGETS.includes(target)) return { layout, notes: [] };
  const { m, done } = editable(layout);
  const other = dir === 'x' ? 'y' : 'x';
  if (m.mouse[dir] === target) return { layout, notes: [] };
  const notes = [];
  if (target !== 'none' && m.mouse[other] === target) {
    m.mouse[other] = m.mouse[dir];
    notes.push(`Mouse ${other === 'x' ? '↔' : '↕'} now does ${MOUSE_TARGET_LABEL[m.mouse[other]].replace(/ \(.*$/, '').toLowerCase()}`);
  }
  m.mouse[dir] = target;
  return done(m, notes);
}

export function setMouseMode(layout, mode) {
  if (!MOUSE_MODES.includes(mode)) return { layout, notes: [] };
  const { m, done } = editable(layout);
  if (m.mouse.mode === mode) return { layout, notes: [] };
  m.mouse.mode = mode;
  return done(m, []);
}

// key code -> bind id, for the keydown handler. Built once per layout change.
export function keyIndex(m) {
  const idx = new Map();
  for (const { id } of KB_BINDS) for (const k of m.keys[id]) if (!idx.has(k)) idx.set(k, id);
  return idx;
}

// Human words for a layout, for the help sheet.
export function describeKb(layout) {
  const m = kbMappingOf(layout);
  const rows = [];
  const keys = (id) => m.keys[id].map(keyName);
  const pair = (a, b) => [...keys(a).slice(0, 1), ...keys(b).slice(0, 1)];
  rows.push({ keys: pair('collUp', 'collDown'), label: 'Lift: hold up to climb, let go to settle, down to sink faster (Assist on: climb or sink, let go to hold height)' });
  rows.push({ keys: pair('yawLeft', 'yawRight'), label: 'Turn left / right' });
  rows.push({ keys: [...pair('pitchFwd', 'pitchBack'), ...pair('rollLeft', 'rollRight')], label: 'Tilt forward, back, left and right' });
  if (mouseFlies(m)) {
    const what = ['x', 'y'].filter((d) => m.mouse[d] !== 'none').map((d) => `${d === 'x' ? '↔' : '↕'} ${MOUSE_TARGET_LABEL[m.mouse[d]].replace(/ \(.*$/, '').toLowerCase()}`).join(', ');
    rows.push({ keys: ['Mouse'], label: `${what}. ${m.mouse.mode === 'stick' ? 'A virtual stick: it stays where you leave it.' : 'Moves the nose: springs back with Assist off, holds its tilt with Assist on.'} Click the scene to start flying with it` });
  }
  for (const A of KB_ACTIONS) if (m.keys[A.id].length) rows.push({ keys: keys(A.id), label: A.label });
  return rows;
}
