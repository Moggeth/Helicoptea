import { milkyTea, brewName } from '../render/water.js';
import { prettyName } from '../input/gamepad.js';
import {
  ACTIONS, ACTION, AXIS_LABEL, AXIS_SOURCES, BTN, FLIGHT_AXES, MAX_PER_ACTION, PRESETS, PRESET_ORDER, SOURCE_LABEL,
  activeAxes, activeButtons, buttonName, defaultLayout, describe, mappingOf, presetName,
} from '../input/layouts.js';
import { CAM_MODES, CAM_NAME } from '../render/cameraModes.js';
import { HOTAS_ACTIONS, HOTAS_AXES, HOTAS_AXIS_LABEL, MAX_HOTAS_BUTTONS } from '../input/hotas.js';
import {
  KB_ACTIONS, KB_FLIGHT, KB_PRESETS, KB_PRESET_ORDER, MAX_KEYS, MOUSE_MODES, MOUSE_MODE_LABEL, MOUSE_TARGETS, MOUSE_TARGET_LABEL,
  defaultKbLayout, describeKb, kbMappingOf, kbPresetName, keyName,
} from '../input/kbLayouts.js';
import { CFG } from '../config.js';
import { TOUCH_LAYOUTS, TOUCH_SIZES } from '../input/input.js';
import { controlSVG, sceneSVG } from './lessonCard.js';

