import { CFG } from '../config.js';
import { Gamepads } from './gamepad.js';
import { CAM_KEYS, LOOK_MODES } from '../render/cameraModes.js';

// Merges keyboard, gamepad and touch into one control state.
// Axes (all -1..1): pitch (+ forward), roll (+ right), yaw (+ right), collective (+ up).
// Collective is a *rate* everywhere: with assist off it trims the collective up/down and holds it when
// released; with assist on it commands climb/sink speed. So switching devices never jumps the throttle.
const KEYMAP = {
  pitchUp: ['ArrowUp', 'KeyI'], pitchDown: ['ArrowDown', 'KeyK'],
  rollLeft: ['ArrowLeft', 'KeyJ'], rollRight: ['ArrowRight', 'KeyL'],
  collUp: ['KeyW'], collDown: ['KeyS'], yawLeft: ['KeyA', 'KeyQ'], yawRight: ['KeyD', 'KeyE'],
};
// Held, not edge-triggered: the milk bucket's valve stays open while the key is down.
const POUR_KEYS = ['KeyG'];
// Skycrane tank: T pumps (held), Z / X reel the snorkel in / out (held).
const TANK_KEYS = { pump: ['KeyT'], reelIn: ['KeyZ'], reelOut: ['KeyX'] };
const DOUBLE_TAP = 320; // ms
// Camera: C steps through the cameras (Shift+C back), 1 is the cockpit and back, 2-7 pick one, B (held) is the GoPro.
const BOLT_KEYS = ['KeyB'];
const ACTION_KEYS = {
  ...Object.fromEntries(Object.entries(CAM_KEYS).map(([k, id]) => [k, `cam:${id}`])),
  Space: 'attach', Enter: 'attach', KeyV: 'aircraft', Digit1: 'cockpit', KeyF: 'assist', KeyR: 'restart', KeyC: 'camNext', KeyU: 'recenter', Home: 'recenter',
  Escape: 'pause', KeyP: 'pause', KeyH: 'help', Slash: 'help', KeyM: 'mute', Backquote: 'debug', F3: 'debug', F2: 'fpsmeter', KeyB: 'reset', KeyN: 'mark',
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
    this.ctl = { pitch: 0, roll: 0, yaw: 0, collective: 0, pour: false, doors: 0, pump: 0, reel: 0, boltCam: false };
    this.actions = [];
    this.source = 'keyboard';
    this.gp = { pitch: 0, roll: 0, yaw: 0, collective: 0, connected: false, id: '' };
    this.touch = { pitch: 0, roll: 0, yaw: 0, collective: 0, active: false, pour: false, doors: false, pump: false, reel: 0, bolt: false };
    this.mouseBolt = false;
    this.camOrbit = { yaw: 0, pitch: 0, zoom: 0 };
    // First-person free-look deltas (radians) and zoom, taken by the game each frame.
    this.look = { yaw: 0, pitch: 0, zoom: 0 };
    this.viewMode = 'chase';
    this.enabled = true;
    this.notices = [];
    this.lastTap = {};
    this.aircraft = 'micro';
    this.kbDoors = 0;
    this.touchDoors = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const isGameKey = Object.values(KEYMAP).some((l) => l.includes(e.code)) || ACTION_KEYS[e.code] || POUR_KEYS.includes(e.code) || BOLT_KEYS.includes(e.code) || Object.values(TANK_KEYS).some((l) => l.includes(e.code));
      if (isGameKey) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.source = 'keyboard';
      let a = ACTION_KEYS[e.code];
      if (a === 'reset' && !e.shiftKey) a = null;
      if (e.code === 'KeyR' && e.shiftKey) a = 'reset';
      if (a === 'camNext' && e.shiftKey) a = 'camPrev';
      if (a) this.actions.push(a);
      // Combos: Shift or a double-tap. G: salvo (dump everything). T: skycrane auto-fill.
      const combo = { KeyG: 'salvo', KeyT: 'autofill' }[e.code];
      if (combo) {
        const now = performance.now();
        if (e.shiftKey || now - (this.lastTap[e.code] || 0) < DOUBLE_TAP) { this.actions.push(combo); this.lastTap[e.code] = 0; } else this.lastTap[e.code] = now;
      }
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
    Object.assign(this.touch, { pitch: 0, roll: 0, yaw: 0, collective: 0, pour: false, doors: false, pump: false, reel: 0, bolt: false });
    this.mouseBolt = false;
    this.pourBtn?.classList.remove('pressed');
    for (const s of this.sticks || []) s.release();
  }

  // Mouse drag (or a finger on open screen, away from the sticks) orbits the chase camera or, in the
  // cockpit, turns the pilot's head. The wheel zooms either.
  bindCanvas(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 2) { this.mouseBolt = true; this.source = 'keyboard'; return; }
      if (this.dragging) return;
      this.dragging = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse' };
      canvas.setPointerCapture(e.pointerId);
      if (this.dragging.touch) this.source = 'touch';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.dragging.id) return;
      const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
      if (LOOK_MODES.has(this.viewMode)) {
        const k = this.dragging.touch ? 0.006 : 0.004;
        this.look.yaw -= dx * k;
        this.look.pitch -= dy * k;
      } else {
        this.camOrbit.yaw -= dx * 0.006;
        this.camOrbit.pitch += dy * 0.004;
      }
      this.dragging.x = e.clientX; this.dragging.y = e.clientY;
    });
    const end = (e) => { if (e.pointerType === 'mouse' && e.button === 2) this.mouseBolt = false; if (this.dragging && e.pointerId === this.dragging.id) this.dragging = null; };
    // Right button released over the HUD or outside the window still lets go of the GoPro.
    window.addEventListener('pointerup', (e) => { if (e.button === 2) this.mouseBolt = false; });
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (LOOK_MODES.has(this.viewMode)) this.look.zoom += Math.sign(e.deltaY) * 4;
      else this.camOrbit.zoom += Math.sign(e.deltaY) * 0.08;
    }, { passive: false });
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
    // Next camera, and the GoPro while held.
    btn('cam', '<span class="lbl">Cam</span>', 'view');
    // Mark this moment for a flight note (described later in the replay).
    btn('mark', '<span class="ico">⚑</span><span class="lbl">Mark</span>', 'mark');
    // Pour: held. Shown only while the milk bucket is on a hook.
    // Held buttons; a double-tap fires a combo.
    const hold = (cls, html, set, combo) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${cls} hidden`;
      b.innerHTML = html;
      let last = 0;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); this.source = 'touch'; set(true); b.classList.add('pressed'); b.setPointerCapture?.(e.pointerId);
        const now = performance.now();
        if (combo && now - last < DOUBLE_TAP) { this.actions.push(combo); last = 0; } else last = now;
      });
      const up = () => { set(false); b.classList.remove('pressed'); };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
      root.appendChild(b);
      return b;
    };
    this.boltBtn = hold('bolt', '<span class="lbl">GoPro</span>', (v) => { this.touch.bolt = v; });
    this.boltBtn.classList.remove('hidden');
    // Pour (bucket): shown only while the bucket is on a hook. Double-tap latches the valve open.
    this.pourBtn = hold('pour', '<span class="ico">🥛</span><span class="lbl">Pour</span>', (v) => { this.touch.pour = v; }, 'salvo');
    // Skycrane tank: doors (open wider the longer you hold; double-tap = salvo), pump (double-tap = auto-fill), hose reel.
    this.tankBtns = {
      doors: hold('doors', '<span class="lbl">Doors</span>', (v) => { this.touch.doors = v; }, 'salvo'),
      pump: hold('pump', '<span class="lbl">Pump</span>', (v) => { this.touch.pump = v; }, 'autofill'),
      reelOut: hold('reel-out', '<span class="lbl">Hose ▼</span>', (v) => { this.touch.reel = v ? 1 : 0; }),
      reelIn: hold('reel-in', '<span class="lbl">Hose ▲</span>', (v) => { this.touch.reel = v ? -1 : 0; }),
    };
  }

  // Which touch buttons fit the aircraft and cargo (called by the game each frame).
  setTouchMode(sky, carryingBucket) {
    if (!this.pourBtn) return;
    this.pourBtn.classList.toggle('hidden', !carryingBucket || sky);
    for (const b of Object.values(this.tankBtns)) b.classList.toggle('hidden', !sky);
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
    // Tank controls (skycrane). Keys and touch open the doors progressively while held; a trigger is direct.
    const sky = this.aircraft === 'skycrane';
    const S = CFG.skycrane.tank;
    const gHeld = POUR_KEYS.some((c) => k.has(c));
    this.kbDoors = sky && gHeld ? Math.min(1, this.kbDoors + S.doorSlew * dt) : 0;
    this.touchDoors = sky && this.touch.doors ? Math.min(1, this.touchDoors + S.doorSlew * dt) : 0;
    this.ctl.doors = sky ? Math.max(this.kbDoors, this.touchDoors, this.pads.doors || 0) : 0;
    this.ctl.pump = sky ? Math.max(TANK_KEYS.pump.some((c) => k.has(c)) ? 1 : 0, this.touch.pump ? 1 : 0, this.pads.pump || 0) : 0;
    const reel = (TANK_KEYS.reelOut.some((c) => k.has(c)) ? 1 : 0) - (TANK_KEYS.reelIn.some((c) => k.has(c)) ? 1 : 0) + this.touch.reel + (this.pads.reel || 0);
    this.ctl.reel = sky ? Math.max(-1, Math.min(1, reel)) : 0;
    // The bucket's valve: G / RB / Pour; on the skycrane its hook's bucket opens with the doors.
    this.ctl.pour = sky ? this.ctl.doors > 0.05 : gHeld || !!this.pads.pour || this.touch.pour;
    // Held camera buttons from the pad layout (the camera code reads these; keys and touch can add theirs).
    // The GoPro: the pad's boltCam binding (LT in the Aim presets), B, the right mouse button or touch GoPro.
    this.ctl.boltCam = this.pads.isHeld('boltCam') || BOLT_KEYS.some((c) => k.has(c)) || this.mouseBolt || this.touch.bolt;
    if (!this.enabled) { this.ctl.pitch = this.ctl.roll = this.ctl.yaw = this.ctl.collective = 0; this.ctl.pour = false; this.ctl.doors = this.ctl.pump = this.ctl.reel = 0; this.ctl.boltCam = false; }
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
    if (this.pads.cam && LOOK_MODES.has(this.viewMode)) {
      // D-pad glances around the cockpit; holding L3 lets the right stick look freely.
      this.look.yaw += this.pads.cam.yaw * 1.5 * dt;
      this.look.pitch -= this.pads.cam.zoom * 1.1 * dt;
    } else if (this.pads.cam) {
      this.camOrbit.yaw += this.pads.cam.yaw * 0.03;
      this.camOrbit.zoom += this.pads.cam.zoom * 0.02;
    }
    // Holding the view (or look) button: the right stick turns the pilot's head, or orbits the chase camera.
    if (this.pads.look && LOOK_MODES.has(this.viewMode)) {
      this.look.yaw -= this.pads.look.x * 2.2 * dt;
      this.look.pitch += this.pads.look.y * 1.6 * dt;
    } else if (this.pads.look) {
      this.camOrbit.yaw -= this.pads.look.x * 2.2 * dt;
      this.camOrbit.pitch -= this.pads.look.y * 1.2 * dt;
    }
  }

  takeLook() { const l = { ...this.look }; this.look.yaw = this.look.pitch = this.look.zoom = 0; return l; }

  takeActions() { const a = this.actions; this.actions = []; return a; }
  takeNotices() { const n = this.notices; this.notices = []; return n; }
}
