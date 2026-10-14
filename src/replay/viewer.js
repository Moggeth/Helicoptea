import * as THREE from 'three';
import './replay.css';
import { FollowCamera } from '../render/camera.js';
import { CockpitRig } from '../render/cockpitCam.js';
import { gearDrop } from '../sim/aircraft.js';
import { CH } from './format.js';

// Flight replay viewer: timeline scrubber, play / pause, slow motion, frame step, chase / orbit / cockpit
// cameras, telemetry graphs synced to the playhead, and notes tagged good / bad at a moment.
// Everything shown is rebuilt from the recorded snapshots by ReplayStage (no re-simulation).
// Keyboard, mouse, touch and gamepad all work.

const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const CAMS = [['chase', 'Chase'], ['orbit', 'Orbit'], ['cockpit', 'Cockpit']];
const NAMES = { micro: 'Micro heli', chinook: 'Chinook', skycrane: 'Skycrane' };
const TAGS = { good: 'Good', bad: 'Bad', note: 'Note', mark: 'Mark' };
const WINDOWS = [5, 10, 30, 0];  // graph window in seconds (0: the whole flight)
const EVENT_STYLE = {
  crash: ['#ff5a3c', 1], touchdown: ['#9fd3a8', 0.7], bump: ['#f2b84b', 0.7], snatch: ['#c79bff', 0.7], scrape: ['#bcae9a', 0.35],
  attach: ['#7fc4ff', 0.6], release: ['#7fc4ff', 0.45], rotorTick: ['#ff9a6b', 0.5], splash: ['#d0a070', 0.5],
};
const STRIPS = [
  { name: 'Sticks', lines: [['in.pitch', '#7fc4ff', 'pitch'], ['in.roll', '#f2b84b', 'roll'], ['in.yaw', '#c79bff', 'yaw'], ['in.coll', '#9fd3a8', 'coll']], range: [-1, 1] },
  { name: 'Height', lines: [['agl', '#9fd3a8', 'gear cm']], scale: 100, unit: 'cm', min0: true },
  { name: 'Speed', lines: [['hspeed', '#7fc4ff', 'horiz'], ['vspeed', '#f2b84b', 'vert']], unit: 'm/s' },
  { name: 'Rope', lines: [['load', '#ff8f6b', 'tension mN']], scale: 1000, unit: 'mN', min0: true, alt: { skycrane: [['tankFill', '#f4f0e6', 'tank %']], scale: 100, name: 'Tank' } },
];
const fmt = (w) => { const m = Math.floor(w / 60), s = w - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class ReplayViewer {
  constructor(o) {
    Object.assign(this, o);   // recorder, store, stage, camera, cockpit, fpSettings(), setLens(), toast(), onClose()
    this.active = false;
    this.flight = null;
    this.s = 0;
    this.playing = false;
    this.rate = 1;
    this.cam = 'chase';
    this.win = 10;
    this.chase = new FollowCamera(this.camera);
    this.rig = new CockpitRig();
    this.orbit = { yaw: 0.6, pitch: 0.35, dist: 0.6, focus: new THREE.Vector3(), init: false };
    this.disk = new Map();      // flights loaded from disk, by id
    this.diskList = [];
    this.pendingTag = 'note';
    this.padPrev = [];
    this.padRepeat = 0;
    this.saveT = 0;
    this.build();
  }

  // ---------------------------------------------------------------- DOM
  build() {
    const el = this.el = document.createElement('div');
    el.id = 'replay';
    el.className = 'replay hidden';
    el.innerHTML = `
      <div class="rp-stage" aria-hidden="true"></div>
      <div class="rp-toast" role="status"></div>
      <div class="rp-top">
        <div class="rp-title"><b>Replay</b><select class="rp-flight" aria-label="Flight"></select></div>
        <div class="rp-save" aria-live="polite"></div>
        <button class="rp-btn sm rp-dl" data-rp="download" title="Download this flight and its notes as one file">Download</button>
        <button class="rp-btn rp-close" data-rp="close" title="Close (Esc, gamepad B)">Close <span class="k">Esc</span></button>
      </div>
      <div class="rp-readout" aria-live="off"><canvas class="rp-sticks" width="120" height="58"></canvas><pre class="rp-text"></pre></div>
      <aside class="rp-notes">
        <div class="rp-notes-head"><b>Notes</b><span class="rp-hint">Good / Bad / Note adds one at the playhead</span></div>
        <div class="rp-add">
          <input class="rp-input" type="text" maxlength="400" placeholder="What did it feel like here?" aria-label="Note text" />
          <div class="rp-tags">
            <button class="rp-btn tag good" data-rp="add" data-tag="good" title="Good (G, gamepad Y)">Good</button>
            <button class="rp-btn tag bad" data-rp="add" data-tag="bad" title="Bad (B, gamepad X)">Bad</button>
            <button class="rp-btn tag note" data-rp="add" data-tag="note" title="Note (N)">Note</button>
          </div>
        </div>
        <ol class="rp-list"></ol>
      </aside>
      <div class="rp-bottom">
        <div class="rp-controls">
          <button class="rp-btn" data-rp="back1" title="Back 1 s (Shift+←)">−1s</button>
          <button class="rp-btn" data-rp="prev" title="Previous frame (←, D-pad ←)">◀︎|</button>
          <button class="rp-btn rp-play" data-rp="play" title="Play / pause (Space, gamepad A)">▶︎</button>
          <button class="rp-btn" data-rp="next" title="Next frame (→, D-pad →)">|▶︎</button>
          <button class="rp-btn" data-rp="fwd1" title="Forward 1 s (Shift+→)">+1s</button>
          <span class="rp-time"><b>0:00.00</b> / 0:00.00</span>
          <span class="rp-group rp-speeds" role="radiogroup" aria-label="Speed" title="Speed ([ ] keys, gamepad LB / RB)">${SPEEDS.map((v) => `<button class="rp-btn sm" data-rp="speed" data-v="${v}">${v}×</button>`).join('')}</span>
          <span class="rp-group rp-cams" role="radiogroup" aria-label="Camera" title="Camera (1 2 3 or C, gamepad D-pad ↑↓)">${CAMS.map(([id, nm]) => `<button class="rp-btn sm" data-rp="cam" data-v="${id}">${nm}</button>`).join('')}</span>
          <button class="rp-btn sm rp-wbtn" data-rp="window" title="Graph window">10 s</button>
          <button class="rp-btn sm rp-gtoggle" data-rp="graphs" title="Show / hide the graphs (H)">Graphs</button>
          <button class="rp-btn sm rp-ntoggle" data-rp="notes" title="Show / hide notes">Notes</button>
        </div>
        <canvas class="rp-timeline" aria-label="Timeline"></canvas>
        <canvas class="rp-graphs" aria-label="Telemetry"></canvas>
      </div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.q = q;
    this.sel = q('.rp-flight');
    this.input = q('.rp-input');
    this.list = q('.rp-list');
    this.tl = q('.rp-timeline');
    this.gr = q('.rp-graphs');
    this.sticks = q('.rp-sticks');
    this.text = q('.rp-text');
    this.timeEl = q('.rp-time');
    this.saveEl = q('.rp-save');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rp]');
      if (!b) return;
      this.act(b.dataset.rp, b.dataset);
      if (b.dataset.rp !== 'add') b.blur();
    });
    this.sel.addEventListener('change', () => this.selectFlight(this.sel.value));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addNote(this.pendingTag, this.input.value); this.input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.input.blur(); }
      e.stopPropagation();
    });
    this.list.addEventListener('click', (e) => {
      const row = e.target.closest('[data-note]');
      if (!row || !this.flight) return;
      const n = this.flight.notes.find((x) => x.id === row.dataset.note);
      if (!n) return;
      if (e.target.closest('.rp-del')) { this.flight.notes.splice(this.flight.notes.indexOf(n), 1); this.notesChanged(); return; }
      if (e.target.closest('.rp-chip')) { const order = ['good', 'bad', 'note']; n.tag = order[(order.indexOf(n.tag) + 1) % order.length]; this.notesChanged(); return; }
      if (e.target.closest('.rp-at')) { this.seek(n.i); this.playing = false; }
    });
    this.list.addEventListener('change', (e) => {
      const row = e.target.closest('[data-note]');
      const n = row && this.flight && this.flight.notes.find((x) => x.id === row.dataset.note);
      if (n && e.target.classList.contains('rp-ntext')) { n.text = e.target.value; this.notesChanged(false); }
    });
    this.list.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });
    // Scrubbing on the timeline and graphs (mouse and touch).
    for (const cv of [this.tl, this.gr]) {
      cv.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        this.scrubbing = { cv, wasPlaying: this.playing };
        this.playing = false;
        this.scrubTo(cv, e.clientX);
      });
      cv.addEventListener('pointermove', (e) => { if (this.scrubbing && this.scrubbing.cv === cv) this.scrubTo(cv, e.clientX); });
      const up = () => { if (this.scrubbing) { this.playing = false; this.scrubbing = null; } };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    }
    // Orbit / look by dragging the picture, zoom with the wheel or a pinch.
    const stage = q('.rp-stage');
    const ptrs = new Map();
    let pinch = 0;
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    stage.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.zoom((pinch - d) * 0.006);
        pinch = d;
        return;
      }
      this.look(-dx * 0.006, -dy * 0.005);
    });
    const end = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY * 0.0012); }, { passive: false });
    this.onKey = (e) => this.key(e);
    this.onResize = () => { this.sizeCanvases(); this.drawTimeline(); };
  }

  // ---------------------------------------------------------------- open / close
  open(opts = {}) {
    if (this.active) return;
    this.active = true;
    this.from = opts.from || 'pause';
    this.el.classList.remove('hidden');
    document.body.classList.add('replay-on');
    this.stage.enter();
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.padPrev = this.padButtons();
    this.compact = innerWidth < 900 || innerHeight < 560;
    this.el.classList.toggle('compact', this.compact);
    this.el.classList.toggle('notes-open', !this.compact);
    this.refreshFlights();
    const f = opts.flight || this.recorder.current || this.recorder.flights[this.recorder.flights.length - 1] || null;
    this.setFlight(f, opts.at);
    this.playing = !!f && opts.play !== false;
    if (f && !f.saved) this.saveSoon(0);
    this.store.list().then((l) => { this.diskList = l || []; this.refreshFlights(); this.updateSave(); });
    this.updateButtons();
    this.sizeCanvases();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.playing = false;
    this.input.blur();
    this.el.classList.add('hidden');
    document.body.classList.remove('replay-on');
    this.stage.leave();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    if (this.flight && this.flight.dirty && this.flight.notes.length) this.store.save(this.flight, { notesOnly: true });
    if (this.onClose) this.onClose(this.from);
  }

  // Flights: in memory (newest first) then saved on disk.
  refreshFlights() {
    const mem = [...this.recorder.flights].reverse();
    const ids = new Set(mem.map((f) => f.id));
    const label = (f, live) => `${live ? 'This flight' : f.startedAt.slice(11, 19)} · ${NAMES[f.aircraft] || f.aircraft} · ${fmt(f.wallDuration()).slice(0, -3)}${f.crash() ? ' · crashed' : ''}${f.notes.length ? ` · ${f.notes.length} note${f.notes.length > 1 ? 's' : ''}` : ''}`;
    let html = `<optgroup label="Recent (this session)">${mem.map((f) => `<option value="m:${f.id}">${esc(label(f, f === this.recorder.current))}</option>`).join('')}</optgroup>`;
    const saved = this.diskList.filter((d) => !ids.has(d.id));
    if (saved.length) html += `<optgroup label="${this.store.mode === 'browser' ? 'Saved in this browser' : 'Saved in logs/flights'}">${saved.slice(0, 60).map((d) => `<option value="d:${d.id}">${esc(`${d.id.slice(0, 8)} ${d.startedAt ? d.startedAt.slice(11, 19) : ''} · ${NAMES[d.aircraft] || d.aircraft} · ${fmt(d.wallDuration || 0).slice(0, -3)}${d.crash ? ' · crashed' : ''}${d.notes ? ` · ${d.notes} notes` : ''}`)}</option>`).join('')}</optgroup>`;
    this.sel.innerHTML = html;
    if (this.flight) this.sel.value = `${this.disk.has(this.flight.id) && !ids.has(this.flight.id) ? 'd' : 'm'}:${this.flight.id}`;
  }

  async selectFlight(v) {
    const [kind, id] = [v.slice(0, 1), v.slice(2)];
    let f = null;
    if (kind === 'm') f = this.recorder.flights.find((x) => x.id === id);
    else {
      f = this.disk.get(id);
      if (!f) {
        this.saveEl.textContent = 'Loading…';
        try { f = await this.store.load(id); this.disk.set(id, f); } catch (err) { this.saveEl.textContent = `Could not load ${id}: ${err.message}`; return; }
      }
    }
    if (f) { this.setFlight(f); this.playing = true; }
  }

  setFlight(f, at) {
    this.flight = f;
    this.stage.setFlight(f);
    if (!f || !f.n) { this.s = 0; this.updateSave(); this.renderNotes(); this.drawTimeline(); return; }
    // Default start: a few seconds before a crash, or the last few seconds of the flight.
    const c = f.crash();
    const startW = at !== undefined ? at : Math.max(0, (c ? c.wall : f.wallDuration()) - (c ? 5 : 8));
    this.seek(f.indexAtWall(startW));
    this.cam = this.cam === 'cockpit' && f.aircraft ? 'cockpit' : this.cam;
    this.updateSave();
    this.renderNotes();
    this.refreshFlights();
    this.drawTimeline();
  }

  // ---------------------------------------------------------------- actions
  act(a, d = {}) {
    const f = this.flight;
    switch (a) {
      case 'close': this.close(); break;
      case 'play': if (f && this.s >= f.n - 1.01 && !this.playing) this.seek(0); this.playing = !this.playing; break;
      case 'prev': this.step(-1); break;
      case 'next': this.step(1); break;
      case 'back1': this.jump(-1); break;
      case 'fwd1': this.jump(1); break;
      // On a phone only the current speed and camera show; tapping them cycles.
      case 'speed': if (this.compact && parseFloat(d.v) === this.rate) this.rate = SPEEDS[(SPEEDS.indexOf(this.rate) + 1) % SPEEDS.length]; else this.rate = parseFloat(d.v); break;
      case 'cam': if (this.compact && d.v === this.cam) this.setCam(CAMS[(CAMS.findIndex(([id]) => id === this.cam) + 1) % CAMS.length][0]); else this.setCam(d.v); break;
      case 'window': this.win = WINDOWS[(WINDOWS.indexOf(this.win) + 1) % WINDOWS.length]; break;
      case 'notes': this.el.classList.toggle('notes-open'); this.sizeCanvases(); break;
      case 'graphs': this.el.classList.toggle('graphs-off'); this.sizeCanvases(); break;
      case 'add': this.addNote(d.tag, this.input.value); break;
      case 'download': if (f && this.store.download(f)) this.flash(`Downloaded ${f.id}.json`); break;
      default: break;
    }
    this.updateButtons();
  }

  step(n) { if (!this.flight) return; this.playing = false; this.seek(Math.round(this.s) + n); }
  jump(sec) { if (!this.flight) return; this.seek(this.flight.indexAtWall(this.flight.wallAt(this.s) + sec)); }
  seek(s) {
    const f = this.flight;
    if (!f) return;
    this.s = Math.max(0, Math.min(f.n - 1, s));
    this.snapCam = true;
  }
  setCam(c) { if (CAMS.some(([id]) => id === c)) { this.cam = c; this.snapCam = true; this.rig.reset(); this.rig.lookYaw = this.rig.lookPitch = 0; } }
  speedStep(d) { const i = SPEEDS.indexOf(this.rate); this.rate = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 3 : i) + d))]; this.updateButtons(); }

  look(dyaw, dpitch) {
    if (this.cam === 'cockpit') this.rig.addLook(dyaw * 0.8, dpitch * 0.8);
    else if (this.cam === 'orbit') { this.orbit.yaw += dyaw; this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - dpitch, -0.2, 1.45); }
    else { this.chase.orbitYaw += dyaw; this.chase.orbitPitch = THREE.MathUtils.clamp(this.chase.orbitPitch - dpitch, -0.35, 0.7); }
  }
  zoom(d) {
    if (this.cam === 'cockpit') this.rig.fovZoom = THREE.MathUtils.clamp(this.rig.fovZoom + d * 30, -45, 15);
    else if (this.cam === 'orbit') this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist * Math.exp(d), 0.06, 4);
    else this.chase.zoom = THREE.MathUtils.clamp(this.chase.zoom * Math.exp(d), 0.35, 3);
  }

  addNote(tag, text = '') {
    const f = this.flight;
    if (!f || !f.n) return;
    const n = this.recorder.addNote({ tag: tag || 'note', text: text.trim(), source: 'viewer' }, f, Math.round(this.s * 100) / 100);
    this.input.value = '';
    this.pendingTag = 'note';
    if (n) this.flash(`${TAGS[n.tag]} note at ${fmt(n.wall)}${n.text ? '' : ': type in the notes list to describe it'}`);
    this.notesChanged();
  }

  flash(text, secs = 1.8) {
    const t = this.q('.rp-toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => t.classList.remove('show'), secs * 1000);
  }

  notesChanged(rerender = true) {
    if (!this.flight) return;
    this.flight.dirty = true;
    if (rerender) this.renderNotes();
    this.drawTimeline();
    this.saveSoon(0.5, true);
  }

  saveSoon(delay, notesOnly = false) {
    clearTimeout(this.saveTimer);
    const f = this.flight;
    if (!f) return;
    this.saveTimer = setTimeout(() => {
      this.saveEl.textContent = 'Saving…';
      this.store.save(f, { notesOnly }).then(() => { this.updateSave(); this.refreshFlights(); });
    }, delay * 1000);
  }

  updateSave() {
    const f = this.flight, st = this.store;
    if (!f) { this.saveEl.textContent = 'No flights recorded yet: fly first, then come back.'; return; }
    if (st.mode === 'memory') this.saveEl.textContent = 'Kept in memory only: use Download to keep this flight.';
    else if (f.saved && st.mode === 'browser') this.saveEl.textContent = 'Saved in this browser: use Download to keep a copy.';
    else if (f.saved) this.saveEl.textContent = `Saved to ${f.savedPath || `logs/flights/${f.id}.json`}`;
    else if (st.lastError) this.saveEl.textContent = `Not saved (${st.lastError})`;
    else this.saveEl.textContent = 'Saving…';
  }

  renderNotes() {
    const f = this.flight;
    const notes = f ? f.notes : [];
    this.q('.rp-ntoggle').textContent = notes.length ? `Notes (${notes.length})` : 'Notes';
    this.list.innerHTML = notes.length ? notes.map((n) => `
      <li data-note="${n.id}" class="${n.tag}">
        <button class="rp-at" title="Jump here">${fmt(n.wall)}</button>
        <button class="rp-chip ${n.tag}" title="Change tag">${TAGS[n.tag] || n.tag}</button>
        <input class="rp-ntext" type="text" maxlength="400" value="${esc(n.text)}" placeholder="${n.source === 'flight' ? 'Marked in flight: what was it?' : 'Describe it'}" aria-label="Note text" />
        <button class="rp-del" title="Delete note" aria-label="Delete note">×</button>
      </li>`).join('') : '<li class="empty">No notes yet. Mark moments in flight with <kbd>N</kbd> (gamepad R3, or the flag button), or add one here.</li>';
  }

  updateButtons() {
    this.q('.rp-play').textContent = this.playing ? '❚❚' : '▶︎';
    for (const b of this.el.querySelectorAll('[data-rp=speed]')) b.classList.toggle('on', parseFloat(b.dataset.v) === this.rate);
    for (const b of this.el.querySelectorAll('[data-rp=cam]')) b.classList.toggle('on', b.dataset.v === this.cam);
    this.q('.rp-wbtn').textContent = this.win ? `${this.win} s` : 'All';
    this.q('.rp-gtoggle').classList.toggle('on', !this.el.classList.contains('graphs-off'));
  }

  // ---------------------------------------------------------------- keyboard and gamepad
  key(e) {
    if (!this.active) return;
    const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
    if (inField) { if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); e.stopImmediatePropagation(); } return; }
    const k = e.code;
    let done = true;
    if (k === 'Space' || k === 'KeyK') this.act('play');
    else if (k === 'ArrowLeft' || k === 'Comma') { if (e.shiftKey) this.jump(-1); else this.step(-1); }
    else if (k === 'ArrowRight' || k === 'Period') { if (e.shiftKey) this.jump(1); else this.step(1); }
    else if (k === 'Home') this.seek(0);
    else if (k === 'End') this.seek(this.flight ? this.flight.n - 1 : 0);
    else if (k === 'BracketLeft' || k === 'Minus') this.speedStep(-1);
    else if (k === 'BracketRight' || k === 'Equal') this.speedStep(1);
    else if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') this.setCam(CAMS[+k.slice(5) - 1][0]);
    else if (k === 'KeyC') this.setCam(CAMS[(CAMS.findIndex(([id]) => id === this.cam) + 1) % CAMS.length][0]);
    else if (k === 'KeyG' || k === 'KeyB' || k === 'KeyN') {
      this.pendingTag = { KeyG: 'good', KeyB: 'bad', KeyN: 'note' }[k];
      this.playing = false;
      this.el.classList.add('notes-open'); this.sizeCanvases();
      this.input.placeholder = `${TAGS[this.pendingTag]} note at ${fmt(this.flight ? this.flight.wallAt(this.s) : 0)}: type, then Enter`;
      setTimeout(() => this.input.focus(), 0);
    } else if (k === 'KeyH') this.act('graphs');
    else if (k === 'Escape' || k === 'KeyP') this.close();
    else done = false;
    if (done) { e.preventDefault(); e.stopImmediatePropagation(); this.updateButtons(); }
  }

  pad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of list || []) if (g && g.connected !== false) return g;
    return null;
  }
  padButtons() { const g = this.pad(); return g ? g.buttons.map((b) => (typeof b === 'number' ? b > 0.5 : b.pressed)) : []; }

  pollPad(dt) {
    const g = this.pad();
    if (!g) return;
    const now = g.buttons.map((b) => (typeof b === 'number' ? b > 0.5 : b.pressed));
    const val = (i) => { const b = g.buttons[i]; return b ? (typeof b === 'number' ? b : b.value) : 0; };
    const hit = (i) => now[i] && !this.padPrev[i];
    if (hit(1) || hit(8)) { this.padPrev = now; this.close(); return; }
    if (hit(0) || hit(9)) this.act('play');
    if (hit(4)) this.speedStep(-1);
    if (hit(5)) this.speedStep(1);
    if (hit(12) || hit(13)) { const i = CAMS.findIndex(([id]) => id === this.cam); this.setCam(CAMS[(i + (hit(12) ? -1 : 1) + CAMS.length) % CAMS.length][0]); }
    if (hit(3)) this.addNote('good');
    if (hit(2)) this.addNote('bad');
    // D-pad left / right: a frame per press, repeating while held.
    const dir = (now[15] ? 1 : 0) - (now[14] ? 1 : 0);
    if (dir && (hit(14) || hit(15))) { this.step(dir); this.padRepeat = 0.35; }
    else if (dir) { this.padRepeat -= dt; if (this.padRepeat <= 0) { this.step(dir); this.padRepeat = 0.05; } }
    // Triggers and the left stick scrub (up to 3× as flown); the right stick moves the camera.
    const ax = (i) => { const v = g.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : v; };
    const scrub = val(7) - val(6) + ax(0);
    if (Math.abs(scrub) > 0.08 && this.flight) {
      this.playing = false;
      this.seek(this.flight.indexAtWall(this.flight.wallAt(this.s) + scrub * 3 * dt));
      this.snapCam = false;
    }
    if (ax(2) || ax(3)) this.look(-ax(2) * 2.2 * dt, ax(3) * 1.6 * dt);
    this.padPrev = now;
    this.updateButtons();
  }

  // ---------------------------------------------------------------- per frame
  update(frameDt) {
    const f = this.flight;
    this.pollPad(frameDt);
    if (!f || !f.n) { this.drawGraphs(); return { cockpit: false, focus: this.stage.focus }; }
    let playDt = 0;
    if (this.playing) {
      const w = f.wallAt(this.s) + frameDt * this.rate;
      this.s = f.indexAtWall(w);
      playDt = frameDt * this.rate * (f.samples.get(Math.floor(this.s), CH.worldSpeed) || 1);
      if (this.s >= f.n - 1) { this.s = f.n - 1; this.playing = false; this.updateButtons(); }
    }
    const S = this.fpSettings();
    const wantFp = this.cam === 'cockpit';
    const r = this.stage.pose(f, this.s, playDt, wantFp && this.stage.alive !== false);
    const alive = this.stage.alive;
    const fp = wantFp && alive;
    this.setLens(fp);
    // Cameras. A seek snaps them; playback moves them on the replay's clock.
    const camDt = this.playing ? frameDt * this.rate : frameDt;
    const P = this.stage.puppet;
    if (fp) {
      if (this.snapCam) { this.rig.reset(); }
      this.rig.update(this.snapCam ? 0 : playDt, P, this.stage.heliPos, this.stage.heliQuat, S, 0);
      this.rig.apply(this.camera, this.cockpit.camera);
      this.cockpit.update(playDt, P, this.stage.fakeSim, this.stage.heliQuat, gearDrop(f.aircraft), true);
    } else if (this.cam === 'orbit' || (wantFp && !alive)) {
      const O = this.orbit;
      if (this.snapCam || !O.init) { O.focus.copy(this.stage.focus); O.init = true; }
      O.focus.lerp(this.stage.focus, 1 - Math.exp(-camDt * 10));
      const cp = Math.cos(O.pitch);
      this.camera.position.set(O.focus.x + Math.sin(O.yaw) * cp * O.dist, O.focus.y + Math.sin(O.pitch) * O.dist, O.focus.z + Math.cos(O.yaw) * cp * O.dist);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(O.focus);
    } else {
      const C = this.chase;
      C.sizeScale = { chinook: 1.45, skycrane: 1.55 }[f.aircraft] || 1;
      const heading = alive ? P.heading() : C.yaw;
      const bag = this.stage.carriedPos;
      if (this.snapCam) { C.initialised = false; for (let i = 0; i < 40; i++) C.update(0.1, this.stage.focus, heading, bag, this.sim); }
      else C.update(Math.max(camDt, 1e-4), this.stage.focus, heading, bag, this.sim);
    }
    this.snapCam = false;
    this.cockpitView = fp;
    // Panels.
    this.drawReadout(r, f);
    this.drawTimeline();
    this.drawGraphs();
    this.timeEl.innerHTML = `<b>${fmt(f.wallAt(this.s))}</b> / ${fmt(f.wallDuration())} <small>#${Math.round(this.s)}</small>`;
    return { cockpit: fp, focus: this.stage.focus };
  }

  // ---------------------------------------------------------------- drawing
  sizeCanvases() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const cv of [this.tl, this.gr]) {
      const r = cv.getBoundingClientRect();
      const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    }
    this.dpr = dpr;
  }

  scrubTo(cv, clientX) {
    const f = this.flight;
    if (!f) return;
    const r = cv.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left - (cv === this.gr ? 0 : 0)) / r.width));
    if (cv === this.tl) this.seek(f.indexAtWall(x * f.wallDuration()));
    else { const [w0, w1] = this.window(); this.seek(f.indexAtWall(w0 + x * (w1 - w0))); }
    this.snapCam = false;
  }

  window() {
    const f = this.flight, total = f.wallDuration(), now = f.wallAt(this.s);
    if (!this.win || this.win >= total) return [0, Math.max(total, 0.1)];
    let w0 = now - this.win * 0.6;
    w0 = Math.max(0, Math.min(total - this.win, w0));
    return [w0, w0 + this.win];
  }

  drawTimeline() {
    const cv = this.tl, g = cv.getContext('2d'), W = cv.width, H = cv.height, f = this.flight, d = this.dpr || 1;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(248,241,228,0.08)'; g.fillRect(0, H * 0.3, W, H * 0.4);
    if (!f || !f.n) return;
    const total = Math.max(0.1, f.wallDuration());
    const X = (w) => (w / total) * W;
    // Window shown in the graphs.
    const [w0, w1] = this.window();
    g.fillStyle = 'rgba(242,184,75,0.16)'; g.fillRect(X(w0), 0, Math.max(2, X(w1) - X(w0)), H);
    // Crash: everything after it is wreckage.
    const c = f.crash();
    if (c) { g.fillStyle = 'rgba(255,90,60,0.18)'; g.fillRect(X(c.wall), H * 0.3, W - X(c.wall), H * 0.4); }
    for (const e of f.events) {
      const st = EVENT_STYLE[e.type];
      if (!st) continue;
      g.globalAlpha = st[1]; g.fillStyle = st[0];
      const x = X(e.wall), h = e.type === 'crash' ? H : H * 0.55;
      g.fillRect(x - d * (e.type === 'crash' ? 1.5 : 0.75), (H - h) / 2, d * (e.type === 'crash' ? 3 : 1.5), h);
    }
    g.globalAlpha = 1;
    for (const n of f.notes) {
      const x = X(n.wall);
      g.fillStyle = { good: '#7ddc8f', bad: '#ff6b5a', note: '#f2b84b', mark: '#f2b84b' }[n.tag] || '#f2b84b';
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 7 * d, 3.5 * d); g.lineTo(x, 7 * d); g.closePath(); g.fill();
      g.fillRect(x - 0.75 * d, 0, 1.5 * d, H);
    }
    const px = X(f.wallAt(this.s));
    g.fillStyle = '#fff4e2'; g.fillRect(px - d, 0, 2 * d, H);
    g.beginPath(); g.arc(px, H / 2, 5 * d, 0, Math.PI * 2); g.fill();
  }

  drawGraphs() {
    const cv = this.gr, g = cv.getContext('2d'), W = cv.width, H = cv.height, f = this.flight, d = this.dpr || 1;
    g.clearRect(0, 0, W, H);
    if (!f || !f.n) return;
    const [w0, w1] = this.window();
    const i0 = Math.max(0, Math.floor(f.indexAtWall(w0))), i1 = Math.min(f.n - 1, Math.ceil(f.indexAtWall(w1)));
    const X = (w) => ((w - w0) / (w1 - w0)) * W;
    const n = STRIPS.length, sh = H / n, lab = Math.round(10 * d);
    g.font = `${lab}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
    g.textBaseline = 'top';
    const stride = Math.max(1, Math.floor((i1 - i0) / (W / 1.5)));
    STRIPS.forEach((S, si) => {
      const y0 = si * sh, pad = 3 * d;
      const alt = S.alt && S.alt[f.aircraft];
      const lines = alt || S.lines, scale = alt ? S.alt.scale : (S.scale || 1);
      g.fillStyle = si % 2 ? 'rgba(248,241,228,0.03)' : 'rgba(248,241,228,0.06)';
      g.fillRect(0, y0, W, sh);
      // Range: fixed for sticks, else the window's extent.
      let lo = Infinity, hi = -Infinity;
      if (S.range) [lo, hi] = S.range;
      else {
        for (let i = i0; i <= i1; i += stride) for (const [ch] of lines) { const v = f.samples.get(i, CH[ch]) * scale; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (S.min0 || alt) lo = Math.min(0, lo);
        if (hi - lo < 1e-3) { hi = lo + 1; }
        const m = (hi - lo) * 0.08; hi += m; if (!(S.min0 || alt)) lo -= m;
      }
      const Y = (v) => y0 + pad + (1 - (v - lo) / (hi - lo)) * (sh - 2 * pad);
      if (lo < 0 && hi > 0) { g.fillStyle = 'rgba(248,241,228,0.18)'; g.fillRect(0, Y(0), W, d); }
      for (const [ch, col] of lines) {
        g.strokeStyle = col; g.lineWidth = 1.4 * d; g.beginPath();
        let first = true;
        for (let i = i0; i <= i1; i += stride) {
          const x = X(f.samples.get(i, CH.wall)), y = Y(f.samples.get(i, CH[ch]) * scale);
          if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
        }
        g.stroke();
      }
      // Labels with the value at the playhead.
      const r = this.stage.row;
      let tx = 6 * d;
      const name = alt ? S.alt.name : S.name;
      const parts = [[name, 'rgba(248,241,228,0.9)'], ...lines.map(([ch, col, nm]) => { const v = r[CH[ch]] * scale; return [`${nm} ${v.toFixed(Math.abs(v) < 10 ? 2 : 0)}`, col]; })];
      const tw = parts.reduce((w, [t]) => w + g.measureText(t).width + 8 * d, 0);
      g.fillStyle = 'rgba(28,20,15,0.72)'; g.fillRect(2 * d, y0 + 1 * d, tw + 4 * d, lab + 3 * d);
      for (const [t, col] of parts) { g.fillStyle = col; g.fillText(t, tx, y0 + 2 * d); tx += g.measureText(t).width + 8 * d; }
      g.fillStyle = 'rgba(248,241,228,0.45)';
      const rt = `${hi.toFixed(hi < 10 ? 1 : 0)}${S.unit && !alt ? ' ' + S.unit : ''}`;
      g.fillText(rt, W - g.measureText(rt).width - 4 * d, y0 + 2 * d);
    });
    // Events and notes in the window, then the playhead.
    for (const e of f.events) {
      const st = EVENT_STYLE[e.type];
      if (!st || e.wall < w0 || e.wall > w1) continue;
      g.globalAlpha = st[1] * 0.8; g.fillStyle = st[0];
      g.fillRect(X(e.wall) - 0.5 * d, 0, d, H);
    }
    g.globalAlpha = 1;
    for (const nt of f.notes) {
      if (nt.wall < w0 || nt.wall > w1) continue;
      g.fillStyle = { good: '#7ddc8f', bad: '#ff6b5a' }[nt.tag] || '#f2b84b';
      g.fillRect(X(nt.wall) - d, 0, 2 * d, H);
    }
    g.fillStyle = '#fff4e2';
    g.fillRect(X(f.wallAt(this.s)) - d, 0, 2 * d, H);
  }

  drawReadout(r, f) {
    const alive = r[CH.alive] > 0.5;
    const src = ['keyboard', 'gamepad', 'touch'][r[CH.src]] || 'keyboard';
    const pct = (v) => `${Math.round(v * 100)}%`;
    const lines = alive ? [
      `${NAMES[f.aircraft]} · Assist ${r[CH.assist] > 0.5 ? 'on' : 'off'} · ${src}`,
      `height ${(r[CH.agl] * 100).toFixed(1)} cm   speed ${r[CH.hspeed].toFixed(2)} m/s   climb ${r[CH.vspeed] >= 0 ? '+' : ''}${r[CH.vspeed].toFixed(2)}`,
      `pitch ${r[CH.pitch].toFixed(1)}°  roll ${r[CH.roll].toFixed(1)}°  rates ${r[CH['rate.pitch']].toFixed(0)}/${r[CH['rate.roll']].toFixed(0)}/${r[CH['rate.yaw']].toFixed(0)}°/s`,
      `collective ${pct(r[CH.collective])}  thrust ${pct(r[CH.thrustFrac])}  T/W ${r[CH.tw].toFixed(2)}`,
      r[CH.nCarried] > 0 ? `load ${(r[CH.loadMass] * 1000).toFixed(1)} g  tension ${(r[CH.load] * 1000).toFixed(0)} mN${r[CH.wetness] > 0.01 ? `  wet ${pct(r[CH.wetness])}` : ''}` : 'no load',
    ] : ['Crashed: replaying the wreck'];
    if (alive && f.aircraft === 'skycrane') lines.push(`tank ${pct(r[CH.tankFill])}  doors ${pct(r[CH.tankDoors])}${r[CH.pumping] > 0.5 ? '  pumping' : ''}`);
    const t = lines.join('\n');
    if (this.text.textContent !== t) this.text.textContent = t;
    // Stick positions: left stick (yaw, collective) and right stick (roll, pitch), with each device's raw input faint.
    const g = this.sticks.getContext('2d');
    g.clearRect(0, 0, 120, 58);
    const box = (x, ax, ay, raw) => {
      g.strokeStyle = 'rgba(248,241,228,0.35)'; g.lineWidth = 1;
      g.strokeRect(x + 0.5, 4.5, 50, 50);
      g.beginPath(); g.moveTo(x + 25.5, 4); g.lineTo(x + 25.5, 55); g.moveTo(x, 29.5); g.lineTo(x + 51, 29.5); g.stroke();
      if (raw) { g.fillStyle = 'rgba(127,196,255,0.5)'; g.beginPath(); g.arc(x + 25.5 + raw[0] * 23, 29.5 - raw[1] * 23, 3, 0, 7); g.fill(); }
      g.fillStyle = '#f2b84b'; g.beginPath(); g.arc(x + 25.5 + ax * 23, 29.5 - ay * 23, 4.5, 0, 7); g.fill();
    };
    const gp = r[CH.src] === 1;
    box(4, r[CH['in.yaw']], r[CH['in.coll']], gp ? [r[CH['gp.ax0']], -r[CH['gp.ax1']]] : null);
    box(64, r[CH['in.roll']], r[CH['in.pitch']], gp ? [r[CH['gp.ax2']], -r[CH['gp.ax3']]] : null);
  }
}
