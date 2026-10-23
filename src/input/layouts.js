// Controller layouts: which stick or button flies what. Pure data and functions (no DOM), so the node
// checks can drive it directly.
//
// Three layers, kept apart on purpose:
//   1. Device  -> virtual pad. Any controller becomes a standard pad: sticks lx, ly, rx, ry (+right, +up),
//      triggers lt, rt (0..1) and the 16 standard buttons (gamepad.js; the wizard covers odd pads).
//   2. Shaping -> dead zone, expo and sensitivity on the physical sticks (gamepad.js; flight tuning adds
//      its own deadzone / expo / rates on the logical axes afterwards). Nothing here shapes a value.
//   3. Layout  -> virtual pad to flight axes and actions (this file). Presets plus the player's own edits.
//
// Contexts: 'all' actions work in every aircraft; 'heli' ones on the micro heli and Chinook; 'tank' ones
// on the skycrane. A tank binding shadows an 'all' binding on the same button while flying the skycrane
// (so RB can hook a bag on the micro heli and reel the hose out on the skycrane). Two bindings that would
// both fire in the same aircraft are a conflict and are never stored.

export const FLIGHT_AXES = ['collective', 'yaw', 'pitch', 'roll'];
export const AXIS_LABEL = { collective: 'Lift (collective)', yaw: 'Turn (yaw)', pitch: 'Tilt forward / back (pitch)', roll: 'Tilt sideways (roll)' };
export const STICK_SOURCES = ['lx', 'ly', 'rx', 'ry'];
export const AXIS_SOURCES = ['lx', 'ly', 'rx', 'ry', 'trig', 'none'];
export const SOURCE_LABEL = { lx: 'Left stick ↔', ly: 'Left stick ↕', rx: 'Right stick ↔', ry: 'Right stick ↕', trig: 'Triggers (RT up, LT down)', none: 'Unbound' };

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
export const TRIGGER_BUTTONS = [BTN.LT, BTN.RT];

// Everything a button can do in flight. Menus are not remappable (A selects, B goes back, the d-pad and
// left stick move), so no layout can lock you out of the settings that would fix it.
export const ACTIONS = [
  { id: 'attach', label: 'Hook / release', ctx: 'all' },
  { id: 'pour', label: 'Pour milk from the bucket (hold; pull twice quickly to latch)', ctx: 'heli', analog: true },
  { id: 'look', label: 'Look around (hold: the right stick looks instead of flying)', ctx: 'all' },
  { id: 'view', label: 'Change camera view (tap) · look around (hold)', ctx: 'all' },
  { id: 'boltCam', label: 'Bolted-on camera (hold)', ctx: 'all' },
  { id: 'mark', label: 'Mark this moment for a flight note', ctx: 'all' },
  { id: 'assist', label: 'Flight Assist on / off', ctx: 'all' },
  { id: 'recenter', label: 'Recenter camera / look ahead', ctx: 'all' },
  { id: 'restart', label: 'Restart flight', ctx: 'all' },
  { id: 'pause', label: 'Pause menu', ctx: 'all' },
  { id: 'help', label: 'Controls help', ctx: 'all' },
  { id: 'camLeft', label: 'Camera orbit left', ctx: 'all' },
  { id: 'camRight', label: 'Camera orbit right', ctx: 'all' },
  { id: 'zoomIn', label: 'Camera zoom in', ctx: 'all' },
  { id: 'zoomOut', label: 'Camera zoom out', ctx: 'all' },
  { id: 'doors', label: 'Skycrane: belly doors (analog; two full pulls = salvo)', ctx: 'tank', analog: true },
  { id: 'pump', label: 'Skycrane: pump (analog; tap twice = auto-fill)', ctx: 'tank', analog: true },
  { id: 'reelIn', label: 'Skycrane: reel the hose in (with reel out = auto-fill)', ctx: 'tank' },
  { id: 'reelOut', label: 'Skycrane: reel the hose out', ctx: 'tank' },
];
export const ACTION = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

