import { CFG } from '../config.js';
import { Gamepads } from './gamepad.js';
import { Hotas } from './hotas.js';
import { CAM_KEYS, LOOK_MODES } from '../render/cameraModes.js';
import {
  FIXED_KEYS, KB_FLIGHT, kbMappingOf, keyIndex, mouseFlies, normalizeKbLayout, chooseKbPreset, bindKey, unbindKey, setMouseAxis, setMouseMode,
} from './kbLayouts.js';

// Merges keyboard, gamepad and touch into one control state.
// Axes (all -1..1): pitch (+ forward), roll (+ right), yaw (+ right), collective (+ up).
// Collective with assist on commands climb/sink speed. With assist off it is a sprung lever by default
// (up climbs, centred settles gently, down sinks faster; sim/collective.js) or, in hold mode, a rate that
// trims the collective and leaves it. Every source rests at 0, so switching devices never jumps the throttle.
// Keys and mouse come from the keyboard layout (kbLayouts.js: presets and the player's remapping); a few keys
// are fixed (FIXED_KEYS: pause, help, mute, debug) and the digits pick cameras.
const DOUBLE_TAP = 320; // ms
const LS_KB = 'helicoptea.kb.layout';
const loadKb = () => { try { const v = localStorage.getItem(LS_KB); return v ? JSON.parse(v) : null; } catch { return null; } };
const saveKb = (v) => { try { localStorage.setItem(LS_KB, JSON.stringify(v)); } catch { /* ignore */ } };
// Presses that become game actions as they are (held binds and flight directions are read each frame).
const PRESS = { attach: 'attach', assist: 'assist', recenter: 'recenter', mark: 'mark', aircraft: 'aircraft' };
// The digits: 1 is the cockpit and back, 2-7 pick a camera.
const DIGIT_KEYS = { Digit1: 'cockpit', ...Object.fromEntries(Object.entries(CAM_KEYS).map(([k, id]) => [k, `cam:${id}`])) };

