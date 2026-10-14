import { KNOBS, KNOB, GROUPS, AIRCRAFT, AIRCRAFT_LABEL, PRESETS, knobDefault, appliesTo } from '../tuning/knobs.js';
import { aircraftRange } from '../tuning/tuning.js';
import { PreviewRig, drawCurve } from '../tuning/preview.js';
import { CFG } from '../config.js';

// The flight tuning board. Lives in the HUD's modal, so gamepad menu navigation works as elsewhere
// (d-pad moves, left/right adjusts the focused slider). Hovering, focusing or tapping a row shows its
// live preview clip on the right: the same scripted flight at low vs high (or default vs yours).

const TABS = [['global', 'All aircraft'], ...AIRCRAFT.map((a) => [a, AIRCRAFT_LABEL[a]])];

export class TuningPanel {
  constructor(hud, tuning, opts) {
    this.hud = hud;
    this.tuning = tuning;
    this.opts = opts;         // { aircraft(): id, onClose(), restart() }
    this.tab = 'global';
    this.mode = 'range';      // 'range' (low vs high) | 'yours' (default vs yours)
    this.active = null;       // knob id showing in the preview
    this.rig = null;
    this.curveRAF = 0;
  }

  get el() { return this.hud.modal; }

  open(tab) {
    if (tab) this.tab = tab;
    this.hud.modalKind = 'tuning';
    this.render();
    this.el.classList.add('show');
    this.hud.focusFirst();
  }

  close() {
    this.stopPreview();
    if (this.rig) { this.rig.dispose(); this.rig = null; }
    this.opts.onClose();
  }

  // ---------------------------------------------------------------- layout
  render() {
    const t = this.tuning;
    const scope = this.tab;
    const knobs = KNOBS.filter((k) => (scope === 'global' ? k.global : k.perAircraft && appliesTo(k, scope)));
    const groups = GROUPS.map((g) => ({ ...g, knobs: knobs.filter((k) => k.group === g.id) })).filter((g) => g.knobs.length);
    const changed = (s) => t.changedCount(s);
    this.el.innerHTML = `
      <div class="panel tune-panel" role="dialog" aria-label="Flight tuning">
        <header class="tune-head">
          <div>
            <h2>Flight tuning</h2>
            <p class="tune-sub">Effective value = aircraft base × <b>all aircraft</b> × <b>this aircraft</b>. Everything at ×1 is the game as shipped.</p>
          </div>
          <div class="tune-actions">
            ${scope === 'global' ? `<label class="tune-preset">Preset <select data-tune="preset"><option value="">Choose…</option>${Object.entries(PRESETS).map(([id, p]) => `<option value="${id}">${p.label}</option>`).join('')}</select></label>` : ''}
            <button class="secondary" data-act="tuneExport">Export</button>
            <button class="secondary" data-act="tuneImport">Import</button>
            <button class="secondary" data-act="tuneResetAll">Reset all</button>
            <button class="primary" style="margin-top:0" data-act="tuneDone">Done</button>
          </div>
        </header>
        <nav class="tune-tabs" role="tablist">
          ${TABS.map(([id, nm]) => `<button role="tab" aria-selected="${id === scope}" class="${id === scope ? 'on' : ''}" data-act="tuneTab" data-tab="${id}">${nm}${changed(id) ? `<span class="tune-count">${changed(id)}</span>` : ''}</button>`).join('')}
        </nav>
        <div class="tune-body">
          <div class="tune-list">
            ${scope !== 'global' ? `<p class="tune-note">${AIRCRAFT_LABEL[scope]}: multipliers on top of the all-aircraft board, to set how this aircraft feels relative to the others.</p>` : ''}
            ${groups.map((g) => `
              <section class="tune-group">
                <div class="tune-group-head"><h3>${g.label}</h3><button class="tune-link" data-act="tuneResetGroup" data-group="${g.id}">Reset group</button></div>
                <p class="tune-blurb">${g.blurb}</p>
                ${g.knobs.map((k) => this.rowHtml(k, scope)).join('')}
              </section>`).join('')}
          </div>
          <aside class="tune-preview" aria-live="polite">
            <div class="tune-compare" role="radiogroup" aria-label="Compare">
              <button class="${this.mode === 'range' ? 'on' : ''}" data-act="tuneMode" data-mode="range">Low vs high</button>
              <button class="${this.mode === 'yours' ? 'on' : ''}" data-act="tuneMode" data-mode="yours">Default vs yours</button>
            </div>
            <div class="tune-clip">
              <canvas class="tune-canvas"></canvas>
              <canvas class="tune-curve hidden"></canvas>
              <div class="tune-label l"><b></b><span></span></div>
              <div class="tune-label r"><b></b><span></span></div>
              <div class="tune-idle">Hover over a setting (or select it) to watch it in action.</div>
            </div>
            <h4 class="tune-pname"></h4>
            <p class="tune-watch"></p>
            <p class="tune-hint"></p>
          </aside>
        </div>
        <div class="tune-import hidden">
          <p>Paste a tuning (exported JSON), or load a file.</p>
          <textarea rows="6" spellcheck="false" aria-label="Tuning JSON"></textarea>
          <div class="row"><button class="primary" style="margin-top:0" data-act="tuneImportApply">Apply</button><button class="secondary" data-act="tuneImportFile">Load file…</button><button class="secondary" data-act="tuneImportCancel">Cancel</button><input type="file" accept=".json,application/json" class="hidden" /></div>
          <p class="tune-error"></p>
        </div>
      </div>`;
    this.bind();
    if (this.active) this.preview(this.active);
  }