// Other systems can add their own named pad actions (a camera mode, say) with a default button per
// preset: registerAction({ id, label, ctx }, { aim: [BTN.X] }). Read them back with Gamepads.isHeld(id)
// (held) or as an event of the same name (pressed). Unlisted presets get no button.
export function registerAction(def, defaults = {}) {
  if (!def || !def.id || ACTION[def.id]) return false;
  const a = { ctx: 'all', ...def };
  ACTIONS.push(a);
  ACTION[a.id] = a;
  for (const [id, p] of Object.entries(PRESETS)) p.buttons = { ...p.buttons, [a.id]: (defaults[id] || []).slice() };
  return true;
}
export const MAX_PER_ACTION = 3;

const CAMERA = { camLeft: [BTN.LEFT], camRight: [BTN.RIGHT], zoomIn: [BTN.UP], zoomOut: [BTN.DOWN] };
const COMMON = { assist: [BTN.Y], restart: [BTN.START], pause: [BTN.BACK], help: [BTN.X], recenter: [BTN.B], view: [BTN.L3], ...CAMERA };
// The skycrane's original tank layout: triggers run doors and pump, bumpers reel.
const TANK = { doors: [BTN.RT], pump: [BTN.LT], reelIn: [BTN.LB], reelOut: [BTN.RB] };

// The new default. Thumbs never leave the sticks for the jobs you do mid-dip: RB hooks and drops,
// RT pours (analog; the belly doors on the skycrane), LT held is the bolted-on camera on every aircraft,
// LB marks a moment for the replay. On the skycrane LB pumps instead (tap it twice for auto-fill) and
// the d-pad ↑ / ↓ reels the hose. No rudder on the bumpers or triggers: yaw stays on a proportional stick.
const THUMBS_ON_STICKS = {
  ...COMMON, attach: [BTN.A, BTN.RB], pour: [BTN.RT], look: [], boltCam: [BTN.LT], mark: [BTN.LB, BTN.R3],
  doors: [BTN.RT], pump: [BTN.LB], reelIn: [BTN.UP], reelOut: [BTN.DOWN],
};

// The original layout (triggers free on the micro heli and Chinook, so they add lift), plus LB to hook so
// the thumbs can stay on the sticks. On the skycrane LB reels the hose in, and A hooks.
const CLASSIC_BUTTONS = { ...COMMON, attach: [BTN.A, BTN.LB], pour: [BTN.RB], look: [], boltCam: [], mark: [BTN.R3], ...TANK };

export const PRESETS = {
  aim: {
    name: 'Aim', blurb: 'Right stick aims the nose like a rifle: ↕ pitch, ↔ turn. Left stick: ↕ lift, ↔ roll.',
    axes: { collective: 'ly', roll: 'lx', pitch: 'ry', yaw: 'rx' }, buttons: THUMBS_ON_STICKS,
  },
  aimSouthpaw: {
    name: 'Aim, southpaw', blurb: 'Aim mirrored: left stick aims (↕ pitch, ↔ turn), right stick ↕ lift, ↔ roll.',
    axes: { collective: 'ry', roll: 'rx', pitch: 'ly', yaw: 'lx' }, buttons: THUMBS_ON_STICKS,
  },
  mode2: {
    name: 'Classic (RC Mode 2)', blurb: 'The original twin-stick layout. Left stick: ↕ lift, ↔ turn. Right stick tilts. Triggers add lift. LB hooks, RB pours.',
    axes: { collective: 'ly', yaw: 'lx', pitch: 'ry', roll: 'rx' }, buttons: CLASSIC_BUTTONS,
  },
  mode1: {
    name: 'RC Mode 1', blurb: 'Left stick: ↕ pitch, ↔ turn. Right stick: ↕ lift, ↔ roll.',
    axes: { pitch: 'ly', yaw: 'lx', collective: 'ry', roll: 'rx' }, buttons: THUMBS_ON_STICKS,
  },
  arcade: {
    name: 'Arcade', blurb: 'Left stick tilts, right stick ↔ turns, the triggers are the throttle (RT up, LT down). LB hooks, RB pours. On the skycrane the triggers run the tank and lift moves to the right stick ↕.',
    axes: { pitch: 'ly', roll: 'lx', yaw: 'rx', collective: 'trig' },
    // LB hooks, so the bolted camera moves to a right-stick click (that stick only turns here).
    buttons: { ...COMMON, attach: [BTN.A, BTN.LB], pour: [BTN.RB], look: [], boltCam: [BTN.R3], mark: [], ...TANK },
  },
};
export const PRESET_ORDER = ['aim', 'aimSouthpaw', 'mode2', 'mode1', 'arcade'];
export const DEFAULT_PRESET = 'aim';

