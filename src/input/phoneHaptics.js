// Phone haptics: short taps under the thumbs for things the aircraft feels (lift-off, touchdown, a hook
// biting, a bump, a crash). Android Chrome has the Vibration API with durations. iPhone Safari has none;
// from iOS 18 toggling a native `<input type="checkbox" switch>` gives a light system tick, so there every
// cue is one tick (several, spaced, for a crash). Best effort everywhere: no API, no buzz, never an error.
export const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class PhoneHaptics {
  constructor() {
    this.enabled = true;
    this.canVibrate = typeof navigator.vibrate === 'function' && !IS_IOS;
    this.last = 0;
    this.sw = null;
    if (!this.canVibrate && IS_IOS) {
      // An off-screen switch inside a label: clicking the label toggles the switch, and iOS ticks.
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      this.sw = label;
    }
  }

  get supported() { return this.canVibrate || !!this.sw; }

  // One tap of about `ms` (Android) or one tick (iPhone). `gap` keeps a stream of events from buzzing
  // continuously: taps closer than that are dropped unless `force`.
  tap(ms = 12, { gap = 60, force = false } = {}) {
    if (!this.enabled) return false;
    const now = performance.now();
    if (!force && now - this.last < gap) return false;
    this.last = now;
    try {
      if (this.canVibrate) return navigator.vibrate(Math.max(1, Math.round(ms)));
      if (this.sw) { this.sw.click(); return true; }
    } catch { /* blocked before the first gesture, or by the OS */ }
    return false;
  }

  // A rhythm: [on, off, on, ...] in ms. iPhone ticks once per "on".
  pattern(p) {
    if (!this.enabled) return false;
    this.last = performance.now();
    try {
      if (this.canVibrate) return navigator.vibrate(p);
      if (this.sw) { let t = 0; p.forEach((d, i) => { if (i % 2 === 0) setTimeout(() => this.sw.click(), t); t += d; }); return true; }
    } catch { /* see tap */ }
    return false;
  }
}

// What the aircraft feels, as phone taps. Strength comes through as duration on Android.
export function hapticForEvent(h, e) {
  switch (e.type) {
    case 'liftoff': return h.tap(14, { gap: 250 });
    case 'touchdown': return h.tap(Math.min(45, 14 + e.speed * 60), { gap: 200 });
    case 'attach': return h.tap(18, { force: true });
    case 'release': return h.tap(10, { force: true });
    case 'bump': return h.tap(Math.min(50, 20 + e.dv * 25), { gap: 120 });
    case 'snatch': return h.tap(Math.min(30, 10 + e.speed * 30), { gap: 150 });
    case 'rotorTick': return e.harmless ? false : h.tap(16, { gap: 120 });
    case 'tailStrike': return h.pattern([40, 50, 40]);
    case 'rotorShatter': return h.pattern([70, 40, 70]);
    case 'crash': return h.pattern([90, 50, 60, 50, 140]);
    default: return false;
  }
}
