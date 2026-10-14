import { CFG } from '../config.js';
import { KNOBS, KNOB, AIRCRAFT, PRESETS, knobDefault, appliesTo } from './knobs.js';

// Tuning state: global values plus per-aircraft multipliers, written live into CFG (the sims read CFG
// every step, so changes apply immediately; inertia applies on the next restart).
// effective = aircraft base × global × per-aircraft.

const KEY = 'helicoptea.tuning.v1';

const getPath = (path) => { const p = path.split('.'); let o = CFG; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; return [o, p[p.length - 1]]; };
const clone = (v) => (Array.isArray(v) ? v.slice() : v);

export class Tuning {
  constructor({ storage = true } = {}) {
    this.storage = storage;
    this.base = new Map();     // path -> base value captured from config.js
    for (const k of KNOBS) for (const path of this.paths(k)) {
      if (this.base.has(path)) continue;
      const [o, key] = getPath(path);
      if (o && key in o) this.base.set(path, clone(o[key]));
    }
    this.state = this.blank();
    this.listeners = [];
    this.worldSpeedHooks = null; // { get(), set(v) } provided by main
    if (storage) this.load();
    this.apply();
  }

  blank() {
    const s = { global: {}, aircraft: {} };
    for (const a of AIRCRAFT) s.aircraft[a] = {};
    return s;
  }

  paths(k) {
    if (!k.targets) return [];
    const out = [];
    for (const v of Object.values(k.targets)) out.push(...v);
    return out;
  }

  // ---------------------------------------------------------------- values
  getGlobal(id) {
    const k = KNOB[id];
    if (k.kind === 'world') return this.worldSpeedHooks ? this.worldSpeedHooks.get() : CFG.physics.worldSpeed;
    return this.state.global[id] ?? knobDefault(k);
  }
  getAircraft(a, id) { return this.state.aircraft[a][id] ?? 1; }

  setGlobal(id, v) {
    const k = KNOB[id];
    if (k.kind === 'world') { if (this.worldSpeedHooks) this.worldSpeedHooks.set(v); this.emit(); return; }
    if (Math.abs(v - knobDefault(k)) < 1e-6) delete this.state.global[id];
    else this.state.global[id] = v;
    this.commit();
  }
  setAircraft(a, id, v) {
    if (Math.abs(v - 1) < 1e-6) delete this.state.aircraft[a][id];
    else this.state.aircraft[a][id] = v;
    this.commit();
  }

  resetGlobal(id) { if (KNOB[id].kind === 'world') this.setGlobal(id, CFG.physics.worldSpeed); else { delete this.state.global[id]; this.commit(); } }
  resetAircraft(a, id) { delete this.state.aircraft[a][id]; this.commit(); }
  resetGroup(scope, group) {
    for (const k of KNOBS) {
      if (k.group !== group) continue;
      if (scope === 'global') { if (k.kind !== 'world') delete this.state.global[k.id]; }
      else delete this.state.aircraft[scope][k.id];
    }
    this.commit();
  }
  resetAll() { this.state = this.blank(); this.commit(); }

  applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    this.state.global = { ...p.global };
    this.commit();
  }

  isChanged(scope, id) {
    if (scope === 'global') return KNOB[id].kind !== 'world' && id in this.state.global;
    return id in this.state.aircraft[scope];
  }
  changedCount(scope) { return Object.keys(scope === 'global' ? this.state.global : this.state.aircraft[scope]).length; }

  // ---------------------------------------------------------------- apply to CFG
  // overrides: optional { scope: 'global'|aircraft, id, value } used by previews (not persisted).
  apply(override = null) {
    const val = (scope, id) => {
      if (override && override.id === id && override.scope === scope) return override.value;
      return scope === 'global' ? this.getGlobalRaw(id) : this.getAircraft(scope, id);
    };
    for (const k of KNOBS) {
      if (!k.targets) continue;
      const g = k.global ? val('global', k.id) : 1;
      for (const [scope, paths] of Object.entries(k.targets)) {
        const m = scope === 'global' ? g : g * (k.perAircraft && appliesTo(k, scope) ? val(scope, k.id) : 1);
        for (const path of paths) {
          if (!this.base.has(path)) continue;
          const base = this.base.get(path);
          const [o, key] = getPath(path);
          if (k.kind === 'excess') o[key] = 1 + (base - 1) * m;
          else if (Array.isArray(base)) o[key] = base.map((b) => b * m);
          else o[key] = base * m;
        }
      }
    }
    // Sticks (absolute values).
    this.sticks = {
      deadzone: val('global', 'deadzone'),
      expo: val('global', 'expo'),
      rates: val('global', 'rates'),
    };
  }
  getGlobalRaw(id) { return this.state.global[id] ?? knobDefault(KNOB[id]); }

  // Map one stick axis through the board's deadzone, expo and rates (cyclic and pedals).
  shape(x) {
    const s = this.sticks;
    if (!s || (s.deadzone === 0 && s.expo === 0 && s.rates === 1)) return x;
    const a = Math.abs(x);
    if (a <= s.deadzone) return 0;
    const n = (a - s.deadzone) / (1 - s.deadzone);
    const e = s.expo;
    return Math.sign(x) * Math.min(1, ((1 - e) * n + e * n * n * n) * s.rates);
  }
  shapeCtl(ctl) {
    ctl.pitch = this.shape(ctl.pitch);
    ctl.roll = this.shape(ctl.roll);
    ctl.yaw = this.shape(ctl.yaw);
    return ctl;
  }

  // ---------------------------------------------------------------- persistence, sharing
  commit() {
    this.apply();
    this.save();
    this.emit();
  }
  emit() { for (const f of this.listeners) f(); }
  onChange(f) { this.listeners.push(f); }

  save() {
    if (!this.storage) return;
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* ignore */ }
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.importState(JSON.parse(raw), false);
    } catch { /* ignore */ }
  }

  exportText() {
    return JSON.stringify({ helicopteaTuning: 1, worldSpeed: this.getGlobal('worldSpeed'), ...this.state }, null, 2);
  }

  // Accepts the export format; ignores unknown knobs and clamps to each knob's range.
  importState(obj, commit = true) {
    if (!obj || typeof obj !== 'object') throw new Error('Not a tuning file');
    const s = this.blank();
    const ok = (k, v) => typeof v === 'number' && Number.isFinite(v);
    const clampK = (k, v) => Math.min(k.max, Math.max(k.min, v));
    for (const [id, v] of Object.entries(obj.global || {})) {
      const k = KNOB[id];
      if (k && k.kind !== 'world' && ok(k, v)) s.global[id] = clampK(k, v);
    }
    for (const a of AIRCRAFT) for (const [id, v] of Object.entries((obj.aircraft || {})[a] || {})) {
      const k = KNOB[id];
      if (k && k.perAircraft && appliesTo(k, a) && ok(k, v)) { const [lo, hi] = aircraftRange(k); s.aircraft[a][id] = Math.min(hi, Math.max(lo, v)); }
    }
    this.state = s;
    if (typeof obj.worldSpeed === 'number' && this.worldSpeedHooks) this.worldSpeedHooks.set(Math.min(1, Math.max(0.4, obj.worldSpeed)));
    if (commit) this.commit(); else this.apply();
  }
}

// Ranges for per-aircraft multipliers (the spec: ×0.5 to ×2, thrust ×0.7 to ×1.5, Chinook extras by knob).
export function aircraftRange(k) {
  if (k.only) return [k.min, k.max];
  if (k.id === 'thrustToWeight') return [0.7, 1.5];
  return [0.5, 2];
}