// ---------------------------------------------------------------- layout state
// { preset: id | 'custom', custom: { axes, buttons } | null, invert: { axis: bool } }
// Inverts belong to the player, not the layout: they survive switching presets.

const copyMap = (m) => ({ axes: { ...m.axes }, buttons: Object.fromEntries(Object.entries(m.buttons).map(([k, v]) => [k, v.slice()])) });

export function defaultLayout() {
  return { preset: DEFAULT_PRESET, custom: null, invert: { collective: false, yaw: false, pitch: false, roll: false } };
}

// The mapping in force: a preset's or the player's own.
export function mappingOf(layout) {
  const src = layout.preset === 'custom' && layout.custom ? layout.custom : (PRESETS[layout.preset] || PRESETS[DEFAULT_PRESET]);
  const m = copyMap(src);
  for (const a of FLIGHT_AXES) if (!AXIS_SOURCES.includes(m.axes[a])) m.axes[a] = 'none';
  for (const { id } of ACTIONS) if (!Array.isArray(m.buttons[id])) m.buttons[id] = [];
  return m;
}

// Loads a saved layout defensively (unknown fields dropped, bad values reset), migrating the old pad
// settings' two invert switches the first time.
export function normalizeLayout(saved, oldSettings = {}) {
  const L = defaultLayout();
  if (saved && typeof saved === 'object') {
    if (saved.preset === 'custom' || PRESETS[saved.preset]) L.preset = saved.preset;
    if (saved.custom && typeof saved.custom === 'object') {
      const c = { axes: {}, buttons: {} };
      for (const a of FLIGHT_AXES) c.axes[a] = AXIS_SOURCES.includes(saved.custom.axes?.[a]) ? saved.custom.axes[a] : 'none';
      for (const { id } of ACTIONS) {
        const v = saved.custom.buttons?.[id];
        c.buttons[id] = Array.isArray(v) ? [...new Set(v.filter((i) => Number.isInteger(i) && i >= 0 && i < 16))].slice(0, MAX_PER_ACTION) : [];
      }
      L.custom = c;
    }
    for (const a of FLIGHT_AXES) L.invert[a] = !!saved.invert?.[a];
  } else {
    L.invert.pitch = !!oldSettings.invertPitch;
    L.invert.collective = !!oldSettings.invertCollective;
  }
  if (L.preset === 'custom' && !L.custom) L.preset = DEFAULT_PRESET;
  return L;
}

export function choosePreset(layout, id) {
  if (id === 'custom' ? !layout.custom : !PRESETS[id]) return layout;
  return { ...layout, preset: id };
}

// Cycle through the presets (and the player's own layout, if they have one).
export function cyclePreset(layout, dir = 1) {
  const order = layout.custom ? [...PRESET_ORDER, 'custom'] : PRESET_ORDER;
  const i = Math.max(0, order.indexOf(layout.preset));
  return choosePreset(layout, order[(i + dir + order.length) % order.length]);
}

export function presetName(layout) {
  return layout.preset === 'custom' ? 'Custom' : (PRESETS[layout.preset]?.name || 'Custom');
}

// ---------------------------------------------------------------- contexts and conflicts
const overlaps = (c1, c2) => c1 === 'all' || c2 === 'all' || c1 === c2;

// Which actions are live in an aircraft context ('heli' or 'tank'), with tank shadowing.
export function activeButtons(m, ctx) {
  const out = {};
  const tankOwned = new Set();
  if (ctx === 'tank') for (const a of ACTIONS) if (a.ctx === 'tank') for (const b of m.buttons[a.id]) tankOwned.add(b);
  for (const a of ACTIONS) {
    if (a.ctx !== 'all' && a.ctx !== ctx) { out[a.id] = []; continue; }
    out[a.id] = a.ctx === 'all' && ctx === 'tank' ? m.buttons[a.id].filter((b) => !tankOwned.has(b)) : m.buttons[a.id].slice();
  }
  return out;
}

