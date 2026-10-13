import { CFG } from '../config.js';
import { Gamepads } from './gamepad.js';

// Merges keyboard, gamepad and touch into one control state.
// Axes (all -1..1): pitch (+ forward), roll (+ right), yaw (+ right), collective (+ up).
// Collective is a *rate* everywhere: with assist off it trims the collective up/down and holds it when
// released; with assist on it commands climb/sink speed. So switching devices never jumps the throttle.
const KEYMAP = {
  pitchUp: ['ArrowUp', 'KeyI'], pitchDown: ['ArrowDown', 'KeyK'],
  rollLeft: ['ArrowLeft', 'KeyJ'], rollRight: ['ArrowRight', 'KeyL'],
  collUp: ['KeyW'], collDown: ['KeyS'], yawLeft: ['KeyA', 'KeyQ'], yawRight: ['KeyD', 'KeyE'],
};
const ACTION_KEYS = {
  Space: 'attach', Enter: 'attach', KeyV: 'aircraft', KeyF: 'assist', KeyR: 'restart', KeyC: 'recenter',
  Escape: 'pause', KeyP: 'pause', KeyH: 'help', Slash: 'help', KeyM: 'mute', Backquote: 'debug', F3: 'debug', KeyB: 'reset',
};

function shape(x) {
  const dz = CFG.input.deadZone;
  const s = Math.sign(x), a = Math.abs(x);
  if (a < dz) return 0;
  const n = (a - dz) / (1 - dz);
  const e = CFG.input.expo;
  return s * ((1 - e) * n + e * n * n * n);
}

