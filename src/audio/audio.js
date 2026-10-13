// Procedural Web Audio: every sound is synthesised at runtime (no sample files, no licences needed).
// The rotor bed responds to rotor speed and load, so the sound carries physical feedback.

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.muted = false;
    this.ready = false;
    this.lastClatter = 0;
    this.lastHit = 0;
    try {
      const v = localStorage.getItem('helicoptea.volume');
      const m = localStorage.getItem('helicoptea.muted');
      if (v !== null) this.volume = Math.min(1, Math.max(0, parseFloat(v)));
      if (m !== null) this.muted = m === '1';
    } catch { /* storage unavailable */ }
  }

  // Must be called from a user gesture (browser autoplay policy).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.noise = this.makeNoise(2);
    this.buildRotor();
    this.ready = true;
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = w * 0.6 + last * 0.4; }
    return b;
  }

  setVolume(v) {
    this.volume = v;
    try { localStorage.setItem('helicoptea.volume', String(v)); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('helicoptea.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  suspend(s) { if (!this.ctx) return; if (s) this.ctx.suspend(); else this.ctx.resume(); }

  buildRotor() {
    const ctx = this.ctx;
    const out = this.rotorOut = ctx.createGain();
    out.gain.value = 0;
    this.rotorPan = ctx.createStereoPanner();
    out.connect(this.rotorPan).connect(this.master);
    // Blade-pass buzz: a sawtooth through a lowpass, amplitude-modulated at the blade-pass rate.
    this.buzz = ctx.createOscillator(); this.buzz.type = 'sawtooth';
    this.buzzF = ctx.createBiquadFilter(); this.buzzF.type = 'lowpass'; this.buzzF.Q.value = 2;
    this.buzzG = ctx.createGain(); this.buzzG.gain.value = 0.18;
    this.buzz.connect(this.buzzF).connect(this.buzzG).connect(out);
    // Motor whine.
    this.whine = ctx.createOscillator(); this.whine.type = 'triangle';
    this.whineG = ctx.createGain(); this.whineG.gain.value = 0.035;
    this.whine.connect(this.whineG).connect(out);
    // Air chop: band-passed noise, chopped by an LFO at blade-pass frequency.
    this.air = ctx.createBufferSource(); this.air.buffer = this.noise; this.air.loop = true;
    this.airF = ctx.createBiquadFilter(); this.airF.type = 'bandpass'; this.airF.Q.value = 0.8;
    this.airG = ctx.createGain(); this.airG.gain.value = 0.0;
    this.chop = ctx.createOscillator(); this.chop.type = 'sine';
    this.chopDepth = ctx.createGain(); this.chopDepth.gain.value = 0.12;
    this.chop.connect(this.chopDepth).connect(this.airG.gain);
    this.air.connect(this.airF).connect(this.airG).connect(out);
    // Tail rotor tick.
    this.tail = ctx.createOscillator(); this.tail.type = 'square';
    this.tailF = ctx.createBiquadFilter(); this.tailF.type = 'bandpass'; this.tailF.Q.value = 6;
    this.tailG = ctx.createGain(); this.tailG.gain.value = 0.012;
    this.tail.connect(this.tailF).connect(this.tailG).connect(out);
    for (const o of [this.buzz, this.whine, this.air, this.chop, this.tail]) o.start();
  }

  // Called every frame with flight state; pan from camera-relative x in [-1,1], dist in metres.
  updateRotor(state) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { alive, rotorSpeed, thrustFrac, load, pan, dist, heavy, crane, agility = 0, cushion = 0 } = state;
    const rs = alive ? rotorSpeed : 0;
    // Blade-pass frequency (Hz): two blades on the toy rotor; three slower, broader blades per rotor
    // on the Chinook, whose second rotor (in place of a tail rotor) beats slightly against the first.
    // The skycrane: six broad blades, slow and deep, with a fast four-blade tail rotor buzzing over them.
    const bpf = crane ? 6 * 19 * rs : heavy ? 3 * 25 * rs : 2 * 46 * rs;
    const strain = Math.min(1, thrustFrac);  // more collective, more bite
    const near = 1 / (1 + Math.max(0, dist - 0.3) * 2.2);
    this.buzz.frequency.setTargetAtTime(Math.max(20, bpf), t, 0.05);
    this.buzzF.frequency.setTargetAtTime(300 + 1500 * strain, t, 0.05);
    this.whine.frequency.setTargetAtTime(Math.max(40, (crane ? 560 : heavy ? 610 : 820) * rs * (1 - 0.06 * load)), t, 0.06);
    this.chop.frequency.setTargetAtTime(Math.max(1, bpf), t, 0.05);
    this.airF.frequency.setTargetAtTime(700 + 2200 * strain, t, 0.08);
    this.airG.gain.setTargetAtTime(0.05 + 0.18 * strain + 0.08 * cushion, t, 0.06);
    // Blade slap: hard manoeuvring loads the blades and the chop bites harder.
    this.chopDepth.gain.setTargetAtTime(0.12 + 0.28 * Math.min(1, agility), t, 0.05);
    this.tail.frequency.setTargetAtTime(Math.max(20, crane ? bpf * 3.4 : heavy ? bpf * 1.018 : bpf * 3.1), t, 0.05);
    this.tailF.frequency.setTargetAtTime(Math.max(50, crane ? bpf * 6 : heavy ? bpf * 2.4 : bpf * 6.2), t, 0.05);
    this.tailG.gain.setTargetAtTime(crane ? 0.02 : heavy ? 0.03 : 0.012, t, 0.1);
    this.rotorOut.gain.setTargetAtTime(alive ? (0.32 + 0.4 * strain) * near * (heavy || crane ? 1.25 : 1) : 0, t, alive ? 0.08 : 0.03);
    this.rotorPan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, pan)), t, 0.05);
  }

  // Continuous milk stream: a soft hiss while falling, a deeper trickle once it lands in liquid.
  updatePour({ rate, intoLiquid, pan }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.pour) {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6; f.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner();
      src.connect(f).connect(g).connect(p).connect(this.master);
      src.start();
      this.pour = { f, g, p, liquid: 0 };
    }
    const P = this.pour;
    P.liquid += ((intoLiquid ? 1 : 0) - P.liquid) * 0.15;
    const level = Math.min(1, Math.sqrt(Math.max(0, rate) / 1.0e-5));
    P.f.frequency.setTargetAtTime(2600 - 1700 * P.liquid + 300 * Math.sin(t * 23), t, 0.03);
    P.g.gain.setTargetAtTime(level * (0.05 + 0.07 * P.liquid), t, rate > 0 ? 0.04 : 0.08);
    P.p.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, pan || 0)), t, 0.05);
  }

  // ---------------------------------------------------------------- one-shots
  env(node, t0, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  noiseBurst({ freq = 1000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.002, decay = 0.2, pan = 0, sweepTo = null, delay = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + attack + decay);
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    this.env(g, t0, attack, gain, decay);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + attack + decay + 0.05);
  }

  tone({ freq = 440, to = null, type = 'sine', gain = 0.2, attack = 0.002, decay = 0.2, pan = 0, delay = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    this.env(g, t0, attack, gain, decay);
    o.start(t0); o.stop(t0 + attack + decay + 0.05);
  }

  explosion(pan, scale = 1) {
    if (!this.ready) return;
    this.tone({ freq: 90, to: 28, gain: 0.9 * scale, attack: 0.005, decay: 1.1, pan });
    this.noiseBurst({ freq: 3000, type: 'lowpass', q: 0.7, gain: 0.9 * scale, attack: 0.003, decay: 0.9, sweepTo: 180, pan });
    this.noiseBurst({ freq: 900, q: 0.6, gain: 0.35 * scale, attack: 0.02, decay: 1.6, sweepTo: 120, pan, delay: 0.05 });
    for (let i = 0; i < 14; i++) {
      this.noiseBurst({ freq: 2500 + Math.random() * 3000, q: 4, gain: 0.08 + Math.random() * 0.08, attack: 0.001, decay: 0.03, pan: pan + (Math.random() - 0.5) * 0.6, delay: 0.08 + Math.random() * 1.3 });
    }
  }

  handleEvents(events, panOf) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    for (const e of events) {
      const pan = e.pos ? panOf(e.pos) : 0;
      switch (e.type) {
        case 'crash': this.explosion(pan, Math.min(1.2, 0.7 + e.impact * 0.2)); break;
        case 'bump': this.noiseBurst({ freq: 380, q: 1.4, gain: Math.min(0.5, 0.12 + e.dv * 0.35), decay: 0.12, pan }); this.tone({ freq: 140, to: 70, gain: 0.15 * Math.min(1, e.dv), decay: 0.12, pan }); break;
        case 'rotorTick': this.noiseBurst({ freq: 3200, q: 3, gain: 0.12, decay: 0.03, pan }); break;
        case 'splash': {
          const s = Math.min(1.2, e.speed);
          this.tone({ freq: 620 + Math.random() * 120, to: 180, gain: 0.12 + 0.2 * s, attack: 0.004, decay: 0.16, pan });
          this.noiseBurst({ freq: 1800, q: 0.9, gain: 0.08 + 0.3 * s, attack: 0.003, decay: 0.12 + 0.2 * s, sweepTo: 700, pan });
          for (let i = 0; i < 4; i++) this.tone({ freq: 900 + Math.random() * 900, to: 1400 + Math.random() * 700, gain: 0.03, decay: 0.05, pan, delay: 0.05 + i * 0.06 * Math.random() });
          break;
        }
        case 'bucketSplash': {
          const s = Math.min(1.2, e.speed);
          this.tone({ freq: 380 + Math.random() * 80, to: 120, gain: 0.12 + 0.18 * s, attack: 0.004, decay: 0.2, pan });
          this.noiseBurst({ freq: 1300, q: 0.9, gain: 0.08 + 0.25 * s, attack: 0.003, decay: 0.15 + 0.2 * s, sweepTo: 500, pan });
          break;
        }
        case 'milkSplash':
          if (performance.now() - (this.lastMilk || 0) > 45) {
            this.lastMilk = performance.now();
            this.noiseBurst({ freq: 2400 + Math.random() * 1200, q: 2, gain: Math.min(0.06, 0.012 + e.vol * 1e6 * 0.02), decay: 0.035, pan });
          }
          break;
        case 'extract':
          // a wet "shloop" as the tea lets go
          this.noiseBurst({ freq: 900, q: 1.4, gain: 0.14, attack: 0.01, decay: 0.22, sweepTo: 2600, pan });
          this.tone({ freq: 260, to: 820, gain: 0.07, attack: 0.01, decay: 0.16, pan });
          break;
        case 'touchdown': {
          const s = Math.min(1, e.speed / 0.6);
          this.tone({ freq: 120, to: 60, gain: 0.12 + 0.3 * s, attack: 0.003, decay: 0.16, pan });
          this.noiseBurst({ freq: 600, q: 1.2, gain: 0.05 + 0.15 * s, decay: 0.08, pan });
          this.noiseBurst({ freq: 2600, q: 5, gain: 0.03 * s, decay: 0.12, pan, delay: 0.03 }); // skid tubes ring
          break;
        }
        case 'scrape':
          if (now - (this.lastScrape || 0) > 0.06) { this.lastScrape = now; this.noiseBurst({ freq: 1800 + Math.random() * 600, q: 2.2, gain: Math.min(0.12, 0.03 + e.speed * 0.15), attack: 0.005, decay: 0.07, pan }); }
          break;
        case 'snatch': {
          if (now - (this.lastSnatch || 0) < 0.15) break;
          this.lastSnatch = now;
          const s = Math.min(1, e.speed / 0.8);
          this.tone({ freq: 210 + Math.random() * 30, to: 150, type: 'triangle', gain: 0.05 + 0.12 * s, attack: 0.002, decay: 0.18, pan }); // string twang
          this.noiseBurst({ freq: 3200, q: 3, gain: 0.04 + 0.08 * s, decay: 0.03, pan });
          break;
        }
        case 'drip':
          if (e.cup) this.tone({ freq: 1500 + Math.random() * 700, to: 700, gain: 0.05, decay: 0.07, pan });
          else this.noiseBurst({ freq: 4000, q: 2, gain: 0.025, decay: 0.02, pan });
          break;
        case 'bagHit':
          if (now - this.lastHit > 0.06) {
            this.lastHit = now;
            const ceramic = e.material === 'ceramic';
            if (ceramic) this.tone({ freq: 2400 + Math.random() * 600, to: 2200, gain: Math.min(0.12, 0.02 + e.dv * 0.05), decay: 0.09, type: 'sine', pan });
            this.noiseBurst({ freq: ceramic ? 3000 : 900, q: 1.5, gain: Math.min(0.12, 0.02 + e.dv * 0.04), decay: 0.04, pan });
          }
          break;
        case 'clatter':
          if (now - this.lastClatter > 0.04) {
            this.lastClatter = now;
            this.noiseBurst({ freq: 2200 + Math.random() * 2000, q: 3, gain: Math.min(0.2, 0.03 + e.dv * 0.03), decay: 0.06, pan });
          }
          break;
        case 'attach': this.tone({ freq: 880, to: 1320, gain: 0.08, decay: 0.08, type: 'triangle' }); this.tone({ freq: 1320, gain: 0.05, decay: 0.12, type: 'triangle', delay: 0.07 }); break;
        case 'release': this.tone({ freq: 1100, to: 700, gain: 0.07, decay: 0.12, type: 'triangle' }); break;
        case 'restart': this.tone({ freq: 523, gain: 0.06, decay: 0.12, type: 'triangle' }); this.tone({ freq: 784, gain: 0.06, decay: 0.2, type: 'triangle', delay: 0.09 }); break;
        default: break;
      }
    }
  }
}