  rowHtml(k, scope) {
    const [lo, hi] = this.range(k, scope);
    const v = this.value(k, scope);
    const changed = this.tuning.isChanged(scope, k.id) || (k.kind === 'world' && Math.abs(v - CFG.physics.worldSpeed) > 1e-6);
    return `
      <div class="tune-row${changed ? ' changed' : ''}" data-knob="${k.id}">
        <label class="tune-name" for="tk-${k.id}">${k.label}${k.restart ? '<small class="tune-badge">on restart</small>' : ''}</label>
        <span class="tune-end">${this.endLabel(k, lo, 'low')}</span>
        <input id="tk-${k.id}" type="range" min="0" max="1000" step="1" value="${Math.round(this.toSlider(k, v, lo, hi) * 1000)}" data-knob="${k.id}" aria-label="${k.label}" aria-valuetext="${this.fmt(k, v)}" />
        <span class="tune-end">${this.endLabel(k, hi, 'high')}</span>
        <output class="tune-val">${this.fmt(k, v)}</output>
        <button class="tune-reset" data-act="tuneReset" data-knob="${k.id}" title="Reset to default" aria-label="Reset ${k.label}">↺</button>
      </div>`;
  }

  endLabel(k, v, which) {
    if (which === 'low' && k.lowLabel) return k.lowLabel;
    if (which === 'high' && k.highLabel) return k.highLabel;
    return this.fmt(k, v);
  }

  range(k, scope) { return scope === 'global' ? [k.min, k.max] : aircraftRange(k); }
  value(k, scope) { return scope === 'global' ? this.tuning.getGlobal(k.id) : this.tuning.getAircraft(scope, k.id); }
  isLog(k, scope) { return scope !== 'global' ? true : !(k.linear || k.kind === 'abs' || k.kind === 'world') && k.min > 0; }
  toSlider(k, v, lo, hi) {
    if (this.isLog(k, this.tab)) return Math.log(v / lo) / Math.log(hi / lo);
    return (v - lo) / (hi - lo);
  }
  fromSlider(k, s, lo, hi) {
    let v = this.isLog(k, this.tab) ? lo * Math.pow(hi / lo, s) : lo + (hi - lo) * s;
    // Snap gently to the default so ×1 is easy to find again.
    const def = this.tab === 'global' ? (k.kind === 'world' ? CFG.physics.worldSpeed : knobDefault(k)) : 1;
    if (Math.abs(v - def) / Math.max(0.05, Math.abs(def) || 0.05) < 0.03) v = def;
    if (k.step) v = Math.round(v / k.step) * k.step;
    else v = Math.round(v * 100) / 100;
    return v;
  }
  fmt(k, v) {
    if (this.tab !== 'global' || k.kind === 'mult' || k.kind === 'excess') return `×${v.toFixed(2)}`;
    if (k.kind === 'world') return `${v.toFixed(2)}×`;
    return k.id === 'rates' ? `×${v.toFixed(2)}` : v.toFixed(2);
  }

