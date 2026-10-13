import { teaColor } from '../render/water.js';

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
      keyboard: { lift: '<kbd>W</kbd>', attach: '<kbd>Space</kbd>', assist: '<kbd>F</kbd>', restart: '<kbd>R</kbd>' },
      gamepad: { lift: '<kbd>L-stick ↑</kbd>', attach: '<kbd>A</kbd>', assist: '<kbd>Y</kbd>', restart: '<kbd>Start</kbd>' },
      touch: { lift: 'left stick ↑', attach: '<kbd>Hook</kbd>', assist: '<kbd>Assist</kbd>', restart: '↻' },
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
  hideCrash() { this.crashEl.classList.remove('show'); }

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
      const col = teaColor(c.cup.brew);
      el.querySelector('.dot').style.background = `rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`;
      el.querySelector('.nm').textContent = BREW_NAMES.find(([t]) => c.cup.brew < t)[1];
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
          <label class="opt">Debug overlay <input type="checkbox" data-setting="debug" ${opts.debug ? 'checked' : ''}/></label>
          <label class="opt">Show tips again <button class="secondary" style="padding:6px 12px" data-act="resethints">Replay</button></label>
        </div>
        <p class="help-note">Reset sandbox clears every cup and bag. Restart flight keeps your brewing. Quality changes reload the page.</p>
      </div>`;
    this.modal.querySelector('[data-setting=quality]').addEventListener('change', (e) => this.h.setting('quality', e.target.value));
    this.modal.querySelector('[data-setting=debug]').addEventListener('change', (e) => this.h.setting('debug', e.target.checked));
    this.modal.classList.add('show');
    this.modal.querySelector('[data-act=resume]').focus();
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
        <div class="row"><button class="primary" style="margin-top:0" data-act="closehelp">Got it</button></div>
      </div>`;
    this.modal.classList.add('show');
  }

  helpRows(tab) {
    const R = {
      keyboard: [['<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>', 'Cyclic: tilt forward, back and sideways (or I J K L)'], ['<kbd>W</kbd><kbd>S</kbd>', 'Collective: more / less lift'], ['<kbd>A</kbd><kbd>D</kbd>', 'Yaw: turn left / right'],
        ['<kbd>Space</kbd>', 'Hook a bag / release it'], ['<kbd>F</kbd>', 'Flight Assist on / off'], ['<kbd>R</kbd>', 'Restart flight'], ['<kbd>Shift</kbd>+<kbd>R</kbd>', 'Reset sandbox'],
        ['<kbd>C</kbd>', 'Recenter camera (drag to orbit, wheel to zoom)'], ['<kbd>M</kbd>', 'Mute'], ['<kbd>Esc</kbd>', 'Pause'], ['<kbd>`</kbd>', 'Debug overlay']],
      gamepad: [['Right stick', 'Cyclic: tilt'], ['Left stick ↕', 'Collective (or triggers RT / LT)'], ['Left stick ↔', 'Yaw'], ['<kbd>A</kbd>', 'Hook / release'], ['<kbd>Y</kbd>', 'Flight Assist on / off'],
        ['<kbd>Start</kbd>', 'Restart flight'], ['<kbd>B</kbd> / R3', 'Recenter camera'], ['D-pad', 'Orbit and zoom camera'], ['<kbd>Back</kbd>', 'Pause'], ['<kbd>X</kbd>', 'Controls']],
      touch: [['Left thumb', 'Up / down: collective. Left / right: yaw'], ['Right thumb', 'Cyclic: tilt in any direction'], ['<kbd>Hook</kbd>', 'Hook / release (glows when a loop is in reach)'],
        ['<kbd>Assist</kbd>', 'Flight Assist on / off'], ['<kbd>View</kbd>', 'Recenter camera'], ['↻ (top right)', 'Restart flight']],
    };
    return R[tab].map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('');
  }

  setHelpTab(tab) {
    this.modal.querySelectorAll('.help-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.modal.querySelector('.help-grid').innerHTML = this.helpRows(tab);
  }

  closeModal() { this.modal.classList.remove('show'); this.modalKind = null; }
}