// The assist-off lift stick: a sprung lever, or the old trim-and-hold collective (sim/collective.js).
const LIFT_MODES = [['spring', 'Springs back: hold up to climb'], ['hold', 'Stays put: trim and leave it']];
const liftSelect = (mode) => `<label class="opt">Lift stick, Assist off
            <select data-setting="collectiveMode" aria-label="Lift stick with Flight Assist off">
              ${LIFT_MODES.map(([v, nm]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${nm}</option>`).join('')}
            </select></label>`;

const ICONS = {
  restart: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>',
  view: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M10 5v14M14 5v14"/></svg>',
  cockpit: '<svg viewBox="0 0 24 24"><path d="M3 15c2-6 6-9 9-9s7 3 9 9"/><path d="M12 6v9"/><path d="M3 15h18"/><path d="M7 19h10"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
  replay: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 4v5h5"/><path d="m10 9 5 3-5 3z"/></svg>',
  chase: '<svg viewBox="0 0 24 24"><path d="M4 13h9l3-3h4"/><path d="M8 13v3h6"/><path d="M2 8h12"/><path d="M8 8v5"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="11" rx="2"/><path d="m16 11 5-3v9l-5-3"/><circle cx="9.5" cy="12.5" r="2.5"/></svg>',
};

const TOUCH_KEYS = { attach: '<kbd>Hook</kbd>', assist: 'the <b>Assist</b> switch (top left)', restart: '↻', pour: '<kbd>Pour</kbd>', doors: '<kbd>Doors</kbd>', salvo: 'double-tap <kbd>Doors</kbd>', pump: '<kbd>Pump</kbd>', autofill: 'double-tap <kbd>Pump</kbd>', reel: '<kbd>Hose ▲▼</kbd>' };

export class Hud {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.device = 'keyboard';
    root.innerHTML = `
      <div class="hud-tl">
        <button class="pill on" data-act="assist" aria-pressed="true"><span class="switch"></span><span><span class="full">Flight </span>Assist</span><span class="state">On</span><kbd class="kb">F</kbd></button>
        <div class="assist-invite">Steady hands? Try <b>Assist Off</b> for the real thing.</div>
      </div>
      <div class="hud-tr">
        <button class="icon-btn" data-act="restart" title="Restart flight (R)" aria-label="Restart flight">${ICONS.restart}<span class="key kb">R</span></button>
        <button class="icon-btn" data-act="view" title="Next camera (C)" aria-label="Next camera">${ICONS.camera}<span class="key kb">C</span></button>
        <button class="icon-btn" data-act="recenter" title="Recenter camera (U)" aria-label="Recenter camera">${ICONS.view}</button>
        <button class="icon-btn mark-btn" data-act="mark" title="Mark this moment for a flight note (N, gamepad R3)" aria-label="Mark this moment for a flight note">${ICONS.flag}<span class="key kb">N</span></button>
        <div class="sound-wrap" style="position:relative">
          <button class="icon-btn" data-act="sound" title="Sound (M to mute)" aria-label="Sound settings">${ICONS.sound}</button>
          <div class="vol-pop hidden"><button class="secondary" data-act="mute" style="padding:6px 10px">Mute</button><input type="range" min="0" max="1" step="0.01" aria-label="Volume" /></div>
        </div>
        <button class="icon-btn" data-act="help" title="Controls (H)" aria-label="Controls">${ICONS.help}</button>
        <button class="icon-btn" data-act="pause" title="Pause (Esc)" aria-label="Pause">${ICONS.menu}</button>
      </div>
      <div class="collective hidden" aria-hidden="true"><div class="lvl"></div><div class="mark"></div></div>
      <div class="collective-label hidden">Collective</div>
      <div class="hint"><span class="step">1</span><span class="txt"></span><button class="skip" data-act="skiphints">Skip tips</button></div>
      <div class="lesson" role="status" aria-live="polite"><div class="ls-art"><div class="ls-scene"></div><div class="ls-ctl"></div></div><div class="ls-words"><b class="ls-title"></b><span class="ls-sub"></span><span class="ls-bar off"><i></i></span></div><div class="ls-side"><button class="ls-end" data-act="endlesson" aria-label="End lesson" title="End lesson">✕</button><span class="ls-count"></span></div></div>
      <div class="prompt"></div>
      <div class="toast"></div>
      <div class="rotate-nudge">Turn sideways for the best view</div>
      <div class="crash">
        <h2>Ka-boom.</h2>
        <p class="why"></p>
        <div class="crash-row"><button class="primary" data-act="restart">Restart Flight <span class="kb-inline"></span></button><button class="secondary crash-replay" data-act="replay">${ICONS.replay}Watch replay</button></div>
      </div>
      <div class="loadcam hidden" aria-hidden="true"><span class="lc-name">HOOK CAM</span><span class="lc-read"></span></div>
      <div class="boltcam hidden" aria-hidden="true"><span class="bc-rec">REC <b>0:00</b></span><span class="bc-mount"></span><span class="bc-corner tl"></span><span class="bc-corner tr"></span><span class="bc-corner bl"></span><span class="bc-corner br"></span><span class="bc-ring"></span><span class="bc-read"></span></div>
      <div class="underwater hidden" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="mstick hidden" aria-hidden="true"><i></i></div>
      <div class="mouse-cta hidden">Click to fly with the mouse</div>
      <div class="fp-flash"></div>
      <div class="debug hidden"></div>
    `;
    this.q = (s) => root.querySelector(s);
    this.assistBtn = this.q('[data-act=assist]');
    this.invite = this.q('.assist-invite');
    this.hint = this.q('.hint');
    this.hintStep = this.hint.querySelector('.step');
    this.hintText = this.hint.querySelector('.txt');
    this.prompt = this.q('.prompt');
    this.toastEl = this.q('.toast');
    this.crashEl = this.q('.crash');
    this.debugEl = this.q('.debug');
    this.coll = this.q('.collective');
    this.collLabel = this.q('.collective-label');
    this.volPop = this.q('.vol-pop');
    this.vol = this.volPop.querySelector('input');
    this.chips = [];
    this.loadcam = this.q('.loadcam');
    this.loadRead = this.q('.lc-read');
    this.fpFlash = this.q('.fp-flash');
    this.viewBtn = this.q('[data-act=view]');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'sound') { this.volPop.classList.toggle('hidden'); return; }
      handlers.action(act);
      b.blur();
    });
    this.vol.addEventListener('input', () => handlers.volume(parseFloat(this.vol.value)));
    this.modal = document.createElement('div');
    this.modal.className = 'overlay';
    this.modal.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { handlers.action(b.dataset.act, b); return; }
      if (e.target === this.modal && this.modalKind === 'help') handlers.action('closehelp');
    });
    document.body.appendChild(this.modal);
    this.modalKind = null;
    this.toastT = 0;
  }

  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    for (const k of this.root.querySelectorAll('.kb')) k.style.display = d === 'keyboard' ? '' : 'none';
    this.refreshKeys();
  }

  // Called every frame by the hints: build only the table for the device in use, and the gamepad's only
  // when its layout changes (it copies the whole mapping).
  key(action) {
    const d = this.device;
    if (d === 'keyboard') return this.kbKeys()[action];
    if (d === 'hotas') return this.hotasKeys()[action];
    if (d === 'gamepad') {
      const L = this.pads ? this.pads.layout : null;
      if (!this._padKeys || this._padKeysFor !== L || this._padKeysPreset !== L?.preset || this._padKeysCustom !== L?.custom) {
        this._padKeys = this.padKeys(); this._padKeysFor = L; this._padKeysPreset = L?.preset; this._padKeysCustom = L?.custom;
      }
      return this._padKeys[action];
    }
    if (action === 'lift') return `the ${this.touchStick('collective')} stick up`;
    return TOUCH_KEYS[action];
  }

  // Which touch stick ('left' / 'right') flies an axis in the player's touch layout.
  touchStick(axis) {
    const L = TOUCH_LAYOUTS[this.touchLayoutOf ? this.touchLayoutOf() : 'classic'] || TOUCH_LAYOUTS.classic;
    return L.left.x === axis || L.left.y === axis ? 'left' : 'right';
  }

  // Keyboard prompts follow the player's keyboard layout (hud.input, set by the game).
  kbKeys() {
    const m = kbMappingOf(this.input ? this.input.kbLayout : defaultKbLayout());
    const k = (id) => (m.keys[id].length ? `<kbd>${keyName(m.keys[id][0])}</kbd>` : '<kbd>unbound</kbd>');
    return {
      lift: k('collUp'), attach: k('attach'), assist: k('assist'), restart: k('restart'), pour: k('pour'), doors: k('pour'), salvo: `double-tap ${k('pour')}`,
      pump: k('pump'), autofill: `double-tap ${k('pump')}`, reel: `${k('reelIn')} ${k('reelOut')}`,
      steer: m.mouse.x !== 'none' || m.mouse.y !== 'none'
        ? `Click the scene and the mouse flies (${['x', 'y'].filter((d) => m.mouse[d] !== 'none').map((d) => m.mouse[d]).join(' and ')}); ${k('yawLeft')} ${k('yawRight')} turn.`
        : `${k('pitchFwd')} ${k('pitchBack')} ${k('rollLeft')} ${k('rollRight')} tilt, ${k('yawLeft')} ${k('yawRight')} turn.`,
    };
  }

  // The mouse stick: a dot in a ring while the pointer is captured, or a nudge to click in.
  setMouse(v, flying) {
    if (!this.mstick) { this.mstick = this.q('.mstick'); this.mdot = this.mstick.querySelector('i'); this.mcta = this.q('.mouse-cta'); this.mlast = ''; }
    const show = !!v && flying && v.locked && !v.looking;
    this.mstick.classList.toggle('hidden', !show);
    this.mcta.classList.toggle('hidden', !(v && flying && !v.locked && this.device === 'keyboard'));
    if (!show) return;
    this.mstick.classList.toggle('stick', v.mode === 'stick');
    const t = `translate(${(v.x * 26).toFixed(1)}px, ${(-v.y * 26).toFixed(1)}px)`;
    if (t !== this.mlast) { this.mlast = t; this.mdot.style.transform = t; }
  }

  // Flight-stick prompts follow the HOTAS profile.
  hotasKeys() {
    const H = this.input?.hotas;
    const k = (id) => { const r = H?.profile.buttons[id]?.[0]; return r ? `<kbd>${H.refName(r)}</kbd>` : '<kbd>unbound</kbd>'; };
    return {
      lift: H?.profile.lift === 'lever' ? 'the throttle forward' : 'the throttle past half way', attach: k('attach'), assist: k('assist'), restart: k('restart'),
      pour: k('pour'), doors: k('pour'), salvo: `twice ${k('pour')}`, pump: k('pump'), autofill: '<kbd>unbound</kbd>', reel: `${k('reelIn')} ${k('reelOut')}`,
    };
  }

  // The guided flight's picture of a control on the device in use (ui/lessonCard.js draws it), from the
  // player's own bindings. what: liftUp, liftDown, tilt, yaw, attach, pour, assist, camera.
  lessonControl(what) {
    const d = this.device;
    if (d === 'touch') {
      const AX = { liftUp: ['collective', 'up'], liftDown: ['collective', 'down'], tilt: ['pitch', 'any'], yaw: ['yaw', 'x'] }[what];
      if (AX) return { type: 'stick', touch: true, side: this.touchStick(AX[0]), dir: AX[1] };
      return { attach: { type: 'button', label: 'Hook' }, pour: { type: 'button', label: 'Pour' }, assist: { type: 'button', label: 'Assist' }, camera: { type: 'button', icon: 'camera', label: '' } }[what] || null;
    }
    if (d === 'gamepad') {
      const m = this.pads ? mappingOf(this.pads.layout) : mappingOf(defaultLayout());
      const A = activeAxes(m, 'heli').axes;
      const stick = (src, dir) => (src === 'trig' ? { type: 'button', pad: true, label: dir === 'down' ? 'LT' : 'RT' } : src === 'none' || !src ? null
        : { type: 'stick', side: src[0] === 'l' ? 'left' : 'right', dir: dir === 'any' || dir === 'x' ? dir : src[1] === 'y' ? dir : 'x' });
      if (what === 'liftUp' || what === 'liftDown') return stick(A.collective, what === 'liftUp' ? 'up' : 'down');
      if (what === 'tilt') return stick(A.pitch, 'any');
      if (what === 'yaw') return stick(A.yaw, 'x');
      const b = activeButtons(m, 'heli')[{ attach: 'attach', pour: 'pour', assist: 'assist', camera: 'view' }[what]];
      return b && b.length ? { type: 'button', pad: true, label: buttonName(b[0]) } : null;
    }
    if (d === 'hotas') {
      if (what === 'liftUp' || what === 'liftDown') return { type: 'throttle', dir: what === 'liftUp' ? 'up' : 'down' };
      if (what === 'tilt' || what === 'yaw') return { type: 'joystick', dir: what === 'yaw' ? 'twist' : 'any' };
      const H = this.input?.hotas, r = H?.profile.buttons[what === 'camera' ? 'view' : what]?.[0];
      return r ? { type: 'button', label: H.refName(r) } : null;
    }
    // Keyboard and mouse, as the player's layout has them: the mouse when it flies that axis.
    const m = kbMappingOf(this.input ? this.input.kbLayout : defaultKbLayout());
    const k = (id) => (m.keys[id] && m.keys[id].length ? keyName(m.keys[id][0]) : null);
    const mouse = (axis) => m.mouse.x === axis || m.mouse.y === axis;
    if (what === 'liftUp' || what === 'liftDown') { const key = k(what === 'liftUp' ? 'collUp' : 'collDown'); return key ? { type: 'keys', keys: [key], hold: true } : null; }
    if (what === 'tilt') return mouse('pitch') || mouse('roll') ? { type: 'mouse', dir: 'any' } : { type: 'arrows', keys: ['pitchFwd', 'pitchBack', 'rollLeft', 'rollRight'].map((id) => k(id) || '?') };
    if (what === 'yaw') return mouse('yaw') ? { type: 'mouse', dir: 'x' } : { type: 'keys', keys: [k('yawLeft') || '?', k('yawRight') || '?'], hold: true };
    const key = k({ attach: 'attach', pour: 'pour', assist: 'assist', camera: 'camNext' }[what]);
    return key ? { type: 'keys', keys: [key], hold: what === 'pour' } : null;
  }

  // The guided flight's card. s: { n, total, scene, title, sub, ctl, progress } or null to hide it. The
  // pictures are rebuilt only when the step, its control or the device changes, so they loop undisturbed.
  showLesson(s) {
    const el = this.lessonEl || (this.lessonEl = this.q('.lesson'));
    if (!s) { if (el.classList.contains('show')) el.classList.remove('show'); return; }
    const art = `${s.scene}|${JSON.stringify(s.ctl)}`;
    if (this.lessonArt !== art) {
      this.lessonArt = art;
      el.querySelector('.ls-scene').innerHTML = sceneSVG(s.scene);
      const c = el.querySelector('.ls-ctl');
      c.innerHTML = controlSVG(s.ctl);
      c.classList.toggle('hidden', !s.ctl);
    }
    const set = (sel, v) => { const e = el.querySelector(sel); if (e.textContent !== v) e.textContent = v; };
    set('.ls-title', s.title);
    set('.ls-sub', s.sub || '');
    set('.ls-count', s.n ? `${s.n} / ${s.total}` : '');
    const bar = el.querySelector('.ls-bar');
    const p = s.progress ?? null;
    if ((p === null) !== bar.classList.contains('off')) bar.classList.toggle('off', p === null);
    if (p !== null) { const w = `${Math.round(p * 100)}%`; if (bar.firstChild.style.width !== w) bar.firstChild.style.width = w; }
    if (!el.classList.contains('show')) el.classList.add('show');
  }

  // A finished step: the card pops once.
  lessonDing() {
    const el = this.lessonEl || (this.lessonEl = this.q('.lesson'));
    el.classList.remove('ding'); void el.offsetWidth; el.classList.add('ding');
  }

  // First launch: offer the guided flight. Pad, keys and touch all reach the two buttons.
  openLesson() {
    this.modalKind = 'lesson';
    this.modal.innerHTML = `
      <div class="panel menu lesson-offer" role="dialog" aria-label="First flight lesson">
        <div class="ls-offer-art">${sceneSVG('lift')}</div>
        <h2>First flight?</h2>
        <p>Learn to fly, one step at a time.</p>
        <div class="row">
          <button class="primary" style="margin-top:0" data-act="tutorial">Show me</button>
          <button class="secondary" data-act="lessonno">Just fly</button>
        </div>
      </div>`;
    this.modal.classList.add('show');
  }

  // Gamepad prompts follow the player's layout (set via hud.pads by the game).
  padKeys() {
    const m = this.pads ? mappingOf(this.pads.layout) : mappingOf(defaultLayout());
    const kbd = (b) => `<kbd>${buttonName(b)}</kbd>`;
    const heli = activeButtons(m, 'heli'), tank = activeButtons(m, 'tank');
    const first = (l) => (l && l.length ? kbd(l[0]) : '<kbd>unbound</kbd>');
    const lift = activeAxes(m, 'heli').axes.collective;
    const liftKey = lift === 'trig' ? '<kbd>RT</kbd>' : lift === 'none' ? '<kbd>unbound</kbd>' : `<kbd>${lift[0] === 'l' ? 'L' : 'R'}-stick ${lift[1] === 'y' ? '↑' : '→'}</kbd>`;
    const digitalPump = (tank.pump || []).find((b) => b !== BTN.LT && b !== BTN.RT);
    return {
      lift: liftKey, attach: first(heli.attach), assist: first(heli.assist), restart: first(heli.restart), pour: first(heli.pour),
      doors: first(tank.doors), salvo: tank.doors.length ? kbd(tank.doors[0]) + kbd(tank.doors[0]) : '<kbd>unbound</kbd>', pump: first(tank.pump),
      autofill: digitalPump !== undefined ? kbd(digitalPump) + kbd(digitalPump) : (tank.reelIn.length && tank.reelOut.length ? `${kbd(tank.reelIn[0])}+${kbd(tank.reelOut[0])}` : '<kbd>unbound</kbd>'),
      reel: `${first(tank.reelIn)} ${first(tank.reelOut)}`,
    };
  }

  refreshKeys() {
    const m = kbMappingOf(this.input ? this.input.kbLayout : defaultKbLayout());
    for (const [sel, id] of [['[data-act=assist] .kb', 'assist'], ['[data-act=restart] .kb', 'restart'], ['[data-act=view] .kb', 'camNext'], ['[data-act=mark] .kb', 'mark']]) {
      const el = this.q(sel);
      if (el) el.textContent = m.keys[id].length ? keyName(m.keys[id][0]) : '';
    }
    const kb = this.q('.crash .kb-inline');
    kb.innerHTML = this.device === 'touch' ? '' : this.key('restart');
  }

  setAssist(on) {
    this.assistBtn.classList.toggle('on', on);
    this.assistBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.assistBtn.querySelector('.state').textContent = on ? 'On' : 'Off';
    this.coll.classList.toggle('hidden', on);
    this.collLabel.classList.toggle('hidden', on);
  }
  setViewMode(mode) {
    const fp = mode === 'cockpit';
    this.viewBtn.title = `Camera: ${CAM_NAME[mode] || mode}. Next camera (C)`;
    this.viewBtn.setAttribute('aria-label', `Camera: ${CAM_NAME[mode] || mode}. Next camera`);
    document.body.classList.toggle('fp', fp);
    document.body.dataset.cam = mode;
  }

  // The bolted GoPro: REC and a clock, the mount, corner marks, and a ring where the load would land.
  setBolt(o) {
    if (!this.boltEl) { this.boltEl = this.q('.boltcam'); this.boltRing = this.q('.bc-ring'); this.boltRec = this.q('.bc-rec b'); this.boltRead = this.q('.bc-read'); this.boltMount = this.q('.bc-mount'); }
    const el = this.boltEl;
    document.body.classList.toggle('bolt', !!o);
    if (!o) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const t = Math.floor(o.t);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (this.boltRec.textContent !== clock) this.boltRec.textContent = clock;
    if (this.boltRead.textContent !== o.text) this.boltRead.textContent = o.text;
    const mount = `GOPRO · ${o.mount}`;
    if (this.boltMount.textContent !== mount) this.boltMount.textContent = mount;
    this.boltRing.style.display = o.ring ? '' : 'none';
    if (o.ring) this.boltRing.style.transform = `translate(${Math.round(o.ring.x)}px, ${Math.round(o.ring.y)}px)`;
  }

  // Under the tea (or the milk): a tinted, wobbling vignette with bubbles going up past the lens.
  setUnder(u) {
    const el = this.q('.underwater');
    if (!u) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.dataset.kind = u.kind;
    el.style.setProperty('--uw', u.color);
  }

  // The hook-camera inset: a frame and a readout laid over the picture the renderer draws.
  setLoadCam(rect, text, name = 'HOOK CAM') {
    document.body.classList.toggle('pip-top', !!(rect && rect.top));
    if (!rect) { this.loadcam.classList.add('hidden'); return; }
    this.loadcam.classList.remove('hidden');
    if (rect.top) document.body.style.setProperty('--pip-bottom', `${rect.y + rect.s}px`);
    const st = this.loadcam.style;
    const v = `${rect.x}px|${rect.y}px|${rect.s}px`;
    if (this.loadcam.dataset.r !== v) {
      this.loadcam.dataset.r = v;
      st.left = `${rect.x}px`; st.top = `${rect.y}px`; st.width = `${rect.s}px`; st.height = `${rect.s}px`;
    }
    if (this.loadRead.textContent !== text) this.loadRead.textContent = text;
    const nm = this.loadcam.querySelector('.lc-name');
    if (nm.textContent !== name) nm.textContent = name;
  }

  // Plumb-line height readout, a small label beside the laser dot.
  setPlumb(r) {
    if (!this.plumbEl) {
      this.plumbEl = document.createElement('div');
      this.plumbEl.className = 'plumb-read hidden';
      this.root.appendChild(this.plumbEl);
    }
    const el = this.plumbEl;
    if (!r) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.style.transform = `translate(${Math.round(r.x + 10)}px, ${Math.round(r.y - 8)}px)`;
    if (el.textContent !== r.text) el.textContent = r.text;
  }

  flash(strength) {
    this.fpFlash.style.opacity = String(Math.max(0, Math.min(1, strength)));
  }

  setInvite(show) { this.invite.classList.toggle('hidden', !show); }

  // Skycrane tank gauge: milk level, door opening, pump/salvo/auto state.
  setTank(t) {
    if (!this.tankEl) {
      const el = this.tankEl = document.createElement('div');
      el.className = 'tank-gauge hidden';
      el.innerHTML = '<div class="tg-bar"><div class="tg-fill"></div><div class="tg-door"></div></div><div class="tg-txt"><b>Milk</b><span class="tg-pct"></span><span class="tg-state"></span></div>';
      this.root.appendChild(el);
    }
    const el = this.tankEl;
    el.classList.toggle('hidden', !t);
    if (!t) return;
    el.querySelector('.tg-fill').style.height = `${Math.round(t.fill * 100)}%`;
    el.querySelector('.tg-door').style.opacity = String(Math.min(1, t.doors * 1.5));
    el.querySelector('.tg-pct').textContent = `${Math.round(t.fill * 100)}%`;
    el.querySelector('.tg-state').textContent = t.state;
    el.classList.toggle('pumping', t.state === 'pumping' || t.state.startsWith('auto'));
  }

  setCollective(c, hoverEstimate) {
    this.coll.querySelector('.lvl').style.height = `${Math.round(c * 100)}%`;
    this.coll.querySelector('.mark').style.bottom = `${Math.round(hoverEstimate * 100)}%`;
  }

  showHint(step, html) {
    if (!html) { if (this.hint.classList.contains('show')) this.hint.classList.remove('show'); return; }
    // Keep the existing nodes while flying; content can still change within a step when devices change.
    if (this.hintStepValue !== step) { this.hintStep.textContent = step; this.hintStepValue = step; }
    if (this.hintHTML !== html) { this.hintText.innerHTML = html; this.hintHTML = html; }
    if (!this.hint.classList.contains('show')) this.hint.classList.add('show');
  }

  showPrompt(html) {
    if (html) { if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html; this.prompt.classList.add('show'); }
    else this.prompt.classList.remove('show');
  }

  toast(text, secs = 2.5) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = secs;
  }

  showCrash(reason, title = 'Ka-boom.') {
    this.crashEl.querySelector('h2').textContent = title;
    this.crashEl.querySelector('.why').textContent = reason || '';
    this.refreshKeys();
    this.crashEl.classList.add('show');
  }
  hideCrash() { this.crashEl.classList.remove('show'); if (this.crashEl.contains(document.activeElement)) document.activeElement.blur(); }

  setVolume(v, muted) {
    this.vol.value = String(v);
    this.q('[data-act=sound]').innerHTML = (muted ? ICONS.mute : ICONS.sound);
    this.volPop.querySelector('[data-act=mute]').textContent = muted ? 'Unmute' : 'Mute';
  }

  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
  }

  // Subtle brew chips: only while a bag is steeping in that cup (and shortly after).
  updateBrew(cupScreen, steepTimers) {
    while (this.chips.length < cupScreen.length) {
      const el = document.createElement('div');
      el.className = 'brew-chip';
      el.innerHTML = '<span class="dot"></span><span class="nm"></span>';
      this.root.appendChild(el);
      this.chips.push(el);
    }
    cupScreen.forEach((c, i) => {
      const el = this.chips[i];
      const show = c.visible && steepTimers[i] > 0;
      el.classList.toggle('show', show);
      if (!show) return;
      el.style.left = `${c.x}px`; el.style.top = `${c.y}px`;
      const col = milkyTea(c.cup.brew, c.cup.milk || 0);
      el.querySelector('.dot').style.background = `rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`;
      const m = c.cup.milk || 0;
      el.querySelector('.nm').textContent = brewName(c.cup.brew) + (m > 0.2 ? ', very milky' : m > 0.07 ? ', milky' : m > 0.015 ? ', splash of milk' : '');
    });
  }

  setDebug(text) {
    if (text === null) { this.debugEl.classList.add('hidden'); return; }
    this.debugEl.classList.remove('hidden');
    this.debugEl.textContent = text;
  }

  // ---------------------------------------------------------------- modals
  openPause(opts) {
    this.modalKind = 'pause';
    this.modal.innerHTML = `
      <div class="panel menu" role="dialog" aria-label="Paused">
        <h2>Paused</h2>
        <p>The kettle can wait.</p>
        <div class="row">
          <button class="primary" style="margin-top:0" data-act="resume">Resume</button>
          <button class="secondary" data-act="restart">Restart flight</button>
          <button class="secondary" data-act="reset">Reset sandbox</button>
          <button class="secondary" data-act="replay">Flight replay</button>
          <button class="secondary" data-act="tutorial">${opts.lesson ? 'End guided flight' : 'Guided first flight'}</button>
        </div>
        ${opts.touch ? `<div class="row stack touch-opts">
          <label class="opt">Sticks
            <select data-setting="touchLayout" aria-label="Touch stick layout">
              ${Object.entries(TOUCH_LAYOUTS).map(([id, l]) => `<option value="${id}" ${opts.touchLayout === id ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select></label>
          <label class="opt">Stick size
            <select data-setting="touchSize" aria-label="Touch stick size">
              ${Object.keys(TOUCH_SIZES).map((id) => `<option value="${id}" ${opts.touchSize === id ? 'selected' : ''}>${id[0].toUpperCase() + id.slice(1)}${id === 'small' ? ': quick' : id === 'large' ? ': fine' : ''}</option>`).join('')}
            </select></label>
          ${liftSelect(opts.collectiveMode)}
          ${opts.fullscreen === null || opts.fullscreen === undefined ? '' : `<label class="opt">Full screen <input type="checkbox" data-setting="fullscreen" ${opts.fullscreen ? 'checked' : ''}/></label>`}
          ${opts.homeScreenTip ? '<div class="opt home-tip">Full screen <small>Share → Add to Home Screen, then open it from there</small></div>' : ''}
          ${opts.haptics === null || opts.haptics === undefined ? '' : `<label class="opt">Vibration <input type="checkbox" data-setting="haptics" ${opts.haptics ? 'checked' : ''}/></label>`}
          <label class="opt">Battery saver <small class="opt-note">30 fps</small><input type="checkbox" data-setting="batterySaver" ${opts.batterySaver ? 'checked' : ''}/></label>
          <label class="opt">Sound <span class="weight-row"><input type="range" min="0" max="1" step="0.01" value="${opts.muted ? 0 : opts.volume}" data-setting="volume" aria-label="Volume" /></span></label>
          <div class="opt aircraft-row" role="radiogroup" aria-label="Aircraft">Aircraft
            <span>${[['micro', 'Micro'], ['chinook', 'Chinook'], ['skycrane', 'Skycrane']].map(([id, nm]) => `<button class="secondary${opts.aircraft === id ? ' on' : ''}" role="radio" aria-checked="${opts.aircraft === id}" data-act="aircraft" data-id="${id}">${nm}</button>`).join(' ')}</span></div>
          <div class="opt touch-links"><button class="secondary" data-act="help">Controls</button><button class="secondary" data-act="markNow">⚑ Mark this moment</button></div>
        </div>` : ''}
        <details class="more" ${opts.touch ? '' : 'open'}><summary>${opts.touch ? 'More settings' : 'Settings'}</summary>
        <div class="row stack">
          <label class="opt">Graphics quality
            <select data-setting="quality">
              ${['auto', 'ultra', 'high', 'medium', 'low'].map((q) => `<option value="${q}" ${opts.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
            </select></label>
          <label class="opt">World weight <span class="weight-row"><small>light</small><input type="range" min="0" max="1" step="0.05" value="${opts.weight ?? 0.75}" data-setting="weight" aria-label="World weight" /><small>heavy</small></span></label>
          <label class="opt">Debug overlay <input type="checkbox" data-setting="debug" ${opts.debug ? 'checked' : ''}/></label>
          <label class="opt">Controls and remapping <button class="secondary" style="padding:6px 12px" data-act="controller">Settings</button></label>
          ${opts.touch ? '' : `<label class="opt">Keyboard and mouse
            <select data-setting="kbPreset" aria-label="Keyboard and mouse scheme">
              ${[...KB_PRESET_ORDER.map((id) => [id, KB_PRESETS[id].name]), ...(this.input?.kbLayout.custom ? [['custom', 'Custom (yours)']] : [])].map(([id, nm]) => `<option value="${id}" ${this.input?.kbLayout.preset === id ? 'selected' : ''}>${nm}</option>`).join('')}
            </select></label>`}
          ${opts.touch ? '' : liftSelect(opts.collectiveMode)}
          <label class="opt">Flight tuning <button class="secondary" style="padding:6px 12px" data-act="tuning">Open board</button></label>
          <label class="opt">Show tips again <button class="secondary" style="padding:6px 12px" data-act="resethints">Replay</button></label>
          <div class="opt aircraft-row cam-row" role="radiogroup" aria-label="Camera">Camera
            <span>${CAM_MODES.map(({ id, name, blurb }) => `<button class="secondary${opts.view === id ? ' on' : ''}" style="padding:6px 12px" role="radio" aria-checked="${opts.view === id}" title="${blurb}" data-act="view" data-id="${id}">${name}</button>`).join(' ')}</span></div>
          <div class="opt aircraft-row cam-row" role="group" aria-label="Cameras in the C / L3 cycle">In the <kbd>C</kbd> / L3 cycle
            <span>${CAM_MODES.map(({ id, name }) => { const on = (opts.camCycle || []).includes(id); return `<button class="secondary chk${on ? ' on' : ''}" style="padding:6px 12px" aria-pressed="${on}" data-act="camcycle" data-id="${id}">${name}</button>`; }).join(' ')}</span></div>
          <label class="opt">Speed feel <span class="weight-row"><small>rigid</small><input type="range" min="0" max="1" step="0.05" value="${opts.camFeel ?? 0.5}" data-setting="camFeel" aria-label="Speed feel on the locked and nose cameras" /><small>lots</small></span></label>
          <label class="opt">Cockpit field of view <span class="weight-row"><small>${opts.fpFov}°</small><input type="range" min="60" max="110" step="1" value="${opts.fpFov}" data-setting="fpFov" aria-label="Cockpit field of view" /></span></label>
          <label class="opt">Head motion <span class="weight-row"><small>off</small><input type="range" min="0" max="1" step="0.05" value="${opts.fpMotion}" data-setting="fpMotion" aria-label="Head motion in the cockpit" /><small>lots</small></span></label>
          <label class="opt">Rotor vibration <span class="weight-row"><small>off</small><input type="range" min="0" max="1" step="0.05" value="${opts.fpVibration}" data-setting="fpVibration" aria-label="Rotor vibration in the cockpit" /><small>lots</small></span></label>
          <label class="opt">Hook camera
            <select data-setting="loadCam">
              ${[['auto', 'In the cockpit'], ['always', 'Always'], ['off', 'Off']].map(([v, nm]) => `<option value="${v}" ${opts.loadCam === v ? 'selected' : ''}>${nm}</option>`).join('')}
            </select></label>
          ${[['shadows', 'Load shadows'], ['plumb', 'Plumb line and height'], ['cupHint', 'Glint when over a cup'], ['dipCam', 'Close-in camera over a cup']].map(([k, nm]) => `<label class="opt">${nm} <input type="checkbox" data-cue="${k}" ${opts.cues && opts.cues[k] ? 'checked' : ''}/></label>`).join('')}
          <label class="opt">Rotor strikes break the blades <input type="checkbox" data-setting="rotorStrikes" ${opts.rotorStrikes !== false ? 'checked' : ''}/></label>
          <label class="opt">Frame rate readout <kbd>F2</kbd> <input type="checkbox" data-setting="fpsMeter" ${opts.fpsMeter ? 'checked' : ''}/></label>
          ${opts.touch ? '' : `<div class="opt aircraft-row" role="radiogroup" aria-label="Aircraft">Aircraft
            <span>${[['micro', 'Micro heli'], ['chinook', 'Chinook'], ['skycrane', 'Skycrane']].map(([id, nm]) => `<button class="secondary${opts.aircraft === id ? ' on' : ''}" style="padding:6px 12px" role="radio" aria-checked="${opts.aircraft === id}" data-act="aircraft" data-id="${id}">${nm}</button>`).join(' ')}</span></div>`}
        </div>
        <p class="help-note">Reset sandbox clears every cup and bag. Restart flight keeps your brewing. Switching aircraft starts a fresh flight on the pad. Quality changes reload the page. With rotor strikes off, blades pass through scenery instead of breaking. Every flight is recorded: <b>Flight replay</b> plays it back with its telemetry, ${opts.touch ? 'with the notes you add there or the moments you mark here.' : 'and notes you add there (or marks you drop in flight with <kbd>N</kbd>) are saved to <code>logs/flights</code>.'}</p>
        </details>
      </div>`;
    this.modal.querySelector('[data-setting=quality]').addEventListener('change', (e) => this.h.setting('quality', e.target.value));
    this.modal.querySelector('[data-setting=debug]').addEventListener('change', (e) => this.h.setting('debug', e.target.checked));
    this.modal.querySelector('[data-setting=fpsMeter]').addEventListener('change', (e) => this.h.setting('fpsMeter', e.target.checked));
    this.modal.querySelector('[data-setting=rotorStrikes]').addEventListener('change', (e) => this.h.setting('rotorStrikes', e.target.checked));
    this.modal.querySelector('[data-setting=weight]').addEventListener('input', (e) => this.h.setting('weight', parseFloat(e.target.value)));
    for (const k of ['fpMotion', 'fpVibration', 'fpFov', 'camFeel']) {
      const el = this.modal.querySelector(`[data-setting=${k}]`);
      el.addEventListener('input', () => {
        this.h.setting(k, parseFloat(el.value));
        if (k === 'fpFov') el.previousElementSibling.textContent = `${el.value}°`;
      });
    }
    this.modal.querySelector('[data-setting=loadCam]').addEventListener('change', (e) => this.h.setting('loadCam', e.target.value));
    this.modal.querySelector('[data-setting=collectiveMode]').addEventListener('change', (e) => this.h.setting('collectiveMode', e.target.value));
    this.modal.querySelector('[data-setting=kbPreset]')?.addEventListener('change', (e) => { this.input?.chooseKbPreset(e.target.value); this.refreshKeys(); });
    for (const el of this.modal.querySelectorAll('[data-cue]')) el.addEventListener('change', () => this.h.setting(`cue.${el.dataset.cue}`, el.checked));
    for (const k of ['touchLayout', 'touchSize']) this.modal.querySelector(`[data-setting=${k}]`)?.addEventListener('change', (e) => this.h.setting(k, e.target.value));
    this.modal.querySelector('[data-setting=batterySaver]')?.addEventListener('change', (e) => this.h.setting('batterySaver', e.target.checked));
    this.modal.querySelector('[data-setting=haptics]')?.addEventListener('change', (e) => this.h.setting('haptics', e.target.checked));
    this.modal.querySelector('[data-setting=fullscreen]')?.addEventListener('change', (e) => this.h.setting('fullscreen', e.target.checked));
    this.modal.querySelector('[data-setting=volume]')?.addEventListener('input', (e) => this.h.volume(parseFloat(e.target.value)));
    this.modal.classList.add('show');
    this.focusFirst();
  }

  openHelp() {
    this.modalKind = 'help';
    const tab = this.device;
    this.modal.innerHTML = `
      <div class="panel menu" role="dialog" aria-label="Controls">
        <h2>Controls</h2>
        <div class="help-tabs">
          ${[['keyboard', 'Keyboard'], ['gamepad', 'Gamepad'], ['hotas', 'Flight stick'], ['touch', 'Touch']].map(([t, nm]) => `<button data-act="helptab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${nm}</button>`).join('')}
        </div>
        <dl class="help-grid">${this.helpRows(tab)}</dl>
        <p class="help-note"><b>Collective</b> works the same on every device. With Flight Assist on it sets a climb or sink speed: let go to hold
        your height, and the heli levels itself when you centre the cyclic. With Assist off the lift stick is a sprung lever: hold it up to climb,
        let go and you settle gently, pull it down to come down faster (the bar on the left shows the collective, with a hover mark). The heli stays
        tilted until you correct it. Prefer a collective that stays where you leave it? Pick <b>Stays put</b> under Lift stick in Pause or Controller settings.</p>
        <div class="row"><button class="primary" style="margin-top:0" data-act="closehelp">Got it</button><button class="secondary" data-act="controller">Controller settings</button></div>
      </div>`;
    this.modal.classList.add('show');
    this.focusFirst();
  }

  helpRows(tab) {
    const R = {
      keyboard: this.kbHelpRows(),
      gamepad: this.padHelpRows(),
      hotas: this.hotasHelpRows(),
      touch: this.touchHelpRows(),
    };
    return R[tab].map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('');
  }

  touchHelpRows() {
    const L = TOUCH_LAYOUTS[this.touchLayoutOf ? this.touchLayoutOf() : 'classic'] || TOUCH_LAYOUTS.classic;
    const AX = { collective: ['more lift', 'less lift'], yaw: ['turn right', 'turn left'], pitch: ['nose down (forward)', 'nose up (back)'], roll: ['tilt right', 'tilt left'] };
    const stick = (side) => {
      const m = L[side];
      if (m.y === 'pitch' && m.x === 'roll') return 'Cyclic: tilt in any direction';
      return `Up / down: ${AX[m.y][0]} / ${AX[m.y][1]}. Left / right: ${AX[m.x][1]} / ${AX[m.x][0]}`;
    };
    return [['Left thumb', stick('left')], ['Right thumb', stick('right')],
      ['', 'Put a thumb down anywhere in its half of the screen: that spot is the centre. Slide past the rim and the centre follows you. Pick another layout or stick size in Pause.'],
      ['<kbd>Hook</kbd>', 'Hook / release (glows when a loop is in reach)'], ['<kbd>Pour</kbd> (hold)', 'Pour milk (appears while you carry the bucket); double-tap latches it open'], ['<kbd>Doors</kbd> (hold)', 'Skycrane belly doors, opening wider as you hold; double-tap = salvo'], ['<kbd>Pump</kbd> (hold)', 'Skycrane pump; double-tap = auto-fill'], ['<kbd>Hose ▲</kbd> <kbd>Hose ▼</kbd>', 'Reel the snorkel in / out'],
      ['<kbd>GoPro</kbd> (hold)', 'Bolted camera looking straight down'], ['Assist switch (top left)', 'Flight Assist on / off'], ['Camera icon (top right)', 'Next camera'], ['Drag the open screen', 'Look around in the cockpit, or orbit the chase camera'], ['Double-tap the open screen', 'Look ahead again'], ['↻ (top right)', 'Restart flight'], ['‖ (top right)', 'Pause: sticks, sound, aircraft, cameras, mark a moment']];
  }

  // The keyboard sheet, like the gamepad's, is written from the layout in force.
  kbHelpRows() {
    const layout = this.input ? this.input.kbLayout : defaultKbLayout();
    const keys = (l) => l.map((k) => `<kbd>${k}</kbd>`).join(' ');
    return [
      ['Scheme', `${kbPresetName(layout)} (change it in Pause or Controls and remapping)`],
      ...describeKb(layout).map((r) => [keys(r.keys), r.label]),
      ['<kbd>Shift</kbd>+restart', 'Reset sandbox'],
      ['<kbd>1</kbd>', 'Cockpit and back. Drag the mouse to look around, wheel to zoom'], ['<kbd>2</kbd>–<kbd>7</kbd>', 'Chase, locked chase, nose cam, orbit, tripod, cargo cam'],
      ['<kbd>Home</kbd>', 'Recenter camera or look ahead'], ['<kbd>M</kbd>', 'Mute'], ['<kbd>Esc</kbd> / <kbd>P</kbd>', 'Pause (Esc also lets go of the mouse)'], ['<kbd>H</kbd>', 'This sheet'], ['<kbd>F2</kbd>', 'Frame rate readout'], ['<kbd>`</kbd>', 'Debug overlay'],
    ];
  }

  hotasHelpRows() {
    const H = this.input?.hotas;
    if (!H) return [];
    const P = H.profile;
    const ax = (a) => (P.axes[a] ? `${H.devName(P.axes[a].dev)} axis ${P.axes[a].index + 1}` : 'unbound');
    const rows = [
      ['Stick', `Tilt (${ax('roll')}, ${ax('pitch')}). Twist to turn (${ax('yaw')})`],
      ['Throttle', P.lift === 'lever' ? 'Is the collective: where you leave it is the lift. With Assist on, the middle holds height' : 'Lift like the pad\'s lift stick: past half way climbs, below sinks (Lift stick setting applies)'],
      ['Hat', 'Orbit and zoom the camera; glance around in the cockpit'],
    ];
    for (const A of HOTAS_ACTIONS) if (P.buttons[A.id].length) rows.push([P.buttons[A.id].map((r) => `<kbd>${H.refName(r)}</kbd>`).join(' '), A.label]);
    rows.push(['', `${P.taught ? 'Taught on your device.' : 'X56 defaults, not yet taught: if a control does the wrong thing, use Teach in Controls → Flight stick.'} Chrome and Edge only see a stick after you press one of its buttons.`]);
    return rows;
  }

  // The gamepad sheet is written from the layout in force, so it is always true to the player's setup.
  padHelpRows() {
    const layout = this.pads ? this.pads.layout : defaultLayout();
    const keys = (l) => l.map((b) => `<kbd>${b}</kbd>`).join(' ');
    const heli = describe(layout, 'heli'), tank = describe(layout, 'tank');
    const rows = [['Layout', `${presetName(layout)} (change it in Controller settings)`]];
    for (const a of heli.axes) rows.push([a.sourceLabel, `${a.label}${a.inverted ? ', inverted' : ''}`]);
    const skip = new Set(['camLeft', 'camRight', 'zoomIn', 'zoomOut']);
    for (const b of heli.buttons) if (!skip.has(b.id)) rows.push([keys(b.buttons), b.label]);
    const heliKeys = Object.fromEntries(heli.buttons.map((b) => [b.id, b.buttons.join()]));
    const tankRows = tank.buttons.filter((b) => !skip.has(b.id) && heliKeys[b.id] !== b.buttons.join());
    for (const b of tankRows) rows.push([`Skycrane ${keys(b.buttons)}`, b.label.replace(/^Skycrane: /, '')]);
    for (const a of tank.axes) if (a.source !== heli.axes.find((x) => x.axis === a.axis).source) rows.push([`Skycrane ${a.sourceLabel}`, `${a.label} (the triggers run the tank)`]);
    const cam = (heli.buttons.filter((b) => skip.has(b.id)).flatMap((b) => b.buttons));
    if (cam.length) rows.push([keys([...new Set(cam)]), 'Orbit and zoom camera; in the cockpit, glance around']);
    rows.push(['Hold the view button + right stick', 'Look around (the right stick stops flying while you look)']);
    rows.push(['After a crash', '<kbd>A</kbd> also restarts'], ['In menus', 'D-pad or left stick to move, <kbd>A</kbd> select, <kbd>B</kbd> back, ◀ ▶ adjust sliders and switch layouts']);
    return rows;
  }

  setHelpTab(tab) {
    this.modal.querySelectorAll('.help-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.modal.querySelector('.help-grid').innerHTML = this.helpRows(tab);
  }

  closeModal() { this.modal.classList.remove('show'); this.modalKind = null; document.activeElement?.blur?.(); }

  // ---------------------------------------------------------------- controller settings
  openController(pads, tab = this.device === 'gamepad' || this.device === 'hotas' ? this.device : 'keyboard') {
    this.modalKind = 'controller';
    this.pads = pads;
    this.ctlTab = tab;
    const S = pads.settings;
    const slider = (key, label, min, max, step) => `<label class="opt">${label}<input type="range" data-pad="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}" /></label>`;
    const check = (key, label) => `<label class="opt">${label}<input type="checkbox" data-pad="${key}" ${S[key] ? 'checked' : ''} /></label>`;
    this.modal.innerHTML = `
      <div class="panel menu pad-panel" role="dialog" aria-label="Controls and remapping">
        <h2>Controls</h2>
        <div class="help-tabs ctl-tabs">
          ${[['keyboard', 'Keyboard and mouse'], ['gamepad', 'Gamepad'], ['hotas', 'Flight stick']].map(([t, nm]) => `<button data-act="ctltab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${nm}</button>`).join('')}
        </div>
        <div class="kb-tab ${tab === 'keyboard' ? '' : 'hidden'}">
          <div class="kb-capture hidden" role="status"><p class="kb-prompt"></p><div class="row"><button class="secondary" data-kb="capcancel">Cancel</button></div></div>
          <div class="kb-layout kb-settings"></div>
          <div class="row stack kb-settings">${liftSelect(CFG.collective.mode)}</div>
          <div class="row kb-settings"><button class="primary" style="margin-top:0" data-act="closecontroller">Done</button></div>
        </div>
        <div class="ho-tab ${tab === 'hotas' ? '' : 'hidden'}">
          <div class="ho-teach hidden" role="status"><p class="wz-step"></p><p class="ho-prompt"></p><div class="row"><button class="secondary" data-ho="skip">Skip this one</button><button class="secondary" data-ho="cancel">Cancel</button></div></div>
          <div class="ho-body"></div>
          <div class="row ho-settings"><button class="primary" style="margin-top:0" data-act="closecontroller">Done</button></div>
        </div>
        <div class="pad-tab ${tab === 'gamepad' ? '' : 'hidden'}">
        <div class="pad-list"></div>
        <div class="pad-test" aria-hidden="true">
          <div class="pad-stick"><div class="dot l"></div><span class="lbl-l"></span></div>
          <div class="pad-stick"><div class="dot r"></div><span class="lbl-r"></span></div>
          <div class="pad-raw"></div>
        </div>
        <div class="pad-wizard hidden"><p class="wz-step"></p><p class="wz-prompt"></p><div class="row"><button class="secondary" data-act="wizskip">Skip this one</button><button class="secondary" data-act="wizcancel">Cancel</button></div></div>
        <div class="pad-capture hidden" role="status"><p class="wz-prompt"></p><div class="row"><button class="secondary" data-lay="capcancel">Cancel</button></div></div>
        <div class="pad-layout pad-settings"></div>
        <div class="row stack pad-settings">
          <h3 class="pad-h">Feel</h3>
          ${slider('deadZone', 'Stick dead zone', 0, 0.4, 0.01)}
          ${slider('expo', 'Fine control near centre', 0, 0.9, 0.05)}
          ${slider('cyclic', 'Tilt sensitivity', 0.3, 1.5, 0.05)}
          ${slider('collective', 'Lift sensitivity', 0.3, 1.5, 0.05)}
          ${slider('yaw', 'Turn sensitivity', 0.3, 1.5, 0.05)}
          ${check('triggers', 'Free triggers add lift')}
          ${check('rumble', 'Rumble')}
          ${liftSelect(CFG.collective.mode)}
        </div>
        <div class="row pad-actions">
          <button class="primary" style="margin-top:0" data-act="closecontroller">Done</button>
          <button class="secondary" data-act="padbind">Teach it an odd pad…</button>
          <button class="secondary" data-act="padreset">Forget pad wiring</button>
          <button class="secondary" data-act="padrumble">Test rumble</button>
        </div>
        <p class="help-note pad-note">Using a <b>Steam Controller</b>? Browsers only see it as a gamepad through Steam Input: add your browser to Steam as a Non-Steam Game with the <b>Gamepad</b> layout and open Helicoptea from there (steps in the README). If it appears above as a standard layout it just works; otherwise use <b>Teach it an odd pad…</b>, which only tells the game where each stick and button is; the layout above decides what they do.</p>
        </div>
      </div>`;
    this.modal.querySelectorAll('[data-pad]').forEach((el) => {
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        S[el.dataset.pad] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
        pads.saveSettings();
      });
    });
    for (const el of this.modal.querySelectorAll('[data-setting=collectiveMode]')) {
      el.addEventListener('change', (e) => { this.h.setting('collectiveMode', e.target.value); for (const o of this.modal.querySelectorAll('[data-setting=collectiveMode]')) o.value = e.target.value; });
    }
    this.modal.querySelector('.pad-capture [data-lay=capcancel]').addEventListener('click', () => pads.cancelCapture());
    this.modal.querySelector('.kb-capture [data-kb=capcancel]').addEventListener('click', () => this.input?.cancelKbCapture());
    this.renderLayout();
    this.renderKb();
    this.renderHotas();
    this.modal.classList.add('show');
    this.updateController();
    this.focusFirst();
  }

  setCtlTab(tab) {
    if (this.modalKind !== 'controller') return;
    this.input?.cancelKbCapture();
    if (this.pads?.capture) this.pads.cancelCapture();
    this.ctlTab = tab;
    this.modal.querySelectorAll('.ctl-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.modal.querySelector('.kb-tab').classList.toggle('hidden', tab !== 'keyboard');
    this.modal.querySelector('.pad-tab').classList.toggle('hidden', tab !== 'gamepad');
    this.modal.querySelector('.ho-tab').classList.toggle('hidden', tab !== 'hotas');
    if (tab !== 'hotas' && this.input) { this.input.hotas.cancelTeach(); this.input.hotas.cancelCapture(); }
  }

  // ---------------------------------------------------------------- flight stick / HOTAS
  renderHotas(focusKey) {
    const H = this.input?.hotas;
    const box = this.modal.querySelector('.ho-body');
    if (!box || !H) return;
    const P = H.profile;
    const axRow = (a) => {
      const r = P.axes[a];
      return `<div class="opt lay-btn ho-axis"><span>${HOTAS_AXIS_LABEL[a]}<small class="ho-src">${r ? `${H.devName(r.dev)}, axis ${r.index + 1}${r.sign < 0 ? ', reversed' : ''}` : 'unbound'}</small></span>
        <span class="ho-meter" data-axis="${a}"><i></i></span>
        <span class="chips"><button class="secondary" data-ho="teach1" data-axis="${a}" data-key="ht-${a}">Teach</button><button class="secondary" data-ho="flip" data-axis="${a}" data-key="hf-${a}" ${r ? '' : 'disabled'}>Reverse</button></span></div>`;
    };
    const chips = (A) => {
      const list = P.buttons[A.id];
      const c = list.map((r, i) => `<span class="chip"><button class="secondary" data-ho="rebind" data-id="${A.id}" data-slot="${i}" data-key="hb-${A.id}-${i}">${H.refName(r)}</button><button class="secondary x" data-ho="unbind" data-id="${A.id}" data-slot="${i}" data-key="hx-${A.id}-${i}" aria-label="Remove ${H.refName(r)} from ${A.label}">×</button></span>`);
      if (list.length < MAX_HOTAS_BUTTONS) c.push(`<button class="secondary add" data-ho="rebind" data-id="${A.id}" data-key="hadd-${A.id}" aria-label="Add a button for ${A.label}">+</button>`);
      return c.join('');
    };
    const slider = (k, label, min, max, step) => `<label class="opt">${label}<input type="range" data-ho="num" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${P[k]}" /></label>`;
    box.innerHTML = `
      <div class="ho-list"></div>
      <p class="help-note">${P.taught ? 'Taught on your stick.' : 'Set up for the <b>X56</b> as a first guess. Press <b>Teach all</b> and move each control once to set it exactly; any stick and throttle works the same way.'} Chrome and Edge only show a stick after you press one of its buttons.</p>
      <div class="row"><button class="primary" style="margin-top:0" data-ho="teach" data-key="hteach">Teach all</button><button class="secondary" data-ho="reset" data-key="hreset">Back to X56 defaults</button></div>
      <h3 class="pad-h">Axes</h3>
      ${HOTAS_AXES.map(axRow).join('')}
      <label class="opt">Throttle as lift
        <select data-ho="lift" data-key="hlift" aria-label="Throttle as lift">
          <option value="spring" ${P.lift === 'spring' ? 'selected' : ''}>Like the lift stick: middle of its travel is centre</option>
          <option value="lever" ${P.lift === 'lever' ? 'selected' : ''}>A real collective: where you leave it is the lift</option>
        </select></label>
      <p class="help-note">As a real collective, the throttle position is the collective with Assist off, so it stays where you put it. With Assist on, the middle of its travel holds height.</p>
      <h3 class="pad-h">Feel</h3>
      ${slider('deadZone', 'Dead zone', 0, 0.2, 0.01)}
      ${slider('expo', 'Fine control near centre', 0, 0.9, 0.05)}
      ${slider('cyclic', 'Tilt sensitivity', 0.3, 1.5, 0.05)}
      ${slider('yaw', 'Turn sensitivity', 0.3, 1.5, 0.05)}
      <h3 class="pad-h">Buttons</h3>
      ${HOTAS_ACTIONS.map((A) => `<div class="opt lay-btn"><span>${A.label}</span><span class="chips">${chips(A)}</span></div>`).join('')}
      <p class="help-note">The hat orbits and zooms the camera, or glances around in the cockpit. A button can only do one thing: choosing one that is in use moves it.</p>`;
    const again = (key) => { this.renderHotas(key); };
    const teachView = (v) => {
      const t = this.modal.querySelector('.ho-teach');
      const others = this.modal.querySelectorAll('.ho-body, .ho-settings');
      if (!v || v.done) { t.classList.add('hidden'); others.forEach((e) => e.classList.remove('hidden')); if (v && v.done) this.toast('Flight stick set up'); again('hteach'); return; }
      t.classList.remove('hidden'); others.forEach((e) => e.classList.add('hidden'));
      t.querySelector('.wz-step').textContent = v.total > 1 ? `Step ${v.step} of ${v.total}` : '';
      t.querySelector('.ho-prompt').innerHTML = v.prompt;
    };
    const none = () => this.toast('Press a button on your stick or throttle first so the browser can see it');
    box.querySelector('[data-ho=teach]').addEventListener('click', () => { if (!H.startTeach(teachView)) none(); });
    box.querySelector('[data-ho=reset]').addEventListener('click', () => { H.resetProfile(); again('hreset'); });
    box.querySelector('[data-ho=lift]').addEventListener('change', (e) => { H.setProfile({ ...H.profile, lift: e.target.value }); });
    for (const el of box.querySelectorAll('[data-ho=num]')) el.addEventListener('input', () => H.setProfile({ ...H.profile, [el.dataset.k]: parseFloat(el.value) }));
    for (const el of box.querySelectorAll('[data-ho=teach1]')) el.addEventListener('click', () => { if (!H.startTeach(teachView, el.dataset.axis)) none(); });
    for (const el of box.querySelectorAll('[data-ho=flip]')) el.addEventListener('click', () => { H.flip(el.dataset.axis); again(el.dataset.key); });
    for (const el of box.querySelectorAll('[data-ho=unbind]')) el.addEventListener('click', () => { H.unbind(el.dataset.id, H.profile.buttons[el.dataset.id][+el.dataset.slot]); again(`hadd-${el.dataset.id}`); });
    for (const el of box.querySelectorAll('[data-ho=rebind]')) {
      el.addEventListener('click', () => {
        const id = el.dataset.id, slot = el.dataset.slot !== undefined ? +el.dataset.slot : null;
        const ok = H.startCapture((ref) => { teachView(null); if (ref) H.bind(id, ref, slot); again(el.dataset.key); });
        if (!ok) { none(); return; }
        teachView({ step: 1, total: 1, prompt: `Press the stick or throttle button for <b>${HOTAS_ACTIONS.find((a) => a.id === id).label}</b><br><small>or wait a few seconds to cancel</small>` });
      });
    }
    const t = this.modal.querySelector('.ho-teach');
    t.querySelector('[data-ho=skip]').onclick = () => H.skipTeach();
    t.querySelector('[data-ho=cancel]').onclick = () => { H.cancelTeach(); H.cancelCapture(); };
    if (focusKey) this.focusKey(focusKey);
  }

  // Live: the devices the browser sees and where each axis sits.
  updateHotas() {
    const H = this.input?.hotas;
    const el = this.modal.querySelector('.ho-list');
    if (!H || !el || this.ctlTab !== 'hotas') return;
    const html = H.devices.length
      ? H.devices.map((g) => `<div class="pad-item on"><b>${H.devName(g.id)}</b><span>${g.axes.length} axes · ${g.buttons.length} buttons</span><small>${g.id}</small></div>`).join('')
      : '<div class="pad-item"><b>No flight stick seen yet</b><span>Plug it in and press one of its buttons: browsers hide sticks until then.</span></div>';
    if (el.innerHTML !== html) el.innerHTML = html;
    const P = H.profile;
    for (const m of this.modal.querySelectorAll('.ho-meter')) {
      const r = P.axes[m.dataset.axis];
      const g = r && H.resolve(r.dev);
      const v = g && Number.isFinite(g.axes[r.index]) ? g.axes[r.index] * r.sign : 0;
      m.firstElementChild.style.transform = `translateX(${(v * 50).toFixed(1)}%)`;
    }
  }

  // ---------------------------------------------------------------- keyboard and mouse: schemes, mouse, keys
  renderKb(focusKey) {
    const inp = this.input;
    const box = this.modal.querySelector('.kb-layout');
    if (!box || !inp) return;
    const L = inp.kbLayout, m = kbMappingOf(L);
    const opts = [...KB_PRESET_ORDER.map((id) => [id, KB_PRESETS[id].name]), ...(L.custom ? [['custom', 'Custom (yours)']] : [])];
    const blurb = L.preset === 'custom' ? 'Your own scheme. Pick a preset to start again from it; yours stays in this list.' : KB_PRESETS[L.preset].blurb;
    const sel = (key, attrs, list, cur, labels) => `<select ${attrs} data-key="${key}">${list.map((v) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${labels[v]}</option>`).join('')}</select>`;
    const chips = (B) => {
      const list = m.keys[B.id];
      const c = list.map((k, i) => `<span class="chip"><button class="secondary" data-kb="rebind" data-id="${B.id}" data-slot="${i}" data-key="k-${B.id}-${i}" title="Change">${keyName(k)}</button><button class="secondary x" data-kb="unbind" data-id="${B.id}" data-code="${k}" data-key="kx-${B.id}-${i}" aria-label="Remove ${keyName(k)} from ${B.label}">×</button></span>`);
      if (list.length < MAX_KEYS) c.push(`<button class="secondary add" data-kb="rebind" data-id="${B.id}" data-key="kadd-${B.id}" aria-label="Add a key for ${B.label}">+</button>`);
      return c.join('');
    };
    const group = (title, list) => `<h3 class="pad-h">${title}</h3>${list.map((B) => `<div class="opt lay-btn"><span>${B.label}</span><span class="chips">${chips(B)}</span></div>`).join('')}`;
    const flies = m.mouse.x !== 'none' || m.mouse.y !== 'none';
    box.innerHTML = `
      <h3 class="pad-h">Scheme</h3>
      <label class="opt">Preset <select data-kb="preset" data-key="kpreset" aria-label="Keyboard and mouse scheme">${opts.map(([id, nm]) => `<option value="${id}" ${L.preset === id ? 'selected' : ''}>${nm}</option>`).join('')}</select></label>
      <p class="help-note lay-blurb">${blurb}</p>
      <h3 class="pad-h">Mouse</h3>
      <label class="opt">Mouse ↔ ${sel('mx', 'data-kb="maxis" data-dir="x" aria-label="Mouse left and right"', MOUSE_TARGETS, m.mouse.x, MOUSE_TARGET_LABEL)}</label>
      <label class="opt">Mouse ↕ ${sel('my', 'data-kb="maxis" data-dir="y" aria-label="Mouse forward and back"', MOUSE_TARGETS, m.mouse.y, MOUSE_TARGET_LABEL)}</label>
      <label class="opt">Mouse feel ${sel('mmode', 'data-kb="mmode" aria-label="Mouse feel"', MOUSE_MODES, m.mouse.mode, MOUSE_MODE_LABEL)}</label>
      <label class="opt">Mouse sensitivity <span class="weight-row"><small>fine</small><input type="range" min="0.2" max="3" step="0.05" value="${L.mouseSens}" data-kb="sens" data-key="ksens" aria-label="Mouse sensitivity" /><small>quick</small></span></label>
      <label class="opt">Invert mouse ↕ (pull back to dip the nose) <input type="checkbox" data-kb="inv" data-key="kinv" ${L.invertMouse ? 'checked' : ''} /></label>
      <p class="help-note">${flies ? 'Click the scene to start flying with the mouse; <kbd>Esc</kbd> lets it go and pauses. <b>Moves the nose</b>: each movement is a push that springs back, so how far you move is how far it rotates, and with Assist off the rotation carries on until you stop it. With Assist on, mouse tilt stays where you leave it. <b>Virtual stick</b>: the mouse position is the stick, drawn as a dot in a ring.' : 'The mouse does not fly in this scheme: drag to orbit the camera.'}</p>
      ${group('Flying', KB_FLIGHT)}
      ${group('Actions', KB_ACTIONS)}
      <p class="help-note">Choosing a key that already does something else moves it: the other job takes your old key if it would be left with none. Mouse buttons work too. <kbd>Esc</kbd>, <kbd>P</kbd>, <kbd>H</kbd>, <kbd>M</kbd>, <kbd>Shift</kbd>, the F keys and the camera digits <kbd>1</kbd>–<kbd>7</kbd> stay as they are.</p>`;
    const after = (notes, key) => { if (notes && notes.length) this.toast(notes.join('. '), 3.5); this.renderKb(key); this.refreshKeys(); };
    box.querySelector('[data-kb=preset]').addEventListener('change', (e) => { inp.chooseKbPreset(e.target.value); after([], 'kpreset'); });
    for (const el of box.querySelectorAll('[data-kb=maxis]')) el.addEventListener('change', () => after(inp.setMouseAxis(el.dataset.dir, el.value), el.dataset.key));
    box.querySelector('[data-kb=mmode]').addEventListener('change', (e) => after(inp.setMouseMode(e.target.value), 'mmode'));
    box.querySelector('[data-kb=sens]').addEventListener('change', (e) => inp.setMouseFeel('mouseSens', parseFloat(e.target.value)));
    box.querySelector('[data-kb=inv]').addEventListener('change', (e) => inp.setMouseFeel('invertMouse', e.target.checked));
    for (const el of box.querySelectorAll('[data-kb=unbind]')) el.addEventListener('click', () => after(inp.unbindKey(el.dataset.id, el.dataset.code), `kadd-${el.dataset.id}`));
    for (const el of box.querySelectorAll('[data-kb=rebind]')) {
      el.addEventListener('click', () => {
        const id = el.dataset.id, slot = el.dataset.slot !== undefined ? +el.dataset.slot : null;
        // Wait a beat so this click is not taken as the new binding.
        setTimeout(() => {
          inp.startKbCapture((res) => {
            this.showKbCapture(null);
            if (res) after(inp.bindKey(id, res.code, slot), el.dataset.key);
            else this.focusKey(el.dataset.key);
          });
          this.showKbCapture(`Press the key or mouse button for <b>${[...KB_FLIGHT, ...KB_ACTIONS].find((b) => b.id === id).label}</b>`);
        }, 120);
      });
    }
    if (focusKey) this.focusKey(focusKey);
  }

  showKbCapture(html) {
    const c = this.modal.querySelector('.kb-capture');
    if (!c) return;
    c.classList.toggle('hidden', !html);
    this.modal.querySelectorAll('.kb-settings').forEach((e) => e.classList.toggle('hidden', !!html));
    if (html) c.querySelector(".kb-prompt").innerHTML = `${html}<br><small><kbd>Esc</kbd> or wait a few seconds to cancel</small>`;
  }

  // ---------------------------------------------------------------- layout: presets, sticks, buttons
  renderLayout(focusKey) {
    const pads = this.pads;
    const box = this.modal.querySelector('.pad-layout');
    if (!box || !pads) return;
    const L = pads.layout, m = mappingOf(L);
    const preset = L.preset;
    const opts = [...PRESET_ORDER.map((id) => [id, PRESETS[id].name]), ...(L.custom ? [['custom', 'Custom (yours)']] : [])];
    const blurb = preset === 'custom' ? 'Your own layout. Pick a preset to start again from it; your custom layout stays in this list.' : PRESETS[preset].blurb;
    const axisRow = (a) => `<label class="opt">${AXIS_LABEL[a]}
        <span class="lay-axis"><select data-lay="axis" data-axis="${a}" data-key="axis-${a}" aria-label="${AXIS_LABEL[a]}">${AXIS_SOURCES.map((s) => `<option value="${s}" ${m.axes[a] === s ? 'selected' : ''}>${SOURCE_LABEL[s]}</option>`).join('')}</select>
        <span class="lay-inv"><input type="checkbox" data-lay="invert" data-axis="${a}" data-key="inv-${a}" ${L.invert[a] ? 'checked' : ''} aria-label="Invert ${AXIS_LABEL[a]}" />inv</span></span></label>`;
    const tankAxes = activeAxes(m, 'tank').axes;
    const tankNote = FLIGHT_AXES.filter((a) => tankAxes[a] !== m.axes[a]).map((a) => `${AXIS_LABEL[a]} moves to ${SOURCE_LABEL[tankAxes[a]]} on the skycrane, where the triggers run the tank.`).join(' ');
    const chips = (A) => {
      const list = m.buttons[A.id];
      const c = list.map((b, i) => `<span class="chip"><button class="secondary" data-lay="rebind" data-action="${A.id}" data-slot="${i}" data-key="b-${A.id}-${i}" title="Change">${buttonName(b)}</button><button class="secondary x" data-lay="unbind" data-action="${A.id}" data-button="${b}" data-key="x-${A.id}-${i}" aria-label="Remove ${buttonName(b)} from ${A.label}">×</button></span>`);
      if (list.length < MAX_PER_ACTION) c.push(`<button class="secondary add" data-lay="rebind" data-action="${A.id}" data-key="add-${A.id}" aria-label="Add a button for ${A.label}">+</button>`);
      return c.join('');
    };
    const group = (title, filter) => `<h3 class="pad-h">${title}</h3>${ACTIONS.filter(filter).map((A) => `<div class="opt lay-btn"><span>${A.label.replace(/^Skycrane: (.)/, (_, c) => c.toUpperCase())}</span><span class="chips">${chips(A)}</span></div>`).join('')}`;
    box.innerHTML = `
      <h3 class="pad-h">Layout</h3>
      <label class="opt">Preset <select data-lay="preset" data-key="preset" aria-label="Controller layout preset">${opts.map(([id, nm]) => `<option value="${id}" ${preset === id ? 'selected' : ''}>${nm}</option>`).join('')}</select></label>
      <p class="help-note lay-blurb">${blurb}</p>
      <label class="opt">Invert pitch (stick up raises the nose) <input type="checkbox" data-lay="invert" data-axis="pitch" data-key="inv-main" ${L.invert.pitch ? 'checked' : ''} /></label>
      <h3 class="pad-h">Sticks and triggers</h3>
      ${FLIGHT_AXES.map(axisRow).join('')}
      ${tankNote ? `<p class="help-note">${tankNote}</p>` : ''}
      ${group('Buttons', (A) => A.ctx !== 'tank')}
      ${group('Skycrane', (A) => A.ctx === 'tank')}
      <p class="help-note">Choosing a button that already does something else in the same aircraft moves it: the other action takes your old button if it would be left with none. Skycrane buttons override the general ones while you fly the skycrane. Menus always use <kbd>A</kbd>, <kbd>B</kbd> and the d-pad.</p>`;
    const after = (notes, key) => { if (notes && notes.length) this.toast(notes.join('. '), 3.5); this.renderLayout(key); };
    box.querySelector('[data-lay=preset]').addEventListener('change', (e) => { pads.choosePreset(e.target.value); after([], 'preset'); });
    for (const el of box.querySelectorAll('[data-lay=axis]')) el.addEventListener('change', () => after(pads.setAxis(el.dataset.axis, el.value), el.dataset.key));
    for (const el of box.querySelectorAll('[data-lay=invert]')) el.addEventListener('change', () => { pads.setInvert(el.dataset.axis, el.checked); after([], el.dataset.key); });
    for (const el of box.querySelectorAll('[data-lay=unbind]')) el.addEventListener('click', () => after(pads.unbind(el.dataset.action, +el.dataset.button), `add-${el.dataset.action}`));
    for (const el of box.querySelectorAll('[data-lay=rebind]')) {
      el.addEventListener('click', () => {
        const id = el.dataset.action, slot = el.dataset.slot !== undefined ? +el.dataset.slot : null;
        const ok = pads.startCapture('button', (res) => {
          this.showCapture(null);
          if (res) after(pads.bind(id, res.button, slot), el.dataset.key);
          else this.focusKey(el.dataset.key);
        });
        if (!ok) { this.toast('Press any button on your controller first so the browser can see it'); return; }
        this.showCapture(`Press the controller button for <b>${ACTION[id].label}</b>`);
      });
    }
    this.updateStickLabels();
    if (focusKey) this.focusKey(focusKey);
  }

  focusKey(key) {
    const el = this.modal.querySelector(`[data-key="${key}"]`);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView?.({ block: 'nearest' }); }
  }

  showCapture(html) {
    const c = this.modal.querySelector('.pad-capture');
    if (!c) return;
    const others = this.modal.querySelectorAll('.pad-settings, .pad-actions');
    c.classList.toggle('hidden', !html);
    others.forEach((e) => e.classList.toggle('hidden', !!html));
    if (html) c.querySelector('.wz-prompt').innerHTML = `${html}<br><small>or wait a few seconds to cancel</small>`;
  }

  updateStickLabels() {
    const L = this.pads.layout, m = mappingOf(L);
    const on = (side) => FLIGHT_AXES.filter((a) => m.axes[a][0] === side).map((a) => `${{ collective: 'Lift', yaw: 'Turn', pitch: 'Pitch', roll: 'Roll' }[a]} ${m.axes[a][1] === 'y' ? '↕' : '↔'}`).join(' · ') || 'unused';
    this.modal.querySelector('.lbl-l').textContent = on('l');
    this.modal.querySelector('.lbl-r').textContent = on('r');
  }

  showWizard(view) {
    const wz = this.modal.querySelector('.pad-wizard');
    if (!wz) return;
    const others = this.modal.querySelectorAll('.pad-settings, .pad-actions');
    if (!view || view.done) {
      wz.classList.add('hidden');
      others.forEach((e) => e.classList.remove('hidden'));
      if (view && view.done) this.toast(`Saved binding for ${prettyName(view.id)}`);
      this.focusFirst();
      return;
    }
    if (this.ctlTab !== 'gamepad') this.setCtlTab('gamepad');
    wz.classList.remove('hidden');
    others.forEach((e) => e.classList.add('hidden'));
    wz.querySelector('.wz-step').textContent = `Step ${view.step} of ${view.total}`;
    wz.querySelector('.wz-prompt').innerHTML = view.prompt;
  }

  updateController() {
    if (this.modalKind !== 'controller' || !this.pads) return;
    this.updateHotas();
    const pads = this.pads;
    const list = pads.list();
    const el = this.modal.querySelector('.pad-list');
    const html = list.length
      ? list.map((g) => `<div class="pad-item ${g.index === pads.activeIndex ? 'on' : ''}"><b>${prettyName(g.id)}</b><span>${g.mapping === 'standard' && !pads.isCustom(g) ? 'standard layout, ready' : (pads.isCustom(g) ? 'custom wiring' : 'unknown layout: press Teach it an odd pad…')}${g.vibrationActuator ? ' · rumble' : ''}</span><small>${g.id}</small></div>`).join('')
      : '<div class="pad-item"><b>No controller detected</b><span>Connect one and press any of its buttons: browsers hide controllers until then.</span></div>';
    if (el.innerHTML !== html) el.innerHTML = html;
    const s = pads.sticks, r = pads.raw;
    const place = (sel, x, y) => { const d = this.modal.querySelector(sel); if (d) d.style.transform = `translate(${x * 26}px, ${-y * 26}px)`; };
    place('.dot.l', s.lx, s.ly);
    place('.dot.r', s.rx, s.ry);
    const raw = this.modal.querySelector('.pad-raw');
    if (raw) raw.textContent = r ? `axes ${r.axes.map((a) => a.toFixed(2)).join(' ')}\nbuttons ${r.buttons.map((b, i) => (b > 0.05 ? i : null)).filter((x) => x !== null).join(' ') || 'none pressed'}` : '';
  }

  // ---------------------------------------------------------------- menu navigation (gamepad)
  navContainer() {
    if (this.modal.classList.contains('show')) return this.modal;
    if (this.crashEl.classList.contains('show')) return this.crashEl;
    const load = document.getElementById('loading');
    if (load && load.classList.contains('show') && !load.classList.contains('fade')) return load;
    return null;
  }

  focusables(c) {
    return [...c.querySelectorAll('button, input, select')].filter((e) => e.offsetParent !== null && !e.disabled && !e.closest('.hidden'));
  }

  focusFirst() {
    const c = this.navContainer();
    if (!c) return;
    const f = this.focusables(c);
    if (f[0]) f[0].focus({ preventScroll: true });
  }

  nav(dir) {
    const c = this.navContainer();
    if (!c) return;
    const f = this.focusables(c);
    if (!f.length) return;
    let i = f.indexOf(document.activeElement);
    const cur = f[i];
    if ((dir === 'left' || dir === 'right') && cur) {
      const d = dir === 'right' ? 1 : -1;
      if (cur.type === 'range') { cur.value = String(parseFloat(cur.value) + d * parseFloat(cur.step || 0.05)); cur.dispatchEvent(new Event('input')); return; }
      if (cur.tagName === 'SELECT') { cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + d)); cur.dispatchEvent(new Event('change')); return; }
    }
    const step = dir === 'up' || dir === 'left' ? -1 : 1;
    i = i < 0 ? 0 : (i + step + f.length) % f.length;
    f[i].focus();
    f[i].scrollIntoView?.({ block: 'nearest' });
  }

  confirm() {
    const c = this.navContainer();
    if (!c) return false;
    let el = document.activeElement;
    if (!el || !c.contains(el)) { this.focusFirst(); el = document.activeElement; if (!el || !c.contains(el)) return false; }
    if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); return true; }
    if (el.type === 'range' || el.tagName === 'SELECT') return true;
    el.click();
    return true;
  }
}
