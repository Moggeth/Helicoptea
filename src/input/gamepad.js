// Gamepad layer: any controller the browser exposes, standard or not.
// - Every pad is first read as a standard "virtual pad" (sticks lx ly rx ry, +right / +up, and the 16
//   standard buttons). Standard-mapping pads (Xbox, PlayStation, Switch Pro, Steam Controller via Steam
//   Input) need no setup; other pads get a per-controller binding saved in localStorage (the wizard).
// - Shaping (dead zone, response curve, sensitivity) works on the physical sticks.
// - The layout (layouts.js: presets, remapping, per-axis invert) then decides what each stick and button
//   flies. Menus always use the standard buttons, so no layout can lock you out of the settings.
// - The most recently used pad is active; several can be connected at once.
import {
  ACTIONS, BTN, TRIGGER_BUTTONS, STICK_SOURCES, mappingOf, normalizeLayout, activeAxes, activeButtons, routeAxes,
  choosePreset, cyclePreset, setAxisSource, bindButton, unbindButton, setInvert, presetName,
} from './layouts.js';

const LS = 'helicoptea.pad.';
const load = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* ignore */ } };

export const PAD_DEFAULTS = {
  deadZone: 0.12, expo: 0.45, cyclic: 1.0, collective: 1.0, yaw: 1.0, triggers: true, rumble: true,
};

// Physical -> virtual for a standard-mapping pad. sticks: index + sign so that +right / +up.
export const STANDARD_BINDING = {
  sticks: { lx: { index: 0, sign: 1 }, ly: { index: 1, sign: -1 }, rx: { index: 2, sign: 1 }, ry: { index: 3, sign: -1 } },
  pad: Array.from({ length: 16 }, (_, i) => i),
};

// Wizard steps for a non-standard pad: each stick direction, then each standard button.
export const BIND_STEPS = [
  { key: 'lx', kind: 'axis', prompt: 'Push the <b>left stick</b> all the way <b>right</b>' },
  { key: 'ly', kind: 'axis', prompt: 'Push the <b>left stick</b> all the way <b>up</b>' },
  { key: 'rx', kind: 'axis', prompt: 'Push the <b>right stick</b> all the way <b>right</b>' },
  { key: 'ry', kind: 'axis', prompt: 'Push the <b>right stick</b> all the way <b>up</b>' },
  ...[['A', 'the bottom face button (<b>A</b> / ✕)'], ['B', 'the right face button (<b>B</b> / ◯)'], ['X', 'the left face button (<b>X</b> / ▢)'], ['Y', 'the top face button (<b>Y</b> / △)'],
    ['LB', 'the <b>left bumper</b>'], ['RB', 'the <b>right bumper</b>'], ['LT', 'the <b>left trigger</b>'], ['RT', 'the <b>right trigger</b>'],
    ['BACK', '<b>Back / View / Select</b>'], ['START', '<b>Start / Menu</b>'], ['L3', 'the <b>left stick</b> in (click)'], ['R3', 'the <b>right stick</b> in (click)'],
    ['UP', '<b>D-pad up</b>'], ['DOWN', '<b>D-pad down</b>'], ['LEFT', '<b>D-pad left</b>'], ['RIGHT', '<b>D-pad right</b>']]
    .map(([k, what]) => ({ key: k, button: BTN[k], kind: 'button', prompt: `Press ${what}` })),
];

// Hold-type actions: read every frame, never sent as presses.
const HELD = new Set(['view', 'look', 'pour', 'doors', 'pump', 'reelIn', 'reelOut', 'camLeft', 'camRight', 'zoomIn', 'zoomOut', 'boltCam']);

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

// An old (pre-layout) custom binding was keyed by flight action; read it as a virtual pad.
export function migrateBinding(b) {
  if (!b || b.v === 2) return b;
  const ax = b.axes || {};
  const pick = (s, d) => (s && s.type === 'axis' ? { index: s.index, sign: s.sign } : d);
  const S = STANDARD_BINDING.sticks;
  const sticks = { lx: pick(ax.yaw, S.lx), ly: pick(ax.collective, S.ly), rx: pick(ax.roll, S.rx), ry: pick(ax.pitch, S.ry) };
  const bt = b.buttons || {};
  const first = (k, d) => (Array.isArray(bt[k]) && Number.isInteger(bt[k][0]) ? bt[k][0] : d);
  const pad = [first('attach', 0), first('back', first('recenter', 1)), first('help', 2), first('assist', 3), first('reelIn', 4), first('reelOut', first('pour', 5)),
    first('pump', 6), first('doors', 7), first('pause', 8), first('restart', 9), first('view', 10), first('mark', 11),
    first('up', 12), first('down', 13), first('left', 14), first('right', 15)];
  return { custom: true, v: 2, sticks, pad };
}

