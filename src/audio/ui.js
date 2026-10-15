// Menu and game-state cues, made of tea things: a teaspoon tapping china for focus, a cup set down on
// its saucer to confirm, a lighter clink back. They go straight to the master (no room, no cockpit).
// Note the browser holds sound until the first click or key, and the game suspends sound while paused,
// so the pause menu stays silent by design.

const R = Math.random;

function clink(a, f, gain, decay = 0.09, delay = 0) {
  const out = a.uiBus;
  a.tone({ freq: f, to: f * 0.997, gain, attack: 0.001, decay, out, delay });
  a.tone({ freq: f * 2.32, gain: gain * 0.35, attack: 0.001, decay: decay * 0.5, out, delay });
  a.noiseBurst({ freq: f * 2.5, q: 3, gain: gain * 0.4, attack: 0.0005, decay: 0.006, out, delay });
}

export function uiSound(a, kind, o = {}) {
  const out = a.uiBus;
  switch (kind) {
    case 'focus': clink(a, 3300 + R() * 120, 0.018, 0.05); break;
    case 'select': clink(a, 2350, 0.035, 0.12); clink(a, 3150, 0.025, 0.15, 0.055); break;
    case 'back': clink(a, 2700, 0.028, 0.08); clink(a, 2050, 0.022, 0.12, 0.05); break;
    case 'on': clink(a, 2100, 0.025, 0.07); clink(a, 2800, 0.025, 0.1, 0.045); break;
    case 'off': clink(a, 2800, 0.022, 0.07); clink(a, 2100, 0.022, 0.1, 0.045); break;
    case 'slide': {
      const v = Math.max(0, Math.min(1, o.value ?? 0.5));
      clink(a, 1800 + 2200 * v, 0.012, 0.03);
      break;
    }
    case 'toast': // a spoon stirring once round the cup
      a.tone({ freq: 2093, gain: 0.014, attack: 0.002, decay: 0.35, out });
      a.tone({ freq: 3136, gain: 0.008, attack: 0.002, decay: 0.25, out, delay: 0.07 });
      break;
    case 'view': // a camera mount clicking over
      a.noiseBurst({ freq: 4200, q: 4, gain: 0.03, decay: 0.008, out });
      a.noiseBurst({ freq: 2300, q: 4, gain: 0.025, decay: 0.012, out, delay: 0.028 });
      break;
    case 'start': clink(a, 2350, 0.04, 0.2); clink(a, 2960, 0.03, 0.25, 0.08); clink(a, 3520, 0.022, 0.35, 0.16); break;
    case 'attach': clink(a, 3500, 0.008, 0.04, 0.02); break;
    case 'release': break;
    case 'restart': clink(a, 2350, 0.03, 0.12); clink(a, 3520, 0.022, 0.2, 0.09); break;
    default: break;
  }
}

// Plays menu sounds for the HUD and start screen by listening to the DOM (no changes inside the HUD).
export function bindUi(audio, roots) {
  let lastPointer = 0, lastSound = 0;
  const live = () => audio.ready && audio.ctx.state === 'running';
  const inside = (el) => roots.some((r) => r && r.contains(el));
  const play = (k, o) => { if (!live()) return; const n = performance.now(); if (k === 'focus' && n - lastSound < 70) return; lastSound = n; audio.ui(k, o); };
  addEventListener('pointerdown', () => { lastPointer = performance.now(); }, true);
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!inside(el) || !el.matches('button, input, select, [tabindex]')) return;
    if (performance.now() - lastPointer < 400) return; // a click focuses as well: let the click speak
    play('focus');
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('button');
    if (!el || !inside(el)) return;
    const act = (el.dataset.act || el.dataset.action || '').toLowerCase();
    play(/close|back|resume|cancel|done/.test(act) || /close|back|cancel/i.test(el.textContent || '') ? 'back' : 'select');
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!inside(el)) return;
    if (el.type === 'checkbox') play(el.checked ? 'on' : 'off');
    else if (el.tagName === 'SELECT') play('select');
  });
  let lastSlide = 0;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!inside(el) || el.type !== 'range') return;
    const n = performance.now();
    if (n - lastSlide < 45) return;
    lastSlide = n;
    const lo = parseFloat(el.min || 0), hi = parseFloat(el.max || 1);
    play('slide', { value: (parseFloat(el.value) - lo) / (hi - lo || 1) });
  });
}