// Where each flight axis reads from in a context. Triggers claimed by actions in this context can't also
// be an axis: an axis on the triggers then falls back to a free stick axis (the skycrane's tank case).
export function activeAxes(m, ctx) {
  const btns = activeButtons(m, ctx);
  const trigTaken = Object.values(btns).some((l) => l.some((b) => TRIGGER_BUTTONS.includes(b)));
  const out = { ...m.axes };
  if (trigTaken) {
    for (const a of FLIGHT_AXES) {
      if (out[a] !== 'trig') continue;
      const used = new Set(Object.values(out));
      out[a] = STICK_SOURCES.find((s) => !used.has(s)) || 'none';
    }
  }
  return { axes: out, trigFree: !trigTaken && !Object.values(out).includes('trig') };
}

// Every clash in a mapping: two live things on one input in the same aircraft. Empty for a valid map.
export function conflicts(m) {
  const out = [];
  const seen = new Map();
  for (const a of FLIGHT_AXES) {
    const s = m.axes[a];
    if (s === 'none') continue;
    if (seen.has(s)) out.push({ kind: 'axis', source: s, a: seen.get(s), b: a });
    else seen.set(s, a);
  }
  for (let i = 0; i < ACTIONS.length; i++) {
    for (let j = i + 1; j < ACTIONS.length; j++) {
      const A = ACTIONS[i], B = ACTIONS[j];
      if (!overlaps(A.ctx, B.ctx)) continue;
      // An 'all' action and a tank action may share: the tank one shadows it on the skycrane.
      if ((A.ctx === 'all' && B.ctx === 'tank') || (A.ctx === 'tank' && B.ctx === 'all')) continue;
      for (const b of m.buttons[A.id]) if (m.buttons[B.id].includes(b)) out.push({ kind: 'button', button: b, a: A.id, b: B.id });
    }
  }
  // An axis on the triggers clashes with any 'all' or 'heli' action on a trigger (tank ones fall back).
  const trigAxis = FLIGHT_AXES.find((a) => m.axes[a] === 'trig');
  if (trigAxis) {
    for (const A of ACTIONS) {
      if (A.ctx === 'tank') continue;
      for (const b of m.buttons[A.id]) if (TRIGGER_BUTTONS.includes(b)) out.push({ kind: 'trigger', button: b, a: trigAxis, b: A.id });
    }
  }
  return out;
}

// ---------------------------------------------------------------- editing (always leaves a valid map)
// Each edit copies the mapping in force into the player's custom layout and resolves the clash it would
// cause, returning { layout, notes } where notes say in words what moved.

