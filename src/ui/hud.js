import { milkyTea, brewName } from '../render/water.js';
import { prettyName } from '../input/gamepad.js';
import {
  ACTIONS, ACTION, AXIS_LABEL, AXIS_SOURCES, BTN, FLIGHT_AXES, MAX_PER_ACTION, PRESETS, PRESET_ORDER, SOURCE_LABEL,
  activeAxes, activeButtons, buttonName, defaultLayout, describe, mappingOf, presetName,
} from '../input/layouts.js';
import { CAM_MODES, CAM_NAME } from '../render/cameraModes.js';
import { CFG } from '../config.js';

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
        <div style="position:relative">
          <button class="icon-btn" data-act="sound" title="Sound (M to mute)" aria-label="Sound settings">${ICONS.sound}</button>
          <div class="vol-pop hidden"><button class="secondary" data-act="mute" style="padding:6px 10px">Mute</button><input type="range" min="0" max="1" step="0.01" aria-label="Volume" /></div>
        </div>
        <button class="icon-btn" data-act="help" title="Controls (H)" aria-label="Controls">${ICONS.help}</button>
        <button class="icon-btn" data-act="pause" title="Pause (Esc)" aria-label="Pause">${ICONS.menu}</button>
      </div>
      <div class="collective hidden" aria-hidden="true"><div class="lvl"></div><div class="mark"></div></div>
      <div class="collective-label hidden">Collective</div>
      <div class="hint"><span class="step">1</span><span class="txt"></span><button class="skip" data-act="skiphints">Skip tips</button></div>
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

  key(action) {
    const d = this.device;
    const K = {
      keyboard: { lift: '<kbd>W</kbd>', attach: '<kbd>Space</kbd>', assist: '<kbd>F</kbd>', restart: '<kbd>R</kbd>', pour: '<kbd>G</kbd>', doors: '<kbd>G</kbd>', salvo: 'double-tap <kbd>G</kbd>', pump: '<kbd>T</kbd>', autofill: 'double-tap <kbd>T</kbd>', reel: '<kbd>Z</kbd> <kbd>X</kbd>' },
      gamepad: this.padKeys(),
      touch: { lift: 'left stick ↑', attach: '<kbd>Hook</kbd>', assist: '<kbd>Assist</kbd>', restart: '↻', pour: '<kbd>Pour</kbd>', doors: '<kbd>Doors</kbd>', salvo: 'double-tap <kbd>Doors</kbd>', pump: '<kbd>Pump</kbd>', autofill: 'double-tap <kbd>Pump</kbd>', reel: '<kbd>Hose ▲▼</kbd>' },
    };
    return K[d][action];
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
        </div>
        <div class="row stack">
          <label class="opt">Graphics quality
            <select data-setting="quality">
              ${['auto', 'ultra', 'high', 'medium', 'low'].map((q) => `<option value="${q}" ${opts.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
            </select></label>
          <label class="opt">World weight <span class="weight-row"><small>light</small><input type="range" min="0" max="1" step="0.05" value="${opts.weight ?? 0.75}" data-setting="weight" aria-label="World weight" /><small>heavy</small></span></label>
          <label class="opt">Debug overlay <input type="checkbox" data-setting="debug" ${opts.debug ? 'checked' : ''}/></label>
          <label class="opt">Controller <button class="secondary" style="padding:6px 12px" data-act="controller">Settings</button></label>
          ${liftSelect(opts.collectiveMode)}
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
          <div class="opt aircraft-row" role="radiogroup" aria-label="Aircraft">Aircraft
            <span>${[['micro', 'Micro heli'], ['chinook', 'Chinook'], ['skycrane', 'Skycrane']].map(([id, nm]) => `<button class="secondary${opts.aircraft === id ? ' on' : ''}" style="padding:6px 12px" role="radio" aria-checked="${opts.aircraft === id}" data-act="aircraft" data-id="${id}">${nm}</button>`).join(' ')}</span></div>
        </div>
        <p class="help-note">Reset sandbox clears every cup and bag. Restart flight keeps your brewing. Switching aircraft starts a fresh flight on the pad. Quality changes reload the page. With rotor strikes off, blades pass through scenery instead of breaking. Every flight is recorded: <b>Flight replay</b> plays it back with its telemetry, and notes you add there (or marks you drop in flight with <kbd>N</kbd>) are saved to <code>logs/flights</code>.</p>
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
    for (const el of this.modal.querySelectorAll('[data-cue]')) el.addEventListener('change', () => this.h.setting(`cue.${el.dataset.cue}`, el.checked));
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
          ${['keyboard', 'gamepad', 'touch'].map((t) => `<button data-act="helptab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
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
      keyboard: [['<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>', 'Cyclic: tilt forward, back and sideways (or I J K L)'], ['<kbd>W</kbd><kbd>S</kbd>', 'Collective: more / less lift'], ['<kbd>A</kbd><kbd>D</kbd>', 'Yaw: turn left / right'],
        ['<kbd>Space</kbd>', 'Hook a bag or the milk bucket / release it (the Chinook has three hooks: Space drops them all)'], ['<kbd>G</kbd> (hold)', 'Pour milk: the bucket\'s valve, or the skycrane\'s belly doors (they open wider the longer you hold)'], ['Double-tap <kbd>G</kbd> or <kbd>Shift</kbd>+<kbd>G</kbd>', 'Salvo: dump the lot (latches the doors or the bucket valve open; again to close)'], ['<kbd>T</kbd> (hold)', 'Skycrane: pump milk up the snorkel (only with the intake under the surface)'], ['Double-tap <kbd>T</kbd> or <kbd>Shift</kbd>+<kbd>T</kbd>', 'Skycrane auto-fill: reel down, pump until full, reel up (any hose or pump key takes over)'], ['<kbd>Z</kbd> / <kbd>X</kbd> (hold)', 'Skycrane: reel the snorkel in / out'], ['<kbd>V</kbd>', 'Switch aircraft: micro heli / Chinook / skycrane'], ['<kbd>F</kbd>', 'Flight Assist on / off'], ['<kbd>R</kbd>', 'Restart flight'], ['<kbd>Shift</kbd>+<kbd>R</kbd>', 'Reset sandbox'],
        ['<kbd>C</kbd> / <kbd>Shift</kbd>+<kbd>C</kbd>', 'Next / previous camera: chase, cockpit, locked chase, nose cam, tripod, cargo cam (pick which in Pause)'], ['<kbd>1</kbd>', 'Cockpit and back. In the cockpit, drag the mouse to look around, wheel to zoom'], ['<kbd>2</kbd>–<kbd>7</kbd>', 'Chase, locked chase, nose cam, orbit, tripod, cargo cam'], ['<kbd>B</kbd> or right mouse (hold)', 'GoPro: bolted under the side, straight down, with a ring where the load will land'], ['<kbd>U</kbd> / <kbd>Home</kbd>', 'Recenter camera or look ahead (drag to orbit, wheel to zoom)'], ['<kbd>N</kbd>', 'Mark this moment for a flight note (describe it later in Pause → Flight replay)'], ['<kbd>M</kbd>', 'Mute'], ['<kbd>Esc</kbd>', 'Pause'], ['<kbd>F2</kbd>', 'Frame rate readout'], ['<kbd>`</kbd>', 'Debug overlay']],
      gamepad: this.padHelpRows(),
      touch: [['Left thumb', 'Up / down: collective. Left / right: yaw'], ['Right thumb', 'Cyclic: tilt in any direction'], ['<kbd>Hook</kbd>', 'Hook / release (glows when a loop is in reach)'], ['<kbd>Pour</kbd> (hold)', 'Pour milk (appears while you carry the bucket); double-tap latches it open'], ['<kbd>Doors</kbd> (hold)', 'Skycrane belly doors, opening wider as you hold; double-tap = salvo'], ['<kbd>Pump</kbd> (hold)', 'Skycrane pump; double-tap = auto-fill'], ['<kbd>Hose ▲</kbd> <kbd>Hose ▼</kbd>', 'Reel the snorkel in / out'],
        ['<kbd>Assist</kbd>', 'Flight Assist on / off'], ['Camera icon (top right)', 'Next camera'], ['<kbd>GoPro</kbd> (hold)', 'Bolted camera looking straight down'], ['Drag open screen', 'Look around in the cockpit, or orbit the chase camera'], ['<kbd>View</kbd>', 'Recenter camera or look ahead'], ['<kbd>Mark</kbd>', 'Mark this moment for a flight note'], ['↻ (top right)', 'Restart flight']],
    };
    return R[tab].map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('');
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
  openController(pads) {
    this.modalKind = 'controller';
    this.pads = pads;
    const S = pads.settings;
    const slider = (key, label, min, max, step) => `<label class="opt">${label}<input type="range" data-pad="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}" /></label>`;
    const check = (key, label) => `<label class="opt">${label}<input type="checkbox" data-pad="${key}" ${S[key] ? 'checked' : ''} /></label>`;
    this.modal.innerHTML = `
      <div class="panel menu pad-panel" role="dialog" aria-label="Controller settings">
        <h2>Controller</h2>
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
        <p class="help-note">Using a <b>Steam Controller</b>? Browsers only see it as a gamepad through Steam Input: add your browser to Steam as a Non-Steam Game with the <b>Gamepad</b> layout and open Helicoptea from there (steps in the README). If it appears above as a standard layout it just works; otherwise use <b>Teach it an odd pad…</b>, which only tells the game where each stick and button is; the layout above decides what they do.</p>
      </div>`;
    this.modal.querySelectorAll('[data-pad]').forEach((el) => {
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        S[el.dataset.pad] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
        pads.saveSettings();
      });
    });
    this.modal.querySelector('.pad-settings [data-setting=collectiveMode]').addEventListener('change', (e) => this.h.setting('collectiveMode', e.target.value));
    this.modal.querySelector('.pad-capture [data-lay=capcancel]').addEventListener('click', () => pads.cancelCapture());
    this.renderLayout();
    this.modal.classList.add('show');
    this.updateController();
    this.focusFirst();
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
    wz.classList.remove('hidden');
    others.forEach((e) => e.classList.add('hidden'));
    wz.querySelector('.wz-step').textContent = `Step ${view.step} of ${view.total}`;
    wz.querySelector('.wz-prompt').innerHTML = view.prompt;
  }

  updateController() {
    if (this.modalKind !== 'controller' || !this.pads) return;
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
