import { milkyTea } from '../render/water.js';
import { prettyName } from '../input/gamepad.js';

const ICONS = {
  restart: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>',
  view: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M10 5v14M14 5v14"/></svg>',
};

const BREW_NAMES = [[0.08, 'Just water'], [0.22, 'Pale'], [0.42, 'Golden'], [0.62, 'Proper'], [0.82, 'Strong'], [2, "Builder's"]];

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
        <button class="icon-btn" data-act="recenter" title="Recenter camera (C)" aria-label="Recenter camera">${ICONS.view}</button>
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
        <button class="primary" data-act="restart">Restart Flight <span class="kb-inline"></span></button>
      </div>
      <div class="debug hidden"></div>
    `;
    this.q = (s) => root.querySelector(s);
    this.assistBtn = this.q('[data-act=assist]');
    this.invite = this.q('.assist-invite');
    this.hint = this.q('.hint');
    this.prompt = this.q('.prompt');
    this.toastEl = this.q('.toast');
    this.crashEl = this.q('.crash');
    this.debugEl = this.q('.debug');
    this.coll = this.q('.collective');
    this.collLabel = this.q('.collective-label');
    this.volPop = this.q('.vol-pop');
    this.vol = this.volPop.querySelector('input');
    this.chips = [];
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
      keyboard: { lift: '<kbd>W</kbd>', attach: '<kbd>Space</kbd>', assist: '<kbd>F</kbd>', restart: '<kbd>R</kbd>', pour: '<kbd>G</kbd>' },
      gamepad: { lift: '<kbd>L-stick ↑</kbd>', attach: '<kbd>A</kbd>', assist: '<kbd>Y</kbd>', restart: '<kbd>Start</kbd>', pour: '<kbd>RB</kbd>' },
      touch: { lift: 'left stick ↑', attach: '<kbd>Hook</kbd>', assist: '<kbd>Assist</kbd>', restart: '↻', pour: '<kbd>Pour</kbd>' },
    };
    return K[d][action];
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
  setInvite(show) { this.invite.classList.toggle('hidden', !show); }

  setCollective(c, hoverEstimate) {
    this.coll.querySelector('.lvl').style.height = `${Math.round(c * 100)}%`;
    this.coll.querySelector('.mark').style.bottom = `${Math.round(hoverEstimate * 100)}%`;
  }

  showHint(step, html) {
    if (!html) { this.hint.classList.remove('show'); return; }
    this.hint.querySelector('.step').textContent = step;
    this.hint.querySelector('.txt').innerHTML = html;
    this.hint.classList.add('show');
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

  showCrash(reason) {
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
      el.querySelector('.nm').textContent = BREW_NAMES.find(([t]) => c.cup.brew < t)[1] + (m > 0.2 ? ', very milky' : m > 0.07 ? ', milky' : m > 0.015 ? ', splash of milk' : '');
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
        </div>
        <div class="row stack">
          <label class="opt">Graphics quality
            <select data-setting="quality">
              ${['auto', 'high', 'medium', 'low'].map((q) => `<option value="${q}" ${opts.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
            </select></label>
          <label class="opt">World weight <span class="weight-row"><small>light</small><input type="range" min="0" max="1" step="0.05" value="${opts.weight ?? 0.75}" data-setting="weight" aria-label="World weight" /><small>heavy</small></span></label>
          <label class="opt">Debug overlay <input type="checkbox" data-setting="debug" ${opts.debug ? 'checked' : ''}/></label>
          <label class="opt">Controller <button class="secondary" style="padding:6px 12px" data-act="controller">Settings</button></label>
          <label class="opt">Show tips again <button class="secondary" style="padding:6px 12px" data-act="resethints">Replay</button></label>
          <div class="opt aircraft-row" role="radiogroup" aria-label="Aircraft">Aircraft
            <span>${[['micro', 'Micro heli'], ['chinook', 'Chinook']].map(([id, nm]) => `<button class="secondary${opts.aircraft === id ? ' on' : ''}" style="padding:6px 12px" role="radio" aria-checked="${opts.aircraft === id}" data-act="aircraft" data-id="${id}">${nm}</button>`).join(' ')}</span></div>
        </div>
        <p class="help-note">Reset sandbox clears every cup and bag. Restart flight keeps your brewing. Switching aircraft starts a fresh flight on the pad. Quality changes reload the page.</p>
      </div>`;
    this.modal.querySelector('[data-setting=quality]').addEventListener('change', (e) => this.h.setting('quality', e.target.value));
    this.modal.querySelector('[data-setting=debug]').addEventListener('change', (e) => this.h.setting('debug', e.target.checked));
    this.modal.querySelector('[data-setting=weight]').addEventListener('input', (e) => this.h.setting('weight', parseFloat(e.target.value)));
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
        <p class="help-note"><b>Collective</b> works the same on every device: push up to add lift, down to reduce it, and let go to hold.
        With Flight Assist on it sets a climb or sink speed and the heli levels itself when you centre the cyclic.
        With Assist off you trim the collective yourself (the bar on the left shows it) and the heli stays tilted until you correct it.</p>
        <div class="row"><button class="primary" style="margin-top:0" data-act="closehelp">Got it</button><button class="secondary" data-act="controller">Controller settings</button></div>
      </div>`;
    this.modal.classList.add('show');
    this.focusFirst();
  }

  helpRows(tab) {
    const R = {
      keyboard: [['<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>', 'Cyclic: tilt forward, back and sideways (or I J K L)'], ['<kbd>W</kbd><kbd>S</kbd>', 'Collective: more / less lift'], ['<kbd>A</kbd><kbd>D</kbd>', 'Yaw: turn left / right'],
        ['<kbd>Space</kbd>', 'Hook a bag or the milk bucket / release it (the Chinook has three hooks: Space drops them all)'], ['<kbd>G</kbd> (hold)', 'Pour milk from the bucket (dip it in the milk crock to fill it)'], ['<kbd>V</kbd>', 'Switch aircraft: micro heli / Chinook'], ['<kbd>F</kbd>', 'Flight Assist on / off'], ['<kbd>R</kbd>', 'Restart flight'], ['<kbd>Shift</kbd>+<kbd>R</kbd>', 'Reset sandbox'],
        ['<kbd>C</kbd>', 'Recenter camera (drag to orbit, wheel to zoom)'], ['<kbd>M</kbd>', 'Mute'], ['<kbd>Esc</kbd>', 'Pause'], ['<kbd>`</kbd>', 'Debug overlay']],
      gamepad: [['Right stick', 'Cyclic: tilt'], ['Left stick ↕', 'Collective (or triggers RT / LT)'], ['Left stick ↔', 'Yaw'], ['<kbd>A</kbd>', 'Hook / release'], ['<kbd>RB</kbd> (hold)', 'Pour milk from the bucket'], ['<kbd>Y</kbd>', 'Flight Assist on / off'],
        ['<kbd>Start</kbd>', 'Restart flight'], ['<kbd>B</kbd> / R3', 'Recenter camera'], ['D-pad', 'Orbit and zoom camera'], ['<kbd>Back</kbd> / <kbd>View</kbd>', 'Pause menu'], ['<kbd>X</kbd>', 'Controls'],
        ['After a crash', '<kbd>A</kbd> also restarts'], ['In menus', 'D-pad or left stick to move, <kbd>A</kbd> select, <kbd>B</kbd> back, ◀ ▶ adjust sliders']],
      touch: [['Left thumb', 'Up / down: collective. Left / right: yaw'], ['Right thumb', 'Cyclic: tilt in any direction'], ['<kbd>Hook</kbd>', 'Hook / release (glows when a loop is in reach)'], ['<kbd>Pour</kbd> (hold)', 'Pour milk (appears while you carry the bucket)'],
        ['<kbd>Assist</kbd>', 'Flight Assist on / off'], ['<kbd>View</kbd>', 'Recenter camera'], ['↻ (top right)', 'Restart flight']],
    };
    return R[tab].map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('');
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
          <div class="pad-stick"><div class="dot l"></div><span>Lift / turn</span></div>
          <div class="pad-stick"><div class="dot r"></div><span>Tilt</span></div>
          <div class="pad-raw"></div>
        </div>
        <div class="pad-wizard hidden"><p class="wz-step"></p><p class="wz-prompt"></p><div class="row"><button class="secondary" data-act="wizskip">Skip this one</button><button class="secondary" data-act="wizcancel">Cancel</button></div></div>
        <div class="row stack pad-settings">
          ${slider('deadZone', 'Stick dead zone', 0, 0.4, 0.01)}
          ${slider('expo', 'Fine control near centre', 0, 0.9, 0.05)}
          ${slider('cyclic', 'Tilt sensitivity', 0.3, 1.5, 0.05)}
          ${slider('collective', 'Lift sensitivity', 0.3, 1.5, 0.05)}
          ${slider('yaw', 'Turn sensitivity', 0.3, 1.5, 0.05)}
          ${check('invertPitch', 'Invert tilt forward / back')}
          ${check('invertCollective', 'Invert lift')}
          ${check('triggers', 'Triggers also control lift')}
          ${check('rumble', 'Rumble')}
        </div>
        <div class="row pad-actions">
          <button class="primary" style="margin-top:0" data-act="closecontroller">Done</button>
          <button class="secondary" data-act="padbind">Bind buttons…</button>
          <button class="secondary" data-act="padreset">Reset binding</button>
          <button class="secondary" data-act="padrumble">Test rumble</button>
        </div>
        <p class="help-note">Using a <b>Steam Controller</b>? Browsers only see it as a gamepad through Steam Input: add your browser to Steam as a Non-Steam Game with the <b>Gamepad</b> layout and open Helicoptea from there (steps in the README). If it appears above as a standard layout it just works; otherwise use <b>Bind buttons…</b>.</p>
      </div>`;
    this.modal.querySelectorAll('[data-pad]').forEach((el) => {
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        S[el.dataset.pad] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
        pads.saveSettings();
      });
    });
    this.modal.classList.add('show');
    this.updateController();
    this.focusFirst();
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
      ? list.map((g) => `<div class="pad-item ${g.index === pads.activeIndex ? 'on' : ''}"><b>${prettyName(g.id)}</b><span>${g.mapping === 'standard' && !pads.isCustom(g) ? 'standard layout, ready' : (pads.isCustom(g) ? 'custom binding' : 'unknown layout: press Bind buttons…')}${g.vibrationActuator ? ' · rumble' : ''}</span><small>${g.id}</small></div>`).join('')
      : '<div class="pad-item"><b>No controller detected</b><span>Connect one and press any of its buttons: browsers hide controllers until then.</span></div>';
    if (el.innerHTML !== html) el.innerHTML = html;
    const o = pads.out, r = pads.raw;
    const place = (sel, x, y) => { const d = this.modal.querySelector(sel); if (d) d.style.transform = `translate(${x * 26}px, ${-y * 26}px)`; };
    place('.dot.l', o.yaw, o.collective);
    place('.dot.r', o.roll, o.pitch);
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