const nameOf = (b) => BUTTON_NAMES[b] || `Button ${b}`;
const shortLabel = (id) => (ACTION[id]?.label || AXIS_LABEL[id] || id).replace(/\s*\(.*$/, '').replace(/^Skycrane: /, 'Skycrane ');

function editable(layout) {
  return { m: mappingOf(layout), done: (m, notes) => ({ layout: { ...layout, preset: 'custom', custom: m }, notes }) };
}

export function setAxisSource(layout, axis, source) {
  if (!FLIGHT_AXES.includes(axis) || !AXIS_SOURCES.includes(source)) return { layout, notes: [] };
  const { m, done } = editable(layout);
  const notes = [];
  const prev = m.axes[axis];
  if (prev === source) return { layout, notes };
  // Swap with whichever axis had this source, so nothing is left unbound by surprise.
  if (source !== 'none') {
    for (const a of FLIGHT_AXES) {
      if (a !== axis && m.axes[a] === source) {
        m.axes[a] = prev;
        notes.push(`${shortLabel(a)} moved to ${SOURCE_LABEL[prev]}`);
      }
    }
  }
  m.axes[axis] = source;
  // Moving an axis onto the triggers frees them from any non-skycrane button action.
  if (source === 'trig') {
    for (const A of ACTIONS) {
      if (A.ctx === 'tank') continue;
      const before = m.buttons[A.id];
      const after = before.filter((b) => !TRIGGER_BUTTONS.includes(b));
      if (after.length !== before.length) { m.buttons[A.id] = after; notes.push(`${shortLabel(A.id)} unbound from ${before.filter((b) => TRIGGER_BUTTONS.includes(b)).map(nameOf).join(' / ')}`); }
    }
  }
  return done(m, notes);
}

// Adds a button to an action (or replaces slot `slot`). Anything clashing loses that button; if the
// clashing action had nothing else, it inherits the button this action gave up, so nothing goes dark.
export function bindButton(layout, actionId, button, slot = null) {
  const A = ACTION[actionId];
  if (!A || !Number.isInteger(button) || button < 0 || button > 15) return { layout, notes: [] };
  const { m, done } = editable(layout);
  const notes = [];
  const list = m.buttons[actionId];
  if (list.includes(button)) return { layout, notes };
  const replaced = slot !== null && slot < list.length ? list[slot] : null;
  if (replaced !== null) list[slot] = button;
  else if (list.length < MAX_PER_ACTION) list.push(button);
  else { notes.push(`${shortLabel(actionId)} already has ${MAX_PER_ACTION} buttons`); return { layout, notes }; }
  for (const B of ACTIONS) {
    if (B.id === actionId || !overlaps(A.ctx, B.ctx)) continue;
    if ((A.ctx === 'all' && B.ctx === 'tank') || (A.ctx === 'tank' && B.ctx === 'all')) continue;
    const bl = m.buttons[B.id];
    if (!bl.includes(button)) continue;
    m.buttons[B.id] = bl.filter((b) => b !== button);
    if (!m.buttons[B.id].length && replaced !== null && !TRIGGER_BUTTONS.includes(replaced)) {
      m.buttons[B.id] = [replaced];
      notes.push(`${shortLabel(B.id)} moved to ${nameOf(replaced)}`);
    } else notes.push(`${nameOf(button)} no longer does ${shortLabel(B.id)}`);
  }
  // A non-skycrane action on a trigger takes it back from an axis, which falls back to a free stick axis.
  if (A.ctx !== 'tank' && TRIGGER_BUTTONS.includes(button)) {
    for (const a of FLIGHT_AXES) {
      if (m.axes[a] !== 'trig') continue;
      const used = new Set(Object.values(m.axes));
      m.axes[a] = STICK_SOURCES.find((s) => !used.has(s)) || 'none';
      notes.push(`${shortLabel(a)} moved off the triggers to ${SOURCE_LABEL[m.axes[a]]}`);
    }
  }
  return done(m, notes);
}

export function unbindButton(layout, actionId, button) {
  if (!ACTION[actionId]) return { layout, notes: [] };
  const { m, done } = editable(layout);
  if (!m.buttons[actionId].includes(button)) return { layout, notes: [] };
  m.buttons[actionId] = m.buttons[actionId].filter((b) => b !== button);
  return done(m, []);
}

export function setInvert(layout, axis, on) {
  if (!FLIGHT_AXES.includes(axis)) return layout;
  return { ...layout, invert: { ...layout.invert, [axis]: !!on } };
}

// ---------------------------------------------------------------- per frame
// pad: { lx, ly, rx, ry, lt, rt } already shaped. Returns the four flight axes, before sensitivity.
export function routeAxes(pad, axes, invert) {
  const out = {};
  for (const a of FLIGHT_AXES) {
    const s = axes[a];
    let v = s === 'trig' ? (pad.rt || 0) - (pad.lt || 0) : s === 'none' ? 0 : (pad[s] || 0);
    if (invert && invert[a]) v = -v;
    out[a] = v;
  }
  return out;
}

// Human words for a layout, for the help sheet and the settings summary.
export function describe(layout, ctx = 'heli') {
  const m = mappingOf(layout);
  const { axes } = activeAxes(m, ctx);
  const btns = activeButtons(m, ctx);
  return {
    axes: FLIGHT_AXES.map((a) => ({ axis: a, label: AXIS_LABEL[a], source: axes[a], sourceLabel: SOURCE_LABEL[axes[a]], inverted: !!layout.invert[a] })),
    buttons: ACTIONS.filter((A) => btns[A.id].length).map((A) => ({ id: A.id, label: A.label, buttons: btns[A.id].map(nameOf) })),
  };
}

export function buttonName(b) { return nameOf(b); }
