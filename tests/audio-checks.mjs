// Browser rejection/interruption branches that cannot be forced reliably with physical audio hardware.
import {Audio} from '../src/audio/audio.js';
const results=[];
const check=(name,ok,detail)=>{results.push(ok);console.log(`${ok?"PASS":"FAIL"}  ${name}${!ok&&detail?`  (${detail})`:""}`);};
for(const state of ['running','suspended','interrupted','closed']) {
  let resumes=0, suspends=0;
  const a=Object.create(Audio.prototype);
  a.ctx={state,resume:()=>{resumes++;return Promise.resolve();},suspend:()=>{suspends++;return Promise.resolve();}};
  a.unlock();
  check(`audio ${state}: unlock resumes only a recoverable context`,resumes===(['suspended','interrupted'].includes(state)?1:0));
  a.suspend(true);
  check(`audio ${state}: pause tolerates a closed context`,suspends===(state==='closed'?0:1));
}
const unhandled=[];
const onUnhandled=e=>unhandled.push(e);
process.on('unhandledRejection',onUnhandled);
const a=Object.create(Audio.prototype);
a.ctx={state:'suspended',resume:()=>Promise.reject(new Error('policy denied')),suspend:()=>Promise.reject(new Error('device unavailable'))};
a.unlock(); a.suspend(true); a.suspend(false);
await new Promise(resolve=>setTimeout(resolve,0));
check('denied audio operations do not cause unhandled rejection',unhandled.length===0);
process.off('unhandledRejection',onUnhandled);
let retried=false;
a.ctx.resume=()=>{retried=true;return Promise.resolve();};
a.unlock();
check('a failed unlock can be retried on a later gesture',retried);

