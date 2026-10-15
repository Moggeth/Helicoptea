// Browser checks for the Chinook through the real input paths (keyboard, emulated gamepad, CDP touch),
// the aircraft picker, the in-flight switch, the breakup and frame rate. Same setup as tests/e2e.mjs.
// Usage: start a server, then: node tests/e2e-chinook.mjs [baseUrl] [--headed]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4179/';
const headed = process.argv.includes('--headed');
const outDir = path.resolve('test-results');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  chinook: ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: CHROME, headless: !headed,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  await ctx.addInitScript(() => { try { localStorage.setItem('helicoptea.hint', '7'); } catch { /* ignore */ } });
  if (opts.gamepad) await ctx.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const act = { playEffect: () => Promise.resolve('complete') };
    navigator.getGamepads = () => [{ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map((b) => ({ ...b })), timestamp: performance.now(), vibrationActuator: act }, null, null, null];
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  // Scripted timings assume real-time world speed (the default world runs slower).
  const q = opts.query || '';
  await page.goto(base + (q ? q + '&' : '?') + 'worldSpeed=1', { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  return { ctx, page, logs };
}
const st = (page) => page.evaluate(() => {
  const s = window.__helicoptea.sim, h = s.heli;
  return { aircraft: s.aircraft, type: h?.type, state: s.state, y: h?.pos.y, tilt: h ? Math.acos(Math.min(1, h.up.y)) : 0, hdg: h?.heading(), debris: s.debris.length, carried: s.carriedBags().length };
});
const errorsIn = (logs) => logs.filter((l) => /\[(error|pageerror)\]/.test(l));

try {
  // ---------------------------------------------------------------- keyboard + picker
  {
    const { ctx, page, logs } = await open({ width: 1280, height: 800 });
    await page.click('[data-aircraft="chinook"]');
    let s = await st(page);
    check('start-screen picker selects the Chinook', s.aircraft === 'chinook' && s.type === 'chinook');
    const started = await page.evaluate(() => window.__helicoptea.started);
    check('choosing an aircraft does not start the flight', !started);
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    await sleep(500);
    await page.keyboard.down('KeyW'); await sleep(1600); await page.keyboard.up('KeyW');
    await sleep(800);
    s = await st(page);
    check('keyboard: W lifts the Chinook', s.y > 0.15 && s.state === 'flying', `y=${s.y?.toFixed(3)}`);
    await page.keyboard.down('ArrowRight'); await sleep(500);
    s = await st(page);
    await page.keyboard.up('ArrowRight');
    check('keyboard: arrows tilt it', s.tilt > 0.05, `tilt=${s.tilt.toFixed(3)}`);
    await sleep(2500);
    const h0 = (await st(page)).hdg;
    await page.keyboard.down('KeyD'); await sleep(1200); await page.keyboard.up('KeyD');
    const dh = (await st(page)).hdg - h0;
    check('keyboard: D yaws through differential cyclic', Math.abs(dh) > 0.4, `heading change ${dh.toFixed(2)} rad`);
    await sleep(1500);
    await page.keyboard.press('KeyF');
    await sleep(300);
    const assist = await page.evaluate(() => window.__helicoptea.sim.assist);
    await page.keyboard.down('KeyW'); await sleep(300); await page.keyboard.up('KeyW');
    await sleep(1500);
    s = await st(page);
    check('assist off: still flying a second later', !assist && s.state === 'flying', `assist=${assist} y=${s.y?.toFixed(3)}`);
    await page.keyboard.press('KeyF');
    await page.screenshot({ path: path.join(outDir, 'chinook-01-keyboard.png') });
    await page.keyboard.press('KeyV');
    await sleep(400);
    s = await st(page);
    check('V switches to the next aircraft (the skycrane) on the pad', s.aircraft === 'skycrane' && s.type === 'skycrane' && s.y < 0.07, `aircraft ${s.aircraft} y=${s.y?.toFixed(3)}`);
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.click('.aircraft-row [data-id="chinook"]');
    await sleep(300);
    s = await st(page);
    const stored = await page.evaluate(() => localStorage.getItem('helicoptea.aircraft'));
    check('pause menu switches back to the Chinook and remembers it', s.aircraft === 'chinook' && stored === 'chinook', `stored ${stored}`);
    await page.keyboard.press('Escape');
    await sleep(300);
    // Breakup through the real loop: assist off, collective chopped from height.
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    await sleep(1000);
    // The Stays put lift mode keeps a collective set by hand (the default sprung stick would set it from the stick).
    await page.evaluate(() => { const H = window.__helicoptea; H.CFG.collective.mode = 'hold'; H.sim.assist = false; H.sim.heli.collective = 0.05; });
    for (let i = 0; i < 60 && (await st(page)).state === 'flying'; i++) await sleep(50);
    await sleep(300);
    s = await st(page);
    await page.screenshot({ path: path.join(outDir, 'chinook-02-breakup.png') });
    check('breaks up into 19 pieces in the browser', s.state === 'destroyed' && s.debris === 19, `state ${s.state} debris ${s.debris}`);
    await page.evaluate(() => { window.__helicoptea.CFG.collective.mode = 'spring'; });
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; if (t - t0 < 2000) requestAnimationFrame(f); else res(n / ((t - t0) / 1000)); }; requestAnimationFrame(f); }));
    check('frame rate holds during the Chinook explosion', fps > 50, `${fps.toFixed(0)} fps`);
    check('no console errors (keyboard run)', errorsIn(logs).length === 0, errorsIn(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---------------------------------------------------------------- gamepad
  {
    const { ctx, page, logs } = await open({ width: 1280, height: 800 }, { gamepad: true, query: '?aircraft=chinook' });
    const press = async (i) => { await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i); await sleep(100); await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i); await sleep(120); };
    await press(0); await sleep(600);
    await page.evaluate(() => { window.__pad.axes[1] = -1; }); await sleep(1500);
    await page.evaluate(() => { window.__pad.axes[1] = 0; }); await sleep(700);
    let s = await st(page);
    check('gamepad: left stick lifts the Chinook', s.type === 'chinook' && s.y > 0.15, `y=${s.y?.toFixed(3)}`);
    await page.evaluate(() => { window.__pad.axes[3] = -1; }); await sleep(500);
    s = await st(page);
    await page.evaluate(() => { window.__pad.axes[3] = 0; });
    check('gamepad: right stick tilts it', s.tilt > 0.05, `tilt=${s.tilt.toFixed(3)}`);
    check('no console errors (gamepad run)', errorsIn(logs).length === 0, errorsIn(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---------------------------------------------------------------- touch
  {
    const { ctx, page, logs } = await open({ width: 844, height: 390 }, { touch: true, mobile: true, dpr: 2, query: '?aircraft=chinook' });
    await page.tap('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    await sleep(500);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [{ x: 160, y: 300, id: 1 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: 160, y: 300 - i * 12, id: 1 }]); await sleep(30); }
    await sleep(1500);
    let s = await st(page);
    check('touch: left thumb lifts the Chinook', s.type === 'chinook' && s.y > 0.12, `y=${s.y?.toFixed(3)}`);
    await touch('touchMove', [{ x: 160, y: 300, id: 1 }, { x: 690, y: 300, id: 2 }]);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: 160, y: 300, id: 1 }, { x: 690, y: 300 - i * 12, id: 2 }]); await sleep(30); }
    await sleep(500);
    s = await st(page);
    check('touch: right thumb tilts it', s.tilt > 0.04, `tilt=${s.tilt.toFixed(3)}`);
    await touch('touchEnd', []);
    await page.screenshot({ path: path.join(outDir, 'chinook-03-touch.png') });
    check('no console errors (touch run)', errorsIn(logs).length === 0, errorsIn(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} chinook browser checks passed`);
process.exit(failed.length ? 1 : 0);