export class Input {
  constructor(touchRoot) {
    this.keys = new Set();
    this.kb = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.ctl = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.actions = [];
    this.source = 'keyboard';
    this.gp = { pitch: 0, roll: 0, yaw: 0, collective: 0, connected: false, id: '' };
    this.touch = { pitch: 0, roll: 0, yaw: 0, collective: 0, active: false };
    this.camOrbit = { yaw: 0, pitch: 0, zoom: 0 };
    this.enabled = true;
    this.notices = [];

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const isGameKey = Object.values(KEYMAP).some((l) => l.includes(e.code)) || ACTION_KEYS[e.code];
      if (isGameKey) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.source = 'keyboard';
      let a = ACTION_KEYS[e.code];
      if (a === 'reset' && !e.shiftKey) a = null;
      if (e.code === 'KeyR' && e.shiftKey) a = 'reset';
      if (a) this.actions.push(a);
    }, { passive: false });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearAll(); });
    this.pads = new Gamepads();
    this.menuMode = false;
    // Mouse orbit (desktop): drag on the canvas, wheel to zoom.
    this.dragging = null;
    if (touchRoot) this.buildTouch(touchRoot);
  }

  clearAll() {
    this.keys.clear();
    Object.assign(this.kb, { pitch: 0, roll: 0, yaw: 0, collective: 0 });
    Object.assign(this.touch, { pitch: 0, roll: 0, yaw: 0, collective: 0 });
    for (const s of this.sticks || []) s.release();
  }

  bindCanvas(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.dragging = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerType !== 'mouse') return;
      this.camOrbit.yaw -= (e.clientX - this.dragging.x) * 0.006;
      this.camOrbit.pitch += (e.clientY - this.dragging.y) * 0.004;
      this.dragging = { x: e.clientX, y: e.clientY };
    });
    const end = () => { this.dragging = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.camOrbit.zoom += Math.sign(e.deltaY) * 0.08; }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- touch
  buildTouch(root) {
    this.touchRoot = root;
    const mk = (cls, label) => {
      const zone = document.createElement('div');
      zone.className = `stick-zone ${cls}`;
      zone.innerHTML = `<div class="stick-base"><div class="stick-knob"></div></div><div class="stick-label">${label}</div>`;
      root.appendChild(zone);
      return zone;
    };
    const left = mk('left', '<span>Lift</span><span>Turn</span>');
    const right = mk('right', '<span>Tilt</span>');
    const self = this;
    class Stick {
      constructor(zone, onMove) {
        this.zone = zone; this.base = zone.querySelector('.stick-base'); this.knob = zone.querySelector('.stick-knob');
        this.id = null; this.cx = 0; this.cy = 0; this.onMove = onMove;
        zone.addEventListener('pointerdown', (e) => this.start(e));
        zone.addEventListener('pointermove', (e) => this.move(e));
        zone.addEventListener('pointerup', (e) => this.end(e));
        zone.addEventListener('pointercancel', (e) => this.end(e));
        zone.addEventListener('lostpointercapture', (e) => this.end(e));
      }
      start(e) {
        if (this.id !== null) return;
        e.preventDefault();
        this.id = e.pointerId;
        this.zone.setPointerCapture(e.pointerId);
        const r = this.zone.getBoundingClientRect();
        this.cx = e.clientX; this.cy = e.clientY;
        this.base.style.left = `${e.clientX - r.left}px`;
        this.base.style.top = `${e.clientY - r.top}px`;
        this.zone.classList.add('active');
        self.source = 'touch';
        this.move(e);
      }
      move(e) {
        if (e.pointerId !== this.id) return;
        e.preventDefault();
        const R = Math.min(64, this.zone.clientWidth * 0.22);
        let dx = (e.clientX - this.cx) / R, dy = (e.clientY - this.cy) / R;
        const m = Math.hypot(dx, dy);
        if (m > 1) { dx /= m; dy /= m; }
        this.knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
        this.onMove(dx, -dy);
      }
      end(e) { if (e.pointerId !== this.id) return; this.release(); }
      release() {
        this.id = null;
        this.knob.style.transform = 'translate(0px, 0px)';
        this.zone.classList.remove('active');
        this.onMove(0, 0);
      }
    }
    this.sticks = [
      new Stick(left, (x, y) => { this.touch.yaw = x; this.touch.collective = y; }),
      new Stick(right, (x, y) => { this.touch.roll = x; this.touch.pitch = y; }),
    ];
    const btn = (cls, html, action) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${cls}`;
      b.innerHTML = html;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.source = 'touch'; this.actions.push(action); b.classList.add('pressed'); });
      b.addEventListener('pointerup', () => b.classList.remove('pressed'));
      b.addEventListener('pointercancel', () => b.classList.remove('pressed'));
      root.appendChild(b);
      return b;
    };
    this.attachBtn = btn('attach', '<span class="ico">⚓</span><span class="lbl">Hook</span>', 'attach');
    this.assistBtn = btn('assist', '<span class="lbl">Assist</span>', 'assist');
    btn('recenter', '<span class="lbl">View</span>', 'recenter');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const k = this.keys;
    const has = (l) => l.some((c) => k.has(c));
    const tgt = {
      pitch: (has(KEYMAP.pitchUp) ? 1 : 0) - (has(KEYMAP.pitchDown) ? 1 : 0),
      roll: (has(KEYMAP.rollRight) ? 1 : 0) - (has(KEYMAP.rollLeft) ? 1 : 0),
      yaw: (has(KEYMAP.yawRight) ? 1 : 0) - (has(KEYMAP.yawLeft) ? 1 : 0),
      collective: (has(KEYMAP.collUp) ? 1 : 0) - (has(KEYMAP.collDown) ? 1 : 0),
    };
    // Keys slew so taps give proportional, not bang-bang, inputs.
    for (const a of ['pitch', 'roll', 'yaw', 'collective']) {
      const t = tgt[a], c = this.kb[a];
      const rate = Math.abs(t) >= Math.abs(c) ? CFG.input.keyRise : CFG.input.keyFall;
      const step = rate * dt;
      this.kb[a] = Math.abs(t - c) < step ? t : c + Math.sign(t - c) * step;
    }
    this.pollGamepad(dt);
    const pick = (a) => {
      const vals = [this.kb[a], this.gp[a], shape(this.touch[a])];
      let best = 0;
      for (const v of vals) if (Math.abs(v) > Math.abs(best)) best = v;
      return best;
    };
    this.ctl.pitch = pick('pitch');
    this.ctl.roll = pick('roll');
    this.ctl.yaw = pick('yaw');
    this.ctl.collective = pick('collective');
    if (!this.enabled) { this.ctl.pitch = this.ctl.roll = this.ctl.yaw = this.ctl.collective = 0; }
    return this.ctl;
  }

  pollGamepad(dt) {
    const used = this.pads.poll(dt, this.menuMode);
    const o = this.pads.out;
    this.gp.pitch = o.pitch; this.gp.roll = o.roll; this.gp.yaw = o.yaw; this.gp.collective = o.collective;
    this.gp.connected = !!this.pads.raw;
    this.gp.id = this.pads.raw ? this.pads.raw.id : '';
    if (used) this.source = 'gamepad';
    for (const e of this.pads.takeEvents()) this.actions.push(e);
    for (const n of this.pads.takeNotices()) { this.notices.push(n.text); if (n.type === 'disconnected') this.actions.push('padLost'); }
    if (this.pads.cam) {
      this.camOrbit.yaw += this.pads.cam.yaw * 0.03;
      this.camOrbit.zoom += this.pads.cam.zoom * 0.02;
    }
  }

  takeActions() { const a = this.actions; this.actions = []; return a; }
  takeNotices() { const n = this.notices; this.notices = []; return n; }
}
