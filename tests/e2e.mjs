// End-to-end browser checks using the locally installed Chrome (no browser download).
// Usage: start the dev server (npm run dev) or preview, then: node tests/e2e.mjs [baseUrl] [--headed]
// Writes screenshots and a JSON report to test-results/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4178/';
const headed = process.argv.includes('--headed');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const outDir = path.resolve('test-results');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

const report = { base, browser: null, gpu: null, when: new Date().toISOString(), checks: [], perf: {} };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: !headed,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
report.browser = `${path.basename(CHROME)} ${browser.version()}${headed ? ' (headed)' : ' (headless)'}`;

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  if (opts.gamepad) await ctx.addInitScript(() => {
    // Emulated standard-mapping gamepad driven by window.__pad (for mapping checks only).
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const pad = () => ({ id: 'Emulated Xbox Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: window.__pad.axes, buttons: window.__pad.buttons, timestamp: performance.now() });
    navigator.getGamepads = () => [pad(), null, null, null];
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + (opts.query || ''), { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  return { ctx, page, logs };
}
const start = async (page) => { await page.click('#start-btn'); await page.waitForFunction(() => window.__helicoptea?.started); await sleep(600); };
const st = (page) => page.evaluate(() => {
  const s = window.__helicoptea.sim, h = s.heli, b = s.carriedBag();
  return { state: s.state, y: h?.pos.y, x: h?.pos.x, z: h?.pos.z, vy: h?.vel.y, tilt: h ? Math.acos(Math.min(1, h.up.y)) : 0, coll: h?.collective, assist: s.assist,
    carried: !!b, wet: b?.wetness, imm: b?.immersion, bags: s.bags.length, debris: s.debris.length, bodies: s.world.bodies.len(), brew: s.cups.map((c) => c.brew), paused: window.__helicoptea.paused };
});
async function fps(page, ms = 4000) {
  return page.evaluate((ms) => new Promise((resolve) => {
    const times = []; let last = performance.now(); const t0 = last;
    const r = window.__helicoptea.renderer.info.render; const f0 = r.frame;
    const f = (t) => { times.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else {
      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      resolve({ renderedFps: +((r.frame - f0) / ((t - t0) / 1000)).toFixed(1), frames: times.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), maxMs: +times[times.length - 1].toFixed(2) });
    } };
    requestAnimationFrame(f);
  }), ms);
}
// In-page autopilot feeding the real input pipeline (same ctl object the keyboard/gamepad/touch produce).
async function installPilot(page) {
  await page.evaluate(async () => {
    const H = window.__helicoptea;
    const Autopilot = H.Autopilot;
    const ap = new Autopilot();
    const orig = H.input.update.bind(H.input);
    window.__pilot = { ap, on: false, aimBag: false };
    H.input.update = (dt) => {
      const c = orig(dt);
      const P = window.__pilot;
      if (!P.on || !H.sim.heli) return c;
      const b = H.sim.carriedBag();
      const out = ap.update(H.sim.heli, b ? b.vel.clone().sub(H.sim.heli.vel) : null, P.aimBag && b ? b.pos : null, dt);
      Object.assign(c, out);
      return c;
    };
  });
}
const fly = (page, x, y, z, speed, ms, aimBag = false) => page.evaluate(([x, y, z, speed, aimBag]) => {
  const P = window.__pilot; P.on = true; P.aimBag = aimBag; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed;
}, [x, y, z, speed, aimBag]).then(() => sleep(ms));
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

try {
  // ------------------------------------------------------------ desktop: load, idle perf, keyboard
  if (!only || only === 'desktop') {
    const { ctx, page, logs } = await open({ width: 1600, height: 900 }, { query: '?debug=1' });
    const ready = logs.find((l) => l.includes('ready in'));
    report.gpu = ready || null;
    check('loads to start screen without errors', !logs.some((l) => l.includes('pageerror') || l.startsWith('[error]')), ready || logs.slice(-3).join(' | '));
    await shot(page, '01-start-screen');
    await start(page);
    await shot(page, '02-on-pad');
    report.perf.desktopIdle = await fps(page, 4000);
    check('desktop idle frame rate', report.perf.desktopIdle.fps > 55, JSON.stringify(report.perf.desktopIdle));

    // Keyboard: hold W to lift off.
    await page.keyboard.down('KeyW'); await sleep(1300); await page.keyboard.up('KeyW');
    let s = await st(page);
    check('keyboard W lifts off (assist on)', s.y > 0.15 && s.state === 'flying', `y=${s.y?.toFixed(3)}`);
    await sleep(1500);
    const s2 = await st(page);
    check('assist holds altitude on release', Math.abs(s2.vy) < 0.05 && Math.abs(s2.y - s.y) < 0.12, `vy=${s2.vy?.toFixed(3)} dy=${(s2.y - s.y).toFixed(3)}`);
    await page.keyboard.down('ArrowUp'); await sleep(350); await page.keyboard.up('ArrowUp');
    s = await st(page);
    check('arrow key tilts the helicopter', s.tilt > 0.05, `tilt=${s.tilt.toFixed(3)} rad`);
    await sleep(1500);
    s = await st(page);
    check('assist levels after cyclic release', s.tilt < 0.06, `tilt=${s.tilt.toFixed(3)}`);
    await page.keyboard.press('KeyF');
    await sleep(120);
    s = await st(page);
    check('F toggles flight assist off', s.assist === false);
    await shot(page, '03-assist-off-hover');
    await page.keyboard.down('ArrowRight'); await sleep(200); await page.keyboard.up('ArrowRight');
    await sleep(700);
    s = await st(page);
    check('assist off: tilt persists after releasing cyclic', s.tilt > 0.05 || s.state === 'destroyed', `tilt=${s.tilt?.toFixed(3)} state=${s.state}`);
    await page.keyboard.press('KeyF');
    await page.keyboard.press('KeyR');
    await sleep(500);
    s = await st(page);
    check('R restarts the flight on the pad', s.state === 'flying' && s.y < 0.07, `y=${s.y?.toFixed(3)}`);

    // Full loop with the in-page pilot using the same control path.
    await installPilot(page);
    await page.evaluate(() => { window.__helicoptea.sim.assist = true; });
    const peg = await page.evaluate(() => { const p = window.__helicoptea.sim.pegs[1].tip; return [p.x, p.y, p.z]; });
    await fly(page, -0.56, 0.42, 0.24, 0.3, 1800);
    await fly(page, peg[0], 0.42, peg[2] + 0.004, 0.3, 4000);
    await fly(page, peg[0], peg[1] + 0.054, peg[2] + 0.004, 0.12, 3000);
    await shot(page, '04-hook-at-loop');
    const prompt = await page.evaluate(() => document.querySelector('.prompt').classList.contains('show') ? document.querySelector('.prompt').textContent : '');
    check('attach prompt appears near a loop', /Hook/.test(prompt), prompt);
    await page.keyboard.press('Space');
    await sleep(120);
    s = await st(page);
    check('Space attaches the bag', s.carried);
    await fly(page, peg[0], 0.45, peg[2] + 0.03, 0.15, 2500);
    const mug = await page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.z, c.waterY]; });
    await fly(page, mug[0], 0.42, mug[1], 0.3, 2500);
    await shot(page, '05-carrying');
    await fly(page, mug[0], 0.4, mug[1], 0.3, 4500, false);
    await fly(page, mug[0], 0.3, mug[1], 0.1, 4000, true);
    await page.evaluate(([mx, mz, wy]) => {
      const H = window.__helicoptea; const b = H.sim.carriedBag(); const h = H.sim.heli;
      window.__pilot.aimBag = false;
      window.__pilot.ap.target.set(mx + h.pos.x - b.pos.x, wy - 0.02 + 0.06 + 0.15 + 0.046, mz + h.pos.z - b.pos.z);
      window.__pilot.ap.maxSpeed = 0.05;
    }, mug);
    await sleep(3500);
    await shot(page, '06-dipping');
    await sleep(6000);
    s = await st(page);
    await shot(page, '07-brewed');
    check('bag immersed and soaking in the mug', s.carried && s.wet > 0.5, `wet=${s.wet?.toFixed(2)} imm=${s.imm?.toFixed(2)} brew=${s.brew.map((b) => b.toFixed(2))}`);
    check('only the mug brewed', s.brew[0] > 0.15 && s.brew[1] < 0.01, s.brew.map((b) => b.toFixed(2)).join(','));
    await fly(page, mug[0], 0.45, mug[1], 0.1, 3000);
    await shot(page, '08-extracted-dripping');
    await fly(page, 0.5, 0.42, -0.29, 0.3, 5500);
    await fly(page, 0.5, 0.3, -0.29, 0.1, 3500, true);
    await page.keyboard.press('Space');
    await sleep(1500);
    s = await st(page);
    check('Space releases the bag', !s.carried);
    const onSaucer = await page.evaluate(() => { const H = window.__helicoptea; return H.sim.bags.some((b) => H.sim.onDiscard(b)); });
    check('bag lands on the discard saucer', onSaucer);
    report.perf.desktopFlying = await fps(page, 3000);
    await fly(page, -0.56, 0.3, 0.24, 0.35, 6500);
    await fly(page, -0.56, 0.0, 0.24, 0.1, 4500);
    s = await st(page);
    check('lands back on the pad', s.state === 'flying' && s.y < 0.07, `y=${s.y?.toFixed(3)}`);

    // Crash: dive into the table with assist off.
    await page.evaluate(() => { window.__pilot.on = false; });
    await page.keyboard.down('KeyW'); await sleep(1400); await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyF');
    await page.keyboard.down('KeyS'); await sleep(900); await page.keyboard.up('KeyS');
    await page.waitForFunction(() => window.__helicoptea.sim.state === 'destroyed', null, { timeout: 8000 }).catch(() => {});
    await sleep(120);
    await shot(page, '09-explosion');
    await sleep(900);
    await shot(page, '10-wreckage');
    s = await st(page);
    check('hard descent explodes into debris', s.state === 'destroyed' && s.debris >= 8, `state=${s.state} debris=${s.debris}`);
    const crashUi = await page.evaluate(() => document.querySelector('.crash').classList.contains('show'));
    check('Restart Flight offered immediately', crashUi);
    report.perf.desktopExplosion = await fps(page, 2000);
    await page.keyboard.press('KeyF');
    await page.keyboard.press('KeyR');
    await sleep(400);
    s = await st(page);
    check('restart after crash', s.state === 'flying' && s.brew[0] > 0.15, `brew kept ${s.brew[0].toFixed(2)}`);

    // Repeated crash/restart cycles.
    const before = await st(page);
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => { const s = window.__helicoptea.sim; if (s.heli) { s.heli.body.setLinvel({ x: 0, y: -3, z: 0 }, true); s.heli.body.setTranslation({ x: s.heli.pos.x, y: 0.2, z: s.heli.pos.z }, true); } });
      await sleep(250);
      await page.keyboard.press('KeyR');
      await sleep(150);
    }
    await sleep(500);
    s = await st(page);
    report.perf.afterCrashes = await fps(page, 3000);
    check('20 crash/restart cycles stay bounded', s.bodies < 70 && s.debris <= 34, `bodies ${before.bodies} -> ${s.bodies}, debris ${s.debris}`);
    check('frame rate holds after repeated crashes', report.perf.afterCrashes.fps > 55, JSON.stringify(report.perf.afterCrashes));

    // Background / resume.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sleep(300);
    s = await st(page);
    check('focus loss pauses the game', s.paused);
    await shot(page, '11-paused');
    await sleep(1500);
    await page.keyboard.press('Escape');
    await sleep(300);
    s = await st(page);
    check('resume after pause', !s.paused && s.state === 'flying');
    await page.keyboard.press('Shift+KeyR');
    await sleep(400);
    s = await st(page);
    check('Shift+R resets the sandbox', s.brew.every((b) => b === 0) && s.debris === 0 && s.bags === 3, `bags ${s.bags} debris ${s.debris}`);
    const errors = logs.filter((l) => l.includes('pageerror') || l.startsWith('[error]'));
    check('no console errors during desktop run', errors.length === 0, errors.slice(0, 3).join(' | '));
    report.perf.desktopRenderInfo = await page.evaluate(() => { const i = window.__helicoptea.renderer.info.render; return { calls: i.calls, triangles: i.triangles }; });
    await ctx.close();
  }

  // ------------------------------------------------------------ variable frame rate (30 fps cap)
  if (!only || only === 'fps') {
    const { ctx, page } = await open({ width: 1280, height: 720 }, { query: '?fps=30' });
    await start(page);
    await page.keyboard.down('KeyW'); await sleep(1300); await page.keyboard.up('KeyW');
    await sleep(1500);
    const s = await st(page);
    report.perf.capped30 = await fps(page, 2000);
    check('30 fps render cap: same physics (lift + hover)', s.y > 0.15 && Math.abs(s.vy) < 0.06 && report.perf.capped30.renderedFps < 33, `y=${s.y.toFixed(3)} rendered fps=${report.perf.capped30.renderedFps}`);
    await ctx.close();
  }

  // ------------------------------------------------------------ emulated gamepad
  if (!only || only === 'gamepad') {
    const { ctx, page } = await open({ width: 1280, height: 720 }, { gamepad: true });
    await start(page);
    await page.evaluate(() => { window.__pad.axes[1] = -1; });
    await sleep(1200);
    await page.evaluate(() => { window.__pad.axes[1] = 0; });
    let s = await st(page);
    check('emulated gamepad: left stick up lifts off', s.y > 0.12, `y=${s.y.toFixed(3)}`);
    await page.evaluate(() => { window.__pad.axes[3] = -1; });
    await sleep(300);
    s = await st(page);
    await page.evaluate(() => { window.__pad.axes[3] = 0; });
    check('emulated gamepad: right stick tilts', s.tilt > 0.05, `tilt=${s.tilt.toFixed(3)}`);
    await page.evaluate(() => { window.__pad.buttons[3] = { pressed: true, value: 1 }; });
    await sleep(100);
    await page.evaluate(() => { window.__pad.buttons[3] = { pressed: false, value: 0 }; });
    s = await st(page);
    check('emulated gamepad: Y toggles assist', s.assist === false);
    await page.evaluate(() => { window.__pad.buttons[9] = { pressed: true, value: 1 }; });
    await sleep(100);
    await page.evaluate(() => { window.__pad.buttons[9] = { pressed: false, value: 0 }; });
    await sleep(300);
    s = await st(page);
    check('emulated gamepad: Start restarts', s.y < 0.07 && s.state === 'flying');
    const src = await page.evaluate(() => window.__helicoptea.input.source);
    check('HUD switches to gamepad prompts', src === 'gamepad');
    await ctx.close();
  }

  // ------------------------------------------------------------ touch emulation (phone landscape + portrait)
  if (!only || only === 'touch') {
    const { ctx, page } = await open({ width: 844, height: 390 }, { touch: true, mobile: true, dpr: 3 });
    await start(page);
    await shot(page, '12-phone-landscape');
    const visible = await page.evaluate(() => !document.getElementById('touch').classList.contains('hidden'));
    check('touch controls shown on a touch device', visible);
    // Drag the left stick up with a real touch sequence through CDP.
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [{ x: 160, y: 300, id: 1 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: 160, y: 300 - i * 12, id: 1 }]); await sleep(30); }
    await sleep(1200);
    let s = await st(page);
    const touchCtl = await page.evaluate(() => ({ ...window.__helicoptea.input.touch }));
    check('touch: left stick up lifts off', s.y > 0.12, `y=${s.y.toFixed(3)} touch=${JSON.stringify(touchCtl)}`);
    // second finger on the right stick while the first is held (multi-touch)
    await touch('touchMove', [{ x: 160, y: 300, id: 1 }, { x: 690, y: 300, id: 2 }]);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: 160, y: 300, id: 1 }, { x: 690, y: 300 - i * 12, id: 2 }]); await sleep(30); }
    await sleep(250);
    s = await st(page);
    check('touch: two thumbs at once (cyclic while holding collective stick)', s.tilt > 0.04, `tilt=${s.tilt.toFixed(3)}`);
    await touch('touchCancel', []);
    await sleep(200);
    const after = await page.evaluate(() => ({ ...window.__helicoptea.input.touch }));
    check('touch cancel releases both sticks', Object.values(after).every((v) => v === 0 || v === false), JSON.stringify(after));
    report.perf.phoneEmulated = await fps(page, 2500);
    const scroll = await page.evaluate(() => [document.scrollingElement.scrollTop, getComputedStyle(document.body).touchAction]);
    check('page cannot scroll; touch-action none', scroll[0] === 0 && scroll[1] === 'none', JSON.stringify(scroll));
    await shot(page, '13-phone-landscape-flying');
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(600);
    await shot(page, '14-phone-portrait');
    const overlap = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const a = r('.touch-btn.attach'), hint = r('.hint'), tr = r('.hud-tr');
      return { attach: a && [a.left, a.top, a.right, a.bottom].map(Math.round), inView: a && a.right <= innerWidth && a.bottom <= innerHeight && a.left >= 0, hudTr: tr && Math.round(tr.left) };
    });
    check('portrait layout keeps buttons on screen', overlap.inView && overlap.hudTr >= 0, JSON.stringify(overlap));
    await ctx.close();
  }
} catch (err) {
  check('e2e run completed', false, String(err && err.stack || err));
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'e2e-report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.ok).length;
  console.log(`\n${report.checks.length - failed}/${report.checks.length} browser checks passed. Report: test-results/e2e-report.json`);
  console.log('perf', JSON.stringify(report.perf));
  process.exit(failed ? 1 : 0);
}
