// Offline synthesis of the looping beds the audio engine plays: rotor blade-pass loops, noise and room
// impulse responses. Everything is generated from a seed, so a session always sounds the same.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalise(d, peak = 0.95) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
  return d;
}

// Lightly coloured noise (a little low-passed white), the raw material for most one-shots.
export function noiseBuffer(ctx, seconds, seed = 7) {
  const r = rng(seed);
  const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = r() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = w * 0.6 + last * 0.4; }
  return b;
}

// Brown-ish noise for rumbles, wind and room tone.
export function brownBuffer(ctx, seconds, seed = 11) {
  const r = rng(seed);
  const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  let x = 0;
  for (let i = 0; i < d.length; i++) { x = x * 0.985 + (r() * 2 - 1) * 0.12; d[i] = x; }
  // Fade the ends together so the loop has no click.
  const f = Math.min(2000, d.length >> 3);
  for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[d.length - f + i] * (1 - k); }
  return normaliseBuffer(b);
}

function normaliseBuffer(b) { for (let c = 0; c < b.numberOfChannels; c++) normalise(b.getChannelData(c)); return b; }

// Adds src (a short pulse) into a looping array at a fractional sample offset, wrapping at the end.
function addWrapped(d, at, pulse, amp) {
  const n = d.length, i0 = Math.floor(at), fr = at - i0;
  for (let j = 0; j < pulse.length; j++) {
    const v = pulse[j] * amp;
    d[(i0 + j) % n] += v * (1 - fr);
    d[(i0 + j + 1) % n] += v * fr;
  }
}

// One rotor's beds, an exact whole number of revolutions long, at the rate the rotor is drawn turning
// (rotorSpeed 1 = playbackRate 1, so the sound locks to the blades on screen):
//  thump - the low "wop" of each blade passing (thickness noise): a pressure dip and a damped body tone
//  slap  - the sharp crack of blade-vortex interaction, faded in by the voice in descents and hard turns
//  swish - broadband blade noise, swelling as each blade advances
//  wobble - one dull thud per revolution: an out-of-balance (chipped) rotor
// p: { omega (rad/s), blades, thumpHz, thumpTau (s), dipW (s), slapTau (s), bladeVar [], seconds }
export function rotorBeds(ctx, p, seed = 1) {
  const sr = ctx.sampleRate, r = rng(seed);
  const rev = sr * 2 * Math.PI / p.omega;                     // samples per revolution (fractional)
  const revs = Math.max(4, Math.round((p.seconds || 2) * sr / rev));
  const n = Math.round(rev * revs);
  const revS = n / revs;                                       // exact loop: whole revolutions
  const mk = () => ctx.createBuffer(1, n, sr);
  const out = { thump: mk(), slap: mk(), swish: mk(), wobble: mk(), rate: sr / revS * p.blades, revSeconds: revS / sr };
  const T = out.thump.getChannelData(0), S = out.slap.getChannelData(0), W = out.swish.getChannelData(0), Wb = out.wobble.getChannelData(0);
  // Pulse shapes.
  const tLen = Math.round(sr * Math.min(revS / sr / p.blades * 0.95, p.thumpTau * 6));
  const thump = new Float32Array(tLen);
  const w = p.dipW, c = w * 2.2;
  for (let i = 0; i < tLen; i++) {
    const t = i / sr;
    // A broad pressure dip with a sharper core (the blade's own thickness pulse carries the "wop" into
    // the mid range a small speaker can play), then the low body tone and a shorter mid overtone.
    const dip = -Math.exp(-(((t - c) / w) ** 2)) * 0.6 - Math.exp(-(((t - c) / (w * 0.32)) ** 2)) * 0.45;
    const on = t / (t + 0.002);
    thump[i] = dip + on * (Math.sin(2 * Math.PI * p.thumpHz * t) * Math.exp(-t / p.thumpTau)
      + 0.6 * Math.sin(2 * Math.PI * p.thumpHz * 4.3 * t) * Math.exp(-t / (p.thumpTau * 0.35)));
  }
  const sLen = Math.round(sr * p.slapTau * 7);
  const wbLen = Math.round(sr * 0.05);
  const wob = new Float32Array(wbLen);
  for (let i = 0; i < wbLen; i++) { const t = i / sr; wob[i] = Math.sin(2 * Math.PI * (p.thumpHz * 0.5) * t) * Math.exp(-t / 0.014) * (t / (t + 0.003)); }
  const B = p.blades;
  const bv = p.bladeVar || [];
  for (let k = 0; k < revs; k++) {
    for (let b = 0; b < B; b++) {
      const at = k * revS + b * revS / B + (r() - 0.5) * sr * 0.0003;
      const g = (bv[b] ?? 1) * (1 + (r() - 0.5) * 0.08);
      addWrapped(T, at, thump, g);
      // Slap: a crack, then a short ringing noise tail; each one a little different.
      const slap = new Float32Array(sLen);
      for (let i = 0; i < sLen; i++) {
        const t = i / sr, cw = 0.00045;
        const crack = -((t - cw * 2) / cw) * Math.exp(-(((t - cw * 2) / cw) ** 2));
        slap[i] = crack * 0.9 + (r() * 2 - 1) * Math.exp(-t / p.slapTau) * 0.7;
      }
      addWrapped(S, at - sr * 0.0012, slap, g * (0.8 + r() * 0.4));
    }
    addWrapped(Wb, k * revS, wob, 1);
  }
  // Swish: noise swelling with each blade's advance.
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const ph = (i / revS) * B * 2 * Math.PI;
    const e = 0.15 + 0.85 * Math.pow(0.5 + 0.5 * Math.cos(ph), 4);
    lp = lp * 0.5 + (r() * 2 - 1) * 0.5;
    W[i] = lp * e;
  }
  normalise(T); normalise(S); normalise(W); normalise(Wb);
  return out;
}

