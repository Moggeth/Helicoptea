// Flight sticks and HOTAS (a stick and a throttle, such as the Logitech / Saitek X56 Rhino): two or more USB
// devices the browser shows as separate, non-standard gamepads. This layer reads them together, apart from
// the gamepad layer (gamepad.js ignores any device that looks like a flight stick or is in this profile).
//
// Profile (saved): { axes: { roll, pitch, yaw, collective: { dev, index, sign } | null }, hat: { dev, index } | null,
//   buttons: { action: [{ dev, index }] }, lift: 'spring' | 'lever', deadZone, expo, cyclic, yaw }
// `dev` is a device's id string, or '@stick' / '@throttle' for the X56 guess (matched by name at run time).
//
// Lift: 'spring' (default) reads the throttle like the pad's lift stick, centre of its travel as centre stick, so
// it follows the Assist-off lift setting (sprung: middle settles gently). 'lever' makes the throttle the
// collective itself: where you leave it is the collective, with Assist off; with Assist on the middle of its
// travel holds height and either side climbs or sinks.
// No smoothing, no slew: what the stick says this frame is what the rotor gets. Heaviness is mass, not lag.

export const HOTAS_AXES = ['roll', 'pitch', 'yaw', 'collective'];
export const HOTAS_AXIS_LABEL = { roll: 'Tilt sideways (roll)', pitch: 'Tilt forward / back (pitch)', yaw: 'Turn (yaw)', collective: 'Lift (collective)' };
export const HOTAS_ACTIONS = [
  { id: 'attach', label: 'Hook / release' },
  { id: 'pour', label: 'Pour milk, or the skycrane\'s belly doors (hold)', held: true },
  { id: 'boltCam', label: 'Bolted-on GoPro (hold)', held: true },
  { id: 'look', label: 'Look around (hold: the hat looks instead of orbiting)', held: true },
  { id: 'camNext', label: 'Next camera' },
  { id: 'recenter', label: 'Recenter camera / look ahead' },
  { id: 'assist', label: 'Flight Assist on / off' },
  { id: 'restart', label: 'Restart flight' },
  { id: 'mark', label: 'Mark this moment for a flight note' },
  { id: 'pump', label: 'Skycrane: pump (hold)', held: true },
  { id: 'reelIn', label: 'Skycrane: reel the hose in (hold)', held: true },
  { id: 'reelOut', label: 'Skycrane: reel the hose out (hold)', held: true },
  { id: 'pause', label: 'Pause menu' },
];
const HELD = new Set(HOTAS_ACTIONS.filter((a) => a.held).map((a) => a.id));
const PRESS_EVENT = { attach: 'attach', camNext: 'camNext', recenter: 'recenter', assist: 'assist', restart: 'restart', mark: 'mark', pause: 'pause' };
export const MAX_HOTAS_BUTTONS = 3;
export const LIFT_MODES = ['spring', 'lever'];

// Device recognition. Names as Chrome and Edge report them on Windows, e.g.
// "Saitek Pro Flight X-56 Rhino Stick (Vendor: 0738 Product: 2221)"; Firefox uses "0738-2221-...".
const STICKY = /x-?56|rhino|hotas|throttle|joystick|flight ?stick|t\.?16000|t\.?flight|warthog|vkb|virpil|gladiator|extreme 3d|x-?52|fighterstick|cougar/i;
const STICK_VENDORS = /\b(0738|06a3|231d|3344)\b|^(0738|06a3|231d|3344)-/i;   // Mad Catz / Saitek (X52, X56), Saitek, VKB, Virpil
export function isFlightStick(id) { return !!id && (STICKY.test(id) || STICK_VENDORS.test(id)); }
const ROLE = { '@stick': /rhino stick|x-?56.*stick|stick.*x-?56|\b2221\b/i, '@throttle': /rhino throttle|x-?56.*throttle|throttle.*x-?56|\ba221\b/i };
export function roleOf(id) { return ROLE['@throttle'].test(id) ? 'throttle' : ROLE['@stick'].test(id) ? 'stick' : (/throttle/i.test(id) ? 'throttle' : 'stick'); }