// Touch stick layouts: which flight axis each stick's x (left / right) and y (up / down) flies.
export const TOUCH_LAYOUTS = {
  classic: { name: 'Classic: lift and turn left, tilt right', left: { y: 'collective', x: 'yaw', label: ['Lift', 'Turn'] }, right: { y: 'pitch', x: 'roll', label: ['Tilt'] } },
  aim: { name: 'Aim: lift and roll left, pitch and turn right', left: { y: 'collective', x: 'roll', label: ['Lift', 'Roll'] }, right: { y: 'pitch', x: 'yaw', label: ['Pitch', 'Turn'] } },
  southpaw: { name: 'Southpaw: tilt left, lift and turn right', left: { y: 'pitch', x: 'roll', label: ['Tilt'] }, right: { y: 'collective', x: 'yaw', label: ['Lift', 'Turn'] } },
  mode1: { name: 'RC Mode 1: pitch and turn left, lift and roll right', left: { y: 'pitch', x: 'yaw', label: ['Pitch', 'Turn'] }, right: { y: 'collective', x: 'roll', label: ['Lift', 'Roll'] } },
};
export const TOUCH_LAYOUT_IDS = Object.keys(TOUCH_LAYOUTS);
// Thumb travel from centre to full deflection, in CSS pixels.
export const TOUCH_SIZES = { small: 48, medium: 64, large: 84 };
// Pointer capture throws when the pointer is already gone (a very quick tap, or a touch the browser has
// cancelled): nothing to capture then, and it must not stop the game.
export function capture(el, id) { try { el.setPointerCapture(id); } catch { /* pointer already released */ } }
// A short tick under the thumb where the phone can (phoneHaptics.js: Android vibration, iPhone switch tick).
let haptics = null;
export function setHaptics(h) { haptics = h; }
export function buzz(ms) { haptics?.tap(ms, { gap: 30 }); }

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
    this.ctl = { pitch: 0, roll: 0, yaw: 0, collective: 0, lever: null, pour: false, doors: 0, pump: 0, reel: 0, boltCam: false };
    this.actions = [];
    this.source = 'keyboard';
    this.gp = { pitch: 0, roll: 0, yaw: 0, collective: 0, connected: false, id: '' };
    this.touch = { pitch: 0, roll: 0, yaw: 0, collective: 0, active: false, pour: false, doors: false, pump: false, reel: 0, bolt: false };
    this.camOrbit = { yaw: 0, pitch: 0, zoom: 0 };
    // First-person free-look deltas (radians) and zoom, taken by the game each frame.
    this.look = { yaw: 0, pitch: 0, zoom: 0 };
    this.viewMode = 'chase';
    this.enabled = true;
    this.notices = [];
    this.lastTap = {};
    this.aircraft = 'micro';
    this.assist = true;          // set by the game each frame: the mouse's nose mode holds tilt with assist on
    this.kbDoors = 0;
    this.touchDoors = 0;
    this.touchLayout = 'classic';
    this.touchSize = 'medium';
    this.lastOpenTap = null;
    // Mouse flying: a virtual stick (x: mouse ↔, y: mouse ↕, +right / +forward) fed by pointer-locked movement.
    this.mstick = { x: 0, y: 0 };
    this.mouseOut = { pitch: 0, roll: 0, yaw: 0 };
    this.canvas = null;
    this.locked = false;
    this.kbCapture = null;       // remapping: waiting for a key or mouse button
    this.setKbLayout(normalizeKbLayout(loadKb()), false);

    window.addEventListener('keydown', (e) => {
      // Text entry owns its keys, including letters that also restart or steer the game.
      if (e.target?.matches?.('input, select, textarea') || e.target?.isContentEditable) return;
      if (this.kbCapture) { e.preventDefault(); this.finishCapture(e.code === 'Escape' ? null : e.code); return; }
      const bind = this.kidx.get(e.code);
      if (bind || FIXED_KEYS[e.code] || DIGIT_KEYS[e.code]) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.source = 'keyboard';
      if (bind) this.pressBind(bind, e.code, e.shiftKey);
      else if (FIXED_KEYS[e.code]) this.actions.push(FIXED_KEYS[e.code]);
      else if (DIGIT_KEYS[e.code]) this.actions.push(DIGIT_KEYS[e.code]);
    }, { passive: false });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    // Remapping takes a mouse button pressed anywhere (the settings panel covers the scene), except the
    // panel's own Cancel.
    window.addEventListener('mousedown', (e) => {
      if (!this.kbCapture || e.target?.closest?.('.kb-capture button')) return;
      e.preventDefault(); e.stopPropagation();
      this.swallowClick = performance.now();
      this.finishCapture(`Mouse${e.button}`);
    }, true);
    // ...and the click or context menu that button would go on to make.
    for (const ev of ['click', 'auxclick', 'contextmenu']) {
      window.addEventListener(ev, (e) => {
        if (this.swallowClick && performance.now() - this.swallowClick < 800) { e.preventDefault(); e.stopPropagation(); if (ev !== 'contextmenu') this.swallowClick = 0; }
      }, true);
    }
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearAll(); });
    this.pads = new Gamepads();
    // Flight sticks and HOTAS: their own layer; the gamepad layer leaves those devices alone.
    this.hotas = new Hotas();
    this.pads.exclude = (gp) => this.hotas.owns(gp);
    this.ho = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
    this.menuMode = false;
    // Mouse orbit (desktop): drag on the canvas, wheel to zoom.
    this.dragging = null;
    if (touchRoot) this.buildTouch(touchRoot);
  }

  // A bound key or mouse button went down.
  pressBind(bind, code, shift) {
    if (PRESS[bind]) this.actions.push(PRESS[bind]);
    else if (bind === 'restart') this.actions.push(shift ? 'reset' : 'restart');
    else if (bind === 'camNext') this.actions.push(shift ? 'camPrev' : 'camNext');
    else if (bind === 'centreStick') this.centreMouse();
    // Combos: Shift or a double-tap. Pour: salvo (dump everything). Pump: skycrane auto-fill.
    const combo = { pour: 'salvo', pump: 'autofill' }[bind];
    if (combo) {
      const now = performance.now();
      if (shift || now - (this.lastTap[code] || 0) < DOUBLE_TAP) { this.actions.push(combo); this.lastTap[code] = 0; } else this.lastTap[code] = now;
    }
  }

  // ---------------------------------------------------------------- keyboard and mouse layout
  setKbLayout(layout, persist = true) {
    this.kbLayout = layout;
    this.kbMap = kbMappingOf(layout);
    this.kidx = keyIndex(this.kbMap);
    this.kbFlight = KB_FLIGHT.map((f) => ({ ...f, keys: this.kbMap.keys[f.id] }));
    this.held = Object.fromEntries(['pour', 'pump', 'reelIn', 'reelOut', 'freeLook', 'boltCam'].map((id) => [id, this.kbMap.keys[id]]));
    this.mouseFlies = mouseFlies(this.kbMap);
    this.centreMouse();
    if (!this.mouseFlies) this.unlock();
    if (persist) saveKb(layout);
  }
  kbEdit(fn) { const r = fn(this.kbLayout); this.setKbLayout(r.layout || r); return r.notes || []; }
  chooseKbPreset(id) { this.setKbLayout(chooseKbPreset(this.kbLayout, id)); }
  bindKey(id, code, slot) { return this.kbEdit((l) => bindKey(l, id, code, slot)); }
  unbindKey(id, code) { return this.kbEdit((l) => unbindKey(l, id, code)); }
  setMouseAxis(dir, target) { return this.kbEdit((l) => setMouseAxis(l, dir, target)); }
  setMouseMode(mode) { return this.kbEdit((l) => setMouseMode(l, mode)); }
  setMouseFeel(k, v) { this.setKbLayout({ ...this.kbLayout, [k]: v }); }
  // Remapping: the next key or mouse button goes to cb (null when cancelled). Times out like the pad's.
  startKbCapture(cb) {
    this.cancelKbCapture();
    this.kbCapture = { cb, t: setTimeout(() => this.finishCapture(null), 6000) };
    return true;
  }
  cancelKbCapture() { if (this.kbCapture) this.finishCapture(null); }
  finishCapture(code) {
    const c = this.kbCapture;
    if (!c) return;
    clearTimeout(c.t);
    this.kbCapture = null;
    this.keys.clear();
    c.cb(code ? { code } : null);
  }

  centreMouse() { this.mstick.x = this.mstick.y = 0; }
  unlock() {
    if (this.locked && typeof document !== 'undefined' && document.exitPointerLock) { this.wantLock = false; document.exitPointerLock(); }
  }
  // Whether the mouse stick holds its position on this axis (true) or springs back (false).
  mouseHolds(target) { return this.kbMap.mouse.mode === 'stick' || (this.assist && (target === 'pitch' || target === 'roll')); }
  mouseMove(dx, dy) {
    if (!this.locked) return;
    const M = CFG.input.mouse, L = this.kbLayout;
    const inv = L.invertMouse ? -1 : 1;
    const step = (target) => (target === 'none' ? 0 : L.mouseSens / (this.mouseHolds(target) ? M.stickPx : target === 'yaw' ? M.noseYawPx : M.nosePx));
    const m = this.kbMap.mouse;
    this.mstick.x += dx * step(m.x);
    this.mstick.y += -dy * inv * step(m.y);
    if (m.mode === 'stick') {
      const r = Math.hypot(this.mstick.x, this.mstick.y);
      if (r > 1) { this.mstick.x /= r; this.mstick.y /= r; }
    } else {
      this.mstick.x = Math.max(-1, Math.min(1, this.mstick.x));
      this.mstick.y = Math.max(-1, Math.min(1, this.mstick.y));
    }
    this.source = 'keyboard';
  }
  // Mouse stick to flight axes, springing back the axes that do not hold.
  updateMouse(dt) {
    const m = this.kbMap.mouse, o = this.mouseOut;
    o.pitch = o.roll = o.yaw = 0;
    if (!this.mouseFlies) return;
    const k = Math.exp(-dt / CFG.input.mouse.spring);
    if (m.x !== 'none' && !this.mouseHolds(m.x)) this.mstick.x *= k;
    if (m.y !== 'none' && !this.mouseHolds(m.y)) this.mstick.y *= k;
    this.levelMouse(dt);
    if (!this.locked) return;
    if (m.x !== 'none') o[m.x] += this.mstick.x;
    if (m.y !== 'none') o[m.y] += this.mstick.y;
  }
  // Nose mode with Flight Assist on: a tilt left close to level drifts back to level by itself, so the
  // helicopter settles upright and the assist's drift catch can stop it. Further out, the tilt stays where
  // you put it. The pull is strongest at level and fades to nothing at the edge of the zone. Assist off,
  // the virtual stick and yaw are untouched.
  levelMouse(dt) {
    const m = this.kbMap.mouse, L = CFG.input.mouse;
    if (m.mode !== 'nose' || !this.assist || !(L.levelRate > 0) || !(L.levelZone > 0)) return;
    const tilt = (t) => t === 'pitch' || t === 'roll';
    const hx = tilt(m.x), hy = tilt(m.y);
    if (!hx && !hy) return;
    const r = Math.hypot(hx ? this.mstick.x : 0, hy ? this.mstick.y : 0);
    if (r >= L.levelZone) return;
    const k = Math.exp(-dt * L.levelRate * (1 - r / L.levelZone));
    if (hx) { this.mstick.x *= k; if (Math.abs(this.mstick.x) < 0.01) this.mstick.x = 0; }
    if (hy) { this.mstick.y *= k; if (Math.abs(this.mstick.y) < 0.01) this.mstick.y = 0; }
  }

  // For the HUD: the mouse stick's dot, or a nudge to click in. Null when the mouse does not fly.
  mouseView() {
    if (!this.mouseFlies) return null;
    return { locked: this.locked, x: this.mstick.x, y: this.mstick.y, mode: this.kbMap.mouse.mode, looking: this.isHeld('freeLook') };
  }
  isHeld(id) { const l = this.held[id]; return !!l && l.some((c) => this.keys.has(c)); }

  clearAll() {
    this.pinch = null;
    this.pads.stopRumble();
    this.keys.clear();
    Object.assign(this.kb, { pitch: 0, roll: 0, yaw: 0, collective: 0 });
    Object.assign(this.touch, { pitch: 0, roll: 0, yaw: 0, collective: 0, pour: false, doors: false, pump: false, reel: 0, bolt: false });
    this.centreMouse();
    this.pourBtn?.classList.remove('pressed');
    for (const s of this.sticks || []) s.release();
  }

  // Mouse drag (or a finger on open screen, away from the sticks) orbits the chase camera or, in the
  // cockpit, turns the pilot's head. The wheel zooms either. When the keyboard layout flies with the mouse,
  // a click captures the pointer instead: then the mouse flies, and the free-look key makes it look.
  // Zoom by mouse-wheel notches (+ out): the cockpit's field of view, or the chase camera's distance.
  zoomBy(n) {
    if (LOOK_MODES.has(this.viewMode)) this.look.zoom += n * 4;
    else this.camOrbit.zoom += n * 0.08;
  }

  bindCanvas(canvas) {
    this.canvas = canvas;
    const lookBy = (dx, dy, k) => {
      if (LOOK_MODES.has(this.viewMode)) { this.look.yaw -= dx * k; this.look.pitch -= dy * k; } else { this.camOrbit.yaw -= dx * 0.006; this.camOrbit.pitch += dy * 0.004; }
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        const code = `Mouse${e.button}`;
        if (this.kbCapture) { e.preventDefault(); this.finishCapture(code); return; }
        this.source = 'keyboard';
        // A click (not a drag) captures the mouse for flying; a drag still orbits the camera first.
        this.clickLock = this.mouseFlies && !this.locked && e.button === 0 && !this.menuMode && canvas.requestPointerLock ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
        const bind = this.kidx.get(code);
        if (bind) { this.keys.add(code); this.pressBind(bind, code, e.shiftKey); if (bind !== 'freeLook') return; }
        if (this.locked || e.button === 2) return;
      }
      // A second finger on the open screen pinches: zoom, as the mouse wheel does.
      if (this.dragging && this.dragging.touch && e.pointerType === 'touch' && !this.pinch) {
        this.pinch = { id: e.pointerId, x: e.clientX, y: e.clientY, d: Math.hypot(e.clientX - this.dragging.x, e.clientY - this.dragging.y) };
        capture(canvas, e.pointerId);
        return;
      }
      if (this.dragging) return;
      this.dragging = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse' };
      capture(canvas, e.pointerId);
      if (this.dragging.touch) {
        this.source = 'touch';
        // Double-tap the open screen to look ahead again.
        const now = e.timeStamp || performance.now(), t = this.lastOpenTap;
        if (t && now - t.at < DOUBLE_TAP && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 40) { this.actions.push('recenter'); this.lastOpenTap = null; } else this.lastOpenTap = { at: now, x: e.clientX, y: e.clientY };
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.locked && e.pointerType === 'mouse') {
        // Pointer-locked: raw movement flies, or looks while free look is held.
        if (this.isHeld('freeLook')) lookBy(e.movementX, e.movementY, 0.004);
        else if (!this.menuMode) this.mouseMove(e.movementX, e.movementY);
        return;
      }
      const pin = this.pinch;
      if (pin && this.dragging && (e.pointerId === pin.id || e.pointerId === this.dragging.id)) {
        const p = e.pointerId === pin.id ? pin : this.dragging;
        p.x = e.clientX; p.y = e.clientY;
        const d = Math.hypot(pin.x - this.dragging.x, pin.y - this.dragging.y);
        if (pin.d > 20 && d > 20) this.zoomBy(-Math.log(d / pin.d) / 0.15);   // a wheel notch per 15 % of spread
        pin.d = d;
        return;
      }
      if (!this.dragging || e.pointerId !== this.dragging.id) return;
      lookBy(e.clientX - this.dragging.x, e.clientY - this.dragging.y, this.dragging.touch ? 0.006 : 0.004);
      this.dragging.x = e.clientX; this.dragging.y = e.clientY;
    });
    const end = (e) => {
      if (this.pinch && (e.pointerId === this.pinch.id || (this.dragging && e.pointerId === this.dragging.id))) {
        // The finger left on the glass carries on as a drag, from where it is now.
        if (this.dragging && e.pointerId === this.dragging.id) this.dragging = { ...this.dragging, id: this.pinch.id, x: this.pinch.x, y: this.pinch.y };
        this.pinch = null;
        return;
      }
      if (this.dragging && e.pointerId === this.dragging.id) this.dragging = null;
      const c = this.clickLock;
      this.clickLock = null;
      if (c && e.type === 'pointerup' && !this.menuMode && Math.hypot(e.clientX - c.x, e.clientY - c.y) < 6 && performance.now() - c.t < 500) {
        this.wantLock = true;
        try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { this.wantLock = false; }); } catch { this.wantLock = false; }
      }
    };
    // A mouse button released over the HUD or outside the window still lets go (the GoPro on right mouse).
    window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.keys.delete(`Mouse${e.button}`); });
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.sign(e.deltaY));
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) {
        // Let go of the stick. Esc while flying releases the pointer before the page sees the key: pause.
        this.centreMouse();
        for (const k of [...this.keys]) if (k.startsWith('Mouse')) this.keys.delete(k);
        if (this.wantLock && !this.menuMode) this.actions.push('pause');
      }
      this.wantLock = this.locked;
    });
    document.addEventListener('pointerlockerror', () => { this.wantLock = false; });
  }

  // ---------------------------------------------------------------- touch
  // Twin floating sticks: a thumb lands anywhere in its half and that spot becomes the centre. Push past
  // the rim and the centre follows the thumb, so reversing is instant however far the thumb has wandered.
  // Which stick flies what is a layout (TOUCH_LAYOUTS); stick travel is a size (TOUCH_SIZES).
  buildTouch(root) {
    this.touchRoot = root;
    const mk = (cls) => {
      const zone = document.createElement('div');
      zone.className = `stick-zone ${cls}`;
      zone.innerHTML = '<div class="stick-base"><div class="stick-knob"></div></div><div class="stick-label"></div>';
      root.appendChild(zone);
      return zone;
    };
    const left = mk('left');
    const right = mk('right');
    const self = this;
    class Stick {
      constructor(zone, side) {
        this.zone = zone; this.side = side; this.base = zone.querySelector('.stick-base'); this.knob = zone.querySelector('.stick-knob');
        this.id = null; this.cx = 0; this.cy = 0; this.x = 0; this.y = 0;
        zone.addEventListener('pointerdown', (e) => this.start(e));
        zone.addEventListener('pointermove', (e) => this.move(e));
        zone.addEventListener('pointerup', (e) => this.end(e));
        zone.addEventListener('pointercancel', (e) => this.end(e));
        zone.addEventListener('lostpointercapture', (e) => this.end(e));
      }
      radius() { return Math.max(36, Math.min(TOUCH_SIZES[self.touchSize] || 64, this.zone.clientWidth * 0.3)); }
      start(e) {
        if (this.id !== null) return;
        e.preventDefault();
        this.id = e.pointerId;
        capture(this.zone, e.pointerId);
        this.cx = e.clientX; this.cy = e.clientY;
        this.place();
        this.zone.classList.add('active');
        self.source = 'touch';
        this.move(e);
      }
      place() {
        const r = this.zone.getBoundingClientRect();
        this.base.style.left = `${this.cx - r.left}px`;
        this.base.style.top = `${this.cy - r.top}px`;
      }
      move(e) {
        if (e.pointerId !== this.id) return;
        e.preventDefault();
        const R = this.radius();
        let dx = (e.clientX - this.cx) / R, dy = (e.clientY - this.cy) / R;
        const m = Math.hypot(dx, dy);
        if (m > 1) {
          dx /= m; dy /= m;
          // Leash: drag the centre along behind the thumb.
          this.cx = e.clientX - dx * R; this.cy = e.clientY - dy * R;
          this.place();
        }
        this.knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
        this.x = dx; this.y = -dy;
        self.applySticks();
      }
      end(e) { if (e.pointerId !== this.id) return; this.release(); }
      release() {
        this.id = null;
        this.knob.style.transform = 'translate(0px, 0px)';
        this.zone.classList.remove('active');
        this.base.style.left = this.base.style.top = '';
        this.x = this.y = 0;
        self.applySticks();
      }
    }
    this.sticks = [new Stick(left, 'left'), new Stick(right, 'right')];
    this.setTouchLayout(this.touchLayout, this.touchSize);
    const btn = (cls, html, action) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${cls}`;
      b.innerHTML = html;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.source = 'touch'; this.actions.push(action); b.classList.add('pressed'); buzz(8); });
      b.addEventListener('pointerup', () => b.classList.remove('pressed'));
      b.addEventListener('pointercancel', () => b.classList.remove('pressed'));
      root.appendChild(b);
      return b;
    };
    this.attachBtn = btn('attach', '<span class="ico">⚓</span><span class="lbl">Hook</span>', 'attach');
    this.attachLabel = this.attachBtn.querySelector('.lbl');
    // Held buttons; a double-tap fires a combo.
    const hold = (cls, html, set, combo) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${cls} hidden`;
      b.innerHTML = html;
      let last = 0;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); this.source = 'touch'; set(true); b.classList.add('pressed'); capture(b, e.pointerId); buzz(8);
        const now = e.timeStamp || performance.now();   // when the finger landed (see the keyboard combos)
        if (combo && now - last < DOUBLE_TAP) { this.actions.push(combo); last = 0; } else last = now;
      });
      const up = () => { set(false); b.classList.remove('pressed'); };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
      root.appendChild(b);
      return b;
    };
    // The GoPro, straight down, while held.
    this.boltBtn = hold('bolt', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="3"/><circle cx="12" cy="12" r="3.2"/></svg><span class="lbl">GoPro</span>', (v) => { this.touch.bolt = v; });
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

  // Which stick flies what, and how far a stick travels to full deflection.
  setTouchLayout(layout, size) {
    if (TOUCH_LAYOUTS[layout]) this.touchLayout = layout;
    if (TOUCH_SIZES[size]) this.touchSize = size;
    if (!this.sticks) return;
    const L = TOUCH_LAYOUTS[this.touchLayout];
    for (const s of this.sticks) {
      s.zone.querySelector('.stick-label').innerHTML = L[s.side].label.map((t) => `<span>${t}</span>`).join('');
      s.zone.dataset.axes = `${L[s.side].y} ${L[s.side].x}`;
    }
    this.touchRoot.style.setProperty('--stick-r', `${TOUCH_SIZES[this.touchSize]}px`);
    this.applySticks();
  }

  applySticks() {
    const L = TOUCH_LAYOUTS[this.touchLayout];
    const t = this.touch;
    t.pitch = t.roll = t.yaw = t.collective = 0;
    for (const s of this.sticks || []) {
      const m = L[s.side];
      t[m.x] = s.x; t[m.y] = s.y;
    }
  }

  // Which touch buttons fit the aircraft and cargo (called by the game each frame).
  setTouchMode(sky, carryingBucket) {
    if (!this.pourBtn) return;
    const mode = `${!!sky}:${!!carryingBucket}`;
    if (this.touchMode === mode) return;
    this.touchMode = mode;
    this.pourBtn.classList.toggle('hidden', !carryingBucket || sky);
    for (const b of Object.values(this.tankBtns)) b.classList.toggle('hidden', !sky);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const k = this.keys;
    const has = (l) => l.some((c) => k.has(c));
    const tgt = this.kbTgt || (this.kbTgt = { pitch: 0, roll: 0, yaw: 0, collective: 0 });
    tgt.pitch = tgt.roll = tgt.yaw = tgt.collective = 0;
    for (const f of this.kbFlight) if (has(f.keys)) tgt[f.axis] += f.dir;
    // Keys slew so taps give proportional, not bang-bang, inputs.
    for (const a of ['pitch', 'roll', 'yaw', 'collective']) {
      const t = tgt[a], c = this.kb[a];
      const rate = Math.abs(t) >= Math.abs(c) ? CFG.input.keyRise : CFG.input.keyFall;
      const step = rate * dt;
      this.kb[a] = Math.abs(t - c) < step ? t : c + Math.sign(t - c) * step;
    }
    this.pollGamepad(dt);
    this.pollHotas(dt);
    // Menus own the pointer: let it go while one is open.
    if (this.menuMode && this.locked) this.unlock();
    this.updateMouse(dt);
    const pick = (a) => {
      let best = 0;
      for (const v of [this.kb[a], this.gp[a], shape(this.touch[a]), this.mouseOut[a] || 0, this.ho[a]]) if (Math.abs(v) > Math.abs(best)) best = v;
      return best;
    };
    this.ctl.pitch = pick('pitch');
    this.ctl.roll = pick('roll');
    this.ctl.yaw = pick('yaw');
    this.ctl.collective = pick('collective');
    // A throttle used as the lever is the collective, whatever else is pushed (Assist off reads ctl.lever).
    this.ctl.lever = this.hotas.out.lever;
    if (this.ctl.lever !== null) this.ctl.collective = this.ho.collective;
    // Tank controls (skycrane). Keys and touch open the doors progressively while held; a trigger is direct.
    const sky = this.aircraft === 'skycrane';
    const S = CFG.skycrane.tank;
    const gHeld = this.isHeld('pour') || this.hotas.isHeld('pour');
    this.kbDoors = sky && gHeld ? Math.min(1, this.kbDoors + S.doorSlew * dt) : 0;
    this.touchDoors = sky && this.touch.doors ? Math.min(1, this.touchDoors + S.doorSlew * dt) : 0;
    this.ctl.doors = sky ? Math.max(this.kbDoors, this.touchDoors, this.pads.doors || 0) : 0;
    this.ctl.pump = sky ? Math.max(this.isHeld('pump') || this.hotas.isHeld('pump') ? 1 : 0, this.touch.pump ? 1 : 0, this.pads.pump || 0) : 0;
    const reel = (this.isHeld('reelOut') || this.hotas.isHeld('reelOut') ? 1 : 0) - (this.isHeld('reelIn') || this.hotas.isHeld('reelIn') ? 1 : 0) + this.touch.reel + (this.pads.reel || 0);
    this.ctl.reel = sky ? Math.max(-1, Math.min(1, reel)) : 0;
    // The bucket's valve: G / RB / Pour; on the skycrane its hook's bucket opens with the doors.
    this.ctl.pour = sky ? this.ctl.doors > 0.05 : gHeld || !!this.pads.pour || this.touch.pour;
    // Held camera buttons from the pad layout (the camera code reads these; keys and touch can add theirs).
    // The GoPro: the pad's boltCam binding (LT in the Aim presets), the keyboard's (B or right mouse) or touch GoPro.
    this.ctl.boltCam = this.pads.isHeld('boltCam') || this.isHeld('boltCam') || this.hotas.isHeld('boltCam') || this.touch.bolt;
    if (!this.enabled) {
      this.centreMouse(); this.ctl.pitch = this.ctl.roll = this.ctl.yaw = this.ctl.collective = 0; this.ctl.lever = null; this.ctl.pour = false; this.ctl.doors = this.ctl.pump = this.ctl.reel = 0; this.ctl.boltCam = false; }
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
      // Match the original 60 Hz response regardless of rendering speed.
      this.camOrbit.yaw += this.pads.cam.yaw * 1.8 * dt;
      this.camOrbit.zoom += this.pads.cam.zoom * 1.2 * dt;
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

  pollHotas(dt) {
    const H = this.hotas;
    const used = H.poll(dt, this.menuMode);
    const o = H.out;
    this.ho.pitch = o.pitch; this.ho.roll = o.roll; this.ho.yaw = o.yaw; this.ho.collective = o.collective;
    if (used) this.source = 'hotas';
    for (const e of H.takeEvents()) this.actions.push(e);
    for (const n of H.takeNotices()) this.notices.push(n);
    // The hat glances around the cockpit, or orbits and zooms the chase camera (sideways orbit while look is held).
    const c = H.cam;
    if (!c) return;
    if (LOOK_MODES.has(this.viewMode)) { this.look.yaw -= c.yaw * 1.5 * dt; this.look.pitch -= c.zoom * 1.1 * dt; }
    else if (c.look) { this.camOrbit.yaw -= c.yaw * 1.8 * dt; this.camOrbit.pitch -= c.zoom * 1.2 * dt; }
    else { this.camOrbit.yaw += c.yaw * 1.8 * dt; this.camOrbit.zoom += c.zoom * 1.2 * dt; }
  }

  takeLook() { const l = { ...this.look }; this.look.yaw = this.look.pitch = this.look.zoom = 0; return l; }

  takeActions() { const a = this.actions; this.actions = []; return a; }
  takeNotices() { const n = this.notices; this.notices = []; return n; }
}