// A small rotor's buzz (tail rotor): short bright pulses at its blade-pass rate.
export function buzzBed(ctx, p, seed = 3) {
  const sr = ctx.sampleRate, r = rng(seed);
  const rev = sr * 2 * Math.PI / p.omega;
  const revs = Math.max(8, Math.round((p.seconds || 1) * sr / rev));
  const n = Math.round(rev * revs), revS = n / revs;
  const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const len = Math.round(sr * Math.min(revS / sr / p.blades * 0.9, 0.012));
  for (let k = 0; k < revs; k++) for (let j = 0; j < p.blades; j++) {
    const pulse = new Float32Array(len);
    for (let i = 0; i < len; i++) { const t = i / sr; pulse[i] = (Math.sin(2 * Math.PI * p.toneHz * t) * 0.8 + (r() * 2 - 1) * 0.5) * Math.exp(-t / 0.0028) * (t / (t + 0.0004)); }
    addWrapped(d, k * revS + j * revS / p.blades, pulse, j === 0 ? 1 : 0.9);
  }
  normalise(d);
  return { buffer: b, rate: sr / revS * p.blades };
}

// Stereo room impulse response: early reflections then a decaying, darkening tail.
// opts: { rt60 (s), pre (s), taps: [[delay s, gain]], damp (0..1, how fast the highs go), width }
export function impulse(ctx, opts, seed = 5) {
  const sr = ctx.sampleRate, r = rng(seed);
  const len = Math.round(sr * (opts.pre + opts.rt60 * 1.1));
  const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    const p0 = Math.round(opts.pre * sr);
    for (let i = p0; i < len; i++) {
      const t = (i - p0) / sr;
      const env = Math.pow(10, -3 * t / opts.rt60);
      const k = Math.min(0.95, 0.15 + opts.damp * t / opts.rt60);   // darker as it decays
      lp = lp * k + (r() * 2 - 1) * (1 - k);
      d[i] = lp * env * (1 + (opts.width || 0) * (c ? 0.15 : -0.15));
    }
    for (const [dl, g] of opts.taps || []) {
      const i = Math.round((dl * (1 + (c ? 0.07 : -0.05))) * sr);
      if (i < len) { d[i] += g * (c ? 0.9 : 1); if (i + 1 < len) d[i + 1] += g * 0.4; }
    }
  }
  // Keep the wet level independent of the room's length.
  let e = 0;
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) e += d[i] * d[i]; }
  const k = 1 / Math.sqrt(Math.max(1e-9, e / 2));
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] *= k * 0.6; }
  return b;
}