// Chrome reports a generic HID device's axes by usage: X 0, Y 1, Z 2, Rx 3, Ry 4, Rz 5, slider 6, dial 7, and
// the hat switch on axis 9 as a value stepping from -1 (up) clockwise to 1, resting above 1.
// The X56 defaults below follow that and the X56's printed button order. They are a first guess, not measured
// on the device: the Teach steps set the real axes in a minute. Yaw is the stick's twist, never a button.
export const X56_GUESS = {
  axes: {
    roll: { dev: '@stick', index: 0, sign: 1 },
    pitch: { dev: '@stick', index: 1, sign: -1 },      // pushing forward reads -1: forward is nose down
    yaw: { dev: '@stick', index: 5, sign: 1 },         // twist (Rz)
    collective: { dev: '@throttle', index: 0, sign: -1 }, // left throttle; forward reads -1: forward is more lift
  },
  hat: { dev: '@stick', index: 9 },                    // POV hat: orbit the camera, or look around in the cockpit
  buttons: {
    attach: [{ dev: '@stick', index: 0 }],             // trigger
    pour: [{ dev: '@stick', index: 1 }],               // A
    boltCam: [{ dev: '@stick', index: 2 }],            // B
    look: [{ dev: '@stick', index: 5 }],               // pinkie
    camNext: [{ dev: '@stick', index: 4 }],            // D
    recenter: [{ dev: '@stick', index: 3 }],           // C (mini-stick press)
    assist: [{ dev: '@throttle', index: 0 }],          // E
    restart: [], mark: [{ dev: '@throttle', index: 1 }], pump: [], reelIn: [], reelOut: [], pause: [],
  },
};

export function defaultHotas() {
  return { axes: structuredClone(X56_GUESS.axes), hat: { ...X56_GUESS.hat }, buttons: structuredClone(X56_GUESS.buttons), lift: 'spring', deadZone: 0.03, expo: 0, cyclic: 1, yaw: 1, taught: false };
}

const isRef = (r) => r && typeof r.dev === 'string' && Number.isInteger(r.index) && r.index >= 0 && r.index < 64;
export function normalizeHotas(saved) {
  const P = defaultHotas();
  if (!saved || typeof saved !== 'object') return P;
  for (const a of HOTAS_AXES) {
    const r = saved.axes?.[a];
    if (r === null) P.axes[a] = null;
    else if (isRef(r)) P.axes[a] = { dev: r.dev, index: r.index, sign: r.sign < 0 ? -1 : 1 };
  }
  if (saved.hat === null) P.hat = null; else if (isRef(saved.hat)) P.hat = { dev: saved.hat.dev, index: saved.hat.index };
  for (const { id } of HOTAS_ACTIONS) {
    const v = saved.buttons?.[id];
    if (Array.isArray(v)) P.buttons[id] = v.filter(isRef).map((r) => ({ dev: r.dev, index: r.index })).slice(0, MAX_HOTAS_BUTTONS);
  }
  if (LIFT_MODES.includes(saved.lift)) P.lift = saved.lift;
  const num = (k, lo, hi) => { const v = Number(saved[k]); if (Number.isFinite(v) && v >= lo && v <= hi) P[k] = v; };
  num('deadZone', 0, 0.3); num('expo', 0, 0.9); num('cyclic', 0.3, 1.5); num('yaw', 0.3, 1.5);
  P.taught = !!saved.taught;
  return P;
}

const sameRef = (a, b) => a.dev === b.dev && a.index === b.index;
// Gives a button to an action; whatever else had it loses it (the HOTAS has buttons to spare).
export function bindHotasButton(P, id, ref, slot = null) {
  const Q = structuredClone(P);
  const list = Q.buttons[id];
  if (!list || list.some((r) => sameRef(r, ref))) return Q;
  for (const k of Object.keys(Q.buttons)) Q.buttons[k] = Q.buttons[k].filter((r) => !sameRef(r, ref));
  if (slot !== null && slot < list.length) Q.buttons[id][slot] = ref;
  else if (Q.buttons[id].length < MAX_HOTAS_BUTTONS) Q.buttons[id].push(ref);
  return Q;
}
export function unbindHotasButton(P, id, ref) {
  const Q = structuredClone(P);
  if (Q.buttons[id]) Q.buttons[id] = Q.buttons[id].filter((r) => !sameRef(r, ref));
  return Q;
}
// An axis taken by one flight axis is released from any other.
export function setHotasAxis(P, axis, ref) {
  const Q = structuredClone(P);
  for (const a of HOTAS_AXES) if (Q.axes[a] && ref && sameRef(Q.axes[a], ref)) Q.axes[a] = null;
  Q.axes[axis] = ref ? { dev: ref.dev, index: ref.index, sign: ref.sign < 0 ? -1 : 1 } : null;
  return Q;
}