// ---------------------------------------------------------------- the sound graph, on a mock context
// Every aircraft in every camera, every event and menu cue: no exceptions and no non-finite parameter
// (a NaN reaching an AudioParam throws in the browser and silences the frame).
{
  let bad = 0;
  const param = (v = 0) => {
    const p = { value: v, last: v };
    const fin = (x, pos) => { if (!Number.isFinite(x) || (pos && x <= 0)) bad++; };
    p.setTargetAtTime = (x) => { fin(x); p.last = x; };
    p.setValueAtTime = (x) => { fin(x); p.value = x; };
    p.linearRampToValueAtTime = (x) => fin(x);
    p.exponentialRampToValueAtTime = (x) => fin(x, true);
    p.cancelScheduledValues = () => {};
    return p;
  };
  const node = (extra = {}) => ({ connect(n) { return n; }, disconnect() {}, ...extra });
  const src = () => node({ start() {}, stop() {}, playbackRate: param(1), frequency: param(440), detune: param(0), loop: false, buffer: null, type: 'sine', onended: null });
  const ctx = {
    sampleRate: 8000, currentTime: 0, state: 'running', destination: node(),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(350), Q: param(1), gain: param(0), type: 'lowpass' }),
    createStereoPanner: () => node({ pan: param(0) }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createConvolver: () => node({ buffer: null }),
    createOscillator: src, createBufferSource: src,
    createBuffer: (ch, n, sr) => { const d = Array.from({ length: ch }, () => new Float32Array(n)); return { numberOfChannels: ch, length: n, sampleRate: sr, getChannelData: (c) => d[c] }; },
  };
  globalThis.performance ??= { now: () => Date.now() };
  const a = new Audio();
  let threw = null;
  try { a.attach(ctx); } catch (e) { threw = e; }
  check('the sound graph builds', !threw && a.ready);
  const cam = { matrixWorldInverse: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.3, -0.5, 1] }, position: { x: 0, y: 0.3, z: 0.5 } };
  const views = ['chase', 'cockpit', 'locked', 'bolt'];
  const step = (st) => { ctx.currentTime += 1 / 60; a.setListener(cam); a.updateRotor(st); };
  try {
    for (const type of ['micro', 'chinook', 'skycrane']) for (const view of views) {
      for (let i = 0; i < 20; i++) step({ alive: true, type, view, rotorSpeed: 0.9 + i * 0.005, thrustFrac: i / 20, load: 0.01, agility: 0.5, cushion: 0.5, wear: i > 10 ? 0.4 : 0, tailGone: i > 15, pos: { x: 0, y: 0.1, z: -0.1 * i }, quat: { x: 0, y: 0.1, z: 0, w: 0.995 }, vel: { x: 0.3, y: -0.2, z: -1 }, yaw: 0.6, overLiquid: i % 2 === 0 });
      step({ alive: false, type, view });
    }
    // Old callers that pass only the original fields.
    for (let i = 0; i < 5; i++) step({ alive: true, rotorSpeed: 1, thrustFrac: 0.5, load: 0, pan: 0.2, dist: 0.4, heavy: true });
  } catch (e) { threw = e; }
  check('every aircraft and camera updates without error', !threw, threw && threw.message);
  step({ alive: true, type: 'micro', view: 'cockpit', rotorSpeed: 1, thrustFrac: 0.5, tailGone: true, pos: { x: 0, y: 0.1, z: 0 } });
  for (let i = 0; i < 40; i++) step({ alive: true, type: 'micro', view: 'cockpit', rotorSpeed: 1, thrustFrac: 0.5, tailGone: true, pos: { x: 0, y: 0.1, z: 0 } });
  check('the cockpit muffles the exterior path and sounds the warning horn', a.extG.gain.last < 0.05 && a.intG.gain.last > 0.3 && a.cabinFx.horn.gain.last > 0.02);
  for (let i = 0; i < 40; i++) step({ alive: true, type: 'micro', view: 'chase', rotorSpeed: 1, thrustFrac: 0.5, pos: { x: 0, y: 0.1, z: 0 } });
  check('outside, the exterior path is open and the horn is quiet', a.extG.gain.last > 0.95 && a.cabinFx.horn.gain.last === 0);
  const P = { x: 0.14, y: 0.07, z: -0.13 };
  const events = [
    ...['impact', 'shatter', 'spin', 'thrash', 'fall', 'dunk'].flatMap((kind) => ['wood', 'ceramic', 'glass', 'plant', 'fur', 'metal', 'tea', null].map((material) => ({ type: 'crash', kind, material, pos: P, impact: 2, aircraft: 'chinook', scale: 1.6 }))),
    { type: 'rotorShatter', material: 'ceramic', pos: P }, { type: 'tailStrike', pos: P }, { type: 'teaStrike', pos: P },
    { type: 'rotorTick', material: 'glass', pos: P }, { type: 'bump', dv: 0.4, pos: P }, { type: 'touchdown', speed: 0.3, pos: P },
    { type: 'scrape', speed: 0.2, pos: P }, { type: 'snatch', speed: 0.5, pos: P }, { type: 'splash', speed: 0.6, pos: P },
    { type: 'bucketSplash', speed: 0.5, pos: P }, { type: 'extract', speed: 0.1, pos: P }, { type: 'drip', cup: {}, pos: P }, { type: 'drip', pos: P },
    { type: 'milkSplash', vol: 1e-7, pos: P }, { type: 'bagHit', dv: 0.4, material: 'ceramic', pos: P }, { type: 'clatter', dv: 1, pos: P },
    { type: 'appleDrop', apple: { pos: P } }, { type: 'radio', on: true }, { type: 'attach', bag: { pos: P } }, { type: 'release', bag: { pos: P } }, { type: 'restart' },
  ];
  try {
    for (const e of events) { ctx.currentTime += 0.2; a.handleEvents([e]); }
    for (const k of ['focus', 'select', 'back', 'on', 'off', 'slide', 'toast', 'view', 'start', 'attach', 'release', 'restart']) a.ui(k, { value: 0.4 });
    for (let i = 0; i < 30; i++) { ctx.currentTime += 1 / 60; a.updateTea([{ pos: P, vel: { x: 0.1, y: 0, z: 0 }, immersion: 0.7, wetness: i / 30 }]); a.updatePour({ rate: 2e-5, intoLiquid: true, pos: P }); }
    a.updateTea(null); a.updatePour({ rate: 0, intoLiquid: false });
  } catch (e) { threw = e; }
  check('every event, menu cue, steep and pour plays without error', !threw, threw && threw.stack);
  check('no non-finite or invalid value reaches an audio parameter', bad === 0, `${bad} bad values`);
  check('a pile-up of one-shots is capped', a.voices <= 161, a.voices);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} audio checks passed`);
if(results.some(ok=>!ok)) process.exitCode=1;
