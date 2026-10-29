// The neighbours' voices (src/sim/people.js): a few short words made by formant synthesis. A buzz at the
// voice's pitch (f0, Hz) goes through three band-pass filters set to the vowel's formants, which glide as
// the word goes on; a nasal hum is the buzz low-passed with one weak formant. No samples to load.
//
//   ow    a rotor blade caught them: /aʊ/, sharp onset, pitch jumping up and falling away
//   mm    their tea is right: a closed-mouth "mm-hm", rising
//   hmm   their tea is stewed: a doubtful hum, down and up
//   huh   woken from a doze

// [seconds, F1, F2, F3] keyframes per vowel glide; pitch: [seconds, multiple of f0].
const WORDS = {
  ow: { len: 0.46, gain: 0.5, onset: 0.012, formants: [[0, 760, 1250, 2500], [0.12, 720, 1150, 2450], [0.42, 360, 780, 2300]],
    pitch: [[0, 1.3], [0.05, 1.55], [0.18, 1.3], [0.46, 0.85]], breath: 0.25 },
  huh: { len: 0.24, gain: 0.32, onset: 0.05, formants: [[0, 640, 1250, 2500], [0.24, 600, 1180, 2450]], pitch: [[0, 0.95], [0.24, 1.3]], breath: 0.6 },
  mm: { len: 0.5, gain: 0.3, nasal: true, parts: [[0, 0.2], [0.27, 0.5]], pitch: [[0, 1.0], [0.2, 1.22], [0.27, 0.98], [0.5, 1.28]] },
  hmm: { len: 0.6, gain: 0.26, nasal: true, parts: [[0, 0.6]], pitch: [[0, 1.12], [0.32, 0.86], [0.6, 0.98]] },
};

function curve(param, keys, t0, scale = 1) {
  param.setValueAtTime(keys[0][1] * scale, t0);
  for (let i = 1; i < keys.length; i++) param.linearRampToValueAtTime(keys[i][1] * scale, t0 + keys[i][0]);
}

// a: the Audio engine; out: where it plays (Audio.spot); f0: the voice's pitch.
export function say(a, word, out, f0 = 160) {
  const W = WORDS[word];
  if (!W || !a.ready || !a.claim(0.3)) return;
  const ctx = a.ctx, t0 = ctx.currentTime + 0.01, end = t0 + W.len + 0.08;
  // The buzz, a little rough (two saws a few cents apart).
  const src = [ctx.createOscillator(), ctx.createOscillator()];
  src[0].type = 'sawtooth'; src[1].type = 'sawtooth';
  curve(src[0].frequency, W.pitch, t0, f0);
  curve(src[1].frequency, W.pitch, t0, f0 * 1.006);
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  for (const s of src) s.connect(mix);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  const nodes = [...src, mix, env];
  if (W.nasal) {
    // Lips closed: the buzz through the nose, its parts as separate swells.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 270; f.Q.value = 4;
    const fg = ctx.createGain(); fg.gain.value = 2.2;
    mix.connect(lp).connect(env); mix.connect(f).connect(fg).connect(env);
    nodes.push(lp, f, fg);
    for (const [s, e] of W.parts) {
      env.gain.setValueAtTime(0.0001, t0 + s);
      env.gain.exponentialRampToValueAtTime(W.gain, t0 + s + 0.04);
      env.gain.setValueAtTime(W.gain, t0 + e - 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + e);
    }
  } else {
    // An open vowel: three formants gliding.
    const gains = [1, 0.55, 0.22];
    for (let k = 0; k < 3; k++) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [6, 9, 12][k];
      curve(f.frequency, W.formants.map((r) => [r[0], r[k + 1]]), t0);
      const g = ctx.createGain(); g.gain.value = gains[k] * [3, 4, 5][k];
      mix.connect(f).connect(g).connect(env);
      nodes.push(f, g);
    }
    // Breath on the onset (the "h" of huh, the push of ow).
    if (W.breath) {
      const n = ctx.createBufferSource(); n.buffer = a.noise;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(W.breath * W.gain, t0 + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      n.connect(nf).connect(ng).connect(out);
      n.start(t0, Math.random()); n.stop(t0 + 0.15);
      nodes.push(n, nf, ng);
    }
    env.gain.exponentialRampToValueAtTime(W.gain, t0 + W.onset);
    env.gain.setValueAtTime(W.gain, t0 + W.len * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + W.len);
  }
  env.connect(out);
  for (const s of src) { s.start(t0); s.stop(end); }
  src[0].onended = () => { a.voices--; for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } } };
}
