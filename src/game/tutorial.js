// Guided first flight: one skill at a time in the real game, each step waiting until the player has
// actually done it. It drives the same hint card as the contextual tips (game/flow.js), which go quiet
// while it runs; Flow's hook / pour prompts stay on. Prompts are rebuilt every frame from hud.device, so
// they follow whichever controller the player picks up.

const AIR = 0.03;   // skid clearance (m) that counts as properly airborne
const hs = (h) => Math.hypot(h.vel.x, h.vel.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Each step: text(c) for the card, enter(s) once, check(s, dt) returning progress (>= 1 finishes it).
// s is a scratch object reset on entry; s.air marks that the player has been airborne since, cleared on a
// restart so a respawn on the pad can't finish a step that wants a landing.
const STEPS = [
  {
    id: 'lift',
    text: (c) => c.dev === 'hotas'
      ? `Let's fly. Push ${c.k('lift') || c.fly('liftUp')} to climb off the pad, then bring it back to the middle to hold your height.`
      : `Let's fly. Hold ${c.fly('liftUp')} to climb off the pad. Let go and it springs back to the middle: you hold your height.`,
    check: (s, dt, sim) => (sim.heli && !sim.heli.grounded && sim.heli.skidClearance > 0.1 ? 1 : 0),
  },
  {
    id: 'hover',
    text: () => 'Now let go of everything and just hover. Nice and still.',
    check: (s, dt, sim) => {
      const h = sim.heli;
      const still = h && !h.grounded && h.skidClearance > AIR && hs(h) < 0.07 && Math.abs(h.vel.y) < 0.08;
      s.t = still ? (s.t || 0) + dt : Math.max(0, (s.t || 0) - dt * 2);
      return s.t / 2.5;
    },
  },
  {
    id: 'drift',
    text: (c) => `Tilt with ${c.fly('tilt')}. It leans first, then slides that way, slowly at first. Drift a little way.`,
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
    text: (c) => `Turn with ${c.fly('yaw')}. Swing right round to face the other way.`,
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
    text: (c, s) => s.fast
      ? 'And stop. It keeps sliding, so tilt the other way early and ease off as it slows.'
      : `Now a little speed: tilt with ${c.fly('tilt')} and let it build. Mind the teapot.`,
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
    text: (c) => `Bring it down on anything flat. Ease ${c.fly('liftDown')} and touch down gently.`,
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
    text: (c, s, sim) => (sim.attachCandidate()
      ? `In reach. ${c.k('attach')} to hook it.`
      : 'Tea time. Fly to the tea stand just ahead and bring the brass hook under you close to a bag\'s loop.'),
    check: (s, dt, sim) => (sim.carriedBag() ? 1 : 0),
  },
  {
    id: 'dip',
    text: (c, s, sim) => {
      const b = sim.carriedBag();
      return b && b.immersion > 0.2
        ? 'Hold it there and let it steep. Watch the tea darken.'
        : 'Carry it to a cup and lower it right into the tea. Ease off early: the bag keeps swinging.';
    },
    back: (sim) => !sim.carriedBag() && 'hook',
    check: (s, dt, sim) => { const b = sim.carriedBag(); return b ? b.wetness / 0.55 : 0; },
  },
  {
    id: 'drop',
    text: (c) => `Lovely. Lift it out and let go with ${c.k('attach')}. The saucer is the tidy spot.`,
    check: (s, dt, sim) => (sim.carriedBag() ? 0 : 1),
  },
  {
    id: 'bucket',
    text: (c, s, sim) => (sim.attachCandidate()?.isBucket
      ? `${c.k('attach')} to hook the bucket.`
      : 'Now milk. Hook the little milk bucket hanging by the crock, to the right of the tea stand.'),
    check: (s, dt, sim) => (bucketOn(sim) ? 1 : 0),
  },
  {
    id: 'fill',
    text: () => 'Lower it into the milk crock. It fills through its base. Then lift it out gently.',
    back: (sim) => !bucketOn(sim) && 'bucket',
    check: (s, dt, sim) => { const b = sim.milk.bucket; return b ? b.fill / 0.5 : 0; },
  },
  {
    id: 'pour',
    text: (c) => `Fly it over a cup and hold ${c.k('pour')} to pour. A splash will do.`,
    back: (sim) => !bucketOn(sim) && 'bucket',
    on: { milkLand: (s, e) => !e.vessel.isBowl },
  },
  {
    id: 'assist',
    text: (c) => `So far Flight Assist has been levelling you. Switch it off with ${c.k('assist')} and fly it yourself.`,
    check: (s, dt, sim) => (sim.assist ? 0 : 1),
  },
  {
    id: 'raw',
    text: (c, s, sim) => (sim.heli && sim.heli.grounded
      ? `Assist off. Lift off with ${c.fly('liftUp')}: centred, the lift stick lets you settle gently.`
      : 'Nothing levels you now. Hold a touch of lift to stay up, catch every drift early, and hover still.'),
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
    text: (c) => `Last thing: change camera with ${c.cam()}. Try a couple.`,
    check: (s) => (s.cams || 0) / 2,
  },
  {
    id: 'done',
    text: (c, s, sim) => `That's your first flight. ${sim.assist ? '' : `${c.k('assist')} brings Flight Assist back any time. `}The pause menu has this lesson again.`,
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
    this.hud.showHint(0, null);
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
    const c = this.words();
    const needsHook = HOOK_STEPS.has(cur.id) && sim.aircraft === 'skycrane';
    const html = sim.state !== 'flying' ? null
      : needsHook ? 'The tea steps need a hook: pick the Micro heli in the pause menu, or end the lesson here.'
        : cur.text(c, this.s, sim);
    // The numbered steps are the skills; the closing card has no number.
    this.hud.showHint(cur.quiet ? '✓' : this.i + 1, html, {
      progress: cur.check && !cur.quiet && this.progress > 0 ? Math.min(1, this.progress) : null,
      skip: 'End lesson',
    });
  }

  // Device-aware wording for the current step text.
  words() {
    const hud = this.hud;
    const k = (a) => { try { return hud.key(a) || ''; } catch { return ''; } };
    return { dev: hud.device, k, fly: (w) => hud.flyName(w), cam: () => hud.camKey() };
  }
}