function shapeAxis(v, dz, e) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = Math.min(1, (a - dz) / (1 - dz));
  return Math.sign(v) * ((1 - e) * n + e * n * n * n);
}
// The hat's eight directions as { x, y } (+right, +up), or null at rest.
export function hatDir(v) {
  if (!Number.isFinite(v) || v > 1.05 || v < -1.05) return null;
  const step = Math.round((v + 1) / (2 / 7));
  const ang = (step % 8) * Math.PI / 4;
  return { x: Math.round(Math.sin(ang)), y: Math.round(Math.cos(ang)) };
}

export const TEACH_STEPS = [
  { axis: 'roll', prompt: 'Push the <b>stick</b> all the way <b>right</b>, then let it go' },
  { axis: 'pitch', prompt: 'Push the <b>stick</b> all the way <b>forward</b>, then let it go' },
  { axis: 'yaw', prompt: 'Twist the <b>stick</b> (or press the pedal) all the way <b>right</b>' },
  { axis: 'collective', prompt: 'Put the <b>throttle</b> all the way back, then push it all the way <b>forward</b>' },
];

export class Hotas {
  constructor(getPads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [])) {
    this.getPads = getPads;
    this.profile = normalizeHotas(this.load());
    this.devSet = this.profileDevs();
    this.out = { pitch: 0, roll: 0, yaw: 0, collective: 0, lever: null };
    this.holds = {};
    this.events = [];
    this.notices = [];
    this.cam = null;
    this.prev = new Map();
    this.devices = [];
    this.seen = new Set();
    this.teach = null;
    this.capture = null;
    this.usedT = -1;
  }
  load() { try { const v = localStorage.getItem('helicoptea.hotas'); return v ? JSON.parse(v) : null; } catch { return null; } }
  save() { try { localStorage.setItem('helicoptea.hotas', JSON.stringify(this.profile)); } catch { /* ignore */ } }
  setProfile(P) { this.profile = normalizeHotas(P); this.devSet = this.profileDevs(); this.save(); }
  resetProfile() { this.setProfile(defaultHotas()); }

  // Which connected device a profile reference means.
  resolve(dev) {
    if (dev && dev[0] === '@') {
      const role = dev.slice(1);
      return this.devices.find((g) => roleOf(g.id) === role) || null;
    }
    return this.devices.find((g) => g.id === dev) || null;
  }
  owns(gp) { return isFlightStick(gp.id) || this.devSet.has(gp.id); }
  profileDevs() {
    const s = new Set();
    const P = this.profile;
    for (const r of [...Object.values(P.axes), P.hat, ...Object.values(P.buttons).flat()]) if (r && r.dev[0] !== '@') s.add(r.dev);
    return s;
  }
  get connected() { return this.devices.length > 0; }
  devName(dev) {
    const g = this.resolve(dev);
    const id = g ? g.id : dev;
    if (id === '@stick') return 'Stick';
    if (id === '@throttle') return 'Throttle';
    return (id || '').replace(/\s*\((?:Vendor|STANDARD)[^)]*\)/gi, '').replace(/^Saitek Pro Flight /, '').trim() || 'Device';
  }
  refName(r) { return r ? `${this.devName(r.dev)} ${r.index + 1}` : 'unbound'; }

  poll(dt, menuMode) {
    const pads = this.getPads().filter(Boolean);
    this.devices = pads.filter((g) => this.owns(g));
    for (const g of this.devices) {
      if (!this.seen.has(g.id)) {
        this.seen.add(g.id);
        this.notices.push(`${this.devName(g.id)} found${this.profile.taught ? '' : ': fly with it now, or set it up in Controls → Flight stick'}`);
      }
    }
    const P = this.profile, o = this.out;
    o.pitch = o.roll = o.yaw = o.collective = 0; o.lever = null;
    this.cam = null;
    if (!this.devices.length) { this.holds = {}; return false; }
    const axisOf = (r) => { if (!r) return null; const g = this.resolve(r.dev); const v = g ? g.axes[r.index] : undefined; return Number.isFinite(v) ? v * r.sign : null; };
    const btnOf = (r) => { const g = this.resolve(r.dev); const b = g && g.buttons[r.index]; return !!b && (typeof b === 'number' ? b > 0.5 : b.pressed || b.value > 0.5); };

    if (this.teach) { this.stepTeach(dt); return true; }
    if (this.capture) { this.stepCapture(); return true; }

    let used = false;
    const prevHolds = this.holds;
    this.holds = {};
    for (const A of HOTAS_ACTIONS) {
      const on = P.buttons[A.id].some(btnOf);
      if (HELD.has(A.id)) this.holds[A.id] = on && !menuMode;
      if (on && !prevHolds[`_${A.id}`] && PRESS_EVENT[A.id]) { this.events.push(PRESS_EVENT[A.id]); used = true; }
      this.holds[`_${A.id}`] = on;
    }
    const hat = P.hat ? (() => { const g = this.resolve(P.hat.dev); return g ? hatDir(g.axes[P.hat.index]) : null; })() : null;
    if (hat && !menuMode) { this.cam = { yaw: hat.x, zoom: -hat.y, look: !!this.holds.look }; used = true; }
    if (menuMode) return used;

    const sh = (v) => (v === null ? 0 : shapeAxis(v, P.deadZone, P.expo));
    const clamp = (x) => Math.max(-1, Math.min(1, x));
    o.roll = clamp(sh(axisOf(P.axes.roll)) * P.cyclic);
    o.pitch = clamp(sh(axisOf(P.axes.pitch)) * P.cyclic);
    o.yaw = clamp(sh(axisOf(P.axes.yaw)) * P.yaw);
    const c = axisOf(P.axes.collective);
    if (c !== null) {
      if (P.lift === 'lever') {
        o.lever = Math.max(0, Math.min(1, (c + 1) / 2));
        // Assist on: the middle of the travel holds height, a band either side so it can be found by feel.
        const d = o.lever - 0.5, band = 0.06;
        o.collective = Math.abs(d) <= band ? 0 : clamp((d - Math.sign(d) * band) / (0.5 - band));
      } else o.collective = clamp(c);
    }
    // Moving off centre counts as using it (so the HUD shows its prompts); a resting lever does not.
    const lv = this.lastLever;
    this.lastLever = c;
    if (Math.abs(o.roll) + Math.abs(o.pitch) + Math.abs(o.yaw) > 0.15 || (c !== null && lv !== undefined && lv !== null && Math.abs(c - lv) > 0.02)) used = true;
    return used;
  }
  isHeld(id) { return !!this.holds[id]; }
  takeEvents() { const e = this.events; this.events = []; return e; }
  takeNotices() { const n = this.notices; this.notices = []; return n; }

  // ---------------------------------------------------------------- teach: move each control once
  snapshot() { return new Map(this.devices.map((g) => [g.id, g.axes.slice()])); }
  startTeach(onStep, only = null) {
    if (!this.devices.length) return false;
    const steps = only ? TEACH_STEPS.filter((s) => s.axis === only) : TEACH_STEPS;
    this.teach = { steps, i: 0, onStep, settled: false, last: null, still: 0, result: structuredClone(this.profile) };
    onStep({ step: 1, total: steps.length, prompt: steps[0].prompt });
    return true;
  }
  skipTeach() {
    const T = this.teach;
    if (!T) return;
    this.nextTeach();
  }
  cancelTeach() { const T = this.teach; this.teach = null; if (T) T.onStep(null); }
  nextTeach() {
    const T = this.teach;
    T.i++;
    T.settled = false; T.last = null; T.still = 0;
    if (T.i >= T.steps.length) {
      this.teach = null;
      T.result.taught = true;
      this.setProfile(T.result);
      T.onStep({ done: true });
      return;
    }
    T.onStep({ step: T.i + 1, total: T.steps.length, prompt: T.steps[T.i].prompt });
  }
  // Each step waits for every control to sit still (so the last one springing back is not taken), then
  // watches each axis's travel. Sticks: the first axis pushed well off where it sat, in that direction.
  // Throttle: the axis with the longest travel, once it is held at one end; that end is forward.
  stepTeach(dt) {
    const T = this.teach;
    const now = this.snapshot();
    if (!T.settled) {
      let moving = false;
      for (const [id, ax] of now) { const p = T.last?.get(id); if (p) ax.forEach((v, i) => { if (i !== 9 && Math.abs(v - p[i]) > 0.01) moving = true; }); }
      T.last = now;
      // A stick just taught must be let go first, or its spring back would teach the next step.
      const w = T.waitBack, back = !w || Math.abs((now.get(w.dev) || [])[w.index] - w.to) < 0.15;
      T.still = moving || !back ? 0 : (T.still || 0) + dt;
      if (T.still < 0.25) return;
      T.settled = true; T.base = now; T.range = new Map(); T.hold = 0;
      return;
    }
    const step = T.steps[T.i];
    let best = null;
    for (const [id, ax] of now) {
      const base = T.base.get(id) || ax;
      if (!T.range.has(id)) T.range.set(id, ax.map((v) => [v, v]));
      const R = T.range.get(id);
      ax.forEach((v, i) => {
        if (i === 9 || !Number.isFinite(v) || !Number.isFinite(base[i])) return;
        R[i][0] = Math.min(R[i][0], v); R[i][1] = Math.max(R[i][1], v);
        const score = step.axis === 'collective' ? R[i][1] - R[i][0] : Math.abs(v - base[i]);
        if (!best || score > best.score) best = { dev: id, index: i, score, v, lo: R[i][0], hi: R[i][1], d: v - base[i] };
      });
    }
    if (!best) return;
    let sign;
    if (step.axis === 'collective') {
      const atHi = best.hi - best.v < 0.12, atLo = best.v - best.lo < 0.12;
      if (best.score < 1.2 || (!atHi && !atLo)) { T.hold = 0; return; }
      T.hold += dt;
      if (T.hold < 0.3) return;
      sign = atHi ? 1 : -1;
    } else {
      if (best.score < 0.6) return;
      sign = Math.sign(best.d);
    }
    T.waitBack = step.axis === 'collective' ? null : { dev: best.dev, index: best.index, to: best.v - best.d };
    T.result = setHotasAxis(T.result, step.axis, { dev: best.dev, index: best.index, sign });
    this.nextTeach();
  }

  // ---------------------------------------------------------------- remapping a button
  startCapture(done) {
    if (!this.devices.length) return false;
    this.capture = { done, base: new Map(this.devices.map((g) => [g.id, g.buttons.map((b) => (typeof b === 'number' ? b > 0.5 : b.pressed))])), t: performance.now() };
    return true;
  }
  cancelCapture() { const c = this.capture; this.capture = null; if (c) c.done(null); }
  stepCapture() {
    const c = this.capture;
    if (performance.now() - c.t > 8000) { this.cancelCapture(); return; }
    for (const g of this.devices) {
      const base = c.base.get(g.id) || [];
      for (let i = 0; i < g.buttons.length; i++) {
        const b = g.buttons[i];
        const on = typeof b === 'number' ? b > 0.5 : b.pressed;
        if (on && !base[i]) { this.capture = null; c.done({ dev: g.id, index: i }); return; }
        if (!on) base[i] = false;
      }
    }
  }
  bind(id, ref, slot) { this.setProfile(bindHotasButton(this.profile, id, ref, slot)); }
  unbind(id, ref) { this.setProfile(unbindHotasButton(this.profile, id, ref)); }
  flip(axis) {
    const r = this.profile.axes[axis];
    if (r) this.setProfile({ ...this.profile, axes: { ...this.profile.axes, [axis]: { ...r, sign: -r.sign } } });
  }
}