export class Gamepads {
  constructor() {
    this.settings = { ...PAD_DEFAULTS, ...load('settings', {}) };
    this.layout = normalizeLayout(load('layout', null), this.settings);
    this.layoutChanged();
    this.activeIndex = null;
    this.prev = new Map();     // index -> { on: bool[] } (virtual buttons)
    this.rest = new Map();     // index -> resting axes (non-standard pads may rest away from 0)
    this.out = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.sticks = { lx: 0, ly: 0, rx: 0, ry: 0 };   // shaped virtual sticks (for the test view)
    this.holds = {};
    this.events = [];          // logical button presses: 'attach', 'confirm', ...
    this.notices = [];
    this.wizard = null;
    this.capture = null;       // remapping: waiting for a button press or a stick push
    this.raw = null;           // last raw snapshot of the active pad (for the test view and the recorder)
    this.navRepeat = { dir: null, t: 0 };
    this.triggerMode = 'collective';
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', (e) => {
      const gp = e.gamepad;
      if (this.exclude && this.exclude(gp)) return;   // a flight stick: hotas.js reads it
      this.rest.set(gp.index, gp.axes.slice());
      this.notices.push({ type: 'connected', text: `${prettyName(gp.id)} connected${gp.mapping === 'standard' || this.hasBinding(gp) ? '' : ': set it up in Controller settings'}` });
      if (this.activeIndex === null) this.activeIndex = gp.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.prev.delete(e.gamepad.index);
      if (e.gamepad.index === this.activeIndex) {
        this.stopRumble();
        this.activeIndex = null;
        this.zero();
        this.notices.push({ type: 'disconnected', text: `${prettyName(e.gamepad.id)} disconnected: controls released` });
      }
    });
  }

  zero() {
    this.out.pitch = this.out.roll = this.out.yaw = this.out.collective = 0;
    this.pour = false; this.doors = 0; this.pump = 0; this.reel = 0; this.look = null; this.viewHeldT = 0; this.viewLooked = false;
    this.holds = {};
  }
  list() { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((g) => g && !(this.exclude && this.exclude(g))); }
  active() { const l = navigator.getGamepads ? navigator.getGamepads() : []; return this.activeIndex !== null ? l[this.activeIndex] : null; }
  hasBinding(gp) { return !!load(`bind.${gp.id}`, null); }
  bindingFor(gp) {
    const saved = load(`bind.${gp.id}`, null);
    if (saved) return migrateBinding(saved);
    return gp.mapping === 'standard' ? STANDARD_BINDING : guessBinding(gp);
  }
  isCustom(gp) { return this.hasBinding(gp); }
  saveSettings() { if (!this.settings.rumble) this.stopRumble(); save('settings', this.settings); }
  resetBinding(gp) { try { localStorage.removeItem(`${LS}bind.${gp.id}`); } catch { /* ignore */ } }
  isHeld(id) { return !!this.holds[id]; }

  // ---------------------------------------------------------------- layout (presets and remapping)
  layoutChanged() {
    this.mapping = mappingOf(this.layout);
    this.ctxCache = {};
  }
  live(ctx) {
    if (!this.ctxCache[ctx]) this.ctxCache[ctx] = { ...activeAxes(this.mapping, ctx), buttons: activeButtons(this.mapping, ctx) };
    return this.ctxCache[ctx];
  }
  setLayout(layout) { this.layout = layout; save('layout', layout); this.layoutChanged(); }
  edit(fn) { const r = fn(this.layout); this.setLayout(r.layout || r); return r.notes || []; }
  choosePreset(id) { this.setLayout(choosePreset(this.layout, id)); }
  cyclePreset(dir) { this.setLayout(cyclePreset(this.layout, dir)); return presetName(this.layout); }
  setAxis(axis, source) { return this.edit((L) => setAxisSource(L, axis, source)); }
  bind(action, button, slot) { return this.edit((L) => bindButton(L, action, button, slot)); }
  unbind(action, button) { return this.edit((L) => unbindButton(L, action, button)); }
  setInvert(axis, on) { this.setLayout(setInvert(this.layout, axis, on)); }

  // Remapping: the next button press (kind 'button') or full stick push (kind 'axis') goes to done().
  startCapture(kind, done) {
    const gp = this.active() || this.list()[0];
    if (!gp) return false;
    this.capture = { kind, done, waitRelease: true, t: 8 };
    return true;
  }
  cancelCapture() { const c = this.capture; this.capture = null; if (c) c.done(null); }
  stepCapture(v, dt) {
    const c = this.capture;
    c.t -= dt;
    if (c.t <= 0) { this.cancelCapture(); return; }
    const anyOn = v.on.findIndex(Boolean);
    const stick = STICK_SOURCES.map((s) => [s, v[s]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    if (c.waitRelease) { if (anyOn < 0 && Math.abs(stick[1]) < 0.3) c.waitRelease = false; return; }
    if (c.kind === 'button' && anyOn >= 0) { this.capture = null; c.done({ button: anyOn }); }
    else if (c.kind === 'axis') {
      if (Math.abs(stick[1]) > 0.7) { this.capture = null; c.done({ source: stick[0], negative: stick[1] < 0 }); }
      else if (v.on[BTN.LT] || v.on[BTN.RT]) { this.capture = null; c.done({ source: 'trig' }); }
    }
  }

  // ---------------------------------------------------------------- reading a pad
  // The virtual pad: sticks (unshaped, +right / +up), triggers 0..1, per-button value and on-state.
  readVirtual(gp, P) {
    const rest = this.rest.get(gp.index) || [];
    const stick = (s) => (s ? ((gp.axes[s.index] ?? 0) - (P.custom ? (rest[s.index] || 0) : 0)) * s.sign : 0);
    const value = new Array(16), on = new Array(16);
    for (let i = 0; i < 16; i++) {
      const b = gp.buttons[P.pad[i]];
      value[i] = b ? (typeof b === 'number' ? b : b.value) : 0;
      // Triggers count as pressed past half-way; other buttons trust the browser.
      on[i] = TRIGGER_BUTTONS.includes(i) ? value[i] > 0.5 : !!(b && (typeof b === 'number' ? b > 0.5 : b.pressed));
    }
    return { lx: stick(P.sticks.lx), ly: stick(P.sticks.ly), rx: stick(P.sticks.rx), ry: stick(P.sticks.ry), lt: value[BTN.LT], rt: value[BTN.RT], value, on };
  }

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
    this.raw = { id: gp.id, mapping: gp.mapping, axes: gp.axes.slice(), buttons: gp.buttons.map((b) => +(typeof b === 'number' ? b : b.value).toFixed(2)), index: gp.index };
    if (this.wizard) { this.stepWizard(gp); this.zero(); return true; }

    const P = this.bindingFor(gp);
    const v = this.readVirtual(gp, P);
    const prevOn = this.prev.get(gp.index)?.on || [];
    const storePrev = () => this.prev.set(gp.index, { on: v.on.slice() });
    if (this.capture) { this.stepCapture(v, dt); this.zero(); storePrev(); return true; }

    const S = this.settings;
    const ctx = this.triggerMode === 'tank' ? 'tank' : 'heli';
    const L = this.live(ctx);
    const btn = L.buttons;
    const [lx, ly] = radial(v.lx, v.ly, S);
    const [rx, ry] = radial(v.rx, v.ry, S);
    this.sticks = { lx, ly, rx, ry };
    const trig = curve(v.rt - v.lt, { deadZone: 0.06, expo: S.expo });
    const held = (list) => (list || []).some((i) => v.on[i]);
    const level = (list) => Math.max(0, ...(list || []).map((i) => v.value[i]));
    const pressed = (i) => v.on[i] && !prevOn[i];
    const any = (list) => (list || []).some(pressed);

    // Looking around: hold the view button (L3 by default; a tap still switches view) or a look button,
    // and the right stick looks instead of flying while the axes it normally flies centre.
    const viewHeld = !menuMode && held(btn.view);
    if (viewHeld) this.viewHeldT = (this.viewHeldT || 0) + dt;
    else if (this.viewHeldT !== undefined) {
      if (this.viewHeldT > 0 && this.viewHeldT < 0.3 && !this.viewLooked) this.events.push('view');
      this.viewHeldT = 0; this.viewLooked = false;
    }
    const lookNow = !menuMode && (held(btn.look) || (viewHeld && (this.viewHeldT > 0.3 || Math.hypot(rx, ry) > 0.25)));
    this.look = lookNow ? { x: rx, y: ry } : null;
    if (this.look && viewHeld) this.viewLooked = true;
    const routed = routeAxes({ lx, ly, rx: this.look ? 0 : rx, ry: this.look ? 0 : ry, lt: 0, rt: trig }, L.axes, this.layout.invert);
    // Classic: with the triggers free in this aircraft, they add lift as well (whichever is pushed further).
    if (S.triggers && L.trigFree && Math.abs(trig) > Math.abs(routed.collective)) routed.collective = this.layout.invert.collective ? -trig : trig;
    const clamp = (x) => Math.max(-1, Math.min(1, x));
    this.out.collective = clamp(routed.collective * S.collective);
    this.out.yaw = clamp(routed.yaw * S.yaw);
    this.out.pitch = clamp(routed.pitch * S.cyclic);
    this.out.roll = clamp(routed.roll * S.cyclic);
    if (menuMode) this.zero();

    const tank = ctx === 'tank';
    if (!menuMode) {
      this.pour = !tank && level(btn.pour) > 0.5;
      this.doors = tank ? curve(level(btn.doors), { deadZone: 0.04, expo: 0.3 }) : 0;
      this.pump = tank ? Math.min(1, level(btn.pump) * 1.15) : 0;
      const both = held(btn.reelOut) && held(btn.reelIn);
      this.reel = tank && !both ? (held(btn.reelOut) ? 1 : 0) - (held(btn.reelIn) ? 1 : 0) : 0;
      this.holds = {};
      for (const a of ACTIONS) if (held(btn[a.id])) this.holds[a.id] = true;
    }

    if (menuMode) {
      // Menus use the standard buttons whatever the layout.
      if (pressed(BTN.A)) this.events.push('confirm');
      if (pressed(BTN.B)) this.events.push('back');
      if (pressed(BTN.LB)) this.events.push('tab-prev');   // the bumpers flip a menu's tabs
      if (pressed(BTN.RB)) this.events.push('tab-next');
      if (pressed(BTN.BACK) || any(this.mapping.buttons.pause)) this.events.push('pause');
      if (pressed(BTN.START)) this.events.push('restart');
      // Menu navigation from the d-pad or the left stick, with auto-repeat.
      let dir = null;
      if (v.on[BTN.UP] || v.ly > 0.6) dir = 'up';
      else if (v.on[BTN.DOWN] || v.ly < -0.6) dir = 'down';
      else if (v.on[BTN.LEFT] || v.lx < -0.6) dir = 'left';
      else if (v.on[BTN.RIGHT] || v.lx > 0.6) dir = 'right';
      if (dir !== this.navRepeat.dir) { this.navRepeat = { dir, t: 0.4 }; if (dir) this.events.push(`nav-${dir}`); }
      else if (dir) { this.navRepeat.t -= dt; if (this.navRepeat.t <= 0) { this.navRepeat.t = 0.12; this.events.push(`nav-${dir}`); } }
    } else {
      this.navRepeat.dir = null;
      for (const a of ACTIONS) if (!HELD.has(a.id) && any(btn[a.id])) this.events.push(a.id);
      // Combos. Skycrane: two quick full pulls of the doors = salvo; reel in + out together = auto-fill;
      // a digital pump button tapped twice = auto-fill. Bucket: pull the pour twice quickly to latch it.
      const now = performance.now();
      if (tank) {
        const full = this.doors > 0.85;
        if (full && !this.doorsWasFull) { if (now - (this.lastDoorPull || 0) < 400) { this.events.push('salvo'); this.lastDoorPull = 0; } else this.lastDoorPull = now; }
        this.doorsWasFull = full;
        if ((any(btn.reelOut) && held(btn.reelIn)) || (any(btn.reelIn) && held(btn.reelOut))) this.events.push('autofill');
        const digitalPump = (btn.pump || []).filter((i) => !TRIGGER_BUTTONS.includes(i));
        if (any(digitalPump)) { if (now - (this.lastPumpTap || 0) < 350) { this.events.push('autofill'); this.lastPumpTap = 0; } else this.lastPumpTap = now; }
      } else if (any(btn.pour)) {
        if (now - (this.lastPourTap || 0) < 350) { this.events.push('salvo'); this.lastPourTap = 0; } else this.lastPourTap = now;
      }
    }
    this.cam = {
      yaw: (held(btn.camLeft) ? 1 : 0) - (held(btn.camRight) ? 1 : 0),
      zoom: (held(btn.zoomOut) ? 1 : 0) - (held(btn.zoomIn) ? 1 : 0),
    };
    if (menuMode) this.cam.yaw = this.cam.zoom = 0;
    const used = Math.abs(this.out.pitch) + Math.abs(this.out.roll) + Math.abs(this.out.yaw) + Math.abs(this.out.collective) > 0.05 || v.on.some((b, i) => b && !prevOn[i]);
    storePrev();
    return used;
  }

  activity(gp) {
    const rest = this.rest.get(gp.index) || [];
    let m = 0;
    gp.axes.forEach((v, i) => { m = Math.max(m, Math.abs(v - (rest[i] || 0))); });
    gp.buttons.forEach((b) => { if (b.pressed) m = Math.max(m, 1); });
    return m;
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
  takeNotices() { const n = this.notices; this.notices = []; return n; }

  rumble(strong, weak, ms, priority = 0) {
    if (!this.settings.rumble) return;
    const gp = this.active();
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    if (![strong, weak, ms, priority].every(Number.isFinite) || ms <= 0) return;
    strong = Math.max(0, Math.min(1, strong)); weak = Math.max(0, Math.min(1, weak));
    const now = performance.now(), strength = Math.max(strong, weak), current = this.rumbleEffect;
    // Browsers replace the current effect on every call. A scrape must not truncate a crash pulse,
    // and repeated contact events must not restart the same pulse hundreds of times a second.
    if (current && current.act === act && now < current.until &&
        (priority < current.priority || (priority === current.priority && strength <= current.strength))) return;
    if (current && current.act !== act) this.stopRumble();
    const effect = { act, until: now + ms, priority, strength };
    this.rumbleEffect = effect;
    const failed = () => { if (this.rumbleEffect === effect) this.rumbleEffect = null; };
    try { Promise.resolve(act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak })).catch(failed); }
    catch { failed(); }
  }
  stopRumble() {
    const effect = this.rumbleEffect;
    this.rumbleEffect = null;
    try { Promise.resolve(effect?.act.reset?.()).catch(() => {}); } catch { /* device was removed */ }
  }
  canRumble() { const gp = this.active(); return !!(gp && gp.vibrationActuator); }

  // ---------------------------------------------------------------- binding wizard (non-standard pads)
  startWizard(onUpdate) {
    const gp = this.active() || this.list()[0];
    if (!gp) return false;
    this.wizard = { index: gp.index, id: gp.id, step: 0, waitRelease: true, binding: { custom: true, v: 2, sticks: {}, pad: [] }, onUpdate };
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
      if (Math.abs(bv) > 0.6) w.binding.sticks[step.key] = { index: best, sign: Math.sign(bv) };
      else return; // ignore buttons on stick steps
    } else {
      if (anyBtn < 0) return;
      w.binding.pad[step.button] = anyBtn;
    }
    w.step++;
    w.waitRelease = true;
    this.finishIfDone();
    this.wizard?.onUpdate(this.wizardView());
  }
  finishIfDone() {
    const w = this.wizard;
    if (w.step < BIND_STEPS.length) return;
    const b = w.binding;
    for (const k of STICK_SOURCES) if (!b.sticks[k]) b.sticks[k] = STANDARD_BINDING.sticks[k];
    for (let i = 0; i < 16; i++) if (!Number.isInteger(b.pad[i])) b.pad[i] = i;
    save(`bind.${w.id}`, b);
    const done = w.onUpdate;
    this.wizard = null;
    done({ done: true, id: w.id });
  }
}

// Best guess for a non-standard pad before the player binds it: the common HID layout.
function guessBinding(gp) {
  const b = { custom: true, v: 2, sticks: JSON.parse(JSON.stringify(STANDARD_BINDING.sticks)), pad: STANDARD_BINDING.pad.slice() };
  if (gp.axes.length >= 4) b.sticks.ry = { index: gp.axes.length >= 6 ? 5 : 3, sign: -1 };
  if (gp.axes.length >= 6) b.sticks.rx = { index: 2, sign: 1 };
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
