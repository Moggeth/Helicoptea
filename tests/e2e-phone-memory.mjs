// Phone memory and crash recovery, on an emulated Galaxy S24 Ultra (412x891 CSS pixels at 3.5x, touch):
// GPU memory actually allocated through WebGL stays inside the phone budget, the start-up probe context is
// given back, a lost graphics context reloads the game a tier lower instead of dead-ending, and a load that
// never finished last time comes back on lighter graphics.
//
//   node tests/e2e-phone-memory.mjs http://127.0.0.1:4199/
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4199/';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-precise-memory-info'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const PHONE = { viewport: { width: 412, height: 891 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true };

// Tallies what the page asks the GPU for: textures, renderbuffers (multisampled ones by sample count) and
// buffers, live and peak, plus how many WebGL contexts were made and lost.
function tally() {
  const BPP = { 0x1908: 4, 0x1907: 3, 0x8058: 4, 0x881A: 8, 0x8814: 16, 0x822F: 4, 0x8D62: 2, 0x81A5: 2, 0x81A6: 4, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x8C43: 4, 0x8229: 1, 0x822B: 2, 0x1903: 1 };
  const T = (window.__gpuTally = { live: new Map(), peak: 0, now: 0, contexts: 0, lost: 0 });
  const sum = () => { let s = 0; for (const v of T.live.values()) s += v; T.now = s; if (s > T.peak) T.peak = s; };
  const P = WebGL2RenderingContext.prototype, cur = new WeakMap();
  const at = (gl) => { let c = cur.get(gl); if (!c) cur.set(gl, c = {}); return c; };
  const wrap = (name, fn) => { const o = P[name]; P[name] = function (...a) { fn.call(this, a); return o.apply(this, a); }; };
  let id = 0; const key = (o) => o.__k || (o.__k = `o${++id}`);
  wrap('bindTexture', function (a) { at(this).tex = a[1]; });
  wrap('bindRenderbuffer', function (a) { at(this).rb = a[1]; });
  wrap('bindBuffer', function (a) { at(this)[`b${a[0]}`] = a[1]; });
  wrap('texStorage2D', function (a) { const t = at(this).tex; if (!t) return; let s = 0; for (let l = 0, w = a[3], h = a[4]; l < a[1]; l++, w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) s += w * h * (BPP[a[2]] || 4); T.live.set(key(t), s * (a[0] === 0x8513 ? 6 : 1)); sum(); });
  wrap('texImage2D', function (a) { const t = at(this).tex; if (!t || a[1] !== 0) return; const src = a[a.length - 1]; const w = typeof a[3] === 'number' && a.length >= 8 ? a[3] : src?.width || 0; const h = typeof a[4] === 'number' && a.length >= 8 ? a[4] : src?.height || 0; T.live.set(`${key(t)}:${a[0]}`, w * h * (BPP[a[2]] || 4)); sum(); });
  wrap('deleteTexture', function (a) { if (!a[0]) return; for (const k of [...T.live.keys()]) if (k === a[0].__k || k.startsWith(`${a[0].__k}:`)) T.live.delete(k); sum(); });
  wrap('renderbufferStorage', function (a) { const r = at(this).rb; if (r) { T.live.set(key(r), a[2] * a[3] * (BPP[a[1]] || 4)); sum(); } });
  wrap('renderbufferStorageMultisample', function (a) { const r = at(this).rb; if (r) { T.live.set(key(r), a[3] * a[4] * (BPP[a[2]] || 4) * Math.max(1, a[1])); sum(); } });
  wrap('deleteRenderbuffer', function (a) { if (a[0]) { T.live.delete(a[0].__k); sum(); } });
  wrap('bufferData', function (a) { const b = at(this)[`b${a[0]}`]; if (b) { T.live.set(key(b), typeof a[1] === 'number' ? a[1] : a[1].byteLength); sum(); } });
  wrap('deleteBuffer', function (a) { if (a[0]) { T.live.delete(a[0].__k); sum(); } });
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (k, o) {
    const c = gc.call(this, k, o);
    if (c && /webgl/.test(k) && !this.__counted) { this.__counted = 1; T.contexts++; this.addEventListener('webglcontextlost', () => T.lost++); }
    return c;
  };
}

async function open(query = '', { clear = true, init } = {}) {
  const ctx = await browser.newContext(PHONE);
  if (clear) await ctx.addInitScript(() => { if (!sessionStorage.getItem('t.cleared')) { try { localStorage.clear(); } catch { /* fresh */ } sessionStorage.setItem('t.cleared', '1'); } });
  if (init) await ctx.addInitScript(init);
  await ctx.addInitScript(tally);
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); logs.push(m.text()); });
  await page.goto(`${base}?record=0&dynres=0${query}`);
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 120000 });
  return { ctx, page, errors, logs };
}
const MB = (b) => Math.round(b / 1048576);

