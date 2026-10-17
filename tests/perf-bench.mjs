// Frame-time benchmark in a real browser (local Chrome via playwright-core): every aircraft, in the house and
// the garden, from the chase and cockpit cameras. Vsync and the frame-rate limit are off, so the numbers are
// what the machine can do, not the monitor's refresh rate.
//
//   npm run build && npx vite preview --port 4191, then
//   node tests/perf-bench.mjs [baseUrl] [--size 3840x2160] [--quality high] [--throttle 4] [--touch] [--out name] [--headed]
//
// Per scene: average fps, 1% low fps, 99th percentile and worst frame time, main-thread CPU ms per frame
// (with the sim / update / render split), GPU ms (where the browser exposes timer queries), draw calls and
// triangles. Writes test-results/perf/<out>.json.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4191/';
const [W, Hh] = opt('size', '3840x2160').split('x').map(Number);
const quality = opt('quality', 'high');
const throttle = parseFloat(opt('throttle', '1'));
const touch = args.includes('--touch');
const settle = parseInt(opt('settle', '1500'), 10);
const window_ = parseInt(opt('ms', '3000'), 10);
const outName = opt('out', `bench-${W}x${Hh}-${quality}${throttle > 1 ? `-cpu${throttle}x` : ''}`);
const only = opt('only', '');   // e.g. micro or micro:garden:cockpit
const extra = opt('query', '');
// --vsync: keep the browser's normal frame pacing (synced to the display when --headed), to see whether a
// display's refresh rate is held. --offscreen: a headed window parked off the desktop.
const vsync = args.includes('--vsync');
const offscreen = args.includes('--offscreen');
const outDir = path.resolve('test-results/perf');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: CHROME, headless: !args.includes('--headed'),
  args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', ...(vsync ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']), '--force-gpu-mem-available-mb=4096',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${W},${Hh}`,
    ...(offscreen ? ['--window-position=-5000,0'] : [])],
});

const PLACES = {
  pad: async () => null,   // sitting on the kitchen pad, rotor idling (as the cockpit check has it)
  house: async (page) => page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return { x: c.x + 0.12, y: c.topY + 0.16, z: c.z + 0.1 }; }),
  garden: async () => ({ x: 0.35, y: -0.05 + 0.2, z: -2.6 }),   // over the garden table, beside the tea station
};
const rows = [];
let gpuName = '';
for (const aircraft of ['micro', 'chinook', 'skycrane']) {
  if (only && !only.split(',').some((o) => o.split(':')[0] === aircraft)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: Hh }, deviceScaleFactor: parseFloat(opt('dpr', '1')), hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?aircraft=${aircraft}&quality=${quality}&view=chase&record=0&dynres=0${extra ? `&${extra}` : ''}`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 90000 });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__helicoptea?.started);
  gpuName = await page.evaluate(() => {
    const gl = window.__helicoptea.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info');
    return `${e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)} | timer queries ${window.__helicoptea.perf ? (window.__helicoptea.perf.ext ? 'yes' : 'no') : 'n/a (old build)'}`;
  });
  await page.evaluate(() => {
    const H = window.__helicoptea; H.doAction('skiphints');
    const ap = new H.Autopilot(); const orig = H.input.update.bind(H.input);
    window.__pilot = { ap, on: false };
    H.input.update = (dt) => { const c = orig(dt); if (window.__pilot.on && H.sim.heli) Object.assign(c, ap.update(H.sim.heli, null, null, dt)); return c; };
    H.sim.assist = true;
    H.sim.damage.rotorStrikes = false; // a strike mid-measurement would turn the scene into a wreck
  });
  if (args.includes('--gpu-detail')) await page.evaluate(() => {
    // Time every renderer.render call on the GPU, labelled by what it draws (shadow maps fall into the
    // first scene render of the frame, marked +shadow). The frame-level query is switched off meanwhile.
    const H = window.__helicoptea, r = H.renderer, gl = r.getContext(), ext = H.perf.ext;
    H.perf.ext = null;
    const pending = [], acc = window.__gpuDetail = { ms: {}, frames: 0 };
    let lastFrame = -1;
    const label = (scene, cam) => {
      const rt = r.getRenderTarget();
      if (scene.isMesh) return `fsquad:${scene.material.name || scene.material.type}${rt ? '' : '>screen'}:${Object.keys(scene.material.uniforms || {}).slice(0, 2).join(',')}`;
      if (scene === H.cockpit.scene) return 'cockpit';
      if (scene.overrideMaterial) return 'ao-normals';
      if (rt === H.loadCam.rt) return 'hookcam';
      if (scene.type === 'Scene' && scene.children.length < 3) return 'pip';
      return `scene${rt ? '' : '>screen'}`;
    };
    acc.calls = {};
    const sm = r.shadowMap, origShadow = sm.render.bind(sm);
    sm.render = (...a) => { const c0 = r.info.render.calls; origShadow(...a); acc.calls.shadow = (acc.calls.shadow || 0) + r.info.render.calls - c0; };
    const orig = r.render.bind(r);
    r.render = (scene, cam) => {
      if (H.frames !== lastFrame) {
        lastFrame = H.frames; acc.frames++;
        while (pending.length && gl.getQueryParameter(pending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
          const { q, k } = pending.shift();
          acc.ms[k] = (acc.ms[k] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q);
        }
      }
      let k = label(scene, cam);
      if (r.shadowMap.needsUpdate && !scene.isMesh && !scene.overrideMaterial) k += '+shadow';
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      const c0 = r.info.render.calls;
      orig(scene, cam);
      acc.calls[k] = (acc.calls[k] || 0) + r.info.render.calls - c0;
      gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q, k });
    };
  });
  const cdp = await ctx.newCDPSession(page);
  await sleep(3000); // shaders, textures and the first frames settle before anything is measured
  for (const place of (opt('places', 'house,garden')).split(',')) {
    const p = await PLACES[place](page);
    if (p) p.y += { micro: 0, chinook: 0.1, skycrane: 0.16 }[aircraft];
    for (const view of ['chase', 'cockpit']) {
      if (only && !only.split(',').some((o) => { const [a, pl, v] = o.split(':'); return a === aircraft && (!pl || pl === place) && (!v || v === view); })) continue;
      if (!p) await page.evaluate((view) => { window.__helicoptea.setView(view); window.__pilot.on = false; }, view);
      else await page.evaluate(([x, y, z, view]) => {
        const H = window.__helicoptea, s = H.sim;
        if (s.state !== 'flying' || !s.heli) H.doAction('restart');
        const t = s.heli.body.translation(), dx = x - t.x, dy = y - t.y, dz = z - t.z;
        s.heli.body.setTranslation({ x, y, z }, true); s.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        // The skycrane's snorkel hose is a chain of bodies on rope joints: carry it along.
        for (const g of (s.heli.hose && s.heli.hose.segs) || []) { const q = g.body.translation(); g.body.setTranslation({ x: q.x + dx, y: q.y + dy, z: q.z + dz }, true); g.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
        window.__pilot.on = true; window.__pilot.ap.target.set(x, y, z); window.__pilot.ap.maxSpeed = 0.05;
        H.setView(view);
        H.doAction('recenter');
      }, p ? [p.x, p.y, p.z, view] : view);
      if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await sleep(settle);
      const r = await page.evaluate(async (ms) => {
        const H = window.__helicoptea;
        // Builds from before the in-game frame stats: time frames from our own rAF loop instead.
        const P = H.perf || (() => {
          const d = [], q = { phase: { sim: 0, update: 0, render: 0 }, gpuMs: -1, phaseMax: () => ({}) };
          let last = 0;
          const loop = (t) => { if (last) d.push(t - last); last = t; if (!q.stop) requestAnimationFrame(loop); };
          requestAnimationFrame(loop);
          q.summary = () => {
            q.stop = true;
            const a = d.slice().sort((x, y) => x - y), k = a.length, m = Math.max(1, Math.floor(k * 0.01));
            const avg = a.reduce((x, y) => x + y, 0) / k, slow = a.slice(k - m).reduce((x, y) => x + y, 0) / m;
            return { low1: 1000 / slow, p99Ms: a[Math.floor(k * 0.99)], worstMs: a[k - 1], cpuMs: -1, cpuP99: -1, cpuMax: -1 };
          };
          return q;
        })();
        if (window.__gpuDetail) { window.__gpuDetail.ms = {}; window.__gpuDetail.calls = {}; window.__gpuDetail.frames = 0; }
        const f0 = H.frames, t0 = performance.now();
        await new Promise((res) => setTimeout(res, ms));
        const n = H.frames - f0, wall = (performance.now() - t0) / 1000;
        const s = P.summary(n);
        const info = H.renderer.info.render;
        return { fps: +(n / wall).toFixed(1), low1: +s.low1.toFixed(1), p99Ms: +s.p99Ms.toFixed(2), worstMs: +s.worstMs.toFixed(1), cpuMs: +s.cpuMs.toFixed(2), cpuP99: +s.cpuP99.toFixed(1), cpuMax: +s.cpuMax.toFixed(1), phaseMax: P.phaseMax(n),
          simMs: +P.phase.sim.toFixed(2), updateMs: +P.phase.update.toFixed(2), renderMs: +P.phase.render.toFixed(2), gpuMs: +P.gpuMs.toFixed(2),
          callDetail: window.__gpuDetail ? Object.fromEntries(Object.entries(window.__gpuDetail.calls).map(([k, v]) => [k, Math.round(v / window.__gpuDetail.frames)])) : undefined,
          gpuDetail: window.__gpuDetail ? Object.fromEntries(Object.entries(window.__gpuDetail.ms).map(([k, v]) => [k, +(v / window.__gpuDetail.frames).toFixed(2)])) : undefined,
          calls: info.calls, tris: info.triangles, dpr: +H.renderer.getPixelRatio().toFixed(2), state: H.sim.state === 'flying' ? 'flying' : `${H.sim.state}:${JSON.stringify(H.sim.crashInfo || {}).slice(0, 80)}`, view: H.viewMode };
      }, window_);
      if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const row = { aircraft, place, view, ...r };
      rows.push(row);
      console.log(`${aircraft.padEnd(8)} ${place.padEnd(6)} ${view.padEnd(7)} ${String(r.fps).padStart(6)} fps  1%low ${String(r.low1).padStart(6)}  p99 ${String(r.p99Ms).padStart(6)} ms  cpu ${r.cpuMs} p99 ${r.cpuP99} max ${r.cpuMax} ${JSON.stringify(r.phaseMax)} (sim ${r.simMs} upd ${r.updateMs} rnd ${r.renderMs})  gpu ${r.gpuMs}  calls ${r.calls}  tris ${(r.tris / 1000).toFixed(0)}k  dpr ${r.dpr} ${r.state}${r.view !== view ? ` VIEW=${r.view}` : ''}`);
      if (r.callDetail) console.log(`    calls by pass: ${JSON.stringify(r.callDetail)}`);
      if (r.gpuDetail) console.log(`    gpu by pass: ${Object.entries(r.gpuDetail).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
    }
  }
  if (errors.length) console.log(`  errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(`GPU: ${gpuName}`);
fs.writeFileSync(path.join(outDir, `${outName}.json`), JSON.stringify({ size: [W, Hh], quality, throttle, touch, gpu: gpuName, rows }, null, 2));
