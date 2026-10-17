// End-to-end browser checks using the locally installed Chrome (no browser download).
// Usage: start the dev server (npm run dev) or preview, then: node tests/e2e.mjs [baseUrl] [--headed]
// Writes screenshots and a JSON report to test-results/.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4179/';
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
  if (opts.gamepad) await ctx.addInitScript((kind) => {
    // Emulated gamepad driven by window.__pad. 'standard' looks like Steam Input's Xbox pad;
    // 'raw' looks like an unknown HID controller with a non-standard layout and resting trigger axes.
    const std = kind === 'standard';
    window.__rumbles = [];
    window.__pad = {
      present: true,
      id: std ? 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' : 'Emulated HID pad (Vendor: 28de Product: 1304)',
      mapping: std ? 'standard' : '',
      axes: std ? [0, 0, 0, 0] : [0, 0, -1, 0, 0, -1],
      buttons: Array.from({ length: std ? 17 : 14 }, () => ({ pressed: false, value: 0 })),
    };
    const act = { playEffect: (type, p) => { window.__rumbles.push({ type, ...p }); return Promise.resolve('complete'); } };
    const pad = () => ({ id: window.__pad.id, index: 0, connected: true, mapping: window.__pad.mapping, axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map((b) => ({ ...b })), timestamp: performance.now(), vibrationActuator: act });
    navigator.getGamepads = () => (window.__pad.present ? [pad(), null, null, null] : [null, null, null, null]);
  }, opts.gamepad);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  // Scripted timings assume real-time world speed; the default (heavier, slower) world is checked separately.
  const q = opts.query || '';
  const query = opts.defaultSpeed ? q : (q ? q + '&' : '?') + 'worldSpeed=1';
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  return { ctx, page, logs };
}
const start = async (page) => { await page.click('#start-btn'); await page.waitForFunction(() => window.__helicoptea?.started); await sleep(600); };
const st = (page) => page.evaluate(() => {
  const s = window.__helicoptea.sim, h = s.heli, b = s.carriedBag();
  return { state: s.state, y: h?.pos.y, x: h?.pos.x, z: h?.pos.z, vy: h?.vel.y, tilt: h ? Math.acos(Math.min(1, h.up.y)) : 0, coll: h?.collective, assist: s.assist,
    carried: !!b, wet: b?.wetness, imm: b?.immersion, bags: s.bags.length, debris: s.debris.length, bodies: s.world.bodies.len() - (s.extras ? s.extras.recorded().length : 0), brew: s.cups.map((c) => c.brew), paused: window.__helicoptea.paused };
});
async function fps(page, ms = 4000) {
  return page.evaluate((ms) => new Promise((resolve) => {
    const times = []; let last = performance.now(); const t0 = last;
    const H = window.__helicoptea; const f0 = H.frames;
    const f = (t) => { times.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else {
      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      resolve({ renderedFps: +((H.frames - f0) / ((t - t0) / 1000)).toFixed(1), frames: times.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), maxMs: +times[times.length - 1].toFixed(2) });
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
    await page.keyboard.down('KeyS'); await sleep(2200); await page.keyboard.up('KeyS'); // collective trims finely now: hold it down
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
    check('resume after pause', !s.paused && s.state === 'flying', JSON.stringify({ paused: s.paused, state: s.state, y: s.y }));
    await page.keyboard.press('Shift+KeyR');
    await sleep(400);
    s = await st(page);
    check('Shift+R resets the sandbox', s.brew.every((b) => b === 0) && s.debris === 0 && s.bags === 6, `bags ${s.bags} (3 per stand) debris ${s.debris}`);
    const errors = logs.filter((l) => l.includes('pageerror') || l.startsWith('[error]'));
    check('no console errors during desktop run', errors.length === 0, errors.slice(0, 3).join(' | '));
    report.perf.desktopRenderInfo = await page.evaluate(() => { const i = window.__helicoptea.renderer.info.render; return { calls: i.calls, triangles: i.triangles }; });
    await ctx.close();
  }

  // ------------------------------------------------------------ default (heavy) world speed
  if (!only || only === 'heavy') {
    const { ctx, page } = await open({ width: 1280, height: 720 }, { defaultSpeed: true });
    await start(page);
    const ws = await page.evaluate(() => window.__helicoptea.worldSpeed);
    await page.keyboard.down('KeyW'); await sleep(2600); await page.keyboard.up('KeyW');
    await sleep(2500);
    const s = await st(page);
    check('default heavy world (speed 0.7): W lifts off and assist settles', Math.abs(ws - 0.7) < 1e-6 && s.y > 0.15 && Math.abs(s.vy) < 0.06, `worldSpeed ${ws} y=${s.y?.toFixed(3)} vy=${s.vy?.toFixed(3)}`);
    await page.keyboard.press('Escape'); await sleep(200);
    await page.evaluate(() => { const r = document.querySelector('[data-setting=weight]'); r.value = '0'; r.dispatchEvent(new Event('input')); });
    const ws2 = await page.evaluate(() => window.__helicoptea.worldSpeed);
    check('Weight slider changes world speed live', Math.abs(ws2 - 1) < 1e-6, `light -> ${ws2}`);
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
    const { ctx, page } = await open({ width: 1280, height: 720 }, { gamepad: 'standard' });
    const press = async (i, hold = 90) => { await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i); await sleep(hold); await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i); await sleep(90); };
    const ui = () => page.evaluate(() => ({ started: window.__helicoptea.started, paused: window.__helicoptea.paused, modal: document.querySelector('.overlay.show:not(#loading)')?.querySelector('h2')?.textContent || null, focus: document.activeElement?.textContent?.trim() || document.activeElement?.tagName }));
    await sleep(300);
    await press(0);
    await sleep(700);
    check('pad: A on the start screen starts the game', (await ui()).started);
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
    await press(3); // assist back on

    // Menus from the pad.
    await press(8);
    let u = await ui();
    check('pad: Back/View opens the pause menu', u.paused && u.modal === 'Paused', JSON.stringify(u));
    await press(5); await press(5); // RB, RB: Flight, Camera, Controls
    u = await ui();
    check('pad: RB flips the pause menu tabs', u.focus === 'Controls', `focus "${u.focus}"`);
    for (let i = 0; i < 8 && !(await page.evaluate(() => document.activeElement?.dataset?.act === 'controller')); i++) await press(13);
    u = await ui();
    check('pad: d-pad moves menu focus down into the tab', await page.evaluate(() => document.activeElement?.dataset?.act === 'controller'), `focus "${u.focus}"`);
    await press(0);
    u = await ui();
    check('pad: A opens Controller settings', u.modal === 'Controls', JSON.stringify(u));
    const listed = await page.evaluate(() => document.querySelector('.pad-item b')?.textContent + ' | ' + document.querySelector('.pad-item span')?.textContent);
    check('controller panel lists the pad and its layout', /standard layout/.test(listed), listed);
    await page.screenshot({ path: path.join(outDir, '15-controller-settings.png') });
    await press(1);
    u = await ui();
    check('pad: B goes back to the pause menu', u.modal === 'Paused', JSON.stringify(u));
    await press(1);
    u = await ui();
    check('pad: B resumes', !u.paused && !u.modal, JSON.stringify(u));

    // Crash, rumble, A restarts.
    await page.evaluate(() => { const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x: s.heli.pos.x, y: 0.25, z: s.heli.pos.z }, true); s.heli.body.setLinvel({ x: 0, y: -3, z: 0 }, true); });
    await sleep(400);
    s = await st(page);
    const rumbles = await page.evaluate(() => window.__rumbles.slice());
    check('pad: crash plays a strong rumble', s.state === 'destroyed' && rumbles.some((r) => r.strongMagnitude >= 0.9), `${rumbles.length} rumble effects`);
    await press(0);
    await sleep(300);
    s = await st(page);
    check('pad: A restarts after a crash', s.state === 'flying', s.state);

    // Disconnect mid-flight.
    await page.evaluate(() => { window.__pad.axes[1] = -1; });
    await sleep(500);
    await page.evaluate(() => { window.__pad.present = false; const e = new Event('gamepaddisconnected'); Object.defineProperty(e, 'gamepad', { value: { index: 0, id: window.__pad.id } }); window.dispatchEvent(e); });
    await sleep(300);
    const after = await page.evaluate(() => ({ paused: window.__helicoptea.paused, ctl: { ...window.__helicoptea.input.gp } }));
    check('pad disconnect pauses and releases inputs', after.paused && after.ctl.collective === 0, JSON.stringify(after));
    await ctx.close();

    // Unknown-layout controller: bind it with the wizard, then fly with it.
    {
      const { ctx, page } = await open({ width: 1280, height: 720 }, { gamepad: 'raw' });
      await start(page);
      const press = async (i) => { await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i); await sleep(120); await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i); await sleep(150); };
      const move = async (i, v) => { await page.evaluate(([i, v]) => { window.__pad.axes[i] = v; }, [i, v]); await sleep(150); await page.evaluate(([i]) => { window.__pad.axes[i] = i === 2 || i === 5 ? -1 : 0; }, [i]); await sleep(150); };
      await press(0); // let the browser 'see' it
      await page.evaluate(() => { window.__helicoptea.doAction('controller'); window.__helicoptea.doAction('padbind'); });
      await sleep(200);
      const prompt1 = await page.evaluate(() => document.querySelector('.wz-prompt')?.textContent);
      await page.screenshot({ path: path.join(outDir, '16-bind-wizard.png') });
      // The wizard learns where the sticks and buttons are (left x, left y, right x, right y, then A B X Y LB RB
      // LT RT Back Start L3 R3 and the d-pad); the layout decides what they do.
      await move(0, 1); await move(1, -1); await move(3, 1); await move(4, -1);
      for (const b of [2, 3, 0, 5, 6, 7, 10, 11, 8, 9, 12, 13, 1, 4]) await press(b);
      await page.evaluate(() => { window.__helicoptea.doAction('wizskip'); window.__helicoptea.doAction('wizskip'); });
      await sleep(150);
      const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('bind.')).map((k) => localStorage.getItem(k))[0]);
      check('bind wizard walks through the steps and saves a binding', /left stick/.test(prompt1 || '') && !!saved && saved.includes('"ry":{"index":4'), (prompt1 || '') + ' -> ' + (saved || 'none').slice(0, 160));
      await page.evaluate(() => window.__helicoptea.doAction('closecontroller'));
      await page.evaluate(() => { window.__pad.axes[1] = -1; });
      await sleep(1200);
      await page.evaluate(() => { window.__pad.axes[1] = 0; });
      let s = await st(page);
      check('bound controller flies (custom lift axis)', s.y > 0.12, `y=${s.y.toFixed(3)}`);
      await press(5);
      s = await st(page);
      check('bound controller toggles assist on its chosen button', s.assist === false);
      await ctx.close();
    }
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
