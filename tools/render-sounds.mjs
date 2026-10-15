// Renders scripted listening clips through the game's real audio engine (src/audio) in an
// OfflineAudioContext, so the sound can be judged by ear away from the game, and measured.
//   node tools/render-sounds.mjs [http://127.0.0.1:PORT/] [--only name,name]
// Needs a Vite dev server for this checkout at the given address. Writes WAV (and MP3 when ffmpeg is
// on the PATH) plus report.json to test-results/sound-clips/. Waveforms prove routing and levels only:
// whether it sounds right still needs a person listening.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4291/';
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const out = path.resolve('test-results/sound-clips');
fs.mkdirSync(out, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + 'README.md');   // the game's origin (for module imports), without booting the game
await page.setContent('<!doctype html><title>sound clips</title>');

// Scenarios run in the page. Each: { name, secs, step(t, S) } where step returns flight state and calls
// S.event(...) for one-shots. S.cam(pos, target) places the listener.
const SCENARIOS = String.raw`
const V = (x, y, z) => ({ x, y, z });
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
// A flight profile used by the per-aircraft clips: hover, climb, fast cruise with turns,
// a descent (blade slap), a low hover with pedal turns, then landing.
function profile(type) {
  let pos = V(-0.56, 0.12, 0.24);
  return (t, S) => {
    let vel = V(0, 0, 0), thrust = 0.5, agility = 0, yaw = 0, cushion = 0;
    if (t < 3) { thrust = 0.5; cushion = 0.5; }
    else if (t < 5) { thrust = 0.88; vel = V(0, 0.32, 0); }
    else if (t < 8.5) { thrust = 0.66; vel = V(0.4 * Math.sin(t), 0, -1.1); agility = 0.35 + 0.3 * Math.sin(t * 2.1); }
    else if (t < 11.5) { thrust = 0.34; vel = V(0, -0.26, -0.35); agility = 0.15; }
    else if (t < 14) { thrust = 0.52; cushion = 0.85; yaw = t > 12 && t < 13.2 ? 0.9 : 0; }
    else { thrust = lerp(0.45, 0.15, (t - 14) / 1.5); cushion = 1; vel = V(0, -0.05, 0); }
    pos = V(pos.x + vel.x / 60, Math.max(0.03, pos.y + vel.y / 60), pos.z + vel.z / 60);
    S.cam(V(pos.x + 0.05, pos.y + 0.13, pos.z + 0.5), pos);
    if (Math.abs(t - 15.2) < 1 / 120) S.event({ type: 'touchdown', pos, speed: 0.25 });
    return { alive: true, type, rotorSpeed: Math.min(1, 0.82 + t * 0.9), thrustFrac: thrust, load: 0, agility, cushion, wear: 0, tailGone: false, pos, vel, yaw, view: 'chase' };
  };
}
const flyby = (type, x0, speed, t0) => (t) => V(x0 + speed * (t - t0), 0.25, -0.4);
return [
  { name: 'rotor-micro', secs: 16, step: profile('micro') },
  { name: 'rotor-chinook', secs: 16, step: profile('chinook') },
  { name: 'rotor-skycrane', secs: 16, step: profile('skycrane') },
  { name: 'cockpit-vs-outside', secs: 18, step: (() => { let pos = V(0, 0.2, 0); return (t, S) => {
      // 0-4 chase, 4-10 cockpit (hover then fast), 10-14 nose camera at speed, 14-18 cargo camera under it.
      const fast = t > 7 && t < 14;
      const vel = fast ? V(0, 0, -1.2) : V(0, 0, 0);
      pos = V(pos.x, 0.2, pos.z + vel.z / 60);
      const view = t < 4 ? 'chase' : t < 10 ? 'cockpit' : t < 14 ? 'nose' : 'cargo';
      if (view === 'chase') S.cam(V(pos.x, pos.y + 0.13, pos.z + 0.5), pos);
      else if (view === 'cargo') S.cam(V(pos.x, pos.y - 0.2, pos.z + 0.02), V(pos.x, pos.y - 0.4, pos.z - 0.2));
      else S.cam(V(pos.x, pos.y + 0.01, pos.z - 0.03), V(pos.x, pos.y, pos.z - 1));
      return { alive: true, type: 'micro', rotorSpeed: 1, thrustFrac: fast ? 0.7 : 0.5, agility: fast ? 0.3 : 0.05, cushion: 0, pos, vel, yaw: 0, view };
    }; })() },
  { name: 'flyby-tripod', secs: 18, step: (t, S) => {
      // Each aircraft crosses in front of a fixed camera at speed (Doppler and the far-off rotor).
      const k = Math.floor(t / 6), lt = t - k * 6, type = ['micro', 'chinook', 'skycrane'][k];
      const pos = V(-4 + lt * 1.4, 0.3, -1.6);
      S.cam(V(0, 0.1, 0.2), V(pos.x, pos.y, pos.z));
      return { alive: true, type, rotorSpeed: 1, thrustFrac: 0.62, agility: 0.1, pos, vel: V(1.4, 0, 0), view: 'tripod' };
    } },
  { name: 'kitchen-then-garden', secs: 22, step: (t, S) => {
      // Hovering in the kitchen (boxy room), out through the back door into the garden (open air),
      // then the rotors stop and you hear just the places: garden birds, then the kitchen clock and fridge.
      const z = t < 4 ? 0.3 : t < 9 ? lerp(0.3, -3.0, (t - 4) / 5) : -3.0;
      const pos = V(1.18, 0.4, z);
      if (t < 14) S.cam(V(pos.x + 0.1, pos.y + 0.12, pos.z + 0.5), pos);
      else if (t < 18) S.cam(V(0.2, 0.1, -3.2), V(0, 0, -4));
      else S.cam(V(-1.2, 0.6, 0.8), V(-1.6, 0.8, -1.5));
      return { alive: t < 12, type: 'micro', rotorSpeed: 1, thrustFrac: 0.55, cushion: 0.1, pos, vel: V(0, 0, t > 4 && t < 9 ? -0.66 : 0), view: 'chase' };
    } },
  { name: 'tea', secs: 16, step: (() => {
      const mug = V(0.14, 0.074, -0.13);
      const bag = { pos: V(0.14, 0.06, -0.13), vel: V(0, 0, 0), immersion: 0, wetness: 0 };
      let fired = new Set();
      const once = (k, t, at, fn) => { if (t >= at && !fired.has(k)) { fired.add(k); fn(); } };
      return (t, S) => {
        S.cam(V(0.14, 0.16, 0.12), mug);
        once('s1', t, 0.5, () => S.event({ type: 'splash', pos: mug, speed: 0.35 }));
        // steeping: a fresh bag fizzes, then sloshes as it's dragged about
        bag.immersion = t > 0.6 && t < 5 ? 0.8 : 0;
        bag.wetness = Math.min(1, Math.max(0, (t - 0.6) / 2.5));
        bag.vel = t > 2.5 && t < 4.6 ? V(0.1 * Math.cos(t * 6), 0, 0.1 * Math.sin(t * 6)) : V(0, 0, 0);
        S.bags([bag]);
        once('x', t, 5, () => S.event({ type: 'extract', pos: mug, speed: 0.12 }));
        for (let i = 0; i < 7; i++) once('d' + i, t, 5.3 + i * 0.22 + (i % 2) * 0.07, () => S.event({ type: 'drip', pos: mug, cup: {} }));
        once('s2', t, 7, () => S.event({ type: 'splash', pos: mug, speed: 1.0 }));
        once('k1', t, 8.5, () => S.event({ type: 'bagHit', pos: V(0.14, 0.05, -0.13), dv: 0.5, material: 'ceramic' }));
        once('k2', t, 9.1, () => S.event({ type: 'bagHit', pos: V(0.53, 0.05, 0.17), dv: 0.5, material: 'ceramic' }));
        once('k3', t, 9.7, () => S.event({ type: 'bagHit', pos: V(-1.32, -0.3, -5.5), dv: 0.5, material: 'ceramic' }));
        once('k4', t, 10.3, () => S.event({ type: 'bagHit', pos: V(0.06, 0.01, 0.36), dv: 0.6, material: 'ceramic' }));
        S.pour(t > 11 && t < 13.5 ? 2e-5 : 0, t > 11.25, mug);
        once('bk', t, 14, () => S.event({ type: 'bucketSplash', pos: mug, speed: 0.6 }));
        once('sn', t, 14.8, () => S.event({ type: 'snatch', pos: mug, speed: 0.7 }));
        once('at', t, 15.3, () => S.event({ type: 'attach', bag }));
        return { alive: false };
      };
    })() },
  ...['micro', 'chinook', 'skycrane'].map((type) => ({ name: 'crashes-' + type, secs: 40, step: (() => {
      // Each 5 s: fly in, then a different crash. Rotor strike, tail strike, rollover, hard impact into
      // china, a long fall, a dunk in the tea, a glass window.
      const seq = [
        { pre: [{ at: 0.5, e: { type: 'rotorTick', material: 'wood' } }, { at: 0.7, e: { type: 'rotorTick', material: 'ceramic' } }, { at: 0.9, e: { type: 'rotorShatter', material: 'ceramic' } }], crash: { kind: 'shatter', material: 'ceramic' }, at: 1.4 },
        { pre: [{ at: 0.5, e: { type: 'tailStrike', material: 'wood' } }], crash: { kind: 'spin', material: 'wood' }, at: 2.0, tail: 0.5 },
        { crash: { kind: 'thrash', material: 'wood' }, at: 1.0 },
        { crash: { kind: 'impact', material: 'ceramic', impact: 2 }, at: 1.0 },
        { crash: { kind: 'fall', material: 'stone', impact: 3 }, at: 1.0 },
        { crash: { kind: 'dunk', material: 'tea' }, at: 1.0 },
        { crash: { kind: 'impact', material: 'glass', impact: 1.5 }, at: 1.0 },
        { crash: { kind: 'impact', material: 'plant', impact: 1.2 }, at: 1.0 },
      ];
      const done = new Set();
      return (t, S) => {
        const k = Math.floor(t / 5), lt = t - k * 5, q = seq[k];
        const pos = V(0, 0.2, -0.2);
        S.cam(V(0.1, 0.32, 0.4), pos);
        if (!q) return { alive: false };
        for (const [i, p] of (q.pre || []).entries()) if (lt >= p.at && !done.has(k + ':' + i)) { done.add(k + ':' + i); S.event({ ...p.e, pos }); }
        if (lt >= q.at && !done.has(k + ':c')) { done.add(k + ':c'); S.event({ type: 'crash', pos, aircraft: type, scale: type === 'micro' ? 1 : type === 'chinook' ? 1.6 : 1.7, impact: 1.5, ...q.crash }); }
        const alive = lt < q.at;
        return { alive, type, rotorSpeed: 1, thrustFrac: 0.55, agility: lt > 0.5 ? 0.6 : 0.2, pos, vel: V(0, 0, -0.3), tailGone: q.tail && lt > q.tail, wear: q.pre && lt > 0.9 ? 0.6 : 0, view: 'chase' };
      };
    })() })),
  { name: 'cockpit-crash-micro', secs: 9, step: (() => { const done = new Set(); return (t, S) => {
      const pos = V(0, 0.2, -0.2);
      S.cam(V(pos.x, pos.y + 0.01, pos.z - 0.03), V(pos.x, pos.y, pos.z - 1));
      if (t > 2 && !done.has('t')) { done.add('t'); S.event({ type: 'tailStrike', pos, material: 'wood' }); }
      if (t > 4.5 && !done.has('c')) { done.add('c'); S.event({ type: 'crash', kind: 'impact', pos, aircraft: 'micro', scale: 1, impact: 2, material: 'wood' }); }
      return { alive: t < 4.5, type: 'micro', rotorSpeed: 1, thrustFrac: 0.6, agility: t > 2 ? 0.9 : 0.1, pos, vel: V(0, 0, -0.4), tailGone: t > 2, view: 'cockpit' };
    }; })() },
  { name: 'bumps-and-strikes', secs: 11, step: (() => { const done = new Set(); const ev = [
      [0.4, { type: 'touchdown', speed: 0.15 }], [1.2, { type: 'touchdown', speed: 0.55 }], [2.0, { type: 'bump', dv: 0.5 }],
      [2.6, { type: 'scrape', speed: 0.3 }], [2.7, { type: 'scrape', speed: 0.3 }], [2.8, { type: 'scrape', speed: 0.3 }],
      [3.5, { type: 'rotorTick', material: 'wood' }], [3.9, { type: 'rotorTick', material: 'metal' }], [4.3, { type: 'rotorTick', material: 'glass' }],
      [4.7, { type: 'rotorTick', material: 'plant' }], [5.1, { type: 'rotorTick', material: 'brick' }], [5.5, { type: 'rotorTick', material: 'wood', harmless: true }],
      [6.2, { type: 'teaStrike' }], [7.0, { type: 'clatter', dv: 1.5 }], [7.3, { type: 'clatter', dv: 0.8 }],
      [8.0, { type: 'appleDrop' }], [9.0, { type: 'snatch', speed: 0.9 }], [9.6, { type: 'release' }], [10.2, { type: 'radio' }],
    ]; return (t, S) => {
      const pos = V(0, 0.1, -0.2);
      S.cam(V(0.1, 0.25, 0.3), pos);
      for (const [i, [at, e]] of ev.entries()) if (t >= at && !done.has(i)) { done.add(i); S.event({ ...e, pos }); }
      const type = t < 1 ? 'micro' : 'chinook';
      return { alive: t < 3.2, type, rotorSpeed: 1, thrustFrac: 0.3, cushion: 1, pos, vel: V(0, 0, 0), view: 'chase' };
    }; })() },
  { name: 'menus', secs: 7, step: (() => { const done = new Set(); const ev = [
      [0.3, 'start'], [1.4, 'focus'], [1.65, 'focus'], [1.9, 'focus'], [2.3, 'select'], [2.9, 'back'], [3.5, 'on'], [3.9, 'off'],
      [4.4, 'toast'], [5.2, 'view'], [5.7, 'restart'],
    ]; return (t, S) => {
      for (const [i, [at, k]] of ev.entries()) if (t >= at && !done.has(i)) { done.add(i); S.ui(k); }
      if (t > 4.6 && t < 5.1) S.ui('slide', { value: (t - 4.6) * 2 });
      return { alive: false };
    }; })() },
];`;