  // ---------------------------------------------------------------- events
  bind() {
    const el = this.el;
    el.querySelectorAll('input[type=range][data-knob]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = KNOB[inp.dataset.knob];
        const [lo, hi] = this.range(k, this.tab);
        const v = this.fromSlider(k, parseInt(inp.value, 10) / 1000, lo, hi);
        if (this.tab === 'global') this.tuning.setGlobal(k.id, v); else this.tuning.setAircraft(this.tab, k.id, v);
        const row = inp.closest('.tune-row');
        row.querySelector('.tune-val').textContent = this.fmt(k, v);
        inp.setAttribute('aria-valuetext', this.fmt(k, v));
        const changed = this.tuning.isChanged(this.tab, k.id) || (k.kind === 'world' && Math.abs(v - CFG.physics.worldSpeed) > 1e-6);
        row.classList.toggle('changed', changed);
        this.updateTabCounts();
        if (this.mode === 'yours') this.preview(k.id, true);
      });
    });
    el.querySelectorAll('.tune-row').forEach((row) => {
      const show = () => this.preview(row.dataset.knob);
      row.addEventListener('mouseenter', show);
      row.addEventListener('focusin', show);
      row.addEventListener('pointerdown', show);
    });
    const preset = el.querySelector('[data-tune=preset]');
    if (preset) preset.addEventListener('change', () => { if (preset.value) { this.tuning.applyPreset(preset.value); this.hud.toast(`Preset: ${PRESETS[preset.value].label}`); this.render(); } });
    const file = el.querySelector('.tune-import input[type=file]');
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      el.querySelector('.tune-import textarea').value = await f.text();
    });
  }

  // Called by main for data-act buttons inside the panel.
  action(act, btn) {
    const el = this.el;
    switch (act) {
      case 'tuneTab': this.tab = btn.dataset.tab; this.render(); this.hud.focusFirst(); return true;
      case 'tuneMode': this.mode = btn.dataset.mode; el.querySelectorAll('.tune-compare button').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.mode)); if (this.active) this.preview(this.active, true); return true;
      case 'tuneReset': {
        const id = btn.dataset.knob;
        if (this.tab === 'global') this.tuning.resetGlobal(id); else this.tuning.resetAircraft(this.tab, id);
        this.render();
        el.querySelector(`#tk-${id}`)?.focus();
        return true;
      }
      case 'tuneResetGroup': if (this.tab === 'global') this.tuning.resetGroup('global', btn.dataset.group); else this.tuning.resetGroup(this.tab, btn.dataset.group); this.render(); return true;
      case 'tuneResetAll': this.tuning.resetAll(); this.hud.toast('All tuning reset to the shipped feel'); this.render(); return true;
      case 'tuneExport': this.export(); return true;
      case 'tuneImport': el.querySelector('.tune-import').classList.remove('hidden'); el.querySelector('.tune-import textarea').focus(); return true;
      case 'tuneImportCancel': el.querySelector('.tune-import').classList.add('hidden'); return true;
      case 'tuneImportFile': el.querySelector('.tune-import input[type=file]').click(); return true;
      case 'tuneImportApply': {
        const txt = el.querySelector('.tune-import textarea').value;
        try { this.tuning.importState(JSON.parse(txt)); this.hud.toast('Tuning imported'); this.render(); }
        catch (e) { el.querySelector('.tune-error').textContent = `Couldn't read that: ${e.message}`; }
        return true;
      }
      case 'tuneDone': this.close(); return true;
      default: return false;
    }
  }

  async export() {
    const txt = this.tuning.exportText();
    let copied = false;
    try { await navigator.clipboard.writeText(txt); copied = true; } catch { /* clipboard may be blocked */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = 'helicoptea-tuning.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.hud.toast(copied ? 'Tuning copied to the clipboard and saved as a file' : 'Tuning saved as helicoptea-tuning.json');
  }

  updateTabCounts() {
    this.el.querySelectorAll('.tune-tabs button').forEach((b) => {
      const n = this.tuning.changedCount(b.dataset.tab);
      let c = b.querySelector('.tune-count');
      if (n && !c) { c = document.createElement('span'); c.className = 'tune-count'; b.appendChild(c); }
      if (c) { if (n) c.textContent = n; else c.remove(); }
    });
  }

  // ---------------------------------------------------------------- preview
  preview(id, force = false) {
    if (id === this.active && !force) return;
    this.active = id;
    const k = KNOB[id];
    const el = this.el;
    el.querySelectorAll('.tune-row').forEach((r) => r.classList.toggle('previewing', r.dataset.knob === id));
    const aircraft = this.tab === 'global' ? this.opts.aircraft() : this.tab;
    const clip = k.clip || {};
    el.querySelector('.tune-idle').classList.add('hidden');
    el.querySelector('.tune-pname').textContent = `${k.label}${this.tab === 'global' ? '' : ` · ${AIRCRAFT_LABEL[this.tab]}`}`;
    el.querySelector('.tune-watch').innerHTML = clip.watch ? `<b>Watch:</b> ${clip.watch}` : '';
    el.querySelector('.tune-hint').textContent = k.hint || '';
    if (aircraft === 'skycrane' && clip.scenario !== 'curve') el.querySelector('.tune-hint').textContent += ' (Skycrane clips fly with Flight Assist on.)';
    const canvas = el.querySelector('.tune-canvas');
    const curve = el.querySelector('.tune-curve');
    const scope = this.tab;
    const [lo, hi] = this.range(k, scope);
    const cur = this.value(k, scope);
    const def = scope === 'global' ? (k.kind === 'world' ? CFG.physics.worldSpeed : knobDefault(k)) : 1;
    const vals = this.mode === 'yours' ? [def, cur] : [lo, hi];
    const labels = this.mode === 'yours' ? ['Default', 'Yours'] : ['Low', 'High'];
    const caps = this.mode === 'yours' ? ['', Math.abs(cur - def) < 1e-6 ? 'Move the slider to compare' : ''] : [clip.low || '', clip.high || ''];
    const L = el.querySelector('.tune-label.l'), R = el.querySelector('.tune-label.r');
    L.querySelector('b').textContent = `${labels[0]} ${this.fmt(k, vals[0])}`; L.querySelector('span').textContent = caps[0];
    R.querySelector('b').textContent = `${labels[1]} ${this.fmt(k, vals[1])}`; R.querySelector('span').textContent = caps[1];
    this.stopPreview();
    if (clip.scenario === 'curve') {
      canvas.classList.add('hidden');
      curve.classList.remove('hidden');
      const t0 = performance.now();
      const loop = (now) => { drawCurve(curve, k.id, vals, (now - t0) / 1000); this.curveRAF = requestAnimationFrame(loop); };
      this.curveRAF = requestAnimationFrame(loop);
      return;
    }
    curve.classList.add('hidden');
    canvas.classList.remove('hidden');
    try {
      if (!this.rig || this.rig.canvas !== canvas) { if (this.rig) this.rig.dispose(); this.rig = new PreviewRig(canvas, this.tuning); }
      this.rig.show({ knobId: id, scope, aircraft, mode: this.mode });
    } catch (e) {
      console.warn('[Helicoptea] preview failed', e);
      el.querySelector('.tune-watch').textContent = 'Preview unavailable on this device.';
    }
  }

  stopPreview() {
    if (this.curveRAF) cancelAnimationFrame(this.curveRAF);
    this.curveRAF = 0;
    if (this.rig) this.rig.stop();
  }
}
