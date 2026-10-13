// Gamepad layer: any controller the browser exposes, standard or not.
// - Standard-mapping pads (Xbox, PlayStation, Switch Pro, Steam Controller via Steam Input) work with no setup.
// - Non-standard pads get a per-controller binding saved in localStorage (built with the in-game wizard).
// - Settings: dead zone, response curve, per-axis sensitivity, inversion, rumble.
// - The most recently used pad is active; several can be connected at once.

const LS = 'helicoptea.pad.';
const load = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* ignore */ } };

export const PAD_DEFAULTS = {
  deadZone: 0.12, expo: 0.45, cyclic: 1.0, collective: 1.0, yaw: 1.0,
  invertPitch: false, invertCollective: false, triggers: true, rumble: true,
};

// Logical axis -> source. 'axis': index + sign. 'pair': two buttons (pos/neg), analog values.
export const STANDARD_BINDING = {
  axes: {
    collective: { type: 'axis', index: 1, sign: -1 },
    yaw: { type: 'axis', index: 0, sign: 1 },
    pitch: { type: 'axis', index: 3, sign: -1 },
    roll: { type: 'axis', index: 2, sign: 1 },
  },
  triggers: { up: 7, down: 6 },
  buttons: { attach: [0], recenter: [1, 11], help: [2], assist: [3], pause: [8], restart: [9], camLeft: [14], camRight: [15], zoomIn: [12], zoomOut: [13], up: [12], down: [13], left: [14], right: [15], confirm: [0], back: [1] },
};

// Wizard steps: axes first (move), then buttons (press).
export const BIND_STEPS = [
  { key: 'collective', kind: 'axis', prompt: 'Push the stick you want for <b>LIFT</b> all the way <b>up</b>' },
  { key: 'yaw', kind: 'axis', prompt: 'Push the stick you want for <b>TURN</b> all the way <b>right</b>' },
  { key: 'pitch', kind: 'axis', prompt: 'Push the stick you want for <b>TILT</b> all the way <b>forward</b>' },
  { key: 'roll', kind: 'axis', prompt: 'Push the <b>TILT</b> stick all the way <b>right</b>' },
  { key: 'attach', kind: 'button', prompt: 'Press the button for <b>Hook / release</b>' },
  { key: 'assist', kind: 'button', prompt: 'Press the button for <b>Flight Assist</b>' },
  { key: 'restart', kind: 'button', prompt: 'Press the button for <b>Restart flight</b>' },
  { key: 'pause', kind: 'button', prompt: 'Press the button for <b>Pause / menu</b>' },
  { key: 'back', kind: 'button', prompt: 'Press the button for <b>Back</b> (also recenters the camera)' },
];

function curve(v, s) {
  const dz = s.deadZone, e = s.expo;
  const a = Math.abs(v);
  if (a < dz) return 0;
  const n = Math.min(1, (a - dz) / (1 - dz));
  return Math.sign(v) * ((1 - e) * n + e * n * n * n);
}
function radial(x, y, s) {
  const m = Math.hypot(x, y);
  if (m < s.deadZone) return [0, 0];
  const n = Math.min(1, (m - s.deadZone) / (1 - s.deadZone));
  const k = ((1 - s.expo) * n + s.expo * n * n * n) / m;
  return [x * k, y * k];
}

export class Gamepads {
  constructor() {
    this.settings = { ...PAD_DEFAULTS, ...load('settings', {}) };
    this.activeIndex = null;
    this.prev = new Map();     // index -> { buttons: bool[] }
    this.rest = new Map();     // index -> resting axes (non-standard pads may rest away from 0)
    this.out = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.events = [];          // logical button presses: 'attach', 'confirm', ...
    this.notices = [];
    this.wizard = null;
    this.raw = null;           // last raw snapshot of the active pad (for the test view)
    this.navRepeat = { dir: null, t: 0 };
    window.addEventListener('gamepadconnected', (e) => {
      const gp = e.gamepad;
      this.rest.set(gp.index, gp.axes.slice());
      this.notices.push({ type: 'connected', text: `${prettyName(gp.id)} connected${gp.mapping === 'standard' || this.hasBinding(gp) ? '' : ': set it up in Controller settings'}` });
      if (this.activeIndex === null) this.activeIndex = gp.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.prev.delete(e.gamepad.index);
      if (e.gamepad.index === this.activeIndex) {
        this.activeIndex = null;
        this.zero();
        this.notices.push({ type: 'disconnected', text: `${prettyName(e.gamepad.id)} disconnected: controls released` });
      }
    });
  }