async function render(name) {
  return page.evaluate(async ({ base, src, name }) => {
    const { Audio } = await import(base + 'src/audio/audio.js');
    const scen = new Function(src)().find((s) => s.name === name);
    const sr = 48000;
    const ctx = new OfflineAudioContext(2, Math.round(sr * scen.secs), sr);
    const a = new Audio();
    a.volume = 0.8; a.muted = false;
    a.attach(ctx);
    const cam = { matrixWorldInverse: { elements: new Float64Array(16) }, position: { x: 0, y: 0, z: 0 } };
    const look = (p, q) => {
      let zx = p.x - q.x, zy = p.y - q.y, zz = p.z - q.z; const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
      let xx = zz, xy = 0, xz = -zx; const xl = Math.hypot(xx, xz) || 1; xx /= xl; xz /= xl; // up × z
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      const m = cam.matrixWorldInverse.elements;
      m[0] = xx; m[4] = xy; m[8] = xz; m[12] = -(xx * p.x + xy * p.y + xz * p.z);
      m[1] = yx; m[5] = yy; m[9] = yz; m[13] = -(yx * p.x + yy * p.y + yz * p.z);
      m[2] = zx; m[6] = zy; m[10] = zz; m[14] = -(zx * p.x + zy * p.y + zz * p.z);
      m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
      cam.position.x = p.x; cam.position.y = p.y; cam.position.z = p.z;
    };
    let events = [], bags = null, pour = null;
    const S = { cam: look, event: (e) => events.push(e), bags: (b) => { bags = b; }, pour: (rate, into, pos) => { pour = { rate, intoLiquid: into, pos }; }, ui: (k, o) => a.ui(k, o) };
    const fps = 60, n = Math.floor(scen.secs * fps);
    const errs = [];
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      ctx.suspend(t).then(() => {
        try {
          events = []; bags = null; pour = null;
          const st = scen.step(t, S);
          a.setListener(cam);
          a.handleEvents(events);
          a.updateRotor({ thrustFrac: 0, rotorSpeed: 0, ...st });
          a.updateTea(bags);
          a.updatePour(pour || { rate: 0, intoLiquid: false });
        } catch (e) { errs.push(String(e && e.stack || e)); }
        ctx.resume();
      });
    }
    const buf = await ctx.startRendering();
    // Measure.
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, nan = 0, sum = 0, clip = 0;
    const win = sr / 2, rmsWin = [];
    let ws = 0;
    for (let i = 0; i < L.length; i++) {
      const l = L[i], r = R[i];
      if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
      const m = Math.max(Math.abs(l), Math.abs(r));
      peak = Math.max(peak, m); if (m > 0.99) clip++;
      sum += l * l + r * r; ws += l * l + r * r;
      if (i % win === win - 1) { rmsWin.push(+Math.sqrt(ws / (2 * win)).toFixed(4)); ws = 0; }
    }
    // 16-bit WAV.
    const len = L.length, bytes = new ArrayBuffer(44 + len * 4), dv = new DataView(bytes);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + len * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true);
    dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, len * 4, true);
    for (let i = 0; i < len; i++) {
      dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] || 0)) * 32767, true);
      dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] || 0)) * 32767, true);
    }
    let bin = ''; const u8 = new Uint8Array(bytes);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { wav: btoa(bin), stats: { secs: scen.secs, peak: +peak.toFixed(4), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rms: +Math.sqrt(sum / (2 * len)).toFixed(4), clipped: clip, nan, rmsHalfSeconds: rmsWin, errors: errs.slice(0, 5), voicesLeft: a.voices } };
  }, { base, src: SCENARIOS, name });
}

const names = await page.evaluate((src) => new Function(src)().map((s) => s.name), SCENARIOS);
const report = {};
const ffmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
for (const name of names) {
  if (only && !only.includes(name)) continue;
  const t0 = Date.now();
  const r = await render(name);
  const wav = path.join(out, `${name}.wav`);
  fs.writeFileSync(wav, Buffer.from(r.wav, 'base64'));
  if (ffmpeg) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k', path.join(out, `${name}.mp3`)]);
  report[name] = { ...r.stats, renderMs: Date.now() - t0 };
  console.log(`${name.padEnd(22)} peak ${String(r.stats.peakDb).padStart(6)} dBFS  rms ${r.stats.rms}  clipped ${r.stats.clipped}  nan ${r.stats.nan}  errors ${r.stats.errors.length}`);
  for (const e of r.stats.errors) console.log('   ', e.split('\n')[0]);
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, report, pageErrors: errors }, null, 2));
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
