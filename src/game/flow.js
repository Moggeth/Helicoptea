import { PAD, DISCARD } from '../sim/layout.js';

// Contextual onboarding: short hints that advance on what the player actually does. No forced tutorial.
const STEPS = ['lift', 'hook', 'carry', 'dip', 'discard', 'land', 'assist', 'done'];

export class Flow {
  constructor(sim, hud) {
    this.sim = sim;
    this.hud = hud;
    this.step = 0;
    try { this.step = Math.min(STEPS.length - 1, parseInt(localStorage.getItem('helicoptea.hint') || '0', 10) || 0); } catch { /* ignore */ }
    this.t = 0;
    this.assistToggled = false;
    try { this.assistToggled = localStorage.getItem('helicoptea.assistTried') === '1'; } catch { /* ignore */ }
    this.crashShownFor = 0;
    this.steepTimers = sim.cups.map(() => 0);
    this.quiet = false;   // the guided flight (game/tutorial.js) owns the hint card while it runs
  }

  save() { try { localStorage.setItem('helicoptea.hint', String(this.step)); } catch { /* ignore */ } }
  skip() { this.step = STEPS.length - 1; this.save(); }
  replay() { this.step = 0; this.save(); }
  noteAssistToggled() {
    this.assistToggled = true;
    try { localStorage.setItem('helicoptea.assistTried', '1'); } catch { /* ignore */ }
    if (STEPS[this.step] === 'assist') this.advance();
  }
  advance() { this.step = Math.min(STEPS.length - 1, this.step + 1); this.t = 0; this.save(); }

  handleEvents(events) {
    for (const e of events) {
      const s = STEPS[this.step];
      if (e.type === 'attach' && s === 'hook') this.advance();
      if (e.type === 'splash' && s === 'carry' && e.bag.attach) this.advance();
      if (e.type === 'release' && !e.bag?.isBucket && (s === 'discard' || s === 'dip')) { this.step = STEPS.indexOf('land'); this.save(); }
      if (e.type === 'milkLand' && !e.vessel.isBowl) { const i = this.sim.cups.indexOf(e.vessel); if (i >= 0) this.steepTimers[i] = 2.5; }
    }
  }

  update(dt) {
    const sim = this.sim, hud = this.hud;
    this.t += dt;
    const s = STEPS[this.step];
    const h = sim.heli;
    const carried = sim.carriedBag();
    // auto-advance conditions
    // Startup clearance is a placeholder; the first force pass also precedes Rapier's query update.
    if (s === 'lift' && h && sim.stepCount > 1 && !h.grounded && h.skidClearance > 0.06) this.advance();
    if (s === 'carry' && carried && carried.immersion > 0.25) this.advance();
    if (s === 'dip' && carried && carried.wetness > 0.55 && carried.immersion < 0.05) this.advance();
    if (s === 'land' && h && h.grounded && Math.hypot(h.pos.x - PAD.x, h.pos.z - PAD.z) < PAD.radius + 0.02) this.advance();
    if (s === 'assist' && (this.assistToggled || this.t > 14)) this.advance();

    const k = (a) => hud.key(a);
    const dev = hud.device;
    const texts = {
      lift: `Hold ${k('lift')} to lift off the pad.${dev === 'keyboard' ? ` ${k('steer')}` : dev === 'touch' ? ` Tilt with the ${hud.touchStick('pitch')} stick.` : ''}`,
      hook: 'Fly to the tea stand and bring the brass hook under the helicopter close to a bag\'s loop.',
      carry: 'Carry it to a cup. Ease off early: the bag keeps swinging after you stop.',
      dip: 'Lower it right in and let it steep. Watch the tea darken, then lift it out.',
      discard: `It's heavier now. Drop it on the saucer with ${k('attach')}.`,
      land: 'Lovely. Now settle back down on the cork pad.',
      assist: `Ready for the real thing? Switch Flight Assist off with ${k('assist')}. You'll hold the attitude yourself.`,
      done: null,
    };
    const showHint = sim.state === 'flying' && s !== 'done' && !(s === 'hook' && sim.attachCandidate());
    if (!this.quiet) hud.showHint(this.step + 1, showHint ? texts[s] : null);

    // Contextual prompt for attach/release.
    let prompt = null;
    if (sim.state === 'flying') {
      const cand = sim.attachCandidate();
      if (cand) prompt = cand.isBucket ? `${k('attach')} Hook the milk bucket` : `${k('attach')} Hook the bag`;
      else if (carried && (s === 'discard' || s === 'land' || s === 'done' || s === 'assist' || this.overDiscard(carried))) prompt = this.overDiscard(carried) ? `${k('attach')} Release over the saucer` : null;
    }
    if (!prompt && sim.state === 'flying') prompt = this.milkPrompt(k);
    hud.showPrompt(prompt);
    hud.setInvite(!this.quiet && !this.assistToggled && sim.assist && s !== 'assist');

    for (let i = 0; i < sim.cups.length; i++) {
      if (sim.cups[i].steep > 0.05) this.steepTimers[i] = 2.5;
      else this.steepTimers[i] = Math.max(0, this.steepTimers[i] - dt);
    }
  }

  // Contextual milk prompts while the bucket is on a hook.
  milkPrompt(k) {
    const sim = this.sim, bk = sim.milk.bucket;
    const h = sim.heli;
    if (h && h.tank) {
      const t = h.tank;
      if (t.auto || t.salvo || t.pumping || t.flowOut > 0) return null;
      if (h.hose.submerged && t.vol < t.capacity * 0.97) return `Intake in the milk: hold ${k('pump')} to pump`;
      if (t.vol < 1e-7) return `Hover low over the milk crock and hold ${k('pump')} to pump (${k('autofill')}: auto-fill)`;
      const cup = sim.cups.find((c) => Math.hypot(h.pos.x - c.x, h.pos.z - c.z) < c.rIn + 0.02);
      return cup ? `${k('doors')} opens the belly doors over the ${cup.name.toLowerCase()} (${k('salvo')}: salvo)` : `Fly over a cup, then ${k('doors')} to drop the milk`;
    }
    if (!bk || !sim.carriedCargo().includes(bk)) return null;
    if (bk.vessel && bk.vessel.isBowl) return bk.fill > 0.97 ? 'Full. Lift it out gently' : 'Hold it in the milk: it fills through its base';
    if (bk.vol < 1e-7) return 'Dip the bucket in the milk crock to fill it';
    if (bk.valveOpen) return null;
    const cup = sim.cups.find((c) => Math.hypot(bk.pos.x - c.x, bk.pos.z - c.z) < c.rIn);
    return cup ? `Hold ${k('pour')} to pour into the ${cup.name.toLowerCase()}` : `Hold ${k('pour')} to pour milk`;
  }

  overDiscard(bag) {
    return Math.hypot(bag.pos.x - DISCARD.x, bag.pos.z - DISCARD.z) < DISCARD.radius + 0.01;
  }
}