  zero() { this.out.pitch = this.out.roll = this.out.yaw = this.out.collective = 0; }
  list() { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean); }
  active() { const l = navigator.getGamepads ? navigator.getGamepads() : []; return this.activeIndex !== null ? l[this.activeIndex] : null; }
  hasBinding(gp) { return !!load(`bind.${gp.id}`, null); }
  bindingFor(gp) { return load(`bind.${gp.id}`, null) || (gp.mapping === 'standard' ? STANDARD_BINDING : guessBinding(gp)); }
  isCustom(gp) { return this.hasBinding(gp); }
  saveSettings() { save('settings', this.settings); }
  resetBinding(gp) { try { localStorage.removeItem(`${LS}bind.${gp.id}`); } catch { /* ignore */ } }

  // Returns true if the pad produced meaningful input this frame.
  poll(dt, menuMode) {
    const pads = this.list();
    // Pick the most recently active pad.
    for (const gp of pads) {
      if (!this.rest.has(gp.index)) this.rest.set(gp.index, gp.axes.slice());
      if (gp.index !== this.activeIndex && this.activity(gp) > 0.5) {
        this.activeIndex = gp.index;
        this.notices.push({ type: 'switched', text: `Using ${prettyName(gp.id)}` });
      }
    }
    const gp = this.active() || pads[0] || null;
    if (!gp) { this.zero(); this.raw = null; return false; }
    this.activeIndex = gp.index;
    this.raw = { id: gp.id, mapping: gp.mapping, axes: gp.axes.slice(), buttons: gp.buttons.map((b) => +b.value.toFixed(2)), index: gp.index };
    if (this.wizard) { this.stepWizard(gp); this.zero(); this.storePrev(gp); return true; }

    const B = this.bindingFor(gp);
    const S = this.settings;
    const rest = this.rest.get(gp.index) || [];
    const axis = (src) => {
      if (!src) return 0;
      if (src.type === 'axis') return ((gp.axes[src.index] ?? 0) - (B.custom ? (rest[src.index] || 0) : 0)) * src.sign;
      if (src.type === 'pair') return val(gp, src.pos) - val(gp, src.neg);
      return 0;
    };
    const a = B.axes;
    let [yaw, coll] = radial(axis(a.yaw), axis(a.collective), S);
    let [roll, pitch] = radial(axis(a.roll), axis(a.pitch), S);
    if (S.triggers && B.triggers) {
      const t = curve(val(gp, B.triggers.up) - val(gp, B.triggers.down), { deadZone: 0.06, expo: S.expo });
      if (Math.abs(t) > Math.abs(coll)) coll = t;
    }
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    this.out.collective = clamp(coll * S.collective * (S.invertCollective ? -1 : 1));
    this.out.yaw = clamp(yaw * S.yaw);
    this.out.pitch = clamp(pitch * S.cyclic * (S.invertPitch ? -1 : 1));
    this.out.roll = clamp(roll * S.cyclic);
    if (menuMode) this.zero();

    // Edge-triggered logical buttons.
    const prev = this.prev.get(gp.index)?.buttons || [];
    const pressed = (i) => !!gp.buttons[i]?.pressed && !prev[i];
    const any = (list) => (list || []).some(pressed);
    const btn = B.buttons;
    if (menuMode) {
      if (any(btn.confirm)) this.events.push('confirm');
      if (any(btn.back)) this.events.push('back');
      if (any(btn.pause)) this.events.push('pause');
      if (any(btn.restart)) this.events.push('restart');
      // Menu navigation from the d-pad or the left stick, with auto-repeat.
      let dir = null;
      if (gp.buttons[btn.up?.[0]]?.pressed || axis(a.collective) > 0.6) dir = 'up';
      else if (gp.buttons[btn.down?.[0]]?.pressed || axis(a.collective) < -0.6) dir = 'down';
      else if (gp.buttons[btn.left?.[0]]?.pressed || axis(a.yaw) < -0.6) dir = 'left';
      else if (gp.buttons[btn.right?.[0]]?.pressed || axis(a.yaw) > 0.6) dir = 'right';
      if (dir !== this.navRepeat.dir) { this.navRepeat = { dir, t: 0.4 }; if (dir) this.events.push(`nav-${dir}`); }
      else if (dir) { this.navRepeat.t -= dt; if (this.navRepeat.t <= 0) { this.navRepeat.t = 0.12; this.events.push(`nav-${dir}`); } }
    } else {
      this.navRepeat.dir = null;
      for (const name of ['attach', 'assist', 'restart', 'pause', 'help', 'recenter']) if (any(btn[name])) this.events.push(name);
      if (B.custom && any(btn.back)) this.events.push('recenter');
    }
    this.cam = {
      yaw: (gp.buttons[btn.camLeft?.[0]]?.pressed ? 1 : 0) - (gp.buttons[btn.camRight?.[0]]?.pressed ? 1 : 0),
      zoom: (gp.buttons[btn.zoomOut?.[0]]?.pressed ? 1 : 0) - (gp.buttons[btn.zoomIn?.[0]]?.pressed ? 1 : 0),
    };
    if (menuMode) this.cam.yaw = this.cam.zoom = 0;
    const used = Math.abs(this.out.pitch) + Math.abs(this.out.roll) + Math.abs(this.out.yaw) + Math.abs(this.out.collective) > 0.05 || gp.buttons.some((b, i) => b.pressed && !prev[i]);
    this.storePrev(gp);
    return used;
  }

  storePrev(gp) { this.prev.set(gp.index, { buttons: gp.buttons.map((b) => b.pressed) }); }

  activity(gp) {
    const rest = this.rest.get(gp.index) || [];
    let m = 0;
    gp.axes.forEach((v, i) => { m = Math.max(m, Math.abs(v - (rest[i] || 0))); });
    gp.buttons.forEach((b) => { if (b.pressed) m = Math.max(m, 1); });
    return m;
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
  takeNotices() { const n = this.notices; this.notices = []; return n; }

  rumble(strong, weak, ms) {
    if (!this.settings.rumble) return;
    const gp = this.active();
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
  }
  canRumble() { const gp = this.active(); return !!(gp && gp.vibrationActuator); }

  // ---------------------------------------------------------------- binding wizard
  startWizard(onUpdate) {
    const gp = this.active() || this.list()[0];
    if (!gp) return false;
    this.wizard = { index: gp.index, id: gp.id, step: 0, waitRelease: true, binding: { custom: true, axes: {}, buttons: {}, triggers: null }, onUpdate };
    this.rest.set(gp.index, gp.axes.slice());
    onUpdate(this.wizardView());
    return true;
  }
  cancelWizard() { this.wizard = null; }
  skipWizardStep() { if (!this.wizard) return; this.wizard.step++; this.wizard.waitRelease = true; this.finishIfDone(); this.wizard?.onUpdate(this.wizardView()); }
  wizardView() {
    const w = this.wizard;
    if (!w) return null;
    const s = BIND_STEPS[w.step];
    return { step: w.step + 1, total: BIND_STEPS.length, prompt: s ? s.prompt : '', id: w.id };
  }
  stepWizard(gp) {
    const w = this.wizard;
    if (gp.index !== w.index) return;
    const rest = this.rest.get(gp.index) || [];
    const dev = gp.axes.map((v, i) => v - (rest[i] || 0));
    const anyBtn = gp.buttons.findIndex((b) => b.pressed);
    const moved = dev.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (w.waitRelease) { if (anyBtn < 0 && moved < 0.25) w.waitRelease = false; return; }
    const step = BIND_STEPS[w.step];
    if (step.kind === 'axis') {
      let best = -1, bv = 0;
      dev.forEach((v, i) => { if (Math.abs(v) > Math.abs(bv)) { bv = v; best = i; } });
      if (Math.abs(bv) > 0.6) w.binding.axes[step.key] = { type: 'axis', index: best, sign: Math.sign(bv) };
      else if (anyBtn >= 0) return; // ignore buttons on stick steps
      else return;
    } else {
      if (anyBtn < 0) return;
      w.binding.buttons[step.key] = [anyBtn];
      if (step.key === 'attach') w.binding.buttons.confirm = [anyBtn];
    }
    w.step++;
    w.waitRelease = true;
    this.finishIfDone();
    this.wizard?.onUpdate(this.wizardView());
  }
  finishIfDone() {
    const w = this.wizard;
    if (w.step < BIND_STEPS.length) return;
    const base = STANDARD_BINDING;
    const b = w.binding;
    for (const k of Object.keys(base.axes)) if (!b.axes[k]) b.axes[k] = base.axes[k];
    for (const k of Object.keys(base.buttons)) if (!b.buttons[k]) b.buttons[k] = base.buttons[k];
    save(`bind.${w.id}`, b);
    const done = w.onUpdate;
    this.wizard = null;
    done({ done: true, id: w.id });
  }
}

function val(gp, i) { const b = gp.buttons[i]; return b ? b.value : 0; }

// Best guess for a non-standard pad before the player binds it: the common HID layout.
function guessBinding(gp) {
  const b = JSON.parse(JSON.stringify(STANDARD_BINDING));
  b.custom = true;
  if (gp.axes.length >= 4) b.axes.pitch = { type: 'axis', index: gp.axes.length >= 6 ? 5 : 3, sign: -1 };
  if (gp.axes.length >= 6) b.axes.roll = { type: 'axis', index: 2, sign: 1 };
  b.triggers = null;
  return b;
}

export function prettyName(id) {
  if (!id) return 'Controller';
  if (/28de/i.test(id) || /steam/i.test(id)) return 'Steam Controller';
  if (/xbox|xinput|045e/i.test(id)) return 'Xbox-compatible controller';
  if (/054c|dualsense|dualshock|wireless controller/i.test(id)) return 'PlayStation controller';
  if (/057e|pro controller/i.test(id)) return 'Switch Pro controller';
  return id.replace(/\s*\(.*\)\s*$/, '').slice(0, 40) || 'Controller';
}
