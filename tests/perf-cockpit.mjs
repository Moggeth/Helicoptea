// Frame cost of the cockpit: node tests/perf-cockpit.mjs [baseUrl] [--aircraft=micro|chinook|skycrane] [--size=1920x1080]
// Hovers in the cockpit view with a bag on the hook (the skycrane with its snorkel down) and, for a few
// seconds, times the cockpit's per-frame update (instruments), its draw (including any texture uploads),
// and the hook camera's extra world render, on the CPU and, where the browser exposes GPU timer
// queries, on the GPU. Works against older builds too (it only wraps public methods).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4190/';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const which = process.argv.find((a) => a.startsWith('--aircraft='))?.slice(11) || 'micro';
const vp = process.argv.find((a) => a.startsWith('--size='))?.slice(7).split('x').map(Number) || [1920, 1080];
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-webgl-draft-extensions'] });
const page = await (await browser.newContext({ viewport: { width: vp[0], height: vp[1] } })).newPage();
await page.goto(`${base}?aircraft=${which}&view=chase${process.argv.find((a) => a.startsWith('--query='))?.slice(8) || ''}`, { waitUntil: 'load' });
await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
await page.click('#start-btn');
await page.waitForFunction(() => window.__helicoptea?.started);
await page.evaluate(() => {
  const H = window.__helicoptea;
  try { H.doAction('skiphints'); } catch { /* */ }
  const ap = new H.Autopilot();
  const orig = H.input.update.bind(H.input);
  window.__pilot = ap;
  H.input.update = (dt) => { const c = orig(dt); if (!H.sim.heli) return c; const o = ap.update(H.sim.heli, null, null, dt); c.pitch = o.pitch; c.roll = o.roll; c.yaw = o.yaw; c.collective = o.collective; return c; };
  const s = H.sim, h = s.heli, mug = s.cups.find((c) => c.id === 'mug');
  const x = mug.x + 0.03, y = mug.waterY + 0.3, z = mug.z + 0.05;
  h.body.setTranslation({ x, y, z }, true); h.body.setLinvel({ x: 0, y: 0, z: 0 }, true); h.updateCached();
  ap.target.set(x, y, z);
  const free = s.bags.filter((b) => !b.retiring && !(b.attach && b.attach.kind === 'heli'));
  (h.type === 'skycrane' ? [] : h.hookWorlds).forEach((hw, i) => {
    const b = free[i]; if (!b) return;
    if (b.attach) s.detachBag(b, true);
    b.body.setTranslation({ x: hw.x, y: hw.y - 0.18, z: hw.z }, true); b.updateCached();
    s.attachBag(b, { kind: 'heli', heli: h, hook: i });
  });
});
await page.keyboard.press('Digit1');
await sleep(2500);
// --eval=<js>: run in the page before measuring (for A/B experiments, e.g. hiding a part).
const ev = process.argv.find((a) => a.startsWith('--eval='));
if (ev) await page.evaluate(ev.slice(7));
// --throttle=N: CDP CPU throttling while measuring (phone-class CPU).
const thr = process.argv.find((a) => a.startsWith('--throttle='));
if (thr) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: +thr.slice(11) });
const r = await page.evaluate(() => new Promise((res) => {
  const H = window.__helicoptea, ck = H.cockpit, lc = H.loadCam, gl = H.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const T = { update: [], render: [], loadCam: [], frame: [], gpuRender: [], gpuLoadCam: [], calls: [] };
  const wrap = (obj, name, key, gpuKey) => {
    const f = obj[name].bind(obj);
    obj[name] = (...a) => {
      let q = null;
      if (ext && gpuKey) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
      const c0 = H.renderer.info.render.calls;
      const t = performance.now();
      const out = f(...a);
      T[key].push(performance.now() - t);
      if (key === 'render') T.calls.push(H.renderer.info.render.calls - c0);
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push([q, gpuKey]); }
      return out;
    };
  };
  const pending = [];
  wrap(ck, 'update', 'update');
  wrap(ck, 'render', 'render', 'gpuRender');
  wrap(lc, 'render', 'loadCam', 'gpuLoadCam');
  const t0 = performance.now(); let last = t0;
  const tick = (t) => {
    T.frame.push(t - last); last = t;
    for (let i = pending.length - 1; i >= 0; i--) {
      const [q, k] = pending[i];
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) T[k].push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); pending.splice(i, 1); }
    }
    if (t - t0 < 5000) requestAnimationFrame(tick);
    else {
      const st = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const sum = a.reduce((x, y) => x + y, 0); return { n: a.length, mean: +(sum / a.length).toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3), max: +s[s.length - 1].toFixed(3) }; };
      const secs = (t - t0) / 1000;
      res({ fps: +(T.frame.length / secs).toFixed(1), frameMs: st(T.frame), cockpitUpdateMs: st(T.update), cockpitRenderMs: st(T.render), cockpitDrawCalls: st(T.calls), hookCamRenderMs: st(T.loadCam), hookCamPerSec: +(T.loadCam.length / secs).toFixed(1),
        gpu: ext ? { cockpitRenderMs: st(T.gpuRender), hookCamMs: st(T.gpuLoadCam) } : 'timer queries unavailable', state: H.sim.state });
    }
  };
  requestAnimationFrame(tick);
}));
console.log(which, vp.join('x'), JSON.stringify(r, null, 1));
await browser.close();
