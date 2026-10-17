// Guided first flight: one skill at a time in the real game, each step waiting until the player has
// actually done it. It shows its own big card (hud.showLesson): a looping picture of the skill, a picture of
// the control that does it on the device in hand, and a few large words. The contextual tips (game/flow.js)
// go quiet while it runs; Flow's hook / pour prompts stay on. The control is rebuilt from hud.device and the
// player's bindings every frame, so it follows whichever controller the player picks up.

const AIR = 0.03;   // skid clearance (m) that counts as properly airborne
const hs = (h) => Math.hypot(h.vel.x, h.vel.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Each step: card(s, sim) => { title, sub, ctl } (ctl names a control for hud.lessonControl), enter(s) once,
// check(s, dt) returning progress (>= 1 finishes it). s is a scratch object reset on entry; s.air marks that
// the player has been airborne since, cleared on a restart so a respawn on the pad can't fake a landing.
// Words are few and plain on purpose: the pictures carry the lesson.
const STEPS = [
  {
    id: 'lift',
    card: () => ({ title: 'Lift off', sub: 'Hold to climb. Let go to stay up.', ctl: 'liftUp' }),
    check: (s, dt, sim) => (sim.heli && !sim.heli.grounded && sim.heli.skidClearance > 0.1 ? 1 : 0),
  },
  {
    id: 'hover',
    card: () => ({ title: 'Hover', sub: 'Hands off. Stay still.' }),
    check: (s, dt, sim) => {
      const h = sim.heli;
      const still = h && !h.grounded && h.skidClearance > AIR && hs(h) < 0.07 && Math.abs(h.vel.y) < 0.08;
      s.t = still ? (s.t || 0) + dt : Math.max(0, (s.t || 0) - dt * 2);
      return s.t / 2.5;
    },
  },
  {
    id: 'drift',
    card: () => ({ title: 'Tilt to move', sub: 'It leans, then slides.', ctl: 'tilt' }),
    enter: (s, sim) => { s.from = sim.heli ? sim.heli.pos.clone() : null; },
    check: (s, dt, sim) => {
      const h = sim.heli;
      if (!h) return 0;
      if (!s.from) s.from = h.pos.clone();
      return Math.hypot(h.pos.x - s.from.x, h.pos.z - s.from.z) / 0.2;
    },
  },
  {
    id: 'turn',
    card: () => ({ title: 'Turn around', ctl: 'yaw' }),
    check: (s, dt, sim) => {
      const h = sim.heli;
      if (!h) return 0;
      const y = h.heading();
      if (s.yaw !== undefined) s.turned = (s.turned || 0) + Math.abs(wrap(y - s.yaw));
      s.yaw = y;
      return (s.turned || 0) / Math.PI;
    },
  },
  {
    id: 'stop',
    // Two parts: build some speed, then bring it to a stop. Momentum is the lesson.
    card: (s) => (s.fast
      ? { title: 'Now stop', sub: 'Tilt back early. It keeps sliding.', ctl: 'tilt' }
      : { title: 'Speed up', sub: 'Tilt and let it build.', ctl: 'tilt' }),
    check: (s, dt, sim) => {
      const h = sim.heli;
      if (!h || h.grounded) return 0;
      const v = hs(h);
      if (!s.fast) { s.top = Math.max(s.top || 0, v); if (v > 0.32) s.fast = true; return 0.5 * Math.min(1, v / 0.32); }
      s.t = v < 0.05 ? (s.t || 0) + dt : 0;
      return 0.5 + 0.5 * Math.min(1, s.t / 0.6);
    },
  },
  {
    id: 'land',
    card: () => ({ title: 'Land', sub: 'Down gently, on anything flat.', ctl: 'liftDown' }),
    check: (s, dt, sim) => {
      const h = sim.heli;
      if (!h) return 0;
      // A respawn's first steps read as airborne before the physics settles: count real flight only.
      if (!h.grounded) { s.up = h.skidClearance > AIR ? (s.up || 0) + dt : 0; if (s.up > 0.15) s.air = true; s.t = 0; return 0; }
      if (!s.air) return 0;
      s.t = (s.t || 0) + dt;
      return s.t / 0.6;
    },
  },
  {
    id: 'hook',
    card: (s, sim) => (sim.attachCandidate()
      ? { title: 'Hook it!', ctl: 'attach' }
      : { title: 'Hook a tea bag', sub: 'Fly the hook to a bag\'s loop on the stand.' }),
    check: (s, dt, sim) => (sim.carriedBag() ? 1 : 0),
  },
  {
    id: 'dip',
    card: (s, sim) => {
      const b = sim.carriedBag();
      return b && b.immersion > 0.2 ? { title: 'Hold it in', sub: 'Watch the tea darken.' } : { title: 'Dip it in tea', sub: 'Lower it into a cup.' };
    },
    back: (sim) => !sim.carriedBag() && 'hook',
    check: (s, dt, sim) => { const b = sim.carriedBag(); return b ? b.wetness / 0.55 : 0; },
  },
  {
    id: 'drop',
    card: () => ({ title: 'Let it go', sub: 'Lift it out first.', ctl: 'attach' }),
    check: (s, dt, sim) => (sim.carriedBag() ? 0 : 1),
  },
  {
    id: 'bucket',
    card: (s, sim) => (sim.attachCandidate()?.isBucket
      ? { title: 'Hook it!', ctl: 'attach' }
      : { title: 'Hook the milk bucket', sub: 'It hangs by the milk crock.' }),
    check: (s, dt, sim) => (bucketOn(sim) ? 1 : 0),
  },
  {
    id: 'fill',
    card: () => ({ title: 'Fill it with milk', sub: 'Lower it into the crock.' }),
    back: (sim) => !bucketOn(sim) && 'bucket',
    check: (s, dt, sim) => { const b = sim.milk.bucket; return b ? b.fill / 0.5 : 0; },
  },
  {
    id: 'pour',
    card: () => ({ title: 'Pour into a cup', sub: 'Hold over a cup.', ctl: 'pour' }),
    back: (sim) => !bucketOn(sim) && 'bucket',
    on: { milkLand: (s, e) => !e.vessel.isBowl },
  },
  {
    id: 'assist',
    card: () => ({ title: 'Assist off', sub: 'Now you fly it yourself.', ctl: 'assist' }),
    check: (s, dt, sim) => (sim.assist ? 0 : 1),
  },
  {
    id: 'raw',
    card: (s, sim) => (sim.heli && sim.heli.grounded
      ? { title: 'Lift off', sub: 'Assist is off.', ctl: 'liftUp' }
      : { title: 'Hover by hand', sub: 'A little lift. Catch every drift.', ctl: 'liftUp' }),
    back: (sim) => sim.assist && 'assist',
    check: (s, dt, sim) => {
      const h = sim.heli;
      const still = h && !h.grounded && h.skidClearance > AIR && hs(h) < 0.1 && Math.abs(h.vel.y) < 0.12;
      s.t = still ? (s.t || 0) + dt : Math.max(0, (s.t || 0) - dt);
      return s.t / 2.5;
    },
  },
  {
    id: 'camera',
    card: () => ({ title: 'Change camera', sub: 'Try two.', ctl: 'camera' }),
    check: (s) => (s.cams || 0) / 2,
  },
  {
    id: 'done',
    card: (s, sim) => ({ title: 'You can fly!', sub: sim.assist ? 'Have a cuppa.' : 'Assist comes back with this.', ctl: sim.assist ? null : 'assist' }),
    check: (s, dt) => { s.t = (s.t || 0) + dt; return s.t / 7; },
    quiet: true,
  },
];

function bucketOn(sim) { const b = sim.milk && sim.milk.bucket; return !!(b && b.attach && b.attach.kind === 'heli'); }

export const TUTORIAL_STEPS = STEPS.map((s) => s.id);
const HOOK_STEPS = new Set(['hook', 'dip', 'drop', 'bucket', 'fill', 'pour']);

export class Tutorial {
  // hooks: { begin() sets up a fresh flight, end(done), ding() plays the step chime }
  constructor(sim, hud, hooks = {}) {
    this.sim = sim;
    this.hud = hud;
    this.hooks = hooks;
    this.active = false;
    this.i = 0;
    this.s = {};
    this.progress = 0;
    this.card = null;   // what the card shows now (tests read it)
  }

  get step() { return STEPS[this.i].id; }

  start() {
    this.active = true;
    this.hooks.begin?.();
    this.go(0);
  }

  end(done = false) {
    if (!this.active) return;
    this.active = false;
    this.card = null;
    this.hud.showLesson(null);
    this.hooks.end?.(done);
  }

  go(i) {
    this.i = Math.max(0, Math.min(STEPS.length - 1, i));
    this.s = {};
    this.progress = 0;
    STEPS[this.i].enter?.(this.s, this.sim);
  }

  next() {
    if (this.i >= STEPS.length - 1) { this.end(true); return; }
    if (!STEPS[this.i].quiet) this.hooks.ding?.();
    this.go(this.i + 1);
  }

  noteCamera() { if (this.active) this.s.cams = (this.s.cams || 0) + 1; }

  handleEvents(events) {
    if (!this.active) return;
    for (const e of events) {
      if (e.type === 'restart') this.s.air = this.s.up = 0;
      const on = STEPS[this.i].on?.[e.type];
      if (on && on(this.s, e)) { this.next(); return; }
    }
  }

  update(dt) {
    if (!this.active) return;
    const sim = this.sim;
    const st = STEPS[this.i];
    const back = st.back?.(sim);
    if (back) { this.go(TUTORIAL_STEPS.indexOf(back)); return this.update(0); }
    if (sim.state === 'flying' && st.check) {
      this.progress = Math.max(0, st.check(this.s, dt, sim));
      if (this.progress >= 1) { this.next(); if (!this.active) return; }
    }
    const cur = STEPS[this.i];
    if (sim.state !== 'flying') { this.card = null; this.hud.showLesson(null); return; }
    const words = HOOK_STEPS.has(cur.id) && sim.aircraft === 'skycrane'
      ? { title: 'Needs a hook', sub: 'Pick the Micro heli in the pause menu.' }
      : cur.card(this.s, sim);
    let ctl = null;
    if (words.ctl) { try { ctl = this.hud.lessonControl(words.ctl); } catch { ctl = null; } }
    // The skills are numbered; the closing card has no number.
    this.card = {
      n: cur.quiet ? 0 : this.i + 1, total: STEPS.length - 1, scene: cur.id, title: words.title, sub: words.sub || '', ctl,
      progress: cur.check && !cur.quiet && this.progress > 0 ? Math.min(1, this.progress) : null,
    };
    this.hud.showLesson(this.card);
  }
}
