// Browser checks for the Chinook's biscuits: the stand draws, the winch answers the real input paths
// (keyboard G, a pad's RT by its travel, the touch Dunk button), a dunk crumbles one on screen, and no
// console errors. Same setup as tests/e2e-chinook.mjs.
// Usage: start a server, then: node tests/e2e-biscuits.mjs [baseUrl] [--headed]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
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
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  biscuits: ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: CHROME, headless: !headed,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  await ctx.addInitScript(() => { try { localStorage.setItem('helicoptea.hint', '7'); localStorage.setItem('helicoptea.lesson', 'seen'); } catch { /* ignore */ } });
  if (opts.gamepad) await ctx.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [{ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map((b) => ({ ...b })), timestamp: performance.now() }, null, null, null];
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + '?aircraft=chinook&worldSpeed=1&lesson=0' + (opts.query || ''), { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  return { ctx, page, logs };
}
const errorsIn = (logs) => logs.filter((l) => /\[(error|pageerror)\]/.test(l));
// Hang a biscuit of the given kind on the centre hook, as hooking it off the stand would.
const hookOne = (page, kind) => page.evaluate((kind) => {
  const sim = window.__helicoptea.sim;
  const b = sim.biscuits.list.find((x) => x.kind.id === kind && x.body);
  sim.detachBag(b, true);
  const h = sim.heli.hookWorlds[1], a = b.anchorLocal.clone().applyQuaternion(b.quat);
  b.body.setTranslation({ x: h.x - a.x, y: Math.max(0.05, h.y - 0.12 - a.y), z: h.z - a.z }, true);
  b.resting = false;
  sim.attachBag(b, { kind: 'heli', heli: sim.heli, hook: 1 });
  return b.id;
}, kind);
// The winch's line length now, and what the input asked for.
const winch = (page) => page.evaluate(() => {
  const H = window.__helicoptea, b = H.sim.biscuits.list.find((x) => x.attach && x.attach.kind === 'heli');
  return { line: b ? b.line : null, dunk: H.input.ctl.dunk };
});

try {
  // ---------------------------------------------------------------- keyboard: the stand, G winch, a dunk
  {
    const { ctx, page, logs } = await open({ width: 1280, height: 800 });
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    await sleep(600);
    const n = await page.evaluate(() => window.__helicoptea.sim.biscuits.list.length);
    check('the biscuit stand is stocked for the Chinook', n === 6, `${n}`);
    // Look at the stand.
    await page.evaluate(() => { const H = window.__helicoptea, S = H.sim.biscuits.pegs; H.freeCam.on = true; H.freeCam.pos.set(S[2].tip.x + 0.03, 0.17, S[2].tip.z + 0.3); H.freeCam.look.set(S[2].tip.x + 0.03, 0.08, S[2].tip.z - 0.02); });
    await sleep(800);
    await page.screenshot({ path: path.join(outDir, 'biscuits-01-stand.png') });
    await page.evaluate(() => { window.__helicoptea.freeCam.on = false; });
    // Lift off, hook a digestive, hold G.
    await page.keyboard.down('KeyW'); await sleep(1400); await page.keyboard.up('KeyW');
    await sleep(600);
    await hookOne(page, 'digestive');
    await sleep(300);
    await page.keyboard.down('KeyG'); await sleep(900);
    const out = await winch(page);
    check('holding G pays the biscuit line out', out.dunk === 1 && out.line > 0.17, `line ${out.line?.toFixed(3)} m`);
    await page.keyboard.up('KeyG'); await sleep(1500);
    const back = await winch(page);
    check('letting go of G reels it back in', back.dunk === 0 && back.line < 0.125, `line ${back.line?.toFixed(3)} m`);
    // A dunk in the mug, posed directly (the flying is covered by the node checks): crumbs and a broken edge.
    const dunk = await page.evaluate(() => new Promise((res) => {
      const H = window.__helicoptea, sim = H.sim, cup = sim.cups[0];
      const b = sim.biscuits.list.find((x) => x.attach && x.attach.kind === 'heli');
      sim.detachBag(b, true);
      b.body.setTranslation({ x: cup.x, y: cup.waterY - 0.02 + b.kind.r, z: cup.z }, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.body.setBodyType(2, true);   // kinematic while posed, so it stays put in the tea
      H.freeCam.on = true; H.freeCam.pos.set(cup.x + 0.14, 0.15, cup.z + 0.16); H.freeCam.look.set(cup.x, 0.08, cup.z);
      const t0 = performance.now();
      const tick = () => {
        b.body?.setNextKinematicTranslation({ x: cup.x, y: cup.waterY - 0.02 + b.kind.r, z: cup.z });
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res({ soak: b.s[0], wet: b.wetness });
      };
      tick();
    }));
    await page.screenshot({ path: path.join(outDir, 'biscuits-02-dunk.png') });
    check('a digestive in the tea soaks from the bottom', dunk.soak > 0.3, `bottom band ${dunk.soak.toFixed(2)}`);
    check('no console errors (keyboard run)', errorsIn(logs).length === 0, errorsIn(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---------------------------------------------------------------- gamepad: RT travel sets the line
  {
    const { ctx, page, logs } = await open({ width: 1280, height: 800 }, { gamepad: true });
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    await sleep(500);
    await page.evaluate(() => { window.__pad.axes[1] = -1; });
    await sleep(1400);
    await page.evaluate(() => { window.__pad.axes[1] = 0; });
    await hookOne(page, 'ginger');
    await page.evaluate(() => { window.__pad.buttons[7] = { pressed: true, value: 0.5 }; });
    await sleep(1800);
    const half = await winch(page);
    check('RT half way lowers the line half way', Math.abs(half.dunk - 0.5) < 0.05 && Math.abs(half.line - 0.17) < 0.012, `dunk ${half.dunk?.toFixed(2)}, line ${half.line?.toFixed(3)} m`);
    await page.evaluate(() => { window.__pad.buttons[7] = { pressed: false, value: 0 }; });
    check('no console errors (gamepad run)', errorsIn(logs).length === 0, errorsIn(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---------------------------------------------------------------- touch: the Dunk button
  {
    const { ctx, page, logs } = await open({ width: 844, height: 390 }, { touch: true, mobile: true, dpr: 2 });
    await page.tap('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    await sleep(500);
    const hidden = await page.evaluate(() => document.querySelector('.touch-btn.pour').classList.contains('hidden'));
    check('no Dunk button before a biscuit is on', hidden);
    await hookOne(page, 'richtea');
    await sleep(400);
    const btn = await page.evaluate(() => { const b = document.querySelector('.touch-btn.pour'); return { hidden: b.classList.contains('hidden'), label: b.querySelector('.lbl').textContent }; });
    check('carrying a biscuit shows the Dunk button', !btn.hidden && btn.label === 'Dunk', JSON.stringify(btn));
    const box = await page.locator('.touch-btn.pour').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 3 }] });
    await sleep(900);
    const held = await winch(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('holding Dunk pays the line out', held.dunk === 1 && held.line > 0.17, `line ${held.line?.toFixed(3)} m`);
    await page.screenshot({ path: path.join(outDir, 'biscuits-03-touch.png') });
    check('no console errors (touch run)', errorsIn(logs).length === 0, errorsIn(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} biscuit browser checks passed`);
process.exit(failed.length ? 1 : 0);