try {
  // ---------------------------------------------------------------- memory while flying
  {
    // Test the actual medium-tier allocation even when Auto correctly selects low on CI's software GPU.
    const { ctx, page, errors, logs } = await open('&aircraft=micro&view=chase&quality=medium');
    await page.tap('#start-btn');
    await page.waitForFunction(() => window.__helicoptea.frames > 120, null, { timeout: 60000 });
    await sleep(2000);
    // Retained script memory: what is still reachable after a garbage collection (building the neighbourhood
    // leaves a lot of short-lived garbage that the next collection takes; how much is still uncollected at a
    // given moment says little about what the page keeps).
    const rawHeap = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const r = await page.evaluate(() => {
      const h = window.__helicoptea, T = window.__gpuTally;
      return { tier: h.quality.name, now: T.now, peak: T.peak, contexts: T.contexts, lost: T.lost, programs: h.renderer.info.programs.length, heap: performance.memory?.usedJSHeapSize || 0, budget: window.__helicoptea.gpuBudget?.() };
    });
    const line = logs.find((l) => l.includes('GPU memory')) || '';
    check('explicit medium tests the phone memory budget at medium quality', r.tier === 'medium', r.tier);
    check('GPU memory in flight stays inside the phone budget (160 MB)', MB(r.now) < 160, `${MB(r.now)} MB live`);
    check('GPU memory peak during load stays inside the phone budget (160 MB)', MB(r.peak) < 160, `${MB(r.peak)} MB peak`);
    check('only the game keeps a WebGL context (the probe is given back)', r.contexts === 2 && r.lost === 1, { contexts: r.contexts, lost: r.lost });
    check('JS heap stays under 150 MB', MB(r.heap) < 150, `${MB(r.heap)} MB retained (${MB(rawHeap)} MB before collecting)`);
    check('start-up logs its GPU memory estimate', /GPU memory ~\d+ MB/.test(line), line);
    check('no errors', !errors.length, errors.slice(0, 3));
    await ctx.close();
  }

  // ---------------------------------------------------------------- lost graphics context
  {
    const { ctx, page, errors } = await open('&aircraft=micro');
    const auto = await page.evaluate(() => ({ tier: window.__helicoptea.quality.name, software: window.__helicoptea.quality.software }));
    check('Auto uses low on a software GPU and medium on a phone GPU', auto.tier === (auto.software ? 'low' : 'medium'), auto);
    // Low is not the lowest policy state any more: touch Auto (including a software GPU) can still
    // reload once into safe mode, which also removes the neighbourhood. Test that real transition;
    // do not rewrite debug quality state to emulate the older medium -> low policy.
    await page.tap('#start-btn');
    await page.waitForFunction(() => window.__helicoptea.frames > 30);
    const reloaded = page.waitForEvent('load', { timeout: 120000 });
    await page.evaluate(() => window.__helicoptea.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await reloaded;
    await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 120000 });
    const r = await page.evaluate(() => ({ tier: window.__helicoptea.quality.name, noWorld: !!window.__helicoptea.quality.noWorld, safe: localStorage.getItem('helicoptea.safeTier'), error: document.getElementById('error').classList.contains('show') }));
    check('a lost context reloads the game in safe mode (low tier, no neighbourhood)', r.tier === 'low' && r.safe === 'safe' && r.noWorld, r);
    check('no error screen after that reload', !r.error);
    // A second loss in the same tab doesn't loop: it says what happened instead.
    await page.evaluate(() => window.__helicoptea.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await sleep(1500);
    const shown = await page.evaluate(() => document.getElementById('error').classList.contains('show') && document.getElementById('error-msg').textContent);
    check('a second loss shows a message instead of reloading again', !!shown && /graphics context was lost/.test(shown), shown);
    check('no script errors', !errors.some((e) => !/fatal/.test(e)), errors.slice(0, 3));
    await ctx.close();
  }

  // ---------------------------------------------------------------- a load that never finished
  {
    const { ctx, page } = await open('&crashguard=1', { clear: false, init: () => { try { if (!sessionStorage.getItem('t.seeded')) { localStorage.clear(); localStorage.setItem('helicoptea.booting', '1'); sessionStorage.setItem('t.seeded', '1'); } } catch { /* ignore */ } } });
    const r = await page.evaluate(() => ({ tier: window.__helicoptea.quality.name, noWorld: !!window.__helicoptea.quality.noWorld, safe: localStorage.getItem('helicoptea.safeTier'), status: document.getElementById('load-status').textContent }));
    check('after a load that died, Auto comes back in safe mode', r.tier === 'low' && r.safe === 'safe' && r.noWorld, r);
    check('the start screen says why', /safe mode/.test(r.status), r.status);
    // Putting the page away clears the mark: the next load is not taken as a crash.
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    const mark = await page.evaluate(() => localStorage.getItem('helicoptea.booting'));
    check('closing the page normally clears the crash mark', !mark, mark);
    await ctx.close();
  }
} catch (e) {
  check('suite ran to the end', false, e.message);
}
await browser.close();
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
